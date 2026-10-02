import React from 'react';
import { NegotiationStatus } from '../types';
import { cn } from '../../../lib/utils';

interface NegotiationStatusBadgeProps {
  status: NegotiationStatus;
  className?: string;
}

const STATUS_CONFIG: Record<NegotiationStatus, { label: string; color: string }> = {
  [NegotiationStatus.OPEN]: { label: 'Initiated', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  [NegotiationStatus.OFFER_SENT]: { label: 'Offer Sent', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  [NegotiationStatus.COUNTER_OFFERED]: { label: 'Counter Proposal', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  [NegotiationStatus.ACCEPTED]: { label: 'Offer Concluded', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  [NegotiationStatus.DECLINED]: { label: 'Declined', color: 'bg-stone-500/10 text-stone-400 border-stone-500/20' },
  [NegotiationStatus.WITHDRAWN]: { label: 'Withdrawn', color: 'bg-stone-500/10 text-stone-400 border-stone-500/20' },
  [NegotiationStatus.CANCELLED]: { label: 'Cancelled', color: 'bg-stone-500/10 text-stone-400 border-stone-500/20' },
  [NegotiationStatus.COMPLETED]: { label: 'Offer Concluded', color: 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' },
  [NegotiationStatus.EXPIRED]: { label: 'Expired', color: 'bg-stone-800 text-stone-400 border-stone-700' }
};

export const NegotiationStatusBadge: React.FC<NegotiationStatusBadgeProps> = ({ status, className }) => {
  const config = STATUS_CONFIG[status] || { label: String(status || 'Active').replace(/_/g, ' '), color: 'bg-stone-800 text-stone-300 border-stone-700' };
  
  return (
    <span className={cn(
      "px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border",
      config.color,
      className
    )}>
      {config.label}
    </span>
  );
};
