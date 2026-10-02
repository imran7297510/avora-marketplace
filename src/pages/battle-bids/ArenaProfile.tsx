import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  ExternalLink, 
  ShieldCheck, 
  Star, 
  MapPin, 
  Share2, 
  Flag, 
  Activity,
  History,
  Clock,
  ShieldAlert,
  Target,
  MessageSquare,
  MessageCircle,
  Phone,
  ChevronRight,
  Gavel,
  Flame,
  Award
} from 'lucide-react';
import { useSellerProfile } from '../../features/battle-bids/hooks/useSellerProfile';
import { formatPhoneNumberForDisplay, getCleanPhoneForCall, getCleanPhoneForWhatsApp } from '../../lib/phoneUtils';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';
import { collection, query, where, orderBy, getDocs, setDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { AuctionItem } from '../../features/battle-bids/types';
import { ArenaService } from '../../features/battle-bids/services';
import { formatDistanceToNow, format } from 'date-fns';
import { ReportModal } from '../../features/battle-bids/components/ReportModal';
import { formatPrice, getCurrencyByCode } from '../../lib/currencies';

export const ArenaProfile = () => {
  const { username } = useParams();
  const id = username;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading, error } = useSellerProfile(id);

  const initiateChat = async () => {
    if (!user) {
      alert("Please log in to chat.");
      return;
    }
    if (!profile || profile.id === user.uid) return;
    try {
      // Query both combinations to avoid duplicate direct chats between same users
      const [q1Snap, q2Snap] = await Promise.all([
        getDocs(
          query(
            collection(db, "chats"),
            where("buyerId", "==", user.uid),
            where("sellerId", "==", profile.id),
          ),
        ),
        getDocs(
          query(
            collection(db, "chats"),
            where("buyerId", "==", profile.id),
            where("sellerId", "==", user.uid),
          ),
        ),
      ]);

      const allDocs = [...q1Snap.docs, ...q2Snap.docs];
      const profileChatDoc = allDocs.find(
        (doc) => doc.data().listingId === "PROFILE_CHAT",
      );

      let chatId = "";
      if (profileChatDoc) {
        chatId = profileChatDoc.id;
      } else {
        const chatRef = doc(collection(db, "chats"));
        await setDoc(chatRef, {
          listingId: "PROFILE_CHAT",
          buyerId: user.uid,
          sellerId: profile.id,
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
  
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [loadingAuctions, setLoadingAuctions] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollRow = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === 'left' ? -320 : 320;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const targetSellerId = profile?.id || id;
    if (!targetSellerId) return;
    
    let isMounted = true;
    const fetchAuctions = async () => {
      setLoadingAuctions(true);
      try {
        const sellerIdsToQuery = Array.from(new Set([profile?.id, id].filter(Boolean))) as string[];
        
        let allDocs: any[] = [];
        for (const sId of sellerIdsToQuery) {
          const q = query(
            collection(db, 'arena_auctions'),
            where('sellerId', '==', sId)
          );
          const snapshot = await getDocs(q);
          allDocs = [...allDocs, ...snapshot.docs];
        }

        const docMap = new Map<string, any>();
        allDocs.forEach(d => docMap.set(d.id, d));

        const now = Date.now();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        
        let items = Array.from(docMap.values()).map(doc => ArenaService.mapDocToAuction(doc)).filter(item => {
          if (item.status === 'upcoming') {
            const createdAt = item.createdAt ? ((item.createdAt as any).toDate ? (item.createdAt as any).toDate().getTime() : new Date(item.createdAt).getTime()) : 0;
            if (createdAt > 0 && (now - createdAt > thirtyDaysMs)) {
              ArenaService.deleteAuctionPermanently(item.id).catch(err =>
                console.error("Error permanently deleting expired upcoming item:", err)
              );
              return false;
            }
          }
          return true;
        });
        
        // Only display posts under auctions
        items = items.filter(item => !item.isNegotiationOnly);

        // Sort chronologically (newest first)
        items.sort((a, b) => {
          const timeA = a.createdAt ? (typeof (a.createdAt as any).toDate === 'function' ? (a.createdAt as any).toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
          const timeB = b.createdAt ? (typeof (b.createdAt as any).toDate === 'function' ? (b.createdAt as any).toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
          return timeB - timeA;
        });

        if (isMounted) {
          setAuctions(items);
        }
      } catch (err) {
        console.error("Error fetching seller auctions:", err);
      } finally {
        if (isMounted) {
          setLoadingAuctions(false);
        }
      }
    };
    
    fetchAuctions();

    return () => {
      isMounted = false;
    };
  }, [id, profile?.id]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Profile link copied to clipboard!');
  };

  const handleReport = () => {
    if (!profile) return;
    setShowReportModal(true);
  };

  if (loading) {
    return (
      <ArenaLayout hideNavigation>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
        </div>
      </ArenaLayout>
    );
  }

  if (error || !profile) {
    return (
      <ArenaLayout hideNavigation>
        <div className="text-center py-20">
          <h2 className="text-2xl font-black uppercase text-red-500 mb-4">Profile Not Found</h2>
          <button 
            onClick={() => navigate('/battle-bids')}
            className="px-6 py-3 bg-stone-900 text-white rounded-xl uppercase font-black text-sm hover:bg-stone-800 transition-colors"
          >
            Return to Arena
          </button>
        </div>
      </ArenaLayout>
    );
  }

  const { stats } = profile;

  return (
    <ArenaLayout hideNavigation>
      <div className="max-w-4xl mx-auto pb-24">
        {/* 1. Back button and View Public Profile button */}
        <div className="flex items-center justify-between mb-8">
          <ArenaBackButton fallbackPath="/battle-bids" />
          
          <button 
            onClick={() => navigate(profile?.username ? `/user/${profile.username}` : `/user/${profile?.id || id}`)}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 border border-stone-800 hover:border-amber-500/50 rounded-xl text-xs font-black uppercase text-stone-400 hover:text-white transition-all shadow-md group"
          >
            <span>View Public Profile</span>
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Arena Pilot Dashboard Header */}
        <div className="mb-8 flex flex-col gap-2 w-full">
          <h1 className="text-lg sm:text-2xl md:text-3xl font-black text-white uppercase italic tracking-tighter flex items-center gap-1.5 sm:gap-2 min-w-0">
            <Target className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-amber-500 shrink-0" />
            <span className="truncate">Arena Pilot Dashboard</span>
          </h1>
          <p className="text-stone-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs leading-relaxed">
            Your combat status and <br /> marketplace performance metrics
          </p>
        </div>

        {/* 3. Profile Info Section */}
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 mb-8 relative overflow-hidden">
          {/* Background Grid Pattern */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none mix-blend-overlay"></div>
          
          <div className="relative z-10 flex flex-col items-center text-center">
            {/* Profile Picture */}
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-stone-800 shadow-2xl mb-4 bg-stone-800">
              {profile.photoURL ? (
                <img 
                  src={profile.photoURL} 
                  alt={profile.displayName} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-stone-800 text-stone-500">
                  <span className="text-3xl sm:text-4xl font-black">{profile.displayName?.charAt(0) || '?'}</span>
                </div>
              )}
            </div>
            
            {/* User Name */}
            <div 
              id="arena-profile-display-name-container"
              className="relative inline-flex items-center px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-gradient-to-b from-stone-100 via-stone-200 to-stone-300 border-t-2 border-l border-r border-white border-b-2 border-b-stone-400 select-text mb-3"
            >
              <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 to-transparent rounded-t-lg pointer-events-none" />
              <h2 className="relative z-10 text-lg sm:text-xl font-black text-stone-900 tracking-tight uppercase italic leading-none">
                {profile.displayName}
              </h2>
            </div>
            
            {/* KYC & Premium Badges */}
            <div className="flex flex-row items-center justify-center gap-2 mb-4 w-full">
              {profile.isSystemAccount || profile.isBot || profile.id === 'arena-official-host' || profile.id?.startsWith('arena_bot_') ? (
                <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-md text-cyan-400 font-black text-[10px] sm:text-xs uppercase tracking-wider whitespace-nowrap shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Battle Bids System Node</span>
                </div>
              ) : (
                <>
                  {profile.isKycVerified ? (
                    <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-400 font-black text-[10px] sm:text-xs uppercase tracking-wider whitespace-nowrap shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>KYC Verified</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-stone-500/10 border border-stone-700 rounded-md text-stone-400 font-black text-[10px] sm:text-xs uppercase tracking-wider whitespace-nowrap shrink-0">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>KYC Unverified</span>
                    </div>
                  )}
                  
                  {profile.isPremiumSeller ? (
                    <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-400 font-black text-[10px] sm:text-xs uppercase tracking-wider whitespace-nowrap shrink-0">
                      <Star className="w-3.5 h-3.5 shrink-0" />
                      <span>Premium Seller</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-stone-500/10 border border-stone-700 rounded-md text-stone-400 font-black text-[10px] sm:text-xs uppercase tracking-wider whitespace-nowrap shrink-0">
                      <Star className="w-3.5 h-3.5 shrink-0" />
                      <span>Standard Seller</span>
                    </div>
                  )}
                </>
              )}
            </div>
            
            {/* Location & Address */}
            <div className="flex flex-col items-center gap-1 text-stone-400">
              {profile.city && (
                <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm text-stone-300">
                  <MapPin className="w-4 h-4 text-amber-500" />
                  <span>{profile.city}{profile.country ? `, ${profile.country}` : ''}</span>
                </div>
              )}
              {profile.address && (
                <div className="text-xs mt-1 max-w-sm">
                  {profile.address}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. Share and Report Buttons */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <button 
            onClick={handleShare}
            className="flex-1 max-w-[200px] flex items-center justify-center gap-2 px-4 py-3 bg-stone-900 border border-stone-800 hover:bg-stone-800 hover:border-stone-700 rounded-xl text-xs font-black uppercase text-white transition-colors"
          >
            <Share2 className="w-4 h-4 text-stone-400" />
            Share Profile
          </button>
          <button 
            onClick={handleReport}
            className="flex-1 max-w-[200px] flex items-center justify-center gap-2 px-4 py-3 bg-stone-900 border border-red-900/30 hover:bg-red-950/20 hover:border-red-500/50 rounded-xl text-xs font-black uppercase text-red-400 transition-colors"
          >
            <Flag className="w-4 h-4" />
            Report
          </button>
        </div>

        {/* 6 & 7 & 8 & 9 & 10 & 11. Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          
          {/* Completed Sales & Purchases */}
          <div className="bg-stone-900 border border-stone-800 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <Activity className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">Completed</p>
                <p className="text-sm text-white font-black uppercase tracking-tight">Sales & Purchases</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-2xl font-black text-white">{stats?.completedSales || 0}</p>
                <p className="text-[9px] text-emerald-500 font-bold uppercase">Sales</p>
              </div>
              <div className="w-px h-8 bg-stone-800"></div>
              <div>
                <p className="text-2xl font-black text-white">{stats?.completedPurchases || 0}</p>
                <p className="text-[9px] text-blue-500 font-bold uppercase">Purchases</p>
              </div>
            </div>
          </div>

          {/* Auction Wins & Losses */}
          <div className="bg-stone-900 border border-stone-800 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                <Target className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">Auctions</p>
                <p className="text-sm text-white font-black uppercase tracking-tight">Wins & Losses</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-2xl font-black text-white">{stats?.auctionWins || 0}</p>
                <p className="text-[9px] text-emerald-500 font-bold uppercase">Wins</p>
              </div>
              <div className="w-px h-8 bg-stone-800"></div>
              <div>
                <p className="text-2xl font-black text-white">{stats?.auctionLosses || 0}</p>
                <p className="text-[9px] text-red-500 font-bold uppercase">Losses</p>
              </div>
            </div>
          </div>

          {/* Negotiations & Tactical Report */}
          <div className="bg-stone-900 border border-stone-800 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                <History className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">Active/Past</p>
                <p className="text-sm text-white font-black uppercase tracking-tight">Negotiations</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-white">{stats?.negotiationSuccess || 0}</p>
              <p className="text-[9px] text-blue-500 font-bold uppercase">Successful</p>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20">
                <Flag className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">History</p>
                <p className="text-sm text-white font-black uppercase tracking-tight">Tactical Report</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-white">0</p>
              <p className="text-[9px] text-stone-400 font-bold uppercase">Reports</p>
            </div>
          </div>

          {/* Member Since & Average Response */}
          <div className="bg-stone-900 border border-stone-800 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                <Clock className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">Platform</p>
                <p className="text-sm text-white font-black uppercase tracking-tight">Member Since</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-white">
                {profile.memberSince ? format((profile.memberSince as any).toDate ? (profile.memberSince as any).toDate() : new Date(profile.memberSince), 'MMM yyyy') : 'Unknown'}
              </p>
              <p className="text-[9px] text-purple-500 font-bold uppercase">Joined</p>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 p-5 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-stone-800 flex items-center justify-center border border-stone-700">
                <Activity className="w-5 h-5 text-stone-400" />
              </div>
              <div>
                <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">Communication</p>
                <p className="text-sm text-white font-black uppercase tracking-tight">Avg Response</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-white">{stats?.responseTime || 'N/A'}</p>
              <p className="text-[9px] text-stone-400 font-bold uppercase">Time</p>
            </div>
          </div>

          {/* Phone Contact Number Card if available */}
          {profile?.phoneNumber && (
            <div className="bg-stone-900 border border-stone-800 p-5 rounded-2xl flex items-center justify-between col-span-full">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                  <Phone className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">Contact Information</p>
                  <p className="text-sm text-white font-black uppercase tracking-tight">Verified Phone</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-white font-mono">{formatPhoneNumberForDisplay(profile.phoneNumber)}</p>
                <p className="text-[9px] text-emerald-500 font-bold uppercase">Active</p>
              </div>
            </div>
          )}

        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mb-8">
          <button 
            onClick={initiateChat}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-white rounded-2xl text-xs font-black uppercase transition-all active:scale-95 shadow-md"
          >
            <MessageSquare className="w-4 h-4 text-amber-500" />
            Chat In App
          </button>
          
          <button 
            onClick={() => {
              if (profile?.phoneNumber) {
                const cleanPhone = getCleanPhoneForWhatsApp(profile.phoneNumber);
                window.open(`https://wa.me/${cleanPhone}`, '_blank');
              } else {
                alert('WhatsApp number not available for this pilot.');
              }
            }}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-stone-900 hover:bg-stone-800 border border-emerald-500/30 text-emerald-400 rounded-2xl text-xs font-black uppercase transition-all active:scale-95 shadow-md"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </button>

          <button 
            onClick={() => {
              if (profile?.phoneNumber) {
                window.location.href = getCleanPhoneForCall(profile.phoneNumber);
              } else {
                alert('Phone number not available for this pilot.');
              }
            }}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-stone-900 hover:bg-stone-800 border border-sky-500/30 text-sky-400 rounded-2xl text-xs font-black uppercase transition-all active:scale-95 shadow-md"
          >
            <Phone className="w-4 h-4" />
            Call
          </button>
        </div>

        {/* 12. Auctions Posted */}
        <div>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse"></div>
              <h3 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tighter">
                Auctions Posted
              </h3>
              {!loadingAuctions && (
                <span className="px-2 py-0.5 rounded-full bg-stone-800 border border-stone-700 text-amber-400 text-[10px] font-black font-mono">
                  {auctions.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Swipe Left / Right Navigation Buttons */}
              {auctions.length > 1 && (
                <div className="flex items-center gap-1 bg-stone-900 border border-stone-800 rounded-xl p-1">
                  <button
                    onClick={() => scrollRow('left')}
                    aria-label="Swipe left"
                    className="p-1.5 hover:bg-stone-800 text-stone-400 hover:text-white rounded-lg transition-colors active:scale-95 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => scrollRow('right')}
                    aria-label="Swipe right"
                    className="p-1.5 hover:bg-stone-800 text-stone-400 hover:text-white rounded-lg transition-colors active:scale-95 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              <button 
                onClick={() => navigate('/battle-bids')}
                className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-amber-500 hover:bg-amber-400 text-stone-955 text-xs font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-md shadow-amber-500/10 shrink-0 cursor-pointer"
              >
                Explore Arena
              </button>
            </div>
          </div>
          
          <style>{`
            .no-scrollbar::-webkit-scrollbar {
              display: none;
            }
          `}</style>

          {loadingAuctions ? (
            <div className="flex gap-4 overflow-x-auto pb-4 pt-1 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
              {[1, 2, 3].map((n) => (
                <div key={n} className="w-[260px] sm:w-[310px] shrink-0 bg-stone-900 border border-stone-800 rounded-2xl p-4 animate-pulse space-y-3">
                  <div className="w-full h-40 bg-stone-800 rounded-xl" />
                  <div className="h-4 w-3/4 bg-stone-800 rounded" />
                  <div className="h-3 w-1/2 bg-stone-800 rounded" />
                  <div className="h-10 bg-stone-950 rounded-xl" />
                </div>
              ))}
            </div>
          ) : auctions.length === 0 ? (
            <div className="text-center py-12 px-4 bg-stone-900 border border-stone-800 rounded-2xl flex flex-col items-center justify-center gap-2">
              <div className="w-12 h-12 rounded-full bg-stone-800/80 border border-stone-700 flex items-center justify-center text-stone-500 mb-1">
                <Gavel className="w-6 h-6" />
              </div>
              <p className="text-stone-300 font-black uppercase text-sm tracking-wide">No Auctions Posted Yet</p>
              <p className="text-stone-500 text-xs max-w-sm">This operative currently has no active or listed combat items posted.</p>
            </div>
          ) : (
            <div 
              ref={scrollContainerRef}
              className="flex flex-row gap-3 sm:gap-4 overflow-x-auto pb-4 pt-1 no-scrollbar snap-x snap-mandatory overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0 scroll-smooth"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
            >
              {auctions.map(auction => {
                const currency = auction.currencySymbol || auction.currency || 'USD';
                const formattedHighestBid = formatPrice(auction.currentBid || auction.startingBid || 0, currency);
                const formattedReserve = auction.reservePrice ? formatPrice(auction.reservePrice, currency) : null;
                const formattedStarting = formatPrice(auction.startingBid || 0, currency);
                const isActive = auction.status === 'active';
                const isSold = auction.status === 'sold' || auction.status === 'concluded';
                
                return (
                  <div 
                    key={auction.id}
                    onClick={() => navigate(`/battle-bids?id=${auction.id}`)}
                    className="bg-stone-900 border border-stone-800 hover:border-amber-500/40 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/60 group w-[260px] sm:w-[310px] shrink-0 snap-start"
                  >
                    {/* Media Thumbnail */}
                    <div className="w-full h-36 sm:h-44 rounded-xl overflow-hidden bg-stone-950 shrink-0 relative border border-stone-850 mb-3">
                      {auction.images && auction.images[0] ? (
                        <img 
                          src={auction.images[0]} 
                          alt={auction.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-stone-600 gap-1 bg-stone-950">
                          <Gavel className="w-6 h-6 text-stone-700" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">No Preview</span>
                        </div>
                      )}

                      {/* Status Badge overlay */}
                      <div className="absolute top-2.5 left-2.5 z-10">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow-md backdrop-blur-md flex items-center gap-1 ${
                          isActive 
                            ? 'bg-emerald-500 text-stone-955 border border-emerald-400' 
                            : isSold 
                            ? 'bg-amber-500 text-stone-955 border border-amber-400'
                            : 'bg-stone-900/90 text-stone-400 border border-stone-700'
                        }`}>
                          {isActive && <Flame className="w-3 h-3 fill-stone-955" />}
                          {isSold && <Award className="w-3 h-3" />}
                          {isActive ? 'Live Battle' : auction.status}
                        </span>
                      </div>

                      {/* Strikes Count overlay */}
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <span className="px-2 py-0.5 rounded-md bg-stone-950/85 border border-stone-800 text-[9px] font-black font-mono text-amber-400 backdrop-blur-md">
                          {auction.bidsCount || 0} Strikes
                        </span>
                      </div>
                    </div>
                    
                    {/* Item Metadata */}
                    <div className="flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <h4 className="text-sm sm:text-base font-black text-white uppercase tracking-tight line-clamp-1 group-hover:text-amber-400 transition-colors">
                          {auction.title}
                        </h4>
                        
                        <div className="flex items-center gap-1.5 text-stone-400 text-[10px] font-bold uppercase tracking-wider mt-1">
                          <Clock className="w-3 h-3 text-stone-500 shrink-0" />
                          <span className="truncate">
                            {auction.createdAt ? format((auction.createdAt as any).toDate ? (auction.createdAt as any).toDate() : new Date(auction.createdAt), 'MMM d, yyyy') : 'Recently'}
                          </span>
                        </div>
                      </div>
                      
                      {/* Price Grid */}
                      <div className="bg-stone-955 border border-stone-850 p-2.5 rounded-xl grid grid-cols-2 gap-2">
                        <div className="min-w-0">
                          <p className="text-[9px] text-stone-500 font-bold uppercase tracking-widest truncate">Highest Strike</p>
                          <p className="text-xs sm:text-sm font-black text-emerald-400 font-mono truncate">
                            {formattedHighestBid}
                          </p>
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="text-[9px] text-stone-500 font-bold uppercase tracking-widest truncate">Reserve</p>
                          <p className="text-xs sm:text-sm font-black text-stone-300 font-mono truncate">
                            {formattedReserve || formattedStarting}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {profile && showReportModal && (
        <ReportModal 
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          targetId={profile.id}
          targetType="user"
          targetTitle={profile.displayName}
        />
      )}
    </ArenaLayout>
  );
};
