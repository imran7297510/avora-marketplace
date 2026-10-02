import React from 'react';
import { ArenaReport } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ShieldAlert, Clock, ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ReportStatusBadge } from './ReportStatusBadge';

interface ReportHistoryCardProps {
  report: ArenaReport;
  className?: string;
}

export const ReportHistoryCard: React.FC<ReportHistoryCardProps> = ({ 
  report, 
  className 
}) => {
  return (
    <div className={cn(
      "group p-6 bg-stone-900 border border-white/5 rounded-[2rem] hover:border-amber-500/20 transition-all relative overflow-hidden",
      className
    )}>
      <div className="flex items-start gap-5">
        <div className="w-12 h-12 bg-stone-950 border border-white/5 rounded-xl flex items-center justify-center text-rose-500 shadow-inner group-hover:scale-110 transition-transform">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-black text-white uppercase italic tracking-tighter truncate">
                {report.targetType} Report
              </h4>
              <ReportStatusBadge status={report.status} />
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-600 uppercase">
              <Clock className="w-3 h-3" />
              {report.createdAt && !isNaN(report.createdAt.getTime()) 
                ? formatDistanceToNow(report.createdAt, { addSuffix: true }) 
                : 'Pending'}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-black uppercase text-stone-400 tracking-widest mb-1">Violation Category</p>
              <p className="text-xs font-bold text-amber-500 uppercase">{report.reason.replace('_', ' ')}</p>
            </div>
            
            <div>
              <p className="text-xs font-black uppercase text-stone-400 tracking-widest mb-1">Target Identity</p>
              <p className="text-xs font-mono text-stone-400 truncate">{report.targetId}</p>
            </div>

            {report.adminNotes && (
              <div className="p-4 bg-stone-950/50 border border-white/5 rounded-xl">
                <p className="text-xs font-black uppercase text-stone-400 tracking-widest mb-1">Command Briefing</p>
                <p className="text-xs text-stone-400 leading-relaxed italic">"{report.adminNotes}"</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
