"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModerationMetricsRef = exports.MODERATION_METRICS_DOC_ID = exports.MODERATION_METRICS_PATH = void 0;
exports.validateRetentionDecrementSufficiency = validateRetentionDecrementSufficiency;
exports.applyRetentionMetricDecrements = applyRetentionMetricDecrements;
const firestore_1 = require("firebase-admin/firestore");
exports.MODERATION_METRICS_PATH = 'system_metrics';
exports.MODERATION_METRICS_DOC_ID = 'moderation';
const getModerationMetricsRef = () => {
    const db = (0, firestore_1.getFirestore)('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');
    return db.collection(exports.MODERATION_METRICS_PATH).doc(exports.MODERATION_METRICS_DOC_ID);
};
exports.getModerationMetricsRef = getModerationMetricsRef;
/**
 * Validates whether the current metrics document has sufficient counters to apply
 * the requested retention decrements without any counter falling below zero.
 */
function validateRetentionDecrementSufficiency(currentMetrics, counts) {
    const totalToDelete = counts.resolvedCount + counts.dismissedCount;
    if (totalToDelete === 0) {
        return { sufficient: true };
    }
    const available = currentMetrics.availableReportsCount ?? 0;
    const resolved = currentMetrics.resolvedReportsCount ?? 0;
    const dismissed = currentMetrics.dismissedReportsCount ?? 0;
    if (available < totalToDelete) {
        return {
            sufficient: false,
            reason: `availableReportsCount (${available}) is less than total requested decrement (${totalToDelete})`
        };
    }
    if (resolved < counts.resolvedCount) {
        return {
            sufficient: false,
            reason: `resolvedReportsCount (${resolved}) is less than resolved decrement (${counts.resolvedCount})`
        };
    }
    if (dismissed < counts.dismissedCount) {
        return {
            sufficient: false,
            reason: `dismissedReportsCount (${dismissed}) is less than dismissed decrement (${counts.dismissedCount})`
        };
    }
    return { sufficient: true };
}
/**
 * Atomically decrements the moderation metrics for deleted retention reports.
 * MUST be executed in the SAME Firestore transaction that deletes the report documents.
 *
 * Invariant preservation:
 * - availableReportsCount decreases by (resolvedCount + dismissedCount)
 * - resolvedReportsCount decreases by resolvedCount
 * - dismissedReportsCount decreases by dismissedCount
 * - allReportsCount is NEVER modified (lifetime counter)
 * - pendingReportsCount is NEVER modified
 * - lastUpdated is updated with server timestamp
 */
function applyRetentionMetricDecrements(transaction, metricsRef, currentMetrics, counts) {
    const totalToDelete = counts.resolvedCount + counts.dismissedCount;
    if (totalToDelete === 0) {
        return;
    }
    const check = validateRetentionDecrementSufficiency(currentMetrics, counts);
    if (!check.sufficient) {
        throw new Error(`[CRITICAL_METRIC_UNDERFLOW]: Cannot decrement moderation metrics: ${check.reason}. Aborting transaction to prevent negative counters.`);
    }
    const updatePayload = {
        availableReportsCount: firestore_1.FieldValue.increment(-totalToDelete),
        lastUpdated: firestore_1.FieldValue.serverTimestamp()
    };
    if (counts.resolvedCount > 0) {
        updatePayload.resolvedReportsCount = firestore_1.FieldValue.increment(-counts.resolvedCount);
    }
    if (counts.dismissedCount > 0) {
        updatePayload.dismissedReportsCount = firestore_1.FieldValue.increment(-counts.dismissedCount);
    }
    transaction.update(metricsRef, updatePayload);
}
//# sourceMappingURL=moderationMetricsBackend.js.map