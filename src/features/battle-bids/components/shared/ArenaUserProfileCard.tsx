import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, MapPin, ShieldCheck, Award, Shield } from 'lucide-react';
import { ArenaSellerProfile } from '../../types';
import { getFallbackSellerProfile } from '../../utils/fallbackProfile';
import { ProfileVerificationTick } from './ProfileVerificationTick';
import { calculateTrustTier, clampTrustScore, INITIAL_TRUST_SCORE } from '../../../trust-score/types';
import { resolveAuthoritativeVerification } from '../../../../lib/verificationResolver';
import { getCountryFlag } from '../../../../components/CountrySelector';

interface ArenaUserProfileCardProps {
  profile?: ArenaSellerProfile | null;
  fallbackUserId?: string;
  className?: string;
}

export const ArenaUserProfileCard: React.FC<ArenaUserProfileCardProps> = ({
  profile,
  fallbackUserId,
  className = ''
}) => {
  const navigate = useNavigate();
  const profileToRender = profile || getFallbackSellerProfile(fallbackUserId);

  const authVerification = resolveAuthoritativeVerification(profileToRender);
  const isKycApproved = authVerification.isKycCurrentlyValid;
  const hasPremiumBadge = authVerification.isPremiumCurrentlyActive;
  const verificationScore = authVerification.verificationScore;

  // 2. Real-Time Trust Score & Tier (from real-time Firestore user snapshot)
  const rawTrustScore = typeof profileToRender.trustScore === 'number' && Number.isFinite(profileToRender.trustScore)
    ? profileToRender.trustScore
    : INITIAL_TRUST_SCORE;
  const trustScore = clampTrustScore(rawTrustScore);
  const trustTier = profileToRender.trustTier || calculateTrustTier(trustScore);

  // Dynamic Tier styling
  const getTierBadgeStyle = (score: number) => {
    if (score >= 85) {
      return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    }
    if (score >= 65) {
      return 'bg-sky-500/10 border-sky-500/30 text-sky-400';
    }
    if (score >= 40) {
      return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
    }
    if (score >= 20) {
      return 'bg-orange-500/10 border-orange-500/30 text-orange-400';
    }
    return 'bg-rose-500/10 border-rose-500/30 text-rose-400';
  };

  const getVerificationScoreStyle = (score: number) => {
    if (score === 100) return 'text-emerald-400';
    if (score === 80) return 'text-amber-400';
    return 'text-rose-500';
  };

  const getVerificationProgressGradient = (score: number) => {
    if (score === 100) return 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.35)]';
    if (score === 80) return 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_8px_rgba(245,158,11,0.25)]';
    return 'bg-rose-600';
  };

  const getTrustProgressGradient = (score: number) => {
    if (score >= 85) return 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.35)]';
    if (score >= 65) return 'bg-gradient-to-r from-sky-500 to-blue-400 shadow-[0_0_8px_rgba(14,165,233,0.25)]';
    if (score >= 40) return 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_8px_rgba(245,158,11,0.25)]';
    return 'bg-gradient-to-r from-rose-500 to-red-400';
  };

  return (
    <div className={`p-4 sm:p-5 bg-stone-950 border border-stone-850 rounded-[2rem] space-y-3 max-w-md w-full animate-in fade-in transition-all ${className}`}>
      {/* User Header Block */}
      <div className="flex items-start gap-3.5">
        {/* Profile Picture */}
        <div className="relative shrink-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden bg-stone-900 border border-white/5 flex items-center justify-center shadow-md">
            {profileToRender.photoURL ? (
              <img 
                src={profileToRender.photoURL} 
                alt={profileToRender.displayName} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <User className="w-6 h-6 text-rose-500" />
            )}
          </div>
        </div>

        {/* Profile Name, Tick, Location & Status */}
        <div className="min-w-0 flex-1 text-left space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs sm:text-sm font-black text-white uppercase tracking-tight break-words max-w-full leading-snug line-clamp-2">
              {profileToRender.displayName || "Unknown Commander"}
            </span>
            <ProfileVerificationTick profile={profileToRender} size="md" />
          </div>
          
          {/* City / Country */}
          <div className="flex items-center gap-1 text-stone-400 font-bold text-[10px]">
            <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
            <span className="truncate">
              {profileToRender.city || "Lahore"}, {profileToRender.country || "Pakistan"}
            </span>
          </div>
        </div>
      </div>

      {/* Row 1: Verification Score in a single row */}
      <div className="bg-stone-900/70 border border-stone-850/90 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-inner">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-stone-300 truncate">
            Verification Score
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-14 sm:w-18 h-1.5 bg-stone-955 rounded-full overflow-hidden hidden xs:block border border-white/5">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${getVerificationProgressGradient(verificationScore)}`}
              style={{ width: `${Math.max(verificationScore, 4)}%` }}
            />
          </div>
          <span className={`font-mono text-xs font-black ${getVerificationScoreStyle(verificationScore)}`}>
            {verificationScore}/100
          </span>
        </div>
      </div>

      {/* Row 2: Trust Score in a single row */}
      <div className="bg-stone-900/70 border border-stone-850/90 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-inner">
        <div className="flex items-center gap-2 min-w-0">
          <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-stone-300 truncate">
            Trust Score
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-14 sm:w-18 h-1.5 bg-stone-955 rounded-full overflow-hidden hidden xs:block border border-white/5">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${getTrustProgressGradient(trustScore)}`}
              style={{ width: `${Math.max(trustScore, 4)}%` }}
            />
          </div>
          <span className="font-mono text-xs font-black text-amber-400">
            {trustScore}/100
          </span>
        </div>
      </div>

      {/* Row 3: Trust Score Tier in a single row */}
      <div className="bg-stone-900/70 border border-stone-850/90 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-inner">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 shrink-0" />
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-stone-300 truncate">
            Trust Score Tier
          </span>
        </div>
        <span className={`text-[9.5px] sm:text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md border tracking-wider shrink-0 ${getTierBadgeStyle(trustScore)}`}>
          {trustTier}
        </span>
      </div>

      {/* Row 4: KYC verified ✓ status and Premium seller ✓ status in a single row */}
      <div className="bg-stone-900/70 border border-stone-850/90 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-inner text-[10px] sm:text-xs font-black uppercase flex-wrap sm:flex-nowrap">
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

      {/* Single, non-duplicate, touch-friendly View Profile Button */}
      <div className="pt-0.5">
        <button
          onClick={() => navigate(`/battle-bids/profile/${profileToRender.username || profileToRender.id}`)}
          className="w-full min-h-[44px] py-2.5 bg-stone-900 hover:bg-stone-850 active:bg-stone-800 text-stone-300 hover:text-white rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest border border-stone-850 hover:border-stone-800 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
        >
          <User className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span>View Arena Profile</span>
        </button>
      </div>
    </div>
  );
};
