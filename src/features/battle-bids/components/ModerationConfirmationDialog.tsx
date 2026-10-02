import React, { useState } from 'react';
import { ArenaModal } from './shared/ArenaModal';
import { ArenaButton } from './ArenaButton';
import { ModerationActionType, ReportTargetType } from '../types';
import { AlertTriangle, ShieldAlert, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface ModerationConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  action: ModerationActionType;
  targetType: ReportTargetType;
  targetId: string;
}

export const ModerationConfirmationDialog: React.FC<ModerationConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  action,
  targetType,
  targetId
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('A strategic justification is required for this action.');
      return;
    }
    
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason);
      setReason('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Mission failed. Tactical error.');
    } finally {
      setSubmitting(false);
    }
  };

  const actionLabels: Record<ModerationActionType, string> = {
    [ModerationActionType.ISSUE_WARNING]: 'Issue Formal Warning',
    [ModerationActionType.HIDE_LISTING]: 'Hide Asset from Floor',
    [ModerationActionType.RESTORE_LISTING]: 'Restore Asset to Floor',
    [ModerationActionType.REMOVE_LISTING]: 'Permanently Decommission Asset',
    [ModerationActionType.PAUSE_AUCTION]: 'Suspend Active Operations',
    [ModerationActionType.RESUME_AUCTION]: 'Resume Suspended Operations',
    [ModerationActionType.CANCEL_AUCTION]: 'Abort Mission (Cancel)',
    [ModerationActionType.STOP_POSTING]: 'Revoke Deployment Rights',
    [ModerationActionType.RESTORE_POSTING]: 'Restore Deployment Rights',
    [ModerationActionType.STOP_BIDDING]: 'Revoke Engagement Rights',
    [ModerationActionType.RESTORE_BIDDING]: 'Restore Engagement Rights',
    [ModerationActionType.RESTRICT_NEGOTIATIONS]: 'Restrict Comms',
    [ModerationActionType.RESTORE_NEGOTIATIONS]: 'Restore Comms',
    [ModerationActionType.SUSPEND_ACCOUNT]: 'Suspend Command Access',
    [ModerationActionType.BAN_ACCOUNT]: 'Permanent Termination',
    [ModerationActionType.UNBAN_ACCOUNT]: 'Restore Command Access'
  };

  return (
    <ArenaModal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="High-Level Command Confirmation"
    >
      <div className="space-y-8 py-4">
        <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-[2rem] flex items-center gap-5">
          <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center text-rose-500">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-rose-400 uppercase tracking-[0.2em] mb-1">Authorization Required</p>
            <p className="text-sm font-black text-white uppercase italic truncate">
              {actionLabels[action] || action}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-4">
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Target ID</p>
            <p className="text-xs font-mono text-stone-600">{targetId}</p>
          </div>
          <div className="flex items-center justify-between px-4">
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Target Type</p>
            <p className="text-xs font-black text-amber-500 uppercase">{targetType}</p>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-black uppercase text-stone-400 tracking-[0.2em] ml-4">Command Justification</h4>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Document the strategic reason for this moderation action..."
            rows={4}
            className="w-full bg-stone-950 border border-white/5 rounded-2xl px-6 py-4 text-white font-medium text-sm placeholder:text-stone-700 focus:border-rose-500/50 outline-none transition-all resize-none shadow-inner"
          />
        </div>

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            <p className="text-xs font-black text-rose-500 uppercase tracking-widest leading-relaxed italic">
              {error}
            </p>
          </div>
        )}

        <div className="flex gap-4">
          <ArenaButton variant="outline" onClick={onClose} className="flex-1">
            Abort
          </ArenaButton>
          <ArenaButton 
            variant="primary" 
            onClick={handleConfirm} 
            disabled={submitting || !reason.trim()}
            className="flex-1 bg-rose-600 text-white border-none shadow-lg shadow-rose-600/20"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Executing...
              </>
            ) : 'Authorize Action'}
          </ArenaButton>
        </div>
      </div>
    </ArenaModal>
  );
};
