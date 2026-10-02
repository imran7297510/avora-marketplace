import { useMemo } from 'react';
import { NegotiationStatus, ModerationStatus } from '../types';

export type NegotiationActionType = 
  | 'make_offer'
  | 'accept'
  | 'counter'
  | 'decline'
  | 'withdraw'
  | 'complete'
  | 'send_message'
  | 'view_agreement'
  | 'contact'
  | 'view_timeline'
  | 'report'
  | 'view_auction'
  // Admin actions
  | 'admin_warning'
  | 'admin_suspend'
  | 'admin_ban'
  | 'admin_force_close'
  | 'admin_remove';

export interface NegotiationActionContext {
  status: NegotiationStatus;
  isBuyer: boolean;
  isSeller: boolean;
  isAdmin: boolean;
  lastOfferBy: string;
  userId: string;
  remainingOffers: number;
  isKycVerified: boolean;
  isBlocked?: boolean;
  moderationStatus?: ModerationStatus;
  isNegotiationLocked?: boolean;
  isAuctionActive?: boolean;
  listingStatus?: string;
  isAuthenticated: boolean;
  hasAcceptedOffer?: boolean;
  sellerId?: string;
  buyerId?: string;
}

/**
 * Single Source of Truth for Negotiation Action Visibility.
 * Guarantees no conflicting or duplicate actions are shown.
 */
export function useNegotiationActions(context: NegotiationActionContext) {
  const {
    status,
    isBuyer,
    isSeller,
    isAdmin,
    lastOfferBy,
    userId,
    remainingOffers,
    isKycVerified,
    isBlocked,
    moderationStatus,
    isNegotiationLocked,
    isAuctionActive,
    isAuthenticated,
    hasAcceptedOffer,
    sellerId,
    buyerId
  } = context;

  // Strict Role Differentiation: Seller can NEVER be buyer for their own item
  const realSeller = isSeller || (!!sellerId && userId === sellerId);
  const realBuyer = isBuyer && !realSeller;

  // Basic authorization checks
  const canPerformTacticalActions = isAuthenticated && !isBlocked && moderationStatus !== ModerationStatus.BANNED && moderationStatus !== ModerationStatus.SUSPENDED;
  
  const senderIsSeller = Boolean(
    lastOfferBy && (
      lastOfferBy === sellerId ||
      lastOfferBy === 'seller' ||
      lastOfferBy === 'simulated-seller' ||
      ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(lastOfferBy)
    )
  );

  const isYourTurn = useMemo(() => {
    if (!lastOfferBy) return false;
    
    if (realSeller) {
      return !senderIsSeller;
    }
    if (realBuyer) {
      return senderIsSeller;
    }
    return false;
  }, [lastOfferBy, realSeller, realBuyer, senderIsSeller]);

  // Exact check if the active/last offer was submitted by the current user:
  // 1. If lastOfferBy explicitly equals userId, or buyerId (when buyer), or sellerId (when seller)
  // 2. If realBuyer and the offer was sent by the buyer (!senderIsSeller)
  // 3. If realSeller and the offer was sent by the seller (senderIsSeller)
  const isOfferSubmittedByMe = Boolean(
    lastOfferBy && (
      lastOfferBy === userId ||
      (realBuyer && (lastOfferBy === buyerId || lastOfferBy === 'buyer' || lastOfferBy === 'simulated-buyer' || !senderIsSeller)) ||
      (realSeller && (lastOfferBy === sellerId || lastOfferBy === 'seller' || lastOfferBy === 'simulated-seller' || senderIsSeller))
    )
  );

  const isOutOfOffers = realBuyer && remainingOffers <= 0;

  const normalizedStatus = (status || '').toLowerCase().trim();
  const isConcluded = ['accepted', 'completed', 'concluded'].includes(normalizedStatus) || !!hasAcceptedOffer;
  const isExpiredOrClosed = ['expired', 'cancelled', 'declined', 'withdrawn'].includes(normalizedStatus);

  return useMemo(() => {
    let actions: NegotiationActionType[] = [];

    // 1. Critical Safeguards & Locks
    if (!isAuthenticated) return [];

    // 2. Admin Perspective (Unrestricted Visibility for Management)
    if (isAdmin) {
      actions.push('admin_warning', 'admin_suspend', 'admin_ban', 'admin_force_close', 'admin_remove');
    }

    // 3. User Perspective (Bilateral Rules)
    if (realBuyer || realSeller) {
      // Check if listing is active (live, not expired, not paused, not force closed)
      const isListingAvailable = isAuctionActive !== false;

      // Common visible actions regardless of state (unless locked/moderated)
      if (canPerformTacticalActions && !isNegotiationLocked) {
        // Actions allowed during active negotiation phases
        switch (normalizedStatus) {
          case 'open':
          case 'offer_sent':
          case 'counter_offered':
          case 'submitted':
          case 'pending':
          case 'active':
            if (normalizedStatus === 'open' && (!lastOfferBy || lastOfferBy === '')) {
              if (realBuyer && isListingAvailable && !isOutOfOffers && !isConcluded) {
                actions.push('make_offer');
              } else {
                actions.push('view_timeline');
              }
            } else if (isOfferSubmittedByMe && !isConcluded && !isExpiredOrClosed) {
              // Active offer submitted by this user awaiting counterparty response
              // The submitter can withdraw their pending offer if listing is available.
              // CRITICAL: The exact user/buyer who submitted the offer CANNOT report their own submitted offer!
              if (isListingAvailable) {
                actions.push('withdraw');
              }
            } else if (isYourTurn && !isConcluded && !isExpiredOrClosed) {
              // Counterparty's turn to respond to incoming offer/counter from the other party
              if (isListingAvailable) {
                actions.push('accept', 'decline');
                if (!isOutOfOffers) {
                  actions.push('counter');
                }
                // Counterparty can report incoming suspicious proposals
                actions.push('report');
              } else {
                actions.push('view_timeline');
              }
            }
            break;

          case 'accepted':
            if (realBuyer || realSeller) actions.push('send_message');
            actions.push('view_agreement', 'contact', 'view_timeline');
            break;

          case 'declined':
          case 'withdrawn':
            if (realBuyer && !isOutOfOffers && isAuctionActive && !isConcluded) {
              actions.push('make_offer', 'view_timeline');
            } else {
              actions.push('view_timeline');
            }
            break;

          case 'completed':
          case 'concluded':
            if (realBuyer || realSeller) actions.push('send_message');
            actions.push('view_agreement', 'contact', 'view_timeline');
            break;

          case 'expired':
            actions.push('view_timeline', 'view_auction');
            break;

          case 'cancelled':
            actions.push('view_timeline');
            break;
        }
      } else {
        // Limited visibility if restricted or locked
        actions.push('view_timeline');
        if (isConcluded) {
          actions.push('view_agreement');
        }
      }
    }

    // 4. Final Verification: Eliminate specific conflicts and duplicates
    // Once an offer is accepted, expired, or concluded, users CANNOT withdraw, make offers, counter, or decline.
    let finalActions = Array.from(new Set(actions)).filter(a => a !== 'view_timeline');

    if (isConcluded || isExpiredOrClosed) {
      const blockedWhenClosed = new Set<NegotiationActionType>(['withdraw', 'make_offer', 'accept', 'counter', 'decline']);
      finalActions = finalActions.filter(a => !blockedWhenClosed.has(a));
    }

    // CRITICAL POLICY ENFORCEMENT:
    // The exact user/buyer who has submitted the offer CANNOT report their own submitted offer.
    if (isOfferSubmittedByMe) {
      finalActions = finalActions.filter(a => a !== 'report');
    }

    return finalActions;
  }, [
    status, 
    isBuyer, 
    isSeller, 
    isAdmin, 
    lastOfferBy, 
    userId, 
    remainingOffers, 
    isKycVerified, 
    isBlocked, 
    moderationStatus, 
    isNegotiationLocked, 
    isAuctionActive, 
    isAuthenticated,
    isYourTurn,
    isOutOfOffers,
    isOfferSubmittedByMe,
    canPerformTacticalActions,
    hasAcceptedOffer,
    isConcluded,
    isExpiredOrClosed
  ]);
}
