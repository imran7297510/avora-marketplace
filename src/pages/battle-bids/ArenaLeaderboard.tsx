import React from 'react';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { Trophy } from 'lucide-react';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';

export const ArenaLeaderboard: React.FC = () => {

  return (
    <ArenaLayout>
      <div className="space-y-10">
        <div className="flex items-center justify-between">
          <ArenaBackButton fallbackPath="/battle-bids" />
        </div>

        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="p-6 bg-stone-900 border border-amber-500/20 rounded-full">
            <Trophy className="w-12 h-12 text-amber-500" />
          </div>
          <h2 className="text-3xl font-black uppercase italic">Arena Leaderboard</h2>
          <p className="text-stone-400 max-w-md">
            Track the top bidders and winners in the Arena. Rankings are updated every hour based on total bid value and successful acquisitions.
          </p>
        </div>
      </div>
    </ArenaLayout>
  );
};
