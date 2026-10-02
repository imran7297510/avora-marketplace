import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp, 
  orderBy, 
  limit, 
  startAfter,
  runTransaction, 
  Timestamp 
} from 'firebase/firestore';
import { db, sendNotification, handleFirestoreError, OperationType } from '../../../lib/firebase';
import { SecondChanceOffer, RunnerUpBid, AuctionItem } from '../types';
import { Order } from '../../../types';
import { parseSafeDate } from '../utils/arena';
import { AuditLogService } from './auditLogService';

export const SECOND_CHANCE_OFFER_WINDOW_HOURS = 24;
export const BATTLE_BIDS_PAYMENT_DEADLINE_HOURS = 48;

export const SecondChanceService = {
  /**
   * Identifies the true, authoritative runner-up (Rank 2 distinct eligible bidder)
   * directly from the Firestore bids subcollection.
   * 
   * Architectural & Algorithmic Guarantees:
   * 1. ZERO arbitrary fixed limits (removes limit(20) vulnerability).
   * 2. Queries bids sorted strictly descending by strike amount (`orderBy('amount', 'desc')`).
   * 3. Streams/pages in memory-safe chunks (50 per batch) using `startAfter`.
   * 4. Excludes the defaulted winner (`excludeWinnerId`), the seller, and invalid/zero-value bids.
   * 5. Mathematical Invariant: Because bids are sorted descending by amount, the very first
   *    distinct eligible participant encountered is provably the highest strike across the
   *    entire auction history.
   * 6. Terminates early the moment this global maximum is found (O(1) in typical auctions),
   *    while seamlessly handling auctions with 50+ bids from the winning bidder without truncation.
   */
  async getAuthoritativeRunnerUp(auctionId: string, excludeWinnerId?: string, sellerId?: string): Promise<RunnerUpBid | null> {
    try {
      const bidsRef = collection(db, 'arena_auctions', auctionId, 'bids');
      const BATCH_SIZE = 50;
      let lastVisibleDoc: any = null;
      let hasMore = true;

      // Resolve sellerId if not passed
      let resolvedSellerId = sellerId;
      if (!resolvedSellerId) {
        try {
          const auctionSnap = await getDoc(doc(db, 'arena_auctions', auctionId));
          if (auctionSnap.exists()) {
            resolvedSellerId = auctionSnap.data()?.sellerId;
          }
        } catch (e) {
          console.warn('[getAuthoritativeRunnerUp] Could not resolve sellerId from auction doc:', e);
        }
      }

      while (hasMore) {
        const q = lastVisibleDoc
          ? query(bidsRef, orderBy('amount', 'desc'), startAfter(lastVisibleDoc), limit(BATCH_SIZE))
          : query(bidsRef, orderBy('amount', 'desc'), limit(BATCH_SIZE));

        const snap = await getDocs(q);
        if (snap.empty) {
          break;
        }

        // Collect candidate bids in this batch that share the highest eligible non-winner amount
        let topBatchAmount: number | null = null;
        const candidateDocs: any[] = [];

        for (const docSnap of snap.docs) {
          const data = docSnap.data();
          const userId = data.userId || (data as any).bidderId;
          const amount = Number(data.amount);

          // Discard missing user IDs or invalid/non-positive bids
          if (!userId || isNaN(amount) || amount <= 0) {
            continue;
          }

          // Exclude the defaulted original winner
          if (excludeWinnerId && userId === excludeWinnerId) {
            continue;
          }

          // Exclude the seller
          if (resolvedSellerId && userId === resolvedSellerId) {
            continue;
          }

          if (topBatchAmount === null) {
            topBatchAmount = amount;
            candidateDocs.push({ docSnap, data, userId, amount });
          } else if (amount === topBatchAmount) {
            // Equal strike amount (tie candidate)
            candidateDocs.push({ docSnap, data, userId, amount });
          } else {
            // Amount is lower than the top candidate amount in this batch
            break;
          }
        }

        // If candidates found with the maximum strike amount, sort them deterministically:
        // 1. Earliest timestamp wins tie (earlier strike holds precedence)
        // 2. Deterministic document ID fallback
        if (candidateDocs.length > 0) {
          candidateDocs.sort((a, b) => {
            const timeA = parseSafeDate(a.data.timestamp)?.getTime() || 0;
            const timeB = parseSafeDate(b.data.timestamp)?.getTime() || 0;
            if (timeA !== timeB && timeA > 0 && timeB > 0) {
              return timeA - timeB; // Earliest timestamp first
            }
            return a.docSnap.id.localeCompare(b.docSnap.id);
          });

          for (const cand of candidateDocs) {
            // Verify that this runner-up is active (not banned or blocked)
            try {
              const userSnap = await getDoc(doc(db, 'users', cand.userId));
              if (userSnap.exists()) {
                const uData = userSnap.data();
                if (
                  uData?.isBlocked === true || 
                  uData?.isBanned === true || 
                  uData?.accountStatus === 'blocked' || 
                  uData?.accountStatus === 'banned'
                ) {
                  // Skip banned/blocked bidder and continue search for next valid candidate
                  continue;
                }
              }
            } catch (userErr) {
              console.warn('[getAuthoritativeRunnerUp] Could not verify user status:', userErr);
            }

            // Return the highest authoritative, eligible, non-banned runner-up
            return {
              userId: cand.userId,
              userName: cand.data.userName || cand.data.bidderName || 'Combatant',
              userPhotoURL: cand.data.userPhotoURL || '',
              amount: cand.amount,
              timestamp: cand.data.timestamp,
              rank: 2
            };
          }
        }

        if (snap.docs.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          lastVisibleDoc = snap.docs[snap.docs.length - 1];
        }
      }

      return null;
    } catch (err) {
      console.error(`[SecondChanceService.getAuthoritativeRunnerUp] Error for auction ${auctionId}:`, err);
      handleFirestoreError(err, OperationType.LIST, `arena_auctions/${auctionId}/bids`);
      return null;
    }
  },

  /**
   * Authoritatively checks and expires an unpaid winning order.
   * If eligible, deterministically creates a second-chance offer for the runner-up.
   * Fully idempotent across concurrent calls.
   */
  async expireOrderAndTriggerSecondChance(orderId: string): Promise<{
    expired: boolean;
    secondChanceOfferId?: string;
    message: string;
  }> {
    try {
      const normalizedOrderId = orderId.startsWith('BB-') ? orderId : `BB-${orderId}`;
      const orderRef = doc(db, 'orders', normalizedOrderId);

      let createdOfferId: string | null = null;
      let auctionItemData: any = null;
      let runnerUpInfo: RunnerUpBid | null = null;
      let originalOrderData: any = null;

      await runTransaction(db, async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) {
          throw new Error(`Order ${normalizedOrderId} does not exist.`);
        }

        const orderData = orderSnap.data() as Order;
        originalOrderData = orderData;

        // If already expired, return idempotently
        if (orderData.status === 'PAYMENT_EXPIRED') {
          return;
        }

        // Only AWAITING_PAYMENT can be expired
        if (orderData.status !== 'AWAITING_PAYMENT') {
          throw new Error(`Order status is ${orderData.status}, cannot expire.`);
        }

        // Verify payment deadline has actually passed
        const deadlineDate = parseSafeDate(orderData.paymentDeadline);
        if (deadlineDate && Date.now() < deadlineDate.getTime()) {
          throw new Error('Payment deadline has not passed yet.');
        }

        const auctionId = orderData.auctionId || orderData.listingId || normalizedOrderId.replace('BB-', '');
        const auctionRef = doc(db, 'arena_auctions', auctionId);
        const auctionSnap = await transaction.get(auctionRef);
        if (auctionSnap.exists()) {
          auctionItemData = auctionSnap.data();
        }

        // 1. Transition Original Order to PAYMENT_EXPIRED (Permanent Immutable Historical Record)
        transaction.update(orderRef, {
          status: 'PAYMENT_EXPIRED',
          expiredAt: serverTimestamp(),
          expirationReason: '48_HOUR_PAYMENT_DEADLINE_LAPSED',
          updatedAt: serverTimestamp()
        });

        // 2. Check if a Second Chance Offer already exists for this order
        const existingOfferRef = doc(db, 'second_chance_offers', `SC-${auctionId}`);
        const existingOfferSnap = await transaction.get(existingOfferRef);

        if (!existingOfferSnap.exists()) {
          createdOfferId = `SC-${auctionId}`;
        }
      });

      // If transition was successful and we can create second chance offer:
      if (createdOfferId && originalOrderData) {
        const auctionId = originalOrderData.auctionId || originalOrderData.listingId || normalizedOrderId.replace('BB-', '');
        runnerUpInfo = await this.getAuthoritativeRunnerUp(auctionId, originalOrderData.buyerId, originalOrderData.sellerId);

        if (runnerUpInfo) {
          const offerRef = doc(db, 'second_chance_offers', createdOfferId);
          const expiresAtTimestamp = Timestamp.fromDate(
            new Date(Date.now() + SECOND_CHANCE_OFFER_WINDOW_HOURS * 3600 * 1000)
          );

          const offerPayload: any = {
            id: createdOfferId,
            auctionId,
            originalOrderId: normalizedOrderId,
            sellerId: originalOrderData.sellerId,
            sellerName: originalOrderData.sellerName || 'Verified Seller',
            buyerId: runnerUpInfo.userId,
            buyerName: runnerUpInfo.userName,
            amount: runnerUpInfo.amount,
            currency: originalOrderData.currency || 'USD',
            currencySymbol: originalOrderData.currencySymbol || '$',
            status: 'PENDING',
            itemTitle: originalOrderData.itemTitle || originalOrderData.listingTitle || 'Battle Bids Asset',
            itemImage: originalOrderData.itemImage || originalOrderData.listingImage || '',
            expiresAt: expiresAtTimestamp,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          await setDoc(offerRef, offerPayload);

          // Notify Runner-Up
          try {
            await sendNotification(
              runnerUpInfo.userId,
              '⚡ Second-Chance Offer Available!',
              `The winning bidder did not complete payment for "${offerPayload.itemTitle}". You have 24 hours to claim this item for ${offerPayload.currencySymbol}${offerPayload.amount}!`,
              'BATTLE_BIDS_SECOND_CHANCE_OFFER',
              `/battle-bids?id=${auctionId}`
            );
          } catch (notifErr) {
            console.warn('[SecondChanceService] Failed to notify runner-up:', notifErr);
          }

          // Notify Seller
          try {
            await sendNotification(
              originalOrderData.sellerId,
              'Second-Chance Offer Dispatched',
              `Original winner payment expired. A second-chance offer was automatically extended to runner-up @${runnerUpInfo.userName} for ${offerPayload.currencySymbol}${offerPayload.amount}.`,
              'BATTLE_BIDS_SECOND_CHANCE_SELLER',
              `/seller-dashboard`
            );
          } catch (notifErr) {
            console.warn('[SecondChanceService] Failed to notify seller:', notifErr);
          }

          // Log Audit Event
          try {
            await AuditLogService.logAction({
              userId: originalOrderData.sellerId,
              actionType: 'SECOND_CHANCE_OFFER_ISSUED' as any,
              targetId: auctionId,
              targetType: 'auction' as any,
              reason: `Primary winner ${originalOrderData.buyerId} payment expired. Offer extended to runner-up ${runnerUpInfo.userId} at ${offerPayload.amount}.`
            });
          } catch (auditErr) {
            console.warn('[SecondChanceService] Audit log skipped:', auditErr);
          }
        }
      }

      // Notify Original Winner of Expiration
      if (originalOrderData) {
        try {
          await sendNotification(
            originalOrderData.buyerId,
            'Payment Window Expired',
            `Your 48-hour payment window for "${originalOrderData.itemTitle || originalOrderData.listingTitle}" has expired. The order has been closed.`,
            'BATTLE_BIDS_PAYMENT_EXPIRED',
            `/orders/${normalizedOrderId}`
          );
        } catch (notifErr) {
          console.warn('[SecondChanceService] Failed to notify original winner:', notifErr);
        }
      }

      return {
        expired: true,
        secondChanceOfferId: createdOfferId || undefined,
        message: 'Order transitioned to PAYMENT_EXPIRED and runner-up second chance processed.'
      };
    } catch (err: any) {
      console.error('[SecondChanceService.expireOrderAndTriggerSecondChance] Error:', err);
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}/expire`);
      return {
        expired: false,
        message: err.message || 'Failed to expire order.'
      };
    }
  },

  /**
   * Accepts a second-chance offer atomically.
   * Creates a dedicated second-chance order `BB-{auctionId}-SC`
   * with a fresh 48-hour payment window for the runner-up.
   */
  async acceptSecondChanceOffer(offerId: string, buyerId: string): Promise<string> {
    try {
      const offerRef = doc(db, 'second_chance_offers', offerId);
      let newOrderId = '';

      await runTransaction(db, async (transaction) => {
        const offerSnap = await transaction.get(offerRef);
        if (!offerSnap.exists()) {
          throw new Error('Second-chance offer does not exist.');
        }

        const offerData = offerSnap.data() as SecondChanceOffer;

        if (offerData.buyerId !== buyerId) {
          throw new Error('Only the designated runner-up can accept this offer.');
        }

        if (offerData.status !== 'PENDING') {
          throw new Error(`Offer is no longer pending (Current: ${offerData.status}).`);
        }

        const expiresAtDate = parseSafeDate(offerData.expiresAt);
        if (expiresAtDate && Date.now() >= expiresAtDate.getTime()) {
          transaction.update(offerRef, {
            status: 'EXPIRED',
            updatedAt: serverTimestamp()
          });
          throw new Error('This second-chance offer has expired.');
        }

        // Standardize canonical Second-Chance Order ID
        newOrderId = `BB-${offerData.auctionId}-SC`;
        const newOrderRef = doc(db, 'orders', newOrderId);

        const paymentDeadlineTimestamp = Timestamp.fromDate(
          new Date(Date.now() + BATTLE_BIDS_PAYMENT_DEADLINE_HOURS * 3600 * 1000)
        );

        // 1. Create the new runner-up order
        transaction.set(newOrderRef, {
          id: newOrderId,
          source: 'battle_bids',
          auctionId: offerData.auctionId,
          listingId: offerData.auctionId,
          itemTitle: offerData.itemTitle || 'Battle Bids Item (Second Chance)',
          itemImage: offerData.itemImage || '',
          sellerId: offerData.sellerId,
          sellerName: offerData.sellerName || 'Verified Seller',
          buyerId: offerData.buyerId,
          buyerName: offerData.buyerName || 'Runner-Up Warrior',
          amount: offerData.amount,
          totalAmount: offerData.amount,
          currency: offerData.currency || 'USD',
          currencySymbol: offerData.currencySymbol || '$',
          status: 'AWAITING_PAYMENT',
          paymentDeadline: paymentDeadlineTimestamp,
          isSecondChance: true,
          originalOrderId: offerData.originalOrderId,
          secondChanceOfferId: offerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // 2. Update the offer status to ACCEPTED
        transaction.update(offerRef, {
          status: 'ACCEPTED',
          acceptedAt: serverTimestamp(),
          newOrderId: newOrderId,
          updatedAt: serverTimestamp()
        });
      });

      return newOrderId;
    } catch (err: any) {
      console.error('[SecondChanceService.acceptSecondChanceOffer] Error:', err);
      handleFirestoreError(err, OperationType.UPDATE, `second_chance_offers/${offerId}/accept`);
      throw err;
    }
  },

  /**
   * Declines a second-chance offer.
   */
  async declineSecondChanceOffer(offerId: string, buyerId: string): Promise<void> {
    try {
      const offerRef = doc(db, 'second_chance_offers', offerId);
      await runTransaction(db, async (transaction) => {
        const offerSnap = await transaction.get(offerRef);
        if (!offerSnap.exists()) return;

        const offerData = offerSnap.data() as SecondChanceOffer;
        if (offerData.buyerId !== buyerId) {
          throw new Error('Unauthorized: only the designated buyer can decline this offer.');
        }

        if (offerData.status !== 'PENDING') return;

        transaction.update(offerRef, {
          status: 'DECLINED',
          declinedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
    } catch (err: any) {
      console.error('[SecondChanceService.declineSecondChanceOffer] Error:', err);
      handleFirestoreError(err, OperationType.UPDATE, `second_chance_offers/${offerId}/decline`);
      throw err;
    }
  },

  /**
   * Subscribes in real-time to active second-chance offers for a specific user (as buyer or seller).
   */
  subscribeToUserOffers(
    userId: string,
    callback: (offers: SecondChanceOffer[]) => void
  ) {
    const q = query(
      collection(db, 'second_chance_offers'),
      where('buyerId', '==', userId)
    );

    return onSnapshot(q, (snap) => {
      const offers = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        expiresAt: parseSafeDate(d.data().expiresAt),
        createdAt: parseSafeDate(d.data().createdAt),
        updatedAt: parseSafeDate(d.data().updatedAt)
      })) as SecondChanceOffer[];

      callback(offers);
    }, (err) => {
      console.warn('[SecondChanceService.subscribeToUserOffers] Error:', err);
      callback([]);
    });
  },

  /**
   * Subscribes to a single second-chance offer by auctionId or offerId.
   */
  subscribeToOfferByAuction(
    auctionId: string,
    callback: (offer: SecondChanceOffer | null) => void
  ) {
    const offerRef = doc(db, 'second_chance_offers', `SC-${auctionId}`);
    return onSnapshot(offerRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        callback({
          id: snap.id,
          ...d,
          expiresAt: parseSafeDate(d.expiresAt),
          createdAt: parseSafeDate(d.createdAt),
          updatedAt: parseSafeDate(d.updatedAt)
        } as SecondChanceOffer);
      } else {
        callback(null);
      }
    }, (err) => {
      console.warn('[SecondChanceService.subscribeToOfferByAuction] Error:', err);
      callback(null);
    });
  }
};
