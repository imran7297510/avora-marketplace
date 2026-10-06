import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { processCompletedDealScore, recordServerTrustEvent } from './trustScoreBackend';
import { TrustEventType, TrustSourceModule } from './trustScoreTypes';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');

/**
 * Automated Firestore Trigger: Fires when an Order document is updated.
 * Triggers Trust Score completion (+2 for buyer, +3 for seller) when order status transitions to 'SOLD', 'DEAL_DONE', or 'PAID'.
 */
export const onOrderUpdatedTrigger = onDocumentUpdated(
  {
    document: 'orders/{orderId}',
    database: 'ai-studio-c5cea893-acec-4774-a11a-e26679ae7862'
  },
  async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();

  if (!beforeData || !afterData) return;

  const previousStatus = beforeData.status;
  const currentStatus = afterData.status;

  const completionStatuses = ['SOLD', 'DEAL_DONE', 'PAID'];

  if (!completionStatuses.includes(previousStatus) && completionStatuses.includes(currentStatus)) {
    const orderId = event.params.orderId;
    const buyerId = afterData.buyerId;
    const sellerId = afterData.sellerId;
    const listingId = afterData.listingId;
    const listingTitle = afterData.listingTitle;

    if (buyerId && sellerId) {
      console.log(`Automated Trigger: Order ${orderId} completed (${previousStatus} -> ${currentStatus}). Awarding Trust Score.`);
      try {
        await processCompletedDealScore(db, {
          orderId,
          buyerId,
          sellerId,
          listingId,
          listingTitle
        });
      } catch (error) {
        console.error(`Failed to process automated Trust Score for order ${orderId}:`, error);
      }
    }
  }
});

/**
 * Automated Firestore Trigger: Fires when a Listing document status transitions to 'SOLD'.
 */
export const onListingSoldTrigger = onDocumentUpdated(
  {
    document: 'listings/{listingId}',
    database: 'ai-studio-c5cea893-acec-4774-a11a-e26679ae7862'
  },
  async (event) => {
  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();

  if (!beforeData || !afterData) return;

  if (beforeData.status !== 'SOLD' && afterData.status === 'SOLD') {
    const listingId = event.params.listingId;
    const sellerId = afterData.ownerId || afterData.sellerId;
    const buyerId = afterData.lastBuyerId || afterData.buyerId;

    if (sellerId && buyerId) {
      console.log(`Automated Trigger: Listing ${listingId} marked SOLD. Awarding Trust Score.`);
      try {
        await processCompletedDealScore(db, {
          orderId: `LISTING_${listingId}`,
          buyerId,
          sellerId,
          listingId,
          listingTitle: afterData.title
        });
      } catch (error) {
        console.error(`Failed to process Trust Score for listing ${listingId}:`, error);
      }
    }
  }
});

/**
 * HTTPS Callable: Admin endpoint to record Trust Score events safely from server backend.
 */
export const recordAdminTrustEventCallable = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to invoke admin trust score actions.');
  }

  const callerUid = request.auth.uid;
  const callerEmail = request.auth.token.email || '';

  const userRef = db.collection('users').doc(callerUid);
  const userSnap = await userRef.get();
  const isSuper = callerEmail === 'imran7297510@gmail.com' || userSnap.data()?.isSuperAdmin || userSnap.data()?.isAdmin;

  if (!isSuper) {
    const authorizedAdminSnap = await db.collection('authorizedAdmins').doc(callerEmail.toLowerCase()).get();
    if (!authorizedAdminSnap.exists) {
      throw new HttpsError('permission-denied', 'Only authorized administrators can record trust score events.');
    }
  }

  const { targetUserId, eventType, relatedEntityId, sourceModule, reason, customDelta, counterpartyId } = request.data;

  try {
    const result = await recordServerTrustEvent(db, {
      userId: targetUserId,
      eventType: eventType as TrustEventType,
      relatedEntityId,
      sourceModule: sourceModule as TrustSourceModule,
      reason,
      createdBy: callerUid,
      customDelta,
      counterpartyId
    });

    return result;
  } catch (error: any) {
    console.error('Error executing admin trust score callable:', error);
    throw new HttpsError('internal', error.message || 'Failed to execute trust score event.');
  }
});

