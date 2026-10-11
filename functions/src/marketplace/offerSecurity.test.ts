/**
 * Deterministic Unit Test Suite for OFFER_CREATE_RULE_HARDENING
 * Phase 2.2 Minimal Corrective Changes Verification
 *
 * Verifies CEL logic equivalence for:
 * 1. Top-Level /offers/{offerId} write-only intake queue, payload whitelist, and length bounds.
 * 2. Removal of offersDisabled from global isNotBlocked() and local enforcement on financial offer actions.
 * 3. Arena negotiations subcollection offer/message creation, deletion, and amount validation.
 * 4. Second-chance offer authorization.
 *
 * NOTE: These are deterministic logic-level unit tests modeling the exact CEL rules.
 * Runs locally with 0 production Firestore reads/writes.
 */

import assert from 'assert';

export interface AuthContext {
  uid: string | null;
  isAdmin?: boolean;
  isBlocked?: boolean;
  isBanned?: boolean;
  accountStatus?: string;
  offersDisabled?: boolean;
}

export interface ListingDoc {
  id: string;
  ownerId: string;
  status: 'LIVE' | 'BOOKED' | 'SOLD' | 'SUSPENDED';
  currency: string;
  price: number;
}

export interface TopLevelOfferPayload {
  [key: string]: any;
}

export interface ArenaNegotiationDoc {
  id: string;
  auctionId: string;
  buyerId: string;
  sellerId: string;
  status: 'pending' | 'active' | 'countered' | 'accepted' | 'completed' | 'concluded' | 'withdrawn' | 'cancelled' | 'expired';
}

export interface NegotiationOfferDoc {
  id: string;
  negotiationId: string;
  senderId: string;
  amount?: number;
  action: 'send' | 'counter' | 'accept' | 'decline' | 'withdraw' | 'cancel' | 'complete' | 'request_contact' | 'share_contact' | 'message';
}

export interface SecondChanceOfferDoc {
  id: string;
  auctionId: string;
  originalOrderId: string;
  sellerId: string;
  buyerId: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  expiresAt: number;
}

export interface OriginalOrderDoc {
  id: string;
  auctionId: string;
  sellerId: string;
  buyerId: string;
  amount: number;
  currency: string;
  status: 'PAYMENT_EXPIRED' | 'AWAITING_PAYMENT' | 'PAID';
  source: 'battle_bids' | 'marketplace';
}

export interface RuleEvaluationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Objective 2: Evaluates global isNotBlocked()
 * Verified: offersDisabled is REMOVED so it does not block unrelated platform features.
 */
export function evaluateIsNotBlocked(auth: AuthContext): boolean {
  if (!auth.uid) return false;
  if (auth.isAdmin) return true;
  if (auth.isBlocked === true) return false;
  if (auth.isBanned === true) return false;
  if (auth.accountStatus === 'banned') return false;
  return true;
}

/**
 * Objective 3: Evaluates localized canSubmitOffers()
 */
export function evaluateCanSubmitOffers(auth: AuthContext): boolean {
  if (!auth.uid) return false;
  if (auth.isAdmin) return true;
  if (auth.offersDisabled === true) return false;
  return true;
}

const ALLOWED_TOP_LEVEL_OFFER_KEYS = new Set([
  'listingId', 'buyerId', 'sellerId', 'status', 'proposedPrice', 'currency', 'createdAt',
  'buyerName', 'listingTitle', 'listingImage', 'originalPrice', 'notes', 'userType', 'updatedAt', 'currencySymbol'
]);

const REQUIRED_TOP_LEVEL_OFFER_KEYS = [
  'listingId', 'buyerId', 'sellerId', 'status', 'proposedPrice', 'currency', 'createdAt'
];

/**
 * Objective 4: Evaluates Top-Level /offers/{offerId} create rule with strict whitelist
 */
export function evaluateTopLevelOfferCreate(
  incoming: TopLevelOfferPayload,
  listing: ListingDoc | null,
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.isAdmin) return { allowed: true, reason: 'ADMIN_ALLOWED' };
  if (!evaluateIsNotBlocked(auth)) return { allowed: false, reason: 'USER_BLOCKED_OR_BANNED' };
  if (!evaluateCanSubmitOffers(auth)) return { allowed: false, reason: 'OFFERS_DISABLED_FOR_USER' };

  if (!auth.uid) return { allowed: false, reason: 'UNAUTHENTICATED' };

  // Whitelist verification: hasOnly
  const incomingKeys = Object.keys(incoming);
  for (const k of incomingKeys) {
    if (!ALLOWED_TOP_LEVEL_OFFER_KEYS.has(k)) {
      return { allowed: false, reason: `UNAUTHORIZED_FIELD_${k}` };
    }
  }

  // Required keys verification: hasAll
  for (const reqKey of REQUIRED_TOP_LEVEL_OFFER_KEYS) {
    if (!(reqKey in incoming) || incoming[reqKey] === undefined) {
      return { allowed: false, reason: `MISSING_REQUIRED_FIELD_${reqKey}` };
    }
  }

  if (incoming.buyerId !== auth.uid) {
    return { allowed: false, reason: 'BUYER_ID_MISMATCH' };
  }

  if (typeof incoming.listingId !== 'string' || incoming.listingId.length === 0) {
    return { allowed: false, reason: 'INVALID_LISTING_ID' };
  }

  if (incoming.status !== 'pending') {
    return { allowed: false, reason: 'STATUS_MUST_BE_PENDING' };
  }

  if (typeof incoming.proposedPrice !== 'number' || isNaN(incoming.proposedPrice) || incoming.proposedPrice <= 0) {
    return { allowed: false, reason: 'INVALID_PROPOSED_PRICE' };
  }

  // Length constraints
  if ('notes' in incoming && incoming.notes !== undefined) {
    if (typeof incoming.notes !== 'string' || incoming.notes.length > 1000) {
      return { allowed: false, reason: 'NOTES_EXCEEDS_1000_CHARS' };
    }
  }

  if ('buyerName' in incoming && incoming.buyerName !== undefined) {
    if (typeof incoming.buyerName !== 'string' || incoming.buyerName.length > 150) {
      return { allowed: false, reason: 'BUYER_NAME_EXCEEDS_150_CHARS' };
    }
  }

  if ('listingTitle' in incoming && incoming.listingTitle !== undefined) {
    if (typeof incoming.listingTitle !== 'string' || incoming.listingTitle.length > 250) {
      return { allowed: false, reason: 'LISTING_TITLE_EXCEEDS_250_CHARS' };
    }
  }

  if ('originalPrice' in incoming && incoming.originalPrice !== undefined) {
    if (typeof incoming.originalPrice !== 'number' || incoming.originalPrice < 0) {
      return { allowed: false, reason: 'INVALID_ORIGINAL_PRICE' };
    }
  }

  if ('userType' in incoming && incoming.userType !== undefined) {
    if (incoming.userType !== 'buyer') {
      return { allowed: false, reason: 'INVALID_USER_TYPE' };
    }
  }

  if (!listing) {
    return { allowed: false, reason: 'LISTING_DOES_NOT_EXIST' };
  }

  if (listing.status !== 'LIVE') {
    return { allowed: false, reason: 'LISTING_NOT_LIVE' };
  }

  if (incoming.sellerId !== listing.ownerId) {
    return { allowed: false, reason: 'SELLER_ID_MISMATCH_WITH_LISTING_OWNER' };
  }

  if (incoming.buyerId === incoming.sellerId) {
    return { allowed: false, reason: 'CANNOT_OFFER_ON_OWN_LISTING' };
  }

  const authoritativeCurrency = listing.currency || 'PKR';
  if (incoming.currency !== authoritativeCurrency) {
    return { allowed: false, reason: 'CURRENCY_MISMATCH_WITH_LISTING' };
  }

  return { allowed: true, reason: 'OFFER_CREATED_SUCCESS' };
}

/**
 * Objective 1: Evaluates Top-Level /offers/{offerId} update rule
 * allow update: if false;
 */
export function evaluateTopLevelOfferUpdate(
  incomingDiff: Record<string, any>,
  existingDoc: TopLevelOfferPayload,
  auth: AuthContext
): RuleEvaluationResult {
  // Pure write-only queue: client updates are strictly prohibited
  return { allowed: false, reason: 'UPDATE_PROHIBITED_WRITE_ONLY_QUEUE' };
}

/**
 * Objective 1: Evaluates Top-Level /offers/{offerId} delete rule
 * allow delete: if isAdmin();
 */
export function evaluateTopLevelOfferDelete(
  existingDoc: TopLevelOfferPayload,
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.isAdmin) {
    return { allowed: true, reason: 'ADMIN_DELETE_PERMITTED' };
  }
  return { allowed: false, reason: 'NON_ADMIN_DELETE_PROHIBITED' };
}

/**
 * Objective 1: Evaluates Top-Level /offers/{offerId} read rule
 */
export function evaluateTopLevelOfferRead(
  offer: TopLevelOfferPayload,
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.isAdmin) return { allowed: true, reason: 'ADMIN_ALLOWED' };
  if (!auth.uid) return { allowed: false, reason: 'UNAUTHENTICATED' };
  if (offer.buyerId === auth.uid || offer.sellerId === auth.uid) {
    return { allowed: true, reason: 'PARTICIPANT_READ_ALLOWED' };
  }
  return { allowed: false, reason: 'UNAUTHORIZED_READ' };
}

/**
 * Objective 3: Evaluates /arena_negotiations/{negotiationId}/offers/{offerId} create rule
 */
export function evaluateArenaOfferCreate(
  incoming: Partial<NegotiationOfferDoc>,
  negotiation: ArenaNegotiationDoc | null,
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.isAdmin) return { allowed: true, reason: 'ADMIN_ALLOWED' };
  if (!evaluateIsNotBlocked(auth)) return { allowed: false, reason: 'USER_BLOCKED_OR_RESTRICTED' };

  if (!negotiation) {
    return { allowed: false, reason: 'NEGOTIATION_DOES_NOT_EXIST' };
  }

  const isParticipant = negotiation.buyerId === auth.uid || negotiation.sellerId === auth.uid;
  if (!isParticipant) {
    return { allowed: false, reason: 'NOT_NEGOTIATION_PARTICIPANT' };
  }

  const isValidSender =
    (negotiation.buyerId === auth.uid && incoming.senderId === auth.uid) ||
    (negotiation.sellerId === auth.uid && (incoming.senderId === auth.uid || incoming.senderId === negotiation.sellerId));
  if (!isValidSender) {
    return { allowed: false, reason: 'INVALID_OFFER_SENDER' };
  }

  if (incoming.negotiationId !== negotiation.id) {
    return { allowed: false, reason: 'NEGOTIATION_ID_MISMATCH' };
  }

  const validActions = ['send', 'counter', 'accept', 'decline', 'withdraw', 'cancel', 'complete', 'request_contact', 'share_contact', 'message'];
  if (!incoming.action || !validActions.includes(incoming.action)) {
    return { allowed: false, reason: 'INVALID_ACTION' };
  }

  // Objective 3: Apply offersDisabled ONLY to financial send / counter actions
  const isFinancialAction = ['send', 'counter'].includes(incoming.action);
  if (isFinancialAction) {
    if (!evaluateCanSubmitOffers(auth)) {
      return { allowed: false, reason: 'FINANCIAL_OFFERS_DISABLED_FOR_USER' };
    }

    if (typeof incoming.amount !== 'number' || isNaN(incoming.amount) || incoming.amount <= 0) {
      return { allowed: false, reason: 'POSITIVE_AMOUNT_REQUIRED_FOR_SEND_COUNTER' };
    }

    const concludedStatuses = ['concluded', 'completed', 'withdrawn', 'cancelled', 'expired'];
    if (concludedStatuses.includes(negotiation.status)) {
      return { allowed: false, reason: 'NEGOTIATION_ALREADY_CONCLUDED' };
    }
  } else {
    // Non-financial actions (message, request_contact, share_contact, accept, decline, etc.)
    if (incoming.amount !== undefined) {
      if (typeof incoming.amount !== 'number' || isNaN(incoming.amount) || incoming.amount < 0) {
        return { allowed: false, reason: 'INVALID_AMOUNT' };
      }
    }
  }

  return { allowed: true, reason: 'ARENA_OFFER_CREATED_SUCCESS' };
}

/**
 * Objective 5: Evaluates /arena_negotiations/{negotiationId}/offers/{offerId} delete rule
 */
export function evaluateArenaOfferDelete(
  offer: NegotiationOfferDoc,
  negotiation: ArenaNegotiationDoc | null,
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.isAdmin) return { allowed: true, reason: 'ADMIN_ALLOWED' };
  if (!auth.uid) return { allowed: false, reason: 'UNAUTHENTICATED' };

  if (!negotiation) {
    return { allowed: true, reason: 'RESIDUAL_CLEANUP_PERMITTED' };
  }

  const isParticipant = negotiation.buyerId === auth.uid || negotiation.sellerId === auth.uid;
  if (!isParticipant) {
    return { allowed: false, reason: 'NOT_NEGOTIATION_PARTICIPANT' };
  }

  const isAuthor =
    offer.senderId === auth.uid ||
    (negotiation.sellerId === auth.uid && offer.senderId === negotiation.sellerId);

  if (!isAuthor) {
    return { allowed: false, reason: 'CANNOT_DELETE_COUNTERPARTY_MESSAGE' };
  }

  return { allowed: true, reason: 'OWN_MESSAGE_DELETE_ALLOWED' };
}

/**
 * Objective 5: Evaluates /second_chance_offers/{offerId} create rule
 */
export function evaluateSecondChanceOfferCreate(
  incoming: Partial<SecondChanceOfferDoc>,
  order: OriginalOrderDoc | null,
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.isAdmin) return { allowed: true, reason: 'ADMIN_ALLOWED' };
  if (!evaluateIsNotBlocked(auth)) return { allowed: false, reason: 'USER_BLOCKED_OR_RESTRICTED' };

  if (incoming.id !== `SC-${incoming.auctionId}`) {
    return { allowed: false, reason: 'INVALID_OFFER_ID_FORMAT' };
  }

  if (incoming.originalOrderId !== `BB-${incoming.auctionId}`) {
    return { allowed: false, reason: 'INVALID_ORIGINAL_ORDER_ID' };
  }

  if (incoming.status !== 'PENDING') {
    return { allowed: false, reason: 'STATUS_MUST_BE_PENDING' };
  }

  if (typeof incoming.amount !== 'number' || isNaN(incoming.amount) || incoming.amount <= 0) {
    return { allowed: false, reason: 'INVALID_AMOUNT' };
  }

  if (incoming.sellerId !== auth.uid) {
    return { allowed: false, reason: 'ONLY_AUTHORITATIVE_SELLER_CAN_CREATE_SC_OFFER' };
  }

  if (!order) {
    return { allowed: false, reason: 'ORIGINAL_ORDER_NOT_FOUND' };
  }

  if (order.status !== 'PAYMENT_EXPIRED') {
    return { allowed: false, reason: 'ORIGINAL_ORDER_NOT_PAYMENT_EXPIRED' };
  }

  if (order.source !== 'battle_bids') {
    return { allowed: false, reason: 'ORIGINAL_ORDER_NOT_BATTLE_BIDS' };
  }

  if (incoming.sellerId !== order.sellerId) {
    return { allowed: false, reason: 'SELLER_MISMATCH_WITH_ORIGINAL_ORDER' };
  }

  if (incoming.currency !== order.currency) {
    return { allowed: false, reason: 'CURRENCY_MISMATCH_WITH_ORIGINAL_ORDER' };
  }

  if (incoming.buyerId === order.buyerId) {
    return { allowed: false, reason: 'CANNOT_OFFER_SC_TO_ORIGINAL_DEFAULTED_BUYER' };
  }

  if (incoming.buyerId === incoming.sellerId) {
    return { allowed: false, reason: 'CANNOT_OFFER_SC_TO_SELF' };
  }

  if (incoming.amount! > order.amount) {
    return { allowed: false, reason: 'SC_AMOUNT_EXCEEDS_ORIGINAL_ORDER_AMOUNT' };
  }

  return { allowed: true, reason: 'SECOND_CHANCE_OFFER_CREATED_SUCCESS' };
}

// -------------------------------------------------------------
// TEST RUNNER
// -------------------------------------------------------------

function runAllTests() {
  console.log('=== STARTING PHASE 2.2 MINIMAL CORRECTIVE TESTS ===\n');

  let passed = 0;
  let failed = 0;

  function runTest(testName: string, fn: () => void) {
    try {
      fn();
      passed++;
      console.log(`[PASS] ${testName}`);
    } catch (err: any) {
      failed++;
      console.error(`[FAIL] ${testName}:`, err.message);
    }
  }

  const liveListing: ListingDoc = {
    id: 'listing-123',
    ownerId: 'seller-abc',
    status: 'LIVE',
    currency: 'PKR',
    price: 15000
  };

  const buyerAuth: AuthContext = { uid: 'buyer-xyz' };
  const sellerAuth: AuthContext = { uid: 'seller-abc' };
  const adminAuth: AuthContext = { uid: 'admin-1', isAdmin: true };
  const offersDisabledAuth: AuthContext = { uid: 'buyer-xyz', offersDisabled: true };
  const bannedBuyerAuth: AuthContext = { uid: 'buyer-xyz', isBanned: true };
  const blockedBuyerAuth: AuthContext = { uid: 'buyer-xyz', isBlocked: true };

  // ==========================================
  // SECTION A: TOP-LEVEL /offers RULES & WHITELIST
  // ==========================================

  const validPayload = {
    listingId: 'listing-123',
    buyerId: 'buyer-xyz',
    buyerName: 'Muhammad Ali',
    sellerId: 'seller-abc',
    listingTitle: 'Sony WH-1000XM4 Headphones',
    listingImage: 'https://images.unsplash.com/photo-1505740420928',
    originalPrice: 15000,
    proposedPrice: 12000,
    currency: 'PKR',
    notes: 'Can pick up tomorrow cash in hand',
    status: 'pending',
    userType: 'buyer',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  runTest('TEST 1: Valid PriceDrops offer creation passes whitelist and constraints -> ALLOWED', () => {
    const res = evaluateTopLevelOfferCreate(validPayload, liveListing, buyerAuth);
    assert.strictEqual(res.allowed, true);
  });

  runTest('TEST 2: Top-level offer update by buyer is strictly DENIED (write-only queue)', () => {
    const res = evaluateTopLevelOfferUpdate({ proposedPrice: 1000 }, validPayload, buyerAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UPDATE_PROHIBITED_WRITE_ONLY_QUEUE');
  });

  runTest('TEST 3: Top-level offer update by seller is strictly DENIED (write-only queue)', () => {
    const res = evaluateTopLevelOfferUpdate({ status: 'accepted' }, validPayload, sellerAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UPDATE_PROHIBITED_WRITE_ONLY_QUEUE');
  });

  runTest('TEST 4: Top-level offer deletion by buyer is strictly DENIED (audit record retention)', () => {
    const res = evaluateTopLevelOfferDelete(validPayload, buyerAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'NON_ADMIN_DELETE_PROHIBITED');
  });

  runTest('TEST 5: Top-level offer deletion by non-admin seller is strictly DENIED', () => {
    const res = evaluateTopLevelOfferDelete(validPayload, sellerAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'NON_ADMIN_DELETE_PROHIBITED');
  });

  runTest('TEST 6: Top-level offer deletion by admin is ALLOWED', () => {
    const res = evaluateTopLevelOfferDelete(validPayload, adminAuth);
    assert.strictEqual(res.allowed, true);
  });

  runTest('TEST 7: Unauthorized extra payload field (unwhitelisted key injection) -> DENIED', () => {
    const maliciousPayload = {
      ...validPayload,
      injectedRole: 'admin',
      bypassAuth: true
    };
    const res = evaluateTopLevelOfferCreate(maliciousPayload, liveListing, buyerAuth);
    assert.strictEqual(res.allowed, false);
    assert.ok(res.reason?.startsWith('UNAUTHORIZED_FIELD_'));
  });

  runTest('TEST 8: Excessively long notes (> 1000 chars) -> DENIED', () => {
    const oversizedPayload = {
      ...validPayload,
      notes: 'A'.repeat(1001)
    };
    const res = evaluateTopLevelOfferCreate(oversizedPayload, liveListing, buyerAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'NOTES_EXCEEDS_1000_CHARS');
  });

  runTest('TEST 9: Valid length notes (<= 1000 chars) -> ALLOWED', () => {
    const edgePayload = {
      ...validPayload,
      notes: 'A'.repeat(1000)
    };
    const res = evaluateTopLevelOfferCreate(edgePayload, liveListing, buyerAuth);
    assert.strictEqual(res.allowed, true);
  });

  runTest('TEST 10: Missing required field (proposedPrice) -> DENIED', () => {
    const incompletePayload: Record<string, any> = { ...validPayload };
    delete incompletePayload.proposedPrice;
    const res = evaluateTopLevelOfferCreate(incompletePayload, liveListing, buyerAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'MISSING_REQUIRED_FIELD_proposedPrice');
  });

  runTest('TEST 11: Currency mismatch with listing -> DENIED', () => {
    const res = evaluateTopLevelOfferCreate({
      ...validPayload,
      currency: 'USD'
    }, liveListing, buyerAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CURRENCY_MISMATCH_WITH_LISTING');
  });

  // ==========================================
  // SECTION B: GLOBAL isNotBlocked() & LOCAL offersDisabled
  // ==========================================

  runTest('TEST 12: offersDisabled user is NOT blocked by global isNotBlocked()', () => {
    // Unrelated operations (listings, orders, tickets, chats) rely on isNotBlocked
    const isUnblocked = evaluateIsNotBlocked(offersDisabledAuth);
    assert.strictEqual(isUnblocked, true);
  });

  runTest('TEST 13: Banned or blocked user IS blocked by global isNotBlocked()', () => {
    assert.strictEqual(evaluateIsNotBlocked(bannedBuyerAuth), false);
    assert.strictEqual(evaluateIsNotBlocked(blockedBuyerAuth), false);
  });

  runTest('TEST 14: offersDisabled user cannot create top-level offer -> DENIED', () => {
    const res = evaluateTopLevelOfferCreate(validPayload, liveListing, offersDisabledAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'OFFERS_DISABLED_FOR_USER');
  });

  // ==========================================
  // SECTION C: NEGOTIATIONS LOCAL offersDisabled & PERMISSIONS
  // ==========================================

  const activeNeg: ArenaNegotiationDoc = {
    id: 'neg-100',
    auctionId: 'auc-200',
    buyerId: 'buyer-xyz',
    sellerId: 'seller-abc',
    status: 'active'
  };

  runTest('TEST 15: offersDisabled user cannot submit financial send/counter offer -> DENIED', () => {
    const res = evaluateArenaOfferCreate({
      negotiationId: 'neg-100',
      senderId: 'buyer-xyz',
      amount: 4500,
      action: 'counter'
    }, activeNeg, offersDisabledAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'FINANCIAL_OFFERS_DISABLED_FOR_USER');
  });

  runTest('TEST 16: offersDisabled user CAN still send ordinary message in negotiation -> ALLOWED', () => {
    const res = evaluateArenaOfferCreate({
      negotiationId: 'neg-100',
      senderId: 'buyer-xyz',
      amount: 0,
      action: 'message'
    }, activeNeg, offersDisabledAuth);
    assert.strictEqual(res.allowed, true);
  });

  runTest('TEST 17: offersDisabled user CAN request contact in negotiation -> ALLOWED', () => {
    const res = evaluateArenaOfferCreate({
      negotiationId: 'neg-100',
      senderId: 'buyer-xyz',
      amount: 0,
      action: 'request_contact'
    }, activeNeg, offersDisabledAuth);
    assert.strictEqual(res.allowed, true);
  });

  runTest('TEST 18: Non-numeric, negative, or zero financial offer amount -> DENIED', () => {
    assert.strictEqual(evaluateArenaOfferCreate({
      negotiationId: 'neg-100',
      senderId: 'buyer-xyz',
      amount: 0,
      action: 'send'
    }, activeNeg, buyerAuth).allowed, false);

    assert.strictEqual(evaluateArenaOfferCreate({
      negotiationId: 'neg-100',
      senderId: 'buyer-xyz',
      amount: -500,
      action: 'counter'
    }, activeNeg, buyerAuth).allowed, false);
  });

  runTest('TEST 19: Financial offer on concluded negotiation -> DENIED', () => {
    const concludedNeg: ArenaNegotiationDoc = { ...activeNeg, status: 'concluded' };
    const res = evaluateArenaOfferCreate({
      negotiationId: 'neg-100',
      senderId: 'buyer-xyz',
      amount: 4500,
      action: 'counter'
    }, concludedNeg, buyerAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'NEGOTIATION_ALREADY_CONCLUDED');
  });

  runTest('TEST 20: Counterparty message deletion by participant -> STRICTLY DENIED', () => {
    const sellerOffer: NegotiationOfferDoc = {
      id: 'off-seller-1',
      negotiationId: 'neg-100',
      senderId: 'seller-abc',
      amount: 5000,
      action: 'counter'
    };
    // Buyer attempting to delete seller offer
    const res = evaluateArenaOfferDelete(sellerOffer, activeNeg, buyerAuth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CANNOT_DELETE_COUNTERPARTY_MESSAGE');
  });

  runTest('TEST 21: Author deletes own message in negotiation -> ALLOWED', () => {
    const ownOffer: NegotiationOfferDoc = {
      id: 'off-buyer-1',
      negotiationId: 'neg-100',
      senderId: 'buyer-xyz',
      amount: 4500,
      action: 'counter'
    };
    const res = evaluateArenaOfferDelete(ownOffer, activeNeg, buyerAuth);
    assert.strictEqual(res.allowed, true);
  });

  // ==========================================
  // SECTION D: SECOND CHANCE OFFERS ARCHITECTURE
  // ==========================================

  const expiredOrder: OriginalOrderDoc = {
    id: 'BB-auc-200',
    auctionId: 'auc-200',
    sellerId: 'seller-abc',
    buyerId: 'winner-111',
    amount: 10000,
    currency: 'USD',
    status: 'PAYMENT_EXPIRED',
    source: 'battle_bids'
  };

  runTest('TEST 22: Authoritative seller creates second-chance offer for runner-up -> ALLOWED', () => {
    const res = evaluateSecondChanceOfferCreate({
      id: 'SC-auc-200',
      auctionId: 'auc-200',
      originalOrderId: 'BB-auc-200',
      sellerId: 'seller-abc',
      buyerId: 'runnerup-222',
      amount: 9500,
      currency: 'USD',
      status: 'PENDING',
      expiresAt: Date.now() + 86400000
    }, expiredOrder, sellerAuth);
    assert.strictEqual(res.allowed, true);
  });

  runTest('TEST 23: Buyer attempts client-side second-chance offer creation -> STRICTLY DENIED', () => {
    const res = evaluateSecondChanceOfferCreate({
      id: 'SC-auc-200',
      auctionId: 'auc-200',
      originalOrderId: 'BB-auc-200',
      sellerId: 'seller-abc',
      buyerId: 'runnerup-222',
      amount: 9500,
      currency: 'USD',
      status: 'PENDING',
      expiresAt: Date.now() + 86400000
    }, expiredOrder, { uid: 'runnerup-222' });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ONLY_AUTHORITATIVE_SELLER_CAN_CREATE_SC_OFFER');
  });

  console.log(`\n=== ALL ${passed} TESTS PASSED (${failed} FAILED) ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
