import React from 'react';
import { Gavel, MessageSquare } from 'lucide-react';
import { cn } from '../../../lib/utils';

export type ArenaTab = 'bidding' | 'negotiation';

interface ArenaTabsProps {
  activeTab: ArenaTab;
  onTabChange: (tab: ArenaTab) => void;
}

export const ArenaTabs: React.FC<ArenaTabsProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex p-1.5 bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-md mx-auto">
      <button
        onClick={() => onTabChange('bidding')}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
          activeTab === 'bidding' 
            ? "bg-rose-600 text-white shadow-lg" 
            : "text-stone-400 hover:text-stone-300"
        )}
      >
        <Gavel className="w-4 h-4" />
        Bidding Arena
      </button>
      <button
        onClick={() => onTabChange('negotiation')}
        className={cn(
          "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
          activeTab === 'negotiation' 
            ? "bg-stone-800 text-amber-500 shadow-lg border border-amber-500/20" 
            : "text-stone-400 hover:text-stone-300"
        )}
      >
        <MessageSquare className="w-4 h-4" />
        Negotiation Hub
      </button>
    </div>
  );
};
