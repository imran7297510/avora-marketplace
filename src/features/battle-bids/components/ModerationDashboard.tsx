import React, { useState } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  Users, 
  Box, 
  MessageSquare, 
  Activity, 
  History, 
  TrendingUp,
  Search,
  Filter,
  ChevronRight
} from 'lucide-react';
import { useModeration } from '../hooks/useModeration';
import { useAuditLog } from '../hooks/useAuditLog';
import { ReportQueue } from './ReportQueue';
import { RiskScoreCard } from './RiskScoreCard';
import { AuditTimeline } from './AuditTimeline';
import { cn } from '../../../lib/utils';

type DashboardTab = 'queue' | 'risk' | 'audit';

export const ModerationDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('queue');
  const [filterType, setFilterType] = useState<'all' | 'listing' | 'user' | 'negotiation'>('all');
  const { pendingReports, allReports, riskScores, loading, actionLoading, executeAction, dismissReport } = useModeration();
  const { logs, loading: logsLoading } = useAuditLog();

  const stats = [
    { label: 'Tactical Reports', value: pendingReports.length, icon: ShieldAlert, color: 'text-rose-500' },
    { label: 'High Risk Assets', value: riskScores.filter(r => r.score >= 5).length, icon: TrendingUp, color: 'text-amber-500' },
    { label: 'Moderated Today', value: logs.length, icon: Activity, color: 'text-blue-500' },
  ];

  return (
    <div className="space-y-10 pb-20">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 text-stone-955 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">Arena Command Center</h1>
          </div>
          <p className="text-stone-400 text-xs font-medium uppercase tracking-[0.2em] ml-1">Operational Oversight & Tactical Moderation</p>
        </div>

        <div className="flex gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600 group-focus-within:text-amber-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Search Intel..."
              className="bg-stone-900 border border-white/5 rounded-2xl pl-12 pr-6 py-3 text-xs text-white placeholder:text-stone-700 focus:border-amber-500 outline-none w-64 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="p-8 bg-stone-900 border border-white/5 rounded-[2.5rem] relative overflow-hidden group hover:border-amber-500/20 transition-all">
              <div className="flex items-start justify-between">
                <div className="space-y-4">
                  <p className="text-xs font-black text-stone-400 uppercase tracking-[0.2em]">{stat.label}</p>
                  <p className="text-4xl font-black text-white italic tracking-tighter">{stat.value}</p>
                </div>
                <div className={cn("w-12 h-12 bg-stone-950 border border-white/5 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", stat.color)}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Interface Tabs */}
      <div className="space-y-8">
        <div className="flex items-center gap-1 p-1 bg-stone-900 border border-white/5 rounded-2xl w-fit">
          {(['queue', 'risk', 'audit'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                activeTab === tab 
                  ? "bg-amber-500 text-stone-955 shadow-lg" 
                  : "text-stone-400 hover:text-white"
              )}
            >
              {tab === 'queue' && 'Report Queue'}
              {tab === 'risk' && 'Strategic Risk'}
              {tab === 'audit' && 'Operation Logs'}
              {tab === 'queue' && pendingReports.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-rose-600 text-white rounded-md text-xs">{pendingReports.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'queue' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 gap-4">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-500" /> Pending Intelligence
                </h3>
                <div className="flex items-center gap-2 bg-stone-900 border border-white/5 rounded-xl p-1 overflow-x-auto hide-scrollbar">
                  {['all', 'listing', 'user', 'negotiation'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type as any)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all",
                        filterType === type 
                          ? "bg-amber-500 text-stone-955 shadow-sm" 
                          : "text-stone-400 hover:text-white"
                      )}
                    >
                      {type === 'all' ? 'All Intel' : type + 's'}
                    </button>
                  ))}
                </div>
              </div>
              <ReportQueue 
                reports={pendingReports.filter(r => filterType === 'all' || r.targetType === filterType)} 
                onExecuteAction={executeAction}
                onDismiss={dismissReport}
                loading={loading}
              />
            </div>
          )}

          {activeTab === 'risk' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between px-4">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-500" /> High Risk Target Analysis
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {riskScores.length > 0 ? (
                  riskScores.map((risk) => (
                    <RiskScoreCard key={risk.targetId} risk={risk} />
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center border border-dashed border-stone-800 rounded-[3rem]">
                    <p className="text-xs font-black text-stone-600 uppercase tracking-widest">No Strategic Threats Identified</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between px-4">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-500" /> Operational Audit Trail
                </h3>
              </div>
              <AuditTimeline logs={logs} className="max-w-4xl" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
