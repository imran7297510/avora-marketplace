import React, { memo } from 'react';
import { 
  Eye, 
  Share2, 
  Gavel, 
  TrendingUp, 
  Heart, 
  Flag, 
  Loader2, 
  Check, 
  AlertCircle,
  PauseCircle,
  PlayCircle,
  Sparkles,
  Zap,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Snowflake,
  Octagon,
  UserX,
  UserCheck,
  ShieldOff,
  ShieldCheck,
  Shield
} from 'lucide-react';
import { AuctionItem, ReportTargetType } from '../types';
import { UserProfile } from '../../../types';
import { User as FirebaseUser } from 'firebase/auth';
import { useAuth } from '../../../context/AuthContext';
import { useArenaTacticalActions } from '../hooks/useArenaTacticalActions';
import { LiveViewsBreakdownModal } from './LiveViewsBreakdownModal';
import { ReportModal } from './ReportModal';
import { ArenaBidsTabsSection } from './ArenaBidsTabsSection';
import { AuctionAnalyticsDashboard } from './AuctionAnalyticsDashboard';
import { ArenaConfirmationDialog } from './ArenaConfirmationDialog';
import { BadgeActivities } from '../../../components/BadgeActivities';
import { ArenaModal } from './shared/ArenaModal';
import { 
  AdminWarningModal, 
  AdminForceStopModal, 
  AdminBlockModal 
} from './ArenaAdminModals';
import { BanUserModal } from './shared/BanUserModal';
import { getUserBanRemaining } from '../../../services/userService';
import { cn } from '../../../lib/utils';

export interface ArenaTacticalActionsProps {
  item: AuctionItem;
  user?: FirebaseUser | null;
  userProfile?: UserProfile | null;
  className?: string;
  variant?: 'compact' | 'expanded' | 'toolbar';
}

export const ArenaTacticalActions: React.FC<ArenaTacticalActionsProps> = memo(({
  item,
  user: propUser,
  userProfile: propUserProfile,
  className
}) => {
  const { user: authUser, userProfile: authUserProfile } = useAuth();
  const effectiveUser = propUser !== undefined ? propUser : authUser;
  const effectiveProfile = propUserProfile !== undefined ? propUserProfile : authUserProfile;

  const {
    // Permissions & Entities
    isOwner,
    isAdmin,
    targetSellerId,
    sellerProfile,

    // Real-time Authoritative Statuses
    isFrozen,
    isForceStopped,
    isSellerBlocked,
    isSellerBanned,
    isAccepted,

    // Public State values
    bids,
    isFavorited,
    viewsCount,
    bidsCount,
    watchersCount,
    feedbackMessage,
    analyticsData,

    // Public Loading states
    isViewingLoading,
    isShareLoading,
    isFavoriteLoading,
    isAnalyticsLoading,

    // Seller Loading states
    isPauseResumeLoading,
    isDeleteLoading,

    // Admin Loading states
    isAdminWarningLoading,
    isAdminFreezeLoading,
    isAdminForceStopLoading,
    isAdminForceRemoveLoading,
    isAdminBlockLoading,
    isAdminBanLoading,

    // Public Modal display states
    showViewsModal,
    setShowViewsModal,
    showBidsModal,
    setShowBidsModal,
    showAnalyticsModal,
    setShowAnalyticsModal,
    showReportModal,
    setShowReportModal,

    // Seller Modal & Dialog states
    showPauseConfirm,
    setShowPauseConfirm,
    showResumeConfirm,
    setShowResumeConfirm,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showPromoteModal,
    setShowPromoteModal,
    promoteCategory,

    // Admin Modal & Dialog states
    showAdminWarningModal,
    setShowAdminWarningModal,
    showAdminFreezeConfirm,
    setShowAdminFreezeConfirm,
    showAdminUnfreezeConfirm,
    setShowAdminUnfreezeConfirm,
    showAdminForceStopConfirm,
    setShowAdminForceStopConfirm,
    showAdminForceRemoveConfirm,
    setShowAdminForceRemoveConfirm,
    showAdminBlockConfirm,
    setShowAdminBlockConfirm,
    showAdminUnblockConfirm,
    setShowAdminUnblockConfirm,
    showAdminBanModal,
    setShowAdminBanModal,
    showAdminUnbanConfirm,
    setShowAdminUnbanConfirm,

    // Public Execution Handlers
    handleViewsClick,
    handleShareClick,
    handleBidsClick,
    handleAnalyticsClick,
    handleFavoriteClick,
    handleReportClick,

    // Seller Execution Handlers
    handlePauseResumeClick,
    confirmPause,
    confirmResume,
    handlePromoteClick,
    handleBoostClick,
    handleDeleteClick,
    confirmDelete,

    // Admin Execution Handlers
    handleAdminWarningClick,
    confirmAdminWarning,
    handleAdminFreezeUnfreezeClick,
    confirmAdminFreeze,
    confirmAdminUnfreeze,
    handleAdminForceRemoveClick,
    confirmAdminForceRemove,
    handleAdminForceStopClick,
    confirmAdminForceStop,
    handleAdminBlockUnblockClick,
    confirmAdminBlock,
    confirmAdminUnblock,
    handleAdminBanClick,
    confirmAdminBan,
    confirmAdminUnban
  } = useArenaTacticalActions({
    item,
    user: effectiveUser,
    userProfile: effectiveProfile
  });

  return (
    <div 
      className={cn("w-full space-y-2 select-none", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Visual Feedback Toast/Alert */}
      {feedbackMessage && (
        <div className={cn(
          "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 shadow-lg transition-all animate-in fade-in slide-in-from-top-1",
          feedbackMessage.type === 'success' 
            ? "bg-emerald-950/90 text-emerald-300 border border-emerald-800" 
            : "bg-rose-950/90 text-rose-300 border border-rose-800"
        )}>
          <div className="flex items-center gap-1.5 truncate">
            {feedbackMessage.type === 'success' ? (
              <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            )}
            <span className="truncate">{feedbackMessage.text}</span>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 1. PUBLIC TACTICAL ACTION BAR (6 ACTIONS - STEP 2)                   */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-6 gap-1 sm:gap-1.5 p-1 bg-stone-950/90 border border-stone-850/80 rounded-xl">
        {/* 1. VIEWS */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleViewsClick();
          }}
          disabled={isViewingLoading}
          title="Inspect Real-Time Views Breakdown"
          aria-label="Views Breakdown"
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors group relative bg-stone-900/50 hover:bg-stone-850 hover:text-white border border-stone-800/60 disabled:opacity-50"
        >
          {isViewingLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
          ) : (
            <Eye className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-400 transition-colors" />
          )}
          <span className="text-[9px] font-mono font-bold text-stone-300 group-hover:text-white mt-0.5 leading-none truncate max-w-full">
            {viewsCount}
          </span>
          <span className="text-[7.5px] uppercase tracking-wider text-stone-500 group-hover:text-stone-400 mt-0.5 leading-none">
            Views
          </span>
        </button>

        {/* 2. SHARE */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleShareClick();
          }}
          disabled={isShareLoading}
          title="Share Combat Auction Link"
          aria-label="Share Auction"
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors group relative bg-stone-900/50 hover:bg-stone-850 hover:text-white border border-stone-800/60 disabled:opacity-50"
        >
          {isShareLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
          ) : (
            <Share2 className="w-3.5 h-3.5 text-stone-400 group-hover:text-sky-400 transition-colors" />
          )}
          <span className="text-[9px] font-mono font-bold text-stone-300 group-hover:text-white mt-0.5 leading-none">
            Share
          </span>
          <span className="text-[7.5px] uppercase tracking-wider text-stone-500 group-hover:text-stone-400 mt-0.5 leading-none">
            Link
          </span>
        </button>

        {/* 3. BIDS */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleBidsClick();
          }}
          title="View Live Combat Bid Stream"
          aria-label="Combat Bids"
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors group relative bg-stone-900/50 hover:bg-stone-850 hover:text-white border border-stone-800/60"
        >
          <Gavel className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-500 transition-colors" />
          <span className="text-[9px] font-mono font-bold text-stone-300 group-hover:text-white mt-0.5 leading-none truncate max-w-full">
            {bidsCount}
          </span>
          <span className="text-[7.5px] uppercase tracking-wider text-stone-500 group-hover:text-stone-400 mt-0.5 leading-none">
            Bids
          </span>
        </button>

        {/* 4. ANALYTICS */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAnalyticsClick();
          }}
          disabled={isAnalyticsLoading}
          title="Tactical Market & Bid Velocity Analytics"
          aria-label="Auction Analytics"
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors group relative bg-stone-900/50 hover:bg-stone-850 hover:text-white border border-stone-800/60 disabled:opacity-50"
        >
          {isAnalyticsLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
          ) : (
            <TrendingUp className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-400 transition-colors" />
          )}
          <span className="text-[9px] font-mono font-bold text-stone-300 group-hover:text-white mt-0.5 leading-none">
            Stats
          </span>
          <span className="text-[7.5px] uppercase tracking-wider text-stone-500 group-hover:text-stone-400 mt-0.5 leading-none">
            Trend
          </span>
        </button>

        {/* 5. ADD TO FAVORITE */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleFavoriteClick();
          }}
          disabled={isFavoriteLoading}
          title={isFavorited ? "Remove from Favorites" : "Add to Favorites"}
          aria-label="Add to Favorite"
          className={cn(
            "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors group relative border disabled:opacity-50",
            isFavorited 
              ? "bg-rose-950/60 border-rose-800/80 text-rose-300" 
              : "bg-stone-900/50 hover:bg-stone-850 hover:text-white border-stone-800/60"
          )}
        >
          {isFavoriteLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
          ) : (
            <Heart className={cn(
              "w-3.5 h-3.5 transition-colors",
              isFavorited ? "fill-rose-500 text-rose-500" : "text-stone-400 group-hover:text-rose-400"
            )} />
          )}
          <span className="text-[9px] font-mono font-bold text-stone-300 group-hover:text-white mt-0.5 leading-none truncate max-w-full">
            {watchersCount}
          </span>
          <span className="text-[7.5px] uppercase tracking-wider text-stone-500 group-hover:text-stone-400 mt-0.5 leading-none">
            Saved
          </span>
        </button>

        {/* 6. REPORT */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleReportClick();
          }}
          title="Report Policy Violation or Suspicious Listing"
          aria-label="Report Listing"
          className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-colors group relative bg-stone-900/50 hover:bg-rose-950/60 hover:text-rose-300 border border-stone-800/60"
        >
          <Flag className="w-3.5 h-3.5 text-stone-400 group-hover:text-rose-400 transition-colors" />
          <span className="text-[9px] font-mono font-bold text-stone-300 group-hover:text-rose-200 mt-0.5 leading-none">
            Flag
          </span>
          <span className="text-[7.5px] uppercase tracking-wider text-stone-500 group-hover:text-rose-300/80 mt-0.5 leading-none">
            Report
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 2. SELLER / OWNER TACTICAL ACTIONS BAR (STEP 3)                      */}
      {/* ==================================================================== */}
      {isOwner && (
        <div className="p-1 bg-stone-950/95 border border-amber-500/30 rounded-xl space-y-1">
          <div className="px-2 py-0.5 flex items-center justify-between text-[8px] uppercase tracking-wider font-bold text-amber-400/80">
            <span>Seller Operations</span>
            <span className="font-mono text-stone-500">Status: {item.status}</span>
          </div>
          <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
            {/* SELLER 1: SINGLE DYNAMIC PAUSE / RESUME BUTTON */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePauseResumeClick();
              }}
              disabled={isPauseResumeLoading || (item.status !== 'active' && item.status !== 'paused')}
              title={item.status === 'paused' ? "Resume Listing" : "Pause Listing"}
              aria-label={item.status === 'paused' ? "Resume Listing" : "Pause Listing"}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all group relative border disabled:opacity-50",
                item.status === 'paused'
                  ? "bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-800/80"
                  : "bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 border-amber-800/70"
              )}
            >
              {isPauseResumeLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : item.status === 'paused' ? (
                <PlayCircle className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              ) : (
                <PauseCircle className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-[9px] font-mono font-black text-white mt-0.5 leading-none">
                {item.status === 'paused' ? 'Resume' : 'Pause'}
              </span>
              <span className="text-[7.5px] uppercase tracking-wider text-stone-400 group-hover:text-stone-300 mt-0.5 leading-none">
                Listing
              </span>
            </button>

            {/* SELLER 2: PROMOTE (FEATURED) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePromoteClick();
              }}
              title="Promote with Featured Badge"
              aria-label="Promote Listing"
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all group relative border",
                item.hasFeaturedBadge
                  ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                  : "bg-stone-900/50 hover:bg-stone-850 hover:text-white border-stone-800/60"
              )}
            >
              <Sparkles className={cn(
                "w-3.5 h-3.5 transition-colors",
                item.hasFeaturedBadge ? "text-amber-400 fill-amber-400" : "text-stone-400 group-hover:text-amber-400"
              )} />
              <span className="text-[9px] font-mono font-bold text-stone-300 group-hover:text-white mt-0.5 leading-none">
                {item.hasFeaturedBadge ? 'Featured' : 'Promote'}
              </span>
              <span className="text-[7.5px] uppercase tracking-wider text-stone-500 group-hover:text-stone-400 mt-0.5 leading-none">
                Ad Badge
              </span>
            </button>

            {/* SELLER 3: BOOST */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleBoostClick();
              }}
              title="Boost Auction Visibility"
              aria-label="Boost Listing"
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all group relative border",
                item.hasBoostedBadge
                  ? "bg-purple-500/20 border-purple-500/60 text-purple-300"
                  : "bg-stone-900/50 hover:bg-stone-850 hover:text-white border-stone-800/60"
              )}
            >
              <Zap className={cn(
                "w-3.5 h-3.5 transition-colors",
                item.hasBoostedBadge ? "text-purple-400 fill-purple-400" : "text-stone-400 group-hover:text-purple-400"
              )} />
              <span className="text-[9px] font-mono font-bold text-stone-300 group-hover:text-white mt-0.5 leading-none">
                {item.hasBoostedBadge ? 'Boosted' : 'Boost'}
              </span>
              <span className="text-[7.5px] uppercase tracking-wider text-stone-500 group-hover:text-stone-400 mt-0.5 leading-none">
                Traffic
              </span>
            </button>

            {/* SELLER 4: DELETE */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isAccepted) return;
                handleDeleteClick();
              }}
              disabled={isDeleteLoading || isAccepted}
              title={isAccepted ? "Action Denied: Cannot remove listed item once marked as Accepted" : "Delete Listing Permanently"}
              aria-label="Delete Listing"
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all group relative border",
                isAccepted
                  ? "bg-stone-900/30 border-stone-800/40 opacity-40 cursor-not-allowed text-stone-600"
                  : "bg-stone-900/50 hover:bg-rose-950/80 hover:text-rose-200 border-stone-800/60 disabled:opacity-50"
              )}
            >
              {isDeleteLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
              ) : (
                <Trash2 className={cn("w-3.5 h-3.5 transition-colors", isAccepted ? "text-stone-600" : "text-stone-400 group-hover:text-rose-400")} />
              )}
              <span className={cn("text-[9px] font-mono font-bold mt-0.5 leading-none", isAccepted ? "text-stone-600" : "text-stone-300 group-hover:text-rose-200")}>
                Delete
              </span>
              <span className={cn("text-[7.5px] uppercase tracking-wider mt-0.5 leading-none", isAccepted ? "text-stone-600" : "text-stone-500 group-hover:text-rose-300/80")}>
                {isAccepted ? 'Locked' : 'Listing'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. ADMIN / MODERATOR TACTICAL ACTIONS BAR (STEP 4)                   */}
      {/* ==================================================================== */}
      {isAdmin && (
        <div className="p-1.5 bg-stone-950/95 border border-red-500/40 rounded-xl space-y-1.5 shadow-lg shadow-red-950/20">
          <div className="px-1.5 py-0.5 flex items-center justify-between text-[8.5px] font-bold tracking-wider">
            <div className="flex items-center gap-1.5 text-rose-400">
              <Shield className="w-3 h-3 text-rose-500" />
              <span className="uppercase">Tactical Moderation (Admin)</span>
            </div>
            <div className="flex items-center gap-1 text-[7.5px] font-mono font-semibold">
              {isForceStopped ? (
                <span className="px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-800">
                  FORCE STOPPED
                </span>
              ) : isFrozen ? (
                <span className="px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800">
                  FROZEN
                </span>
              ) : null}
              {isSellerBlocked ? (
                <span className="px-1.5 py-0.2 rounded bg-orange-950 text-orange-300 border border-orange-800">
                  SELLER BLOCKED
                </span>
              ) : isSellerBanned ? (
                <span className="px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-800">
                  SELLER BANNED
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-6 gap-1 sm:gap-1.5">
            {/* ADMIN 1: ISSUE WARNING */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAdminWarningClick();
              }}
              disabled={isAdminWarningLoading}
              title="Issue Formal Policy Violation Warning to Seller"
              aria-label="Issue Warning"
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all group relative bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-700/60 disabled:opacity-50"
            >
              {isAdminWarningLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-[8.5px] font-mono font-bold text-amber-200 mt-0.5 leading-none truncate max-w-full">
                Warning
              </span>
              <span className="text-[7px] uppercase tracking-wider text-amber-500/90 group-hover:text-amber-400 mt-0.5 leading-none">
                Notice
              </span>
            </button>

            {/* ADMIN 2 & 3: FREEZE / UNFREEZE AUCTION (SINGLE DYNAMIC BUTTON) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAdminFreezeUnfreezeClick();
              }}
              disabled={isAdminFreezeLoading || isForceStopped}
              title={
                isForceStopped
                  ? "Force stopped auctions cannot be frozen/unfrozen"
                  : isFrozen
                  ? "Unfreeze Combat Auction"
                  : "Freeze Combat Auction"
              }
              aria-label={isFrozen ? "Unfreeze Auction" : "Freeze Auction"}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all group relative border disabled:opacity-50",
                isForceStopped
                  ? "bg-stone-900/50 text-stone-500 border-stone-800 cursor-not-allowed"
                  : isFrozen
                  ? "bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-700/70"
                  : "bg-sky-950/50 hover:bg-sky-900/70 text-sky-300 border-sky-700/60"
              )}
            >
              {isAdminFreezeLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
              ) : isFrozen ? (
                <PlayCircle className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              ) : (
                <Snowflake className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-[8.5px] font-mono font-bold text-white mt-0.5 leading-none truncate max-w-full">
                {isFrozen ? "Unfreeze" : "Freeze"}
              </span>
              <span className="text-[7px] uppercase tracking-wider text-stone-400 group-hover:text-stone-300 mt-0.5 leading-none">
                Auction
              </span>
            </button>

            {/* ADMIN 4: FORCE STOP */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAdminForceStopClick();
              }}
              disabled={isAdminForceStopLoading || isForceStopped}
              title={isForceStopped ? "Already Force Stopped" : "Permanently Force Stop Auction (Irreversible)"}
              aria-label="Force Stop Auction"
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all group relative border disabled:opacity-50",
                isForceStopped
                  ? "bg-rose-950/30 text-rose-500 border-rose-900/40 cursor-not-allowed"
                  : "bg-rose-950/50 hover:bg-rose-900/80 text-rose-300 border-rose-800/70"
              )}
            >
              {isAdminForceStopLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
              ) : (
                <Octagon className="w-3.5 h-3.5 text-rose-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-[8.5px] font-mono font-bold text-rose-200 mt-0.5 leading-none truncate max-w-full">
                {isForceStopped ? "Stopped" : "Force Stop"}
              </span>
              <span className="text-[7px] uppercase tracking-wider text-rose-400/80 group-hover:text-rose-300 mt-0.5 leading-none">
                Terminal
              </span>
            </button>

            {/* ADMIN 5: FORCE REMOVE / DELETE */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAdminForceRemoveClick();
              }}
              disabled={isAdminForceRemoveLoading}
              title="Permanently Delete and Wipe Listing (Destructive Moderation)"
              aria-label="Force Remove Listing"
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all group relative bg-red-950/60 hover:bg-red-900/90 text-red-200 border border-red-700/80 disabled:opacity-50"
            >
              {isAdminForceRemoveLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 text-red-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-[8.5px] font-mono font-bold text-red-100 mt-0.5 leading-none truncate max-w-full">
                Remove
              </span>
              <span className="text-[7px] uppercase tracking-wider text-red-400/80 group-hover:text-red-300 mt-0.5 leading-none">
                Delete
              </span>
            </button>

            {/* ADMIN 6 & 7: BLOCK / UNBLOCK SELLER (SINGLE DYNAMIC BUTTON) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAdminBlockUnblockClick();
              }}
              disabled={isAdminBlockLoading || !targetSellerId}
              title={isSellerBlocked ? "Unblock Seller Account" : "Block Seller Account"}
              aria-label={isSellerBlocked ? "Unblock Seller" : "Block Seller"}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all group relative border disabled:opacity-50",
                isSellerBlocked
                  ? "bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-700/70"
                  : "bg-orange-950/50 hover:bg-orange-900/70 text-orange-300 border-orange-700/60"
              )}
            >
              {isAdminBlockLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
              ) : isSellerBlocked ? (
                <UserCheck className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              ) : (
                <UserX className="w-3.5 h-3.5 text-orange-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-[8.5px] font-mono font-bold text-white mt-0.5 leading-none truncate max-w-full">
                {isSellerBlocked ? "Unblock" : "Block"}
              </span>
              <span className="text-[7px] uppercase tracking-wider text-stone-400 group-hover:text-stone-300 mt-0.5 leading-none">
                Seller
              </span>
            </button>

            {/* ADMIN 8: BAN / UNBAN USER (DYNAMIC DUAL STATE) */}
            <button
              type="button"
              id="admin-tactical-ban-unban-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleAdminBanClick();
              }}
              disabled={isAdminBanLoading || !targetSellerId}
              title={isSellerBanned ? "Unban User Account" : "Ban User Account from Platform"}
              aria-label={isSellerBanned ? "Unban User" : "Ban User"}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all group relative border disabled:opacity-50",
                isSellerBanned
                  ? "bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-700/70"
                  : "bg-purple-950/50 hover:bg-purple-900/70 text-purple-200 border-purple-700/60"
              )}
            >
              {isAdminBanLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
              ) : isSellerBanned ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
              ) : (
                <ShieldOff className="w-3.5 h-3.5 text-purple-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-[8.5px] font-mono font-bold text-white mt-0.5 leading-none truncate max-w-full">
                {isSellerBanned ? "Unban" : "Ban"}
              </span>
              <span className="text-[7px] uppercase tracking-wider text-stone-400 group-hover:text-stone-300 mt-0.5 leading-none">
                User
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PUBLIC MODALS                                                        */}
      {/* ==================================================================== */}

      {/* MODAL 1: LIVE VIEWS BREAKDOWN */}
      <LiveViewsBreakdownModal
        isOpen={showViewsModal}
        onClose={() => setShowViewsModal(false)}
        item={item}
        viewsCount={viewsCount}
      />

      {/* MODAL 2: COMBAT BIDS REAL-TIME MODAL */}
      <ArenaModal
        isOpen={showBidsModal}
        onClose={() => setShowBidsModal(false)}
        title="Live Combat Bid Stream"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 pt-2">
          <ArenaBidsTabsSection
            bids={bids}
            auction={item}
            user={effectiveUser}
          />
        </div>
      </ArenaModal>

      {/* MODAL 3: AUCTION ANALYTICS MODAL */}
      <ArenaModal
        isOpen={showAnalyticsModal}
        onClose={() => setShowAnalyticsModal(false)}
        title="Combat Auction Analytics & Performance"
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4 pt-2">
          {analyticsData ? (
            <AuctionAnalyticsDashboard
              auction={item}
              analytics={analyticsData}
            />
          ) : (
            <div className="p-8 text-center text-stone-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
              <p className="text-sm font-medium">Computing tactical analytics...</p>
            </div>
          )}
        </div>
      </ArenaModal>

      {/* MODAL 4: REPORT MODAL */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetId={item.id}
        targetType={'listing' as ReportTargetType}
        targetTitle={item.title}
        targetOwnerId={item.sellerId}
      />

      {/* ==================================================================== */}
      {/* SELLER CONFIRMATIONS & MODALS                                        */}
      {/* ==================================================================== */}

      {/* SELLER CONFIRMATION 1: PAUSE LISTING */}
      <ArenaConfirmationDialog
        isOpen={showPauseConfirm}
        onClose={() => setShowPauseConfirm(false)}
        onConfirm={confirmPause}
        title="Pause Listing?"
        description="Are you sure you want to pause this auction? The auction countdown will stop and bidding will be temporarily disabled."
        confirmText="Confirm Pause"
        cancelText="Cancel"
        variant="warning"
        isLoading={isPauseResumeLoading}
      />

      {/* SELLER CONFIRMATION 2: RESUME LISTING */}
      <ArenaConfirmationDialog
        isOpen={showResumeConfirm}
        onClose={() => setShowResumeConfirm(false)}
        onConfirm={confirmResume}
        title="Resume Listing?"
        description="Are you sure you want to resume this auction? The auction will become active again and bidding will be enabled."
        confirmText="Confirm Resume"
        cancelText="Cancel"
        variant="primary"
        isLoading={isPauseResumeLoading}
      />

      {/* SELLER CONFIRMATION 3: DELETE LISTING */}
      <ArenaConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Remove Listing?"
        description="Are you sure you want to remove this listing? This action will cancel the listing and close its availability."
        confirmText="Remove Listing"
        cancelText="Cancel"
        variant="danger"
        isLoading={isDeleteLoading}
      />

      {/* SELLER PROMOTION MODAL: FEATURED / BOOST */}
      {showPromoteModal && (
        <ArenaModal
          isOpen={showPromoteModal}
          onClose={() => setShowPromoteModal(false)}
          title={promoteCategory === 'FEATURED' ? "Promote Asset — Featured Ads" : "Boost Asset — Instant Traffic"}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-4 pt-1">
            <BadgeActivities
              user={effectiveUser}
              defaultCategory={promoteCategory}
              defaultListingId={item.id}
              autoOpenApplyForm={true}
            />
          </div>
        </ArenaModal>
      )}

      {/* ==================================================================== */}
      {/* ADMIN MODERATOR CONFIRMATIONS & MODALS (STEP 4)                      */}
      {/* ==================================================================== */}

      {/* ADMIN 1: ISSUE WARNING MODAL */}
      <AdminWarningModal
        isOpen={showAdminWarningModal}
        onClose={() => setShowAdminWarningModal(false)}
        onConfirm={confirmAdminWarning}
        item={item}
        isLoading={isAdminWarningLoading}
      />

      {/* ADMIN 2: FREEZE CONFIRMATION DIALOG */}
      <ArenaConfirmationDialog
        isOpen={showAdminFreezeConfirm}
        onClose={() => setShowAdminFreezeConfirm(false)}
        onConfirm={confirmAdminFreeze}
        title="Freeze Combat Auction?"
        description="Are you sure you want to freeze this auction? The countdown timer will stop, and live bidding will be halted across all clients."
        confirmText="Confirm Freeze"
        cancelText="Cancel"
        variant="warning"
        isLoading={isAdminFreezeLoading}
      />

      {/* ADMIN 3: UNFREEZE CONFIRMATION DIALOG */}
      <ArenaConfirmationDialog
        isOpen={showAdminUnfreezeConfirm}
        onClose={() => setShowAdminUnfreezeConfirm(false)}
        onConfirm={confirmAdminUnfreeze}
        title="Unfreeze Combat Auction?"
        description="Are you sure you want to unfreeze this auction? The auction will resume with its preserved remaining duration, and live bidding will be restored."
        confirmText="Confirm Unfreeze"
        cancelText="Cancel"
        variant="primary"
        isLoading={isAdminFreezeLoading}
      />

      {/* ADMIN 4: FORCE STOP MODAL (IRREVERSIBLE) */}
      <AdminForceStopModal
        isOpen={showAdminForceStopConfirm}
        onClose={() => setShowAdminForceStopConfirm(false)}
        onConfirm={confirmAdminForceStop}
        item={item}
        isLoading={isAdminForceStopLoading}
      />

      {/* ADMIN 5: FORCE REMOVE / DELETE CONFIRMATION DIALOG */}
      <ArenaConfirmationDialog
        isOpen={showAdminForceRemoveConfirm}
        onClose={() => setShowAdminForceRemoveConfirm(false)}
        onConfirm={confirmAdminForceRemove}
        title="Force Remove Listing?"
        description="Are you sure you want to force remove this listing? This action will cancel the listing and close its availability."
        confirmText="Force Remove Listing"
        cancelText="Cancel"
        variant="danger"
        isLoading={isAdminForceRemoveLoading}
      />

      {/* ADMIN 6: BLOCK SELLER MODAL */}
      <AdminBlockModal
        isOpen={showAdminBlockConfirm}
        onClose={() => setShowAdminBlockConfirm(false)}
        onConfirm={confirmAdminBlock}
        targetSellerId={targetSellerId}
        sellerProfile={sellerProfile}
        isLoading={isAdminBlockLoading}
      />

      {/* ADMIN 7: UNBLOCK SELLER CONFIRMATION DIALOG */}
      <ArenaConfirmationDialog
        isOpen={showAdminUnblockConfirm}
        onClose={() => setShowAdminUnblockConfirm(false)}
        onConfirm={confirmAdminUnblock}
        title="Unblock Seller Account?"
        description={`Are you sure you want to unblock ${sellerProfile?.name || sellerProfile?.email || 'this seller'}? The seller's access, listings, and bidding capabilities will be fully restored.`}
        confirmText="Unblock Seller"
        cancelText="Cancel"
        variant="primary"
        isLoading={isAdminBlockLoading}
      />

      {/* ADMIN 8: BAN USER MODAL (REUSING REFERENCE STANDARD MARKETPLACE BanUserModal) */}
      <BanUserModal
        isOpen={showAdminBanModal}
        onClose={() => setShowAdminBanModal(false)}
        targetUserId={targetSellerId}
        targetUserName={sellerProfile?.name || (sellerProfile as any)?.username || sellerProfile?.email || targetSellerId}
        currentBan={getUserBanRemaining(sellerProfile)}
        onConfirmBan={confirmAdminBan}
        onConfirmUnban={confirmAdminUnban}
        loading={isAdminBanLoading}
      />

      {/* ADMIN 8B: UNBAN USER CONFIRMATION DIALOG (IDENTICAL TO STANDARD MARKETPLACE UNBAN CONFIRMATION) */}
      <ArenaConfirmationDialog
        isOpen={showAdminUnbanConfirm}
        onClose={() => setShowAdminUnbanConfirm(false)}
        onConfirm={confirmAdminUnban}
        title="Confirm Unban User?"
        description={`Are you sure you want to unban ${sellerProfile?.name || (sellerProfile as any)?.username || sellerProfile?.email || 'this user'}? This will lift all active bans and restrictions immediately, restoring their ability to create listings, submit bids in auctions, make offers, and submit reports.`}
        confirmText="Confirm Unban"
        cancelText="Cancel"
        variant="primary"
        isLoading={isAdminBanLoading}
      />
    </div>
  );
});

ArenaTacticalActions.displayName = 'ArenaTacticalActions';
