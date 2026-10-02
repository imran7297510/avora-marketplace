import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { ArenaCard } from '../../features/battle-bids/components/ArenaCard';
import { Heart, Loader2, Search } from 'lucide-react';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';
import { useWatchlist } from '../../features/battle-bids/hooks/useWatchlist';
import { ArenaService } from '../../features/battle-bids/services/arenaService';
import { AuctionItem } from '../../features/battle-bids/types';
import { ArenaButton } from '../../features/battle-bids/components';
import { useCurrency } from '../../context/CurrencyContext';
import { filterListingsByCurrency } from '../../lib/currencies';

export const ArenaWatchlist: React.FC = () => {
  const navigate = useNavigate();
  const { selectedCurrency } = useCurrency();
  const { watchedIds, loading: watchlistLoading } = useWatchlist();
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWatchedItems = async () => {
      if (watchedIds.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Fetch full details for each watched auction
        const promises = watchedIds.map(id => ArenaService.getAuction(id));
        const results = await Promise.all(promises);
        setItems(results.filter((item): item is AuctionItem => item !== null));
      } catch (err) {
        console.error("Failed to fetch watchlist details", err);
      } finally {
        setLoading(false);
      }
    };

    fetchWatchedItems();
  }, [watchedIds]);

  const filteredItems = filterListingsByCurrency(items, selectedCurrency);

  return (
    <ArenaLayout>
      <div className="space-y-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <ArenaBackButton fallbackPath="/battle-bids" />
          
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-rose-600/10 border border-rose-500/30 rounded-xl flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
              <span className="text-xs font-black uppercase text-rose-500 tracking-widest">
                {filteredItems.length} Assets Tracked
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-black uppercase tracking-tight text-white">Your Arsenal Watchlist</h1>
          <p className="text-stone-400 text-sm font-medium uppercase tracking-widest">Tracking tactical assets in real-time</p>
        </div>

        {/* Content */}
        {loading || watchlistLoading ? (
          <div className="flex flex-col items-center justify-center py-40 text-stone-400 gap-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-rose-600/20 border-t-rose-600 rounded-full animate-spin" />
              <Loader2 className="w-8 h-8 text-rose-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
            </div>
            <p className="text-xs font-black uppercase tracking-[0.4em] animate-pulse">Syncing Surveillance Signal...</p>
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredItems.map((item) => (
              <ArenaCard 
                key={item.id} 
                item={item} 
                onBidClick={(i) => navigate(`/battle-bids?id=${i.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="py-40 text-center space-y-8 max-w-md mx-auto">
            <div className="w-32 h-32 bg-stone-900 rounded-[3rem] flex items-center justify-center text-stone-800 mx-auto border border-white/5 shadow-2xl">
              <Heart className="w-12 h-12" />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black text-white uppercase tracking-tight">Watchlist Empty</h3>
              <p className="text-stone-400 text-sm leading-relaxed font-medium">
                You haven't flagged any assets for surveillance yet. Explore the Arena and build your tracking list.
              </p>
            </div>
            <ArenaButton 
              variant="primary" 
              className="w-full"
              onClick={() => navigate('/battle-bids')}
            >
              <Search className="w-4 h-4" /> Explore the Arena
            </ArenaButton>
          </div>
        )}
      </div>
    </ArenaLayout>
  );
};
