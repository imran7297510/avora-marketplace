import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { WatchlistService } from '../services/watchlistService';

export function useWatchlist() {
  const { user } = useAuth();
  const [watchedIds, setWatchedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWatchedIds([]);
      setLoading(false);
      return;
    }

    const unsubscribe = WatchlistService.subscribeToWatchlist(user.uid, (ids) => {
      setWatchedIds(ids);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const toggleWatch = useCallback(async (auctionId: string) => {
    if (!user) return;
    
    const isWatching = watchedIds.includes(auctionId);
    
    // Optimistic UI Update
    setWatchedIds(prev => 
      isWatching 
        ? prev.filter(id => id !== auctionId) 
        : [...prev, auctionId]
    );

    try {
      await WatchlistService.toggleWatch(user.uid, auctionId, isWatching);
    } catch (err) {
      // Rollback on failure
      setWatchedIds(prev => 
        isWatching 
          ? [...prev, auctionId] 
          : prev.filter(id => id !== auctionId)
      );
      throw err;
    }
  }, [user, watchedIds]);

  const isWatching = useCallback((auctionId: string) => {
    return watchedIds.includes(auctionId);
  }, [watchedIds]);

  return {
    watchedIds,
    loading,
    toggleWatch,
    isWatching
  };
}
