import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  startAfter, 
  QueryConstraint 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import { AuctionItem, ArenaFilters, ArenaSortOption } from '../types';
import { ArenaService } from './arenaService';
import { isListingRemoved } from '../utils';
import { isValidFiatCurrencyCode } from '../../../lib/currencies';

let discoveryCache: {
  key: string;
  data: { items: AuctionItem[]; lastDoc: any; hasMore: boolean };
  timestamp: number;
} | null = null;

const CACHE_DURATION_MS = 120000; // 2 minutes fast memory cache

// Pre-load from sessionStorage if available
try {
  const stored = sessionStorage.getItem('arena_discovery_cache_v1');
  if (stored) {
    const parsed = JSON.parse(stored);
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      discoveryCache = {
        key: 'default',
        data: {
          items: parsed.items.map((it: any) => ({
            ...it,
            startTime: it.startTime ? new Date(it.startTime) : new Date(),
            endTime: it.endTime ? new Date(it.endTime) : new Date(),
            createdAt: it.createdAt ? new Date(it.createdAt) : new Date()
          })),
          lastDoc: null,
          hasMore: false
        },
        timestamp: Date.now()
      };
    }
  }
} catch {
  // Ignore sessionStorage errors
}

export const DiscoveryService = {
  /**
   * Clears memory and session caches to ensure fresh data fetching.
   */
  invalidateCache() {
    discoveryCache = null;
    try {
      sessionStorage.removeItem('arena_discovery_cache_v1');
    } catch {}
  },

  /**
   * Synchronously returns cached auctions if available for instant UI rendering.
   */
  getCachedAuctions(
    filters: ArenaFilters,
    sortBy: ArenaSortOption = 'newest'
  ): { items: AuctionItem[]; lastDoc: any; hasMore: boolean } | null {
    const cacheKey = JSON.stringify({ filters, sortBy, lastDocId: null });
    const now = Date.now();
    if (discoveryCache && (discoveryCache.key === cacheKey || discoveryCache.key === 'default') && (now - discoveryCache.timestamp < CACHE_DURATION_MS)) {
      return discoveryCache.data;
    }
    return null;
  },

  /**
   * Fetches auctions based on filters, sorting, and pagination.
   */
  async getAuctions(
    filters: ArenaFilters, 
    sortBy: ArenaSortOption = 'newest',
    lastDoc?: any,
    pageSize: number = 40
  ): Promise<{ items: AuctionItem[]; lastDoc: any; hasMore: boolean }> {
    const cacheKey = JSON.stringify({ filters, sortBy, lastDocId: lastDoc?.id || null });
    const now = Date.now();

    if (discoveryCache && discoveryCache.key === cacheKey && (now - discoveryCache.timestamp < CACHE_DURATION_MS)) {
      return discoveryCache.data;
    }

    try {
      const constraints: QueryConstraint[] = [];

      // Status Filter (simple, single-field, safe when explicitly requested)
      if (filters.status && filters.status.length > 0) {
        // Expand 'ended' to include other terminal statuses if present
        const statusesToQuery = new Set<string>(filters.status);
        if (statusesToQuery.has('ended')) {
          statusesToQuery.add('concluded');
          statusesToQuery.add('sold');
          statusesToQuery.add('reserve_not_met');
        }
        constraints.push(where('status', 'in', Array.from(statusesToQuery).slice(0, 10)));
      }

      // Fast responsive query: limit to 100 items for rapid network resolution
      const q = query(collection(db, 'arena_auctions'), ...constraints, limit(100));
      const snapshot = await getDocs(q);
      
      // All listed items remain in Available Items for Auction without automatic removal
      const items = snapshot.docs.map(doc => {
        const mapped = ArenaService.mapDocToAuction(doc);
        ArenaService.cacheAuction(mapped);
        return mapped;
      });
      
      // Client-side filtering for complex fields (Firestore limitations)
      let filteredItems = items.filter(item => !isListingRemoved(item));
      
      if (filters.isNegotiationOnly === true) {
        filteredItems = filteredItems.filter(item => item.isNegotiationOnly === true);
      } else {
        filteredItems = filteredItems.filter(item => item.isNegotiationOnly !== true);
      }

      if (filters.category && filters.category !== 'All' && (!filters.categories || filters.categories.length === 0)) {
        filteredItems = filteredItems.filter(item => item.category === filters.category);
      }

      if (filters.brand) {
        filteredItems = filteredItems.filter(item => item.brand?.toLowerCase() === filters.brand?.toLowerCase());
      }
      
      // My Auctions Client Filter
      if (filters.isMyAuctions && filters.sellerId) {
        filteredItems = filteredItems.filter(item => item.sellerId === filters.sellerId);
      } else if (filters.sellerId) {
        filteredItems = filteredItems.filter(item => item.sellerId === filters.sellerId);
      }
      
      if (filters.searchQuery) {
        const search = filters.searchQuery.toLowerCase();
        filteredItems = filteredItems.filter(item => 
          item.title.toLowerCase().includes(search) || 
          item.description.toLowerCase().includes(search) ||
          item.brand?.toLowerCase().includes(search) ||
          item.model?.toLowerCase().includes(search) ||
          item.category?.toLowerCase().includes(search) ||
          item.city?.toLowerCase().includes(search) ||
          item.sellerName?.toLowerCase().includes(search)
        );
      }

      // Multi-categories Client Filter
      if (filters.categories && filters.categories.length > 0 && !filters.categories.includes('All')) {
        filteredItems = filteredItems.filter(item => filters.categories?.includes(item.category));
      }

      // Country Client Filter
      if (filters.country) {
        const searchCountry = filters.country.toLowerCase().trim();
        filteredItems = filteredItems.filter(item => 
          item.country?.toLowerCase().includes(searchCountry) ||
          (!item.country && 'pakistan'.includes(searchCountry))
        );
      }

      // City Client Filter
      if (filters.city) {
        const searchCity = filters.city.toLowerCase().trim();
        filteredItems = filteredItems.filter(item => 
          item.city?.toLowerCase().includes(searchCity) || 
          // Check standard seed defaults
          (item.sellerId === 'arena-official-host' && 'lahore'.includes(searchCity)) ||
          (item.sellerId === 'arena_bot_alpha' && 'karachi'.includes(searchCity)) ||
          (item.sellerId === 'arena_bot_beta' && 'islamabad'.includes(searchCity)) ||
          (item.sellerId === 'arena_bot_gamma' && 'peshawar'.includes(searchCity))
        );
      }

      // Currency Client Filter
      if (filters.currencyCode && filters.currencyCode !== 'ALL') {
        const targetCode = filters.currencyCode.toUpperCase().trim();
        filteredItems = filteredItems.filter(item => {
          const itemCurr = (item.currency || 'PKR').toUpperCase().trim();
          return itemCurr === targetCode;
        });
      } else if (filters.currencyCode === 'ALL') {
        filteredItems = filteredItems.filter(item => {
          const itemCurr = (item.currency || 'PKR').toUpperCase().trim();
          return isValidFiatCurrencyCode(itemCurr);
        });
      }

      // KYC Seller Client Filter
      if (filters.isKycVerified) {
        filteredItems = filteredItems.filter(item => {
          return (item as any).isKycVerified === true;
        });
      }

      // Premium Seller Client Filter
      if (filters.isPremiumSeller) {
        filteredItems = filteredItems.filter(item => {
          return (item as any).isPremiumSeller === true;
        });
      }

      if (filters.minPrice !== undefined) {
        filteredItems = filteredItems.filter(item => item.currentBid >= (filters.minPrice || 0));
      }

      if (filters.maxPrice !== undefined) {
        filteredItems = filteredItems.filter(item => item.currentBid <= (filters.maxPrice || Infinity));
      }

      // Status Client Filter
      if (filters.status && filters.status.length > 0) {
        const wantEnded = filters.status.includes('ended') || filters.status.includes('concluded');
        const wantActive = filters.status.includes('active');
        const wantUpcoming = filters.status.includes('upcoming');

        filteredItems = filteredItems.filter(item => {
          if (wantActive && item.status === 'active') return true;
          if (wantUpcoming && item.status === 'upcoming') return true;
          if (wantEnded && (item.status === 'ended' || item.status === 'concluded' || item.status === 'sold' || item.status === 'reserve_not_met')) return true;
          return filters.status!.includes(item.status as any);
        });
      }

      // Client-side Sorting: Latest posted item on top always by default
      filteredItems.sort((a, b) => {
        // Tiered Ranking: Active > Upcoming > Ended
        const getStatusRank = (status: string) => {
          if (status === 'active') return 0;
          if (status === 'upcoming') return 1;
          return 2; // ended, sold, reserve_not_met, cancelled, concluded
        };

        const rankA = getStatusRank(a.status);
        const rankB = getStatusRank(b.status);

        if (rankA !== rankB) {
          return rankA - rankB;
        }

        // Within same rank, latest posted item is on top always
        const timeA = (a.createdAt ? (typeof (a.createdAt as any).getTime === 'function' ? (a.createdAt as any).getTime() : new Date(a.createdAt).getTime()) : 0) || 
                      (a.startTime ? (typeof (a.startTime as any).getTime === 'function' ? (a.startTime as any).getTime() : new Date(a.startTime).getTime()) : 0) || 0;
        const timeB = (b.createdAt ? (typeof (b.createdAt as any).getTime === 'function' ? (b.createdAt as any).getTime() : new Date(b.createdAt).getTime()) : 0) || 
                      (b.startTime ? (typeof (b.startTime as any).getTime === 'function' ? (b.startTime as any).getTime() : new Date(b.startTime).getTime()) : 0) || 0;
        return timeB - timeA;
      });

      // Override with user-selected sort if it's explicitly specified and not default "newest"
      if (sortBy && sortBy !== 'newest') {
        filteredItems.sort((a, b) => {
          switch (sortBy) {
            case 'endingSoon':
              return (a.endTime?.getTime() || 0) - (b.endTime?.getTime() || 0);
            case 'highestBid':
              return (b.currentBid || 0) - (a.currentBid || 0);
            case 'lowestPrice':
              return (a.currentBid || 0) - (b.currentBid || 0);
            case 'highestPrice':
              return (b.currentBid || 0) - (a.currentBid || 0);
            case 'mostWatched':
              return (b.watchersCount || 0) - (a.watchersCount || 0);
            case 'mostBids':
              return (b.bidsCount || 0) - (a.bidsCount || 0);
            default:
              return 0; // Already sorted newest first
          }
        });
      }

      // Simple client-side pagination
      // For a robust implementation, you'd use startAfter, but since we fetched 100
      // we can just return them all or handle pagination differently. 
      // For now, we'll return the first pageSize items if no lastDoc, else the next ones.
      let finalItems = filteredItems;
      let hasMore = false;
      let lastVisible = null;

      if (lastDoc) {
        const lastIndex = filteredItems.findIndex(i => i.id === lastDoc.id);
        if (lastIndex !== -1) {
          finalItems = filteredItems.slice(lastIndex + 1, lastIndex + 1 + pageSize);
          hasMore = lastIndex + 1 + pageSize < filteredItems.length;
          lastVisible = hasMore ? finalItems[finalItems.length - 1] : null;
        } else {
          finalItems = [];
        }
      } else {
        finalItems = filteredItems.slice(0, pageSize);
        hasMore = pageSize < filteredItems.length;
        lastVisible = hasMore ? finalItems[finalItems.length - 1] : null;
      }

      const result = {
        items: finalItems,
        lastDoc: lastVisible,
        hasMore
      };

      discoveryCache = {
        key: cacheKey,
        data: result,
        timestamp: Date.now()
      };

      // Persist cache to sessionStorage for instant sub-millisecond warm starts
      try {
        if (finalItems.length > 0 && !lastDoc) {
          sessionStorage.setItem('arena_discovery_cache_v1', JSON.stringify({
            items: finalItems.slice(0, 24)
          }));
        }
      } catch {
        // Ignore quota/sessionStorage errors
      }

      return result;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'arena_auctions/discovery');
      return { items: [], lastDoc: null, hasMore: false };
    }
  },

  /**
   * Fetches suggestions for search autocomplete.
   */
  async getSuggestions(field: string, searchTerm: string): Promise<string[]> {
    try {
      const q = query(
        collection(db, 'arena_auctions'),
        where('status', '==', 'active'),
        limit(100)
      );
      const snapshot = await getDocs(q);
      const values = snapshot.docs.map(doc => doc.data()[field] as string);
      const uniqueValues = Array.from(new Set(values.filter(v => v && v.toLowerCase().includes(searchTerm.toLowerCase()))));
      return uniqueValues.slice(0, 5);
    } catch (err) {
      return [];
    }
  }
};
