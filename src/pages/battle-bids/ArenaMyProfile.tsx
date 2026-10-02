import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  ExternalLink, 
  ShieldCheck, 
  Star, 
  MapPin, 
  ShieldAlert,
  Clock,
  Activity,
  Handshake,
  ArrowRight,
  Award,
  Shield,
  Zap
} from 'lucide-react';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';
import { ProfileVerificationTick } from '../../components/ProfileVerificationTick';
import { CreditBalanceBadge } from '../../features/credits';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { AuctionItem } from '../../features/battle-bids/types';
import { ArenaService } from '../../features/battle-bids/services';
import { format } from 'date-fns';
import { useSellerProfile } from '../../features/battle-bids/hooks/useSellerProfile';
import { formatPrice } from '../../lib/currencies';
import { calculateTrustTier, clampTrustScore, INITIAL_TRUST_SCORE } from '../../features/trust-score/types';
import { resolveAuthoritativeVerification } from '../../lib/verificationResolver';
import { AccountBannedBanner } from '../../components/AccountBannedBanner';

export const ArenaMyProfile = () => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const { profile, loading, error } = useSellerProfile(user?.uid || '');
  const [offers, setOffers] = useState<AuctionItem[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    
    const fetchOffers = async () => {
      try {
        const q = query(
          collection(db, 'arena_auctions'),
          where('sellerId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const allItems = snapshot.docs.map(doc => ArenaService.mapDocToAuction(doc));
        // Filter strictly for negotiation offers posted by the respective user
        const userOffers = allItems.filter(item => item.isNegotiationOnly === true);
        setOffers(userOffers);
      } catch (err) {
        console.error("Error fetching user offers:", err);
      } finally {
        setLoadingOffers(false);
      }
    };
    
    fetchOffers();
  }, [user?.uid]);

  if (loading || !profile) return <ArenaLayout hideNavigation><div className="flex items-center justify-center min-h-[60vh] text-amber-500">Loading profile...</div></ArenaLayout>;

  const { stats } = profile;

  // Real-time calculated Trust metrics
  const rawTrustScore = typeof profile?.trustScore === 'number' && Number.isFinite(profile.trustScore)
    ? profile.trustScore
    : (typeof userProfile?.trustScore === 'number' && Number.isFinite(userProfile?.trustScore) ? userProfile.trustScore : INITIAL_TRUST_SCORE);

  const trustScore = clampTrustScore(rawTrustScore);
  const trustTier = profile?.trustTier || userProfile?.trustTier || calculateTrustTier(trustScore);

  const authVerification = resolveAuthoritativeVerification(profile || userProfile);
  const isKycApproved = authVerification.isKycCurrentlyValid;
  const hasPremiumBadge = authVerification.isPremiumCurrentlyActive;
  const verificationScore = authVerification.verificationScore;

  const getTierBadgeStyle = (score: number) => {
    if (score >= 85) return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    if (score >= 65) return 'bg-sky-500/10 border-sky-500/30 text-sky-400';
    if (score >= 40) return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
    if (score >= 20) return 'bg-orange-500/10 border-orange-500/30 text-orange-400';
    return 'bg-rose-500/10 border-rose-500/30 text-rose-400';
  };

  const getTrustProgressGradient = (score: number) => {
    if (score >= 85) return 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.35)]';
    if (score >= 65) return 'bg-gradient-to-r from-sky-500 to-blue-400 shadow-[0_0_8px_rgba(14,165,233,0.25)]';
    if (score >= 40) return 'bg-gradient-to-r from-amber-500 to-orange-400 shadow-[0_0_8px_rgba(245,158,11,0.25)]';
    return 'bg-gradient-to-r from-rose-500 to-red-400';
  };

  return (
    <ArenaLayout hideNavigation>
      <div className="max-w-4xl mx-auto pb-24 p-4 space-y-6">
        {/* 1. Header Navigation */}
        <div className="flex items-center justify-between">
          <ArenaBackButton fallbackPath="/negotiations" />
          
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-[10px] font-black uppercase text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Real-Time Sync
            </span>
            
            <button 
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2 px-3.5 py-2 bg-amber-900/20 border border-amber-500/50 rounded-xl text-xs font-black uppercase text-amber-500 hover:bg-amber-900/40 transition-all shadow-md active:scale-95"
            >
              <span>View Profile</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Ban Alert and Appeal Form */}
        <AccountBannedBanner variant="dark" />

        {/* 2. Main Profile Header */}
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 sm:p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
            <div className="relative shrink-0 w-20 h-20">
              <img 
                src={profile.photoURL || '/default-avatar.png'} 
                alt={profile.displayName || 'User'} 
                className="w-full h-full rounded-full object-cover border-2 border-amber-500/40 shadow-md"
              />
              <span className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 border-2 border-stone-900 rounded-full flex items-center justify-center text-stone-950 font-black text-[9px]">
                ✓
              </span>
            </div>
            
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div 
                  id="arena-my-profile-display-name-container"
                  className="relative inline-flex items-center px-3.5 py-1.5 rounded-xl bg-gradient-to-b from-stone-100 via-stone-200 to-stone-300 border-t-2 border-l border-r border-white border-b-2 border-b-stone-400 select-text w-fit"
                >
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent rounded-t-lg pointer-events-none" />
                  <h2 className="relative z-10 text-base sm:text-lg font-black text-stone-900 tracking-tight uppercase italic leading-none">
                    {profile.displayName}
                  </h2>
                </div>
                <ProfileVerificationTick profile={profile} size="md" />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                <span className={`px-2.5 py-0.5 rounded-md border ${isKycApproved ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                  {isKycApproved ? 'KYC Verified ✓' : 'KYC Unverified'}
                </span>
                <span className={`px-2.5 py-0.5 rounded-md border ${hasPremiumBadge ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-stone-800 border-stone-700 text-stone-400'}`}>
                  {hasPremiumBadge ? 'Premium Seller ✓' : 'Standard Trader'}
                </span>
              </div>

              {(profile.city || profile.address) && (
                <div className="flex items-center gap-1 text-stone-400 font-bold uppercase tracking-wider text-[11px] mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="truncate">{[profile.city, profile.address].filter(Boolean).join(', ')}</span>
                </div>
              )}
            </div>

            <div className="sm:ml-auto shrink-0 flex items-center">
              {user && !user.isAnonymous && <CreditBalanceBadge variant="3d" />}
            </div>
          </div>

          {/* Real-time Trust Dossier Box */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-stone-800/80">
            {/* Real-time Trust Score */}
            <div className="bg-stone-955 border border-stone-850 rounded-2xl p-3.5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span className="text-[11px] font-black uppercase text-stone-300 tracking-wider">Real-Time Trust Score</span>
                </div>
                <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live
                </span>
              </div>
              
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-black font-mono text-amber-400 tracking-tight">{trustScore}</span>
                <span className="text-xs font-mono font-bold text-stone-500">/ 100</span>
              </div>

              <div className="w-full h-2 bg-stone-900 rounded-full overflow-hidden border border-stone-800">
                <div 
                  className={`h-full transition-all duration-500 ${getTrustProgressGradient(trustScore)}`}
                  style={{ width: `${Math.max(trustScore, 5)}%` }}
                />
              </div>
            </div>

            {/* Real-time Trust Score Tier */}
            <div className="bg-stone-955 border border-stone-850 rounded-2xl p-3.5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-sky-400" />
                  <span className="text-[11px] font-black uppercase text-stone-300 tracking-wider">Trust Score Tier</span>
                </div>
                <span className="text-[9px] font-bold text-stone-500 uppercase">Automated</span>
              </div>

              <div className="mt-1">
                <span className={`inline-block text-xs sm:text-sm font-black uppercase px-3 py-1 rounded-lg border tracking-wider ${getTierBadgeStyle(trustScore)}`}>
                  {trustTier}
                </span>
              </div>

              <p className="text-[10px] text-stone-500 font-medium truncate">
                Tier updated dynamically via reputation events
              </p>
            </div>

            {/* Real-time Verification Score */}
            <div className="bg-stone-955 border border-stone-850 rounded-2xl p-3.5 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-[11px] font-black uppercase text-stone-300 tracking-wider">Verification Score</span>
                </div>
                <span className="text-[10px] font-mono font-black text-emerald-400">{verificationScore}/100</span>
              </div>

              <div className="flex items-center justify-between text-[11px] font-bold text-stone-400 mt-1">
                <span>Identity Credential</span>
                <span className={verificationScore >= 80 ? "text-emerald-400 font-black" : "text-amber-500 font-black"}>
                  {verificationScore >= 100 ? 'Level 2 Elite' : verificationScore >= 80 ? 'Level 1 Verified' : 'Unverified'}
                </span>
              </div>

              <div className="w-full h-2 bg-stone-900 rounded-full overflow-hidden border border-stone-800">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                  style={{ width: `${Math.max(verificationScore, 5)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Account Activity Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-stone-900 p-4 rounded-2xl border border-stone-800 flex flex-col justify-between">
            <p className="text-[10px] text-stone-500 uppercase font-black tracking-wider">Member Since</p>
            <p className="font-black text-white text-sm sm:text-base mt-1">
              {profile.memberSince ? format((profile.memberSince as any).toDate ? (profile.memberSince as any).toDate() : new Date(profile.memberSince), 'MMM yyyy') : 'N/A'}
            </p>
          </div>
          <div className="bg-stone-900 p-4 rounded-2xl border border-stone-800 flex flex-col justify-between">
            <p className="text-[10px] text-stone-500 uppercase font-black tracking-wider">Completed Sales</p>
            <p className="font-black text-white text-sm sm:text-base mt-1">{stats?.completedSales || 0}</p>
          </div>
          <div className="bg-stone-900 p-4 rounded-2xl border border-stone-800 flex flex-col justify-between">
            <p className="text-[10px] text-stone-500 uppercase font-black tracking-wider">Offers Posted</p>
            <p className="font-black text-amber-400 text-sm sm:text-base mt-1">{offers.length}</p>
          </div>
          <div className="bg-stone-900 p-4 rounded-2xl border border-stone-800 flex flex-col justify-between">
            <p className="text-[10px] text-stone-500 uppercase font-black tracking-wider">Successful Deals</p>
            <p className="font-black text-emerald-400 text-sm sm:text-base mt-1">{stats?.negotiationSuccess || 0}</p>
          </div>
        </div>

        {/* 4. Offers Posted Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-white uppercase italic tracking-tighter flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse"></div>
              Offers Posted
            </h3>
            <span className="text-xs font-mono text-stone-500 font-bold">
              {offers.length} Total
            </span>
          </div>

          {loadingOffers ? (
            <div className="text-amber-500 text-xs py-6 text-center font-mono">Loading active offers...</div>
          ) : offers.length === 0 ? (
            <div className="text-center py-10 px-4 bg-stone-900 border border-stone-800 rounded-2xl flex flex-col items-center justify-center gap-2">
              <Handshake className="w-8 h-8 text-stone-600 mb-1" />
              <p className="text-stone-300 font-black uppercase text-xs tracking-wider">No Offers Posted Yet</p>
              <p className="text-stone-500 text-[11px] max-w-xs text-center">You have not created any private negotiation offers yet.</p>
            </div>
          ) : (
            <div 
              className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory overscroll-x-contain"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
            >
              {offers.map(offer => {
                const currency = offer.currencySymbol || offer.currency || 'USD';
                const formattedPrice = formatPrice(offer.reservePrice || offer.startingBid || 0, currency);
                
                return (
                  <div 
                    key={offer.id} 
                    onClick={() => navigate(`/negotiations/timeline/${offer.id}`)}
                    className="w-[260px] sm:w-[300px] shrink-0 bg-stone-900 hover:bg-stone-850 p-4 rounded-2xl border border-stone-800 hover:border-amber-500/40 snap-start cursor-pointer transition-all flex flex-col gap-2.5 group shadow-lg"
                  >
                    <div className="w-full h-36 bg-stone-950 rounded-xl overflow-hidden relative border border-stone-850">
                      {offer.images?.[0] ? (
                        <img 
                          src={offer.images[0]} 
                          alt={offer.title} 
                          referrerPolicy="no-referrer" 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-600 text-xs font-bold uppercase">No Preview</div>
                      )}
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-stone-955/90 border border-stone-800 text-amber-400 backdrop-blur-sm">
                        {offer.status === 'active' ? 'Active Offer' : offer.status}
                      </span>
                    </div>
                    
                    <div>
                      <p className="font-black text-white text-sm uppercase truncate group-hover:text-amber-400 transition-colors">{offer.title}</p>
                      {offer.description && (
                        <p className="text-stone-400 text-xs truncate mt-0.5">{offer.description}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2.5 border-t border-stone-800/80 mt-auto">
                      <div>
                        <p className="text-[9px] text-stone-500 uppercase font-bold tracking-wider">Asking Price</p>
                        <p className="text-emerald-400 font-mono font-bold text-sm">{formattedPrice}</p>
                      </div>
                      <div className="text-right flex items-center gap-1 text-amber-500 font-black text-xs group-hover:translate-x-0.5 transition-transform">
                        <span>View Timeline</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ArenaLayout>
  );
};

