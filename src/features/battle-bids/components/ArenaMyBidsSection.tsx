import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User as FirebaseUser } from 'firebase/auth';
import { formatDistanceToNow } from 'date-fns';
import { 
  Award, 
  ChevronRight, 
  Clock, 
  Gavel, 
  LogIn, 
  Flame, 
  TrendingUp, 
  Activity, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { parseSafeDate } from '../utils/arena';
import { formatPrice } from '../../../lib/currencies';
import { AuctionItem } from '../types';
import { cn } from '../../../lib/utils';

export interface MyBidItem {
  bidId: string;
  auctionId: string;
  auctionTitle: string;
  auctionImage?: string;
  userBidAmount: number;
  latestTimestamp: Date;
  status: 'active' | 'upcoming' | 'paused' | 'ended' | 'sold' | 'cancelled' | 'concluded';
  endTime: Date;
  currentBid?: number;
  startingPrice?: number;
  currency?: string;
  currencySymbol?: string;
  highestBidderId?: string;
  highestBidderName?: string;
  category?: string;
  bidsCount?: number;
  auction?: AuctionItem;
}

export interface ArenaMyBidsSectionProps {
  bids: MyBidItem[];
  loading?: boolean;
  user?: FirebaseUser | null;
  onSelectAuction?: (auction: AuctionItem) => void;
  className?: string;
}

export const ArenaMyBidsSection: React.FC<ArenaMyBidsSectionProps> = ({
  bids = [],
  loading = false,
  user = null,
  onSelectAuction,
  className
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleExploreClick = () => {
    navigate({
      pathname: '/battle-bids/explore',
      search: location.search
    });
  };

  const handleItemClick = (bid: MyBidItem) => {
    if (!user) {
      navigate('/login');
      return;
    }

    navigate(`/battle-bids/timeline/${bid.auctionId}?tab=my`);
  };

  return (
    <div 
      id="arena-my-bids-section" 
      className={cn("space-y-3 pt-4 border-t border-stone-850", className)}
    >
      {/* Section Header with Explore Button */}
      <div className="flex items-center justify-between px-1 sm:px-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Award className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          </div>
          <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <span>My Bids</span>
            {user && (
              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold">
                {bids.length}
              </span>
            )}
          </h3>
        </div>

        {/* Explore Button */}
        <button
          type="button"
          onClick={handleExploreClick}
          id="arena-my-bids-explore-btn"
          className="text-[10px] sm:text-xs font-black text-stone-400 hover:text-white uppercase tracking-widest flex items-center gap-1 transition-colors group cursor-pointer active:scale-95 bg-stone-900/60 hover:bg-stone-850 px-2.5 py-1.5 rounded-lg border border-stone-800/80"
        >
          <span>Explore All</span>
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform text-amber-500" />
        </button>
      </div>

      {/* Content Area */}
      {loading ? (
        /* Loading Skeleton: Vertical list style */
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div 
              key={i} 
              className="h-16 w-full bg-stone-900/80 border border-stone-850 rounded-xl p-3 flex items-center justify-between"
            >
              <div className="space-y-1.5 w-1/2">
                <div className="h-3.5 bg-stone-800 rounded w-3/4" />
                <div className="h-2.5 bg-stone-800/60 rounded w-1/3" />
              </div>
              <div className="h-4 bg-stone-800 rounded w-20" />
            </div>
          ))}
        </div>
      ) : !user ? (
        /* Unauthenticated Prompt */
        <div className="py-8 px-4 bg-stone-900/40 border border-stone-850 rounded-2xl text-center space-y-3">
          <Award className="w-8 h-8 text-amber-500/60 mx-auto" />
          <div>
            <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
              Track Your Battle Bids
            </h4>
            <p className="text-[11px] text-stone-400 font-medium max-w-sm mx-auto mt-1">
              Sign in to view your live bids, current offer rankings, and track real-time combat outcomes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-amber-500/10 cursor-pointer font-bold"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In to View My Bids</span>
          </button>
        </div>
      ) : bids.length === 0 ? (
        /* Empty State */
        <div className="py-8 px-4 bg-stone-900/30 border border-stone-850 rounded-2xl text-center space-y-3">
          <Gavel className="w-8 h-8 text-stone-600 mx-auto" />
          <div>
            <h4 className="text-xs font-black text-stone-300 uppercase tracking-wider">
              No Submitted Bids Yet
            </h4>
            <p className="text-[11px] text-stone-500 font-medium max-w-sm mx-auto mt-1">
              You haven't called any bids in the active combat arena yet. Jump into live auctions and submit your strike!
            </p>
          </div>
          <button
            type="button"
            onClick={handleExploreClick}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-800 hover:bg-stone-750 text-stone-200 hover:text-white border border-stone-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer font-bold"
          >
            <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
            <span>Browse Live Combat Items</span>
          </button>
        </div>
      ) : (
        /* Scrollable Vertical List (Up to Down & Down to Up - No Images) */
        <div 
          id="scrollable-my-bids-vertical-list"
          className="max-h-[340px] sm:max-h-[380px] overflow-y-auto scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-stone-950/60 pr-1 flex flex-col gap-2"
        >
          {bids.map((bid, index) => {
            const currencySymbol = bid.currencySymbol || bid.currency || '$';
            const isHighestBidder = (bid.highestBidderId && user && bid.highestBidderId === user.uid) || 
                                   (bid.currentBid && bid.userBidAmount >= bid.currentBid);
            const isConcluded = bid.status === 'concluded' || bid.status === 'sold' || bid.status === 'ended';
            const isPaused = bid.status === 'paused';
            const isActive = bid.status === 'active' || !bid.status;

            return (
              <div
                key={bid.bidId || `${bid.auctionId}-${index}`}
                onClick={() => handleItemClick(bid)}
                className="w-full flex flex-row items-center justify-between p-2.5 sm:p-3 bg-stone-900/90 hover:bg-stone-900 border border-stone-800 hover:border-amber-500/40 rounded-xl gap-2.5 sm:gap-3.5 transition-all cursor-pointer group active:scale-[0.99] shadow-sm"
                title="Click to open this auction"
              >
                {/* Left: Tactical Gavel/Status Icon + Auction Title + Status Chips */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <div className={cn(
                    "w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border transition-colors",
                    isHighestBidder 
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-400 group-hover:bg-amber-500 group-hover:text-stone-955" 
                      : "bg-stone-950 border-stone-800 text-stone-400 group-hover:text-stone-200 group-hover:border-stone-700"
                  )}>
                    <Gavel className="w-4 h-4" />
                  </div>

                  <div className="flex flex-col min-w-0 flex-1 space-y-0.5">
                    {/* Top line: Category + Status Badge */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {bid.category && (
                        <span className="text-[8px] sm:text-[8.5px] font-bold text-stone-500 uppercase tracking-wider truncate">
                          {bid.category}
                        </span>
                      )}
                      
                      {/* Auction Status Chip */}
                      <span className={cn(
                        "px-1.5 py-0.2 rounded text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider border",
                        isActive ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-400" :
                        isPaused ? "bg-amber-950/80 border-amber-500/30 text-amber-400" :
                        isConcluded ? "bg-stone-950 border-stone-800 text-stone-400" :
                        "bg-blue-950/80 border-blue-500/30 text-blue-400"
                      )}>
                        {isActive ? 'Live' : isPaused ? 'Paused' : isConcluded ? 'Concluded' : bid.status}
                      </span>

                      {/* Highest vs Outbid Tag */}
                      <span className={cn(
                        "px-1.5 py-0.2 rounded text-[7.5px] sm:text-[8px] font-black uppercase tracking-wider border flex items-center gap-0.5",
                        isHighestBidder 
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-400 font-bold" 
                          : "bg-rose-500/15 border-rose-500/30 text-rose-400"
                      )}>
                        {isHighestBidder ? (
                          <>
                            <Sparkles className="w-2 h-2 text-amber-400" />
                            <span>Highest Strike</span>
                          </>
                        ) : (
                          <span>Outbid</span>
                        )}
                      </span>
                    </div>

                    {/* Auction Title */}
                    <h4 className="text-xs sm:text-sm font-black text-white uppercase italic tracking-tight truncate group-hover:text-amber-400 transition-colors">
                      {bid.auctionTitle || 'Combat Auction Listing'}
                    </h4>

                    {/* Time distance & Offers count */}
                    <div className="flex items-center gap-2 text-[9px] text-stone-500 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-stone-500" />
                        <span>{bid.latestTimestamp ? formatDistanceToNow(parseSafeDate(bid.latestTimestamp), { addSuffix: true }) : 'Just now'}</span>
                      </span>
                      {bid.bidsCount !== undefined && bid.bidsCount > 0 && (
                        <span className="flex items-center gap-1 text-stone-400">
                          <Flame className="w-2.5 h-2.5 text-amber-500" />
                          <span>{bid.bidsCount} offers</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Amounts & Quick Actions */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <div className="text-right flex flex-col">
                    <span className="text-[7.5px] sm:text-[8px] font-black text-amber-400/80 uppercase tracking-wider">
                      Your Strike
                    </span>
                    <p className="text-xs sm:text-sm font-mono font-black text-amber-400 group-hover:text-amber-300 transition-colors">
                      {formatPrice(bid.userBidAmount, currencySymbol)}
                    </p>
                    {bid.currentBid && bid.currentBid !== bid.userBidAmount && (
                      <p className="text-[8.5px] sm:text-[9px] font-mono text-stone-500">
                        Top: {formatPrice(bid.currentBid, currencySymbol)}
                      </p>
                    )}
                  </div>

                  {/* Open Trigger Icon */}
                  <div className="hidden xs:flex items-center gap-1 pl-1 border-l border-stone-800">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/battle-bids/timeline/${bid.auctionId}`);
                      }}
                      className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-750 text-stone-400 hover:text-white border border-stone-700 transition-all active:scale-95 cursor-pointer"
                      title="View Timeline"
                      aria-label="View Timeline"
                    >
                      <Activity className="w-3 h-3 text-amber-400" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleItemClick(bid);
                      }}
                      className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-955 transition-all active:scale-95 cursor-pointer font-bold"
                      title="Open Auction in Arena"
                      aria-label="Open Auction in Arena"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
