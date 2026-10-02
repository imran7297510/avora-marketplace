import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  CheckCircle2, 
  MessageSquare, 
  MessageCircle, 
  Phone, 
  ExternalLink,
  Award,
  Trophy,
  ShieldAlert,
  Clock,
  Send,
  Lock,
  X,
  AlertCircle
} from 'lucide-react';
import { Bid } from '../types';
import { useSellerProfile } from '../hooks/useSellerProfile';
import { ProfileVerificationTick } from './shared/ProfileVerificationTick';
import { getCleanPhoneForCall, getCleanPhoneForWhatsApp } from '../../../lib/phoneUtils';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  setDoc, 
  doc, 
  addDoc,
  orderBy,
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ReportModal } from './ReportModal';
import { formatPrice, getCurrencyByCode } from '../../../lib/currencies';

const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val.toMillis === 'function') return new Date(val.toMillis());
  if (val.seconds) return new Date(val.seconds * 1000);
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const formatDaysHoursMinutes = (timestamp: any) => {
  const date = parseSafeDate(timestamp);
  if (!date) return 'Pending';

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const totalMins = Math.floor(diffMs / (1000 * 60));

  if (totalMins < 1) return 'Just now';

  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const minutes = totalMins % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hr' : 'hrs'}`);
  if (minutes > 0 || (days === 0 && hours === 0)) {
    parts.push(`${minutes} ${minutes === 1 ? 'min' : 'mins'}`);
  }

  return `${parts.join(' ')} ago`;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const get7DaysStatus = (auction: any, bidTimestamp?: any) => {
  const finalizeDate = parseSafeDate(auction?.endTime) || parseSafeDate(bidTimestamp) || new Date();
  const finalizeMs = finalizeDate.getTime();
  const nowMs = Date.now();
  const elapsedMs = nowMs - finalizeMs;

  const is7DaysElapsed = elapsedMs >= SEVEN_DAYS_MS;
  const remainingMs = Math.max(0, SEVEN_DAYS_MS - elapsedMs);

  const remDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const remHours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const remMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  const remainingText = `${remDays}d ${remHours}h ${remMins}m`;

  return { is7DaysElapsed, remainingMs, remainingText, finalizeDate };
};

interface SingleRowTopBidderCardProps {
  bid: Bid;
  rank: number;
  isOwner: boolean;
  currentUser: any;
  auction: any;
  onOpenAdminReview: (bidderUserId: string, bidderName: string, bidTimestamp: any) => void;
  onSelectChat: (rankIdx: number) => void;
}

const SingleRowTopBidderCard: React.FC<SingleRowTopBidderCardProps> = ({
  bid,
  rank,
  isOwner,
  currentUser,
  auction,
  onOpenAdminReview,
  onSelectChat
}) => {
  const navigate = useNavigate();
  const { profile } = useSellerProfile(bid.userId);

  const photoURL = profile?.photoURL || bid.userPhotoURL;
  const displayName = profile?.displayName || profile?.username || bid.userName || 'anonymous_combatant';
  const username = profile?.username || bid.userId;

  const hasKyc = profile?.kycStatus === 'APPROVED';
  const isPremium = profile?.isPremiumSeller || false;
  const showGoldenTick = hasKyc && isPremium;
  const showBlueTick = hasKyc && !isPremium;

  const currencyCodeOrSymbol = (bid as any).currencySymbol || (bid as any).currency || auction?.currencySymbol || auction?.currency;
  const curr = getCurrencyByCode(currencyCodeOrSymbol);

  const rankConfig = rank === 1 ? {
    label: '#1 First Highest Bidder',
    borderColor: 'border-amber-500/40 hover:border-amber-500/70 bg-gradient-to-b from-amber-500/[0.08] to-stone-950/90',
    badgeColor: 'bg-amber-500 text-stone-955 font-black',
    textColor: 'text-amber-400',
    icon: Trophy,
  } : rank === 2 ? {
    label: '#2 Second Highest Bidder',
    borderColor: 'border-stone-400/30 hover:border-stone-400/60 bg-gradient-to-b from-stone-400/[0.06] to-stone-950/90',
    badgeColor: 'bg-stone-300 text-stone-955 font-black',
    textColor: 'text-stone-200',
    icon: Award,
  } : {
    label: '#3 Third Highest Bidder',
    borderColor: 'border-amber-700/30 hover:border-amber-700/60 bg-gradient-to-b from-amber-800/[0.06] to-stone-950/90',
    badgeColor: 'bg-amber-700 text-amber-100 font-black',
    textColor: 'text-amber-500',
    icon: Award,
  };

  const RankIcon = rankConfig.icon;
  const timeFormatted = formatDaysHoursMinutes(bid.timestamp);
  const status7Days = get7DaysStatus(auction, bid.timestamp);

  const handleWhatsApp = () => {
    if (profile?.phoneNumber) {
      const cleanPhone = getCleanPhoneForWhatsApp(profile.phoneNumber);
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    } else {
      alert("WhatsApp number is not registered for this pilot.");
    }
  };

  const handleCall = () => {
    if (profile?.phoneNumber) {
      window.location.href = getCleanPhoneForCall(profile.phoneNumber);
    } else {
      alert("Phone number is not registered for this pilot.");
    }
  };

  return (
    <div className={`p-4 rounded-2xl border ${rankConfig.borderColor} flex flex-col justify-between gap-3.5 transition-all shadow-lg relative group overflow-hidden`}>
      {/* Top Rank Badge Header */}
      <div className="flex items-center justify-between">
        <div className={`px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-wider flex items-center gap-1.5 ${rankConfig.badgeColor}`}>
          <RankIcon className="w-3.5 h-3.5 shrink-0" />
          <span>{rankConfig.label}</span>
        </div>
      </div>

      {/* Profile Picture, Profile Name (up to 2 rows), and Tick in a single row */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Profile Picture */}
        <div 
          onClick={() => navigate(`/battle-bids/profile/${username}`)}
          className="w-11 h-11 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer hover:border-amber-500/50 transition-colors"
        >
          {photoURL ? (
            <img src={photoURL} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <User className="w-5 h-5 text-stone-500" />
          )}
        </div>

        {/* Profile Name & Tick */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 
              onClick={() => navigate(`/battle-bids/profile/${username}`)}
              className="text-xs sm:text-sm font-black text-white hover:text-amber-400 transition-colors cursor-pointer line-clamp-2 break-words leading-snug"
              title={displayName}
            >
              @{displayName}
            </h4>

            <ProfileVerificationTick profile={profile} size="sm" />
          </div>

          {/* View Profile Link */}
          <button
            onClick={() => navigate(`/battle-bids/profile/${username}`)}
            className="text-[9px] text-stone-500 hover:text-rose-400 font-bold uppercase tracking-wider flex items-center gap-0.5 mt-0.5 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            View Profile
          </button>
        </div>
      </div>

      {/* Submitted Bids along with currency name and symbol */}
      <div className="bg-stone-950/80 p-2.5 rounded-xl border border-stone-850 flex items-center justify-between gap-2 font-mono min-w-0">
        <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest shrink-0">Submitted Bid</span>
        <div className="flex items-center gap-1.5 min-w-0 truncate justify-end">
          <span className="text-xs font-bold text-stone-400 shrink-0">{curr.symbol}</span>
          <span className={`text-sm sm:text-base font-black ${rankConfig.textColor} truncate`}>
            {(bid.amount || 0).toLocaleString()}
          </span>
          <span className="text-[10px] font-black text-amber-500/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider shrink-0">
            {curr.code}
          </span>
        </div>
      </div>

      {/* Bid Submitted Time & Admin Review Button */}
      <div className="pt-2 border-t border-stone-900 flex items-center justify-between gap-2">
        {/* Bid Submitted Time (days, hours, minutes) */}
        <div className="flex items-center gap-1.5 text-stone-400 font-mono text-[10px] sm:text-xs">
          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="font-semibold">{timeFormatted}</span>
        </div>

        {/* Working Admin Review Button */}
        {isOwner && (
          <button
            onClick={() => onOpenAdminReview(bid.userId, displayName, bid.timestamp)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center gap-1 cursor-pointer ${
              status7Days.is7DaysElapsed
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/20'
                : 'bg-stone-900 border-stone-800 text-stone-500 hover:text-stone-400'
            }`}
            title={
              status7Days.is7DaysElapsed 
                ? "Submit Admin Review Request" 
                : `Admin Review available after 7 days of finalizing (${status7Days.remainingText} remaining)`
            }
          >
            <ShieldAlert className="w-3 h-3 text-rose-400 shrink-0" />
            <span>Admin Review</span>
          </button>
        )}
      </div>

      {/* Working Chat & Contact Panel */}
      {isOwner && (
        <div className="flex items-center gap-1.5 pt-1.5 border-t border-stone-900">
          <button
            onClick={() => onSelectChat(rank - 1)}
            title="Chat in App"
            className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-amber-500/10"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat ({rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd'})</span>
          </button>
          <button
            onClick={handleWhatsApp}
            title="WhatsApp Direct"
            className="p-2 bg-stone-900 hover:bg-stone-800 text-emerald-400 rounded-xl text-[10px] border border-stone-800 transition-colors cursor-pointer"
          >
            <MessageCircle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCall}
            title="Call Direct"
            className="p-2 bg-stone-900 hover:bg-stone-800 text-sky-400 rounded-xl text-[10px] border border-stone-800 transition-colors cursor-pointer"
          >
            <Phone className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

interface Top3BidderTabItemProps {
  bid: Bid;
  rankIndex: number;
  isActive: boolean;
  onSelect: () => void;
  auction: any;
}

const Top3BidderTabItem: React.FC<Top3BidderTabItemProps> = ({
  bid,
  rankIndex,
  isActive,
  onSelect,
  auction
}) => {
  const { profile } = useSellerProfile(bid.userId);
  const displayName = profile?.displayName || profile?.username || bid.userName || `Bidder #${rankIndex + 1}`;
  const currency = (bid as any)?.currencySymbol || (bid as any)?.currency || auction?.currencySymbol || auction?.currency;

  const rankLabels = [
    { title: "1st Highest Bidder", rankText: "🥇 1st Rank", badge: "bg-amber-500 text-stone-955" },
    { title: "2nd Highest Bidder", rankText: "🥈 2nd Rank", badge: "bg-stone-300 text-stone-955" },
    { title: "3rd Highest Bidder", rankText: "🥉 3rd Rank", badge: "bg-amber-700 text-amber-100" }
  ];
  const rankInfo = rankLabels[rankIndex] || rankLabels[0];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`p-2.5 sm:p-3 rounded-2xl border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer w-full min-w-0 ${
        isActive 
          ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md shadow-amber-500/10 ring-2 ring-amber-500/40' 
          : 'bg-stone-955/90 border-stone-850 hover:border-stone-700 text-stone-400 hover:text-white hover:bg-stone-900/60'
      }`}
    >
      {/* Top Row: Rank Tag & User Profile Name */}
      <div className="flex items-center justify-between gap-1.5 w-full min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${rankInfo.badge}`}>
            {rankInfo.rankText}
          </span>
          <span className="text-xs font-black text-white truncate" title={displayName}>
            @{displayName}
          </span>
        </div>
        <ProfileVerificationTick profile={profile} size="sm" />
      </div>

      {/* Bottom Row: Bid Amount */}
      <div className="flex items-center justify-between gap-1 w-full pt-1 border-t border-stone-850/80 font-mono">
        <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest shrink-0">
          Strike
        </span>
        <span className={`text-xs sm:text-sm font-black truncate ${isActive ? 'text-amber-400' : 'text-stone-300'}`}>
          {formatPrice(bid.amount || 0, currency)}
        </span>
      </div>
    </button>
  );
};

interface Top3BiddersChatConsoleProps {
  top3Bidders: Bid[];
  auction: any;
  currentUser: any;
  activeBidderIndex: number;
  onSelectBidderIndex: (idx: number) => void;
}

const Top3BiddersChatConsole: React.FC<Top3BiddersChatConsoleProps> = ({
  top3Bidders,
  auction,
  currentUser,
  activeBidderIndex,
  onSelectBidderIndex
}) => {
  const navigate = useNavigate();
  const currentBidder = top3Bidders[activeBidderIndex];
  const { profile: buyerProfile } = useSellerProfile(currentBidder?.userId);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const status7Days = get7DaysStatus(auction, currentBidder?.timestamp);
  const isReadOnly = status7Days.is7DaysElapsed;

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  // Initialize or load isolated chat for selected bidder rank
  useEffect(() => {
    if (!currentUser || !currentBidder || !auction) return;

    let isMounted = true;
    const auctionId = auction.id || 'auction';
    const sellerId = auction.sellerId || currentUser.uid;
    const buyerId = currentBidder.userId;

    // Standardized listingId for isolated Top 3 Chat
    const top3ListingId = `TOP3_AUCTION_${auctionId}_RANK${activeBidderIndex + 1}_${buyerId}`;

    const initChat = async () => {
      try {
        const qSnap = await getDocs(
          query(
            collection(db, "chats"),
            where("buyerId", "==", buyerId),
            where("sellerId", "==", sellerId),
            where("listingId", "==", top3ListingId)
          )
        );

        let cId = "";
        if (!qSnap.empty) {
          cId = qSnap.docs[0].id;
        } else {
          const chatRef = doc(collection(db, "chats"));
          await setDoc(chatRef, {
            listingId: top3ListingId,
            auctionId: auctionId,
            auctionTitle: auction.title || 'Auction Item',
            buyerId: buyerId,
            sellerId: sellerId,
            bidderRank: activeBidderIndex + 1,
            bidAmount: currentBidder.amount,
            lastMessage: `Top 3 bidder chat channel initiated for rank #${activeBidderIndex + 1}`,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            status: "ACTIVE"
          });
          cId = chatRef.id;
        }

        if (isMounted) {
          setChatId(cId);
        }
      } catch (err) {
        console.error("Error setting up Top3 bidder chat:", err);
      }
    };

    initChat();

    return () => {
      isMounted = false;
    };
  }, [currentUser, currentBidder, auction, activeBidderIndex]);

  // Real-time messages listener
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }

    const messagesQuery = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      messagesQuery, 
      (snapshot) => {
        const msgs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        setMessages(msgs);
        setTimeout(scrollToBottom, 50);
      },
      (error) => {
        console.warn("Messages stream listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [chatId]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !chatId || !currentUser || isReadOnly) return;

    const textToSend = inputMessage.trim();
    setInputMessage('');
    setSending(true);

    try {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        text: textToSend,
        senderId: currentUser.uid,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, "chats", chatId), {
        lastMessage: textToSend,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSending(false);
    }
  };

  const buyerDisplayName = buyerProfile?.displayName || buyerProfile?.username || currentBidder?.userName || 'combatant';
  const buyerUsername = buyerProfile?.username || currentBidder?.userId;
  const buyerPhotoURL = buyerProfile?.photoURL || currentBidder?.userPhotoURL;

  const sectionLabels = [
    { title: "First highest bidder", rankText: "🥇 1st Highest Bidder" },
    { title: "Second highest bidder", rankText: "🥈 2nd Highest Bidder" },
    { title: "3rd highest bidder", rankText: "🥉 3rd Highest Bidder" }
  ];

  const handleWhatsApp = () => {
    if (buyerProfile?.phoneNumber) {
      const cleanPhone = getCleanPhoneForWhatsApp(buyerProfile.phoneNumber);
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    }
  };

  const handleCall = () => {
    if (buyerProfile?.phoneNumber) {
      window.location.href = getCleanPhoneForCall(buyerProfile.phoneNumber);
    }
  };

  return (
    <div className="bg-stone-955 border border-amber-500/30 rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 space-y-4 shadow-2xl mt-4">
      {/* Console Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-850 pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <MessageSquare className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider truncate">
              Top 3 Bidders Chat Console
            </h4>
            <p className="text-[10px] text-stone-500 font-medium line-clamp-1">
              3 distinct sections in a single row for top buyers. Chat active for 7 days post-finalization.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 border border-stone-850 rounded-xl text-[10px] font-mono text-stone-400 shrink-0 self-start sm:self-auto">
          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>
            {isReadOnly ? (
              <span className="text-rose-400 font-bold">Read-Only (7 days elapsed)</span>
            ) : (
              <span className="text-emerald-400 font-bold">Active Chat Window ({status7Days.remainingText} left)</span>
            )}
          </span>
        </div>
      </div>

      {/* 3 Sections Tabs with Highest Bidder Rank, Profile Name, and Bid Amount */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-stone-900/90 border border-stone-850 rounded-2xl">
        {top3Bidders.map((b, idx) => (
          <Top3BidderTabItem
            key={b.id || idx}
            bid={b}
            rankIndex={idx}
            isActive={idx === activeBidderIndex}
            onSelect={() => onSelectBidderIndex(idx)}
            auction={auction}
          />
        ))}
      </div>

      {/* Dedicated Chat Window for Active Section */}
      <div className="bg-stone-900/60 border border-stone-850 rounded-2xl p-3 sm:p-5 space-y-3">
        {/* Active Highest Bidder Details Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-850">
          {/* Left Column: Bidder Profile, Avatar, Name & Verification */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Avatar */}
            <div 
              onClick={() => buyerUsername && navigate(`/battle-bids/profile/${buyerUsername}`)}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer hover:border-amber-500/60 transition-colors shadow-inner"
            >
              {buyerPhotoURL ? (
                <img src={buyerPhotoURL} alt={buyerDisplayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="w-5 h-5 text-amber-500" />
              )}
            </div>

            {/* Profile Name & Rank Info */}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-wider shrink-0">
                  {sectionLabels[activeBidderIndex]?.rankText}
                </span>
                <ProfileVerificationTick profile={buyerProfile} size="sm" />
              </div>

              <div className="flex items-center gap-1.5 min-w-0">
                <h5 
                  onClick={() => buyerUsername && navigate(`/battle-bids/profile/${buyerUsername}`)}
                  className="text-xs sm:text-sm font-black text-white hover:text-amber-400 transition-colors cursor-pointer truncate max-w-[140px] xs:max-w-[180px] sm:max-w-[220px]"
                  title={buyerDisplayName}
                >
                  @{buyerDisplayName}
                </h5>
                <button
                  type="button"
                  onClick={() => buyerUsername && navigate(`/battle-bids/profile/${buyerUsername}`)}
                  className="text-[9px] text-stone-500 hover:text-amber-400 font-bold uppercase tracking-wider flex items-center gap-0.5 transition-colors cursor-pointer shrink-0"
                  title="View Profile"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  <span className="hidden xs:inline">Profile</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Bid Amount & Direct Communication Actions */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-850/60 w-full sm:w-auto">
            {/* Bid Amount Pill */}
            <div className="bg-stone-950 px-3 py-1.5 rounded-xl border border-stone-800 font-mono flex items-center sm:flex-col sm:items-end gap-2 sm:gap-0 flex-1 sm:flex-initial justify-between sm:justify-center">
              <span className="text-[8px] sm:text-[9px] font-black text-stone-500 uppercase tracking-widest shrink-0">
                Highest Strike
              </span>
              <span className="text-xs sm:text-sm font-black text-amber-400 truncate">
                {formatPrice(currentBidder?.amount || 0, (currentBidder as any)?.currencySymbol || (currentBidder as any)?.currency || auction?.currencySymbol || auction?.currency)}
              </span>
            </div>

            {/* Quick Contact Buttons for Seller */}
            {buyerProfile?.phoneNumber && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleWhatsApp}
                  title="Direct WhatsApp"
                  className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs transition-all cursor-pointer active:scale-95"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCall}
                  title="Direct Call"
                  className="p-2 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 rounded-xl text-xs transition-all cursor-pointer active:scale-95"
                >
                  <Phone className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Read-Only Notice if > 7 days */}
        {isReadOnly && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2.5 text-rose-400 text-xs font-semibold">
            <Lock className="w-4 h-4 text-rose-500 shrink-0" />
            <span>
              Chat session concluded after 7 days post-finalization. The conversation remains available in read-only condition.
            </span>
          </div>
        )}

        {/* Messages list with internal container scrolling */}
        <div 
          ref={messagesContainerRef}
          className="h-56 sm:h-64 overflow-y-auto space-y-2.5 pr-1 text-xs scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-stone-500 space-y-2">
              <MessageSquare className="w-8 h-8 text-stone-700" />
              <p className="font-bold text-xs uppercase tracking-wider">No messages in this section yet</p>
              <p className="text-[11px] text-stone-600 max-w-xs">
                Start a direct conversation with the {sectionLabels[activeBidderIndex]?.title.toLowerCase()} (@{buyerDisplayName}).
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.senderId === currentUser.uid;
              return (
                <div 
                  key={m.id} 
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className={`max-w-[85%] sm:max-w-[75%] px-3.5 py-2.5 rounded-2xl text-xs ${
                    isMe 
                      ? 'bg-amber-500 text-stone-955 font-semibold rounded-tr-none shadow-md shadow-amber-500/10' 
                      : 'bg-stone-850 text-stone-100 font-medium rounded-tl-none border border-stone-800'
                  }`}>
                    {m.text}
                  </div>
                  <span className="text-[9px] text-stone-500 font-mono mt-0.5 px-1">
                    {m.createdAt ? formatDaysHoursMinutes(m.createdAt) : 'Just now'}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Send message form */}
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 pt-2 border-t border-stone-850">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={isReadOnly || sending}
            placeholder={
              isReadOnly 
                ? "Chat is read-only after 7 days" 
                : `Message @${buyerDisplayName}...`
            }
            className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm text-white placeholder-stone-600 focus:outline-none focus:border-amber-500/60 disabled:opacity-50 disabled:cursor-not-allowed font-medium min-h-[44px]"
          />
          <button
            type="submit"
            disabled={isReadOnly || !inputMessage.trim() || sending}
            className="h-[44px] px-4 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-850 text-stone-955 font-black text-xs uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:text-stone-600 shrink-0 min-w-[44px]"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};

interface Top3BiddersProps {
  bids: Bid[];
  isOwner?: boolean;
  currentUser?: any;
  showForEveryone?: boolean;
  singleRow?: boolean;
  title?: string;
  className?: string;
  auction?: any;
  hideHeader?: boolean;
}

export const Top3Bidders: React.FC<Top3BiddersProps> = ({ 
  bids, 
  isOwner = false, 
  currentUser, 
  showForEveryone = false,
  singleRow = false,
  title = "Top 3 Bidders",
  className = "",
  auction,
  hideHeader = false
}) => {
  const navigate = useNavigate();
  const [activeBidderIndex, setActiveBidderIndex] = useState(0);
  const [showAdminReviewModal, setShowAdminReviewModal] = useState(false);
  const [adminReviewTarget, setAdminReviewTarget] = useState<{ userId: string; displayName: string } | null>(null);
  const [showAdminReviewLockedAlert, setShowAdminReviewLockedAlert] = useState(false);
  const [lockedRemainingText, setLockedRemainingText] = useState('');

  // Get top 3 unique bidders sorted highest to lowest
  const top3Bidders = React.useMemo(() => {
    const sorted = [...bids].sort((a, b) => b.amount - a.amount);
    const uniqueMap = new Map<string, Bid>();
    for (const b of sorted) {
      if (!uniqueMap.has(b.userId)) {
        uniqueMap.set(b.userId, b);
      }
    }
    return Array.from(uniqueMap.values()).slice(0, 3);
  }, [bids]);

  const handleOpenAdminReview = (bidderUserId: string, bidderName: string, bidTimestamp: any) => {
    const status = get7DaysStatus(auction, bidTimestamp);
    if (!status.is7DaysElapsed) {
      setLockedRemainingText(status.remainingText);
      setShowAdminReviewLockedAlert(true);
    } else {
      setAdminReviewTarget({ userId: bidderUserId, displayName: bidderName });
      setShowAdminReviewModal(true);
    }
  };

  const handleSelectChat = (idx: number) => {
    setActiveBidderIndex(idx);
  };

  // If no bids yet, show polished empty state rather than collapsing to null
  if (top3Bidders.length === 0) {
    return (
      <div className="py-12 sm:py-14 text-center space-y-3 bg-stone-955 rounded-2xl border border-stone-850/60 p-6">
        <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
          <Trophy className="w-6 h-6" />
        </div>
        <p className="text-xs sm:text-sm font-black text-stone-300 uppercase tracking-widest">
          Combat Podium Awaiting Strikes
        </p>
        <p className="text-[11px] text-stone-500 max-w-sm mx-auto leading-relaxed">
          {isOwner 
            ? "No bids have been submitted on your listing yet. Once operatives place bids, the top 3 highest combatants will appear here." 
            : "No operative has placed a bid yet. Place your tactical bid to secure the #1 Gold Podium standing."}
        </p>
        {!isOwner && (
          <div className="pt-2">
            <button
              onClick={() => {
                const el = document.getElementById('timeline-bidding-panel');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
                else navigate(`/battle-bids?id=${auction?.id || ''}`);
              }}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-955 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-md shadow-amber-500/10"
            >
              Deploy First Strike
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header if not hidden */}
      {!hideHeader && (
        <div className="flex items-center justify-between border-b border-stone-850 pb-3">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-4 h-4 text-amber-500" />
            <div>
              <span className="text-[9px] text-amber-500 font-black uppercase tracking-widest block">Combat Podium</span>
              <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">{title}</h3>
            </div>
          </div>
          <span className="text-[10px] font-mono font-black text-amber-500 uppercase bg-amber-500/10 px-2 py-0.5 border border-amber-500/20 rounded-full">
            Real Time
          </span>
        </div>
      )}

      {/* Top 3 Bidder Cards in a single row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {top3Bidders.map((bid, idx) => (
          <SingleRowTopBidderCard 
            key={bid.id || idx} 
            bid={bid} 
            rank={idx + 1}
            isOwner={!!isOwner} 
            currentUser={currentUser} 
            auction={auction}
            onOpenAdminReview={handleOpenAdminReview}
            onSelectChat={handleSelectChat}
          />
        ))}
      </div>

      {/* Top 3 Bidders Chat System Console (Seller Only) */}
      {isOwner && currentUser && top3Bidders.length > 0 && (
        <Top3BiddersChatConsole
          top3Bidders={top3Bidders}
          auction={auction}
          currentUser={currentUser}
          activeBidderIndex={activeBidderIndex}
          onSelectBidderIndex={setActiveBidderIndex}
        />
      )}

      {/* Admin Review Locked Modal Alert */}
      {showAdminReviewLockedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-stone-900 border border-amber-500/30 p-6 rounded-3xl max-w-sm w-full space-y-4 shadow-2xl relative text-center">
            <button 
              onClick={() => setShowAdminReviewLockedAlert(false)} 
              className="absolute top-4 right-4 text-stone-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
              <Lock className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-sm font-black text-white uppercase">Admin Review Unavailable</h4>
              <p className="text-xs text-stone-400 leading-relaxed font-medium">
                The Admin Review button becomes active for the exact seller <strong className="text-amber-400">after elapse of 7 days</strong> of finalizing of bids.
              </p>
            </div>
            <div className="p-3 bg-stone-950 border border-stone-850 rounded-xl font-mono text-xs text-amber-400 font-bold">
              Time Remaining: {lockedRemainingText}
            </div>
            <button
              onClick={() => setShowAdminReviewLockedAlert(false)}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-955 font-black text-xs uppercase rounded-xl transition-all cursor-pointer"
            >
              Understand
            </button>
          </div>
        </div>
      )}

      {/* Working Admin Review Modal */}
      {showAdminReviewModal && adminReviewTarget && (
        <ReportModal
          isOpen={showAdminReviewModal}
          onClose={() => {
            setShowAdminReviewModal(false);
            setAdminReviewTarget(null);
          }}
          targetId={adminReviewTarget.userId}
          targetType="user"
          targetTitle={`Admin Review Request: @${adminReviewTarget.displayName}`}
        />
      )}
    </div>
  );
};
