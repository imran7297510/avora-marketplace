import React, { useEffect, useState, useMemo, useRef } from 'react';
import { collection, query, where, orderBy, limit, startAfter, getDocs, documentId, QueryDocumentSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Listing, UserProfile } from '../types';
import { ListingCard } from '../components/ListingCard';
import { useSearchParams, Link } from 'react-router-dom';
import { CATEGORIES, LOCATIONS, MARKETPLACE_CATEGORIES } from '../constants';
import { CountrySelector, getCountryFlag } from '../components/CountrySelector';
import { 
  Search, 
  User, 
  ArrowRight, 
  Filter, 
  ChevronDown, 
  X, 
  MapPin, 
  SlidersHorizontal,
  ArrowUpDown,
  RotateCcw,
  Check,
  Award,
  Info,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { SearchAutocomplete } from '../components/SearchAutocomplete';
import { LocationSelector } from '../components/LocationSelector';
import { SearchSuggestion, saveRecentSearch, parseSearchQuery } from '../services/searchService';
import { isListingEligibleForPriceDrops } from '../utils/priceDropLogic';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { isValidFiatCurrencyCode, filterListingsByCurrency } from '../lib/currencies';

export function Listings() {
  const { user, userProfile } = useAuth();
  const { selectedCurrency } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [matchingProfiles, setMatchingProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Search Params
  const filterCat = searchParams.get('category') || '';
  const filterSubcat = searchParams.get('subcategory') || '';
  const filterCondition = searchParams.get('condition') || '';
  const filterKeyword = searchParams.get('q') || '';
  const filterMinPrice = searchParams.get('minPrice') || '';
  const filterMaxPrice = searchParams.get('maxPrice') || '';
  const sortBy = searchParams.get('sort') || 'newest';
  const filterLocation = searchParams.get('location') || '';
  const filterCountry = searchParams.get('country') || '';
  const filterAvailableOnly = searchParams.get('available') === 'true';
  const filterSellerVerified = searchParams.get('verified') === 'true';
  const filterBrand = searchParams.get('brand') || '';
  const filterTag = searchParams.get('filter') || searchParams.get('tag') || '';

  // Local States for Inputs (Filters)
  const [localKeyword, setLocalKeyword] = useState(filterKeyword);
  const [localMin, setLocalMin] = useState(filterMinPrice);
  const [localMax, setLocalMax] = useState(filterMaxPrice);
  const [localBrand, setLocalBrand] = useState(filterBrand);
  const [localCat, setLocalCat] = useState(filterCat);
  const [localSubcat, setLocalSubcat] = useState(filterSubcat);
  const [localCondition, setLocalCondition] = useState(filterCondition);
  const [localCountry, setLocalCountry] = useState(filterCountry);
  const [localLocation, setLocalLocation] = useState(filterLocation);
  const [localSort, setLocalSort] = useState(sortBy);
  const [localVerified, setLocalVerified] = useState(filterSellerVerified);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const parsedNLP = useMemo(() => {
    return parseSearchQuery(localKeyword);
  }, [localKeyword]);

  useEffect(() => {
    if (filterCat) {
      try {
        const key = user?.uid ? `mandi_searched_categories_${user.uid}` : 'mandi_searched_categories';
        const searched = localStorage.getItem(key);
        const list: string[] = searched ? JSON.parse(searched) : [];
        const filtered = list.filter(c => c !== filterCat);
        filtered.unshift(filterCat);
        localStorage.setItem(key, JSON.stringify(filtered.slice(0, 5)));
      } catch (e) {}
    }
  }, [filterCat, user?.uid]);

  useEffect(() => {
    setLocalKeyword(filterKeyword);
    setLocalMin(filterMinPrice);
    setLocalMax(filterMaxPrice);
    setLocalBrand(filterBrand);
    setLocalCat(filterCat);
    setLocalSubcat(filterSubcat);
    setLocalCondition(filterCondition);
    setLocalCountry(filterCountry);
    setLocalLocation(filterLocation || (filterTag === 'local' ? (userProfile?.city || '') : ''));
    setLocalSort(sortBy);
    setLocalVerified(filterSellerVerified);
    setShowAutocomplete(false);
  }, [filterKeyword, filterMinPrice, filterMaxPrice, filterBrand, filterCat, filterSubcat, filterCondition, filterCountry, filterLocation, sortBy, filterSellerVerified]);

  const selectedCategoryData = MARKETPLACE_CATEGORIES.find(c => c.name === localCat);
  const subcategories = selectedCategoryData?.subcategories || [];

  const [sellers, setSellers] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    const fetchListings = async () => {
      // Purge any legacy unbounded sessionStorage cache to prevent stale full-catalogue usage
      try {
        sessionStorage.removeItem('marketplace_listings');
        sessionStorage.removeItem('marketplace_sellers');
      } catch (e) {}

      setLoading(true);
      setError(null);
      setLastVisibleDoc(null);
      setHasMore(false);
      setLoadingMore(false);

      try {
        const isSoldOut = filterCat === 'Sold Out';

        // Bounded retrieval pool (120 items maximum)
        const q = isSoldOut
          ? query(
              collection(db, 'listings'),
              where('status', 'in', ['SOLD', 'BOOKED']),
              orderBy('createdAt', 'desc'),
              limit(120)
            )
          : query(
              collection(db, 'listings'),
              where('status', '==', 'LIVE'),
              orderBy('createdAt', 'desc'),
              limit(120)
            );

        let snapshot;
        try {
          snapshot = await getDocs(q);
        } catch (queryErr: any) {
          // Graceful fallback if Firestore composite index (status + createdAt desc) is pending deployment
          const isIndexError = queryErr?.message?.includes('requires an index') || 
                               queryErr?.code === 'failed-precondition';
          if (isIndexError) {
            console.warn("Composite index required for (status + createdAt desc). Falling back to bounded query:", queryErr);
            const fallbackQ = isSoldOut
              ? query(
                  collection(db, 'listings'),
                  where('status', 'in', ['SOLD', 'BOOKED']),
                  limit(120)
                )
              : query(
                  collection(db, 'listings'),
                  where('status', '==', 'LIVE'),
                  limit(120)
                );
            snapshot = await getDocs(fallbackQ);
          } else {
            throw queryErr;
          }
        }

        const docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Listing));
        setListings(docs);
        setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.docs.length === 120);

        // Hydrate seller profiles only for the listings retrieved by the current bounded pool
        const sellerIds = Array.from(new Set(docs.map(d => d.ownerId).filter((id): id is string => Boolean(id) && id !== 'guest')));
        const sellerProfiles: Record<string, UserProfile> = {};
        
        if (sellerIds.length > 0) {
          // Chunk sellerIds into groups of 30 for Firestore 'in' query
          const chunks = [];
          for (let i = 0; i < sellerIds.length; i += 30) {
            chunks.push(sellerIds.slice(i, i + 30));
          }

          const sellerFetchPromises = chunks.map(chunk => 
            getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)))
          );
          
          const sellerSnaps = await Promise.all(sellerFetchPromises);
          sellerSnaps.forEach(snap => {
            snap.docs.forEach(doc => {
              const data = doc.data() as UserProfile;
              sellerProfiles[doc.id] = { ...data, id: doc.id };
            });
          });
        }
        setSellers(sellerProfiles);

        if (filterKeyword.trim()) {
           const qProfiles = query(
             collection(db, 'users'),
             where('name', '>=', filterKeyword),
             where('name', '<=', filterKeyword + '\uf8ff')
           );
           const pSnap = await getDocs(qProfiles);
           setMatchingProfiles(pSnap.docs.map(d => ({ ...d.data(), id: d.id } as UserProfile)));
        } else {
           setMatchingProfiles([]);
        }
      } catch (err: any) {
        console.error("Listings fetch failed:", err);
        setError("Unable to load marketplace listings at this moment. Please try again.");
        setListings([]);
        setSellers({});
        setMatchingProfiles([]);
        setLastVisibleDoc(null);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };
    fetchListings();
  }, [filterKeyword, filterCat]);

  const loadMoreListings = async () => {
    if (!lastVisibleDoc || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const isSoldOut = filterCat === 'Sold Out';

      const q = isSoldOut
        ? query(
            collection(db, 'listings'),
            where('status', 'in', ['SOLD', 'BOOKED']),
            orderBy('createdAt', 'desc'),
            startAfter(lastVisibleDoc),
            limit(120)
          )
        : query(
            collection(db, 'listings'),
            where('status', '==', 'LIVE'),
            orderBy('createdAt', 'desc'),
            startAfter(lastVisibleDoc),
            limit(120)
          );

      let snapshot;
      try {
        snapshot = await getDocs(q);
      } catch (queryErr: any) {
        const isIndexError = queryErr?.message?.includes('requires an index') || 
                             queryErr?.code === 'failed-precondition';
        if (isIndexError) {
          console.warn("Composite index required for (status + createdAt desc). Falling back to bounded cursor query:", queryErr);
          const fallbackQ = isSoldOut
            ? query(
                collection(db, 'listings'),
                where('status', 'in', ['SOLD', 'BOOKED']),
                startAfter(lastVisibleDoc),
                limit(120)
              )
            : query(
                collection(db, 'listings'),
                where('status', '==', 'LIVE'),
                startAfter(lastVisibleDoc),
                limit(120)
              );
          snapshot = await getDocs(fallbackQ);
        } else {
          throw queryErr;
        }
      }

      const newDocs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Listing));

      if (newDocs.length > 0) {
        // Prevent duplicate listing IDs
        setListings(prev => {
          const existingIds = new Set(prev.map(l => l.id));
          const fresh = newDocs.filter(d => !existingIds.has(d.id));
          return [...prev, ...fresh];
        });
        setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.docs.length === 120);

        // Deduplicated seller profile hydration (only fetch sellers not already in state)
        const currentSellerIds = new Set(Object.keys(sellers));
        const newSellerIds: string[] = [];
        for (const doc of newDocs) {
          const ownerId = doc.ownerId;
          if (ownerId && ownerId !== 'guest' && !currentSellerIds.has(ownerId) && !newSellerIds.includes(ownerId)) {
            newSellerIds.push(ownerId);
          }
        }

        if (newSellerIds.length > 0) {
          const chunks = [];
          for (let i = 0; i < newSellerIds.length; i += 30) {
            chunks.push(newSellerIds.slice(i, i + 30));
          }

          const sellerFetchPromises = chunks.map(chunk => 
            getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)))
          );

          const sellerSnaps = await Promise.all(sellerFetchPromises);
          const additionalSellers: Record<string, UserProfile> = {};
          sellerSnaps.forEach(snap => {
            snap.docs.forEach(doc => {
              const data = doc.data() as UserProfile;
              additionalSellers[doc.id] = { ...data, id: doc.id };
            });
          });

          if (Object.keys(additionalSellers).length > 0) {
            setSellers(prev => ({ ...prev, ...additionalSellers }));
          }
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load more listings:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredListings = useMemo(() => {
    const isFeaturedActive = (d: Listing) => {
      if (!d.isFeatured) return false;
      if (d.featuredUntil) {
        const fu = d.featuredUntil;
        let expired = false;
        if (typeof fu.toDate === 'function') {
          expired = fu.toDate() < new Date();
        } else if (fu.seconds) {
          expired = new Date(fu.seconds * 1000) < new Date();
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
        } else if (bu.seconds) {
          expired = new Date(bu.seconds * 1000) < new Date();
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

    const isVerifiedProfileActive = (profile: any) => {
      if (!profile) return false;
      if (!profile.isVerified) return false;
      if (profile.verifiedUntil) {
        const vu = profile.verifiedUntil;
        let expired = false;
        if (typeof vu.toDate === 'function') {
          expired = vu.toDate() < new Date();
        } else if (vu.seconds) {
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

    const isCategoryMatch = (listingCategory?: string, filterCategory?: string) => {
      if (!filterCategory) return true;
      if (!listingCategory) return false;

      const fc = filterCategory.toLowerCase().trim();
      const lc = listingCategory.toLowerCase().trim();

      if (lc === fc) return true;
      if (lc.includes(fc) || fc.includes(lc)) return true;

      // Check CATEGORIES mapping
      const cCat = CATEGORIES.find(c => c.id.toLowerCase() === fc || c.name.toLowerCase() === fc);
      if (cCat) {
        if (lc.includes(cCat.id.toLowerCase()) || lc.includes(cCat.name.toLowerCase())) {
          return true;
        }
      }

      // Check MARKETPLACE_CATEGORIES mapping
      const mCat = MARKETPLACE_CATEGORIES.find(c => c.name.toLowerCase() === fc || c.name.toLowerCase().includes(fc));
      if (mCat) {
        if (lc.includes(mCat.name.toLowerCase())) {
          return true;
        }
      }

      return false;
    };

    const preparedListings = listings.map((d) => {
      const isExplicit = d.priceDropped === true || 
        (d.previousPrice && d.previousPrice > d.price) || 
        (d.originalPrice && d.originalPrice > d.price) || 
        (d.priceDropsCount && d.priceDropsCount > 0) || 
        (d.priceDroppedPercent && d.priceDroppedPercent > 0);

      if (isExplicit) {
        const prevPrice = d.previousPrice || d.originalPrice || Math.round(d.price * 1.15);
        const reduction = prevPrice - d.price;
        const discPercent = d.priceDroppedPercent || (prevPrice > 0 ? Math.round((reduction / prevPrice) * 100) : 15);
        return {
          ...d,
          priceDropped: true,
          previousPrice: prevPrice,
          priceDroppedPercent: discPercent,
          priceDroppedAmount: d.priceDroppedAmount || reduction,
        };
      }
      return d;
    });

    const isPriceDropFilter = 
      filterTag === 'price-drops' || 
      filterTag === 'price_drops' || 
      filterCat === 'price-drops' || 
      filterCat === 'price_drops' || 
      filterCat.toLowerCase().includes('price drop');

    const activeLocation = filterLocation || (filterTag === 'local' ? (userProfile?.city || '') : '');

    // Parse NLP intent once per filter update
    const parsed = filterKeyword ? parseSearchQuery(filterKeyword) : null;

    // Structured constraint precedence: Explicit UI/URL Filter > Inferred NLP Constraint > No Constraint
    const effectiveCategory = filterCat || parsed?.inferredCategory || '';
    const effectiveSubcategory = filterSubcat || parsed?.inferredSubcategory || '';
    const effectiveCondition = filterCondition || parsed?.inferredCondition || '';
    const effectiveLocation = activeLocation || parsed?.inferredLocation || '';
    const effectiveMinPrice = filterMinPrice ? Number(filterMinPrice) : parsed?.inferredMinPrice;
    const effectiveMaxPrice = filterMaxPrice ? Number(filterMaxPrice) : parsed?.inferredMaxPrice;
    const effectiveBrand = filterBrand || parsed?.inferredBrand || '';

    // Stop-words & consumed NLP trigger tokens to prevent false-negative keyword matching
    const STOP_WORDS = new Set([
      'in', 'at', 'near', 'for', 'the', 'a', 'an', 'of', 'with', 'and', 'to', 'on', 'from', 'by', 'is', 'are', 'or',
      'under', 'below', 'above', 'less', 'than', 'max', 'min', 'rs', 'k',
      'mein', 'me', 'pe', 'par', 'ka', 'ki', 'ke', 'ko', 'se', 'wala', 'wali', 'walay', 'waali', 'waale'
    ]);

    const NLP_TRIGGER_TOKENS = new Set([
      'used', 'purana', 'purani', 'second', 'hand', 'secondhand', 'old', 'sasta', 'condition',
      'new', 'naya', 'nayi', 'fresh', 'brand', 'brandnew', 'box', 'packed', 'boxpacked',
      'under', 'below', 'max', 'budget', 'cheap', 'cheapest', 'expensive', 'costly', 'premium', 'mehnga', 'mehenga',
      'gaari', 'gari', 'qar', 'kar', 'car', 'cars', 'bikee', 'bik', 'bike', 'bikes', 'motor', 'cycle',
      'mobail', 'fone', 'cell', 'phone', 'phones', 'smartphone', 'mobel', 'mobile', 'mobiles',
      'leptop', 'labtop', 'laptop', 'laptops', 'computer', 'computers', 'pc', 'soofa', 'sofa', 'sofas',
      'ac', 'frig', 'frige'
    ]);

    let meaningfulKeywords: string[] = [];
    if (filterKeyword) {
      const rawText = (parsed?.cleanSearchTerm || filterKeyword).toLowerCase().trim();
      const rawTokens = rawText.split(/[\s,+/_-]+/).filter(Boolean);
      
      meaningfulKeywords = rawTokens.filter(token => {
        const cleanToken = token.replace(/[^a-z0-9]/g, '');
        if (!cleanToken || cleanToken.length < 2) return false;
        if (STOP_WORDS.has(cleanToken)) return false;
        
        // If an inferred condition consumed this token
        if (parsed?.inferredCondition && (cleanToken === 'used' || cleanToken === 'new' || cleanToken === 'purana' || cleanToken === 'purani' || cleanToken === 'naya' || cleanToken === 'nayi' || cleanToken === 'fresh' || cleanToken === 'box' || cleanToken === 'packed')) {
          return false;
        }

        // If an inferred location consumed this token
        if (parsed?.inferredLocation && parsed.inferredLocation.toLowerCase().includes(cleanToken)) {
          return false;
        }

        // If an inferred category/subcategory consumed this synonym/token (e.g. 'gaari', 'mobail', 'leptop', 'cars')
        if ((parsed?.inferredCategory || parsed?.inferredSubcategory) && (
          NLP_TRIGGER_TOKENS.has(cleanToken) ||
          (parsed.inferredCategory && parsed.inferredCategory.toLowerCase().includes(cleanToken)) ||
          (parsed.inferredSubcategory && parsed.inferredSubcategory.toLowerCase().includes(cleanToken))
        )) {
          return false;
        }

        // If it's a numeric price token that was part of inferred max/min price
        if (parsed?.inferredMaxPrice && (cleanToken === String(parsed.inferredMaxPrice) || cleanToken === `${Math.round(parsed.inferredMaxPrice / 1000)}k`)) {
          return false;
        }
        if (parsed?.inferredMinPrice && (cleanToken === String(parsed.inferredMinPrice) || cleanToken === `${Math.round(parsed.inferredMinPrice / 1000)}k`)) {
          return false;
        }

        return true;
      });
    }

    const getPakistanNearbyCities = (cityName: string): string[] => {
      const c = cityName.toLowerCase().trim();
      if (c.includes('islamabad') || c.includes('rawalpindi')) return ['islamabad', 'rawalpindi'];
      if (c.includes('lahore') || c.includes('gujranwala') || c.includes('kasur')) return ['lahore', 'gujranwala', 'kasur'];
      if (c.includes('karachi') || c.includes('hyderabad')) return ['karachi', 'hyderabad'];
      if (c.includes('peshawar') || c.includes('mardan')) return ['peshawar', 'mardan'];
      if (c.includes('multan') || c.includes('bahawalpur')) return ['multan', 'bahawalpur'];
      if (c.includes('faisalabad') || c.includes('sargodha')) return ['faisalabad', 'sargodha'];
      return [c];
    };

    let result = preparedListings.filter(d => {
      const isLive = d.status === 'LIVE' && (d.quantity || 0) > 0;
      const isSold = d.status === 'SOLD' || (d.quantity || 0) <= 0;
      const isBooked = d.status === 'BOOKED';

      if (filterAvailableOnly) {
        if (!isLive) return false;
      }

      if (filterCat === 'Sold Out') {
        if (!isSold) return false;
      } else if (!isPriceDropFilter) {
        if (effectiveCategory && !isCategoryMatch(d.category, effectiveCategory)) return false;
        // Default behavior: Only show LIVE items. Exclude SOLD and BOOKED
        if (!isLive) return false;
      } else {
        if (!isLive) return false;
      }

      if (isPriceDropFilter) {
        if (!isListingEligibleForPriceDrops(d)) return false;
      }

      if (effectiveSubcategory) {
        if (d.subcategory) {
          const ds = d.subcategory.toLowerCase().trim();
          const es = effectiveSubcategory.toLowerCase().trim();
          if (ds !== es && !ds.includes(es) && !es.includes(ds)) return false;
        } else if (!isCategoryMatch(d.category, effectiveSubcategory)) {
          return false;
        }
      }

      if (effectiveCondition && d.condition && d.condition.toLowerCase() !== effectiveCondition.toLowerCase()) return false;
      if (filterCountry && d.country && d.country.toLowerCase() !== filterCountry.toLowerCase()) return false;

      // Location / City filtering
      if (effectiveLocation && effectiveLocation !== 'All Pakistan') {
        const locLower = effectiveLocation.toLowerCase().trim();
        const docCity = (d.city || '').toLowerCase().trim();
        const docLoc = ((d as any).location || '').toLowerCase().trim();
        const docArea = (d.locationArea || d.address || '').toLowerCase().trim();
        const seller = sellers[d.ownerId];
        const sellerCity = (seller?.city || '').toLowerCase().trim();
        const sellerAddress = (seller?.address || '').toLowerCase().trim();

        const nearby = getPakistanNearbyCities(locLower);

        const isExactMatch = docCity === locLower || docLoc === locLower || sellerCity === locLower;
        const isSubstringMatch = (docCity && docCity.includes(locLower)) || (docLoc && docLoc.includes(locLower)) || (sellerCity && sellerCity.includes(locLower));
        const isAreaMatch = (docArea && docArea.includes(locLower)) || (sellerAddress && sellerAddress.includes(locLower));
        const isNearbyMatch = nearby.some(city => 
          (docCity && docCity.includes(city)) || 
          (docLoc && docLoc.includes(city)) || 
          (docArea && docArea.includes(city)) ||
          (sellerCity && sellerCity.includes(city)) ||
          (sellerAddress && sellerAddress.includes(city))
        );

        const isLocationMatch = isExactMatch || isSubstringMatch || isAreaMatch || isNearbyMatch;

        if (!isLocationMatch) return false;
      }

      if (effectiveMinPrice !== undefined && !isNaN(effectiveMinPrice) && d.price < effectiveMinPrice) return false;
      if (effectiveMaxPrice !== undefined && !isNaN(effectiveMaxPrice) && d.price > effectiveMaxPrice) return false;

      if (effectiveBrand) {
        const bLower = effectiveBrand.toLowerCase().trim();
        const titleLower = (d.title || '').toLowerCase();
        const descLower = (d.description || '').toLowerCase();
        const brandField = ((d as any).brand || '').toLowerCase();
        const isBrandMatch = 
          titleLower.includes(bLower) || 
          brandField.includes(bLower) || 
          descLower.includes(bLower) ||
          (bLower === 'apple' && (titleLower.includes('iphone') || titleLower.includes('ipad') || titleLower.includes('macbook') || titleLower.includes('airpods')));
        if (!isBrandMatch) return false;
      }
      
      if (filterTag === 'featured') {
        if (!isFeaturedActive(d)) return false;
      }

      if (filterSellerVerified) {
        const seller = sellers[d.ownerId];
        if (!isVerifiedProfileActive(seller)) return false;
      }

      if (meaningfulKeywords.length > 0) {
        const searchableContent = `${d.title || ''} ${d.description || ''} ${d.category || ''} ${d.subcategory || ''} ${(d as any).location || ''} ${d.city || ''} ${d.locationArea || ''} ${d.address || ''} ${(d as any).brand || ''}`.toLowerCase();
        
        const isMatch = meaningfulKeywords.every(kw => {
          const singularKw = kw.endsWith('s') && kw.length > 3 ? kw.slice(0, -1) : kw;
          // Match keyword, singular, plural form
          if (
            searchableContent.includes(kw) || 
            searchableContent.includes(singularKw) ||
            (kw.length > 2 && searchableContent.includes(kw + 's'))
          ) return true;
          return false;
        });
        if (!isMatch) return false;
      }

      return true;
    });

    result = filterListingsByCurrency(result, selectedCurrency);

    const getLocalPriorityScore = (d: Listing) => {
      if (!effectiveLocation || effectiveLocation === 'All Pakistan') return 0;
      const locLower = effectiveLocation.toLowerCase().trim();
      const docCity = (d.city || '').toLowerCase().trim();
      const docLoc = ((d as any).location || '').toLowerCase().trim();
      const docArea = (d.locationArea || d.address || '').toLowerCase().trim();
      const seller = sellers[d.ownerId];
      const sellerCity = (seller?.city || '').toLowerCase().trim();

      if (docArea && docArea.includes(locLower)) return 1000;
      if (docCity === locLower || docLoc === locLower || sellerCity === locLower) return 800;
      if ((docCity && docCity.includes(locLower)) || (docLoc && docLoc.includes(locLower)) || (sellerCity && sellerCity.includes(locLower))) return 500;
      return 100;
    };

    result.sort((a, b) => {
      if (effectiveLocation && effectiveLocation !== 'All Pakistan') {
        const locDiff = getLocalPriorityScore(b) - getLocalPriorityScore(a);
        if (locDiff !== 0) return locDiff;
      }

      if (a.status !== 'SOLD' && b.status !== 'SOLD') {
        const aFeatured = isFeaturedActive(a);
        const bFeatured = isFeaturedActive(b);
        const aBoosted = isBoostedActive(a);
        const bBoosted = isBoostedActive(b);

        if (aFeatured && !bFeatured) return -1;
        if (!aFeatured && bFeatured) return 1;
        if (aBoosted && !bBoosted) return -1;
        if (!aBoosted && bBoosted) return 1;
      }

      const timeA = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const timeB = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);

      switch (sortBy) {
        case 'recommended': {
          let searchedCategoriesList: string[] = [];
          let viewedCategoriesList: string[] = [];
          try {
            const searchedKey = user?.uid ? `mandi_searched_categories_${user.uid}` : 'mandi_searched_categories';
            const viewedKey = user?.uid ? `mandi_viewed_categories_${user.uid}` : 'mandi_viewed_categories';
            const searchedHistory = localStorage.getItem(searchedKey);
            if (searchedHistory) searchedCategoriesList = JSON.parse(searchedHistory);
            const viewedHistory = localStorage.getItem(viewedKey);
            if (viewedHistory) viewedCategoriesList = JSON.parse(viewedHistory);
          } catch (e) {}

          const getRecScore = (d: Listing) => {
            let score = 0;
            if (d.category) {
              if (searchedCategoriesList.includes(d.category)) score += 10000;
              if (viewedCategoriesList.includes(d.category)) score += 5000;
            }
            const views = typeof d.views === 'number' && !isNaN(d.views) ? Math.max(0, d.views) : 0;
            const saves = typeof d.saves === 'number' && !isNaN(d.saves) ? Math.max(0, d.saves) : 0;
            score += views * 2 + saves * 8;
            return score;
          };

          const scoreDiff = getRecScore(b) - getRecScore(a);
          if (scoreDiff !== 0) return scoreDiff;
          const viewsDiff = (b.views || 0) - (a.views || 0);
          if (viewsDiff !== 0) return viewsDiff;
          return timeB - timeA;
        }
        case 'views':
        case 'popular':
        case 'most_viewed': {
          const vA = typeof a.views === 'number' && !isNaN(a.views) ? a.views : 0;
          const vB = typeof b.views === 'number' && !isNaN(b.views) ? b.views : 0;
          if (vB !== vA) return vB - vA;
          return timeB - timeA;
        }
        case 'price_low': return a.price - b.price;
        case 'price_high': return b.price - a.price;
        case 'oldest': return timeA - timeB;
        default: return timeB - timeA;
      }
    });

    return result;
  }, [listings, filterCat, filterSubcat, filterCondition, filterLocation, filterMinPrice, filterMaxPrice, filterKeyword, sortBy, filterSellerVerified, sellers, filterBrand, filterTag, userProfile, user?.uid, selectedCurrency]);

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) params.delete(key);
      else params.set(key, value);
    });
    setSearchParams(params);
  };

  const handleSearchClick = (e?: React.FormEvent) => {
    e?.preventDefault();
    setShowAutocomplete(false);
    if (localKeyword.trim()) {
      saveRecentSearch(localKeyword.trim());
    }
    updateParams({
      q: localKeyword || null,
      minPrice: localMin || null,
      maxPrice: localMax || null,
      brand: localBrand || null,
      category: localCat || null,
      subcategory: localSubcat || null,
      condition: localCondition || null,
      country: localCountry || null,
      location: localLocation || null,
      sort: localSort || null,
      verified: localVerified ? 'true' : null
    });
    // Hide filters panel after user applies them/clicks search
    setShowFilters(false);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
    setLocalKeyword('');
    setLocalMin('');
    setLocalMax('');
    setLocalBrand('');
    setLocalCat('');
    setLocalSubcat('');
    setLocalCondition('');
    setLocalCountry('');
    setLocalLocation('');
    setLocalSort('newest');
    setLocalVerified(false);
  };

  const handleSuggestionSelect = (suggestion: SearchSuggestion) => {
    setLocalKeyword(suggestion.text);
    setShowAutocomplete(false);
    saveRecentSearch(suggestion.text);
    
    const params: Record<string, string | null> = {
      q: suggestion.text,
      minPrice: localMin || null,
      maxPrice: localMax || null,
      brand: localBrand || null,
      category: localCat || null,
      subcategory: localSubcat || null,
      condition: localCondition || null,
      location: localLocation || null,
      sort: localSort || null,
      verified: localVerified ? 'true' : null
    };

    if (suggestion.type === 'category') {
      params.category = suggestion.text;
      params.subcategory = null;
    } else if (suggestion.type === 'subcategory') {
      if (suggestion.category) params.category = suggestion.category;
      params.subcategory = suggestion.text;
    }

    updateParams(params);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resultsRef = useRef<HTMLDivElement>(null);

  // Generate stable, high-fidelity sets of listings for categories
  const recommendedListings = useMemo(() => {
    const currencyItems = filterListingsByCurrency(listings, selectedCurrency);
    const liveItems = currencyItems.filter(d => d.status === 'LIVE' && (d.quantity || 0) > 0);
    if (liveItems.length === 0) return [];

    let searchedCategoriesList: string[] = [];
    let viewedCategoriesList: string[] = [];
    try {
      const searchedKey = user?.uid ? `mandi_searched_categories_${user.uid}` : 'mandi_searched_categories';
      const viewedKey = user?.uid ? `mandi_viewed_categories_${user.uid}` : 'mandi_viewed_categories';
      const searchedHistory = localStorage.getItem(searchedKey);
      if (searchedHistory) searchedCategoriesList = JSON.parse(searchedHistory);
      const viewedHistory = localStorage.getItem(viewedKey);
      if (viewedHistory) viewedCategoriesList = JSON.parse(viewedHistory);
    } catch (e) {}

    const getRecommendedRelevanceScore = (d: Listing) => {
      let score = 0;
      if (d.category) {
        if (searchedCategoriesList.includes(d.category)) score += 10000;
        if (viewedCategoriesList.includes(d.category)) score += 5000;
      }
      const views = typeof d.views === 'number' && !isNaN(d.views) ? Math.max(0, d.views) : 0;
      const saves = typeof d.saves === 'number' && !isNaN(d.saves) ? Math.max(0, d.saves) : 0;
      score += views * 2 + saves * 8;
      return score;
    };

    const sorted = [...liveItems].sort((a, b) => {
      const scoreDiff = getRecommendedRelevanceScore(b) - getRecommendedRelevanceScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      const viewsDiff = (b.views || 0) - (a.views || 0);
      if (viewsDiff !== 0) return viewsDiff;
      return (b.id || '').localeCompare(a.id || '');
    });
    return sorted.slice(0, 5);
  }, [listings, user?.uid, selectedCurrency]);

  const localDealsListings = useMemo(() => {
    const currencyItems = filterListingsByCurrency(listings, selectedCurrency);
    const liveItems = currencyItems.filter(d => d.status === 'LIVE' && (d.quantity || 0) > 0);
    if (liveItems.length === 0) return [];

    const userCity = userProfile?.city?.trim() || (filterLocation && filterLocation !== 'All Pakistan' ? filterLocation.trim() : '');
    const userArea = userProfile?.locationArea?.trim() || userProfile?.address?.trim() || '';

    const getPakistanNearbyCities = (cityName: string): string[] => {
      if (!cityName) return [];
      const c = cityName.toLowerCase().trim();
      if (c.includes('islamabad') || c.includes('rawalpindi')) return ['islamabad', 'rawalpindi'];
      if (c.includes('lahore') || c.includes('gujranwala') || c.includes('kasur')) return ['lahore', 'gujranwala', 'kasur'];
      if (c.includes('karachi') || c.includes('hyderabad')) return ['karachi', 'hyderabad'];
      if (c.includes('peshawar') || c.includes('mardan')) return ['peshawar', 'mardan'];
      if (c.includes('multan') || c.includes('bahawalpur')) return ['multan', 'bahawalpur'];
      if (c.includes('faisalabad') || c.includes('sargodha')) return ['faisalabad', 'sargodha'];
      return [c];
    };

    const isFeat = (d: Listing) => {
      if (!d.isFeatured) return false;
      if (d.featuredUntil) {
        const fu = d.featuredUntil;
        if (typeof fu.toDate === 'function') return fu.toDate() >= new Date();
        if (fu.seconds) return new Date(fu.seconds * 1000) >= new Date();
        const dObj = new Date(fu);
        if (!isNaN(dObj.getTime())) return dObj >= new Date();
      }
      return true;
    };

    const isBoost = (d: Listing) => {
      if (!d.isBoosted) return false;
      if (d.boostedUntil) {
        const bu = d.boostedUntil;
        if (typeof bu.toDate === 'function') return bu.toDate() >= new Date();
        if (bu.seconds) return new Date(bu.seconds * 1000) >= new Date();
        const dObj = new Date(bu);
        if (!isNaN(dObj.getTime())) return dObj >= new Date();
      }
      return true;
    };

    const isVerified = (profile: any) => {
      if (!profile || !profile.isVerified) return false;
      if (profile.verifiedUntil) {
        const vu = profile.verifiedUntil;
        if (typeof vu.toDate === 'function') return vu.toDate() >= new Date();
        if (vu.seconds) return new Date(vu.seconds * 1000) >= new Date();
        const dObj = new Date(vu);
        if (!isNaN(dObj.getTime())) return dObj >= new Date();
      }
      return true;
    };

    const getLocalPriorityScore = (d: Listing) => {
      let score = 0;
      const seller = sellers[d.ownerId || (d as any).sellerId || (d as any).userId];
      const docCity = (d.city?.trim()) || (seller?.city?.trim()) || '';
      const docArea = (d.locationArea?.trim()) || (d.address?.trim()) || (seller?.locationArea?.trim()) || (seller?.address?.trim()) || '';

      if (userCity) {
        const isSameCity = docCity.toLowerCase().trim() === userCity.toLowerCase().trim();
        const isSameArea = userArea && docArea.toLowerCase().trim() === userArea.toLowerCase().trim();

        if (isSameCity && isSameArea) {
          score += 100000;
        } else if (isSameCity) {
          score += 50000;
        } else {
          const nearby = getPakistanNearbyCities(userCity);
          const isNearby = nearby.some(nc => nc === docCity.toLowerCase().trim());
          if (isNearby) {
            score += 10000;
          }
        }
      }

      const aFeat = isFeat(d);
      const aBoost = isBoost(d);
      const sellerVerified = isVerified(seller);
      score += (sellerVerified ? 500 : 0) + (aFeat ? 300 : 0) + (aBoost ? 150 : 0);
      return score;
    };

    const sorted = [...liveItems].sort((a, b) => {
      const scoreDiff = getLocalPriorityScore(b) - getLocalPriorityScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      const viewsDiff = (b.views || 0) - (a.views || 0);
      if (viewsDiff !== 0) return viewsDiff;
      const timeA = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const timeB = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      if (timeB !== timeA) return timeB - timeA;
      return (b.id || '').localeCompare(a.id || '');
    });
    return sorted.slice(0, 5);
  }, [listings, userProfile, filterLocation, sellers, selectedCurrency]);

  const featuredListings = useMemo(() => {
    const currencyItems = filterListingsByCurrency(listings, selectedCurrency);
    const liveItems = currencyItems.filter(d => d.status === 'LIVE' && (d.quantity || 0) > 0);
    if (liveItems.length === 0) return [];

    const sorted = [...liveItems].sort((a, b) => {
      const valA = a.verified ? -2 : ((a.price || 0) > 300000 ? -1 : 1);
      const valB = b.verified ? -2 : ((b.price || 0) > 300000 ? -1 : 1);
      if (valA !== valB) return valA - valB;
      const hashA = a.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const hashB = b.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return (hashA * 19 + 29) % 97 - (hashB * 19 + 29) % 97;
    });
    return sorted.slice(0, 5);
  }, [listings, selectedCurrency]);

  const justListedListings = useMemo(() => {
    const currencyItems = filterListingsByCurrency(listings, selectedCurrency);
    const liveItems = currencyItems.filter(d => d.status === 'LIVE' && (d.quantity || 0) > 0);
    if (liveItems.length === 0) return [];

    const sorted = [...liveItems].sort((a, b) => {
      const timeA = a.createdAt ? (typeof a.createdAt === 'object' && 'seconds' in a.createdAt ? (a.createdAt as any).seconds : new Date(a.createdAt).getTime()) : 0;
      const timeB = b.createdAt ? (typeof b.createdAt === 'object' && 'seconds' in b.createdAt ? (b.createdAt as any).seconds : new Date(b.createdAt).getTime()) : 0;
      if (timeB !== timeA) return timeB - timeA;
      return b.id.localeCompare(a.id);
    });
    return sorted.slice(0, 5);
  }, [listings, selectedCurrency]);

  const handleExplore = () => {
    clearFilters();
    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const categoriesToRender = useMemo(() => [
    { title: "Recommended For You", list: recommendedListings, id: "recommended-for-you-section" },
    { title: "Local Deals", list: localDealsListings, id: "local-deals-section" },
    { title: "Featured Listings", list: featuredListings, id: "featured-listings-section" },
    { title: "Just Listed", list: justListedListings, id: "just-listed-section" }
  ], [recommendedListings, localDealsListings, featuredListings, justListedListings]);

  const renderCategorySection = (title: string, list: Listing[], id: string) => {
    if (list.length === 0) return null;
    
    return (
      <div id={id} className="my-10 p-5 sm:p-6 md:p-8 bg-stone-100/60 rounded-[2rem] border border-stone-200/40 relative overflow-hidden animate-in fade-in slide-in-from-bottom duration-500">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-5 bg-amber-500 rounded-full" />
            <h3 className="text-sm sm:text-base md:text-lg font-black uppercase text-stone-900 tracking-tight">
              {title}
            </h3>
          </div>
          <button
            onClick={handleExplore}
            className="px-3.5 py-1.5 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm shrink-0"
          >
            Explore
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        
        {/* Horizontal swipe layout on mobile (displaying ~1.6 items), standard grid on desktop */}
        <div className="flex overflow-x-auto gap-4 flex-nowrap md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-4 lg:gap-6 scrollbar-none snap-x snap-mandatory pb-4 md:pb-0 md:overflow-visible">
          {list.map(listing => (
            <div key={`${id}-${listing.id}`} className="w-[60%] sm:w-[45%] md:w-auto shrink-0 md:shrink-0 md:snap-none snap-start">
              <ListingCard listing={listing} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!loading && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [filteredListings.length, filterKeyword, filterCat, filterSubcat, filterLocation, filterMinPrice, filterMaxPrice, sortBy]);

  if (error) {
    return (
      <div className="flex-1 max-w-xl mx-auto px-4 py-20 text-center">
        <div className="bg-white p-10 rounded-3xl border border-stone-200 shadow-sm mt-10">
          <div className="bg-red-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <RotateCcw className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-black text-stone-900 mb-4 uppercase italic">Database Link Failed</h1>
          <p className="text-stone-600 mb-8 leading-relaxed font-medium">
            {error.includes("CONNECTION_ERROR") 
              ? "We couldn't establish a secure connection to the marketplace database. This usually happens in the preview iframe due to browser restrictions."
              : error}
          </p>
          <div className="space-y-4">
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-stone-900 text-white font-black uppercase italic tracking-widest py-4 rounded-xl hover:bg-stone-800 transition-all shadow-xl active:scale-95"
            >
              Retry Connection
            </button>
            <p className="text-xs text-stone-400 font-bold uppercase tracking-widest">
              Tip: Using a <strong>New Tab</strong> usually fixes this.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50/50">
      {/* 1. Header Filter Section - Always Visible */}
      <div className="bg-white border-b border-stone-200 relative md:sticky md:top-16 lg:top-20 md:z-50 shadow-md">
        <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-4">
          <form onSubmit={handleSearchClick} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center bg-stone-100 rounded-2xl border border-stone-200 p-1 group focus-within:ring-4 focus-within:ring-amber-500/10 focus-within:border-amber-500 transition-all duration-300 relative">
                 <div className="pl-4 text-stone-400 group-focus-within:text-amber-500 transition-colors">
                    <Search className="w-5 h-5" />
                 </div>
                 <input 
                   type="text"
                   placeholder="Product name, brand, or search anything..."
                   className="flex-1 bg-transparent border-none outline-none px-4 py-2.5 text-sm font-medium text-stone-800 placeholder:text-stone-400"
                   value={localKeyword}
                   onChange={(e) => {
                     setLocalKeyword(e.target.value);
                     setShowAutocomplete(true);
                   }}
                   onFocus={() => setShowAutocomplete(true)}
                 />

                 {showAutocomplete && localKeyword.length > 0 && (
                   <div ref={autocompleteRef} className="absolute top-[calc(100%+8px)] left-0 right-0 z-50">
                      <SearchAutocomplete 
                        query={localKeyword} 
                        onSelect={handleSuggestionSelect}
                        onClose={() => setShowAutocomplete(false)}
                      />
                   </div>
                 )}
              </div>
              <button 
                type="submit"
                className="hidden md:flex items-center gap-2 px-8 py-3.5 bg-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-[0.2em] hover:bg-amber-500 hover:text-stone-900 transition-all shadow-xl active:scale-95"
              >
                 <Search className="w-4 h-4" /> Search
              </button>
            </div>

            {localKeyword.trim() && (parsedNLP.inferredCategory || parsedNLP.inferredSubcategory || parsedNLP.inferredCondition || parsedNLP.inferredLocation || parsedNLP.inferredMaxPrice || parsedNLP.inferredBrand || parsedNLP.inferredSortBy) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-3 pb-1 text-xs font-bold text-stone-400 uppercase tracking-wider border-t border-stone-100">
                <span className="text-stone-400 font-extrabold flex items-center gap-1 mr-1">
                  <Info className="w-3.5 h-3.5 text-amber-500" /> Auto-Filters:
                </span>
                {parsedNLP.inferredCategory && (
                  <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-100">
                    Category: {parsedNLP.inferredCategory}
                  </span>
                )}
                {parsedNLP.inferredSubcategory && (
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                    Sub: {parsedNLP.inferredSubcategory}
                  </span>
                )}
                {parsedNLP.inferredCondition && (
                  <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100">
                    Condition: {parsedNLP.inferredCondition}
                  </span>
                )}
                {parsedNLP.inferredLocation && (
                  <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg border border-purple-100">
                    Location: {parsedNLP.inferredLocation}
                  </span>
                )}
                {parsedNLP.inferredMaxPrice && (
                  <span className="px-2 py-1 bg-red-50 text-red-700 rounded-lg border border-red-100">
                    Max Price: Rs {parsedNLP.inferredMaxPrice.toLocaleString()}
                  </span>
                )}
                {parsedNLP.inferredBrand && (
                  <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded-lg border border-orange-100">
                    Brand: {parsedNLP.inferredBrand}
                  </span>
                )}
                {parsedNLP.inferredSortBy && (
                  <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100">
                    Sort: {parsedNLP.inferredSortBy === 'price_low' ? 'Budget First' : 'Premium First'}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                    showFilters ? "bg-amber-500 text-stone-900 shadow-inner" : "bg-stone-900 text-white shadow-lg"
                  )}
                >
                  <SlidersHorizontal className="w-4 h-4" /> 
                  Filter
                </button>
                <button 
                  type="button"
                  onClick={clearFilters}
                  className="px-6 py-3 bg-stone-50 hover:bg-red-50 text-stone-400 hover:text-red-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-stone-200 shadow-sm"
                >
                  <RotateCcw className="w-4 h-4 mr-2 inline-block" />
                  Clear
                </button>
              </div>

              <div className="hidden lg:flex items-center gap-4 text-stone-400 text-xs font-bold uppercase tracking-widest">
                <span>{filteredListings.length} Results Found</span>
              </div>
              
              <div className="md:hidden flex-grow">
                 <button 
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-3 bg-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-500 hover:text-stone-900 transition-all shadow-xl"
                >
                   <Search className="w-4 h-4" /> Search
                </button>
              </div>
            </div>

            {/* Expanded Filter Panel */}
            <AnimatePresence>
              {showFilters && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {/* Container allowing naturally flowing filter items on mobile device previews */}
                  <div className="pr-1.5 pt-4 pb-2 border-t border-stone-100">
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                      {/* Category */}
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-stone-400 ml-1">Category</label>
                        <div className="relative">
                          <select 
                            value={localCat}
                            onChange={(e) => {
                              setLocalCat(e.target.value);
                              setLocalSubcat('');
                            }}
                            className="w-full appearance-none bg-stone-100 border border-stone-200 rounded-xl px-4 py-3 text-xs font-bold uppercase text-stone-800 outline-none transition-all focus:ring-2 focus:ring-amber-500/20"
                          >
                            <option value="">All Categories</option>
                            {MARKETPLACE_CATEGORIES.filter(c => c.name !== 'Sold Out').map(cat => (
                              <option key={cat.name} value={cat.name}>{cat.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                        </div>
                      </div>

                      {/* Sub Category */}
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-stone-400 ml-1">Sub Category</label>
                        <div className="relative">
                          <select 
                            value={localSubcat}
                            disabled={!localCat || subcategories.length === 0}
                            onChange={(e) => setLocalSubcat(e.target.value)}
                            className="w-full appearance-none bg-stone-100 border border-stone-200 rounded-xl px-4 py-3 text-xs font-bold uppercase text-stone-800 outline-none transition-all focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50"
                          >
                            <option value="">{localCat ? 'All Sub Categories' : 'Select Category'}</option>
                            {subcategories.map(sub => (
                              <option key={sub} value={sub}>{sub}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                        </div>
                      </div>

                      {/* Condition */}
                      <div className="space-y-2">
                         <label className="text-xs font-black uppercase tracking-widest text-stone-400 ml-1">Condition</label>
                         <div className="flex gap-2">
                            {['All', 'New', 'Used'].map(cond => (
                              <button 
                                key={cond}
                                type="button"
                                onClick={() => setLocalCondition(cond === 'All' ? '' : cond)}
                                className={cn(
                                  "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all",
                                  (cond === 'All' && !localCondition) || localCondition === cond ? "bg-stone-900 border-stone-900 text-white shadow-md active:scale-95" : "bg-stone-100 border-stone-200 text-stone-400 hover:bg-stone-200"
                                )}
                              >
                                {cond}
                              </button>
                            ))}
                         </div>
                      </div>

                      {/* Country */}
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-stone-400 ml-1">Country</label>
                        <CountrySelector 
                          value={localCountry} 
                          onChange={(val) => setLocalCountry(val)} 
                          placeholder="All Countries"
                        />
                      </div>

                      {/* City Location */}
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-stone-400 ml-1">City</label>
                        <LocationSelector 
                          value={localLocation} 
                          onChange={(val) => setLocalLocation(val)} 
                        />
                      </div>

                      {/* Price Range */}
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-stone-400 ml-1">Price (MIN - MAX)</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            step="any"
                            placeholder="Min" 
                            value={localMin}
                            onChange={(e) => setLocalMin(e.target.value)}
                            className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500/20 outline-none"
                          />
                          <span className="text-stone-300 font-bold">-</span>
                          <input 
                            type="number" 
                            step="any"
                            placeholder="Max" 
                            value={localMax}
                            onChange={(e) => setLocalMax(e.target.value)}
                            className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500/20 outline-none"
                          />
                        </div>
                      </div>

                      {/* Brand */}
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-stone-400 ml-1">Brand (optional)</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Apple, Toyota..." 
                          value={localBrand}
                          onChange={(e) => setLocalBrand(e.target.value)}
                          className="w-full px-4 py-3 bg-stone-100 border border-stone-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500/20 outline-none"
                        />
                      </div>

                      {/* Sorting */}
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-stone-400 ml-1">Sort By Period/Price</label>
                        <div className="relative">
                          <select 
                            value={localSort}
                            onChange={(e) => setLocalSort(e.target.value)}
                            className="w-full appearance-none bg-stone-100 border border-stone-200 rounded-xl px-4 py-3 text-xs font-bold uppercase text-stone-800 outline-none transition-all focus:ring-2 focus:ring-amber-500/20"
                          >
                            <option value="newest">Newest First</option>
                            <option value="recommended">Recommended For You</option>
                            <option value="views">Most Viewed</option>
                            <option value="oldest">Oldest First</option>
                            <option value="price_low">Price: Low to High</option>
                            <option value="price_high">Price: High to Low</option>
                          </select>
                          <ArrowUpDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                        </div>
                      </div>

                      {/* Sellers */}
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-stone-400 ml-1">Sellers Status</label>
                        <div className="flex gap-2">
                          <button 
                            type="button"
                            onClick={() => setLocalVerified(!localVerified)}
                            className={cn(
                              "w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all flex items-center justify-center gap-2",
                              localVerified ? "bg-emerald-500 border-emerald-500 text-white shadow-md active:scale-95" : "bg-stone-100 border-stone-200 text-stone-400 hover:bg-stone-200"
                            )}
                          >
                            <div className={cn("w-3 h-3 rounded-full", localVerified ? "bg-white" : "bg-stone-300")} />
                            Verified Only
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 flex justify-end gap-3 pb-2">
                      <button 
                        type="submit"
                        className="w-full sm:w-auto px-10 py-3 bg-amber-500 text-stone-900 rounded-xl text-xs font-black uppercase tracking-[0.2em] shadow-lg hover:bg-amber-600 transition-all active:scale-95 text-center flex items-center justify-center"
                      >
                        Apply Filters
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>
      </div>

      <div ref={resultsRef} className="max-w-[1440px] mx-auto px-4 lg:px-10 py-10 scroll-mt-32 md:scroll-mt-40">
        {matchingProfiles.length > 0 && (
          <section className="mb-12">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {matchingProfiles.map(profile => (
                  <Link 
                     key={profile.id} 
                     to={profile.username ? `/user/${profile.username}` : `/user/${profile.id}`}
                     className="flex items-center gap-4 p-5 bg-white border border-stone-100 rounded-3xl hover:shadow-2xl transition-all group"
                  >
                    <div className="relative w-14 h-14 rounded-full overflow-hidden bg-stone-100 border-2 border-white shadow-sm flex-shrink-0">
                      {profile.photoURL ? (
                        <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-400">
                          <User size={24} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-stone-900 truncate uppercase text-sm italic leading-none mb-1">{profile.name}</p>
                      <p className="text-xs text-stone-400 font-bold uppercase tracking-widest flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {profile.country ? `${getCountryFlag(profile.country)} ${profile.country}, ` : ''}{profile.city || 'Pakistan'}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-amber-500 transition-all" />
                  </Link>
                ))}
             </div>
          </section>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-6">
             {Array.from({ length: 8 }).map((_, i) => (
               <div key={i} className="aspect-[4/5] bg-white border border-stone-100 rounded-3xl animate-pulse" />
             ))}
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="space-y-8">
            <div className="py-32 text-center bg-white rounded-3xl border border-stone-100">
               <div className="w-24 h-24 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Search className="w-10 h-10 text-stone-200" />
               </div>
               <h3 className="text-2xl font-black italic uppercase tracking-tighter text-stone-900 mb-2">Search Results not Found</h3>
               <p className="text-stone-400 text-xs font-black uppercase tracking-widest max-w-sm mx-auto leading-relaxed px-6">
                  Try adjusting your filters or search criteria.
               </p>
               <button 
                 onClick={clearFilters}
                 className="mt-8 px-10 py-3 bg-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-[0.3em] hover:bg-amber-500 hover:text-stone-900 transition-all shadow-xl shadow-stone-900/10"
               >
                 Clear Filters
               </button>
               {hasMore && (
                 <div className="mt-4">
                   <button
                     onClick={loadMoreListings}
                     disabled={loadingMore}
                     className="px-6 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 inline-flex items-center gap-2 border border-stone-200 cursor-pointer"
                   >
                     {loadingMore ? (
                       <>
                         <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                         Scanning Next Batch...
                       </>
                     ) : (
                       <>
                         Scan Next 120 Listings
                         <ChevronDown className="w-3.5 h-3.5" />
                       </>
                     )}
                   </button>
                 </div>
               )}
            </div>
            {renderCategorySection("Recommended For You", recommendedListings, "recommended-for-you-section")}
          </div>
        ) : (
          <div className="space-y-8">
            {filteredListings.length < 10 ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-6">
                  {filteredListings.map(listing => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
                {renderCategorySection("Recommended For You", recommendedListings, "recommended-for-you-section")}
              </>
            ) : (
              <>
                {(() => {
                  const chunks = [];
                  for (let i = 0; i < filteredListings.length; i += 10) {
                    chunks.push(filteredListings.slice(i, i + 10));
                  }
                  return chunks.map((chunk, index) => {
                    const catObj = categoriesToRender[index % categoriesToRender.length];
                    return (
                      <div key={`chunk-group-${index}`} className="space-y-8">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 lg:gap-6">
                          {chunk.map(listing => (
                            <ListingCard key={listing.id} listing={listing} />
                          ))}
                        </div>
                        {renderCategorySection(catObj.title, catObj.list, catObj.id)}
                      </div>
                    );
                  });
                })()}
              </>
            )}

            {hasMore && (
              <div className="flex justify-center pt-8 pb-4">
                <button
                  onClick={loadMoreListings}
                  disabled={loadingMore}
                  className="px-8 py-3.5 bg-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-[0.2em] hover:bg-amber-500 hover:text-stone-900 transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                      Loading Next Batch...
                    </>
                  ) : (
                    <>
                      Load More Listings
                      <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
