import { UserProfile } from '../types';

export const DEFAULT_PREMIUM_APPEAL_WINDOW_DAYS = 7;
export const DEFAULT_PREMIUM_APPEAL_WINDOW_MS = DEFAULT_PREMIUM_APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Safely parses any Firestore Timestamp, Date, string, or seconds/ms timestamp into a JS Date.
 */
export function parseFirestoreTimestamp(vu: any): Date {
  if (!vu) return new Date(0);
  if (typeof vu.toDate === 'function') return vu.toDate();
  if (vu.seconds) return new Date(vu.seconds * 1000);
  if (vu._seconds) return new Date(vu._seconds * 1000);
  const d = new Date(vu);
  return !isNaN(d.getTime()) ? d : new Date(0);
}

/**
 * Calculates the exact remaining Premium entitlement in milliseconds at the moment of revocation.
 * Guarantees that remaining time is preserved and does not count down while paused.
 */
export function calculateRemainingPremiumMs(verifiedUntil: any): number {
  if (!verifiedUntil) return 0;
  const expiryDate = parseFirestoreTimestamp(verifiedUntil);
  const remaining = expiryDate.getTime() - Date.now();
  return Math.max(0, remaining);
}

/**
 * Calculates the appeal deadline based on the authoritative revocation timestamp.
 */
export function calculateAppealDeadline(revokedAt: any, windowDays = DEFAULT_PREMIUM_APPEAL_WINDOW_DAYS): Date {
  const baseTime = revokedAt ? parseFirestoreTimestamp(revokedAt) : new Date();
  const validBase = baseTime.getTime() > 0 ? baseTime : new Date();
  return new Date(validBase.getTime() + windowDays * 24 * 60 * 60 * 1000);
}

/**
 * Checks if the appeal window is still open for a revoked Premium badge.
 */
export function isAppealWindowOpen(appealDeadline: any): boolean {
  if (!appealDeadline) return false;
  const deadline = parseFirestoreTimestamp(appealDeadline);
  return deadline.getTime() > Date.now();
}

/**
 * Authoritative, unified calculation for resuming a paused Premium badge.
 * Resumes from the EXACT paused point at the moment of acceptance/resumption.
 * Requires a valid positive paused entitlement. Never grants fallback duration.
 */
export function calculateResumedExpiryDate(pausedRemainingMs: number): Date | null {
  if (pausedRemainingMs && pausedRemainingMs > 0) {
    return new Date(Date.now() + pausedRemainingMs);
  }
  return null;
}

/**
 * Centrally validates if a seller profile warrants Premium Seller Badge visibility.
 * Implements strict authoritative business rules.
 */
export function isSellerPremiumActive(profile: UserProfile): boolean {
  if (!profile) return false;

  // System account / bot isolation check
  if (profile.isSystemAccount === true || profile.isBot === true) {
    return false;
  }

  // Blocked account check: Blocked users cannot have active operational Premium benefits
  if (profile.isBlocked === true || profile.accountStatus === 'blocked' || profile.accountStatus === 'deleted') {
    return false;
  }

  // Rule 0: KYC Status gating (Badge strictly requires active/approved KYC)
  if (profile.kycStatus !== 'APPROVED') {
    return false;
  }

  // Revocation / Inactive state check: If badge is explicitly revoked, appealed, rejected, or forfeited
  if (
    profile.verifiedBadgeRequestStatus === 'REVOKED' ||
    profile.verifiedBadgeRequestStatus === 'RESUME_REQUESTED' ||
    profile.verifiedBadgeRequestStatus === 'REJECTED' ||
    profile.verifiedBadgeRequestStatus === 'FORFEITED' ||
    profile.verifiedBadgeRequestStatus === 'EXPIRED'
  ) {
    return false;
  }

  // Check baseline verification/premium status
  const isPremium = 
    Boolean(
      profile.isPremiumVerified === true || 
      profile.isPremiumSeller === true ||
      profile.premiumBadgeActive === true ||
      profile.verifiedBadgeType === 'GOLDEN' || 
      profile.verifiedBadgeType === 'PREMIUM'
    );

  if (!isPremium) {
    return false;
  }
  
  // Subscription Expiry Validation
  if (profile.verifiedUntil) {
    const expiryDate = parseFirestoreTimestamp(profile.verifiedUntil);
    if (expiryDate < new Date()) {
      return false; // Subscription expired
    }
  } else {
    // If verifiedUntil is null/empty and it's not permanently active
    if (!profile.isPremiumVerified && !profile.premiumBadgeActive) {
      return false;
    }
  }
  
  return true;
}

/**
 * Defines tier-based ranking for Premium Verified Marketplace
 */
export const PREMIUM_TIERS = {
  FEATURED_VERIFIED: 1,
  BOOSTED_VERIFIED: 2,
  ORGANIC_VERIFIED: 3,
};

