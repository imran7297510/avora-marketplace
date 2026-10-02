import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Ban, 
  EyeOff, 
  Eye, 
  Pause, 
  Play, 
  XCircle, 
  MessageSquare, 
  UserX, 
  UserCheck, 
  ChevronDown,
  Lock,
  Unlock,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { ModerationActionType, ReportTargetType } from '../types';
import { ModerationConfirmationDialog } from './ModerationConfirmationDialog';
import { cn } from '../../../lib/utils';

interface ModerationActionMenuProps {
  targetId: string;
  targetType: ReportTargetType;
  onActionComplete?: () => void;
  onExecute: (action: ModerationActionType, reason: string, relatedReportIds: string[]) => Promise<void>;
  relatedReportIds?: string[];
  className?: string;
}

export const ModerationActionMenu: React.FC<ModerationActionMenuProps> = ({
  targetId,
  targetType,
  onActionComplete,
  onExecute,
  relatedReportIds = [],
  className
}) => {
  const [selectedAction, setSelectedAction] = useState<ModerationActionType | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const getActions = (): { action: ModerationActionType; label: string; icon: any; variant: 'danger' | 'warning' | 'info' }[] => {
    const common = [
      { action: ModerationActionType.ISSUE_WARNING, label: 'Issue Warning', icon: ShieldAlert, variant: 'warning' as const },
    ];

    if (targetType === 'listing') {
      return [
        ...common,
        { action: ModerationActionType.HIDE_LISTING, label: 'Hide Listing', icon: EyeOff, variant: 'danger' as const },
        { action: ModerationActionType.RESTORE_LISTING, label: 'Restore Listing', icon: Eye, variant: 'info' as const },
        { action: ModerationActionType.PAUSE_AUCTION, label: 'Pause Auction', icon: Pause, variant: 'warning' as const },
        { action: ModerationActionType.RESUME_AUCTION, label: 'Resume Auction', icon: Play, variant: 'info' as const },
        { action: ModerationActionType.CANCEL_AUCTION, label: 'Cancel Auction', icon: XCircle, variant: 'danger' as const },
      ];
    }

    if (targetType === 'user') {
      return [
        ...common,
        { action: ModerationActionType.STOP_POSTING, label: 'Revoke Posting', icon: EyeOff, variant: 'danger' as const },
        { action: ModerationActionType.RESTORE_POSTING, label: 'Restore Posting', icon: Eye, variant: 'info' as const },
        { action: ModerationActionType.STOP_BIDDING, label: 'Revoke Bidding', icon: Lock, variant: 'danger' as const },
        { action: ModerationActionType.RESTORE_BIDDING, label: 'Restore Bidding', icon: Unlock, variant: 'info' as const },
        { action: ModerationActionType.SUSPEND_ACCOUNT, label: 'Suspend Account', icon: UserX, variant: 'danger' as const },
        { action: ModerationActionType.BAN_ACCOUNT, label: 'Perm Ban', icon: Ban, variant: 'danger' as const },
        { action: ModerationActionType.UNBAN_ACCOUNT, label: 'Unban User', icon: UserCheck, variant: 'info' as const },
      ];
    }

    if (targetType === 'negotiation') {
      return [
        ...common,
        { action: ModerationActionType.RESTRICT_NEGOTIATIONS, label: 'Restrict Ops', icon: Lock, variant: 'danger' as const },
        { action: ModerationActionType.RESTORE_NEGOTIATIONS, label: 'Restore Ops', icon: Unlock, variant: 'info' as const },
      ];
    }

    return common;
  };

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-stone-900 border border-white/5 rounded-xl hover:border-amber-500/50 transition-all text-xs font-black uppercase tracking-widest text-white shadow-lg"
      >
        Tactical Actions <ChevronDown className={cn("w-3 h-3 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-[60]" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 bottom-full mb-3 w-64 bg-stone-900 border border-white/10 rounded-2xl p-2 shadow-2xl z-[70] animate-in fade-in slide-in-from-bottom-2">
            <p className="px-3 py-2 text-xs font-black text-stone-400 uppercase tracking-[0.2em] border-b border-white/5 mb-1">Combat Moderation</p>
            <div className="grid grid-cols-1 gap-1">
              {getActions().map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.action}
                    onClick={() => {
                      setSelectedAction(item.action);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left transition-all group",
                      item.variant === 'danger' ? "hover:bg-rose-500/10 text-stone-400 hover:text-rose-500" :
                      item.variant === 'warning' ? "hover:bg-amber-500/10 text-stone-400 hover:text-amber-500" :
                      "hover:bg-blue-500/10 text-stone-400 hover:text-blue-500"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {selectedAction && (
        <ModerationConfirmationDialog
          isOpen={!!selectedAction}
          onClose={() => setSelectedAction(null)}
          onConfirm={async (reason) => {
            await onExecute(selectedAction, reason, relatedReportIds);
            onActionComplete?.();
          }}
          action={selectedAction}
          targetType={targetType}
          targetId={targetId}
        />
      )}
    </div>
  );
};
