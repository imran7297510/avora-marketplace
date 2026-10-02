import { UserProfile } from '../types';
import { isSellerPremiumActive, parseFirestoreTimestamp } from './premium';

/**
 * Authoritative Verification State definition.
 * 
 * BLUE TICK:
 * - Approved KYC (kycStatus === 'APPROVED')
 * - Account not blocked or deleted
 * - Explicitly unrevoked/unrejected
 * - Unexpired KYC (if expiration timestamp present)
 * 
 * GOLD TICK:
 * - Active Premium Seller status (isSellerPremiumActive)
 * - Strictly requires approved KYC and active unexpired premium subscription
 * 
 * VERIFICATION SCORE:
 * - 100/100: KYC Approved + Active Premium (Gold Tick)
 * - 80/100: KYC Approved (Blue Tick)
 * - 0/100: Unverified / Revoked / Expired
 * 
 * Note: Verification Score is distinct from stored Trust Score (`users/{uid}.trustScore`).
 */

export interface AuthoritativeVerificationState {
  isKycApproved: boolean;
  isKycCurrentlyValid: boolean;
  isPremiumCurrentlyActive: boolean;
  showBlueKycTick: boolean;
  showGoldPremiumTick: boolean;
  verificationType: 'golden' | 'blue' | 'none';
  verificationScore: 0 | 80 | 100;
  verificationTier: 'Level 2 Elite' | 'Level 1 Verified' | 'Unverified';
}

/**
 * Checks if a user's KYC verification is currently valid and active.
 * Authoritative lifecycle: kycStatus === 'APPROVED' with no revocation/block and unexpired date.
 */
export function isAuthoritativeKycValid(profile: UserProfile | any | null | undefined): boolean {
  if (!profile) return false;

  // System account / bot isolation check: Simulator actors must not possess genuine marketplace KYC
  if (profile.isSystemAccount === true || profile.isBot === true) {
    return false;
  }

  // Account revocation / block check
  if (
    profile.kycStatus === 'REVOKED' ||
    profile.kycStatus === 'PERMANENTLY_REMOVED' ||
    profile.kycStatus === 'REJECTED' ||
    profile.isBlocked === true ||
    profile.accountStatus === 'blocked' ||
    profile.accountStatus === 'banned' ||
    profile.accountStatus === 'deleted'
  ) {
    return false;
  }

  // Strict Authoritative KYC status check
  if (profile.kycStatus !== 'APPROVED') {
    return false;
  }

  // Check optional KYC expiration if present
  const kycExpiry = profile.kycExpiresAt || profile.kycValidUntil;
  if (kycExpiry) {
    const expiryDate = parseFirestoreTimestamp(kycExpiry);
    if (expiryDate.getTime() > 0 && expiryDate < new Date()) {
      return false; // KYC expired
    }
  }

  return true;
}

/**
 * Checks if a user has active Premium Seller status.
 * Relies on the central `isSellerPremiumActive` rule:
 * Must have approved KYC, valid unexpired subscription, and not revoked.
 */
export function isAuthoritativePremiumActive(profile: UserProfile | any | null | undefined): boolean {
  if (!profile) return false;
  if (profile.isSystemAccount === true || profile.isBot === true) {
    return false;
  }
  return isSellerPremiumActive(profile as UserProfile);
}

/**
 * Resolves the unified, authoritative verification state for any profile.
 */
export function resolveAuthoritativeVerification(profile: UserProfile | any | null | undefined): AuthoritativeVerificationState {
  const isKycCurrentlyValid = isAuthoritativeKycValid(profile);
  const isPremiumCurrentlyActive = isKycCurrentlyValid && isAuthoritativePremiumActive(profile);

  let verificationType: 'golden' | 'blue' | 'none' = 'none';
  let showGoldPremiumTick = false;
  let showBlueKycTick = false;
  let verificationScore: 0 | 80 | 100 = 0;
  let verificationTier: 'Level 2 Elite' | 'Level 1 Verified' | 'Unverified' = 'Unverified';

  if (isPremiumCurrentlyActive) {
    verificationType = 'golden';
    showGoldPremiumTick = true;
    verificationScore = 100;
    verificationTier = 'Level 2 Elite';
  } else if (isKycCurrentlyValid) {
    verificationType = 'blue';
    showBlueKycTick = true;
    verificationScore = 80;
    verificationTier = 'Level 1 Verified';
  }

  return {
    isKycApproved: isKycCurrentlyValid,
    isKycCurrentlyValid,
    isPremiumCurrentlyActive,
    showBlueKycTick,
    showGoldPremiumTick,
    verificationType,
    verificationScore,
    verificationTier,
  };
}
