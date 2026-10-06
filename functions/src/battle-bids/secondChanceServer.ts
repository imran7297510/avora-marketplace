import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');

export interface ServerRunnerUpBid {
  userId: string;
  userName: string;
  userPhotoURL?: string;
  amount: number;
  timestamp?: any;
  rank: number;
}

/**
 * Resolves the authoritative real Firebase Auth UID for an auction seller on the server.
 * 
 * CASE A — Normal Public Seller:
 * If publicSellerId is a legitimate Firebase UID and does NOT start with 'anon_seller_',
 * returns publicSellerId directly (0 additional Firestore reads).
 * 
 * CASE B — Anonymous / Masked Seller:
 * If publicSellerId starts with 'anon_seller_', reads arena_auctions/{auctionId}/private/seller (1 point read)
 * and retrieves the validated sellerUid.
 * 
 * CASE C — Missing / Invalid Private Seller:
 * If private/seller does not exist or lacks a valid real sellerUid, returns null.
 */
export async function resolveAuthoritativeSellerUidServer(
  auctionId: string,
  publicSellerId?: string
): Promise<string | null> {
  if (!auctionId) return null;

  const rawSellerId = typeof publicSellerId === 'string' ? publicSellerId.trim() : '';

  // CASE A — NORMAL PUBLIC SELLER (0 additional Firestore reads)
  if (rawSellerId && !rawSellerId.startsWith('anon_seller_')) {
    return rawSellerId;
  }

  // CASE B — ANONYMOUS/MASKED SELLER: Read authoritative private/seller document
  try {
    const privateDoc = await db
      .collection('arena_auctions')
      .doc(auctionId)
      .collection('private')
      .doc('seller')
      .get();

    if (privateDoc.exists) {
      const sellerUid = privateDoc.data()?.sellerUid;
      if (
        typeof sellerUid === 'string' &&
        sellerUid.trim().length > 0 &&
        !sellerUid.startsWith('anon_seller_')
      ) {
        return sellerUid.trim();
      }
    }
  } catch (err) {
    console.warn(`[secondChanceServer] Error reading private/seller for auction ${auctionId}:`, err);
  }

  // CASE C — MISSING/INVALID PRIVATE SELLER RECORD
  console.warn(`[secondChanceServer] Unresolvable authoritative seller identity for anonymous auction: ${auctionId}`);
  return null;
}

/**
 * Server-authoritative algorithm to identify the rank-2 runner-up bidder
 * directly from the Firestore bids subcollection using Firebase Admin SDK.
 */
export async function getAuthoritativeRunnerUpServer(
  auctionId: string,
  excludeWinnerId?: string,
  sellerId?: string
): Promise<ServerRunnerUpBid | null> {
  if (!auctionId) return null;

  try {
    const bidsRef = db.collection('arena_auctions').doc(auctionId).collection('bids');
    const BATCH_SIZE = 50;
    let lastVisibleDoc: any = null;
    let hasMore = true;

    while (hasMore) {
      let q = bidsRef.orderBy('amount', 'desc').limit(BATCH_SIZE);
      if (lastVisibleDoc) {
        q = q.startAfter(lastVisibleDoc);
      }

      const snap = await q.get();
      if (snap.empty) {
        break;
      }

      let topBatchAmount: number | null = null;
      const candidateDocs: any[] = [];

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const userId = data.userId || data.bidderId;
        const amount = Number(data.amount);

        if (!userId || isNaN(amount) || amount <= 0) {
          continue;
        }

        if (excludeWinnerId && userId === excludeWinnerId) {
          continue;
        }

        if (sellerId && userId === sellerId) {
          continue;
        }

        if (topBatchAmount === null) {
          topBatchAmount = amount;
          candidateDocs.push({ docSnap, data, userId, amount });
        } else if (amount === topBatchAmount) {
          candidateDocs.push({ docSnap, data, userId, amount });
        } else {
          break;
        }
      }

      if (candidateDocs.length > 0) {
        candidateDocs.sort((a, b) => {
          const timeA = a.data.timestamp?.toDate ? a.data.timestamp.toDate().getTime() : 0;
          const timeB = b.data.timestamp?.toDate ? b.data.timestamp.toDate().getTime() : 0;
          if (timeA !== timeB && timeA > 0 && timeB > 0) {
            return timeA - timeB;
          }
          return a.docSnap.id.localeCompare(b.docSnap.id);
        });

        for (const cand of candidateDocs) {
          try {
            const userSnap = await db.collection('users').doc(cand.userId).get();
            if (userSnap.exists) {
              const uData = userSnap.data();
              if (
                uData?.isBlocked === true ||
                uData?.isBanned === true ||
                uData?.accountStatus === 'blocked' ||
                uData?.accountStatus === 'banned'
              ) {
                continue;
              }
            }
          } catch (userErr) {
            console.warn('[secondChanceServer.getAuthoritativeRunnerUp] Could not check user status:', userErr);
          }

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
    console.error(`[secondChanceServer.getAuthoritativeRunnerUp] Error for auction ${auctionId}:`, err);
    return null;
  }
}

/**
 * Idempotently delivers a notification to user's notifications subcollection
 * and global root notifications collection.
 */
async function sendServerNotification(
  userId: string,
  notifId: string,
  payload: {
    type: string;
    title: string;
    message: string;
    link: string;
    auctionId?: string;
    orderId?: string;
    relatedId?: string;
  }
): Promise<void> {
  if (!userId) return;

  try {
    const userNotifRef = db.collection('users').doc(userId).collection('notifications').doc(notifId);
    const existing = await userNotifRef.get();
    if (existing.exists) return;

    const body: any = {
      id: notifId,
      userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link,
      auctionId: payload.auctionId || '',
      read: false,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
      timestamp: FieldValue.serverTimestamp()
    };

    if (payload.orderId) body.orderId = payload.orderId;
    if (payload.relatedId) body.relatedId = payload.relatedId;

    await userNotifRef.set(body, { merge: true });

    const rootNotifRef = db.collection('notifications').doc(notifId);
    await rootNotifRef.set(body, { merge: true });
  } catch (err) {
    console.warn(`[secondChanceServer] Notification write error for user ${userId}:`, err);
  }
}

/**
 * Authoritatively processes second-chance offer creation and notification dispatch
 * for an expired primary Battle Bids order.
 *
 * Guarantees:
 * 1. Checks that order is a primary Battle Bids order (source == 'battle_bids', !isSecondChance, orderId starts with 'BB-' and does not end with '-SC').
 * 2. Excludes private negotiations (isNegotiationOnly !== true on order and arena_auctions).
 * 3. Idempotently checks if second_chance_offers/SC-${auctionId} already exists.
 * 4. Resolves runner-up authoritatively from arena_auctions/{auctionId}/bids via getAuthoritativeRunnerUpServer.
 * 5. Creates second_chance_offers/SC-${auctionId} if runner-up exists and offer not already created.
 * 6. Dispatches deterministic notifications:
 *    - sc_notif_runnerup_${auctionId} (BATTLE_BIDS_SECOND_CHANCE_OFFER)
 *    - sc_notif_seller_${auctionId} (BATTLE_BIDS_SECOND_CHANCE_SELLER)
 *    - sc_notif_winner_expired_${normalizedOrderId} (BATTLE_BIDS_PAYMENT_EXPIRED)
 */
export async function processSecondChanceForPrimaryOrder(
  orderId: string,
  orderData: any
): Promise<boolean> {
  const normalizedOrderId = orderId.startsWith('BB-') ? orderId : `BB-${orderId}`;

  // 1. Primary order verification
  if (orderData.source !== 'battle_bids') {
    return false;
  }

  if (orderData.isSecondChance === true || normalizedOrderId.endsWith('-SC')) {
    return false;
  }

  if (!normalizedOrderId.startsWith('BB-')) {
    return false;
  }

  if (orderData.isNegotiationOnly === true) {
    return false;
  }

  const auctionId = orderData.auctionId || orderData.listingId || normalizedOrderId.replace('BB-', '');
  if (!auctionId || typeof auctionId !== 'string' || normalizedOrderId !== `BB-${auctionId}`) {
    return false;
  }

  // 2. Verify auction document & ensure Private Negotiation is excluded
  try {
    const auctionSnap = await db.collection('arena_auctions').doc(auctionId).get();
    if (auctionSnap.exists) {
      const auctionData = auctionSnap.data();
      if (auctionData?.isNegotiationOnly === true) {
        return false;
      }
    }
  } catch (auctionErr) {
    console.warn(`[processSecondChanceForPrimaryOrder] Could not check auction ${auctionId}:`, auctionErr);
  }

  let offerCreated = false;

  // 3. Check if second_chance_offers already exists for this auction
  const offerRef = db.collection('second_chance_offers').doc(`SC-${auctionId}`);
  const offerSnap = await offerRef.get();

  if (!offerSnap.exists) {
    const isAnonymousSeller =
      typeof orderData.sellerId === 'string' && orderData.sellerId.startsWith('anon_seller_');

    const authoritativeSellerUid = await resolveAuthoritativeSellerUidServer(
      auctionId,
      orderData.sellerId
    );

    // CRITICAL SAFETY BOUNDARY:
    // If the seller is anonymous and the authoritative seller UID cannot be resolved,
    // abort second-chance offer creation to prevent self-dealing (offering the item to the seller).
    if (isAnonymousSeller && !authoritativeSellerUid) {
      console.warn(
        `[secondChanceServer] Aborting second-chance offer creation for auction ${auctionId}: unable to authoritatively resolve real seller UID for anonymous seller.`
      );
    } else {
      const runnerUp = await getAuthoritativeRunnerUpServer(
        auctionId,
        orderData.buyerId,
        authoritativeSellerUid || orderData.sellerId
      );

      if (runnerUp) {
        const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 3600 * 1000));
        const offerPayload: any = {
          id: `SC-${auctionId}`,
          auctionId,
          originalOrderId: normalizedOrderId,
          sellerId: orderData.sellerId,
          sellerName: orderData.sellerName || 'Verified Seller',
          buyerId: runnerUp.userId,
          buyerName: runnerUp.userName,
          amount: runnerUp.amount,
          currency: orderData.currency || 'USD',
          currencySymbol: orderData.currencySymbol || '$',
          status: 'PENDING',
          itemTitle: orderData.itemTitle || orderData.listingTitle || 'Battle Bids Asset',
          itemImage: orderData.itemImage || orderData.listingImage || '',
          expiresAt,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        };

        await offerRef.set(offerPayload, { merge: true });
        offerCreated = true;

        // Deliver Runner-Up Notification
        await sendServerNotification(
          runnerUp.userId,
          `sc_notif_runnerup_${auctionId}`,
          {
            type: 'BATTLE_BIDS_SECOND_CHANCE_OFFER',
            title: '⚡ Second-Chance Offer Available!',
            message: `The winning bidder did not complete payment for "${offerPayload.itemTitle}". You have 24 hours to claim this item for ${offerPayload.currencySymbol}${offerPayload.amount}!`,
            link: `/battle-bids?id=${auctionId}`,
            auctionId
          }
        );

        // Deliver Seller Notification (only to valid real Firebase Auth UID)
        if (authoritativeSellerUid) {
          await sendServerNotification(
            authoritativeSellerUid,
            `sc_notif_seller_${auctionId}`,
            {
              type: 'BATTLE_BIDS_SECOND_CHANCE_SELLER',
              title: 'Second-Chance Offer Dispatched',
              message: `Original winner payment expired. A second-chance offer was automatically extended to runner-up @${runnerUp.userName} for ${offerPayload.currencySymbol}${offerPayload.amount}.`,
              link: `/seller-dashboard`,
              auctionId
            }
          );
        } else {
          console.warn(
            `[secondChanceServer] Skipped seller notification for auction ${auctionId}: unresolvable authoritative seller identity.`
          );
        }

        // Audit Log
        try {
          await db.collection('audit_logs').add({
            userId: authoritativeSellerUid || orderData.sellerId || 'system',
            actionType: 'SECOND_CHANCE_OFFER_ISSUED',
            targetId: auctionId,
            targetType: 'auction',
            reason: `Primary winner ${orderData.buyerId} payment expired. Offer extended to runner-up ${runnerUp.userId} at ${runnerUp.amount}.`,
            timestamp: FieldValue.serverTimestamp(),
            executionSource: 'SERVER_BACKGROUND_JOB'
          });
        } catch (auditErr) {
          console.warn('[processSecondChanceForPrimaryOrder] Audit log skipped:', auditErr);
        }
      }
    }
  }

  // Deliver Original Winner Expiration Notification
  if (orderData.buyerId) {
    await sendServerNotification(
      orderData.buyerId,
      `sc_notif_winner_expired_${normalizedOrderId}`,
      {
        type: 'BATTLE_BIDS_PAYMENT_EXPIRED',
        title: 'Payment Window Expired',
        message: `Your 48-hour payment window for "${orderData.itemTitle || orderData.listingTitle || 'Battle Bids Asset'}" has expired. The order has been closed.`,
        link: `/orders/${normalizedOrderId}`,
        auctionId
      }
    );
  }

  return offerCreated;
}

/**
 * Event-Driven Firestore Trigger (v2): Listens for order status transitions to PAYMENT_EXPIRED.
 * Ensures that if a client or background job transitions a primary Battle Bids order
 * to PAYMENT_EXPIRED, the authoritative second-chance offer creation and notification
 * pipeline is guaranteed to execute.
 */
export const onBattleBidsOrderPaymentExpiredTrigger = onDocumentUpdated(
  {
    document: 'orders/{orderId}',
    database: 'ai-studio-c5cea893-acec-4774-a11a-e26679ae7862'
  },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) {
      return;
    }

    const orderId = event.params.orderId;
    if (!orderId || typeof orderId !== 'string') {
      return;
    }

    const beforeStatus = beforeData.status;
    const afterStatus = afterData.status;

    // Must be a genuine transition into PAYMENT_EXPIRED
    if (beforeStatus === 'PAYMENT_EXPIRED' || afterStatus !== 'PAYMENT_EXPIRED') {
      return;
    }

    // Must be a Battle Bids primary order
    if (afterData.source !== 'battle_bids') {
      return;
    }

    if (afterData.isSecondChance === true || orderId.endsWith('-SC')) {
      return;
    }

    if (!orderId.startsWith('BB-')) {
      return;
    }

    try {
      await processSecondChanceForPrimaryOrder(orderId, afterData);
    } catch (err) {
      console.error(`[onBattleBidsOrderPaymentExpiredTrigger] Error processing order ${orderId}:`, err);
    }
  }
);

/**
 * Event-Driven Firestore Trigger (v2): Listens for status updates on second_chance_offers/{offerId}.
 * Dispatches server-authoritative notifications to the seller when an offer transitions:
 * - PENDING -> ACCEPTED (BATTLE_BIDS_SECOND_CHANCE_ACCEPTED)
 * - PENDING -> DECLINED (BATTLE_BIDS_SECOND_CHANCE_DECLINED)
 *
 * Utilizes resolveAuthoritativeSellerUidServer to guarantee delivery to the real seller UID
 * and ensure anon_seller_* synthetic identifiers are never used as notification recipients.
 */
export const onSecondChanceOfferUpdatedTrigger = onDocumentUpdated(
  {
    document: 'second_chance_offers/{offerId}',
    database: 'ai-studio-c5cea893-acec-4774-a11a-e26679ae7862'
  },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) {
      return;
    }

    const offerId = event.params.offerId;
    if (!offerId || typeof offerId !== 'string' || !offerId.startsWith('SC-')) {
      return;
    }

    const auctionId = offerId.replace('SC-', '').trim();
    if (!auctionId) {
      return;
    }

    const beforeStatus = beforeData.status;
    const afterStatus = afterData.status;

    // Process only genuine status transitions from PENDING to ACCEPTED or DECLINED
    if (beforeStatus !== 'PENDING') {
      return;
    }

    if (afterStatus !== 'ACCEPTED' && afterStatus !== 'DECLINED') {
      return;
    }

    try {
      // Resolve authoritative seller UID (0 extra reads for public seller, 1 point read for anonymous seller)
      const authoritativeSellerUid = await resolveAuthoritativeSellerUidServer(
        auctionId,
        afterData.sellerId
      );

      if (!authoritativeSellerUid) {
        console.warn(
          `[onSecondChanceOfferUpdatedTrigger] Unresolvable authoritative seller UID for auction ${auctionId}; skipping notification.`
        );
        return;
      }

      if (afterStatus === 'ACCEPTED') {
        const notifId = `sc_notif_accepted_${auctionId}`;
        await sendServerNotification(
          authoritativeSellerUid,
          notifId,
          {
            type: 'BATTLE_BIDS_SECOND_CHANCE_ACCEPTED',
            title: 'Second-Chance Offer Accepted',
            message: 'The runner-up accepted the second-chance offer. Payment is now required.',
            link: `/orders/BB-${auctionId}-SC`,
            auctionId,
            orderId: `BB-${auctionId}-SC`,
            relatedId: auctionId
          }
        );
      } else if (afterStatus === 'DECLINED') {
        const notifId = `sc_notif_declined_${auctionId}`;
        await sendServerNotification(
          authoritativeSellerUid,
          notifId,
          {
            type: 'BATTLE_BIDS_SECOND_CHANCE_DECLINED',
            title: 'Second-Chance Offer Declined',
            message: 'The runner-up declined the second-chance offer.',
            link: `/battle-bids?id=${auctionId}`,
            auctionId,
            relatedId: auctionId
          }
        );
      }
    } catch (err) {
      console.error(
        `[onSecondChanceOfferUpdatedTrigger] Error dispatching notification for offer ${offerId}:`,
        err
      );
    }
  }
);

/**
 * Core Background Expiration Engine:
 * Scans for overdue Battle Bids orders (status === 'AWAITING_PAYMENT' AND paymentDeadline <= now),
 * transitions order to PAYMENT_EXPIRED atomically, and creates second-chance offers for eligible runner-ups.
 */
export async function expireOverdueBattleBidsOrders(): Promise<{
  processed: number;
  expired: number;
  offersCreated: number;
}> {
  const now = Timestamp.now();
  let processedCount = 0;
  let expiredCount = 0;
  let offersCreatedCount = 0;

  try {
    // Query overdue Battle Bids orders
    const querySnap = await db
      .collection('orders')
      .where('source', '==', 'battle_bids')
      .where('status', '==', 'AWAITING_PAYMENT')
      .where('paymentDeadline', '<=', now)
      .limit(50)
      .get();

    if (querySnap.empty) {
      return { processed: 0, expired: 0, offersCreated: 0 };
    }

    for (const orderDocSnap of querySnap.docs) {
      processedCount++;
      const orderId = orderDocSnap.id;
      const normalizedOrderId = orderId.startsWith('BB-') ? orderId : `BB-${orderId}`;
      const orderRef = db.collection('orders').doc(normalizedOrderId);

      let originalOrderData: any = null;

      try {
        await db.runTransaction(async (transaction) => {
          const orderSnap = await transaction.get(orderRef);
          if (!orderSnap.exists) return;

          const orderData = orderSnap.data();
          if (!orderData) return;
          originalOrderData = orderData;

          if (orderData.status !== 'AWAITING_PAYMENT') {
            return;
          }

          const deadlineMs = orderData.paymentDeadline?.toDate
            ? orderData.paymentDeadline.toDate().getTime()
            : 0;

          if (deadlineMs > Date.now()) {
            return;
          }

          // Transition Order to PAYMENT_EXPIRED (WRITE)
          transaction.update(orderRef, {
            status: 'PAYMENT_EXPIRED',
            expiredAt: FieldValue.serverTimestamp(),
            expirationReason: '48_HOUR_PAYMENT_DEADLINE_LAPSED',
            updatedAt: FieldValue.serverTimestamp()
          });
        });

        if (originalOrderData) {
          expiredCount++;
          const processed = await processSecondChanceForPrimaryOrder(normalizedOrderId, {
            ...originalOrderData,
            status: 'PAYMENT_EXPIRED'
          });
          if (processed) {
            offersCreatedCount++;
          }
        }
      } catch (orderErr) {
        console.error(`[secondChanceServer] Failed to process order ${orderId}:`, orderErr);
      }
    }

    return { processed: processedCount, expired: expiredCount, offersCreated: offersCreatedCount };
  } catch (err) {
    console.error('[secondChanceServer.expireOverdueBattleBidsOrders] Global query error:', err);
    return { processed: processedCount, expired: expiredCount, offersCreated: offersCreatedCount };
  }
}
