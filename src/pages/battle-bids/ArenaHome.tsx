import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ChevronLeft, 
  Loader2, 
  Plus, 
  Sparkles, 
  User, 
  History, 
  MessageSquare, 
  Award,
  TrendingUp,
  Database,
  SlidersHorizontal,
  Flame,
  Eye,
  Users,
  Gavel,
  Heart,
  BarChart3,
  X,
  Shield,
  Play,
  Pause,
  AlertTriangle,
  UserX,
  UserCheck,
  Trash2,
  Check,
  MapPin,
  Timer,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Star,
  Coins,
  ChevronRight,
  Clock,
  Zap
} from 'lucide-react';
import { useCredits } from '../../features/credits';
import { useCurrency } from '../../context/CurrencyContext';
import { filterListingsByCurrency } from '../../lib/currencies';
import { 
  ArenaLayout, 
  ArenaCard, 
  ArenaDiscovery,
  ArenaTabs, 
  ArenaNotificationShortcut, 
  ArenaLiveStats, 
  ArenaButton,
  BidHistoryChart,
  ArenaGallery,
  ArenaTacticalActions,
  WatchButton,
  ReportButton,
  ArenaGoLiveModal,
  ArenaUserProfileCard,
  ArenaMyBidsSection,
  ArenaMyAuctionsSection
} from '../../features/battle-bids/components';
import { UpcomingAuctionNotice } from '../../features/battle-bids/components/shared/UpcomingAuctionNotice';
import { ArenaBidsTabsSection } from '../../features/battle-bids/components/ArenaBidsTabsSection';
import { useDiscovery } from '../../features/battle-bids/hooks/useDiscovery';
import { DiscoveryService } from '../../features/battle-bids/services/discoveryService';
import { collection, query, where, collectionGroup, onSnapshot, doc, getDoc, getDocs, limit, updateDoc, serverTimestamp, documentId } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { ArenaService } from '../../features/battle-bids/services/arenaService';
import { AuctionItem, ModerationActionType } from '../../features/battle-bids/types';
import { executeCentralBlock, executeCentralUnblock, isUserBanned, getUserBanRemaining } from '../../services/userService';
import { parseSafeDate, formatPostDateTime } from '../../features/battle-bids/utils/arena';
import { OfferConfirmationModal } from '../../features/battle-bids/components/shared/OfferConfirmationModal';
import { useAuctionEngine } from '../../features/battle-bids/hooks/useAuctionEngine';
import { ArenaLiveCountdown } from '../../features/battle-bids/components/ArenaLiveCountdown';
import { CreditBalanceBadge } from '../../features/credits';
import { useSellerProfile } from '../../features/battle-bids/hooks/useSellerProfile';
import { getFallbackSellerProfile } from '../../features/battle-bids/utils/fallbackProfile';
import { ProfileVerificationTick } from '../../features/battle-bids/components/shared/ProfileVerificationTick';
import { ModerationService } from '../../features/battle-bids/services/moderationService';
import { formatDistanceToNow } from 'date-fns';
import { Listing } from '../../types';
import { HappeningNow } from '../../components/HappeningNow';
import { ThreeDButton } from '../../components/ThreeDButton';
import { formatPrice, getCurrencyByCode } from '../../lib/currencies';
import { AccountBannedBanner } from '../../components/AccountBannedBanner';

const ArenaPlaceholderSlot: React.FC<{ label?: string }> = ({ label = "Reserved Slot" }) => {
  return (
    <div className="w-full flex items-center justify-between px-4 h-[60px] bg-stone-950/20 rounded-xl border border-dashed border-stone-850/60 shrink-0 relative overflow-hidden group hover:border-stone-800/80 transition-all duration-300">
      <div className="flex items-center gap-3 relative z-10">
        <div className="w-8 h-8 rounded-lg bg-stone-900/40 border border-stone-850/50 flex items-center justify-center relative shrink-0">
          <div className="absolute inset-0 bg-amber-500/5 rounded-lg animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500/30 animate-ping absolute" />
          <Activity className="w-3.5 h-3.5 text-stone-600/80 group-hover:text-amber-500/60 transition-colors duration-300 relative z-10" />
        </div>
        <div className="flex flex-col">
          <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{label}</p>
          <span className="text-[8px] text-stone-600 font-bold uppercase tracking-wider animate-pulse">Waiting for tactical action...</span>
        </div>
      </div>
      <div className="flex items-center gap-2 relative z-10 pr-1">
        <div className="flex gap-0.5">
          <div className="w-1 h-3 bg-stone-850/60 rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
          <div className="w-1 h-3 bg-stone-850/60 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
          <div className="w-1 h-3 bg-stone-850/60 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
        </div>
      </div>
    </div>
  );
};

export const ArenaHome: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile, isAdmin } = useAuth();
  const { creditsBalance, openPurchase, refreshCredits, isDemoMode } = useCredits();

  const { 
    items, 
    loading, 
    loadingMore,
    filters, 
    sortBy, 
    hasMore, 
    setSortBy, 
    search,
    loadMore, 
    clearFilters,
    error: discoveryError
  } = useDiscovery({ isNegotiationOnly: false });

  const { selectedCurrency } = useCurrency();
  const [selectedSpotlightAuction, setSelectedSpotlightAuction] = useState<AuctionItem | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [standardListings, setStandardListings] = useState<Listing[]>([]);
  const [upcomingAuctions, setUpcomingAuctions] = useState<AuctionItem[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchUpcoming = async () => {
      try {
        const res = await DiscoveryService.getAuctions({ status: ['upcoming'], isNegotiationOnly: false });
        if (!active) return;
        setUpcomingAuctions(res.items);
      } catch (err) {
        console.error("Error fetching upcoming auctions: ", err);
      } finally {
        if (active) {
          setUpcomingLoading(false);
        }
      }
    };

    fetchUpcoming();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const fetchStandardListings = async () => {
      try {
        const q = query(
          collection(db, 'listings'),
          where('status', 'in', ['LIVE', 'BOOKED', 'SOLD']),
          limit(24)
        );
        const snapshot = await getDocs(q);
        if (!active) return;
        if (!snapshot.empty) {
          const docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Listing));
          setStandardListings(docs);
        }
      } catch (err: any) {
        console.warn("Arena standard listings fetch failed. Using fallback.", err);
      }
    };

    fetchStandardListings();

    return () => {
      active = false;
    };
  }, []);

  // Auto-select spotlight auction from query parameter or router state
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idFromQuery = params.get('id') || params.get('auctionId');
    const idFromState = location.state?.selectedAuctionId;
    const targetId = idFromQuery || idFromState;

    if (targetId) {
      // 1. Instant check in memory cache
      const cached = ArenaService.getCachedAuction(targetId);
      if (cached) {
        setSelectedSpotlightAuction(cached);
        return;
      }

      // 2. Instant check in active items
      const inItems = items.find(i => i.id === targetId);
      if (inItems) {
        setSelectedSpotlightAuction(inItems);
        ArenaService.cacheAuction(inItems);
        return;
      }

      const fetchTarget = async () => {
        try {
          const docRef = doc(db, 'arena_auctions', targetId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const fetched = ArenaService.mapDocToAuction(docSnap);
            ArenaService.cacheAuction(fetched);
            setSelectedSpotlightAuction(fetched);
            setTimeout(() => {
              const el = document.getElementById('arena-spotlight-section');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 100);
          }
        } catch (err: any) {
          console.error("Error fetching selected spotlight from route/state: ", err);
          const errMsg = String(err).toLowerCase();
          if (errMsg.includes('quota') || errMsg.includes('exhausted') || errMsg.includes('limit exceeded')) {
            setQuotaExceeded(true);
          }
        }
      };
      fetchTarget();
    }
  }, [location.search, location.state, items]);

  useEffect(() => {
    if (discoveryError) {
      const errMsg = String(discoveryError).toLowerCase();
      if (errMsg.includes('quota') || errMsg.includes('exhausted') || errMsg.includes('limit exceeded')) {
        setQuotaExceeded(true);
      }
    }
  }, [discoveryError]);

  useEffect(() => {
    setSelectedSpotlightAuction(null);
  }, [filters.status, filters.category, filters.categories, filters.city, filters.minPrice, filters.maxPrice]);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastItemRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore, loadMore]);

  const activeItems = filterListingsByCurrency(items, selectedCurrency);
  const activeUpcomingAuctions = filterListingsByCurrency(upcomingAuctions, selectedCurrency);

  // Items pending Go Live (status === 'upcoming') are excluded from Available Items for Auction
  const availableItems = activeItems.filter(item => item.status !== 'upcoming');

  // Most recently added / launched item on top
  const sortedAvailableByNewest = [...availableItems].sort((a, b) => {
    const timeA = (a.createdAt ? parseSafeDate(a.createdAt)?.getTime() : 0) || (a.startTime ? parseSafeDate(a.startTime)?.getTime() : 0) || 0;
    const timeB = (b.createdAt ? parseSafeDate(b.createdAt)?.getTime() : 0) || (b.startTime ? parseSafeDate(b.startTime)?.getTime() : 0) || 0;
    return timeB - timeA;
  });

  // Global auction event listener for instant deletion and creation synchronization
  useEffect(() => {
    const handleAuctionDeleted = (e: any) => {
      const deletedId = e.detail?.auctionId;
      if (deletedId) {
        if (selectedSpotlightAuction?.id === deletedId) {
          setSelectedSpotlightAuction(null);
        }
        setUpcomingAuctions(prev => prev.filter(i => i.id !== deletedId));
      }
    };

    const handleAuctionCreated = (e: any) => {
      const newAuction = e.detail?.auction;
      if (newAuction && newAuction.status === 'upcoming') {
        setUpcomingAuctions(prev => {
          if (prev.some(i => i.id === newAuction.id)) return prev;
          return [newAuction, ...prev];
        });
      }
    };

    window.addEventListener('arena_auction_deleted' as any, handleAuctionDeleted);
    window.addEventListener('arena_auction_created' as any, handleAuctionCreated);
    return () => {
      window.removeEventListener('arena_auction_deleted' as any, handleAuctionDeleted);
      window.removeEventListener('arena_auction_created' as any, handleAuctionCreated);
    };
  }, [selectedSpotlightAuction]);

  // Auto-select the latest available live item as default spotlight if none is selected
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idFromQuery = params.get('id') || params.get('auctionId');
    const idFromState = location.state?.selectedAuctionId;
    const targetId = idFromQuery || idFromState;

    if (targetId) {
      const match = activeItems.find(i => i.id === targetId) || activeUpcomingAuctions.find(i => i.id === targetId);
      if (match && match.id !== selectedSpotlightAuction?.id) {
        setSelectedSpotlightAuction(match);
      }
    } else if (!selectedSpotlightAuction && sortedAvailableByNewest.length > 0) {
      setSelectedSpotlightAuction(sortedAvailableByNewest[0]);
    }
  }, [location.search, location.state, selectedSpotlightAuction, sortedAvailableByNewest, activeItems, activeUpcomingAuctions]);

  // The active spotlight auction shown beneath buttons & list - strictly respects selectedCurrency
  const validSelectedSpotlight = selectedSpotlightAuction && filterListingsByCurrency([selectedSpotlightAuction], selectedCurrency).length > 0
    ? selectedSpotlightAuction
    : null;
  const spotlightAuction = validSelectedSpotlight || (sortedAvailableByNewest.length > 0 ? sortedAvailableByNewest[0] : null);
  const isSpotlightOwner = Boolean(
    spotlightAuction && user && (
      (spotlightAuction.sellerId && user.uid === spotlightAuction.sellerId) ||
      (spotlightAuction.sellerId && userProfile?.id === spotlightAuction.sellerId) ||
      (spotlightAuction.userId && user.uid === spotlightAuction.userId) ||
      (user.email && spotlightAuction.sellerId && user.email.toLowerCase() === spotlightAuction.sellerId.toLowerCase()) ||
      (spotlightAuction.sellerEmail && user.email && user.email.toLowerCase() === spotlightAuction.sellerEmail.toLowerCase())
    )
  );
  const gridItems = sortedAvailableByNewest;

  const selectSpotlight = useCallback((item: AuctionItem) => {
    setSelectedSpotlightAuction(item);
    const params = new URLSearchParams(location.search);
    params.set('id', item.id);
    navigate({
      pathname: location.pathname,
      search: `?${params.toString()}`
    }, { replace: true });
    setTimeout(() => {
      const el = document.getElementById('arena-spotlight-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, [location.pathname, location.search, navigate]);

  // Connect active spotlight auction to real-time engine
  const { 
    auction: liveSpotlight, 
    bids: spotlightBids, 
    loading: spotlightLoading, 
    timeRemaining: spotlightTimeRemaining, 
    placeBid: spotlightPlaceBid, 
    isKycVerified: spotlightIsKycVerified, 
    isOwner: spotlightIsOwner, 
    remainingBids: spotlightRemainingBids,
    isBannedUser: spotlightIsBannedUser,
    banStatus: spotlightEngineBanStatus
  } = useAuctionEngine(spotlightAuction?.id);

  const spotlightBanStatus = spotlightEngineBanStatus || getUserBanRemaining(userProfile);
  const isSpotlightUserBanned = Boolean(
    spotlightIsBannedUser ||
    isUserBanned(userProfile) ||
    (userProfile as any)?.isBanned ||
    (userProfile as any)?.biddingDisabled ||
    (userProfile as any)?.canBid === false ||
    (userProfile as any)?.isBlocked
  );

  const isSpotlightConcluded = spotlightAuction?.status === 'concluded' || spotlightAuction?.status === 'ended' || spotlightAuction?.status === 'sold' || spotlightAuction?.status === 'reserve_not_met' || spotlightTimeRemaining?.isEnded;
  const isSpotlightPaused = liveSpotlight?.status === 'paused' || spotlightAuction?.status === 'paused' || spotlightTimeRemaining?.isPaused;

  const { profile: spotlightSellerProfile, loading: spotlightSellerProfileLoading } = useSellerProfile(spotlightAuction?.sellerId);

  // Collapsible panel states for (openable)
  const [bidsCalledOpen, setBidsCalledOpen] = useState(false);
  const [myBidsOpen, setMyBidsOpen] = useState(false);
  const [spotlightCopied, setSpotlightCopied] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [goLiveFeedback, setGoLiveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleOpenGoLiveModal = () => {
    if (!user || !spotlightAuction || !isSpotlightOwner) return;
    setShowGoLiveModal(true);
  };

  const handleExecuteGoLive = async () => {
    if (!user || !spotlightAuction || !isSpotlightOwner) return;
    setUserActionLoading(true);
    setGoLiveFeedback(null);
    try {
      await ArenaService.goLive(spotlightAuction.id, spotlightAuction.durationDays || 3, spotlightAuction);
      
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + (spotlightAuction.durationDays || 3) * 24 * 60 * 60 * 1000);
      
      const updatedAuction: AuctionItem = {
        ...spotlightAuction,
        status: 'active',
        launchType: 'now',
        startTime,
        endTime
      };
      
      DiscoveryService.invalidateCache();
      setSelectedSpotlightAuction(updatedAuction);
      setUpcomingAuctions(prev => prev.filter(item => item.id !== spotlightAuction.id));
      
      // Refresh items list so it appears at the top of Available Items for Auction
      search();
      
      setGoLiveFeedback({
        type: 'success',
        message: 'Success! Your post has gone live immediately and is now active in the Available Items section.'
      });

      setTimeout(() => {
        setGoLiveFeedback(null);
      }, 6000);

      setTimeout(() => {
        const el = document.getElementById('spotlight-bidding-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
    } catch (err: any) {
      console.error("Go live error:", err);
      setGoLiveFeedback({
        type: 'error',
        message: err?.message || 'Failed to make auction go live. Please try again.'
      });
      throw err;
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleUserPause = async () => {
    if (!user || !spotlightAuction) return;
    const currentStatus = liveSpotlight?.status || spotlightAuction?.status || 'active';
    const isCurrentlyPaused = currentStatus === 'paused';
    const isConcluded = currentStatus === 'concluded' || currentStatus === 'sold' || spotlightAuction.status === 'concluded' || spotlightAuction.status === 'sold';

    if (!isCurrentlyPaused && isConcluded) {
      alert("Action denied: Listed items cannot be paused once an offer has been accepted by the seller.");
      return;
    }
    
    if (!window.confirm("Are you sure?")) return;
    
    setUserActionLoading(true);
    try {
      if (isCurrentlyPaused) {
        await ArenaService.resumeAuction(spotlightAuction.id);
        alert("Listing resumed.");
      } else {
        await ArenaService.pauseAuction(spotlightAuction.id);
        alert("Listing paused.");
      }
    } catch (err: any) {
      alert(err.message || "Action failed.");
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleUserDelete = async () => {
    if (!user || !spotlightAuction) return;
    if (!window.confirm("Are you sure you want to permanently delete this listing?")) return;
    setUserActionLoading(true);
    try {
      await ArenaService.deleteAuction(spotlightAuction.id);
      alert("Listing permanently removed on behalf of owner.");
      navigate('/battle-bids/my-auctions');
    } catch (err: any) {
      alert(err.message || "Failed to delete listing.");
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleViewsClick = async () => {
    if (!spotlightAuction) return;
    try {
      await ArenaService.recordView(spotlightAuction.id, user?.uid);
    } catch (error) {
      console.error("Failed to increment views:", error);
    }
  };

  const handleSpotlightShare = () => {
    if (!spotlightAuction) return;
    const shareUrl = `${window.location.origin}/battle-bids?id=${spotlightAuction.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setSpotlightCopied(true);
      setTimeout(() => setSpotlightCopied(false), 2000);
    });
  };

  // Global user active bids subscription
  const [myBids, setMyBids] = useState<any[]>([]);
  const [myBidsLoading, setMyBidsLoading] = useState(false);
  const auctionCacheRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!user) {
      setMyBids([]);
      setMyBidsLoading(false);
      return;
    }

    setMyBidsLoading(true);
    const bidsQuery = query(
      collectionGroup(db, 'bids'),
      where('userId', '==', user.uid),
      limit(50)
    );

    const unsubscribe = onSnapshot(bidsQuery, async (snapshot) => {
      try {
        const rawBidsList: Array<{
          bidId: string;
          auctionId: string;
          amount: number;
          timestamp: Date;
        }> = [];

        const uniqueAuctionIds = new Set<string>();

        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          const auctionId = data.auctionId || docSnap.ref.parent.parent?.id;
          const amount = data.amount || 0;
          const timestamp = data.timestamp ? parseSafeDate(data.timestamp) : new Date(0);
          if (auctionId) {
            rawBidsList.push({
              bidId: docSnap.id,
              auctionId,
              amount,
              timestamp
            });
            uniqueAuctionIds.add(auctionId);
          }
        });

        if (rawBidsList.length === 0) {
          setMyBids([]);
          setMyBidsLoading(false);
          return;
        }

        const auctionsMap = new Map<string, any>();
        const uncachedAuctionIds: string[] = [];

        // 1. Check existing caches first (in-memory component cache and ArenaService memory cache)
        uniqueAuctionIds.forEach((id) => {
          const cached = auctionCacheRef.current.get(id) || ArenaService.getCachedAuction(id);
          if (cached) {
            auctionsMap.set(id, cached);
          } else if (id && typeof id === 'string' && id.trim().length > 0) {
            uncachedAuctionIds.push(id.trim());
          }
        });

        // 2. Batched Firestore documentId IN queries (chunks <= 30) for uncached IDs
        if (uncachedAuctionIds.length > 0) {
          const CHUNK_SIZE = 30;
          const chunks: string[][] = [];
          for (let i = 0; i < uncachedAuctionIds.length; i += CHUNK_SIZE) {
            chunks.push(uncachedAuctionIds.slice(i, i + CHUNK_SIZE));
          }

          await Promise.all(
            chunks.map(async (chunk) => {
              try {
                const chunkQuery = query(
                  collection(db, 'arena_auctions'),
                  where(documentId(), 'in', chunk)
                );
                const chunkSnap = await getDocs(chunkQuery);
                chunkSnap.docs.forEach((d) => {
                  const data = d.data();
                  auctionsMap.set(d.id, data);
                  auctionCacheRef.current.set(d.id, data);
                  try {
                    const auctionItem = ArenaService.mapDocToAuction(d);
                    ArenaService.cacheAuction(auctionItem);
                  } catch {
                    // Non-blocking mapping safeguard
                  }
                });
              } catch (chunkErr) {
                console.warn("Error fetching chunk of auctions for user bids:", chunkErr);
              }
            })
          );
        }

        const validBids = rawBidsList.map(rawBid => {
          const data = auctionsMap.get(rawBid.auctionId);
          if (!data || data.isNegotiationOnly) return null;

          const images = data.images || [];
          const title = data.title || 'Unknown Auction';
          const statusVal = data.status || 'active';
          const status: 'active' | 'concluded' = statusVal === 'active' ? 'active' : 'concluded';
          const endVal = parseSafeDate(data.endTime);
          const fullAuctionItem: AuctionItem = {
            id: rawBid.auctionId,
            title,
            description: data.description || '',
            startingPrice: data.startingPrice || 0,
            currentBid: data.currentBid || rawBid.amount,
            currency: data.currency || 'USD',
            currencySymbol: data.currencySymbol || data.currency || '$',
            highestBidderId: data.highestBidderId,
            highestBidderName: data.highestBidderName,
            images,
            sellerId: data.sellerId || '',
            sellerName: data.sellerName || 'Anonymous Fighter',
            startTime: parseSafeDate(data.startTime),
            endTime: endVal,
            status: (data.status || 'active') as any,
            category: data.category || 'General',
            bidsCount: data.bidsCount || 1,
            watchersCount: data.watchersCount || 0,
            viewsCount: data.viewsCount || 0,
            minIncrement: data.minIncrement || 10,
            extensionsCount: data.extensionsCount || 0,
            maxExtensions: data.maxExtensions || 5,
            country: data.country,
            city: data.city,
          };

          return {
            bidId: rawBid.bidId,
            auctionId: rawBid.auctionId,
            auctionTitle: title,
            auctionImage: images[0] || '',
            userBidAmount: rawBid.amount,
            latestTimestamp: rawBid.timestamp,
            status,
            endTime: endVal,
            currentBid: data.currentBid || rawBid.amount,
            startingPrice: data.startingPrice,
            currency: data.currency,
            currencySymbol: data.currencySymbol,
            highestBidderId: data.highestBidderId,
            highestBidderName: data.highestBidderName,
            category: data.category,
            bidsCount: data.bidsCount,
            auction: fullAuctionItem
          };
        }).filter((b) => b !== null) as any[];

        validBids.sort((a, b) => b.latestTimestamp.getTime() - a.latestTimestamp.getTime());
        setMyBids(validBids);
        setMyBidsLoading(false);
      } catch (err: any) {
        console.error("Error updates on my bids: ", err);
        const errMsg = String(err).toLowerCase();
        if (errMsg.includes('quota') || errMsg.includes('exhausted') || errMsg.includes('limit exceeded')) {
          setQuotaExceeded(true);
        }
        setMyBidsLoading(false);
      }
    }, (err) => {
      console.error("Subscription error on my bids: ", err);
      const errMsg = String(err).toLowerCase();
      if (errMsg.includes('quota') || errMsg.includes('exhausted') || errMsg.includes('limit exceeded')) {
        setQuotaExceeded(true);
      }
      setMyBidsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  // Global user owned auctions subscription
  const [myAuctions, setMyAuctions] = useState<AuctionItem[]>([]);
  const [myAuctionsLoading, setMyAuctionsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setMyAuctions([]);
      setMyAuctionsLoading(false);
      return;
    }

    setMyAuctionsLoading(true);

    const q = query(
      collection(db, 'arena_auctions'),
      where('sellerId', '==', user.uid),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const items = snapshot.docs
          .map(docSnap => ArenaService.mapDocToAuction(docSnap))
          .filter(item => !item.isNegotiationOnly);

        items.sort((a, b) => {
          const dateA = parseSafeDate(a.startTime || a.createdAt);
          const dateB = parseSafeDate(b.startTime || b.createdAt);
          const timeA = dateA && !isNaN(dateA.getTime()) ? dateA.getTime() : 0;
          const timeB = dateB && !isNaN(dateB.getTime()) ? dateB.getTime() : 0;
          return timeB - timeA;
        });

        setMyAuctions(items);
        setMyAuctionsLoading(false);
      } catch (err: any) {
        console.error("Error updates on my auctions: ", err);
        const errMsg = String(err).toLowerCase();
        if (errMsg.includes('quota') || errMsg.includes('exhausted') || errMsg.includes('limit exceeded')) {
          setQuotaExceeded(true);
        }
        setMyAuctionsLoading(false);
      }
    }, (err) => {
      console.error("Subscription error on my auctions: ", err);
      const errMsg = String(err).toLowerCase();
      if (errMsg.includes('quota') || errMsg.includes('exhausted') || errMsg.includes('limit exceeded')) {
        setQuotaExceeded(true);
      }
      setMyAuctionsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  // Bidding states and controls
  const [customBid, setCustomBid] = useState<string>('');
  const [biddingLoading, setBiddingLoading] = useState(false);
  const [biddingError, setBiddingError] = useState<string | null>(null);
  const [biddingSuccess, setBiddingSuccess] = useState(false);
  const [showConfirmBidModal, setShowConfirmBidModal] = useState(false);
  const [pendingBidAmount, setPendingBidAmount] = useState<number | null>(null);
  const isSubmittingRef = useRef<boolean>(false);

  const minIncrement = spotlightAuction?.minIncrement || Math.max(100, Math.floor((spotlightAuction?.startingPrice || 0) * 0.01));
  const minNextBid = (liveSpotlight?.currentBid ?? spotlightAuction?.currentBid ?? 0) + minIncrement;
  const isSpotlightHighestBidder = Boolean(spotlightBids && spotlightBids.length > 0 && user && spotlightBids[0].userId === user.uid);

  const triggerPlaceBid = (directAmount?: number) => {
    if (isSubmittingRef.current || biddingLoading) return;

    if (isSpotlightUserBanned) {
      setBiddingError(
        spotlightBanStatus.isBanned
          ? `Your account has been banned by administration (${spotlightBanStatus.formattedText}). Bidding is prohibited.`
          : "Your account is restricted from submitting bids by administration."
      );
      return;
    }

    if (!user) {
      setBiddingError("Please log in to participate in battle bids.");
      return;
    }
    if (isSpotlightPaused) {
      setBiddingError("This listed item is currently paused by the seller. Bids cannot be placed until the seller resumes this listing.");
      return;
    }
    if (isSpotlightOwner) {
      setBiddingError("As the seller of this auction, you cannot submit bids against your own listed item.");
      return;
    }
    if (isSpotlightConcluded) {
      setBiddingError("This combat has been concluded. Bids can no longer be placed.");
      return;
    }
    if (isSpotlightHighestBidder) {
      setBiddingError("You are already the highest bidder on this combat item.");
      return;
    }
    if ((creditsBalance ?? 0) < 1) {
      setBiddingError(isDemoMode ? "Insufficient DEMO credits. You need at least 1 DEMO credit to place a bid." : "Insufficient credits. You need at least 1 credit to place a bid.");
      return;
    }

    // Amount must be explicitly selected or entered
    const bidVal = typeof directAmount === 'number' && !isNaN(directAmount)
      ? directAmount
      : (customBid && customBid.trim() !== '' && !isNaN(Number(customBid)) ? Number(customBid) : null);

    if (bidVal === null) {
      setBiddingError("Please select an amount from the quick options or enter your desired bid amount.");
      return;
    }

    if (bidVal < minNextBid) {
      setBiddingError(`Minimum next bid must be ${formatPrice(minNextBid, spotlightAuction?.currencySymbol || spotlightAuction?.currency)}`);
      return;
    }

    setBiddingError(null);
    setPendingBidAmount(bidVal);
    setShowConfirmBidModal(true);
  };

  const handleExecuteBid = async () => {
    if (isSubmittingRef.current || biddingLoading) return;
    const bidVal = pendingBidAmount;
    if (!bidVal) return;

    isSubmittingRef.current = true;
    setBiddingLoading(true);
    setBiddingError(null);
    setBiddingSuccess(false);

    try {
      await spotlightPlaceBid(bidVal);
      setBiddingSuccess(true);
      setCustomBid('');
      setPendingBidAmount(null);
      await refreshCredits();
      setTimeout(() => setBiddingSuccess(false), 3000);
    } catch (err: any) {
      setBiddingError(err.message || 'Failed to register bid.');
    } finally {
      setBiddingLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // Build price increased chart data
  const chartData = spotlightAuction ? [
    { timestamp: parseSafeDate(spotlightAuction.startTime) || new Date(), price: spotlightAuction.startingPrice },
    ...[...spotlightBids].reverse().map(b => ({
      timestamp: b.timestamp ? parseSafeDate(b.timestamp) : new Date(),
      price: b.amount
    }))
  ] : [];

  return (
    <ArenaLayout>
      <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto px-2 py-2 md:px-3 md:py-4">
        
        {/* Database Quota Warning Banner */}
        {quotaExceeded && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-3xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg shadow-amber-500/5">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  Tactical Database Quota Exceeded (Daily Free Tier)
                </h4>
                <p className="text-[11px] text-stone-300 font-semibold mt-0.5 leading-relaxed uppercase">
                  The cloud database has reached its daily read limits. We have automatically activated high-fidelity local assets & backup listings so you can continue testing all features!
                </p>
              </div>
            </div>
            <button
              onClick={() => setQuotaExceeded(false)}
              className="w-full md:w-auto px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 text-center"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Back button and enter private negotiation hub in a single row on the top */}
        <div className="flex flex-row items-center gap-3 w-full">
          <button 
            type="button"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/');
              }
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-3 bg-stone-950 hover:bg-stone-850 border-t-2 border-l border-r border-stone-700/80 border-b-0 rounded-2xl text-xs font-black uppercase text-stone-400 hover:text-white transition-all shadow-[0_4px_0_0_#0c0a09,0_8px_16px_rgba(0,0,0,0.5)] active:translate-y-0.5 active:shadow-[0_1px_0_0_#000000] shrink-0 min-h-[48px] sm:min-h-[52px] cursor-pointer"
            id="arena-back-btn"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <ThreeDButton
            id="enter-private-negotiations-btn"
            to="/negotiations"
            label="Enter Private Negotiations"
            icon={MessageSquare}
            variant="dark"
            size="md"
            className="flex-1"
          />
        </div>

        {/* 2. Under that post auctions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          <ThreeDButton
            id="arena-post-bids-btn"
            to="/battle-bids/create"
            label="Post Auctions"
            icon={Plus}
            variant="amber"
            size="md"
            className="w-full"
          />
          
          <div className="w-full flex items-center justify-between gap-2 p-2 bg-stone-850 rounded-2xl border-t border-stone-700 border-b-2 border-b-stone-950 shadow-[0_4px_0_0_#0c0a09] overflow-hidden min-h-[48px] sm:min-h-[52px]">
            <div className="flex items-center gap-2 sm:gap-3 overflow-hidden min-w-0">
              {userProfile?.photoURL ? (
                <img src={userProfile.photoURL} alt={userProfile.name || 'User'} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover shrink-0 border border-stone-700" />
              ) : (
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-stone-700 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-stone-400" />
                </div>
              )}
              <div className="flex items-center gap-2 sm:gap-3 overflow-hidden min-w-0">
                <span className="text-xs sm:text-sm font-black text-white truncate shrink-0 max-w-[80px] sm:max-w-[120px]">{userProfile?.name || userProfile?.displayName || userProfile?.username || 'Guest Pilot'}</span>
                
                {/* Badges in the same row */}
                <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto scrollbar-none">
                  {/* KYC Status */}
                  {userProfile?.isKycVerified ? (
                    <span className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      KYC Approved
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0">
                      <ShieldAlert className="w-2.5 h-2.5" />
                      KYC Unverified
                    </span>
                  )}
                  {/* Premium Seller */}
                  {userProfile?.isPremiumSeller && (
                    <span className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
                      <Star className="w-2.5 h-2.5" />
                      Premium
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {user && !user.isAnonymous && <CreditBalanceBadge variant="3d" />}
              <button 
                onClick={() => user?.uid ? navigate(`/battle-bids/profile/${userProfile?.username || user.uid}`) : navigate('/profile')}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 sm:py-2 bg-stone-700 hover:bg-stone-600 text-white rounded-xl text-[10px] sm:text-xs font-black uppercase transition-all"
              >
                View Profile
              </button>
            </div>
          </div>
        </div>

        {/* Account Ban Notice & Appeal Flow */}
        <AccountBannedBanner variant="dark" className="w-full" />

        {/* 2. Active Spotlight Auction Section (Live real-time panels) */}
        {spotlightAuction ? (
          <div className="space-y-6 bg-stone-900/40 p-4 md:p-8 border border-stone-850 rounded-[2rem] md:rounded-[2.5rem]" id="arena-spotlight-section">
            
            {/* Feedback Alert Banner */}
            {goLiveFeedback && (
              <div 
                className={`p-4 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 ${
                  goLiveFeedback.type === 'success' 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {goLiveFeedback.type === 'success' ? (
                    <Sparkles className="w-5 h-5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                  )}
                  <p className="text-xs sm:text-sm font-bold">{goLiveFeedback.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGoLiveFeedback(null)}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 3. Under that Active Combat Spotlight */}
            <div className="flex items-center justify-between gap-4 px-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-500 animate-pulse" />
                <span className="text-xs font-black text-rose-500 uppercase tracking-widest block">Active Combat Spotlight</span>
              </div>
            </div>

            {/* 5. Under that the profile of users who posted the items */}
            <ArenaUserProfileCard 
              profile={spotlightSellerProfile} 
              fallbackUserId={spotlightAuction?.sellerId} 
            />

            {/* 6. Under that images of listed items */}
            <div className="rounded-[2.5rem] overflow-hidden border border-white/5 bg-stone-955">
              <ArenaGallery images={spotlightAuction.images} title={spotlightAuction.title} />
            </div>

            {/* Exact and Real Date & Time Posted beneath images and before Title & Description */}
            {(spotlightAuction.createdAt || spotlightAuction.startTime) && (
              <div className="px-1 text-left flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-900/90 border border-stone-800 rounded-lg text-stone-400">
                  <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-[10px] sm:text-xs font-mono font-bold tracking-wide">
                    Posted: <span className="text-stone-200">{formatPostDateTime(spotlightAuction.createdAt || spotlightAuction.startTime)}</span>
                  </span>
                </div>
              </div>
            )}

            {/* Title of the listed items displayed beneath images */}
            <div className="px-1 text-left">
              <h2 className="text-lg sm:text-2xl md:text-3xl font-black uppercase tracking-tight text-white leading-tight">
                {spotlightAuction.title}
              </h2>
            </div>

            {/* Description of listed items displayed beneath title and before tactical actions */}
            {spotlightAuction.description && (
              <div className="px-1 text-left space-y-1.5">
                <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Description</h3>
                <p className="text-xs text-stone-300 font-medium leading-relaxed bg-stone-950/40 p-4 border border-stone-850 rounded-2xl whitespace-pre-line">
                  {spotlightAuction.description}
                </p>
              </div>
            )}

            {/* 7. Public Tactical Actions Bar */}
            <div className="w-full">
              <ArenaTacticalActions
                item={liveSpotlight ? { ...spotlightAuction, ...liveSpotlight } : spotlightAuction}
              />
            </div>

            {/* 8. Under that time remaining for auction (Single-Row representation) */}
            <div className="space-y-2 text-left">
              {(liveSpotlight?.status || spotlightAuction.status) === 'upcoming' ? (
                <UpcomingAuctionNotice variant="post" />
              ) : (
                <ArenaLiveCountdown timeRemaining={spotlightTimeRemaining} variant="single-row" />
              )}
            </div>

            {/* 9. Under that Price Increment Over Time */}
            <div className="space-y-2 text-left">
              <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest pl-1">Price Increment Over Time</h3>
              <div className="bg-stone-955 p-6 rounded-2xl border border-stone-850">
                <BidHistoryChart 
                  data={chartData} 
                  reservePrice={spotlightAuction.reservePrice} 
                  currency={spotlightAuction.currencySymbol || spotlightAuction.currency}
                  height={220} 
                />
              </div>
            </div>

            {/* 10. Under that current bid */}
            <div className="p-6 bg-stone-900 border border-stone-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
              <div>
                <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest">Current Bid</h3>
                <p className="text-3xl font-black text-amber-500 mt-2">
                  {formatPrice(liveSpotlight?.currentBid ?? spotlightAuction.currentBid, spotlightAuction.currencySymbol || spotlightAuction.currency)}
                </p>
                <p className="text-[10px] font-bold text-stone-500 mt-1">
                  Starting Price: {formatPrice(spotlightAuction.startingPrice, spotlightAuction.currencySymbol || spotlightAuction.currency)}
                </p>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-1.5">
                {spotlightAuction.reservePrice && (
                  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded border ${
                    liveSpotlight?.reserveMet 
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                      : 'bg-stone-800 text-stone-400 border-stone-700'
                  }`}>
                    {liveSpotlight?.reserveMet ? 'Reserve Met' : 'Reserve Not Met'}
                  </span>
                )}
                <span className="text-[10px] text-stone-400 font-bold">
                  Min Increment: {formatPrice(minIncrement, spotlightAuction.currencySymbol || spotlightAuction.currency)}
                </span>
              </div>
            </div>

            {/* 11. Bidding engine panel containing entered amounts, strategic bids, KYC verification, place bid */}
            <div id="spotlight-bidding-section" className="bg-stone-955 border border-stone-850 rounded-2xl p-6 space-y-4 shadow-inner text-left animate-in fade-in">
              {(liveSpotlight?.status || spotlightAuction.status) === 'upcoming' ? (
                <UpcomingAuctionNotice
                  variant="auction"
                  isOwner={isSpotlightOwner}
                  onGoLive={handleOpenGoLiveModal}
                  goLiveLoading={userActionLoading}
                  startingPrice={spotlightAuction.startingPrice}
                  currency={spotlightAuction.currency}
                  currencySymbol={spotlightAuction.currencySymbol}
                />
              ) : isSpotlightConcluded ? (
                <div className="py-8 text-center space-y-2">
                  <Gavel className="w-10 h-10 text-stone-700 mx-auto mb-2" />
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">Combat Concluded</h4>
                  <p className="text-stone-400 text-xs">No further bids can be accepted for this combat.</p>
                </div>
              ) : isSpotlightOwner ? (
                <div className="py-6 px-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-center space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
                    <Shield className="w-4 h-4 text-amber-500" />
                    <span>Your Listed Auction Asset</span>
                  </div>
                  <p className="text-xs text-stone-300 max-w-md mx-auto leading-relaxed">
                    As the seller who posted this item under auction, you cannot submit bids against your own listed item. Other eligible combatants can submit bids.
                  </p>
                </div>
              ) : (
                <>
                  {/* Available Credits Card */}
                  {user && (
                    <div className={`p-3.5 bg-stone-900 border ${isDemoMode ? 'border-amber-500/30' : 'border-stone-850'} rounded-xl space-y-2`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="text-xs font-bold text-stone-300 uppercase tracking-widest">
                            {isDemoMode ? 'Available DEMO Credits:' : 'Available Credits:'}
                          </span>
                          <span className="text-sm font-mono font-black text-amber-400">
                            {creditsBalance ?? 0}
                          </span>
                          {isDemoMode && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              DEMO MODE
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={openPurchase}
                          className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                        >
                          {isDemoMode ? <Sparkles className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                          {isDemoMode ? 'Demo Details' : 'Get Credits'}
                        </button>
                      </div>

                      <div className="text-[10px] text-stone-400 font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>{isDemoMode ? '1 DEMO Credit will be used for this bid.' : '1 Credit will be used for this bid.'}</span>
                      </div>

                      {(creditsBalance ?? 0) < 1 && (
                        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs font-bold text-rose-400 flex items-center justify-between gap-2">
                          <span>{isDemoMode ? 'Insufficient DEMO credits. You need at least 1 DEMO credit to place a bid.' : 'Insufficient credits. You need at least 1 credit to place a bid.'}</span>
                          <button
                            type="button"
                            onClick={openPurchase}
                            className="px-2 py-0.5 bg-rose-500 hover:bg-rose-600 text-white rounded text-[9px] font-black uppercase tracking-wider shrink-0 transition-all cursor-pointer"
                          >
                            {isDemoMode ? 'Demo Info' : 'Acquire'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Strategic Bids Remaining */}
                  <div className="flex flex-col gap-1">
                    {user && spotlightRemainingBids !== undefined ? (
                      <div className="flex items-center justify-between p-3.5 bg-stone-900 border border-stone-850 rounded-xl">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Remaining Strategic Bids</span>
                        <span className="text-xs font-mono font-black text-amber-500">{spotlightRemainingBids} / 10</span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-stone-500 font-bold uppercase pl-1">Log in to view strategic bids</p>
                    )}
                    <p className="text-[9px] text-stone-500 font-bold uppercase pl-1">Max 10 bids permitted per listed item</p>
                  </div>

                  {/* Area to enter bid amount */}

                  {/* Area to enter custom amount & Quick presets */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-black text-stone-300 uppercase tracking-widest flex items-center gap-1.5">
                        <Coins className="w-3.5 h-3.5 text-amber-400" />
                        <span>Select or Enter Bid Amount</span>
                      </label>
                      {customBid && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomBid('');
                            setBiddingError(null);
                          }}
                          className="text-[10px] font-bold text-stone-400 hover:text-rose-400 uppercase tracking-wider cursor-pointer transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Quick increment chips for mobile & desktop */}
                    {user && !isSpotlightHighestBidder && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                          Quick Amount Options:
                        </p>
                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 pt-0.5">
                          {[
                            { label: 'Min Bid', amount: minNextBid, tag: 'MIN' },
                            { label: `+${formatPrice(minIncrement, spotlightAuction.currencySymbol || spotlightAuction.currency)}`, amount: minNextBid + minIncrement, tag: '+1x' },
                            { label: `+${formatPrice(minIncrement * 2, spotlightAuction.currencySymbol || spotlightAuction.currency)}`, amount: minNextBid + (minIncrement * 2), tag: '+2x' },
                            { label: `+${formatPrice(minIncrement * 5, spotlightAuction.currencySymbol || spotlightAuction.currency)}`, amount: minNextBid + (minIncrement * 5), tag: '+5x' },
                            { label: `+${formatPrice(minIncrement * 10, spotlightAuction.currencySymbol || spotlightAuction.currency)}`, amount: minNextBid + (minIncrement * 10), tag: '+10x' },
                          ].map((qb) => {
                            const isSelected = customBid === qb.amount.toString() || Number(customBid) === qb.amount;
                            return (
                              <button
                                key={qb.amount}
                                type="button"
                                onClick={() => {
                                  setCustomBid(qb.amount.toString());
                                  setBiddingError(null);
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer border flex items-center gap-1.5 ${
                                  isSelected
                                    ? 'bg-amber-500 text-stone-955 border-amber-400 shadow-md shadow-amber-500/20 scale-102 ring-2 ring-amber-400/40'
                                    : 'bg-stone-900 hover:bg-stone-850 text-stone-300 hover:text-white border-stone-800 hover:border-amber-500/40'
                                }`}
                              >
                                <span>{formatPrice(qb.amount, spotlightAuction.currencySymbol || spotlightAuction.currency)}</span>
                                {qb.tag && (
                                  <span className={`text-[9px] px-1 py-0.2 rounded font-black ${
                                    isSelected ? 'bg-stone-955/20 text-stone-955' : 'bg-stone-800 text-amber-400'
                                  }`}>
                                    {qb.tag}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Manual input */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                          Or Enter Custom Bid:
                        </span>
                        <span className="text-[10px] font-mono text-stone-400">
                          Min: {formatPrice(minNextBid, spotlightAuction.currencySymbol || spotlightAuction.currency)}
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          value={customBid}
                          onChange={(e) => {
                            setCustomBid(e.target.value);
                            setBiddingError(null);
                          }}
                          disabled={biddingLoading || isSpotlightPaused || isSpotlightHighestBidder || !user || spotlightTimeRemaining?.isEnded || (creditsBalance ?? 0) < 1}
                          placeholder={isSpotlightPaused ? 'Listing paused by seller' : user ? (isSpotlightHighestBidder ? 'You are highest bidder' : `Enter amount (Min ${formatPrice(minNextBid, spotlightAuction.currencySymbol || spotlightAuction.currency)})`) : 'Sign in to participate'}
                          className={`w-full bg-stone-950 border rounded-xl p-4 pl-12 pr-10 text-sm font-mono font-black text-white focus:border-amber-500 outline-none transition-all disabled:opacity-50 ${
                            customBid && Number(customBid) < minNextBid 
                              ? 'border-rose-500/60 focus:border-rose-500' 
                              : customBid 
                                ? 'border-amber-500/70' 
                                : 'border-stone-800'
                          }`}
                        />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400 font-black text-sm">
                          {getCurrencyByCode(spotlightAuction.currencySymbol || spotlightAuction.currency || 'USD').symbol}
                        </span>
                        {customBid && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomBid('');
                              setBiddingError(null);
                            }}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 cursor-pointer"
                            title="Clear amount"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Selected Amount Summary Pill */}
                  {customBid && !isNaN(Number(customBid)) && Number(customBid) >= minNextBid && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[11px] font-black text-stone-300 uppercase tracking-wider">Selected Strike Amount:</span>
                      </div>
                      <span className="text-xs font-mono font-black text-amber-400">
                        {formatPrice(Number(customBid), spotlightAuction.currencySymbol || spotlightAuction.currency)}
                      </span>
                    </div>
                  )}

                  {isSpotlightUserBanned && (
                    <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-xs text-rose-400 font-bold leading-relaxed flex items-start gap-2.5">
                      <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span>Bidding Restricted: Account Banned</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            {spotlightBanStatus.formattedText}
                          </span>
                        </div>
                        <p className="text-[11px] font-normal text-stone-300 mt-1">
                          Bidding is prohibited for banned accounts until the administrative ban expires or is lifted.
                        </p>
                      </div>
                    </div>
                  )}

                  {biddingError && (
                    <div className="text-xs font-bold text-rose-500 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                      {biddingError}
                    </div>
                  )}

                  {biddingSuccess && (
                    <div className="text-xs font-bold text-emerald-500 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                      Your bid was successfully registered in the Arena!
                    </div>
                  )}

                  {isSpotlightHighestBidder && (
                    <div className="text-xs font-bold text-amber-400 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-center">
                      🏆 You currently hold the highest bid on this combat item.
                    </div>
                  )}

                  {/* Place Your Bid */}
                  <ThreeDButton
                    id="arena-spotlight-place-bid-btn"
                    onClick={() => triggerPlaceBid()}
                    disabled={
                      isSpotlightUserBanned ||
                      isSpotlightHighestBidder || 
                      isSpotlightPaused ||
                      !user || 
                      spotlightTimeRemaining?.isEnded || 
                      biddingLoading || 
                      (creditsBalance ?? 0) < 1 || 
                      !customBid || 
                      customBid.trim() === '' || 
                      isNaN(Number(customBid)) || 
                      Number(customBid) < minNextBid
                    }
                    variant="amber"
                    size="md"
                    noShadow={true}
                    icon={biddingLoading ? Loader2 : isSpotlightUserBanned ? ShieldAlert : isSpotlightPaused ? Pause : Gavel}
                    label={
                      biddingLoading 
                        ? 'Placing Bid...' 
                        : isSpotlightUserBanned
                          ? 'Bidding Restricted (Banned)'
                          : isSpotlightPaused
                            ? 'Listing Paused by Seller'
                            : !user 
                              ? 'Sign In to Place Bid'
                              : isSpotlightHighestBidder 
                                ? 'You are highest bidder' 
                                : (!customBid || customBid.trim() === '')
                                  ? 'Select or Enter Bid Amount'
                                  : (Number(customBid) < minNextBid)
                                    ? `Min Bid is ${formatPrice(minNextBid, spotlightAuction.currencySymbol || spotlightAuction.currency)}`
                                    : `Place Bid (${formatPrice(Number(customBid), spotlightAuction.currencySymbol || spotlightAuction.currency)})`
                    }
                  />

                  {!user && (
                    <p className="text-[10px] font-bold text-amber-500 text-center uppercase tracking-wider">
                      ⓘ You must be logged in to place a bid.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* 12. All Bids Placed by Users Section */}
            <ArenaBidsTabsSection 
              bids={spotlightBids}
              auction={spotlightAuction}
              user={user}
            />

          </div>
        ) : loading ? (
          <div className="space-y-6 bg-stone-900/40 p-4 md:p-8 border border-stone-850 rounded-[2rem] md:rounded-[2.5rem] animate-pulse" id="arena-spotlight-section">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-stone-800" />
              <div className="h-4 w-44 bg-stone-800 rounded" />
            </div>
            <div className="p-5 bg-stone-950 border border-stone-850 rounded-[2rem] space-y-4 max-w-md">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-stone-850 shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-32 bg-stone-850 rounded" />
                  <div className="h-3 w-24 bg-stone-850 rounded" />
                  <div className="h-3 w-36 bg-stone-850 rounded" />
                </div>
              </div>
            </div>
            <div className="aspect-[16/9] sm:aspect-[21/9] w-full rounded-[2.5rem] bg-stone-850" />
            <div className="h-7 w-2/3 bg-stone-850 rounded-xl" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-16 bg-stone-950 border border-stone-850 rounded-xl" />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 bg-stone-900/40 p-6 md:p-10 border border-stone-850 rounded-[2rem] md:rounded-[2.5rem] text-center" id="arena-spotlight-section">
            <div className="w-16 h-16 bg-stone-950/60 rounded-2xl border border-stone-800 flex items-center justify-center mx-auto text-amber-500/80 shadow-inner">
              <Gavel className="w-8 h-8" />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">
                No live items available
              </h3>
              <p className="text-stone-400 text-xs sm:text-sm font-medium leading-relaxed">
                There are currently no live Battle Bids available in <span className="text-amber-400 font-bold">{selectedCurrency?.code || 'Selected Currency'}</span>. New live items may appear here when auctions become active.
              </p>
            </div>
          </div>
        )}

        {/* My Bids Swipeable Section (Beneath All Bids and before Upcoming Auctions) */}
        <ArenaMyBidsSection 
          bids={myBids}
          loading={myBidsLoading}
          user={user}
          onSelectAuction={selectSpotlight}
        />

        {/* My Auctions Swipeable Section (Beneath My Bids and before Upcoming Auctions) */}
        <ArenaMyAuctionsSection 
          auctions={myAuctions}
          loading={myAuctionsLoading}
          user={user}
          onSelectAuction={selectSpotlight}
        />

        {/* Upcoming Auctions Section */}
        <div className="space-y-4 pt-4 border-t border-stone-850">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
              <Timer className="w-4 h-4 text-blue-400 animate-pulse" />
              Upcoming Auctions
            </h3>
            <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 font-bold uppercase tracking-wider">
              Scheduled Bidding
            </span>
          </div>

          {upcomingLoading ? (
            <div className="flex overflow-x-auto gap-6 pb-6 pt-2 scrollbar-none animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-[280px] sm:w-[320px] h-80 bg-stone-900 border border-stone-850 rounded-2xl shrink-0" />
              ))}
            </div>
          ) : activeUpcomingAuctions.length > 0 ? (
            <div className="flex overflow-x-auto gap-6 pb-6 pt-2 scrollbar-none snap-x snap-mandatory scroll-smooth" id="upcoming-arena-listings">
              {activeUpcomingAuctions.map((item) => (
                <div 
                  key={item.id} 
                  className="w-[280px] sm:w-[320px] shrink-0 snap-start"
                >
                  <ArenaCard 
                    item={item} 
                    hideActions={true}
                    onBidClick={selectSpotlight}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center bg-stone-950/20 border border-stone-900 rounded-2xl">
              <p className="text-stone-500 text-xs font-black uppercase tracking-widest">
                No upcoming combat items scheduled currently
              </p>
            </div>
          )}
        </div>

        {/* 3. Search and Filters Section */}
        <div className="space-y-6 pt-4 border-t border-stone-850">
          <div className="px-1">
            <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest">Search and Filters</h3>
          </div>
          <ArenaDiscovery 
            onSearch={search}
            onClear={clearFilters}
            onSort={setSortBy}
            initialSort={sortBy}
            initialFilters={filters}
            isLoading={loading}
          />
        </div>

        {/* 4. Listed Items Section (Available Items for Auction slider) */}
        <div className="space-y-4 pt-4 border-t border-stone-850">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-rose-500" />
              Auction Marketplace
            </h3>
            <button
              onClick={() => navigate({ pathname: '/battle-bids/explore', search: location.search })}
              className="text-[10px] sm:text-xs font-black text-stone-400 hover:text-white uppercase tracking-widest flex items-center gap-1 transition-colors"
              id="arena-explore-all-btn"
            >
              Explore All
              <ChevronLeft className="w-3 h-3 rotate-180" />
            </button>
          </div>
          
          {gridItems.length > 0 ? (
            <div className="flex overflow-x-auto gap-6 pb-6 pt-2 scrollbar-none snap-x snap-mandatory scroll-smooth" id="swipeable-arena-listings">
              {gridItems.map((item, index) => (
                <div 
                  key={item.id} 
                  ref={index === gridItems.length - 1 ? lastItemRef : null}
                  className="w-[280px] sm:w-[320px] shrink-0 snap-start"
                >
                  <ArenaCard 
                    item={item} 
                    hideActions={true}
                    hideAdminActions={true}
                    onBidClick={(clickedItem) => {
                      if (clickedItem.isNegotiationOnly) {
                        navigate(`/negotiations/timeline/${clickedItem.id}`);
                      } else {
                        navigate(`/battle-bids/timeline/${clickedItem.id}`);
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          ) : loading ? (
            <div className="flex overflow-x-auto gap-6 pb-6 pt-2 scrollbar-none animate-pulse">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-[280px] sm:w-[320px] h-80 bg-stone-900 border border-stone-850 rounded-2xl shrink-0" />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center space-y-4 max-w-xl mx-auto">
              <div className="w-20 h-20 bg-stone-950/20 rounded-[2rem] flex items-center justify-center text-stone-700 mx-auto border border-white/5">
                <Database className="w-8 h-8" />
              </div>
              <p className="text-stone-500 text-xs font-black uppercase tracking-widest">
                No Assets Found
              </p>
            </div>
          )}
        </div>

        {/* 4.5 Happening Now Section */}
        <div className="space-y-4 pt-4 border-t border-stone-850">
          <HappeningNow 
            listings={standardListings} 
            isHomePage={false} 
            isBattleBids={true} 
            onExploreClick={() => navigate({ pathname: '/battle-bids/explore', search: location.search })}
          />
        </div>

        {/* Confirmation Modal for Submitting Spotlight Bid */}
        <OfferConfirmationModal
          isOpen={showConfirmBidModal}
          onClose={() => {
            setShowConfirmBidModal(false);
            setPendingBidAmount(null);
          }}
          onConfirm={handleExecuteBid}
          amount={pendingBidAmount ?? undefined}
          currencySymbol={spotlightAuction?.currencySymbol || spotlightAuction?.currency || 'USD'}
          title="Are you sure?"
          message="Are you sure you want to place this bid immediately in the combat arena?"
          confirmText="Yes, Place Bid"
          cancelText="Cancel"
          icon={Gavel}
        />

        {/* Reusable Confirmation Modal for Launching Auction to Go Live */}
        <ArenaGoLiveModal
          isOpen={showGoLiveModal}
          onClose={() => setShowGoLiveModal(false)}
          onConfirm={handleExecuteGoLive}
          item={spotlightAuction}
          loading={userActionLoading}
        />

      </div>
    </ArenaLayout>
  );
};
