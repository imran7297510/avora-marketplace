import React from 'react';
import { AuctionItem, AuctionAnalytics } from '../types';
import { BidHistoryChart } from './BidHistoryChart';
import { AuctionStatisticsCard } from './AuctionStatisticsCard';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format } from 'date-fns';
import { Shield, TrendingUp, Zap, Activity, Clock } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface AuctionAnalyticsDashboardProps {
  auction: AuctionItem;
  analytics: AuctionAnalytics;
}

export const AuctionAnalyticsDashboard: React.FC<AuctionAnalyticsDashboardProps> = ({
  auction,
  analytics
}) => {
  // Momentum Gauge Calculation (Visual)
  const momentum = analytics.statistics.momentum;
  const momentumLabel = momentum > 1.2 ? 'ACCELERATING' : momentum < 0.8 ? 'DECELERATING' : 'STABLE';
  const momentumColor = momentum > 1.2 ? 'text-emerald-500' : momentum < 0.8 ? 'text-rose-500' : 'text-amber-500';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Top Stats */}
      <AuctionStatisticsCard analytics={analytics} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Price Chart */}
        <div className="lg:col-span-2 p-8 bg-stone-900 border border-white/5 rounded-[2.5rem] space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-black text-stone-400 uppercase tracking-[0.2em]">Price Progression</p>
              <h4 className="text-xl font-black text-white uppercase italic tracking-tighter">Tactical Value Trend</h4>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-amber-500 rounded-full" />
                <span className="text-xs font-black text-stone-400 uppercase tracking-widest">Market Price</span>
              </div>
              {auction.reservePrice && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="text-xs font-black text-stone-400 uppercase tracking-widest">Reserve</span>
                </div>
              )}
            </div>
          </div>
          
          <BidHistoryChart 
            data={analytics.priceTrends} 
            reservePrice={auction.reservePrice}
            currency={auction.currencySymbol || auction.currency}
            height={350}
          />
        </div>

        {/* Momentum & Velocity Sidebar */}
        <div className="space-y-8">
          {/* Momentum Card */}
          <div className="p-8 bg-stone-900 border border-white/5 rounded-[2.5rem] relative overflow-hidden group">
            <div className="relative z-10 space-y-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-black text-stone-400 uppercase tracking-[0.2em]">Strategic Momentum</p>
                  <h4 className={cn("text-2xl font-black uppercase italic tracking-tighter", momentumColor)}>
                    {momentumLabel}
                  </h4>
                </div>
                <div className="w-12 h-12 bg-stone-950 border border-white/5 rounded-2xl flex items-center justify-center">
                  <TrendingUp className={cn("w-6 h-6", momentumColor)} />
                </div>
              </div>

              <div className="h-2 w-full bg-stone-950 rounded-full overflow-hidden border border-white/5">
                <div 
                  className={cn("h-full transition-all duration-1000", momentumColor.replace('text-', 'bg-'))}
                  style={{ width: `${Math.min(100, momentum * 50)}%` }}
                />
              </div>

              <p className="text-xs font-medium text-stone-400 leading-relaxed uppercase tracking-widest">
                Current engagement velocity is {momentum.toFixed(2)}x compared to the mission average.
              </p>
            </div>
            <Activity className="absolute -bottom-8 -right-8 w-32 h-32 text-white/5 -rotate-12 group-hover:rotate-0 transition-transform duration-700" />
          </div>

          {/* Velocity Card */}
          <div className="p-8 bg-stone-900 border border-white/5 rounded-[2.5rem]">
             <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center text-orange-500">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-black text-stone-400 uppercase tracking-widest">Strike Frequency</p>
                  <p className="text-xs font-black text-white uppercase italic">Engagement Density</p>
                </div>
             </div>

             <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-stone-400 uppercase tracking-widest">Avg Bids / Hour</span>
                  <span className="text-sm font-black text-white italic">{analytics.statistics.bidVelocity.toFixed(1)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-stone-400 uppercase tracking-widest">Current Multiplier</span>
                  <span className="text-sm font-black text-amber-500 italic">x{momentum.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-stone-400 uppercase tracking-widest">Unique Assets</span>
                  <span className="text-sm font-black text-white italic">{analytics.statistics.uniqueBidders} Fighters</span>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
