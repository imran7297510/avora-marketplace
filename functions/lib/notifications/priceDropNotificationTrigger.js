"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onListingPriceDropTrigger = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_2.getFirestore)();
/**
 * Deterministically parses a Firestore/JavaScript timestamp value into milliseconds.
 * Returns null if the value is missing, invalid, or cannot be safely converted.
 */
function extractTimestampMs(val) {
    if (!val)
        return null;
    if (typeof val.toMillis === 'function') {
        const ms = val.toMillis();
        return typeof ms === 'number' && !isNaN(ms) ? ms : null;
    }
    if (typeof val.toDate === 'function') {
        const dt = val.toDate();
        return dt instanceof Date && !isNaN(dt.getTime()) ? dt.getTime() : null;
    }
    if (typeof val.seconds === 'number') {
        return val.seconds * 1000 + (val.nanoseconds ? Math.floor(val.nanoseconds / 1000000) : 0);
    }
    if (typeof val._seconds === 'number') {
        return val._seconds * 1000 + (val._nanoseconds ? Math.floor(val._nanoseconds / 1000000) : 0);
    }
    if (val instanceof Date) {
        const t = val.getTime();
        return isNaN(t) ? null : t;
    }
    if (typeof val === 'number') {
        if (isNaN(val) || val <= 0)
            return null;
        return val < 10000000000 ? val * 1000 : val;
    }
    if (typeof val === 'string') {
        const t = new Date(val).getTime();
        return isNaN(t) ? null : t;
    }
    return null;
}
/**
 * Server-authoritative Cloud Function (v2): Triggered on /listings/{listingId} updates.
 * Detects genuine price-drop events, queries watchers from /users/{userId}/favorites/{listingId},
 * excludes the listing owner, and idempotently dispatches PRICE_DROP notifications
 * using deterministic IDs to both root /notifications and /users/{watcherUid}/notifications.
 */
exports.onListingPriceDropTrigger = (0, firestore_1.onDocumentUpdated)('listings/{listingId}', async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    // 1. Snapshot existence validation
    if (!beforeData || !afterData) {
        console.warn('[PRICE_DROP_TRIGGER] Missing before or after snapshot data');
        return;
    }
    const listingId = event.params.listingId;
    if (!listingId || typeof listingId !== 'string' || !listingId.trim()) {
        console.warn('[PRICE_DROP_TRIGGER] Invalid listingId parameter');
        return;
    }
    // 2. Authoritative Price Change & Genuine Drop State Validation
    const beforePrice = typeof beforeData.price === 'number' ? beforeData.price : Number(beforeData.price);
    const afterPrice = typeof afterData.price === 'number' ? afterData.price : Number(afterData.price);
    if (isNaN(afterPrice) || afterPrice <= 0) {
        console.warn(`[PRICE_DROP_TRIGGER] Listing ${listingId} resulting price is invalid: ${afterData.price}`);
        return;
    }
    // Price MUST have actually changed and decreased
    if (isNaN(beforePrice) || afterPrice >= beforePrice) {
        // Unchanged price, price increase, or malformed previous price => not a price-drop transition
        return;
    }
    // Must have priceDropped === true
    if (afterData.priceDropped !== true) {
        return;
    }
    // Must have a valid priceDroppedAt timestamp representing the current price-drop event
    if (!afterData.priceDroppedAt) {
        console.warn(`[PRICE_DROP_TRIGGER] Listing ${listingId} marked priceDropped=true but missing priceDroppedAt`);
        return;
    }
    const priceDroppedAtMs = extractTimestampMs(afterData.priceDroppedAt);
    if (!priceDroppedAtMs) {
        console.warn(`[PRICE_DROP_TRIGGER] Listing ${listingId} priceDroppedAt could not be safely resolved to timestamp ms`);
        return;
    }
    // 3. Authoritative Listing Details & Seller Identity
    const ownerId = typeof afterData.ownerId === 'string' ? afterData.ownerId.trim() : '';
    const listingTitle = afterData.title || beforeData.title || 'Dropped Item';
    // 4. Currency Formatting & Discount Calculations
    const currencySymbol = afterData.currencySymbol ||
        (afterData.currency === 'USD'
            ? '$'
            : afterData.currency === 'EUR'
                ? '€'
                : afterData.currency === 'GBP'
                    ? '£'
                    : afterData.currency === 'PKR'
                        ? 'Rs. '
                        : afterData.currency
                            ? `${afterData.currency} `
                            : 'Rs. ');
    const previousBaseline = typeof afterData.previousPrice === 'number' && afterData.previousPrice > afterPrice
        ? afterData.previousPrice
        : beforePrice;
    const savedAmount = typeof afterData.priceDroppedAmount === 'number' && afterData.priceDroppedAmount > 0
        ? afterData.priceDroppedAmount
        : previousBaseline - afterPrice;
    const savedPercent = typeof afterData.priceDroppedPercent === 'number' && afterData.priceDroppedPercent > 0
        ? afterData.priceDroppedPercent
        : Math.round((savedAmount / previousBaseline) * 100);
    const formattedSavedAmount = `${currencySymbol}${savedAmount.toLocaleString()}`;
    const notificationTitle = '🔔 Item in Watchlist Dropped Price!';
    const notificationMessage = `${listingTitle} is now available at a massive discount! Saved ${formattedSavedAmount} (${savedPercent}% Off).`;
    // 5. Query Watchers via CollectionGroup favorites (/users/{userId}/favorites/{docId})
    const favoritesSnap = await db
        .collectionGroup('favorites')
        .where('listingId', '==', listingId)
        .get();
    if (favoritesSnap.empty) {
        console.log(`[PRICE_DROP_TRIGGER] No watchers found for listing ${listingId}`);
        return;
    }
    // Resolve authoritative watcher UIDs from document path: /users/{userId}/favorites/{docId}
    // Deduplicate UIDs and exclude listing owner
    const watcherUidSet = new Set();
    for (const favDoc of favoritesSnap.docs) {
        const parentUserDoc = favDoc.ref.parent?.parent;
        const watcherUid = parentUserDoc?.id ? parentUserDoc.id.trim() : '';
        if (watcherUid && watcherUid !== ownerId) {
            watcherUidSet.add(watcherUid);
        }
    }
    const uniqueWatcherUids = Array.from(watcherUidSet);
    if (uniqueWatcherUids.length === 0) {
        console.log(`[PRICE_DROP_TRIGGER] No eligible non-owner watchers for listing ${listingId}`);
        return;
    }
    console.log(`[PRICE_DROP_TRIGGER] Found ${uniqueWatcherUids.length} unique watchers for price-dropped listing ${listingId}`);
    // 6. Process Watchers in Batches with Idempotency & Deterministic IDs
    // Each watcher creates 2 documents:
    // 1) /notifications/{notifId}
    // 2) /users/{watcherUid}/notifications/{notifId}
    // Chunk size 200 watchers = 400 operations max, staying well below Firestore's 500 operation limit per batch.
    const CHUNK_SIZE = 200;
    for (let i = 0; i < uniqueWatcherUids.length; i += CHUNK_SIZE) {
        const chunk = uniqueWatcherUids.slice(i, i + CHUNK_SIZE);
        const chunkWithIds = chunk.map((watcherUid) => ({
            watcherUid,
            notifId: `price_drop_${listingId}_${watcherUid}_${priceDroppedAtMs}`
        }));
        // Pre-check existing root notifications to avoid overwriting existing read/isRead states on retries
        const rootRefs = chunkWithIds.map((item) => db.collection('notifications').doc(item.notifId));
        const existingDocs = await db.getAll(...rootRefs);
        const existingIdSet = new Set();
        existingDocs.forEach((docSnap) => {
            if (docSnap.exists) {
                existingIdSet.add(docSnap.id);
            }
        });
        const batch = db.batch();
        let writeCount = 0;
        for (const { watcherUid, notifId } of chunkWithIds) {
            if (existingIdSet.has(notifId)) {
                // Already created idempotently, skip to preserve unread state and timestamps
                continue;
            }
            const notificationPayload = {
                id: notifId,
                userId: watcherUid,
                type: 'PRICE_DROP',
                title: notificationTitle,
                message: notificationMessage,
                relatedId: listingId,
                link: `/listing/${listingId}`,
                listingId: listingId,
                read: false,
                isRead: false,
                createdAt: firestore_2.FieldValue.serverTimestamp(),
                timestamp: firestore_2.FieldValue.serverTimestamp()
            };
            const rootNotifRef = db.collection('notifications').doc(notifId);
            const userNotifRef = db
                .collection('users')
                .doc(watcherUid)
                .collection('notifications')
                .doc(notifId);
            batch.set(rootNotifRef, notificationPayload);
            batch.set(userNotifRef, notificationPayload);
            writeCount += 2;
        }
        if (writeCount > 0) {
            await batch.commit();
            console.log(`[PRICE_DROP_TRIGGER] Committed batch of ${writeCount} notification writes for listing ${listingId} (${chunk.length} watchers in chunk)`);
        }
    }
    console.log(`[PRICE_DROP_TRIGGER] Successfully completed PRICE_DROP notification dispatch for listing ${listingId}`);
});
//# sourceMappingURL=priceDropNotificationTrigger.js.map