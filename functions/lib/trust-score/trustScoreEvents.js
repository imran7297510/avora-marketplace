"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAdminTrustEventCallable = exports.onListingSoldTrigger = exports.onOrderUpdatedTrigger = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const trustScoreBackend_1 = require("./trustScoreBackend");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_2.getFirestore)('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');
/**
 * Automated Firestore Trigger: Fires when an Order document is updated.
 * Triggers Trust Score completion (+2 for buyer, +3 for seller) when order status transitions to 'SOLD', 'DEAL_DONE', or 'PAID'.
 */
exports.onOrderUpdatedTrigger = (0, firestore_1.onDocumentUpdated)({
    document: 'orders/{orderId}',
    database: 'ai-studio-c5cea893-acec-4774-a11a-e26679ae7862'
}, async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData)
        return;
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
                await (0, trustScoreBackend_1.processCompletedDealScore)(db, {
                    orderId,
                    buyerId,
                    sellerId,
                    listingId,
                    listingTitle
                });
            }
            catch (error) {
                console.error(`Failed to process automated Trust Score for order ${orderId}:`, error);
            }
        }
    }
});
/**
 * Automated Firestore Trigger: Fires when a Listing document status transitions to 'SOLD'.
 */
exports.onListingSoldTrigger = (0, firestore_1.onDocumentUpdated)({
    document: 'listings/{listingId}',
    database: 'ai-studio-c5cea893-acec-4774-a11a-e26679ae7862'
}, async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData)
        return;
    if (beforeData.status !== 'SOLD' && afterData.status === 'SOLD') {
        const listingId = event.params.listingId;
        const sellerId = afterData.ownerId || afterData.sellerId;
        const buyerId = afterData.lastBuyerId || afterData.buyerId;
        if (sellerId && buyerId) {
            console.log(`Automated Trigger: Listing ${listingId} marked SOLD. Awarding Trust Score.`);
            try {
                await (0, trustScoreBackend_1.processCompletedDealScore)(db, {
                    orderId: `LISTING_${listingId}`,
                    buyerId,
                    sellerId,
                    listingId,
                    listingTitle: afterData.title
                });
            }
            catch (error) {
                console.error(`Failed to process Trust Score for listing ${listingId}:`, error);
            }
        }
    }
});
/**
 * HTTPS Callable: Admin endpoint to record Trust Score events safely from server backend.
 */
exports.recordAdminTrustEventCallable = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated to invoke admin trust score actions.');
    }
    const callerUid = request.auth.uid;
    const callerEmail = request.auth.token.email || '';
    const userRef = db.collection('users').doc(callerUid);
    const userSnap = await userRef.get();
    const isSuper = callerEmail === 'imran7297510@gmail.com' || userSnap.data()?.isSuperAdmin || userSnap.data()?.isAdmin;
    if (!isSuper) {
        const authorizedAdminSnap = await db.collection('authorizedAdmins').doc(callerEmail.toLowerCase()).get();
        if (!authorizedAdminSnap.exists) {
            throw new https_1.HttpsError('permission-denied', 'Only authorized administrators can record trust score events.');
        }
    }
    const { targetUserId, eventType, relatedEntityId, sourceModule, reason, customDelta, counterpartyId } = request.data;
    try {
        const result = await (0, trustScoreBackend_1.recordServerTrustEvent)(db, {
            userId: targetUserId,
            eventType: eventType,
            relatedEntityId,
            sourceModule: sourceModule,
            reason,
            createdBy: callerUid,
            customDelta,
            counterpartyId
        });
        return result;
    }
    catch (error) {
        console.error('Error executing admin trust score callable:', error);
        throw new https_1.HttpsError('internal', error.message || 'Failed to execute trust score event.');
    }
});
//# sourceMappingURL=trustScoreEvents.js.map