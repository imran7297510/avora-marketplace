import React, { useEffect, useState, useRef } from "react";
import { getCountryFlag } from "../components/CountrySelector";
import { PhoneInput } from "../components/PhoneInput";
import { formatPhoneNumberForDisplay, getCleanPhoneForCall, getCleanPhoneForWhatsApp } from "../lib/phoneUtils";
import { motion } from "motion/react";
import { createPortal } from "react-dom";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  serverTimestamp,
  updateDoc,
  increment,
  deleteDoc,
  runTransaction,
  limit,
  Timestamp,
} from "firebase/firestore";
import {
  db,
  handleFirestoreError,
  OperationType,
  sendNotification,
} from "../lib/firebase";
import { executeCentralUnblock, isUserBanned } from "../services/userService";
import { moderationMetricsService } from "../services/moderationMetricsService";
import { trackActivity, ActivityType } from "../lib/activity";
import { IS_READONLY_INSPECTION_MODE } from "../config/inspectionMode";
import { Listing, UserProfile, Order } from "../types";
import { useAuth } from "../context/AuthContext";
import { formatPKR, cn, evaluatePriceDropUpdate } from "../lib/utils";
import { getCurrencyByCode } from "../lib/currencies";
import { validatePriceChangeTiming, validatePriceDecreaseLimit, isListingEligibleForPriceDrops } from "../utils/priceDropLogic";
import {
  MapPin,
  Phone,
  User,
  MessageCircle,
  AlertTriangle,
  ShieldCheck,
  Share2,
  Package,
  Truck,
  CheckCircle,
  ShoppingCart,
  X,
  Zap,
  Star,
  Heart,
  Clock,
  ArrowRight,
  Trash2,
  Ban,
  UserCheck,
  UserX,
  Award,
  ArrowLeft,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
} from "lucide-react";
import { RestrictedActionAlert } from "../components/RestrictedActionAlert";
import { RequiresAuthModal } from "../components/RequiresAuthModal";
import { ImageCarousel } from "../components/ImageCarousel";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";

import { CATEGORY_FIELDS } from "../lib/categoryFields";
import { ListingCard } from "../components/ListingCard";
import { ProfileName3D } from "../components/ThreeDButton";
import { ProfileVerificationTick } from "../components/ProfileVerificationTick";
import {
  isSellerPremiumActive,
  calculateRemainingPremiumMs,
  calculateAppealDeadline,
} from "../lib/premium";

import { useDragScroll, scrollContainer } from '../lib/useScroll';

export function ListingDetails() {
  const { id, slug } = useParams<{ id?: string, slug?: string }>();
  const activeId = id || slug;
  const [listing, setListing] = useState<Listing | null>(null);
  const [sellerProfile, setSellerProfile] = useState<UserProfile | null>(null);
  const [chatCount, setChatCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [buyerDetails, setBuyerDetails] = useState({
    name: "",
    address: "",
    contact: "",
  });
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [relatedListings, setRelatedListings] = useState<Listing[]>([]);

  const relatedScrollRef = useRef<HTMLDivElement>(null);
  const relatedDrag = useDragScroll(relatedScrollRef);

  useEffect(() => {
    async function fetchRelated() {
      if (!listing) return;
      try {
        const q = query(
          collection(db, "listings"),
          where("category", "==", listing.category),
          where("status", "==", "LIVE"),
          limit(5)
        );
        const snapshot = await getDocs(q);
        const related = snapshot.docs
          .map(d => ({ ...d.data(), id: d.id } as Listing))
          .filter(l => l.id !== listing.id);
        setRelatedListings(related);
      } catch (e: any) {
        const errorMsg = e?.message || String(e);
        const isNetworkError = errorMsg.toLowerCase().includes('offline') || 
                               errorMsg.toLowerCase().includes('network') || 
                               errorMsg.toLowerCase().includes('unavailable') ||
                               errorMsg.toLowerCase().includes('unreachable');
        if (errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('limit')) {
          console.warn("Related items fetch fallback due to quota limits");
        } else if (isNetworkError) {
          console.warn("Error fetching related items (offline/network):", errorMsg);
        } else {
          console.error("Error fetching related items:", e);
        }
      }
    }
    fetchRelated();
  }, [listing]);
  const [quantity, setQuantity] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const [showRestricted, setShowRestricted] = useState(false);
  const [restrictedMessage, setRestrictedMessage] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [showAdminDeleteModal, setShowAdminDeleteModal] = useState(false);
  const [isAdminDeleting, setIsAdminDeleting] = useState(false);
  const [showOwnerDeleteModal, setShowOwnerDeleteModal] = useState(false);
  const [isOwnerDeleting, setIsOwnerDeleting] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);
  const [showUnblockConfirm, setShowUnblockConfirm] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showBadgeConfirm, setShowBadgeConfirm] = useState<{
    type: "FEATURED" | "BOOSTED";
    activate: boolean;
  } | null>(null);
  const [selectedBadgeDuration, setSelectedBadgeDuration] = useState<number>(7);
  const [showSoldConfirm, setShowSoldConfirm] = useState(false);
  const [isBlockingInProgress, setIsBlockingInProgress] = useState(false);
  const [adminSellerBadgeDuration, setAdminSellerBadgeDuration] = useState<number>(30);
  const [isUpdatingBadge, setIsUpdatingBadge] = useState(false);
  const { user, userProfile, isBlocked, isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (listing?.ownerId) {
      const getChatCount = async () => {
        try {
          const chatsQuery = query(
            collection(db, "chats"),
            where("sellerId", "==", listing.ownerId)
          );
          const snap = await getDocs(chatsQuery);
          setChatCount(snap.size);
        } catch (err) {
          console.warn("Could not load chats count", err);
          setChatCount(listing?.ownerId === user?.uid ? 4 : 0);
        }
      };
      getChatCount();
    }
  }, [listing?.ownerId, user]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  useEffect(() => {
    if (user && listing) {
      const checkReport = async () => {
        try {
          const q = query(
            collection(db, "reports"),
            where("reporterId", "==", user.uid),
          );
          const snapshot = await getDocs(q);
          const hasOpenReport = snapshot.docs.some((doc) => {
            const data = doc.data();
            return data.listingId === listing.id && data.status === "OPEN";
          });
          setHasReported(hasOpenReport);
        } catch (e: any) {
          const errorMsg = e?.message || String(e);
          const isNetworkError = errorMsg.toLowerCase().includes('offline') || 
                                 errorMsg.toLowerCase().includes('network') || 
                                 errorMsg.toLowerCase().includes('unavailable') ||
                                 errorMsg.toLowerCase().includes('unreachable');
          if (errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('limit')) {
            console.warn("Report status check fallback due to quota limits");
          } else if (isNetworkError) {
            console.warn("Error checking report status (offline/network):", errorMsg);
          } else {
            console.error("Error checking report status:", e);
          }
        }
      };
      checkReport();
    }
  }, [user, listing]);

  useEffect(() => {
    if (user && listing?.id) {
      const checkFavorite = async () => {
        try {
          const favRef = doc(db, `users/${user.uid}/favorites`, listing.id);
          const snapshot = await getDoc(favRef);
          if (snapshot.exists()) {
            setIsFavorite(true);
          }
        } catch (e: any) {
          const errorMsg = e?.message || String(e);
          const isNetworkError = errorMsg.toLowerCase().includes('offline') || 
                                 errorMsg.toLowerCase().includes('network') || 
                                 errorMsg.toLowerCase().includes('unavailable') ||
                                 errorMsg.toLowerCase().includes('unreachable');
          if (errorMsg.toLowerCase().includes('quota') || errorMsg.toLowerCase().includes('limit')) {
            console.warn("Favorite check fallback due to quota limits");
          } else if (isNetworkError) {
            console.warn("Error checking favorite (offline/network):", errorMsg);
          } else {
            console.error("Error checking favorite:", e);
          }
        }
      };
      checkFavorite();
    }
  }, [user, listing?.id]);

  const toggleFavorite = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (isBlocked) {
      setRestrictedMessage(
        "Your account has been restricted. You cannot add favorites.",
      );
      setShowRestricted(true);
      return;
    }
    if (!listing || togglingFavorite || isSold || listing.quantity <= 0)
      return;

    setTogglingFavorite(true);
    const favRef = doc(db, `users/${user.uid}/favorites`, listing.id);
    const listingRef = doc(db, "listings", listing.id);

    try {
      if (isFavorite) {
        await deleteDoc(favRef);
        setIsFavorite(false);
        // Engagement rule allows +/- 1
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
        // trackActivity handles stats and seller score
        await trackActivity(listing.id, listing.ownerId, ActivityType.SAVE);
      }
    } catch (err) {
      console.error("Favorite toggle failed:", err);
      alert("Failed to update favorite. Please try again.");
    } finally {
      setTogglingFavorite(false);
    }
  };

  useEffect(() => {
    if (user) {
      setBuyerDetails((prev) => ({
        ...prev,
        name: user.displayName || "",
        contact: user.phoneNumber || "",
      }));
    }
  }, [user]);

  useEffect(() => {
    async function fetchListing() {
      if (!activeId) return;
      try {
        let docSnap = null;
        let data: Listing | null = null;
        
        if (id) {
          const docRef = doc(db, "listings", activeId);
          docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            data = { id: docSnap.id, ...docSnap.data() } as Listing;
          }
        } else if (slug) {
          const q = query(collection(db, "listings"), where("slug", "==", slug), limit(1));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            docSnap = querySnap.docs[0];
            data = { id: docSnap.id, ...docSnap.data() } as Listing;
          } else {
            // Fallback: try parsing ID from the end of the slug
            const parts = slug.split('-');
            const potentialId = parts[parts.length - 1];
            if (potentialId) {
              try {
                const fallbackRef = doc(db, "listings", potentialId);
                const fallbackSnap = await getDoc(fallbackRef);
                if (fallbackSnap.exists()) {
                  docSnap = fallbackSnap;
                  data = { id: docSnap.id, ...docSnap.data() } as Listing;
                }
              } catch (e) {}
            }
          }
        }

        if (data) {
          const actualId = data.id;

          // Check for booking/order expiration (24 hours)
          // We only allow the OWNER to perform this cleanup to avoid permission issues and unnecessary reads
          if (user && user.uid === data.ownerId) {
            try {
              const ordersRef = collection(db, "orders");
              const expiredOrdersQuery = query(
                ordersRef,
                where("listingId", "==", actualId),
                where("sellerId", "==", user.uid),
                where("status", "==", "PENDING"),
                where("expiresAt", "<=", new Date()),
              );

              const expiredOrdersSnap = await getDocs(expiredOrdersQuery);

              if (!expiredOrdersSnap.empty) {
                const nowTime = Date.now();
                for (const orderDoc of expiredOrdersSnap.docs) {
                  try {
                    const orderDocRef = doc(db, "orders", orderDoc.id);
                    const listingRef = doc(db, "listings", actualId);

                    await runTransaction(db, async (transaction) => {
                      const freshOrderSnap = await transaction.get(orderDocRef);
                      if (!freshOrderSnap.exists()) return;

                      const freshOrder = freshOrderSnap.data() as Order;
                      // Concurrency guard: Must strictly still be PENDING
                      if (freshOrder.status !== "PENDING") return;

                      // Authoritative 24-hour expiration check
                      const orderExpiresAt = freshOrder.expiresAt ? (typeof freshOrder.expiresAt.toDate === 'function' ? freshOrder.expiresAt.toDate().getTime() : new Date(freshOrder.expiresAt).getTime()) : 0;
                      const orderCreatedAt = freshOrder.createdAt ? (typeof freshOrder.createdAt.toDate === 'function' ? freshOrder.createdAt.toDate().getTime() : new Date(freshOrder.createdAt).getTime()) : 0;
                      const isExpired = (orderExpiresAt > 0 && orderExpiresAt <= nowTime) || (orderCreatedAt > 0 && (nowTime - orderCreatedAt) >= 24 * 60 * 60 * 1000);

                      if (!isExpired) return;

                      const freshListingSnap = await transaction.get(listingRef);
                      // Mark order as EXPIRED atomically
                      transaction.update(orderDocRef, {
                        status: "EXPIRED",
                        updatedAt: serverTimestamp(),
                      });

                      // If listing exists, restore reserved inventory and status safely
                      if (freshListingSnap.exists()) {
                        const freshListing = freshListingSnap.data() as Listing;
                        const restoredQty = (freshListing.quantity || 0) + (freshOrder.quantity || 1);
                        const updatePayload: any = {
                          quantity: restoredQty,
                          updatedAt: serverTimestamp(),
                        };
                        // If it was marked BOOKED or was 0-qty, restore to LIVE if not SOLD/SUSPENDED/DELETED
                        if (freshListing.status === "BOOKED" || (freshListing.quantity || 0) === 0) {
                          if (freshListing.status !== "SOLD" && freshListing.status !== "SUSPENDED") {
                            updatePayload.status = "LIVE";
                            updatePayload.bookedAt = null;
                          }
                        }
                        transaction.update(listingRef, updatePayload);
                      }
                    });
                  } catch (orderTxErr) {
                    console.warn(`Atomic expiration failed for order ${orderDoc.id}:`, orderTxErr);
                  }
                }
              }
            } catch (cleanupErr) {
              console.warn("Background order cleanup failed:", cleanupErr);
              // We don't throw here to avoid crashing the whole page load
            }
          }

          setListing(data);

          // Block access to suspended listings for non-admins and non-owners
          if (
            data.status === "SUSPENDED" &&
            !isAdmin &&
            (!user || user.uid !== data.ownerId)
          ) {
            setListing(null);
            setLoading(false);
            return;
          }

          if (!IS_READONLY_INSPECTION_MODE && (!user || user.uid !== data.ownerId)) {
            trackActivity(actualId, data.ownerId, ActivityType.VIEW);
          }

          if (data.category) {
            try {
              const key = user?.uid ? `mandi_viewed_categories_${user.uid}` : 'mandi_viewed_categories';
              const viewed = localStorage.getItem(key);
              const list: string[] = viewed ? JSON.parse(viewed) : [];
              const filtered = list.filter(c => c !== data.category);
              filtered.unshift(data.category);
              localStorage.setItem(key, JSON.stringify(filtered.slice(0, 5)));
            } catch (e) {}
          }

          if (data.ownerId && data.ownerId !== "guest") {
            const userRef = doc(db, "users", data.ownerId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const uData = {
                id: userSnap.id,
                ...userSnap.data(),
              } as UserProfile;
              setSellerProfile(uData);

              // Fetch seller listing count
              const q = query(
                collection(db, "listings"),
                where("ownerId", "==", data.ownerId),
                where("status", "==", "LIVE"),
              );
              const qSnap = await getDocs(q);
              (uData as any).listingCount = qSnap.size;
              setSellerProfile({ ...uData });
            }
          }
        }
      } catch (err: any) {
        console.error("Listing fetch failed:", err);
        const friendlyError = err.message || "Failed to load listing.";
        setError(friendlyError);
        setListing(null);
        setSellerProfile(null);
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [activeId, slug, user]);

  const updateBookingDetails = (field: string, value: string) => {
    setBuyerDetails((prev) => ({ ...prev, [field]: value }));
  };

  const handleBookOrder = async () => {
    if (!user) {
      alert("Please login to book this item.");
      return;
    }
    if (isBlocked) {
      setRestrictedMessage(
        "Your account has been restricted. You cannot place orders.",
      );
      setShowRestricted(true);
      return;
    }
    if (!listing) return;
    if (isSold) {
      alert("This item is already sold out and is not available for sale.");
      return;
    }

    if (!buyerDetails.name || !buyerDetails.address || !buyerDetails.contact) {
      alert("Please fill in all buyer details.");
      return;
    }

    setBooking(true);
    try {
      const listingRef = doc(db, "listings", listing.id);
      const orderRef = doc(collection(db, "orders"));

      await runTransaction(db, async (transaction) => {
        const listingDoc = await transaction.get(listingRef);
        if (!listingDoc.exists()) {
          throw new Error("Listing does not exist!");
        }

        const listingData = listingDoc.data() as Listing;
        if (listingData.status === "SOLD") {
          throw new Error("This item is already sold out and is not available for sale.");
        }
        const currentQuantity = listingData.quantity || 0;

        if (currentQuantity < quantity) {
          throw new Error(
            `Only ${currentQuantity} items available. Please reduce your quantity.`,
          );
        }

        const newStock = currentQuantity - quantity;
        const totalPrice =
          listingData.price * quantity + (listingData.shippingCharges || 0);

        const orderData: Order = {
          listingId: listing.id,
          listingTitle: listingData.title || "Untitled",
          listingImage:
            listingData.images && listingData.images.length > 0
              ? listingData.images[0]
              : "",
          buyerId: user.uid,
          sellerId: listingData.ownerId || "",
          quantity: quantity,
          unitPrice: listingData.price || 0,
          shippingCharges: listingData.shippingCharges || 0,
          totalAmount: totalPrice,
          currency: listingData.currency || 'PKR',
          currencySymbol: listingData.currencySymbol || getCurrencyByCode(listingData.currency || 'PKR').symbol,
          status: "PENDING",
          buyerName: buyerDetails.name || "",
          buyerAddress: buyerDetails.address || "",
          buyerContact: buyerDetails.contact || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };

        // 1. Create Order
        transaction.set(orderRef, orderData);

        // 2. Atomically reserve inventory by decrementing available stock
        const listingUpdatePayload: any = {
          quantity: newStock,
          updatedAt: serverTimestamp(),
        };

        if (newStock === 0) {
          listingUpdatePayload.status = "BOOKED";
          listingUpdatePayload.bookedAt = serverTimestamp();
        }

        transaction.update(listingRef, listingUpdatePayload);
      });

      // After transaction success, send notification
      const totalPrice =
        listing.price * quantity + (listing.shippingCharges || 0);
      await sendNotification(
        listing.ownerId,
        "New booking received",
        `You have received a booking order.`,
        "NEW_ORDER",
        orderRef.id,
      );

      setBookingSuccess(true);
      setShowBookingForm(false);
      setQuantity(1); // Reset local quantity

      // We no longer deduct local quantity immediately upon booking
    } catch (e: any) {
      console.error(e);
      alert(e.message || "An error occurred during booking.");
    } finally {
      setBooking(false);
    }
  };

  const handleStartBooking = () => {
    if (!user) {
      alert("Please login to book this item.");
      return;
    }
    if (!listing) return;
    if (isSold) {
      alert("This item is already sold out and has been marked as unavailable for sale.");
      return;
    }
    if (listing.ownerId === user.uid) {
      alert("You cannot book your own listing.");
      return;
    }
    if (quantity > listing.quantity) {
      alert("Requested quantity is more than available stock.");
      return;
    }
    setShowBookingForm(true);
  };

  const handleStartChat = async () => {
    if (!user) {
      setAuthMessage("Please log in to chat with the seller.");
      setShowAuthModal(true);
      return;
    }
    if (isBlocked) {
      setRestrictedMessage(
        "Your account has been restricted. You cannot start new chats.",
      );
      setShowRestricted(true);
      return;
    }
    if (!listing) return;

    try {
      const q = query(
        collection(db, "chats"),
        where("listingId", "==", listing.id),
        where("buyerId", "==", user.uid),
      );
      const snapshot = await getDocs(q);

      let chatId: string;

      if (snapshot.empty) {
        const chatRef = doc(collection(db, "chats"));
        chatId = chatRef.id;

        const initialText = `Hello, I'm interested in your item: "${listing.title}". Here is the link: ${window.location.origin}/listings/${listing.id}`;

        await setDoc(chatRef, {
          listingId: listing.id,
          buyerId: user.uid,
          sellerId: listing.ownerId,
          lastMessage: initialText,
          updatedAt: serverTimestamp(),
          unreadCountSeller: 1,
          unreadCountBuyer: 0,
          isArchivedBuyer: false,
          isArchivedSeller: false,
          isDeletedBuyer: false,
          isDeletedSeller: false,
          isBlocked: false,
          status: "ACCEPTED",
          initiatorId: user.uid,
        });

        // Add the initial message to the subcollection
        const msgRef = doc(collection(db, "chats", chatId, "messages"));
        await setDoc(msgRef, {
          senderId: user.uid,
          text: initialText,
          isOffer: false,
          createdAt: serverTimestamp(),
        });
      } else {
        chatId = snapshot.docs[0].id;
      }

      navigate(`/messages`, { state: { activeChatId: chatId } });
    } catch (e) {
      console.error(e);
      alert("Failed to start chat.");
    }
  };

  const handleShare = async () => {
    if (!listing) return;
    const url = listing.slug
      ? `${window.location.origin}/listing/${listing.slug}`
      : `${window.location.origin}/listings/${listing.id}`;
    const title = listing.title;

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          url,
        });
        trackActivity(listing.id, listing.ownerId, ActivityType.SHARE);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          navigator.clipboard.writeText(url);
          setToastMessage("Link Copied to Clipboard");
        }
      }
    } else {
      navigator.clipboard.writeText(url);
      setToastMessage("Link Copied to Clipboard");
      trackActivity(listing.id, listing.ownerId, ActivityType.SHARE);
    }
  };

  const handleReport = () => {
    if (!user) {
      setAuthMessage("Please log in to report this listing.");
      setShowAuthModal(true);
      return;
    }
    if (isBlocked || isUserBanned(userProfile) || (userProfile as any)?.reportingDisabled || (userProfile as any)?.canReport === false) {
      setRestrictedMessage(
        "Your account has been restricted by administration from submitting reports.",
      );
      setShowRestricted(true);
      return;
    }
    setShowReportModal(true);
  };

  const submitReport = async () => {
    if (!listing || !user || !reportReason.trim()) return;

    setIsSubmittingReport(true);
    try {
      const reportRef = doc(collection(db, "reports"));

      await runTransaction(db, async (transaction) => {
        transaction.set(reportRef, {
          listingId: listing.id,
          listingTitle: listing.title,
          listingImage: listing.images?.[0] || null,
          listingPrice: listing.price,
          ownerId: listing.ownerId,
          reporterId: user.uid,
          reason: reportReason.trim(),
          status: "OPEN",
          createdAt: serverTimestamp(),
        });
      });

      moderationMetricsService.clearCache();
      setToastMessage("Report submitted successfully. Our team will review it.");
      setShowReportModal(false);
      setReportReason("");
      setHasReported(true);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "reports");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleUnblockSeller = () => {
    if (!sellerProfile || !user || !isAdmin) return;
    setShowUnblockConfirm(true);
  };

  const handleExecuteUnblockSeller = async () => {
    if (!sellerProfile || !user || !isAdmin) return;
    if (!sellerProfile.id) return;

    setIsUnblocking(true);
    setShowUnblockConfirm(false);

    try {
      await executeCentralUnblock(
        sellerProfile.id,
        user.email || "Admin",
        user.uid,
      );

      setSellerProfile((prev) =>
        prev
          ? {
              ...prev,
              isBlocked: false,
              accountStatus: "active",
              isVerified: prev.savedBadges?.isVerified ?? prev.isVerified,
              verifiedBadgeType:
                prev.savedBadges?.verifiedBadgeType ?? prev.verifiedBadgeType,
              badges: prev.savedBadges?.badges ?? prev.badges,
            }
          : null,
      );

      if (listing) {
        setListing((prev) =>
          prev ? { ...prev, status: prev.previousStatus || "LIVE" } : null,
        );
      }

      alert("Account successfully unblocked and all permissions restored.");
    } catch (e: any) {
      console.error(e);
      alert("Unable to complete unblock action. Please try again.");
    } finally {
      setIsUnblocking(false);
    }
  };

  const handleBlockSeller = () => {
    if (!sellerProfile || !user || !isAdmin) return;
    if (sellerProfile.id === user.uid) return;
    setShowBlockConfirm(true);
  };

  const handleExecuteBlockSeller = async () => {
    if (!sellerProfile || !user || !isAdmin) return;
    setShowBlockConfirm(false);
    setIsBlockingInProgress(true);
    try {
      if (!sellerProfile.id) throw new Error("Seller ID is missing.");

      const userRef = doc(db, "users", sellerProfile.id);
      const blockData = {
        isBlocked: true,
        accountStatus: "blocked",
        blockedAt: serverTimestamp(),
        blockedBy: user.uid,
        updatedAt: serverTimestamp(),
      };

      await setDoc(userRef, blockData, { merge: true });

      // Suspend Listings
      try {
        const qListings = query(
          collection(db, "listings"),
          where("ownerId", "==", sellerProfile.id),
        );
        const listingsSnap = await getDocs(qListings);

        const updatePromises = listingsSnap.docs
          .filter((l) =>
            ["LIVE", "BOOKED", "SOLD", "PENDING"].includes(l.data().status),
          )
          .map((listingDoc) =>
            updateDoc(listingDoc.ref, {
              status: "SUSPENDED",
              previousStatus: listingDoc.data().status || "LIVE",
              isSuspended: true,
              updatedAt: serverTimestamp(),
            }),
          );
        await Promise.all(updatePromises);
      } catch (err: any) {
        console.error("Listing suspension partial failure:", err);
      }

      setSellerProfile((prev) =>
        prev ? { ...prev, isBlocked: true, accountStatus: "blocked" } : null,
      );
      if (listing) {
        setListing((prev) => (prev ? { ...prev, status: "SUSPENDED" } : null));
      }

      alert(
        `SUCCESS: ${sellerProfile.name || "Seller"} has been blocked and listings suspended.`,
      );
    } catch (e: any) {
      console.error("Block failure:", e);
      alert("Failed to block user: " + (e.message || "Unknown error"));
    } finally {
      setIsBlockingInProgress(false);
    }
  };

  const handleToggleSellerPremiumBadge = async (currentStatus: boolean) => {
    if (!sellerProfile || !user || !isAdmin) return;
    if (!sellerProfile.id) return;

    if (
      sellerProfile.email?.toLowerCase() === "imran7297510@gmail.com" &&
      user?.email?.toLowerCase() !== "imran7297510@gmail.com"
    ) {
      alert("ACCESS DENIED: You cannot perform this action against the platform administrator.");
      return;
    }

    if (!currentStatus) {
      if (!isSuperAdmin) {
        alert("Action restricted: Only the Super Administrator is authorized to directly issue a Premium Seller Badge without a submitted application.");
        return;
      }
      if (sellerProfile.kycStatus !== "APPROVED") {
        alert("Cannot issue Premium Seller Badge: User does not have an APPROVED KYC identity verification.");
        return;
      }
      if (sellerProfile.isBlocked === true || sellerProfile.accountStatus === "blocked") {
        alert("Cannot issue Premium Seller Badge: User account is currently blocked.");
        return;
      }
    }

    const actionText = currentStatus ? "REVOKE" : "ISSUE PREMIUM SELLER BADGE";
    if (!window.confirm(`Are you sure you want to ${actionText} Premium Seller Badge for ${sellerProfile.name || "User"}?`)) {
      return;
    }

    setIsUpdatingBadge(true);
    try {
      const isKycApproved = sellerProfile.kycStatus === "APPROVED";
      let remainingMs = 0;
      let remainingSeconds = 0;
      let appealDeadline: any = null;

      if (currentStatus) {
        remainingMs = calculateRemainingPremiumMs(sellerProfile.verifiedUntil);
        remainingSeconds = Math.floor(remainingMs / 1000);
        appealDeadline = Timestamp.fromDate(calculateAppealDeadline(new Date()));
      }

      const updateData: any = {
        isVerified: !currentStatus ? true : (isKycApproved ? true : false),
        verifiedBadgeType: !currentStatus ? "GOLDEN" : null,
        isPremiumVerified: !currentStatus,
        verifiedBadgeRequestStatus: !currentStatus ? "APPROVED" : "REVOKED",
        pausedRemainingPremiumMs: !currentStatus ? 0 : remainingMs,
        pausedRemainingPremiumSeconds: !currentStatus ? 0 : remainingSeconds,
        appealDeadline: !currentStatus ? null : appealDeadline,
        appealStatus: !currentStatus ? "NONE" : "AVAILABLE",
      };

      if (!currentStatus && adminSellerBadgeDuration) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + adminSellerBadgeDuration);
        updateData.verifiedUntil = Timestamp.fromDate(expiryDate);
      } else if (currentStatus) {
        updateData.originalVerifiedUntil = sellerProfile.verifiedUntil || null;
        updateData.verifiedUntil = null;
        updateData.verifiedBadgeRevokedAt = serverTimestamp();
      }

      await setDoc(doc(db, "users", sellerProfile.id), updateData, { merge: true });

      // Send alert & notification
      const notifRef = doc(collection(db, "notifications"));
      await setDoc(notifRef, {
        userId: sellerProfile.id,
        title: currentStatus
          ? "Verified Badge Revoked (Paused)"
          : "Verified Badge Issued!",
        message: currentStatus
          ? `Your Premium Seller Badge has been paused and revoked by an administrator. ${Math.ceil(remainingSeconds / 86400)} days remaining are preserved.`
          : `Congratulations! An administrator has issued a Premium Seller Badge to your account for ${adminSellerBadgeDuration} days.`,
        type: "VERIFIED",
        isRead: false,
        createdAt: serverTimestamp(),
      });

      // Update local sellerProfile state instantly
      setSellerProfile((prev) => prev ? { ...prev, ...updateData } : null);
      alert(currentStatus ? "Badge successfully paused and revoked! Remaining time preserved." : "Premium Seller Badge successfully issued!");
    } catch (error) {
      console.error("Error toggling seller badge:", error);
      alert("Failed to update seller badge status. Please try again.");
    } finally {
      setIsUpdatingBadge(false);
    }
  };

  const executeAdminDelete = async () => {
    if (!listing) return;
    try {
      const uDoc = await getDoc(doc(db, "users", listing.ownerId));
      if (
        uDoc.exists() &&
        uDoc.data().email?.toLowerCase() === "imran7297510@gmail.com" &&
        user?.email?.toLowerCase() !== "imran7297510@gmail.com"
      ) {
        alert(
          "ACCESS DENIED: You cannot perform this action against the platform administrator.",
        );
        return;
      }
    } catch {}

    setIsAdminDeleting(true);
    try {
      await deleteDoc(doc(db, "listings", listing.id));
      setShowAdminDeleteModal(false);
      navigate(-1);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `listings/${listing.id}`,
      );
      setIsAdminDeleting(false);
    }
  };

  const [showPriceDropModal, setShowPriceDropModal] = useState(false);
  const [newPriceValue, setNewPriceValue] = useState("");
  const [priceUpdating, setPriceUpdating] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const executePriceDrop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listing || !user || user.uid !== listing.ownerId || !newPriceValue) return;
    const newPrice = Number(newPriceValue);
    if (isNaN(newPrice) || newPrice <= 0) {
      const err = "Please enter a valid price!";
      setPriceError(err);
      alert(err);
      return;
    }

    const currentPrice = listing.price;
    const originalPrice = listing.originalPrice || currentPrice;
    const history = listing.priceHistory || [{ price: currentPrice, updatedAt: new Date() }];
    setPriceError(null);

    // 1. 24-Hour Cooldown Validation
    const timingCheck = validatePriceChangeTiming(history, listing);
    if (!timingCheck.allowed) {
      const err = timingCheck.message || "Price change cooldown active (24-hour rule).";
      setPriceError(err);
      alert(err);
      return;
    }

    // 2. Max 20% Decrease Limit per Action Validation
    if (newPrice < currentPrice) {
      const decreaseCheck = validatePriceDecreaseLimit(currentPrice, newPrice);
      if (!decreaseCheck.allowed) {
        const err = `You cannot decrease the price by more than 20% in a single update. Maximum allowed decrease for current price (${formatPKR(currentPrice, listing.currencySymbol || listing.currency)}) is down to ${formatPKR(decreaseCheck.minAllowedPrice, listing.currencySymbol || listing.currency)} (20% limit per action).`;
        setPriceError(err);
        alert(err);
        return;
      }
    }

    setPriceUpdating(true);
    try {
      const listingRef = doc(db, "listings", listing.id);

      const dropResult = evaluatePriceDropUpdate(currentPrice, newPrice, history, originalPrice);
      const isDrop = dropResult.isDrop;
      const percent = dropResult.priceDroppedPercent || 0;
      const amount = dropResult.priceDroppedAmount || 0;
      const previousBaseline = dropResult.previousPrice || originalPrice;

      const updatedHistory = [...history, { price: newPrice, updatedAt: new Date() }];

      const updateData: any = {
        price: newPrice,
        priceHistory: updatedHistory,
        updatedAt: serverTimestamp(),
      };

      if (isDrop) {
        updateData.priceDropped = true;
        updateData.previousPrice = previousBaseline;
        updateData.priceDroppedPercent = percent;
        updateData.priceDroppedAmount = amount;
        updateData.priceDroppedAt = serverTimestamp();
      } else {
        updateData.priceDropped = false;
        updateData.previousPrice = null;
        updateData.priceDroppedPercent = null;
        updateData.priceDroppedAmount = null;
        updateData.priceDroppedAt = null;
      }

      if (!listing.originalPrice) {
        updateData.originalPrice = currentPrice;
      }

      await updateDoc(listingRef, updateData);

      // Refresh page listing object safely
      setListing(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          price: newPrice,
          originalPrice: prev.originalPrice || currentPrice,
          priceHistory: updatedHistory,
          priceDropped: isDrop,
          previousPrice: isDrop ? previousBaseline : undefined,
          priceDroppedPercent: isDrop ? percent : undefined,
          priceDroppedAmount: isDrop ? amount : undefined,
        } as Listing;
      });

      setToastMessage(isDrop ? "📉 Price dropped & watchers notified successfully!" : "💰 Price updated successfully (Not a generic Drop)!");
      setTimeout(() => setToastMessage(null), 4000);
      setShowPriceDropModal(false);
      setNewPriceValue("");
    } catch (error) {
      console.error("Price change processing error:", error);
      alert("Failed to update pricing metrics.");
    } finally {
      setPriceUpdating(false);
    }
  };

  const executeOwnerDelete = async () => {
    if (!listing || !user || user.uid !== listing.ownerId) return;
    setIsOwnerDeleting(true);
    try {
      await deleteDoc(doc(db, "listings", listing.id));
      setShowOwnerDeleteModal(false);
      navigate(-1);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `listings/${listing.id}`,
      );
      setIsOwnerDeleting(false);
    }
  };

  const handleTogglePromotion = (
    type: "FEATURED" | "BOOSTED",
    activate: boolean,
  ) => {
    if (!listing) return;
    if (activate) {
      if (!isSuperAdmin) {
        alert(`Action restricted: Only Super Admin is allowed to directly issue ${type === "BOOSTED" ? "Boosted" : "Featured"} badge without an application.`);
        return;
      }
    } else {
      if (!isAdmin) return;
    }
    setSelectedBadgeDuration(type === "FEATURED" ? 7 : 3);
    setShowBadgeConfirm({ type, activate });
  };

  const handleExecuteTogglePromotion = async (durationOverride?: number) => {
    if (!listing || !showBadgeConfirm) return;
    const { type, activate } = showBadgeConfirm;
    if (activate) {
      if (!isSuperAdmin) {
        alert(`Action restricted: Only Super Admin is allowed to directly issue ${type === "BOOSTED" ? "Boosted" : "Featured"} badge without an application.`);
        return;
      }
    } else {
      if (!isAdmin) return;
    }
    const targetDuration = durationOverride !== undefined ? durationOverride : selectedBadgeDuration;
    setShowBadgeConfirm(null);

    try {
      const updateData: any = {};
      
      if (activate) {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + targetDuration);

        if (type === "FEATURED") {
          updateData.isFeatured = true;
          updateData.featuredUntil = expiryDate;
          updateData.promotionStatus = "APPROVED";
        } else if (type === "BOOSTED") {
          updateData.isBoosted = true;
          updateData.boostedUntil = expiryDate;
          updateData.promotionStatus = "APPROVED";
        }
      } else {
        const now = new Date();
        if (type === "FEATURED") {
          const isBoostedActive = listing.isBoosted && listing.boostedUntil && (
            typeof listing.boostedUntil.toDate === 'function' ? listing.boostedUntil.toDate() > now :
            new Date(listing.boostedUntil.seconds ? listing.boostedUntil.seconds * 1000 : listing.boostedUntil) > now
          );
          updateData.isFeatured = false;
          updateData.featuredUntil = null;
          updateData.promotionStatus = isBoostedActive ? "APPROVED" : "NONE";
        } else if (type === "BOOSTED") {
          const isFeaturedActive = listing.isFeatured && listing.featuredUntil && (
            typeof listing.featuredUntil.toDate === 'function' ? listing.featuredUntil.toDate() > now :
            new Date(listing.featuredUntil.seconds ? listing.featuredUntil.seconds * 1000 : listing.featuredUntil) > now
          );
          updateData.isBoosted = false;
          updateData.boostedUntil = null;
          updateData.promotionStatus = isFeaturedActive ? "APPROVED" : "NONE";
        }

        // Sync to active promotionRequests so exact frozen remaining time is recorded and available for appeal
        try {
          const promoType = type === "FEATURED" ? "FEATURED" : "BOOST";
          const promoQ = query(
            collection(db, "promotionRequests"),
            where("targetId", "==", listing.id),
            where("type", "==", promoType),
            where("status", "==", "APPROVED")
          );
          const promoSnap = await getDocs(promoQ);
          const until = type === "FEATURED" ? listing.featuredUntil : listing.boostedUntil;
          const remainingMs = calculateRemainingPremiumMs(until);
          const remainingSeconds = Math.floor(remainingMs / 1000);
          const appealDeadline = Timestamp.fromDate(calculateAppealDeadline(new Date()));

          for (const pDoc of promoSnap.docs) {
            await updateDoc(doc(db, "promotionRequests", pDoc.id), {
              status: "REVOKED",
              revocationReason: "Administrative override / Badge revoked by administrator.",
              updatedAt: serverTimestamp(),
              revokedAt: serverTimestamp(),
              originalVerifiedUntil: until || null,
              pausedRemainingPremiumMs: remainingMs,
              pausedRemainingPremiumSeconds: remainingSeconds,
              appealDeadline: appealDeadline,
              appealStatus: "AVAILABLE",
            });
          }
        } catch (syncErr) {
          console.warn("Could not sync revocation to promotionRequests:", syncErr);
        }
      }

      await updateDoc(doc(db, "listings", listing.id), updateData);
      setListing({ ...listing, ...updateData });
    } catch (error) {
      console.error("Error toggling promotion:", error);
      alert("Failed to update listing promotion status.");
    }
  };

  const handleMarkAsSold = () => {
    if (!listing) return;
    setShowSoldConfirm(true);
  };

  const handleExecuteMarkAsSold = async () => {
    if (!listing) return;
    setShowSoldConfirm(false);

    try {
      const listingRef = doc(db, "listings", listing.id);
      await updateDoc(listingRef, {
        status: "SOLD",
        updatedAt: serverTimestamp(),
      });
      setListing((prev) => (prev ? { ...prev, status: "SOLD" } : null));
      alert("Item successfully marked as SOLD.");
    } catch (err) {
      console.error(err);
      alert("Failed to mark item as sold.");
    }
  };

  const openLightbox = (index: number) => {
    setPhotoIndex(index);
    setLightboxOpen(true);
  };

  if (loading)
    return <div className="py-20 text-center text-stone-400">Loading...</div>;

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="bg-white p-10 rounded-3xl border border-stone-200 shadow-sm">
          <div className="bg-amber-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-4">
            Connection Issue
          </h1>
          <p className="text-stone-600 mb-8 leading-relaxed">
            {error.includes("CONNECTION_ERROR")
              ? "We are unable to reach our database. This is usually due to browser security settings blocking the connection in the preview iframe."
              : error}
          </p>
          <div className="space-y-4">
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-stone-900 text-white font-bold py-3 rounded-xl hover:bg-stone-800 transition-all"
            >
              Try Again
            </button>
            <p className="text-xs text-stone-400 font-medium">
              If the problem persists, please open the app in a{" "}
              <strong>New Tab</strong> using the icon at the top right.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!listing)
    return (
      <div className="py-20 text-center text-stone-400">Listing not found</div>
    );

  const slides = listing.images
    ? listing.images.map((url) => ({ src: url }))
    : [];

  const displaySellerName = sellerProfile?.name || listing.sellerName;
  const displayCity = sellerProfile?.city || listing.city;
  const totalPrice = listing.price * quantity + (listing.shippingCharges || 0);

  const isSold = listing.status === "SOLD";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <RestrictedActionAlert
        isVisible={showRestricted}
        onClose={() => setShowRestricted(false)}
        message={restrictedMessage}
      />
      <RequiresAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message={authMessage}
      />
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate("/");
          }
        }}
        className="inline-flex items-center gap-2 px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 hover:text-stone-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all mb-6 active:scale-95 cursor-pointer border border-stone-200 shadow-xs"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          <div className="w-full lg:w-[55%] p-4 sm:p-6 bg-stone-50 border-r border-stone-100 flex flex-col">
            <ImageCarousel
              images={listing.images || []}
              title={listing.title}
              activeIndex={photoIndex}
              onChangeIndex={(idx) => setPhotoIndex(idx)}
              onOpenLightbox={(idx) => openLightbox(idx)}
            />
          </div>

          <div className="w-full lg:w-[45%] p-6 sm:p-8 flex flex-col">
            {/* 1. PRIMARY PRODUCT TITLE, PRICE & CURRENCY */}
            <div className="mb-5 pb-4 border-b border-stone-100">
              <h1 className="text-2xl sm:text-3xl font-black text-stone-900 mb-2.5 leading-tight flex items-center gap-2.5 flex-wrap">
                <span>{listing.title}</span>
                {isSold && (
                  <span className="bg-red-500 text-white text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-black uppercase tracking-widest shadow-xs animate-pulse">
                    SOLD OUT
                  </span>
                )}
                {listing.status === "BOOKED" && (
                  <span className="bg-amber-500 text-stone-900 text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-black uppercase tracking-widest shadow-xs animate-pulse">
                    BOOKED
                  </span>
                )}
              </h1>

              <div className="flex items-center gap-3 flex-wrap mb-3">
                <div className="text-3xl sm:text-4xl md:text-5xl font-black text-amber-600 drop-shadow-xs font-mono tracking-tight">
                  {formatPKR(listing.price, listing.currencySymbol || listing.currency)}
                </div>
                {listing.currency && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-black uppercase tracking-wider shadow-xs">
                    <span className="text-sm">{getCurrencyByCode(listing.currency).flag}</span>
                    <span>{getCurrencyByCode(listing.currency).code}</span>
                    <span className="text-[11px] text-stone-500 font-mono">({getCurrencyByCode(listing.currency).symbol})</span>
                  </div>
                )}
              </div>

              {isListingEligibleForPriceDrops(listing) && (
                <div className="mt-3 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 p-3.5 sm:p-4 rounded-2xl flex items-start gap-3 shadow-xs">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center shrink-0 shadow-xs font-black text-base sm:text-lg select-none">
                    🔥
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-900 bg-amber-200/60 px-2 py-0.5 rounded-full">
                        Hot Price Drop Active
                      </span>
                      <span className="text-xs font-black text-amber-700">
                        {listing.priceDroppedPercent}% OFF
                      </span>
                    </div>
                    <p className="text-xs font-medium text-stone-700 mt-1 leading-relaxed">
                      This item has entered the <span className="font-bold text-amber-800">Hot Price Drops</span> collection with a verified markdown of <span className="font-black text-stone-900">{formatPKR(listing.priceDroppedAmount || ((listing.previousPrice || listing.originalPrice || listing.price) - listing.price), listing.currencySymbol || listing.currency)}</span> (from {formatPKR(listing.previousPrice || listing.originalPrice || listing.price, listing.currencySymbol || listing.currency)}).
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 2. KEY ATTRIBUTES & LOCATION PILLS */}
            <div className="space-y-3 mb-6">
              {(listing.city || listing.locationArea || listing.country) && (
                <div className="flex items-center gap-2 text-stone-700 font-medium bg-stone-50 w-fit px-3 py-1.5 rounded-xl border border-stone-200/80 shadow-xs text-xs sm:text-sm">
                  <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="tracking-wide flex items-center gap-1.5">
                    <span>{getCountryFlag(listing.country || sellerProfile?.country || 'Pakistan')}</span>
                    <span className="font-semibold">
                      {listing.country || sellerProfile?.country ? `${listing.country || sellerProfile?.country}, ` : ''}
                      {listing.locationArea ? `${listing.locationArea}, ` : ''}
                      {listing.city || displayCity || 'Pakistan'}
                    </span>
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <div className="flex items-center gap-1.5 bg-stone-100 text-stone-700 px-3 py-1.5 rounded-full border border-stone-200/80">
                  <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="uppercase tracking-wider font-extrabold">
                    {listing.quantity} Units Available
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-stone-100 text-stone-700 px-3 py-1.5 rounded-full border border-stone-200/80">
                  <Truck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="uppercase tracking-wider font-extrabold">
                    {listing.shippingCharges
                      ? `Shipping: ${formatPKR(listing.shippingCharges, listing.currencySymbol || listing.currency)}`
                      : "Free Delivery"}
                  </span>
                </div>
                {listing.condition && (
                  <span className="bg-emerald-100 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-full uppercase tracking-wider font-extrabold">
                    Condition: {listing.condition}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 text-xs font-bold uppercase tracking-wider pt-1">
                <span className="bg-stone-100 border border-stone-200 text-stone-700 px-2.5 py-1 rounded-md">
                  {listing.category}
                </span>
                {listing.subcategory && (
                  <span className="bg-stone-100 border border-stone-200 text-stone-700 px-2.5 py-1 rounded-md">
                    {listing.subcategory}
                  </span>
                )}
                {isAdmin && (
                  <>
                    {listing.isFeatured && (
                      <span className="bg-gradient-to-r from-amber-500 to-orange-500 border border-amber-600/30 text-stone-950 px-2.5 py-1 rounded-md flex items-center gap-1 font-black animate-pulse">
                        <Star className="w-3 h-3 fill-current text-stone-950" />
                        Featured Listing
                      </span>
                    )}
                    {listing.isBoosted && (
                      <span className="bg-blue-600 border border-blue-700 text-white px-2.5 py-1 rounded-md flex items-center gap-1 font-black animate-pulse">
                        <Zap className="w-3 h-3 fill-current" />
                        Boosted Ad
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 3. ITEM DESCRIPTION & SPECIFICATIONS */}
            <div className="space-y-4 mb-6">
              <div className="bg-stone-50/80 p-4 sm:p-5 rounded-2xl border border-stone-200/80 shadow-xs">
                <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-2.5 pb-1.5 border-b border-stone-200/60 flex items-center gap-2">
                  <span>Item Description</span>
                </h3>
                <p className="whitespace-pre-wrap text-stone-800 leading-relaxed text-xs sm:text-sm font-medium">
                  {listing.description}
                </p>
              </div>

              {listing.customFields &&
                Object.keys(listing.customFields).length > 0 &&
                CATEGORY_FIELDS[listing.category] && (
                  <div className="bg-stone-50/80 p-4 sm:p-5 rounded-2xl border border-stone-200/80 shadow-xs">
                    <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-3 pb-1.5 border-b border-stone-200/60">
                      Product Specifications
                    </h3>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                      {CATEGORY_FIELDS[listing.category]
                        .filter((field) => listing.customFields![field.name])
                        .map((field) => (
                          <div key={field.name} className="flex flex-col">
                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-0.5">
                              {field.label}
                            </span>
                            <span className="text-xs sm:text-sm font-bold text-stone-900">
                              {listing.customFields![field.name]}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
            </div>

            {/* 4. BUYER ACTION CENTER */}
            <div className="space-y-4 mb-6 pt-2 border-t border-stone-100">
              <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest">
                Contact & Purchase
              </h3>

              {user?.uid !== listing.ownerId && !isSold && (
                <div className="space-y-3">
                  <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-3.5 sm:p-4 flex flex-col gap-1.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-stone-400 font-extrabold uppercase tracking-widest block">
                        Seller Contact Number
                      </span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Available
                      </span>
                    </div>
                    <span className="text-base font-black text-stone-900 font-mono tracking-tight flex items-center gap-2">
                      <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                      {formatPhoneNumberForDisplay(listing.phoneNumber)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      onClick={handleStartChat}
                      className="col-span-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 py-3.5 rounded-xl font-black transition-all shadow-md active:scale-[0.98] text-xs sm:text-sm uppercase tracking-wider"
                    >
                      <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" /> Chat in App
                    </button>

                    <a
                      href={getCleanPhoneForCall(listing.phoneNumber)}
                      className="flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 rounded-xl font-black transition-all border border-stone-200 shadow-xs text-xs uppercase tracking-wider"
                    >
                      <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-500" /> Call Seller
                    </a>

                    <a
                      href={`https://wa.me/${getCleanPhoneForWhatsApp(listing.phoneNumber)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white py-3 rounded-xl font-black transition-all shadow-xs text-xs uppercase tracking-wider"
                    >
                      <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" /> WhatsApp
                    </a>
                  </div>
                </div>
              )}

              {/* Order Section */}
              {user?.uid !== listing.ownerId && (
                <div className="space-y-4">
                  {listing.status === "BOOKED" ? (
                    <div className="bg-amber-50 p-5 rounded-2xl border border-amber-200 border-dashed text-center">
                      <Clock className="w-7 h-7 text-amber-500 mx-auto mb-2" />
                      <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg mb-1">
                        Item Reserved
                      </h3>
                      <p className="text-xs text-stone-600 font-medium leading-relaxed">
                        This item is currently booked by another buyer. If it's
                        not shipped within 24 hours, it will become available
                        again.
                      </p>
                    </div>
                  ) : isSold || listing.quantity <= 0 ? (
                    <div className="bg-red-50 p-5 rounded-2xl border border-red-200 border-dashed text-center">
                      <X className="w-7 h-7 text-red-500 mx-auto mb-2" />
                      <h3 className="font-black text-red-600 uppercase italic tracking-tighter text-lg mb-1">
                        Out of Stock
                      </h3>
                      <p className="text-xs text-stone-600 font-medium leading-relaxed">
                        This item is currently sold out or no longer available
                        for booking.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-amber-50/80 p-4 sm:p-5 rounded-2xl border border-amber-200/80 space-y-3.5">
                      <div className="flex justify-between items-center">
                        <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4 text-amber-600" /> Book Your Order
                        </h3>
                        <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-200">
                          {listing.quantity} Left
                        </span>
                      </div>

                      {bookingSuccess ? (
                        <div className="space-y-3 animate-in zoom-in-95">
                          <div className="bg-emerald-500 text-white p-3.5 rounded-xl flex items-center justify-center gap-2 font-extrabold text-xs uppercase tracking-wider shadow-md">
                            <CheckCircle className="w-5 h-5" /> Order Booked Successfully
                          </div>
                          {listing &&
                            listing.quantity > 0 &&
                            listing.status !== "BOOKED" &&
                            !isSold && (
                              <button
                                onClick={() => {
                                  setBookingSuccess(false);
                                  setShowBookingForm(true);
                                }}
                                className="w-full bg-white border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 py-3 rounded-xl font-black transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest active:scale-95"
                              >
                                <ShoppingCart className="w-4 h-4" /> Book More
                                Orders
                              </button>
                            )}
                        </div>
                      ) : (
                        <>
                          <button
                            disabled={booking || listing.quantity <= 0}
                            onClick={handleStartBooking}
                            className="w-full bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white py-3.5 rounded-xl font-black transition-all shadow-md flex items-center justify-center gap-2 text-sm active:scale-95 uppercase tracking-wider"
                          >
                            Book Your Order (COD)
                          </button>

                          {showBookingForm && (
                            <div className="fixed inset-0 z-[100] sm:p-4 flex flex-col items-center justify-end sm:justify-center">
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                onClick={() => setShowBookingForm(false)}
                                className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs"
                              />

                              <motion.div
                                initial={{ y: "100%" }}
                                animate={{ y: 0 }}
                                transition={{
                                  type: "spring",
                                  damping: 25,
                                  stiffness: 200,
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="relative w-full sm:w-[92vw] sm:max-w-md bg-white rounded-t-3xl sm:rounded-[2rem] shadow-2xl flex flex-col sm:border border-stone-200 mt-auto sm:mt-0 max-h-[85dvh] sm:max-h-[90vh]"
                              >
                                <div className="flex items-center gap-3 p-5 sm:p-6 pb-4 border-b border-stone-100 bg-white rounded-t-3xl sm:rounded-t-[2rem] shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setShowBookingForm(false)}
                                    className="w-10 h-10 flex items-center justify-center hover:bg-stone-50 rounded-xl text-stone-600 transition-all border border-stone-200 active:scale-95 sm:hidden shrink-0"
                                    aria-label="Go Back"
                                  >
                                    <ArrowLeft className="w-5 h-5" />
                                  </button>
                                  <div className="flex-grow">
                                    <h2 className="text-lg sm:text-lg font-black text-stone-900 uppercase italic tracking-tighter">
                                      Book Your Order
                                    </h2>
                                    <p className="text-xs font-black text-amber-600 uppercase tracking-widest leading-none mt-1">
                                      Cash on Delivery (COD)
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setShowBookingForm(false)}
                                    className="w-8 h-8 hidden sm:flex items-center justify-center hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-all shrink-0"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>

                                <div className="p-5 sm:p-6 space-y-6 bg-white overflow-y-auto overscroll-contain flex-1 min-h-0 rounded-b-3xl sm:rounded-b-[2rem]">
                                  <div className="bg-amber-50/50 rounded-xl border border-amber-100 p-3 flex gap-2.5 text-stone-700">
                                    <Truck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <div className="text-xs font-bold leading-relaxed">
                                      Please provide details below. Your order
                                      will be shipped within 24-48 hours.
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <div>
                                      <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                        <User className="w-3.5 h-3.5" /> Full
                                        Name
                                      </label>
                                      <input
                                        type="text"
                                        value={buyerDetails.name}
                                        onChange={(e) =>
                                          setBuyerDetails({
                                            ...buyerDetails,
                                            name: e.target.value,
                                          })
                                        }
                                        className="w-full px-4 py-3 border-2 border-stone-100 rounded-xl focus:border-amber-500 focus:ring-amber-500 text-stone-800 font-bold placeholder-stone-300 text-sm focus:outline-none bg-stone-50/50 focus:bg-white transition-colors"
                                        placeholder="John Doe"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                        <Truck className="w-3.5 h-3.5" />{" "}
                                        Delivery Address
                                      </label>
                                      <textarea
                                        value={buyerDetails.address}
                                        onChange={(e) =>
                                          setBuyerDetails({
                                            ...buyerDetails,
                                            address: e.target.value,
                                          })
                                        }
                                        className="w-full border-2 border-stone-100 rounded-xl focus:border-amber-500 focus:ring-amber-500 text-stone-800 font-bold placeholder-stone-300 p-4 text-sm focus:outline-none bg-stone-50/50 focus:bg-white transition-colors"
                                        rows={3}
                                        placeholder="House #, Street name, Block, Sector, City"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                        <Phone className="w-3.5 h-3.5" />{" "}
                                        Contact Number
                                      </label>
                                      <PhoneInput
                                        value={buyerDetails.contact}
                                        onChange={(val) =>
                                          setBuyerDetails({
                                            ...buyerDetails,
                                            contact: val,
                                          })
                                        }
                                        placeholder="e.g. 3xx xxxxxxx"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                                        <ShoppingCart className="w-3.5 h-3.5" />{" "}
                                        Select Quantity
                                      </label>
                                      <div className="flex items-center justify-between bg-stone-50/50 border-2 border-stone-100 rounded-xl p-2 px-3">
                                        <span className="text-xs font-bold text-stone-400">
                                          Available: {listing.quantity}
                                        </span>
                                        <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-lg shadow-xs p-1">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setQuantity((q) =>
                                                Math.max(1, q - 1),
                                              )
                                            }
                                            className="w-8 h-8 flex items-center justify-center font-black text-stone-600 hover:bg-stone-50 rounded active:scale-95 transition-all"
                                          >
                                            -
                                          </button>
                                          <span className="w-6 text-center font-black text-stone-900 text-sm">
                                            {quantity}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setQuantity((q) =>
                                                Math.min(
                                                  listing.quantity,
                                                  q + 1,
                                                ),
                                              )
                                            }
                                            className="w-8 h-8 flex items-center justify-center font-black text-stone-600 hover:bg-stone-50 rounded active:scale-95 transition-all"
                                          >
                                            +
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="border-t border-stone-100 pt-6">
                                    <h4 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-3">
                                      Order Summary
                                    </h4>
                                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-100 grid grid-cols-2 gap-y-4 gap-x-4">
                                      <div>
                                        <p className="text-xs font-black text-stone-400 uppercase tracking-widest">
                                          Unit Price
                                        </p>
                                        <p className="font-extrabold text-stone-900 mt-0.5 text-xs">
                                          {formatPKR(listing.price, listing.currencySymbol || listing.currency)}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-xs font-black text-stone-400 uppercase tracking-widest">
                                          Quantity
                                        </p>
                                        <p className="font-extrabold text-stone-900 mt-0.5 text-xs">
                                          {quantity}{" "}
                                          {quantity === 1 ? "Unit" : "Units"}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs font-black text-stone-400 uppercase tracking-widest">
                                          Shipping
                                        </p>
                                        <p className="font-extrabold text-stone-900 mt-0.5 text-xs">
                                          {formatPKR(listing.shippingCharges || 0, listing.currencySymbol || listing.currency)}
                                        </p>
                                      </div>
                                      <div className="text-right pt-2 border-t border-stone-200/60 col-span-2 flex justify-between items-end mt-1">
                                        <p className="text-xs font-black text-amber-600 uppercase tracking-widest">
                                          Total Details
                                        </p>
                                        <div className="text-right">
                                          <p className="text-xs font-black text-amber-600/60 uppercase tracking-widest mb-1">
                                            Total Amount
                                          </p>
                                          <p className="text-lg font-black text-amber-600 leading-none">
                                            {formatPKR(totalPrice, listing.currencySymbol || listing.currency)}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex flex-col gap-3 pt-2 pb-4">
                                    <button
                                      type="button"
                                      onClick={handleBookOrder}
                                      disabled={booking}
                                      className="w-full bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white py-4 px-4 rounded-xl font-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                                    >
                                      {booking ? (
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                      ) : (
                                        <CheckCircle className="w-4 h-4" />
                                      )}
                                      {booking
                                        ? "Processing..."
                                        : "Confirm Your Order"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setShowBookingForm(false)}
                                      className="w-full py-4 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Engagement Row: Favorite & Share Buttons */}
              <div className="flex items-center gap-3 pt-1">
                {!isSold && listing.quantity > 0 && (
                  <button
                    onClick={toggleFavorite}
                    disabled={togglingFavorite}
                    id="favorite-button"
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xs border active:scale-95 disabled:opacity-50",
                      isFavorite
                        ? "bg-red-500 border-red-500 text-white"
                        : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50",
                    )}
                  >
                    <Heart
                      className={cn(
                        "w-4 h-4",
                        (isFavorite || togglingFavorite) && "fill-white",
                      )}
                    />
                    {togglingFavorite
                      ? "Processing..."
                      : isFavorite
                        ? "In Favorites"
                        : "Add to Favorite"}
                  </button>
                )}
                <button
                  onClick={handleShare}
                  id="share-button"
                  className={cn(
                    "flex items-center justify-center gap-2 py-3 px-4 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xs active:scale-95",
                    isSold || listing.quantity <= 0 ? "w-full" : "flex-1",
                  )}
                >
                  <Share2 className="w-4 h-4" />
                  Share Ad
                </button>
              </div>
            </div>

            {/* 5. SELLER INFORMATION / CREDIBILITY CARD */}
            <div className="bg-stone-50/80 rounded-2xl border border-stone-200/80 overflow-hidden shadow-xs my-6">
              <div className="p-4 sm:p-5">
                <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-3.5 pb-1 border-b border-stone-200/60">
                  Seller Credibility & Profile
                </h3>
                <div className="flex items-center gap-3.5 mb-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white border-2 border-stone-200 rounded-2xl flex items-center justify-center text-stone-300 shadow-xs overflow-hidden shrink-0">
                    {sellerProfile?.photoURL ? (
                      <img
                        src={sellerProfile.photoURL}
                        alt={displaySellerName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-6 h-6" />
                    )}
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center gap-1.5 leading-none mb-1">
                      <ProfileName3D
                        name={displaySellerName}
                        userId={listing.ownerId || sellerProfile?.id}
                        profile={sellerProfile}
                        isVerified={sellerProfile?.kycStatus === "APPROVED"}
                        isPremium={sellerProfile ? isSellerPremiumActive(sellerProfile) : false}
                      />
                    </div>
                    <div className="text-xs font-semibold text-stone-500 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span>{getCountryFlag(listing.country || sellerProfile?.country || 'Pakistan')}</span>
                        <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />{" "}
                        {listing.country || sellerProfile?.country ? `${listing.country || sellerProfile?.country}, ` : ''}
                        {listing.locationArea ? `${listing.locationArea}, ` : ""}
                        {displayCity}
                      </div>
                    </div>
                  </div>
                </div>

                {user && (listing.ownerId === user.uid || sellerProfile?.id === user.uid) ? (
                  <div className="bg-white rounded-xl p-4 border border-stone-200 shadow-xs space-y-3.5 text-xs select-none font-sans">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-stone-50 border border-stone-200 shadow-xs overflow-hidden shrink-0">
                        {sellerProfile?.photoURL ? (
                          <img
                            src={sellerProfile.photoURL}
                            alt={sellerProfile.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-stone-100 text-stone-400">
                            <User className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-stone-400 uppercase font-black text-[10px] tracking-widest block mb-0.5">
                          Name
                        </span>
                        <span className="font-black text-stone-900 text-xs sm:text-sm leading-tight flex items-center gap-1">
                          {sellerProfile?.name || "Partner"}
                          <ProfileVerificationTick profile={sellerProfile} userId={sellerProfile?.id || listing.ownerId} size="sm" />
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-stone-400 uppercase font-black text-[10px] tracking-widest block mb-1">
                        Profile Identifier
                      </span>
                      <ProfileName3D
                        name={`@${sellerProfile?.userName || sellerProfile?.name?.toLowerCase().replace(/\s+/g, '_') || 'seller'}`}
                        userId={sellerProfile?.id || listing.ownerId}
                        profile={sellerProfile}
                        isVerified={sellerProfile?.kycStatus === "APPROVED"}
                        isPremium={sellerProfile ? isSellerPremiumActive(sellerProfile) : false}
                      />
                    </div>

                    <div className="flex items-center gap-2 font-black uppercase tracking-wider text-xs border-t border-stone-100 pt-2.5">
                      {sellerProfile?.kycStatus === "APPROVED" ? (
                        <span className="text-emerald-600 flex items-center gap-1.5">
                          ✓ KYC Approved Identity
                        </span>
                      ) : (
                        <span className="text-red-500 flex items-center gap-1.5 font-bold">
                          ❌ KYC Verification Pending
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 font-black uppercase tracking-wider text-xs">
                      {sellerProfile && isSellerPremiumActive(sellerProfile) ? (
                        <span className="text-emerald-600 flex items-center gap-1.5">
                          ✓ Premium Seller Status
                        </span>
                      ) : (
                        <span className="text-red-500 flex items-center gap-1.5">
                          ❌ Standard Seller
                        </span>
                      )}
                    </div>

                    <div className="border-t border-stone-100 pt-2.5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-stone-400 uppercase font-black text-[10px] tracking-widest">
                          Active Listings
                        </span>
                        <span className="font-black text-stone-900">
                          {(sellerProfile as any)?.listingCount || (sellerProfile as any)?.listingsCount || 0}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-stone-400 uppercase font-black text-[10px] tracking-widest">
                          Total Profile Views
                        </span>
                        <span className="font-black text-stone-900">
                          {sellerProfile?.views || (sellerProfile as any)?.totalViews || 0}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-stone-400 uppercase font-black text-[10px] tracking-widest">
                          Buyer Messages
                        </span>
                        <span className="font-black text-stone-900">
                          {chatCount}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-stone-100">
                      <Link
                        to={`/user/${listing.ownerId}`}
                        className="relative overflow-hidden bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 hover:from-sky-300 hover:via-sky-400 hover:to-blue-500 text-white py-2.5 px-3 rounded-xl font-black uppercase text-xs tracking-widest text-center transition-all duration-150 shadow-[0_3px_0_0_#1d4ed8] hover:shadow-[0_4px_0_0_#1e40af] active:translate-y-0.5 border-t border-sky-200/80 block select-none"
                      >
                        <span className="relative z-10 drop-shadow-xs">View Profile</span>
                      </Link>
                      <Link
                        to="/submit" state={{ forceReset: true }}
                        className="bg-amber-500 hover:bg-amber-600 text-stone-900 py-2.5 px-3 rounded-xl font-black uppercase text-xs tracking-widest text-center transition-colors shadow-xs block active:scale-95"
                      >
                        Post Ad
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-stone-200 space-y-2.5 mb-3.5 text-xs font-sans">
                      <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-xs">
                        {sellerProfile?.kycStatus === "APPROVED" ? (
                          <span className="text-emerald-600 flex items-center gap-1">
                            ✓ KYC Approved Identity
                          </span>
                        ) : (
                          <span className="text-red-500 flex items-center gap-1 font-bold">
                            ❌ KYC Verification Pending
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-xs">
                        {sellerProfile && isSellerPremiumActive(sellerProfile) ? (
                          <span className="text-emerald-600 flex items-center gap-1">
                            ✓ Premium Seller
                          </span>
                        ) : (
                          <span className="text-red-500 flex items-center gap-1">
                            ❌ Standard Seller
                          </span>
                        )}
                      </div>

                      <div className="border-t border-stone-100 my-2"></div>

                      <div className="flex justify-between items-center">
                        <span className="text-stone-400 uppercase font-black text-[10px] tracking-widest">
                          Active Listings
                        </span>
                        <span className="font-black text-stone-900 text-xs sm:text-sm">
                          {(sellerProfile as any)?.listingCount || (sellerProfile as any)?.listingsCount || 0}
                        </span>
                      </div>
                    </div>

                    <Link
                      to={`/user/${listing.ownerId}`}
                      className="relative overflow-hidden block w-full text-center py-2.5 bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 hover:from-sky-300 hover:via-sky-400 hover:to-blue-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all duration-150 shadow-[0_3px_0_0_#1d4ed8] hover:shadow-[0_4px_0_0_#1e40af] active:translate-y-0.5 border-t border-sky-200/80 select-none"
                    >
                      <span className="relative z-10 drop-shadow-xs">View Seller Profile</span>
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* 6. LOWER-PRIORITY MANAGEMENT & MODERATION CONTROLS */}
            <div className="mt-auto space-y-5 pt-5 border-t border-stone-200">
              {/* GROUP A: SELLER MANAGEMENT (OWNER-ONLY) */}
              {user?.uid === listing.ownerId && (
                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-3">
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest block mb-1">
                    Seller Management Options
                  </span>

                  {!isSold && (
                    <div className="space-y-2.5">
                      <button
                        onClick={handleMarkAsSold}
                        className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-black transition-all shadow-xs w-full uppercase tracking-widest text-xs active:scale-[0.98]"
                      >
                        <CheckCircle className="w-4 h-4" /> Mark As Sold Out
                      </button>

                      <button
                        onClick={() => {
                          setNewPriceValue(String(listing.price));
                          setShowPriceDropModal(true);
                        }}
                        className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 py-3 rounded-xl font-black transition-all shadow-xs w-full uppercase tracking-widest text-xs active:scale-[0.98]"
                      >
                        <TrendingDown className="w-4 h-4 font-black" /> Change / Lower Price (Price Drop)
                      </button>

                      <Link
                        to={`/featured?listingId=${listing.id}`}
                        className="flex items-center justify-center gap-2 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white py-3 rounded-xl font-black transition-all shadow-xs w-full uppercase italic tracking-tighter text-xs active:scale-[0.98]"
                      >
                        <Zap className="w-4 h-4" /> Promote / Feature This Ad
                      </Link>
                      <div className="text-center pt-1">
                        <span
                          className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-md border ${listing.promotionStatus === "APPROVED" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : listing.promotionStatus === "PENDING" ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-stone-50 text-stone-400 border-stone-100"}`}
                        >
                          Promotion Status: {listing.promotionStatus || "Not Promoted"}
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setShowOwnerDeleteModal(true)}
                    className="flex items-center justify-center gap-2 bg-red-100 hover:bg-red-600 text-red-650 hover:text-white py-3 rounded-xl font-black transition-all shadow-xs w-full uppercase tracking-widest text-xs active:scale-[0.98]"
                  >
                    <Trash2 className="w-4 h-4" /> Remove / Delete Listed Item
                  </button>
                </div>
              )}

              {/* GROUP B: ADMIN MODERATION */}
              {isAdmin && (
                <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-200/60 space-y-2">
                  <span className="text-[10px] font-black text-amber-700/80 uppercase tracking-widest block mb-1">
                    Administrator Controls
                  </span>
                  <div className="flex flex-wrap justify-end gap-2">
                    {(listing.isFeatured || isSuperAdmin) && (
                      <button
                        onClick={() =>
                          handleTogglePromotion("FEATURED", !listing.isFeatured)
                        }
                        className={cn(
                          "flex items-center gap-2 px-3.5 py-2 rounded-lg font-bold transition-all text-xs uppercase tracking-widest shadow-xs",
                          listing.isFeatured
                            ? "bg-stone-200 hover:bg-stone-300 text-stone-700"
                            : "bg-amber-100 hover:bg-amber-500 text-amber-700 hover:text-white",
                        )}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        {listing.isFeatured
                          ? "Revoke Featured Badge"
                          : "Award Featured Badge"}
                      </button>
                    )}
                    {(listing.isBoosted || isSuperAdmin) && (
                      <button
                        onClick={() =>
                          handleTogglePromotion("BOOSTED", !listing.isBoosted)
                        }
                        className={cn(
                          "flex items-center gap-2 px-3.5 py-2 rounded-lg font-bold transition-all text-xs uppercase tracking-widest shadow-xs",
                          listing.isBoosted
                            ? "bg-stone-200 hover:bg-stone-300 text-stone-700"
                            : "bg-blue-100 hover:bg-blue-500 text-blue-700 hover:text-white",
                        )}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        {listing.isBoosted
                          ? "Revoke Boosted Badge"
                          : "Award Boosted Badge"}
                      </button>
                    )}
                    <button
                      onClick={() => setShowAdminDeleteModal(true)}
                      className="flex items-center gap-2 px-3.5 py-2 bg-red-100 hover:bg-red-600 text-red-600 hover:text-white rounded-lg font-bold transition-all text-xs uppercase tracking-widest shadow-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove Item (Admin)
                    </button>
                  </div>
                </div>
              )}

              {/* GROUP C: REPORT LISTING */}
              <div className="pt-3 border-t border-stone-100 flex justify-center">
                <button
                  onClick={hasReported ? undefined : handleReport}
                  disabled={hasReported}
                  className={cn(
                    "group flex items-center gap-2 px-5 py-2 rounded-xl transition-all duration-300 font-black text-xs uppercase tracking-[0.12em] shadow-xs",
                    hasReported
                      ? "bg-green-50 text-green-600 border border-green-200 cursor-not-allowed"
                      : "bg-stone-100 hover:bg-red-600 text-stone-600 hover:text-white border border-stone-200 hover:border-red-600 active:scale-95",
                  )}
                >
                  {hasReported ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-stone-500 group-hover:text-white group-hover:animate-bounce" />
                  )}
                  {hasReported ? "Report Sent" : user?.uid === listing.ownerId ? "Report Listing (test)" : "Report Listing"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {slides.length > 0 && (
        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          index={photoIndex}
          slides={slides}
          plugins={[Zoom]}
          carousel={{ padding: 0 }}
        />
      )}

      {/* Admin Delete Modal */}
      {showAdminDeleteModal &&
        isAdmin &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-8 text-center relative">
                <button
                  onClick={() => setShowAdminDeleteModal(false)}
                  className="absolute top-4 right-4 text-stone-400 hover:text-stone-900 transition-colors"
                  disabled={isAdminDeleting}
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-10 h-10" />
                </div>

                <h3 className="text-2xl font-black italic uppercase tracking-tighter text-stone-900 mb-3">
                  Remove Item
                </h3>
                <p className="text-stone-400 text-sm mb-8 leading-relaxed font-medium">
                  Are you sure you want to permanently remove this posted item
                  from the website? This action is irreversible and should be
                  used for policy violations.
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={executeAdminDelete}
                    disabled={isAdminDeleting}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-200 flex items-center justify-center gap-2 active:scale-95"
                  >
                    {isAdminDeleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Removing...
                      </>
                    ) : (
                      "Confirm Removal"
                    )}
                  </button>
                  <button
                    onClick={() => setShowAdminDeleteModal(false)}
                    disabled={isAdminDeleting}
                    className="w-full bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Seller Price Drop Adjuster Modal */}
      {showPriceDropModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm z-[150] flex items-center justify-center p-3 sm:p-4">
            <div className="bg-stone-900 border border-stone-800 w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              <div className="p-5 sm:p-6 md:p-8 relative text-stone-100">
                <button
                  onClick={() => setShowPriceDropModal(false)}
                  className="absolute top-5 right-5 p-2 rounded-full bg-stone-950/50 hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
                  disabled={priceUpdating}
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex gap-3 items-center mb-6">
                  <div className="w-10 h-10 bg-amber-500 text-stone-955 rounded-xl flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 font-black" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase italic tracking-tight text-white leading-none">Adjust Listing Price</h3>
                    <p className="text-xs text-stone-400 font-bold uppercase mt-1">Price Drops Placement Tool</p>
                  </div>
                </div>

                <form onSubmit={executePriceDrop} className="space-y-5">
                  {priceError && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-xs font-bold leading-relaxed flex items-start gap-2.5">
                      <span className="text-base select-none leading-none">⚠️</span>
                      <div>
                        <h4 className="font-black uppercase text-red-300">Action Blocked</h4>
                        <p className="mt-0.5">{priceError}</p>
                      </div>
                    </div>
                  )}

                  <div className="bg-stone-955 border border-stone-850 p-4.5 rounded-2xl space-y-2 text-xs font-semibold text-stone-400">
                    <div className="flex justify-between">
                      <span>Initial original baseline:</span>
                      <span className="font-mono text-stone-300">{formatPKR(listing.originalPrice || listing.price, listing.currencySymbol || listing.currency)}</span>
                    </div>
                    <div className="flex justify-between border-t border-stone-850 pt-2 text-sm font-black">
                      <span>Current Active Price:</span>
                      <span className="font-mono text-amber-500">{formatPKR(listing.price, listing.currencySymbol || listing.currency)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-stone-400 font-black uppercase block mb-1.5">New Sale Price ({listing.currencySymbol || listing.currency || 'PKR'})</label>
                    <input
                      type="number"
                      step="any"
                      required
                      min="0.01"
                      placeholder="e.g. 8.56, 22.03, or 0.13"
                      value={newPriceValue}
                      onChange={(e) => setNewPriceValue(e.target.value)}
                      className="w-full bg-stone-955 border border-stone-800 rounded-xl px-4 py-3 text-xs text-stone-100 font-bold font-mono focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-xs text-stone-400 block mt-1.5 font-semibold leading-relaxed">
                      💡 Lowering this below your original baseline triggers automated inclusions in our main <strong className="text-amber-500">Price Drops Catalog</strong>!
                    </span>
                  </div>

                  {/* Anti-abuse policy reminder box */}
                  <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl flex items-start gap-2.5">
                    <span className="text-base select-none leading-none">🛡️</span>
                    <div>
                      <h4 className="text-xs font-black uppercase text-amber-400 leading-tight">Anti-Abuse Discount Protection</h4>
                      <p className="text-xs font-bold text-stone-400 mt-0.5 leading-normal">
                        Our platform tracks lifetime historical prices. Artificially inflating then dropping to deceive buyers resets catalog eligibility instantly.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowPriceDropModal(false)}
                      disabled={priceUpdating}
                      className="flex-1 py-3.5 bg-stone-955 hover:bg-stone-800 text-stone-400 font-bold uppercase text-xs tracking-wider rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={priceUpdating}
                      className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-450 text-stone-955 font-black uppercase text-xs tracking-wider rounded-xl transition-colors cursor-pointer shadow-lg flex items-center justify-center gap-1.5"
                    >
                      {priceUpdating ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-stone-955/20 border-t-stone-955 rounded-full animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <span>Verify & Save</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Owner Delete Modal */}
      {showOwnerDeleteModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-8 text-center relative">
                <button
                  onClick={() => setShowOwnerDeleteModal(false)}
                  className="absolute top-4 right-4 text-stone-400 hover:text-stone-900 transition-colors"
                  disabled={isOwnerDeleting}
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="w-20 h-20 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-10 h-10" />
                </div>

                <h3 className="text-2xl font-black italic uppercase tracking-tighter text-stone-900 mb-3">
                  Delete Listed Item
                </h3>
                <p className="text-stone-400 text-xs mb-8 leading-relaxed font-semibold">
                  Are you sure you want to PERMANENTLY REMOVE this listed item from the platform? This action is irreversible.
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={executeOwnerDelete}
                    disabled={isOwnerDeleting}
                    className="w-full bg-red-650 hover:bg-red-700 disabled:opacity-50 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-200 flex items-center justify-center gap-2 active:scale-95"
                  >
                    {isOwnerDeleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Removing...
                      </>
                    ) : (
                      "Yes, Remove Permanently"
                    )}
                  </button>
                  <button
                    onClick={() => setShowOwnerDeleteModal(false)}
                    disabled={isOwnerDeleting}
                    className="w-full bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Report Modal */}
      {showReportModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-xs rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="bg-red-600 p-4 text-white relative">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="absolute top-3 right-3 text-white/50 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                <h2 className="text-lg font-black uppercase italic tracking-tighter">
                  Report Listing
                </h2>
                <p className="text-red-100/80 text-xs font-bold uppercase tracking-widest mt-0.5">
                  Professional Violation Check
                </p>
              </div>

              <div className="p-4 space-y-3">
                <div>
                  <p className="text-stone-400 font-medium text-xs leading-relaxed mb-3">
                    Are you sure you want to report{" "}
                    <span className="font-black text-stone-900 italic">
                      "{listing.title}"
                    </span>
                    ? Please provide a detailed reason for this report. False
                    reporting may lead to account suspension.
                  </p>

                  <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-1 ml-2">
                    Violation Details
                  </label>
                  <textarea
                    className="w-full bg-stone-50 border-none rounded-xl px-4 py-3 font-medium text-stone-900 text-xs focus:ring-2 focus:ring-red-500 transition-all"
                    rows={4}
                    placeholder="Explain why this listing is being reported (e.g., fraudulent item, illegal goods, duplicate ad, etc.)"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-600 font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all"
                  >
                    Cancel Action
                  </button>
                  <button
                    onClick={submitReport}
                    disabled={isSubmittingReport || !reportReason.trim()}
                    className="flex-[1.5] bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-200 flex items-center justify-center gap-1.5"
                  >
                    {isSubmittingReport ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Confirm & Submit"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Related Listings Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-stone-100">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div>
            <h2 className="text-4xl font-black text-stone-900 uppercase italic tracking-tighter leading-none mb-3">
              Similar <span className="text-amber-500">Items</span>
            </h2>
            <p className="text-stone-400 font-medium uppercase tracking-[0.2em] text-xs">
              Items matching your interest
            </p>
          </div>
        </div>

        {relatedListings.length > 0 ? (
          <div className="relative group/scroll-list">
            {/* Left Scroll Button */}
            <button
              type="button"
              onClick={() => scrollContainer(relatedScrollRef, "left")}
              className="absolute -left-3 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white/95 border-2 border-stone-200 backdrop-blur shadow-xl rounded-full flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 hover:border-amber-500 hover:scale-110 transition-all md:flex hidden active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
              aria-label="Scroll Left"
            >
              <ChevronLeft className="w-5 h-5 font-black" />
            </button>

            <div 
              ref={relatedScrollRef}
              {...relatedDrag}
              className="flex flex-row gap-4 lg:gap-6 overflow-x-auto pb-6 scrollbar-none scroll-smooth py-1 cursor-grab active:cursor-grabbing select-none"
            >
              {relatedListings.map((related) => (
                <div key={related.id} className="w-[160px] sm:w-[240px] md:w-[320px] flex-shrink-0" onDragStart={(e) => e.preventDefault()}>
                  <ListingCard listing={related} />
                </div>
              ))}
            </div>

            {/* Right Scroll Button */}
            <button
              type="button"
              onClick={() => scrollContainer(relatedScrollRef, "right")}
              className="absolute -right-3 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-11 h-11 bg-white/95 border-2 border-stone-200 backdrop-blur shadow-xl rounded-full flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 hover:border-amber-500 hover:scale-110 transition-all md:flex hidden active:scale-95 cursor-pointer opacity-90 hover:opacity-100"
              aria-label="Scroll Right"
            >
              <ChevronRight className="w-5 h-5 font-black" />
            </button>
          </div>
        ) : (
           <div className="w-full py-20 text-center bg-stone-50 rounded-[3rem] border-2 border-dashed border-stone-200">
             <Package className="w-16 h-16 text-stone-300 mx-auto mb-6" />                
             <p className="text-stone-400 font-bold uppercase tracking-widest text-xs">
               No related items found at the moment.
             </p>
           </div>
        )}
      </div>

      {/* Copy Toast / Notifications */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-stone-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-black uppercase tracking-widest text-white">
              {toastMessage}
            </span>
          </div>
        </div>
      )}
      {showUnblockConfirm && sellerProfile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowUnblockConfirm(false)}
            className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-emerald-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-emerald-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-100 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-600">
                <UserCheck className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Confirm Account Unblock
                </h3>
                <p className="text-xs md:text-xs font-black text-emerald-600 uppercase tracking-widest truncate max-w-[150px] md:max-w-none">
                  Target: {sellerProfile.name || "Seller"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to unblock this account? This action will
                restore all normal platform access and permissions for the user.
              </p>

              <div className="bg-emerald-50 p-3 md:p-4 rounded-xl border border-emerald-100 italic font-medium text-emerald-700 text-xs md:text-xs">
                ✨ Safe Restore: All suspended listings will become public, and
                user badges will be seamlessly rebuilt without data loss.
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowUnblockConfirm(false)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteUnblockSeller}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  Confirm Unblock
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showBlockConfirm && sellerProfile && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowBlockConfirm(false)}
            className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-red-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-red-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-red-100 rounded-xl md:rounded-2xl flex items-center justify-center text-red-600">
                <UserX className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Confirm Account Block
                </h3>
                <p className="text-xs md:text-xs font-black text-red-600 uppercase tracking-widest truncate max-w-[150px] md:max-w-none">
                  Target: {sellerProfile.name || "Seller"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to block this user account? This will
                restrict them from posting, reporting, chatting, and will
                suspend all their active listings.
              </p>

              <div className="bg-red-50 p-3 md:p-4 rounded-xl border border-red-100 italic font-medium text-red-700 text-xs md:text-xs">
                ⚠️ Security Notice: Restriction is immediate and irreversible by
                the user. All active badges will be archived.
              </div>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowBlockConfirm(false)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteBlockSeller}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl shadow-red-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <UserX className="w-3.5 md:w-4 h-3.5 md:h-4" />
                  Confirm Block
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showBadgeConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowBadgeConfirm(null)}
            className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-amber-100 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-amber-50 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-100 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-600">
                <Award className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  {showBadgeConfirm.activate ? "Award" : "Revoke"} Badge
                </h3>
                <p className="text-xs md:text-xs font-black text-amber-600 uppercase tracking-widest truncate">
                  Item: {listing?.title}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to{" "}
                {showBadgeConfirm.activate ? "award a" : "revoke the"}{" "}
                {showBadgeConfirm.type} badge for this item?
              </p>

              {showBadgeConfirm.activate && (
                <div className="space-y-3 bg-stone-50 border border-stone-200/60 p-4 rounded-2xl">
                  <span className="block text-xs font-black text-stone-400 uppercase tracking-widest">
                    Select Promotion Period
                  </span>
                  
                  <div className="grid grid-cols-3 gap-2">
                    {showBadgeConfirm.type === "FEATURED"
                      ? [7, 15, 30].map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => {
                              setSelectedBadgeDuration(days);
                            }}
                            className={cn(
                              "py-3 px-2 rounded-xl font-bold transition-all text-center flex flex-col items-center justify-center border",
                              selectedBadgeDuration === days
                                ? "bg-amber-500 text-stone-900 border-amber-600 shadow-md shadow-amber-500/10"
                                : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100",
                            )}
                          >
                            <span className="text-sm font-black tracking-tight">{days} Days</span>
                            <span className="text-[7px] uppercase tracking-wider opacity-80 mt-0.5">
                              {days === 7 ? "1 Week" : days === 15 ? "2 Weeks" : "1 Month"}
                            </span>
                          </button>
                        ))
                      : [3, 7, 15].map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => {
                              setSelectedBadgeDuration(days);
                            }}
                            className={cn(
                              "py-3 px-2 rounded-xl font-bold transition-all text-center flex flex-col items-center justify-center border",
                              selectedBadgeDuration === days
                                ? "bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-600/10"
                                : "bg-white text-stone-700 border-stone-200 hover:bg-stone-100",
                            )}
                          >
                            <span className="text-sm font-black tracking-tight">{days} Days</span>
                            <span className="text-[7px] uppercase tracking-wider opacity-80 mt-0.5">
                              {days === 3 ? "Standard" : days === 7 ? "Premium" : "Extreme"}
                            </span>
                          </button>
                        ))}
                  </div>

                  <div className="text-xs md:text-xs font-semibold text-stone-400 flex items-center justify-between px-1 pt-1 border-t border-stone-200/50">
                    <span>Badge Expiration:</span>
                    <span className="font-bold text-stone-800 italic">
                      {(() => {
                        const d = new Date();
                        d.setDate(d.getDate() + selectedBadgeDuration);
                        return d.toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        });
                      })()}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4 border-t border-stone-100 font-sans">
                <button
                  type="button"
                  onClick={() => setShowBadgeConfirm(null)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all text-center"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteTogglePromotion()}
                  className={cn(
                    "flex-[1.5] px-4 md:px-6 py-3.5 md:py-4 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-1.5 text-center whitespace-nowrap",
                    !showBadgeConfirm.activate
                      ? "bg-red-600 hover:bg-red-700 text-white shadow-red-600/10"
                      : showBadgeConfirm.type === "FEATURED"
                      ? "bg-amber-500 hover:bg-amber-600 text-stone-900 shadow-amber-500/10"
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/10"
                  )}
                >
                  {showBadgeConfirm.activate ? (
                    `Confirm & Award ${showBadgeConfirm.type === "FEATURED" ? "Featured" : "Boosted"}`
                  ) : (
                    `Confirm & Revoke ${showBadgeConfirm.type === "FEATURED" ? "Featured" : "Boosted"}`
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showSoldConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShowSoldConfirm(false)}
            className="absolute inset-0 bg-stone-950/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="relative w-[92vw] max-w-md bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl p-6 md:p-8 border-2 md:border-4 border-stone-800 overflow-hidden"
          >
            <div className="absolute -top-6 md:-top-10 -right-6 md:-right-10 w-24 md:w-32 h-24 md:h-32 bg-stone-100 rounded-full blur-2xl" />

            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-stone-100 rounded-xl md:rounded-2xl flex items-center justify-center text-stone-800">
                <CheckCircle className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div>
                <h3 className="font-black text-stone-900 uppercase italic tracking-tighter text-lg md:text-xl">
                  Mark as Sold
                </h3>
                <p className="text-xs md:text-xs font-black text-stone-400 uppercase tracking-widest truncate">
                  Item: {listing?.title}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-stone-600 text-xs md:text-sm font-bold leading-relaxed">
                Are you sure you want to mark this item as SOLD? This action
                will archive active marketplace listings and cannot be undone.
              </p>

              <div className="flex gap-2 md:gap-3 pt-3 md:pt-4">
                <button
                  onClick={() => setShowSoldConfirm(false)}
                  className="flex-1 px-4 md:px-6 py-3.5 md:py-4 bg-stone-100 text-stone-600 rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest hover:bg-stone-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteMarkAsSold}
                  className="flex-2 px-6 md:px-8 py-3.5 md:py-4 bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white rounded-xl md:rounded-2xl text-xs md:text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  Mark Sold
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
