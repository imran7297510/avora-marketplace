import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { collection, query, where, getDocs, limit, getCountFromServer } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Listing, UserProfile } from '../types';
import { isSellerPremiumActive } from '../lib/premium';
import { ListingCard } from '../components/ListingCard';
import { fetchCachedUserProfilesBatch, primeUserProfileCache } from '../services/userProfileCache';
import { getHomepageCache, setHomepageCache } from '../lib/cache';
import { HappeningNow } from '../components/HappeningNow';
import { MostViewed } from '../components/MostViewed';
import { LocationSelector } from '../components/LocationSelector';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { CATEGORIES, LOCATIONS, MARKETPLACE_CATEGORIES } from '../constants';
import { isListingEligibleForPriceDrops } from '../lib/utils';
import { 
  Rocket, 
  ShieldCheck, 
  Zap, 
  ArrowRight, 
  Star, 
  Shield, 
  MessageSquare, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Lock,
  Users,
  ChevronLeft,
  ChevronRight,
  Package,
  Smartphone, 
  Car, 
  Bed,
  Home as HomeIcon,
  Shirt,
  Bike,
  Laptop as LaptopIcon,
  Search,
  Filter,
  MapPin,
  ArrowUpDown,
  X,
  SlidersHorizontal,
  RotateCcw,
  LayoutGrid,
  LayoutDashboard,
  Award,
  Crown,
  Flame,
  Gavel
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { isValidFiatCurrencyCode, filterListingsByCurrency } from '../lib/currencies';
import { marketplaceMetricsService } from '../services/marketplaceMetricsService';

interface CategoryGroup {
  id: string;
  name: string;
  listings: Listing[];
  totalCount?: number;
  icon?: any;
}

import { useDragScroll } from '../lib/useScroll';

import { ArenaHero } from '../features/battle-bids/components/ArenaHero';
import { ARENA_CATEGORIES } from '../features/battle-bids/constants';
import { Homepage3DActionGrid } from '../components/ThreeDButton';

const getArenaCategoryConfig = (name: string) => {
  switch (name) {
    case 'Luxury Watches':
      return { 
        icon: Clock, 
        color: 'text-amber-500', 
        bg: 'from-amber-500/10 to-transparent hover:border-amber-500/40', 
        tag: 'Precision Chronometers' 
      };
    case 'Elite Vehicles':
      return { 
        icon: Car, 
        color: 'text-rose-500', 
        bg: 'from-rose-500/10 to-transparent hover:border-rose-500/40', 
        tag: 'Hypercars & Superbikes' 
      };
    case 'Rare Collectibles':
      return { 
        icon: Crown, 
        color: 'text-amber-400', 
        bg: 'from-amber-400/10 to-transparent hover:border-amber-400/40', 
        tag: 'Historic Masterpieces' 
      };
    case 'Premium Real Estate':
      return { 
        icon: HomeIcon, 
        color: 'text-indigo-400', 
        bg: 'from-indigo-400/10 to-transparent hover:border-indigo-400/40', 
        tag: 'Elite Penthouses & Estates' 
      };
    case 'Vintage Art':
      return { 
        icon: Flame, 
        color: 'text-pink-500', 
        bg: 'from-pink-500/10 to-transparent hover:border-pink-500/40', 
        tag: 'Fine Art & Sculptures' 
      };
    default:
      return { 
        icon: Gavel, 
        color: 'text-rose-500', 
        bg: 'from-rose-500/10 to-transparent hover:border-rose-500/40', 
        tag: 'Arena Assets' 
      };
  }
};

let cachedTotalLiveListingsCount: number | null = null;
let cachedTotalLiveListingsTimestamp = 0;
let cachedTotalVerifiedSellersCount: number | null = null;
let cachedTotalVerifiedSellersTimestamp = 0;
let cachedTotalCountriesCount: number | null = null;
let cachedTotalCountriesTimestamp = 0;
let cachedTotalActiveCitiesCount: number | null = null;
let cachedTotalActiveCitiesTimestamp = 0;

export function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [totalActiveListingsCount, setTotalActiveListingsCount] = useState<number | null>(() => {
    if (cachedTotalLiveListingsCount !== null && Date.now() - cachedTotalLiveListingsTimestamp < 1000 * 60 * 4) {
      return cachedTotalLiveListingsCount;
    }
    return null;
  });
  const [totalVerifiedSellersCount, setTotalVerifiedSellersCount] = useState<number | null>(() => {
    if (cachedTotalVerifiedSellersCount !== null && Date.now() - cachedTotalVerifiedSellersTimestamp < 1000 * 60 * 4) {
      return cachedTotalVerifiedSellersCount;
    }
    return null;
  });
  const [totalCountriesCount, setTotalCountriesCount] = useState<number | null>(() => {
    if (cachedTotalCountriesCount !== null && Date.now() - cachedTotalCountriesTimestamp < 1000 * 60 * 4) {
      return cachedTotalCountriesCount;
    }
    return null;
  });
  const [totalActiveCitiesCount, setTotalActiveCitiesCount] = useState<number | null>(() => {
    if (cachedTotalActiveCitiesCount !== null && Date.now() - cachedTotalActiveCitiesTimestamp < 1000 * 60 * 4) {
      return cachedTotalActiveCitiesCount;
    }
    return null;
  });
  const [featuredListings, setFeaturedListings] = useState<Listing[]>([]);
  const [priceDroppedListings, setPriceDroppedListings] = useState<Listing[]>([]);
  const [boostedListings, setBoostedListings] = useState<Listing[]>([]);
  const [recommendedListings, setRecommendedListings] = useState<Listing[]>([]);
  const [freshListings, setFreshListings] = useState<Listing[]>([]);
  const [localListings, setLocalListings] = useState<Listing[]>([]);
  const [trendingListings, setTrendingListings] = useState<Listing[]>([]);
  const [categorySections, setCategorySections] = useState<CategoryGroup[]>([]);
  const [trendingCategories, setTrendingCategories] = useState<Array<(typeof MARKETPLACE_CATEGORIES)[number] & { id: string; image?: string }>>([]);
  const [activePopularTab, setActivePopularTab] = useState<string>('Mobiles & Tablets');
  const [verifiedSellersListings, setVerifiedSellersListings] = useState<Listing[]>([]);
  const [sellerProfilesMap, setSellerProfilesMap] = useState<Record<string, UserProfile | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, userProfile } = useAuth();
  const { selectedCurrency } = useCurrency();
  const isKycApproved = !!(
    userProfile?.kycStatus === 'APPROVED' || 
    (userProfile?.isKycVerified === true && 
     userProfile?.kycStatus !== 'REVOKED' && 
     userProfile?.kycStatus !== 'PERMANENTLY_REMOVED')
  );
  const location = useLocation();

  const searchPlaceholders = useMemo(() => [
    "Search Mobiles, Cars, Property, Jobs...",
    "What are you looking for today?",
    "Search across Pakistan...",
    "Find premium & verified local deals..."
  ], []);
  const [currentPlaceholderIndex, setCurrentPlaceholderIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPlaceholderIndex((prev) => (prev + 1) % searchPlaceholders.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [searchPlaceholders]);

  const recordCategoryView = (catName: string) => {
    if (!catName || typeof catName !== 'string') return;
    try {
      const key = user?.uid ? `mandi_viewed_categories_${user.uid}` : 'mandi_viewed_categories';
      const viewed = localStorage.getItem(key);
      const list: string[] = viewed ? JSON.parse(viewed) : [];
      const filtered = list.filter(c => c !== catName);
      filtered.unshift(catName);
      localStorage.setItem(key, JSON.stringify(filtered.slice(0, 5)));
    } catch (e) {}
  };

  const recordCategorySearch = (catName: string) => {
    if (!catName || typeof catName !== 'string') return;
    try {
      const key = user?.uid ? `mandi_searched_categories_${user.uid}` : 'mandi_searched_categories';
      const searched = localStorage.getItem(key);
      const list: string[] = searched ? JSON.parse(searched) : [];
      const filtered = list.filter(c => c !== catName);
      filtered.unshift(catName);
      localStorage.setItem(key, JSON.stringify(filtered.slice(0, 5)));
    } catch (e) {}
  };

  const categoriesScrollRef = useRef<HTMLDivElement>(null);
  const verifiedScrollRef = useRef<HTMLDivElement>(null);
  const featuredScrollRef = useRef<HTMLDivElement>(null);
  const priceDroppedScrollRef = useRef<HTMLDivElement>(null);
  const recommendedScrollRef = useRef<HTMLDivElement>(null);
  const popularScrollRef = useRef<HTMLDivElement>(null);
  const localScrollRef = useRef<HTMLDivElement>(null);
  const freshScrollRef = useRef<HTMLDivElement>(null);

  const categoriesDrag = useDragScroll(categoriesScrollRef);
  const verifiedDrag = useDragScroll(verifiedScrollRef);
  const featuredDrag = useDragScroll(featuredScrollRef);
  const priceDroppedDrag = useDragScroll(priceDroppedScrollRef);
  const recommendedDrag = useDragScroll(recommendedScrollRef);
  const popularDrag = useDragScroll(popularScrollRef);
  const localDrag = useDragScroll(localScrollRef);
  const freshDrag = useDragScroll(freshScrollRef);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoriesScrollRef.current) {
      const el = categoriesScrollRef.current;
      const scrollAmount = window.innerWidth * 0.8;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;

      if (direction === 'left') {
        el.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

  const scrollContainer = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (ref.current) {
      const el = ref.current;
      const scrollAmount = window.innerWidth * 0.8;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;

      if (direction === 'left') {
        el.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
      } else {
        el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      }
    }
  };

  useEffect(() => {
    if (!loading && location.hash) {
      const targetId = location.hash.replace('#', '');
      setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location, loading]);
  
  // Search Hub State
  const navigate = useNavigate();
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [selectedLocation, setSelectedLocation] = useState(searchParams.get('location') || 'All Pakistan');
  const [selectedCondition, setSelectedCondition] = useState(searchParams.get('condition') || '');

  const handleSearch = () => {
    if (selectedCategory) {
      recordCategorySearch(selectedCategory);
    }
    updateParams({
      category: selectedCategory || null,
      location: selectedLocation === 'All Pakistan' ? null : selectedLocation,
      condition: selectedCondition || null
    });
    setIsSearchActive(true);
  };
  const filterKeyword = searchParams.get('q') || '';
  const filterCat = searchParams.get('category') || '';
  const filterSubcat = searchParams.get('subcategory') || '';
  const filterLocation = searchParams.get('location') || '';
  const filterMinPrice = searchParams.get('minPrice') || '';
  const filterMaxPrice = searchParams.get('maxPrice') || '';
  const sortBy = searchParams.get('sort') || 'newest';
  const filterCondition = searchParams.get('condition') || '';

  const [localKeyword, setLocalKeyword] = useState(filterKeyword);
  const [localMin, setLocalMin] = useState(filterMinPrice);
  const [localMax, setLocalMax] = useState(filterMaxPrice);

  useEffect(() => {
    if (filterCat) {
      recordCategorySearch(filterCat);
    }
    if (filterKeyword || filterCat || filterSubcat || filterLocation || filterMinPrice || filterMaxPrice || filterCondition) {
      setIsSearchActive(true);
    } else {
      setIsSearchActive(false);
    }
  }, [filterKeyword, filterCat, filterSubcat, filterLocation, filterMinPrice, filterMaxPrice, filterCondition]);

  // Helper to process raw listings + verified users into section arrays
  const applyDataToState = useCallback((
    docs: Listing[],
    profilesMap: Record<string, UserProfile | null>
  ) => {
    setAllListings(docs);
      
      // Expiration helpers
      const isFeaturedActive = (d: Listing) => {
        if (!d.isFeatured) return false;
        if (d.featuredUntil) {
          const fu = d.featuredUntil;
          let expired = false;
          if (typeof fu.toDate === 'function') {
            expired = fu.toDate() < new Date();
          } else if (typeof fu.seconds === 'number') {
            expired = new Date(fu.seconds * 1000) < new Date();
          } else if (fu instanceof Date) {
            expired = fu < new Date();
          } else if (typeof fu === 'number') {
            const timeMs = fu < 10000000000 ? fu * 1000 : fu;
            expired = new Date(timeMs) < new Date();
          } else {
            const dateObj = new Date(fu);
            if (!isNaN(dateObj.getTime())) {
              expired = dateObj < new Date();
            }
          }
          if (expired) return false;
        }
        return true;
      };

      const isBoostedActive = (d: Listing) => {
        if (!d.isBoosted) return false;
        if (d.boostedUntil) {
          const bu = d.boostedUntil;
          let expired = false;
          if (typeof bu.toDate === 'function') {
            expired = bu.toDate() < new Date();
          } else if (typeof bu.seconds === 'number') {
            expired = new Date(bu.seconds * 1000) < new Date();
          } else if (bu instanceof Date) {
            expired = bu < new Date();
          } else if (typeof bu === 'number') {
            const timeMs = bu < 10000000000 ? bu * 1000 : bu;
            expired = new Date(timeMs) < new Date();
          } else {
            const dateObj = new Date(bu);
            if (!isNaN(dateObj.getTime())) {
              expired = dateObj < new Date();
            }
          }
          if (expired) return false;
        }
        return true;
      };

      // Retrieve all active premium & verified seller user IDs using authoritative resolver
      const premiumVerifiedUserIds = new Set<string>();

      // Derive Premium & Verified status from listing owner profiles in profilesMap
      Object.entries(profilesMap).forEach(([ownerId, profile]) => {
        if (profile) {
          primeUserProfileCache(ownerId, profile);
          if (isSellerPremiumActive(profile)) {
            premiumVerifiedUserIds.add(ownerId);
            if (profile.id) premiumVerifiedUserIds.add(profile.id);
          } else {
            premiumVerifiedUserIds.delete(ownerId);
            if (profile.id) premiumVerifiedUserIds.delete(profile.id);
          }
        }
      });

      // Canonical verification helper matching Listings.tsx (/listings?verified=true)
      const isVerifiedProfileActive = (profile: any) => {
        if (!profile) return false;
        const isApproved = profile.kycStatus === 'APPROVED' || profile.isVerified === true;
        if (!isApproved) return false;
        if (profile.isBlocked === true || profile.accountStatus === 'blocked' || profile.accountStatus === 'deleted') {
          return false;
        }
        if (profile.verifiedUntil) {
          const vu = profile.verifiedUntil;
          let expired = false;
          if (typeof vu.toDate === 'function') {
            expired = vu.toDate() < new Date();
          } else if (typeof vu.seconds === 'number') {
            expired = new Date(vu.seconds * 1000) < new Date();
          } else {
            const d = new Date(vu);
            if (!isNaN(d.getTime())) {
              expired = d < new Date();
            }
          }
          if (expired) return false;
        }
        return true;
      };

      // Count unique, active verified sellers across the loaded seller profiles
      const verifiedUsersMap = new Map<string, UserProfile>();
      Object.values(profilesMap).forEach(p => {
        if (p && p.id && (p.isVerified || p.kycStatus === 'APPROVED')) {
          verifiedUsersMap.set(p.id, p);
        }
      });

      const uniqueActiveVerifiedSellers = Array.from(verifiedUsersMap.values()).filter(isVerifiedProfileActive).length;
      if (cachedTotalVerifiedSellersCount === null) {
        cachedTotalVerifiedSellersCount = uniqueActiveVerifiedSellers;
        cachedTotalVerifiedSellersTimestamp = Date.now();
        setTotalVerifiedSellersCount(uniqueActiveVerifiedSellers);
      }

      const isSellerSuspended = (ownerId: string) => {
        if (!ownerId) return false;
        const profile = profilesMap[ownerId];
        if (!profile) return false;
        return Boolean(
          profile.isBlocked ||
          profile.isBanned ||
          profile.accountStatus === 'blocked' ||
          profile.accountStatus === 'banned' ||
          profile.accountStatus === 'deleted'
        );
      };

      const activeDocs = docs.filter(d => {
        if (d.status !== 'LIVE' || d.isSuspended || (d.quantity || 0) <= 0) return false;
        if (isSellerSuspended(d.ownerId || (d as any).sellerId || (d as any).userId)) return false;
        return true;
      });
      const liveDocs = filterListingsByCurrency(activeDocs, selectedCurrency);

      const getListingRank = (d: Listing, premiumFirst: boolean) => {
         const isPrem = premiumVerifiedUserIds.has(d.ownerId);
         const isFeat = isFeaturedActive(d);
         const isBoost = isBoostedActive(d);
         
         if (isPrem && isFeat) return 100;
         
         if (premiumFirst) {
           if (isPrem) return 80;
           if (isFeat) return 60;
         } else {
           if (isFeat) return 80;
           if (isPrem) return 60;
         }
         
         if (isBoost) return 40;
         return 0; // Organic
      };

      const getListingFreshness = (d: Listing) => {
        if (!d?.createdAt) return 0;
        if (typeof d.createdAt.toMillis === 'function') {
          return d.createdAt.toMillis();
        }
        if (typeof d.createdAt.toDate === 'function') {
          const dt = d.createdAt.toDate();
          return dt instanceof Date && !isNaN(dt.getTime()) ? dt.getTime() : 0;
        }
        if (typeof d.createdAt.seconds === 'number') {
          return d.createdAt.seconds * 1000;
        }
        if (typeof (d.createdAt as any)._seconds === 'number') {
          return (d.createdAt as any)._seconds * 1000;
        }
        if (d.createdAt instanceof Date) {
          const t = d.createdAt.getTime();
          return isNaN(t) ? 0 : t;
        }
        if (typeof d.createdAt === 'number') {
          return isNaN(d.createdAt) ? 0 : (d.createdAt < 10000000000 ? d.createdAt * 1000 : d.createdAt);
        }
        if (typeof d.createdAt === 'string') {
          const t = new Date(d.createdAt).getTime();
          return isNaN(t) ? 0 : t;
        }
        return 0;
      };

      const scoreListingActivity = (d: Listing) => {
          // Evaluates views, favorites/saves, and metadata activity
          return (d.views || 0) + (d.saves || 0) * 4 + (isFeaturedActive(d) ? 8 : 0) + (isBoostedActive(d) ? 4 : 0) + (d.images?.length || 0) * 2 + 1;
      };

      // Track used listings to prioritize diverse display across sections (Duplicate Listing Prevention)
      const displayedListingIds = new Set<string>();

      const getDiverseListings = (sortedDocs: Listing[], max: number, strictExcludeIds: string[] = []) => {
          const unique: Listing[] = [];
          const reused: Listing[] = [];
          for (const d of sortedDocs) {
              if (strictExcludeIds.includes(d.id)) {
                continue;
              }
              if (displayedListingIds.has(d.id)) {
                  reused.push(d);
              } else {
                  unique.push(d);
              }
          }
          // Fill with unique first to avoid repeating same listings across blocks
          const result = [...unique, ...reused].slice(0, max);
          result.forEach(d => displayedListingIds.add(d.id));
          return result;
      };

      // Section 2: Featured Discoveries (Paid Featured Showcase)
      // Priority: Featured + Premium, Featured Listings, High-performing Featured
      const featuredDocs = liveDocs.filter(d => isFeaturedActive(d));
      featuredDocs.sort((a, b) => {
         const aPremium = premiumVerifiedUserIds.has(a.ownerId) ? 20000 : 0;
         const bPremium = premiumVerifiedUserIds.has(b.ownerId) ? 20000 : 0;

         const aPerf = aPremium + scoreListingActivity(a);
         const bPerf = bPremium + scoreListingActivity(b);

         if (bPerf !== aPerf) return bPerf - aPerf;
         const freshDiff = getListingFreshness(b) - getListingFreshness(a);
         if (freshDiff !== 0) return freshDiff;
         return (b.id || '').localeCompare(a.id || '');
      });
      const topFeatured = featuredDocs.slice(0, 15);
      topFeatured.forEach(d => displayedListingIds.add(d.id));
      setFeaturedListings(topFeatured);

      // Section 1: Premium & Verified Sellers (Only active Premium & Verified)
      // Priority: Premium + Featured, Premium + Boosted, Premium Only
      const premiumDocs = liveDocs.filter(d => premiumVerifiedUserIds.has(d.ownerId));
      premiumDocs.sort((a, b) => {
         const aFeat = isFeaturedActive(a);
         const bFeat = isFeaturedActive(b);
         const aBoost = isBoostedActive(a);
         const bBoost = isBoostedActive(b);

         const aScore = (aFeat ? 2000 : 0) + (aBoost ? 1000 : 0);
         const bScore = (bFeat ? 2000 : 0) + (bBoost ? 1000 : 0);

         if (bScore !== aScore) return bScore - aScore;
         const freshDiff = getListingFreshness(b) - getListingFreshness(a);
         if (freshDiff !== 0) return freshDiff;
         return (b.id || '').localeCompare(a.id || '');
      });
      setVerifiedSellersListings(getDiverseListings(premiumDocs, 15));

      // Section Price Drops: Genuine discounts with hardening and anti-manipulation validation
      const priceDropDocs = liveDocs.filter(d => isListingEligibleForPriceDrops(d));
      priceDropDocs.sort((a, b) => {
        const discDiff = (b.priceDroppedPercent || 0) - (a.priceDroppedPercent || 0);
        if (discDiff !== 0) return discDiff;
        return getListingFreshness(b) - getListingFreshness(a);
      });
      setPriceDroppedListings(getDiverseListings(priceDropDocs, 15));

      // Category Scoring (for both Trending Categories and Popular Categories dynamically)
      const categoryScores: Record<string, number> = {};
      liveDocs.forEach(d => {
         if (!d.category) return;
         categoryScores[d.category] = (categoryScores[d.category] || 0) + scoreListingActivity(d);
      });
      
      // Sort categories by score descending based on Searches, Views, Favorites, messages & activity
      const dynamicTrendingCategoryNames = Object.keys(categoryScores)
           .sort((a, b) => {
             const diff = categoryScores[b] - categoryScores[a];
             if (diff !== 0) return diff;
             return a.localeCompare(b);
           });

      const trendingCats = dynamicTrendingCategoryNames
           .map(name => {
             const mCat = MARKETPLACE_CATEGORIES.find(c => c.name === name || c.name.toLowerCase() === name.toLowerCase());
             if (!mCat) return null;
             const legacyMatch = CATEGORIES.find(c => c.name === mCat.name || c.id === mCat.name);
             return {
               ...mCat,
               id: mCat.name,
               image: legacyMatch?.image
             };
           })
           .filter(Boolean) as Array<(typeof MARKETPLACE_CATEGORIES)[number] & { id: string; image?: string }>;
           
      const defaultMarketplaceCats = MARKETPLACE_CATEGORIES.map(mCat => {
        const legacyMatch = CATEGORIES.find(c => c.name === mCat.name || c.id === mCat.name);
        return {
          ...mCat,
          id: mCat.name,
          image: legacyMatch?.image
        };
      });

      setTrendingCategories(trendingCats.length > 0 ? trendingCats.slice(0, 10) : defaultMarketplaceCats.slice(0, 10));

      // Section 4: Recommended Picks (Personalized Behavior, search behavior, viewed categories)
      const recommendedDocs = [...liveDocs];
      let searchedCategoriesList: string[] = [];
      let viewedCategoriesList: string[] = [];
      try {
         const searchedKey = user?.uid ? `mandi_searched_categories_${user.uid}` : 'mandi_searched_categories';
         const viewedKey = user?.uid ? `mandi_viewed_categories_${user.uid}` : 'mandi_viewed_categories';
         const searchedHistory = localStorage.getItem(searchedKey);
         if (searchedHistory) searchedCategoriesList = JSON.parse(searchedHistory);
         const viewedHistory = localStorage.getItem(viewedKey);
         if (viewedHistory) viewedCategoriesList = JSON.parse(viewedHistory);
      } catch (e) {
         // fail-silent
      }

      const getRecommendedRelevanceScore = (d: Listing) => {
         let score = 0;
         if (d.category) {
            if (searchedCategoriesList.includes(d.category)) score += 10000;
            if (viewedCategoriesList.includes(d.category)) score += 5000;
         }
         
         // Legitimate engagement activity
         const views = typeof d.views === 'number' && !isNaN(d.views) ? Math.max(0, d.views) : 0;
         const saves = typeof d.saves === 'number' && !isNaN(d.saves) ? Math.max(0, d.saves) : 0;
         score += views * 2 + saves * 8;
         return score;
      };

      recommendedDocs.sort((a, b) => {
        const scoreDiff = getRecommendedRelevanceScore(b) - getRecommendedRelevanceScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        const viewsDiff = (b.views || 0) - (a.views || 0);
        if (viewsDiff !== 0) return viewsDiff;
        return (b.id || '').localeCompare(a.id || '');
      });
      setRecommendedListings(getDiverseListings(recommendedDocs, 15));

      // Section 5: Explore all categories (Expose ALL 23 marketplace categories in working condition)
      const catsSections = MARKETPLACE_CATEGORIES.map(cat => {
         const catDocs = liveDocs.filter(d => d.category === cat.name || d.category?.toLowerCase() === cat.name.toLowerCase());
         catDocs.sort((a, b) => getListingRank(b, false) - getListingRank(a, false));
         return {
            id: cat.name,
            name: cat.name,
            totalCount: catDocs.length,
            listings: catDocs.slice(0, 15) 
         };
      });
      
      setCategorySections(catsSections);
      const hasActiveTab = catsSections.some(s => s.id === activePopularTab);
      if (catsSections.length > 0 && !hasActiveTab) {
         setActivePopularTab(catsSections[0].id);
      }

      // Section 6: Local Deals (Location matching priorities: 1. Area, 2. City, 3. Nearby Areas, 4. Nearby Cities)
      const userCity = userProfile?.city?.trim() || (filterLocation && filterLocation !== 'All Pakistan' ? filterLocation.trim() : '');
      const userArea = userProfile?.locationArea?.trim() || userProfile?.address?.trim() || '';
      
      const getPakistanNearbyCities = (cityName: string): string[] => {
         if (!cityName) return [];
         const c = cityName.toLowerCase().trim();
         if (c.includes('islamabad') || c.includes('rawalpindi')) return ['Islamabad', 'Rawalpindi'];
         if (c.includes('lahore') || c.includes('gujranwala') || c.includes('kasur')) return ['Lahore', 'Gujranwala', 'Kasur'];
         if (c.includes('karachi') || c.includes('hyderabad')) return ['Karachi', 'Hyderabad'];
         if (c.includes('peshawar') || c.includes('mardan')) return ['Peshawar', 'Mardan'];
         if (c.includes('multan') || c.includes('bahawalpur')) return ['Multan', 'Bahawalpur'];
         if (c.includes('faisalabad') || c.includes('sargodha')) return ['Faisalabad', 'Sargodha'];
         return [cityName];
      };

      const getLocalPriorityScore = (d: Listing) => {
         let score = 0;
         const seller = profilesMap[d.ownerId || (d as any).sellerId || (d as any).userId];
         const docCity = (d.city?.trim()) || (seller?.city?.trim()) || '';
         const docArea = (d.locationArea?.trim()) || (d.address?.trim()) || ((seller as any)?.locationArea?.trim()) || (seller?.address?.trim()) || '';
         
         if (userCity) {
           const isSameCity = docCity.toLowerCase().trim() === userCity.toLowerCase().trim();
           const isSameArea = userArea && docArea.toLowerCase().trim() === userArea.toLowerCase().trim();

           if (isSameCity && isSameArea) {
              score += 100000; // Same Area
           } else if (isSameCity) {
              score += 50000;  // Same City
           } else {
              const nearby = getPakistanNearbyCities(userCity);
              const isNearby = nearby.some(nc => nc.toLowerCase().trim() === docCity.toLowerCase().trim());
              if (isNearby) {
                 score += 10000; // Nearby Cities
              }
           }
         }
         // Location relevance remains much stronger than paid promotions, so paid influence is downscaled
         score += getListingRank(d, true) * 0.1;
         return score;
      };

      let localDocs = [...liveDocs];
      localDocs.sort((a, b) => {
        const scoreDiff = getLocalPriorityScore(b) - getLocalPriorityScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        const actDiff = scoreListingActivity(b) - scoreListingActivity(a);
        if (actDiff !== 0) return actDiff;
        const freshDiff = getListingFreshness(b) - getListingFreshness(a);
        if (freshDiff !== 0) return freshDiff;
        return (b.id || '').localeCompare(a.id || '');
      });
      setLocalListings(getDiverseListings(localDocs, 15));

      // Section 7: Just Listed / Recently Added (True recency-driven chronological order)
      const freshDocs = [...liveDocs];
      freshDocs.sort((a, b) => {
         const aFr = getListingFreshness(a);
         const bFr = getListingFreshness(b);
         if (bFr !== aFr) return bFr - aFr;
         const scoreDiff = scoreListingActivity(b) - scoreListingActivity(a);
         if (scoreDiff !== 0) return scoreDiff;
         return (b.id || '').localeCompare(a.id || '');
      });
      setFreshListings(freshDocs.slice(0, 16));

      setBoostedListings(liveDocs.filter(d => isBoostedActive(d)).slice(0, 15));
      setTotalActiveListingsCount(liveDocs.length);
      setSellerProfilesMap(profilesMap);
  }, [selectedCurrency, user?.uid, userProfile?.city, userProfile?.locationArea, userProfile?.address, filterLocation, activePopularTab]);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // 1. Check in-memory homepage cache first
      const cached = getHomepageCache();
      let hasUsableCache = false;

      if (cached) {
        hasUsableCache = true;
        // Instantly populate state from cache to eliminate skeleton flicker on return
        applyDataToState(
          cached.data.allListings,
          cached.data.sellerProfilesMap
        );
        if (cachedTotalLiveListingsCount !== null && isMounted) {
          setTotalActiveListingsCount(cachedTotalLiveListingsCount);
        }
        if (cachedTotalVerifiedSellersCount !== null && isMounted) {
          setTotalVerifiedSellersCount(cachedTotalVerifiedSellersCount);
        }
        if (cachedTotalCountriesCount !== null && isMounted) {
          setTotalCountriesCount(cachedTotalCountriesCount);
        }
        if (cachedTotalActiveCitiesCount !== null && isMounted) {
          setTotalActiveCitiesCount(cachedTotalActiveCitiesCount);
        }
        if (isMounted) {
          setLoading(false);
        }

        // If cache is still fresh (< 4 min), bypass network fetch entirely
        if (!cached.isStale && cachedTotalLiveListingsCount !== null && cachedTotalVerifiedSellersCount !== null && cachedTotalCountriesCount !== null && cachedTotalActiveCitiesCount !== null) {
          return;
        }
      }

      // 2. Fetch fresh data from Firestore (on cold visit or when cache expired)
      try {
        if (!hasUsableCache && isMounted) {
          setLoading(true);
        }

        // 2. Fetch server-side marketplace authoritative metrics in a single consolidated read
        try {
          const marketplaceMetrics = await marketplaceMetricsService.getAuthoritativeMarketplaceMetrics();
          if (marketplaceMetrics) {
            // Live listings count from consolidated metrics
            if (typeof marketplaceMetrics.totalLiveListingsCount === 'number' && marketplaceMetrics.totalLiveListingsCount >= 0) {
              cachedTotalLiveListingsCount = marketplaceMetrics.totalLiveListingsCount;
              cachedTotalLiveListingsTimestamp = Date.now();
              if (isMounted) {
                setTotalActiveListingsCount(marketplaceMetrics.totalLiveListingsCount);
              }
            }
            if (typeof marketplaceMetrics.activeCitiesCount === 'number' && marketplaceMetrics.activeCitiesCount >= 0) {
              cachedTotalActiveCitiesCount = marketplaceMetrics.activeCitiesCount;
              cachedTotalActiveCitiesTimestamp = Date.now();
              if (isMounted) {
                setTotalActiveCitiesCount(marketplaceMetrics.activeCitiesCount);
              }
            }
            if (typeof marketplaceMetrics.countriesCount === 'number' && marketplaceMetrics.countriesCount >= 0) {
              cachedTotalCountriesCount = marketplaceMetrics.countriesCount;
              cachedTotalCountriesTimestamp = Date.now();
              if (isMounted) {
                setTotalCountriesCount(marketplaceMetrics.countriesCount);
              }
            }
            if (typeof marketplaceMetrics.totalVerifiedSellersCount === 'number' && marketplaceMetrics.totalVerifiedSellersCount >= 0) {
              cachedTotalVerifiedSellersCount = marketplaceMetrics.totalVerifiedSellersCount;
              cachedTotalVerifiedSellersTimestamp = Date.now();
              if (isMounted) {
                setTotalVerifiedSellersCount(marketplaceMetrics.totalVerifiedSellersCount);
              }
            }
          }
        } catch (mErr) {
          console.warn("Could not fetch server-side authoritative marketplace metrics:", mErr);
        }

        // 3. Fallback: only execute separate server count query if authoritative metrics were unavailable
        if (cachedTotalLiveListingsCount === null) {
          try {
            const liveCountSnap = await getCountFromServer(
              query(collection(db, 'listings'), where('status', '==', 'LIVE'))
            );
            const liveCount = liveCountSnap.data().count;
            cachedTotalLiveListingsCount = liveCount;
            cachedTotalLiveListingsTimestamp = Date.now();
            if (isMounted) {
              setTotalActiveListingsCount(liveCount);
            }
          } catch (cntErr) {
            console.warn("Could not fetch server-side active listings count fallback:", cntErr);
          }
        }

        let docs: Listing[] = [];
        try {
          const q = query(
            collection(db, 'listings'),
            where('status', 'in', ['LIVE', 'BOOKED', 'SOLD']),
            limit(100)
          );
          const snapshot = await getDocs(q);
          docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Listing));
        } catch (err: any) {
          const errorMsg = err?.message || String(err);
          const isQuota = errorMsg.toLowerCase().includes('quota') || 
                          errorMsg.toLowerCase().includes('resource-exhausted') || 
                          errorMsg.toLowerCase().includes('limit');
          if (isQuota && typeof window !== 'undefined') {
            (window as any).__firestore_quota_exceeded = true;
          }
          console.warn("Home fetch failed due to database limits/quota.", err);
          docs = [];
          if (isMounted) {
            setError("Database is currently under heavy load. Please try again later.");
          }
        }

        // Pre-fetch all unique seller profiles in a single batch to eliminate N+1 queries in ListingCards
        let profilesMap: Record<string, UserProfile | null> = {};
        const uniqueOwnerIds = Array.from(
          new Set(
            docs
              .map(d => d.ownerId || (d as any).sellerId || (d as any).userId)
              .filter((id): id is string => Boolean(id && typeof id === 'string' && id.trim() !== '' && id !== 'guest' && id !== 'anonymous'))
          )
        );

        if (uniqueOwnerIds.length > 0) {
          try {
            profilesMap = await fetchCachedUserProfilesBatch(uniqueOwnerIds);
          } catch (pErr) {
            console.warn("Could not prefetch seller profiles in Home:", pErr);
          }
        }

        // Store into homepage cache
        setHomepageCache({
          allListings: docs,
          verifiedUserProfiles: [],
          sellerProfilesMap: profilesMap,
        });

        if (isMounted) {
          applyDataToState(docs, profilesMap);
        }
      } catch (err: any) {
        console.error("Error fetching homepage data:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Re-run applyDataToState whenever selectedCurrency, allListings, or sellerProfilesMap changes
  useEffect(() => {
    if (allListings && allListings.length > 0) {
      applyDataToState(allListings, sellerProfilesMap);
    }
  }, [allListings, sellerProfilesMap, selectedCurrency, applyDataToState]);

  const filteredResults = useMemo(() => {
    if (!isSearchActive) return [];
    
    let result = allListings.filter(d => {
      const isLive = d.status === 'LIVE' && (d.quantity || 0) > 0;
      const isSold = d.status === 'SOLD' || (d.quantity || 0) <= 0;
      
      if (filterCat === 'Sold Out') {
        if (!isSold) return false;
      } else {
        if (filterCat && d.category !== filterCat) return false;
        // Default behavior: Only show LIVE items. Exclude SOLD and BOOKED
        if (!isLive) return false;
      }

      if (filterSubcat && d.subcategory !== filterSubcat) return false;
      if (filterCondition && d.condition !== filterCondition) return false;
      if (filterLocation && filterLocation !== 'All Pakistan' && d.location !== filterLocation) return false;
      if (filterMinPrice && d.price < Number(filterMinPrice)) return false;
      if (filterMaxPrice && d.price > Number(filterMaxPrice)) return false;

      if (filterKeyword) {
        const queryText = filterKeyword.toLowerCase().trim();
        const keywords = queryText.split(' ').filter(k => k.length > 0);
        const searchableContent = `${d.title} ${d.description} ${d.category} ${d.subcategory || ''} ${d.location || ''}`.toLowerCase();
        return keywords.every(kw => searchableContent.includes(kw));
      }
      return true;
    });

    result = filterListingsByCurrency(result, selectedCurrency);

    result.sort((a, b) => {
      const timeA = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const timeB = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      switch (sortBy) {
        case 'price_low': return a.price - b.price;
        case 'price_high': return b.price - a.price;
        case 'oldest': return timeA - timeB;
        default: return timeB - timeA;
      }
    });

    return result;
  }, [allListings, isSearchActive, filterKeyword, filterCat, filterSubcat, filterLocation, filterMinPrice, filterMaxPrice, sortBy, filterCondition, selectedCurrency]);

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) params.delete(key);
      else params.set(key, value);
    });
    navigate('/listings?' + params.toString());
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (localKeyword) {
        navigate(`/listings?q=${encodeURIComponent(localKeyword)}`);
    } else {
        navigate('/listings');
    }
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
    setLocalKeyword('');
    setLocalMin('');
    setLocalMax('');
    setIsSearchActive(false);
  };

  const getCategoryColor = (name: string) => {
    switch (name) {
      case 'Mobiles & Tablets': return { icon: 'text-indigo-500', bg: 'bg-indigo-50', hover: 'group-hover:bg-indigo-500' };
      case 'Electronics & Appliances': return { icon: 'text-blue-500', bg: 'bg-blue-50', hover: 'group-hover:bg-blue-500' };
      case 'Vehicles': return { icon: 'text-red-500', bg: 'bg-red-50', hover: 'group-hover:bg-red-500' };
      case 'Property': return { icon: 'text-emerald-500', bg: 'bg-emerald-50', hover: 'group-hover:bg-emerald-500' };
      case 'Fashion & Clothing': return { icon: 'text-pink-500', bg: 'bg-pink-50', hover: 'group-hover:bg-pink-500' };
      case 'Home & Living': return { icon: 'text-amber-700', bg: 'bg-amber-50', hover: 'group-hover:bg-amber-700' };
      case 'Sports & Fitness': return { icon: 'text-orange-500', bg: 'bg-orange-50', hover: 'group-hover:bg-orange-500' };
      case 'Kids & Baby Products': return { icon: 'text-purple-500', bg: 'bg-purple-50', hover: 'group-hover:bg-purple-500' };
      case 'Education': return { icon: 'text-indigo-500', bg: 'bg-indigo-50', hover: 'group-hover:bg-indigo-500' };
      case 'Jobs': return { icon: 'text-cyan-600', bg: 'bg-cyan-50', hover: 'group-hover:bg-cyan-600' };
      case 'Business & Industrial': return { icon: 'text-stone-600', bg: 'bg-stone-50', hover: 'group-hover:bg-stone-600' };
      case 'Pets & Animals': return { icon: 'text-yellow-600', bg: 'bg-yellow-50', hover: 'group-hover:bg-yellow-600' };
      case 'Agriculture & Farming': return { icon: 'text-lime-600', bg: 'bg-lime-50', hover: 'group-hover:bg-lime-600' };
      case 'Events & Entertainment': return { icon: 'text-rose-500', bg: 'bg-rose-50', hover: 'group-hover:bg-rose-500' };
      case 'Hobbies & Collectibles': return { icon: 'text-violet-600', bg: 'bg-violet-50', hover: 'group-hover:bg-violet-600' };
      case 'Wholesale & Bulk Deals': return { icon: 'text-teal-500', bg: 'bg-teal-50', hover: 'group-hover:bg-teal-500' };
      default: return { icon: 'text-stone-400', bg: 'bg-stone-50', hover: 'group-hover:bg-amber-500' };
    }
  };

  const selectedCategoryData = MARKETPLACE_CATEGORIES.find(c => c.name === filterCat);
  const subcategories = selectedCategoryData?.subcategories || [];

  return (
    <div className="bg-white min-h-screen">
      <form onSubmit={handleSearchSubmit} className="max-w-[1440px] mx-auto px-4 pt-6 pb-2">
        <div className="flex gap-2 p-1 bg-stone-50 border border-stone-100 rounded-2xl shadow-inner">
          <input
            type="text"
            placeholder={searchPlaceholders[currentPlaceholderIndex]}
            value={localKeyword}
            onChange={(e) => setLocalKeyword(e.target.value)}
            className="flex-grow p-3 bg-transparent text-sm font-medium outline-none text-stone-700 placeholder:text-stone-400 transition-all duration-500"
          />
          <button 
            type="submit"
            className="bg-stone-900 text-white px-6 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-amber-500 transition-all active:scale-95"
          >
            Search
          </button>
        </div>
      </form>
      <AnimatePresence mode="wait">
        {isSearchActive ? (
          <motion.div 
            key="search-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-stone-50 min-h-screen"
          >
             <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-10">
                {/* ADVANCED FILTER BAR RESTORED */}
                <div className="mb-12 bg-white rounded-3xl border border-stone-200 p-6 shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl rounded-full" />
                  <div className="relative z-10 grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-1 space-y-2">
                       <label className="text-xs font-black text-stone-400 uppercase tracking-widest ml-1">Main Categories</label>
                       <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 scroll-smooth">
                          {CATEGORIES.map(cat => (
                            <button 
                              key={cat.id}
                              onClick={() => setSelectedCategory(cat.name === selectedCategory ? '' : cat.name)}
                              className={cn(
                                "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all whitespace-nowrap ",
                                selectedCategory === cat.name ? "bg-stone-900 text-white border-stone-900 shadow-lg" : "bg-white text-stone-400 border-stone-100 hover:border-amber-300"
                              )}
                            >
                              {cat.name}
                            </button>
                          ))}
                       </div>
                    </div>
                    <div className="md:col-span-1 space-y-2">
                       <label className="text-xs font-black text-stone-400 uppercase tracking-widest ml-1">Location Area</label>
                       <LocationSelector 
                         value={selectedLocation} 
                         onChange={(val) => setSelectedLocation(val)} 
                       />
                    </div>
                    <div className="md:col-span-1 space-y-2">
                       <label className="text-xs font-black text-stone-400 uppercase tracking-widest ml-1">Condition</label>
                       <div className="grid grid-cols-2 gap-2">
                          {['NEW', 'USED'].map(cond => (
                            <button 
                               key={cond}
                               onClick={() => setSelectedCondition(cond === selectedCondition ? '' : cond)}
                               className={cn(
                                 "px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all",
                                 selectedCondition === cond ? "bg-amber-500 text-stone-900 border-amber-600 shadow-md" : "bg-white text-stone-400 border-stone-100 hover:border-amber-300"
                               )}
                            >
                               {cond}
                            </button>
                          ))}
                       </div>
                    </div>
                    <div className="md:col-span-1 flex items-end">
                       <button 
                         onClick={handleSearch}
                         className="w-full bg-stone-900 hover:bg-amber-600 hover:text-stone-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                       >
                          <Search className="w-4 h-4" /> Apply Marketplace Filters
                       </button>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                   {subcategories.length > 0 && (
                     <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-8 overflow-hidden"
                     >
                        <div className="flex flex-wrap gap-2">
                           {subcategories.map(sub => (
                             <button 
                                key={sub}
                                onClick={() => updateParams({ subcategory: sub === filterSubcat ? null : sub })}
                                className={cn(
                                   "px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all",
                                   filterSubcat === sub ? "bg-amber-500 border-amber-500 text-stone-900 shadow-lg" : "bg-white border-stone-200 text-stone-400 hover:border-stone-400"
                                )}
                             >
                                {sub}
                             </button>
                           ))}
                        </div>
                     </motion.div>
                   )}
                </AnimatePresence>

                 {loading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-8">
                     {Array.from({ length: 8 }).map((_, i) => (
                       <div key={i} className="aspect-[4/5] bg-white rounded-3xl animate-pulse" />
                     ))}
                  </div>
                ) : filteredResults.length === 0 ? (
                  <div className="py-24 text-center bg-white rounded-[3rem] border border-stone-100 shadow-sm">
                      <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6">
                         <Search className="w-8 h-8 text-stone-200" />
                      </div>
                      <h3 className="text-xl font-black uppercase italic tracking-tighter text-stone-900 mb-2">No results matching filters</h3>
                      <p className="text-xs font-black uppercase tracking-widest text-stone-300 max-w-xs mx-auto">Try broadening your search criteria or reset filters.</p>
                      <button onClick={clearFilters} className="mt-8 px-8 py-3 bg-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-500 hover:text-stone-900 transition-all">Clear Search</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-8">
                     {filteredResults.map((listing, idx) => (
                        <ListingCard 
                          key={listing.id} 
                          listing={listing} 
                          dark={true} 
                          isHomepage={true} 
                          priority={idx < 4}
                          sellerProfile={sellerProfilesMap[listing.ownerId || (listing as any).sellerId || (listing as any).userId]}
                        />
                     ))}
                  </div>
                )}
             </div>
          </motion.div>
        ) : (
          <motion.div 
            key="home-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Marketplace Introduction Banner */}
            <section className="bg-gradient-to-r from-stone-900 to-stone-950 text-white rounded-2xl md:rounded-3xl mx-2 md:mx-4 my-2 md:my-6 p-4 md:p-6 lg:p-10 border border-stone-800 relative overflow-hidden max-w-[1440px] lg:mx-auto">
              <div className="absolute top-0 right-0 w-48 h-48 md:w-[400px] md:h-[400px] bg-amber-500/10 rounded-full blur-[60px] md:blur-[100px] pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-32 h-32 md:w-[300px] md:h-[300px] bg-blue-500/10 rounded-full blur-[40px] md:blur-[80px] pointer-events-none" />
              <div className="relative z-10 space-y-4 lg:space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6">
                  <div className="space-y-2 md:space-y-4 max-w-2xl">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 md:px-3 md:py-1 bg-amber-500/10 border border-amber-500/25 rounded-full text-amber-400 text-xs md:text-xs font-black uppercase tracking-[0.2em]">
                       <Crown className="w-2.5 h-2.5 fill-amber-450" /> Welcome to Avora
                    </div>
                    <h1 className="text-xl sm:text-2xl lg:text-5xl font-black italic uppercase tracking-tighter leading-tight text-white mb-0.5 md:mb-2">
                      Buy & Sell <span className="text-amber-500">Worldwide</span>
                    </h1>
                    <p className="text-stone-400 font-medium text-xs sm:text-xs lg:text-sm max-w-md leading-tight">
                       A premium self-adjusting localized discovery network for smart trades and secure commerce worldwide.
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 md:gap-2 text-xs sm:text-xs lg:text-sm font-bold text-stone-300 pt-1.5 md:pt-2 border-t border-stone-800/60 mt-2">
                      <div className="flex items-center gap-1 md:gap-2">
                        <span className="text-emerald-500">✓</span> KYC Verified
                      </div>
                      <div className="flex items-center gap-1 md:gap-2">
                        <span className="text-emerald-500">✓</span> Trusted Market
                      </div>
                      <div className="flex items-center gap-1 md:gap-2">
                        <span className="text-emerald-500">✓</span> Premium Ads
                      </div>
                      <div className="flex items-center gap-1 md:gap-2">
                        <span className="text-emerald-500">✓</span> Secure Buying
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3D Action Dock: Post Ad, Explore, Battle Bids Arena, Private Negotiation */}
                <div className="pt-3 border-t border-stone-800/80">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400 mb-2 flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-amber-400 animate-pulse" /> Marketplace Launchpad
                  </div>
                  <Homepage3DActionGrid />
                </div>
              </div>
            </section>

            {/* Battle Bids Arena Introduction */}
            <ArenaHero />

            {/* Happening Now Real-Time Activity Feed Section */}
            <section className="pt-2.5 pb-3 lg:pt-4 lg:pb-6 bg-stone-900 overflow-hidden relative border-b border-stone-850">
              <div className="absolute top-0 right-0 w-[450px] h-[450px] bg-amber-500/[0.02] rounded-full blur-[120px] pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-[450px] h-[450px] bg-rose-500/[0.02] rounded-full blur-[120px] pointer-events-none" />
              <div className="max-w-[1440px] mx-auto px-4 lg:px-8 relative z-10">
                <HappeningNow listings={filterListingsByCurrency(allListings, selectedCurrency)} isHomePage={true} />
              </div>
            </section>

             {/* 2.5 Price Drops Section - Styled Dark / Sleek Golden */}
             <section id="daily-price-drops" className="pt-2.5 pb-3 lg:pt-4 lg:pb-6 bg-stone-900 overflow-hidden relative border-b border-stone-850">
               <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[100px] -translate-y-1/2 -translate-x-1/4 pointer-events-none" />
               
               <div className="max-w-[1440px] mx-auto px-4 lg:px-8 relative z-10">
                 <div className="flex items-center justify-between mb-4 lg:mb-8">
                   <div>
                     <h2 className="text-xl lg:text-3xl font-black italic uppercase tracking-tighter text-white leading-none">
                        Hot <span className="text-amber-500">Price Drops</span>
                     </h2>
                   </div>
                   <Link to="/listings?filter=price-drops" className="flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-stone-950 border border-stone-850 rounded-xl text-xs font-black uppercase tracking-widest text-stone-300 hover:text-amber-400 hover:border-amber-500/50 transition-all shadow-sm">
                     Explore Deals <ArrowRight className="w-4 h-4 animate-bounce" />
                   </Link>
                 </div>

                 {loading ? (
                   <div className="h-80 flex items-center justify-center text-stone-400 font-black italic uppercase tracking-widest animate-pulse text-sm">Tracking Live Reductions...</div>
                 ) : priceDroppedListings.length > 0 ? (
                   <div className="relative group/scroll-list">
                     {/* Left Scroll Trigger */}
                     <button
                       type="button"
                       onClick={() => scrollContainer(priceDroppedScrollRef, 'left')}
                       className="absolute -left-2 sm:-left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-950 border border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100 animate-in fade-in zoom-in-95"
                       aria-label="Scroll Left"
                     >
                       <ChevronLeft className="w-5 h-5 font-black" />
                     </button>

                     <div 
                       ref={priceDroppedScrollRef} 
                       {...priceDroppedDrag}
                       className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-4 lg:pb-6 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
                     >
                        {priceDroppedListings.map((listing, idx) => (
                           <div key={listing.id} className="w-[56vw] sm:w-[50vw] md:w-[320px] shrink-0 " onDragStart={(e) => e.preventDefault()}>
                              <ListingCard 
                                listing={listing} 
                                isHomepage={true} 
                                dark={true} 
                                priority={idx < 2}
                                sellerProfile={sellerProfilesMap[listing.ownerId || (listing as any).sellerId || (listing as any).userId]}
                              />
                           </div>
                        ))}
                     </div>

                     {/* Right Scroll Trigger */}
                     <button
                       type="button"
                       onClick={() => scrollContainer(priceDroppedScrollRef, 'right')}
                       className="absolute -right-2 sm:-right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-950 border border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100 animate-in fade-in zoom-in-95"
                       aria-label="Scroll Right"
                     >
                       <ChevronRight className="w-5 h-5 font-black" />
                     </button>
                   </div>
                 ) : (
                   <div className="bg-stone-950 border border-stone-850 rounded-[3rem] p-16 text-center">
                      <div className="text-4xl mb-4">📉</div>
                      <p className="font-semibold text-stone-400 uppercase tracking-widest text-xs sm:text-xs">Tracking daily bargains... Watchlist an item to receive drops instantly!</p>
                   </div>
                 )}
               </div>
             </section>

            {/* 2. Featured Ads Section (Emerald Highlight) - Styled Dark */}
            <section id="featured-listings" className="py-3 lg:py-6 bg-gradient-to-b from-stone-950 to-stone-900 overflow-hidden relative border-b border-stone-900">

              <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/4 pointer-events-none" />
              
              <div className="max-w-[1440px] mx-auto px-4 lg:px-8 relative z-10">
                <div className="flex items-center justify-between mb-4 lg:mb-8">
                  <div>
                    <h2 className="text-xl lg:text-3xl font-black italic uppercase tracking-tighter text-white leading-none">
                       Featured <span className="text-emerald-400">Listings</span>
                    </h2>
                  </div>
                  <Link to="/listings?filter=featured" className="flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs font-black uppercase tracking-widest text-stone-300 hover:text-emerald-400 hover:border-emerald-500/50 transition-all shadow-sm">
                    View All <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                {loading ? (
                  <div className="h-80 flex items-center justify-center text-stone-400 font-black italic uppercase tracking-widest animate-pulse text-sm">Loading Treasures...</div>
                ) : featuredListings.length > 0 ? (
                  <div className="relative group/scroll-list">
                    {/* Left Scroll Trigger */}
                    <button
                      type="button"
                      onClick={() => scrollContainer(featuredScrollRef, 'left')}
                      className="absolute -left-2 sm:-left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                      aria-label="Scroll Left"
                    >
                      <ChevronLeft className="w-5 h-5 font-black" />
                    </button>

                    <div 
                      ref={featuredScrollRef} 
                      {...featuredDrag}
                      className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-4 lg:pb-6 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
                    >
                       {featuredListings.map(listing => (
                          <div key={listing.id} className="w-[56vw] sm:w-[50vw] md:w-[320px] shrink-0 " onDragStart={(e) => e.preventDefault()}>
                             <ListingCard 
                               listing={listing} 
                               premium 
                               dark={true} 
                               isHomepage={true} 
                               sellerProfile={sellerProfilesMap[listing.ownerId || (listing as any).sellerId || (listing as any).userId]}
                             />
                          </div>
                       ))}
                    </div>

                    {/* Right Scroll Trigger */}
                    <button
                      type="button"
                      onClick={() => scrollContainer(featuredScrollRef, 'right')}
                      className="absolute -right-2 sm:-right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                      aria-label="Scroll Right"
                    >
                      <ChevronRight className="w-5 h-5 font-black" />
                    </button>
                  </div>
                ) : (
                  <div className="bg-stone-900/40 border-4 border-dashed border-stone-800 rounded-[3rem] p-20 text-center">
                     <Rocket className="w-16 h-16 text-stone-700 mx-auto mb-6" />
                     <p className="font-black text-stone-400 uppercase italic text-lg">Seeking the extraordinary...</p>
                  </div>
                )}
              </div>
            </section>

            {/* 6.5. Recently Added Section - Styled Dark */}
            <section id="just-listed" className="pt-3 pb-2 lg:pt-6 lg:pb-3 bg-stone-900 overflow-hidden relative border-b border-stone-850">
              <div className="max-w-[1440px] mx-auto px-4 lg:px-8 relative z-10">
                <div className="flex items-center justify-between mb-4 lg:mb-8">
                  <div>
                    <h2 className="text-xl lg:text-3xl font-black italic uppercase tracking-tighter text-white leading-none">
                       Just <span className="text-rose-400">Listed</span>
                    </h2>
                  </div>
                  <Link to="/listings?sort=newest" className="flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs font-black uppercase tracking-widest text-stone-300 hover:text-rose-400 hover:border-rose-500/50 transition-all shadow-sm">
                    View All <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                {loading ? (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="aspect-[4/5] bg-stone-950 rounded-3xl animate-pulse" />
                    ))}
                  </div>
                ) : freshListings.length > 0 ? (
                  <div className="relative group/scroll-list">
                    {/* Left Scroll Trigger */}
                    <button
                      type="button"
                      onClick={() => scrollContainer(freshScrollRef, 'left')}
                      className="absolute -left-2 sm:-left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                      aria-label="Scroll Left"
                    >
                      <ChevronLeft className="w-5 h-5 font-black" />
                    </button>

                    <div 
                      ref={freshScrollRef} 
                      {...freshDrag}
                      className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-1 lg:pb-2 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
                    >
                       {freshListings.map(listing => (
                          <div key={listing.id} className="w-[56vw] sm:w-[50vw] md:w-[320px] shrink-0 " onDragStart={(e) => e.preventDefault()}>
                             <ListingCard 
                               listing={listing} 
                               dark={true} 
                               isHomepage={true} 
                               sellerProfile={sellerProfilesMap[listing.ownerId || (listing as any).sellerId || (listing as any).userId]}
                             />
                          </div>
                       ))}
                    </div>

                    {/* Right Scroll Trigger */}
                    <button
                      type="button"
                      onClick={() => scrollContainer(freshScrollRef, 'right')}
                      className="absolute -right-2 sm:-right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                      aria-label="Scroll Right"
                    >
                      <ChevronRight className="w-5 h-5 font-black" />
                    </button>
                  </div>
                ) : (
                  <div className="bg-stone-950/40 border-4 border-dashed border-stone-800 rounded-[3rem] p-20 text-center">
                     <Clock className="w-16 h-16 text-stone-700 mx-auto mb-6" />
                     <p className="font-black text-stone-400 uppercase italic text-lg">No listings added recently</p>
                  </div>
                )}
              </div>
            </section>

            {/* Most Viewed Real-Time Social Proof Section */}
            <section id="most-viewed" className="pt-3 pb-6 lg:pt-4 lg:pb-10 bg-stone-900 overflow-hidden relative border-b border-stone-950">
              <div className="absolute top-0 left-12 w-[350px] h-[350px] bg-sky-500/[0.02] rounded-full blur-[100px] pointer-events-none" />
              <div className="absolute bottom-6 right-20 w-[350px] h-[350px] bg-amber-500/[0.015] rounded-full blur-[100px] pointer-events-none" />
              <div className="max-w-[1440px] mx-auto px-4 lg:px-8 relative z-10">
                <MostViewed listings={filterListingsByCurrency(allListings, selectedCurrency)} sellerProfilesMap={sellerProfilesMap} />
              </div>
            </section>

            {/* 5. Recommended Picks Section (Blue Highlight) - Styled Dark */}
            <section className="py-3 lg:py-6 bg-stone-950 overflow-hidden relative border-b border-stone-900">
              <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/4 pointer-events-none" />
              
              <div className="max-w-[1440px] mx-auto px-4 lg:px-8 relative z-10">
                <div className="flex items-center justify-between mb-4 lg:mb-8">
                  <div>
                    <h2 className="text-xl lg:text-3xl font-black italic uppercase tracking-tighter text-white leading-none">
                       Recommended <span className="text-blue-400">For You</span>
                    </h2>
                  </div>
                  <Link to="/listings?sort=recommended" className="flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs font-black uppercase tracking-widest text-stone-300 hover:text-blue-400 hover:border-blue-500/50 transition-all shadow-sm">
                    View All <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                {loading ? (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="aspect-[4/5] bg-stone-900 rounded-3xl animate-pulse" />
                    ))}
                  </div>
                ) : recommendedListings.length > 0 ? (
                  <div className="relative group/scroll-list">
                    {/* Left Scroll Trigger */}
                    <button
                      type="button"
                      onClick={() => scrollContainer(recommendedScrollRef, 'left')}
                      className="absolute -left-2 sm:-left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                      aria-label="Scroll Left"
                    >
                      <ChevronLeft className="w-5 h-5 font-black" />
                    </button>

                    <div 
                      ref={recommendedScrollRef} 
                      {...recommendedDrag}
                      className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-4 lg:pb-6 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
                    >
                       {recommendedListings.map(listing => (
                          <div key={listing.id} className="w-[56vw] sm:w-[50vw] md:w-[320px] shrink-0 " onDragStart={(e) => e.preventDefault()}>
                             <ListingCard 
                               listing={listing} 
                               dark={true} 
                               isHomepage={true} 
                               sellerProfile={sellerProfilesMap[listing.ownerId || (listing as any).sellerId || (listing as any).userId]}
                             />
                          </div>
                       ))}
                    </div>

                    {/* Right Scroll Trigger */}
                    <button
                      type="button"
                      onClick={() => scrollContainer(recommendedScrollRef, 'right')}
                      className="absolute -right-2 sm:-right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                      aria-label="Scroll Right"
                    >
                      <ChevronRight className="w-5 h-5 font-black" />
                    </button>
                  </div>
                ) : (
                  <div className="bg-stone-900/40 border-4 border-dashed border-stone-800 rounded-[3rem] p-20 text-center">
                     <Package className="w-16 h-16 text-stone-700 mx-auto mb-6" />
                     <p className="font-black text-stone-400 uppercase italic text-lg">Tailoring your experience...</p>
                  </div>
                )}
              </div>
            </section>

            {/* 6. Local Listings Section - Styled Dark */}
            <section className="py-3 lg:py-6 bg-stone-900 overflow-hidden relative border-b border-stone-850">
              <div className="max-w-[1440px] mx-auto px-4 lg:px-8 relative z-10">
                <div className="flex items-center justify-between mb-4 lg:mb-8">
                  <div>
                    <h2 className="text-xl lg:text-3xl font-black italic uppercase tracking-tighter text-white leading-none">
                       Local <span className="text-indigo-400">Deals</span>
                    </h2>
                  </div>
                  <Link to={userProfile?.city || (filterLocation && filterLocation !== 'All Pakistan' ? filterLocation : '') ? `/listings?location=${encodeURIComponent(userProfile?.city || filterLocation)}&filter=local` : `/listings?filter=local`} className="flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs font-black uppercase tracking-widest text-stone-300 hover:text-indigo-400 hover:border-indigo-500/50 transition-all shadow-sm">
                    Explore Region <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                {loading ? (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="aspect-[4/5] bg-stone-950 rounded-3xl animate-pulse" />
                    ))}
                  </div>
                ) : localListings.length > 0 ? (
                  <div className="relative group/scroll-list">
                    {/* Left Scroll Trigger */}
                    <button
                      type="button"
                      onClick={() => scrollContainer(localScrollRef, 'left')}
                      className="absolute -left-2 sm:-left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                      aria-label="Scroll Left"
                    >
                      <ChevronLeft className="w-5 h-5 font-black" />
                    </button>

                    <div 
                      ref={localScrollRef} 
                      {...localDrag}
                      className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-4 lg:pb-6 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
                    >
                       {localListings.map(listing => (
                          <div key={listing.id} className="w-[56vw] sm:w-[50vw] md:w-[320px] shrink-0 " onDragStart={(e) => e.preventDefault()}>
                             <ListingCard 
                               listing={listing} 
                               dark={true} 
                               isHomepage={true} 
                               sellerProfile={sellerProfilesMap[listing.ownerId || (listing as any).sellerId || (listing as any).userId]}
                             />
                          </div>
                       ))}
                    </div>

                    {/* Right Scroll Trigger */}
                    <button
                      type="button"
                      onClick={() => scrollContainer(localScrollRef, 'right')}
                      className="absolute -right-2 sm:-right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                      aria-label="Scroll Right"
                    >
                      <ChevronRight className="w-5 h-5 font-black" />
                    </button>
                  </div>
                ) : (
                  <div className="bg-stone-950/40 border-4 border-dashed border-stone-800 rounded-[3rem] p-20 text-center">
                     <MapPin className="w-16 h-16 text-stone-700 mx-auto mb-6" />
                     <p className="font-black text-stone-400 uppercase italic text-lg">No local deals yet</p>
                  </div>
                )}
              </div>
            </section>

            {/* 3. Trending Categories Section */}
            <section className="py-4 lg:py-6 bg-stone-50">
              <div className="max-w-[1440px] mx-auto px-4 lg:px-8 mb-4">
                 <div className="flex items-center justify-between">
                   <div>
                     <h2 className="text-2xl lg:text-3xl font-black italic uppercase tracking-tighter text-stone-900 leading-none">
                        Trending <span className="text-stone-400">Categories</span>
                     </h2>
                   </div>
                   <Link to="/listings" className="flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-stone-100 border border-stone-200 rounded-xl text-xs font-black uppercase tracking-widest text-stone-600 hover:text-amber-600 hover:border-amber-500/50 hover:bg-amber-50 transition-all shadow-sm">
                      View All <ArrowRight className="w-4 h-4" />
                   </Link>
                 </div>
              </div>
              <div className="relative group max-w-[1440px] mx-auto">
                <button
                    onClick={() => scrollCategories('left')}
                    className="absolute -left-2 sm:-left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-white/95 border-2 border-stone-200 backdrop-blur shadow-xl rounded-full flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                    aria-label="Scroll Categories Left"
                >
                    <ChevronLeft className="w-5 h-5 font-black" />
                </button>
                <div 
                  ref={categoriesScrollRef} 
                  {...categoriesDrag}
                  className="px-4 lg:px-8 overflow-x-auto pb-8 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
                >
                  <div className="flex flex-row gap-4 md:gap-6 min-w-max" onDragStart={(e) => e.preventDefault()}>
                    {(trendingCategories.length > 0 ? trendingCategories : MARKETPLACE_CATEGORIES.map(mCat => {
                      const legacyMatch = CATEGORIES.find(c => c.name === mCat.name || c.id === mCat.name);
                      return {
                        ...mCat,
                        id: mCat.name,
                        image: legacyMatch?.image
                      };
                    })).map(cat => {
                      const colors = getCategoryColor(cat.name);
                      const IconComponent = cat.icon || Package;
                      return (
                        <button 
                          key={cat.name} 
                          onClick={() => {
                            recordCategoryView(cat.name);
                            recordCategorySearch(cat.name);
                            updateParams({ category: cat.name, subcategory: null });
                          }}
                          className={cn(
                            "w-[120px] md:w-[150px] shrink-0  group/cat relative rounded-[2rem] p-3 md:p-4 flex flex-col items-center justify-center gap-3 md:gap-4 transition-all duration-500 hover:shadow-2xl hover:shadow-amber-500/20 hover:-translate-y-2 border border-stone-200/50 shadow-sm",
                            colors.bg
                          )}
                        >
                          <div className="w-20 h-20 md:w-28 md:h-28 rounded-full overflow-hidden shadow-[0_0_15px_rgba(0,0,0,0.15)] ring-4 ring-white/60 transition-all duration-500 group-hover/cat:scale-110 group-hover/cat:shadow-[0_0_25px_rgba(251,191,36,0.6)] group-hover/cat:ring-amber-500/50 relative flex items-center justify-center bg-stone-100">
                             <div className="absolute inset-0 bg-gradient-to-tr from-black/10 to-transparent z-10" />
                             {cat.image ? (
                               <img src={cat.image} alt={cat.name} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover relative z-0" />
                             ) : (
                               <IconComponent className="w-8 h-8 md:w-12 md:h-12 text-stone-600 relative z-0" />
                             )}
                          </div>
                          <span className="text-xs md:text-xs font-black uppercase tracking-tight text-stone-900 text-center leading-tight px-1">{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                    onClick={() => scrollCategories('right')}
                    className="absolute -right-2 sm:-right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-white/95 border-2 border-stone-200 backdrop-blur shadow-xl rounded-full flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                    aria-label="Scroll Categories Right"
                >
                    <ChevronRight className="w-5 h-5 font-black" />
                </button>
              </div>
            </section>

            {/* 1. Premium & Verified Sellers Section (Golden Highlight) - Styled Dark */}
            <section className="py-3 lg:py-6 bg-stone-950 overflow-hidden relative border-y border-stone-900">
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-amber-500/5 rounded-full blur-[140px] pointer-events-none" />
               
               <div className="max-w-[1440px] mx-auto px-4 lg:px-8 relative z-10">
                  <div className="flex items-center justify-between mb-4 lg:mb-8">
                     <div>
                        <div className="flex items-center gap-2 text-amber-500 font-black text-xs uppercase tracking-[0.4em] mb-2 lg:mb-3">
                           Trusted Network
                        </div>
                        <h2 className="text-xl lg:text-3xl font-black italic uppercase tracking-tighter text-white leading-none">
                           Premium <span className="text-amber-500">Sellers</span>
                        </h2>
                     </div>
                     <Link to="/listings?verified=true" className="flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs font-black uppercase tracking-widest text-stone-300 hover:text-amber-500 hover:border-amber-500/50 transition-all shadow-sm">
                        View All <ArrowRight className="w-4 h-4" />
                     </Link>
                  </div>

                  {loading ? (
                    <div className="h-48 flex items-center justify-center text-stone-400 animate-pulse font-black uppercase tracking-widest text-xs">Authenticating Sellers...</div>
                      ) : verifiedSellersListings.length > 0 ? (
                    <div className="relative group/scroll-list">
                      {/* Left Scroll Trigger */}
                      <button
                        type="button"
                        onClick={() => scrollContainer(verifiedScrollRef, 'left')}
                        className="absolute -left-2 sm:-left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                        aria-label="Scroll Left"
                      >
                        <ChevronLeft className="w-5 h-5 font-black" />
                      </button>

                      <div 
                        ref={verifiedScrollRef} 
                        {...verifiedDrag}
                        className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-4 lg:pb-12 scrollbar-none scroll-smooth cursor-grab active:cursor-grabbing select-none"
                      >
                         {verifiedSellersListings.map(listing => (
                            <div key={listing.id} className="w-[56vw] sm:w-[50vw] md:w-[320px] shrink-0 " onDragStart={(e) => e.preventDefault()}>
                               <ListingCard 
                                 listing={listing} 
                                 dark={true} 
                                 isHomepage={true} 
                                 sellerProfile={sellerProfilesMap[listing.ownerId || (listing as any).sellerId || (listing as any).userId]}
                               />
                            </div>
                         ))}
                      </div>

                      {/* Right Scroll Trigger */}
                      <button
                        type="button"
                        onClick={() => scrollContainer(verifiedScrollRef, 'right')}
                        className="absolute -right-2 sm:-right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                        aria-label="Scroll Right"
                      >
                        <ChevronRight className="w-5 h-5 font-black" />
                      </button>
                    </div>
                  ) : (
                    <div className="py-24 text-center bg-stone-900/40 border border-stone-800 rounded-[3rem] shadow-sm">
                       <Users className="w-16 h-16 text-stone-700 mx-auto mb-6" />
                       <p className="text-xs font-black uppercase tracking-widest text-stone-400">New verified members incoming</p>
                    </div>
                  )}
               </div>
            </section>

            {/* 5. Explore all categories */}
            <section className="py-8 lg:py-12 bg-stone-900 border-b border-stone-850 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/4 pointer-events-none" />
              
              <div className="max-w-[1440px] mx-auto px-4 lg:px-8 relative z-10">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8 lg:mb-10">
                  <div>
                    <h2 className="text-2xl lg:text-4xl font-black italic uppercase tracking-tighter text-white leading-none">
                       Explore all <span className="text-amber-500">categories</span>
                    </h2>
                  </div>
                  
                  {/* Category Tabs */}
                  {categorySections.length > 0 && (
                     <div className="flex flex-row overflow-x-auto gap-2 lg:gap-3 pb-2 scrollbar-none">
                       {categorySections.map(section => (
                         <button
                           key={section.id}
                           onClick={() => {
                             setActivePopularTab(section.id);
                             recordCategoryView(section.name || section.id);
                           }}
                           className={cn(
                             "px-5 py-2.5 rounded-2xl text-xs lg:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                             activePopularTab === section.id 
                               ? "bg-amber-500 text-stone-950 border-amber-500 shadow-lg transform scale-105" 
                               : "bg-stone-950 text-stone-400 border-stone-800 hover:border-stone-700 hover:bg-stone-850 hover:text-white"
                           )}
                         >
                           {section.name}
                         </button>
                       ))}
                     </div>
                  )}
                </div>

                {loading ? (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="aspect-[4/5] bg-stone-800 rounded-3xl animate-pulse" />
                    ))}
                  </div>
                ) : categorySections.length > 0 ? (
                  (() => {
                    const activeGroup = categorySections.find(s => s.id === activePopularTab);
                    const tabListings = activeGroup?.listings || [];
                    const totalCategoryCount = activeGroup?.totalCount ?? tabListings.length;
                    
                    if (tabListings.length > 0) {
                      return (
                        <div className="space-y-4">
                          {/* Active Category Header Action Bar */}
                          <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-950/90 border border-stone-800 rounded-2xl p-3 sm:p-4 shadow-md">
                            <div className="flex items-center gap-2.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                              <span className="text-xs sm:text-sm font-black text-white uppercase tracking-wide">
                                {activePopularTab} <span className="text-stone-400 font-bold text-xs">({totalCategoryCount} active listings)</span>
                              </span>
                            </div>
                            <Link 
                              to={`/listings?category=${encodeURIComponent(activePopularTab)}`}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 duration-200"
                            >
                              Explore {activePopularTab} <ArrowRight className="w-4 h-4" />
                            </Link>
                          </div>

                          <div className="relative group/scroll-list">
                            {/* Left Scroll Trigger */}
                            <button
                              type="button"
                              onClick={() => scrollContainer(popularScrollRef, 'left')}
                              className="absolute -left-2 sm:-left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-950/95 border-2 border-stone-800 backdrop-blur shadow-xl rounded-full flex items-center justify-center text-stone-300 hover:text-amber-450 hover:bg-stone-900 hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                              aria-label="Scroll Left"
                            >
                              <ChevronLeft className="w-5 h-5 font-black" />
                            </button>

                            <div 
                              ref={popularScrollRef} 
                              {...popularDrag}
                              className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-4 lg:pb-8 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
                            >
                               {tabListings.map(listing => (
                                 <div key={listing.id} className="w-[56vw] sm:w-[50vw] md:w-[320px] shrink-0 " onDragStart={(e) => e.preventDefault()}>
                                    <ListingCard 
                                      listing={listing} 
                                      dark={true} 
                                      isHomepage={true} 
                                      sellerProfile={sellerProfilesMap[listing.ownerId || (listing as any).sellerId || (listing as any).userId]}
                                    />
                                 </div>
                               ))}
                            </div>

                            {/* Right Scroll Trigger */}
                            <button
                              type="button"
                              onClick={() => scrollContainer(popularScrollRef, 'right')}
                              className="absolute -right-2 sm:-right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-950/95 border-2 border-stone-800 backdrop-blur shadow-xl rounded-full flex items-center justify-center text-stone-300 hover:text-amber-450 hover:bg-stone-900 hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
                              aria-label="Scroll Right"
                            >
                              <ChevronRight className="w-5 h-5 font-black" />
                            </button>
                          </div>

                          {/* Mobile-Friendly Bottom Explore Link */}
                          <div className="flex justify-center pt-2">
                            <Link 
                              to={`/listings?category=${encodeURIComponent(activePopularTab)}`}
                              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-stone-950 hover:bg-stone-850 text-amber-500 border border-amber-500/30 hover:border-amber-500 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                            >
                              Explore all {activePopularTab} deals under /listings <ArrowRight className="w-4 h-4" />
                            </Link>
                          </div>
                        </div>
                      );
                    } else {
                      const activeCatData = MARKETPLACE_CATEGORIES.find(c => c.name === activePopularTab);
                      const ActiveIcon = activeCatData?.icon || LayoutGrid;
                      return (
                        <div className="w-full flex flex-col items-center justify-center py-10 px-6 bg-stone-950 rounded-3xl border border-stone-850 text-center max-w-xl mx-auto my-2 shadow-inner">
                          <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mb-4 border border-amber-500/15">
                             <ActiveIcon className="w-6 h-6 animate-pulse" />
                          </div>
                          <h3 className="font-extrabold text-white uppercase italic tracking-tight text-xs lg:text-sm mb-1.5">
                             No Listings in {activePopularTab} Yet
                          </h3>
                          <p className="text-stone-400 font-medium text-xs lg:text-xs max-w-sm mx-auto mb-5 leading-relaxed">
                             Be the first to post a listing under {activePopularTab}! Free, fast & secure.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <Link 
                              to={`/submit?category=${encodeURIComponent(activePopularTab)}`} state={{ forceReset: true }}
                              className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black uppercase tracking-widest rounded-xl shadow-md transition-all active:scale-95 duration-200"
                            >
                               Post Ad in {activePopularTab}
                            </Link>
                            <Link 
                              to={`/listings?category=${encodeURIComponent(activePopularTab)}`}
                              className="inline-flex items-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-stone-200 text-xs font-black uppercase tracking-widest rounded-xl border border-stone-700 transition-all active:scale-95 duration-200"
                            >
                               Explore {activePopularTab} <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      );
                    }
                  })()
                ) : (
                   <div className="bg-stone-950 border-4 border-dashed border-stone-800 rounded-[3rem] p-20 text-center">
                     <LayoutGrid className="w-16 h-16 text-stone-700 mx-auto mb-6" />
                     <p className="font-black text-stone-450 uppercase italic text-lg">No popular listings found</p>
                  </div>
                )}
              </div>
            </section>

            {/* KYC Verification Info Section */}
            <section className="py-6 lg:py-10 bg-stone-50 border-t border-b border-stone-200">
               <div className="max-w-[1200px] mx-auto px-4 text-center flex flex-col items-center">
                 <div className="w-10 h-10 lg:w-12 lg:h-12 bg-blue-500/10 text-blue-600 rounded-full flex items-center justify-center border border-blue-500/20 mb-3 lg:mb-4 mx-auto animate-pulse">
                    <ShieldCheck className="w-5 h-5 lg:w-6 lg:h-6 text-blue-600" />
                 </div>
                 <h2 className="text-xl lg:text-3xl font-black italic uppercase tracking-tighter text-stone-900 leading-none mb-2 lg:mb-3">
                    Deal Safely with <span className="text-blue-600">Verified Sellers</span>
                 </h2>
                 <p className="text-stone-600 font-medium mb-6 lg:mb-8 max-w-2xl mx-auto text-[10px] sm:text-xs lg:text-sm leading-relaxed">
                    We verify seller identities through national verification to protect you. Look for the <span className="font-bold text-blue-600">Blue Tick</span> or <span className="font-bold text-amber-600">Golden Crown</span> to buy from authenticated merchants.
                 </p>

                 {/* Real-time statistics Grid */}
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 w-full max-w-4xl mb-6 lg:mb-8 pt-4 lg:pt-6 border-t border-stone-200/60">
                   {[
                     { 
                       label: "Active Listings", 
                       value: totalActiveListingsCount !== null ? totalActiveListingsCount.toLocaleString() : (loading ? "..." : "0"), 
                       desc: "Fresh inventory", 
                       emoji: "📦" 
                     },
                     { 
                       label: "Verified Sellers", 
                       value: totalVerifiedSellersCount !== null ? totalVerifiedSellersCount.toLocaleString() : (loading ? "..." : "0"), 
                       desc: "KYC approved", 
                       emoji: "🛡️" 
                     },
                     { 
                       label: "Countries", 
                       value: totalCountriesCount !== null ? totalCountriesCount.toLocaleString() : (loading ? "..." : "0"), 
                       desc: "Global reach", 
                       emoji: "🌍" 
                     },
                     { 
                       label: "Active Cities", 
                       value: totalActiveCitiesCount !== null ? totalActiveCitiesCount.toLocaleString() : (loading ? "..." : "—"), 
                       desc: "Active markets", 
                       emoji: "🌐" 
                     }
                   ].map((stat, i) => (
                     <div key={i} className="bg-white rounded-xl sm:rounded-2xl border border-stone-200/60 p-2 sm:p-4 shadow-sm text-center transition-all duration-300 hover:shadow-md hover:-translate-y-1 flex flex-col justify-center items-center">
                       <div className="text-lg sm:text-xl lg:text-2xl mb-1 sm:mb-1.5 filter drop-shadow-sm">{stat.emoji}</div>
                       <div className="text-base sm:text-xl lg:text-2xl font-black text-stone-900 tracking-tight leading-none mb-1">{stat.value}</div>
                       <div className="text-[8px] sm:text-xs font-black uppercase text-stone-400 tracking-wider mb-0.5">{stat.label}</div>
                       <p className="text-[7px] sm:text-[10px] text-stone-400 font-medium leading-tight hidden sm:block">{stat.desc}</p>
                     </div>
                   ))}
                 </div>

                 <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto">
                   <Link to="/verified" className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 lg:px-5 lg:py-3 bg-white border border-stone-200 text-stone-900 rounded-xl font-black uppercase text-[10px] lg:text-xs tracking-widest hover:bg-stone-50 hover:border-stone-400 transition-all shadow-sm active:scale-95 duration-200 mb-6 lg:mb-8">
                      <Users className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-stone-400" /> View Verified Sellers
                   </Link>

                   {!isKycApproved && (
                     <div className="w-full bg-blue-50/50 border border-blue-100/50 rounded-2xl p-4 lg:p-5 flex flex-col items-center shadow-sm animate-in fade-in">
                       <h4 className="text-[11px] lg:text-xs font-black uppercase tracking-widest text-blue-600 mb-2 text-center">Ready to stand out?</h4>
                       <p className="text-[10px] lg:text-[11px] text-stone-500 font-medium leading-relaxed mb-3 text-center max-w-xs">
                          Get the coveted <span className="font-bold text-blue-600">Blue Tick</span>, build immediate trust with buyers, and sell your items up to 3x faster.
                       </p>
                       <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 text-green-600 border border-green-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest mb-4">
                          <ShieldCheck className="w-3 h-3" />
                          100% Free
                       </div>
                       <Link to="/profile?tab=kyc" className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 lg:px-5 lg:py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] lg:text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 duration-200">
                          Start KYC Verification <ArrowRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                       </Link>
                     </div>
                   )}
                 </div>
               </div>
            </section>

            {/* Seller Growth & Motivation Section */}
            <section className="py-4 lg:py-6 bg-stone-900 border-t border-stone-800 text-white relative overflow-hidden">
               {/* Ambient Glow */}
               <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-amber-500/5 rounded-full blur-[40px] -translate-y-1/2 translate-x-1/4 pointer-events-none" />
               <div className="absolute bottom-0 left-0 w-[150px] h-[150px] bg-blue-500/5 rounded-full blur-[40px] translate-y-1/2 -translate-x-1/4 pointer-events-none" />

               <div className="max-w-[800px] mx-auto px-4 relative z-10 text-center flex flex-col items-center">
                 <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-xs font-black uppercase tracking-[0.2em] mb-1.5">
                    <Rocket className="w-2 h-2" /> Merchant Expansion
                 </div>
                 
                 <h2 className="text-base lg:text-xl font-black italic uppercase tracking-tighter leading-none mb-1">
                    Ignite Your Sales & <span className="text-amber-500">Supercharge Business</span>
                 </h2>
                 
                 <p className="text-stone-400 font-medium text-xs lg:text-xs mb-3 max-w-md">
                    Unlock true selling potential. Reach thousands of verified buyers instantly and dominate the local market.
                 </p>

                 {/* Badges Grid */}
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 w-full mb-3">
                    {[
                      { name: 'KYC Verified', desc: 'Secure Blue Tick trust badge', badge: '🛡️', border: 'border-blue-500/10 hover:border-blue-500/30 hover:bg-blue-950/10' },
                      { name: 'Premium Seller', desc: 'Sleek Golden Crown badge', badge: '👑', border: 'border-amber-500/10 hover:border-amber-500/30 hover:bg-amber-950/10' },
                      { name: 'Featured Listings', desc: 'Pin items to top of results', badge: '⭐', border: 'border-purple-500/10 hover:border-purple-500/30 hover:bg-purple-950/10' },
                      { name: 'Boosted Reach', desc: 'Algorithmic promotion boost', badge: '🚀', border: 'border-emerald-500/10 hover:border-emerald-500/30 hover:bg-emerald-950/10' }
                    ].map((item, idx) => (
                      <div key={idx} className={`flex items-start gap-1.5 p-2 rounded-lg border bg-stone-950/40 text-left transition-all duration-300 hover:-translate-y-0.5 ${item.border}`}>
                        <div className="text-sm shrink-0 select-none filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{item.badge}</div>
                        <div>
                          <h4 className="font-extrabold text-xs lg:text-xs uppercase tracking-wide text-white leading-tight">{item.name}</h4>
                          <p className="text-xs lg:text-xs text-stone-400 leading-snug font-medium mt-0.5">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                 </div>

                 <p className="text-xs lg:text-xs font-bold uppercase tracking-widest text-stone-400 mb-3 max-w-md leading-relaxed">
                    Complete KYC, get premium seller badge, featured ads badge and boosted ads badge today!
                 </p>

                 <Link to="/premium" className="inline-flex items-center gap-1 px-4 py-1.5 bg-amber-500 text-stone-950 rounded-lg font-black uppercase text-xs tracking-widest hover:bg-amber-400 hover:scale-102 hover:shadow-md hover:shadow-amber-500/15 transition-all duration-300 active:scale-95">
                    <Crown className="w-3 h-3 fill-stone-950" /> Get Your Badges <ArrowRight className="w-3 h-3" />
                  </Link>
               </div>
            </section>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
