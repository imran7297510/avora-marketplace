import React from 'react';
import { ReportReason } from '../types';
import { cn } from '../../../lib/utils';
import { AlertTriangle, ShieldAlert, FileWarning, Search, Gavel, UserX, Ghost, Ban, MessageSquare } from 'lucide-react';

interface ReportReasonSelectorProps {
  selectedReason: ReportReason | null;
  onSelect: (reason: ReportReason) => void;
  className?: string;
}

const REASONS_CONFIG: Record<ReportReason, { label: string; icon: any; color: string }> = {
  [ReportReason.FRAUD]: { label: 'Fraudulent Activity', icon: ShieldAlert, color: 'text-rose-500' },
  [ReportReason.SPAM]: { label: 'Spam or Flooding', icon: Ghost, color: 'text-amber-500' },
  [ReportReason.COUNTERFEIT]: { label: 'Counterfeit Item', icon: FileWarning, color: 'text-orange-500' },
  [ReportReason.FAKE_BIDDING]: { label: 'Fake/Shill Bidding', icon: Gavel, color: 'text-rose-600' },
  [ReportReason.PRICE_MANIPULATION]: { label: 'Price Manipulation', icon: Search, color: 'text-blue-500' },
  [ReportReason.HARASSMENT]: { label: 'Harassment', icon: UserX, color: 'text-rose-700' },
  [ReportReason.ILLEGAL_GOODS]: { label: 'Illegal Goods', icon: Ban, color: 'text-stone-900' },
  [ReportReason.MISLEADING]: { label: 'Misleading Listing', icon: AlertTriangle, color: 'text-amber-600' },
  [ReportReason.OTHER]: { label: 'Other Tactical Issue', icon: MessageSquare, color: 'text-stone-400' }
};

export const ReportReasonSelector: React.FC<ReportReasonSelectorProps> = ({
  selectedReason,
  onSelect,
  className
}) => {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3", className)}>
      {(Object.entries(REASONS_CONFIG) as [ReportReason, typeof REASONS_CONFIG[ReportReason]][]).map(([reason, config]) => {
        const Icon = config.icon;
        const isSelected = selectedReason === reason;
        
        return (
          <button
            key={reason}
            onClick={() => onSelect(reason)}
            className={cn(
              "flex items-center gap-3 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all text-left group",
              isSelected 
                ? "bg-stone-900 border-amber-500 shadow-lg shadow-amber-500/10" 
                : "bg-stone-950 border-white/5 hover:border-white/10"
            )}
          >
            <div className={cn(
              "w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center transition-colors shrink-0",
              isSelected ? "bg-amber-500/10" : "bg-stone-900 group-hover:bg-stone-800"
            )}>
              <Icon className={cn("w-4 h-4 sm:w-5 sm:h-5", isSelected ? "text-amber-500" : config.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn(
                "text-[10px] sm:text-xs font-black uppercase tracking-wider mb-0.5 truncate",
                isSelected ? "text-white" : "text-stone-400"
              )}>
                {config.label}
              </p>
              <p className="text-[9px] sm:text-xs font-bold text-stone-600 uppercase tracking-widest">Select Category</p>
            </div>
          </button>
        );
      })}
    </div>
  );
};
