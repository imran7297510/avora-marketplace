import React from 'react';
import { ArenaModal } from './shared/ArenaModal';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface ArenaConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export const ArenaConfirmationDialog: React.FC<ArenaConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning',
  isLoading = false
}) => {
  if (!isOpen) return null;

  return (
    <ArenaModal
      isOpen={isOpen}
      onClose={() => {
        if (!isLoading) {
          onClose();
        }
      }}
      title={title}
      maxWidth="max-w-md"
    >
      <div className="space-y-5 pt-1">
        <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-stone-950/60 border border-stone-800/80">
          <div className={cn(
            "p-2 rounded-xl shrink-0 mt-0.5",
            variant === 'danger' ? "bg-rose-950/80 text-rose-400 border border-rose-800/50" :
            variant === 'warning' ? "bg-amber-950/80 text-amber-400 border border-amber-800/50" :
            "bg-sky-950/80 text-sky-400 border border-sky-800/50"
          )}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white leading-snug">{title}</h4>
            <p className="text-xs text-stone-400 leading-relaxed">{description}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-800/60">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-stone-400 hover:text-white bg-stone-950 hover:bg-stone-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all disabled:opacity-50 cursor-pointer",
              variant === 'danger'
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40"
                : variant === 'warning'
                ? "bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-amber-900/40"
                : "bg-sky-600 hover:bg-sky-500 text-white shadow-sky-900/40"
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </button>
        </div>
      </div>
    </ArenaModal>
  );
};
