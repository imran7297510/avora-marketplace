import React, { useState, useEffect, useRef } from "react";
import {
  Link,
  Outlet,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AuthModal } from "./AuthModal";
import {
  LogIn,
  Menu,
  X,
  MessageCircle,
  User,
  Bell,
  LogOut,
  LayoutDashboard as LayoutDashboardIcon,
  PlusCircle,
  BookOpen,
  ArrowRight,
  Zap,
  Search,
  MapPin,
  Heart,
  ChevronDown,
  Home as HomeIcon,
  Compass,
  PlusSquare,
  Package,
  AlertCircle,
  ShieldCheck,
  HelpCircle,
  Grid,
  ShieldAlert,
  Flame,
  Gavel,
  TrendingDown,
  ExternalLink,
  AlertTriangle,
  Speaker,
} from "lucide-react";
import {
  doc,
  getDocs,
  collection,
  query,
  where,
  setDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  limit,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { CATEGORIES, LOCATIONS } from "../constants";
import { CATEGORIES_WITH_SUBCATEGORIES } from "../lib/categories";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MyNotification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  type?: string;
  relatedId?: string;
  auctionId?: string;
  listingId?: string;
  link?: string;
  url?: string;
  itemTitle?: string;
  createdAt: any;
}

import { Footer } from "./Footer";

import { SearchAutocomplete } from "./SearchAutocomplete";
import { GlobalCurrencySelector } from "./CurrencySelector";
import {
  SearchSuggestion,
  saveRecentSearch,
  updateListingIndex,
} from "../services/searchService";

export function Layout() {
  const {
    user,
    userProfile,
    isAdmin,
    loading: authLoading,
    loginWithGoogle,
    logout,
  } = useAuth();
  const [searchParams] = useSearchParams();
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [firestoreOffline, setFirestoreOffline] = useState(false);
  const [showTroubleshootTips, setShowTroubleshootTips] = useState(false);

  useEffect(() => {
    const checkFlags = () => {
      if (typeof window !== "undefined") {
        if ((window as any).__firestore_quota_exceeded) {
          setQuotaExceeded(true);
        }
        if ((window as any).__firestore_offline) {
          setFirestoreOffline(true);
        }
      }
    };
    checkFlags();
    const interval = setInterval(checkFlags, 2500);
    return () => clearInterval(interval);
  }, []);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [notifications, setNotifications] = useState<MyNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [showCategoriesMenu, setShowCategoriesMenu] = useState(false);

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const showAutocomplete = false;
  const setShowAutocomplete = (_val: boolean) => {};
  const [selectedLocation, setSelectedLocation] = useState(
    searchParams.get("location") || "All Pakistan",
  );
  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get("category") || "",
  );
  const [selectedSubcategory, setSelectedSubcategory] = useState(
    searchParams.get("subcategory") || "",
  );
  const [selectedCondition, setSelectedCondition] = useState(
    searchParams.get("condition") || "",
  );
  const [sortBy, setSortBy] = useState(searchParams.get("sort") || "newest");

  const navigate = useNavigate();
  const location = useLocation();
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const locationMenuRef = useRef<HTMLDivElement>(null);
  const categoriesMenuRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const subcategories = selectedCategory
    ? CATEGORIES_WITH_SUBCATEGORIES[selectedCategory] || []
    : [];

  // Search functionality without massive pre-fetching
  useEffect(() => {
    // Intentionally left blank to save Firebase reads.
    // The search autocomplete will rely on static trends, synonyms, and categories.
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(10),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setNotifications(
          snapshot.docs.map(
            (d) => ({ ...d.data(), id: d.id }) as MyNotification,
          ),
        );
      },
      (error: any) => {
        if (error?.code === "resource-exhausted") {
          console.warn("Notifications listener: Quota exceeded");
        } else {
          console.error("Notifications listener error:", error);
        }
      },
    );
    return () => unsubscribe();
  }, [user]);

  const [activePinnedBroadcast, setActivePinnedBroadcast] = useState<any | null>(null);

  useEffect(() => {
    try {
      const q = query(
        collection(db, "broadcasts"),
        where("pinned", "==", true),
        limit(1)
      );
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!snapshot.empty) {
            const data = { ...snapshot.docs[0].data(), id: snapshot.docs[0].id } as any;
            const dismissed = localStorage.getItem(`dismissed_broadcast_${data.id}`);
            if (!dismissed) {
              setActivePinnedBroadcast(data);
            } else {
              setActivePinnedBroadcast(null);
            }
          } else {
            setActivePinnedBroadcast(null);
          }
        },
        (error: any) => {
          console.warn("Pinned broadcast listener:", error);
        }
      );
      return () => unsubscribe();
    } catch (e) {
      console.warn("Broadcasts subscription fallback:", e);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      )
        setShowProfileMenu(false);
      if (
        locationMenuRef.current &&
        !locationMenuRef.current.contains(event.target as Node)
      )
        setShowLocationMenu(false);
      if (
        categoriesMenuRef.current &&
        !categoriesMenuRef.current.contains(event.target as Node)
      )
        setShowCategoriesMenu(false);
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(event.target as Node)
      )
        setShowAutocomplete(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = async () => {
    if (!user) return;
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;

    // Immediately mark as read in local state
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    for (const n of unread) {
      try {
        await updateDoc(doc(db, "notifications", n.id), { read: true });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleHomeClick = () => {
    setMobileMenuOpen(false);
    if (location.pathname === "/") {
      const el = document.getElementById("quick-actions-bar");
      if (el) {
        // Offset for the sticky header
        const y = el.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: y, behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };

  const handleLogin = () => {
    setShowAuthModal(true);
  };

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setShowAutocomplete(false);
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery.trim());
    }
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (selectedLocation !== "All Pakistan")
      params.set("location", selectedLocation);
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedSubcategory) params.set("subcategory", selectedSubcategory);
    if (selectedCondition) params.set("condition", selectedCondition);
    if (sortBy) params.set("sort", sortBy);
    navigate(`/listings?${params.toString()}`);
  };

  const handleSuggestionSelect = (suggestion: SearchSuggestion) => {
    setSearchQuery(suggestion.text);
    setShowAutocomplete(false);
    saveRecentSearch(suggestion.text);

    const params = new URLSearchParams(searchParams);
    params.set("q", suggestion.text);

    if (suggestion.type === "category") {
      params.set("category", suggestion.text);
    } else if (suggestion.type === "subcategory") {
      if (suggestion.category) params.set("category", suggestion.category);
      params.set("subcategory", suggestion.text);
    }

    navigate(`/listings?${params.toString()}`);
  };

  useEffect(() => {
    // Reset subcategory if category changes manually in state
    setSelectedSubcategory("");
  }, [selectedCategory]);

  useEffect(() => {
    // Sync state with URL params
    setSearchQuery(searchParams.get("q") || "");
    setSelectedLocation(searchParams.get("location") || "All Pakistan");
    setSelectedCategory(searchParams.get("category") || "");
    setSelectedSubcategory(searchParams.get("subcategory") || "");
    setSelectedCondition(searchParams.get("condition") || "");
    setSortBy(searchParams.get("sort") || "newest");
  }, [searchParams]);

  const isListingsPage = location.pathname === "/listings";
  const hasSearchParams =
    !!searchParams.get("category") ||
    !!searchParams.get("subcategory") ||
    !!searchParams.get("q");
  const isSearchMode =
    isListingsPage || (location.pathname === "/" && hasSearchParams);

  return (
    <div className="min-h-screen flex flex-col bg-white font-sans text-stone-900">
      {quotaExceeded && (
        <div className="bg-amber-500 text-stone-900 text-xs md:text-sm font-black px-4 py-3.5 flex items-center justify-between shadow-xl border-b border-amber-600 relative z-[220] uppercase tracking-wider animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2 max-w-[90%] mx-auto">
            <AlertCircle className="w-4 h-4 text-stone-900 shrink-0" />
            <span className="leading-normal select-none">
              ⚡ Avora Fallback Mode Active Checklist: Firestore read limit
              reached of today. Smooth premium offline datasets connected
              successfully!
            </span>
          </div>
          <button
            onClick={() => setQuotaExceeded(false)}
            className="p-1.5 hover:bg-stone-900/10 rounded-lg shrink-0 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4 text-stone-900" />
          </button>
        </div>
      )}
      {firestoreOffline && !quotaExceeded && (
        <div className="bg-amber-500 text-stone-900 text-xs md:text-sm font-black px-4 py-3 flex items-center justify-between shadow-md border-b border-amber-600 relative z-[220] uppercase tracking-wider animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2 max-w-[90%] mx-auto">
            <ShieldAlert className="w-4 h-4 text-stone-900 shrink-0" />
            <span className="leading-normal select-none">
              🔒 Operating in Offline Secured Cache Mode. All browsing and listing actions remain active and will synchronize automatically when signal is restored!
            </span>
          </div>
          <button
            onClick={() => setFirestoreOffline(false)}
            className="p-1.5 hover:bg-stone-900/10 rounded-lg shrink-0 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4 text-stone-900" />
          </button>
        </div>
      )}

      {/* Pinned Marketplace Broadcast Announcement Banner */}
      {activePinnedBroadcast && location.pathname !== "/admin" && (
        <div className="bg-stone-900 text-white border-b border-amber-500/40 px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs z-[110] relative">
          <div className="max-w-[1440px] mx-auto flex items-center gap-2.5 truncate w-full">
            <span className="p-1 bg-amber-500 text-stone-950 rounded-md shrink-0">
              <Speaker className="w-3.5 h-3.5" />
            </span>
            <span className="font-black text-amber-400 uppercase tracking-wider shrink-0">
              {activePinnedBroadcast.title || "Announcement"}:
            </span>
            <span className="text-stone-200 truncate font-medium">
              {activePinnedBroadcast.message}
            </span>
            {activePinnedBroadcast.link && (
              <a
                href={activePinnedBroadcast.link}
                className="ml-2 underline font-bold text-amber-300 hover:text-amber-200 shrink-0 inline-flex items-center gap-1"
              >
                <span>Learn more</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <button
            onClick={() => {
              if (activePinnedBroadcast?.id) {
                localStorage.setItem(`dismissed_broadcast_${activePinnedBroadcast.id}`, "true");
              }
              setActivePinnedBroadcast(null);
            }}
            className="p-1 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-white transition-colors shrink-0"
            title="Dismiss Banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner / Notification Bar */}
      {/* Premium Sticky Header */}
      {location.pathname !== "/admin" && (
        <header className="sticky top-0 z-[100] bg-stone-100/95 backdrop-blur-xl border-b border-stone-300/80 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] transition-all duration-300">
          <div className="max-w-[1440px] mx-auto px-2 sm:px-6 lg:px-10">
            <div className="flex items-center justify-between h-16 lg:h-20 gap-2 sm:gap-4 w-full">
              {/* Navigation Actions Group - Horizontally Swipeable on Mobile */}
              <div className="flex-1 flex items-center justify-end overflow-x-auto scrollbar-none no-scrollbar py-1.5 touch-pan-x min-w-0">
                <div
                  className={cn(
                    "flex items-center shrink-0 flex-nowrap",
                    user && !user.isAnonymous
                      ? "gap-2 sm:gap-3 lg:gap-3.5 pl-1.5 sm:pl-3"
                      : "gap-1 sm:gap-2.5"
                  )}
                >
                  {/* 4. Global Currency Selector */}
                  <GlobalCurrencySelector className="shrink-0" />

                  {/* Premium Seller Link (Highlighted) */}
                  <Link
                    to="/verified"
                    className={cn(
                      "p-1.5 sm:px-4 sm:py-2.5 rounded-full transition-all duration-300 flex items-center gap-1.5 shrink-0 group active:scale-95",
                      location.pathname === "/verified"
                        ? "bg-amber-500 text-stone-900 shadow-lg shadow-amber-500/20"
                        : "bg-white text-stone-600 hover:bg-amber-50 hover:text-amber-600 border border-stone-100 hover:border-amber-100 shadow-sm",
                    )}
                    title="Verified Premium Sellers"
                    aria-label="Verified Premium Sellers"
                  >
                    <ShieldCheck
                      className={cn(
                        "w-4 h-4 sm:w-5 sm:h-5 shrink-0",
                        location.pathname === "/verified"
                          ? "text-stone-900"
                          : "text-amber-500",
                      )}
                    />
                    <span className="hidden md:inline text-xs font-black uppercase tracking-widest font-sans whitespace-nowrap">
                      Premium
                    </span>
                  </Link>

                  {/* 3. Activity Bell Icon */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNotifications(!showNotifications);
                        if (!showNotifications) markAllAsRead();
                      }}
                      className={cn(
                        "p-1.5 sm:p-2.5 rounded-full transition-all duration-300 flex items-center justify-center relative group shrink-0 active:scale-95 bg-white text-stone-600 hover:text-stone-900 border border-stone-100 shadow-sm",
                        showNotifications && "bg-amber-500 text-stone-900 border-amber-500 shadow-amber-500/20"
                      )}
                      title="Notifications"
                      aria-label="Notifications"
                    >
                      <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                      {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white ring-2 ring-amber-500/20 animate-pulse" />
                      )}
                    </button>

                    {showNotifications && (
                      <div className="fixed sm:absolute right-2 sm:right-0 top-16 sm:top-full mt-2 w-[calc(100vw-1rem)] sm:w-80 max-w-sm bg-white/95 backdrop-blur-xl rounded-3xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.25)] border border-stone-100 z-[210] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="p-5 bg-stone-50/50 border-b border-stone-100 flex justify-between items-center">
                          <h3 className="font-black text-xs uppercase tracking-widest text-stone-400">
                            Activity Center
                          </h3>
                          <button
                            onClick={() => setShowNotifications(false)}
                            className="p-1 hover:bg-stone-200 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4 text-stone-400" />
                          </button>
                        </div>
                        <div className="max-h-96 overflow-y-auto divide-y divide-stone-100">
                          {notifications.length === 0 ? (
                            <div className="p-16 text-center text-stone-300 text-xs uppercase font-black italic tracking-widest">
                              Nothing Here Yet
                            </div>
                          ) : (
                            notifications.map((n) => {
                              const isClickable = Boolean(
                                n.link || n.url || n.auctionId || (n.type === "ADMIN_WARNING" && n.relatedId) || (n.type === "message" && n.relatedId) || n.listingId
                              );
                              const isWarning = n.type === "ADMIN_WARNING" || n.type === "admin_warning" || n.type === "auction_warning" || n.title?.toLowerCase().includes("warning");
                              const isBroadcast = n.type === "BROADCAST" || n.type === "broadcast" || Boolean(n.broadcastId);

                              return (
                                <div
                                  key={n.id}
                                  onClick={async () => {
                                    if (!n.read) {
                                      try {
                                        await updateDoc(doc(db, "notifications", n.id), { read: true });
                                      } catch (err) {
                                        console.warn("Error marking notification as read:", err);
                                      }
                                    }
                                    if (n.link || n.url) {
                                      navigate(n.link || n.url!);
                                      setShowNotifications(false);
                                    } else if (n.auctionId) {
                                      navigate(`/battle-bids/arena/${n.auctionId}`);
                                      setShowNotifications(false);
                                    } else if (isWarning && n.relatedId) {
                                      navigate(`/battle-bids/arena/${n.relatedId}`);
                                      setShowNotifications(false);
                                    } else if (n.type === "message" && n.relatedId) {
                                      navigate("/messages", { state: { activeChatId: n.relatedId } });
                                      setShowNotifications(false);
                                    } else if (n.listingId) {
                                      navigate(`/listing/${n.listingId}`);
                                      setShowNotifications(false);
                                    }
                                  }}
                                  className={cn(
                                    "p-4 transition-all hover:bg-stone-50 text-left relative",
                                    isClickable && "cursor-pointer",
                                    !n.read ? "bg-amber-50/40 border-l-4 border-l-amber-500" : "bg-white"
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {isBroadcast && (
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 flex items-center gap-0.5 shrink-0">
                                          <Speaker className="w-2.5 h-2.5 text-amber-600" />
                                          Broadcast
                                        </span>
                                      )}
                                      {isWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                                      <p className={cn(
                                        "text-xs leading-snug font-bold",
                                        isWarning ? "text-amber-900" : "text-stone-900"
                                      )}>
                                        {n.title}
                                      </p>
                                    </div>
                                    {!n.read && (
                                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-0.5" />
                                    )}
                                  </div>
                                  <p className="text-xs text-stone-600 leading-relaxed font-normal">
                                    {n.message}
                                  </p>
                                  {isClickable && (
                                    <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800">
                                      <span>
                                        {n.type === "message" ? "Open Chat" : isBroadcast ? "Open Announcement" : "View Post"}
                                      </span>
                                      <ExternalLink className="w-3 h-3" />
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Account / Sign-In Buttons */}
                  <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    {!user || user.isAnonymous ? (
                      <>
                        <button
                          onClick={handleLogin}
                          aria-label="Sign In"
                          title="Sign In"
                          className="px-2 sm:px-4 py-1.5 sm:py-2.5 text-[11px] sm:text-xs font-black text-stone-600 uppercase tracking-wider sm:tracking-widest hover:text-stone-900 transition-colors whitespace-nowrap shrink-0"
                        >
                          Sign In
                        </button>
                        <button
                          onClick={handleLogin}
                          aria-label="Join now"
                          title="Join now"
                          className="hidden sm:inline-flex px-4 sm:px-6 py-2 sm:py-2.5 text-xs font-black text-white bg-stone-900 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-stone-900/10 uppercase tracking-widest whitespace-nowrap shrink-0"
                        >
                          Join now
                        </button>
                      </>
                    ) : (
                      <div className="relative shrink-0" ref={profileMenuRef}>
                        <button
                          onClick={() => setShowProfileMenu(!showProfileMenu)}
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-stone-100 overflow-hidden hover:border-amber-400 transition-all shrink-0 flex items-center justify-center bg-stone-100"
                          title="Account Menu"
                          aria-label="Account Menu"
                        >
                          {(userProfile?.photoURL || user.photoURL) ? (
                            <img
                              src={userProfile?.photoURL || user.photoURL}
                              alt="Account"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full bg-stone-100 flex items-center justify-center text-stone-400">
                              <User className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                          )}
                        </button>

                        {showProfileMenu && (
                          <div className="fixed sm:absolute right-2 sm:right-0 top-16 sm:top-full mt-2 w-[calc(100vw-1rem)] sm:w-64 max-w-xs bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.25)] border border-stone-100 z-[210] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500 py-3">
                            <div className="px-6 py-4 border-b border-stone-50 flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center text-amber-500 font-black italic shadow-inner">
                                {user.displayName?.charAt(0) ||
                                  user.email?.charAt(0).toUpperCase() ||
                                  "U"}
                              </div>
                              <div className="min-w-0">
                                <p className="font-black text-stone-900 truncate text-sm">
                                  {user.displayName || "User"}
                                </p>
                                <p className="text-xs text-stone-400 font-bold uppercase truncate">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                            <div className="p-2 space-y-1">
                              <Link
                                to="/profile"
                                onClick={() => setShowProfileMenu(false)}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all uppercase tracking-widest"
                              >
                                <User className="w-4 h-4 text-amber-500" />{" "}
                                Account Settings
                              </Link>
                              <Link
                                to="/sellr-dashboard"
                                onClick={() => setShowProfileMenu(false)}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all uppercase tracking-widest"
                              >
                                <LayoutDashboardIcon className="w-4 h-4 text-amber-500" />{" "}
                                Seller Dashboard
                              </Link>
                              <Link
                                to="/sellr-dashboard?tab=all"
                                onClick={() => setShowProfileMenu(false)}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all uppercase tracking-widest"
                              >
                                <Grid className="w-4 h-4 text-amber-500" /> Manage
                                Ads
                              </Link>
                              {isAdmin && (
                                <Link
                                  to="/admin"
                                  onClick={() => setShowProfileMenu(false)}
                                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black text-amber-600 bg-amber-50/30 hover:bg-stone-900 hover:text-white transition-all uppercase tracking-widest italic group"
                                >
                                  <ShieldAlert className="w-4 h-4 group-hover:animate-pulse" />{" "}
                                  Platform Admin
                                </Link>
                              )}
                            </div>
                            <div className="p-2 border-t border-stone-50 mt-2">
                              <button
                                onClick={() => {
                                  logout();
                                  setShowProfileMenu(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black text-red-500 hover:bg-red-50 transition-all uppercase tracking-widest"
                              >
                                <LogOut className="w-4 h-4" /> Sign Out
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 1. Menu Icon (3 Lines) - Extreme Right */}
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(true)}
                    className="p-2 sm:p-2.5 rounded-full text-stone-700 bg-white border border-stone-200 hover:bg-stone-900 hover:text-white hover:border-stone-900 shadow-sm transition-all duration-300 flex items-center justify-center shrink-0 active:scale-95"
                    title="Open Navigation Menu"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Menu Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[200]">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setMobileMenuOpen(false)}
          ></div>
          <div className="absolute top-0 right-0 bottom-0 w-80 bg-white shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto elastic-scroll">
            <div className="p-8 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <Link to="/" onClick={handleHomeClick}>
                <img src="/logo.png" className="h-10 w-auto" />
              </Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-3 bg-white border border-stone-200 rounded-2xl shadow-sm"
              >
                <X className="w-6 h-6 text-stone-400" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-2">
              {user && !user.isAnonymous && (
                <div className="bg-stone-900 rounded-3xl p-6 mb-4 text-white relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:rotate-12 transition-transform duration-700">
                    <User className="w-24 h-24" />
                  </div>
                  <div className="flex items-center gap-4 mb-4 relative z-10">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/20 bg-stone-800 flex items-center justify-center">
                      {(userProfile?.photoURL || user.photoURL) ? (
                        <img
                          src={userProfile?.photoURL || user.photoURL}
                          alt="Profile"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <User className="w-full h-full p-3 text-stone-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-black text-lg leading-none mb-1">
                        {user.displayName || "Seller"}
                      </p>
                      <p className="text-xs uppercase font-black tracking-widest text-stone-400 opacity-80">
                        CONNECTED ACTIVE
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 relative z-10">
                    <Link
                      to="/profile"
                      onClick={() => setMobileMenuOpen(false)}
                      className="bg-white/10 hover:bg-white/20 text-center py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
                    >
                      View Profile
                    </Link>
                    <Link
                      to="/submit"
                      state={{ forceReset: true }}
                      onClick={() => setMobileMenuOpen(false)}
                      className="bg-amber-500 hover:bg-amber-600 text-stone-900 text-center py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
                    >
                      Post your ad
                    </Link>
                  </div>
                </div>
              )}

              {isAdmin ? (
                // ADMIN NAVIGATION MENU
                <>
                  <Link
                    to="/"
                    onClick={handleHomeClick}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      🏠
                    </div>
                    Home
                  </Link>
                  <Link
                    to="/listings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      🛒
                    </div>
                    Marketplace
                  </Link>
                  <Link
                    to="/sellr-dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      💼
                    </div>
                    Seller Hub
                  </Link>
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-amber-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center text-lg">
                      🛠
                    </div>
                    Admin Panel
                  </Link>

                  <div className="border-t border-stone-100 my-6"></div>

                  <Link
                    to="/support"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      🆘
                    </div>
                    Support Center
                  </Link>

                  <div className="mt-8 px-2">
                    {user && !user.isAnonymous ? (
                      <button
                        onClick={() => {
                          logout();
                          setMobileMenuOpen(false);
                        }}
                        className="w-full bg-red-50 text-red-600 font-black py-5 rounded-3xl text-sm uppercase tracking-widest hover:bg-red-100 transition-colors flex items-center justify-center gap-3 animate-in fade-in duration-300"
                      >
                        <span className="text-lg">🚪</span> Logout
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          handleLogin();
                          setMobileMenuOpen(false);
                        }}
                        className="w-full bg-stone-900 text-white font-black py-5 rounded-3xl text-sm uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-stone-900/20"
                      >
                        Login / Create Account
                      </button>
                    )}
                  </div>
                </>
              ) : (
                // NORMAL USER NAVIGATION MENU
                <>
                  <Link
                    to="/"
                    onClick={handleHomeClick}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      🏠
                    </div>
                    Home
                  </Link>
                  <Link
                    to="/listings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      🛒
                    </div>
                    Marketplace
                  </Link>
                  <Link
                    to="/sellr-dashboard?tab=favorites"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      ❤️
                    </div>
                    Saved Items
                  </Link>
                  <Link
                    to="/messages"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      💬
                    </div>
                    Messages
                  </Link>
                  <Link
                    to="/sellr-dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      💼
                    </div>
                    Seller Hub
                  </Link>
                  <Link
                    to="/featured"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      ⭐
                    </div>
                    Featured Ads
                  </Link>

                  <Link
                    to="/price-drops"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg animate-pulse">
                      📉
                    </div>
                    Hot Price Drops
                  </Link>

                  <div className="border-t border-stone-100 my-6"></div>

                  <Link
                    to="/profile?tab=kyc"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      🛡️
                    </div>
                    Verification Status
                  </Link>
                  <Link
                    to="/support"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-5 p-5 text-sm font-black text-stone-600 hover:bg-stone-50 rounded-3xl transition-all group"
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center group-hover:bg-amber-50 transition-colors text-lg">
                      🆘
                    </div>
                    Support Center
                  </Link>

                  <div className="mt-8 px-2">
                    {user && !user.isAnonymous ? (
                      <button
                        onClick={() => {
                          logout();
                          setMobileMenuOpen(false);
                        }}
                        className="w-full bg-red-50 text-red-600 font-black py-5 rounded-3xl text-sm uppercase tracking-widest hover:bg-red-100 transition-colors flex items-center justify-center gap-3 animate-in fade-in duration-300"
                      >
                        <span className="text-lg">🚪</span> Logout
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          handleLogin();
                          setMobileMenuOpen(false);
                        }}
                        className="w-full bg-stone-900 text-white font-black py-5 rounded-3xl text-sm uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-stone-900/20"
                      >
                        Login / Create Account
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content Area */}
      {location.pathname === "/admin" ? (
        <main className="flex-grow z-10 relative">
          <Outlet />
        </main>
      ) : (
        <main className={cn(
          "flex-grow z-10 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.1)] relative",
          location.pathname === "/messages" ? "" : "pb-14"
        )}>
          <div className={cn(location.pathname !== "/messages" && "pb-6")}>
            <Outlet />
          </div>
        </main>
      )}

      {/* Parallax Revealed Footer */}
      {location.pathname !== "/messages" && location.pathname !== "/admin" && (
        <Footer />
      )}

      {/* Modern Bottom Navigation Bar (Mobile Only) */}
      {location.pathname !== "/admin" && (
        <nav className="fixed bottom-0 left-0 right-0 bg-stone-900/95 backdrop-blur-xl border-t border-stone-800 h-14 px-2 sm:px-4 flex items-center justify-between z-[150] shadow-[0_-20px_50px_rgba(0,0,0,0.4)] md:hidden">
          <div className="max-w-2xl mx-auto w-full flex items-center justify-between gap-1">
            {/* 1. Home */}
            <Link
              to="/"
              onClick={handleHomeClick}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2 min-w-[56px] rounded-lg transition-colors group",
                location.pathname === "/"
                  ? "text-amber-400 font-black"
                  : "text-stone-400 hover:text-stone-200"
              )}
            >
              <HomeIcon
                className={cn(
                  "w-5 h-5 transition-transform group-hover:scale-105",
                  location.pathname === "/" ? "fill-amber-400/20" : "",
                )}
              />
              <span className="text-[10px] uppercase tracking-wider leading-none mt-1 whitespace-nowrap">
                Home
              </span>
            </Link>

            {/* 2. Search */}
            <Link
              to="/listings"
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2 min-w-[56px] rounded-lg transition-colors group",
                location.pathname === "/listings"
                  ? "text-amber-400 font-black"
                  : "text-stone-400 hover:text-stone-200"
              )}
            >
              <Search className="w-5 h-5 transition-transform group-hover:scale-105" />
              <span className="text-[10px] uppercase tracking-wider leading-none mt-1 whitespace-nowrap">
                Search
              </span>
            </Link>

            {/* 3. Post ad Center (3D) */}
            <Link
              to="/submit"
              state={{ forceReset: true }}
              className="relative -top-5 flex flex-col items-center justify-center group active:translate-y-1 transition-transform"
            >
              <div className="relative w-11 h-11 bg-gradient-to-b from-yellow-300 via-amber-400 to-orange-500 rounded-[16px] shadow-[0_6px_0_0_#9a3412,0_10px_25px_rgba(245,158,11,0.55)] flex items-center justify-center border-t-2 border-yellow-100 border-x border-amber-300 rotate-45 group-hover:rotate-[225deg] transition-all duration-700">
                <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/55 to-transparent rounded-t-[14px] pointer-events-none" />
                <PlusSquare className="w-6 h-6 text-stone-950 drop-shadow-sm -rotate-45 group-hover:rotate-[225deg] transition-all duration-700 font-black" />
              </div>
              <span className="text-[8.5px] font-black uppercase tracking-[0.15em] text-amber-400 mt-1.5 whitespace-nowrap drop-shadow-sm">
                Post ad
              </span>
            </Link>

            {/* 4. Chats */}
            <Link
              to="/messages"
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2 min-w-[56px] rounded-lg transition-colors group",
                location.pathname === "/messages"
                  ? "text-amber-400 font-black"
                  : "text-stone-400 hover:text-stone-200"
              )}
            >
              <MessageCircle className="w-5 h-5 transition-transform group-hover:scale-105" />
              <span className="text-[10px] uppercase tracking-wider leading-none mt-1 whitespace-nowrap">
                Chats
              </span>
            </Link>

            {/* 5. My profile */}
            <Link
              to="/profile"
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2 min-w-[56px] rounded-lg transition-colors group",
                location.pathname === "/profile"
                  ? "text-amber-400 font-black"
                  : "text-stone-400 hover:text-stone-200"
              )}
            >
              <User className="w-5 h-5 transition-transform group-hover:scale-105" />
              <span className="text-[10px] uppercase tracking-wider leading-none mt-1 whitespace-nowrap">
                My profile
              </span>
            </Link>
          </div>
        </nav>
      )}

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  );
}
