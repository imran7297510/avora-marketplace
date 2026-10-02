import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Negotiation, NegotiationOffer, NegotiationStatus } from '../types';
import { NegotiationService } from '../services/negotiationService';
import { useAuth } from '../../../context/AuthContext';
import { query, collection, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

export interface LiveNegotiationData {
  negotiation: Negotiation | null;
  offers: NegotiationOffer[];
  loading: boolean;
  totalUsedForAuction: number;
}

interface NegotiationContextType {
  getLiveNegotiation: (negId: string) => LiveNegotiationData;
  subscribeToNegotiation: (negId: string) => () => void;
  sendCounter: (negId: string, amount: number, message?: string, overrideUserId?: string) => Promise<void>;
  respond: (negId: string, action: 'accept' | 'decline' | 'withdraw' | 'cancel', overrideUserId?: string, message?: string) => Promise<void>;
  complete: (negId: string, overrideUserId?: string) => Promise<void>;
  sendMessage: (negId: string, message: string, overrideUserId?: string) => Promise<void>;
  deleteOffer: (negId: string, offerId: string) => Promise<void>;
  requestContactInfo: (negId: string, overrideUserId?: string) => Promise<void>;
  shareContactInfo: (negId: string, details: any, overrideUserId?: string) => Promise<void>;
}

const NegotiationContext = createContext<NegotiationContextType | undefined>(undefined);

export const NegotiationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [cache, setCache] = useState<Record<string, LiveNegotiationData>>({});
  const [listeners, setListeners] = useState<Record<string, { refCount: number; unsubscribeNeg: () => void; unsubscribeOffers: () => void; unsubscribeTotal: () => void }>>({});

  const getLiveNegotiation = useCallback((negId: string): LiveNegotiationData => {
    return cache[negId] || {
      negotiation: null,
      offers: [],
      loading: true,
      totalUsedForAuction: 0
    };
  }, [cache]);

  const subscribeToNegotiation = useCallback((negId: string) => {
    if (!negId) return () => {};

    setListeners(prev => {
      const current = prev[negId];
      if (current) {
        // Increment reference count if already subscribed
        return {
          ...prev,
          [negId]: { ...current, refCount: current.refCount + 1 }
        };
      }

      // Initialize state in cache if not present
      setCache(prevCache => {
        if (prevCache[negId]) return prevCache;
        return {
          ...prevCache,
          [negId]: {
            negotiation: null,
            offers: [],
            loading: true,
            totalUsedForAuction: 0
          }
        };
      });

      // Start actual Firestore subscriptions
      const unsubscribeNeg = NegotiationService.subscribeToNegotiation(negId, (neg) => {
        setCache(prevCache => {
          const existing = prevCache[negId] || { negotiation: null, offers: [], loading: true, totalUsedForAuction: 0 };
          return {
            ...prevCache,
            [negId]: { ...existing, negotiation: neg }
          };
        });
      });

      const unsubscribeOffers = NegotiationService.subscribeToOffers(negId, (offers) => {
        setCache(prevCache => {
          const existing = prevCache[negId] || { negotiation: null, offers: [], loading: true, totalUsedForAuction: 0 };
          return {
            ...prevCache,
            [negId]: { ...existing, offers, loading: false }
          };
        });
      });

      // Also listen to total used offers count for the auction in this context to keep it globally synced
      let unsubscribeTotal = () => {};
      
      // Fetch initial data to get IDs for the total count query
      const checkAndSubscribeTotal = (currentData: any) => {
        if (currentData?.buyerId && currentData?.auctionId) {
          const q = query(
            collection(db, 'arena_negotiations'),
            where('auctionId', '==', currentData.auctionId),
            where('buyerId', '==', currentData.buyerId)
          );
          unsubscribeTotal = onSnapshot(q, (snap) => {
            let total = 0;
            snap.docs.forEach(docSnap => {
              total += (docSnap.data().offerCount || 0);
            });
            setCache(prevCache => {
              const existing = prevCache[negId] || { negotiation: null, offers: [], loading: true, totalUsedForAuction: 0 };
              return {
                ...prevCache,
                [negId]: { ...existing, totalUsedForAuction: total }
              };
            });
          }, (err) => console.error("Error fetching total offers in context:", err));
        }
      };

      // Since we don't have the negotiation object immediately, we can subscribe to it and set up the second onSnapshot when it loads
      let tempUnsub: (() => void) | null = null;
      let hasUnsubscribed = false;
      tempUnsub = NegotiationService.subscribeToNegotiation(negId, (neg) => {
        if (neg?.buyerId && neg?.auctionId) {
          if (tempUnsub) {
            tempUnsub();
            tempUnsub = null;
          } else {
            hasUnsubscribed = true;
          }
          checkAndSubscribeTotal(neg);
        }
      });
      if (hasUnsubscribed && tempUnsub) {
        tempUnsub();
        tempUnsub = null;
      }

      return {
        ...prev,
        [negId]: {
          refCount: 1,
          unsubscribeNeg,
          unsubscribeOffers,
          unsubscribeTotal: () => {
            if (tempUnsub) {
              tempUnsub();
            }
            unsubscribeTotal();
          }
        }
      };
    });

    // Return the clean unsubscribe function
    return () => {
      setListeners(prev => {
        const current = prev[negId];
        if (!current) return prev;

        const updatedRefCount = current.refCount - 1;
        if (updatedRefCount > 0) {
          return {
            ...prev,
            [negId]: { ...current, refCount: updatedRefCount }
          };
        }

        // Clean up completely if no components are active
        current.unsubscribeNeg();
        current.unsubscribeOffers();
        current.unsubscribeTotal();

        const copy = { ...prev };
        delete copy[negId];
        return copy;
      });
    };
  }, []);

  // Actions wrapped with context
  const sendCounter = useCallback(async (negId: string, amount: number, message?: string, overrideUserId?: string) => {
    const targetUserId = overrideUserId || user?.uid;
    if (!targetUserId) {
      throw new Error('Authentication required: You must be logged in to send an offer.');
    }
    try {
      await NegotiationService.sendCounterOffer(negId, targetUserId, amount, message);
    } catch (err: any) {
      console.error('Failed to submit offer:', err);
      alert(err.message || 'Failed to submit offer');
      throw err;
    }
  }, [user]);

  const respond = useCallback(async (negId: string, action: 'accept' | 'decline' | 'withdraw' | 'cancel', overrideUserId?: string, message?: string) => {
    const targetUserId = overrideUserId || user?.uid;
    if (!targetUserId) {
      throw new Error('Authentication required: You must be logged in to respond to an offer.');
    }
    await NegotiationService.respondToOffer(negId, targetUserId, action, message);
  }, [user]);

  const complete = useCallback(async (negId: string, overrideUserId?: string) => {
    const targetUserId = overrideUserId || user?.uid;
    if (!targetUserId) {
      throw new Error('Authentication required: You must be logged in to complete a deal.');
    }
    await NegotiationService.completeDeal(negId, targetUserId);
  }, [user]);

  const sendMessage = useCallback(async (negId: string, message: string, overrideUserId?: string) => {
    const targetUserId = overrideUserId || user?.uid;
    if (!targetUserId) return;
    await NegotiationService.sendMessage(negId, targetUserId, message);
  }, [user]);

  const deleteOffer = useCallback(async (negId: string, offerId: string) => {
    await NegotiationService.deleteOffer(negId, offerId);
  }, []);

  const requestContactInfo = useCallback(async (negId: string, overrideUserId?: string) => {
    const targetUserId = overrideUserId || user?.uid;
    if (!targetUserId) return;
    await NegotiationService.requestContactInfo(negId, targetUserId);
  }, [user]);

  const shareContactInfo = useCallback(async (negId: string, details: any, overrideUserId?: string) => {
    const targetUserId = overrideUserId || user?.uid;
    if (!targetUserId) return;
    await NegotiationService.shareContactInfo(negId, targetUserId, details);
  }, [user]);

  const value = React.useMemo(() => ({
    getLiveNegotiation,
    subscribeToNegotiation,
    sendCounter,
    respond,
    complete,
    sendMessage,
    deleteOffer,
    requestContactInfo,
    shareContactInfo
  }), [
    getLiveNegotiation,
    subscribeToNegotiation,
    sendCounter,
    respond,
    complete,
    sendMessage,
    deleteOffer,
    requestContactInfo,
    shareContactInfo
  ]);

  return (
    <NegotiationContext.Provider value={value}>
      {children}
    </NegotiationContext.Provider>
  );
};

export const useNegotiationContext = () => {
  const context = useContext(NegotiationContext);
  if (context === undefined) {
    throw new Error('useNegotiationContext must be used within a NegotiationProvider');
  }
  return context;
};
