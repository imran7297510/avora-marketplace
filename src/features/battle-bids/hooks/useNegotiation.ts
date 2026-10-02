import { useEffect, useCallback, useMemo, useState } from 'react';
import { Negotiation, NegotiationOffer } from '../types';
import { NegotiationService } from '../services/negotiationService';
import { useAuth } from '../../../context/AuthContext';
import { useNegotiationContext } from '../context/NegotiationContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

export function useNegotiation(negId?: string) {
  const { user } = useAuth();
  const context = useNegotiationContext();

  const { subscribeToNegotiation } = context;

  useEffect(() => {
    if (!negId) return;
    const unsubscribe = subscribeToNegotiation(negId);
    return () => {
      unsubscribe();
    };
  }, [negId, subscribeToNegotiation]);

  const state = useMemo(() => {
    if (!negId) {
      return {
        negotiation: null,
        offers: [],
        loading: true,
        totalUsedForAuction: 0
      };
    }
    return context.getLiveNegotiation(negId);
  }, [negId, context]);

  // Authoritative private ownership resolution for Private Negotiation listings
  const [isPrivateSeller, setIsPrivateSeller] = useState<boolean | null>(null);
  const auctionId = state.negotiation?.auctionId;

  useEffect(() => {
    let isMounted = true;
    if (!user?.uid || !auctionId) {
      setIsPrivateSeller(false);
      return;
    }

    if (state.negotiation?.sellerId === user.uid) {
      setIsPrivateSeller(true);
      return;
    }

    if (
      state.negotiation?.sellerId &&
      !state.negotiation.sellerId.startsWith('anon_seller_') &&
      state.negotiation.sellerId !== 'seller' &&
      state.negotiation.sellerId !== 'simulated-seller'
    ) {
      setIsPrivateSeller(false);
      return;
    }

    // Query authoritative private/seller document
    getDoc(doc(db, 'arena_auctions', auctionId, 'private', 'seller'))
      .then((snap) => {
        if (isMounted) {
          setIsPrivateSeller(snap.exists() && snap.data()?.sellerUid === user.uid);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsPrivateSeller(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user?.uid, auctionId, state.negotiation?.sellerId]);

  const sendCounter = useCallback(async (amount: number, message?: string, overrideUserId?: string) => {
    const activeNegId = state.negotiation?.id || negId;
    if (!activeNegId) return;
    await context.sendCounter(activeNegId, amount, message, overrideUserId);
  }, [negId, state.negotiation?.id, context]);

  const respond = useCallback(async (action: 'accept' | 'decline' | 'withdraw' | 'cancel', overrideUserId?: string, message?: string) => {
    const activeNegId = state.negotiation?.id || negId;
    if (!activeNegId) return;
    await context.respond(activeNegId, action, overrideUserId, message);
  }, [negId, state.negotiation?.id, context]);

  const complete = useCallback(async (overrideUserId?: string) => {
    const activeNegId = state.negotiation?.id || negId;
    if (!activeNegId) return;
    await context.complete(activeNegId, overrideUserId);
  }, [negId, state.negotiation?.id, context]);

  const start = useCallback(async (auctionId: string, initialOffer: number, message?: string) => {
    if (!user) return;
    return await NegotiationService.startNegotiation(user.uid, auctionId, initialOffer, message);
  }, [user]);

  const sendMessage = useCallback(async (message: string, overrideUserId?: string) => {
    const activeNegId = state.negotiation?.id || negId;
    if (!activeNegId) return;
    await context.sendMessage(activeNegId, message, overrideUserId);
  }, [negId, state.negotiation?.id, context]);

  const deleteOffer = useCallback(async (offerId: string) => {
    const activeNegId = state.negotiation?.id || negId;
    if (!activeNegId) return;
    await context.deleteOffer(activeNegId, offerId);
  }, [negId, state.negotiation?.id, context]);

  const submitAppeal = useCallback(async (auctionId: string, message: string) => {
    if (!user) return;
    await NegotiationService.submitAppeal(auctionId, user.uid, message);
  }, [user]);

  const requestContactInfo = useCallback(async (overrideUserId?: string) => {
    const activeNegId = state.negotiation?.id || negId;
    if (!activeNegId) return;
    await context.requestContactInfo(activeNegId, overrideUserId);
  }, [negId, state.negotiation?.id, context]);

  const shareContactInfo = useCallback(async (details: { name?: string; phone?: string; email?: string; address?: string }, overrideUserId?: string) => {
    const activeNegId = state.negotiation?.id || negId;
    if (!activeNegId) return;
    await context.shareContactInfo(activeNegId, details, overrideUserId);
  }, [negId, state.negotiation?.id, context]);

  const isSeller = useMemo(() => {
    if (!user) return false;
    if (isPrivateSeller === true) return true;
    return user.uid === state.negotiation?.sellerId || state.negotiation?.sellerId === 'simulated-seller' || state.negotiation?.sellerId === 'seller';
  }, [user, isPrivateSeller, state.negotiation?.sellerId]);

  const isBuyer = useMemo(() => {
    if (!user) return true; // Default to buyer for guest
    if (isSeller) return false; // Sellers can NEVER be buyers for their own listed items!
    return user.uid === state.negotiation?.buyerId || state.negotiation?.buyerId === 'simulated-buyer' || state.negotiation?.buyerId === 'buyer' || (!!state.negotiation?.buyerId && user.uid !== state.negotiation?.sellerId);
  }, [user, state.negotiation?.buyerId, state.negotiation?.sellerId, isSeller]);

  const isOwnershipResolved = isPrivateSeller !== null;

  return useMemo(() => ({
    negotiation: state.negotiation,
    offers: state.offers,
    loading: state.loading,
    totalUsedForAuction: state.totalUsedForAuction,
    sendCounter,
    respond,
    complete,
    start,
    sendMessage,
    deleteOffer,
    submitAppeal,
    requestContactInfo,
    shareContactInfo,
    isSeller,
    isBuyer,
    isOwnershipResolved
  }), [
    state.negotiation,
    state.offers,
    state.loading,
    state.totalUsedForAuction,
    sendCounter,
    respond,
    complete,
    start,
    sendMessage,
    deleteOffer,
    submitAppeal,
    requestContactInfo,
    shareContactInfo,
    isSeller,
    isBuyer,
    isOwnershipResolved
  ]);
}
