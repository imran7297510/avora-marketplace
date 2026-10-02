"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordServerTrustEvent = recordServerTrustEvent;
exports.processCompletedDealScore = processCompletedDealScore;
const firestore_1 = require("firebase-admin/firestore");
const trustScoreTypes_1 = require("./trustScoreTypes");
const trustScoreValidation_1 = require("./trustScoreValidation");
const trustScorePairCap_1 = require("./trustScorePairCap");
const trustScoreMilestones_1 = require("./trustScoreMilestones");
/**
 * Trusted server-side execution engine for Trust Score mutations using Firebase Admin SDK.
 * Executes atomically inside a Firestore transaction.
 */
async function recordServerTrustEvent(db, params) {
    const validation = (0, trustScoreValidation_1.validateTrustEventParams)(params);
    if (!validation.isValid) {
        throw new Error(validation.errorMessage || 'Invalid trust event parameters.');
    }
    const { cleanUserId, cleanEntityId, cleanReason, cleanCreatedBy, deduplicationKey } = validation;
    const { eventType, sourceModule, customDelta, counterpartyId } = params;
    let baseDelta = 0;
    if (eventType === 'ADMIN_MANUAL_ADJUSTMENT') {
        if (typeof customDelta !== 'number' || isNaN(customDelta) || !Number.isFinite(customDelta)) {
            throw new Error('Valid numerical custom delta must be provided for ADMIN_MANUAL_ADJUSTMENT.');
        }
        baseDelta = Math.min(100, Math.max(-100, Math.round(customDelta)));
    }
    else {
        const frozenDelta = trustScoreTypes_1.FROZEN_SCORE_DELTAS[eventType];
        if (frozenDelta === null || frozenDelta === undefined) {
            throw new Error(`Invalid or unmapped score delta for event type: ${eventType}`);
        }
        baseDelta = frozenDelta;
    }
    let pairCapSuppressed = false;
    if ((eventType === 'DEAL_COMPLETED_BUYER' || eventType === 'DEAL_COMPLETED_SELLER') && counterpartyId) {
        const capCheck = await (0, trustScorePairCap_1.checkBuyerSellerPairCap)(db, cleanUserId, counterpartyId);
        if (capCheck.isCapped) {
            pairCapSuppressed = true;
        }
    }
    const actualDelta = pairCapSuppressed ? 0 : baseDelta;
    const eventRef = db.collection('trust_events').doc(deduplicationKey);
    const userRef = db.collection('users').doc(cleanUserId);
    let previousScore = trustScoreTypes_1.INITIAL_TRUST_SCORE;
    let resultingScore = trustScoreTypes_1.INITIAL_TRUST_SCORE;
    let resultingTier = (0, trustScoreTypes_1.calculateTrustTier)(trustScoreTypes_1.INITIAL_TRUST_SCORE);
    try {
        await db.runTransaction(async (transaction) => {
            const eventSnap = await transaction.get(eventRef);
            if (eventSnap.exists) {
                throw new Error(`DUPLICATE_EVENT: Event already recorded for key: ${deduplicationKey}`);
            }
            const userSnap = await transaction.get(userRef);
            let userData = {};
            if (userSnap.exists) {
                userData = userSnap.data() || {};
                previousScore = typeof userData.trustScore === 'number' && Number.isFinite(userData.trustScore)
                    ? (0, trustScoreTypes_1.clampTrustScore)(userData.trustScore)
                    : trustScoreTypes_1.INITIAL_TRUST_SCORE;
            }
            else {
                previousScore = trustScoreTypes_1.INITIAL_TRUST_SCORE;
            }
            resultingScore = (0, trustScoreTypes_1.clampTrustScore)(previousScore + actualDelta);
            resultingTier = (0, trustScoreTypes_1.calculateTrustTier)(resultingScore);
            if (eventType.startsWith('ADMIN_FAULT_')) {
                (0, trustScoreMilestones_1.resetCleanHistoryCount)(transaction, userRef);
            }
            transaction.set(eventRef, {
                id: deduplicationKey,
                deduplicationKey,
                userId: cleanUserId,
                eventType,
                scoreDelta: actualDelta,
                originalDelta: baseDelta,
                previousScore,
                resultingScore,
                relatedEntityId: cleanEntityId,
                sourceModule,
                reason: pairCapSuppressed
                    ? `${cleanReason} [Pair-Cap Active: Score delta suppressed for rolling 30 days]`
                    : cleanReason,
                createdBy: cleanCreatedBy,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                pairCapSuppressed,
                metadata: {
                    counterpartyId: counterpartyId || null,
                    customDelta: customDelta ?? null,
                }
            });
            const userUpdate = {
                trustScore: resultingScore,
                trustTier: resultingTier,
                trustLastUpdated: firestore_1.FieldValue.serverTimestamp(),
            };
            if (userSnap.exists) {
                transaction.update(userRef, userUpdate);
            }
            else {
                transaction.set(userRef, {
                    ...userUpdate,
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        });
        return {
            success: true,
            pairCapSuppressed,
            eventId: deduplicationKey,
            previousScore,
            resultingScore,
            resultingTier,
            scoreDelta: actualDelta
        };
    }
    catch (error) {
        if (error?.message?.includes('DUPLICATE_EVENT')) {
            const userSnap = await userRef.get();
            const currentScore = userSnap.exists ? (0, trustScoreTypes_1.clampTrustScore)(userSnap.data()?.trustScore || 50) : 50;
            return {
                success: true,
                isDuplicate: true,
                eventId: deduplicationKey,
                previousScore: currentScore,
                resultingScore: currentScore,
                resultingTier: (0, trustScoreTypes_1.calculateTrustTier)(currentScore),
                scoreDelta: 0,
                message: `Event already processed for key: ${deduplicationKey}`
            };
        }
        console.error(`Failed to record server trust event for key ${deduplicationKey}:`, error);
        throw error;
    }
}
/**
 * Automates positive deal completion scoring for both Buyer (+2) and Seller (+3) atomically on deal finality.
 */
async function processCompletedDealScore(db, orderData) {
    const { orderId, buyerId, sellerId, listingId, listingTitle } = orderData;
    if (!buyerId || !sellerId || !orderId) {
        throw new Error('Invalid order payload: buyerId, sellerId, and orderId are required.');
    }
    const canonicalEntityId = listingId ? `LISTING_${listingId}` : orderId;
    const cleanTitle = listingTitle ? ` for "${listingTitle}"` : '';
    const buyerResult = await recordServerTrustEvent(db, {
        userId: buyerId,
        eventType: 'DEAL_COMPLETED_BUYER',
        relatedEntityId: canonicalEntityId,
        sourceModule: 'MARKETPLACE',
        reason: `Trade completed successfully as buyer${cleanTitle}.`,
        createdBy: 'SERVER_AUTOMATED_ENGINE',
        counterpartyId: sellerId
    });
    const sellerResult = await recordServerTrustEvent(db, {
        userId: sellerId,
        eventType: 'DEAL_COMPLETED_SELLER',
        relatedEntityId: canonicalEntityId,
        sourceModule: 'MARKETPLACE',
        reason: `Trade completed successfully as seller${cleanTitle}.`,
        createdBy: 'SERVER_AUTOMATED_ENGINE',
        counterpartyId: buyerId
    });
    try {
        if (!buyerResult.isDuplicate && !buyerResult.pairCapSuppressed && buyerResult.scoreDelta > 0) {
            const buyerRef = db.collection('users').doc(buyerId);
            const buyerSnap = await buyerRef.get();
            if (buyerSnap.exists) {
                await db.runTransaction(async (transaction) => {
                    const snap = await transaction.get(buyerRef);
                    if (snap.exists) {
                        await (0, trustScoreMilestones_1.processCleanHistoryProgress)(db, transaction, buyerId, buyerRef, snap.data() || {});
                    }
                });
            }
        }
        if (!sellerResult.isDuplicate && !sellerResult.pairCapSuppressed && sellerResult.scoreDelta > 0) {
            const sellerRef = db.collection('users').doc(sellerId);
            const sellerSnap = await sellerRef.get();
            if (sellerSnap.exists) {
                await db.runTransaction(async (transaction) => {
                    const snap = await transaction.get(sellerRef);
                    if (snap.exists) {
                        await (0, trustScoreMilestones_1.processCleanHistoryProgress)(db, transaction, sellerId, sellerRef, snap.data() || {});
                    }
                });
            }
        }
    }
    catch (milestoneErr) {
        console.error('Error processing clean history milestone:', milestoneErr);
    }
    return { buyerResult, sellerResult };
}
//# sourceMappingURL=trustScoreBackend.js.map