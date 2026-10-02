import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  onSnapshot,
  setDoc,
  doc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  writeBatch,
  limit,
  arrayUnion,
  increment,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType, sendNotification } from "../lib/firebase";
import { IS_READONLY_INSPECTION_MODE } from "../config/inspectionMode";
import { Chat, Message, Listing } from "../types";
import { useAuth } from "../context/AuthContext";
import { antiSpamService } from "../services/antiSpamService";
import { KycImageLightbox } from "../components/KycImageLightbox";
import {
  Send,
  Image as ImageIcon,
  MessageCircle,
  ChevronLeft,
  MoreVertical,
  Ban,
  Search,
  Archive,
  Trash2,
  CheckCircle2,
  Bell,
  BellOff,
  ShieldAlert,
  User,
  BadgeCheck,
  Mail,
  Settings,
  X,
  Pin,
  Info,
  Check,
  CheckCheck,
  Unlock,
  Camera,
  Copy,
  Share,
  CheckSquare,
} from "lucide-react";
import { RestrictedActionAlert } from "../components/RestrictedActionAlert";
import { formatPKR, cn, formatRelativeTime } from "../lib/utils";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { ConversationInfoPanel } from "../components/ConversationInfoPanel";
import { ReportModal } from "../features/battle-bids/components/ReportModal";

import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { Linkify } from "../utils/linkify";

export function Messages() {
  const { user, isBlocked, isAdmin, isSuperAdmin, isAuthorizedAdmin, isAuthorizedPaymentVerifier, userProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const userCacheRef = useRef<Record<string, any>>({});
  const listingCacheRef = useRef<Record<string, any>>({});
  const activeChatIdRef = useRef<string | null>(null);
  const latestActivityMapRef = useRef<Record<string, number>>({});

  const [chats, setChats] = useState<
    (Chat & {
      listingTitle?: string;
      listingImage?: string;
      otherPartyName?: string;
      otherPartyUsername?: string;
      otherPartyIsKycVerified?: boolean;
      isAuction?: boolean;
    })[]
  >([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [spamError, setSpamError] = useState<string | null>(null);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    if (spamError) {
      const timer = setTimeout(() => {
        setSpamError(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [spamError]);

  const [showChatOptions, setShowChatOptions] = useState(false);

  useEffect(() => {
    if (!showChatOptions) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const container = document.getElementById("chat-options-container");
      if (container && !container.contains(e.target as Node)) {
        setShowChatOptions(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showChatOptions]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [isOffer, setIsOffer] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "archived">("all");
  const [showRestricted, setShowRestricted] = useState(false);
  const [myBlocks, setMyBlocks] = useState<string[]>([]);
  const [blockedByUsers, setBlockedByUsers] = useState<string[]>([]);
  const [blockedUsersInfo, setBlockedUsersInfo] = useState<any[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [globalUsers, setGlobalUsers] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Conversation Information states
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [otherPartyProfile, setOtherPartyProfile] = useState<any | null>(null);
  const [linkedAuction, setLinkedAuction] = useState<any | null>(null);
  const [linkedNegotiation, setLinkedNegotiation] = useState<any | null>(null);
  const [loadingLinkedInfo, setLoadingLinkedInfo] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Image attachment states
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tap-and-hold (long press) state
  const [menuChatId, setMenuChatId] = useState<string | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const isSendingRef = useRef(false);
  const mutingChatIdsRef = useRef<Set<string>>(new Set());
  const archivingChatIdsRef = useRef<Set<string>>(new Set());
  const searchRequestIdRef = useRef<number>(0);

  // Draft-bound intent key map per chat: { [chatId: string]: string (UUID) }
  const draftIntentMapRef = useRef<Record<string, string>>({});

  const sortChats = (chatsList: any[]) => {
    if (!user) return chatsList;
    return [...chatsList].sort((a, b) => {
      const isBuyerA = a.buyerId === user.uid;
      const isPinnedA = isBuyerA ? a.isPinnedBuyer : a.isPinnedSeller;

      const isBuyerB = b.buyerId === user.uid;
      const isPinnedB = isBuyerB ? b.isPinnedBuyer : b.isPinnedSeller;

      if (isPinnedA && !isPinnedB) return -1;
      if (!isPinnedA && isPinnedB) return 1;

      const getChatMs = (chatObj: any) => {
        const d = chatObj.updatedAt || chatObj.createdAt;
        let docTime = 0;
        if (d) {
          if (typeof d.toMillis === "function") {
            try { docTime = d.toMillis(); } catch {}
          } else if (typeof d.toDate === "function") {
            try { docTime = d.toDate().getTime(); } catch {}
          } else if (d.seconds) {
            docTime = d.seconds * 1000;
          } else if (typeof d === "string" || typeof d === "number") {
            const parsed = new Date(d).getTime();
            if (!isNaN(parsed)) docTime = parsed;
          } else if (d instanceof Date) {
            docTime = d.getTime();
          }
        }

        const localTime = latestActivityMapRef.current[chatObj.id] || 0;
        const finalTime = Math.max(docTime, localTime);

        if (finalTime === 0 && chatObj.id === activeChatIdRef.current) {
          return Date.now();
        }
        return finalTime;
      };
      
      const bTime = getChatMs(b);
      const aTime = getChatMs(a);
      
      return bTime - aTime;
    });
  };

  const closeMobileChat = useCallback(() => {
    if (window.history.state?.mobileChatOpen) {
      window.history.back();
    } else {
      setShowMobileChat(false);
    }
  }, []);

  useEffect(() => {
    if (showMobileChat) {
      window.history.pushState({ mobileChatOpen: true }, "");
    }
  }, [showMobileChat]);

  useEffect(() => {
    const handlePopState = () => {
      if (showMobileChat) {
        setShowMobileChat(false);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [showMobileChat]);

  const handlePressStart = (chatId: string) => {
    if (selectedMessageIds.size > 0) return; // Don't allow chat options while selecting messages
    isLongPressRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    
    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setMenuChatId(chatId);
      setActiveChatId(chatId); // Select the conversation on long press
      setSelectedMessageIds(new Set()); // Clear message selection when switching/selecting via long press
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 200);
  };

  const handleMessagePressStart = (messageId: string) => {
    if (selectedMessageIds.size > 0) return; // If already in selection mode, handle via tap instead
    isLongPressRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    
    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setSelectedMessageIds((prev) => {
        const next = new Set(prev);
        next.add(messageId);
        return next;
      });
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 200);
  };

  const handleMessageContextMenu = (e: React.MouseEvent | React.TouchEvent, messageId: string) => {
    e.preventDefault();
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    if (selectedMessageIds.size > 0) return;
    
    isLongPressRef.current = true;
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
    if (navigator.vibrate) navigator.vibrate(50);
  };

  // Chat History Auto-clear Logic
  useEffect(() => {
    const runCleanup = async () => {
      if (IS_READONLY_INSPECTION_MODE) return;
      if (!user || !userProfile?.autoClearHistory || userProfile.autoClearHistory === 'off') return;
      
      const lastCleanup = userProfile.lastChatCleanupAt;
      const now = new Date();
      
      // Only run once every 24 hours to save performance/quota
      if (lastCleanup) {
        const lastDate = lastCleanup.toDate ? lastCleanup.toDate() : new Date(lastCleanup);
        const diffHours = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60);
        if (diffHours < 24) return;
      }

      const days = parseInt(userProfile.autoClearHistory, 10);
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - days);
      
      try {
        const qBuyer = query(collection(db, "chats"), where("buyerId", "==", user.uid));
        const qSeller = query(collection(db, "chats"), where("sellerId", "==", user.uid));
        
        const [buyerSnap, sellerSnap] = await Promise.all([getDocs(qBuyer), getDocs(qSeller)]);
        const allUserChats = [...buyerSnap.docs, ...sellerSnap.docs];
        
        let deletedCount = 0;
        for (const chatDoc of allUserChats) {
          const messagesRef = collection(db, "chats", chatDoc.id, "messages");
          // Fetch messages older than threshold
          const qMessages = query(
            messagesRef,
            where("createdAt", "<", thresholdDate),
            orderBy("createdAt", "asc")
          );
          
          const msgSnap = await getDocs(qMessages);
          if (!msgSnap.empty) {
            const batch = writeBatch(db);
            msgSnap.docs.forEach((d) => {
              batch.delete(d.ref);
            });
            await batch.commit();
            deletedCount += msgSnap.size;
          }
        }
        
        // Update lastCleanupAt in user profile
        await updateDoc(doc(db, "users", user.uid), {
          lastChatCleanupAt: serverTimestamp()
        });
        
        if (deletedCount > 0) {
          console.log(`[Chat Cleanup] Successfully cleared ${deletedCount} old messages.`);
        }
      } catch (err) {
        console.error("[Chat Cleanup] Error during background maintenance:", err);
      }
    };

    if (userProfile && chats.length >= 0) {
      runCleanup();
    }
  }, [user, userProfile?.autoClearHistory, userProfile?.lastChatCleanupAt]);

  const handleMessageTap = (messageId: string, e: React.MouseEvent | React.TouchEvent) => {
    if (selectedMessageIds.size > 0) {
      e.stopPropagation();
      setSelectedMessageIds((prev) => {
        const next = new Set(prev);
        if (next.has(messageId)) next.delete(messageId);
        else next.add(messageId);
        return next;
      });
    }
  };

  const clearMessageSelection = () => {
    setSelectedMessageIds(new Set());
  };

  const handleCopySelected = () => {
    if (selectedMessageIds.size === 0) return;
    const selectedMsgs = messages.filter(m => selectedMessageIds.has(m.id)).sort((a, b) => {
      const aDate = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const bDate = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return aDate - bDate;
    });
    const textToCopy = selectedMsgs.map(m => m.text).filter(Boolean).join('\\n');
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
    }
    clearMessageSelection();
  };

  const handleShareSelected = () => {
    if (selectedMessageIds.size === 0) return;
    const selectedMsgs = messages.filter(m => selectedMessageIds.has(m.id)).sort((a, b) => {
      const aDate = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
      const bDate = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
      return aDate - bDate;
    });
    const textToShare = selectedMsgs.map(m => m.text).filter(Boolean).join('\\n');
    if (textToShare && navigator.share) {
      navigator.share({
        title: 'Chat Messages',
        text: textToShare
      }).catch(console.error);
    } else if (textToShare) {
      navigator.clipboard.writeText(textToShare);
    }
    clearMessageSelection();
  };

  const handleSelectAll = () => {
    const allIds = new Set(messages.map(m => m.id));
    setSelectedMessageIds(allIds);
  };

  const handleDeleteSelectedMessages = async () => {
    if (!activeChatId || !user || selectedMessageIds.size === 0) return;

    setConfirmation({
      isOpen: true,
      title: "Delete Messages",
      message: `Are you sure you want to delete ${selectedMessageIds.size} message(s)? This action is irreversible and will only delete them for you.`,
      onConfirm: async () => {
        try {
          const activeChat = chats.find((c) => c.id === activeChatId);
          const otherUserId = activeChat?.otherPartyId;

          const deletePromises = Array.from(selectedMessageIds).map(
            async (messageId: any) => {
              const msgRef = doc(
                db,
                "chats",
                activeChatId,
                "messages",
                messageId as string,
              );
              const msgSnap = await getDoc(msgRef);
              if (msgSnap.exists()) {
                const deletedForUsers = msgSnap.data().deletedForUsers || [];
                if (otherUserId && deletedForUsers.includes(otherUserId)) {
                  await deleteDoc(msgRef);
                } else {
                  await updateDoc(msgRef, {
                    deletedForUsers: arrayUnion(user.uid),
                  });
                }
              }
            },
          );
          await Promise.all(deletePromises);

          setMessages((prev) =>
            prev.filter((m) => !selectedMessageIds.has(m.id)),
          );
          clearMessageSelection();
        } catch (e) {
          console.error("Failed to delete selected messages:", e);
          handleFirestoreError(e, OperationType.WRITE, "chats/messages");
        }
      },
    });
  };

  const handlePressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handlePressMove = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  // Real-time block list synchronization
  useEffect(() => {
    if (!user) return;

    const qMyBlocks = query(
      collection(db, "blocks"),
      where("blockerId", "==", user.uid)
    );
    const unsubMyBlocks = onSnapshot(qMyBlocks, async (snapshot) => {
      const blockedIds = snapshot.docs.map((d) => d.data().blockedId as string);
      setMyBlocks(blockedIds);

      // Fetch user profile details for each blocked user ID
      const details = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          const bId = data.blockedId;
          const createdAt = data.createdAt;

          let uData = userCacheRef.current[bId];
          if (!uData) {
            try {
              const uSnap = await getDoc(doc(db, "users", bId));
              if (uSnap.exists()) {
                uData = uSnap.data();
                userCacheRef.current[bId] = uData;
              }
            } catch (err) {
              console.error("Failed to fetch blocked user profile:", err);
            }
          }

          return {
            blockedId: bId,
            createdAt: createdAt || null,
            name: uData?.name || uData?.displayName || "Avora User",
            photoURL: uData?.photoURL || "",
            isVerified: uData?.isVerified || false,
            verifiedBadgeType: uData?.verifiedBadgeType || "",
            isPremiumVerified: uData?.isPremiumVerified || false,
            isKycVerified: uData?.isKycVerified || false,
          };
        })
      );

      // Sort by blocked date descending
      details.sort((a, b) => {
        const getMs = (t: any) => {
          if (!t) return 0;
          if (typeof t.toMillis === "function") return t.toMillis();
          if (typeof t.toDate === "function") return t.toDate().getTime();
          if (t.seconds) return t.seconds * 1000;
          return new Date(t).getTime();
        };
        return getMs(b.createdAt) - getMs(a.createdAt);
      });

      setBlockedUsersInfo(details);
    }, (error) => {
      if (error?.code === "resource-exhausted") {
        console.warn("My blocks snapshot listener quota exceeded");
      } else {
        handleFirestoreError(error, OperationType.GET, "blocks (my blocks)");
      }
    });

    const qBlockedMe = query(
      collection(db, "blocks"),
      where("blockedId", "==", user.uid)
    );
    const unsubBlockedMe = onSnapshot(qBlockedMe, (snapshot) => {
      const blockerIds = snapshot.docs.map((d) => d.data().blockerId as string);
      setBlockedByUsers(blockerIds);
    }, (error) => {
      if (error?.code === "resource-exhausted") {
        console.warn("Blocked me snapshot listener quota exceeded");
      } else {
        handleFirestoreError(error, OperationType.GET, "blocks (blocked me)");
      }
    });

    return () => {
      unsubMyBlocks();
      unsubBlockedMe();
    };
  }, [user]);

  // Global user search profile fetching with 300ms debounce and race/stale-request protection
  useEffect(() => {
    if (!user || !searchQuery.trim()) {
      setGlobalUsers([]);
      return;
    }

    const currentRequestId = ++searchRequestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const q = query(collection(db, "users"), limit(200));
        const snap = await getDocs(q);
        if (currentRequestId === searchRequestIdRef.current) {
          const list = snap.docs
            .map((d) => ({ ...d.data(), uid: d.id }))
            .filter((u) => u.uid !== user.uid);
          setGlobalUsers(list);
        }
      } catch (e) {
        console.error("Failed to fetch global users for search:", e);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery, user]);

  // URL query parameter synchronization to activeChatId
  useEffect(() => {
    const urlChatId = searchParams.get("chatId");
    if (urlChatId && urlChatId !== activeChatId) {
      if (user) {
        setActiveChatId(urlChatId);
        setShowMobileChat(true);
      }
    }
  }, [searchParams, user]);

  // activeChatId synchronization to URL query parameter with replace semantics
  useEffect(() => {
    if (activeChatId) {
      if (searchParams.get("chatId") !== activeChatId) {
        setSearchParams({ chatId: activeChatId }, { replace: true });
      }
    } else if (searchParams.has("chatId")) {
      setSearchParams({}, { replace: true });
    }
  }, [activeChatId, searchParams, setSearchParams]);

  useEffect(() => {
    if (location.state?.activeChatId && user) {
      const activeId = location.state.activeChatId;
      setActiveChatId(activeId);
      setShowMobileChat(true);
      if (searchParams.get("chatId") !== activeId) {
        setSearchParams({ chatId: activeId }, { replace: true });
      }
      if (location.state?.forceNewSession) {
        setNewMessage("");
        setIsOffer(false);
        setOfferAmount("");
      }

      // Auto-restore / undelete the conversation if it was deleted for us
      if (!IS_READONLY_INSPECTION_MODE) {
        (async () => {
          try {
            const chatDocRef = doc(db, "chats", activeId);
            const chatSnap = await getDoc(chatDocRef);
            if (chatSnap.exists()) {
              const chatData = chatSnap.data();
              const isBuyer = chatData.buyerId === user.uid;
              const wasDeleted = isBuyer ? chatData.isDeletedBuyer : chatData.isDeletedSeller;
              if (wasDeleted) {
                const updateField = isBuyer ? "isDeletedBuyer" : "isDeletedSeller";
                await updateDoc(chatDocRef, {
                  [updateField]: false,
                });
              }
            }
          } catch (err) {
            console.error("Failed to auto-restore chat on load:", err);
          }
        })();
      }

      // Clear state after handling while preserving current URL query params
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: {} });
    }
  }, [location, navigate, user, searchParams, setSearchParams]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    let buyerChats: any[] = [];
    let sellerChats: any[] = [];
    let isInitialLoad = true;

    const processAndEnrichChats = async () => {
      const combinedMap = new Map<string, any>();
      buyerChats.forEach((c) => combinedMap.set(c.id, c));
      sellerChats.forEach((c) => combinedMap.set(c.id, c));
      const allChats = Array.from(combinedMap.values());

      const sortedAllChats = sortChats(allChats);

      const enrichedChats = await Promise.all(
        sortedAllChats.map(async (c) => {
          try {
            const otherPartyId = c.buyerId === user.uid ? c.sellerId : c.buyerId;

            let uData = userCacheRef.current[otherPartyId] || null;
            if (!uData) {
              try {
                const uSnap = await getDoc(doc(db, "users", otherPartyId));
                if (uSnap.exists()) {
                  uData = uSnap.data();
                  userCacheRef.current[otherPartyId] = uData;
                }
              } catch (err) {
                console.error("Failed to fetch user in chat enrichment:", err);
              }
            }

            let otherPartyName = c.buyerId === user.uid ? "Seller" : "Buyer";
            let otherPartyUsername = "";
            let otherPartyPhoto = "";
            let otherPartyIsVerified = false;
            let otherPartyVerifiedBadgeType = "";
            let otherPartyIsPremiumVerified = false;
            let otherPartyIsKycVerified = false;

            if (uData) {
              otherPartyName = uData.name || uData.displayName || otherPartyName;
              otherPartyUsername = uData.username || "";
              otherPartyPhoto = uData.photoURL || "";
              otherPartyIsVerified = uData.isVerified || false;
              otherPartyVerifiedBadgeType = uData.verifiedBadgeType || "";
              otherPartyIsPremiumVerified = uData.isPremiumVerified || false;
              otherPartyIsKycVerified = uData.isKycVerified || false;
            }

            if (c.listingId === "PROFILE_CHAT" || !c.listingId) {
              return {
                ...c,
                listingTitle: otherPartyName,
                listingImage: otherPartyPhoto,
                otherPartyName: "Direct Message",
                otherPartyUsername,
                isProfileChat: true,
                otherPartyId,
                otherPartyIsVerified,
                otherPartyVerifiedBadgeType,
                otherPartyIsPremiumVerified,
                otherPartyIsKycVerified,
              };
            }

            let listing = listingCacheRef.current[c.listingId];
            if (listing === undefined) {
              try {
                const listSnap = await getDocs(
                  query(
                    collection(db, "listings"),
                    where("__name__", "==", c.listingId),
                  ),
                );
                listing = listSnap.docs[0]?.data() || null;

                if (!listing) {
                  const auctionSnap = await getDoc(doc(db, "arena_auctions", c.listingId));
                  if (auctionSnap.exists()) {
                    listing = {
                      ...auctionSnap.data(),
                      isAuction: true,
                    };
                  }
                }

                listingCacheRef.current[c.listingId] = listing;
              } catch (err) {
                console.error("Failed to fetch listing or auction in chat enrichment:", err);
                listing = null;
              }
            }

            return {
              ...c,
              listingTitle: listing?.title || "Unknown Listing",
              listingImage: listing?.images?.[0] || "",
              otherPartyName: otherPartyName,
              otherPartyUsername,
              isProfileChat: false,
              otherPartyId,
              otherPartyIsVerified,
              otherPartyVerifiedBadgeType,
              otherPartyIsPremiumVerified,
              otherPartyIsKycVerified,
              isAuction: listing?.isAuction || false,
            };
          } catch {
            return c;
          }
        })
      );

      setChats(enrichedChats);

      // Asynchronously process and update delivered/seen message statuses for enrichedChats
      if (!IS_READONLY_INSPECTION_MODE) {
        enrichedChats.forEach(async (c) => {
          if (c.lastMessageSenderId && c.lastMessageSenderId !== user.uid) {
            const isCurrentlyActive = activeChatIdRef.current === c.id;
            if (isCurrentlyActive) {
              // If recipient is viewing this chat, mark last message status as 'seen'
              if (c.lastMessageStatus !== "seen") {
                try {
                  await updateDoc(doc(db, "chats", c.id), {
                    lastMessageStatus: "seen",
                  });
                  if (c.lastMessageId) {
                    await updateDoc(doc(db, "chats", c.id, "messages", c.lastMessageId), {
                      status: "seen",
                    });
                  }
                } catch (e) {
                  console.error("Error setting status to seen in background:", e);
                }
              }
            } else {
              // If recipient has received this chat update but is not active, mark last message status as 'delivered'
              if (c.lastMessageStatus === "sent") {
                try {
                  await updateDoc(doc(db, "chats", c.id), {
                    lastMessageStatus: "delivered",
                  });
                  if (c.lastMessageId) {
                    await updateDoc(doc(db, "chats", c.id, "messages", c.lastMessageId), {
                      status: "delivered",
                    });
                  }
                } catch (e) {
                  console.error("Error setting status to delivered in background:", e);
                }
              }
            }
          }
        });
      }

      if (enrichedChats.length > 0) {
        const requestedId = searchParams.get("chatId") || activeChatIdRef.current;
        if (requestedId) {
          const matchedChat = enrichedChats.find((c) => c.id === requestedId);
          if (matchedChat) {
            if (activeChatIdRef.current !== requestedId) {
              setActiveChatId(requestedId);
            }
            const isBuyer = matchedChat.buyerId === user.uid;
            const isArchived = isBuyer ? matchedChat.isArchivedBuyer : matchedChat.isArchivedSeller;
            if (isArchived && isInitialLoad) {
              setActiveTab("archived");
            }
          } else if (isInitialLoad) {
            // Requested chatId does not exist in authorized enrichedChats
            setActiveChatId(enrichedChats[0].id);
          }
        } else if (isInitialLoad) {
          setActiveChatId(enrichedChats[0].id);
        }
      } else if (isInitialLoad) {
        setActiveChatId(null);
      }
      setLoading(false);
      isInitialLoad = false;
    };

    const qBuyer = query(
      collection(db, "chats"),
      where("buyerId", "==", user.uid),
    );
    const qSeller = query(
      collection(db, "chats"),
      where("sellerId", "==", user.uid),
    );

    const unsubBuyer = onSnapshot(
      qBuyer,
      (snapshot) => {
        buyerChats = snapshot.docs.map((d) => ({ ...d.data({ serverTimestamps: "estimate" }), id: d.id }));
        processAndEnrichChats();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "chats");
        setLoading(false);
      }
    );

    const unsubSeller = onSnapshot(
      qSeller,
      (snapshot) => {
        sellerChats = snapshot.docs.map((d) => ({ ...d.data({ serverTimestamps: "estimate" }), id: d.id }));
        processAndEnrichChats();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "chats");
        setLoading(false);
      }
    );

    return () => {
      unsubBuyer();
      unsubSeller();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !activeChatId) return;

    // Mark as read when opening chat
    const markAsRead = async () => {
      if (IS_READONLY_INSPECTION_MODE) return;
      const activeChat = chats.find((c) => c.id === activeChatId);
      if (!activeChat) return;

      const isBuyer = activeChat.buyerId === user.uid;
      const unreadCount = isBuyer
        ? activeChat.unreadCountBuyer
        : activeChat.unreadCountSeller;

      if (unreadCount && unreadCount > 0) {
        try {
          await updateDoc(doc(db, "chats", activeChatId), {
            [isBuyer ? "unreadCountBuyer" : "unreadCountSeller"]: 0,
          });
        } catch (e) {
          console.error("Failed to mark as read:", e);
        }
      }
    };
    markAsRead();

    const messagesRef = collection(db, "chats", activeChatId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs
          .map((d) => ({ ...d.data(), id: d.id }) as Message)
          .filter((msg) => !msg.deletedForUsers?.includes(user.uid));
        setMessages(msgs);

        // Update our local activity map with the latest message's timestamp!
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg) {
          const getMsgTime = (m: any) => {
            const cd = m.createdAt;
            if (!cd) return Date.now();
            if (typeof cd.toMillis === "function") return cd.toMillis();
            if (typeof cd.toDate === "function") return cd.toDate().getTime();
            if (cd.seconds) return cd.seconds * 1000;
            if (typeof cd === "string" || typeof cd === "number") return new Date(cd).getTime();
            if (cd instanceof Date) return cd.getTime();
            return Date.now();
          };
          const msgTime = getMsgTime(lastMsg);
          if (msgTime && !isNaN(msgTime)) {
            latestActivityMapRef.current[activeChatId] = msgTime;
          }
        }

        // Mark any unseen messages sent by the other party as 'seen'
        if (!IS_READONLY_INSPECTION_MODE) {
          const unseenMsgs = msgs.filter((msg) => msg.senderId !== user.uid && msg.status !== "seen");
          if (unseenMsgs.length > 0) {
            unseenMsgs.forEach(async (msg) => {
              try {
                await updateDoc(doc(db, "chats", activeChatId, "messages", msg.id), {
                  status: "seen",
                });
              } catch (e) {
                console.error("Failed to mark message as seen:", e);
              }
            });
          }

          // Also update the chat document's lastMessageStatus to 'seen' if the last message is unseen and sent by the other party
          if (lastMsg && lastMsg.senderId !== user.uid && lastMsg.status !== "seen") {
            try {
              updateDoc(doc(db, "chats", activeChatId), {
                lastMessageStatus: "seen",
              });
            } catch (e) {
              console.error("Failed to mark chat as seen:", e);
            }
          }
        }

        setTimeout(
          () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
          100,
        );
      },
      (error: any) => {
        if (error?.code === "resource-exhausted") {
          console.warn("Messages listener: Quota exceeded");
        } else {
          handleFirestoreError(
            error,
            OperationType.GET,
            `chats/${activeChatId}/messages`,
          );
        }
      },
    );

    return unsubscribe;
  }, [activeChatId, user]);

  const activeChat = chats.find((c) => c.id === activeChatId);
  const activeOtherPartyId = activeChat?.otherPartyId;
  const activeListingId = activeChat?.listingId;
  const activeBuyerId = activeChat?.buyerId;

  useEffect(() => {
    if (!user || !activeChatId || !activeOtherPartyId) {
      setOtherPartyProfile(null);
      setLinkedAuction(null);
      setLinkedNegotiation(null);
      return;
    }

    const fetchLinkedInfo = async () => {
      setLoadingLinkedInfo(true);
      try {
        const otherPartyId = activeOtherPartyId;
        let uData = userCacheRef.current[otherPartyId] || null;
        if (!uData) {
          const uSnap = await getDoc(doc(db, "users", otherPartyId));
          if (uSnap.exists()) {
            uData = uSnap.data();
            userCacheRef.current[otherPartyId] = uData;
          }
        }
        if (uData) {
          setOtherPartyProfile({ id: otherPartyId, ...uData });
        } else {
          setOtherPartyProfile(null);
        }

        if (activeListingId && activeListingId !== "PROFILE_CHAT") {
          let auctionData = listingCacheRef.current[activeListingId];
          if (auctionData === undefined) {
            const auctionSnap = await getDoc(doc(db, "arena_auctions", activeListingId));
            if (auctionSnap.exists()) {
              auctionData = { id: activeListingId, ...auctionSnap.data() };
            } else {
              auctionData = null;
            }
            listingCacheRef.current[activeListingId] = auctionData;
          }
          if (auctionData) {
            setLinkedAuction({ id: activeListingId, ...auctionData });
          } else {
            setLinkedAuction(null);
          }

          const negQuery = query(
            collection(db, "arena_negotiations"),
            where("auctionId", "==", activeListingId),
            where("buyerId", "==", activeBuyerId)
          );
          const negSnap = await getDocs(negQuery);
          if (!negSnap.empty) {
            setLinkedNegotiation({ id: negSnap.docs[0].id, ...negSnap.docs[0].data() });
          } else {
            setLinkedNegotiation(null);
          }
        } else {
          setLinkedAuction(null);
          setLinkedNegotiation(null);
        }
      } catch (err) {
        console.error("Failed to fetch conversation info details:", err);
      } finally {
        setLoadingLinkedInfo(false);
      }
    };

    fetchLinkedInfo();
  }, [activeChatId, activeOtherPartyId, activeListingId, activeBuyerId, user]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Resize/compress using canvas to be safe and efficient
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL("image/jpeg", 0.75);
          setSelectedImage(compressedBase64);
        }
        setIsUploadingImage(false);
      };
      img.onerror = () => {
        console.error("Failed to load image for compression");
        setIsUploadingImage(false);
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      console.error("Failed to read file");
      setIsUploadingImage(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSendingRef.current) return;
    if (isBlocked) {
      setShowRestricted(true);
      return;
    }
    if (!newMessage.trim() && (!isOffer || !offerAmount) && !selectedImage) return;
    if (!user || !activeChatId) return;

    if (!isOffer && newMessage.trim()) {
      const validation = antiSpamService.validateMessage(newMessage, activeChatId);
      if (!validation.isValid) {
        setSpamError(validation.errorMessage || "An error occurred.");
        alert(validation.errorMessage);
        return;
      }
    }
    setSpamError(null);

    const activeChat = chats.find((c) => c.id === activeChatId);
    if (!activeChat) return;

    const otherPartyId = activeChat.otherPartyId;
    const isBlockedByMe = otherPartyId ? myBlocks.includes(otherPartyId) : false;
    const isBlockedByOther = otherPartyId ? blockedByUsers.includes(otherPartyId) : false;
    if (activeChat.isBlocked || isBlockedByMe || isBlockedByOther) {
      alert("Messaging is disabled because this conversation is blocked.");
      return;
    }

    const capturedText = newMessage.trim();
    const capturedIsOffer = isOffer;
    const capturedOfferAmount = offerAmount;
    const capturedImage = selectedImage;

    // Acquire local send lock
    isSendingRef.current = true;

    // Retrieve existing draft-bound intent ID or instantiate a new UUID for this chat's composition
    const clientMsgId = draftIntentMapRef.current[activeChatId] || crypto.randomUUID();
    draftIntentMapRef.current[activeChatId] = clientMsgId;

    // Optimistically clear the message input
    setNewMessage("");
    setIsOffer(false);
    setOfferAmount("");
    setSelectedImage(null);
    latestActivityMapRef.current[activeChatId] = Date.now();

    try {
      const msgRef = doc(db, "chats", activeChatId, "messages", clientMsgId);
      const msgData: any = {
        senderId: user.uid,
        text: capturedText || (capturedImage ? "📷 Sent an image" : ""),
        isOffer: capturedIsOffer,
        createdAt: serverTimestamp(),
        status: "sent",
      };

      if (capturedImage) {
        msgData.image = capturedImage;
      }

      if (capturedIsOffer && capturedOfferAmount) {
        msgData.offerAmount = Number(capturedOfferAmount);
        msgData.text = `Offered ${formatPKR(Number(capturedOfferAmount))}`;
      }

      const isBuyer = activeChat.buyerId === user.uid;

      // Atomic write batch: message creation + parent chat metadata update
      const batch = writeBatch(db);

      // Write 1: Subcollection message document at deterministic path
      batch.set(msgRef, msgData);

      // Write 2: Parent chat document metadata update referencing clientMsgId
      batch.update(doc(db, "chats", activeChatId), {
        lastMessage: msgData.text,
        lastMessageId: clientMsgId,
        lastMessageSenderId: user.uid,
        lastMessageStatus: "sent",
        updatedAt: serverTimestamp(),
        isDeletedBuyer: false,
        isDeletedSeller: false,
        [isBuyer ? "unreadCountSeller" : "unreadCountBuyer"]: increment(1),
      });

      // Commit the atomic batch
      await batch.commit();

      // Clear the draft-bound intent ID upon confirmed successful commit
      delete draftIntentMapRef.current[activeChatId];

      // Dispatch notification if the recipient has not muted the chat
      const isMutedByRecipient = isBuyer ? activeChat.isMutedSeller : activeChat.isMutedBuyer;
      if (!isMutedByRecipient && otherPartyId) {
        await sendNotification(
          otherPartyId,
          activeChat.listingTitle || "New Message",
          `${user.displayName || "Someone"} sent you a message: "${msgData.text}"`,
          "message",
          activeChatId
        );
      }

      if (!capturedIsOffer) {
        antiSpamService.recordMessage(capturedText, activeChatId);
      }
    } catch (e) {
      console.error("Failed to send message atomically:", e);
      // Restore input on failure and retain the draft-bound intent ID in draftIntentMapRef
      setNewMessage(capturedText);
      setIsOffer(capturedIsOffer);
      setOfferAmount(capturedOfferAmount);
      setSelectedImage(capturedImage);
      alert("Failed to send message.");
    } finally {
      // Always release the local send lock
      isSendingRef.current = false;
    }
  };

  const handleToggleAdminBadgeOnChatUser = async (otherPartyId: string, currentStatus: boolean, otherPartyName: string) => {
    if (!user || !otherPartyId) return;

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

    const actionText = currentStatus ? "REVOKE" : "ISSUE PREMIUM SELLER BADGE";
    if (!window.confirm(`Are you sure you want to ${actionText} Premium Seller Badge for ${otherPartyName}?`)) {
      return;
    }

    try {
      if (!currentStatus) {
        // Fetch user to check KYC status
        const uDoc = await getDoc(doc(db, "users", otherPartyId));
        if (uDoc.exists()) {
          const uData = uDoc.data();
          if (uData.kycStatus !== "APPROVED") {
            alert("Cannot issue Premium Seller Badge: User does not have an APPROVED KYC identity verification.");
            return;
          }
        }
      }

      const updateData: any = {
        isVerified: !currentStatus,
        verifiedBadgeType: !currentStatus ? "GOLDEN" : null,
        isPremiumVerified: !currentStatus,
        verifiedBadgeRequestStatus: !currentStatus ? "APPROVED" : "NONE",
      };

      if (!currentStatus) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        updateData.verifiedUntil = expiryDate;
      } else {
        updateData.verifiedUntil = null;
      }

      await setDoc(doc(db, "users", otherPartyId), updateData, { merge: true });

      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        userId: otherPartyId,
        title: currentStatus
          ? "Verified Badge Revoked"
          : "Verified Badge Issued!",
        message: currentStatus
          ? "Your Premium Seller Badge has been revoked by an administrator."
          : `Congratulations! An administrator has issued a Premium Seller Badge to your account for 30 days.`,
        type: "VERIFIED",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      setChats((prev) =>
        prev.map((c) =>
          c.otherPartyId === otherPartyId
            ? {
                ...c,
                otherPartyIsVerified: !currentStatus,
                otherPartyVerifiedBadgeType: !currentStatus ? "GOLDEN" : "",
                otherPartyIsPremiumVerified: !currentStatus,
              }
            : c
        )
      );

      alert(currentStatus ? "Badge successfully revoked!" : "Premium Seller Badge successfully issued for 30 Days immediately!");
    } catch (err: any) {
      console.error(err);
      alert("Verification update failed. Try again.");
    }
  };

  const handleToggleBlockGlobal = async (targetUserId: string, targetName: string) => {
    if (!user) return;
    const isCurrentlyBlocked = myBlocks.includes(targetUserId);
    const confirmMsg = isCurrentlyBlocked
      ? `Are you sure you want to unblock ${targetName}?`
      : `Are you sure you want to block ${targetName}? You will no longer send or receive messages.`;

    setConfirmation({
      isOpen: true,
      title: isCurrentlyBlocked ? "Unblock User" : "Block User",
      message: confirmMsg,
      confirmLabel: isCurrentlyBlocked ? "Unblock" : "Block",
      isDestructive: !isCurrentlyBlocked,
      onConfirm: async () => {
        try {
          const blockId = `${user.uid}_${targetUserId}`;
          
          // Optimistic local update
          if (isCurrentlyBlocked) {
            setMyBlocks((prev) => prev.filter((id) => id !== targetUserId));
          } else {
            setMyBlocks((prev) => [...prev, targetUserId]);
          }

          setChats((prev) =>
            prev.map((c) =>
              c.otherPartyId === targetUserId && (isCurrentlyBlocked ? c.blockedBy === user.uid : true)
                ? {
                    ...c,
                    isBlocked: !isCurrentlyBlocked,
                    blockedBy: !isCurrentlyBlocked ? user.uid : null,
                  }
                : c,
            ),
          );

          if (isCurrentlyBlocked) {
            // Delete all matching block documents to ensure robust unblocking
            const blockQuery = query(collection(db, "blocks"), where("blockerId", "==", user.uid), where("blockedId", "==", targetUserId));
            const snap = await getDocs(blockQuery);
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
            
            // Also unblock any chats between these two users
            const affectedChats = chats.filter(c => c.otherPartyId === targetUserId && c.isBlocked && c.blockedBy === user.uid);
            await Promise.all(affectedChats.map(chat => 
              updateDoc(doc(db, "chats", chat.id), {
                isBlocked: false,
                blockedBy: null,
              })
            ));
          } else {
            await setDoc(doc(db, "blocks", blockId), {
              blockerId: user.uid,
              blockedId: targetUserId,
              createdAt: serverTimestamp(),
            });

            // Also block any chats between these two users
            const affectedChats = chats.filter(c => c.otherPartyId === targetUserId && (!c.isBlocked || c.blockedBy !== user.uid));
            await Promise.all(affectedChats.map(chat => 
              updateDoc(doc(db, "chats", chat.id), {
                isBlocked: true,
                blockedBy: user.uid,
              })
            ));
          }
        } catch (e) {
          console.error("Failed to toggle global block:", e);
          // Revert optimistic update on failure
          if (isCurrentlyBlocked) {
            setMyBlocks((prev) => [...prev, targetUserId]);
          } else {
            setMyBlocks((prev) => prev.filter((id) => id !== targetUserId));
          }
          setChats((prev) =>
            prev.map((c) =>
              c.otherPartyId === targetUserId && (isCurrentlyBlocked ? true : c.blockedBy === user.uid)
                ? {
                    ...c,
                    isBlocked: isCurrentlyBlocked,
                    blockedBy: isCurrentlyBlocked ? user.uid : null,
                  }
                : c,
            ),
          );
          alert("Failed to update block status.");
        }
      }
    });
  };

  const handleStartDirectChat = async (targetUser: any) => {
    if (!user) return;
    try {
      const existing = chats.find(
        (c) =>
          (c.buyerId === user.uid && c.sellerId === targetUser.uid) ||
          (c.buyerId === targetUser.uid && c.sellerId === user.uid)
      );
      if (existing) {
        const isBuyer = existing.buyerId === user.uid;
        const wasDeleted = isBuyer ? existing.isDeletedBuyer : existing.isDeletedSeller;
        if (wasDeleted) {
          try {
            const updateField = isBuyer ? "isDeletedBuyer" : "isDeletedSeller";
            await updateDoc(doc(db, "chats", existing.id), {
              [updateField]: false,
            });
          } catch (err) {
            console.error("Failed to auto-restore chat in handleStartDirectChat:", err);
          }
        }
        setActiveChatId(existing.id);
        setShowMobileChat(true);
        setSearchQuery("");
        return;
      }

      const chatRef = doc(collection(db, "chats"));
      const chatData = {
        listingId: "PROFILE_CHAT",
        buyerId: user.uid,
        sellerId: targetUser.uid,
        lastMessage: "Direct chat initiated.",
        updatedAt: serverTimestamp(),
        unreadCountSeller: 0,
        unreadCountBuyer: 0,
        isArchivedBuyer: false,
        isArchivedSeller: false,
        isDeletedBuyer: false,
        isDeletedSeller: false,
        isBlocked: false,
        status: "ACCEPTED",
        initiatorId: user.uid,
      };
      await setDoc(chatRef, chatData);

      const newChat = {
        ...chatData,
        id: chatRef.id,
        listingTitle: targetUser.name || targetUser.displayName || "Direct Message",
        listingImage: targetUser.photoURL || "",
        otherPartyName: "Direct Message",
        isProfileChat: true,
        otherPartyId: targetUser.uid,
        otherPartyIsVerified: targetUser.isVerified || false,
        otherPartyVerifiedBadgeType: targetUser.verifiedBadgeType || "",
        otherPartyIsPremiumVerified: targetUser.isPremiumVerified || false,
        otherPartyIsKycVerified: targetUser.isKycVerified || false,
      };

      setChats((prev) => [newChat as any, ...prev]);
      setActiveChatId(chatRef.id);
      setShowMobileChat(true);
      setSearchQuery("");
    } catch (e) {
      console.error("Failed to start direct chat:", e);
      alert("Failed to start conversation.");
    }
  };

  const handleToggleBlock = async (chatId: string) => {
    if (!user) return;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    const otherPartyId = chat.otherPartyId;
    if (!otherPartyId) return;

    const currentlyBlocked = (chat.isBlocked && chat.blockedBy === user.uid) || myBlocks.includes(otherPartyId);
    const confirmMsg = currentlyBlocked
      ? `Are you sure you want to unblock ${chat.otherPartyName || "this user"}?`
      : `Are you sure you want to block ${chat.otherPartyName || "this user"}? You will no longer send or receive messages.`;

    setConfirmation({
      isOpen: true,
      title: currentlyBlocked ? "Unblock User" : "Block User",
      message: confirmMsg,
      confirmLabel: currentlyBlocked ? "Unblock" : "Block",
      isDestructive: !currentlyBlocked,
      onConfirm: async () => {
        try {
          const blockId = `${user.uid}_${otherPartyId}`;
          
          // Optimistic local state updates
          if (currentlyBlocked) {
            setMyBlocks((prev) => prev.filter((id) => id !== otherPartyId));
          } else {
            setMyBlocks((prev) => [...prev, otherPartyId]);
          }

          setChats((prev) =>
            prev.map((c) =>
              c.otherPartyId === otherPartyId && (currentlyBlocked ? c.blockedBy === user.uid : true)
                ? {
                    ...c,
                    isBlocked: !currentlyBlocked,
                    blockedBy: !currentlyBlocked ? user.uid : null,
                  }
                : c,
            ),
          );

          if (currentlyBlocked) {
            // Delete all matching block documents to ensure robust unblocking
            const blockQuery = query(collection(db, "blocks"), where("blockerId", "==", user.uid), where("blockedId", "==", otherPartyId));
            const snap = await getDocs(blockQuery);
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));

            // Also unblock any other chats between these two users
            const affectedChats = chats.filter(c => c.otherPartyId === otherPartyId && c.isBlocked && c.blockedBy === user.uid);
            await Promise.all(affectedChats.map(c => 
              updateDoc(doc(db, "chats", c.id), {
                isBlocked: false,
                blockedBy: null,
              })
            ));
          } else {
            await setDoc(doc(db, "blocks", blockId), {
              blockerId: user.uid,
              blockedId: otherPartyId,
              createdAt: serverTimestamp(),
            });

            // Also block any other chats between these two users
            const affectedChats = chats.filter(c => c.otherPartyId === otherPartyId && (!c.isBlocked || c.blockedBy !== user.uid));
            await Promise.all(affectedChats.map(c => 
              updateDoc(doc(db, "chats", c.id), {
                isBlocked: true,
                blockedBy: user.uid,
              })
            ));
          }

          setShowChatOptions(false);
          setMenuChatId(null);
        } catch (e) {
          console.error(e);
          // Revert optimistic state updates
          if (currentlyBlocked) {
            setMyBlocks((prev) => [...prev, otherPartyId]);
          } else {
            setMyBlocks((prev) => prev.filter((id) => id !== otherPartyId));
          }
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    isBlocked: currentlyBlocked,
                    blockedBy: currentlyBlocked ? user.uid : null,
                  }
                : c,
            ),
          );
          alert("Failed to update block status.");
        }
      }
    });
  };

  const handleAcceptRequest = async (chatId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "chats", chatId), {
        status: "ACCEPTED",
      });
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, status: "ACCEPTED" } : c)),
      );
    } catch (e) {
      console.error("Failed to accept message request:", e);
      alert("Failed to accept message request.");
    }
  };

  const handleIgnoreRequest = async (chatId: string) => {
    if (!user) return;
    if (!confirm("Are you sure you want to ignore this request? It will be removed from your requests.")) return;
    try {
      await updateDoc(doc(db, "chats", chatId), {
        status: "IGNORED",
      });
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, status: "IGNORED" } : c)),
      );
      // Deselect if active
      if (activeChatIdRef.current === chatId) {
        setActiveChatId(null);
        closeMobileChat();
      }
    } catch (e) {
      console.error("Failed to ignore message request:", e);
      alert("Failed to ignore message request.");
    }
  };

  const handleToggleArchive = (chatId: string | null) => {
    if (!user || !chatId) return;
    if (archivingChatIdsRef.current.has(chatId)) return;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    const isBuyer = chat.buyerId === user.uid;
    const isArchived = isBuyer ? chat.isArchivedBuyer : chat.isArchivedSeller;

    setShowChatOptions(false);
    setMenuChatId(null);

    setConfirmation({
      isOpen: true,
      title: isArchived ? "Unarchive Conversation" : "Archive Conversation",
      message: isArchived
        ? "Are you sure you want to unarchive this conversation? It will be returned to your inbox."
        : "Are you sure you want to archive this conversation? It will disappear from your inbox but remain searchable in the Archived tab.",
      confirmLabel: isArchived ? "Unarchive" : "Archive",
      isDestructive: false,
      onConfirm: async () => {
        if (archivingChatIdsRef.current.has(chatId)) return;
        archivingChatIdsRef.current.add(chatId);

        const prevArchived = isArchived;
        const newArchived = !prevArchived;

        // Optimistic local state update
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  [isBuyer ? "isArchivedBuyer" : "isArchivedSeller"]: newArchived,
                }
              : c,
          ),
        );

        try {
          await updateDoc(doc(db, "chats", chatId), {
            [isBuyer ? "isArchivedBuyer" : "isArchivedSeller"]: newArchived,
          });
        } catch (e) {
          console.error("Failed to update archive status:", e);
          // Rollback to previous state on failure
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    [isBuyer ? "isArchivedBuyer" : "isArchivedSeller"]: prevArchived,
                  }
                : c,
            ),
          );
          alert("Failed to update archive status. Please try again.");
        } finally {
          archivingChatIdsRef.current.delete(chatId);
        }
      },
    });
  };

  const handleToggleMute = (chatId: string | null) => {
    if (!user || !chatId) return;
    if (mutingChatIdsRef.current.has(chatId)) return;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    const isBuyer = chat.buyerId === user.uid;
    const isMuted = isBuyer ? chat.isMutedBuyer : chat.isMutedSeller;

    setShowChatOptions(false);
    setMenuChatId(null);

    setConfirmation({
      isOpen: true,
      title: isMuted ? "Unmute Notifications" : "Mute Notifications",
      message: isMuted
        ? "Are you sure you want to unmute notifications for this chat? You will receive alerts when new messages arrive."
        : "Are you sure you want to mute notifications for this chat? You will no longer receive alerts for new messages in this conversation.",
      confirmLabel: isMuted ? "Unmute" : "Mute",
      isDestructive: false,
      onConfirm: async () => {
        if (mutingChatIdsRef.current.has(chatId)) return;
        mutingChatIdsRef.current.add(chatId);

        const prevMuted = isMuted;
        const newMuted = !prevMuted;

        // Optimistic local state update
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, [isBuyer ? "isMutedBuyer" : "isMutedSeller"]: newMuted }
              : c,
          ),
        );

        try {
          await updateDoc(doc(db, "chats", chatId), {
            [isBuyer ? "isMutedBuyer" : "isMutedSeller"]: newMuted,
          });
        } catch (e) {
          console.error("Failed to update mute status:", e);
          // Rollback to previous state on failure
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? { ...c, [isBuyer ? "isMutedBuyer" : "isMutedSeller"]: prevMuted }
                : c,
            ),
          );
          alert("Failed to update mute status. Please try again.");
        } finally {
          mutingChatIdsRef.current.delete(chatId);
        }
      },
    });
  };

  const handleTogglePin = async (chatId: string) => {
    if (!user) return;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    const isBuyer = chat.buyerId === user.uid;
    const isPinned = isBuyer ? chat.isPinnedBuyer : chat.isPinnedSeller;

    if (!isPinned) {
      const currentPinnedCount = chats.filter((c) => {
        const isBuyerC = c.buyerId === user.uid;
        const isDeletedC = isBuyerC ? c.isDeletedBuyer : c.isDeletedSeller;
        const isPinnedC = isBuyerC ? c.isPinnedBuyer : c.isPinnedSeller;
        return !isDeletedC && isPinnedC;
      }).length;

      if (currentPinnedCount >= 5) {
        alert("You can pin a maximum of 5 conversations.");
        return;
      }
    }

    try {
      await updateDoc(doc(db, "chats", chatId), {
        [isBuyer ? "isPinnedBuyer" : "isPinnedSeller"]: !isPinned,
      });
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, [isBuyer ? "isPinnedBuyer" : "isPinnedSeller"]: !isPinned }
            : c,
        )
      );
    } catch (e) {
      console.error("Failed to pin chat:", e);
      alert("Failed to update pin status.");
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!user) return;

    setConfirmation({
      isOpen: true,
      title: "Delete Conversation",
      message: "Delete this conversation permanently?\nThis action cannot be undone.",
      onConfirm: async () => {
        const chat = chats.find((c) => c.id === chatId);
        if (!chat) return;

        try {
          const isBuyer = chat.buyerId === user.uid;
          const updateField = isBuyer ? "isDeletedBuyer" : "isDeletedSeller";

          await updateDoc(doc(db, "chats", chatId), {
            [updateField]: true,
          });

          if (activeChatIdRef.current === chatId) {
            setActiveChatId(null);
          }
          setMenuChatId(null);
        } catch (e) {
          console.error("Failed to delete chat for me:", e);
          handleFirestoreError(e, OperationType.WRITE, `chats/${chatId}`);
        }
      },
    });
  };

  const handleMarkAsRead = async (chatId: string) => {
    if (!user) return;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    const isBuyer = chat.buyerId === user.uid;

    try {
      await updateDoc(doc(db, "chats", chatId), {
        [isBuyer ? "unreadCountBuyer" : "unreadCountSeller"]: 0,
      });
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, [isBuyer ? "unreadCountBuyer" : "unreadCountSeller"]: 0 }
            : c,
        ),
      );
    } catch (e) {
      console.error("Failed to mark read:", e);
    }
  };

  const handleMarkAsUnread = async (chatId: string) => {
    if (!user) return;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) return;

    const isBuyer = chat.buyerId === user.uid;

    try {
      await updateDoc(doc(db, "chats", chatId), {
        [isBuyer ? "unreadCountBuyer" : "unreadCountSeller"]: 1,
      });
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, [isBuyer ? "unreadCountBuyer" : "unreadCountSeller"]: 1 }
            : c,
        ),
      );
    } catch (e) {
      console.error("Failed to mark unread:", e);
    }
  };

  const filteredChats = useMemo(() => {
    return sortChats(
      chats.filter((chat) => {
        const isBuyer = chat.buyerId === user?.uid;
        const isDeleted = isBuyer ? chat.isDeletedBuyer : chat.isDeletedSeller;
        if (isDeleted) return false;

        const isArchived = isBuyer ? chat.isArchivedBuyer : chat.isArchivedSeller;

        if (activeTab === "archived") {
          if (!isArchived) return false;
        } else { // activeTab === "all" (Inbox)
          if (isArchived) return false;
        }

        const searchLower = searchQuery.toLowerCase();
        return (
          chat.listingTitle?.toLowerCase().includes(searchLower) ||
          chat.otherPartyName?.toLowerCase().includes(searchLower) ||
          chat.otherPartyUsername?.toLowerCase().includes(searchLower) ||
          chat.lastMessage?.toLowerCase().includes(searchLower)
        );
      })
    );
  }, [chats, activeTab, searchQuery, user?.uid]);

  const inboxCount = chats.filter((c) => {
    const isBuyer = c.buyerId === user?.uid;
    const isDeleted = isBuyer ? c.isDeletedBuyer : c.isDeletedSeller;
    const isArchived = isBuyer ? c.isArchivedBuyer : c.isArchivedSeller;
    return !isDeleted && !isArchived;
  }).length;

  const archivedCount = chats.filter((c) => {
    const isBuyer = c.buyerId === user?.uid;
    const isDeleted = isBuyer ? c.isDeletedBuyer : c.isDeletedSeller;
    const isArchived = isBuyer ? c.isArchivedBuyer : c.isArchivedSeller;
    return !isDeleted && isArchived;
  }).length;

  const inboxUnreadCount = chats.reduce((acc, c) => {
    const isBuyer = c.buyerId === user?.uid;
    const isDeleted = isBuyer ? c.isDeletedBuyer : c.isDeletedSeller;
    const isArchived = isBuyer ? c.isArchivedBuyer : c.isArchivedSeller;
    if (!isDeleted && !isArchived) {
      const count = isBuyer ? c.unreadCountBuyer : c.unreadCountSeller;
      return acc + (count && count > 0 ? count : 0);
    }
    return acc;
  }, 0);

  const archivedUnreadCount = chats.reduce((acc, c) => {
    const isBuyer = c.buyerId === user?.uid;
    const isDeleted = isBuyer ? c.isDeletedBuyer : c.isDeletedSeller;
    const isArchived = isBuyer ? c.isArchivedBuyer : c.isArchivedSeller;
    if (!isDeleted && isArchived) {
      const count = isBuyer ? c.unreadCountBuyer : c.unreadCountSeller;
      return acc + (count && count > 0 ? count : 0);
    }
    return acc;
  }, 0);

  if (!user)
    return (
      <div className="p-20 text-center">Please log in to view messages.</div>
    );
  if (isBlocked) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <RestrictedActionAlert
          isVisible={true}
          onClose={() => navigate("/")}
          message="Your account has been restricted. Messaging access is disabled until you are unblocked."
        />
        <div className="bg-white p-12 border-2 border-red-500/20 rounded-[2rem] shadow-xl flex flex-col items-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-red-500 mb-6">
            <MessageCircle className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black text-stone-900 uppercase italic tracking-tighter mb-4">
            Messages Restricted
          </h1>
          <p className="text-stone-600 mb-8 leading-relaxed font-medium">
            Your messaging access has been suspended due to a violation of our
            community safety policies. You cannot view or send messages at this
            time.
          </p>
          <div className="flex flex-col w-full gap-3">
            <button
              onClick={() => navigate("/support")}
              className="w-full bg-amber-500 text-stone-900 font-black uppercase italic tracking-widest py-4 rounded-xl hover:bg-amber-600 transition-all text-xs"
            >
              Appeal to Administration
            </button>
            <button
              onClick={() => navigate("/")}
              className="w-full bg-stone-100 text-stone-600 font-bold py-3 px-4 rounded-xl hover:bg-stone-200 transition-colors text-xs"
            >
              Return to Marketplace
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-20 text-center">Loading chats...</div>;

  const renderChatRow = (chat: any) => {
    if (!user) return null;
    const isBuyer = chat.buyerId === user.uid;
    const unreadCount = isBuyer
      ? chat.unreadCountBuyer
      : chat.unreadCountSeller;
    const isMuted = isBuyer
      ? chat.isMutedBuyer
      : chat.isMutedSeller;
    const isPinned = isBuyer
      ? chat.isPinnedBuyer
      : chat.isPinnedSeller;
    const isArchived = isBuyer
      ? chat.isArchivedBuyer
      : chat.isArchivedSeller;

    return (
      <div
        key={chat.id}
        onMouseDown={() => handlePressStart(chat.id)}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onMouseMove={handlePressMove}
        onTouchStart={() => handlePressStart(chat.id)}
        onTouchEnd={handlePressEnd}
        onTouchMove={handlePressMove}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuChatId(chat.id);
        }}
        onClick={(e) => {
          if (isLongPressRef.current) {
            isLongPressRef.current = false;
            e.stopPropagation();
            return;
          }
          setActiveChatId(chat.id);
          setSelectedMessageIds(new Set()); // Clear message selection when switching chats
          setShowMobileChat(true);
          if (unreadCount && unreadCount > 0)
            handleMarkAsRead(chat.id);
        }}
        className={`group p-4 border-b border-stone-100 cursor-pointer transition-all flex gap-3 relative select-none ${menuChatId === chat.id ? "bg-blue-50/80 border-l-4 border-l-blue-500 pl-3 ring-2 ring-blue-500/20 shadow-md animate-pulse-subtle" : (activeChatId === chat.id ? "bg-amber-500/5 border-l-4 border-l-amber-500 pl-3 hover:bg-amber-500/10" : "hover:bg-stone-50")}`}
      >
        <div className="w-12 h-12 rounded bg-stone-100 border border-stone-200 flex-shrink-0 overflow-hidden relative flex items-center justify-center text-stone-400">
          {chat.listingImage ? (
            <img
              src={chat.listingImage}
              className="w-full h-full object-cover"
              alt=""
            />
          ) : (
            <User className="w-5 h-5 text-stone-400" />
          )}
        </div>
        <div className="flex-grow overflow-hidden pr-12">
          <div className="flex items-center justify-between mb-0.5">
            <div className="font-bold text-stone-900 truncate text-sm flex items-center gap-1.5">
              {isPinned && (
                <Pin className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
              )}
              {isArchived && (
                <Archive className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
              )}
              {isMuted && (
                <BellOff className="w-3 h-3 text-stone-300" />
              )}
              {chat.listingTitle}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                {formatRelativeTime(chat.updatedAt)}
              </div>
              {unreadCount && unreadCount > 0 && (
                <div className={`px-1.5 py-0.5 min-w-[18px] h-[18px] ${isMuted ? "bg-stone-100 text-stone-400" : "bg-amber-500 text-stone-900"} text-[10px] font-black flex items-center justify-center rounded-full shadow-sm`}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </div>
              )}
            </div>
          </div>
          <div className="text-xs font-semibold text-stone-400 mb-1 flex items-center gap-1">
            <span className="truncate">{chat.otherPartyName}</span>
            {(() => {
              if (chat.otherPartyIsPremiumVerified || chat.otherPartyVerifiedBadgeType === 'GOLDEN' || chat.otherPartyVerifiedBadgeType === 'PREMIUM') {
                return <BadgeCheck className="w-3.5 h-3.5 text-amber-500 fill-amber-100 shrink-0" title="Premium Seller" />;
              }
              if (chat.otherPartyIsVerified || chat.otherPartyIsKycVerified) {
                return <BadgeCheck className="w-3.5 h-3.5 text-blue-500 fill-blue-50 shrink-0" title="Verified" />;
              }
              return null;
            })()}
          </div>
          <div
            className={`text-xs flex items-center gap-1.5 overflow-hidden ${unreadCount && unreadCount > 0 ? "text-stone-900 font-bold" : "text-stone-400"}`}
          >
            {chat.lastMessageSenderId === user?.uid && (
              <span className="shrink-0 flex items-center">
                {chat.lastMessageStatus === "seen" ? (
                  <CheckCheck className="w-4 h-4 text-amber-500" title="Seen" />
                ) : chat.lastMessageStatus === "delivered" ? (
                  <CheckCheck className="w-4 h-4 text-stone-400" title="Delivered" />
                ) : (
                  <Check className="w-4 h-4 text-stone-400" title="Sent" />
                )}
              </span>
            )}
            <span className="truncate flex-1 min-w-0">{chat.lastMessage || "Start a conversation"}</span>
          </div>
        </div>

        {/* Options menu trigger for better desktop usability & accessibility */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuChatId(chat.id)}
            className="p-2 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-700 transition-colors"
            title="Options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-0 md:px-4 h-[calc(100vh-64px)] md:h-[calc(100vh-80px)] flex flex-col overflow-hidden">
      <RestrictedActionAlert
        isVisible={showRestricted}
        onClose={() => setShowRestricted(false)}
        message="Your account has been restricted due to violating the policies of this platform. Messaging is disabled."
      />
      <div className="bg-white md:rounded-xl shadow-2xl border border-stone-200 flex-grow flex overflow-hidden relative">
        {/* Conversations Sidebar */}
        <div
          className={`w-full md:w-1/3 flex flex-col h-full border-r border-stone-200 bg-white ${showMobileChat ? "hidden md:flex" : "flex"}`}
        >
          {showSettings ? (
            <div className="flex-grow flex flex-col overflow-hidden bg-stone-50">
              {/* Settings Header */}
              <div className="p-6 border-b border-stone-100 bg-white flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowSettings(false)}
                    className="p-2 hover:bg-stone-100 rounded-xl text-stone-600 transition-colors"
                    title="Back to Messages"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-xl font-black text-stone-900 uppercase italic tracking-tighter leading-none">
                      Settings
                    </h2>
                    <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Blocked Users Management</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-stone-100 rounded-xl text-stone-400 hover:text-stone-700 transition-colors"
                  title="Close Settings"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Blocked Users Section */}
              <div className="p-6 flex-grow overflow-y-auto">
                <div className="mb-6">
                  <h3 className="text-xs font-black uppercase tracking-wider text-stone-400 mb-2">
                    Blocked Users ({blockedUsersInfo.length})
                  </h3>
                  <p className="text-xs text-stone-500 font-semibold leading-relaxed">
                    Blocked accounts will not be able to send or receive messages. You can unblock them to resume communication.
                  </p>
                </div>

                <div className="space-y-3">
                  {blockedUsersInfo.length === 0 ? (
                    <div className="p-8 text-center text-stone-400 bg-white border border-stone-100 rounded-3xl shadow-sm">
                      <Ban className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                      <div className="text-xs font-bold uppercase tracking-wide">No blocked users</div>
                    </div>
                  ) : (
                    blockedUsersInfo.map((bUser) => (
                      <div
                        key={bUser.blockedId}
                        className="p-4 bg-white rounded-3xl border border-stone-100 flex items-center justify-between gap-3 shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-center gap-3 overflow-hidden min-w-0">
                          <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 overflow-hidden shrink-0 flex items-center justify-center relative">
                            {bUser.photoURL ? (
                              <img
                                src={bUser.photoURL}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                alt=""
                              />
                            ) : (
                              <User className="w-5 h-5 text-stone-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-stone-900 text-xs truncate flex items-center gap-1">
                              {bUser.name}
                              {(bUser.isPremiumVerified || bUser.verifiedBadgeType === 'GOLDEN' || bUser.verifiedBadgeType === 'PREMIUM') && (
                                <BadgeCheck className="w-4 h-4 text-amber-500 fill-amber-100 shrink-0" title="Premium Seller" />
                              )}
                              {(bUser.isVerified || bUser.isKycVerified) && !(bUser.isPremiumVerified || bUser.verifiedBadgeType === 'GOLDEN' || bUser.verifiedBadgeType === 'PREMIUM') && (
                                <BadgeCheck className="w-4 h-4 text-blue-500 fill-blue-50 shrink-0" title="Verified" />
                              )}
                            </div>
                            {bUser.createdAt && (
                              <div className="text-[10px] font-bold text-stone-400 mt-0.5">
                                Blocked: {(() => {
                                  const cAt = bUser.createdAt;
                                  if (typeof cAt.toDate === "function") return cAt.toDate().toLocaleDateString();
                                  if (cAt.seconds) return new Date(cAt.seconds * 1000).toLocaleDateString();
                                  return new Date(cAt).toLocaleDateString();
                                })()}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleToggleBlockGlobal(bUser.blockedId, bUser.name)}
                          className="px-3 py-2 bg-stone-100 hover:bg-red-50 hover:text-red-600 rounded-xl text-[10px] font-bold text-stone-600 transition-colors shrink-0 uppercase tracking-wider"
                        >
                          Unblock
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="p-6 border-b border-stone-100 bg-stone-50/50">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-black text-stone-900 uppercase italic tracking-tighter leading-none">
                    Messages
                  </h2>
                  <button
                    onClick={() => setShowSettings(true)}
                    className="p-2 hover:bg-stone-200 text-stone-600 rounded-xl transition-all"
                    title="Settings & Blocked Users"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                </div>
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300 group-focus-within:text-amber-500 transition-colors" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    className="w-full bg-white border-stone-100 rounded-2xl pl-12 pr-6 py-3.5 text-xs font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-inner"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 mt-4 bg-stone-100/80 p-1 rounded-xl border border-stone-200/50">
                  <button
                    onClick={() => setActiveTab("all")}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === "all" ? "bg-white text-stone-900 shadow-xs border border-stone-200/30 font-extrabold" : "hover:text-stone-900 text-stone-500"}`}
                  >
                    <span>Inbox ({inboxCount})</span>
                    {inboxUnreadCount > 0 && (
                      <span className="px-1.5 py-0.5 min-w-[16px] h-[16px] bg-amber-500 text-stone-900 text-[9px] font-black flex items-center justify-center rounded-full shadow-xs">
                        {inboxUnreadCount > 9 ? "9+" : inboxUnreadCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("archived")}
                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeTab === "archived" ? "bg-white text-stone-900 shadow-xs border border-stone-200/30 font-extrabold" : "hover:text-stone-900 text-stone-500"}`}
                  >
                    <span>Archived ({archivedCount})</span>
                    {archivedUnreadCount > 0 && (
                      <span className="px-1.5 py-0.5 min-w-[16px] h-[16px] bg-amber-500 text-stone-900 text-[9px] font-black flex items-center justify-center rounded-full shadow-xs animate-pulse-subtle">
                        {archivedUnreadCount > 9 ? "9+" : archivedUnreadCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex-grow overflow-y-auto pb-20 md:pb-4">
                {!searchQuery.trim() ? (
                  filteredChats.length === 0 ? (
                    <div className="p-8 text-center text-stone-400 text-sm">
                      {activeTab === "archived"
                        ? "No archived conversations."
                        : "No messages here."}
                    </div>
                  ) : (
                    <>
                      <div className="px-4 py-2 bg-stone-100/60 text-[10px] font-black uppercase tracking-wider text-stone-400 border-b border-stone-100 flex items-center justify-between gap-1.5">
                        {activeTab === "archived" ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <Archive className="w-3.5 h-3.5 text-stone-400" />
                              <span>Archived Chats ({filteredChats.length})</span>
                            </div>
                            {archivedUnreadCount > 0 && (
                              <span className="text-[9px] font-black text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full shadow-2xs">
                                {archivedUnreadCount} unread
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span>Inbox Conversations ({filteredChats.length})</span>
                            {inboxUnreadCount > 0 && (
                              <span className="text-[9px] font-black text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full shadow-2xs">
                                {inboxUnreadCount} unread
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {filteredChats.map(renderChatRow)}
                    </>
                  )
                ) : (
                  <div>
                    {/* Existing Conversations Section */}
                    <div className="px-4 py-2 bg-stone-100/60 text-xs font-black uppercase tracking-wider text-stone-400">
                      {activeTab === "archived"
                        ? "Archived Chats"
                        : "Conversations"}{" "}
                      ({filteredChats.length})
                    </div>
                    {filteredChats.length === 0 ? (
                      <div className="p-4 text-xs font-semibold text-stone-400 text-center">
                        No matching conversations.
                      </div>
                    ) : (
                      filteredChats.map(renderChatRow)
                    )}

                    {/* Global Profiles Section */}
                    <div className="px-4 py-2 mt-4 bg-stone-100/60 text-xs font-black uppercase tracking-wider text-stone-400 flex items-center justify-between">
                      <span>Global Profiles ({
                        globalUsers.filter((u) => {
                          const name = (u.name || u.displayName || "").toLowerCase();
                          const username = (u.username || "").toLowerCase();
                          const term = searchQuery.toLowerCase();
                          return name.includes(term) || username.includes(term);
                        }).length
                      })</span>
                    </div>
                    {(() => {
                      const filteredGlobal = globalUsers.filter((u) => {
                        const name = (u.name || u.displayName || "").toLowerCase();
                        const username = (u.username || "").toLowerCase();
                        const term = searchQuery.toLowerCase();
                        return name.includes(term) || username.includes(term);
                      });

                      if (filteredGlobal.length === 0) {
                        return (
                          <div className="p-6 text-xs font-bold text-stone-400 text-center">
                            No matched user profiles found.
                          </div>
                        );
                      }

                      return filteredGlobal.map((gUser) => {
                        const isBlockedMe = blockedByUsers.includes(gUser.uid);
                        const isBlockedByMe = myBlocks.includes(gUser.uid);
                        const displayName = gUser.name || gUser.displayName || "User";

                        return (
                          <div
                            key={gUser.uid}
                            onClick={() => handleStartDirectChat(gUser)}
                            className="p-4 border-b border-stone-100 cursor-pointer hover:bg-stone-50 transition-colors flex items-center justify-between gap-3 relative"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center flex-shrink-0 text-stone-400">
                                {gUser.photoURL ? (
                                  <img src={gUser.photoURL} className="w-full h-full object-cover" alt="" />
                                ) : (
                                  <User className="w-5 h-5 text-stone-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-stone-900 text-sm truncate flex items-center gap-1">
                                  {displayName}
                                  {(gUser.isPremiumVerified || gUser.verifiedBadgeType === 'GOLDEN' || gUser.verifiedBadgeType === 'PREMIUM') && (
                                    <BadgeCheck className="w-4 h-4 text-amber-500 fill-amber-100 shrink-0" />
                                  )}
                                  {(gUser.isVerified || gUser.isKycVerified) && !(gUser.isPremiumVerified || gUser.verifiedBadgeType === 'GOLDEN' || gUser.verifiedBadgeType === 'PREMIUM') && (
                                    <BadgeCheck className="w-4 h-4 text-blue-500 fill-blue-50 shrink-0" />
                                  )}
                                </div>
                                <div className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                                  {gUser.username ? `@${gUser.username}` : "Private Account"}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Chat Area */}
        <div
          className={`w-full md:w-2/3 flex flex-col h-full bg-stone-50 ${!showMobileChat ? "hidden md:flex" : "flex"}`}
        >
          {activeChatId ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-stone-200 bg-white flex items-center gap-3 relative">
                <button
                  onClick={closeMobileChat}
                  className="md:hidden w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-stone-500 hover:bg-stone-100 hover:text-stone-950 transition-all duration-200 shrink-0"
                  title="Back to conversations list"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div className="flex-grow min-w-0">
                  <div className="font-bold text-lg text-stone-900 flex items-center gap-1.5 truncate">
                    <span className="truncate">{chats.find((c) => c.id === activeChatId)?.listingTitle}</span>
                    {(() => {
                      const activeChat = chats.find((c) => c.id === activeChatId);
                      if (activeChat?.isProfileChat) {
                        if (activeChat.otherPartyIsPremiumVerified || activeChat.otherPartyVerifiedBadgeType === 'GOLDEN' || activeChat.otherPartyVerifiedBadgeType === 'PREMIUM') {
                          return <BadgeCheck className="w-5 h-5 text-amber-500 fill-amber-100 shrink-0" />;
                        }
                        if (activeChat.otherPartyIsVerified || activeChat.otherPartyIsKycVerified) {
                          return <BadgeCheck className="w-5 h-5 text-blue-500 fill-blue-50 shrink-0" />;
                        }
                      }
                      return null;
                    })()}
                  </div>
                  <div className="flex items-center gap-2 overflow-hidden flex-wrap max-h-12">
                    <span className="text-xs font-black uppercase text-stone-400 tracking-widest truncate flex items-center gap-1">
                      {chats.find((c) => c.id === activeChatId)?.otherPartyName}
                      {(() => {
                        const activeChat = chats.find((c) => c.id === activeChatId);
                        if (!activeChat?.isProfileChat && activeChat) {
                          if (activeChat.otherPartyIsPremiumVerified || activeChat.otherPartyVerifiedBadgeType === 'GOLDEN' || activeChat.otherPartyVerifiedBadgeType === 'PREMIUM') {
                            return <BadgeCheck className="w-3.5 h-3.5 text-amber-500 fill-amber-100 shrink-0" />;
                          }
                          if (activeChat.otherPartyIsVerified || activeChat.otherPartyIsKycVerified) {
                            return <BadgeCheck className="w-3.5 h-3.5 text-blue-500 fill-blue-50 shrink-0" />;
                          }
                        }
                        return null;
                      })()}
                    </span>
                    <span className="w-1 h-1 bg-stone-300 rounded-full shrink-0" />
                    {chats.find((c) => c.id === activeChatId)?.isProfileChat ? (
                      <Link
                        to={`/user/${chats.find((c) => c.id === activeChatId)?.otherPartyId}`}
                        className="text-xs font-bold text-amber-600 hover:underline uppercase tracking-widest whitespace-nowrap"
                      >
                        View Profile
                      </Link>
                    ) : (
                      <Link
                        to={`/listings/${chats.find((c) => c.id === activeChatId)?.listingId}`}
                        className="text-xs font-bold text-amber-600 hover:underline uppercase tracking-widest whitespace-nowrap"
                      >
                        View Listing
                      </Link>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowInfoPanel(!showInfoPanel)}
                    className={`p-2 rounded-xl transition-all ${showInfoPanel ? "text-amber-600 bg-amber-50" : "text-stone-400 hover:text-stone-900 hover:bg-stone-50"}`}
                    title="Conversation Details"
                  >
                    <Info className="w-5 h-5" />
                  </button>
                  <div className="relative" id="chat-options-container">
                    <button
                      onClick={() => setShowChatOptions(!showChatOptions)}
                      className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-50 rounded-xl transition-colors"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  {showChatOptions && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-stone-100 z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100">
                      {((isSuperAdmin || isAuthorizedAdmin) && !isAuthorizedPaymentVerifier) && (() => {
                        const curChat = chats.find((c) => c.id === activeChatId);
                        if (!curChat || !curChat.otherPartyId) return null;
                        const isGranted = curChat.otherPartyIsVerified || curChat.otherPartyIsPremiumVerified;
                        if (!isGranted && !isSuperAdmin) return null;
                        return (
                          <button
                            onClick={() => {
                              setShowChatOptions(false);
                              handleToggleAdminBadgeOnChatUser(
                                curChat.otherPartyId!,
                                isGranted,
                                curChat.listingTitle || "User"
                              );
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs font-black transition-colors flex items-center gap-2 border-b border-amber-100/50 ${isGranted ? "text-red-600 bg-red-50/30 hover:bg-red-50" : "text-amber-700 bg-amber-500/10 hover:bg-amber-500/25"}`}
                          >
                            <ShieldAlert className="w-4 h-4 text-amber-500" />
                            {isGranted ? "ADMIN: REVOKE GOLD BADGE" : "SUPER ADMIN: ISSUE PREMIUM/GOLD BADGE (30d)"}
                          </button>
                        );
                      })()}

                      {(() => {
                        const curChat = chats.find((c) => c.id === activeChatId);
                        if (!curChat) return null;
                        const isBuyer = curChat.buyerId === user.uid;
                        const isMuted = isBuyer ? curChat.isMutedBuyer : curChat.isMutedSeller;
                        const unreadCount = isBuyer ? curChat.unreadCountBuyer : curChat.unreadCountSeller;
                        const isPinned = isBuyer ? curChat.isPinnedBuyer : curChat.isPinnedSeller;
                        const isArchived = isBuyer ? curChat.isArchivedBuyer : curChat.isArchivedSeller;
                        const otherPartyId = curChat.otherPartyId;
                        const isCurrentlyBlocked = otherPartyId ? ((curChat.isBlocked && curChat.blockedBy === user.uid) || myBlocks.includes(otherPartyId)) : false;

                        return (
                          <>
                            <button
                              onClick={() => {
                                handleTogglePin(activeChatId);
                                setShowChatOptions(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-2 border-b border-stone-50"
                            >
                              {isPinned ? (
                                <>
                                  <Pin className="w-4 h-4 text-amber-500 fill-amber-500" /> Unpin Conversation
                                </>
                              ) : (
                                <>
                                  <Pin className="w-4 h-4 text-stone-400" /> Pin Conversation
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                handleToggleArchive(activeChatId);
                                setShowChatOptions(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-2 border-b border-stone-50"
                            >
                              {isArchived ? (
                                <>
                                  <Archive className="w-4 h-4 text-stone-400" /> Unarchive Conversation
                                </>
                              ) : (
                                <>
                                  <Archive className="w-4 h-4 text-stone-400" /> Archive Conversation
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                handleToggleMute(activeChatId);
                                setShowChatOptions(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-2 border-b border-stone-50"
                            >
                              {isMuted ? (
                                <>
                                  <Bell className="w-4 h-4 text-stone-400" /> Unmute Notifications
                                </>
                              ) : (
                                <>
                                  <BellOff className="w-4 h-4 text-stone-400" /> Mute Notifications
                                </>
                              )}
                            </button>
                            {unreadCount && unreadCount > 0 ? (
                              <button
                                onClick={() => {
                                  handleMarkAsRead(activeChatId);
                                  setShowChatOptions(false);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-2 border-b border-stone-50"
                              >
                                <CheckCircle2 className="w-4 h-4 text-amber-500" /> Mark as Read
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  handleMarkAsUnread(activeChatId);
                                  setShowChatOptions(false);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors flex items-center gap-2 border-b border-stone-50"
                              >
                                <Mail className="w-4 h-4 text-stone-400" /> Mark as Unread
                              </button>
                            )}
                            {otherPartyId && (
                              <button
                                onClick={() => {
                                  handleToggleBlock(activeChatId);
                                  setShowChatOptions(false);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-stone-50 transition-colors flex items-center gap-2 border-b border-stone-50"
                              >
                                <Ban className="w-4 h-4" />
                                {isCurrentlyBlocked ? "Unblock User" : "Block User"}
                              </button>
                            )}
                            <button
                              onClick={() => {
                                handleDeleteChat(activeChatId);
                                setShowChatOptions(false);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 border-t border-stone-50"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" /> Delete Conversation
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>

              <div className="flex-1 flex flex-row overflow-hidden relative">
                {/* Active Chat Column */}
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  {/* Messages display */}
                  {(() => {
                    const activeChat = chats.find((c) => c.id === activeChatId);
                    const otherPartyId = activeChat?.otherPartyId;
                    const isBlockedByMe = otherPartyId ? myBlocks.includes(otherPartyId) : false;
                    const isBlockedByOther = otherPartyId ? blockedByUsers.includes(otherPartyId) : false;
                    const isChatBlocked = activeChat?.isBlocked || isBlockedByMe || isBlockedByOther;
                    const isPendingReceiver = false;
                    const isPendingInitiator = false;

                    return (
                      <>
                        {selectedMessageIds.size > 0 && (
                          <div className="bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between shadow-sm z-10 absolute top-0 left-0 right-0 overflow-x-auto">
                            <span className="text-sm font-bold text-stone-700 whitespace-nowrap mr-4">{selectedMessageIds.size} selected</span>
                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                              <button onClick={handleSelectAll} className="text-stone-600 hover:bg-stone-100 p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors">
                                <CheckSquare className="w-4 h-4" /> <span className="hidden sm:inline">Select All</span>
                              </button>
                              <button onClick={handleCopySelected} className="text-stone-600 hover:bg-stone-100 p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors">
                                <Copy className="w-4 h-4" /> <span className="hidden sm:inline">Copy</span>
                              </button>
                              <button onClick={handleShareSelected} className="text-blue-600 hover:bg-blue-50 p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors">
                                <Share className="w-4 h-4" /> <span className="hidden sm:inline">Share</span>
                              </button>
                              <button onClick={handleDeleteSelectedMessages} className="text-red-600 hover:bg-red-50 p-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors">
                                <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete</span>
                              </button>
                              <button onClick={clearMessageSelection} className="text-stone-500 hover:bg-stone-100 p-2 rounded-xl text-xs font-bold transition-colors">
                                <X className="w-4 h-4 sm:hidden" /> <span className="hidden sm:inline">Cancel</span>
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-stone-50 scrollbar-hide" onClick={clearMessageSelection}>
                          {messages.length === 0 ? (
                            <div className="text-center text-stone-400 mt-10">
                              No messages yet. Say hi or send an offer!
                            </div>
                          ) : (
                            messages.map((msg) => {
                              const isMine = msg.senderId === user.uid;
                              const isSelected = selectedMessageIds.has(msg.id);
                              return (
                                <div
                                  key={msg.id}
                                  className={`flex flex-row ${isMine ? "justify-end" : "justify-start"} items-center gap-3 group w-full transition-all duration-200 select-none ${isSelected ? "bg-blue-50/80 border border-blue-200/50 p-2.5 -mx-2.5 rounded-2xl ring-2 ring-blue-500/10 shadow-sm" : ""}`}
                                  style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                                  onClick={(e) => handleMessageTap(msg.id, e)}
                                  onContextMenu={(e) => handleMessageContextMenu(e, msg.id)}
                                  onTouchStart={() => handleMessagePressStart(msg.id)}
                                  onTouchEnd={handlePressEnd}
                                  onTouchMove={handlePressMove}
                                  onMouseDown={() => handleMessagePressStart(msg.id)}
                                  onMouseUp={handlePressEnd}
                                  onMouseLeave={handlePressEnd}
                                  onMouseMove={handlePressMove}
                                >
                                  {selectedMessageIds.size > 0 && (
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${isSelected ? "bg-blue-500 border-blue-500 text-white scale-110" : "border-stone-300 bg-white hover:border-stone-400"}`}>
                                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3.5]" />}
                                    </div>
                                  )}
                                  <div
                                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-md transition-colors ${
                                      isSelected
                                        ? isMine
                                          ? "bg-blue-600 text-white rounded-br-none"
                                          : "bg-blue-50 border border-blue-200 text-blue-900 rounded-bl-none"
                                        : isMine
                                          ? "bg-amber-500 text-stone-900 rounded-br-none"
                                          : "bg-white border border-stone-100 text-stone-800 rounded-bl-none"
                                    }`}
                                  >
                                    {msg.image && (
                                      <div className="mb-2 max-w-full rounded-xl overflow-hidden bg-stone-100/50 flex justify-center">
                                        <img
                                          src={msg.image}
                                          alt="Attachment"
                                          className="max-h-72 w-auto object-contain cursor-pointer hover:opacity-95 transition-all max-w-full rounded-lg"
                                          referrerPolicy="no-referrer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setZoomedImage(msg.image || null);
                                          }}
                                        />
                                      </div>
                                    )}
                                    {msg.isOffer ? (
                                      <div className={`font-bold flex items-center gap-2 mb-1 p-2 rounded-lg ${isSelected ? "bg-white/10" : "bg-stone-900/5"}`}>
                                        💰 Offer: {formatPKR(msg.offerAmount || 0)}
                                      </div>
                                    ) : (
                                      msg.text && msg.text !== "📷 Sent an image" && (
                                        <div className="text-sm font-medium leading-relaxed break-words">
                                          <Linkify text={msg.text} />
                                        </div>
                                      )
                                    )}
                                    <div
                                      className={`text-xs mt-1.5 font-bold flex items-center gap-1 ${
                                        isMine
                                          ? isSelected
                                            ? "text-blue-100 justify-end"
                                            : "text-stone-700/60 justify-end"
                                          : isSelected
                                            ? "text-blue-500 justify-start"
                                            : "text-stone-400 justify-start"
                                      }`}
                                    >
                                      <span>
                                        {formatRelativeTime(msg.createdAt)}
                                      </span>
                                      {isMine && (
                                        <span className="shrink-0 ml-1">
                                          {msg.status === "seen" ? (
                                            <CheckCheck className={`w-4 h-4 ${isSelected ? "text-white" : "text-stone-800"}`} title="Seen" />
                                          ) : msg.status === "delivered" ? (
                                            <CheckCheck className={`w-4 h-4 ${isSelected ? "text-blue-200" : "text-stone-700/60"}`} title="Delivered" />
                                          ) : (
                                            <Check className={`w-4 h-4 ${isSelected ? "text-blue-200" : "text-stone-700/60"}`} title="Sent" />
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                          <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area / Request CTA Banner */}
                        {isPendingReceiver ? (
                          <div className="p-6 bg-amber-50 border-t border-amber-200 flex flex-col items-center text-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-1">
                              <MessageCircle className="w-6 h-6 animate-pulse" />
                            </div>
                            <div>
                              <h3 className="text-base font-black text-stone-900 uppercase italic tracking-tight">
                                Message Request
                              </h3>
                              <p className="text-xs font-semibold text-stone-500 max-w-md mt-1">
                                {activeChat?.otherPartyName || "This user"} wants to connect with you. If you accept, they will be able to message you and view your active chats.
                              </p>
                            </div>
                            <div className="flex gap-3 w-full max-w-sm">
                              <button
                                onClick={() => handleAcceptRequest(activeChatId!)}
                                className="flex-1 bg-amber-500 hover:bg-amber-600 text-stone-900 font-black uppercase italic tracking-wider py-3 px-4 rounded-xl text-xs transition-all active:scale-95 shadow-md"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleIgnoreRequest(activeChatId!)}
                                className="flex-1 bg-white hover:bg-stone-50 text-stone-700 hover:text-stone-900 border border-stone-200 font-bold py-3 px-4 rounded-xl text-xs transition-all active:scale-95"
                              >
                                Ignore
                              </button>
                              <button
                                onClick={() => handleToggleBlock(activeChatId!)}
                                className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-black uppercase tracking-wider py-3 px-4 rounded-xl text-[10px] transition-all active:scale-95 border border-red-200/50"
                              >
                                Block
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 pb-20 md:pb-6 md:p-6 bg-white border-t border-stone-200">
                            {isBlockedByMe ? (
                              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-red-50 border border-red-200 rounded-2xl animate-in fade-in duration-300">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 flex-shrink-0">
                                    <Ban className="w-5 h-5" />
                                  </div>
                                  <div className="text-left">
                                    <p className="text-sm font-bold text-stone-900">You have blocked this user</p>
                                    <p className="text-xs text-stone-500 font-semibold">Unblock them to start chatting immediately.</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleBlock(activeChatId!)}
                                  className="w-full sm:w-auto bg-stone-900 hover:bg-stone-800 text-white font-bold py-2.5 px-5 rounded-xl text-xs tracking-wide transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5"
                                >
                                  <Unlock className="w-3.5 h-3.5" /> Unblock User
                                </button>
                              </div>
                            ) : (
                              <>
                                {isOffer && !isChatBlocked && !isPendingInitiator && (
                                  <div className="mb-4 flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-300">
                                    <span className="text-xs font-black tracking-widest uppercase text-stone-400 bg-stone-100 px-3 py-1 rounded-full">
                                      Make Offer
                                    </span>
                                    <input
                                      type="number"
                                      placeholder="Amount (Rs)"
                                      className="border border-stone-200 rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/50 flex-grow"
                                      value={offerAmount}
                                      onChange={(e) => setOfferAmount(e.target.value)}
                                    />
                                    <button
                                      onClick={() => setIsOffer(false)}
                                      className="text-xs font-black uppercase tracking-widest text-red-500 hover:text-red-600 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                                {selectedImage && (
                                  <div className="mb-3 p-2 bg-stone-50 border border-stone-200 rounded-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-300 w-fit max-w-[200px]" id="image-attachment-preview">
                                    <div className="relative">
                                      <img
                                        src={selectedImage}
                                        alt="Preview"
                                        className="w-16 h-16 object-cover rounded-xl border border-stone-200"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setSelectedImage(null)}
                                        className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-md transition-all active:scale-90"
                                        title="Remove Image"
                                        id="remove-preview-image-button"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <span className="text-[10px] font-bold text-stone-500 truncate max-w-[100px]">
                                      Image ready
                                    </span>
                                  </div>
                                )}
                                {spamError && (
                                  <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center justify-between gap-2 animate-in slide-in-from-bottom-2 duration-300" id="chat-spam-error">
                                    <div className="flex items-center gap-2">
                                      <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
                                      <span className="text-xs font-bold leading-normal">
                                        {spamError}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setSpamError(null)}
                                      className="text-red-500 hover:text-red-600 transition-colors p-1 rounded-lg hover:bg-red-500/10"
                                      title="Dismiss error"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                                <form
                                  onSubmit={handleSendMessage}
                                  className="flex gap-3 items-center"
                                >
                                  {!isChatBlocked && !isPendingInitiator && (
                                    <>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        ref={fileInputRef}
                                        onChange={handleImageSelect}
                                        className="hidden"
                                        id="chat-image-input"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploadingImage}
                                        className={`w-12 h-12 rounded-2xl flex-shrink-0 transition-all flex items-center justify-center shadow-sm relative ${
                                          selectedImage 
                                            ? "bg-amber-100 text-amber-600 ring-2 ring-amber-500" 
                                            : "bg-stone-100 text-stone-600 hover:bg-amber-100 hover:text-amber-600"
                                        }`}
                                        title="Attach Image"
                                        id="chat-camera-button"
                                      >
                                        {isUploadingImage ? (
                                          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                          <Camera className="w-5 h-5" />
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setIsOffer(!isOffer)}
                                        className={`w-12 h-12 rounded-2xl flex-shrink-0 transition-all flex items-center justify-center text-xl shadow-sm ${isOffer ? "bg-amber-100 ring-2 ring-amber-500" : "bg-stone-100 text-stone-600 hover:bg-amber-100 hover:text-amber-600"}`}
                                        title="Make an Offer"
                                      >
                                        💰
                                      </button>
                                    </>
                                  )}
                                  <div className="relative flex-grow">
                                    <input
                                      type="text"
                                      value={newMessage}
                                      onChange={(e) => {
                                        setNewMessage(e.target.value);
                                        if (spamError) setSpamError(null);
                                      }}
                                      placeholder={
                                        isBlocked
                                          ? "Account Restricted: Messaging Disabled"
                                          : isBlockedByMe
                                            ? "You have blocked this user"
                                            : isBlockedByOther
                                              ? "You are blocked by this user"
                                              : isChatBlocked
                                                ? "Cannot send messages"
                                                : isPendingInitiator
                                                  ? "Waiting for user to accept your chat request..."
                                                  : "Write a message..."
                                      }
                                      className="w-full bg-stone-100 border-none rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-shadow disabled:opacity-50"
                                      disabled={
                                        isOffer ||
                                        isChatBlocked ||
                                        isBlocked ||
                                        isPendingInitiator
                                      }
                                    />
                                  </div>
                                  <button
                                    type="submit"
                                    disabled={
                                      (!newMessage.trim() && !offerAmount && !selectedImage) ||
                                      isChatBlocked ||
                                      isBlocked ||
                                      isPendingInitiator
                                    }
                                    className="w-12 h-12 lg:w-14 lg:h-14 bg-amber-500 hover:bg-amber-600 text-stone-900 rounded-2xl flex-shrink-0 transition-all shadow-lg active:scale-90 flex items-center justify-center disabled:opacity-30 disabled:grayscale transition-all"
                                  >
                                    <Send className="w-5 h-5 lg:w-6 lg:h-6" />
                                  </button>
                                </form>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Conversation Info Panel */}
                {showInfoPanel && (() => {
                  const curChat = chats.find((c) => c.id === activeChatId);
                  if (!curChat) return null;
                  
                  const isBuyer = curChat.buyerId === user.uid;
                  const isMuted = isBuyer ? curChat.isMutedBuyer : curChat.isMutedSeller;
                  const otherPartyId = curChat.otherPartyId;
                  const isCurrentlyBlocked = otherPartyId ? ((curChat.isBlocked && curChat.blockedBy === user.uid) || myBlocks.includes(otherPartyId)) : false;

                  return (
                    <div className="absolute inset-0 z-40 md:relative md:inset-auto md:z-auto h-full flex shrink-0 bg-white">
                      <ConversationInfoPanel
                        chat={curChat}
                        otherPartyProfile={otherPartyProfile}
                        linkedAuction={linkedAuction}
                        linkedNegotiation={linkedNegotiation}
                        loadingLinkedInfo={loadingLinkedInfo}
                        onClose={() => setShowInfoPanel(false)}
                        onToggleMute={() => handleToggleMute(activeChatId)}
                        onToggleBlock={() => handleToggleBlock(activeChatId)}
                        onReport={() => setShowReportModal(true)}
                        isMuted={isMuted}
                        isBlocked={isCurrentlyBlocked}
                        user={user}
                      />
                    </div>
                  );
                })()}
              </div>
            </>
          ) : (
            <div className="flex-grow flex items-center justify-center p-8 text-stone-400 flex-col">
              <MessageCircle className="w-16 h-16 text-stone-300 mb-4" />
              <p>Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      </div>
      {/* Tap-and-hold (long press) Context Menu Modal */}
      {menuChatId && (() => {
        const selectedChat = chats.find((c) => c.id === menuChatId);
        if (!selectedChat) return null;

        const isBuyer = selectedChat.buyerId === user.uid;
        const unreadCount = isBuyer ? selectedChat.unreadCountBuyer : selectedChat.unreadCountSeller;
        const isMuted = isBuyer ? selectedChat.isMutedBuyer : selectedChat.isMutedSeller;
        const isPinned = isBuyer ? selectedChat.isPinnedBuyer : selectedChat.isPinnedSeller;
        const isArchived = isBuyer ? selectedChat.isArchivedBuyer : selectedChat.isArchivedSeller;
        const otherPartyId = selectedChat.otherPartyId;
        const isCurrentlyBlocked = otherPartyId ? ((selectedChat.isBlocked && selectedChat.blockedBy === user.uid) || myBlocks.includes(otherPartyId)) : false;

        return (
          <div
            className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 transition-all duration-300"
            onClick={() => setMenuChatId(null)}
          >
            <div
              className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">Conversation Options</h3>
                  <p className="text-xs text-stone-400 font-semibold mt-0.5 truncate max-w-[240px]">
                    {selectedChat.listingTitle || "Direct Message"}
                  </p>
                </div>
                <button
                  onClick={() => setMenuChatId(null)}
                  className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-full transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 rotate-270" />
                </button>
              </div>

              <div className="p-2 space-y-1">
                <button
                  onClick={() => {
                    handleTogglePin(menuChatId);
                    setMenuChatId(null);
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50 rounded-xl transition-colors flex items-center gap-3"
                >
                  {isPinned ? (
                    <>
                      <Pin className="w-5 h-5 text-amber-500 fill-amber-500" />
                      Unpin Conversation
                    </>
                  ) : (
                    <>
                      <Pin className="w-5 h-5 text-stone-400" />
                      Pin Conversation
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    handleToggleArchive(menuChatId);
                    setMenuChatId(null);
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50 rounded-xl transition-colors flex items-center gap-3"
                >
                  {isArchived ? (
                    <>
                      <Archive className="w-5 h-5 text-stone-400" />
                      Unarchive Conversation
                    </>
                  ) : (
                    <>
                      <Archive className="w-5 h-5 text-stone-400" />
                      Archive Conversation
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    handleToggleMute(menuChatId);
                    setMenuChatId(null);
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50 rounded-xl transition-colors flex items-center gap-3"
                >
                  {isMuted ? (
                    <>
                      <Bell className="w-5 h-5 text-stone-400" />
                      Unmute Notifications
                    </>
                  ) : (
                    <>
                      <BellOff className="w-5 h-5 text-stone-400" />
                      Mute Notifications
                    </>
                  )}
                </button>

                {unreadCount && unreadCount > 0 ? (
                  <button
                    onClick={() => {
                      handleMarkAsRead(menuChatId);
                      setMenuChatId(null);
                    }}
                    className="w-full text-left px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50 rounded-xl transition-colors flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-amber-500" />
                    Mark as Read
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      handleMarkAsUnread(menuChatId);
                      setMenuChatId(null);
                    }}
                    className="w-full text-left px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50 rounded-xl transition-colors flex items-center gap-3"
                  >
                    <Mail className="w-5 h-5 text-stone-400" />
                    Mark as Unread
                  </button>
                )}

                {otherPartyId && (
                  <button
                    onClick={() => {
                      handleToggleBlock(menuChatId);
                    }}
                    className="w-full text-left px-4 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50 rounded-xl transition-colors flex items-center gap-3"
                  >
                    <Ban className={`w-5 h-5 ${isCurrentlyBlocked ? "text-green-600" : "text-red-500"}`} />
                    {isCurrentlyBlocked ? "Unblock User" : "Block User"}
                  </button>
                )}

                <button
                  onClick={() => {
                    handleDeleteChat(menuChatId);
                    setMenuChatId(null);
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-100/50 hover:text-red-700 rounded-xl transition-colors flex items-center gap-3 border-t border-stone-100 mt-1 pt-4"
                >
                  <Trash2 className="w-5 h-5 text-red-600" />
                  Delete Conversation
                </button>
              </div>

              <div className="p-3 border-t border-stone-100 bg-stone-50/50 flex justify-end">
                <button
                  onClick={() => setMenuChatId(null)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 text-xs font-black uppercase tracking-wider rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Profile Report Modal */}
      {showReportModal && activeChatId && (() => {
        const activeChat = chats.find((c) => c.id === activeChatId);
        if (!activeChat || !activeChat.otherPartyId) return null;
        return (
          <ReportModal
            isOpen={showReportModal}
            onClose={() => setShowReportModal(false)}
            targetId={activeChat.otherPartyId}
            targetType="user"
            targetTitle={activeChat.otherPartyName}
          />
        );
      })()}
      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmation.isOpen}
        onClose={() => setConfirmation((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmation.onConfirm}
        title={confirmation.title}
        message={confirmation.message}
        confirmLabel={confirmation.confirmLabel}
        isDestructive={confirmation.isDestructive}
      />

      {/* Zoomed Image Viewer Modal */}
      {zoomedImage && (
        <KycImageLightbox
          src={zoomedImage}
          title="Zoomed attachment"
          onClose={() => setZoomedImage(null)}
        />
      )}
    </div>
  );
}
