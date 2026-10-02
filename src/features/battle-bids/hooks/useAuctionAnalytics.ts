import { useState, useEffect, useMemo } from 'react';
import { AuctionItem, AuctionAnalytics } from '../types';
import { AnalyticsService } from '../services/analyticsService';

export function useAuctionAnalytics(auction: AuctionItem | null) {
  const [analytics, setAnalytics] = useState<AuctionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auction) {
      setLoading(false);
      return;
    }

    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const data = await AnalyticsService.getAuctionAnalytics(auction);
        setAnalytics(data);
      } catch (err) {
        console.error('Failed to fetch auction analytics:', err);
        setError('Strategic intelligence retrieval failed.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [auction?.id, auction?.currentBid]); // Refresh when price changes

  return {
    analytics,
    loading,
    error
  };
}
