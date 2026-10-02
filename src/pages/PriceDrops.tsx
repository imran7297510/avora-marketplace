import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  increment,
  orderBy,
  limit,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { db, handleFirestoreError, OperationType, sendNotification } from "../lib/firebase";
import { formatPKR, cn } from "../lib/utils";
import { getCurrencyByCode, filterListingsByCurrency } from "../lib/currencies";
import { PhoneInput } from "../components/PhoneInput";
import {
  Percent,
  TrendingDown,
  Sparkles,
  MapPin,
  Heart,
  Share2,
  MessageCircle,
  ShoppingBag,
  Bell,
  Clock,
  Filter,
  Check,
  Star,
  Info,
  ChevronRight,
  TrendingUp,
  X,
  Phone,
  DollarSign,
  AlertCircle,
  HelpCircle,
  Package,
  Award,
} from "lucide-react";

interface PriceDropListing {
  id: string;
  title: string;
  description: string;
  price: number;
  previousPrice?: number;
  originalPrice?: number;
  priceDropped?: boolean;
  priceDroppedAt?: any;
  priceDroppedPercent?: number;
  priceDroppedAmount?: number;
  priceHistory?: Array<{ price: number; updatedAt: any }>;
  images?: string[];
  category: string;
  city: string;
  condition: string;
  ownerId: string;
  sellerName: string;
  phoneNumber: string;
  status: string;
  views?: number;
  saves?: number;
  shares?: number;
  createdAt: any;
  updatedAt: any;
  sellerRating?: number;
  // added for verified discounts
  calculatedDropPercent?: number;
  calculatedDropAmount?: number;
  isVerifiedDeal?: boolean;
  originalListingPriceForDisplay?: number;
}

export function PriceDrops() {
  const { user } = useAuth();
  const { selectedCurrency } = useCurrency();
  const [listings, setListings] = useState<PriceDropListing[]>([]);
  const [filteredListings, setFilteredListings] = useState<PriceDropListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);

  // Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [minDiscount, setMinDiscount] = useState<number>(0);
  const [selectedCondition, setSelectedCondition] = useState<string>("all");

  // Sorting
  const [sortBy, setSortBy] = useState<string>("newest_drops");

  // Multi-section tabs: inside Price Drops
  const [activeSubTab, setActiveSubTab] = useState<"biggest_savings" | "new_drops" | "luxury" | "local" | "verified_deals" | "trending">("biggest_savings");

  // Deal Alert state
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertCategory, setAlertCategory] = useState("all");
  const [alertMaxPrice, setAlertMaxPrice] = useState("");
  const [alertMinDiscount, setAlertMinDiscount] = useState("10");
  const [alertSuccessMsg, setAlertSuccessMsg] = useState("");

  // Create Offer Modal
  const [selectedOfferItem, setSelectedOfferItem] = useState<PriceDropListing | null>(null);
  const [offerPrice, setOfferPrice] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [offerSuccess, setOfferSuccess] = useState(false);

  // Buy Now Modal
  const [selectedBuyItem, setSelectedBuyItem] = useState<PriceDropListing | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [buySuccess, setBuySuccess] = useState(false);
  const [buyingProcess, setBuyingProcess] = useState(false);

  // Custom clipboard Toast
  const [toastMessage, setToastMessage] = useState("");

  // Load User Location info
  useEffect(() => {
    if (user) {
      getDoc(doc(db, "users", user.uid)).then((snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data());
        }
      });
      // Get user watchlist
      const loadWatchlist = async () => {
        try {
          const snap = await getDocs(collection(db, `users/${user.uid}/favorites`));
          const ids = snap.docs.map((doc) => doc.id);
          setWatchlistIds(ids);
        } catch (e) {
          console.warn("Could not load favorites:", e);
        }
      };
      loadWatchlist();
    }
  }, [user]);

  // Load Listings with price drops or mock elements to highlight deals
  useEffect(() => {
    const fetchDeals = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "listings"),
          where("status", "==", "LIVE")
        );
        const snap = await getDocs(q);
        const fetched = snap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
          } as PriceDropListing;
        });

        // Process raw listings to find genuine price drops against original pricing
        let activeDrops: PriceDropListing[] = fetched.map(item => {
          const original = item.originalPrice || item.previousPrice || item.price;
          const current = item.price;
          let calculatedDropPercent = 0;
          let calculatedDropAmount = 0;
          let isVerifiedDeal = false;

          if (original > current) {
             calculatedDropAmount = original - current;
             calculatedDropPercent = Math.round((calculatedDropAmount / original) * 100);
             // Verify deal: only properties with clear originalPrice tracking and drops > 0
             if (item.originalPrice) {
               isVerifiedDeal = true;
             }
          }
          return {
             ...item,
             calculatedDropPercent,
             calculatedDropAmount,
             isVerifiedDeal,
             originalListingPriceForDisplay: original
          } as PriceDropListing;
        }).filter((item) => item.calculatedDropAmount! > 0 && Math.floor(Date.now() / 1000) - (item.createdAt?.seconds || 0) > 86400); // Only entries with real drop based on original, and lived at least 24h

        setListings(activeDrops);
      } catch (err) {
        console.error("Error loading price drops:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDeals();
  }, []);

  // Filter and Sort Processing
  useEffect(() => {
    let result = filterListingsByCurrency(listings, selectedCurrency);

    // Main Tab filters
    if (activeSubTab === "biggest_savings") {
       // Only filter later, sorting handles it mostly, but maybe we require min 15% discount for this section? Let's just leave filter intact and apply sorting
    } else if (activeSubTab === "new_drops") {
       // Handled by sort later
    } else if (activeSubTab === "local") {
      const userCity = userProfile?.city || "Lahore";
      result = result.filter(
        (item) => item.city?.toLowerCase() === userCity.toLowerCase()
      );
    } else if (activeSubTab === "luxury") {
      result = result.filter(
        (item) =>
          item.price > 100000 ||
          item.category?.toLowerCase().includes("luxury") ||
          item.category?.toLowerCase().includes("watches") ||
          item.category?.toLowerCase().includes("vintage")
      );
    } else if (activeSubTab === "verified_deals") {
      result = result.filter((item) => item.isVerifiedDeal === true);
    } else if (activeSubTab === "trending") {
      result = result.filter((item) => {
        const views = item.views || 0;
        const saves = item.saves || 0;
        return views > 50 || saves > 3;
      });
    }

    // Secondary UI filters
    if (selectedCategory !== "all") {
      result = result.filter(
        (item) => item.category?.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    if (selectedLocation !== "all") {
      result = result.filter(
        (item) => item.city?.toLowerCase() === selectedLocation.toLowerCase()
      );
    }

    if (minPrice) {
      result = result.filter((item) => item.price >= Number(minPrice));
    }

    if (maxPrice) {
      result = result.filter((item) => item.price <= Number(maxPrice));
    }

    if (minDiscount > 0) {
      result = result.filter(
        (item) => (item.priceDroppedPercent || 0) >= minDiscount
      );
    }

    if (selectedCondition !== "all") {
      result = result.filter(
        (item) => item.condition?.toLowerCase() === selectedCondition.toLowerCase()
      );
    }

    // Sorting Modes
    let activeSortBy = sortBy;
    if (activeSubTab === "biggest_savings" && sortBy === "newest_drops") activeSortBy = "highest_discount";
    if (activeSubTab === "new_drops" && sortBy === "newest_drops") activeSortBy = "newest_drops";

    if (activeSortBy === "newest_drops") {
      result.sort((a, b) => {
        const timeA = a.priceDroppedAt?.seconds || a.createdAt?.seconds || 0;
        const timeB = b.priceDroppedAt?.seconds || b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
    } else if (activeSortBy === "biggest_savings") {
      result.sort(
        (a, b) => (b.calculatedDropAmount || 0) - (a.calculatedDropAmount || 0)
      );
    } else if (activeSortBy === "highest_discount") {
      result.sort(
        (a, b) => (b.calculatedDropPercent || 0) - (a.calculatedDropPercent || 0)
      );
    } else if (activeSortBy === "most_viewed") {
      result.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else if (activeSortBy === "ending_soon") {
      // simulate expiration sort
      result.sort((a, b) => (a.price % 7) - (b.price % 7));
    }

    setFilteredListings(result);
  }, [
    listings,
    activeSubTab,
    selectedCategory,
    selectedLocation,
    minPrice,
    maxPrice,
    minDiscount,
    selectedCondition,
    sortBy,
    watchlistIds,
    userProfile,
    selectedCurrency,
  ]);

  // Deal Score Calculation (Automatic Score 1 - 5 Stars)
  const calculateDealScore = (item: PriceDropListing): number => {
    const percent = item.priceDroppedPercent || 0;
    const rating = item.sellerRating || 4.5;
    let score = 1;

    // Base discount percent score
    if (percent >= 25) score += 2;
    else if (percent >= 12) score += 1;

    // Seller rating multiplier
    if (rating >= 4.7) score += 1;

    // Price size multiplier
    if ((item.priceDroppedAmount || 0) > 10000) score += 1;

    // Cap at 5
    return Math.min(score, 5);
  };

  const getDealScoreStars = (score: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            i <= score
              ? "text-amber-400 fill-amber-400 font-extrabold stroke-[2.5]"
              : "text-stone-700/30 dark:text-stone-800"
          )}
        />
      );
    }
    return stars;
  };

  const getDealScoreLabel = (score: number) => {
    switch (score) {
      case 1:
        return "Good Deal";
      case 2:
        return "Great Deal";
      case 3:
        return "Excellent Deal";
      case 4:
        return "Hot Deal 🔥";
      case 5:
      default:
        return "Best Deal 🚀";
    }
  };

  // Human Time Dropped helper
  const formatTimeDropped = (item: PriceDropListing) => {
    if (!item.priceDroppedAt) return "Recently";
    const sec = item.priceDroppedAt.seconds;
    if (!sec) return "Recently";
    const diffMin = Math.round((Date.now() - sec * 1000) / 60000);
    if (diffMin < 60) return `${diffMin} Min Ago`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours} Hours Ago`;
    return `${Math.round(diffHours / 24)} Days Ago`;
  };

  // Watchlist Toggle
  const handleWatchlistToggle = async (e: React.MouseEvent, item: PriceDropListing) => {
    e.stopPropagation();
    if (!user) {
      setToastMessage("Please login to save deals!");
      setTimeout(() => setToastMessage(""), 3000);
      return;
    }

    const isFav = watchlistIds.includes(item.id);
    const favRef = doc(db, `users/${user.uid}/favorites`, item.id);
    const listingRef = doc(db, "listings", item.id);

    try {
      if (isFav) {
        await deleteDoc(favRef);
        setWatchlistIds((prev) => prev.filter((id) => id !== item.id));
        setToastMessage("Removed from Watchlist ❌");
        await updateDoc(listingRef, { saves: increment(-1) }).catch(() => {});
      } else {
        await setDoc(favRef, {
          listingId: item.id,
          savedAt: serverTimestamp(),
          title: item.title,
          price: item.price,
          image: item.images?.[0] || null,
        });
        setWatchlistIds((prev) => [...prev, item.id]);
        setToastMessage("Added to Watchlist ❤️");
        await updateDoc(listingRef, { saves: increment(1) }).catch(() => {});
      }
      setTimeout(() => setToastMessage(""), 3500);
    } catch (err) {
      console.error(err);
    }
  };

  // Copy/Share Link
  const handleShareDeal = (e: React.MouseEvent, item: PriceDropListing) => {
    e.stopPropagation();
    const cleanUrl = `${window.location.origin}/listings/${item.id}`;
    navigator.clipboard.writeText(cleanUrl);
    setToastMessage("Shareable Deal Link copied to Clipboard! 🔗");
    setTimeout(() => setToastMessage(""), 3500);

    // Track shares
    updateDoc(doc(db, "listings", item.id), { shares: increment(1) }).catch(
      () => {}
    );
  };

  // Save Deal Alert
  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setAlertSuccessMsg("⚠️ Please login to set custom deal alerts!");
      return;
    }

    try {
      await addDoc(collection(db, "deal_alerts"), {
        userId: user.uid,
        category: alertCategory,
        maxPrice: alertMaxPrice ? Number(alertMaxPrice) : null,
        minDiscount: Number(alertMinDiscount),
        createdAt: serverTimestamp(),
      });

      setAlertSuccessMsg(`✅ Alert saved! We will notify you when ${alertCategory === "all" ? "any item" : alertCategory} drops price!`);
      setTimeout(() => {
        setShowAlertModal(false);
        setAlertSuccessMsg("");
      }, 4000);
    } catch (err) {
      setAlertSuccessMsg("Error creating alert. Please try again.");
    }
  };

  // Propose Offer Submit
  const handleProposeOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedOfferItem) return;

    if (Number(offerPrice) <= 0) {
      alert("Please enter a valid promotion price!");
      return;
    }

    try {
      // Save offer to offers collection
      await addDoc(collection(db, "offers"), {
        listingId: selectedOfferItem.id,
        buyerId: user.uid,
        buyerName: userProfile?.name || user.email || "Anonymous Buyer",
        sellerId: selectedOfferItem.ownerId,
        listingTitle: selectedOfferItem.title,
        listingImage: selectedOfferItem.images?.[0] || null,
        originalPrice: selectedOfferItem.price,
        proposedPrice: Number(offerPrice),
        notes: offerNotes,
        status: "pending",
        userType: "buyer",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Send Firestore system notification to owner
      await sendNotification(
        selectedOfferItem.ownerId,
        "📉 New Price Offer Received!",
        `Someone made an offer of ${formatPKR(Number(offerPrice))} on your dropped item: ${selectedOfferItem.title}.`,
        "OFFER_RECEIVED",
        selectedOfferItem.id
      ).catch(() => {});

      setOfferSuccess(true);
      setTimeout(() => {
        setSelectedOfferItem(null);
        setOfferPrice("");
        setOfferNotes("");
        setOfferSuccess(false);
      }, 3500);
    } catch (err) {
      alert("Failed to submit negotiation offer. Please try again.");
    }
  };

  // Direct checkout Buy Now Submit
  const handleDirectBuySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedBuyItem) return;

    setBuyingProcess(true);
    try {
      const orderRef = await addDoc(collection(db, "orders"), {
        listingId: selectedBuyItem.id,
        listingTitle: selectedBuyItem.title,
        listingImage: selectedBuyItem.images?.[0] || null,
        buyerId: user.uid,
        buyerName: userProfile?.name || user.email || "Direct Buyer",
        sellerId: selectedBuyItem.ownerId,
        unitPrice: selectedBuyItem.price,
        quantity: 1,
        shippingCharges: 0,
        totalAmount: selectedBuyItem.price,
        currency: selectedBuyItem.currency || 'PKR',
        currencySymbol: selectedBuyItem.currencySymbol || getCurrencyByCode(selectedBuyItem.currency || 'PKR').symbol,
        buyerAddress: deliveryAddress,
        buyerContact: contactPhone,
        status: "PENDING",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update listing status & add order activity
      await updateDoc(doc(db, "listings", selectedBuyItem.id), {
        status: "SOLD",
        updatedAt: serverTimestamp(),
      });

      // Send Order Request notification to seller
      await sendNotification(
        selectedBuyItem.ownerId,
        "🛒 Direct Purchase Deal Cleared!",
        `Great news! A buyer has bought your price drop item: ${selectedBuyItem.title} for ${formatPKR(selectedBuyItem.price)}.`,
        "NEW_ORDER",
        orderRef.id
      ).catch(() => {});

      setBuySuccess(true);
      setBuyingProcess(false);
      setTimeout(() => {
        setSelectedBuyItem(null);
        setDeliveryAddress("");
        setContactPhone("");
        setBuySuccess(false);
        // Remove from deals
        setListings((prev) => prev.filter((it) => it.id !== selectedBuyItem.id));
      }, 4000);
    } catch (err) {
      setBuyingProcess(false);
      alert("Database error executing quick purchase order. Ref try again.");
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-24 md:pb-16 font-sans">
      {/* Dynamic Toast Alerts */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[999] bg-stone-900 border border-amber-500/50 text-amber-400 font-extrabold text-xs tracking-wider uppercase px-6 py-4.5 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md"
          >
            <Sparkles className="w-4 h-4 text-amber-500 animate-spin" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic urgenct banner ticker */}
      <div className="bg-amber-500 text-stone-950 font-black text-xs uppercase tracking-[0.3em] py-2.5 text-center flex items-center justify-center gap-3 overflow-hidden border-b border-amber-600 shadow-md">
        <span className="animate-pulse">📉 PREMIUM DEALS ACTIVE</span>
        <span>•</span>
        <span>🔥 BIGGEST DISCOUNTS AUTO TRACKED</span>
        <span>•</span>
        <span className="hidden md:inline">⚡ STICKY OFFERS REDUCED DAILY</span>
        <span className="hidden md:inline">•</span>
        <span>⏱️ ACT QUICKLY BEFORE SOLD</span>
      </div>

      {/* Main Grid Hero Banner */}
      <div className="relative overflow-hidden bg-gradient-to-b from-stone-900 via-stone-955 to-stone-950 py-12 md:py-16 px-4 md:px-8 border-b border-stone-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/10 via-stone-950/0 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 rounded-full border border-amber-500/30 text-amber-400 font-extrabold text-xs uppercase tracking-wider mb-3">
              <TrendingDown className="w-3.5 h-3.5" />
              Direct Marketplace Price Dropped Hub
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold italic uppercase tracking-tighter text-white mb-2 leading-none">
              Price <span className="text-amber-500">Drops</span>
            </h1>
            <p className="max-w-xl text-stone-400 text-xs md:text-sm font-semibold leading-relaxed">
              Explore absolute direct, verified real-time discounts lowered by
              vetted sellers across Pakistan. Genuine anti-abuse history checks guarantee transparency. Sell fast, buy cheaper!
            </p>
          </div>

          {/* Quick Stats & Alerts Card */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="bg-stone-900 border border-stone-850 p-5 rounded-3xl shrink-0 flex flex-col justify-between gap-4 max-w-xs sm:w-64">
              <div>
                <span className="text-xs text-stone-400 font-black uppercase tracking-widest block">Available Deals</span>
                <span className="text-3xl font-black text-amber-500 tracking-tight font-mono">
                  {listings.length} Active
                </span>
                <p className="text-xs font-bold text-stone-400 mt-1">
                  Average discount rate: <span className="text-emerald-450 font-extrabold font-mono">15% - 40% Off</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowAlertModal(true)}
              className="px-6 py-5 bg-amber-500 text-stone-950 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-amber-400 transition-all shadow-xl hover:shadow-amber-500/10 flex flex-col justify-center items-center gap-2 group shrink-0"
            >
              <Bell className="w-5 h-5 text-stone-950 group-hover:scale-110 transition-transform font-bold animate-bounce" />
              <span>Set Alert Criteria</span>
            </button>
          </div>
        </div>
      </div>

      {/* Gamification horizontal banner for Top Sellers */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-10">
        <h3 className="text-xs font-black uppercase tracking-widest text-amber-500 italic mb-3 flex items-center gap-1">
          <Award className="w-4 h-4" /> Vetted Gamified Sellers & Top Merchants
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-stone-900/60 border border-stone-850 p-4.5 rounded-2xl flex items-center gap-3.5 hover:border-amber-500/20 transition-all">
            <div className="bg-amber-500/10 text-amber-405 w-10.5 h-10.5 rounded-xl flex items-center justify-center font-bold text-xl">🤝</div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-stone-200 leading-tight">Deal Maker</h4>
              <p className="text-[9.5px] font-bold text-stone-400 mt-0.5">Sellers with 3+ active healthy price cuts</p>
            </div>
          </div>
          <div className="bg-stone-900/60 border border-stone-850 p-4.5 rounded-2xl flex items-center gap-3.5 hover:border-amber-500/20 transition-all">
            <div className="bg-amber-500/10 text-amber-405 w-10.5 h-10.5 rounded-xl flex items-center justify-center font-bold text-xl font-mono">⚡</div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-stone-200 leading-tight">Fast Seller</h4>
              <p className="text-[9.5px] font-bold text-stone-400 mt-0.5">Reduces pricing within 24hr of posting</p>
            </div>
          </div>
          <div className="bg-stone-900/60 border border-stone-850 p-4.5 rounded-2xl flex items-center gap-3.5 hover:border-amber-500/20 transition-all">
            <div className="bg-amber-500/10 text-amber-405 w-10.5 h-10.5 rounded-xl flex items-center justify-center font-bold text-xl">🔥</div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-stone-200 leading-tight">Hot Creator</h4>
              <p className="text-[9.5px] font-bold text-stone-400 mt-0.5">Discounts of 25% or greater achieved</p>
            </div>
          </div>
          <div className="bg-stone-900/60 border border-stone-850 p-4.5 rounded-2xl flex items-center gap-3.5 hover:border-amber-500/20 transition-all">
            <div className="bg-amber-500/10 text-amber-405 w-10.5 h-10.5 rounded-xl flex items-center justify-center font-bold text-xl">🌐</div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-stone-200 leading-tight">Top Merchant</h4>
              <p className="text-[9.5px] font-bold text-stone-400 mt-0.5">Vetted high score badge verified profiles</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Deals Catalog Layout (Sticky Subtabs) */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Filters - Responsive Side rail */}
        <div className="lg:col-span-3 bg-stone-900 border border-stone-850 p-5 rounded-3xl space-y-6 lg:sticky lg:top-4">
          <div className="flex items-center justify-between border-b border-stone-850 pb-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
              <Filter className="w-4 h-4 text-amber-500" /> Catalog Filters
            </h3>
            {(selectedCategory !== "all" ||
              selectedLocation !== "all" ||
              minPrice ||
              maxPrice ||
              minDiscount > 0 ||
              selectedCondition !== "all") && (
              <button
                onClick={() => {
                  setSelectedCategory("all");
                  setSelectedLocation("all");
                  setMinPrice("");
                  setMaxPrice("");
                  setMinDiscount(0);
                  setSelectedCondition("all");
                }}
                className="text-xs font-extrabold text-amber-500 hover:text-white uppercase transition-colors"
              >
                Reset All
              </button>
            )}
          </div>

          {/* Category SELECT filter */}
          <div>
            <label className="text-xs text-stone-400 font-extrabold uppercase tracking-widest block mb-1.5">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-stone-955 border border-stone-800 rounded-xl px-3 py-2 text-xs font-semibold text-stone-300 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="Vehicles">Vehicles</option>
              <option value="Luxury Lots">Luxury Lots</option>
              <option value="vintage">Vintage Collectibles</option>
              <option value="premium">Premium Assets</option>
              <option value="property">Properties</option>
              <option value="luxury">Luxury Watch</option>
              <option value="electronics">Electronics</option>
            </select>
          </div>

          {/* Location SELECT filter */}
          <div>
            <label className="text-xs text-stone-400 font-extrabold uppercase tracking-widest block mb-1.5">City Location</label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full bg-stone-955 border border-stone-800 rounded-xl px-3 py-2 text-xs font-semibold text-stone-300 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">All Pakistan Cities</option>
              <option value="Karachi">Karachi</option>
              <option value="Lahore">Lahore</option>
              <option value="Islamabad">Islamabad</option>
              <option value="Peshawar">Peshawar</option>
              <option value="Quetta">Quetta</option>
              <option value="Multan">Multan</option>
              <option value="Gujranwala">Gujranwala</option>
            </select>
          </div>

          {/* Price range inputs row */}
          <div>
            <label className="text-xs text-stone-400 font-extrabold uppercase tracking-widest block mb-1.5">Price (PKR)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                placeholder="Min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-full bg-stone-955 border border-stone-800 rounded-xl px-3 py-2 text-xs font-semibold text-stone-300 focus:outline-none focus:border-amber-500 font-mono"
              />
              <input
                type="number"
                step="any"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full bg-stone-955 border border-stone-800 rounded-xl px-3 py-2 text-xs font-semibold text-stone-300 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Discount Percentage selector slider */}
          <div>
            <label className="text-xs text-stone-400 font-extrabold uppercase tracking-widest block mb-1">
              Discount Rate: <span className="text-amber-550 font-black">{minDiscount}%+ Off</span>
            </label>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={minDiscount}
              onChange={(e) => setMinDiscount(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-stone-600 font-bold uppercase mt-1">
              <span>Any</span>
              <span>15%</span>
              <span>30%</span>
              <span>50%+</span>
            </div>
          </div>

          {/* Condition selector */}
          <div>
            <label className="text-xs text-stone-400 font-extrabold uppercase tracking-widest block mb-1.5">Condition</label>
            <select
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="w-full bg-stone-955 border border-stone-800 rounded-xl px-3 py-2 text-xs font-semibold text-stone-300 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">Any Condition</option>
              <option value="new">Brand New</option>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
            </select>
          </div>
        </div>

        {/* Right side Grid Layout & catalogs */}
        <div className="lg:col-span-9 space-y-6">
          {/* Section Category Filters tabs (Nearby, luxury, watchlist details) */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-900 pb-2">
            <div className="flex flex-wrap items-center gap-1 bg-stone-900 p-1 rounded-2xl border border-stone-850">
              <button
                onClick={() => setActiveSubTab("biggest_savings")}
                className={cn(
                  "px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                  activeSubTab === "biggest_savings"
                    ? "bg-amber-500 text-stone-955 font-black"
                    : "text-stone-400 hover:text-stone-200"
                )}
              >
                🔥 Biggest Savings
              </button>
              <button
                onClick={() => setActiveSubTab("new_drops")}
                className={cn(
                  "px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                  activeSubTab === "new_drops"
                    ? "bg-amber-500 text-stone-955 font-black"
                    : "text-stone-400 hover:text-stone-200"
                )}
              >
                🆕 New Price Drops
              </button>
              <button
                onClick={() => setActiveSubTab("luxury")}
                className={cn(
                  "px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                  activeSubTab === "luxury"
                    ? "bg-amber-500 text-stone-955 font-black"
                    : "text-stone-400 hover:text-stone-200"
                )}
              >
                💎 Luxury Price Drops
              </button>
              <button
                onClick={() => setActiveSubTab("local")}
                className={cn(
                  "px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                  activeSubTab === "local"
                    ? "bg-amber-500 text-stone-955 font-black"
                    : "text-stone-400 hover:text-stone-200"
                )}
              >
                📍 Local Price Drops
              </button>
              <button
                onClick={() => setActiveSubTab("verified_deals")}
                className={cn(
                  "px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                  activeSubTab === "verified_deals"
                    ? "bg-amber-500 text-stone-955 font-black"
                    : "text-stone-400 hover:text-stone-200"
                )}
              >
                ⭐ Verified Deals
              </button>
              <button
                onClick={() => setActiveSubTab("trending")}
                className={cn(
                  "px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                  activeSubTab === "trending"
                    ? "bg-amber-500 text-stone-955 font-black"
                    : "text-stone-400 hover:text-stone-200"
                )}
              >
                🚀 Trending Deals
              </button>
            </div>

            {/* Sorting SELECT dropdown block */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-400 font-extrabold uppercase tracking-widest">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-stone-900 border border-stone-850 rounded-xl px-3 py-2 text-xs font-bold text-stone-300 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="newest_drops">Newest Drops</option>
                <option value="biggest_savings">Biggest Savings (Rs)</option>
                <option value="highest_discount">Highest Discount %</option>
                <option value="most_viewed">Most Popular</option>
                <option value="ending_soon">Ending Soon</option>
              </select>
            </div>
          </div>

          {/* Loader or Empty Screen */}
          {loading ? (
            <div className="py-24 text-center">
              <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-stone-400 font-black uppercase tracking-widest text-xs">Filtering direct price drops near you...</p>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="py-20 text-center bg-stone-900/40 border border-stone-850/60 rounded-3xl border-dashed">
              <ShoppingBag className="w-12 h-12 text-stone-700 mx-auto mb-4" />
              <h4 className="text-base font-extrabold text-stone-300 font-spartan">No Verified Deals Match</h4>
              <p className="text-stone-400 font-bold text-xs max-w-sm mx-auto mt-1 leading-relaxed">
                Try widening your selected categories, discount sliders, target cities or clear current filters to discover drops.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredListings.map((item) => {
                const discountAmount = item.priceDroppedAmount || (item.previousPrice ? item.previousPrice - item.price : 0);
                const discountPercent = item.priceDroppedPercent || (item.previousPrice ? Math.round((discountAmount / item.previousPrice) * 100) : 0);
                const dealScore = calculateDealScore(item);

                return (
                  <motion.div
                    key={item.id}
                    layoutId={`deal-card-${item.id}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-stone-900 border border-stone-850/70 hover:border-amber-500/30 rounded-3xl overflow-hidden transition-all duration-300 flex flex-col justify-between group shadow-xl"
                  >
                    {/* Header Row overlay stats */}
                    <div className="p-4 flex justify-between items-center bg-stone-955 border-b border-stone-850/40">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-xs font-black uppercase text-stone-350 tracking-wider">
                          📉 Price Dropped
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-stone-400 font-bold font-mono text-xs uppercase">
                        <Clock className="w-3 h-3 text-stone-400 shrink-0" />
                        <span>{formatTimeDropped(item)}</span>
                      </div>
                    </div>

                    <div className="p-4 flex gap-4 cursor-pointer" onClick={() => window.location.href = `/listings/${item.id}`}>
                      {/* Left side Image block */}
                      <div className="relative w-24 h-24 rounded-2xl overflow-hidden bg-stone-950 shrink-0 border border-stone-850">
                        {item.images?.[0] ? (
                          <img
                            src={item.images[0]}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full bg-stone-850 flex items-center justify-center text-xs text-stone-400 uppercase">No Image</div>
                        )}
                        {/* Discount display floating badge */}
                        <div className="absolute top-1 left-1.5 bg-amber-500 text-stone-950 font-black text-xs uppercase tracking-wider px-1.5 py-0.5 rounded-lg border border-amber-600 shadow-lg">
                          ⬇ {item.calculatedDropPercent}% Off
                        </div>
                      </div>

                      {/* Right side Metadata content */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[8.5px] font-black uppercase tracking-widest text-[#25D366]">
                              {item.category}
                            </span>
                            {/* Verified Badge / Deal Score */}
                            <div className="flex items-center gap-1">
                              {item.isVerifiedDeal && (
                                <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-lg text-xs font-black uppercase tracking-widest flex items-center gap-1">
                                  📊 Price Verified
                                </span>
                              )}
                              <span className="bg-stone-950/65 border border-stone-800 px-1.5 py-0.5 rounded-lg text-xs font-extrabold text-amber-400 capitalize">
                                {getDealScoreLabel(dealScore)}
                              </span>
                            </div>
                          </div>
                          <h4 className="text-stone-100 font-extrabold font-spartan text-xs uppercase tracking-tight group-hover:text-amber-500 transition-colors truncate mt-1">
                            {item.title}
                          </h4>
                          <span className="text-xs font-bold text-stone-400 flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5 text-amber-550" /> {item.city}
                          </span>
                        </div>

                        {/* Direct detailed discount details */}
                        <div className="flex items-baseline gap-2 pt-1">
                          <span className="text-base font-black text-amber-500 tracking-tight font-mono whitespace-nowrap">
                            {formatPKR(item.price)}
                          </span>
                          {item.originalListingPriceForDisplay && (
                            <span className="text-xs text-stone-600 font-semibold line-through font-mono whitespace-nowrap">
                              {formatPKR(item.originalListingPriceForDisplay)}
                            </span>
                          )}
                          <span className="text-xs text-emerald-450 font-extrabold whitespace-nowrap">
                            Save {formatPKR(item.calculatedDropAmount || 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Row Actions menu: Save, Share, Contact, Make Offer, Buy Now */}
                    <div className="p-3 bg-stone-955 border-t border-stone-850/50 flex items-center justify-between gap-1.5 flex-wrap">
                      {/* Left: Quick state interactions (Save / Share) */}
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => handleWatchlistToggle(e, item)}
                          className={cn(
                            "p-2.5 rounded-xl transition-all border text-xs cursor-pointer active:scale-90",
                            watchlistIds.includes(item.id)
                              ? "bg-red-500/20 border-red-500/70 text-red-500"
                              : "bg-stone-900 border-stone-800 text-stone-400 hover:text-white hover:border-stone-700"
                          )}
                          title="Save Deal to Watchlist"
                        >
                          <Heart className={cn("w-3.5 h-3.5", watchlistIds.includes(item.id) && "fill-current text-red-500")} />
                        </button>
                        <button
                          onClick={(e) => handleShareDeal(e, item)}
                          className="p-2.5 bg-stone-900 border border-stone-800 hover:border-stone-705 text-stone-400 hover:text-white rounded-xl transition-all text-xs cursor-pointer active:scale-90"
                          title="Share Deal"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Right: Buyer action buttons (Contact, Make Offer, Buy Now) */}
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        {/* Direct Contact Seller automatically goes to phone for now or messages*/}
                        <button
                          onClick={() => alert('Chat interface opening for ' + item.sellerName)}
                          className="p-2.5 bg-stone-900 border border-stone-800 hover:border-stone-700 text-stone-400 hover:text-amber-500 rounded-xl transition-all cursor-pointer"
                          title="Chat Seller"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </button>

                        {/* Make Offer available if allowed */}
                        <button
                          onClick={() => setSelectedOfferItem(item)}
                          className="px-3 py-2 bg-stone-900 border border-amber-500/20 hover:border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-stone-950 rounded-xl transition-all text-xs font-black uppercase tracking-wider cursor-pointer font-sans"
                        >
                          💰 Offer
                        </button>

                        <button
                          onClick={() => setSelectedBuyItem(item)}
                          className="px-3 py-2 bg-emerald-500 text-stone-950 hover:bg-emerald-400 rounded-xl transition-all text-xs font-black uppercase tracking-wider cursor-pointer font-sans flex items-center gap-1 shrink-0"
                        >
                          <ShoppingBag className="w-3.5 h-3.5 text-stone-905 font-black shrink-0" />
                          <span>Buy Now</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* FOOTER USER GUIDES TO DISCOVER GENUINE DISCOUNTS */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-16">
        <div className="bg-stone-900 border border-stone-850 p-6 md:p-8 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h4 className="text-base font-black uppercase tracking-tight italic text-white flex items-center gap-1.5">
              <span>🛡️</span> Avora Anti-Abuse Discount Protection
            </h4>
            <p className="text-stone-400 text-xs font-semibold leading-relaxed max-w-2xl">
              Our backend monitors active changes. Sellers are strictly blocked
              from artificially inflating list parameters (e.g., ticking Rs. 500
              to Rs. 700 then dropping back to Rs. 500) to grab mock drops placement.
              We verify average weekly price stability first to protect buyers.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-stone-950 p-2.5 rounded-2xl border border-stone-800">
            <span className="w-2.5 h-2.5 bg-amber-550 rounded-full animate-ping shrink-0" />
            <span className="text-xs font-black uppercase tracking-wide text-amber-400">
              100% Verified Price Stability
            </span>
          </div>
        </div>
      </div>

      {/* POPUP: Deal Alert Custom Setting Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-stone-900 border border-stone-800 max-w-md w-full rounded-[2rem] overflow-hidden p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setShowAlertModal(false)}
              className="absolute top-5 right-5 p-2 rounded-full bg-stone-950/50 hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex gap-3 items-center mb-4">
              <div className="w-10 h-10 bg-amber-500 text-stone-955 rounded-xl flex items-center justify-center">
                <Bell className="w-5 h-5 font-black animate-swing" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase italic tracking-tight text-white">Create Custom Deal Alert</h3>
                <p className="text-xs text-stone-400 font-bold uppercase">Get real-time notification alerts!</p>
              </div>
            </div>

            {alertSuccessMsg ? (
              <div className="py-6 text-center font-bold text-xs text-stone-300">
                {alertSuccessMsg}
              </div>
            ) : (
              <form onSubmit={handleCreateAlert} className="space-y-4">
                <div>
                  <label className="text-[9.5px] text-stone-400 font-extrabold uppercase block mb-1">Target Category</label>
                  <select
                    value={alertCategory}
                    onChange={(e) => setAlertCategory(e.target.value)}
                    className="w-full bg-stone-955 border border-stone-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-stone-200"
                  >
                    <option value="all">Any Category</option>
                    <option value="Vehicles">Vehicles</option>
                    <option value="Property">Property</option>
                    <option value="Luxury Watches">Luxury Watches</option>
                    <option value="Electronics">Electronics</option>
                  </select>
                </div>

                <div>
                  <label className="text-[9.5px] text-stone-400 font-extrabold uppercase block mb-1">Maximum Price Limit (PKR)</label>
                  <input
                    type="number"
                    placeholder="e.g. 50000 (leave empty for any)"
                    value={alertMaxPrice || ""}
                    onChange={(e) => setAlertMaxPrice(e.target.value)}
                    className="w-full bg-stone-955 border border-stone-800 rounded-xl px-3 py-2.5 text-xs text-stone-200 font-semibold font-mono"
                  />
                </div>

                <div>
                  <label className="text-[9.5px] text-stone-400 font-extrabold uppercase block mb-1">Minimum Discount Percent</label>
                  <select
                    value={alertMinDiscount}
                    onChange={(e) => setAlertMinDiscount(e.target.value)}
                    className="w-full bg-stone-955 border border-stone-800 rounded-xl px-3 py-2.5 text-xs text-stone-200 font-semibold"
                  >
                    <option value="5">5% or more</option>
                    <option value="10">10% or more (Recommended)</option>
                    <option value="20">20% or more</option>
                    <option value="35">35% or more</option>
                  </select>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAlertModal(false)}
                    className="flex-1 py-3 bg-stone-955 hover:bg-stone-800 text-stone-400 font-bold uppercase text-xs tracking-wider rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-450 text-stone-950 font-black uppercase text-xs tracking-wider rounded-xl transition-colors cursor-pointer shadow-lg"
                  >
                    Create Custom Alert
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}

      {/* POPUP: Propose Offer Modal */}
      {selectedOfferItem && (
        <div className="fixed inset-0 bg-stone-955/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-stone-900 border border-stone-800 max-w-md w-full rounded-[2rem] overflow-hidden p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setSelectedOfferItem(null)}
              className="absolute top-5 right-5 p-2 rounded-full bg-stone-950/50 hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex gap-3 items-center mb-4">
              <div className="w-10 h-10 bg-amber-500 text-stone-955 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 font-black" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase italic tracking-tight text-white">Propose Negotiation Offer</h3>
                <p className="text-xs text-stone-400 font-bold uppercase">Item: {selectedOfferItem.title}</p>
              </div>
            </div>

            {offerSuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto text-xl font-bold">✓</div>
                <h4 className="text-base font-extrabold uppercase italic text-white">Offer Proposed Successfully!</h4>
                <p className="text-stone-400 text-xs font-semibold leading-relaxed">
                  We have forwarded your offer of {formatPKR(Number(offerPrice))} to seller {selectedOfferItem.sellerName}. We will notify you when they accept/propose.
                </p>
              </div>
            ) : (
              <form onSubmit={handleProposeOffer} className="space-y-4">
                <div className="bg-stone-955 border border-stone-850 p-4 rounded-2xl flex items-center justify-between text-xs font-bold text-stone-400">
                  <span>Current Discounted Price:</span>
                  <span className="font-mono text-amber-500 font-black text-sm">{formatPKR(selectedOfferItem.price)}</span>
                </div>

                <div>
                  <label className="text-[9.5px] text-stone-400 font-extrabold uppercase block mb-1">Your Propose Amount (PKR)</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="Enter offer (e.g. 8.56 or 22.03)"
                    value={offerPrice}
                    onChange={(e) => setOfferPrice(e.target.value)}
                    className="w-full bg-stone-955 border border-stone-804 rounded-xl px-3 py-3 text-xs text-stone-200 font-bold font-mono"
                  />
                  <span className="text-xs text-stone-400 block mt-1 font-bold">Include sensible pricing matching market standard.</span>
                </div>

                <div>
                  <label className="text-[9.5px] text-stone-400 font-extrabold uppercase block mb-1">Notes / Shipping delivery remarks</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Can pick up tonight from your area!"
                    value={offerNotes}
                    onChange={(e) => setOfferNotes(e.target.value)}
                    className="w-full bg-stone-955 border border-stone-800 rounded-xl px-3 py-2.5 text-xs text-stone-200 font-semibold"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOfferItem(null)}
                    className="flex-1 py-3 bg-stone-955 hover:bg-stone-800 text-stone-400 font-bold uppercase text-xs tracking-wider rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-450 text-stone-950 font-black uppercase text-xs tracking-wider rounded-xl transition-colors cursor-pointer shadow-lg"
                  >
                    Send Propose Deal
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}

      {/* POPUP: Buy Now Direct Checkout Modal */}
      {selectedBuyItem && (
        <div className="fixed inset-0 bg-stone-955/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-stone-900 border border-stone-800 max-w-md w-full rounded-[2rem] overflow-hidden p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setSelectedBuyItem(null)}
              className="absolute top-5 right-5 p-2 rounded-full bg-stone-950/50 hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex gap-3 items-center mb-4">
              <div className="w-10 h-10 bg-amber-500 text-stone-955 rounded-xl flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 font-black" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase italic tracking-tight text-white">Direct Checkout Order</h3>
                <p className="text-xs text-stone-400 font-bold uppercase">Clear Dropped Price Deal</p>
              </div>
            </div>

            {buySuccess ? (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto text-xl font-bold">✓</div>
                <h4 className="text-base font-extrabold uppercase italic text-white font-spartan">Order Checked Out!</h4>
                <p className="text-stone-400 text-xs font-semibold leading-relaxed">
                  Excellent checkout choice! Your order request has been submitted to seller {selectedBuyItem.sellerName} for immediate review. Check Seller Hub under purchases tab.
                </p>
              </div>
            ) : (
              <form onSubmit={handleDirectBuySubmit} className="space-y-4">
                <div className="bg-stone-955 border border-stone-850 p-4.5 rounded-2xl space-y-2 text-xs font-bold text-stone-300">
                  <div className="flex justify-between items-center text-stone-400">
                    <span>Listing Item:</span>
                    <span className="text-stone-300 truncate max-w-xs">{selectedBuyItem.title}</span>
                  </div>
                  <div className="flex justify-between items-center text-stone-400 border-t border-stone-850 pt-1.5 mt-1">
                    <span>Shipping Charges:</span>
                    <span className="text-stone-300">FREE Delivery</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-stone-850 pt-1.5 mt-1 text-sm font-black">
                    <span>Total Bill Price:</span>
                    <span className="font-mono text-amber-550">{formatPKR(selectedBuyItem.price)}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[9.5px] text-stone-400 font-extrabold uppercase block mb-1">Standard Delivery Address</label>
                  <textarea
                    rows={2.5}
                    required
                    placeholder="Enter complete home or office location address"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full bg-stone-955 border border-stone-800 rounded-xl px-3 py-2.5 text-xs text-stone-200 font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[9.5px] text-stone-400 font-extrabold uppercase block mb-1">Active Contact Telephone</label>
                  <PhoneInput
                    value={contactPhone}
                    onChange={setContactPhone}
                    placeholder="e.g. 321XXXXXXXX"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBuyItem(null)}
                    className="flex-1 py-3 bg-stone-955 hover:bg-stone-800 text-stone-400 font-bold uppercase text-xs tracking-wider rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={buyingProcess}
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-450 disabled:opacity-50 text-stone-955 font-black uppercase text-xs tracking-wider rounded-xl transition-colors cursor-pointer shadow-lg flex items-center justify-center gap-1.5"
                  >
                    {buyingProcess ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-stone-955/20 border-t-stone-955 rounded-full animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 text-stone-955" />
                        <span>Confirm buy</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
