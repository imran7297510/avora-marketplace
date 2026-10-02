import { useState, useEffect, useCallback } from 'react';
import { AuctionItem, Bid } from '../types';
import { ArenaService } from '../services/arenaService';
import { useAuth } from '../../../context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { formatPrice } from '../../../lib/currencies';
import { isUserBanned, getUserBanRemaining } from '../../../services/userService';
import { resolveAuthoritativeVerification } from '../../../lib/verificationResolver';

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isEnded: boolean;
  isUrgent: boolean; // Less than 5 mins
  isPaused?: boolean;
}

export function useAuctionEngine(auctionId?: string) {
  const { user, userProfile } = useAuth();
  const cachedInitialAuction = auctionId ? ArenaService.getCachedAuction(auctionId) : null;
  const [auction, setAuction] = useState<AuctionItem | null>(() => cachedInitialAuction);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(() => !cachedInitialAuction && Boolean(auctionId));
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);
  const [isKycVerified, setIsKycVerified] = useState(false);
  const [isPrivateSeller, setIsPrivateSeller] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    if (!auction || !user?.uid || !auction.isNegotiationOnly) {
      setIsPrivateSeller(false);
      return;
    }
    getDoc(doc(db, 'arena_auctions', auction.id, 'private', 'seller'))
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
  }, [auction?.id, auction?.isNegotiationOnly, user?.uid]);

  // Fetch initial data and setup subscriptions
  useEffect(() => {
    if (!auctionId) {
      setLoading(false);
      return;
    }
    
    // Check if we have cached auction already
    const cached = ArenaService.getCachedAuction(auctionId);
    if (cached) {
      setAuction(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    
    // Subscribe to auction updates
    const unsubscribeAuction = ArenaService.subscribeToAuction(auctionId, (updatedAuction) => {
      if (updatedAuction) {
        setAuction(updatedAuction);
      }
      setLoading(false);
    });

    // Subscribe to bids
    const unsubscribeBids = ArenaService.subscribeToBids(auctionId, (updatedBids) => {
      setBids(updatedBids);
    });

    // Check user KYC status
    if (user) {
      if (userProfile) {
        setIsKycVerified(resolveAuthoritativeVerification(userProfile).isKycCurrentlyValid);
      } else {
        const checkKyc = async () => {
          try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              setIsKycVerified(resolveAuthoritativeVerification(userData).isKycCurrentlyValid);
            }
          } catch {
            // Ignore error
          }
        };
        checkKyc();
      }
    }

    return () => {
      unsubscribeAuction();
      unsubscribeBids();
    };
  }, [auctionId, user]);

  // Timer logic
  useEffect(() => {
    if (!auction) {
      setTimeRemaining(null);
      return;
    }

    const isPaused = auction.status === 'paused' || (auction as any).isPaused === true || (auction as any).isPausedBySeller === true;

    if (isPaused) {
      let remainingMs = (auction as any).pausedRemainingTimeMs ?? auction.remainingDurationMs;
      if (typeof remainingMs !== 'number' || isNaN(remainingMs) || remainingMs <= 0) {
        const endSafe = auction.endTime && typeof (auction.endTime as any).getTime === 'function' ? (auction.endTime as any).getTime() : 0;
        const pausedSafe = auction.pausedAt && typeof (auction.pausedAt as any).getTime === 'function' ? (auction.pausedAt as any).getTime() : Date.now();
        if (endSafe > 0) {
          remainingMs = Math.max(0, endSafe - pausedSafe);
        } else {
          remainingMs = (auction.durationDays || 3) * 24 * 60 * 60 * 1000;
        }
      }

      if (remainingMs <= 0) {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true, isUrgent: false, isPaused: true });
      } else {
        const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

        setTimeRemaining({
          days,
          hours,
          minutes,
          seconds,
          isEnded: false,
          isUrgent: false,
          isPaused: true
        });
      }
      return; // Do not tick countdown while paused!
    }

    if (auction.status !== 'active') {
      setTimeRemaining(null);
      return;
    }

    const calculateTime = () => {
      const now = new Date().getTime();
      
      if (!auction.endTime || typeof auction.endTime.getTime !== 'function') {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true, isUrgent: false });
        return;
      }
      
      const end = auction.endTime.getTime();
      
      if (isNaN(end)) {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true, isUrgent: false });
        return;
      }

      const diff = end - now;

      if (diff <= 0) {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true, isUrgent: false });
        
        // Trigger completion logic (only need one client to trigger it, service handles concurrency)
        if (auction.status === 'active') {
          ArenaService.completeAuction(auction.id);
        }
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({
        days,
        hours,
        minutes,
        seconds,
        isEnded: false,
        isUrgent: diff < 5 * 60 * 1000,
        isPaused: false
      });
    };

    calculateTime();
    const timer = setInterval(calculateTime, 1000);

    return () => clearInterval(timer);
  }, [auction]);

  const isOwner = Boolean(
    auction && user && (
      isPrivateSeller ||
      (auction.sellerId && user.uid === auction.sellerId) ||
      (auction.sellerId && userProfile?.id === auction.sellerId) ||
      (auction.userId && user.uid === auction.userId) ||
      (user.email && auction.sellerId && user.email.toLowerCase() === auction.sellerId.toLowerCase()) ||
      (auction.sellerEmail && user.email && user.email.toLowerCase() === auction.sellerEmail.toLowerCase())
    )
  );

  const placeBid = useCallback(async (amount: number) => {
    if (!user || !auction) return;

    if (isOwner) {
      throw new Error("Sellers cannot place bids against their own listed auction items.");
    }

    if (auction.status !== 'active') {
      throw new Error("This auction is no longer accepting bids");
    }

    const banStatus = getUserBanRemaining(userProfile);
    const isBannedUser = 
      isUserBanned(userProfile) || 
      (userProfile as any)?.isBlocked || 
      (userProfile as any)?.biddingDisabled || 
      (userProfile as any)?.canBid === false;

    if (isBannedUser) {
      throw new Error(
        banStatus.isBanned
          ? `Action denied: Your account has been banned by administration (${banStatus.formattedText}). Bidding is prohibited.`
          : "Action denied: Your account is currently restricted from submitting bids by administration."
      );
    }

    const effectiveCurrency = auction.currencySymbol || auction.currency || 'PKR';

    // Basic validation
    if (amount <= auction.currentBid) {
      throw new Error(`Bid must be higher than current bid (${formatPrice(auction.currentBid, effectiveCurrency)})`);
    }

    const bidsCount = auction.userBidCounts?.[user.uid] ?? bids.filter(b => b.userId === user.uid).length;
    if (bidsCount >= 10) {
      throw new Error("Strategic engagement limit exceeded (Maximum of 10 bids allowed per listed item under auction).");
    }

    const minIncrement = auction.minIncrement || (auction.startingPrice * 0.01);
    if (amount < auction.currentBid + minIncrement) {
      throw new Error(`Minimum next bid is ${formatPrice(auction.currentBid + minIncrement, effectiveCurrency)}`);
    }

    try {
      await ArenaService.submitBid({
        auctionId: auction.id,
        userId: user.uid,
        userName: userProfile?.name || user.displayName || 'Anonymous Warrior',
        userPhotoURL: userProfile?.photoURL || user.photoURL || '',
        amount,
        currency: auction.currency || 'PKR',
        currencySymbol: auction.currencySymbol || 'Rs.'
      } as any);
    } catch (err: any) {
      throw err;
    }
  }, [user, userProfile, auction, isKycVerified, isOwner]);

  const bidsCount = user && auction ? (auction.userBidCounts?.[user.uid] ?? bids.filter(b => b.userId === user.uid).length) : 0;
  const remainingBids = Math.max(0, 10 - bidsCount);

  const banStatus = getUserBanRemaining(userProfile);
  const isBannedUser = 
    isUserBanned(userProfile) || 
    (userProfile as any)?.isBlocked || 
    (userProfile as any)?.biddingDisabled || 
    (userProfile as any)?.canBid === false;

  return {
    auction,
    bids,
    loading,
    error,
    timeRemaining,
    placeBid,
    isKycVerified,
    isOwner,
    remainingBids,
    isBannedUser,
    banStatus
  };
}
