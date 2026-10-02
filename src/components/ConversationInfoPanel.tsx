import React from "react";
import { Link } from "react-router-dom";
import {
  User,
  MapPin,
  Calendar,
  Star,
  BadgeCheck,
  Bell,
  BellOff,
  Ban,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Gavel,
  ArrowRight,
  MessageSquare,
  X,
} from "lucide-react";
import { Chat } from "../types";
import { formatPKR, cn } from "../lib/utils";
import { resolveAuthoritativeVerification } from "../lib/verificationResolver";
import { calculateTrustTier, clampTrustScore, INITIAL_TRUST_SCORE } from "../features/trust-score/types";
import { TrustScoreBadge } from "./SharedBadge";

interface ConversationInfoPanelProps {
  chat: Chat & {
    listingTitle?: string;
    listingImage?: string;
    otherPartyName?: string;
    otherPartyIsKycVerified?: boolean;
    otherPartyIsPremiumVerified?: boolean;
    otherPartyVerifiedBadgeType?: string;
  };
  otherPartyProfile: any | null;
  linkedAuction: any | null;
  linkedNegotiation: any | null;
  loadingLinkedInfo: boolean;
  onClose: () => void;
  onToggleMute: () => void;
  onToggleBlock: () => void;
  onReport: () => void;
  isMuted: boolean;
  isBlocked: boolean;
  user: any;
}

export const ConversationInfoPanel: React.FC<ConversationInfoPanelProps> = ({
  chat,
  otherPartyProfile,
  linkedAuction,
  linkedNegotiation,
  loadingLinkedInfo,
  onClose,
  onToggleMute,
  onToggleBlock,
  onReport,
  isMuted,
  isBlocked,
  user,
}) => {
  // Derive profile details from full profile, falling back to chat properties
  const displayName = otherPartyProfile?.name || chat.otherPartyName || "User";
  const email = otherPartyProfile?.email;
  const phoneNumber = otherPartyProfile?.phoneNumber;
  const city = otherPartyProfile?.city || "Pakistan";
  
  // Authoritative verification checks
  const authVerif = resolveAuthoritativeVerification(otherPartyProfile);
  const isKycVerified = otherPartyProfile ? authVerif.isKycCurrentlyValid : Boolean(chat.otherPartyVerifiedBadgeType === "BLUE" || chat.otherPartyVerifiedBadgeType === "GOLDEN");
  const isPremium = otherPartyProfile ? authVerif.isPremiumCurrentlyActive : Boolean(chat.otherPartyIsPremiumVerified === true || chat.otherPartyVerifiedBadgeType === "GOLDEN" || chat.otherPartyVerifiedBadgeType === "PREMIUM");

  // Canonical Trust Score derivation (0-100, default 50: Neutral / Building)
  // Completely independent of KYC, Premium, or Verification Score
  const rawTrustScore = typeof otherPartyProfile?.trustScore === "number" && Number.isFinite(otherPartyProfile.trustScore)
    ? otherPartyProfile.trustScore
    : INITIAL_TRUST_SCORE;
  const trustScore = clampTrustScore(rawTrustScore);
  const trustTier = otherPartyProfile?.trustTier || calculateTrustTier(trustScore);

  // Chat Started Date
  const startedDate = (() => {
    const ca = chat.createdAt;
    if (!ca) return null;
    let d: Date;
    if (typeof ca.toDate === "function") d = ca.toDate();
    else if (ca.seconds) d = new Date(ca.seconds * 1000);
    else d = new Date(ca);
    return isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  })();

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="w-full md:w-80 lg:w-96 border-l border-stone-200 bg-white h-full flex flex-col shrink-0 animate-in slide-in-from-right duration-200 z-40 shadow-xl md:shadow-none">
      {/* Panel Header */}
      <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/50">
        <h3 className="font-spartan font-black text-xs uppercase tracking-widest text-stone-900">
          Conversation Info
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          title="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide">
        {/* User Card */}
        <div className="flex flex-col items-center text-center p-4 bg-stone-50 rounded-2xl border border-stone-100 relative">
          {/* Avatar */}
          {otherPartyProfile?.photoURL ? (
            <img
              src={otherPartyProfile.photoURL}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md mb-3"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 border-2 border-white shadow-md flex items-center justify-center font-bold text-lg mb-3">
              {initials || <User className="w-6 h-6" />}
            </div>
          )}

          {/* Name & Badges */}
          <h4 className="font-bold text-stone-900 text-base flex items-center gap-1.5 flex-wrap justify-center">
            {displayName}
            {isPremium && (
              <BadgeCheck className="w-5 h-5 text-amber-500 fill-amber-100 shrink-0" title="Premium Seller" />
            )}
            {!isPremium && isKycVerified && (
              <BadgeCheck className="w-5 h-5 text-blue-500 fill-blue-50 shrink-0" title="KYC Verified" />
            )}
          </h4>

          {/* Username/Email info */}
          <span className="text-xs text-stone-400 font-semibold mt-1 block">
            {email ? `@${email.split("@")[0]}` : `@${displayName.toLowerCase().replace(/\s+/g, "")}`}
          </span>

          {city && (
            <div className="flex items-center gap-1 text-xs text-stone-500 font-bold mt-2">
              <MapPin className="w-3.5 h-3.5 text-stone-400" />
              {city}
            </div>
          )}

          {/* Verified statuses */}
          <div className="flex gap-1.5 flex-wrap justify-center mt-3.5">
            {isKycVerified ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-600 rounded-full text-[10px] font-bold uppercase tracking-wider">
                KYC Approved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-100 border border-stone-200 text-stone-500 rounded-full text-[10px] font-bold uppercase tracking-wider">
                Unverified
              </span>
            )}

            {isPremium && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-wider">
                Premium Seller
              </span>
            )}
          </div>
        </div>

        {/* Ratings and Stats */}
        <div className="space-y-3.5">
          <h5 className="text-xs font-black uppercase tracking-wider text-stone-400">
            Marketplace Trust
          </h5>
          <div className="p-4 bg-white border border-stone-100 rounded-2xl shadow-sm">
            <div className="flex justify-between items-center">
              <span className="text-xs text-stone-500 font-bold">Trust Score</span>
              <TrustScoreBadge 
                trustScore={trustScore} 
                trustTier={trustTier} 
                size="sm" 
              />
            </div>
          </div>
        </div>

        {/* Conversation Metadata */}
        {startedDate && (
          <div className="space-y-2">
            <h5 className="text-xs font-black uppercase tracking-wider text-stone-400">
              Details
            </h5>
            <div className="p-4 bg-stone-50 border border-stone-100/50 rounded-2xl flex items-center gap-3">
              <Calendar className="w-5 h-5 text-stone-400" />
              <div>
                <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider block">
                  Connected On
                </span>
                <span className="text-xs text-stone-700 font-bold block mt-0.5">
                  {startedDate}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Linked items loader */}
        {loadingLinkedInfo ? (
          <div className="py-6 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">
              Syncing marketplace assets...
            </span>
          </div>
        ) : (
          <>
            {/* Linked Listing */}
            {chat.listingId && chat.listingId !== "PROFILE_CHAT" && (
              <div className="space-y-2.5">
                <h5 className="text-xs font-black uppercase tracking-wider text-stone-400">
                  Linked Listing
                </h5>
                <div className="p-3 bg-white border border-stone-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex items-start gap-3 relative group">
                  {chat.listingImage ? (
                    <img
                      src={chat.listingImage}
                      alt={chat.listingTitle}
                      className="w-16 h-16 rounded-xl object-cover bg-stone-100 border border-stone-100 shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 shrink-0">
                      📦
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h6 className="font-bold text-xs text-stone-900 uppercase tracking-tight line-clamp-1">
                      {chat.listingTitle || "Marketplace item"}
                    </h6>
                    <span className="text-xs text-stone-400 font-semibold mt-1 block">
                      ID: {chat.listingId.slice(0, 8)}...
                    </span>
                    <Link
                      to={`/listings/${chat.listingId}`}
                      className="inline-flex items-center gap-1 text-[11px] font-black text-amber-600 uppercase tracking-wider mt-2.5 hover:underline"
                    >
                      View item <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Linked Auction */}
            {linkedAuction && (
              <div className="space-y-2.5">
                <h5 className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1">
                  <Gavel className="w-3.5 h-3.5 text-amber-500" /> Linked Auction
                </h5>
                <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl shadow-sm space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-xs text-stone-900 line-clamp-1">
                      {linkedAuction.title}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-amber-500 text-stone-950 rounded-lg shrink-0">
                      {linkedAuction.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-amber-100/40">
                    <div>
                      <span className="text-[9px] font-black uppercase text-stone-400 tracking-wider block">
                        Current Bid
                      </span>
                      <span className="text-xs font-black text-stone-800">
                        {formatPKR(linkedAuction.currentBid || linkedAuction.startingPrice || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase text-stone-400 tracking-wider block">
                        Total Bids
                      </span>
                      <span className="text-xs font-black text-stone-800">
                        {linkedAuction.bidsCount || 0} bids
                      </span>
                    </div>
                  </div>

                  <Link
                    to={`/battle-bids?id=${linkedAuction.id}`}
                    className="flex items-center justify-between p-2 bg-white hover:bg-amber-100 text-stone-900 text-xs font-bold rounded-xl border border-amber-200/50 transition-colors group mt-1"
                  >
                    <span>View Live Auction</span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </div>
            )}

            {/* Linked Negotiation */}
            {linkedNegotiation && (
              <div className="space-y-2.5">
                <h5 className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-500" /> Linked Negotiation
                </h5>
                <div className="p-4 bg-blue-50/40 border border-blue-100 rounded-2xl shadow-sm space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-stone-500 font-bold">Status</span>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-lg">
                      {linkedNegotiation.status}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-blue-100/30">
                    <div>
                      <span className="text-[9px] font-black uppercase text-stone-400 tracking-wider block">
                        Last Offer
                      </span>
                      <span className="text-xs font-black text-stone-800">
                        {formatPKR(linkedNegotiation.lastOfferAmount || 0)}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-stone-400">
                      by {linkedNegotiation.lastOfferBy === user?.uid ? "You" : "Seller"}
                    </span>
                  </div>

                  <Link
                    to={`/battle-bids/negotiate/${linkedNegotiation.id}`}
                    className="flex items-center justify-between p-2 bg-white hover:bg-blue-50 text-stone-900 text-xs font-bold rounded-xl border border-blue-200/40 transition-colors group mt-1"
                  >
                    <span>View Deal Negotiations</span>
                    <ArrowRight className="w-3.5 h-3.5 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </div>
            )}
          </>
        )}

        {/* Safety Actions Section */}
        <div className="pt-2 border-t border-stone-100 space-y-3">
          <h5 className="text-xs font-black uppercase tracking-wider text-stone-400">
            Safety & Actions
          </h5>

          {/* Mute toggle */}
          <button
            onClick={onToggleMute}
            className="w-full text-left px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors rounded-xl font-bold text-stone-700 text-xs flex items-center gap-3 border border-stone-200/30"
          >
            {isMuted ? (
              <>
                <Bell className="w-4 h-4 text-stone-400 shrink-0" />
                Unmute Notifications
              </>
            ) : (
              <>
                <BellOff className="w-4 h-4 text-stone-400 shrink-0" />
                Mute Notifications
              </>
            )}
          </button>

          {/* Block toggle */}
          <button
            onClick={onToggleBlock}
            className={cn(
              "w-full text-left px-4 py-3 transition-colors rounded-xl font-bold text-xs flex items-center gap-3 border",
              isBlocked
                ? "bg-emerald-50 border-emerald-100 hover:bg-emerald-100 text-emerald-700"
                : "bg-red-50/50 border-red-100/40 hover:bg-red-50 text-red-600"
            )}
          >
            <Ban className="w-4 h-4 shrink-0" />
            {isBlocked ? "Unblock User" : "Block User"}
          </button>

          {/* Report button */}
          <button
            onClick={onReport}
            className="w-full text-left px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 transition-colors rounded-xl font-bold text-xs flex items-center gap-3 border border-red-100"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Report Profile
          </button>
        </div>
      </div>
    </div>
  );
};
