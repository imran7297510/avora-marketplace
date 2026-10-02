import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ShieldCheck, Clock, MessageSquare, History, Gavel, Send, AlertTriangle, Scale, Settings, ShieldAlert, User, FileText, Phone, X, Eye, Users, Info, TrendingUp, Share2, BarChart3, Shield, CheckCircle2, Upload, Image as ImageIcon, Lock, LogIn, UserPlus, ArrowUpDown, ChevronDown } from 'lucide-react';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { AuthModal } from '../../components/AuthModal';
import { useNegotiation } from '../../features/battle-bids/hooks/useNegotiation';
import { useSellerProfile } from '../../features/battle-bids/hooks/useSellerProfile';
import { useAuctionEngine } from '../../features/battle-bids/hooks/useAuctionEngine';
import { useAuth } from '../../context/AuthContext';
import { AnonymousSellerCard } from '../../features/battle-bids/components/AnonymousSellerCard';
import { NegotiationTimeline } from '../../features/battle-bids/components/NegotiationTimeline';
import { NegotiationActions } from '../../features/battle-bids/components/NegotiationActions';
import { PerspectiveSimulator } from '../../features/battle-bids/components/PerspectiveSimulator';
import { TacticalHeader } from '../../features/battle-bids/components/TacticalHeader';
import { NegotiationStatusBadge } from '../../features/battle-bids/components/NegotiationStatusBadge';
import { formatPKR, cn } from '../../lib/utils';
import { formatPrice, getCurrencyByCode } from '../../lib/currencies';
import { motion, AnimatePresence } from 'motion/react';
import { NegotiationStatus, Negotiation, NegotiationOffer } from '../../features/battle-bids/types';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

import { parseSafeDate } from '../../features/battle-bids/utils/arena';
import { ArenaLiveCountdown } from '../../features/battle-bids/components/ArenaLiveCountdown';
import { ArenaBiddingPanel } from '../../features/battle-bids/components/ArenaBiddingPanel';
import { ArenaBidHistory } from '../../features/battle-bids/components/ArenaBidHistory';
import { ArenaGallery } from '../../features/battle-bids/components/ArenaGallery';
import { ArenaSellerCard } from '../../features/battle-bids/components/ArenaSellerCard';
import { ArenaTacticalActions } from '../../features/battle-bids/components/ArenaTacticalActions';
import { ArenaStatus } from '../../features/battle-bids/components/shared/ArenaStatus';
import { AccountBannedBanner } from '../../components/AccountBannedBanner';

export type OfferSortOption = 'newest' | 'oldest' | 'highest' | 'lowest';

interface Props {
  inlineNegId?: string;
  onClose?: () => void;
  initialShowAgreement?: boolean;
  initialShowContact?: boolean;
}

export const ArenaNegotiationView: React.FC<Props> = ({ 
  inlineNegId, 
  onClose,
  initialShowAgreement,
  initialShowContact,
}) => {
  const { negId: routeNegId } = useParams<{ negId: string }>();
  const negId = inlineNegId || routeNegId;
  const [searchParams] = useSearchParams();
  const paramAuctionId = searchParams.get('auctionId');
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('login');
  const { 
    negotiation: realNegotiation, 
    offers: realOffers, 
    loading: negLoading, 
    sendCounter, 
    respond, 
    complete,
    sendMessage,
    deleteOffer,
    submitAppeal,
    requestContactInfo,
    shareContactInfo,
    isSeller: realIsSeller,
    isBuyer: realIsBuyer,
    totalUsedForAuction
  } = useNegotiation(negId);

  const extractedAuctionId = useMemo(() => {
    if (realNegotiation?.auctionId) return realNegotiation.auctionId;
    if (paramAuctionId) return paramAuctionId;
    if (!negId) return undefined;
    if (negId.startsWith('auction-')) return negId.replace('auction-', '');
    if (negId.startsWith('empty-')) return negId.replace('empty-', '');
    if (negId.startsWith('item-')) return negId.replace('item-', '');
    return negId;
  }, [negId, realNegotiation?.auctionId, paramAuctionId]);

  const { 
    auction, 
    bids, 
    loading: auctionLoading, 
    timeRemaining, 
    placeBid, 
    isKycVerified, 
    isOwner, 
    remainingBids 
  } = useAuctionEngine(extractedAuctionId);

  // Unified real-time offer stream across all participants for this listing
  const [allAuctionNegotiations, setAllAuctionNegotiations] = useState<Negotiation[]>([]);
  const [allAuctionOffers, setAllAuctionOffers] = useState<NegotiationOffer[]>([]);

  // 1. Subscribe to all negotiations associated with this listing
  useEffect(() => {
    if (!extractedAuctionId) return;

    const q = query(
      collection(db, 'arena_negotiations'),
      where('auctionId', '==', extractedAuctionId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const negs = (snapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
        createdAt: parseSafeDate(docSnap.data().createdAt),
        updatedAt: parseSafeDate(docSnap.data().updatedAt),
        expiresAt: parseSafeDate(docSnap.data().expiresAt),
        acceptedAt: parseSafeDate(docSnap.data().acceptedAt),
        contactRequestedAt: parseSafeDate(docSnap.data().contactRequestedAt),
        contactSharedAt: parseSafeDate(docSnap.data().contactSharedAt)
      })) as unknown as Negotiation[])
        .filter(n => (n.status as any) !== 'withdrawn' && n.status !== NegotiationStatus.WITHDRAWN);

      setAllAuctionNegotiations(negs);
    }, (err) => {
      console.warn("Auction negotiations snapshot notification:", err);
    });

    return () => unsubscribe();
  }, [extractedAuctionId]);

  const negotiation = useMemo(() => {
    if (realNegotiation && (realNegotiation as any).status !== 'withdrawn' && (realNegotiation.status as any) !== NegotiationStatus.WITHDRAWN) return realNegotiation;
    
    // Check if one of the subscribed negotiations belongs to this user or matches
    if (allAuctionNegotiations.length > 0) {
      if (user?.uid && user.uid !== auction?.sellerId) {
        const myNeg = allAuctionNegotiations.find(n => n.buyerId === user.uid);
        if (myNeg) return myNeg;
      }
      if (negId) {
        const exactNeg = allAuctionNegotiations.find(n => n.id === negId);
        if (exactNeg) return exactNeg;
      }
      const activeNeg = allAuctionNegotiations.find(n => !['cancelled', 'expired', 'withdrawn'].includes((n.status || '').toLowerCase())) || allAuctionNegotiations[0];
      if (activeNeg) return activeNeg;
    }

    if (auction) {
      const isUserSeller = !!user && user.uid === auction.sellerId;
      const buyerBid = (bids || []).find(b => b.userId !== auction.sellerId);
      const resolvedBuyerId = isUserSeller 
        ? (buyerBid?.userId || 'buyer') 
        : (user?.uid || 'guest');

      return {
        id: negId || `auction-${auction.id}`,
        auctionId: auction.id,
        sellerId: auction.sellerId || 'seller',
        buyerId: resolvedBuyerId,
        itemTitle: auction.title,
        itemImage: auction.images?.[0] || '',
        itemPrice: auction.startingPrice || 0,
        status: NegotiationStatus.OPEN,
        offers: [],
        lastOfferBy: buyerBid ? buyerBid.userId : '',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Negotiation;
    }
    return null;
  }, [realNegotiation, allAuctionNegotiations, auction, negId, user, bids]);

  // 2. Subscribe to offers subcollections across all negotiations for this listing
  useEffect(() => {
    if (!allAuctionNegotiations.length) {
      setAllAuctionOffers([]);
      return;
    }

    const offersMap: Record<string, NegotiationOffer[]> = {};
    const unsubs: (() => void)[] = [];

    allAuctionNegotiations.forEach(neg => {
      const qOffers = query(
        collection(db, 'arena_negotiations', neg.id, 'offers'),
        orderBy('timestamp', 'asc')
      );

      const unsub = onSnapshot(qOffers, (snapshot) => {
        offersMap[neg.id] = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          negotiationId: neg.id,
          ...docSnap.data(),
          timestamp: parseSafeDate(docSnap.data().timestamp) || new Date()
        })) as NegotiationOffer[];

        const combined = Object.values(offersMap).flat();
        setAllAuctionOffers(combined);
      }, (err) => {
        console.warn(`Offers snapshot notification for neg ${neg.id}:`, err);
      });

      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach(u => u());
    };
  }, [allAuctionNegotiations]);

  // Merge and sort all submitted and countered offers from all participants into a unified chronological stream
  const offers = useMemo(() => {
    const map = new Map<string, NegotiationOffer>();
    const currentNegId = realNegotiation?.id || negotiation?.id;

    // Add all offers from all negotiations (strictly excluding withdrawn offers and excluding private messages from other negotiations)
    allAuctionOffers
      .filter(o => {
        if (o.action === 'withdraw' || (o as any).status === 'withdrawn') return false;
        // Never leak standalone private chat messages from other negotiations
        if (o.action === 'message' && currentNegId && o.negotiationId !== currentNegId) return false;
        return true;
      })
      .forEach(o => {
        map.set(o.id, o);
      });

    // Add current negotiation offers if any were missed (strictly excluding withdrawn offers)
    realOffers
      .filter(o => o.action !== 'withdraw' && (o as any).status !== 'withdrawn')
      .forEach(o => {
        if (!map.has(o.id)) {
          map.set(o.id, o);
        }
      });

    // Add public bids from useAuctionEngine if any buyer offer is not yet in offers subcollection
    bids
      .filter(bid => (bid as any).status !== 'withdrawn' && !(bid as any).isWithdrawn)
      .forEach(bid => {
        const timeMs = bid.timestamp ? new Date(bid.timestamp).getTime() : 0;
        const existing = Array.from(map.values()).some(o => {
          const oTimeMs = o.timestamp ? new Date(o.timestamp).getTime() : 0;
          return o.senderId === bid.userId && Math.abs(oTimeMs - timeMs) < 3000 && Math.abs(o.amount - bid.amount) < 1;
        });

        if (!existing) {
          const bidOfferId = bid.id ? `bid-${bid.id}` : `bid-${bid.userId}-${timeMs}`;
          map.set(bidOfferId, {
            id: bidOfferId,
            negotiationId: `auction-${extractedAuctionId}`,
            senderId: bid.userId,
            amount: bid.amount,
            currency: (bid as any).currency || auction?.currency || 'USD',
            currencySymbol: (bid as any).currencySymbol || auction?.currencySymbol || '$',
            timestamp: parseSafeDate(bid.timestamp) || new Date(),
            action: 'send'
          });
        }
      });

    // Sort chronologically ascending (oldest first, newest last)
    const sorted = Array.from(map.values()).sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeA - timeB;
    });

    return sorted;
  }, [allAuctionOffers, realOffers, bids, extractedAuctionId, auction]);

  // Authoritative private ownership resolution for Private Negotiation listings
  const [isPrivateSellerDoc, setIsPrivateSellerDoc] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!extractedAuctionId || !user?.uid) {
      setIsPrivateSellerDoc(false);
      return;
    }

    // Direct check for Battle Bids or non-anonymized listings
    if (auction?.sellerId && auction.sellerId === user.uid) {
      setIsPrivateSellerDoc(true);
      return;
    }
    if (realNegotiation?.sellerId && realNegotiation.sellerId === user.uid) {
      setIsPrivateSellerDoc(true);
      return;
    }

    // If listing is known to be non-negotiation and seller is different
    if (auction && !auction.isNegotiationOnly && auction.sellerId && auction.sellerId !== user.uid) {
      setIsPrivateSellerDoc(false);
      return;
    }

    // Direct authoritative fetch of arena_auctions/{extractedAuctionId}/private/seller
    getDoc(doc(db, 'arena_auctions', extractedAuctionId, 'private', 'seller'))
      .then((snap) => {
        if (isMounted) {
          setIsPrivateSellerDoc(snap.exists() && snap.data()?.sellerUid === user.uid);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsPrivateSellerDoc(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [extractedAuctionId, user?.uid, auction?.sellerId, auction?.isNegotiationOnly, realNegotiation?.sellerId]);

  const isRoleResolving = Boolean(
    user?.uid && 
    extractedAuctionId && 
    isPrivateSellerDoc === null && 
    (auction?.isNegotiationOnly || !auction || auction?.sellerId?.startsWith('anon_seller_'))
  );

  const isSeller = useMemo(() => {
    if (!user) return false;
    if (isPrivateSellerDoc === true) return true;
    if (realIsSeller) return true;
    if (isOwner) return true;
    if (realNegotiation?.sellerId) {
      return (user.uid === realNegotiation.sellerId || realNegotiation.sellerId === 'simulated-seller' || realNegotiation.sellerId === 'seller');
    }
    return (user.uid === auction?.sellerId || auction?.sellerId === 'simulated-seller' || auction?.sellerId === 'seller');
  }, [user, isPrivateSellerDoc, realIsSeller, isOwner, realNegotiation?.sellerId, auction?.sellerId]);

  const isBuyer = useMemo(() => {
    if (!user) return true;
    if (isSeller) return false; // Sellers can NEVER be buyers for their own listed items!
    if (realNegotiation?.buyerId) {
      return (user.uid === realNegotiation.buyerId || realNegotiation.buyerId === 'simulated-buyer' || realNegotiation.buyerId === 'buyer');
    }
    return user.uid !== auction?.sellerId;
  }, [user, isSeller, realNegotiation?.buyerId, auction?.sellerId]);

  const isInline = !!inlineNegId;

  // Seller's exact set price when posting the item under private negotiations
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

  const effectiveSellerId = useMemo(() => {
    return auction?.sellerId || realNegotiation?.sellerId || negotiation?.sellerId || '';
  }, [auction?.sellerId, realNegotiation?.sellerId, negotiation?.sellerId]);

  // Latest valid price submitted by ANY buyer across all offers / bids / negotiations
  const latestBuyerOffer = useMemo(() => {
    // 1. Check all chronologically tracked offers across negotiations
    const validBuyerOffers = (offers || []).filter(o => {
      if (typeof o.amount !== 'number' || !Number.isFinite(o.amount) || o.amount <= 0) return false;
      if (o.action === 'message' || o.action === 'withdraw') return false;
      
      const isSeller = (effectiveSellerId && o.senderId === effectiveSellerId) || 
                       o.senderId === 'seller' || 
                       o.senderId === 'simulated-seller' ||
                       ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(o.senderId);
      
      return !isSeller;
    });

    if (validBuyerOffers.length > 0) {
      const sortedDesc = [...validBuyerOffers].sort((a, b) => {
        const timeA = parseSafeDate(a.timestamp)?.getTime() || 0;
        const timeB = parseSafeDate(b.timestamp)?.getTime() || 0;
        return timeB - timeA;
      });
      return sortedDesc[0];
    }

    // 2. Check bids from useAuctionEngine submitted by buyers
    if (bids && bids.length > 0) {
      const validBids = bids.filter(b => typeof b.amount === 'number' && b.amount > 0 && b.userId !== effectiveSellerId);
      if (validBids.length > 0) {
        const sortedBidsDesc = [...validBids].sort((a, b) => {
          const timeA = parseSafeDate(b.timestamp)?.getTime() || 0;
          const timeB = parseSafeDate(a.timestamp)?.getTime() || 0;
          return timeA - timeB;
        });
        const topBid = sortedBidsDesc[0];
        return {
          amount: topBid.amount,
          currency: (topBid as any).currency || auction?.currency || 'USD',
          currencySymbol: (topBid as any).currencySymbol || auction?.currencySymbol || '$',
          timestamp: topBid.timestamp,
          action: 'send'
        } as Partial<NegotiationOffer>;
      }
    }

    // 3. Fallback to negotiation.lastOfferAmount if present and submitted by a buyer
    if (negotiation?.lastOfferAmount && negotiation.lastOfferAmount > 0) {
      const lastBy = negotiation.lastOfferBy;
      const isLastBySeller = (effectiveSellerId && lastBy === effectiveSellerId) || lastBy === 'seller' || lastBy === 'simulated-seller';
      if (!isLastBySeller) {
        return {
          amount: negotiation.lastOfferAmount,
          currency: (negotiation as any).currency || auction?.currency || 'USD',
          currencySymbol: (negotiation as any).currencySymbol || auction?.currencySymbol || '$',
          timestamp: negotiation.updatedAt || new Date(),
          action: 'send'
        } as Partial<NegotiationOffer>;
      }
    }

    return null;
  }, [offers, bids, effectiveSellerId, negotiation, auction]);

  const effectiveCurrency = (auction as any)?.currencySymbol || (auction as any)?.currency || (negotiation as any)?.currencySymbol || (negotiation as any)?.currency || '$';

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showChatTimestamps, setShowChatTimestamps] = useState<boolean>(true);

  // Helper to extract clean user message without system offer amounts or system boilerplates
  const cleanChatMessageText = useCallback((rawMessage?: string): string | null => {
    if (!rawMessage || !rawMessage.trim()) return null;

    let text = rawMessage.trim();

    // Strip system prefixes and offer amount boilerplates
    text = text
      .replace(/^Initial strategic offer:\s*(?:[A-Z]{3,4}|[^\d\s\w]+)?\s*[\d,]+/gi, '')
      .replace(/^Proposed offer:\s*(?:[A-Z]{3,4}|[^\d\s\w]+)?\s*[\d,]+/gi, '')
      .replace(/^A buyer has sent a private offer of\s*(?:[A-Z]{3,4}|[^\d\s\w]+)?\s*[\d,]+\s*for your asset\./gi, '')
      .replace(/^The (?:buyer|seller) has proposed a new deal:\s*(?:[A-Z]{3,4}|[^\d\s\w]+)?\s*[\d,]+\./gi, '')
      .replace(/^The tactical proposal has been (?:accepted|declined|withdrawn)\.?/gi, '')
      .replace(/^Deal completed!.*$/gi, '')
      .replace(/^Counter offer:\s*(?:[A-Z]{3,4}|[^\d\s\w]+)?\s*[\d,]+/gi, '')
      .replace(/^Offer for .*/gi, '')
      .replace(/^Tactical bid for .*/gi, '')
      .replace(/^Withdrawing offer.*/gi, '')
      .replace(/^No thank you, current value is much higher\./gi, '')
      .replace(/^Agreed\. Your split offer is accepted\..*/gi, '')
      .replace(/^Deal, let's complete\./gi, '')
      .replace(/^Transaction completed!.*/gi, '')
      .trim();

    // Strip any residual offer amount mentions
    text = text
      .replace(/(?:Proposed offer|Initial strategic offer|Counter offer):\s*(?:[A-Z]{3,4}|[^\d\s\w]+)?\s*[\d,]+/gi, '')
      .trim();

    return text.length > 0 ? text : null;
  }, []);

  const chatMessages = useMemo(() => {
    // Isolated 7-Day Deal Chat: strictly bounded to this specific finalized negotiation deal and listing item
    const currentNegId = realNegotiation?.id || negotiation?.id;
    if (!currentNegId) return [];

    // Use strictly the offers/messages belonging to the active negotiation document
    // If a buyer and seller had a chat earlier under 7-Day Completion Window & Dispute Protection (e.g. for an earlier deal or another item)
    // and they again finalize a new deal under private negotiation hub, earlier chats will NOT be merged or mixed.
    const sourceOffers = (realOffers && realOffers.length > 0)
      ? realOffers.filter(o => !o.negotiationId || o.negotiationId === currentNegId)
      : (offers || []).filter(o => o.negotiationId === currentNegId && !o.id.startsWith('bid-'));

    return sourceOffers
      .filter(o => {
        // Enforce strict negotiation ID matching - never mix with other deals or items
        if (o.negotiationId && o.negotiationId !== currentNegId) return false;
        return true;
      })
      .map(o => {
        const cleaned = cleanChatMessageText(o.message);
        if (!cleaned) return null;
        return {
          ...o,
          cleanMessage: cleaned
        };
      })
      .filter((item): item is (NegotiationOffer & { cleanMessage: string }) => item !== null);
  }, [realNegotiation?.id, negotiation?.id, realOffers, offers, cleanChatMessageText]);

  // Reverse list so that the LATEST chat message is displayed at the TOP
  const chatMessagesToDisplay = useMemo(() => {
    return [...chatMessages].reverse();
  }, [chatMessages]);

  // Keep scroll position at top when latest message is on top
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = 0;
    }
  }, [chatMessages.length]);

  const [adminPerspective, setAdminPerspective] = useState<'admin' | 'buyer' | 'seller'>(() => {
    if (user && negotiation && user.uid === negotiation.sellerId) {
      return 'seller';
    }
    return 'buyer';
  });
  const [hasInitPerspective, setHasInitPerspective] = useState(() => {
    return Boolean(user && negotiation && user.uid === negotiation.sellerId);
  });
  const [activeOfferFilter, setActiveOfferFilter] = useState<'all' | 'counter' | 'accepted'>('all');
  const [offerSortFilter, setOfferSortFilter] = useState<OfferSortOption>('newest');

  const effectiveIsBuyer = useMemo(() => {
    if (isAdmin) {
      if (adminPerspective === 'buyer') return true;
      if (adminPerspective === 'seller') return false;
    }
    return isBuyer;
  }, [isAdmin, adminPerspective, isBuyer]);

  const effectiveIsSeller = useMemo(() => {
    if (isAdmin) {
      if (adminPerspective === 'seller') return true;
      if (adminPerspective === 'buyer') return false;
    }
    return isSeller;
  }, [isAdmin, adminPerspective, isSeller]);

  const simulatedUserId = useMemo(() => {
    if (isAdmin) {
      if (adminPerspective === 'buyer') {
        return negotiation?.buyerId || 'simulated-buyer';
      }
      if (adminPerspective === 'seller') {
        return negotiation?.sellerId || 'simulated-seller';
      }
    }
    return user?.uid || (isSeller ? (negotiation?.sellerId || 'simulated-seller') : (negotiation?.buyerId || 'simulated-buyer'));
  }, [isAdmin, adminPerspective, negotiation, user, isSeller]);

  const isActualBuyerOrSeller = useMemo(() => {
    if (!user?.uid) return false;
    const sId = negotiation?.sellerId || auction?.sellerId;
    const bId = negotiation?.buyerId;
    // If the user (even if an admin) is the actual buyer or seller of this deal, they can access and own the chat
    return user.uid === bId || user.uid === sId;
  }, [user?.uid, negotiation?.buyerId, negotiation?.sellerId, auction?.sellerId]);

  const filteredOffers = useMemo(() => {
    // Only offer actions (send, counter, accept, decline, withdraw) belong in the offer history tabs
    const acceptedItem = offers.find(o => o.action === 'accept' || o.action === 'complete');
    const acceptedTime = acceptedItem ? parseSafeDate(acceptedItem.timestamp)?.getTime() : null;

    const rawOfferList = offers.filter(o => {
      if (o.action === 'message') return false;
      if (o.action === 'withdraw' || (o as any).status === 'withdrawn') return false;
      if (acceptedTime && acceptedItem) {
        const oTime = parseSafeDate(o.timestamp)?.getTime() || 0;
        if (oTime > acceptedTime && o.id !== acceptedItem.id) {
          return false;
        }
      }
      return true;
    });

    // Deduplicate offer list by unique id and content signature to prevent duplicate previews
    const seenSignatures = new Set<string>();
    const seenIds = new Set<string>();
    const offerOnlyList = rawOfferList.filter(o => {
      if (seenIds.has(o.id)) return false;
      seenIds.add(o.id);
      const timeBucket = Math.round((parseSafeDate(o.timestamp)?.getTime() || 0) / 5000);
      const sig = `${o.senderId}-${o.amount}-${o.action}-${timeBucket}`;
      if (seenSignatures.has(sig)) return false;
      seenSignatures.add(sig);
      return true;
    });
    const isAcceptedStatus = ['accepted', 'completed', 'concluded'].includes((negotiation?.status || '').toLowerCase().trim());
    const effectiveCurrency = auction?.currency || (negotiation as any)?.currency || 'USD';
    const effectiveCurrencySymbol = auction?.currencySymbol || (negotiation as any)?.currencySymbol || '$';

    if (activeOfferFilter === 'counter') {
      const counterList = offerOnlyList.filter(o => o.action === 'counter' || o.action === 'counter_offered' || o.action === 'accept' || o.action === 'complete');
      if (counterList.length > 0) return counterList;

      if (isAcceptedStatus) {
        if (offerOnlyList.length > 0) {
          const last = offerOnlyList[offerOnlyList.length - 1];
          return [{
            ...last,
            action: 'accept' as const
          }];
        }
        return [{
          id: 'accepted-deal-' + (negotiation?.id || 'synthetic'),
          negotiationId: negotiation?.id || '',
          senderId: negotiation?.lastOfferBy || negotiation?.sellerId || 'seller',
          amount: negotiation?.lastOfferAmount || auction?.startingPrice || 0,
          currency: effectiveCurrency,
          currencySymbol: effectiveCurrencySymbol,
          message: 'Final agreed deal locked.',
          timestamp: negotiation?.updatedAt || new Date(),
          action: 'accept' as const
        }];
      }
      return [];
    }

    if (activeOfferFilter === 'accepted') {
      // Only exact seller and buyer (or simulation) can see accepted offers and chats
      const canViewAccepted = isActualBuyerOrSeller || (isAdmin && adminPerspective !== 'admin');
      if (!canViewAccepted) return [];

      const acceptedOffers = offerOnlyList.filter(o => o.action === 'accept' || o.action === 'complete');
      if (acceptedOffers.length > 0) return acceptedOffers;

      if (isAcceptedStatus) {
        if (offerOnlyList.length > 0) {
          const last = offerOnlyList[offerOnlyList.length - 1];
          return [{
            ...last,
            action: 'accept' as const
          }];
        }
        return [{
          id: 'accepted-deal-' + (negotiation?.id || 'synthetic'),
          negotiationId: negotiation?.id || '',
          senderId: negotiation?.lastOfferBy || negotiation?.sellerId || 'seller',
          amount: negotiation?.lastOfferAmount || auction?.startingPrice || 0,
          currency: effectiveCurrency,
          currencySymbol: effectiveCurrencySymbol,
          message: 'Final agreed deal locked.',
          timestamp: negotiation?.updatedAt || new Date(),
          action: 'accept' as const
        }];
      }
      return [];
    }

    // Default: 'all'
    if (offerOnlyList.length === 0 && isAcceptedStatus) {
      return [{
        id: 'accepted-deal-' + (negotiation?.id || 'synthetic'),
        negotiationId: negotiation?.id || '',
        senderId: negotiation?.lastOfferBy || negotiation?.sellerId || 'seller',
        amount: negotiation?.lastOfferAmount || auction?.startingPrice || 0,
        currency: effectiveCurrency,
        currencySymbol: effectiveCurrencySymbol,
        message: 'Final agreed deal locked.',
        timestamp: negotiation?.updatedAt || new Date(),
        action: 'accept' as const
      }];
    }
    return offerOnlyList;
  }, [offers, activeOfferFilter, negotiation, auction, isActualBuyerOrSeller, isAdmin, adminPerspective]);

  const sortedOffers = useMemo(() => {
    // CRITICAL: The filter must work ONLY when viewing:
    // 1. All Offers (activeOfferFilter === 'all')
    // 2. Countered Offers (activeOfferFilter === 'counter')
    // If viewing other categories/events (e.g. 'accepted'), preserve existing ordering and behavior.
    if (activeOfferFilter !== 'all' && activeOfferFilter !== 'counter') {
      return filteredOffers;
    }

    return [...filteredOffers].sort((a, b) => {
      const timeA = parseSafeDate(a.timestamp)?.getTime() || 0;
      const timeB = parseSafeDate(b.timestamp)?.getTime() || 0;
      const amountA = typeof a.amount === 'number' ? a.amount : 0;
      const amountB = typeof b.amount === 'number' ? b.amount : 0;

      switch (offerSortFilter) {
        case 'newest':
          // Latest submitted offer at top (descending timestamp: Newest -> Oldest)
          return timeB - timeA;
        case 'oldest':
          // Oldest submitted offer at top (ascending timestamp: Oldest -> Newest)
          return timeA - timeB;
        case 'highest':
          // Highest numeric amount at top (descending amount: Highest -> Lowest)
          // Ties broken by authoritative submission timestamp descending
          if (amountB !== amountA) {
            return amountB - amountA;
          }
          return timeB - timeA;
        case 'lowest':
          // Lowest numeric amount at top (ascending amount: Lowest -> Highest)
          // Ties broken by authoritative submission timestamp descending
          if (amountA !== amountB) {
            return amountA - amountB;
          }
          return timeB - timeA;
        default:
          return timeB - timeA;
      }
    });
  }, [filteredOffers, activeOfferFilter, offerSortFilter]);

  // Sync perspective once the negotiation role finishes loading
  useEffect(() => {
    if (isRoleResolving) return; // Prevent premature perspective locking while ownership is being resolved!
    if (!hasInitPerspective) {
      if (isSeller) {
        setAdminPerspective('seller');
        setHasInitPerspective(true);
      } else if (isBuyer) {
        setAdminPerspective('buyer');
        setHasInitPerspective(true);
      } else if (isAdmin) {
        setAdminPerspective('admin');
        setHasInitPerspective(true);
      }
    }
  }, [isSeller, isBuyer, isAdmin, hasInitPerspective, isRoleResolving]);

  // Programmatically trigger modals based on initial props from parent list actions
  useEffect(() => {
    if (negotiation?.id) {
      if (initialShowAgreement) {
        setShowAgreementModal(true);
      }
      if (initialShowContact) {
        setShowContactModal(true);
      }
    }
  }, [negotiation?.id, initialShowAgreement, initialShowContact]);

  const [chatMessage, setChatMessage] = useState('');
  const [appealMessage, setAppealMessage] = useState('');
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  
  // Real-time bilateral alert channel persistence
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('arena_notifications_enabled') !== 'false';
  });
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(() => {
    return localStorage.getItem('arena_sound_alerts_enabled') !== 'false';
  });
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showAgreementModal, setShowAgreementModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  // Retrieve correct counterparty profile (Buyer profile for Seller, Seller profile for Buyer)
  const sellerId = negotiation?.sellerId;
  const { profile: sellerProfile } = useSellerProfile(sellerId);

  const [showPostDetails, setShowPostDetails] = useState(false);

  const counterPartyId = effectiveIsBuyer ? negotiation?.sellerId : negotiation?.buyerId;
  const { profile: counterPartyProfile } = useSellerProfile(counterPartyId);

  const isAcceptedOrCompleted = negotiation?.status === NegotiationStatus.ACCEPTED || negotiation?.status === NegotiationStatus.COMPLETED;

  const acceptedDate = useMemo(() => {
    if (!negotiation) return null;
    if (negotiation.acceptedAt) return parseSafeDate(negotiation.acceptedAt);
    if (isAcceptedOrCompleted && negotiation.updatedAt) return parseSafeDate(negotiation.updatedAt);
    return null;
  }, [negotiation, isAcceptedOrCompleted]);

  const { isChatExpired, remainingDays } = useMemo(() => {
    if (!isAcceptedOrCompleted || !acceptedDate) {
      return { isChatExpired: false, remainingDays: 7 };
    }
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const elapsedMs = Date.now() - acceptedDate.getTime();
    const expired = elapsedMs > SEVEN_DAYS_MS;
    const remMs = Math.max(0, SEVEN_DAYS_MS - elapsedMs);
    const remDays = Math.ceil(remMs / (24 * 60 * 60 * 1000));
    return { isChatExpired: expired, remainingDays: remDays };
  }, [isAcceptedOrCompleted, acceptedDate]);

  const handleSendMessage = useCallback(async () => {
    const text = chatMessage.trim();
    if (!text) return;
    if (isChatExpired) {
      alert("The 7-day post-acceptance chat period has expired. You can no longer send messages.");
      return;
    }
    setChatMessage('');
    try {
      await sendMessage(text, simulatedUserId);
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to send message");
      setChatMessage(text);
    }
  }, [chatMessage, sendMessage, simulatedUserId, isChatExpired]);

  const handleSubmitAppeal = useCallback(async () => {
    if (!appealMessage.trim() || !negotiation?.auctionId) return;
    setSubmittingAppeal(true);
    try {
      await submitAppeal(negotiation.auctionId, appealMessage);
      setShowAppealModal(false);
      setAppealMessage('');
      alert("Strategic Appeal Submitted: Admin team will review your case within 24 hours.");
    } catch (e: any) {
      alert(`Appeal Failed: ${e.message}`);
    } finally {
      setSubmittingAppeal(false);
    }
  }, [appealMessage, negotiation?.auctionId, submitAppeal]);

  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeMessage, setDisputeMessage] = useState('');
  const [disputeImages, setDisputeImages] = useState<string[]>([]);
  const [isUploadingDisputeImage, setIsUploadingDisputeImage] = useState(false);
  const [submittingDispute, setSubmittingDispute] = useState(false);

  const handleOpenDisputeModal = useCallback(() => {
    if (!isChatExpired) {
      alert("Dispute Locked: You can only raise a dispute after the 7-day completion window has elapsed if the other party does not make the deal final. Please wait until the 7 days have elapsed.");
      return;
    }
    setDisputeImages([]);
    setDisputeMessage('');
    setShowDisputeModal(true);
  }, [isChatExpired]);

  const handleDisputeImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (disputeImages.length + files.length > 4) {
      alert("You can attach up to 4 evidence images per dispute.");
      return;
    }

    setIsUploadingDisputeImage(true);
    const fileArray = Array.from(files);

    const promises = fileArray.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 1000;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve(dataUrl);
          };
          img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file as File);
      });
    });

    Promise.all(promises).then(urls => {
      setDisputeImages(prev => [...prev, ...urls].slice(0, 4));
      setIsUploadingDisputeImage(false);
    }).catch(err => {
      console.error("Image upload error:", err);
      setIsUploadingDisputeImage(false);
    });
  };

  const handleRemoveDisputeImage = (index: number) => {
    setDisputeImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitDispute = useCallback(async () => {
    if (!disputeMessage.trim() || !negotiation) return;
    setSubmittingDispute(true);
    try {
      await addDoc(collection(db, 'disputes'), {
        negotiationId: negotiation.id,
        auctionId: negotiation.auctionId || auction?.id || '',
        auctionTitle: auction?.title || 'Auction Item',
        buyerId: negotiation.buyerId,
        sellerId: negotiation.sellerId,
        complainantId: simulatedUserId || user?.uid || '',
        complainantRole: effectiveIsBuyer ? 'buyer' : (effectiveIsSeller ? 'seller' : 'other'),
        reportedUserId: effectiveIsBuyer ? negotiation.sellerId : negotiation.buyerId,
        message: disputeMessage.trim(),
        images: disputeImages,
        status: 'PENDING',
        createdAt: serverTimestamp(),
        amount: negotiation.amount || auction?.currentBid || 0,
        currency: negotiation.currency || auction?.currency || 'USD'
      });
      setDisputeMessage('');
      setDisputeImages([]);
      setShowDisputeModal(false);
      alert("Formal deal dispute successfully submitted to administration with attached evidence. Admins will review and take action against non-finalizing parties.");
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to submit dispute. Please try again.");
    } finally {
      setSubmittingDispute(false);
    }
  }, [disputeMessage, disputeImages, negotiation, auction, simulatedUserId, user?.uid, effectiveIsBuyer, effectiveIsSeller]);

  const handleViewTimeline = useCallback(() => {
    const timeline = document.getElementById('engagement-timeline-section');
    if (timeline) {
      timeline.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Memoize derived values
  const { buyerOffersSent, usedOffers, remainingOffers } = useMemo(() => {
    if (!negotiation) return { buyerOffersSent: 0, usedOffers: 0, remainingOffers: 10 };
    
    // Only successful submitted offers (action 'send' or 'counter' by buyer) are counted
    const bSent = offers.filter(o => {
      const isSellerOffer = o.senderId === negotiation.sellerId || o.senderId === 'seller' || o.senderId === 'simulated-seller' || ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(o.senderId);
      return !isSellerOffer && (o.action === 'send' || o.action === 'counter');
    }).length;
    const used = Math.max(bSent, negotiation.offerCount || 0, totalUsedForAuction);
    return {
      buyerOffersSent: used,
      usedOffers: used,
      remainingOffers: Math.max(0, 10 - used)
    };
  }, [offers, negotiation, totalUsedForAuction]);

  // Real-time ticking state for dynamic offer expiration calculation
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isAucActive = useMemo(() => {
    const aucDate = auction?.endTime ? parseSafeDate(auction.endTime) : null;
    return !!(aucDate && aucDate.getTime() > now.getTime() && auction?.status !== 'ended' && auction?.status !== 'sold' && auction?.status !== 'cancelled');
  }, [auction?.endTime, auction?.status, now]);

  const offerExpiryDate = useMemo(() => {
    const aucDate = auction?.endTime ? parseSafeDate(auction.endTime) : null;
    if (isAucActive) {
      return aucDate;
    }
    if (negotiation?.expiresAt) {
      const d = parseSafeDate(negotiation.expiresAt);
      if (d && !isNaN(d.getTime())) return d;
    }
    return aucDate;
  }, [negotiation?.expiresAt, auction?.endTime, auction?.status, isAucActive]);

  const formattedOfferTimeRemaining = useMemo(() => {
    const isPaused = auction?.status === 'paused';
    const isNegClosed = negotiation?.status === NegotiationStatus.COMPLETED || 
                        (!isAucActive && (
                          negotiation?.status === NegotiationStatus.DECLINED || 
                          negotiation?.status === NegotiationStatus.CANCELLED ||
                          negotiation?.status === NegotiationStatus.WITHDRAWN
                        ));

    if (isPaused) {
      return 'Timer Frozen';
    }
    if (isNegClosed) {
      return 'Negotiation Closed';
    }
    if (!offerExpiryDate) {
      return '7 days';
    }

    const diffMs = offerExpiryDate.getTime() - now.getTime();
    if (diffMs <= 0 && !isAucActive) {
      return 'Expired';
    }

    const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days >= 1) {
      return `${days} day${days > 1 ? 's' : ''}${hours > 0 ? ` ${hours} hour${hours > 1 ? 's' : ''}` : ''}`;
    }
    if (hours >= 1) {
      return `${hours} hour${hours > 1 ? 's' : ''}${minutes > 0 ? ` ${minutes} minute${minutes > 1 ? 's' : ''}` : ''}`;
    }
    if (minutes >= 1) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}${seconds > 0 ? ` ${seconds} second${seconds > 1 ? 's' : ''}` : ''}`;
    }
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }, [offerExpiryDate, now, auction?.status, negotiation?.status, isAucActive]);

  const negotiationTimeRemaining = useMemo(() => {
    if (!offerExpiryDate) return null;
    const nowTime = now.getTime();
    const endTime = offerExpiryDate.getTime();
    const diff = endTime - nowTime;
    const isPaused = auction?.status === 'paused';
    const isNegClosed = negotiation?.status === NegotiationStatus.COMPLETED || 
                        (!isAucActive && (
                          negotiation?.status === NegotiationStatus.DECLINED || 
                          negotiation?.status === NegotiationStatus.CANCELLED ||
                          negotiation?.status === NegotiationStatus.WITHDRAWN
                        ));

    if (diff <= 0 || isNegClosed || isPaused) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isEnded: true, isUrgent: false };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return {
      days,
      hours,
      minutes,
      seconds,
      isEnded: false,
      isUrgent: diff < 30 * 60 * 1000
    };
  }, [offerExpiryDate, now, auction?.status, negotiation?.status, isAucActive]);

  const loading = (negLoading && !realNegotiation) || (extractedAuctionId && auctionLoading && !auction);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-6">
        <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-xs font-black uppercase tracking-[0.4em] text-stone-400">Decrypting Negotiation Hub...</p>
      </div>
    );
  }

  if (!negotiation) {
    return (
      <div className="text-center py-40">
        <h2 className="text-2xl font-black text-white uppercase italic mb-4">Tactical Outpost Not Found</h2>
        <button 
          onClick={() => navigate('/negotiations')}
          className="text-amber-500 font-black uppercase tracking-widest text-xs"
        >
          Return to Command Center
        </button>
      </div>
    );
  }

  if (!user) {
    const authRequiredContent = (
      <div id="negotiation-auth-required-view" className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-amber-500/20 p-8 rounded-[2rem] max-w-md w-full text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-white uppercase italic tracking-tight">Authentication Required</h2>
            <p className="text-sm font-medium text-stone-300 leading-relaxed">
              You are not logged in. Please login to get access.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              id="timeline-login-btn"
              onClick={() => {
                setAuthModalTab('login');
                setShowAuthModal(true);
              }}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-955 rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" /> LOGIN
            </button>
            <button
              type="button"
              id="timeline-signup-btn"
              onClick={() => {
                setAuthModalTab('register');
                setShowAuthModal(true);
              }}
              className="w-full py-3.5 px-4 bg-stone-950 border border-amber-500/30 hover:border-amber-500 text-amber-500 rounded-xl font-black uppercase text-xs tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> SIGN UP
            </button>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => navigate('/negotiations')}
              className="text-stone-500 hover:text-stone-400 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Return to Hub
            </button>
          </div>
          <AuthModal
            isOpen={showAuthModal}
            initialTab={authModalTab}
            onClose={() => setShowAuthModal(false)}
          />
        </div>
      </div>
    );

    return isInline ? authRequiredContent : <ArenaLayout>{authRequiredContent}</ArenaLayout>;
  }

  const isAuthorized = isAdmin || isActualBuyerOrSeller;

  if (!isAuthorized) {
    const accessDeniedContent = (
      <div id="negotiation-access-denied-view" className="text-center py-40 max-w-md mx-auto px-6">
        <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8 text-rose-500 animate-pulse" />
        </div>
        <h2 className="text-xl font-black text-white uppercase italic mb-4">Classified Negotiation</h2>
        <p className="text-stone-400 text-xs font-medium uppercase tracking-wider mb-8 leading-relaxed">
          Access Denied. This negotiation is a secure, private communication channel between the respective buyer and seller. Your credentials do not grant access to this dossier.
        </p>
        <button 
          onClick={() => navigate('/negotiations')}
          className="px-6 py-3 bg-stone-900 border border-white/10 hover:border-amber-500/50 text-amber-500 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
        >
          Return to Hub
        </button>
      </div>
    );

    return isInline ? accessDeniedContent : <ArenaLayout>{accessDeniedContent}</ArenaLayout>;
  }

  const isClosed = negotiation.status === NegotiationStatus.COMPLETED || 
                   (!isAucActive && (
                     negotiation.status === NegotiationStatus.DECLINED || 
                     negotiation.status === NegotiationStatus.CANCELLED ||
                     negotiation.status === NegotiationStatus.WITHDRAWN
                   ));

  const isAuctionPaused = auction?.status === 'paused';
  const isAuctionRemoved = auction?.isPermanentlyRemoved === true;

  const content = (
    <div className={cn("w-full", !isInline && "container mx-auto")}>
      {/* Tactical Header Navigation Hub */}
      <TacticalHeader 
        negotiation={negotiation}
        isAdmin={isAdmin}
        handleViewTimeline={handleViewTimeline}
        notificationsEnabled={notificationsEnabled}
        setNotificationsEnabled={setNotificationsEnabled}
        soundAlertsEnabled={soundAlertsEnabled}
        setSoundAlertsEnabled={setSoundAlertsEnabled}
        onBack={() => {
          if (isInline && onClose) {
            onClose();
          } else if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate('/negotiations');
          }
        }}
        hideProfileAndSettings={true}
        hideEnterArenaButton={true}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pb-24 lg:pb-0">
        {/* Left Column: Details & Identity */}
        <div className="lg:col-span-4 space-y-8">
          {isAuctionPaused && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-3xl space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-500">
                <AlertTriangle className="w-5 h-5" />
                <span className="text-xs font-black uppercase tracking-widest">Listing Paused</span>
              </div>
              <p className="text-[10px] font-bold text-rose-400 uppercase leading-relaxed">
                Operations suspended by HQ. Remaining time is frozen. 24 hours to submit appeal or asset will be permanently decommissioned.
              </p>
              {effectiveIsSeller && !auction?.appealStatus && (
                <button 
                  onClick={() => setShowAppealModal(true)}
                  className="w-full py-3 bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-colors"
                >
                  Submit Tactical Appeal
                </button>
              )}
              {auction?.appealStatus === 'pending' && (
                <div className="px-3 py-2 bg-stone-955/50 rounded-lg flex items-center gap-2">
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] font-black uppercase text-amber-500 tracking-widest">Appeal Under Review</span>
                </div>
              )}
            </motion.div>
          )}

          {/* Account Ban Notice & Appeal Flow */}
          <AccountBannedBanner variant="dark" className="mb-6" />

          <div className="flex items-center justify-between mb-10">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-2">
                <MessageSquare className="w-5 h-5 text-amber-500" />
                <h1 className="text-2xl sm:text-3xl font-black text-white uppercase italic tracking-tighter">Private Negotiation</h1>
              </div>
              <p className="text-stone-400 text-xs sm:text-xs font-medium uppercase tracking-widest">Operation ID: {negotiation.id.slice(0, 8).toUpperCase()}</p>
            </div>
          </div>

          {auction && (
            <div className="p-6 bg-stone-900 border border-white/5 rounded-[2rem] space-y-4">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-stone-955 border border-white/5 group/img-preview cursor-pointer">
                <img 
                  src={auction.images?.[0] || 'https://via.placeholder.com/400x225'} 
                  alt={auction.title} 
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-zoom-in"
                  referrerPolicy="no-referrer"
                  onClick={() => setZoomImage(auction.images?.[0] || null)}
                />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase text-white truncate">{auction.title}</h3>
                <div className="flex items-center justify-between mt-1 mb-2">
                  <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Base Floor</span>
                  <span className="text-xs font-black text-amber-500 italic">{formatPrice(auction.startingPrice, auction.currencySymbol || auction.currency)}</span>
                </div>
                {auction.description && (
                  <p className="text-xs text-stone-400 font-medium leading-relaxed my-2 line-clamp-3">
                    {auction.description}
                  </p>
                )}
                <div id="negotiation-tactical-actions-view" className="pt-2 border-t border-stone-800/60 mt-3">
                  <ArenaTacticalActions item={auction} />
                </div>
              </div>
            </div>
          )}

          <div id="anonymous-counterparty-card">
            <AnonymousSellerCard 
              profile={counterPartyProfile} 
              alias={effectiveIsBuyer ? 'Anonymous Seller' : 'Anonymous Buyer'} 
            />
          </div>

          <div className="p-4 sm:p-6 md:p-8 bg-stone-900/50 border border-white/5 rounded-2xl sm:rounded-[2.5rem] space-y-4 sm:space-y-6">
            <h4 className="text-xs font-black uppercase text-stone-400 tracking-[0.2em] border-b border-white/5 pb-4">Negotiation Briefing</h4>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400 font-bold">Status</span>
                <NegotiationStatusBadge status={isAuctionPaused ? 'paused' as any : negotiation.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-400 font-bold">Price set by seller</span>
                <span className="text-sm font-black text-white italic">
                  {sellerExactPrice > 0 
                    ? formatPrice(sellerExactPrice, effectiveCurrency)
                    : 'Not specified'
                  }
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-stone-400 font-bold">Latest Offer</span>
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Buyer
                  </span>
                </div>
                <span className="text-sm font-black text-amber-400 italic">
                  {latestBuyerOffer?.amount && latestBuyerOffer.amount > 0
                    ? formatPrice(latestBuyerOffer.amount, latestBuyerOffer.currencySymbol || latestBuyerOffer.currency || effectiveCurrency)
                    : <span className="text-xs text-stone-500 font-bold not-italic">No offers yet</span>
                  }
                </span>
              </div>
              {effectiveIsBuyer && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-400 font-bold">Remaining Offers</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-black ${remainingOffers <= 2 ? 'text-rose-500' : 'text-amber-500'}`}>
                      {remainingOffers} Left ({usedOffers}/10 Used)
                    </span>
                  </div>
                </div>
              )}
              {/* Dynamic Countdown Timer for Active Negotiations */}
              <div className="pt-2 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-pulse" />
                    <span>Active Negotiation Countdown</span>
                  </span>
                </div>
                <ArenaLiveCountdown timeRemaining={negotiationTimeRemaining} variant="default" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Timeline & Actions */}
        <div className="lg:col-span-8 space-y-8 flex flex-col">
          <div className="p-6 sm:p-8 md:p-12 bg-stone-900 border border-white/5 rounded-[2rem] sm:rounded-[3rem] flex-1 flex flex-col min-h-[500px]">
            <div className="flex flex-col flex-1">
              <div id="engagement-timeline-section" className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <History className="w-5 h-5 sm:w-6 sm:h-6 text-stone-600" />
                    <h3 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tighter">Engagement Timeline</h3>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                  {/* Compact Single-Line Offer Sort Filter Control */}
                  {(activeOfferFilter === 'all' || activeOfferFilter === 'counter') && (
                    <div className="relative flex items-center">
                      <label htmlFor="timeline-offer-sort-filter" className="sr-only">Filter Offers</label>
                      <div className="relative flex items-center bg-stone-955 border border-white/10 hover:border-amber-500/40 focus-within:border-amber-500/60 rounded-xl px-2.5 py-1.5 text-xs transition-colors shadow-inner">
                        <ArrowUpDown className="w-3.5 h-3.5 text-amber-400 mr-2 shrink-0" />
                        <select
                          id="timeline-offer-sort-filter"
                          value={offerSortFilter}
                          onChange={(e) => setOfferSortFilter(e.target.value as OfferSortOption)}
                          className="bg-transparent text-white font-bold text-xs outline-none cursor-pointer pr-5 appearance-none hover:text-amber-400 transition-colors"
                        >
                          <option value="newest" className="bg-stone-900 text-white py-1">Newest offer</option>
                          <option value="oldest" className="bg-stone-900 text-white py-1">Oldest offer</option>
                          <option value="highest" className="bg-stone-900 text-white py-1">Highest offer</option>
                          <option value="lowest" className="bg-stone-900 text-white py-1">Lowest offer</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-stone-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 shrink-0" />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-955 border border-white/5 rounded-full" title="Active Synchronized Feed">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                </div>
              </div>

              {/* Filter Buttons (All Offers, My Offers, Countered, Accepted) - Directly below Engagement Timeline */}
              {!isAuctionPaused && !isAuctionRemoved && (
                <div className="mb-6">
                  <PerspectiveSimulator 
                    isAdmin={isAdmin}
                    currentPerspective={adminPerspective}
                    onChangePerspective={setAdminPerspective}
                    onResetCounterInput={() => {}}
                    isActualBuyer={effectiveIsBuyer}
                    isActualSeller={effectiveIsSeller}
                    offers={offers}
                    activeFilter={activeOfferFilter}
                    onSelectFilter={setActiveOfferFilter}
                    negotiation={negotiation}
                    simulatedUserId={simulatedUserId}
                  />
                </div>
              )}

              <div className="flex-1 w-full overflow-hidden flex flex-col gap-6">
                <NegotiationTimeline 
                  offers={sortedOffers} 
                  buyerId={negotiation.buyerId} 
                  sellerId={negotiation.sellerId} 
                  currentStatus={negotiation.status}
                  currentUserId={simulatedUserId}
                  isSeller={effectiveIsSeller}
                  isBuyer={effectiveIsBuyer}
                  isAdmin={isAdmin}
                  isActualParticipant={isActualBuyerOrSeller}
                  activeFilter={activeOfferFilter}
                  onRespond={async (action) => {
                    await respond(action, simulatedUserId);
                    if (action === 'withdraw') {
                      navigate('/negotiations');
                    }
                  }}
                  onCounter={(amount, message) => sendCounter(amount, message, simulatedUserId)}
                  onSendMessage={() => document.getElementById('message-input-area')?.scrollIntoView({ behavior: 'smooth' })}
                  onDeleteMessage={deleteOffer}
                  onViewAgreement={() => {
                    setShowAgreementModal(true);
                  }}
                  onContact={() => {
                    setShowContactModal(true);
                  }}
                  currency={negotiation.currency}
                  currencySymbol={negotiation.currencySymbol}
                />

                {!isAuctionPaused && (
                  <div className="mt-4 space-y-6">
                    {isRoleResolving ? (
                      <div className="p-8 bg-stone-900/60 border border-stone-800 rounded-2xl flex items-center justify-center gap-3">
                        <div className="w-5 h-5 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                        <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Verifying Strategic Access...</span>
                      </div>
                    ) : (
                      <NegotiationActions 
                        status={negotiation.status}
                        isBuyer={effectiveIsBuyer}
                        isSeller={effectiveIsSeller}
                        lastOfferBy={negotiation.lastOfferBy}
                        userId={simulatedUserId}
                        onRespond={async (action, overrideUserId, msg) => {
                          await respond(action, overrideUserId, msg);
                          if (action === 'withdraw') {
                            navigate('/negotiations');
                          }
                        }}
                        onCounter={(amount, msg, overrideUserId) => sendCounter(amount, msg, overrideUserId)}
                        onComplete={(overrideUserId) => complete(overrideUserId)}
                        onRequestContact={(overrideUserId) => requestContactInfo(overrideUserId)}
                        onShareContact={(details, overrideUserId) => shareContactInfo(details, overrideUserId)}
                        onSendMessage={() => document.getElementById('message-input-area')?.scrollIntoView({ behavior: 'smooth' })}
                        onViewTimeline={handleViewTimeline}
                        remainingOffers={remainingOffers}
                        negotiation={negotiation}
                        sellerProfile={sellerProfile}
                        auction={auction}
                        adminPerspective={adminPerspective}
                        setAdminPerspective={setAdminPerspective}
                        offers={offers}
                        showAgreementModal={showAgreementModal}
                        setShowAgreementModal={setShowAgreementModal}
                        showContactModal={showContactModal}
                        setShowContactModal={setShowContactModal}
                      />
                    )}

                    {isAcceptedOrCompleted && isActualBuyerOrSeller && (
                      <div className="space-y-4 pt-6 border-t border-white/10">
                        {/* 7-Day Deal Dispute Protection Banner & Button */}
                        <div className="p-4 bg-stone-900/90 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
                          <div className="flex items-center gap-3">
                            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                            <div>
                              <p className="text-xs font-black uppercase tracking-wider text-amber-300">
                                7-Day Completion Window & Dispute Protection
                              </p>
                              <p className="text-xs text-stone-400">
                                {isChatExpired 
                                  ? "7-day chat period has elapsed. If the other party has not finalized the deal, you can raise a formal dispute."
                                  : `Remaining time to finalize deal: ${remainingDays} days left.`}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleOpenDisputeModal}
                            className={cn(
                              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md active:scale-95 shrink-0 flex items-center gap-2",
                              isChatExpired 
                                ? "bg-red-600 hover:bg-red-500 text-white shadow-red-600/20" 
                                : "bg-stone-800 hover:bg-stone-700 text-amber-400 border border-amber-500/30"
                            )}
                          >
                            <ShieldAlert className="w-4 h-4" />
                            <span>{isChatExpired ? "Raise Deal Dispute" : "Raise Dispute (Locked)"}</span>
                          </button>
                        </div>

                        {!isChatExpired && (
                          <>
                            {/* Seller Alert Banner when Contact Info is Requested by Buyer */}
                            {effectiveIsSeller && negotiation.contactRequested && !negotiation.contactShared && (
                          <div className="p-4 bg-amber-500/15 border-2 border-amber-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-300 shadow-xl shadow-amber-500/10">
                            <div className="flex items-center gap-3">
                              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 animate-bounce" />
                              <div>
                                <p className="text-xs font-black uppercase tracking-wider text-amber-400">
                                  Contact Details Requested By Buyer!
                                </p>
                                <p className="text-xs text-stone-300">
                                  The buyer has requested your contact details. Click below to share your information.
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowContactModal(true)}
                              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 shrink-0 cursor-pointer"
                            >
                              Share Contact Info Now
                            </button>
                          </div>
                        )}

                        {/* Chat Header & Controls */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs font-bold text-amber-400 bg-stone-900/90 border border-white/10 p-3 sm:px-4 sm:py-3 rounded-2xl shadow-lg backdrop-blur-md">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Clock className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
                            <span className="text-stone-200 font-extrabold text-xs sm:text-sm">7-Day Private Deal Chat</span>
                            <span className="text-[10px] uppercase font-black tracking-widest text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full ml-1">
                              {remainingDays === 1 ? '1 Day Left' : `${remainingDays} Days Left`}
                            </span>
                          </div>

                          {/* Color indicator legend & Timestamps toggle */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 text-[10px] uppercase font-black tracking-wider text-stone-400 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5 flex-wrap">
                            <div className="flex items-center gap-3">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-400 shadow-sm shadow-amber-500/50" />
                                <span className="text-amber-300">Seller</span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-400 shadow-sm shadow-emerald-500/50" />
                                <span className="text-emerald-300">Buyer</span>
                              </span>
                            </div>

                            <button
                              type="button"
                              id="toggle-timestamps-btn"
                              onClick={() => setShowChatTimestamps(prev => !prev)}
                              className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer min-h-[30px] active:scale-95",
                                showChatTimestamps 
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 shadow-sm" 
                                  : "bg-stone-800/80 text-stone-400 border-stone-700/80 hover:text-stone-200 hover:bg-stone-800"
                              )}
                              title={showChatTimestamps ? "Hide message timestamps" : "Show message timestamps"}
                            >
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{showChatTimestamps ? 'Timestamps On' : 'Timestamps Off'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Standalone Chat Input */}
                        {!isAuctionPaused && !isAuctionRemoved && (
                          <div id="message-input-area" className="flex gap-2 items-center">
                            <input 
                              type="text"
                              value={chatMessage}
                              onChange={(e) => setChatMessage(e.target.value)}
                              placeholder="Write a message to coordinate transfer..."
                              className="flex-1 min-h-[46px] bg-stone-950 border border-white/10 rounded-2xl px-4 sm:px-5 py-3 text-xs sm:text-sm text-stone-100 font-medium placeholder:text-stone-500 focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/40 outline-none transition-all shadow-inner"
                              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            />
                            <button 
                              id="send-message-btn"
                              onClick={handleSendMessage}
                              disabled={!chatMessage.trim()}
                              className="min-h-[46px] min-w-[46px] sm:px-6 bg-gradient-to-r from-amber-500 to-amber-600 text-stone-955 rounded-2xl flex items-center justify-center font-bold text-xs sm:text-sm disabled:opacity-40 hover:from-amber-400 hover:to-amber-500 transition-all cursor-pointer shadow-lg shadow-amber-500/10 active:scale-95"
                            >
                              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                              <span className="hidden sm:inline ml-2">Send</span>
                            </button>
                          </div>
                        )}

                        {/* Private Chat Messages Log */}
                        <div 
                          ref={chatContainerRef}
                          className="max-h-[320px] sm:max-h-[400px] overflow-y-auto space-y-3.5 p-3.5 sm:p-5 bg-stone-950/80 border border-white/10 rounded-2xl sm:rounded-3xl custom-scrollbar flex flex-col backdrop-blur-sm"
                        >
                          {chatMessagesToDisplay.length === 0 ? (
                            <div className="text-center py-10 sm:py-14 text-stone-500 text-xs">
                              <MessageSquare className="w-9 h-9 mx-auto mb-2 text-stone-600 animate-bounce" />
                              <span className="font-semibold text-stone-400 block mb-1">No messages in the private chat yet.</span>
                              <span>Send a message to coordinate transfer or settlement details securely.</span>
                            </div>
                          ) : (
                            chatMessagesToDisplay.map((msg) => {
                              const sellerId = negotiation?.sellerId;
                              const buyerId = negotiation?.buyerId;

                              // 1. Known Seller IDs set
                              const knownSellerIds = new Set([
                                sellerId,
                                auction?.sellerId,
                                sellerProfile?.uid,
                                'seller',
                                'simulated-seller',
                                'arena-official-host',
                                'arena_bot_alpha',
                                'arena_bot_beta',
                                'arena_bot_gamma'
                              ].filter(Boolean) as string[]);

                              // 2. Known Buyer IDs set
                              const knownBuyerIds = new Set([
                                buyerId,
                                auction?.buyerId,
                                'buyer',
                                'simulated-buyer',
                                'guest'
                              ].filter(Boolean) as string[]);

                              // Determine explicit role of sender
                              const isMsgFromSeller = knownSellerIds.has(msg.senderId) || (sellerId ? msg.senderId === sellerId : false);
                              const isMsgFromBuyer = knownBuyerIds.has(msg.senderId) || (buyerId ? msg.senderId === buyerId : false) || (!isMsgFromSeller && msg.senderId !== sellerId);

                              // Determine if message was SENT by current active viewer (Outbound) or RECEIVED (Inbound)
                              let isMyMessage = false;

                              if (effectiveIsSeller) {
                                isMyMessage = isMsgFromSeller;
                              } else if (effectiveIsBuyer) {
                                isMyMessage = isMsgFromBuyer && !isMsgFromSeller;
                              } else {
                                isMyMessage = msg.senderId === simulatedUserId || (!!user?.uid && msg.senderId === user.uid);
                              }

                              const msgDate = parseSafeDate(msg.timestamp);
                              const formattedTime = msgDate 
                                ? msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                                : '';
                              const formattedDate = msgDate 
                                ? msgDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) 
                                : '';

                              // Clear role badge without redundant "sent/received" wording
                              let roleLabel = '';
                              let isSellerRole = false;

                              if (isMyMessage) {
                                isSellerRole = effectiveIsSeller;
                                roleLabel = effectiveIsSeller ? 'YOU (SELLER)' : (effectiveIsBuyer ? 'YOU (BUYER)' : 'YOU');
                              } else {
                                isSellerRole = isMsgFromSeller;
                                roleLabel = isMsgFromSeller ? 'SELLER' : 'BUYER';
                              }
                              
                              return (
                                <div 
                                  key={msg.id} 
                                  className={cn(
                                    "flex flex-col max-w-[90%] sm:max-w-[80%] space-y-1 transition-all",
                                    isMyMessage ? "self-end items-end" : "self-start items-start"
                                  )}
                                >
                                  {/* Message Header: Role Pill Badge & Timestamp */}
                                  <div className={cn(
                                    "flex items-center gap-2 text-[10px] font-bold px-1 mb-0.5",
                                    isMyMessage ? "justify-end" : "justify-start"
                                  )}>
                                    <span className={cn(
                                      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-sm",
                                      isSellerRole 
                                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40" 
                                        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                    )}>
                                      {roleLabel}
                                    </span>
                                    {showChatTimestamps && formattedTime && (
                                      <span className="text-stone-500 font-mono text-[9px] font-medium animate-fade-in">
                                        {formattedDate ? `${formattedDate}, ` : ''}{formattedTime}
                                      </span>
                                    )}
                                  </div>

                                  {/* Distinct Message Appearing Colors & Styles */}
                                  <div 
                                    className={cn(
                                      "px-4 py-3 rounded-2xl text-xs sm:text-sm font-medium break-words leading-relaxed shadow-lg transition-all",
                                      isMyMessage
                                        ? isSellerRole
                                          ? "bg-gradient-to-r from-amber-500 to-amber-600 text-stone-955 border border-amber-300/40 rounded-tr-xs font-semibold shadow-amber-500/10"
                                          : "bg-gradient-to-r from-emerald-500 to-teal-600 text-stone-955 border border-emerald-300/40 rounded-tr-xs font-semibold shadow-emerald-500/10"
                                        : isSellerRole
                                          ? "bg-stone-900/90 text-stone-100 border border-amber-500/30 border-l-4 border-l-amber-500 rounded-tl-xs shadow-stone-950/50"
                                          : "bg-stone-900/90 text-stone-100 border border-emerald-500/30 border-l-4 border-l-emerald-500 rounded-tl-xs shadow-stone-950/50"
                                    )}
                                  >
                                    {msg.cleanMessage}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}



                    {isChatExpired && (
                      <div className="p-4 bg-stone-955 border border-amber-500/20 rounded-2xl flex items-center gap-3 text-amber-400">
                        <Clock className="w-5 h-5 shrink-0" />
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-stone-200">7-Day Post-Acceptance Chat Period Expired</p>
                          <p className="text-[10px] text-stone-400 font-medium">The 7-day messaging window following offer acceptance has ended. Messaging is now disabled.</p>
                        </div>
                      </div>
                    )}

                    {/* Dispute Modal */}
                    {showDisputeModal && (
                      <div className="fixed inset-0 z-50 bg-stone-955/80 backdrop-blur-md flex items-center justify-center p-4">
                        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6">
                          <div className="flex items-center justify-between border-b border-stone-800 pb-4">
                            <div className="flex items-center gap-3">
                              <ShieldAlert className="w-6 h-6 text-red-500" />
                              <h3 className="text-lg font-black text-stone-100 uppercase tracking-tight">Raise 7-Day Deal Dispute</h3>
                            </div>
                            <button 
                              onClick={() => setShowDisputeModal(false)}
                              className="text-stone-400 hover:text-white p-1 rounded-lg cursor-pointer"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                          <p className="text-xs text-stone-400 leading-relaxed">
                            The 7-day completion period for this accepted deal has elapsed. If the counterparty ({effectiveIsBuyer ? 'Seller' : 'Buyer'}) has failed to finalize the deal or respond, please describe the issue below. Admins will review and take administrative action.
                          </p>
                          <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">
                              Describe the Dispute / Non-Finalization Issue
                            </label>
                            <textarea
                              rows={4}
                              value={disputeMessage}
                              onChange={(e) => setDisputeMessage(e.target.value)}
                              placeholder="Explain clearly why the other party is not making the deal final..."
                              className="w-full bg-stone-950 border border-stone-800 rounded-2xl p-4 text-xs sm:text-sm text-stone-100 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">
                                Attach Evidence / Screenshots ({disputeImages.length}/4)
                              </label>
                              {disputeImages.length < 4 && (
                                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-400 rounded-xl text-xs font-bold cursor-pointer transition-colors border border-amber-500/30">
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>{isUploadingDisputeImage ? 'Processing...' : 'Upload Image'}</span>
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    multiple 
                                    disabled={isUploadingDisputeImage}
                                    onChange={handleDisputeImageUpload}
                                    className="hidden" 
                                  />
                                </label>
                              )}
                            </div>

                            {disputeImages.length > 0 && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                                {disputeImages.map((img, idx) => (
                                  <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden border border-stone-700 bg-stone-955">
                                    <img 
                                      src={img} 
                                      alt={`Evidence ${idx + 1}`} 
                                      className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                      onClick={() => setZoomImage(img)}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveDisputeImage(idx)}
                                      className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-full opacity-90 hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                                      title="Remove Image"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => setShowDisputeModal(false)}
                              className="px-5 py-2.5 rounded-xl bg-stone-800 text-stone-300 text-xs font-bold uppercase tracking-wider hover:bg-stone-700 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSubmitDispute}
                              disabled={submittingDispute || !disputeMessage.trim()}
                              className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer shadow-lg shadow-red-600/20 active:scale-95"
                            >
                              {submittingDispute ? "Submitting..." : "Submit Formal Dispute"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                  {isAuctionPaused && (
                      <div className="p-8 text-center bg-stone-955 border border-dashed border-rose-500/20 rounded-3xl space-y-4">
                        <ShieldCheck className="w-12 h-12 text-rose-500/30 mx-auto mb-4" />
                        <p className="text-xs font-black text-rose-500 uppercase tracking-widest">
                          Communication Restricted During Tactical Pause
                        </p>
                      </div>
                    )}

                    {isAuctionRemoved && (
                      <div className="p-8 text-center bg-stone-955 border border-dashed border-rose-500/20 rounded-3xl space-y-4">
                        <ShieldCheck className="w-12 h-12 text-rose-500/30 mx-auto mb-4" />
                        <p className="text-xs font-black text-rose-500 uppercase tracking-widest">
                          Asset Decommissioned / Permanently Removed
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Appeal Modal */}
      <AnimatePresence>
        {showAppealModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-8 max-w-md w-full space-y-6"
            >
              <div className="flex items-center gap-3">
                <Scale className="w-6 h-6 text-rose-500" />
                <h3 className="text-xl font-black text-white uppercase italic">Strategic Appeal</h3>
              </div>
              <p className="text-xs text-stone-400 leading-relaxed uppercase font-bold tracking-widest">
                Submit your justification for HQ review. If appeal fails or 24 hours expire, asset will be permanently removed.
              </p>
              <textarea 
                value={appealMessage}
                onChange={(e) => setAppealMessage(e.target.value)}
                placeholder="Detail your appeal here..."
                className="w-full bg-stone-955 border border-stone-800 rounded-2xl p-4 text-xs font-medium text-white outline-none focus:border-rose-500 h-32 resize-none"
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowAppealModal(false)}
                  className="flex-1 py-4 bg-stone-955 text-stone-400 font-black uppercase text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSubmitAppeal}
                  disabled={submittingAppeal || !appealMessage.trim()}
                  className="flex-1 py-4 bg-rose-500 text-white font-black uppercase text-xs rounded-xl disabled:opacity-50"
                >
                  {submittingAppeal ? 'Transmitting...' : 'Submit Appeal'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );

  const postContent = showPostDetails ? (
    <div className={cn("w-full text-white space-y-6 pb-24 relative", !isInline && "container mx-auto")}>
      <button 
        type="button"
        onClick={() => setShowPostDetails(false)}
        className="absolute top-4 right-4 p-2 bg-stone-900 border border-stone-800 hover:border-amber-500/55 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 z-[110] transition-all shadow-lg cursor-pointer flex items-center gap-1"
        title="Close Post View"
      >
        <X className="w-4 h-4 text-amber-500" />
        <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Close</span>
      </button>

      {/* Header Navigation for Post View */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/5 pb-6 gap-4">
        <div className="flex items-center gap-4">
          <button 
            type="button"
            onClick={() => setShowPostDetails(false)}
            className="px-4 py-2.5 bg-stone-900 border border-stone-800 hover:border-amber-500/50 rounded-2xl text-stone-400 hover:text-white transition-all active:scale-95 shadow-xl flex items-center gap-2 text-xs font-black uppercase tracking-widest cursor-pointer font-bold"
          >
            <ChevronLeft className="w-4 h-4 text-amber-500" />
            <span>Back</span>
          </button>
          <div className="hidden sm:flex items-center gap-2">
            <History className="w-4 h-4 text-stone-600" />
            <span className="text-xs font-black uppercase tracking-widest text-stone-500">Operation Briefing</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPostDetails(false)}
            className="px-4 py-2.5 bg-stone-900 border border-stone-800 hover:border-amber-500/50 text-stone-400 hover:text-white rounded-2xl transition-all active:scale-95 flex items-center gap-1.5 text-xs font-black uppercase tracking-widest cursor-pointer font-bold shadow-xl"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-amber-500" />
            <span>Back</span>
          </button>
        </div>
      </div>

      {auctionLoading ? (
        <div className="flex flex-col items-center justify-center py-40 gap-6">
          <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-xs font-black uppercase tracking-[0.4em] text-stone-400">Retrieving Tactical Asset Details...</p>
        </div>
      ) : !auction ? (
        <div className="text-center py-40 bg-stone-900 border border-stone-800 rounded-[2rem] p-8">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4 animate-pulse" />
          <h3 className="text-lg font-black uppercase text-white mb-2">Decommissioned Asset</h3>
          <p className="text-xs text-stone-400 uppercase tracking-wider max-w-md mx-auto">
            This asset has been unlisted or is no longer active in the Battle Bids Arena catalog.
          </p>
        </div>
      ) : (
        /* Core Post Display */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 pt-4">
          {/* Left Column: Visuals & Details */}
          <div className="lg:col-span-7 space-y-12">
            {/* Gallery Section */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-3">
                    <ArenaStatus status={auction.status} endTime={auction.endTime} />
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-black text-stone-400 uppercase tracking-widest mb-1">Lot Number</p>
                  <p className="text-sm font-mono font-black text-white">#{auction.id.slice(-6).toUpperCase()}</p>
                </div>
              </div>

              <ArenaGallery images={auction.images} title={auction.title} />

              {/* Title and description beneath the uploaded images */}
              <div id="item-metadata-block" className="space-y-3 px-1 text-left mt-6">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full inline-block">
                  {auction.category || "Tactical Asset"}
                </span>
                <h2 className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight leading-tight">{auction.title}</h2>
                {auction.description && (
                  <p className="text-stone-400 text-xs leading-relaxed whitespace-pre-line border-t border-stone-800/60 pt-3 uppercase font-medium">
                    {auction.description}
                  </p>
                )}
              </div>
            </motion.div>

            {/* Verification Notice */}
            <div className="p-6 sm:p-8 bg-rose-600/5 border border-rose-500/20 rounded-[2.5rem] flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 text-center sm:text-left">
              <div className="w-16 h-16 bg-rose-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-rose-600/20 flex-shrink-0">
                <Info className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white uppercase mb-1">Combatant Protection</h4>
                <p className="text-xs text-stone-400 leading-relaxed font-medium">
                  Every asset in the Arena is backed by our Secure Deployment Protocol. Your bids are protected by our elite escrow system.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Engine & Seller */}
          <div className="lg:col-span-5 space-y-8">
            <div className="space-y-8">

              {/* Bidding Engine */}
              {!auction.isNegotiationOnly && (
                <ArenaBiddingPanel 
                  auction={auction}
                  onBid={placeBid}
                  isKycVerified={true}
                  isOwner={isSeller}
                  remainingBids={remainingBids}
                />
              )}

              {/* Seller Profile */}
              {sellerProfile && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 px-2">
                    <TrendingUp className="w-4 h-4 text-rose-500" />
                    Dominant Seller
                  </h3>
                  <ArenaSellerCard profile={sellerProfile} isAnonymous={true} />
                </div>
              )}

              {/* Bid History */}
              {!auction.isNegotiationOnly && (
                <ArenaBidHistory 
                  bids={bids}
                  currentHighestBidderId={auction.highestBidderId}
                  auctionId={auction?.id || extractedAuctionId}
                  currencySymbol={auction.currencySymbol}
                  currency={auction.currency}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const renderLightbox = () => (
    <Lightbox
      open={!!zoomImage}
      close={() => setZoomImage(null)}
      index={Math.max(0, (auction?.images || []).indexOf(zoomImage || ''))}
      slides={(auction?.images && auction.images.length > 0 ? auction.images : [zoomImage || '']).map((src) => ({ src }))}
      plugins={[Zoom]}
      carousel={{ padding: 0 }}
    />
  );

  if (showPostDetails) {
    return (
      <>
        {isInline ? postContent : <ArenaLayout>{postContent}</ArenaLayout>}
        {renderLightbox()}
      </>
    );
  }

  if (isInline) {
    return (
      <>
        {content}
        {renderLightbox()}
      </>
    );
  }

  return (
    <>
      <ArenaLayout>{content}</ArenaLayout>
      {renderLightbox()}
    </>
  );
};

export default ArenaNegotiationView;
