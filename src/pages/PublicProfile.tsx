import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getCleanPhoneForCall, getCleanPhoneForWhatsApp } from "../lib/phoneUtils";
import { motion } from "motion/react";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  limit,
  onSnapshot,
  writeBatch,
  arrayUnion,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { executeCentralUnblock, executeCentralBan, executeCentralUnban, isUserBanned, getUserBanRemaining } from "../services/userService";
import { BanUserModal } from "../features/battle-bids/components/shared/BanUserModal";
import { UserProfile, Listing } from "../types";
import {
  isSellerPremiumActive,
  calculateRemainingPremiumMs,
  calculateAppealDeadline,
  calculateResumedExpiryDate,
} from "../lib/premium";
import { ProfileVerificationTick } from "../components/ProfileVerificationTick";
import { useAuth } from "../context/AuthContext";
import { ListingCard } from "../components/ListingCard";
import { getCountryFlag } from "../components/CountrySelector";
import {
  User,
  MapPin,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Award,
  Eye,
  Calendar,
  ShieldCheck,
  Search,
  AlertTriangle,
  MessageCircle,
  X,
  Crown,
  Ban,
  UserCheck,
  Unlock,
  UserX,
  Share2,
  ShieldAlert,
  ShieldX,
  Phone,
  Globe,
  Facebook,
  ArrowLeft,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { RestrictedActionAlert } from "../components/RestrictedActionAlert";
import { RequiresAuthModal } from "../components/RequiresAuthModal";
import { 
  TrustScoreBadge, 
  VerificationScoreBadge, 
  calculateVerificationScore, 
  getVerificationScoreTier 
} from "../components/SharedBadge";

import { useDragScroll, scrollContainer } from '../lib/useScroll';

export function PublicProfile() {
  const { id, username } = useParams<{ id?: string, username?: string }>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);

  const profileScrollRef = useRef<HTMLDivElement>(null);
  const profileDrag = useDragScroll(profileScrollRef);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [showRestricted, setShowRestricted] = useState(false);
  const [restrictedMessage, setRestrictedMessage] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [showUnblockConfirm, setShowUnblockConfirm] = useState(false);
  const [isBlockingInProgress, setIsBlockingInProgress] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [adminBadgeDuration, setAdminBadgeDuration] = useState<number>(30);
  const [adminBadgeType, setAdminBadgeType] = useState<"BASIC" | "GOLDEN">("GOLDEN");

  // Custom states for Sandboxing-safe admin confirmations and progress logging
  const [showWarnConfirm, setShowWarnConfirm] = useState(false);
  const [showBadgeIssueConfirm, setShowBadgeIssueConfirm] = useState(false);
  const [showBadgeRevokeConfirm, setShowBadgeRevokeConfirm] = useState(false);
  const [showBadgeResumeConfirm, setShowBadgeResumeConfirm] = useState(false);
  const [showKycRevokeModal, setShowKycRevokeModal] = useState(false);
  const [kycRevokeReason, setKycRevokeReason] = useState("");
  const [isRevokingKyc, setIsRevokingKyc] = useState(false);

  
  const [isWarningInProgress, setIsWarningInProgress] = useState(false);
  const [isBadgeActionInProgress, setIsBadgeActionInProgress] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showUnbanConfirm, setShowUnbanConfirm] = useState(false);
  const [isBanningInProgress, setIsBanningInProgress] = useState(false);
  const [isUnbanningInProgress, setIsUnbanningInProgress] = useState(false);
  const [statusModal, setStatusModal] = useState<{ isOpen: boolean; type: "success" | "error"; title: string; message: string } | null>(null);
  const [chatCount, setChatCount] = useState(0);

  const { user, userProfile, isBlocked, isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const targetId = id || profile?.id;
    if (targetId) {
      const getChatCount = async () => {
        try {
          const chatsQuery = query(
            collection(db, "chats"),
            where("sellerId", "==", targetId)
          );
          const snap = await getDocs(chatsQuery);
          setChatCount(snap.size);
        } catch (err) {
          console.warn("Could not load chats count", err);
          setChatCount(targetId === user?.uid ? 4 : 0);
        }
      };
      getChatCount();
    }
  }, [id, profile?.id, user]);

  useEffect(() => {
    if (id || username) {
      if (username) {
        fetchProfileData(username, true);
      } else if (id) {
        fetchProfileData(id, false);
      }
    }
  }, [id, username]);

  useEffect(() => {
    const targetId = id || profile?.id;
    if (user && targetId) {
      const checkReport = async () => {
        try {
          const q = query(
            collection(db, "profileReports"),
            where("reporterId", "==", user.uid),
          );
          const snapshot = await getDocs(q);
          const hasOpenReport = snapshot.docs.some((doc) => {
            const data = doc.data();
            return data.profileId === targetId && data.status === "OPEN";
          });
          setHasReported(hasOpenReport);
        } catch (e) {
          console.error("Error checking report status:", e);
        }
      };
      checkReport();
    }
  }, [user, id, profile?.id]);

  // Real-time synchronization for authoritative profile and ban status
  useEffect(() => {
    const targetUserId = profile?.id || (!username ? id : undefined);
    if (!targetUserId) return;
    const unsubscribe = onSnapshot(
      doc(db, "users", targetUserId),
      (docSnap) => {
        if (docSnap.exists()) {
          const freshData = { id: docSnap.id, ...docSnap.data() } as UserProfile;
          setProfile((prev) => (prev ? { ...prev, ...freshData } : freshData));
        }
      },
      (err) => {
        console.warn("Realtime user profile listener error:", err);
      }
    );
    return () => unsubscribe();
  }, [profile?.id, id, username]);

  // Remove full blocking of profile viewing

  const handleReportProfile = () => {
    if (!user) {
      setAuthMessage("Please log in to report this profile.");
      setShowAuthModal(true);
      return;
    }
    if (isBlocked || isUserBanned(userProfile) || (userProfile as any)?.reportingDisabled || (userProfile as any)?.canReport === false) {
      setRestrictedMessage(
        "Your account has been restricted by administration from submitting reports.",
      );
      setShowRestricted(true);
      return;
    }
    setShowReportModal(true);
  };

  const handleConfirmBan = async (durationDays: number | null, reason: string) => {
    if (!profile || !user || !isAdmin) return;
    setIsBanningInProgress(true);
    try {
      const { bannedUntil } = await executeCentralBan(
        profile.id,
        user.email || "Admin",
        user.uid,
        durationDays,
        reason
      );

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

      setProfile((prev: any) => (prev ? { ...prev, ...banUpdate } : null));

      const durationDisplay = durationDays === 1 
        ? "1 day" 
        : durationDays === 3 
          ? "3 days" 
          : durationDays === 7 
            ? "7 days" 
            : durationDays === 30 
              ? "30 days" 
              : "Permanently";

      setStatusModal({
        isOpen: true,
        type: "success",
        title: "User Banned Successfully",
        message: `${profile.name || "User"} has been banned for ${durationDisplay}. Restrictions on posting items, reporting, submitting bids, and submitting offers under private negotiation & battle bids are now active.`
      });
    } catch (err: any) {
      console.error("Ban action error:", err);
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "Ban Action Failed",
        message: err?.message || "Failed to execute ban. Please try again."
      });
      throw err;
    } finally {
      setIsBanningInProgress(false);
    }
  };

  const handleConfirmUnban = async () => {
    if (!profile || !user || !isAdmin) return;
    setIsUnbanningInProgress(true);
    try {
      await executeCentralUnban(profile.id, user.email || "Admin", user.uid);

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

      setProfile((prev: any) => (prev ? { ...prev, ...unbanUpdate } : null));

      setStatusModal({
        isOpen: true,
        type: "success",
        title: "Ban Lifted",
        message: `Administrative ban has been lifted for ${profile.name || "User"}. Permissions to post items, report, submit bids, and submit offers have been fully restored.`
      });
    } catch (err: any) {
      console.error("Unban action error:", err);
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "Unban Action Failed",
        message: err?.message || "Failed to lift ban. Please try again."
      });
      throw err;
    } finally {
      setIsUnbanningInProgress(false);
    }
  };

  const handleUnblock = () => {
    if (!profile || !user || !isAdmin) return;
    setShowUnblockConfirm(true);
  };

  const handleExecuteUnblock = async () => {
    if (!profile || !user || !isAdmin) return;

    setIsUnblocking(true);
    setShowUnblockConfirm(false);

    try {
      await executeCentralUnblock(profile.id, user.email || "Admin", user.uid);

      const unblockData = {
        isBlocked: false,
        accountStatus: "active",
        status: "ACTIVE",
        isVerified: profile.savedBadges?.isVerified ?? profile.isVerified,
        verifiedBadgeType:
          profile.savedBadges?.verifiedBadgeType ?? profile.verifiedBadgeType,
        badges: profile.savedBadges?.badges ?? profile.badges,
      };

      setProfile((prev) => (prev ? { ...prev, ...unblockData } : null));
      alert("Account successfully unblocked and all permissions restored.");
    } catch (e) {
      console.error(e);
      alert("Unable to complete unblock action. Please try again.");
    } finally {
      setIsUnblocking(false);
    }
  };

  const handleOpenIssueBadgeConfirm = () => {
    if (!profile || !user || !isSuperAdmin) {
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "Unauthorized Action",
        message: "Only the main administrator is allowed to issue a badge directly."
      });
      return;
    }

    if (profile.kycStatus !== "APPROVED") {
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "KYC Verification Required",
        message: `${profile.name || "User"} is not KYC approved. Badges can only be issued to KYC approved users.`
      });
      return;
    }

    // Existing active or revoked Golden badge checks
    const bType = profile.verifiedBadgeType;
    const hasBadge = bType === "GOLDEN" || bType === "BASIC";
    const vu = profile.verifiedUntil;
    const d = vu ? (vu.toDate ? vu.toDate() : (vu.seconds ? new Date(vu.seconds * 1000) : new Date(vu))) : null;
    const isExpired = d ? d < new Date() : false;
    const isActive = hasBadge && !isExpired && profile.isVerified;
    const isRevoked = hasBadge && !isExpired && !profile.isVerified;

    if (bType === "GOLDEN" && !isExpired) {
      if (isActive) {
        setStatusModal({
          isOpen: true,
          type: "error",
          title: "Active Badge Confirmed",
          message: `User already has an active Premium Seller Badge which expires on ${d ? d.toLocaleString() : "the specified date"}. Administrative direct issuance is disabled.`
        });
        return;
      }
      if (isRevoked) {
        setStatusModal({
          isOpen: true,
          type: "error",
          title: "Revoked Badge Confirmed",
          message: `User already has a revoked Premium Seller Badge. Administrative direct issuance is disabled.`
        });
        return;
      }
    }

    const period = parseInt(adminBadgeDuration as unknown as string);
    if (isNaN(period) || period <= 0) {
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "Invalid Period",
        message: "Please select a valid positive number of days for the badge duration first."
      });
      return;
    }
    setShowBadgeIssueConfirm(true);
  };

  const handleExecuteIssueAdminBadge = async () => {
    if (!profile || !user || !isSuperAdmin) return;

    if (profile.kycStatus !== "APPROVED") {
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "KYC Verification Required",
        message: `${profile.name || "User"} is not KYC approved. Badges can only be issued to KYC approved users.`
      });
      return;
    }

    // Existing active or revoked Golden badge checks under db lock
    const bType = profile.verifiedBadgeType;
    const hasBadge = bType === "GOLDEN" || bType === "BASIC";
    const vu = profile.verifiedUntil;
    const d = vu ? (vu.toDate ? vu.toDate() : (vu.seconds ? new Date(vu.seconds * 1000) : new Date(vu))) : null;
    const isExpired = d ? d < new Date() : false;
    const isActive = hasBadge && !isExpired && profile.isVerified;
    const isRevoked = hasBadge && !isExpired && !profile.isVerified;

    if (bType === "GOLDEN" && !isExpired) {
      if (isActive) {
        setStatusModal({
          isOpen: true,
          type: "error",
          title: "Active Badge Confirmed",
          message: `User already has an active Premium Seller Badge.`
        });
        return;
      }
      if (isRevoked) {
        setStatusModal({
          isOpen: true,
          type: "error",
          title: "Revoked Badge Confirmed",
          message: `User already has a revoked Premium Seller Badge.`
        });
        return;
      }
    }

    const period = parseInt(adminBadgeDuration as unknown as string);
    if (isNaN(period) || period <= 0) return;

    setShowBadgeIssueConfirm(false);
    setIsBadgeActionInProgress(true);
    console.log("Admin Action [IssueBadge]: Executing db write", { userId: profile.id, period });

    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + period);

      const updateData: any = {
        isVerified: true,
        verifiedBadgeType: "GOLDEN",
        isPremiumVerified: true,
        verifiedBadgeRequestStatus: "APPROVED",
        verifiedUntil: Timestamp.fromDate(expiryDate),
      };

      await setDoc(doc(db, "users", profile.id), updateData, { merge: true });

      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        userId: profile.id,
        title: "Premium Badge Issued!",
        message: `Congratulations! An administrator has issued a Premium Seller Badge to your account for ${period} days.`,
        type: "VERIFIED",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      // Instantly update UI state
      setProfile((prev) => (prev ? { ...prev, ...updateData } : null));
      
      setStatusModal({
        isOpen: true,
        type: "success",
        title: "Success",
        message: `Premium Seller Badge successfully issued to ${profile.name || "User"} for ${period} days!`
      });
    } catch (error) {
       console.error("Failed to issue badge:", error);
       setStatusModal({
         isOpen: true,
         type: "error",
         title: "Database Error",
         message: "Failed to issue badge. " + (error as Error).message
       });
    } finally {
       setIsBadgeActionInProgress(false);
    }
  };

  const handleExecuteRevokeAdminBadge = async () => {
    if (!profile || !user || !isAdmin) return;
    setShowBadgeRevokeConfirm(false);
    setIsBadgeActionInProgress(true);

    try {
      const isKycApproved = profile.kycStatus === "APPROVED";
      const remainingMs = calculateRemainingPremiumMs(profile.verifiedUntil);
      const remainingSeconds = Math.floor(remainingMs / 1000);
      const appealDeadline = Timestamp.fromDate(calculateAppealDeadline(new Date()));

      const updateData: any = {
        isVerified: isKycApproved ? true : false,
        isPremiumVerified: false,
        verifiedBadgeRequestStatus: "REVOKED",
        verifiedBadgeRevocationReason: "Administrative revocation by admin.",
        verifiedBadgeRevokedAt: serverTimestamp(),
        originalVerifiedUntil: profile.verifiedUntil || null,
        pausedRemainingPremiumMs: remainingMs,
        pausedRemainingPremiumSeconds: remainingSeconds,
        appealDeadline: appealDeadline,
        appealStatus: "AVAILABLE",
        verifiedUntil: null, // Freeze countdown
      };

      await setDoc(doc(db, "users", profile.id), updateData, { merge: true });

      // Sync promotionRequests if one exists
      try {
        const pQ = query(
          collection(db, "promotionRequests"),
          where("userId", "==", profile.id),
          where("type", "==", "VERIFIED")
        );
        const pSnap = await getDocs(pQ);
        for (const d of pSnap.docs) {
          if (d.data().status === "APPROVED") {
            await updateDoc(doc(db, "promotionRequests", d.id), {
              status: "REVOKED",
              revocationReason: "Administrative revocation by admin.",
              revokedAt: serverTimestamp(),
              originalVerifiedUntil: profile.verifiedUntil || null,
              pausedRemainingPremiumMs: remainingMs,
              pausedRemainingPremiumSeconds: remainingSeconds,
              appealDeadline: appealDeadline,
              appealStatus: "AVAILABLE",
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (err) {}

      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        userId: profile.id,
        title: "Verified Badge Revoked (Paused)",
        message: `Your badge has been paused and revoked by an administrator. Remaining time (${Math.ceil(remainingSeconds / 86400)} days) is safely preserved. You have 7 days to submit an appeal.`,
        type: "VERIFIED",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      // Instantly update UI state
      setProfile((prev) => (prev ? { ...prev, ...updateData } : null));
      
      setStatusModal({
        isOpen: true,
        type: "success",
        title: "Badge Revoked (Paused)",
        message: `Badge temporarily revoked for ${profile.name || "User"} successfully. ${Math.ceil(remainingSeconds / 86400)} days remaining have been safely paused.`
      });
    } catch (error) {
       console.error(error);
       setStatusModal({
         isOpen: true,
         type: "error",
         title: "Error",
         message: "Failed to revoke badge."
       });
    } finally {
       setIsBadgeActionInProgress(false);
    }
  };

  const handleExecuteResumeAdminBadge = async () => {
    if (!profile || !user || !isAdmin) return;
    setShowBadgeResumeConfirm(false);
    setIsBadgeActionInProgress(true);

    try {
      if (profile.isBlocked === true || profile.accountStatus === 'blocked' || profile.accountStatus === 'deleted') {
        setStatusModal({
          isOpen: true,
          type: "error",
          title: "Account Blocked",
          message: "Cannot resume Premium Seller Badge: User account is currently blocked."
        });
        return;
      }
      if (profile.kycStatus !== 'APPROVED') {
        setStatusModal({
          isOpen: true,
          type: "error",
          title: "KYC Required",
          message: "Cannot resume Premium Seller Badge: User KYC is not approved."
        });
        return;
      }

      const currentBadgeType = profile.verifiedBadgeType || "GOLDEN";
      const pausedMs = profile.pausedRemainingPremiumMs || (profile.pausedRemainingPremiumSeconds ? profile.pausedRemainingPremiumSeconds * 1000 : 0);
      
      if (!pausedMs || pausedMs <= 0) {
        setStatusModal({
          isOpen: true,
          type: "error",
          title: "Cannot Resume Badge",
          message: "Cannot resume Premium Seller Badge: no remaining paused Premium entitlement exists. The previous entitlement may have expired, been forfeited, or been terminated."
        });
        return;
      }

      const resumedExpiry = calculateResumedExpiryDate(pausedMs);
      if (!resumedExpiry) {
        setStatusModal({
          isOpen: true,
          type: "error",
          title: "Cannot Resume Badge",
          message: "Cannot resume Premium Seller Badge: invalid paused entitlement duration."
        });
        return;
      }

      const updateData: any = {
        isVerified: true,
        isPremiumVerified: currentBadgeType === "GOLDEN",
        verifiedBadgeType: currentBadgeType,
        verifiedUntil: Timestamp.fromDate(resumedExpiry),
        verifiedBadgeRequestStatus: "APPROVED",
        verifiedBadgeRevocationReason: "",
        pausedRemainingPremiumMs: 0,
        pausedRemainingPremiumSeconds: 0,
        appealStatus: "APPROVED",
        resumedAt: serverTimestamp(),
        resumedExpiry: Timestamp.fromDate(resumedExpiry),
      };

      await setDoc(doc(db, "users", profile.id), updateData, { merge: true });

      // Sync promotionRequests if one exists
      try {
        const pQ = query(
          collection(db, "promotionRequests"),
          where("userId", "==", profile.id),
          where("type", "==", "VERIFIED")
        );
        const pSnap = await getDocs(pQ);
        for (const d of pSnap.docs) {
          if (d.data().status === "REVOKED" || d.data().status === "RESUME_REQUESTED") {
            await updateDoc(doc(db, "promotionRequests", d.id), {
              status: "APPROVED",
              revocationReason: "",
              pausedRemainingPremiumMs: 0,
              pausedRemainingPremiumSeconds: 0,
              appealStatus: "APPROVED",
              resumedAt: serverTimestamp(),
              resumedExpiry: Timestamp.fromDate(resumedExpiry),
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (err) {}

      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        userId: profile.id,
        title: "Verified Badge Resumed!",
        message: `Your badge has been resumed by an administrator with full remaining duration restored immediately.`,
        type: "VERIFIED",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      // Instantly update UI state
      setProfile((prev) => (prev ? { ...prev, ...updateData } : null));

      setStatusModal({
        isOpen: true,
        type: "success",
        title: "Badge Resumed",
        message: `Badge has been successfully resumed with remaining entitlement restored immediately.`
      });
    } catch (error) {
       console.error(error);
       setStatusModal({
         isOpen: true,
         type: "error",
         title: "Error",
         message: "Failed to resume badge."
       });
    } finally {
       setIsBadgeActionInProgress(false);
    }
  };



  const handleOpenWarnConfirm = () => {
    if (!profile || !user || !isAdmin) {
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "Unauthorized Action",
        message: "You must be an authorized administrator to issue warnings."
      });
      return;
    }
    setShowWarnConfirm(true);
  };

  const handleExecuteSendWarning = async () => {
    if (!profile || !user || !isAdmin) return;
    setShowWarnConfirm(false);
    setIsWarningInProgress(true);
    console.log("Admin Action [SendWarning]: Executing warning increment", { userId: profile.id });

    try {
      // 1. Increment warning count in user profile
      await setDoc(doc(db, "users", profile.id), {
        warningsCount: increment(1),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 2. Send notification
      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        userId: profile.id,
        title: "⚠️ Administrative Warning",
        message: `You are violating the rules and policies of this platform so be careful in the future otherwise your account will be restricted/blocked.`,
        isRead: false,
        createdAt: serverTimestamp(),
      });

      // Instantly update local UI state
      setProfile((prev) => (prev ? { ...prev, warningsCount: (prev.warningsCount || 0) + 1 } : null));
      
      setStatusModal({
        isOpen: true,
        type: "success",
        title: "Warning Sent",
        message: `${profile.name || "User"} has been successfully warned and notified.`
      });
    } catch (e) {
      console.error(e);
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "Error",
        message: "Failed to issue warning properly."
      });
    } finally {
      setIsWarningInProgress(false);
    }
  };


  const handleBlock = () => {
    if (!profile || !user || !isAdmin) return;
    if (profile.id === user.uid) return;
    setShowBlockConfirm(true);
  };

  const handleExecuteBlock = async () => {
    if (!profile || !user || !isAdmin) return;
    setShowBlockConfirm(false);
    setIsBlockingInProgress(true);
    try {
      const userRef = doc(db, "users", profile.id);

      let savedBadges: any = null;
      try {
        const uDoc = await getDoc(userRef);
        if (uDoc.exists()) {
          const uData = uDoc.data();
          savedBadges = {
            isVerified: uData.isVerified ?? false,
            verifiedBadgeType: uData.verifiedBadgeType ?? null,
            badges: uData.badges ?? [],
            verifiedUntil: uData.verifiedUntil ?? null,
            isPremium: uData.isPremium ?? false,
            premiumBadge: uData.premiumBadge ?? null,
            sellerBadges: uData.sellerBadges ?? [],
            trustBadges: uData.trustBadges ?? [],
            achievementBadges: uData.achievementBadges ?? [],
          };
        }
      } catch (err) {
        console.warn("Could not fetch user to backup badges:", err);
      }

      const blockData: any = {
        isBlocked: true,
        accountStatus: "blocked",
        status: "BLOCKED",
        blockedAt: serverTimestamp(),
        blockedBy: user.uid,
        blockReason: "Violation of community trading policies.",
        updatedAt: serverTimestamp(),
      };

      if (savedBadges) {
        blockData.savedBadges = savedBadges;
      }

      await setDoc(userRef, blockData, { merge: true });

      // Suspend Listings
      try {
        const qListings = query(
          collection(db, "listings"),
          where("ownerId", "==", profile.id),
        );
        const listingsSnap = await getDocs(qListings);

        const updatePromises = listingsSnap.docs
          .filter((l) =>
            ["LIVE", "BOOKED", "SOLD", "PENDING"].includes(l.data().status),
          )
          .map((listingDoc) =>
            updateDoc(listingDoc.ref, {
              status: "SUSPENDED",
              previousStatus: listingDoc.data().status || "LIVE",
              isSuspended: true,
              updatedAt: serverTimestamp(),
            }),
          );
        await Promise.all(updatePromises);
      } catch (err: any) {
        console.error("Listing suspension partial failure:", err);
      }

      setProfile((prev) =>
        prev ? { ...prev, isBlocked: true, accountStatus: "blocked" } : null,
      );
      alert(
        `SUCCESS: ${profile.name || "User"} has been blocked and listings suspended.`,
      );
    } catch (e: any) {
      console.error("Block failure:", e);
      alert("Failed to block user: " + (e.message || "Unknown error"));
    } finally {
      setIsBlockingInProgress(false);
    }
  };

  const handleToggleKycStatus = async () => {
    if (!profile || !user || (!isSuperAdmin && !isAdmin)) return;
    const isCurrentlyApproved = profile.kycStatus === 'APPROVED';

    if (!isCurrentlyApproved) {
      // Direct KYC approval without application review is forbidden
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "KYC Application Required",
        message: "Direct KYC approval bypass is restricted. Please review and approve the user's submitted KYC application via the Admin Verification portal."
      });
      return;
    }

    // Open KYC Revocation Modal requiring confirmation and a meaningful reason
    setKycRevokeReason("");
    setShowKycRevokeModal(true);
  };

  const handleConfirmKycRevoke = async () => {
    if (!profile || !user || (!isSuperAdmin && !isAdmin)) return;
    const reason = kycRevokeReason.trim();
    if (!reason) {
      alert("Please provide a meaningful revocation reason.");
      return;
    }

    setIsRevokingKyc(true);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, "users", profile.id);
      const kycAppRef = doc(db, "kyc_applications", profile.id);
      const kycPrivateRef = doc(db, "kyc_private", profile.id);
      const notifRef = doc(collection(db, "notifications"));

      const historyEntry = {
        action: "Revoked",
        status: "REVOKED",
        timestamp: new Date().toISOString(),
        reason: reason,
        actionBy: user.email || "Compliance Admin",
      };

      // 1. Update public user doc
      const updatedKyc: any = {
        kycStatus: "REVOKED",
        kycRevocationReason: reason,
        isKycVerified: false,
        isVerified: false,
        isPremiumVerified: false,
        updatedAt: serverTimestamp(),
      };
      batch.set(userRef, updatedKyc, { merge: true });

      // 2. Authoritatively update kyc_applications
      batch.set(kycAppRef, {
        status: "REVOKED",
        revokedAt: serverTimestamp(),
        revocationReason: reason,
        appealStatus: null,
        appealMessage: null,
        updatedAt: serverTimestamp(),
        history: arrayUnion(historyEntry),
      }, { merge: true });

      // 3. Update kyc_private
      batch.set(kycPrivateRef, {
        kycStatus: "REVOKED",
        revokedAt: serverTimestamp(),
        revocationReason: reason,
        appealStatus: null,
        appealMessage: null,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 4. Send compliance notification
      batch.set(notifRef, {
        id: notifRef.id,
        userId: profile.id,
        title: "KYC Verification Revoked",
        message: `Your KYC verification badge has been revoked. Reason: "${reason}". You may file an appeal within 24 hours.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      setProfile((prev) => prev ? { ...prev, ...updatedKyc } : null);
      setShowKycRevokeModal(false);
      setKycRevokeReason("");

      setStatusModal({
        isOpen: true,
        type: "success",
        title: "KYC Status Revoked",
        message: `KYC verification status for ${profile.name || "this user"} has been revoked. Reason logged: "${reason}".`
      });
    } catch (err: any) {
      console.error("KYC Revocation failed:", err);
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "KYC Revocation Failed",
        message: err?.message || "Failed to revoke KYC status."
      });
    } finally {
      setIsRevokingKyc(false);
    }
  };

  const handleLiftBiddingRestriction = async () => {
    if (!profile || !user || !isAdmin) return;
    setShowUnbanConfirm(true);
  };

  const handleRejectBiddingAppeal = async () => {
    if (!profile || !user || !isAdmin) return;

    try {
      const userRef = doc(db, "users", profile.id);
      const rejectData = {
        biddingAppealStatus: 'rejected' as const,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(userRef, rejectData);
      setProfile((prev) => prev ? { ...prev, ...rejectData } : null);

      // Notification
      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        userId: profile.id,
        title: "❌ Bidding Appeal Rejected",
        message: "Your appeal regarding the bidding restriction was reviewed and rejected by administration. The restriction remains active.",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      setStatusModal({
        isOpen: true,
        type: "success",
        title: "Appeal Rejected",
        message: "The user's bidding restriction appeal has been rejected."
      });
    } catch (err: any) {
      setStatusModal({
        isOpen: true,
        type: "error",
        title: "Action Failed",
        message: err?.message || "Failed to reject appeal."
      });
    }
  };

  const submitProfileReport = async () => {
    if (!profile || !user || !reportReason.trim()) return;

    setIsSubmittingReport(true);
    try {
      const reportRef = doc(collection(db, "profileReports"));
      await setDoc(reportRef, {
        profileId: id,
        profileName: profile.name || "Unknown User",
        reporterId: user.uid,
        reason: reportReason.trim(),
        status: "OPEN",
        createdAt: serverTimestamp(),
      });
      alert(
        "Report submitted successfully. Our team will review this profile.",
      );
      setShowReportModal(false);
      setReportReason("");
      setHasReported(true);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "profileReports");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const initiateChat = async () => {
    if (!user) {
      setAuthMessage("Please log in to chat.");
      setShowAuthModal(true);
      return;
    }
    if (isBlocked) {
      setRestrictedMessage(
        "your account has been restricted due to the violating the policies of this platform.",
      );
      setShowRestricted(true);
      return;
    }
    const targetId = profile?.id;
    if (!targetId || user.uid === targetId) return;
    try {
      // Query both combinations to avoid duplicate direct chats between same users
      const [q1Snap, q2Snap] = await Promise.all([
        getDocs(
          query(
            collection(db, "chats"),
            where("buyerId", "==", user.uid),
            where("sellerId", "==", targetId),
          ),
        ),
        getDocs(
          query(
            collection(db, "chats"),
            where("buyerId", "==", targetId),
            where("sellerId", "==", user.uid),
          ),
        ),
      ]);

      const allDocs = [...q1Snap.docs, ...q2Snap.docs];
      const existingChatDoc = allDocs[0]; // Just use any existing chat between them

      let chatId = "";
      if (existingChatDoc) {
        chatId = existingChatDoc.id;
      } else {
        const chatRef = doc(collection(db, "chats"));
        await setDoc(chatRef, {
          listingId: "PROFILE_CHAT",
          buyerId: user.uid,
          sellerId: targetId,
          lastMessage: "Direct chat initiated.",
          updatedAt: serverTimestamp(),
          unreadCountSeller: 0,
          unreadCountBuyer: 0,
          isArchivedBuyer: false,
          isArchivedSeller: false,
          isDeletedBuyer: false,
          isDeletedSeller: false,
          isBlocked: false,
          status: "PENDING",
          initiatorId: user.uid,
        });
        chatId = chatRef.id;
      }
      navigate("/messages", {
        state: { activeChatId: chatId, forceNewSession: true },
      });
    } catch (e) {
      console.error(e);
      alert("Failed to start chat.");
    }
  };
  const fetchProfileData = async (identifier: string, isUsername: boolean = false) => {
    setLoading(true);
    try {
      let userDoc: any = null;
      let userData: UserProfile | null = null;
      
      if (isUsername) {
        const q = query(collection(db, "users"), where("username", "==", identifier), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          userDoc = snap.docs[0];
          userData = { id: userDoc.id, ...userDoc.data() } as UserProfile;
        } else {
          const qPast = query(collection(db, "users"), where("pastUsernames", "array-contains", identifier), limit(1));
          const snapPast = await getDocs(qPast);
          if (!snapPast.empty) {
            userDoc = snapPast.docs[0];
            userData = { id: userDoc.id, ...snapPast.docs[0].data() } as UserProfile;
          } else if (user) {
            const myDocRef = await getDoc(doc(db, "users", user.uid));
            if (myDocRef.exists()) {
              const myData = myDocRef.data() as UserProfile;
              if (myData.username === identifier || (myData.pastUsernames && myData.pastUsernames.includes(identifier))) {
                userDoc = myDocRef;
                userData = { id: userDoc.id, ...myData } as UserProfile;
              }
            }
          }
        }
      } else {
        const docRef = await getDoc(doc(db, "users", identifier));
        if (docRef.exists()) {
          userDoc = docRef;
          userData = { id: userDoc.id, ...userDoc.data() } as UserProfile;
        } else {
          const q = query(collection(db, "users"), where("username", "==", identifier), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            userDoc = snap.docs[0];
            userData = { id: userDoc.id, ...snap.docs[0].data() } as UserProfile;
          } else {
            const qPast = query(collection(db, "users"), where("pastUsernames", "array-contains", identifier), limit(1));
            const snapPast = await getDocs(qPast);
            if (!snapPast.empty) {
              userDoc = snapPast.docs[0];
              userData = { id: userDoc.id, ...snapPast.docs[0].data() } as UserProfile;
            }
          }
        }
      }

      if (userData) {
        const actualUserId = userData.id;
        setProfile(userData);
        if (userData.username && (id !== userData.username || username)) {
          navigate(`/user/${userData.username}`, { replace: true });
        }

        // 2. Increment Profile Views
        try {
          await setDoc(doc(db, "users", actualUserId), {
            views: increment(1),
          }, { merge: true });
        } catch (err) {
          console.warn("Could not increment views", err);
        }

        // 3. Fetch User's Public Listings
        const q = query(
          collection(db, "listings"),
          where("ownerId", "==", actualUserId),
          where("status", "in", ["LIVE", "BOOKED", "SOLD"]),
        );
        const snap = await getDocs(q);
        const fetchedListings = snap.docs.map(
          (d) => ({ ...d.data(), id: d.id }) as Listing,
        );
        setListings(fetchedListings);
      } else {
        setProfile(null);
        setListings([]);
      }
    } catch (e: any) {
      console.error("Querying Firebase profile failed:", e);
      setProfile(null);
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!profile) return;
    const profileUrl = profile.username
      ? `${window.location.origin}/user/${profile.username}`
      : `${window.location.origin}/user/${id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Check out ${profile.name}'s profile`,
          text: `View ${profile.name}'s profile on Avora`,
          url: profileUrl,
        });
      } catch (e) {
        console.warn("Error sharing:", e);
      }
    } else {
      try {
        await navigator.clipboard.writeText(profileUrl);
        setShowShareToast(true);
        setTimeout(() => setShowShareToast(false), 3000);
      } catch (e) {
        console.error("Error writing to clipboard:", e);
        alert("Failed to copy link.");
      }
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-stone-700">Loading profile...</div>
    );
  }

  if (!profile) {
    return (
      <div className="py-20 text-center text-stone-700">Profile not found.</div>
    );
  }

  if (profile.isBlocked && !isAdmin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="bg-white p-12 border-2 border-red-500/20 rounded-[2rem] shadow-xl flex flex-col items-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-red-500 mb-6">
            <Ban className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black text-stone-900 uppercase italic tracking-tighter mb-4">
            Account Restricted
          </h1>
          <p className="text-stone-600 mb-8 leading-relaxed font-medium">
            This merchant's account has been temporarily restricted due to
            policy violations. All listings have been suspended until
            administrative review is complete.
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full bg-stone-900 text-white font-black uppercase italic tracking-widest py-4 rounded-xl hover:bg-stone-800 transition-all text-xs"
          >
            Return to Marketplace
          </button>
        </div>
      </div>
    );
  }

  const isPremiumActiveCentral = isSellerPremiumActive(profile);

  const isVerifiedActiveCentral = profile.isVerified && (() => {
    if (!profile.verifiedUntil) return true;
    const vu = profile.verifiedUntil;
    const d = vu.toDate ? vu.toDate() : (vu.seconds ? new Date(vu.seconds * 1000) : new Date(vu));
    return d > new Date();
  })();

  // Standard marketplace verification score:
  // 1. 80/100 if user is KYC approved
  // 2. 100/100 if user is KYC approved and has active premium seller badge
  // 3. 0/100 if user doesn't have any active premium seller badge and KYC approved
  const verificationScore = calculateVerificationScore(profile);
  const { 
    tier: verificationTier, 
    description: verificationDescription, 
    badgeClass: verificationBadgeClass, 
    textClass: verificationTextClass, 
    progressGradient: verificationProgressGradient 
  } = getVerificationScoreTier(verificationScore);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 lg:py-12 flex-1 w-full">
      <RestrictedActionAlert
        isVisible={showRestricted}
        onClose={() => setShowRestricted(false)}
        message={restrictedMessage}
      />
      <RequiresAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message={authMessage}
      />
      {/* Universal Back Button */}
      <div className="mb-6 flex animate-in fade-in slide-in-from-top-1 duration-200">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/');
            }
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-stone-200 hover:border-amber-500 hover:bg-amber-50/50 rounded-xl text-xs font-black uppercase tracking-widest text-stone-700 hover:text-amber-700 transition-all shadow-sm active:scale-95 group cursor-pointer"
          title="Go Back"
        >
          <ArrowLeft className="w-4 h-4 text-amber-500 group-hover:-translate-x-1 transition-transform duration-200" />
          <span>Back</span>
        </button>
      </div>

      {/* Profile Header Block */}
      <div className="bg-white rounded-[2rem] p-6 md:p-8 mb-8 border border-stone-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-stone-800 to-amber-955" />

        <div className="relative pt-12 flex flex-col md:flex-row gap-6 md:gap-10 items-center md:items-start text-center md:text-left">
          {/* Avatar Picture */}
          <div className="relative shrink-0">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-white shadow-md bg-white overflow-hidden">
              {profile.photoURL ? (
                <img
                  src={profile.photoURL}
                  alt={profile.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-stone-100 text-stone-700">
                  <User className="w-16 h-16" />
                </div>
              )}
            </div>
          </div>

          {/* Profile Name, Joined Details, Total Views */}
          <div className="flex-1 mt-2 md:mt-16">
            <div className="mb-2 flex flex-col md:flex-row items-center gap-3 justify-center md:justify-start flex-wrap">
              <div 
                id="public-profile-display-name-container"
                className="relative inline-flex items-center gap-2.5 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-xl bg-stone-50 border border-stone-200/80 shadow-2xs select-text"
              >
                <h1 
                  id="public-profile-display-name"
                  className="text-xl sm:text-2xl md:text-3xl font-bold text-stone-900 tracking-tight leading-none"
                >
                  {profile.name || "Anonymous User"}
                </h1>
                <ProfileVerificationTick profile={profile} size="lg" className="shrink-0" />
              </div>
              {(() => {
                const isPremiumActive = isPremiumActiveCentral;

                const isVerifiedActive = profile.isVerified && (() => {
                  if (!profile.verifiedUntil) return true;
                  const vu = profile.verifiedUntil;
                  const d = vu.toDate ? vu.toDate() : (vu.seconds ? new Date(vu.seconds * 1000) : new Date(vu));
                  return d > new Date();
                })();

                if (!isVerifiedActive) return null;

                return (
                  <span
                    className={`text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm border ${isPremiumActive ? "bg-amber-500 text-stone-900 border-amber-600/20" : "bg-blue-600 text-white border-blue-700"}`}
                  >
                    {isPremiumActive ? (
                      <>
                        <Crown className="w-3.5 h-3.5" /> Premium Seller
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" /> Verified
                      </>
                    )}
                  </span>
                );
              })()}
            </div>

            {/* Location & Joined Date Metadata */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-stone-600 mb-4">
              {(profile.city || profile.country) && (
                <span className="flex items-center gap-1.5 bg-stone-100 px-3 py-1.5 rounded-lg font-medium">
                  <span>{getCountryFlag(profile.country || 'Pakistan')}</span>
                  <MapPin className="w-4 h-4 text-amber-600" /> {profile.country ? `${profile.country}, ` : ''}{profile.city || 'Pakistan'}
                </span>
              )}
              
              {/* Joined Date */}
              <span className="flex items-center gap-1.5 bg-stone-100 px-3 py-1.5 rounded-lg font-medium">
                <Calendar className="w-4 h-4 text-blue-600" /> Joined{" "}
                {(() => {
                  const ca = profile.createdAt;
                  if (!ca) return "Recent Member";
                  if (typeof ca.toDate === "function")
                    return ca
                      .toDate()
                      .toLocaleDateString(undefined, {
                        month: "long",
                        year: "numeric",
                      });
                  if (ca.seconds)
                    return new Date(ca.seconds * 1000).toLocaleDateString(
                      undefined,
                      { month: "long", year: "numeric" },
                    );
                  const d = new Date(ca);
                  return !isNaN(d.getTime())
                    ? d.toLocaleDateString(undefined, {
                        month: "long",
                        year: "numeric",
                      })
                    : "Recent Member";
                })()}
              </span>
            </div>

            {/* Merchant Biography directly after profile metadata */}
            <div className="mt-2 text-center md:text-left">
              <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 sm:p-4 max-w-2xl text-left">
                <span className="text-[11px] font-black uppercase text-amber-700 tracking-wider block mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-500" /> Merchant Biography
                </span>
                <p className="text-stone-700 text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-line">
                  {profile.bio || "No biography provided by the merchant."}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Share Toast */}
        {showShareToast && (
          <div className="absolute top-4 right-4 bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg animate-in fade-in slide-in-from-top-2 z-50">
            Link copied to clipboard!
          </div>
        )}
      </div>

      {/* Structured Body: Responsive Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        {/* Main Seller Information Cards */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-stone-50 rounded-3xl p-6 border border-stone-200/80 shadow-sm space-y-4 font-sans">
            <h3 className="text-xs font-black text-stone-700 uppercase tracking-widest pl-1">
              Seller Credentials
            </h3>
            
            <div className="bg-white p-5 rounded-2xl border border-stone-200 space-y-4 text-xs select-none">
              {/* KYC Status Details */}
              <div className="flex items-center justify-between font-black uppercase tracking-wider text-xs">
                <span className="text-stone-500 font-bold">KYC Status</span>
                {profile.kycStatus === "APPROVED" ? (
                  <span className="text-emerald-600 flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> KYC Verified
                  </span>
                ) : (
                  <span className="text-stone-500 flex items-center gap-1.5 font-bold">
                    <XCircle className="w-3.5 h-3.5 text-stone-400" /> Not Verified
                  </span>
                )}
              </div>

              {/* Premium Seller Status */}
              <div className="flex items-center justify-between font-black uppercase tracking-wider text-xs">
                <span className="text-stone-500 font-bold">Seller Tier</span>
                {isPremiumActiveCentral ? (
                  <span className="text-amber-600 flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Premium Seller
                  </span>
                ) : (
                  <span className="text-stone-500 flex items-center gap-1.5 font-bold">
                    <XCircle className="w-3.5 h-3.5 text-stone-400" /> Standard Seller
                  </span>
                )}
              </div>

              {/* Verification Score:
                  1. 80/100 if user is KYC approved
                  2. 100/100 if user is KYC approved and has active premium seller badge
                  3. 0/100 if user doesn't have any active premium seller badge and KYC approved */}
              <div className="border-t border-stone-100 pt-3.5 space-y-2.5" id="seller-credentials-verification-score">
                <div className="flex items-center justify-between font-black uppercase tracking-wider text-xs">
                  <span className="text-stone-700 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className={`w-4 h-4 ${verificationTextClass}`} />
                    Verification Score
                  </span>
                  <span className={`font-mono text-xs font-black px-2.5 py-1 rounded-lg border ${verificationBadgeClass}`}>
                    {verificationScore}/100
                  </span>
                </div>

                {/* Mobile-friendly Visual Progress Bar */}
                <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden border border-stone-200/60">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${verificationProgressGradient}`}
                    style={{ width: `${Math.max(verificationScore, 4)}%` }}
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-[11px] text-stone-500 font-medium">
                  <span className="truncate max-w-full">
                    {verificationDescription}
                  </span>
                  <span className={`font-black uppercase text-[10px] tracking-wider shrink-0 ${verificationTextClass}`}>
                    {verificationTier}
                  </span>
                </div>
              </div>

              {/* Trust Score Rating */}
              <div className="flex items-center justify-between font-black uppercase tracking-wider text-xs border-t border-stone-100 pt-3">
                <span className="text-stone-700 font-bold uppercase tracking-wider">Trust Score</span>
                <TrustScoreBadge 
                  trustScore={typeof profile.trustScore === 'number' ? profile.trustScore : 50} 
                  trustTier={profile.trustTier} 
                  size="md"
                />
              </div>

              <div className="border-t border-stone-100 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Number of Active Listings */}
                <div>
                  <span className="text-stone-700 uppercase font-black text-xs tracking-widest block mb-0.5">
                    Active Listings
                  </span>
                  <span className="font-black text-stone-900 text-sm">
                    {listings.filter((l) => l.status === "LIVE").length || profile.listingsCount || 0}
                  </span>
                </div>

                {/* Total Views */}
                <div>
                  <span className="text-stone-700 uppercase font-black text-xs tracking-widest block mb-0.5">
                    Total Views
                  </span>
                  <span className="font-black text-stone-900 text-sm">
                    {profile.views || profile.totalViews || listings.reduce((sum, l) => sum + (l.views || 0), 0) || 0}
                  </span>
                </div>

                {/* Buyer Messages */}
                <div>
                  <span className="text-stone-700 uppercase font-black text-xs tracking-widest block mb-0.5">
                    Buyer Messages
                  </span>
                  <span className="font-black text-stone-900 text-sm">
                    {chatCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Details & Actions Side Panel */}
        <div className="space-y-6">

          <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-6">
            <h3 className="text-base font-black text-stone-900 uppercase tracking-wide border-b border-stone-100 pb-3">
              Merchant Contact Details
            </h3>

            {/* City / Area & Public Links */}
            <div className="space-y-4">
              {/* Website URL */}
              {profile.websiteUrl && (
                <div>
                  <span className="block text-xs font-black uppercase tracking-widest text-stone-700 mb-1">
                    Website URL
                  </span>
                  <a
                    href={profile.websiteUrl.startsWith("http") ? profile.websiteUrl : `https://${profile.websiteUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1.5 transition-colors"
                  >
                    <Globe className="w-4 h-4 shrink-0" /> Visit Webroom
                  </a>
                </div>
              )}

              {/* Facebook Page */}
              {profile.facebookPage && (
                <div>
                  <span className="block text-xs font-black uppercase tracking-widest text-stone-700 mb-1">
                    Facebook Page
                  </span>
                  <a
                    href={profile.facebookPage.startsWith("http") ? profile.facebookPage : `https://${profile.facebookPage}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors"
                  >
                    <Facebook className="w-4 h-4 shrink-0" /> Facebook Profile
                  </a>
                </div>
              )}
            </div>

            {/* Communication Actions: Chat, Call, Whatsapp */}
            <div className="pt-4 border-t border-stone-100 space-y-3">
              {/* Only Chat In App */}
              <button
                onClick={initiateChat}
                className="w-full bg-stone-950 text-white hover:bg-stone-850 duration-150 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4 text-amber-500 fill-amber-500/20" /> Chat In App
              </button>

              {/* Call button */}
              {profile.phoneNumber && (
                <a
                  href={getCleanPhoneForCall(profile.phoneNumber)}
                  className="w-full bg-stone-100 text-stone-900 hover:bg-stone-200 duration-150 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 text-center"
                >
                  <Phone className="w-4 h-4 text-emerald-600" /> Call Seller
                </a>
              )}

              {/* Whatsapp button */}
              {profile.phoneNumber && (
                <a
                  href={`https://wa.me/${getCleanPhoneForWhatsApp(profile.phoneNumber)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#25D366] text-white hover:bg-[#20ba59] duration-150 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 text-center shadow-md shadow-emerald-500/10"
                >
                  <CheckCircle className="w-4 h-4 text-white fill-emerald-800/10" /> WhatsApp
                </a>
              )}
            </div>

            {/* Utility Actions */}
            <div className="pt-4 border-t border-stone-100 flex gap-2">
              <button
                onClick={handleShare}
                className="flex-1 bg-stone-50 hover:bg-stone-100 text-stone-700 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Profile
              </button>

              <button
                onClick={hasReported ? undefined : handleReportProfile}
                disabled={hasReported}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors ${
                  hasReported
                    ? "bg-emerald-50 text-emerald-600 cursor-not-allowed"
                    : "bg-stone-50 text-stone-700 hover:bg-red-50 hover:text-red-600"
                }`}
              >
                {hasReported ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Reported
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" /> Report Profile
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Secure Admin Operations (Warn, Block, Badge management) */}
          {user && isAdmin && (profile.id !== user?.uid || isSuperAdmin) && (
            <div className="bg-red-50/70 rounded-3xl p-6 border border-red-200 shadow-sm space-y-6">
              <div className="flex items-center gap-2 pb-3 border-b border-red-200/50">
                <ShieldCheck className="w-5 h-5 text-red-600" />
                <div>
                  <h4 className="font-black text-stone-900 text-xs uppercase tracking-wider">
                    Administrative Drawer
                  </h4>
                  <p className="text-xs font-black text-red-600 uppercase tracking-widest">
                    Authorized actions
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center border-b border-red-100/50 pb-2">
                  <span className="font-bold text-stone-700">Account Status</span>
                  <span className={`font-black uppercase text-xs px-2 py-0.5 rounded-full ${profile.isBlocked ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {profile.isBlocked ? "Blocked" : "Active / Live"}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-red-100/50 pb-2">
                  <span className="font-bold text-stone-700">Ban Status</span>
                  {(() => {
                    const banInfo = getUserBanRemaining(profile);
                    return (
                      <span className={`font-black uppercase text-[10px] px-2 py-0.5 rounded-full ${
                        banInfo.isBanned 
                          ? "bg-rose-100 text-rose-700 border border-rose-200" 
                          : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      }`}>
                        {banInfo.formattedText}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex justify-between border-b border-red-100/50 pb-2">
                  <span className="font-bold text-stone-700">Alert Flags Issued</span>
                  <span className="font-black text-xs">
                    {profile.warningsCount || 0} Alerts
                  </span>
                </div>
                <div className="flex justify-between border-b border-red-100/50 pb-2">
                  <span className="font-bold text-stone-700">Badge Status</span>
                  <span className={`font-black uppercase text-xs px-2 py-0.5 rounded-full ${
                    profile.verifiedBadgeType === "GOLDEN"
                      ? "bg-amber-100 text-amber-700 border border-amber-200"
                      : profile.verifiedBadgeType === "BASIC"
                        ? "bg-blue-100 text-blue-700 border border-blue-200"
                        : "bg-stone-100 text-stone-700"
                  }`}>
                    {profile.verifiedBadgeType === "GOLDEN" ? "PREMIUM GOLD" : profile.verifiedBadgeType === "BASIC" ? "STANDARD VERIFIED" : "NONE"}
                  </span>
                </div>
                {profile.verifiedUntil && (profile.verifiedBadgeType === "GOLDEN" || profile.verifiedBadgeType === "BASIC") && (
                  <div className="text-xs text-stone-700 font-bold bg-white/50 p-2.5 rounded-xl border border-red-150">
                    Badge Validity: {(() => {
                      const vu = profile.verifiedUntil;
                      try {
                        const d = typeof vu.toDate === "function" ? vu.toDate() : (vu.seconds ? new Date(vu.seconds * 1000) : new Date(vu));
                        if (!d || isNaN(d.getTime())) return "N/A";
                        const expired = d < new Date();
                        return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + (expired ? " (EXPIRED)" : "");
                      } catch (err) {
                        return "N/A";
                      }
                    })()}
                  </div>
                )}
              </div>

              <div className="space-y-2.5 pt-2">
                {profile.id !== user?.uid && (
                  <>
                    {/* Warn account button */}
                    <button
                      onClick={handleOpenWarnConfirm}
                      disabled={isWarningInProgress}
                      className="w-full bg-amber-500 hover:bg-amber-600 text-stone-955 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isWarningInProgress ? (
                        <div className="w-4 h-4 border-2 border-stone-955/20 border-t-stone-955 rounded-full animate-spin" />
                      ) : (
                        <ShieldAlert className="w-4 h-4" />
                      )}
                      Warn Account
                    </button>

                    {/* Block/Unblock toggle button */}
                    {profile.isBlocked ? (
                      <button
                        onClick={handleUnblock}
                        disabled={isUnblocking}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                      >
                        {isUnblocking ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Unlock className="w-4 h-4" />
                        )}
                        Unblock Account
                      </button>
                    ) : (
                      <button
                        onClick={handleBlock}
                        disabled={isBlockingInProgress}
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                      >
                        {isBlockingInProgress ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          <UserX className="w-4 h-4" />
                        )}
                        Block Account
                      </button>
                    )}

                    {/* Ban / Unban User button toggle */}
                    {isUserBanned(profile) || profile.isBanned || profile.accountStatus === 'banned' || profile.status === 'BANNED' ? (
                      <button
                        id="admin-unban-user-btn"
                        onClick={() => setShowUnbanConfirm(true)}
                        disabled={isBanningInProgress || isUnbanningInProgress}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer min-h-[44px]"
                      >
                        {isUnbanningInProgress ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                        Unban User
                      </button>
                    ) : (
                      <button
                        id="admin-ban-user-btn"
                        onClick={() => setShowBanModal(true)}
                        disabled={isBanningInProgress || isUnbanningInProgress}
                        className="w-full bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer min-h-[44px]"
                      >
                        {isBanningInProgress || isUnbanningInProgress ? (
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Ban className="w-4 h-4" />
                        )}
                        Ban User
                      </button>
                    )}
                  </>
                )}

                {(() => {
                  const bType = profile.verifiedBadgeType;
                  const hasBadge = bType === "GOLDEN" || bType === "BASIC";
                  const vu = profile.verifiedUntil;
                  let d: Date | null = null;
                  if (vu) {
                    try {
                      d = typeof vu.toDate === "function" ? vu.toDate() : (vu.seconds ? new Date(vu.seconds * 1000) : new Date(vu));
                      if (d && isNaN(d.getTime())) d = null;
                    } catch (err) {
                      d = null;
                    }
                  }
                  const isExpired = d ? d < new Date() : false;
                  const isActive = hasBadge && !isExpired && profile.isVerified;
                  const isRevoked = hasBadge && !isExpired && !profile.isVerified;

                  const isUserKycPassed = profile.kycStatus === "APPROVED";
                  const canDirectIssue = isSuperAdmin && isUserKycPassed;

                  const bTypeLabel = bType === "GOLDEN" ? "Premium" : "Verified";

                  return (
                    <div className="space-y-4">
                      {/* Current Status Badge Indicator */}
                      {hasBadge && !isExpired ? (
                        <div className="space-y-3">
                          <div className={`p-4 rounded-2xl border text-center ${isActive ? 'bg-emerald-50 border-emerald-500/20 text-emerald-800' : 'bg-red-50 border-red-200/25 text-red-850'}`}>
                            <p className="text-xs font-black uppercase tracking-tight mb-1">
                              Current Status: {isActive ? "🟢 Active Badge" : "🔴 Revoked Badge"}
                            </p>
                            <p className="text-xs font-semibold opacity-80 leading-relaxed">
                              {bTypeLabel} Badge is valid until {d ? d.toLocaleDateString() : "N/A"}
                            </p>
                          </div>

                          {/* Action Buttons */}
                          {isActive ? (
                            <button
                              onClick={() => setShowBadgeRevokeConfirm(true)}
                              disabled={isBadgeActionInProgress}
                              className="w-full bg-white border-2 border-red-200 text-red-650 hover:bg-red-50 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 font-bold disabled:opacity-50"
                            >
                              <ShieldX className="w-4 h-4" /> Revoke {bTypeLabel} Badge
                            </button>
                          ) : (
                            <button
                              onClick={() => setShowBadgeResumeConfirm(true)}
                              disabled={isBadgeActionInProgress}
                              className="w-full bg-white border-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 font-bold disabled:opacity-50"
                            >
                              <ShieldCheck className="w-4 h-4" /> Resume {bTypeLabel} Badge
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="bg-amber-500/10 p-3 border border-amber-500/20 rounded-2xl">
                          <p className="text-xs font-bold text-amber-700 text-center leading-relaxed">
                            {isExpired 
                              ? "The user's previous badge has expired." 
                              : "This user does not currently have any active badge."}
                          </p>
                        </div>
                      )}

                      {/* Direct Issuance Section: Strictly available only for the super administrator (isSuperAdmin) when the user is KYC passed */}
                      {isSuperAdmin ? (
                        isUserKycPassed ? (
                          <div className="p-4 bg-white border border-stone-200 rounded-3xl shadow-sm space-y-4">
                            <span className="block text-xs font-black uppercase tracking-widest text-amber-800 font-sans">
                              ⭐ Direct Issuance (No Payment Required)
                            </span>
                            
                            {/* Select Duration Period */}
                            <div className="space-y-1">
                              <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
                                Select Duration Period
                              </label>
                              <select
                                value={adminBadgeDuration}
                                onChange={(e) => setAdminBadgeDuration(Number(e.target.value))}
                                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                              >
                                <option value={30}>30 Days (1 Month)</option>
                                <option value={90}>90 Days (3 Months)</option>
                                <option value={180}>180 Days (6 Months)</option>
                                <option value={365}>365 Days (12 Months / 1 Year)</option>
                              </select>
                            </div>

                            {/* Issue Badge button */}
                            <button
                              onClick={handleOpenIssueBadgeConfirm}
                              disabled={isBadgeActionInProgress}
                              className="w-full bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 font-bold disabled:opacity-50"
                            >
                              {isBadgeActionInProgress ? (
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                              ) : (
                                <Crown className="w-4 h-4" />
                              )}
                              Issue Premium Seller Badge
                            </button>
                          </div>
                        ) : (
                          // KYC verification required notice for the Administrator
                          <div className="p-3 bg-red-50 border border-red-200/50 rounded-2xl text-xs font-bold text-red-750 leading-normal border border-red-200/50">
                            <p className="text-center">
                              ⚠️ KYC verification is required. Direct badge issuance is only available for KYC approved accounts.
                            </p>
                          </div>
                        )
                      ) : (
                        // Helpful message for non-superadmin users
                        <div className="p-3 bg-stone-100 rounded-2xl text-xs font-bold text-stone-700 leading-normal border border-stone-200/50">
                          <p className="text-center">
                            🔒 Direct badge issuance is strictly restricted to the main Administrator. Authorized admins cannot issue badges directly.
                          </p>
                        </div>
                      )}

                      {/* KYC Verification Status Management */}
                      <div className="p-4 bg-white border border-stone-200 rounded-3xl shadow-sm space-y-3">
                        <span className="block text-xs font-black uppercase tracking-widest text-blue-800 font-sans">
                          📝 KYC Status Management
                        </span>
                        <div className="flex justify-between items-center text-xs pb-1">
                          <span className="font-bold text-stone-700">KYC Status</span>
                          <span className={`font-black uppercase text-xs px-2 py-0.5 rounded-full ${
                            profile.kycStatus === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-stone-100 text-stone-700'
                          }`}>
                            {profile.kycStatus === 'APPROVED' ? "Approved & Verified" : "Not Verified"}
                          </span>
                        </div>
                        <button
                          onClick={handleToggleKycStatus}
                          className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 font-bold ${
                            profile.kycStatus === 'APPROVED'
                              ? 'bg-red-50 text-red-650 hover:bg-red-100/50 border border-red-200'
                              : 'bg-emerald-50 text-emerald-650 hover:bg-emerald-100/50 border border-emerald-200'
                          }`}
                        >
                          {profile.kycStatus === 'APPROVED' ? "Revoke KYC Status" : "Approve / Resume KYC Status"}
                        </button>
                      </div>

                      {/* Stop Fake Bidders & Bidding Restrictions */}
                      <div className="p-4 bg-white border border-stone-200 rounded-3xl shadow-sm space-y-4">
                        <span className="block text-xs font-black uppercase tracking-widest text-red-800 font-sans">
                          🚫 Bidding Privilege Controls
                        </span>

                        <div className="text-xs space-y-1.5">
                          <div className="flex justify-between border-b border-stone-100 pb-1.5">
                            <span className="font-bold text-stone-600">Bidding Privilege</span>
                            {(() => {
                              const isRestricted = profile.biddingRestrictedPermanently || 
                                (profile.biddingRestrictedUntil && (
                                  profile.biddingRestrictedUntil.toDate 
                                    ? profile.biddingRestrictedUntil.toDate() > new Date()
                                    : new Date(profile.biddingRestrictedUntil) > new Date()
                                ));
                              return (
                                <span className={`font-black uppercase text-xs px-2 py-0.5 rounded-full ${
                                  isRestricted ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {isRestricted ? 'RESTRICTED / BLOCKED' : 'ACTIVE / NORMAL'}
                                </span>
                              );
                            })()}
                          </div>

                          {profile.biddingRestrictedUntil && (
                            <div className="text-xs text-amber-800 font-bold bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                              Restricted until: {(() => {
                                const ru = profile.biddingRestrictedUntil;
                                const d = ru.toDate ? ru.toDate() : (ru.seconds ? new Date(ru.seconds * 1000) : new Date(ru));
                                return d.toLocaleString();
                              })()}
                            </div>
                          )}

                          {profile.biddingRestrictedPermanently && (
                            <div className="text-xs text-red-800 font-bold bg-red-50 p-2.5 rounded-xl border border-red-200">
                              Restricted Permanently
                            </div>
                          )}
                        </div>
                      </div>

                      {/* User's Bidding Restriction Appeal Review */}
                      {profile.biddingAppealMessage && (
                        <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-3xl shadow-sm space-y-3">
                          <span className="block text-xs font-black uppercase tracking-widest text-amber-800 font-sans">
                            📣 Active Bidding Appeal Submitted
                          </span>
                          
                          <div className="text-xs bg-white/70 p-3.5 rounded-xl border border-amber-200/50">
                            <p className="font-bold text-xs uppercase text-stone-600 mb-1">Appeal Message:</p>
                            <p className="text-stone-900 text-sm italic leading-relaxed font-serif">"{profile.biddingAppealMessage}"</p>
                          </div>

                          <div className="flex justify-between items-center text-xs border-t border-stone-200/20 pt-2.5">
                            <span className="font-bold text-stone-600">Appeal Status:</span>
                            <span className={`font-black uppercase px-2 py-0.5 rounded-full ${
                              profile.biddingAppealStatus === 'pending'
                                ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                : profile.biddingAppealStatus === 'accepted'
                                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                  : 'bg-red-100 text-red-700 border border-red-200'
                            }`}>
                              {profile.biddingAppealStatus || 'pending'}
                            </span>
                          </div>

                          {profile.biddingAppealStatus === 'pending' && (
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                onClick={handleLiftBiddingRestriction}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-center"
                              >
                                Accept & Lift Block
                              </button>
                              <button
                                onClick={handleRejectBiddingAppeal}
                                className="bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-center"
                              >
                                Reject Appeal
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Listings Section (Item 10 / 15) */}
      <div className="pt-8 border-t border-stone-200">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-stone-900">
            Available / Live Listings
          </h2>
          <span className="bg-stone-200 text-stone-700 px-3 py-1 rounded-full text-sm font-bold">
            {listings.length} live
          </span>
        </div>

        {listings.length > 0 ? (
          <div className="relative group/scroll-list">
            {/* Left Scroll Button */}
            <button
              type="button"
              onClick={() => scrollContainer(profileScrollRef, "left")}
              className="absolute -left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white/95 border-2 border-stone-200 backdrop-blur shadow-xl rounded-full flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 hover:border-amber-500 hover:scale-110 transition-all md:flex hidden active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
              aria-label="Scroll Left"
            >
              <ChevronLeft className="w-5 h-5 font-black" />
            </button>

            <div 
              ref={profileScrollRef}
              {...profileDrag}
              className="flex flex-row gap-6 overflow-x-auto pb-4 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
            >
              {listings.map((listing) => (
                <div key={listing.id} className="min-w-[280px] w-[280px] shrink-0" onDragStart={(e) => e.preventDefault()}>
                  <ListingCard listing={listing} />
                </div>
              ))}
            </div>

            {/* Right Scroll Button */}
            <button
              type="button"
              onClick={() => scrollContainer(profileScrollRef, "right")}
              className="absolute -right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white/95 border-2 border-stone-200 backdrop-blur shadow-xl rounded-full flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 hover:border-amber-500 hover:scale-110 transition-all md:flex hidden active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
              aria-label="Scroll Right"
            >
              <ChevronRight className="w-5 h-5 font-black" />
            </button>
          </div>
        ) : (
          <div className="flex-none w-full py-20 text-center bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col items-center">
            <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-stone-700" />
            </div>
            <p className="text-stone-700 font-medium">
              No active listings from this user are available.
            </p>
          </div>
        )}
      </div>

      {/* Report Modal */}
      {showReportModal && profile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowReportModal(false)}
            className="absolute inset-0 bg-stone-950/55 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
          >
            <div className="bg-amber-600 p-5 md:p-8 text-white relative shrink-0">
              <button
                onClick={() => setShowReportModal(false)}
                className="absolute top-4 right-4 md:top-6 md:right-6 text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
              <AlertTriangle className="w-10 h-10 md:w-12 md:h-12 mb-3 md:mb-4 opacity-75 text-white" />
              <h2 className="text-lg md:text-2xl font-black uppercase italic tracking-tighter">
                Report This Profile
              </h2>
              <p className="text-amber-100/80 text-xs md:text-xs font-black uppercase tracking-widest mt-0.5 md:mt-1">
                Operational Integrity Check
              </p>
            </div>

            <div className="p-5 md:p-8 space-y-4 md:space-y-6 overflow-y-auto">
              <div>
                <p className="text-stone-700 font-medium text-xs md:text-sm leading-relaxed mb-4 md:mb-6">
                  Reporting user{" "}
                  <span className="font-black text-stone-900 italic">
                    "{profile.name || "Anonymous"}"
                  </span>
                  . What is the primary reason for this report?
                </p>

                <label className="block text-xs md:text-xs font-black text-stone-700 uppercase tracking-widest mb-1.5 md:mb-2 ml-2 md:ml-4">
                  Report Details
                </label>
                <textarea
                  className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 rounded-xl md:rounded-2xl px-4 py-3 md:px-6 md:py-4 font-medium text-stone-900 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all text-xs md:text-sm"
                  rows={4}
                  placeholder="Specify the violation (e.g., fraud, inappropriate profile picture, harassment, etc.)"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 md:gap-3 pt-1 md:pt-2">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="w-full sm:flex-1 bg-stone-100 hover:bg-stone-200 text-stone-600 font-black py-3 md:py-4 rounded-xl md:rounded-2xl text-xs md:text-xs uppercase tracking-widest transition-all"
                >
                  Discard
                </button>
                <button
                  onClick={submitProfileReport}
                  disabled={isSubmittingReport || !reportReason.trim()}
                  className="w-full sm:flex-[1.5] bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black py-3 md:py-4 rounded-xl md:rounded-2xl text-xs md:text-xs uppercase tracking-widest transition-all shadow-xl shadow-amber-200 flex items-center justify-center gap-2"
                >
                  {isSubmittingReport ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Confirm Violation Report"
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      {showUnblockConfirm && profile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowUnblockConfirm(false)}
            className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-emerald-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-emerald-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-100 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-600">
                <UserCheck className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Confirm Account Unblock
                </h3>
                <p className="text-xs md:text-xs font-black text-emerald-600 uppercase tracking-widest truncate max-w-[150px] md:max-w-none">
                  Target: {profile.name || "User"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to unblock this account? This action will
                restore all normal platform access and permissions for the user.
              </p>

              <div className="bg-emerald-50 p-3 md:p-4 rounded-xl border border-emerald-100 italic font-medium text-emerald-700 text-xs md:text-xs">
                ✨ Safe Restore: All suspended listings will become public, and
                user badges will be seamlessly rebuilt without data loss.
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowUnblockConfirm(false)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteUnblock}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  Confirm Unblock
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      {showBlockConfirm && profile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowBlockConfirm(false)}
            className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-red-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-red-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-red-100 rounded-xl md:rounded-2xl flex items-center justify-center text-red-600">
                <UserX className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Confirm Account Block
                </h3>
                <p className="text-xs md:text-xs font-black text-red-600 uppercase tracking-widest truncate max-w-[150px] md:max-w-none">
                  Target: {profile.name || "User"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to block this user account? This will
                restrict them from posting, reporting, chatting, and will
                suspend all their active listings.
              </p>

              <div className="bg-red-50 p-3 md:p-4 rounded-xl border border-red-100 italic font-medium text-red-700 text-xs md:text-xs">
                ⚠️ Security Notice: Restriction is immediate and irreversible by
                the user. All active badges will be archived.
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowBlockConfirm(false)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteBlock}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl shadow-red-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <UserX className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  Confirm Block
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 1. Warn Account Confirmation Modal */}
      {showWarnConfirm && profile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowWarnConfirm(false)}
            className="absolute inset-0 bg-stone-955/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-amber-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-amber-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-600">
                <ShieldAlert className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Issue Warn Alert
                </h3>
                <p className="text-xs md:text-xs font-black text-amber-600 uppercase tracking-widest truncate max-w-[150px] md:max-w-none">
                  Target: {profile.name || "User"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to issue an administrative warning to this seller? This will increment their alert flag count and notify them instantly.
              </p>

              <div className="bg-amber-50 p-3 md:p-4 rounded-xl border border-amber-100 italic font-medium text-amber-700 text-xs md:text-xs">
                💬 Notice content: "You are violating the rules and policies of this platform so be careful in the future otherwise your account will be restricted/blocked."
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowWarnConfirm(false)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteSendWarning}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-amber-500 hover:bg-amber-600 text-stone-955 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-amber-500/15 flex items-center justify-center gap-2 font-bold"
                >
                  <ShieldAlert className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  Confirm Warning
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 2. Badge Issue Confirmation Modal */}
      {showBadgeIssueConfirm && profile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowBadgeIssueConfirm(false)}
            className="absolute inset-0 bg-stone-955/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-stone-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-amber-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-655 text-amber-600">
                <Crown className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Issue Premium Badge
                </h3>
                <p className="text-xs md:text-xs font-black text-stone-700 uppercase tracking-widest truncate">
                  Target: {profile.name || "User"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to issue the <strong className="text-stone-900">Premium Seller Badge</strong> to {profile.name || "User"} for <strong className="text-amber-600">{adminBadgeDuration} Days</strong>?
              </p>

              <div className="bg-stone-50 p-3 md:p-4 rounded-xl border border-stone-200 text-stone-600 text-xs md:text-xs leading-relaxed">
                ✨ Benefit upgrade: This gives the user gold-themed profile markings, advanced search visibility, and administrative validation immediately.
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowBadgeIssueConfirm(false)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteIssueAdminBadge}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 font-bold"
                >
                  <Crown className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  Grant Badge
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 3. Badge Revoke Confirmation Modal */}
      {showBadgeRevokeConfirm && profile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowBadgeRevokeConfirm(false)}
            className="absolute inset-0 bg-stone-955/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 border-red-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-red-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-red-100 rounded-xl md:rounded-2xl flex items-center justify-center text-red-600">
                <ShieldX className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Revoke Badge
                </h3>
                <p className="text-xs md:text-xs font-black text-red-600 uppercase tracking-widest truncate">
                  Target: {profile.name || "User"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to temporarily revoke the badge of {profile.name || "User"}?
              </p>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowBadgeRevokeConfirm(false)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteRevokeAdminBadge}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-xl font-bold"
                >
                  Confirm Revoke
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* 4. Badge Resume Confirmation Modal */}
      {showBadgeResumeConfirm && profile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowBadgeResumeConfirm(false)}
            className="absolute inset-0 bg-stone-955/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 border-emerald-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-emerald-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-100 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-600">
                <ShieldCheck className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Resume Badge
                </h3>
                <p className="text-xs md:text-xs font-black text-emerald-600 uppercase tracking-widest truncate">
                  Target: {profile.name || "User"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to restore the verified badge and active status for {profile.name || "User"}?
              </p>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowBadgeResumeConfirm(false)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all font-bold font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteResumeAdminBadge}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/10 active:scale-95 transition-all font-bold"
                >
                  Confirm Resume
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}



      {/* 6. Universal Sandboxed Status / Notice Dialog */}
      {statusModal?.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setStatusModal(null)}
            className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`relative w-[92vw] max-w-sm bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-t-8 overflow-hidden ${
              statusModal.type === "success" ? "border-emerald-500" : "border-red-500"
            }`}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
                  statusModal.type === "success" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                }`}
              >
                {statusModal.type === "success" ? (
                  <CheckCircle className="w-6 h-6" />
                ) : (
                  <AlertTriangle className="w-6 h-6" />
                )}
              </div>

              <h3 className="font-black text-stone-900 uppercase italic tracking-tight text-lg mb-2">
                {statusModal.title}
              </h3>
              <p className="text-stone-600 text-xs md:text-sm font-medium leading-relaxed mb-6">
                {statusModal.message}
              </p>

              <button
                onClick={() => setStatusModal(null)}
                className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                  statusModal.type === "success"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/10"
                    : "bg-stone-900 hover:bg-stone-850 text-white shadow-lg"
                }`}
              >
                Continue
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Admin Unban User Confirmation Modal */}
      {showUnbanConfirm && profile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => {
              if (!isUnbanningInProgress) setShowUnbanConfirm(false);
            }}
            className="absolute inset-0 bg-stone-950/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-emerald-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-emerald-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-100 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-600">
                <ShieldCheck className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Confirm Unban User
                </h3>
                <p className="text-xs font-black text-emerald-600 uppercase tracking-widest truncate max-w-[180px] md:max-w-none">
                  Target: {profile.name || profile.username || "User"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to unban this user? This will lift all active bans and restrictions immediately, restoring their ability to create listings, submit bids in auctions, make offers, and submit reports.
              </p>

              <div className="bg-emerald-50 p-3 md:p-4 rounded-xl border border-emerald-100 italic font-medium text-emerald-700 text-xs">
                ✨ Permissions to participate in Battle Bids, private negotiations, and create listings will be restored immediately.
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  type="button"
                  onClick={() => setShowUnbanConfirm(false)}
                  disabled={isUnbanningInProgress}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all cursor-pointer disabled:opacity-50 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-unban-user-dialog-btn"
                  onClick={async () => {
                    setShowUnbanConfirm(false);
                    await handleConfirmUnban();
                  }}
                  disabled={isUnbanningInProgress}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl md:rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 font-bold"
                >
                  {isUnbanningInProgress ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  Confirm Unban
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* KYC Revocation Reason & Confirmation Modal */}
      {showKycRevokeModal && profile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => {
              if (!isRevokingKyc) setShowKycRevokeModal(false);
            }}
            className="absolute inset-0 bg-stone-950/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-lg bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-red-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-red-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-red-100 rounded-xl md:rounded-2xl flex items-center justify-center text-red-600">
                <AlertTriangle className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Revoke KYC Verification
                </h3>
                <p className="text-xs font-black text-red-600 uppercase tracking-widest truncate max-w-[180px] md:max-w-none">
                  Target: {profile.name || profile.username || "User"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Revoking KYC will immediately strip the user's Blue Verification Tick and premium status across the marketplace. The user will be notified and given a 24-hour window to file an appeal.
              </p>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-stone-700 mb-2">
                  Revocation Reason (Required)
                </label>
                <textarea
                  value={kycRevokeReason}
                  onChange={(e) => setKycRevokeReason(e.target.value)}
                  placeholder="Enter specific violation or reason (e.g. Fraudulent document submission, mismatched identity, severe marketplace policy breach)..."
                  rows={3}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-red-400 outline-none resize-none"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    "Submitted fake/altered CNIC document",
                    "Identity mismatch with bank account",
                    "Severe marketplace policy violation",
                    "Suspicious fraudulent activity report",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setKycRevokeReason(preset)}
                      className="text-[10px] font-bold px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 md:gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowKycRevokeModal(false)}
                  disabled={isRevokingKyc}
                  className="flex-1 px-4 md:px-6 py-3.5 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition disabled:opacity-50 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmKycRevoke}
                  disabled={isRevokingKyc || !kycRevokeReason.trim()}
                  className="flex-2 px-6 md:px-8 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl md:rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-red-500/20 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50 font-bold"
                >
                  {isRevokingKyc ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  Confirm Revocation
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Admin Ban User Modal */}
      {showBanModal && profile && (
        <BanUserModal
          isOpen={showBanModal}
          onClose={() => setShowBanModal(false)}
          targetUserId={profile.id}
          targetUserName={profile.name || profile.username || profile.email}
          currentBan={getUserBanRemaining(profile)}
          onConfirmBan={handleConfirmBan}
          onConfirmUnban={handleConfirmUnban}
          loading={isBanningInProgress || isUnbanningInProgress}
        />
      )}
    </div>
  );
}
