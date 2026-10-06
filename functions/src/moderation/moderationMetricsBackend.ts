import { getFirestore, FieldValue, Transaction, DocumentReference } from 'firebase-admin/firestore';

export interface ModerationMetricsDoc {
  allReportsCount: number;
  availableReportsCount: number;
  pendingReportsCount: number;
  resolvedReportsCount: number;
  dismissedReportsCount: number;
  lastUpdated?: any;
}

export const MODERATION_METRICS_PATH = 'system_metrics';
export const MODERATION_METRICS_DOC_ID = 'moderation';

export const getModerationMetricsRef = (): DocumentReference => {
  const db = getFirestore('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');
  return db.collection(MODERATION_METRICS_PATH).doc(MODERATION_METRICS_DOC_ID);
};

export interface RetentionDecrementCounts {
  resolvedCount: number;
  dismissedCount: number;
}

/**
 * Validates whether the current metrics document has sufficient counters to apply
 * the requested retention decrements without any counter falling below zero.
 */
export function validateRetentionDecrementSufficiency(
  currentMetrics: ModerationMetricsDoc,
  counts: RetentionDecrementCounts
): { sufficient: boolean; reason?: string } {
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
export function applyRetentionMetricDecrements(
  transaction: Transaction,
  metricsRef: DocumentReference,
  currentMetrics: ModerationMetricsDoc,
  counts: RetentionDecrementCounts
): void {
  const totalToDelete = counts.resolvedCount + counts.dismissedCount;
  if (totalToDelete === 0) {
    return;
  }

  const check = validateRetentionDecrementSufficiency(currentMetrics, counts);
  if (!check.sufficient) {
    throw new Error(
      `[CRITICAL_METRIC_UNDERFLOW]: Cannot decrement moderation metrics: ${check.reason}. Aborting transaction to prevent negative counters.`
    );
  }

  const updatePayload: Record<string, any> = {
    availableReportsCount: FieldValue.increment(-totalToDelete),
    lastUpdated: FieldValue.serverTimestamp()
  };

  if (counts.resolvedCount > 0) {
    updatePayload.resolvedReportsCount = FieldValue.increment(-counts.resolvedCount);
  }
  if (counts.dismissedCount > 0) {
    updatePayload.dismissedReportsCount = FieldValue.increment(-counts.dismissedCount);
  }

  transaction.update(metricsRef, updatePayload);
}
