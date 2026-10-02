import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ArrowDownWideNarrow } from 'lucide-react';
import { ArenaSortOption } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../../lib/utils';

interface ArenaSortDropdownProps {
  currentSort: ArenaSortOption;
  onSortChange: (sort: ArenaSortOption) => void;
}

const SORT_OPTIONS: { value: ArenaSortOption; label: string }[] = [
  { value: 'endingSoon', label: 'Ending Soon' },
  { value: 'newest', label: 'Newest Listed' },
  { value: 'highestBid', label: 'Highest Bid' },
  { value: 'lowestPrice', label: 'Lowest Price' },
  { value: 'highestPrice', label: 'Highest Price' },
  { value: 'mostWatched', label: 'Most Popular' },
  { value: 'mostBids', label: 'Most Volatile' },
];

export const ArenaSortDropdown: React.FC<ArenaSortDropdownProps> = ({ currentSort, onSortChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLabel = SORT_OPTIONS.find(o => o.value === currentSort)?.label;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-3 px-6 py-4 bg-stone-900 border rounded-[2rem] transition-all group",
          isOpen ? "border-rose-500 bg-stone-950 shadow-lg shadow-rose-600/20" : "border-white/5 hover:border-white/10"
        )}
      >
        <ArrowDownWideNarrow className={cn("w-4 h-4 transition-colors", isOpen ? "text-rose-500" : "text-stone-400")} />
        <div className="text-left">
          <p className="text-xs font-black text-stone-600 uppercase tracking-widest leading-none mb-1">Sort Intelligence</p>
          <p className="text-xs font-bold text-white leading-none">{currentLabel}</p>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-stone-400 transition-transform duration-300", isOpen ? "rotate-180 text-rose-500" : "")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full right-0 mt-3 w-64 bg-stone-950 border border-stone-800 rounded-3xl overflow-hidden shadow-2xl z-[60]"
          >
            <div className="p-2">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onSortChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full text-left p-4 rounded-2xl flex items-center justify-between group transition-all",
                    currentSort === option.value ? "bg-rose-600 text-white" : "hover:bg-stone-800 text-stone-400 hover:text-white"
                  )}
                >
                  <span className="text-xs font-black uppercase tracking-wider">{option.label}</span>
                  {currentSort === option.value && (
                    <motion.div layoutId="sort-active" className="w-1.5 h-1.5 bg-white rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
