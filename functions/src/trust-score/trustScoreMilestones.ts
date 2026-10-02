import { Firestore, Transaction, DocumentReference, DocumentData, FieldValue } from 'firebase-admin/firestore';
import { 
  CLEAN_HISTORY_INTERVAL, 
  CLEAN_HISTORY_DELTA, 
  calculateTrustTier, 
  clampTrustScore 
} from './trustScoreTypes';

export interface MilestoneResult {
  milestoneTriggered: boolean;
  sequenceNumber?: number;
  newConsecutiveCount: number;
  scoreAwarded?: number;
}

/**
 * Updates a user's clean consecutive completed deal count and awards +5 milestone if reached 10, 20, 30...
 */
export async function processCleanHistoryProgress(
  db: Firestore,
  transaction: Transaction,
  userId: string,
  userRef: DocumentReference,
  userData: DocumentData
): Promise<MilestoneResult> {
  const currentCount = (userData.cleanConsecutiveDealsCount || 0) + 1;
  let milestoneTriggered = false;
  let sequenceNumber = 0;
  let scoreAwarded = 0;

  if (currentCount > 0 && currentCount % CLEAN_HISTORY_INTERVAL === 0) {
    milestoneTriggered = true;
    sequenceNumber = currentCount;
    scoreAwarded = CLEAN_HISTORY_DELTA;

    const deduplicationKey = `CLEAN_HISTORY_MILESTONE_${userId}_seq_${sequenceNumber}`;
    const eventRef = db.collection('trust_events').doc(deduplicationKey);
    const eventSnap = await transaction.get(eventRef);

    if (!eventSnap.exists) {
      const prevScore = clampTrustScore(userData.trustScore || 50);
      const resultingScore = clampTrustScore(prevScore + CLEAN_HISTORY_DELTA);
      const resultingTier = calculateTrustTier(resultingScore);

      transaction.set(eventRef, {
        id: deduplicationKey,
        deduplicationKey,
        userId,
        eventType: 'CLEAN_HISTORY_MILESTONE',
        scoreDelta: CLEAN_HISTORY_DELTA,
        previousScore: prevScore,
        resultingScore,
        relatedEntityId: `MILESTONE_SEQ_${sequenceNumber}`,
        sourceModule: 'MARKETPLACE',
        reason: `Clean History Milestone reached: ${sequenceNumber} consecutive completed deals without fault.`,
        createdBy: 'SERVER_MILESTONE_ENGINE',
        createdAt: FieldValue.serverTimestamp(),
        metadata: { sequenceNumber }
      });

      transaction.update(userRef, {
        trustScore: resultingScore,
        trustTier: resultingTier,
        cleanConsecutiveDealsCount: currentCount,
        trustLastUpdated: FieldValue.serverTimestamp()
      });
    } else {
      transaction.update(userRef, {
        cleanConsecutiveDealsCount: currentCount,
        trustLastUpdated: FieldValue.serverTimestamp()
      });
    }
  } else {
    transaction.update(userRef, {
      cleanConsecutiveDealsCount: currentCount,
      trustLastUpdated: FieldValue.serverTimestamp()
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
export function resetCleanHistoryCount(
  transaction: Transaction,
  userRef: DocumentReference
): void {
  transaction.update(userRef, {
    cleanConsecutiveDealsCount: 0,
    trustLastUpdated: FieldValue.serverTimestamp()
  });
}
