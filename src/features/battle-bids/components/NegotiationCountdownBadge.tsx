import React, { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';
import { parseSafeDate } from '../utils/arena';
import { cn } from '../../../lib/utils';

interface NegotiationCountdownBadgeProps {
  endTime: Date | any;
  status?: string;
  className?: string;
  negotiation?: any;
}

export const NegotiationCountdownBadge: React.FC<NegotiationCountdownBadgeProps> = ({ endTime, status, className, negotiation }) => {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; isEnded: boolean }>({
    days: 0,
    hours: 0,
    minutes: 0,
    isEnded: false,
  });

  useEffect(() => {
    const updateTimer = () => {
      const parsedEnd = parseSafeDate(endTime);
      const parsedNegEnd = negotiation?.expiresAt ? parseSafeDate(negotiation.expiresAt) : null;
      const isNegConcluded = negotiation?.status === 'accepted' || negotiation?.status === 'completed';
      const isNegExpired = negotiation && !isNegConcluded && (
        negotiation.status === 'expired' ||
        (parsedNegEnd && Date.now() > parsedNegEnd.getTime())
      );

      if (
        !parsedEnd || 
        isNaN(parsedEnd.getTime()) || 
        status === 'ended' || 
        status === 'concluded' || 
        status === 'sold' || 
        status === 'cancelled' || 
        status === 'expired' ||
        isNegExpired
      ) {
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
  }, [endTime, status, negotiation]);

  const parsedNegEnd = negotiation?.expiresAt ? parseSafeDate(negotiation.expiresAt) : null;
  const isNegConcluded = negotiation?.status === 'accepted' || negotiation?.status === 'completed';
  const isNegExpired = negotiation && !isNegConcluded && (
    negotiation.status === 'expired' ||
    (parsedNegEnd && Date.now() > parsedNegEnd.getTime())
  );

  const isEnded = timeLeft.isEnded || 
    status === 'ended' || 
    status === 'concluded' || 
    status === 'sold' || 
    status === 'cancelled' || 
    status === 'expired' ||
    isNegExpired;

  if (isEnded) {
    return (
      <span className={cn("text-[10px] font-black uppercase text-rose-500 flex items-center gap-1", className)}>
        <Timer className="w-3 h-3" /> Expired
      </span>
    );
  }

  const dayLabel = timeLeft.days === 1 ? '1 day' : `${timeLeft.days} days`;

  return (
    <div className={cn("flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg", className)}>
      <Timer className="w-3 h-3 text-amber-500 flex-shrink-0 animate-pulse" />
      <span>{dayLabel} {timeLeft.hours} Hours {timeLeft.minutes} Minutes</span>
    </div>
  );
};
