import { useEffect, useState, useMemo, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  setDoc,
  where,
  limit,
  increment,
  arrayUnion,
  getDoc,
  writeBatch,
  Timestamp,
  runTransaction,
  DocumentReference,
  startAfter,
  QueryDocumentSnapshot,
  documentId,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import {
  calculateRemainingPremiumMs,
  calculateAppealDeadline,
  calculateResumedExpiryDate,
} from "../lib/premium";
import {
  Listing,
  Report,
  ProfileReport,
  UserProfile,
  PromotionRequest,
  AuthorizedAdminEmail,
  KycApplication,
  NameChangeRequest,
  BroadcastRecord,
} from "../types";
import { useAuth } from "../context/AuthContext";
import {
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
  CheckSquare,
  Database,
  Shield,
  ShieldCheck,
  ShieldAlert,
  MessageCircle,
  User,
  Users,
  Rocket,
  Zap,
  Clock,
  UserX,
  UserCheck,
  UserPlus,
  LayoutGrid,
  Menu,
  ClipboardList,
  AlertCircle,
  AlertTriangle,
  FileBadge,
  Ticket,
  Speaker,
  LogOut,
  Plus,
  Search,
  Home as HomeIcon,
  Settings,
  Package,
  X,
  MapPin,
  Phone,
  ArrowRight,
  BadgeCheck,
  Crown,
  ShieldX,
  ArrowLeft,
  Calendar,
  History,
  DollarSign,
  Upload,
  Copy,
  Check,
  Briefcase,
  Mail,
  FileText,
  Globe,
  PauseCircle,
  PlayCircle,
  Send,
  Radio,
  RefreshCw,
  Pin,
  Filter,
  ExternalLink,
  Coins,
} from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { executeCentralBlock, executeCentralUnblock, executeCentralBan, executeCentralUnban, executeCentralPause, executeCentralUnpause, isUserBanned, isUserBlocked, isUserBlockedOrBanned, isUserPaused, getUserBanRemaining } from "../services/userService";
import { formatPKR } from "../lib/utils";
import { formatPrice, getCurrencyByCode, calculateRefundAmounts } from "../lib/currencies";
import { PROMOTION_PACKAGES } from "../lib/promotionPackages";
import { CreditsService } from "../features/credits/services/creditsService";
import { Link } from "react-router-dom";
import { AdminSearch } from "../components/AdminSearch";
import { AdminAnalysis } from "../components/AdminAnalysis";
import {
  executeAcceptKycAppealAuthoritative,
  executeRejectKycAppealAuthoritative,
} from "./AdminVerifications";
import { KycImageLightbox } from "../components/KycImageLightbox";
import { AdminOverviewPanel } from "../components/AdminOverviewPanel";
import { ModerationDashboard } from "../features/battle-bids/components/ModerationDashboard";
import { ModerationService } from "../features/battle-bids/services/moderationService";
import { ModerationActionType, ReportStatus } from "../features/battle-bids/types";
import { moderationMetricsService, ModerationMetricsDoc, DEFAULT_MODERATION_METRICS, HistoricalDryRunResult } from "../services/moderationMetricsService";
import { useDataCache } from "../lib/cache";

const normalizeReportStatus = (status?: string | null): "OPEN" | "RESOLVED" | "DISMISSED" => {
  if (!status) return "OPEN";
  const s = String(status).trim().toLowerCase();
  if (s === "resolved") {
    return "RESOLVED";
  }
  if (s === "dismissed") {
    return "DISMISSED";
  }
  return "OPEN";
};

const getReportInitialActions = (status?: string | null, actionsTaken?: string[]): string[] => {
  if (actionsTaken && actionsTaken.length > 0) {
    return actionsTaken;
  }
  const s = String(status || "").trim().toLowerCase();
  if (s === "dismissed") return ["ignored"];
  if (s === "resolved") return ["resolved"];
  return [];
};

const REPORT_STREAM_CHUNK_SIZE = 25;
const REPORT_PAGE_SIZE = 20;
const TARGET_HYDRATION_BATCH_SIZE = 30;

const getReportTimeMillis = (createdAt: any): number => {
  if (!createdAt) return 0;
  if (createdAt.toDate && typeof createdAt.toDate === "function") {
    return createdAt.toDate().getTime();
  }
  if (typeof createdAt.seconds === "number") {
    return createdAt.seconds * 1000 + (createdAt.nanoseconds ? Math.floor(createdAt.nanoseconds / 1000000) : 0);
  }
  if (createdAt instanceof Date) {
    return createdAt.getTime();
  }
  if (typeof createdAt === "number") {
    return createdAt;
  }
  return new Date(createdAt || 0).getTime();
};

interface VerifiedSellerAppCardProps {
  key?: any;
  app: any;
  onApprove: any;
  onReject: any;
  viewTicketSenderProfile: any;
  formatSafeDate: any;
  formatSafeTime: any;
}

function VerifiedSellerAppCard({
  app,
  onApprove,
  onReject,
  viewTicketSenderProfile,
  formatSafeDate,
  formatSafeTime
}: VerifiedSellerAppCardProps) {
  const [applicant, setApplicant] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [confirmedDuration, setConfirmedDuration] = useState<number>(app.durationDays || 30);

  useEffect(() => {
    let active = true;
    if (app.userId) {
      setLoading(true);
      const userRef = doc(db, "users", app.userId);
      getDoc(userRef)
        .then((docSnap) => {
          if (active && docSnap.exists()) {
            setApplicant(docSnap.data());
          }
        })
        .catch((err) => console.error("Error fetching applicant details:", err))
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [app.userId]);

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div>
          <button
            onClick={() => viewTicketSenderProfile(app.userId)}
            className="font-black text-stone-900 uppercase italic tracking-tighter text-xl hover:text-amber-600 transition-colors text-left"
          >
            {app.userName || "Unknown"}
          </button>
          <p className="text-stone-400 font-medium text-xs break-all">
            {app.userEmail}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
            app.status === "PENDING"
              ? "bg-amber-100 text-amber-700 font-bold"
              : app.status === "APPROVED"
                ? "bg-emerald-100 text-emerald-700 font-bold"
                : "bg-red-100 text-red-700 font-bold"
          }`}
        >
          {app.status}
        </span>
      </div>

      <div className="space-y-3 bg-stone-50 p-4 rounded-[1.5rem] border border-stone-100">
        {/* Applicant details */}
        <div>
          <span className="text-xs font-black uppercase text-stone-400 block tracking-widest mb-1 font-sans">
            Applicant Phone Details
          </span>
          <p className="text-xs font-bold text-stone-900">
            {applicant ? (applicant.phoneNumber || "Not supplied") : loading ? "Loading..." : "No phone info"}
          </p>
        </div>

        {/* KYC Status Details */}
        <div>
          <span className="text-xs font-black uppercase text-stone-400 block tracking-widest mb-1 font-sans">
            KYC Identity Status
          </span>
          {applicant ? (
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-black uppercase border leading-none ${
                applicant.kycStatus === "APPROVED"
                  ? "bg-emerald-50 text-emerald-600 border-emerald-250 font-bold"
                  : applicant.kycStatus === "PENDING"
                    ? "bg-amber-50 text-amber-600 border-amber-250 font-bold animate-pulse"
                    : "bg-red-50 text-red-600 border-red-250 font-bold"
              }`}
            >
              {applicant.kycStatus === "APPROVED"
                ? "Approved ✅"
                : applicant.kycStatus === "PENDING"
                  ? "Pending Review ⏳"
                  : "Not Approved ❌"}
            </span>
          ) : loading ? (
            <span className="text-xs font-semibold text-stone-400 font-sans">Loading profile data...</span>
          ) : (
            <span className="text-xs font-semibold text-red-500 font-sans">Not Approved ❌</span>
          )}
        </div>

        {(app.applicationId || app.id || app.transactionId) && (
          <div>
            <span className="text-xs font-black uppercase text-stone-400 block tracking-widest mb-1 font-sans">
              Tracking ID
            </span>
            <p className="font-mono text-xs font-bold text-stone-800 bg-white px-2 py-1 rounded border border-stone-200 inline-block shadow-inner">
              {app.applicationId || app.id?.slice(0, 8) || "N/A"}
            </p>
          </div>
        )}

        {app.paymentProofUrl && (
          <div>
            <span className="text-xs font-black uppercase text-stone-400 block tracking-widest mb-1 font-sans">
              Payment Proof
            </span>
            <div className="flex gap-2 items-center">
              <a
                href={app.paymentProofUrl}
                target="_blank"
                rel="noreferrer"
                className="text-amber-600 hover:text-amber-700 underline text-xs font-bold break-all flex items-center gap-1"
              >
                View Evidence Link ↗
              </a>
            </div>
          </div>
        )}

        {/* Selected Duration pre-populated and immutable */}
        {app.status === "PENDING" && (
          <div className="pt-2 border-t border-stone-200/50">
            <span className="block text-xs font-black text-amber-800 uppercase tracking-widest mb-1 font-sans">
              Applied Duration Plan (Immutable)
            </span>
            <p className="text-xs text-stone-600 font-bold bg-stone-100 px-3 py-2 rounded-xl">
              {app.durationDays ? `${app.durationDays} Days` : "30 Days"}
            </p>
            <span className="text-[8.5px] font-semibold text-stone-400 mt-1 block font-sans">
              * Period selected by the applicant
            </span>
          </div>
        )}

        {app.status !== "PENDING" && (
          <div>
            <span className="text-xs font-black uppercase text-stone-400 block tracking-widest mb-1 font-sans">
              Applied Duration Plan
            </span>
            <p className="text-xs text-stone-600 font-bold">
              {app.durationDays ? `${app.durationDays} Days` : "Not specified"}
            </p>
          </div>
        )}

        <div>
          <span className="text-xs font-black uppercase text-stone-400 block tracking-widest mb-1 font-sans">
            Submitted Timestamp
          </span>
          <p className="text-xs text-stone-600 font-medium">
            {formatSafeDate(app.createdAt)} {formatSafeTime(app.createdAt)}
          </p>
        </div>
      </div>

      {app.status === "PENDING" && (
        <div className="grid grid-cols-2 gap-3 mt-auto font-sans">
          <button
            onClick={() => onReject(app.id, app.userId, "REJECTED")}
            className="w-full py-3 bg-red-100 text-red-700 hover:bg-red-200 font-black uppercase tracking-widest text-xs rounded-xl transition-all select-none active:scale-95"
          >
            Reject
          </button>
          <button
            onClick={() => {
              if (applicant && applicant.kycStatus !== "APPROVED") {
                alert("Cannot approve Premium Seller application: User KYC is not approved.");
                return;
              }
              onApprove(app.id, app.userId, "APPROVED", confirmedDuration);
            }}
            className="w-full py-3 bg-emerald-500 text-white hover:bg-emerald-600 font-black uppercase tracking-widest text-xs rounded-xl transition-all shadow-md shadow-emerald-500/10 select-none active:scale-95"
          >
            Approve
          </button>
        </div>
      )}
    </div>
  );
}

export const ADMIN_SECTIONS = [
  { id: "reports", label: "Reported Listings", num: 1 },
  { id: "profileReports", label: "Reported Profiles", num: 2 },
  { id: "kycVerifications", label: "KYC Verifications", num: 3 },
  { id: "nameRequests", label: "Name Change Requests", num: 4 },
  { id: "blockedAccounts", label: "Blocked/ Banned Accounts", num: 5 },
  { id: "pausedAccounts", label: "Paused Accounts", num: 6 },
  { id: "search", label: "Search", num: 7 },
  { id: "support", label: "Support Tickets", num: 8 },
  { id: "promotions", label: "PROMO Requests", num: 9 },
  { id: "creditApplications", label: "Credit Applications 🪙", num: 10 },
  { id: "appeals", label: "Appeals", num: 11 },
  { id: "refunds", label: "Refunds", num: 12 },
  { id: "broadcast", label: "Community Broadcast", num: 13 },
  { id: "authAdmins", label: "Admin Verifiers", num: 14 },
  { id: "battleBidsModeration", label: "Battle Bids Moderation", num: 15 },
  { id: "disputes", label: "Deal Disputes", num: 16 },
];

export function Admin() {
  const { isAdmin, isSuperAdmin, isAuthorizedAdmin, isAuthorizedPaymentVerifier, user, userProfile, logout, allowedSections } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab ] = useState<
    | "applications"
    | "reports"
    | "profileReports"
    | "users"
    | "support"
    | "broadcast"
    | "promotions"
    | "creditApplications"
    | "authAdmins"
    | "allUsers"
    | "blockedAccounts"
    | "pausedAccounts"
    | "search"
    | "analysis"
    | "kycVerifications"
    | "nameRequests"
    | "adminOverview"
    | "paymentVerifiers"
    | "appeals"
    | "refunds"
    | "battleBidsModeration"
    | "disputes"
  >(() => {
    let saved = null;
    try {
      saved = sessionStorage.getItem("admin_active_tab");
    } catch (e) {
      console.warn("sessionStorage is unavailable:", e);
    }
    const allowed = [
      "applications",
      "reports",
      "profileReports",
      "users",
      "support",
      "broadcast",
      "promotions",
      "creditApplications",
      "authAdmins",
      "allUsers",
      "blockedAccounts",
      "pausedAccounts",
      "search",
      "analysis",
      "kycVerifications",
      "nameRequests",
      "adminOverview",
      "paymentVerifiers",
      "appeals",
      "refunds",
      "battleBidsModeration",
      "disputes",
    ];
    return saved && allowed.includes(saved) ? (saved as any) : "kycVerifications";
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const formatAdminDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    if (timestamp.toDate) return timestamp.toDate().toLocaleString();
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleString();
    return new Date(timestamp).toLocaleString();
  };

  const [listings, setListings] = useState<Listing[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [moderationMetrics, setModerationMetrics] = useState<ModerationMetricsDoc>(DEFAULT_MODERATION_METRICS);
  const [historicalDryRunResult, setHistoricalDryRunResult] = useState<HistoricalDryRunResult | null>(null);
  const [isRunningHistoricalDryRun, setIsRunningHistoricalDryRun] = useState<boolean>(false);
  const [historicalDryRunError, setHistoricalDryRunError] = useState<string | null>(null);
  const [isInitializingMetrics, setIsInitializingMetrics] = useState<boolean>(false);
  const [initializationResult, setInitializationResult] = useState<{
    success: boolean;
    preWriteState: ModerationMetricsDoc | null;
    postWriteState: ModerationMetricsDoc;
    invariantsPass: boolean;
  } | null>(null);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [reportsHasMore, setReportsHasMore] = useState<boolean>(true);
  const [loadingMoreReports, setLoadingMoreReports] = useState<boolean>(false);
  const reportsFetchLockRef = useRef<boolean>(false);
  const reportStreamRef = useRef<{
    marketplaceBuffer: QueryDocumentSnapshot[];
    arenaBuffer: QueryDocumentSnapshot[];
    marketplaceCursor: QueryDocumentSnapshot | null;
    arenaCursor: QueryDocumentSnapshot | null;
    marketplaceHasMore: boolean;
    arenaHasMore: boolean;
  }>({
    marketplaceBuffer: [],
    arenaBuffer: [],
    marketplaceCursor: null,
    arenaCursor: null,
    marketplaceHasMore: true,
    arenaHasMore: true,
  });
  const [profileReports, setProfileReports] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<UserProfile[]>([]);
  const [pausedUsers, setPausedUsers] = useState<UserProfile[]>([]);
  const [pendingVerifications, setPendingVerifications] = useState<
    UserProfile[]
  >([]);
  const [authAdmins, setAuthAdmins] = useState<any[]>([]);
  const [authAdminsSearch, setAuthAdminsSearch] = useState("");
  const [authVerifiers, setAuthVerifiers] = useState<any[]>([]);
  const [authVerifiersSearch, setAuthVerifiersSearch] = useState("");
  const [newVerifierEmail, setNewVerifierEmail] = useState("");
  const [authVerifierError, setAuthVerifierError] = useState<string | null>(null);
  const [authVerifierSuccess, setAuthVerifierSuccess] = useState<string | null>(null);
  const [authAdminsSubTab, setAuthAdminsSubTab] = useState<"admins" | "verifiers">("admins");
  const [paymentVerifierFilter, setPaymentVerifierFilter] = useState<"BADGES" | "PROMOTIONS">("BADGES");
  const [allPaymentPromotions, setAllPaymentPromotions] = useState<any[]>([]);
  const [allVerifyApplications, setAllVerifyApplications] = useState<any[]>([]);
  const [verifiersFromDate, setVerifiersFromDate] = useState<string>("");
  const [verifiersToDate, setVerifiersToDate] = useState<string>("");
  const [selectedAuditVerifierEmail, setSelectedAuditVerifierEmail] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthorizedPaymentVerifier && !isSuperAdmin && !isAuthorizedAdmin) {
      setActiveTab("paymentVerifiers");
    }
  }, [isAuthorizedPaymentVerifier, isSuperAdmin, isAuthorizedAdmin]);

  const allowedMobileAndSidebarTabs = useMemo(() => {
    if (isAuthorizedPaymentVerifier && !isSuperAdmin && !isAuthorizedAdmin) {
      return [
        { id: "paymentVerifiers", label: "Payment Verifiers", icon: ShieldCheck }
      ];
    }
    const allTabs = [
      { id: "reports", label: "Reported Listings", icon: ShieldAlert },
      { id: "profileReports", label: "Reported Profiles", icon: AlertCircle },
      { id: "kycVerifications", label: "KYC Verifications", icon: ShieldCheck },
      { id: "nameRequests", label: "Name Change Requests", icon: UserCheck },
      { id: "blockedAccounts", label: "Blocked/ Banned Accounts", icon: UserX },
      { id: "pausedAccounts", label: "Paused Accounts", icon: PauseCircle },
      { id: "search", label: "Search", icon: Search },
      { id: "analysis", label: "Analysis", icon: Database },
      { id: "support", label: "Support Tickets", icon: Ticket },
      { id: "promotions", label: "PROMO Requests", icon: Zap },
      { id: "appeals", label: "Appeals", icon: AlertTriangle },
      { id: "refunds", label: "Refunds", icon: DollarSign },
      { id: "battleBidsModeration", label: "Arena Moderation", icon: ShieldAlert },
      { id: "broadcast", label: "Community Broadcast", icon: Speaker },
      { id: "disputes", label: "Deal Disputes", icon: ShieldAlert },
      ...(isSuperAdmin ? [{ id: "adminOverview", label: "Admin Overview", icon: LayoutGrid }] : []),
      ...(isAdmin ? [{ id: "authAdmins", label: "Admins & Verifiers", icon: UserPlus }] : []),
      ...(isSuperAdmin || isAuthorizedAdmin || isAuthorizedPaymentVerifier ? [{ id: "paymentVerifiers", label: "Payment Verifiers", icon: ShieldCheck }] : []),
    ];

    if (isSuperAdmin) return allTabs;

    if (isAuthorizedAdmin) {
      const allowed = allowedSections || [];
      return allTabs.filter(tab => {
        if (tab.id === "adminOverview") return false;
        return allowed.includes(tab.id);
      });
    }

    return allTabs;
  }, [isAdmin, isSuperAdmin, isAuthorizedAdmin, isAuthorizedPaymentVerifier, allowedSections]);

  useEffect(() => {
    if (allowedMobileAndSidebarTabs.length > 0) {
      const isAllowed = allowedMobileAndSidebarTabs.some(tab => tab.id === activeTab);
      if (!isAllowed) {
        setActiveTab(allowedMobileAndSidebarTabs[0].id as any);
      }
    }
  }, [allowedMobileAndSidebarTabs, activeTab]);

  const [openedAdmin, setOpenedAdmin] = useState<any | null>(null);
  const [openedAdminActivities, setOpenedAdminActivities] = useState<any[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [selectedSupportTicket, setSelectedSupportTicket] = useState<
    any | null
  >(null);
  const [adminReply, setAdminReply] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [promotionRequests, setPromotionRequests] = useState<
    PromotionRequest[]
  >([]);
  const [promoFilter, setPromoFilter] = useState<
    "PENDING" | "APPROVED" | "REVOKED" | "REJECTED" | "ALL"
  >("PENDING");
  const [refundActiveFilter, setRefundActiveFilter] = useState<"PENDING" | "REJECTED" | "REFUNDED">("PENDING");
  const [promoTypeFilter, setPromoTypeFilter] = useState<
    "ALL" | "FEATURED" | "BOOST" | "VERIFIED"
  >("ALL");
  const [selectedPromotion, setSelectedPromotion] =
    useState<PromotionRequest | null>(null);
  const [selectedPromoUser, setSelectedPromoUser] = useState<UserProfile | null>(null);
  const [approvedDuration, setApprovedDuration] = useState<number>(30);
  const [promoSearchQuery, setPromoSearchQuery] = useState("");
  const [reportedListingsSearch, setReportedListingsSearch] = useState("");
  const [reportedSourceFilter, setReportedSourceFilter] = useState<"ALL" | "MARKETPLACE" | "BATTLE_BIDS" | "NEGOTIATION">("ALL");
  const [reportedProfilesSearch, setReportedProfilesSearch] = useState("");
  const [reportedProfileSourceFilter, setReportedProfileSourceFilter] = useState<"ALL" | "MARKETPLACE" | "BATTLE_BIDS" | "NEGOTIATION">("ALL");
  const [kycVerificationsSearch, setKycVerificationsSearch] = useState("");
  const [nameRequestsSearch, setNameRequestsSearch] = useState("");
  const [blockedAccountsSearch, setBlockedAccountsSearch] = useState("");
  const [pausedAccountsSearch, setPausedAccountsSearch] = useState("");
  const [processingUnpauseId, setProcessingUnpauseId] = useState<string | null>(null);
  const [pauseModalTarget, setPauseModalTarget] = useState<UserProfile | null>(null);
  const [pauseActionReason, setPauseActionReason] = useState("");
  const [isPausingInProgress, setIsPausingInProgress] = useState(false);
  const [showManualPauseModal, setShowManualPauseModal] = useState(false);
  const [manualPauseUserQuery, setManualPauseUserQuery] = useState("");
  const [supportTicketsSearch, setSupportTicketsSearch] = useState("");
  const [appealsSearch, setAppealsSearch] = useState("");
  const [refundsSearch, setRefundsSearch] = useState("");

  const getFilteredReports = () => {
    return reports.filter((r) => {
      if (r.status !== "OPEN") return false;
      if (reportedSourceFilter !== "ALL") {
        if (r.source !== reportedSourceFilter) return false;
      }
      const query = reportedListingsSearch.toLowerCase().trim();
      if (!query) return true;
      return (
        r.id.toLowerCase().includes(query) ||
        (r.listingId && r.listingId.toLowerCase().includes(query)) ||
        (r.targetId && r.targetId.toLowerCase().includes(query)) ||
        (r.listingTitle && r.listingTitle.toLowerCase().includes(query)) ||
        (r.reason && r.reason.toLowerCase().includes(query)) ||
        (r.sourceLabel && r.sourceLabel.toLowerCase().includes(query)) ||
        (r.ownerId && r.ownerId.toLowerCase().includes(query)) ||
        (r.reporterId && r.reporterId.toLowerCase().includes(query))
      );
    });
  };

  const getFilteredProfileReports = () => {
    return profileReports.filter((r) => {
      if (r.status !== "OPEN") return false;
      if (reportedProfileSourceFilter !== "ALL") {
        if (r.source !== reportedProfileSourceFilter) return false;
      }
      const query = reportedProfilesSearch.toLowerCase().trim();
      if (!query) return true;
      return (
        (r.id && r.id.toLowerCase().includes(query)) ||
        (r.profileId && r.profileId.toLowerCase().includes(query)) ||
        (r.targetId && r.targetId.toLowerCase().includes(query)) ||
        (r.userName && r.userName.toLowerCase().includes(query)) ||
        (r.userEmail && r.userEmail.toLowerCase().includes(query)) ||
        (r.reason && r.reason.toLowerCase().includes(query)) ||
        (r.details && r.details.toLowerCase().includes(query)) ||
        (r.description && r.description.toLowerCase().includes(query)) ||
        (r.sourceLabel && r.sourceLabel.toLowerCase().includes(query)) ||
        (r.reporterId && r.reporterId.toLowerCase().includes(query))
      );
    });
  };

  const getFilteredKyc = () => {
    return kycApplications.filter((app) => {
      // Appeals against revoked KYC badges are handled in Admin -> Appeals exclusively
      if (app.status === "RESUME_REQUESTED") return false;
      const query = kycVerificationsSearch.toLowerCase().trim();
      if (!query) return true;
      const targetUser = allUsers.find(u => u.id === app.userId);
      const trackingNumber = `MND-KYC-${app.userId.substring(0, 8).toUpperCase()}`;
      return app.id.toLowerCase().includes(query) || 
             trackingNumber.toLowerCase().includes(query) ||
             (targetUser?.email?.toLowerCase().includes(query)) || 
             (app.issuedAdminCode && app.issuedAdminCode.toLowerCase().includes(query));
    });
  };

  const getFilteredKycAppeals = () => {
    return kycApplications.filter((app) => {
      if (app.status !== "RESUME_REQUESTED") return false;
      const query = appealsSearch.toLowerCase().trim();
      if (!query) return true;
      const targetUser = allUsers.find(u => u.id === app.userId);
      const trackingNumber = `MND-KYC-${app.userId.substring(0, 8).toUpperCase()}`;
      return (
        app.id.toLowerCase().includes(query) ||
        trackingNumber.toLowerCase().includes(query) ||
        (targetUser?.email?.toLowerCase().includes(query)) ||
        (app.userEmail?.toLowerCase().includes(query)) ||
        (app.legalName?.toLowerCase().includes(query)) ||
        (app.issuedAdminCode && app.issuedAdminCode.toLowerCase().includes(query))
      );
    });
  };

  const getFilteredNameRequests = () => {
    return nameChangeRequests.filter((req) => {
      const query = nameRequestsSearch.toLowerCase().trim();
      if (!query) return true;
      return req.id.toLowerCase().includes(query) || req.userEmail?.toLowerCase().includes(query) || (req.issuedAdminCode && req.issuedAdminCode.toLowerCase().includes(query));
    });
  };

  const getFilteredBlocked = () => {
    return blockedUsers.filter((u) => {
      const query = blockedAccountsSearch.toLowerCase().trim();
      if (!query) return true;
      return (
        u.id?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query) ||
        u.name?.toLowerCase().includes(query) ||
        (u.issuedAdminCode && u.issuedAdminCode.toLowerCase().includes(query)) ||
        (u.banReason && u.banReason.toLowerCase().includes(query)) ||
        (u.blockReason && u.blockReason.toLowerCase().includes(query))
      );
    });
  };

  const getFilteredPaused = () => {
    return pausedUsers.filter((u) => {
      const query = pausedAccountsSearch.toLowerCase().trim();
      if (!query) return true;
      return (
        u.id?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query) ||
        u.name?.toLowerCase().includes(query) ||
        (u.issuedAdminCode && u.issuedAdminCode.toLowerCase().includes(query)) ||
        (u.pauseReason && u.pauseReason.toLowerCase().includes(query)) ||
        (u.pausedBy && u.pausedBy.toLowerCase().includes(query))
      );
    });
  };

  const getFilteredSupport = () => {
    return supportTickets.filter((t) => {
      const query = supportTicketsSearch.toLowerCase().trim();
      if (!query) return true;
      return t.email?.toLowerCase().includes(query) || t.id.toLowerCase().includes(query);
    });
  };

  const getFilteredAppeals = () => {
    return promotionRequests.filter((req) => {
      if (req.status !== "RESUME_REQUESTED") return false;
      const query = appealsSearch.toLowerCase().trim();
      if (!query) return true;
      return req.id.toLowerCase().includes(query) || req.applicantEmail?.toLowerCase().includes(query) || (req.issuedAdminCode && req.issuedAdminCode.toLowerCase().includes(query));
    });
  };

  const getFilteredRefunds = () => {
    return promotionRequests.filter((req) => {
      if (!req.refundRequested) return false;
      let statusMatch = false;
      if (refundActiveFilter === "PENDING") {
         statusMatch = req.refundStatus !== "REFUNDED" && req.refundStatus !== "REJECTED_FINAL";
      } else if (refundActiveFilter === "REJECTED") {
         statusMatch = req.refundStatus === "REJECTED_FINAL";
      } else if (refundActiveFilter === "REFUNDED") {
         statusMatch = req.refundStatus === "REFUNDED";
      }
      if (!statusMatch) return false;

      const query = refundsSearch.toLowerCase().trim();
      if (!query) return true;
      return req.id.toLowerCase().includes(query) || 
             (req.applicantEmail || "").toLowerCase().includes(query) || 
             (req.issuedAdminCode || "").toLowerCase().includes(query) ||
             (req.refundBankName || "").toLowerCase().includes(query) ||
             (req.applicationId || "").toLowerCase().includes(query) ||
             (req.planName || "").toLowerCase().includes(query);
    });
  };

  const getFilteredPromoRequests = () => {
    return promotionRequests.filter((req) => {
      const fallbackAppId = req.type ? `APP-${req.type.substring(0, 3).toUpperCase()}-${req.id.substring(0, 6).toUpperCase()}` : "";
      const matchesQuery = !promoSearchQuery.trim() ||
        (req.applicationId || "").toLowerCase().includes(promoSearchQuery.toLowerCase()) ||
        (req.id || "").toLowerCase().includes(promoSearchQuery.toLowerCase()) ||
        (req.planName || "").toLowerCase().includes(promoSearchQuery.toLowerCase()) ||
        fallbackAppId.toLowerCase().includes(promoSearchQuery.toLowerCase()) ||
        (req.applicantEmail || "").toLowerCase().includes(promoSearchQuery.toLowerCase()) ||
        (req.issuedAdminCode || "").toLowerCase().includes(promoSearchQuery.toLowerCase());
      
      if (!matchesQuery) return false;
      if (promoSearchQuery.trim()) return true; // bypass status/type tab filters when search query matches

      const passStatus = (() => {
        if (promoFilter === "PENDING") {
          return req.status === "PENDING";
        }
        if (promoFilter === "APPROVED") {
          return req.status === "APPROVED";
        }
        if (promoFilter === "REVOKED") {
          return req.status === "REVOKED";
        }
        if (promoFilter === "REJECTED") {
          return req.status === "REJECTED" && !req.refundRequested;
        }
        return true; // "ALL"
      })();

      const passType = promoTypeFilter === "ALL" || req.type === promoTypeFilter;
      return passStatus && passType;
    });
  };

  useEffect(() => {
    let active = true;
    if (selectedPromotion && selectedPromotion.userId) {
      setSelectedPromoUser(null);
      setApprovedDuration(selectedPromotion.durationDays || 30);
      const userRef = doc(db, "users", selectedPromotion.userId);
      getDoc(userRef).then((uDoc) => {
        if (active && uDoc.exists()) {
          setSelectedPromoUser(uDoc.data() as UserProfile);
        }
      }).catch(err => console.warn("Error fetching promo user details:", err));
    } else {
      setSelectedPromoUser(null);
    }
    setAdminRefundProof("");
    return () => {
      active = false;
    };
  }, [selectedPromotion]);
  const [adminPromoReason, setAdminPromoReason] = useState("");
  const [adminRejectionCategory, setAdminRejectionCategory] = useState<'POLICY_VIOLATION' | 'FRAUD' | 'NON_PAYMENT'>('POLICY_VIOLATION');
  const [adminRefundProof, setAdminRefundProof] = useState<string>("");
  const [verifierRefundReceipts, setVerifierRefundReceipts] = useState<Record<string, string>>({});
  const [verifierReceivedAmounts, setVerifierReceivedAmounts] = useState<Record<string, string>>({});
  const [isRefunding, setIsRefunding] = useState<boolean>(false);
  const [confirmingAdminRefund, setConfirmingAdminRefund] = useState<PromotionRequest | null>(null);
  const [promoActionsUnlocked, setPromoActionsUnlocked] = useState(false);
  const [applications, setApplications] = useState<any[]>([]);
  const [applicationsStatusFilter, setApplicationsStatusFilter] = useState<
    "PENDING" | "APPROVED" | "REJECTED" | "ALL"
  >("PENDING");
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedListingDetail, setSelectedListingDetail] =
    useState<Listing | null>(null);
  const [userListings, setUserListings] = useState<Listing[]>([]);
  const [isViewingUser, setIsViewingUser] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockActionReason, setBlockActionReason] = useState(
    "Violation of community trading policies.",
  );
  const [isBlockingInProgress, setIsBlockingInProgress] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [unblockConfirm, setUnblockConfirm] = useState<{
    userId: string;
    targetName: string;
  } | null>(null);
  const [showBadgeConfirm, setShowBadgeConfirm] = useState<{
    userId: string;
    targetName: string;
    durDays: number;
  } | null>(null);
  const [issueVerifiedDuration, setIssueVerifiedDuration] =
    useState<number>(30);
  const [issueVerifiedBadgeType, setIssueVerifiedBadgeType] =
    useState<"BASIC" | "GOLDEN">("GOLDEN");


  // KYC States
  const [kycApplications, setKycApplications] = useState<KycApplication[]>([]);
  const [nameChangeRequests, setNameChangeRequests] = useState<
    NameChangeRequest[]
  >([]);
  const [kycStatusFilter, setKycStatusFilter] = useState<
    | "PENDING"
    | "RESUME_REQUESTED"
    | "APPROVED"
    | "REJECTED"
    | "REVOKED"
    | "PERMANENTLY_REMOVED"
    | "ALL"
  >("PENDING");
  const [selectedKycApplication, setSelectedKycApplication] =
    useState<KycApplication | null>(null);
  const [selectedNameRequest, setSelectedNameRequest] =
    useState<NameChangeRequest | null>(null);
  const [kycActionSubmitting, setKycActionSubmitting] = useState(false);
  const [kycRejectionInputs, setKycRejectionInputs] = useState<
    Record<string, string>
  >({});
  const [kycRevocationInputs, setKycRevocationInputs] = useState<
    Record<string, string>
  >({});
  const [kycModalAlert, setKycModalAlert] = useState<{
    title: string;
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [kycAppealReasonModal, setKycAppealReasonModal] = useState<{
    isOpen: boolean;
    app: KycApplication | null;
    reason: string;
  }>({
    isOpen: false,
    app: null,
    reason: "",
  });

  const formatSafeDate = (val: any) => {
    if (!val) return "---";
    try {
      if (val && typeof val.toDate === "function") {
        return val
          .toDate()
          .toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
      }
      const d = val instanceof Date ? val : new Date(val);
      return isNaN(d.getTime())
        ? "---"
        : d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
    } catch {
      return "---";
    }
  };

  const formatSafeTime = (val: any) => {
    if (!val) return "--:--";
    try {
      if (val && typeof val.toDate === "function") {
        return val.toDate().toLocaleTimeString();
      }
      const d = val instanceof Date ? val : new Date(val);
      return isNaN(d.getTime()) ? "--:--" : d.toLocaleTimeString();
    } catch {
      return "--:--";
    }
  };

  const formatKycDateTime = (val: any) => {
    if (!val) return "---";
    try {
      const dateStr = formatSafeDate(val);
      const timeStr = formatSafeTime(val);
      if (dateStr === "---") return "---";
      return `${dateStr} at ${timeStr}`;
    } catch {
      return "---";
    }
  };

  const [copiedTrackId, setCopiedTrackId] = useState<string | null>(null);

  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminCode, setNewAdminCode] = useState("");
  const [selectedSections, setSelectedSections] = useState<string[]>([
    "reports", "profileReports", "kycVerifications", "nameRequests", "blockedAccounts", "pausedAccounts", "search", "support", "promotions", "appeals", "refunds", "broadcast", "authAdmins"
  ]);
  const [editingAdmin, setEditingAdmin] = useState<any | null>(null);
  const [editingSections, setEditingSections] = useState<string[]>([]);
  const [isUpdatingPermissions, setIsUpdatingPermissions] = useState(false);
  const [authAdminError, setAuthAdminError] = useState<string | null>(null);
  const [authAdminSuccess, setAuthAdminSuccess] = useState<string | null>(null);
  const [activeKycLightbox, setActiveKycLightbox] = useState<{
    src: string;
    title: string;
  } | null>(null);
  const [listingsSearch, setListingsSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [appliedUserSearch, setAppliedUserSearch] = useState("");
  const [appliedListingsSearch, setAppliedListingsSearch] = useState("");

  const [supportFilter, setSupportFilter] = useState<string>("UNRESOLVED");

  const [paymentDenyAction, setPaymentDenyAction] = useState<{
    type: 'USER' | 'PROMOTION',
    payload: any
  } | null>(null);
  const [paymentDenyReason, setPaymentDenyReason] = useState("");
  const [processingReportId, setProcessingReportId] = useState<string | null>(
    null,
  );
  const [processingUnblockId, setProcessingUnblockId] = useState<string | null>(
    null,
  );
  const [disputes, setDisputes] = useState<any[]>([]);
  const [processingDisputeId, setProcessingDisputeId] = useState<string | null>(null);

  const handleUpdateDisputeStatus = async (disputeId: string, newStatus: string) => {
    setProcessingDisputeId(disputeId);
    try {
      await updateDoc(doc(db, "disputes", disputeId), {
        status: newStatus,
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.email || user?.uid || "admin"
      });
      setDisputes(prev => prev.map(d => d.id === disputeId ? { ...d, status: newStatus } : d));
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to update dispute status");
    } finally {
      setProcessingDisputeId(null);
    }
  };

  const handleDeleteDispute = async (disputeId: string) => {
    if (!confirm("Are you sure you want to delete this dispute record?")) return;
    setProcessingDisputeId(disputeId);
    try {
      await deleteDoc(doc(db, "disputes", disputeId));
      setDisputes(prev => prev.filter(d => d.id !== disputeId));
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to delete dispute");
    } finally {
      setProcessingDisputeId(null);
    }
  };
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastLink, setBroadcastLink] = useState("");
  const [broadcastType, setBroadcastType] = useState<"ANNOUNCEMENT" | "URGENT" | "MAINTENANCE" | "UPDATE">("ANNOUNCEMENT");
  const [broadcastAudience, setBroadcastAudience] = useState<"ALL" | "SELLERS" | "BUYERS">("ALL");
  const [broadcastPriority, setBroadcastPriority] = useState<"NORMAL" | "HIGH">("NORMAL");
  const [broadcastPinned, setBroadcastPinned] = useState(false);
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastRecord[]>([]);
  const [broadcastLoadingHistory, setBroadcastLoadingHistory] = useState(false);
  const [broadcastSuccessMessage, setBroadcastSuccessMessage] = useState<string | null>(null);
  const [broadcastErrorMessage, setBroadcastErrorMessage] = useState<string | null>(null);
  const [isDeletingBroadcastId, setIsDeletingBroadcastId] = useState<string | null>(null);
  const [broadcastSearch, setBroadcastSearch] = useState("");
  const [broadcastFilterType, setBroadcastFilterType] = useState<string>("ALL");

  // Credit Applications States
  const [creditApplications, setCreditApplications] = useState<any[]>([]);
  const [creditAppFilter, setCreditAppFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [creditAppActioning, setCreditAppActioning] = useState<string | null>(null);

  const handleApproveCreditApp = async (app: any) => {
    if (!confirm(`Approve credit purchase for ${app.userName || 'User'}? This will immediately issue ${app.credits} Credits.`)) {
      return;
    }
    setCreditAppActioning(app.id);
    try {
      const adminIdentifier = user?.email || user?.uid || 'Admin';
      const res = await CreditsService.grantCredits({
        applicationId: app.id,
        userId: app.userId,
        creditsAmount: app.credits,
        packageName: app.packageName || 'Credit Package',
        packageId: app.packageId || '',
        usdPrice: app.usdPrice || 0,
        paymentMethod: app.paymentMethod || 'Manual',
        adminIdentifier,
      });

      if (res.success) {
        alert(res.message);
        setCreditApplications((prev) =>
          prev.map((a) =>
            a.id === app.id
              ? { ...a, status: 'APPROVED', approvedAt: new Date(), approvedBy: adminIdentifier }
              : a
          )
        );
      } else {
        alert(`Failed to approve: ${res.message}`);
      }
    } catch (err: any) {
      console.error('Error approving credit application:', err);
      alert(err?.message || 'Error approving application.');
    } finally {
      setCreditAppActioning(null);
    }
  };

  const handleRejectCreditApp = async (app: any) => {
    const reason = prompt('Enter rejection reason (optional):', 'Payment verification unsuccessful.');
    if (reason === null) return;

    setCreditAppActioning(app.id);
    try {
      const adminIdentifier = user?.email || user?.uid || 'Admin';
      const res = await CreditsService.rejectCreditApplication({
        applicationId: app.id,
        userId: app.userId,
        packageName: app.packageName || 'Credit Package',
        rejectionReason: reason,
        adminIdentifier,
      });

      if (res.success) {
        alert(res.message);
        setCreditApplications((prev) =>
          prev.map((a) =>
            a.id === app.id
              ? { ...a, status: 'REJECTED', rejectionReason: reason, rejectedAt: new Date(), rejectedBy: adminIdentifier }
              : a
          )
        );
      } else {
        alert(`Failed to reject: ${res.message}`);
      }
    } catch (err: any) {
      console.error('Error rejecting credit application:', err);
      alert(err?.message || 'Error rejecting application.');
    } finally {
      setCreditAppActioning(null);
    }
  };

  const handleApproveCreditRefund = async (app: any) => {
    const refundAmt = app.refundCalculatedAmount || (Number(app.usdPrice || 0) * 0.95).toFixed(2);
    if (!confirm(`Confirm 95% refund of $${refundAmt} USD for user ${app.userName || 'User'} to ${app.refundBankName || 'Bank'} (${app.refundAccountNumber})?`)) {
      return;
    }
    setCreditAppActioning(app.id);
    try {
      await updateDoc(doc(db, 'credit_applications', app.id), {
        refundStatus: 'REFUNDED',
        refundApprovedAt: serverTimestamp(),
        refundApprovedBy: user?.email || user?.uid || 'Admin',
        updatedAt: serverTimestamp()
      });

      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        id: notifRef.id,
        userId: app.userId,
        title: "💸 Credit Application Refund Completed",
        message: `Your 95% refund of $${refundAmt} USD for ${app.packageName || 'Credit Purchase'} has been completed by finance to account ${app.refundAccountNumber}.`,
        read: false,
        createdAt: serverTimestamp(),
      });

      setCreditApplications((prev) =>
        prev.map((a) =>
          a.id === app.id
            ? { ...a, refundStatus: 'REFUNDED', refundApprovedAt: new Date(), refundApprovedBy: user?.email || 'Admin' }
            : a
        )
      );
      alert("Credit refund marked as completed!");
    } catch (err: any) {
      console.error('Error approving credit refund:', err);
      alert(err?.message || 'Error processing refund.');
    } finally {
      setCreditAppActioning(null);
    }
  };

  const cleanupExpiredPromotions = async () => {
    try {
      const now = new Date();

      // Cleanup Featured Listings
      const featuredQ = query(
        collection(db, "listings"),
        where("isFeatured", "==", true),
        where("featuredUntil", "<", now),
      );
      const featuredSnap = await getDocs(featuredQ);
      featuredSnap.docs.forEach(async (d) => {
        const data = d.data();
        const isBoostedActive = data.isBoosted && data.boostedUntil && (
          typeof data.boostedUntil.toDate === 'function' ? data.boostedUntil.toDate() > now :
          new Date(data.boostedUntil.seconds ? data.boostedUntil.seconds * 1000 : data.boostedUntil) > now
        );
        await updateDoc(doc(db, "listings", d.id), {
          isFeatured: false,
          featuredUntil: null,
          promotionStatus: isBoostedActive ? "APPROVED" : "NONE",
        });
      });

      // Cleanup Boosted Listings
      const boostedQ = query(
        collection(db, "listings"),
        where("isBoosted", "==", true),
        where("boostedUntil", "<", now),
      );
      const boostedSnap = await getDocs(boostedQ);
      boostedSnap.docs.forEach(async (d) => {
        const data = d.data();
        const isFeaturedActive = data.isFeatured && data.featuredUntil && (
          typeof data.featuredUntil.toDate === 'function' ? data.featuredUntil.toDate() > now :
          new Date(data.featuredUntil.seconds ? data.featuredUntil.seconds * 1000 : data.featuredUntil) > now
        );
        await updateDoc(doc(db, "listings", d.id), {
          isBoosted: false,
          boostedUntil: null,
          promotionStatus: isFeaturedActive ? "APPROVED" : "NONE",
        });
      });

      // Cleanup Verified Badges
      const verifiedQ = query(
        collection(db, "users"),
        where("isVerified", "==", true),
        where("verifiedUntil", "<", now),
      );
      const verifiedSnap = await getDocs(verifiedQ);
      verifiedSnap.docs.forEach(async (d) => {
        await setDoc(doc(db, "users", d.id), {
          isVerified: false,
          isPremiumVerified: false,
          verifiedUntil: null,
          verifiedBadgeType: null,
          verifiedBadgeRequestStatus: "NONE",
        }, { merge: true });
      });

      console.log("Promotions cleanup completed.");
    } catch (error: any) {
      if (
        error?.message?.toLowerCase().includes("quota") ||
        error?.code === "resource-exhausted"
      ) {
        console.warn("Promotions cleanup skipped: Firebase Quota Exceeded.");
      } else {
        console.error("Cleanup error:", error);
      }
    }
  };

  useEffect(() => {
    if (isAdmin) {
      cleanupExpiredPromotions();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin && !loading) {
      navigate("/");
    }
  }, [isAdmin, loading, navigate]);

  useEffect(() => {
    setPromoActionsUnlocked(false);
  }, [selectedPromotion?.id]);

  const fetchReportStreamPage = async (
    isReset: boolean = false,
    explicitSource?: "ALL" | "MARKETPLACE" | "BATTLE_BIDS" | "NEGOTIATION",
  ) => {
    if (reportsFetchLockRef.current) return;
    reportsFetchLockRef.current = true;

    try {
      const streamState = reportStreamRef.current;
      const activeSourceFilter = explicitSource !== undefined ? explicitSource : reportedSourceFilter;

      if (isReset) {
        streamState.marketplaceBuffer = [];
        streamState.arenaBuffer = [];
        streamState.marketplaceCursor = null;
        streamState.arenaCursor = null;
        streamState.marketplaceHasMore = true;
        streamState.arenaHasMore = true;
      }

      const includeMarketplace = activeSourceFilter === "ALL" || activeSourceFilter === "MARKETPLACE";
      const includeArena = activeSourceFilter === "ALL" || activeSourceFilter === "BATTLE_BIDS" || activeSourceFilter === "NEGOTIATION";

      if (!includeMarketplace) {
        streamState.marketplaceHasMore = false;
      }
      if (!includeArena) {
        streamState.arenaHasMore = false;
      }

      const emittedArenaDocs: QueryDocumentSnapshot[] = [];
      const emittedOrderedItems: Array<{ source: "MARKETPLACE" | "ARENA"; doc: QueryDocumentSnapshot }> = [];

      while (emittedOrderedItems.length < REPORT_PAGE_SIZE) {
        // 1. Refill Marketplace stream if buffer depleted and more available
        if (includeMarketplace && streamState.marketplaceBuffer.length === 0 && streamState.marketplaceHasMore) {
          try {
            const qMarketplace = streamState.marketplaceCursor
              ? query(
                  collection(db, "reports"),
                  where("status", "==", "OPEN"),
                  orderBy("createdAt", "desc"),
                  startAfter(streamState.marketplaceCursor),
                  limit(REPORT_STREAM_CHUNK_SIZE),
                )
              : query(
                  collection(db, "reports"),
                  where("status", "==", "OPEN"),
                  orderBy("createdAt", "desc"),
                  limit(REPORT_STREAM_CHUNK_SIZE),
                );

            const marketplaceSnap = await getDocs(qMarketplace);
            if (marketplaceSnap.empty) {
              streamState.marketplaceHasMore = false;
            } else {
              streamState.marketplaceBuffer.push(...marketplaceSnap.docs);
              streamState.marketplaceCursor = marketplaceSnap.docs[marketplaceSnap.docs.length - 1];
              if (marketplaceSnap.docs.length < REPORT_STREAM_CHUNK_SIZE) {
                streamState.marketplaceHasMore = false;
              }
            }
          } catch (err) {
            console.error("Error refilling Marketplace report stream:", err);
            streamState.marketplaceHasMore = false;
          }
        }

        // 2. Refill Arena stream if buffer depleted and more available
        if (includeArena && streamState.arenaBuffer.length === 0 && streamState.arenaHasMore) {
          try {
            const qArena = streamState.arenaCursor
              ? query(
                  collection(db, "arena_reports"),
                  where("status", "in", [ReportStatus.PENDING, ReportStatus.REVIEWING]),
                  orderBy("createdAt", "desc"),
                  startAfter(streamState.arenaCursor),
                  limit(REPORT_STREAM_CHUNK_SIZE),
                )
              : query(
                  collection(db, "arena_reports"),
                  where("status", "in", [ReportStatus.PENDING, ReportStatus.REVIEWING]),
                  orderBy("createdAt", "desc"),
                  limit(REPORT_STREAM_CHUNK_SIZE),
                );

            const arenaSnap = await getDocs(qArena);
            if (arenaSnap.empty) {
              streamState.arenaHasMore = false;
            } else {
              // CRITICAL CURSOR RULE: Save cursor based on the last fetched Firestore doc
              streamState.arenaCursor = arenaSnap.docs[arenaSnap.docs.length - 1];
              if (arenaSnap.docs.length < REPORT_STREAM_CHUNK_SIZE) {
                streamState.arenaHasMore = false;
              }

              // Filter out user profile reports (they belong in Reported Profiles queue)
              const validArenaDocs = arenaSnap.docs.filter(
                (d) => (d.data().targetType || "listing") !== "user",
              );
              streamState.arenaBuffer.push(...validArenaDocs);
            }
          } catch (err) {
            console.error("Error refilling Arena report stream:", err);
            streamState.arenaHasMore = false;
          }
        }

        const hasM = includeMarketplace && streamState.marketplaceBuffer.length > 0;
        const hasA = includeArena && streamState.arenaBuffer.length > 0;

        if (!hasM && !hasA) {
          break; // Both active streams completely exhausted
        }

        if (hasM && !hasA) {
          const popped = streamState.marketplaceBuffer.shift()!;
          emittedOrderedItems.push({ source: "MARKETPLACE", doc: popped });
        } else if (!hasM && hasA) {
          const popped = streamState.arenaBuffer.shift()!;
          const data = popped.data();
          const isNeg = (data.targetType || "listing") === "negotiation";
          if (activeSourceFilter === "BATTLE_BIDS" && isNeg) {
            continue;
          }
          if (activeSourceFilter === "NEGOTIATION" && !isNeg) {
            continue;
          }
          emittedArenaDocs.push(popped);
          emittedOrderedItems.push({ source: "ARENA", doc: popped });
        } else {
          const headM = streamState.marketplaceBuffer[0];
          const headA = streamState.arenaBuffer[0];
          const timeM = getReportTimeMillis(headM.data().createdAt);
          const timeA = getReportTimeMillis(headA.data().createdAt);

          let chooseMarketplace = false;
          if (timeM > timeA) {
            chooseMarketplace = true;
          } else if (timeM < timeA) {
            chooseMarketplace = false;
          } else {
            // Deterministic tie-breaking:
            // 1. Marketplace before Arena
            // 2. Document ID lexicographical comparison
            chooseMarketplace = headM.id.localeCompare(headA.id) <= 0;
          }

          if (chooseMarketplace) {
            const popped = streamState.marketplaceBuffer.shift()!;
            emittedOrderedItems.push({ source: "MARKETPLACE", doc: popped });
          } else {
            const popped = streamState.arenaBuffer.shift()!;
            const data = popped.data();
            const isNeg = (data.targetType || "listing") === "negotiation";
            if (activeSourceFilter === "BATTLE_BIDS" && isNeg) {
              continue;
            }
            if (activeSourceFilter === "NEGOTIATION" && !isNeg) {
              continue;
            }
            emittedArenaDocs.push(popped);
            emittedOrderedItems.push({ source: "ARENA", doc: popped });
          }
        }
      }

      // 3. Hydrate targets for emitted Arena reports using bounded documentId() batch queries
      const targetIdsToFetch: { arena_auctions: string[]; arena_negotiations: string[] } = {
        arena_auctions: [],
        arena_negotiations: [],
      };

      emittedArenaDocs.forEach((docSnap) => {
        const data = docSnap.data();
        const targetType = data.targetType || "listing";
        if (targetType === "negotiation") {
          if (data.targetId) targetIdsToFetch.arena_negotiations.push(data.targetId);
        } else {
          if (data.targetId) targetIdsToFetch.arena_auctions.push(data.targetId);
        }
      });

      const targetDataMap: { [key: string]: any } = {};

      const uniqueAuctionIds = Array.from(new Set(targetIdsToFetch.arena_auctions));
      const uniqueNegotiationIds = Array.from(new Set(targetIdsToFetch.arena_negotiations));

      const auctionChunks: string[][] = [];
      for (let i = 0; i < uniqueAuctionIds.length; i += TARGET_HYDRATION_BATCH_SIZE) {
        auctionChunks.push(uniqueAuctionIds.slice(i, i + TARGET_HYDRATION_BATCH_SIZE));
      }

      const negotiationChunks: string[][] = [];
      for (let i = 0; i < uniqueNegotiationIds.length; i += TARGET_HYDRATION_BATCH_SIZE) {
        negotiationChunks.push(uniqueNegotiationIds.slice(i, i + TARGET_HYDRATION_BATCH_SIZE));
      }

      const auctionPromises = auctionChunks.map(async (chunk) => {
        if (chunk.length === 0) return;
        try {
          const q = query(
            collection(db, "arena_auctions"),
            where(documentId(), "in", chunk),
          );
          const snap = await getDocs(q);
          snap.docs.forEach((d) => {
            targetDataMap[`auction_${d.id}`] = d.data();
          });
        } catch (e) {
          console.warn("Failed to batch hydrate arena_auctions:", e);
        }
      });

      const negotiationPromises = negotiationChunks.map(async (chunk) => {
        if (chunk.length === 0) return;
        try {
          const q = query(
            collection(db, "arena_negotiations"),
            where(documentId(), "in", chunk),
          );
          const snap = await getDocs(q);
          snap.docs.forEach((d) => {
            targetDataMap[`negotiation_${d.id}`] = d.data();
          });
        } catch (e) {
          console.warn("Failed to batch hydrate arena_negotiations:", e);
        }
      });

      await Promise.all([...auctionPromises, ...negotiationPromises]);

      // 4. Map emitted ordered items into UnifiedReport structure preserving chronological order
      const unifiedReports = emittedOrderedItems.map(({ source, doc: d }) => {
        const data = d.data();
        if (source === "MARKETPLACE") {
          return {
            ...data,
            id: d.id,
            source: "MARKETPLACE" as const,
            sourceLabel: "Marketplace",
            status: normalizeReportStatus(data.status),
            localActionsTaken: getReportInitialActions(data.status, data.actionsTaken),
            createdAt: data.createdAt,
          } as any;
        } else {
          const targetType = data.targetType || "listing";
          const isNegotiation = targetType === "negotiation";
          const targetKey = isNegotiation ? `negotiation_${data.targetId}` : `auction_${data.targetId}`;
          const targetDetails = targetDataMap[targetKey] || {};

          const itemSource = isNegotiation ? ("NEGOTIATION" as const) : ("BATTLE_BIDS" as const);
          const sourceLabel = isNegotiation ? "Private Negotiation" : "Battle Bids";

          const title =
            targetDetails.title ||
            data.targetTitle ||
            (isNegotiation
              ? `Negotiation Deal #${data.targetId?.slice(0, 8)}`
              : `Battle Bids Auction #${data.targetId?.slice(0, 8)}`);

          const image =
            (targetDetails.images && targetDetails.images[0]) ||
            targetDetails.imageUrl ||
            targetDetails.image ||
            data.targetImage ||
            null;

          const price =
            targetDetails.currentBid ||
            targetDetails.startingPrice ||
            targetDetails.reservePrice ||
            targetDetails.agreedPrice ||
            targetDetails.price ||
            data.targetPrice ||
            null;

          const ownerId =
            targetDetails.sellerId ||
            targetDetails.ownerId ||
            targetDetails.userId ||
            data.targetOwnerId ||
            data.sellerId ||
            data.ownerId ||
            null;

          const statusNormalized = normalizeReportStatus(data.status);

          return {
            ...data,
            id: d.id,
            targetId: data.targetId,
            targetType: targetType,
            listingId: data.targetId,
            listingTitle: title,
            listingImage: image,
            listingPrice: price,
            ownerId: ownerId,
            reason: data.reason ? String(data.reason).replace(/_/g, " ") : "Violation Report",
            description: data.description || "",
            source: itemSource,
            sourceLabel,
            status: statusNormalized,
            localActionsTaken: getReportInitialActions(data.status, data.actionsTaken),
            createdAt: data.createdAt,
          } as any;
        }
      });

      if (isReset) {
        setReports(unifiedReports);
      } else {
        setReports((prev) => [...prev, ...unifiedReports]);
      }

      const moreAvailable =
        (includeMarketplace && (streamState.marketplaceBuffer.length > 0 || streamState.marketplaceHasMore)) ||
        (includeArena && (streamState.arenaBuffer.length > 0 || streamState.arenaHasMore));

      setReportsHasMore(Boolean(moreAvailable && unifiedReports.length > 0));
    } finally {
      reportsFetchLockRef.current = false;
    }
  };

  const loadMoreReports = async () => {
    if (!reportsHasMore || loadingMoreReports || loading) return;
    setLoadingMoreReports(true);
    try {
      await fetchReportStreamPage(false);
    } finally {
      setLoadingMoreReports(false);
    }
  };

  const handleReportedSourceFilterChange = async (
    newFilter: "ALL" | "MARKETPLACE" | "BATTLE_BIDS" | "NEGOTIATION"
  ) => {
    setReportedSourceFilter(newFilter);
    setLoading(true);
    try {
      await fetchReportStreamPage(true, newFilter);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeTab === "applications") {
        let q;
        if (applicationsStatusFilter === "ALL") {
          q = query(
            collection(db, "verification_applications"),
            orderBy("createdAt", "desc"),
            limit(100),
          );
        } else {
          q = query(
            collection(db, "verification_applications"),
            where("status", "==", applicationsStatusFilter),
            orderBy("createdAt", "desc"),
            limit(100),
          );
        }
        const snapshot = await getDocs(q);
        setApplications(
          snapshot.docs.map((d) => ({ ...(d.data() as any), id: d.id })),
        );
      } else if (activeTab === "reports") {
        const [metricsData] = await Promise.all([
          moderationMetricsService.getAuthoritativeModerationMetrics(),
          fetchReportStreamPage(true)
        ]);
        if (metricsData) {
          setModerationMetrics(metricsData);
        }
      } else if (activeTab === "disputes") {
        const q = query(
          collection(db, "disputes"),
          orderBy("createdAt", "desc"),
        );
        const snapshot = await getDocs(q);
        setDisputes(snapshot.docs.map((d) => ({ ...d.data(), id: d.id })));
      } else if (activeTab === "profileReports") {
        // 1. Fetch Marketplace profile reports from /profileReports
        const qMarketplaceProfile = query(
          collection(db, "profileReports"),
          orderBy("createdAt", "desc"),
        );
        const marketplaceSnap = await getDocs(qMarketplaceProfile);

        // 2. Fetch Arena / Battle Bids & Negotiation profile reports from /arena_reports where targetType === "user"
        let arenaUserDocs: any[] = [];
        try {
          const qArena = query(
            collection(db, "arena_reports"),
            orderBy("createdAt", "desc"),
          );
          const arenaSnap = await getDocs(qArena);
          arenaUserDocs = arenaSnap.docs.filter((d) => d.data().targetType === "user");
        } catch (err) {
          console.warn("Could not query arena_reports for profile reports:", err);
        }

        // 3. Resolve user profiles for all reported user IDs
        const userIdsToFetch = new Set<string>();
        marketplaceSnap.docs.forEach((d) => {
          const data = d.data();
          const pId = data.profileId || data.targetId;
          if (pId) userIdsToFetch.add(pId);
        });
        arenaUserDocs.forEach((d) => {
          const data = d.data();
          const pId = data.targetId || data.profileId;
          if (pId) userIdsToFetch.add(pId);
        });

        const userProfileMap: { [userId: string]: any } = {};
        const userFetchPromises = Array.from(userIdsToFetch).map(async (uId) => {
          try {
            const uSnap = await getDoc(doc(db, "users", uId));
            if (uSnap.exists()) {
              userProfileMap[uId] = uSnap.data();
            }
          } catch (e) {
            // ignore
          }
        });
        await Promise.all(userFetchPromises);

        // 4. Normalize Marketplace profile reports
        const normalizedMarketplace = marketplaceSnap.docs.map((d) => {
          const data = d.data();
          const pId = data.profileId || data.targetId || "";
          const uProfile = userProfileMap[pId] || {};
          const statusNormalized = normalizeReportStatus(data.status);

          return {
            ...data,
            id: d.id,
            profileId: pId,
            targetId: pId,
            targetType: "user" as const,
            userName: uProfile.name || data.userName || data.name || "Unknown User",
            userEmail: uProfile.email || data.userEmail || data.email || "",
            userImage: uProfile.profileImage || data.userImage || null,
            reason: data.reason ? String(data.reason).replace(/_/g, " ") : "Policy Violation",
            details: data.details || data.description || "",
            description: data.description || data.details || "",
            reporterId: data.reporterId || "ANONYMOUS",
            source: "MARKETPLACE" as const,
            sourceLabel: "Marketplace",
            status: statusNormalized,
            localActionsTaken: getReportInitialActions(data.status, data.actionsTaken),
            createdAt: data.createdAt,
          } as ProfileReport;
        });

        // 5. Normalize Arena user reports (Battle Bids / Negotiation)
        const normalizedArena = arenaUserDocs.map((d) => {
          const data = d.data();
          const pId = data.targetId || data.profileId || "";
          const uProfile = userProfileMap[pId] || {};
          const isNegotiation =
            data.context === "negotiation" ||
            data.targetContext === "negotiation" ||
            data.source === "NEGOTIATION" ||
            Boolean(data.negotiationId) ||
            Boolean(data.dealId);

          const source = isNegotiation ? ("NEGOTIATION" as const) : ("BATTLE_BIDS" as const);
          const sourceLabel = isNegotiation ? "Private Negotiation" : "Battle Bids";

          const statusNormalized = normalizeReportStatus(data.status);

          return {
            ...data,
            id: d.id,
            profileId: pId,
            targetId: pId,
            targetType: "user" as const,
            userName: uProfile.name || data.targetTitle || data.userName || "Unknown User",
            userEmail: uProfile.email || data.targetEmail || data.userEmail || "",
            userImage: uProfile.profileImage || data.targetImage || null,
            reason: data.reason ? String(data.reason).replace(/_/g, " ") : "Policy Violation",
            details: data.description || data.details || "",
            description: data.description || data.details || "",
            reporterId: data.reporterId || "ANONYMOUS",
            source,
            sourceLabel,
            status: statusNormalized,
            localActionsTaken: getReportInitialActions(data.status, data.actionsTaken),
            createdAt: data.createdAt,
          } as ProfileReport;
        });

        // 6. Combine and sort
        const combinedProfileReports = [...normalizedMarketplace, ...normalizedArena];
        combinedProfileReports.sort((a, b) => {
          const timeA = a.createdAt?.toDate
            ? a.createdAt.toDate().getTime()
            : a.createdAt?.seconds
            ? a.createdAt.seconds * 1000
            : new Date(a.createdAt || 0).getTime();
          const timeB = b.createdAt?.toDate
            ? b.createdAt.toDate().getTime()
            : b.createdAt?.seconds
            ? b.createdAt.seconds * 1000
            : new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });

        setProfileReports(combinedProfileReports);
      } else if (activeTab === "users") {
        const q = query(
          collection(db, "users"),
          where("verifiedBadgeRequestStatus", "==", "PENDING"),
        );
        const snapshot = await getDocs(q);
        setPendingVerifications(
          snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as UserProfile),
        );
      } else if (activeTab === "allUsers") {
        // Show all users. We avoid restrictive filtering so admins see every profile.
        try {
          const q = query(
            collection(db, "users"),
            orderBy("createdAt", "desc"),
            limit(500),
          );
          const snapshot = await getDocs(q);
          setAllUsers(
            snapshot.docs.map(
              (d) => ({ ...d.data(), id: d.id }) as UserProfile,
            ),
          );
        } catch (e) {
          console.error("Error fetching all users:", e);
          // Fallback to simpler query if ordering fails (e.g. missing indexes)
          const qSimple = query(collection(db, "users"), limit(500));
          const snapshot = await getDocs(qSimple);
          setAllUsers(
            snapshot.docs.map(
              (d) => ({ ...d.data(), id: d.id }) as UserProfile,
            ),
          );
        }
      } else if (activeTab === "blockedAccounts") {
        try {
          const q1 = query(collection(db, "users"), where("isBlocked", "==", true));
          const q2 = query(collection(db, "users"), where("status", "==", "BLOCKED"));
          const q3 = query(collection(db, "users"), where("accountStatus", "==", "blocked"));
          const q4 = query(collection(db, "users"), where("isBanned", "==", true));
          const q5 = query(collection(db, "users"), where("status", "==", "BANNED"));
          const q6 = query(collection(db, "users"), where("accountStatus", "==", "banned"));
          const q7 = query(collection(db, "users"), where("biddingRestrictedPermanently", "==", true));
          
          const [snap1, snap2, snap3, snap4, snap5, snap6, snap7] = await Promise.all([
            getDocs(q1).catch(() => ({ docs: [] })),
            getDocs(q2).catch(() => ({ docs: [] })),
            getDocs(q3).catch(() => ({ docs: [] })),
            getDocs(q4).catch(() => ({ docs: [] })),
            getDocs(q5).catch(() => ({ docs: [] })),
            getDocs(q6).catch(() => ({ docs: [] })),
            getDocs(q7).catch(() => ({ docs: [] }))
          ]);
          
          const userMap = new Map();
          const processSnap = (snap: any) => {
            snap.docs.forEach((d: any) => {
              userMap.set(d.id, { ...d.data(), id: d.id });
            });
          };
          
          processSnap(snap1);
          processSnap(snap2);
          processSnap(snap3);
          processSnap(snap4);
          processSnap(snap5);
          processSnap(snap6);
          processSnap(snap7);

          // Check all recently active users to catch any active temporary/time-limited bans
          try {
            const allUsersSnap = await getDocs(query(collection(db, "users"), limit(300)));
            allUsersSnap.docs.forEach((d: any) => {
              const uData = d.data();
              if (isUserBlockedOrBanned({ ...uData, id: d.id })) {
                userMap.set(d.id, { ...uData, id: d.id });
              }
            });
          } catch (e) {
            console.warn("Could not query all users for ban check:", e);
          }

          const blockedUsersData = Array.from(userMap.values()).filter((u: any) =>
            isUserBlockedOrBanned(u)
          );
          
          // Sort by blockedAt, bannedAt, or updatedAt timestamp (newest first)
          blockedUsersData.sort((a: any, b: any) => {
            const timeA = a.blockedAt?.seconds || a.bannedAt?.seconds || a.updatedAt?.seconds || 0;
            const timeB = b.blockedAt?.seconds || b.bannedAt?.seconds || b.updatedAt?.seconds || 0;
            return timeB - timeA;
          });
          setBlockedUsers(blockedUsersData);
        } catch (err) {
          console.error("Error fetching blocked/banned accounts:", err);
          setBlockedUsers([]);
        }
      } else if (activeTab === "pausedAccounts") {
        try {
          const q1 = query(collection(db, "users"), where("isPaused", "==", true));
          const q2 = query(collection(db, "users"), where("accountStatus", "==", "paused"));
          const q3 = query(collection(db, "users"), where("status", "==", "PAUSED"));
          const q4 = query(collection(db, "users"), where("status", "==", "paused"));
          const q5 = query(collection(db, "users"), where("isPausedByAdmin", "==", true));
          const q6 = query(collection(db, "users"), where("isPausedBySeller", "==", true));
          const q7 = query(collection(db, "users"), where("moderationStatus", "==", "PAUSED"));
          const q8 = query(collection(db, "users"), where("moderationStatus", "==", "paused"));

          // Also query Battle Bids & listings where seller was paused via account hold
          const qAuctions = query(collection(db, "arena_auctions"), where("pausedByAccountHold", "==", true));
          const qListings = query(collection(db, "listings"), where("pausedByAccountHold", "==", true));

          const [snap1, snap2, snap3, snap4, snap5, snap6, snap7, snap8, snapAuctions, snapListings] = await Promise.all([
            getDocs(q1).catch(() => ({ docs: [] })),
            getDocs(q2).catch(() => ({ docs: [] })),
            getDocs(q3).catch(() => ({ docs: [] })),
            getDocs(q4).catch(() => ({ docs: [] })),
            getDocs(q5).catch(() => ({ docs: [] })),
            getDocs(q6).catch(() => ({ docs: [] })),
            getDocs(q7).catch(() => ({ docs: [] })),
            getDocs(q8).catch(() => ({ docs: [] })),
            getDocs(qAuctions).catch(() => ({ docs: [] })),
            getDocs(qListings).catch(() => ({ docs: [] })),
          ]);

          const userMap = new Map();
          const processDoc = (d: any) => {
            const uData = { ...d.data(), id: d.id };
            // Authoritative verification: only active paused accounts, strictly excluding expired or unpaused accounts
            if (isUserPaused(uData)) {
              userMap.set(d.id, uData);
            }
          };

          [snap1, snap2, snap3, snap4, snap5, snap6, snap7, snap8].forEach((snap: any) => {
            snap.docs?.forEach((d: any) => processDoc(d));
          });

          // Resolve sellers from Battle Bids / listings with pausedByAccountHold
          const sellerIdsToFetch = new Set<string>();
          snapAuctions.docs?.forEach((d: any) => {
            const sId = d.data()?.sellerId;
            if (sId && !userMap.has(sId)) sellerIdsToFetch.add(sId);
          });
          snapListings.docs?.forEach((d: any) => {
            const sId = d.data()?.sellerId || d.data()?.ownerId || d.data()?.userId;
            if (sId && !userMap.has(sId)) sellerIdsToFetch.add(sId);
          });

          if (sellerIdsToFetch.size > 0) {
            const sellerDocs = await Promise.all(
              Array.from(sellerIdsToFetch).map((sId) => getDoc(doc(db, "users", sId)).catch(() => null))
            );
            sellerDocs.forEach((sDoc) => {
              if (sDoc && sDoc.exists()) {
                processDoc(sDoc);
              }
            });
          }

          // Check recently active users to catch any active pause state
          try {
            const allUsersSnap = await getDocs(query(collection(db, "users"), limit(300)));
            allUsersSnap.docs.forEach((d: any) => {
              processDoc(d);
            });
          } catch (e) {
            console.warn("Could not query all users for pause check:", e);
          }

          const pausedUsersData = Array.from(userMap.values());

          // Sort by pausedAt or updatedAt timestamp (newest first)
          pausedUsersData.sort((a: any, b: any) => {
            const timeA = a.pausedAt?.seconds || a.updatedAt?.seconds || 0;
            const timeB = b.pausedAt?.seconds || b.updatedAt?.seconds || 0;
            return timeB - timeA;
          });
          setPausedUsers(pausedUsersData);
        } catch (err) {
          console.error("Error fetching paused accounts:", err);
          setPausedUsers([]);
        }
      } else if (activeTab === "creditApplications") {
        try {
          const qApps = query(
            collection(db, "credit_applications"),
            orderBy("createdAt", "desc")
          );
          const snap = await getDocs(qApps);
          setCreditApplications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (e) {
          console.error("Error fetching credit_applications:", e);
        }
      } else if (activeTab === "broadcast") {
        setBroadcastLoadingHistory(true);
        try {
          const q = query(
            collection(db, "broadcasts"),
            orderBy("createdAt", "desc"),
            limit(50)
          );
          const snap = await getDocs(q);
          setBroadcastHistory(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as BroadcastRecord));
        } catch (err) {
          try {
            const snap = await getDocs(query(collection(db, "broadcasts"), limit(50)));
            const items = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as BroadcastRecord);
            items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setBroadcastHistory(items);
          } catch (e) {
            console.error("Error fetching broadcast history:", e);
            setBroadcastHistory([]);
          }
        } finally {
          setBroadcastLoadingHistory(false);
        }
      } else if (activeTab === "authAdmins") {
        if (!isAdmin) {
          setAuthAdmins([]);
          setAuthVerifiers([]);
          return;
        }
        // Fetch Authorized Admins
        const snapshot = await getDocs(collection(db, "authorizedAdmins"));
        const rawAdmins = snapshot.docs.map(
          (d) => ({ ...d.data(), id: d.id }) as AuthorizedAdminEmail,
        );
        const adminsWithProfiles = await Promise.all(rawAdmins.map(async (adm) => {
          let name = "";
          let profileImage = "";
          let userProfile: any = null;
          try {
            const userQ = query(collection(db, "users"), where("email", "==", adm.email));
            const userSnap = await getDocs(userQ);
            if (!userSnap.empty) {
              const uDoc = userSnap.docs[0];
              const uData = uDoc.data();
              name = uData.name || uData.displayName || "";
              profileImage = uData.profileImage || uData.photoURL || "";
              userProfile = { ...uData, id: uDoc.id };
            }
          } catch (e) {
            console.error("Error fetching admin user profile:", e);
          }
          return {
            ...adm,
            name,
            profileImage,
            userProfile
          };
        }));
        setAuthAdmins(adminsWithProfiles);

        // Fetch Authorized Payment Verifiers
        try {
          const verifiersSnapshot = await getDocs(collection(db, "authorizedPaymentVerifiers"));
          const rawVerifiers = verifiersSnapshot.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as any,
          );
          const verifiersWithProfiles = await Promise.all(rawVerifiers.map(async (ver) => {
            let name = "";
            let profileImage = "";
            let userProfile: any = null;
            try {
              const userQ = query(collection(db, "users"), where("email", "==", ver.email));
              const userSnap = await getDocs(userQ);
              if (!userSnap.empty) {
                const uDoc = userSnap.docs[0];
                const uData = uDoc.data();
                name = uData.name || uData.displayName || "";
                profileImage = uData.profileImage || uData.photoURL || "";
                userProfile = { ...uData, id: uDoc.id };
              }
            } catch (e) {
              console.error("Error fetching admin user profile:", e);
            }
            return {
              ...ver,
              name,
              profileImage,
              userProfile
            };
          }));
          setAuthVerifiers(verifiersWithProfiles);
        } catch (verErr) {
          console.error("Error loading authorized payment verifiers:", verErr);
          setAuthVerifiers([]);
        }
      } else if (activeTab === "paymentVerifiers") {
        if (!isAdmin && !isSuperAdmin && !isAuthorizedAdmin && !isAuthorizedPaymentVerifier) {
          setPendingVerifications([]);
          setPromotionRequests([]);
          setAllVerifyApplications([]);
          setAllPaymentPromotions([]);
          return;
        }
        try {
          // 1. Fetch pending verified badge application users
          const badgeQ = query(
            collection(db, "users"),
            where("verifiedBadgeRequestStatus", "==", "PENDING"),
          );
          const badgeSnap = await getDocs(badgeQ);
          setPendingVerifications(
            badgeSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as UserProfile)
          );

          // 2. Fetch pending promotion requests
          const promoQ = query(
            collection(db, "promotionRequests"),
            where("status", "==", "PENDING"),
            orderBy("createdAt", "desc"),
            limit(100)
          );
          const promoSnap = await getDocs(promoQ);
          setPromotionRequests(
            promoSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as PromotionRequest)
          );

          // 3. Fetch ALL verification applications for deep stats
          const vAppQ = query(collection(db, "verification_applications"));
          const vAppSnap = await getDocs(vAppQ);
          setAllVerifyApplications(vAppSnap.docs.map(d => ({ ...d.data(), id: d.id })));

          // 4. Fetch ALL promotion requests for deep stats
          const pAppQ = query(collection(db, "promotionRequests"));
          const pAppSnap = await getDocs(pAppQ);
          setAllPaymentPromotions(pAppSnap.docs.map(d => ({ ...d.data(), id: d.id })));

          // 5. Fetch Authorized Admins
          try {
            const adminSnap = await getDocs(collection(db, "authorizedAdmins"));
            const rawAdmins = adminSnap.docs.map(d => ({ ...d.data(), id: d.id }) as any);
            const adminsWithProfiles = await Promise.all(rawAdmins.map(async (adm) => {
              let name = "";
              let profileImage = "";
              try {
                const userQ = query(collection(db, "users"), where("email", "==", adm.email));
                const userSnap = await getDocs(userQ);
                if (!userSnap.empty) {
                  const uDoc = userSnap.docs[0];
                  const uData = uDoc.data();
                  name = uData.name || uData.displayName || "";
                  profileImage = uData.profileImage || uData.photoURL || "";
                }
              } catch (e) {}
              return { ...adm, name, profileImage };
            }));
            setAuthAdmins(adminsWithProfiles);
          } catch (admErr) {
            console.error("Error loading admins for payment verifiers tracking:", admErr);
          }

          // 6. Fetch Authorized Payment Verifiers
          try {
            const verifiersSnapshot = await getDocs(collection(db, "authorizedPaymentVerifiers"));
            const rawVerifiers = verifiersSnapshot.docs.map(d => ({ ...d.data(), id: d.id }) as any);
            const verifiersWithProfiles = await Promise.all(rawVerifiers.map(async (ver) => {
              let name = "";
              let profileImage = "";
              try {
                const userQ = query(collection(db, "users"), where("email", "==", ver.email));
                const userSnap = await getDocs(userQ);
                if (!userSnap.empty) {
                  const uDoc = userSnap.docs[0];
                  const uData = uDoc.data();
                  name = uData.name || uData.displayName || "";
                  profileImage = uData.profileImage || uData.photoURL || "";
                }
              } catch (e) {}
              return { ...ver, name, profileImage };
            }));
            setAuthVerifiers(verifiersWithProfiles);
          } catch (verErr) {
            console.error("Error loading verifiers for payment verifiers tracking:", verErr);
          }
        } catch (pvFetchErr) {
          console.error("Error loading payment verification records:", pvFetchErr);
        }
      } else if (activeTab === "support") {
        const q = query(
          collection(db, "supportTickets"),
          orderBy("createdAt", "desc"),
          limit(100)
        );
        const snapshot = await getDocs(q);
        setSupportTickets(
          snapshot.docs.map((d) => ({ ...d.data(), id: d.id })),
        );
      } else if (activeTab === "promotions" || activeTab === "appeals") {
        const q = query(
          collection(db, "promotionRequests"),
          orderBy("createdAt", "desc"),
          limit(100)
        );
        const snapshot = await getDocs(q);
        const allReqs = snapshot.docs.map(
          (d) => ({ ...d.data(), id: d.id }) as PromotionRequest,
        );

        const fortyFiveDaysMs = 45 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        const validReqs: PromotionRequest[] = [];

        for (const req of allReqs) {
          if (req.status === "APPROVED") {
            const updatedAtDate =
              req.updatedAt?.toDate?.() ||
              new Date(req.updatedAt?.seconds * 1000 || req.updatedAt);
            if (updatedAtDate && !isNaN(updatedAtDate.getTime())) {
              if (now - updatedAtDate.getTime() > fortyFiveDaysMs) {
                try {
                  await deleteDoc(doc(db, "promotionRequests", req.id));
                  console.log(
                    `Permanently removed approved promotion request ${req.id} older than 45 days.`,
                  );
                } catch (delErr) {
                  console.warn(
                    "Auto-deletion of old approved promotion failed:",
                    delErr,
                  );
                }
                continue;
              }
            }
          }
          validReqs.push(req);
        }
        setPromotionRequests(validReqs);

        if (activeTab === "appeals") {
          try {
            const kycQ = query(
              collection(db, "kyc_applications"),
              limit(100),
            );
            const kycSnap = await getDocs(kycQ);
            let apps = kycSnap.docs.map(
              (d) => ({
                ...(d.data() as any),
                id: d.id,
                userId: d.data().userId || d.id
              }) as KycApplication,
            );
            apps.sort((a, b) => {
              const timeA = new Date((a as any).submittedAt?.toDate?.() || a.submittedAt || (a as any).createdAt?.toDate?.() || (a as any).createdAt || 0).getTime();
              const timeB = new Date((b as any).submittedAt?.toDate?.() || b.submittedAt || (b as any).createdAt?.toDate?.() || (b as any).createdAt || 0).getTime();
              return timeB - timeA;
            });
            setKycApplications(apps);
          } catch (e) {
            console.error("Failed to fetch kyc_applications for appeals:", e);
          }
        }
      } else if (activeTab === "kycVerifications") {
        try {
          const kycQ = query(
            collection(db, "kyc_applications"),
            limit(200),
          );
          const snapshot = await getDocs(kycQ);
          let apps = snapshot.docs.map(
            (d) => ({
              ...(d.data() as any),
              id: d.id,
              userId: d.data().userId || d.id
            }) as KycApplication,
          );
          // Sort descending by submittedAt or createdAt
          apps.sort((a, b) => {
            const timeA = new Date((a as any).submittedAt?.toDate?.() || a.submittedAt || (a as any).createdAt?.toDate?.() || (a as any).createdAt || 0).getTime();
            const timeB = new Date((b as any).submittedAt?.toDate?.() || b.submittedAt || (b as any).createdAt?.toDate?.() || (b as any).createdAt || 0).getTime();
            return timeB - timeA;
          });
          if (kycStatusFilter !== "ALL") {
            apps = apps.filter((app) => app.status === kycStatusFilter);
          }
          setKycApplications(apps);
        } catch (e) {
          console.error("Failed to fetch kyc_applications from Firestore:", e);
          setKycApplications([]);
        }
      } else if (activeTab === "nameRequests") {
        try {
          const q = query(
            collection(db, "name_change_requests"),
            orderBy("createdAt", "desc"),
            limit(150),
          );
          const snapshot = await getDocs(q);
          setNameChangeRequests(
            snapshot.docs.map(
              (d) => ({ ...(d.data() as any), id: d.id }) as NameChangeRequest,
            ),
          );
        } catch (e) {
          console.warn(
            "Firestore name_change_requests fetch failed, search offline local:",
            e,
          );
          const keys = Object.keys(localStorage);
          const localNC: NameChangeRequest[] = [];
          for (const k of keys) {
            if (k.startsWith("name_change_")) {
              try {
                const nc = JSON.parse(localStorage.getItem(k) || "");
                if (nc) localNC.push(nc);
              } catch {}
            }
          }
          setNameChangeRequests(localNC);
        }
      } else if (activeTab === "adminOverview") {
        // Data for admin overview will be fetched here
        setLoading(false);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, activeTab);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin || isSuperAdmin || isAuthorizedAdmin || isAuthorizedPaymentVerifier) fetchData();
    // Scroll to top when tab changes
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [isAdmin, isSuperAdmin, isAuthorizedAdmin, isAuthorizedPaymentVerifier, activeTab, applicationsStatusFilter, kycStatusFilter]);

  // Keep sessionStorage updated with admin active tab
  useEffect(() => {
    try {
      sessionStorage.setItem("admin_active_tab", activeTab);
    } catch (e) {}
  }, [activeTab]);

  // Track detail selection states inside sessionStorage so they are preserved
  useEffect(() => {
    try {
      if (selectedSupportTicket) {
        sessionStorage.setItem("admin_selected_ticket_id", selectedSupportTicket.id || "");
      } else {
        sessionStorage.removeItem("admin_selected_ticket_id");
      }
    } catch (e) {}
  }, [selectedSupportTicket]);

  useEffect(() => {
    try {
      if (selectedListingDetail) {
        sessionStorage.setItem("admin_selected_listing_id", selectedListingDetail.id || "");
      } else {
        sessionStorage.removeItem("admin_selected_listing_id");
      }
    } catch (e) {}
  }, [selectedListingDetail]);

  useEffect(() => {
    try {
      if (selectedPromotion) {
        sessionStorage.setItem("admin_selected_promotion_id", selectedPromotion.id || "");
      } else {
        sessionStorage.removeItem("admin_selected_promotion_id");
      }
    } catch (e) {}
  }, [selectedPromotion]);

  useEffect(() => {
    try {
      if (selectedKycApplication) {
        sessionStorage.setItem("admin_selected_kyc_id", selectedKycApplication.id || "");
      } else {
        sessionStorage.removeItem("admin_selected_kyc_id");
        setConfirmAction(null);
      }
    } catch (e) {}
  }, [selectedKycApplication]);

  useEffect(() => {
    try {
      if (selectedNameRequest) {
        sessionStorage.setItem("admin_selected_name_req_id", selectedNameRequest.id || "");
      } else {
        sessionStorage.removeItem("admin_selected_name_req_id");
      }
    } catch (e) {}
  }, [selectedNameRequest]);

  // Restore selection states after collections loaded
  useEffect(() => {
    if (activeTab === "support" && supportTickets && supportTickets.length > 0) {
      let savedId = null;
      try {
        savedId = sessionStorage.getItem("admin_selected_ticket_id");
      } catch (e) {}
      if (savedId && (!selectedSupportTicket || selectedSupportTicket.id !== savedId)) {
        const found = supportTickets.find((t) => t.id === savedId);
        if (found) setSelectedSupportTicket(found);
      }
    }
  }, [supportTickets, activeTab, selectedSupportTicket]);

  useEffect(() => {
    if (activeTab === "promotions" && promotionRequests && promotionRequests.length > 0) {
      let savedId = null;
      try {
        savedId = sessionStorage.getItem("admin_selected_promotion_id");
      } catch (e) {}
      if (savedId && (!selectedPromotion || selectedPromotion.id !== savedId)) {
        const found = promotionRequests.find((p) => p.id === savedId);
        if (found) setSelectedPromotion(found);
      }
    }
  }, [promotionRequests, activeTab, selectedPromotion]);

  useEffect(() => {
    if (activeTab === "kycVerifications" && kycApplications && kycApplications.length > 0) {
      let savedId = null;
      try {
        savedId = sessionStorage.getItem("admin_selected_kyc_id");
      } catch (e) {}
      if (savedId && (!selectedKycApplication || selectedKycApplication.id !== savedId)) {
        const found = kycApplications.find((a) => a.id === savedId);
        if (found) setSelectedKycApplication(found);
      }
    }
  }, [kycApplications, activeTab, selectedKycApplication]);

  useEffect(() => {
    if (activeTab === "nameRequests" && nameChangeRequests && nameChangeRequests.length > 0) {
      let savedId = null;
      try {
        savedId = sessionStorage.getItem("admin_selected_name_req_id");
      } catch (e) {}
      if (savedId && (!selectedNameRequest || selectedNameRequest.id !== savedId)) {
        const found = nameChangeRequests.find((r) => r.id === savedId);
        if (found) setSelectedNameRequest(found);
      }
    }
  }, [nameChangeRequests, activeTab, selectedNameRequest]);

  // Lazy loading to restore selected listing detail when returning
  useEffect(() => {
    let savedListingId = null;
    try {
      savedListingId = sessionStorage.getItem("admin_selected_listing_id");
    } catch (e) {}
    if (savedListingId && !selectedListingDetail) {
      const fetchSavedListing = async () => {
        try {
          const lDoc = await getDoc(doc(db, "listings", savedListingId!));
          if (lDoc.exists()) {
            setSelectedListingDetail({ ...lDoc.data(), id: lDoc.id } as Listing);
          }
        } catch (e) {
          console.error("Error restoring saved listing detail:", e);
        }
      };
      fetchSavedListing();
    }
  }, [selectedListingDetail]);

  const saveAdminStateAndNavigate = (url: string) => {
    try {
      sessionStorage.setItem("admin_close_to", "/admin");
      sessionStorage.setItem("admin_active_tab", activeTab);

      if (selectedSupportTicket) {
        sessionStorage.setItem("admin_selected_ticket_id", selectedSupportTicket.id || "");
      }
      if (selectedListingDetail) {
        sessionStorage.setItem("admin_selected_listing_id", selectedListingDetail.id || "");
      }
      if (selectedPromotion) {
        sessionStorage.setItem("admin_selected_promotion_id", selectedPromotion.id || "");
      }
      if (selectedKycApplication) {
        sessionStorage.setItem("admin_selected_kyc_id", selectedKycApplication.id || "");
      }
      if (selectedNameRequest) {
        sessionStorage.setItem("admin_selected_name_req_id", selectedNameRequest.id || "");
      }
    } catch (e) {}

    navigate(url);
  };

  // KYC Approve action
  const handleKycApprove = async (
    appId: string,
    userId: string,
    category: "INDIVIDUAL" | "BUSINESS",
    approvedName: string,
  ) => {
    const finalUserId = userId || appId;
    const finalName = approvedName || "Verified User";
    setConfirmAction({
      message: `Are you sure you want to approve this KYC application for ${finalName}? This will update their verified status, lock their profile name, and issue the blue tick verification badge.`,
      onConfirm: async () => {
        setKycActionSubmitting(true);
        try {
          // 1. Authoritative atomic batch write to Firestore
          const batch = writeBatch(db);
          batch.set(doc(db, "kyc_applications", appId), {
            status: "APPROVED",
            approvedAt: serverTimestamp(),
            history: arrayUnion({
              action: "Accepted",
              status: "APPROVED",
              timestamp: new Date().toISOString(),
              reason: "KYC Application accepted and verified by Compliance Administrator."
            })
          }, { merge: true });
          if (finalUserId && finalUserId !== appId) {
            batch.set(doc(db, "kyc_applications", finalUserId), {
              status: "APPROVED",
              approvedAt: serverTimestamp(),
              history: arrayUnion({
                action: "Accepted",
                status: "APPROVED",
                timestamp: new Date().toISOString(),
                reason: "KYC Application accepted and verified by Compliance Administrator."
              })
            }, { merge: true });
          }
          batch.set(doc(db, "kyc_private", finalUserId), {
            kycStatus: "APPROVED",
            approvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
          batch.set(doc(db, "users", finalUserId), {
            kycStatus: "APPROVED",
            isKycVerified: true,
            isVerified: true,
            kycType: category,
            kycApprovedName: finalName,
            name: finalName, // locks Name change to approved name as requested
          }, { merge: true });
          await batch.commit();
          // Dispatch notification
          const notifRef = doc(collection(db, "notifications"));
          await setDoc(notifRef, {
            id: notifRef.id,
            userId: finalUserId,
            title: "KYC Account Verified! 🎉",
            message: `Congratulations! Your identity has been verified as ${category}. You have unlocked the verified blue tick badge!`,
            read: false,
            createdAt: serverTimestamp(),
          });

          // 2. Immediate React State update for snappy UI
          setKycApplications((prev) =>
            prev.map((a) =>
              a.id === appId || a.userId === finalUserId
                ? {
                    ...a,
                    status: "APPROVED",
                    history: [
                      ...(a.history || []),
                      {
                        action: "Accepted",
                        status: "APPROVED",
                        timestamp: new Date().toISOString(),
                        reason: "KYC Application accepted and verified by Compliance Administrator."
                      }
                    ]
                  }
                : a
            )
          );

          setKycModalAlert({
            title: "Verification Approved",
            message: `KYC verification approved successfully! Profile name is locked as: "${finalName}".`,
            type: "success",
          });
          setSelectedKycApplication(null);
          fetchData();
        } catch (err: any) {
          setKycModalAlert({
            title: "Error Occurred",
            message: err.message || "Failed to approve application.",
            type: "error",
          });
        } finally {
          setKycActionSubmitting(false);
        }
      },
    });
  };

  // KYC Reject action
  const handleKycReject = async (
    appId: string,
    userId: string,
    reasonText: string,
  ) => {
    const finalUserId = userId || appId;
    const trimmedReason = reasonText?.trim() || "";
    if (!trimmedReason) {
      setKycModalAlert({
        title: "Reason Required",
        message: "Please write a reason to take action.",
        type: "error",
      });
      return;
    }
    setConfirmAction({
      message: `Are you sure you want to decline this KYC application? Reason: "${trimmedReason}"`,
      onConfirm: async () => {
        setKycActionSubmitting(true);
        try {
          // 1. Authoritative atomic batch write to Firestore
          const batch = writeBatch(db);
          batch.set(doc(db, "kyc_applications", appId), {
            status: "REJECTED",
            rejectionReason: trimmedReason,
            rejectedAt: serverTimestamp(),
            history: arrayUnion({
              action: "Rejected",
              status: "REJECTED",
              timestamp: new Date().toISOString(),
              reason: trimmedReason
            })
          }, { merge: true });
          if (finalUserId && finalUserId !== appId) {
            batch.set(doc(db, "kyc_applications", finalUserId), {
              status: "REJECTED",
              rejectionReason: trimmedReason,
              rejectedAt: serverTimestamp(),
              history: arrayUnion({
                action: "Rejected",
                status: "REJECTED",
                timestamp: new Date().toISOString(),
                reason: trimmedReason
              })
            }, { merge: true });
          }
          batch.set(doc(db, "kyc_private", finalUserId), {
            kycStatus: "REJECTED",
            rejectionReason: trimmedReason,
            rejectedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
          batch.set(doc(db, "users", finalUserId), {
            kycStatus: "REJECTED",
            isKycVerified: false,
            isVerified: false,
            isPremiumVerified: false,
            kycRejectionReason: trimmedReason,
          }, { merge: true });
          await batch.commit();
          // Dispatch notification
          const notifRef = doc(collection(db, "notifications"));
          await setDoc(notifRef, {
            id: notifRef.id,
            userId: finalUserId,
            title: "KYC Application Declined ⚠️",
            message: `Your KYC account verification was rejected. Reason: ${trimmedReason}`,
            read: false,
            createdAt: serverTimestamp(),
          });

          // Immediate React State update for snappy UI
          setKycApplications((prev) =>
            prev.map((a) =>
              a.id === appId || a.userId === finalUserId
                ? {
                    ...a,
                    status: "REJECTED",
                    rejectionReason: trimmedReason,
                    history: [
                      ...(a.history || []),
                      {
                        action: "Rejected",
                        status: "REJECTED",
                        timestamp: new Date().toISOString(),
                        reason: trimmedReason
                      }
                    ]
                  }
                : a
            )
          );

          // Reset the text field state for this ID
          setKycRejectionInputs((prev) => {
            const copy = { ...prev };
            delete copy[appId];
            delete copy[finalUserId];
            return copy;
          });

          setKycModalAlert({
            title: "Application Declined",
            message:
              "The identity verification application has been rejected and marked clearly.",
            type: "success",
          });
          setSelectedKycApplication(null);
          fetchData();
        } catch (err: any) {
          setKycModalAlert({
            title: "Error Occurred",
            message: err.message || "Failed to reject application.",
            type: "error",
          });
        } finally {
          setKycActionSubmitting(false);
        }
      },
    });
  };

  // Authoritative Accept KYC Appeal action
  const handleAcceptKycAppeal = async (app: KycApplication) => {
    const targetUserId = app.userId || app.id;
    const appId = app.id || targetUserId;
    setKycActionSubmitting(true);
    try {
      const result = await executeAcceptKycAppealAuthoritative(
        db,
        app,
        user?.email || "Compliance Admin"
      );

      setKycApplications((prev) =>
        prev.map((a) =>
          a.id === appId || a.userId === targetUserId
            ? {
                ...a,
                status: "APPROVED",
                appealStatus: "APPROVED",
                revocationReason: "",
                history: [...(a.history || []), result.historyEntry],
              }
            : a
        )
      );

      setKycModalAlert({
        title: "Appeal Accepted 🎉",
        message: `KYC appeal for ${result.finalName || "the user"} has been accepted and verified Blue Tick status has been restored.`,
        type: "success",
      });
      setSelectedKycApplication(null);
      fetchData();
    } catch (err: any) {
      console.error("Accept KYC appeal error:", err);
      setKycModalAlert({
        title: "Error Occurred",
        message: err.message || "Failed to accept KYC appeal.",
        type: "error",
      });
    } finally {
      setKycActionSubmitting(false);
    }
  };

  // Authoritative Reject KYC Appeal action
  const handleRejectKycAppeal = async (
    app: KycApplication,
    reasonText: string
  ) => {
    const trimmedReason = reasonText?.trim() || "";
    if (!trimmedReason) {
      setKycModalAlert({
        title: "Reason Required",
        message: "Please write a reason to reject this appeal.",
        type: "error",
      });
      return;
    }
    const targetUserId = app.userId || app.id;
    const appId = app.id || targetUserId;
    setKycActionSubmitting(true);
    try {
      const result = await executeRejectKycAppealAuthoritative(
        db,
        app,
        trimmedReason,
        user?.email || "Compliance Admin"
      );

      setKycApplications((prev) =>
        prev.map((a) =>
          a.id === appId || a.userId === targetUserId
            ? {
                ...a,
                status: "REVOKED",
                appealStatus: "REJECTED",
                appealRejectionReason: trimmedReason,
                history: [...(a.history || []), result.historyEntry],
              }
            : a
        )
      );

      setKycModalAlert({
        title: "Appeal Rejected",
        message: `KYC appeal for ${result.finalName || "the user"} has been rejected. The user may submit a fresh KYC application.`,
        type: "success",
      });
      setKycAppealReasonModal({ isOpen: false, app: null, reason: "" });
      setSelectedKycApplication(null);
      fetchData();
    } catch (err: any) {
      console.error("Reject KYC appeal error:", err);
      setKycModalAlert({
        title: "Error Occurred",
        message: err.message || "Failed to reject KYC appeal.",
        type: "error",
      });
    } finally {
      setKycActionSubmitting(false);
    }
  };

  // KYC Reject Appeal action (Backwards compatible fallback)
  const handleKycRejectAppeal = async (
    appId: string,
    userId: string,
    reasonText: string,
  ) => {
    const finalUserId = userId || appId;
    const trimmedReason = reasonText?.trim() || "";
    if (!trimmedReason) {
      setKycModalAlert({
        title: "Reason Required",
        message: "Please write a reason to take action.",
        type: "error",
      });
      return;
    }
    setConfirmAction({
      message: `Are you sure you want to reject this KYC appeal? Reason: "${trimmedReason}"`,
      onConfirm: async () => {
        setKycActionSubmitting(true);
        try {
          // 1. Authoritative atomic batch write to Firestore
          const batch = writeBatch(db);
          batch.set(doc(db, "kyc_applications", appId), {
            status: "REVOKED",
            appealRejectionReason: trimmedReason,
            appealRejectedAt: serverTimestamp(),
            history: arrayUnion({
              action: "Appeal Rejected",
              status: "REVOKED",
              timestamp: new Date().toISOString(),
              reason: trimmedReason
            })
          }, { merge: true });
          // Note: Redundant batch write to doc(db, "kyc_applications", finalUserId) removed
          batch.set(doc(db, "kyc_private", finalUserId), {
            kycStatus: "REVOKED",
            appealRejectionReason: trimmedReason,
            appealRejectedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
          batch.set(doc(db, "users", finalUserId), {
            kycStatus: "REVOKED",
          }, { merge: true });
          await batch.commit();
          // Dispatch notification
          const notifRef = doc(collection(db, "notifications"));
          await setDoc(notifRef, {
            id: notifRef.id,
            userId: finalUserId,
            title: "KYC Appeal Declined ⚠️",
            message: `Your appeal for KYC verification restoration was rejected. Reason: ${trimmedReason}`,
            read: false,
            createdAt: serverTimestamp(),
          });

          // Immediate React State update for snappy UI
          setKycApplications((prev) =>
            prev.map((a) =>
              a.id === appId || a.userId === finalUserId
                ? {
                    ...a,
                    status: "REVOKED",
                    appealRejectionReason: trimmedReason,
                    history: [
                      ...(a.history || []),
                      {
                        action: "Appeal Rejected",
                        status: "REVOKED",
                        timestamp: new Date().toISOString(),
                        reason: trimmedReason
                      }
                    ]
                  }
                : a
            )
          );

          // Reset the text field state for this ID
          setKycRejectionInputs((prev) => {
            const copy = { ...prev };
            delete copy[appId];
            delete copy[finalUserId];
            return copy;
          });

          setKycModalAlert({
            title: "Appeal Declined",
            message:
              "The appeal for restoration has been rejected and verification remains revoked.",
            type: "success",
          });
          setSelectedKycApplication(null);
          fetchData();
        } catch (err: any) {
          setKycModalAlert({
            title: "Error Occurred",
            message: err.message || "Failed to reject appeal.",
            type: "error",
          });
        } finally {
          setKycActionSubmitting(false);
        }
      },
    });
  };

  // KYC Revoke action
  const handleKycRevoke = async (
    appId: string,
    userId: string,
    reasonText: string,
  ) => {
    const finalUserId = userId || appId;
    const trimmedReason = reasonText?.trim() || "";
    if (!trimmedReason) {
      setKycModalAlert({
        title: "Reason Required",
        message: "Please write a reason to take action.",
        type: "error",
      });
      return;
    }
    setConfirmAction({
      message: `Are you sure you want to revoke this user's KYC verification entirely? Reason: "${trimmedReason}"`,
      onConfirm: async () => {
        setKycActionSubmitting(true);
        try {
          // 1. Authoritative atomic batch write to Firestore
          const batch = writeBatch(db);
          batch.set(doc(db, "kyc_applications", appId), {
            status: "REVOKED",
            revocationReason: trimmedReason,
            revokedAt: serverTimestamp(),
            history: arrayUnion({
              action: "Revoked",
              status: "REVOKED",
              timestamp: new Date().toISOString(),
              reason: trimmedReason
            })
          }, { merge: true });
          if (finalUserId && finalUserId !== appId) {
            batch.set(doc(db, "kyc_applications", finalUserId), {
              status: "REVOKED",
              revocationReason: trimmedReason,
              revokedAt: serverTimestamp(),
              history: arrayUnion({
                action: "Revoked",
                status: "REVOKED",
                timestamp: new Date().toISOString(),
                reason: trimmedReason
              })
            }, { merge: true });
          }
          batch.set(doc(db, "kyc_private", finalUserId), {
            kycStatus: "REVOKED",
            revocationReason: trimmedReason,
            revokedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
          batch.set(doc(db, "users", finalUserId), {
            kycStatus: "REVOKED",
            isKycVerified: false,
            isVerified: false,
            isPremiumVerified: false,
            kycRevocationReason: trimmedReason,
          }, { merge: true });
          await batch.commit();
          // Dispatch notification
          const notifRef = doc(collection(db, "notifications"));
          await setDoc(notifRef, {
            id: notifRef.id,
            userId: finalUserId,
            title: "Verification Revoked ❌",
            message: `Your account level KYC verification status was suspended by admin. Reason: ${trimmedReason}`,
            read: false,
            createdAt: serverTimestamp(),
          });

          // Immediate React State update for snappy UI
          setKycApplications((prev) =>
            prev.map((a) =>
              a.id === appId || a.userId === finalUserId
                ? {
                    ...a,
                    status: "REVOKED",
                    revocationReason: trimmedReason,
                    history: [
                      ...(a.history || []),
                      {
                        action: "Revoked",
                        status: "REVOKED",
                        timestamp: new Date().toISOString(),
                        reason: trimmedReason
                      }
                    ]
                  }
                : a
            )
          );

          // Clean up local input
          setKycRevocationInputs((prev) => {
            const copy = { ...prev };
            delete copy[appId];
            delete copy[finalUserId];
            return copy;
          });

          setKycModalAlert({
            title: "Verification Revoked",
            message:
              "The user's identity verification status has been successfully revoked.",
            type: "success",
          });
          setSelectedKycApplication(null);
          fetchData();
        } catch (err: any) {
          setKycModalAlert({
            title: "Error Occurred",
            message: err.message || "Failed to revoke KYC.",
            type: "error",
          });
        } finally {
          setKycActionSubmitting(false);
        }
      },
    });
  };

  // Re-enable / Resume KYC application flow (Allow override for Revoked Status)
  const handleKycResume = async (appId: string, userId: string) => {
    const finalUserId = userId || appId;
    setConfirmAction({
      message:
        "Are you sure you want to resume the user's KYC verification status? This will restore their approved status, verified blue tick badge, and lock their profile name back as usual.",
      onConfirm: async () => {
        setKycActionSubmitting(true);
        try {
          // 1. Authoritative atomic batch write to Firestore
          const batch = writeBatch(db);
          batch.set(doc(db, "kyc_applications", appId), {
            status: "APPROVED",
            resumedAt: serverTimestamp(),
            revocationReason: "",
            history: arrayUnion({
              action: "Resumed",
              status: "APPROVED",
              timestamp: new Date().toISOString(),
              reason: "KYC Verification status resumed by Compliance Administrator."
            })
          }, { merge: true });
          // Note: Redundant batch write to doc(db, "kyc_applications", finalUserId) removed
          batch.set(doc(db, "kyc_private", finalUserId), {
            kycStatus: "APPROVED",
            resumedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
          batch.set(doc(db, "users", finalUserId), {
            kycStatus: "APPROVED",
            isKycVerified: true,
            isVerified: true,
            kycRevocationReason: "",
          }, { merge: true });
          await batch.commit();

          // Notifications
          const notifRef = doc(collection(db, "notifications"));
          await setDoc(notifRef, {
            id: notifRef.id,
            userId: finalUserId,
            title: "KYC Verification Resumed 🎉",
            message:
              "Your KYC verification status has been resumed! You got complete benefits of verified status back.",
            read: false,
            createdAt: serverTimestamp(),
          });

          // Immediate React State update for snappy UI
          setKycApplications((prev) =>
            prev.map((a) =>
              a.id === appId || a.userId === finalUserId
                ? {
                    ...a,
                    status: "APPROVED",
                    revocationReason: "",
                    history: [
                      ...(a.history || []),
                      {
                        action: "Resumed",
                        status: "APPROVED",
                        timestamp: new Date().toISOString(),
                        reason: "KYC Verification status resumed by Compliance Administrator."
                      }
                    ]
                  }
                : a
            )
          );

          setKycModalAlert({
            title: "Verification Resumed",
            message:
              "User's KYC verification has been resumed, restoring standard verified status.",
            type: "success",
          });
          setSelectedKycApplication(null);
          fetchData();
        } catch (err: any) {
          setKycModalAlert({
            title: "Error Occurred",
            message: err.message || "Failed to resume KYC verification.",
            type: "error",
          });
        } finally {
          setKycActionSubmitting(false);
        }
      },
    });
  };

  // Name Change Action handler: APPROVED
  const handleNameChangeApprove = async (req: NameChangeRequest) => {
    if (!window.confirm("Are you sure you want to approve this name change request?")) return;
    setKycActionSubmitting(true);
    try {
      if (
        !(
          typeof window !== "undefined" &&
          (window as any).__firestore_quota_exceeded
        )
      ) {
        try {
          await updateDoc(doc(db, "name_change_requests", req.id), {
            status: "APPROVED",
            approvedAt: serverTimestamp(),
          });
          
          const profileUpdate: any = {
            hasPendingNameChange: false,
          };
          
          if (req.newUsername) {
            profileUpdate.username = req.newUsername;
            if (req.oldUsername && req.oldUsername !== req.newUsername) {
              profileUpdate.pastUsernames = arrayUnion(req.oldUsername);
            }
          }
          if (req.newRealName) profileUpdate.realName = req.newRealName;
          if (req.newBusinessName) profileUpdate.businessName = req.newBusinessName;
          if (req.newEmail) profileUpdate.email = req.newEmail;
          if (req.newBusinessAddress) profileUpdate.businessAddress = req.newBusinessAddress;

          // Also update the display name 'name' if business name is requested
          if (req.newBusinessName) profileUpdate.name = req.newBusinessName;
          else if (req.newRealName) profileUpdate.name = req.newRealName;

          // Synchronize kyc_applications document for user
          try {
            const kycAppUpdate: any = {};
            if (req.newRealName) kycAppUpdate.legalName = req.newRealName;
            if (req.newBusinessName) kycAppUpdate.businessName = req.newBusinessName;
            if (req.newCnicNumber) kycAppUpdate.cnicNumber = req.newCnicNumber;
            if (req.newResidentialAddress) kycAppUpdate.residentialAddress = req.newResidentialAddress;
            if (req.newBusinessAddress) kycAppUpdate.businessAddress = req.newBusinessAddress;

            if (Object.keys(kycAppUpdate).length > 0) {
              await setDoc(doc(db, "kyc_applications", req.userId), kycAppUpdate, { merge: true });
              await setDoc(doc(db, "kyc_private", req.userId), kycAppUpdate, { merge: true });
              
              // Also update user's address field based on kycType
              const userSnap = await getDoc(doc(db, "users", req.userId));
              if (userSnap.exists()) {
                const uData = userSnap.data();
                const kycType = uData.kycType || "INDIVIDUAL";
                if (kycType === "INDIVIDUAL" && req.newResidentialAddress) {
                  profileUpdate.address = req.newResidentialAddress;
                } else if (kycType === "BUSINESS" && req.newBusinessAddress) {
                  profileUpdate.address = req.newBusinessAddress;
                }
              }
            }
          } catch (eKyc) {
            console.error("Failed to sync kyc_applications in handleNameChangeApprove:", eKyc);
          }

          await setDoc(doc(db, "users", req.userId), profileUpdate, { merge: true });

          // Dispatch notification
          const notofRef = doc(collection(db, "notifications"));
          await setDoc(notofRef, {
            id: notofRef.id,
            userId: req.userId,
            title: "Identity Data Updated! ✅",
            message: `Admin has approved your profile data changes. Mandatory identity fields have been updated automatically.`,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (dbErr) {
          console.warn("Firestore name change approve error:", dbErr);
        }
      }

      // Update local storage NC cache
      localStorage.setItem(
        `name_change_${req.userId}`,
        JSON.stringify({ ...req, status: "APPROVED" }),
      );

      // Update local profile
      const cachedProfKey = `user_cache_${req.userId}`;
      const cachedProf = localStorage.getItem(cachedProfKey);
      if (cachedProf) {
        const u = JSON.parse(cachedProf);
        if (req.newUsername) u.username = req.newUsername;
        if (req.newRealName) u.realName = req.newRealName;
        if (req.newBusinessName) u.businessName = req.newBusinessName;
        if (req.newEmail) u.email = req.newEmail;
        if (req.newBusinessAddress) u.businessAddress = req.newBusinessAddress;
        if (req.newBusinessName) u.name = req.newBusinessName;
        else if (req.newRealName) u.name = req.newRealName;
        u.hasPendingNameChange = false;
        localStorage.setItem(cachedProfKey, JSON.stringify(u));
      }

      const localNotifs = JSON.parse(
        localStorage.getItem(`notifs_${req.userId}`) || "[]",
      );
      localNotifs.unshift({
        id: String(Date.now()),
        userId: req.userId,
        title: "Identity Data Updated! ✅",
        message: `Admin has approved your profile data changes. Mandatory identity fields have been updated automatically.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem(`notifs_${req.userId}`, JSON.stringify(localNotifs));

      setSelectedNameRequest(null);
      fetchData();
    } catch (err: any) {
      console.error(err.message || "Failed to approve name change.");
    } finally {
      setKycActionSubmitting(false);
    }
  };

  // Name Change Action handler: REJECTED
  const handleNameChangeReject = async (
    req: NameChangeRequest,
    reason: string,
  ) => {
    if (!window.confirm(`Are you sure you want to reject this name change request? Reason: ${reason}`)) return;
    if (!reason.trim()) {
      console.warn("Please provide a rejection reason.");
      return;
    }
    setKycActionSubmitting(true);
    try {
      if (
        !(
          typeof window !== "undefined" &&
          (window as any).__firestore_quota_exceeded
        )
      ) {
        try {
          await updateDoc(doc(db, "name_change_requests", req.id), {
            status: "REJECTED",
            rejectionReason: reason.trim(),
            rejectedAt: serverTimestamp(),
          });
          await setDoc(doc(db, "users", req.userId), {
            hasPendingNameChange: false,
          }, { merge: true });
          // Dispatch notification
          const notofRef = doc(collection(db, "notifications"));
          await setDoc(notofRef, {
            id: notofRef.id,
            userId: req.userId,
            title: "Name Change Request Declined 📝",
            message: `Your name change request to "${req.newName}" was rejected. Reason: ${reason.trim()}`,
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch (dbErr) {
          console.warn("Firestore name change reject error:", dbErr);
        }
      }

      localStorage.setItem(
        `name_change_${req.userId}`,
        JSON.stringify({ ...req, status: "REJECTED" }),
      );

      const cachedProfKey = `user_cache_${req.userId}`;
      const cachedProf = localStorage.getItem(cachedProfKey);
      if (cachedProf) {
        const u = JSON.parse(cachedProf);
        u.hasPendingNameChange = false;
        localStorage.setItem(cachedProfKey, JSON.stringify(u));
      }

      const localNotifs = JSON.parse(
        localStorage.getItem(`notifs_${req.userId}`) || "[]",
      );
      localNotifs.unshift({
        id: String(Date.now()),
        userId: req.userId,
        title: "Name Change Request Declined 📝",
        message: `Your name change request to "${req.newName}" was rejected. Reason: ${reason.trim()}`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem(`notifs_${req.userId}`, JSON.stringify(localNotifs));

      setSelectedNameRequest(null);
      fetchData();
    } catch (err: any) {
      console.error(err.message || "Failed to reject name change.");
    } finally {
      setKycActionSubmitting(false);
    }
  };

  const updateStatus = async (id: string, newStatus: Listing["status"]) => {
    if (
      !confirm(
        `Are you sure you want to change the listing status to ${newStatus}?`,
      )
    )
      return;
    if (
      !confirm(
        `FINAL CONFIRMATION: Confirm status change for Listing #${id.slice(-5)}?`,
      )
    )
      return;

    try {
      const lDoc = await getDoc(doc(db, "listings", id));
      if (lDoc.exists()) {
        const ownerId = lDoc.data().ownerId;
        const uDoc = await getDoc(doc(db, "users", ownerId));
      }

      await updateDoc(doc(db, "listings", id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      fetchData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `listings/${id}`);
    }
  };

  const handleApplicationAction = async (
    appId: string,
    userId: string,
    action: "APPROVED" | "REJECTED",
    durationDays?: number,
  ) => {
    if (!confirm(`Are you sure you want to ${action} this application?`))
      return;
    try {
      if (action === "APPROVED") {
        const profileRef = doc(db, "users", userId);
        const pSnap = await getDoc(profileRef);
        if (pSnap.exists()) {
          const userData = pSnap.data();
          if (userData.isBlocked === true || userData.accountStatus === "blocked" || userData.accountStatus === "deleted") {
            alert(
              "Cannot approve Premium Seller application: User account is currently blocked.",
            );
            return;
          }
          if (userData.kycStatus !== "APPROVED") {
            alert(
              "Cannot approve Premium Seller application: User KYC is not approved.",
            );
            return;
          }

          // Enforce selected duration from application
          let appDuration = durationDays || 30;
          try {
            const appDoc = await getDoc(doc(db, "verification_applications", appId));
            if (appDoc.exists()) {
              const appData = appDoc.data();
              if (appData.durationDays) {
                appDuration = appData.durationDays;
              }
            }
          } catch (e) {
            console.error("Error reading verification application for duration checking:", e);
          }

          const expirationDate = new Date();
          expirationDate.setDate(
            expirationDate.getDate() + appDuration,
          );

          await updateDoc(profileRef, {
            isVerified: true,
            isPremiumVerified: true,
            verifiedBadgeType: "GOLDEN",
            verifiedUntil: expirationDate,
            verifiedBadgeRequestStatus: "APPROVED",
            verificationStatus: "APPROVED",
            updatedAt: serverTimestamp(),
          });
          
          try {
            await setDoc(doc(collection(db, "adminLogs")), {
              adminId: user?.uid || "unknown_admin",
              adminEmail: user?.email || "Admin",
              adminCode: userProfile?.adminCode || null,
              targetUserId: userId,
              action: "ISSUED_BADGE",
              badgeType: "GOLDEN",
              timestamp: serverTimestamp(),
              reason: "Approved Premium Seller Verification"
            });
          } catch (e) {}
        }
      } else {
        const profileRef = doc(db, "users", userId);
        await setDoc(profileRef, {
          verifiedBadgeRequestStatus: "REJECTED",
          verificationStatus: "REJECTED",
          isPremiumVerified: false,
          updatedAt: serverTimestamp(),
        }, { merge: true });

        try {
          await setDoc(doc(collection(db, "adminLogs")), {
            adminId: user?.uid || "unknown_admin",
            adminEmail: user?.email || "Admin",
            adminCode: userProfile?.adminCode || null,
            targetUserId: userId,
            action: "REJECTED_APPLICATION",
            applicationType: "VERIFICATION",
            timestamp: serverTimestamp(),
            reason: "Rejected Premium Seller Verification"
          });
        } catch (e) {}
      }

      // Update the application status instead of deleting it, preserving history and status checks for the user
      await updateDoc(doc(db, "verification_applications", appId), {
        status: action,
        updatedAt: serverTimestamp()
      });

      // Synchronize in promotionRequests collection
      try {
        const pReqQuery = query(
          collection(db, "promotionRequests"),
          where("userId", "==", userId),
          where("type", "==", "VERIFIED"),
          where("status", "==", "PENDING")
        );
        const pReqSnap = await getDocs(pReqQuery);
        for (const d of pReqSnap.docs) {
          await updateDoc(doc(db, "promotionRequests", d.id), {
            status: action,
            updatedAt: serverTimestamp(),
            approvedAt: action === "APPROVED" ? serverTimestamp() : null,
            rejectedAt: action === "REJECTED" ? serverTimestamp() : null,
          });
        }
      } catch (err) {
        console.warn("Could not sync promotionRequests verified status:", err);
      }

      fetchData();
      alert(
        `Application ${action === "APPROVED" ? "approved" : "rejected"} successfully.`,
      );
    } catch (e) {
      console.error(e);
      alert("Action failed.");
    }
  };

  const adminUpdateBadge = async (listingId: string, badgeType: 'FEATURED' | 'BOOST', activate: boolean, durationDays: number = 7) => {
    if (activate) {
      if (!isSuperAdmin) {
        alert(`Action restricted: Only Super Admin is allowed to directly issue ${badgeType} badges without an application.`);
        return;
      }
      try {
        const listingDocRef = doc(db, 'listings', listingId);
        const lSnap = await getDoc(listingDocRef);
        if (!lSnap.exists()) {
          alert("Listing not found.");
          return;
        }
        const ownerId = lSnap.data().ownerId;
        const uDoc = await getDoc(doc(db, "users", ownerId));
        if (uDoc.exists()) {
          const uData = uDoc.data();
          if (uData.kycStatus !== "APPROVED") {
            alert(`Unable to issue ${badgeType} badge: Listing owner is not KYC verified. Directly, badges/promotions can only be issued to KYC verified users.`);
            return;
          }
        } else {
          alert("Listing owner profile not found.");
          return;
        }
      } catch (checkErr: any) {
        console.error("KYC validation check failed:", checkErr);
        alert("Failed to check owner KYC status: " + checkErr.message);
        return;
      }
    }

    try {
      const listingRef = doc(db, 'listings', listingId);
      const listingSnap = await getDoc(listingRef);
      const currentData = listingSnap.exists() ? listingSnap.data() : null;
      const now = new Date();
      const updateData: any = {};
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + durationDays);

      if (badgeType === 'FEATURED') {
        updateData.isFeatured = activate;
        updateData.featuredUntil = activate ? expiryDate : null;
        if (activate) {
          updateData.promotionStatus = "APPROVED";
        } else {
          const isBoostedStillActive = currentData?.isBoosted && currentData?.boostedUntil && (
            typeof currentData.boostedUntil.toDate === 'function' ? currentData.boostedUntil.toDate() > now :
            new Date(currentData.boostedUntil.seconds ? currentData.boostedUntil.seconds * 1000 : currentData.boostedUntil) > now
          );
          updateData.promotionStatus = isBoostedStillActive ? "APPROVED" : "NONE";
        }
      } else {
        updateData.isBoosted = activate;
        updateData.boostedUntil = activate ? expiryDate : null;
        if (activate) {
          updateData.promotionStatus = "APPROVED";
        } else {
          const isFeaturedStillActive = currentData?.isFeatured && currentData?.featuredUntil && (
            typeof currentData.featuredUntil.toDate === 'function' ? currentData.featuredUntil.toDate() > now :
            new Date(currentData.featuredUntil.seconds ? currentData.featuredUntil.seconds * 1000 : currentData.featuredUntil) > now
          );
          updateData.promotionStatus = isFeaturedStillActive ? "APPROVED" : "NONE";
        }
      }

      if (!activate) {
        try {
          const promoQ = query(
            collection(db, "promotionRequests"),
            where("targetId", "==", listingId),
            where("type", "==", badgeType),
            where("status", "==", "APPROVED")
          );
          const promoSnap = await getDocs(promoQ);
          const until = badgeType === 'FEATURED' ? currentData?.featuredUntil : currentData?.boostedUntil;
          const remainingMs = calculateRemainingPremiumMs(until);
          const remainingSeconds = Math.floor(remainingMs / 1000);
          const appealDeadline = Timestamp.fromDate(calculateAppealDeadline(new Date()));

          for (const pDoc of promoSnap.docs) {
            await updateDoc(doc(db, "promotionRequests", pDoc.id), {
              status: "REVOKED",
              revocationReason: "Administrative override / Badge revoked directly by administrator.",
              updatedAt: serverTimestamp(),
              revokedAt: serverTimestamp(),
              originalVerifiedUntil: until || null,
              pausedRemainingPremiumMs: remainingMs,
              pausedRemainingPremiumSeconds: remainingSeconds,
              appealDeadline: appealDeadline,
              appealStatus: "AVAILABLE",
            });
          }

          updateData.pausedRemainingPremiumMs = remainingMs;
          updateData.pausedRemainingPremiumSeconds = remainingSeconds;
        } catch (pErr) {
          console.warn("Could not synchronize revoked status to promotionRequests:", pErr);
        }
      }
      
      updateData.updatedAt = serverTimestamp();
      
      await updateDoc(listingRef, updateData);
      
      // Update selectedListingDetail local state if open
      if (selectedListingDetail && selectedListingDetail.id === listingId) {
        setSelectedListingDetail((prev: any) => {
          if (!prev) return null;
          return {
            ...prev,
            isFeatured: badgeType === 'FEATURED' ? activate : prev.isFeatured,
            featuredUntil: badgeType === 'FEATURED' ? (activate ? expiryDate : null) : prev.featuredUntil,
            isBoosted: badgeType === 'BOOST' ? activate : prev.isBoosted,
            boostedUntil: badgeType === 'BOOST' ? (activate ? expiryDate : null) : prev.boostedUntil,
          };
        });
      }

      // Fetch fresh data for lists
      fetchData();
      alert(`Success: ${badgeType} badge successfully ${activate ? `issued for ${durationDays} days` : 'revoked'}.`);
    } catch (err: any) {
      console.error(err);
      alert("Failed to update listing badges manually: " + err.message);
    }
  };

  const deleteListing = async (id: string) => {
    setConfirmAction({
      message:
        "Are you sure you want to PERMANENTLY REMOVE this listing from the platform? This action is irreversible.",
      onConfirm: async () => {
        try {
          const lDoc = await getDoc(doc(db, "listings", id));
          if (lDoc.exists()) {
            const ownerId = lDoc.data().ownerId;
            const uDoc = await getDoc(doc(db, "users", ownerId));
          }

          await deleteDoc(doc(db, "listings", id));
          fetchData();
          if (selectedListingDetail?.id === id) {
            setSelectedListingDetail(null);
          }
          // Refresh user listings if we are viewing a user
          if (selectedUser) {
            const q = query(
              collection(db, "listings"),
              where("ownerId", "==", selectedUser.id),
            );
            const snap = await getDocs(q);
            setUserListings(
              snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Listing),
            );
          }
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `listings/${id}`);
        }
      },
    });
  };

  const updateReportLocalStatus = (reportId: string, actionType: string) => {
    if (activeTab === "reports") {
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                localActionsTaken: [...(r.localActionsTaken || []), actionType],
              }
            : r,
        ),
      );
    } else if (activeTab === "profileReports") {
      setProfileReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                localActionsTaken: [...(r.localActionsTaken || []), actionType],
              }
            : r,
        ),
      );
    }
  };

  const executeHistoricalDryRun = async () => {
    if (!user || !isAdmin) return;
    setIsRunningHistoricalDryRun(true);
    setHistoricalDryRunError(null);
    try {
      const res = await moderationMetricsService.runHistoricalReconciliationDryRun();
      setHistoricalDryRunResult(res);
      console.log("[AVORA_HISTORICAL_DRY_RUN_RESULT]:", JSON.stringify(res, null, 2));
    } catch (err: any) {
      console.error("Historical metrics dry run failed:", err);
      setHistoricalDryRunError(err?.message || "Failed to execute historical reconciliation dry run");
    } finally {
      setIsRunningHistoricalDryRun(false);
    }
  };

  useEffect(() => {
    if (activeTab === "reports" && user && isAdmin && !historicalDryRunResult && !isRunningHistoricalDryRun && !historicalDryRunError) {
      executeHistoricalDryRun();
    }
  }, [activeTab, user, isAdmin]);

  const executeControlledInitialization = async () => {
    if (!user || !isAdmin) return;
    if (initializationResult || historicalDryRunResult?.storedMetrics?.allReportsCount !== undefined) {
      setInitializationError("Initialization locked: /system_metrics/moderation is already initialized as a one-time operation.");
      return;
    }
    setIsInitializingMetrics(true);
    setInitializationError(null);
    try {
      const res = await moderationMetricsService.initializeModerationMetricsBaseline();
      setInitializationResult(res);
      console.log("[AVORA_CONTROLLED_INITIALIZATION_SUCCESS]:", JSON.stringify(res, null, 2));
      const freshMetrics = await moderationMetricsService.getAuthoritativeModerationMetrics();
      setModerationMetrics(freshMetrics);
    } catch (err: any) {
      console.error("Controlled initialization failed:", err);
      setInitializationError(err?.message || "Failed to initialize moderation metrics");
    } finally {
      setIsInitializingMetrics(false);
    }
  };

  const finalizeAction = async (reportId: string, reportSource?: string) => {
    const activeReport = activeTab === "reports"
      ? reports.find((r) => r.id === reportId)
      : profileReports.find((r) => r.id === reportId);

    if (activeReport?.status === "RESOLVED" || activeReport?.status === "DISMISSED") {
      return;
    }

    setConfirmAction({
      message:
        "Are you sure you have taken the required actions and want to mark this report as completed?",
      onConfirm: async () => {
        try {
          setProcessingReportId(reportId);

          if (activeTab === "reports") {
            const targetReport = reports.find((r) => r.id === reportId);
            const reportRef = (reportSource === "BATTLE_BIDS" || reportSource === "NEGOTIATION")
              ? doc(db, "arena_reports", reportId)
              : doc(db, "reports", reportId);

            let marketplaceStatus = "RESOLVED";
            let arenaStatus = ReportStatus.RESOLVED;

            await runTransaction(db, async (transaction) => {
              const snap = await transaction.get(reportRef);
              if (!snap.exists()) {
                throw new Error("Report not found in Firestore");
              }

              const rData = snap.data();
              const currentStatus = rData.status;

              // Guard against final status to guarantee transaction idempotency
              const normStatus = String(currentStatus || '').trim().toUpperCase();
              if (normStatus === "RESOLVED" || normStatus === "DISMISSED") {
                return; // Already completed, no-op
              }

              const actions = rData.actionsTaken || rData.localActionsTaken || [];
              const isOnlyIgnored = actions.includes("ignored") && !actions.some((a: string) => a === "warned" || a === "removed" || a === "blocked");
              
              marketplaceStatus = isOnlyIgnored ? "DISMISSED" : "RESOLVED";
              arenaStatus = isOnlyIgnored ? ReportStatus.DISMISSED : ReportStatus.RESOLVED;

              const statusUpdate = {
                status: (reportSource === "BATTLE_BIDS" || reportSource === "NEGOTIATION") ? arenaStatus : marketplaceStatus,
                resolvedAt: serverTimestamp(),
                resolvedBy: user?.email || "admin",
              };

              transaction.update(reportRef, statusUpdate);

              moderationMetricsService.recordReportFinalized(
                currentStatus,
                marketplaceStatus as 'RESOLVED' | 'DISMISSED',
                rData.targetType,
                transaction
              );
            });

            setModerationMetrics((prev) => ({
              ...prev,
              pendingReportsCount: Math.max(0, prev.pendingReportsCount - 1),
              resolvedReportsCount: marketplaceStatus === 'RESOLVED' ? prev.resolvedReportsCount + 1 : prev.resolvedReportsCount,
              dismissedReportsCount: marketplaceStatus === 'DISMISSED' ? prev.dismissedReportsCount + 1 : prev.dismissedReportsCount,
            }));

            setReports((prev) =>
              prev.map((r) =>
                r.id === reportId ? { ...r, status: marketplaceStatus } : r,
              ),
            );
          } else if (activeTab === "profileReports") {
            const targetReport = profileReports.find((r) => r.id === reportId);
            const actions = targetReport?.localActionsTaken || targetReport?.actionsTaken || [];
            const isOnlyIgnored = actions.includes("ignored") && !actions.some((a: string) => a === "warned" || a === "removed" || a === "blocked");

            const marketplaceStatus = isOnlyIgnored ? "DISMISSED" : "RESOLVED";
            const arenaStatus = isOnlyIgnored ? ReportStatus.DISMISSED : ReportStatus.RESOLVED;

            const statusUpdate = {
              status: marketplaceStatus,
              resolvedAt: serverTimestamp(),
              resolvedBy: user?.email || "admin",
            };

            if (reportSource === "BATTLE_BIDS" || reportSource === "NEGOTIATION") {
              await updateDoc(doc(db, "arena_reports", reportId), {
                ...statusUpdate,
                status: arenaStatus,
              });
            } else {
              await updateDoc(doc(db, "profileReports", reportId), statusUpdate);
            }
            setProfileReports((prev) =>
              prev.map((r) =>
                r.id === reportId ? { ...r, status: marketplaceStatus } : r,
              ),
            );
          }
        } catch (e) {
          console.error("Failed final action", e);
        } finally {
          setProcessingReportId(null);
        }
      },
    });
  };

  const rejectReport = async (report: any) => {
    if (report.status === "RESOLVED" || report.status === "DISMISSED") {
      return;
    }
    setConfirmAction({
      message: "Are you sure you want to ignore and reject this report?",
      onConfirm: async () => {
        setProcessingReportId(report.id);
        try {
          if (report.source === "BATTLE_BIDS" || report.source === "NEGOTIATION") {
            await updateDoc(doc(db, "arena_reports", report.id), {
              actionsTaken: arrayUnion("ignored"),
            });
          } else {
            await updateDoc(doc(db, "reports", report.id), {
              actionsTaken: arrayUnion("ignored"),
            });
          }
          updateReportLocalStatus(report.id, "ignored");
        } catch (error) {
          console.error("Failed to ignore report", error);
        } finally {
          setProcessingReportId(null);
        }
      },
    });
  };

  const removeAndResolve = async (
    reportId: string,
    listingId: string,
    ownerId?: string,
    reporterId?: string,
    source?: string,
    targetType?: string,
  ) => {
    if (!reportId || !listingId) return;
    const targetReport = reports.find((r) => r.id === reportId);
    if (targetReport?.status === "RESOLVED" || targetReport?.status === "DISMISSED") return;

    setConfirmAction({
      message:
        source === "BATTLE_BIDS" || source === "NEGOTIATION"
          ? "Are you sure you want to remove this Battle Bids / Negotiation item from active lists?"
          : "Are you sure you want to permanently remove this listing? The listing and the report will be deleted from the platform, and no notifications will be sent.",
      onConfirm: async () => {
        setProcessingReportId(reportId);
        try {
          if (source === "BATTLE_BIDS" || source === "NEGOTIATION") {
            await ModerationService.executeModerationAction(
              user?.uid || "admin",
              ModerationActionType.HIDE_LISTING,
              (targetType as any) || (source === "NEGOTIATION" ? "negotiation" : "listing"),
              listingId,
              "Removed for community policy violation",
              [reportId],
            );
            await updateDoc(doc(db, "arena_reports", reportId), {
              actionsTaken: arrayUnion("removed"),
            });
          } else {
            // 1. Delete the listing from Firestore
            await deleteDoc(doc(db, "listings", listingId));

            // 2. Report remains but UI state updates
            await updateDoc(doc(db, "reports", reportId), {
              actionsTaken: arrayUnion("removed"),
            });
          }
          updateReportLocalStatus(reportId, "removed");
        } catch (error) {
          if (source === "BATTLE_BIDS" || source === "NEGOTIATION") {
            handleFirestoreError(
              error,
              OperationType.UPDATE,
              `arena_auctions/${listingId}`,
            );
          } else {
            handleFirestoreError(
              error,
              OperationType.DELETE,
              `listings/${listingId}`,
            );
          }
        } finally {
          setProcessingReportId(null);
        }
      },
    });
  };

  const warnAndResolve = async (
    reportId: string,
    ownerId: string,
    reporterId: string,
    listingTitle?: string,
    source?: string,
    targetType?: string,
    targetId?: string,
  ) => {
    if (!reportId || !ownerId) return;
    const targetReport = reports.find((r) => r.id === reportId);
    if (targetReport?.status === "RESOLVED" || targetReport?.status === "DISMISSED") return;

    setConfirmAction({
      message: `Are you sure you want to send a warning notification to the seller of "${listingTitle}"?`,
      onConfirm: async () => {
        const customComment = `You are violating the rules and policies so be careful in the future otherwise your account will be restricted.`;

        setProcessingReportId(reportId);
        try {
          if (source === "BATTLE_BIDS" || source === "NEGOTIATION") {
            await ModerationService.executeModerationAction(
              user?.uid || "admin",
              ModerationActionType.ISSUE_WARNING,
              (targetType as any) || (source === "NEGOTIATION" ? "negotiation" : "listing"),
              targetId || reportId,
              customComment,
              [reportId],
            );
            await updateDoc(doc(db, "arena_reports", reportId), {
              actionsTaken: arrayUnion("warned"),
            });
          } else {
            // 1. Send warning to Seller
            const notifSellerRef = doc(collection(db, "notifications"));
            await setDoc(notifSellerRef, {
              userId: ownerId,
              title: "⚠️ Policy Violation Warning",
              message: customComment,
              read: false,
              createdAt: serverTimestamp(),
              type: "ADMIN_WARNING",
            });

            // 2. Notify Reporter
            if (
              reporterId &&
              reporterId !== "ANONYMOUS" &&
              reporterId !== "guest"
            ) {
              const notifReporterRef = doc(collection(db, "notifications"));
              await setDoc(notifReporterRef, {
                userId: reporterId,
                title: "🛡️ Violation Found",
                message:
                  "The report you submitted was verified. We have issued a formal warning to the seller and the account is under administrative review.",
                read: false,
                createdAt: serverTimestamp(),
              });
            }

            // 3. Report remains but UI state updates
            await updateDoc(doc(db, "reports", reportId), {
              actionsTaken: arrayUnion("warned"),
            });
          }
          updateReportLocalStatus(reportId, "warned");
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, "notifications");
        } finally {
          setProcessingReportId(null);
        }
      },
    });
  };

  const blockAndResolveListing = async (
    reportId: string,
    ownerId: string,
    listingId: string,
    reporterId?: string,
    source?: string,
    targetType?: string,
  ) => {
    if (!reportId || !ownerId || !listingId) return;
    const targetReport = reports.find((r) => r.id === reportId);
    if (targetReport?.status === "RESOLVED" || targetReport?.status === "DISMISSED") return;

    setConfirmAction({
      message:
        "Are you sure you want to block this account? The account will be restricted from posting, reporting, and chatting. All badges will be removed, and the listing will be deleted.",
      onConfirm: async () => {
        setProcessingReportId(reportId);
        try {
          // 1. Block User & Remove Badges (archive current badges to savedBadges first)
          let savedBadges: any = null;
          try {
            const ownerDoc = await getDoc(doc(db, "users", ownerId));
            if (ownerDoc.exists()) {
              const ownerData = ownerDoc.data();
              savedBadges = {
                isVerified: ownerData.isVerified ?? false,
                verifiedBadgeType: ownerData.verifiedBadgeType ?? null,
                badges: ownerData.badges ?? [],
                verifiedUntil: ownerData.verifiedUntil ?? null,
                isPremium: ownerData.isPremium ?? false,
                premiumBadge: ownerData.premiumBadge ?? null,
                sellerBadges: ownerData.sellerBadges ?? [],
                trustBadges: ownerData.trustBadges ?? [],
                achievementBadges: ownerData.achievementBadges ?? [],
              };
            }
          } catch (err) {
            console.warn("Failed to backup badges prior to report block:", err);
          }

          const blockPayload: any = {
            isBlocked: true,
            status: "BLOCKED",
            accountStatus: "blocked",
            isVerified: false,
            verifiedBadgeType: null,
            badges: [], // Remove all badges
            blockReason:
              "Verified community safety violation based on reported content.",
            blockedAt: serverTimestamp(),
            appealStatus: "NONE",
          };
          if (savedBadges) {
            blockPayload.savedBadges = savedBadges;
          }

          await setDoc(doc(db, "users", ownerId), blockPayload, { merge: true });

          // 2. Notify User about restriction
          const notifUserRef = doc(collection(db, "notifications"));
          await setDoc(notifUserRef, {
            userId: ownerId,
            title: "🚫 Account Restricted",
            message:
              "Your account has been restricted due to violating the policies of this platform. You can still browse and appeal through support, but other actions are disabled.",
            read: false,
            createdAt: serverTimestamp(),
            type: "ADMIN_ACTION",
          });

          if (source === "BATTLE_BIDS" || source === "NEGOTIATION") {
            await ModerationService.executeModerationAction(
              user?.uid || "admin",
              ModerationActionType.BAN_ACCOUNT,
              (targetType as any) || (source === "NEGOTIATION" ? "negotiation" : "listing"),
              listingId,
              "Account blocked for community safety violation",
              [reportId],
            );
            await updateDoc(doc(db, "arena_reports", reportId), {
              actionsTaken: arrayUnion("blocked"),
            });
          } else {
            // 3. Remove Listing
            await deleteDoc(doc(db, "listings", listingId));

            // 5. Notify Reporter
            if (
              reporterId &&
              reporterId !== "ANONYMOUS" &&
              reporterId !== "guest"
            ) {
              try {
                const notifReporterRef = doc(collection(db, "notifications"));
                await setDoc(notifReporterRef, {
                  userId: reporterId,
                  title: "🛡️ Violation Actioned",
                  message:
                    "Based on your report, we have restricted the violating account and removed the content. Thank you for keeping our community safe.",
                  read: false,
                  createdAt: serverTimestamp(),
                });
              } catch (e) {
                console.error("Notification to reporter failed", e);
              }
            }

            await updateDoc(doc(db, "reports", reportId), {
              actionsTaken: arrayUnion("blocked"),
            });
          }

          updateReportLocalStatus(reportId, "blocked");

          const blockData = {
            isBlocked: true,
            status: "BLOCKED",
            isVerified: false,
            verifiedBadgeType: null,
            badges: [],
            blockReason:
              "Verified community safety violation based on reported content.",
            appealStatus: "NONE",
          };

          setAllUsers((prev) =>
            prev.map((u) => (u.id === ownerId ? { ...u, ...blockData } : u)),
          );
        } catch (error) {
          console.error("Block action failed", error);
        } finally {
          setProcessingReportId(null);
        }
      },
    });
  };

  const rejectProfileReport = async (report: any) => {
    const id = typeof report === "object" ? report.id : report;
    const source = typeof report === "object" ? report.source : "MARKETPLACE";
    if (!id) return;

    setConfirmAction({
      message:
        "Are you sure you want to ignore this profile report? It will be permanently removed from the pending list.",
      onConfirm: async () => {
        setProcessingReportId(id);
        try {
          if (source === "BATTLE_BIDS" || source === "NEGOTIATION") {
            try {
              await ModerationService.dismissReport(id, "Dismissed by Admin as irrelevant");
            } catch (modErr) {
              console.warn("ModerationService dismissReport warning:", modErr);
            }
            await updateDoc(doc(db, "arena_reports", id), {
              actionsTaken: arrayUnion("ignored"),
            });
          } else {
            await updateDoc(doc(db, "profileReports", id), {
              actionsTaken: arrayUnion("ignored"),
            });
          }
          updateReportLocalStatus(id, "ignored");
        } catch (error) {
          console.error("Failed to ignore profile report", id, error);
          handleFirestoreError(
            error,
            OperationType.DELETE,
            source === "BATTLE_BIDS" || source === "NEGOTIATION" ? `arena_reports/${id}` : `profileReports/${id}`,
          );
        } finally {
          setProcessingReportId(null);
        }
      },
    });
  };

  const blockAndResolveProfile = async (
    reportId: string,
    profileId: string,
    reporterId?: string,
    source?: string,
  ) => {
    if (!reportId || !profileId) return;

    setConfirmAction({
      message:
        "Are you sure you want to block this account? The account will be restricted from posting, reporting, and chatting. All badges will be removed.",
      onConfirm: async () => {
        setProcessingReportId(reportId);
        try {
          // 1. Execute Centralized Block
          await executeCentralBlock(
            profileId,
            user?.email || "Admin",
            user?.uid || "admin",
            undefined,
            "Verified community safety violation based on user reports."
          );

          if (source === "BATTLE_BIDS" || source === "NEGOTIATION") {
            try {
              await ModerationService.executeModerationAction(
                user?.uid || "admin",
                ModerationActionType.BAN_ACCOUNT,
                "user",
                profileId,
                "Account blocked for community safety policy violations.",
                [reportId],
              );
            } catch (modErr) {
              console.warn("ModerationService executeModerationAction warning:", modErr);
            }
            await updateDoc(doc(db, "arena_reports", reportId), {
              actionsTaken: arrayUnion("blocked"),
            });
          } else {
            // Notify Reporter for Marketplace reports
            if (
              reporterId &&
              reporterId !== "ANONYMOUS" &&
              reporterId !== "guest"
            ) {
              try {
                const notifReporterRef = doc(collection(db, "notifications"));
                await setDoc(notifReporterRef, {
                  userId: reporterId,
                  title: "🛡️ Account Restricted",
                  message:
                    "Following your report, we have restricted the violating account. Your feedback keeps Mandi safe.",
                  read: false,
                  createdAt: serverTimestamp(),
                });
              } catch (e) {
                console.error("Notification to reporter failed", e);
              }
            }

            await updateDoc(doc(db, "profileReports", reportId), {
              actionsTaken: arrayUnion("blocked"),
            });
          }

          updateReportLocalStatus(reportId, "blocked");

          const blockData = {
            isBlocked: true,
            status: "BLOCKED",
            isVerified: false,
            verifiedBadgeType: null,
            badges: [],
            blockReason:
              "Verified community safety violation based on user reports.",
            appealStatus: "NONE",
          };

          setAllUsers((prev) =>
            prev.map((u) => (u.id === profileId ? { ...u, ...blockData } : u)),
          );
        } catch (error) {
          console.error("Profile block failed", error);
        } finally {
          setProcessingReportId(null);
        }
      },
    });
  };

  const warnAndResolveProfile = async (
    reportId: string,
    profileId: string,
    reporterId: string,
    source?: string,
  ) => {
    if (!reportId || !profileId) return;

    setConfirmAction({
      message: "Are you sure you want to send a warning notification to this user?",
      onConfirm: async () => {
        const customComment = "You are violating the rules and policies so be careful in the future otherwise your account will be restricted.";

        setProcessingReportId(reportId);
        try {
          if (source === "BATTLE_BIDS" || source === "NEGOTIATION") {
            try {
              await ModerationService.executeModerationAction(
                user?.uid || "admin",
                ModerationActionType.ISSUE_WARNING,
                "user",
                profileId,
                customComment,
                [reportId],
              );
            } catch (modErr) {
              console.warn("ModerationService issue warning warning:", modErr);
            }
            await updateDoc(doc(db, "arena_reports", reportId), {
              actionsTaken: arrayUnion("warned"),
            });
          } else {
            const notifUserRef = doc(collection(db, "notifications"));
            await setDoc(notifUserRef, {
              userId: profileId,
              title: "⚠️ Profile Conduct Warning",
              message: customComment,
              read: false,
              createdAt: serverTimestamp(),
              type: "ADMIN_WARNING",
            });

            if (
              reporterId &&
              reporterId !== "ANONYMOUS" &&
              reporterId !== "guest"
            ) {
              const notifReporterRef = doc(collection(db, "notifications"));
              await setDoc(notifReporterRef, {
                userId: reporterId,
                title: "🛡️ User Officially Warned",
                message:
                  "We have issued a formal policy warning to the account you reported and are monitoring their status.",
                read: false,
                createdAt: serverTimestamp(),
              });
            }

            await updateDoc(doc(db, "profileReports", reportId), {
              actionsTaken: arrayUnion("warned"),
            });
          }

          updateReportLocalStatus(reportId, "warned");
        } catch (error) {
          console.error("Profile warning failed", error);
        } finally {
          setProcessingReportId(null);
        }
      },
    });
  };

  const revokeBadge = async (userId: string) => {
    if (!confirm(`Revoke the verified badge from this user?`)) return;
    if (
      !confirm(
        `FINAL CONFIRMATION: Remove verification status for user ${userId.slice(-5)}?`,
      )
    )
      return;
    try {
      await setDoc(doc(db, "users", userId), {
        isVerified: false,
        verifiedBadgeType: null,
        verifiedBadgeRequestStatus: "NONE",
      }, { merge: true });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const solveTicket = async (id: string) => {
    setConfirmAction({
      message:
        "Are you sure you want to mark this support ticket as resolved? This will signal to the user that their issue has been addressed and move this ticket to the Resolved section.",
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "supportTickets", id), {
            status: "RESOLVED",
            resolvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setSupportTickets((prev) =>
            prev.map((t) => (t.id === id ? { ...t, status: "RESOLVED" } : t)),
          );
          setSelectedSupportTicket((prev: any) =>
            prev?.id === id ? { ...prev, status: "RESOLVED" } : prev,
          );

          try {
            const t =
              supportTickets.find((t) => t.id === id) || selectedSupportTicket;
            if (t && t.userId) {
              const notifRef = doc(collection(db, "notifications"));
              await setDoc(notifRef, {
                userId: t.userId,
                type: "SYSTEM",
                title: "Ticket Resolved 🎉",
                message: `Your support ticket has been resolved by the administrator.`,
                read: false,
                createdAt: serverTimestamp(),
              });
            }
          } catch (e) {
            console.error(e);
          }
        } catch (error) {
          console.error("Failed to solve ticket", error);
        }
      },
    });
  };

  const handleAdminReply = async (ticketId: string) => {
    if (!adminReply.trim()) return;
    setIsReplying(true);
    try {
      await updateDoc(doc(db, "supportTickets", ticketId), {
        adminReply,
        status: "IN_PROGRESS",
        repliedAt: serverTimestamp(),
        repliedBy: user?.email,
      });

      try {
        const t =
          supportTickets.find((t) => t.id === ticketId) ||
          selectedSupportTicket;
        if (t && t.userId) {
          const notifRef = doc(collection(db, "notifications"));
          await setDoc(notifRef, {
            userId: t.userId,
            type: "SYSTEM",
            title: "New Response on Your Ticket",
            message: `An admin has responded to your support ticket. Please check your history.`,
            read: false,
            createdAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.error(e);
      }

      setAdminReply("");
      setSelectedSupportTicket((prev: any) => ({
        ...prev,
        adminReply,
        status: "IN_PROGRESS",
      }));
      setSupportTickets((prev) =>
        prev.map((t) =>
          t.id === ticketId ? { ...t, adminReply, status: "IN_PROGRESS" } : t,
        ),
      );
    } catch (error) {
      console.error("Failed to reply to ticket", error);
    } finally {
      setIsReplying(false);
    }
  };

  const deleteTicket = async (id: string) => {
    setConfirmAction({
      message:
        "Are you sure you want to PERMANENTLY DELETE this support ticket? This action is irreversible and the ticket will be removed from all views permanently.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "supportTickets", id));
          setSupportTickets((prev) => prev.filter((t) => t.id !== id));
          setSelectedSupportTicket(null);
        } catch (error) {
          console.error("Failed to delete ticket", error);
        }
      },
    });
  };

  const viewTicketSenderProfile = async (userId: string) => {
    if (!userId) {
      alert("No user ID associated with this ticket.");
      return;
    }
    saveAdminStateAndNavigate(`/user/${userId}`);
  };

  const viewSellerProfileFromListing = async (userId: string) => {
    if (!userId) {
      alert("No user ID associated with this listing.");
      return;
    }
    saveAdminStateAndNavigate(`/user/${userId}`);
  };

  const toggleUserVerification = async (
    u: any,
    currentStatus: boolean,
    durationDays?: number,
    skipConfirm = false,
  ) => {
    const userId = typeof u === "string" ? u : u.id;
    const userName = typeof u === "string" ? "User" : u.name || u.email;

    // Check permissions
    if (!currentStatus) {
      // Direct Premium issuance: strictly Super Admin only
      if (!isSuperAdmin) {
        alert("Action restricted: Only the Super Administrator is authorized to directly issue a Premium Seller Badge without a submitted application.");
        return;
      }
    } else {
      // Revocation: Super Admin or Authorized Admin (excluding Payment Verifiers)
      const canRevoke = (isSuperAdmin || isAuthorizedAdmin) && !isAuthorizedPaymentVerifier;
      if (!canRevoke) {
        alert("Action restricted: Only administrators are authorized to revoke verification badges.");
        return;
      }
    }

    try {
      const uDoc = await getDoc(doc(db, "users", userId));
      if (uDoc.exists()) {
        const uData = uDoc.data();
        if (!currentStatus) { // Issuing premium verified sellers badge
          if (uData.isBlocked === true || uData.accountStatus === "blocked" || uData.accountStatus === "deleted") {
            alert(`Cannot issue badge: User account is currently blocked for ${userName}.`);
            return;
          }
          if (uData.kycStatus !== "APPROVED") {
            setKycModalAlert({
              title: "KYC Verification Required",
              message: `${userName} is not KYC approved. Premium seller badge can only be issued to KYC approved users.`,
              type: "error"
            });
            return;
          }
          if (uData.verificationStage !== "PAYMENT_VERIFIED") {
            alert(`Unable to issue/grant badge: Payment has not been verified/confirmed by a Payment Verifier yet for ${userName}.`);
            return;
          }
        }
      }
    } catch (err) {
      console.error("KYC verification precheck failed:", err);
    }

    if (!skipConfirm) {
      const action = currentStatus ? "REVOKE" : "ISSUE PREMIUM";
      if (!window.confirm(`${action} verification for ${userName}?`)) return;
    }
    try {
      let isKycApproved = false;
      let existingUserDocData: any = null;
      try {
        const uDoc = await getDoc(doc(db, "users", userId));
        if (uDoc.exists()) {
          existingUserDocData = uDoc.data();
          isKycApproved = existingUserDocData.kycStatus === "APPROVED";
        }
      } catch (e) {}

      let updateData: any = {};
      if (!currentStatus) {
        // Issuing Premium
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + (durationDays || 30));
        updateData = {
          isVerified: true,
          verifiedBadgeType: "GOLDEN",
          isPremiumVerified: true,
          verifiedBadgeRequestStatus: "APPROVED",
          verifiedUntil: expiryDate,
          pausedRemainingPremiumMs: 0,
          pausedRemainingPremiumSeconds: 0,
          appealStatus: "NONE",
        };
      } else {
        // Revoking Premium -> PAUSE remaining duration
        const remainingMs = calculateRemainingPremiumMs(existingUserDocData?.verifiedUntil);
        const appealDeadline = Timestamp.fromDate(calculateAppealDeadline(new Date()));
        updateData = {
          isVerified: isKycApproved ? true : false,
          verifiedBadgeType: null,
          isPremiumVerified: false,
          verifiedBadgeRequestStatus: "REVOKED",
          verifiedBadgeRevocationReason: "Administrative toggle revocation",
          verifiedBadgeRevokedAt: serverTimestamp(),
          originalVerifiedUntil: existingUserDocData?.verifiedUntil || null,
          pausedRemainingPremiumMs: remainingMs,
          pausedRemainingPremiumSeconds: Math.floor(remainingMs / 1000),
          appealDeadline: appealDeadline,
          appealStatus: "AVAILABLE",
          verifiedUntil: null, // Clear active countdown
        };
      }

      await setDoc(doc(db, "users", userId), updateData, { merge: true });

      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        userId: userId,
        title: currentStatus
          ? "Verified Badge Revoked"
          : "Verified Badge Issued!",
        message: currentStatus
          ? "Your Verified Seller badge has been revoked by the admin team."
          : `You have been granted a ${durationDays ? durationDays + "-day" : ""} Golden Badge by the admin team!`,
        read: false,
        createdAt: serverTimestamp(),
      });

      // Update all local states immediately for instant UI feedback
      setAllUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      setPendingVerifications((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      setBlockedUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );

      if (
        selectedUser &&
        (selectedUser.id === userId || (selectedUser as any).uid === userId)
      ) {
        setSelectedUser((prev) => (prev ? { ...prev, ...updateData } : null));
      }

       fetchData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const handleAdminIssueBadge = async (userId: string, userName: string, days?: number, badgeType: "BASIC" | "GOLDEN" = "GOLDEN") => {
    // Check if the current user has permission to issue badges directly
    if (badgeType === "GOLDEN") {
      // Direct Premium (GOLDEN) badge issuance: strictly Super Admin only
      if (!isSuperAdmin) {
        alert("Action restricted: Only the Super Administrator is authorized to directly issue a Premium Seller Badge without a submitted application.");
        return;
      }
    } else {
      // Standard Verified (BASIC) badge issuance: Super Admin or Authorized Admin
      const isBadgeAdmin = (isSuperAdmin || isAuthorizedAdmin) && !isAuthorizedPaymentVerifier;
      if (!isBadgeAdmin) {
        alert("Action restricted: Only administrators are allowed to issue badges directly.");
        return;
      }
    }

    // NEW SECURITY REQUIREMENT: KYC approved checking and payment confirmation checking
    try {
      const uDoc = await getDoc(doc(db, "users", userId));
      if (uDoc.exists()) {
        const uData = uDoc.data();
        if (uData.isBlocked === true || uData.accountStatus === "blocked" || uData.accountStatus === "deleted") {
          alert(`Cannot issue badge: User account is currently blocked for ${userName}.`);
          return;
        }
        if (uData.kycStatus !== "APPROVED") {
          setKycModalAlert({
            title: "KYC Verification Required",
            message: `${userName} is not KYC approved. Badges can only be issued directly to KYC approved users.`,
            type: "error"
          });
          return;
        }

        const kycAppSnap = await getDoc(doc(db, "kyc_applications", userId));
        if (!kycAppSnap.exists() || kycAppSnap.data().status !== "APPROVED") {
          setKycModalAlert({
            title: "KYC Application Required",
            message: `${userName} does not have an approved KYC application in the verification system. Badges can only be issued to users with an approved KYC application.`,
            type: "error"
          });
          return;
        }

        // Check if payment verifier has confirmed payment
        const paymentConfirmed = uData.verificationStage === "PAYMENT_VERIFIED";
        if (!paymentConfirmed) {
          if (!window.confirm(`⚠️ PAYMENT VERIFICATION WARNING: Payment Verifiers have not yet marked this user's payment status as VERIFIED.\n\nDo you confirm that payment has been received and confirmed from Payment Verifiers, and you wish to issue the badge anyway?`)) {
            return;
          }
        }
      } else {
        alert("User profile not found.");
        return;
      }
    } catch (err) {
      console.error("Validation checking failed during badge issuance:", err);
      alert("Error checking KYC and payment status of the user.");
      return;
    }

    let period = days;
    if (!period) {
      const bLabel = badgeType === "GOLDEN" ? "Premium Golden" : "Standard Verified";
      const periodStr = window.prompt(`Enter duration in days for which the ${bLabel} Badge is being issued (e.g. 30, 90, 180, 365):`, "30");
      if (periodStr === null) return;
      period = parseInt(periodStr, 10);
    }
    if (isNaN(period) || period <= 0) {
      alert("Please enter a valid positive number of days.");
      return;
    }

    if (badgeType === "BASIC") {
      try {
        const verifyAppQuery = query(
          collection(db, "verification_applications"),
          where("userId", "==", userId)
        );
        const verifyAppSnap = await getDocs(verifyAppQuery);

        const promoReqQuery = query(
          collection(db, "promotionRequests"),
          where("userId", "==", userId),
          where("type", "==", "VERIFIED")
        );
        const promoReqSnap = await getDocs(promoReqQuery);

        if (verifyAppSnap.empty && promoReqSnap.empty) {
          alert("Standard verified badge cannot be issued without receiving the application for the user.");
          return;
        }
      } catch (err) {
        console.error("Error verifying application: ", err);
      }
    }

    const badgeLabel = badgeType === "GOLDEN" ? "Premium Golden Badge" : "Standard Verified Badge (Blue Tick)";
    if (!window.confirm(`Are you sure you want to issue the ${badgeLabel} to ${userName} for ${period} days?`)) {
      return;
    }

    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + period);

      const updateData: any = {
        isVerified: true,
        verifiedBadgeType: badgeType,
        isPremiumVerified: badgeType === "GOLDEN",
        verifiedBadgeRequestStatus: "APPROVED",
        verifiedUntil: expiryDate,
      };

      await setDoc(doc(db, "users", userId), updateData, { merge: true });

      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        userId: userId,
        title: badgeType === "GOLDEN" ? "Premium Badge Issued!" : "Verified Badge Issued!",
        message: badgeType === "GOLDEN"
          ? `Congratulations! An administrator has issued a Premium Seller Badge to your account for ${period} days.`
          : `Congratulations! An administrator has issued a Verified Seller Badge to your account for ${period} days.`,
        type: "VERIFIED",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      // Update all local states immediately for instant UI feedback
      setAllUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      setPendingVerifications((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      setBlockedUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser((prev) => (prev ? { ...prev, ...updateData } : null));
      }

      fetchData();
      alert(`${badgeLabel} successfully issued for ${period} Days immediately!`);
    } catch (error) {
       console.error(error);
       alert("Failed to issue badge.");
    }
  };

  const handleAdminRevokeBadge = async (userId: string, userName: string, verifiedUntil: any) => {
    const currentBadgeType = selectedUser?.verifiedBadgeType || "GOLDEN";
    const badgeLabel = currentBadgeType === "GOLDEN" ? "Premium Seller Badge" : "Verified Seller Badge";

    if (!window.confirm(`Are you sure you want to temporarily revoke the ${badgeLabel} for ${userName}? Remaining active time will be paused.`)) {
      return;
    }

    try {
      const uDoc = await getDoc(doc(db, "users", userId));
      const uData = uDoc.exists() ? uDoc.data() : null;
      const isKycApproved = uData ? uData.kycStatus === "APPROVED" : false;

      const remainingMs = calculateRemainingPremiumMs(uData?.verifiedUntil || verifiedUntil);
      const remainingSeconds = Math.floor(remainingMs / 1000);
      const appealDeadline = Timestamp.fromDate(calculateAppealDeadline(new Date()));

      const updateData: any = {
        isVerified: isKycApproved ? true : false,
        isPremiumVerified: false,
        verifiedBadgeRequestStatus: "REVOKED",
        verifiedBadgeRevocationReason: "Administrative revocation by admin.",
        verifiedBadgeRevokedAt: serverTimestamp(),
        originalVerifiedUntil: uData?.verifiedUntil || verifiedUntil || null,
        pausedRemainingPremiumMs: remainingMs,
        pausedRemainingPremiumSeconds: remainingSeconds,
        appealDeadline: appealDeadline,
        appealStatus: "AVAILABLE",
        verifiedUntil: null, // Freeze countdown
      };

      await setDoc(doc(db, "users", userId), updateData, { merge: true });

      // Sync promotionRequests if one exists
      try {
        const pQ = query(
          collection(db, "promotionRequests"),
          where("userId", "==", userId),
          where("type", "==", "VERIFIED")
        );
        const pSnap = await getDocs(pQ);
        for (const d of pSnap.docs) {
          if (d.data().status === "APPROVED") {
            await updateDoc(doc(db, "promotionRequests", d.id), {
              status: "REVOKED",
              revocationReason: "Administrative revocation by admin.",
              revokedAt: serverTimestamp(),
              originalVerifiedUntil: uData?.verifiedUntil || verifiedUntil || null,
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
        userId: userId,
        title: "Verified Badge Revoked (Paused)",
        message: `Your ${badgeLabel} has been paused and revoked by an administrator. Remaining time (${Math.ceil(remainingSeconds / 86400)} days) is safely preserved. You have 7 days to submit an appeal.`,
        type: "VERIFIED",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      // Update all local states immediately for instant UI feedback
      setAllUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      setPendingVerifications((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      setBlockedUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser((prev) => (prev ? { ...prev, ...updateData } : null));
      }

      fetchData();
      alert(`${badgeLabel} has been paused and revoked. Preserved ${Math.ceil(remainingSeconds / 86400)} days remaining.`);
    } catch (error) {
       console.error(error);
       alert("Failed to revoke badge.");
    }
  };

  const handleAdminResumeBadge = async (userId: string, userName: string, verifiedUntil: any) => {
    const currentBadgeType = selectedUser?.verifiedBadgeType || "GOLDEN";
    const badgeLabel = currentBadgeType === "GOLDEN" ? "Premium Seller Badge" : "Verified Seller Badge";

    if (!window.confirm(`Are you sure you want to resume the paused ${badgeLabel} for ${userName}?`)) {
      return;
    }

    try {
      const uDoc = await getDoc(doc(db, "users", userId));
      const uData = uDoc.exists() ? uDoc.data() : null;
      if (uData && (uData.isBlocked === true || uData.accountStatus === "blocked" || uData.accountStatus === "deleted")) {
        alert("Cannot resume badge: User account is currently blocked.");
        return;
      }
      if (uData && uData.kycStatus !== "APPROVED") {
        alert("Cannot resume Premium Seller Badge: User KYC is not approved.");
        return;
      }

      const pausedMs = uData?.pausedRemainingPremiumMs || (uData?.pausedRemainingPremiumSeconds ? uData.pausedRemainingPremiumSeconds * 1000 : 0);
      
      if (!pausedMs || pausedMs <= 0) {
        alert("Cannot resume Premium Seller Badge: no remaining paused Premium entitlement exists. The previous entitlement may have expired, been forfeited, or been terminated.");
        return;
      }

      const resumedExpiry = calculateResumedExpiryDate(pausedMs);
      if (!resumedExpiry) {
        alert("Cannot resume Premium Seller Badge: invalid paused entitlement duration.");
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

      await setDoc(doc(db, "users", userId), updateData, { merge: true });

      // Sync promotionRequests if one exists
      try {
        const pQ = query(
          collection(db, "promotionRequests"),
          where("userId", "==", userId),
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
        userId: userId,
        title: "Verified Badge Resumed!",
        message: `Your ${badgeLabel} has been resumed by an administrator with full remaining duration restored immediately.`,
        type: "VERIFIED",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      // Update all local states immediately for instant UI feedback
      setAllUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      setPendingVerifications((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      setBlockedUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updateData } : u))
      );
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser((prev) => (prev ? { ...prev, ...updateData } : null));
      }

      fetchData();
      alert(`${badgeLabel} has been successfully resumed with remaining entitlement restored!`);
    } catch (error) {
       console.error(error);
       alert("Failed to resume badge.");
    }
  };

  const sendUserToVerifiers = async (userId: string) => {
    try {
      await updateDoc(doc(db, "users", userId), {
        verificationStage: "SENT_TO_VERIFIERS",
        sentToVerifiersAt: serverTimestamp(),
        sentToVerifiersBy: user?.email || "Admin",
        updatedAt: serverTimestamp(),
      });

      try {
        const pSnap = await getDocs(query(collection(db, "promotionRequests"), where("userId", "==", userId), where("type", "==", "VERIFIED"), where("status", "==", "PENDING")));
        for (const d of pSnap.docs) {
          await updateDoc(doc(db, "promotionRequests", d.id), {
            verificationStage: "SENT_TO_VERIFIERS",
            sentToVerifiersAt: serverTimestamp(),
            sentToVerifiersBy: user?.email || "Admin",
            updatedAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.warn("Could not sync promotionRequests in sendUserToVerifiers:", e);
      }

      alert("User verification application successfully sent to Payment Verifiers!");
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const sendPromotionToVerifiers = async (req: any) => {
    try {
      await updateDoc(doc(db, "promotionRequests", req.id), {
        verificationStage: "SENT_TO_VERIFIERS",
        sentToVerifiersAt: serverTimestamp(),
        sentToVerifiersBy: user?.email || "Admin",
        updatedAt: serverTimestamp(),
      });

      if (req.type === "VERIFIED" && req.userId) {
        try {
          await updateDoc(doc(db, "users", req.userId), {
            verificationStage: "SENT_TO_VERIFIERS",
            sentToVerifiersAt: serverTimestamp(),
            sentToVerifiersBy: user?.email || "Admin",
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.warn("Could not sync users doc in sendPromotionToVerifiers:", e);
        }
      }

      try {
        const notifRef = doc(collection(db, "notifications"));
        await setDoc(notifRef, {
          userId: req.userId,
          title: "⏳ Payment Verification Scheduled",
          message: `Your ${req.type} request for "${req.planName}" has been routed to our Authorized Payment Verifiers. We are confirming the transaction trace.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn("Could not dispatch status notification:", e);
      }

      alert("Application successfully sent to Payment Verifiers!");
      setSelectedPromotion(null);
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `promotionRequests/${req.id}`);
    }
  };

  const verifyUserPayment = async (userId: string, receivedAmountVal?: number) => {
    try {
      if (!isAuthorizedPaymentVerifier && !isSuperAdmin && !isAuthorizedAdmin && !isAdmin) {
        alert("Unauthorized: Only an authorized Payment Verifier or Administrator can verify payments.");
        return;
      }

      if (receivedAmountVal === undefined || receivedAmountVal === null || isNaN(receivedAmountVal) || receivedAmountVal < 0) {
        alert("A valid authoritative received amount is required to verify payment.");
        return;
      }

      const verifiedAmountNum = Number(receivedAmountVal);

      const uDoc = await getDoc(doc(db, "users", userId));
      if (!uDoc.exists()) {
        alert("User document not found.");
        return;
      }
      const uData = uDoc.data();
      const sentToVerifiersBy = uData.sentToVerifiersBy || "";

      await updateDoc(doc(db, "users", userId), {
        verificationStage: "PAYMENT_VERIFIED",
        receivedAmount: verifiedAmountNum,
        paymentVerifiedBy: user?.email || "Verifier",
        paymentVerifiedByUid: user?.uid || "",
        paymentVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Synchronize receivedAmount and verificationStage to any matching verification_applications or promotionRequests
      try {
        const vQuery = query(collection(db, "verification_applications"), where("userId", "==", userId), where("status", "==", "PENDING"));
        const vSnap = await getDocs(vQuery);
        for (const d of vSnap.docs) {
          await updateDoc(doc(db, "verification_applications", d.id), {
            verificationStage: "PAYMENT_VERIFIED",
            receivedAmount: verifiedAmountNum,
            paymentVerifiedBy: user?.email || "Verifier",
            paymentVerifiedByUid: user?.uid || "",
            paymentVerifiedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.warn("Could not sync verification_applications with receivedAmount:", e);
      }

      try {
        const pQuery = query(collection(db, "promotionRequests"), where("userId", "==", userId), where("type", "==", "VERIFIED"), where("status", "==", "PENDING"));
        const pSnap = await getDocs(pQuery);
        for (const d of pSnap.docs) {
          await updateDoc(doc(db, "promotionRequests", d.id), {
            verificationStage: "PAYMENT_VERIFIED",
            receivedAmount: verifiedAmountNum,
            paymentVerifiedBy: user?.email || "Verifier",
            paymentVerifiedByUid: user?.uid || "",
            paymentVerifiedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.warn("Could not sync promotionRequests with receivedAmount:", e);
      }

      // Clear local verifier input state for this user
      setVerifierReceivedAmounts(prev => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });

      const badgeLabelKey = uData.verifiedBadgeRequestType === "GOLDEN" ? "Premium Seller Badge" : "Verified Seller Badge";

      // 1. Notify Applicant
      const applicantNotifRef = doc(collection(db, "notifications"));
      await setDoc(applicantNotifRef, {
        id: applicantNotifRef.id,
        userId: userId,
        title: "✅ Payment Verified",
        message: `Your payment for your application for grant of ${badgeLabelKey} has been verified successfully (Amount Verified: PKR ${verifiedAmountNum.toLocaleString()}).`,
        read: false,
        isRead: false,
        createdAt: serverTimestamp()
      });

      // 2. Notify sending admin
      let adminUidsToNotify: string[] = [];
      if (sentToVerifiersBy && sentToVerifiersBy !== "Admin") {
        const adminQuery = query(collection(db, "users"), where("email", "==", sentToVerifiersBy));
        const adminSnap = await getDocs(adminQuery);
        if (!adminSnap.empty) {
          adminUidsToNotify.push(adminSnap.docs[0].id);
        }
      }
      if (adminUidsToNotify.length === 0) {
        const adminsQuery = query(collection(db, "users"), where("isAdmin", "==", true));
        const adminSnap = await getDocs(adminsQuery);
        adminSnap.docs.forEach(doc => {
          adminUidsToNotify.push(doc.id);
        });
      }

      for (const adminUid of adminUidsToNotify) {
        const adminNotifRef = doc(collection(db, "notifications"));
        await setDoc(adminNotifRef, {
          id: adminNotifRef.id,
          userId: adminUid,
          title: "✅ Payment Verified by Verifier",
          message: `The payment for applicant ${uData.name || uData.email || 'User'}'s application for grant of ${badgeLabelKey} has been verified by ${user?.email || 'Verifier'}. Verified Received Amount: ${verifiedAmountNum}.`,
          read: false,
          isRead: false,
          createdAt: serverTimestamp()
        });
      }

      setKycModalAlert({
        title: "Payment Verified",
        message: `Payment status marked as VERIFIED! Authoritative received amount: PKR ${verifiedAmountNum.toLocaleString()}. The applicant and sending admin have been notified. This application has been moved back to the admin dashboard for final Admin approval.`,
        type: "success"
      });
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

    const denyUserPayment = async (userId: string, denyReason: string) => {
      try {
        if (!denyReason.trim()) {
          alert("A reason is required to deny the payment.");
          return;
        }
        
        const uDoc = await getDoc(doc(db, "users", userId));
        if (!uDoc.exists()) {
          alert("User document not found.");
          return;
        }
        const uData = uDoc.data();
        const sentToVerifiersBy = uData.sentToVerifiersBy || "";

        await updateDoc(doc(db, "users", userId), {
          verificationStage: "VERIFIER_DENIED",
          paymentDeniedBy: user?.email || "Verifier",
          paymentDeniedAt: serverTimestamp(),
          paymentDenialReason: denyReason.trim(),
          updatedAt: serverTimestamp()
        });

      const badgeLabelKey = uData.verifiedBadgeRequestType === "GOLDEN" ? "Premium Seller Badge" : "Verified Seller Badge";

      // 1. Notify Applicant
      const applicantNotifRef = doc(collection(db, "notifications"));
      await setDoc(applicantNotifRef, {
        id: applicantNotifRef.id,
        userId: userId,
        title: "❌ Payment Verification Failed",
        message: `Your payment details for "${badgeLabelKey}" could not be verified by our Payment Verifiers. Reason: ${denyReason.trim()} \nPlease contact support or re-submit.`,
        read: false,
        isRead: false,
        createdAt: serverTimestamp()
      });

      // 2. Notify sending admin
      let adminUidsToNotify: string[] = [];
      if (sentToVerifiersBy && sentToVerifiersBy !== "Admin") {
        const adminQuery = query(collection(db, "users"), where("email", "==", sentToVerifiersBy));
        const adminSnap = await getDocs(adminQuery);
        if (!adminSnap.empty) {
          adminUidsToNotify.push(adminSnap.docs[0].id);
        }
      }
      if (adminUidsToNotify.length === 0) {
        const adminsQuery = query(collection(db, "users"), where("isAdmin", "==", true));
        const adminSnap = await getDocs(adminsQuery);
        adminSnap.docs.forEach(doc => {
          adminUidsToNotify.push(doc.id);
        });
      }

      for (const adminUid of adminUidsToNotify) {
        const adminNotifRef = doc(collection(db, "notifications"));
        await setDoc(adminNotifRef, {
          id: adminNotifRef.id,
          userId: adminUid,
          title: "❌ Payment Denied by Verifier",
          message: `The payment verification request for ${uData.name || uData.email || 'User'}'s "${badgeLabelKey}" was denied because the payment could not be verified. Reason: ${denyReason.trim()}`,
          read: false,
          isRead: false,
          createdAt: serverTimestamp()
        });
      }

      setKycModalAlert({
        title: "Payment Denied",
        message: "Proof denied successfully! The applicant and sending admin have been notified.",
        type: "success"
      });
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const verifyPromotionPayment = async (req: any, receivedAmountVal?: number) => {
    try {
      if (!isAuthorizedPaymentVerifier && !isSuperAdmin && !isAuthorizedAdmin && !isAdmin) {
        alert("Unauthorized: Only an authorized Payment Verifier or Administrator can verify payments.");
        return;
      }

      if (receivedAmountVal === undefined || receivedAmountVal === null || isNaN(receivedAmountVal) || receivedAmountVal < 0) {
        alert("A valid authoritative received amount is required to verify payment.");
        return;
      }

      const verifiedAmountNum = Number(receivedAmountVal);

      await updateDoc(doc(db, "promotionRequests", req.id), {
        receivedAmount: verifiedAmountNum,
        verificationStage: "PAYMENT_VERIFIED",
        paymentVerifiedBy: user?.email || "Verifier",
        paymentVerifiedByUid: user?.uid || "",
        paymentVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        history: arrayUnion({
          id: `hist_${Date.now()}`,
          action: "PAYMENT_VERIFIED",
          timestamp: new Date().toISOString(),
          note: `Payment verified by ${user?.email || 'Verifier'}. Application Amount: ${req.amount}, Authoritative Received Amount: ${verifiedAmountNum}`
        })
      });

      if (req.type === "VERIFIED" && req.userId) {
        try {
          await updateDoc(doc(db, "users", req.userId), {
            verificationStage: "PAYMENT_VERIFIED",
            receivedAmount: verifiedAmountNum,
            paymentVerifiedBy: user?.email || "Verifier",
            paymentVerifiedByUid: user?.uid || "",
            paymentVerifiedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.warn("Could not sync users doc in verifyPromotionPayment:", e);
        }
      }

      // Clear local verifier input state for this request
      setVerifierReceivedAmounts(prev => {
        const updated = { ...prev };
        delete updated[req.id];
        return updated;
      });

      const promoLabel = req.type === "FEATURED" ? "Featured Ads Badge" : req.type === "BOOST" ? "Boosted Ads Badge" : "Premium Seller Badge";
      const sentToVerifiersBy = req.sentToVerifiersBy || "";

      // 1. Notify Applicant
      const applicantNotifRef = doc(collection(db, "notifications"));
      await setDoc(applicantNotifRef, {
        id: applicantNotifRef.id,
        userId: req.userId,
        title: "✅ Payment Verified",
        message: `Your payment for your application for grant of ${promoLabel} has been verified successfully (Amount Verified: ${req.currency || 'PKR'} ${verifiedAmountNum.toLocaleString()}).`,
        read: false,
        isRead: false,
        createdAt: serverTimestamp()
      });

      // 2. Notify sending admin
      let adminUidsToNotify: string[] = [];
      if (sentToVerifiersBy && sentToVerifiersBy !== "Admin") {
        const adminQuery = query(collection(db, "users"), where("email", "==", sentToVerifiersBy));
        const adminSnap = await getDocs(adminQuery);
        if (!adminSnap.empty) {
          adminUidsToNotify.push(adminSnap.docs[0].id);
        }
      }
      if (adminUidsToNotify.length === 0) {
        const adminsQuery = query(collection(db, "users"), where("isAdmin", "==", true));
        const adminSnap = await getDocs(adminsQuery);
        adminSnap.docs.forEach(doc => {
          adminUidsToNotify.push(doc.id);
        });
      }

      for (const adminUid of adminUidsToNotify) {
        const adminNotifRef = doc(collection(db, "notifications"));
        await setDoc(adminNotifRef, {
          id: adminNotifRef.id,
          userId: adminUid,
          title: "✅ Payment Verified by Verifier",
          message: `The payment for applicant ${req.userEmail || 'User'}'s application for grant of ${promoLabel} has been verified by ${user?.email || 'Verifier'}. Application Amount: ${req.amount}, Verified Received Amount: ${verifiedAmountNum}.`,
          read: false,
          isRead: false,
          createdAt: serverTimestamp()
        });
      }

      setKycModalAlert({
        title: "Payment Verified",
        message: `Payment status marked as VERIFIED! Authoritative received amount recorded: ${req.currency || 'PKR'} ${verifiedAmountNum.toLocaleString()}. This application has been moved back to the PROMO section for final Admin approval.`,
        type: "success"
      });
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `promotionRequests/${req.id}`);
    }
  };

  const denyPromotionPayment = async (req: any, denyReason: string) => {
    try {
      if (!denyReason.trim()) {
        alert("A reason is required to deny the payment.");
        return;
      }
      
      await updateDoc(doc(db, "promotionRequests", req.id), {
        verificationStage: "VERIFIER_DENIED",
        paymentDeniedBy: user?.email || "Verifier",
        paymentDeniedAt: serverTimestamp(),
        paymentDenialReason: denyReason.trim(),
        updatedAt: serverTimestamp()
      });

      const promoLabel = req.type === "FEATURED" ? "Featured Ads Badge" : req.type === "BOOST" ? "Boosted Ads Badge" : "Premium Seller Badge";
      const sentToVerifiersBy = req.sentToVerifiersBy || "";

      // 1. Notify Applicant
      const applicantNotifRef = doc(collection(db, "notifications"));
      await setDoc(applicantNotifRef, {
        id: applicantNotifRef.id,
        userId: req.userId,
        title: "❌ Payment Verification Failed",
        message: `Your payment details for "${promoLabel}" could not be verified by our Payment Verifiers. Reason: ${denyReason.trim()} \nPlease contact support or re-submit.`,
        read: false,
        isRead: false,
        createdAt: serverTimestamp()
      });

      // 2. Notify sending admin
      let adminUidsToNotify: string[] = [];
      if (sentToVerifiersBy && sentToVerifiersBy !== "Admin") {
        const adminQuery = query(collection(db, "users"), where("email", "==", sentToVerifiersBy));
        const adminSnap = await getDocs(adminQuery);
        if (!adminSnap.empty) {
          adminUidsToNotify.push(adminSnap.docs[0].id);
        }
      }
      if (adminUidsToNotify.length === 0) {
        const adminsQuery = query(collection(db, "users"), where("isAdmin", "==", true));
        const adminSnap = await getDocs(adminsQuery);
        adminSnap.docs.forEach(doc => {
          adminUidsToNotify.push(doc.id);
        });
      }

      for (const adminUid of adminUidsToNotify) {
        const adminNotifRef = doc(collection(db, "notifications"));
        await setDoc(adminNotifRef, {
          id: adminNotifRef.id,
          userId: adminUid,
          title: "❌ Payment Denied by Verifier",
          message: `The payment verification request for ${req.userEmail || 'User'}'s "${promoLabel}" was denied because the payment could not be verified. Reason: ${denyReason.trim()}`,
          read: false,
          isRead: false,
          createdAt: serverTimestamp()
        });
      }

      setKycModalAlert({
        title: "Payment Denied",
        message: "Promo proof denied successfully! The applicant and sending admin have been notified.",
        type: "success"
      });
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `promotionRequests/${req.id}`);
    }
  };

  const approveBadgeRequest = async (id: string, type: "BASIC" | "GOLDEN") => {
    try {
      const uDoc = await getDoc(doc(db, "users", id));
      if (!uDoc.exists()) {
        alert("User document not found.");
        return;
      }
      const uData = uDoc.data();
      if (uData.isBlocked === true || uData.accountStatus === "blocked" || uData.accountStatus === "deleted") {
        alert("Cannot approve user badge application: User account is currently blocked.");
        return;
      }
      if (type === "GOLDEN" && uData.kycStatus !== "APPROVED") {
        alert("Cannot approve Premium Seller application: User KYC is not approved.");
        return;
      }
      if (uData.verificationStage === "VERIFIER_DENIED") {
        alert("Cannot approve application: Payment verifiers have rejected/denied the payment proof for this user badge application.");
        return;
      }
      if (uData.verificationStage !== "PAYMENT_VERIFIED") {
        alert("Unable to grant/approve badge: Payment has not been verified/confirmed by a Payment Verifier yet.");
        return;
      }
      let foundReceivedAmount = typeof uData.receivedAmount === "number" ? uData.receivedAmount : 0;
      if (foundReceivedAmount <= 0) {
        try {
          const pSnap = await getDocs(query(collection(db, "promotionRequests"), where("userId", "==", id), where("type", "==", "VERIFIED"), where("status", "==", "PENDING")));
          if (!pSnap.empty && typeof pSnap.docs[0].data().receivedAmount === "number") {
            foundReceivedAmount = pSnap.docs[0].data().receivedAmount;
          }
        } catch (e) {}
      }
      if (foundReceivedAmount <= 0) {
        alert("Unable to grant/approve badge: Authoritative received amount recorded by verifiers must be greater than zero.");
        return;
      }
    } catch (err) {
      console.error("Error retrieving user document:", err);
      alert("Error checking payment verification status.");
      return;
    }

    try {
      // Find durationDays from the core application to calculate the correct verifiedUntil expiration date
      let durationDays = 30; // fallback default
      try {
        const vReqQuery = query(
          collection(db, "verification_applications"),
          where("userId", "==", id),
          where("status", "==", "PENDING")
        );
        const vReqSnap = await getDocs(vReqQuery);
        if (!vReqSnap.empty) {
          const appData = vReqSnap.docs[0].data();
          if (appData.durationDays) {
            durationDays = appData.durationDays;
          }
        } else {
          // Check promotionRequests as fallback
          const pReqQuery = query(
            collection(db, "promotionRequests"),
            where("userId", "==", id),
            where("type", "==", "VERIFIED"),
            where("status", "==", "PENDING")
          );
          const pReqSnap = await getDocs(pReqQuery);
          if (!pReqSnap.empty) {
            const reqData = pReqSnap.docs[0].data();
            if (reqData.durationDays) {
              durationDays = reqData.durationDays;
            }
          }
        }
      } catch (durationErr) {
        console.warn("Could not retrieve application duration for user badge approval:", durationErr);
      }

      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + durationDays);

      await setDoc(doc(db, "users", id), {
        isVerified: true,
        verifiedBadgeType: type,
        isPremiumVerified: type === "GOLDEN",
        verifiedBadgeRequestStatus: "APPROVED",
        verificationStatus: "APPROVED",
        verifiedUntil: expirationDate,
      }, { merge: true });

      // Synchronize in promotionRequests and verification_applications collections
      try {
        const pReqQuery = query(
          collection(db, "promotionRequests"),
          where("userId", "==", id),
          where("type", "==", "VERIFIED"),
          where("status", "==", "PENDING")
        );
        const pReqSnap = await getDocs(pReqQuery);
        for (const d of pReqSnap.docs) {
          await updateDoc(doc(db, "promotionRequests", d.id), {
            status: "APPROVED",
            updatedAt: serverTimestamp(),
            approvedAt: serverTimestamp(),
            verifiedBy: user?.email || "Admin",
            verifiedByUid: user?.uid || "",
          });
        }
      } catch (err) {
        console.warn("Could not sync promotionRequests verified status:", err);
      }

      try {
        const vReqQuery = query(
          collection(db, "verification_applications"),
          where("userId", "==", id),
          where("status", "==", "PENDING")
        );
        const vReqSnap = await getDocs(vReqQuery);
        for (const d of vReqSnap.docs) {
          await updateDoc(doc(db, "verification_applications", d.id), {
            status: "APPROVED",
            updatedAt: serverTimestamp(),
            approvedAt: serverTimestamp(),
            verifiedBy: user?.email || "Admin",
            verifiedByUid: user?.uid || "",
          });
        }
      } catch (err2) {
        console.warn("Could not sync verification_applications approved status:", err2);
      }

      fetchData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${id}`);
    }
  };

  const rejectBadgeRequest = async (id: string, categoryChoice?: 'POLICY_VIOLATION' | 'FRAUD' | 'NON_PAYMENT') => {
    let uData: any = null;
    try {
      const uDoc = await getDoc(doc(db, "users", id));
      if (uDoc.exists()) {
        uData = uDoc.data();
        if (!uData.verificationStage || uData.verificationStage === "NONE") {
          alert("Cannot reject application before payment verification: This application must first be forwarded to Payment Verifiers.");
          return;
        }
        if (uData.verificationStage === "SENT_TO_VERIFIERS") {
          alert("Cannot reject application: This application has been sent to Payment Verifiers and is pending their decision.");
          return;
        }
      }
    } catch (err) {
      console.warn("Failed to check verificationStage on rejectBadgeRequest:", err);
    }

    const isNonPayment = !uData || uData.verificationStage === "VERIFIER_DENIED" || !uData.receivedAmount || uData.receivedAmount <= 0;
    const determinedCategory: 'NON_PAYMENT' | 'POLICY_VIOLATION' | 'FRAUD' = 
      isNonPayment ? "NON_PAYMENT" : (categoryChoice || adminRejectionCategory || "POLICY_VIOLATION");

    // Strict Phase 2B Refund Eligibility Classification:
    // Only genuine verified payments (verificationStage === 'PAYMENT_VERIFIED' and receivedAmount > 0)
    // rejected for POLICY_VIOLATION can be marked isRefundable.
    // FRAUD and NON_PAYMENT are strictly non-refundable.
    const isRefundable = determinedCategory === "POLICY_VIOLATION" && !isNonPayment && uData?.verificationStage === "PAYMENT_VERIFIED" && typeof uData?.receivedAmount === 'number' && uData.receivedAmount > 0;
    const reason = determinedCategory === "NON_PAYMENT" 
      ? (uData?.paymentDenialReason || "Payment was not received / denied by verifiers.") 
      : (determinedCategory === "FRAUD"
          ? "Application rejected for fraudulent payment or false evidence."
          : (adminPromoReason.trim() || "Application rejected by admin for policy violation."));

    try {
      await setDoc(doc(db, "users", id), {
        verifiedBadgeRequestStatus: "REJECTED",
        verificationStatus: "REJECTED",
        isPremiumVerified: false,
        rejectionCategory: determinedCategory,
        isRefundable: isRefundable,
        receivedAmount: isNonPayment ? 0 : (uData?.receivedAmount || 0),
        rejectedAt: serverTimestamp(),
        rejectedBy: user?.email || "Admin",
        rejectedByUid: user?.uid || "",
      }, { merge: true });

      // Synchronize in promotionRequests and verification_applications collections
      try {
        const pReqQuery = query(
          collection(db, "promotionRequests"),
          where("userId", "==", id),
          where("type", "==", "VERIFIED"),
          where("status", "==", "PENDING")
        );
        const pReqSnap = await getDocs(pReqQuery);
        for (const d of pReqSnap.docs) {
          await updateDoc(doc(db, "promotionRequests", d.id), {
            status: "REJECTED",
            rejectionReason: reason,
            rejectionCategory: determinedCategory,
            isRefundable: isRefundable,
            receivedAmount: isNonPayment ? 0 : (d.data().receivedAmount || uData?.receivedAmount || 0),
            updatedAt: serverTimestamp(),
            rejectedAt: serverTimestamp(),
            rejectedBy: user?.email || "Admin",
            rejectedByUid: user?.uid || "",
          });
        }
      } catch (err) {
        console.warn("Could not sync promotionRequests verified status:", err);
      }

      try {
        const vReqQuery = query(
          collection(db, "verification_applications"),
          where("userId", "==", id),
          where("status", "==", "PENDING")
        );
        const vReqSnap = await getDocs(vReqQuery);
        for (const d of vReqSnap.docs) {
          await updateDoc(doc(db, "verification_applications", d.id), {
            status: "REJECTED",
            rejectionReason: reason,
            rejectionCategory: determinedCategory,
            isRefundable: isRefundable,
            receivedAmount: isNonPayment ? 0 : (d.data().receivedAmount || uData?.receivedAmount || 0),
            updatedAt: serverTimestamp(),
            rejectedAt: serverTimestamp(),
            rejectedBy: user?.email || "Admin",
            rejectedByUid: user?.uid || "",
          });
        }
      } catch (err2) {
        console.warn("Could not sync verification_applications rejected status:", err2);
      }

      fetchData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${id}`);
    }
  };

  interface ResolvedPromotionTarget {
    kind: 'listing' | 'arena_auction' | 'profile';
    collectionName: 'listings' | 'arena_auctions' | 'users';
    ref: DocumentReference;
  }

  const resolvePromotionTarget = async (request: PromotionRequest): Promise<ResolvedPromotionTarget | null> => {
    if (!request || !request.targetId || request.targetId === 'MANUAL') {
      return null;
    }

    if (request.type === 'VERIFIED') {
      return {
        kind: 'profile',
        collectionName: 'users',
        ref: doc(db, 'users', request.targetId),
      };
    }

    if (request.targetType === 'arena_auctions') {
      return {
        kind: 'arena_auction',
        collectionName: 'arena_auctions',
        ref: doc(db, 'arena_auctions', request.targetId),
      };
    }

    if (request.targetType === 'listings') {
      return {
        kind: 'listing',
        collectionName: 'listings',
        ref: doc(db, 'listings', request.targetId),
      };
    }

    if (request.targetType === 'users') {
      return {
        kind: 'profile',
        collectionName: 'users',
        ref: doc(db, 'users', request.targetId),
      };
    }

    // Legacy requests fallback: targetType is absent
    const link = (request.itemLink || '').toLowerCase();
    const isBattleBidsLink = link.includes('/battle-bids/') || link.includes('/negotiations/') || link.includes('/arena');

    const [arenaSnap, listingSnap] = await Promise.all([
      getDoc(doc(db, 'arena_auctions', request.targetId)).catch(() => null),
      getDoc(doc(db, 'listings', request.targetId)).catch(() => null),
    ]);

    const arenaExists = !!arenaSnap && arenaSnap.exists();
    const listingExists = !!listingSnap && listingSnap.exists();

    if (arenaExists && !listingExists) {
      return {
        kind: 'arena_auction',
        collectionName: 'arena_auctions',
        ref: doc(db, 'arena_auctions', request.targetId),
      };
    }

    if (listingExists && !arenaExists) {
      return {
        kind: 'listing',
        collectionName: 'listings',
        ref: doc(db, 'listings', request.targetId),
      };
    }

    if (arenaExists && listingExists) {
      if (isBattleBidsLink) {
        return {
          kind: 'arena_auction',
          collectionName: 'arena_auctions',
          ref: doc(db, 'arena_auctions', request.targetId),
        };
      }
      return {
        kind: 'listing',
        collectionName: 'listings',
        ref: doc(db, 'listings', request.targetId),
      };
    }

    if (isBattleBidsLink) {
      return {
        kind: 'arena_auction',
        collectionName: 'arena_auctions',
        ref: doc(db, 'arena_auctions', request.targetId),
      };
    }

    // Fail closed if ambiguous or neither exists
    return null;
  };

  const approvePromotion = async (request: PromotionRequest) => {
    try {
      if (request.verificationStage === "VERIFIER_DENIED") {
        alert("Cannot approve application: Payment was denied by a Payment Verifier.");
        return;
      }

      if (request.verificationStage !== "PAYMENT_VERIFIED") {
        alert(`Cannot approve ${request.type} application: Payment has not been verified/confirmed by a Payment Verifier yet.`);
        return;
      }

      if (!request.receivedAmount || typeof request.receivedAmount !== "number" || request.receivedAmount <= 0) {
        alert(`Cannot approve ${request.type} application: Authoritative received amount recorded by verifiers must be greater than zero.`);
        return;
      }
      
      // 1. If VERIFIED, enforce KYC verification first
      if (request.type === "VERIFIED") {
        const uDoc = await getDoc(doc(db, "users", request.targetId));
        if (uDoc.exists()) {
          const uData = uDoc.data();
          if (uData.isBlocked === true || uData.accountStatus === "blocked" || uData.accountStatus === "deleted") {
            alert("Cannot approve Premium Seller application: User account is currently blocked.");
            return;
          }
          if (uData.kycStatus !== "APPROVED") {
            alert("Cannot approve Premium Seller application: User KYC is not approved.");
            return;
          }
        } else {
          alert("Cannot approve Premium Seller application: User profile not found.");
          return;
        }
      }

      const duration = request.durationDays || approvedDuration || 30;
      let expiryDate = new Date();
      
      // Resolve promotion target safely
      let targetResolution: ResolvedPromotionTarget | null = null;
      if (request.type === "FEATURED" || request.type === "BOOST") {
        targetResolution = await resolvePromotionTarget(request);
        if (!targetResolution) {
          alert("Cannot approve: Target item could not be resolved or does not exist in listings or arena auctions.");
          return;
        }

        // Check for duplicate approvals / active badge periods
        const targetDoc = await getDoc(targetResolution.ref);
        if (targetDoc.exists()) {
          const targetData = targetDoc.data();
          let badgeIsActive = false;
          let badgeExpiry: any = null;

          if (targetResolution.kind === "arena_auction") {
            badgeIsActive = request.type === "FEATURED"
              ? (targetData.hasFeaturedBadge || targetData.isFeatured)
              : (targetData.hasBoostedBadge || targetData.isBoosted);
            badgeExpiry = request.type === "FEATURED" ? targetData.featuredUntil : targetData.boostedUntil;
          } else {
            badgeIsActive = request.type === "FEATURED" ? targetData.isFeatured : targetData.isBoosted;
            badgeExpiry = request.type === "FEATURED" ? targetData.featuredUntil : targetData.boostedUntil;
          }
          
          if (badgeIsActive && badgeExpiry) {
            const expDate = badgeExpiry.toDate ? badgeExpiry.toDate() : new Date(badgeExpiry);
            if (expDate > new Date()) {
              alert(`Cannot approve: Target ${targetResolution.kind === "arena_auction" ? "auction" : "listing"} already has an active ${request.type} badge until ${expDate.toLocaleDateString()}. Fixed-duration badges cannot be extended or duplicate-activated while currently active.`);
              return;
            }
          }
        }
      }

      // Enforce the immutable application duration days selected by the user (no extension / no renewal)
      expiryDate.setDate(expiryDate.getDate() + duration);
      const expiryTimestamp = Timestamp.fromDate(expiryDate);

      // 2. Update the request status and activate target feature atomically for listings / arena auctions
      if (request.type === "FEATURED" || request.type === "BOOST") {
        if (!targetResolution) {
          alert("Cannot approve: Unresolved target.");
          return;
        }

        const batch = writeBatch(db);
        const promoRef = doc(db, "promotionRequests", request.id);

        batch.update(promoRef, {
          status: "APPROVED",
          durationDays: duration,
          updatedAt: serverTimestamp(),
          approvedAt: serverTimestamp(),
          expiresAt: expiryTimestamp,
          isActivated: true,
          verifiedBy: user?.email || "Admin",
          verifiedByUid: user?.uid || "",
        });

        if (targetResolution.kind === "arena_auction") {
          if (request.type === "FEATURED") {
            batch.update(targetResolution.ref, {
              hasFeaturedBadge: true,
              isFeatured: true,
              featuredUntil: expiryTimestamp,
              promotionStatus: "APPROVED",
              featuredRequestId: request.id,
              updatedAt: serverTimestamp(),
            });
          } else if (request.type === "BOOST") {
            batch.update(targetResolution.ref, {
              hasBoostedBadge: true,
              isBoosted: true,
              boostedUntil: expiryTimestamp,
              promotionStatus: "APPROVED",
              boostedRequestId: request.id,
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          // Standard listing
          if (request.type === "FEATURED") {
            batch.update(targetResolution.ref, {
              isFeatured: true,
              featuredUntil: expiryTimestamp,
              promotionStatus: "APPROVED",
              featuredRequestId: request.id,
            });
          } else if (request.type === "BOOST") {
            batch.update(targetResolution.ref, {
              isBoosted: true,
              boostedUntil: expiryTimestamp,
              promotionStatus: "APPROVED",
              boostedRequestId: request.id,
            });
          }
        }

        await batch.commit();
      } else {
        // Fallback for user badge / VERIFIED profile promotion
        await updateDoc(doc(db, "promotionRequests", request.id), {
          status: "APPROVED",
          durationDays: duration,
          updatedAt: serverTimestamp(),
          approvedAt: serverTimestamp(),
          expiresAt: expiryTimestamp,
          isActivated: true,
          verifiedBy: user?.email || "Admin",
          verifiedByUid: user?.uid || "",
        });

        try {
          if (request.type === "VERIFIED") {
            const badgeType = "GOLDEN";
            await setDoc(doc(db, "users", request.targetId), {
              isVerified: true,
              verifiedBadgeType: badgeType,
              isPremiumVerified: true,
              verifiedUntil: expiryDate,
              verifiedBadgeRequestStatus: "APPROVED",
            }, { merge: true });
          }
        } catch (targetErr) {
          console.warn(
            "Could not update target user configuration:",
            targetErr,
          );
        }
      }

      // 3. Notify user (resilient try-catch)
      try {
        const notifRef = doc(collection(db, "notifications"));
        await setDoc(notifRef, {
          userId: request.userId,
          title: "✨ Promotion Activated!",
          message: `Your ${request.type} request for "${request.planName}" has been approved and is now active until ${expiryDate.toLocaleDateString()}.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn(
          "Could not dispatch notification to the applicant:",
          notifErr,
        );
      }

      setSelectedPromotion((prev: any) => prev?.id === request.id ? { ...prev, status: "APPROVED" } : prev);
      fetchData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `promotionRequests/${request.id}`,
      );
    }
  };

  const rejectPromotion = async (request: PromotionRequest, categoryChoice?: 'POLICY_VIOLATION' | 'FRAUD' | 'NON_PAYMENT') => {
    if (!request || !request.id) {
      return;
    }
    
    if (!request.verificationStage || request.verificationStage === "NONE") {
      alert("Cannot reject application before payment verification: This application must first be forwarded to Payment Verifiers.");
      return;
    }
    
    try {
      const pDoc = await getDoc(doc(db, "promotionRequests", request.id));
      if (pDoc.exists() && pDoc.data().verificationStage === "SENT_TO_VERIFIERS") {
        alert("Cannot reject application: This application has been sent to Payment Verifiers and is pending their decision.");
        return;
      }
    } catch (err) {
      console.warn("Failed to check verificationStage on rejectPromotion:", err);
    }

    const isNonPayment = request.verificationStage === "VERIFIER_DENIED" || !request.receivedAmount || request.receivedAmount <= 0;
    const determinedCategory: 'NON_PAYMENT' | 'POLICY_VIOLATION' | 'FRAUD' = 
      isNonPayment ? "NON_PAYMENT" : (categoryChoice || adminRejectionCategory || "POLICY_VIOLATION");

    // Strict Phase 2B Refund Eligibility Classification:
    // Only genuine verified payments (verificationStage === 'PAYMENT_VERIFIED' and receivedAmount > 0)
    // rejected for POLICY_VIOLATION can be marked isRefundable.
    // FRAUD and NON_PAYMENT are strictly non-refundable.
    const isRefundable = determinedCategory === "POLICY_VIOLATION" && !isNonPayment && request.verificationStage === "PAYMENT_VERIFIED" && typeof request.receivedAmount === 'number' && request.receivedAmount > 0;
    const reason = (adminPromoReason || "").trim() || (determinedCategory === "NON_PAYMENT" 
      ? (request.paymentDenialReason || "Payment was not received / denied by payment verifiers.") 
      : (determinedCategory === "FRAUD"
          ? "Application rejected for fraudulent payment or false evidence."
          : "Application rejected by admin for policy violation."));

    try {
      // Mark request status as REJECTED and store details to preserve history
      await updateDoc(doc(db, "promotionRequests", request.id), {
        status: "REJECTED",
        rejectionReason: reason,
        rejectionCategory: determinedCategory,
        isRefundable: isRefundable,
        receivedAmount: isNonPayment ? 0 : (request.receivedAmount || 0),
        updatedAt: serverTimestamp(),
        rejectedAt: serverTimestamp(),
        rejectedBy: user?.email || "Admin",
        rejectedByUid: user?.uid || "",
      });

      if (request.targetId) {
        try {
          if (request.type === "VERIFIED") {
            await setDoc(doc(db, "users", request.targetId), {
              verificationStatus: "NONE",
              verifiedBadgeRequestStatus: "REJECTED",
              appealStatus: "REJECTED",
              rejectionCategory: determinedCategory,
              isRefundable: isRefundable,
              receivedAmount: isNonPayment ? 0 : (request.receivedAmount || 0),
              pausedRemainingPremiumMs: 0,
              pausedRemainingPremiumSeconds: 0,
            }, { merge: true });
          } else {
            const resolvedTarget = await resolvePromotionTarget(request);
            if (resolvedTarget) {
              const targetSnap = await getDoc(resolvedTarget.ref);
              const currentStatus = targetSnap.exists() ? targetSnap.data().promotionStatus : "NONE";
              // Only clear promotionStatus if target does not already have an approved promotion active
              if (currentStatus !== "APPROVED") {
                await updateDoc(resolvedTarget.ref, {
                  promotionStatus: "REJECTED",
                  updatedAt: serverTimestamp(),
                });
              }
            }
          }
        } catch (updateErr) {
          console.warn(
            "Could not clean up target listing/user configuration:",
            updateErr,
          );
        }
      }

      try {
        const notifRef = doc(collection(db, "notifications"));
        const notifMessage = isNonPayment
          ? `Your ${request.type} request was closed due to payment non-verification. Reason: ${reason}.`
          : `Your ${request.type} request was rejected for policy reasons. Reason: ${reason}. Authoritative payment recorded: ${request.currency || 'PKR'} ${request.receivedAmount}.`;

        await setDoc(notifRef, {
          userId: request.userId,
          title: isNonPayment ? "❌ Promotion Request Closed (Non-Payment)" : "❌ Promotion Request Rejected",
          message: notifMessage,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn(
          "Could not dispatch rejection notification to the applicant:",
          notifErr,
        );
      }

      setAdminPromoReason("");
      setSelectedPromotion(null);
      fetchData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Firestore Rejection Failure: ", error);
    }
  };

  const revokePromotion = async (request: PromotionRequest) => {
    const reasonValue = (adminPromoReason || "").trim() || "Administrative override / Badge policy verification failure.";

    try {
      let remainingMs = 0;
      let userVerifiedUntil: any = null;

      if (request.type === "VERIFIED") {
        try {
          const userSnap = await getDoc(doc(db, "users", request.targetId));
          if (userSnap.exists()) {
            userVerifiedUntil = userSnap.data().verifiedUntil;
            remainingMs = calculateRemainingPremiumMs(userVerifiedUntil);
          }
        } catch (e) {}
      } else if (request.type === "FEATURED" || request.type === "BOOST") {
        try {
          const resolvedTarget = await resolvePromotionTarget(request);
          if (resolvedTarget) {
            const targetSnap = await getDoc(resolvedTarget.ref);
            if (targetSnap.exists()) {
              const targetData = targetSnap.data();
              userVerifiedUntil = request.type === "FEATURED" ? targetData.featuredUntil : targetData.boostedUntil;
              remainingMs = calculateRemainingPremiumMs(userVerifiedUntil);
            }
          }
        } catch (e) {}
      }

      const remainingSeconds = Math.floor(remainingMs / 1000);
      const appealDeadline = Timestamp.fromDate(calculateAppealDeadline(new Date()));

      // 1. Update the request status
      await updateDoc(doc(db, "promotionRequests", request.id), {
        status: "REVOKED",
        revocationReason: reasonValue,
        updatedAt: serverTimestamp(),
        revokedAt: serverTimestamp(),
        originalVerifiedUntil: userVerifiedUntil || null,
        pausedRemainingPremiumMs: remainingMs,
        pausedRemainingPremiumSeconds: remainingSeconds,
        appealDeadline: appealDeadline,
        appealStatus: "AVAILABLE",
      });

      // 2. Disable features on target (resilient try-catch in case document is missing/deleted)
      try {
        if (request.type === "FEATURED" || request.type === "BOOST") {
          const resolvedTarget = await resolvePromotionTarget(request);
          if (resolvedTarget) {
            const targetSnap = await getDoc(resolvedTarget.ref);
            const targetData = targetSnap.exists() ? targetSnap.data() : null;
            const now = new Date();

            if (resolvedTarget.kind === "arena_auction") {
              if (request.type === "FEATURED") {
                const otherBadgeActive = (targetData?.hasBoostedBadge || targetData?.isBoosted) && targetData?.boostedUntil && (
                  typeof targetData.boostedUntil.toDate === 'function' ? targetData.boostedUntil.toDate() > now :
                  new Date(targetData.boostedUntil.seconds ? targetData.boostedUntil.seconds * 1000 : targetData.boostedUntil) > now
                );

                await updateDoc(resolvedTarget.ref, {
                  hasFeaturedBadge: false,
                  isFeatured: false,
                  featuredUntil: null,
                  pausedRemainingPremiumMs: remainingMs,
                  pausedRemainingPremiumSeconds: remainingSeconds,
                  promotionStatus: otherBadgeActive ? "APPROVED" : "REVOKED",
                  promotionRevocationReason: reasonValue,
                  updatedAt: serverTimestamp(),
                });
              } else if (request.type === "BOOST") {
                const otherBadgeActive = (targetData?.hasFeaturedBadge || targetData?.isFeatured) && targetData?.featuredUntil && (
                  typeof targetData.featuredUntil.toDate === 'function' ? targetData.featuredUntil.toDate() > now :
                  new Date(targetData.featuredUntil.seconds ? targetData.featuredUntil.seconds * 1000 : targetData.featuredUntil) > now
                );

                await updateDoc(resolvedTarget.ref, {
                  hasBoostedBadge: false,
                  isBoosted: false,
                  boostedUntil: null,
                  pausedRemainingPremiumMs: remainingMs,
                  pausedRemainingPremiumSeconds: remainingSeconds,
                  promotionStatus: otherBadgeActive ? "APPROVED" : "REVOKED",
                  promotionRevocationReason: reasonValue,
                  updatedAt: serverTimestamp(),
                });
              }
            } else {
              // Standard listing
              if (request.type === "FEATURED") {
                const isBoostedStillActive = targetData?.isBoosted && targetData?.boostedUntil && (
                  typeof targetData.boostedUntil.toDate === 'function' ? targetData.boostedUntil.toDate() > now :
                  new Date(targetData.boostedUntil.seconds ? targetData.boostedUntil.seconds * 1000 : targetData.boostedUntil) > now
                );

                await updateDoc(resolvedTarget.ref, {
                  isFeatured: false,
                  featuredUntil: null,
                  pausedRemainingPremiumMs: remainingMs,
                  pausedRemainingPremiumSeconds: remainingSeconds,
                  promotionStatus: isBoostedStillActive ? "APPROVED" : "REVOKED",
                  promotionRevocationReason: reasonValue,
                });
              } else if (request.type === "BOOST") {
                const isFeaturedStillActive = targetData?.isFeatured && targetData?.featuredUntil && (
                  typeof targetData.featuredUntil.toDate === 'function' ? targetData.featuredUntil.toDate() > now :
                  new Date(targetData.featuredUntil.seconds ? targetData.featuredUntil.seconds * 1000 : targetData.featuredUntil) > now
                );

                await updateDoc(resolvedTarget.ref, {
                  isBoosted: false,
                  boostedUntil: null,
                  pausedRemainingPremiumMs: remainingMs,
                  pausedRemainingPremiumSeconds: remainingSeconds,
                  promotionStatus: isFeaturedStillActive ? "APPROVED" : "REVOKED",
                  promotionRevocationReason: reasonValue,
                });
              }
            }
          }
        } else if (request.type === "VERIFIED") {
          const userSnap = await getDoc(doc(db, "users", request.targetId));
          const isKycApproved = userSnap.exists() && userSnap.data().kycStatus === "APPROVED";
          await setDoc(doc(db, "users", request.targetId), {
            isVerified: isKycApproved ? true : false,
            isPremiumVerified: false,
            verifiedBadgeType: "NONE",
            verifiedBadgeRequestStatus: "REVOKED",
            verifiedBadgeRevocationReason: reasonValue,
            verifiedBadgeRevokedAt: serverTimestamp(),
            originalVerifiedUntil: userVerifiedUntil || null,
            pausedRemainingPremiumMs: remainingMs,
            pausedRemainingPremiumSeconds: remainingSeconds,
            appealDeadline: appealDeadline,
            appealStatus: "AVAILABLE",
            verifiedUntil: null, // Freeze countdown
          }, { merge: true });
        }
      } catch (targetErr) {
        console.warn(
          "Could not update target listing/user configuration:",
          targetErr,
        );
      }

      // 3. Notify user (resilient try-catch)
      try {
        const notifRef = doc(collection(db, "notifications"));
        await setDoc(notifRef, {
          userId: request.userId,
          title: "⚠️ Promotion Badge Revoked (Paused)",
          message: `Your ${request.type} active badge of "${request.planName}" has been paused and revoked. Remaining time is preserved. Reason: ${reasonValue}. You have 7 days to submit an appeal.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn(
          "Could not dispatch revocation notification to applicant:",
          notifErr,
        );
      }

      setSelectedPromotion((prev: any) => prev?.id === request.id ? { ...prev, status: "REVOKED" } : prev);
      fetchData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `promotionRequests/${request.id}`,
      );
    }
  };

  const resumePromotion = async (request: PromotionRequest) => {
    try {
      let pausedMs = request.pausedRemainingPremiumMs || (request.pausedRemainingPremiumSeconds ? request.pausedRemainingPremiumSeconds * 1000 : 0);
      let badgeType = request.planName.includes("PREMIUM") || request.amount > 5000 ? "GOLDEN" : "BASIC";

      let resumedExpiry: Date | null = null;

      let resolvedTarget: ResolvedPromotionTarget | null = null;

      if (request.type === "VERIFIED") {
        const uDoc = await getDoc(doc(db, "users", request.targetId));
        if (uDoc.exists()) {
          const uData = uDoc.data();
          if (uData.isBlocked === true || uData.accountStatus === "blocked" || uData.accountStatus === "deleted") {
            alert("Cannot resume Premium Seller Badge: User account is currently blocked.");
            return;
          }
          if (uData.kycStatus !== "APPROVED") {
            alert("Cannot resume Premium Seller Badge: User KYC is not approved.");
            return;
          }
          if (!pausedMs && uData.pausedRemainingPremiumMs) {
            pausedMs = uData.pausedRemainingPremiumMs;
          }
        }

        if (!pausedMs || pausedMs <= 0) {
          alert("Cannot resume Premium Seller Badge: no remaining paused Premium entitlement exists. The previous entitlement may have expired, been forfeited, or been terminated.");
          return;
        }

        resumedExpiry = calculateResumedExpiryDate(pausedMs);
        if (!resumedExpiry) {
          alert("Cannot resume Premium Seller Badge: invalid paused entitlement duration.");
          return;
        }
      } else if (request.type === "FEATURED" || request.type === "BOOST") {
        resolvedTarget = await resolvePromotionTarget(request);
        if (!resolvedTarget) {
          alert(`Integrity Error: Cannot resume ${request.type} badge because target item could not be resolved in listings or arena auctions.`);
          return;
        }

        const targetDoc = await getDoc(resolvedTarget.ref);
        if (!targetDoc.exists()) {
          alert(`Integrity Error: Cannot resume ${request.type} badge because target ${resolvedTarget.kind === "arena_auction" ? "auction" : "listing"} was not found.`);
          return;
        }
        const targetData = targetDoc.data();
        if (targetData.status === "deleted" || targetData.status === "banned") {
          alert(`Cannot resume ${request.type} badge: Item is currently ${targetData.status}.`);
          return;
        }

        if (!pausedMs && targetData.pausedRemainingPremiumMs) {
          pausedMs = targetData.pausedRemainingPremiumMs;
        }

        // CRITICAL RESUME SAFETY: Block resume and report integrity error if exact frozen remaining time is unavailable or invalid.
        // NEVER grant a fresh/full duration or fallback to durationDays.
        if (!pausedMs || typeof pausedMs !== "number" || isNaN(pausedMs) || pausedMs <= 0) {
          alert(`Integrity Error: Cannot resume ${request.type} badge. Exact frozen remaining time is unavailable or invalid (pausedRemainingPremiumMs=${pausedMs}). Resumption is strictly blocked to prevent unauthorized duration extension or renewal.`);
          return;
        }

        resumedExpiry = calculateResumedExpiryDate(pausedMs);
        if (!resumedExpiry || isNaN(resumedExpiry.getTime()) || resumedExpiry.getTime() <= Date.now()) {
          alert(`Integrity Error: Cannot resume ${request.type} badge. Calculated resumed expiry is invalid. Resumption blocked.`);
          return;
        }
      } else {
        alert("Cannot resume: Unknown promotion type.");
        return;
      }

      if (!resumedExpiry) {
        alert("Cannot resume promotion: invalid expiry duration.");
        return;
      }

      // 1. Update request status back to APPROVED and active target features atomically
      const resumedExpiryTimestamp = Timestamp.fromDate(resumedExpiry);

      if (request.type === "FEATURED" || request.type === "BOOST") {
        if (!resolvedTarget) {
          alert("Cannot resume: Unresolved target.");
          return;
        }

        const batch = writeBatch(db);
        const promoRef = doc(db, "promotionRequests", request.id);

        batch.update(promoRef, {
          status: "APPROVED",
          appealStatus: "APPROVED",
          updatedAt: serverTimestamp(),
          revocationReason: "",
          pausedRemainingPremiumMs: 0,
          pausedRemainingPremiumSeconds: 0,
          resumedAt: serverTimestamp(),
          resumedExpiry: resumedExpiryTimestamp,
          expiresAt: resumedExpiryTimestamp,
          resumeConsumed: true,
        });

        if (resolvedTarget.kind === "arena_auction") {
          if (request.type === "FEATURED") {
            batch.update(resolvedTarget.ref, {
              hasFeaturedBadge: true,
              isFeatured: true,
              featuredUntil: resumedExpiryTimestamp,
              promotionStatus: "APPROVED",
              promotionRevocationReason: "",
              pausedRemainingPremiumMs: 0,
              pausedRemainingPremiumSeconds: 0,
              featuredRequestId: request.id,
              updatedAt: serverTimestamp(),
            });
          } else if (request.type === "BOOST") {
            batch.update(resolvedTarget.ref, {
              hasBoostedBadge: true,
              isBoosted: true,
              boostedUntil: resumedExpiryTimestamp,
              promotionStatus: "APPROVED",
              promotionRevocationReason: "",
              pausedRemainingPremiumMs: 0,
              pausedRemainingPremiumSeconds: 0,
              boostedRequestId: request.id,
              updatedAt: serverTimestamp(),
            });
          }
        } else {
          // Standard listing
          if (request.type === "FEATURED") {
            batch.update(resolvedTarget.ref, {
              isFeatured: true,
              featuredUntil: resumedExpiryTimestamp,
              promotionStatus: "APPROVED",
              promotionRevocationReason: "",
              pausedRemainingPremiumMs: 0,
              pausedRemainingPremiumSeconds: 0,
              featuredRequestId: request.id,
            });
          } else if (request.type === "BOOST") {
            batch.update(resolvedTarget.ref, {
              isBoosted: true,
              boostedUntil: resumedExpiryTimestamp,
              promotionStatus: "APPROVED",
              promotionRevocationReason: "",
              pausedRemainingPremiumMs: 0,
              pausedRemainingPremiumSeconds: 0,
              boostedRequestId: request.id,
            });
          }
        }

        await batch.commit();
      } else {
        // Fallback for user badge / VERIFIED profile promotion resumption
        await updateDoc(doc(db, "promotionRequests", request.id), {
          status: "APPROVED",
          updatedAt: serverTimestamp(),
          revocationReason: "",
          pausedRemainingPremiumMs: 0,
          pausedRemainingPremiumSeconds: 0,
          appealStatus: "APPROVED",
          resumedAt: serverTimestamp(),
          resumedExpiry: resumedExpiryTimestamp,
          expiresAt: resumedExpiryTimestamp,
          resumeConsumed: true,
        });

        try {
          if (request.type === "VERIFIED") {
            await setDoc(doc(db, "users", request.targetId), {
              isVerified: true,
              verifiedBadgeType: badgeType,
              isPremiumVerified: badgeType === "GOLDEN",
              verifiedUntil: resumedExpiryTimestamp,
              verifiedBadgeRequestStatus: "APPROVED",
              verifiedBadgeRevocationReason: "",
              pausedRemainingPremiumMs: 0,
              pausedRemainingPremiumSeconds: 0,
              appealStatus: "APPROVED",
              resumedAt: serverTimestamp(),
              resumedExpiry: resumedExpiryTimestamp,
            }, { merge: true });
          }
        } catch (targetErr) {
          console.warn(
            "Could not update target user configuration during resumption:",
            targetErr,
          );
        }
      }

      // 3. Notify user (resilient try-catch)
      try {
        const notifRef = doc(collection(db, "notifications"));
        await setDoc(notifRef, {
          userId: request.userId,
          title: "✨ Promotion Badge Resumed!",
          message: `Excellent news! Your ${request.type} badge for "${request.planName}" has been resumed with remaining duration restored immediately.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn(
          "Could not dispatch notification to applicant:",
          notifErr,
        );
      }

      setSelectedPromotion((prev: any) => prev?.id === request.id ? { ...prev, status: "APPROVED" } : prev);
      fetchData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `promotionRequests/${request.id}`,
      );
    }
  };

  const deletePromotionRequest = async (request: PromotionRequest) => {
    if (!request || !request.id) {
      return;
    }
    try {
      const pDoc = await getDoc(doc(db, "promotionRequests", request.id));
      if (pDoc.exists() && pDoc.data().verificationStage === "SENT_TO_VERIFIERS") {
        alert("Cannot delete application: This application has been sent to Payment Verifiers and is pending their decision.");
        return;
      }
    } catch (err) {
      console.warn("Failed to check verificationStage on deletePromotionRequest:", err);
    }

    try {
      // Delete the promotion request document from firestore
      await deleteDoc(doc(db, "promotionRequests", request.id));

      // Clean up target promotionStatus/badgeRequestStatus if needed
      try {
        if (request.targetId) {
          if (request.type === "FEATURED" || request.type === "BOOST") {
            const resolvedTarget = await resolvePromotionTarget(request);
            if (resolvedTarget) {
              const targetSnap = await getDoc(resolvedTarget.ref);
              const targetData = targetSnap.exists() ? targetSnap.data() : null;
              const now = new Date();

              if (resolvedTarget.kind === "arena_auction") {
                if (request.type === "FEATURED") {
                  const isBoostedStillActive = (targetData?.hasBoostedBadge || targetData?.isBoosted) && targetData?.boostedUntil && (
                    typeof targetData.boostedUntil.toDate === 'function' ? targetData.boostedUntil.toDate() > now :
                    new Date(targetData.boostedUntil.seconds ? targetData.boostedUntil.seconds * 1000 : targetData.boostedUntil) > now
                  );
                  await updateDoc(resolvedTarget.ref, {
                    hasFeaturedBadge: false,
                    isFeatured: false,
                    featuredUntil: null,
                    promotionStatus: isBoostedStillActive ? "APPROVED" : "NONE",
                    updatedAt: serverTimestamp(),
                  });
                } else if (request.type === "BOOST") {
                  const isFeaturedStillActive = (targetData?.hasFeaturedBadge || targetData?.isFeatured) && targetData?.featuredUntil && (
                    typeof targetData.featuredUntil.toDate === 'function' ? targetData.featuredUntil.toDate() > now :
                    new Date(targetData.featuredUntil.seconds ? targetData.featuredUntil.seconds * 1000 : targetData.featuredUntil) > now
                  );
                  await updateDoc(resolvedTarget.ref, {
                    hasBoostedBadge: false,
                    isBoosted: false,
                    boostedUntil: null,
                    promotionStatus: isFeaturedStillActive ? "APPROVED" : "NONE",
                    updatedAt: serverTimestamp(),
                  });
                }
              } else {
                // Standard listing
                if (request.type === "FEATURED") {
                  const isBoostedStillActive = targetData?.isBoosted && targetData?.boostedUntil && (
                    typeof targetData.boostedUntil.toDate === 'function' ? targetData.boostedUntil.toDate() > now :
                    new Date(targetData.boostedUntil.seconds ? targetData.boostedUntil.seconds * 1000 : targetData.boostedUntil) > now
                  );
                  await updateDoc(resolvedTarget.ref, {
                    isFeatured: false,
                    featuredUntil: null,
                    promotionStatus: isBoostedStillActive ? "APPROVED" : "NONE",
                  });
                } else if (request.type === "BOOST") {
                  const isFeaturedStillActive = targetData?.isFeatured && targetData?.featuredUntil && (
                    typeof targetData.featuredUntil.toDate === 'function' ? targetData.featuredUntil.toDate() > now :
                    new Date(targetData.featuredUntil.seconds ? targetData.featuredUntil.seconds * 1000 : targetData.featuredUntil) > now
                  );
                  await updateDoc(resolvedTarget.ref, {
                    isBoosted: false,
                    boostedUntil: null,
                    promotionStatus: isFeaturedStillActive ? "APPROVED" : "NONE",
                  });
                }
              }
            }
          } else if (request.type === "VERIFIED") {
            const userSnap = await getDoc(doc(db, "users", request.targetId));
            const isKycApproved = userSnap.exists() && userSnap.data().kycStatus === "APPROVED";
            await setDoc(doc(db, "users", request.targetId), {
              isVerified: isKycApproved ? true : false,
              isPremiumVerified: false,
              verifiedBadgeType: "NONE",
              verifiedBadgeRequestStatus: "NONE",
              verificationStatus: "NONE",
            }, { merge: true });
          }
        }
      } catch (cleanupErr) {
        console.warn(
          "Clean up target states on deletion failed or target already removed:",
          cleanupErr,
        );
      }

      setSelectedPromotion(null);
      fetchData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Firestore Deletion Failure: ", error);
    }
  };

  const sendRefundToVerifiers = async (req: any, skipConfirm = true) => {
    try {
      if (!skipConfirm && !confirm(`Are you sure you want to send this refund request to Payment Verifiers?`)) return;
      const collName = req.isVerificationAppCollection ? "verification_applications" : "promotionRequests";
      await updateDoc(doc(db, collName, req.id), {
        refundStatus: "SENT_TO_VERIFIERS",
        updatedAt: serverTimestamp(),
      });
      alert("Refund request sent to Payment Verifiers successfully.");
      setSelectedPromotion((prev: any) => prev?.id === req.id ? { ...prev, refundStatus: "SENT_TO_VERIFIERS" } : prev);
      fetchData();
    } catch (err) {
      console.error("Error sending refund to verifiers:", err);
      alert("Error sending refund to verifiers.");
    }
  };

  const adminRemoveRefundStatus = async (req: any, skipConfirm = true) => {
    if (!skipConfirm && !confirm("Are you sure you want to permanently delete this application from the platform? This action is IRREVERSIBLE.")) return;
    try {
      const collName = req.isVerificationAppCollection ? "verification_applications" : "promotionRequests";
      await deleteDoc(doc(db, collName, req.id));

      alert("Application has been permanently deleted from this platform.");
      setSelectedPromotion(null);
      fetchData();
    } catch (err) {
      console.error("Error deleting application:", err);
      alert("Error deleting application: " + (err as any).message);
    }
  };

  const adminRejectRefund = async (req: any, skipConfirm = true) => {
    if (!skipConfirm && !confirm("Are you sure you want to reject this request as not valid?")) return;
    const finalReason = "Rejected as not valid by Administrator.";
    try {
      const collName = req.isVerificationAppCollection ? "verification_applications" : "promotionRequests";
      await updateDoc(doc(db, collName, req.id), {
        refundStatus: "REJECTED",
        verifierRejectReason: finalReason,
        updatedAt: serverTimestamp(),
      });

      // Dispatch notification
      try {
        const notifRef = doc(collection(db, "notifications"));
        await setDoc(notifRef, {
          userId: req.userId,
          title: "❌ Refund Request Rejected",
          message: `Your refund request has been reviewed and rejected by Administrator. Reason: ${finalReason}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn("Could not dispatch reject notification:", notifErr);
      }

      alert("Refund request successfully rejected by Admin.");
      setSelectedPromotion((prev: any) => prev?.id === req.id ? { ...prev, refundStatus: "REJECTED", verifierRejectReason: finalReason } : prev);
      fetchData();
    } catch (err) {
      console.error("Error rejecting refund:", err);
      alert("Error rejecting refund.");
    }
  };

  const handleVerifierApproveRefund = async (req: any, receiptBase64: string) => {
    if (!receiptBase64) {
      alert("Please attach a return refund payment proof (screenshot) first.");
      return;
    }
    const refundAmts = calculateRefundAmounts(req.receivedAmount);
    const calculatedRefund = req.refundCalculatedAmount || refundAmts.refundAmount;
    const calculatedRetention = req.refundRetentionAmount || refundAmts.retentionAmount;
    if (!confirm(`Are you sure you want to approve this 95% refund of ${formatPrice(calculatedRefund, req.currency)} (5% retention: ${formatPrice(calculatedRetention, req.currency)}, from verified payment: ${formatPrice(req.receivedAmount, req.currency)}) and attach the receipt?`)) {
      return;
    }
    try {
      const collName = req.isVerificationAppCollection ? "verification_applications" : "promotionRequests";
      const docRef = doc(db, collName, req.id);
      await updateDoc(docRef, {
        refundStatus: "VERIFIER_APPROVED",
        refundProofImage: receiptBase64,
        refundCalculatedAmount: calculatedRefund,
        refundRetentionAmount: calculatedRetention,
        refundPercentage: 95,
        refundRetentionPercentage: 5,
        refundedAt: serverTimestamp(),
        refundedBy: user?.email || "Verifier",
        refundedByUid: user?.uid || "",
        updatedAt: serverTimestamp(),
      });

      // Dispatch notification
      try {
        const notifRef = doc(collection(db, "notifications"));
        await setDoc(notifRef, {
          userId: req.userId,
          title: "💸 Refund Processed by Verifier",
          message: `The payment verifier has processed your 95% refund of ${formatPrice(calculatedRefund, req.currency)} (5% platform retention: ${formatPrice(calculatedRetention, req.currency)}). Sent back to administration.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn("Could not dispatch verifier refund notification:", notifErr);
      }

      alert("Refund request confirmed and sent back to Administrative Admins successfully.");
      // Clear local state
      setVerifierRefundReceipts(prev => {
        const copy = { ...prev };
        delete copy[req.id];
        return copy;
      });
      fetchData();
    } catch (err) {
      console.error("Verifier refund processing failed:", err);
      alert("Failed to process refund. Please try again.");
    }
  };

  const handleVerifierRejectRefund = async (req: any) => {
    const reason = window.prompt("Enter the reason for denying this refund claim:");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Please provide a reason to deny refund.");
      return;
    }
    if (!confirm(`Are you sure you want to deny this refund request?`)) {
      return;
    }
    try {
      const collName = req.isVerificationAppCollection ? "verification_applications" : "promotionRequests";
      const docRef = doc(db, collName, req.id);
      await updateDoc(docRef, {
        refundStatus: "VERIFIER_REJECTED",
        verifierRejectReason: reason,
        updatedAt: serverTimestamp(),
      });

      // Dispatch notification
      try {
        const notifRef = doc(collection(db, "notifications"));
        await setDoc(notifRef, {
          userId: req.userId,
          title: "⚠️ Refund Request Rejected by Verifier",
          message: `The payment verifier has reviewed and denied your refund request. Reason: ${reason}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn("Could not dispatch verifier reject notification:", notifErr);
      }

      alert("Refund request successfully marked as denied/rejected by Verifier.");
      fetchData();
    } catch (err) {
      console.error("Verifier refund rejection failed:", err);
      alert("Failed to reject refund.");
    }
  };

  const handleAdminFinalizeRefund = async (request: any) => {
    if (!confirm(`Are you sure you want to finalize this refund and intimate the applicant?`)) return;
    try {
      setIsRefunding(true);
      const collName = request.isVerificationAppCollection ? "verification_applications" : "promotionRequests";
      const docRef = doc(db, collName, request.id);

      let finalRefundAmount = 0;
      let finalRetentionAmount = 0;
      let targetCurrency = request.currency;
      let targetUserId = request.userId;

      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(docRef);
        if (!sfDoc.exists()) {
          throw new Error("Request document does not exist.");
        }
        const currentData = sfDoc.data();
        if (currentData.refundStatus === "REFUNDED") {
          throw new Error("This refund has already been finalized and closed.");
        }
        if (currentData.refundStatus !== "VERIFIER_APPROVED") {
          throw new Error("Refund must be in VERIFIER_APPROVED state before Admin finalization.");
        }
        if (currentData.verificationStage !== "PAYMENT_VERIFIED" && currentData.verificationStage !== "VERIFIED") {
          throw new Error("Payment is not verified for this request.");
        }
        if (!currentData.receivedAmount || currentData.receivedAmount <= 0) {
          throw new Error("Received payment amount must be greater than zero.");
        }
        if (currentData.rejectionCategory === "FRAUD" || currentData.rejectionCategory === "NON_PAYMENT" || currentData.isRefundable === false) {
          throw new Error("Request is not eligible for refund.");
        }
        if (currentData.isActivated === true || currentData.approvedAt) {
          throw new Error("Activated promotions cannot be refunded.");
        }

        const refundAmts = calculateRefundAmounts(currentData.receivedAmount);
        finalRefundAmount = refundAmts.refundAmount;
        finalRetentionAmount = refundAmts.retentionAmount;
        targetCurrency = currentData.currency || request.currency;
        targetUserId = currentData.userId || request.userId;

        transaction.update(docRef, {
          refundStatus: "REFUNDED",
          refundCalculatedAmount: finalRefundAmount,
          refundRetentionAmount: finalRetentionAmount,
          refundPercentage: 95,
          refundRetentionPercentage: 5,
          refundedAt: serverTimestamp(),
          refundedBy: user?.email || "Admin",
          refundedByUid: user?.uid || "",
          updatedAt: serverTimestamp(),
        });
      });

      try {
        const notifRef = doc(collection(db, "notifications"));
        await setDoc(notifRef, {
          userId: targetUserId,
          title: "💸 Refund Completed & Closed",
          message: `Your 95% refund of ${formatPrice(finalRefundAmount, targetCurrency)} (5% retention: ${formatPrice(finalRetentionAmount, targetCurrency)}) for application badge has been fully processed and closed.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn("Could not dispatch final refund notification:", notifErr);
      }

      alert("Refund status finalized and applicant intimated.");
      setSelectedPromotion((prev: any) => prev?.id === request.id ? { ...prev, refundStatus: "REFUNDED", refundCalculatedAmount: finalRefundAmount, refundRetentionAmount: finalRetentionAmount } : prev);
      fetchData();
    } catch (err: any) {
      console.error("Failed to finalize refund:", err);
      alert(`Error finalizing refund: ${err.message || err}`);
    } finally {
      setIsRefunding(false);
    }
  };

  const handleProcessPromoRefundTrigger = (request: PromotionRequest) => {
    if (!request || !request.id) return;
    if (!isSuperAdmin) {
      alert("Unauthorized: Direct refund finalization bypass is restricted to Super Administrator.");
      return;
    }
    if (!adminRefundProof) {
      alert("Please attach a return payment proof (screenshot) first.");
      return;
    }
    setConfirmingAdminRefund(request);
  };

  const handleProcessPromoRefundConfirm = async () => {
    if (!confirmingAdminRefund) return;
    const request = confirmingAdminRefund;

    try {
      setIsRefunding(true);
      
      const collName = request.isVerificationAppCollection ? "verification_applications" : "promotionRequests";
      const docRef = doc(db, collName, request.id);

      let finalRefundAmount = 0;
      let finalRetentionAmount = 0;
      let targetCurrency = request.currency;
      let targetUserId = request.userId;

      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(docRef);
        if (!sfDoc.exists()) {
          throw new Error("Request document does not exist.");
        }
        const currentData = sfDoc.data();
        if (currentData.refundStatus === "REFUNDED") {
          throw new Error("This refund has already been finalized and closed.");
        }
        if (currentData.verificationStage !== "PAYMENT_VERIFIED" && currentData.verificationStage !== "VERIFIED") {
          throw new Error("Payment is not verified for this request.");
        }
        if (!currentData.receivedAmount || currentData.receivedAmount <= 0) {
          throw new Error("Received payment amount must be greater than zero.");
        }
        if (currentData.rejectionCategory === "FRAUD" || currentData.rejectionCategory === "NON_PAYMENT" || currentData.isRefundable === false) {
          throw new Error("Request is not eligible for refund.");
        }
        if (currentData.isActivated === true || currentData.approvedAt) {
          throw new Error("Activated promotions cannot be refunded.");
        }

        const refundAmts = calculateRefundAmounts(currentData.receivedAmount);
        finalRefundAmount = refundAmts.refundAmount;
        finalRetentionAmount = refundAmts.retentionAmount;
        targetCurrency = currentData.currency || request.currency;
        targetUserId = currentData.userId || request.userId;

        transaction.update(docRef, {
          refundStatus: "REFUNDED",
          refundProofImage: adminRefundProof || null,
          refundRequested: true,
          refundCalculatedAmount: finalRefundAmount,
          refundRetentionAmount: finalRetentionAmount,
          refundPercentage: 95,
          refundRetentionPercentage: 5,
          refundedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          refundedBy: user?.email || "Admin",
          refundedByUid: user?.uid || "",
        });
      });

      // Dispatch notification
      try {
        const notifRef = doc(collection(db, "notifications"));
        await setDoc(notifRef, {
          userId: targetUserId,
          title: "💸 Refund Completed!",
          message: `Your 95% refund of ${formatPrice(finalRefundAmount, targetCurrency)} (5% retention: ${formatPrice(finalRetentionAmount, targetCurrency)}) has been disbursed and completed.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn("Could not dispatch refund notification:", notifErr);
      }

      alert("Refund marked as Completed successfully.");
      setSelectedPromotion((prev: any) => prev?.id === request.id ? { ...prev, refundStatus: "REFUNDED", refundProofImage: adminRefundProof || null, refundRequested: true, refundCalculatedAmount: finalRefundAmount, refundRetentionAmount: finalRetentionAmount } : prev);
      setAdminRefundProof("");
      setConfirmingAdminRefund(null);
      fetchData();
    } catch (err: any) {
      console.error("Refund processing failed:", err);
      alert(`Failed to mark refund: ${err.message || err}`);
    } finally {
      setIsRefunding(false);
    }
  };

  const handleBroadcast = () => {
    if (!broadcastTitle.trim()) {
      setBroadcastErrorMessage("Please enter a Title for the broadcast.");
      return;
    }
    if (!broadcastMessage.trim()) {
      setBroadcastErrorMessage("Please enter the Message Body for the broadcast.");
      return;
    }

    setBroadcastErrorMessage(null);

    setConfirmAction({
      message: `Are you sure you want to broadcast "${broadcastTitle.trim()}" to platform users? This will dispatch notifications to targeted user accounts.`,
      onConfirm: () => executeBroadcastTransmission(),
    });
  };

  const executeBroadcastTransmission = async () => {
    setBroadcasting(true);
    setBroadcastErrorMessage(null);
    setBroadcastSuccessMessage(null);

    try {
      // 1. Fetch user targets
      let targetUserDocs: any[] = [];
      try {
        const usersSnap = await getDocs(collection(db, "users"));
        targetUserDocs = usersSnap.docs;
      } catch (userFetchErr) {
        console.warn("Could not query all users without limit:", userFetchErr);
        const qSimple = query(collection(db, "users"), limit(500));
        const simpleSnap = await getDocs(qSimple);
        targetUserDocs = simpleSnap.docs;
      }

      // Filter by target audience
      let filteredUsers = targetUserDocs;
      if (broadcastAudience === "SELLERS") {
        filteredUsers = targetUserDocs.filter((d) => {
          const u = d.data();
          return u.isSeller || u.sellerScore > 0 || u.listingsCount > 0 || u.isVerified || u.isPremiumVerified;
        });
      } else if (broadcastAudience === "BUYERS") {
        filteredUsers = targetUserDocs.filter((d) => {
          const u = d.data();
          return !u.isSeller && !u.isPremiumVerified;
        });
      }

      if (filteredUsers.length === 0 && targetUserDocs.length > 0) {
        filteredUsers = targetUserDocs;
      }

      // 2. Persist Broadcast in 'broadcasts' collection
      const broadcastRef = doc(collection(db, "broadcasts"));
      const broadcastId = broadcastRef.id;
      const cleanTitle = broadcastTitle.trim();
      const cleanMessage = broadcastMessage.trim();
      const cleanLink = broadcastLink.trim() || null;

      const newBroadcastData: BroadcastRecord = {
        id: broadcastId,
        title: cleanTitle,
        message: cleanMessage,
        link: cleanLink,
        type: broadcastType,
        priority: broadcastPriority,
        targetAudience: broadcastAudience,
        status: "SENT",
        pinned: broadcastPinned,
        senderEmail: user?.email || "Admin",
        senderUid: user?.uid || "admin",
        senderName: userProfile?.name || user?.displayName || "Mandi Admin",
        recipientCount: filteredUsers.length,
        createdAt: serverTimestamp(),
      };

      await setDoc(broadcastRef, newBroadcastData);

      // 3. Dispatch user notification records in batches (max 400 per writeBatch)
      const BATCH_SIZE = 400;
      let deliveredCount = 0;

      for (let i = 0; i < filteredUsers.length; i += BATCH_SIZE) {
        const chunk = filteredUsers.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        for (const u of chunk) {
          const notifRef = doc(collection(db, "notifications"));
          batch.set(notifRef, {
            userId: u.id,
            title: cleanTitle,
            message: cleanMessage,
            link: cleanLink,
            url: cleanLink,
            type: "BROADCAST",
            broadcastId: broadcastId,
            broadcastType: broadcastType,
            priority: broadcastPriority,
            read: false,
            isRead: false,
            createdAt: serverTimestamp(),
          });
        }

        await batch.commit();
        deliveredCount += chunk.length;
      }

      // 4. Update local history state
      setBroadcastHistory((prev) => [
        {
          ...newBroadcastData,
          createdAt: { seconds: Math.floor(Date.now() / 1000) },
        },
        ...prev,
      ]);

      setBroadcastSuccessMessage(
        `Broadcast "${cleanTitle}" successfully transmitted to ${deliveredCount} user${deliveredCount === 1 ? "" : "s"}!`
      );

      // Reset fields
      setBroadcastTitle("");
      setBroadcastMessage("");
      setBroadcastLink("");
      setBroadcastPinned(false);
    } catch (error: any) {
      console.error("Broadcast transmission error:", error);
      setBroadcastErrorMessage(
        error?.message || "Failed to transmit broadcast message. Please check permissions and network connection."
      );
    } finally {
      setBroadcasting(false);
    }
  };

  const handleDeleteBroadcast = (broadcastId: string) => {
    setConfirmAction({
      message: "Are you sure you want to permanently delete this broadcast announcement from history?",
      onConfirm: async () => {
        try {
          setIsDeletingBroadcastId(broadcastId);
          await deleteDoc(doc(db, "broadcasts", broadcastId));
          setBroadcastHistory((prev) => prev.filter((b) => b.id !== broadcastId));
        } catch (err: any) {
          console.error("Failed to delete broadcast:", err);
          setBroadcastErrorMessage(err?.message || "Error deleting broadcast");
        } finally {
          setIsDeletingBroadcastId(null);
        }
      },
    });
  };

  const refreshBroadcastHistory = async () => {
    setBroadcastLoadingHistory(true);
    try {
      const q = query(
        collection(db, "broadcasts"),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snap = await getDocs(q);
      setBroadcastHistory(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as BroadcastRecord));
    } catch (err) {
      try {
        const snap = await getDocs(query(collection(db, "broadcasts"), limit(50)));
        const items = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as BroadcastRecord);
        items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setBroadcastHistory(items);
      } catch (e) {
        console.error("Error refreshing broadcast history:", e);
      }
    } finally {
      setBroadcastLoadingHistory(false);
    }
  };

  const sendWarning = async (userId: string, targetName: string) => {
    try {
      const uDoc = await getDoc(doc(db, "users", userId));
      if (uDoc.exists()) {
        const uData = uDoc.data();
        if (["imran7297510@gmail.com", "imran7297510@gmail"].includes(uData?.email?.toLowerCase().trim() || "") && !isSuperAdmin) {
          alert("Authorized admins are never able or authorized to take any action against the administrator.");
          return;
        }
      }
    } catch {}

    if (
      !confirm(
        `Are you sure you want to send a warning notification to ${targetName}?`,
      )
    )
      return;

    try {
      // 1. Increment warning count in user profile
      await setDoc(doc(db, "users", userId), {
        warningsCount: increment(1),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 2. Send notification
      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        userId,
        title: "⚠️ Administrative Warning",
        message: `You are violating the rules and policies so be careful in the future otherwise your account will be restricted.`,
        read: false,
        isRead: false,
        createdAt: serverTimestamp(),
      });

      alert(`Warning Issued: ${targetName} has been notified.`);
      fetchData();
    } catch (e) {
      console.error(e);
      alert(`Failed to issue warning.`);
    }
  };

  const viewAccountDetail = async (u: UserProfile) => {
    if (u && u.id) {
      saveAdminStateAndNavigate(`/user/${u.id}`);
    }
  };

  const handleSearchView = async (id: string, type: "account" | "listing") => {
    if (type === "account") {
      const uDoc = await getDoc(doc(db, "users", id));
      if (uDoc.exists()) {
        const uProfile = { ...uDoc.data(), id: uDoc.id } as UserProfile;
        viewAccountDetail(uProfile);
      }
    } else {
      const lDoc = await getDoc(doc(db, "listings", id));
      if (lDoc.exists()) {
        const l = { ...lDoc.data(), id: lDoc.id } as Listing;
        setSelectedListingDetail(l);
      }
    }
  };

  const blockUser = async (userId: string, targetName: string) => {
    if (!window.confirm(`Are you sure you want to block ${targetName}? This will prevent them from accessing the platform and their listings will be hidden.`)) return;
    if (userId === user?.uid) {
      alert("CRITICAL ERROR: You cannot block your own administrator account.");
      return;
    }

    let savedBadges: any = null;
    let targetEmail = "";
    try {
      const uDoc = await getDoc(doc(db, "users", userId));
      if (uDoc.exists()) {
        const uData = uDoc.data();
        targetEmail = uData.email || "";
        if (["imran7297510@gmail.com", "imran7297510@gmail"].includes(targetEmail.toLowerCase().trim()) && !isSuperAdmin) {
          alert("Authorized admins are never able or authorized to take any action against the administrator.");
          return;
        }
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
    } catch {}

    setIsBlockingInProgress(true);
    try {
      console.log("Initiating block for user:", userId, targetName);
      const userRef = doc(db, "users", userId);
      const blockData: any = {
        isBlocked: true,
        accountStatus: "blocked",
        status: "BLOCKED",
        blockedAt: serverTimestamp(),
        blockedBy: user?.uid || "admin",
        blockReason:
          blockActionReason || "Violation of community trading policies.",
        appealStatus: "NONE",
        updatedAt: serverTimestamp(),
      };
      if (savedBadges) {
        blockData.savedBadges = savedBadges;
      }

      // 1. Update Firestore User Profile
      await setDoc(userRef, blockData, { merge: true });

      // 1.2 Revoke Authorized Admin rights if they hold them
      if (targetEmail) {
        const emailLower = targetEmail.toLowerCase().trim();
        await deleteDoc(doc(db, "authorizedAdmins", emailLower));
        setAuthAdmins((prev) => prev.filter((a) => a.id !== emailLower));
      }

      // 1.5 Update user listings to SUSPENDED so they are hidden from marketplace
      const qListings = query(
        collection(db, "listings"),
        where("ownerId", "==", userId),
      );
      const listingsSnap = await getDocs(qListings);

      const updatePromises = listingsSnap.docs
        .filter((l) =>
          ["LIVE", "BOOKED", "REJECTED", "SOLD", "PENDING"].includes(
            l.data().status,
          ),
        )
        .map((listingDoc) =>
          updateDoc(listingDoc.ref, {
            status: "SUSPENDED",
            previousStatus: listingDoc.data().status || "LIVE",
            isSuspended: true,
            moderationNote: "Visibility suspended due to account restriction.",
          }),
        );
      await Promise.all(updatePromises);

      // Log block action
      try {
        await setDoc(doc(collection(db, "adminLogs")), {
          adminId: user?.uid || "unknown_admin",
          adminEmail: user?.email || "Admin",
          adminCode: userProfile?.adminCode || null,
          blockedUserId: userId,
          targetEmail: targetEmail || "unknown",
          targetName: targetName || "User",
          action: "BLOCK",
          timestamp: serverTimestamp(),
          reason: blockActionReason || "Violation of community trading policies."
        });
      } catch (err) {}

      // 2. Update Local State
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser({
          ...selectedUser,
          ...blockData,
          blockedAt: new Date() as any,
        });
      }

      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, ...blockData, blockedAt: new Date() as any }
            : u,
        ),
      );

      alert(
        `SUCCESS: Account ${targetName} blocked.\n${listingsSnap.size} listings have been suspended.`,
      );

      // Move to blocked accounts tab
      setActiveTab("blockedAccounts");
      await fetchData();
      setShowBlockModal(false);
      setIsViewingUser(false);
    } catch (e) {
      console.error("Block operation failed:", e);
      alert(
        `BLOCK FAILED: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setIsBlockingInProgress(false);
    }
  };

  const unblockUser = async (userId: string, targetName: string) => {
    if (!user || !isAdmin) {
      alert("❌ Unauthorized: Admin access required.");
      return;
    }

    if (!userId) {
      alert("❌ Error: Missing user identifier.");
      return;
    }

    try {
      const uDoc = await getDoc(doc(db, "users", userId));
      if (uDoc.exists()) {
        const uData = uDoc.data();
        if (["imran7297510@gmail.com", "imran7297510@gmail"].includes(uData?.email?.toLowerCase().trim() || "") && !isSuperAdmin) {
          alert("Authorized admins are never able or authorized to take any action against the administrator.");
          return;
        }
      }
    } catch {}

    // Central confirmation flow triggers standard modal dialog instead of window confirm
    setUnblockConfirm({ userId, targetName });
  };

  const handleExecuteUnblock = async () => {
    if (!unblockConfirm) return;
    const { userId, targetName } = unblockConfirm;

    setProcessingUnblockId(userId);
    setUnblockConfirm(null); // dismiss popup immediately

    try {
      // Execute progress-tracked central unblock workflow
      await executeCentralUnblock(
        userId,
        user?.email || "Admin",
        user?.uid || "admin",
        userProfile?.adminCode
      );

      // Update local state for immediate feedback
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                isBlocked: false,
                accountStatus: "active",
                status: "ACTIVE",
              }
            : u,
        ),
      );

      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser({
          ...selectedUser,
          isBlocked: false,
          accountStatus: "active",
          status: "ACTIVE",
          isVerified:
            selectedUser.savedBadges?.isVerified ?? selectedUser.isVerified,
          verifiedBadgeType:
            selectedUser.savedBadges?.verifiedBadgeType ??
            selectedUser.verifiedBadgeType,
          badges: selectedUser.savedBadges?.badges ?? selectedUser.badges,
        });
      }

      alert("Account successfully unblocked and all permissions restored.");

      // Force refresh of the lists
      await fetchData();
    } catch (e: any) {
      console.error("Execute unblock failed:", e);
      alert(`Unable to complete unblock action: ${e.message || "Please try again."}`);
    } finally {
      setProcessingUnblockId(null);
    }
  };

  const handleUnpauseUser = async (userId: string, targetName: string) => {
    if (!user || !isAdmin) {
      alert("❌ Unauthorized: Admin access required.");
      return;
    }
    if (!userId) {
      alert("❌ Error: Missing user identifier.");
      return;
    }

    if (!window.confirm(`Are you sure you want to unpause and reactivate account for ${targetName}? All user activities and paused listings will be restored.`)) {
      return;
    }

    setProcessingUnpauseId(userId);
    try {
      await executeCentralUnpause(
        userId,
        user.email || "Admin",
        user.uid || "admin",
        userProfile?.adminCode
      );

      setPausedUsers((prev) => prev.filter((u) => u.id !== userId));
      setAllUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, isPaused: false, accountStatus: "active", status: "ACTIVE", pauseReason: "" }
            : u
        )
      );

      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser({
          ...selectedUser,
          isPaused: false,
          accountStatus: "active",
          status: "ACTIVE",
          pauseReason: "",
        });
      }

      alert(`Account for ${targetName} has been successfully resumed and unpaused.`);
      await fetchData();
    } catch (e: any) {
      console.error("Execute unpause failed:", e);
      alert(`Unable to unpause account: ${e.message || "Please try again."}`);
    } finally {
      setProcessingUnpauseId(null);
    }
  };

  const handlePauseUser = async (userId: string, targetName: string, customReason?: string) => {
    if (!user || !isAdmin) {
      alert("❌ Unauthorized: Admin access required.");
      return;
    }
    if (!userId) return;

    if (userId === user?.uid) {
      alert("CRITICAL ERROR: You cannot pause your own administrator account.");
      return;
    }

    try {
      const uDoc = await getDoc(doc(db, "users", userId));
      if (uDoc.exists()) {
        const uData = uDoc.data();
        if (["imran7297510@gmail.com", "imran7297510@gmail"].includes(uData?.email?.toLowerCase().trim() || "") && !isSuperAdmin) {
          alert("Authorized admins are never able or authorized to take any action against the administrator.");
          return;
        }
      }
    } catch {}

    const reason = customReason || pauseActionReason || "Account temporarily placed on pause by administration.";

    setIsPausingInProgress(true);
    try {
      await executeCentralPause(
        userId,
        user.email || "Admin",
        user.uid || "admin",
        reason,
        userProfile?.adminCode
      );

      setPauseModalTarget(null);
      setPauseActionReason("");
      setShowManualPauseModal(false);
      setManualPauseUserQuery("");

      alert(`Account for ${targetName} has been successfully placed on pause.`);
      await fetchData();
    } catch (e: any) {
      console.error("Execute pause failed:", e);
      alert(`Unable to pause account: ${e.message || "Please try again."}`);
    } finally {
      setIsPausingInProgress(false);
    }
  };

  const handleUpdatePermissions = async () => {
    if (!isSuperAdmin || !editingAdmin) return;
    setIsUpdatingPermissions(true);
    try {
      const adminEmail = editingAdmin.email.toLowerCase().trim();
      const adminRef = doc(db, "authorizedAdmins", adminEmail);
      await updateDoc(adminRef, {
        allowedSections: editingSections,
      });

      const q = query(collection(db, "users"), where("email", "==", adminEmail));
      const userSnap = await getDocs(q);
      if (!userSnap.empty) {
        await updateDoc(userSnap.docs[0].ref, {
          allowedSections: editingSections,
        });
      }

      setAuthAdmins((prev) =>
        prev.map((adm) =>
          adm.email.toLowerCase().trim() === adminEmail
            ? { ...adm, allowedSections: editingSections }
            : adm
        )
      );

      setAuthAdminSuccess(`Successfully updated permissions for ${adminEmail}.`);
      setEditingAdmin(null);
    } catch (err: any) {
      console.error("Error updating admin permissions: ", err);
      alert("Failed to update admin permissions. Please try again.");
    } finally {
      setIsUpdatingPermissions(false);
    }
  };

  const addAuthorizedAdmin = async () => {
    if (!isSuperAdmin) {
      setAuthAdminError(
        "Only the super administrator can perform this action.",
      );
      return;
    }
    setAuthAdminError(null);
    setAuthAdminSuccess(null);

    if (!newAdminEmail) return;
    if (!newAdminCode.trim()) {
      setAuthAdminError("Please issue a unique code for this admin.");
      return;
    }
    if (selectedSections.length === 0) {
      setAuthAdminError("Please select at least one permitted section for this admin.");
      return;
    }
    const sanitizedEmail = newAdminEmail.toLowerCase().trim();
    const sanitizedCode = newAdminCode.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
      setAuthAdminError("Please enter a valid email address.");
      return;
    }

    try {
      const q = query(
        collection(db, "users"),
        where("email", "==", sanitizedEmail),
      );
      const querySnapshot = await getDocs(q);

      const proceedWithAuthorization = async () => {
        try {
          const adminRef = doc(db, "authorizedAdmins", sanitizedEmail);
          await setDoc(adminRef, {
            email: sanitizedEmail,
            addedAt: serverTimestamp(),
            addedBy: user?.email,
            adminCode: sanitizedCode,
            allowedSections: selectedSections
          });
          
          if (!querySnapshot.empty) {
            const userDoc = querySnapshot.docs[0];
            await updateDoc(userDoc.ref, {
              isAuthorizedAdmin: true,
              adminCode: sanitizedCode
            });
          }

          setNewAdminEmail("");
          setNewAdminCode("");
          setSelectedSections([
            "reports", "profileReports", "kycVerifications", "nameRequests", "blockedAccounts", "search", "support", "promotions", "appeals", "refunds", "broadcast", "authAdmins"
          ]);

          setAuthAdmins((prev) => {
            if (prev.some((a) => a.id === sanitizedEmail)) {
              return prev.map(a => a.id === sanitizedEmail ? { ...a, allowedSections: selectedSections, adminCode: sanitizedCode } : a);
            }
            return [
              ...prev,
              {
                id: sanitizedEmail,
                email: sanitizedEmail,
                addedAt: { seconds: Date.now() / 1000 } as any,
                addedBy: user?.email || "",
                adminCode: sanitizedCode,
                allowedSections: selectedSections
              } as AuthorizedAdminEmail,
            ];
          });

          setAuthAdminSuccess(
            `Successfully authorized ${sanitizedEmail} as an administrator.`,
          );
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (err: any) {
          console.error(err);
          setAuthAdminError(
            err.message || "Failed to authorize admin in database.",
          );
        }
      };

      if (querySnapshot.empty) {
        setConfirmAction({
          message: `The email address "${sanitizedEmail}" is not currently registered on the platform. Would you like to authorize it anyway so they can gain admin access as soon as they sign up?`,
          onConfirm: proceedWithAuthorization,
        });
      } else {
        setConfirmAction({
          message: `Are you sure you want to grant administrative access to ${sanitizedEmail}?`,
          onConfirm: proceedWithAuthorization,
        });
      }
    } catch (e: any) {
      console.error(e);
      setAuthAdminError(
        e.message || "Failed to query registered user records.",
      );
    }
  };

  const removeAuthorizedAdmin = async (id: string, bypassConfirm = false) => {
    if (!isSuperAdmin) {
      setAuthAdminError(
        "Only the super administrator can perform this action.",
      );
      return;
    }
    setAuthAdminError(null);
    setAuthAdminSuccess(null);

    const performRevocation = async () => {
      try {
        await deleteDoc(doc(db, "authorizedAdmins", id));
        
        // Find if this is a user and remove their admin rights
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", id));
        const qs = await getDocs(q);
        if (!qs.empty) {
          const userDoc = qs.docs[0];
          await updateDoc(userDoc.ref, {
            isAuthorizedAdmin: false,
            adminCode: null
          });
        }

        try {
          await setDoc(doc(collection(db, "adminLogs")), {
            adminId: user?.uid || "unknown_admin",
            adminEmail: user?.email || "Admin",
            adminCode: userProfile?.adminCode || null,
            targetEmail: id,
            action: "REVOKED",
            targetType: "AUTHORIZED_ADMIN",
            timestamp: serverTimestamp(),
            reason: "Super Admin removed privileges"
          });
        } catch (e) {}

        setAuthAdmins((prev) => prev.filter((a) => a.id !== id));
        setAuthAdminSuccess(`Successfully revoked admin access for ${id}.`);
      } catch (e: any) {
        console.error(e);
        setAuthAdminError(
          e.message ||
            `Failed to remove administrative privileges for ${id}.`,
        );
      }
    };

    if (bypassConfirm) {
      await performRevocation();
    } else {
      setConfirmAction({
        message: `Are you sure you want to REVOKE administrative access for ${id}?`,
        onConfirm: performRevocation,
      });
    }
  };

  const addAuthorizedVerifier = async () => {
    if (!isSuperAdmin) {
      setAuthVerifierError(
        "Only the super administrator can perform this action.",
      );
      return;
    }
    setAuthVerifierError(null);
    setAuthVerifierSuccess(null);

    if (!newVerifierEmail) return;
    const sanitizedEmail = newVerifierEmail.toLowerCase().trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedEmail)) {
      setAuthVerifierError("Please enter a valid email address.");
      return;
    }

    try {
      const q = query(
        collection(db, "users"),
        where("email", "==", sanitizedEmail),
      );
      const querySnapshot = await getDocs(q);

      const proceedWithAuthorization = async () => {
        try {
          const verifierRef = doc(db, "authorizedPaymentVerifiers", sanitizedEmail);
          await setDoc(verifierRef, {
            email: sanitizedEmail,
            addedAt: serverTimestamp(),
            addedBy: user?.email,
          });
          setNewVerifierEmail("");

          setAuthVerifiers((prev) => {
            if (prev.some((a) => a.id === sanitizedEmail)) return prev;
            return [
              ...prev,
              {
                id: sanitizedEmail,
                email: sanitizedEmail,
                addedAt: { seconds: Date.now() / 1000 } as any,
                addedBy: user?.email || "",
              },
            ];
          });

          setAuthVerifierSuccess(
            `Successfully authorized ${sanitizedEmail} as a payment verifier.`,
          );
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (err: any) {
          console.error(err);
          setAuthVerifierError(
            err.message || "Failed to authorize payment verifier in database.",
          );
        }
      };

      if (querySnapshot.empty) {
        setConfirmAction({
          message: `The email address "${sanitizedEmail}" is not currently registered on the platform. Would you like to authorize it anyway so they can gain verifier access as soon as they sign up?`,
          onConfirm: proceedWithAuthorization,
        });
      } else {
        setConfirmAction({
          message: `Are you sure you want to grant payment verifier access to ${sanitizedEmail}?`,
          onConfirm: proceedWithAuthorization,
        });
      }
    } catch (e: any) {
      console.error(e);
      setAuthVerifierError(
        e.message || "Failed to query registered user records.",
      );
    }
  };

  const removeAuthorizedVerifier = async (id: string, bypassConfirm = false) => {
    if (!isSuperAdmin) {
      setAuthVerifierError(
        "Only the super administrator can perform this action.",
      );
      return;
    }
    setAuthVerifierError(null);
    setAuthVerifierSuccess(null);

    const performRevocation = async () => {
      try {
        await deleteDoc(doc(db, "authorizedPaymentVerifiers", id));
        setAuthVerifiers((prev) => prev.filter((a) => a.id !== id));
        setAuthVerifierSuccess(`Successfully revoked payment verifier access for ${id}.`);
      } catch (e: any) {
        console.error(e);
        setAuthVerifierError(
          e.message || `Failed to remove payment verifiers privileges for ${id}.`,
        );
      }
    };

    if (bypassConfirm) {
      await performRevocation();
    } else {
      setConfirmAction({
        message: `Are you sure you want to REVOKE payment verifications access for ${id}?`,
        onConfirm: performRevocation,
      });
    }
  };

  const viewAccountDetailByEmail = async (email: string) => {
    try {
      const q = query(
        collection(db, "users"),
        where("email", "==", email.toLowerCase().trim()),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const uDoc = snap.docs[0];
        viewAccountDetail({ ...uDoc.data(), id: uDoc.id } as UserProfile);
      } else {
        setAuthAdminError(`User profile not found for email: ${email}`);
      }
    } catch (e) {
      console.error(e);
      setAuthAdminError("Error fetching user profile.");
    }
  };

  const fetchAdminActivities = async (email: string) => {
    setLoadingActivities(true);
    try {
      const q = query(
        collection(db, "adminLogs"),
        where("adminEmail", "==", email),
        orderBy("timestamp", "desc"),
        limit(20)
      );
      const snap = await getDocs(q);
      setOpenedAdminActivities(snap.docs.map(docSnap => ({ ...docSnap.data(), id: docSnap.id })));
    } catch (e) {
      console.error("Error fetching admin activities:", e);
      try {
        const qSimple = query(
          collection(db, "adminLogs"),
          where("adminEmail", "==", email),
          limit(20)
        );
        const snap = await getDocs(qSimple);
        const logs = snap.docs.map(docSnap => ({ ...docSnap.data(), id: docSnap.id }));
        logs.sort((a: any, b: any) => {
          const timeA = a.timestamp?.seconds || 0;
          const timeB = b.timestamp?.seconds || 0;
          return timeB - timeA;
        });
        setOpenedAdminActivities(logs);
      } catch (e2) {
        console.error("Simple activities query failed:", e2);
        setOpenedAdminActivities([]);
      }
    } finally {
      setLoadingActivities(false);
    }
  };

  const revokeAuthorizedAdminByEmail = async (email: string) => {
    if (!isSuperAdmin) {
      setAuthAdminError(
        "Only the super administrator can perform this action.",
      );
      return;
    }
    const sanitizedEmail = email.toLowerCase().trim();
    setAuthAdminError(null);
    setAuthAdminSuccess(null);

    setConfirmAction({
      message: `Are you sure you want to REVOKE administrative access for ${sanitizedEmail}?`,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "authorizedAdmins", sanitizedEmail));
          setAuthAdmins((prev) => prev.filter((a) => a.id !== sanitizedEmail));
          setIsViewingUser(false);
          setAuthAdminSuccess(
            `Successfully revoked privileges for ${sanitizedEmail}.`,
          );
        } catch (e: any) {
          console.error(e);
          setAuthAdminError(
            e.message ||
              `Failed to revoke authorized admin privileges for ${sanitizedEmail}.`,
          );
        }
      },
    });
  };

  const initiateChat = async (targetUserId: string) => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "chats"),
        where("buyerId", "==", targetUserId),
        where("sellerId", "==", "ADMIN"),
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        navigate("/messages");
        return;
      }

      const chatRef = doc(collection(db, "chats"));
      await setDoc(chatRef, {
        listingId: "SUPPORT",
        buyerId: targetUserId,
        sellerId: "ADMIN",
        lastMessage: "",
        updatedAt: serverTimestamp(),
      });
      navigate("/messages");
    } catch (e) {
      console.error(e);
    }
  };

  const ReportStats = ({ items, type }: { items: any[]; type: string }) => {
    if (type === "Reports") {
      return (
        <div className="flex gap-2 md:gap-4 mb-8 overflow-x-auto pb-2 no-scrollbar">
          <div className="bg-stone-100 border border-stone-200 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[100px] md:min-w-[120px] shadow-sm">
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-stone-400 mb-1">
              All Reports
            </span>
            <span className="text-lg md:text-xl font-black italic text-stone-900">
              {moderationMetrics.allReportsCount || 0}
            </span>
          </div>
          <div className="bg-blue-50 border border-blue-100 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[100px] md:min-w-[120px] shadow-sm">
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-blue-600 mb-1">
              Available
            </span>
            <span className="text-lg md:text-xl font-black italic text-blue-800">
              {moderationMetrics.availableReportsCount || 0}
            </span>
          </div>
          <div className="bg-red-50 border border-red-100 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[100px] md:min-w-[120px] shadow-sm">
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-red-600 mb-1">
              Pending
            </span>
            <span className="text-lg md:text-xl font-black italic text-red-700">
              {moderationMetrics.pendingReportsCount || 0}
            </span>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[100px] md:min-w-[120px] shadow-sm">
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-emerald-600 mb-1">
              Resolved
            </span>
            <span className="text-lg md:text-xl font-black italic text-emerald-700">
              {moderationMetrics.resolvedReportsCount || 0}
            </span>
          </div>
          <div className="bg-stone-100 border border-stone-300 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[100px] md:min-w-[120px] shadow-sm">
            <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-stone-500 mb-1">
              Dismissed
            </span>
            <span className="text-lg md:text-xl font-black italic text-stone-700">
              {moderationMetrics.dismissedReportsCount || 0}
            </span>
          </div>
        </div>
      );
    }

    const total = items.length;
    const resolved = items.filter((i) => i.status === "RESOLVED").length;
    const pending = items.filter((i) => i.status === "OPEN").length;

    return (
      <div className="flex gap-2 md:gap-4 mb-8 overflow-x-auto pb-2 no-scrollbar">
        <div className="bg-stone-100 border border-stone-200 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[90px] md:min-w-[110px] shadow-sm">
          <span className="text-xs md:text-xs font-black uppercase tracking-widest text-stone-400 mb-1">
            Total {type}
          </span>
          <span className="text-lg md:text-xl font-black italic text-stone-900">
            {total}
          </span>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[90px] md:min-w-[110px] shadow-sm">
          <span className="text-xs md:text-xs font-black uppercase tracking-widest text-emerald-600 mb-1">
            Action Taken
          </span>
          <span className="text-lg md:text-xl font-black italic text-emerald-700">
            {resolved}
          </span>
        </div>
        <div className="bg-red-50 border border-red-100 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[90px] md:min-w-[110px] shadow-sm">
          <span className="text-xs md:text-xs font-black uppercase tracking-widest text-red-600 mb-1">
            Pending
          </span>
          <span className="text-lg md:text-xl font-black italic text-red-700">
            {pending}
          </span>
        </div>
      </div>
    );
  };

  const ListingStats = ({ items }: { items: any[] }) => {
    const total = items.length;
    const live = items.filter((i) => i.status === "LIVE").length;
    const pending = items.filter((i) => i.status === "PENDING").length;
    const suspended = items.filter((i) => i.status === "SUSPENDED").length;

    return (
      <div className="flex gap-2 md:gap-3 mb-6 overflow-x-auto pb-2 no-scrollbar">
        <div className="bg-stone-100 border border-stone-200 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[85px] md:min-w-[100px] shadow-sm">
          <span className="text-xs md:text-xs font-black uppercase tracking-tighter text-stone-400 mb-1">
            Total Posts
          </span>
          <span className="text-lg md:text-xl font-black italic text-stone-900">
            {total}
          </span>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[85px] md:min-w-[100px] shadow-sm">
          <span className="text-xs md:text-xs font-black uppercase tracking-tighter text-emerald-600 mb-1">
            Live Now
          </span>
          <span className="text-lg md:text-xl font-black italic text-emerald-700">
            {live}
          </span>
        </div>
        <div className="bg-amber-50 border border-amber-100 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[85px] md:min-w-[100px] shadow-sm">
          <span className="text-xs md:text-xs font-black uppercase tracking-tighter text-amber-600 mb-1">
            Pending
          </span>
          <span className="text-lg md:text-xl font-black italic text-amber-700">
            {pending}
          </span>
        </div>
        <div className="bg-red-50 border border-red-100 p-3 md:p-4 rounded-xl md:rounded-2xl shrink-0 flex flex-col items-center justify-center min-w-[85px] md:min-w-[100px] shadow-sm">
          <span className="text-xs md:text-xs font-black uppercase tracking-tighter text-red-600 mb-1">
            Suspended
          </span>
          <span className="text-lg md:text-xl font-black italic text-red-700">
            {suspended}
          </span>
        </div>
      </div>
    );
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case "listings":
        return "Marketplace Listings";
      case "reports":
        return "Reported Listings";
      case "profileReports":
        return "Reported Profiles";
      case "blockedAccounts":
        return "Blocked/ Banned Accounts";
      case "pausedAccounts":
        return "Paused Accounts";
      case "users":
        return "Application for Verified Seller";
      case "allUsers":
        return "Accounts Management";
      case "support":
        return "Support Tickets";
      case "promotions":
        return "Promotion Requests";
      case "broadcast":
        return "Community Broadcast";
      case "authAdmins":
        return "Admins & Verifiers";
      case "paymentVerifiers":
        return "Payment Verifiers";
      case "search":
        return "Search Console";
      case "analysis":
        return "Platform Analysis";
      default:
        return activeTab
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase());
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-black text-stone-900 mb-4 tracking-tighter uppercase italic">
          Operational Access Needed
        </h1>
        <p className="text-stone-600 mb-8 font-medium">
          You must be logged in as an authorized administrator to access the
          Mandi controls.
        </p>
        <Link
          to="/"
          className="inline-block bg-amber-500 text-stone-900 font-black px-8 py-3 rounded-xl shadow-lg active:scale-95"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden">
      {/* Persistent Sidebar */}
      <aside className="w-64 bg-stone-900 text-stone-400 shrink-0 border-r border-stone-800 hidden lg:flex flex-col h-screen">
        <div className="p-8 border-b border-stone-800">
          <h1 className="text-white font-black uppercase italic tracking-tighter text-xl leading-none">
            Mandi <span className="text-amber-500">Admin</span>
          </h1>
          <p className="text-xs font-bold uppercase tracking-[0.3em] mt-2 text-stone-400">
            Control Center
          </p>
        </div>

        <nav className="flex-grow p-4 space-y-1 overflow-y-auto scrollbar-none">
          {allowedMobileAndSidebarTabs.map((tab) => (
            <SidebarLink
              key={tab.id}
              id={tab.id as any}
              icon={tab.icon}
              label={tab.label}
            />
          ))}
        </nav>

        <div className="p-4 border-t border-stone-800 space-y-2">
          <Link
            to="/"
            className="w-full flex items-center gap-3 bg-stone-800 text-stone-300 hover:bg-amber-500 hover:text-stone-900 px-4 py-3 rounded-xl font-bold transition-all text-xs"
          >
            <HomeIcon className="w-4 h-4" /> Exit to Storefront
          </Link>
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-3 bg-stone-800 text-stone-400 px-4 py-3 rounded-xl font-bold transition-all hover:bg-red-500 hover:text-white text-xs"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-grow flex flex-col min-w-0 lg:h-screen">
        {/* Mobile Tab Navigation */}
        <div className="lg:hidden bg-white border-b border-stone-200 z-[50]">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-stone-900 font-bold text-xs uppercase tracking-widest italic text-amber-600">
              {
                allowedMobileAndSidebarTabs.find((t) => t.id === activeTab)?.label || "Menu"
              }
            </span>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 bg-stone-100 rounded-lg"
            >
              <Menu className="w-5 h-5 text-stone-900" />
            </button>
          </div>

          {isMobileMenuOpen && (
            <div className="border-t border-stone-100 divide-y divide-stone-100 max-h-[60vh] overflow-y-auto">
              {allowedMobileAndSidebarTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 w-full px-6 py-4 text-xs font-black uppercase tracking-widest transition-all ${
                    activeTab === tab.id
                      ? "text-amber-600 bg-amber-50"
                      : "text-stone-400 hover:bg-stone-50"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
              <Link
                to="/"
                className="flex items-center gap-3 w-full px-6 py-4 text-xs font-black uppercase tracking-widest transition-all text-amber-600 bg-amber-50/50 hover:bg-amber-100 border-t border-stone-100/50"
              >
                <HomeIcon className="w-4 h-4" /> Exit to Storefront
              </Link>
            </div>
          )}
        </div>

        <main className="p-3 md:p-6 flex-grow overflow-y-auto scrollbar-none pb-32 md:pb-8">
          {loading ? (
            <div className="py-12 md:py-20 text-center flex flex-col items-center">
              <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
              <p className="text-stone-400 font-bold uppercase text-xs tracking-widest">
                Accessing Mandi Database...
              </p>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-4 md:space-y-6">
              {activeTab === "listings" && (
                <div className="space-y-4 md:space-y-6">
                  <ListingStats items={listings} />
                  <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-stone-100 shadow-sm flex flex-col gap-3 md:gap-4">
                    <div className="flex items-center gap-3 md:gap-4">
                      <Search className="text-amber-500 w-5 h-5 md:w-6 md:h-6" />
                      <input
                        type="text"
                        placeholder="Search products by title or seller..."
                        className="flex-grow bg-transparent border-none focus:ring-0 font-bold text-stone-900 text-sm md:text-base"
                        value={listingsSearch}
                        onChange={(e) => setListingsSearch(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          setAppliedListingsSearch(listingsSearch)
                        }
                      />
                    </div>
                    <button
                      onClick={() => setAppliedListingsSearch(listingsSearch)}
                      className="w-full md:w-fit px-8 py-2.5 md:py-2 bg-stone-900 text-white rounded-lg md:rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-500 hover:text-stone-900 transition-all shadow-lg"
                    >
                      Search
                    </button>
                  </div>

                  <div className="bg-white rounded-xl md:rounded-[2rem] shadow-sm border border-stone-100 overflow-hidden shrink-0">
                    <div className="overflow-x-auto scrollbar-none snap-x">
                      <table className="min-w-full divide-y divide-stone-100 border-separate border-spacing-0">
                        <thead className="bg-stone-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest bg-stone-50">
                              Merchant/Product
                            </th>
                            <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest bg-stone-50">
                              Category
                            </th>
                            <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest bg-stone-50">
                              Status
                            </th>
                            <th className="px-4 md:px-6 py-3 md:py-4 text-right text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest bg-stone-50">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-50">
                          {listings
                            .filter(
                              (l) =>
                                !appliedListingsSearch ||
                                l.title
                                  .toLowerCase()
                                  .includes(
                                    appliedListingsSearch.toLowerCase(),
                                  ) ||
                                l.sellerName
                                  ?.toLowerCase()
                                  .includes(
                                    appliedListingsSearch.toLowerCase(),
                                  ),
                            )
                            .map((l) => (
                              <tr
                                key={l.id}
                                className="hover:bg-stone-50/50 transition-colors"
                              >
                                <td className="px-4 md:px-6 py-3 md:py-4">
                                  <button
                                    onClick={() => setSelectedListingDetail(l)}
                                    className="text-left block w-full focus:outline-none"
                                  >
                                    <div className="font-black text-stone-900 text-xs md:text-sm italic hover:text-amber-600 truncate max-w-[120px] md:max-w-[200px]">
                                      {l.title}
                                    </div>
                                    <div className="text-xs md:text-xs text-stone-400 font-bold uppercase tracking-widest truncate">
                                      {l.sellerName}
                                    </div>
                                  </button>
                                </td>
                                <td className="px-4 md:px-6 py-3 md:py-4">
                                  <span className="text-xs md:text-xs font-black text-stone-400 bg-stone-100 px-2 py-0.5 md:py-1 rounded-md uppercase tracking-tight">
                                    {l.category}
                                  </span>
                                </td>
                                <td className="px-4 md:px-6 py-3 md:py-4">
                                  <span
                                    className={`text-xs md:text-xs font-black px-2 py-0.5 md:px-2.5 md:py-1 rounded-lg uppercase tracking-wider ${l.status === "LIVE" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}
                                  >
                                    {l.status}
                                  </span>
                                </td>
                                <td className="px-4 md:px-6 py-3 md:py-4 text-right space-x-1 md:space-x-2">
                                  <button
                                    onClick={() => setSelectedListingDetail(l)}
                                    className="p-1.5 md:p-2 bg-stone-50 hover:bg-amber-50 text-amber-600 rounded-lg border border-stone-100 transition-all"
                                    title="View Full Details"
                                  >
                                    <Eye className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      updateStatus(
                                        l.id,
                                        l.status === "LIVE"
                                          ? "PENDING"
                                          : "LIVE",
                                      )
                                    }
                                    className="p-1.5 md:p-2 bg-stone-50 hover:bg-emerald-50 text-emerald-600 rounded-lg border border-stone-100 transition-all"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                  </button>
                                  <button
                                    onClick={() => deleteListing(l.id)}
                                    className="p-1.5 md:p-2 bg-stone-50 hover:bg-red-50 text-red-600 rounded-lg border border-stone-100 transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "allUsers" && (
                <div className="space-y-4 md:space-y-6">
                  <div className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-stone-100 shadow-sm flex flex-col gap-3 md:gap-4">
                    <div className="flex items-center gap-3 md:gap-4">
                      <User className="text-amber-500 w-5 h-5 md:w-6 md:h-6" />
                      <input
                        type="text"
                        placeholder="Search user by email or name..."
                        className="flex-grow bg-transparent border-none focus:ring-0 font-bold text-stone-900 text-sm md:text-base"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && setAppliedUserSearch(userSearch)
                        }
                      />
                    </div>
                    <button
                      onClick={() => setAppliedUserSearch(userSearch)}
                      className="w-full md:w-fit px-8 py-2.5 md:py-2 bg-stone-900 text-white rounded-lg md:rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-500 hover:text-stone-900 transition-all shadow-lg"
                    >
                      Search
                    </button>
                  </div>

                  <div className="bg-white rounded-xl md:rounded-[2rem] shadow-sm border border-stone-100 overflow-hidden shrink-0">
                    <div className="overflow-x-auto scrollbar-none snap-x">
                      <table className="min-w-full divide-y divide-stone-100 border-separate border-spacing-0">
                        <thead className="bg-stone-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest bg-stone-50 w-12 md:w-16">
                              Sr.
                            </th>
                            <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest bg-stone-50">
                              Profile & Email
                            </th>
                            <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest bg-stone-50">
                              Registered
                            </th>
                            <th className="px-4 md:px-6 py-3 md:py-4 text-left text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest bg-stone-50">
                              Badge Status
                            </th>
                            <th className="px-4 md:px-6 py-3 md:py-4 text-right text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest bg-stone-50">
                              Manage
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-50">
                          {allUsers
                            .filter(
                              (u) =>
                                !appliedUserSearch ||
                                u.email
                                  ?.toLowerCase()
                                  .includes(appliedUserSearch.toLowerCase()) ||
                                u.name
                                  ?.toLowerCase()
                                  .includes(appliedUserSearch.toLowerCase()),
                            )
                            .map((u, index) => (
                              <tr
                                key={u.id}
                                className={`${u.isBlocked ? "bg-red-50/30" : "hover:bg-stone-50/50"} transition-colors`}
                              >
                                <td className="px-4 md:px-6 py-3 md:py-4 text-xs md:text-xs font-black text-stone-400 tracking-tighter">
                                  {String(index + 1).padStart(2, "0")}
                                </td>
                                <td className="px-4 md:px-6 py-3 md:py-4">
                                  <div className="font-black text-stone-900 text-xs md:text-sm italic flex items-center gap-1 md:gap-2">
                                    {u.name || "Anonymous user"}
                                    {u.isVerified && (
                                      <ShieldCheck
                                        className={`w-3 h-3 ${u.verifiedBadgeType === "GOLDEN" ? "text-amber-500" : "text-emerald-500"}`}
                                      />
                                    )}
                                  </div>
                                  {u.isBlocked && (
                                    <span className="px-2 py-0.5 bg-red-600 text-white text-[7px] md:text-xs font-black rounded-full uppercase tracking-widest inline-block w-fit mt-1">
                                      Blocked
                                    </span>
                                  )}
                                  <div className="text-xs md:text-xs text-stone-400 font-bold uppercase tracking-widest mt-0.5 truncate max-w-[120px] md:max-w-none">
                                    {u.email}
                                  </div>
                                </td>
                                <td className="px-4 md:px-6 py-3 md:py-4">
                                  <div className="text-xs md:text-xs font-black text-stone-600 uppercase tracking-widest whitespace-nowrap">
                                    {formatSafeDate(u.createdAt)}
                                  </div>
                                </td>
                                <td className="px-4 md:px-6 py-3 md:py-4">
                                  {u.isVerified ? (
                                    <span
                                      className={`text-xs md:text-xs font-black px-2 py-0.5 md:px-2.5 md:py-1 rounded-lg uppercase tracking-widest flex items-center gap-1 md:gap-1.5 w-fit ${u.verifiedBadgeType === "GOLDEN" ? "text-amber-600 bg-amber-50 border border-amber-100" : "text-emerald-600 bg-emerald-50 border border-emerald-100"}`}
                                    >
                                      <div
                                        className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full animate-pulse ${u.verifiedBadgeType === "GOLDEN" ? "bg-amber-400" : "bg-emerald-400"}`}
                                      />
                                      {u.verifiedBadgeType === "GOLDEN"
                                        ? "PREMIUM"
                                        : "VERIFIED"}
                                    </span>
                                  ) : (
                                    <span className="text-xs md:text-xs font-black text-stone-400 bg-stone-100 px-2 py-0.5 md:px-2.5 md:py-1 rounded-lg uppercase tracking-widest w-fit border border-stone-200">
                                      NONE
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 md:px-6 py-3 md:py-4 text-right flex items-center justify-end gap-2">
                                  {u.isBlocked && (
                                    <button
                                      onClick={() =>
                                        unblockUser(u.id, u.name || "User")
                                      }
                                      disabled={processingUnblockId === u.id}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-black hover:bg-emerald-700 transition-all uppercase tracking-widest shadow-md shadow-emerald-100 disabled:opacity-50"
                                    >
                                      <UserCheck className="w-3.5 h-3.5" />
                                      <span>Unblock now</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => viewAccountDetail(u)}
                                    className="inline-flex items-center gap-1 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-stone-900 text-white rounded-lg md:rounded-xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-amber-500 hover:text-stone-900 transition-all shadow-md active:scale-95 group"
                                  >
                                    <Eye className="w-3 h-3 md:w-3.5 md:h-3.5 group-hover:scale-110 transition-transform" />{" "}
                                    <span className="hidden xs:inline">
                                      View
                                    </span>{" "}
                                    Account
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "paymentVerifiers" && (() => {
                // Map verification applications and promotions to a standard schema
                const mappedVerifyApps = allVerifyApplications.map((app: any) => {
                  const amount = app.amount || (app.durationDays === 365 ? 14999 : (app.durationDays === 90 ? 4500 : 0));
                  return {
                    id: app.id,
                    userId: app.userId,
                    userName: app.userName || 'Anonymous',
                    userEmail: app.userEmail || '',
                    type: 'VERIFIED',
                    planName: app.planName || 'Verified Badge Upgrade',
                    amount: amount,
                    status: app.status || 'PENDING',
                    createdAt: app.createdAt,
                    updatedAt: app.updatedAt || app.createdAt,
                    verifiedBy: app.verifiedBy || app.processedBy || null,
                    rejectedBy: app.rejectedBy || null,
                    refundRequested: app.refundRequested || false,
                    refundStatus: app.refundStatus || null,
                    refundedBy: app.refundedBy || null,
                    isVerificationAppCollection: true
                  };
                });

                const mappedPromotions = allPaymentPromotions.map((req: any) => {
                  return {
                    id: req.id,
                    userId: req.userId,
                    userName: req.userName || 'Anonymous',
                    userEmail: req.userEmail || '',
                    type: req.type || 'PROMOTION',
                    planName: req.planName || `${req.type} Promotion`,
                    amount: req.amount || 0,
                    status: req.status || 'PENDING',
                    createdAt: req.createdAt,
                    updatedAt: req.updatedAt || req.createdAt,
                    verifiedBy: req.verifiedBy || req.processedBy || null,
                    rejectedBy: req.rejectedBy || null,
                    refundRequested: req.refundRequested || false,
                    refundStatus: req.refundStatus || null,
                    refundedBy: req.refundedBy || null,
                    isVerificationAppCollection: false
                  };
                });

                const combinedRecords = [...mappedVerifyApps, ...mappedPromotions];

                // Calculations for Received Payments
                const appReceivedCount = combinedRecords.length;
                const statusVerifiedCount = combinedRecords.filter(r => r.status === 'APPROVED').length;
                const statusNotVerifiedCount = combinedRecords.filter(r => r.status === 'REJECTED').length;
                const statusPendingCount = combinedRecords.filter(r => r.status === 'PENDING').length;
                const totalAmountVerifiedVal = combinedRecords.filter(r => r.status === 'APPROVED').reduce((sum, r) => sum + (r.amount || 0), 0);

                // Calculations for Refunds
                const refundAppsAllCount = combinedRecords.filter(r => r.refundRequested === true).length;
                const refundAppsApprovedCount = combinedRecords.filter(r => r.refundRequested === true && r.refundStatus === 'REFUNDED').length;
                const refundAppsRejectedCount = combinedRecords.filter(r => r.refundRequested === true && r.refundStatus === 'REJECTED').length;
                
                const pendingRefundsSum = combinedRecords.filter(r => r.refundRequested === true && r.refundStatus === 'PENDING').reduce((sum, r) => sum + (r.amount || 0), 0);
                const totalAmountRefundedVal = combinedRecords.filter(r => r.refundRequested === true && r.refundStatus === 'REFUNDED').reduce((sum, r) => sum + (r.amount || 0), 0);

                // Get date helper function
                const isDateInFilterRange = (timestamp: any, fromDateStr: string, toDateStr: string) => {
                  if (!timestamp) return false;
                  let recordDate: Date;
                  if (timestamp.toDate) {
                    recordDate = timestamp.toDate();
                  } else if (timestamp.seconds) {
                    recordDate = new Date(timestamp.seconds * 1000);
                  } else {
                    recordDate = new Date(timestamp);
                  }

                  if (fromDateStr) {
                    const fromD = new Date(fromDateStr);
                    fromD.setHours(0, 0, 0, 0);
                    if (recordDate < fromD) return false;
                  }
                  if (toDateStr) {
                    const toD = new Date(toDateStr);
                    toD.setHours(23, 59, 59, 999);
                    if (recordDate > toD) return false;
                  }
                  return true;
                };

                // Create a combined list of active verifiers and admins
                const allVerifiersAndAdmins = (() => {
                  const list: { email: string; name: string; type: "verifier" | "admin"; profileImage?: string }[] = [];
                  
                  // Add authVerifiers
                  authVerifiers.forEach(v => {
                    if (v.email) {
                      list.push({
                        email: v.email,
                        name: v.name || v.email.split('@')[0],
                        type: "verifier",
                        profileImage: v.profileImage,
                      });
                    }
                  });

                  // Add authAdmins
                  authAdmins.forEach(a => {
                    if (a.email) {
                      list.push({
                        email: a.email,
                        name: a.name || a.email.split('@')[0],
                        type: "admin",
                        profileImage: a.profileImage,
                      });
                    }
                  });

                  // Extract any unique email from records that is not in the list yet
                  combinedRecords.forEach(r => {
                    const emailsToCheck = [r.verifiedBy, r.rejectedBy, r.refundedBy];
                    emailsToCheck.forEach(email => {
                      if (email && typeof email === 'string' && !list.some(item => item.email.toLowerCase() === email.toLowerCase())) {
                        list.push({
                          email: email,
                          name: email.split('@')[0],
                          type: "verifier",
                          profileImage: "",
                        });
                      }
                    });
                  });

                  return list;
                })();

                // Calculate verifiers stats based on date selections
                const verifierStatsList = allVerifiersAndAdmins.map(v => {
                  const approvedByThis = combinedRecords.filter(r => {
                    const isThisVerifier = r.verifiedBy && r.verifiedBy.toLowerCase() === v.email.toLowerCase();
                    const isInRange = isDateInFilterRange(r.approvedAt || r.updatedAt || r.createdAt, verifiersFromDate, verifiersToDate);
                    return r.status === 'APPROVED' && isThisVerifier && isInRange;
                  });

                  const rejectedByThis = combinedRecords.filter(r => {
                    const isThisVerifier = r.rejectedBy && r.rejectedBy.toLowerCase() === v.email.toLowerCase();
                    const isInRange = isDateInFilterRange(r.rejectedAt || r.updatedAt || r.createdAt, verifiersFromDate, verifiersToDate);
                    return r.status === 'REJECTED' && isThisVerifier && isInRange;
                  });

                  const refundedByThis = combinedRecords.filter(r => {
                    const isThisVerifier = r.refundedBy && r.refundedBy.toLowerCase() === v.email.toLowerCase();
                    const isInRange = isDateInFilterRange(r.refundedAt || r.updatedAt || r.createdAt, verifiersFromDate, verifiersToDate);
                    return r.refundRequested && r.refundStatus === 'REFUNDED' && isThisVerifier && isInRange;
                  });

                  const totalReceivedByThis = approvedByThis.reduce((sum, r) => sum + (r.amount || 0), 0);
                  const totalRefundedByThis = refundedByThis.reduce((sum, r) => sum + (r.amount || 0), 0);

                  // All chronological history logs for this admin
                  const actionHistoryLogs = [
                    ...approvedByThis.map(x => ({ ...x, actionTaken: 'APPROVED' })),
                    ...rejectedByThis.map(x => ({ ...x, actionTaken: 'REJECTED' })),
                    ...refundedByThis.map(x => ({ ...x, actionTaken: 'REFUNDED' }))
                  ].sort((a, b) => {
                    const tA = a.updatedAt?.seconds || (a.updatedAt ? new Date(a.updatedAt).getTime() / 1000 : 0);
                    const tB = b.updatedAt?.seconds || (b.updatedAt ? new Date(b.updatedAt).getTime() / 1000 : 0);
                    return tB - tA;
                  });

                  return {
                    ...v,
                    approvedCount: approvedByThis.length,
                    rejectedCount: rejectedByThis.length,
                    refundedCount: refundedByThis.length,
                    totalReceived: totalReceivedByThis,
                    totalRefunded: totalRefundedByThis,
                    historyLogs: actionHistoryLogs
                  };
                });

                return (
                  <div className="space-y-6">
                    {/* Workspace Title Card */}
                    <div className="bg-stone-900 border border-stone-850 p-6 md:p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-widest text-amber-500 font-mono font-black mb-1">
                          Authorized Role-Based Workspace
                        </div>
                        <h2 className="text-xl md:text-2xl font-black italic uppercase tracking-tight">
                          Payment Verification Center
                        </h2>
                      </div>
                      <span className="shrink-0 text-xs font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
                        🛡️ Verified Account Access
                      </span>
                    </div>

                    {/* Quick Overview Badges Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white p-5 rounded-2xl border border-stone-105 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
                          🛡️
                        </div>
                        <div>
                          <div className="text-xs uppercase font-black text-stone-400 tracking-wider">
                            Pending Badge Upgrades
                          </div>
                          <div className="text-2xl font-black text-stone-900 mt-0.5">
                            {pendingVerifications.length}
                          </div>
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-stone-105 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
                          🚀
                        </div>
                        <div>
                          <div className="text-xs uppercase font-black text-stone-400 tracking-wider">
                            Pending Paid Promotions
                          </div>
                          <div className="text-2xl font-black text-stone-900 mt-0.5">
                            {promotionRequests.length}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* TWO COLUMN METRIC CENTER: RECEIVED PAYMENTS & REFUNDS */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* RECEIVED PAYMENTS CARD */}
                      <div className="bg-white rounded-2xl border border-stone-150 p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                          <h3 className="text-sm font-black text-stone-800 uppercase tracking-wider flex items-center gap-2">
                            <span className="text-amber-500">💰</span> Received Payments
                          </h3>
                          <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-mono">
                            Total: {appReceivedCount} Applications
                          </span>
                        </div>

                        <div className="space-y-3 divide-y divide-stone-100">
                          {/* 1 */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-stone-600 font-semibold">1. Application received for verification</span>
                            <span className="text-xs font-black text-stone-900 bg-stone-100 px-2.5 py-1 rounded-lg">{appReceivedCount}</span>
                          </div>
                          {/* 2 */}
                          <div className="flex items-center justify-between pt-3">
                            <span className="text-xs text-stone-600 font-semibold">2. Payment status verified</span>
                            <span className="text-xs font-black text-emerald-750 bg-emerald-50 px-2.5 py-1 rounded-lg">✓ {statusVerifiedCount} approved</span>
                          </div>
                          {/* 3 */}
                          <div className="flex items-center justify-between pt-3">
                            <span className="text-xs text-stone-600 font-semibold">3. Payment status not verified</span>
                            <span className="text-xs font-black text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg">✗ {statusNotVerifiedCount} rejected</span>
                          </div>
                          {/* 4 */}
                          <div className="flex items-center justify-between pt-3">
                            <span className="text-xs text-stone-600 font-semibold">4. Pending applications</span>
                            <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">⏳ {statusPendingCount} active</span>
                          </div>
                          {/* 5 */}
                          <div className="flex items-center justify-between pt-3 text-stone-900">
                            <span className="text-xs font-black">5. Total amount verified</span>
                            <span className="text-sm font-black text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">{formatPKR(totalAmountVerifiedVal)}</span>
                          </div>
                        </div>
                      </div>

                      {/* REFUNDS CARD */}
                      <div className="bg-white rounded-2xl border border-stone-150 p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                          <h3 className="text-sm font-black text-stone-800 uppercase tracking-wider flex items-center gap-2">
                            <span className="text-indigo-500">💸</span> Refunds
                          </h3>
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-mono">
                            Total: {refundAppsAllCount} Claims
                          </span>
                        </div>

                        <div className="space-y-3 divide-y divide-stone-100">
                          {/* 1 */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-stone-600 font-semibold">1. All applications for Refunds</span>
                            <span className="text-xs font-black text-stone-900 bg-stone-100 px-2.5 py-1 rounded-lg">{refundAppsAllCount} requests</span>
                          </div>
                          {/* 2 */}
                          <div className="flex items-center justify-between pt-3">
                            <span className="text-xs text-stone-600 font-semibold">2. All approved application for Refunds</span>
                            <span className="text-xs font-black text-indigo-750 bg-indigo-50 px-2.5 py-1 rounded-lg">✓ {refundAppsApprovedCount} refunded</span>
                          </div>
                          {/* 3 */}
                          <div className="flex items-center justify-between pt-3">
                            <span className="text-xs text-stone-600 font-semibold">3. Refund Claims rejected</span>
                            <span className="text-xs font-black text-stone-400 bg-stone-50 px-2.5 py-1 rounded-lg">✗ {refundAppsRejectedCount} rejected</span>
                          </div>
                          {/* 4 */}
                          <div className="flex items-center justify-between pt-3">
                            <span className="text-xs text-stone-600 font-semibold">4. Pending Refunds (in PKR)</span>
                            <span className="text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">{formatPKR(pendingRefundsSum)}</span>
                          </div>
                          {/* 5 */}
                          <div className="flex items-center justify-between pt-3 text-stone-900">
                            <span className="text-xs font-black">5. Total amount refunded (In PKR)</span>
                            <span className="text-sm font-black text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">{formatPKR(totalAmountRefundedVal)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* NEW SECTION: AUTHORIZED ADMIN/VERIFIER PERFORMANCE FILTER HARNESS */}
                    <div className="bg-white rounded-3xl border border-stone-150 p-6 md:p-8 shadow-sm space-y-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-stone-105 pb-5">
                        <div>
                          <h3 className="text-base font-black text-stone-900 uppercase italic tracking-tight">
                            🛡️ Verifier Progress Hub & Activity Logs
                          </h3>
                          <p className="text-xs text-stone-400 font-medium mt-0.5 leading-relaxed">
                            Filter and analyze the progress of specific authorized payment verifiers across customized date ranges.
                          </p>
                        </div>
                        
                        {/* DATE INTERACTIVE FILTER RANGE SLOTS */}
                        <div className="w-full md:w-auto flex flex-wrap sm:flex-nowrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-black uppercase text-stone-400 font-mono">From Date:</label>
                            <input
                              type="date"
                              value={verifiersFromDate}
                              onChange={(e) => setVerifiersFromDate(e.target.value)}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-stone-50 border border-stone-200 outline-none focus:border-amber-500 transition-colors"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-black uppercase text-stone-400 font-mono font-bold">Selected Date:</label>
                            <input
                              type="date"
                              value={verifiersToDate}
                              onChange={(e) => setVerifiersToDate(e.target.value)}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-stone-50 border border-stone-200 outline-none focus:border-amber-500 transition-colors"
                            />
                          </div>
                          {(verifiersFromDate || verifiersToDate) && (
                            <button
                              onClick={() => {
                                setVerifiersFromDate("");
                                setVerifiersToDate("");
                              }}
                              className="px-2 py-1 text-xs font-black uppercase tracking-wider text-stone-400 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors shrink-0"
                            >
                              Reset Date
                            </button>
                          )}
                        </div>
                      </div>

                      {/* STATS LISTING ACCORDION */}
                      <div className="space-y-4">
                        {verifierStatsList.length === 0 ? (
                          <div className="py-6 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">
                            No verifiers or activity logs recorded.
                          </div>
                        ) : (
                          <div className="divide-y divide-stone-150">
                            {verifierStatsList.map((v) => {
                              const isSelected = selectedAuditVerifierEmail?.toLowerCase() === v.email.toLowerCase();
                              return (
                                <div key={v.email} className="py-5 first:pt-0 last:pb-0 space-y-4">
                                  {/* ROW HEADER PROFILE CARD */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                      {v.profileImage ? (
                                        <img src={v.profileImage} alt={v.name} className="w-10 h-10 rounded-full object-cover border border-stone-200 shadow-sm" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center font-bold text-stone-400 italic uppercase">
                                          {(v.name || v.email || "N").substring(0, 2).toUpperCase()}
                                        </div>
                                      )}
                                      <div>
                                        <div className="text-xs font-black text-stone-900 tracking-tight flex items-center gap-2">
                                          {v.name || "Administrator"}
                                          <span className={`text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                                            v.type === 'admin' 
                                              ? 'bg-amber-150 border-amber-200 text-amber-800' 
                                              : 'bg-indigo-100 border-indigo-200 text-indigo-700'
                                          }`}>
                                            {v.type}
                                          </span>
                                        </div>
                                        <div className="text-xs text-stone-400 lowercase mt-0.5">{v.email}</div>
                                      </div>
                                    </div>

                                    {/* MICRO STATS BADGES */}
                                    <div className="flex flex-wrap items-center gap-2">
                                      {/* Approved badge */}
                                      <span className="text-xs font-extrabold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-xl font-mono">
                                        Approved: {v.approvedCount}
                                      </span>
                                      {/* Rejected badge */}
                                      <span className="text-xs font-extrabold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-xl font-mono">
                                        Rejected: {v.rejectedCount}
                                      </span>
                                      {/* Refunded badge */}
                                      <span className="text-xs font-extrabold text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-xl font-mono">
                                        Refunds: {v.refundedCount}
                                      </span>
                                      {/* View Actions Log Button */}
                                      <button
                                        onClick={() => {
                                          if (isSelected) {
                                            setSelectedAuditVerifierEmail(null);
                                          } else {
                                            setSelectedAuditVerifierEmail(v.email);
                                          }
                                        }}
                                        className="text-xs font-black uppercase tracking-wider px-3.5 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 transition-all flex items-center gap-2 text-stone-700"
                                      >
                                        <History className="w-3 h-3 text-stone-400" />
                                        {isSelected ? "Hide Logs" : "View Progress Logs"}
                                      </button>
                                    </div>
                                  </div>

                                  {/* TOTAL REVENUE PROCESSED PROGRESS METRICS */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-stone-50 p-3.5 rounded-2xl border border-stone-100 font-mono text-xs">
                                    <div className="flex justify-between items-center">
                                      <span className="text-stone-400 font-medium font-sans">Payment Amount Received:</span>
                                      <span className="font-extrabold text-emerald-700 text-xs">{formatPKR(v.totalReceived)}</span>
                                    </div>
                                    <div className="flex justify-between items-center sm:border-l sm:border-stone-200 sm:pl-3.5">
                                      <span className="text-stone-400 font-medium font-sans">Refunds Amount Returned:</span>
                                      <span className="font-extrabold text-indigo-700 text-xs">{formatPKR(v.totalRefunded)}</span>
                                    </div>
                                  </div>

                                  {/* CHRONOLOGICAL HISTORICAL ACTIONS LOG DETAILS INSIDE INDIVIDUAL EXPANDABLE DROPDOWN */}
                                  {isSelected && (
                                    <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-3">
                                      <h4 className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                                        <History className="w-3.5 h-3.5 text-stone-400" /> Transactions Audit Trails ({v.historyLogs.length})
                                      </h4>

                                      {v.historyLogs.length === 0 ? (
                                        <p className="text-xs text-stone-400 font-bold font-mono py-4 text-center">
                                          No transactions processed inside selected date range.
                                        </p>
                                      ) : (
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                              <tr className="border-b border-stone-150 text-xs uppercase tracking-wider text-stone-400 font-black">
                                                <th className="py-2.5">Date</th>
                                                <th className="py-2.5">User Details</th>
                                                <th className="py-2.5">Upgrade Method</th>
                                                <th className="py-2.5">Amount</th>
                                                <th className="py-2.5 text-right">Action Status</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-stone-100 text-stone-700 font-semibold">
                                              {v.historyLogs.map((log) => {
                                                const logDate = log.updatedAt ? (log.updatedAt.toDate ? log.updatedAt.toDate() : new Date(log.updatedAt)) : new Date();
                                                return (
                                                  <tr key={log.id} className="hover:bg-white/50 transition-colors">
                                                    <td className="py-2.5 font-mono text-stone-400">
                                                      {logDate.toLocaleDateString()} {logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                    <td className="py-2.5 font-sans lowercase">
                                                      <span className="block font-bold text-stone-900">{log.userName || "anonymous"}</span>
                                                      <span className="block text-xs text-stone-400">{log.userEmail || "no email"}</span>
                                                    </td>
                                                    <td className="py-2.5">
                                                      <span className="px-1.5 py-0.5 rounded text-xs font-black uppercase bg-stone-150 text-stone-600 mr-1 opacity-75 animate-pulse">
                                                        {log.type}
                                                      </span>
                                                      <span>{log.planName}</span>
                                                    </td>
                                                    <td className="py-2.5 font-mono font-bold text-stone-900">
                                                      {formatPKR(log.amount)}
                                                    </td>
                                                    <td className="py-2.5 text-right">
                                                      <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase ${
                                                        log.actionTaken === 'APPROVED' 
                                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                          : log.actionTaken === 'REJECTED'
                                                            ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                                            : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                                      }`}>
                                                        {log.actionTaken}
                                                      </span>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Original System Action Items Container */}
                    {(() => {
                      const filteredPendingVerifications = pendingVerifications.filter((u: any) => u.verificationStage === "SENT_TO_VERIFIERS");
                      const filteredPromotionRequests = promotionRequests.filter((r: any) => r.verificationStage === "SENT_TO_VERIFIERS");
                      
                      const pendingRefundsList = [
                        ...allVerifyApplications.filter((app: any) => app.refundRequested && app.refundStatus === "SENT_TO_VERIFIERS").map((app: any) => ({
                          ...app,
                          isVerificationAppCollection: true,
                          planName: app.planName || 'Verified Badge Upgrade',
                          type: 'VERIFIED'
                        })),
                        ...allPaymentPromotions.filter((req: any) => req.refundRequested && req.refundStatus === "SENT_TO_VERIFIERS").map((req: any) => ({
                          ...req,
                          isVerificationAppCollection: false,
                          planName: req.planName || `${req.type} Promotion`,
                          type: req.type || 'PROMOTION'
                        }))
                      ];

                      const totalTasksCount = filteredPendingVerifications.length + filteredPromotionRequests.length + pendingRefundsList.length;

                      return (
                        <div className="bg-white p-6 rounded-2xl border border-stone-105 shadow-sm space-y-6">
                          <h3 className="text-base font-extrabold text-stone-900 uppercase italic tracking-tight">
                            📢 Pending Task Items ({totalTasksCount})
                          </h3>

                          {totalTasksCount === 0 ? (
                            <div className="py-12 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">
                              🎉 All caught up! No pending payment verifications found.
                            </div>
                          ) : (
                            <div className="space-y-6 divide-y divide-stone-100">
                              {/* 1. Badge Pending Applications */}
                              {filteredPendingVerifications.length > 0 && (
                                <div className="space-y-4">
                                  <h4 className="text-xs font-black uppercase text-amber-600 tracking-wider">
                                    Pending Badge Access Applications ({filteredPendingVerifications.length})
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {filteredPendingVerifications.map((userObj) => {
                                      const matchApp = allVerifyApplications.find((app: any) => app.userId === userObj.id && app.status === "PENDING")
                                        || allVerifyApplications.find((app: any) => app.userId === userObj.id);
                                      const durationDays = matchApp?.durationDays || 30;
                                      const badgeLabel = userObj.verifiedBadgeRequestType === "GOLDEN" ? "Premium Seller Badge" : "Verified Seller Badge";
                                      
                                      const plan = PROMOTION_PACKAGES.VERIFIED.find((p: any) => p.days === durationDays);
                                      const expectedPriceLabel = plan ? formatPKR(plan.price) : "Rs. 1,999";

                                      return (
                                        <div key={userObj.id} className="bg-stone-50 p-4 rounded-xl border border-stone-100 flex flex-col justify-between gap-4">
                                          <div>
                                            <div className="flex items-center gap-3">
                                              <Link to={`/user/${userObj.id}`} title="View Profile" className="shrink-0 hover:opacity-80 transition-opacity">
                                                {userObj.profileImage ? (
                                                  <img src={userObj.profileImage} alt={userObj.name} className="w-9 h-9 rounded-full object-cover shadow-sm border border-stone-200" referrerPolicy="no-referrer" />
                                                ) : (
                                                  <div className="w-9 h-9 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center font-bold text-xs uppercase shadow-sm border border-stone-300">
                                                    {(userObj.name || userObj.email || "U").substring(0, 2)}
                                                  </div>
                                                )}
                                              </Link>
                                              <div>
                                                <div className="text-xs font-black text-stone-900 tracking-tight lowercase flex items-center gap-1.5">
                                                  <Link to={`/user/${userObj.id}`} className="hover:underline hover:text-indigo-600">{userObj.name || "Anonymous Seller"}</Link>
                                                </div>
                                                <div className="text-xs text-stone-400">
                                                  {userObj.email}
                                                </div>
                                              </div>
                                            </div>

                                            <div className="mt-3 space-y-2 bg-white p-3 rounded-lg border border-stone-100/80 text-xs text-stone-700 font-sans leading-relaxed">
                                              <div>
                                                <span className="font-extrabold uppercase text-stone-400 block text-xs tracking-wider">Purpose:</span>
                                                <p className="font-bold text-stone-900">Application for grant of Premium Seller Badge</p>
                                              </div>
                                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-100">
                                                <div>
                                                  <span className="font-extrabold uppercase text-stone-400 block text-xs tracking-wider">Category / Badge:</span>
                                                  <p className="font-bold text-amber-600">{badgeLabel}</p>
                                                </div>
                                                <div>
                                                  <span className="font-extrabold uppercase text-xs text-stone-400 block tracking-wider">Selected Period:</span>
                                                  <p className="font-bold text-stone-900">{durationDays} Days ({plan?.name || "1 Month"})</p>
                                                </div>
                                              </div>
                                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-100">
                                                <div>
                                                  <span className="font-extrabold uppercase text-xs text-stone-400 block tracking-wider">Expected Price (Right Amount):</span>
                                                  <p className="font-black text-emerald-700">{expectedPriceLabel}</p>
                                                </div>
                                                <div>
                                                  <span className="font-extrabold uppercase text-xs text-stone-400 block tracking-wider">Tracking ID:</span>
                                                  <p className="font-mono font-bold text-stone-900 break-all">{matchApp?.applicationId || matchApp?.id?.slice(0, 8) || "N/A"}</p>
                                                </div>
                                              </div>

                                              {matchApp?.paymentProofUrl && (
                                                <div className="pt-2 border-t border-stone-100">
                                                  <span className="font-extrabold uppercase text-xs text-stone-400 block tracking-wider mb-1">Payment Proof Screenshot:</span>
                                                  <img
                                                    src={matchApp.paymentProofUrl}
                                                    alt="Payment Proof"
                                                    className="h-16 object-cover rounded border border-stone-200 cursor-zoom-in hover:opacity-90 max-w-[200px]"
                                                    onClick={() => setActiveKycLightbox({ src: matchApp.paymentProofUrl, title: "Applicant Payment Proof" })}
                                                  />
                                                </div>
                                              )}

                                              {/* Authoritative Received Amount Input */}
                                              <div className="mt-3 p-3 bg-white rounded-xl border border-stone-200 shadow-xs space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <label htmlFor={`received-amount-${userObj.id}`} className="text-xs font-black uppercase text-stone-800 tracking-wider flex items-center gap-1.5">
                                                    <span className="text-emerald-600 font-bold">$</span>
                                                    Authoritative Received Amount (Required):
                                                  </label>
                                                  <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded">
                                                    Manual Verifier Entry
                                                  </span>
                                                </div>
                                                <div className="relative">
                                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-600">
                                                    PKR
                                                  </span>
                                                  <input
                                                    id={`received-amount-${userObj.id}`}
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={verifierReceivedAmounts[userObj.id] ?? ""}
                                                    onChange={(e) => {
                                                      setVerifierReceivedAmounts(prev => ({
                                                        ...prev,
                                                        [userObj.id]: e.target.value
                                                      }));
                                                    }}
                                                    placeholder={`Enter actual verified amount (e.g. ${plan?.price || 499})`}
                                                    className="w-full pl-14 pr-4 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm font-black text-stone-900 placeholder:text-stone-600 placeholder:font-normal focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
                                                  />
                                                </div>
                                                <p className="text-[11px] text-stone-700 leading-tight">
                                                  Record the exact verified funds received. Stored authoritatively as <code className="font-mono text-emerald-700 font-bold">receivedAmount</code>, distinct from Application Amount ({expectedPriceLabel}).
                                                </p>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => {
                                                const entered = verifierReceivedAmounts[userObj.id];
                                                if (entered === undefined || entered === null || entered.trim() === "" || isNaN(Number(entered)) || Number(entered) < 0) {
                                                  alert("Please enter the authoritative actual amount received before confirming payment verification.");
                                                  return;
                                                }
                                                const numericReceived = Number(entered);
                                                setConfirmAction({
                                                  message: `Are you sure you want to mark the payment for ${userObj.name || userObj.email || "this user"} as RECEIVED?\n\n• Application Amount: ${expectedPriceLabel}\n• Authoritative Received Amount: PKR ${numericReceived.toLocaleString()}\n\nThis will confirm the transaction has been verified in our accounts.`,
                                                  onConfirm: () => verifyUserPayment(userObj.id, numericReceived)
                                                });
                                              }}
                                              className="flex-grow py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                                            >
                                              Payment received
                                            </button>
                                            <button
                                              onClick={() => {
                                                setPaymentDenyAction({
                                                  type: 'USER',
                                                  payload: userObj.id
                                                });
                                              }}
                                              className="flex-grow py-3 bg-white text-rose-600 hover:bg-rose-50 font-black uppercase tracking-widest text-xs rounded-xl transition-all border-2 border-rose-100 hover:border-rose-200 active:scale-95"
                                            >
                                              Deny Payment
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* 2. Promotion Pending Requests */}
                              {filteredPromotionRequests.length > 0 && (
                                <div className="space-y-4 pt-6">
                                  <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider">
                                    Pending Paid Promotion Upgrades ({filteredPromotionRequests.length})
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {filteredPromotionRequests.map((req) => {
                                      const durationDays = req.requestedDurationDays || req.durationDays || 30;
                                      const plans = PROMOTION_PACKAGES[req.type as 'FEATURED' | 'BOOST' | 'VERIFIED'] || [];
                                      const plan = plans.find((p: any) => p.days === durationDays);
                                      const expectedPriceLabel = plan ? formatPKR(plan.price) : (req.amount ? formatPKR(req.amount) : "N/A");
                                      const purposeText = req.type === "FEATURED"
                                        ? "Application for grant of Featured Ads Badge"
                                        : req.type === "BOOST"
                                          ? "Application for grant of Boosted Ads Badge"
                                          : "Application for grant of Premium Seller Badge";

                                      const categoryText = req.type === "FEATURED"
                                        ? "Featured Ads Badge"
                                        : req.type === "BOOST"
                                          ? "Boosted Ads Badge"
                                          : "Premium Seller Badge";

                                      return (
                                        <div key={req.id} className="bg-stone-50 p-4 rounded-xl border border-stone-100 flex flex-col justify-between gap-4">
                                          <div>
                                            <div className="flex items-center justify-between mb-3">
                                              <span className="text-xs font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-100">
                                                {req.type} Promotion
                                              </span>
                                              <span className="text-xs font-mono font-bold text-stone-400 font-sans uppercase">
                                                ID: {req.requestTrackingId || req.id?.slice(0, 8)}
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-3">
                                              <Link to={`/user/${req.userId}`} title="View Profile" className="shrink-0 hover:opacity-80 transition-opacity">
                                                <div className="w-9 h-9 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center font-bold text-xs uppercase shadow-sm border border-stone-300">
                                                  {(req.userEmail || "U").substring(0, 2)}
                                                </div>
                                              </Link>
                                              <div>
                                                <div className="text-xs font-black text-stone-900 tracking-tight lowercase flex items-center gap-1.5">
                                                  <Link to={`/user/${req.userId}`} className="hover:underline hover:text-indigo-600">View Applicant Profile</Link>
                                                </div>
                                                <div className="text-xs text-stone-400">
                                                  {req.userEmail || "anonymous"}
                                                </div>
                                              </div>
                                            </div>

                                            <div className="mt-3 space-y-2 bg-white p-3 rounded-lg border border-stone-100/80 text-xs text-stone-700 font-sans leading-relaxed">
                                              <div>
                                                <span className="font-extrabold uppercase text-stone-400 block text-xs tracking-wider">Purpose:</span>
                                                <p className="font-bold text-stone-900">{purposeText}</p>
                                              </div>
                                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-100">
                                                <div>
                                                  <span className="font-extrabold uppercase text-stone-400 block text-xs tracking-wider">Category / Badge:</span>
                                                  <p className="font-bold text-indigo-600">{categoryText}</p>
                                                </div>
                                                <div>
                                                  <span className="font-extrabold uppercase text-xs text-stone-400 block tracking-wider">Selected Period:</span>
                                                  <p className="font-bold text-stone-900">{durationDays} Days ({plan?.name || "Standard"})</p>
                                                </div>
                                              </div>
                                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-100">
                                                <div>
                                                  <span className="font-extrabold uppercase text-xs text-stone-400 block tracking-wider">Application Amount (Selected Plan):</span>
                                                  <p className="font-black text-emerald-700">{expectedPriceLabel}</p>
                                                </div>
                                                <div>
                                                  <span className="font-extrabold uppercase text-xs text-stone-400 block tracking-wider">Tracking ID:</span>
                                                  <p className="font-mono font-bold text-stone-900 break-all">{req.requestTrackingId || req.id?.slice(0, 12)}</p>
                                                </div>
                                              </div>

                                              {(req.paymentMethod || req.txHash) && (
                                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-100 text-xs">
                                                  {req.paymentMethod && (
                                                    <div>
                                                      <span className="font-extrabold uppercase text-xs text-stone-400 block tracking-wider">Payment Method:</span>
                                                      <p className="font-bold text-stone-800">{req.paymentMethod}</p>
                                                    </div>
                                                  )}
                                                  {req.txHash && (
                                                    <div>
                                                      <span className="font-extrabold uppercase text-xs text-stone-400 block tracking-wider">Tx Hash:</span>
                                                      <p className="font-mono font-bold text-stone-800 break-all">{req.txHash}</p>
                                                    </div>
                                                  )}
                                                </div>
                                              )}

                                              {req.paymentProofImage && (
                                                <div className="pt-2 border-t border-stone-100">
                                                  <span className="font-extrabold uppercase text-xs text-stone-400 block tracking-wider mb-1">Payment Proof Screenshot:</span>
                                                  <img
                                                    src={req.paymentProofImage}
                                                    alt="Payment Proof"
                                                    className="h-16 object-cover rounded border border-stone-200 cursor-zoom-in hover:opacity-90 max-w-[200px]"
                                                    onClick={() => setActiveKycLightbox({ src: req.paymentProofImage, title: "Applicant Payment Proof" })}
                                                  />
                                                </div>
                                              )}

                                              {/* Authoritative Received Amount Input */}
                                              <div className="mt-3 p-3 bg-white rounded-xl border border-stone-200 shadow-xs space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <label htmlFor={`received-amount-${req.id}`} className="text-xs font-black uppercase text-stone-800 tracking-wider flex items-center gap-1.5">
                                                    <span className="text-emerald-600 font-bold">$</span>
                                                    Authoritative Received Amount (Required):
                                                  </label>
                                                  <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded">
                                                    Manual Verifier Entry
                                                  </span>
                                                </div>
                                                <div className="relative">
                                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-600">
                                                    {req.currency || "PKR"}
                                                  </span>
                                                  <input
                                                    id={`received-amount-${req.id}`}
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    value={verifierReceivedAmounts[req.id] ?? ""}
                                                    onChange={(e) => {
                                                      setVerifierReceivedAmounts(prev => ({
                                                        ...prev,
                                                        [req.id]: e.target.value
                                                      }));
                                                    }}
                                                    placeholder={`Enter actual verified amount (e.g. ${req.amount || 499})`}
                                                    className="w-full pl-14 pr-4 py-2 bg-stone-50 border border-stone-300 rounded-lg text-sm font-black text-stone-900 placeholder:text-stone-600 placeholder:font-normal focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
                                                  />
                                                </div>
                                                <p className="text-[11px] text-stone-700 leading-tight">
                                                  Record the exact verified funds received. Stored authoritatively as <code className="font-mono text-emerald-700 font-bold">receivedAmount</code>, distinct from Application Amount ({expectedPriceLabel}).
                                                </p>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => {
                                                const entered = verifierReceivedAmounts[req.id];
                                                if (entered === undefined || entered === null || entered.trim() === "" || isNaN(Number(entered)) || Number(entered) < 0) {
                                                  alert("Please enter the authoritative actual amount received before confirming payment verification.");
                                                  return;
                                                }
                                                const numericReceived = Number(entered);
                                                setConfirmAction({
                                                  message: `Are you sure you want to mark the payment for this promotion (${req.type}) as RECEIVED?\n\n• Application Amount: ${expectedPriceLabel}\n• Authoritative Received Amount: ${req.currency || 'PKR'} ${numericReceived.toLocaleString()}\n\nThis will record the verified amount and notify the administrator that funds are cleared.`,
                                                  onConfirm: () => verifyPromotionPayment(req, numericReceived)
                                                });
                                              }}
                                              className="flex-grow py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                                            >
                                              Payment received
                                            </button>
                                            <button
                                              onClick={() => {
                                                setPaymentDenyAction({
                                                  type: 'PROMOTION',
                                                  payload: req
                                                });
                                              }}
                                              className="flex-grow py-3 bg-white text-rose-600 hover:bg-rose-50 font-black uppercase tracking-widest text-xs rounded-xl transition-all border-2 border-rose-100 hover:border-rose-200 active:scale-95"
                                            >
                                              Deny Payment
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* 3. Pending Refund Claims */}
                              {pendingRefundsList.length > 0 && (
                                <div className="space-y-4 pt-6">
                                  <h4 className="text-xs font-black uppercase text-indigo-700 tracking-wider">
                                    Pending Refund Settlements ({pendingRefundsList.length})
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {pendingRefundsList.map((req) => (
                                      <div key={req.id} className="bg-amber-50/55 p-4 rounded-xl border border-amber-200/60 flex flex-col justify-between gap-4">
                                        <div>
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-150">
                                              {req.type} REFUND CLAIM
                                            </span>
                                            <span className="text-xs font-mono font-bold text-stone-400">
                                              ID: {req.applicationId || req.id?.slice(0, 8)}
                                            </span>
                                          </div>
                                          
                                          <p className="text-xs font-black text-stone-900 mt-2 lowercase">
                                            Refund to: {req.userName || "anonymous"} ({req.userEmail || "no email"})
                                          </p>
                                          <p className="text-xs font-bold text-stone-600 mt-1">
                                            Plan Details: {req.planName} (Rs. {req.amount ? req.amount.toLocaleString() : "0"})
                                          </p>

                                          {/* User's Bank Details */}
                                          <div className="mt-2 text-xs text-stone-700 font-sans space-y-0.5 bg-white p-2.5 rounded-lg border border-stone-200/80">
                                            <p className="font-bold text-amber-900 uppercase tracking-wider text-[8.5px] border-b border-amber-100 pb-0.5 mb-1">Target Account:</p>
                                            <p><span className="font-semibold text-stone-400">Name:</span> <span className="font-bold text-stone-800">{req.refundName || 'N/A'}</span></p>
                                            <p><span className="font-semibold text-stone-400">Bank:</span> <span className="font-bold text-stone-800">{req.refundBankName || 'N/A'}</span></p>
                                            <p><span className="font-semibold text-stone-400">Account #:</span> <span className="font-bold text-stone-800">{req.refundAccountNumber || 'N/A'}</span></p>
                                          </div>

                                          {/*Original Proof Attached by applicant originally when they ordered */}
                                          {req.paymentProofImage && (
                                            <div className="mt-2.5">
                                              <span className="text-[8.5px] font-bold uppercase text-stone-400 block tracking-widest mb-1 font-sans">
                                                ORIGINAL APPLICANT PAYMENT PROOF:
                                              </span>
                                              <img
                                                src={req.paymentProofImage}
                                                alt="Original Payment Proof"
                                                className="h-14 object-cover rounded-md border border-stone-200 cursor-zoom-in"
                                                onClick={() => setActiveKycLightbox({ src: req.paymentProofImage, title: "Original Applicant Payment Proof" })}
                                              />
                                            </div>
                                          )}

                                          {/* Refund receipt attachment by verifier */}
                                          <div className="mt-3.5 space-y-1.5">
                                            <label className="block text-xs font-black text-stone-400 uppercase tracking-widest font-mono">
                                              Attach Refund Payment Proof Receipt (Required):
                                            </label>
                                            {!verifierRefundReceipts[req.id] ? (
                                              <label className="flex flex-col items-center justify-center w-full h-20 border border-dashed border-stone-300 bg-white hover:bg-stone-50 transition-all rounded-lg py-2 group cursor-pointer">
                                                <Upload className="w-5 h-5 text-stone-400 mb-1 group-hover:scale-105 transition-transform" />
                                                <span className="text-xs font-black text-stone-400 uppercase tracking-widest">
                                                  Attach Transfer Receipt
                                                </span>
                                                <input 
                                                  type="file" 
                                                  className="hidden" 
                                                  accept="image/*" 
                                                  onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                      if (file.size > 2 * 1024 * 1024) {
                                                        alert("Receipt proof size must be under 2MB.");
                                                        return;
                                                      }
                                                      const reader = new FileReader();
                                                      reader.onloadend = () => {
                                                        setVerifierRefundReceipts(prev => ({
                                                          ...prev,
                                                          [req.id]: reader.result as string
                                                        }));
                                                      };
                                                      reader.readAsDataURL(file);
                                                    }
                                                  }} 
                                                />
                                              </label>
                                            ) : (
                                              <div className="relative border border-stone-200 rounded-lg overflow-hidden bg-white p-1.5 flex items-center justify-between shadow-sm">
                                                <img src={verifierRefundReceipts[req.id]} alt="Refund Preview" className="max-h-12 object-contain rounded border border-stone-100" />
                                                <button
                                                  type="button"
                                                  onClick={() => setVerifierRefundReceipts(prev => {
                                                    const copy = { ...prev };
                                                    delete copy[req.id];
                                                    return copy;
                                                  })}
                                                  className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-black uppercase rounded transition-colors font-sans"
                                                >
                                                  Discard
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleVerifierRejectRefund(req)}
                                            className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-extrabold uppercase text-xs tracking-wider rounded-lg transition-all text-center font-sans"
                                          >
                                            Deny Claim
                                          </button>
                                          <button
                                            onClick={() => handleVerifierApproveRefund(req, verifierRefundReceipts[req.id])}
                                            disabled={!verifierRefundReceipts[req.id]}
                                            className={`flex-grow py-2 text-white font-black uppercase tracking-wider text-xs rounded-lg transition-all ${!verifierRefundReceipts[req.id] ? 'bg-stone-300 cursor-not-allowed text-stone-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                          >
                                            Approve & Execute Refund
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {activeTab === "authAdmins" && (
                <div className="space-y-4 md:space-y-8">
                  {openedAdmin ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                        <button
                          onClick={() => setOpenedAdmin(null)}
                          className="flex items-center gap-2 text-stone-400 hover:text-stone-900 font-bold text-xs uppercase tracking-wider"
                        >
                          <ArrowLeft className="w-4 h-4" /> Go back to admin list
                        </button>
                        <span className="text-xs font-black text-amber-600 bg-amber-50 px-3 py-1 rounded-full uppercase tracking-wider">
                          Opened Admin Status Detail
                        </span>
                      </div>

                      <div className="bg-white p-6 md:p-8 rounded-3xl border border-stone-100 shadow-sm flex flex-col md:flex-row gap-6 items-center md:items-start justify-between">
                        <div className="flex flex-col md:flex-row gap-4 items-center md:items-start text-center md:text-left">
                          {openedAdmin.profileImage ? (
                            <img
                              src={openedAdmin.profileImage}
                              alt={openedAdmin.name || "Admin"}
                              className="w-16 h-16 rounded-full object-cover border-2 border-stone-100 shadow-inner cursor-zoom-in"
                              referrerPolicy="no-referrer"
                              onClick={() => setActiveKycLightbox({ src: openedAdmin.profileImage, title: `${openedAdmin.name || "Admin"}'s Profile Picture` })}
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center border-2 border-stone-100 text-stone-400 font-black text-xl italic uppercase">
                              {(openedAdmin.name || openedAdmin.email || "A").substring(0, 2)}
                            </div>
                          )}
                          <div>
                            <h4 className="text-xl font-black text-stone-900 uppercase italic tracking-tight">
                              {openedAdmin.name || "Authorized Assistant Admin"}
                            </h4>
                            <p className="text-stone-400 font-bold text-sm lowercase mt-0.5">{openedAdmin.email}</p>
                            <div className="mt-3 flex flex-wrap gap-3 justify-center md:justify-start items-center">
                              <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                                <Calendar className="w-3.5 h-3.5" /> Date of Authority: {formatSafeDate(openedAdmin.addedAt)}
                              </span>
                              <span className="text-xs font-black uppercase tracking-widest text-stone-400">
                                Authorized By: {openedAdmin.addedBy || "Platform Master"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-row md:flex-col gap-3 shrink-0 w-full md:w-auto">
                          <button
                            onClick={() => {
                              if (openedAdmin.userProfile) {
                                viewAccountDetail(openedAdmin.userProfile);
                              } else {
                                alert("No matching user profile is active for this email address yet.");
                              }
                            }}
                            className="flex-grow md:flex-initial inline-flex items-center justify-center gap-2 px-5 py-3 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                          >
                            <User className="w-4 h-4" /> Profile view
                          </button>
                          <button
                            onClick={() => {
                              if (!isSuperAdmin) {
                                alert("Authorized admins are never able or authorized to take any action against the administrator.");
                                return;
                              }
                              if (confirm("Are you sure you want to revoke administrative access for this user?")) {
                                removeAuthorizedAdmin(openedAdmin.id);
                                setOpenedAdmin(null);
                              }
                            }}
                            className={`flex-grow md:flex-initial inline-flex items-center justify-center gap-2 px-5 py-3 border border-red-150 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${!isSuperAdmin ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <UserX className="w-4 h-4" /> Revoke admin
                          </button>
                        </div>
                      </div>

                      <div className="bg-white p-6 md:p-8 rounded-3xl border border-stone-100 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-stone-50 pb-3">
                          <h4 className="text-sm font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
                            <History className="w-4 h-4 text-amber-500" /> Recent Administrative Activities
                          </h4>
                          <span className="text-xs text-stone-400 font-bold uppercase tracking-widest">
                            Audit Trial logs
                          </span>
                        </div>

                        {loadingActivities ? (
                          <div className="py-12 flex justify-center items-center">
                            <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : openedAdminActivities.length === 0 ? (
                          <div className="py-12 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">
                            No administrative logs found to display.
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                            {openedAdminActivities.map((log) => (
                              <div
                                key={log.id}
                                className="p-4 bg-stone-50 border border-stone-100/50 rounded-xl flex items-start gap-3 hover:border-stone-200 transition-colors"
                              >
                                <div className="bg-white p-2 rounded-lg border border-stone-100 shrink-0">
                                  <History className="w-4 h-4 text-stone-400" />
                                </div>
                                <div className="flex-grow min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className="font-extrabold text-stone-900 text-xs uppercase tracking-wide text-amber-600">
                                      {log.action || "ADMIN ACTION"}
                                    </span>
                                    <span className="text-xs text-stone-400 font-bold">
                                      {formatSafeDate(log.timestamp)}
                                    </span>
                                  </div>
                                  <p className="text-stone-600 text-xs mt-1 font-semibold">
                                    {log.details || log.reason || "Action log processed."}
                                  </p>
                                  {log.target && (
                                    <div className="text-xs text-stone-400 uppercase tracking-widest mt-1 font-bold">
                                      Target of action: <span className="text-stone-600 font-semibold">{log.target}</span>
                                    </div>
                                  )}
                                  {log.adminCode && (
                                    <div className="text-xs text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 inline-block uppercase tracking-widest mt-1 font-black">
                                      Code: {log.adminCode}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Sub-tab Selection */}
                      <div className="flex gap-4 border-b border-stone-200 pb-2 mb-6">
                        <button
                          onClick={() => setAuthAdminsSubTab("admins")}
                          className={`pb-2 px-1 font-black uppercase text-xs tracking-wider transition-all border-b-2 ${
                            authAdminsSubTab === "admins"
                              ? "text-amber-500 border-amber-500 font-bold"
                              : "text-stone-400 border-transparent hover:text-stone-600"
                          }`}
                        >
                          Authorized Administrators
                        </button>
                        <button
                          onClick={() => setAuthAdminsSubTab("verifiers")}
                          className={`pb-2 px-1 font-black uppercase text-xs tracking-wider transition-all border-b-2 ${
                            authAdminsSubTab === "verifiers"
                              ? "text-amber-500 border-amber-500 font-bold"
                              : "text-stone-400 border-transparent hover:text-stone-600"
                          }`}
                        >
                          Payment Verifiers
                        </button>
                      </div>

                      {authAdminsSubTab === "admins" ? (
                        <>
                          {isSuperAdmin && (
                            <div className="bg-white p-6 md:p-10 rounded-xl md:rounded-[2.5rem] border border-stone-100 shadow-sm">
                              <h3 className="text-lg md:text-xl font-black text-stone-900 uppercase italic tracking-tighter mb-4 md:mb-6">
                                Authorize Admin Access
                              </h3>
                              <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                                <input
                                  type="email"
                                  placeholder="Type assistant email address..."
                                  className="flex-grow bg-stone-50 border-none rounded-xl md:rounded-2xl px-5 md:px-6 py-3.5 md:py-4 font-bold text-stone-900 text-sm md:text-base"
                                  value={newAdminEmail}
                                  onChange={(e) => setNewAdminEmail(e.target.value)}
                                />
                                <input
                                  type="text"
                                  placeholder="Unique Admin Code (e.g. ab@123)"
                                  className="w-full md:w-64 bg-stone-50 border-none rounded-xl md:rounded-2xl px-5 md:px-6 py-3.5 md:py-4 font-bold text-stone-900 text-sm md:text-base"
                                  value={newAdminCode}
                                  onChange={(e) => setNewAdminCode(e.target.value)}
                                />
                                <button
                                  onClick={addAuthorizedAdmin}
                                  className="bg-stone-900 text-white px-8 md:px-10 py-3.5 md:py-0 rounded-xl md:rounded-2xl font-black uppercase italic text-xs md:text-sm hover:bg-amber-500 hover:text-stone-900 transition-all"
                                >
                                  Authorize
                                </button>
                              </div>

                              {/* Section Permission Selectors */}
                              <div className="mt-6">
                                <label className="block text-xs font-black uppercase tracking-widest text-stone-400 mb-3 font-mono">
                                  Grant Permission to Specific Section(s)
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                                  {ADMIN_SECTIONS.map((sec) => {
                                    const isSelected = selectedSections.includes(sec.id);
                                    return (
                                      <button
                                        key={sec.id}
                                        type="button"
                                        onClick={() => {
                                          if (isSelected) {
                                            setSelectedSections(selectedSections.filter(id => id !== sec.id));
                                          } else {
                                            setSelectedSections([...selectedSections, sec.id]);
                                          }
                                        }}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                                          isSelected
                                            ? "bg-amber-100/60 border-amber-300 text-amber-900 font-extrabold"
                                            : "bg-white border-stone-150 hover:border-stone-300 text-stone-600 font-semibold"
                                        }`}
                                      >
                                        <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                                          isSelected ? "bg-amber-500 border-amber-600 text-stone-900" : "border-stone-300 bg-white"
                                        }`}>
                                          {isSelected && <span className="text-xs font-black">✓</span>}
                                        </div>
                                        <span className="text-xs tracking-tight uppercase leading-none font-black">
                                          {sec.num}. {sec.label}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {authAdminError && (
                                <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 border border-red-100">
                                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                                  <span>{authAdminError}</span>
                                </div>
                              )}
                              {authAdminSuccess && (
                                <div className="mt-4 p-4 bg-emerald-50 text-emerald-800 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 border border-emerald-100">
                                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <span>{authAdminSuccess}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Search Bar */}
                          <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-stone-100 shadow-sm flex items-center gap-3">
                            <Search className="w-5 h-5 text-stone-400 shrink-0" />
                            <input
                              type="text"
                              placeholder="Search authorized admins by name or email address..."
                              className="w-full bg-stone-50 border-none rounded-xl px-4 py-3 font-semibold text-stone-900 text-sm focus:ring-0"
                              value={authAdminsSearch}
                              onChange={(e) => setAuthAdminsSearch(e.target.value)}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          {isSuperAdmin && (
                            <div className="bg-white p-6 md:p-10 rounded-xl md:rounded-[2.5rem] border border-stone-100 shadow-sm">
                              <h3 className="text-lg md:text-xl font-black text-stone-900 uppercase italic tracking-tighter mb-4 md:mb-6">
                                Authorize Payment Verifier Access
                              </h3>
                              <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                                <input
                                  type="email"
                                  placeholder="Type payment verifier email address..."
                                  className="flex-grow bg-stone-50 border-none rounded-xl md:rounded-2xl px-5 md:px-6 py-3.5 md:py-4 font-bold text-stone-900 text-sm md:text-base"
                                  value={newVerifierEmail}
                                  onChange={(e) => setNewVerifierEmail(e.target.value)}
                                />
                                <button
                                  onClick={addAuthorizedVerifier}
                                  className="bg-stone-900 text-white px-8 md:px-10 py-3.5 md:py-0 rounded-xl md:rounded-2xl font-black uppercase italic text-xs md:text-sm hover:bg-amber-500 hover:text-stone-900 transition-all"
                                >
                                  Authorize
                                </button>
                              </div>
                              {authVerifierError && (
                                <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 border border-red-100">
                                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                                  <span>{authVerifierError}</span>
                                </div>
                              )}
                              {authVerifierSuccess && (
                                <div className="mt-4 p-4 bg-emerald-50 text-emerald-800 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 border border-emerald-100">
                                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <span>{authVerifierSuccess}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Search Bar */}
                          <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-stone-100 shadow-sm flex items-center gap-3">
                            <Search className="w-5 h-5 text-stone-400 shrink-0" />
                            <input
                              type="text"
                              placeholder="Search payment verifiers by name or email address..."
                              className="w-full bg-stone-50 border-none rounded-xl px-4 py-3 font-semibold text-stone-900 text-sm focus:ring-0"
                              value={authVerifiersSearch}
                              onChange={(e) => setAuthVerifiersSearch(e.target.value)}
                            />
                          </div>
                        </>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mt-6">
                        {authAdminsSubTab === "admins" ? (
                          authAdmins
                            .filter((adm) => {
                              const queryText = authAdminsSearch.toLowerCase().trim();
                              if (!queryText) return true;
                              const emailMatch = adm.email?.toLowerCase().includes(queryText);
                              const nameMatch = adm.name?.toLowerCase().includes(queryText);
                              return emailMatch || nameMatch;
                            })
                            .map((adm) => (
                              <div
                                key={adm.id}
                                className="bg-white p-5 rounded-2xl md:rounded-3xl border border-stone-100 shadow-sm flex flex-col justify-between hover:border-amber-400 hover:shadow-md transition-all duration-200"
                              >
                                {/* Top Section: Photo and Info (Clicks to open detailed activities view) */}
                                <div
                                  onClick={() => {
                                    setOpenedAdmin(adm);
                                    fetchAdminActivities(adm.email);
                                  }}
                                  className="flex items-start gap-3 cursor-pointer pb-4 border-b border-stone-50 group/item"
                                  title="Click to view activity logs"
                                >
                                  {adm.profileImage ? (
                                    <img
                                      src={adm.profileImage}
                                      alt={adm.name}
                                      className="w-10 h-10 rounded-full object-cover border border-stone-100 shrink-0"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-400 text-xs italic uppercase border border-stone-200 shrink-0">
                                      {(adm.name || adm.email || "A").substring(0, 2)}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-grow">
                                    <div className="font-extrabold text-stone-900 uppercase italic tracking-tight truncate text-xs md:text-sm group-hover/item:text-amber-500 transition-colors">
                                      {adm.name || "Assistant Admin"}
                                    </div>
                                    <div className="text-xs text-stone-400 lowercase truncate">
                                      {adm.email}
                                    </div>
                                    <div className="text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest mt-0.5">
                                      Added On: {formatSafeDate(adm.addedAt)}
                                    </div>
                                    {adm.adminCode && (
                                      <div className="text-xs md:text-xs font-black text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 inline-block uppercase tracking-widest mt-1">
                                        Code: {adm.adminCode}
                                      </div>
                                    )}

                                    {/* Permitted Sections Display */}
                                    <div className="mt-2">
                                      <div className="text-xs font-black text-stone-400 uppercase tracking-wider mb-1 font-mono">
                                        Permitted Sections:
                                      </div>
                                      <div className="flex flex-wrap gap-1">
                                        {adm.allowedSections && adm.allowedSections.length > 0 ? (
                                          adm.allowedSections.map((secId: string) => {
                                            const sec = ADMIN_SECTIONS.find((s) => s.id === secId);
                                            return (
                                              <span
                                                key={secId}
                                                className="bg-stone-100 text-stone-700 text-xs font-black px-1.5 py-0.5 rounded uppercase tracking-wider font-mono border border-stone-200/50"
                                              >
                                                {sec ? `${sec.num}. ${sec.label}` : secId}
                                              </span>
                                            );
                                          })
                                        ) : (
                                          <span className="bg-amber-50 text-amber-800 text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono border border-amber-150">
                                            All Sections (Legacy)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Bottom Action Controls: View Profile, Revoke */}
                                <div className="flex flex-col gap-2 mt-4 pt-1">
                                  <div className="flex gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        viewAccountDetailByEmail(adm.email);
                                      }}
                                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                    >
                                      <User className="w-3.5 h-3.5" />
                                      <span>View Profile</span>
                                    </button>

                                    {isSuperAdmin && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingAdmin(adm);
                                          setEditingSections(adm.allowedSections || [
                                            "reports", "profileReports", "kycVerifications", "nameRequests", "blockedAccounts", "search", "support", "promotions", "appeals", "refunds", "broadcast", "authAdmins"
                                          ]);
                                        }}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 border border-stone-200 bg-stone-50 text-stone-700 hover:bg-amber-500 hover:text-stone-900 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                      >
                                        <Shield className="w-3.5 h-3.5" />
                                        <span>Sections</span>
                                      </button>
                                    )}
                                  </div>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isSuperAdmin) {
                                        alert("Authorized admins are never able or authorized to take any action against the administrator.");
                                        return;
                                      }
                                      // Revoke immediately as explicitly requested by user
                                      removeAuthorizedAdmin(adm.id, true);
                                    }}
                                    disabled={!isSuperAdmin}
                                    className={`w-full inline-flex items-center justify-center gap-1 px-3 py-2 border border-red-200 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                      !isSuperAdmin ? "opacity-30 cursor-not-allowed hover:bg-red-50 hover:text-red-600" : ""
                                    }`}
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                    <span>Revoke</span>
                                  </button>
                                </div>
                              </div>
                            ))
                        ) : (
                          authVerifiers
                            .filter((ver) => {
                              const queryText = authVerifiersSearch.toLowerCase().trim();
                              if (!queryText) return true;
                              const emailMatch = ver.email?.toLowerCase().includes(queryText);
                              const nameMatch = ver.name?.toLowerCase().includes(queryText);
                              return emailMatch || nameMatch;
                            })
                            .map((ver) => (
                              <div
                                key={ver.id}
                                className="bg-white p-5 rounded-2xl md:rounded-3xl border border-stone-100 shadow-sm flex flex-col justify-between hover:border-amber-400 hover:shadow-md transition-all duration-200"
                              >
                                {/* Top Section: Photo and Info */}
                                <div className="flex items-start gap-3 pb-4 border-b border-stone-50">
                                  {ver.profileImage ? (
                                    <img
                                      src={ver.profileImage}
                                      alt={ver.name}
                                      className="w-10 h-10 rounded-full object-cover border border-stone-100 shrink-0"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-400 text-xs italic uppercase border border-stone-200 shrink-0">
                                      {(ver.name || ver.email || "A").substring(0, 2)}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-grow">
                                    <div className="font-extrabold text-stone-900 uppercase italic tracking-tight truncate text-xs md:text-sm">
                                      {ver.name || "Payment Verifier"}
                                    </div>
                                    <div className="text-xs text-stone-400 lowercase truncate">
                                      {ver.email}
                                    </div>
                                    <div className="text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest mt-0.5">
                                      Added On: {formatSafeDate(ver.addedAt)}
                                    </div>
                                  </div>
                                </div>

                                {/* Bottom Action Controls: View Profile, Revoke */}
                                <div className="flex items-center gap-2 mt-4 pt-1">
                                  <button
                                    onClick={() => viewAccountDetailByEmail(ver.email)}
                                    className="flex-grow inline-flex items-center justify-center gap-1 px-3 py-2 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                                  >
                                    <User className="w-3.5 h-3.5" />
                                    <span>View Profile</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (!isSuperAdmin) {
                                        alert("Only super administrators can revoke payment verifier access.");
                                        return;
                                      }
                                      removeAuthorizedVerifier(ver.id, true);
                                    }}
                                    disabled={!isSuperAdmin}
                                    className={`flex-grow inline-flex items-center justify-center gap-1 px-3 py-2 border border-red-200 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                      !isSuperAdmin ? "opacity-30 cursor-not-allowed hover:bg-red-50 hover:text-red-600" : ""
                                    }`}
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                    <span>Revoke</span>
                                  </button>
                                </div>
                              </div>
                            ))
                        )}

                        {authAdminsSubTab === "admins" && authAdmins.filter((adm) => {
                          const queryText = authAdminsSearch.toLowerCase().trim();
                          if (!queryText) return true;
                          const emailMatch = adm.email?.toLowerCase().includes(queryText);
                          const nameMatch = adm.name?.toLowerCase().includes(queryText);
                          return emailMatch || nameMatch;
                        }).length === 0 && (
                          <div className="col-span-full py-12 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">
                            No matching authorized admins found.
                          </div>
                        )}

                        {authAdminsSubTab === "verifiers" && authVerifiers.filter((ver) => {
                          const queryText = authVerifiersSearch.toLowerCase().trim();
                          if (!queryText) return true;
                          const emailMatch = ver.email?.toLowerCase().includes(queryText);
                          const nameMatch = ver.name?.toLowerCase().includes(queryText);
                          return emailMatch || nameMatch;
                        }).length === 0 && (
                          <div className="col-span-full py-12 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">
                            No matching payment verifiers found.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === "broadcast" && (
                <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
                  {/* Header Banner & Status Bar */}
                  <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-stone-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="p-3 md:p-4 bg-amber-50 rounded-2xl text-amber-600 border border-amber-200/60 shrink-0">
                        <Speaker className="w-7 h-7 md:w-8 md:h-8" />
                      </div>
                      <div>
                        <h2 className="text-xl md:text-2xl font-black text-stone-900 uppercase italic tracking-tighter flex items-center gap-2">
                          <span>Communication Broadcast Center</span>
                        </h2>
                        <p className="text-xs text-stone-500 font-medium mt-0.5">
                          Transmit real-time announcements, critical alerts, and updates to all or segmented platform users.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto">
                      <div className="bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 flex items-center gap-2 text-xs">
                        <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                        <span className="font-bold text-stone-600">Engine:</span>
                        <span className="font-black text-stone-900 uppercase">Live Batched</span>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2 flex items-center gap-2 text-xs">
                        <Users className="w-3.5 h-3.5 text-amber-600" />
                        <span className="font-bold text-stone-600">Total Sent:</span>
                        <span className="font-black text-amber-900">{broadcastHistory.length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Success Alert Banner */}
                  {broadcastSuccessMessage && (
                    <div className="bg-emerald-50 border-2 border-emerald-500/40 rounded-2xl p-4 md:p-5 flex items-start justify-between gap-3 text-emerald-900 shadow-sm animate-in fade-in duration-300">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-black uppercase tracking-wider text-emerald-950">
                            Transmission Dispatched Successfully
                          </p>
                          <p className="text-xs text-emerald-800 font-medium mt-0.5 leading-relaxed">
                            {broadcastSuccessMessage}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setBroadcastSuccessMessage(null)}
                        className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-700 transition-colors shrink-0"
                        title="Dismiss"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Error Alert Banner */}
                  {broadcastErrorMessage && (
                    <div className="bg-red-50 border-2 border-red-500/40 rounded-2xl p-4 md:p-5 flex items-start justify-between gap-3 text-red-900 shadow-sm animate-in fade-in duration-300">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-black uppercase tracking-wider text-red-950">
                            Transmission Blocked
                          </p>
                          <p className="text-xs text-red-800 font-medium mt-0.5 leading-relaxed">
                            {broadcastErrorMessage}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setBroadcastErrorMessage(null)}
                        className="p-1 hover:bg-red-100 rounded-lg text-red-700 transition-colors shrink-0"
                        title="Dismiss"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Composer & Live Preview Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start">
                    {/* Broadcast Composer Form */}
                    <div className="lg:col-span-7 bg-white p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-stone-200 shadow-sm space-y-6">
                      <div className="border-b border-stone-100 pb-4">
                        <h3 className="text-base md:text-lg font-black text-stone-900 uppercase italic tracking-tight flex items-center gap-2">
                          <Send className="w-4 h-4 text-amber-500" />
                          <span>Compose Broadcast Transmission</span>
                        </h3>
                        <p className="text-xs text-stone-400 font-medium mt-1">
                          Configure delivery parameters, message content, and target segment.
                        </p>
                      </div>

                      {/* Broadcast Type / Category */}
                      <div>
                        <label className="block text-xs font-black text-stone-600 uppercase tracking-wider mb-2">
                          Broadcast Type
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { id: "ANNOUNCEMENT", label: "Announcement", icon: "📢" },
                            { id: "URGENT", label: "Urgent Alert", icon: "🚨" },
                            { id: "MAINTENANCE", label: "Maintenance", icon: "⚙️" },
                            { id: "UPDATE", label: "Platform Update", icon: "✨" },
                          ].map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setBroadcastType(t.id as any)}
                              className={`p-2.5 rounded-xl border text-xs font-black flex flex-col items-center justify-center gap-1 transition-all ${
                                broadcastType === t.id
                                  ? "bg-amber-50 border-amber-500 text-amber-900 shadow-sm"
                                  : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                              }`}
                            >
                              <span className="text-base">{t.icon}</span>
                              <span className="truncate">{t.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Target Audience & Priority */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-black text-stone-600 uppercase tracking-wider mb-2">
                            Target Audience
                          </label>
                          <select
                            value={broadcastAudience}
                            onChange={(e) => setBroadcastAudience(e.target.value as any)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 font-bold text-stone-800 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                          >
                            <option value="ALL">🌐 All Users (Global Marketplace)</option>
                            <option value="SELLERS">🛡️ Verified & Active Sellers</option>
                            <option value="BUYERS">👤 Buyers & Regular Users</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-black text-stone-600 uppercase tracking-wider mb-2">
                            Notification Priority
                          </label>
                          <select
                            value={broadcastPriority}
                            onChange={(e) => setBroadcastPriority(e.target.value as any)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2.5 font-bold text-stone-800 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                          >
                            <option value="NORMAL">Standard Delivery</option>
                            <option value="HIGH">High Priority (Urgent Badge)</option>
                          </select>
                        </div>
                      </div>

                      {/* Pinned Announcement Option */}
                      <div className="p-3.5 bg-amber-50/50 border border-amber-200/80 rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <Pin className={`w-4 h-4 shrink-0 ${broadcastPinned ? "text-amber-600 fill-amber-600" : "text-stone-400"}`} />
                          <div>
                            <p className="text-xs font-black text-stone-900">Pin as Marketplace Header Banner</p>
                            <p className="text-[11px] text-stone-500 font-medium">
                              Displays prominently at the top of the marketplace for all browsing visitors.
                            </p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={broadcastPinned}
                            onChange={(e) => setBroadcastPinned(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                      </div>

                      {/* Broadcast Title */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-black text-stone-600 uppercase tracking-wider">
                            Broadcast Title <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[11px] font-bold text-stone-400">
                            {broadcastTitle.length}/80
                          </span>
                        </div>
                        <input
                          type="text"
                          maxLength={80}
                          value={broadcastTitle}
                          onChange={(e) => setBroadcastTitle(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 focus:bg-white rounded-xl px-4 py-3 font-black text-stone-900 text-sm outline-none transition-all placeholder:font-normal placeholder:text-stone-400"
                          placeholder="e.g. Scheduled System Upgrade or Important Announcement"
                        />
                      </div>

                      {/* Message Body */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-xs font-black text-stone-600 uppercase tracking-wider">
                            Message Body <span className="text-red-500">*</span>
                          </label>
                          <span className="text-[11px] font-bold text-stone-400">
                            {broadcastMessage.length}/500
                          </span>
                        </div>
                        <textarea
                          rows={4}
                          maxLength={500}
                          value={broadcastMessage}
                          onChange={(e) => setBroadcastMessage(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 focus:bg-white rounded-xl px-4 py-3 font-medium text-stone-900 text-sm outline-none transition-all placeholder:text-stone-400 leading-relaxed"
                          placeholder="Type clear details and guidance for platform users..."
                        />
                      </div>

                      {/* Action Link */}
                      <div>
                        <label className="block text-xs font-black text-stone-600 uppercase tracking-wider mb-1.5">
                          Action Link (Optional)
                        </label>
                        <input
                          type="text"
                          value={broadcastLink}
                          onChange={(e) => setBroadcastLink(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 focus:border-amber-500 focus:bg-white rounded-xl px-4 py-2.5 font-medium text-stone-800 text-xs outline-none transition-all placeholder:text-stone-400"
                          placeholder="e.g. /listings or /battle-bids or https://..."
                        />
                        <p className="text-[11px] text-stone-400 font-medium mt-1">
                          When users tap the notification, they will be automatically redirected to this URL or route.
                        </p>
                      </div>

                      {/* Send Button */}
                      <button
                        type="button"
                        onClick={handleBroadcast}
                        disabled={broadcasting}
                        className={`w-full py-4 rounded-xl md:rounded-2xl font-black uppercase tracking-widest text-sm md:text-base flex items-center justify-center gap-2.5 shadow-lg transition-all active:scale-95 ${
                          broadcasting
                            ? "bg-amber-400 text-stone-900 cursor-wait"
                            : "bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white shadow-stone-900/10"
                        }`}
                      >
                        {broadcasting ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            <span>Transmitting Broadcast...</span>
                          </>
                        ) : (
                          <>
                            <Speaker className="w-5 h-5" />
                            <span>Transmit Broadcast Now</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Live Preview & Tips Panel */}
                    <div className="lg:col-span-5 space-y-6">
                      {/* Live In-App Notification Preview */}
                      <div className="bg-white p-5 md:p-6 rounded-2xl md:rounded-[2rem] border border-stone-200 shadow-sm">
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
                          <span className="text-xs font-black text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Eye className="w-3.5 h-3.5 text-amber-500" />
                            <span>Live Recipient Preview</span>
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full uppercase">
                            User Notification
                          </span>
                        </div>

                        {/* Card simulation as seen in Layout.tsx */}
                        <div className="bg-stone-50 rounded-2xl border border-stone-200/80 p-4 shadow-sm relative overflow-hidden">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              {broadcastType === "URGENT" ? (
                                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                              ) : (
                                <Speaker className="w-4 h-4 text-amber-600 shrink-0" />
                              )}
                              <p className="text-xs font-black text-stone-900 leading-snug">
                                {broadcastTitle.trim() || "Broadcast Title Preview"}
                              </p>
                            </div>
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                          </div>

                          <p className="text-xs text-stone-600 leading-relaxed font-normal">
                            {broadcastMessage.trim() || "Your message content will be formatted cleanly and legibly in the user's notification drawer."}
                          </p>

                          {broadcastLink.trim() && (
                            <div className="mt-2.5 flex items-center gap-1 text-[11px] font-bold text-amber-700">
                              <span>Open Announcement Link</span>
                              <ExternalLink className="w-3 h-3" />
                            </div>
                          )}

                          <div className="mt-3 pt-2.5 border-t border-stone-200/60 flex items-center justify-between text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                            <span>Audience: {broadcastAudience}</span>
                            <span>Priority: {broadcastPriority}</span>
                          </div>
                        </div>

                        {/* Pinned Announcement Simulation if enabled */}
                        {broadcastPinned && (
                          <div className="mt-4 pt-3 border-t border-stone-100">
                            <p className="text-[11px] font-black text-stone-500 uppercase tracking-wider mb-2">
                              Top Marketplace Banner Preview:
                            </p>
                            <div className="bg-stone-900 text-white p-2.5 rounded-xl text-[11px] flex items-center justify-between gap-2 shadow-sm">
                              <div className="flex items-center gap-2 truncate">
                                <Speaker className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span className="font-black text-amber-400 truncate">
                                  {broadcastTitle.trim() || "Announcement"}:
                                </span>
                                <span className="text-stone-300 truncate">
                                  {broadcastMessage.trim() || "Marketplace alert..."}
                                </span>
                              </div>
                              <X className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Best Practice Guidelines */}
                      <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200/70 text-stone-600 text-xs space-y-2.5">
                        <p className="font-black text-stone-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span>Broadcast Best Practices</span>
                        </p>
                        <ul className="space-y-1.5 text-stone-500 leading-relaxed list-disc list-inside">
                          <li>Use <strong className="text-stone-700">Urgent Alert</strong> only for security warnings or critical auction notices.</li>
                          <li>Pinned banners stay visible at the top of every screen until dismissed by the user.</li>
                          <li>All transmissions are written using batched Firestore transactions for high performance and reliability.</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Broadcast History & Logs Section */}
                  <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-stone-200 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
                      <div>
                        <h3 className="text-base md:text-lg font-black text-stone-900 uppercase italic tracking-tight flex items-center gap-2">
                          <History className="w-4 h-4 text-amber-500" />
                          <span>Broadcast Transmission History</span>
                        </h3>
                        <p className="text-xs text-stone-400 font-medium mt-0.5">
                          Log of all previously dispatched platform-wide and targeted communications.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Type Filter */}
                        <select
                          value={broadcastFilterType}
                          onChange={(e) => setBroadcastFilterType(e.target.value)}
                          className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-700 outline-none"
                        >
                          <option value="ALL">All Types</option>
                          <option value="ANNOUNCEMENT">Announcements</option>
                          <option value="URGENT">Urgent Alerts</option>
                          <option value="MAINTENANCE">Maintenance</option>
                          <option value="UPDATE">Updates</option>
                        </select>

                        {/* Refresh Button */}
                        <button
                          type="button"
                          onClick={refreshBroadcastHistory}
                          disabled={broadcastLoadingHistory}
                          className="p-2.5 bg-stone-50 hover:bg-stone-100 text-stone-600 rounded-xl border border-stone-200 transition-colors"
                          title="Refresh Broadcast History"
                        >
                          <RefreshCw className={`w-4 h-4 ${broadcastLoadingHistory ? "animate-spin text-amber-600" : ""}`} />
                        </button>
                      </div>
                    </div>

                    {/* History Search */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={broadcastSearch}
                        onChange={(e) => setBroadcastSearch(e.target.value)}
                        placeholder="Search broadcasts by title, message, or sender..."
                        className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 outline-none focus:border-amber-500 focus:bg-white"
                      />
                    </div>

                    {/* Broadcast Cards Listing */}
                    {broadcastLoadingHistory && broadcastHistory.length === 0 ? (
                      <div className="py-12 text-center">
                        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
                        <p className="text-xs font-black text-stone-400 uppercase tracking-widest">
                          Loading broadcast history...
                        </p>
                      </div>
                    ) : broadcastHistory.length === 0 ? (
                      <div className="py-12 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                        <Speaker className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                        <p className="text-xs font-black text-stone-500 uppercase tracking-widest">
                          No Broadcasts Dispatched Yet
                        </p>
                        <p className="text-[11px] text-stone-400 mt-1 max-w-sm mx-auto">
                          Compose your first platform broadcast using the form above. User notification records will be created automatically.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {broadcastHistory
                          .filter((b) => {
                            if (broadcastFilterType !== "ALL" && b.type !== broadcastFilterType) {
                              return false;
                            }
                            if (!broadcastSearch.trim()) return true;
                            const term = broadcastSearch.toLowerCase().trim();
                            return (
                              b.title?.toLowerCase().includes(term) ||
                              b.message?.toLowerCase().includes(term) ||
                              b.senderEmail?.toLowerCase().includes(term) ||
                              b.senderName?.toLowerCase().includes(term)
                            );
                          })
                          .map((b) => {
                            const isDeleting = isDeletingBroadcastId === b.id;
                            const createdDate = b.createdAt?.toDate
                              ? b.createdAt.toDate()
                              : b.createdAt?.seconds
                              ? new Date(b.createdAt.seconds * 1000)
                              : null;

                            return (
                              <div
                                key={b.id}
                                className="bg-stone-50/70 hover:bg-stone-50 border border-stone-200/90 rounded-2xl p-4 md:p-5 transition-all space-y-3"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                        b.type === "URGENT"
                                          ? "bg-red-100 text-red-800 border border-red-200"
                                          : b.type === "MAINTENANCE"
                                          ? "bg-stone-200 text-stone-800"
                                          : b.type === "UPDATE"
                                          ? "bg-purple-100 text-purple-800 border border-purple-200"
                                          : "bg-amber-100 text-amber-800 border border-amber-200"
                                      }`}
                                    >
                                      {b.type || "ANNOUNCEMENT"}
                                    </span>

                                    {b.priority === "HIGH" && (
                                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded-md text-[10px] font-black uppercase tracking-wider">
                                        High Priority
                                      </span>
                                    )}

                                    {b.pinned && (
                                      <span className="px-2 py-0.5 bg-amber-500 text-stone-900 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                        <Pin className="w-2.5 h-2.5 fill-stone-900" />
                                        Pinned
                                      </span>
                                    )}

                                    <span className="text-[11px] font-bold text-stone-500">
                                      Audience: {b.targetAudience || "ALL"}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-3 text-xs text-stone-400">
                                    {createdDate && (
                                      <span className="flex items-center gap-1 font-bold">
                                        <Clock className="w-3.5 h-3.5" />
                                        {createdDate.toLocaleString()}
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteBroadcast(b.id)}
                                      disabled={isDeleting}
                                      className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-auto sm:ml-0"
                                      title="Delete Broadcast"
                                    >
                                      {isDeleting ? (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-500" />
                                      ) : (
                                        <Trash2 className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <h4 className="text-sm font-black text-stone-900 tracking-tight">
                                    {b.title}
                                  </h4>
                                  <p className="text-xs text-stone-600 mt-1 leading-relaxed whitespace-pre-wrap">
                                    {b.message}
                                  </p>
                                </div>

                                <div className="pt-2 border-t border-stone-200/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-stone-700">
                                      Sent by: {b.senderName || b.senderEmail}
                                    </span>
                                    {b.recipientCount !== undefined && (
                                      <span className="px-2 py-0.5 bg-stone-200/70 text-stone-700 rounded text-[10px] font-black">
                                        {b.recipientCount} Recipients
                                      </span>
                                    )}
                                  </div>

                                  {b.link && (
                                    <a
                                      href={b.link}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-amber-700 hover:text-amber-800 font-bold inline-flex items-center gap-1"
                                    >
                                      <span>{b.link}</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "disputes" && (
                <div className="space-y-6">
                  <div className="p-6 md:p-8 bg-white border border-stone-200 rounded-[2.5rem] shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl md:text-2xl font-black text-stone-900 uppercase italic tracking-tighter flex items-center gap-2">
                        <ShieldAlert className="w-7 h-7 text-red-600 animate-pulse" />
                        7-Day Deal Disputes
                      </h2>
                      <p className="text-xs text-stone-500 font-medium mt-1">
                        Complaints raised by buyers or sellers when a 7-day accepted deal is not finalized by the other party.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-4 py-2 bg-red-50 text-red-700 font-black text-xs rounded-xl uppercase tracking-wider border border-red-200">
                        Total Disputes: {disputes.length}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    {disputes.length === 0 ? (
                      <div className="p-12 text-center bg-white border border-stone-200 rounded-[2.5rem] text-stone-400 font-bold text-sm">
                        No 7-day deal disputes submitted yet. All marketplace deals are running smoothly.
                      </div>
                    ) : (
                      disputes.map((dispute) => (
                        <div key={dispute.id} className="p-6 md:p-8 bg-white border-2 border-stone-100 rounded-[2.5rem] shadow-sm space-y-4">
                          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-stone-100 pb-4">
                            <div>
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${dispute.status === 'PENDING' ? 'bg-red-500 text-white' : dispute.status === 'RESOLVED' ? 'bg-emerald-500 text-white' : 'bg-stone-300 text-stone-800'}`}>
                                {dispute.status}
                              </span>
                              <h3 className="text-base font-black text-stone-900 uppercase tracking-tight mt-2">
                                {dispute.auctionTitle || 'Combat Asset / Auction'}
                              </h3>
                              <p className="text-xs text-stone-500 font-medium">
                                Deal Amount: <strong className="text-stone-900">{formatPKR(dispute.amount || 0)}</strong> ({dispute.currency || 'PKR'})
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {dispute.status === 'PENDING' && (
                                <button
                                  onClick={() => handleUpdateDisputeStatus(dispute.id, 'RESOLVED')}
                                  disabled={processingDisputeId === dispute.id}
                                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
                                >
                                  Resolve Dispute
                                </button>
                              )}
                              {dispute.status === 'PENDING' && (
                                <button
                                  onClick={() => handleUpdateDisputeStatus(dispute.id, 'DISMISSED')}
                                  disabled={processingDisputeId === dispute.id}
                                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                                >
                                  Dismiss
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteDispute(dispute.id)}
                                disabled={processingDisputeId === dispute.id}
                                className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all cursor-pointer active:scale-95"
                                title="Delete dispute record"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-2xl text-xs text-stone-700">
                            <div>
                              <span className="block text-[10px] uppercase font-black tracking-widest text-stone-400 mb-1">Complainant Role</span>
                              <strong className="text-stone-900 uppercase">{dispute.complainantRole}</strong> (ID: {dispute.complainantId})
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-black tracking-widest text-stone-400 mb-1">Reported Counterparty</span>
                              <strong className="text-stone-900 uppercase">
                                {dispute.complainantRole === 'buyer' ? 'Seller' : 'Buyer'}
                              </strong> (ID: {dispute.reportedUserId})
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Attached Problem Description</span>
                            <p className="text-xs sm:text-sm text-stone-800 bg-red-50/50 border border-red-100 p-4 rounded-2xl font-medium leading-relaxed">
                              "{dispute.message}"
                            </p>
                          </div>

                          {dispute.images && dispute.images.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-stone-100">
                              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                                Attached Evidence Images ({dispute.images.length})
                              </span>
                              <div className="flex flex-wrap gap-2.5">
                                {dispute.images.map((imgUrl: string, idx: number) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setActiveKycLightbox({ src: imgUrl, title: `Dispute Evidence #${idx + 1} - ${dispute.auctionTitle || 'Item'}` })}
                                    className="relative group w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-stone-200 hover:border-amber-500 transition-all shadow-sm cursor-pointer"
                                  >
                                    <img
                                      src={imgUrl}
                                      alt={`Dispute Evidence ${idx + 1}`}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    />
                                    <div className="absolute inset-0 bg-stone-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-black uppercase transition-opacity">
                                      View
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === "reports" && (
                <div className="grid grid-cols-1">
                  <ReportStats items={reports} type="Reports" />

                  {isAdmin && (
                    <div className="mb-4 bg-stone-900 border border-stone-800 rounded-2xl p-4 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                          <Database className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                              Historical Reconciliation Dry Run
                            </span>
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full uppercase">
                              Read-Only
                            </span>
                          </div>
                          <p className="text-xs text-stone-400 mt-0.5">
                            Authenticated low-cost getCountFromServer baseline dry run. Zero writes.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={executeHistoricalDryRun}
                        disabled={isRunningHistoricalDryRun}
                        className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 shrink-0 cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                      >
                        {isRunningHistoricalDryRun ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                            Calculating Baseline...
                          </>
                        ) : (
                          "Run Historical Metrics Dry Run"
                        )}
                      </button>
                    </div>
                  )}

                  {historicalDryRunError && (
                    <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold flex items-center justify-between">
                      <span>Error: {historicalDryRunError}</span>
                      <button type="button" onClick={() => setHistoricalDryRunError(null)} className="text-stone-400 hover:text-white uppercase font-black text-[10px]">Dismiss</button>
                    </div>
                  )}

                  {historicalDryRunResult && (
                    <div className="mb-6 p-5 bg-stone-950 border border-stone-800 rounded-3xl text-stone-100 shadow-xl">
                      <div className="flex items-center justify-between mb-4 border-b border-stone-800 pb-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-emerald-400" />
                          <h4 className="text-sm font-black uppercase tracking-wider text-stone-200">
                            Authenticated Historical Reconciliation Results
                          </h4>
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full uppercase">
                            Dry Run Complete (0 Writes)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setHistoricalDryRunResult(null)}
                          className="text-stone-400 hover:text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
                        >
                          ✕ Close
                        </button>
                      </div>

                      {/* Summary Metrics Table */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                        <div className="bg-stone-900 border border-stone-800 p-3 rounded-2xl">
                          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">
                            All Reports
                          </span>
                          <span className="text-xl font-black text-amber-400">
                            {historicalDryRunResult.baseline.allReportsCount}
                          </span>
                        </div>
                        <div className="bg-stone-900 border border-stone-800 p-3 rounded-2xl">
                          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">
                            Available
                          </span>
                          <span className="text-xl font-black text-blue-400">
                            {historicalDryRunResult.baseline.availableReportsCount}
                          </span>
                        </div>
                        <div className="bg-stone-900 border border-stone-800 p-3 rounded-2xl">
                          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">
                            Pending
                          </span>
                          <span className="text-xl font-black text-red-400">
                            {historicalDryRunResult.baseline.pendingReportsCount}
                          </span>
                        </div>
                        <div className="bg-stone-900 border border-stone-800 p-3 rounded-2xl">
                          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">
                            Resolved
                          </span>
                          <span className="text-xl font-black text-emerald-400">
                            {historicalDryRunResult.baseline.resolvedReportsCount}
                          </span>
                        </div>
                        <div className="bg-stone-900 border border-stone-800 p-3 rounded-2xl">
                          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">
                            Dismissed
                          </span>
                          <span className="text-xl font-black text-stone-300">
                            {historicalDryRunResult.baseline.dismissedReportsCount}
                          </span>
                        </div>
                      </div>

                      {/* Comparison Table */}
                      <div className="overflow-x-auto mb-5 border border-stone-800 rounded-2xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-stone-900 text-stone-400 font-black uppercase tracking-wider text-[10px]">
                            <tr>
                              <th className="p-3">Metric</th>
                              <th className="p-3">Current Stored Document</th>
                              <th className="p-3">Calculated Baseline</th>
                              <th className="p-3">Difference</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-800 font-bold">
                            <tr>
                              <td className="p-3 text-stone-300">allReportsCount</td>
                              <td className="p-3 text-stone-400">{historicalDryRunResult.storedMetrics?.allReportsCount ?? "Uninitialized (0)"}</td>
                              <td className="p-3 text-amber-400">{historicalDryRunResult.baseline.allReportsCount}</td>
                              <td className="p-3 text-stone-400">{(historicalDryRunResult.storedMetrics?.allReportsCount ?? 0) - historicalDryRunResult.baseline.allReportsCount}</td>
                            </tr>
                            <tr>
                              <td className="p-3 text-stone-300">availableReportsCount</td>
                              <td className="p-3 text-stone-400">{historicalDryRunResult.storedMetrics?.availableReportsCount ?? "Uninitialized (0)"}</td>
                              <td className="p-3 text-blue-400">{historicalDryRunResult.baseline.availableReportsCount}</td>
                              <td className="p-3 text-stone-400">{(historicalDryRunResult.storedMetrics?.availableReportsCount ?? 0) - historicalDryRunResult.baseline.availableReportsCount}</td>
                            </tr>
                            <tr>
                              <td className="p-3 text-stone-300">pendingReportsCount</td>
                              <td className="p-3 text-stone-400">{historicalDryRunResult.storedMetrics?.pendingReportsCount ?? "Uninitialized (0)"}</td>
                              <td className="p-3 text-red-400">{historicalDryRunResult.baseline.pendingReportsCount}</td>
                              <td className="p-3 text-stone-400">{(historicalDryRunResult.storedMetrics?.pendingReportsCount ?? 0) - historicalDryRunResult.baseline.pendingReportsCount}</td>
                            </tr>
                            <tr>
                              <td className="p-3 text-stone-300">resolvedReportsCount</td>
                              <td className="p-3 text-stone-400">{historicalDryRunResult.storedMetrics?.resolvedReportsCount ?? "Uninitialized (0)"}</td>
                              <td className="p-3 text-emerald-400">{historicalDryRunResult.baseline.resolvedReportsCount}</td>
                              <td className="p-3 text-stone-400">{(historicalDryRunResult.storedMetrics?.resolvedReportsCount ?? 0) - historicalDryRunResult.baseline.resolvedReportsCount}</td>
                            </tr>
                            <tr>
                              <td className="p-3 text-stone-300">dismissedReportsCount</td>
                              <td className="p-3 text-stone-400">{historicalDryRunResult.storedMetrics?.dismissedReportsCount ?? "Uninitialized (0)"}</td>
                              <td className="p-3 text-stone-300">{historicalDryRunResult.baseline.dismissedReportsCount}</td>
                              <td className="p-3 text-stone-400">{(historicalDryRunResult.storedMetrics?.dismissedReportsCount ?? 0) - historicalDryRunResult.baseline.dismissedReportsCount}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Detailed Breakdown & Invariants */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="bg-stone-900/60 p-3 rounded-2xl border border-stone-800">
                          <span className="font-black uppercase text-[10px] tracking-wider text-amber-400 block mb-2">
                            Marketplace Breakdown (/reports)
                          </span>
                          <div className="space-y-1 text-stone-300">
                            <div className="flex justify-between"><span>Total reports:</span> <span className="font-bold">{historicalDryRunResult.marketplace.total}</span></div>
                            <div className="flex justify-between"><span>OPEN:</span> <span className="font-bold text-red-400">{historicalDryRunResult.marketplace.open}</span></div>
                            <div className="flex justify-between"><span>RESOLVED:</span> <span className="font-bold text-emerald-400">{historicalDryRunResult.marketplace.resolved}</span></div>
                            <div className="flex justify-between"><span>DISMISSED:</span> <span className="font-bold text-stone-400">{historicalDryRunResult.marketplace.dismissed}</span></div>
                          </div>
                        </div>

                        <div className="bg-stone-900/60 p-3 rounded-2xl border border-stone-800">
                          <span className="font-black uppercase text-[10px] tracking-wider text-amber-400 block mb-2">
                            Arena Breakdown (/arena_reports)
                          </span>
                          <div className="space-y-1 text-stone-300">
                            <div className="flex justify-between"><span>Total arena_reports:</span> <span className="font-bold">{historicalDryRunResult.arena.total}</span></div>
                            <div className="flex justify-between"><span>Listing targetType:</span> <span className="font-bold">{historicalDryRunResult.arena.listing}</span></div>
                            <div className="flex justify-between"><span>Negotiation targetType:</span> <span className="font-bold">{historicalDryRunResult.arena.negotiation}</span></div>
                            <div className="flex justify-between text-stone-500"><span>User targetType (Profiles):</span> <span className="font-bold">{historicalDryRunResult.arena.user} (EXCLUDED)</span></div>
                            <div className="flex justify-between text-[11px] pt-1 border-t border-stone-800">
                              <span>Active (listing + neg):</span>
                              <span className="font-bold text-red-400">
                                {historicalDryRunResult.arena.listingPending + historicalDryRunResult.arena.listingReviewing + historicalDryRunResult.arena.negotiationPending + historicalDryRunResult.arena.negotiationReviewing}
                              </span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span>Finalized (listing + neg):</span>
                              <span className="font-bold text-emerald-400">
                                {historicalDryRunResult.arena.listingResolved + historicalDryRunResult.arena.listingDismissed + historicalDryRunResult.arena.negotiationResolved + historicalDryRunResult.arena.negotiationDismissed}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Invariant Status Banner */}
                      <div className="mt-4 p-3 bg-stone-900 rounded-xl border border-stone-800 flex items-center justify-between text-xs">
                        <span className="text-stone-300">
                          Mathematical Invariant: available ({historicalDryRunResult.baseline.availableReportsCount}) = pending ({historicalDryRunResult.baseline.pendingReportsCount}) + resolved ({historicalDryRunResult.baseline.resolvedReportsCount}) + dismissed ({historicalDryRunResult.baseline.dismissedReportsCount})
                        </span>
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          historicalDryRunResult.invariants.sumMatchesAvailable ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                        }`}>
                          {historicalDryRunResult.invariants.sumMatchesAvailable ? "Invariant PASS" : "Invariant FAIL"}
                        </span>
                      </div>

                      {/* Phase 2C Step 2 Controlled Baseline Initialization Section */}
                      {(initializationResult || historicalDryRunResult?.storedMetrics?.allReportsCount !== undefined) ? (
                        <div className="mt-4 p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5">
                            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                            <div>
                              <span className="font-black uppercase tracking-wider text-emerald-400 block">
                                Centralized Metrics Baseline Initialized & Locked
                              </span>
                              <span className="text-stone-300 text-[11px]">
                                /system_metrics/moderation is certified and permanently locked against reinitialization. One-time operation complete.
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full shrink-0">
                            Status: Locked (One-Time Only)
                          </span>
                        </div>
                      ) : (
                        <div className="mt-4 pt-4 border-t border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <span className="text-xs font-black uppercase tracking-wider text-stone-200 block">
                              Phase 2C Step 2: Initialize Moderation Metrics
                            </span>
                            <span className="text-[11px] text-stone-400 block mt-0.5">
                              Performs exactly ONE surgical write to /system_metrics/moderation with verified baseline zeros.
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmAction({
                                message: "Perform Phase 2C Step 2 Controlled Initialization? This will perform exactly 1 write to /system_metrics/moderation with the verified zero baseline.",
                                onConfirm: executeControlledInitialization
                              });
                            }}
                            disabled={isInitializingMetrics}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 shrink-0 cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                          >
                            {isInitializingMetrics ? (
                              <>
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Initializing...
                              </>
                            ) : (
                              "Initialize Baseline (1 Write)"
                            )}
                          </button>
                        </div>
                      )}

                      {initializationError && (
                        <div className="mt-4 p-4 bg-red-950/40 border border-red-500/30 rounded-2xl flex items-center justify-between text-xs text-red-400">
                          <span>Initialization Error: {initializationError}</span>
                          <button type="button" onClick={() => setInitializationError(null)} className="text-stone-400 hover:text-white uppercase font-black text-[10px]">Dismiss</button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mb-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                    <input
                      type="text"
                      value={reportedListingsSearch}
                      onChange={(e) => setReportedListingsSearch(e.target.value)}
                      placeholder="Search reported listings by title, ID, reason, or account..."
                      className="flex-grow bg-white border border-stone-200 rounded-xl px-4 py-3 font-bold text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="flex items-center gap-1.5 bg-stone-100 p-1.5 rounded-xl self-start md:self-auto overflow-x-auto max-w-full">
                      {[
                        { key: "ALL", label: "All Sources" },
                        { key: "MARKETPLACE", label: "Marketplace" },
                        { key: "BATTLE_BIDS", label: "Battle Bids" },
                        { key: "NEGOTIATION", label: "Negotiation" },
                      ].map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => handleReportedSourceFilterChange(f.key as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
                            reportedSourceFilter === f.key
                              ? "bg-stone-900 text-white shadow-sm"
                              : "text-stone-600 hover:text-stone-900 hover:bg-stone-200"
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-6">
                    {getFilteredReports()
                      .map((report) => (
                        <div
                          key={report.id}
                          className={`p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] border-2 shadow-sm transition-all duration-300 ${
                            report.status === "OPEN"
                              ? "border-red-100 bg-white"
                              : report.status === "DISMISSED"
                              ? "border-stone-200 bg-stone-50 opacity-70"
                              : "border-emerald-100 bg-stone-50 opacity-70"
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
                            <div className="flex-grow space-y-4">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <div className="font-black text-red-600 flex items-center gap-2 uppercase tracking-tighter text-lg italic">
                                    <ShieldAlert className="w-6 h-6 animate-pulse shrink-0" />{" "}
                                    Listing Violation Report
                                  </div>
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                                      report.source === "BATTLE_BIDS"
                                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                                        : report.source === "NEGOTIATION"
                                        ? "bg-purple-100 text-purple-800 border border-purple-300"
                                        : "bg-blue-100 text-blue-800 border border-blue-300"
                                    }`}
                                  >
                                    {report.sourceLabel || "Marketplace"}
                                  </span>
                                </div>
                                <span
                                  className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
                                    report.status === "OPEN"
                                      ? "bg-red-500 text-white"
                                      : report.status === "DISMISSED"
                                      ? "bg-stone-300 text-stone-800"
                                      : "bg-emerald-600 text-white"
                                  }`}
                                >
                                  {report.status}
                                </span>
                              </div>

                              <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100 shadow-inner flex flex-col md:flex-row gap-6">
                                {report.listingImage && (
                                  <div className="w-24 h-24 shrink-0 rounded-xl overflow-hidden border border-stone-200 shadow-sm">
                                    <img
                                      src={report.listingImage}
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                )}
                                <div className="flex-grow">
                                  <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                                    <div className="text-xs font-black text-stone-400 uppercase tracking-widest">
                                      Reported Item:
                                    </div>
                                    <div className="text-xs font-black text-stone-900 uppercase italic tracking-tighter">
                                      {report.listingTitle || "Unknown Listing"}
                                      {report.listingPrice && (
                                        <span className="ml-2 text-amber-600">
                                          ({formatPKR(report.listingPrice)})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">
                                    Reported Reason:
                                  </div>
                                  <div className="text-stone-900 font-bold leading-relaxed italic capitalize">
                                    "{report.reason}"
                                  </div>
                                  {report.description && (
                                    <div className="mt-2 text-xs text-stone-600 bg-white p-3 rounded-xl border border-stone-200">
                                      <span className="font-black text-stone-400 uppercase not-italic block mb-0.5 text-[10px] tracking-wider">
                                        Details / Note:
                                      </span>
                                      "{report.description}"
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-6 pt-2 flex-wrap">
                                {report.source === "BATTLE_BIDS" ? (
                                  <Link
                                    to={`/battle-bids`}
                                    className="flex items-center gap-2 text-stone-900 font-black uppercase text-xs tracking-widest hover:text-amber-500 transition-colors"
                                  >
                                    <Eye className="w-4 h-4" /> View in Battle Bids
                                  </Link>
                                ) : report.source === "NEGOTIATION" ? (
                                  <Link
                                    to={`/battle-bids/negotiations`}
                                    className="flex items-center gap-2 text-stone-900 font-black uppercase text-xs tracking-widest hover:text-amber-500 transition-colors"
                                  >
                                    <Eye className="w-4 h-4" /> View in Negotiation Hub
                                  </Link>
                                ) : (
                                  <Link
                                    to={`/listings/${report.listingId}`}
                                    className="flex items-center gap-2 text-stone-900 font-black uppercase text-xs tracking-widest hover:text-amber-500 transition-colors"
                                  >
                                    <Eye className="w-4 h-4" /> Inspect Listing
                                  </Link>
                                )}
                                <div className="text-xs font-bold text-stone-400 uppercase">
                                  Reported On:{" "}
                                  {formatSafeDate(report.createdAt)}
                                </div>
                                {report.targetId && (
                                  <div className="text-xs font-medium text-stone-400">
                                    Target ID: <code className="text-stone-600">{report.targetId}</code>
                                  </div>
                                )}
                              </div>
                            </div>

                            {report.status === "OPEN" && (
                              <div className="flex flex-col gap-3 w-full lg:w-56 shrink-0 max-h-[210px] overflow-y-auto pr-1 custom-scrollbar">
                                {report.localActionsTaken?.includes(
                                  "ignored",
                                ) ? (
                                  <div className="w-full flex items-center justify-between px-3 py-2 md:px-6 md:py-4 bg-emerald-500 text-white rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-sm">
                                    <span className="flex items-center gap-2">
                                      <BadgeCheck className="w-4 h-4" />
                                      Report Rejected
                                    </span>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => rejectReport(report)}
                                    disabled={processingReportId === report.id}
                                    className="w-full flex items-center justify-between px-3 py-2 md:px-6 md:py-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 group/act shadow-sm"
                                  >
                                    <span className="flex items-center gap-2">
                                      {processingReportId === report.id ? (
                                        <div className="w-3 h-3 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
                                      ) : (
                                        <Eye className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
                                      )}
                                      Ignore Report
                                    </span>
                                    <span className="text-xs text-stone-400 font-bold uppercase tracking-wider italic">
                                      Irrelevant
                                    </span>
                                  </button>
                                )}

                                {report.ownerId ? (
                                  report.localActionsTaken?.includes(
                                    "warned",
                                  ) ? (
                                    <div className="w-full flex items-center justify-between px-3 py-2 md:px-6 md:py-4 bg-emerald-500 text-white rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-sm">
                                      <span className="flex items-center gap-2">
                                        <BadgeCheck className="w-4 h-4" />
                                        Warning Sent
                                      </span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        warnAndResolve(
                                          report.id,
                                          report.ownerId!,
                                          report.reporterId,
                                          report.listingTitle,
                                          report.source,
                                          report.targetType,
                                          report.targetId || report.listingId,
                                        )
                                      }
                                      disabled={
                                        processingReportId === report.id
                                      }
                                      className="w-full flex items-center justify-between px-3 py-2 md:px-6 md:py-4 bg-amber-500 hover:bg-black text-stone-900 hover:text-white rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 disabled:opacity-50 group/act"
                                    >
                                      <span className="flex items-center gap-2">
                                        {processingReportId === report.id ? (
                                          <div className="w-3 h-3 border-2 border-amber-900 border-t-white rounded-full animate-spin" />
                                        ) : (
                                          <ShieldAlert className="w-4 h-4" />
                                        )}
                                        Warn Account
                                      </span>
                                      <span className="text-xs text-stone-900/40 group-hover/act:text-white/40 font-bold italic uppercase tracking-tighter">
                                        Official
                                      </span>
                                    </button>
                                  )
                                ) : null}

                                {report.localActionsTaken?.includes(
                                  "removed",
                                ) ? (
                                  <div className="w-full flex items-center justify-between px-3 py-2 md:px-6 md:py-4 bg-emerald-500 text-white rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-sm">
                                    <span className="flex items-center gap-2">
                                      <BadgeCheck className="w-4 h-4" />
                                      Listing Removed
                                    </span>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() =>
                                      removeAndResolve(
                                        report.id,
                                        report.listingId,
                                        report.ownerId,
                                        report.reporterId,
                                        report.source,
                                        report.targetType,
                                      )
                                    }
                                    disabled={processingReportId === report.id}
                                    className="w-full flex items-center justify-between px-3 py-2 md:px-6 md:py-4 bg-red-600 hover:bg-black text-white rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-red-600/20 disabled:opacity-50 group/act"
                                  >
                                    <span className="flex items-center gap-2">
                                      {processingReportId === report.id ? (
                                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                      ) : (
                                        <Trash2 className="w-4 h-4" />
                                      )}
                                      Remove Listing
                                    </span>
                                    <span className="text-xs text-white/40 font-bold uppercase tracking-wider">
                                      Strike
                                    </span>
                                  </button>
                                )}

                                {report.ownerId &&
                                  (report.localActionsTaken?.includes(
                                    "blocked",
                                  ) ? (
                                    <div className="w-full flex items-center justify-between px-3 py-2 md:px-6 md:py-4 bg-emerald-500 text-white rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-sm">
                                      <span className="flex items-center gap-2">
                                        <BadgeCheck className="w-4 h-4" />
                                        Account Blocked
                                      </span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        blockAndResolveListing(
                                          report.id,
                                          report.ownerId!,
                                          report.listingId,
                                          report.reporterId,
                                          report.source,
                                          report.targetType,
                                        )
                                      }
                                      disabled={
                                        processingReportId === report.id
                                      }
                                      className="w-full flex items-center justify-between px-3 py-2 md:px-6 md:py-3 bg-stone-900 hover:bg-red-700 text-white rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 group/act"
                                    >
                                      <span className="flex items-center gap-2">
                                        <UserX className="w-4 h-4 text-red-500 group-hover:text-white" />
                                        Block Account
                                      </span>
                                      <span className="text-xs text-stone-400 group-hover:text-white/40 font-bold tracking-tighter italic">
                                        TERMINATE
                                      </span>
                                    </button>
                                  ))}

                                {!report.ownerId && (
                                  <div className="px-4 py-2 bg-stone-100 rounded-xl text-xs font-bold text-stone-400 uppercase text-center border border-dashed border-stone-200">
                                    Metadata missing: User block restricted
                                  </div>
                                )}

                                <button
                                  onClick={() => finalizeAction(report.id, report.source)}
                                  disabled={
                                    processingReportId === report.id ||
                                    !report.localActionsTaken ||
                                    report.localActionsTaken.length === 0
                                  }
                                  className="w-full flex items-center justify-between px-3 py-2 md:px-6 md:py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-200 disabled:opacity-50 group/act mt-1"
                                >
                                  <span className="flex items-center gap-2">
                                    {processingReportId === report.id ? (
                                      <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                      <BadgeCheck className="w-4 h-4" />
                                    )}
                                    Action Taken
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    {getFilteredReports().length ===
                      0 && (
                      <div className="py-32 text-center bg-white rounded-[3rem] border-2 border-dashed border-stone-100">
                        <CheckCircle className="w-20 h-20 text-stone-100 mx-auto mb-4" />
                        <p className="text-stone-400 font-bold uppercase tracking-widest text-xs md:text-sm">
                          All clean! No listing reports pending.
                        </p>
                      </div>
                    )}
                    {reportsHasMore && getFilteredReports().length > 0 && (
                      <div className="flex justify-center pt-4 pb-2">
                        <button
                          type="button"
                          onClick={() => loadMoreReports()}
                          disabled={loadingMoreReports || loading}
                          className="px-6 py-3 bg-stone-900 hover:bg-black text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                        >
                          {loadingMoreReports ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                              <span>Loading More Reports...</span>
                            </>
                          ) : (
                            <span>Load More Reports</span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "profileReports" && (
                <div className="grid grid-cols-1">
                  <ReportStats items={profileReports} type="Accounts" />
                  <div className="flex flex-col md:flex-row gap-3 mb-6">
                    <input
                      type="text"
                      value={reportedProfilesSearch}
                      onChange={(e) => setReportedProfilesSearch(e.target.value)}
                      placeholder="Search reported profiles by user, email, reason, ID, or source..."
                      className="flex-grow bg-white border border-stone-200 rounded-xl px-4 py-3 font-bold text-stone-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="flex items-center gap-1.5 bg-stone-100 p-1.5 rounded-xl self-start md:self-auto overflow-x-auto max-w-full">
                      {[
                        { key: "ALL", label: "All Sources" },
                        { key: "MARKETPLACE", label: "Marketplace" },
                        { key: "BATTLE_BIDS", label: "Battle Bids" },
                        { key: "NEGOTIATION", label: "Negotiation" },
                      ].map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setReportedProfileSourceFilter(f.key as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                            reportedProfileSourceFilter === f.key
                              ? "bg-stone-900 text-white shadow-sm"
                              : "text-stone-600 hover:text-stone-900 hover:bg-stone-200"
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:gap-6">
                    {getFilteredProfileReports()
                      .map((report) => (
                        <div
                          key={report.id}
                          className={`p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] border-2 shadow-sm transition-all duration-300 ${report.status === "OPEN" ? "border-amber-100 bg-white" : "border-stone-100 bg-stone-50 opacity-60"}`}
                        >
                          <div className="flex flex-col lg:flex-row justify-between gap-4 md:gap-8">
                            <div className="flex-grow space-y-3 md:space-y-4">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <h3 className="font-black text-stone-900 uppercase tracking-tighter text-xl md:text-2xl italic flex items-center gap-2 md:gap-3">
                                    <Users className="w-6 h-6 md:w-8 md:h-8 text-amber-500" />{" "}
                                    Account Violation Report
                                  </h3>
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                                      report.source === "BATTLE_BIDS"
                                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                                        : report.source === "NEGOTIATION"
                                        ? "bg-purple-100 text-purple-800 border border-purple-300"
                                        : "bg-blue-100 text-blue-800 border border-blue-300"
                                    }`}
                                  >
                                    {report.sourceLabel || "Marketplace"}
                                  </span>
                                </div>
                                <span
                                  className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${report.status === "OPEN" ? "bg-amber-500 text-stone-900" : "bg-stone-200 text-stone-400"}`}
                                >
                                  {report.status}
                                </span>
                              </div>

                              <div className="bg-stone-50 border border-stone-200 rounded-xl md:rounded-2xl p-4 md:p-5">
                                <div className="text-xs font-black text-stone-400 uppercase tracking-widest mb-2">
                                  Reported Account Details:
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-stone-200 flex items-center justify-center font-black text-stone-700 text-sm overflow-hidden shrink-0">
                                    {report.userAvatar ? (
                                      <img
                                        src={report.userAvatar}
                                        alt={report.userName || "User"}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      (report.userName?.[0] || report.userEmail?.[0] || "U").toUpperCase()
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-black text-stone-900 text-sm md:text-base truncate">
                                      {report.userName || "Unnamed User"}
                                    </div>
                                    <div className="text-xs font-bold text-stone-500 truncate">
                                      {report.userEmail || "No email available"}
                                    </div>
                                    <div className="text-[10px] font-mono font-bold text-stone-400 truncate">
                                      UID: {report.profileId || "Unknown"}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="bg-amber-50/50 p-4 md:p-6 rounded-xl md:rounded-2xl border border-amber-100/50">
                                <div className="text-xs md:text-xs font-black text-amber-500 uppercase tracking-widest mb-1 md:mb-2">
                                  Complaint / Reason:
                                </div>
                                <p className="text-stone-800 font-bold text-base md:text-lg leading-tight italic">
                                  "{report.reason}"
                                </p>
                                {(report.details || report.description) && (
                                  <div className="mt-3 text-xs text-stone-600 bg-white p-3 rounded-xl border border-amber-200/60">
                                    <span className="font-black text-stone-400 uppercase not-italic block mb-0.5 text-[10px] tracking-wider">
                                      Additional Context:
                                    </span>
                                    "{report.details || report.description}"
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-4 md:gap-6 pt-1 md:pt-2">
                                <button
                                  onClick={() => viewSellerProfileFromListing(report.profileId)}
                                  className="flex items-center gap-2 text-stone-900 font-black uppercase text-xs md:text-xs tracking-widest bg-stone-100 px-3 md:px-4 py-1.5 md:py-2 rounded-lg hover:bg-stone-900 hover:text-white transition-all shadow-sm"
                                >
                                  <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-500" />{" "}
                                  View Profile
                                </button>
                                <div className="text-xs md:text-xs font-bold text-stone-400 uppercase">
                                  Sent On: {formatSafeDate(report.createdAt)}
                                </div>
                              </div>
                            </div>

                            {report.status === "OPEN" && (
                              <div className="flex flex-col gap-2 md:gap-3 w-full lg:w-56 shrink-0 md:max-h-[210px] md:overflow-y-auto md:pr-1 custom-scrollbar">
                                {report.localActionsTaken?.includes(
                                  "ignored",
                                ) ? (
                                  <div className="w-full flex items-center justify-between px-5 md:px-6 py-3.5 md:py-4 bg-emerald-500 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-sm">
                                    <span className="flex items-center gap-2">
                                      <BadgeCheck className="w-4 h-4" />
                                      Report Rejected
                                    </span>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() =>
                                      rejectProfileReport(report)
                                    }
                                    disabled={processingReportId === report.id}
                                    className="w-full flex items-center justify-between px-5 md:px-6 py-3.5 md:py-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 group/act shadow-sm"
                                  >
                                    <span className="flex items-center gap-2">
                                      {processingReportId === report.id ? (
                                        <div className="w-3 h-3 border-2 border-stone-400 border-t-stone-900 rounded-full animate-spin" />
                                      ) : (
                                        <Eye className="w-4 h-4 text-emerald-500" />
                                      )}
                                      Ignore Report
                                    </span>
                                    <span className="text-[7px] md:text-xs text-stone-400 font-bold uppercase italic">
                                      SKIP
                                    </span>
                                  </button>
                                )}

                                {report.profileId ? (
                                  <>
                                    {report.localActionsTaken?.includes(
                                      "warned",
                                    ) ? (
                                      <div className="w-full flex items-center justify-between px-5 md:px-6 py-3.5 md:py-4 bg-emerald-500 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-sm">
                                        <span className="flex items-center gap-2">
                                          <BadgeCheck className="w-4 h-4" />
                                          Warning Sent
                                        </span>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          warnAndResolveProfile(
                                            report.id,
                                            report.profileId,
                                            report.reporterId!,
                                            report.source,
                                          )
                                        }
                                        disabled={
                                          processingReportId === report.id
                                        }
                                        className="w-full flex items-center justify-between px-5 md:px-6 py-3.5 md:py-4 bg-amber-500 hover:bg-black text-stone-950 hover:text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-amber-200 disabled:opacity-50 group/act"
                                      >
                                        <span className="flex items-center gap-2">
                                          {processingReportId === report.id ? (
                                            <div className="w-3 h-3 border-2 border-amber-900 border-t-white rounded-full animate-spin" />
                                          ) : (
                                            <ShieldAlert className="w-4 h-4" />
                                          )}
                                          Warn Account
                                        </span>
                                        <span className="text-[7px] md:text-xs text-amber-900/40 group-hover/act:text-white/40 font-bold uppercase">
                                          Strike 1
                                        </span>
                                      </button>
                                    )}
                                    {report.localActionsTaken?.includes(
                                      "blocked",
                                    ) ? (
                                      <div className="w-full flex items-center justify-between px-5 md:px-6 py-3.5 md:py-4 bg-emerald-500 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-sm">
                                        <span className="flex items-center gap-2">
                                          <BadgeCheck className="w-4 h-4" />
                                          Account Blocked
                                        </span>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          blockAndResolveProfile(
                                            report.id,
                                            report.profileId,
                                            report.reporterId,
                                            report.source,
                                          )
                                        }
                                        disabled={
                                          processingReportId === report.id
                                        }
                                        className="w-full flex items-center justify-between px-5 md:px-6 py-3.5 md:py-4 bg-red-600 hover:bg-black text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-red-200 disabled:opacity-50 group/act"
                                      >
                                        <span className="flex items-center gap-2">
                                          {processingReportId === report.id ? (
                                            <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                          ) : (
                                            <UserX className="w-4 h-4" />
                                          )}
                                          Block Account
                                        </span>
                                        <span className="text-[7px] md:text-xs text-white/40 font-bold uppercase">
                                          Terminate
                                        </span>
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <div className="px-4 py-2 bg-stone-100 rounded-xl text-xs font-bold text-stone-400 uppercase text-center border border-dashed border-stone-200">
                                    Action Restricted: Target ID Missing
                                  </div>
                                )}

                                <button
                                  onClick={() => finalizeAction(report.id, report.source)}
                                  disabled={
                                    processingReportId === report.id ||
                                    !report.localActionsTaken ||
                                    report.localActionsTaken.length === 0
                                  }
                                  className="w-full flex items-center justify-between px-5 md:px-6 py-3.5 md:py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-200 disabled:opacity-50 group/act"
                                >
                                  <span className="flex items-center gap-2">
                                    {processingReportId === report.id ? (
                                      <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                      <BadgeCheck className="w-4 h-4" />
                                    )}
                                    Action Taken
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    {getFilteredProfileReports().length === 0 && (
                      <div className="py-20 md:py-32 text-center bg-white rounded-2xl md:rounded-[3rem] border-2 border-dashed border-stone-100">
                        <CheckCircle className="w-16 h-16 md:w-20 md:h-20 text-stone-100 mx-auto mb-4" />
                        <p className="text-stone-400 font-bold uppercase tracking-widest text-xs md:text-sm">
                          Clear skies! No profile reports found.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "search" && (
                <AdminSearch onView={handleSearchView} />
              )}

              {activeTab === "analysis" && <AdminAnalysis />}

              {activeTab === "kycVerifications" && (
                <div className="animate-fade-in space-y-8">
                  {/* Premium Header Panel */}
                  <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-stone-200/80 shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                      <div className="flex items-start gap-4">
                        <div className="p-3.5 bg-amber-500/10 text-amber-600 rounded-2xl shrink-0 mt-1">
                          <ShieldCheck className="w-8 h-8" />
                        </div>
                        <div>
                          <h2 className="text-stone-900 font-black uppercase italic tracking-tighter text-2xl md:text-3xl mb-1.5">
                            KYC Identity Verifications
                          </h2>
                          <p className="text-stone-400 text-xs md:text-sm font-semibold max-w-2xl leading-relaxed">
                            Verify applicant credentials, identity proofs, and physical coordinates. Approve submissions to apply the official Blue Tick badge, or issue revocation / deletion logs if policies are compromised.
                          </p>
                        </div>
                      </div>
                      <div className="relative w-full sm:w-auto">
                        <input
                          type="text"
                          placeholder="Search applications..."
                          value={kycVerificationsSearch}
                          onChange={(e) => setKycVerificationsSearch(e.target.value)}
                          className="w-full sm:w-64 pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                        />
                        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>
                  </div>

                  {/* Filter Segmented Row */}
                  <div className="bg-stone-50 p-2 rounded-2xl border border-stone-150 flex gap-1.5 overflow-x-auto scrollbar-none snap-x">
                    {[
                      { id: "ALL", label: "All Submissions" },
                      { id: "PENDING", label: "Pending Review" },
                      { id: "APPROVED", label: "Approved Users" },
                      { id: "REJECTED", label: "Rejected" },
                      { id: "REVOKED", label: "Revoked" },
                      { id: "PERMANENTLY_REMOVED", label: "Deleted Log" },
                    ].map((status) => (
                      <button
                        key={status.id}
                        onClick={() => setKycStatusFilter(status.id as any)}
                        className={`px-4 py-2.5 rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all duration-200 cursor-pointer snap-start shrink-0 whitespace-nowrap ${
                          kycStatusFilter === status.id
                            ? "bg-stone-900 text-amber-400 shadow-md scale-[1.02]"
                            : "bg-white text-stone-400 hover:text-stone-800 border border-stone-200/60 shadow-sm hover:bg-stone-50"
                        }`}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>

                  {/* Main Grid View */}
                  {getFilteredKyc().length === 0 ? (
                    <div className="text-center py-24 bg-white rounded-[2rem] border-2 border-dashed border-stone-100 flex flex-col items-center justify-center p-6">
                      <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mb-4 text-stone-300">
                        <Shield className="w-8 h-8" />
                      </div>
                      <h3 className="text-stone-800 font-black uppercase italic tracking-tighter text-lg mb-1">
                        No Applications Listed
                      </h3>
                      <p className="text-stone-400 font-bold uppercase tracking-widest text-xs max-w-xs">
                        There are currently no submissions matching your search and "{kycStatusFilter}" filter category.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {getFilteredKyc().map((app) => {
                        const trackingNumber = `MND-KYC-${app.userId.substring(0, 8).toUpperCase()}`;
                        return (
                          <div
                            key={app.id}
                            className={`bg-white p-6 rounded-[2rem] border transition-all duration-300 group flex flex-col justify-between gap-5 relative overflow-hidden shadow-sm ${
                              app.status === "PERMANENTLY_REMOVED"
                                ? "opacity-75 cursor-not-allowed border-red-900/20 bg-stone-50 grayscale-[20%]"
                                : "cursor-pointer hover:shadow-md " + (
                                  app.status === "PENDING"
                                    ? "hover:border-amber-400 border-stone-200"
                                    : app.status === "APPROVED"
                                      ? "hover:border-emerald-400 border-stone-200"
                                      : "hover:border-stone-400 border-stone-200"
                                )
                            }`}
                            onClick={() => {
                              if (app.status !== "PERMANENTLY_REMOVED") setSelectedKycApplication(app);
                            }}
                          >
                            {/* Accent indicator ribbon */}
                            <div
                              className={`absolute top-0 left-0 h-full w-1.5 ${
                                app.status === "PENDING"
                                  ? "bg-amber-400"
                                  : app.status === "RESUME_REQUESTED"
                                    ? "bg-indigo-400"
                                    : app.status === "APPROVED"
                                      ? "bg-emerald-400"
                                      : app.status === "REVOKED"
                                        ? "bg-stone-400"
                                        : app.status === "PERMANENTLY_REMOVED"
                                          ? "bg-stone-300"
                                          : "bg-red-500"
                              }`}
                            />

                            <div className="pl-2.5">
                              {/* Card Header metadata */}
                              <div className="flex justify-between items-center gap-2 mb-3.5 flex-wrap">
                                <span className="text-xs font-mono font-black text-stone-400 uppercase tracking-widest bg-stone-50 px-2.5 py-1 rounded-md border border-stone-200">
                                  #{trackingNumber}
                                </span>
                                <span
                                  className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${
                                    app.status === "PENDING"
                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                      : app.status === "RESUME_REQUESTED"
                                        ? "bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse font-extrabold"
                                        : app.status === "APPROVED"
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                          : app.status === "REVOKED"
                                            ? "bg-stone-100 text-stone-700 border-stone-200 line-through"
                                            : app.status === "PERMANENTLY_REMOVED"
                                              ? "bg-stone-800 text-stone-300 border-stone-900"
                                              : "bg-red-50 text-red-700 border-red-200"
                                  }`}
                                >
                                  {app.status === "RESUME_REQUESTED"
                                    ? "Resume Requested"
                                    : app.status.replace("_", " ")}
                                </span>
                              </div>

                              {/* Candidate Info */}
                              <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-xl group-hover:text-amber-600 transition-colors">
                                {app.legalName}
                              </h3>

                              {app.category === "BUSINESS" && app.businessName && (
                                <p className="text-amber-800 font-black text-xs uppercase tracking-wide mt-1.5 flex items-center gap-1">
                                  <Briefcase className="w-3.5 h-3.5 text-amber-600 shrink-0" /> {app.businessName}
                                </p>
                              )}

                              <div className="space-y-2 mt-4 pt-4 border-t border-stone-100 text-xs text-stone-600 font-medium">
                                <div className="flex items-center gap-2">
                                  <Mail className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                  <span className="truncate break-all">{app.userEmail || "No Email linked"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                  <span>{app.mobileNumber || "---"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                  <span className="truncate">{app.city || "---"}</span>
                                </div>
                              </div>

                              <div className="mt-4">
                                <span
                                  className={`px-2.5 py-1 rounded-md text-xs font-black tracking-widest uppercase border ${
                                    app.category === "BUSINESS"
                                      ? "bg-amber-50 text-amber-800 border-amber-200"
                                      : "bg-stone-50 text-stone-600 border-stone-200"
                                  }`}
                                >
                                  Type: {app.category}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (app.status !== "PERMANENTLY_REMOVED") setSelectedKycApplication(app);
                              }}
                              disabled={app.status === "PERMANENTLY_REMOVED"}
                              className={`w-full mt-2 font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 shadow-sm relative z-10 ${
                                app.status === "PERMANENTLY_REMOVED" 
                                  ? "bg-stone-300 text-stone-400 cursor-not-allowed opacity-50" 
                                  : "bg-stone-900 hover:bg-stone-800 text-white active:scale-95 cursor-pointer"
                              }`}
                            >
                              <Eye className={`w-4 h-4 ${app.status === "PERMANENTLY_REMOVED" ? "text-stone-400" : "text-amber-400"}`} /> 
                              {app.status === "PERMANENTLY_REMOVED" ? "Archived (View Only)" : "Open Application Details"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "nameRequests" && (
                <div>
                  {/* Header */}
                  <div className="bg-white p-6 rounded-[2rem] border border-stone-200/60 shadow-sm mb-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <h2 className="text-stone-900 font-black uppercase italic tracking-tighter text-2xl mb-1">
                        Verify Name Change Requests
                      </h2>
                      <p className="text-stone-400 text-xs font-semibold">
                        Sellers with a verified KYC status requesting display
                        trading name correction as locked rules permit. This
                        update updates their profile matching records.
                      </p>
                    </div>
                    <div className="relative w-full md:w-auto">
                      <input
                        type="text"
                        placeholder="Search requests..."
                        value={nameRequestsSearch}
                        onChange={(e) => setNameRequestsSearch(e.target.value)}
                        className="w-full md:w-64 pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                      <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  {getFilteredNameRequests().length === 0 ? (
                    <div className="text-center py-20 text-stone-400 font-bold uppercase tracking-widest text-xs bg-white rounded-3xl border border-stone-100">
                      No matching name change requests found.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {getFilteredNameRequests().map((req) => (
                        <div
                          key={req.id}
                          className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-sm flex flex-col gap-4"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider mb-2 ${
                                  req.status === "PENDING"
                                    ? "bg-amber-100 text-amber-700"
                                    : req.status === "APPROVED"
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-red-100 text-red-700"
                                }`}
                              >
                                Request {req.status}
                              </span>
                              <p className="text-stone-400 text-xs font-mono">
                                Date:{" "}
                                {new Date(
                                  req.createdAt as any,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                handleSearchView(req.userId, "account")
                              }
                              className="text-xs text-amber-600 font-bold uppercase tracking-widest bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100 hover:bg-amber-100 hover:text-amber-700 transition-colors active:scale-95 flex items-center gap-1 leading-none shadow-sm shadow-amber-500/10"
                            >
                              View Profile
                            </button>
                          </div>

                          <div className="flex flex-col gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                            {/* Username Change */}
                            {(req.newUsername && req.newUsername !== req.oldUsername) && (
                              <div className="flex items-center gap-4">
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-stone-400 block mb-0.5">Old Username</span>
                                  <span className="text-stone-400 font-bold text-xs line-through">@{req.oldUsername || "N/A"}</span>
                                </div>
                                <div className="text-stone-450 font-black">➔</div>
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-amber-600 block mb-0.5">New Username</span>
                                  <span className="text-stone-900 font-extrabold text-sm">@{req.newUsername}</span>
                                </div>
                              </div>
                            )}

                            {/* Real Name Change */}
                            {(req.newRealName && req.newRealName !== req.oldRealName) && (
                              <div className="flex items-center gap-4">
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-stone-400 block mb-0.5">Old Real Name</span>
                                  <span className="text-stone-400 font-bold text-xs line-through">{req.oldRealName || "N/A"}</span>
                                </div>
                                <div className="text-stone-450 font-black">➔</div>
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-amber-600 block mb-0.5">New Real Name</span>
                                  <span className="text-stone-900 font-extrabold text-sm">{req.newRealName}</span>
                                </div>
                              </div>
                            )}

                            {/* Business Name Change */}
                            {(req.newBusinessName && req.newBusinessName !== req.oldBusinessName) && (
                              <div className="flex items-center gap-4 pt-4 border-t border-stone-200/50">
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-stone-400 block mb-0.5">Old Business Name</span>
                                  <span className="text-stone-400 font-bold text-xs line-through">{req.oldBusinessName || "N/A"}</span>
                                </div>
                                <div className="text-stone-450 font-black">➔</div>
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-amber-600 block mb-0.5">New Business Name</span>
                                  <span className="text-stone-900 font-extrabold text-sm">{req.newBusinessName}</span>
                                </div>
                              </div>
                            )}

                            {/* Email Change */}
                            {(req.newEmail && req.newEmail !== req.oldEmail) && (
                              <div className="flex items-center gap-4 pt-4 border-t border-stone-200/50">
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-stone-400 block mb-0.5">Old Email</span>
                                  <span className="text-stone-400 font-bold text-xs line-through">{req.oldEmail || "N/A"}</span>
                                </div>
                                <div className="text-stone-450 font-black">➔</div>
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-amber-600 block mb-0.5">New Email</span>
                                  <span className="text-stone-900 font-extrabold text-sm">{req.newEmail}</span>
                                </div>
                              </div>
                            )}

                            {/* CNIC Number Change */}
                            {(req.newCnicNumber && req.newCnicNumber !== req.oldCnicNumber) && (
                              <div className="flex items-center gap-4 pt-4 border-t border-stone-200/50">
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-stone-400 block mb-0.5">Old National Identity Card</span>
                                  <span className="text-stone-400 font-bold text-xs line-through">{req.oldCnicNumber || "N/A"}</span>
                                </div>
                                <div className="text-stone-450 font-black">➔</div>
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-amber-600 block mb-0.5">New National Identity Card</span>
                                  <span className="text-stone-900 font-extrabold text-sm">{req.newCnicNumber}</span>
                                </div>
                              </div>
                            )}

                            {/* Residential Address Change */}
                            {(req.newResidentialAddress && req.newResidentialAddress !== req.oldResidentialAddress) && (
                              <div className="flex items-center gap-4 pt-4 border-t border-stone-200/50">
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-stone-400 block mb-0.5">Old Residential Address</span>
                                  <span className="text-stone-400 font-bold text-xs line-through">{req.oldResidentialAddress || "N/A"}</span>
                                </div>
                                <div className="text-stone-450 font-black">➔</div>
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-amber-600 block mb-0.5">New Residential Address</span>
                                  <span className="text-stone-900 font-extrabold text-sm">{req.newResidentialAddress}</span>
                                </div>
                              </div>
                            )}

                            {/* Business Address Change */}
                            {(req.newBusinessAddress && req.newBusinessAddress !== req.oldBusinessAddress) && (
                              <div className="flex items-center gap-4 pt-4 border-t border-stone-200/50">
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-stone-400 block mb-0.5">Old Business Address</span>
                                  <span className="text-stone-400 font-bold text-xs line-through">{req.oldBusinessAddress || "N/A"}</span>
                                </div>
                                <div className="text-stone-450 font-black">➔</div>
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-amber-600 block mb-0.5">New Business Address</span>
                                  <span className="text-stone-900 font-extrabold text-sm">{req.newBusinessAddress}</span>
                                </div>
                              </div>
                            )}

                            {/* Fallback for old simple name change requests */}
                            {(!req.newRealName && !req.newBusinessName && !req.newEmail) && (
                              <div className="flex items-center gap-4">
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-stone-400 block mb-0.5">Old Name</span>
                                  <span className="text-stone-400 font-bold text-sm line-through">{req.oldName}</span>
                                </div>
                                <div className="text-stone-450 font-black">➔</div>
                                <div className="flex-1">
                                  <span className="text-xs font-black uppercase tracking-widest text-amber-600 block mb-0.5">New Name</span>
                                  <span className="text-stone-900 font-extrabold text-base">{req.newName}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                            <span className="text-xs font-black uppercase tracking-widest text-stone-400 block mb-1">
                              Reason for Name Change
                            </span>
                            <p className="text-stone-700 text-xs font-semibold leading-relaxed italic">
                              "{req.reason}"
                            </p>
                          </div>

                          {req.rejectionReason && (
                            <div className="bg-red-50 p-4 rounded-2xl text-red-700 text-xs border border-red-100 mt-1">
                              <span className="text-xs font-black uppercase tracking-widest text-red-500 block mb-0.5">
                                Decline Reason
                              </span>
                              <p className="font-semibold">
                                {req.rejectionReason}
                              </p>
                            </div>
                          )}

                          {req.status === "PENDING" && (
                            <div className="mt-2 pt-4 border-t border-stone-100 flex flex-col gap-3">
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  id={`decline-reason-${req.id}`}
                                  placeholder="Enter rejection reason if declining..."
                                  className="flex-grow bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                                />
                                <button
                                  onClick={() => {
                                    const el = document.getElementById(
                                      `decline-reason-${req.id}`,
                                    ) as HTMLInputElement;
                                    handleNameChangeReject(
                                      req,
                                      el?.value || "",
                                    );
                                  }}
                                  disabled={kycActionSubmitting}
                                  className="bg-stone-900 hover:bg-stone-800 text-white hover:text-red-500 font-black uppercase tracking-widest text-xs px-4 rounded-xl transition-all"
                                >
                                  Decline Request
                                </button>
                              </div>
                              <button
                                onClick={() => handleNameChangeApprove(req)}
                                disabled={kycActionSubmitting}
                                className="w-full bg-emerald-500 hover:bg-emerald-600 duration-150 text-stone-900 font-black uppercase tracking-widest text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm"
                              >
                                <CheckSquare className="w-4 h-4 text-stone-900" />{" "}
                                Approve Name Change & Propagate updates
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "applications" && (
                <div>
                  <div className="flex gap-4 mb-6">
                    {["PENDING", "APPROVED", "REJECTED", "ALL"].map(
                      (status) => (
                        <button
                          key={status}
                          onClick={() =>
                            setApplicationsStatusFilter(status as any)
                          }
                          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest ${applicationsStatusFilter === status ? "bg-amber-500 text-stone-900" : "bg-stone-100 text-stone-400 hover:bg-stone-200"}`}
                        >
                          {status}
                        </button>
                      ),
                    )}
                  </div>
                  {applications.length === 0 ? (
                    <div className="text-center py-20 text-stone-400 font-bold uppercase tracking-widest text-xs">
                      No applications found in this status.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {applications.map((app) => (
                        <VerifiedSellerAppCard
                          key={app.id}
                          app={app}
                          onApprove={handleApplicationAction}
                          onReject={handleApplicationAction}
                          viewTicketSenderProfile={viewTicketSenderProfile}
                          formatSafeDate={formatSafeDate}
                          formatSafeTime={formatSafeTime}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "blockedAccounts" && (
                <div>
                  <div className="bg-white p-5 sm:p-6 rounded-[2rem] border border-stone-200/60 shadow-sm mb-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <h2 className="text-stone-900 font-black uppercase italic tracking-tighter text-xl sm:text-2xl mb-1 flex items-center gap-2">
                        <UserX className="w-6 h-6 text-red-500" />
                        Blocked/ Banned Accounts
                      </h2>
                      <p className="text-stone-400 text-xs font-semibold">
                        Manage users whose access has been restricted or administratively banned due to policy violations.
                      </p>
                    </div>
                    <div className="relative w-full md:w-auto">
                      <input
                        type="text"
                        placeholder="Search blocked or banned users..."
                        value={blockedAccountsSearch}
                        onChange={(e) => setBlockedAccountsSearch(e.target.value)}
                        className="w-full md:w-64 pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                      />
                      <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  {getFilteredBlocked().length === 0 ? (
                    <div className="text-center py-20 text-stone-400 font-bold uppercase tracking-widest text-xs bg-white rounded-3xl border border-stone-100">
                      No matching blocked or banned accounts found.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:gap-6">
                      {getFilteredBlocked().map((u) => {
                        const isBanned = isUserBanned(u);
                        const isBlocked = isUserBlocked(u);
                        const banInfo = getUserBanRemaining(u);
                        const reason = u.banReason || u.blockReason || "Policy or guideline violation";
                        const actionBy = u.bannedBy || u.blockedBy || "Administration";
                        const actionDate = u.bannedAt || u.blockedAt || u.updatedAt;
                        const hasAppeal = (u.appealStatus === "PENDING" || u.banAppealStatus === "pending" || u.biddingAppealStatus === "pending");
                        const appealText = u.banAppealMessage || u.biddingAppealMessage || u.appealMessage;

                        return (
                          <div
                            key={u.id}
                            className="bg-white p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] border-2 border-red-100 shadow-sm transition-all duration-300"
                          >
                            <div className="flex flex-col lg:flex-row justify-between gap-6 md:gap-8">
                              <div className="flex-grow space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 md:gap-3">
                                    <h3 className="font-black text-stone-900 uppercase tracking-tighter text-xl md:text-2xl italic flex items-center gap-2">
                                      <UserX className="w-6 h-6 md:w-7 md:h-7 text-red-500 shrink-0" />
                                      {isBanned && isBlocked
                                        ? "Blocked & Banned"
                                        : isBanned
                                        ? "Banned Account"
                                        : "Blocked Account"}
                                    </h3>
                                    {isBanned && (
                                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                        banInfo.isPermanent
                                          ? "bg-red-100 text-red-700"
                                          : "bg-amber-100 text-amber-800"
                                      }`}>
                                        {banInfo.isPermanent ? "Permanent Ban" : banInfo.formattedText}
                                      </span>
                                    )}
                                    {isBlocked && !isBanned && (
                                      <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                        Blocked Account
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs font-bold text-stone-400 uppercase">
                                    Restricted On: {formatSafeDate(actionDate)}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                                    <div className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">
                                      User Details:
                                    </div>
                                    <div className="font-black text-stone-900 text-xs md:text-sm italic">
                                      {u.name || "Anonymous User"}
                                    </div>
                                    <div className="text-xs text-stone-500 truncate mt-0.5">
                                      {u.email}
                                    </div>
                                    {u.issuedAdminCode && (
                                      <div className="text-[11px] font-mono text-amber-700 font-bold mt-1">
                                        Code: {u.issuedAdminCode}
                                      </div>
                                    )}
                                  </div>
                                  <div className="bg-red-50/80 p-4 rounded-xl border border-red-100">
                                    <div className="text-xs font-black text-red-400 uppercase tracking-widest mb-1">
                                      {isBanned ? "Ban Reason:" : "Block Reason:"}
                                    </div>
                                    <div className="text-stone-800 font-bold text-xs md:text-sm leading-tight italic">
                                      "{reason}"
                                    </div>
                                    <div className="mt-2 text-xs font-bold text-stone-400 uppercase">
                                      Action by: {actionBy.substring(0, 20)}
                                    </div>
                                  </div>
                                </div>

                                {hasAppeal && (
                                  <div className="bg-amber-50 p-4 md:p-5 rounded-xl md:rounded-2xl border-2 border-amber-200 border-dashed">
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                                      <div className="text-xs font-black text-amber-700 uppercase tracking-widest">
                                        Received Appeal ({u.banAppealStatus ? "Ban Appeal" : "Account Appeal"}):
                                      </div>
                                    </div>
                                    <p className="text-stone-800 font-bold text-xs md:text-sm italic">
                                      "{appealText || "No message provided."}"
                                    </p>
                                  </div>
                                )}

                                <div className="flex items-center gap-4 md:gap-6 pt-1">
                                  <button
                                    onClick={() => viewAccountDetail(u)}
                                    className="flex items-center gap-2 text-stone-900 font-black uppercase text-xs tracking-widest bg-stone-100 px-3 md:px-4 py-2 rounded-lg hover:bg-stone-900 hover:text-white transition-all shadow-sm"
                                  >
                                    <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-500" />
                                    View Profile
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 md:gap-3 w-full lg:w-56 shrink-0 justify-center">
                                <button
                                  onClick={() => unblockUser(u.id, u.name || "User")}
                                  disabled={processingUnblockId === u.id}
                                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-stone-200 text-white font-black py-3.5 md:py-4 rounded-xl md:rounded-2xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-200 disabled:shadow-none"
                                >
                                  {processingUnblockId === u.id ? (
                                    <>
                                      <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                      Processing...
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="w-4 h-4" />
                                      Unblock / Unban
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => sendWarning(u.id, u.name || "User")}
                                  disabled={!!processingUnblockId}
                                  className="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 font-black py-3.5 md:py-4 rounded-xl md:rounded-2xl text-xs uppercase tracking-widest transition-all shadow-sm disabled:opacity-50"
                                >
                                  Warn Account
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "pausedAccounts" && (
                <div>
                  <div className="bg-white p-5 sm:p-6 rounded-[2rem] border border-stone-200/60 shadow-sm mb-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <h2 className="text-stone-900 font-black uppercase italic tracking-tighter text-xl sm:text-2xl mb-1 flex items-center gap-2">
                        <PauseCircle className="w-6 h-6 text-amber-500" />
                        Paused Accounts
                        {pausedUsers.length > 0 && (
                          <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-bold">
                            {pausedUsers.length}
                          </span>
                        )}
                      </h2>
                      <p className="text-stone-400 text-xs font-semibold">
                        Manage users whose accounts are temporarily paused by administration or self-pause.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <div className="relative w-full sm:w-64">
                        <input
                          type="text"
                          placeholder="Search paused users..."
                          value={pausedAccountsSearch}
                          onChange={(e) => setPausedAccountsSearch(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                        />
                        <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      </div>
                      <button
                        onClick={() => fetchData()}
                        disabled={loading}
                        title="Refresh Paused Accounts"
                        className="inline-flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-black px-4 py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm shrink-0 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 text-stone-600 ${loading ? "animate-spin" : ""}`} />
                        <span className="hidden sm:inline">Refresh</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowManualPauseModal(true);
                          setManualPauseUserQuery("");
                          setPauseActionReason("");
                        }}
                        className="inline-flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-black px-4 py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shrink-0"
                      >
                        <Plus className="w-4 h-4 text-amber-400" />
                        Pause Account
                      </button>
                    </div>
                  </div>

                  {getFilteredPaused().length === 0 ? (
                    <div className="text-center py-20 px-4 bg-white rounded-3xl border border-stone-100 shadow-sm">
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
                        <PauseCircle className="w-7 h-7 text-amber-500" />
                      </div>
                      <div className="text-stone-900 font-black uppercase tracking-tight text-base mb-1">
                        No Paused Accounts Found
                      </div>
                      <p className="text-stone-400 text-xs max-w-md mx-auto mb-4">
                        {pausedAccountsSearch
                          ? `No paused accounts match "${pausedAccountsSearch}".`
                          : "There are currently no accounts on pause. All active users have unrestricted account privileges."}
                      </p>
                      <button
                        onClick={() => {
                          setShowManualPauseModal(true);
                          setManualPauseUserQuery("");
                          setPauseActionReason("");
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        Pause An Account
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:gap-6">
                      {getFilteredPaused().map((u) => {
                        const reason = u.pauseReason || "Account temporarily placed on administrative hold";
                        const actionBy = u.pausedBy || "Administration";
                        const actionDate = u.pausedAt || u.updatedAt;

                        return (
                          <div
                            key={u.id}
                            className="bg-white p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] border-2 border-amber-100 shadow-sm transition-all duration-300 hover:border-amber-200"
                          >
                            <div className="flex flex-col lg:flex-row justify-between gap-6 md:gap-8">
                              <div className="flex-grow space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 md:gap-3">
                                    <h3 className="font-black text-stone-900 uppercase tracking-tighter text-xl md:text-2xl italic flex items-center gap-2">
                                      <PauseCircle className="w-6 h-6 md:w-7 md:h-7 text-amber-500 shrink-0" />
                                      Paused Account
                                    </h3>
                                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800">
                                      Temporarily Paused
                                    </span>
                                  </div>
                                  <div className="text-xs font-bold text-stone-400 uppercase">
                                    Paused On: {formatSafeDate(actionDate)}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                  <div className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                                    <div className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">
                                      User Details:
                                    </div>
                                    <div className="font-black text-stone-900 text-xs md:text-sm italic">
                                      {u.name || "Anonymous User"}
                                    </div>
                                    <div className="text-xs text-stone-500 truncate mt-0.5">
                                      {u.email}
                                    </div>
                                    {u.issuedAdminCode && (
                                      <div className="text-[11px] font-mono text-amber-700 font-bold mt-1">
                                        Code: {u.issuedAdminCode}
                                      </div>
                                    )}
                                    <div className="text-[11px] font-mono text-stone-400 truncate mt-1">
                                      UID: {u.id}
                                    </div>
                                  </div>
                                  <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-100">
                                    <div className="text-xs font-black text-amber-600 uppercase tracking-widest mb-1">
                                      Pause Reason:
                                    </div>
                                    <div className="text-stone-800 font-bold text-xs md:text-sm leading-tight italic">
                                      "{reason}"
                                    </div>
                                    {u.pausedUntil && (
                                      <div className="mt-2 text-xs font-black text-amber-700 uppercase flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-amber-600" /> Pause Until: {formatSafeDate(u.pausedUntil)}
                                      </div>
                                    )}
                                    <div className="mt-2 text-xs font-bold text-stone-400 uppercase">
                                      Action by: {actionBy.substring(0, 30)}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 pt-1">
                                  <button
                                    onClick={() => viewAccountDetail(u)}
                                    className="flex items-center gap-2 text-stone-900 font-black uppercase text-xs tracking-widest bg-stone-100 px-3 md:px-4 py-2 rounded-lg hover:bg-stone-900 hover:text-white transition-all shadow-sm"
                                  >
                                    <Eye className="w-3.5 h-3.5 md:w-4 md:h-4 text-emerald-500" />
                                    View Profile
                                  </button>
                                  <button
                                    onClick={() => sendWarning(u.id, u.name || "User")}
                                    className="flex items-center gap-2 text-stone-600 font-black uppercase text-xs tracking-widest bg-stone-100 px-3 md:px-4 py-2 rounded-lg hover:bg-amber-500 hover:text-stone-900 transition-all shadow-sm"
                                  >
                                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                                    Warn Account
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 md:gap-3 w-full lg:w-56 shrink-0 justify-center">
                                <button
                                  onClick={() => handleUnpauseUser(u.id, u.name || "User")}
                                  disabled={processingUnpauseId === u.id}
                                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-stone-200 text-white font-black py-3.5 md:py-4 rounded-xl md:rounded-2xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-200 disabled:shadow-none"
                                >
                                  {processingUnpauseId === u.id ? (
                                    <>
                                      <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                      Resuming...
                                    </>
                                  ) : (
                                    <>
                                      <PlayCircle className="w-4 h-4" />
                                      Resume / Unpause
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setShowBlockModal(true);
                                  }}
                                  className="w-full flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-black py-3 md:py-3.5 rounded-xl md:rounded-2xl text-xs uppercase tracking-widest transition-all border border-red-200"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                  Escalate To Block
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "adminOverview" && (
                <div className="space-y-6">
                  <AdminOverviewPanel />
                </div>
              )}
              {activeTab === "battleBidsModeration" && (
                <div className="space-y-6">
                  <ModerationDashboard />
                </div>
              )}
              {activeTab === "users" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {pendingVerifications.map((u) => (
                    <div
                      key={u.id}
                      className="p-5 md:p-6 rounded-xl md:rounded-2xl border-2 border-amber-100 bg-white shadow-sm flex flex-col gap-3 md:gap-4 relative"
                    >
                      <div className="font-black text-stone-900 text-lg md:text-xl italic">
                        {u.name || "Anonymous"}
                      </div>
                      <div className="text-xs md:text-sm text-stone-400 truncate">
                        {u.email}
                      </div>
                      <div className="bg-amber-50 p-3 md:p-4 rounded-lg md:rounded-xl">
                        <p className="text-xs md:text-xs font-black text-amber-700 uppercase tracking-widest mb-2">
                          Requested Badge:{" "}
                          {u.verifiedBadgeType === "GOLDEN"
                            ? "PREMIUM"
                            : "VERIFIED"}
                        </p>
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            {(!u.verificationStage || u.verificationStage === "NONE") ? (
                              <button
                                onClick={() => {
                                  setConfirmAction({
                                    message: `Are you sure you want to send this user's payment to the verifiers?`,
                                    onConfirm: () => sendUserToVerifiers(u.id)
                                  });
                                }}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs md:text-xs font-black py-2 rounded-lg transition-colors uppercase tracking-tight"
                              >
                                Send to Verifiers
                              </button>
                            ) : u.verificationStage === "SENT_TO_VERIFIERS" ? (
                              <button
                                disabled
                                className="flex-1 bg-amber-500 text-stone-900 text-xs md:text-xs font-black py-2 rounded-lg transition-colors uppercase tracking-tight opacity-85 cursor-not-allowed"
                              >
                                Sent to Verifiers ⏳
                              </button>
                            ) : u.verificationStage === "VERIFIER_DENIED" ? (
                              <div className="flex-1 flex flex-col gap-1">
                                <button
                                  onClick={() => {
                                    setConfirmAction({
                                      message: `Are you sure you want to re-send this user's payment to the verifiers?`,
                                      onConfirm: () => sendUserToVerifiers(u.id)
                                    });
                                  }}
                                  className="w-full bg-rose-600 hover:bg-rose-700 text-white text-xs md:text-xs font-black py-2 rounded-lg transition-colors uppercase tracking-tight"
                                >
                                  Denied (Resend?)
                                </button>
                                {u.paymentDenialReason && (
                                  <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-1.5 font-bold mt-1 text-center font-sans">
                                    <span className="uppercase text-xs text-rose-500 block">Reason:</span> {u.paymentDenialReason}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setConfirmAction({
                                    message: `Are you sure you want to approve this verification request?`,
                                    onConfirm: () => approveBadgeRequest(u.id, u.verifiedBadgeType || "BASIC")
                                  });
                                }}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-xs font-black py-2 rounded-lg transition-colors uppercase tracking-tight"
                              >
                                Approve Badge ✓
                              </button>
                            )}
                             {(!u.verificationStage || u.verificationStage === "NONE") ? (
                               <button
                                 disabled
                                 className="flex-1 bg-stone-100 text-stone-400 border border-stone-200 text-xs md:text-xs font-black py-2 rounded-lg uppercase tracking-tight cursor-not-allowed opacity-60"
                                 title="This application must first be forwarded to Payment Verifiers."
                               >
                                 Reject (Forward First)
                               </button>
                             ) : u.verificationStage === "SENT_TO_VERIFIERS" ? (
                               <button
                                 disabled
                                 className="flex-1 bg-stone-100 text-stone-400 border border-stone-200 text-xs md:text-xs font-black py-2 rounded-lg uppercase tracking-tight cursor-not-allowed opacity-60"
                                 title="This application has been sent to Payment Verifiers. You can't reject it until their decision."
                               >
                                 Reject (Locked)
                               </button>
                             ) : (
                               <button
                                 onClick={() => {
                                   setConfirmAction({
                                     message: `Are you sure you want to REJECT this verification request?`,
                                     onConfirm: () => rejectBadgeRequest(u.id)
                                   });
                                 }}
                                 className="flex-1 bg-white text-red-600 border border-red-20 border-red-50 text-xs md:text-xs font-black py-2 rounded-lg uppercase tracking-tight"
                               >
                                 Reject
                               </button>
                             )}
                          </div>
                      </div>
                      </div>
                    </div>
                  ))}
                  {pendingVerifications.length === 0 && (
                    <div className="py-20 md:py-32 text-center bg-white rounded-2xl md:rounded-[3rem] border-2 border-dashed border-stone-100 col-span-full">
                      <FileBadge className="w-16 h-16 md:w-20 md:h-20 text-stone-100 mx-auto mb-4" />
                      <p className="text-stone-400 font-bold uppercase tracking-widest text-xs md:text-sm">
                        No verification applications found!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "support" && (
                <div className="flex flex-col gap-6">
                  {/* Header */}
                  <div className="bg-white p-6 rounded-[2rem] border border-stone-200/60 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <h2 className="text-stone-900 font-black uppercase italic tracking-tighter text-2xl mb-1">
                        Support Tickets
                      </h2>
                      <p className="text-stone-400 text-xs font-semibold">
                        Manage support tickets submitted by users.
                      </p>
                    </div>
                    <div className="relative w-full md:w-auto">
                      <input
                        type="text"
                        placeholder="Search support tickets by email..."
                        value={supportTicketsSearch}
                        onChange={(e) => setSupportTicketsSearch(e.target.value)}
                        className="w-full md:w-72 pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                      <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  {/* Support Sub-Filters */}
                  <div className="flex gap-2 flex-wrap pb-2 border-b border-stone-100">
                    <button
                      onClick={() => setSupportFilter("UNRESOLVED")}
                      className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        supportFilter === "UNRESOLVED"
                          ? "bg-amber-500 text-stone-900 shadow-md transform -translate-y-[1px]"
                          : "bg-stone-100 text-stone-400 hover:bg-stone-200"
                      }`}
                    >
                      Unresolved
                    </button>
                    <button
                      onClick={() => setSupportFilter("RESOLVED")}
                      className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        supportFilter === "RESOLVED"
                          ? "bg-amber-500 text-stone-900 shadow-md transform -translate-y-[1px]"
                          : "bg-stone-100 text-stone-400 hover:bg-stone-200"
                      }`}
                    >
                      Resolved Tickets
                    </button>
                  </div>

                  {/* Support Tickets Grid */}
                  <div className="grid grid-cols-1 gap-3 md:gap-4">
                    {getFilteredSupport()
                      .filter((ticket) =>
                        supportFilter === "RESOLVED"
                          ? ticket.status === "RESOLVED"
                          : ticket.status !== "RESOLVED",
                      )
                      .map((ticket) => (
                        <div
                          key={ticket.id}
                          onClick={() => setSelectedSupportTicket(ticket)}
                          className="p-5 md:p-6 rounded-xl border border-stone-200 bg-white shadow-sm hover:border-amber-500 cursor-pointer transition-all active:scale-95 group relative"
                        >
                          <div className="flex justify-between items-start mb-3 md:mb-4">
                            <h4 className="font-black text-base md:text-lg text-stone-900 italic lowercase group-hover:text-amber-600 transition-colors">
                              {ticket.subject}
                            </h4>
                            <span
                              className={`text-xs md:text-xs font-black uppercase px-2 py-0.5 md:py-1 rounded tracking-widest ${
                                ticket.status === "RESOLVED"
                                  ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                                  : ticket.status === "IN_PROGRESS"
                                    ? "bg-blue-50 text-blue-600 border border-blue-100"
                                    : "bg-amber-50 text-amber-600 border border-amber-100"
                              }`}
                            >
                              {ticket.status}
                            </span>
                          </div>
                          <p className="text-stone-800 bg-stone-50 p-3 md:p-4 rounded-lg text-xs md:text-sm mb-3 md:mb-4 italic line-clamp-2">
                            "{ticket.message}"
                          </p>
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-xs font-bold text-stone-400 uppercase tracking-tight">
                              Tap to view & reply
                            </span>
                            {ticket.status !== "RESOLVED" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  solveTicket(ticket.id);
                                }}
                                className="bg-stone-900 text-white px-5 md:px-6 py-2 md:py-2.5 rounded-lg md:rounded-xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-emerald-500 transition-colors"
                              >
                                Mark Resolved
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                    {getFilteredSupport().filter((ticket) =>
                      supportFilter === "RESOLVED"
                        ? ticket.status === "RESOLVED"
                        : ticket.status !== "RESOLVED",
                    ).length === 0 && (
                      <div className="py-20 md:py-32 text-center bg-white rounded-2xl md:rounded-[3rem] border-2 border-dashed border-stone-100">
                        <Ticket className="w-16 h-16 md:w-20 md:h-20 text-stone-200 mx-auto mb-4" />
                        <p className="text-stone-400 font-bold uppercase tracking-widest text-xs md:text-sm">
                          {supportFilter === "RESOLVED"
                            ? "No resolved tickets found!"
                            : "No unresolved support tickets."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "creditApplications" && (
                <div className="space-y-6 font-sans">
                  {/* Header */}
                  <div className="bg-white p-6 rounded-[2rem] border border-stone-200/60 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Coins className="w-5 h-5 text-amber-500" />
                        <h2 className="text-stone-900 font-black uppercase italic tracking-tighter text-2xl">
                          Credit Purchase Applications
                        </h2>
                      </div>
                      <p className="text-stone-400 text-xs font-semibold">
                        Verify manual payment requests and issue Battle Bids & Hub Credits to users.
                      </p>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex gap-2 flex-wrap">
                      {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setCreditAppFilter(st)}
                          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                            creditAppFilter === st
                              ? 'bg-amber-500 text-stone-950 shadow-md font-bold'
                              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                          }`}
                        >
                          {st === 'PENDING' ? 'Pending Review' : st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Applications Grid */}
                  <div className="grid grid-cols-1 gap-4">
                    {creditApplications
                      .filter((app) => (creditAppFilter === 'ALL' ? true : app.status === creditAppFilter))
                      .map((app) => (
                        <div
                          key={app.id}
                          className="bg-white border rounded-2xl p-6 shadow-sm flex flex-col lg:flex-row justify-between gap-6 border-stone-200"
                        >
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/10 text-amber-600 border border-amber-500/30">
                                  {app.packageName || 'Credit Package'}
                                </span>
                                <span className="text-xs font-mono font-bold text-stone-400">
                                  ID: #{app.id?.substring(0, 8)}
                                </span>
                              </div>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                                  app.status === 'PENDING'
                                    ? 'bg-amber-100 text-amber-800 animate-pulse'
                                    : app.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {app.status}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-stone-50 p-4 rounded-xl border border-stone-100 text-xs">
                              <div>
                                <span className="block font-bold text-stone-400 uppercase text-[10px]">Applicant</span>
                                <span className="font-extrabold text-stone-900">{app.userName || 'User'}</span>
                                <span className="block text-[10px] text-stone-500 truncate">{app.userEmail}</span>
                              </div>

                              <div>
                                <span className="block font-bold text-stone-400 uppercase text-[10px]">Package Value</span>
                                <span className="font-mono font-black text-amber-600 text-sm">{app.credits} Credits</span>
                                <span className="block font-mono font-bold text-stone-700">${app.usdPrice?.toFixed(2)} USD</span>
                              </div>

                              <div>
                                <span className="block font-bold text-stone-400 uppercase text-[10px]">Payment Method</span>
                                <span className="font-bold text-stone-900">{app.paymentMethod || 'Manual'}</span>
                                {app.transactionId && (
                                  <span className="block font-mono text-[10px] text-stone-600 font-bold break-all mt-0.5">
                                    Ref: {app.transactionId}
                                  </span>
                                )}
                              </div>

                              <div>
                                <span className="block font-bold text-stone-400 uppercase text-[10px]">Submitted Date</span>
                                <span className="font-medium text-stone-700">{formatAdminDate(app.createdAt)}</span>
                              </div>
                            </div>

                            {app.paymentProofUrl && (
                              <div className="pt-2">
                                <span className="block text-xs font-bold text-stone-400 uppercase mb-1">
                                  Receipt Evidence Link:
                                </span>
                                <a
                                  href={app.paymentProofUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-amber-600 hover:underline text-xs font-bold font-mono break-all inline-flex items-center gap-1"
                                >
                                  {app.paymentProofUrl} ↗
                                </a>
                              </div>
                            )}

                            {app.rejectionReason && (
                              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                                <span className="font-bold uppercase block text-[10px] text-rose-600">Rejection Reason:</span>
                                <p className="font-medium">{app.rejectionReason}</p>
                              </div>
                            )}

                            {app.refundRequested && (
                              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-black uppercase tracking-wider text-[10px] text-amber-800">
                                    💸 95% Refund Claim ({app.refundStatus || 'PENDING'})
                                  </span>
                                  <span className="font-mono font-bold text-amber-700">
                                    Amount: ${app.refundCalculatedAmount || (Number(app.usdPrice || 0) * 0.95).toFixed(2)} USD
                                  </span>
                                </div>
                                <p className="text-[11px] text-stone-700">
                                  Payee: <strong>{app.refundName}</strong> | Bank: <strong>{app.refundBankName}</strong> | Account: <strong>{app.refundAccountNumber}</strong>
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Action Controls */}
                          {app.status === 'PENDING' && (
                            <div className="flex flex-col justify-center gap-2 shrink-0 lg:w-48">
                              <button
                                onClick={() => handleApproveCreditApp(app)}
                                disabled={creditAppActioning === app.id}
                                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span>Approve & Issue Credits</span>
                              </button>

                              <button
                                onClick={() => handleRejectCreditApp(app)}
                                disabled={creditAppActioning === app.id}
                                className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <XCircle className="w-4 h-4" />
                                <span>Reject Request</span>
                              </button>
                            </div>
                          )}

                          {app.status === 'REJECTED' && app.refundRequested && app.refundStatus !== 'REFUNDED' && (
                            <div className="flex flex-col justify-center gap-2 shrink-0 lg:w-48">
                              <button
                                onClick={() => handleApproveCreditRefund(app)}
                                disabled={creditAppActioning === app.id}
                                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                <DollarSign className="w-4 h-4" />
                                <span>Complete 95% Refund</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                    {creditApplications.filter((app) => (creditAppFilter === 'ALL' ? true : app.status === creditAppFilter)).length === 0 && (
                      <div className="bg-white border rounded-2xl p-12 text-center shadow-sm space-y-2">
                        <Coins className="w-12 h-12 text-stone-300 mx-auto" />
                        <p className="text-stone-900 font-bold uppercase text-sm">No Credit Applications Found</p>
                        <p className="text-stone-400 text-xs">There are no credit purchase requests matching the "{creditAppFilter}" filter.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "promotions" && (
                <div className="space-y-6">
                  {/* Status Toggle Filters */}
                  <div className="space-y-1.5 flex flex-col">
                    <div className="text-xs font-black text-stone-400 uppercase tracking-widest pl-1 font-mono">
                      Filter by Application Status
                    </div>
                    <div className="flex flex-wrap gap-1.5 p-1 bg-stone-100 rounded-xl max-w-4xl w-full">
                      {(
                        [
                          "PENDING",
                          "APPROVED",
                          "REVOKED",
                          "REJECTED",
                          "ALL",
                        ] as const
                      ).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setPromoFilter(status)}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs md:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                            promoFilter === status
                              ? "bg-amber-500 text-stone-900 shadow-md"
                              : "text-stone-400 hover:text-stone-900 hover:bg-stone-50"
                          }`}
                        >
                          {status === "PENDING"
                            ? "Pending"
                            : status === "APPROVED"
                              ? "Approved"
                              : status === "REVOKED"
                                ? "Revoked"
                                : status === "REJECTED"
                                  ? "Rejected"
                                  : "All"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Badge Type Filters */}
                  <div className="space-y-1.5 flex flex-col">
                    <div className="text-xs font-black text-stone-400 uppercase tracking-widest pl-1 font-mono">
                      Filter by Promotion Badge Type
                    </div>
                    <div className="flex flex-wrap gap-1.5 p-1 bg-stone-100 rounded-xl max-w-2xl">
                      {(
                        [
                          "ALL",
                          "FEATURED",
                          "BOOST",
                          "VERIFIED",
                        ] as const
                      ).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setPromoTypeFilter(type)}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs md:text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                            promoTypeFilter === type
                              ? "bg-stone-900 text-white shadow-md"
                              : "text-stone-400 hover:text-stone-900 hover:bg-stone-50"
                          }`}
                        >
                          {type === "ALL"
                            ? "All Badges"
                            : type === "FEATURED"
                              ? "⭐ Featured"
                              : type === "BOOST"
                                ? "🚀 Boosted"
                                : "🛡️ Verified"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Promotion ID Trace Field */}
                  <div className="space-y-1.5 flex flex-col">
                    <div className="text-xs font-black text-stone-400 uppercase tracking-widest pl-1 font-mono">
                      Search Application / Tracking ID
                    </div>
                    <div className="relative max-w-2xl w-full">
                      <input 
                        type="text" 
                        placeholder="Search by application number (e.g. APP-FEAT-123456)..." 
                        value={promoSearchQuery}
                        onChange={(e) => setPromoSearchQuery(e.target.value)}
                        className="w-full px-4.5 py-3 border border-stone-200 bg-white rounded-xl text-xs font-mono font-bold tracking-wide focus:outline-none focus:ring-1 focus:ring-stone-400 pr-9 transition-all placeholder:font-sans placeholder:text-stone-400"
                      />
                      {promoSearchQuery ? (
                        <button onClick={() => setPromoSearchQuery("")} className="absolute right-3 top-3.5 text-stone-400 hover:text-stone-700 text-xs font-black">
                           ✕
                        </button>
                      ) : (
                        <span className="absolute right-3 top-3.5 text-stone-400 text-xs">🔍</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {getFilteredPromoRequests().map((req) => (
                      <div
                        key={req.id}
                        onClick={() => setSelectedPromotion(req)}
                        className="bg-white p-4 md:p-5 rounded-xl border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-amber-500 transition-all active:scale-95 group"
                      >
                          <div className="flex items-start md:items-center gap-4">
                            <div className="flex-shrink-0 relative">
                              {req.paymentProofImage ? (
                                <img
                                  src={req.paymentProofImage}
                                  className="w-16 h-20 md:w-20 md:h-24 object-cover rounded-lg shadow-sm border border-stone-200"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-16 h-20 md:w-20 md:h-24 rounded-lg shadow-sm border border-amber-200 bg-amber-50 flex flex-col items-center justify-center p-1 text-center font-sans">
                                  <span className="text-xl">⚡</span>
                                  <span className="text-[9px] font-black uppercase text-amber-900 leading-none mt-1">Crypto</span>
                                  <span className="text-[8px] font-mono text-amber-700">TXID</span>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-stone-900/5 group-hover:bg-transparent transition-colors rounded-lg"></div>
                            </div>
                            <div>
                              <div className="text-sm font-black text-stone-900 italic uppercase group-hover:text-amber-600 transition-colors flex items-center gap-2">
                                <span>{req.planName}</span>
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-stone-100 text-stone-700 rounded border border-stone-200 not-italic">
                                  {req.paymentMethod || "Easypaisa"}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 font-mono text-xs bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200 w-fit">
                                <span className="font-bold text-stone-400 uppercase">APP #</span>
                                <span className="font-extrabold">{req.applicationId || `APP-${req.type.substring(0,3).toUpperCase()}-${req.id.substring(0, 6).toUpperCase()}`}</span>
                              </div>
                              <div className="text-xs text-stone-500 font-medium mb-2 mt-1 flex flex-wrap items-center gap-2">
                                <span className="text-stone-400 font-bold uppercase">{req.type}</span>
                                <span>•</span>
                                <span>App Amount: <strong className="text-stone-800 font-black">Rs. {req.amount?.toLocaleString() || 0}</strong></span>
                                {req.receivedAmount !== undefined && req.receivedAmount !== null && (
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 font-bold text-[10px]">
                                    Verified Received: Rs. {req.receivedAmount.toLocaleString()}
                                  </span>
                                )}
                              </div>
                              {req.refundRequested && req.refundStatus !== "REFUNDED" && req.refundStatus !== "REJECTED" && req.refundStatus !== "REJECTED_FINAL" && req.refundStatus !== "VERIFIER_REJECTED" && (
                                <div className="mb-2 flex items-center gap-1 bg-red-400 text-white text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded border border-red-500 animate-pulse w-fit font-sans">
                                  <span>💸 REFUND WANTED</span>
                                </div>
                              )}
                              {req.refundRequested && req.refundStatus === "REFUNDED" && (
                                <div className="mb-2 flex items-center gap-1 bg-emerald-500 text-white text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded border border-emerald-600 w-fit font-sans">
                                  <span>💸 REFUNDED</span>
                                </div>
                              )}
                              {req.refundRequested && (req.refundStatus === "REJECTED" || req.refundStatus === "REJECTED_FINAL" || req.refundStatus === "VERIFIER_REJECTED") && (
                                <div className="mb-2 flex items-center gap-1 bg-rose-500 text-white text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded border border-rose-600 w-fit font-sans">
                                  <span>💸 REFUND REJECTED</span>
                                </div>
                              )}
                              <span className="text-xs md:text-xs font-bold text-stone-400 uppercase tracking-tight block">
                                Tap to view details & target profile
                              </span>
                              {req.verificationStage === "VERIFIER_DENIED" && req.paymentDenialReason && (
                                <div className="mt-2 text-xs text-red-600 font-bold bg-red-50 border border-red-250 px-2 py-1.5 rounded-lg w-fit max-w-[280px] leading-normal break-words shadow-xs">
                                  <span className="uppercase text-xs text-red-500 mr-1 font-black">Verifier Denial Comment:</span>
                                  {req.paymentDenialReason}
                                </div>
                              )}
                              {req.status === "REJECTED" && req.rejectionReason && (
                                <div className="mt-2 text-xs text-red-650 font-bold bg-red-50 border border-red-250 px-2 py-1.5 rounded-lg w-fit max-w-[280px] leading-normal break-words shadow-xs">
                                  <span className="uppercase text-xs text-red-500 mr-1 font-black">Admin Rejection Msg:</span>
                                  {req.rejectionReason}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 self-end md:self-center items-end md:items-center">
                            <div
                              className={`text-xs md:text-xs font-black uppercase px-3 py-1.5 md:px-4 md:py-2 rounded-lg border text-center ${
                                req.status === "APPROVED"
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                  : req.status === "REVOKED"
                                    ? "bg-rose-55 text-rose-600 border-rose-200"
                                    : req.status === "RESUME_REQUESTED"
                                      ? "bg-amber-50 text-amber-600 border-amber-100 animate-pulse"
                                      : req.status === "PENDING"
                                        ? (req.verificationStage === "SENT_TO_VERIFIERS"
                                          ? "bg-indigo-50 text-indigo-600 border-indigo-100 animate-pulse"
                                          : req.verificationStage === "PAYMENT_VERIFIED"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                            : req.verificationStage === "VERIFIER_DENIED"
                                              ? "bg-rose-50 text-rose-700 border-rose-100"
                                              : "bg-amber-50 text-amber-600 border-amber-100")
                                        : (req.status === "REJECTED" && req.refundRequested)
                                          ? (req.refundStatus === "REFUNDED"
                                            ? "bg-emerald-55 text-emerald-700 border-emerald-200"
                                            : (req.refundStatus === "REJECTED" || req.refundStatus === "REJECTED_FINAL" || req.refundStatus === "VERIFIER_REJECTED")
                                              ? "bg-rose-50 text-rose-700 border-rose-100"
                                              : "bg-amber-50 text-amber-700 border-amber-100 animate-pulse")
                                          : "bg-stone-50 text-stone-600 border-stone-100"
                              }`}
                            >
                              {req.status === "PENDING"
                                ? (req.verificationStage === "SENT_TO_VERIFIERS"
                                  ? "Sent to Verifiers"
                                  : req.verificationStage === "PAYMENT_VERIFIED"
                                    ? "Payment Verified"
                                    : req.verificationStage === "VERIFIER_DENIED"
                                      ? "Payment Denied"
                                      : "Pending Review")
                                : req.status === "APPROVED"
                                  ? "Approved"
                                  : req.status === "REVOKED"
                                    ? "Revoked"
                                    : req.status === "RESUME_REQUESTED"
                                      ? "Resume Pending"
                                      : req.status === "REJECTED"
                                        ? (req.refundRequested
                                          ? (req.refundStatus === "REFUNDED"
                                            ? "Refunded"
                                            : (req.refundStatus === "REJECTED" || req.refundStatus === "REJECTED_FINAL" || req.refundStatus === "VERIFIER_REJECTED")
                                              ? "Refund Rejected"
                                              : "Pending Refund")
                                          : "Rejected")
                                        : req.status}
                            </div>
                            
                            {(!req.verificationStage || req.verificationStage === "NONE") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmAction({
                                    message: `Are you sure you want to send this badge application to Payment Verifiers to check the payment transaction authenticity?`,
                                    onConfirm: () => sendPromotionToVerifiers(req),
                                  });
                                }}
                                className="w-full md:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95"
                              >
                                Send to Verifiers
                              </button>
                            )}
                            
                            {req.status === "PENDING" && req.verificationStage === "PAYMENT_VERIFIED" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmAction({
                                    message: `Are you sure you want to approve this ${req.type} badge?`,
                                    onConfirm: () => approvePromotion(req),
                                  });
                                }}
                                className="w-full md:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95"
                              >
                                Approve ✓
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    {getFilteredPromoRequests().length === 0 && (
                      <div className="py-20 md:py-32 text-center bg-white rounded-2xl md:rounded-[3rem] border-2 border-dashed border-stone-100">
                        <Zap className="w-16 h-16 md:w-20 md:h-20 text-stone-100 mx-auto mb-4" />
                        <p className="text-stone-400 font-bold uppercase tracking-widest text-xs md:text-sm">
                          No promotion requests found.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "appeals" && (
                <div className="space-y-6">
                  <div className="bg-amber-50 border border-amber-200 p-6 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="bg-amber-100 p-3 rounded-2xl">
                        <AlertTriangle className="w-6 h-6 text-amber-600" />
                      </div>
                      <div>
                        <h2 className="font-extrabold text-amber-900 uppercase tracking-tight">Active Badge Appeals</h2>
                        <p className="text-amber-700 text-xs font-medium">Monitoring all requests where users have requested to resume a revoked badge.</p>
                      </div>
                    </div>
                    <div className="relative w-full md:w-auto">
                      <input
                        type="text"
                        placeholder="Search appeals..."
                        value={appealsSearch}
                        onChange={(e) => setAppealsSearch(e.target.value)}
                        className="w-full md:w-64 pl-10 pr-4 py-3 bg-white border border-amber-200 rounded-xl text-xs font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      />
                      <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  {getFilteredAppeals().length === 0 && getFilteredKycAppeals().length === 0 ? (
                    <div className="text-center py-20 text-stone-400 font-bold uppercase tracking-widest text-xs bg-white rounded-3xl border border-stone-100">
                      No matching appeals found.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {/* Promotion Badge Appeals */}
                      {getFilteredAppeals().map((req) => (
                        <div
                          key={req.id}
                          onClick={() => setSelectedPromotion(req)}
                          className="bg-white p-4 md:p-5 rounded-xl border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-amber-500 transition-all active:scale-95 group"
                        >
                          <div className="flex items-start md:items-center gap-4">
                            <div className="flex-shrink-0 relative">
                              <img
                                src={req.paymentProofImage}
                                className="w-16 h-20 md:w-20 md:h-24 object-cover rounded-lg shadow-sm border border-stone-200"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-amber-200">
                                  Promotion Badge Appeal
                                </span>
                              </div>
                              <div className="text-sm font-black text-stone-900 italic uppercase group-hover:text-amber-600 transition-colors">
                                {req.planName}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 font-mono text-xs bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200 w-fit">
                                <span className="font-bold text-stone-400 uppercase tracking-widest pl-1">ID:</span>
                                <span className="font-extrabold">{req.applicationId || req.id.substring(0, 8).toUpperCase()}</span>
                              </div>
                              <div className="mt-2 p-2 bg-stone-50 border border-stone-100 rounded-lg text-xs text-stone-600 italic">
                                "{req.appealMessage || "No appeal message provided."}"
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="bg-amber-100 text-amber-800 text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-amber-200 animate-pulse">
                              Appeal Pending
                            </span>
                          </div>
                        </div>
                      ))}

                      {/* KYC Verification Badge Appeals */}
                      {getFilteredKycAppeals().map((app) => {
                        const trackingNumber = `MND-KYC-${app.userId.substring(0, 8).toUpperCase()}`;
                        return (
                          <div
                            key={app.id}
                            onClick={() => setSelectedKycApplication(app)}
                            className="bg-white p-4 md:p-5 rounded-xl border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-emerald-500 transition-all active:scale-95 group"
                          >
                            <div className="flex items-start md:items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                                <ShieldCheck className="w-6 h-6" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-200">
                                    KYC Verification Badge Appeal
                                  </span>
                                  {app.category && (
                                    <span className="bg-stone-100 text-stone-600 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-stone-200">
                                      {app.category === "BUSINESS" && app.businessCategory === "FIRM_COMPANY"
                                        ? "FIRM / COMPANY"
                                        : app.category === "BUSINESS"
                                          ? "OWN BUSINESS"
                                          : "INDIVIDUAL"}
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm font-black text-stone-900 italic uppercase group-hover:text-emerald-600 transition-colors">
                                  {app.legalName || app.businessName || app.companyName || "Candidate User"}
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-xs text-stone-500 font-medium flex-wrap">
                                  <span className="font-mono bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200 font-extrabold text-stone-700">
                                    #{trackingNumber}
                                  </span>
                                  {app.userEmail && <span>{app.userEmail}</span>}
                                </div>
                                <div className="mt-2 p-2 bg-stone-50 border border-stone-100 rounded-lg text-xs text-stone-600 italic">
                                  "{app.resumeAppealMessage || app.rejectionReason || "Revoked KYC Verification Badge appeal submitted."}"
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="bg-amber-100 text-amber-800 text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-amber-200 animate-pulse">
                                Appeal Pending
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "refunds" && (
                <div className="space-y-6">
                  <div className="bg-emerald-50 border border-emerald-250 p-6 rounded-[2rem] flex items-center gap-4 shadow-sm">
                    <div className="bg-emerald-100 p-3 rounded-2xl">
                      <DollarSign className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="font-extrabold text-emerald-900 uppercase tracking-tight">Refund Processing Desk</h2>
                      <p className="text-emerald-700 text-xs font-medium">Manage and payout refund claims submitted by rejected applicants.</p>
                    </div>
                  </div>

                  {/* Sub-navigation Filters */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button
                      onClick={() => setRefundActiveFilter("PENDING")}
                      className={`px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs transition-all border-2 ${
                        refundActiveFilter === "PENDING"
                          ? "bg-amber-500 text-stone-900 border-amber-600 shadow-md"
                          : "bg-white text-stone-400 border-stone-200 hover:border-amber-300"
                      }`}
                    >
                      Pending Refunds
                    </button>
                    <button
                      onClick={() => setRefundActiveFilter("REJECTED")}
                      className={`px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs transition-all border-2 ${
                        refundActiveFilter === "REJECTED"
                          ? "bg-rose-500 text-white border-rose-600 shadow-md"
                          : "bg-white text-stone-400 border-stone-200 hover:border-rose-300"
                      }`}
                    >
                      Refund Rejected
                    </button>
                    <button
                      onClick={() => setRefundActiveFilter("REFUNDED")}
                      className={`px-6 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs transition-all border-2 ${
                        refundActiveFilter === "REFUNDED"
                          ? "bg-emerald-500 text-white border-emerald-600 shadow-md"
                          : "bg-white text-stone-400 border-stone-200 hover:border-emerald-300"
                      }`}
                    >
                      Refunded
                    </button>
                  </div>

                  {/* Search bar */}
                  <div className="space-y-1.5 flex flex-col">
                    <div className="text-xs font-black text-stone-400 uppercase tracking-widest pl-1 font-mono">
                      Search Refunds
                    </div>
                    <div className="relative max-w-2xl w-full">
                      <input 
                        type="text" 
                        placeholder="Search by application ID, applicant email, bank name, or admin code..." 
                        value={refundsSearch}
                        onChange={(e) => setRefundsSearch(e.target.value)}
                        className="w-full px-4.5 py-3 border border-stone-200 bg-white rounded-xl text-xs font-semibold text-stone-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-9 transition-all placeholder:text-stone-400 font-sans"
                      />
                      {refundsSearch ? (
                        <button onClick={() => setRefundsSearch("")} className="absolute right-3 top-3.5 text-stone-400 hover:text-stone-700 text-xs font-black">
                           ✕
                        </button>
                      ) : (
                        <span className="absolute right-3 top-3.5 text-stone-400 text-xs">🔍</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {getFilteredRefunds().map((req) => (
                      <div
                        key={req.id}
                        onClick={() => setSelectedPromotion(req)}
                        className="bg-white p-4 md:p-5 rounded-xl border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-amber-500 transition-all active:scale-95 group"
                      >
                          <div className="flex items-start md:items-center gap-4">
                            <div className="flex-shrink-0 relative">
                              <img
                                src={req.paymentProofImage}
                                className="w-16 h-20 md:w-20 md:h-24 object-cover rounded-lg shadow-sm border border-stone-200"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div>
                              <div className="text-sm font-black text-stone-900 italic uppercase group-hover:text-emerald-600 transition-colors">
                                {req.planName}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 font-mono text-xs bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200 w-fit">
                                <span className="font-bold text-stone-400 uppercase tracking-widest pl-1">APP ID:</span>
                                <span className="font-extrabold">{req.applicationId || req.id.substring(0, 8).toUpperCase()}</span>
                              </div>
                              <div className="text-xs text-stone-400 font-bold mt-2 flex items-center gap-2">
                                <span className="bg-stone-100 px-2 py-0.5 rounded uppercase tracking-widest text-xs">Refund Account:</span>
                                <span className="text-stone-900">{req.refundBankName || "Not specified"}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${
                              req.refundStatus === "REFUNDED" 
                                ? "bg-emerald-500 text-white border-emerald-600" 
                                : req.refundStatus === "REJECTED_FINAL" 
                                  ? "bg-rose-500 text-white border-rose-600" 
                                  : "bg-amber-100 text-amber-800 border-amber-200 animate-pulse"
                            }`}>
                              {req.refundStatus === "REFUNDED" ? "Paid Out" : req.refundStatus === "REJECTED_FINAL" ? "Closed/Rejected" : "Pending Action"}
                            </span>
                          </div>
                      </div>
                    ))}

                    {getFilteredRefunds().length === 0 && (
                      <div className="bg-stone-50 border border-dashed border-stone-300 rounded-2xl p-12 text-center">
                        <div className="bg-white w-16 h-16 rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 border border-stone-200">
                          <DollarSign className="w-8 h-8 text-stone-300" />
                        </div>
                        <h3 className="text-stone-900 font-black uppercase text-sm mb-2">No {refundActiveFilter.toLowerCase()} refund requests</h3>
                        <p className="text-stone-400 text-xs font-medium max-w-xs mx-auto">There are no matching {refundActiveFilter.toLowerCase()} refund claims at this time.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {selectedListingDetail && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 md:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setSelectedListingDetail(null)}
            className="absolute inset-0 bg-stone-950/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative w-[95vw] max-w-4xl bg-white rounded-2xl md:rounded-[3.5rem] shadow-2xl flex flex-col h-[96vh] md:h-auto md:max-h-[92vh] border-2 md:border-4 border-stone-100 overflow-hidden"
          >
            {/* Floating Close Button */}
            <button
              onClick={() => setSelectedListingDetail(null)}
              className="absolute top-5 right-5 z-[70] p-4 bg-red-600 text-white rounded-full hover:bg-stone-900 transition-all shadow-[0_0_20px_rgba(220,38,38,0.5)] active:scale-90 group border-4 border-white"
            >
              <X className="w-8 h-8 font-bold" />
            </button>

            {/* Modal Content */}
            <div className="flex-grow overflow-y-auto p-5 md:p-10 custom-scrollbar bg-stone-50/50">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10">
                {/* Visual Cluster */}
                <div className="space-y-4 md:space-y-6 flex-shrink-0">
                  <div className="aspect-[4/3] rounded-2xl md:rounded-[2.5rem] bg-stone-200 overflow-hidden border-2 md:border-4 border-white shadow-lg md:shadow-xl cursor-zoom-in">
                    <img
                      src={selectedListingDetail.images[0]}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onClick={() => setActiveKycLightbox({ src: selectedListingDetail.images[0], title: selectedListingDetail.title })}
                    />
                  </div>
                  {selectedListingDetail.images.length > 1 && (
                    <div className="grid grid-cols-4 gap-2 md:gap-3">
                      {selectedListingDetail.images.slice(1).map((img, i) => (
                        <div
                          key={i}
                          className="aspect-square rounded-xl md:rounded-2xl overflow-hidden border-2 border-white shadow-sm cursor-zoom-in"
                          onClick={() => setActiveKycLightbox({ src: img, title: `${selectedListingDetail.title} (Image ${i + 2})` })}
                        >
                          <img
                            src={img}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Operational Data Cluster */}
                <div className="space-y-6 md:space-y-8">
                  <div className="space-y-1.5 md:space-y-2">
                    <div className="text-xs md:text-xs font-black text-amber-500 uppercase tracking-widest">
                      Title & Identity
                    </div>
                    <h2 className="text-xl md:text-2xl font-black text-stone-900 uppercase italic tracking-tighter leading-tight italic">
                      {selectedListingDetail.title}
                    </h2>
                    <div className="flex items-center gap-2 md:gap-3 mt-3 md:mt-4">
                      <span className="px-3 md:px-4 py-1 md:py-1.5 bg-stone-900 text-white rounded-full text-xs md:text-xs font-black italic">
                        Rs. {selectedListingDetail.price.toLocaleString()}
                      </span>
                      <span className="px-3 md:px-4 py-1 md:py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-xs md:text-xs font-black uppercase">
                        {selectedListingDetail.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div
                      onClick={() => viewSellerProfileFromListing(selectedListingDetail.ownerId)}
                      className="p-3 md:p-4 bg-white hover:bg-amber-50 hover:border-amber-200 transition-all cursor-pointer rounded-xl md:rounded-2xl border border-stone-100 shadow-sm group"
                    >
                      <div className="text-xs md:text-xs font-black text-amber-600 group-hover:text-amber-700 uppercase mb-0.5 md:mb-1 flex items-center justify-between">
                        <span>Merchant</span>
                        <span className="text-[7px] text-stone-400 font-bold group-hover:underline">View Profile</span>
                      </div>
                      <div className="font-bold text-stone-900 group-hover:text-amber-900 text-xs md:text-sm truncate">
                        {selectedListingDetail.sellerName}
                      </div>
                    </div>
                    <div className="p-3 md:p-4 bg-white rounded-xl md:rounded-2xl border border-stone-100 shadow-sm">
                      <div className="text-xs md:text-xs font-black text-stone-400 uppercase mb-0.5 md:mb-1">
                        Location
                      </div>
                      <div className="font-bold text-stone-900 text-xs md:text-sm">
                        {selectedListingDetail.city}
                      </div>
                    </div>
                    <div className="p-3 md:p-4 bg-white rounded-xl md:rounded-2xl border border-stone-100 shadow-sm">
                      <div className="text-xs md:text-xs font-black text-stone-400 uppercase mb-0.5 md:mb-1">
                        Contact
                      </div>
                      <div className="font-bold text-stone-900 text-xs md:text-sm">
                        {selectedListingDetail.phoneNumber}
                      </div>
                    </div>
                    <div className="p-3 md:p-4 bg-white rounded-xl md:rounded-2xl border border-stone-100 shadow-sm">
                      <div className="text-xs md:text-xs font-black text-stone-400 uppercase mb-0.5 md:mb-1">
                        Category
                      </div>
                      <div className="font-bold text-stone-900 text-xs md:text-sm italic">
                        {selectedListingDetail.category}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest mb-1.5 md:mb-2">
                      Seller Narrative
                    </div>
                    <div className="p-4 md:p-6 bg-white rounded-2xl md:rounded-3xl border border-stone-100 shadow-inner text-stone-600 text-xs md:text-sm leading-relaxed font-medium italic mb-6">
                      {selectedListingDetail.description}
                    </div>
                  </div>

                  {/* Promotional Badges Administration */}
                  <div className="bg-amber-500/5 border-2 border-stone-900/10 p-5 rounded-3xl space-y-4">
                    <span className="text-xs font-black text-stone-900 uppercase tracking-widest block italic">
                      🛡️ AD PLACEMENT BADGES ADMIN CONTROL
                    </span>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Featured Badge Row */}
                      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                          <span className="font-extrabold text-xs text-stone-400 uppercase tracking-wide">Featured Badge</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-amber-500 font-bold">⭐</span>
                            <span className="text-xs font-black text-stone-800 uppercase">
                              {selectedListingDetail.isFeatured ? 'Active Status' : 'Inactive'}
                            </span>
                          </div>
                          {selectedListingDetail.isFeatured && selectedListingDetail.featuredUntil && (
                            <span className="block text-xs text-stone-400 font-mono">
                              Expires: {formatSafeDate(selectedListingDetail.featuredUntil)}
                            </span>
                          )}
                        </div>

                        <div className="flex gap-1.5 mt-1">
                          {selectedListingDetail.isFeatured ? (
                            <button
                              onClick={() => adminUpdateBadge(selectedListingDetail.id, 'FEATURED', false)}
                              className="w-full text-center py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors"
                            >
                              Revoke Badge
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (!isSuperAdmin) {
                                  alert("Action restricted: Only Super Admin is allowed to directly issue featured ads badge without an application.");
                                  return;
                                }
                                const days = window.prompt("Enter duration in days to issue FEATURED badge (e.g. 7, 15, 30):", "7");
                                if (days) {
                                  const numDays = parseInt(days);
                                  if (isNaN(numDays) || numDays <= 0) {
                                    alert("Invalid duration");
                                  } else {
                                    adminUpdateBadge(selectedListingDetail.id, 'FEATURED', true, numDays);
                                  }
                                }
                              }}
                              className={`w-full text-center py-2 rounded-xl font-black uppercase text-[9.5px] tracking-wider transition-colors ${
                                isSuperAdmin 
                                  ? "bg-amber-500 hover:bg-amber-600 text-stone-900 cursor-pointer" 
                                  : "bg-stone-100 border border-stone-250 text-stone-400 cursor-not-allowed"
                              }`}
                            >
                              {isSuperAdmin ? "Issue Badge" : "🔒 Super Admin Only"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Boosted Badge Row */}
                      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                          <span className="font-extrabold text-xs text-stone-400 uppercase tracking-wide">Boosted Badge</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-blue-500 font-bold">🚀</span>
                            <span className="text-xs font-black text-stone-800 uppercase">
                              {selectedListingDetail.isBoosted ? 'Active Status' : 'Inactive'}
                            </span>
                          </div>
                          {selectedListingDetail.isBoosted && selectedListingDetail.boostedUntil && (
                            <span className="block text-xs text-stone-400 font-mono">
                              Expires: {formatSafeDate(selectedListingDetail.boostedUntil)}
                            </span>
                          )}
                        </div>

                        <div className="flex gap-1.5 mt-1">
                          {selectedListingDetail.isBoosted ? (
                            <button
                              onClick={() => adminUpdateBadge(selectedListingDetail.id, 'BOOST', false)}
                              className="w-full text-center py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors"
                            >
                              Revoke Badge
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (!isSuperAdmin) {
                                  alert("Action restricted: Only Super Admin is allowed to directly issue boosted ads badge without an application.");
                                  return;
                                }
                                const days = window.prompt("Enter duration in days to issue BOOSTED badge (e.g. 3, 7, 15):", "7");
                                if (days) {
                                  const numDays = parseInt(days);
                                  if (isNaN(numDays) || numDays <= 0) {
                                    alert("Invalid duration");
                                  } else {
                                    adminUpdateBadge(selectedListingDetail.id, 'BOOST', true, numDays);
                                  }
                                }
                              }}
                              className={`w-full text-center py-2 rounded-xl font-black uppercase text-[9.5px] tracking-wider transition-colors ${
                                isSuperAdmin 
                                  ? "bg-blue-500 hover:bg-blue-600 text-white cursor-pointer" 
                                  : "bg-stone-100 border border-stone-250 text-stone-400 cursor-not-allowed"
                              }`}
                            >
                              {isSuperAdmin ? "Issue Badge" : "🔒 Super Admin Only"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer / Actions */}
            <div className="p-4 md:p-8 bg-stone-50 border-t border-stone-100 flex flex-col md:flex-row items-center justify-between gap-4 md:gap-0">
              <div className="flex items-center gap-4 md:gap-8">
                <div className="text-xs md:text-xs font-black text-stone-400 uppercase">
                  ID:{" "}
                  <span className="text-stone-900">
                    {selectedListingDetail.id.substring(0, 8)}...
                  </span>
                </div>
                <div className="text-xs md:text-xs font-black text-stone-400 uppercase">
                  Created:{" "}
                  <span className="text-stone-900">
                    {formatSafeDate(selectedListingDetail.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex w-full md:w-auto">
                <button
                  onClick={() => deleteListing(selectedListingDetail!.id)}
                  className="w-full md:w-auto flex items-center justify-center gap-2 md:gap-3 px-6 md:px-8 py-3 md:py-4 bg-red-600 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-red-500/20 italic group"
                >
                  <Trash2 className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-110 transition-transform" />
                  Delete Listing
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {selectedPromotion && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-2 md:p-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setSelectedPromotion(null)}
            className="absolute inset-0 bg-stone-950/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative w-[95vw] max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[92vh] border-2 md:border-4 border-stone-100 overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 md:p-8 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
              <div>
                <div className="text-xs font-black text-amber-500 uppercase tracking-widest mb-1">
                  Promotion Request
                </div>
                <h3 className="text-xl md:text-2xl font-black text-stone-900 italic uppercase">
                  {selectedPromotion.planName}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPromotion(null)}
                className="p-3 bg-white border border-stone-200 rounded-full hover:bg-stone-100 transition-colors shadow-sm"
              >
                <X className="w-6 h-6 text-stone-600" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-grow overflow-y-auto p-6 md:p-8 space-y-6 md:space-y-8 custom-scrollbar">
              {/* User/Item Link Info */}
              <div className="flex flex-col md:flex-row items-center justify-between p-6 bg-stone-100 rounded-2xl gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-black text-amber-600 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Tracking ID
                  </div>
                  <div className="font-mono text-xs font-bold text-stone-900 bg-stone-200 px-2 py-0.5 rounded border border-stone-300 w-fit">
                    {selectedPromotion.id}
                  </div>
                </div>

                <div className="space-y-1 text-right">
                  <div className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">
                    Target Account/Listing
                  </div>
                  <div className="font-bold text-stone-900 truncate max-w-xs md:max-w-sm ml-auto">
                    {selectedPromotion.type === 'VERIFIED' ? 'Premium Seller Profile' : selectedPromotion.targetId || 'Target Ads'}
                  </div>
                  <div className="text-xs text-stone-400">
                    Type:{" "}
                    <span className="font-bold text-stone-750 uppercase">
                      {selectedPromotion.type}
                    </span>
                  </div>
                  {selectedPromotion.userId && (
                    <div className="text-xs text-stone-550 font-medium">
                      Requester ID:{" "}
                      <span className="font-mono font-bold text-stone-700 bg-white/60 px-1 rounded">
                        {selectedPromotion.userId}
                      </span>
                    </div>
                  )}
                  {selectedPromotion.itemLink && (
                    <div className="text-xs text-stone-400 mt-2 select-all font-mono leading-tight bg-white p-2 rounded-lg border border-stone-200 truncate max-w-xs md:max-w-sm">
                      Link: {selectedPromotion.itemLink}
                    </div>
                  )}
                </div>
                <div className="w-full md:w-auto flex flex-col sm:flex-row md:flex-col gap-2">
                  {selectedPromotion.type !== "VERIFIED" ? (
                    <>
                      <a
                        href={
                          selectedPromotion.itemLink ||
                          `/listings/${selectedPromotion.targetId}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-stone-900 rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm text-center flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-4 h-4" />
                        See Listing
                      </a>
                      <button
                        onClick={() => {
                          viewTicketSenderProfile(selectedPromotion.userId);
                        }}
                        className="px-5 py-3 bg-white border border-stone-200 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-stone-50 hover:text-amber-600 hover:border-amber-200 text-stone-700 transition-colors shadow-sm text-center flex items-center justify-center gap-1.5"
                      >
                        <User className="w-4 h-4" />
                        View Profile
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        viewTicketSenderProfile(
                          selectedPromotion.targetId ||
                            selectedPromotion.userId,
                        );
                      }}
                      className="px-5 py-3 bg-white border border-stone-200 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-250 text-stone-700 transition-colors shadow-sm text-center flex items-center justify-center gap-1.5"
                    >
                      <User className="w-4 h-4" />
                      View Profile
                    </button>
                  )}
                </div>
              </div>

              {/* Applicant Profile & KYC status */}
              <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200/65 space-y-3 font-sans">
                <div className="text-xs font-black text-stone-400 uppercase tracking-widest">
                  Applicant Identity & Verified Status
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 bg-white rounded-xl border border-stone-100 shadow-sm">
                    <span className="text-xs text-stone-400 uppercase font-black block mb-0.5">Contact Number</span>
                    <span className="text-xs font-black text-stone-800">
                      {selectedPromoUser ? (selectedPromoUser.phoneNumber || "Not supplied") : "Loading details..."}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-stone-100 shadow-sm">
                    <span className="text-xs text-stone-400 uppercase font-black block mb-0.5 font-sans">KYC Approval Status</span>
                    {selectedPromoUser ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-black uppercase border leading-none ${
                        selectedPromoUser.kycStatus === "APPROVED"
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200 font-bold"
                          : selectedPromoUser.kycStatus === "PENDING"
                            ? "bg-amber-50 text-amber-600 border-amber-200 font-bold animate-pulse"
                            : "bg-red-50 text-red-650 border-red-200 font-bold"
                      }`}>
                        {selectedPromoUser.kycStatus === "APPROVED" ? "Approved KYC ✅" : selectedPromoUser.kycStatus === "PENDING" ? "Pending Review ⏳" : "Not Approved ❌"}
                      </span>
                    ) : (
                      <span className="text-xs text-stone-400 font-bold">Loading KYC...</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Revocation Reason / Appeal block */}
              {selectedPromotion.status === "REVOKED" &&
                selectedPromotion.revocationReason && (
                  <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl text-xs text-rose-800 animate-in fade-in duration-300">
                    <span className="font-black uppercase tracking-widest block mb-1">
                      Revocation Reason:
                    </span>
                    <p className="font-bold leading-relaxed">
                      {selectedPromotion.revocationReason}
                    </p>
                  </div>
                )}

              {selectedPromotion.status === "RESUME_REQUESTED" && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  {selectedPromotion.revocationReason && (
                    <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl text-xs text-rose-800">
                      <span className="font-black uppercase tracking-widest block mb-1">
                        Original Revocation Reason:
                      </span>
                      <p className="font-semibold leading-relaxed">
                        {selectedPromotion.revocationReason}
                      </p>
                    </div>
                  )}
                  {selectedPromotion.appealMessage && (
                    <div className="p-5 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-800">
                      <span className="font-black uppercase tracking-widest block mb-1">
                        User Resume Appeal Statement:
                      </span>
                      <p className="font-bold italic mt-1 leading-relaxed">
                        "{selectedPromotion.appealMessage}"
                      </p>
                    </div>
                  )}
                  {/* Appeal Evidence Images */}
                  {selectedPromotion.appealImages && selectedPromotion.appealImages.length > 0 && (
                    <div className="space-y-3">
                       <span className="text-xs font-black text-stone-400 uppercase tracking-widest block">
                        Appeal Evidence Images
                      </span>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {selectedPromotion.appealImages.map((img, idx) => (
                          <div key={idx} className="rounded-xl border border-stone-200 overflow-hidden shadow-sm bg-white aspect-square group relative">
                            <img 
                              src={img} 
                              alt={`Appeal Evidence ${idx + 1}`} 
                              className="w-full h-full object-cover cursor-zoom-in hover:scale-105 transition-transform duration-300"
                              onClick={() => setActiveKycLightbox({ src: img, title: `Appeal Evidence ${idx + 1}` })}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <Eye className="w-5 h-5 text-white" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Application Tracking Timeline Section */}
              <div className="bg-stone-50 border border-stone-200 p-5 rounded-2xl space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-stone-150">
                  <span className="text-xs font-black text-stone-400 uppercase tracking-widest block font-mono">
                    📍 APPLICATION LIFECYCLE TRACKING
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-xs bg-white text-stone-700 px-2 py-0.5 rounded border border-stone-200">
                    <span className="font-extrabold text-stone-400">TRK CODE:</span>
                    <span className="font-black">
                      {selectedPromotion.applicationId || `APP-${selectedPromotion.type.substring(0,3).toUpperCase()}-${selectedPromotion.id.substring(0,6).toUpperCase()}`}
                    </span>
                  </div>
                </div>

                <div className="relative pl-6 space-y-5 border-l border-stone-200">
                  {/* Step 1: Submission */}
                  <div className="relative">
                    <span className="absolute -left-[29px] top-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center shadow-xs text-[7px] text-white">✓</span>
                    <div>
                      <h4 className="text-xs font-black text-stone-900 uppercase">Application Received</h4>
                      <p className="text-xs text-stone-400 font-mono font-medium">
                        Submitted On: {formatAdminDate(selectedPromotion.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* Step 2: Payment Proof & Method Audit */}
                  <div className="relative">
                    <span className="absolute -left-[29px] top-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center shadow-xs text-[7px] text-white">✓</span>
                    <div>
                      <h4 className="text-xs font-black text-stone-900 uppercase">Payment Audit ({selectedPromotion.paymentMethod || "Easypaisa"})</h4>
                      <p className="text-xs text-stone-400 font-mono">
                        Method: <strong className="text-stone-800">{selectedPromotion.paymentMethod || "Easypaisa"}</strong>
                      </p>
                      
                      {selectedPromotion.txHash && (
                        <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1">
                          <span className="font-extrabold text-amber-900 uppercase block text-[10px]">USDT (BEP20) Transaction Hash / TXID:</span>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-black text-stone-900 select-all break-all">{selectedPromotion.txHash}</span>
                            <a
                              href={`https://bscscan.com/tx/${selectedPromotion.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-0.5 bg-stone-900 text-amber-400 font-bold text-[10px] uppercase rounded hover:bg-stone-800 flex items-center gap-1 shrink-0"
                            >
                              BscScan ↗
                            </a>
                          </div>
                        </div>
                      )}

                      <div className="mt-1 flex items-center gap-2">
                        {selectedPromotion.paymentProofImage ? (
                          <span className="text-xs bg-emerald-100 border border-emerald-200 text-emerald-800 font-black px-1.5 py-0.5 rounded">
                            Proof Image Attached 📎  
                          </span>
                        ) : selectedPromotion.paymentMethod === 'Cryptocurrency' ? (
                          <span className="text-xs bg-blue-100 border border-blue-200 text-blue-800 font-black px-1.5 py-0.5 rounded">
                            Crypto TXID Verification Only ⚡
                          </span>
                        ) : (
                          <span className="text-xs bg-rose-100 border border-rose-200 text-rose-800 font-black px-1.5 py-0.5 rounded">
                            No Image Link ⚠️
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Approval / Rejection Result status */}
                  <div className="relative">
                    {/* Circle icon color based on status */}
                    <span className={`absolute -left-[29px] top-0.5 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center shadow-xs text-[7px] ${
                      selectedPromotion.status === 'APPROVED' 
                        ? 'bg-emerald-600 text-white' 
                        : selectedPromotion.status === 'REJECTED' || selectedPromotion.status === 'REVOKED'
                          ? 'bg-rose-600 text-white' 
                          : 'bg-stone-300 text-stone-800 animate-pulse'
                    }`}>
                      {selectedPromotion.status === 'APPROVED' ? '✓' : selectedPromotion.status === 'REJECTED' || selectedPromotion.status === 'REVOKED' ? '✕' : '⏳'}
                    </span>
                    <div>
                      <h4 className={`text-xs font-black uppercase ${
                        selectedPromotion.status === 'APPROVED' 
                          ? 'text-emerald-700' 
                          : selectedPromotion.status === 'REJECTED' || selectedPromotion.status === 'REVOKED' 
                            ? 'text-rose-700' 
                            : 'text-stone-700'
                      }`}>
                        Action Decision: {selectedPromotion.status}
                      </h4>
                      
                      {selectedPromotion.status === 'APPROVED' && (
                        <p className="text-xs text-emerald-600 font-mono font-medium">
                          Acceptance Timestamp: {formatAdminDate(selectedPromotion.approvedAt || selectedPromotion.updatedAt)}
                        </p>
                      )}

                      {(selectedPromotion.status === 'REJECTED' || selectedPromotion.status === 'REVOKED') && (
                        <p className="text-xs text-rose-600 font-mono font-semibold">
                          Rejection / Revocation Timestamp: {formatAdminDate(selectedPromotion.rejectedAt || selectedPromotion.updatedAt)}
                        </p>
                      )}

                      {selectedPromotion.status === 'PENDING' && (
                        <p className="text-xs text-amber-600 font-mono font-medium">
                          Awaiting Operator Evaluation. Action Buttons Below.
                        </p>
                      )}

                      {selectedPromotion.rejectionReason && (
                        <div className="mt-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold leading-relaxed">
                          <span className="block text-xs font-black uppercase text-red-650 tracking-widest mb-1">
                            ❌ Application Rejection Feedback:
                          </span>
                          <p>"{selectedPromotion.rejectionReason}"</p>
                        </div>
                      )}

                      {selectedPromotion.paymentDenialReason && (
                        <div className="mt-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold leading-relaxed select-all">
                          <span className="block text-xs font-black uppercase text-red-650 tracking-widest mb-1">
                            ⚠️ Comments by Payment Verifier:
                          </span>
                          <p>"{selectedPromotion.paymentDenialReason}"</p>
                        </div>
                      )}

                      {selectedPromotion.verifierRejectReason && (
                        <div className="mt-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold leading-relaxed">
                          <span className="block text-xs font-black uppercase text-red-650 tracking-widest mb-1">
                            ⚠️ Refund Reject Comment (Verifier):
                          </span>
                          <p>"{selectedPromotion.verifierRejectReason}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Attachment / TXID Proof */}
              <div className="space-y-2">
                <div className="text-xs font-black text-stone-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Payment Proof Evidence</span>
                  <span className="text-[10px] text-amber-700 font-extrabold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {selectedPromotion.paymentMethod || "Easypaisa"}
                  </span>
                </div>
                {selectedPromotion.paymentProofImage ? (
                  <div className="rounded-2xl border-2 border-stone-100 overflow-hidden shadow-md">
                    <img
                       src={selectedPromotion.paymentProofImage}
                       className="w-full h-auto max-h-[400px] object-cover hover:opacity-90 transition-opacity cursor-pointer bg-stone-200"
                       referrerPolicy="no-referrer"
                       onClick={() =>
                         setActiveKycLightbox({
                           src: selectedPromotion.paymentProofImage,
                           title: "Payment Proof Evidence"
                         })
                       }
                    />
                    <div className="p-3 bg-stone-50 text-xs font-bold text-stone-400 text-center uppercase tracking-widest border-t border-stone-100">
                      Tap image to view full size
                    </div>
                  </div>
                ) : selectedPromotion.txHash ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-2 font-sans">
                    <div className="text-2xl">⚡</div>
                    <div className="text-xs font-black text-amber-900 uppercase">Cryptocurrency Blockchain Verification</div>
                    <p className="text-xs text-stone-600 font-mono break-all select-all font-extrabold bg-white p-2 rounded border border-amber-200">
                      TXID: {selectedPromotion.txHash}
                    </p>
                    <a
                      href={`https://bscscan.com/tx/${selectedPromotion.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-4 py-2 bg-stone-900 text-amber-400 font-black text-xs uppercase tracking-wider rounded-xl hover:bg-stone-800 transition-all shadow-sm"
                    >
                      Verify Transaction on BscScan ↗
                    </a>
                  </div>
                ) : (
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl text-center text-xs text-stone-400 italic">
                    No image screenshot provided.
                  </div>
                )}
              </div>

              {selectedPromotion.refundRequested && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl text-xs text-orange-950 font-sans space-y-1 animate-in slide-in-from-top-2 duration-300">
                  <span className="font-black uppercase tracking-widest block text-orange-700">
                    💸 REFUND REQUEST SUBMITTED
                  </span>
                  <div className="font-bold space-y-1">
                    <p>User submitted a refund claim for rejected badge "{selectedPromotion.planName}".</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-sans text-xs">
                      <div className="p-2 bg-white rounded-lg border border-orange-200/80"><span className="block text-[10px] text-stone-400 uppercase font-black">Application Amount</span><span className="font-bold text-stone-800">{formatPrice(selectedPromotion.amount, selectedPromotion.currency)}</span></div>
                      <div className="p-2 bg-white rounded-lg border border-orange-200/80"><span className="block text-[10px] text-stone-400 uppercase font-black">Received Amount</span><span className="font-bold text-indigo-800">{formatPrice(selectedPromotion.receivedAmount, selectedPromotion.currency)}</span></div>
                      <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200"><span className="block text-[10px] text-emerald-600 uppercase font-black">95% Refund Amount</span><span className="font-extrabold text-emerald-800">{formatPrice(selectedPromotion.refundCalculatedAmount || calculateRefundAmounts(selectedPromotion.receivedAmount).refundAmount, selectedPromotion.currency)}</span></div>
                      <div className="p-2 bg-amber-50 rounded-lg border border-amber-200"><span className="block text-[10px] text-amber-600 uppercase font-black">5% Retention</span><span className="font-bold text-amber-800">{formatPrice(selectedPromotion.refundRetentionAmount || calculateRefundAmounts(selectedPromotion.receivedAmount).retentionAmount, selectedPromotion.currency)}</span></div>
                    </div>
                  </div>
                  <p className="text-xs text-orange-850 font-semibold italic">
                    * Arrangements: Refund is scheduled to be completed within 7 days from the request date.
                  </p>
                </div>
              )}

              {/* Summary Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-amber-50 flex flex-col justify-center">
                  <div className="text-xs font-black text-amber-600/60 uppercase tracking-widest mb-1 font-sans">
                    Badge Duration
                  </div>
                  <div className="text-xl font-black text-amber-950 font-sans">
                    {selectedPromotion.durationDays || 30} Days
                  </div>
                  <span className="text-[8.5px] font-bold text-amber-600/80 uppercase tracking-wider block mt-0.5">
                    Fixed application period
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50 flex flex-col justify-center">
                  <div className="text-xs font-black text-emerald-600/60 uppercase tracking-widest mb-1 font-sans">
                    Application Amount
                  </div>
                  <div className="text-xl font-black text-emerald-700">
                    Rs. {selectedPromotion.amount ? selectedPromotion.amount.toLocaleString() : "0"}
                  </div>
                  <span className="text-[8.5px] font-bold text-emerald-600/80 uppercase tracking-wider block mt-0.5">
                    Selected plan price
                  </span>
                </div>
                <div className={`p-4 rounded-xl flex flex-col justify-center ${selectedPromotion.receivedAmount !== undefined && selectedPromotion.receivedAmount !== null ? 'bg-indigo-50 border border-indigo-100' : 'bg-stone-50 border border-stone-200'}`}>
                  <div className="text-xs font-black text-indigo-600/70 uppercase tracking-widest mb-1 font-sans">
                    Authoritative Received Amount
                  </div>
                  <div className="text-xl font-black text-indigo-950 font-sans">
                    {selectedPromotion.receivedAmount !== undefined && selectedPromotion.receivedAmount !== null ? (
                      `Rs. ${selectedPromotion.receivedAmount.toLocaleString()}`
                    ) : (
                      <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">
                        {selectedPromotion.verificationStage === "SENT_TO_VERIFIERS" ? "Pending Verifier Entry ⏳" : "Not Recorded"}
                      </span>
                    )}
                  </div>
                  <span className="text-[8.5px] font-bold text-stone-500 uppercase tracking-wider block mt-0.5">
                    {selectedPromotion.paymentVerifiedBy ? `Verified by ${selectedPromotion.paymentVerifiedBy}` : "Authoritative Verifier Confirmation"}
                  </span>
                </div>
              </div>

              {/* Audit Trail Timeline and Revisions */}
              <div className="p-4 bg-stone-50 border border-stone-200/60 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-stone-400" />
                    <span className="font-extrabold text-[10.5px] uppercase text-stone-700 tracking-wider font-sans">
                      Official Application Audit History Timeline
                    </span>
                  </div>
                  <span className="text-xs font-black uppercase text-stone-400 font-mono">
                    System Ledger
                  </span>
                </div>

                <div className="relative pl-4 space-y-4 border-l border-stone-300 font-sans">
                  {(() => {
                    const events: { label: string; date: any; color: string; desc?: string }[] = [];
                    const p = selectedPromotion;

                    events.push({
                      label: "Initial Request Submitted",
                      date: p.createdAt,
                      color: "bg-emerald-500 border-emerald-200",
                      desc: "User submitted badge request with payment proof."
                    });

                    if (p.revisions && p.revisions.length > 0) {
                      p.revisions.forEach((rev: any, idx: number) => {
                        events.push({
                          label: `Self-Correction Revision (v${idx + 2})`,
                          date: rev.editedAt,
                          color: "bg-blue-500 border-blue-200",
                          desc: `Applicant updated information. Shop: "${rev.newShopName || p.targetUserShopName || 'N/A'}"`
                        });
                      });
                    }

                    if (p.paymentVerifiedAt || p.verificationStage === 'PAYMENT_VERIFIED') {
                      events.push({
                        label: "Payment Verified by Verifier",
                        date: p.paymentVerifiedAt || p.updatedAt,
                        color: "bg-indigo-600 border-indigo-200",
                        desc: `Authoritative payment confirmed by ${p.paymentVerifiedBy || 'Payment Verifier'}. Application Amount: Rs. ${p.amount ? p.amount.toLocaleString() : '0'}, Authoritative Received Amount: Rs. ${p.receivedAmount !== undefined && p.receivedAmount !== null ? p.receivedAmount.toLocaleString() : (p.amount ? p.amount.toLocaleString() : '0')}`
                      });
                    }

                    if (p.approvedAt) {
                      events.push({
                        label: "Badge Granted & Activated",
                        date: p.approvedAt,
                        color: "bg-emerald-600 border-emerald-300",
                        desc: `Approved duration: ${p.approvedDays || p.durationDays || 30} days.`
                      });
                    }

                    if (p.rejectedAt) {
                      events.push({
                        label: "Evaluation Rejected",
                        date: p.rejectedAt,
                        color: "bg-rose-500 border-rose-200",
                        desc: p.rejectionReason ? `Reason: "${p.rejectionReason}"` : "Payment confirmation failed."
                      });
                    }

                    if (p.revokedAt || (p.status === 'REVOKED' && p.updatedAt)) {
                      events.push({
                        label: "Badge Suspended / Revoked",
                        date: p.revokedAt || p.updatedAt,
                        color: "bg-rose-600 border-rose-300",
                        desc: p.revocationReason ? `Reason: "${p.revocationReason}"` : "Administratively suspended."
                      });
                    }

                    if (p.resumedAt) {
                      events.push({
                        label: "Badge Resumed & Active",
                        date: p.resumedAt,
                        color: "bg-teal-500 border-teal-200",
                        desc: "Re-granted & resumed under manual appraisal check."
                      });
                    }

                    if (p.refundRequestedAt || p.refundRequested) {
                      events.push({
                        label: "Refund Requested by Applicant",
                        date: p.refundRequestedAt || p.createdAt,
                        color: "bg-amber-600 border-amber-200",
                        desc: "Refund payment requested following application refusal."
                      });
                    }

                    if (p.refundStatus === "REFUNDED") {
                      events.push({
                        label: "Refund Disbursed",
                        date: p.updatedAt,
                        color: "bg-emerald-700 border-emerald-300",
                        desc: "Administrative disbursement processed. Copy verification receipt attached."
                      });
                    }

                    // Sort events
                    events.sort((a, b) => {
                      const timeA = a.date?.seconds ? a.date.seconds * 1000 : new Date(a.date).getTime();
                      const timeB = b.date?.seconds ? b.date.seconds * 1000 : new Date(b.date).getTime();
                      return timeA - timeB;
                    });

                    return events.map((ev, i) => (
                      <div key={i} className="relative text-xs">
                        <span className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${ev.color}`} />
                        <div>
                          <div className="font-extrabold text-stone-900 leading-tight flex items-center gap-1.5">
                            {ev.label}
                          </div>
                          <span className="text-stone-400 text-[9.5px] font-mono tracking-tight block">
                            {formatAdminDate(ev.date)}
                          </span>
                          {ev.desc && (
                            <p className="text-stone-600 text-[10.5px] leading-normal font-medium bg-white/70 border border-stone-150 rounded px-2 py-0.5 mt-1">
                              {ev.desc}
                            </p>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                {/* Revisions Logs with Original Docs and payments */}
                {selectedPromotion.revisions && selectedPromotion.revisions.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-stone-200/60 font-sans">
                    <div className="flex items-center gap-1 mb-2.5">
                      <History className="w-3.5 h-3.5 text-stone-400" />
                      <span className="font-bold text-xs uppercase text-stone-400 tracking-wider">
                        Applicant Resubmission & Changelog
                      </span>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {selectedPromotion.revisions.map((rev: any, idx: number) => (
                        <div key={idx} className="p-2.5 bg-white border border-stone-200 rounded-xl space-y-2 text-xs">
                          <div className="flex items-center justify-between border-b border-dashed border-stone-100 pb-1.5">
                            <span className="font-extrabold text-stone-700">Changelog Version {idx + 1}</span>
                            <span className="font-mono text-xs text-stone-400">{formatAdminDate(rev.editedAt)}</span>
                          </div>

                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-stone-600 leading-normal font-medium">
                            {rev.oldShopName !== rev.newShopName && (
                              <div className="col-span-2">
                                <span className="font-bold text-stone-400 font-sans text-xs">Shop Name:</span>{" "}
                                <span className="line-through text-red-500 font-bold">{rev.oldShopName || 'N/A'}</span>{" "}
                                <span className="text-[14px] text-stone-300">→</span>{" "}
                                <span className="text-emerald-600 font-black">{rev.newShopName || 'N/A'}</span>
                              </div>
                            )}

                            {rev.oldPeriod !== rev.newPeriod && (
                              <div>
                                <span className="font-bold text-stone-450 font-sans text-xs">Duration:</span>{" "}
                                <span className="line-through text-stone-400">{rev.oldPeriod || 'N/A'}</span>{" "}
                                <span className="text-stone-900 font-bold">{rev.newPeriod || 'N/A'}</span>
                              </div>
                            )}

                            {rev.oldTargetListingID !== rev.newTargetListingID && (
                              <div className="col-span-2">
                                <span className="font-bold text-stone-450 font-sans text-xs">Selected Listing:</span>{" "}
                                <span className="line-through text-stone-400 block truncate">{rev.oldTargetListingID || 'None'}</span>{" "}
                                <span className="text-stone-950 block font-bold truncate">{rev.newTargetListingID || 'None'}</span>
                              </div>
                            )}

                            {rev.oldAmount !== rev.newAmount && (
                              <div>
                                <span className="font-bold text-stone-450 font-sans text-xs">Paid Amount:</span>{" "}
                                <span className="line-through text-stone-400">Rs. {rev.oldAmount || '0'}</span>{" "}
                                <span className="text-emerald-600 font-black">Rs. {rev.newAmount || '0'}</span>
                              </div>
                            )}
                          </div>

                          {rev.oldPaymentImage !== rev.newPaymentImage && (
                            <div className="pt-2 border-t border-stone-50 space-y-1">
                              <span className="font-black text-[8.5px] uppercase text-stone-400 block tracking-widest">
                                📷 Historic Payment Evidence Changes:
                              </span>
                              <div className="flex gap-2 items-center">
                                {rev.oldPaymentImage && (
                                  <div className="flex-1 p-1 bg-stone-50 border border-stone-200 rounded-lg text-center">
                                    <span className="text-xs uppercase tracking-wider block font-bold text-stone-400 mb-1">Previous</span>
                                    <img 
                                      src={rev.oldPaymentImage} 
                                      alt="Previous evidence file" 
                                      className="max-h-12 mx-auto object-cover rounded cursor-pointer hover:scale-105 transition-transform"
                                      referrerPolicy="no-referrer"
                                      onClick={() => setActiveKycLightbox({ src: rev.oldPaymentImage, title: "Previous Payment Evidence" })}
                                    />
                                    <span className="text-[7.5px] text-stone-400 block mt-1 hover:underline">Click to view</span>
                                  </div>
                                )}
                                {rev.newPaymentImage && (
                                  <div className="flex-1 p-1 bg-blue-50 border border-blue-100 rounded-lg text-center">
                                    <span className="text-xs uppercase tracking-wider block font-bold text-blue-500 mb-1">Incoming / Revised</span>
                                    <img 
                                      src={rev.newPaymentImage} 
                                      alt="Incoming evidence file" 
                                      className="max-h-12 mx-auto object-cover rounded cursor-pointer hover:scale-105 transition-transform"
                                      referrerPolicy="no-referrer"
                                      onClick={() => setActiveKycLightbox({ src: rev.newPaymentImage, title: "Incoming / Revised Payment Evidence" })}
                                    />
                                    <span className="text-[7.5px] text-blue-500 block mt-1 hover:underline">Click to view</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Administrative Reason Input & Rejection Classification */}
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100 space-y-3">
                {selectedPromotion.status === "PENDING" && (
                  <div className="space-y-1">
                    <label className="block text-xs font-black text-stone-500 uppercase tracking-widest font-sans">
                      Rejection Classification (If Actioning Rejection)
                    </label>
                    <select
                      value={adminRejectionCategory}
                      onChange={(e) => setAdminRejectionCategory(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs font-bold text-stone-800 bg-white border border-stone-200 rounded-xl outline-none focus:border-indigo-500 transition-colors font-sans"
                    >
                      <option value="POLICY_VIOLATION">Policy Violation (Refund Eligible if verified payment &gt; 0)</option>
                      <option value="FRAUD">Fraudulent Payment / False Evidence (Strictly Non-Refundable)</option>
                      <option value="NON_PAYMENT">Non-Payment / Verification Failure (Strictly Non-Refundable)</option>
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="block text-xs font-black text-stone-400 uppercase tracking-widest font-sans">
                    Action Feedback / Administrative Notes
                  </label>
                  <textarea
                    value={adminPromoReason}
                    onChange={(e) => setAdminPromoReason(e.target.value)}
                    placeholder="Provide detailed feedback for rejection or revocation actions..."
                    className="w-full px-4 py-3 text-xs font-semibold text-stone-800 bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors shadow-inner font-sans resize-none h-20"
                  />
                  <p className="text-xs text-stone-400 font-bold italic leading-tight font-sans">
                    * Note: Entered explanation is dispatched inside live alerts &amp; notifications to the applicant.
                  </p>
                </div>
              </div>

              {/* Refund Section for REJECTED requests (only visible on rejected queries) */}
              {selectedPromotion.status === "REJECTED" && (
                <div className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-200 space-y-3 animate-in slide-in-from-top-2 duration-300 border-dashed">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber-700" />
                    <span className="font-extrabold text-xs uppercase text-amber-900 tracking-wider font-sans">
                      Refund Transaction Actions
                    </span>
                  </div>

                  {selectedPromotion.refundRequested && (
                    <div className="bg-white p-3.5 rounded-xl border border-amber-200 text-xs font-sans space-y-2">
                      <p className="font-bold text-amber-800 uppercase tracking-widest text-xs border-b border-amber-100 pb-1">Authoritative Refund Breakdown & Payout Account:</p>
                      <div className="grid grid-cols-2 gap-2 bg-stone-50 p-2.5 rounded-lg text-xs">
                        <div><span className="text-stone-400 text-[10px] uppercase font-bold block">Application Amount:</span><span className="font-bold text-stone-800">{formatPrice(selectedPromotion.amount, selectedPromotion.currency)}</span></div>
                        <div><span className="text-stone-400 text-[10px] uppercase font-bold block">Authoritative Received:</span><span className="font-bold text-indigo-800">{formatPrice(selectedPromotion.receivedAmount, selectedPromotion.currency)}</span></div>
                        <div><span className="text-emerald-600 text-[10px] uppercase font-black block">95% Refund Principal:</span><span className="font-black text-emerald-700 text-sm">{formatPrice(selectedPromotion.refundCalculatedAmount || calculateRefundAmounts(selectedPromotion.receivedAmount).refundAmount, selectedPromotion.currency)}</span></div>
                        <div><span className="text-amber-600 text-[10px] uppercase font-black block">Platform Retention (5%):</span><span className="font-bold text-amber-800">{formatPrice(selectedPromotion.refundRetentionAmount || calculateRefundAmounts(selectedPromotion.receivedAmount).retentionAmount, selectedPromotion.currency)}</span></div>
                      </div>
                      <div className="pt-1 space-y-0.5">
                        <p><span className="font-semibold text-stone-400">Account Title:</span> <span className="font-bold text-stone-900">{selectedPromotion.refundName || 'N/A'}</span></p>
                        <p><span className="font-semibold text-stone-400">Bank / Wallet:</span> <span className="font-bold text-stone-900">{selectedPromotion.refundBankName || 'N/A'}</span></p>
                        <p><span className="font-semibold text-stone-400">Account # / IBAN:</span> <span className="font-bold text-stone-900">{selectedPromotion.refundAccountNumber || 'N/A'}</span></p>
                      </div>
                    </div>
                  )}

                  {selectedPromotion.refundStatus === "REFUNDED" && (
                    <div className="space-y-3 font-sans text-xs">
                      {selectedPromotion.refundProofImage && (
                        <div className="space-y-1">
                          <span className="text-xs font-black uppercase text-stone-400 block tracking-widest font-mono">
                            VERIFIED REFUND RECEIPT COPY:
                          </span>
                          <div className="rounded-xl border border-stone-200 overflow-hidden inline-block bg-white shadow-sm max-w-[240px]">
                            <img
                              src={selectedPromotion.refundProofImage}
                              alt="Refund proof"
                              className="max-h-28 object-contain cursor-zoom-in"
                              onClick={() => setActiveKycLightbox({ src: selectedPromotion.refundProofImage, title: "Verified Refund Receipt Copy" })}
                            />
                          </div>
                        </div>
                      )}
                      
                      <button
                        type="button"
                        disabled
                        className="w-full py-3 bg-emerald-600 text-white font-black uppercase text-xs tracking-widest rounded-xl shadow-md flex items-center justify-center gap-1.5 font-sans opacity-100 cursor-not-allowed"
                      >
                        Refund Completed
                      </button>
                    </div>
                  )}

                  {selectedPromotion.refundRequested && selectedPromotion.refundStatus === "VERIFIER_APPROVED" && (
                    <div className="space-y-3 font-sans text-xs">
                      {selectedPromotion.refundProofImage && (
                        <div className="space-y-1">
                          <span className="text-xs font-black uppercase text-stone-400 block tracking-widest font-mono">
                            VERIFIED REFUND RECEIPT COPY:
                          </span>
                          <div className="rounded-xl border border-stone-200 overflow-hidden inline-block bg-white shadow-sm max-w-[240px]">
                            <img
                              src={selectedPromotion.refundProofImage}
                              alt="Refund proof"
                              className="max-h-28 object-contain cursor-zoom-in"
                              onClick={() => setActiveKycLightbox({ src: selectedPromotion.refundProofImage, title: "Verified Refund Receipt Copy" })}
                            />
                          </div>
                        </div>
                      )}
                      
                      <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-800 font-bold text-xs border border-emerald-200">
                        ✅ Refunded & Approved By Verifier: {selectedPromotion.refundedBy || 'Payment Verifier'}
                      </div>
                      
                      <p className="text-xs text-stone-600 font-medium leading-relaxed font-sans">
                        Payment Verifier has processed the refund and uploaded payment proof. Please confirm and intimate the applicant to complete this transaction.
                      </p>

                      <button
                        type="button"
                        disabled={isRefunding}
                        onClick={() => handleAdminFinalizeRefund(selectedPromotion)}
                        className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-xs tracking-widest rounded-xl shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all text-center cursor-pointer"
                      >
                        {isRefunding ? "Processing..." : "Confirm & Intimate Applicant"}
                      </button>
                    </div>
                  )}

                  {selectedPromotion.refundRequested && selectedPromotion.refundStatus === "VERIFIER_REJECTED" && (
                    <div className="space-y-3 font-sans text-xs animate-in slide-in-from-top-2 duration-200">
                      <div className="p-2.5 bg-red-50 rounded-lg text-red-850 font-bold text-xs uppercase border border-red-200">
                        ⚠️ Denied By Payment Verifier
                      </div>
                      <p className="font-bold text-red-900 leading-tight">Reason given: "{selectedPromotion.verifierRejectReason || 'No reason specified'}"</p>
                      <p className="text-xs text-stone-600 leading-relaxed font-sans">
                        The Payment Verifier assessed this claim as invalid. As an Admin, you can either override and finalize/complete the refund, or permanently close the refund claim.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isRefunding}
                          onClick={() => handleAdminFinalizeRefund(selectedPromotion)}
                          className="flex-grow py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs tracking-widest rounded-xl transition-all shadow-md active:scale-95 text-center font-bold font-sans"
                        >
                          {isRefunding ? "Processing..." : "Force Mark as Refunded"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm("Are you sure you want to cancel and close this refund request?")) return;
                            try {
                              const collName = selectedPromotion.isVerificationAppCollection ? "verification_applications" : "promotionRequests";
                              await updateDoc(doc(db, collName, selectedPromotion.id), {
                                refundRequested: false,
                                refundStatus: "REJECTED_FINAL",
                                updatedAt: serverTimestamp(),
                              });
                              alert("Refund request closed.");
                              setSelectedPromotion(null);
                              fetchData();
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          className="flex-grow py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-250 font-black uppercase text-xs tracking-widest rounded-xl transition-all font-bold font-sans"
                        >
                          Close & Deny Request
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedPromotion.refundRequested && (selectedPromotion.refundStatus === "REJECTED" || selectedPromotion.refundStatus === "REJECTED_FINAL") && (
                    <div className="space-y-2 font-sans text-xs animate-in slide-in-from-top-2 duration-200">
                      <div className="p-2.5 bg-red-50 rounded-lg text-red-850 font-bold text-xs uppercase border border-red-200">
                        ❌ Refund Request Rejected by Admin
                      </div>
                      <p className="font-bold text-red-900 leading-tight">Reason given: "{selectedPromotion.verifierRejectReason || 'No reason specified'}"</p>
                      <p className="text-xs text-stone-600 leading-relaxed font-sans">
                        This refund claim was rejected by an administrator. The applicant has the right to re-submit a refund claim with updated or corrected information.
                      </p>
                    </div>
                  )}

                  {selectedPromotion.refundRequested && selectedPromotion.refundStatus === "SENT_TO_VERIFIERS" && (
                    <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 text-center space-y-2">
                      <Clock className="w-5 h-5 text-amber-700 mx-auto animate-spin" />
                      <p className="text-xs font-black uppercase text-amber-900 tracking-wider font-sans">
                        Sent to Payment Verifiers
                      </p>
                      <p className="text-xs text-stone-600 leading-relaxed font-sans">
                        This refund claim has been forwarded to the Payment Verifiers to trace and process payment. Once settled, the verifier will send it back for Admin action.
                      </p>
                    </div>
                  )}

                  {selectedPromotion.refundRequested && (!selectedPromotion.refundStatus || selectedPromotion.refundStatus === "PENDING") && (
                    <div className="space-y-2 animate-in fade-in-50 duration-200">
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-850 font-bold text-xs uppercase">
                        📥 Pending Refund Claim Received
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed font-sans">
                        A refund claim has been submitted by the applicant. Under our compliance guidelines, <strong className="text-indigo-900">every refund application must be verified by our authorized Payment Verifiers</strong>. Please select a compliance action from the footer panel to proceed.
                      </p>
                    </div>
                  )}

                  {!selectedPromotion.refundRequested && (
                    <div className="w-full py-3 bg-stone-100 text-stone-400 font-bold uppercase text-xs tracking-widest rounded-xl flex items-center justify-center gap-1.5 font-sans border border-stone-200">
                      Refund not yet requested by user
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-stone-50 border-t border-stone-100 pb-4">
              {/* Action Buttons */}
              <div className="p-4 md:p-6 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-xs font-bold text-stone-400 uppercase tracking-widest flex flex-col gap-1.5">
                  <div className="flex items-center">
                    Status:
                    <span
                      className={`ml-2 px-2 py-1 rounded bg-white border ${
                        selectedPromotion.status === "APPROVED"
                          ? "text-emerald-500 border-emerald-200"
                          : selectedPromotion.status === "REVOKED"
                            ? "text-rose-500 border-rose-200"
                            : selectedPromotion.status === "RESUME_REQUESTED"
                              ? "text-orange-600 border-orange-200 animate-pulse font-black"
                              : selectedPromotion.status === "REJECTED"
                                ? "text-red-500 border-red-200"
                                : "text-amber-500 border-amber-200"
                      }`}
                    >
                      {selectedPromotion.status === "RESUME_REQUESTED"
                        ? "APPEALED"
                        : selectedPromotion.status}
                    </span>
                  </div>
                  {selectedPromotion.verificationStage === "VERIFIER_DENIED" && selectedPromotion.paymentDenialReason && (
                    <div className="mt-1.5 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold leading-normal break-words max-w-xs">
                      <span className="block text-xs font-black uppercase text-red-500 tracking-wider mb-0.5">
                        ⚠️ Verifier Denial Comment:
                      </span>
                      <p>"{selectedPromotion.paymentDenialReason}"</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end font-sans">
                  {selectedPromotion.refundRequested ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmAction({
                            message: "Are you sure you want to permanently delete this application from the platform? This action is IRREVERSIBLE and cannot be undone.",
                            onConfirm: () => adminRemoveRefundStatus(selectedPromotion, true),
                          });
                        }}
                        className="flex-1 md:flex-none px-4 sm:px-5 py-2.5 sm:py-3 bg-stone-900 border border-stone-800 hover:bg-black text-white font-black uppercase text-xs sm:text-xs tracking-widest rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer text-center font-sans"
                        title="Permanently remove this application data"
                      >
                        Remove Status
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setConfirmAction({
                            message: "Are you sure you want to forward this refund claim to the specialized Payment Verifiers for tracing and verification?",
                            onConfirm: () => sendRefundToVerifiers(selectedPromotion, true),
                          });
                        }}
                        className="flex-1 md:flex-none px-4 sm:px-5 py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs sm:text-xs tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95 cursor-pointer text-center font-sans whitespace-nowrap"
                        title="Forward to Payment Verifiers"
                      >
                        Send to Verifiers
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setConfirmAction({
                            message: "Are you sure you want to REJECT this refund request as invalid? This will notify the applicant.",
                            onConfirm: () => adminRejectRefund(selectedPromotion, true),
                          });
                        }}
                        className="flex-1 md:flex-none px-4 sm:px-5 py-2.5 sm:py-3 bg-white hover:bg-rose-50 text-rose-600 font-black uppercase text-xs sm:text-xs tracking-widest rounded-xl transition-all shadow-md active:scale-95 border-2 border-rose-100 hover:border-rose-200 cursor-pointer text-center font-sans"
                        title="Reject invalid refund request"
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <>
                      {selectedPromotion.verificationStage === "SENT_TO_VERIFIERS" ? (
                        <button
                          disabled
                          className="flex-1 md:flex-none px-5 py-3 bg-stone-300 text-stone-400 rounded-xl text-xs font-black uppercase tracking-widest cursor-not-allowed font-sans opacity-60"
                          title="This application has been sent to Payment Verifiers. You can't delete it until their decision."
                        >
                          Remove Status (Locked)
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setConfirmAction({
                              message: "Are you sure you want to permanently DELETE this badge application from the database? This action is fatal and cannot be reversed.",
                              onConfirm: () => deletePromotionRequest(selectedPromotion),
                            });
                          }}
                          className="flex-1 md:flex-none px-5 py-3 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all text-center shadow-lg active:scale-95 font-sans border border-stone-800"
                        >
                          Remove Status
                        </button>
                      )}

                      {selectedPromotion.status === "PENDING" && (
                        <>
                          {(!selectedPromotion.verificationStage || selectedPromotion.verificationStage === "NONE") ? (
                            <button
                              disabled
                              className="flex-1 md:flex-none px-5 py-3 bg-stone-100 text-stone-400 border border-stone-200 rounded-xl text-xs font-black uppercase tracking-widest cursor-not-allowed font-sans opacity-60"
                              title="Forward to Payment Verifiers first."
                            >
                              Reject (Forward First)
                            </button>
                          ) : selectedPromotion.verificationStage === "SENT_TO_VERIFIERS" ? (
                            <button
                              disabled
                              className="flex-1 md:flex-none px-5 py-3 bg-stone-100 text-stone-400 border border-stone-200 rounded-xl text-xs font-black uppercase tracking-widest cursor-not-allowed font-sans opacity-60"
                              title="Locked: Pending Verifier Decision"
                            >
                              Reject (Locked)
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setConfirmAction({
                                  message: `Are you sure you want to REJECT this badge application and inform the applicant?`,
                                  onConfirm: () => rejectPromotion(selectedPromotion, adminRejectionCategory),
                                });
                              }}
                              className="flex-1 md:flex-none px-5 py-3 bg-white text-rose-600 hover:bg-rose-50 border-2 border-rose-100 hover:border-rose-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-center select-none active:scale-95 font-sans shadow-sm"
                            >
                              Reject
                            </button>
                          )}

                          {(!selectedPromotion.verificationStage || selectedPromotion.verificationStage === "NONE") ? (
                            <button
                              onClick={() => {
                                setConfirmAction({
                                  message: `Are you sure you want to send this badge application to Payment Verifiers to check the payment transaction authenticity?`,
                                  onConfirm: () => sendPromotionToVerifiers(selectedPromotion),
                                });
                              }}
                              className="flex-1 md:flex-none px-5 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 text-center select-none active:scale-95 font-sans"
                            >
                              Send to Verifiers
                            </button>
                          ) : selectedPromotion.verificationStage === "SENT_TO_VERIFIERS" ? (
                            <button
                              disabled
                              className="flex-1 md:flex-none px-5 py-3 bg-amber-500 text-stone-900 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-center select-none opacity-85 cursor-not-allowed font-sans flex items-center gap-1.5 justify-center"
                            >
                              <span>Sent to Verifiers ⏳</span>
                            </button>
                          ) : selectedPromotion.verificationStage === "VERIFIER_DENIED" ? (
                            <button
                              onClick={() => {
                                setConfirmAction({
                                  message: `Are you sure you want to re-send this application to Payment Verifiers for processing?`,
                                  onConfirm: () => sendPromotionToVerifiers(selectedPromotion),
                                });
                              }}
                              className="flex-1 md:flex-none px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/25 text-center select-none active:scale-95 font-sans flex items-center justify-center"
                            >
                              Denied (Resend?)
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setConfirmAction({
                                  message: `Are you sure you want to approve this ${selectedPromotion.type} promotion/badge application?`,
                                  onConfirm: () => approvePromotion(selectedPromotion),
                                });
                              }}
                              className="flex-1 md:flex-none px-5 py-3 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 text-center select-none active:scale-95 font-sans"
                            >
                              Approve
                            </button>
                          )}
                        </>
                      )}
                      {selectedPromotion.status === "APPROVED" && (
                        <button
                          onClick={() => {
                            setConfirmAction({
                              message: `Are you sure you want to revoke this active badge immediately? Reason: ${adminPromoReason}`,
                              onConfirm: () => revokePromotion(selectedPromotion),
                            });
                          }}
                          className="flex-1 md:flex-none px-5 py-3 bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-200 transition-all text-center select-none active:scale-95 font-sans"
                        >
                          Revoke Badge
                        </button>
                      )}
                      {(selectedPromotion.status === "REVOKED" ||
                        selectedPromotion.status === "RESUME_REQUESTED") && (
                        <>
                        {selectedPromotion.status === "RESUME_REQUESTED" && (
                          <button
                            onClick={() => {
                              setConfirmAction({
                                message: `Are you sure you want to REJECT this appeal and keep the badge revoked? Reason: ${adminPromoReason}`,
                                onConfirm: () => rejectPromotion(selectedPromotion),
                              });
                            }}
                            className="flex-1 md:flex-none px-5 py-3 bg-rose-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-500/20 text-center select-none active:scale-95 font-sans"
                          >
                            Reject Appeal
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setConfirmAction({
                              message: "Are you sure you want to resume this promotion? The revoked badge will be reactivated with full user benefits.",
                              onConfirm: () => resumePromotion(selectedPromotion),
                            });
                          }}
                          className="flex-1 md:flex-none px-5 py-3 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 text-center select-none active:scale-95 font-sans"
                        >
                          {selectedPromotion.status === "RESUME_REQUESTED" ? "Approve Appeal" : "Resume Badge"}
                        </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {selectedSupportTicket && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-2 md:p-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setSelectedSupportTicket(null)}
            className="absolute inset-0 bg-stone-950/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative w-[95vw] max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[92vh] border-2 md:border-4 border-stone-100 overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 md:p-8 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
              <div>
                <div className="text-xs font-black text-amber-500 uppercase tracking-widest mb-1">
                  {selectedSupportTicket.category}
                </div>
                <h3 className="text-xl md:text-2xl font-black text-stone-900 italic lowercase">
                  {selectedSupportTicket.subject}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSupportTicket(null)}
                className="p-3 bg-white border border-stone-200 rounded-full hover:bg-stone-100 transition-colors shadow-sm"
              >
                <X className="w-6 h-6 text-stone-600" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-grow overflow-y-auto p-6 md:p-8 space-y-6 md:space-y-8 custom-scrollbar">
              {/* User Info */}
              <div className="flex items-center justify-between p-4 bg-stone-100 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold">
                    {selectedSupportTicket.name?.charAt(0) || "U"}
                  </div>
                  <div>
                    <div className="font-bold text-stone-900 leading-tight">
                      {selectedSupportTicket.name}
                    </div>
                    <div className="text-xs text-stone-400">
                      {selectedSupportTicket.email}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() =>
                    viewTicketSenderProfile(selectedSupportTicket.userId)
                  }
                  className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-xs font-black uppercase tracking-tight hover:bg-stone-50 transition-colors shadow-sm"
                >
                  View Profile
                </button>
              </div>

              {/* Message */}
              <div className="space-y-2">
                <div className="text-xs font-black text-stone-400 uppercase tracking-widest">
                  Original Message
                </div>
                <div className="p-5 md:p-6 bg-amber-50/50 rounded-2xl md:rounded-3xl border border-amber-100/50 text-stone-800 text-sm md:text-base leading-relaxed italic">
                  "{selectedSupportTicket.message}"
                </div>
              </div>

              {/* Attachment */}
              {selectedSupportTicket.attachmentUrl && (
                <div className="space-y-2">
                  <div className="text-xs font-black text-stone-400 uppercase tracking-widest">
                    Attached Visual Evidence
                  </div>
                  <div className="rounded-2xl border-2 border-stone-100 overflow-hidden shadow-md">
                    {selectedSupportTicket.attachmentUrl.startsWith(
                      "data:image/",
                    ) ||
                    selectedSupportTicket.attachmentUrl.startsWith("http") ? (
                      <>
                        <img
                          src={selectedSupportTicket.attachmentUrl}
                          className="w-full h-auto max-h-[300px] object-contain bg-stone-200 cursor-pointer"
                          referrerPolicy="no-referrer"
                          onClick={() =>
                            setActiveKycLightbox({
                              src: selectedSupportTicket.attachmentUrl,
                              title: "Attached Visual Evidence",
                            })
                          }
                        />
                        <div className="p-3 bg-stone-50 text-xs font-bold text-stone-400 text-center uppercase tracking-widest border-t border-stone-100">
                          Tap image to view full size
                        </div>
                      </>
                    ) : (
                      <div className="p-8 text-center bg-stone-50">
                        <a
                          href={selectedSupportTicket.attachmentUrl}
                          download={
                            selectedSupportTicket.attachmentName ||
                            "ticket-attachment"
                          }
                          className="inline-flex items-center gap-2 px-4 py-2 bg-stone-200 text-stone-700 rounded-lg hover:bg-stone-300 font-bold transition-colors"
                        >
                          Download Supported Document
                        </a>
                        <div className="mt-3 text-xs text-stone-400 font-mono">
                          File:{" "}
                          {selectedSupportTicket.attachmentName ||
                            "Document Attached"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Admin Reply History */}
              {selectedSupportTicket.adminReply && (
                <div className="space-y-2">
                  <div className="text-xs font-black text-emerald-500 uppercase tracking-widest">
                    Admin Response
                  </div>
                  <div className="p-5 md:p-6 bg-emerald-50 rounded-2xl md:rounded-3xl border border-emerald-100 text-emerald-900 text-sm md:text-base leading-relaxed font-medium">
                    {selectedSupportTicket.adminReply}
                  </div>
                  <div className="text-xs text-emerald-400 font-bold uppercase tracking-tight pl-2">
                    Replied by {selectedSupportTicket.repliedBy} on{" "}
                    {formatSafeDate(selectedSupportTicket.repliedAt)}
                  </div>
                </div>
              )}

              {/* Reply Input */}
              {selectedSupportTicket.status !== "RESOLVED" && (
                <div className="space-y-3 pt-4">
                  <div className="text-xs font-black text-stone-900 uppercase tracking-widest">
                    Post a Reply
                  </div>
                  <textarea
                    value={adminReply}
                    onChange={(e) => setAdminReply(e.target.value)}
                    placeholder="Type your response here..."
                    className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl text-sm focus:border-amber-400 outline-none transition-all min-h-[120px] shadow-inner"
                  />
                  <button
                    onClick={() => handleAdminReply(selectedSupportTicket.id)}
                    disabled={isReplying || !adminReply.trim()}
                    className="w-full py-4 bg-stone-900 text-white rounded-2xl text-xs font-black uppercase tracking-[0.2em] hover:bg-emerald-600 disabled:bg-stone-300 disabled:cursor-not-allowed transition-all shadow-xl shadow-stone-900/10"
                  >
                    {isReplying
                      ? "Sending Response..."
                      : "Send Administrator Reply"}
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 bg-stone-50 border-t border-stone-100 flex justify-between items-center">
              <div className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                Ticket ID: {selectedSupportTicket.id.substring(0, 12)}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => deleteTicket(selectedSupportTicket.id)}
                  className="px-4 py-2 bg-red-100 text-red-600 rounded-full text-xs font-black uppercase tracking-widest hover:bg-red-200 transition-colors"
                >
                  Delete Ticket
                </button>
                {selectedSupportTicket.status !== "RESOLVED" && (
                  <button
                    onClick={() => solveTicket(selectedSupportTicket.id)}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-full text-xs font-black uppercase tracking-widest hover:bg-stone-900 transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    Ticket Resolved
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {isViewingUser && selectedUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 md:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setIsViewingUser(false)}
            className="absolute inset-0 bg-stone-900/60 backdrop-blur-xl"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="relative w-[94vw] max-w-5xl bg-white rounded-xl md:rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col h-[96vh] md:h-auto md:max-h-[95vh] border-2 md:border-4 border-stone-100"
          >
            {/* User Details - No longer in header container */}
            <div className="p-5 md:p-10 relative z-10">
              <div className="absolute top-0 right-0 w-32 md:w-64 h-32 md:h-64 bg-amber-50 rounded-full blur-3xl -mr-16 md:-mr-32 -mt-16 md:-mt-32 opacity-50" />
              <div className="flex items-center gap-2 md:gap-6 relative z-10 min-w-0 flex-1">
                <div className="w-8 h-8 md:w-20 md:h-20 rounded-lg md:rounded-3xl bg-stone-900 flex-shrink-0 p-0.5 md:p-1 shadow-lg md:shadow-2xl">
                  <div className="w-full h-full rounded-md md:rounded-2xl overflow-hidden flex items-center justify-center bg-stone-800 text-white font-black text-xs md:text-3xl italic uppercase border md:border-2 border-stone-700/50">
                    {selectedUser.photoURL ? (
                      <img
                        src={selectedUser.photoURL}
                        alt=""
                        className="w-full h-full object-cover cursor-zoom-in"
                        onClick={() => setActiveKycLightbox({ src: selectedUser.photoURL, title: `${selectedUser.name || "User"}'s Profile Picture` })}
                      />
                    ) : (
                      selectedUser.name?.charAt(0)
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-col md:flex-row md:items-center gap-0.5 md:gap-3">
                    <h2 className="text-[18px] md:text-3xl font-black text-stone-900 italic uppercase tracking-tighter truncate">
                      {selectedUser.name || "Anonymous user"}
                    </h2>
                    <div className="flex flex-wrap gap-1 flex-shrink-0">
                      {selectedUser.isBlocked && (
                        <div className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs md:text-xs font-black uppercase tracking-widest border border-red-600 bg-red-600 text-white animate-pulse">
                          <ShieldAlert className="w-3.5 h-3.5 md:w-3.5 md:h-3.5" />
                          LIMITED
                        </div>
                      )}
                      {selectedUser.isVerified && (
                        <div
                          className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs md:text-xs font-black uppercase tracking-widest border border-current bg-white ${selectedUser.verifiedBadgeType === "GOLDEN" ? "text-amber-500" : "text-emerald-500"}`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 md:w-3.5 md:h-3.5" />
                          {selectedUser.verifiedBadgeType === "GOLDEN"
                            ? "PREMIUM"
                            : "VERIFIED"}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-3 mt-1 md:mt-1.5">
                    <p className="text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest truncate max-w-[120px] md:max-w-none">
                      {selectedUser.email}
                    </p>
                    <div className="w-1 h-1 md:w-1.5 md:h-1.5 bg-stone-200 rounded-full" />
                    <p className="text-xs md:text-xs font-black text-amber-500 uppercase tracking-widest">
                      ID: {selectedUser.id.substring(0, 4)}...
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Close Button */}
            <button
              onClick={() => setIsViewingUser(false)}
              className="absolute top-5 right-5 z-[70] p-4 bg-red-600 text-white rounded-full hover:bg-stone-900 transition-all shadow-[0_0_20px_rgba(220,38,38,0.5)] active:scale-90 group border-4 border-white"
            >
              <X className="w-8 h-8 font-bold" />
            </button>

            {/* Content */}
            <div className="flex-grow overflow-y-auto p-4 md:p-10 custom-scrollbar bg-stone-50/50">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-10">
                <div className="lg:col-span-8 space-y-2 md:space-y-10">
                  {/* Identity Matrix - Swipeable on mobile */}
                  <div className="flex md:grid md:grid-cols-2 gap-3 md:gap-4 overflow-x-auto md:overflow-x-visible pb-2 md:pb-0 scrollbar-none snap-x">
                    <div className="min-w-[130px] md:min-w-0 p-4 md:p-6 bg-white rounded-lg md:rounded-[2rem] border border-stone-100 shadow-sm group hover:border-amber-200 transition-colors snap-center">
                      <div className="flex items-center gap-1.5 md:gap-3 mb-1.5 md:mb-4">
                        <div className="p-1 md:p-2 bg-amber-50 text-amber-500 rounded-md md:rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-colors">
                          <Clock className="w-3.5 md:w-4 h-3.5 md:h-4" />
                        </div>
                        <span className="text-xs font-black text-stone-400 uppercase tracking-widest">
                          Joined
                        </span>
                      </div>
                      <div className="font-black text-stone-900 text-[14px] md:text-xl italic tracking-tighter">
                        {formatSafeDate(selectedUser.createdAt)}
                      </div>
                    </div>

                    <div className="min-w-[130px] md:min-w-0 p-4 md:p-6 bg-white rounded-lg md:rounded-[2rem] border border-stone-100 shadow-sm group hover:border-amber-200 transition-colors snap-center">
                      <div className="flex items-center gap-1.5 md:gap-3 mb-1.5 md:mb-4">
                        <div className="p-1 md:p-2 bg-stone-50 text-stone-400 rounded-md md:rounded-xl group-hover:bg-stone-900 group-hover:text-white transition-colors">
                          <MapPin className="w-3.5 md:w-4 h-3.5 md:h-4" />
                        </div>
                        <span className="text-xs font-black text-stone-400 uppercase tracking-widest">
                          Base
                        </span>
                      </div>
                      <div className="font-black text-stone-900 text-[14px] md:text-xl italic tracking-tighter truncate">
                        {selectedUser.city || "GLOBAL"}
                      </div>
                    </div>

                    <div className="min-w-[130px] md:min-w-0 p-4 md:p-6 bg-white rounded-lg md:rounded-[2rem] border border-stone-100 shadow-sm group hover:border-amber-200 transition-colors snap-center">
                      <div className="flex items-center gap-1.5 md:gap-3 mb-1.5 md:mb-4">
                        <div className="p-1 md:p-2 bg-stone-50 text-stone-400 rounded-md md:rounded-xl group-hover:bg-stone-900 group-hover:text-white transition-colors">
                          <Phone className="w-3.5 md:w-4 h-3.5 md:h-4" />
                        </div>
                        <span className="text-xs font-black text-stone-400 uppercase tracking-widest">
                          Phone
                        </span>
                      </div>
                      <div className="font-black text-stone-900 text-[14px] md:text-xl italic tracking-tighter">
                        {selectedUser.phoneNumber?.substring(0, 11) || "N/A"}
                      </div>
                    </div>

                    <div className="min-w-[130px] md:min-w-0 p-4 md:p-6 bg-white rounded-lg md:rounded-[2rem] border border-stone-100 shadow-sm group hover:border-amber-200 transition-colors snap-center">
                      <div className="flex items-center gap-1.5 md:gap-3 mb-1.5 md:mb-4">
                        <div className="p-1 md:p-2 bg-stone-50 text-stone-400 rounded-md md:rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-colors">
                          <FileBadge className="w-3.5 md:w-4 h-3.5 md:h-4" />
                        </div>
                        <span className="text-xs font-black text-stone-400 uppercase tracking-widest">
                          Tier
                        </span>
                      </div>
                      <div className="font-black text-stone-900 text-[14px] md:text-xl italic tracking-tighter uppercase">
                        {selectedUser.verifiedBadgeType || "BASIC"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Command Console */}
                <div className="lg:col-span-4 space-y-4 md:space-y-6">
                  <div className="p-4 md:p-8 bg-stone-900 rounded-2xl md:rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-stone-900 to-red-500" />
                    <h3 className="font-black uppercase tracking-widest text-xs md:text-xs mb-4 md:mb-6 flex items-center justify-between">
                      Console
                      <ShieldAlert className="w-3 md:w-4 h-3 md:h-4 text-amber-500 animate-pulse" />
                    </h3>

                    <div className="space-y-3">
                      {selectedUser.isBlocked ? (
                        <button
                          onClick={() =>
                            unblockUser(
                              selectedUser.id,
                              selectedUser.name || "User",
                            )
                          }
                          disabled={processingUnblockId === selectedUser.id}
                          className="w-full flex items-center justify-between px-4 py-3 md:px-6 md:py-4 bg-emerald-500 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-emerald-600 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-emerald-500/20 disabled:bg-stone-700 disabled:opacity-50"
                        >
                          <span className="flex items-center gap-2">
                            {processingUnblockId === selectedUser.id ? (
                              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                            {processingUnblockId === selectedUser.id
                              ? "Restoring..."
                              : "Unblock Account"}
                          </span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setShowBlockModal(true)}
                          className="w-full flex items-center justify-between px-4 py-3 md:px-6 md:py-4 bg-red-600 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-red-700 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-red-500/20"
                        >
                          <span className="flex items-center gap-2">
                            <UserX className="w-4 h-4" /> Block Account
                          </span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}

                      {isUserPaused(selectedUser) ? (
                        <button
                          onClick={() =>
                            handleUnpauseUser(
                              selectedUser.id,
                              selectedUser.name || "User",
                            )
                          }
                          disabled={processingUnpauseId === selectedUser.id}
                          className="w-full flex items-center justify-between px-4 py-3 md:px-6 md:py-4 bg-emerald-500 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-emerald-600 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                        >
                          <span className="flex items-center gap-2">
                            {processingUnpauseId === selectedUser.id ? (
                              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                              <PlayCircle className="w-4 h-4" />
                            )}
                            {processingUnpauseId === selectedUser.id
                              ? "Resuming..."
                              : "Resume / Unpause Account"}
                          </span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      ) : !selectedUser.isBlocked ? (
                        <button
                          onClick={() => {
                            setPauseModalTarget(selectedUser);
                            setPauseActionReason("Temporary administrative review.");
                          }}
                          className="w-full flex items-center justify-between px-4 py-3 md:px-6 md:py-4 bg-amber-500 text-stone-950 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-amber-400 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-amber-500/20"
                        >
                          <span className="flex items-center gap-2">
                            <PauseCircle className="w-4 h-4" /> Pause Account
                          </span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      ) : null}

                      <button
                        onClick={() =>
                          sendWarning(
                            selectedUser.id,
                            selectedUser.name || "User",
                          )
                        }
                        className="w-full flex items-center justify-between px-4 py-3 md:px-6 md:py-4 bg-stone-800 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-amber-500 hover:text-stone-900 transition-all border border-stone-700 active:scale-95 translate-z-0"
                      >
                        <span className="flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4" /> Warn Account
                        </span>
                        <Speaker className="w-3 h-3 opacity-30" />
                      </button>
                    </div>
                  </div>

                  {/* Status Indicators */}
                  <div className="space-y-4">
                    {selectedUser.isBlocked && (
                      <div className="p-4 md:p-6 bg-red-50 rounded-2xl md:rounded-[2.5rem] border border-red-100 shadow-sm relative group overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-150 transition-transform">
                          <UserX className="w-10 h-10 md:w-12 md:h-12 text-red-900" />
                        </div>
                        <h3 className="font-black text-red-600 uppercase tracking-[0.2em] text-xs md:text-xs mb-3 md:mb-4">
                          Incident Log
                        </h3>
                        <div className="space-y-3">
                          <div>
                            <div className="text-xs font-black text-red-400 uppercase mb-1 flex items-center gap-1.5">
                              <ShieldAlert className="w-2.5 h-2.5" /> Reason
                            </div>
                            <p className="text-stone-800 font-bold text-xs md:text-xs italic bg-white p-2 md:p-3 rounded-lg md:rounded-xl border border-red-100/50">
                              "{selectedUser.blockReason}"
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-1 md:pt-2">
                            <div className="text-[7px] font-black text-stone-400 uppercase truncate">
                              By: {selectedUser.blockedBy?.substring(0, 5)}...
                            </div>
                            <div className="text-[7px] font-black text-stone-400 uppercase text-right truncate">
                              {formatSafeDate(selectedUser.blockedAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {isUserPaused(selectedUser) && (
                      <div className="p-4 md:p-6 bg-amber-50 rounded-2xl md:rounded-[2.5rem] border border-amber-200 shadow-sm relative group overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-150 transition-transform">
                          <PauseCircle className="w-10 h-10 md:w-12 md:h-12 text-amber-900" />
                        </div>
                        <h3 className="font-black text-amber-800 uppercase tracking-[0.2em] text-xs md:text-xs mb-3 md:mb-4">
                          Account Paused
                        </h3>
                        <div className="space-y-3">
                          <div>
                            <div className="text-xs font-black text-amber-600 uppercase mb-1 flex items-center gap-1.5">
                              <PauseCircle className="w-2.5 h-2.5" /> Reason
                            </div>
                            <p className="text-stone-800 font-bold text-xs md:text-xs italic bg-white p-2 md:p-3 rounded-lg md:rounded-xl border border-amber-100/50">
                              "{selectedUser.pauseReason || "Account temporarily placed on pause by administration."}"
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-1 md:pt-2">
                            <div className="text-[7px] font-black text-stone-400 uppercase truncate">
                              By: {selectedUser.pausedBy || "Admin"}
                            </div>
                            <div className="text-[7px] font-black text-stone-400 uppercase text-right truncate">
                              {formatSafeDate(selectedUser.pausedAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="p-4 md:p-8 bg-white rounded-2xl md:rounded-[2.5rem] border border-stone-100 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-stone-900 uppercase tracking-widest text-xs md:text-xs">
                          Privileges
                        </h3>
                        <BadgeCheck className="w-3 md:w-4 h-3 md:h-4 text-emerald-500" />
                      </div>

                      <div className="space-y-3">
                        {/* Badge Status Display */}
                        <div className="bg-stone-50 p-4 rounded-xl md:rounded-2xl border border-stone-100 flex flex-col gap-3">
                           {/* Requested Profile representation block */}
                           <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-3.5 text-xs text-stone-700">
                             {/* Profile Name with Profile Picture */}
                             <div className="flex items-center gap-3">
                               <div className="w-12 h-12 rounded-xl bg-stone-50 border border-stone-200 shadow-sm overflow-hidden shrink-0">
                                 {selectedUser.photoURL ? (
                                   <img
                                     src={selectedUser.photoURL}
                                     alt={selectedUser.name}
                                     className="w-full h-full object-cover"
                                     referrerPolicy="no-referrer"
                                   />
                                 ) : (
                                   <div className="w-full h-full flex items-center justify-center bg-stone-100 text-stone-400">
                                     <User className="w-6 h-6" />
                                   </div>
                                 )}
                               </div>
                               <div>
                                 <span className="text-stone-400 uppercase font-black text-xs tracking-widest block mb-0.5">
                                   Name
                                 </span>
                                 <div className="font-extrabold text-stone-900 text-sm leading-tight">
                                   {selectedUser.name || "Anonymous User"}
                                 </div>
                               </div>
                             </div>

                            {/* KYC status */}
                            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs">
                              {selectedUser.kycStatus === "APPROVED" ? (
                                <span className="text-emerald-600 flex items-center gap-1">
                                  ✓ KYC approved
                                </span>
                              ) : (
                                <span className="text-red-500 flex items-center gap-1">
                                  ❌ KYC approved
                                </span>
                              )}
                            </div>

                            {/* Premium status */}
                            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs">
                              {selectedUser.isVerified && (selectedUser.isPremiumVerified || selectedUser.verifiedBadgeType === "GOLDEN") ? (
                                <span className="text-emerald-600 flex items-center gap-1">
                                  ✓ Premium Seller
                                </span>
                              ) : (
                                <span className="text-red-500 flex items-center gap-1">
                                  ❌ Premium Seller
                                </span>
                              )}
                            </div>

                            <div className="border-t border-stone-200/50 my-1"></div>

                            {/* Number of Active Listings */}
                            <div>
                              <span className="text-stone-400 uppercase font-black text-xs tracking-widest block mb-0.5 font-sans">
                                Number of active listings
                              </span>
                              <span className="font-black text-stone-900 text-sm">
                                {userListings.filter((l) => l.status === "LIVE").length || (selectedUser as any).listingsCount || 0}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest">
                              Badge Status
                            </span>
                            <span
                              className={`text-[7px] md:text-xs font-black px-2 py-0.5 rounded-full border uppercase ${
                                selectedUser.verifiedBadgeType === "GOLDEN" || selectedUser.verifiedBadgeType === "BASIC"
                                  ? selectedUser.isVerified
                                    ? "text-emerald-600 bg-emerald-50 border-emerald-100"
                                    : "text-red-500 bg-red-50 border-red-100"
                                  : "text-stone-400 bg-stone-100 border-stone-200"
                              }`}
                            >
                              {selectedUser.verifiedBadgeType === "GOLDEN"
                                ? selectedUser.isVerified
                                  ? "PREMIUM ACTIVE"
                                  : "PREMIUM REVOKED"
                                : selectedUser.verifiedBadgeType === "BASIC"
                                  ? selectedUser.isVerified
                                    ? "VERIFIED ACTIVE"
                                    : "VERIFIED REVOKED"
                                  : "NO BADGE"}
                            </span>
                          </div>

                          {selectedUser.verifiedUntil && (selectedUser.verifiedBadgeType === "GOLDEN" || selectedUser.verifiedBadgeType === "BASIC") && (
                            <div className="text-xs md:text-xs text-stone-400 font-bold uppercase mt-1">
                              Expires: {formatSafeDate(selectedUser.verifiedUntil)}
                              {(() => {
                                const vu = selectedUser.verifiedUntil;
                                const d = vu.toDate ? vu.toDate() : (vu.seconds ? new Date(vu.seconds * 1000) : new Date(vu));
                                if (d < new Date()) {
                                  return " (EXPIRED)";
                                }
                                return "";
                              })()}
                            </div>
                          )}

                          {/* Pending Appeal Box inside Admin View */}
                          {selectedUser.verifiedBadgeRequestStatus === "RESUME_REQUESTED" && selectedUser.appealMessage && (
                            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-blue-800 text-xs mt-1">
                              <span className="font-black uppercase text-xs block">Pending Appeal Description:</span>
                              <span className="italic">"{selectedUser.appealMessage}"</span>
                            </div>
                          )}
                        </div>

                        {/* Select badge type and duration */}
                        <div className="space-y-3 bg-amber-50/50 p-3 rounded-xl border border-amber-200/50">
                          <div className="space-y-1">
                            <label className="block text-xs font-black uppercase tracking-widest text-stone-400">
                              Select Badge Type
                            </label>
                            <select
                              value={issueVerifiedBadgeType}
                              onChange={(e) => setIssueVerifiedBadgeType(e.target.value as "BASIC" | "GOLDEN")}
                              className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value="GOLDEN">Premium Golden Badge</option>
                              <option value="BASIC">Standard Verified (Blue Tick)</option>
                            </select>
                          </div>
                          
                          <div className="space-y-1">
                            <label className="block text-xs font-black uppercase tracking-widest text-stone-400">
                              Select Period duration
                            </label>
                            <select
                              value={issueVerifiedDuration}
                              onChange={(e) => setIssueVerifiedDuration(Number(e.target.value))}
                              className="w-full bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            >
                              <option value={30}>30 Days (1 Month)</option>
                              <option value={90}>90 Days (3 Months)</option>
                              <option value={180}>180 Days (6 Months)</option>
                              <option value={365}>365 Days (12 Months / 1 Year)</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-2">
                          {/* Button 1: Issue */}
                          <button
                            onClick={() => {
                              if (issueVerifiedBadgeType === "GOLDEN") {
                                if (!isSuperAdmin) {
                                  alert("Action restricted: Only the Super Administrator is authorized to directly issue a Premium Seller Badge without a submitted application.");
                                  return;
                                }
                              } else {
                                const isBadgeAdmin = (isSuperAdmin || isAuthorizedAdmin) && !isAuthorizedPaymentVerifier;
                                if (!isBadgeAdmin) {
                                  alert("Action restricted: Only administrators are allowed to issue this badge directly.");
                                  return;
                                }
                              }
                              if (selectedUser.kycStatus !== 'APPROVED') {
                                setKycModalAlert({
                                  title: "KYC Verification Required",
                                  message: `${selectedUser.name || "User"} is not KYC approved. Badges can only be issued directly to KYC approved users.`,
                                  type: "error"
                                });
                                return;
                              }
                              handleAdminIssueBadge(selectedUser.id, selectedUser.name || "User", issueVerifiedDuration, issueVerifiedBadgeType);
                            }}
                            className={`w-full py-2.5 md:py-3 rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 border-2 text-center font-bold ${
                              (issueVerifiedBadgeType === "GOLDEN" ? isSuperAdmin : ((isSuperAdmin || isAuthorizedAdmin) && !isAuthorizedPaymentVerifier))
                                ? "bg-stone-900 border-stone-900 text-white hover:bg-amber-500 hover:border-amber-500 hover:text-stone-900 cursor-pointer"
                                : "bg-stone-105 border-stone-250 text-stone-400 cursor-not-allowed"
                            }`}
                          >
                            {(issueVerifiedBadgeType === "GOLDEN" ? isSuperAdmin : ((isSuperAdmin || isAuthorizedAdmin) && !isAuthorizedPaymentVerifier))
                              ? `Issue ${issueVerifiedBadgeType === "GOLDEN" ? "Premium Golden" : "Standard Verified"} Badge` 
                              : issueVerifiedBadgeType === "GOLDEN"
                                ? `🔒 Issue Premium (Super Admin Only)`
                                : `🔒 Issue Badge (Admin Only)`}
                          </button>

                          {/* Button 2: Revoke/Resume */}
                          {selectedUser.verifiedBadgeType === "GOLDEN" || selectedUser.verifiedBadgeType === "BASIC" ? (
                            (() => {
                              const vu = selectedUser.verifiedUntil;
                              const d = vu ? (vu.toDate ? vu.toDate() : (vu.seconds ? new Date(vu.seconds * 1000) : new Date(vu))) : null;
                              const expired = d ? d < new Date() : false;
                              const bTypeLabel = selectedUser.verifiedBadgeType === "GOLDEN" ? "Premium" : "Verified";

                              if (expired) {
                                return (
                                  <button
                                    disabled
                                    className="w-full py-2.5 md:py-3 rounded-xl text-xs md:text-xs font-black uppercase tracking-widest cursor-not-allowed border-2 bg-stone-100 border-stone-200 text-stone-400 text-center font-bold"
                                    title="Admin cannot revoke/resume an expired badge."
                                  >
                                    Revoke/Resume (Expired)
                                  </button>
                                );
                              }

                              const isBadgeRevoked = selectedUser.verifiedBadgeRequestStatus === "REVOKED";
                              if (!isBadgeRevoked && (selectedUser.isPremiumVerified || selectedUser.verifiedBadgeRequestStatus === "APPROVED")) {
                                return (
                                  <button
                                    onClick={() => handleAdminRevokeBadge(selectedUser.id, selectedUser.name || "User", selectedUser.verifiedUntil)}
                                    className="w-full py-2.5 md:py-3 rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 border-2 bg-white border-red-200 text-red-600 hover:bg-red-600 hover:text-white text-center font-bold"
                                  >
                                    Revoke {bTypeLabel} Badge
                                  </button>
                                );
                              }

                              return (
                                <button
                                  onClick={() => handleAdminResumeBadge(selectedUser.id, selectedUser.name || "User", selectedUser.verifiedUntil)}
                                  className="w-full py-2.5 md:py-3 rounded-xl text-xs md:text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 border-2 bg-white border-emerald-200 text-emerald-600 hover:bg-emerald-600 hover:text-white text-center font-bold"
                                >
                                  Resume {bTypeLabel} Badge
                                </button>
                              );
                            })()
                          ) : (
                            <button
                              disabled
                              className="w-full py-2.5 md:py-3 rounded-xl text-xs md:text-xs font-black uppercase tracking-widest cursor-not-allowed border-2 bg-stone-50 border-stone-200 text-stone-400 text-center font-bold"
                              title="No active badge."
                            >
                              Revoke/Resume Badge
                            </button>
                          )}


                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Live Listings */}
                  <div className="space-y-3 pt-4 border-t border-stone-100">
                    <h3 className="font-black text-stone-900 uppercase tracking-widest text-xs flex items-center gap-2">
                      <Package className="w-3 h-3 text-amber-500" />
                      Live Listings ({userListings.length})
                    </h3>

                    <div className="grid grid-cols-1 gap-2">
                      {userListings.map((listing) => (
                        <div
                          key={listing.id}
                          onClick={() => setSelectedListingDetail(listing)}
                          className="p-2 bg-white border border-stone-100 rounded-xl flex items-center gap-2 shadow-sm hover:border-amber-200 transition-all group cursor-pointer hover:bg-stone-50"
                        >
                          <img
                            src={listing.images[0]}
                            className="w-12 h-12 md:w-16 md:h-16 object-cover rounded-lg border border-stone-50 flex-shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="flex-grow min-w-0">
                            <div className="text-[12px] md:text-sm font-black text-stone-900 truncate uppercase italic tracking-tighter group-hover:text-amber-600 transition-colors">
                              {listing.title}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-amber-600 font-black">
                                Rs. {listing.price.toLocaleString()}
                              </div>
                            </div>
                          </div>
                          <div
                            className="flex items-center gap-1.5 relative z-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => setSelectedListingDetail(listing)}
                              className="p-2 bg-stone-50 rounded-lg text-stone-600 hover:bg-stone-900 hover:text-white transition-all border border-stone-100 shadow-sm"
                            >
                              <Eye className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                            <button
                              onClick={() => deleteListing(listing.id)}
                              className="p-2 bg-red-50 rounded-lg text-red-500 hover:bg-red-600 hover:text-white transition-all border border-red-100 shadow-sm"
                            >
                              <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {userListings.length === 0 && (
                        <div className="py-6 text-center bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
                          <p className="text-xs font-black text-stone-300 uppercase tracking-widest">
                            No listings
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 md:p-8 bg-white border-t border-stone-100 flex flex-col md:flex-row justify-between items-center gap-2 bg-stone-50/30 relative z-20">
              <div className="text-[6px] md:text-xs font-bold text-stone-400 uppercase tracking-widest text-center md:text-left">
                Mandi Security Protocol v4.0.2 / Encrypted Admin View
              </div>
              <button
                onClick={() => setIsViewingUser(false)}
                className="w-full md:w-auto px-4 py-3 md:px-10 md:py-4 bg-stone-900 text-white rounded-lg md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-amber-500 hover:text-stone-900 transition-all shadow-xl active:scale-95 italic"
              >
                Dismiss Terminal
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirm Action Modal */}
      {confirmAction && (
        <ConfirmationDialog
          isOpen={true}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => {
            confirmAction.onConfirm();
            setConfirmAction(null);
          }}
          title="Confirm Action"
          message={confirmAction.message}
          confirmLabel="Proceed"
          cancelLabel="Cancel"
          isDestructive={confirmAction.message.toLowerCase().includes('reject') || confirmAction.message.toLowerCase().includes('revoke') || confirmAction.message.toLowerCase().includes('delete')}
        />
      )}

      {/* Payment Denial Reason Modal */}
      {paymentDenyAction && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-3 md:p-4 bg-stone-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 max-w-[340px] md:max-w-md w-full shadow-2xl transform transition-all">
            <div className="flex flex-col text-center">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
                <AlertTriangle className="w-6 h-6 md:w-8 md:h-8" />
              </div>
              <h3 className="text-lg md:text-xl font-black text-stone-900 uppercase tracking-tighter mb-2">
                Provide Denial Reason
              </h3>
              <p className="text-xs md:text-xs font-bold text-stone-400 mb-4">
                This reason will be visible to the user. Describe why their payment proof is rejected.
              </p>

              <textarea
                value={paymentDenyReason}
                onChange={(e) => setPaymentDenyReason(e.target.value)}
                placeholder="E.g., Tracking ID does not match our records, screenshot is blurry..."
                className="w-full text-xs font-bold text-stone-900 bg-stone-50 border border-stone-200 p-4 rounded-xl md:rounded-2xl min-h-[100px] mb-6 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all font-sans"
              />

              <div className="flex w-full gap-3 md:gap-4">
                <button
                  onClick={() => {
                    setPaymentDenyAction(null);
                    setPaymentDenyReason("");
                  }}
                  className="flex-1 px-4 py-2.5 md:py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl md:rounded-2xl uppercase tracking-widest text-xs md:text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (paymentDenyAction.type === 'USER') {
                      denyUserPayment(paymentDenyAction.payload, paymentDenyReason);
                    } else if (paymentDenyAction.type === 'PROMOTION') {
                      denyPromotionPayment(paymentDenyAction.payload, paymentDenyReason);
                    }
                    setPaymentDenyAction(null);
                    setPaymentDenyReason("");
                  }}
                  className="flex-1 px-4 py-2.5 md:py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl md:rounded-2xl uppercase tracking-widest text-xs md:text-xs transition-all"
                  disabled={!paymentDenyReason.trim()}
                >
                  Confirm Denial
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Feedback Dialog Alert for KYC Actions */}
      {kycModalAlert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 md:p-4 bg-stone-900/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl md:rounded-3xl p-6 md:p-8 max-w-[340px] md:max-w-sm w-full shadow-2xl transform transition-all text-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-12 h-12 md:w-16 md:h-16 ${kycModalAlert.type === "success" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-650"} rounded-full flex items-center justify-center mb-4 md:mb-6`}
              >
                {kycModalAlert.type === "success" ? (
                  <CheckCircle className="w-6 h-6 md:w-8 md:h-8" />
                ) : (
                  <AlertCircle className="w-6 h-6 md:w-8 md:h-8" />
                )}
              </div>
              <h3 className="text-lg md:text-xl font-black text-stone-900 uppercase tracking-tighter mb-2">
                {kycModalAlert.title}
              </h3>
              <p className="text-xs md:text-sm font-bold text-stone-400 mb-6 md:mb-8">
                {kycModalAlert.message}
              </p>
              <button
                onClick={() => setKycModalAlert(null)}
                className="w-full py-2.5 md:py-3 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white font-black rounded-xl md:rounded-2xl uppercase tracking-widest text-xs md:text-xs transition-all relative z-[10]"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showBlockModal && selectedUser && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => !isBlockingInProgress && setShowBlockModal(false)}
            className="absolute inset-0 bg-red-950/40 backdrop-blur-md"
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
                  Block Account
                </h3>
                <p className="text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest truncate max-w-[150px] md:max-w-none">
                  {selectedUser.name}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest mb-1.5 md:mb-2 block">
                  Violation Reason
                </label>
                <select
                  value={blockActionReason}
                  onChange={(e) => setBlockActionReason(e.target.value)}
                  className="w-full bg-stone-50 border-none rounded-xl p-3 md:p-4 text-xs md:text-sm font-bold focus:ring-2 focus:ring-red-500/20"
                >
                  <option value="Violation of community trading policies.">
                    Policy Violation
                  </option>
                  <option value="Fraudulent activity or scam reported.">
                    Fraud/Scam
                  </option>
                  <option value="Inappropriate behavior or harassment.">
                    Harassment
                  </option>
                  <option value="Repeated spamming and fake listings.">
                    Spam/Fake Listings
                  </option>
                  <option value="Other (Administrative Decision)">Other</option>
                </select>
              </div>

              <div className="bg-red-50 p-3 md:p-4 rounded-xl border border-red-100 italic font-medium text-red-700 text-xs md:text-xs">
                ⚠️ Security Notice: Restriction is immediate and irreversible by
                user. Access to listings and communication will be terminated.
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowBlockModal(false)}
                  disabled={isBlockingInProgress}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    blockUser(selectedUser.id, selectedUser.name || "User")
                  }
                  disabled={isBlockingInProgress}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-stone-900 hover:bg-red-600 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isBlockingInProgress ? (
                    <div className="w-3 md:w-4 h-3 md:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  )}
                  {isBlockingInProgress ? "Blocking..." : "Confirm Block"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      {unblockConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setUnblockConfirm(null)}
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
                  Confirm Account Unblock / Unban
                </h3>
                <p className="text-xs md:text-xs font-black text-emerald-600 uppercase tracking-widest truncate max-w-[150px] md:max-w-none">
                  Target: {unblockConfirm.targetName}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to unblock / unban this account? This action will
                restore all normal platform access, listings, bidding, and negotiation permissions for the user.
              </p>

              <div className="bg-emerald-50 p-3 md:p-4 rounded-xl border border-emerald-100 italic font-medium text-emerald-700 text-xs md:text-xs">
                ✨ Safe Restore: All suspended listings will become public, and
                user permissions & badges will be seamlessly rebuilt without data loss.
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setUnblockConfirm(null)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteUnblock}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  Confirm Unblock / Unban
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {pauseModalTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => !isPausingInProgress && setPauseModalTarget(null)}
            className="absolute inset-0 bg-stone-950/50 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-amber-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-amber-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-600">
                <PauseCircle className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Pause Account
                </h3>
                <p className="text-xs font-black text-amber-600 uppercase tracking-widest truncate max-w-[150px] md:max-w-none">
                  {pauseModalTarget.name || pauseModalTarget.email}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1.5 md:mb-2 block">
                  Select Pause Reason
                </label>
                <select
                  value={pauseActionReason}
                  onChange={(e) => setPauseActionReason(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 md:p-4 text-xs md:text-sm font-bold focus:ring-2 focus:ring-amber-500/20"
                >
                  <option value="Temporary administrative review.">
                    Temporary Administrative Review
                  </option>
                  <option value="Pending dispute resolution with counterparty.">
                    Pending Dispute Resolution
                  </option>
                  <option value="Suspicious listing activity under verification.">
                    Suspicious Activity Verification
                  </option>
                  <option value="User requested temporary cooling period.">
                    User Requested Cool-off / Hold
                  </option>
                  <option value="Payment verification discrepancy on hold.">
                    Payment Verification Discrepancy
                  </option>
                  <option value="Other administrative decision.">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1.5 md:mb-2 block">
                  Custom Notes / Reason Details (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Additional context or instructions for the user..."
                  value={pauseActionReason}
                  onChange={(e) => setPauseActionReason(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 md:p-4 text-xs md:text-sm font-semibold text-stone-800 focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="bg-amber-50 p-3 md:p-4 rounded-xl border border-amber-100 italic font-medium text-amber-900 text-xs">
                ℹ️ The user will be placed on temporary hold. Active listings will be paused and hidden from marketplace searches until unpaused.
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setPauseModalTarget(null)}
                  disabled={isPausingInProgress}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    handlePauseUser(pauseModalTarget.id, pauseModalTarget.name || "User", pauseActionReason)
                  }
                  disabled={isPausingInProgress}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-amber-500 hover:bg-amber-600 text-stone-950 rounded-xl md:rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isPausingInProgress ? (
                    <div className="w-3 md:w-4 h-3 md:h-4 border-2 border-stone-900/30 border-t-stone-900 rounded-full animate-spin" />
                  ) : (
                    <PauseCircle className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  )}
                  {isPausingInProgress ? "Pausing..." : "Confirm Pause"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showManualPauseModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => !isPausingInProgress && setShowManualPauseModal(false)}
            className="absolute inset-0 bg-stone-950/50 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-lg bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-amber-100 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-600">
                  <PauseCircle className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                    Pause User Account
                  </h3>
                  <p className="text-xs font-bold text-stone-400">
                    Search and select an active user to temporarily pause
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowManualPauseModal(false)}
                className="p-2 text-stone-400 hover:text-stone-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1.5 block">
                  Find User (by name, email, or UID)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type to search..."
                    value={manualPauseUserQuery}
                    onChange={(e) => setManualPauseUserQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-xs md:text-sm font-semibold text-stone-800 focus:ring-2 focus:ring-amber-500/20"
                  />
                  <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {manualPauseUserQuery.trim().length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-stone-100 rounded-xl p-2 bg-stone-50">
                  {allUsers
                    .filter((u) => {
                      const q = manualPauseUserQuery.toLowerCase().trim();
                      return (
                        u.name?.toLowerCase().includes(q) ||
                        u.email?.toLowerCase().includes(q) ||
                        u.id?.toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 8)
                    .map((matchedUser) => (
                      <div
                        key={matchedUser.id}
                        onClick={() => {
                          setPauseModalTarget(matchedUser);
                          setShowManualPauseModal(false);
                          setPauseActionReason("Temporary administrative review.");
                        }}
                        className="flex items-center justify-between p-2.5 bg-white rounded-lg hover:bg-amber-50 cursor-pointer border border-transparent hover:border-amber-200 transition-all"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="text-xs font-black text-stone-900 truncate">
                            {matchedUser.name || "Anonymous User"}
                          </div>
                          <div className="text-[11px] text-stone-500 truncate">
                            {matchedUser.email}
                          </div>
                        </div>
                        <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded shrink-0">
                          Select
                        </span>
                      </div>
                    ))}
                  {allUsers.filter((u) => {
                    const q = manualPauseUserQuery.toLowerCase().trim();
                    return (
                      u.name?.toLowerCase().includes(q) ||
                      u.email?.toLowerCase().includes(q) ||
                      u.id?.toLowerCase().includes(q)
                    );
                  }).length === 0 && (
                    <div className="text-center py-4 text-xs font-bold text-stone-400">
                      No matching users found in memory.
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setShowManualPauseModal(false)}
                  className="px-6 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-black uppercase tracking-wider"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showBadgeConfirm && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowBadgeConfirm(null)}
            className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-amber-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-amber-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-600">
                <ShieldCheck className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Issue Seller Badge
                </h3>
                <p className="text-xs md:text-xs font-black text-amber-600 uppercase tracking-widest truncate max-w-[150px] md:max-w-none">
                  Target: {showBadgeConfirm.targetName}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure that premium seller badge along with
                all benefits of such badge will be issued to the respective
                user?
              </p>

              <div className="bg-amber-50 p-3 md:p-4 rounded-xl border border-amber-100 italic font-medium text-amber-700 text-xs md:text-xs">
                ✨ Premium Benefits: This will grant the user a distinguished
                Golden Badge, top search priority, and unlimited listing
                privileges for {showBadgeConfirm.durDays} days.
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowBadgeConfirm(null)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!isSuperAdmin) {
                      alert("Action restricted: Only the Super Administrator is authorized to directly issue a Premium Seller Badge without a submitted application.");
                      setShowBadgeConfirm(null);
                      return;
                    }
                    const { userId, durDays } = showBadgeConfirm;
                    setShowBadgeConfirm(null);
                    await toggleUserVerification(userId, false, durDays, true);
                  }}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl shadow-amber-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  Confirm & Issue
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {selectedKycApplication && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-2 sm:p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setSelectedKycApplication(null)}
            className="absolute inset-0 bg-stone-950/75 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.96, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            className="relative w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden max-h-[94vh] flex flex-col z-10"
          >
            {/* Top Header Bar */}
            <div className="bg-stone-900 text-white px-5 py-4 sm:px-6 sm:py-5 flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-2xl flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] font-mono font-bold text-stone-300 uppercase tracking-wider bg-stone-800/80 px-2.5 py-0.5 rounded border border-stone-700">
                      MND-KYC-{selectedKycApplication.userId.substring(0, 8).toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const trackNo = `MND-KYC-${selectedKycApplication.userId.substring(0, 8).toUpperCase()}`;
                        navigator.clipboard.writeText(trackNo);
                        setCopiedTrackId(selectedKycApplication.id);
                        setTimeout(() => setCopiedTrackId(null), 2000);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border flex items-center gap-1 transition-all cursor-pointer ${
                        copiedTrackId === selectedKycApplication.id
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                          : "bg-stone-800/60 border-stone-700 text-stone-400 hover:text-white hover:bg-stone-800"
                      }`}
                      title="Copy Tracking ID"
                    >
                      {copiedTrackId === selectedKycApplication.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                    <span className="px-2 py-0.5 bg-stone-800 text-stone-300 rounded text-[11px] font-bold tracking-wider uppercase border border-stone-700">
                      {selectedKycApplication.category}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider border ${
                        selectedKycApplication.status === "PENDING"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                          : selectedKycApplication.status === "APPROVED"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : selectedKycApplication.status === "RESUME_REQUESTED"
                              ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                              : "bg-red-500/20 text-red-300 border-red-500/30"
                      }`}
                    >
                      STATUS: {selectedKycApplication.status.replace("_", " ")}
                    </span>
                  </div>
                  <h2 className="font-extrabold text-white text-lg sm:text-xl tracking-tight truncate">
                    {selectedKycApplication.legalName}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => window.open(`/user/${selectedKycApplication.userId}`, "_blank")}
                  className="px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all border border-stone-700 cursor-pointer"
                  title="Open user's public profile in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">View Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKycApplication(null)}
                  className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white transition-colors cursor-pointer border border-stone-700"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sticky/Prominent Action Bar */}
            <div className="bg-stone-50 px-5 py-3.5 sm:px-6 sm:py-4 border-b border-stone-200 shrink-0">
              {selectedKycApplication.status === "PENDING" && (
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 justify-between">
                  <div className="flex-1 flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Specify rejection reason (required if rejecting)..."
                      value={kycRejectionInputs[selectedKycApplication.id] || ""}
                      onChange={(e) =>
                        setKycRejectionInputs((prev) => ({
                          ...prev,
                          [selectedKycApplication.id]: e.target.value,
                        }))
                      }
                      className="flex-1 bg-white border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-400 outline-none font-medium"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleKycReject(
                          selectedKycApplication.id,
                          selectedKycApplication.userId,
                          kycRejectionInputs[selectedKycApplication.id],
                        )
                      }
                      disabled={kycActionSubmitting}
                      className="bg-red-50 hover:bg-red-600 hover:text-white text-red-700 border border-red-200 font-bold uppercase tracking-wider text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject Application</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleKycApprove(
                        selectedKycApplication.id,
                        selectedKycApplication.userId,
                        selectedKycApplication.category,
                        selectedKycApplication.category === "BUSINESS"
                          ? selectedKycApplication.businessName || selectedKycApplication.legalName
                          : selectedKycApplication.legalName,
                      )
                    }
                    disabled={kycActionSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase tracking-wider text-xs py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4 text-white" />
                    <span>Approve & Verify Badge</span>
                  </button>
                </div>
              )}

              {selectedKycApplication.status === "RESUME_REQUESTED" && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs font-bold text-blue-900 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>User has submitted a verification appeal. Review the documents and dossier.</span>
                  </div>
                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        const app = selectedKycApplication;
                        setKycAppealReasonModal({
                          isOpen: true,
                          app,
                          reason: "",
                        });
                      }}
                      disabled={kycActionSubmitting}
                      className="flex-1 sm:flex-initial px-4 py-2.5 bg-red-50 hover:bg-red-600 hover:text-white text-red-700 font-bold uppercase tracking-wider text-xs rounded-xl border border-red-200 transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject Appeal</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const app = selectedKycApplication;
                        setConfirmAction({
                          message: `Are you sure you want to accept the appeal for ${app.legalName || app.businessName || "this candidate"}? This will restore their verified Blue Tick status and active KYC benefits.`,
                          onConfirm: () => handleAcceptKycAppeal(app),
                        });
                      }}
                      disabled={kycActionSubmitting}
                      className="flex-1 sm:flex-initial px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase tracking-wider text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Accept Appeal</span>
                    </button>
                  </div>
                </div>
              )}

              {selectedKycApplication.status === "APPROVED" && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex-1 flex flex-col sm:flex-row gap-2 w-full">
                    <input
                      type="text"
                      placeholder="Specify reason for revoking KYC..."
                      value={kycRevocationInputs[selectedKycApplication.id] || ""}
                      onChange={(e) =>
                        setKycRevocationInputs((prev) => ({
                          ...prev,
                          [selectedKycApplication.id]: e.target.value,
                        }))
                      }
                      className="flex-1 bg-white border border-stone-300 rounded-xl px-3.5 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:ring-2 focus:ring-stone-900/20 outline-none font-medium"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleKycRevoke(
                          selectedKycApplication.id,
                          selectedKycApplication.userId,
                          kycRevocationInputs[selectedKycApplication.id],
                        )
                      }
                      disabled={kycActionSubmitting}
                      className="bg-stone-900 hover:bg-red-700 text-white font-bold uppercase tracking-wider text-xs py-2 px-4 rounded-xl transition-all whitespace-nowrap cursor-pointer active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <ShieldX className="w-4 h-4 text-red-400" />
                      <span>Revoke Verification</span>
                    </button>
                  </div>
                </div>
              )}

              {(selectedKycApplication.status === "REVOKED" || selectedKycApplication.status === "REJECTED" || selectedKycApplication.status === "PERMANENTLY_REMOVED") && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-stone-600">
                    {selectedKycApplication.status === "REJECTED" && selectedKycApplication.rejectionReason && (
                      <span className="text-red-700 font-bold">
                        Rejection Reason: {selectedKycApplication.rejectionReason}
                      </span>
                    )}
                    {selectedKycApplication.status === "REVOKED" && selectedKycApplication.revocationReason && (
                      <span className="text-stone-800 font-bold">
                        Revocation Reason: {selectedKycApplication.revocationReason}
                      </span>
                    )}
                  </div>
                  {selectedKycApplication.status === "REVOKED" && (
                    <button
                      type="button"
                      onClick={() =>
                        handleKycResume(selectedKycApplication.id, selectedKycApplication.userId)
                      }
                      disabled={kycActionSubmitting}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold uppercase tracking-wider text-xs rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Resume Verification</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Main Content Workspace (Two-Column Responsive Layout) */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-stone-100/60">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Column: Document Evidence (Primary Focus) */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                      <FileBadge className="w-4 h-4 text-amber-600" />
                      <span>Submitted Identity Documents</span>
                    </h3>
                    <span className="text-[11px] text-stone-500 font-medium">Click any document to inspect in full zoom</span>
                  </div>

                  {/* Document Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Front Document */}
                    <div className="bg-white rounded-2xl border border-stone-200/80 p-3.5 shadow-sm flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-stone-700 uppercase tracking-wide">
                          Government ID — Front
                        </span>
                        {selectedKycApplication.cnicFrontPhoto && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Available
                          </span>
                        )}
                      </div>

                      {selectedKycApplication.cnicFrontPhoto ? (
                        <div
                          onClick={() => setActiveKycLightbox({
                            src: selectedKycApplication.cnicFrontPhoto,
                            title: `National Identity Card Front Photo - ${selectedKycApplication.legalName}`
                          })}
                          className="relative rounded-xl overflow-hidden bg-stone-900 aspect-[16/10] group cursor-zoom-in border border-stone-300 flex items-center justify-center"
                        >
                          <img
                            src={selectedKycApplication.cnicFrontPhoto}
                            alt="Government ID Front"
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-stone-950/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs uppercase font-bold tracking-wider gap-1.5">
                            <Eye className="w-4 h-4" />
                            <span>Click to Zoom</span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-stone-300 flex flex-col items-center justify-center aspect-[16/10] bg-stone-50 text-xs font-bold uppercase text-stone-400 p-4 text-center">
                          <AlertCircle className="w-6 h-6 text-stone-300 mb-1" />
                          <span>Front Document Not Provided</span>
                        </div>
                      )}
                    </div>

                    {/* Back Document */}
                    <div className="bg-white rounded-2xl border border-stone-200/80 p-3.5 shadow-sm flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-stone-700 uppercase tracking-wide">
                          Government ID — Back
                        </span>
                        {selectedKycApplication.cnicBackPhoto ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Available
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                            Optional / Passport
                          </span>
                        )}
                      </div>

                      {selectedKycApplication.cnicBackPhoto ? (
                        <div
                          onClick={() => setActiveKycLightbox({
                            src: selectedKycApplication.cnicBackPhoto!,
                            title: `National Identity Card Back Photo - ${selectedKycApplication.legalName}`
                          })}
                          className="relative rounded-xl overflow-hidden bg-stone-900 aspect-[16/10] group cursor-zoom-in border border-stone-300 flex items-center justify-center"
                        >
                          <img
                            src={selectedKycApplication.cnicBackPhoto}
                            alt="Government ID Back"
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-stone-950/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs uppercase font-bold tracking-wider gap-1.5">
                            <Eye className="w-4 h-4" />
                            <span>Click to Zoom</span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-stone-300 flex flex-col items-center justify-center aspect-[16/10] bg-stone-50 text-xs font-bold uppercase text-stone-400 p-4 text-center">
                          <FileText className="w-6 h-6 text-stone-300 mb-1" />
                          <span>No Back Photo Uploaded</span>
                        </div>
                      )}
                    </div>

                    {/* Selfie Photograph */}
                    <div className="bg-white rounded-2xl border border-stone-200/80 p-3.5 shadow-sm flex flex-col sm:col-span-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-stone-700 uppercase tracking-wide">
                          Face Selfie / Photograph Verification
                        </span>
                        {selectedKycApplication.selfiePhoto && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Available
                          </span>
                        )}
                      </div>

                      {selectedKycApplication.selfiePhoto ? (
                        <div
                          onClick={() => setActiveKycLightbox({
                            src: selectedKycApplication.selfiePhoto,
                            title: `Selfie Photograph - ${selectedKycApplication.legalName}`
                          })}
                          className="relative rounded-xl overflow-hidden bg-stone-900 h-64 group cursor-zoom-in border border-stone-300 flex items-center justify-center"
                        >
                          <img
                            src={selectedKycApplication.selfiePhoto}
                            alt="Applicant Selfie"
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-stone-950/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs uppercase font-bold tracking-wider gap-1.5">
                            <Eye className="w-4 h-4" />
                            <span>Click to Zoom Selfie</span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-stone-300 flex flex-col items-center justify-center h-48 bg-stone-50 text-xs font-bold uppercase text-stone-400 p-4 text-center">
                          <User className="w-6 h-6 text-stone-300 mb-1" />
                          <span>Selfie Photo Not Provided</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Applicant Dossier & Timeline */}
                <div className="lg:col-span-5 space-y-4">
                  {/* Applicant Details Card */}
                  <div className="bg-white rounded-2xl border border-stone-200/80 p-4 sm:p-5 shadow-sm space-y-4">
                    <h3 className="text-xs font-black text-stone-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2.5">
                      <User className="w-4 h-4 text-amber-600" />
                      <span>Applicant Information</span>
                    </h3>

                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">Legal Full Name</span>
                        <span className="text-stone-900 font-bold text-sm block">{selectedKycApplication.legalName}</span>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">National ID / CNIC Number</span>
                        <span className="text-stone-900 font-mono font-bold text-sm bg-stone-50 px-2.5 py-1 rounded-lg border border-stone-200 inline-block">
                          {selectedKycApplication.cnicNumber}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-stone-400" /> Phone
                          </span>
                          <span className="text-stone-800 font-bold block">{selectedKycApplication.mobileNumber}</span>
                        </div>

                        <div>
                          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-stone-400" /> Email
                          </span>
                          <span className="text-stone-800 font-bold truncate block" title={selectedKycApplication.userEmail || ""}>
                            {selectedKycApplication.userEmail || "No Email"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        <div>
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">Origin</span>
                          <span className="text-stone-800 font-bold block">{selectedKycApplication.country || "-"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">Stay</span>
                          <span className="text-stone-800 font-bold block">{selectedKycApplication.countryOfStay || "-"}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5">City</span>
                          <span className="text-stone-800 font-bold block">{selectedKycApplication.city || "-"}</span>
                        </div>
                      </div>

                      {/* Address depending on category */}
                      {selectedKycApplication.category === "INDIVIDUAL" ? (
                        <div className="pt-1">
                          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Residential Address</span>
                          <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/80 text-stone-800 font-medium leading-relaxed">
                            {selectedKycApplication.residentialAddress || "Not entered"}
                          </div>
                        </div>
                      ) : (
                        <div className="pt-1 space-y-2">
                          <div>
                            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-0.5 flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-stone-400" /> Registered Business Name
                            </span>
                            <span className="text-amber-900 font-extrabold text-sm block">
                              {selectedKycApplication.businessName || "Not entered"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Business / Dealing Address</span>
                            <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200/80 text-stone-800 font-medium leading-relaxed">
                              {selectedKycApplication.businessAddress || "Not entered"}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Audit Timeline Card */}
                  <div className="bg-white rounded-2xl border border-stone-200/80 p-4 sm:p-5 shadow-sm space-y-3">
                    <h3 className="text-xs font-black text-stone-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-stone-100 pb-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>Timeline & Activity</span>
                    </h3>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1 border-b border-stone-100">
                        <span className="text-stone-500 font-medium flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span>Submitted</span>
                        </span>
                        <span className="font-mono font-bold text-stone-800">
                          {formatKycDateTime(selectedKycApplication.submittedAt)}
                        </span>
                      </div>

                      {selectedKycApplication.approvedAt && (
                        <div className="flex items-center justify-between py-1 border-b border-stone-100">
                          <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>Approved</span>
                          </span>
                          <span className="font-mono font-bold text-emerald-800">
                            {formatKycDateTime(selectedKycApplication.approvedAt)}
                          </span>
                        </div>
                      )}

                      {selectedKycApplication.rejectedAt && (
                        <div className="flex items-center justify-between py-1 border-b border-stone-100">
                          <span className="text-red-700 font-medium flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-500" />
                            <span>Rejected</span>
                          </span>
                          <span className="font-mono font-bold text-red-800">
                            {formatKycDateTime(selectedKycApplication.rejectedAt)}
                          </span>
                        </div>
                      )}

                      {selectedKycApplication.revokedAt && (
                        <div className="flex items-center justify-between py-1">
                          <span className="text-stone-700 font-medium flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-stone-500" />
                            <span>Revoked</span>
                          </span>
                          <span className="font-mono font-bold text-stone-900">
                            {formatKycDateTime(selectedKycApplication.revokedAt)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Footer Bar */}
            <div className="bg-stone-50 px-5 py-3 sm:px-6 border-t border-stone-200 flex items-center justify-between shrink-0">
              <span className="text-xs text-stone-500 font-medium">
                User ID: <span className="font-mono text-stone-700">{selectedKycApplication.userId}</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedKycApplication(null)}
                className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold uppercase text-xs tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                Close Application
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {activeKycLightbox && (
        <KycImageLightbox
          src={activeKycLightbox.src}
          title={activeKycLightbox.title}
          onClose={() => setActiveKycLightbox(null)}
        />
      )}

      {/* KYC Appeal Rejection Reason Prompt Modal */}
      {kycAppealReasonModal.isOpen && kycAppealReasonModal.app && (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-100 text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">
                  Decline Reinstatement Appeal
                </h3>
                <p className="text-xs text-stone-500">
                  State reason why {kycAppealReasonModal.app.legalName || kycAppealReasonModal.app.businessName || "the user"}'s appeal cannot be accepted.
                </p>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="mb-3">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-1.5">Common Reasons</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Insufficient explanation or proof provided in appeal",
                  "Violation of platform terms remains unaddressed",
                  "Identity details cannot be verified",
                  "Document discrepancy remains unresolved",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setKycAppealReasonModal((prev) => ({ ...prev, reason: preset }))}
                    className="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1 rounded-lg transition font-medium cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Reason Text Area */}
            <textarea
              rows={3}
              placeholder="Enter appeal rejection reason..."
              value={kycAppealReasonModal.reason}
              onChange={(e) => setKycAppealReasonModal((prev) => ({ ...prev, reason: e.target.value }))}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setKycAppealReasonModal({ isOpen: false, app: null, reason: "" })}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={kycActionSubmitting}
                onClick={() => {
                  const trimmed = kycAppealReasonModal.reason.trim();
                  if (!trimmed) {
                    setKycModalAlert({
                      title: "Reason Required",
                      message: "Please write or select a reason to reject this appeal.",
                      type: "error",
                    });
                    return;
                  }
                  handleRejectKycAppeal(kycAppealReasonModal.app!, trimmed);
                }}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                Confirm Appeal Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Refund Request Confirmation Modal */}
      {confirmingAdminRefund && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={() => setConfirmingAdminRefund(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl border border-stone-200 overflow-hidden flex flex-col font-sans animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 text-emerald-600">
                <AlertCircle className="w-6 h-6" />
                <h3 className="font-extrabold text-lg text-stone-900">Confirm Refund</h3>
              </div>
              <p className="text-stone-600 text-sm mb-4 leading-relaxed">
                Are you sure you have refunded this request and want to mark it as <span className="font-black text-emerald-700">REFUNDED</span>? 
              </p>
              <p className="text-stone-400 text-xs mb-6 font-bold">
                This action is irreversible and the button will turn permanently green. The seller will be notified that they have received their refund.
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setConfirmingAdminRefund(null)}
                  className="flex-1 px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold text-xs uppercase tracking-widest rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isRefunding}
                  onClick={() => handleProcessPromoRefundConfirm()}
                  className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-colors shadow-sm disabled:opacity-50"
                >
                  {isRefunding ? "Processing..." : "Confirm Refund"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Admin Permitted Sections Modal */}
      {editingAdmin && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={() => setEditingAdmin(null)} />
          <div className="relative bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col font-sans animate-in zoom-in-95 duration-200">
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-3 mb-2 text-stone-900">
                <Shield className="w-6 h-6 text-amber-500" />
                <h3 className="font-black text-xl md:text-2xl uppercase italic tracking-tighter">Edit Admin Permissions</h3>
              </div>
              <p className="text-stone-400 text-xs md:text-sm mb-6 font-semibold">
                Set permitted sections for admin <span className="font-extrabold text-stone-950 lowercase">{editingAdmin.email}</span>. This assistant will only be able to view and manage the enabled sections.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-8 bg-stone-50 p-4 rounded-2xl border border-stone-100 max-h-96 overflow-y-auto">
                {ADMIN_SECTIONS.map((sec) => {
                  const isSelected = editingSections.includes(sec.id);
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setEditingSections(editingSections.filter(id => id !== sec.id));
                        } else {
                          setEditingSections([...editingSections, sec.id]);
                        }
                      }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "bg-amber-100/60 border-amber-300 text-amber-900 font-extrabold"
                          : "bg-white border-stone-150 hover:border-stone-300 text-stone-600 font-semibold"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                        isSelected ? "bg-amber-500 border-amber-600 text-stone-900" : "border-stone-300 bg-white"
                      }`}>
                        {isSelected && <span className="text-xs font-black">✓</span>}
                      </div>
                      <span className="text-xs tracking-tight uppercase leading-none font-black">
                        {sec.num}. {sec.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="flex-1 px-4 py-3.5 bg-stone-100 hover:bg-stone-200 text-stone-900 font-black uppercase tracking-widest text-xs rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isUpdatingPermissions}
                  onClick={handleUpdatePermissions}
                  className="flex-1 px-4 py-3.5 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white font-black uppercase tracking-widest text-xs rounded-xl transition-colors shadow-md disabled:opacity-50"
                >
                  {isUpdatingPermissions ? "Saving Changes..." : "Save Permissions"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function SidebarLink({
    id,
    icon: Icon,
    label,
  }: {
    id: typeof activeTab;
    icon: any;
    label: string;
    key?: any;
  }) {
    return (
      <button
        onClick={() => setActiveTab(id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all text-xs border border-transparent ${
          activeTab === id
            ? "bg-amber-500 text-stone-900 shadow-xl shadow-amber-500/10 italic"
            : "text-stone-400 hover:text-stone-300 hover:bg-stone-800/50"
        }`}
      >
        <Icon
          className={`w-4 h-4 ${activeTab === id ? "text-stone-900" : "text-stone-600"}`}
        />
        {label}
      </button>
    );
  }
}
