import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, TrendingUp, ShieldAlert, Shield, CheckCircle2, Clock, Sparkles, Zap, Copy, Play, Coins, Plus, Loader2, Pause, OctagonX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AuctionItem } from '../types';
import { useAuth } from '../../../context/AuthContext';
import { useCredits } from '../../credits';
import { getAuctionDisplayStatus } from '../utils';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ArenaButton } from './ArenaButton';
import { ThreeDButton } from '../../../components/ThreeDButton';
import { ArenaService } from '../services';
import { formatPrice, getCurrencyByCode, getDefaultCurrencyForCountry } from '../../../lib/currencies';
import { OfferConfirmationModal } from './shared/OfferConfirmationModal';
import { ArenaGoLiveModal } from './ArenaGoLiveModal';
import { UpcomingAuctionNotice } from './shared/UpcomingAuctionNotice';
import { isUserBanned, getUserBanRemaining } from '../../../services/userService';
import { BadgeActivities } from '../../../components/BadgeActivities';
import { ArenaModal } from './shared/ArenaModal';

interface ArenaBiddingPanelProps {
  auction: AuctionItem;
  onBid: (amount: number) => Promise<void>;
  isKycVerified: boolean;
  isOwner: boolean;
  remainingBids?: number;
}

export const ArenaBiddingPanel: React.FC<ArenaBiddingPanelProps> = ({ auction, onBid, isKycVerified, isOwner, remainingBids }) => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { creditsBalance, openPurchase, refreshCredits, isDemoMode } = useCredits();
  const [customBid, setCustomBid] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showConfirmBidModal, setShowConfirmBidModal] = useState(false);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [pendingBidAmount, setPendingBidAmount] = useState<number | null>(null);
  const [bids, setBids] = useState<any[]>([]);
  const isSubmittingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!auction?.id) return;
    const unsub = ArenaService.subscribeToBids(auction.id, (loadedBids) => {
      setBids(loadedBids || []);
    });
    return () => unsub();
  }, [auction?.id]);

  const isHighestBidder = Boolean(bids && bids.length > 0 && user && (bids[0].userId === user.uid || bids[0].bidderId === user.uid));

  useEffect(() => {
    if (isOwner) {
      setError("Users cannot place bids against their own auctions.");
    } else {
      setError(null);
    }
  }, [isOwner]);

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const getBadgeTimeRemaining = (expiryDate: any) => {
    if (!expiryDate) return null;
    const expiry = (expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate)).getTime();
    const diff = expiry - now;
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (days > 0) {
      return `${days}d ${hours}h left`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m left`;
    }
    return `${minutes}m ${seconds}s left`;
  };

  // Appeal state
  const [appealMessage, setAppealMessage] = useState('');
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealSuccess, setAppealSuccess] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  // Upcoming / Booster states & handlers
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteCategory, setPromoteCategory] = useState<'FEATURED' | 'BOOST'>('FEATURED');

  const handleOpenPromotionModal = (category: 'FEATURED' | 'BOOST') => {
    if (!isOwner) return;
    setPromoteCategory(category);
    setShowPromoteModal(true);
  };

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const getRemainingDays = () => {
    if (!auction.createdAt) return 30;
    const createdDate = (auction.createdAt as any).toDate ? (auction.createdAt as any).toDate() : new Date(auction.createdAt);
    const msDiff = Date.now() - createdDate.getTime();
    const daysDiff = Math.floor(msDiff / (1000 * 60 * 60 * 24));
    return Math.max(0, 30 - daysDiff);
  };

  const handleGoLive = async () => {
    if (!user || !isOwner) return;
    setActionLoading(true);
    setError(null);
    try {
      await ArenaService.goLive(auction.id, auction.durationDays || 3, auction);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to deploy live");
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const banStatus = getUserBanRemaining(userProfile);
  const isUserAdminBanned = 
    isUserBanned(userProfile) || 
    Boolean((userProfile as any)?.isBanned) || 
    (userProfile as any)?.accountStatus === 'banned' || 
    (userProfile as any)?.status === 'BANNED' || 
    Boolean((userProfile as any)?.biddingDisabled) || 
    (userProfile as any)?.canBid === false || 
    Boolean((userProfile as any)?.isBlocked);

  const isBiddingRestricted = isUserAdminBanned || Boolean(userProfile?.biddingRestrictedPermanently) || 
    Boolean(userProfile?.biddingRestrictedUntil && (
      userProfile.biddingRestrictedUntil.toDate 
        ? userProfile.biddingRestrictedUntil.toDate() > new Date()
        : new Date(userProfile.biddingRestrictedUntil) > new Date()
    ));

  const handleAppealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !appealMessage.trim()) return;
    setAppealLoading(true);
    setAppealError(null);
    setAppealSuccess(false);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        biddingAppealMessage: appealMessage.trim(),
        biddingAppealStatus: 'pending',
        updatedAt: serverTimestamp(),
      });
      setAppealSuccess(true);
      setAppealMessage('');
    } catch (err: any) {
      setAppealError(err.message || 'Failed to submit appeal. Please try again.');
    } finally {
      setAppealLoading(false);
    }
  };

  const itemCurrencyObj = getCurrencyByCode(auction.currency || auction.currencySymbol || (auction.country ? getDefaultCurrencyForCountry(auction.country).code : 'PKR'));
  const itemCurrencySymbol = auction.currencySymbol || itemCurrencyObj.symbol || 'Rs.';
  const itemCurrencyCode = auction.currency || itemCurrencyObj.code || 'PKR';

  const minIncrement = auction.minIncrement || Math.max(100, Math.floor((auction.startingPrice || 100) * 0.01));
  const minNextBid = (auction.currentBid && auction.currentBid > 0) 
    ? (auction.currentBid + minIncrement) 
    : (auction.startingPrice || minIncrement);

  const quickBids = [
    { label: 'Min Bid', amount: minNextBid, tag: 'MIN' },
    { label: `+${formatPrice(minIncrement, itemCurrencySymbol)}`, amount: minNextBid + minIncrement, tag: '+1x' },
    { label: `+${formatPrice(minIncrement * 2, itemCurrencySymbol)}`, amount: minNextBid + (minIncrement * 2), tag: '+2x' },
    { label: `+${formatPrice(minIncrement * 5, itemCurrencySymbol)}`, amount: minNextBid + (minIncrement * 5), tag: '+5x' },
    { label: `+${formatPrice(minIncrement * 10, itemCurrencySymbol)}`, amount: minNextBid + (minIncrement * 10), tag: '+10x' },
  ];

  const displayStatus = getAuctionDisplayStatus(auction);
  const isAuctionConcluded = displayStatus === 'concluded' || displayStatus === 'ended' || displayStatus === 'sold' || displayStatus === 'reserve_not_met' || auction.status === 'concluded' || auction.status === 'ended';
  const isAuctionPaused = auction.status === 'paused' || (auction as any).isPaused === true || (auction as any).isPausedBySeller === true || displayStatus === 'paused';

  const triggerBid = (directAmount?: number) => {
    if (isSubmittingRef.current || loading) return;

    if (isUserAdminBanned || isBiddingRestricted) {
      setError(
        banStatus.isBanned 
          ? `Your account has been banned by administration (${banStatus.formattedText}). Submitting bids is strictly prohibited.`
          : "Your privileges to submit bids in the Arena have been restricted by administration."
      );
      return;
    }

    if (!user) {
      setError("Please log in to participate in battle bids.");
      return;
    }
    const isAuctionForceStopped = 
      auction.status === 'stopped' || 
      auction.status === 'force_stopped' || 
      auction.status === 'stopped_by_admin' || 
      (auction as any).forceStopped === true || 
      (auction as any).isForceStopped === true || 
      (auction as any).forceStoppedByAdmin === true || 
      (auction as any).closedOnViolation === true;

    if (isAuctionForceStopped) {
      setError("This auction listing has been Force Stopped by the admin on violating policies by the seller. Bids are no longer accepted.");
      return;
    }
    if (isAuctionPaused) {
      setError("This auction listing is currently paused by the seller. Bids cannot be placed until the seller resumes this listing.");
      return;
    }
    if (isAuctionConcluded) {
      setError("This combat has been concluded. Bids can no longer be placed.");
      return;
    }
    if (isOwner) {
      setError("As the seller who posted this item, you cannot place bids against your own auction listing.");
      return;
    }
    if (isHighestBidder) {
      setError("You are already the highest bidder on this combat item.");
      return;
    }
    if ((creditsBalance ?? 0) < 1) {
      setError(isDemoMode ? "Insufficient DEMO credits. You need at least 1 DEMO credit to place a bid." : "Insufficient credits. You need at least 1 credit to place a bid.");
      return;
    }

    // Must have a chosen amount (either passed directly or entered in customBid)
    const bidVal = typeof directAmount === 'number' && !isNaN(directAmount)
      ? directAmount
      : (customBid && customBid.trim() !== '' && !isNaN(Number(customBid)) ? Number(customBid) : null);

    if (bidVal === null) {
      setError("Please select an amount from the quick options or enter your desired bid amount.");
      return;
    }

    if (bidVal < minNextBid) {
      setError(`Minimum next bid must be ${formatPrice(minNextBid, itemCurrencySymbol)}`);
      return;
    }

    setError(null);
    setPendingBidAmount(bidVal);
    setShowConfirmBidModal(true);
  };

  const handleExecuteBid = async () => {
    if (isSubmittingRef.current || loading || !pendingBidAmount) return;

    const amount = pendingBidAmount;
    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await onBid(amount);
      setSuccess(true);
      setCustomBid('');
      setPendingBidAmount(null);
      await refreshCredits();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to place bid.');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  if (displayStatus === 'upcoming') {
    const remainingDays = getRemainingDays();
    const isExpired = remainingDays <= 0;
    const canGoLive = auction.launchType !== 'boosters' || (auction.hasFeaturedBadge || auction.hasBoostedBadge);

    return (
      <div className="bg-stone-900 border border-blue-500/20 rounded-3xl p-6 sm:p-8 shadow-lg shadow-blue-500/5 space-y-6">
        <UpcomingAuctionNotice variant="post" />
        <UpcomingAuctionNotice variant="auction" />

        {/* Badges Display */}
        {(auction.hasFeaturedBadge || auction.hasBoostedBadge) && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {auction.hasFeaturedBadge && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-black text-amber-400 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" /> Featured Ads Badge
              </span>
            )}
            {auction.hasBoostedBadge && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs font-black text-blue-400 uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5" /> Boosted Ads Badge
              </span>
            )}
          </div>
        )}

        {isOwner ? (
          <div className="bg-stone-950/50 border border-stone-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-stone-850 pb-3">
              <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Seller Control Room</span>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${isExpired ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-400'}`}>
                {isExpired ? 'EXPIRED' : `${remainingDays} Days Left To Launch`}
              </span>
            </div>

            {isExpired ? (
              <div className="text-center p-3 text-xs font-semibold text-rose-500 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                This upcoming listing has expired (exceeded 30 days limit) and will be removed from the system.
              </div>
            ) : (
              <div className="space-y-4">
                {auction.launchType === 'boosters' && (
                  <div className="space-y-3">
                    <p className="text-xs font-black text-stone-400 uppercase tracking-wider">Activate Boosters:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleOpenPromotionModal('FEATURED')}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          auction.hasFeaturedBadge
                            ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4" />
                            Get Featured Ads
                          </span>
                          <span className={`w-2 h-2 rounded-full ${auction.hasFeaturedBadge ? 'bg-amber-400' : 'bg-stone-700'}`} />
                        </div>
                        <p className="text-[10px] font-semibold opacity-80 leading-normal uppercase">
                          Highlight this asset at the top of the feed for maximum exposure.
                        </p>
                      </button>

                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleOpenPromotionModal('BOOST')}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          auction.hasBoostedBadge
                            ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                            <Zap className="w-4 h-4" />
                            Get Boosted Ads Badge
                          </span>
                          <span className={`w-2 h-2 rounded-full ${auction.hasBoostedBadge ? 'bg-blue-400' : 'bg-stone-700'}`} />
                        </div>
                        <p className="text-[10px] font-semibold opacity-80 leading-normal uppercase">
                          Add a tactical lightning shield badge to stand out from other sellers.
                        </p>
                      </button>
                    </div>
                  </div>
                )}

                {/* Error or Success feedback */}
                {error && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-xs font-bold">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl text-xs font-bold">
                    Asset deployed live successfully!
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex-1 px-4 py-3.5 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 font-bold uppercase tracking-wider text-xs rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? "Link Copied!" : "Copy Share Link"}
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading || !canGoLive}
                    onClick={() => setShowGoLiveModal(true)}
                    className={`flex-1 px-4 py-3.5 font-bold uppercase tracking-wider text-xs rounded-xl transition-all flex items-center justify-center gap-2 ${
                      canGoLive
                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/20'
                        : 'bg-stone-800 border border-stone-750 text-stone-500 cursor-not-allowed'
                    }`}
                  >
                    <Play className="w-4 h-4" />
                    Go Live
                  </button>
                </div>

                {auction.launchType === 'boosters' && !canGoLive && (
                  <p className="text-[10px] text-center font-bold text-amber-500 uppercase tracking-widest mt-2 animate-pulse">
                    ⚠️ Go Live requires getting at least one booster badge first.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-stone-950/30 border border-stone-850 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Help spread the word for this upcoming deployment:</span>
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full sm:w-auto px-5 py-2.5 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 font-bold uppercase tracking-wider text-[11px] rounded-xl transition-all flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Copied!" : "Copy Share Link"}
            </button>
          </div>
        )}
      </div>
    );
  }

  const isAuctionForceStopped = 
    auction.status === 'stopped' || 
    auction.status === 'force_stopped' || 
    auction.status === 'stopped_by_admin' || 
    (auction as any).forceStopped === true || 
    (auction as any).isForceStopped === true || 
    (auction as any).forceStoppedByAdmin === true || 
    (auction as any).closedOnViolation === true;

  if (isAuctionForceStopped) {
    return (
      <div className="bg-stone-900 border border-rose-500/30 rounded-3xl p-6 sm:p-8 text-center shadow-lg shadow-rose-500/5 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500">
          <OctagonX className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-black text-rose-400 uppercase tracking-wider">
            Force Stopped by Admin on Violating Policies
          </h3>
          <p className="text-stone-300 text-xs leading-relaxed max-w-md mx-auto">
            This listed item has been force stopped by the admin on violating the policies by the seller. Bids are no longer accepted on this item, and communication with top bidders is disabled.
          </p>
        </div>
      </div>
    );
  }

  if (displayStatus === 'paused') {
    return (
      <div className="bg-stone-900 border border-amber-500/20 rounded-3xl p-8 text-center shadow-lg shadow-amber-500/5">
        <Gavel className="w-12 h-12 text-amber-500 mx-auto mb-4 animate-pulse" />
        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2">Paused</h3>
        <p className="text-stone-400 text-sm">This combat is temporarily paused by the owner or administration. Bids cannot be submitted at this time.</p>
      </div>
    );
  }

  if (isAuctionConcluded) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-3xl p-8 text-center shadow-lg animate-in fade-in">
        <Gavel className="w-12 h-12 text-stone-700 mx-auto mb-4" />
        <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2">Concluded</h3>
        <p className="text-stone-400 text-sm">No further bids can be accepted for this combat.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 relative overflow-hidden">
        {/* Active Booster Badges with countdown */}
        {(auction.hasFeaturedBadge || auction.hasBoostedBadge) && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6 bg-stone-950/40 p-4 rounded-2xl border border-stone-800 justify-start items-start sm:items-center">
            {auction.hasFeaturedBadge && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <div className="flex flex-col">
                  <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider leading-none">Featured Badge</span>
                  <span className="text-[9px] text-stone-400 font-bold uppercase mt-0.5">
                    {getBadgeTimeRemaining(auction.featuredUntil) || 'Active'}
                  </span>
                </div>
              </div>
            )}
            {auction.hasBoostedBadge && (
              <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-xl">
                <Zap className="w-4 h-4 text-blue-400" />
                <div className="flex flex-col">
                  <span className="text-[11px] font-black text-blue-400 uppercase tracking-wider leading-none">Boosted Badge</span>
                  <span className="text-[9px] text-stone-400 font-bold uppercase mt-0.5">
                    {getBadgeTimeRemaining(auction.boostedUntil) || 'Active'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current Bid Display */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <p className="text-xs font-bold text-stone-300 uppercase tracking-widest mb-1">Current Bid</p>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-white">{formatPrice(auction.currentBid, itemCurrencySymbol)}</span>
              {auction.reservePrice && (
                <span className={`text-[10px] sm:text-xs font-bold uppercase px-2 py-0.5 rounded-md border ${
                  auction.reserveMet 
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' 
                    : 'bg-stone-800 text-stone-300 border-stone-700'
                }`}>
                  {auction.reserveMet ? 'Reserve Met' : 'Reserve Not Met'}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-stone-300 mt-1.5">
              Minimum Increment: {formatPrice(minIncrement, itemCurrencySymbol)}
            </p>
          </div>
          <div className="bg-rose-600 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl shadow-lg shadow-rose-600/20 self-start sm:self-center">
            <TrendingUp className="w-5.5 h-5.5 sm:w-6 sm:h-6 text-white" />
          </div>
        </div>

        {/* Remaining Bids Tracker */}
        {isOwner ? (
          <div className="bg-amber-500/10 border border-amber-500/25 p-5 rounded-2xl text-center space-y-2 animate-in fade-in">
            <div className="flex items-center justify-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
              <Shield className="w-4 h-4 text-amber-500" />
              <span>Your Listed Auction Asset</span>
            </div>
            <p className="text-xs text-stone-300 max-w-md mx-auto leading-relaxed">
              As the seller who posted this item under auction, you cannot submit bids against your own listed item. Other eligible combatants can submit bids.
            </p>
          </div>
        ) : isAuctionPaused ? (
          <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl text-center space-y-2 animate-in fade-in">
            <div className="flex items-center justify-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
              <Pause className="w-4 h-4 text-amber-500" />
              <span>Auction Temporarily Paused</span>
            </div>
            <p className="text-xs text-stone-300 max-w-md mx-auto leading-relaxed">
              The seller who posted this item has paused the auction. The countdown timer is frozen and new bids cannot be placed until the seller clicks resume.
            </p>
          </div>
        ) : isBiddingRestricted ? (
          <div className="space-y-6">
            {banStatus.isBanned ? (
              <div className="bg-rose-500/10 border border-rose-500/20 p-5 rounded-2xl flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-2 w-full">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-rose-400 uppercase tracking-wider">
                      Bidding Restricted: Account Banned
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {banStatus.formattedText}
                    </span>
                  </div>
                  <p className="text-stone-300 text-xs leading-relaxed">
                    Your account has been placed under an administrative ban. Submitting bids in auctions is strictly restricted during this period.
                  </p>
                  {(userProfile as any)?.banReason && (
                    <p className="text-xs text-stone-400 bg-stone-950/60 p-2.5 rounded-xl border border-stone-850">
                      <strong className="text-rose-400">Ban Reason:</strong> {(userProfile as any).banReason}
                    </p>
                  )}
                  {banStatus.untilDate && (
                    <p className="text-xs text-rose-400 font-bold">
                      RESTRICTION ENDS: {banStatus.untilDate.toLocaleString()}
                    </p>
                  )}
                  {banStatus.isPermanent && (
                    <p className="text-xs text-rose-500 font-bold">
                      RESTRICTION CATEGORY: PERMANENT BAN
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-2xl flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-black text-amber-500 uppercase tracking-wider mb-1">
                    Bidding privileges restricted
                  </h4>
                  <p className="text-stone-300 text-xs leading-relaxed">
                    Your privileges to submit bids in the Arena have been suspended due to violations of our community policies regarding bidding behaviors.
                  </p>
                  {userProfile?.biddingRestrictedUntil && (
                    <p className="text-xs text-amber-400 font-bold mt-2">
                      RESTRICTION ENDS: {(() => {
                        const ru = userProfile.biddingRestrictedUntil;
                        const d = ru.toDate ? ru.toDate() : (ru.seconds ? new Date(ru.seconds * 1000) : new Date(ru));
                        return d.toLocaleString();
                      })()}
                    </p>
                  )}
                  {userProfile?.biddingRestrictedPermanently && (
                    <p className="text-xs text-rose-500 font-bold mt-2">
                      RESTRICTION CATEGORY: PERMANENT
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Appeal Status / Submit Appeal Section */}
            {userProfile?.biddingAppealStatus === 'pending' ? (
              <div className="bg-stone-950/40 border border-stone-850 p-6 rounded-2xl text-center space-y-3">
                <CheckCircle2 className="w-8 h-8 text-amber-500 mx-auto animate-pulse" />
                <h5 className="text-xs font-black text-white uppercase tracking-wider">Appeal Pending Review</h5>
                <p className="text-xs text-stone-400 leading-normal">
                  Your clearance request has been successfully submitted to the Arena commanders and is currently under official review. You will be notified of the outcome as soon as possible.
                </p>
              </div>
            ) : (
              <form onSubmit={handleAppealSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-stone-300 uppercase tracking-widest">
                    Submit Clearance Appeal
                  </label>
                  <p className="text-xs text-stone-300 font-medium mb-2 leading-relaxed">
                    Provide a formal justification explaining your case. If accepted, administrators will restore normal bidding access.
                  </p>
                  <textarea
                    required
                    rows={4}
                    value={appealMessage}
                    onChange={(e) => setAppealMessage(e.target.value)}
                    placeholder="Describe your case, justification or any administrative misunderstandings here..."
                    className="w-full bg-stone-950 border border-stone-800 rounded-2xl p-4 text-white text-xs leading-relaxed outline-none focus:border-amber-500 transition-all resize-none"
                  />
                </div>

                {appealError && (
                  <div className="text-xs font-bold text-rose-500 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                    {appealError}
                  </div>
                )}

                {appealSuccess && (
                  <div className="text-xs font-bold text-emerald-500 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                    Appeal submitted successfully! It is now pending administrative review.
                  </div>
                )}

                <ArenaButton
                  type="submit"
                  isLoading={appealLoading}
                  disabled={!appealMessage.trim()}
                  variant="secondary"
                  className="w-full py-4"
                >
                  Submit Appeal
                </ArenaButton>
              </form>
            )}
          </div>
        ) : (
          <>
            {/* Available Credits Card */}
            {user && (
              <div className={`mb-6 p-4 bg-stone-950/80 border ${isDemoMode ? 'border-amber-500/30' : 'border-stone-800'} rounded-2xl space-y-2.5`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-bold text-stone-300 uppercase tracking-widest">
                      {isDemoMode ? 'Available DEMO Credits:' : 'Available Credits:'}
                    </span>
                    <span className="text-sm font-mono font-black text-amber-400">
                      {creditsBalance ?? 0}
                    </span>
                    {isDemoMode && (
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        DEMO MODE
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={openPurchase}
                    className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    {isDemoMode ? <Sparkles className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    {isDemoMode ? 'Demo Details' : 'Get Credits'}
                  </button>
                </div>

                <div className="text-[11px] text-stone-400 font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{isDemoMode ? '1 DEMO Credit will be used for this bid.' : '1 Credit will be used for this bid.'}</span>
                </div>

                {(creditsBalance ?? 0) < 1 && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-bold text-rose-400 flex items-center justify-between gap-2">
                    <span>{isDemoMode ? 'Insufficient DEMO credits. You need at least 1 DEMO credit to place a bid.' : 'Insufficient credits. You need at least 1 credit to place a bid.'}</span>
                    <button
                      type="button"
                      onClick={openPurchase}
                      className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 transition-all cursor-pointer"
                    >
                      {isDemoMode ? 'Demo Info' : 'Acquire'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {user && remainingBids !== undefined && (
              <div className="mb-6 flex items-center justify-between p-4 bg-stone-950/40 border border-stone-850 rounded-2xl">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-stone-300 uppercase tracking-widest">Strategic Bids Remaining</span>
                  <span className="text-xs text-stone-400 font-medium mt-0.5">Max 10 bids permitted per listed item</span>
                </div>
                <div className={`text-sm font-black font-mono px-3 py-1 rounded-xl border ${
                  remainingBids <= 2 
                    ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse' 
                    : 'bg-stone-900 text-stone-300 border-stone-800'
                }`}>
                  {remainingBids} Left
                </div>
              </div>
            )}

             {/* Custom Bid Input & Placement */}
            <div className="space-y-4">
              {/* Select Bid Amount or Enter Manually */}
              <div className="space-y-3">
                {/* Header & Clear Option */}
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
                        setError(null);
                      }}
                      className="text-[10px] font-bold text-stone-400 hover:text-rose-400 uppercase tracking-wider cursor-pointer transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Quick Selection Chips */}
                {user && !isHighestBidder && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                      Quick Amount Options:
                    </p>
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 pt-0.5">
                      {quickBids.map((qb) => {
                        const isSelected = customBid === qb.amount.toString() || Number(customBid) === qb.amount;
                        return (
                          <button
                            key={qb.amount}
                            type="button"
                            onClick={() => {
                              setCustomBid(qb.amount.toString());
                              setError(null);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer border flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-amber-500 text-stone-955 border-amber-400 shadow-md shadow-amber-500/20 scale-102 ring-2 ring-amber-400/40'
                                : 'bg-stone-950 hover:bg-stone-850 text-stone-300 hover:text-white border-stone-800 hover:border-amber-500/40'
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

                {/* Manual Bid Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                      Or Enter Custom Bid:
                    </span>
                    <span className="text-[10px] font-mono text-stone-400">
                      Min: {formatPrice(minNextBid, itemCurrencySymbol)}
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="number"
                      value={customBid}
                      onChange={(e) => {
                        setCustomBid(e.target.value);
                        setError(null);
                      }}
                      disabled={!user || isAuctionPaused || loading || (creditsBalance ?? 0) < 1 || isHighestBidder}
                      placeholder={isAuctionPaused ? 'Listing paused by seller' : user ? `Enter amount (min ${formatPrice(minNextBid, itemCurrencySymbol)})` : 'Sign in to bid'}
                      className={`w-full bg-stone-950 border rounded-2xl p-4 pl-14 sm:pl-16 pr-10 text-white font-mono font-black focus:border-amber-500 outline-none transition-all disabled:opacity-50 text-sm sm:text-base ${
                        customBid && Number(customBid) < minNextBid 
                          ? 'border-rose-500/60 focus:border-rose-500' 
                          : customBid 
                            ? 'border-amber-500/70' 
                            : 'border-stone-800'
                      }`}
                    />
                    <span className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 text-amber-400 font-black text-xs sm:text-sm pointer-events-none select-none tracking-tight">
                      {itemCurrencySymbol}
                    </span>
                    {customBid && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomBid('');
                          setError(null);
                        }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-700 cursor-pointer"
                        title="Clear amount"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Selected Amount Summary Pill when amount is chosen */}
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

              <ThreeDButton
                id="arena-panel-place-bid-btn"
                onClick={() => triggerBid()}
                disabled={
                  !user || 
                  isUserAdminBanned ||
                  isBiddingRestricted ||
                  isAuctionPaused ||
                  loading || 
                  (creditsBalance ?? 0) < 1 || 
                  isHighestBidder || 
                  !customBid || 
                  customBid.trim() === '' || 
                  isNaN(Number(customBid)) || 
                  Number(customBid) < minNextBid
                }
                variant="amber"
                size="md"
                noShadow={true}
                icon={loading ? Loader2 : isAuctionPaused ? Pause : Gavel}
                label={
                  loading 
                    ? 'PLACING BID...' 
                    : (isUserAdminBanned || banStatus.isBanned)
                      ? 'BIDDING RESTRICTED (BANNED)'
                      : isBiddingRestricted
                        ? 'BIDDING PRIVILEGES SUSPENDED'
                        : isAuctionPaused
                          ? 'LISTING PAUSED BY SELLER'
                          : !user 
                            ? 'SIGN IN TO PLACE BID'
                            : isHighestBidder 
                              ? 'YOU ARE HIGHEST BIDDER' 
                              : (!customBid || customBid.trim() === '')
                                ? 'SELECT OR ENTER BID AMOUNT'
                                : (Number(customBid) < minNextBid)
                                  ? `MIN BID IS ${formatPrice(minNextBid, itemCurrencySymbol)}`
                                  : `PLACE BID (${formatPrice(Number(customBid), itemCurrencySymbol)})`
                }
              />

              {/* Feedback */}
              <AnimatePresence mode="wait">
                {!user && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-amber-500/10 border border-amber-500/30 text-amber-500 p-4 rounded-2xl flex items-start gap-3"
                  >
                    <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-relaxed">
                      Only registered users can submit bids for active battles. Please log in or sign up above.
                    </p>
                  </motion.div>
                )}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 rounded-2xl flex items-start gap-3 border bg-rose-500/10 border-rose-500/30 text-rose-500"
                  >
                    <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-bold leading-relaxed">{error}</p>
                  </motion.div>
                )}
                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 p-4 rounded-2xl flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <p className="text-xs font-bold uppercase tracking-widest">Bid Registered in Arena</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {isOwner && (
                <div className="mt-6 pt-6 border-t border-stone-800/80 space-y-4 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-black text-white uppercase tracking-wider">Commander View Dashboard</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850">
                      <p className="text-[10px] font-bold text-stone-400 uppercase mb-1">Views</p>
                      <p className="text-lg font-black text-white">{auction.viewsCount.toLocaleString()}</p>
                    </div>
                    <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850">
                      <p className="text-[10px] font-bold text-stone-400 uppercase mb-1">Watchers</p>
                      <p className="text-lg font-black text-white">{auction.watchersCount.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
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
        currencySymbol={itemCurrencySymbol}
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
        onConfirm={handleGoLive}
        item={auction}
        loading={actionLoading}
      />

      {/* SELLER PROMOTION MODAL: FEATURED / BOOST (PAID APPLICATION FLOW) */}
      {showPromoteModal && user && isOwner && (
        <ArenaModal
          isOpen={showPromoteModal}
          onClose={() => setShowPromoteModal(false)}
          title={promoteCategory === 'FEATURED' ? "Promote Asset — Featured Ads" : "Boost Asset — Instant Traffic"}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-4 pt-1">
            <BadgeActivities
              user={user}
              defaultCategory={promoteCategory}
              defaultListingId={auction.id}
              autoOpenApplyForm={true}
            />
          </div>
        </ArenaModal>
      )}
    </div>
  );
};
