import React from 'react';
import { 
  History, 
  Activity
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { User as FirebaseUser } from 'firebase/auth';
import { formatDistanceToNow } from 'date-fns';
import { AuctionItem, Bid } from '../types';
import { parseSafeDate } from '../utils/arena';
import { formatPrice } from '../../../lib/currencies';
import { cn } from '../../../lib/utils';

export interface ArenaBidsTabsSectionProps {
  bids: Bid[];
  auction?: AuctionItem;
  user?: FirebaseUser | null;
  myBids?: any[];
  myBidsLoading?: boolean;
  myAuctions?: AuctionItem[];
  myAuctionsLoading?: boolean;
  onSelectAuction?: (auction: AuctionItem) => void;
  className?: string;
  defaultTab?: 'all' | 'my' | 'auctions';
}

export const ArenaBidsTabsSection: React.FC<ArenaBidsTabsSectionProps> = ({
  bids = [],
  auction,
  user,
  className
}) => {
  const navigate = useNavigate();
  const currencySymbol = auction?.currencySymbol || auction?.currency || 'Rs.';

  return (
    <div id="all-bids-submitted-section" className={cn("bg-stone-955 border border-stone-850 p-3.5 sm:p-4 rounded-2xl text-left space-y-3 shadow-inner", className)}>
      {/* Header with Title and View Timeline Button */}
      <div className="flex items-center justify-between gap-2 border-b border-stone-850/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <History className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <span>All Bids Placed</span>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold">
              {bids.length}
            </span>
          </h3>
        </div>
        
        {/* Working View Timeline button aligned against All Bids Placed */}
        <button
          type="button"
          id="all-bids-view-timeline-btn"
          onClick={() => {
            const targetAuctionId = auction?.id || (bids[0]?.auctionId);
            if (targetAuctionId) {
              navigate(`/battle-bids/timeline/${targetAuctionId}`);
            } else {
              navigate('/battle-bids/timeline');
            }
          }}
          className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap shadow-sm font-bold"
          title="View auction battle timeline"
        >
          <Activity className="w-3.5 h-3.5 shrink-0" />
          <span>View Timeline</span>
        </button>
      </div>

      {/* Bids List Container */}
      <div className="bg-stone-900/60 border border-stone-850/60 rounded-xl p-2.5 sm:p-3 min-h-[140px]">
        {bids.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-500 font-bold uppercase tracking-wider">
            No bids called on this item yet
          </div>
        ) : (
          <div className="max-h-[260px] sm:max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent pr-1 flex flex-col gap-2">
            {(() => {
              const maxBid = bids.length > 0 ? Math.max(...bids.map(b => b.amount)) : 0;
              const sortedBids = [...bids].sort((a, b) => {
                const timeA = parseSafeDate(a.timestamp).getTime();
                const timeB = parseSafeDate(b.timestamp).getTime();
                return timeB - timeA;
              });

              return sortedBids.map((bid, index) => {
                const isHighest = bid.amount === maxBid;
                const targetAuctionId = auction?.id || bid.auctionId;

                return (
                  <div 
                    key={bid.id || `${bid.userName}-${bid.amount}-${index}`} 
                    onClick={() => {
                      if (user) {
                        if (targetAuctionId) {
                          navigate(`/battle-bids/timeline/${targetAuctionId}`);
                        } else {
                          navigate('/battle-bids/timeline');
                        }
                      } else {
                        navigate('/login');
                      }
                    }}
                    className="w-full flex flex-row items-center justify-between p-2 sm:p-2.5 bg-stone-950 hover:bg-stone-900 border border-stone-850/80 hover:border-amber-500/30 rounded-xl gap-2 transition-all cursor-pointer group active:scale-[0.99]"
                    title="Click bid to open battle timeline"
                  >
                    {/* Left: Avatar + Bidder Name + Offer Badge */}
                    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                      <div className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0",
                        isHighest ? "bg-amber-500 text-stone-955 shadow-sm" : "bg-stone-900 text-stone-400 group-hover:text-stone-200"
                      )}>
                        {bid.userName ? bid.userName.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <p className="text-xs font-black text-stone-200 group-hover:text-white truncate">
                          @{bid.userName || "anonymous"}
                        </p>
                        <span className={cn(
                          "text-[8.5px] sm:text-[9px] font-black shrink-0",
                          isHighest ? "text-amber-500" : "text-stone-500"
                        )}>
                          {isHighest ? "★ HIGHEST BID" : `OFFER #${bids.length - index}`}
                        </span>
                      </div>
                    </div>

                    {/* Right: Amount & Time */}
                    <div className="text-right shrink-0">
                      <p className="text-xs sm:text-sm font-black text-white group-hover:text-amber-400 font-mono transition-colors">
                        {formatPrice(bid.amount, (bid as any).currencySymbol || (bid as any).currency || currencySymbol)}
                      </p>
                      <p className="text-[8.5px] sm:text-[9px] text-stone-500 font-mono">
                        {bid.timestamp ? formatDistanceToNow(parseSafeDate(bid.timestamp), { addSuffix: true }) : "just now"}
                      </p>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
