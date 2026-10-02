import React, { useState } from 'react';
import { ArenaReport, ReportReason, ReportStatus } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ShieldAlert, ExternalLink, MessageSquare, Trash2, CheckCircle, Clock } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ReportStatusBadge } from './ReportStatusBadge';
import { ModerationActionMenu } from './ModerationActionMenu';
import { ArenaButton } from './ArenaButton';

interface ReportQueueProps {
  reports: ArenaReport[];
  onExecuteAction: any;
  onDismiss: (reportId: string, notes: string) => Promise<void>;
  loading?: boolean;
}

export const ReportQueue: React.FC<ReportQueueProps> = ({ 
  reports, 
  onExecuteAction, 
  onDismiss,
  loading 
}) => {
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissNotes, setDismissNotes] = useState('');

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Scanning Report Frequency...</p>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="py-20 text-center border border-dashed border-stone-800 rounded-[3rem] bg-stone-900/20">
        <CheckCircle className="w-12 h-12 text-emerald-500/20 mx-auto mb-4" />
        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">No Violations Detected</h3>
        <p className="text-stone-600 text-xs font-bold uppercase tracking-widest">All sectors are operational and secure.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {reports.map((report) => (
        <div 
          key={report.id} 
          className="group bg-stone-900 border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-amber-500/20 transition-all shadow-xl"
        >
          <div className="p-8">
            <div className="flex flex-col lg:flex-row lg:items-start gap-8">
              {/* Left Column: Icon & Meta */}
              <div className="flex-shrink-0">
                <div className="w-16 h-16 bg-stone-950 border border-white/5 rounded-2xl flex items-center justify-center text-rose-500 shadow-inner group-hover:scale-110 transition-transform">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <div className="mt-4 flex flex-col items-center gap-1">
                  <ReportStatusBadge status={report.status} />
                </div>
              </div>

              {/* Middle Column: Report Intel */}
              <div className="flex-1 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-black text-stone-400 uppercase tracking-[0.2em]">Intel Source: {report.reporterId.slice(0, 8)}</p>
                    <h4 className="text-xl font-black text-white uppercase italic tracking-tighter">
                      {report.reason.replace(/_/g, ' ')}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-stone-600 uppercase">
                    <Clock className="w-4 h-4" />
                    {report.createdAt && !isNaN(report.createdAt.getTime()) 
                      ? formatDistanceToNow(report.createdAt, { addSuffix: true }) 
                      : 'Pending'}
                  </div>
                </div>

                <div className="p-6 bg-stone-950/50 rounded-2xl border border-white/5 italic text-sm text-stone-400 leading-relaxed shadow-inner">
                  "{report.description}"
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Target Asset</p>
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1 bg-stone-800 rounded text-xs font-mono text-stone-400">
                        {report.targetType.toUpperCase()}: {report.targetId}
                      </div>
                      <a 
                        href={report.targetType === 'listing' ? `/battle-bids?id=${report.targetId}` : report.targetType === 'negotiation' ? `/negotiations/timeline/${report.targetId}` : '#'} 
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-500 hover:text-amber-400 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Actions */}
              <div className="flex flex-col gap-3 lg:w-64">
                <ModerationActionMenu
                  targetId={report.targetId}
                  targetType={report.targetType}
                  relatedReportIds={[report.id]}
                  onExecute={onExecuteAction}
                  className="w-full"
                />
                
                {dismissingId === report.id ? (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                    <textarea
                      value={dismissNotes}
                      onChange={(e) => setDismissNotes(e.target.value)}
                      placeholder="Dismissal justification..."
                      className="w-full bg-stone-950 border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:border-amber-500 outline-none"
                    />
                    <div className="flex gap-2">
                      <ArenaButton 
                        variant="primary" 
                        size="sm" 
                        className="flex-1 text-xs"
                        onClick={() => {
                          onDismiss(report.id, dismissNotes);
                          setDismissingId(null);
                          setDismissNotes('');
                        }}
                      >
                        Confirm Dismiss
                      </ArenaButton>
                      <ArenaButton variant="outline" size="sm" className="px-3" onClick={() => setDismissingId(null)}>
                        Cancel
                      </ArenaButton>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => setDismissingId(report.id)}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-transparent hover:bg-stone-800 text-xs font-black uppercase tracking-widest text-stone-400 hover:text-white rounded-xl transition-all border border-transparent hover:border-white/5"
                  >
                    <Trash2 className="w-3 h-3" /> Dismiss Report
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
