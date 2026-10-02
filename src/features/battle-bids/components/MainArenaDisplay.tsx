import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  Check, 
  MapPin, 
  Flame, 
  Eye, 
  Users, 
  Gavel, 
  Heart, 
  BarChart3, 
  Shield, 
  Play, 
  Pause, 
  AlertTriangle, 
  UserCheck,
  Loader2,
  Timer,
  Coins,
  Zap,
  ShieldAlert
} from 'lucide-react';
import { 
  query, 
  collectionGroup, 
  where, 
  onSnapshot, 
  doc, 
  getDoc 
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../context/AuthContext';
import { useAuctionEngine } from '../hooks/useAuctionEngine';
import { useSellerProfile } from '../hooks/useSellerProfile';
import { ProfileName3D, ThreeDButton } from '../../../components/ThreeDButton';
import { useWatchlist } from '../hooks/useWatchlist';
import { ModerationService } from '../services/moderationService';
import { parseSafeDate } from '../utils/arena';
import { ArenaGallery } from './ArenaGallery';
import { ArenaLiveCountdown } from './ArenaLiveCountdown';
import { ArenaBiddingPanel } from './ArenaBiddingPanel';
import { BidHistoryChart } from './BidHistoryChart';
import { UpcomingAuctionNotice } from './shared/UpcomingAuctionNotice';
import { ArenaBidHistory } from './ArenaBidHistory';
import { ArenaButton } from './ArenaButton';
import { isUserBanned, getUserBanRemaining } from '../../../services/userService';
import { ArenaTacticalActions } from './ArenaTacticalActions';
import { ArenaBidsTabsSection } from './ArenaBidsTabsSection';
import { cn } from '../../../lib/utils';
import { formatPrice, getCurrencyByCode, getDefaultCurrencyForCountry } from '../../../lib/currencies';
import { getCountryFlag } from '../../../components/CountrySelector';
import { AuctionItem, ModerationActionType } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { ArenaService } from '../services/arenaService';
import { ArenaGoLiveModal } from './ArenaGoLiveModal';
import { OfferConfirmationModal } from './shared/OfferConfirmationModal';
import { RealtimeBidTicker } from './RealtimeBidTicker';
import { BattleBidsWinnerBanner } from './BattleBidsWinnerBanner';
import { X, CheckCircle2 } from 'lucide-react';

interface MainArenaDisplayProps {
  auction: AuctionItem;
}

const TimelineBidsList: React.FC<{ auctionId: string; currencySymbol?: string; currency?: string }> = ({ auctionId, currencySymbol, currency }) => {
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = ArenaService.subscribeToBids(auctionId, (updatedBids) => {
      setBids(updatedBids);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [auctionId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-stone-500 text-xs font-bold uppercase tracking-wider gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
        Retransmitting combat record stream...
      </div>
    );
  }

  return (
    <ArenaBidHistory bids={bids} currencySymbol={currencySymbol} currency={currency} />
  );
};

export const MainArenaDisplay: React.FC<MainArenaDisplayProps> = ({ auction }) => {
  const navigate = useNavigate();
  const { 
    auction: latestAuction, 
    bids, 
    loading: auctionLoading, 
    timeRemaining, 
    placeBid, 
    isKycVerified, 
    isOwner, 
    remainingBids,
    isBannedUser,
    banStatus
  } = useAuctionEngine(auction.id);
  const currentAuction = latestAuction || auction;

  useEffect(() => {
    if (currentAuction?.isNegotiationOnly) {
      navigate(`/negotiations?item=${currentAuction.id}`, { replace: true });
    }
  }, [currentAuction?.isNegotiationOnly, currentAuction?.id, navigate]);
  const { profile: sellerProfile, loading: profileLoading } = useSellerProfile(auction.sellerId);
  const { user, isAdmin, userProfile } = useAuth();
  const { isWatching, toggleWatch } = useWatchlist();
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [goLiveFeedback, setGoLiveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [myBids, setMyBids] = useState<any[]>([]);
  const [myBidsLoading, setMyBidsLoading] = useState(true);
  const [myAuctions, setMyAuctions] = useState<any[]>([]);
  const [myAuctionsLoading, setMyAuctionsLoading] = useState(true);

  const [customBid, setCustomBid] = useState<string>('');
  const [bidLoading, setBidLoading] = useState(false);

  const currentBanStatus = banStatus || getUserBanRemaining(userProfile);
  const isBanned = Boolean(
    isBannedUser || 
    isUserBanned(userProfile) || 
    (userProfile as any)?.isBanned || 
    (userProfile as any)?.biddingDisabled || 
    (userProfile as any)?.canBid === false || 
    (userProfile as any)?.isBlocked
  );
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidSuccess, setBidSuccess] = useState(false);
  const [showConfirmBidModal, setShowConfirmBidModal] = useState(false);
  const [pendingBidAmount, setPendingBidAmount] = useState<number | null>(null);
  const isSubmittingRef = useRef<boolean>(false);

  const isConcluded = currentAuction.status === 'concluded' || currentAuction.status === 'ended' || currentAuction.status === 'sold' || currentAuction.status === 'reserve_not_met' || timeRemaining?.isEnded;

  const highestBidObj = useMemo(() => {
    if (!bids || bids.length === 0) return null;
    return [...bids].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
  }, [bids]);

  const effectiveHighestBid = highestBidObj ? highestBidObj.amount : (currentAuction.currentBid || currentAuction.startingPrice || 0);
  const effectiveHighestBidderName = highestBidObj ? (highestBidObj.userName || `Warrior #${highestBidObj.userId.slice(0, 4)}`) : currentAuction.highestBidderName;
  const isHighestBidder = bids.length > 0 && user && bids[0].bidderId === user.uid;

  const itemCurrencyObj = getCurrencyByCode(currentAuction.currency || currentAuction.currencySymbol || (currentAuction.country ? getDefaultCurrencyForCountry(currentAuction.country).code : 'PKR'));
  const itemCurrencySymbol = currentAuction.currencySymbol || itemCurrencyObj.symbol || 'Rs.';
  const itemCurrencyCode = currentAuction.currency || itemCurrencyObj.code || 'PKR';

  const minInc = currentAuction.minIncrement || Math.max(100, Math.floor((currentAuction.startingPrice || 100) * 0.01));
  const minNextBid = (currentAuction.currentBid && currentAuction.currentBid > 0) 
    ? (currentAuction.currentBid + minInc) 
    : (currentAuction.startingPrice || minInc);

  const quickBidsList = [
    { label: 'Min Bid', amount: minNextBid, tag: 'MIN' },
    { label: `+${formatPrice(minInc, itemCurrencySymbol)}`, amount: minNextBid + minInc, tag: '+1x' },
    { label: `+${formatPrice(minInc * 2, itemCurrencySymbol)}`, amount: minNextBid + (minInc * 2), tag: '+2x' },
    { label: `+${formatPrice(minInc * 5, itemCurrencySymbol)}`, amount: minNextBid + (minInc * 5), tag: '+5x' },
    { label: `+${formatPrice(minInc * 10, itemCurrencySymbol)}`, amount: minNextBid + (minInc * 10), tag: '+10x' },
  ];

  const triggerPlaceBid = (directAmount?: number) => {
    if (isSubmittingRef.current || bidLoading) return;
    if (isBanned) {
      setBidError(
        currentBanStatus.isBanned
          ? `Your account has been banned by administration (${currentBanStatus.formattedText}). Placing bids is prohibited.`
          : "Your account is restricted from submitting bids by administration."
      );
      return;
    }
    if (isConcluded) {
      setBidError("This combat has been concluded. Bids can no longer be placed.");
      return;
    }
    if (isHighestBidder) {
      setBidError("You are already the highest bidder.");
      return;
    }
    if (!user) {
      setBidError("Please sign in to place a bid.");
      return;
    }
    
    // Amount must be explicitly selected or entered
    const amt = typeof directAmount === 'number' && !isNaN(directAmount)
      ? directAmount
      : (customBid && customBid.trim() !== '' && !isNaN(Number(customBid)) ? Number(customBid) : null);

    if (amt === null) {
      setBidError("Please select an amount from the quick options or enter your desired bid amount.");
      return;
    }

    if (amt < minNextBid) {
      setBidError(`Bid must be at least ${formatPrice(minNextBid, itemCurrencySymbol)}`);
      return;
    }

    setBidError(null);
    setPendingBidAmount(amt);
    setShowConfirmBidModal(true);
  };

  const handleExecuteBid = async () => {
    if (isSubmittingRef.current || bidLoading || !pendingBidAmount) return;

    isSubmittingRef.current = true;
    setBidLoading(true);
    setBidError(null);
    setBidSuccess(false);
    try {
      await placeBid(pendingBidAmount);
      setBidSuccess(true);
      setCustomBid('');
      setPendingBidAmount(null);
      setTimeout(() => setBidSuccess(false), 3000);
    } catch (err: any) {
      setBidError(err.message || "Failed to submit bid");
    } finally {
      setBidLoading(false);
      isSubmittingRef.current = false;
    }
  };

  useEffect(() => {
    if (!user) {
      setMyBids([]);
      setMyBidsLoading(false);
      return;
    }

    const bidsQuery = query(
      collectionGroup(db, 'bids'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(bidsQuery, async (snapshot) => {
      try {
        const bidsByAuction: Record<string, { maxAmount: number; latestTimestamp: Date }> = {};
        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          const auctionId = data.auctionId;
          const amount = data.amount || 0;
          const timestamp = data.timestamp ? parseSafeDate(data.timestamp) : new Date(0);
          if (auctionId) {
            const existing = bidsByAuction[auctionId];
            if (!existing) {
              bidsByAuction[auctionId] = { maxAmount: amount, latestTimestamp: timestamp };
            } else {
              bidsByAuction[auctionId] = {
                maxAmount: Math.max(existing.maxAmount, amount),
                latestTimestamp: timestamp > existing.latestTimestamp ? timestamp : existing.latestTimestamp
              };
            }
          }
        });

        const auctionIds = Object.keys(bidsByAuction);
        if (auctionIds.length === 0) {
          setMyBids([]);
          setMyBidsLoading(false);
          return;
        }

        const fetchedBids = await Promise.all(
          auctionIds.map(async (id) => {
            const auctionDocRef = doc(db, 'arena_auctions', id);
            const auctionDocSnap = await getDoc(auctionDocRef);
            if (auctionDocSnap.exists()) {
              const data = auctionDocSnap.data();
              if (data.isNegotiationOnly) return null;

              const images = data.images || [];
              const title = data.title || 'Unknown Auction';
              const statusVal = data.status || 'active';
              const status: 'active' | 'concluded' = statusVal === 'active' ? 'active' : 'concluded';
              const endVal = parseSafeDate(data.endTime);
              return {
                auctionId: id,
                auctionTitle: title,
                auctionImage: images[0] || '',
                userBidAmount: bidsByAuction[id].maxAmount,
                latestTimestamp: bidsByAuction[id].latestTimestamp,
                status,
                endTime: endVal
              };
            }
            return null;
          })
        );

        const validBids = fetchedBids.filter((b) => b !== null) as any[];
        validBids.sort((a, b) => b.latestTimestamp.getTime() - a.latestTimestamp.getTime());
        setMyBids(validBids);
        setMyBidsLoading(false);
      } catch (err) {
        console.error("Error updates on my bids: ", err);
        setMyBidsLoading(false);
      }
    }, (err) => {
      console.error("Subscription error on my bids: ", err);
      setMyBidsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setMyAuctions([]);
      setMyAuctionsLoading(false);
      return;
    }
    setMyAuctionsLoading(true);
    ArenaService.getUserAuctions(user.uid)
      .then((items) => {
        setMyAuctions(items);
      })
      .catch((err) => {
        console.error("Error fetching user auctions:", err);
      })
      .finally(() => {
        setMyAuctionsLoading(false);
      });
  }, [user]);

  const handleOpenGoLiveModal = () => {
    if (!user || !currentAuction || !isOwner) return;
    setShowGoLiveModal(true);
  };

  const handleExecuteGoLive = async () => {
    if (!user || !currentAuction || !isOwner) return;
    setUserActionLoading(true);
    setGoLiveFeedback(null);
    try {
      await ArenaService.goLive(currentAuction.id, currentAuction.durationDays || 3, currentAuction);
      setGoLiveFeedback({
        type: 'success',
        message: 'Success! Your post has gone live immediately and is now active in the Battle Arena.'
      });
      setTimeout(() => setGoLiveFeedback(null), 6000);
    } catch (err: any) {
      setGoLiveFeedback({
        type: 'error',
        message: err?.message || 'Failed to make auction go live. Please try again.'
      });
      throw err;
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleUserPause = async () => {
    if (currentAuction.status === 'concluded' || currentAuction.status === 'sold') {
      alert("Action denied: Listed items cannot be paused once an offer has been accepted by the seller.");
      return;
    }
    if (!window.confirm("Are you sure?")) return;
    setUserActionLoading(true);
    try {
      await ArenaService.pauseAuction(currentAuction.id);
      alert("Asset paused successfully.");
    } catch (err: any) {
      alert(err.message || "Failed to pause listing.");
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleUserResume = async () => {
    if (!window.confirm("Are you sure?")) return;
    setUserActionLoading(true);
    try {
      await ArenaService.resumeAuction(currentAuction.id);
      alert("Asset resumed successfully.");
    } catch (err: any) {
      alert(err.message || "Failed to resume listing.");
    } finally {
      setUserActionLoading(false);
    }
  };

  const handleUserTogglePause = async () => {
    if (currentAuction.status === 'paused') {
      await handleUserResume();
    } else {
      await handleUserPause();
    }
  };

  const handleUserDelete = async () => {
    if (!window.confirm("Are you sure you want to permanently delete this listing?")) return;
    setUserActionLoading(true);
    try {
      await ArenaService.deleteAuction(auction.id);
      alert("Listing permanently removed on behalf of owner.");
      navigate('/battle-bids/my-auctions');
    } catch (err: any) {
      alert(err.message || "Failed to delete listing.");
    } finally {
      setUserActionLoading(false);
    }
  };

  const loading = auctionLoading || profileLoading;

  if (loading) {
    return (
      <div className="bg-stone-900/40 border border-white/5 rounded-[2.5rem] p-8 animate-pulse space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-stone-800 rounded-2xl animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-stone-800 rounded-md w-1/3 animate-pulse" />
            <div className="h-3 bg-stone-800 rounded-md w-1/4 animate-pulse" />
          </div>
        </div>
        <div className="h-64 bg-stone-800 rounded-[2rem] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] overflow-hidden shadow-2xl p-6 md:p-8 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
      {/* 1. Seller Profile Display */}
      {sellerProfile ? (() => {
        const isKycApproved = !!sellerProfile.isKycVerified;
        const hasPremiumBadge = !!sellerProfile.isPremiumSeller;
        const showGoldenTick = isKycApproved && hasPremiumBadge;
        const showBlueTick = isKycApproved && !hasPremiumBadge;
        const profileAddress = sellerProfile.address || '';

        return (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-850 pb-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative flex-shrink-0">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-stone-850 border border-white/10 shadow-md">
                    {sellerProfile.photoURL ? (
                      <img src={sellerProfile.photoURL} alt={sellerProfile.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-600 bg-stone-900">
                        <span className="text-2xl font-black">{sellerProfile.displayName.charAt(0)}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="min-w-0 flex-1">
                  <ProfileName3D
                    name={sellerProfile.displayName}
                    userId={sellerProfile.id}
                    dark={true}
                    isVerified={showBlueTick}
                    isPremium={showGoldenTick}
                  />
                </div>
              </div>

              <button
                onClick={() => navigate(`/battle-bids/profile/${sellerProfile.username || sellerProfile.id}`)}
                className="w-full sm:w-auto shrink-0 px-5 py-2.5 bg-stone-850 hover:bg-stone-800 text-stone-200 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider border border-stone-800 hover:border-stone-750 transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <User className="w-3.5 h-3.5 text-rose-500" />
                View Arena Profile
              </button>
            </div>

            <div className="space-y-2 pl-1">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isKycApproved ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                <span className={`text-xs font-black uppercase tracking-widest ${isKycApproved ? 'text-emerald-500' : 'text-rose-500'}`}>
                  KYC Verified {isKycApproved ? '✓' : '✗'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${hasPremiumBadge ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className={`text-xs font-black uppercase tracking-widest ${hasPremiumBadge ? 'text-emerald-500' : 'text-rose-500'}`}>
                  Premium seller {hasPremiumBadge ? '✓' : '✗'}
                </span>
              </div>

              <div className="text-stone-400 font-medium text-xs mt-2 space-y-1.5 border-t border-stone-850 pt-2 max-w-md">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="font-bold text-stone-200">
                    {sellerProfile.country ? `${getCountryFlag(sellerProfile.country)} ${sellerProfile.country}, ` : ''}{sellerProfile.city || 'Lahore'}
                  </span>
                </div>
                <div className="text-stone-400 pl-6 leading-relaxed font-mono text-xs">
                  {profileAddress ? profileAddress : 'Address not specified'}
                </div>
              </div>
            </div>
          </div>
        );
      })() : (
        <div className="p-4 bg-stone-950 rounded-2xl text-stone-400 text-xs italic">
          Loading Official Seller Profile...
        </div>
      )}

      {/* 2. Images of listed items */}
      <div className="rounded-[2.5rem] overflow-hidden border border-white/5 bg-stone-950">
        <ArenaGallery images={auction.images} title={auction.title} />
      </div>

      {/* 3. Public Tactical Actions Bar */}
      <div className="w-full">
        <ArenaTacticalActions item={currentAuction} />
      </div>

      <div className="space-y-8">
        {/* Real-Time Mini-Ticker for Incoming Bids */}

        {/* Real-Time Mini-Ticker for Incoming Bids */}
        {!currentAuction.isNegotiationOnly && (
          <RealtimeBidTicker
            auctionId={auction.id}
            auction={currentAuction}
            bids={bids}
            onBidSelect={() => {
              const el = document.getElementById('spotlight-bidding-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        )}

        {/* 4. Highest Bid Called by Users */}
        <div className="bg-stone-950 border border-stone-850 rounded-[2rem] p-6 shadow-inner relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="absolute inset-0 bg-gradient-to-r from-rose-500/0 via-rose-500/0 to-rose-500/[0.02]" />
          <div className="text-center sm:text-left">
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] mb-1.5 flex items-center gap-1.5 justify-center sm:justify-start">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              Highest Bid Called By Users
            </p>
            <div className="flex items-baseline justify-center sm:justify-start gap-2.5">
              <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
                {formatPrice(effectiveHighestBid, itemCurrencySymbol)}
              </span>
              {currentAuction.reservePrice && (
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border tracking-wider ${
                  currentAuction.reserveMet 
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                    : 'bg-stone-900 text-stone-400 border-stone-800'
                }`}>
                  {currentAuction.reserveMet ? 'Reserve Met' : 'Reserve Not Met'}
                </span>
              )}
            </div>
          </div>
          {effectiveHighestBidderName && (
            <div className="bg-stone-900 border border-stone-800 px-4 py-2.5 rounded-xl shrink-0 text-center sm:text-right">
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-wider mb-0.5">Current Leader</p>
              <p className="text-xs font-black text-rose-500 uppercase italic">@{effectiveHighestBidderName}</p>
            </div>
          )}
        </div>

        {/* 5. Time Remaining for Auction */}
        {!currentAuction.isNegotiationOnly && (
          currentAuction.status === 'upcoming' ? (
            <UpcomingAuctionNotice variant="post" />
          ) : (
            <div className="bg-stone-950 border border-stone-850 rounded-[2rem] p-6 shadow-inner space-y-3">
              <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] text-center sm:text-left">
                Time Remaining for Auction
              </p>
              <ArenaLiveCountdown 
                timeRemaining={timeRemaining} 
                extensionsCount={currentAuction.extensionsCount}
              />
            </div>
          )
        )}

        {/* 6. Graph of Price Increased */}
        {!currentAuction.isNegotiationOnly && (
          <div className="bg-stone-950 border border-stone-850 rounded-[2rem] p-6 shadow-inner space-y-3">
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] text-center sm:text-left">
              Graph of Price Increased
            </p>
            <div className="h-44 sm:h-52 w-full pt-2">
              <BidHistoryChart 
                bids={bids} 
                startingPrice={currentAuction.startingPrice} 
                currency={currentAuction.currencySymbol || currentAuction.currency}
                reservePrice={currentAuction.reservePrice}
              />
            </div>
          </div>
        )}

        {/* 7. Bar to enter bids & Place your bid button */}
        {!currentAuction.isNegotiationOnly && (
          <div id="spotlight-bidding-section" className="bg-stone-955 border border-stone-850 rounded-[2rem] p-6 shadow-inner space-y-4">
            <p className="text-[10px] font-black text-stone-400 uppercase tracking-[0.2em] text-center sm:text-left">
              Submit Your Bid
            </p>

            {currentAuction.status === 'upcoming' ? (
              <UpcomingAuctionNotice
                variant="auction"
                isOwner={isOwner}
                onGoLive={handleOpenGoLiveModal}
                goLiveLoading={userActionLoading}
                startingPrice={currentAuction.startingPrice}
                currency={currentAuction.currency}
                currencySymbol={currentAuction.currencySymbol}
              />
            ) : isOwner ? (
              <div className="p-5 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-center space-y-2 animate-in fade-in">
                <div className="flex items-center justify-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
                  <Shield className="w-4 h-4 text-amber-500" />
                  <span>Your Listed Auction Asset</span>
                </div>
                <p className="text-xs text-stone-300 max-w-md mx-auto leading-relaxed">
                  As the seller who posted this item under auction, you cannot submit bids against your own listed item. Other eligible combatants can submit bids.
                </p>
              </div>
            ) : isConcluded ? (
              <BattleBidsWinnerBanner auction={currentAuction} user={user} />
            ) : (
              <div className="space-y-4 animate-in fade-in">
                
                {/* Remaining Strategic Bids Counter */}
                {user && remainingBids !== undefined && (
                  <div className="flex items-center justify-between p-3.5 bg-stone-900 border border-stone-850 rounded-xl">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Remaining Strategic Bids</span>
                    <span className="text-xs font-mono font-black text-amber-500">{remainingBids} / 10</span>
                  </div>
                )}

                {/* Bar to enter bids & Quick Presets */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-black text-stone-300 uppercase tracking-widest flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>Select or Enter Bid Amount</span>
                    </label>
                    {customBid && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomBid('');
                          setBidError(null);
                        }}
                        className="text-[10px] font-bold text-stone-400 hover:text-rose-400 uppercase tracking-wider cursor-pointer transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Quick increment chips */}
                  {user && !isHighestBidder && !isConcluded && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                        Quick Amount Options:
                      </p>
                      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 pt-0.5">
                        {quickBidsList.map((qb) => {
                          const isSelected = customBid === qb.amount.toString() || Number(customBid) === qb.amount;
                          return (
                            <button
                              key={qb.amount}
                              type="button"
                              onClick={() => {
                                setCustomBid(qb.amount.toString());
                                setBidError(null);
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer border flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-amber-500 text-stone-955 border-amber-400 shadow-md shadow-amber-500/20 scale-102 ring-2 ring-amber-400/40'
                                  : 'bg-stone-900 hover:bg-stone-850 text-stone-300 hover:text-white border-stone-800 hover:border-amber-500/40'
                              }`}
                            >
                              <span>{formatPrice(qb.amount, itemCurrencySymbol)}</span>
                              {qb.tag && (
                                <span className={`text-[9px] px-1 py-0.2 rounded font-black ${
                                  isSelected ? 'bg-stone-955/20 text-stone-955' : 'bg-stone-800 text-amber-400'
                                }`}>
                                  {qb.tag}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Manual input */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                        Or Enter Custom Bid:
                      </span>
                      <span className="text-[10px] font-mono text-stone-400">
                        Min: {formatPrice(minNextBid, itemCurrencySymbol)}
                      </span>
                    </div>
                    <div className="relative w-full">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-400 font-black text-xs sm:text-sm pointer-events-none select-none tracking-tight">
                        {itemCurrencySymbol}
                      </span>
                      <input
                        type="number"
                        value={customBid}
                        onChange={(e) => {
                          setCustomBid(e.target.value);
                          setBidError(null);
                        }}
                        disabled={!user || bidLoading || isConcluded || isHighestBidder}
                        placeholder={isHighestBidder ? 'You are the highest bidder' : user ? `Enter bid amount (Min ${formatPrice(minNextBid, itemCurrencySymbol)})` : 'Sign in to bid'}
                        className={`w-full bg-stone-900 border rounded-xl p-4 pl-14 sm:pl-16 pr-10 text-white font-mono font-bold text-sm outline-none transition-all placeholder:text-stone-600 shadow-inner disabled:opacity-50 ${
                          customBid && Number(customBid) < minNextBid 
                            ? 'border-rose-500/60 focus:border-rose-500' 
                            : customBid 
                              ? 'border-amber-500/70' 
                              : 'border-stone-800 focus:border-amber-500'
                        }`}
                      />
                      {customBid && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomBid('');
                            setBidError(null);
                          }}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 cursor-pointer"
                          title="Clear amount"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Selected Amount Pill */}
                {customBid && !isNaN(Number(customBid)) && Number(customBid) >= minNextBid && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] font-black text-stone-300 uppercase tracking-wider">Selected Strike Amount:</span>
                    </div>
                    <span className="text-xs font-mono font-black text-amber-400">
                      {formatPrice(Number(customBid), itemCurrencySymbol)}
                    </span>
                  </div>
                )}

                {/* Feedback messages */}
                {!user && (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl text-xs text-amber-500 font-bold leading-relaxed flex items-start gap-2">
                    <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Only registered combatants can place bids. Please sign in to participate.</span>
                  </div>
                )}
                {isBanned && (
                  <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl text-xs text-rose-400 font-bold leading-relaxed flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span>Bidding Restricted: Account Banned</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          {currentBanStatus.formattedText}
                        </span>
                      </div>
                      <p className="text-[11px] font-normal text-stone-300 mt-1">
                        Bidding is prohibited for banned accounts until the administrative ban expires or is lifted.
                      </p>
                    </div>
                  </div>
                )}
                {bidError && (
                  <div className="border p-4 rounded-xl text-xs font-bold leading-relaxed flex items-start gap-2 bg-rose-500/10 border-rose-500/20 text-rose-500">
                    <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{bidError}</span>
                  </div>
                )}
                {isHighestBidder && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-xs text-emerald-500 font-bold leading-relaxed flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>You are currently the highest bidder. Await counter-bids.</span>
                  </div>
                )}
                {bidSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-xs text-emerald-500 font-bold leading-relaxed flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>Bid placed successfully in the Arena!</span>
                  </div>
                )}

                {/* Place your bid button */}
                <ThreeDButton
                  id="main-arena-place-bid-btn"
                  onClick={() => triggerPlaceBid()}
                  disabled={
                    !user || 
                    isBanned ||
                    bidLoading || 
                    isConcluded || 
                    isHighestBidder || 
                    !customBid || 
                    customBid.trim() === '' || 
                    isNaN(Number(customBid)) || 
                    Number(customBid) < minNextBid
                  }
                  variant="amber"
                  size="md"
                  noShadow={true}
                  icon={bidLoading ? Loader2 : isBanned ? ShieldAlert : Gavel}
                  label={
                    bidLoading 
                      ? 'Placing Bid...' 
                      : isBanned
                        ? 'Bidding Restricted (Banned)'
                        : !user 
                          ? 'Sign In to Place Bid'
                          : isHighestBidder 
                            ? 'You are highest bidder' 
                            : (!customBid || customBid.trim() === '')
                              ? 'Select or Enter Bid Amount'
                              : (Number(customBid) < minNextBid)
                                ? `Min Bid is ${formatPrice(minNextBid, itemCurrencySymbol)}`
                                : `Place Bid (${formatPrice(Number(customBid), itemCurrencySymbol)})`
                  }
                />
              </div>
            )}
          </div>
        )}

        {/* 8. All Bids Placed by Users Section */}
        {!currentAuction.isNegotiationOnly && (
          <ArenaBidsTabsSection
            bids={bids}
            auction={currentAuction}
            user={user}
          />
        )}

        {/* Owner Authorized Operations Panel */}
        {isOwner && (
          <div className="bg-amber-950/10 border border-amber-500/10 p-4 rounded-2xl space-y-3">
            <div className="text-[10px] text-amber-500 font-black uppercase tracking-widest pl-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Listing Management Operations
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {isOwner && currentAuction.status === 'upcoming' && (
                <button 
                  onClick={handleOpenGoLiveModal}
                  disabled={userActionLoading}
                  className="px-4 py-3 bg-blue-600 hover:bg-blue-500 border border-blue-500/30 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider text-white transition-all disabled:opacity-50 flex-1 sm:flex-none cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  Go Live Now
                </button>
              )}

              {currentAuction.status !== 'ended' && currentAuction.status !== 'concluded' && currentAuction.status !== 'sold' && currentAuction.status !== 'upcoming' && (
                <button 
                  onClick={currentAuction.status === 'paused' ? handleUserResume : handleUserPause}
                  disabled={userActionLoading}
                  className="px-4 py-3 bg-stone-900 hover:bg-stone-850 border border-stone-800 hover:border-amber-500/30 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider text-amber-500 transition-all disabled:opacity-50 flex-1 sm:flex-none"
                >
                  {currentAuction.status === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  {currentAuction.status === 'paused' ? "Resume Mission" : "Pause Combat"}
                </button>
              )}

              <button 
                onClick={handleUserDelete}
                disabled={userActionLoading}
                className="px-4 py-3 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/20 hover:border-rose-500/40 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider text-rose-500 transition-all disabled:opacity-50 flex-1 sm:flex-none"
              >
                <X className="w-4 h-4" />
                Terminate Asset
              </button>
            </div>
          </div>
        )}

        {/* Live Launch Feedback Banner */}
        {goLiveFeedback && (
          <div className={cn(
            "p-4 rounded-2xl flex items-center gap-3 border text-xs font-bold animate-in fade-in",
            goLiveFeedback.type === 'success' 
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          )}>
            {goLiveFeedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
            )}
            <div className="flex-1">{goLiveFeedback.message}</div>
            <button 
              onClick={() => setGoLiveFeedback(null)} 
              className="p-1 hover:bg-white/10 rounded-lg text-stone-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Submitting Arena Bid */}
      <OfferConfirmationModal
        isOpen={showConfirmBidModal}
        onClose={() => {
          setShowConfirmBidModal(false);
          setPendingBidAmount(null);
        }}
        onConfirm={handleExecuteBid}
        amount={pendingBidAmount ?? undefined}
        currencySymbol={currentAuction.currencySymbol || currentAuction.currency || 'USD'}
        title="Are you sure?"
        message="Are you sure you want to place this bid immediately in the combat arena?"
        confirmText="Yes, Place Bid"
        cancelText="Cancel"
        icon={Gavel}
      />

      {/* Reusable Confirmation Modal for Launching Auction to Go Live */}
      <ArenaGoLiveModal
        isOpen={showGoLiveModal}
        onClose={() => setShowGoLiveModal(false)}
        onConfirm={handleExecuteGoLive}
        item={currentAuction}
        loading={userActionLoading}
      />
    </div>
  );
};
