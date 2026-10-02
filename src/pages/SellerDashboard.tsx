import React, { useEffect, useState, useMemo, useRef } from 'react';
import { collection, query, where, getDocs, getDoc, orderBy, getCountFromServer, updateDoc, doc, serverTimestamp, increment, runTransaction, documentId } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, sendNotification } from '../lib/firebase';
import { Listing, Order, UserProfile } from '../types';
import { isSellerPremiumActive } from '../lib/premium';
import { resolveAuthoritativeVerification } from '../lib/verificationResolver';
import { ListingCard } from '../components/ListingCard';
import { getCountryFlag } from '../components/CountrySelector';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatPKR } from '../lib/utils';
import { useDataCache } from '../lib/cache';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { Eye, MessageCircle, Heart, TrendingUp, Grid, Plus, Trash2, ArrowRight, Zap, CheckCircle, Package, ShoppingBag, ShoppingCart, ListChecks, Search, Clock, Rocket, Truck, CreditCard, BadgeCheck, User, X, XCircle, ShieldCheck, ChevronLeft, ChevronRight, Award, Star, History, BarChart3, Menu, MapPin, Compass, Store, Share2, ArrowUpRight } from 'lucide-react';
import { BadgeActivities } from '../components/BadgeActivities';

type DashboardTab = 'default' | 'all' | 'live' | 'bookings' | 'sold' | 'purchases' | 'badge_activities' | 'favorites' | 'audit_log';

const parseDate = (dateVal: any): Date => {
  if (!dateVal) return new Date();
  if (typeof dateVal.toDate === 'function') return dateVal.toDate();
  if (typeof dateVal.toMillis === 'function') return new Date(dateVal.toMillis());
  if (dateVal.seconds) return new Date(dateVal.seconds * 1000);
  if (typeof dateVal === 'string' || typeof dateVal === 'number') return new Date(dateVal);
  if (dateVal instanceof Date) return dateVal;
  return new Date();
};

const getMs = (dateVal: any): number => {
  return parseDate(dateVal).getTime();
};

export function SellerDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<DashboardTab>('default');
  const [listings, setListings] = useState<Listing[]>([]);
  const [salesItems, setSalesItems] = useState<Order[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<Order[]>([]);
  const [savedListings, setSavedListings] = useState<Listing[]>([]);
  const [chatCount, setChatCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user, userProfile, isBlocked } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{order: Order, action: 'ACCEPT' | 'REJECT'} | null>(null);
  const [isVerifiedPending, setIsVerifiedPending] = useState(false);
  const [isFeaturedPending, setIsFeaturedPending] = useState(false);
  const [isBoostedPending, setIsBoostedPending] = useState(false);
  const [badgeSubTab, setBadgeSubTab] = useState<'badges' | 'status' | 'history'>('badges');
  const [allPromotions, setAllPromotions] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'hub' | 'mobile_preview' | 'desktop_preview'>('hub');
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');
  const [previewCategory, setPreviewCategory] = useState<string>('all');
  const [hasVerificationAppLoaded, setHasVerificationAppLoaded] = useState(false);
  const [selectedBookingForForm, setSelectedBookingForForm] = useState<Order | null>(null);
  const [courierName, setCourierName] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingNotes, setShippingNotes] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExploreMode, setIsExploreMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (selectedBookingForForm) {
      setCourierName(selectedBookingForForm.courierName || '');
      setTrackingNumber(selectedBookingForForm.trackingNumber || '');
      setShippingNotes(selectedBookingForForm.shippingNotes || '');
    } else {
      setCourierName('');
      setTrackingNumber('');
      setShippingNotes('');
    }
  }, [selectedBookingForForm]);

  const openOrderDetails = useMemo(() => {
    if (!selectedBookingForForm) return null;
    return salesItems.find(o => o.id === selectedBookingForForm.id) || selectedBookingForForm;
  }, [selectedBookingForForm, salesItems]);

  const favoritesScrollRef = useRef<HTMLDivElement>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const listingsScrollRef = useRef<HTMLDivElement>(null);
  const [isDown, setIsDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const [isTabsDown, setIsTabsDown] = useState(false);
  const [tabsStartX, setTabsStartX] = useState(0);
  const [tabsScrollLeft, setTabsScrollLeft] = useState(0);

  const [isListingsDown, setIsListingsDown] = useState(false);
  const [listingsStartX, setListingsStartX] = useState(0);
  const [listingsScrollLeft, setListingsScrollLeft] = useState(0);

  const handleTabsScroll = (direction: 'left' | 'right') => {
    if (tabsScrollRef.current) {
      const { scrollLeft, clientWidth } = tabsScrollRef.current;
      const scrollAmount = clientWidth * 0.6;
      tabsScrollRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleListingsScroll = (direction: 'left' | 'right') => {
    if (listingsScrollRef.current) {
      const { scrollLeft, clientWidth } = listingsScrollRef.current;
      const scrollAmount = clientWidth * 0.6;
      listingsScrollRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const handleFavoritesScroll = (direction: 'left' | 'right') => {
    if (favoritesScrollRef.current) {
      const { scrollLeft, clientWidth } = favoritesScrollRef.current;
      const scrollAmount = clientWidth * 0.6;
      favoritesScrollRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const listingsCache = useDataCache<Listing[]>('seller_listings_' + user?.uid);
  const salesCache = useDataCache<Order[]>('seller_sales_' + user?.uid);
  const purchasesCache = useDataCache<Order[]>('seller_purchases_' + user?.uid);
  const chatsCache = useDataCache<number>('seller_chats_' + user?.uid);

  useEffect(() => {
    if (!user) return;
    const fetchBadgeStatuses = async () => {
      try {
        // Query ALL promotion requests to properly compute active, rejected, revoked & never applied states
        const qAll = query(
          collection(db, 'promotionRequests'), 
          where('userId', '==', user.uid)
        );
        const snapshotAll = await getDocs(qAll);
        const allRequests = snapshotAll.docs.map(d => ({ ...d.data(), id: d.id }));
        setAllPromotions(allRequests);

        const pendingRequests = allRequests.filter((r: any) => r.status === 'PENDING');

        // Also check pending standard applications
        let hasPendingVerify = false;
        let hasVerifyApp = false;
        try {
          const qVerify = query(
            collection(db, 'verification_applications'),
            where('userId', '==', user.uid)
          );
          const snapVerify = await getDocs(qVerify);
          hasVerifyApp = !snapVerify.empty;
          
          const pendingVerifyDocs = snapVerify.docs.filter(d => d.data().status === 'PENDING');
          hasPendingVerify = pendingVerifyDocs.length > 0;
        } catch (eVerify) {
          console.warn("Could not load verification applications:", eVerify);
        }

        setHasVerificationAppLoaded(hasVerifyApp);
        setIsVerifiedPending(pendingRequests.some((r: any) => r.type === 'VERIFIED') || hasPendingVerify);
        setIsFeaturedPending(pendingRequests.some((r: any) => r.type === 'FEATURED'));
        setIsBoostedPending(pendingRequests.some((r: any) => r.type === 'BOOSTED'));
      } catch (err) {
        console.error("Error fetching badge statuses:", err);
      }
    };
    fetchBadgeStatuses();
  }, [user]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!favoritesScrollRef.current) return;
    setIsDown(true);
    setStartX(e.pageX - favoritesScrollRef.current.offsetLeft);
    setScrollLeft(favoritesScrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDown(false);
  };

  const handleMouseUp = () => {
    setIsDown(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDown || !favoritesScrollRef.current) return;
    const x = e.pageX - favoritesScrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(x - startX) > 5) {
      e.preventDefault();
      favoritesScrollRef.current.scrollLeft = scrollLeft - walk;
    }
  };

  const handleTabsMouseDown = (e: React.MouseEvent) => {
    if (!tabsScrollRef.current) return;
    setIsTabsDown(true);
    setTabsStartX(e.pageX - tabsScrollRef.current.offsetLeft);
    setTabsScrollLeft(tabsScrollRef.current.scrollLeft);
  };

  const handleTabsMouseLeave = () => {
    setIsTabsDown(false);
  };

  const handleTabsMouseUp = () => {
    setIsTabsDown(false);
  };

  const handleTabsMouseMove = (e: React.MouseEvent) => {
    if (!isTabsDown || !tabsScrollRef.current) return;
    const x = e.pageX - tabsScrollRef.current.offsetLeft;
    const walk = (x - tabsStartX) * 1.5;
    if (Math.abs(x - tabsStartX) > 5) {
      e.preventDefault();
      tabsScrollRef.current.scrollLeft = tabsScrollLeft - walk;
    }
  };

  const handleListingsMouseDown = (e: React.MouseEvent) => {
    if (!listingsScrollRef.current) return;
    setIsListingsDown(true);
    setListingsStartX(e.pageX - listingsScrollRef.current.offsetLeft);
    setListingsScrollLeft(listingsScrollRef.current.scrollLeft);
  };

  const handleListingsMouseLeave = () => {
    setIsListingsDown(false);
  };

  const handleListingsMouseUp = () => {
    setIsListingsDown(false);
  };

  const handleListingsMouseMove = (e: React.MouseEvent) => {
    if (!isListingsDown || !listingsScrollRef.current) return;
    const x = e.pageX - listingsScrollRef.current.offsetLeft;
    const walk = (x - listingsStartX) * 1.5;
    if (Math.abs(x - listingsStartX) > 5) {
      e.preventDefault();
      listingsScrollRef.current.scrollLeft = listingsScrollLeft - walk;
    }
  };

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['default', 'all', 'live', 'bookings', 'sold', 'purchases', 'badge_activities', 'favorites', 'audit_log'].includes(tabParam)) {
      setActiveTab(tabParam as DashboardTab);
    }
  }, [searchParams]);

  const handleTabChange = (id: DashboardTab) => {
    setActiveTab(id);
    setIsExploreMode(false);
    setSearchTerm('');
    setSearchParams({ tab: id });
  };

  useEffect(() => {
    async function fetchDashboardData() {
      if (!user) {
         setLoading(false);
         return;
      }
      if (isBlocked) {
        setLoading(false);
        return;
      }
      
      // Attempt cache hit
      const cachedListings = listingsCache.getCachedData();
      if (cachedListings && refresh === 0) setListings(cachedListings);
      
      const cachedSales = salesCache.getCachedData();
      if (cachedSales && refresh === 0) setSalesItems(cachedSales);
      
      const cachedPurchases = purchasesCache.getCachedData();
      if (cachedPurchases && refresh === 0) setPurchasedItems(cachedPurchases);

      setLoading(true);
      try {
        // Fetch My Listings
        let docs: Listing[] = [];
        try {
          const qListings = query(
            collection(db, 'listings'),
            where('ownerId', '==', user.uid)
          );
          const snapshot = await getDocs(qListings);
          docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Listing));
          docs.sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
          setListings(docs);
          listingsCache.setCacheData(docs);
        } catch (e1) {
          console.error("Error fetching listings for dashboard:", e1);
          handleFirestoreError(e1, OperationType.LIST, 'dashboard_data/listings');
        }

        // Fetch My Sales (Orders where I am seller)
        let sDocs: Order[] = [];
        try {
          const qSales = query(
            collection(db, 'orders'),
            where('sellerId', '==', user.uid)
          );
          const salesSnap = await getDocs(qSales);
          sDocs = salesSnap.docs.map(d => ({ ...d.data(), id: d.id } as Order));
          
          // Expiration check: standardized to authoritative 24 hours
          const now = new Date();
          const nowTime = now.getTime();
          const expirationTime = 24 * 60 * 60 * 1000;
          for (const order of sDocs) {
            if (!order.id) continue;
            
            // Only PENDING marketplace orders auto-expire at 24 hours
            if (order.status === 'PENDING' && order.source !== 'battle_bids') {
              const orderExpiresAt = order.expiresAt ? parseDate(order.expiresAt).getTime() : 0;
              const orderCreatedAt = order.createdAt ? parseDate(order.createdAt).getTime() : 0;
              const isExpired = (orderExpiresAt > 0 && orderExpiresAt <= nowTime) || (orderCreatedAt > 0 && (nowTime - orderCreatedAt) >= expirationTime);

              if (isExpired) {
                try {
                  const orderRef = doc(db, 'orders', order.id);
                  const listingRef = doc(db, 'listings', order.listingId);

                  await runTransaction(db, async (transaction) => {
                    const freshOrderSnap = await transaction.get(orderRef);
                    if (!freshOrderSnap.exists()) return;
                    const freshOrder = freshOrderSnap.data() as Order;

                    // Concurrency guard: Must strictly still be PENDING
                    if (freshOrder.status !== 'PENDING') return;

                    const freshExpiresAt = freshOrder.expiresAt ? parseDate(freshOrder.expiresAt).getTime() : 0;
                    const freshCreatedAt = freshOrder.createdAt ? parseDate(freshOrder.createdAt).getTime() : 0;
                    const stillExpired = (freshExpiresAt > 0 && freshExpiresAt <= nowTime) || (freshCreatedAt > 0 && (nowTime - freshCreatedAt) >= expirationTime);

                    if (!stillExpired) return;

                    const freshListingSnap = await transaction.get(listingRef);

                    // Mark order as EXPIRED atomically
                    transaction.update(orderRef, {
                      status: 'EXPIRED',
                      updatedAt: serverTimestamp(),
                    });

                    // Restore listing reserved inventory and status safely
                    if (freshListingSnap.exists()) {
                      const freshListing = freshListingSnap.data() as Listing;
                      const restoredQty = (freshListing.quantity || 0) + (freshOrder.quantity || 1);
                      const updatePayload: any = {
                        quantity: restoredQty,
                        updatedAt: serverTimestamp(),
                      };
                      if (freshListing.status === 'BOOKED' || (freshListing.quantity || 0) === 0) {
                        if (freshListing.status !== 'SOLD' && freshListing.status !== 'SUSPENDED') {
                          updatePayload.status = 'LIVE';
                          updatePayload.bookedAt = null;
                        }
                      }
                      transaction.update(listingRef, updatePayload);
                    }
                  });

                  order.status = 'EXPIRED';
                } catch (eExpired) {
                  console.warn("Failed to auto-expire order:", order.id, eExpired);
                }
              }
            }
          }
          
          // Sort: PENDING first, then BOOKED/ACCEPTED, then by date descending
          sDocs.sort((a, b) => {
            const statusOrder = { 'PENDING': 0, 'ACCEPTED': 1, 'BOOKED': 1, 'SHIPPED': 2, 'PAID': 3, 'SOLD': 4, 'REJECTED': 5, 'EXPIRED': 5 };
            const orderA = statusOrder[a.status] ?? 99;
            const orderB = statusOrder[b.status] ?? 99;
            if (orderA !== orderB) return orderA - orderB;
            return getMs(b.createdAt) - getMs(a.createdAt);
          });
          
          setSalesItems(sDocs);
          salesCache.setCacheData(sDocs);
        } catch (e2) {
          console.error("Error fetching sales orders for dashboard:", e2);
          handleFirestoreError(e2, OperationType.LIST, 'dashboard_data/sales');
        }
        
        // Fetch My Purchases
        let pDocs: Order[] = [];
        try {
          const qPurchases = query(
            collection(db, 'orders'),
            where('buyerId', '==', user.uid)
          );
          const purchaseSnap = await getDocs(qPurchases);
          pDocs = purchaseSnap.docs.map(d => ({ ...d.data(), id: d.id } as Order));
          pDocs.sort((a, b) => getMs(b.createdAt) - getMs(a.createdAt));
          setPurchasedItems(pDocs);
          purchasesCache.setCacheData(pDocs);
        } catch (e3) {
          console.error("Error fetching purchase orders for dashboard:", e3);
          handleFirestoreError(e3, OperationType.LIST, 'dashboard_data/purchases');
        }

        // Fetch My Favorites (Batched Retrieval)
        try {
          // Optimization: only fetch favorites if tab is favorites or all
          if (activeTab === 'favorites' || activeTab === 'all') {
            const qFavs = collection(db, `users/${user.uid}/favorites`);
            const favsSnap = await getDocs(qFavs);
            const favIds = favsSnap.docs.map(doc => doc.id);
            
            if (favIds.length > 0) {
              const uniqueFavIds = Array.from(new Set(favIds.filter(id => id && typeof id === 'string' && id.trim().length > 0)));
              
              if (uniqueFavIds.length > 0) {
                // Firestore 'in' queries support up to 30 items per batch
                const BATCH_SIZE = 30;
                const batches: string[][] = [];
                for (let i = 0; i < uniqueFavIds.length; i += BATCH_SIZE) {
                  batches.push(uniqueFavIds.slice(i, i + BATCH_SIZE));
                }

                const listingsMap = new Map<string, Listing>();

                await Promise.all(batches.map(async (batchIds) => {
                  const qListings = query(
                    collection(db, 'listings'),
                    where(documentId(), 'in', batchIds)
                  );
                  const batchSnap = await getDocs(qListings);
                  batchSnap.docs.forEach(d => {
                    listingsMap.set(d.id, { ...d.data(), id: d.id } as Listing);
                  });
                }));

                // Reconstruct listings array in the original favIds order
                const validListings = favIds
                  .map(id => listingsMap.get(id))
                  .filter((l): l is Listing => l !== undefined);

                setSavedListings(validListings);
              } else {
                setSavedListings([]);
              }
            } else {
              setSavedListings([]);
            }
          }
        } catch (eFav) {
          console.error("Error fetching favorites for dashboard:", eFav);
        }

        // Fetch Chat Count
        const cachedChats = chatsCache.getCachedData();
        if (cachedChats !== null && refresh === 0) setChatCount(cachedChats);
        else {
          try {
            const qChats = query(collection(db, 'chats'), where('sellerId', '==', user.uid));
            const chatSnap = await getCountFromServer(qChats);
            const count = chatSnap.data().count;
            setChatCount(count);
            chatsCache.setCacheData(count);
          } catch (e4) {
            console.error("Error fetching chats for dashboard:", e4);
            handleFirestoreError(e4, OperationType.LIST, 'dashboard_data/chats');
          }
        }
      } catch (error) {
        console.error("Dashboard data fetching encountered a terminal error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, [user, refresh, activeTab]);

  const handleRejectOrder = async (order: Order) => {
    if (!order.id) return;
    setActionLoading(order.id);
    try {
      const orderRef = doc(db, 'orders', order.id);
      const listingRef = doc(db, 'listings', order.listingId);

      await runTransaction(db, async (transaction) => {
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists()) return;
        const freshOrder = orderDoc.data() as Order;

        // Strict state guard: Only PENDING orders can be rejected and release inventory
        if (freshOrder.status !== 'PENDING') {
          throw new Error(`Order is already ${freshOrder.status}`);
        }

        const listingDoc = await transaction.get(listingRef);
        
        // Update order status to REJECTED
        transaction.update(orderRef, {
          status: 'REJECTED',
          updatedAt: serverTimestamp()
        });

        // Only update listing if it still exists
        if (listingDoc.exists()) {
          const listingData = listingDoc.data() as Listing;
          const restoredQty = (listingData.quantity || 0) + (freshOrder.quantity || 1);
          const updatePayload: any = {
            quantity: restoredQty,
            updatedAt: serverTimestamp()
          };

          if (listingData.status === 'BOOKED' || (listingData.quantity || 0) === 0) {
            if (listingData.status !== 'SOLD' && listingData.status !== 'SUSPENDED') {
              updatePayload.status = 'LIVE';
              updatePayload.bookedAt = null;
            }
          }

          transaction.update(listingRef, updatePayload);
        }
      });

      await sendNotification(
        order.buyerId,
        "Order Rejected ❌",
        `Your booking for "${order.listingTitle}" has been rejected by the seller.`,
        "ORDER_REJECTED",
        order.id
      );

      setRefresh(prev => prev + 1);
    } catch (err) {
      console.error(err);
      alert("Failed to reject order");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateOrderStatus = async (order: Order, newStatus: Order['status']) => {
    if (!order.id) return;
    setActionLoading(order.id);
    try {
      const orderRef = doc(db, 'orders', order.id);
      const listingRef = doc(db, 'listings', order.listingId);

      // Perform transaction to ensure listing updates safely
      await runTransaction(db, async (transaction) => {
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists()) return;
        const freshOrder = orderDoc.data() as Order;

        // Concurrency guard: Do not process terminal or expired orders
        if (freshOrder.status === 'EXPIRED' || freshOrder.status === 'REJECTED') {
          throw new Error(`Cannot update order because it is already ${freshOrder.status}`);
        }

        const listingDoc = await transaction.get(listingRef);
        
        transaction.update(orderRef, {
          status: newStatus,
          updatedAt: serverTimestamp()
        });

        // Under Option A (Immediate Atomic Reservation), inventory was ALREADY deducted at booking.
        // Therefore, we NEVER deduct listing.quantity a second time upon fulfillment.
        // We only transition listing status to SOLD if stock has reached 0 upon final fulfillment.
        if (listingDoc.exists()) {
          const listingData = listingDoc.data() as Listing;
          const isFulfilling = ['SHIPPED', 'DEAL_DONE', 'READY_TO_TRANSFER', 'SOLD', 'PAID'].includes(newStatus);
          
          if (isFulfilling && (listingData.quantity || 0) <= 0 && listingData.status !== 'SOLD' && listingData.status !== 'SUSPENDED') {
            transaction.update(listingRef, {
              status: 'SOLD',
              updatedAt: serverTimestamp()
            });
          }
        }
      });

      // Notifications
      if (newStatus === 'ACCEPTED') {
        await sendNotification(
          order.buyerId,
          "Order Accepted ✓",
          `Your booking for "${order.listingTitle}" has been accepted by the seller.`,
          "ORDER_ACCEPTED",
          order.id
        );
      } else if (newStatus === 'SHIPPED' || newStatus === 'DEAL_DONE' || newStatus === 'READY_TO_TRANSFER') {
        const msg = newStatus === 'SHIPPED' ? "Item shipped" : newStatus === 'DEAL_DONE' ? "Deal finalized" : "Order ready to transfer";
        await sendNotification(
          order.buyerId,
          msg,
          `Your order for "${order.listingTitle}" status is now: ${newStatus.replace('_', ' ')}.`,
          "ORDER_UPDATED",
          order.id
        );
      } else if (newStatus === 'PAID') {
        await sendNotification(
          order.sellerId,
          "Payment made",
          `You have received the payment.`,
          "PAYMENT_CONFIRMED",
          order.id
        );
      } else if (newStatus === 'SOLD') {
        await sendNotification(
          order.buyerId,
          "Item sold out",
          `Your order for "${order.listingTitle}" is completely finalized.`,
          "ORDER_SOLD",
          order.id
        );
      }

      setRefresh(prev => prev + 1);
    } catch (err) {
      console.error(err);
      alert("Failed to update status");
    } finally {
      setActionLoading(null);
    }
  };

  const handleShipOrderWithDetails = async (order: Order) => {
    if (!window.confirm("Are you sure you want to mark this order as shipped?")) return;
    if (!order.id) return;
    setActionLoading(order.id);
    try {
      const orderRef = doc(db, 'orders', order.id);
      const listingRef = doc(db, 'listings', order.listingId);
      
      await runTransaction(db, async (transaction) => {
        const listingDoc = await transaction.get(listingRef);
        
        transaction.update(orderRef, {
          status: 'SHIPPED',
          courierName: courierName,
          trackingNumber: trackingNumber,
          shippingNotes: shippingNotes,
          updatedAt: serverTimestamp()
        });
        
        if (listingDoc.exists()) {
          const listingData = listingDoc.data() as Listing;
          const deductionStatuses = ['SHIPPED', 'DEAL_DONE', 'READY_TO_TRANSFER', 'SOLD'];
          const wasAlreadyDeducted = deductionStatuses.includes(order.status);
          
          if (!wasAlreadyDeducted) {
            const currentQuantity = listingData.quantity || 0;
            const newQuantity = Math.max(0, currentQuantity - (order.quantity || 1));
            transaction.update(listingRef, {
              quantity: newQuantity,
              status: newQuantity <= 0 ? 'SOLD' : listingData.status,
              updatedAt: serverTimestamp()
            });
          }
        }
      });

      await sendNotification(
        order.buyerId,
        "Order Shipped & Dispatched 🚚",
        `Your order for "${order.listingTitle}" has been shipped. Courier: ${courierName || 'N/A'}. Tracking: ${trackingNumber || 'N/A'}.`,
        "ORDER_UPDATED",
        order.id
      );

      setRefresh(prev => prev + 1);
    } catch (err) {
      console.error(err);
      alert("Failed to update shipping details");
    } finally {
      setActionLoading(null);
    }
  };

  const stats = useMemo(() => {
    if (!listings.length) return { active: 0, views: 0, chats: chatCount, featured: 0, total: listings.length };
    
    let active = 0;
    let views = 0;
    let featured = 0;
    
    listings.forEach(l => {
      if (l.status === 'LIVE') active++;
      if (l.isFeatured && l.status === 'LIVE') featured++;
      views += (l.views || 0);
    });
    
    return { active, views, chats: chatCount, featured, total: listings.length };
  }, [listings, chatCount]);

  const filteredListings = useMemo(() => {
    switch (activeTab) {
      case 'live': return listings.filter(l => l.status === 'LIVE');
      case 'sold': return listings.filter(l => l.status === 'SOLD');
      case 'all': return listings.filter(l => l.status !== 'BOOKED');
      default: return [];
    }
  }, [listings, activeTab]);

  const currentCategoryListings = useMemo(() => {
    if (activeTab === 'favorites') return savedListings;
    return filteredListings;
  }, [activeTab, savedListings, filteredListings]);

  const currentFilteredListings = useMemo(() => {
    if (!searchTerm.trim()) return currentCategoryListings;
    const term = searchTerm.toLowerCase();
    return currentCategoryListings.filter(l => 
      l.title?.toLowerCase().includes(term) ||
      l.category?.toLowerCase().includes(term) ||
      l.description?.toLowerCase().includes(term) ||
      (l.location?.city && l.location.city.toLowerCase().includes(term))
    );
  }, [currentCategoryListings, searchTerm]);

  const performanceData = useMemo(() => {
    const datesMap: { [key: string]: { name: string; inquiries: number } } = {};
    const data = [];
    
    // Build 30-day calendar window (oldest to newest)
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      const name = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      datesMap[dateKey] = { name, inquiries: 0 };
    }

    // Map timestamped sales items / inquiries to exact date
    salesItems.forEach(order => {
      if (!order.createdAt) return;
      const orderDate = parseDate(order.createdAt);
      const year = orderDate.getFullYear();
      const month = String(orderDate.getMonth() + 1).padStart(2, '0');
      const day = String(orderDate.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      if (datesMap[dateKey]) {
        datesMap[dateKey].inquiries += 1;
      }
    });

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      if (datesMap[dateKey]) {
        data.push(datesMap[dateKey]);
      }
    }

    return data;
  }, [salesItems]);

  const aiAdvisorInsight = useMemo(() => {
    if (!listings || listings.length === 0) {
      return {
        highlight: "Get Started",
        text: "You currently have 0 active listings. Publish your first item with clear photos, competitive pricing, and detailed specifications to begin receiving buyer inquiries."
      };
    }

    if (salesItems && salesItems.length > 0) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayCounts: { [day: string]: number } = {
        Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0
      };

      salesItems.forEach(o => {
        if (o.createdAt) {
          const d = parseDate(o.createdAt);
          const dayName = dayNames[d.getDay()];
          dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
        }
      });

      let topDay = '';
      let maxCount = 0;
      dayNames.forEach(day => {
        if (dayCounts[day] > maxCount) {
          maxCount = dayCounts[day];
          topDay = day;
        }
      });

      if (topDay && maxCount > 0) {
        return {
          highlight: `${topDay} Activity Peak`,
          text: `Based on your ${salesItems.length} recorded order${salesItems.length > 1 ? 's' : ''}, your highest inquiry activity occurred on ${topDay}s (${maxCount} order${maxCount > 1 ? 's' : ''}). Maintaining updated inventory and fast responses on ${topDay}s will help maximize fulfillment.`
        };
      }
    }

    const topViewed = [...listings].sort((a, b) => (b.views || 0) - (a.views || 0))[0];
    if (topViewed && (topViewed.views || 0) > 0) {
      return {
        highlight: "Top Viewed Item",
        text: `Your top-performing listing is "${topViewed.title}" with ${topViewed.views} views. More order activity is needed before specific peak conversion patterns can be identified.`
      };
    }

    return {
      highlight: "Building Activity Patterns",
      text: `Your store has ${stats.views} total views across ${listings.length} listing${listings.length > 1 ? 's' : ''}. Additional buyer inquiry activity is needed before specific peak conversion patterns can be identified.`
    };
  }, [listings, salesItems, stats.views]);

  // Helper calculations for Badges Status checklist
  const checkFeaturedActive = (l: any) => {
    if (!l.isFeatured) return false;
    if (!l.featuredUntil) return true;
    const expiry = l.featuredUntil.seconds ? l.featuredUntil.seconds * 1000 : new Date(l.featuredUntil).getTime();
    return expiry > Date.now();
  };

  const checkBoostedActive = (l: any) => {
    if (!l.isBoosted) return false;
    if (!l.boostedUntil) return true;
    const expiry = l.boostedUntil.seconds ? l.boostedUntil.seconds * 1000 : new Date(l.boostedUntil).getTime();
    return expiry > Date.now();
  };

  const liveListings = listings.filter(l => l.status === 'LIVE');
  const liveCount = liveListings.length;
  const liveFeaturedCount = liveListings.filter(l => checkFeaturedActive(l)).length;
  const liveBoostedCount = liveListings.filter(l => checkBoostedActive(l)).length;

  const featuredBadgeListings = useMemo(() => {
    return listings.filter(l => {
      const isActive = checkFeaturedActive(l);
      const wasActive = l.wasFeatured || (l.featuredUntil && !isActive) || allPromotions.some(
        p => (p.listingId === l.id || p.listingTitle === l.title) && p.type === 'FEATURED' && (p.status === 'APPROVED' || p.status === 'EXPIRED')
      );
      return isActive || wasActive;
    }).map(l => {
      const isActive = checkFeaturedActive(l);
      return {
        ...l,
        badgeActive: isActive,
        badgeLabel: isActive ? 'Live Featured' : 'Past Featured'
      };
    });
  }, [listings, allPromotions]);

  const boostedBadgeListings = useMemo(() => {
    return listings.filter(l => {
      const isActive = checkBoostedActive(l);
      const wasActive = l.wasBoosted || (l.boostedUntil && !isActive) || allPromotions.some(
        p => (p.listingId === l.id || p.listingTitle === l.title) && (p.type === 'BOOST' || p.type === 'BOOSTED') && (p.status === 'APPROVED' || p.status === 'EXPIRED')
      );
      return isActive || wasActive;
    }).map(l => {
      const isActive = checkBoostedActive(l);
      return {
        ...l,
        badgeActive: isActive,
        badgeLabel: isActive ? 'Live Boosted' : 'Past Boosted'
      };
    });
  }, [listings, allPromotions]);

  const handleShareListing = async (e: React.MouseEvent, l: Listing) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/listing/${l.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: l.title,
          text: `Check out ${l.title} on MindSparks!`,
          url: shareUrl,
        });
      } catch (err) {
        // User aborted share
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('Listing link copied to clipboard!');
      } catch (err) {
        console.error(err);
      }
    }
  };

  const getKycStatus = () => {
    if (userProfile?.kycStatus === 'APPROVED') {
      return { text: 'approved', colorClass: 'text-green-600 font-black capitalize' };
    }
    return { text: 'Inactive', colorClass: 'text-stone-400 font-bold' };
  };

  const getEliteStatus = () => {
    // 1. Never applied
    const hasApplied = allPromotions.some(r => r.type === 'VERIFIED') || hasVerificationAppLoaded;
    if (!hasApplied) {
      return { text: 'Inactive', colorClass: 'text-stone-400 font-bold' };
    }

    // 2. Active or Resumed
    const hasBadge = isSellerPremiumActive(userProfile as UserProfile);

    const isResumed = 
      userProfile?.verifiedBadgeRequestStatus === 'RESUME_REQUESTED' ||
      userProfile?.verificationStatus === 'RESUME_REQUESTED' ||
      allPromotions.some(r => r.type === 'VERIFIED' && r.status === 'RESUME_REQUESTED');

    // 3. Revoked state and 30-day check
    const isRevoked = 
      userProfile?.verifiedBadgeRequestStatus === 'REVOKED' || 
      userProfile?.verificationStatus === 'REVOKED' ||
      allPromotions.some(r => r.type === 'VERIFIED' && r.status === 'REVOKED');

    if (isRevoked) {
      const revokedPromo = allPromotions.find(r => r.type === 'VERIFIED' && r.status === 'REVOKED');
      const revokedTime = revokedPromo ? getMs(revokedPromo.updatedAt || revokedPromo.createdAt) : Date.now();
      const daysSinceRevocation = (Date.now() - revokedTime) / (1000 * 60 * 60 * 24);
      if (daysSinceRevocation >= 30) {
        return { text: 'Inactive', colorClass: 'text-stone-400 font-bold' };
      }
      return { text: 'revoked', colorClass: 'text-red-650 font-black tracking-wider uppercase' };
    }

    if (hasBadge || isResumed) {
      return { text: 'active', colorClass: 'text-green-600 font-black tracking-wider uppercase' };
    }

    // 4. Rejected
    const isRejected = 
      userProfile?.verifiedBadgeRequestStatus === 'REJECTED' || 
      userProfile?.verificationStatus === 'REJECTED' ||
      allPromotions.some(r => r.type === 'VERIFIED' && r.status === 'REJECTED');

    if (isRejected) {
      return { text: 'Inactive', colorClass: 'text-stone-400 font-bold' };
    }

    return { text: 'Inactive', colorClass: 'text-stone-400 font-bold' };
  };

  if (!user || user.isAnonymous) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-stone-900 mb-4 tracking-tighter uppercase">Sign In Required</h1>
        <p className="text-stone-600 mb-8">Access professional seller tools exclusively for registered users.</p>
        <Link to="/profile" className="inline-block bg-amber-500 text-stone-900 font-black px-8 py-3 rounded-xl shadow-lg">Go to Login</Link>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-white p-12 rounded-[3.5rem] border border-stone-200 shadow-2xl flex flex-col items-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-2 bg-red-500" />
          <XCircle className="w-24 h-24 text-red-500 mb-8 animate-pulse" />
          
          <h2 className="text-4xl font-black text-stone-900 uppercase italic tracking-tighter mb-4">Seller Status Suspended</h2>
          
          <div className="bg-red-50 p-6 rounded-2xl border border-red-100 mb-8 max-w-lg">
             <p className="text-stone-800 font-bold mb-2">Notice of Restriction:</p>
             <p className="text-stone-600 text-sm leading-relaxed">
               Your account has been flagged and restricted for violating community trading protocols. Access to marketplace listings and order management is currently disabled.
             </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
            <button 
              onClick={() => navigate('/support')}
              className="bg-amber-500 text-stone-900 font-black px-10 py-4 rounded-2xl uppercase tracking-widest text-xs hover:bg-amber-400 transition-all active:scale-95 shadow-xl shadow-amber-500/20"
            >
              Submit Appeal
            </button>
            <button 
              onClick={() => navigate('/')}
              className="bg-stone-900 text-white font-black px-10 py-4 rounded-2xl uppercase tracking-widest text-xs hover:bg-stone-800 transition-all active:scale-95 shadow-xl"
            >
              Return to Home
            </button>
          </div>

          <p className="mt-10 text-xs font-black text-stone-400 uppercase tracking-widest">
            Protocol ID: BLK-MARKET-SYS / Administrative Action
          </p>
        </div>
      </div>
    );
  }

  const previewCategories = useMemo(() => {
    const cats = new Set<string>();
    listings.forEach(l => {
      if (l.category) cats.add(l.category);
    });
    return ['all', ...Array.from(cats)];
  }, [listings]);

  const previewFilteredListings = useMemo(() => {
    return listings.filter(l => {
      const matchCat = previewCategory === 'all' || l.category === previewCategory;
      const matchSearch = !previewSearchTerm || l.title?.toLowerCase().includes(previewSearchTerm.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [listings, previewCategory, previewSearchTerm]);

  const getTabLabel = (tab: DashboardTab): string => {
    switch (tab) {
      case 'default': return 'Default Overview';
      case 'badge_activities': return 'Badges';
      case 'all': return 'All Listings';
      case 'live': return 'Live Listings';
      case 'bookings': return 'Bookings';
      case 'sold': return 'Sold Out';
      case 'purchases': return 'Purchase';
      case 'favorites': return 'Saved';
      case 'audit_log': return 'Audit Log';
      default: return 'Overview';
    }
  };

  const tabCounts = useMemo(() => {
    return {
      badge_activities: allPromotions.length,
      all: listings.length,
      live: listings.filter(l => l.status === 'LIVE').length,
      bookings: salesItems.length,
      sold: listings.filter(l => l.status === 'SOLD').length,
      purchases: purchasedItems.length,
      favorites: savedListings.length,
      audit_log: allPromotions.length,
    };
  }, [allPromotions, listings, salesItems, purchasedItems, savedListings]);

  const TabItem = ({ id, label, icon: Icon, colorClass }: { id: DashboardTab, label: string, icon: any, colorClass: string }) => {
    const count = (tabCounts as any)[id];
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => {
          handleTabChange(id);
          setIsMenuOpen(false);
        }}
        className={`flex items-center justify-between gap-1.5 sm:gap-2.5 w-full px-2.5 py-2 sm:px-4 sm:py-3 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest transition-all border-2 active:scale-95 text-left group ${
          isActive 
            ? `bg-stone-900 text-white border-stone-900 shadow-md` 
            : `bg-white text-stone-600 border-stone-200/60 hover:border-amber-300 hover:text-stone-900`
        }`}
      >
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isActive ? 'text-amber-500' : colorClass}`} />
          <span className="truncate">{label}</span>
        </div>
        {count !== undefined && count > 0 && (
          <span className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-sans font-black rounded-full shrink-0 transition-colors ${
            isActive
              ? `bg-amber-500 text-stone-950`
              : `bg-stone-100 text-stone-500 group-hover:bg-amber-50 group-hover:text-amber-600`
          }`}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-8 space-y-3 sm:space-y-8 animate-in fade-in duration-500">
      
      <div className="space-y-4 sm:space-y-6">
        {/* Dashboard Menu Bar */}
        <div className="bg-white p-3 sm:p-6 rounded-2xl sm:rounded-[2.5rem] border border-stone-200 shadow-xl shadow-stone-200/20 space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
              <button
                onClick={() => setIsMenuOpen(prev => !prev)}
                className="p-2 sm:p-3 bg-stone-900 text-amber-500 hover:bg-stone-800 rounded-xl sm:rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-center shrink-0 border border-stone-800 group"
                title="Dashboard Menu"
              >
                <Menu className="w-4 h-4 sm:w-6 sm:h-6 stroke-[2.5] group-hover:scale-110 transition-transform" />
              </button>

              <button 
                onClick={() => {
                  handleTabChange('default');
                  setIsMenuOpen(false);
                }}
                className="text-left group min-w-0"
              >
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h2 className="text-sm sm:text-2xl font-black text-stone-900 uppercase italic tracking-tight group-hover:text-amber-600 transition-colors truncate">
                    Dashboard Menu
                  </h2>
                  <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                </div>
                <p className="text-[10px] sm:text-xs font-bold text-stone-400 uppercase tracking-wider truncate">
                  {activeTab === 'default' ? 'Default Display Results' : `Active: ${getTabLabel(activeTab)}`}
                </p>
              </button>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {activeTab !== 'default' && (
                <button
                  onClick={() => {
                    handleTabChange('default');
                    setIsMenuOpen(false);
                  }}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all"
                >
                  Default View
                </button>
              )}
              <button
                onClick={() => setIsMenuOpen(prev => !prev)}
                className="px-2.5 py-2 sm:px-4 sm:py-3 bg-amber-500 text-stone-950 hover:bg-amber-400 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-wider sm:tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-1.5 shrink-0"
              >
                <Menu className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-950 stroke-[2.5]" />
                <span>{isMenuOpen ? 'Hide Menu' : 'Open Menu'}</span>
              </button>
            </div>
          </div>

          {/* Expanded Menu Options */}
          {isMenuOpen && (
            <div className="pt-3 border-t border-stone-100 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between mb-2.5 px-1">
                <span className="text-[9px] sm:text-xs font-black text-stone-400 uppercase tracking-widest">
                  Click a button to open section under Dashboard Menu:
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-2.5">
                <TabItem id="default" label="Default View" icon={BarChart3} colorClass="text-amber-500" />
                <TabItem id="badge_activities" label="Badges" icon={ShieldCheck} colorClass="text-purple-500" />
                <TabItem id="all" label="All listings" icon={Grid} colorClass="text-stone-400" />
                <TabItem id="live" label="Live listings" icon={CheckCircle} colorClass="text-emerald-500" />
                <TabItem id="bookings" label="Bookings" icon={Clock} colorClass="text-amber-500" />
                <TabItem id="sold" label="Sold out" icon={Package} colorClass="text-stone-700" />
                <TabItem id="purchases" label="Purchase" icon={ShoppingBag} colorClass="text-blue-500" />
                <TabItem id="favorites" label="Saved" icon={Heart} colorClass="text-red-500" />
                <TabItem id="audit_log" label="Audit log" icon={History} colorClass="text-stone-500" />
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    navigate('/messages');
                  }}
                  className="flex items-center justify-between gap-1.5 sm:gap-2.5 w-full px-2.5 py-2 sm:px-4 sm:py-3 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest transition-all border-2 border-stone-200/60 hover:border-amber-300 text-stone-600 hover:text-stone-900 bg-white active:scale-95 text-left group"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                    <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-amber-500" />
                    <span className="truncate">Messages</span>
                  </div>
                  {chatCount > 0 && (
                    <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-sans font-black rounded-full shrink-0 bg-stone-100 text-stone-500 group-hover:bg-amber-50 group-hover:text-amber-600">
                      {chatCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dashboard Content */}
        <div className="space-y-4 sm:space-y-6">
          {loading ? (
            <div className="py-20 text-center flex flex-col items-center justify-center bg-white rounded-[2rem] border border-stone-100 shadow-xl shadow-stone-200/20">
                <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
                <p className="text-stone-400 font-bold uppercase tracking-widest text-xs">Syncing Mandi Stats...</p>
            </div>
          ) : (
        <>
          {/* TOP SUMMARY CARDS & PERFORMANCE - Default Display Results */}
          {activeTab === 'default' && (
            <>
              {/* Merchant Analytics Hub Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-6 bg-white p-3.5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-stone-100 shadow-xl shadow-stone-200/20 relative overflow-hidden mb-4 sm:mb-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none translate-y-1/2 -translate-x-1/4" />
                
                <div className="relative z-10 space-y-1">
                  <div className="flex items-center gap-2 sm:gap-3 mb-0.5">
                    <div className="w-7 h-7 sm:w-10 sm:h-10 bg-stone-900 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-md">
                      <BarChart3 className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-amber-500" />
                    </div>
                    <h1 className="text-sm sm:text-3xl font-black text-stone-900 tracking-tight uppercase italic leading-none">
                      Merchant <span className="text-amber-500">Analytics Hub</span>
                    </h1>
                  </div>
                  <p className="text-stone-400 font-medium text-[10px] sm:text-sm max-w-md">
                    Real-time performance metrics and strategic insights for your Mandi storefront.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-6">
                <div className="bg-white p-3 sm:p-7 rounded-2xl sm:rounded-[2rem] border border-stone-100 shadow-sm flex flex-col group hover:border-amber-200 hover:shadow-xl hover:shadow-stone-200/30 transition-all duration-300">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                    <div className="p-1.5 sm:p-2.5 bg-emerald-50 rounded-lg sm:rounded-xl group-hover:bg-emerald-100 transition-colors">
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
                    </div>
                    <span className="font-black text-[10px] sm:text-xs text-stone-400 uppercase tracking-wider sm:tracking-widest leading-tight">Active<br /> Listings</span>
                  </div>
                  <span className="text-2xl sm:text-5xl font-black text-stone-900 leading-none mb-1 group-hover:text-emerald-600 transition-colors tracking-tighter">{stats.active}</span>
                  <span className="text-[10px] sm:text-xs font-bold text-stone-400 uppercase truncate">Live Marketplace</span>
                </div>
                
                <div className="bg-white p-3 sm:p-7 rounded-2xl sm:rounded-[2rem] border border-stone-100 shadow-sm flex flex-col group hover:border-amber-200 hover:shadow-xl hover:shadow-stone-200/30 transition-all duration-300">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                    <div className="p-1.5 sm:p-2.5 bg-blue-50 rounded-lg sm:rounded-xl group-hover:bg-blue-100 transition-colors">
                      <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                    </div>
                    <span className="font-black text-[10px] sm:text-xs text-stone-400 uppercase tracking-wider sm:tracking-widest leading-tight">Total<br /> Traffic</span>
                  </div>
                  <span className="text-2xl sm:text-5xl font-black text-stone-900 leading-none mb-1 group-hover:text-blue-600 transition-colors tracking-tighter">{stats.views}</span>
                  <span className="text-[10px] sm:text-xs font-bold text-stone-400 uppercase truncate">Customer Impressions</span>
                </div>

                <div className="bg-white p-3 sm:p-7 rounded-2xl sm:rounded-[2rem] border border-stone-100 shadow-sm flex flex-col group hover:border-amber-200 hover:shadow-xl hover:shadow-stone-200/30 transition-all duration-300">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                    <div className="p-1.5 sm:p-2.5 bg-purple-50 rounded-lg sm:rounded-xl group-hover:bg-purple-100 transition-colors">
                       <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />
                    </div>
                    <span className="font-black text-[10px] sm:text-xs text-stone-400 uppercase tracking-wider sm:tracking-widest leading-tight">Direct<br /> Inquiries</span>
                  </div>
                  <span className="text-2xl sm:text-5xl font-black text-stone-900 leading-none mb-1 group-hover:text-purple-600 transition-colors tracking-tighter">{stats.chats}</span>
                  <span className="text-[10px] sm:text-xs font-bold text-stone-400 uppercase truncate">Verified Chat Leads</span>
                </div>

                <div className="bg-stone-950 p-3 sm:p-7 rounded-2xl sm:rounded-[2rem] border border-stone-800 shadow-2xl shadow-stone-900/40 flex flex-col text-white group hover:scale-[1.02] transition-all duration-300">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                    <div className="p-1.5 sm:p-2.5 bg-amber-500 rounded-lg sm:rounded-xl shadow-lg shadow-amber-500/20">
                      <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-stone-950 fill-stone-950" />
                    </div>
                    <span className="font-black text-[10px] sm:text-xs text-stone-400 uppercase tracking-wider sm:tracking-widest leading-tight">Premium<br /> Exposure</span>
                  </div>
                  <span className="text-2xl sm:text-5xl font-black text-amber-500 leading-none mb-1 tracking-tighter">{stats.featured}</span>
                  <span className="text-[10px] sm:text-xs font-black text-stone-400 uppercase truncate">Featured Active</span>
                </div>
              </div>

              {/* 30-Day Trends Chart */}
              <div className="bg-white p-4 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-stone-100 shadow-xl shadow-stone-200/20 mb-4 sm:mb-8 mt-4 sm:mt-8">
                <div className="flex items-center justify-between mb-4 sm:mb-8">
                  <div>
                    <h2 className="text-base sm:text-xl font-black text-stone-900 uppercase italic tracking-tighter">
                      Listing Trends
                    </h2>
                    <p className="text-xs sm:text-sm font-medium text-stone-500 mt-0.5 sm:mt-1">
                      Views and inquiries over the last 30 days
                    </p>
                  </div>
                  <div className="p-2 sm:p-3 bg-stone-100 rounded-xl sm:rounded-2xl">
                    <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6 text-stone-400" />
                  </div>
                </div>
                <div className="h-48 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
                    <LineChart data={performanceData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 9, fill: '#a8a29e', fontWeight: 700 }}
                        dy={5}
                        interval="preserveStartEnd"
                        minTickGap={15}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 9, fill: '#a8a29e', fontWeight: 700 }}
                      />
                      <RechartsTooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #f5f5f4', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', padding: '8px' }}
                        itemStyle={{ fontSize: '11px', fontWeight: 900 }}
                        labelStyle={{ fontSize: '10px', fontWeight: 700, color: '#78716c', marginBottom: '2px' }}
                      />
                      <Line 
                        type="monotone" 
                        name="Views"
                        dataKey="views" 
                        stroke="#0ea5e9" 
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }}
                      />
                      <Line 
                        type="monotone" 
                        name="Inquiries"
                        dataKey="inquiries" 
                        stroke="#8b5cf6" 
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 5, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* MAIN ANALYTICS CONTENT */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
                
                {/* ANALYTICS SECTION */}
                <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-stone-100 shadow-xl shadow-stone-200/20 p-8 sm:p-10 flex flex-col">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-10 gap-4">
                    <div className="space-y-1">
                      <h2 className="text-2xl font-black text-stone-900 uppercase italic tracking-tighter flex items-center gap-3">
                        <TrendingUp className="w-7 h-7 text-amber-500"/> Performance Insights
                      </h2>
                      <p className="text-stone-400 text-xs font-bold uppercase tracking-widest ml-10">Sales & Visibility Analytics</p>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-2 bg-stone-50 rounded-2xl border border-stone-100 shadow-sm">
                       <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                       <span className="text-xs font-black text-stone-900 uppercase tracking-widest">Real-time Data</span>
                    </div>
                  </div>
                  
                  {/* Truthful Data Summary Indicator */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-stone-50 p-3.5 sm:p-4 rounded-2xl border border-stone-100 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-violet-500 shrink-0" />
                      <span className="font-black text-stone-800 uppercase tracking-wider">30-Day Orders & Inquiries</span>
                    </div>
                    <div className="text-stone-500 font-medium text-[11px]">
                      💡 Cumulative Listing Views: <strong className="text-stone-900 font-black">{stats.views}</strong> <span className="text-stone-400 font-normal">(Daily view snapshot logging inactive)</span>
                    </div>
                  </div>

                  <div className="h-80 mb-10 select-none">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 1, height: 1 }}>
                      <LineChart data={performanceData}>
                        <defs>
                          <linearGradient id="inquiriesGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="5 5" opacity={0.1} vertical={false} stroke="#444" />
                        <XAxis 
                           dataKey="name" 
                           axisLine={false} 
                           tickLine={false} 
                           tick={{fill: '#a8a29e', fontSize: 11, fontWeight: 800}} 
                           dy={20} 
                        />
                        <YAxis 
                           axisLine={false} 
                           tickLine={false} 
                           allowDecimals={false}
                           tick={{fill: '#a8a29e', fontSize: 11, fontWeight: 800}} 
                        />
                        <RechartsTooltip 
                           contentStyle={{borderRadius: '24px', border: '1px solid #f1f5f9', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '16px', backgroundColor: '#fff'}} 
                           itemStyle={{fontWeight: 900, textTransform: 'uppercase', fontSize: '12px'}}
                           labelStyle={{fontWeight: 900, marginBottom: '8px', color: '#1c1917'}}
                           cursor={{stroke: '#8b5cf6', strokeWidth: 3, strokeDasharray: '6 6'}}
                        />
                        <Line 
                           type="monotone" 
                           name="Inquiries / Orders"
                           dataKey="inquiries" 
                           stroke="#8b5cf6" 
                           strokeWidth={5} 
                           dot={{r: 6, fill: '#8b5cf6', strokeWidth: 3, stroke: '#fff'}} 
                           activeDot={{r: 9, stroke: '#8b5cf6', strokeWidth: 4, fill: '#fff'}} 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-stone-950 border border-stone-800 p-8 rounded-[2rem] flex flex-col sm:flex-row items-start gap-6 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-[60px] rounded-full group-hover:scale-150 transition-transform duration-700" />
                    <div className="bg-amber-500 p-3.5 rounded-2xl shrink-0 shadow-lg shadow-amber-500/20 relative z-10">
                       <Zap className="w-6 h-6 text-stone-950 fill-stone-950" />
                    </div>
                    <div className="relative z-10 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-black text-white uppercase text-base tracking-tighter italic">Mandi AI Strategic Advisor</h4>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {aiAdvisorInsight.highlight}
                        </span>
                      </div>
                      <p className="text-sm text-stone-300 leading-relaxed font-medium">
                        {aiAdvisorInsight.text}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SIDEBAR TIPS & PROMOTIONS */}
                <div className="space-y-8">
                  <div className="bg-stone-900 text-stone-100 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:rotate-12 transition-transform duration-700">
                        <CheckCircle className="w-32 h-32" />
                     </div>
                     <h3 className="font-black text-xl mb-6 text-white uppercase italic tracking-tighter flex items-center gap-2">
                        <Rocket className="w-5 h-5 text-amber-500" /> Pro Selling Tips
                     </h3>
                     <ul className="space-y-5 relative z-10">
                       {[
                         { id: 1, text: "High-quality photos increase trust by 70%." },
                         { id: 2, text: "Accurate item weight reduces shipping disputes." },
                         { id: 3, text: "Featured ads stay on top for up to 30 days." }
                       ].map(tip => (
                         <li key={tip.id} className="flex gap-4">
                           <span className="w-6 h-6 shrink-0 bg-stone-800 rounded-lg flex items-center justify-center text-xs font-black text-amber-500 border border-stone-700">{tip.id}</span>
                           <span className="text-sm text-stone-300 font-medium leading-tight">{tip.text}</span>
                         </li>
                       ))}
                     </ul>
                  </div>
                  
                  <div className="bg-white rounded-[2rem] border border-stone-100 p-8 flex flex-col justify-center text-center shadow-sm hover:border-amber-300 transition-colors relative overflow-hidden group">
                     <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 -skew-x-12 translate-x-1/2 rounded-full" />
                     <Zap className="w-12 h-12 text-amber-500 mx-auto mb-4 group-hover:scale-110 transition-transform duration-500 fill-amber-500" />
                     <h3 className="font-black text-xl text-stone-900 mb-2 uppercase tracking-tighter italic">Boost Your Sales</h3>
                     <p className="text-sm text-stone-400 mb-6 font-medium px-4">Move your listings to the summit of Mandi.pk and double your reach instantly.</p>
                     <Link to="/boosts" className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-black py-4 rounded-2xl transition-all shadow-lg active:scale-95 text-xs uppercase tracking-widest">
                        Explore Promotions
                     </Link>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* MY LISTINGS QUICK HORIZONTAL ROW ON DEFAULT TAB */}
          {activeTab === 'default' && listings.length > 0 && (
            <div className="bg-white p-6 sm:p-8 rounded-[2rem] border border-stone-100 shadow-xl shadow-stone-200/20 space-y-6 mt-8">
              <div className="flex items-center justify-between gap-3">
                 <div>
                    <h3 className="text-lg sm:text-2xl font-black text-stone-900 uppercase italic tracking-tighter flex items-center gap-2 sm:gap-2.5">
                       <Store className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500 shrink-0" /> My Listings Overview
                    </h3>
                    <p className="text-[10px] sm:text-xs font-bold text-stone-400 uppercase tracking-widest mt-0.5">
                       {listings.length} active listings
                    </p>
                 </div>
                 <button
                    onClick={() => {
                       setActiveTab('all');
                       setIsExploreMode(true);
                       setSearchParams({ tab: 'all' });
                    }}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all shrink-0 cursor-pointer"
                 >
                    <Compass className="w-4 h-4 stroke-[2.5]" />
                    <span>Explore</span>
                 </button>
              </div>

              <div className="relative w-full group/overview-listings">
                 {/* Left Scroll Arrow */}
                 <button 
                   onClick={() => handleListingsScroll('left')}
                   className="absolute -left-2 sm:-left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 border-2 border-stone-200 hover:border-amber-500 shadow-xl flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 transition-all flex active:scale-95 cursor-pointer"
                   aria-label="Scroll Left"
                 >
                   <ChevronLeft className="w-5 h-5 font-black" />
                 </button>

                 <div 
                   ref={listingsScrollRef}
                   onMouseDown={handleListingsMouseDown}
                   onMouseLeave={handleListingsMouseLeave}
                   onMouseUp={handleListingsMouseUp}
                   onMouseMove={handleListingsMouseMove}
                   className="flex flex-row overflow-x-auto gap-3.5 sm:gap-5 pb-5 pt-1 scrollbar-thin [scrollbar-width:thin] overflow-y-hidden max-w-full scroll-smooth select-none"
                 >
                   {listings.map(listing => (
                     <div key={`overview-${listing.id}`} className="relative group/wrapper shrink-0 w-[185px] xs:w-[210px] sm:w-[235px]">
                       <ListingCard 
                         listing={listing} 
                         onUpdate={() => setRefresh(r => r + 1)}
                         dark={false}
                       />
                       <div className="absolute top-2 right-2 bg-white/95 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] font-black text-stone-900 flex items-center gap-1.5 border border-stone-100 shadow-lg opacity-0 group-hover/wrapper:opacity-100 transition-all scale-95 group-hover/wrapper:scale-100 pointer-events-none z-30 uppercase tracking-widest">
                         <span className="flex items-center gap-1"><Eye className="w-2.5 h-2.5 text-blue-500 stroke-[3]"/> {listing.views || 0}</span>
                         <span className="text-stone-300 font-normal">|</span>
                         <span className="flex items-center gap-1"><Heart className="w-2.5 h-2.5 text-red-500 fill-red-500"/> {listing.saves || 0}</span>
                       </div>
                     </div>
                   ))}

                   {/* Explore All Card */}
                   <div 
                     onClick={() => {
                       setActiveTab('all');
                       setIsExploreMode(true);
                       setSearchParams({ tab: 'all' });
                     }}
                     className="w-[160px] xs:w-[180px] sm:w-[200px] shrink-0 bg-stone-900 text-white rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-amber-500 hover:text-stone-950 transition-all border border-stone-800 shadow-lg group/explorecard my-1"
                   >
                     <div className="w-12 h-12 rounded-full bg-stone-800 group-hover/explorecard:bg-stone-950/20 flex items-center justify-center mb-3 transition-colors">
                       <Compass className="w-6 h-6 text-amber-400 group-hover/explorecard:text-stone-950 transition-colors" />
                     </div>
                     <span className="font-black text-xs sm:text-sm uppercase italic tracking-wider leading-tight mb-1">Explore All</span>
                     <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 group-hover/explorecard:text-stone-900 transition-colors">
                       {listings.length} {listings.length === 1 ? 'item' : 'items'} in grid
                     </span>
                     <div className="mt-3 px-3 py-1 bg-amber-500 group-hover/explorecard:bg-stone-950 text-stone-950 group-hover/explorecard:text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                       <span>Open View</span>
                       <ArrowRight className="w-3 h-3" />
                     </div>
                   </div>
                 </div>

                 {/* Right Scroll Arrow */}
                 <button 
                   onClick={() => handleListingsScroll('right')}
                   className="absolute -right-2 sm:-right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 border-2 border-stone-200 hover:border-amber-500 shadow-xl flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 transition-all flex active:scale-95 cursor-pointer"
                   aria-label="Scroll Right"
                 >
                   <ChevronRight className="w-5 h-5 font-black" />
                 </button>
              </div>
            </div>
          )}

          {/* LISTINGS MANAGEMENT & OTHER SECTIONS */}
          {activeTab !== 'default' && (
            <div className="pt-8">
              {['all', 'live', 'sold', 'favorites'].includes(activeTab) && !isExploreMode && (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 px-2">
                   <div>
                      <h2 className="text-2xl sm:text-3xl font-black text-stone-900 uppercase italic tracking-tighter leading-none mb-1">
                        {activeTab === 'all' && <>All <span className="text-amber-500">Listings</span></>}
                        {activeTab === 'live' && <>Live <span className="text-emerald-500">Listings</span></>}
                        {activeTab === 'sold' && <>Sold <span className="text-stone-500">Out</span></>}
                        {activeTab === 'favorites' && <>Saved <span className="text-red-500">Items</span></>}
                      </h2>
                      <div className="flex items-center gap-2">
                         <span className="h-0.5 w-10 bg-stone-900 rounded-full" />
                         <span className="text-[11px] font-black text-stone-400 uppercase tracking-widest">
                           {currentCategoryListings.length} {currentCategoryListings.length === 1 ? 'item' : 'items'} • Swipe left/right or click Explore
                         </span>
                      </div>
                   </div>
                   <div className="flex items-center gap-2.5 w-full sm:w-auto">
                      <div className="relative group flex-1 sm:flex-none">
                         <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-amber-500 transition-colors" />
                         <input 
                           type="text" 
                           value={searchTerm}
                           onChange={(e) => setSearchTerm(e.target.value)}
                           placeholder="Find in category..." 
                           className="pl-10 pr-8 py-2 bg-stone-100 border border-stone-200/60 rounded-xl text-xs font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/30 w-full sm:w-56 transition-all"
                         />
                         {searchTerm && (
                           <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700">
                             <X className="w-3.5 h-3.5" />
                           </button>
                         )}
                      </div>
                      <button
                        onClick={() => setIsExploreMode(true)}
                        className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all shrink-0 cursor-pointer"
                      >
                        <Compass className="w-4 h-4 stroke-[2.5]" />
                        <span>Explore All</span>
                      </button>
                   </div>
                </div>
              )}

            {activeTab === 'badge_activities' ? (
               <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* New Sub-Navigation Row */}
                  <div className="flex flex-col sm:flex-row p-1.5 bg-stone-100 rounded-[24px] sm:rounded-full w-full max-w-lg mx-auto border border-stone-200/50 gap-1.5 sm:gap-0">
                    <button
                      onClick={() => setBadgeSubTab('badges')}
                      className={`flex-1 py-3 sm:py-3.5 rounded-2xl sm:rounded-[18px] text-xs font-black uppercase tracking-widest sm:tracking-[0.2em] transition-all flex items-center justify-center gap-2 sm:gap-2.5 group active:scale-95 ${
                        badgeSubTab === 'badges' 
                          ? 'bg-amber-500 text-stone-950 border border-amber-400 shadow-lg shadow-amber-500/25' 
                          : 'text-stone-400 hover:text-amber-600 hover:bg-amber-50/60'
                      }`}
                    >
                      <Award className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:scale-110 ${badgeSubTab === 'badges' ? 'text-stone-950' : 'text-stone-400 group-hover:text-amber-500'}`} />
                      Badges
                    </button>
                    <button
                      onClick={() => setBadgeSubTab('status')}
                      className={`flex-1 py-3 sm:py-3.5 rounded-2xl sm:rounded-[18px] text-xs font-black uppercase tracking-widest sm:tracking-[0.2em] transition-all flex items-center justify-center gap-2 sm:gap-2.5 group active:scale-95 ${
                        badgeSubTab === 'status' 
                          ? 'bg-emerald-600 text-white border border-emerald-500 shadow-lg shadow-emerald-600/25' 
                          : 'text-stone-400 hover:text-emerald-600 hover:bg-emerald-50/60'
                      }`}
                    >
                      <ListChecks className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:scale-110 ${badgeSubTab === 'status' ? 'text-white' : 'text-stone-400 group-hover:text-emerald-500'}`} />
                      Badges Status
                    </button>
                    <button
                      onClick={() => {
                        setBadgeSubTab('history');
                      }}
                      className={`flex-1 py-3 sm:py-3.5 rounded-2xl sm:rounded-[18px] text-xs font-black uppercase tracking-widest sm:tracking-[0.2em] transition-all flex items-center justify-center gap-2 sm:gap-2.5 group active:scale-95 ${
                        badgeSubTab === 'history' 
                          ? 'bg-purple-600 text-white border border-purple-550 shadow-lg shadow-purple-600/25' 
                          : 'text-stone-400 hover:text-purple-600 hover:bg-purple-50/60'
                      }`}
                    >
                      <History className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:scale-110 ${badgeSubTab === 'history' ? 'text-white' : 'text-stone-400 group-hover:text-purple-500'}`} />
                      History Logs
                    </button>
                  </div>

                  {badgeSubTab === 'badges' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
                      <button 
                        onClick={() => navigate('/premium')}
                        className="bg-white p-4 sm:p-8 rounded-2xl sm:rounded-[32px] border border-stone-200 shadow-sm hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/10 transition-all flex flex-row sm:flex-col items-center text-left sm:text-center group active:scale-[0.98] gap-4 sm:gap-0"
                      >
                        <div className="shrink-0 w-12 h-12 sm:w-16 sm:h-16 bg-emerald-100 rounded-xl sm:rounded-[20px] flex items-center justify-center sm:mb-5 group-hover:scale-110 transition-transform">
                          <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-stone-900 uppercase italic tracking-tight mb-1 sm:mb-2">Premium Seller Badge</h3>
                          <p className="text-xs font-bold text-stone-400 leading-tight">Gain peer trust with the golden badge platform-wide.</p>
                        </div>
                      </button>

                      <button 
                        onClick={() => navigate('/featured')}
                        className="bg-white p-4 sm:p-8 rounded-2xl sm:rounded-[32px] border border-stone-200 shadow-sm hover:border-amber-500 hover:shadow-xl hover:shadow-amber-500/10 transition-all flex flex-row sm:flex-col items-center text-left sm:text-center group active:scale-[0.98] gap-4 sm:gap-0"
                      >
                        <div className="shrink-0 w-12 h-12 sm:w-16 sm:h-16 bg-amber-100 rounded-xl sm:rounded-[20px] flex items-center justify-center sm:mb-5 group-hover:scale-110 transition-transform">
                          <Star className="w-6 h-6 sm:w-8 sm:h-8 text-amber-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-stone-900 uppercase italic tracking-tight mb-1 sm:mb-2">Featured Ads</h3>
                          <p className="text-xs font-bold text-stone-400 leading-tight">Place your listings in the spotlight of the homepage.</p>
                        </div>
                      </button>

                      <button 
                        onClick={() => navigate('/boosts')}
                        className="bg-white p-4 sm:p-8 rounded-2xl sm:rounded-[32px] border border-stone-200 shadow-sm hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/10 transition-all flex flex-row sm:flex-col items-center text-left sm:text-center group active:scale-[0.98] gap-4 sm:gap-0"
                      >
                        <div className="shrink-0 w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 rounded-xl sm:rounded-[20px] flex items-center justify-center sm:mb-5 group-hover:scale-110 transition-transform">
                          <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-stone-900 uppercase italic tracking-tight mb-1 sm:mb-2">Boosted Ads Badge</h3>
                          <p className="text-xs font-bold text-stone-400 leading-tight">Double your ad reach with powerful priority placement.</p>
                        </div>
                      </button>
                    </div>
                  ) : badgeSubTab === 'status' ? (
                    <div className="bg-white p-5 sm:p-10 rounded-3xl sm:rounded-[40px] border border-stone-200 shadow-xl overflow-hidden relative">
                      <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-5">
                        <BadgeCheck className="w-24 h-24 sm:w-40 sm:h-40" />
                      </div>
                      
                      <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-10 pb-4 sm:pb-6 border-b border-stone-100">
                        <div className="shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-stone-900 rounded-xl sm:rounded-[18px] flex items-center justify-center">
                          <ShieldCheck className="w-5 h-5 sm:w-7 sm:h-7 text-amber-500" />
                        </div>
                        <div>
                          <h3 className="text-lg sm:text-2xl font-black text-stone-900 uppercase italic tracking-tighter leading-tight sm:leading-none mb-0.5">Verification & Badge</h3>
                          <p className="text-xs sm:text-xs font-bold text-stone-400">Official Status Tracking Center</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                        {/* KYC Status Card */}
                        <div 
                          onClick={() => navigate('/profile?tab=kyc')}
                          className="cursor-pointer flex flex-col justify-between p-4 sm:p-6 bg-stone-50 rounded-[20px] sm:rounded-[24px] border border-stone-100 group hover:border-amber-500 hover:bg-amber-50/40 transition-all active:scale-[0.98]"
                        >
                          <div className="flex items-start gap-3 sm:gap-4">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-lg sm:rounded-xl shadow-sm border border-stone-100 flex items-center justify-center text-stone-400 group-hover:text-amber-500 transition-colors shrink-0">
                              <User className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="space-y-1 sm:space-y-1.5 flex-1 text-left">
                              <p className="text-xs sm:text-xs font-black text-stone-400 uppercase tracking-widest leading-none mb-1">Identity Check</p>
                              <p className="text-xs sm:text-sm font-black text-stone-900">1. KYC Verification</p>
                              <p className="text-xs sm:text-xs font-semibold text-stone-400 font-sans leading-tight">
                                Complete verification of official legal identifier documents.
                              </p>
                            </div>
                          </div>
                          
                          <div className="mt-4 sm:mt-6 pt-3 sm:pt-3.5 border-t border-stone-200/60 flex items-center justify-between">
                            <span className="text-xs sm:text-xs font-black text-stone-400 uppercase tracking-wider">Badge Status:</span>
                            {(() => {
                              const kyc = getKycStatus();
                              if (kyc.text === 'approved') {
                                return (
                                  <span className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-xs font-black uppercase tracking-wider bg-emerald-50 text-green-600 border border-emerald-200">
                                    approved
                                  </span>
                                );
                              } else {
                                return (
                                  <span className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-xs font-black uppercase tracking-wider bg-stone-200 text-stone-400 border border-stone-300">
                                    Inactive
                                  </span>
                                );
                              }
                            })()}
                          </div>
                        </div>

                        {/* Premium Status Card */}
                        <div 
                          onClick={() => navigate('/premium')}
                          className="cursor-pointer flex flex-col justify-between p-4 sm:p-6 bg-stone-50 rounded-[20px] sm:rounded-[24px] border border-stone-100 group hover:border-emerald-500 hover:bg-emerald-50/40 transition-all active:scale-[0.98]"
                        >
                          <div className="flex items-start gap-3 sm:gap-4">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-lg sm:rounded-xl shadow-sm border border-stone-100 flex items-center justify-center text-stone-400 group-hover:text-emerald-500 transition-colors shrink-0">
                              <Award className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="space-y-1 sm:space-y-1.5 flex-1 text-left">
                              <p className="text-xs sm:text-xs font-black text-stone-400 uppercase tracking-widest leading-none mb-1">2. Elite Status</p>
                              <p className="text-xs sm:text-sm font-black text-stone-900">Premium Seller Badge</p>
                              <p className="text-xs sm:text-xs font-semibold text-stone-400 font-sans leading-tight">
                                Official certified golden trust badge issued on premium terms.
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 sm:mt-6 pt-3 sm:pt-3.5 border-t border-stone-200/60 flex items-center justify-between">
                            <span className="text-xs sm:text-xs font-black text-stone-400 uppercase tracking-wider">Badge Status:</span>
                            {(() => {
                              const elite = getEliteStatus();
                              if (elite.text === 'active') {
                                return (
                                  <span className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-xs font-black uppercase tracking-wider bg-emerald-50 text-green-600 border border-emerald-200">
                                    active
                                  </span>
                                );
                              } else if (elite.text === 'revoked') {
                                return (
                                  <span className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-xs font-black uppercase tracking-wider bg-red-50 text-red-650 border border-red-200">
                                    revoked
                                  </span>
                                );
                              } else {
                                return (
                                  <span className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-xs font-black uppercase tracking-wider bg-stone-200 text-stone-400 border border-stone-300">
                                    Inactive
                                  </span>
                                );
                              }
                            })()}
                          </div>
                        </div>

                        {/* Featured Status Card */}
                        <div className="flex flex-col justify-between p-4 sm:p-6 bg-stone-50 rounded-[20px] sm:rounded-[24px] border border-stone-100 group hover:border-amber-500/50 transition-all">
                          <div className="flex items-start gap-3 sm:gap-4 w-full">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-lg sm:rounded-xl shadow-sm border border-stone-100 flex items-center justify-center text-stone-400 group-hover:text-amber-500 transition-colors shrink-0">
                              <Star className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="space-y-1 sm:space-y-1.5 flex-1 text-left w-full">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs sm:text-xs font-black text-stone-400 uppercase tracking-widest leading-none mb-1">3. Visibility Upgrade</p>
                                <button
                                  type="button"
                                  onClick={() => navigate('/featured')}
                                  className="text-[10px] font-black uppercase text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-md transition-colors shrink-0"
                                >
                                  Manage →
                                </button>
                              </div>
                              <p className="text-xs sm:text-sm font-black text-stone-900">Featured Ads Badge</p>
                              <div className="text-xs sm:text-xs font-bold text-stone-550 space-y-1.5 sm:space-y-2 block mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-stone-200/60 w-full">
                                <div className="flex justify-between items-center bg-white p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-stone-200/70">
                                  <span className="text-stone-400 font-semibold pr-2">Total live items</span>
                                  <span className="font-extrabold text-stone-900 text-xs sm:text-xs px-2 sm:px-2.5 py-0.5 bg-stone-100 rounded-md sm:rounded-lg shrink-0">{liveCount}</span>
                                </div>
                                <div className="flex justify-between items-start bg-white p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-stone-200/70 gap-2">
                                  <span className="text-stone-400 font-semibold leading-tight mt-0.5">Live with Featured</span>
                                  <span className="font-extrabold text-amber-600 text-xs sm:text-xs px-2 sm:px-2.5 py-0.5 bg-amber-50 rounded-md sm:rounded-lg shrink-0">{liveFeaturedCount}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Featured Badge Listings */}
                          <div className="mt-4 pt-3 border-t border-stone-200/60 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-black uppercase text-stone-500 tracking-wider">Featured Items ({featuredBadgeListings.length})</p>
                              {featuredBadgeListings.length > 0 && (
                                <span className="text-[9px] font-bold uppercase text-stone-400 bg-stone-200/60 px-1.5 py-0.5 rounded">Active & Past</span>
                              )}
                            </div>

                            {featuredBadgeListings.length === 0 ? (
                              <div className="bg-white p-3 rounded-xl border border-dashed border-stone-200 text-center">
                                <p className="text-xs text-stone-400 font-medium">No featured badge items found</p>
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
                                {featuredBadgeListings.map(item => (
                                  <div 
                                    key={`feat-item-${item.id}`}
                                    className="bg-white p-2.5 rounded-xl border border-stone-200/80 hover:border-amber-400/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <img 
                                        src={item.images?.[0] || 'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=200'} 
                                        alt={item.title} 
                                        className="w-10 h-10 rounded-lg object-cover shrink-0 border border-stone-100"
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <h5 className="font-black text-stone-900 text-xs truncate max-w-[130px] sm:max-w-[160px]">{item.title}</h5>
                                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                            item.badgeActive 
                                              ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                                              : 'bg-stone-100 text-stone-500 border border-stone-200'
                                          }`}>
                                            {item.badgeLabel}
                                          </span>
                                        </div>
                                        <p className="text-[11px] font-bold text-stone-500 mt-0.5">
                                          {formatPKR(item.price, item.currencySymbol || item.currency)}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Stats & Actions */}
                                    <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                                      <div className="flex items-center gap-1.5">
                                        <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-extrabold text-stone-600 bg-stone-100 px-2 py-1 rounded-lg" title="Total Views">
                                          <Eye className="w-3 h-3 text-blue-500 shrink-0" />
                                          <span>{item.views || item.viewsCount || 0}</span>
                                        </span>

                                        <button 
                                          type="button"
                                          onClick={(e) => handleShareListing(e, item)}
                                          className="flex items-center gap-1 text-[10px] sm:text-[11px] font-extrabold text-stone-700 bg-stone-100 hover:bg-amber-100 hover:text-amber-900 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                          title="Share Listing"
                                        >
                                          <Share2 className="w-3 h-3 text-amber-500 shrink-0" />
                                          <span>{item.shares || 0}</span>
                                        </button>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/listing/${item.id}`);
                                        }}
                                        className="bg-stone-900 hover:bg-amber-500 hover:text-stone-900 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                                      >
                                        <span>View</span>
                                        <ArrowUpRight className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Boosted Status Card */}
                        <div className="flex flex-col justify-between p-4 sm:p-6 bg-stone-50 rounded-[20px] sm:rounded-[24px] border border-stone-100 group hover:border-blue-500/50 transition-all">
                          <div className="flex items-start gap-3 sm:gap-4 w-full">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-lg sm:rounded-xl shadow-sm border border-stone-100 flex items-center justify-center text-stone-400 group-hover:text-blue-500 transition-colors shrink-0">
                              <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="space-y-1 sm:space-y-1.5 flex-1 text-left w-full">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs sm:text-xs font-black text-stone-400 uppercase tracking-widest leading-none mb-1">4. Growth Accelerator</p>
                                <button
                                  type="button"
                                  onClick={() => navigate('/boosts')}
                                  className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors shrink-0"
                                >
                                  Manage →
                                </button>
                              </div>
                              <p className="text-xs sm:text-sm font-black text-stone-900">Boosted Ads Badge</p>
                              <div className="text-xs sm:text-xs font-bold text-stone-550 space-y-1.5 sm:space-y-2 block mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-stone-200/60 w-full">
                                <div className="flex justify-between items-center bg-white p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-stone-200/70">
                                  <span className="text-stone-400 font-semibold pr-2">Total live items</span>
                                  <span className="font-extrabold text-stone-900 text-xs sm:text-xs px-2 sm:px-2.5 py-0.5 bg-stone-100 rounded-md sm:rounded-lg shrink-0">{liveCount}</span>
                                </div>
                                <div className="flex justify-between items-start bg-white p-2 sm:p-2.5 rounded-lg sm:rounded-xl border border-stone-200/70 gap-2">
                                  <span className="text-stone-400 font-semibold leading-tight mt-0.5">Live with Boosted</span>
                                  <span className="font-extrabold text-blue-600 text-xs sm:text-xs px-2 sm:px-2.5 py-0.5 bg-blue-50 rounded-md sm:rounded-lg shrink-0">{liveBoostedCount}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Boosted Badge Listings */}
                          <div className="mt-4 pt-3 border-t border-stone-200/60 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-black uppercase text-stone-500 tracking-wider">Boosted Items ({boostedBadgeListings.length})</p>
                              {boostedBadgeListings.length > 0 && (
                                <span className="text-[9px] font-bold uppercase text-stone-400 bg-stone-200/60 px-1.5 py-0.5 rounded">Active & Past</span>
                              )}
                            </div>

                            {boostedBadgeListings.length === 0 ? (
                              <div className="bg-white p-3 rounded-xl border border-dashed border-stone-200 text-center">
                                <p className="text-xs text-stone-400 font-medium">No boosted badge items found</p>
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
                                {boostedBadgeListings.map(item => (
                                  <div 
                                    key={`boost-item-${item.id}`}
                                    className="bg-white p-2.5 rounded-xl border border-stone-200/80 hover:border-blue-400/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <img 
                                        src={item.images?.[0] || 'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=200'} 
                                        alt={item.title} 
                                        className="w-10 h-10 rounded-lg object-cover shrink-0 border border-stone-100"
                                      />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <h5 className="font-black text-stone-900 text-xs truncate max-w-[130px] sm:max-w-[160px]">{item.title}</h5>
                                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                            item.badgeActive 
                                              ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                                              : 'bg-stone-100 text-stone-500 border border-stone-200'
                                          }`}>
                                            {item.badgeLabel}
                                          </span>
                                        </div>
                                        <p className="text-[11px] font-bold text-stone-500 mt-0.5">
                                          {formatPKR(item.price, item.currencySymbol || item.currency)}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Stats & Actions */}
                                    <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                                      <div className="flex items-center gap-1.5">
                                        <span className="flex items-center gap-1 text-[10px] sm:text-[11px] font-extrabold text-stone-600 bg-stone-100 px-2 py-1 rounded-lg" title="Total Views">
                                          <Eye className="w-3 h-3 text-blue-500 shrink-0" />
                                          <span>{item.views || item.viewsCount || 0}</span>
                                        </span>

                                        <button 
                                          type="button"
                                          onClick={(e) => handleShareListing(e, item)}
                                          className="flex items-center gap-1 text-[10px] sm:text-[11px] font-extrabold text-stone-700 bg-stone-100 hover:bg-blue-100 hover:text-blue-900 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                                          title="Share Listing"
                                        >
                                          <Share2 className="w-3 h-3 text-blue-500 shrink-0" />
                                          <span>{item.shares || 0}</span>
                                        </button>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/listing/${item.id}`);
                                        }}
                                        className="bg-stone-900 hover:bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                                      >
                                        <span>View</span>
                                        <ArrowUpRight className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-stone-100 flex justify-center">
                        <button 
                          onClick={() => {
                            setBadgeSubTab('history');
                          }}
                          className="text-xs sm:text-xs font-black text-stone-400 uppercase tracking-widest hover:text-amber-500 flex items-center gap-1.5 sm:gap-2 group transition-colors px-2 text-center"
                        >
                          <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:rotate-12 transition-transform shrink-0" />
                          <span>View Detailed Application History & Audit Logs</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <BadgeActivities user={user} />
                  )}
               </div>
            ) : activeTab === 'audit_log' ? (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-stone-100 rounded-2xl flex items-center justify-center">
                    <History className="w-5 h-5 text-stone-500" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight uppercase italic">
                    Audit Log
                  </h2>
                </div>
                {allPromotions.length === 0 ? (
                  <div className="bg-white p-12 rounded-[2.5rem] border border-stone-100 text-center">
                    <History className="w-16 h-16 text-stone-200 mx-auto mb-4" />
                    <h3 className="text-lg font-black text-stone-900 uppercase tracking-tighter mb-2">No Records</h3>
                    <p className="text-sm text-stone-400 font-medium max-w-sm mx-auto">
                      No promotion requests or status changes have been recorded for your listings yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {allPromotions.map((promo) => (
                      <div key={promo.id} className="bg-white p-5 rounded-2xl border border-stone-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">
                            {promo.createdAt?.toDate ? promo.createdAt.toDate().toLocaleDateString() : 'N/A'} - {promo.type}
                          </span>
                          <span className="font-black text-stone-900">{promo.planName || 'Badge Request'}</span>
                          {promo.status === 'REJECTED' && promo.rejectionReason && (
                            <span className="text-xs text-red-600 mt-1.5 font-medium bg-red-50 p-2 rounded-lg border border-red-100 inline-block">
                              Reason: {promo.rejectionReason}
                            </span>
                          )}
                          {promo.verificationStage === 'VERIFIER_DENIED' && promo.paymentDenialReason && (
                            <span className="text-xs text-red-600 mt-1.5 font-medium bg-red-50 p-2 rounded-lg border border-red-100 inline-block">
                              Payment Denied: {promo.paymentDenialReason}
                            </span>
                          )}
                        </div>
                        <div className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-center self-start md:self-auto ${
                          promo.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                          promo.status === 'REJECTED' || promo.verificationStage === 'VERIFIER_DENIED' ? 'bg-red-50 text-red-600 border border-red-100' :
                          promo.status === 'REVOKED' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                          'bg-stone-50 text-stone-500 border border-stone-100'
                        }`}>
                          {promo.status === 'PENDING' && promo.verificationStage === 'SENT_TO_VERIFIERS' ? 'Sent to Verifiers' :
                           promo.status === 'PENDING' && promo.verificationStage === 'VERIFIER_DENIED' ? 'Payment Denied' :
                           promo.status === 'PENDING' && promo.verificationStage === 'PAYMENT_VERIFIED' ? 'Payment Verified' :
                           promo.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : ['all', 'live', 'sold', 'favorites'].includes(activeTab) ? (
               isExploreMode ? (
                 <div className="space-y-6 animate-in fade-in duration-300">
                   <div className="bg-stone-900 text-white p-5 sm:p-8 rounded-2xl sm:rounded-[2.5rem] shadow-xl border border-stone-800 relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[80px] rounded-full pointer-events-none" />
                     
                     <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                       <div>
                         <button
                           onClick={() => setIsExploreMode(false)}
                           className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-stone-800 hover:bg-amber-500 hover:text-stone-950 text-stone-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all mb-4 active:scale-95 cursor-pointer border border-stone-700"
                         >
                           <ChevronLeft className="w-4 h-4" />
                           <span>Back</span>
                         </button>

                         <div className="flex items-center gap-3">
                           <div className="p-2.5 bg-amber-500 text-stone-950 rounded-2xl shrink-0 shadow-lg shadow-amber-500/20">
                             <Compass className="w-6 h-6 stroke-[2.5]" />
                           </div>
                           <div>
                             <h2 className="text-2xl sm:text-4xl font-black uppercase italic tracking-tight text-white leading-none">
                               {activeTab === 'all' && <>Explore <span className="text-amber-500">All Listings</span></>}
                               {activeTab === 'live' && <>Explore <span className="text-emerald-400">Live Listings</span></>}
                               {activeTab === 'sold' && <>Explore <span className="text-stone-400">Sold Out Items</span></>}
                               {activeTab === 'favorites' && <>Explore <span className="text-red-400">Saved Items</span></>}
                             </h2>
                             <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mt-1">
                               All items in this category • Click any item to view full details
                             </p>
                           </div>
                         </div>
                       </div>

                       <div className="flex flex-col sm:items-end gap-2 shrink-0">
                         <span className="px-4 py-2 bg-stone-800 text-amber-400 rounded-xl text-xs font-black uppercase tracking-widest border border-stone-700 inline-block self-start sm:self-auto">
                           {currentFilteredListings.length} {currentFilteredListings.length === 1 ? 'Item' : 'Items'} Available
                         </span>
                       </div>
                     </div>

                     <div className="mt-6 pt-5 border-t border-stone-800/80 flex flex-col sm:flex-row gap-3 items-center justify-between relative z-10">
                       <div className="relative w-full sm:w-80">
                         <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                         <input 
                           type="text" 
                           value={searchTerm}
                           onChange={(e) => setSearchTerm(e.target.value)}
                           placeholder="Filter items in this view..." 
                           className="w-full pl-10 pr-9 py-2.5 bg-stone-800/90 border border-stone-700 rounded-xl text-xs font-bold text-white placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                         />
                         {searchTerm && (
                           <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white">
                             <X className="w-4 h-4" />
                           </button>
                         )}
                       </div>

                       <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider text-center sm:text-right">
                         Active category explore view
                       </span>
                     </div>
                   </div>

                   {currentFilteredListings.length === 0 ? (
                     <div className="py-20 text-center bg-white rounded-3xl border border-stone-100 shadow-sm border-dashed">
                       <Package className="w-16 h-16 text-stone-200 mx-auto mb-4" />
                       <h3 className="text-lg font-black text-stone-900 uppercase italic tracking-tight mb-1">No Listings Found</h3>
                       <p className="text-xs text-stone-400 font-bold uppercase tracking-widest max-w-sm mx-auto">
                         {searchTerm ? `No items matched your search "${searchTerm}"` : 'There are no items currently available in this category.'}
                       </p>
                       {searchTerm && (
                         <button 
                           onClick={() => setSearchTerm('')} 
                           className="mt-4 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-stone-800 transition-all"
                         >
                           Clear Search Filter
                         </button>
                       )}
                     </div>
                   ) : (
                     <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
                       {currentFilteredListings.map(listing => (
                         <div key={listing.id} className="relative group/wrapper hover:scale-[1.02] transition-transform duration-300">
                           <ListingCard 
                             listing={listing} 
                             onUpdate={() => setRefresh(r => r + 1)}
                             dark={false}
                           />
                         </div>
                       ))}
                     </div>
                   )}

                   <div className="flex justify-center pt-6 pb-4">
                     <button
                       onClick={() => setIsExploreMode(false)}
                       className="px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg flex items-center gap-2 active:scale-95 transition-all cursor-pointer"
                     >
                       <ChevronLeft className="w-4 h-4 text-amber-400" />
                       <span>Return to Single Row View</span>
                     </button>
                   </div>
                 </div>
               ) : currentFilteredListings.length === 0 ? (
                 <div className="py-20 text-center bg-white rounded-3xl border border-stone-100 shadow-sm border-dashed">
                   <Package className="w-16 h-16 text-stone-200 mx-auto mb-4" />
                   <p className="text-stone-400 font-bold uppercase tracking-widest text-xs">
                     {searchTerm ? `No items matched "${searchTerm}"` : 'No items found in this category.'}
                   </p>
                 </div>
               ) : (
                 <div className="relative w-full group/listings-container">
                   {/* Left Scroll Arrow */}
                   <button 
                     onClick={() => activeTab === 'favorites' ? handleFavoritesScroll('left') : handleListingsScroll('left')}
                     className="absolute -left-1 sm:-left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 border-2 border-stone-200 hover:border-amber-500 shadow-xl flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 transition-all flex active:scale-95 cursor-pointer"
                     aria-label="Scroll Left"
                   >
                     <ChevronLeft className="w-5 h-5 font-black" />
                   </button>

                   <div 
                     ref={activeTab === 'favorites' ? favoritesScrollRef : listingsScrollRef} 
                     onMouseDown={activeTab === 'favorites' ? handleMouseDown : handleListingsMouseDown}
                     onMouseLeave={activeTab === 'favorites' ? handleMouseLeave : handleListingsMouseLeave}
                     onMouseUp={activeTab === 'favorites' ? handleMouseUp : handleListingsMouseUp}
                     onMouseMove={activeTab === 'favorites' ? handleMouseMove : handleListingsMouseMove}
                     className="flex flex-row overflow-x-auto gap-3.5 sm:gap-5 pb-5 pt-1 scrollbar-thin [scrollbar-width:thin] overflow-y-hidden max-w-full scroll-smooth select-none"
                   >
                     {currentFilteredListings.map(listing => (
                       <div key={listing.id} className="relative group/wrapper shrink-0 w-[185px] xs:w-[210px] sm:w-[235px]">
                         <ListingCard 
                           listing={listing} 
                           onUpdate={() => setRefresh(r => r + 1)}
                           dark={false}
                         />
                         <div className="absolute top-2 right-2 bg-white/95 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] font-black text-stone-900 flex items-center gap-1.5 border border-stone-100 shadow-lg opacity-0 group-hover/wrapper:opacity-100 transition-all scale-95 group-hover/wrapper:scale-100 pointer-events-none z-30 uppercase tracking-widest">
                           <span className="flex items-center gap-1"><Eye className="w-2.5 h-2.5 text-blue-500 stroke-[3]"/> {listing.views || 0}</span>
                           <span className="text-stone-300 font-normal">|</span>
                           <span className="flex items-center gap-1"><Heart className="w-2.5 h-2.5 text-red-500 fill-red-500"/> {listing.saves || 0}</span>
                         </div>
                       </div>
                     ))}

                     {/* Explore All Card */}
                     <div 
                       onClick={() => setIsExploreMode(true)}
                       className="w-[160px] xs:w-[180px] sm:w-[200px] shrink-0 bg-stone-900 text-white rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-amber-500 hover:text-stone-950 transition-all border border-stone-800 shadow-lg group/explorecard my-1"
                     >
                       <div className="w-12 h-12 rounded-full bg-stone-800 group-hover/explorecard:bg-stone-950/20 flex items-center justify-center mb-3 transition-colors">
                         <Compass className="w-6 h-6 text-amber-400 group-hover/explorecard:text-stone-950 transition-colors" />
                       </div>
                       <span className="font-black text-xs sm:text-sm uppercase italic tracking-wider leading-tight mb-1">Explore All</span>
                       <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 group-hover/explorecard:text-stone-900 transition-colors">
                         {currentCategoryListings.length} {currentCategoryListings.length === 1 ? 'item' : 'items'} in grid
                       </span>
                       <div className="mt-3 px-3 py-1 bg-amber-500 group-hover/explorecard:bg-stone-950 text-stone-950 group-hover/explorecard:text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                         <span>Open View</span>
                         <ArrowRight className="w-3 h-3" />
                       </div>
                     </div>
                   </div>

                   {/* Right Scroll Arrow */}
                   <button 
                     onClick={() => activeTab === 'favorites' ? handleFavoritesScroll('right') : handleListingsScroll('right')}
                     className="absolute -right-1 sm:-right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/95 border-2 border-stone-200 hover:border-amber-500 shadow-xl flex items-center justify-center text-stone-700 hover:text-amber-600 hover:bg-stone-50 transition-all flex active:scale-95 cursor-pointer"
                     aria-label="Scroll Right"
                   >
                     <ChevronRight className="w-5 h-5 font-black" />
                   </button>
                 </div>
               )
            ) : activeTab === 'purchases' ? (
               <div className="space-y-6">
                 {/* Section Header */}
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-stone-100 shadow-sm">
                   <div className="flex items-center gap-3.5">
                     <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 border border-blue-100">
                       <ShoppingBag className="w-6 h-6 stroke-[2.5]" />
                     </div>
                     <div>
                       <div className="flex items-center gap-2">
                         <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase italic tracking-tight">
                           Purchase History
                         </h2>
                         <span className="bg-blue-100 text-blue-700 text-xs font-black px-2.5 py-0.5 rounded-full border border-blue-200">
                           {purchasedItems.length} {purchasedItems.length === 1 ? 'Order' : 'Orders'}
                         </span>
                       </div>
                       <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mt-0.5">
                         Track all your past transactions, order status & delivery details
                       </p>
                     </div>
                   </div>
                   <Link 
                     to="/listings" 
                     className="self-start sm:self-auto px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-2"
                   >
                     <span>Explore Marketplace</span>
                     <ArrowRight className="w-4 h-4 text-amber-400" />
                   </Link>
                 </div>

                 {purchasedItems.length === 0 ? (
                   <div className="py-20 text-center bg-white rounded-3xl border border-stone-100 shadow-sm border-dashed">
                      <ShoppingCart className="w-16 h-16 text-stone-200 mx-auto mb-4 animate-bounce" />
                      <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight mb-1">No Purchase History Found</h3>
                      <p className="text-stone-400 font-bold uppercase tracking-widest text-xs max-w-sm mx-auto mb-6">You haven't bought any items on Mandi App yet!</p>
                      <Link to="/listings" className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-widest px-6 py-3 rounded-xl inline-flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all">
                        <span>Browse Available Listings</span>
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                   </div>
                 ) : (
                   <div className="grid grid-cols-1 gap-6">
                      {purchasedItems.map(order => {
                        const statusColors = {
                          PENDING: 'bg-amber-50 text-amber-600 border-amber-200',
                          ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          BOOKED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
                          SHIPPED: 'bg-blue-50 text-blue-700 border-blue-200',
                          READY_TO_TRANSFER: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                          DEAL_DONE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          PAID: 'bg-purple-50 text-purple-700 border-purple-200',
                          SOLD: 'bg-stone-100 text-stone-700 border-stone-300',
                          REJECTED: 'bg-red-50 text-red-600 border-red-200',
                          EXPIRED: 'bg-red-50 text-red-500 border-red-200'
                        };

                        const formattedDate = order.createdAt?.toDate 
                          ? order.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                          : 'Recent Order';

                        return (
                         <div key={order.id} className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200/80 shadow-sm flex flex-col gap-5 hover:border-amber-300 transition-all hover:shadow-md">
                            {/* Card Header Info */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-100">
                              <div className="flex items-center gap-2 text-xs font-bold text-stone-400 uppercase tracking-wider">
                                <Clock className="w-3.5 h-3.5 text-stone-400" />
                                <span>{formattedDate}</span>
                                <span className="text-stone-300">•</span>
                                <span className="font-mono text-stone-500">ID: #{order.id?.slice(0, 8)}</span>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider border ${
                                statusColors[order.status as keyof typeof statusColors] || 'bg-stone-50 text-stone-600 border-stone-200'
                              }`}>
                                Status: {order.status?.replace(/_/g, ' ')}
                              </span>
                              {order.source === 'battle_bids' && (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-stone-950 flex items-center gap-1 shadow-sm">
                                  ⚔️ Battle Bids Auction
                                </span>
                              )}
                            </div>

                            {/* Main Details Grid */}
                            <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
                               <div className="flex gap-4 items-center min-w-0">
                                 <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shadow-inner border border-stone-100 shrink-0 bg-stone-50">
                                    <img src={order.itemImage || order.listingImage} alt={order.itemTitle || order.listingTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                 </div>
                                 <div className="min-w-0">
                                    <Link to={order.source === 'battle_bids' ? `/orders/${order.id}` : `/listings/${order.listingId}`} className="font-black text-stone-900 text-base sm:text-lg leading-tight hover:text-amber-600 transition-colors line-clamp-2">
                                      {order.itemTitle || order.listingTitle}
                                    </Link>
                                    <div className="flex flex-wrap items-center gap-3 mt-2">
                                       <span className="text-emerald-600 font-black text-lg">
                                         {order.source === 'battle_bids' 
                                           ? `${order.currencySymbol || order.currency || 'USD'} ${Number(order.amount || order.totalAmount || 0).toLocaleString()}` 
                                           : formatPKR(order.totalAmount, order.currencySymbol || order.currency)}
                                       </span>
                                       <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2.5 py-1 rounded-lg">Qty: {order.quantity || 1}</span>
                                       {(order.shippingCharges || 0) > 0 && (
                                         <span className="text-xs font-semibold text-stone-400">+ Shipping: {formatPKR(order.shippingCharges, order.currencySymbol || order.currency)}</span>
                                       )}
                                    </div>
                                 </div>
                               </div>

                               <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                                 {order.source === 'battle_bids' ? (
                                   <Link
                                     to={`/orders/${order.id}`}
                                     className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-md active:scale-95 shrink-0"
                                   >
                                     <CreditCard className="w-4 h-4" />
                                     <span>{order.status === 'AWAITING_PAYMENT' ? 'Checkout & Pay' : 'Order & Tracking'}</span>
                                   </Link>
                                 ) : order.status === 'SHIPPED' ? (
                                    <button 
                                      onClick={() => {
                                        if (window.confirm("Confirm that payment has been made / completed for this order?")) {
                                          handleUpdateOrderStatus(order, 'PAID');
                                        }
                                      }}
                                      disabled={actionLoading === order.id}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                    >
                                       <CreditCard className="w-4 h-4" /> 
                                       <span>{actionLoading === order.id ? 'Updating...' : 'Payment Made'}</span>
                                    </button>
                                 ) : null}
                                 <Link 
                                   to={order.source === 'battle_bids' ? `/battle-bids?id=${order.auctionId || order.listingId}` : `/listings/${order.listingId}`} 
                                   className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0"
                                 >
                                   <span>{order.source === 'battle_bids' ? 'View Auction' : 'View Listing'}</span>
                                   <ArrowRight className="w-3.5 h-3.5" />
                                 </Link>
                               </div>
                            </div>

                            {/* Courier / Delivery Details Box if available */}
                            {(order.courierName || order.trackingNumber || order.shippingNotes) && (
                              <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-100 text-xs text-stone-700 space-y-1.5 mt-1">
                                <div className="font-black uppercase tracking-widest text-blue-900 text-[11px] flex items-center gap-1.5 mb-1">
                                  <span>🚚 Shipping & Tracking Details</span>
                                </div>
                                {order.courierName && (
                                  <div><span className="font-bold text-stone-500">Courier:</span> <span className="font-black text-stone-900">{order.courierName}</span></div>
                                )}
                                {order.trackingNumber && (
                                  <div><span className="font-bold text-stone-500">Tracking No:</span> <span className="font-mono font-bold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200 inline-block ml-1">{order.trackingNumber}</span></div>
                                )}
                                {order.shippingNotes && (
                                  <div><span className="font-bold text-stone-500">Notes:</span> {order.shippingNotes}</div>
                                )}
                              </div>
                            )}
                         </div>
                        );
                      })}
                   </div>
                 )}
               </div>
            ) : activeTab === 'bookings' ? (
               <div className="space-y-4">
                  {salesItems.length === 0 ? (
                    <div className="py-20 text-center bg-white rounded-3xl border border-stone-100 shadow-sm border-dashed">
                       <Package className="w-16 h-16 text-stone-200 mx-auto mb-4" />
                       <p className="text-stone-400 font-bold uppercase tracking-widest text-xs">No sales recorded yet.</p>
                       <p className="text-xs text-stone-400 mt-2">Wait for buyers to book your listings!</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       {salesItems.map(order => (
                         <div 
                           key={order.id} 
                           onClick={() => order.source === 'battle_bids' ? navigate(`/orders/${order.id}`) : setSelectedBookingForForm(order)}
                           className="bg-white p-6 rounded-[2rem] border border-stone-100 shadow-sm flex flex-col justify-between gap-5 group hover:border-amber-300 transition-all cursor-pointer hover:shadow-md"
                         >
                            <div className="flex gap-4 items-start">
                               <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-inner border border-stone-100 shrink-0 bg-stone-50">
                                  <img src={order.itemImage || order.listingImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" referrerPolicy="no-referrer" />
                               </div>
                               <div className="flex-grow min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-black text-stone-900 leading-tight truncate text-base">{order.itemTitle || order.listingTitle}</h3>
                                  </div>
                                  <div className="flex items-center gap-3 mb-2">
                                     <span className="text-emerald-600 font-black text-sm">
                                       {order.source === 'battle_bids' 
                                         ? `${order.currencySymbol || order.currency || 'USD'} ${Number(order.amount || order.totalAmount || 0).toLocaleString()}` 
                                         : formatPKR(order.totalAmount, order.currencySymbol || order.currency)}
                                     </span>
                                     <span className="text-xs font-bold text-stone-400 uppercase">Qty: {order.quantity || 1}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    <span className={`px-2 py-0.5 rounded-lg text-xs font-black uppercase tracking-widest ${
                                      order.status === 'PENDING' || order.status === 'AWAITING_PAYMENT' ? 'bg-amber-50 text-amber-500 border border-amber-100' :
                                      order.status === 'PAYMENT_REVIEW' ? 'bg-blue-50 text-blue-600 border border-blue-200 animate-pulse font-black' :
                                      order.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 font-black' :
                                      order.status === 'BOOKED' ? 'bg-emerald-100 text-emerald-700' :
                                      order.status === 'ACCEPTED' ? 'bg-amber-100 text-amber-600 border border-amber-200 animate-pulse' :
                                      order.status === 'SHIPPED' ? 'bg-blue-100 text-blue-600' :
                                      order.status === 'READY_TO_TRANSFER' ? 'bg-indigo-50 border border-indigo-100 text-indigo-700' :
                                      order.status === 'DEAL_DONE' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold' :
                                      order.status === 'REJECTED' || order.status === 'EXPIRED' || order.status === 'PAYMENT_EXPIRED' ? 'bg-red-50 text-red-500 border border-red-100' :
                                      'bg-emerald-100 text-emerald-600'
                                    }`}>
                                      {order.status.replace(/_/g, ' ')}
                                    </span>
                                    {order.source === 'battle_bids' && (
                                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500 text-stone-950 flex items-center gap-1 shadow-sm">
                                        ⚔️ Battle Bids
                                      </span>
                                    )}
                                  </div>
                               </div>
                             </div>

                             <div className="border-t border-stone-100 pt-3.5 flex items-center justify-between gap-2">
                               <div className="text-left font-mono text-xs text-stone-400 font-bold truncate">
                                  Buyer: {order.buyerName || 'Winning Bidder'}
                                </div>
                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                  {order.source === 'battle_bids' ? (
                                    <button 
                                      onClick={() => navigate(`/orders/${order.id}`)}
                                      className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-4 py-2 rounded-xl transition-all text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95"
                                    >
                                      <Package className="w-3.5 h-3.5" /> Manage Settlement
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => setSelectedBookingForForm(order)}
                                      className="bg-stone-900 hover:bg-amber-500 hover:text-stone-950 text-white font-black px-4 py-2 rounded-xl transition-all text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95"
                                    >
                                      <ListChecks className="w-3.5 h-3.5" /> Manage Form
                                    </button>
                                  )}
                                  <Link 
                                    to={order.source === 'battle_bids' ? `/battle-bids?id=${order.auctionId || order.listingId}` : `/listings/${order.listingId}`} 
                                    className="p-2 bg-stone-50 rounded-xl text-stone-400 hover:text-amber-500 hover:bg-amber-50 transition-all"
                                  >
                                     <ArrowRight className="w-4 h-4" />
                                  </Link>
                                </div>
                            </div>
                         </div>
                       ))}
                    </div>
                  )}
               </div>
            ) : null}
          </div>
        )}
      </>
      )}
    </div>
    </div>
      {confirmAction && (
        <div className="fixed inset-0 bg-stone-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl max-w-sm w-full shadow-2xl">
              <h3 className="text-xl font-black mb-4 uppercase italic tracking-tighter">Confirm {confirmAction.action}</h3>
              <p className="text-stone-600 mb-6 font-medium">Are you sure you want to {confirmAction.action.toLowerCase()} this order?</p>
              <div className="flex gap-4">
                <button onClick={() => setConfirmAction(null)} className="flex-1 bg-stone-100 text-stone-900 py-3 rounded-xl font-bold uppercase text-xs tracking-widest hover:bg-stone-200 transition-colors">Cancel</button>
                <button 
                  onClick={() => {
                    if (confirmAction.action === 'ACCEPT') handleUpdateOrderStatus(confirmAction.order, 'ACCEPTED');
                    else handleRejectOrder(confirmAction.order);
                    setConfirmAction(null);
                  }} 
                  className={`flex-1 ${confirmAction.action === 'ACCEPT' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'} text-white py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl transition-all`}>
                  Yes, {confirmAction.action}
                </button>
              </div>
          </div>
        </div>
      )}

      {openOrderDetails && (
        <div id="booking-form-overlay" className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div id="booking-form-modal" className="bg-white rounded-[2rem] max-w-4xl w-full shadow-2xl overflow-hidden my-8 border border-stone-100 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-stone-50 px-6 py-5 sm:px-8 sm:py-6 border-b border-stone-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-stone-950">
                  <ListChecks className="w-5 h-5 font-black animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-stone-900 tracking-tight leading-none uppercase italic">Book Your Order Activity Form</h3>
                  <p className="text-xs font-bold text-stone-400 mt-1">Order ID: <span className="font-mono text-stone-600 font-bold">{openOrderDetails.id}</span></p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedBookingForForm(null)}
                className="p-2 hover:bg-stone-200 rounded-full transition-colors text-stone-400 hover:text-stone-900"
                aria-label="Close Booking Form"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 max-h-[75vh] overflow-y-auto">
              {/* Left Column: Booking & Buyer Information (grid-span 5) */}
              <div className="lg:col-span-5 space-y-6">
                {/* Item Details Card */}
                <div className="bg-stone-50 rounded-2xl p-4 border border-stone-100 flex gap-4 items-center">
                  <div className="w-20 h-20 bg-stone-100 rounded-xl border border-stone-200 overflow-hidden shrink-0">
                    <img src={openOrderDetails.listingImage} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <h4 className="font-black text-stone-900 text-sm leading-tight line-clamp-2">{openOrderDetails.listingTitle}</h4>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-amber-600 font-extrabold text-sm">{formatPKR(openOrderDetails.unitPrice, openOrderDetails.currencySymbol || openOrderDetails.currency)}</span>
                      <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Qty: {openOrderDetails.quantity}</span>
                    </div>
                  </div>
                </div>

                {/* Bill Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-stone-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-stone-400" /> Bill Receipt
                  </h4>
                  <div className="bg-stone-50 border border-stone-100 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between text-xs font-medium text-stone-400">
                      <span>Subtotal</span>
                      <span className="font-bold text-stone-700">{formatPKR(openOrderDetails.unitPrice * openOrderDetails.quantity, openOrderDetails.currencySymbol || openOrderDetails.currency)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium text-stone-400">
                      <span>Delivery Charges</span>
                      <span className="font-bold text-stone-700">{formatPKR(openOrderDetails.shippingCharges || 0, openOrderDetails.currencySymbol || openOrderDetails.currency)}</span>
                    </div>
                    <div className="h-px bg-stone-200 my-1"></div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-stone-800 uppercase tracking-widest">Grand Total</span>
                      <span className="text-lg font-black text-stone-900">{formatPKR(openOrderDetails.totalAmount, openOrderDetails.currencySymbol || openOrderDetails.currency)}</span>
                    </div>
                    <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg py-1 px-3 text-xs font-bold inline-block uppercase tracking-wider">
                      Cash On Delivery (COD)
                    </div>
                  </div>
                </div>

                {/* Buyer Details */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-stone-400 uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-stone-400" /> Delivery Address & Buyer Info
                  </h4>
                  <div className="bg-stone-50 border border-stone-100 rounded-2xl p-4 space-y-3">
                    <div>
                      <span className="text-xs font-extrabold text-stone-400 uppercase tracking-wider">Full Name</span>
                      <p className="text-sm font-black text-stone-900">{openOrderDetails.buyerName || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-xs font-extrabold text-stone-400 uppercase tracking-wider">Contact Number</span>
                      <p className="text-sm font-bold text-stone-800 flex items-center gap-2">
                        {openOrderDetails.buyerContact || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-extrabold text-stone-400 uppercase tracking-wider">Delivery Address</span>
                      <p className="text-xs font-medium text-stone-700 leading-relaxed bg-white border border-stone-100 rounded-xl p-2.5 mt-1 font-mono break-all whitespace-pre-wrap">
                        {openOrderDetails.buyerAddress || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Booking Path Activity & Form Execution (grid-span 7) */}
              <div className="lg:col-span-7 space-y-6 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-black text-stone-400 uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                    <History className="w-3.5 h-3.5 text-stone-400" /> Start-To-End Booking Activity Timeline
                  </h4>

                  {/* Vertical Timeline Tracker */}
                  <div className="relative pl-6 space-y-5 border-l-2 border-dashed border-stone-200 ml-3">
                    
                    {/* Activity State 1: Start (Placed Booking) */}
                    <div className="relative">
                      <span className="absolute -left-[31px] top-1 bg-emerald-500 text-white rounded-full p-1 z-10 [box-shadow:0_0_0_4px_rgba(16,185,129,0.15)]">
                        <CheckCircle className="w-3.5 h-3.5" />
                      </span>
                      <div>
                        <h5 className="text-xs font-black text-stone-900 uppercase">1. Booking Placed by Buyer</h5>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {parseDate(openOrderDetails.createdAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-stone-400 mt-1">
                          Buyer offered Cash On Delivery trade terms for this item.
                        </p>
                      </div>
                    </div>

                    {/* Activity State 2: Acceptance choice */}
                    <div className="relative">
                      {openOrderDetails.status === 'REJECTED' ? (
                        <>
                          <span className="absolute -left-[31px] top-1 bg-red-500 text-white rounded-full p-1 z-10 [box-shadow:0_0_0_4px_rgba(239,68,68,0.15)]">
                            <XCircle className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <h5 className="text-xs font-black text-red-600 uppercase">2. Order Rejected by Seller</h5>
                            <p className="text-xs text-stone-400 mt-0.5">
                              {openOrderDetails.updatedAt ? parseDate(openOrderDetails.updatedAt).toLocaleString() : ''}
                            </p>
                          </div>
                        </>
                      ) : openOrderDetails.status === 'EXPIRED' ? (
                        <>
                          <span className="absolute -left-[31px] top-1 bg-stone-400 text-white rounded-full p-1 z-10">
                            <Clock className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <h5 className="text-xs font-black text-stone-400 uppercase">2. Booking Expired (Timeout)</h5>
                            <p className="text-xs text-stone-400 mt-0.5">
                              {openOrderDetails.updatedAt ? parseDate(openOrderDetails.updatedAt).toLocaleString() : ''}
                            </p>
                          </div>
                        </>
                      ) : ['PENDING'].includes(openOrderDetails.status) ? (
                        <>
                          <span className="absolute -left-[31px] top-1 bg-amber-500 text-stone-950 rounded-full p-1 z-10 animate-pulse [box-shadow:0_0_0_4px_rgba(245,158,11,0.25)]">
                            <Clock className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <h5 className="text-xs font-black text-stone-800 uppercase">2. Pending Decisions (Current Step)</h5>
                            <p className="text-xs text-amber-600 font-bold mt-1 uppercase tracking-wider">Awaiting Seller Review</p>
                            <div className="flex gap-2.5 mt-3">
                              <button 
                                onClick={async () => {
                                  if (confirm("Are you sure you want to accept this booking?")) {
                                    await handleUpdateOrderStatus(openOrderDetails, 'ACCEPTED');
                                  }
                                }}
                                disabled={actionLoading === openOrderDetails.id}
                                className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-1.5"
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Accept Order
                              </button>
                              <button 
                                onClick={async () => {
                                  if (confirm("Are you sure you want to reject this booking?")) {
                                    await handleUpdateOrderStatus(openOrderDetails, 'REJECTED');
                                  }
                                }}
                                disabled={actionLoading === openOrderDetails.id}
                                className="bg-red-50 hover:bg-red-100 active:scale-95 text-red-600 text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all border border-red-100 flex items-center gap-1.5"
                              >
                                <XCircle className="w-3.5 h-3.5" /> Reject Order
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="absolute -left-[31px] top-1 bg-emerald-500 text-white rounded-full p-1 z-10 [box-shadow:0_0_0_4px_rgba(16,185,129,0.15)]">
                            <CheckCircle className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <h5 className="text-xs font-black text-stone-900 uppercase">2. Order Accepted</h5>
                            <p className="text-xs text-stone-400 mt-1">Confirmed and accepted for trade.</p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Activity State 3: Dispatched & Handover */}
                    {!['REJECTED', 'EXPIRED'].includes(openOrderDetails.status) && (
                      <div className="relative">
                        {['PENDING'].includes(openOrderDetails.status) ? (
                          <>
                            <span className="absolute -left-[31px] top-1 bg-stone-100 text-stone-300 rounded-full p-1 z-10">
                              <Truck className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <h5 className="text-xs font-bold text-stone-400 uppercase">3. Shipment / Courier Dispatch</h5>
                              <p className="text-xs text-stone-300 mt-0.5">Accept order first to unlock shipping.</p>
                            </div>
                          </>
                        ) : ['ACCEPTED', 'BOOKED'].includes(openOrderDetails.status) ? (
                          <>
                            <span className="absolute -left-[31px] top-1 bg-amber-500 text-stone-950 rounded-full p-1 z-10 animate-pulse [box-shadow:0_0_0_4px_rgba(245,158,11,0.25)]">
                              <Truck className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <h5 className="text-xs font-black text-stone-800 uppercase">3. Shipping / Handover execution (Current Step)</h5>
                              <p className="text-xs text-stone-400 mt-1">Fill out the fast courier details below to dispatch shipment, or skip directly to transfer handover.</p>

                              {/* Shipment Form Fields inside the single form */}
                              <div className="mt-4 bg-stone-50 border border-stone-200/60 p-4 rounded-2xl space-y-3.5">
                                <h6 className="text-xs font-black text-stone-400 uppercase tracking-widest flex items-center gap-1.5"><Truck className="w-3 h-3" /> Courier dispatch information</h6>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-black text-stone-400 uppercase tracking-wider mb-1">Courier Service</label>
                                    <input 
                                      type="text" 
                                      value={courierName} 
                                      onChange={(e) => setCourierName(e.target.value)} 
                                      placeholder="e.g. Leopard, TCS, Postal" 
                                      className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-black text-stone-400 uppercase tracking-wider mb-1">Tracking ID / CN Number</label>
                                    <input 
                                      type="text" 
                                      value={trackingNumber} 
                                      onChange={(e) => setTrackingNumber(e.target.value)} 
                                      placeholder="e.g. LE57204910" 
                                      className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-xs font-black text-stone-400 uppercase tracking-wider mb-1 font-bold">Dispatch / Instruction Notes</label>
                                  <input 
                                    type="text" 
                                    value={shippingNotes} 
                                    onChange={(e) => setShippingNotes(e.target.value)} 
                                    placeholder="e.g. Handle with care, deliver in afternoon" 
                                    className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                  />
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <button 
                                    onClick={() => handleShipOrderWithDetails(openOrderDetails)}
                                    disabled={actionLoading === openOrderDetails.id}
                                    className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-stone-950 font-black px-4 py-2 rounded-xl transition-all shadow-md text-xs uppercase tracking-wider flex items-center gap-1.5"
                                  >
                                    <Truck className="w-3.5 h-3.5" /> Dispatch Shipment
                                  </button>
                                  <button 
                                    onClick={() => {
                                     if (window.confirm("Are you sure you want to mark this order as ready for transfer?")) {
                                       handleUpdateOrderStatus(openOrderDetails, 'READY_TO_TRANSFER');
                                     }
                                   }}
                                    disabled={actionLoading === openOrderDetails.id}
                                    className="bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-800 font-bold px-4 py-2 rounded-xl transition-all border border-stone-200 text-xs uppercase tracking-wider flex items-center gap-1.5"
                                  >
                                    <Package className="w-3.5 h-3.5" /> Ready to Handover
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="absolute -left-[31px] top-1 bg-emerald-500 text-white rounded-full p-1 z-10 [box-shadow:0_0_0_4px_rgba(16,185,129,0.15)]">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <h5 className="text-xs font-black text-stone-900 uppercase">3. Dispatched / Handover Ready</h5>
                              {openOrderDetails.courierName && (
                                <div className="mt-2 text-xs bg-stone-50 border border-stone-100 p-2.5 rounded-xl space-y-1">
                                  <p className="font-bold text-stone-700">Courier: <span className="text-amber-600 font-extrabold">{openOrderDetails.courierName}</span></p>
                                  <p className="font-bold text-stone-700">Tracking Code: <span className="font-mono text-stone-600 font-bold">{openOrderDetails.trackingNumber || 'N/A'}</span></p>
                                  {openOrderDetails.shippingNotes && (
                                    <p className="text-xs text-stone-400 mt-1 italic">Note: "{openOrderDetails.shippingNotes}"</p>
                                  )}
                                </div>
                              )}
                              {!openOrderDetails.courierName && openOrderDetails.status === 'READY_TO_TRANSFER' && (
                                <p className="text-xs text-stone-400 mt-1">Item marked as ready for direct handoff/transfer with buyer.</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Activity State 4: Deal Finalized */}
                    {!['REJECTED', 'EXPIRED'].includes(openOrderDetails.status) && (
                      <div className="relative">
                        {['PENDING', 'ACCEPTED', 'BOOKED'].includes(openOrderDetails.status) ? (
                          <>
                            <span className="absolute -left-[31px] top-1 bg-stone-100 text-stone-300 rounded-full p-1 z-10">
                              <BadgeCheck className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <h5 className="text-xs font-bold text-stone-400 uppercase">4. Deal Done / Payments Collected</h5>
                              <p className="text-xs text-stone-300 mt-0.5">Deliver shipment to settle booking.</p>
                            </div>
                          </>
                        ) : ['SHIPPED', 'READY_TO_TRANSFER'].includes(openOrderDetails.status) ? (
                          <>
                            <span className="absolute -left-[31px] top-1 bg-amber-500 text-stone-950 rounded-full p-1 z-10 animate-pulse [box-shadow:0_0_0_4px_rgba(245,158,11,0.25)]">
                              <BadgeCheck className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <h5 className="text-xs font-black text-stone-800 uppercase">4. Settle Deal & Confirm Cash (Current Step)</h5>
                              <p className="text-xs text-stone-400 mt-1">Mark this booking deal as fully done once cash payment is received from the buyer.</p>
                              <div className="flex gap-2 mt-3">
                                <button 
                                  onClick={() => {
                                    if (window.confirm("Are you sure the deal is done and payment is collected?")) {
                                      handleUpdateOrderStatus(openOrderDetails, 'DEAL_DONE');
                                    }
                                  }}
                                  disabled={actionLoading === openOrderDetails.id}
                                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-black px-6 py-2.5 rounded-xl transition-all shadow-md text-xs uppercase tracking-widest flex items-center gap-1.5 active:scale-95"
                                >
                                  <BadgeCheck className="w-4 h-4" /> Deal Done (Paid)
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="absolute -left-[31px] top-1 bg-emerald-500 text-white rounded-full p-1 z-10 [box-shadow:0_0_0_4px_rgba(16,185,129,0.15)]">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <h5 className="text-xs font-black text-stone-900 uppercase">4. Deal Finalized successfully</h5>
                              <p className="text-xs text-stone-400 mt-0.5">Payment successfully processed and transaction cleared.</p>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Activity State 5: Completion End / Permanent Sold Out */}
                    {!['REJECTED', 'EXPIRED'].includes(openOrderDetails.status) && (
                      <div className="relative">
                        {['PENDING', 'ACCEPTED', 'BOOKED', 'SHIPPED', 'READY_TO_TRANSFER'].includes(openOrderDetails.status) ? (
                          <>
                            <span className="absolute -left-[31px] top-1 bg-stone-100 text-stone-300 rounded-full p-1 z-10">
                              <Package className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <h5 className="text-xs font-bold text-stone-400 uppercase">5. Settle Stock / Sold Out (End)</h5>
                              <p className="text-xs text-stone-300 mt-0.5">Completes all inventories permanently.</p>
                            </div>
                          </>
                        ) : ['DEAL_DONE', 'PAID'].includes(openOrderDetails.status) ? (
                          <>
                            <span className="absolute -left-[31px] top-1 bg-amber-500 text-stone-950 rounded-full p-1 z-10 animate-pulse [box-shadow:0_0_0_4px_rgba(245,158,11,0.25)]">
                              <Package className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <h5 className="text-xs font-black text-stone-800 uppercase">5. Finalize Inventory Stock (Current Step)</h5>
                              <p className="text-xs text-stone-400 mt-1">Permanently deplete the stock inventory and mark the listing matching this order as sold out.</p>
                              <div className="flex gap-2 mt-3">
                                <button 
                                  onClick={() => {
                                    if (window.confirm("Are you sure you want to finalize this as sold out? This will permanently deplete stock.")) {
                                      handleUpdateOrderStatus(openOrderDetails, 'SOLD');
                                    }
                                  }}
                                  disabled={actionLoading === openOrderDetails.id}
                                  className="bg-stone-900 hover:bg-stone-800 text-white font-black px-6 py-2.5 rounded-xl transition-all shadow-md text-xs uppercase tracking-widest flex items-center gap-1.5 active:scale-95"
                                >
                                  <Package className="w-4 h-4" /> Finalize as Sold Out
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="absolute -left-[31px] top-1 bg-emerald-600 text-white rounded-full p-1.5 z-10 [box-shadow:0_0_0_4px_rgba(5,150,105,0.15)]">
                              <BadgeCheck className="w-4 h-4 font-black" />
                            </span>
                            <div>
                              <h5 className="text-xs font-black text-stone-900 uppercase">5. Trade Completed & Closed</h5>
                              <p className="text-xs text-emerald-600 font-extrabold uppercase mt-0.5 tracking-wider">Perfect Settle Checkmark ✓</p>
                              <p className="text-xs text-stone-400 mt-1">This listing booking is closed. No further stock actions needed.</p>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                  </div>
                </div>

                {/* Footer Status Display */}
                <div className="mt-8 border-t border-stone-100 pt-6 flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest">Active State:</span>
                    <span className="bg-stone-100 border border-stone-200 text-stone-800 text-xs font-black px-3 py-1 rounded-lg uppercase italic tracking-wider">
                      {openOrderDetails.status}
                    </span>
                  </div>
                  <button 
                    onClick={() => setSelectedBookingForForm(null)}
                    className="w-full sm:w-auto bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold px-6 py-2.5 rounded-xl transition-colors text-xs uppercase tracking-widest text-center"
                  >
                    Done / Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
