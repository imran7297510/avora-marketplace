import React from 'react';
import { PackageOpen, AlertTriangle } from 'lucide-react';

interface ArenaEmptyStateProps {
  title?: string;
  message?: string;
}

export const ArenaEmptyState: React.FC<ArenaEmptyStateProps> = ({ 
  title = "No Active Battles", 
  message = "There are currently no live auctions matching your criteria. Check back later or follow your favorites." 
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-stone-900/30 rounded-[3rem] border border-dashed border-stone-800">
      <div className="w-20 h-20 bg-stone-900 border border-stone-800 rounded-full flex items-center justify-center mx-auto text-stone-400">
        <PackageOpen className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-black uppercase italic text-white">{title}</h3>
      <p className="text-stone-400 max-w-sm mx-auto text-sm font-medium">
        {message}
      </p>
    </div>
  );
};

export const ArenaError: React.FC<{ error: string }> = ({ error }) => {
  return (
    <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex flex-col items-center gap-4 text-center">
      <AlertTriangle className="w-8 h-8 text-rose-500" />
      <div>
        <h4 className="text-rose-500 font-black uppercase italic tracking-wider">System Alert</h4>
        <p className="text-rose-400 text-xs font-medium mt-1">{error}</p>
      </div>
    </div>
  );
};

import { AuctionStatus } from '../../types';
import { getAuctionDisplayStatus } from '../../utils';

export const ArenaStatus: React.FC<{ status: AuctionStatus; endTime?: any }> = ({ status, endTime }) => {
  const displayStatus = getAuctionDisplayStatus({ status, endTime });

  const configs = {
    active: { label: 'Active Auction', color: 'bg-rose-600', dot: 'bg-white animate-pulse' },
    paused: { label: 'Paused', color: 'bg-stone-900 border border-amber-500/30 text-amber-500', dot: 'bg-amber-500 animate-pulse' },
    concluded: { label: 'Concluded', color: 'bg-stone-800', dot: 'bg-stone-500' },
  };

  const config = configs[displayStatus] || configs.concluded;

  return (
    <div className={`px-3 py-1 rounded-full flex items-center gap-2 ${config.color} shadow-lg`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span className={`text-xs font-black uppercase tracking-widest ${displayStatus === 'paused' ? 'text-amber-500' : 'text-white'}`}>
        {config.label}
      </span>
    </div>
  );
};
