import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Check, ChevronDown, X, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCurrency } from '../context/CurrencyContext';
import { CurrencyItem, WORLD_CURRENCIES, ALL_CURRENCIES_ITEM, getCurrencyByCode } from '../lib/currencies';
import { cn } from '../lib/utils';

export interface CurrencySelectorProps {
  value?: string;
  onChange?: (currency: CurrencyItem) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  variant?: 'form' | 'compact' | 'pill' | 'header';
}

/**
 * Reusable Currency Selector Component & Marketplace Filter
 * - Standard UI Format: FLAG + ISO CODE + " — " + FULL CURRENCY NAME
 * - Special Option: 🌐 All Currencies — Worldwide (filter state: "ALL")
 * - Crypto Separation: STRICTLY FIAT ONLY
 */
export function CurrencySelector({
  value: propValue,
  onChange: propOnChange,
  placeholder = "Select Currency",
  className,
  id,
  disabled,
  variant = 'form'
}: CurrencySelectorProps) {
  const { selectedCurrency: globalCurrency, setCurrency: setGlobalCurrency } = useCurrency();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Determine effective selected currency
  const activeCurrency = useMemo(() => {
    if (propValue) {
      return getCurrencyByCode(propValue);
    }
    return globalCurrency;
  }, [propValue, globalCurrency]);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter currencies list (including ALL_CURRENCIES_ITEM at top)
  const fullList = useMemo(() => {
    if (variant === 'form') {
      return WORLD_CURRENCIES;
    }
    return [ALL_CURRENCIES_ITEM, ...WORLD_CURRENCIES];
  }, [variant]);

  const filteredCurrencies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return fullList;
    return fullList.filter(curr => 
      curr.code.toLowerCase().includes(q) ||
      curr.name.toLowerCase().includes(q) ||
      curr.symbol.toLowerCase().includes(q) ||
      (curr.countries && curr.countries.some(c => c.toLowerCase().includes(q)))
    );
  }, [searchQuery, fullList]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 80);
      setActiveIndex(-1);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSelect = (curr: CurrencyItem) => {
    if (propOnChange) {
      propOnChange(curr);
    } else {
      setGlobalCurrency(curr);
    }
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Header / Pill Variant (Used in Navigation Bar / Filters)
  if (variant === 'header' || variant === 'pill') {
    const isAll = activeCurrency.code === 'ALL';

    return (
      <div ref={containerRef} className={cn("relative inline-block font-sans", className)}>
        <button
          id={id}
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(prev => !prev)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-200 border cursor-pointer select-none",
            disabled 
              ? "opacity-50 cursor-not-allowed bg-stone-900 border-stone-800 text-stone-500"
              : "bg-stone-900/90 hover:bg-stone-800 border-stone-700/80 text-amber-400 hover:text-amber-300 shadow-sm hover:border-amber-500/50 hover:shadow-amber-500/10"
          )}
          title="Filter Marketplace by Currency"
        >
          <span className="text-sm shrink-0">{activeCurrency.flag}</span>
          <span className="font-extrabold text-amber-400">
            {isAll ? (
              <>
                <span className="hidden sm:inline">All Currencies — Worldwide</span>
                <span className="sm:hidden">All Currencies</span>
              </>
            ) : (
              <>
                <span>{activeCurrency.code}</span>
                <span className="text-stone-300 font-semibold normal-case hidden md:inline ml-1">
                  — {activeCurrency.name}
                </span>
                <span className="text-[10px] text-stone-400 font-mono hidden sm:inline md:hidden ml-1">
                  ({activeCurrency.symbol})
                </span>
              </>
            )}
          </span>
          <ChevronDown className={cn("w-3.5 h-3.5 text-stone-400 transition-transform duration-200", isOpen && "rotate-180")} />
        </button>

        <AnimatePresence>
          {isOpen && !disabled && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 4, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="fixed sm:absolute right-2 sm:right-0 top-16 sm:top-full mt-1.5 w-[calc(100vw-1rem)] sm:w-88 max-w-sm bg-stone-900 border border-stone-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[300] overflow-hidden flex flex-col text-stone-100"
            >
              <div className="p-3 bg-stone-950/80 border-b border-stone-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-stone-400 uppercase tracking-widest px-1">
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <Globe className="w-3.5 h-3.5 text-amber-400" /> Currency Filter
                  </span>
                  <span className="text-[10px] text-stone-500 font-medium">Auto-filters listings</span>
                </div>

                <div className="relative flex items-center bg-stone-900 border border-stone-800 rounded-xl px-2.5 py-1.5">
                  <Search className="w-3.5 h-3.5 text-stone-400 shrink-0 mr-2" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search JPY, USD, PKR, EUR, AED..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none outline-none text-xs font-bold text-white placeholder-stone-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="p-1 rounded-full hover:bg-stone-800 transition-colors"
                    >
                      <X className="w-3 h-3 text-stone-400" />
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-[280px] overflow-y-auto p-1 divide-y divide-stone-850/50 scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
                {filteredCurrencies.map((curr) => {
                  const isWorldwide = curr === ALL_CURRENCIES_ITEM || (curr.code === 'ALL' && curr.name === ALL_CURRENCIES_ITEM.name);
                  const isSelected = isWorldwide 
                    ? (activeCurrency.code === 'ALL' && (activeCurrency === ALL_CURRENCIES_ITEM || activeCurrency.name === ALL_CURRENCIES_ITEM.name))
                    : (curr.code === activeCurrency.code && curr.name === activeCurrency.name);

                  return (
                    <button
                      key={isWorldwide ? 'ALL_WORLDWIDE' : `${curr.code}_${curr.name}`}
                      type="button"
                      onClick={() => handleSelect(curr)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer",
                        isSelected 
                          ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" 
                          : "text-stone-300 hover:bg-stone-800/80 hover:text-white"
                      )}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-base shrink-0">{curr.flag}</span>
                        {isWorldwide ? (
                          <span className="font-black text-amber-300 tracking-wide">
                            🌐 All Currencies — Worldwide
                          </span>
                        ) : (
                          <span className="truncate font-medium flex items-center gap-1.5">
                            <span className="font-black text-amber-400 font-mono">{curr.code}</span>
                            <span className="text-stone-500">—</span>
                            <span className="truncate font-semibold text-stone-200">{curr.name}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {!isWorldwide && (
                          <span className="text-stone-400 font-mono text-[11px]">({curr.symbol})</span>
                        )}
                        {isSelected && <Check className="w-4 h-4 text-amber-400 ml-1" />}
                      </div>
                    </button>
                  );
                })}

                {filteredCurrencies.length === 0 && (
                  <div className="p-4 text-center text-xs text-stone-500">
                    No currencies found for "{searchQuery}"
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Standard Form / Input Variant (Used in Submit Listing, etc.)
  return (
    <div ref={containerRef} className={cn("relative w-full font-sans", className)}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={cn(
          "w-full border outline-none rounded-xl py-3.5 px-4 text-xs md:text-sm font-bold transition-all shadow-xs flex items-center justify-between text-left cursor-pointer",
          disabled 
            ? "bg-stone-950/60 border-stone-900 text-stone-400 cursor-not-allowed" 
            : "bg-stone-50 border-stone-200 text-stone-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 hover:bg-stone-100/80"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <span className="text-sm shrink-0">{activeCurrency.flag}</span>
          <span className="font-black text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded text-[11px] uppercase tracking-wide font-mono">
            {activeCurrency.code} ({activeCurrency.symbol})
          </span>
          <span className="truncate text-stone-700 hidden sm:inline text-xs font-semibold">
            {activeCurrency.name}
          </span>
        </span>
        <ChevronDown className={cn("w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ml-1", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && !disabled && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 3 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-stone-200 shadow-[0_20px_50px_rgba(0,0,0,0.18)] z-[200] overflow-hidden flex flex-col"
          >
            <div className="p-2 border-b border-stone-100 bg-stone-50/80 flex items-center gap-2 px-3">
              <Search className="w-4 h-4 text-stone-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search ISO code or country (USD, JPY, PKR, EUR)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none outline-none py-1.5 text-xs font-bold text-stone-900 placeholder-stone-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 rounded-full hover:bg-stone-200/60 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-stone-400" />
                </button>
              )}
            </div>

            <div className="max-h-[240px] overflow-y-auto py-1 divide-y divide-stone-50 scrollbar-thin scrollbar-thumb-stone-200 scrollbar-track-transparent">
              {filteredCurrencies.map((curr, index) => {
                const isWorldwide = curr === ALL_CURRENCIES_ITEM || (curr.code === 'ALL' && curr.name === ALL_CURRENCIES_ITEM.name);
                const isSelected = isWorldwide 
                  ? (activeCurrency.code === 'ALL' && (activeCurrency === ALL_CURRENCIES_ITEM || activeCurrency.name === ALL_CURRENCIES_ITEM.name))
                  : (curr.code === activeCurrency.code && curr.name === activeCurrency.name);
                const isActive = activeIndex === index;

                return (
                  <button
                    key={isWorldwide ? 'ALL_WORLDWIDE' : `${curr.code}_${curr.name}`}
                    type="button"
                    onClick={() => handleSelect(curr)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs font-bold transition-colors cursor-pointer",
                      isActive ? "bg-amber-50/80 text-stone-900" : "text-stone-700 hover:bg-stone-50",
                      isSelected && "bg-amber-50"
                    )}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="text-base shrink-0">{curr.flag}</span>
                      <span className="font-black text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded text-[10px] uppercase font-mono">
                        {curr.code}
                      </span>
                      <span className="text-stone-400">—</span>
                      <span className="truncate text-stone-800 font-semibold">{curr.name}</span>
                      <span className="text-stone-400 font-mono text-[11px] ml-auto">({curr.symbol})</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-amber-600 shrink-0 ml-2" />}
                  </button>
                );
              })}

              {filteredCurrencies.length === 0 && (
                <div className="p-4 text-center text-xs text-stone-400 font-medium">
                  No currencies match "{searchQuery}"
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function GlobalCurrencySelector({ className }: { className?: string }) {
  return <CurrencySelector variant="header" className={className} />;
}
