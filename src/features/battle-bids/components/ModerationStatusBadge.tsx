import React, { memo } from 'react';
import { ModerationStatus } from '../types';
import { cn } from '../../../lib/utils';
import { Shield, ShieldAlert, ShieldCheck, ShieldX, EyeOff, Pause, Ban } from 'lucide-react';

interface ModerationStatusBadgeProps {
  status: ModerationStatus | string;
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  [ModerationStatus.ACTIVE]: { label: 'Operational', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: ShieldCheck },
  [ModerationStatus.WARNING_ISSUED]: { label: 'Caution Issued', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: ShieldAlert },
  [ModerationStatus.HIDDEN]: { label: 'Asset Hidden', color: 'bg-stone-500/10 text-stone-400 border-stone-500/20', icon: EyeOff },
  [ModerationStatus.PAUSED]: { label: 'Ops Paused', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Pause },
  [ModerationStatus.SUSPENDED]: { label: 'Suspended', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20', icon: Ban },
  [ModerationStatus.RESTRICTED]: { label: 'Restricted', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', icon: Shield },
  [ModerationStatus.BANNED]: { label: 'Terminated', color: 'bg-rose-600/10 text-rose-600 border-rose-600/20', icon: ShieldX },
  [ModerationStatus.RESTORED]: { label: 'Restored', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: ShieldCheck }
};

export const ModerationStatusBadge = memo(({ status, className }: ModerationStatusBadgeProps) => {
  const config = STATUS_CONFIG[status] || { label: status, color: 'bg-stone-500/10 text-stone-400 border-stone-500/20', icon: Shield };
  const Icon = config.icon;

  return (
    <span className={cn(
      "px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border flex items-center gap-2",
      config.color,
      className
    )}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
});
