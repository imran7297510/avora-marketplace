import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NegotiationStatus, ModerationStatus, ModerationActionType, ReportTargetType, ReportStatus } from '../types';
import { ArenaButton } from './ArenaButton';
import { ThreeDButton } from '../../../components/ThreeDButton';
import { useNegotiationActions, NegotiationActionType } from '../hooks/useNegotiationActions';
import { 
  Check, 
  X, 
  ShieldAlert, 
  Send, 
  MessageSquare, 
  Flag, 
  FileText, 
  Phone, 
  History,
  AlertTriangle,
  UserMinus,
  Ban,
  Lock,
  Trash2,
  Activity,
  ClipboardList,
  Clock,
  ChevronLeft,
  MoreVertical,
  ExternalLink,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { cn, formatPKR } from '../../../lib/utils';
import { formatPrice, getCurrencyByCode } from '../../../lib/currencies';
import { useAuth } from '../../../context/AuthContext';
import { collection, query, where, onSnapshot, doc, serverTimestamp, runTransaction, addDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ModerationService } from '../services/moderationService';
import { AuditLogService } from '../services/auditLogService';
import { AuthRequiredModal } from '../../../components/AuthRequiredModal';
import { OfferConfirmationModal } from './shared/OfferConfirmationModal';
import { ReportButton } from './ReportButton';
import { getNegotiationHubStatus } from '../utils';
import { parseSafeDate } from '../utils/arena';
import { isUserBanned, getUserBanRemaining } from '../../../services/userService';
import { resolveAuthoritativeVerification } from '../../../lib/verificationResolver';

interface NegotiationActionsProps {
  status: NegotiationStatus;
  isBuyer: boolean;
  isSeller: boolean;
  lastOfferBy: string;
  userId: string;
  onRespond: (action: 'accept' | 'decline' | 'withdraw' | 'cancel', userId?: string, message?: string) => void;
  onCounter: (amount: number, message?: string, userId?: string) => void;
  onComplete: (userId?: string) => void;
  onRequestContact?: (userId?: string) => Promise<void>;
  onShareContact?: (details: { name?: string; phone?: string; email?: string; address?: string }, userId?: string) => Promise<void>;
  onSendMessage?: () => void;
  onViewTimeline?: () => void;
  remainingOffers?: number;
  negotiation?: any;
  sellerProfile?: any;
  auction?: any;
  adminPerspective?: 'admin' | 'buyer' | 'seller';
  setAdminPerspective?: (p: 'admin' | 'buyer' | 'seller') => void;
  offers?: any[];
  showAgreementModal?: boolean;
  setShowAgreementModal?: (show: boolean) => void;
  showContactModal?: boolean;
  setShowContactModal?: (show: boolean) => void;
}

export const NegotiationActions: React.FC<NegotiationActionsProps> = ({
  status,
  isBuyer,
  isSeller,
  lastOfferBy,
  userId,
  onRespond,
  onCounter,
  onComplete,
  onRequestContact,
  onShareContact,
  onSendMessage,
  onViewTimeline,
  remainingOffers = 10,
  negotiation,
  sellerProfile,
  auction,
  adminPerspective: adminPerspectiveProp,
  setAdminPerspective: setAdminPerspectiveProp,
  offers = [],
  showAgreementModal: showAgreementModalProp,
  setShowAgreementModal: setShowAgreementModalProp,
  showContactModal: showContactModalProp,
  setShowContactModal: setShowContactModalProp
}) => {
  const { user, isAdmin, userProfile } = useAuth();
  const [showAuthRequiredModal, setShowAuthRequiredModal] = useState(false);
  const isCurrentUserKycApproved = resolveAuthoritativeVerification(userProfile).isKycCurrentlyValid;
  const [localAdminPerspective, setLocalAdminPerspective] = useState<'admin' | 'buyer' | 'seller'>(() => {
    if (isSeller) return 'seller';
    return 'buyer'; // Default to buyer so negotiations load with action buttons visible immediately!
  });

  const currentPerspective = adminPerspectiveProp !== undefined ? adminPerspectiveProp : localAdminPerspective;
  const changePerspective = setAdminPerspectiveProp !== undefined ? setAdminPerspectiveProp : setLocalAdminPerspective;
  const currencyCode = negotiation?.currency || auction?.currency || 'USD';
  const currencySymbol = (negotiation as any)?.currencySymbol || auction?.currencySymbol || getCurrencyByCode(currencyCode).symbol;
  const [searchParams] = useSearchParams();
  const urlAction = searchParams.get('action');

  const [showCounterInput, setShowCounterInput] = useState(() => urlAction === 'counter');

  useEffect(() => {
    if (urlAction === 'counter') {
      setShowCounterInput(true);
    } else if (urlAction === 'accept') {
      setShowAcceptModal(true);
    }
  }, [urlAction]);
  const [counterAmount, setCounterAmount] = useState('');
  const [message, setMessage] = useState('');
  const [showConfirmOfferModal, setShowConfirmOfferModal] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [acceptMessage, setAcceptMessage] = useState('');
  const [localShowAgreementModal, setLocalShowAgreementModal] = useState(false);
  const [localShowContactModal, setLocalShowContactModal] = useState(false);

  // Contact Modal state
  const [shareName, setShareName] = useState('');
  const [sharePhone, setSharePhone] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [shareAddress, setShareAddress] = useState('');
  const [contactFormError, setContactFormError] = useState<string | null>(null);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSuccessMsg, setContactSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (negotiation?.sharedContactDetails) {
      setShareName(negotiation.sharedContactDetails.name || '');
      setSharePhone(negotiation.sharedContactDetails.phone || '');
      setShareEmail(negotiation.sharedContactDetails.email || '');
      setShareAddress(negotiation.sharedContactDetails.address || '');
    } else if (sellerProfile) {
      setShareName(sellerProfile.displayName || '');
      setSharePhone(sellerProfile.phoneNumber || sellerProfile.phone || '');
      setShareEmail(sellerProfile.email || '');
      setShareAddress(sellerProfile.address || '');
    }
  }, [negotiation?.sharedContactDetails, sellerProfile]);

  const showAgreementModal = showAgreementModalProp !== undefined ? showAgreementModalProp : localShowAgreementModal;
  const setShowAgreementModal = setShowAgreementModalProp !== undefined ? setShowAgreementModalProp : setLocalShowAgreementModal;
  const showContactModal = showContactModalProp !== undefined ? showContactModalProp : localShowContactModal;
  const setShowContactModal = setShowContactModalProp !== undefined ? setShowContactModalProp : setLocalShowContactModal;
  const [showMoreActions, setShowMoreActions] = useState(false);

  // Admin Operations State
  const [adminActiveTab, setAdminActiveTab] = useState<'view_negotiation' | 'view_timeline' | 'view_reports' | 'audit_log'>('view_negotiation');
  const [showAdminModal, setShowAdminModal] = useState<'warning' | 'suspend' | 'ban' | 'force_close' | 'remove' | null>(null);
  const [selectedTargetUser, setSelectedTargetUser] = useState<'buyer' | 'seller'>('buyer');
  const [actionReason, setActionReason] = useState('');
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [forceCloseType, setForceCloseType] = useState<'cancelled' | 'completed'>('cancelled');
  const [reports, setReports] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const isActualSeller = isSeller || (!!auction?.sellerId && userId === auction.sellerId) || (!!negotiation?.sellerId && userId === negotiation.sellerId);
  const effectiveIsSeller = isAdmin ? (currentPerspective === 'seller') : isActualSeller;
  const effectiveIsBuyer = isAdmin ? (currentPerspective === 'buyer') : (isBuyer && !effectiveIsSeller);

  const simulatedUserId = (isAdmin && currentPerspective === 'buyer')
    ? (negotiation?.buyerId || 'simulated-buyer')
    : (isAdmin && currentPerspective === 'seller')
      ? (negotiation?.sellerId || 'simulated-seller')
      : userId;

  const banStatus = getUserBanRemaining(userProfile);
  const isUserBlockedOrBanned = !!(
    isUserBanned(userProfile) ||
    userProfile?.isBanned ||
    userProfile?.isBlocked || 
    (userProfile as any)?.accountStatus === 'banned' ||
    (userProfile as any)?.biddingDisabled ||
    (userProfile as any)?.canBid === false ||
    userProfile?.moderationStatus === 'BANNED' || 
    userProfile?.moderationStatus === 'SUSPENDED'
  );

  const hubStatus = useMemo(() => {
    return getNegotiationHubStatus(auction, negotiation);
  }, [auction, negotiation]);

  const isListingActive = useMemo(() => {
    return hubStatus?.isActive ?? false;
  }, [hubStatus]);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sellerExactPrice = useMemo(() => {
    if (typeof auction?.startingPrice === 'number' && Number.isFinite(auction.startingPrice) && auction.startingPrice > 0) {
      return auction.startingPrice;
    }
    if (typeof (auction as any)?.price === 'number' && Number.isFinite((auction as any).price) && (auction as any).price > 0) {
      return (auction as any).price;
    }
    if (typeof negotiation?.itemPrice === 'number' && Number.isFinite(negotiation.itemPrice) && negotiation.itemPrice > 0) {
      return negotiation.itemPrice;
    }
    if (typeof (negotiation as any)?.startingPrice === 'number' && Number.isFinite((negotiation as any).startingPrice) && (negotiation as any).startingPrice > 0) {
      return (negotiation as any).startingPrice;
    }
    return 0;
  }, [auction, negotiation]);

  const latestBuyerOfferAmount = useMemo(() => {
    const sId = auction?.sellerId || negotiation?.sellerId || '';
    const buyerOffers = (offers || []).filter(o => {
      if (typeof o.amount !== 'number' || !Number.isFinite(o.amount) || o.amount <= 0) return false;
      if (o.action === 'message' || o.action === 'withdraw') return false;
      const isSellerOffer = (sId && o.senderId === sId) ||
                            o.senderId === 'seller' || 
                            o.senderId === 'simulated-seller' || 
                            ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(o.senderId);
      return !isSellerOffer;
    });

    if (buyerOffers.length > 0) {
      const sortedDesc = [...buyerOffers].sort((a, b) => {
        const timeA = parseSafeDate(a.timestamp)?.getTime() || 0;
        const timeB = parseSafeDate(b.timestamp)?.getTime() || 0;
        return timeB - timeA;
      });
      return sortedDesc[0].amount;
    }

    if (negotiation?.lastOfferAmount && negotiation.lastOfferAmount > 0) {
      const isSeller = (sId && negotiation.lastOfferBy === sId) || negotiation.lastOfferBy === 'seller';
      if (!isSeller) {
        return negotiation.lastOfferAmount;
      }
    }

    return 0;
  }, [offers, auction?.sellerId, negotiation]);

  const lastBuyerOfferTime = useMemo(() => {
    if (!negotiation) return 0;
    const directDate = parseSafeDate((negotiation as any).lastBuyerOfferAt);
    if (directDate && !isNaN(directDate.getTime())) return directDate.getTime();

    const buyerId = negotiation.buyerId;
    const buyerOffers = (offers || []).filter(o => {
      const isSellerOffer = o.senderId === negotiation.sellerId || 
                            o.senderId === 'seller' || 
                            o.senderId === 'simulated-seller' || 
                            ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(o.senderId);
      return !isSellerOffer && (o.senderId === buyerId || o.action === 'send' || o.action === 'counter');
    });

    if (buyerOffers.length > 0) {
      let maxTime = 0;
      buyerOffers.forEach(o => {
        const d = parseSafeDate(o.timestamp);
        if (d && d.getTime() > maxTime) {
          maxTime = d.getTime();
        }
      });
      if (maxTime > 0) return maxTime;
    }

    if (negotiation.lastOfferBy === buyerId && negotiation.updatedAt) {
      const d = parseSafeDate(negotiation.updatedAt);
      if (d) return d.getTime();
    }

    return 0;
  }, [negotiation, offers]);

  const cooldownRemainingSec = useMemo(() => {
    if (!effectiveIsBuyer || !lastBuyerOfferTime) return 0;
    const elapsed = nowMs - lastBuyerOfferTime;
    if (elapsed >= 15000) return 0;
    return Math.ceil((15000 - elapsed) / 1000);
  }, [effectiveIsBuyer, lastBuyerOfferTime, nowMs]);

  const makeOfferBtnConfig = useMemo(() => {
    if (effectiveIsSeller || (auction?.sellerId && userId === auction.sellerId) || (negotiation?.sellerId && userId === negotiation.sellerId)) {
      return {
        label: "Sellers Cannot Submit Offers",
        className: "bg-stone-800 text-stone-500 border border-stone-700 cursor-not-allowed opacity-80",
        iconColor: "text-stone-500",
        disabled: true
      };
    }
    if (isUserBlockedOrBanned) {
      return {
        label: "Blocked from Offering",
        className: "bg-red-500/10 text-red-500 border border-red-500/20 cursor-not-allowed opacity-90",
        iconColor: "text-red-500 fill-red-500/20",
        disabled: true
      };
    }
    if (effectiveIsBuyer && cooldownRemainingSec > 0) {
      return {
        label: `Wait ${cooldownRemainingSec}s (15s Cooldown Active)`,
        className: "bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-not-allowed opacity-90",
        iconColor: "text-amber-400 fill-amber-400/20 animate-pulse",
        disabled: true
      };
    }
    if (remainingOffers <= 0) {
      return {
        label: "No Remaining Offers",
        className: "bg-amber-500/10 text-amber-500 border border-amber-500/20 cursor-not-allowed opacity-90",
        iconColor: "text-amber-500 fill-amber-500/20",
        disabled: true
      };
    }
    if (!isListingActive && hubStatus) {
      if (hubStatus.label === 'Expired') {
        return {
          label: "Offer Unavailable (Expired)",
          className: "bg-rose-500/10 text-rose-500 border border-rose-500/20 cursor-not-allowed opacity-90",
          iconColor: "text-rose-500 fill-rose-500/20",
          disabled: true
        };
      }
      if (hubStatus.label === 'Offer Concluded') {
        return {
          label: "Offer Concluded",
          className: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 cursor-not-allowed opacity-90",
          iconColor: "text-emerald-500 fill-emerald-500/20",
          disabled: true
        };
      }
      if (hubStatus.label === 'Paused by the Seller' || hubStatus.label === 'Paused by Seller') {
        return {
          label: "Paused by Seller",
          className: "bg-amber-500/10 text-amber-500 border border-amber-500/20 cursor-not-allowed opacity-90",
          iconColor: "text-amber-500 fill-amber-500/20",
          disabled: true
        };
      }
      if (hubStatus.label === 'Paused by the Admin' || hubStatus.label === 'Paused by Admin') {
        return {
          label: "Paused by Admin",
          className: "bg-amber-500/10 text-amber-500 border border-amber-500/20 cursor-not-allowed opacity-90",
          iconColor: "text-amber-500 fill-amber-500/20",
          disabled: true
        };
      }
      if (hubStatus.label === 'Closed On Violation' || hubStatus.label === 'Force Stopped by Admin') {
        return {
          label: "Closed by Admin (Violation)",
          className: "bg-rose-500/10 text-rose-500 border border-rose-500/20 cursor-not-allowed opacity-90",
          iconColor: "text-rose-500 fill-rose-500/20",
          disabled: true
        };
      }
    }
    return {
      label: "Make an Offer",
      className: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-955 cursor-pointer shadow-lg active:scale-95",
      iconColor: "text-stone-955 fill-stone-955 animate-pulse",
      disabled: false
    };
  }, [isListingActive, remainingOffers, isUserBlockedOrBanned, hubStatus, effectiveIsBuyer, cooldownRemainingSec]);

  const hasAcceptedOffer = useMemo(() => {
    const normalizedStatus = (status || '').toLowerCase().trim();
    if (['accepted', 'completed', 'concluded'].includes(normalizedStatus)) return true;
    return offers?.some(o => o.action === 'accept' || o.action === 'complete') || false;
  }, [status, offers]);

  // CENTRALIZED ACTION VISIBILITY ENGINE
  const allowedActions = useNegotiationActions({
    status,
    isBuyer: effectiveIsBuyer,
    isSeller: effectiveIsSeller,
    isAdmin: (isAdmin || currentPerspective === 'admin') && currentPerspective === 'admin',
    lastOfferBy,
    userId: simulatedUserId,
    remainingOffers,
    isKycVerified: !!sellerProfile?.isKycVerified,
    isBlocked: !!sellerProfile?.isBlocked,
    moderationStatus: negotiation?.moderationStatus as ModerationStatus,
    isNegotiationLocked: !!negotiation?.isLocked,
    isAuctionActive: isListingActive,
    isAuthenticated: !!userId,
    hasAcceptedOffer,
    sellerId: negotiation?.sellerId,
    buyerId: negotiation?.buyerId
  });

  const isYourTurn = useMemo(() => {
    if (!lastOfferBy || !offers || offers.length === 0) return false;
    const sellerId = negotiation?.sellerId;
    const senderIsSeller = lastOfferBy === sellerId || lastOfferBy === 'seller' || lastOfferBy === 'simulated-seller' || ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(lastOfferBy);
    
    if (effectiveIsSeller) {
      return !senderIsSeller;
    }
    if (effectiveIsBuyer) {
      return senderIsSeller;
    }
    return false;
  }, [lastOfferBy, offers, effectiveIsSeller, effectiveIsBuyer, negotiation?.sellerId]);

  const isOutofOffers = effectiveIsBuyer && remainingOffers <= 0;

  // Fetch real-time reports and audit logs for this specific negotiation if admin
  useEffect(() => {
    if (!(isAdmin || currentPerspective === 'admin') || !negotiation?.id) return;

    const reportsQuery = query(
      collection(db, 'arena_reports'),
      where('targetId', '==', negotiation.id)
    );
    const unsubReports = onSnapshot(reportsQuery, (snapshot) => {
      const docs = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setReports(docs);
    }, (error) => {
      console.error('Error fetching admin reports:', error);
    });

    const logsQuery = query(
      collection(db, 'arena_audit_logs'),
      where('targetId', '==', negotiation.id)
    );
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      const docs = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp)
        };
      });
      setAuditLogs(docs);
    }, (error) => {
      console.error('Error fetching admin audit logs:', error);
    });

    return () => {
      unsubReports();
      unsubLogs();
    };
  }, [isAdmin, currentPerspective, negotiation?.id]);

  // Calculate dynamic Risk Score
  const riskScoreDetails = useMemo(() => {
    let score = 15; // Baseline safe activity
    const factors: string[] = [];

    const activeReportsCount = reports.filter(r => r.status === 'pending').length;
    if (activeReportsCount > 0) {
      score += activeReportsCount * 25;
      factors.push(`+${activeReportsCount * 25}%: ${activeReportsCount} unresolved report(s)`);
    }

    if (auction?.startingPrice && negotiation?.lastOfferAmount) {
      const ratio = negotiation.lastOfferAmount / auction.startingPrice;
      if (ratio < 0.4) {
        score += 20;
        factors.push(`+20%: Extremely low offer (${Math.round(ratio * 100)}% of starting price)`);
      } else if (ratio > 2.5) {
        score += 15;
        factors.push(`+15%: High amount variance detected`);
      }
    }

    if (sellerProfile?.isBlocked) {
      score += 40;
      factors.push(`+40%: Counterparty account flagged/suspended`);
    }

    score = Math.min(100, Math.max(0, score));

    let level: 'LOW' | 'MEDIUM' | 'CRITICAL' = 'LOW';
    let color = 'text-emerald-500';
    let bg = 'bg-emerald-500/10 border-emerald-500/20';
    if (score > 60) {
      level = 'CRITICAL';
      color = 'text-rose-500';
      bg = 'bg-rose-500/10 border-rose-500/20 animate-pulse';
    } else if (score > 30) {
      level = 'MEDIUM';
      color = 'text-amber-500';
      bg = 'bg-amber-500/10 border-amber-500/20';
    }

    return { score, level, color, bg, factors };
  }, [reports, auction, negotiation, sellerProfile]);

  const handleAdminAction = async () => {
    if (!actionReason.trim()) {
      alert("A tactical justification/reason is required for this action.");
      return;
    }
    setAdminActionLoading(true);
    try {
      const targetUser = selectedTargetUser === 'buyer' ? negotiation?.buyerId : negotiation?.sellerId;
      
      switch (showAdminModal) {
        case 'warning':
          await ModerationService.executeModerationAction(
            userId,
            ModerationActionType.ISSUE_WARNING,
            'user',
            targetUser,
            `[Admin Warning] ${actionReason}`
          );
          alert(`Warning issued successfully to ${selectedTargetUser}.`);
          break;
        case 'suspend':
          await ModerationService.executeModerationAction(
            userId,
            ModerationActionType.SUSPEND_ACCOUNT,
            'user',
            targetUser,
            `[Admin Suspension] ${actionReason}`
          );
          alert(`Account suspended successfully for ${selectedTargetUser}.`);
          break;
        case 'ban':
          await ModerationService.executeModerationAction(
            userId,
            ModerationActionType.BAN_ACCOUNT,
            'user',
            targetUser,
            `[Admin Ban] ${actionReason}`
          );
          alert(`Account permanently banned for ${selectedTargetUser}.`);
          break;
        case 'force_close':
          await runTransaction(db, async (transaction) => {
            const negRef = doc(db, 'arena_negotiations', negotiation.id);
            transaction.update(negRef, {
              status: forceCloseType === 'completed' ? NegotiationStatus.COMPLETED : NegotiationStatus.CANCELLED,
              updatedAt: serverTimestamp()
            });

            await AuditLogService.createAuditLog(
              transaction,
              userId,
              forceCloseType === 'completed' ? ModerationActionType.RESUME_AUCTION : ModerationActionType.CANCEL_AUCTION,
              'negotiation',
              negotiation.id,
              String(negotiation.status),
              forceCloseType === 'completed' ? 'completed' : 'cancelled',
              `[Force Close: ${forceCloseType.toUpperCase()}] ${actionReason}`,
              []
            );
          });
          alert(`Negotiation forced to ${forceCloseType.toUpperCase()} status.`);
          break;
        case 'remove':
          await runTransaction(db, async (transaction) => {
            const negRef = doc(db, 'arena_negotiations', negotiation.id);
            transaction.update(negRef, {
              isPermanentlyRemoved: true,
              status: NegotiationStatus.CANCELLED,
              updatedAt: serverTimestamp()
            });

            await AuditLogService.createAuditLog(
              transaction,
              userId,
              ModerationActionType.REMOVE_LISTING,
              'negotiation',
              negotiation.id,
              String(negotiation.status),
              'removed',
              `[Removal] ${actionReason}`,
              []
            );
          });
          alert("Negotiation successfully marked as permanently removed.");
          break;
        default:
          break;
      }
      setShowAdminModal(null);
      setActionReason('');
    } catch (e: any) {
      console.error(e);
      alert(`Administrative Operation Failed: ${e.message}`);
    } finally {
      setAdminActionLoading(false);
    }
  };

  // Render logic based on user role and negotiation status
  const renderActions = () => {
    // 1. Admin Actions (Exclusive Hub)
    if ((isAdmin || currentPerspective === 'admin') && currentPerspective === 'admin') {
      return (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/5 pb-4 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-black text-rose-500 uppercase tracking-widest">TACTICAL AUDIT CONSOLE</h3>
              </div>
              <p className="text-[10px] text-stone-500 uppercase tracking-widest font-black">Authorized Personnel Only • Level 4 Access</p>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {(['view_negotiation', 'view_timeline', 'view_reports', 'audit_log'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAdminActiveTab(tab)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                    adminActiveTab === tab
                      ? "bg-rose-500 text-white"
                      : "bg-stone-900 text-stone-400 hover:text-white border border-stone-800"
                  )}
                >
                  {tab.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content 1: View Negotiation */}
          {adminActiveTab === 'view_negotiation' && (
            <div className="space-y-6">
              {/* Risk Score Widget */}
              <div className={cn("p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4", riskScoreDetails.bg)}>
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider">Automated Risk Score</span>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xl font-black italic", riskScoreDetails.color)}>{riskScoreDetails.score}%</span>
                    <span className={cn("text-xs font-black uppercase tracking-widest", riskScoreDetails.color)}>• {riskScoreDetails.level}</span>
                  </div>
                </div>
                <div className="text-[10px] text-stone-400 space-y-1">
                  {riskScoreDetails.factors.length > 0 ? (
                    riskScoreDetails.factors.map((f, i) => <p key={i}>• {f}</p>)
                  ) : (
                    <p>• Clean bilateral record. Safe activity level.</p>
                  )}
                </div>
              </div>

              {/* Negotiation Details Summary Table */}
              <div className="p-4 bg-stone-900/50 border border-white/5 rounded-2xl space-y-3">
                <h4 className="text-[10px] font-black uppercase text-stone-400 tracking-wider">Bilateral Negotiation Briefing</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-medium">
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-stone-500 uppercase tracking-wider text-[9px] font-black">Negotiation ID</span>
                      <span className="text-stone-300 font-mono text-[10px] truncate max-w-[150px]" title={negotiation?.id}>{negotiation?.id}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-stone-500 uppercase tracking-wider text-[9px] font-black">Buyer ID</span>
                      <span className="text-stone-300 font-mono text-[10px] truncate max-w-[150px]" title={negotiation?.buyerId}>{negotiation?.buyerId}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-stone-500 uppercase tracking-wider text-[9px] font-black">Seller ID</span>
                      <span className="text-stone-300 font-mono text-[10px] truncate max-w-[150px]" title={negotiation?.sellerId}>{negotiation?.sellerId}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-stone-500 uppercase tracking-wider text-[9px] font-black">Current State</span>
                      <span className="text-amber-500 uppercase font-black tracking-wider text-[10px]">{(status === 'accepted' || status === 'completed') ? 'CONCLUDED' : status.replace('_', ' ')}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-stone-500 uppercase tracking-wider text-[9px] font-black">Price set by seller</span>
                      <span className="text-white font-black italic">{sellerExactPrice > 0 ? formatPKR(sellerExactPrice, currencySymbol) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-stone-500 uppercase tracking-wider text-[9px] font-black">Latest Offer</span>
                      <span className="text-amber-400 font-black italic">{latestBuyerOfferAmount > 0 ? formatPKR(latestBuyerOfferAmount, currencySymbol) : 'No offers yet'}</span>
                    </div>
                    {effectiveIsBuyer && (
                      <div className="flex justify-between border-b border-white/5 pb-1">
                        <span className="text-stone-500 uppercase tracking-wider text-[9px] font-black">Remaining Offers</span>
                        <span className="text-stone-300 font-black">{remainingOffers} Left ({Math.max(0, 10 - remainingOffers)}/10 Used)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Category Selector */}
              <div className="bg-stone-900/50 p-1 rounded-xl border border-white/5 flex">
                <button
                  type="button"
                  onClick={() => setSelectedTargetUser('buyer')}
                  className={cn(
                    "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                    selectedTargetUser === 'buyer' ? "bg-stone-800 text-amber-500" : "text-stone-500 hover:text-stone-300"
                  )}
                >
                  Target Buyer (Anonymous User)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTargetUser('seller')}
                  className={cn(
                    "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                    selectedTargetUser === 'seller' ? "bg-stone-800 text-amber-500" : "text-stone-500 hover:text-stone-300"
                  )}
                >
                  Target Seller (Anonymous User)
                </button>
              </div>
            </div>
          )}

          {/* ... Rest of admin tab content remains the same ... */}

          {/* Tab Content 2: View Timeline */}
          {adminActiveTab === 'view_timeline' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setAdminActiveTab('view_negotiation')}
                    className="p-2 bg-stone-900 border border-white/5 rounded-xl text-stone-500 hover:text-white transition-all hover:border-white/10"
                    title="Back to Briefing"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">Chronological Operations Log ({offers.length} event(s))</h4>
                </div>
              </div>
              
              {offers.length === 0 ? (
                <div className="p-6 text-center bg-stone-900/20 border border-dashed border-stone-800 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-stone-500 tracking-wider">No active event log history</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-none">
                  {offers.map((offer, index) => {
                    const sellerId = negotiation?.sellerId;
                    const isSellerOffer = offer.senderId === sellerId || offer.senderId === 'seller' || offer.senderId === 'simulated-seller' || ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(offer.senderId);
                    const isBuyerOffer = !isSellerOffer;
                    return (
                      <div key={offer.id || index} className="p-3 bg-stone-900 border border-white/5 rounded-xl space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-black">
                          <span className={isBuyerOffer ? "text-amber-500" : "text-emerald-500"}>
                            {isBuyerOffer ? "BUYER ACTION" : "SELLER ACTION"} • {offer.action.toUpperCase()}
                          </span>
                          <span className="text-stone-500 font-mono">
                            {offer.createdAt?.toDate ? offer.createdAt.toDate().toLocaleString() : 'Pending'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-stone-300 font-bold">
                            Offer Amount: <span className="text-white italic">{formatPKR(offer.amount, (offer as any).currencySymbol || (offer as any).currency || currencySymbol)}</span>
                          </p>
                        </div>
                        {offer.message && (
                          <p className="text-[11px] text-stone-400 bg-stone-955/40 p-2 rounded-lg border border-white/5 mt-1 font-medium leading-relaxed">
                            {offer.message}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab Content 3: View Reports */}
          {adminActiveTab === 'view_reports' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setAdminActiveTab('view_negotiation')}
                  className="p-2 bg-stone-900 border border-white/5 rounded-xl text-stone-500 hover:text-white transition-all hover:border-white/10"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">Target Reports ({reports.length})</h4>
              </div>
              {reports.length === 0 ? (
                <div className="p-6 text-center bg-stone-900/20 border border-dashed border-stone-800 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-stone-500 tracking-wider">No active incidents filed</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[250px] overflow-y-auto scrollbar-none">
                  {reports.map((report) => (
                    <div key={report.id} className="p-4 bg-stone-900 border border-white/5 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black">
                        <span className="text-rose-500 uppercase tracking-widest">{report.reason || 'General Report'}</span>
                        <span className="text-stone-500 uppercase">{report.status}</span>
                      </div>
                      <p className="text-xs text-stone-300 leading-relaxed font-medium">{report.details || report.notes || 'No notes provided.'}</p>
                      <p className="text-[9px] text-stone-500 uppercase font-black tracking-widest">
                        Reporter: {report.reporterId?.slice(0, 6).toUpperCase()} • Created: {report.createdAt?.toDate ? report.createdAt.toDate().toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Content 4: Audit Log */}
          {adminActiveTab === 'audit_log' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setAdminActiveTab('view_negotiation')}
                  className="p-2 bg-stone-900 border border-white/5 rounded-xl text-stone-500 hover:text-white transition-all hover:border-white/10"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">Moderation Audit Logs ({auditLogs.length})</h4>
              </div>
              {auditLogs.length === 0 ? (
                <div className="p-6 text-center bg-stone-900/20 border border-dashed border-stone-800 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-stone-500 tracking-wider">No action history recorded</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[250px] overflow-y-auto scrollbar-none">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-4 bg-stone-900 border border-white/5 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-black">
                        <span className="text-amber-500 uppercase tracking-wider">{log.action}</span>
                        <span className="text-stone-500">{log.timestamp instanceof Date ? log.timestamp.toLocaleString() : 'N/A'}</span>
                      </div>
                      <p className="text-xs text-stone-300 leading-relaxed font-semibold">{log.reason || 'No justification stated.'}</p>
                      <div className="flex gap-4 text-[9px] text-stone-500 uppercase font-black">
                        <span>Prev: {log.previousState}</span>
                        <span>Next: {log.newState}</span>
                        <span>Admin: {log.moderatorId?.slice(0, 6).toUpperCase()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Interactive Modal for Admin Actions */}
          {showAdminModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
              <div className="bg-stone-900 border border-red-500/20 rounded-[2rem] max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative">
                <button 
                  type="button"
                  onClick={() => { setShowAdminModal(null); setActionReason(''); }}
                  className="absolute top-4 right-4 p-2 hover:bg-stone-800 rounded-xl text-stone-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center text-rose-500 mx-auto">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tighter">
                    Authorized Action: {showAdminModal.toUpperCase().replace('_', ' ')}
                  </h3>
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">
                    Target: {showAdminModal === 'force_close' || showAdminModal === 'remove' ? 'Bilateral Negotiation' : `${selectedTargetUser.toUpperCase()} (${(selectedTargetUser === 'buyer' ? negotiation?.buyerId : negotiation?.sellerId)?.slice(0, 8).toUpperCase()})`}
                  </p>
                </div>

                {showAdminModal === 'force_close' && (
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase text-stone-400 tracking-wider">Select Resolution State</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setForceCloseType('cancelled')}
                        className={cn(
                          "py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all",
                          forceCloseType === 'cancelled'
                            ? "bg-rose-500 text-white border-rose-400"
                            : "bg-stone-950 text-stone-400 border-white/5"
                        )}
                      >
                        Force Cancelled
                      </button>
                      <button
                        type="button"
                        onClick={() => setForceCloseType('completed')}
                        className={cn(
                          "py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all",
                          forceCloseType === 'completed'
                            ? "bg-emerald-600 text-white border-emerald-500"
                            : "bg-stone-950 text-stone-400 border-white/5"
                        )}
                      >
                        Force Completed
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-stone-400 tracking-[0.2em] ml-2">Audit Justification (Required)</label>
                  <textarea 
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Enter precise tactical, policy-backed justification for this decision..."
                    rows={3}
                    className="w-full bg-stone-955 border border-white/5 rounded-2xl px-6 py-4 text-white font-medium text-sm placeholder:text-stone-700 focus:border-rose-500/50 outline-none transition-all resize-none shadow-inner"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ArenaButton 
                    variant="outline" 
                    onClick={() => { setShowAdminModal(null); setActionReason(''); }} 
                    className="border-stone-800 text-stone-300"
                    disabled={adminActionLoading}
                  >
                    Abort
                  </ArenaButton>
                  <button 
                    type="button"
                    onClick={handleAdminAction} 
                    className="w-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2"
                    disabled={adminActionLoading || !actionReason.trim()}
                  >
                    {adminActionLoading ? 'Executing...' : 'Execute Protocol'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Helper to get beautiful, state-specific title and description
    const getStatusDisplay = () => {
      const isForceStopped = 
        hubStatus.label === 'Closed On Violation' ||
        hubStatus.label === 'Force stopped by the admin on violating the policies' ||
        hubStatus.label.includes('Force stopped') ||
        (auction as any)?.forceStopped ||
        (auction as any)?.isForceStopped ||
        (auction as any)?.forceStoppedByAdmin ||
        (auction as any)?.closedOnViolation ||
        (negotiation as any)?.forceStopped ||
        (negotiation as any)?.isForceStopped ||
        (negotiation as any)?.forceStoppedByAdmin ||
        (negotiation as any)?.closedOnViolation ||
        auction?.status === 'stopped' ||
        auction?.status === 'force_stopped';

      if (isForceStopped) {
        return {
          title: "Force Stopped by Admin on Violating Policies",
          desc: "This listed item has been Force Stopped by the admin due to seller policy violations. Bidding is stopped and chat/negotiation facility with top 3 bidders is disabled.",
          color: "border-rose-500/30 bg-rose-500/10",
          accentColor: "text-rose-500",
          icon: ShieldAlert
        };
      }

      switch (status) {
        case NegotiationStatus.OPEN:
        case NegotiationStatus.OFFER_SENT:
          if (!offers || offers.length === 0 || !lastOfferBy) {
            return {
              title: "No Offers Submitted Yet",
              desc: effectiveIsBuyer 
                ? "No tactical offers have been submitted for this item yet. Submit a proposal to start negotiating." 
                : "No tactical offers have been received for this item yet. Buyers can submit proposals here.",
              color: "border-blue-500/20 bg-blue-500/5",
              accentColor: "text-blue-500",
              icon: Activity
            };
          }
          if (status === NegotiationStatus.OPEN) {
            if (lastOfferBy === simulatedUserId) {
              return {
                title: "Offer Under Process",
                desc: "Your submitted offer is under process. You cannot send another offer until the counterparty accepts, rejects, or counters.",
                color: "border-amber-500/20 bg-amber-500/5",
                accentColor: "text-amber-500",
                icon: Clock
              };
            }
            return {
              title: "Channel Activated",
              desc: "The private negotiation channel has been initialized. Ready for initial proposals.",
              color: "border-blue-500/20 bg-blue-500/5",
              accentColor: "text-blue-500",
              icon: Activity
            };
          }
          return {
            title: isYourTurn ? "Incoming Tactical Offer" : "Offer Under Process",
            desc: isYourTurn 
              ? "An offer has been submitted by the counterparty. Your operational response is required." 
              : "Your submitted offer is under process and awaiting response. You cannot send another offer until it is responded to, rejected, or expired.",
            color: isYourTurn ? "border-amber-500/20 bg-amber-500/5" : "border-stone-800 bg-stone-900/40",
            accentColor: isYourTurn ? "text-amber-500" : "text-stone-400",
            icon: isYourTurn ? Send : Clock
          };
        case NegotiationStatus.COUNTER_OFFERED:
          return {
            title: isYourTurn ? "Incoming Counter-Proposal" : "Counter Offer Under Process",
            desc: isYourTurn
              ? "A counter-proposal has been returned by the counterparty. Your decision is required."
              : "Your counter offer is under process and awaiting response. You cannot send another offer until it is responded to, rejected, or expired.",
            color: isYourTurn ? "border-purple-500/20 bg-purple-500/5" : "border-stone-800 bg-stone-900/40",
            accentColor: isYourTurn ? "text-purple-500" : "text-stone-400",
            icon: isYourTurn ? Send : Clock
          };
        case NegotiationStatus.ACCEPTED:
        case NegotiationStatus.COMPLETED:
          return {
            title: "Offer Concluded",
            desc: effectiveIsBuyer 
              ? "Your offer has been successfully accepted and concluded. No further offers or changes can be made. Coordinate via private deal chat, view agreement, or request contact."
              : "You have accepted this offer. The deal is concluded and locked. Coordinate via private deal chat, view agreement, or share contact info.",
            color: "border-emerald-500/20 bg-emerald-500/5",
            accentColor: "text-emerald-500",
            icon: Check
          };
        case NegotiationStatus.DECLINED:
          return {
            title: "Bilateral Proposal Declined",
            desc: "The active proposal was rejected. This private negotiation has been closed.",
            color: "border-rose-500/20 bg-rose-500/5",
            accentColor: "text-rose-500",
            icon: X
          };
        case NegotiationStatus.WITHDRAWN:
          return {
            title: "Tactical Offer Withdrawn",
            desc: "The active proposal has been retracted by the sender. This channel is now closed.",
            color: "border-stone-800 bg-stone-900/20",
            accentColor: "text-stone-500",
            icon: ShieldAlert
          };
        case NegotiationStatus.COMPLETED:
          return {
            title: "Offer Concluded",
            desc: "The transaction and offer have been successfully concluded. No further offers or changes can be made.",
            color: "border-emerald-500/30 bg-emerald-500/10",
            accentColor: "text-emerald-500",
            icon: ClipboardList
          };
        case NegotiationStatus.CANCELLED:
          return {
            title: "Negotiation Decommissioned",
            desc: "Operations canceled. The bilateral channel has been permanently dismantled.",
            color: "border-stone-800 bg-stone-900/20",
            accentColor: "text-stone-500",
            icon: Ban
          };
        case NegotiationStatus.EXPIRED:
          return {
            title: "Tactical Window Lapsed",
            desc: "The negotiation has expired due to time constraints. Communication lines are now locked.",
            color: "border-stone-800 bg-stone-900/20",
            accentColor: "text-stone-500",
            icon: Clock
          };
        default:
          return null;
      }
    };

    const statusConfig = getStatusDisplay();
    if (!statusConfig) return null;

    const StatusIcon = statusConfig.icon;

    // Check if the active/last offer was submitted by the current user/buyer
    const senderIsSeller = Boolean(
      lastOfferBy && (
        lastOfferBy === negotiation?.sellerId ||
        lastOfferBy === auction?.sellerId ||
        lastOfferBy === 'seller' ||
        lastOfferBy === 'simulated-seller' ||
        ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(lastOfferBy)
      )
    );

    const isOwnActiveOffer = Boolean(
      (effectiveIsBuyer && (
        !senderIsSeller ||
        lastOfferBy === simulatedUserId ||
        lastOfferBy === userId ||
        lastOfferBy === negotiation?.buyerId ||
        lastOfferBy === 'buyer' ||
        lastOfferBy === 'simulated-buyer' ||
        (!isYourTurn && offers && offers.length > 0)
      )) ||
      (effectiveIsSeller && (
        senderIsSeller ||
        lastOfferBy === simulatedUserId ||
        lastOfferBy === userId ||
        lastOfferBy === negotiation?.sellerId
      ))
    );

    // ACTION DEFINITIONS MAPPED TO IDS
    const actionRegistry: Record<NegotiationActionType, React.ReactNode> = {
      make_offer: (
        <ThreeDButton
          key="make-offer"
          type="button"
          disabled={!user ? false : (makeOfferBtnConfig.disabled || effectiveIsSeller)}
          onClick={() => {
            if (!user) {
              setShowAuthRequiredModal(true);
              return;
            }
            if (makeOfferBtnConfig.disabled || effectiveIsSeller) return;
            setShowCounterInput(true);
          }}
          label={makeOfferBtnConfig.label}
          icon={Send}
          variant={!user ? "amber" : ((makeOfferBtnConfig.disabled || effectiveIsSeller) ? "dark" : "amber")}
          size="md"
          fullWidth={true}
          className="w-full text-xs"
        />
      ),
      accept: (
        <button
          key="accept"
          type="button"
          onClick={() => {
            if (!user) {
              setShowAuthRequiredModal(true);
              return;
            }
            setShowAcceptModal(true);
          }}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-500/15 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Check className="w-4 h-4" /> {effectiveIsSeller ? 'Accept offer' : (effectiveIsBuyer ? 'Accept Counter' : 'Accept')}
        </button>
      ),
      counter: (
        <button
          key="counter"
          type="button"
          disabled={!user ? false : (remainingOffers <= 0 || !isListingActive || (effectiveIsBuyer && cooldownRemainingSec > 0))}
          onClick={() => {
            if (!user) {
              setShowAuthRequiredModal(true);
              return;
            }
            if (remainingOffers <= 0 || !isListingActive) return;
            if (effectiveIsBuyer && cooldownRemainingSec > 0) {
              alert(`Cooldown Active: Please wait ${cooldownRemainingSec} second${cooldownRemainingSec > 1 ? 's' : ''} before resubmitting an offer. Time between submitted offers must be at least 15 seconds.`);
              return;
            }
            setShowCounterInput(true);
          }}
          className={cn(
            "w-full rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
            user && (remainingOffers <= 0 || !isListingActive || (effectiveIsBuyer && cooldownRemainingSec > 0))
              ? "bg-stone-800 text-stone-500 border border-stone-700 cursor-not-allowed opacity-80"
              : "bg-stone-900 border border-amber-500/30 text-amber-500 hover:bg-stone-850 active:scale-95 cursor-pointer"
          )}
        >
          <Send className="w-4 h-4" /> {(effectiveIsBuyer && cooldownRemainingSec > 0) ? `Wait ${cooldownRemainingSec}s (15s Cooldown)` : (effectiveIsSeller ? 'Counter offer' : (effectiveIsBuyer ? 'Counter Again' : 'Counter Offer'))}
        </button>
      ),
      decline: (
        <button
          key="decline"
          type="button"
          onClick={() => onRespond('decline', simulatedUserId)}
          className="w-full bg-stone-900 border border-rose-500/20 text-rose-500 hover:bg-stone-850 rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <X className="w-4 h-4" /> {effectiveIsSeller ? 'Reject/ decline offer' : 'Decline'}
        </button>
      ),
      withdraw: (
        <button
          key="withdraw"
          type="button"
          onClick={() => onRespond('withdraw', simulatedUserId)}
          className="w-full bg-stone-900 border border-stone-800 text-stone-400 hover:text-white rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <ShieldAlert className="w-4 h-4" /> Withdraw Offer
        </button>
      ),
      complete: (
        <button
          key="complete"
          type="button"
          onClick={() => onComplete(simulatedUserId)}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" /> Complete Deal
        </button>
      ),
      send_message: (
        <button
          key="send-message"
          type="button"
          onClick={onSendMessage}
          className="w-full bg-stone-900 border border-stone-800 text-stone-400 hover:text-white rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <MessageSquare className="w-4 h-4" /> Send Message
        </button>
      ),
      view_agreement: (
        <button
          key="view-agreement"
          id="view-agreement-btn-main"
          type="button"
          onClick={() => setShowAgreementModal(true)}
          className="w-full bg-stone-900 border border-emerald-500/20 text-emerald-500 hover:bg-stone-850 rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <FileText className="w-4 h-4" /> View Agreement
        </button>
      ),
      contact: (
        <button
          key="contact"
          id="contact-btn-main"
          type="button"
          disabled={!effectiveIsBuyer && !negotiation?.contactRequested && !negotiation?.contactShared}
          onClick={() => setShowContactModal(true)}
          className={cn(
            "w-full rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 min-h-[48px]",
            !effectiveIsBuyer && !negotiation?.contactRequested && !negotiation?.contactShared
              ? "bg-stone-900/60 border border-stone-800/80 text-stone-500 cursor-not-allowed opacity-75"
              : negotiation?.contactRequested && !negotiation?.contactShared && !effectiveIsBuyer
              ? "bg-amber-500 hover:bg-amber-400 text-stone-955 shadow-lg shadow-amber-500/20 font-black animate-pulse cursor-pointer"
              : "bg-stone-900 border border-stone-800 text-stone-300 hover:text-white cursor-pointer"
          )}
        >
          <Phone className="w-4 h-4" />
          {effectiveIsBuyer ? (
            negotiation?.contactShared
              ? 'View Shared Contact Info'
              : negotiation?.contactRequested
              ? 'Contact Info Requested'
              : 'Request Contact Information'
          ) : (
            negotiation?.contactShared
              ? 'View / Update Shared Contact'
              : negotiation?.contactRequested
              ? 'Share Contact Info (Requested!)'
              : 'Waiting for Buyer Contact Request'
          )}
        </button>
      ),
      report: isOwnActiveOffer ? null : (
        <ReportButton
          key="report"
          targetId={negotiation?.id || auction?.id || 'negotiation'}
          targetType="negotiation"
          targetTitle={`Negotiation: ${auction?.title || negotiation?.itemTitle || 'Asset Negotiation'}`}
          targetOwnerId={effectiveIsSeller ? negotiation?.buyerId : negotiation?.sellerId}
          variant="outline"
          label="Report"
          className="w-full bg-stone-900 border border-rose-500/20 text-rose-400 hover:bg-stone-850 rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 min-h-[48px]"
        />
      ),
      view_auction: (
        <button
          key="view-auction"
          type="button"
          onClick={() => window.open(`/auction/${auction?.id}`, '_blank')}
          className="w-full bg-stone-900 border border-stone-800 text-stone-400 hover:text-white rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <ExternalLink className="w-4 h-4" /> View Original Auction
        </button>
      ),
      view_timeline: null,
      admin_warning: null,
      admin_suspend: null,
      admin_ban: null,
      admin_force_close: null,
      admin_remove: null
    };

    // Filter action list to ensure:
    // 1. We don't render admin-perspective action IDs in the user/seller view
    // 2. CRITICAL RULE: The exact user/buyer who submitted the offer cannot report their own submitted offer
    const visibleActionIds = allowedActions.filter(id => {
      if (id.startsWith('admin_')) return false;
      if (id === 'report' && isOwnActiveOffer) return false;
      return true;
    }) as NegotiationActionType[];

    return (
      <div className="space-y-6">

        {/* Section Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <h3 className="text-xs font-black uppercase text-stone-200 tracking-[0.2em]">
              Negotiation Control Center
            </h3>
          </div>
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
            Active Control Hub
          </span>
        </div>

        {/* Dynamic State Machine Header Card */}
        <div className={cn(
          "p-6 rounded-[2rem] border transition-all duration-300 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6",
          statusConfig.color
        )}>
          {/* Ambient background glow */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-gradient-to-tr from-current to-transparent" />
          
          <div className="flex items-start gap-4">
            <div className={cn(
              "p-3 rounded-2xl border shrink-0 bg-stone-955/80 border-white/5 flex items-center justify-center",
              statusConfig.accentColor
            )}>
              <StatusIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest bg-white/5 text-stone-400 px-2 py-0.5 rounded">
                  STATE: {['accepted', 'completed', 'concluded'].includes((status || '').toLowerCase()) ? 'ACCEPTED & CONCLUDED' : (!offers || offers.length === 0 || !lastOfferBy) ? 'NO OFFERS YET' : status.replace('_', ' ').toUpperCase()}
                </span>
                {isYourTurn && (status === NegotiationStatus.OFFER_SENT || status === NegotiationStatus.COUNTER_OFFERED) && (
                  <span className="text-[9px] font-black uppercase tracking-widest bg-amber-500/15 text-amber-500 px-2 py-0.5 rounded animate-pulse">
                    YOUR TURN
                  </span>
                )}
              </div>
              <h4 className="text-base font-black text-white uppercase italic tracking-tight">
                {statusConfig.title}
              </h4>
              <p className="text-[11px] text-stone-400 font-medium leading-relaxed max-w-xl">
                {statusConfig.desc}
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Warn / Notification Banners */}
        {effectiveIsBuyer && remainingOffers <= 0 && (status === NegotiationStatus.OFFER_SENT || status === NegotiationStatus.COUNTER_OFFERED) && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-rose-400 uppercase leading-relaxed">
              Limit Exhausted: You have reached the maximum bilateral protocol limit of 10 offers. You cannot counter-offer further, but you may accept the current proposal, decline, or send messages.
            </p>
          </div>
        )}

        {/* Action Button Grid - Mobile-friendly responsive grid */}
        <div className={cn(
          "grid gap-3 w-full",
          visibleActionIds.length === 1 
            ? "grid-cols-1 sm:max-w-xs" 
            : visibleActionIds.length === 2 
            ? "grid-cols-1 sm:grid-cols-2" 
            : "grid-cols-2 sm:grid-cols-3"
        )}>
          {visibleActionIds.map(id => (
            <div key={id} className="w-full">
              {actionRegistry[id]}
            </div>
          ))}
        </div>

        {/* Tactical Footnote */}
        <div className="flex items-center justify-center gap-2 py-4 border-t border-white/5">
          <Lock className="w-3 h-3 text-stone-600" />
          <span className="text-[9px] font-black uppercase text-stone-600 tracking-[0.3em]">Encrypted Channel • Level 4 Clearance</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">

      {/* Primary Action Buttons Container */}
      {!showCounterInput && (
        <div className="space-y-4">
          {renderActions()}
        </div>
      )}

      {/* Counter / Strategic Offer Input Interface */}
      {showCounterInput && !effectiveIsSeller && (
        <div className="p-6 sm:p-8 bg-stone-950 border border-amber-500/20 rounded-[2.5rem] space-y-6 shadow-2xl shadow-amber-500/10 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5 text-amber-500" />
              <h4 className="text-lg font-black text-white uppercase italic tracking-tighter">
                {(!offers || offers.length === 0 || status === NegotiationStatus.OPEN) ? 'Make an Offer' : 'Draft Counter Proposal'}
              </h4>
            </div>
            <button 
              type="button"
              onClick={() => setShowCounterInput(false)} 
              className="p-2 hover:bg-stone-800 rounded-xl transition-colors text-stone-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-stone-400 tracking-[0.2em] ml-4">
                {(!offers || offers.length === 0 || status === NegotiationStatus.OPEN) ? `Proposed Offer Amount (${currencyCode})` : `Counter Amount (${currencyCode})`}
              </label>
              <input 
                type="number"
                step="any"
                min="0.01"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && counterAmount && parseFloat(counterAmount) > 0) {
                    e.preventDefault();
                    setShowConfirmOfferModal(true);
                  }
                }}
                placeholder={`Enter offer amount in ${currencyCode}...`}
                className="w-full bg-stone-900 border border-white/5 rounded-2xl px-6 py-4 text-white font-black text-base placeholder:text-stone-700 focus:border-amber-500/50 outline-none transition-all shadow-inner"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-stone-400 tracking-[0.2em] ml-4">Tactical Message (Optional)</label>
              <textarea 
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Provide optional strategic context or terms..."
                rows={3}
                className="w-full bg-stone-900 border border-white/5 rounded-2xl px-6 py-4 text-white font-medium text-sm placeholder:text-stone-700 focus:border-amber-500/50 outline-none transition-all resize-none shadow-inner"
              />
            </div>
            <ThreeDButton 
              type="button"
              variant="amber"
              size="md"
              fullWidth={true}
              className="w-full text-xs"
              disabled={!counterAmount || parseFloat(counterAmount) <= 0}
              onClick={() => {
                setShowConfirmOfferModal(true);
              }}
              icon={Send}
              label={(!offers || offers.length === 0 || status === NegotiationStatus.OPEN) ? 'Make an Offer' : 'Send Counter Offer'}
            />
          </div>
        </div>
      )}

      {/* Reusable Confirmation Modal for Submitting Offer */}
      <OfferConfirmationModal
        isOpen={showConfirmOfferModal}
        onClose={() => setShowConfirmOfferModal(false)}
        onConfirm={async () => {
          const finalMsg = message.trim() || `Proposed offer: ${formatPKR(Number(counterAmount), currencySymbol)}`;
          await onCounter(parseFloat(counterAmount), finalMsg, simulatedUserId);
          setShowCounterInput(false);
          setCounterAmount('');
          setMessage('');
        }}
        amount={counterAmount}
        currencySymbol={currencySymbol}
        title="Are you sure?"
        message="Are you sure you want to submit this offer?"
        confirmText="Yes, Send Offer"
        cancelText="Cancel"
        creditCost={(!offers || offers.length === 0 || status === NegotiationStatus.OPEN) ? 1 : 0}
      />

      {/* View Agreement Modal */}
      {showAgreementModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in">
          <div className="bg-stone-900 border border-white/10 rounded-2xl sm:rounded-[2rem] max-w-lg w-full max-h-[95vh] flex flex-col shadow-2xl relative overflow-hidden">
            
            {/* Header / Dismiss */}
            <div className="p-4 sm:p-6 pb-2 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-11 sm:h-11 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
                  <FileText className="w-5 h-5 sm:w-5.5 sm:h-5.5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white uppercase italic tracking-tighter leading-none">Bilateral Agreement</h3>
                  <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mt-1">Official Record • ID: {negotiation?.id?.slice(0, 10) || 'N/A'}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAgreementModal(false)}
                className="p-1.5 hover:bg-stone-800 rounded-xl text-stone-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Agreement Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1 min-h-0">
              
              {/* Asset / Pricing Grid */}
              <div className="p-3 sm:p-4 bg-stone-950 border border-white/5 rounded-xl sm:rounded-2xl space-y-3 sm:space-y-4">
                <div className="flex flex-col xs:flex-row xs:justify-between xs:items-center text-xs pb-2 border-b border-white/5 gap-1">
                  <span className="font-bold text-stone-500 uppercase tracking-wider text-[10px]">Asset</span>
                  <span className="font-black text-white uppercase truncate max-w-full xs:max-w-[200px]" title={auction?.title}>
                    {auction?.title || `Strategic Asset ${negotiation?.auctionId?.slice(0, 6) || 'N/A'}`}
                  </span>
                </div>
                
                <div className="flex flex-col xs:flex-row xs:justify-between xs:items-center text-xs pb-2 border-b border-white/5 gap-1">
                  <span className="font-bold text-stone-500 uppercase tracking-wider text-[10px]">Agreed Value</span>
                  <span className="font-black text-emerald-500 text-sm sm:text-base">{formatPKR(negotiation?.lastOfferAmount, currencySymbol)}</span>
                </div>
                
                <div className="flex flex-col xs:flex-row xs:justify-between xs:items-center text-xs pb-2 border-b border-white/5 gap-1">
                  <span className="font-bold text-stone-500 uppercase tracking-wider text-[10px]">Buyer Identity</span>
                  <span className="font-black text-white uppercase text-[11px]">Anonymous User</span>
                </div>
                
                <div className="flex flex-col xs:flex-row xs:justify-between xs:items-center text-xs gap-1">
                  <span className="font-bold text-stone-500 uppercase tracking-wider text-[10px]">Seller Identity</span>
                  <span className="font-black text-white uppercase text-[11px]">Anonymous User</span>
                </div>
              </div>

              {/* Binding Terms */}
              <div className="space-y-2">
                <p className="text-[10px] sm:text-xs font-black uppercase text-stone-400 tracking-wider">Binding Protocol Terms:</p>
                <div className="text-[10px] sm:text-xs text-stone-500 space-y-2 leading-relaxed bg-stone-950/35 p-3 rounded-xl border border-white/5">
                  <p className="flex gap-2">
                    <span className="text-emerald-500 shrink-0">•</span>
                    <span>Escrow and ownership transfer protocols will initiate automatically upon verified full payment.</span>
                  </p>
                  <p className="flex gap-2">
                    <span className="text-emerald-500 shrink-0">•</span>
                    <span>Standard 24-hour tactical inspection, verification, and rating window is now active.</span>
                  </p>
                  <p className="flex gap-2">
                    <span className="text-emerald-500 shrink-0">•</span>
                    <span>Both contracting parties agree to binding bilateral dispute resolution codes and terms of use.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div className="p-4 sm:p-6 border-t border-white/5 bg-stone-900/90 flex flex-col gap-2 shrink-0 w-full">
              {effectiveIsBuyer && status === NegotiationStatus.ACCEPTED ? (
                <button
                  key="finalize-deal-btn"
                  type="button"
                  onClick={() => {
                    setShowAgreementModal(false);
                    onComplete(simulatedUserId);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-xs py-3 rounded-xl transition-all shadow-lg shadow-emerald-600/20 active:scale-95 text-center flex items-center justify-center min-h-[44px]"
                >
                  Finalize Deal
                </button>
              ) : (
                <ArenaButton 
                  variant="primary" 
                  onClick={() => setShowAgreementModal(false)} 
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl text-xs font-black tracking-widest uppercase min-h-[44px]"
                >
                  Acknowledge
                </ArenaButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Secure Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-stone-900 border border-white/10 rounded-[2rem] max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => {
                setShowContactModal(false);
                setContactFormError(null);
                setContactSuccessMsg(null);
              }}
              className="absolute top-4 right-4 p-2 hover:bg-stone-800 rounded-xl text-stone-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500 mx-auto">
                <Phone className="w-6 h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tighter">
                {effectiveIsBuyer ? 'Seller Contact Details' : 'Share Contact Details'}
              </h3>
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">
                Post-Acceptance Contact Exchange
              </p>
            </div>

            {contactSuccessMsg && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400 text-xs font-bold">
                <Check className="w-5 h-5 shrink-0" />
                <span>{contactSuccessMsg}</span>
              </div>
            )}

            {contactFormError && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-xs font-bold">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{contactFormError}</span>
              </div>
            )}

            {/* BUYER VIEW */}
            {effectiveIsBuyer ? (
              <div className="space-y-4">
                {negotiation?.contactShared && negotiation?.sharedContactDetails ? (
                  <div className="p-5 bg-stone-955 border border-white/5 rounded-2xl space-y-4">
                    <p className="text-[10px] font-black uppercase text-amber-500 tracking-wider">
                      Shared Seller Information
                    </p>
                    <div className="space-y-3 divide-y divide-white/5">
                      <div className="pt-2 first:pt-0">
                        <p className="text-[10px] font-bold text-stone-500 uppercase">Seller Name</p>
                        <p className="text-sm font-black text-white">
                          {negotiation.sharedContactDetails.name || 'Not provided'}
                        </p>
                      </div>
                      <div className="pt-2">
                        <p className="text-[10px] font-bold text-stone-500 uppercase">Contact Number</p>
                        <p className="text-sm font-black text-amber-400">
                          {negotiation.sharedContactDetails.phone || 'Not provided'}
                        </p>
                      </div>
                      <div className="pt-2">
                        <p className="text-[10px] font-bold text-stone-500 uppercase">Email Address</p>
                        <p className="text-sm font-black text-stone-300">
                          {negotiation.sharedContactDetails.email || 'Not provided'}
                        </p>
                      </div>
                      <div className="pt-2">
                        <p className="text-[10px] font-bold text-stone-500 uppercase">Address</p>
                        <p className="text-xs font-medium text-stone-300 leading-relaxed whitespace-pre-wrap">
                          {negotiation.sharedContactDetails.address || 'Not provided'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : negotiation?.contactRequested ? (
                  <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center space-y-3">
                    <Clock className="w-8 h-8 text-amber-500 mx-auto animate-pulse" />
                    <p className="text-xs font-black text-white uppercase tracking-wider">
                      Contact Information Requested
                    </p>
                    <p className="text-xs text-stone-400 leading-relaxed">
                      You have requested the seller to share their contact details. The seller has been notified.
                    </p>
                  </div>
                ) : (
                  <div className="p-6 bg-stone-955 border border-white/5 rounded-2xl text-center space-y-4">
                    <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
                    <div className="space-y-1">
                      <p className="text-xs font-black text-white uppercase tracking-wider">
                        Contact Details Not Shared Yet
                      </p>
                      <p className="text-xs text-stone-400 leading-relaxed">
                        When an offer is accepted, seller contact information is not automatically shown. Send a formal request to the seller to share their contact information.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={contactSubmitting}
                      onClick={async () => {
                        setContactSubmitting(true);
                        setContactFormError(null);
                        try {
                          if (onRequestContact) {
                            await onRequestContact(simulatedUserId);
                          }
                          setContactSuccessMsg('Request sent successfully to seller!');
                        } catch (err: any) {
                          setContactFormError(err.message || 'Failed to request contact details');
                        } finally {
                          setContactSubmitting(false);
                        }
                      }}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-2xl py-3.5 px-6 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                      {contactSubmitting ? 'Sending Request...' : 'Request Contact Information'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* SELLER VIEW: Share/Update Contact Form */
              <div className="space-y-4">
                {negotiation?.contactRequested && !negotiation?.contactShared && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3 text-amber-400 text-xs font-bold">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>The buyer has requested your contact information! Please provide at least one contact detail below.</span>
                  </div>
                )}

                {!negotiation?.contactRequested && !negotiation?.contactShared && (
                  <div className="p-4 bg-stone-900 border border-white/10 rounded-xl flex items-center gap-3 text-stone-400 text-xs font-medium">
                    <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                    <span>The buyer has not requested contact information yet. As the seller, you will be able to share your contact details once the buyer submits a request.</span>
                  </div>
                )}
                
                <p className="text-xs text-stone-400">
                  Select which contact information to share with the buyer. <span className="text-amber-400 font-bold">At least one field is mandatory</span> to submit.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">
                      1. Name (Optional)
                    </label>
                    <input
                      type="text"
                      disabled={!negotiation?.contactRequested && !negotiation?.contactShared}
                      value={shareName}
                      onChange={(e) => setShareName(e.target.value)}
                      placeholder="e.g. Full Name / Business Name"
                      className="w-full bg-stone-955 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-amber-500 outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">
                      2. Contact Number (Optional)
                    </label>
                    <input
                      type="text"
                      disabled={!negotiation?.contactRequested && !negotiation?.contactShared}
                      value={sharePhone}
                      onChange={(e) => setSharePhone(e.target.value)}
                      placeholder="e.g. +1 (555) 000-1122"
                      className="w-full bg-stone-955 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-amber-500 outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">
                      3. Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      disabled={!negotiation?.contactRequested && !negotiation?.contactShared}
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder="e.g. seller@example.com"
                      className="w-full bg-stone-955 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-amber-500 outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">
                      4. Address (Optional)
                    </label>
                    <textarea
                      rows={2}
                      disabled={!negotiation?.contactRequested && !negotiation?.contactShared}
                      value={shareAddress}
                      onChange={(e) => setShareAddress(e.target.value)}
                      placeholder="e.g. Physical Address / Pickup Location"
                      className="w-full bg-stone-955 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-amber-500 outline-none resize-none disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={contactSubmitting || (!negotiation?.contactRequested && !negotiation?.contactShared)}
                    onClick={async () => {
                      setContactFormError(null);
                      setContactSuccessMsg(null);
                      if (!shareName.trim() && !sharePhone.trim() && !shareEmail.trim() && !shareAddress.trim()) {
                        setContactFormError('At least one contact field (Name, Contact Number, Email Address, or Address) must be filled before sharing.');
                        return;
                      }
                      setContactSubmitting(true);
                      try {
                        if (onShareContact) {
                          await onShareContact(
                            { name: shareName, phone: sharePhone, email: shareEmail, address: shareAddress },
                            simulatedUserId
                          );
                        }
                        setContactSuccessMsg('Contact information shared successfully!');
                        setTimeout(() => setShowContactModal(false), 1200);
                      } catch (err: any) {
                        setContactFormError(err.message || 'Failed to share contact information');
                      } finally {
                        setContactSubmitting(false);
                      }
                    }}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-2xl py-4 px-6 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    {contactSubmitting ? 'Sharing Contact Info...' : (negotiation?.contactShared ? 'Update Shared Contact Details' : 'Share Contact Information')}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowContactModal(false);
                  setContactFormError(null);
                  setContactSuccessMsg(null);
                }}
                className="w-full bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accept Proposal Modal */}
      {showAcceptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-stone-900 border border-emerald-500/30 rounded-[2rem] max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative">
            <button 
              onClick={() => setShowAcceptModal(false)}
              className="absolute top-4 right-4 p-2 hover:bg-stone-800 rounded-xl text-stone-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tighter">
                {effectiveIsBuyer ? 'Accept Counter Offer' : 'Accept Proposal'}
              </h3>
              <p className="text-xs text-stone-400 font-medium">
                Confirming agreement at <span className="font-bold text-emerald-400">{negotiation?.lastOfferAmount ? formatPKR(negotiation.lastOfferAmount, currencySymbol) : 'Agreed Amount'}</span>
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-stone-400 tracking-[0.2em] ml-2">Attached Message (Optional)</label>
              <textarea 
                value={acceptMessage}
                onChange={(e) => setAcceptMessage(e.target.value)}
                placeholder="Include a message with your acceptance (e.g. Terms accepted, ready for agreement)..."
                rows={3}
                className="w-full bg-stone-950 border border-white/10 rounded-2xl px-5 py-3 text-white font-medium text-sm placeholder:text-stone-700 focus:border-emerald-500/50 outline-none transition-all resize-none shadow-inner"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ArenaButton 
                variant="outline" 
                onClick={() => setShowAcceptModal(false)}
                className="border-stone-800 text-stone-400"
              >
                Cancel
              </ArenaButton>
              <ArenaButton 
                variant="primary"
                className="bg-emerald-600 hover:bg-emerald-500 text-white border-none shadow-lg shadow-emerald-500/20"
                onClick={() => {
                  onRespond('accept', simulatedUserId, acceptMessage);
                  setShowAcceptModal(false);
                  setAcceptMessage('');
                }}
              >
                Confirm & Accept
              </ArenaButton>
            </div>
          </div>
        </div>
      )}

      {/* Auth Required Modal for unauthenticated users attempting offers */}
      <AuthRequiredModal
        isOpen={showAuthRequiredModal}
        onClose={() => setShowAuthRequiredModal(false)}
        title="Authentication Required"
        message="You are not logged in. Please login to get access."
      />
    </div>
  );
};

// Admin Specific Icons/Buttons sub-component for clarity
const Warning = ({ className }: { className?: string }) => <AlertTriangle className={className} />;
