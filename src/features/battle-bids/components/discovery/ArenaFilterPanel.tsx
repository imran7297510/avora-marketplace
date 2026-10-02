import React from 'react';
import { X, SlidersHorizontal, ChevronRight, Check, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ArenaFilters } from '../../types';
import { ARENA_CATEGORIES } from '../../constants';
import { cn } from '../../../../lib/utils';

interface ArenaFilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: ArenaFilters;
  onFilterChange: (filters: Partial<ArenaFilters>) => void;
  onClear: () => void;
}

export const ArenaFilterPanel: React.FC<ArenaFilterPanelProps> = ({ isOpen, onClose, filters, onFilterChange, onClear }) => {
  const sections = [
    {
      id: 'category',
      label: 'Category',
      options: ['All', ...ARENA_CATEGORIES],
      value: filters.category || 'All'
    },
    {
      id: 'city',
      label: 'Zone / City',
      options: ['All', 'Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata'],
      value: filters.city || 'All'
    },
    {
      id: 'status',
      label: 'Combat Status',
      options: ['active', 'upcoming', 'ended'],
      value: filters.status?.[0] || 'active'
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-stone-950/90 lg:hidden"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-[101] w-full max-w-sm bg-stone-950 border-l border-white/5 shadow-2xl flex flex-col lg:relative lg:translate-x-0 lg:z-0 lg:w-80 lg:bg-transparent lg:border-none lg:shadow-none"
          >
            {/* Header */}
            <div className="p-8 border-b border-white/5 flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-3">
                <SlidersHorizontal className="w-5 h-5 text-rose-500" />
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Tactical Filters</h3>
              </div>
              <button onClick={onClose} className="p-3 bg-stone-900 rounded-2xl text-stone-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-8 space-y-12">
              {/* Reset Section */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-stone-400 uppercase tracking-widest">Global Filters</span>
                <button 
                  onClick={onClear}
                  className="text-xs font-black text-rose-500 uppercase tracking-widest flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>

              {sections.map((section) => (
                <div key={section.id} className="space-y-6">
                  <h4 className="text-xs font-black text-white uppercase tracking-[0.2em]">{section.label}</h4>
                  <div className="flex flex-wrap gap-2">
                    {section.options.map((option) => {
                      const isActive = section.value === option;
                      return (
                        <button
                          key={option}
                          onClick={() => onFilterChange({ [section.id]: option === 'All' ? undefined : (section.id === 'status' ? [option] : option) })}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border",
                            isActive 
                              ? "bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/20" 
                              : "bg-stone-900 border-white/5 text-stone-400 hover:border-white/20 hover:text-stone-300"
                          )}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Price Range */}
              <div className="space-y-6">
                <h4 className="text-xs font-black text-white uppercase tracking-[0.2em]">Price Ordinance</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="Min"
                      value={filters.minPrice || ''}
                      onChange={(e) => onFilterChange({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-stone-900 border border-white/5 rounded-2xl p-4 text-white text-xs font-bold outline-none focus:border-rose-500"
                    />
                  </div>
                  <div className="relative">
                    <input 
                      type="number" 
                      placeholder="Max"
                      value={filters.maxPrice || ''}
                      onChange={(e) => onFilterChange({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-stone-900 border border-white/5 rounded-2xl p-4 text-white text-xs font-bold outline-none focus:border-rose-500"
                    />
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-4">
                {[
                  { id: 'isKycVerified', label: 'KYC Verified Warriors Only' },
                  { id: 'isPremiumSeller', label: 'Elite Premium Sellers' },
                ].map((toggle) => (
                  <button
                    key={toggle.id}
                    onClick={() => onFilterChange({ [toggle.id]: !filters[toggle.id as keyof ArenaFilters] })}
                    className="w-full flex items-center justify-between p-4 bg-stone-900/50 rounded-2xl border border-white/5 group hover:bg-stone-900 transition-all"
                  >
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest group-hover:text-white">{toggle.label}</span>
                    <div className={cn(
                      "w-10 h-6 rounded-full p-1 transition-colors",
                      filters[toggle.id as keyof ArenaFilters] ? "bg-rose-600" : "bg-stone-800"
                    )}>
                      <div className={cn(
                        "w-4 h-4 bg-white rounded-full transition-transform",
                        filters[toggle.id as keyof ArenaFilters] ? "translate-x-4" : "translate-x-0"
                      )} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-white/5 lg:hidden">
              <button 
                onClick={onClose}
                className="w-full py-5 bg-rose-600 text-white rounded-3xl font-black uppercase tracking-[0.2em] shadow-xl shadow-rose-600/20 active:scale-95 transition-all"
              >
                Engage Filters
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
