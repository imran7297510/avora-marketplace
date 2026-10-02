import { useState, useEffect } from 'react';
import { ArenaReport } from '../types';
import { ReportService } from '../services/reportService';
import { useAuth } from '../../../context/AuthContext';

export function useUserReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ArenaReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setReports([]);
      setLoading(false);
      return;
    }

    const unsubscribe = ReportService.subscribeToUserReports(user.uid, (data) => {
      setReports(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  return {
    reports,
    loading
  };
}
