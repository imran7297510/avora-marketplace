"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPromotionRefundRequestedTrigger = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_2.getFirestore)('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');
/**
 * Server-authoritative Cloud Function (v2): Triggered on /promotionRequests/{requestId} updates.
 * Detects legitimate user refund submissions (refundRequested: true, refundStatus: 'PENDING'),
 * authoritatively calculates the 95% refund and 5% retention amounts, records them, and
 * idempotently dispatches administrator alerts to all admin users via both root /notifications
 * and /users/{adminUid}/notifications using deterministic document IDs.
 */
exports.onPromotionRefundRequestedTrigger = (0, firestore_1.onDocumentUpdated)({
    document: 'promotionRequests/{requestId}',
    database: 'ai-studio-c5cea893-acec-4774-a11a-e26679ae7862'
}, async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    // 1. Snapshot existence validation
    if (!beforeData || !afterData) {
        console.warn('[PROMOTION_REFUND_TRIGGER] Missing before or after snapshot data');
        return;
    }
    const requestId = event.params.requestId;
    if (!requestId || typeof requestId !== 'string' || !requestId.trim()) {
        console.warn('[PROMOTION_REFUND_TRIGGER] Invalid requestId parameter');
        return;
    }
    // 2. State transition validation: Only fire when transitioning into refundRequested: true & refundStatus: 'PENDING'
    const wasPendingRefund = beforeData.refundRequested === true && beforeData.refundStatus === 'PENDING';
    const isPendingRefund = afterData.refundRequested === true && afterData.refundStatus === 'PENDING';
    if (wasPendingRefund || !isPendingRefund) {
        // Not a new refund-request transition; ignore
        return;
    }
    try {
        // 3. Authoritative financial calculation (95% refund, 5% platform retention)
        const rawReceived = afterData.receivedAmount;
        const receivedAmount = typeof rawReceived === 'number' ? rawReceived : Number(rawReceived) || 0;
        const refundAmount = Math.round(receivedAmount * 0.95);
        const retentionAmount = Math.max(0, receivedAmount - refundAmount);
        const currency = (afterData.currency || 'PKR').toUpperCase();
        const currencySymbol = currency === 'USD'
            ? '$'
            : currency === 'EUR'
                ? '€'
                : currency === 'GBP'
                    ? '£'
                    : currency === 'PKR'
                        ? 'Rs. '
                        : `${currency} `;
        const planName = afterData.planName || 'Badge Promotion';
        const proofCount = Array.isArray(afterData.refundProofImages)
            ? afterData.refundProofImages.length
            : afterData.refundProofImage
                ? 1
                : 0;
        const formattedRefund = `${currencySymbol}${refundAmount.toLocaleString()}`;
        const formattedRetention = `${currencySymbol}${retentionAmount.toLocaleString()}`;
        const notificationTitle = '💸 User Refund Request Submitted';
        const notificationMessage = `A 95% refund of ${formattedRefund} (5% retention: ${formattedRetention}) has been claimed for badge "${planName}" with ${proofCount} attached payment proof(s). Please check it in the PROMO panel under Admin Dashboard.`;
        // 4. Discover administrator recipients
        const adminsSnap = await db.collection('users').where('isAdmin', '==', true).get();
        if (adminsSnap.empty) {
            console.warn(`[PROMOTION_REFUND_TRIGGER] No admin users found to receive refund notification for ${requestId}`);
        }
        const adminUids = Array.from(new Set(adminsSnap.docs.map((doc) => doc.id).filter(Boolean)));
        // 5. Deterministic notification IDs & Idempotent multi-path dispatch
        const batch = db.batch();
        let writeCount = 0;
        if (adminUids.length > 0) {
            const notifItems = adminUids.map((adminUid) => ({
                adminUid,
                notifId: `refund_req_${requestId}_${adminUid}`
            }));
            const rootRefs = notifItems.map((item) => db.collection('notifications').doc(item.notifId));
            const existingDocs = await db.getAll(...rootRefs);
            const existingIdSet = new Set();
            existingDocs.forEach((docSnap) => {
                if (docSnap.exists) {
                    existingIdSet.add(docSnap.id);
                }
            });
            for (const { adminUid, notifId } of notifItems) {
                if (existingIdSet.has(notifId)) {
                    continue;
                }
                const notificationPayload = {
                    id: notifId,
                    userId: adminUid,
                    type: 'REFUND_REQUEST',
                    title: notificationTitle,
                    message: notificationMessage,
                    relatedId: requestId,
                    requestId: requestId,
                    link: '/admin',
                    url: '/admin',
                    read: false,
                    isRead: false,
                    createdAt: firestore_2.FieldValue.serverTimestamp(),
                    timestamp: firestore_2.FieldValue.serverTimestamp()
                };
                const rootNotifRef = db.collection('notifications').doc(notifId);
                const userNotifRef = db
                    .collection('users')
                    .doc(adminUid)
                    .collection('notifications')
                    .doc(notifId);
                batch.set(rootNotifRef, notificationPayload, { merge: true });
                batch.set(userNotifRef, notificationPayload, { merge: true });
                writeCount += 2;
            }
        }
        // 6. Record authoritative calculated refund amounts on the promotionRequest document
        const promoDocRef = db.collection('promotionRequests').doc(requestId);
        batch.update(promoDocRef, {
            refundCalculatedAmount: refundAmount,
            refundRetentionAmount: retentionAmount,
            refundPercentage: 95,
            refundRetentionPercentage: 5,
            updatedAt: firestore_2.FieldValue.serverTimestamp()
        });
        writeCount += 1;
        await batch.commit();
        console.log(`[PROMOTION_REFUND_TRIGGER] Successfully processed refund alert for request ${requestId} (${adminUids.length} admins notified, ${writeCount} batch operations committed).`);
    }
    catch (err) {
        console.error(`[PROMOTION_REFUND_TRIGGER] Failed to process refund notification for request ${requestId}:`, err);
        throw err;
    }
});
//# sourceMappingURL=promotionRefundTrigger.js.map