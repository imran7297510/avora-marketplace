import React from 'react';
import { RiskScore } from '../types';
import { AlertTriangle, TrendingUp, Clock, Target } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface RiskScoreCardProps {
  risk: RiskScore;
  className?: string;
}

export const RiskScoreCard: React.FC<RiskScoreCardProps> = ({ risk, className }) => {
  const getRiskLevel = (score: number) => {
    if (score >= 10) return { label: 'CRITICAL', color: 'text-rose-600', bg: 'bg-rose-600/10', border: 'border-rose-600/20' };
    if (score >= 5) return { label: 'HIGH', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' };
    if (score >= 2) return { label: 'ELEVATED', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    return { label: 'LOW', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
  };

  const level = getRiskLevel(risk.score);

  return (
    <div className={cn(
      "p-6 bg-stone-900 border border-white/5 rounded-[2rem] space-y-6 overflow-hidden relative group",
      className
    )}>
      {/* Risk Background Glow */}
      <div className={cn(
        "absolute -top-12 -right-12 w-32 h-32 blur-[64px] rounded-full opacity-20 transition-all duration-700 group-hover:scale-150",
        level.bg.replace('/10', '')
      )} />

      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-1">
          <p className="text-xs font-black text-stone-400 uppercase tracking-[0.2em]">Strategic Risk Profile</p>
          <div className="flex items-center gap-3">
            <h4 className="text-2xl font-black text-white uppercase italic tracking-tighter">{risk.targetType}</h4>
            <div className={cn("px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border", level.color, level.bg, level.border)}>
              {level.label}
            </div>
          </div>
        </div>
        <div className="w-12 h-12 bg-stone-950 border border-white/5 rounded-2xl flex items-center justify-center">
          <AlertTriangle className={cn("w-6 h-6", level.color)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 relative z-10">
        <div className="p-4 bg-stone-950 border border-white/5 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3 h-3 text-stone-400" />
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Risk Score</p>
          </div>
          <p className="text-xl font-black text-white">{risk.score.toFixed(1)}</p>
        </div>
        <div className="p-4 bg-stone-950 border border-white/5 rounded-2xl">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3 h-3 text-stone-400" />
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Last Intel</p>
          </div>
          <p className="text-xs font-bold text-white uppercase">
            {risk.lastReportedAt && !isNaN(risk.lastReportedAt.getTime()) 
              ? formatDistanceToNow(risk.lastReportedAt, { addSuffix: true }) 
              : 'Unknown'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 relative z-10">
        <Target className="w-4 h-4 text-stone-700" />
        <p className="text-xs font-mono text-stone-600 truncate flex-1">{risk.targetId}</p>
      </div>
    </div>
  );
};
