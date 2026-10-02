import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { CheckCircle, Award, Eye, User, Search, BadgeCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { resolveAuthoritativeVerification } from '../lib/verificationResolver';
import { isVerifiedDirectoryEligible } from '../lib/syntheticAccounts';

export function VerifiedProfiles() {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchVerifiedProfiles();
  }, []);

  const fetchVerifiedProfiles = async () => {
    setError(null);
    // Check session storage first, but re-validate cached items against canonical verification rules (resolver)
    let cachedData = null;
    try {
      cachedData = sessionStorage.getItem('verifiedProfiles');
    } catch (e) {
      console.warn("sessionStorage is unavailable:", e);
    }
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed)) {
          const validCached = parsed
            .filter((p: UserProfile) => isVerifiedDirectoryEligible(p))
            .sort((a, b) => {
              const viewsA = Number.isFinite(Number((a as any).views ?? (a as any).totalViews)) ? Number((a as any).views ?? (a as any).totalViews) : 0;
              const viewsB = Number.isFinite(Number((b as any).views ?? (b as any).totalViews)) ? Number((b as any).views ?? (b as any).totalViews) : 0;
              return viewsB - viewsA;
            });
          if (validCached.length > 0) {
            setProfiles(validCached);
            setLoading(false);
          }
        }
      } catch (parseErr) {
        console.warn("Failed to parse cached profiles:", parseErr);
      }
    }

    try {
      // Scalable KYC-authoritative candidate query
      const q = query(
        collection(db, 'users'),
        where('kycStatus', '==', 'APPROVED')
      );
      const snap = await getDocs(q);

      const fetchedProfiles = snap.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as UserProfile))
        .filter((p: UserProfile) => isVerifiedDirectoryEligible(p))
        .sort((a, b) => {
          const viewsA = Number.isFinite(Number((a as any).views ?? (a as any).totalViews)) ? Number((a as any).views ?? (a as any).totalViews) : 0;
          const viewsB = Number.isFinite(Number((b as any).views ?? (b as any).totalViews)) ? Number((b as any).views ?? (b as any).totalViews) : 0;
          return viewsB - viewsA;
        });

      setProfiles(fetchedProfiles);
      // Cache valid verified profiles
      try {
        sessionStorage.setItem('verifiedProfiles', JSON.stringify(fetchedProfiles));
      } catch (e) {}
    } catch (e: any) {
      console.error("Firestore verified profiles fetch failed:", e);
      try {
        sessionStorage.removeItem('verifiedProfiles');
      } catch (storageErr) {}
      setError("Unable to load verified profiles at this moment. Please refresh or try again later.");
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-stone-400">Loading verified profiles...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-3 py-4 sm:py-6 lg:py-8 flex-1 w-full">
      <div className="mb-6 text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center p-2 bg-amber-100 rounded-xl mb-3">
          <Award className="w-6 h-6 text-amber-600" />
        </div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-stone-900 mb-1 leading-tight">Verified Trusted Profiles</h1>
        <p className="text-xs sm:text-sm text-stone-600 max-w-xl mx-auto mb-4 leading-relaxed">
          Browse our most trusted, verified collectors and sellers. Profiles are ranked by community visits.
        </p>
        <div className="flex flex-row gap-2 sm:gap-4 items-stretch justify-center w-full max-w-lg mx-auto">
          <Link 
            to="/premium" 
            className="flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2.5 bg-stone-900 text-white px-2.5 sm:px-5 py-2 sm:py-3 rounded-xl font-black uppercase text-xs sm:text-xs tracking-wider shadow-md hover:bg-amber-500 hover:text-stone-900 transition-all active:scale-95 group border border-stone-800"
          >
            <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 group-hover:text-stone-900 transition-colors flex-shrink-0" />
            <span className="hidden sm:inline">Apply Premium Seller Badge</span>
            <span className="sm:hidden text-xs">Apply Premium</span>
          </Link>
          <Link 
            to="/verified/search" 
            className="flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2.5 bg-amber-500 text-stone-900 px-2.5 sm:px-5 py-2 sm:py-3 rounded-xl font-black uppercase text-xs sm:text-xs tracking-wider shadow-md hover:bg-stone-900 hover:text-white transition-all active:scale-95 group border border-amber-600"
          >
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-900 group-hover:text-white transition-colors flex-shrink-0" />
            <span className="hidden sm:inline">Search Verified Profiles</span>
            <span className="sm:hidden text-xs">Search</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {profiles.map((profile, index) => {
          const verification = resolveAuthoritativeVerification(profile);
          const kycValid = verification.showBlueKycTick;
          const premiumValid = verification.showGoldPremiumTick;
          return (
            <Link 
              key={profile.id} 
              to={`/user/${profile.id}`}
              className="group bg-white p-6 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-all hover:border-amber-300 relative overflow-hidden flex flex-col items-center text-center"
            >
              {/* Rank Badge */}
              <div className={`absolute top-0 right-0 px-3 py-1 font-bold text-sm shadow-sm rounded-bl-lg ${
                index < 3 ? 'bg-amber-500 text-stone-900' : 'bg-stone-100 text-stone-600'
              }`}>
                #{index + 1}
              </div>

              <div className="relative mb-4 mt-2">
                <div className="w-24 h-24 rounded-full overflow-hidden border-[3px] border-amber-400 bg-stone-100 shadow-sm">
                  {profile.photoURL ? (
                    <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-stone-200 text-stone-400">
                      <User className="w-12 h-12" />
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-white rounded-xl p-1 shadow flex items-center gap-1">
                  {kycValid && (
                    <CheckCircle className="w-6 h-6 text-blue-500 fill-blue-50" title="KYC Approved" />
                  )}
                  {premiumValid && (
                    <Award className="w-6 h-6 text-amber-500 fill-amber-50" title="Premium Active" />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 mb-1 justify-center flex-wrap">
                <h3 className="text-xl font-bold text-stone-900 group-hover:text-amber-600 transition-colors">
                  {profile.name || 'Anonymous User'}
                </h3>
                {kycValid && (
                  <BadgeCheck className="w-5 h-5 text-blue-500 fill-blue-50" title="KYC Verified" />
                )}
                {premiumValid && (
                  <BadgeCheck className="w-5 h-5 text-amber-500 fill-amber-100" title="Premium Seller" />
                )}
              </div>
              
              <p className="text-sm text-stone-400 mb-4">
                Joined {(() => {
                  const ca = profile.createdAt;
                  if (!ca) return 'Recent Member';
                  if (typeof ca.toDate === 'function') return ca.toDate().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                  if (ca.seconds) return new Date(ca.seconds * 1000).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                  const d = new Date(ca);
                  return !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'Recent Member';
                })()}
              </p>

              <div className="mt-auto w-full flex items-center justify-center gap-2 text-stone-600 bg-stone-50 py-2 px-4 rounded-lg font-medium text-sm">
                <Eye className="w-4 h-4" /> {(profile as any).views ?? profile.totalViews ?? 0} Profile Views
              </div>
            </Link>
          );
        })}
        
        {error && (
          <div className="col-span-full py-12 px-6 text-center text-red-600 bg-red-50 rounded-2xl border border-red-200 shadow-sm">
            <p className="font-semibold text-sm mb-1">{error}</p>
            <button 
              onClick={() => fetchVerifiedProfiles()}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!error && profiles.length === 0 && (
          <div className="col-span-full py-16 text-center text-stone-400 bg-white rounded-2xl border border-stone-200">
            No verified profiles found yet.
          </div>
        )}
      </div>
    </div>
  );
}
