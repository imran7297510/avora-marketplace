import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { ArenaDiscovery } from '../../features/battle-bids/components/ArenaDiscovery';
import { ArenaGallery } from '../../features/battle-bids/components/ArenaGallery';
import { AnonymousSellerCard } from '../../features/battle-bids/components/AnonymousSellerCard';
import { clampTrustScore, calculateTrustTier, INITIAL_TRUST_SCORE } from '../../features/trust-score/types';
import { SentOffersRow } from '../../features/battle-bids/components/SentOffersRow';
import { useUserNegotiations } from '../../features/battle-bids/hooks/useUserNegotiations';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';
import { MyProfileSection } from '../../features/battle-bids/components/shared/MyProfileSection';
import { NegotiationCard } from '../../features/battle-bids/components/NegotiationCard';
import { NegotiationCountdownBadge } from '../../features/battle-bids/components/NegotiationCountdownBadge';
import { NegotiationOfferTimer } from '../../features/battle-bids/components/NegotiationOfferTimer';
import { getNegotiationHubStatus, isListingRemoved } from '../../features/battle-bids/utils';
import { AccountBannedBanner } from '../../components/AccountBannedBanner';

import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { ArenaTacticalActions } from '../../features/battle-bids/components/ArenaTacticalActions';
import { ReportButton } from '../../features/battle-bids/components/ReportButton';
import { AuthRequiredModal } from '../../components/AuthRequiredModal';
import { 
  MessageSquare, 
  ChevronLeft, 
  ChevronRight,
  Loader2, 
  Search, 
  Zap, 
  ShieldCheck, 
  Lock, 
  Eye, 
  User, 
  AlertTriangle, 
  TrendingUp, 
  Filter, 
  CheckCircle2, 
  XCircle,
  Clock,
  ArrowRight,
  SlidersHorizontal,
  MapPin,
  Check,
  X,
  Send,
  FileText,
  Phone,
  History,
  Compass,
  Share2,
  Pause,
  Play,
  Trash2,
  ShieldAlert,
  Plus,
  Gavel,
  Swords,
  Coins
} from 'lucide-react';
import { ThreeDButton } from '../../components/ThreeDButton';
import { resolveAuthoritativeVerification } from '../../lib/verificationResolver';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { cn, formatPKR } from '../../lib/utils';
import { CurrencySelector, formatPrice, filterListingsByCurrency } from '../../lib/currencies';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc, 
  updateDoc, 
  increment, 
  setDoc, 
  serverTimestamp,
  orderBy,
  getDocs,
  limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AuctionItem, Bid, NegotiationOffer, NegotiationStatus, ArenaSortOption } from '../../features/battle-bids/types';
import { Listing, UserProfile } from '../../types';
import { ListingCard } from '../../components/ListingCard';
import { useDragScroll, scrollContainer } from '../../lib/useScroll';
import { NegotiationService } from '../../features/battle-bids/services/negotiationService';
import { ArenaService } from '../../features/battle-bids/services/arenaService';
import { resolveAuthoritativeSellerUid } from '../../features/battle-bids/services/sellerIdentityResolver';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

function parseSafeDate(val: any): Date {
  if (!val) return new Date();
  if (val.toDate && typeof val.toDate === 'function') return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

function formatPostedDateTime(val: any): string {
  if (!val) return 'Date N/A';
  const d = parseSafeDate(val);
  if (isNaN(d.getTime())) return 'Date N/A';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}


import { ArenaFilters } from '../../features/battle-bids/types';

export const ArenaNegotiations: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramItemId = searchParams.get('item') || searchParams.get('id');
  const { user, userProfile, isAdmin } = useAuth();
  const { selectedCurrency } = useCurrency();
  
  const isCurrentUserKycApproved = !!(
    userProfile?.kycStatus === 'APPROVED' || 
    (userProfile?.isKycVerified === true && 
     userProfile?.kycStatus !== 'REVOKED' && 
     userProfile?.kycStatus !== 'PERMANENTLY_REMOVED')
  );
  
  // Real-time private negotiations active channels count
  const { negotiations, loading: userNegLoading } = useUserNegotiations();
  const activeCount = negotiations.filter(
    n => n.status !== 'completed' && n.status !== 'declined' && n.status !== 'cancelled'
  ).length;

  // Real-time listen to ALL negotiation assets (where isNegotiationOnly === true)
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Active / Selected listed item details
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<ArenaFilters>({ isNegotiationOnly: true });
  const [pendingFilters, setPendingFilters] = useState<ArenaFilters>({ isNegotiationOnly: true });
  
  // Live profile of the seller whose item is being displayed
  const [sellerProfile, setSellerProfile] = useState<UserProfile | null>(null);
  const [loadingSeller, setLoadingSeller] = useState(false);

  // Real-time list of offers/bids on the selected item
  const [bids, setBids] = useState<Bid[]>([]);

  const [sortBy, setSortBy] = useState<ArenaSortOption>('newest');

  // Interactive price slider/modal states
  const [showSetPriceModal, setShowSetPriceModal] = useState(false);
  const [tempPrice, setTempPrice] = useState<number>(0);
  const [tempCurrency, setTempCurrency] = useState<string>('USD');
  const [tempCurrencySymbol, setTempCurrencySymbol] = useState<string>('$');

  const [showSendOfferModal, setShowSendOfferModal] = useState(false);
  const [showAuthRequiredModal, setShowAuthRequiredModal] = useState(false);
  const [showConfirmOfferModal, setShowConfirmOfferModal] = useState(false);
  const [showSuccessOfferModal, setShowSuccessOfferModal] = useState(false);
  const [showCounterOfferModal, setShowCounterOfferModal] = useState(false);
  const [showCounterSuccessModal, setShowCounterSuccessModal] = useState(false);
  const [counterTargetNeg, setCounterTargetNeg] = useState<any | null>(null);
  const [counterAmount, setCounterAmount] = useState<string>('');
  const [counterMessage, setCounterMessage] = useState<string>('');
  const [submittingCounter, setSubmittingCounter] = useState(false);
  const [offerAmount, setOfferAmount] = useState<number>(0);
  const [offerMessage, setOfferMessage] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);

  // Selected item active image index
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Hot Price Drops state variables
  const [priceDroppedListings, setPriceDroppedListings] = useState<Listing[]>([]);
  const [loadingPriceDrops, setLoadingPriceDrops] = useState(true);
  const priceDroppedScrollRef = useRef<HTMLDivElement>(null);
  const priceDroppedDrag = useDragScroll(priceDroppedScrollRef);

  useEffect(() => {
    async function fetchPriceDrops() {
      try {
        let docs: Listing[] = [];
        try {
          const q = query(
            collection(db, 'listings'),
            where('status', 'in', ['LIVE', 'BOOKED', 'SOLD']),
            limit(100)
          );
          const snapshot = await getDocs(q);
          docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Listing));
        } catch (err) {
          console.error("Negotiations fetch for price drops failed:", err);
          docs = [];
        }

        // Filter genuine price drops
        const priceDropDocs = docs.filter(d => Boolean(d.priceDropped === true && d.priceDroppedPercent && d.priceDroppedPercent > 0));
        priceDropDocs.sort((a, b) => (b.priceDroppedPercent || 0) - (a.priceDroppedPercent || 0));
        setPriceDroppedListings(priceDropDocs.slice(0, 15));
      } catch (err) {
        console.error("Error setting up price drops:", err);
        setPriceDroppedListings([]);
      } finally {
        setLoadingPriceDrops(false);
      }
    }
    fetchPriceDrops();
  }, []);
  const [yourNegSearch, setYourNegSearch] = useState('');
  const [yourNegStatus, setYourNegStatus] = useState<string>('all');
  const [isExpandedAllAssets, setIsExpandedAllAssets] = useState(false);
  

  const [actingBidId, setActingBidId] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [zoomImages, setZoomImages] = useState<string[] | undefined>(undefined);
  const [showAllSentOffersModal, setShowAllSentOffersModal] = useState(false);

  // Global cache of user profiles to evaluate KYC and Premium status for filtration instantly
  const [profilesMap, setProfilesMap] = useState<Record<string, any>>({});

  // 1. Live subscribe to user profiles
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const map: Record<string, any> = {};
      snapshot.docs.forEach(docSnap => {
        map[docSnap.id] = docSnap.data();
      });
      setProfilesMap(map);
    });
    return () => unsubscribe();
  }, []);

  // 2. Live subscribe to negotiation assets
  useEffect(() => {
    const q = query(
      collection(db, 'arena_auctions'),
      where('isNegotiationOnly', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        startTime: parseSafeDate(docSnap.data().startTime),
        endTime: parseSafeDate(docSnap.data().endTime),
        createdAt: parseSafeDate(docSnap.data().createdAt),
        updatedAt: parseSafeDate(docSnap.data().updatedAt)
      } as AuctionItem)).filter(item => !isListingRemoved(item));

      // Sort by creation time descending (latest first)
      fetched.sort((a, b) => {
        const timeA = a.createdAt?.getTime() || 0;
        const timeB = b.createdAt?.getTime() || 0;
        return timeB - timeA;
      });

      setItems(fetched);
      setLoading(false);
    }, (err) => {
      console.error("Negotiation assets subscription failed:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2.2 Synchronous event listeners for instant removal on seller/admin action
  useEffect(() => {
    const handleAuctionDeleted = (e: any) => {
      const deletedId = e.detail?.auctionId;
      if (deletedId) {
        setItems(prev => prev.filter(item => item.id !== deletedId));
      }
    };

    const handleAuctionUpdated = (e: any) => {
      const detail = e.detail;
      if (detail?.auctionId && (detail.isPermanentlyRemoved || detail.status === 'cancelled')) {
        setItems(prev => prev.filter(item => item.id !== detail.auctionId));
      }
    };

    window.addEventListener('arena_auction_deleted' as any, handleAuctionDeleted);
    window.addEventListener('arena_auction_updated' as any, handleAuctionUpdated);
    return () => {
      window.removeEventListener('arena_auction_deleted' as any, handleAuctionDeleted);
      window.removeEventListener('arena_auction_updated' as any, handleAuctionUpdated);
    };
  }, []);

  // 2.5 Listen to URL item parameter and auto-select & scroll
  useEffect(() => {
    if (paramItemId) {
      setSelectedItemId(paramItemId);
      const timer = setTimeout(() => {
        const elem = document.getElementById('available-negotiation-section');
        if (elem) {
          elem.scrollIntoView({ behavior: 'smooth' });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [paramItemId]);

  // 3. Filter items dynamically on client side for Private Negotiation Marketplace
  const currencyFilteredItems = filterListingsByCurrency(items, selectedCurrency);
  const filteredItems = currencyFilteredItems.filter(item => {
    if (isListingRemoved(item)) return false;
    // Private Negotiation Marketplace must contain ONLY: item.isNegotiationOnly === true AND item.status !== 'upcoming'
    if (item.isNegotiationOnly !== true || item.status === 'upcoming') return false;
    // Search Query Matches title, brand, description, category, city
    const matchesSearch = !appliedFilters.searchQuery || 
      item.title?.toLowerCase().includes(appliedFilters.searchQuery.toLowerCase()) ||
      item.brand?.toLowerCase().includes(appliedFilters.searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(appliedFilters.searchQuery.toLowerCase()) ||
      item.category?.toLowerCase().includes(appliedFilters.searchQuery.toLowerCase()) ||
      item.city?.toLowerCase().includes(appliedFilters.searchQuery.toLowerCase());

    // Status filter
    const matchesStatus = !appliedFilters.status || appliedFilters.status.includes(item.status);

    // KYC approved seller filter
    const sellerProf = profilesMap[item.sellerId];
    const isSellerKyc = sellerProf 
      ? (sellerProf.kycStatus === 'APPROVED' || sellerProf.isKycVerified === true) 
      : (item.sellerId.includes('alpha') || item.sellerId.includes('beta') || item.sellerId.includes('host'));
    const matchesKyc = !appliedFilters.isKycVerified || isSellerKyc;

    // Premium seller badge filter
    const isSellerPremium = sellerProf 
      ? (sellerProf.isPremiumVerified || sellerProf.verifiedBadgeType === 'GOLDEN' || sellerProf.verifiedBadgeType === 'PREMIUM') 
      : (item.sellerId.includes('alpha') || item.sellerId.includes('host'));
    const matchesPremium = !appliedFilters.isPremiumSeller || isSellerPremium;

    // My Posts filter
    const matchesMyPost = !appliedFilters.sellerId || (item.sellerId === appliedFilters.sellerId);
    
    // Category filter
    const matchesCategory = !appliedFilters.category || (item.category === appliedFilters.category);
    
    // City filter
    const matchesCity = !appliedFilters.city || (item.city && item.city.toLowerCase().includes(appliedFilters.city.toLowerCase()));

    // Sequence Priority filter
    const matchesSequencePriority = !appliedFilters.sequencePriority || (item.sequencePriority && item.sequencePriority.toLowerCase().includes(appliedFilters.sequencePriority.toLowerCase()));

    // Tactical Status filter
    const matchesTacticalStatus = !appliedFilters.tacticalStatus || (item.tacticalStatus && item.tacticalStatus.toLowerCase().includes(appliedFilters.tacticalStatus.toLowerCase()));

    return matchesSearch && matchesStatus && matchesKyc && matchesPremium && matchesMyPost && matchesCategory && matchesCity && matchesSequencePriority && matchesTacticalStatus;
  });

  // Sort filtered items
  const sortedItems = [...filteredItems].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
      case 'endingSoon':
        return (a.endTime?.getTime() || 0) - (b.endTime?.getTime() || 0);
      case 'lowestPrice':
        return (a.startingPrice || 0) - (b.startingPrice || 0);
      case 'highestPrice':
        return (b.startingPrice || 0) - (a.startingPrice || 0);
      case 'mostWatched':
        return (b.watchersCount || 0) - (a.watchersCount || 0);
      case 'mostBids':
        return (b.bidsCount || 0) - (a.bidsCount || 0);
      default:
        return 0;
    }
  });

  const sampleFallbackItem: AuctionItem = {
    id: 'sample-negotiation-asset',
    title: 'Sample Negotiation Asset',
    description: 'This is a high-grade military tactical asset description showing how private negotiations work. Premium trading locks, multi-sig escrow, and complete buyer protection are applied.',
    startingPrice: 2500000,
    currentBid: 2500000,
    images: ['https://images.unsplash.com/photo-1555664424-778a1e5e1b48?auto=format&fit=crop&q=80&w=800'],
    category: 'Classified Hardware',
    sellerId: 'sample-seller',
    sellerName: 'Elite Vanguard Corp',
    viewsCount: 1337,
    status: 'active',
    startTime: new Date(),
    endTime: new Date(Date.now() + 86400000 * 7),
    createdAt: new Date(),
    updatedAt: new Date(),
    isNegotiationOnly: true,
    bidsCount: 0,
    watchersCount: 0,
    minIncrement: 5000,
    extensionsCount: 0,
    maxExtensions: 3
  };

  // 4. Set currently selected listed item (strictly bounded by selectedCurrency)
  const selectedItem = sortedItems.find(item => item.id === selectedItemId) || (sortedItems.length > 0 ? sortedItems[0] : null);

  // Filter price dropped listings by global selected currency
  const filteredPriceDroppedListings = filterListingsByCurrency(priceDroppedListings, selectedCurrency);

  // Find if user has an active negotiation for this selectedItem
  const activeNegotiation = React.useMemo(() => {
    if (!user || !selectedItem) return null;
    return negotiations.find(n => 
      n.auctionId === selectedItem.id && 
      n.buyerId === user.uid && 
      (n.status === 'open' || n.status === 'offer_sent' || n.status === 'counter_offered')
    );
  }, [user, selectedItem, negotiations]);

  // Reset image carousel index and offer fields on item change
  useEffect(() => {
    setActiveImageIndex(0);
    if (selectedItem) {
      setTempPrice(selectedItem.startingPrice || 0);
      setOfferAmount(selectedItem.startingPrice || 0);
    }
  }, [selectedItem?.id]);

  // 5. Fetch seller profile of the displayed item
  useEffect(() => {
    if (!selectedItem) {
      setSellerProfile(null);
      return;
    }

    setLoadingSeller(true);
    const sellerId = selectedItem.sellerId;

    const applyFallbackProfile = () => {
      const isAlpha = sellerId.includes('alpha');
      const isBeta = sellerId.includes('beta');
      const isGamma = sellerId.includes('gamma');
      const isHost = sellerId.includes('host');

      let kycStatus: UserProfile['kycStatus'] = 'NONE';
      let isPremiumVerified = false;
      let isVerified = false;

      if (isAlpha || isHost) {
        kycStatus = 'APPROVED';
        isPremiumVerified = true;
        isVerified = true;
      } else if (isBeta) {
        kycStatus = 'APPROVED';
        isPremiumVerified = false;
        isVerified = false;
      } else if (isGamma) {
        kycStatus = 'NONE';
        isPremiumVerified = false;
        isVerified = false;
      } else {
        kycStatus = 'APPROVED';
        isPremiumVerified = true;
        isVerified = true;
      }

      setSellerProfile({
        id: sellerId,
        name: selectedItem.sellerName || "Anonymous Seller",
        kycStatus,
        isPremiumVerified,
        isVerified,
        createdAt: new Date(),
        updatedAt: new Date()
      } as UserProfile);
    };

    const userRef = doc(db, 'users', sellerId);
    getDoc(userRef).then((docSnap) => {
      if (docSnap.exists()) {
        setSellerProfile(docSnap.data() as UserProfile);
      } else {
        applyFallbackProfile();
      }
      setLoadingSeller(false);
    }).catch((err) => {
      console.warn("Seller profile loading failed or client is offline. Operating in offline fallback mode:", err);
      applyFallbackProfile();
      setLoadingSeller(false);
    });
  }, [selectedItem?.id]);

  // 6. Subscribe to bids/offers of the selected item in real time
  useEffect(() => {
    if (!selectedItem) {
      setBids([]);
      return;
    }

    const q = query(
      collection(db, 'arena_auctions', selectedItem.id, 'bids'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedBids = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        timestamp: parseSafeDate(docSnap.data().timestamp)
      } as Bid));
      setBids(fetchedBids);
    }, (err) => {
      console.error("Offers/bids subcollection listener failed:", err);
    });

    return () => unsubscribe();
  }, [selectedItem?.id]);

  // Authoritative verification for selected item seller profile
  const authVerification = resolveAuthoritativeVerification(sellerProfile);
  const isKycApproved = authVerification.isKycCurrentlyValid;
  const hasPremiumBadge = authVerification.isPremiumCurrentlyActive;
  const verificationScore = authVerification.verificationScore;

  const rawTrustScore = typeof sellerProfile?.trustScore === 'number' && Number.isFinite(sellerProfile.trustScore)
    ? sellerProfile.trustScore
    : INITIAL_TRUST_SCORE;
  const trustScore = clampTrustScore(rawTrustScore);
  const trustTier = sellerProfile?.trustTier || calculateTrustTier(trustScore);

  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Perspective Simulator state for ArenaNegotiations
  const [isPrivateSeller, setIsPrivateSeller] = useState<boolean>(false);
  const [adminPerspective, setAdminPerspective] = useState<'admin' | 'buyer' | 'seller'>(() => {
    if (selectedItem && user && selectedItem.sellerId === user.uid) {
      return 'seller';
    }
    return 'buyer';
  });
  
  // Initialize perspective and private ownership based on whether user is actually the owner of the currently selected item
  useEffect(() => {
    let isMounted = true;
    if (!selectedItem || !user?.uid) {
      setIsPrivateSeller(false);
      setAdminPerspective('buyer');
      return;
    }

    if (!selectedItem.isNegotiationOnly) {
      const match = selectedItem.sellerId === user.uid;
      setIsPrivateSeller(match);
      setAdminPerspective(match ? 'seller' : 'buyer');
      return;
    }

    // For Private Negotiation: check private/seller subcollection
    getDoc(doc(db, 'arena_auctions', selectedItem.id, 'private', 'seller'))
      .then((snap) => {
        if (isMounted) {
          const isMatch = snap.exists() && snap.data()?.sellerUid === user.uid;
          setIsPrivateSeller(isMatch);
          setAdminPerspective(isMatch ? 'seller' : 'buyer');
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsPrivateSeller(false);
          setAdminPerspective('buyer');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedItem?.id, selectedItem?.isNegotiationOnly, selectedItem?.sellerId, user?.uid]);

  // Determine effective ownership based on simulator or actual item ownership
  const isActualSeller = !!(selectedItem && user && (isPrivateSeller || selectedItem.sellerId === user.uid));
  const isOwner = Boolean(selectedItem && user && (adminPerspective === 'seller' || isActualSeller));
  const isActualBuyer = !isActualSeller;

  // View count incrementer
  const handleIncrementViews = async () => {
    if (!selectedItem) return;
    try {
      const itemRef = doc(db, 'arena_auctions', selectedItem.id);
      await updateDoc(itemRef, {
        viewsCount: increment(1)
      });
    } catch (err) {
      console.error("Failed to increment views:", err);
    }
  };

  // Set Price update handler (for seller or setup)
  const handleSetPrice = async (newPrice: number, newCurrency?: string, newCurrencySymbol?: string) => {
    if (!selectedItem) return;
    try {
      const itemRef = doc(db, 'arena_auctions', selectedItem.id);
      const updateData: any = {
        startingPrice: newPrice,
        currentBid: newPrice,
        updatedAt: serverTimestamp()
      };
      if (newCurrency) updateData.currency = newCurrency;
      if (newCurrencySymbol) updateData.currencySymbol = newCurrencySymbol;
      await updateDoc(itemRef, updateData);
      alert(`Success: Price set for negotiation updated to ${formatPrice(newPrice, newCurrencySymbol || newCurrency || selectedItem.currencySymbol || selectedItem.currency)}`);
    } catch (err: any) {
      alert(`Failed to update price: ${err.message || err}`);
    }
  };

  // Seller action helper under individual buyer offers to open negotiation room with specific flags
  const handleOpenNegotiationWithFlags = async (bid: Bid, flags: { showAgreement?: boolean; showContact?: boolean; showReport?: boolean }) => {
    if (!selectedItem) return;
    try {
      let neg = negotiations.find(n => n.auctionId === selectedItem.id && n.buyerId === bid.userId);
      let negId = neg?.id;
      
      if (!negId) {
        // Automatically start the negotiation room
        negId = await NegotiationService.startNegotiation(
          bid.userId,
          selectedItem.id,
          bid.amount,
          bid.message || "Bilateral discussion initiated"
        );
      }
      
      navigate(`/negotiations/timeline/${negId}`);
    } catch (err: any) {
      console.error("Seller action initiation failed:", err);
      alert(`Action Initiation Failed: ${err.message || err}`);
    }
  };

  const handleDirectAcceptBid = async (bid: Bid) => {
    if (!selectedItem || !user) return;
    setActingBidId(bid.id || bid.userId);
    try {
      let neg = negotiations.find(n => n.auctionId === selectedItem.id && n.buyerId === bid.userId);
      let negId = neg?.id;
      
      if (!negId) {
        negId = await NegotiationService.startNegotiation(
          bid.userId,
          selectedItem.id,
          bid.amount,
          bid.message || "Bilateral discussion initiated"
        );
      }
      
      await NegotiationService.respondToOffer(negId, user.uid, 'accept');
    } catch (err: any) {
      console.error("Accept failed:", err);
      alert(`Accept failed: ${err.message || err}`);
    } finally {
      setActingBidId(null);
    }
  };

  const handleDirectDeclineBid = async (bid: Bid) => {
    if (!selectedItem || !user) return;
    setActingBidId(bid.id || bid.userId);
    try {
      let neg = negotiations.find(n => n.auctionId === selectedItem.id && n.buyerId === bid.userId);
      let negId = neg?.id;
      
      if (!negId) {
        negId = await NegotiationService.startNegotiation(
          bid.userId,
          selectedItem.id,
          bid.amount,
          bid.message || "Bilateral discussion initiated"
        );
      }
      
      await NegotiationService.respondToOffer(negId, user.uid, 'decline');
    } catch (err: any) {
      console.error("Decline failed:", err);
      alert(`Decline failed: ${err.message || err}`);
    } finally {
      setActingBidId(null);
    }
  };

  // Calculate real-time offers count for current user on current selectedItem, accounting for both bids subcollection and negotiation offer counts
  const userSubmittedOffersCount = React.useMemo(() => {
    if (!user || !selectedItem) return 0;
    const userItemBidsCount = bids.filter(b => b.userId === user.uid && b.auctionId === selectedItem.id && (b as any).status !== 'withdrawn' && !(b as any).isWithdrawn).length;
    const userItemNegs = negotiations.filter(n => n.auctionId === selectedItem.id && n.buyerId === user.uid && (n.status || '').toLowerCase() !== 'withdrawn');
    const negsOfferCount = userItemNegs.reduce((sum, n) => sum + (n.offerCount || 0), 0);
    return Math.max(userItemBidsCount, negsOfferCount);
  }, [user, selectedItem, bids, negotiations]);

  // Real-time pure offers submitted by users (safely merging bids subcollection with active negotiations for full coverage)
  const displayedBids = React.useMemo(() => {
    if (!selectedItem) return [];

    // Start with a copy of the real bids subcollection (strictly excluding withdrawn bids)
    const merged: Bid[] = bids.filter(b => (b as any).status !== 'withdrawn' && !(b as any).isWithdrawn);

    // Filter negotiations for this item (strictly excluding withdrawn negotiations)
    const itemNegs = negotiations.filter(n => n.auctionId === selectedItem.id && (n.status || '').toLowerCase() !== 'withdrawn');

    itemNegs.forEach(neg => {
      // Check if we already have a bid for this buyer in the merged list
      const hasBid = merged.some(b => b.userId === neg.buyerId);
      
      if (!hasBid) {
        // If no bid in the subcollection, represent the negotiation's last offer as a synthetic bid
        merged.push({
          id: neg.id,
          userId: neg.buyerId,
          userName: neg.buyerId === user?.uid ? "You" : "Anonymous User",
          amount: neg.lastOfferAmount,
          timestamp: neg.updatedAt || neg.createdAt || new Date(),
          message: `Strategic private negotiation offer.`,
          auctionId: neg.auctionId,
          // Propagate currency details
          currency: neg.currency || selectedItem.currency || 'USD',
          currencySymbol: neg.currencySymbol || selectedItem.currencySymbol || '$'
        });
      }
    });

    // Sort chronologically/by timestamp descending (latest first)
    return merged.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
  }, [bids, selectedItem, negotiations, user, isOwner, profilesMap]);

  const remainingOffersCount = Math.max(0, 10 - userSubmittedOffersCount);

  // Check if user is blocked or banned
  const isUserBlockedOrBanned = !!(
    userProfile?.isBlocked || 
    userProfile?.moderationStatus === 'BANNED' || 
    userProfile?.moderationStatus === 'SUSPENDED'
  );

  // Check if listing/negotiation is active with valid remaining time
  const isListingActive = React.useMemo(() => {
    if (!selectedItem) return false;
    const hubStatus = getNegotiationHubStatus(selectedItem, activeNegotiation);
    return hubStatus?.isActive ?? false;
  }, [selectedItem, activeNegotiation]);

  const hubStatus = React.useMemo(() => {
    return getNegotiationHubStatus(selectedItem, activeNegotiation);
  }, [selectedItem, activeNegotiation]);

  const isOfferUnderProcess = React.useMemo(() => {
    return !!(activeNegotiation && 
      user &&
      (activeNegotiation.status === 'open' || activeNegotiation.status === 'offer_sent' || activeNegotiation.status === 'counter_offered') && 
      activeNegotiation.lastOfferBy === user.uid);
  }, [activeNegotiation, user]);

  const isOfferInteractive = React.useMemo(() => {
    return isListingActive && userSubmittedOffersCount < 10 && !isUserBlockedOrBanned && !isOfferUnderProcess;
  }, [isListingActive, userSubmittedOffersCount, isUserBlockedOrBanned, isOfferUnderProcess]);

  const lastBuyerOfferTime = React.useMemo(() => {
    if (!user || !selectedItem) return 0;
    const userNeg = negotiations.find(n => n.auctionId === selectedItem.id && n.buyerId === user.uid);
    if (!userNeg) return 0;
    const directDate = parseSafeDate((userNeg as any).lastBuyerOfferAt);
    if (directDate && !isNaN(directDate.getTime())) return directDate.getTime();
    if (userNeg.lastOfferBy === user.uid && userNeg.updatedAt) {
      const d = parseSafeDate(userNeg.updatedAt);
      if (d) return d.getTime();
    }
    return 0;
  }, [user, selectedItem, negotiations]);

  const cooldownRemainingSec = React.useMemo(() => {
    if (!lastBuyerOfferTime) return 0;
    const elapsed = now.getTime() - lastBuyerOfferTime;
    if (elapsed >= 15000) return 0;
    return Math.ceil((15000 - elapsed) / 1000);
  }, [lastBuyerOfferTime, now]);

  const offerBtnConfig = React.useMemo(() => {
    if (isUserBlockedOrBanned) {
      return {
        label: "Blocked from Offering",
        className: "bg-red-500/10 text-red-500 border border-red-500/20 cursor-not-allowed opacity-90",
        iconColor: "text-red-500 fill-red-500/20",
        disabled: true
      };
    }
    if (cooldownRemainingSec > 0) {
      return {
        label: `Wait ${cooldownRemainingSec}s (15s Cooldown Active)`,
        className: "bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-not-allowed opacity-90",
        iconColor: "text-amber-400 fill-amber-400/20 animate-pulse",
        disabled: true
      };
    }
    if (isOfferUnderProcess) {
      return {
        label: "Offer Under Process",
        className: "bg-amber-500/10 text-amber-500 border border-amber-500/20 cursor-not-allowed opacity-90",
        iconColor: "text-amber-500 fill-amber-500/20",
        disabled: true
      };
    }
    if (userSubmittedOffersCount >= 10) {
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
    if (isActualSeller) {
      return {
        label: "Sellers Cannot Submit Offers",
        className: "bg-stone-800 text-stone-500 border border-stone-700 cursor-not-allowed opacity-80",
        iconColor: "text-stone-500",
        disabled: true
      };
    }
    return {
      label: "Make an Offer",
      className: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-955 cursor-pointer shadow-lg active:scale-95",
      iconColor: "text-stone-955 fill-stone-955 animate-pulse",
      disabled: false
    };
  }, [isListingActive, userSubmittedOffersCount, isUserBlockedOrBanned, hubStatus, isOfferUnderProcess, cooldownRemainingSec, isActualSeller]);

  // Submit Offer / Initiate negotiation handler
  const handleInitiateSubmitOffer = () => {
    if (!user) {
      setShowSendOfferModal(false);
      setShowAuthRequiredModal(true);
      return;
    }
    if (!selectedItem) return;
    if (isActualSeller) {
      alert("Action denied: Sellers cannot submit offers for their own listed items.");
      return;
    }
    if (isUserBlockedOrBanned) {
      alert("Action denied: Your account is suspended, blocked or banned by administration.");
      return;
    }
    if (!isListingActive) {
      alert("Action denied: This listing is expired, paused by seller/admin, or force closed.");
      return;
    }
    if (cooldownRemainingSec > 0) {
      alert(`Cooldown Active: Please wait ${cooldownRemainingSec} second${cooldownRemainingSec > 1 ? 's' : ''} before resubmitting an offer. Time between submitted offers must be at least 15 seconds.`);
      return;
    }
    if (userSubmittedOffersCount >= 10) {
      alert("Offer limit reached: You have reached the maximum of 10 offers allowed for a single negotiation.");
      return;
    }

    if (isOfferUnderProcess) {
      alert("Action denied: Your submitted offer is currently under process. Please wait until the counterparty accepts, rejects, or counters.");
      return;
    }

    if (!offerAmount || offerAmount <= 0) {
      alert("Offer validation failure: Please set a valid offer price.");
      return;
    }
    if (!offerMessage || offerMessage.trim() === '') {
      alert("Offer validation failure: Attached bilateral terms message is mandatory when submitting an offer.");
      return;
    }

    setShowConfirmOfferModal(true);
  };

  const executeSubmitOffer = async () => {
    if (!user || !selectedItem) return;
    if (isUserBlockedOrBanned) {
      alert("Action denied: Your account is suspended, blocked or banned by administration.");
      return;
    }
    if (!isListingActive) {
      alert("Action denied: The negotiation timer for this item has expired or the item is no longer active.");
      return;
    }
    if (cooldownRemainingSec > 0) {
      alert(`Cooldown Active: Please wait ${cooldownRemainingSec} second${cooldownRemainingSec > 1 ? 's' : ''} before resubmitting an offer. Time between submitted offers must be at least 15 seconds.`);
      return;
    }
    if (userSubmittedOffersCount >= 10) {
      alert("Offer limit reached: You have reached the maximum of 10 offers allowed for a single negotiation.");
      return;
    }

    if (isOfferUnderProcess) {
      alert("Action denied: Your submitted offer is currently under process. Please wait until the counterparty accepts, rejects, or counters.");
      return;
    }

    if (!offerMessage || offerMessage.trim() === '') {
      alert("Offer validation failure: Attached bilateral terms message is mandatory.");
      return;
    }

    setSubmittingOffer(true);
    try {
      // Initiate the private chat negotiation room which atomically handles bids, items, and negotiations
      await NegotiationService.startNegotiation(
        user.uid,
        selectedItem.id,
        offerAmount,
        offerMessage.trim() || "Initiated tactical acquisition offer"
      );

      setShowSendOfferModal(false);
      setShowConfirmOfferModal(false);
      setOfferMessage('');
      setOfferAmount(0);
      setShowSuccessOfferModal(true);
    } catch (err: any) {
      console.error("Offer creation failed:", err);
      alert(`Offer Submission Failed: ${err.message || err}`);
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleExecuteCounterOffer = async () => {
    if (!user || !counterTargetNeg || !counterAmount) return;
    const numAmount = parseFloat(counterAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Please enter a valid counter offer amount.");
      return;
    }
    setSubmittingCounter(true);
    try {
      const finalMsg = counterMessage.trim() || `Counter offer: ${formatPrice(numAmount, counterTargetNeg.currencySymbol || counterTargetNeg.currency || selectedItem?.currencySymbol || selectedItem?.currency)}`;
      await NegotiationService.sendCounterOffer(counterTargetNeg.id, user.uid, numAmount, finalMsg);
      setShowCounterOfferModal(false);
      setCounterTargetNeg(null);
      setCounterAmount('');
      setCounterMessage('');
      setShowCounterSuccessModal(true);
    } catch (err: any) {
      console.error("Counter offer failed:", err);
      alert(`Counter Offer Failed: ${err.message || err}`);
    } finally {
      setSubmittingCounter(false);
    }
  };

  const handleAcceptOffer = async (neg: any) => {
    if (!user || !neg) return;
    if (!window.confirm("Are you sure you want to accept this offer? This will conclude the deal.")) return;
    try {
      await NegotiationService.respondToOffer(neg.id, user.uid, 'accept');
      alert("Offer accepted! Deal concluded successfully.");
    } catch (err: any) {
      alert(`Accept failed: ${err.message || err}`);
    }
  };

  const handleDeclineOffer = async (neg: any) => {
    if (!user || !neg) return;
    if (!window.confirm("Are you sure you want to reject this offer?")) return;
    try {
      await NegotiationService.respondToOffer(neg.id, user.uid, 'decline');
      alert("Offer rejected.");
    } catch (err: any) {
      alert(`Reject failed: ${err.message || err}`);
    }
  };

  // Prepare Chart Data
  const chartData = displayedBids.map((b, index) => ({
    name: b.timestamp ? b.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `Offer ${index + 1}`,
    price: b.amount
  })).reverse(); // Reverse for chronological order

  // Fallback points for the chart to keep the display looking professional
  if (chartData.length < 2 && selectedItem) {
    const base = selectedItem.startingPrice || 100000;
    chartData.unshift(
      { name: 'Floor Set', price: base * 0.9 },
      { name: 'Launch', price: base * 0.95 },
      { name: 'Evaluation', price: base * 0.98 },
      { name: 'Current', price: base }
    );
  }

  // Helper functions for modular components
  const renderHeaderAndFeatures = () => (
    <>
      {/* 1. Header Navigation Row */}
      <div className="flex flex-col gap-4 w-full">
        <div className="flex items-center justify-between gap-2 w-full flex-wrap sm:flex-nowrap">
          <ArenaBackButton />
          <ThreeDButton 
            id="enter-arena-btn"
            to="/battle-bids"
            label="Enter Battle Bids Arena"
            icon={Swords}
            variant="amber"
            size="sm"
            fullWidth={false}
            className="flex-initial text-[11px] sm:text-xs"
          />
        </div>
        
        <div className="w-full">
          <MyProfileSection />
        </div>
      </div>

      {/* Account Banned Warning Banner & Appeal Flow */}
      <AccountBannedBanner variant="dark" />

      {/* 2. SECURE DEPLOYMENT Post Assets Section */}
      <div id="post-assets-banner" className="bg-stone-900/60 border border-stone-800/80 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-4 sm:gap-6">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="space-y-1.5 text-center md:text-left">
          <span className="text-xs sm:text-xs font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
            SECURE DEPLOYMENT
          </span>
          <h3 className="text-lg sm:text-xl font-black uppercase text-white tracking-tight">Liquidate Assets Privately</h3>
          <p className="text-stone-400 text-xs sm:text-xs font-medium max-w-lg leading-relaxed">
            Post your high-tier items directly onto the private negotiation hub to entertain direct, anonymous tactical acquisitions.
          </p>
        </div>
        <ThreeDButton 
          id="post-assets-btn"
          to="/negotiations/create"
          label="Post Asset"
          icon={Plus}
          variant="amber"
          size="md"
          fullWidth={false}
          className="w-full md:w-auto px-6"
        />
      </div>

    </>
  );

  const renderSearchAndFilters = () => (
    <div id="strategic-discovery-hub" className="w-full">
      <ArenaDiscovery
        onSearch={(filters) => {
          setAppliedFilters(filters);
          setPendingFilters(filters);
        }}
        onClear={() => {
          const resetFilters = { isNegotiationOnly: true };
          setAppliedFilters(resetFilters);
          setPendingFilters(resetFilters);
          setSearchQuery('');
          setSortBy('newest');
        }}
        onSort={(s) => setSortBy(s)}
        initialSort={sortBy}
        initialFilters={appliedFilters}
        isLoading={loading}
      />
    </div>
  );

  const renderAvailableSection = () => {
    if (loading) {
      return (
        <div id="available-negotiation-section" className="-mt-12 pt-4 border-t border-stone-800/80 space-y-8 animate-pulse">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-white">
              Available For Private Negotiation
            </h2>
          </div>
          <div className="bg-stone-900/40 border border-stone-850 rounded-[2rem] md:rounded-[2.5rem] p-8 flex flex-col items-center justify-center min-h-[260px]">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
            <p className="text-xs font-black uppercase tracking-widest text-stone-400">Loading Negotiation Showcase...</p>
          </div>
        </div>
      );
    }

    if (!selectedItem) {
      const currencyLabel = selectedCurrency?.code || 'Selected Currency';
      return (
        <div id="available-negotiation-section" className="-mt-12 pt-4 border-t border-stone-800/80 space-y-8">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-white">
              Available For Private Negotiation
            </h2>
          </div>
          <div className="bg-stone-900/40 border border-stone-850 rounded-[2rem] md:rounded-[2.5rem] p-8 md:p-12 text-center space-y-4 max-w-3xl mx-auto">
            <div className="w-16 h-16 bg-stone-950/60 rounded-2xl border border-stone-800 flex items-center justify-center mx-auto text-amber-500/80 shadow-inner">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white">
                No items available
              </h3>
              <p className="text-stone-400 text-xs sm:text-sm font-medium leading-relaxed max-w-lg mx-auto">
                There are currently no active items available in <span className="text-amber-400 font-bold">{currencyLabel}</span> for Private Negotiation. New items may appear here when sellers upload or activate listings.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div id="available-negotiation-section" className="-mt-12 pt-4 border-t border-stone-800/80 space-y-8">
        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-black uppercase italic tracking-tight text-white">
            Available For Private Negotiation
          </h2>
        </div>

        {/* Profile of user whose post is being displayed with compact styling and Trust score integrated under the profile name */}
        <div id="seller-dossier-card">
          <AnonymousSellerCard 
            profile={sellerProfile ? {
              ...sellerProfile,
              isKycVerified: isKycApproved,
              isPremiumSeller: hasPremiumBadge,
              city: selectedItem.city || sellerProfile.city || "Location Unknown",
              trustScore: trustScore,
              trustTier: trustTier,
              stats: sellerProfile.stats || {
                completedSales: 0,
                responseTime: "Under 1 hr",
                negotiationSuccess: 0
              }
            } as any : {
              id: selectedItem.sellerId || 'seller',
              uid: selectedItem.sellerId || 'seller',
              displayName: selectedItem.sellerName || "Anonymous Seller",
              isKycVerified: isKycApproved,
              isPremiumSeller: hasPremiumBadge,
              city: selectedItem.city || "Location Unknown",
              trustScore: trustScore,
              trustTier: trustTier,
              stats: {
                completedSales: 0,
                responseTime: "Under 1 hr",
                negotiationSuccess: 0
              }
            } as any}
            alias="Anonymous Seller"
            cityOverride={selectedItem.city}
          />
        </div>

        {/* Images and other details as already decided */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Image Gallery */}
          <div className="space-y-4">
            <ArenaGallery 
              images={selectedItem.images && selectedItem.images.length > 0 ? selectedItem.images : ['https://images.unsplash.com/photo-1555664424-778a1e5e1b48?auto=format&fit=crop&q=80&w=800']} 
              title={selectedItem.title} 
            />

            {/* Exact Posting Date & Time beneath image */}
            <div className="flex items-center gap-2 text-xs font-bold text-stone-300 bg-stone-900/90 border border-stone-800 rounded-xl px-3.5 py-2 w-full sm:w-fit shadow-md">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase tracking-widest text-stone-400 font-black">Posted On:</span>
                <span className="text-amber-400 font-mono font-black">{formatPostedDateTime(selectedItem.createdAt || selectedItem.startTime)}</span>
              </div>
            </div>

            {/* Title and description beneath the uploaded images and before tactical actions */}
            <div id="item-metadata-block" className="space-y-3 px-1 text-left">
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full inline-block">
                {selectedItem.category || "Tactical Asset"}
              </span>
              <h2 className="text-xl sm:text-2xl font-black uppercase text-white tracking-tight leading-tight">{selectedItem.title}</h2>
              <p className="text-stone-400 text-xs leading-relaxed whitespace-pre-line border-t border-stone-800/60 pt-3 uppercase font-medium">
                {selectedItem.description}
              </p>
            </div>

            {/* Tactical Actions for Private Negotiation Hub Asset */}
            <div id="negotiation-tactical-actions-block" className="pt-2">
              <ArenaTacticalActions item={selectedItem} />
            </div>
          </div>

          {/* Other details & pricing control */}
          <div className="space-y-6">
            {selectedItem && (
              <NegotiationOfferTimer endTime={selectedItem.endTime} status={selectedItem.status} />
            )}
            {/* Pricing display & action buttons */}
            <div id="pricing-control-floor" className="bg-gradient-to-b from-stone-900 to-stone-955 border border-stone-800 rounded-3xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-stone-400">Price Set For Negotiations</span>
                  <h3 className="text-2xl font-black text-amber-500 mt-0.5">{formatPrice(selectedItem.startingPrice, selectedItem.currencySymbol || selectedItem.currency)}</h3>
                </div>
                             {isOwner && (
                  selectedItem.status === 'upcoming' ? (
                    <button 
                      id="set-price-trigger"
                      onClick={() => {
                        setTempPrice(selectedItem.startingPrice || 0);
                        setTempCurrency(selectedItem.currency || 'USD');
                        setTempCurrencySymbol(selectedItem.currencySymbol || '$');
                        setShowSetPriceModal(true);
                      }}
                      className="px-4 py-2.5 bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-200 rounded-xl font-black uppercase text-xs tracking-wider transition-all active:scale-95 shadow-md"
                    >
                      Set Price
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-955 border border-stone-800 text-stone-400 rounded-xl font-black uppercase text-[10px] tracking-wider shadow-inner">
                      <Lock className="w-3.5 h-3.5 text-rose-500" /> Price Locked
                    </div>
                  )
                )}
              </div>

              {isOwner && (
                (() => {
                  const ownerNeg = negotiations.find(n => n.auctionId === selectedItem?.id);
                  const statusInfo = getNegotiationHubStatus(selectedItem, ownerNeg);
                  const timelineTarget = ownerNeg ? ownerNeg.id : `auction-${selectedItem.id}`;
                  return (
                    <div className="space-y-3 w-full border-t border-stone-800/80 pt-3">
                      {statusInfo && (
                        <div className="flex items-center justify-between bg-stone-955 px-4 py-2.5 rounded-xl border border-stone-800">
                          <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Listing Status</span>
                          <span className={cn(
                            "text-xs font-black uppercase px-2.5 py-1 rounded-lg border",
                            statusInfo.color
                          )}>
                            {statusInfo.label}
                          </span>
                        </div>
                      )}
                      <button 
                        id="view-owner-timeline-trigger"
                        onClick={() => navigate(`/negotiations/timeline/${timelineTarget}`)}
                        className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-955 rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                      >
                        <History className="w-4 h-4 text-stone-955" /> Open Negotiation Timeline
                      </button>
                    </div>
                  );
                })()
              )}

              {!isOwner && (
                <div className="space-y-3 w-full">
                  {activeNegotiation ? (
                    <div className="space-y-3 w-full">
                      <button 
                        id="view-active-negotiation-trigger"
                        onClick={() => navigate(`/negotiations/timeline/${activeNegotiation.id}`)}
                        className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-955 rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95"
                      >
                        <History className="w-4 h-4 text-stone-955" /> Open Negotiation Timeline
                      </button>
                      <div className="flex items-start gap-2 bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10 text-xs text-blue-400 font-medium">
                        <Lock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                          You have an active tactical proposal pending seller response. New offer submissions are locked until the seller accepts, rejects, or counters.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <ThreeDButton 
                        id="send-offer-trigger"
                        onClick={() => {
                          if (!user) {
                            setShowAuthRequiredModal(true);
                            return;
                          }
                          if (!isOfferInteractive) return;
                          setOfferAmount(selectedItem.startingPrice || 0);
                          setShowSendOfferModal(true);
                        }}
                        disabled={!user ? false : !isOfferInteractive}
                        label={offerBtnConfig.label}
                        icon={Zap}
                        variant={!user ? 'amber' : (!isOfferInteractive ? 'dark' : 'amber')}
                        size="md"
                        fullWidth={true}
                        className="w-full"
                      />
                      <div className="flex items-center justify-between px-3 py-2 bg-stone-955 border border-stone-800 rounded-xl">
                        <span className="text-[10px] font-black uppercase text-stone-400">Offers Limit</span>
                        <span className={cn("text-xs font-black", remainingOffersCount <= 2 ? "text-rose-500" : "text-amber-500")}>
                          {remainingOffersCount} Left ({userSubmittedOffersCount}/10 Used)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pricing & Offers TIMELINE */}
        <div id="price-history-chart-block" className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 md:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div>
                <h4 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-500" /> Pricing & Offers Timeline
                </h4>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mt-1">
                  Historical value progression and live negotiations log
                </p>
              </div>
            </div>
          </div>

          <div className="w-full h-[240px] pt-4">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#292524" strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#57534e" 
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#57534e" 
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${selectedItem?.currencySymbol || selectedItem?.currency || '$'}${(v / 1000).toFixed(0)}k`}
                />
                <Area 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorPrice)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Offers submitted by users */}
        <div id="offers-history-block" className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between border-b border-stone-800/60 pb-3 gap-2 flex-wrap sm:flex-nowrap">
            <div>
              <h4 className="text-xs font-black uppercase text-white tracking-widest">Offers Submitted by Users</h4>
            </div>
            <button
              type="button"
              onClick={() => {
                const activeNeg = negotiations.find(n => n.auctionId === selectedItem?.id);
                if (activeNeg) {
                  navigate(`/negotiations/timeline/${activeNeg.id}`);
                } else if (selectedItem?.id) {
                  navigate(`/negotiations/timeline/auction-${selectedItem.id}`);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-stone-955 text-[11px] font-black uppercase tracking-wider rounded-lg shadow-sm shadow-amber-500/10 transition-all active:scale-95 shrink-0 cursor-pointer"
            >
              <History className="w-3.5 h-3.5 text-stone-955" />
              <span>Open Negotiation Timeline</span>
            </button>
          </div>

          {displayedBids.length === 0 ? (
            <div className="text-center py-6 bg-stone-955 rounded-xl border border-dashed border-stone-800 p-4">
              <AlertTriangle className="w-6 h-6 text-amber-500/50 mx-auto mb-2" />
              <p className="text-stone-400 text-xs font-bold uppercase tracking-widest">No strategic proposals on record yet. Submit first offer above.</p>
            </div>
          ) : (
            <div className={cn(
              "space-y-2",
              displayedBids.length > 5 ? "max-h-[300px] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent" : ""
            )}>
              {displayedBids.map((bid, idx) => {
                // Find matching negotiation for this bid
                const relatedNeg = negotiations.find(n => n.auctionId === selectedItem?.id && n.buyerId === bid.userId);
                const isSeller = selectedItem?.sellerId === user?.uid;
                const isOfferSubmitter = bid.userId === user?.uid;
                const lastOfferSenderId = (bid as any).lastOfferBy || relatedNeg?.lastOfferBy || bid.userId;
                const isLastOfferBySeller = lastOfferSenderId === selectedItem?.sellerId;
                const isOwnOffer = Boolean(user?.uid && (
                  user.uid === lastOfferSenderId || 
                  (user.uid === 'simulated-seller' && lastOfferSenderId === selectedItem?.sellerId) ||
                  (user.uid === 'simulated-buyer' && lastOfferSenderId === bid.userId)
                ));
                const canInteract = !!relatedNeg || isSeller || isOfferSubmitter;

                const handleOpenOfferTimeline = (e?: React.MouseEvent) => {
                  e?.stopPropagation();
                  const target = e?.target as HTMLElement | null;
                  if (target && target.closest('button, input, textarea, select, a, [data-interactive="true"]')) {
                    return;
                  }
                  if (relatedNeg) {
                    navigate(`/negotiations/timeline/${relatedNeg.id}`);
                  } else if (selectedItem?.id) {
                    navigate(`/negotiations/timeline/auction-${selectedItem.id}`);
                  }
                };

                const handleOpenOffer = (e: React.MouseEvent) => {
                  if (!canInteract) return;
                  const target = e.target as HTMLElement | null;
                  if (target && target.closest('button, input, textarea, select, a, [data-interactive="true"]')) {
                    return;
                  }
                  handleOpenOfferTimeline(e);
                };

                return (
                <div 
                  key={bid.id || idx}
                  onClick={handleOpenOffer}
                  className={cn(
                    "flex flex-col p-3 sm:p-3.5 bg-stone-955 border border-stone-800/80 rounded-xl gap-2 transition-all shadow-sm group",
                    canInteract 
                      ? "hover:border-amber-500/50 cursor-pointer hover:shadow-md active:scale-[0.99]" 
                      : "cursor-default"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center border border-stone-800 text-stone-400 shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h5 className="text-xs font-black uppercase text-white truncate">
                            {isOfferSubmitter 
                              ? "My Offer" 
                              : "Anonymous User"
                            }
                          </h5>
                          {profilesMap[bid.userId] && (
                            <div className="flex items-center gap-1 shrink-0">
                              {(profilesMap[bid.userId].isPremiumVerified || profilesMap[bid.userId].verifiedBadgeType === 'GOLDEN' || profilesMap[bid.userId].verifiedBadgeType === 'PREMIUM') ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
                              ) : (profilesMap[bid.userId].kycStatus === 'APPROVED' || profilesMap[bid.userId].isKycVerified === true) ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-500/10" />
                              ) : null}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-stone-400 uppercase block">
                          {bid.timestamp ? bid.timestamp.toLocaleString() : "Live Submission"}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[9px] font-black text-amber-500 uppercase block tracking-wider">
                        {(bid as any).lastOfferBy === selectedItem?.sellerId 
                          ? "SELLER COUNTER OFFER" 
                          : (bid as any).status === 'counter_offered' || relatedNeg?.status === 'counter_offered'
                            ? "COUNTER OFFER"
                            : "PROPOSED OFFER"
                        }
                      </span>
                      <span className="text-xs font-black text-amber-400">{formatPrice(bid.amount, (bid as any).currencySymbol || (bid as any).currency || selectedItem?.currencySymbol || selectedItem?.currency)}</span>
                    </div>
                  </div>

                  {bid.message && (isSeller || isOfferSubmitter) && (
                    <p className="text-[11px] text-stone-400 uppercase italic font-medium bg-stone-900/60 p-2 rounded-lg border border-stone-800/50">"{bid.message}"</p>
                  )}

                  {/* Clean item footer with status indicator & action buttons */}
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-stone-800/40 mt-0.5 flex-wrap">
                    <div className="flex items-center gap-2">
                      {(relatedNeg || bid.status) ? (
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-stone-900 border",
                          (relatedNeg?.status || bid.status) === NegotiationStatus.ACCEPTED || (relatedNeg?.status || bid.status) === NegotiationStatus.COMPLETED || (relatedNeg?.status || bid.status) === 'concluded'
                            ? "border-emerald-500/20 text-emerald-400 bg-emerald-500/5"
                            : "border-stone-800 text-stone-400"
                        )}>
                          {((relatedNeg?.status || bid.status) === 'accepted' || (relatedNeg?.status || bid.status) === 'completed' || (relatedNeg?.status || bid.status) === 'concluded') ? 'CONCLUDED' : (relatedNeg?.status || bid.status || '').toUpperCase()}
                        </span>
                      ) : (isSeller || isOfferSubmitter) ? (
                        <span className="text-[10px] font-black text-amber-500/90 uppercase hover:text-amber-400 transition-colors">
                          Click to view negotiation
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-stone-500 uppercase">
                          Submitted Proposal
                        </span>
                      )}
                    </div>

                    {/* Interactive Role Buttons */}
                    <div 
                      className="flex items-center gap-1.5 flex-wrap ml-auto"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      data-interactive="true"
                    >
                      {/* Recipient Actions (Accept, Reject, Counter) when it's your turn on an active negotiation */}
                      {relatedNeg && ['open', 'offer_sent', 'counter_offered'].includes((relatedNeg.status || '').toLowerCase()) && 
                        (relatedNeg.lastOfferBy ? relatedNeg.lastOfferBy !== user?.uid : (isSeller ? true : !isOfferSubmitter)) && 
                        (isSeller || isOfferSubmitter) && (
                        <>
                          <button
                            type="button"
                            data-interactive="true"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleAcceptOffer(relatedNeg);
                            }}
                            className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-stone-955 text-[10px] sm:text-xs font-black uppercase rounded-lg transition-all active:scale-95 flex items-center gap-1 cursor-pointer shadow-sm"
                          >
                            <Check className="w-3.5 h-3.5" /> Accept
                          </button>

                          <button
                            type="button"
                            data-interactive="true"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeclineOffer(relatedNeg);
                            }}
                            className="px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-[10px] sm:text-xs font-black uppercase rounded-lg transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" /> Reject
                          </button>

                          <button
                            type="button"
                            data-interactive="true"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCounterTargetNeg(relatedNeg);
                              const currVal = bid.amount || relatedNeg.lastOfferAmount || 0;
                              setCounterAmount(currVal > 0 ? String(currVal) : '');
                              setCounterMessage('');
                              setShowCounterOfferModal(true);
                            }}
                            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-955 text-[10px] sm:text-xs font-black uppercase rounded-lg transition-all active:scale-95 flex items-center gap-1 cursor-pointer shadow-sm"
                          >
                            <ArrowRight className="w-3.5 h-3.5" /> Counter
                          </button>
                        </>
                      )}

                      {/* Submitter Action: Withdraw Offer when awaiting counterparty response */}
                      {(isOfferSubmitter || isSeller) && 
                        ((relatedNeg && ['open', 'offer_sent', 'counter_offered'].includes((relatedNeg.status || '').toLowerCase()) && 
                          (relatedNeg.lastOfferBy === user?.uid || (!relatedNeg.lastOfferBy && isOfferSubmitter))) ||
                         (!relatedNeg && isOfferSubmitter)) && (
                        <button
                          type="button"
                          data-interactive="true"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (user && selectedItem) {
                              try {
                                const targetNegId = relatedNeg ? relatedNeg.id : `auction-${selectedItem.id}`;
                                await NegotiationService.respondToOffer(targetNegId, user.uid, 'withdraw');
                              } catch (err: any) {
                                alert(err.message || 'Failed to withdraw offer.');
                              }
                            }
                          }}
                          className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700/50 text-[10px] sm:text-xs font-black uppercase rounded-lg transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                        >
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> Withdraw
                        </button>
                      )}

                      {/* Report Offer button for non-own offers */}
                      {!isOwnOffer && (
                        <div 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          data-interactive="true"
                        >
                          <ReportButton 
                            targetId={bid.id || `offer-${idx}`}
                            targetType="offer"
                            targetTitle={`Offer: ${formatPrice(bid.amount, (bid as any).currencySymbol || (bid as any).currency || selectedItem?.currencySymbol || selectedItem?.currency)}`}
                            targetOwnerId={isLastOfferBySeller ? selectedItem?.sellerId : bid.userId}
                            variant="ghost"
                            showText={false}
                            className="p-1 text-stone-500 hover:text-rose-400"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    );
  };

  const sentOffers = React.useMemo(() => {
    return negotiations
      .filter(n => (n.status || '').toLowerCase() !== 'withdrawn')
      .map(n => {
        const lastOffer = n.offers?.[n.offers.length - 1];
        if (lastOffer && lastOffer.action !== 'withdraw' && (lastOffer as any).status !== 'withdrawn' && lastOffer.senderId === user?.uid) {
          return {
            ...lastOffer,
            negotiationId: n.id,
            auctionId: n.auctionId,
            itemTitle: n.itemTitle || 'Negotiation Item',
            itemImage: n.itemImage,
            itemPrice: n.itemPrice,
            currency: n.currency || items.find(i => i.id === n.auctionId)?.currency || 'USD',
            currencySymbol: n.currencySymbol || items.find(i => i.id === n.auctionId)?.currencySymbol || '$',
          };
        }
        return null;
      })
      .filter(Boolean) as (NegotiationOffer & { itemTitle?: string; itemImage?: string; negotiationId?: string; currency?: string; currencySymbol?: string })[];
  }, [negotiations, user?.uid, items]);

  const mySubmittedOffersNegotiations = React.useMemo(() => {
    if (!user) return [];
    return negotiations.filter(neg => neg.buyerId === user.uid && (neg.status || '').toLowerCase() !== 'withdrawn');
  }, [negotiations, user?.uid]);

  const [ownedAuctionIds, setOwnedAuctionIds] = useState<Set<string>>(new Set());
  const [isResolvingOwned, setIsResolvingOwned] = useState<boolean>(Boolean(user?.uid));

  // Asynchronously resolve authoritative seller ownership for negotiation listings (fail-closed)
  useEffect(() => {
    let isMounted = true;
    if (!user?.uid) {
      setOwnedAuctionIds(new Set());
      setIsResolvingOwned(false);
      return;
    }

    if (items.length === 0) {
      setOwnedAuctionIds(new Set());
      setIsResolvingOwned(loading);
      return;
    }

    setIsResolvingOwned(true);
    const currentUid = user.uid;

    Promise.all(
      items.map(async (item) => {
        try {
          const authoritativeUid = await resolveAuthoritativeSellerUid(item.id, {
            isNegotiationOnly: item.isNegotiationOnly,
            sellerId: item.sellerId
          });
          return authoritativeUid === currentUid ? item.id : null;
        } catch {
          return null; // Fail closed
        }
      })
    ).then((results) => {
      if (isMounted) {
        const ownedSet = new Set(results.filter((id): id is string => Boolean(id)));
        setOwnedAuctionIds(ownedSet);
        setIsResolvingOwned(false);
      }
    }).catch(() => {
      if (isMounted) {
        setOwnedAuctionIds(new Set()); // Fail closed on any failure
        setIsResolvingOwned(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [items, user?.uid, loading]);

  const userMyListings = React.useMemo(() => {
    if (!user) return [];
    return items.filter(i => ownedAuctionIds.has(i.id));
  }, [items, user, ownedAuctionIds]);

  const renderYourNegotiations = () => {
    return (
      <div id="your-negotiations-hub" className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 md:p-8 space-y-6">
        {sentOffers.length > 0 && (
            <SentOffersRow 
              offers={sentOffers} 
              onSeeAll={() => setShowAllSentOffersModal(true)} 
              onSelectOffer={(offer) => {
                if (offer.negotiationId) {
                  navigate(`/negotiations/timeline/${offer.negotiationId}`);
                }
              }}
            />
        )}

        {/* Section for Seller's Own Listed Assets under Negotiations */}
        <div className="space-y-3 border-b border-stone-800/60 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-black uppercase text-white tracking-wide flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500" /> My Posted Negotiations
              </h3>
              <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-0.5">
                Live status and negotiation timeline for assets posted by you
              </p>
            </div>
            {user && (
              isResolvingOwned ? (
                <span className="text-[10px] font-black text-stone-500 bg-stone-800/40 border border-stone-800 px-2.5 py-1 rounded-full animate-pulse">
                  Verifying...
                </span>
              ) : (
                <span className={cn(
                  "text-[10px] font-black px-2.5 py-1 rounded-full border",
                  userMyListings.length > 0 
                    ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
                    : "text-stone-500 bg-stone-800/40 border-stone-800"
                )}>
                  {userMyListings.length} Listed
                </span>
              )
            )}
          </div>

          {!user ? (
            <div className="text-center py-8 bg-stone-955/40 rounded-2xl border border-dashed border-stone-800 p-6">
              <p className="text-stone-400 text-xs font-black uppercase tracking-widest">
                Sign in to view your posted private negotiations.
              </p>
            </div>
          ) : isResolvingOwned ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
            </div>
          ) : userMyListings.length === 0 ? (
            <div className="text-center py-8 bg-stone-955/40 rounded-2xl border border-dashed border-stone-800 p-6">
              <p className="text-stone-400 text-xs font-black uppercase tracking-widest">
                You have not posted any private negotiations yet.
              </p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 pt-2 scrollbar-thin snap-x overscroll-x-contain">
              {userMyListings.slice(0, 4).map(listedItem => {
                const itemNegs = negotiations.filter(n => n.auctionId === listedItem.id);
                const activeOrAccepted = itemNegs.find(n => n.status === 'accepted' || n.status === 'completed' || n.status === 'open' || n.status === 'offer_sent' || n.status === 'counter_offered');
                const itemNeg = activeOrAccepted || itemNegs[0];
                const statusInfo = getNegotiationHubStatus(listedItem, itemNeg);
                const targetTimeline = itemNeg ? itemNeg.id : `auction-${listedItem.id}`;

                return (
                  <div key={listedItem.id} className="w-[260px] sm:w-[280px] shrink-0 snap-start bg-stone-955 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-black uppercase text-white truncate">{listedItem.title}</h4>
                        <p className="text-[10px] font-bold text-amber-500 mt-0.5">
                          Base Floor: {formatPrice(listedItem.startingPrice, listedItem.currencySymbol || listedItem.currency)}
                        </p>
                      </div>
                      {statusInfo && (
                        <span className={cn(
                          "text-[9px] font-black uppercase px-2 py-0.5 rounded-md border shrink-0",
                          statusInfo.color
                        )}>
                          {statusInfo.label}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/negotiations/timeline/${targetTimeline}`)}
                      className="w-full py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>View Timeline & Hub</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-black uppercase text-white">My submitted Offers</h3>
          <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-1">Swipe left or right to browse bilateral rooms</p>
        </div>

        {userNegLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : mySubmittedOffersNegotiations.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory scrollbar-none pb-4">
            {mySubmittedOffersNegotiations.map(neg => (
              <div key={neg.id} className="w-full shrink-0 snap-center">
                <NegotiationCard 
                  negotiation={neg}
                  auction={items.find(i => i.id === neg.auctionId) || sortedItems.find(i => i.id === neg.auctionId)}
                  isBuyer={true}
                  onClick={() => navigate(`/negotiations/timeline/${neg.id}`)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-stone-955/40 rounded-3xl border border-dashed border-stone-800 p-6">
            <p className="text-stone-400 text-xs font-black uppercase tracking-widest">
              No submitted offers found. Select an asset and send a proposal to start!
            </p>
          </div>
        )}
      </div>
    );
  };


  const upcomingNegotiations = React.useMemo(() => {
    return items.filter(item => item.isNegotiationOnly === true && item.status === 'upcoming');
  }, [items]);

  const renderUpcomingNegotiations = () => {
    return (
      <div id="upcoming-negotiations-section" className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 md:p-8 space-y-4">
        <div className="flex items-center justify-between border-b border-stone-800/60 pb-3 gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-black uppercase text-stone-300 tracking-wider">
              Upcoming Negotiations
            </span>
            <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
              {upcomingNegotiations.length} Scheduled
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-stone-400 gap-4">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
            <p className="text-xs font-black uppercase tracking-widest">Loading Upcoming Negotiations...</p>
          </div>
        ) : upcomingNegotiations.length === 0 ? (
          <div className="p-8 text-center bg-stone-955 rounded-3xl border border-dashed border-stone-800/80 space-y-2">
            <Clock className="w-6 h-6 text-stone-600 mx-auto" />
            <p className="text-stone-400 text-xs font-black uppercase tracking-widest">
              No upcoming private negotiations scheduled at this time.
            </p>
            <p className="text-stone-500 text-[11px] font-medium">
              Check back soon for new private liquidation assets before they launch.
            </p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin snap-x overscroll-x-contain">
            {upcomingNegotiations.map(item => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <div 
                  key={item.id}
                  onClick={() => {
                    setSelectedItemId(item.id);
                    const elem = document.getElementById('available-negotiation-section');
                    if (elem) {
                      elem.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className={cn(
                    "flex-shrink-0 w-72 p-4 bg-stone-955 border rounded-[2rem] transition-all cursor-pointer relative group active:scale-95 snap-start flex flex-col justify-between",
                    isSelected 
                      ? "border-amber-500 shadow-xl shadow-amber-500/10 bg-stone-900" 
                      : "border-stone-800/80 hover:border-stone-700 hover:bg-stone-950/50"
                  )}
                >
                  <div>
                    <div className="relative aspect-video rounded-2xl overflow-hidden mb-3 bg-stone-900 border border-stone-800/60">
                      {item.images && item.images[0] ? (
                        <img 
                          src={item.images[0]} 
                          alt={item.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-zoom-in" 
                          referrerPolicy="no-referrer" 
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555664424-778a1e5e1b48?auto=format&fit=crop&q=80&w=800';
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomImage(item.images[0]);
                            setZoomImages(item.images);
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-700 font-mono text-xs">NO IMAGES</div>
                      )}
                      <div className="absolute top-2 left-2 flex gap-1">
                        <span className="px-2 py-0.5 bg-amber-500/90 text-stone-955 text-[10px] font-black uppercase rounded-lg tracking-wider">
                          Upcoming
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400/90 mb-2 bg-stone-900/80 px-2.5 py-1 rounded-lg border border-stone-800/80 w-fit">
                      <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                      <span className="font-mono text-stone-300">
                        {formatPostedDateTime(item.startTime || item.createdAt)}
                      </span>
                    </div>

                    <h4 className="text-xs font-black uppercase text-white truncate">{item.title}</h4>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] font-bold text-stone-400 uppercase">BASE FLOOR</span>
                      <span className="text-xs font-black text-amber-500">
                        {formatPrice(item.startingPrice, item.currencySymbol || item.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-stone-800/60 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-stone-500 uppercase tracking-tight truncate">
                      {item.sellerName || "Anonymous Seller"}
                    </span>
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                      View Asset <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderSwipeableRow = () => {
    return (
      <div id="listed-assets-swipe-row" className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 md:p-8 space-y-4">
        <div className="flex items-center justify-between border-b border-stone-800/60 pb-3 gap-3">
          <span className="text-xs sm:text-sm font-black uppercase text-stone-300 tracking-wider">
            Private Negotiation Marketplace
          </span>
          <Link
            to="/negotiations/explore"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-955 text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 shrink-0"
          >
            <span>Explore</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-stone-400 gap-4">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
            <p className="text-xs font-black uppercase tracking-widest">Loading Tactical Catalog...</p>
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="p-10 text-center bg-stone-955 rounded-3xl border border-dashed border-stone-800/80 space-y-4">
            <p className="text-stone-400 text-xs font-black uppercase tracking-widest">
              No negotiations found matching the selected filters.
            </p>
            <button 
              onClick={() => {
                setAppliedFilters({ isNegotiationOnly: true });
                setPendingFilters({ isNegotiationOnly: true });
                setSearchQuery('');
              }}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
            >
              Reset Filters
            </button>
          </div>
        ) : isExpandedAllAssets ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {sortedItems.map(item => {
                const isSelected = selectedItem?.id === item.id;
                const hasKyc = profilesMap[item.sellerId]
                  ? (profilesMap[item.sellerId].kycStatus === 'APPROVED' || profilesMap[item.sellerId].isKycVerified === true)
                  : (item.sellerId.includes('alpha') || item.sellerId.includes('beta') || item.sellerId.includes('host'));
                const hasPrem = profilesMap[item.sellerId]
                  ? (profilesMap[item.sellerId].isPremiumVerified || profilesMap[item.sellerId].verifiedBadgeType === 'GOLDEN' || profilesMap[item.sellerId].verifiedBadgeType === 'PREMIUM')
                  : (item.sellerId.includes('alpha') || item.sellerId.includes('host'));

                return (
                  <div 
                    key={item.id}
                    onClick={() => {
                      setSelectedItemId(item.id);
                      const elem = document.getElementById('available-negotiation-section');
                      if (elem) {
                        elem.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    className={cn(
                      "w-full p-4 bg-stone-955 border rounded-[2rem] transition-all cursor-pointer relative group active:scale-95 flex flex-col justify-between",
                      isSelected 
                        ? "border-amber-500 shadow-xl shadow-amber-500/10 bg-stone-900" 
                        : "border-stone-800/80 hover:border-stone-700 hover:bg-stone-950/50"
                    )}
                  >
                    <div>
                      <div className="relative aspect-video rounded-2xl overflow-hidden mb-3 bg-stone-900 border border-stone-800/60">
                        {item.images && item.images[0] ? (
                          <img 
                            src={item.images[0]} 
                            alt={item.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-zoom-in" 
                            referrerPolicy="no-referrer" 
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555664424-778a1e5e1b48?auto=format&fit=crop&q=80&w=800';
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomImage(item.images[0]);
                              setZoomImages(item.images);
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-700 font-mono text-xs">NO IMAGES</div>
                        )}
                        <div className="absolute top-2 left-2 flex gap-1">
                          {hasKyc && (
                            <span className="px-2 py-0.5 bg-emerald-500/90 text-stone-955 text-xs font-black rounded-lg">KYC✓</span>
                          )}
                          {hasPrem && (
                            <span className="px-2 py-0.5 bg-amber-500/90 text-stone-955 text-xs font-black rounded-lg">PREM★</span>
                          )}
                        </div>
                      </div>

                      {/* Exact Date and Time of posting under image */}
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400/90 mb-2 bg-stone-900/80 px-2.5 py-1 rounded-lg border border-stone-800/80 w-fit">
                        <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                        <span className="font-mono text-stone-300">{formatPostedDateTime(item.createdAt || item.startTime)}</span>
                      </div>

                      <h4 className="text-xs font-black uppercase text-white truncate">{item.title}</h4>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-bold text-stone-400 uppercase">BASE FLOOR</span>
                        <span className="text-xs font-black text-amber-500">{formatPrice(item.startingPrice, item.currencySymbol || item.currency)}</span>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-stone-800/60 flex items-center justify-between">
                      {(() => {
                        const itemNegs = negotiations?.filter(n => n.auctionId === item.id) || [];
                        const acceptedNeg = itemNegs.find(n => n.status === 'accepted' || n.status === 'completed');
                        const itemNeg = acceptedNeg || itemNegs[0];
                        const hubStatus = getNegotiationHubStatus(item, itemNeg);
                        return hubStatus ? (
                          <span className={cn(
                            "text-[10px] font-black uppercase px-2 py-1 rounded-lg border",
                            hubStatus.color
                          )}>
                            {hubStatus.label}
                          </span>
                        ) : null;
                      })()}
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Tap to View & Negotiate</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
            {sortedItems.map(item => {
              const isSelected = selectedItem?.id === item.id;
              const hasKyc = profilesMap[item.sellerId]
                ? (profilesMap[item.sellerId].kycStatus === 'APPROVED' || profilesMap[item.sellerId].isKycVerified === true)
                : (item.sellerId.includes('alpha') || item.sellerId.includes('beta') || item.sellerId.includes('host'));
              const hasPrem = profilesMap[item.sellerId]
                ? (profilesMap[item.sellerId].isPremiumVerified || profilesMap[item.sellerId].verifiedBadgeType === 'GOLDEN' || profilesMap[item.sellerId].verifiedBadgeType === 'PREMIUM')
                : (item.sellerId.includes('alpha') || item.sellerId.includes('host'));

              return (
                <div 
                  key={item.id}
                  onClick={() => {
                    setSelectedItemId(item.id);
                    const elem = document.getElementById('available-negotiation-section');
                    if (elem) {
                      elem.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className={cn(
                    "flex-shrink-0 w-72 p-4 bg-stone-955 border rounded-[2rem] transition-all cursor-pointer relative group active:scale-95",
                    isSelected 
                      ? "border-amber-500 shadow-xl shadow-amber-500/10 bg-stone-900" 
                      : "border-stone-800/80 hover:border-stone-700 hover:bg-stone-950/50"
                  )}
                >
                  <div className="relative aspect-video rounded-2xl overflow-hidden mb-3 bg-stone-900 border border-stone-800/60">
                    {item.images && item.images[0] ? (
                      <img 
                        src={item.images[0]} 
                        alt={item.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-zoom-in" 
                        referrerPolicy="no-referrer" 
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555664424-778a1e5e1b48?auto=format&fit=crop&q=80&w=800';
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomImage(item.images[0]);
                          setZoomImages(item.images);
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-stone-700 font-mono text-xs">NO IMAGES</div>
                    )}
                    <div className="absolute top-2 left-2 flex gap-1">
                      {hasKyc && (
                        <span className="px-2 py-0.5 bg-emerald-500/90 text-stone-955 text-xs font-black rounded-lg">KYC✓</span>
                      )}
                      {hasPrem && (
                        <span className="px-2 py-0.5 bg-amber-500/90 text-stone-955 text-xs font-black rounded-lg">PREM★</span>
                      )}
                    </div>
                  </div>

                  {/* Exact Date and Time of posting under image */}
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400/90 mb-2 bg-stone-900/80 px-2.5 py-1 rounded-lg border border-stone-800/80 w-fit">
                    <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="font-mono text-stone-300">{formatPostedDateTime(item.createdAt || item.startTime)}</span>
                  </div>

                  <h4 className="text-xs font-black uppercase text-white truncate">{item.title}</h4>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-bold text-stone-400 uppercase">BASE FLOOR</span>
                    <span className="text-xs font-black text-amber-500">{formatPrice(item.startingPrice, item.currencySymbol || item.currency)}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-stone-800/60 flex items-center justify-between">
                    {(() => {
                      const itemNegs = negotiations?.filter(n => n.auctionId === item.id) || [];
                      const acceptedNeg = itemNegs.find(n => n.status === 'accepted' || n.status === 'completed');
                      const itemNeg = acceptedNeg || itemNegs[0];
                      const hubStatus = getNegotiationHubStatus(item, itemNeg);
                      return hubStatus ? (
                        <span className={cn(
                          "text-[10px] font-black uppercase px-2 py-1 rounded-lg border",
                          hubStatus.color
                        )}>
                          {hubStatus.label}
                        </span>
                      ) : null;
                    })()}
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Tap to View</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderPriceDropsSection = () => {
    return (
      <div id="hot-price-drops-section" className="bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 md:p-8 space-y-6 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 left-0 w-80 h-80 bg-amber-500/5 rounded-full blur-[100px] -translate-y-1/2 -translate-x-1/4 pointer-events-none" />

        {/* Short Introduction & Category Header with Explore Button */}
        <div className="border-b border-stone-800/60 pb-4 space-y-2">
          <div className="flex items-center justify-between gap-2 sm:gap-3 w-full">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
              <span className="hidden xs:inline-block text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-2 sm:px-2.5 py-1 rounded-full shrink-0">
                REAL-TIME PRICE DROPS
              </span>
              <h3 className="text-sm sm:text-lg lg:text-xl font-black uppercase text-white tracking-tight truncate">
                Hot <span className="text-amber-500">Price Drops</span>
              </h3>
            </div>
            <button
              id="arena-explore-price-drops-btn"
              onClick={() => navigate('/price-drops')}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md shadow-amber-500/20 whitespace-nowrap shrink-0"
            >
              Explore
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-stone-400 text-xs leading-relaxed max-w-2xl font-medium uppercase tracking-tight">
            Keep track of live market reductions and high-visibility liquidation assets. Acquire premium gear and tactical assets at steep discounts before other operators claim the contract.
          </p>
        </div>

        {/* Swipeable container */}
        {loadingPriceDrops ? (
          <div className="flex flex-col items-center justify-center py-12 text-stone-400 gap-4">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
            <p className="text-xs font-black uppercase tracking-widest">Tracking Live Reductions...</p>
          </div>
        ) : filteredPriceDroppedListings.length === 0 ? (
          <div className="p-10 text-center bg-stone-955 rounded-3xl border border-dashed border-stone-800/80">
            <p className="text-stone-400 text-xs font-black uppercase tracking-widest">
              No live price drops recorded at this moment.
            </p>
          </div>
        ) : (
          <div className="relative group/scroll-list">
            {/* Left Scroll Button */}
            <button
              type="button"
              onClick={() => scrollContainer(priceDroppedScrollRef, 'left')}
              className="absolute -left-2 sm:-left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-950 border border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
              aria-label="Scroll Left"
            >
              <ChevronLeft className="w-5 h-5 font-black" />
            </button>

            {/* Scroll/Drag row. Displays exactly 1.6 items on mobile (w-[62.5%]) and fits larger viewports beautifully */}
            <div 
              ref={priceDroppedScrollRef} 
              {...priceDroppedDrag}
              className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-4 lg:pb-6 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
            >
              {filteredPriceDroppedListings.map(listing => (
                <div 
                  key={listing.id} 
                  className="w-[62.5%] sm:w-[50%] md:w-[280px] shrink-0" 
                  onDragStart={(e) => e.preventDefault()}
                >
                  <ListingCard listing={listing} isHomepage={true} dark={true} />
                </div>
              ))}
            </div>

            {/* Right Scroll Button */}
            <button
              type="button"
              onClick={() => scrollContainer(priceDroppedScrollRef, 'right')}
              className="absolute -right-2 sm:-right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 bg-stone-950 border border-stone-800 backdrop-blur shadow-2xl rounded-full flex items-center justify-center text-stone-300 hover:text-white hover:border-amber-500 hover:scale-110 transition-all active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
              aria-label="Scroll Right"
            >
              <ChevronRight className="w-5 h-5 font-black" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <ArenaLayout>
      <div className="space-y-12 pb-24 max-w-5xl mx-auto px-4 sm:px-6">
        {renderHeaderAndFeatures()}
        {renderAvailableSection()}
        {renderYourNegotiations()}
        {renderUpcomingNegotiations()}
        {renderSearchAndFilters()}
        {renderSwipeableRow()}
        {renderPriceDropsSection()}
      </div>

      {/* --- Overlay Modal: Set Price --- */}
      {showSetPriceModal && selectedItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] max-w-md w-full p-6 sm:p-8 space-y-6 relative overflow-hidden">
            <h3 className="text-xl font-black uppercase text-white">Configure Base Floor Price</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              {isOwner 
                ? "You own this asset listing. Adjusting this will instantly update the currency and floor price for all potential private negotiation buyers."
                : "You do not own this listing. Adjusting this will help pre-set and pre-fill your preferred strategic target purchase price."}
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400">Select Currency</label>
                <CurrencySelector 
                  value={tempCurrency || selectedItem.currency || 'USD'}
                  onChange={(curr) => {
                    setTempCurrency(curr.code);
                    setTempCurrencySymbol(curr.symbol);
                  }}
                  className="bg-stone-955 border border-stone-800 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400">
                  Base Price ({tempCurrency || selectedItem.currency || 'USD'})
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500 font-black text-sm">
                    {tempCurrencySymbol || selectedItem.currencySymbol || '$'}
                  </span>
                  <input 
                    type="number" 
                    step="any"
                    min="0.01"
                    value={tempPrice || ''} 
                    onChange={(e) => setTempPrice(Number(e.target.value))}
                    className="w-full bg-stone-955 border border-stone-800 rounded-2xl pl-16 pr-4 py-4 text-white text-sm font-black outline-none focus:border-amber-500"
                    placeholder="e.g. 8.56 or 1200000"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setShowSetPriceModal(false)}
                className="flex-1 py-3.5 bg-stone-955 border border-stone-800 text-stone-400 hover:text-white rounded-xl text-xs font-black uppercase transition-all"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={async () => {
                  if (tempPrice && tempPrice > 0) {
                    if (isOwner) {
                      await handleSetPrice(tempPrice, tempCurrency, tempCurrencySymbol);
                    } else {
                      setOfferAmount(tempPrice);
                    }
                    setShowSetPriceModal(false);
                  }
                }}
                className="flex-1 py-3.5 bg-amber-500 text-stone-955 rounded-xl text-xs font-black uppercase hover:bg-amber-400 transition-all"
              >
                Confirm Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Overlay Modal: Send Offer --- */}
      {showSendOfferModal && selectedItem && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] max-w-md w-full p-6 sm:p-8 space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black uppercase text-white">Propose Trade Terms</h3>
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full">
                {remainingOffersCount} Left ({userSubmittedOffersCount}/10 Used)
              </span>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              Submit your private acquisition offer amount in {selectedItem.currency || 'USD'}. This creates a dedicated escrow room. Maximum 10 offers per negotiation.
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400">
                  Proposed Offer Amount ({selectedItem.currencySymbol || selectedItem.currency || 'USD'})
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500 font-black text-sm">
                    {selectedItem.currencySymbol || selectedItem.currency || '$'}
                  </span>
                  <input 
                    type="number" 
                    step="any"
                    min="0.01"
                    value={offerAmount || ''} 
                    onChange={(e) => setOfferAmount(Number(e.target.value))}
                    className="w-full bg-stone-955 border border-stone-800 rounded-2xl pl-16 pr-4 py-4 text-white text-sm font-black outline-none focus:border-amber-500"
                    placeholder="e.g. 22.03 or 1200000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400">Bilateral Terms Message (Mandatory)</label>
                <textarea 
                  value={offerMessage} 
                  onChange={(e) => setOfferMessage(e.target.value)}
                  className="w-full bg-stone-955 border border-stone-800 rounded-2xl px-4 py-4 text-white text-xs font-medium outline-none focus:border-amber-500 h-24 resize-none"
                  placeholder="Provide mandatory strategic context, custom terms, or courier delivery details..."
                />
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setShowSendOfferModal(false)}
                className="flex-1 py-3.5 bg-stone-955 border border-stone-800 text-stone-400 hover:text-white rounded-xl text-xs font-black uppercase transition-all"
              >
                Cancel
              </button>
              <ThreeDButton 
                type="button"
                onClick={handleInitiateSubmitOffer}
                disabled={submittingOffer || !offerAmount || offerAmount <= 0 || !offerMessage || offerMessage.trim() === '' || userSubmittedOffersCount >= 10 || !isListingActive}
                label={submittingOffer ? "Initiating Floor..." : "Submit Offer"}
                variant={isListingActive ? "amber" : "dark"}
                size="md"
                fullWidth={false}
                className="flex-1 text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* --- Overlay Modal: Confirm Offer --- */}
      {showConfirmOfferModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] max-w-sm w-full p-8 space-y-6 text-center">
            <div className="space-y-3">
              <h3 className="text-xl font-black uppercase text-white">Are you sure?</h3>
              <p className="text-sm text-stone-400">
                You are about to submit an offer of <span className="text-amber-500 font-bold">{formatPrice(offerAmount || 0, selectedItem?.currencySymbol || selectedItem?.currency)}</span>. This will initiate a secure negotiation channel.
              </p>
              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-[11px] font-black uppercase tracking-wider mx-auto">
                <Coins className="w-3.5 h-3.5" />
                <span>Action Fee: 1 Credit</span>
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setShowConfirmOfferModal(false)}
                className="flex-1 py-3 bg-stone-955 border border-stone-800 text-stone-400 hover:text-white rounded-xl text-xs font-black uppercase transition-all"
                disabled={submittingOffer}
              >
                Cancel
              </button>
              <ThreeDButton 
                type="button"
                onClick={executeSubmitOffer}
                disabled={submittingOffer}
                label={submittingOffer ? "Sending..." : "Yes, Send Offer"}
                variant="amber"
                size="md"
                fullWidth={false}
                className="flex-1 text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* --- Overlay Modal: Success Offer --- */}
      {showSuccessOfferModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-stone-900 border border-emerald-500/20 rounded-[2.5rem] max-w-sm w-full p-8 space-y-6 text-center shadow-2xl shadow-emerald-500/10">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-black uppercase text-white">Offer Sent</h3>
            <p className="text-sm text-stone-400">
              Your offer has been sent successfully. The seller has been notified.
            </p>
            <button 
              onClick={() => setShowSuccessOfferModal(false)}
              className="w-full py-3.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase hover:bg-emerald-500 transition-all"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* --- Overlay Modal: Counter Offer --- */}
      {showCounterOfferModal && counterTargetNeg && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onClick={() => setShowCounterOfferModal(false)}>
          <div className="bg-stone-900 border border-amber-500/30 rounded-[2.5rem] max-w-md w-full p-6 sm:p-8 space-y-6 relative overflow-hidden text-left shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-800 pb-4">
              <div>
                <h3 className="text-lg font-black uppercase text-amber-400 italic tracking-wider flex items-center gap-2">
                  <ArrowRight className="w-5 h-5" /> Submit Counter Offer
                </h3>
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
                  {counterTargetNeg.itemTitle || selectedItem?.title || 'Asset Negotiation'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCounterOfferModal(false);
                  setCounterTargetNeg(null);
                }}
                className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {counterTargetNeg.lastOfferAmount && counterTargetNeg.lastOfferAmount > 0 && (
                <div className="flex items-center justify-between bg-stone-955 px-4 py-3 rounded-2xl border border-stone-800">
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Received Offer</span>
                  <span className="text-sm font-black text-amber-400 italic">
                    {formatPrice(counterTargetNeg.lastOfferAmount, counterTargetNeg.currencySymbol || counterTargetNeg.currency || selectedItem?.currencySymbol || selectedItem?.currency || 'USD')}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400">
                  Counter Offer Amount ({counterTargetNeg.currencySymbol || counterTargetNeg.currency || selectedItem?.currencySymbol || selectedItem?.currency || 'USD'})
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500 font-black text-sm">
                    {counterTargetNeg.currencySymbol || counterTargetNeg.currency || selectedItem?.currencySymbol || selectedItem?.currency || '$'}
                  </span>
                  <input 
                    type="number" 
                    step="any"
                    min="0.01"
                    value={counterAmount} 
                    onChange={(e) => setCounterAmount(e.target.value)}
                    className="w-full bg-stone-955 border border-stone-800 rounded-2xl pl-16 pr-4 py-4 text-white text-sm font-black outline-none focus:border-amber-500"
                    placeholder="Enter counter offer amount..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400">
                  Attached Message (Optional)
                </label>
                <textarea 
                  value={counterMessage} 
                  onChange={(e) => setCounterMessage(e.target.value)}
                  className="w-full bg-stone-955 border border-stone-800 rounded-2xl px-4 py-4 text-white text-xs font-medium outline-none focus:border-amber-500 h-24 resize-none"
                  placeholder="Add optional notes, counter rationale, or revised terms..."
                />
              </div>

              <div className="flex items-center justify-between px-3 py-2 bg-stone-955 border border-stone-800 rounded-xl">
                <span className="text-[10px] font-black uppercase text-stone-400">Action Fee</span>
                <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                  0 Credits (Free Counter)
                </span>
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button 
                type="button"
                onClick={() => {
                  setShowCounterOfferModal(false);
                  setCounterTargetNeg(null);
                }}
                className="flex-1 py-3.5 bg-stone-955 border border-stone-800 text-stone-400 hover:text-white rounded-xl text-xs font-black uppercase transition-all cursor-pointer"
                disabled={submittingCounter}
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleExecuteCounterOffer}
                disabled={submittingCounter || !counterAmount || parseFloat(counterAmount) <= 0}
                className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-400 text-stone-955 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-lg"
              >
                {submittingCounter ? (
                  <span>Sending...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Send Counter Offer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Overlay Modal: Counter Success --- */}
      {showCounterSuccessModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-stone-900 border border-emerald-500/20 rounded-[2.5rem] max-w-sm w-full p-8 space-y-6 text-center shadow-2xl shadow-emerald-500/10">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-black uppercase text-white">Counter Offer Sent</h3>
            <p className="text-sm text-stone-400">
              Your counter offer has been submitted successfully. The counterparty has been notified.
            </p>
            <button 
              onClick={() => setShowCounterSuccessModal(false)}
              className="w-full py-3.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase hover:bg-emerald-500 transition-all cursor-pointer"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* --- Overlay Modal: Zoom Image --- */}
      <Lightbox
        open={!!zoomImage}
        close={() => {
          setZoomImage(null);
          setZoomImages(undefined);
        }}
        index={Math.max(0, (zoomImages || []).indexOf(zoomImage || ''))}
        slides={(zoomImages && zoomImages.length > 0 ? zoomImages : [zoomImage || '']).map((src) => ({ src }))}
        plugins={[Zoom]}
        carousel={{ padding: 0 }}
      />

      {/* --- Overlay Modal: All Sent Offers --- */}
      {showAllSentOffersModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onClick={() => setShowAllSentOffersModal(false)}>
          <div className="bg-stone-900 border border-stone-800 rounded-[2.5rem] max-w-lg w-full p-8 space-y-6 relative overflow-hidden flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-xl font-black uppercase text-white">All Sent Offers</h3>
              <p className="text-xs text-stone-400 mt-1 uppercase tracking-widest font-bold">
                Comprehensive overview of your pending and active proposals
              </p>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
              {sentOffers.map((offer, idx) => {
                const relatedNeg = negotiations.find(n => n.id === offer.negotiationId || n.offers?.some(o => o.id === offer.id));
                return (
                  <div 
                    key={offer.id || idx}
                    onClick={() => {
                      if (relatedNeg) {
                        navigate(`/negotiations/timeline/${relatedNeg.id}`);
                        setShowAllSentOffersModal(false);
                      }
                    }}
                    className="p-4 bg-stone-955 border border-stone-800 hover:border-amber-500/50 rounded-2xl cursor-pointer transition-all active:scale-[0.99] flex items-center justify-between gap-4 group shadow-sm"
                  >
                    <div>
                      {offer.itemTitle && (
                        <p className="text-xs font-black text-white uppercase tracking-tight mb-1">{offer.itemTitle}</p>
                      )}
                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest block mb-0.5">TERMS PROPOSED</span>
                      <p className="text-sm font-black text-amber-400">{formatPrice(offer.amount, (offer as any).currencySymbol || (offer as any).currency || selectedItem?.currencySymbol || selectedItem?.currency)}</p>
                      {offer.message && (
                        <p className="text-xs text-stone-400 uppercase italic mt-1 font-medium">"{offer.message}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs font-black uppercase text-amber-500 group-hover:translate-x-1 transition-transform shrink-0">
                      <span>Open</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                );
              })}
            </div>
            
            <button 
              onClick={() => setShowAllSentOffersModal(false)}
              className="w-full py-4 bg-stone-955 border border-stone-800 text-stone-400 hover:text-white rounded-xl text-xs font-black uppercase transition-all"
            >
              Close Overview
            </button>
          </div>
        </div>
      )}

      {/* Authentication Required Modal for Unauthenticated Users */}
      <AuthRequiredModal
        isOpen={showAuthRequiredModal}
        onClose={() => setShowAuthRequiredModal(false)}
        title="Authentication Required"
        message="You are not logged in. Please login to get access."
      />

    </ArenaLayout>
  );
};

export default ArenaNegotiations;
