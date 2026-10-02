import { useState, useCallback } from 'react';
import { ReportService } from '../services/reportService';
import { ReportReason, ReportTargetType } from '../types';
import { useAuth } from '../../../context/AuthContext';
import { isUserBanned } from '../../../services/userService';

export function useReport() {
  const { user, userProfile, isBlocked } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitReport = useCallback(async (
    targetId: string,
    targetType: ReportTargetType,
    reason: ReportReason,
    description: string,
    targetOwnerId?: string
  ) => {
    if (!user) return;

    const isRestricted = isBlocked || isUserBanned(userProfile) || (userProfile as any)?.reportingDisabled || (userProfile as any)?.canReport === false;
    if (isRestricted) {
      throw new Error('Action denied: Your account has been restricted by administration from submitting reports.');
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      if (targetOwnerId && (
        targetOwnerId === user.uid ||
        (user.uid === 'simulated-seller' && targetOwnerId === 'seller') ||
        (user.uid === 'simulated-buyer' && targetOwnerId === 'buyer') ||
        targetOwnerId === 'me'
      )) {
        throw new Error('Action denied: You cannot report your own submitted offer or item.');
      }

      if (reason === ReportReason.OTHER && !description) {
        throw new Error('Description is required for "Other" reason.');
      }
      
      const reportId = await ReportService.submitReport(
        user.uid,
        targetId,
        targetType,
        reason,
        description,
        targetOwnerId
      );
      return reportId;
    } catch (err: any) {
      setError(err.message || 'Failed to submit report');
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, [user]);

  return {
    submitReport,
    submitting,
    error
  };
}
