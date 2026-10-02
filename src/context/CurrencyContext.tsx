import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { CurrencyItem, WORLD_CURRENCIES, ALL_CURRENCIES_ITEM, getCurrencyByCode, setGlobalPreferredCurrency, formatPrice } from '../lib/currencies';

interface CurrencyContextType {
  selectedCurrency: CurrencyItem;
  setCurrency: (currency: CurrencyItem | string) => void;
  formatCurrency: (amount: number | undefined | null, overrideCurrencyCodeOrSymbol?: string) => string;
  currencies: CurrencyItem[];
}

const STORAGE_KEY = 'mandi_preferred_currency';

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

function getInitialCurrency(): CurrencyItem {
  if (typeof window === 'undefined') return ALL_CURRENCIES_ITEM;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      if (saved.startsWith('{')) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.code) {
          return getCurrencyByCode(parsed.code);
        }
      } else if (saved.trim() !== '') {
        return getCurrencyByCode(saved);
      }
    }
  } catch (e) {
    console.warn('Error reading preferred currency from localStorage:', e);
  }
  return ALL_CURRENCIES_ITEM;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [selectedCurrency, setSelectedCurrencyState] = useState<CurrencyItem>(getInitialCurrency);

  // Synchronize with global utility default on mount and when changed
  useEffect(() => {
    setGlobalPreferredCurrency(selectedCurrency);
  }, [selectedCurrency]);

  const setCurrency = useCallback((newCurrency: CurrencyItem | string) => {
    const item = typeof newCurrency === 'string' ? getCurrencyByCode(newCurrency) : newCurrency;
    setSelectedCurrencyState(item);
    setGlobalPreferredCurrency(item);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(item));
      window.dispatchEvent(new CustomEvent('mandi_currency_changed', { detail: item }));
    } catch (e) {
      console.warn('Failed to save currency to localStorage:', e);
    }
  }, []);

  // Listen for storage / window events across components and tabs
  useEffect(() => {
    const handleCustomChange = (e: Event) => {
      const customEvent = e as CustomEvent<CurrencyItem>;
      if (customEvent.detail && customEvent.detail.code) {
        setSelectedCurrencyState(customEvent.detail);
        setGlobalPreferredCurrency(customEvent.detail);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const item = e.newValue.startsWith('{') ? JSON.parse(e.newValue) : { code: e.newValue };
          if (item && item.code) {
            const curr = getCurrencyByCode(item.code);
            setSelectedCurrencyState(curr);
            setGlobalPreferredCurrency(curr);
          }
        } catch (err) {
          console.warn(err);
        }
      }
    };

    window.addEventListener('mandi_currency_changed', handleCustomChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('mandi_currency_changed', handleCustomChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const formatCurrency = useCallback((amount: number | undefined | null, overrideCurrencyCodeOrSymbol?: string) => {
    return formatPrice(amount, overrideCurrencyCodeOrSymbol || selectedCurrency.code);
  }, [selectedCurrency]);

  const allAvailableCurrencies = [ALL_CURRENCIES_ITEM, ...WORLD_CURRENCIES];

  return (
    <CurrencyContext.Provider value={{ selectedCurrency, setCurrency, formatCurrency, currencies: allAvailableCurrencies }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextType {
  const context = useContext(CurrencyContext);
  if (!context) {
    const defaultCurr = getCurrencyByCode('ALL');
    return {
      selectedCurrency: defaultCurr,
      setCurrency: (c) => {
        const item = typeof c === 'string' ? getCurrencyByCode(c) : c;
        setGlobalPreferredCurrency(item);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(item));
        } catch {}
      },
      formatCurrency: (amt, override) => formatPrice(amt, override || 'USD'),
      currencies: [ALL_CURRENCIES_ITEM, ...WORLD_CURRENCIES],
    };
  }
  return context;
}
