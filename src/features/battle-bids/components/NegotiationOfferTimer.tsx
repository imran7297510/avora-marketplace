import React, { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';
import { parseSafeDate } from '../utils/arena';
import { cn } from '../../../lib/utils';

interface NegotiationOfferTimerProps {
  endTime: Date | any;
  status?: string;
  className?: string;
}

export const NegotiationOfferTimer: React.FC<NegotiationOfferTimerProps> = ({ endTime, status, className }) => {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; isEnded: boolean }>({
    days: 0,
    hours: 0,
    minutes: 0,
    isEnded: false,
  });

  useEffect(() => {
    const updateTimer = () => {
      const parsedEnd = parseSafeDate(endTime);
      if (!parsedEnd || isNaN(parsedEnd.getTime()) || status === 'ended' || status === 'concluded' || status === 'sold' || status === 'cancelled' || status === 'expired') {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, isEnded: true });
        return;
      }

      const now = new Date().getTime();
      const diff = parsedEnd.getTime() - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, isEnded: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setTimeLeft({ days, hours, minutes, isEnded: false });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [endTime, status]);

  const isEnded = timeLeft.isEnded || status === 'ended' || status === 'concluded' || status === 'sold' || status === 'cancelled' || status === 'expired';

  const formatUnit = (value: number, unit: string) => `${value} ${unit}${value === 1 ? '' : 's'}`;

  const formattedTime = isEnded 
    ? "0 Days 0 Hours 0 Minutes" 
    : `${formatUnit(timeLeft.days, 'Day')} ${formatUnit(timeLeft.hours, 'Hour')} ${formatUnit(timeLeft.minutes, 'Minute')}`;

  return (
    <div className={cn(
      "p-4 border rounded-2xl flex flex-col gap-2 transition-all",
      isEnded 
        ? "bg-stone-900/60 border-stone-850 text-stone-500" 
        : "bg-stone-900 border-amber-500/30 text-stone-200 shadow-lg shadow-amber-500/5",
      className
    )}>
      {/* Top Row: Wording */}
      <div className="flex items-center gap-2">
        <Timer className={cn("w-4 h-4 shrink-0", isEnded ? "text-stone-600" : "text-amber-500 animate-pulse")} />
        <span className={cn(
          "text-xs font-black uppercase tracking-wider",
          isEnded ? "text-stone-500" : "text-stone-300"
        )}>
          Remaining Time for Sending Offers
        </span>
      </div>
      
      {/* Bottom Row: Highlighted remaining time */}
      <div className={cn(
        "text-base sm:text-lg md:text-xl font-black font-mono tracking-wide uppercase leading-none whitespace-nowrap",
        isEnded ? "text-stone-500" : "text-amber-400 drop-shadow-[0_0_10px_rgba(245,158,11,0.25)]"
      )}>
        {formattedTime}
      </div>
    </div>
  );
};
