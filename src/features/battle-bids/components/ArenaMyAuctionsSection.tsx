import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as FirebaseUser } from 'firebase/auth';
import { formatDistanceToNow } from 'date-fns';
import { 
  Flame, 
  ChevronRight, 
  ChevronLeft,
  Clock, 
  Gavel, 
  LogIn, 
  Eye, 
  Users, 
  TrendingUp, 
  Activity, 
  Sparkles,
  ExternalLink,
  PlusCircle,
  Package
} from 'lucide-react';
import { parseSafeDate, formatPostDateTime } from '../utils/arena';
import { formatPrice } from '../../../lib/currencies';
import { AuctionItem } from '../types';
import { cn } from '../../../lib/utils';

export interface ArenaMyAuctionsSectionProps {
  auctions: AuctionItem[];
  loading?: boolean;
  user?: FirebaseUser | null;
  onSelectAuction?: (auction: AuctionItem) => void;
  className?: string;
}

export const ArenaMyAuctionsSection: React.FC<ArenaMyAuctionsSectionProps> = ({
  auctions = [],
  loading = false,
  user = null,
  onSelectAuction,
  className
}) => {
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleExploreClick = () => {
    navigate('/battle-bids/my-auctions');
  };

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollAmount = container.clientWidth * 0.75;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  const handleItemClick = (auction: AuctionItem) => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (auction.isNegotiationOnly) {
      navigate(`/negotiations/timeline/${auction.id}`);
    } else {
      navigate(`/battle-bids/timeline/${auction.id}`);
    }
  };

  return (
    <div 
      id="arena-my-auctions-section" 
      className={cn("space-y-3.5 pt-4 border-t border-stone-850", className)}
    >
      {/* Section Header with Navigation & Explore Button */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
            <Package className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
          </div>
          <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <span>My Auctions</span>
            {user && (
              <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 font-bold">
                {auctions.length}
              </span>
            )}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Scroll Navigation Arrows */}
          {auctions.length > 2 && (
            <div className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleScroll('left')}
                className="p-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 text-stone-400 hover:text-white transition-all active:scale-95 cursor-pointer"
                title="Scroll Left"
                aria-label="Scroll Left"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleScroll('right')}
                className="p-1 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 text-stone-400 hover:text-white transition-all active:scale-95 cursor-pointer"
                title="Scroll Right"
                aria-label="Scroll Right"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Explore Button */}
          <button
            type="button"
            onClick={handleExploreClick}
            id="arena-my-auctions-explore-btn"
            className="text-[10px] sm:text-xs font-black text-stone-400 hover:text-white uppercase tracking-widest flex items-center gap-1 transition-colors group cursor-pointer active:scale-95 bg-stone-900/60 hover:bg-stone-850 px-2.5 py-1.5 rounded-lg border border-stone-800/80"
          >
            <span>Explore</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform text-rose-500" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        /* Loading Skeleton - 1.5 item width preview */
        <div className="flex overflow-x-auto gap-3 sm:gap-4 pb-3.5 pt-1 scrollbar-none snap-x snap-mandatory overscroll-x-contain animate-pulse">
          {[1, 2].map((i) => (
            <div 
              key={i} 
              className="w-[70vw] sm:w-[55vw] md:w-[380px] shrink-0 snap-start bg-stone-900 border border-stone-850 rounded-2xl p-3.5 space-y-3 h-72"
            >
              <div className="w-full aspect-[16/10] bg-stone-800 rounded-xl" />
              <div className="h-4 bg-stone-800 rounded w-3/4" />
              <div className="h-10 bg-stone-800 rounded-lg w-full" />
            </div>
          ))}
        </div>
      ) : !user ? (
        /* Unauthenticated Prompt */
        <div className="py-8 px-4 bg-stone-900/40 border border-stone-850 rounded-2xl text-center space-y-3">
          <Package className="w-8 h-8 text-rose-500/60 mx-auto" />
          <div>
            <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
              Track Your Listed Combat Auctions
            </h4>
            <p className="text-[11px] text-stone-400 font-medium max-w-sm mx-auto mt-1">
              Sign in to manage and review all auction items you have deployed to the combat arena.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-400 text-stone-955 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-rose-500/10 cursor-pointer font-bold"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In to View My Auctions</span>
          </button>
        </div>
      ) : auctions.length === 0 ? (
        /* Empty State */
        <div className="py-8 px-4 bg-stone-900/30 border border-stone-850 rounded-2xl text-center space-y-3">
          <Package className="w-8 h-8 text-stone-600 mx-auto" />
          <div>
            <h4 className="text-xs font-black text-stone-300 uppercase tracking-wider">
              No Listed Auctions Yet
            </h4>
            <p className="text-[11px] text-stone-500 font-medium max-w-sm mx-auto mt-1">
              You haven't listed any items in the Battle Bids arena yet. Launch your first combat auction now!
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/battle-bids/create')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-800 hover:bg-stone-750 text-rose-400 hover:text-rose-300 border border-stone-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer font-bold"
          >
            <PlusCircle className="w-3.5 h-3.5 text-rose-500" />
            <span>Create Combat Auction</span>
          </button>
        </div>
      ) : (
        /* Swipeable List: 1.5 Items Visible in a Single Row (Left-to-Right & Right-to-Left) */
        <div 
          ref={scrollContainerRef}
          id="swipeable-my-auctions-carousel"
          className="flex overflow-x-auto gap-3 sm:gap-4 pb-3.5 pt-1 scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-stone-950 snap-x snap-mandatory scroll-smooth overscroll-x-contain"
        >
          {auctions.map((auction, index) => {
            const currencySymbol = auction.currencySymbol || auction.currency || '$';
            const isActive = auction.status === 'active' || !auction.status;
            const isPaused = auction.status === 'paused';
            const isUpcoming = auction.status === 'upcoming';
            const isConcluded = auction.status === 'concluded' || auction.status === 'sold' || auction.status === 'ended';
            const isStopped = auction.status === 'stopped' || auction.status === 'cancelled';
            const imageSrc = auction.images && auction.images.length > 0 ? auction.images[0] : '';

            return (
              <div 
                key={auction.id || `my-auction-${index}`} 
                className="w-[70vw] sm:w-[55vw] md:w-[380px] shrink-0 snap-start flex flex-col"
              >
                <div 
                  onClick={() => handleItemClick(auction)}
                  className="group relative bg-stone-900/90 hover:bg-stone-900 border border-stone-800 hover:border-rose-500/50 rounded-2xl overflow-hidden transition-all duration-300 shadow-lg hover:shadow-rose-500/10 flex flex-col h-full cursor-pointer active:scale-[0.99]"
                >
                  {/* Media Banner */}
                  <div className="relative aspect-[16/10] overflow-hidden bg-stone-955 shrink-0">
                    {imageSrc ? (
                      <img 
                        src={imageSrc} 
                        alt={auction.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-700 bg-stone-950 font-black text-2xl">
                        ⚔
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-transparent" />

                    {/* Top Floating Status Badges */}
                    <div className="absolute top-2 inset-x-2 flex items-start justify-between gap-1">
                      {/* Status Chip */}
                      <span className={cn(
                        "px-2 py-0.5 rounded-md text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider backdrop-blur-md border shadow-md flex items-center gap-1",
                        isActive ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-400" :
                        isPaused ? "bg-amber-950/90 border-amber-500/40 text-amber-400" :
                        isUpcoming ? "bg-blue-950/90 border-blue-500/40 text-blue-400" :
                        isStopped ? "bg-rose-950/90 border-rose-500/40 text-rose-400" :
                        "bg-stone-900/90 border-stone-700 text-stone-300"
                      )}>
                        {isActive ? (
                          <>
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                            <span>Live</span>
                          </>
                        ) : isPaused ? (
                          <>
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                            <span>Paused</span>
                          </>
                        ) : isUpcoming ? (
                          <>
                            <Clock className="w-2.5 h-2.5 text-blue-400" />
                            <span>Upcoming</span>
                          </>
                        ) : isStopped ? (
                          <span>Stopped</span>
                        ) : (
                          <span>Concluded</span>
                        )}
                      </span>

                      {/* Owner Tag */}
                      <span className="px-2 py-0.5 rounded-md text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider backdrop-blur-md border shadow-md flex items-center gap-1 bg-rose-500/20 border-rose-500/40 text-rose-400">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>My Listing</span>
                      </span>
                    </div>

                    {/* Bottom Floating Stats */}
                    <div className="absolute bottom-1.5 inset-x-2 flex items-center justify-between text-[9px] font-mono text-stone-300">
                      <span className="flex items-center gap-1 bg-stone-950/80 px-1.5 py-0.5 rounded border border-stone-800/60 backdrop-blur-sm">
                        <Flame className="w-2.5 h-2.5 text-amber-500" />
                        <span>{auction.bidsCount || 0} Offers</span>
                      </span>

                      <div className="flex items-center gap-1.5">
                        {auction.viewsCount !== undefined && auction.viewsCount > 0 && (
                          <span className="flex items-center gap-1 bg-stone-950/80 px-1.5 py-0.5 rounded border border-stone-800/60 backdrop-blur-sm">
                            <Eye className="w-2.5 h-2.5 text-stone-400" />
                            <span>{auction.viewsCount}</span>
                          </span>
                        )}
                        {auction.watchersCount !== undefined && auction.watchersCount > 0 && (
                          <span className="flex items-center gap-1 bg-stone-950/80 px-1.5 py-0.5 rounded border border-stone-800/60 backdrop-blur-sm">
                            <Users className="w-2.5 h-2.5 text-stone-400" />
                            <span>{auction.watchersCount}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-2.5 sm:p-3 flex flex-col flex-1 justify-between gap-2">
                    <div className="space-y-0.5">
                      {/* Exact Date & Time Posted */}
                      {(auction.createdAt || auction.startTime) && (
                        <div className="flex items-center gap-1 text-[8px] sm:text-[8.5px] font-mono text-stone-400 pb-0.5">
                          <Clock className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                          <span>Posted: <strong className="text-stone-300 font-semibold">{formatPostDateTime(auction.createdAt || auction.startTime)}</strong></span>
                        </div>
                      )}
                      {auction.category && (
                        <p className="text-[8.5px] font-bold text-stone-500 uppercase tracking-wider truncate">
                          {auction.category}
                        </p>
                      )}
                      <h4 className="text-xs sm:text-sm font-black text-white uppercase italic tracking-tight line-clamp-1 group-hover:text-rose-400 transition-colors">
                        {auction.title || 'Combat Auction Listing'}
                      </h4>
                    </div>

                    {/* Price Block */}
                    <div className="grid grid-cols-2 gap-1.5 p-2 bg-stone-950 rounded-xl border border-stone-850">
                      {/* Current Bid */}
                      <div>
                        <span className="text-[8px] font-black text-rose-400/80 uppercase tracking-wider block">
                          Highest Bid
                        </span>
                        <p className="text-xs sm:text-sm font-mono font-black text-rose-400 truncate">
                          {formatPrice(auction.currentBid || auction.startingPrice, currencySymbol)}
                        </p>
                      </div>

                      {/* Starting Price / Reserve */}
                      <div className="text-right border-l border-stone-850 pl-1.5">
                        <span className="text-[8px] font-black text-stone-500 uppercase tracking-wider block">
                          Starting Base
                        </span>
                        <p className="text-xs sm:text-sm font-mono font-black text-stone-300 truncate">
                          {formatPrice(auction.startingPrice, currencySymbol)}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons: Open & Spotlight */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/battle-bids/timeline/${auction.id}`);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-stone-800 hover:bg-stone-750 text-white rounded-lg text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider transition-all border border-stone-700 active:scale-95 cursor-pointer"
                        title="View Battle Timeline"
                      >
                        <Activity className="w-2.5 h-2.5 text-rose-400" />
                        <span>Timeline</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleItemClick(auction);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-rose-500 hover:bg-rose-400 text-stone-955 rounded-lg text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer font-bold shadow-sm"
                        title="Open Auction in Arena"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                        <span>Open</span>
                      </button>
                    </div>
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
