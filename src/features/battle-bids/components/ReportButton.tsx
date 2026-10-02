import React, { useState } from 'react';
import { Flag } from 'lucide-react';
import { ReportTargetType } from '../types';
import { ReportModal } from './ReportModal';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../context/AuthContext';

export interface ReportButtonProps {
  targetId: string;
  targetType: ReportTargetType;
  targetTitle?: string;
  targetOwnerId?: string;
  variant?: 'ghost' | 'outline' | 'minimal';
  className?: string;
  showText?: boolean;
  label?: string;
}

export const ReportButton: React.FC<ReportButtonProps> = ({
  targetId,
  targetType,
  targetTitle,
  targetOwnerId,
  variant = 'ghost',
  className,
  showText = true,
  label
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  // If the target belongs to the authenticated user, do not render the report button
  const isOwner = Boolean(
    user && targetOwnerId && (
      user.uid === targetOwnerId ||
      (user.uid === 'simulated-seller' && targetOwnerId === 'seller') ||
      (user.uid === 'simulated-buyer' && targetOwnerId === 'buyer') ||
      targetOwnerId === 'me'
    )
  );

  if (isOwner) {
    return null;
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className={cn(
          "flex items-center gap-2 transition-all group",
          variant === 'ghost' && "p-2 hover:bg-stone-800 rounded-xl text-stone-400 hover:text-rose-500",
          variant === 'outline' && "px-4 py-2 border border-white/5 rounded-xl text-xs font-black uppercase text-stone-400 hover:text-rose-500 hover:border-rose-500/30",
          variant === 'minimal' && "text-stone-600 hover:text-rose-500",
          className
        )}
      >
        <Flag className={cn(
          "w-3.5 h-3.5 shrink-0 transition-transform group-hover:scale-110",
          variant === 'minimal' ? "w-3 h-3" : "w-3.5 h-3.5"
        )} />
        {showText && (
          <span className="font-black uppercase tracking-wider text-[9px] truncate">
            {label || "Report"}
          </span>
        )}
      </button>

      <ReportModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        targetId={targetId}
        targetType={targetType}
        targetTitle={targetTitle}
        targetOwnerId={targetOwnerId}
      />
    </>
  );
};
