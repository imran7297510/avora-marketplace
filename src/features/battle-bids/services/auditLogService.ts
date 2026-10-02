import { 
  collection, 
  doc, 
  setDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  Timestamp,
  addDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import { ModerationAuditLog, ModerationActionType, ReportTargetType } from '../types';
import { parseSafeDate } from '../utils/arena';

export const AuditLogService = {
  /**
   * Creates an immutable audit record for general or system actions.
   */
  async logAction(params: {
    userId: string;
    actionType: string;
    targetId: string;
    targetType: string;
    reason: string;
    previousState?: string;
    newState?: string;
    metadata?: any;
  }) {
    try {
      const auditRef = collection(db, 'arena_audit_logs');
      await addDoc(auditRef, {
        userId: params.userId,
        action: params.actionType,
        targetType: params.targetType,
        targetId: params.targetId,
        previousState: params.previousState || '',
        newState: params.newState || '',
        reason: params.reason,
        metadata: params.metadata || {},
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.warn('Failed to write audit log:', err);
    }
  },

  /**
   * Creates an immutable audit record for a moderation action.
   */
  async createAuditLog(
    transaction: any,
    moderatorId: string,
    action: ModerationActionType,
    targetType: ReportTargetType,
    targetId: string,
    previousState: string,
    newState: string,
    reason: string,
    relatedReportIds: string[]
  ) {
    const auditRef = doc(collection(db, 'arena_audit_logs'));
    transaction.set(auditRef, {
      userId: moderatorId,
      moderatorId,
      action,
      targetType,
      targetId,
      previousState,
      newState,
      reason,
      relatedReportIds: relatedReportIds || [],
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp()
    });
  },

  /**
   * Subscribes to audit logs for a specific target.
   */
  subscribeToTargetLogs(targetId: string, callback: (logs: ModerationAuditLog[]) => void) {
    const q = query(
      collection(db, 'arena_audit_logs'),
      where('targetId', '==', targetId),
      orderBy('timestamp', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          ...data,
          id: docSnap.id,
          timestamp: parseSafeDate(data.timestamp)
        } as ModerationAuditLog;
      });
      callback(logs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'arena_audit_logs');
    });
  },

  /**
   * Subscribes to recent audit logs.
   */
  subscribeToRecentLogs(limit: number = 20, callback: (logs: ModerationAuditLog[]) => void) {
    const q = query(
      collection(db, 'arena_audit_logs'),
      orderBy('timestamp', 'desc')
      // Firestore onSnapshot with limit can be tricky if data is changing rapidly
    );

    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.slice(0, limit).map(docSnap => {
        const data = docSnap.data();
        return {
          ...data,
          id: docSnap.id,
          timestamp: parseSafeDate(data.timestamp)
        } as ModerationAuditLog;
      });
      callback(logs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'arena_audit_logs');
    });
  }
};
