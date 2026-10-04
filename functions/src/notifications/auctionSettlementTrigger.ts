import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

/**
 * Server-authoritative Cloud Function (v2): Triggered on /arena_auctions/{auctionId} status updates.
 * Dispatches settlement notifications ('auction_won' / 'auction_lost') to winner and seller
 * when a Standard Battle Bids auction transitions from 'active' to 'sold', 'ended', or 'reserve-not-met'.
 *
 * Excludes Private Negotiations (which are handled authoritatively by negotiationNotificationTrigger).
 * Employs deterministic notification IDs and batch writes.
 */
export const onAuctionSettlementTrigger = onDocumentUpdated(
  'arena_auctions/{auctionId}',
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    // 1. Snapshot existence validation
    if (!beforeData || !afterData) {
      return;
    }

    const auctionId = event.params.auctionId;
    if (!auctionId || typeof auctionId !== 'string' || !auctionId.trim()) {
      return;
    }

    // 2. Status transition validation: MUST be a genuine transition from 'active' to a terminal status
    const beforeStatus = beforeData.status;
    const afterStatus = afterData.status;

    if (beforeStatus !== 'active') {
      return;
    }

    if (!['sold', 'ended', 'reserve-not-met'].includes(afterStatus)) {
      return;
    }

    // 3. Private Negotiation Exclusion: Only Standard Battle Bids auctions are processed here
    if (afterData.isNegotiationOnly === true) {
      return;
    }

    const rawSellerId = typeof afterData.sellerId === 'string' ? afterData.sellerId.trim() : '';
    if (!rawSellerId || rawSellerId.startsWith('anon_seller_')) {
      return;
    }

    const sellerUid = rawSellerId;
    const auctionTitle = afterData.title || beforeData.title || 'Battle Bids Item';

    try {
      const batch = db.batch();

      if (afterStatus === 'sold') {
        const rawHighestBidderId =
          typeof afterData.highestBidderId === 'string' ? afterData.highestBidderId.trim() : '';

        if (!rawHighestBidderId) {
          console.warn(`[AUCTION_SETTLEMENT] Auction ${auctionId} marked sold but missing highestBidderId.`);
          return;
        }

        const winnerUid = rawHighestBidderId;

        // A. Winner Notification (auction_won)
        const winnerNotifId = `bb_won_${auctionId}_${winnerUid}`;
        const winnerPayload = {
          id: winnerNotifId,
          userId: winnerUid,
          type: 'auction_won',
          title: 'Auction Won — Payment Required',
          message: 'You won this Battle Bids auction. Please complete payment within 48 hours.',
          link: `/orders/BB-${auctionId}`,
          orderId: `BB-${auctionId}`,
          auctionId: auctionId,
          relatedId: auctionId,
          read: false,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
          timestamp: FieldValue.serverTimestamp()
        };

        const winnerRootRef = db.collection('notifications').doc(winnerNotifId);
        const winnerUserRef = db.collection('users').doc(winnerUid).collection('notifications').doc(winnerNotifId);
        batch.set(winnerRootRef, winnerPayload, { merge: true });
        batch.set(winnerUserRef, winnerPayload, { merge: true });

        // B. Seller Notification (auction_won) - suppressed if seller is the winner
        if (sellerUid !== winnerUid) {
          const sellerNotifId = `bb_sold_${auctionId}_${sellerUid}`;
          const sellerPayload = {
            id: sellerNotifId,
            userId: sellerUid,
            type: 'auction_won',
            title: 'Auction Sold — Payment Pending',
            message: 'Your Battle Bids auction has been sold. The winning buyer must complete payment before fulfillment.',
            link: '/seller-dashboard',
            orderId: `BB-${auctionId}`,
            auctionId: auctionId,
            relatedId: auctionId,
            read: false,
            isRead: false,
            createdAt: FieldValue.serverTimestamp(),
            timestamp: FieldValue.serverTimestamp()
          };

          const sellerRootRef = db.collection('notifications').doc(sellerNotifId);
          const sellerUserRef = db.collection('users').doc(sellerUid).collection('notifications').doc(sellerNotifId);
          batch.set(sellerRootRef, sellerPayload, { merge: true });
          batch.set(sellerUserRef, sellerPayload, { merge: true });
        }

        await batch.commit();
        console.log(`[AUCTION_SETTLEMENT] Dispatched SOLD settlement notifications for auction ${auctionId}`);
      } else {
        // Status is 'ended' or 'reserve-not-met' (Unsold / Expired)
        const sellerNotifId = `bb_lost_${auctionId}_${sellerUid}`;
        const sellerLostPayload = {
          id: sellerNotifId,
          userId: sellerUid,
          type: 'auction_lost',
          title: 'Auction Expired',
          message: `Your auction for ${auctionTitle} ended without a sale.`,
          link: `/battle-bids?id=${auctionId}`,
          auctionId: auctionId,
          relatedId: auctionId,
          read: false,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
          timestamp: FieldValue.serverTimestamp()
        };

        const sellerRootRef = db.collection('notifications').doc(sellerNotifId);
        const sellerUserRef = db.collection('users').doc(sellerUid).collection('notifications').doc(sellerNotifId);
        batch.set(sellerRootRef, sellerLostPayload, { merge: true });
        batch.set(sellerUserRef, sellerLostPayload, { merge: true });

        await batch.commit();
        console.log(`[AUCTION_SETTLEMENT] Dispatched UNSOLD settlement notification for auction ${auctionId}`);
      }
    } catch (err) {
      console.error(`[AUCTION_SETTLEMENT] Error dispatching settlement notification for auction ${auctionId}:`, err);
    }
  }
);
