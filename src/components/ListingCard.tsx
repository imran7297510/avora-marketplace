import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Listing, UserProfile } from "../types";
import { isSellerPremiumActive as checkPremium } from "../lib/premium";
import { resolveAuthoritativeVerification } from "../lib/verificationResolver";
import { fetchCachedUserProfile, getCachedUserProfileSync } from "../services/userProfileCache";
import { formatPKR } from "../lib/utils";
import { getCurrencyByCode } from "../lib/currencies";
import { getOptimizedThumbnailUrl } from "../utils/imageHelpers";
import { ProfileName3D } from "./ThreeDButton";
import {
  MapPin,
  CheckCircle,
  Trash2,
  Rocket,
  Zap,
  Clock,
  ShieldCheck,
  Star,
  MoreHorizontal,
  ArrowRight,
  AlertTriangle,
  X,
  BadgeCheck,
  Heart,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  doc,
  updateDoc,
  serverTimestamp,
  deleteDoc,
  getDoc,
  setDoc,
  increment,
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ListingCardProps {
  listing: Listing;
  onUpdate?: () => void;
  premium?: boolean;
  dark?: boolean;
  imageAspect?: string;
  isHomepage?: boolean;
  className?: string;
  sellerProfile?: UserProfile | null;
  priority?: boolean;
  key?: any;
}

import { motion } from "motion/react";

const getCategoryBadgeStyle = (category: string, isDark?: boolean) => {
  const cat = (category || "").toLowerCase();

  if (isDark) {
    if (cat.includes("mobile"))
      return "bg-indigo-900/60 text-indigo-200 border-indigo-800/50";
    if (cat.includes("electr") || cat.includes("laptop") || cat.includes("tab"))
      return "bg-blue-900/60 text-blue-200 border-blue-800/50";
    if (cat.includes("vehic") || cat.includes("car") || cat.includes("bike"))
      return "bg-red-900/60 text-red-200 border-red-800/50";
    if (cat.includes("prop"))
      return "bg-emerald-900/60 text-emerald-200 border-emerald-800/50";
    if (cat.includes("fash") || cat.includes("beaut"))
      return "bg-pink-900/60 text-pink-200 border-pink-800/50";
    if (cat.includes("furn") || cat.includes("home"))
      return "bg-amber-900/60 text-amber-200 border-amber-800/50";
    if (cat.includes("groc") || cat.includes("food"))
      return "bg-green-900/60 text-green-200 border-green-800/50";
    if (cat.includes("sport") || cat.includes("health"))
      return "bg-orange-900/60 text-orange-200 border-orange-800/50";
    if (cat.includes("kid") || cat.includes("bab"))
      return "bg-purple-900/60 text-purple-200 border-purple-800/50";
    if (cat.includes("book") || cat.includes("educ"))
      return "bg-indigo-900/60 text-indigo-200 border-indigo-800/50";
    if (cat.includes("job") || cat.includes("serv"))
      return "bg-cyan-900/60 text-cyan-200 border-cyan-800/50";
    if (cat.includes("indust") || cat.includes("busin"))
      return "bg-stone-700/60 text-stone-200 border-stone-600/60";
    if (cat.includes("pet"))
      return "bg-yellow-900/60 text-yellow-200 border-yellow-800/50";
    if (cat.includes("agri"))
      return "bg-lime-900/60 text-lime-200 border-lime-800/50";
    if (cat.includes("event") || cat.includes("enter"))
      return "bg-rose-900/60 text-rose-200 border-rose-800/50";
    if (cat.includes("coll") || cat.includes("misc"))
      return "bg-violet-900/60 text-violet-200 border-violet-800/50";
    if (cat.includes("free"))
      return "bg-teal-900/60 text-teal-200 border-teal-800/50";
    return "bg-blue-900/60 text-blue-200 border-blue-800/50";
  } else {
    if (cat.includes("mobile"))
      return "bg-indigo-100 text-indigo-800 border-indigo-200/90";
    if (cat.includes("electr") || cat.includes("laptop") || cat.includes("tab"))
      return "bg-blue-100 text-blue-800 border-blue-200/90";
    if (cat.includes("vehic") || cat.includes("car") || cat.includes("bike"))
      return "bg-red-100 text-red-850 border-red-200/90";
    if (cat.includes("prop"))
      return "bg-emerald-100 text-emerald-850 border-emerald-200/90";
    if (cat.includes("fash") || cat.includes("beaut"))
      return "bg-pink-100 text-pink-850 border-pink-200/90";
    if (cat.includes("furn") || cat.includes("home"))
      return "bg-amber-100 text-amber-900 border-amber-200/90";
    if (cat.includes("groc") || cat.includes("food"))
      return "bg-green-100 text-green-850 border-green-200/90";
    if (cat.includes("sport") || cat.includes("health"))
      return "bg-orange-100 text-orange-850 border-orange-200/90";
    if (cat.includes("kid") || cat.includes("bab"))
      return "bg-purple-100 text-purple-850 border-purple-200/90";
    if (cat.includes("book") || cat.includes("educ"))
      return "bg-indigo-100 text-indigo-805 border-indigo-200/90";
    if (cat.includes("job") || cat.includes("serv"))
      return "bg-cyan-100 text-cyan-850 border-cyan-200/90";
    if (cat.includes("indust") || cat.includes("busin"))
      return "bg-stone-200 text-stone-800 border-stone-300";
    if (cat.includes("pet"))
      return "bg-yellow-105 text-yellow-850 border-yellow-200/90";
    if (cat.includes("agri"))
      return "bg-lime-100 text-lime-850 border-lime-200/90";
    if (cat.includes("event") || cat.includes("enter"))
      return "bg-rose-100 text-rose-850 border-rose-200/90";
    if (cat.includes("coll") || cat.includes("misc"))
      return "bg-violet-100 text-violet-850 border-violet-200/90";
    if (cat.includes("free"))
      return "bg-teal-100 text-teal-850 border-teal-200/90";
    return "bg-blue-100 text-blue-800 border-blue-200/90";
  }
};

export function ListingCard({
  listing,
  onUpdate,
  premium,
  dark = true,
  imageAspect,
  isHomepage,
  className,
  sellerProfile: initialSellerProfile,
  priority = false,
}: ListingCardProps) {
  const { user, isAdmin, isBlocked } = useAuth();
  const effectiveOwnerId = listing.ownerId || (listing as any).sellerId || (listing as any).userId;

  const [sellerProfile, setSellerProfile] = useState<UserProfile | null>(() => {
    if (initialSellerProfile !== undefined) {
      return initialSellerProfile;
    }
    if (effectiveOwnerId) {
      const cached = getCachedUserProfileSync(effectiveOwnerId);
      if (cached !== undefined) {
        return cached;
      }
    }
    return null;
  });

  const navigate = useNavigate();
  const [isFavorite, setIsFavorite] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const executeDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || deleting || !listing.id) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "listings", listing.id));
      setShowDeleteConfirm(false);
      onUpdate?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `listings/${listing.id}`);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    // Disabled favorite fetch on mount to improve performance
    // setIsFavorite(false);
    return () => {
      isMounted = false;
    };
  }, [user, listing.id]);

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      navigate("/login");
      return;
    }
    if (isBlocked) {
      alert("Your account has been restricted. You cannot add favorites.");
      return;
    }
    if (toggling || !listing.id) return;
    setToggling(true);

    const favRef = doc(db, `users/${user.uid}/favorites`, listing.id);
    const listingRef = doc(db, "listings", listing.id);

    try {
      if (isFavorite) {
        await deleteDoc(favRef);
        setIsFavorite(false);
        await updateDoc(listingRef, {
          saves: increment(-1),
          updatedAt: serverTimestamp(),
        }).catch((e) => console.warn("Could not decrement saves:", e));
      } else {
        await setDoc(favRef, {
          listingId: listing.id,
          savedAt: serverTimestamp(),
          title: listing.title,
          price: listing.price,
          image: listing.images?.[0] || null,
        });
        setIsFavorite(true);
        await updateDoc(listingRef, {
          saves: increment(1),
          updatedAt: serverTimestamp(),
        }).catch((e) => console.warn("Could not increment saves:", e));
      }
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error("Error toggling favorite from card:", err);
    } finally {
      setToggling(false);
    }
  };

  useEffect(() => {
    if (initialSellerProfile !== undefined) {
      setSellerProfile(initialSellerProfile);
      return;
    }

    let isMounted = true;
    if (effectiveOwnerId) {
      const cached = getCachedUserProfileSync(effectiveOwnerId);
      if (cached !== undefined) {
        setSellerProfile(cached);
        return;
      }

      fetchCachedUserProfile(effectiveOwnerId).then((profile) => {
        if (isMounted && profile) {
          setSellerProfile(profile);
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [effectiveOwnerId, initialSellerProfile]);

  const isOwner = Boolean(
    user && user.uid && effectiveOwnerId && user.uid === effectiveOwnerId,
  );

  const isFeaturedActive = (() => {
    if (!listing.isFeatured) return false;
    if (listing.featuredUntil) {
      const fu = listing.featuredUntil;
      let expired = false;
      if (typeof fu.toDate === "function") {
        expired = fu.toDate() < new Date();
      } else if (fu.seconds) {
        expired = new Date(fu.seconds * 1000) < new Date();
      } else {
        const d = new Date(fu);
        if (!isNaN(d.getTime())) {
          expired = d < new Date();
        }
      }
      if (expired) return false;
    }
    return true;
  })();

  const isBoostedActive = (() => {
    if (!listing.isBoosted) return false;
    if (listing.boostedUntil) {
      const bu = listing.boostedUntil;
      let expired = false;
      if (typeof bu.toDate === "function") {
        expired = bu.toDate() < new Date();
      } else if (bu.seconds) {
        expired = new Date(bu.seconds * 1000) < new Date();
      } else {
        const d = new Date(bu);
        if (!isNaN(d.getTime())) {
          expired = d < new Date();
        }
      }
      if (expired) return false;
    }
    return true;
  })();

  const authSellerVerif = sellerProfile ? resolveAuthoritativeVerification(sellerProfile) : null;

  const isSellerPremiumActive = (() => {
    if (authSellerVerif) {
      return authSellerVerif.isPremiumCurrentlyActive;
    }
    return Boolean(
      (listing as any).sellerIsPremium ||
      (listing as any).sellerIsPremiumVerified ||
      (listing as any).isPremiumSeller ||
      (listing as any).ownerIsPremiumVerified ||
      (listing as any).isPremium
    );
  })();

  const isSellerKycActive = (() => {
    if (authSellerVerif) {
      return authSellerVerif.isKycCurrentlyValid && !authSellerVerif.isPremiumCurrentlyActive;
    }
    if (isSellerPremiumActive) return false;
    return Boolean(
      (listing as any).sellerKycApproved ||
      (listing as any).ownerKycApproved
    );
  })();

  const isBoosted = isBoostedActive || isFeaturedActive;

  const sellerDisplayName =
    sellerProfile?.name ||
    (listing as any).sellerName ||
    (listing as any).userName ||
    sellerProfile?.businessName ||
    sellerProfile?.username ||
    "Seller";

  const timeAgo = () => {
    if (!listing.createdAt) return "Just now";
    const date =
      listing.createdAt.toDate?.() ||
      new Date(listing.createdAt.seconds * 1000);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "group relative flex flex-col rounded-[1.5rem] lg:rounded-[2rem] overflow-hidden transition-all duration-500 h-full",
        dark
          ? "bg-stone-900 border border-stone-800/80 hover:bg-stone-850 hover:border-amber-500/50 shadow-lg text-white hover:-translate-y-1"
          : "bg-white border border-stone-100 shadow-sm hover:shadow-2xl hover:shadow-stone-200/50 hover:-translate-y-1",
        premium && "ring-2 ring-amber-500/20 shadow-xl shadow-amber-500/10",
        className,
      )}
    >
      {/* Image Container */}
      <div
        className={cn(
          "relative overflow-hidden cursor-pointer shrink-0",
          isHomepage ? "aspect-[3/2]" : imageAspect || "aspect-[4/3]",
        )}
        onClick={() => navigate(listing.slug ? `/listing/${listing.slug}` : `/listings/${listing.id}`)}
      >
        {listing.images && listing.images[0] && !imgError ? (
          <img
            src={getOptimizedThumbnailUrl(listing.images[0], isHomepage ? 480 : 500, 75)}
            alt={listing.title || "Marketplace listing photo"}
            referrerPolicy="no-referrer"
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            width={isHomepage ? 480 : 400}
            height={isHomepage ? 320 : 300}
            onError={() => setImgError(true)}
            className={cn(
              "w-full h-full object-cover transition-transform duration-700 group-hover:scale-110",
              listing.status === "SOLD" &&
                "scale-100 blur-[2px] brightness-[0.4]",
            )}
          />
        ) : (
          <div className="w-full h-full bg-stone-100 dark:bg-stone-800 flex flex-col items-center justify-center p-3 text-center border-b border-stone-200/50">
            <AlertTriangle className="w-6 h-6 text-stone-400 dark:text-stone-600 mb-1" />
            <span className="text-xs font-black uppercase tracking-wider text-stone-400 dark:text-stone-400">No Image Available</span>
          </div>
        )}

        {/* Sold Out Dark Overlay and Centered Banner */}
        {listing.status === "SOLD" && (
          <div className="absolute inset-0 bg-stone-950/20 flex items-center justify-center z-10 p-2">
            <div className="bg-red-650 text-white font-black text-xs lg:text-xs uppercase tracking-[0.2em] px-4 py-2 rounded-xl shadow-xl flex items-center gap-1.5 border border-red-500/30">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              SOLD OUT
            </div>
          </div>
        )}

        {/* Top Badges Overlay (Left) */}
        <div className="absolute top-2.5 left-2.5 flex z-10 pointer-events-none flex-row items-center gap-1.5 flex-wrap max-w-[80%]">
          {isFeaturedActive && (
            <span className="text-lg md:text-xl leading-none select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
              ⭐
            </span>
          )}
          {isBoostedActive && (
            <span className="text-lg md:text-xl leading-none select-none filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
              🚀
            </span>
          )}
          {listing.priceDropped && (
            <span className="bg-amber-500 text-stone-900 border border-amber-400 font-extrabold text-[8.5px] sm:text-[9.5px] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md uppercase tracking-wider drop-shadow-md select-all leading-none">
              📉 Price Dropped
            </span>
          )}
        </div>

        {/* Top Badges Overlay (Right) */}
        <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none flex flex-row items-start gap-1">
           {isSellerPremiumActive ? (
              <BadgeCheck className="w-5 h-5 lg:w-6 lg:h-6 text-amber-500 fill-amber-100 drop-shadow-md" />
           ) : isSellerKycActive ? (
              <BadgeCheck className="w-5 h-5 lg:w-6 lg:h-6 text-blue-500 fill-blue-50 drop-shadow-md" />
           ) : null}
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex flex-col p-2.5 sm:p-3 cursor-pointer flex-1 gap-1.5 justify-between min-h-[120px]",
        )}
        onClick={() => navigate(listing.slug ? `/listing/${listing.slug}` : `/listings/${listing.id}`)}
      >
        <div className="flex flex-col gap-1.5">
          {/* 1. Category Name */}
          <div className="flex items-center justify-between gap-1.5 min-h-[18px]">
            <span
              className={cn(
                "px-2 py-0.5 rounded-md border font-black text-[9.5px] sm:text-[10px] uppercase tracking-wider leading-none truncate max-w-[85%]",
                getCategoryBadgeStyle(listing.category, dark),
              )}
            >
              {listing.category || "General"}
            </span>
            {listing.status === "SOLD" && (
              <span className="bg-red-500/20 text-red-400 border border-red-500/30 font-extrabold text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0">
                Sold Out
              </span>
            )}
          </div>

          {/* 2. Title */}
          <h3
            className={cn(
              "font-spartan font-black text-xs sm:text-[13px] md:text-sm line-clamp-2 uppercase tracking-tight transition-colors leading-snug min-h-[2.25rem] flex items-start",
              dark ? "text-stone-100 group-hover:text-amber-400" : "text-stone-900 group-hover:text-amber-600",
            )}
          >
            {listing.title}
          </h3>

          {/* 3. Price */}
          <div className="flex items-center gap-1.5 flex-wrap min-h-[20px]">
            <span
              className={cn(
                "font-black text-xs sm:text-sm md:text-base tracking-tight font-mono",
                dark ? "text-amber-400" : "text-amber-600",
              )}
            >
              {formatPKR(listing.price, listing.currencySymbol || listing.currency)}
            </span>
            {listing.currency && (
              <span className={cn(
                "inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md border tracking-wider",
                dark 
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                <span className="text-[10px]">{getCurrencyByCode(listing.currency).flag}</span>
                <span>{getCurrencyByCode(listing.currency).code}</span>
              </span>
            )}
            {listing.priceDropped && (listing.previousPrice || listing.originalPrice) && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className="line-through text-stone-500 font-bold font-mono">
                  {formatPKR(listing.previousPrice || listing.originalPrice, listing.currencySymbol || listing.currency)}
                </span>
                <span className="text-emerald-400 font-extrabold flex items-center gap-0.5 bg-emerald-500/10 px-1 py-0.5 rounded text-[9px]">
                  ⬇ {listing.priceDroppedPercent || (
                    (listing.previousPrice || listing.originalPrice)! > listing.price
                      ? Math.round((((listing.previousPrice || listing.originalPrice)! - listing.price) / (listing.previousPrice || listing.originalPrice)!) * 100)
                      : 15
                  )}% OFF
                </span>
              </div>
            )}
          </div>

          {/* 4. Seller Profile Name in 3D Shape (No Shadow) */}
          <div className="flex items-center justify-start pt-0.5">
            <ProfileName3D
              name={sellerDisplayName}
              userId={effectiveOwnerId}
              profile={sellerProfile}
              dark={dark}
              isVerified={isSellerKycActive}
              isPremium={isSellerPremiumActive}
            />
          </div>
        </div>

        {/* 5. Location (City) - ONLY City name, NO Country or Flag */}
        <div className="pt-1.5 border-t border-stone-800/60 flex items-center justify-between gap-1 mt-1 min-h-[22px]">
          <div className="flex items-center gap-1 min-w-0">
            <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
            <span className={cn(
              "truncate font-extrabold text-[11px] sm:text-xs",
              dark ? "text-stone-300" : "text-stone-600"
            )}>
              {listing.city ? listing.city.replace(/\.+$/, "").trim() : 'Location Unspecified'}
            </span>
          </div>

          {!isHomepage && (
            user && (user.uid === listing.ownerId || isAdmin) ? (
              <button
                onClick={handleDeleteClick}
                disabled={deleting}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider transition-all border shrink-0 bg-red-100 hover:bg-red-600 border-red-200/50 hover:border-red-650 text-red-600 hover:text-white shadow-sm active:scale-95 disabled:opacity-50"
                title="Remove listed item"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>Delete</span>
              </button>
            ) : (
              <button
                onClick={handleFavoriteClick}
                disabled={toggling}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider transition-all border shrink-0 active:scale-95 disabled:opacity-50",
                  isFavorite
                    ? "bg-red-500 border-red-500 text-white shadow-sm shadow-red-500/20"
                    : dark
                      ? "bg-stone-800 border-stone-700/80 text-stone-300 hover:bg-stone-700 hover:text-white"
                      : "bg-stone-100 border-stone-200/80 text-stone-700 hover:bg-stone-150"
                )}
              >
                <Heart
                  className={cn(
                    "w-2.5 h-2.5 transition-transform",
                    isFavorite ? "fill-white text-white scale-110" : "text-current"
                  )}
                />
                <span>{isFavorite ? "Saved" : "Save"}</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Decorative corner */}
      <div className="absolute -bottom-1 -right-1 w-12 h-12 bg-amber-500/5 rotate-45 pointer-events-none" />

      {showDeleteConfirm &&
        typeof document !== "undefined" &&
        createPortal(
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4 cursor-default"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(false);
            }}
          >
            <div 
              className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-8 text-center relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(false);
                  }}
                  className="absolute top-4 right-4 text-stone-400 hover:text-stone-900 transition-colors"
                  disabled={deleting}
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-10 h-10" />
                </div>

                <h3 className="text-2xl font-spartan font-black tracking-tighter text-stone-900 mb-3">
                  Are you sure?
                </h3>
                <p className="text-stone-400 text-xs mb-8 leading-relaxed font-semibold">
                  This listed item will be removed from this platform permanently. This action is irreversible.
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={executeDelete}
                    disabled={deleting}
                    className="w-full bg-red-650 hover:bg-red-700 disabled:opacity-50 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-200 flex items-center justify-center gap-2 active:scale-95"
                  >
                    {deleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Yes, Delete Permanently"
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(false);
                    }}
                    disabled={deleting}
                    className="w-full bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </motion.div>
  );
}
