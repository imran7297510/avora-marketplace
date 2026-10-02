import React from 'react';
import { Clock, Play, Loader2 } from 'lucide-react';
import { formatPrice } from '../../../../lib/currencies';

interface UpcomingAuctionNoticeProps {
  variant?: 'post' | 'auction' | 'full';
  isOwner?: boolean;
  onGoLive?: () => void;
  goLiveLoading?: boolean;
  startingPrice?: number;
  currency?: string;
  currencySymbol?: string;
  className?: string;
}

export const UpcomingAuctionNotice: React.FC<UpcomingAuctionNoticeProps> = ({
  variant = 'post',
  isOwner = false,
  onGoLive,
  goLiveLoading = false,
  startingPrice,
  currency = 'USD',
  currencySymbol,
  className = '',
}) => {
  // 1. Scheduled Upcoming Post Section
  if (variant === 'post') {
    return (
      <div className={`bg-stone-950 border border-blue-500/30 rounded-[2rem] p-6 text-center space-y-2 animate-in fade-in ${className}`}>
        <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-lg inline-flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 animate-pulse" /> Scheduled Upcoming Post
        </span>
        <h4 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
          Deployment Scheduled for Later
        </h4>
        <p className="text-xs text-stone-400 max-w-md mx-auto leading-relaxed">
          This listing is queued for upcoming launch. Bidding will begin as soon as the listing goes live.
        </p>
      </div>
    );
  }

  // 2. Upcoming Auction Section (Action / Bidding panel replacement)
  if (variant === 'auction') {
    return (
      <div className={`space-y-4 text-center py-4 animate-in fade-in ${className}`}>
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400 shadow-md">
          <Clock className="w-6 h-6 animate-pulse" />
        </div>
        <div className="space-y-1.5">
          <span className="px-2.5 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-[10px] font-black text-blue-400 uppercase tracking-widest inline-block">
            Upcoming Auction
          </span>
          <h4 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
            Scheduled Combat Listing
          </h4>
          <p className="text-xs text-stone-300 max-w-md mx-auto leading-relaxed">
            This tactical asset is listed as an upcoming deployment. Bids cannot be submitted until the listing goes live.
          </p>
        </div>

        {isOwner && onGoLive ? (
          <div className="pt-3 max-w-sm mx-auto space-y-3">
            <button
              id="arena-upcoming-go-live-btn"
              type="button"
              onClick={onGoLive}
              disabled={goLiveLoading}
              className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest border border-blue-400/40 shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 active:scale-98 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
            >
              {goLiveLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Launching Live...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Go Live</span>
                </>
              )}
            </button>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
              ⓘ You will be asked for confirmation before launching live.
            </p>
          </div>
        ) : startingPrice !== undefined ? (
          <div className="pt-2 flex flex-col items-center gap-3">
            <div className="p-3 bg-stone-900 border border-stone-850 rounded-xl text-[11px] font-medium text-stone-300">
              Starting Price: <span className="font-black text-amber-400">{formatPrice(startingPrice, currencySymbol || currency)}</span>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // Combined full view
  return (
    <div className={`space-y-4 ${className}`}>
      <div className="bg-stone-950 border border-blue-500/30 rounded-[2rem] p-6 text-center space-y-2 animate-in fade-in">
        <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-lg inline-flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 animate-pulse" /> Scheduled Upcoming Post
        </span>
        <h4 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">
          Deployment Scheduled for Later
        </h4>
        <p className="text-xs text-stone-400 max-w-md mx-auto leading-relaxed">
          This listing is queued for upcoming launch. Bidding will begin as soon as the listing goes live.
        </p>
      </div>

      <div className="bg-stone-955 border border-stone-850 rounded-2xl p-6 text-center space-y-4 animate-in fade-in">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400 shadow-md">
          <Clock className="w-6 h-6 animate-pulse" />
        </div>
        <div className="space-y-1.5">
          <span className="px-2.5 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-[10px] font-black text-blue-400 uppercase tracking-widest inline-block">
            Upcoming Auction
          </span>
          <h4 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
            Scheduled Combat Listing
          </h4>
          <p className="text-xs text-stone-300 max-w-md mx-auto leading-relaxed">
            This tactical asset is listed as an upcoming deployment. Bids cannot be submitted until the listing goes live.
          </p>
        </div>

        {isOwner && onGoLive && (
          <div className="pt-3 max-w-sm mx-auto space-y-3">
            <button
              type="button"
              onClick={onGoLive}
              disabled={goLiveLoading}
              className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest border border-blue-400/40 shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 active:scale-98 transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
            >
              {goLiveLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Launching Live...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Go Live</span>
                </>
              )}
            </button>
            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
              ⓘ You will be asked for confirmation before launching live.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
