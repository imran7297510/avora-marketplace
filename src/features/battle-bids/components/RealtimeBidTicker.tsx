import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  TrendingUp, 
  User, 
  Clock, 
  Trophy, 
  Volume2, 
  VolumeX, 
  Radio, 
  Pause, 
  Play, 
  ArrowUpRight, 
  Flame,
  Award,
  Sparkles
} from 'lucide-react';
import { Bid, AuctionItem } from '../types';
import { formatPrice, getCurrencyByCode } from '../../../lib/currencies';
import { useSellerProfile } from '../hooks/useSellerProfile';
import { ProfileVerificationTick } from './shared/ProfileVerificationTick';
import { parseSafeDate } from '../utils/arena';
import { useAuth } from '../../../context/AuthContext';

// Helper to play a soft tactical web-audio tone for incoming bids
const playTacticalChime = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Ignore audio context errors if blocked by browser policy
  }
};

interface TickerBidItemProps {
  bid: Bid;
  auction: AuctionItem;
  isHighest: boolean;
  rankIndex: number;
  onSelect?: (bid: Bid) => void;
  isNewArrival?: boolean;
}

const TickerBidItem: React.FC<TickerBidItemProps> = ({
  bid,
  auction,
  isHighest,
  rankIndex,
  onSelect,
  isNewArrival = false
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useSellerProfile(bid.userId);

  const displayName = profile?.displayName || profile?.username || bid.userName || `Warrior #${bid.userId?.slice(0, 4) || 'X'}`;
  const username = profile?.username || bid.userId;
  const photoURL = profile?.photoURL || bid.userPhotoURL;
  const isMe = Boolean(user && (bid.userId === user.uid || (bid as any).bidderId === user.uid));
  const currency = (bid as any)?.currencySymbol || (bid as any)?.currency || auction?.currencySymbol || auction?.currency;

  const [timeAgo, setTimeAgo] = useState<string>('Just now');

  useEffect(() => {
    const updateTime = () => {
      const date = parseSafeDate(bid.timestamp);
      if (!date || isNaN(date.getTime())) {
        setTimeAgo('Live');
        return;
      }
      const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
      if (diffSec < 10) {
        setTimeAgo('Just now');
      } else if (diffSec < 60) {
        setTimeAgo(`${diffSec}s ago`);
      } else if (diffSec < 3600) {
        setTimeAgo(`${Math.floor(diffSec / 60)}m ago`);
      } else {
        setTimeAgo(`${Math.floor(diffSec / 3600)}h ago`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 4000);
    return () => clearInterval(interval);
  }, [bid.timestamp]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(bid);
    } else if (username) {
      navigate(`/battle-bids/profile/${username}`);
    }
  };

  return (
    <motion.div
      layout
      initial={isNewArrival ? { scale: 0.85, opacity: 0, y: -10 } : false}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={handleClick}
      className={`group relative flex items-center gap-2.5 px-3 py-1.5 sm:py-2 rounded-xl border transition-all cursor-pointer select-none shrink-0 ${
        isHighest
          ? 'bg-gradient-to-r from-amber-500/20 via-stone-900 to-stone-950 border-amber-500/60 shadow-md shadow-amber-500/10 text-amber-300 ring-1 ring-amber-500/30'
          : isMe
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
          : 'bg-stone-900/90 border-stone-850 hover:border-stone-700 text-stone-300 hover:bg-stone-850'
      }`}
    >
      {/* Lead or Rank Badge */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isHighest ? (
          <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-amber-500 text-stone-955 text-[10px] font-black shadow-sm">
            <Trophy className="w-3 h-3" />
          </span>
        ) : (
          <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-stone-800 text-stone-400 text-[9px] font-mono font-bold">
            #{rankIndex + 1}
          </span>
        )}
      </div>

      {/* Bidder Avatar */}
      <div className="w-6 h-6 rounded-lg bg-stone-950 border border-stone-800 flex items-center justify-center overflow-hidden shrink-0">
        {photoURL ? (
          <img src={photoURL} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <User className="w-3.5 h-3.5 text-stone-400" />
        )}
      </div>

      {/* Name and Verification */}
      <div className="flex items-center gap-1 min-w-0 max-w-[120px] sm:max-w-[150px]">
        <span className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors truncate">
          @{displayName}
        </span>
        <ProfileVerificationTick profile={profile} size="sm" />
      </div>

      {isMe && (
        <span className="px-1 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[8px] font-black uppercase rounded">
          You
        </span>
      )}

      {/* Bid Amount Pill */}
      <div className="flex items-baseline gap-1 font-mono font-black text-xs shrink-0 pl-1 border-l border-stone-800">
        <span className={isHighest ? 'text-amber-400' : 'text-stone-200'}>
          {formatPrice(bid.amount || 0, currency)}
        </span>
      </div>

      {/* Relative Timestamp */}
      <div className="flex items-center gap-1 text-[9px] font-mono text-stone-500 shrink-0">
        <Clock className="w-2.5 h-2.5 text-amber-500/70" />
        <span>{timeAgo}</span>
      </div>
    </motion.div>
  );
};

export interface RealtimeBidTickerProps {
  auctionId: string;
  auction: AuctionItem;
  bids: Bid[];
  onBidSelect?: (bid: Bid) => void;
  className?: string;
  variant?: 'banner' | 'compact' | 'mini';
}

export const RealtimeBidTicker: React.FC<RealtimeBidTickerProps> = ({
  auctionId,
  auction,
  bids,
  onBidSelect,
  className = '',
  variant = 'banner'
}) => {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('arena_ticker_sound') === 'true';
    } catch {
      return false;
    }
  });
  const [isPaused, setIsPaused] = useState(false);
  const [newArrivalBid, setNewArrivalBid] = useState<Bid | null>(null);
  const previousHighestBidRef = useRef<number>(0);
  const previousBidCountRef = useRef<number>(bids.length);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const highestBid = useMemo(() => {
    if (!bids || bids.length === 0) return 0;
    return Math.max(...bids.map(b => b.amount || 0));
  }, [bids]);

  // Track new incoming bids
  useEffect(() => {
    if (bids.length === 0) {
      previousBidCountRef.current = 0;
      previousHighestBidRef.current = 0;
      return;
    }

    const latestBid = bids[0];

    // If count increased or highest bid increased
    if (bids.length > previousBidCountRef.current && previousBidCountRef.current > 0) {
      setNewArrivalBid(latestBid);
      if (soundEnabled) {
        playTacticalChime();
      }

      const timer = setTimeout(() => {
        setNewArrivalBid(null);
      }, 5000);

      // Auto-scroll ticker to start to show latest bid
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      }

      return () => clearTimeout(timer);
    }

    previousBidCountRef.current = bids.length;
    previousHighestBidRef.current = highestBid;
  }, [bids, highestBid, soundEnabled]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem('arena_ticker_sound', String(next));
    } catch {}
  };

  const sortedBids = useMemo(() => {
    return [...bids].slice(0, 15);
  }, [bids]);

  return (
    <div 
      className={`w-full rounded-2xl bg-stone-955 border border-amber-500/30 overflow-hidden shadow-xl ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Top Bar: Live Status + Tactical Stream Controls */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-gradient-to-r from-stone-900 via-stone-955 to-stone-900 border-b border-stone-850/80 gap-2">
        {/* Left Side: Live Streaming Indicator */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wider shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Live Bid Stream</span>
          </div>

          <span className="text-[10px] font-mono text-stone-400 font-bold hidden xs:inline truncate">
            {bids.length} {bids.length === 1 ? 'Strike Logged' : 'Strikes Logged'}
          </span>
        </div>

        {/* Right Side: Quick Controls (Sound, Pause/Play, Live Info) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={toggleSound}
            title={soundEnabled ? "Mute incoming bid alert chime" : "Enable incoming bid chime"}
            className={`p-1 sm:p-1.5 rounded-lg border text-xs transition-all cursor-pointer flex items-center gap-1 ${
              soundEnabled
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-stone-900 border-stone-800 text-stone-500 hover:text-stone-300'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="text-[9px] font-bold uppercase hidden md:inline">
              {soundEnabled ? "Audio On" : "Audio Off"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? "Resume auto-stream" : "Pause auto-stream"}
            className="p-1 sm:p-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-stone-200 text-xs transition-colors cursor-pointer"
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* New Bid Alert Flash Banner (When real-time bid arrives) */}
      <AnimatePresence>
        {newArrivalBid && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-gradient-to-r from-amber-500/30 via-emerald-500/20 to-amber-500/30 border-b border-amber-500/50 px-3 py-1.5 flex items-center justify-between gap-2 overflow-hidden"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1 bg-amber-500 text-stone-955 rounded-md font-black text-[10px] animate-bounce shrink-0">
                <Zap className="w-3 h-3" />
              </span>
              <span className="text-xs font-black text-white truncate">
                ⚡ Incoming Strike: <span className="text-amber-300">@{newArrivalBid.userName || 'Bidder'}</span> placed{' '}
                <span className="font-mono text-emerald-300 font-extrabold">
                  {formatPrice(newArrivalBid.amount || 0, (newArrivalBid as any)?.currencySymbol || auction?.currencySymbol || auction?.currency)}
                </span>!
              </span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-300 shrink-0 px-2 py-0.5 bg-stone-950/80 rounded-md border border-amber-500/40">
              New Leader Update
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable Horizontal Ticker Ribbon */}
      <div 
        ref={scrollContainerRef}
        className="p-2 sm:p-2.5 overflow-x-auto flex items-center gap-2.5 scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent select-none"
      >
        {sortedBids.length > 0 ? (
          sortedBids.map((bid, idx) => (
            <TickerBidItem
              key={bid.id || `bid-${idx}-${bid.amount}`}
              bid={bid}
              auction={auction}
              isHighest={bid.amount === highestBid && highestBid > 0}
              rankIndex={idx}
              onSelect={onBidSelect}
              isNewArrival={Boolean(newArrivalBid && newArrivalBid.id === bid.id)}
            />
          ))
        ) : (
          <div className="py-2 px-3 text-stone-500 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            <span>Tactical Stream Active • Waiting for first combat strike...</span>
          </div>
        )}
      </div>
    </div>
  );
};
