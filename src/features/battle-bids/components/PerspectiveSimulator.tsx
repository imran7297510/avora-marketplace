import React from 'react';
import { cn } from '../../../lib/utils';
import { Layers, RefreshCw, CheckCircle2 } from 'lucide-react';

interface PerspectiveSimulatorProps {
  isAdmin: boolean;
  currentPerspective: 'admin' | 'buyer' | 'seller';
  onChangePerspective: (p: 'admin' | 'buyer' | 'seller') => void;
  onResetCounterInput: () => void;
  isActualBuyer?: boolean;
  isActualSeller?: boolean;
  offers?: any[];
  activeFilter?: 'all' | 'counter' | 'accepted';
  onSelectFilter?: (filter: 'all' | 'counter' | 'accepted') => void;
  negotiation?: any;
  simulatedUserId?: string;
}

export const PerspectiveSimulator: React.FC<PerspectiveSimulatorProps> = ({
  isAdmin,
  currentPerspective,
  onChangePerspective,
  onResetCounterInput,
  isActualBuyer = true,
  isActualSeller = true,
  offers = [],
  activeFilter = 'all',
  onSelectFilter,
  negotiation,
  simulatedUserId
}) => {
  const offerOnlyList = (offers || []).filter(o => o.action !== 'message');
  const isAccepted = negotiation?.status === 'accepted' || negotiation?.status === 'completed' || negotiation?.status === 'concluded';

  const allCount = offerOnlyList.length > 0 ? offerOnlyList.length : (isAccepted ? 1 : 0);
  const counterCount = offerOnlyList.filter(o => o.action === 'counter' || o.action === 'counter_offered' || o.action === 'accept' || o.action === 'complete').length || (isAccepted ? 1 : 0);
  const acceptedCount = isAccepted ? 1 : offerOnlyList.filter(o => o.action === 'accept' || o.action === 'complete').length;

  return (
    <div className="w-full bg-stone-900/90 backdrop-blur-md border border-white/10 p-2 sm:p-3 rounded-2xl sm:rounded-3xl shadow-xl">
      {/* Responsive 3-button filter bar for All Offers, Counter Offers, and Accepted Offers */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
        {/* 1. All Offers */}
        <button
          type="button"
          onClick={() => onSelectFilter?.('all')}
          className={cn(
            "min-h-[46px] flex flex-col sm:flex-row items-center justify-center sm:justify-between px-2 py-2 sm:px-3.5 sm:py-3 rounded-xl sm:rounded-2xl border text-center sm:text-left transition-all duration-200 cursor-pointer group active:scale-[0.98]",
            activeFilter === 'all'
              ? "bg-amber-500/15 border-amber-500/50 text-amber-400 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/30"
              : "bg-stone-955 border-white/5 text-stone-300 hover:bg-stone-950 hover:border-white/10"
          )}
          title="All Offers - View full timeline"
        >
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5 min-w-0 w-full">
            <div className={cn(
              "p-1.5 sm:p-2 rounded-lg sm:rounded-xl border shrink-0 transition-colors", 
              activeFilter === 'all' ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "bg-stone-900 border-stone-800 text-stone-400 group-hover:text-stone-200"
            )}>
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0 w-full">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider block leading-tight truncate">All Offers</span>
              <span className="text-[9px] sm:text-[10px] font-bold text-amber-400/90 mt-0.5 block truncate">
                ({allCount})
              </span>
            </div>
          </div>
          <span className={cn("w-2 h-2 rounded-full shrink-0 hidden md:block ml-2", activeFilter === 'all' ? "bg-amber-500 animate-pulse" : "bg-stone-800")} />
        </button>

        {/* 2. Counter Offers */}
        <button
          type="button"
          onClick={() => onSelectFilter?.('counter')}
          className={cn(
            "min-h-[46px] flex flex-col sm:flex-row items-center justify-center sm:justify-between px-2 py-2 sm:px-3.5 sm:py-3 rounded-xl sm:rounded-2xl border text-center sm:text-left transition-all duration-200 cursor-pointer group active:scale-[0.98]",
            activeFilter === 'counter'
              ? "bg-amber-500/15 border-amber-500/50 text-amber-400 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/30"
              : "bg-stone-955 border-white/5 text-stone-300 hover:bg-stone-950 hover:border-white/10"
          )}
          title="Counter Offers - View counter proposals"
        >
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5 min-w-0 w-full">
            <div className={cn(
              "p-1.5 sm:p-2 rounded-lg sm:rounded-xl border shrink-0 transition-colors", 
              activeFilter === 'counter' ? "bg-amber-500/20 border-amber-500/40 text-amber-400" : "bg-stone-900 border-stone-800 text-stone-400 group-hover:text-stone-200"
            )}>
              <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0 w-full">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider block leading-tight truncate">Counter Offers</span>
              <span className="text-[9px] sm:text-[10px] font-bold text-amber-400/90 mt-0.5 block truncate">
                ({counterCount})
              </span>
            </div>
          </div>
          <span className={cn("w-2 h-2 rounded-full shrink-0 hidden md:block ml-2", activeFilter === 'counter' ? "bg-amber-500 animate-pulse" : "bg-stone-800")} />
        </button>

        {/* 3. Accepted Offers */}
        <button
          type="button"
          onClick={() => onSelectFilter?.('accepted')}
          className={cn(
            "min-h-[46px] flex flex-col sm:flex-row items-center justify-center sm:justify-between px-2 py-2 sm:px-3.5 sm:py-3 rounded-xl sm:rounded-2xl border text-center sm:text-left transition-all duration-200 cursor-pointer group active:scale-[0.98]",
            activeFilter === 'accepted'
              ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-400 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/30"
              : "bg-stone-955 border-white/5 text-stone-300 hover:bg-stone-950 hover:border-white/10"
          )}
          title="Accepted Offers - View final agreement"
        >
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5 min-w-0 w-full">
            <div className={cn(
              "p-1.5 sm:p-2 rounded-lg sm:rounded-xl border shrink-0 transition-colors", 
              activeFilter === 'accepted' ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "bg-stone-900 border-stone-800 text-stone-400 group-hover:text-stone-200"
            )}>
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0 w-full">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider block leading-tight truncate">Accepted Offers</span>
              <span className="text-[9px] sm:text-[10px] font-bold text-emerald-400 mt-0.5 block truncate">
                ({acceptedCount})
              </span>
            </div>
          </div>
          <span className={cn("w-2 h-2 rounded-full shrink-0 hidden md:block ml-2", activeFilter === 'accepted' ? "bg-emerald-500 animate-pulse" : "bg-stone-800")} />
        </button>
      </div>
    </div>
  );
};

