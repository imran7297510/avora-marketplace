import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArenaService } from '../../features/battle-bids/services/arenaService';
import { DiscoveryService } from '../../features/battle-bids/services/discoveryService';
import { AuctionItem, Bid, ModerationActionType } from '../../features/battle-bids/types';
import { parseSafeDate } from '../../features/battle-bids/utils/arena';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';
import { ArenaStatus } from '../../features/battle-bids/components/shared/ArenaStatus';
import { ArenaGallery } from '../../features/battle-bids/components/ArenaGallery';
import { ArenaUserProfileCard } from '../../features/battle-bids/components/shared/ArenaUserProfileCard';
import { useSellerProfile } from '../../features/battle-bids/hooks/useSellerProfile';
import { getFallbackSellerProfile } from '../../features/battle-bids/utils/fallbackProfile';
import { ProfileVerificationTick } from '../../features/battle-bids/components/shared/ProfileVerificationTick';
import { BidHistoryChart } from '../../features/battle-bids/components/BidHistoryChart';
import { formatPrice, getCurrencyByCode } from '../../lib/currencies';
import { formatDistanceToNow, format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { Top3Bidders } from '../../features/battle-bids/components/Top3Bidders';
import { ArenaTacticalActions } from '../../features/battle-bids/components/ArenaTacticalActions';
import { ReportButton } from '../../features/battle-bids/components/ReportButton';
import { WatchButton } from '../../features/battle-bids/components/WatchButton';
import { LiveViewsBreakdownModal } from '../../features/battle-bids/components/LiveViewsBreakdownModal';
import { ArenaGoLiveModal } from '../../features/battle-bids/components/ArenaGoLiveModal';
import { UpcomingAuctionNotice } from '../../features/battle-bids/components/shared/UpcomingAuctionNotice';
import { useAuctionEngine } from '../../features/battle-bids/hooks/useAuctionEngine';
import { ArenaLiveCountdown } from '../../features/battle-bids/components/ArenaLiveCountdown';
import { ArenaBiddingPanel } from '../../features/battle-bids/components/ArenaBiddingPanel';
import { BattleBidsWinnerBanner } from '../../features/battle-bids/components/BattleBidsWinnerBanner';
import { ModerationService } from '../../features/battle-bids/services/moderationService';
import { executeCentralBlock, executeCentralUnblock } from '../../services/userService';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gavel, 
  Clock, 
  TrendingUp, 
  ShieldCheck, 
  User, 
  Activity, 
  ArrowUpRight, 
  Eye, 
  Users, 
  Award, 
  Flame, 
  Loader2, 
  AlertCircle,
  MapPin,
  Sparkles,
  Trophy,
  Lock,
  ShieldAlert,
  CheckCircle2,
  Plus,
  Play,
  Pause,
  Trash2,
  AlertTriangle,
  UserX
} from 'lucide-react';

interface AllBidRowProps {
  bid: Bid;
  idx: number;
  totalBids: number;
  auctionCurrency?: string;
  isHighest: boolean;
  canReport?: boolean;
}

const AllBidRow: React.FC<AllBidRowProps> = ({
  bid,
  idx,
  totalBids,
  auctionCurrency,
  isHighest,
  canReport = true,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useSellerProfile(bid.userId);

  const isOwnBid = Boolean(user && (bid.userId === user.uid || (bid as any).bidderId === user.uid));
  const showReport = canReport && !isOwnBid;

  const photoURL = profile?.photoURL || bid.userPhotoURL;
  const displayName = profile?.displayName || profile?.username || bid.userName || 'anonymous_combatant';
  const username = profile?.username || bid.userId;

  // Currency lookup for symbol and code
  const currencyCodeOrSymbol = (bid as any).currencySymbol || (bid as any).currency || auctionCurrency;
  const curr = getCurrencyByCode(currencyCodeOrSymbol);

  // Time elapsed formatted in days, hours, and minutes
  const timeFormatted = useMemo(() => {
    const date = parseSafeDate(bid.timestamp);
    if (!date || isNaN(date.getTime())) return 'Pending';

    const diffMs = Math.max(0, Date.now() - date.getTime());
    const totalMins = Math.floor(diffMs / (1000 * 60));

    if (totalMins < 1) return 'Just now';

    const days = Math.floor(totalMins / (60 * 24));
    const hours = Math.floor((totalMins % (60 * 24)) / 60);
    const minutes = totalMins % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hr' : 'hrs'}`);
    if (minutes > 0 || (days === 0 && hours === 0)) {
      parts.push(`${minutes} ${minutes === 1 ? 'min' : 'mins'}`);
    }

    return `${parts.join(' ')} ago`;
  }, [bid.timestamp]);

  return (
    <div 
      className={`p-3 sm:p-4 rounded-2xl border transition-all space-y-2.5 sm:space-y-3 ${
        isHighest 
          ? 'bg-gradient-to-r from-amber-500/[0.08] via-stone-950/90 to-stone-955 border-amber-500/50 shadow-lg shadow-amber-500/[0.05]' 
          : 'bg-stone-955 border-stone-850 hover:border-stone-800'
      }`}
    >
      {/* Main Single Row: Rank + Avatar + Name & Verification on Left, Bid Amount on Right */}
      <div className="flex items-center justify-between gap-2.5 sm:gap-4 min-w-0">
        {/* Left Side: Rank, Avatar, Profile Name */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          {/* Rank Badge */}
          <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
            isHighest 
              ? 'bg-amber-500 text-stone-955 shadow-md shadow-amber-500/25 ring-2 ring-amber-400/30' 
              : 'bg-stone-900 text-stone-400 border border-stone-850'
          }`}>
            {isHighest ? <Trophy className="w-4 h-4" /> : `#${totalBids - idx}`}
          </div>

          {/* Profile Avatar */}
          <div 
            onClick={() => navigate(`/battle-bids/profile/${username}`)}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-stone-900 border flex items-center justify-center shrink-0 overflow-hidden cursor-pointer transition-colors ${
              isHighest ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-stone-800 hover:border-amber-500/50'
            }`}
          >
            {photoURL ? (
              <img src={photoURL} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="w-4.5 h-4.5 text-stone-500" />
            )}
          </div>

          {/* Profile Name & Status */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4 
                onClick={() => navigate(`/battle-bids/profile/${username}`)}
                className="text-xs sm:text-sm font-black text-white hover:text-amber-400 transition-colors cursor-pointer truncate leading-tight"
                title={displayName}
              >
                @{displayName}
              </h4>
              <ProfileVerificationTick profile={profile} size="sm" />
            </div>

            {isHighest ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider rounded">
                  Top Strike
                </span>
                {isOwnBid && (
                  <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider rounded">
                    You
                  </span>
                )}
              </div>
            ) : isOwnBid ? (
              <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-black uppercase tracking-wider rounded inline-block mt-0.5">
                Your Strike
              </span>
            ) : null}
          </div>
        </div>

        {/* Right Side: Submitted Bid Amount */}
        <div className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl border flex items-center gap-1.5 font-mono shrink-0 ${
          isHighest 
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
            : 'bg-stone-900/80 border-stone-850 text-stone-100'
        }`}>
          <span className="text-xs font-bold text-stone-400">
            {curr.symbol}
          </span>
          <span className={`text-sm sm:text-base font-black ${isHighest ? 'text-amber-400 font-extrabold' : 'text-stone-100'}`}>
            {(bid.amount || 0).toLocaleString()}
          </span>
          <span className="text-[9px] sm:text-[10px] font-black text-amber-500/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">
            {curr.code}
          </span>
        </div>
      </div>

      {/* Footer Row: Timestamp & Report action */}
      <div className="pt-2 border-t border-stone-900/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-stone-400 font-mono text-[10px] sm:text-xs">
          <Clock className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
          <span className="font-semibold">{timeFormatted}</span>
        </div>

        {showReport && (
          <ReportButton 
            targetId={bid.id || `bid-${idx}`}
            targetType="BID"
            targetTitle={`Bid of ${curr.symbol} ${(bid.amount || 0).toLocaleString()} ${curr.code} by @${displayName}`}
            targetOwnerId={bid.userId || (bid as any).bidderId}
            variant="ghost"
            showText={true}
            className="text-stone-400 hover:text-rose-400 hover:bg-rose-500/10 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-stone-850 hover:border-rose-500/30 transition-all cursor-pointer"
          />
        )}
      </div>
    </div>
  );
};

interface HighestBidderSpotlightProps {
  highestBid: Bid | null;
  auction: AuctionItem;
  totalBids: number;
  isOwner: boolean;
}

const HighestBidderSpotlight: React.FC<HighestBidderSpotlightProps> = ({
  highestBid,
  auction,
  totalBids,
  isOwner,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useSellerProfile(highestBid?.userId);
  const [justUpdated, setJustUpdated] = useState(false);
  const prevBidIdRef = useRef<string | null>(null);
  const prevAmountRef = useRef<number>(0);

  useEffect(() => {
    if (!highestBid) return;
    const bidKey = highestBid.id || `${highestBid.userId}-${highestBid.amount}`;
    if (prevBidIdRef.current && (prevBidIdRef.current !== bidKey || prevAmountRef.current !== highestBid.amount)) {
      setJustUpdated(true);
      const timer = setTimeout(() => setJustUpdated(false), 4500);
      return () => clearTimeout(timer);
    }
    prevBidIdRef.current = bidKey;
    prevAmountRef.current = highestBid.amount || 0;
  }, [highestBid?.id, highestBid?.amount, highestBid?.userId]);

  const isUserLeading = Boolean(
    user && highestBid && (highestBid.userId === user.uid || (highestBid as any).bidderId === user.uid)
  );

  const photoURL = profile?.photoURL || highestBid?.userPhotoURL;
  const displayName = profile?.displayName || profile?.username || highestBid?.userName || 'anonymous_combatant';
  const username = profile?.username || highestBid?.userId;

  const currencyCodeOrSymbol = (highestBid as any)?.currencySymbol || (highestBid as any)?.currency || auction.currencySymbol || auction.currency;
  const curr = getCurrencyByCode(currencyCodeOrSymbol);

  const timeFormatted = useMemo(() => {
    if (!highestBid?.timestamp) return null;
    const date = parseSafeDate(highestBid.timestamp);
    if (!date || isNaN(date.getTime())) return null;
    const diffMs = Math.max(0, Date.now() - date.getTime());
    const totalMins = Math.floor(diffMs / (1000 * 60));
    if (totalMins < 1) return 'Just now';
    const days = Math.floor(totalMins / (60 * 24));
    const hours = Math.floor((totalMins % (60 * 24)) / 60);
    const minutes = totalMins % 60;
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || (days === 0 && hours === 0)) parts.push(`${minutes}m`);
    return `${parts.join(' ')} ago`;
  }, [highestBid?.timestamp]);

  if (!highestBid) {
    return (
      <div className="bg-gradient-to-r from-stone-955 via-stone-900 to-stone-955 border border-stone-850 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5 text-left w-full sm:w-auto">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                Combat Standing
              </span>
              <span className="px-2 py-0.5 rounded-md bg-stone-900 border border-stone-800 text-stone-400 text-[9px] font-black uppercase">
                Awaiting First Strike
              </span>
            </div>
            <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-tight mt-0.5">
              No Bids Logged Yet
            </h4>
            <p className="text-[11px] text-stone-400 mt-0.5">
              Starting base at <span className="text-amber-400 font-bold font-mono">{formatPrice(auction.startingPrice, auction.currencySymbol || auction.currency)}</span>
            </p>
          </div>
        </div>
        {!isOwner && (
          <button
            onClick={() => {
              const el = document.getElementById('timeline-bidding-panel');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-955 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-amber-500/10 shrink-0 cursor-pointer text-center"
          >
            Claim #1 Standing
          </button>
        )}
      </div>
    );
  }

  return (
    <motion.div 
      layout
      key={`highest-${highestBid.id || highestBid.amount}-${highestBid.userId}`}
      initial={{ opacity: 0.9, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`relative overflow-hidden bg-gradient-to-b sm:bg-gradient-to-r from-amber-500/[0.12] via-stone-900 to-stone-955 rounded-2xl p-4 sm:p-5 shadow-2xl transition-all duration-500 ${
        justUpdated 
          ? 'border-2 border-amber-400 ring-4 ring-amber-500/30 shadow-amber-500/20' 
          : 'border border-amber-500/40 shadow-amber-500/[0.04]'
      }`}
    >
      {/* Ambient background glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />

      {/* Real-time Update Banner Pill */}
      {justUpdated && (
        <div className="mb-3 px-2.5 py-1 bg-amber-500 text-stone-955 rounded-lg flex items-center justify-between text-xs font-black uppercase tracking-wider animate-bounce">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            🔥 Leader Position Just Updated in Real-Time!
          </span>
          <span className="text-[10px] bg-stone-955 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
            Live Stream Sync
          </span>
        </div>
      )}

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left Side: Leading Badge + Profile Avatar + Profile Name + Verified Badge */}
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
          {/* Avatar with Gold Podium Ring */}
          <div className="relative shrink-0">
            <div 
              onClick={() => navigate(`/battle-bids/profile/${username}`)}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-stone-950 border-2 border-amber-500/60 p-0.5 flex items-center justify-center overflow-hidden cursor-pointer hover:border-amber-400 transition-colors shadow-lg shadow-amber-500/20"
            >
              {photoURL ? (
                <img src={photoURL} alt={displayName} className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" />
              ) : (
                <User className="w-5 h-5 sm:w-6 sm:h-6 text-stone-400" />
              )}
            </div>
            {/* Crown / Trophy mini badge */}
            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-500 text-stone-955 rounded-full flex items-center justify-center shadow-md">
              <Trophy className="w-3 h-3" />
            </div>
          </div>

          {/* Profile Name & Status */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1 ${
                isUserLeading
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {isUserLeading ? '🥇 You Are Leading' : '👑 #1 Highest Bidder'}
              </span>

              {timeFormatted && (
                <span className="text-[10px] text-stone-400 font-mono flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-500/80" />
                  {timeFormatted}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <h3 
                onClick={() => navigate(`/battle-bids/profile/${username}`)}
                className="text-xs sm:text-sm md:text-base font-black text-white hover:text-amber-400 transition-colors cursor-pointer truncate max-w-[180px] sm:max-w-xs"
                title={displayName}
              >
                @{displayName}
              </h3>
              <ProfileVerificationTick profile={profile} size="sm" />
            </div>

            <button
              onClick={() => navigate(`/battle-bids/profile/${username}`)}
              className="text-[10px] text-stone-400 hover:text-amber-400 font-bold uppercase tracking-wider inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>View Profile</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Right Side: Highest Strike Monetary Display */}
        <div className="bg-stone-955/90 border border-amber-500/30 p-3 sm:p-4 rounded-xl flex items-center justify-between sm:flex-col sm:items-end gap-1.5 shrink-0">
          <span className="text-[9px] sm:text-[10px] font-black text-amber-500/90 uppercase tracking-widest">
            Highest Strike
          </span>
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-xs sm:text-sm font-bold text-stone-400">
              {curr.symbol}
            </span>
            <span className="text-lg sm:text-2xl font-black text-amber-400 tracking-tight">
              {(highestBid.amount || 0).toLocaleString()}
            </span>
            <span className="text-[9px] sm:text-[10px] font-black text-amber-500/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">
              {curr.code}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const ArenaBattleTimeline: React.FC = () => {
  const { auctionId: routeAuctionId } = useParams<{ auctionId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  const auctionId = routeAuctionId || searchParams.get('id') || searchParams.get('auctionId') || '';

  // If no auctionId is provided, automatically redirect to the user's latest auction or active auction
  useEffect(() => {
    if (!auctionId) {
      const resolveDefaultAuction = async () => {
        try {
          if (user?.uid) {
            const userAuctions = await ArenaService.getUserAuctions(user.uid);
            if (userAuctions && userAuctions.length > 0) {
              navigate(`/battle-bids/timeline/${userAuctions[0].id}`, { replace: true });
              return;
            }
          }
          const res = await DiscoveryService.getAuctions({ isNegotiationOnly: false }, 'newest', undefined, 1);
          if (res.items && res.items.length > 0) {
            navigate(`/battle-bids/timeline/${res.items[0].id}`, { replace: true });
          } else {
            navigate('/battle-bids', { replace: true });
          }
        } catch {
          navigate('/battle-bids', { replace: true });
        }
      };
      resolveDefaultAuction();
    }
  }, [auctionId, user?.uid, navigate]);

  const initialCachedAuction = auctionId ? ArenaService.getCachedAuction(auctionId) : null;
  const {
    auction: liveAuction,
    bids: liveBids,
    loading: engineLoading,
    error: engineError,
    timeRemaining,
    placeBid,
    isKycVerified,
    isOwner: engineIsOwner,
    remainingBids
  } = useAuctionEngine(auctionId);

  const [localAuction, setLocalAuction] = useState<AuctionItem | null>(null);
  const [localBids, setLocalBids] = useState<Bid[]>([]);

  useEffect(() => {
    if (liveAuction) {
      setLocalAuction(liveAuction);
    }
  }, [liveAuction]);

  useEffect(() => {
    if (liveBids) {
      setLocalBids(liveBids);
    }
  }, [liveBids]);

  const auction = localAuction || liveAuction || initialCachedAuction;
  const bids = localBids.length > 0 ? localBids : liveBids;
  const loading = engineLoading && !auction;
  const error = engineError;

  const setAuction = (update: any) => {
    setLocalAuction(prev => {
      const computed = typeof update === 'function' ? update(prev || auction) : update;
      return computed;
    });
  };

  const setBids = (update: any) => {
    setLocalBids(prev => {
      const computed = typeof update === 'function' ? update(prev || bids) : update;
      return computed;
    });
  };

  const initialTab = searchParams.get('tab') === 'my' || searchParams.get('tab') === 'mybids'
    ? 'my'
    : searchParams.get('tab') === 'top3'
    ? 'top3'
    : 'all';
  const [activeViewTab, setActiveViewTab] = useState<'all' | 'my' | 'top3'>(initialTab);

  // Sync tab state when URL search params change
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'my' || tabParam === 'mybids') {
      setActiveViewTab('my');
    } else if (tabParam === 'top3') {
      setActiveViewTab('top3');
    } else if (tabParam === 'all') {
      setActiveViewTab('all');
    }
  }, [searchParams]);

  // Record real-time view when user opens timeline
  useEffect(() => {
    if (auctionId) {
      ArenaService.recordView(auctionId, user?.uid).catch(() => {});
    }
  }, [auctionId, user?.uid]);

  const { profile: sellerProfile, loading: sellerProfileLoading } = useSellerProfile(auction?.sellerId);
  const isAdmin = Boolean(user && (user.email === 'imran7297510@gmail.com' || (user as any).role === 'admin' || (user as any).isAdmin));
  const isOwner = Boolean(
    user && auction && (
      (auction.sellerId && (user.uid === auction.sellerId || (userProfile && userProfile.id === auction.sellerId))) ||
      (auction.userId && (user.uid === auction.userId || (userProfile && userProfile.id === auction.userId))) ||
      (user.email && auction.sellerId && user.email.toLowerCase() === auction.sellerId.toLowerCase()) ||
      (auction.sellerEmail && user.email && user.email.toLowerCase() === auction.sellerEmail.toLowerCase())
    )
  );
  const isConcluded = auction?.status === 'concluded' || auction?.status === 'ended' || auction?.status === 'sold' || auction?.status === 'reserve_not_met';

  const [copied, setCopied] = useState(false);
  const [incrementingViews, setIncrementingViews] = useState(false);
  const [showViewsModal, setShowViewsModal] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [goLiveFeedback, setGoLiveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleShare = () => {
    if (!auction) return;
    const shareUrl = `${window.location.origin}/battle-bids/timeline/${auction.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleViewsClick = async () => {
    if (!auction) return;
    setShowViewsModal(true);
    if (incrementingViews) return;
    setIncrementingViews(true);
    try {
      await ArenaService.incrementViews(auction.id);
      setAuction(prev => prev ? { ...prev, viewsCount: (prev.viewsCount || 0) + 1 } : null);
    } catch (error) {
      console.error("Failed to increment views:", error);
    } finally {
      setTimeout(() => setIncrementingViews(false), 1000);
    }
  };

  const handleOpenGoLiveModal = () => {
    if (!user || !auction || !isOwner) return;
    setShowGoLiveModal(true);
  };

  const handleExecuteGoLive = async () => {
    if (!user || !auction || !isOwner) return;
    setUserActionLoading(true);
    setGoLiveFeedback(null);
    try {
      await ArenaService.goLive(auction.id, auction.durationDays || 3, auction);
      
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + (auction.durationDays || 3) * 24 * 60 * 60 * 1000);
      
      const updatedAuction: AuctionItem = {
        ...auction,
        status: 'active',
        launchType: 'now',
        startTime,
        endTime
      };
      
      DiscoveryService.invalidateCache();
      setAuction(updatedAuction);
      setGoLiveFeedback({
        type: 'success',
        message: 'Success! Your post has gone live immediately and is now active in the Battle Arena.'
      });

      setTimeout(() => {
        setGoLiveFeedback(null);
      }, 6000);
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
    if (!user || !auction) return;
    const isCurrentlyPaused = auction.status === 'paused';
    if (!isCurrentlyPaused && isConcluded) {
      alert("Action denied: Listed items cannot be paused once an offer has been accepted by the seller.");
      return;
    }
    if (!window.confirm("Are you sure?")) return;
    setUserActionLoading(true);
    try {
      if (isCurrentlyPaused) {
        await ArenaService.resumeAuction(auction.id);
        setAuction(prev => prev ? { ...prev, status: 'active' } : null);
        alert("Listing resumed.");
      } else {
        await ArenaService.pauseAuction(auction.id);
        setAuction(prev => prev ? { ...prev, status: 'paused' } : null);
        alert("Listing paused.");
      }
    } catch (err: any) {
      alert(err.message || "Action failed.");
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleUserDelete = async () => {
    if (!user || !auction) return;
    if (!window.confirm("Are you sure you want to permanently delete this listing?")) return;
    setUserActionLoading(true);
    try {
      await ArenaService.deleteAuction(auction.id);
      alert("Listing permanently removed on behalf of owner.");
      navigate('/battle-bids/my-auctions');
    } catch (err: any) {
      alert(err.message || "Failed to delete listing.");
    } finally {
      setUserActionLoading(false);
    }
  };

  // Compute current user's bids on this auction item
  const myBids = useMemo(() => {
    if (!user) return [];
    return bids.filter(b => b.userId === user.uid);
  }, [bids, user]);

  // Compute user's standing and highest bid
  const userHighestBid = useMemo(() => {
    if (myBids.length === 0) return null;
    return [...myBids].sort((a, b) => b.amount - a.amount)[0];
  }, [myBids]);

  const userStanding = useMemo(() => {
    if (!userHighestBid || bids.length === 0) return null;
    const sorted = [...bids].sort((a, b) => b.amount - a.amount);
    const uniqueBidders = Array.from(new Set(sorted.map(b => b.userId)));
    const rank = uniqueBidders.indexOf(user.uid) + 1;
    return rank > 0 ? rank : null;
  }, [userHighestBid, bids, user]);

  useEffect(() => {
    if (auction?.isNegotiationOnly) {
      navigate(`/negotiations/timeline/${auction.id}`, { replace: true });
    }
  }, [auction, navigate]);

  // Construct chart data
  const chartData = useMemo(() => {
    if (!auction) return [];
    const basePoint = {
      timestamp: parseSafeDate(auction.startTime) || new Date(),
      price: auction.startingPrice,
    };
    const bidPoints = [...bids].reverse().map(b => ({
      timestamp: b.timestamp ? parseSafeDate(b.timestamp) : new Date(),
      price: b.amount,
    }));
    return [basePoint, ...bidPoints];
  }, [auction, bids]);

  const highestBidObj = useMemo(() => {
    if (!bids || bids.length === 0) return null;
    return [...bids].sort((a, b) => b.amount - a.amount)[0];
  }, [bids]);

  const highestBid = highestBidObj ? highestBidObj.amount : (auction?.currentBid || auction?.startingPrice || 0);

  return (
    <ArenaLayout activeTab="none">
      <div className="max-w-5xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-6 animate-in fade-in duration-300">
        {/* Navigation & Header Bar */}
        <div className="flex items-center justify-between gap-3">
          <ArenaBackButton fallbackPath={auctionId ? `/battle-bids?id=${auctionId}` : '/battle-bids'} />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Clock className="w-4 h-4 text-rose-500 animate-pulse" />
              </div>
            </div>
            <p className="text-stone-400 text-xs font-black uppercase tracking-widest animate-pulse">
              Retrieving Chronological Combat Logs...
            </p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-stone-900 border border-rose-500/30 rounded-3xl p-8 text-center max-w-md mx-auto space-y-4">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <p className="text-rose-400 text-sm font-bold">{error}</p>
            <button
              onClick={() => navigate('/battle-bids')}
              className="px-6 py-2.5 bg-stone-950 hover:bg-stone-850 border border-stone-800 rounded-xl text-white text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
            >
              Return to Battle Arena
            </button>
          </div>
        )}

        {/* Loaded View */}
        {!loading && !error && auction && (
          <div className="space-y-6">
            {/* Feedback Alert Banner */}
            {goLiveFeedback && (
              <div 
                className={`p-4 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in ${
                  goLiveFeedback.type === 'success' 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-5 h-5 shrink-0" />
                  <p className="text-xs sm:text-sm font-bold">{goLiveFeedback.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setGoLiveFeedback(null)}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors shrink-0"
                >
                  <AlertCircle className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Upcoming Auction Notices if upcoming */}
            {auction.status === 'upcoming' && (
              <div className="space-y-4">
                <UpcomingAuctionNotice variant="post" />
                <UpcomingAuctionNotice
                  variant="auction"
                  isOwner={isOwner}
                  onGoLive={handleOpenGoLiveModal}
                  goLiveLoading={userActionLoading}
                  startingPrice={auction.startingPrice}
                  currency={auction.currency}
                  currencySymbol={auction.currencySymbol}
                />
              </div>
            )}

            {/* Post-Conclusion / Winner / Second-Chance Settlement Banner */}
            {isConcluded && (
              <BattleBidsWinnerBanner auction={auction} />
            )}

            {/* 1. Profile of the User who posted the item with details */}
            <ArenaUserProfileCard 
              profile={sellerProfile} 
              fallbackUserId={auction?.sellerId} 
            />

            {/* 2. Images of listed items */}
            <div className="rounded-2xl sm:rounded-[2.5rem] overflow-hidden border border-white/5 bg-stone-955 shadow-2xl">
              <ArenaGallery images={auction.images} title={auction.title} />
            </div>

            {/* 3. Asset Headline & Tactical Details Card */}
            <div className="bg-stone-900 border border-stone-850 rounded-2xl sm:rounded-[2rem] p-4 sm:p-7 shadow-xl relative overflow-hidden space-y-4 sm:space-y-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-stone-955 border border-stone-800 text-stone-400 text-[10px] font-black uppercase tracking-widest rounded-lg">
                      {auction.category || 'Battle Asset'}
                    </span>
                    {auction.hasFeaturedBadge && (
                      <span className="px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1">
                        <Flame className="w-3 h-3" /> Featured
                      </span>
                    )}
                  </div>
                  <ArenaStatus status={auction.status} endTime={auction.endTime} />
                </div>

                <h1 className="text-base sm:text-2xl font-black text-white uppercase tracking-tight break-words">
                  {auction.title}
                </h1>

                {(auction.viewsCount !== undefined || auction.watchersCount !== undefined) && (
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-stone-400">
                    {auction.viewsCount !== undefined && (
                      <button 
                        type="button"
                        onClick={handleViewsClick}
                        className="flex items-center gap-1.5 px-2 py-1 bg-stone-900 border border-stone-800 hover:border-amber-500/40 rounded-lg text-stone-300 hover:text-white transition-all cursor-pointer"
                        title="Click to view telemetry breakdown"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="font-mono text-[11px] sm:text-xs font-bold">{auction.viewsCount} views</span>
                      </button>
                    )}
                    {auction.watchersCount !== undefined && (
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-stone-500" />
                        <span className="font-mono text-[11px] sm:text-xs">{auction.watchersCount} watching</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Description of listed items displayed beneath title and before tactical actions */}
              {auction.description && (
                <div className="px-0.5 text-left space-y-1.5 pt-3 border-t border-stone-800/60">
                  <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Description</h3>
                  <p className="text-xs text-stone-300 font-medium leading-relaxed bg-stone-955/60 p-3.5 sm:p-4 border border-stone-850 rounded-2xl whitespace-pre-line break-words">
                    {auction.description}
                  </p>
                </div>
              )}

              {/* Public Tactical Actions Bar */}
              <div className="w-full pt-1">
                <ArenaTacticalActions item={auction} />
              </div>

              {/* Tactical Price Overview Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 pt-3 border-t border-stone-800/80">
                <div className="p-2.5 sm:p-3.5 bg-stone-955 rounded-xl border border-stone-850">
                  <p className="text-[8px] sm:text-[9px] font-black text-stone-500 uppercase tracking-widest truncate">Starting Price</p>
                  <p className="text-xs sm:text-sm font-black font-mono text-stone-300 mt-0.5 sm:mt-1 truncate">
                    {formatPrice(auction.startingPrice, auction.currencySymbol || auction.currency)}
                  </p>
                </div>

                <div className="p-2.5 sm:p-3.5 bg-stone-955 rounded-xl border border-amber-500/20">
                  <p className="text-[8px] sm:text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1 truncate">
                    <Award className="w-3 h-3 shrink-0" /> <span className="truncate">High Bid</span>
                  </p>
                  <p className="text-xs sm:text-sm font-black font-mono text-amber-400 mt-0.5 sm:mt-1 truncate">
                    {formatPrice(highestBid, auction.currencySymbol || auction.currency)}
                  </p>
                </div>

                <div className="p-2.5 sm:p-3.5 bg-stone-955 rounded-xl border border-stone-850">
                  <p className="text-[8px] sm:text-[9px] font-black text-stone-500 uppercase tracking-widest truncate">Total Strikes</p>
                  <p className="text-xs sm:text-sm font-black font-mono text-stone-200 mt-0.5 sm:mt-1 truncate">
                    {bids.length} {bids.length === 1 ? 'Bid' : 'Bids'}
                  </p>
                </div>

                <div className="p-2.5 sm:p-3.5 bg-stone-955 rounded-xl border border-stone-850">
                  <p className="text-[8px] sm:text-[9px] font-black text-stone-500 uppercase tracking-widest truncate">Min Increment</p>
                  <p className="text-xs sm:text-sm font-black font-mono text-stone-300 mt-0.5 sm:mt-1 truncate">
                    +{formatPrice(auction.minIncrement || 100, auction.currencySymbol || auction.currency)}
                  </p>
                </div>
              </div>
            </div>

            {/* Highest Bidder, Profile Name & Highest Strike Spotlight Banner */}
            <HighestBidderSpotlight
              highestBid={highestBidObj}
              auction={auction}
              totalBids={bids.length}
              isOwner={isOwner}
            />

            {/* Countdown & Bidding Engine panel in working condition */}
            {!auction.isNegotiationOnly && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Time Remaining Countdown Column */}
                <div className="bg-stone-900 border border-stone-850 rounded-2xl sm:rounded-[2rem] p-4 sm:p-7 shadow-xl space-y-4 flex flex-col justify-center">
                  <div className="text-center md:text-left">
                    <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest block mb-1">
                      Tactical Deployment
                    </span>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">
                      {auction.status === 'upcoming' ? 'Scheduled Launch' : 'Time Remaining for Auction'}
                    </h3>
                  </div>
                  <div className="bg-stone-955 p-3 sm:p-4 rounded-2xl border border-stone-850 shadow-inner">
                    {auction.status === 'upcoming' ? (
                      <UpcomingAuctionNotice variant="post" />
                    ) : (
                      <ArenaLiveCountdown 
                        timeRemaining={timeRemaining} 
                        extensionsCount={auction.extensionsCount}
                        variant="single-row"
                      />
                    )}
                  </div>
                </div>

                {/* Place Your Bid Button & Panel Column */}
                <div id="timeline-bidding-panel" className="bg-stone-900 border border-stone-850 rounded-2xl sm:rounded-[2rem] p-4 sm:p-7 shadow-xl flex flex-col justify-center">
                  <div className="text-center md:text-left mb-3">
                    <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest block mb-1">
                      Combat Engagement
                    </span>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">
                      {auction.status === 'upcoming' ? 'Upcoming Deployment' : 'Submit Your Tactical Bid'}
                    </h3>
                  </div>
                  <ArenaBiddingPanel 
                    auction={auction}
                    onBid={placeBid}
                    isKycVerified={isKycVerified}
                    isOwner={isOwner}
                    remainingBids={remainingBids}
                  />
                </div>
              </div>
            )}

            {/* Interactive Timeline Progression Chart */}
            <div className="bg-stone-900 border border-stone-850 rounded-2xl sm:rounded-[2rem] p-4 sm:p-7 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-rose-500" />
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">
                    Price Trajectory Progression
                  </h3>
                </div>
                <span className="text-[10px] font-black text-stone-500 uppercase tracking-wider font-mono">
                  {chartData.length} Data Points
                </span>
              </div>

              <div className="bg-stone-950 p-2 sm:p-4 rounded-2xl border border-stone-850 h-52 sm:h-64">
                <BidHistoryChart 
                  data={chartData} 
                  currency={auction?.currencySymbol || auction?.currency}
                  reservePrice={auction?.reservePrice}
                  height={200} 
                />
              </div>
            </div>

            {/* Chronological Combat Logs & Top 3 Bidders Timeline */}
            <div id="combat-timeline-section" className="bg-stone-900 border border-stone-850 rounded-2xl sm:rounded-[2rem] p-4 sm:p-7 shadow-xl space-y-5 sm:space-y-6">
              {/* Header & Section Filter Switcher */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-850 pb-4">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-widest">
                      Combat Logs Timeline ({bids.length})
                    </h3>
                    <p className="text-[10px] text-stone-400 font-medium">
                      Real-time chronological stream & top bidders
                    </p>
                  </div>
                </div>

                {/* Sub-section Filter Buttons in a Single Row */}
                <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-xl border border-stone-850 w-full md:w-auto overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
                  {/* Button 1: All Bids */}
                  <button
                    id="timeline-tab-all-bids"
                    onClick={() => setActiveViewTab('all')}
                    className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer ${
                      activeViewTab === 'all'
                        ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/10'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>All Bids ({bids.length})</span>
                  </button>

                  {/* Button 2: My Bids */}
                  <button
                    id="timeline-tab-my-bids"
                    onClick={() => setActiveViewTab('my')}
                    className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer ${
                      activeViewTab === 'my'
                        ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/10'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
                    }`}
                  >
                    <User className="w-3.5 h-3.5 shrink-0" />
                    <span>My Bids ({user ? myBids.length : 0})</span>
                  </button>

                  {/* Button 3: Combat Podium Top 3 Bidders */}
                  <button
                    id="timeline-tab-top-3-bidders"
                    onClick={() => setActiveViewTab('top3')}
                    className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer ${
                      activeViewTab === 'top3'
                        ? 'bg-amber-500 text-stone-955 shadow-md shadow-amber-500/10'
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
                    }`}
                  >
                    <Trophy className="w-3.5 h-3.5 shrink-0" />
                    <span>Top 3 Bidders</span>
                  </button>
                </div>
              </div>

              {/* View Tab 1: All Bids Chronological Log Stream */}
              {activeViewTab === 'all' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      All Bids Timeline ({bids.length})
                    </span>
                    <span className="text-[9px] font-mono text-stone-500 uppercase">
                      Chronological Stream
                    </span>
                  </div>

                  <div className="space-y-3">
                    {bids.length > 0 ? (
                      bids.map((b, idx) => (
                        <AllBidRow
                          key={b.id || idx}
                          bid={b}
                          idx={idx}
                          totalBids={bids.length}
                          auctionCurrency={auction.currencySymbol || auction.currency}
                          isHighest={b.amount === (highestBidObj?.amount || 0) && (highestBidObj?.amount || 0) > 0}
                        />
                      ))
                    ) : (
                      <div className="py-14 text-center space-y-2 bg-stone-955 rounded-2xl border border-stone-850/60 p-6">
                        <Clock className="w-8 h-8 text-stone-700 mx-auto" />
                        <p className="text-xs font-black text-stone-400 uppercase tracking-widest">
                          No Tactical Strikes Registered Yet
                        </p>
                        <p className="text-[11px] text-stone-500 max-w-sm mx-auto">
                          {isOwner 
                            ? "You are the seller of this auction listing. Other eligible bidders can deploy bids in the Battle Arena." 
                            : "Be the first operative to place a bid on this asset in the Battle Arena."}
                        </p>
                        <div className="pt-2">
                          <button
                            onClick={() => navigate(`/battle-bids?id=${auctionId}`)}
                            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-955 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer font-black"
                          >
                            {isOwner ? "View in Battle Arena" : "Deploy First Strike"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* View Tab 2: My Bids for this Auction */}
              {activeViewTab === 'my' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-850 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
                        <User className="w-4 h-4" />
                      </span>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                          My Submitted Bids ({user ? myBids.length : 0})
                        </h4>
                        <p className="text-[10px] text-stone-500 font-medium">
                          Confidential dossier of all your combat bids deployed on this asset.
                        </p>
                      </div>
                    </div>

                    {user && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-black text-amber-400 self-start sm:self-auto">
                        <Lock className="w-3 h-3 text-amber-500" />
                        <span>Private to @{user.displayName || user.email?.split('@')[0] || 'you'}</span>
                      </div>
                    )}
                  </div>

                  {!user ? (
                    <div className="py-14 text-center space-y-3 bg-stone-955 rounded-2xl border border-stone-850/60 p-6">
                      <Lock className="w-8 h-8 text-amber-500/60 mx-auto" />
                      <p className="text-xs font-black text-stone-300 uppercase tracking-widest">
                        Authentication Required
                      </p>
                      <p className="text-[11px] text-stone-500 max-w-sm mx-auto">
                        Please log in to your operative account to track and inspect your private placed bids on this combat asset.
                      </p>
                      <div className="pt-2">
                        <button
                          onClick={() => navigate('/auth')}
                          className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-955 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                        >
                          Login to Account
                        </button>
                      </div>
                    </div>
                  ) : myBids.length > 0 ? (
                    <div className="space-y-3">
                      {/* Summary Banner for User's Bids */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3.5 bg-stone-955/80 border border-stone-850 rounded-2xl">
                        <div className="p-2.5 bg-stone-900/80 rounded-xl border border-stone-800/60">
                          <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider block mb-0.5">
                            Total Strikes Deployed
                          </span>
                          <span className="text-sm sm:text-base font-black text-white font-mono">
                            {myBids.length} {myBids.length === 1 ? 'Bid' : 'Bids'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-stone-900/80 rounded-xl border border-stone-800/60">
                          <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider block mb-0.5">
                            Your Highest Strike
                          </span>
                          <span className="text-sm sm:text-base font-black text-amber-400 font-mono">
                            {userHighestBid ? formatPrice(userHighestBid.amount, auction.currencySymbol || auction.currency) : 'N/A'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-stone-900/80 rounded-xl border border-stone-800/60">
                          <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider block mb-0.5">
                            Combat Standing
                          </span>
                          <span className={`text-xs sm:text-sm font-black uppercase font-mono ${
                            userStanding === 1 ? 'text-amber-400' : userStanding && userStanding <= 3 ? 'text-amber-500' : 'text-stone-300'
                          }`}>
                            {userStanding === 1 ? '🥇 #1 Highest Bidder' : userStanding ? `#${userStanding} Unique Standing` : 'Active Combatant'}
                          </span>
                        </div>
                      </div>

                      {/* List of user's bids */}
                      <div className="space-y-3 pt-1">
                        {myBids.map((b) => {
                          // Find global index in all bids to preserve accurate rank sequence
                          const globalIdx = bids.findIndex(
                            (allB) => (allB.id && allB.id === b.id) || (allB.timestamp === b.timestamp && allB.amount === b.amount)
                          );
                          const effectiveIdx = globalIdx >= 0 ? globalIdx : 0;
                          const isHighest = effectiveIdx === 0;

                          return (
                            <AllBidRow
                              key={b.id || `${b.timestamp}-${b.amount}`}
                              bid={b}
                              idx={effectiveIdx}
                              totalBids={bids.length}
                              auctionCurrency={auction.currencySymbol || auction.currency}
                              isHighest={isHighest}
                              canReport={false}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="py-14 text-center space-y-2 bg-stone-955 rounded-2xl border border-stone-850/60 p-6">
                      <User className="w-8 h-8 text-stone-700 mx-auto" />
                      <p className="text-xs font-black text-stone-400 uppercase tracking-widest">
                        No Strikes Deployed by You Yet
                      </p>
                      <p className="text-[11px] text-stone-600 max-w-sm mx-auto">
                        You have not submitted any bids for this auction item. Place a bid in the Battle Arena to join the combat log.
                      </p>
                      <div className="pt-2">
                        <button
                          onClick={() => navigate(`/battle-bids?id=${auctionId}`)}
                          className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-955 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer font-black"
                        >
                          Deploy Strike Now
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* View Tab 3: Combat Podium Top 3 Bidders */}
              {activeViewTab === 'top3' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5" />
                      Combat Podium Top 3 Bidders
                    </span>
                    <span className="text-[9px] font-mono text-stone-500 uppercase">
                      {isOwner ? 'Seller Podium & Direct Actions' : 'Public Podium Rankings'}
                    </span>
                  </div>

                  <Top3Bidders
                    bids={bids}
                    isOwner={isOwner}
                    currentUser={user}
                    showForEveryone={true}
                    singleRow={true}
                    title="Combat Podium Top 3 Bidders"
                    auction={auction}
                    hideHeader={true}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Go Live Confirmation Modal */}
        <ArenaGoLiveModal
          isOpen={showGoLiveModal}
          onClose={() => setShowGoLiveModal(false)}
          onConfirm={handleExecuteGoLive}
          item={auction}
          loading={userActionLoading}
        />

        {/* Live Views Breakdown Telemetry Modal */}
        {auction && (
          <LiveViewsBreakdownModal
            isOpen={showViewsModal}
            onClose={() => setShowViewsModal(false)}
            item={auction}
            viewsCount={auction.viewsCount}
          />
        )}
      </div>
    </ArenaLayout>
  );
};
