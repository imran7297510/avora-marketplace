import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../context/AuthContext';
import { CreditTransaction, CreditsContextType } from '../types';
import { CreditsService } from '../services/creditsService';
import { DemoCreditsService } from '../services/demoCreditsService';
import { isDemoCreditModeActive } from '../constants/demoConfig';

const CreditsContext = createContext<CreditsContextType | undefined>(undefined);

export const CreditsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const isDemoMode = isDemoCreditModeActive();

  const [creditsBalance, setCreditsBalance] = useState<number>(0);
  const [totalCreditsPurchased, setTotalCreditsPurchased] = useState<number>(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState<number>(0);
  const [creditsLastUpdatedAt, setCreditsLastUpdatedAt] = useState<any>(null);

  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [isLedgerOpen, setIsLedgerOpen] = useState<boolean>(false);
  const [isPurchaseOpen, setIsPurchaseOpen] = useState<boolean>(false);

  const openLedger = useCallback(() => setIsLedgerOpen(true), []);
  const closeLedger = useCallback(() => setIsLedgerOpen(false), []);
  const openPurchase = useCallback(() => setIsPurchaseOpen(true), []);
  const closePurchase = useCallback(() => setIsPurchaseOpen(false), []);

  // Fetch transactions and balance updates
  const refreshCredits = useCallback(async () => {
    if (!user || user.isAnonymous) {
      setCreditsBalance(0);
      setTotalCreditsPurchased(0);
      setTotalCreditsSpent(0);
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (isDemoMode) {
      try {
        const stats = DemoCreditsService.getDemoStats(user.uid);
        setCreditsBalance(stats.creditsBalance);
        setTotalCreditsPurchased(stats.totalCreditsPurchased);
        setTotalCreditsSpent(stats.totalCreditsSpent);
        setCreditsLastUpdatedAt(stats.creditsLastUpdatedAt);

        const txs = DemoCreditsService.getDemoTransactions(user.uid);
        setTransactions(txs);
        setError(null);
      } catch (err: any) {
        console.error('[CreditsContext:Demo] Error refreshing demo credits:', err);
        setError('Failed to load demo credit state');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Production C3 path
    try {
      const stats = await CreditsService.getUserCreditsBalance(user.uid);
      setCreditsBalance(stats.creditsBalance);
      setTotalCreditsPurchased(stats.totalCreditsPurchased);
      setTotalCreditsSpent(stats.totalCreditsSpent);
      setCreditsLastUpdatedAt(stats.creditsLastUpdatedAt);

      const txs = await CreditsService.getUserTransactions(user.uid);
      setTransactions(txs);
      setError(null);
    } catch (err: any) {
      console.error('[CreditsContext:Production] Error refreshing credits:', err);
      setError('Failed to load credit history');
    } finally {
      setLoading(false);
    }
  }, [user, isDemoMode]);

  // Subscription / sync logic
  useEffect(() => {
    if (!user || user.isAnonymous) {
      setCreditsBalance(0);
      setTotalCreditsPurchased(0);
      setTotalCreditsSpent(0);
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (isDemoMode) {
      // Demo Mode: Local reactive sync
      const syncDemoState = () => {
        const stats = DemoCreditsService.getDemoStats(user.uid);
        setCreditsBalance(stats.creditsBalance);
        setTotalCreditsPurchased(stats.totalCreditsPurchased);
        setTotalCreditsSpent(stats.totalCreditsSpent);
        setCreditsLastUpdatedAt(stats.creditsLastUpdatedAt);
        const txs = DemoCreditsService.getDemoTransactions(user.uid);
        setTransactions(txs);
        setLoading(false);
      };

      syncDemoState();
      const unsubscribe = DemoCreditsService.subscribe(syncDemoState);
      return () => unsubscribe();
    }

    // Production C3 Mode: Realtime Firestore subscription
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setCreditsBalance(data.creditsBalance || 0);
          setTotalCreditsPurchased(data.totalCreditsPurchased || 0);
          setTotalCreditsSpent(data.totalCreditsSpent || 0);
          setCreditsLastUpdatedAt(data.creditsLastUpdatedAt || null);
        } else {
          setCreditsBalance(0);
        }
        setLoading(false);
      },
      (err) => {
        console.error('[CreditsContext:Production] Realtime subscription error:', err);
        setLoading(false);
      }
    );

    // Initial fetch of production transactions
    CreditsService.getUserTransactions(user.uid).then((txs) => {
      setTransactions(txs);
    });

    return () => unsubscribe();
  }, [user, isDemoMode]);

  const requestSimulatedPurchase = useCallback(
    async (packageId: string) => {
      if (!user) {
        return { success: false, message: 'Must be logged in' };
      }
      if (isDemoMode) {
        return {
          success: true,
          message: 'DEMO MODE ACTIVE: Purchasing is disabled. You are operating with isolated Demo Credits for testing.',
        };
      }
      const res = await CreditsService.requestSimulatedCreditPurchase(user.uid, packageId);
      await refreshCredits();
      return res;
    },
    [user, isDemoMode, refreshCredits]
  );

  const resetDemoBalance = useCallback(() => {
    if (user && isDemoMode) {
      DemoCreditsService.resetDemoBalance(user.uid);
    }
  }, [user, isDemoMode]);

  const setDemoBalance = useCallback((amount: number, reason?: string) => {
    if (user && isDemoMode) {
      DemoCreditsService.setDemoBalance(user.uid, amount, reason);
    }
  }, [user, isDemoMode]);

  return (
    <CreditsContext.Provider
      value={{
        creditsBalance,
        totalCreditsPurchased,
        totalCreditsSpent,
        creditsLastUpdatedAt,
        transactions,
        loading,
        error,
        isLedgerOpen,
        isPurchaseOpen,
        isDemoMode,
        openLedger,
        closeLedger,
        openPurchase,
        closePurchase,
        refreshCredits,
        requestSimulatedPurchase,
        resetDemoBalance,
        setDemoBalance,
      }}
    >
      {children}
    </CreditsContext.Provider>
  );
};

export const useCreditsContext = () => {
  const context = useContext(CreditsContext);
  if (!context) {
    throw new Error('useCreditsContext must be used within a CreditsProvider');
  }
  return context;
};
