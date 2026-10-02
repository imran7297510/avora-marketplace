import { useState, useEffect, useCallback } from 'react';
import { ModerationService } from '../services/moderationService';
import { ArenaReport, ReportStatus, ReportTargetType, ModerationActionType, RiskScore } from '../types';
import { useAuth } from '../../../context/AuthContext';

export function useModeration() {
  const { user, isAdmin } = useAuth();
  const [pendingReports, setPendingReports] = useState<ArenaReport[]>([]);
  const [allReports, setAllReports] = useState<ArenaReport[]>([]);
  const [riskScores, setRiskScores] = useState<RiskScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin || !user) return;

    const unsubPending = ModerationService.subscribeToPendingReports(setPendingReports);
    const unsubAll = ModerationService.subscribeToReports({}, setAllReports);
    const unsubRisk = ModerationService.subscribeToRiskScores(setRiskScores);

    setLoading(false);

    return () => {
      unsubPending();
      unsubAll();
      unsubRisk();
    };
  }, [isAdmin, user]);

  const executeAction = useCallback(async (
    action: ModerationActionType,
    targetType: ReportTargetType,
    targetId: string,
    reason: string,
    relatedReportIds: string[] = []
  ) => {
    if (!isAdmin || !user) throw new Error("Unauthorized");
    
    setActionLoading(true);
    try {
      await ModerationService.executeModerationAction(
        user.uid,
        action,
        targetType,
        targetId,
        reason,
        relatedReportIds
      );
    } finally {
      setActionLoading(false);
    }
  }, [isAdmin, user]);

  const dismissReport = useCallback(async (reportId: string, notes: string) => {
    if (!isAdmin) throw new Error("Unauthorized");
    setActionLoading(true);
    try {
      await ModerationService.dismissReport(reportId, notes);
    } finally {
      setActionLoading(false);
    }
  }, [isAdmin]);

  return {
    pendingReports,
    allReports,
    riskScores,
    loading,
    actionLoading,
    executeAction,
    dismissReport
  };
}
