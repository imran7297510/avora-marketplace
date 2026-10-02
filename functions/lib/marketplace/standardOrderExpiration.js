"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireOverdueStandardOrders = expireOverdueStandardOrders;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
/**
 * Master named Firestore database instance target
 * Target: treasure-hub-pk / ai-studio-c5cea893-acec-4774-a11e-e26679ae7862
 */
const db = (0, firestore_1.getFirestore)('ai-studio-c5cea893-acec-4774-a11e-e26679ae7862');
const EXPIRATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 Hours in milliseconds
/**
 * Helper to safely extract milliseconds from various timestamp representations
 */
function parseTimestampMillis(val) {
    if (!val)
        return null;
    if (typeof val.toMillis === 'function') {
        return val.toMillis();
    }
    if (typeof val.seconds === 'number') {
        return val.seconds * 1000;
    }
    if (typeof val === 'number') {
        return val;
    }
    if (typeof val === 'string') {
        const parsed = new Date(val).getTime();
        return isNaN(parsed) ? null : parsed;
    }
    if (val instanceof Date) {
        return val.getTime();
    }
    return null;
}
/**
 * Server-Authoritative Expiration Worker for Standard Marketplace Orders.
 * Processes PENDING marketplace orders older than 24 hours (calculated via server-generated createdAt),
 * transitions them to EXPIRED, and atomically restores reserved listing inventory.
 *
 * Strict Isolation: Excludes Battle Bids auctions, Second Chance offers, and Private Negotiations.
 */
async function expireOverdueStandardOrders() {
    console.log('[standardOrderExpiration] Starting server-authoritative expiration scan...');
    let processedCount = 0;
    let expiredCount = 0;
    let skippedCount = 0;
    try {
        const serverNowMs = firestore_1.Timestamp.now().toMillis();
        // Query PENDING orders sorted by createdAt asc with a conservative batch limit of 50
        const pendingQuery = db.collection('orders')
            .where('status', '==', 'PENDING')
            .orderBy('createdAt', 'asc')
            .limit(50);
        const snapshot = await pendingQuery.get();
        processedCount = snapshot.docs.length;
        if (snapshot.empty) {
            console.log('[standardOrderExpiration] No PENDING orders found.');
            return { processed: 0, expired: 0, skipped: 0 };
        }
        for (const docSnap of snapshot.docs) {
            const orderData = docSnap.data();
            const orderId = docSnap.id;
            // 1. Standard Marketplace Isolation Filter
            const isBattleBids = orderData?.source === 'battle_bids' ||
                orderData?.source === 'second_chance' ||
                orderData?.isSecondChance === true ||
                orderId.startsWith('BB-');
            const isPrivateNegotiation = orderData?.source === 'private_negotiation';
            if (isBattleBids || isPrivateNegotiation) {
                skippedCount++;
                continue;
            }
            // 2. Authoritative Time Calculation
            const createdAtMs = parseTimestampMillis(orderData?.createdAt);
            const expiresAtMs = parseTimestampMillis(orderData?.expiresAt);
            let isExpired = false;
            if (createdAtMs !== null && createdAtMs > 0) {
                // Authoritative: serverNow >= createdAt + 24 hours
                isExpired = (serverNowMs - createdAtMs) >= EXPIRATION_WINDOW_MS;
            }
            else if (expiresAtMs !== null && expiresAtMs > 0) {
                // Fallback: serverNow >= expiresAt
                isExpired = serverNowMs >= expiresAtMs;
            }
            else {
                // Fail Safe Closed: Missing valid timestamp basis -> skip without modifying
                console.warn(`[standardOrderExpiration] Diagnostic: Order ${orderId} lacks trustworthy createdAt/expiresAt. Skipping.`);
                skippedCount++;
                continue;
            }
            if (!isExpired) {
                skippedCount++;
                continue;
            }
            // 3. Atomic Expiration Transaction
            try {
                await db.runTransaction(async (transaction) => {
                    const orderRef = db.collection('orders').doc(orderId);
                    const freshOrderSnap = await transaction.get(orderRef);
                    if (!freshOrderSnap.exists)
                        return;
                    const freshOrder = freshOrderSnap.data();
                    if (!freshOrder)
                        return;
                    // Re-verify strict status & isolation guards inside transaction
                    if (freshOrder.status !== 'PENDING')
                        return;
                    const isFreshBattleBids = freshOrder.source === 'battle_bids' ||
                        freshOrder.source === 'second_chance' ||
                        freshOrder.isSecondChance === true ||
                        orderId.startsWith('BB-');
                    const isFreshPrivateNegotiation = freshOrder.source === 'private_negotiation';
                    if (isFreshBattleBids || isFreshPrivateNegotiation)
                        return;
                    // Re-evaluate timestamp with fresh order data
                    const freshCreatedAtMs = parseTimestampMillis(freshOrder.createdAt);
                    const freshExpiresAtMs = parseTimestampMillis(freshOrder.expiresAt);
                    const freshServerNowMs = firestore_1.Timestamp.now().toMillis();
                    let stillExpired = false;
                    if (freshCreatedAtMs !== null && freshCreatedAtMs > 0) {
                        stillExpired = (freshServerNowMs - freshCreatedAtMs) >= EXPIRATION_WINDOW_MS;
                    }
                    else if (freshExpiresAtMs !== null && freshExpiresAtMs > 0) {
                        stillExpired = freshServerNowMs >= freshExpiresAtMs;
                    }
                    if (!stillExpired)
                        return;
                    const listingId = freshOrder.listingId;
                    const listingRef = listingId ? db.collection('listings').doc(listingId) : null;
                    const freshListingSnap = listingRef ? await transaction.get(listingRef) : null;
                    // Atomically transition order status to EXPIRED
                    transaction.update(orderRef, {
                        status: 'EXPIRED',
                        updatedAt: firestore_1.FieldValue.serverTimestamp(),
                    });
                    // Atomically restore reserved inventory using exact Standard Marketplace rules
                    if (listingRef && freshListingSnap && freshListingSnap.exists) {
                        const freshListing = freshListingSnap.data();
                        if (freshListing) {
                            const currentQty = freshListing.quantity || 0;
                            const orderQty = freshOrder.quantity || 1;
                            const restoredQty = currentQty + orderQty;
                            const updatePayload = {
                                quantity: restoredQty,
                                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                            };
                            if (freshListing.status === 'BOOKED' || currentQty === 0) {
                                if (freshListing.status !== 'SOLD' &&
                                    freshListing.status !== 'SUSPENDED' &&
                                    freshListing.status !== 'CANCELLED' &&
                                    freshListing.status !== 'EXPIRED') {
                                    updatePayload.status = 'LIVE';
                                    updatePayload.bookedAt = null;
                                }
                            }
                            transaction.update(listingRef, updatePayload);
                        }
                    }
                });
                expiredCount++;
                console.log(`[standardOrderExpiration] Successfully expired order ${orderId} and restored listing stock.`);
            }
            catch (txErr) {
                console.error(`[standardOrderExpiration] Transaction failed for order ${orderId}:`, txErr);
            }
        }
    }
    catch (err) {
        console.error('[standardOrderExpiration] Error during expiration processing:', err);
    }
    console.log(`[standardOrderExpiration] Scan complete. Total: ${processedCount}, Expired: ${expiredCount}, Skipped: ${skippedCount}`);
    return { processed: processedCount, expired: expiredCount, skipped: skippedCount };
}
//# sourceMappingURL=standardOrderExpiration.js.map