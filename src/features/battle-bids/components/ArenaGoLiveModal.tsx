import React, { useState } from 'react';
import { ArenaModal } from './shared/ArenaModal';
import { ArenaButton } from './ArenaButton';
import { AuctionItem } from '../types';
import { Play, Clock, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { formatPKR } from '../../../lib/utils';

interface ArenaGoLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  item: AuctionItem | null;
  loading?: boolean;
}

export const ArenaGoLiveModal: React.FC<ArenaGoLiveModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  item,
  loading = false,
}) => {
  const [error, setError] = useState<string | null>(null);

  if (!item) return null;

  const handleConfirmClick = async () => {
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      console.error('[ArenaGoLiveModal] Error going live:', err);
      setError(err?.message || 'Failed to make auction go live. Please try again.');
    }
  };

  return (
    <ArenaModal
      isOpen={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Launch Auction Live"
    >
      <div className="space-y-5 py-2 text-left">
        {/* Item Summary Card */}
        <div className="p-3.5 sm:p-4 bg-stone-950/80 border border-stone-850 rounded-2xl flex items-center gap-3.5">
          {item.images?.[0] ? (
            <img
              src={item.images[0]}
              alt={item.title}
              referrerPolicy="no-referrer"
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-stone-800 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6 text-stone-600" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1">
            <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[9px] font-black uppercase tracking-widest rounded-md inline-flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Upcoming Auction
            </span>
            <h4 className="text-xs sm:text-sm font-black text-white truncate">
              {item.title}
            </h4>
            <p className="text-[11px] font-mono text-amber-400 font-bold">
              Starting Price: {formatPKR(item.startingPrice, item.currencySymbol || item.currency)}
            </p>
          </div>
        </div>

        {/* Question & Confirmation Details */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-2">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-white uppercase tracking-tight">
                Are you sure you want to make this auction go live immediately?
              </h4>
              <p className="text-xs text-stone-300 leading-relaxed">
                By confirming, this item will immediately transition from <strong className="text-blue-400">Upcoming</strong> to <strong className="text-emerald-400">Active Live</strong> status in the Battle Arena, allowing all operatives to place real-time bids immediately.
              </p>
            </div>
          </div>
        </div>

        {/* Error Notice if any */}
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-1/2 py-3 px-4 bg-stone-900 hover:bg-stone-800 text-stone-300 font-black uppercase text-xs tracking-wider rounded-xl border border-stone-800 transition-all cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={loading}
            className="w-full sm:w-1/2 py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black uppercase text-xs tracking-wider rounded-xl border border-blue-400/40 shadow-lg shadow-blue-600/30 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Launching Live...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Yes, Go Live Now</span>
              </>
            )}
          </button>
        </div>
      </div>
    </ArenaModal>
  );
};
