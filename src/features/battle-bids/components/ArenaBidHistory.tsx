import React from 'react';
import { History, User, TrendingUp, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Bid } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { formatPrice } from '../../../lib/currencies';

interface ArenaBidHistoryProps {
  bids: Bid[];
  currentHighestBidderId?: string;
  currencySymbol?: string;
  currency?: string;
  auctionId?: string;
}

export const ArenaBidHistory: React.FC<ArenaBidHistoryProps> = ({ 
  bids, 
  currentHighestBidderId, 
  currencySymbol, 
  currency,
  auctionId 
}) => {
  const navigate = useNavigate();

  if (bids.length === 0) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-3xl p-8 text-center">
        <History className="w-10 h-10 text-stone-700 mx-auto mb-3" />
        <p className="text-stone-400 font-black uppercase tracking-widest text-xs">No combat records yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 px-2">
        <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 truncate">
          <History className="w-4 h-4 text-rose-500 shrink-0" />
          <span>Combat History ({bids.length} Strikes)</span>
        </h3>
        
        {/* Working View Timeline button aligned against header */}
        <button
          type="button"
          id="combat-history-view-timeline-btn"
          onClick={() => {
            const targetId = (bids[0] as any)?.auctionId || auctionId;
            if (targetId) {
              navigate(`/battle-bids/timeline/${targetId}`);
            } else {
              navigate('/battle-bids/timeline');
            }
          }}
          className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap shadow-sm"
          title="View auction timeline"
        >
          <Activity className="w-3.5 h-3.5 shrink-0" />
          <span>View Timeline</span>
        </button>
      </div>

      <div className="bg-stone-900 border border-stone-800 rounded-3xl overflow-hidden">
        <div className="max-h-[260px] overflow-y-auto scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
          {bids.map((bid, index) => {
            const isHighest = index === 0;
            const targetId = (bid as any).auctionId || auctionId;

            return (
              <div 
                key={bid.id || `${bid.userName}-${index}`} 
                onClick={() => {
                  if (targetId) {
                    navigate(`/battle-bids/timeline/${targetId}`);
                  } else {
                    navigate('/battle-bids/timeline');
                  }
                }}
                className={`p-3 sm:p-4 flex items-center justify-between border-b border-stone-800 last:border-0 transition-colors cursor-pointer group hover:bg-stone-850/60 ${
                  isHighest ? 'bg-rose-600/5' : ''
                }`}
                title="Click strike to view timeline"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    isHighest ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' : 'bg-stone-800 text-stone-400'
                  }`}>
                    {bid.userName ? bid.userName.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black text-white truncate max-w-[120px] sm:max-w-[180px]">@{bid.userName || 'anonymous'}</p>
                      {isHighest && (
                        <span className="bg-rose-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded leading-none shrink-0">
                          Dominant
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-stone-400 font-bold mt-0.5">
                      {bid.timestamp && !isNaN(new Date(bid.timestamp).getTime()) 
                        ? formatDistanceToNow(new Date(bid.timestamp), { addSuffix: true }) 
                        : 'Pending'}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className={`text-xs sm:text-sm font-black ${isHighest ? 'text-rose-500' : 'text-white'}`}>
                    {formatPrice(bid.amount, (bid as any).currencySymbol || (bid as any).currency || currencySymbol || currency)}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <TrendingUp className={`w-3 h-3 ${isHighest ? 'text-rose-500' : 'text-stone-700'}`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
