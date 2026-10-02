import { useState, useEffect } from 'react';
import { ModerationAuditLog } from '../types';
import { AuditLogService } from '../services/auditLogService';
import { useAuth } from '../../../context/AuthContext';

export function useAuditLog(targetId?: string) {
  const { isAdmin } = useAuth();
  const [logs, setLogs] = useState<ModerationAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;

    let unsubscribe: () => void;

    if (targetId) {
      unsubscribe = AuditLogService.subscribeToTargetLogs(targetId, (data) => {
        setLogs(data);
        setLoading(false);
      });
    } else {
      unsubscribe = AuditLogService.subscribeToRecentLogs(50, (data) => {
        setLogs(data);
        setLoading(false);
      });
    }

    return () => unsubscribe?.();
  }, [isAdmin, targetId]);

  return {
    logs,
    loading
  };
}
