import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

/**
 * Server-authoritative Cloud Function (v2): Triggered on /offers/{offerId} creation.
 * Validates the event against authoritative /listings/{listingId} data, ensures seller
 * identity consistency, suppresses self-offers, and idempotently dispatches OFFER_RECEIVED
 * notifications to both root /notifications and /users/{sellerUid}/notifications.
 */
export const onOfferCreatedTrigger = onDocumentCreated(
  'offers/{offerId}',
  async (event) => {
    const offerData = event.data?.data();
    if (!offerData) {
      console.warn('[OFFER_TRIGGER] Missing offer snapshot or data for event');
      return;
    }

    const offerId = event.params.offerId;
    const rawListingId = offerData.listingId;

    if (!rawListingId || typeof rawListingId !== 'string' || !rawListingId.trim()) {
      console.warn(`[OFFER_TRIGGER] Offer ${offerId} missing or invalid listingId`);
      return;
    }

    const listingId = rawListingId.trim();

    try {
      // 1. Authoritative Listing Lookup
      const listingDoc = await db.collection('listings').doc(listingId).get();
      if (!listingDoc.exists) {
        console.warn(`[OFFER_TRIGGER] Referenced listing ${listingId} does not exist for offer ${offerId}`);
        return;
      }

      const listingData = listingDoc.data();
      const authoritativeOwnerId = listingData?.ownerId;

      if (!authoritativeOwnerId || typeof authoritativeOwnerId !== 'string' || !authoritativeOwnerId.trim()) {
        console.warn(`[OFFER_TRIGGER] Listing ${listingId} is missing authoritative ownerId`);
        return;
      }

      const sellerUid = authoritativeOwnerId.trim();

      // 2. Seller ID Consistency Check (Untrusted Offer Payload Validation)
      if (offerData.sellerId && typeof offerData.sellerId === 'string' && offerData.sellerId.trim() !== sellerUid) {
        console.warn(
          `[OFFER_TRIGGER] Security Mismatch: Seller UID discrepancy detected. Offer sellerId: "${offerData.sellerId}", Authoritative listing ownerId: "${sellerUid}". Aborting notification dispatch.`
        );
        return;
      }

      // 3. Self-Offer Suppression
      const buyerId = offerData.buyerId ? String(offerData.buyerId).trim() : '';
      if (buyerId && buyerId === sellerUid) {
        console.info(`[OFFER_TRIGGER] Self-offer detected (buyer ${buyerId} is listing owner). Suppressing notification.`);
        return;
      }

      // 4. Proposed Price & Display Formatting
      const rawPrice = offerData.proposedPrice;
      const proposedPrice = typeof rawPrice === 'number' ? rawPrice : Number(rawPrice);
      if (isNaN(proposedPrice) || proposedPrice <= 0) {
        console.warn(`[OFFER_TRIGGER] Offer ${offerId} has invalid proposedPrice: ${rawPrice}`);
        return;
      }

      const listingTitle = listingData.title || offerData.listingTitle || 'Dropped Item';
      const currencySymbol =
        listingData.currencySymbol ||
        (listingData.currency === 'USD'
          ? '$'
          : listingData.currency === 'EUR'
          ? '€'
          : listingData.currency === 'GBP'
          ? '£'
          : listingData.currency === 'PKR'
          ? 'Rs. '
          : listingData.currency
          ? `${listingData.currency} `
          : 'Rs. ');

      const formattedPrice = proposedPrice.toLocaleString();
      const notificationTitle = '📉 New Price Offer Received!';
      const notificationMessage = `Someone made an offer of ${currencySymbol}${formattedPrice} on your dropped item: ${listingTitle}.`;

      // 5. Deterministic Notification Document ID & Idempotency Check
      const notifId = `offer_rcvd_${offerId}`;
      const rootNotifRef = db.collection('notifications').doc(notifId);
      const userNotifRef = db.collection('users').doc(sellerUid).collection('notifications').doc(notifId);

      const existingRootDoc = await rootNotifRef.get();
      if (existingRootDoc.exists) {
        console.log(`[OFFER_TRIGGER] Notification ${notifId} already exists (idempotent delivery).`);
        return;
      }

      // 6. Authoritative Notification Payload Contract
      const notificationPayload = {
        id: notifId,
        userId: sellerUid,
        type: 'OFFER_RECEIVED',
        title: notificationTitle,
        message: notificationMessage,
        relatedId: listingId,
        link: `/listing/${listingId}`,
        listingId: listingId,
        offerId: offerId,
        read: false,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
        timestamp: FieldValue.serverTimestamp()
      };

      // 7. Atomic Multi-Path Dispatch via Admin SDK
      const batch = db.batch();
      batch.set(rootNotifRef, notificationPayload, { merge: true });
      batch.set(userNotifRef, notificationPayload, { merge: true });
      await batch.commit();

      console.log(
        `[OFFER_TRIGGER] Authoritative OFFER_RECEIVED notification ${notifId} successfully dispatched to seller ${sellerUid} for listing ${listingId}.`
      );
    } catch (err) {
      console.error(`[OFFER_TRIGGER] Failed to process offer notification for offer ${offerId}:`, err);
      // Re-throw genuine backend persistence errors to allow Cloud Functions runtime retry where appropriate
      throw err;
    }
  }
);
