import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuctionItem, ArenaFilters, ArenaSortOption, DiscoveryState } from '../types';
import { DiscoveryService } from '../services/discoveryService';

export function useDiscovery(initialFilters: ArenaFilters = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize state from URL params
  const getFiltersFromParams = (): ArenaFilters => {
    const q = searchParams.get('q') || undefined;
    const cat = searchParams.get('category') || undefined;
    const cats = searchParams.get('categories') ? searchParams.get('categories')?.split(',') : undefined;
    const city = searchParams.get('city') || undefined;
    const min = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined;
    const max = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;
    const kyc = searchParams.get('kyc') === 'true' ? true : undefined;
    const premium = searchParams.get('premium') === 'true' ? true : undefined;
    const status = searchParams.get('status') ? searchParams.get('status')?.split(',') as any[] : undefined;
    const typeParam = searchParams.get('type');
    const isNegParam = searchParams.get('isNegotiationOnly');
    let isNeg = initialFilters.isNegotiationOnly;
    if (typeParam === 'negotiation' || isNegParam === 'true') {
      isNeg = true;
    } else if (isNegParam === 'false') {
      isNeg = false;
    }

    return { 
      ...initialFilters, 
      searchQuery: q, 
      category: cat, 
      categories: cats, 
      city: city, 
      minPrice: min, 
      maxPrice: max, 
      isKycVerified: kyc, 
      isPremiumSeller: premium,
      isNegotiationOnly: isNeg,
      status: status || initialFilters.status
    };
  };

  const getSortFromParams = (): ArenaSortOption => {
    return (searchParams.get('sort') as ArenaSortOption) || 'newest';
  };

  const initialFiltersCalculated = getFiltersFromParams();
  const initialSortCalculated = getSortFromParams();
  const cachedInitial = DiscoveryService.getCachedAuctions(initialFiltersCalculated, initialSortCalculated);

  const [items, setItems] = useState<AuctionItem[]>(() => cachedInitial?.items || []);
  const [loading, setLoading] = useState(() => !cachedInitial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>({
    filters: initialFiltersCalculated,
    sortBy: initialSortCalculated,
    hasMore: cachedInitial ? cachedInitial.hasMore : true,
    lastDoc: cachedInitial?.lastDoc
  });

  // Listen to global auction events for instant sync across tabs and views
  useEffect(() => {
    const handleAuctionDeleted = (e: any) => {
      const deletedId = e.detail?.auctionId;
      if (deletedId) {
        setItems(prev => prev.filter(item => item.id !== deletedId));
      }
    };

    const handleAuctionUpdated = (e: any) => {
      const detail = e.detail;
      if (detail?.auctionId && (detail.isPermanentlyRemoved || detail.status === 'cancelled')) {
        setItems(prev => prev.filter(item => item.id !== detail.auctionId));
      }
    };

    const handleAuctionCreated = (e: any) => {
      const newAuction = e.detail?.auction;
      if (newAuction) {
        setItems(prev => {
          if (prev.some(it => it.id === newAuction.id)) return prev;
          return [newAuction, ...prev];
        });
      }
    };

    window.addEventListener('arena_auction_deleted' as any, handleAuctionDeleted);
    window.addEventListener('arena_auction_updated' as any, handleAuctionUpdated);
    window.addEventListener('arena_auction_created' as any, handleAuctionCreated);
    return () => {
      window.removeEventListener('arena_auction_deleted' as any, handleAuctionDeleted);
      window.removeEventListener('arena_auction_updated' as any, handleAuctionUpdated);
      window.removeEventListener('arena_auction_created' as any, handleAuctionCreated);
    };
  }, []);

  const fetchAuctions = useCallback(async (reset: boolean = false, overrideFilters?: ArenaFilters) => {
    if (reset) {
      // Only show full blocking loader if we don't already have items in memory
      setItems(prev => {
        if (prev.length === 0) setLoading(true);
        return prev;
      });
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await DiscoveryService.getAuctions(
        overrideFilters || discoveryState.filters,
        discoveryState.sortBy,
        reset ? undefined : discoveryState.lastDoc
      );

      setItems(prev => reset ? result.items : [...prev, ...result.items]);
      setDiscoveryState(prev => ({
        ...prev,
        lastDoc: result.lastDoc,
        hasMore: result.hasMore
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [discoveryState.filters, discoveryState.sortBy, discoveryState.lastDoc]);

  // Sync state to URL params but DON'T fetch automatically
  useEffect(() => {
    const params: any = {};
    if (discoveryState.filters.searchQuery) params.q = discoveryState.filters.searchQuery;
    if (discoveryState.filters.category) params.category = discoveryState.filters.category;
    if (discoveryState.filters.categories && discoveryState.filters.categories.length > 0) {
      params.categories = discoveryState.filters.categories.join(',');
    }
    if (discoveryState.filters.city) params.city = discoveryState.filters.city;
    if (discoveryState.filters.minPrice) params.minPrice = discoveryState.filters.minPrice.toString();
    if (discoveryState.filters.maxPrice) params.maxPrice = discoveryState.filters.maxPrice.toString();
    if (discoveryState.filters.isKycVerified) params.kyc = 'true';
    if (discoveryState.filters.isPremiumSeller) params.premium = 'true';
    if (discoveryState.filters.status && discoveryState.filters.status.length > 0) {
      const isOnlyActive = discoveryState.filters.status.length === 1 && discoveryState.filters.status[0] === 'active';
      if (!isOnlyActive) {
        params.status = discoveryState.filters.status.join(',');
      }
    }
    if (discoveryState.sortBy !== 'endingSoon') params.sort = discoveryState.sortBy;
    
    setSearchParams(params, { replace: true });
  }, [discoveryState.filters, discoveryState.sortBy]);

  // Initial fetch only
  useEffect(() => {
    fetchAuctions(true);
  }, []);

  const setFilters = useCallback((newFilters: Partial<ArenaFilters>) => {
    setDiscoveryState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...newFilters },
      lastDoc: undefined,
      hasMore: true
    }));
  }, []);

  const setSortBy = useCallback((sortBy: ArenaSortOption) => {
    setDiscoveryState(prev => ({
      ...prev,
      sortBy,
      lastDoc: undefined,
      hasMore: true
    }));
  }, []);

  const search = useCallback((filters?: ArenaFilters) => {
    fetchAuctions(true, filters);
  }, [fetchAuctions]);

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && discoveryState.hasMore) {
      fetchAuctions(false);
    }
  }, [loading, loadingMore, discoveryState.hasMore, fetchAuctions]);

  const clearFilters = useCallback(() => {
    setDiscoveryState(prev => ({
      ...prev,
      filters: initialFilters,
      lastDoc: undefined,
      hasMore: true
    }));
  }, [initialFilters]);

  return {
    items,
    loading,
    loadingMore,
    error,
    filters: discoveryState.filters,
    sortBy: discoveryState.sortBy,
    hasMore: discoveryState.hasMore,
    setFilters,
    setSortBy,
    search,
    loadMore,
    clearFilters
  };
}
