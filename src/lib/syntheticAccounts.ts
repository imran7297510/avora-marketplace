import { UserProfile } from '../types';
import { resolveAuthoritativeVerification } from './verificationResolver';

/**
 * Authoritative set of known platform-owned synthetic, system, and simulator account IDs.
 * These identities are permanently prohibited from participating in public verified directories,
 * even if a malformed database record or stale cache has verification flags set.
 */
export const PLATFORM_SYNTHETIC_ACCOUNT_IDS = new Set<string>([
  'arena-official-host',
  'official-marketplace-store',
  'system_fallback',
  'arena_bot_alpha',
  'arena_bot_beta',
  'arena_bot_gamma',
  'anon_simulated',
  'simulated-seller',
  'mock-logged-in-user'
]);

/**
 * Centrally validates if an entity is a platform-owned system, simulator, or bot actor.
 * Evaluates both explicit boolean flags and canonical platform-owned identifiers.
 */
export function isSyntheticAccount(
  profile: UserProfile | { id?: string; isSystemAccount?: boolean; isBot?: boolean; [key: string]: any } | null | undefined
): boolean {
  if (!profile) return false;

  // 1. Explicit boolean system/bot flags
  if (profile.isSystemAccount === true || profile.isBot === true) {
    return true;
  }

  // 2. Canonical platform synthetic identity guards
  const id = profile.id ? String(profile.id).toLowerCase().trim() : '';
  if (id) {
    if (PLATFORM_SYNTHETIC_ACCOUNT_IDS.has(id)) {
      return true;
    }
    if (id.startsWith('arena_bot_') || id.startsWith('anon_seller_') || id.startsWith('anon_simulated')) {
      return true;
    }
  }

  return false;
}

/**
 * Authoritative eligibility gate for the Combined Verified Directory (/verified & /verified/search).
 *
 * A profile may appear in the Verified Directory when:
 * A. KYC is currently valid/approved OR Premium Seller status is currently active/valid
 * B. The account is NOT a platform-owned synthetic/system/simulator identity (!isSyntheticAccount(profile))
 * C. The account is not blocked, banned, or deleted
 *
 * Invariant: Active KYC qualifies for directory (Blue badge).
 * Invariant: Active Premium Seller qualifies for directory (Gold badge).
 * Invariant: Both active display both badges.
 * Invariant: Synthetic accounts NEVER qualify, even if database flags are malformed.
 */
export function isVerifiedDirectoryEligible(
  profile: UserProfile | { id?: string; isBlocked?: boolean; accountStatus?: string; [key: string]: any } | null | undefined
): boolean {
  if (!profile) return false;

  // 1. Account status exclusion guard
  if (
    profile.isBlocked === true ||
    profile.accountStatus === 'blocked' ||
    profile.accountStatus === 'banned' ||
    profile.accountStatus === 'deleted'
  ) {
    return false;
  }

  // 2. Authoritative synthetic account exclusion guard
  if (isSyntheticAccount(profile)) {
    return false;
  }

  // 3. Combined Directory authoritative verification gate (KYC Valid OR Premium Active)
  const authState = resolveAuthoritativeVerification(profile as UserProfile);
  return Boolean(authState.isKycCurrentlyValid || authState.isPremiumCurrentlyActive);
}
