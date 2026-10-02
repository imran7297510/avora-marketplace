"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCleanHistoryProgress = processCleanHistoryProgress;
exports.resetCleanHistoryCount = resetCleanHistoryCount;
const firestore_1 = require("firebase-admin/firestore");
const trustScoreTypes_1 = require("./trustScoreTypes");
/**
 * Updates a user's clean consecutive completed deal count and awards +5 milestone if reached 10, 20, 30...
 */
async function processCleanHistoryProgress(db, transaction, userId, userRef, userData) {
    const currentCount = (userData.cleanConsecutiveDealsCount || 0) + 1;
    let milestoneTriggered = false;
    let sequenceNumber = 0;
    let scoreAwarded = 0;
    if (currentCount > 0 && currentCount % trustScoreTypes_1.CLEAN_HISTORY_INTERVAL === 0) {
        milestoneTriggered = true;
        sequenceNumber = currentCount;
        scoreAwarded = trustScoreTypes_1.CLEAN_HISTORY_DELTA;
        const deduplicationKey = `CLEAN_HISTORY_MILESTONE_${userId}_seq_${sequenceNumber}`;
        const eventRef = db.collection('trust_events').doc(deduplicationKey);
        const eventSnap = await transaction.get(eventRef);
        if (!eventSnap.exists) {
            const prevScore = (0, trustScoreTypes_1.clampTrustScore)(userData.trustScore || 50);
            const resultingScore = (0, trustScoreTypes_1.clampTrustScore)(prevScore + trustScoreTypes_1.CLEAN_HISTORY_DELTA);
            const resultingTier = (0, trustScoreTypes_1.calculateTrustTier)(resultingScore);
            transaction.set(eventRef, {
                id: deduplicationKey,
                deduplicationKey,
                userId,
                eventType: 'CLEAN_HISTORY_MILESTONE',
                scoreDelta: trustScoreTypes_1.CLEAN_HISTORY_DELTA,
                previousScore: prevScore,
                resultingScore,
                relatedEntityId: `MILESTONE_SEQ_${sequenceNumber}`,
                sourceModule: 'MARKETPLACE',
                reason: `Clean History Milestone reached: ${sequenceNumber} consecutive completed deals without fault.`,
                createdBy: 'SERVER_MILESTONE_ENGINE',
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                metadata: { sequenceNumber }
            });
            transaction.update(userRef, {
                trustScore: resultingScore,
                trustTier: resultingTier,
                cleanConsecutiveDealsCount: currentCount,
                trustLastUpdated: firestore_1.FieldValue.serverTimestamp()
            });
        }
        else {
            transaction.update(userRef, {
                cleanConsecutiveDealsCount: currentCount,
                trustLastUpdated: firestore_1.FieldValue.serverTimestamp()
            });
        }
    }
    else {
        transaction.update(userRef, {
            cleanConsecutiveDealsCount: currentCount,
            trustLastUpdated: firestore_1.FieldValue.serverTimestamp()
        });
    }
    return {
        milestoneTriggered,
        sequenceNumber,
        newConsecutiveCount: currentCount,
        scoreAwarded
    };
}
/**
 * Resets a user's clean consecutive completed deal count to 0 upon an Admin Fault Event.
 */
function resetCleanHistoryCount(transaction, userRef) {
    transaction.update(userRef, {
        cleanConsecutiveDealsCount: 0,
        trustLastUpdated: firestore_1.FieldValue.serverTimestamp()
    });
}
//# sourceMappingURL=trustScoreMilestones.js.map