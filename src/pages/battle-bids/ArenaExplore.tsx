import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, TrendingUp, Loader2, Database } from 'lucide-react';
import { ArenaLayout, ArenaCard, ArenaDiscovery } from '../../features/battle-bids/components';
import { useDiscovery } from '../../features/battle-bids/hooks/useDiscovery';
import { useCurrency } from '../../context/CurrencyContext';
import { filterListingsByCurrency } from '../../lib/currencies';

export const ArenaExplore: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const typeParam = searchParams.get('type');
  const isNegParam = searchParams.get('isNegotiationOnly');
  const { selectedCurrency } = useCurrency();
  const isNegPath = location.pathname.startsWith('/negotiations');
  const isNeg = isNegPath || typeParam === 'negotiation' || isNegParam === 'true';

  const { 
    items, 
    loading, 
    loadingMore, 
    filters, 
    sortBy, 
    hasMore, 
    setFilters, 
    setSortBy, 
    search,
    loadMore, 
    clearFilters 
  } = useDiscovery({ 
    isNegotiationOnly: isNeg 
  });

  const observer = useRef<IntersectionObserver>();
  const lastItemRef = useCallback((node: HTMLDivElement) => {
    if (loadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    });
    if (node) observer.current.observe(node);
  }, [loadingMore, hasMore, loadMore]);

  const gridItems = filterListingsByCurrency(items, selectedCurrency);

  return (
    <ArenaLayout title={isNeg ? "Explore Private Negotiations" : "Explore Arena"}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 min-h-screen">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button 
              onClick={() => {
                if (isNegPath) {
                  navigate('/negotiations');
                } else if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  navigate('/battle-bids');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-white rounded-xl text-[10px] sm:text-xs font-black uppercase transition-all shadow-md shadow-stone-955/20 border border-stone-850 shrink-0 cursor-pointer active:scale-95"
              id="arena-explore-back-btn"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-lg sm:text-2xl font-black text-white uppercase tracking-tight text-right">
              {filters.isNegotiationOnly || isNeg ? "Explore Private Negotiations" : "Explore Arena"}
            </span>
          </div>

          {/* Unified Discovery Hub */}
          <ArenaDiscovery 
            onSearch={search}
            onClear={clearFilters}
            onSort={setSortBy}
            initialSort={sortBy}
            initialFilters={filters}
            isLoading={loading}
          />

          {/* GRID OF ITEMS */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                {isNeg ? "Private Negotiations Catalog" : "Marketplace Logs"} ({gridItems.length})
              </h3>
            </div>
            
            {gridItems.length > 0 ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
                  {gridItems.map((item, index) => (
                    <div 
                      key={item.id} 
                      ref={index === gridItems.length - 1 ? lastItemRef : null}
                    >
                      <ArenaCard 
                        item={item} 
                        hideMainButton={true}
                        hideAdminActions={true}
                        hideActions={true}
                        onBidClick={(i) => {
                          if (i.isNegotiationOnly || isNeg) {
                            navigate(`/negotiations?item=${i.id}`);
                          } else {
                            navigate(`/battle-bids?id=${i.id}`);
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
                
                {loadingMore && (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  </div>
                )}
              </>
            ) : (
              <div className="py-20 text-center space-y-8 max-w-xl mx-auto border border-white/5 bg-stone-900/10 rounded-[2.5rem] p-10 backdrop-blur-sm">
                <div className="w-24 h-24 bg-stone-955/40 rounded-[2.5rem] flex items-center justify-center text-stone-500 mx-auto border border-white/5">
                  <Database className="w-10 h-10" />
                </div>
                <div className="space-y-3">
                  <p className="text-stone-400 text-sm font-black uppercase tracking-widest leading-relaxed max-w-md mx-auto">
                    No active combat items found matching your filters.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ArenaLayout>
  );
};
