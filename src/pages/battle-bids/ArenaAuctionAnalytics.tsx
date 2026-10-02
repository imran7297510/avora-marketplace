import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArenaService } from '../../features/battle-bids/services/arenaService';
import { AuctionItem } from '../../features/battle-bids/types';
import { useAuctionAnalytics } from '../../features/battle-bids/hooks/useAuctionAnalytics';
import { AuctionAnalyticsDashboard } from '../../features/battle-bids/components/AuctionAnalyticsDashboard';
import { ArenaLayout } from '../../features/battle-bids/components';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';
import { ArrowLeft, BarChart3, TrendingUp, Calendar, ShieldCheck, Tag } from 'lucide-react';
import { formatPrice } from '../../lib/currencies';

export const ArenaAuctionAnalytics: React.FC = () => {
  const { auctionId } = useParams<{ auctionId: string }>();
  const navigate = useNavigate();
  const [auction, setAuction] = useState<AuctionItem | null>(null);
  const [loadingAuction, setLoadingAuction] = useState(true);
  const [auctionError, setAuctionError] = useState<string | null>(null);

  useEffect(() => {
    if (!auctionId) {
      setAuctionError('Invalid asset identifier.');
      setLoadingAuction(false);
      return;
    }

    const fetchAuction = async () => {
      try {
        const docRef = doc(db, 'arena_auctions', auctionId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const fetched = ArenaService.mapDocToAuction(docSnap);
          setAuction(fetched);
        } else {
          setAuctionError('Strategic asset could not be located.');
        }
      } catch (err) {
        console.error('Error fetching auction for analytics:', err);
        setAuctionError('Failed to establish contact with the database.');
      } finally {
        setLoadingAuction(false);
      }
    };

    fetchAuction();
  }, [auctionId]);

  const { analytics, loading: loadingAnalytics, error: analyticsError } = useAuctionAnalytics(auction);

  const error = auctionError || analyticsError;
  const isLoading = loadingAuction || loadingAnalytics;

  return (
    <ArenaLayout activeTab="none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Back Navigation */}
        <div className="flex items-center justify-between">
          <ArenaBackButton fallbackPath={`/battle-bids?id=${auctionId || ''}`} />
          
          <div className="flex items-center gap-2 px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full text-[10px] font-black uppercase tracking-widest">
            <TrendingUp className="w-3.5 h-3.5" />
            Intelligence Mode
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="relative">
              <div className="w-12 h-12 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-rose-500 animate-pulse" />
              </div>
            </div>
            <p className="text-stone-400 text-xs font-black uppercase tracking-widest animate-pulse">
              Retrieving Tactical Statistics...
            </p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="bg-stone-900 border border-red-500/20 rounded-3xl p-8 text-center max-w-md mx-auto space-y-4">
            <p className="text-rose-500 font-bold">{error}</p>
            <button
              onClick={() => navigate('/battle-bids')}
              className="px-6 py-2.5 bg-stone-950 hover:bg-stone-850 border border-stone-800 rounded-xl text-white text-xs font-black uppercase tracking-widest transition-all"
            >
              Return to Arena Base
            </button>
          </div>
        )}

        {/* Main Interface */}
        {!isLoading && !error && auction && analytics && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header with Listing Metadata */}
            <div className="bg-stone-900 border border-stone-850 rounded-[2rem] p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl relative overflow-hidden">
              <div className="space-y-4 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-full text-[9px] font-black uppercase tracking-widest">
                    {auction.category}
                  </span>
                  {auction.isPremiumSeller && (
                    <span className="px-2.5 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Premium Asset
                    </span>
                  )}
                </div>
                
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-white italic uppercase tracking-tight line-clamp-2">
                    {auction.title}
                  </h1>
                  <p className="text-stone-400 text-xs font-medium uppercase tracking-widest mt-1">
                    Sold by {auction.sellerName || 'Anonymous Fighter'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-stone-400 text-xs font-bold uppercase tracking-wider pt-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-rose-500" />
                    <span>Started: {new Date(auction.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-rose-500" />
                    <span>Reserve: {auction.reservePrice ? formatPrice(auction.reservePrice, auction.currencySymbol || auction.currency) : 'None'}</span>
                  </div>
                </div>
              </div>

              {/* Current Bid Stat */}
              <div className="bg-stone-950 border border-stone-850 rounded-2xl p-5 md:text-right min-w-[200px] flex flex-col justify-center">
                <span className="text-[10px] text-stone-500 font-black uppercase tracking-widest">Current Valuation</span>
                <span className="text-2xl sm:text-3xl font-black text-rose-500 font-mono mt-1">
                  {formatPrice(auction.currentBid, auction.currencySymbol || auction.currency)}
                </span>
                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-1.5">
                  {analytics.statistics.totalBids} total bids placed
                </span>
              </div>
            </div>

            {/* Dashboard Visualizer components */}
            <div className="bg-stone-950 border border-stone-850 rounded-[2.5rem] p-4 sm:p-8">
              <div className="mb-6 px-1">
                <h2 className="text-xl font-black text-white italic uppercase tracking-tight">Tactical Dashboard</h2>
                <p className="text-stone-500 text-xs font-medium uppercase tracking-widest mt-0.5">
                  Real-time bidding density, frequency, and market momentum analysis.
                </p>
              </div>
              <AuctionAnalyticsDashboard auction={auction} analytics={analytics} />
            </div>
          </div>
        )}
      </div>
    </ArenaLayout>
  );
};
