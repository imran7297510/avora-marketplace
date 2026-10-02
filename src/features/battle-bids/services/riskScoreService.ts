import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';

export const RiskScoreService = {
  /**
   * Internally increases risk score for a target.
   * This is called automatically when a report is submitted.
   */
  async increaseRiskScore(
    transaction: any, 
    targetId: string, 
    targetType: 'user' | 'listing' | 'negotiation',
    incrementValue: number = 1
  ) {
    const riskRef = doc(db, 'arena_risk_scores', targetId);
    const riskSnap = await transaction.get(riskRef);

    if (!riskSnap.exists()) {
      transaction.set(riskRef, {
        targetId,
        targetType,
        score: incrementValue,
        lastReportedAt: serverTimestamp()
      });
    } else {
      transaction.update(riskRef, {
        score: increment(incrementValue),
        lastReportedAt: serverTimestamp()
      });
    }
  }
};
