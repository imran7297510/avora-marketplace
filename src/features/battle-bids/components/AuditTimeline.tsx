import React from 'react';
import { ModerationAuditLog } from '../types';
import { format } from 'date-fns';
import { Shield, User, MessageSquare, Clock, FileText } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface AuditTimelineProps {
  logs: ModerationAuditLog[];
  className?: string;
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ logs, className }) => {
  if (logs.length === 0) {
    return (
      <div className={cn("p-12 text-center border border-dashed border-stone-800 rounded-3xl", className)}>
        <Shield className="w-8 h-8 text-stone-800 mx-auto mb-4" />
        <p className="text-xs font-black text-stone-600 uppercase tracking-[0.2em]">No Strategic Audit Records Found</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {logs.map((log, idx) => (
        <div key={log.id} className="relative pl-8 pb-8 group last:pb-0">
          {/* Timeline Line */}
          {idx !== logs.length - 1 && (
            <div className="absolute left-[11px] top-8 bottom-0 w-px bg-stone-800 group-hover:bg-amber-500/30 transition-colors" />
          )}
          
          {/* Timeline Dot */}
          <div className="absolute left-0 top-1.5 w-6 h-6 bg-stone-900 border-2 border-stone-800 rounded-full flex items-center justify-center z-10 group-hover:border-amber-500 transition-colors">
            <div className="w-1.5 h-1.5 bg-stone-600 rounded-full group-hover:bg-amber-500" />
          </div>

          <div className="bg-stone-950 border border-white/5 p-6 rounded-2xl hover:border-white/10 transition-all shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <p className="text-xs font-black text-white uppercase italic tracking-tight">{log.action.replace(/_/g, ' ')}</p>
                <div className="px-2 py-0.5 bg-stone-900 rounded text-xs font-black text-stone-400 uppercase tracking-widest border border-white/5">
                  ID: {log.id.slice(0, 8)}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-600 uppercase">
                <Clock className="w-3 h-3" />
                {log.timestamp && !isNaN(log.timestamp.getTime()) 
                  ? format(log.timestamp, 'MMM d, HH:mm') 
                  : 'Pending'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="w-3 h-3 text-stone-700" />
                  <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Moderator</p>
                </div>
                <p className="text-xs font-mono text-stone-400 pl-5">{log.moderatorId}</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-stone-700" />
                  <p className="text-xs font-black text-stone-400 uppercase tracking-widest">State Change</p>
                </div>
                <div className="flex items-center gap-2 pl-5">
                  <span className="text-xs font-bold text-stone-600 line-through uppercase">{log.previousState}</span>
                  <span className="text-stone-700">→</span>
                  <span className="text-xs font-black text-emerald-500 uppercase">{log.newState}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-stone-900/50 rounded-xl border border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-3 h-3 text-amber-500/50" />
                <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Tactical Justification</p>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed pl-5 italic">"{log.reason}"</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
