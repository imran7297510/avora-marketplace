import { useState } from 'react';
import { Listing, UserProfile } from '../types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const MAX_CACHE_ENTRIES = 50;
const cache = new Map<string, CacheEntry<any>>();

export const DEFAULT_CACHE_TTL = 1000 * 60 * 4; // 4 minutes
export const HOMEPAGE_CACHE_KEY = 'mandi_homepage_data';
export const HOMEPAGE_CACHE_TTL = 1000 * 60 * 4; // 4 minutes (within 3-5 min range)

function enforceMaxEntries() {
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
}

/**
 * Retrieve an entry from the global memory cache.
 */
export function getGlobalCache<T>(
  key: string,
  ttl: number = DEFAULT_CACHE_TTL
): { data: T; isStale: boolean } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const isStale = Date.now() - entry.timestamp > ttl;
  return { data: entry.data as T, isStale };
}

/**
 * Store an entry in the global memory cache.
 */
export function setGlobalCache<T>(key: string, data: T): void {
  enforceMaxEntries();
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalidate a specific key from the global memory cache.
 */
export function invalidateGlobalCache(key: string): void {
  cache.delete(key);
}

/**
 * Clear all entries from the global memory cache.
 */
export function clearGlobalCache(): void {
  cache.clear();
}

export interface HomepageCacheData {
  allListings: Listing[];
  verifiedUserProfiles: UserProfile[];
  sellerProfilesMap: Record<string, UserProfile | null>;
}

/**
 * Retrieve cached homepage dataset.
 */
export function getHomepageCache(): { data: HomepageCacheData; isStale: boolean } | null {
  return getGlobalCache<HomepageCacheData>(HOMEPAGE_CACHE_KEY, HOMEPAGE_CACHE_TTL);
}

/**
 * Store homepage dataset in cache.
 */
export function setHomepageCache(data: HomepageCacheData): void {
  setGlobalCache<HomepageCacheData>(HOMEPAGE_CACHE_KEY, data);
}

/**
 * Invalidate homepage cache to force fresh fetch on next visit.
 */
export function invalidateHomepageCache(): void {
  invalidateGlobalCache(HOMEPAGE_CACHE_KEY);
}

/**
 * React hook for component-level data caching (backward compatible).
 */
export function useDataCache<T>(key: string, ttl: number = DEFAULT_CACHE_TTL) {
  const [data, setData] = useState<T | null>(() => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    return null;
  });

  const setCacheData = (newData: T) => {
    enforceMaxEntries();
    cache.set(key, { data: newData, timestamp: Date.now() });
    setData(newData);
  };

  const getCachedData = (): T | null => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    return null;
  };

  return { data, setCacheData, getCachedData };
}

