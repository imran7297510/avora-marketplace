import React, { useState } from 'react';
import { Ban, X, ShieldAlert, Clock, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { cn } from '../../../../lib/utils';

interface BanUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName?: string;
  currentBan?: {
    isBanned: boolean;
    bannedUntil?: any;
    bannedDurationDays?: number | null;
    formattedText?: string;
  } | null;
  onConfirmBan: (days: number | null, reason: string) => Promise<void>;
  onConfirmUnban?: () => Promise<void>;
  loading?: boolean;
}

const DURATION_PRESETS: { label: string; days: number | null; description: string }[] = [
  { label: '1 day', days: 1, description: '24 Hours duration' },
  { label: '3 days', days: 3, description: '72 Hours duration' },
  { label: '7 days', days: 7, description: '1 Week duration' },
  { label: '30 days', days: 30, description: '1 Month duration' },
  { label: 'Permanently', days: null, description: 'No expiry date' },
];

export const BanUserModal: React.FC<BanUserModalProps> = ({
  isOpen,
  onClose,
  targetUserId,
  targetUserName,
  currentBan,
  onConfirmBan,
  onConfirmUnban,
  loading = false,
}) => {
  const [selectedDays, setSelectedDays] = useState<number | null>(1);
  const [reason, setReason] = useState('Violation of marketplace policies and code of conduct.');
  const [submitting, setSubmitting] = useState(false);
  const [unbanning, setUnbanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<'none' | 'ban' | 'unban'>('none');

  if (!isOpen) return null;

  const isCurrentlyBanned = Boolean(currentBan?.isBanned);

  const selectedPreset = DURATION_PRESETS.find(p => p.days === selectedDays) || DURATION_PRESETS[0];

  const handleRequestBanConfirmation = () => {
    if (!reason.trim()) {
      setError('Please enter a brief reason for restricting this user.');
      return;
    }
    setError(null);
    setConfirmMode('ban');
  };

  const handleExecuteBan = async () => {
    if (!reason.trim()) {
      setError('Please enter a brief reason for restricting this user.');
      setConfirmMode('none');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirmBan(selectedDays, reason.trim());
      setConfirmMode('none');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to ban user. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestUnbanConfirmation = () => {
    setError(null);
    setConfirmMode('unban');
  };

  const handleExecuteUnban = async () => {
    if (!onConfirmUnban) return;
    setUnbanning(true);
    setError(null);
    try {
      await onConfirmUnban();
      setConfirmMode('none');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to lift ban. Please try again.');
    } finally {
      setUnbanning(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg bg-stone-950 border-t sm:border border-stone-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden text-white my-0 sm:my-auto max-h-[92vh] sm:max-h-[90vh] flex flex-col transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="w-12 h-1.5 bg-stone-700/80 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-stone-850 bg-stone-900/90 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0">
              <Ban className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate">
                Ban User Account
              </h3>
              <p className="text-[10px] sm:text-[11px] text-stone-400 truncate">
                Administrative restriction on trading, bidding & reporting
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800/80 active:bg-stone-800 rounded-xl transition-colors shrink-0 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body - Scrollable */}
        {confirmMode === 'ban' ? (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs max-h-[calc(92vh-130px)] sm:max-h-[calc(90vh-130px)]">
            <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-600/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-rose-300">
                  Confirm Ban Action
                </h4>
                <p className="text-[11px] text-stone-300 mt-1">
                  Are you sure you want to ban <strong className="text-white">{targetUserName || targetUserId}</strong>?
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-stone-900/90 border border-stone-850 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-stone-800">
                <span className="text-stone-400 font-bold uppercase tracking-wider text-[10px]">Target User</span>
                <span className="text-white font-mono font-bold truncate max-w-[200px]">{targetUserName || targetUserId}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-stone-800">
                <span className="text-stone-400 font-bold uppercase tracking-wider text-[10px]">Duration</span>
                <span className="text-rose-400 font-black">{selectedPreset.label} ({selectedPreset.description})</span>
              </div>
              <div className="py-1">
                <span className="text-stone-400 font-bold uppercase tracking-wider text-[10px] block mb-1">Reason</span>
                <p className="text-stone-200 italic bg-stone-950/60 p-2.5 rounded-lg border border-stone-800/80 leading-relaxed text-[11px]">
                  "{reason}"
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] sm:text-[11px] leading-relaxed">
              ⚠️ <strong>Immediate Effect:</strong> This administrative ban immediately revokes posting marketplace items, submitting bids in auctions, making offers in private negotiations, and submitting reports.
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-bold">
                {error}
              </div>
            )}
          </div>
        ) : confirmMode === 'unban' ? (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs max-h-[calc(92vh-130px)] sm:max-h-[calc(90vh-130px)]">
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-600/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-emerald-300">
                  Confirm Unban Action
                </h4>
                <p className="text-[11px] text-stone-300 mt-1">
                  Are you sure you want to unban <strong className="text-white">{targetUserName || targetUserId}</strong> immediately?
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-stone-900/90 border border-stone-850 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-stone-800">
                <span className="text-stone-400 font-bold uppercase tracking-wider text-[10px]">Target User</span>
                <span className="text-white font-mono font-bold truncate max-w-[200px]">{targetUserName || targetUserId}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-stone-800">
                <span className="text-stone-400 font-bold uppercase tracking-wider text-[10px]">Current Status</span>
                <span className="text-rose-400 font-bold">{currentBan?.formattedText || 'Banned'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] sm:text-[11px] leading-relaxed">
              ✨ <strong>Restored Access:</strong> Lifting this ban will immediately restore all marketplace privileges: creating listings, participating in Battle Bids, private negotiations, and submitting reports.
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-bold">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs max-h-[calc(92vh-130px)] sm:max-h-[calc(90vh-130px)]">
            {/* Target Banner */}
            <div className="p-3.5 rounded-xl bg-stone-900/90 border border-stone-850 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Target User</p>
                <p className="text-sm font-black text-amber-400 truncate">{targetUserName || targetUserId}</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[9px] font-mono font-bold bg-rose-500/10 border border-rose-500/30 text-rose-400 uppercase tracking-wider shrink-0">
                ID: {targetUserId.slice(0, 8)}...
              </span>
            </div>

            {/* Current Ban Status Warning if already banned */}
            {isCurrentlyBanned && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-600/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                  <div>
                    <span className="font-bold text-[11px] text-rose-300 block">User is currently banned</span>
                    <span className="text-[10px] text-stone-400">{currentBan?.formattedText || 'Active Ban in Effect'}</span>
                  </div>
                </div>
                {onConfirmUnban && (
                  <button
                    type="button"
                    id="modal-unban-user-btn"
                    onClick={handleRequestUnbanConfirmation}
                    disabled={unbanning || submitting || loading}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-[10px] uppercase tracking-wider transition-all shrink-0 flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {unbanning ? 'Unbanning...' : 'Unban User'}
                  </button>
                )}
              </div>
            )}

            {/* Scope of Restrictions */}
            <div className="p-3.5 rounded-xl bg-stone-900/60 border border-stone-800 space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                Restricted Actions During Ban
              </p>
              <ul className="space-y-1.5 text-[11px] text-stone-300">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span><strong>Post Items:</strong> Blocked from creating listings & auctions</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span><strong>Report:</strong> Blocked from submitting reports on items or users</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span><strong>Submit Bids:</strong> Blocked from bidding in Battle Bids live auctions</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <span><strong>Submit Offers:</strong> Blocked from private negotiations & Battle Bids</span>
                </li>
              </ul>
            </div>

            {/* Ban Period Presets */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                Select Ban Period
              </label>
              <div className="grid grid-cols-2 xs:grid-cols-3 gap-2">
                {DURATION_PRESETS.map((preset) => {
                  const isSelected = selectedDays === preset.days;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setSelectedDays(preset.days)}
                      className={cn(
                        "p-3 rounded-xl border text-left transition-all cursor-pointer min-h-[52px] flex flex-col justify-center",
                        isSelected
                          ? "bg-rose-500/20 border-rose-500 text-white shadow-md shadow-rose-500/15"
                          : "bg-stone-900/60 border-stone-800 hover:border-stone-700 text-stone-300"
                      )}
                    >
                      <span className="font-black text-xs block text-rose-400 capitalize">{preset.label}</span>
                      <span className="text-[9px] text-stone-400 block truncate">{preset.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reason Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                Reason for Ban
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter official reason for banning this user..."
                rows={2}
                className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2.5 text-white font-medium text-xs placeholder:text-stone-600 focus:border-rose-500 outline-none transition-all resize-none"
              />
            </div>

            {/* Warning Banner */}
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[10px] sm:text-[11px] leading-relaxed">
                <strong>Administrative Action:</strong> Setting this ban will immediately restrict the user from posting, reporting, bidding, and making negotiation offers across all marketplace channels.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-bold">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 border-t border-stone-850 bg-stone-900/90 flex flex-col-reverse xs:flex-row items-center justify-between gap-2 shrink-0 pb-6 sm:pb-4">
          {confirmMode === 'ban' ? (
            <>
              <button 
                type="button"
                onClick={() => setConfirmMode('none')}
                disabled={submitting || loading}
                className="w-full xs:flex-1 min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                Back & Edit
              </button>
              <button 
                type="button"
                id="modal-confirm-ban-btn"
                onClick={handleExecuteBan}
                disabled={submitting || loading}
                className="w-full xs:w-auto min-h-[44px] px-6 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black uppercase text-xs tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-rose-600/20 disabled:opacity-50"
              >
                {submitting ? 'Applying Ban...' : 'Yes, Confirm Ban'}
              </button>
            </>
          ) : confirmMode === 'unban' ? (
            <>
              <button 
                type="button"
                onClick={() => setConfirmMode('none')}
                disabled={unbanning || loading}
                className="w-full xs:flex-1 min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                Back
              </button>
              <button 
                type="button"
                id="modal-confirm-unban-btn"
                onClick={handleExecuteUnban}
                disabled={unbanning || loading}
                className="w-full xs:w-auto min-h-[44px] px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black uppercase text-xs tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-600/20 disabled:opacity-50"
              >
                {unbanning ? 'Restoring Access...' : 'Yes, Lift Ban'}
              </button>
            </>
          ) : (
            <>
              <button 
                type="button"
                onClick={onClose}
                disabled={submitting || unbanning || loading}
                className="w-full xs:flex-1 min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="button"
                id="modal-confirm-ban-btn"
                onClick={handleRequestBanConfirmation}
                disabled={submitting || unbanning || loading}
                className="w-full xs:w-auto min-h-[44px] px-6 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black uppercase text-xs tracking-wider rounded-xl transition-all cursor-pointer shadow-lg shadow-rose-600/20 disabled:opacity-50"
              >
                {isCurrentlyBanned ? 'Update Ban Duration' : 'Confirm Ban'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

