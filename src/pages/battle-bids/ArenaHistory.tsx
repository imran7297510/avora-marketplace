import React from 'react';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { History } from 'lucide-react';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';

export const ArenaHistory: React.FC = () => {

  return (
    <ArenaLayout>
      <div className="space-y-10">
        <div className="flex items-center justify-between">
          <ArenaBackButton fallbackPath="/battle-bids" />
        </div>

        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="p-6 bg-stone-900 border border-rose-500/20 rounded-full">
          <History className="w-12 h-12 text-rose-500" />
        </div>
        <h2 className="text-3xl font-black uppercase italic">My Bid History</h2>
        <p className="text-stone-400 max-w-md">
          Review your active bids, winning history, and outbid alerts. Stay on top of your game to win the most exclusive items.
        </p>
      </div>
      </div>
    </ArenaLayout>
  );
};
