"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settleExpiredBattleBidsAuctionsServer = settleExpiredBattleBidsAuctionsServer;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const secondChanceServer_1 = require("./secondChanceServer");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
/**
 * Master named Firestore database instance target
 * Target: treasure-hub-pk / ai-studio-c5cea893-acec-4774-a11a-e26679ae7862
 */
const db = (0, firestore_1.getFirestore)('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');
const BATTLE_BIDS_PAYMENT_DEADLINE_HOURS = 48;
/**
 * Helper to extract milliseconds from Firestore timestamp / date / number representations safely.
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
 * Server-authoritative worker for Battle Bids auction settlement.
 * Scans active auctions past their endTime, evaluates reserve prices,
 * resolves authoritative seller UIDs (including anonymous sellers via private/seller),
 * and idempotently creates canonical BB-${auctionId} orders.
 */
async function settleExpiredBattleBidsAuctionsServer() {
    console.log('[auctionSettlementServer] Starting server-authoritative settlement scan...');
    let processed = 0;
    let sold = 0;
    let ended = 0;
    let reserveNotMet = 0;
    let skipped = 0;
    try {
        const nowMs = Date.now();
        // Query active auctions
        const auctionsSnap = await db.collection('arena_auctions')
            .where('status', '==', 'active')
            .limit(50)
            .get();
        processed = auctionsSnap.docs.length;
        if (auctionsSnap.empty) {
            console.log('[auctionSettlementServer] No active auctions found for settlement.');
            return { processed: 0, sold: 0, ended: 0, reserveNotMet: 0, skipped: 0 };
        }
        for (const docSnap of auctionsSnap.docs) {
            const auctionData = docSnap.data();
            const auctionId = docSnap.id;
            // Skip Private Negotiations (handled by negotiation service & triggers)
            if (auctionData.isNegotiationOnly === true) {
                skipped++;
                continue;
            }
            const endTimeMs = parseTimestampMillis(auctionData.endTime);
            if (endTimeMs === null || endTimeMs > nowMs) {
                // Auction has not reached its end time yet
                skipped++;
                continue;
            }
            // Execute atomic settlement transaction
            try {
                await db.runTransaction(async (transaction) => {
                    const auctionRef = db.collection('arena_auctions').doc(auctionId);
                    const freshAuctionSnap = await transaction.get(auctionRef);
                    if (!freshAuctionSnap.exists)
                        return;
                    const freshData = freshAuctionSnap.data();
                    if (!freshData || freshData.status !== 'active')
                        return;
                    const freshEndTimeMs = parseTimestampMillis(freshData.endTime);
                    const freshNowMs = Date.now();
                    if (freshEndTimeMs === null || freshEndTimeMs > freshNowMs)
                        return;
                    let finalStatus = 'ended';
                    const bidsCount = typeof freshData.bidsCount === 'number' ? freshData.bidsCount : 0;
                    const currentBid = typeof freshData.currentBid === 'number' ? freshData.currentBid : 0;
                    const highestBidderId = freshData.highestBidderId;
                    const reservePrice = typeof freshData.reservePrice === 'number' ? freshData.reservePrice : null;
                    if (bidsCount > 0 && highestBidderId && typeof highestBidderId === 'string' && highestBidderId.trim().length > 0) {
                        if (reservePrice && currentBid < reservePrice) {
                            finalStatus = 'reserve-not-met';
                        }
                        else {
                            finalStatus = 'sold';
                        }
                    }
                    if (finalStatus === 'sold' && highestBidderId) {
                        // Authoritatively resolve seller UID
                        const rawSellerId = typeof freshData.sellerId === 'string' ? freshData.sellerId.trim() : '';
                        const authoritativeSellerUid = await (0, secondChanceServer_1.resolveAuthoritativeSellerUidServer)(auctionId, rawSellerId);
                        if (!authoritativeSellerUid) {
                            console.error(`[auctionSettlementServer] Refusing to settle auction ${auctionId}: unable to resolve authoritative seller UID. Failing closed.`);
                            return;
                        }
                        const orderId = `BB-${auctionId}`;
                        const orderRef = db.collection('orders').doc(orderId);
                        const existingOrderSnap = await transaction.get(orderRef);
                        if (!existingOrderSnap.exists) {
                            const primaryImage = (Array.isArray(freshData.images) && freshData.images.length > 0 ? freshData.images[0] : '') || freshData.imageUrl || '';
                            const sellerEmail = freshData.sellerEmail || freshData.contactEmail || '';
                            const paymentDeadlineMs = freshNowMs + BATTLE_BIDS_PAYMENT_DEADLINE_HOURS * 3600 * 1000;
                            transaction.set(orderRef, {
                                id: orderId,
                                source: 'battle_bids',
                                auctionId: auctionId,
                                listingId: auctionId,
                                itemTitle: freshData.title || 'Battle Bids Item',
                                itemImage: primaryImage,
                                sellerId: authoritativeSellerUid,
                                sellerName: freshData.sellerName || 'Verified Seller',
                                sellerEmail: sellerEmail,
                                buyerId: highestBidderId.trim(),
                                buyerName: freshData.highestBidderName || 'Winning Bidder',
                                amount: currentBid,
                                currency: freshData.currency || 'PKR',
                                currencySymbol: freshData.currencySymbol || 'Rs.',
                                status: 'AWAITING_PAYMENT',
                                paymentDeadline: firestore_1.Timestamp.fromDate(new Date(paymentDeadlineMs)),
                                createdAt: firestore_1.FieldValue.serverTimestamp(),
                                updatedAt: firestore_1.FieldValue.serverTimestamp()
                            });
                        }
                        // Update Auction Document to sold
                        transaction.update(auctionRef, {
                            status: 'sold',
                            orderId: orderId,
                            soldAt: firestore_1.FieldValue.serverTimestamp(),
                            updatedAt: firestore_1.FieldValue.serverTimestamp()
                        });
                        sold++;
                    }
                    else {
                        // Unsold or reserve not met
                        transaction.update(auctionRef, {
                            status: finalStatus,
                            updatedAt: firestore_1.FieldValue.serverTimestamp()
                        });
                        if (finalStatus === 'reserve-not-met') {
                            reserveNotMet++;
                        }
                        else {
                            ended++;
                        }
                    }
                });
            }
            catch (txErr) {
                console.error(`[auctionSettlementServer] Error settling auction ${auctionId}:`, txErr);
            }
        }
    }
    catch (err) {
        console.error('[auctionSettlementServer] Terminal error in settlement scan:', err);
    }
    return { processed, sold, ended, reserveNotMet, skipped };
}
//# sourceMappingURL=auctionSettlementServer.js.map