import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Share2, 
  Heart, 
  Eye, 
  Gavel, 
  Sparkles, 
  MapPin, 
  UserCheck, 
  Bell, 
  SlidersHorizontal, 
  ArrowRight, 
  Clock, 
  Filter,
  CheckCircle,
  Gem,
  Compass,
  AlertCircle,
  Award,
  ChevronRight,
  MessageCircle,
  BadgeAlert,
  BadgeCheck,
  Sliders,
  Settings,
  X,
  ChevronLeft
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { Listing, UserProfile } from '../types';
import { formatPKR, cn } from '../lib/utils';
import { useDragScroll, scrollContainer } from '../lib/useScroll';
import { resolveAuthoritativeVerification } from '../lib/verificationResolver';
import { getCachedUserProfileSync } from '../services/userProfileCache';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  increment, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface MostViewedProps {
  listings: Listing[];
  sellerProfilesMap?: Record<string, UserProfile | null>;
}

export interface PopularityItem {
  id: string; // Listing ID
  slug?: string;
  title: string;
  category: string;
  price: number;
  currency?: string;
  currencySymbol?: string;
  image?: string;
  location: string;
  timeLabel: string;
  timeRaw: Date;
  sellerName?: string;
  isVerified: boolean;
  canMakeOffer: boolean;
  
  // Real or derived statistics
  viewsCount: number;
  savesCount: number;
  sharesCount: number;
  clickThroughRate: number; // e.g. 5.4%
  userEngagementScore: number; // calculated score
  
  // Dynamic Social Proof Badges
  isTrending: boolean;
  isPopular: boolean;
  isMostSaved: boolean;
  isRisingFast: boolean;
  isMarketplaceFavorite: boolean;
  isPremium: boolean;
  
  // EndsAt for auctions
  endsAt?: Date;
  bidsCount?: number;
}

function parseCount(val: any): number {
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val) || val < 0) return 0;
    return Math.floor(val);
  }
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

function parseListingDate(createdAt: any): Date {
  if (!createdAt) return new Date(0);
  if (typeof createdAt.toDate === 'function') {
    const d = createdAt.toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : new Date(0);
  }
  if (typeof createdAt.toMillis === 'function') {
    return new Date(createdAt.toMillis());
  }
  if (typeof createdAt.seconds === 'number') {
    return new Date(createdAt.seconds * 1000);
  }
  if (typeof createdAt._seconds === 'number') {
    return new Date(createdAt._seconds * 1000);
  }
  if (createdAt instanceof Date) {
    return !isNaN(createdAt.getTime()) ? createdAt : new Date(0);
  }
  if (typeof createdAt === 'number') {
    const ms = createdAt < 10000000000 ? createdAt * 1000 : createdAt;
    const d = new Date(ms);
    return !isNaN(d.getTime()) ? d : new Date(0);
  }
  if (typeof createdAt === 'string') {
    const d = new Date(createdAt);
    return !isNaN(d.getTime()) ? d : new Date(0);
  }
  return new Date(0);
}

export function MostViewed({ listings, sellerProfilesMap }: MostViewedProps) {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  // Selected Section Sub-Tab
  type SubSection = 'trending_today' | 'rising_fast' | 'most_saved' | 'luxury_lots' | 'near_you' | 'favorites';
  const [activeSection, setActiveSection] = useState<SubSection>('trending_today');

  // Core Filtering & Sorting states
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('views');
  const [visibleCount, setVisibleCount] = useState<number>(10);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const dragProps = useDragScroll(scrollRef);

  // States for notifications
  const [showNotifySettings, setShowNotifySettings] = useState(false);
  const [notifyState, setNotifyState] = useState({
    listingTrending: true,
    localPopular: false,
    newTrending: true,
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [savedFavorites, setSavedFavorites] = useState<Record<string, boolean>>({});

  // Track Anti-Manipulation telemetry (simulates client-side unique footprint registration to avoid view-count rigging)
  useEffect(() => {
    // Generate unique session-based user tracking hash
    try {
      const localFootprint = localStorage.getItem('mandi_analytics_footprint');
      if (!localFootprint) {
        const uniqueFootprint = 'usr_ft_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('mandi_analytics_footprint', uniqueFootprint);
      }
    } catch(e) {}
  }, []);

  // Show dynamic message toast
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 3000);
  };

  const handleToggleNotification = (key: keyof typeof notifyState, label: string) => {
    const updated = { ...notifyState, [key]: !notifyState[key] };
    setNotifyState(updated);
    triggerToast(updated[key] ? `🔔 Alerts set: Notify when ${label} updates!` : `❌ Turned off ${label} updates.`);
  };

  // Compile, calculate, and weigh all eligible listings
  const popularItems = useMemo<PopularityItem[]>(() => {
    if (!listings || listings.length === 0) return [];

    const isSellerSuspended = (ownerId: string): boolean => {
      if (!ownerId) return false;
      const profile = (sellerProfilesMap && sellerProfilesMap[ownerId]) || getCachedUserProfileSync(ownerId);
      if (!profile) return false;
      return Boolean(
        profile.isBlocked ||
        profile.isBanned ||
        profile.accountStatus === 'blocked' ||
        profile.accountStatus === 'banned' ||
        profile.accountStatus === 'deleted'
      );
    };

    const liveListings = listings.filter(item => {
      if (item.status !== 'LIVE') return false;
      if (item.isSuspended) return false;
      if ((item.quantity || 0) <= 0) return false;
      const ownerId = item.ownerId || (item as any).sellerId || (item as any).userId;
      if (isSellerSuspended(ownerId)) return false;
      return true;
    });

    const compiled: PopularityItem[] = [];

    // Helper to calculate recent popularity weight decay
    // De-incentivize stale old posts
    const calculateEngagement = (views: number, saves: number, hoursOld: number) => {
      const score = (views * 1.0) + (saves * 4.0);
      const gravity = 1.25;
      const safeHours = Math.max(0.5, hoursOld);
      return score / Math.pow(safeHours + 2, gravity);
    };

    // 1. Process Standard/Premium Listings
    liveListings.forEach((item) => {
      const views = parseCount(item.views ?? (item as any).viewsCount ?? (item as any).totalViews);
      const saves = parseCount(item.saves ?? (item as any).savesCount ?? (item as any).totalSaves);
      const shares = parseCount(item.shares ?? (item as any).sharesCount ?? (item as any).totalShares);
      
      const createdDate = parseListingDate(item.createdAt);
      const nowMs = Date.now();
      const createdMs = createdDate.getTime();
      const hoursOld = createdMs > 0 ? Math.max(0, (nowMs - createdMs) / (1000 * 60 * 60)) : 999;
      
      const userEngagementScore = calculateEngagement(views, saves, hoursOld);
      const interactions = saves + shares;
      const clickThroughRate = views > 0 ? Number(((interactions / views) * 100).toFixed(1)) : 0;

      const ownerId = item.ownerId || (item as any).sellerId || (item as any).userId;
      const sellerProfile = (sellerProfilesMap && sellerProfilesMap[ownerId]) || getCachedUserProfileSync(ownerId);
      const authVerif = sellerProfile ? resolveAuthoritativeVerification(sellerProfile) : null;

      // Authoritative Premium & KYC status strictly from authoritative verification architecture
      const isPremium = authVerif
        ? authVerif.isPremiumCurrentlyActive
        : Boolean(
            (item as any).sellerIsPremium ||
            (item as any).sellerIsPremiumVerified ||
            (item as any).isPremiumSeller ||
            (item as any).ownerIsPremiumVerified ||
            (item as any).isPremium
          );
      const isVerified = authVerif
        ? authVerif.isKycCurrentlyValid
        : Boolean(
            (item as any).sellerKycApproved ||
            (item as any).ownerKycApproved ||
            item.isVerifiedListing
          );

      const isTrending = userEngagementScore > 3 || (views >= 100 && hoursOld < 168);
      const isPopular = views >= 50 || views > 0;
      const isMostSaved = saves >= 5 || saves > 0;
      const isRisingFast = clickThroughRate >= 5 && hoursOld < 72 && views >= 10;
      const isMarketplaceFavorite = saves >= 10 && clickThroughRate >= 3;

      let categoryClean = item.category || 'General';
      if (categoryClean.toLowerCase().includes('phone') || categoryClean.toLowerCase().includes('electronics')) {
        categoryClean = 'Electronics';
      } else if (categoryClean.toLowerCase().includes('car') || categoryClean.toLowerCase().includes('vehicle')) {
        categoryClean = 'Vehicles';
      } else if (categoryClean.toLowerCase().includes('property') || categoryClean.toLowerCase().includes('real')) {
        categoryClean = 'Property';
      } else if (categoryClean.toLowerCase().includes('fashion') || categoryClean.toLowerCase().includes('clothing')) {
        categoryClean = 'Fashion';
      }

      const sellerName = sellerProfile?.businessName || sellerProfile?.name || sellerProfile?.username || item.sellerName || 'Seller';

      const timeLabel = createdMs === 0 ? 'Recently' : hoursOld < 1 ? 'Less than 1h ago' : hoursOld < 24 ? `${Math.floor(hoursOld)}h ago` : `${Math.floor(hoursOld / 24)}d ago`;

      compiled.push({
        id: item.id,
        slug: item.slug,
        title: item.title,
        category: categoryClean,
        price: item.price,
        currency: item.currency,
        currencySymbol: item.currencySymbol,
        image: item.images?.[0] || undefined,
        location: item.city || item.country || 'Global',
        timeLabel,
        timeRaw: createdDate,
        sellerName,
        isVerified,
        canMakeOffer: true,
        viewsCount: views,
        savesCount: saves,
        sharesCount: shares,
        clickThroughRate,
        userEngagementScore,
        isTrending,
        isPopular,
        isMostSaved,
        isRisingFast,
        isPremium,
        isMarketplaceFavorite,
      });
    });

    // Anti-duplication guarantee: Unique IDs only
    const uniqueMap = new Map<string, PopularityItem>();
    compiled.forEach(val => {
      uniqueMap.set(val.id, val);
    });

    return Array.from(uniqueMap.values());
  }, [listings, sellerProfilesMap]);

  // Sync favorites on init
  useEffect(() => {
    let isMounted = true;
    // Disabled favorite fetch on mount to improve performance
    return () => {
      isMounted = false;
    };
  }, [user, popularItems]);

  // Handle Save (Toggle Favorite)
  const handleToggleFavorite = async (item: PopularityItem) => {
    if (!user) {
      navigate('/login');
      return;
    }

    const isFav = !!savedFavorites[item.id];
    const favRef = doc(db, `users/${user.uid}/favorites`, item.id);
    const listingRef = doc(db, 'listings', item.id);

    setSavedFavorites(prev => ({ ...prev, [item.id]: !isFav }));
    triggerToast(isFav ? `Removed ${item.title.substring(0, 20)} from watchlist.` : `❤️ Added to Favorites: ${item.title.substring(0, 20)}`);

    try {
      if (isFav) {
        await deleteDoc(favRef);
        await updateDoc(listingRef, {
          saves: increment(-1),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } else {
        await setDoc(favRef, {
          listingId: item.id,
          savedAt: serverTimestamp(),
          title: item.title,
          price: item.price,
          image: item.image || null,
        });
        await updateDoc(listingRef, {
          saves: increment(1),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    } catch (e) {
      // Revert optimistic selection state on crash/network rejection
      setSavedFavorites(prev => ({ ...prev, [item.id]: isFav }));
    }
  };

  // Share clipboard helper
  const handleShare = (item: PopularityItem) => {
    const origin = window.location.origin;
    const url = `${origin}/listings/${item.id}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        triggerToast(`🔗 Link Copied! Send it to spread the popularity: ${item.title.substring(0, 15)}`);
      }).catch(() => {
        triggerToast(`Sharing link: ${url}`);
      });
    } else {
      triggerToast(`URL: ${url}`);
    }
  };

  // Section Filtering
  const sectionFilteredItems = useMemo(() => {
    let list = [...popularItems];

    switch (activeSection) {
      case 'trending_today': {
        const trendingList = list.filter(item => item.isTrending);
        list = trendingList.length > 0 ? trendingList : list;
        break;
      }
      case 'rising_fast': {
        const risingList = list.filter(item => item.isRisingFast);
        list = risingList.length > 0 ? risingList : list.filter(item => item.viewsCount > 0);
        break;
      }
      case 'most_saved': {
        const savedList = list.filter(item => item.savesCount > 0 || item.isMostSaved);
        list = savedList.length > 0 ? savedList : list;
        break;
      }
      case 'luxury_lots': {
        const luxList = list.filter(item => item.price >= 80000 || item.isPremium);
        list = luxList.length > 0 ? luxList : list;
        break;
      }
      case 'near_you': {
        const myCity = userProfile?.city;
        if (myCity) {
          const nearList = list.filter(item => item.location?.toLowerCase().includes(myCity.toLowerCase()));
          list = nearList.length > 0 ? nearList : list;
        }
        break;
      }
      case 'favorites': {
        const favList = list.filter(item => item.isMarketplaceFavorite || item.savesCount > 0);
        list = favList.length > 0 ? favList : list;
        break;
      }
    }

    return list;
  }, [popularItems, activeSection, userProfile]);

  // Pill & Search Bar query Filtering
  const pillFilteredItems = useMemo(() => {
    let list = [...sectionFilteredItems];

    if (activeFilter !== 'all') {
      if (activeFilter === 'luxury_lots') {
        list = list.filter(item => item.price >= 80000 || item.isPremium);
      } else if (activeFilter === 'make_offers') {
        list = list.filter(item => item.canMakeOffer);
      } else if (activeFilter === 'verified') {
        list = list.filter(item => item.isVerified);
      } else if (activeFilter === 'local') {
        const myCity = userProfile?.city;
        if (myCity) {
          list = list.filter(item => item.location?.toLowerCase().includes(myCity.toLowerCase()));
        }
      } else {
        // category checks
        list = list.filter(item => item.category?.toLowerCase() === activeFilter.toLowerCase());
      }
    }

    return list;
  }, [sectionFilteredItems, activeFilter, userProfile]);

  // Sorter widget
  const sortedItems = useMemo(() => {
    const list = [...pillFilteredItems];

    switch (sortBy) {
      case 'views':
        list.sort((a, b) => {
          const vDiff = (b.viewsCount || 0) - (a.viewsCount || 0);
          if (vDiff !== 0) return vDiff;
          const tDiff = (b.timeRaw?.getTime() || 0) - (a.timeRaw?.getTime() || 0);
          if (tDiff !== 0) return tDiff;
          return (b.id || '').localeCompare(a.id || '');
        });
        break;
      case 'saves':
        list.sort((a, b) => {
          const sDiff = (b.savesCount || 0) - (a.savesCount || 0);
          if (sDiff !== 0) return sDiff;
          const vDiff = (b.viewsCount || 0) - (a.viewsCount || 0);
          if (vDiff !== 0) return vDiff;
          return (b.id || '').localeCompare(a.id || '');
        });
        break;
      case 'trending':
        list.sort((a, b) => {
          const scDiff = (b.userEngagementScore || 0) - (a.userEngagementScore || 0);
          if (scDiff !== 0) return scDiff;
          const vDiff = (b.viewsCount || 0) - (a.viewsCount || 0);
          if (vDiff !== 0) return vDiff;
          return (b.id || '').localeCompare(a.id || '');
        });
        break;
      case 'newest':
        list.sort((a, b) => {
          const tDiff = (b.timeRaw?.getTime() || 0) - (a.timeRaw?.getTime() || 0);
          if (tDiff !== 0) return tDiff;
          return (b.id || '').localeCompare(a.id || '');
        });
        break;
      case 'price_high':
        list.sort((a, b) => {
          const pDiff = (b.price || 0) - (a.price || 0);
          if (pDiff !== 0) return pDiff;
          return (b.id || '').localeCompare(a.id || '');
        });
        break;
      case 'price_low':
        list.sort((a, b) => {
          const pDiff = (a.price || 0) - (b.price || 0);
          if (pDiff !== 0) return pDiff;
          return (b.id || '').localeCompare(a.id || '');
        });
        break;
      case 'shares':
        list.sort((a, b) => {
          const shDiff = (b.sharesCount || 0) - (a.sharesCount || 0);
          if (shDiff !== 0) return shDiff;
          const vDiff = (b.viewsCount || 0) - (a.viewsCount || 0);
          if (vDiff !== 0) return vDiff;
          return (b.id || '').localeCompare(a.id || '');
        });
        break;
      case 'nearby': {
        const myCity = userProfile?.city;
        list.sort((a, b) => {
          if (myCity) {
            const aNear = a.location?.toLowerCase().includes(myCity.toLowerCase());
            const bNear = b.location?.toLowerCase().includes(myCity.toLowerCase());
            if (aNear && !bNear) return -1;
            if (!aNear && bNear) return 1;
          }
          const vDiff = (b.viewsCount || 0) - (a.viewsCount || 0);
          if (vDiff !== 0) return vDiff;
          return (b.id || '').localeCompare(a.id || '');
        });
        break;
      }
      default:
        list.sort((a, b) => {
          const vDiff = (b.viewsCount || 0) - (a.viewsCount || 0);
          if (vDiff !== 0) return vDiff;
          return (b.id || '').localeCompare(a.id || '');
        });
        break;
    }

    return list;
  }, [pillFilteredItems, sortBy, userProfile]);

  // Sliced
  const visibleItems = useMemo(() => {
    return sortedItems.slice(0, visibleCount);
  }, [sortedItems, visibleCount]);

  return (
    <div id="most-viewed-marketplace-section" className="w-full">
      
      {/* Toast Alert pop-up */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 35, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed bottom-6 left-6 z-50 bg-stone-900 border border-amber-500/30 text-stone-100 rounded-2xl px-5 py-3.5 shadow-2xl flex items-center gap-3 backdrop-blur-md max-w-sm"
          >
            <div className="bg-amber-500 text-stone-950 font-black rounded-full w-6 h-6 flex items-center justify-center text-xs animate-pulse">
              👁️
            </div>
            <p className="text-xs font-bold leading-normal">{toastMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-3.5">
        
        {/* Banner Section with title decoration */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2.5">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <h2 className="text-xl lg:text-2.5xl font-black italic uppercase tracking-tighter text-white leading-none">
                  Most <span className="text-amber-500">Viewed</span>
                </h2>
                <Link to="/listings?sort=views" className="flex items-center gap-1.5 px-2.5 py-1.5 bg-stone-900 border border-stone-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-stone-300 hover:text-amber-400 hover:border-amber-500/50 transition-all shadow-sm shrink-0">
                  View All <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>

          {/* Followers option and filter */}
          <div className="flex flex-row items-center gap-2 shrink-0 mt-1 md:mt-0 overflow-x-auto scrollbar-none">
            
            {/* Action tracker menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifySettings(!showNotifySettings)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm",
                  showNotifySettings 
                    ? "bg-amber-500 border-amber-400 text-stone-950"
                    : "bg-stone-900 border-stone-800 text-stone-300 hover:border-amber-500/30 hover:text-amber-400"
                )}
              >
                <Bell className="w-3 h-3 stroke-[3]" />
                <span>Follow Trends</span>
              </button>

              <AnimatePresence>
                {showNotifySettings && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifySettings(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute right-0 mt-2 w-64 bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-2xl z-50 text-white"
                    >
                      <div className="flex items-center justify-between border-b border-stone-800 pb-2 mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">🔔 Popularity Watch</span>
                        <button onClick={() => setShowNotifySettings(false)} className="text-stone-400 hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-3">
                        <label className="flex items-center justify-between cursor-pointer group">
                          <span className="text-xs font-bold text-stone-300 group-hover:text-white">Saved item goes trending</span>
                          <input 
                            type="checkbox" 
                            checked={notifyState.listingTrending}
                            onChange={() => handleToggleNotification('listingTrending', 'Saved becomes Trending')}
                            className="rounded border-stone-850 bg-stone-950 text-amber-500 focus:ring-amber-500 w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer group">
                          <span className="text-xs font-bold text-stone-300 group-hover:text-white">Local item becomes popular</span>
                          <input 
                            type="checkbox" 
                            checked={notifyState.localPopular}
                            onChange={() => handleToggleNotification('localPopular', 'Local item Popularity')}
                            className="rounded border-stone-850 bg-stone-950 text-amber-500 focus:ring-amber-500 w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer group">
                          <span className="text-xs font-bold text-stone-300 group-hover:text-white">New trending announcements</span>
                          <input 
                            type="checkbox" 
                            checked={notifyState.newTrending}
                            onChange={() => handleToggleNotification('newTrending', 'New Trending alerts')}
                            className="rounded border-stone-850 bg-stone-950 text-amber-500 focus:ring-amber-500 w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </label>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Sorting Select Option */}
            <div className="flex items-center gap-1.5 bg-stone-900 border border-stone-800 rounded-xl px-2.5 py-1.5 shadow-sm">
              <SlidersHorizontal className="w-3 h-3 text-stone-400 stroke-[3]" />
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setVisibleCount(6); // Reset pagination
                }}
                className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-stone-300 focus:ring-0 outline-none cursor-pointer"
              >
                <option value="views" className="bg-stone-900 text-white">Most Viewed</option>
                <option value="saves" className="bg-stone-900 text-white">Most Saved</option>
                <option value="trending" className="bg-stone-900 text-white">Trending Score</option>
                <option value="newest" className="bg-stone-900 text-white">Newest First</option>
                <option value="nearby" className="bg-stone-900 text-white">Nearby Popular</option>
                <option value="price_high" className="bg-stone-900 text-white">Highest Price</option>
                <option value="price_low" className="bg-stone-900 text-white">Lowest Price</option>
                <option value="shares" className="bg-stone-900 text-white">Most Shared</option>
              </select>
            </div>

          </div>
        </div>

        {/* Section Tabs row (Trending Today, Rising Fast, Most Saved, etc.) */}
        <div className="flex flex-row items-center gap-0.5 overflow-x-auto pb-1 border-b border-stone-850 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none">
          {[
            { id: 'trending_today', label: 'Trending Today' },
            { id: 'rising_fast', label: 'Rising Fast' },
            { id: 'most_saved', label: 'Most Saved' },
            { id: 'luxury_lots', label: 'Luxury Lots' },
            { id: 'near_you', label: 'Near You' },
            { id: 'favorites', label: 'Market Favorites' },
          ].map(sect => (
            <button
              key={sect.id}
              onClick={() => {
                setActiveSection(sect.id as SubSection);
                setVisibleCount(6);
              }}
              className={cn(
                "px-3 py-1.5 border-b-2 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0",
                activeSection === sect.id
                  ? "border-amber-500 text-amber-500 bg-amber-500/[0.02]"
                  : "border-transparent text-stone-400 hover:text-stone-200"
              )}
            >
              {sect.label}
            </button>
          ))}
        </div>

        {/* Inner Filtering Options / Category Pills */}
        <div className="flex flex-row items-center gap-1 overflow-x-auto pb-1.5 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
          {[
            { id: 'all', label: 'All Filter' },
            { id: 'luxury_lots', label: 'Premium Lots' },
            { id: 'make_offers', label: 'Accepts Offers' },
            { id: 'Electronics', label: 'Electronics' },
            { id: 'Vehicles', label: 'Vehicles' },
            { id: 'Property', label: 'Properties' },
            { id: 'Fashion', label: 'Fashion' },
            { id: 'verified', label: 'Verified Sellers' },
            { id: 'local', label: 'Local Only' },
          ].map(pill => (
            <button
              key={pill.id}
              onClick={() => {
                setActiveFilter(pill.id);
                setVisibleCount(6);
              }}
              className={cn(
                "px-2.5 py-1 text-[10px] sm:text-xs font-extrabold uppercase tracking-wider rounded-lg border transition-all shrink-0 select-none",
                activeFilter === pill.id
                  ? "bg-stone-100 border-stone-200 text-stone-950 font-black"
                  : "bg-stone-900/60 border-stone-850 text-stone-400 hover:text-stone-200 hover:border-stone-700"
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Popular items Grid stream */}
        {visibleItems.length > 0 ? (
          <div className="relative w-full overflow-hidden -mx-4 px-4 lg:mx-0 lg:px-0">
            {/* Left Scroll Trigger */}
            <button
              type="button"
              onClick={() => scrollContainer(scrollRef, 'left')}
              className="absolute left-0 lg:-left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex flex-col items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100 hidden md:flex"
              aria-label="Scroll Left"
            >
              <ChevronLeft className="w-5 h-5 font-black" />
            </button>

            <div 
              ref={scrollRef} 
              {...dragProps}
              className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-4 lg:pb-6 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
            >
              <AnimatePresence mode="popLayout">
                {visibleItems.map(item => {
                  const isSaved = !!savedFavorites[item.id];
                  
                  // Construct a combined array of highlight badges for this listing card
                  const tags: string[] = [];
                  if (item.isTrending) tags.push('🔥 Trending');
                  if (item.isPopular) tags.push('👀 Popular');
                  if (item.isMostSaved) tags.push('⭐ Most Saved');
                  if (item.isRisingFast) tags.push('📈 Rising Fast');
                  if (item.isMarketplaceFavorite) tags.push('🏆 Favorite');
                  if (item.isPremium) tags.push('💎 Premium');
                  if (item.isVerified) tags.push('✅ Verified');

                  // Take slice of max 3 tags to keep clean
                  const visibleTags = tags.slice(0, 3);

                  return (
                    <motion.div
                      key={item.id}
                      layoutId={`pop-${item.id}`}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onDragStart={(e) => e.preventDefault()}
                      onClick={(e) => {
                        // Prevent click if user clicked a button/link inside
                        if (e.target instanceof Element && e.target.closest('button, a')) return;
                        navigate(`/listings/${item.slug || item.id}`);
                      }}
                      className="w-[60vw] sm:w-[45vw] md:w-[320px] shrink-0 flex flex-col bg-stone-950 border border-stone-850 rounded-2xl overflow-hidden hover:border-stone-700 transition-all duration-200 group cursor-pointer"
                    >
                    {/* Upper Image container area */}
                    <div className="relative h-36 sm:h-44 w-full bg-stone-900 overflow-hidden border-b border-stone-850 animate-fade-in">
                      
                      {/* Save favorite tool absolute position over image */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleFavorite(item);
                        }}
                        className={cn(
                          "absolute top-3 right-3 z-10 p-2 rounded-xl backdrop-blur-md border transition-all hover:scale-105 active:scale-95 cursor-pointer",
                          isSaved 
                            ? "bg-red-500/20 border-red-500/30 text-red-500" 
                            : "bg-stone-950/80 border-stone-800/80 text-stone-300 hover:text-red-400"
                        )}
                        title={isSaved ? "Saved to watchlist" : "Save to watchlist"}
                      >
                        <Heart className={cn("w-3.5 h-3.5", isSaved && "fill-current")} />
                      </button>

                      {item.image ? (
                        <img 
                          src={item.image} 
                          alt={item.title} 
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl bg-stone-900/80">
                          📦
                        </div>
                      )}

                      {/* Overlays: Multi-Tag Badge Group (Combined into single clean feed strip) */}
                      {visibleTags.length > 0 && (
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1 max-w-[70%]">
                          {visibleTags.map((t, tid) => (
                            <span 
                              key={tid} 
                              className="text-[8px] sm:text-[8.5px] font-black uppercase tracking-wider text-amber-500 bg-stone-950/85 backdrop-blur-md border border-stone-800/80 px-2 py-0.5 rounded-md"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Views Counter float overlay */}
                      <div className="absolute bottom-3 left-3 bg-stone-950/85 backdrop-blur-md border border-stone-800 px-2 py-0.5 rounded-md flex items-center gap-1.5 text-stone-200 text-[10px] font-black uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                        <span>👀 {item.viewsCount.toLocaleString()}</span>
                        <span className="text-stone-600">|</span>
                        <span>⭐ {item.savesCount.toLocaleString()}</span>
                      </div>

                    </div>

                    {/* Middle Card metadata & specifications */}
                    <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between">
                      <div>
                        
                        <div className="flex items-center justify-between gap-1.5 mb-0.5">
                          <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest truncate">
                            {item.category}
                          </span>
                          <span className="text-[9px] font-bold text-stone-400">
                            {item.timeLabel}
                          </span>
                        </div>

                        <h4 className="text-xs sm:text-sm font-extrabold text-stone-100 tracking-tight group-hover:text-amber-400 leading-snug transition-colors line-clamp-2">
                          {item.title}
                        </h4>

                        {/* Seller & Verification */}
                        {item.sellerName && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-stone-400 font-semibold truncate">
                            <span className="truncate text-stone-300">{item.sellerName}</span>
                            {item.isPremium ? (
                              <BadgeCheck className="w-3.5 h-3.5 text-amber-500 fill-amber-100 shrink-0 inline drop-shadow-sm" title="Premium Verified Seller" />
                            ) : item.isVerified ? (
                              <BadgeCheck className="w-3.5 h-3.5 text-blue-500 fill-blue-50 shrink-0 inline drop-shadow-sm" title="Verified KYC Seller" />
                            ) : null}
                          </div>
                        )}

                        {/* Location / CTR specifications */}
                        <div className="flex items-center gap-1 text-stone-400 font-bold text-[9px] sm:text-[10px] uppercase tracking-wider mt-1.5 bg-stone-900/30 p-1.5 rounded-lg border border-stone-850/40">
                          <MapPin className="w-3 h-3 text-stone-400" />
                          <span className="truncate pr-1 border-r border-stone-800">{item.location}</span>
                          <span className="pl-1">📈 CTR: {item.clickThroughRate}%</span>
                        </div>

                      </div>

                      {/* Bottom Actions Frame */}
                      <div className="mt-2 pt-2 border-t border-stone-900/60 flex items-center justify-between">
                        {/* Price display */}
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider leading-none mb-0.5">Price</span>
                          <span className="text-xs sm:text-sm font-black font-mono text-amber-500 leading-none">
                            {formatPKR(item.price, item.currencySymbol || item.currency)}
                          </span>
                        </div>
                      </div>

                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            </div>

            {/* Right Scroll Trigger */}
            <button
              type="button"
              onClick={() => scrollContainer(scrollRef, 'right')}
              className="absolute right-0 lg:-right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-900/95 border-2 border-stone-800 backdrop-blur shadow-2xl rounded-full flex flex-col items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all flex active:scale-95 cursor-pointer opacity-90 hover:opacity-100 hidden md:flex"
              aria-label="Scroll Right"
            >
              <ChevronRight className="w-5 h-5 font-black" />
            </button>
          </div>
        ) : (
          <div className="bg-stone-950 border border-stone-850 rounded-[2.5rem] p-12 text-center">
            <div className="text-4xl mb-4 animate-pulse">📈</div>
            <p className="font-semibold text-stone-400 uppercase tracking-widest text-xs">No listings met popularity criteria matching this filter...</p>
          </div>
        )}

      </div>
    </div>
  );
}
