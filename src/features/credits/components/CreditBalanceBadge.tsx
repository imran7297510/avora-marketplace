import React from 'react';
import { Coins, Plus, History, Sparkles } from 'lucide-react';
import { useCredits } from '../hooks/useCredits';

interface CreditBalanceBadgeProps {
  className?: string;
  showAddButton?: boolean;
  variant?: 'compact' | 'full' | '3d';
}

export const CreditBalanceBadge: React.FC<CreditBalanceBadgeProps> = ({
  className = '',
  showAddButton = true,
  variant = 'compact',
}) => {
  const { creditsBalance, openLedger, openPurchase, loading, isDemoMode } = useCredits();

  const formattedLabel = isDemoMode
    ? `${loading ? '...' : creditsBalance} DEMO CR`
    : `${loading ? '...' : creditsBalance} CR`;

  if (variant === '3d') {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <button
          type="button"
          onClick={openLedger}
          title={isDemoMode ? "Open Demo Credit History & Ledger" : "Open Credit History & Ledger"}
          className={`group relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider border-b-2 active:translate-y-0.5 active:border-b-0 transition-all select-none shadow-none cursor-pointer ${
            isDemoMode
              ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 border-amber-600'
              : 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 border-amber-600'
          }`}
        >
          <Coins className="w-3.5 h-3.5 text-stone-950 shrink-0" />
          <span>{formattedLabel}</span>
          {isDemoMode && (
            <span className="ml-0.5 px-1 py-0.2 rounded text-[8px] font-black bg-stone-950/20 text-stone-950 tracking-tighter">
              DEMO
            </span>
          )}
        </button>
        {showAddButton && (
          <button
            type="button"
            onClick={openPurchase}
            title={isDemoMode ? "Demo Mode Info" : "Get Credits (Preview)"}
            className="p-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-400 border-b-2 border-stone-950 active:translate-y-0.5 active:border-b-0 transition-all cursor-pointer"
          >
            {isDemoMode ? <Sparkles className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className={`flex items-center justify-between p-3 rounded-2xl bg-stone-900 border ${isDemoMode ? 'border-amber-500/40' : 'border-stone-800'} text-white ${className}`}>
        <button
          onClick={openLedger}
          className="flex items-center gap-2.5 text-left group"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 group-hover:scale-105 transition-transform">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider">
                {isDemoMode ? 'Demo Credit Balance' : 'Credit Balance'}
              </span>
              {isDemoMode && (
                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  DEMO MODE
                </span>
              )}
            </div>
            <div className="text-sm font-black text-amber-400 font-mono">
              {loading ? '...' : `${creditsBalance} ${isDemoMode ? 'DEMO CREDITS' : 'Credits'}`}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={openLedger}
            title="History"
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors text-xs font-bold flex items-center gap-1"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          {showAddButton && (
            <button
              onClick={openPurchase}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-955 font-black text-xs uppercase tracking-wider transition-colors flex items-center gap-1"
            >
              {isDemoMode ? <Sparkles className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{isDemoMode ? 'Demo' : 'Get'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1 bg-stone-900 border ${isDemoMode ? 'border-amber-500/30' : 'border-stone-800'} rounded-full p-1 ${className}`}>
      <button
        onClick={openLedger}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black text-amber-400 hover:bg-stone-800 transition-colors cursor-pointer"
        title={isDemoMode ? "View Demo Credit History & Controls" : "View Credit History"}
      >
        <Coins className="w-3.5 h-3.5 text-amber-400" />
        <span className="font-mono">{formattedLabel}</span>
        {isDemoMode && (
          <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
            DEMO
          </span>
        )}
      </button>
      {showAddButton && (
        <button
          onClick={openPurchase}
          className="p-1 rounded-full bg-amber-500 hover:bg-amber-400 text-stone-955 transition-colors cursor-pointer"
          title={isDemoMode ? "Demo Mode Info" : "Credit Packages (Preview)"}
        >
          {isDemoMode ? <Sparkles className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
};
