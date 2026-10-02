import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  Timestamp, 
  runTransaction,
  getDoc,
  getDocs,
  deleteDoc,
  increment
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import { Negotiation, NegotiationOffer, NegotiationStatus } from '../types';
import { AuctionItem } from '../types';
import { parseSafeDate } from '../utils/arena';
import { ARENA_CONFIG } from '../constants';
import { isDemoCreditModeActive, DemoCreditsService } from '../../credits';
import { resolveAuthoritativeSellerUid } from './sellerIdentityResolver';

const ALIASES = ['Seller A', 'Seller B', 'Seller C', 'Seller D', 'Seller E', 'Seller F'];

/**
 * Sanitizes an individual offer's private attached message based on viewer authorization.
 * STRICT PRIVACY RULES:
 * 1. EXACT SELLER: can see buyer messages for their listing.
 * 2. EXACT BUYER: can see their own author messages & seller counter messages in their deal.
 * 3. PUBLIC USERS: NEVER see private attached messages.
 * 4. ADMINS / MODS in participant views: NEVER see private attached messages.
 */
export function sanitizeOfferForViewer(
  offer: NegotiationOffer,
  currentUserId?: string,
  sellerId?: string,
  buyerId?: string
): NegotiationOffer {
  if (!offer || !offer.message) return offer;

  // Exact seller of the listing/negotiation
  const isSeller = Boolean(
    currentUserId && (
      (sellerId && currentUserId === sellerId) || 
      currentUserId === 'simulated-seller' || 
      currentUserId === 'seller'
    )
  );

  // Exact author of this offer
  const isOfferAuthor = Boolean(
    currentUserId && (
      offer.senderId === currentUserId ||
      (currentUserId === 'simulated-buyer' && (offer.senderId === buyerId || offer.senderId === 'buyer')) ||
      (currentUserId === 'simulated-seller' && (offer.senderId === sellerId || offer.senderId === 'seller'))
    )
  );

  // Exact buyer participating in this negotiation receiving a counter from seller
  const isBuyerInNeg = Boolean(
    currentUserId && (
      (buyerId && currentUserId === buyerId) ||
      currentUserId === 'simulated-buyer' ||
      currentUserId === 'buyer'
    )
  );
  const isSenderSeller = (
    offer.senderId === sellerId || 
    offer.senderId === 'seller' || 
    offer.senderId === 'simulated-seller' || 
    ['arena-official-host', 'arena_bot_alpha', 'arena_bot_beta', 'arena_bot_gamma'].includes(offer.senderId)
  );
  const isSellerResponseToThisBuyer = isBuyerInNeg && isSenderSeller;

  if (isSeller || isOfferAuthor || isSellerResponseToThisBuyer) {
    return offer;
  }

  // Strip private attached message for unauthorized viewer
  const sanitized = { ...offer };
  delete (sanitized as any).message;
  return sanitized;
}

/**
 * Sanitizes an array of offers for a viewing user.
 */
export function sanitizeOffersForViewer(
  offers: NegotiationOffer[],
  currentUserId?: string,
  sellerId?: string,
  buyerId?: string
): NegotiationOffer[] {
  if (!Array.isArray(offers)) return [];
  return offers.map(o => sanitizeOfferForViewer(o, currentUserId, sellerId, buyerId));
}

// Memoized Listener Registry
const negListeners: Record<string, {
  unsubscribe: () => void;
  callbacks: Set<(neg: Negotiation | null) => void>;
  lastData: Negotiation | null;
}> = {};

const offersListeners: Record<string, {
  unsubscribe: () => void;
  callbacks: Set<(offers: NegotiationOffer[]) => void>;
  lastData: NegotiationOffer[];
}> = {};

/**
 * Resolves a given negotiation ID string into the exact document ID in `arena_negotiations`.
 * If direct lookup fails, searches by `auctionId` for an existing negotiation doc.
 */
export async function resolveNegId(negId: string, userId?: string): Promise<{ resolvedId: string; snap: any }> {
  if (!negId) return { resolvedId: negId, snap: null };

  try {
    const directRef = doc(db, 'arena_negotiations', negId);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) {
      return { resolvedId: negId, snap: directSnap };
    }

    let extractedAuctionId = negId;
    if (negId.startsWith('auction-')) extractedAuctionId = negId.replace('auction-', '');
    else if (negId.startsWith('empty-')) extractedAuctionId = negId.replace('empty-', '');
    else if (negId.startsWith('item-')) extractedAuctionId = negId.replace('item-', '');

    const qNegs = query(
      collection(db, 'arena_negotiations'),
      where('auctionId', '==', extractedAuctionId)
    );
    const qSnap = await getDocs(qNegs);

    if (qSnap.docs.length > 0) {
      let matchedDoc = null;
      if (userId) {
        matchedDoc = qSnap.docs.find(d => d.data().buyerId === userId || d.data().sellerId === userId);
      }
      if (!matchedDoc) {
        matchedDoc = qSnap.docs.find(d => ['accepted', 'completed', 'concluded'].includes((d.data().status || '').toLowerCase())) ||
                   qSnap.docs.find(d => !['cancelled', 'expired'].includes((d.data().status || '').toLowerCase())) ||
                   qSnap.docs[0];
      }
      if (matchedDoc) {
        return { resolvedId: matchedDoc.id, snap: matchedDoc };
      }
    }
  } catch (err) {
    console.warn("Error resolving negotiation ID:", err);
  }

  return { resolvedId: negId, snap: null };
}

/**
 * Ensures a negotiation document exists in Firestore before performing actions on it.
 */
export async function ensureNegotiationDoc(
  negId: string,
  userId: string,
  defaultStatus: NegotiationStatus = NegotiationStatus.ACCEPTED
): Promise<{ resolvedId: string; data: Negotiation }> {
  const { resolvedId, snap } = await resolveNegId(negId, userId);
  let resolvedNegId = resolvedId;

  if (snap && snap.exists()) {
    return { resolvedId, data: snap.data() as Negotiation };
  }

  // Document does not exist yet; attempt fallback from arena_auctions
  let extractedAuctionId = negId;
  if (negId.startsWith('auction-')) extractedAuctionId = negId.replace('auction-', '');
  else if (negId.startsWith('empty-')) extractedAuctionId = negId.replace('empty-', '');
  else if (negId.startsWith('item-')) extractedAuctionId = negId.replace('item-', '');

  const auctionSnap = await getDoc(doc(db, 'arena_auctions', extractedAuctionId));
  if (!auctionSnap.exists()) {
    throw new Error('Negotiation and associated listing not found');
  }

  const auctionData = auctionSnap.data() as AuctionItem;
  const sellerId = auctionData.sellerId || 'seller';

  let buyerId = userId !== sellerId ? userId : 'buyer';
  if (buyerId === 'buyer' || buyerId === sellerId) {
    const bidsSnap = await getDocs(collection(db, 'arena_auctions', extractedAuctionId, 'bids'));
    const buyerBid = bidsSnap.docs.map(d => d.data()).find(b => b.userId !== sellerId && b.userId) || bidsSnap.docs[0]?.data();
    buyerId = buyerBid?.userId || buyerBid?.id || 'buyer';
  }

  resolvedNegId = `neg_${extractedAuctionId}_${buyerId}`;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const initialPayload: any = {
    id: resolvedNegId,
    auctionId: extractedAuctionId,
    buyerId,
    sellerId,
    status: defaultStatus,
    lastOfferAmount: auctionData.currentBid || auctionData.startingPrice || 0,
    lastOfferBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    currency: auctionData.currency || 'USD',
    currencySymbol: auctionData.currencySymbol || '$',
    itemTitle: auctionData.title || '',
    itemImage: auctionData.images?.[0] || '',
    itemPrice: auctionData.startingPrice || 0
  };

  await setDoc(doc(db, 'arena_negotiations', resolvedNegId), initialPayload, { merge: true });

  const createdData = {
    ...initialPayload,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt
  } as unknown as Negotiation;

  return { resolvedId: resolvedNegId, data: createdData };
}

export const NegotiationService = {
  /**
   * Starts a new negotiation for an asset.
   */
  async startNegotiation(
    buyerId: string, 
    auctionId: string, 
    initialOffer: number, 
    message?: string
  ): Promise<string> {
    if (!buyerId || typeof buyerId !== 'string' || !buyerId.trim() || buyerId === 'guest' || buyerId === 'unauthenticated') {
      throw new Error('Authentication required: You must be logged in to make an offer.');
    }
    try {
      // Check if active negotiation already exists for this buyer and auction
      const q = query(
        collection(db, 'arena_negotiations'), 
        where('buyerId', '==', buyerId),
        where('auctionId', '==', auctionId)
      );
      
      const querySnapshot = await getDocs(q);
      const activeNeg = querySnapshot.docs.find(docSnap => {
        const s = (docSnap.data().status || '').toLowerCase();
        return s === NegotiationStatus.OPEN || 
               s === NegotiationStatus.OFFER_SENT || 
               s === NegotiationStatus.COUNTER_OFFERED || 
               s === NegotiationStatus.ACCEPTED ||
               s === 'completed' ||
               s === 'concluded';
      });
      
      if (activeNeg) {
        const s = (activeNeg.data().status || '').toLowerCase();
        if (['accepted', 'completed', 'concluded'].includes(s)) {
          throw new Error('Action denied: An offer for this item has already been accepted and finalized.');
        }
        throw new Error('Action denied: Your earlier submitted offer is pending and waiting for response. You cannot submit a new offer until the recipient responds or the offer is withdrawn.');
      }

      // Calculate total paid offer cycles across all negotiations for this listing and check 15-second offer cooldown
      let totalPaidOfferCycles = 0;
      let lastBuyerOfferTime = 0;
      
      querySnapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        totalPaidOfferCycles += (data.offerCycleCount || 1);
        const offerDate = parseSafeDate(data.lastBuyerOfferAt || (data.lastOfferBy === buyerId ? data.updatedAt : null) || data.createdAt);
        if (offerDate && offerDate.getTime() > lastBuyerOfferTime) {
          lastBuyerOfferTime = offerDate.getTime();
        }
      });

      if (totalPaidOfferCycles >= (ARENA_CONFIG.MAX_OFFERS_PER_BUYER || 10)) {
        throw new Error(`Strategic limit reached: Maximum of ${ARENA_CONFIG.MAX_OFFERS_PER_BUYER || 10} paid offer cycles allowed per listing.`);
      }

      if (lastBuyerOfferTime > 0) {
        const elapsed = Date.now() - lastBuyerOfferTime;
        if (elapsed < 15000) {
          const remainingSec = Math.ceil((15000 - elapsed) / 1000);
          throw new Error(`Cooldown active: Please wait ${remainingSec} second${remainingSec > 1 ? 's' : ''} before resubmitting an offer. Time between submitted offers must be at least 15 seconds.`);
        }
      }
      
      const existing = await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(doc(db, 'users', buyerId));
        const userData = userDoc.exists() ? userDoc.data() : null;
        if (
          userData?.isBlocked || 
          userData?.moderationStatus === 'BANNED' || 
          userData?.moderationStatus === 'SUSPENDED' ||
          userData?.isBanned === true ||
          userData?.accountStatus === 'banned' ||
          userData?.status === 'BANNED' ||
          userData?.offersDisabled === true ||
          userData?.negotiationsDisabled === true ||
          userData?.canSubmitOffers === false ||
          userData?.canNegotiate === false
        ) {
          throw new Error('Action denied: Your account has been restricted or banned by administration from submitting offers.');
        }

        const auctionDoc = await transaction.get(doc(db, 'arena_auctions', auctionId));
        if (!auctionDoc.exists()) throw new Error('Auction not found');
        
        const auctionData = auctionDoc.data() as AuctionItem;
        const endTime = parseSafeDate(auctionData.endTime);
        const now = new Date();
        const statusStr = (auctionData.status as string || '').toLowerCase();

        // 1. Expired check
        if ((endTime && now > endTime) || statusStr === 'expired' || statusStr === 'ended' || statusStr === 'closed') {
          throw new Error('Action denied: Posted item has expired and is no longer accepting offers.');
        }

        // 2. Force stopped by admin check
        const isForceStopped = 
          (auctionData as any).isForceStopped || 
          (auctionData as any).forceStopped || 
          (auctionData as any).isStoppedByAdmin || 
          (auctionData as any).forceStoppedByAdmin ||
          (auctionData as any).closedOnViolation ||
          statusStr === 'stopped' || 
          statusStr === 'force_stopped' || 
          statusStr === 'force_closed' || 
          statusStr === 'stopped_by_admin' || 
          statusStr === 'banned' || 
          statusStr === 'cancelled';
        
        if (isForceStopped) {
          throw new Error('Action denied: Posted item has been force-stopped by administration and is closed for offers.');
        }

        // 3. Paused by seller or admin check
        const isPausedByAdmin = (auctionData as any).isPausedByAdmin || (auctionData as any).pausedBy === 'admin' || statusStr === 'paused_by_admin' || statusStr === 'admin_paused';
        const isPausedBySeller = (auctionData as any).isPausedBySeller || (auctionData as any).isPaused || (auctionData as any).pausedBy === 'seller' || statusStr === 'paused' || statusStr === 'paused_by_seller';
        
        if (isPausedByAdmin) {
          throw new Error('Action denied: Posted item is currently paused by administration.');
        }
        if (isPausedBySeller) {
          throw new Error('Action denied: Posted item is currently paused by the seller.');
        }

        if (statusStr !== 'active' && statusStr !== 'open') {
          throw new Error(`Action denied: Posted item is not active for receiving offers (Status: ${auctionData.status}).`);
        }

        const authoritativeSellerUid = await resolveAuthoritativeSellerUid(
          auctionId,
          auctionData
        );

        const isAuthoritativeSeller = Boolean(
          (authoritativeSellerUid && buyerId === authoritativeSellerUid) ||
          (!auctionData.isNegotiationOnly && auctionData.sellerId && buyerId === auctionData.sellerId)
        );

        if (isAuthoritativeSeller) {
          throw new Error('Action denied: Sellers cannot submit offers for their own listed items.');
        }

        const sellerId = auctionData.sellerId;

        const isDemo = isDemoCreditModeActive();
        let balanceBefore = 0;
        let balanceAfter = 0;
        let totalCreditsSpent = 0;
        let idempotencyKey = '';
        let txDocRef: any = null;

        if (isDemo) {
          const demoBalance = DemoCreditsService.getDemoBalance(buyerId);
          if (demoBalance < 1) {
            throw new Error(`INSUFFICIENT_CREDITS: You need at least 1 DEMO credit to submit a strategic offer. Current DEMO balance: ${demoBalance}`);
          }
        } else {
          const currentCredits = userData?.creditsBalance || 0;
          if (currentCredits < 1) {
            throw new Error("INSUFFICIENT_CREDITS: You need at least 1 credit to submit an offer.");
          }

          idempotencyKey = `ik_${buyerId}_NEGOTIATION_OFFER_${auctionId}_1`;
          txDocRef = doc(db, 'credit_transactions', idempotencyKey);

          const txDoc = await transaction.get(txDocRef);
          if (txDoc.exists()) {
            throw new Error("DUPLICATE_TRANSACTION: This offer transaction has already been processed.");
          }

          balanceBefore = currentCredits;
          balanceAfter = currentCredits - 1;
          if (balanceAfter < 0) {
            throw new Error("INSUFFICIENT_CREDITS: Credit balance cannot be negative.");
          }
          totalCreditsSpent = (userData?.totalCreditsSpent || 0) + 1;
        }

        const finalMessage = message && message.trim() ? message.trim() : `Initial strategic offer: ${auctionData.currencySymbol || auctionData.currency || 'Rs.'}${initialOffer.toLocaleString()}`;

        const negRef = doc(collection(db, 'arena_negotiations'));
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        const sellerAlias = ALIASES[Math.floor(Math.random() * ALIASES.length)];

        const negotiation: Partial<Negotiation> = {
          id: negRef.id,
          auctionId,
          buyerId,
          sellerId,
          status: NegotiationStatus.OFFER_SENT,
          lastOfferAmount: initialOffer,
          lastOfferBy: buyerId,
          createdAt: new Date(), // Transaction will use serverTimestamp via setDoc if preferred but we use local for interface
          expiresAt,
          sellerAlias,
          offerCycleCount: 1,
          offerCount: 1,
          currency: auctionData.currency || 'PKR',
          currencySymbol: auctionData.currencySymbol || 'Rs.',
          itemTitle: auctionData.title || '',
          itemImage: auctionData.images?.[0] || '',
          itemPrice: auctionData.startingPrice || 0
        };

        transaction.set(negRef, {
          ...negotiation,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastBuyerOfferAt: serverTimestamp(),
          expiresAt: Timestamp.fromDate(expiresAt)
        });

        if (isDemo) {
          DemoCreditsService.deductDemoCreditForNegotiationOffer(
            buyerId,
            negRef.id,
            auctionData.title || 'Strategic Asset',
            1,
            false
          );
        } else {
          // 1. Update User Document (Deduct 1 credit, increment total spent in Firestore)
          transaction.update(doc(db, 'users', buyerId), {
            creditsBalance: balanceAfter,
            totalCreditsSpent: totalCreditsSpent,
            creditsLastUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          // 2. Create Credit Transaction Ledger Record in Firestore
          transaction.set(txDocRef, {
            userId: buyerId,
            amount: -1,
            balanceBefore,
            balanceAfter,
            type: 'NEGOTIATION_OFFER',
            relatedEntityId: negRef.id,
            sourceModule: 'NEGOTIATION',
            status: 'COMPLETED',
            idempotencyKey,
            description: `Credit deduction for strategic offer on ${auctionData.title || 'Strategic Asset'}`,
            createdAt: serverTimestamp(),
            createdBy: buyerId
          });
        }

        // Atomically update the auction item with the new bid and bids count
        const auctionRef = doc(db, 'arena_auctions', auctionId);
        transaction.update(auctionRef, {
          currentBid: initialOffer,
          bidsCount: increment(1),
          updatedAt: serverTimestamp()
        });

        // Write/update the public bid document for the buyer
        const bidRef = doc(db, 'arena_auctions', auctionId, 'bids', buyerId);
        transaction.set(bidRef, {
          id: buyerId,
          userId: buyerId,
          userName: userData?.name || "Anonymous Buyer",
          amount: initialOffer,
          timestamp: serverTimestamp(),
          message: message || finalMessage || 'Initial strategic offer.',
          auctionId,
          status: NegotiationStatus.OFFER_SENT,
          negotiationId: negRef.id,
          currency: auctionData.currency || 'PKR',
          currencySymbol: auctionData.currencySymbol || 'Rs.',
          lastOfferBy: buyerId
        }, { merge: true });

        const offerRef = doc(collection(db, 'arena_negotiations', negRef.id, 'offers'));
        transaction.set(offerRef, {
          negotiationId: negRef.id,
          senderId: buyerId,
          amount: initialOffer,
          message: message || '',
          timestamp: serverTimestamp(),
          action: 'send',
          currency: auctionData.currency || 'PKR',
          currencySymbol: auctionData.currencySymbol || 'Rs.'
        });

        // Create notification for seller (for normal Battle Bids; Private Negotiations are handled by trusted Cloud Function trigger)
        if (sellerId && !sellerId.startsWith('anon_seller_')) {
          const notifRef = doc(collection(db, 'users', sellerId, 'notifications'));
          transaction.set(notifRef, {
            type: 'private_offer',
            title: 'New Tactical Proposal',
            message: `A buyer has sent a private offer of ${auctionData.currencySymbol || auctionData.currency || 'Rs.'}${initialOffer.toLocaleString()} for your asset.`,
            link: `/negotiations/timeline/${negRef.id}`,
            auctionId,
            userId: sellerId,
            isRead: false,
            timestamp: serverTimestamp()
          });
        }

        return negRef.id;
      });

      return existing;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'arena_negotiations');
      throw err;
    }
  },

  /**
   * Subscribes to a specific negotiation with memoization.
   */
  subscribeToNegotiation(negId: string, callback: (neg: Negotiation | null) => void) {
    if (negListeners[negId]) {
      negListeners[negId].callbacks.add(callback);
      if (negListeners[negId].lastData !== undefined) {
        callback(negListeners[negId].lastData);
      }
    } else {
      const docRef = doc(db, 'arena_negotiations', negId);
      const callbacks = new Set([callback]);
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        let neg: Negotiation | null = null;
        if (docSnap.exists()) {
          const data = docSnap.data();
          neg = {
            ...data,
            id: docSnap.id,
            createdAt: parseSafeDate(data.createdAt),
            updatedAt: parseSafeDate(data.updatedAt),
            expiresAt: parseSafeDate(data.expiresAt),
            acceptedAt: parseSafeDate(data.acceptedAt),
            contactRequestedAt: parseSafeDate(data.contactRequestedAt),
            contactSharedAt: parseSafeDate(data.contactSharedAt)
          } as Negotiation;
        }
        
        if (negListeners[negId]) {
          negListeners[negId].lastData = neg;
          negListeners[negId].callbacks.forEach(cb => cb(neg));
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, `arena_negotiations/${negId}`);
      });

      negListeners[negId] = { unsubscribe, callbacks, lastData: null };
    }

    return () => {
      if (negListeners[negId]) {
        negListeners[negId].callbacks.delete(callback);
        if (negListeners[negId].callbacks.size === 0) {
          negListeners[negId].unsubscribe();
          delete negListeners[negId];
        }
      }
    };
  },

  /**
   * Subscribes to offers for a negotiation with memoization.
   */
  subscribeToOffers(negId: string, callback: (offers: NegotiationOffer[]) => void) {
    if (offersListeners[negId]) {
      offersListeners[negId].callbacks.add(callback);
      if (offersListeners[negId].lastData !== undefined) {
        callback(offersListeners[negId].lastData);
      }
    } else {
      const q = query(
        collection(db, 'arena_negotiations', negId, 'offers'),
        orderBy('timestamp', 'asc')
      );
      
      const callbacks = new Set([callback]);
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const offers = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
          timestamp: parseSafeDate(docSnap.data().timestamp)
        })) as NegotiationOffer[];
        
        if (offersListeners[negId]) {
          offersListeners[negId].lastData = offers;
          offersListeners[negId].callbacks.forEach(cb => cb(offers));
        }
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, `arena_negotiations/${negId}/offers`);
      });

      offersListeners[negId] = { unsubscribe, callbacks, lastData: [] };
    }

    return () => {
      if (offersListeners[negId]) {
        offersListeners[negId].callbacks.delete(callback);
        if (offersListeners[negId].callbacks.size === 0) {
          offersListeners[negId].unsubscribe();
          delete offersListeners[negId];
        }
      }
    };
  },

  /**
   * Sends a counter offer.
   */
  async sendCounterOffer(
    negId: string, 
    userId: string, 
    amount: number, 
    message?: string
  ): Promise<void> {
    if (!userId || typeof userId !== 'string' || !userId.trim() || userId === 'guest' || userId === 'unauthenticated') {
      throw new Error('Authentication required: You must be logged in to send a counter offer.');
    }
    let resolvedNegId = negId;
    try {
      let initialNegSnap = await getDoc(doc(db, 'arena_negotiations', negId));

      // If exact negId was not found (e.g. auction-xxx or empty-xxx), check if there is an existing negotiation doc for this auction
      if (!initialNegSnap.exists()) {
        let extractedAuctionId = negId;
        if (negId.startsWith('auction-')) extractedAuctionId = negId.replace('auction-', '');
        else if (negId.startsWith('empty-')) extractedAuctionId = negId.replace('empty-', '');
        else if (negId.startsWith('item-')) extractedAuctionId = negId.replace('item-', '');

        const qNegs = query(
          collection(db, 'arena_negotiations'),
          where('auctionId', '==', extractedAuctionId)
        );
        const qSnap = await getDocs(qNegs);
        
        let matchedDoc = null;
        if (qSnap.docs.length > 0) {
          matchedDoc = qSnap.docs.find(d => d.data().buyerId === userId);
          if (!matchedDoc) {
            matchedDoc = qSnap.docs.find(d => !['cancelled', 'expired'].includes(d.data().status)) || qSnap.docs[0];
          }
        }

        if (matchedDoc) {
          resolvedNegId = matchedDoc.id;
          initialNegSnap = matchedDoc;
        }
      }
      
      if (!initialNegSnap.exists()) {
        // Fallback: If negotiation document does not exist in Firestore yet, auto-create it smoothly!
        let extractedAuctionId = negId;
        if (negId.startsWith('auction-')) extractedAuctionId = negId.replace('auction-', '');
        else if (negId.startsWith('empty-')) extractedAuctionId = negId.replace('empty-', '');
        else if (negId.startsWith('item-')) extractedAuctionId = negId.replace('item-', '');

        const auctionSnap = await getDoc(doc(db, 'arena_auctions', extractedAuctionId));
        if (!auctionSnap.exists()) {
          throw new Error('Listing or item not found. Unable to submit offer.');
        }
        const auctionData = auctionSnap.data() as AuctionItem;
        const sellerId = auctionData.sellerId || 'seller';
        const authoritativeSellerUid = await resolveAuthoritativeSellerUid(
          extractedAuctionId,
          auctionData
        );
        const isCallerSeller = Boolean(
          (authoritativeSellerUid && userId === authoritativeSellerUid) ||
          (!auctionData.isNegotiationOnly && (userId === sellerId || userId === 'seller' || userId === 'simulated-seller'))
        );

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        const sellerAlias = ALIASES[Math.floor(Math.random() * ALIASES.length)];

        if (isCallerSeller) {
          // SELLER is submitting a counter-offer against a buyer's offer/bid!
          const bidsSnap = await getDocs(collection(db, 'arena_auctions', extractedAuctionId, 'bids'));
          const buyerBid = bidsSnap.docs.map(d => d.data()).find(b => b.userId !== sellerId && b.userId) || bidsSnap.docs[0]?.data();
          const targetBuyerId = buyerBid?.userId || buyerBid?.id || 'buyer';

          const finalMessage = message && message.trim() ? message.trim() : `Seller counter-offer: ${auctionData.currencySymbol || auctionData.currency || 'Rs.'}${amount.toLocaleString()}`;

          await runTransaction(db, async (transaction) => {
            const negRef = doc(db, 'arena_negotiations', negId);
            const userDoc = await transaction.get(doc(db, 'users', userId));
            const userData = userDoc.exists() ? userDoc.data() : null;
            if (
              userData?.isBlocked || 
              userData?.moderationStatus === 'BANNED' || 
              userData?.moderationStatus === 'SUSPENDED' ||
              userData?.isBanned === true ||
              userData?.accountStatus === 'banned' ||
              userData?.status === 'BANNED' ||
              userData?.offersDisabled === true ||
              userData?.negotiationsDisabled === true ||
              userData?.canSubmitOffers === false ||
              userData?.canNegotiate === false
            ) {
              throw new Error('Action denied: Your account has been restricted or banned by administration from submitting offers.');
            }

            transaction.set(negRef, {
              id: negId,
              auctionId: extractedAuctionId,
              buyerId: targetBuyerId,
              sellerId: sellerId,
              status: NegotiationStatus.COUNTER_OFFERED,
              lastOfferAmount: amount,
              lastOfferBy: sellerId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              expiresAt: Timestamp.fromDate(expiresAt),
              sellerAlias,
              offerCount: 1,
              currency: auctionData.currency || 'PKR',
              currencySymbol: auctionData.currencySymbol || 'Rs.',
              itemTitle: auctionData.title || '',
              itemImage: auctionData.images?.[0] || '',
              itemPrice: auctionData.startingPrice || 0
            });

            // Update public bid
            const bidRef = doc(db, 'arena_auctions', extractedAuctionId, 'bids', targetBuyerId);
            transaction.set(bidRef, {
              id: targetBuyerId,
              userId: targetBuyerId,
              amount,
              timestamp: serverTimestamp(),
              message: finalMessage,
              auctionId: extractedAuctionId,
              status: NegotiationStatus.COUNTER_OFFERED,
              negotiationId: negId,
              currency: auctionData.currency || 'PKR',
              currencySymbol: auctionData.currencySymbol || 'Rs.',
              lastOfferBy: sellerId
            }, { merge: true });

            const offerRef = doc(collection(db, 'arena_negotiations', negId, 'offers'));
            transaction.set(offerRef, {
              negotiationId: negId,
              senderId: sellerId,
              amount,
              message: finalMessage,
              timestamp: serverTimestamp(),
              action: 'counter',
              currency: auctionData.currency || 'PKR',
              currencySymbol: auctionData.currencySymbol || 'Rs.'
            });

            if (targetBuyerId && targetBuyerId !== 'buyer') {
              const notifRef = doc(collection(db, 'users', targetBuyerId, 'notifications'));
              transaction.set(notifRef, {
                type: 'private_offer',
                title: 'Tactical Counter-Offer',
                message: `The seller has proposed a counter-offer of ${auctionData.currencySymbol || auctionData.currency || 'Rs.'}${amount.toLocaleString()} for ${auctionData.title || 'the asset'}.`,
                link: `/negotiations/timeline/${negId}`,
                auctionId: extractedAuctionId,
                userId: targetBuyerId,
                isRead: false,
                timestamp: serverTimestamp()
              });
            }
          });
          return;
        }

        // Caller is a BUYER submitting an initial offer
        const buyerId = userId;
        const isSelfNegotiation = Boolean(
          isCallerSeller ||
          (authoritativeSellerUid && buyerId === authoritativeSellerUid) ||
          (!auctionData.isNegotiationOnly && buyerId === sellerId)
        );
        if (isSelfNegotiation) {
          throw new Error('Action denied: Sellers cannot submit initial offers for their own listed items.');
        }

        const finalMessage = message && message.trim() ? message.trim() : `Initial strategic offer: ${auctionData.currencySymbol || auctionData.currency || 'Rs.'}${amount.toLocaleString()}`;

        await runTransaction(db, async (transaction) => {
          const negRef = doc(db, 'arena_negotiations', negId);
          const userDoc = await transaction.get(doc(db, 'users', buyerId));
          const userData = userDoc.exists() ? userDoc.data() : null;
          if (
            userData?.isBlocked || 
            userData?.moderationStatus === 'BANNED' || 
            userData?.moderationStatus === 'SUSPENDED' ||
            userData?.isBanned === true ||
            userData?.accountStatus === 'banned' ||
            userData?.status === 'BANNED' ||
            userData?.offersDisabled === true ||
            userData?.negotiationsDisabled === true ||
            userData?.canSubmitOffers === false ||
            userData?.canNegotiate === false
          ) {
            throw new Error('Action denied: Your account has been restricted or banned by administration from submitting offers.');
          }

          const isDemo = isDemoCreditModeActive();
          let balanceBefore = 0;
          let balanceAfter = 0;
          let totalCreditsSpent = 0;
          let idempotencyKey = '';
          let txDocRef: any = null;

          if (isDemo) {
            const demoBalance = DemoCreditsService.getDemoBalance(buyerId);
            if (demoBalance < 1) {
              throw new Error(`INSUFFICIENT_CREDITS: You need at least 1 DEMO credit to make an offer. Current DEMO balance: ${demoBalance}`);
            }
          } else {
            const currentCredits = userData?.creditsBalance || 0;
            if (currentCredits < 1) {
              throw new Error("INSUFFICIENT_CREDITS: You need at least 1 credit to submit an offer.");
            }

            idempotencyKey = `ik_${buyerId}_NEGOTIATION_OFFER_${extractedAuctionId}_1`;
            txDocRef = doc(db, 'credit_transactions', idempotencyKey);

            const txDoc = await transaction.get(txDocRef);
            if (txDoc.exists()) {
              throw new Error("DUPLICATE_TRANSACTION: This offer transaction has already been processed.");
            }

            balanceBefore = currentCredits;
            balanceAfter = currentCredits - 1;
            if (balanceAfter < 0) {
              throw new Error("INSUFFICIENT_CREDITS: Credit balance cannot be negative.");
            }
            totalCreditsSpent = (userData?.totalCreditsSpent || 0) + 1;
          }
          
          transaction.set(negRef, {
            id: negId,
            auctionId: extractedAuctionId,
            buyerId,
            sellerId,
            status: NegotiationStatus.OFFER_SENT,
            lastOfferAmount: amount,
            lastOfferBy: buyerId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            expiresAt: Timestamp.fromDate(expiresAt),
            sellerAlias,
            offerCount: 1,
            currency: auctionData.currency || 'PKR',
            currencySymbol: auctionData.currencySymbol || 'Rs.',
            itemTitle: auctionData.title || '',
            itemImage: auctionData.images?.[0] || '',
            itemPrice: auctionData.startingPrice || 0
          });

          if (isDemo) {
            DemoCreditsService.deductDemoCreditForNegotiationOffer(
              buyerId,
              negId,
              auctionData.title || 'Strategic Asset',
              1,
              false
            );
          } else {
            // 1. Update User Document (Deduct 1 credit, increment total spent in Firestore)
            transaction.update(doc(db, 'users', buyerId), {
              creditsBalance: balanceAfter,
              totalCreditsSpent: totalCreditsSpent,
              creditsLastUpdatedAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });

            // 2. Create Credit Transaction Ledger Record in Firestore
            transaction.set(txDocRef, {
              userId: buyerId,
              amount: -1,
              balanceBefore,
              balanceAfter,
              type: 'NEGOTIATION_OFFER',
              relatedEntityId: negId,
              sourceModule: 'NEGOTIATION',
              status: 'COMPLETED',
              idempotencyKey,
              description: `Credit deduction for strategic offer on ${auctionData.title || 'Strategic Asset'}`,
              createdAt: serverTimestamp(),
              createdBy: buyerId
            });
          }

          // Update public bid
          const bidRef = doc(db, 'arena_auctions', extractedAuctionId, 'bids', buyerId);
          transaction.set(bidRef, {
            id: buyerId,
            userId: buyerId,
            userName: userData?.name || "Anonymous Buyer",
            amount,
            timestamp: serverTimestamp(),
            message: finalMessage,
            auctionId: extractedAuctionId,
            status: NegotiationStatus.OFFER_SENT,
            negotiationId: negId,
            currency: auctionData.currency || 'PKR',
            currencySymbol: auctionData.currencySymbol || 'Rs.',
            lastOfferBy: buyerId
          }, { merge: true });

          const offerRef = doc(collection(db, 'arena_negotiations', negId, 'offers'));
          transaction.set(offerRef, {
            negotiationId: negId,
            senderId: buyerId,
            amount,
            message: finalMessage,
            timestamp: serverTimestamp(),
            action: 'send'
          });

          if (sellerId && !sellerId.startsWith('anon_seller_')) {
            const notifRef = doc(collection(db, 'users', sellerId, 'notifications'));
            transaction.set(notifRef, {
              type: 'private_offer',
              title: 'New Tactical Proposal',
              message: `A buyer has sent a private offer of ${auctionData.currencySymbol || auctionData.currency || 'Rs.'}${amount.toLocaleString()} for your asset.`,
              link: `/negotiations/timeline/${negId}`,
              auctionId: extractedAuctionId,
              userId: sellerId,
              isRead: false,
              timestamp: serverTimestamp()
            });
          }
        });
        return;
      }

      const initialNegData = initialNegSnap.data() as Negotiation;
      const authoritativeSellerUid = await resolveAuthoritativeSellerUid(initialNegData.auctionId);
      const isSeller = Boolean(
        (authoritativeSellerUid && userId === authoritativeSellerUid) ||
        userId === initialNegData.sellerId || 
        userId === 'seller' || 
        userId === 'simulated-seller'
      );
      const isBuyer = Boolean(
        !isSeller && (
          userId === initialNegData.buyerId || 
          userId === 'buyer' || 
          userId === 'simulated-buyer'
        )
      );

      // 10-offer limit only applies to the BUYER
      if (isBuyer && !isSeller) {
        const q = query(
          collection(db, 'arena_negotiations'),
          where('buyerId', '==', userId),
          where('auctionId', '==', initialNegData.auctionId)
        );
        const qSnap = await getDocs(q);
        const totalUsedOffers = qSnap.docs.reduce((sum, docSnap) => sum + (docSnap.data().offerCount || 0), 0);

        if (totalUsedOffers >= (ARENA_CONFIG.MAX_OFFERS_PER_BUYER || 10)) {
          throw new Error(`Strategic limit reached: Maximum of ${ARENA_CONFIG.MAX_OFFERS_PER_BUYER || 10} offers allowed per listing.`);
        }
      }

      await runTransaction(db, async (transaction) => {
        const negRef = doc(db, 'arena_negotiations', resolvedNegId);
        const negSnap = await transaction.get(negRef);
        
        if (!negSnap.exists()) throw new Error('Negotiation not found');
        const negData = negSnap.data() as Negotiation & { offerCount?: number };

        const auctionDoc = await transaction.get(doc(db, 'arena_auctions', negData.auctionId));
        if (auctionDoc.exists()) {
          const auctionData = auctionDoc.data() as AuctionItem;
          const endTime = parseSafeDate(auctionData.endTime);
          const now = new Date();
          const statusStr = (auctionData.status as string || '').toLowerCase();

          // 1. Expired check
          if ((endTime && now > endTime) || statusStr === 'expired' || statusStr === 'ended' || statusStr === 'closed') {
            throw new Error('Action denied: Posted item has expired and is no longer accepting offers.');
          }

          // 2. Force stopped by admin check
          const isForceStopped = 
            (auctionData as any).isForceStopped || 
            (auctionData as any).forceStopped || 
            (auctionData as any).isStoppedByAdmin || 
            (auctionData as any).forceStoppedByAdmin ||
            (auctionData as any).closedOnViolation ||
            statusStr === 'stopped' || 
            statusStr === 'force_stopped' || 
            statusStr === 'force_closed' || 
            statusStr === 'stopped_by_admin' || 
            statusStr === 'banned' || 
            statusStr === 'cancelled';
          
          if (isForceStopped) {
            throw new Error('Action denied: Posted item has been force-stopped by administration and is closed for offers.');
          }

          // 3. Paused by seller or admin check
          const isPausedByAdmin = (auctionData as any).isPausedByAdmin || (auctionData as any).pausedBy === 'admin' || statusStr === 'paused_by_admin' || statusStr === 'admin_paused';
          const isPausedBySeller = (auctionData as any).isPausedBySeller || (auctionData as any).isPaused || (auctionData as any).pausedBy === 'seller' || statusStr === 'paused' || statusStr === 'paused_by_seller';
          
          if (isPausedByAdmin) {
            throw new Error('Action denied: Posted item is currently paused by administration.');
          }
          if (isPausedBySeller) {
            throw new Error('Action denied: Posted item is currently paused by the seller.');
          }

          if (statusStr !== 'active' && statusStr !== 'open') {
            throw new Error(`Action denied: Posted item is not active for receiving offers (Status: ${auctionData.status}).`);
          }
        }

        // Check if negotiation is already accepted/concluded
        const currentNegStatus = (negData.status || '').toLowerCase();
        if (['accepted', 'completed', 'concluded'].includes(currentNegStatus)) {
          throw new Error('Action denied: This negotiation has already been accepted and finalized.');
        }

        const finalMessage = message && message.trim() ? message.trim() : `Proposed offer: ${negData.currencySymbol || negData.currency || 'Rs.'}${amount.toLocaleString()}`;

        const userDoc = await transaction.get(doc(db, 'users', userId));
        const userData = userDoc.exists() ? userDoc.data() : null;
        if (
          userData?.isBlocked || 
          userData?.moderationStatus === 'BANNED' || 
          userData?.moderationStatus === 'SUSPENDED' ||
          userData?.isBanned === true ||
          userData?.accountStatus === 'banned' ||
          userData?.status === 'BANNED' ||
          userData?.offersDisabled === true ||
          userData?.negotiationsDisabled === true ||
          userData?.canSubmitOffers === false ||
          userData?.canNegotiate === false
        ) {
          throw new Error('Action denied: Your account has been restricted or banned by administration from submitting offers.');
        }

        // Pre-fetch buyer document during initial read phase to ensure all transaction reads execute before writes
        const buyerDoc = userId === negData.buyerId ? userDoc : await transaction.get(doc(db, 'users', negData.buyerId));
        const buyerData = buyerDoc.exists() ? buyerDoc.data() : null;
        const buyerName = buyerData?.name || "Anonymous Buyer";

        // 15-second minimum gap between buyer's earlier submitted offer and a new offer / counter offer (only applies to buyer)
        if (userId === negData.buyerId && !isSeller) {
          const lastBuyerOfferDate = parseSafeDate((negData as any).lastBuyerOfferAt);
          let lastBuyerOfferTime = lastBuyerOfferDate ? lastBuyerOfferDate.getTime() : 0;

          if (!lastBuyerOfferTime && negData.lastOfferBy === negData.buyerId && negData.updatedAt) {
            lastBuyerOfferTime = parseSafeDate(negData.updatedAt)?.getTime() || 0;
          }

          if (lastBuyerOfferTime > 0) {
            const elapsed = Date.now() - lastBuyerOfferTime;
            if (elapsed < 15000) {
              const remainingSec = Math.ceil((15000 - elapsed) / 1000);
              throw new Error(`Cooldown active: Please wait ${remainingSec} second${remainingSec > 1 ? 's' : ''} before resubmitting an offer. Time between submitted offers must be at least 15 seconds.`);
            }
          }
        }

        // Sequential offer restriction (turn validation - enforced when submitted offer is pending/under process)
        if (negData.lastOfferBy === userId && negData.lastOfferBy && (
          negData.status === NegotiationStatus.OFFER_SENT ||
          negData.status === NegotiationStatus.COUNTER_OFFERED
        )) {
          throw new Error('Action denied: Your submitted offer is under process. You cannot send another offer until the counterparty responds (accepts, declines, or counters) or the offer is rejected or expired.');
        }

        // Validation - DECLINED and WITHDRAWN are terminal for that offer cycle and cannot be countered
        const allowedStatuses = [
          NegotiationStatus.OPEN,
          NegotiationStatus.OFFER_SENT,
          NegotiationStatus.COUNTER_OFFERED
        ];
        if (!allowedStatuses.includes(negData.status)) {
          throw new Error(`Invalid negotiation state for counter-offer submission. A declined or withdrawn negotiation is closed; please start a new offer cycle to submit a new proposal.`);
        }
        if (amount <= 0) throw new Error('Amount must be positive');

        const nextStatus = negData.status === NegotiationStatus.OPEN 
          ? NegotiationStatus.OFFER_SENT 
          : NegotiationStatus.COUNTER_OFFERED;

        const updatePayload: any = {
          status: nextStatus,
          lastOfferAmount: amount,
          lastOfferBy: userId,
          updatedAt: serverTimestamp(),
          offerCount: negData.offerCount || 1,
          offerCycleCount: negData.offerCycleCount || 1
        };

        if (userId === negData.buyerId) {
          updatePayload.lastBuyerOfferAt = serverTimestamp();
        }

        transaction.update(negRef, updatePayload);

        // Write/update the public bid document for the buyer
        const bidRef = doc(db, 'arena_auctions', negData.auctionId, 'bids', negData.buyerId);
        transaction.set(bidRef, {
          id: negData.buyerId,
          userId: negData.buyerId,
          userName: buyerName,
          amount,
          timestamp: serverTimestamp(),
          message: finalMessage,
          auctionId: negData.auctionId,
          status: nextStatus,
          negotiationId: resolvedNegId,
          currency: negData.currency || 'PKR',
          currencySymbol: negData.currencySymbol || 'Rs.',
          lastOfferBy: userId
        }, { merge: true });

        // Atomically update the auction item currentBid if this is a buyer counter offer
        if (userId === negData.buyerId) {
          const auctionRef = doc(db, 'arena_auctions', negData.auctionId);
          transaction.update(auctionRef, {
            currentBid: amount,
            updatedAt: serverTimestamp()
          });
        }

        const offerRef = doc(collection(db, 'arena_negotiations', resolvedNegId, 'offers'));
        transaction.set(offerRef, {
          negotiationId: resolvedNegId,
          senderId: userId,
          amount,
          message: finalMessage,
          timestamp: serverTimestamp(),
          action: 'counter',
          currency: negData.currency || 'PKR',
          currencySymbol: negData.currencySymbol || 'Rs.'
        });

        // Notify other party (Seller->buyer delivers to buyer UID; Private buyer->seller is handled by trusted Cloud Function trigger)
        const recipientId = userId === negData.buyerId ? negData.sellerId : negData.buyerId;
        if (recipientId && !recipientId.startsWith('anon_seller_')) {
          const notifRef = doc(collection(db, 'users', recipientId, 'notifications'));
          transaction.set(notifRef, {
            type: 'private_offer',
            title: 'Tactical Counter-Offer',
            message: `The ${userId === negData.buyerId ? 'buyer' : 'seller'} has proposed a new deal: ${negData.currencySymbol || negData.currency || 'Rs.'}${amount.toLocaleString()}.`,
            link: `/negotiations/timeline/${resolvedNegId}`,
            auctionId: negData.auctionId,
            userId: recipientId,
            isRead: false,
            timestamp: serverTimestamp()
          });
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_negotiations/${resolvedNegId}/counter`);
      throw err;
    }
  },

  /**
   * Responds to an offer (Accept, Decline, Withdraw, Cancel).
   */
  async respondToOffer(
    negId: string, 
    userId: string, 
    action: 'accept' | 'decline' | 'withdraw' | 'cancel',
    message?: string
  ): Promise<void> {
    try {
      let resolvedNegId = negId;
      let initialNegData: Negotiation | null = null;

      // First check if negotiation document exists directly
      const { resolvedId, snap } = await resolveNegId(negId, userId);
      resolvedNegId = resolvedId;

      if (snap && snap.exists()) {
        initialNegData = snap.data() as Negotiation;
      } else {
        if (action === 'withdraw') {
          // If negotiation doc doesn't exist, clean up any corresponding bid in arena_auctions
          let extractedAuctionId = negId;
          if (negId.startsWith('auction-')) extractedAuctionId = negId.replace('auction-', '');
          else if (negId.startsWith('empty-')) extractedAuctionId = negId.replace('empty-', '');
          else if (negId.startsWith('item-')) extractedAuctionId = negId.replace('item-', '');

          const bidRef = doc(db, 'arena_auctions', extractedAuctionId, 'bids', userId);
          await deleteDoc(bidRef).catch(() => {});

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('arena_offer_withdrawn', {
              detail: { negotiationId: resolvedNegId, auctionId: extractedAuctionId, buyerId: userId }
            }));
          }
          return;
        }

        const ensured = await ensureNegotiationDoc(
          negId, 
          userId, 
          action === 'accept' ? NegotiationStatus.ACCEPTED : NegotiationStatus.OPEN
        );
        resolvedNegId = ensured.resolvedId;
        initialNegData = ensured.data;
      }

      let removedAuctionId = '';
      let removedBuyerId = '';

      await runTransaction(db, async (transaction) => {
        const negRef = doc(db, 'arena_negotiations', resolvedNegId);
        const negSnap = await transaction.get(negRef);
        
        if (!negSnap.exists()) {
          if (action === 'withdraw') return;
          throw new Error('Negotiation not found');
        }
        const negData = negSnap.data() as Negotiation;

        if (action === 'withdraw') {
          const isOfferSender = (negData.lastOfferBy && negData.lastOfferBy === userId) || (userId === negData.buyerId && (negData.status === 'open' || negData.status === 'offer_sent'));
          if (!isOfferSender && userId !== negData.sellerId) {
            throw new Error('Action denied: Only the exact user who submitted the active offer can withdraw it.');
          }
          const currentNegStatus = (negData.status || '').toLowerCase();
          if (currentNegStatus === 'accepted' || currentNegStatus === 'completed' || currentNegStatus === 'concluded') {
            throw new Error('Action denied: Accepted or concluded offers cannot be withdrawn.');
          }
          if (currentNegStatus === 'expired') {
            throw new Error('Action denied: Expired offers cannot be withdrawn.');
          }
          if (currentNegStatus === 'declined') {
            throw new Error('Action denied: Offer has already been rejected.');
          }
          if (currentNegStatus === 'withdrawn') {
            throw new Error('Action denied: Offer has already been withdrawn.');
          }
          if (currentNegStatus === 'cancelled') {
            throw new Error('Action denied: Cancelled negotiations cannot be withdrawn.');
          }

          removedAuctionId = negData.auctionId;
          removedBuyerId = negData.buyerId;

          // 1. Create a withdrawal offer event before deleting the negotiation root
          const offerRef = doc(collection(db, 'arena_negotiations', resolvedNegId, 'offers'));
          transaction.set(offerRef, {
            negotiationId: resolvedNegId,
            auctionId: negData.auctionId,
            buyerId: negData.buyerId,
            sellerId: negData.sellerId,
            isNegotiationOnly: Boolean((negData as any).isNegotiationOnly || negData.sellerId?.startsWith('anon_seller_')),
            senderId: userId,
            amount: negData.lastOfferAmount || 0,
            message: 'Offer withdrawn by buyer.',
            timestamp: serverTimestamp(),
            action: 'withdraw',
            currency: negData.currency || 'USD',
            currencySymbol: negData.currencySymbol || '$'
          });

          // PERMANENT REMOVAL FROM SYSTEM:
          // 2. Permanently delete the public bid from the listing's bids subcollection
          if (negData.auctionId && negData.buyerId) {
            const bidRef = doc(db, 'arena_auctions', negData.auctionId, 'bids', negData.buyerId);
            transaction.delete(bidRef);
          }

          // 3. Permanently delete the negotiation document itself
          transaction.delete(negRef);

          // 4. Notify the counterparty for non-private / standard negotiations
          // (Private Negotiations with anon_seller_* are handled authoritatively by the Cloud Function trigger)
          const recipientId = userId === negData.buyerId ? negData.sellerId : negData.buyerId;
          if (recipientId && recipientId !== userId && !recipientId.startsWith('anon_seller_')) {
            const notifRef = doc(collection(db, 'users', recipientId, 'notifications'));
            transaction.set(notifRef, {
              type: 'offer_withdrawn',
              title: 'Submitted Offer Withdrawn',
              message: `A submitted offer has been withdrawn and permanently removed from the system.`,
              auctionId: negData.auctionId,
              userId: recipientId,
              isRead: false,
              timestamp: serverTimestamp()
            });
          }

          return;
        }

        // Verify listing status if attempting to accept or decline
        if (action === 'accept') {
          const currentNegStatus = (negData.status || '').toLowerCase();
          if (['accepted', 'completed', 'concluded'].includes(currentNegStatus)) {
            throw new Error('Action denied: This offer has already been accepted and finalized. You cannot accept the same offer again.');
          }

          const auctionDoc = await transaction.get(doc(db, 'arena_auctions', negData.auctionId));
          if (auctionDoc.exists()) {
            const auctionData = auctionDoc.data() as AuctionItem;
            const endTime = parseSafeDate(auctionData.endTime);
            const now = new Date();
            if (endTime && now > endTime) {
              throw new Error('Action denied: The listing time has expired. Offers cannot be accepted for expired items.');
            }
            const statusStr = (auctionData.status as string) || '';
            if (
              statusStr === 'force_closed' || 
              statusStr === 'banned' || 
              statusStr === 'suspended' || 
              (auctionData as any).moderationStatus === 'hidden' || 
              (auctionData as any).closedOnViolation === true || 
              (auctionData as any).forceStoppedByAdmin === true
            ) {
              throw new Error('Action denied: Listing has been force stopped or closed on violation by administration.');
            }
            if (
              statusStr === 'paused' || 
              statusStr === 'admin_paused' || 
              (auctionData as any).isPaused || 
              (auctionData as any).isPausedBySeller || 
              (auctionData as any).isPausedByAdmin
            ) {
              throw new Error('Action denied: Listing is currently paused. Unpause the listing to accept offers.');
            }
          }
        }

        let newStatus: NegotiationStatus;
        switch (action) {
          case 'accept': newStatus = NegotiationStatus.ACCEPTED; break;
          case 'decline': newStatus = NegotiationStatus.DECLINED; break;
          case 'cancel': newStatus = NegotiationStatus.CANCELLED; break;
          default: throw new Error('Invalid action');
        }

        const updatePayload: any = {
          status: newStatus,
          updatedAt: serverTimestamp()
        };
        if (action === 'accept') {
          updatePayload.acceptedAt = serverTimestamp();
          
          // Set listing status to concluded as requested
          const auctionRef = doc(db, 'arena_auctions', negData.auctionId);
          transaction.update(auctionRef, {
            status: 'concluded',
            updatedAt: serverTimestamp()
          });
        }

        transaction.update(negRef, updatePayload);

        // Update public bid
        const bidRef = doc(db, 'arena_auctions', negData.auctionId, 'bids', negData.buyerId);
        transaction.set(bidRef, {
          id: negData.buyerId,
          userId: negData.buyerId,
          status: newStatus,
          timestamp: serverTimestamp(),
          negotiationId: resolvedNegId
        }, { merge: true });

        const offerRef = doc(collection(db, 'arena_negotiations', resolvedNegId, 'offers'));
        transaction.set(offerRef, {
          negotiationId: resolvedNegId,
          senderId: userId,
          amount: negData.lastOfferAmount || 0,
          message: message || '',
          timestamp: serverTimestamp(),
          action: action,
          currency: negData.currency || 'USD',
          currencySymbol: negData.currencySymbol || '$'
        });

        // Notify other party (Seller->buyer delivers to buyer UID; Private buyer->seller is handled by trusted Cloud Function trigger)
        const recipientId = userId === negData.buyerId ? negData.sellerId : negData.buyerId;
        if (recipientId && !recipientId.startsWith('anon_seller_')) {
          const notifRef = doc(collection(db, 'users', recipientId, 'notifications'));
          transaction.set(notifRef, {
            type: 'offer_accepted',
            title: `Proposal ${action.charAt(0).toUpperCase() + action.slice(1)}ed`,
            message: `The tactical proposal has been ${action}ed.`,
            link: `/negotiations/timeline/${resolvedNegId}`,
            auctionId: negData.auctionId,
            userId: recipientId,
            isRead: false,
            timestamp: serverTimestamp()
          });
        }
      });

      // Post-transaction cleanup for withdrawal
      if (action === 'withdraw') {
        try {
          const subOffersSnap = await getDocs(collection(db, 'arena_negotiations', resolvedNegId, 'offers'));
          for (const oDoc of subOffersSnap.docs) {
            await deleteDoc(oDoc.ref).catch(() => {});
          }
        } catch (subErr) {
          console.warn('Offers subcollection cleanup warning:', subErr);
        }

        const auctionIdToClean = removedAuctionId || initialNegData?.auctionId;
        const buyerIdToClean = removedBuyerId || initialNegData?.buyerId || userId;

        if (auctionIdToClean && buyerIdToClean) {
          try {
            const extraBidRef = doc(db, 'arena_auctions', auctionIdToClean, 'bids', buyerIdToClean);
            await deleteDoc(extraBidRef).catch(() => {});
          } catch (extraErr) {
            console.warn('Extra bid cleanup warning:', extraErr);
          }
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('arena_offer_withdrawn', {
            detail: {
              negotiationId: resolvedNegId,
              auctionId: auctionIdToClean,
              buyerId: buyerIdToClean
            }
          }));
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_negotiations/${negId}/${action}`);
      throw err;
    }
  },

  /**
   * Completes a deal.
   */
  async completeDeal(negId: string, userId: string): Promise<void> {
    try {
      const { resolvedId: resolvedNegId } = await ensureNegotiationDoc(negId, userId, NegotiationStatus.ACCEPTED);

      await runTransaction(db, async (transaction) => {
        const negRef = doc(db, 'arena_negotiations', resolvedNegId);
        const negSnap = await transaction.get(negRef);
        if (!negSnap.exists()) throw new Error('Negotiation not found');
        const negData = negSnap.data() as Negotiation;
        
        const sellerContactEmail = (negData as any).sharedContactDetails?.email || 'N/A';
        const sellerContactPhone = (negData as any).sharedContactDetails?.phone || 'N/A';

        const currentStatusStr = (negData.status || '').toLowerCase();
        if (currentStatusStr !== 'accepted' && currentStatusStr !== 'completed' && currentStatusStr !== 'concluded') {
          throw new Error('Deal must be accepted before completion');
        }

        transaction.update(negRef, {
          status: NegotiationStatus.COMPLETED,
          updatedAt: serverTimestamp()
        });

        // Update public bid
        const bidRef = doc(db, 'arena_auctions', negData.auctionId, 'bids', negData.buyerId);
        transaction.set(bidRef, {
          id: negData.buyerId,
          userId: negData.buyerId,
          status: NegotiationStatus.COMPLETED,
          timestamp: serverTimestamp(),
          negotiationId: resolvedNegId
        }, { merge: true });

        // Set listing status to sold
        const auctionRef = doc(db, 'arena_auctions', negData.auctionId);
        transaction.update(auctionRef, {
          status: 'sold',
          updatedAt: serverTimestamp()
        });

        // Notify both parties
        const buyerNotifRef = doc(collection(db, 'users', negData.buyerId, 'notifications'));
        transaction.set(buyerNotifRef, {
          type: 'auction_won',
          title: 'Deal Complete: Contact Details',
          message: `Deal completed! You can contact the seller via Email: ${sellerContactEmail}, Phone: ${sellerContactPhone}`,
          link: `/negotiations/timeline/${resolvedNegId}`,
          auctionId: negData.auctionId,
          userId: negData.buyerId,
          isRead: false,
          timestamp: serverTimestamp()
        });

        if (negData.sellerId && !negData.sellerId.startsWith('anon_seller_')) {
          const sellerNotifRef = doc(collection(db, 'users', negData.sellerId, 'notifications'));
          transaction.set(sellerNotifRef, {
            type: 'auction_won',
            title: 'Deal Complete: Contact Details',
            message: `Deal completed! You can contact the buyer via their profile details.`,
            link: `/negotiations/timeline/${resolvedNegId}`,
            auctionId: negData.auctionId,
            userId: negData.sellerId,
            isRead: false,
            timestamp: serverTimestamp()
          });
        }

        const offerRef = doc(collection(db, 'arena_negotiations', resolvedNegId, 'offers'));
        transaction.set(offerRef, {
          negotiationId: resolvedNegId,
          senderId: userId,
          amount: negData.lastOfferAmount || 0,
          timestamp: serverTimestamp(),
          action: 'complete'
        });
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_negotiations/${negId}/complete`);
      throw err;
    }
  },

  /**
   * Requests contact information from the seller (Buyer only, post-acceptance).
   */
  async requestContactInfo(negId: string, userId: string): Promise<void> {
    try {
      const { resolvedId: resolvedNegId } = await ensureNegotiationDoc(negId, userId, NegotiationStatus.ACCEPTED);

      await runTransaction(db, async (transaction) => {
        const negRef = doc(db, 'arena_negotiations', resolvedNegId);
        const negSnap = await transaction.get(negRef);
        if (!negSnap.exists()) throw new Error('Negotiation not found');
        const negData = negSnap.data() as Negotiation;

        if (negData.buyerId !== userId && userId !== 'simulated-buyer' && negData.buyerId !== 'simulated-buyer' && userId !== negData.sellerId) {
          throw new Error('Action denied: Only the buyer whose offer was accepted can request contact details.');
        }

        transaction.update(negRef, {
          contactRequested: true,
          contactRequestedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        const offerRef = doc(collection(db, 'arena_negotiations', resolvedNegId, 'offers'));
        transaction.set(offerRef, {
          negotiationId: resolvedNegId,
          senderId: userId,
          amount: negData.lastOfferAmount || 0,
          message: 'Buyer requested seller contact information.',
          timestamp: serverTimestamp(),
          action: 'request_contact'
        });

        if (negData.sellerId && !negData.sellerId.startsWith('anon_seller_')) {
          const notifRef = doc(collection(db, 'users', negData.sellerId, 'notifications'));
          transaction.set(notifRef, {
            type: 'contact_requested',
            title: 'Contact Information Requested',
            message: 'The buyer has requested your contact details to complete the transaction.',
            link: `/negotiations/timeline/${resolvedNegId}`,
            auctionId: negData.auctionId,
            userId: negData.sellerId,
            isRead: false,
            timestamp: serverTimestamp()
          });

          const globalNotifRef = doc(collection(db, 'notifications'));
          transaction.set(globalNotifRef, {
            userId: negData.sellerId,
            type: 'contact_requested',
            title: 'Contact Information Requested',
            message: 'The buyer has requested your contact details to complete the transaction.',
            link: `/negotiations/timeline/${resolvedNegId}`,
            read: false,
            timestamp: serverTimestamp()
          });
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_negotiations/${negId}/requestContactInfo`);
      throw err;
    }
  },

  /**
   * Shares contact information with the buyer (Seller only, post-acceptance).
   * Mandatory: At least one field (name, phone, email, address) must be provided.
   */
  async shareContactInfo(
    negId: string,
    userId: string,
    details: { name?: string; phone?: string; email?: string; address?: string }
  ): Promise<void> {
    try {
      const cleanName = details.name?.trim() || '';
      const cleanPhone = details.phone?.trim() || '';
      const cleanEmail = details.email?.trim() || '';
      const cleanAddress = details.address?.trim() || '';

      if (!cleanName && !cleanPhone && !cleanEmail && !cleanAddress) {
        throw new Error('Action denied: You must provide at least one contact detail (Name, Contact Number, Email Address, or Address).');
      }

      if (!userId || typeof userId !== 'string' || !userId.trim() || userId === 'guest' || userId === 'unauthenticated') {
        throw new Error('Action denied: Only the seller can share contact details.');
      }

      const cleanUserId = userId.trim();
      const { resolvedId: resolvedNegId } = await ensureNegotiationDoc(negId, cleanUserId, NegotiationStatus.ACCEPTED);

      await runTransaction(db, async (transaction) => {
        const negRef = doc(db, 'arena_negotiations', resolvedNegId);
        const negSnap = await transaction.get(negRef);
        if (!negSnap.exists()) throw new Error('Negotiation not found');
        const negData = negSnap.data() as Negotiation;

        // Resolve authoritative seller UID from private subcollection or public listing
        const authoritativeSellerUid = await resolveAuthoritativeSellerUid(
          negData.auctionId
        );

        const isAuthoritativeSeller = Boolean(
          (authoritativeSellerUid && cleanUserId === authoritativeSellerUid) ||
          (cleanUserId === 'simulated-seller' && negData.sellerId === 'simulated-seller')
        );

        const isBuyer = Boolean(
          cleanUserId === negData.buyerId ||
          cleanUserId === 'buyer' ||
          cleanUserId === 'simulated-buyer'
        );

        if (!isAuthoritativeSeller || isBuyer) {
          throw new Error('Action denied: Only the seller can share contact details.');
        }

        const sharedData = {
          name: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          address: cleanAddress,
          sharedAt: new Date()
        };

        transaction.update(negRef, {
          contactShared: true,
          contactSharedAt: serverTimestamp(),
          sharedContactDetails: sharedData,
          updatedAt: serverTimestamp()
        });

        const summaryParts = [
          cleanName && `Name: ${cleanName}`,
          cleanPhone && `Phone: ${cleanPhone}`,
          cleanEmail && `Email: ${cleanEmail}`,
          cleanAddress && `Address: ${cleanAddress}`
        ].filter(Boolean);

        // In Private Negotiations, mask senderId using the public pseudonymous sellerId
        // so that the real sellerUid is never leaked to the buyer in the public/offers collection
        const offerSenderId = (negData.sellerId && negData.sellerId.startsWith('anon_seller_'))
          ? negData.sellerId
          : cleanUserId;

        const offerRef = doc(collection(db, 'arena_negotiations', resolvedNegId, 'offers'));
        transaction.set(offerRef, {
          negotiationId: resolvedNegId,
          senderId: offerSenderId,
          amount: negData.lastOfferAmount || 0,
          message: `Seller shared contact details: ${summaryParts.join(', ')}`,
          timestamp: serverTimestamp(),
          action: 'share_contact'
        });

        const notifRef = doc(collection(db, 'users', negData.buyerId, 'notifications'));
        transaction.set(notifRef, {
          type: 'contact_shared',
          title: 'Contact Information Shared',
          message: 'The seller has shared their contact details with you.',
          link: `/negotiations/timeline/${resolvedNegId}`,
          auctionId: negData.auctionId,
          userId: negData.buyerId,
          isRead: false,
          timestamp: serverTimestamp()
        });

        const globalNotifRef = doc(collection(db, 'notifications'));
        transaction.set(globalNotifRef, {
          userId: negData.buyerId,
          type: 'contact_shared',
          title: 'Contact Information Shared',
          message: 'The seller has shared their contact details with you.',
          link: `/negotiations/timeline/${resolvedNegId}`,
          read: false,
          timestamp: serverTimestamp()
        });
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_negotiations/${negId}/shareContactInfo`);
      throw err;
    }
  },

  /**
   * Sends a simple message without changing the offer amount or state.
   * Post-acceptance messaging is allowed for up to 7 days post-acceptance.
   */
  async sendMessage(negId: string, userId: string, message: string): Promise<void> {
    try {
      if (!message.trim()) return;

      const { resolvedId: resolvedNegId } = await ensureNegotiationDoc(negId, userId, NegotiationStatus.ACCEPTED);

      await runTransaction(db, async (transaction) => {
        const negRef = doc(db, 'arena_negotiations', resolvedNegId);
        const negSnap = await transaction.get(negRef);
        if (!negSnap.exists()) throw new Error('Negotiation not found');
        
        const negData = negSnap.data() as Negotiation;

        const currentStatusStr = (negData.status || '').toLowerCase();
        if (currentStatusStr !== 'accepted' && currentStatusStr !== 'completed' && currentStatusStr !== 'concluded' && currentStatusStr !== 'open' && currentStatusStr !== 'offer_sent' && currentStatusStr !== 'counter_offered') {
          throw new Error('Action denied: Standalone messages are not allowed for this negotiation state.');
        }

        if (currentStatusStr === 'accepted' || currentStatusStr === 'completed' || currentStatusStr === 'concluded') {
          const acceptedDate = parseSafeDate(negData.acceptedAt || negData.updatedAt);
          if (acceptedDate) {
            const elapsedMs = Date.now() - acceptedDate.getTime();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            if (elapsedMs > sevenDaysMs) {
              throw new Error('Action denied: The 7-day post-acceptance chat period has expired. Private messaging is restricted.');
            }
          }
        }
        
        transaction.update(negRef, {
          updatedAt: serverTimestamp()
        });

        const offerRef = doc(collection(db, 'arena_negotiations', resolvedNegId, 'offers'));
        transaction.set(offerRef, {
          negotiationId: resolvedNegId,
          senderId: userId,
          amount: negData.lastOfferAmount || 0,
          message: message,
          timestamp: serverTimestamp(),
          action: 'message'
        });
        
        // Notify other party (Seller->buyer delivers to buyer UID; Private buyer->seller is handled by trusted Cloud Function trigger)
        const recipientId = userId === negData.buyerId ? negData.sellerId : negData.buyerId;
        if (recipientId && !recipientId.startsWith('anon_seller_')) {
          const notifRef = doc(collection(db, 'users', recipientId, 'notifications'));
          transaction.set(notifRef, {
            type: 'private_message',
            title: 'New Tactical Message',
            message: `You have received a new message in your private negotiation.`,
            link: `/negotiations/timeline/${resolvedNegId}`,
            auctionId: negData.auctionId,
            userId: recipientId,
            isRead: false,
            timestamp: serverTimestamp()
          });
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_negotiations/${negId}/message`);
      throw err;
    }
  },

  /**
   * Submits an appeal for a paused listing.
   */
  async submitAppeal(auctionId: string, userId: string, message: string): Promise<void> {
    try {
      const auctionRef = doc(db, 'arena_auctions', auctionId);
      const auctionSnap = await getDoc(auctionRef);
      
      if (!auctionSnap.exists()) throw new Error('Listing not found');
      const auctionData = auctionSnap.data();
      
      if (auctionData.sellerId !== userId) throw new Error('Unauthorized: Only owner can submit appeal');
      if (auctionData.status !== 'paused') throw new Error('Listing is not paused');

      await updateDoc(auctionRef, {
        appealStatus: 'pending',
        appealMessage: message,
        appealSubmittedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `arena_auctions/${auctionId}/appeal`);
      throw err;
    }
  },

  /**
   * Fetches active negotiations for a user.
   */
  subscribeToUserNegotiations(userId: string, callback: (negs: Negotiation[]) => void) {
    // We need two queries because Firestore doesn't support OR between fields easily in one query without complex composite indexes
    // But since one user is either buyer or seller, we can do two listeners and merge them or use a client-side filter if small.
    // Better to use two listeners.
    
    const buyerQ = query(
      collection(db, 'arena_negotiations'),
      where('buyerId', '==', userId)
    );

    const sellerQ = query(
      collection(db, 'arena_negotiations'),
      where('sellerId', '==', userId)
    );

    let buyerNegs: Negotiation[] = [];
    let sellerNegs: Negotiation[] = [];

    const merge = () => {
      const all = [...buyerNegs, ...sellerNegs].sort((a, b) => {
        const timeA = a.updatedAt && !isNaN(a.updatedAt.getTime()) ? a.updatedAt.getTime() : 0;
        const timeB = b.updatedAt && !isNaN(b.updatedAt.getTime()) ? b.updatedAt.getTime() : 0;
        return timeB - timeA;
      });
      callback(all);
    };

    const unsubBuyer = onSnapshot(buyerQ, (snap) => {
      buyerNegs = snap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        createdAt: parseSafeDate(d.data().createdAt),
        updatedAt: parseSafeDate(d.data().updatedAt),
        expiresAt: parseSafeDate(d.data().expiresAt)
      } as Negotiation));
      merge();
    });

    const unsubSeller = onSnapshot(sellerQ, (snap) => {
      sellerNegs = snap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        createdAt: parseSafeDate(d.data().createdAt),
        updatedAt: parseSafeDate(d.data().updatedAt),
        expiresAt: parseSafeDate(d.data().expiresAt)
      } as Negotiation));
      merge();
    });

    return () => {
      unsubBuyer();
      unsubSeller();
    };
  },

  /**
   * Deletes a negotiation message/offer permanently from the system.
   */
  async deleteOffer(negId: string, offerId: string): Promise<void> {
    try {
      const docRef = doc(db, 'arena_negotiations', negId, 'offers', offerId);
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `arena_negotiations/${negId}/offers/${offerId}`);
      throw err;
    }
  },

  /**
   * Pauses a negotiation channel with strict ownership validation against the authenticated user ID.
   */
  async pauseNegotiationChannel(channelId: string, userId: string): Promise<void> {
    try {
      if (!userId) throw new Error('Unauthorized: Authentication required.');

      let channelRef = doc(db, 'negotiation_channels', channelId);
      let snap = await getDoc(channelRef);

      if (!snap.exists()) {
        channelRef = doc(db, 'arena_negotiations', channelId);
        snap = await getDoc(channelRef);
      }

      if (!snap.exists()) {
        throw new Error('Negotiation channel not found.');
      }

      const data = snap.data();
      const isOwner = data.sellerId === userId || data.buyerId === userId || data.userId === userId || data.ownerId === userId;
      if (!isOwner) {
        throw new Error('Unauthorized: Only an authorized channel owner can pause this negotiation channel.');
      }

      const updates = {
        status: 'paused',
        isPaused: true,
        pausedBy: userId,
        pausedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await updateDoc(channelRef, updates);

      const mirrorRef = doc(db, 'negotiation_channels', channelId);
      await setDoc(mirrorRef, { ...data, ...updates }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `negotiation_channels/${channelId}/pause`);
      throw err;
    }
  },

  /**
   * Resumes a paused negotiation channel with strict ownership validation against the authenticated user ID.
   */
  async resumeNegotiationChannel(channelId: string, userId: string): Promise<void> {
    try {
      if (!userId) throw new Error('Unauthorized: Authentication required.');

      let channelRef = doc(db, 'negotiation_channels', channelId);
      let snap = await getDoc(channelRef);

      if (!snap.exists()) {
        channelRef = doc(db, 'arena_negotiations', channelId);
        snap = await getDoc(channelRef);
      }

      if (!snap.exists()) {
        throw new Error('Negotiation channel not found.');
      }

      const data = snap.data();
      const isOwner = data.sellerId === userId || data.buyerId === userId || data.userId === userId || data.ownerId === userId;
      if (!isOwner) {
        throw new Error('Unauthorized: Only an authorized channel owner can resume this negotiation channel.');
      }

      const updates = {
        status: 'open',
        isPaused: false,
        resumedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await updateDoc(channelRef, updates);

      const mirrorRef = doc(db, 'negotiation_channels', channelId);
      await setDoc(mirrorRef, { ...data, ...updates }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `negotiation_channels/${channelId}/resume`);
      throw err;
    }
  },

  /**
   * Soft-removes/decommissions a negotiation channel with strict ownership validation against the authenticated user ID.
   */
  async removeNegotiationChannel(channelId: string, userId: string): Promise<void> {
    try {
      if (!userId) throw new Error('Unauthorized: Authentication required.');

      let channelRef = doc(db, 'negotiation_channels', channelId);
      let snap = await getDoc(channelRef);

      if (!snap.exists()) {
        channelRef = doc(db, 'arena_negotiations', channelId);
        snap = await getDoc(channelRef);
      }

      if (!snap.exists()) {
        throw new Error('Negotiation channel not found.');
      }

      const data = snap.data();
      const statusStr = (data.status || '').toLowerCase().trim();
      if (['accepted', 'completed', 'concluded'].includes(statusStr)) {
        throw new Error('Action Denied: You cannot remove a negotiation channel or listed deal that is already marked as Accepted.');
      }

      const isOwner = data.sellerId === userId || data.buyerId === userId || data.userId === userId || data.ownerId === userId;
      if (!isOwner) {
        throw new Error('Unauthorized: Only an authorized channel owner can remove this negotiation channel.');
      }

      const updates = {
        status: 'cancelled',
        isRemoved: true,
        isPermanentlyRemoved: true,
        removedAt: serverTimestamp(),
        removedBy: userId,
        updatedAt: serverTimestamp()
      };

      await updateDoc(channelRef, updates);

      const mirrorRef = doc(db, 'negotiation_channels', channelId);
      await setDoc(mirrorRef, { ...data, ...updates }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `negotiation_channels/${channelId}/remove`);
      throw err;
    }
  }
};
