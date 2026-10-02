import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { CountrySelector, getCountryFlag } from '../components/CountrySelector';
import { 
  Search, 
  MapPin, 
  Award, 
  User, 
  ArrowLeft, 
  X, 
  Clock, 
  Sparkles, 
  CheckCircle, 
  ChevronRight,
  Flame,
  BadgeCheck
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Fuse from 'fuse.js';
import { resolveAuthoritativeVerification } from '../lib/verificationResolver';
import { isVerifiedDirectoryEligible } from '../lib/syntheticAccounts';

const RECENT_SEARCHES_KEY = 'verified_seller_recent_searches';
const CACHE_KEY = 'verifiedSearchProfiles';

export function PremiumSellerSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [locationTerm, setLocationTerm] = useState('');
  
  // Interactive search focused states
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(8);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsDropdownRef = useRef<HTMLDivElement>(null);

  // Load recent searches and verified profiles
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    } catch (e) {
      console.warn("Could not read recent searches", e);
    }
    fetchVerifiedSearchProfiles();
  }, []);

  const fetchVerifiedSearchProfiles = async () => {
    setLoading(true);
    setError(null);
    
    // Attempt cache retrieval first, revalidating against current status rules
    let cachedData = null;
    try {
      cachedData = sessionStorage.getItem(CACHE_KEY);
    } catch (e) {
      console.warn("sessionStorage is unavailable:", e);
    }
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        if (Array.isArray(parsed)) {
          const validCached = parsed.filter(p => isVerifiedDirectoryEligible(p));
          if (validCached.length > 0) {
            setProfiles(validCached);
            setLoading(false);
          }
        }
      } catch (err) {
        console.warn("Cache parsing error", err);
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
        .filter(p => isVerifiedDirectoryEligible(p));

      setProfiles(fetchedProfiles);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(fetchedProfiles));
      } catch (e) {}
    } catch (e: any) {
      console.error("Failed to fetch verified sellers via Firestore:", e);
      try {
        sessionStorage.removeItem(CACHE_KEY);
      } catch (storageErr) {}
      setError("Unable to load verified profiles. Please try again later.");
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  // Fuzzy Search Setup for name/username filtering
  const fuseIndex = useMemo(() => {
    return new Fuse(profiles, {
      keys: ['name', 'userName'],
      threshold: 0.45,
      ignoreLocation: true
    });
  }, [profiles]);

  const handleSaveSearchTerm = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    
    const updated = [trimmed, ...recentSearches.filter(s => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6);
    setRecentSearches(updated);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("Could not save search term", e);
    }
  };

  const handleClearRecentSearches = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
  };

  const triggerSearchSelect = (term: string) => {
    setSearchTerm(term);
    handleSaveSearchTerm(term);
    setIsSearchFocused(false);
  };

  // Filter profiles based on inputs
  const filteredAndSortedProfiles = useMemo(() => {
    const sNorm = searchTerm.toLowerCase().trim();
    const lNorm = locationTerm.toLowerCase().trim();

    let list = [...profiles];

    // Typo-tolerant name/username search
    if (sNorm) {
      const fuzzyResults = fuseIndex.search(sNorm).map(r => r.item);
      if (fuzzyResults.length > 0) {
        list = fuzzyResults;
      } else {
        list = list.filter(p => 
          (p.name?.toLowerCase() || '').includes(sNorm) || 
          (p.userName?.toLowerCase() || '').includes(sNorm)
        );
      }
    }

    // Country Filter
    if (selectedCountry) {
      const cNorm = selectedCountry.toLowerCase().trim();
      list = list.filter(p => 
        (p.country?.toLowerCase() || '').includes(cNorm) ||
        (!p.country && 'pakistan'.includes(cNorm))
      );
    }

    // Exact City Filter
    if (lNorm) {
      list = list.filter(p => {
        const pCity = (p.city || '').toLowerCase().trim();
        return pCity === lNorm;
      });
    }

    // Sort by Exact Matches, then Profile Views / Recency
    list.sort((a, b) => {
      // 1. Exact username match
      const aUserMatch = a.userName?.toLowerCase().trim() === sNorm;
      const bUserMatch = b.userName?.toLowerCase().trim() === sNorm;
      if (aUserMatch && !bUserMatch) return -1;
      if (!aUserMatch && bUserMatch) return 1;

      // 2. Exact profile name match
      const aNameMatch = a.name?.toLowerCase().trim() === sNorm;
      const bNameMatch = b.name?.toLowerCase().trim() === sNorm;
      if (aNameMatch && !bNameMatch) return -1;
      if (!aNameMatch && bNameMatch) return 1;

      // 3. Views count sorting
      const aViews = Number((a as any).views ?? a.totalViews ?? 0);
      const bViews = Number((b as any).views ?? b.totalViews ?? 0);
      if (bViews !== aViews) {
        return bViews - aViews;
      }

      // 4. Recently active verified sellers (Newest)
      const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
      const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    return list;
  }, [profiles, searchTerm, selectedCountry, locationTerm, fuseIndex]);

  // Infinite Scroll Hook
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300) {
        setVisibleCount(prev => Math.min(prev + 8, filteredAndSortedProfiles.length));
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [filteredAndSortedProfiles.length]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsDropdownRef.current && 
        !suggestionsDropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute dynamic autocomplete suggestions
  const autocompleteSuggestions = useMemo(() => {
    const typed = searchTerm.toLowerCase().trim();
    if (!typed) return [];

    let list = [...profiles];

    // Filter by exact city if selected
    const lNorm = locationTerm.toLowerCase().trim();
    if (lNorm) {
      list = list.filter(p => (p.city || '').toLowerCase().trim() === lNorm);
    }

    // Filter candidates matching prefix or inclusion in name/username
    return list
      .filter(p => 
        (p.name || '').toLowerCase().includes(typed) ||
        (p.userName || '').toLowerCase().includes(typed)
      )
      .slice(0, 5); // Limit recommended suggestions to top 5 real profiles
  }, [profiles, searchTerm, locationTerm]);

  return (
    <div className="flex-1 w-full bg-stone-50 min-h-screen pb-16 relative">
      {/* Sticky top query bar */}
      <div className="sticky top-0 z-40 bg-stone-900 border-b border-stone-800 shadow-xl py-3 px-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <button 
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  navigate("/verified");
                }
              }} 
              className="inline-flex items-center gap-2 text-stone-400 hover:text-white transition-colors text-xs font-bold py-1 cursor-pointer active:scale-95"
            >
              <ArrowLeft className="w-4 h-4 text-amber-500" /> Back
            </button>
            <div className="flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span className="text-xs font-black uppercase tracking-widest text-amber-400 font-sans">Verified Discovery Search</span>
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); triggerSearchSelect(searchTerm); }} className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1 relative">
            {/* Field 1: User / Name search bar */}
            <div className="relative">
              <div className={`flex items-center gap-2 px-3 py-3 rounded-xl bg-stone-800 border-2 transition-all ${isSearchFocused ? 'border-amber-500 shadow-lg shadow-amber-500/10' : 'border-transparent'}`}>
                <Search className="w-5 h-5 text-stone-400 shrink-0" />
                <input 
                  ref={searchInputRef}
                  type="text"
                  placeholder="Who are you looking for..."
                  className="w-full bg-transparent border-none outline-none text-sm font-semibold text-white placeholder-stone-500"
                  value={searchTerm}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button type="button" onClick={() => setSearchTerm('')} className="p-1 text-stone-400 hover:text-white rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Suggestions dropdown overlay */}
              {isSearchFocused && searchTerm.trim().length > 0 && (
                <div 
                  ref={suggestionsDropdownRef}
                  className="absolute left-0 right-0 mt-2 bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden z-50 text-white select-none max-h-80 overflow-y-auto"
                >
                  <div className="p-3 border-b border-stone-800 bg-stone-950 text-[10px] uppercase font-black tracking-widest text-stone-500">
                    Exact Search
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerSearchSelect(searchTerm)}
                    className="w-full text-left px-4 py-3 hover:bg-stone-800/80 transition-colors flex items-center justify-between text-sm font-bold border-b border-stone-850"
                  >
                    <span>Search for &quot;{searchTerm}&quot;</span>
                    <ChevronRight className="w-4 h-4 text-amber-500" />
                  </button>

                  <div className="p-3 border-b border-stone-800 bg-stone-950 text-[10px] uppercase font-black tracking-widest text-stone-500">
                    Recommended Profiles
                  </div>
                  {autocompleteSuggestions.length > 0 ? (
                    autocompleteSuggestions.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => {
                          triggerSearchSelect(profile.name || '');
                          navigate(`/user/${profile.id}`);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-stone-800/80 transition-colors flex items-center gap-3 text-sm"
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-amber-400 bg-stone-850">
                          {profile.photoURL ? (
                            <img src={profile.photoURL} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-500">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-extrabold text-white truncate leading-tight">{profile.name}</p>
                          {profile.userName && (
                            <p className="font-mono text-[10px] text-amber-500 truncate">@{profile.userName}</p>
                          )}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-4 text-xs font-semibold text-stone-500 text-center">
                      No matching verified recommended profiles found.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Field 2: Country Selection */}
            <div>
              <CountrySelector 
                value={selectedCountry} 
                onChange={(val) => setSelectedCountry(val)} 
                placeholder="All Countries"
              />
            </div>

            {/* Field 3: Location search bar */}
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-stone-800 border-2 border-transparent">
                <MapPin className="w-5 h-5 text-stone-400 shrink-0" />
                <input 
                  type="text"
                  placeholder="Enter exact city..."
                  className="w-full bg-transparent border-none outline-none text-sm font-semibold text-white placeholder-stone-500"
                  value={locationTerm}
                  onChange={(e) => setLocationTerm(e.target.value)}
                />
                {locationTerm && (
                  <button type="button" onClick={() => setLocationTerm('')} className="p-1 text-stone-400 hover:text-white rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Recent searches history row */}
          {recentSearches.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto py-1 shrink-0 no-scrollbar select-none">
              <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                {recentSearches.map((term, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => triggerSearchSelect(term)}
                    className="shrink-0 bg-stone-800 text-stone-300 hover:bg-stone-700 font-semibold px-2.5 py-1 rounded-lg text-xs max-w-[120px] truncate"
                  >
                    {term}
                  </button>
                ))}
              </div>
              <button 
                onClick={handleClearRecentSearches}
                className="text-xs font-bold text-amber-500 hover:text-amber-400 shrink-0 ml-auto pl-1 border-l border-stone-800"
              >
                Clear History
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
        {/* Dynamic header summary block */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 mb-6 border-b border-stone-200/80 pb-4">
          <div>
            <h1 className="text-3xl font-black text-stone-900 leading-none tracking-tight flex items-center gap-2">
              Verified Sellers
            </h1>
            <p className="text-xs font-semibold text-stone-400 mt-1 uppercase tracking-widest">
              Trusted KYC Verified & Premium members available
            </p>
          </div>
          <div className="bg-stone-900 text-amber-400 font-mono text-xs font-extrabold tracking-wider uppercase px-3 py-1.5 rounded-full ring-2 ring-stone-900 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" /> {filteredAndSortedProfiles.length} Members Match
          </div>
        </div>

        {error && (
          <div className="py-12 px-6 text-center text-red-600 bg-red-50 rounded-2xl border border-red-200 shadow-sm">
            <p className="font-semibold text-sm mb-1">{error}</p>
            <button 
              onClick={() => fetchVerifiedSearchProfiles()}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {loading && !error ? (
          <div className="py-24 text-center">
            <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs font-black uppercase tracking-widest text-stone-400">Filtering verified base...</p>
          </div>
        ) : !error && (
          <div className="grid grid-cols-1 gap-4">
            {filteredAndSortedProfiles.slice(0, visibleCount).map((profile) => {
              const verification = resolveAuthoritativeVerification(profile);
              const kycValid = verification.showBlueKycTick;
              const premiumValid = verification.showGoldPremiumTick;
              return (
                <Link 
                  key={profile.id} 
                  to={`/user/${profile.id}`}
                  className="group bg-white p-4 rounded-3xl border border-stone-200/60 hover:border-amber-400 hover:shadow-xl hover:-translate-y-0.5 transition-all flex flex-col md:flex-row items-stretch gap-4 md:gap-6"
                >
                  {/* Left Side: Avatar block with custom badges */}
                  <div className="flex md:flex-col items-center justify-center shrink-0">
                    <div className="relative">
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-[3px] border-amber-300 p-0.5 bg-stone-100 flex items-center justify-center shadow-inner">
                        {profile.photoURL ? (
                          <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover rounded-full" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-stone-200 text-stone-400 rounded-full">
                            <User className="w-10 h-10 text-stone-400" />
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 bg-white rounded-xl p-1 shadow flex items-center gap-1 border border-stone-100">
                        {kycValid && (
                          <CheckCircle className="w-5 h-5 text-blue-500 fill-blue-50" title="KYC Verified" />
                        )}
                        {premiumValid && (
                          <Award className="w-5 h-5 text-amber-500 fill-amber-50" title="Premium Active" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mid Side: Information fields formatted for quick mobile visual scanning */}
                  <div className="flex-grow min-w-0 flex flex-col justify-center">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-extrabold text-lg text-stone-900 group-hover:text-amber-600 transition-colors">
                        {profile.name || 'Anonymous User'}
                      </h3>
                      {profile.userName && (
                        <span className="font-mono text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100">
                          @{profile.userName}
                        </span>
                      )}
                    </div>

                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/60 space-y-3 mb-2.5 text-xs text-stone-700 select-none">
                      {/* Interactive metadata display */}
                      <div className="flex items-center gap-3">
                        <span className="text-stone-400 uppercase font-black text-[10px] tracking-widest w-24 shrink-0">
                          KYC Status
                        </span>
                        {kycValid ? (
                          <span className="text-emerald-600 font-extrabold uppercase text-[10px] tracking-wider bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                            ✓ APPROVED
                          </span>
                        ) : (
                          <span className="text-stone-400 font-extrabold uppercase text-[10px] tracking-wider bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                            UNAPPROVED / NONE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-stone-400 uppercase font-black text-[10px] tracking-widest w-24 shrink-0">
                          Premium Seller
                        </span>
                        {premiumValid ? (
                          <span className="text-amber-600 font-extrabold uppercase text-[10px] tracking-wider bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                            ✓ ACTIVE GOLD
                          </span>
                        ) : (
                          <span className="text-stone-400 font-extrabold uppercase text-[10px] tracking-wider bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                            INACTIVE / NONE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 border-t border-stone-200/50 pt-2">
                        <span className="text-stone-400 uppercase font-black text-[10px] tracking-widest w-24 shrink-0">
                          Total Views
                        </span>
                        <span className="font-black text-stone-900 text-sm">
                          {(profile as any).views ?? profile.totalViews ?? 0} views
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="flex items-center gap-1 bg-stone-100/80 px-2.5 py-1 rounded-lg text-xs font-semibold text-stone-500">
                        <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" /> {profile.country ? `${getCountryFlag(profile.country)} ${profile.country}, ` : ''}{profile.city || 'Pakistan'}
                      </span>
                    </div>
                  </div>

                  {/* Right Side: View profile action call */}
                  <div className="flex items-center justify-end shrink-0 border-t border-stone-100 pt-3 md:pt-0 md:border-t-0 md:pl-4">
                    <button className="w-full md:w-auto bg-stone-900 text-white font-extrabold uppercase italic tracking-widest text-xs px-6 py-4 rounded-xl group-hover:bg-amber-500 group-hover:text-stone-900 transition-all flex items-center justify-center gap-2">
                      View Profile <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </Link>
              );
            })}

            {visibleCount < filteredAndSortedProfiles.length && (
              <div className="py-6 text-center">
                <div className="inline-flex items-center gap-2 text-xs font-bold text-stone-400 animate-pulse">
                  <Flame className="w-4 h-4 text-amber-500" /> Loading more results...
                </div>
              </div>
            )}

            {!loading && filteredAndSortedProfiles.length === 0 && (
              <div className="py-24 text-center bg-white rounded-3xl border-2 border-dashed border-stone-200 p-8">
                <Award className="w-16 h-16 text-stone-300 mx-auto mb-4" />
                <p className="text-stone-900 font-extrabold text-base mb-1">No Matching Verified Sellers Found</p>
                <p className="text-stone-400 text-xs">Try searching for alternative names, usernames, or exact location matches.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
