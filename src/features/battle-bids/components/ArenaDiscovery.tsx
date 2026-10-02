import React, { useState } from 'react';
import { Search, Filter, MapPin, ShieldCheck, Sparkles, Check, RotateCcw } from 'lucide-react';
import { ArenaFilters, ArenaSortOption } from '../types';
import { cn } from '../../../lib/utils';
import { CountrySelector } from '../../../components/CountrySelector';
import { useCurrency } from '../../../context/CurrencyContext';

interface ArenaDiscoveryProps {
  onSearch: (filters: ArenaFilters) => void;
  onClear: () => void;
  onSort?: (sort: ArenaSortOption) => void;
  initialSort?: ArenaSortOption;
  initialFilters?: ArenaFilters;
  isLoading?: boolean;
}

export const ArenaDiscovery: React.FC<ArenaDiscoveryProps> = ({ 
  onSearch, 
  onClear,
  onSort,
  initialSort = 'newest',
  initialFilters = {} as ArenaFilters,
  isLoading 
}) => {
  const { selectedCurrency } = useCurrency();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Local UI State
  const defaultStatuses = initialFilters.status || [];
  const [searchText, setSearchText] = useState(initialFilters.searchQuery || '');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    initialFilters.categories && initialFilters.categories.length > 0 ? initialFilters.categories : ['All']
  );
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(defaultStatuses);
  const [countryFilter, setCountryFilter] = useState(initialFilters.country || '');
  const [cityFilter, setCityFilter] = useState(initialFilters.city || '');
  const [isKycOnly, setIsKycOnly] = useState(initialFilters.isKycVerified || false);
  const [isPremiumOnly, setIsPremiumOnly] = useState(initialFilters.isPremiumSeller || false);
  const [sortBy, setLocalSortBy] = useState<ArenaSortOption>(initialSort);

  // Category Options as requested
  const categoriesList = [
    'All',
    'Trading Cards',
    'Luxury Watches',
    'Historical Artifacts',
    'Sports Memorabilia',
    'Sculptures & Art'
  ];

  // Sequence Priority Options as requested
  const sortOptions: { label: string; value: ArenaSortOption }[] = [
    { label: 'Ending Soonest', value: 'endingSoon' },
    { label: 'Recently Listed', value: 'newest' },
    { label: 'Lowest Current Offer', value: 'lowestPrice' },
    { label: 'Highest Current Offer', value: 'highestPrice' },
    { label: 'Most Tactical Watchers', value: 'mostWatched' },
    { label: 'Most Active Offers', value: 'mostBids' },
  ];

  // Combat Status Options as requested
  const statusOptions = [
    { label: 'All', value: 'all' },
    { label: 'Live', value: 'active' },
    { label: 'Upcoming', value: 'upcoming' },
    { label: 'Concluded', value: 'ended' },
  ];

  const handleToggleCategory = (cat: string) => {
    if (cat === 'All') {
      setSelectedCategories(['All']);
    } else {
      const next = selectedCategories.filter(c => c !== 'All');
      if (next.includes(cat)) {
        const updated = next.filter(c => c !== cat);
        setSelectedCategories(updated.length === 0 ? ['All'] : updated);
      } else {
        setSelectedCategories([...next, cat]);
      }
    }
  };

  const handleToggleStatus = (statusValue: string) => {
    if (statusValue === 'all') {
      setSelectedStatuses([]);
    } else {
      if (selectedStatuses.includes(statusValue)) {
        const updated = selectedStatuses.filter(s => s !== statusValue);
        setSelectedStatuses(updated);
      } else {
        setSelectedStatuses([...selectedStatuses, statusValue]);
      }
    }
  };

  const handleExecuteSearch = () => {
    const filters: ArenaFilters = {
      searchQuery: searchText || undefined,
      categories: selectedCategories.includes('All') ? undefined : selectedCategories,
      status: (selectedStatuses.length === 0 || (selectedStatuses.includes('active') && selectedStatuses.includes('upcoming') && selectedStatuses.includes('ended'))) 
        ? undefined 
        : selectedStatuses as any,
      isKycVerified: isKycOnly || undefined,
      isPremiumSeller: isPremiumOnly || undefined,
      country: countryFilter || undefined,
      city: cityFilter || undefined,
      currencyCode: selectedCurrency?.code || 'ALL',
      isNegotiationOnly: initialFilters.isNegotiationOnly
    };
    onSearch(filters);
    if (onSort) onSort(sortBy);
    setIsExpanded(false);
  };

  const handleReset = () => {
    setSearchText('');
    setSelectedCategories(['All']);
    setSelectedStatuses(defaultStatuses);
    setCountryFilter('');
    setCityFilter('');
    setIsKycOnly(false);
    setIsPremiumOnly(false);
    setLocalSortBy(initialSort);
    setIsExpanded(false);
    onClear();
  };

  return (
    <div className="w-full bg-stone-900 border border-stone-800 rounded-[2rem] p-4 sm:p-6 space-y-4 shadow-xl">
      {/* Row 1: Search Bar in a single row */}
      <div className="w-full relative">
        <input
          type="text"
          placeholder="Write item name..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleExecuteSearch();
            }
          }}
          className="w-full bg-stone-955 border border-stone-800 rounded-xl p-3.5 pl-11 pr-4 text-white font-bold text-sm focus:border-amber-500 outline-none transition-all placeholder:text-stone-600 shadow-inner"
          id="arena-discovery-search-input"
        />
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
      </div>

      {/* Row 2: Control Buttons (Filters, Reset, Search) */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "py-3 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border active:scale-95 cursor-pointer",
            isExpanded 
              ? "bg-amber-500/10 border-amber-500/40 text-amber-500" 
              : "bg-stone-850 text-stone-300 border-stone-800 hover:bg-stone-800 hover:text-white"
          )}
        >
          <Filter className="w-4 h-4" />
          <span>{isExpanded ? 'Hide Filters' : 'Filters'}</span>
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="py-3 px-3 bg-stone-850 hover:bg-stone-800 text-stone-400 border border-stone-800 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Reset</span>
        </button>

        <button
          type="button"
          onClick={handleExecuteSearch}
          disabled={isLoading}
          className="py-3 px-3 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-600 text-stone-955 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border border-amber-500/30 active:scale-95 cursor-pointer shadow-md shadow-amber-500/10"
        >
          {isLoading ? (
            <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-stone-955"></span>
          ) : (
            <Search className="w-4 h-4" />
          )}
          <span>Search</span>
        </button>
      </div>

      {/* Expanded Filter Panel */}
      {isExpanded && (
        <div className="space-y-6 pt-4 border-t border-stone-800/80 animate-in fade-in duration-300">
          
          {/* 1. Categories */}
          <div className="space-y-2">
            <label className="text-xs font-black text-stone-400 uppercase tracking-widest block">
              1. Categories
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categoriesList.map((cat) => {
                const isSelected = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleToggleCategory(cat)}
                    className={cn(
                      "px-3 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all border flex items-center justify-between gap-1 text-left cursor-pointer",
                      isSelected
                        ? "bg-amber-500/10 border-amber-500/50 text-amber-400"
                        : "bg-stone-955 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200"
                    )}
                  >
                    <span className="truncate">{cat}</span>
                    <div className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all",
                      isSelected ? "bg-amber-500 border-amber-500 text-stone-955" : "border-stone-700 bg-stone-900"
                    )}>
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[4px]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Sequence Priority */}
          <div className="space-y-2">
            <label className="text-xs font-black text-stone-400 uppercase tracking-widest block">
              2. Sequence Priority
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sortOptions.map((opt) => {
                const isSelected = sortBy === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLocalSortBy(opt.value)}
                    className={cn(
                      "px-3 py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition-all border text-left cursor-pointer flex items-center justify-between gap-1",
                      isSelected
                        ? "bg-amber-500/10 border-amber-500/50 text-amber-400"
                        : "bg-stone-955 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200"
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Combat Status */}
          <div className="space-y-2">
            <label className="text-xs font-black text-stone-400 uppercase tracking-widest block">
              3. Combat Status
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {statusOptions.map((statusObj) => {
                const isAll = statusObj.value === 'all';
                const isSelected = isAll 
                  ? selectedStatuses.length === 3 || selectedStatuses.length === 0
                  : selectedStatuses.includes(statusObj.value);

                return (
                  <button
                    key={statusObj.value}
                    type="button"
                    onClick={() => handleToggleStatus(statusObj.value)}
                    className={cn(
                      "px-3 py-2.5 rounded-xl border text-xs font-extrabold uppercase tracking-wider transition-all text-center cursor-pointer flex items-center justify-center gap-1.5",
                      isSelected
                        ? "bg-amber-500/10 border-amber-500/50 text-amber-400"
                        : "bg-stone-955 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200"
                    )}
                  >
                    <span>{statusObj.label}</span>
                    {isSelected && <Check className="w-3 h-3 text-amber-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Country */}
          <div className="space-y-2">
            <label className="text-xs font-black text-stone-400 uppercase tracking-widest block">
              4. Country
            </label>
            <CountrySelector 
              value={countryFilter}
              onChange={(val) => setCountryFilter(val)}
              placeholder="All Countries"
            />
          </div>

          {/* 5. Location (City) */}
          <div className="space-y-2">
            <label className="text-xs font-black text-stone-400 uppercase tracking-widest block">
              5. Location (City)
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Enter city..."
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full bg-stone-955 border border-stone-800 rounded-xl p-3 pl-10 text-white font-bold text-xs focus:border-amber-500 outline-none transition-all placeholder:text-stone-600"
              />
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            </div>
          </div>

          {/* 5. Seller Verification */}
          <div className="space-y-2">
            <label className="text-xs font-black text-stone-400 uppercase tracking-widest block">
              5. Seller Verification
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsKycOnly(!isKycOnly)}
                className={cn(
                  "flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-xs font-extrabold uppercase transition-all cursor-pointer",
                  isKycOnly 
                    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                    : "bg-stone-955 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200"
                )}
              >
                <ShieldCheck className={cn("w-4 h-4", isKycOnly ? "text-emerald-400" : "text-stone-500")} />
                <span>KYC Verified</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPremiumOnly(!isPremiumOnly)}
                className={cn(
                  "flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-xs font-extrabold uppercase transition-all cursor-pointer",
                  isPremiumOnly 
                    ? "bg-amber-500/10 border-amber-500/50 text-amber-400" 
                    : "bg-stone-955 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-200"
                )}
              >
                <Sparkles className={cn("w-4 h-4", isPremiumOnly ? "text-amber-400" : "text-stone-500")} />
                <span>Premium Seller</span>
              </button>
            </div>
          </div>

          {/* Apply Button inside Filter Panel */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleExecuteSearch}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-amber-500/10 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              <span>Apply Filters & Search</span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
};
