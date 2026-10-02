import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { ArenaCreateForm } from '../../features/battle-bids/components/ArenaCreateForm';
import { ArenaSectionHeader } from '../../features/battle-bids/components/shared/ArenaSectionHeader';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';
import { ChevronLeft, Gavel, Zap, Lock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { isUserBanned, getUserBanRemaining } from '../../services/userService';

export const ArenaCreateAuction: React.FC<{ forceNegotiation?: boolean }> = ({ forceNegotiation }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile, loading } = useAuth();
  const isNegotiation = forceNegotiation || 
                        location.pathname.startsWith('/negotiations') || 
                        new URLSearchParams(location.search).get('type') === 'negotiation';
  const loginEmail = (user?.email || userProfile?.email || '').trim();

  const isBanned = isUserBanned(userProfile) || 
                   userProfile?.postingDisabled === true || 
                   userProfile?.canPost === false || 
                   userProfile?.isBlocked === true;
  const banInfo = getUserBanRemaining(userProfile);

  const isProfileComplete = Boolean(
    user &&
    userProfile?.name?.trim() &&
    userProfile?.country?.trim() &&
    userProfile?.city?.trim() &&
    (userProfile?.phoneNumber || userProfile?.phone || '').trim() &&
    (userProfile?.address || userProfile?.residentialAddress || userProfile?.businessAddress || '').trim()
  );

  if (loading) {
    return (
      <ArenaLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
        </div>
      </ArenaLayout>
    );
  }

  return (
    <ArenaLayout>
      <div className="max-w-4xl mx-auto space-y-8 pb-24">
        {/* Header Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ArenaBackButton fallbackPath={isNegotiation ? '/negotiations' : '/battle-bids'} />

          {isNegotiation ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-black text-amber-500 uppercase tracking-widest">Private Negotiation</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-rose-600/10 border border-rose-600/20 rounded-xl">
              <Gavel className="w-4 h-4 text-rose-600" />
              <span className="text-xs font-black text-rose-600 uppercase tracking-widest">New Deployment</span>
            </div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <ArenaSectionHeader 
            title={isNegotiation ? "Post Asset for Negotiation" : "Deploy New Auction"} 
            subtitle={isNegotiation ? "List your high-value asset directly for private, encrypted proposals." : "Prepare your unit for the highest-stakes global marketplace"}
          />
          <p className="text-stone-400 text-sm font-medium leading-relaxed max-w-2xl">
            {isNegotiation 
              ? "Assets posted here will bypass the public bidding floor and immediately accept private, secure offers from verified buyers."
              : "Battle Bids auctions are fast, high-visibility, and strictly regulated. Ensure your intelligence logs (description) and visual captures are accurate."}
          </p>
        </motion.div>

        {/* Private Negotiation Email Identity & Lock Notice */}
        {isNegotiation && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Account-Bound Identity Policy
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Email Locked
                  </span>
                </div>
                <p className="text-xs text-stone-300 leading-relaxed max-w-2xl">
                  Private Negotiation listings automatically lock to your authenticated login email ({loginEmail ? <span className="text-amber-400 font-mono font-bold">{loginEmail}</span> : <span className="text-rose-400 font-bold">Not Signed In</span>}). Organization or alternate email addresses cannot be used.
                </p>
              </div>
            </div>

            {!loginEmail && (
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="w-full sm:w-auto px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shrink-0 text-center"
              >
                Sign In First
              </button>
            )}
          </motion.div>
        )}
 
        {isBanned ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 sm:p-8 md:p-10 rounded-3xl bg-rose-950/40 border border-rose-600/40 text-rose-300 space-y-4 shadow-2xl backdrop-blur-sm"
          >
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30">
                <ShieldAlert className="w-8 h-8 text-rose-400" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-wider text-rose-200">
                  Account Restricted from Deploying Items
                </h3>
                <p className="text-xs text-rose-400 font-medium">
                  {banInfo.formattedText}
                </p>
              </div>
            </div>
            <p className="text-sm text-stone-300 leading-relaxed max-w-2xl">
              Your account has been administratively restricted from posting new Battle Bids auctions and Private Negotiation listings. If you believe this restriction is in error, you may submit an appeal through your profile.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-widest transition-all shadow-lg cursor-pointer"
              >
                View Account Status & Appeals
              </button>
              <button
                type="button"
                onClick={() => navigate(isNegotiation ? '/negotiations' : '/battle-bids')}
                className="px-5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer"
              >
                Return to Marketplace
              </button>
            </div>
          </motion.div>
        ) : !user ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 sm:p-8 md:p-10 rounded-3xl bg-amber-950/30 border border-amber-500/30 text-amber-300 space-y-4 shadow-2xl backdrop-blur-sm"
          >
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/30">
                <Lock className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-wider text-amber-200">
                  Authentication Required
                </h3>
                <p className="text-xs text-amber-400/90 font-medium">
                  You must be signed in to create Battle Bids auctions or Private Negotiation listings.
                </p>
              </div>
            </div>
            <p className="text-sm text-stone-300 leading-relaxed max-w-2xl">
              Please sign in with your verified account credentials to access deployment privileges.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-widest transition-all shadow-lg cursor-pointer"
              >
                Sign In to Proceed
              </button>
            </div>
          </motion.div>
        ) : !isProfileComplete ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 sm:p-8 md:p-10 rounded-3xl bg-amber-950/30 border border-amber-500/30 text-amber-300 space-y-4 shadow-2xl backdrop-blur-sm"
          >
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/30">
                <ShieldAlert className="w-8 h-8 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-wider text-amber-200">
                  Complete Your Profile First
                </h3>
                <p className="text-xs text-amber-400/90 font-medium">
                  Authoritative Standard Marketplace Profile Required
                </p>
              </div>
            </div>
            <p className="text-sm text-stone-300 leading-relaxed max-w-2xl">
              To deploy an item or list an asset for private negotiation, your Standard Marketplace Profile must be fully completed first (Name, Country, City, Contact Number, and Address). Listing creation forms cannot mutate or invent seller profile data.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-widest transition-all shadow-lg cursor-pointer"
              >
                Complete Profile in Profile Settings
              </button>
              <button
                type="button"
                onClick={() => navigate(isNegotiation ? '/negotiations' : '/battle-bids')}
                className="px-5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer"
              >
                Return to Marketplace
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-stone-950/30 border border-stone-800/50 rounded-3xl md:rounded-[3rem] p-5 sm:p-8 md:p-12"
          >
            <ArenaCreateForm isNegotiation={isNegotiation} />
          </motion.div>
        )}
      </div>
    </ArenaLayout>
  );
};
