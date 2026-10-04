"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAuctionOutbidTrigger = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_2.getFirestore)();
/**
 * Server-authoritative Cloud Function (v2): Triggered on /arena_auctions/{auctionId} updates.
 * Detects genuine outbid state transitions, resolves the previous highest bidder UID
 * exclusively from the authoritative before-snapshot, excludes self/seller outbids,
 * and idempotently dispatches 'outbid' notifications to both root /notifications
 * and /users/{recipientUid}/notifications using deterministic event IDs.
 */
exports.onAuctionOutbidTrigger = (0, firestore_1.onDocumentUpdated)('arena_auctions/{auctionId}', async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    // 1. Snapshot existence validation
    if (!beforeData || !afterData) {
        console.warn('[OUTBID_TRIGGER] Missing before or after snapshot data');
        return;
    }
    const auctionId = event.params.auctionId;
    if (!auctionId || typeof auctionId !== 'string' || !auctionId.trim()) {
        console.warn('[OUTBID_TRIGGER] Invalid auctionId parameter');
        return;
    }
    // 2. Authoritative Outbid Detection Logic
    const previousHighestBidderId = typeof beforeData.highestBidderId === 'string' ? beforeData.highestBidderId.trim() : '';
    const newHighestBidderId = typeof afterData.highestBidderId === 'string' ? afterData.highestBidderId.trim() : '';
    // Must have an actual previous highest bidder to be outbid
    if (!previousHighestBidderId) {
        return;
    }
    // Must have a valid new highest bidder
    if (!newHighestBidderId) {
        return;
    }
    // Must represent a transition between two different users (cannot outbid self)
    if (previousHighestBidderId === newHighestBidderId) {
        return;
    }
    // 3. Price progression validation
    const beforeBid = typeof beforeData.currentBid === 'number' ? beforeData.currentBid : Number(beforeData.currentBid);
    const afterBid = typeof afterData.currentBid === 'number' ? afterData.currentBid : Number(afterData.currentBid);
    if (isNaN(afterBid) || isNaN(beforeBid) || afterBid <= beforeBid || afterBid <= 0) {
        return;
    }
    // 4. Auction status validation (must be an active auction)
    if (afterData.status !== 'active') {
        return;
    }
    // Exclude seller from outbid recipient
    const sellerId = typeof afterData.sellerId === 'string' ? afterData.sellerId.trim() : '';
    if (sellerId && (previousHighestBidderId === sellerId || newHighestBidderId === sellerId)) {
        return;
    }
    const recipientUid = previousHighestBidderId;
    // 5. Authoritative listing details & currency formatting
    const auctionTitle = afterData.title || beforeData.title || 'Battle Bids Item';
    const itemCurrencySymbol = afterData.currencySymbol ||
        (afterData.currency === 'USD'
            ? '$'
            : afterData.currency === 'EUR'
                ? '€'
                : afterData.currency === 'GBP'
                    ? '£'
                    : afterData.currency === 'PKR'
                        ? 'Rs.'
                        : afterData.currency
                            ? `${afterData.currency} `
                            : 'Rs.');
    const formattedBid = afterBid.toLocaleString();
    const notificationTitle = 'Tactical Outbid';
    const notificationMessage = `You have been outbid on ${auctionTitle}. New bid: ${itemCurrencySymbol} ${formattedBid}`;
    const notificationLink = `/battle-bids?id=${auctionId}`;
    // 6. Deterministic Notification Event ID
    // Each successful bid in placeBid monotonically increments bidsCount (bidsCount = 1, 2, 3...).
    // Combining auctionId, sequential bidsCount, and recipientUid uniquely and immutably identifies the event.
    const bidsSequence = typeof afterData.bidsCount === 'number' && afterData.bidsCount > 0
        ? `b${afterData.bidsCount}`
        : `amt${afterBid}`;
    const notifId = `outbid_${auctionId}_${bidsSequence}_${recipientUid}`;
    try {
        const rootNotifRef = db.collection('notifications').doc(notifId);
        const userNotifRef = db.collection('users').doc(recipientUid).collection('notifications').doc(notifId);
        // Pre-check existence for idempotency & unread preservation
        const existingRootDoc = await rootNotifRef.get();
        if (existingRootDoc.exists) {
            console.log(`[OUTBID_TRIGGER] Notification ${notifId} already exists (idempotent delivery).`);
            return;
        }
        const notificationPayload = {
            id: notifId,
            userId: recipientUid,
            type: 'outbid',
            title: notificationTitle,
            message: notificationMessage,
            relatedId: auctionId,
            auctionId: auctionId,
            link: notificationLink,
            read: false,
            isRead: false,
            createdAt: firestore_2.FieldValue.serverTimestamp(),
            timestamp: firestore_2.FieldValue.serverTimestamp()
        };
        const batch = db.batch();
        batch.set(rootNotifRef, notificationPayload);
        batch.set(userNotifRef, notificationPayload);
        await batch.commit();
        console.log(`[OUTBID_TRIGGER] Authoritative OUTBID notification ${notifId} successfully dispatched to user ${recipientUid} for auction ${auctionId}.`);
    }
    catch (err) {
        console.error(`[OUTBID_TRIGGER] Failed to dispatch outbid notification for auction ${auctionId}:`, err);
        throw err;
    }
});
//# sourceMappingURL=outbidNotificationTrigger.js.map