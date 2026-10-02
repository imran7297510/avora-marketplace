import React from 'react';
import { ShieldCheck, MapPin, CheckCircle2, User, Award, Shield } from 'lucide-react';
import { ArenaSellerProfile } from '../types';
import { cn } from '../../../lib/utils';
import { calculateTrustTier, clampTrustScore, INITIAL_TRUST_SCORE } from '../../trust-score/types';

interface AnonymousSellerCardProps {
  profile: ArenaSellerProfile | null;
  alias?: string;
  className?: string;
  cityOverride?: string;
}

export const AnonymousSellerCard: React.FC<AnonymousSellerCardProps> = ({ 
  profile, 
  alias = "Anonymous Seller",
  className,
  cityOverride
}) => {
  if (!profile) return null;

  const isKycApproved = Boolean(
    profile.isKycVerified || 
    (profile as any).kycStatus === 'APPROVED' || 
    profile.isVerified
  );
  const hasPremiumBadge = Boolean(
    profile.isPremiumSeller || 
    profile.isPremiumVerified ||
    (profile as any).verifiedBadgeType === 'GOLDEN' ||
    (profile as any).verifiedBadgeType === 'PREMIUM'
  );

  let verificationScore = 0;
  if (isKycApproved && hasPremiumBadge) {
    verificationScore = 100;
  } else if (isKycApproved) {
    verificationScore = 80;
  } else {
    verificationScore = 0;
  }

  const rawTrustScore = typeof profile.trustScore === 'number' && Number.isFinite(profile.trustScore)
    ? profile.trustScore
    : INITIAL_TRUST_SCORE;
  const trustScore = clampTrustScore(rawTrustScore);
  const trustTier = profile.trustTier || calculateTrustTier(trustScore);

  return (
    <div className={cn("p-6 sm:p-8 bg-stone-900 border border-stone-800 rounded-[2.5rem] relative overflow-hidden space-y-4 shadow-xl", className)}>
      {/* Background Accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
      
      {/* Header Info */}
      <div className="flex items-center gap-3.5">
        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-stone-955 border border-stone-800 rounded-full flex items-center justify-center text-amber-500 shadow-inner shrink-0">
          <User className="w-6 h-6 sm:w-7 sm:h-7" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 max-w-full">
            <h3 className="text-base sm:text-lg font-black text-white uppercase italic tracking-tighter truncate">
              {alias || "Anonymous Seller"}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              {hasPremiumBadge ? (
                <CheckCircle2 className="w-4.5 h-4.5 text-amber-500 fill-amber-500/10" />
              ) : isKycApproved ? (
                <CheckCircle2 className="w-4.5 h-4.5 text-blue-500 fill-blue-500/10" />
              ) : null}
            </div>
          </div>
          {/* City Display */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <MapPin className="w-3.5 h-3.5 text-stone-500" />
            <span className="text-xs font-bold text-stone-500 uppercase tracking-widest truncate">
              {cityOverride || profile.city || "Location Unknown"}
            </span>
          </div>
        </div>
      </div>

      {/* 4 Single Rows under Profile Name */}
      <div className="space-y-2.5 w-full">
        {/* Row 1: Verification score in a single row */}
        <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-stone-955/80 border border-stone-850/80 rounded-xl">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-stone-300 truncate">
              Verification Score
            </span>
          </div>
          <span className={cn(
            "font-mono text-xs font-black shrink-0",
            verificationScore === 100 ? "text-emerald-400" : verificationScore === 80 ? "text-amber-400" : "text-rose-500"
          )}>
            {verificationScore}/100
          </span>
        </div>

        {/* Row 2: Trust Score in a single row */}
        <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-stone-955/80 border border-stone-850/80 rounded-xl">
          <div className="flex items-center gap-2 min-w-0">
            <Award className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-stone-300 truncate">
              Trust Score
            </span>
          </div>
          <span className="font-mono text-xs font-black text-amber-400 shrink-0">
            {trustScore}/100
          </span>
        </div>

        {/* Row 3: Trust Score Tier in a single row */}
        <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-stone-955/80 border border-stone-850/80 rounded-xl">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-stone-300 truncate">
              Trust Score Tier
            </span>
          </div>
          <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 tracking-wider shrink-0">
            {trustTier}
          </span>
        </div>

        {/* Row 4: KYC approved X and premium seller status in a single row */}
        <div className="w-full flex items-center justify-between px-3.5 py-2.5 bg-stone-955/80 border border-stone-850/80 rounded-xl text-xs font-black uppercase gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={isKycApproved ? "text-emerald-500 font-black" : "text-rose-500 font-black"}>
              {isKycApproved ? 'KYC verified ✓' : 'KYC Verified x'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={hasPremiumBadge ? "text-emerald-500 font-black" : "text-rose-500 font-black"}>
              {hasPremiumBadge ? 'Premium seller ✓' : 'Premium seller x'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
