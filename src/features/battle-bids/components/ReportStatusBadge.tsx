import React from 'react';
import { ReportStatus } from '../types';
import { cn } from '../../../lib/utils';

interface ReportStatusBadgeProps {
  status: ReportStatus;
  className?: string;
}

const STATUS_CONFIG: Record<ReportStatus, { label: string; color: string }> = {
  [ReportStatus.PENDING]: { label: 'Awaiting Intelligence', color: 'bg-stone-500/10 text-stone-400 border-stone-500/20' },
  [ReportStatus.REVIEWING]: { label: 'Under Command Review', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  [ReportStatus.RESOLVED]: { label: 'Mission Resolved', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  [ReportStatus.DISMISSED]: { label: 'No Violation Found', color: 'bg-stone-800 text-stone-600 border-stone-700' }
};

export const ReportStatusBadge: React.FC<ReportStatusBadgeProps> = ({ status, className }) => {
  const config = STATUS_CONFIG[status];
  
  return (
    <span className={cn(
      "px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border",
      config.color,
      className
    )}>
      {config.label}
    </span>
  );
};
