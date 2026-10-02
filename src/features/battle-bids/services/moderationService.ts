import { 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  runTransaction,
  serverTimestamp,
  Timestamp,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import { 
  ArenaReport, 
  ReportStatus, 
  ModerationActionType, 
  ModerationStatus,
  ReportTargetType,
  RiskScore
} from '../types';
import { AuditLogService } from './auditLogService';
import { parseSafeDate } from '../utils/arena';
import { moderationMetricsService } from '../../../services/moderationMetricsService';

export const ModerationService = {
  /**
   * Subscribes to pending reports for the admin dashboard.
   */
  subscribeToPendingReports(callback: (reports: ArenaReport[]) => void) {
    const q = query(
      collection(db, 'arena_reports'),
      where('status', '==', ReportStatus.PENDING),
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
  },

  /**
   * Subscribes to all reports with optional filters.
   */
  subscribeToReports(filters: { status?: ReportStatus, targetType?: ReportTargetType }, callback: (reports: ArenaReport[]) => void) {
    let q = query(collection(db, 'arena_reports'), orderBy('createdAt', 'desc'));
    
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }
    if (filters.targetType) {
      q = query(q, where('targetType', '==', filters.targetType));
    }

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
  },

  /**
   * Subscribes to high-risk targets.
   */
  subscribeToRiskScores(callback: (scores: RiskScore[]) => void) {
    const q = query(
      collection(db, 'arena_risk_scores'),
      orderBy('score', 'desc'),
      limit(50)
    );

    return onSnapshot(q, (snapshot) => {
      const scores = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          ...data,
          lastReportedAt: parseSafeDate(data.lastReportedAt)
        } as RiskScore;
      });
      callback(scores);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'arena_risk_scores');
    });
  },

  /**
   * Executes a moderation action atomically.
   */
  async executeModerationAction(
    moderatorId: string,
    action: ModerationActionType,
    targetType: ReportTargetType,
    targetId: string,
    reason: string,
    relatedReportIds: string[] = []
  ) {
    try {
      await runTransaction(db, async (transaction) => {
        // 1. Get target current state
        const targetCollection = targetType === 'listing' ? 'arena_auctions' : targetType === 'user' ? 'users' : 'arena_negotiations';
        const targetRef = doc(db, targetCollection, targetId);
        const targetSnap = await transaction.get(targetRef);
        
        let previousState = 'active';
        let targetData: any = {};

        if (!targetSnap.exists()) {
          // Graceful fallback for mock or newly referenced targets
          if (targetType === 'user') {
            previousState = 'active';
          } else if (targetType === 'listing') {
            previousState = 'active';
          }
        } else {
          targetData = targetSnap.data();
          previousState = targetData.moderationStatus || targetData.status || 'active';
        }

        // 2. Determine new state based on action
        let newState = previousState;
        const updateData: any = { updatedAt: serverTimestamp() };

        let isDeleteOperation = false;

        switch (action) {
          case ModerationActionType.ISSUE_WARNING:
            newState = ModerationStatus.WARNING_ISSUED;
            updateData.warningMessage = reason;
            updateData.warnedAt = serverTimestamp();
            break;
          case ModerationActionType.REMOVE_LISTING:
            newState = ModerationStatus.HIDDEN;
            isDeleteOperation = true;
            break;
          case ModerationActionType.HIDE_LISTING:
            newState = ModerationStatus.HIDDEN;
            updateData.status = 'ended'; // Stop showing in active lists
            updateData.isDeleted = true;
            updateData.removedAt = serverTimestamp();
            updateData.removalReason = reason;
            break;
          case ModerationActionType.RESTORE_LISTING:
            newState = ModerationStatus.RESTORED;
            updateData.status = 'active';
            updateData.isDeleted = false;
            break;
          case ModerationActionType.SUSPEND_ACCOUNT:
            newState = ModerationStatus.SUSPENDED;
            updateData.isBlocked = true;
            updateData.blockedAt = serverTimestamp();
            break;
          case ModerationActionType.BAN_ACCOUNT:
            newState = ModerationStatus.BANNED;
            updateData.isBlocked = true;
            updateData.blockedAt = serverTimestamp();
            break;
          case ModerationActionType.UNBAN_ACCOUNT:
            newState = ModerationStatus.RESTORED;
            updateData.isBlocked = false;
            updateData.unblockedAt = serverTimestamp();
            break;
          case ModerationActionType.PAUSE_AUCTION:
            if (targetData?.forceStopped || targetData?.isForceStopped || targetData?.forceStoppedByAdmin || targetData?.closedOnViolation || targetData?.status === 'stopped' || targetData?.status === 'force_stopped') {
              throw new Error("Action denied: Force stopped items cannot be restored or resumed.");
            }
            newState = ModerationStatus.PAUSED;
            updateData.status = 'paused';
            updateData.isPaused = true;
            updateData.isPausedByAdmin = true;
            updateData.pausedAt = serverTimestamp();
            if (targetType === 'listing' && targetData) {
              const now = Date.now();
              const endSafe = parseSafeDate(targetData.endTime);
              const endTimeMs = endSafe ? endSafe.getTime() : now;
              const remainingTimeMs = Math.max(0, endTimeMs - now);
              updateData.pausedRemainingTimeMs = remainingTimeMs;
              updateData.remainingDurationMs = remainingTimeMs;
            }
            break;
          case ModerationActionType.RESUME_AUCTION:
            if (targetData?.forceStopped || targetData?.isForceStopped || targetData?.forceStoppedByAdmin || targetData?.closedOnViolation || targetData?.status === 'stopped' || targetData?.status === 'force_stopped') {
              throw new Error("Action denied: Force stopped items cannot be restored or resumed.");
            }
            newState = ModerationStatus.ACTIVE;
            updateData.status = 'active';
            updateData.isPaused = false;
            updateData.isPausedBySeller = false;
            updateData.isPausedByAdmin = false;
            updateData.resumedAt = serverTimestamp();
            updateData.pausedAt = null;
            if (targetType === 'listing' && targetData) {
              const now = Date.now();
              let remainingMs = targetData.pausedRemainingTimeMs ?? targetData.remainingDurationMs;
              if (typeof remainingMs !== 'number' || isNaN(remainingMs) || remainingMs <= 0) {
                const oldEnd = parseSafeDate(targetData.endTime);
                const oldPaused = parseSafeDate(targetData.pausedAt);
                if (oldEnd && oldPaused) {
                  remainingMs = Math.max(0, oldEnd.getTime() - oldPaused.getTime());
                } else if (oldEnd) {
                  remainingMs = Math.max(0, oldEnd.getTime() - now);
                } else {
                  remainingMs = (targetData.durationDays || 3) * 24 * 60 * 60 * 1000;
                }
              }
              const newEndTime = new Date(now + Math.max(1000, remainingMs));
              updateData.endTime = Timestamp.fromDate(newEndTime);
              updateData.pausedRemainingTimeMs = null;
              updateData.remainingDurationMs = null;
              if (targetData.hasFeaturedBadge && targetData.featuredUntil) {
                updateData.featuredUntil = Timestamp.fromDate(newEndTime);
              }
              if (targetData.hasBoostedBadge && targetData.boostedUntil) {
                updateData.boostedUntil = Timestamp.fromDate(newEndTime);
              }
            }
            break;
          case ModerationActionType.CANCEL_AUCTION:
          case ModerationActionType.STOP_BIDDING:
            newState = ModerationStatus.RESTRICTED;
            updateData.status = 'stopped';
            updateData.canBid = false;
            updateData.forceStopped = true;
            updateData.isForceStopped = true;
            updateData.forceStoppedByAdmin = true;
            updateData.closedOnViolation = true;
            updateData.stoppedAt = serverTimestamp();
            updateData.forceStoppedReason = reason || "Violating policies by seller";
            break;
          case ModerationActionType.RESTORE_BIDDING:
          case ModerationActionType.RESTORE_LISTING:
            if (targetData?.forceStopped || targetData?.isForceStopped || targetData?.forceStoppedByAdmin || targetData?.closedOnViolation || targetData?.status === 'stopped' || targetData?.status === 'force_stopped') {
              throw new Error("Action denied: Force stopped items cannot be restored or resumed.");
            }
            newState = ModerationStatus.ACTIVE;
            updateData.status = 'active';
            updateData.canBid = true;
            break;
          case ModerationActionType.RESTRICT_NEGOTIATIONS:
            newState = ModerationStatus.RESTRICTED;
            updateData.status = 'paused';
            break;
          case ModerationActionType.RESTORE_NEGOTIATIONS:
            if (targetData?.forceStopped || targetData?.isForceStopped || targetData?.forceStoppedByAdmin || targetData?.closedOnViolation || targetData?.status === 'stopped' || targetData?.status === 'force_stopped') {
              throw new Error("Action denied: Force stopped items cannot be restored or resumed.");
            }
            newState = ModerationStatus.ACTIVE;
            updateData.status = 'active';
            break;
        }

        updateData.moderationStatus = newState;

        // 3. Update or Set Target
        if (isDeleteOperation) {
          if (targetSnap.exists()) {
            transaction.delete(targetRef);
          }
        } else if (!targetSnap.exists()) {
          transaction.set(targetRef, {
            id: targetId,
            createdAt: serverTimestamp(),
            ...updateData
          }, { merge: true });
        } else {
          transaction.update(targetRef, updateData);
        }

        // 4. Create Audit Log
        await AuditLogService.createAuditLog(
          transaction,
          moderatorId,
          action,
          targetType,
          targetId,
          String(previousState),
          String(newState),
          reason,
          relatedReportIds
        );

        // 5. Dispatch User Warning Notification
        if (action === ModerationActionType.ISSUE_WARNING) {
          const notifRef = doc(collection(db, 'notifications'));
          let targetUserId = '';
          const itemTitle = targetData?.title || 'Auction Post';
          let notifMessage = `Your post "${itemTitle}" is violating the rules and policies of this platform so be careful otherwise your account will be restricted or blocked.`;

          if (targetType === 'listing') {
            targetUserId = targetData?.sellerId || targetData?.userId || targetData?.ownerId;
          } else if (targetType === 'user') {
            targetUserId = targetId;
            notifMessage = reason || `Your account is violating the rules and policies of this platform so be careful otherwise your account will be restricted or blocked.`;
          } else if (targetType === 'negotiation') {
            targetUserId = targetData?.sellerId || targetData?.buyerId;
          }

          if (targetUserId) {
            transaction.set(notifRef, {
              userId: targetUserId,
              title: "⚠️ Policy Violation Warning",
              message: notifMessage,
              type: "ADMIN_WARNING",
              relatedId: targetId,
              auctionId: targetType === 'listing' ? targetId : (targetData?.auctionId || undefined),
              link: targetType === 'listing' ? `/battle-bids/arena/${targetId}` : (targetData?.auctionId ? `/battle-bids/arena/${targetData.auctionId}` : undefined),
              url: targetType === 'listing' ? `/battle-bids/arena/${targetId}` : (targetData?.auctionId ? `/battle-bids/arena/${targetData.auctionId}` : undefined),
              itemTitle: itemTitle,
              read: false,
              createdAt: serverTimestamp()
            });
          }
        }

        // 6. Resolve related reports
        for (const reportId of relatedReportIds) {
          const reportRef = doc(db, 'arena_reports', reportId);
          const reportSnap = await transaction.get(reportRef);
          if (reportSnap.exists()) {
            const rData = reportSnap.data();
            const prevStatus = rData.status;
            const targetType = rData.targetType;

            transaction.update(reportRef, {
              status: ReportStatus.RESOLVED,
              adminNotes: `Action taken: ${action}. Reason: ${reason}`,
              resolvedAt: serverTimestamp(),
              resolvedBy: moderatorId,
              updatedAt: serverTimestamp()
            });

            moderationMetricsService.recordReportFinalized(prevStatus, 'RESOLVED', targetType, transaction);
          }
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'moderation_action');
      throw err;
    }
  },

  /**
   * Dismisses a report without taking action.
   */
  async dismissReport(reportId: string, adminNotes: string, moderatorId?: string) {
    try {
      const reportRef = doc(db, 'arena_reports', reportId);
      await runTransaction(db, async (transaction) => {
        const reportSnap = await transaction.get(reportRef);
        if (reportSnap.exists()) {
          const rData = reportSnap.data();
          const prevStatus = rData.status;
          const targetType = rData.targetType;

          transaction.update(reportRef, {
            status: ReportStatus.DISMISSED,
            adminNotes,
            resolvedAt: serverTimestamp(),
            resolvedBy: moderatorId || 'admin',
            updatedAt: serverTimestamp()
          });

          moderationMetricsService.recordReportFinalized(prevStatus, 'DISMISSED', targetType, transaction);
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'arena_reports');
      throw err;
    }
  }
};
