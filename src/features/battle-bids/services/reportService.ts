import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  limit,
  getDocs,
  increment
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import { ArenaReport, ReportReason, ReportStatus, ReportTargetType } from '../types';
import { RiskScoreService } from './riskScoreService';
import { parseSafeDate } from '../utils/arena';
import { isUserBanned } from '../../../services/userService';
import { moderationMetricsService } from '../../../services/moderationMetricsService';

export const ReportService = {
  /**
   * Submits a new report.
   */
  async submitReport(
    reporterId: string,
    targetId: string,
    targetType: ReportTargetType,
    reason: ReportReason,
    description: string,
    targetOwnerId?: string
  ): Promise<string> {
    try {
      // Prevent reporting own items / offers
      if (targetOwnerId && (
        targetOwnerId === reporterId ||
        (reporterId === 'simulated-seller' && targetOwnerId === 'seller') ||
        (reporterId === 'simulated-buyer' && targetOwnerId === 'buyer') ||
        targetOwnerId === 'me'
      )) {
        throw new Error('Action denied: You cannot report your own submitted offer or item.');
      }

      return await runTransaction(db, async (transaction) => {
        // 0. Check if reporter user is blocked or banned
        const reporterRef = doc(db, 'users', reporterId);
        const reporterSnap = await transaction.get(reporterRef);
        if (reporterSnap.exists()) {
          const repData = reporterSnap.data();
          if (
            repData?.isBlocked === true || 
            repData?.status === 'BLOCKED' || 
            repData?.accountStatus === 'blocked' || 
            isUserBanned(repData) ||
            repData?.canReport === false || 
            repData?.reportingDisabled === true
          ) {
            throw new Error('Action denied: Your account is restricted by administration. You are not allowed to submit reports.');
          }
        }

        // 1. Check for duplicate report (one report per user per target)
        const reportId = `${reporterId}_${targetId}`;
        const reportRef = doc(db, 'arena_reports', reportId);
        const reportSnap = await transaction.get(reportRef);

        if (reportSnap.exists()) {
          throw new Error('You have already reported this item.');
        }

        // 2. Read Risk Score reference FIRST (before any write operations)
        const riskRef = doc(db, 'arena_risk_scores', targetId);
        const riskSnap = await transaction.get(riskRef);

        // 3. Create report (Write 1)
        const newReport: Partial<ArenaReport> = {
          reporterId,
          targetId,
          targetType,
          reason,
          description,
          status: ReportStatus.PENDING,
        };

        transaction.set(reportRef, {
          ...newReport,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // 4. Update Risk Score (Write 2)
        const riskTargetType = targetType === 'listing' ? 'listing' : targetType === 'user' ? 'user' : 'negotiation';
        if (!riskSnap.exists()) {
          transaction.set(riskRef, {
            targetId,
            targetType: riskTargetType,
            score: 1,
            lastReportedAt: serverTimestamp()
          });
        } else {
          transaction.update(riskRef, {
            score: increment(1),
            lastReportedAt: serverTimestamp()
          });
        }

        // 5. Update Moderation Metrics (Write 3, excluded for user targetType)
        if (targetType === 'listing' || targetType === 'negotiation') {
          const metricsRef = doc(db, 'system_metrics', 'moderation');
          transaction.set(metricsRef, {
            allReportsCount: increment(1),
            availableReportsCount: increment(1),
            pendingReportsCount: increment(1),
            lastUpdated: serverTimestamp()
          }, { merge: true });
        }

        moderationMetricsService.clearCache();
        return reportId;
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'arena_reports');
      throw err;
    }
  },

  /**
   * Subscribes to reports submitted by a specific user.
   */
  subscribeToUserReports(userId: string, callback: (reports: ArenaReport[]) => void) {
    const q = query(
      collection(db, 'arena_reports'),
      where('reporterId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          ...data,
          id: docSnap.id,
          createdAt: parseSafeDate(data.createdAt),
          updatedAt: parseSafeDate(data.updatedAt)
        } as ArenaReport;
      });
      callback(reports);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'arena_reports');
    });
  }
};
