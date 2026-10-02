import React from 'react';
import { Timer, AlertTriangle, Zap, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isEnded: boolean;
  isUrgent: boolean;
  isPaused?: boolean;
}

interface ArenaLiveCountdownProps {
  timeRemaining: TimeRemaining | null;
  extensionsCount?: number;
  variant?: 'default' | 'single-row';
}

export const ArenaLiveCountdown: React.FC<ArenaLiveCountdownProps> = ({ timeRemaining, extensionsCount, variant = 'default' }) => {
  if (!timeRemaining) return null;

  if (timeRemaining.isEnded) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex items-center justify-center gap-3 text-stone-400">
        <Timer className="w-5 h-5" />
        <span className="font-black uppercase tracking-widest text-xs">Battle Concluded</span>
      </div>
    );
  }

  const isPaused = Boolean(timeRemaining.isPaused);

  const units = [
    { label: variant === 'single-row' ? 'Days' : 'D', value: timeRemaining.days },
    { label: variant === 'single-row' ? 'Hours' : 'H', value: timeRemaining.hours },
    { label: variant === 'single-row' ? 'Minutes' : 'M', value: timeRemaining.minutes },
    { label: variant === 'single-row' ? 'Seconds' : 'S', value: timeRemaining.seconds },
  ];

  if (variant === 'single-row') {
    return (
      <div className={`relative overflow-hidden rounded-2xl sm:rounded-[2rem] border p-4 sm:p-6 transition-all duration-500 text-center ${
        isPaused
          ? 'bg-amber-950/20 border-amber-500/40 shadow-lg shadow-amber-950/20'
          : timeRemaining.isUrgent 
            ? 'bg-rose-950/20 border-rose-500/50 shadow-lg shadow-rose-950/20' 
            : 'bg-stone-950 border-stone-850'
      }`}>
        {/* Paused or Extension Badge */}
        <AnimatePresence>
          {isPaused ? (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="absolute top-0 right-0 px-2.5 py-0.5 sm:px-3 sm:py-1 bg-amber-500 text-stone-955 rounded-bl-xl flex items-center gap-1.5 z-10 font-black uppercase text-[9px] sm:text-[10px] tracking-wider"
            >
              <Pause className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
              <span>Paused by Seller</span>
            </motion.div>
          ) : extensionsCount && extensionsCount > 0 ? (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="absolute top-0 right-0 px-2.5 py-0.5 sm:px-3 sm:py-1 bg-amber-500 rounded-bl-xl flex items-center gap-1.5 z-10"
            >
              <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-stone-955 fill-stone-955" />
              <span className="text-[9px] sm:text-[10px] font-black uppercase text-stone-955">
                {extensionsCount} EXT {extensionsCount === 10 ? '(MAX)' : ''}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Row 1: Time remaining header */}
        <div className="mb-3 sm:mb-4">
          <p className={`text-[11px] sm:text-sm font-black uppercase tracking-wider sm:tracking-[0.2em] ${
            isPaused ? 'text-amber-400' : timeRemaining.isUrgent ? 'text-rose-500 animate-pulse' : 'text-stone-400'
          }`}>
            {isPaused ? 'Time Remaining (Paused)' : 'Time Remaining for Auction'}
          </p>
          {isPaused ? (
            <p className="text-[9px] sm:text-xs font-bold text-amber-500/90 flex items-center justify-center gap-1 mt-0.5 sm:mt-1">
              <Pause className="w-3 h-3" /> Timer paused until resumed by seller
            </p>
          ) : timeRemaining.isUrgent ? (
            <p className="text-[9px] sm:text-xs font-bold text-rose-500 flex items-center justify-center gap-1 mt-0.5 sm:mt-1">
              <AlertTriangle className="w-3 h-3" /> HIGH INTENSITY COMBAT
            </p>
          ) : null}
        </div>

        {/* Row 2: Days, hours, minutes, seconds */}
        <div className="flex items-center justify-center gap-1.5 xs:gap-2.5 sm:gap-6">
          {units.map((unit, idx) => (
            <React.Fragment key={unit.label}>
              <div className="flex flex-col items-center">
                <div className={`w-11 h-11 xs:w-12 xs:h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center font-mono text-base xs:text-lg sm:text-3xl font-black ${
                  isPaused 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                    : timeRemaining.isUrgent 
                      ? 'bg-rose-500/10 text-rose-500' 
                      : 'bg-stone-900 border border-stone-800 text-white'
                }`}>
                  {unit.value.toString().padStart(2, '0')}
                </div>
                <span className="text-[8px] xs:text-[9px] sm:text-[10px] font-black text-stone-500 mt-1 sm:mt-2 tracking-widest uppercase">{unit.label}</span>
              </div>
              {idx < units.length - 1 && (
                <span className={`text-base xs:text-lg sm:text-2xl font-black mb-4 sm:mb-5 ${
                  isPaused ? 'text-amber-500/40' : timeRemaining.isUrgent ? 'text-rose-500/30' : 'text-stone-800'
                }`}>:</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl border transition-all duration-500 ${
      isPaused
        ? 'bg-amber-950/20 border-amber-500/40 shadow-lg shadow-amber-950/20'
        : timeRemaining.isUrgent 
          ? 'bg-rose-950/20 border-rose-500/50 shadow-lg shadow-rose-950/20' 
          : 'bg-stone-900 border-stone-800'
    }`}>
      {/* Extension or Paused Badge */}
      <AnimatePresence>
        {isPaused ? (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute top-0 right-0 px-2.5 py-0.5 sm:px-3 sm:py-1 bg-amber-500 text-stone-955 rounded-bl-xl flex items-center gap-1 z-10 text-[9px] sm:text-xs font-black uppercase tracking-wider"
          >
            <Pause className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
            <span>Paused</span>
          </motion.div>
        ) : extensionsCount && extensionsCount > 0 ? (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute top-0 right-0 px-2.5 py-0.5 sm:px-3 sm:py-1 bg-amber-500 rounded-bl-xl flex items-center gap-1 z-10"
          >
            <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-stone-950 fill-stone-950" />
            <span className="text-[9px] sm:text-xs font-black uppercase text-stone-950">
              {extensionsCount} EXT {extensionsCount === 10 ? '(MAX)' : ''}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="p-3 sm:p-4 flex flex-col xs:flex-row items-center justify-between gap-2.5 sm:gap-4">
        <div className="flex items-center gap-2 shrink-0 self-center xs:self-auto">
          <div className={`p-1.5 sm:p-2 rounded-xl ${
            isPaused ? 'bg-amber-500/20 text-amber-400' : timeRemaining.isUrgent ? 'bg-rose-500 text-white animate-pulse' : 'bg-stone-800 text-stone-400'
          }`}>
            {isPaused ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" /> : <Timer className="w-4 h-4 sm:w-5 sm:h-5" />}
          </div>
          <div>
            <p className={`text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest ${
              isPaused ? 'text-amber-400' : timeRemaining.isUrgent ? 'text-rose-500' : 'text-stone-400'
            }`}>
              {isPaused ? 'Time Remaining (Paused)' : 'Time Remaining'}
            </p>
            {isPaused ? (
              <p className="text-[9px] sm:text-xs font-bold text-amber-500/80 flex items-center gap-1">
                Timer frozen
              </p>
            ) : timeRemaining.isUrgent ? (
              <p className="text-[9px] sm:text-xs font-bold text-rose-500 flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> HIGH INTENSITY
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-center gap-1 sm:gap-2 shrink-0 w-full xs:w-auto">
          {units.map((unit, idx) => (
            <React.Fragment key={unit.label}>
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center font-mono text-xs sm:text-base font-black ${
                  isPaused 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                    : timeRemaining.isUrgent 
                      ? 'bg-rose-500/10 text-rose-500' 
                      : 'bg-stone-800 text-white'
                }`}>
                  {unit.value.toString().padStart(2, '0')}
                </div>
                <span className="text-[8px] sm:text-[10px] font-black text-stone-500 mt-1 uppercase tracking-wider">{unit.label}</span>
              </div>
              {idx < units.length - 1 && (
                <span className={`text-xs sm:text-lg font-black mb-3.5 sm:mb-4 ${
                  isPaused ? 'text-amber-500/40' : timeRemaining.isUrgent ? 'text-rose-500/30' : 'text-stone-700'
                }`}>:</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
