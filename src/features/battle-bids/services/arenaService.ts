import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  onSnapshot, 
  serverTimestamp, 
  orderBy, 
  limit, 
  increment, 
  runTransaction, 
  writeBatch,
  arrayUnion,
  Timestamp,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  collectionGroup,
  documentId
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../../lib/firebase';
import { AuctionItem, Bid, ArenaUserStats, ArenaSellerProfile, CreateAuctionInput } from '../types';
import { PerformanceMonitor } from '../utils/performanceMonitor';
import { ArenaImageUtils } from '../utils/image';
import { getFallbackSellerProfile } from '../utils/fallbackProfile';
import { UserProfile } from '../../../types';
import { parseSafeDate } from '../utils/arena';
import { AuditLogService } from './auditLogService';
import { isDemoCreditModeActive, DemoCreditsService, CreditsService } from '../../credits';
import { calculateTrustTier, clampTrustScore, INITIAL_TRUST_SCORE } from '../../trust-score/types';
import { isUserBanned } from '../../../services/userService';
import { resolveAuthoritativeVerification } from '../../../lib/verificationResolver';

export const BATTLE_BIDS_PAYMENT_DEADLINE_HOURS = 48;
export const DEFAULT_MY_AUCTIONS_PAGE_SIZE = 12;

/**
 * Return type for paginated inventory queries.
 */
export interface PaginatedAuctionResult {
  items: AuctionItem[];
  lastVisible?: QueryDocumentSnapshot<DocumentData>;
  hasMore: boolean;
}

/**
 * Service layer for Battle Bids Arena.
 * Handles interactions with Firestore and real-time updates.
 */
export const ArenaService = {
  /**
   * Internal map to track submission times for anti-spam protection.
   */
  _lastActionTimes: new Map<string, number>(),

  /**
   * Fast in-memory cache for auction items to ensure instant page opens.
   */
  _auctionCache: new Map<string, { item: AuctionItem; timestamp: number }>(),

  cacheAuction(item: AuctionItem) {
    if (!item?.id) return;
    this._auctionCache.set(item.id, { item, timestamp: Date.now() });
  },

  getCachedAuction(auctionId: string): AuctionItem | null {
    if (!auctionId) return null;
    const entry = this._auctionCache.get(auctionId);
    if (entry && Date.now() - entry.timestamp < 120000) {
      return entry.item;
    }
    return null;
  },

  /**
   * Fetches active auction items with pagination support.
   */
  async getActiveAuctions(pageSize: number = 12, lastDoc?: QueryDocumentSnapshot<DocumentData>): Promise<{ items: AuctionItem[], lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
    return PerformanceMonitor.track('getActiveAuctions', async () => {
      try {
        let q = query(
          collection(db, 'arena_auctions'),
          where('status', '==', 'active'),
          orderBy('endTime', 'asc'),
          limit(pageSize)
        );

        if (lastDoc) {
          q = query(q, startAfter(lastDoc));
        }

        const snapshot = await getDocs(q);
        const items = snapshot.docs.map(doc => this.mapDocToAuction(doc));
        const nextLastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

        return { items, lastDoc: nextLastDoc };
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'arena_auctions');
        return { items: [], lastDoc: null };
      }
    });
  },

  /**
   * Fetches a single auction by ID.
   */
  async getAuction(auctionId: string): Promise<AuctionItem | null> {
    const cached = this.getCachedAuction(auctionId);
    if (cached) return cached;

    try {
      const docRef = doc(db, 'arena_auctions', auctionId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return null;
      const item = this.mapDocToAuction(snapshot);
      this.cacheAuction(item);
      return item;
    } catch (err) {
      if (cached) return cached;
      handleFirestoreError(err, OperationType.GET, `arena_auctions/${auctionId}`);
      return null;
    }
  },

  /**
   * Subscribes to real-time updates for a specific auction.
   */
  subscribeToAuction(auctionId: string, callback: (auction: AuctionItem | null) => void) {
    const cached = this.getCachedAuction(auctionId);
    if (cached) {
      callback(cached);
    }
    const docRef = doc(db, 'arena_auctions', auctionId);
    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const item = this.mapDocToAuction(snapshot);
        this.cacheAuction(item);
        callback(item);
      } else {
        callback(null);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `arena_auctions/${auctionId}`);
    });
  },

  /**
   * Subscribes to real-time updates for bids on a specific auction.
   */
  subscribeToBids(auctionId: string, callback: (bids: Bid[]) => void) {
    const q = query(
      collection(db, 'arena_auctions', auctionId, 'bids'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    return onSnapshot(q, (snapshot) => {
      const bids = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: parseSafeDate(doc.data().timestamp)
      } as Bid));
      callback(bids);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `arena_auctions/${auctionId}/bids`);
    });
  },

  /**
   * Submits a new bid with sniping protection, credit validation/deduction, and security hardening.
   */
  async submitBid(bid: Omit<Bid, 'id' | 'timestamp'>): Promise<void> {
    const actionKey = `bid_${bid.userId}_${bid.auctionId}`;
    const nowTime = Date.now();
    const lastTime = this._lastActionTimes.get(actionKey) || 0;

    // Security: Anti-spam protection (1s throttle)
    if (nowTime - lastTime < 1000) {
      throw new Error("Strategic engagement frequency exceeded. Please wait.");
    }
    this._lastActionTimes.set(actionKey, nowTime);

    return PerformanceMonitor.track('submitBid', async () => {
      try {
        const auctionRef = doc(db, 'arena_auctions', bid.auctionId);
        const userRef = doc(db, 'users', bid.userId);
        
        await runTransaction(db, async (transaction) => {
          // READ PHASE (Must occur before writes)
          const auctionDoc = await transaction.get(auctionRef);
          if (!auctionDoc.exists()) throw new Error("Auction not found");
          
          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists()) throw new Error("UNAUTHORIZED: User profile not found");

          const auctionData = auctionDoc.data() as AuctionItem;
          const userData = userDoc.data() as UserProfile;

          // Validation: Blocked or Banned status check
          const isBannedUser = 
            isUserBanned(userData) ||
            userData.isBanned === true || 
            (userData as any).accountStatus === 'banned' || 
            (userData as any).status === 'BANNED' || 
            (userData as any).biddingDisabled === true || 
            (userData as any).canBid === false;

          if (userData.isBlocked === true || (userData as any).status === 'blocked' || isBannedUser) {
            throw new Error("RESTRICTED_USER: Your account is currently banned or restricted from submitting bids by administration.");
          }

          const now = new Date();
          const endTime = parseSafeDate(auctionData.endTime);
          
          if (!endTime || isNaN(endTime.getTime())) {
            throw new Error("Action failed: Corrupted or missing auction end time structure.");
          }
          
          // Validation: Bid ownership (Seller cannot bid on own listing)
          const isSeller = Boolean(
            bid.userId === auctionData.sellerId || 
            (userData.id && auctionData.sellerId && userData.id === auctionData.sellerId) ||
            (userData.email && auctionData.sellerId && userData.email.toLowerCase() === auctionData.sellerId.toLowerCase()) ||
            (userData.username && auctionData.sellerName && userData.username.toLowerCase() === auctionData.sellerName.toLowerCase())
          );

          if (isSeller) {
            throw new Error("SELLER_CANNOT_BID: Sellers cannot place bids against their own listed auction items.");
          }

          // Validation: Highest bidder check (Cannot outbid oneself)
          if (auctionData.highestBidderId === bid.userId) {
            throw new Error("ALREADY_HIGHEST_BIDDER: You are already the highest bidder on this combat item.");
          }

          // Validation: Force stopped check
          const isForceStopped = 
            (auctionData.status as string) === 'stopped' || 
            (auctionData.status as string) === 'force_stopped' || 
            (auctionData as any).forceStopped === true || 
            (auctionData as any).isForceStopped === true || 
            (auctionData as any).forceStoppedByAdmin === true ||
            (auctionData as any).closedOnViolation === true;

          if (isForceStopped) {
            throw new Error("AUCTION_FORCE_STOPPED: This item has been force-stopped by the admin due to seller policy violations. Bids are no longer accepted.");
          }

          // Validation: Auction state
          const isAuctionPaused = auctionData.status === 'paused' || auctionData.isPaused === true || (auctionData as any).isPausedBySeller === true;
          if (isAuctionPaused) {
            throw new Error("AUCTION_PAUSED: This listed item is currently paused by the seller. Bids cannot be placed until the seller resumes this listing.");
          }

          if (auctionData.status !== 'active') {
            throw new Error(`INVALID_BID: Auction is not active (Current status: ${auctionData.status})`);
          }

          const minIncrement = auctionData.minIncrement || Math.max(100, Math.floor(auctionData.startingPrice * 0.01));
          const minNextBid = auctionData.currentBid + minIncrement;

          const itemCurrencySymbol = auctionData.currencySymbol || (auctionData.currency ? auctionData.currency : 'Rs.');

          // Security: Bid sequence validation
          if (bid.amount < minNextBid) {
            throw new Error(`INVALID_BID: Bid must be at least ${itemCurrencySymbol} ${minNextBid.toLocaleString()}`);
          }
          
          // Security: Bid timing validation
          if (now > endTime) {
            throw new Error("AUCTION_ENDED: Auction has already ended");
          }

          // Security: Strategic bid limits (Maximum of 10 bids per auction)
          const userBidCounts = auctionData.userBidCounts || {};
          const currentCount = userBidCounts[bid.userId] || 0;
          if (currentCount >= 10) {
            throw new Error("BID_LIMIT_REACHED: Strategic engagement limit exceeded (Maximum of 10 bids allowed per listed item under auction).");
          }

          const isDemo = isDemoCreditModeActive();
          let balanceBefore = 0;
          let balanceAfter = 0;
          let totalCreditsSpent = 0;
          let idempotencyKey = '';
          let txDocRef: any = null;

          if (isDemo) {
            // ISOLATED DEMO CREDIT MODE (No Firestore billing / no Blaze requirement)
            const demoBalance = DemoCreditsService.getDemoBalance(bid.userId);
            if (demoBalance < 1) {
              throw new Error(`INSUFFICIENT_CREDITS: You need at least 1 DEMO credit to place a bid. Current DEMO balance: ${demoBalance}`);
            }
          } else {
            // Production C3 Credit Engine: Check balance from Firestore user doc
            const currentCredits = userData.creditsBalance || 0;
            if (currentCredits < 1) {
              throw new Error("INSUFFICIENT_CREDITS: You need at least 1 credit to place a bid.");
            }

            // Production C3 Idempotency Key
            const bidIndex = currentCount + 1;
            idempotencyKey = `ik_${bid.userId}_AUCTION_BID_DEDUCT_${bid.auctionId}_${bidIndex}`;
            txDocRef = doc(db, 'credit_transactions', idempotencyKey);

            const txDoc = await transaction.get(txDocRef);
            if (txDoc.exists()) {
              throw new Error("DUPLICATE_BID: This bid transaction has already been processed.");
            }

            balanceBefore = currentCredits;
            balanceAfter = currentCredits - 1;
            if (balanceAfter < 0) {
              throw new Error("INSUFFICIENT_CREDITS: Credit balance cannot be negative.");
            }
            totalCreditsSpent = (userData.totalCreditsSpent || 0) + 1;
          }

          // WRITE PHASE
          const bidRef = doc(collection(db, 'arena_auctions', bid.auctionId, 'bids'));
          
          const updateAuctionData: any = {
            currentBid: bid.amount,
            highestBidderId: bid.userId,
            highestBidderName: bid.userName,
            bidsCount: increment(1),
            updatedAt: serverTimestamp(),
            userBidCounts: {
              ...userBidCounts,
              [bid.userId]: currentCount + 1
            }
          };

          // Sniping Protection: Extend by 2 mins if bid within last 2 mins
          const timeRemaining = endTime.getTime() - now.getTime();
          const twoMinutes = 2 * 60 * 1000;
          
          if (timeRemaining < twoMinutes && (auctionData.extensionsCount || 0) < (auctionData.maxExtensions || 10)) {
            const newEndTime = new Date(endTime.getTime() + twoMinutes);
            updateAuctionData.endTime = Timestamp.fromDate(newEndTime);
            updateAuctionData.extensionsCount = increment(1);
            updateAuctionData.isExtended = true;
          }

          // Reserve Price Met
          if (auctionData.reservePrice && bid.amount >= auctionData.reservePrice) {
            updateAuctionData.reserveMet = true;
          }

          if (isDemo) {
            // Execute Demo Credit deduction in client demo storage
            DemoCreditsService.deductDemoCreditForBid(
              bid.userId,
              bid.auctionId,
              auctionData.title,
              currentCount + 1
            );
          } else {
            // 1. Update User Document (Deduct 1 credit, increment total spent in Firestore)
            transaction.update(userRef, {
              creditsBalance: balanceAfter,
              totalCreditsSpent: totalCreditsSpent,
              creditsLastUpdatedAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });

            // 4. Create Credit Transaction Ledger Record in Firestore
            transaction.set(txDocRef, {
              userId: bid.userId,
              amount: -1,
              balanceBefore,
              balanceAfter,
              type: 'AUCTION_BID_DEDUCT',
              relatedEntityId: bid.auctionId,
              sourceModule: 'AUCTION',
              status: 'COMPLETED',
              idempotencyKey,
              description: `Credit deduction for auction bid on ${auctionData.title}`,
              createdAt: serverTimestamp(),
              createdBy: bid.userId
            });
          }

          // 2. Create Bid Document in Firestore with exact currency
          transaction.set(bidRef, {
            ...bid,
            currency: auctionData.currency || (bid as any).currency || 'PKR',
            currencySymbol: auctionData.currencySymbol || (bid as any).currencySymbol || 'Rs.',
            timestamp: serverTimestamp()
          });
          
          // 3. Update Auction Document in Firestore
          transaction.update(auctionRef, updateAuctionData);
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `arena_auctions/${bid.auctionId}/bids`);
        throw err;
      }
    });
  },

  /**
   * Completes an auction, evaluating reserve prices, generating order atomically.
   */
  async completeAuction(auctionId: string): Promise<void> {
    try {
      const auctionRef = doc(db, 'arena_auctions', auctionId);
      const orderId = `BB-${auctionId}`;
      const orderRef = doc(db, 'orders', orderId);
      
      await runTransaction(db, async (transaction) => {
        const auctionDoc = await transaction.get(auctionRef);
        if (!auctionDoc.exists()) return;
        
        const auctionData = auctionDoc.data() as AuctionItem;
        if (auctionData.status !== 'active') return;

        let finalStatus: AuctionItem['status'] = 'ended';
        
        if (auctionData.bidsCount > 0 && auctionData.highestBidderId) {
          if (auctionData.reservePrice) {
            finalStatus = auctionData.currentBid >= auctionData.reservePrice ? 'sold' : 'reserve-not-met';
          } else {
            finalStatus = 'sold';
          }
        }

        if (finalStatus === 'sold' && auctionData.highestBidderId) {
          // Authoritatively resolve seller UID (never store anon_seller_* as order sellerId)
          let authoritativeSellerId = auctionData.sellerId;
          const isAnonymous = Boolean(
            auctionData.isNegotiationOnly ||
            (auctionData.sellerId && auctionData.sellerId.startsWith('anon_seller_'))
          );

          if (isAnonymous) {
            const privateSellerRef = doc(db, 'arena_auctions', auctionId, 'private', 'seller');
            const privateSellerDoc = await transaction.get(privateSellerRef);
            if (privateSellerDoc.exists()) {
              const privateData = privateSellerDoc.data();
              if (privateData?.sellerUid && typeof privateData.sellerUid === 'string' && !privateData.sellerUid.startsWith('anon_seller_')) {
                authoritativeSellerId = privateData.sellerUid.trim();
              } else {
                console.error(`[ArenaService.completeAuction] Anonymous auction ${auctionId} missing valid sellerUid in private/seller. Failing closed.`);
                return;
              }
            } else {
              console.error(`[ArenaService.completeAuction] Anonymous auction ${auctionId} missing private/seller record. Failing closed.`);
              return;
            }
          }

          const nowMs = Date.now();
          const paymentDeadlineMs = nowMs + BATTLE_BIDS_PAYMENT_DEADLINE_HOURS * 3600 * 1000;
          const paymentDeadlineTimestamp = Timestamp.fromDate(new Date(paymentDeadlineMs));

          // 1. Check idempotency for order creation
          const existingOrderDoc = await transaction.get(orderRef);
          if (!existingOrderDoc.exists()) {
            const primaryImage = (auctionData.images && auctionData.images.length > 0 ? auctionData.images[0] : '') || (auctionData as any).imageUrl || '';
            const sellerEmail = (auctionData as any).sellerEmail || (auctionData as any).contactEmail || '';

            transaction.set(orderRef, {
              id: orderId,
              source: 'battle_bids',
              auctionId: auctionId,
              listingId: auctionId,
              itemTitle: auctionData.title || 'Battle Bids Item',
              itemImage: primaryImage,
              sellerId: authoritativeSellerId,
              sellerName: auctionData.sellerName || 'Verified Seller',
              sellerEmail: sellerEmail,
              buyerId: auctionData.highestBidderId,
              buyerName: auctionData.highestBidderName || 'Winning Bidder',
              amount: auctionData.currentBid,
              currency: auctionData.currency || 'PKR',
              currencySymbol: auctionData.currencySymbol || 'Rs.',
              status: 'AWAITING_PAYMENT',
              paymentDeadline: paymentDeadlineTimestamp,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }

          // 2. Update Auction Document
          transaction.update(auctionRef, {
            status: 'sold',
            orderId: orderId,
            soldAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } else {
          // Unsold or reserve not met
          transaction.update(auctionRef, {
            status: finalStatus,
            updatedAt: serverTimestamp()
          });
        }
      });
    } catch (err) {
      console.error(`[ArenaService.completeAuction] Failed to complete auction ${auctionId}:`, err);
      handleFirestoreError(err, OperationType.UPDATE, `arena_auctions/${auctionId}/complete`);
      throw err;
    }
  },

  /**
   * Helper to map Firestore document to AuctionItem.
   */
  mapDocToAuction(snapshot: any): AuctionItem {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      ...data,
      startTime: parseSafeDate(data.startTime),
      endTime: parseSafeDate(data.endTime),
      createdAt: parseSafeDate(data.createdAt),
      updatedAt: parseSafeDate(data.updatedAt),
      pausedAt: data.pausedAt ? parseSafeDate(data.pausedAt) : undefined,
      appealSubmittedAt: data.appealSubmittedAt ? parseSafeDate(data.appealSubmittedAt) : undefined,
      featuredUntil: data.featuredUntil ? parseSafeDate(data.featuredUntil) : undefined,
      boostedUntil: data.boostedUntil ? parseSafeDate(data.boostedUntil) : undefined,
    } as AuctionItem;
  },

  /**
   * Fetches the full profile of a seller.
   */
  async getSellerProfile(userId: string): Promise<ArenaSellerProfile | null> {
    try {
      const docRef = doc(db, 'users', userId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return null;
      
      const data = snapshot.data();
      const stats = await this.getUserStats(userId);
      
      const authVerif = resolveAuthoritativeVerification(data);
      const isKyc = authVerif.isKycCurrentlyValid;
      const isPremium = authVerif.isPremiumCurrentlyActive;

      return {
        id: snapshot.id,
        displayName: data.name || data.displayName || data.realName || data.businessName || data.username || 'Unknown Warrior',
        photoURL: data.photoURL,
        country: data.country || 'Pakistan',
        city: data.city || 'Arena City',
        address: data.address || data.residentialAddress || data.businessAddress || '',
        isKycVerified: isKyc,
        isPremiumSeller: isPremium,
        isPremiumVerified: isPremium,
        verifiedBadgeType: authVerif.verificationType === 'golden' ? 'GOLDEN' : (authVerif.verificationType === 'blue' ? 'BLUE' : ''),
        verifiedUntil: data.verifiedUntil || null,
        kycStatus: data.kycStatus || (isKyc ? 'APPROVED' : 'NONE'),
        isVerified: isKyc,
        emailVerified: Boolean(data.emailVerified),
        memberSince: parseSafeDate(data.createdAt),
        stats
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${userId}/profile`);
      return null;
    }
  },

  /**
   * Subscribes to the full profile and stats of a user in real-time.
   */
  subscribeToSellerProfile(
    userId: string, 
    callback: (profile: ArenaSellerProfile) => void,
    onError?: (error: string) => void
  ) {
    const docRef = doc(db, 'users', userId);
    return onSnapshot(docRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback(getFallbackSellerProfile(userId));
        return;
      }
      
      const data = snapshot.data() || {};
      const fallback = getFallbackSellerProfile(userId);
      const authVerif = resolveAuthoritativeVerification(data);
      const isKyc = authVerif.isKycCurrentlyValid;
      const isPremium = authVerif.isPremiumCurrentlyActive;

      const rawTrustScore = typeof data.trustScore === 'number' && Number.isFinite(data.trustScore)
        ? data.trustScore
        : (fallback.trustScore ?? INITIAL_TRUST_SCORE);
      const trustScore = clampTrustScore(rawTrustScore);
      const trustTier = data.trustTier || calculateTrustTier(trustScore);

      const profile: ArenaSellerProfile = {
        id: snapshot.id,
        displayName: data.name || data.displayName || data.realName || data.businessName || data.username || fallback.displayName,
        photoURL: data.photoURL || fallback.photoURL,
        country: data.country || fallback.country || 'Pakistan',
        city: data.city || fallback.city || 'Lahore',
        address: data.address || data.residentialAddress || data.businessAddress || fallback.address || '',
        isKycVerified: isKyc,
        isPremiumSeller: isPremium,
        isPremiumVerified: isPremium,
        verifiedBadgeType: authVerif.verificationType === 'golden' ? 'GOLDEN' : (authVerif.verificationType === 'blue' ? 'BLUE' : ''),
        verifiedUntil: data.verifiedUntil || null,
        kycStatus: data.kycStatus || (isKyc ? 'APPROVED' : 'NONE'),
        isVerified: isKyc,
        emailVerified: data.emailVerified ?? fallback.emailVerified ?? false,
        memberSince: parseSafeDate(data.createdAt) || fallback.memberSince,
        isBlocked: data.isBlocked || false,
        phoneNumber: data.contactNumber || data.phoneNumber || data.phone || fallback.phoneNumber || '',
        username: data.username || fallback.username || '',
        isSystemAccount: Boolean(data.isSystemAccount || fallback.isSystemAccount),
        isBot: Boolean(data.isBot || fallback.isBot),
        trustScore,
        trustTier,
        stats: {
          completedSales: data.completedSales ?? fallback.stats.completedSales,
          completedPurchases: data.completedPurchases ?? fallback.stats.completedPurchases,
          auctionWins: data.auctionWins ?? fallback.stats.auctionWins,
          auctionLosses: data.auctionLosses ?? fallback.stats.auctionLosses,
          negotiationSuccess: data.negotiationSuccess ?? fallback.stats.negotiationSuccess,
          responseTime: data.responseTime || fallback.stats.responseTime
        }
      };
      callback(profile);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${userId}/profile`);
      callback(getFallbackSellerProfile(userId));
      if (onError) onError(err.message);
    });
  },

  /**
   * Fetches Arena stats for a user.
   */
  async getUserStats(userId: string): Promise<ArenaUserStats> {
    try {
      const docRef = doc(db, 'users', userId);
      const snapshot = await getDoc(docRef);
      const data = snapshot.data();
      return {
        completedSales: data?.completedSales || 0,
        completedPurchases: data?.completedPurchases || 0,
        auctionWins: data?.auctionWins || 0,
        auctionLosses: data?.auctionLosses || 0,
        negotiationSuccess: data?.negotiationSuccess || 100,
        responseTime: data?.responseTime || 'Under 1h'
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${userId}`);
      return {
        completedSales: 0,
        completedPurchases: 0,
        auctionWins: 0,
        auctionLosses: 0,
        negotiationSuccess: 100,
        responseTime: 'Under 1h'
      };
    }
  },

  /**
   * Dedicated paginated query for Battle Bids auctions owned by a user.
   * Uses single-field/composite index (sellerId == userId, orderBy createdAt desc).
   * Strictly bounded by pageSize to prevent linear inventory scans.
   */
  async getPaginatedUserBattleBids(
    userId: string,
    pageSize = DEFAULT_MY_AUCTIONS_PAGE_SIZE,
    cursor?: QueryDocumentSnapshot<DocumentData>
  ): Promise<PaginatedAuctionResult> {
    try {
      let q = query(
        collection(db, 'arena_auctions'),
        where('sellerId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );

      if (cursor) {
        q = query(
          collection(db, 'arena_auctions'),
          where('sellerId', '==', userId),
          orderBy('createdAt', 'desc'),
          startAfter(cursor),
          limit(pageSize)
        );
      }

      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(doc => {
        const item = this.mapDocToAuction(doc);
        this.cacheAuction(item);
        return item;
      });

      const lastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : undefined;
      const hasMore = snapshot.docs.length === pageSize;

      return { items, lastVisible, hasMore };
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'arena_auctions');
      return { items: [], hasMore: false };
    }
  },

  /**
   * Dedicated paginated collection-group discovery for Private Negotiations.
   * Allows cursor-based pagination over the seller's Private Negotiations.
   * Queries collectionGroup('private') where sellerUid == userId, ordered by createdAt desc.
   * Strictly preserves authoritative ownership and batches payload hydration (<= 30 IDs per IN query).
   */
  async getPaginatedUserPrivateAuctions(
    userId: string,
    pageSize = DEFAULT_MY_AUCTIONS_PAGE_SIZE,
    cursor?: QueryDocumentSnapshot<DocumentData>
  ): Promise<PaginatedAuctionResult> {
    try {
      let q = query(
        collectionGroup(db, 'private'),
        where('sellerUid', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );

      if (cursor) {
        q = query(
          collectionGroup(db, 'private'),
          where('sellerUid', '==', userId),
          orderBy('createdAt', 'desc'),
          startAfter(cursor),
          limit(pageSize)
        );
      }

      const snap = await getDocs(q);
      const items: AuctionItem[] = [];
      const privateAuctionIds: string[] = [];

      for (const docSnap of snap.docs) {
        if (docSnap.id === 'seller') {
          const parentId = docSnap.ref.parent.parent?.id;
          if (parentId && !privateAuctionIds.includes(parentId)) {
            privateAuctionIds.push(parentId);
          }
        }
      }

      if (privateAuctionIds.length > 0) {
        const CHUNK_SIZE = 30;
        for (let i = 0; i < privateAuctionIds.length; i += CHUNK_SIZE) {
          const chunk = privateAuctionIds.slice(i, i + CHUNK_SIZE);
          const uncachedIds: string[] = [];

          for (const id of chunk) {
            const cached = this.getCachedAuction(id);
            if (cached) {
              items.push(cached);
            } else {
              uncachedIds.push(id);
            }
          }

          if (uncachedIds.length > 0) {
            const chunkQuery = query(
              collection(db, 'arena_auctions'),
              where(documentId(), 'in', uncachedIds)
            );
            const chunkSnap = await getDocs(chunkQuery);
            for (const aDoc of chunkSnap.docs) {
              const item = this.mapDocToAuction(aDoc);
              this.cacheAuction(item);
              items.push(item);
            }
          }
        }
      }

      // Preserve chronological order matching the query
      items.sort((a, b) => {
        const timeDiff = (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      });

      const lastVisible = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : undefined;
      const hasMore = snap.docs.length === pageSize;

      return { items, lastVisible, hasMore };
    } catch (err) {
      console.warn("Failed to get paginated user private auctions:", err);
      return { items: [], hasMore: false };
    }
  },

  /**
   * Dual-Stream Chronological Pagination for My Auctions.
   * Merges Battle Bids and Private Negotiations into a single unified chronological feed.
   * Uses independent Firestore cursors, lookahead buffers for unconsumed records,
   * and a deterministic comparator: createdAt DESC, tie-broken by auctionId ASC.
   * Guarantees zero skipped records and zero duplicates across arbitrary page boundaries.
   */
  async getPaginatedUserUnifiedAuctions(
    userId: string,
    state: {
      pageSize?: number;
      battleBidCursor?: QueryDocumentSnapshot<DocumentData>;
      privateCursor?: QueryDocumentSnapshot<DocumentData>;
      battleBidBuffer?: AuctionItem[];
      privateBuffer?: AuctionItem[];
      hasMoreBattleBids?: boolean;
      hasMorePrivate?: boolean;
    }
  ): Promise<{
    items: AuctionItem[];
    nextBattleBidCursor?: QueryDocumentSnapshot<DocumentData>;
    nextPrivateCursor?: QueryDocumentSnapshot<DocumentData>;
    nextBattleBidBuffer: AuctionItem[];
    nextPrivateBuffer: AuctionItem[];
    hasMore: boolean;
    hasMoreBattleBids: boolean;
    hasMorePrivate: boolean;
  }> {
    const pageSize = state.pageSize || DEFAULT_MY_AUCTIONS_PAGE_SIZE;
    let bbCursor = state.battleBidCursor;
    let pnCursor = state.privateCursor;
    let bbBuffer = [...(state.battleBidBuffer || [])];
    let pnBuffer = [...(state.privateBuffer || [])];
    let hasMoreBB = state.hasMoreBattleBids !== false;
    let hasMorePN = state.hasMorePrivate !== false;

    const needBB = bbBuffer.length < pageSize && hasMoreBB;
    const needPN = pnBuffer.length < pageSize && hasMorePN;

    // Concurrently replenish Battle Bid and Private Negotiation buffers
    const [bbResult, pnResult] = await Promise.all([
      needBB ? this.getPaginatedUserBattleBids(userId, pageSize, bbCursor) : null,
      needPN ? this.getPaginatedUserPrivateAuctions(userId, pageSize, pnCursor) : null,
    ]);

    if (bbResult) {
      bbBuffer.push(...bbResult.items);
      bbCursor = bbResult.lastVisible || bbCursor;
      hasMoreBB = bbResult.hasMore;
    }

    if (pnResult) {
      pnBuffer.push(...pnResult.items);
      pnCursor = pnResult.lastVisible || pnCursor;
      hasMorePN = pnResult.hasMore;
    }

    // Deterministic comparator: createdAt DESC, tie-broken by auctionId ASC
    const comparator = (a: AuctionItem, b: AuctionItem) => {
      const timeA = a.createdAt?.getTime() || 0;
      const timeB = b.createdAt?.getTime() || 0;
      const timeDiff = timeB - timeA;
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    };

    // Candidate pool combines items currently in both buffers
    const candidatePool = [...bbBuffer, ...pnBuffer].sort(comparator);
    const chosenItems = candidatePool.slice(0, pageSize);
    const chosenIds = new Set(chosenItems.map(item => item.id));

    // Remove chosen items from buffers; unchosen items remain in lookahead buffer
    const remainingBBBuffer = bbBuffer.filter(item => !chosenIds.has(item.id));
    const remainingPNBuffer = pnBuffer.filter(item => !chosenIds.has(item.id));

    const hasMore = chosenItems.length === pageSize && (remainingBBBuffer.length > 0 || remainingPNBuffer.length > 0 || hasMoreBB || hasMorePN);

    return {
      items: chosenItems,
      nextBattleBidCursor: bbCursor,
      nextPrivateCursor: pnCursor,
      nextBattleBidBuffer: remainingBBBuffer,
      nextPrivateBuffer: remainingPNBuffer,
      hasMore,
      hasMoreBattleBids: hasMoreBB,
      hasMorePrivate: hasMorePN,
    };
  },

  /**
   * Fetches auctions created by a specific user with bounded limits.
   * Backward-compatible helper that prevents linear full-inventory scans.
   */
  async getUserAuctions(
    userId: string,
    options?: { limitCount?: number; startAfterDoc?: QueryDocumentSnapshot<DocumentData> }
  ): Promise<AuctionItem[]> {
    const limitCount = options?.limitCount || DEFAULT_MY_AUCTIONS_PAGE_SIZE;
    const unified = await this.getPaginatedUserUnifiedAuctions(userId, {
      pageSize: limitCount,
      battleBidCursor: options?.startAfterDoc
    });
    return unified.items;
  },

  /**
   * Action methods for user's own auctions.
   * Permanently deletes an auction from Firestore, clears caches, and removes associated subcollections.
   */
  async deleteAuction(auctionId: string): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      const isAdmin = currentUser?.email === 'imran7297510@gmail.com' || (currentUser as any)?.isAdmin === true || (currentUser as any)?.role === 'admin';
      
      const docRef = doc(db, 'arena_auctions', auctionId);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (!isAdmin) {
          const itemStatus = (data.status || '').toLowerCase().trim();
          const negStatus = ((data as any).negotiationStatus || '').toLowerCase().trim();
          const isItemAccepted = ['accepted', 'completed', 'concluded', 'sold'].includes(itemStatus) ||
                                 ['accepted', 'completed', 'concluded'].includes(negStatus) ||
                                 data.isAccepted === true ||
                                 data.isSold === true;

          if (isItemAccepted) {
            throw new Error("Action Denied: You cannot remove or delete a listed item under Private Negotiations once it is already marked as Accepted.");
          }

          const negQuery = query(collection(db, 'arena_negotiations'), where('auctionId', '==', auctionId));
          const negSnap = await getDocs(negQuery);
          const hasAcceptedDeal = negSnap.docs.some(d => {
            const st = (d.data().status || '').toLowerCase().trim();
            return ['accepted', 'completed', 'concluded'].includes(st);
          });

          if (hasAcceptedDeal) {
            throw new Error("Action Denied: A deal for this listed item has already been marked as Accepted under Private Negotiations.");
          }
        }
      }

      // 1. Evict from in-memory and session cache
      this._auctionCache.delete(auctionId);
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          sessionStorage.removeItem('arena_discovery_cache_v1');
        }
      } catch {}

      // 2. Permanently delete main auction document from Firestore
      await deleteDoc(docRef);

      // 3. Clean up any related bids subcollection records
      try {
        const bidsRef = collection(db, 'arena_auctions', auctionId, 'bids');
        const bidsSnap = await getDocs(bidsRef);
        for (const bDoc of bidsSnap.docs) {
          await deleteDoc(bDoc.ref).catch(() => {});
        }
      } catch (subErr) {
        console.warn("Subcollection cleanup warning:", subErr);
      }

      // 4. Clean up any associated negotiation records
      try {
        const negQuery = query(collection(db, 'arena_negotiations'), where('auctionId', '==', auctionId));
        const negSnap = await getDocs(negQuery);
        for (const nDoc of negSnap.docs) {
          await deleteDoc(nDoc.ref).catch(() => {});
        }
      } catch (negErr) {
        console.warn("Negotiation cleanup warning:", negErr);
      }

      // 5. Dispatch global event for instantaneous UI updates across all components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arena_auction_deleted', { detail: { auctionId } }));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `arena_auctions/${auctionId}`);
    }
  },

  async deleteAuctionPermanently(auctionId: string): Promise<void> {
    await this.deleteAuction(auctionId);
  },

  async softRemoveAuction(auctionId: string, userId?: string): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication required to remove this listing.");
      }

      const docRef = doc(db, 'arena_auctions', auctionId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) {
        throw new Error("Auction listing not found.");
      }

      const data = snapshot.data();
      const sellerId = data.sellerId || data.userId || data.ownerId;
      const uidToMatch = currentUser.uid;
      const isAuthorizedSeller = Boolean(
        sellerId && (uidToMatch === sellerId || (currentUser as any).id === sellerId)
      );

      const isAdmin = currentUser.email === 'imran7297510@gmail.com' || (currentUser as any).isAdmin === true || (currentUser as any).role === 'admin';
      if (!isAuthorizedSeller && !isAdmin) {
        throw new Error("Unauthorized: Only the verified owner or an Admin can remove this listing.");
      }

      if (!isAdmin) {
        const itemStatus = (data.status || '').toLowerCase().trim();
        const negStatus = ((data as any).negotiationStatus || '').toLowerCase().trim();
        const isItemAccepted = ['accepted', 'completed', 'concluded', 'sold'].includes(itemStatus) ||
                               ['accepted', 'completed', 'concluded'].includes(negStatus) ||
                               data.isAccepted === true ||
                               data.isSold === true;

        if (isItemAccepted) {
          throw new Error("Action Denied: You cannot remove a listed item under Private Negotiations once it is already marked as Accepted.");
        }

        const negQuery = query(collection(db, 'arena_negotiations'), where('auctionId', '==', auctionId));
        const negSnap = await getDocs(negQuery);
        const hasAcceptedDeal = negSnap.docs.some(d => {
          const st = (d.data().status || '').toLowerCase().trim();
          return ['accepted', 'completed', 'concluded'].includes(st);
        });

        if (hasAcceptedDeal) {
          throw new Error("Action Denied: A deal for this listed item has already been marked as Accepted under Private Negotiations.");
        }
      }

      const updates = {
        isPermanentlyRemoved: true,
        status: 'cancelled',
        removedBy: uidToMatch,
        removedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await updateDoc(docRef, updates);

      try {
        await AuditLogService.logAction({
          userId: uidToMatch,
          actionType: 'REMOVE_LISTING',
          targetId: auctionId,
          targetType: 'auction',
          reason: 'Seller/Admin soft removal of listing',
          previousState: String(data.status || 'active'),
          newState: 'cancelled',
          metadata: { auctionId, removedBy: uidToMatch }
        });
      } catch (logErr) {
        console.warn("Audit log notice:", logErr);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arena_auction_updated', {
          detail: { auctionId, status: 'cancelled', isPermanentlyRemoved: true }
        }));
        window.dispatchEvent(new CustomEvent('arena_auction_deleted', {
          detail: { auctionId }
        }));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_auctions/${auctionId}`);
      throw err;
    }
  },

  async pauseAuction(auctionId: string): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication required to pause this listing.");
      }

      const docRef = doc(db, 'arena_auctions', auctionId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) {
        throw new Error("Auction listing not found.");
      }

      const data = snapshot.data();
      if (data.forceStopped || data.isForceStopped || data.forceStoppedByAdmin || data.closedOnViolation || data.status === 'stopped' || data.status === 'force_stopped') {
        throw new Error("Action denied: Force stopped items cannot be restored or resumed.");
      }
      const sellerId = data.sellerId || data.userId || data.ownerId;
      const sellerEmail = data.sellerEmail || data.contactEmail;
      const isAuthorizedSeller = Boolean(
        (sellerId && (currentUser.uid === sellerId || (currentUser as any).id === sellerId)) ||
        (sellerEmail && currentUser.email && currentUser.email.toLowerCase() === sellerEmail.toLowerCase()) ||
        (sellerId && currentUser.email && currentUser.email.toLowerCase() === sellerId.toLowerCase())
      );

      const isAdmin = currentUser.email === 'imran7297510@gmail.com' || (currentUser as any).isAdmin === true || (currentUser as any).role === 'admin';
      if (!isAuthorizedSeller && !isAdmin) {
        throw new Error("Unauthorized: Only the seller who posted this item or an Admin can pause this listing.");
      }

      if (data.status === 'concluded' || data.status === 'sold') {
        throw new Error('Action denied: Listed items cannot be paused once an offer has been accepted by the seller.');
      }

      const negQuery = query(
        collection(db, 'arena_negotiations'),
        where('auctionId', '==', auctionId),
        where('status', 'in', ['accepted', 'completed', 'ACCEPTED', 'COMPLETED'])
      );
      const negSnap = await getDocs(negQuery);
      if (!negSnap.empty) {
        throw new Error('Action denied: Listed items cannot be paused once an offer has been accepted by the seller.');
      }

      const now = Date.now();
      const endSafe = parseSafeDate(data.endTime);
      const endTimeMs = endSafe ? endSafe.getTime() : now;
      const remainingTimeMs = Math.max(0, endTimeMs - now);

      await updateDoc(docRef, { 
        status: 'paused', 
        isPaused: true,
        isPausedBySeller: !isAdmin && isAuthorizedSeller,
        isPausedByAdmin: isAdmin,
        pausedAt: serverTimestamp(),
        pausedRemainingTimeMs: remainingTimeMs,
        remainingDurationMs: remainingTimeMs,
        updatedAt: serverTimestamp() 
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arena_auction_updated', { detail: { auctionId, status: 'paused', isPaused: true } }));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_auctions/${auctionId}`);
      throw err;
    }
  },

  async resumeAuction(auctionId: string): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication required to resume this listing.");
      }

      const docRef = doc(db, 'arena_auctions', auctionId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) {
        throw new Error("Auction listing not found.");
      }

      const data = snapshot.data();
      if (data.forceStopped || data.isForceStopped || data.forceStoppedByAdmin || data.closedOnViolation || data.status === 'stopped' || data.status === 'force_stopped') {
        throw new Error("Action denied: Force stopped items cannot be restored or resumed.");
      }
      const sellerId = data.sellerId || data.userId || data.ownerId;
      const sellerEmail = data.sellerEmail || data.contactEmail;
      const isAuthorizedSeller = Boolean(
        (sellerId && (currentUser.uid === sellerId || (currentUser as any).id === sellerId)) ||
        (sellerEmail && currentUser.email && currentUser.email.toLowerCase() === sellerEmail.toLowerCase()) ||
        (sellerId && currentUser.email && currentUser.email.toLowerCase() === sellerId.toLowerCase())
      );

      const isAdmin = currentUser.email === 'imran7297510@gmail.com' || (currentUser as any).isAdmin === true || (currentUser as any).role === 'admin';
      if (!isAuthorizedSeller && !isAdmin) {
        throw new Error("Unauthorized: Only the seller who posted this item or an Admin can resume this listing.");
      }

      const now = Date.now();
      let remainingMs = data.pausedRemainingTimeMs ?? data.remainingDurationMs;

      if (typeof remainingMs !== 'number' || isNaN(remainingMs) || remainingMs <= 0) {
        const oldEnd = parseSafeDate(data.endTime);
        const oldPaused = parseSafeDate(data.pausedAt);
        if (oldEnd && oldPaused) {
          remainingMs = Math.max(0, oldEnd.getTime() - oldPaused.getTime());
        } else if (oldEnd) {
          remainingMs = Math.max(0, oldEnd.getTime() - now);
        } else {
          remainingMs = (data.durationDays || 3) * 24 * 60 * 60 * 1000;
        }
      }

      // New endTime is current moment plus the exact remaining duration when paused
      const newEndTime = new Date(now + Math.max(1000, remainingMs));

      const updates: any = {
        status: 'active',
        isPaused: false,
        isPausedBySeller: false,
        isPausedByAdmin: false,
        pausedAt: null,
        pausedRemainingTimeMs: null,
        remainingDurationMs: null,
        endTime: Timestamp.fromDate(newEndTime),
        updatedAt: serverTimestamp()
      };

      await updateDoc(docRef, updates);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arena_auction_updated', { detail: { auctionId, status: 'active', isPaused: false } }));
      }

      if (data.hasFeaturedBadge && data.featuredUntil) {
        updates.featuredUntil = Timestamp.fromDate(newEndTime);
      }
      if (data.hasBoostedBadge && data.boostedUntil) {
        updates.boostedUntil = Timestamp.fromDate(newEndTime);
      }

      await updateDoc(docRef, updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_auctions/${auctionId}`);
      throw err;
    }
  },

  async goLive(auctionId: string, durationDays: number, fullItem?: AuctionItem): Promise<void> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error("Authentication required to launch this item.");
      }

      const docRef = doc(db, 'arena_auctions', auctionId);
      const snapshot = await getDoc(docRef);
      const data = snapshot.exists() ? snapshot.data() : {};

      const sellerId = data.sellerId || data.userId || fullItem?.sellerId || (fullItem as any)?.userId;
      const sellerEmail = data.sellerEmail || (fullItem as any)?.sellerEmail || (typeof sellerId === 'string' && sellerId.includes('@') ? sellerId : null);
      const isAuthorizedSeller = Boolean(
        (sellerId && (currentUser.uid === sellerId || (currentUser as any).id === sellerId)) ||
        (sellerEmail && currentUser.email && currentUser.email.toLowerCase() === sellerEmail.toLowerCase()) ||
        (sellerId && currentUser.email && currentUser.email.toLowerCase() === sellerId.toLowerCase())
      );

      if (!isAuthorizedSeller) {
        throw new Error("Unauthorized: Only the exact user who posted this item has the right to use the Go Live button.");
      }

      const startTimeDate = new Date();
      const endTimeDate = new Date(startTimeDate.getTime() + (durationDays || 3) * 24 * 60 * 60 * 1000);
      
      const updates: any = {
        status: 'active',
        launchType: 'now',
        startTime: Timestamp.fromDate(startTimeDate),
        endTime: Timestamp.fromDate(endTimeDate),
        updatedAt: serverTimestamp()
      };

      if (!snapshot.exists() && fullItem) {
        const docData = {
          title: fullItem.title,
          category: fullItem.category,
          brand: fullItem.brand || '',
          model: fullItem.model || '',
          condition: (fullItem as any).condition || 'New',
          description: fullItem.description,
          shippingInfo: fullItem.shippingInfo || 'Standard Shipping',
          startingPrice: fullItem.startingPrice,
          currentBid: fullItem.startingPrice,
          currency: fullItem.currency || 'PKR',
          currencySymbol: fullItem.currencySymbol || 'Rs.',
          images: fullItem.images,
          sellerId: fullItem.sellerId,
          sellerName: fullItem.sellerName,
          country: fullItem.country || 'Pakistan',
          city: fullItem.city || 'Lahore',
          startTime: Timestamp.fromDate(startTimeDate),
          endTime: Timestamp.fromDate(endTimeDate),
          status: 'active',
          launchType: 'now',
          durationDays: durationDays || 3,
          hasFeaturedBadge: false,
          hasBoostedBadge: false,
          bidsCount: 0,
          watchersCount: 0,
          viewsCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(docRef, docData);
      } else {
        if (data.hasFeaturedBadge) {
          updates.featuredUntil = Timestamp.fromDate(endTimeDate);
        }
        if (data.hasBoostedBadge) {
          updates.boostedUntil = Timestamp.fromDate(endTimeDate);
        }
        await updateDoc(docRef, updates);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_auctions/${auctionId}`);
    }
  },

  async toggleBadge(auctionId: string, badgeType: 'featured' | 'boosted', enabled: boolean): Promise<void> {
    try {
      const docRef = doc(db, 'arena_auctions', auctionId);
      const snapshot = await getDoc(docRef);
      const data = snapshot.exists() ? snapshot.data() : {};

      const updates: any = {};
      if (badgeType === 'featured') {
        updates.hasFeaturedBadge = enabled;
        if (enabled) {
          if (data.status === 'active' && data.endTime) {
            updates.featuredUntil = Timestamp.fromDate(parseSafeDate(data.endTime));
          } else {
            // Pending live, so no timer starts ticking yet
            updates.featuredUntil = null;
          }
        } else {
          updates.featuredUntil = null;
        }
      } else if (badgeType === 'boosted') {
        updates.hasBoostedBadge = enabled;
        if (enabled) {
          if (data.status === 'active' && data.endTime) {
            updates.boostedUntil = Timestamp.fromDate(parseSafeDate(data.endTime));
          } else {
            // Pending live, so no timer starts ticking yet
            updates.boostedUntil = null;
          }
        } else {
          updates.boostedUntil = null;
        }
      }
      updates.updatedAt = serverTimestamp();
      await updateDoc(docRef, updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_auctions/${auctionId}`);
    }
  },

  async createAuction(data: CreateAuctionInput, userProfile: UserProfile | null): Promise<string> {
    return PerformanceMonitor.track('createAuction', async () => {
      try {
        const sellerId = userProfile?.id || 'anon';
        const isBannedCreator = isUserBanned(userProfile) || userProfile?.isBanned || (userProfile as any)?.accountStatus === 'banned' || (userProfile as any)?.status === 'BANNED';
        if (isBannedCreator || userProfile?.isBlocked || (userProfile as any)?.status === 'BLOCKED' || (userProfile as any)?.accountStatus === 'blocked' || (userProfile as any)?.postingDisabled || (userProfile as any)?.canPost === false) {
          throw new Error("Action denied: Your account has been banned or blocked by administration. You are not allowed to post items.");
        }
        const sellerName = userProfile?.name || userProfile?.realName || userProfile?.businessName || userProfile?.username || data.sellerName || 'Anonymous Seller';
        const finalCountry = userProfile?.country || data.country || 'Pakistan';
        const finalCity = userProfile?.city || data.city || '';
        const finalAddress = userProfile?.address || userProfile?.residentialAddress || userProfile?.businessAddress || data.address || '';
        
        // Convert files to base64 data URLs for storage
        // Note: Using 1200px width maintains ultra-crisp resolution while preventing Firestore's 1MB document size limit
        const imageUrls = await Promise.all(
          data.images.map(async (img) => {
            try {
              return await ArenaImageUtils.generateThumbnail(img, 1200);
            } catch (imageErr) {
              const errMsg = imageErr instanceof Error ? imageErr.message : String(imageErr);
              throw new Error(`Failed to process image "${img.name}": ${errMsg}`);
            }
          })
        );

        const startTimeDate = new Date();
        const endTimeDate = new Date(startTimeDate.getTime() + data.durationDays * 24 * 60 * 60 * 1000);

        const newAuctionRef = doc(collection(db, 'arena_auctions'));
        
        const launchType = data.launchType || 'now';
        const status = (launchType === 'later' || launchType === 'boosters') ? 'upcoming' : 'active';

        const isNeg = Boolean(data.isNegotiationOnly);
        const publicSellerId = isNeg ? `anon_seller_${newAuctionRef.id.slice(0, 12)}` : sellerId;
        const publicSellerName = isNeg ? 'Anonymous Seller' : sellerName;
        const publicCity = isNeg ? 'Location Hidden' : finalCity;

        const docData = {
          title: data.title,
          category: data.category,
          brand: data.brand,
          model: data.model,
          condition: data.condition,
          description: data.description,
          shippingInfo: data.shippingInfo,
          startingPrice: data.startingPrice,
          currentBid: data.startingPrice,
          currency: data.currency || 'PKR',
          currencySymbol: data.currencySymbol || 'Rs.',
          images: imageUrls,
          sellerId: publicSellerId,
          sellerName: publicSellerName,
          country: finalCountry,
          city: publicCity,
          startTime: Timestamp.fromDate(startTimeDate),
          endTime: Timestamp.fromDate(endTimeDate),
          status,
          launchType,
          durationDays: data.durationDays,
          hasFeaturedBadge: false,
          hasBoostedBadge: false,
          bidsCount: 0,
          watchersCount: 0,
          viewsCount: 0,
          reservePrice: data.reservePrice || null,
          reserveMet: false,
          minIncrement: Math.max(100, Math.floor(data.startingPrice * 0.01)),
          extensionsCount: 0,
          maxExtensions: 10,
          isExtended: false,
          isNegotiationOnly: isNeg,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // STEP 34B: 5-CREDIT LISTING FEE FOR PRIVATE NEGOTIATION HUB
        if (data.isNegotiationOnly) {
          if (!sellerId || sellerId === 'anon' || sellerId === 'unauthenticated') {
            throw new Error("Authentication required: You must be logged in to post a Private Negotiation listing.");
          }
          const verifiedLoginEmail = (userProfile?.email || auth.currentUser?.email || data.contactEmail || '').trim();
          if (!verifiedLoginEmail) {
            throw new Error("Authentication required: A verified login email is required to post a Private Negotiation listing. Organization or alternate email addresses cannot be used.");
          }

          const isDemo = isDemoCreditModeActive();
          const listingCost = 5;

          if (isDemo) {
            const demoBalance = DemoCreditsService.getDemoBalance(sellerId);
            if (demoBalance < listingCost) {
              throw new Error(`INSUFFICIENT_CREDITS: You need at least 5 DEMO credits to post a Private Negotiation listing. Current DEMO balance: ${demoBalance}`);
            }

            const batch = writeBatch(db);
            batch.set(newAuctionRef, docData);
            const privateSellerRef = doc(db, 'arena_auctions', newAuctionRef.id, 'private', 'seller');
            batch.set(privateSellerRef, {
              sellerUid: sellerId,
              createdAt: serverTimestamp(),
            });
            await batch.commit();

            DemoCreditsService.deductDemoCreditForNegotiationListing(
              sellerId,
              newAuctionRef.id,
              data.title
            );
          } else {
            // Production C3 Transaction with strict read-before-write ordering
            await runTransaction(db, async (transaction) => {
              // 1. READ PHASE
              const userRef = doc(db, 'users', sellerId);
              const userDoc = await transaction.get(userRef);
              if (!userDoc.exists()) {
                throw new Error("User record not found. Unable to verify credit balance.");
              }
              const userData = userDoc.data();
              const currentCredits = userData?.creditsBalance || 0;
              if (currentCredits < listingCost) {
                throw new Error(`INSUFFICIENT_CREDITS: You need at least 5 credits to post a Private Negotiation listing. Current balance: ${currentCredits}`);
              }

              const idempotencyKey = CreditsService.generateIdempotencyKey(
                sellerId,
                'PRIVATE_NEGOTIATION_LISTING_POST',
                newAuctionRef.id
              );
              const txDocRef = doc(db, 'credit_transactions', idempotencyKey);
              const txDoc = await transaction.get(txDocRef);
              if (txDoc.exists()) {
                throw new Error("DUPLICATE_TRANSACTION: This listing posting fee has already been charged.");
              }

              const balanceBefore = currentCredits;
              const balanceAfter = currentCredits - listingCost;
              if (balanceAfter < 0) {
                throw new Error("INSUFFICIENT_CREDITS: Credit balance cannot be negative.");
              }
              const totalCreditsSpent = (userData?.totalCreditsSpent || 0) + listingCost;

              // 2. WRITE PHASE
              transaction.set(newAuctionRef, docData);
              const privateSellerRef = doc(db, 'arena_auctions', newAuctionRef.id, 'private', 'seller');
              transaction.set(privateSellerRef, {
                sellerUid: sellerId,
                createdAt: serverTimestamp(),
              });
              transaction.update(userRef, {
                creditsBalance: balanceAfter,
                totalCreditsSpent: totalCreditsSpent,
                creditsLastUpdatedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              transaction.set(txDocRef, {
                id: txDocRef.id,
                userId: sellerId,
                amount: -listingCost,
                balanceBefore,
                balanceAfter,
                type: 'PRIVATE_NEGOTIATION_LISTING_POST',
                description: `Private Negotiation Hub Listing Fee: ${data.title}`,
                idempotencyKey,
                relatedEntityId: newAuctionRef.id,
                relatedEntityType: 'NEGOTIATION',
                sourceModule: 'NEGOTIATION',
                status: 'COMPLETED',
                createdAt: serverTimestamp(),
                metadata: {
                  listingTitle: data.title,
                  category: data.category,
                  startingPrice: data.startingPrice,
                  currency: data.currency || 'PKR',
                  isNegotiationOnly: true,
                  feeType: 'POSTING_FEE',
                  creditsCharged: listingCost,
                },
              });
            });
          }
        } else {
          // Standard Battle Bids Auction Creation
          await setDoc(newAuctionRef, docData);
        }

        // Invalidate discovery cache so the new item shows on top immediately
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.removeItem('arena_discovery_cache_v1');
          }
        } catch {}

        if (typeof window !== 'undefined') {
          const createdAuctionItem: AuctionItem = {
            id: newAuctionRef.id,
            ...docData,
            startTime: startTimeDate,
            endTime: endTimeDate,
            createdAt: startTimeDate,
            updatedAt: startTimeDate,
          } as any;
          window.dispatchEvent(new CustomEvent('arena_auction_created', { detail: { auction: createdAuctionItem } }));
        }

        return newAuctionRef.id;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'arena_auctions');
        throw err;
      }
    });
  },

  async duplicateAuction(auctionId: string): Promise<string> {
    try {
      const original = await this.getAuction(auctionId);
      if (!original) throw new Error("Original auction not found");
      
      const newAuctionRef = doc(collection(db, 'arena_auctions'));
      const { id, ...data } = original;
      await setDoc(newAuctionRef, {
        ...data,
        status: 'upcoming',
        currentBid: data.startingPrice,
        bidsCount: 0,
        extensionsCount: 0,
        isExtended: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return newAuctionRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'arena_auctions');
      throw err;
    }
  },

  async submitAppeal(auctionId: string, message: string): Promise<void> {
    try {
      const docRef = doc(db, 'arena_auctions', auctionId);
      await updateDoc(docRef, {
        appealStatus: 'pending',
        appealMessage: message,
        appealSubmittedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_auctions/${auctionId}/appeal`);
      throw err;
    }
  },

  async incrementViews(auctionId: string, userId?: string): Promise<void> {
    return this.recordView(auctionId, userId);
  },

  async recordView(auctionId: string, userId?: string): Promise<void> {
    try {
      const docRef = doc(db, 'arena_auctions', auctionId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return;
      
      const data = snapshot.data();
      const updates: any = {
        viewsCount: increment(1),
        updatedAt: serverTimestamp()
      };

      if (userId) {
        updates[`userViewCounts.${userId}`] = increment(1);
        if (!data.viewerUserIds || !Array.isArray(data.viewerUserIds) || !data.viewerUserIds.includes(userId)) {
          updates.viewerUserIds = arrayUnion(userId);
          updates.uniqueViewersCount = increment(1);
        }
      } else {
        // If guest/anonymous user, ensure uniqueViewersCount is at least initialized
        if (data.uniqueViewersCount === undefined) {
          updates.uniqueViewersCount = 1;
        }
      }

      await updateDoc(docRef, updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_auctions/${auctionId}/views`);
      throw err;
    }
  }
};
