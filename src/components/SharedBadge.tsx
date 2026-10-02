import React from 'react';
import { calculateTrustTier } from '../features/trust-score/types';
import { isSellerPremiumActive } from '../lib/premium';
import { isProfileGolden, isProfileBlue } from './ProfileVerificationTick';
import { resolveAuthoritativeVerification } from '../lib/verificationResolver';

/**
 * Standard Marketplace Verification Score Calculation:
 * 1. 80/100 if user is KYC approved
 * 2. 100/100 if user is KYC approved and has active premium seller badge
 * 3. 0/100 if user doesn't have any active premium seller badge and KYC approved
 */
export function calculateVerificationScore(profile: any): number {
  if (!profile) return 0;
  return resolveAuthoritativeVerification(profile).verificationScore;
}

export function getVerificationScoreTier(score: number): {
  tier: string;
  description: string;
  badgeClass: string;
  textClass: string;
  progressGradient: string;
} {
  if (score === 100) {
    return {
      tier: "Level 2 Elite",
      description: "KYC Approved & Active Premium Seller Badge",
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200/90",
      textClass: "text-emerald-600",
      progressGradient: "bg-gradient-to-r from-emerald-500 to-teal-500",
    };
  } else if (score === 80) {
    return {
      tier: "Level 1 Verified",
      description: "KYC Approved Identity",
      badgeClass: "bg-blue-50 text-blue-800 border-blue-200/90",
      textClass: "text-blue-600",
      progressGradient: "bg-gradient-to-r from-blue-500 to-cyan-500",
    };
  } else {
    return {
      tier: "Unverified",
      description: "No active premium seller badge or KYC approval",
      badgeClass: "bg-stone-100 text-stone-600 border-stone-200",
      textClass: "text-stone-500",
      progressGradient: "bg-stone-300",
    };
  }
}

interface VerificationScoreBadgeProps {
  score?: number;
  profile?: any;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const VerificationScoreBadge: React.FC<VerificationScoreBadgeProps> = ({
  score,
  profile,
  showScore = true,
  size = 'md',
  className = ''
}) => {
  const finalScore = typeof score === 'number' 
    ? score 
    : (profile ? calculateVerificationScore(profile) : 0);

  const { tier, description, badgeClass, progressGradient } = getVerificationScoreTier(finalScore);

  let dotColor = "bg-stone-400";
  if (finalScore === 100) dotColor = "bg-emerald-500";
  else if (finalScore === 80) dotColor = "bg-blue-500";

  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-[10px]' 
    : size === 'lg' 
    ? 'px-3.5 py-1.5 text-sm' 
    : 'px-2.5 py-1 text-xs';

  return (
    <div 
      className={`inline-flex items-center gap-1.5 rounded-full border font-black uppercase tracking-wider ${sizeClasses} ${badgeClass} ${className}`} 
      id="verification-score-badge"
      title={`Verification Score: ${finalScore}/100 (${description})`}
    >
      <div className={`w-2 h-2 rounded-full ${dotColor} ${finalScore > 0 ? 'animate-pulse' : ''}`} />
      <span>Verification Score</span>
      {showScore && <span className="font-mono ml-0.5 opacity-90">{finalScore}/100</span>}
    </div>
  );
};

interface KycBadgeProps {
  isKycApproved: boolean;
}

export const KycBadge: React.FC<KycBadgeProps> = ({ isKycApproved }) => {
  return (
    <div className="flex items-center gap-1.5" id="kyc-badge">
      <div className={`w-1.5 h-1.5 rounded-full ${isKycApproved ? 'bg-emerald-500 animate-pulse' : 'bg-stone-700'}`} />
      <span className={`text-xs font-black uppercase tracking-widest ${isKycApproved ? 'text-emerald-500' : 'text-stone-400'}`}>
        {isKycApproved ? 'KYC Verified' : 'KYC Pending / Not Verified'}
      </span>
    </div>
  );
};

interface SellerBadgeProps {
  isKycApproved: boolean;
  successRate: number;
}

export const SellerBadge: React.FC<SellerBadgeProps> = ({ isKycApproved, successRate }) => {
  const isPremium = isKycApproved && successRate >= 98;
  return (
    <div className="flex items-center gap-1.5" id="seller-badge">
      <div className={`w-1.5 h-1.5 rounded-full ${isPremium ? 'bg-amber-500 animate-pulse' : 'bg-stone-700'}`} />
      <span className={`text-xs font-black uppercase tracking-widest ${isPremium ? 'text-amber-500 font-extrabold animate-pulse' : 'text-stone-400'}`}>
        {isPremium ? 'Premium Seller' : 'Standard Seller'}
      </span>
    </div>
  );
};

interface TrustScoreBadgeProps {
  trustScore?: number;
  trustTier?: string;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const TrustScoreBadge: React.FC<TrustScoreBadgeProps> = ({
  trustScore = 50,
  trustTier,
  showScore = true,
  size = 'md'
}) => {
  const tier = trustTier || calculateTrustTier(trustScore);
  
  let colorClasses = "bg-stone-100 text-stone-700 border-stone-200";
  let dotColor = "bg-stone-500";

  if (trustScore >= 85) {
    colorClasses = "bg-emerald-50 text-emerald-800 border-emerald-200/80";
    dotColor = "bg-emerald-500";
  } else if (trustScore >= 65) {
    colorClasses = "bg-blue-50 text-blue-800 border-blue-200/80";
    dotColor = "bg-blue-500";
  } else if (trustScore >= 40) {
    colorClasses = "bg-amber-50 text-amber-800 border-amber-200/80";
    dotColor = "bg-amber-500";
  } else if (trustScore >= 20) {
    colorClasses = "bg-orange-50 text-orange-800 border-orange-200/80";
    dotColor = "bg-orange-500";
  } else {
    colorClasses = "bg-red-50 text-red-800 border-red-200/80";
    dotColor = "bg-red-500";
  }

  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-[10px]' 
    : size === 'lg' 
    ? 'px-3.5 py-1.5 text-sm' 
    : 'px-2.5 py-1 text-xs';

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border font-black uppercase tracking-wider ${sizeClasses} ${colorClasses}`} id="trust-score-badge">
      <div className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
      <span>{tier}</span>
      {showScore && <span className="font-mono ml-0.5 opacity-80">({trustScore}/100)</span>}
    </div>
  );
};

