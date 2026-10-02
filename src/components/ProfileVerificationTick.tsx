import React, { useState, useEffect } from 'react';
import { BadgeCheck, CheckCircle2 } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { getCachedUserProfileSync, primeUserProfileCache, fetchCachedUserProfile } from '../services/userProfileCache';
import { 
  isAuthoritativeKycValid, 
  isAuthoritativePremiumActive, 
  resolveAuthoritativeVerification 
} from '../lib/verificationResolver';

export type VerificationType = 'golden' | 'blue' | 'none';

/**
 * Checks if a profile qualifies for an active Golden Tick (Premium Seller Badge).
 * Commercial seller badges strictly REQUIRE approved KYC and active unexpired Premium subscription.
 */
export function isProfileGolden(profile: any): boolean {
  if (!profile) return false;
  return isAuthoritativePremiumActive(profile);
}

/**
 * Checks if a profile qualifies for an active Blue Tick (KYC Approved).
 * Single authoritative KYC source of truth: kycStatus === 'APPROVED' and not revoked/expired.
 */
export function isProfileBlue(profile: any): boolean {
  if (!profile) return false;
  return isAuthoritativeKycValid(profile);
}

/**
 * Determines exact verification type. Golden takes strict priority.
 */
export function getProfileVerificationType(profileOrUser: any): VerificationType {
  if (!profileOrUser) return 'none';
  return resolveAuthoritativeVerification(profileOrUser).verificationType;
}

export interface ProfileVerificationTickProps {
  profile?: UserProfile | null | any;
  userId?: string;
  isPremium?: boolean;
  isKyc?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showLabel?: boolean;
  iconType?: 'badge' | 'circle';
}

/**
 * Real-time Blue Tick or Golden Tick component for standard marketplace profile names.
 * - Golden Tick: User with active premium seller badge
 * - Blue Tick: User with approved KYC
 * - None: Regular user (no tick rendered)
 */
export const ProfileVerificationTick: React.FC<ProfileVerificationTickProps> = ({
  profile,
  userId,
  isPremium,
  isKyc,
  size = 'sm',
  className = '',
  showLabel = false,
  iconType = 'badge',
}) => {
  const [resolvedProfile, setResolvedProfile] = useState<UserProfile | null>(() => {
    if (profile) return profile;
    if (userId) return getCachedUserProfileSync(userId) || null;
    return null;
  });

  useEffect(() => {
    if (profile) {
      setResolvedProfile(profile);
      return;
    }

    if (!userId || userId === 'guest' || userId === 'anonymous') {
      setResolvedProfile(null);
      return;
    }

    // Sync cache lookup
    const cached = getCachedUserProfileSync(userId);
    if (cached !== undefined) {
      setResolvedProfile(cached);
    }

    // Real-time Firestore subscription
    let isMounted = true;
    const unsub = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        if (!isMounted) return;
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as UserProfile;
          primeUserProfileCache(userId, data);
          setResolvedProfile(data);
        } else {
          primeUserProfileCache(userId, null);
          setResolvedProfile(null);
        }
      },
      () => {
        if (!isMounted) return;
        // Fallback fetch if subscription encountered network error
        fetchCachedUserProfile(userId).then((p) => {
          if (isMounted && p) setResolvedProfile(p);
        });
      }
    );

    return () => {
      isMounted = false;
      unsub();
    };
  }, [userId, profile]);

  // Determine verification type from explicit flags or profile
  let verificationType: VerificationType = 'none';

  if (isPremium) {
    verificationType = 'golden';
  } else if (isKyc) {
    verificationType = 'blue';
  } else if (resolvedProfile) {
    verificationType = getProfileVerificationType(resolvedProfile);
  }

  if (verificationType === 'none') {
    return null;
  }

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5 sm:w-4 sm:h-4',
    md: 'w-4 h-4 sm:w-4.5 sm:h-4.5',
    lg: 'w-5 h-5 sm:w-6 sm:h-6',
    xl: 'w-6 h-6 sm:w-7 sm:h-7',
  };

  const currentIconSize = iconSizes[size] || iconSizes.sm;

  if (verificationType === 'golden') {
    return (
      <span
        className={`inline-flex items-center gap-1 shrink-0 select-none align-middle ${className}`}
        title="Golden Verified Profile (Active Premium Seller)"
      >
        {iconType === 'circle' ? (
          <CheckCircle2
            className={`${currentIconSize} text-amber-500 fill-amber-100 stroke-[2.5] drop-shadow-sm shrink-0`}
          />
        ) : (
          <BadgeCheck
            className={`${currentIconSize} text-amber-500 fill-amber-100 drop-shadow-sm shrink-0`}
          />
        )}
        {showLabel && (
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shadow-sm">
            Premium Seller
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 select-none align-middle ${className}`}
      title="Blue Tick Verified Profile (KYC Approved)"
    >
      {iconType === 'circle' ? (
        <CheckCircle2
          className={`${currentIconSize} text-blue-500 fill-blue-50 stroke-[2.5] drop-shadow-sm shrink-0`}
        />
      ) : (
        <BadgeCheck
          className={`${currentIconSize} text-blue-500 fill-blue-50 drop-shadow-sm shrink-0`}
        />
      )}
      {showLabel && (
        <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shadow-sm">
          KYC Approved
        </span>
      )}
    </span>
  );
};
