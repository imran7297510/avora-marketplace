import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AuctionItem, Bid, AuctionAnalytics, ModerationActionType } from '../types';
import { ArenaService } from '../services/arenaService';
import { WatchlistService } from '../services/watchlistService';
import { AnalyticsService } from '../services/analyticsService';
import { ModerationService } from '../services/moderationService';
import { resolveAuthoritativeSellerUid } from '../services/sellerIdentityResolver';
import { 
  executeCentralBlock, 
  executeCentralUnblock, 
  executeCentralBan, 
  executeCentralUnban, 
  isUserBanned, 
  getUserBanRemaining 
} from '../../../services/userService';
import { db } from '../../../lib/firebase';
import { doc, onSnapshot, Timestamp, collection, query, where } from 'firebase/firestore';
import { UserProfile } from '../../../types';
import { User as FirebaseUser } from 'firebase/auth';
import { useAuth } from '../../../context/AuthContext';

export interface UseArenaTacticalActionsProps {
  item: AuctionItem;
  user?: FirebaseUser | null;
  userProfile?: UserProfile | null;
}

export function useArenaTacticalActions({ item, user: propUser, userProfile: propUserProfile }: UseArenaTacticalActionsProps) {
  const { user: authUser, userProfile: authUserProfile, isAdmin: authIsAdmin, isSuperAdmin, isAuthorizedAdmin } = useAuth();
  const effectiveUser = propUser !== undefined ? propUser : authUser;
  const effectiveProfile = propUserProfile !== undefined ? propUserProfile : authUserProfile;

  // Determine authoritative admin privilege
  const isAdmin = Boolean(
    authIsAdmin || 
    isSuperAdmin || 
    isAuthorizedAdmin || 
    effectiveProfile?.role === 'admin' ||
    (effectiveUser?.email && ['imran7297510@gmail.com', 'imran7297510@gmail'].includes(effectiveUser.email.toLowerCase().trim()))
  );

  // Target Seller ID from auction metadata
  const itemAny = item as any;
  const targetSellerId = item?.sellerId || itemAny?.userId || itemAny?.ownerId || itemAny?.seller?.id || '';

  // Real-time seller profile listener for authoritative block/ban state
  const [sellerProfile, setSellerProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!targetSellerId) {
      setSellerProfile(null);
      return;
    }

    const unsub = onSnapshot(doc(db, 'users', targetSellerId), (docSnap) => {
      if (docSnap.exists()) {
        setSellerProfile({ id: docSnap.id, ...docSnap.data() } as UserProfile);
      } else {
        setSellerProfile(null);
      }
    }, (err) => {
      console.warn("Seller profile listener warning:", err);
    });

    return () => {
      unsub();
    };
  }, [targetSellerId]);

  // Authoritative computed seller states
  const isSellerBlocked = Boolean(
    sellerProfile?.isBlocked || 
    sellerProfile?.status === 'BLOCKED' || 
    (sellerProfile as any)?.accountStatus === 'suspended' || 
    itemAny?.isSellerBlocked
  );

  const isSellerBanned = Boolean(
    isUserBanned(sellerProfile) ||
    sellerProfile?.isBanned || 
    sellerProfile?.status === 'BANNED' || 
    (sellerProfile as any)?.accountStatus === 'banned'
  );

  // Authoritative computed auction states
  const isFrozen = Boolean(
    item.status === 'paused' || 
    item.isPaused === true || 
    item.isPausedByAdmin === true
  );

  const isForceStopped = Boolean(
    (item.status as string) === 'stopped' || 
    item.status === 'cancelled' ||
    item.forceStopped === true || 
    item.closedOnViolation === true || 
    item.isForceStopped === true || 
    item.forceStoppedByAdmin === true
  );

  // Public Action Loading states
  const [isViewingLoading, setIsViewingLoading] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);

  // Seller Action Loading states
  const [isPauseResumeLoading, setIsPauseResumeLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  // Admin Action Loading states
  const [isAdminWarningLoading, setIsAdminWarningLoading] = useState(false);
  const [isAdminFreezeLoading, setIsAdminFreezeLoading] = useState(false);
  const [isAdminForceStopLoading, setIsAdminForceStopLoading] = useState(false);
  const [isAdminForceRemoveLoading, setIsAdminForceRemoveLoading] = useState(false);
  const [isAdminBlockLoading, setIsAdminBlockLoading] = useState(false);
  const [isAdminBanLoading, setIsAdminBanLoading] = useState(false);

  // Public Modal states
  const [showViewsModal, setShowViewsModal] = useState(false);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Seller Modal / Confirmation states
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteCategory, setPromoteCategory] = useState<'FEATURED' | 'BOOST'>('FEATURED');

  // Admin Modal / Dialog states
  const [showAdminWarningModal, setShowAdminWarningModal] = useState(false);
  const [showAdminFreezeConfirm, setShowAdminFreezeConfirm] = useState(false);
  const [showAdminUnfreezeConfirm, setShowAdminUnfreezeConfirm] = useState(false);
  const [showAdminForceStopConfirm, setShowAdminForceStopConfirm] = useState(false);
  const [showAdminForceRemoveConfirm, setShowAdminForceRemoveConfirm] = useState(false);
  const [showAdminBlockConfirm, setShowAdminBlockConfirm] = useState(false);
  const [showAdminUnblockConfirm, setShowAdminUnblockConfirm] = useState(false);
  const [showAdminBanModal, setShowAdminBanModal] = useState(false);
  const [showAdminUnbanConfirm, setShowAdminUnbanConfirm] = useState(false);

  // Computed data states
  const [analyticsData, setAnalyticsData] = useState<AuctionAnalytics | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [isFavorited, setIsFavorited] = useState(false);

  // Visual Feedbacks
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showFeedback = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setFeedbackMessage({ text, type });
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedbackMessage(null);
    }, 4000);
  }, []);

  // Authoritative Private Negotiation detection
  const isPrivateNegotiation = Boolean(
    item.isNegotiationOnly ||
    (item.sellerId && typeof item.sellerId === 'string' && item.sellerId.startsWith('anon_seller_'))
  );

  // Normal Battle Bid synchronous ownership check
  const isNormalOwner = Boolean(
    effectiveUser && (
      effectiveUser.uid === item.sellerId ||
      (itemAny.userId && effectiveUser.uid === itemAny.userId) ||
      (effectiveProfile?.id && effectiveProfile.id === item.sellerId) ||
      (itemAny.sellerEmail && effectiveUser.email && effectiveUser.email.toLowerCase() === itemAny.sellerEmail.toLowerCase())
    )
  );

  // Private Negotiation asynchronous authoritative ownership state (fails closed to false)
  const [isPrivateOwner, setIsPrivateOwner] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    if (!effectiveUser?.uid || !item?.id || !isPrivateNegotiation) {
      setIsPrivateOwner(false);
      return;
    }

    resolveAuthoritativeSellerUid(item.id, {
      isNegotiationOnly: item.isNegotiationOnly,
      sellerId: item.sellerId
    }).then((authoritativeUid) => {
      if (!isCancelled) {
        setIsPrivateOwner(Boolean(authoritativeUid && authoritativeUid === effectiveUser.uid));
      }
    }).catch(() => {
      if (!isCancelled) {
        setIsPrivateOwner(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [item?.id, item?.isNegotiationOnly, item?.sellerId, effectiveUser?.uid, isPrivateNegotiation]);

  // Combined authoritative ownership verification
  const isOwner = isPrivateNegotiation ? isPrivateOwner : isNormalOwner;

  // Check initial favorite status & subscribe to real-time watchlist updates for the user
  useEffect(() => {
    if (!effectiveUser || !item?.id) {
      setIsFavorited(false);
      return;
    }

    const unsubscribe = WatchlistService.subscribeToWatchlist(effectiveUser.uid, (watchedAuctionIds) => {
      setIsFavorited(watchedAuctionIds.includes(item.id));
    });

    return () => {
      unsubscribe();
    };
  }, [effectiveUser, item?.id]);

  // Subscribe to bids for authoritative bid count & realtime modal display
  useEffect(() => {
    if (!item?.id) return;
    const unsubscribe = ArenaService.subscribeToBids(item.id, (incomingBids) => {
      setBids(incomingBids || []);
    });
    return () => {
      unsubscribe();
    };
  }, [item?.id]);

  // Real-time check if any negotiation for this listed item is accepted/concluded under Private Negotiations Hub
  const [hasAcceptedDeal, setHasAcceptedDeal] = useState(false);

  useEffect(() => {
    if (!item?.id) {
      setHasAcceptedDeal(false);
      return;
    }
    const q = query(
      collection(db, 'arena_negotiations'),
      where('auctionId', '==', item.id)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const isAnyAccepted = snapshot.docs.some(docSnap => {
        const status = (docSnap.data().status || '').toLowerCase().trim();
        return ['accepted', 'completed', 'concluded'].includes(status);
      });
      setHasAcceptedDeal(isAnyAccepted);
    }, (err) => {
      console.warn("Accepted negotiations check warning:", err);
    });
    return () => unsub();
  }, [item?.id]);

  // Authoritative computed accepted status for private negotiation items
  const isAccepted = useMemo(() => {
    const itemStatus = (item.status || '').toLowerCase().trim();
    const negStatus = ((item as any).negotiationStatus || '').toLowerCase().trim();
    return (
      hasAcceptedDeal ||
      ['accepted', 'sold', 'concluded'].includes(itemStatus) ||
      ['accepted', 'completed', 'concluded'].includes(negStatus) ||
      (item as any).isAccepted === true ||
      (item as any).isSold === true
    );
  }, [item, hasAcceptedDeal]);

  // Diagnostic logger (Development instrument)
  const logDiagnostic = useCallback((action: string, phase: string, payload?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[TACTICAL_ACTION_DIAGNOSTIC] ${action} -> ${phase}`, payload || '');
    }
  }, []);

  // ==========================================
  // 6 PUBLIC TACTICAL ACTIONS (STEP 2)
  // ==========================================

  // 1. PUBLIC: VIEWS
  const handleViewsClick = useCallback(async () => {
    logDiagnostic('VIEWS', 'CLICKED', { auctionId: item.id });
    setIsViewingLoading(true);
    try {
      if (item?.id) {
        logDiagnostic('VIEWS', 'RECORD_VIEW_CALLED');
        await ArenaService.recordView(item.id, effectiveUser?.uid);
      }
      setShowViewsModal(true);
      logDiagnostic('VIEWS', 'SUCCESS_MODAL_OPENED');
    } catch (err: any) {
      logDiagnostic('VIEWS', 'ERROR', err);
      showFeedback(err?.message || 'Failed to record view breakdown', 'error');
      setShowViewsModal(true);
    } finally {
      setIsViewingLoading(false);
    }
  }, [item?.id, effectiveUser?.uid, logDiagnostic, showFeedback]);

  // 2. PUBLIC: SHARE
  const handleShareClick = useCallback(async () => {
    logDiagnostic('SHARE', 'CLICKED', { auctionId: item.id });
    setIsShareLoading(true);
    const origin = window.location.origin;
    const shareUrl = `${origin}/battle-bids/timeline/${item.id}`;
    const shareData = { url: shareUrl };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        logDiagnostic('SHARE', 'WEB_SHARE_API_CALLED');
        await navigator.share(shareData);
        showFeedback('Shared successfully!', 'success');
      } else {
        logDiagnostic('SHARE', 'CLIPBOARD_API_CALLED');
        await navigator.clipboard.writeText(shareUrl);
        showFeedback('Auction link copied to clipboard!', 'success');
      }
      logDiagnostic('SHARE', 'SUCCESS');
    } catch (err: any) {
      logDiagnostic('SHARE', 'ERROR', err);
      if (err.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(shareUrl);
          showFeedback('Link copied to clipboard!', 'success');
        } catch (clipErr: any) {
          showFeedback(clipErr?.message || 'Failed to share or copy link', 'error');
        }
      }
    } finally {
      setIsShareLoading(false);
    }
  }, [item.id, logDiagnostic, showFeedback]);

  // 3. PUBLIC: BIDS
  const handleBidsClick = useCallback(() => {
    logDiagnostic('BIDS', 'CLICKED', { auctionId: item.id, currentBidsCount: bids.length });
    setShowBidsModal(true);
    logDiagnostic('BIDS', 'SUCCESS_MODAL_OPENED');
  }, [item.id, bids.length, logDiagnostic]);

  // 4. PUBLIC: ANALYTICS
  const handleAnalyticsClick = useCallback(async () => {
    logDiagnostic('ANALYTICS', 'CLICKED', { auctionId: item.id });
    setIsAnalyticsLoading(true);
    try {
      logDiagnostic('ANALYTICS', 'GET_ANALYTICS_CALLED');
      const data = await AnalyticsService.getAuctionAnalytics(item);
      setAnalyticsData(data);
      setShowAnalyticsModal(true);
      logDiagnostic('ANALYTICS', 'SUCCESS_DATA_LOADED');
    } catch (err: any) {
      logDiagnostic('ANALYTICS', 'ERROR', err);
      showFeedback(err?.message || 'Failed to load auction analytics', 'error');
    } finally {
      setIsAnalyticsLoading(false);
    }
  }, [item, logDiagnostic, showFeedback]);

  // 5. PUBLIC: ADD TO FAVORITE (WATCHLIST)
  const handleFavoriteClick = useCallback(async () => {
    logDiagnostic('FAVORITE', 'CLICKED', { auctionId: item.id, userId: effectiveUser?.uid, currentlyFavorited: isFavorited });
    if (!effectiveUser) {
      showFeedback('Please sign in to add to favorites', 'error');
      return;
    }

    setIsFavoriteLoading(true);
    try {
      logDiagnostic('FAVORITE', 'TOGGLE_WATCH_CALLED');
      await WatchlistService.toggleWatch(effectiveUser.uid, item.id, isFavorited);
      const nextState = !isFavorited;
      setIsFavorited(nextState);
      showFeedback(nextState ? 'Added to favorites!' : 'Removed from favorites', 'success');
      logDiagnostic('FAVORITE', 'SUCCESS', { nextState });
    } catch (err: any) {
      logDiagnostic('FAVORITE', 'ERROR', err);
      showFeedback(err?.message || 'Failed to update favorites', 'error');
    } finally {
      setIsFavoriteLoading(false);
    }
  }, [effectiveUser, item.id, isFavorited, logDiagnostic, showFeedback]);

  // 6. PUBLIC: REPORT
  const handleReportClick = useCallback(() => {
    logDiagnostic('REPORT', 'CLICKED', { auctionId: item.id, userId: effectiveUser?.uid });
    if (!effectiveUser) {
      showFeedback('Please sign in to report this listing', 'error');
      return;
    }
    setShowReportModal(true);
    logDiagnostic('REPORT', 'MODAL_OPENED');
  }, [effectiveUser, item.id, logDiagnostic]);

  // ==========================================
  // SELLER / OWNER TACTICAL ACTIONS (STEP 3)
  // ==========================================

  // SELLER 1: SINGLE DYNAMIC PAUSE / RESUME TRIGGER
  const handlePauseResumeClick = useCallback(() => {
    logDiagnostic('PAUSE_RESUME', 'CLICKED', { auctionId: item.id, status: item.status, isOwner });
    if (!isOwner) {
      showFeedback('Unauthorized: Only the seller who posted this item can pause or resume it.', 'error');
      return;
    }

    if (item.status === 'active') {
      setShowPauseConfirm(true);
    } else if (item.status === 'paused') {
      setShowResumeConfirm(true);
    } else {
      showFeedback(`Action unavailable for listing in '${item.status}' status.`, 'error');
    }
  }, [item.id, item.status, isOwner, logDiagnostic, showFeedback]);

  // CONFIRM PAUSE EXECUTION
  const confirmPause = useCallback(async () => {
    logDiagnostic('PAUSE', 'CONFIRMED', { auctionId: item.id });
    if (isPauseResumeLoading) return;
    setIsPauseResumeLoading(true);

    try {
      await ArenaService.pauseAuction(item.id);
      setShowPauseConfirm(false);
      showFeedback('Auction paused successfully. Countdown and bidding halted.', 'success');
    } catch (err: any) {
      logDiagnostic('PAUSE', 'ERROR', err);
      showFeedback(err?.message || 'Failed to pause auction listing.', 'error');
    } finally {
      setIsPauseResumeLoading(false);
    }
  }, [item.id, isPauseResumeLoading, logDiagnostic, showFeedback]);

  // CONFIRM RESUME EXECUTION
  const confirmResume = useCallback(async () => {
    logDiagnostic('RESUME', 'CONFIRMED', { auctionId: item.id });
    if (isPauseResumeLoading) return;
    setIsPauseResumeLoading(true);

    try {
      await ArenaService.resumeAuction(item.id);
      setShowResumeConfirm(false);
      showFeedback('Auction resumed successfully. Live countdown and bidding restored.', 'success');
    } catch (err: any) {
      logDiagnostic('RESUME', 'ERROR', err);
      showFeedback(err?.message || 'Failed to resume auction listing.', 'error');
    } finally {
      setIsPauseResumeLoading(false);
    }
  }, [item.id, isPauseResumeLoading, logDiagnostic, showFeedback]);

  // SELLER 2: PROMOTE (FEATURED)
  const handlePromoteClick = useCallback(() => {
    if (!isOwner) {
      showFeedback('Unauthorized: Only the seller who posted this item can promote it.', 'error');
      return;
    }
    setPromoteCategory('FEATURED');
    setShowPromoteModal(true);
  }, [isOwner, showFeedback]);

  // SELLER 3: BOOST LISTING
  const handleBoostClick = useCallback(() => {
    if (!isOwner) {
      showFeedback('Unauthorized: Only the seller who posted this item can boost it.', 'error');
      return;
    }
    setPromoteCategory('BOOST');
    setShowPromoteModal(true);
  }, [isOwner, showFeedback]);

  // SELLER 4: DELETE LISTING
  const handleDeleteClick = useCallback(() => {
    if (!isOwner) {
      showFeedback('Unauthorized: Only the seller who posted this item can delete it.', 'error');
      return;
    }
    if (isAccepted) {
      showFeedback('Action Denied: You cannot remove a listed item under Private Negotiations once it is marked as Accepted.', 'error');
      return;
    }
    setShowDeleteConfirm(true);
  }, [isOwner, isAccepted, showFeedback]);

  // CONFIRM DELETE EXECUTION
  const confirmDelete = useCallback(async () => {
    if (isDeleteLoading) return;
    if (isAccepted) {
      showFeedback('Action Denied: You cannot remove a listed item under Private Negotiations once it is marked as Accepted.', 'error');
      setShowDeleteConfirm(false);
      return;
    }
    setIsDeleteLoading(true);

    try {
      await ArenaService.softRemoveAuction(item.id, effectiveUser?.uid);
      setShowDeleteConfirm(false);
      showFeedback('Listing removed successfully.', 'success');
    } catch (err: any) {
      showFeedback(err?.message || 'Failed to remove auction listing.', 'error');
    } finally {
      setIsDeleteLoading(false);
    }
  }, [item.id, isAccepted, effectiveUser?.uid, isDeleteLoading, showFeedback]);

  // ==========================================
  // ADMIN / MODERATOR TACTICAL ACTIONS (STEP 4)
  // ==========================================

  // ADMIN 1: ISSUE WARNING
  const handleAdminWarningClick = useCallback(() => {
    if (!isAdmin || !effectiveUser) {
      showFeedback('Unauthorized: Administrator privilege required.', 'error');
      return;
    }
    setShowAdminWarningModal(true);
  }, [isAdmin, effectiveUser, showFeedback]);

  const confirmAdminWarning = useCallback(async (violationNote: string) => {
    const trimmed = violationNote?.trim();
    if (!trimmed) {
      showFeedback('Violation note cannot be empty.', 'error');
      return;
    }
    if (!effectiveUser || !item?.id) return;

    setIsAdminWarningLoading(true);
    try {
      await ModerationService.executeModerationAction(
        effectiveUser.uid,
        ModerationActionType.ISSUE_WARNING,
        'listing',
        item.id,
        trimmed
      );
      setShowAdminWarningModal(false);
      showFeedback('Administrative policy violation warning issued to seller.', 'success');
    } catch (err: any) {
      console.error("Issue warning error:", err);
      showFeedback(err?.message || 'Failed to issue administrative warning.', 'error');
    } finally {
      setIsAdminWarningLoading(false);
    }
  }, [effectiveUser, item?.id, showFeedback]);

  // ADMIN 2 & 3: FREEZE / UNFREEZE AUCTION (SINGLE DYNAMIC BUTTON)
  const handleAdminFreezeUnfreezeClick = useCallback(() => {
    if (!isAdmin || !effectiveUser) {
      showFeedback('Unauthorized: Administrator privilege required.', 'error');
      return;
    }

    if (isForceStopped) {
      showFeedback('Action denied: Force stopped auctions cannot be unfrozen or resumed.', 'error');
      return;
    }

    if (isFrozen) {
      setShowAdminUnfreezeConfirm(true);
    } else {
      setShowAdminFreezeConfirm(true);
    }
  }, [isAdmin, effectiveUser, isForceStopped, isFrozen, showFeedback]);

  const confirmAdminFreeze = useCallback(async () => {
    if (!effectiveUser || !item?.id || isAdminFreezeLoading) return;
    setIsAdminFreezeLoading(true);

    try {
      await ModerationService.executeModerationAction(
        effectiveUser.uid,
        ModerationActionType.PAUSE_AUCTION,
        'listing',
        item.id,
        "Administrative safety freeze."
      );
      setShowAdminFreezeConfirm(false);
      showFeedback('Auction successfully frozen by administration. Timer & bidding halted.', 'success');
    } catch (err: any) {
      console.error("Admin freeze error:", err);
      showFeedback(err?.message || 'Failed to freeze auction listing.', 'error');
    } finally {
      setIsAdminFreezeLoading(false);
    }
  }, [effectiveUser, item?.id, isAdminFreezeLoading, showFeedback]);

  const confirmAdminUnfreeze = useCallback(async () => {
    if (!effectiveUser || !item?.id || isAdminFreezeLoading) return;
    setIsAdminFreezeLoading(true);

    try {
      await ModerationService.executeModerationAction(
        effectiveUser.uid,
        ModerationActionType.RESUME_AUCTION,
        'listing',
        item.id,
        "Administrative safety unfreeze."
      );
      setShowAdminUnfreezeConfirm(false);
      showFeedback('Auction successfully unfrozen. Live countdown and bidding restored.', 'success');
    } catch (err: any) {
      console.error("Admin unfreeze error:", err);
      showFeedback(err?.message || 'Failed to unfreeze auction listing.', 'error');
    } finally {
      setIsAdminFreezeLoading(false);
    }
  }, [effectiveUser, item?.id, isAdminFreezeLoading, showFeedback]);

  // ADMIN 4: FORCE REMOVE / DELETE (DESTRUCTIVE MODERATION)
  const handleAdminForceRemoveClick = useCallback(() => {
    if (!isAdmin || !effectiveUser) {
      showFeedback('Unauthorized: Administrator privilege required.', 'error');
      return;
    }
    setShowAdminForceRemoveConfirm(true);
  }, [isAdmin, effectiveUser, showFeedback]);

  const confirmAdminForceRemove = useCallback(async () => {
    if (!effectiveUser || !item?.id || isAdminForceRemoveLoading) return;
    setIsAdminForceRemoveLoading(true);

    try {
      // 1. Execute moderation audit log
      await ModerationService.executeModerationAction(
        effectiveUser.uid,
        ModerationActionType.REMOVE_LISTING,
        'listing',
        item.id,
        "Administrative soft force removal."
      );
      // 2. Soft remove auction (preserve records, set isPermanentlyRemoved: true, status: 'cancelled')
      await ArenaService.softRemoveAuction(item.id, effectiveUser.uid);
      setShowAdminForceRemoveConfirm(false);
      showFeedback('Listing force-removed by administration.', 'success');
    } catch (err: any) {
      console.error("Admin force remove error:", err);
      showFeedback(err?.message || 'Failed to force remove auction listing.', 'error');
    } finally {
      setIsAdminForceRemoveLoading(false);
    }
  }, [effectiveUser, item?.id, isAdminForceRemoveLoading, showFeedback]);

  // ADMIN 5: FORCE STOP (IRREVERSIBLE TERMINATION)
  const handleAdminForceStopClick = useCallback(() => {
    if (!isAdmin || !effectiveUser) {
      showFeedback('Unauthorized: Administrator privilege required.', 'error');
      return;
    }
    if (isForceStopped) {
      showFeedback('This auction is already force-stopped.', 'error');
      return;
    }
    setShowAdminForceStopConfirm(true);
  }, [isAdmin, effectiveUser, isForceStopped, showFeedback]);

  const confirmAdminForceStop = useCallback(async (reason?: string) => {
    if (!effectiveUser || !item?.id || isAdminForceStopLoading) return;
    setIsAdminForceStopLoading(true);

    try {
      await ModerationService.executeModerationAction(
        effectiveUser.uid,
        ModerationActionType.CANCEL_AUCTION,
        'listing',
        item.id,
        reason || "Force stopped by admin due to seller policy violation."
      );
      setShowAdminForceStopConfirm(false);
      showFeedback('Auction permanently Force Stopped due to policy violation.', 'success');
    } catch (err: any) {
      console.error("Admin force stop error:", err);
      showFeedback(err?.message || 'Failed to force stop auction.', 'error');
    } finally {
      setIsAdminForceStopLoading(false);
    }
  }, [effectiveUser, item?.id, isAdminForceStopLoading, showFeedback]);

  // ADMIN 6 & 7: BLOCK / UNBLOCK SELLER (SINGLE DYNAMIC BUTTON)
  const handleAdminBlockUnblockClick = useCallback(() => {
    if (!isAdmin || !effectiveUser) {
      showFeedback('Unauthorized: Administrator privilege required.', 'error');
      return;
    }

    if (!targetSellerId) {
      showFeedback('Seller ID not found for this auction.', 'error');
      return;
    }

    if (isSellerBlocked) {
      setShowAdminUnblockConfirm(true);
    } else {
      setShowAdminBlockConfirm(true);
    }
  }, [isAdmin, effectiveUser, targetSellerId, isSellerBlocked, showFeedback]);

  const confirmAdminBlock = useCallback(async (reason?: string) => {
    if (!effectiveUser || !targetSellerId || isAdminBlockLoading) return;
    setIsAdminBlockLoading(true);

    try {
      const blockReason = reason || "Blocked by admin for violating marketplace community policies.";
      await executeCentralBlock(
        targetSellerId,
        effectiveUser.email || "Admin",
        effectiveUser.uid,
        blockReason
      );
      await ModerationService.executeModerationAction(
        effectiveUser.uid,
        ModerationActionType.SUSPEND_ACCOUNT,
        'user',
        targetSellerId,
        blockReason
      );
      setShowAdminBlockConfirm(false);
      showFeedback('Seller account successfully blocked and restricted across the platform.', 'success');
    } catch (err: any) {
      console.error("Admin block error:", err);
      showFeedback(err?.message || 'Failed to block seller account.', 'error');
    } finally {
      setIsAdminBlockLoading(false);
    }
  }, [effectiveUser, targetSellerId, isAdminBlockLoading, showFeedback]);

  const confirmAdminUnblock = useCallback(async () => {
    if (!effectiveUser || !targetSellerId || isAdminBlockLoading) return;
    setIsAdminBlockLoading(true);

    try {
      await executeCentralUnblock(
        targetSellerId,
        effectiveUser.email || "Admin",
        effectiveUser.uid
      );
      await ModerationService.executeModerationAction(
        effectiveUser.uid,
        ModerationActionType.UNBAN_ACCOUNT,
        'user',
        targetSellerId,
        "Administrative manual restoration of user account."
      );
      setShowAdminUnblockConfirm(false);
      showFeedback('Seller account successfully unblocked and permissions restored.', 'success');
    } catch (err: any) {
      console.error("Admin unblock error:", err);
      showFeedback(err?.message || 'Failed to unblock seller account.', 'error');
    } finally {
      setIsAdminBlockLoading(false);
    }
  }, [effectiveUser, targetSellerId, isAdminBlockLoading, showFeedback]);

  // ADMIN 8: BAN / UNBAN USER
  const handleAdminBanClick = useCallback(() => {
    if (!isAdmin || !effectiveUser) {
      showFeedback('Unauthorized: Administrator privilege required.', 'error');
      return;
    }
    if (!targetSellerId) {
      showFeedback('Seller ID not found for this auction.', 'error');
      return;
    }
    if (isSellerBanned) {
      setShowAdminUnbanConfirm(true);
    } else {
      setShowAdminBanModal(true);
    }
  }, [isAdmin, effectiveUser, targetSellerId, isSellerBanned, showFeedback]);

  const confirmAdminBan = useCallback(async (durationDays: number | null, reason?: string) => {
    if (!effectiveUser || !targetSellerId || isAdminBanLoading) return;
    if (!isAdmin) {
      showFeedback('Unauthorized: Administrator privilege required.', 'error');
      return;
    }
    setIsAdminBanLoading(true);

    try {
      const banReason = reason?.trim() || "Administrative ban on violating community policies.";
      const { bannedUntil } = await executeCentralBan(
        targetSellerId,
        effectiveUser.email || "Admin",
        effectiveUser.uid,
        durationDays,
        banReason
      );

      // Instant local state update for zero-latency UI reflection without needing refresh
      const banUpdate = {
        isBanned: true,
        accountStatus: "banned",
        status: "BANNED",
        bannedUntil: bannedUntil ? Timestamp.fromDate(bannedUntil) : null,
        bannedDurationDays: durationDays,
        biddingRestrictedPermanently: durationDays === null,
        biddingRestrictedUntil: bannedUntil ? Timestamp.fromDate(bannedUntil) : null,
        biddingAppealStatus: null,
        postingDisabled: true,
        sellingDisabled: true,
        canPost: false,
        canSell: false,
        biddingDisabled: true,
        canBid: false,
        reportingDisabled: true,
        canReport: false,
        offersDisabled: true,
        canSubmitOffers: false,
        negotiationsDisabled: true,
        canNegotiate: false,
      };

      setSellerProfile((prev: any) => (prev ? { ...prev, ...banUpdate } : ({ id: targetSellerId, ...banUpdate } as any)));

      await ModerationService.executeModerationAction(
        effectiveUser.uid,
        ModerationActionType.BAN_ACCOUNT,
        'user',
        targetSellerId,
        banReason
      );

      setShowAdminBanModal(false);

      const durationDisplay = durationDays === 1 
        ? "1 day" 
        : durationDays === 3 
          ? "3 days" 
          : durationDays === 7 
            ? "7 days" 
            : durationDays === 30 
              ? "30 days" 
              : "Permanently";

      showFeedback(
        `User successfully banned for ${durationDisplay}. Restrictions on posting, bidding, and negotiations are now active.`,
        'success'
      );
    } catch (err: any) {
      console.error("Admin ban error:", err);
      showFeedback(err?.message || 'Failed to execute user ban.', 'error');
      throw err;
    } finally {
      setIsAdminBanLoading(false);
    }
  }, [effectiveUser, targetSellerId, isAdmin, isAdminBanLoading, showFeedback]);

  const confirmAdminUnban = useCallback(async () => {
    if (!effectiveUser || !targetSellerId || isAdminBanLoading) return;
    if (!isAdmin) {
      showFeedback('Unauthorized: Administrator privilege required.', 'error');
      return;
    }
    setIsAdminBanLoading(true);

    try {
      await executeCentralUnban(
        targetSellerId,
        effectiveUser.email || "Admin",
        effectiveUser.uid
      );

      // Instant local state update for zero-latency UI reflection without needing refresh
      const unbanUpdate = {
        isBanned: false,
        accountStatus: "active",
        status: "ACTIVE",
        bannedUntil: null,
        bannedDurationDays: null,
        biddingRestrictedPermanently: false,
        biddingRestrictedUntil: null,
        biddingAppealStatus: null,
        postingDisabled: false,
        sellingDisabled: false,
        canPost: true,
        canSell: true,
        biddingDisabled: false,
        canBid: true,
        reportingDisabled: false,
        canReport: true,
        offersDisabled: false,
        canSubmitOffers: true,
        negotiationsDisabled: false,
        canNegotiate: true,
      };

      setSellerProfile((prev: any) => (prev ? { ...prev, ...unbanUpdate } : ({ id: targetSellerId, ...unbanUpdate } as any)));

      await ModerationService.executeModerationAction(
        effectiveUser.uid,
        ModerationActionType.UNBAN_ACCOUNT,
        'user',
        targetSellerId,
        "Administrative manual lifting of user ban."
      );

      setShowAdminUnbanConfirm(false);
      setShowAdminBanModal(false);

      showFeedback('User ban lifted. Platform permissions fully restored.', 'success');
    } catch (err: any) {
      console.error("Admin unban error:", err);
      showFeedback(err?.message || 'Failed to lift user ban.', 'error');
      throw err;
    } finally {
      setIsAdminBanLoading(false);
    }
  }, [effectiveUser, targetSellerId, isAdmin, isAdminBanLoading, showFeedback]);

  return {
    // Auth & Permission status
    isOwner,
    isAdmin,
    effectiveUser,
    effectiveProfile,
    targetSellerId,
    sellerProfile,

    // Authoritative Item & Seller States
    isFrozen,
    isForceStopped,
    isSellerBlocked,
    isSellerBanned,
    isAccepted,

    // Public State values
    bids,
    isFavorited,
    viewsCount: item.viewsCount ?? 0,
    bidsCount: bids.length > 0 ? bids.length : (item.bidsCount ?? 0),
    watchersCount: item.watchersCount ?? 0,
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
    confirmAdminUnban,

    // Helper to clear feedback
    clearFeedback: () => setFeedbackMessage(null)
  };
}


