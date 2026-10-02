import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore('ai-studio-c5cea893-acec-4774-a11e-e26679ae7862');

export interface ServerRunnerUpBid {
  userId: string;
  userName: string;
  userPhotoURL?: string;
  amount: number;
  timestamp?: any;
  rank: number;
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

    let resolvedSellerId = sellerId;
    if (!resolvedSellerId) {
      try {
        const auctionSnap = await db.collection('arena_auctions').doc(auctionId).get();
        if (auctionSnap.exists) {
          resolvedSellerId = auctionSnap.data()?.sellerId;
        }
      } catch (e) {
        console.warn('[secondChanceServer.getAuthoritativeRunnerUp] Could not resolve sellerId:', e);
      }
    }

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

        if (resolvedSellerId && userId === resolvedSellerId) {
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
  }
): Promise<void> {
  if (!userId) return;

  try {
    const userNotifRef = db.collection('users').doc(userId).collection('notifications').doc(notifId);
    const existing = await userNotifRef.get();
    if (existing.exists) return;

    const body = {
      id: notifId,
      userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link,
      auctionId: payload.auctionId || '',
      isRead: false,
      timestamp: FieldValue.serverTimestamp()
    };

    await userNotifRef.set(body, { merge: true });

    const rootNotifRef = db.collection('notifications').doc(notifId);
    await rootNotifRef.set(body, { merge: true });
  } catch (err) {
    console.warn(`[secondChanceServer] Notification write error for user ${userId}:`, err);
  }
}

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

      let createdOfferId: string | null = null;
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

          const auctionId = orderData.auctionId || orderData.listingId || normalizedOrderId.replace('BB-', '');

          // 1. Check if a Second-Chance Offer already exists for this auction (READ BEFORE WRITE)
          const offerRef = db.collection('second_chance_offers').doc(`SC-${auctionId}`);
          const offerSnap = await transaction.get(offerRef);

          if (!offerSnap.exists) {
            createdOfferId = `SC-${auctionId}`;
          }

          // 2. Transition Order to PAYMENT_EXPIRED (WRITE)
          transaction.update(orderRef, {
            status: 'PAYMENT_EXPIRED',
            expiredAt: FieldValue.serverTimestamp(),
            expirationReason: '48_HOUR_PAYMENT_DEADLINE_LAPSED',
            updatedAt: FieldValue.serverTimestamp()
          });
        });

        if (originalOrderData) {
          expiredCount++;
          const auctionId = originalOrderData.auctionId || originalOrderData.listingId || normalizedOrderId.replace('BB-', '');

          // Dispatched AFTER successful transaction commit
          if (createdOfferId) {
            const runnerUp = await getAuthoritativeRunnerUpServer(
              auctionId,
              originalOrderData.buyerId,
              originalOrderData.sellerId
            );

            if (runnerUp) {
              const offerRef = db.collection('second_chance_offers').doc(createdOfferId);
              const expiresAt = Timestamp.fromDate(new Date(Date.now() + 24 * 3600 * 1000));

              const offerPayload: any = {
                id: createdOfferId,
                auctionId,
                originalOrderId: normalizedOrderId,
                sellerId: originalOrderData.sellerId,
                sellerName: originalOrderData.sellerName || 'Verified Seller',
                buyerId: runnerUp.userId,
                buyerName: runnerUp.userName,
                amount: runnerUp.amount,
                currency: originalOrderData.currency || 'USD',
                currencySymbol: originalOrderData.currencySymbol || '$',
                status: 'PENDING',
                itemTitle: originalOrderData.itemTitle || originalOrderData.listingTitle || 'Battle Bids Asset',
                itemImage: originalOrderData.itemImage || originalOrderData.listingImage || '',
                expiresAt,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
              };

              await offerRef.set(offerPayload, { merge: true });
              offersCreatedCount++;

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

              // Deliver Seller Notification
              await sendServerNotification(
                originalOrderData.sellerId,
                `sc_notif_seller_${auctionId}`,
                {
                  type: 'BATTLE_BIDS_SECOND_CHANCE_SELLER',
                  title: 'Second-Chance Offer Dispatched',
                  message: `Original winner payment expired. A second-chance offer was automatically extended to runner-up @${runnerUp.userName} for ${offerPayload.currencySymbol}${offerPayload.amount}.`,
                  link: `/seller-dashboard`,
                  auctionId
                }
              );

              // Audit Log
              try {
                await db.collection('audit_logs').add({
                  userId: originalOrderData.sellerId,
                  actionType: 'SECOND_CHANCE_OFFER_ISSUED',
                  targetId: auctionId,
                  targetType: 'auction',
                  reason: `Primary winner ${originalOrderData.buyerId} payment expired. Offer extended to runner-up ${runnerUp.userId} at ${runnerUp.amount}.`,
                  timestamp: FieldValue.serverTimestamp(),
                  executionSource: 'SERVER_BACKGROUND_JOB'
                });
              } catch (auditErr) {
                console.warn('[secondChanceServer] Audit log skipped:', auditErr);
              }
            }
          }

          // Deliver Original Winner Expiration Notification
          await sendServerNotification(
            originalOrderData.buyerId,
            `sc_notif_winner_expired_${normalizedOrderId}`,
            {
              type: 'BATTLE_BIDS_PAYMENT_EXPIRED',
              title: 'Payment Window Expired',
              message: `Your 48-hour payment window for "${originalOrderData.itemTitle || originalOrderData.listingTitle}" has expired. The order has been closed.`,
              link: `/orders/${normalizedOrderId}`,
              auctionId
            }
          );
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
