import React from 'react';
import { cn } from '../../../../lib/utils';

interface ArenaTabsProps {
  children: React.ReactNode;
  className?: string;
}

export const ArenaTabs: React.FC<ArenaTabsProps> = ({ children, className }) => {
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none", className)}>
      {children}
    </div>
  );
};

interface ArenaTabProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export const ArenaTab: React.FC<ArenaTabProps> = ({ active, onClick, children }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap border",
        active 
          ? "bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-600/20" 
          : "bg-stone-900 text-stone-400 border-stone-800 hover:text-white hover:border-stone-700"
      )}
    >
      {children}
    </button>
  );
};
