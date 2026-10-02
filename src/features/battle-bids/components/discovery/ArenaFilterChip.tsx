import React from 'react';
import { X } from 'lucide-react';

interface ArenaFilterChipProps {
  label: string;
  onRemove: () => void;
}

export const ArenaFilterChip: React.FC<ArenaFilterChipProps> = ({ label, onRemove }) => {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-stone-900 border border-white/5 rounded-full group hover:border-rose-500/30 transition-all">
      <span className="text-xs font-black text-stone-400 uppercase tracking-widest group-hover:text-stone-300">
        {label}
      </span>
      <button 
        onClick={onRemove}
        className="p-1 hover:bg-rose-600 rounded-full text-stone-600 hover:text-white transition-all"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};
