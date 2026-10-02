import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Gavel, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Lock, 
  DollarSign, 
  Activity,
  Flame
} from 'lucide-react';
import { ThreeDButton } from '../../../components/ThreeDButton';
import { arenaMetricsService, ArenaMetricsDoc } from '../services/arenaMetricsService';

export const ArenaHero: React.FC = () => {
  const [metrics, setMetrics] = useState<ArenaMetricsDoc>({
    liveBattlesCount: 0,
    liveBidsCount: 0,
    transactions24hCount: 0,
    totalVolumeUSD: 0,
    totalSettledOrdersCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        const data = await arenaMetricsService.getAuthoritativeArenaMetrics();
        if (isMounted) {
          setMetrics(data);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn("[ArenaHero] Could not retrieve authoritative arena stats:", err);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadStats();
    return () => {
      isMounted = false;
    };
  }, []);

  const formatCompactVolume = (volumeUSD: number): string => {
    if (!volumeUSD || volumeUSD <= 0) return '$0';
    if (volumeUSD >= 1_000_000) {
      return `$${(volumeUSD / 1_000_000).toFixed(1)}M`;
    }
    if (volumeUSD >= 1_000) {
      return `$${(volumeUSD / 1_000).toFixed(1)}K`;
    }
    return `$${Math.round(volumeUSD).toLocaleString()}`;
  };

  const statItems = [
    { 
      label: 'Live Battles', 
      value: isLoading ? '...' : metrics.liveBattlesCount.toLocaleString(), 
      icon: Gavel, 
      color: 'text-rose-500' 
    },
    { 
      label: 'Live Bids', 
      value: isLoading ? '...' : metrics.liveBidsCount.toLocaleString(), 
      icon: Flame, 
      color: 'text-amber-500' 
    },
    { 
      label: 'Total Volume', 
      value: isLoading ? '...' : formatCompactVolume(metrics.totalVolumeUSD), 
      icon: DollarSign, 
      color: 'text-emerald-500' 
    },
    { 
      label: '24h Transactions', 
      value: isLoading ? '...' : metrics.transactions24hCount.toLocaleString(), 
      icon: Activity, 
      color: 'text-blue-500' 
    },
  ];

  return (
    <section className="relative pt-8 sm:pt-14 lg:pt-20 pb-6 sm:pb-10 bg-stone-950 overflow-hidden border-b border-stone-900">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 right-0 w-[450px] sm:w-[600px] h-[450px] sm:h-[600px] bg-rose-600/5 rounded-full blur-[100px] sm:blur-[120px] translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[300px] sm:w-[400px] h-[300px] sm:h-[400px] bg-amber-500/5 rounded-full blur-[80px] sm:blur-[100px] -translate-x-1/2 translate-y-1/2 pointer-events-none" />

      <div className="max-w-[1440px] mx-auto px-4 lg:px-8 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-4 sm:space-y-6">
          
          {/* Heading and Description */}
          <div className="space-y-2.5 sm:space-y-4">
            <h2 className="text-2xl sm:text-5xl md:text-6xl lg:text-7xl font-black italic uppercase tracking-tighter leading-none text-white">
              Dominate the <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500">Arena</span>
            </h2>
            <p className="text-stone-400 text-xs sm:text-sm md:text-base font-medium max-w-2xl mx-auto leading-relaxed px-2">
              The ultimate destination for elite collectors. Secure rare vehicles, luxury timepieces, and premium property through real-time competitive bidding.
            </p>
          </div>

          {/* Dynamic Statistics in a Single Row */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-3 max-w-3xl mx-auto">
            {statItems.map((stat) => {
              const Icon = stat.icon;
              return (
                <div 
                  key={stat.label}
                  className="p-2 sm:p-3.5 bg-stone-900/80 border border-stone-800/80 rounded-xl sm:rounded-2xl flex flex-col items-center text-center group hover:border-stone-700 transition-all justify-center"
                >
                  <div className={`p-1 sm:p-2 rounded-lg sm:rounded-xl bg-stone-955 border border-stone-900 group-hover:scale-110 transition-all mb-1 sm:mb-1.5 ${stat.color}`}>
                    <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                  </div>
                  <span className="text-[11px] sm:text-sm md:text-base lg:text-lg font-black text-white font-mono tracking-tight leading-none">
                    {stat.value}
                  </span>
                  <span className="text-[7px] sm:text-[10px] font-black text-stone-400 uppercase tracking-wider mt-1 leading-none truncate w-full">
                    {stat.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Features Row in a Single Responsive Row */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-4 pt-3 sm:pt-4 border-t border-stone-900/60 text-center">
            {[
              { 
                title: 'Privacy First', 
                icon: ShieldCheck, 
                color: 'text-emerald-500',
              },
              { 
                title: 'Direct Access', 
                icon: Zap, 
                color: 'text-amber-500',
              },
              { 
                title: 'Secure Escrow', 
                icon: Lock, 
                color: 'text-blue-500',
              }
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div 
                  key={f.title} 
                  className="p-2 sm:p-3.5 bg-stone-900/60 border border-stone-850 rounded-xl sm:rounded-2xl hover:border-stone-700 transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2.5"
                >
                  <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${f.color}`} />
                  <span className="text-[9px] sm:text-xs md:text-sm font-black text-white uppercase tracking-wider">{f.title}</span>
                </div>
              );
            })}
          </div>

          {/* Highlighted Multi-Color Responsive 3D Action Buttons */}
          <div className="pt-3 sm:pt-6 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full max-w-2xl mx-auto px-2">
            <ThreeDButton
              to="/battle-bids"
              label="Battle Bids Arena"
              subtitle="Live Auctions"
              badge="LIVE"
              icon={Gavel}
              variant="amber"
              size="md"
              fullWidth={false}
              className="w-full sm:w-auto sm:min-w-[210px]"
            />

            <ThreeDButton
              to="/negotiations"
              label="Private Negotiation Hub"
              subtitle="P2P Deals"
              badge="P2P"
              icon={Lock}
              variant="blue"
              size="md"
              fullWidth={false}
              className="w-full sm:w-auto sm:min-w-[220px]"
            />

            <Link 
              to="/why-us"
              className="text-stone-400 hover:text-white transition-colors text-xs sm:text-sm font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:underline py-2 sm:py-0 shrink-0"
            >
              How it Works <ArrowRight className="w-4 h-4 text-amber-400" />
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
};

