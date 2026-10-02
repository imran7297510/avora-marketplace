import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Award, MapPin, Calendar, CheckCircle2, ExternalLink, Shield } from 'lucide-react';
import { ArenaSellerProfile } from '../types';
import { getCountryFlag } from '../../../components/CountrySelector';
import { format } from 'date-fns';
import { ReportButton } from './ReportButton';
import { ProfileVerificationTick } from './shared/ProfileVerificationTick';
import { calculateTrustTier, clampTrustScore, INITIAL_TRUST_SCORE } from '../../trust-score/types';
import { resolveAuthoritativeVerification } from '../../../lib/verificationResolver';
import { cn } from '../../../lib/utils';

interface ArenaSellerCardProps {
  profile: ArenaSellerProfile;
  isAnonymous?: boolean;
}

export const ArenaSellerCard: React.FC<ArenaSellerCardProps> = ({ profile, isAnonymous }) => {
  const navigate = useNavigate();

  const authVerification = resolveAuthoritativeVerification(profile);
  const isKycApproved = authVerification.isKycCurrentlyValid;
  const hasPremiumBadge = authVerification.isPremiumCurrentlyActive;
  const verificationScore = authVerification.verificationScore;

  const rawTrustScore = typeof profile.trustScore === 'number' && Number.isFinite(profile.trustScore)
    ? profile.trustScore
    : INITIAL_TRUST_SCORE;
  const trustScore = clampTrustScore(rawTrustScore);
  const trustTier = profile.trustTier || calculateTrustTier(trustScore);

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-[2rem] overflow-hidden space-y-4">
      {/* Header Info */}
      <div className="p-6 border-b border-stone-800/80 bg-gradient-to-br from-stone-800/50 to-transparent">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            {!isAnonymous && (
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-stone-800 border border-white/10 shadow-xl">
                  {profile.photoURL ? (
                    <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-600 bg-stone-900">
                      <span className="text-xl font-black">{profile.displayName.charAt(0)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                <span>{isAnonymous ? "Anonymous User" : profile.displayName}</span>
                {!isAnonymous && <ProfileVerificationTick profile={profile} size="md" />}
              </h3>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1 text-xs font-bold text-stone-400 uppercase tracking-widest">
                  <MapPin className="w-3 h-3 text-stone-500" />
                  {isAnonymous ? (profile.city || "Location Hidden") : `${getCountryFlag(profile.country || 'Pakistan')} ${profile.country || 'Pakistan'}, ${profile.city}`}
                </div>
              </div>
            </div>
          </div>
          {!isAnonymous && (
            <button 
              onClick={() => navigate(`/battle-bids/profile/${profile.username || profile.id || profile.uid || ''}`)}
              className="p-3 bg-stone-800 hover:bg-rose-600 text-stone-400 hover:text-white rounded-2xl transition-all cursor-pointer"
            >
              <ExternalLink className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 4 Single Rows under Profile Name */}
        <div className="space-y-2.5 w-full mt-4">
          {/* Row 1: Verification score */}
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

          {/* Row 2: Trust Score */}
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

          {/* Row 3: Trust Score Tier */}
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

          {/* Row 4: KYC verified & Premium seller status in a single row */}
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-px bg-white/5">
        <div className="p-6 bg-stone-900">
          <p className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">Sales Completed</p>
          <p className="text-xl font-black text-white">{profile.stats.completedSales}</p>
        </div>
        <div className="p-6 bg-stone-900">
          <p className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">Response Time</p>
          <p className="text-xl font-black text-white">{profile.stats.responseTime}</p>
        </div>
        <div className="p-6 bg-stone-900">
          <p className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">Success Rate</p>
          <p className="text-xl font-black text-rose-500">{profile.stats.negotiationSuccess}%</p>
        </div>
        <div className="p-6 bg-stone-900">
          <p className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">Arena Member</p>
          <div className="flex items-center gap-2 mt-1">
            <Calendar className="w-4 h-4 text-stone-600" />
            <p className="text-xs font-bold text-stone-400">
              {profile.memberSince && !isNaN(profile.memberSince.getTime()) 
                ? format(profile.memberSince, 'MMM yyyy') 
                : 'Unknown'}
            </p>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-6 bg-stone-955/50 flex flex-col gap-3">
        {!isAnonymous && (
          <button 
            onClick={() => navigate(`/battle-bids/profile/${profile.username || profile.id || profile.uid || ''}`)}
            className="relative overflow-hidden w-full py-4 bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 hover:from-sky-300 hover:via-sky-400 hover:to-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all duration-150 shadow-[0_4px_0_0_#1d4ed8,0_8px_16px_rgba(37,99,235,0.35)] hover:shadow-[0_5px_0_0_#1e40af,0_10px_20px_rgba(37,99,235,0.45)] active:translate-y-1 active:shadow-[0_1px_0_0_#172554] border-t border-sky-200/80 cursor-pointer select-none group"
          >
            <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/30 to-transparent rounded-t-2xl pointer-events-none" />
            <span className="relative z-10 drop-shadow-sm">view profile</span>
          </button>
        )}
        {!isAnonymous && (
          <ReportButton 
            targetId={profile.uid} 
            targetType="user" 
            targetTitle={isAnonymous ? "Anonymous User" : profile.displayName}
            targetOwnerId={profile.uid}
            variant="ghost"
            className="w-full py-4 bg-transparent hover:bg-rose-600/10 text-stone-600 hover:text-rose-500 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"
          />
        )}
      </div>
    </div>
  );
};
