import React from 'react';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { ArenaSectionHeader } from '../../features/battle-bids/components/shared/ArenaSectionHeader';
import { ModerationDashboard } from '../../features/battle-bids/components/ModerationDashboard';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';

export const ArenaModeration: React.FC = () => {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <ArenaLayout>
        <div className="py-20 flex items-center justify-center">
          <div className="w-12 h-12 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </ArenaLayout>
    );
  }

  if (!isAdmin) {
    return (
      <ArenaLayout>
        <div className="py-20 flex items-center justify-center px-6">
          <div className="text-center space-y-6 max-w-md">
            <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-center justify-center mx-auto text-rose-500">
              <ShieldX className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">Access Terminated</h1>
              <p className="text-stone-400 text-sm font-medium uppercase tracking-widest leading-relaxed">
                Tactical Command Center is restricted to authorized High-Level Moderators only. Unauthorized engagement is a violation of Arena protocols.
              </p>
            </div>
            <button 
              onClick={() => window.location.href = '/battle-bids'}
              className="px-8 py-3 bg-stone-900 hover:bg-stone-800 text-white border border-white/5 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
            >
              Return to Frontline
            </button>
          </div>
        </div>
      </ArenaLayout>
    );
  }

  return (
    <ArenaLayout>
      <div className="space-y-10">
        <div className="flex items-center justify-between">
          <ArenaBackButton fallbackPath="/battle-bids" />
        </div>

        <ArenaSectionHeader 
          title="Tactical Command Center" 
          subtitle="Manage reports, risk assessments, and tactical moderation actions across the Battle Bids Arena."
        />
        <div className="mt-10">
          <ModerationDashboard />
        </div>
      </div>
    </ArenaLayout>
  );
};
