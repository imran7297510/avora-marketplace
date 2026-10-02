import React, { useState, useMemo } from 'react';
import { NegotiationOffer, NegotiationStatus } from '../types';
import { History, ShieldAlert, Check, X, ArrowRight, Send } from 'lucide-react';
import { formatPKR, cn } from '../../../lib/utils';
import { parseSafeDate } from '../utils/arena';
import { OfferConfirmationModal } from './shared/OfferConfirmationModal';
import { ReportButton } from './ReportButton';

interface NegotiationTimelineProps {
  offers: NegotiationOffer[];
  buyerId: string;
  sellerId: string;
  currentStatus: NegotiationStatus;
  currentUserId?: string;
  isSeller?: boolean;
  isBuyer?: boolean;
  isAdmin?: boolean;
  isActualParticipant?: boolean;
  activeFilter?: 'all' | 'counter' | 'accepted';
  onRespond?: (action: 'accept' | 'decline' | 'withdraw' | 'cancel') => void;
  onCounter?: (amount: number, message: string) => void;
  onSendMessage?: () => void;
  onViewAgreement?: () => void;
  onContact?: () => void;
  onDeleteMessage?: (offerId: string) => Promise<void>;
  onViewTimeline?: () => void;
  currency?: string;
  currencySymbol?: string;
}

const formatTimeAgo = (date: Date | null | undefined): string => {
  if (!date || isNaN(new Date(date).getTime())) return 'Just now';
  const d = new Date(date);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remHours = hours % 24;
    const remMins = minutes % 60;
    return `${days} Day${days > 1 ? 's' : ''}${remHours > 0 ? ` ${remHours} hour${remHours > 1 ? 's' : ''}` : ''}${remMins > 0 ? ` ${remMins} minute${remMins > 1 ? 's' : ''}` : ''} ago`;
  }
  if (hours > 0) {
    const remMins = minutes % 60;
    return `${hours} hour${hours > 1 ? 's' : ''}${remMins > 0 ? ` ${remMins} minute${remMins > 1 ? 's' : ''}` : ''} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
};

export const NegotiationTimeline: React.FC<NegotiationTimelineProps> = React.memo(({ 
  offers, 
  buyerId, 
  sellerId,
  currentStatus,
  currentUserId,
  isSeller,
  isBuyer,
  isAdmin = false,
  isActualParticipant = true,
  activeFilter = 'all',
  onRespond,
  onCounter,
  currency,
  currencySymbol,
}) => {
  const [activeCounterOfferId, setActiveCounterOfferId] = useState<string | null>(null);
  const [localCounterAmount, setLocalCounterAmount] = useState<string>('');
  const [localMessage, setLocalMessage] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Determine if viewing user is the actual listing seller or simulated seller
  const actualIsSeller = Boolean(
    isSeller || 
    (currentUserId && (
      currentUserId === sellerId || 
      currentUserId === 'simulated-seller' || 
      currentUserId === 'seller'
    ))
  );

  // Determine if viewing user is the buyer participant in this negotiation
  const isBuyerParticipant = Boolean(
    (!actualIsSeller && (
      isBuyer || 
      (currentUserId && (
        currentUserId === buyerId || 
        currentUserId === 'simulated-buyer' || 
        currentUserId === 'buyer'
      ))
    ))
  );

  // Determine if viewer is a public third-party observer
  const isPublicUser = !actualIsSeller && !isBuyerParticipant && !isAdmin;

  // Filter out any withdrawn offers so they disappear completely and permanently
  const validOffers = offers.filter(o => o.action !== 'withdraw' && (o as any).status !== 'withdrawn');

  // Authoritatively compute the chronologically latest offer sent in the sequence
  const latestOffer = useMemo(() => {
    if (validOffers.length === 0) return null;
    return [...validOffers].sort((a, b) => {
      const timeA = parseSafeDate(a.timestamp)?.getTime() || 0;
      const timeB = parseSafeDate(b.timestamp)?.getTime() || 0;
      return timeB - timeA;
    })[0];
  }, [validOffers]);

  // For 'all' and 'counter' views, the incoming offers are already sorted according to the selected offer filter.
  // For other views (e.g. 'accepted'), preserve the default display ordering.
  const displayOffers = useMemo(() => {
    if (activeFilter === 'all' || activeFilter === 'counter') {
      return validOffers;
    }
    return [...validOffers].reverse();
  }, [validOffers, activeFilter]);

  const normalizedCurrentStatus = (currentStatus || '').toLowerCase().trim();
  const isConcludedOrAccepted = ['accepted', 'completed', 'concluded'].includes(normalizedCurrentStatus) || 
    latestOffer?.action === 'accept' || 
    latestOffer?.action === 'complete' ||
    validOffers.some(o => o.action === 'accept' || o.action === 'complete');

  const isNegotiationActive = !isConcludedOrAccepted && [
    'open', 
    'offer_sent', 
    'counter_offered',
    'submitted',
    'pending',
    'active'
  ].includes(normalizedCurrentStatus);

  // Helper to determine if an offer was submitted by the current active viewing user
  const isOfferSubmittedByMe = (offerSenderId: string) => {
    if (currentUserId && (
      offerSenderId === currentUserId || 
      (currentUserId === 'simulated-seller' && (offerSenderId === sellerId || offerSenderId === 'seller')) || 
      (currentUserId === 'simulated-buyer' && (offerSenderId === buyerId || offerSenderId === 'buyer'))
    )) {
      return true;
    }
    const senderIsSeller = offerSenderId === sellerId || offerSenderId === 'seller' || offerSenderId === 'simulated-seller' || ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(offerSenderId);
    if (actualIsSeller && senderIsSeller) return true;
    if (isBuyerParticipant && !senderIsSeller && (offerSenderId === buyerId || offerSenderId === currentUserId || offerSenderId === 'simulated-buyer' || offerSenderId === 'buyer')) return true;
    return false;
  };

  /**
   * STRICT MESSAGE VISIBILITY CHECK:
   * A. EXACT SELLER: May see attached messages submitted by buyers for this listing.
   * B. EXACT BUYER: May see own attached messages and seller counter messages in this negotiation.
   * C. PUBLIC USERS: NEVER see attached messages.
   * D. ADMINS/MODERATORS (in participant views): NEVER see attached messages.
   */
  const canViewOfferMessage = (offer: NegotiationOffer): boolean => {
    if (!offer.message || offer.message.trim().length === 0) return false;
    
    // Public user -> NEVER
    if (isPublicUser) return false;
    // Admin in standard view -> NEVER
    if (isAdmin && !actualIsSeller && !isBuyerParticipant) return false;

    // Seller viewing buyer offer
    if (actualIsSeller) {
      return true;
    }

    // Buyer viewing own offer
    if (isBuyerParticipant) {
      const isOfferSenderSeller = offer.senderId === sellerId || offer.senderId === 'seller' || offer.senderId === 'simulated-seller' || ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(offer.senderId);
      const isMyOffer = isOfferSubmittedByMe(offer.senderId) || offer.senderId === buyerId;
      // Buyer can see own offer messages and seller counter messages sent to them
      if (isMyOffer || isOfferSenderSeller) {
        return true;
      }
    }

    return false;
  };

  return (
    <div className="relative border-l border-amber-500/20 ml-3.5 sm:ml-4 pl-5 sm:pl-8 space-y-6 py-2 w-full max-h-[650px] overflow-y-auto pr-1 sm:pr-2 scrollbar-none">
      {displayOffers.map((offer, index) => {
        const timeAgoStr = formatTimeAgo(offer.timestamp);
        const isOfferSenderSeller = offer.senderId === sellerId || offer.senderId === 'seller' || offer.senderId === 'simulated-seller' || ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(offer.senderId);
        const isAcceptedOfferItem = offer.action === 'accept' || offer.action === 'complete' || (isConcludedOrAccepted && offer.id === latestOffer?.id);
        const isSubmittedBySelf = isOfferSubmittedByMe(offer.senderId);
        const isLatestOfferInSeq = Boolean(latestOffer && latestOffer.id === offer.id);

        // Tactical action authorization calculations
        const canSellerRespond = actualIsSeller && isNegotiationActive && isLatestOfferInSeq && !isOfferSenderSeller;
        const canBuyerRespond = isBuyerParticipant && isNegotiationActive && isLatestOfferInSeq && isOfferSenderSeller;
        const canBuyerWithdraw = isBuyerParticipant && isNegotiationActive && isLatestOfferInSeq && isSubmittedBySelf && !isConcludedOrAccepted && normalizedCurrentStatus !== 'expired';
        const canSellerWithdraw = actualIsSeller && isNegotiationActive && isLatestOfferInSeq && isSubmittedBySelf && !isConcludedOrAccepted && normalizedCurrentStatus !== 'expired';

        const showAttachedMessage = canViewOfferMessage(offer);

        // 1. ALL OFFERS VIEW (Full Chronological Sequence)
        if (activeFilter === 'all') {
          return (
            <div key={offer.id || index} className="relative w-full group animate-fade-in text-left">
              <div className={cn(
                "absolute -left-[29px] sm:-left-[41px] top-5 w-4 h-4 rounded-full border-2 z-10 flex items-center justify-center shadow-lg",
                isAcceptedOfferItem
                  ? "border-emerald-400 bg-emerald-500 shadow-emerald-500/20"
                  : offer.action === 'decline'
                  ? "border-rose-400 bg-rose-500 shadow-rose-500/20"
                  : offer.action === 'withdraw'
                  ? "border-stone-500 bg-stone-600 shadow-stone-500/20"
                  : "border-amber-400 bg-amber-500 shadow-amber-500/20"
              )}>
                <div className="w-1.5 h-1.5 bg-stone-955 rounded-full" />
              </div>

              <div className={cn(
                "p-4 sm:p-5 rounded-2xl border shadow-xl space-y-3 transition-all duration-200",
                isAcceptedOfferItem
                  ? "border-emerald-500/30 bg-emerald-500/10 shadow-emerald-500/5"
                  : offer.action === 'decline'
                  ? "border-rose-500/20 bg-stone-900/90"
                  : offer.action === 'withdraw'
                  ? "border-stone-700/30 bg-stone-900/90"
                  : "border-white/5 bg-stone-900/90"
              )}>
                {/* Row 1: Action Header, Time, & Report Button */}
                <div className="flex items-center justify-between text-xs sm:text-sm font-bold flex-wrap gap-2">
                  <span className={cn(
                    "flex items-center gap-1.5",
                    isAcceptedOfferItem
                      ? "text-emerald-400 font-black uppercase tracking-wider"
                      : offer.action === 'decline'
                      ? "text-rose-400 font-black uppercase tracking-wider"
                      : offer.action === 'withdraw'
                      ? "text-stone-400 font-black uppercase tracking-wider"
                      : "text-amber-400 font-black uppercase tracking-wider"
                  )}>
                    {isAcceptedOfferItem
                      ? '✓ Offer Accepted & Secured'
                      : offer.action === 'decline'
                      ? '✕ Offer Declined'
                      : offer.action === 'withdraw'
                      ? '🛡 Offer Withdrawn'
                      : offer.action === 'counter'
                      ? (isOfferSenderSeller ? 'Seller Counter Offer' : (isSubmittedBySelf ? 'My Counter Offer' : 'Buyer Counter Offer'))
                      : (isOfferSenderSeller ? 'Seller Offer Submitted' : (isSubmittedBySelf ? 'My Offer Submitted' : 'Buyer Offer Submitted'))}
                  </span>

                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-stone-400 font-medium text-[11px] sm:text-xs">{timeAgoStr}</span>
                    {!isSubmittedBySelf && (
                      <ReportButton 
                        targetId={offer.id || `offer-${index}`} 
                        targetType="offer" 
                        targetTitle={`Offer: ${formatPKR(offer.amount, offer.currency || currency || 'PKR')}`}
                        targetOwnerId={offer.senderId}
                        variant="ghost"
                        showText={false}
                        className="p-1 text-stone-500 hover:text-rose-400"
                      />
                    )}
                  </div>
                </div>

                {/* Row 2: Price offered & Settled Criteria Status Badge */}
                <div className="flex items-center justify-between pt-1 gap-4 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg sm:text-2xl font-black text-white italic tracking-tighter">
                      {formatPKR(offer.amount, offer.currency || currency || 'PKR')}
                    </span>
                    {isAcceptedOfferItem ? (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                        Agreed Price
                      </span>
                    ) : offer.action === 'decline' ? (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-0.5 rounded-full">
                        Decided • Declined
                      </span>
                    ) : offer.action === 'withdraw' ? (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-stone-500/20 text-stone-400 border border-stone-500/30 px-2.5 py-0.5 rounded-full">
                        Decided • Withdrawn
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                        {isLatestOfferInSeq ? 'Latest Submitted • Settled Criteria' : 'Settled Criteria'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Attached message - Visible strictly under authorized role rules */}
                {showAttachedMessage && offer.message && (
                  <div className="p-3 bg-stone-955/80 border border-white/5 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-stone-500 tracking-wider block mb-1">Attached Message</span>
                    <p className="text-xs text-stone-300 leading-relaxed italic">
                      "{offer.message}"
                    </p>
                  </div>
                )}

                {/* Tactical Action Buttons for Exact Seller on Active Buyer Offer */}
                {canSellerRespond && (
                  <div className="pt-3 border-t border-white/5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRespond?.('accept')}
                      className="min-h-[44px] px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-stone-955 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" /> Accept
                    </button>

                    <button
                      type="button"
                      onClick={() => onRespond?.('decline')}
                      className="min-h-[44px] px-3.5 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5 shrink-0" /> Reject / decline
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveCounterOfferId(activeCounterOfferId === offer.id ? null : offer.id)}
                      className="min-h-[44px] px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-955 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" /> Counter offer
                    </button>

                    {!isSubmittedBySelf && (
                      <ReportButton 
                        targetId={offer.id || `offer-${index}`} 
                        targetType="offer" 
                        targetTitle={`Buyer Offer: ${formatPKR(offer.amount, offer.currency || currency || 'PKR')}`}
                        targetOwnerId={offer.senderId}
                        variant="outline"
                        label="Report Offer"
                        className="min-h-[44px] ml-auto text-xs"
                      />
                    )}
                  </div>
                )}

                {/* Tactical Action Buttons for Exact Buyer on Seller Counter Offer */}
                {canBuyerRespond && (
                  <div className="pt-3 border-t border-white/5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRespond?.('accept')}
                      className="min-h-[44px] px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-stone-955 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" /> Accept
                    </button>

                    <button
                      type="button"
                      onClick={() => onRespond?.('decline')}
                      className="min-h-[44px] px-3.5 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5 shrink-0" /> Reject / decline
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveCounterOfferId(activeCounterOfferId === offer.id ? null : offer.id)}
                      className="min-h-[44px] px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-955 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" /> Counter offer
                    </button>

                    {!isSubmittedBySelf && (
                      <ReportButton 
                        targetId={offer.id || `offer-${index}`} 
                        targetType="offer" 
                        targetTitle={`Seller Counter: ${formatPKR(offer.amount, offer.currency || currency || 'PKR')}`}
                        targetOwnerId={offer.senderId}
                        variant="outline"
                        label="Report Offer"
                        className="min-h-[44px] ml-auto text-xs"
                      />
                    )}
                  </div>
                )}

                {/* Submitter Action: Withdraw Offer when awaiting counterparty response */}
                {((canBuyerWithdraw) || (canSellerWithdraw)) && (
                  <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-stone-400 text-[11px] font-medium italic">
                      Your proposal is submitted. Awaiting {actualIsSeller ? 'Buyer' : 'Seller'}'s response...
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onRespond?.('withdraw')}
                        className="min-h-[44px] px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700/50 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-500" /> Withdraw offer
                      </button>
                    </div>
                  </div>
                )}

                {/* Public User Only: Report Offer Button */}
                {isPublicUser && !isSubmittedBySelf && (
                  <div className="pt-2 border-t border-white/5 flex items-center justify-end">
                    <ReportButton 
                      targetId={offer.id || `offer-${index}`} 
                      targetType="offer" 
                      targetTitle={`Public Offer: ${formatPKR(offer.amount, offer.currency || currency || 'PKR')}`}
                      targetOwnerId={offer.senderId}
                      variant="outline"
                      label="Report Offer"
                      className="text-xs"
                    />
                  </div>
                )}

                {/* Inline Counter Offer Input Form */}
                {activeCounterOfferId === offer.id && (canSellerRespond || canBuyerRespond) && (
                  <div className="mt-4 p-5 bg-stone-955 border border-amber-500/30 rounded-2xl space-y-4 animate-fade-in text-left">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-amber-400 uppercase italic tracking-wider">Submit Counter Offer</h5>
                      <button 
                        type="button"
                        onClick={() => setActiveCounterOfferId(null)}
                        className="text-stone-400 hover:text-white text-xs font-black uppercase tracking-widest cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-stone-400 tracking-wider">Counter Amount ({(offers?.[0] as any)?.currency || currency || 'PKR'})</label>
                        <input 
                          type="number"
                          value={localCounterAmount}
                          onChange={(e) => setLocalCounterAmount(e.target.value)}
                          placeholder="Enter counter offer amount..."
                          className="w-full bg-stone-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-stone-400 tracking-wider">Attached Message (Optional)</label>
                        <textarea 
                          value={localMessage}
                          onChange={(e) => setLocalMessage(e.target.value)}
                          placeholder="Add an optional note to your counter offer..."
                          rows={2}
                          className="w-full bg-stone-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-amber-500/50 resize-none"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={!localCounterAmount || parseFloat(localCounterAmount) <= 0}
                        onClick={() => setShowConfirmModal(true)}
                        className="w-full min-h-[44px] py-3 bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Send className="w-3.5 h-3.5" /> Send Counter Offer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }

        // 2. COUNTERED OFFERS VIEW
        if (activeFilter === 'counter') {
          const isLatestCounterOffer = Boolean(latestOffer && latestOffer.id === offer.id);
          const isThisAccepted = isAcceptedOfferItem || (isConcludedOrAccepted && (offer.id === latestOffer?.id || offer.action === 'accept' || offer.action === 'complete'));

          return (
            <div key={offer.id || index} className="relative w-full group animate-fade-in text-left">
              <div className={cn(
                "absolute -left-[29px] sm:-left-[41px] top-5 w-4 h-4 rounded-full border-2 z-10 flex items-center justify-center shadow-lg",
                isThisAccepted
                  ? "border-emerald-400 bg-emerald-500 shadow-emerald-500/20"
                  : "border-amber-400 bg-amber-500 shadow-amber-500/20"
              )}>
                <div className="w-1.5 h-1.5 bg-stone-955 rounded-full" />
              </div>

              <div className={cn(
                "p-4 sm:p-5 rounded-2xl border shadow-xl space-y-3 transition-all duration-200",
                isThisAccepted
                  ? "border-emerald-500/30 bg-emerald-500/10 shadow-emerald-500/5"
                  : "border-amber-500/20 bg-stone-900/95"
              )}>
                {/* Row 1: Header, Time & Report Button */}
                <div className="flex items-center justify-between text-xs sm:text-sm font-bold flex-wrap gap-2">
                  <span className={cn(
                    "flex items-center gap-1.5 font-black uppercase tracking-wider",
                    isThisAccepted ? "text-emerald-400" : "text-amber-400"
                  )}>
                    {isThisAccepted
                      ? '✓ Counter Offer Accepted & Secured'
                      : (isOfferSenderSeller ? 'Seller Counter Offer' : (isSubmittedBySelf ? 'My Counter Offer' : 'Buyer Counter Offer'))}
                  </span>

                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-stone-400 font-medium text-[11px] sm:text-xs">{timeAgoStr}</span>
                    {!isSubmittedBySelf && (
                      <ReportButton 
                        targetId={offer.id || `counter-${index}`} 
                        targetType="offer" 
                        targetTitle={`Counter Offer: ${formatPKR(offer.amount, offer.currency || currency || 'PKR')}`}
                        targetOwnerId={offer.senderId}
                        variant="ghost"
                        showText={false}
                        className="p-1 text-stone-500 hover:text-rose-400"
                      />
                    )}
                  </div>
                </div>

                {/* Amount Section */}
                <div className="flex items-center justify-between pt-1 gap-4 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg sm:text-2xl font-black text-white italic tracking-tighter">
                      {formatPKR(offer.amount, offer.currency || currency || 'PKR')}
                    </span>
                    {isThisAccepted ? (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                        Agreed Price
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                        Settled Criteria
                      </span>
                    )}
                  </div>
                </div>

                {/* Attached message - strictly checked */}
                {showAttachedMessage && offer.message && (
                  <div className="p-3 bg-stone-955/80 border border-white/5 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-stone-500 tracking-wider block mb-1">Attached Message</span>
                    <p className="text-xs text-stone-300 leading-relaxed italic">
                      "{offer.message}"
                    </p>
                  </div>
                )}

                {/* Interactive Options Bar for Recipient on Active Counter Offer */}
                {isLatestCounterOffer && isNegotiationActive && ((canSellerRespond) || (canBuyerRespond)) && (
                  <div className="pt-3 border-t border-white/5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRespond?.('accept')}
                      className="min-h-[44px] px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-stone-955 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" /> Accept
                    </button>

                    <button
                      type="button"
                      onClick={() => onRespond?.('decline')}
                      className="min-h-[44px] px-3.5 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5 shrink-0" /> Reject / decline
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveCounterOfferId(activeCounterOfferId === offer.id ? null : offer.id)}
                      className="min-h-[44px] px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-955 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" /> Counter offer
                    </button>

                    {!isSubmittedBySelf && (
                      <ReportButton 
                        targetId={offer.id || `counter-${index}`} 
                        targetType="offer" 
                        targetTitle={`Counter: ${formatPKR(offer.amount, offer.currency || currency || 'PKR')}`}
                        targetOwnerId={offer.senderId}
                        variant="outline"
                        label="Report Offer"
                        className="min-h-[44px] ml-auto text-xs"
                      />
                    )}
                  </div>
                )}

                {/* Submitter Action: Withdraw Option */}
                {isLatestCounterOffer && isNegotiationActive && isSubmittedBySelf && !isConcludedOrAccepted && normalizedCurrentStatus !== 'expired' && (
                  <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-stone-400 text-[11px] font-medium italic">
                      Your counter offer has been submitted. Awaiting response...
                    </span>
                    <button
                      type="button"
                      onClick={() => onRespond?.('withdraw')}
                      className="min-h-[44px] px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700/50 text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-500" /> Withdraw offer
                    </button>
                  </div>
                )}

                {/* Public User Only: Report Offer */}
                {isPublicUser && !isSubmittedBySelf && (
                  <div className="pt-2 border-t border-white/5 flex items-center justify-end">
                    <ReportButton 
                      targetId={offer.id || `counter-${index}`} 
                      targetType="offer" 
                      targetTitle={`Public Counter: ${formatPKR(offer.amount, offer.currency || currency || 'PKR')}`}
                      targetOwnerId={offer.senderId}
                      variant="outline"
                      label="Report Offer"
                      className="text-xs"
                    />
                  </div>
                )}

                {/* Inline Counter Offer Input Form */}
                {activeCounterOfferId === offer.id && ((canSellerRespond) || (canBuyerRespond)) && (
                  <div className="mt-4 p-5 bg-stone-955 border border-amber-500/30 rounded-2xl space-y-4 animate-fade-in text-left">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-black text-amber-400 uppercase italic tracking-wider">Submit Counter Offer</h5>
                      <button 
                        type="button"
                        onClick={() => setActiveCounterOfferId(null)}
                        className="text-stone-400 hover:text-white text-xs font-black uppercase tracking-widest cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-stone-400 tracking-wider">Counter Amount ({(offers?.[0] as any)?.currency || currency || 'PKR'})</label>
                        <input 
                          type="number"
                          value={localCounterAmount}
                          onChange={(e) => setLocalCounterAmount(e.target.value)}
                          placeholder="Enter counter offer amount..."
                          className="w-full bg-stone-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-amber-500/50"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-stone-400 tracking-wider">Attached Message (Optional)</label>
                        <textarea 
                          value={localMessage}
                          onChange={(e) => setLocalMessage(e.target.value)}
                          placeholder="Add an optional note to your counter offer..."
                          rows={2}
                          className="w-full bg-stone-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-amber-500/50 resize-none"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={!localCounterAmount || parseFloat(localCounterAmount) <= 0}
                        onClick={() => setShowConfirmModal(true)}
                        className="w-full min-h-[44px] py-3 bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Send className="w-3.5 h-3.5" /> Send Counter Offer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }

        // 3. ACCEPTED OFFERS VIEW
        if (activeFilter === 'accepted') {
          return (
            <div key={offer.id || index} className="relative w-full group animate-fade-in text-left">
              <div className="absolute -left-[29px] sm:-left-[41px] top-5 w-4 h-4 rounded-full border-2 border-emerald-400 bg-emerald-500 z-10 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <div className="w-1.5 h-1.5 bg-stone-955 rounded-full" />
              </div>

              <div className="p-4 sm:p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 shadow-xl space-y-3">
                {/* Row 1: Header, time, & Report Button */}
                <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-emerald-400 flex-wrap gap-2">
                  <span className="flex items-center gap-1.5 uppercase tracking-wider font-black">
                    ✓ Final Accepted Deal
                  </span>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-stone-400 font-medium text-[11px] sm:text-xs">{timeAgoStr}</span>
                    {!isSubmittedBySelf && (
                      <ReportButton 
                        targetId={offer.id || `accepted-${index}`} 
                        targetType="offer" 
                        targetTitle={`Accepted Deal: ${formatPKR(offer.amount, offer.currency || currency || 'PKR')}`}
                        targetOwnerId={offer.senderId}
                        variant="ghost"
                        showText={false}
                        className="p-1 text-stone-500 hover:text-rose-400"
                      />
                    )}
                  </div>
                </div>

                {/* Row 2: Price offered */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-lg sm:text-2xl font-black text-white italic tracking-tighter">
                    {formatPKR(offer.amount, offer.currency || currency || 'PKR')}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                    Agreed Price
                  </span>
                </div>

                {/* Row 3: Attached message */}
                {showAttachedMessage && offer.message && (
                  <div className="p-3 bg-stone-950/80 border border-white/5 rounded-xl">
                    <span className="text-[9px] font-black uppercase text-stone-500 tracking-wider block mb-1">Attached Message</span>
                    <p className="text-xs text-stone-300 leading-relaxed italic">
                      "{offer.message}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        }

        return null;
      })}

      {validOffers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-stone-600 w-full bg-stone-900/40 rounded-[2rem] border border-stone-800/80 p-6 space-y-2 text-center">
          <History className="w-12 h-12 mb-2 opacity-20 text-stone-400" />
          <p className="text-xs font-black uppercase tracking-widest text-stone-300">
            {activeFilter === 'accepted'
              ? 'No Accepted Offer Yet'
              : activeFilter === 'counter'
              ? 'No Countered Offers Recorded'
              : 'No Tactical Movements Recorded'}
          </p>
          <p className="text-[11px] font-medium text-stone-500 max-w-sm text-center leading-relaxed">
            {activeFilter === 'accepted'
              ? 'Once an offer has been accepted by either the buyer or the seller, it will be secured and displayed in this section.'
              : activeFilter === 'counter'
              ? 'All active countered proposals and counter-offers will appear here.'
              : 'All tactical offers, counter-proposals, and timeline milestones for this negotiation session will be displayed here as they occur.'}
          </p>
        </div>
      )}

      {/* Reusable Confirmation Modal for Submitting Counter Offer */}
      <OfferConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={async () => {
          const finalMsg = localMessage.trim() || `Counter offer: ${formatPKR(Number(localCounterAmount), (offers?.[0] as any)?.currencySymbol || (offers?.[0] as any)?.currency || currencySymbol || currency)}`;
          await onCounter?.(parseFloat(localCounterAmount), finalMsg);
          setActiveCounterOfferId(null);
          setLocalCounterAmount('');
          setLocalMessage('');
          setShowConfirmModal(false);
        }}
        amount={localCounterAmount}
        currencySymbol={(offers?.[0] as any)?.currencySymbol || (offers?.[0] as any)?.currency || currencySymbol || currency}
        title="Confirm Counter Offer"
        message="Are you sure you want to submit this counter offer to the buyer?"
        confirmText="Yes, Send Counter Offer"
        cancelText="Cancel"
        creditCost={0}
      />
    </div>
  );
});
