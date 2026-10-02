import React, { createContext, useContext, useState, ReactNode } from 'react';
import { AuctionItem, ArenaState } from '../types';

interface ArenaContextType extends ArenaState {
  setItems: (items: AuctionItem[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const ArenaContext = createContext<ArenaContextType | undefined>(undefined);

export const ArenaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ArenaState>({
    items: [],
    isLoading: false,
    error: null,
  });

  const setItems = (items: AuctionItem[]) => setState(prev => ({ ...prev, items }));
  const setLoading = (isLoading: boolean) => setState(prev => ({ ...prev, isLoading }));
  const setError = (error: string | null) => setState(prev => ({ ...prev, error }));

  return (
    <ArenaContext.Provider value={{ ...state, setItems, setLoading, setError }}>
      {children}
    </ArenaContext.Provider>
  );
};

export const useArenaContext = () => {
  const context = useContext(ArenaContext);
  if (context === undefined) {
    throw new Error('useArenaContext must be used within an ArenaProvider');
  }
  return context;
};
