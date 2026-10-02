import React from 'react';
import { AuctionAnalytics } from '../types';
import { TrendingUp, Users, Activity, Target, Zap, Clock, Gavel, BarChart3 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { formatPrice } from '../../../lib/currencies';

interface AuctionStatisticsCardProps {
  analytics: AuctionAnalytics;
  currencySymbol?: string;
  currency?: string;
  className?: string;
}

export const AuctionStatisticsCard: React.FC<AuctionStatisticsCardProps> = ({ 
  analytics, 
  currencySymbol,
  currency,
  className 
}) => {
  const curr = currencySymbol || currency || (analytics as any)?.currencySymbol || (analytics as any)?.currency;
  const stats = [
    { label: 'Highest Bid', value: formatPrice(analytics.statistics.highestBid, curr), icon: Target, color: 'text-amber-500' },
    { label: 'Average Bid', value: formatPrice(analytics.statistics.averageBid, curr), icon: BarChart3, color: 'text-blue-500' },
    { label: 'Unique Bidders', value: analytics.statistics.uniqueBidders, icon: Users, color: 'text-emerald-500' },
    { label: 'Bid Velocity', value: `${analytics.statistics.bidVelocity.toFixed(1)}/hr`, icon: Zap, color: 'text-orange-500' },
    { label: 'Total Bids', value: analytics.statistics.totalBids, icon: Gavel, color: 'text-rose-500' },
    { label: 'Price Growth', value: `+${analytics.statistics.percentageIncrease.toFixed(1)}%`, icon: TrendingUp, color: 'text-purple-500' },
  ];

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4", className)}>
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <div key={idx} className="p-6 bg-stone-900 border border-white/5 rounded-2xl relative overflow-hidden group hover:border-white/10 transition-all">
            <div className="flex flex-col gap-4">
              <div className={cn("w-10 h-10 bg-stone-950 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", stat.color)}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-black text-stone-600 uppercase tracking-widest">{stat.label}</p>
                <p className="text-sm font-black text-white italic tracking-tight">{stat.value}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
