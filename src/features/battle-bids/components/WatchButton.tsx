import React from 'react';
import { Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useWatchlist } from '../hooks/useWatchlist';
import { cn } from '../../../lib/utils';

interface WatchButtonProps {
  auctionId: string;
  className?: string;
  showLabel?: boolean;
}

export const WatchButton: React.FC<WatchButtonProps> = ({ 
  auctionId, 
  className,
  showLabel = false 
}) => {
  const { isWatching, toggleWatch } = useWatchlist();
  const active = isWatching(auctionId);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleWatch(auctionId);
  };

  return (
    <button
      onClick={handleToggle}
      className={cn(
        "group relative flex items-center gap-2 px-4 py-2 rounded-xl transition-all active:scale-95",
        active 
          ? "bg-rose-600/10 border border-rose-600/50 text-rose-500" 
          : "bg-stone-900/50 border border-white/5 text-stone-400 hover:text-white hover:border-white/10",
        className
      )}
    >
      <div className="relative">
        <Heart 
          className={cn(
            "w-4 h-4 transition-all duration-300",
            active ? "fill-rose-500" : "group-hover:scale-110"
          )} 
        />
        <AnimatePresence>
          {active && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-rose-500 rounded-full"
            />
          )}
        </AnimatePresence>
      </div>
      {showLabel && (
        <span className="text-xs font-black uppercase tracking-widest">
          {active ? 'Watching' : 'Watch Asset'}
        </span>
      )}
    </button>
  );
};
