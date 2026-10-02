import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Settings,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { Listing } from '../types';
import { formatPKR, cn } from '../lib/utils';
import { useDragScroll, scrollContainer } from '../lib/useScroll';
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

interface HappeningNowProps {
  listings: Listing[];
  isHomePage?: boolean;
  isBattleBids?: boolean;
  onExploreClick?: () => void;
}

export interface ActivityEvent {
  id: string; // Unique Activity ID
  type: 'new_listing' | 'price_drop' | 'luxury_lot' | 'trending' | 'popular_seller' | 'local';
  icon: string;
  badgeColor: string;
  label: string; // e.g. "Price dropped" or "New listing added"
  title: string; // item/deal title
  subtitle?: string; // custom info, e.g. "Price reduced by 15%!"
  description?: string; // item description
  itemId: string; // referenced Listing ID
  image?: string;
  category: string;
  location: string;
  price: number;
  currency?: string;
  currencySymbol?: string;
  originalPrice?: number;
  discountPercent?: number;
  timestampRaw: Date; // For custom live tracking
  timestampLabel: string; // "Just now", "5m ago", etc.
  views?: number;
  saves?: number;
  bidsCount?: number;
  isVerified?: boolean;
}

export function HappeningNow({ 
  listings, 
  isHomePage = false,
  isBattleBids = false,
  onExploreClick
}: HappeningNowProps) {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  // Notification Preferences
  const [notifState, setNotifState] = useState({
    drops: true,
    local: false,
    luxury: true,
  });
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [alertToast, setAlertToast] = useState<string | null>(null);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mandi_happening_now_notifs');
      if (saved) {
        try {
          setNotifState(JSON.parse(saved));
        } catch (e) {
          // ignore
        }
      }
    } catch(e) {}
  }, []);

  const handleToggleNotif = (key: keyof typeof notifState, label: string) => {
    const updated = { ...notifState, [key]: !notifState[key] };
    setNotifState(updated);
    try {
      localStorage.setItem('mandi_happening_now_notifs', JSON.stringify(updated));
    } catch(e) {}
    
    // Show a sleek alert toast
    if (updated[key]) {
      triggerToast(`🔔 Alert set: We will notify you about new ${label}!`);
    } else {
      triggerToast(`❌ Disabled alerts for ${label}.`);
    }
  };

  const triggerToast = (msg: string) => {
    setAlertToast(msg);
    setTimeout(() => {
      setAlertToast(prev => prev === msg ? null : prev);
    }, 3000);
  };

  // State
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [visibleCount, setVisibleCount] = useState<number>(10);

  const scrollRef = useRef<HTMLDivElement>(null);
  const dragProps = useDragScroll(scrollRef);

  // Dynamic list of events generated once, then periodically appended/manipulated to represent active flow
  const [activities, setActivities] = useState<ActivityEvent[]>([]);

  // Favorite local states to reflect instant UI saves
  const [savedItemIds, setSavedItemIds] = useState<Record<string, boolean>>({});

  // Build the core seed array of activities based on actual listings
  useEffect(() => {
    if (listings.length === 0) {
      setActivities([]);
      return;
    }

    const liveListings = listings.filter(d => d.status === 'LIVE' && (d.quantity || 0) > 0);
    const getTimeMs = (d: any): number => {
      if (!d) return 0;
      if (typeof d.toDate === 'function') {
        const t = d.toDate().getTime();
        return isNaN(t) ? 0 : t;
      }
      if (d.seconds) {
        return d.seconds * 1000;
      }
      const t = new Date(d).getTime();
      return isNaN(t) ? 0 : t;
    };

    const sortedListings = [...liveListings].sort((a, b) => {
      return getTimeMs(b.createdAt) - getTimeMs(a.createdAt);
    });

    const list: ActivityEvent[] = [];

    // Helper to generate dynamic looking timestamps with clean whole numbers (no floating point decimals)
    const generateTimeInfo = (itemOrIndex?: Listing | number, indexOrMultiplier: number = 0, typeMultiplier = 1) => {
      let minutesAgo: number;
      let item: Listing | undefined;
      let idx = 0;
      let mult = 1;

      if (typeof itemOrIndex === 'object' && itemOrIndex !== null) {
        item = itemOrIndex;
        idx = indexOrMultiplier;
        mult = typeMultiplier;
      } else if (typeof itemOrIndex === 'number') {
        idx = itemOrIndex;
        mult = indexOrMultiplier || 1;
      }

      if (item && item.createdAt) {
        const date = item.createdAt.toDate ? item.createdAt.toDate() : new Date(item.createdAt.seconds ? item.createdAt.seconds * 1000 : item.createdAt);
        const parsedTime = date.getTime();
        if (!isNaN(parsedTime)) {
          const diffMs = Date.now() - parsedTime;
          minutesAgo = Math.max(1, Math.floor(diffMs / 60000));
        } else {
          minutesAgo = Math.max(1, Math.floor(idx * 8 * mult + 2));
        }
      } else {
        minutesAgo = Math.max(1, Math.floor(idx * 8 * mult + 2));
      }

      let label = minutesAgo === 1 ? '1 Minute Ago' : `${minutesAgo} Minutes Ago`;
      if (minutesAgo >= 60) {
        const hours = Math.floor(minutesAgo / 60);
        label = hours === 1 ? '1 Hour Ago' : `${hours} Hours Ago`;
      }
      const rawDate = new Date(Date.now() - minutesAgo * 60000);
      return { label, rawDate };
    };

    // 1. Core Price Drops (Intelligent Grouping for identical items included)
    const rawPriceDropped = sortedListings.filter(item => item.priceDropped === true);
    // Group identical items together or map them
    const mappedPriceDrops: ActivityEvent[] = [];
    const groupedPriceCount: Record<string, number> = {};

    rawPriceDropped.forEach(item => {
      groupedPriceCount[item.id] = (groupedPriceCount[item.id] || 0) + 1;
    });

    rawPriceDropped.forEach((item, idx) => {
      // Anti-duplication grouping rule
      const timesDropped = groupedPriceCount[item.id] || 1;
      const titleLabel = timesDropped > 1 
        ? `Price Reduced ${timesDropped} Times Today` 
        : 'Price dropped';

      const discountPercent = item.priceDroppedPercent || (item.previousPrice 
        ? Math.round(((item.previousPrice - item.price) / item.previousPrice) * 100) 
        : 15);

      const time = generateTimeInfo(item, idx, 1.2);

      mappedPriceDrops.push({
        id: `drop-${item.id}-${idx}`,
        type: 'price_drop',
        icon: '📉',
        badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        label: titleLabel,
        title: item.title,
        subtitle: `Huge ${discountPercent}% discount detected on this hot deal!`,
        description: item.description || `Huge ${discountPercent}% discount detected on this hot deal!`,
        itemId: item.id,
        image: item.images?.[0] || undefined,
        category: item.category,
        location: item.city,
        price: item.price,
        currency: item.currency,
        currencySymbol: item.currencySymbol,
        originalPrice: item.previousPrice || item.originalPrice || item.price * 1.15,
        discountPercent: discountPercent,
        timestampRaw: time.rawDate,
        timestampLabel: time.label,
        views: item.views || 10,
        saves: item.saves || 2,
      });
    });

    list.push(...mappedPriceDrops);

    // 3. Luxury Lot Activity
    const luxuryDocs = sortedListings.filter(item => item.price >= 80000 || item.category?.toLowerCase()?.includes('vehicle') || item.category?.toLowerCase()?.includes('property'));
    luxuryDocs.forEach((item, idx) => {
      const time = generateTimeInfo(item, idx + 2, 2.5);
      list.push({
        id: `luxury-${item.id}`,
        type: 'luxury_lot',
        icon: '💎',
        badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        label: 'Luxury lot added',
        title: item.title,
        subtitle: `Premium quality item listed from high-value inventory.`,
        description: item.description || `Premium quality item listed from high-value inventory.`,
        itemId: item.id,
        image: item.images?.[0] || undefined,
        category: item.category,
        location: item.city,
        price: item.price,
        currency: item.currency,
        currencySymbol: item.currencySymbol,
        timestampRaw: time.rawDate,
        timestampLabel: time.label,
        views: item.views || 4,
        saves: item.saves || 1,
      });
    });

    // 4. New Listings
    sortedListings.slice(0, 10).forEach((item, idx) => {
      const time = generateTimeInfo(item, idx, 0.8);
      list.push({
        id: `new-${item.id}`,
        type: 'new_listing',
        icon: '🆕',
        badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        label: 'New listing added',
        title: item.title,
        subtitle: `Fresh listing added to the marketplace.`,
        description: item.description || `Fresh listing added to the marketplace.`,
        itemId: item.id,
        image: item.images?.[0] || undefined,
        category: item.category,
        location: item.city,
        price: item.price,
        currency: item.currency,
        currencySymbol: item.currencySymbol,
        timestampRaw: time.rawDate,
        timestampLabel: time.label,
        views: item.views || 1,
        saves: item.saves || 0,
      });
    });

    // 5. Trending Activity
    const trendingDocs = sortedListings.filter(item => (item.views || 0) > 15 || item.isFeatured === true);
    trendingDocs.forEach((item, idx) => {
      const time = generateTimeInfo(item, idx + 3, 2.2);
      list.push({
        id: `trending-${item.id}`,
        type: 'trending',
        icon: '📈',
        badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
        label: 'Trending now',
        title: item.title,
        subtitle: `Aesthetic layout gaining buyers rapidly with high visibility score.`,
        description: item.description || `Aesthetic layout gaining buyers rapidly with high visibility score.`,
        itemId: item.id,
        image: item.images?.[0] || undefined,
        category: item.category,
        location: item.city,
        price: item.price,
        currency: item.currency,
        currencySymbol: item.currencySymbol,
        timestampRaw: time.rawDate,
        timestampLabel: time.label,
        views: item.views || 55,
        saves: item.saves || 12,
      });
    });

    // 6. Popular Seller Activity
    const verifiedSellerDocs = sortedListings.filter(item => item.isVerifiedListing === true);
    verifiedSellerDocs.forEach((item, idx) => {
      const time = generateTimeInfo(item, idx + 1, 1.9);
      list.push({
        id: `verified-seller-${item.id}`,
        type: 'popular_seller',
        icon: '✅',
        badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        label: 'Verified seller posted',
        title: item.title,
        subtitle: `Guaranteed verified items with official trust clearance badge.`,
        description: item.description || `Guaranteed verified items with official trust clearance badge.`,
        itemId: item.id,
        image: item.images?.[0] || undefined,
        category: item.category,
        location: item.city,
        price: item.price,
        currency: item.currency,
        currencySymbol: item.currencySymbol,
        timestampRaw: time.rawDate,
        timestampLabel: time.label,
        isVerified: true,
        views: item.views || 6,
        saves: item.saves || 1,
      });
    });

    // 7. Local Marketplace Activity
    // Prioritize user profile's city or default general local cities
    const userCity = userProfile?.city || 'Lahore';
    const localDocs = sortedListings.filter(item => item.city?.toLowerCase() === userCity.toLowerCase());
    
    // If no listings in user's city, pick any listings in prominent cities
    const fallbackLocalDocs = localDocs.length > 0 ? localDocs : sortedListings.filter(item => ['lahore', 'karachi', 'islamabad', 'faisalabad'].includes(item.city?.toLowerCase()));

    fallbackLocalDocs.slice(0, 10).forEach((item, idx) => {
      const time = generateTimeInfo(item, idx, 1.4);
      list.push({
        id: `local-${item.id}`,
        type: 'local',
        icon: '📍',
        badgeColor: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
        label: 'Near you',
        title: item.title,
        subtitle: `Located close for quick physical pickup & direct cash inspection.`,
        description: item.description || `Located close for quick physical pickup & direct cash inspection.`,
        itemId: item.id,
        image: item.images?.[0] || undefined,
        category: item.category,
        location: item.city,
        price: item.price,
        currency: item.currency,
        currencySymbol: item.currencySymbol,
        timestampRaw: time.rawDate,
        timestampLabel: time.label,
        views: item.views || 8,
        saves: item.saves || 1,
      });
    });

    // Anti-Duplication: De-duplicate listings entirely to maximize diversity in rendering
    // and preserve distinct, elegant list architecture (only unique listed items in the active feed)
    const uniqueList: ActivityEvent[] = [];
    const seenItemIds = new Set<string>();

    list.forEach(item => {
      if (!seenItemIds.has(item.itemId)) {
        seenItemIds.add(item.itemId);
        uniqueList.push(item);
      }
    });

    // Sort by newest baseline
    uniqueList.sort((a, b) => b.timestampRaw.getTime() - a.timestampRaw.getTime());

    setActivities(uniqueList);
  }, [listings, userProfile]);

  // Sync favorites on init or user change
  useEffect(() => {
    let isMounted = true;
    // Disabled favorite fetch on mount to improve performance
    return () => {
      isMounted = false;
    };
  }, [user, activities]);

  // Toggling favorite
  const handleToggleFavorite = async (itemId: string, itemTitle: string, itemPrice: number, itemImg?: string) => {
    if (!user) {
      navigate('/login');
      return;
    }

    const isFav = !!savedItemIds[itemId];
    const favRef = doc(db, `users/${user.uid}/favorites`, itemId);
    const listingRef = doc(db, 'listings', itemId);

    // Optimistic state updates for snappy responsive UI
    setSavedItemIds(prev => ({ ...prev, [itemId]: !isFav }));
    triggerToast(isFav ? `💔 Removed ${itemTitle.substring(0, 20)} from your watchlist.` : `❤️ Favorite Saved: ${itemTitle.substring(0, 20)}`);

    try {
      if (isFav) {
        await deleteDoc(favRef);
        await updateDoc(listingRef, {
          saves: increment(-1),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } else {
        await setDoc(favRef, {
          listingId: itemId,
          savedAt: serverTimestamp(),
          title: itemTitle,
          price: itemPrice,
          image: itemImg || null,
        });
        await updateDoc(listingRef, {
          saves: increment(1),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    } catch (err) {
      // Revert optimism if actual crash happens
      setSavedItemIds(prev => ({ ...prev, [itemId]: isFav }));
      console.warn("Favorite sync failed: ", err);
    }
  };

  const handleShare = (itemId: string, titleStr: string) => {
    const origin = window.location.origin;
    const url = `${origin}/listings/${itemId}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        triggerToast(`🔗 Link Copied: Recipient can view ${titleStr.substring(0, 20)} directly!`);
      }).catch(() => {
        triggerToast("Failed to copy URL to clipboard");
      });
    } else {
      triggerToast(`URL: ${url}`);
    }
  };

  // Filter & Sort computation
  const processedActivities = useMemo(() => {
    let filtered = [...activities];

    // Filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter(act => act.type === activeFilter);
    }

    // Sort
    if (sortBy === 'newest') {
      filtered.sort((a, b) => b.timestampRaw.getTime() - a.timestampRaw.getTime());
    } else if (sortBy === 'popular') {
      filtered.sort((a, b) => (b.views || 0) + (b.saves || 0) * 3 - ((a.views || 0) + (a.saves || 0) * 3));
    } else if (sortBy === 'ending') {
      filtered.sort((a, b) => b.timestampRaw.getTime() - a.timestampRaw.getTime());
    } else if (sortBy === 'nearby') {
      const userCity = userProfile?.city || 'Lahore';
      filtered.sort((a, b) => {
        const aNear = a.location?.toLowerCase() === userCity.toLowerCase();
        const bNear = b.location?.toLowerCase() === userCity.toLowerCase();
        if (aNear && !bNear) return -1;
        if (!aNear && bNear) return 1;
        return b.timestampRaw.getTime() - a.timestampRaw.getTime();
      });
    } else if (sortBy === 'discount') {
      filtered.sort((a, b) => {
        const discA = a.discountPercent || 0;
        const discB = b.discountPercent || 0;
        return discB - discA;
      });
    } else if (sortBy === 'active') {
      filtered.sort((a, b) => {
        const scoreA = (a.views || 0) + (a.saves || 0) * 2 + (a.bidsCount || 0) * 5;
        const scoreB = (b.views || 0) + (b.saves || 0) * 2 + (b.bidsCount || 0) * 5;
        return scoreB - scoreA;
      });
    }

    return filtered;
  }, [activities, activeFilter, sortBy, userProfile]);

  // Paginated/Sliced results
  const slicedActivities = useMemo(() => {
    return processedActivities.slice(0, visibleCount);
  }, [processedActivities, visibleCount]);

  return (
    <div id="happening-now-section" className="w-full">
      {/* Alert toast notification */}
      <AnimatePresence>
        {alertToast && (
          <motion.div 
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 bg-stone-900 border border-amber-500/40 text-stone-100 rounded-2xl px-5 py-3.5 shadow-2xl flex items-center gap-3 backdrop-blur-md max-w-sm"
          >
            <div className="bg-amber-500 text-stone-950 font-black rounded-full w-6 h-6 flex items-center justify-center text-xs animate-pulse">
              🔔
            </div>
            <p className="text-xs font-bold leading-normal">{alertToast}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-4 lg:gap-6">
        
        {/* Short introduction before the category display Name */}
        {isBattleBids && (
          <div className="px-2 text-left mb-1">
            <p className="text-stone-400 text-xs sm:text-sm font-semibold max-w-2xl leading-relaxed">
              Stay updated with live bids, price drops, and trading floor activities happening in real-time across the marketplace.
            </p>
          </div>
        )}

        {/* Head Controls Banner */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-rose-500 font-extrabold text-xs uppercase tracking-[0.4em] leading-none">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" /> 
              </div>
              <div className="flex items-center gap-4">
                <h2 className="text-2xl lg:text-3.5xl font-black italic uppercase tracking-tighter text-white leading-none">
                  {isBattleBids ? (
                    <>Happening <span className="text-amber-500 font-black">Now on the Marketplace</span></>
                  ) : (
                    <>Happening <span className="text-amber-500">Now</span></>
                  )}
                </h2>
                <button
                  onClick={onExploreClick || (() => navigate(isBattleBids ? '/battle-bids/explore' : '/listings'))}
                  className="flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs font-black uppercase tracking-widest text-stone-300 hover:text-amber-400 hover:border-amber-500/50 transition-all shadow-sm shrink-0 cursor-pointer"
                >
                  Explore <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Quick Notification Follow & Sorting Options */}
          <div className="flex flex-row items-center justify-start sm:justify-end gap-2 shrink-0 w-full md:w-auto mt-2 md:mt-0 overflow-x-auto no-scrollbar">
            
            {/* Native alert switches */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowNotifMenu(!showNotifMenu)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all border shadow-sm whitespace-nowrap",
                  showNotifMenu 
                    ? "bg-amber-500 border-amber-400 text-stone-955" 
                    : "bg-stone-900 border-stone-800 text-stone-300 hover:text-amber-400 hover:border-amber-500/30"
                )}
              >
                <Bell className="w-3.5 h-3.5 stroke-[3]" />
                <span>Follow Activity</span>
              </button>

              {/* Notification preferences dropdown menu */}
              <AnimatePresence>
                {showNotifMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-64 bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-xl z-50 text-white"
                    >
                      <div className="flex items-center justify-between border-b border-stone-800 pb-2 mb-3">
                        <span className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                          <Settings className="w-3.5 h-3.5 text-amber-500" /> Action Watcher
                        </span>
                        <button onClick={() => setShowNotifMenu(false)} className="text-stone-400 hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-3">
                        <label className="flex items-center justify-between cursor-pointer group">
                          <span className="text-xs font-bold text-stone-300 group-hover:text-white transition-colors">📉 Reduced Price Drops</span>
                          <input 
                            type="checkbox" 
                            checked={notifState.drops} 
                            onChange={() => handleToggleNotif('drops', 'Price Drops')}
                            className="rounded border-stone-850 bg-stone-950 text-amber-500 focus:ring-amber-500 w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer group">
                          <span className="text-xs font-bold text-stone-300 group-hover:text-white transition-colors">📍 Local Deals Nearby</span>
                          <input 
                            type="checkbox" 
                            checked={notifState.local} 
                            onChange={() => handleToggleNotif('local', 'Local Deals')}
                            className="rounded border-stone-850 bg-stone-950 text-amber-500 focus:ring-amber-500 w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </label>

                        <label className="flex items-center justify-between cursor-pointer group">
                          <span className="text-xs font-bold text-stone-300 group-hover:text-white transition-colors">💎 Luxury Lot Listings</span>
                          <input 
                            type="checkbox" 
                            checked={notifState.luxury} 
                            onChange={() => handleToggleNotif('luxury', 'LuxuryLots')}
                            className="rounded border-stone-850 bg-stone-950 text-amber-500 focus:ring-amber-500 w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </label>
                      </div>

                      <div className="mt-4 bg-stone-950/50 p-2.5 rounded-lg border border-stone-850">
                        <p className="text-xs text-stone-400 leading-normal font-medium">
                          Alert notifications trigger a dynamic status card instantly when real platform actions occur.
                        </p>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Sorting Select widget */}
            <div className="flex items-center gap-2 bg-stone-900 border border-stone-800 rounded-xl px-3 py-1.5 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-stone-400 stroke-[3]" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent border-none text-[10px] sm:text-xs font-black uppercase tracking-widest text-stone-300 focus:ring-0 outline-none cursor-pointer"
              >
                <option value="newest" className="bg-stone-900 text-white">Newest First</option>
                <option value="popular" className="bg-stone-900 text-white">Most Popular</option>
                <option value="nearby" className="bg-stone-900 text-white">Nearby first</option>
                <option value="discount" className="bg-stone-900 text-white">Highest Discount</option>
                <option value="active" className="bg-stone-900 text-white">Most Active</option>
              </select>
            </div>

          </div>
        </div>

        {/* Filter Pills Toggles (Highly Mobile-Optimized horizontal scrolling row) */}
        <div className="flex flex-row items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex items-center gap-1 px-2 py-1 bg-stone-950/60 border border-stone-850 rounded-xl shrink-0">
            <Filter className="w-3 h-3 text-stone-400" />
            <span className="text-xs font-black text-stone-400 uppercase tracking-wider pr-1">Filter</span>
          </div>
          {[
            { id: 'all', label: 'All Feed', shortcut: '⚡' },
            { id: 'price_drop', label: 'Price Drops', shortcut: '📉' },
            { id: 'luxury_lot', label: 'Luxury Lots', shortcut: '💎' },
            { id: 'new_listing', label: 'New Listings', shortcut: '🆕' },
            { id: 'trending', label: 'Trending', shortcut: '📈' },
            { id: 'popular_seller', label: 'Sellers', shortcut: '✅' },
            { id: 'local', label: 'Near You', shortcut: '📍' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveFilter(tab.id);
                setVisibleCount(6); // Reset pagination
              }}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-[10.5px] font-black uppercase tracking-wider transition-all duration-150 shrink-0 select-none border whitespace-nowrap",
                activeFilter === tab.id
                  ? "bg-stone-100 border-stone-200 text-stone-950 font-black shadow-sm"
                  : "bg-stone-900/60 border-stone-850 hover:border-stone-700 text-stone-400 hover:text-stone-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dynamic Activity Stream Feed Grid */}
        {slicedActivities.length > 0 ? (
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
              className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-1 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
            >
              <AnimatePresence mode="popLayout">
                {slicedActivities.map((act) => {
                  const isSaved = !!savedItemIds[act.itemId];
                  
                  return (
                    <motion.div
                      key={act.id}
                      layoutId={act.id}
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      onDragStart={(e) => e.preventDefault()}
                      onClick={(e) => {
                        if (e.target instanceof Element && e.target.closest('button, a')) return;
                        navigate(`/listings/${act.itemId}`);
                      }}
                      className="w-[58%] sm:w-[45%] md:w-[360px] shrink-0 flex flex-col bg-stone-900 border border-stone-800/80 rounded-[1.5rem] p-4 relative hover:border-amber-500/50 hover:bg-stone-850 transition-all duration-300 group overflow-hidden cursor-pointer shadow-lg hover:shadow-xl snap-start"
                    >
                    {/* Content Glow Background on hover */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/0 via-amber-500/0 to-amber-500/[0.01] opacity-0 group-hover:opacity-100 transition-all pointer-events-none" />

                    {/* Top Row: Type info & Timestamp */}
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <div className={cn("flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border text-[10px] sm:text-xs font-black uppercase tracking-wider", act.badgeColor)}>
                        <span>{act.label}</span>
                      </div>
                      <div className="flex items-center gap-1 text-stone-400 font-bold text-[9px] sm:text-xs uppercase tracking-widest bg-stone-900/40 px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded-md border border-stone-850/50">
                        <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-stone-400" />
                        <span>{act.timestampLabel}</span>
                      </div>
                    </div>

                    {/* Core Body Section beneath images */}
                    {isHomePage ? (
                      <div className="flex flex-col flex-1">
                        {/* Image Section */}
                        {act.image ? (
                          <div className="w-full h-32 sm:h-36 md:h-40 rounded-xl overflow-hidden bg-stone-900 border border-stone-850/80 relative mb-2.5 shrink-0">
                            <img 
                              src={act.image} 
                              alt={act.title} 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition-transform duration-350 group-hover:scale-105"
                            />
                          </div>
                        ) : (
                          <div className="w-full h-32 sm:h-36 md:h-40 rounded-xl bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-850/80 flex items-center justify-center text-3xl sm:text-4xl mb-2.5 shrink-0">
                            {act.icon}
                          </div>
                        )}

                        {/* 5 Single Rows beneath images */}
                        <div className="flex flex-col gap-1 text-left min-w-0 flex-1">
                          {/* Row 1: Category name in a single row */}
                          <div className="text-[10px] sm:text-xs uppercase font-black tracking-widest text-amber-500/90 truncate leading-tight">
                            {act.category || "General"}
                          </div>

                          {/* Row 2: Title in a single row */}
                          <h4 className="text-xs sm:text-sm font-extrabold text-stone-100 tracking-tight leading-snug group-hover:text-amber-400 transition-colors truncate">
                            {act.title}
                          </h4>

                          {/* Row 3: Description in a single row */}
                          <p className="text-[10px] sm:text-xs text-stone-400 font-medium truncate leading-tight">
                            {act.description || act.subtitle || "Active marketplace listing."}
                          </p>

                          {/* Row 4: Location (city) in a single row */}
                          <div className="flex items-center gap-1 text-stone-400 font-bold text-[10px] sm:text-xs uppercase tracking-wider truncate">
                            <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500/80 shrink-0" />
                            <span className="truncate">{act.location || "Location Unknown"}</span>
                          </div>

                          {/* Row 5: Price in a single row */}
                          <div className="flex items-center justify-between gap-2 mt-1 pt-1.5 border-t border-stone-850/60 min-w-0">
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-xs sm:text-sm font-black text-amber-500 tracking-tight font-mono leading-none">
                                {formatPKR(act.price, act.currencySymbol || act.currency)}
                              </span>
                              {act.originalPrice && act.originalPrice > act.price ? (
                                <span className="line-through text-stone-500 text-[10px] sm:text-xs font-semibold font-mono leading-none">
                                  {formatPKR(act.originalPrice, act.currencySymbol || act.currency)}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleToggleFavorite(act.itemId, act.title, act.price, act.image); }}
                                className={cn(
                                  "p-1 rounded-md transition-colors",
                                  isSaved ? "text-red-500 hover:bg-red-500/10" : "text-stone-500 hover:text-red-400"
                                )}
                                title={isSaved ? "Saved" : "Save"}
                              >
                                <Heart className={cn("w-3.5 h-3.5", isSaved && "fill-current")} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-row gap-2.5 items-start flex-1 mb-2">
                        {/* Image Frame */}
                        {act.image ? (
                          <div className="w-[68px] h-[68px] sm:w-[74px] sm:h-[74px] rounded-xl overflow-hidden shrink-0 bg-stone-900 border border-stone-850/80 relative">
                            <img 
                              src={act.image} 
                              alt={act.title} 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition-transform duration-350 group-hover:scale-105"
                            />
                          </div>
                        ) : (
                          <div className="w-[68px] h-[68px] sm:w-[74px] sm:h-[74px] rounded-xl shrink-0 bg-stone-900 border border-stone-850/80 flex items-center justify-center text-xl">
                            {act.icon}
                          </div>
                        )}
                        {/* Info details */}
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="text-[9px] sm:text-xs uppercase font-black tracking-widest text-stone-400 truncate leading-tight">
                            {act.category}
                          </div>
                          <h4 className="text-xs sm:text-sm font-extrabold text-stone-100 tracking-tight leading-snug group-hover:text-amber-400 transition-colors truncate">
                            {act.title}
                          </h4>
                          
                          {(act.description || act.subtitle) && (
                            <p className="text-[10px] sm:text-xs text-stone-400 font-medium truncate leading-tight">
                              {act.description || act.subtitle}
                            </p>
                          )}
                          {/* Location pin tag */}
                          <div className="flex items-center gap-1 text-stone-400 font-bold text-[9px] sm:text-xs uppercase tracking-wider mt-0.5">
                            <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-stone-400" />
                            <span className="truncate">{act.location}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bottom Action Section for Non-Homepage Mode */}
                    {!isHomePage && (
                      <div className="mt-auto pt-1.5 sm:pt-2 border-t border-stone-900 flex items-center justify-between gap-2">
                        <div className="flex flex-col min-w-0 gap-0.5">
                          {act.originalPrice && act.originalPrice > act.price ? (
                            <span className="line-through text-stone-600 text-xxs font-black font-mono leading-none mb-0.5">
                              {formatPKR(act.originalPrice, act.currencySymbol || act.currency)}
                            </span>
                          ) : null}
                          <span className="text-xs sm:text-sm font-black text-amber-500 tracking-tight font-mono leading-none">
                            {formatPKR(act.price, act.currencySymbol || act.currency)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleShare(act.itemId, act.title); }}
                            className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-white border border-stone-800 transition-colors"
                            title="Share deal"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleToggleFavorite(act.itemId, act.title, act.price, act.image); }}
                            className={cn(
                              "p-1.5 rounded-lg border transition-colors",
                              isSaved 
                                ? "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20" 
                                : "bg-stone-900 border-stone-800 text-stone-400 hover:text-red-400"
                            )}
                            title={isSaved ? "Saved" : "Save"}
                          >
                            <Heart className={cn("w-3.5 h-3.5", isSaved && "fill-current")} />
                          </button>

                          <Link 
                            to={`/listings/${act.itemId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-stone-955 font-extrabold text-xs px-3 py-2 rounded-lg uppercase tracking-wider transition-all"
                          >
                            <span>View Listing</span>
                          </Link>
                        </div>
                      </div>
                    )}
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
            <div className="text-4xl mb-4 animate-bounce">⚡</div>
            <p className="font-semibold text-stone-400 uppercase tracking-widest text-xs">Waiting for live activities... Tracking new listings in real time.</p>
          </div>
        )}

      </div>
    </div>
  );
}
