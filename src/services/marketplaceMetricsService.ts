import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Listing } from '../types';
import { isAuthoritativeKycValid, isAuthoritativePremiumActive } from '../lib/verificationResolver';

export interface MarketplaceMetricsDoc {
  activeCitiesCount: number;
  activeCitiesList: string[];
  cityCounts: Record<string, number>;
  totalLiveListingsCount?: number;
  totalVerifiedSellersCount?: number;
  countriesCount?: number;
  countriesList?: string[];
  countryCounts?: Record<string, number>;
  lastUpdated: any;
}

const METRICS_DOC_PATH = 'system_metrics';
const METRICS_DOC_ID = 'marketplace';

const MARKETPLACE_METRICS_TTL_MS = 1000 * 60 * 4; // 4 minutes
let cachedMarketplaceMetrics: MarketplaceMetricsDoc | null = null;
let cachedMarketplaceMetricsTimestamp = 0;
let inFlightMarketplaceMetricsPromise: Promise<MarketplaceMetricsDoc | null> | null = null;

const EXCLUDED_CITY_PLACEHOLDERS = new Set([
  'all pakistan',
  'pakistan',
  'n/a',
  'na',
  'location unspecified',
  'location unknown',
  'location hidden',
  'unspecified',
  'unknown',
  'all',
  'none',
  'test_city'
]);

const EXCLUDED_COUNTRY_PLACEHOLDERS = new Set([
  'all',
  'none',
  'n/a',
  'na',
  'unknown',
  'unspecified',
  'unspecified country',
  'location unknown',
  'test_country'
]);

/**
 * Standard word title case formatting helper.
 */
const toTitleCase = (text: string): string => {
  return text
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Canonical city normalizer preserving existing Avora business semantics.
 */
export const normalizeCityName = (rawCity: any): string | null => {
  if (!rawCity || typeof rawCity !== 'string') return null;
  const clean = rawCity.trim();
  if (!clean || EXCLUDED_CITY_PLACEHOLDERS.has(clean.toLowerCase())) {
    return null;
  }
  return toTitleCase(clean);
};

/**
 * Canonical country normalizer preserving existing Avora business semantics.
 */
export const normalizeCountryName = (rawCountry: any): string | null => {
  if (!rawCountry || typeof rawCountry !== 'string') return null;
  const clean = rawCountry.trim().toLowerCase();
  if (!clean || EXCLUDED_COUNTRY_PLACEHOLDERS.has(clean)) {
    return null;
  }
  // Surgical alias mapper to Avora's canonical country list names
  if (clean === 'usa' || clean === 'us' || clean === 'united states' || clean === 'united states of america') {
    return 'United States of America';
  }
  if (clean === 'uk' || clean === 'united kingdom') {
    return 'United Kingdom';
  }
  if (clean === 'uae' || clean === 'united arab emirates') {
    return 'United Arab Emirates';
  }
  return toTitleCase(clean);
};

/**
 * Service managing authoritative marketplace metrics aggregation.
 * Strict Read-Only for client/homepage visitors.
 * Zero visitor-triggered Firestore writes or partial dataset fallbacks.
 */
export const marketplaceMetricsService = {
  /**
   * Retrieve the authoritative marketplace metrics document from /system_metrics/marketplace.
   * Uses in-flight Promise deduplication and a deterministic 4-minute in-memory TTL.
   * STRICTLY READ-ONLY: Never writes or bootstraps data on visitor reads.
   * Returns MarketplaceMetricsDoc if available and valid, or null on failure/uninitialized.
   */
  async getAuthoritativeMarketplaceMetrics(): Promise<MarketplaceMetricsDoc | null> {
    const now = Date.now();
    if (cachedMarketplaceMetrics && now - cachedMarketplaceMetricsTimestamp < MARKETPLACE_METRICS_TTL_MS) {
      return cachedMarketplaceMetrics;
    }

    if (inFlightMarketplaceMetricsPromise) {
      return inFlightMarketplaceMetricsPromise;
    }

    inFlightMarketplaceMetricsPromise = (async () => {
      try {
        const metricsRef = doc(db, METRICS_DOC_PATH, METRICS_DOC_ID);
        const snap = await getDoc(metricsRef);

        if (snap.exists()) {
          const data = snap.data() as MarketplaceMetricsDoc;
          cachedMarketplaceMetrics = data;
          cachedMarketplaceMetricsTimestamp = Date.now();
          return data;
        }

        // Aggregate document does not exist in Firestore; do NOT write from visitor read
        return null;
      } catch (err) {
        console.warn("Could not read /system_metrics/marketplace:", err);
        return null;
      } finally {
        inFlightMarketplaceMetricsPromise = null;
      }
    })();

    return inFlightMarketplaceMetricsPromise;
  },

  /**
   * Retrieve the authoritative active cities count from /system_metrics/marketplace.
   * STRICTLY READ-ONLY: Never writes or bootstraps data on visitor reads.
   * Returns the count if available, or null if the aggregate is uninitialized/unavailable.
   */
  async getAuthoritativeActiveCitiesCount(): Promise<number | null> {
    const data = await this.getAuthoritativeMarketplaceMetrics();
    if (data && typeof data.activeCitiesCount === 'number' && data.activeCitiesCount >= 0) {
      return data.activeCitiesCount;
    }
    return null;
  },

  /**
   * Retrieve the authoritative countries count from /system_metrics/marketplace.
   */
  async getAuthoritativeCountriesCount(): Promise<number | null> {
    const data = await this.getAuthoritativeMarketplaceMetrics();
    if (data && typeof data.countriesCount === 'number' && data.countriesCount >= 0) {
      return data.countriesCount;
    }
    return null;
  },

  /**
   * Retrieve the authoritative verified sellers count from /system_metrics/marketplace.
   */
  async getAuthoritativeVerifiedSellersCount(): Promise<number | null> {
    const data = await this.getAuthoritativeMarketplaceMetrics();
    if (data && typeof data.totalVerifiedSellersCount === 'number' && data.totalVerifiedSellersCount >= 0) {
      return data.totalVerifiedSellersCount;
    }
    return null;
  },

  /**
   * Administrative & Server Reconciliation Utility.
   * Reads all LIVE listings, active battle bids, and valid KYC-approved sellers
   * and builds/updates the authoritative document under /system_metrics/marketplace.
   * Callable only by authorized administrators or trusted backend processes.
   */
  async reconcileMarketplaceMetrics(): Promise<{ 
    activeCitiesCount: number; 
    activeCitiesList: string[]; 
    countriesCount: number;
    countriesList: string[];
    totalLiveListingsCount: number; 
    totalVerifiedSellersCount: number;
  }> {
    // 1. Fetch live listings
    const listingsQuery = query(collection(db, 'listings'), where('status', '==', 'LIVE'));
    const listingsSnap = await getDocs(listingsQuery);
    const liveListings = listingsSnap.docs.map(d => ({ ...d.data(), id: d.id } as Listing));

    // 2. Fetch KYC-approved sellers
    const usersQuery = query(collection(db, 'users'), where('kycStatus', '==', 'APPROVED'));
    const usersSnap = await getDocs(usersQuery);
    const approvedUsers = usersSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));

    // 3. Fetch active Battle Bids auctions safely (fail-silent if module inactive or empty)
    let activeAuctions: any[] = [];
    try {
      const auctionsQuery = query(collection(db, 'arena_auctions'), where('status', '==', 'active'));
      const auctionsSnap = await getDocs(auctionsQuery);
      activeAuctions = auctionsSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
    } catch (err) {
      console.warn("Could not fetch active battle bids auctions during metrics reconciliation:", err);
    }

    // 4. Calculate Verified Sellers (one user = one seller, requiring both Active KYC and Active Premium)
    const activeVerifiedSellers = approvedUsers.filter(
      userDoc => isAuthoritativeKycValid(userDoc) && isAuthoritativePremiumActive(userDoc)
    );
    const totalVerifiedSellersCount = activeVerifiedSellers.length;

    // Sets and counters for cities and countries
    const activeCountriesSet = new Set<string>();
    const countryCounts: Record<string, number> = {};
    
    const activeCitiesSet = new Set<string>();
    const cityCounts: Record<string, number> = {};

    // Source A: LIVE Listings (Sole inventory source driving cityCounts and countryCounts)
    liveListings.forEach(item => {
      if (item.status === 'LIVE' && !item.isSuspended && (item.quantity || 0) > 0) {
        // City
        const cleanCity = normalizeCityName(item.city);
        if (cleanCity) {
          activeCitiesSet.add(cleanCity);
          cityCounts[cleanCity] = (cityCounts[cleanCity] || 0) + 1;
        }
        // Country
        const cleanCountry = normalizeCountryName(item.country);
        if (cleanCountry) {
          activeCountriesSet.add(cleanCountry);
          countryCounts[cleanCountry] = (countryCounts[cleanCountry] || 0) + 1;
        }
      }
    });

    // Source B: Active Battle Bids auctions (Geographic coverage only, no inventory count increments)
    activeAuctions.forEach(item => {
      if (item.status === 'active' && !item.deleted && !item.removed) {
        // City
        const cleanCity = normalizeCityName(item.city);
        if (cleanCity) {
          activeCitiesSet.add(cleanCity);
        }
        // Country
        const cleanCountry = normalizeCountryName(item.country);
        if (cleanCountry) {
          activeCountriesSet.add(cleanCountry);
        }
      }
    });

    // Source C: Active Verified Sellers (Geographic coverage only, no inventory count increments)
    activeVerifiedSellers.forEach(userDoc => {
      // City
      const cleanCity = normalizeCityName(userDoc.city || userDoc.businessCity);
      if (cleanCity) {
        activeCitiesSet.add(cleanCity);
      }
      // Country
      const cleanCountry = normalizeCountryName(userDoc.country || userDoc.countryOfStay);
      if (cleanCountry) {
        activeCountriesSet.add(cleanCountry);
      }
    });

    const activeCitiesList = Array.from(activeCitiesSet).sort();
    const activeCitiesCount = activeCitiesList.length;

    const countriesList = Array.from(activeCountriesSet).sort();
    const countriesCount = countriesList.length;

    const metricsRef = doc(db, METRICS_DOC_PATH, METRICS_DOC_ID);
    await setDoc(metricsRef, {
      activeCitiesCount,
      activeCitiesList,
      cityCounts,
      totalLiveListingsCount: liveListings.length,
      totalVerifiedSellersCount,
      countriesCount,
      countriesList,
      countryCounts,
      lastUpdated: serverTimestamp()
    }, { merge: true });

    return {
      activeCitiesCount,
      activeCitiesList,
      countriesCount,
      countriesList,
      totalLiveListingsCount: liveListings.length,
      totalVerifiedSellersCount
    };
  }
};
