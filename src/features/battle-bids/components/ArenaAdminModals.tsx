import React, { useState } from 'react';
import { ArenaModal } from './shared/ArenaModal';
import { 
  AlertTriangle, 
  ShieldAlert, 
  Octagon, 
  UserX, 
  ShieldOff, 
  Loader2, 
  Clock, 
  FileText 
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { AuctionItem } from '../types';
import { UserProfile } from '../../../types';

// ============================================================================
// 1. ADMIN ISSUE WARNING MODAL
// ============================================================================
export interface AdminWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void> | void;
  item: AuctionItem;
  isLoading?: boolean;
}

export const AdminWarningModal: React.FC<AdminWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  item,
  isLoading = false
}) => {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) {
      setError('A violation note is required before issuing a formal warning.');
      return;
    }
    setError(null);
    onConfirm(trimmed);
  };

  return (
    <ArenaModal
      isOpen={isOpen}
      onClose={() => {
        if (!isLoading) {
          setError(null);
          setNote('');
          onClose();
        }
      }}
      title="Issue Policy Violation Warning"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/60 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-900/60 text-amber-400 shrink-0 mt-0.5 border border-amber-700/50">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white leading-snug">
              Official Seller Warning Notice
            </h4>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Target Listing: <strong className="text-white font-mono">{item.title}</strong>
              <br />
              Seller UID: <strong className="text-stone-300 font-mono">{item.sellerId || (item as any).userId || 'Unknown'}</strong>
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-300">
            Mandatory Violation Note / Reason <span className="text-rose-400">*</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (error && e.target.value.trim()) setError(null);
            }}
            placeholder="State the specific policy violation (e.g. artificial bid shilling, inaccurate product descriptions, off-platform payment solicitations)..."
            rows={4}
            disabled={isLoading}
            className={cn(
              "w-full px-3.5 py-2.5 rounded-xl bg-stone-900/90 border text-xs text-white placeholder-stone-500 focus:outline-none transition-all resize-none",
              error 
                ? "border-rose-500 ring-1 ring-rose-500/50 focus:border-rose-400" 
                : "border-stone-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30"
            )}
          />
          {error && (
            <p className="text-[11px] font-semibold text-rose-400 flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {error}
            </p>
          )}
          <div className="flex justify-between items-center text-[10px] text-stone-500 px-1">
            <span>Minimum 5 characters required</span>
            <span>{note.trim().length} chars</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-800/80">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNote('');
              onClose();
            }}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-stone-850 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || !note.trim()}
            className="px-5 py-2 rounded-xl text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-lg shadow-amber-950/50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sending Notice...</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Send Warning</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ArenaModal>
  );
};

// ============================================================================
// 2. ADMIN FORCE STOP MODAL (IRREVERSIBLE)
// ============================================================================
export interface AdminForceStopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  item: AuctionItem;
  isLoading?: boolean;
}

export const AdminForceStopModal: React.FC<AdminForceStopModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  item,
  isLoading = false
}) => {
  const [reason, setReason] = useState('Violating community policies and auction integrity standards.');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(reason.trim() || 'Violating community policies by seller.');
  };

  return (
    <ArenaModal
      isOpen={isOpen}
      onClose={() => {
        if (!isLoading) onClose();
      }}
      title="Force Stop Combat Auction"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-800/80 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-rose-900/80 text-rose-300 shrink-0 mt-0.5 border border-rose-700/60">
            <Octagon className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-rose-200 leading-snug">
              Permanent Violation Closure
            </h4>
            <p className="text-xs text-rose-300/80 leading-relaxed">
              <strong>CRITICAL WARNING:</strong> Force stopping permanently terminates bidding, cancels all pending negotiations, and locks this auction. 
              <strong className="text-white block mt-1">This action cannot be undone or resumed.</strong>
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-300">
            Violation Reason for Audit Record
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isLoading}
            className="w-full px-3.5 py-2.5 rounded-xl bg-stone-900/90 border border-stone-800 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 transition-all"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-stone-850 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-rose-950/60"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Force Stopping...</span>
              </>
            ) : (
              <>
                <Octagon className="w-3.5 h-3.5" />
                <span>Execute Force Stop</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ArenaModal>
  );
};

// ============================================================================
// 3. ADMIN BLOCK SELLER MODAL
// ============================================================================
export interface AdminBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  targetSellerId: string;
  sellerProfile?: UserProfile | null;
  isLoading?: boolean;
}

export const AdminBlockModal: React.FC<AdminBlockModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetSellerId,
  sellerProfile,
  isLoading = false
}) => {
  const [reason, setReason] = useState('Repeated marketplace policy violations and suspicious bidding activity.');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(reason.trim() || 'Administrative block on policy violation.');
  };

  return (
    <ArenaModal
      isOpen={isOpen}
      onClose={() => {
        if (!isLoading) onClose();
      }}
      title="Block Seller Account"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div className="p-3.5 rounded-2xl bg-orange-950/60 border border-orange-800/80 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-orange-900/80 text-orange-300 shrink-0 mt-0.5 border border-orange-700/60">
            <UserX className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-orange-200 leading-snug">
              Platform-Wide User Restriction
            </h4>
            <p className="text-xs text-orange-200/80 leading-relaxed">
              Seller: <strong className="text-white">{sellerProfile?.name || sellerProfile?.email || targetSellerId}</strong>
              <br />
              Blocking restricts this user from creating new listings, placing bids, making negotiation offers, or participating in chat rooms.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-300">
            Reason for Administrative Block
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isLoading}
            className="w-full px-3.5 py-2.5 rounded-xl bg-stone-900/90 border border-stone-800 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 transition-all"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-stone-850 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-orange-950/60"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Blocking User...</span>
              </>
            ) : (
              <>
                <UserX className="w-3.5 h-3.5" />
                <span>Confirm Block</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ArenaModal>
  );
};

// ============================================================================
// 4. ADMIN BAN USER MODAL
// ============================================================================
export interface AdminBanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (durationDays: number | null, reason: string) => Promise<void> | void;
  targetSellerId: string;
  sellerProfile?: UserProfile | null;
  isLoading?: boolean;
}

export const AdminBanModal: React.FC<AdminBanModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  targetSellerId,
  sellerProfile,
  isLoading = false
}) => {
  const [durationDays, setDurationDays] = useState<number | null>(null); // null = Permanent
  const [reason, setReason] = useState('Severe terms of service breach and auction manipulation.');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(durationDays, reason.trim() || 'Administrative user ban.');
  };

  const durationOptions: { label: string; value: number | null }[] = [
    { label: '7 Days', value: 7 },
    { label: '14 Days', value: 14 },
    { label: '30 Days', value: 30 },
    { label: '90 Days', value: 90 },
    { label: 'Permanent Ban', value: null }
  ];

  return (
    <ArenaModal
      isOpen={isOpen}
      onClose={() => {
        if (!isLoading) onClose();
      }}
      title="Ban User Account"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div className="p-3.5 rounded-2xl bg-purple-950/60 border border-purple-800/80 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-purple-900/80 text-purple-300 shrink-0 mt-0.5 border border-purple-700/60">
            <ShieldOff className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-purple-200 leading-snug">
              Account Suspension & Ban
            </h4>
            <p className="text-xs text-purple-200/80 leading-relaxed">
              Target User: <strong className="text-white font-mono">{sellerProfile?.name || sellerProfile?.email || targetSellerId}</strong>
              <br />
              Banning will revoke all authentication sessions and bar this user from the platform for the chosen duration.
            </p>
          </div>
        </div>

        {/* Duration Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            Ban Duration
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {durationOptions.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setDurationDays(opt.value)}
                disabled={isLoading}
                className={cn(
                  "py-2 px-1 rounded-xl text-xs font-bold border transition-all text-center",
                  durationDays === opt.value
                    ? "bg-purple-600 border-purple-400 text-white shadow-md shadow-purple-900/50"
                    : "bg-stone-900/80 border-stone-800 text-stone-400 hover:text-white hover:border-stone-700"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Violation Reason */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-purple-400" />
            Ban Reason for Audit Record
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isLoading}
            placeholder="Specify reason for ban..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-stone-900/90 border border-stone-800 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all"
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-stone-850 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-purple-950/60"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Executing Ban...</span>
              </>
            ) : (
              <>
                <ShieldOff className="w-3.5 h-3.5" />
                <span>{durationDays ? `Ban for ${durationDays} Days` : 'Permanent Ban'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ArenaModal>
  );
};
