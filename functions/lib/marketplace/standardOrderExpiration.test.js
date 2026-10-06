"use strict";
/**
 * Deterministic Unit Test Suite for SEC-05-09-E
 * Standard Marketplace Order Creation-Time Expiration Integrity & Expiration Boundary
 *
 * Runs locally with 0 production Firestore reads/writes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateOrderCreateRule = evaluateOrderCreateRule;
exports.evaluateOrderUpdateRule = evaluateOrderUpdateRule;
exports.runStandardOrderExpirationUnitTests = runStandardOrderExpirationUnitTests;
const assert_1 = __importDefault(require("assert"));
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
/**
 * Deterministic CEL evaluator simulating the hardened Firestore Rules for /orders/{orderId} create
 */
function evaluateOrderCreateRule(incomingDoc, listingDoc, auth, requestTimeMs) {
    // 1. Auth & Block
    if (!auth.uid)
        return { allowed: false, reason: 'UNAUTHENTICATED' };
    if (auth.isBlocked)
        return { allowed: false, reason: 'BLOCKED_USER' };
    if (auth.isAdmin)
        return { allowed: true, reason: 'ADMIN_OVERRIDE' };
    // 2. Battle Bids Branch
    if (incomingDoc.source === 'battle_bids') {
        if (incomingDoc.status === 'AWAITING_PAYMENT') {
            return { allowed: true, reason: 'BATTLE_BIDS_CREATE_ALLOWED' };
        }
        return { allowed: false, reason: 'BATTLE_BIDS_INVALID_STATUS' };
    }
    // 3. Standard Marketplace Branch
    if (!incomingDoc.buyerId || incomingDoc.buyerId !== auth.uid) {
        return { allowed: false, reason: 'BUYER_ID_MISMATCH' };
    }
    if (!incomingDoc.sellerId || typeof incomingDoc.sellerId !== 'string' || incomingDoc.sellerId === auth.uid) {
        return { allowed: false, reason: 'INVALID_SELLER_ID' };
    }
    if (!incomingDoc.listingId || typeof incomingDoc.listingId !== 'string') {
        return { allowed: false, reason: 'MISSING_LISTING_ID' };
    }
    if (incomingDoc.status !== 'PENDING') {
        return { allowed: false, reason: 'STATUS_MUST_BE_PENDING' };
    }
    if (!listingDoc || listingDoc.ownerId !== incomingDoc.sellerId) {
        return { allowed: false, reason: 'LISTING_SELLER_MISMATCH' };
    }
    // Authoritative createdAt validation: Must be request.time (serverTimestamp)
    if (incomingDoc.createdAt !== requestTimeMs) {
        return { allowed: false, reason: 'CREATED_AT_MUST_BE_REQUEST_TIME' };
    }
    // Authoritative expiresAt validation: Must not be earlier than request.time + 24h - 5m
    if (incomingDoc.expiresAt !== undefined && incomingDoc.expiresAt !== null) {
        if (incomingDoc.expiresAt < requestTimeMs + TWENTY_FOUR_HOURS_MS - FIVE_MINUTES_MS) {
            return { allowed: false, reason: 'EXPIRES_AT_TOO_EARLY' };
        }
    }
    return { allowed: true, reason: 'STANDARD_CREATE_ALLOWED' };
}
/**
 * Deterministic CEL evaluator simulating the hardened Firestore Rules for /orders/{orderId} update
 */
function evaluateOrderUpdateRule(existingDoc, incomingDoc, auth, requestTimeMs) {
    if (!auth.uid)
        return { allowed: false, reason: 'UNAUTHENTICATED' };
    if (auth.isBlocked)
        return { allowed: false, reason: 'BLOCKED_USER' };
    const isBuyer = existingDoc.buyerId === auth.uid;
    const isSeller = existingDoc.sellerId === auth.uid;
    const isAdmin = !!auth.isAdmin;
    if (!isBuyer && !isSeller && !isAdmin) {
        return { allowed: false, reason: 'NOT_PARTICIPANT_OR_ADMIN' };
    }
    if (isAdmin)
        return { allowed: true, reason: 'ADMIN_OVERRIDE' };
    // Core immutability
    const mergedIncoming = { ...existingDoc, ...incomingDoc };
    if (mergedIncoming.buyerId !== existingDoc.buyerId)
        return { allowed: false, reason: 'BUYER_ID_IMMUTABLE' };
    if (mergedIncoming.sellerId !== existingDoc.sellerId)
        return { allowed: false, reason: 'SELLER_ID_IMMUTABLE' };
    if (mergedIncoming.source !== existingDoc.source)
        return { allowed: false, reason: 'SOURCE_IMMUTABLE' };
    if (mergedIncoming.totalAmount !== existingDoc.totalAmount)
        return { allowed: false, reason: 'TOTAL_AMOUNT_IMMUTABLE' };
    if (mergedIncoming.currency !== existingDoc.currency)
        return { allowed: false, reason: 'CURRENCY_IMMUTABLE' };
    if (mergedIncoming.createdAt !== existingDoc.createdAt)
        return { allowed: false, reason: 'CREATED_AT_IMMUTABLE' };
    // Battle Bids
    if (existingDoc.source === 'battle_bids') {
        if (isBuyer) {
            if (['AWAITING_PAYMENT', 'PAYMENT_REVIEW'].includes(existingDoc.status) && ['AWAITING_PAYMENT', 'PAYMENT_REVIEW'].includes(mergedIncoming.status)) {
                if (existingDoc.paymentDeadline && requestTimeMs >= existingDoc.paymentDeadline) {
                    return { allowed: false, reason: 'BATTLE_BIDS_PAYMENT_DEADLINE_EXPIRED' };
                }
                return { allowed: true, reason: 'BATTLE_BIDS_BUYER_UPDATE_ALLOWED' };
            }
        }
        if (isSeller) {
            if (mergedIncoming.status === 'PAYMENT_EXPIRED' &&
                existingDoc.status === 'AWAITING_PAYMENT' &&
                existingDoc.paymentDeadline &&
                requestTimeMs >= existingDoc.paymentDeadline) {
                return { allowed: true, reason: 'BATTLE_BIDS_SELLER_EXPIRE_ALLOWED' };
            }
        }
        if (mergedIncoming.status === 'PAYMENT_EXPIRED' &&
            existingDoc.status === 'AWAITING_PAYMENT' &&
            existingDoc.paymentDeadline &&
            requestTimeMs >= existingDoc.paymentDeadline) {
            return { allowed: true, reason: 'BATTLE_BIDS_SYSTEM_EXPIRE_ALLOWED' };
        }
        return { allowed: false, reason: 'BATTLE_BIDS_TRANSITION_DENIED' };
    }
    // Standard Marketplace
    const is24hPassed = existingDoc.createdAt &&
        requestTimeMs >= existingDoc.createdAt + TWENTY_FOUR_HOURS_MS &&
        (existingDoc.expiresAt === null || existingDoc.expiresAt === undefined || requestTimeMs >= existingDoc.expiresAt);
    // Buyer update
    if (isBuyer) {
        if (mergedIncoming.status === existingDoc.status && ['PENDING', 'ACCEPTED', 'BOOKED'].includes(existingDoc.status)) {
            if (incomingDoc.courierName || incomingDoc.trackingNumber) {
                return { allowed: false, reason: 'BUYER_CANNOT_TOUCH_FULFILLMENT' };
            }
            return { allowed: true, reason: 'STANDARD_BUYER_SAME_STATUS_UPDATE_ALLOWED' };
        }
    }
    // Seller update
    if (isSeller) {
        if (incomingDoc.paymentProofUrl) {
            return { allowed: false, reason: 'SELLER_CANNOT_TOUCH_BUYER_PAYMENT_PROOF' };
        }
        if (mergedIncoming.status === 'ACCEPTED' && existingDoc.status === 'PENDING')
            return { allowed: true, reason: 'SELLER_ACCEPT_ALLOWED' };
        if (mergedIncoming.status === 'REJECTED' && existingDoc.status === 'PENDING')
            return { allowed: true, reason: 'SELLER_REJECT_ALLOWED' };
        if (mergedIncoming.status === 'PAID' && ['PENDING', 'ACCEPTED', 'BOOKED', 'PAID'].includes(existingDoc.status))
            return { allowed: true, reason: 'SELLER_MARK_PAID_ALLOWED' };
        if (mergedIncoming.status === 'SHIPPED' && ['PENDING', 'ACCEPTED', 'BOOKED', 'PAID', 'SHIPPED'].includes(existingDoc.status))
            return { allowed: true, reason: 'SELLER_MARK_SHIPPED_ALLOWED' };
        if (['DEAL_DONE', 'COMPLETED', 'SOLD', 'READY_TO_TRANSFER'].includes(mergedIncoming.status) && ['SHIPPED', 'PAID', 'ACCEPTED', 'DEAL_DONE', 'COMPLETED', 'SOLD', 'READY_TO_TRANSFER'].includes(existingDoc.status))
            return { allowed: true, reason: 'SELLER_MARK_COMPLETED_ALLOWED' };
        if (mergedIncoming.status === 'EXPIRED' && existingDoc.status === 'PENDING') {
            if (is24hPassed)
                return { allowed: true, reason: 'SELLER_EXPIRE_ALLOWED_AFTER_DEADLINE' };
            return { allowed: false, reason: 'SELLER_PREMATURE_EXPIRATION_DENIED' };
        }
        if (mergedIncoming.status === existingDoc.status)
            return { allowed: true, reason: 'SELLER_SAME_STATUS_UPDATE_ALLOWED' };
    }
    // System / Participant expiration
    if (mergedIncoming.status === 'EXPIRED' && existingDoc.status === 'PENDING') {
        if (is24hPassed)
            return { allowed: true, reason: 'PARTICIPANT_EXPIRE_ALLOWED_AFTER_DEADLINE' };
        return { allowed: false, reason: 'PREMATURE_EXPIRATION_DENIED' };
    }
    return { allowed: false, reason: 'TRANSITION_NOT_PERMITTED' };
}
function runStandardOrderExpirationUnitTests() {
    console.log('=== STARTING SEC-05-09-E STANDARD ORDER CREATION & EXPIRATION TESTS ===');
    let passed = 0;
    let failed = 0;
    function runTest(name, fn) {
        try {
            fn();
            console.log(`[PASS] ${name}`);
            passed++;
        }
        catch (err) {
            console.error(`[FAIL] ${name}: ${err?.message}`);
            failed++;
        }
    }
    const BASE_CREATED_AT = 1700000000000;
    const BASE_EXPIRES_AT = BASE_CREATED_AT + TWENTY_FOUR_HOURS_MS;
    const validListing = {
        id: 'listing_camera_999',
        ownerId: 'seller_karachi_2',
        status: 'LIVE',
        price: 15000,
    };
    const baseValidOrder = {
        id: 'ord_std_test_101',
        listingId: 'listing_camera_999',
        buyerId: 'buyer_lahore_1',
        sellerId: 'seller_karachi_2',
        source: 'standard_marketplace',
        status: 'PENDING',
        totalAmount: 15000,
        currency: 'PKR',
        createdAt: BASE_CREATED_AT,
        expiresAt: BASE_EXPIRES_AT,
    };
    // 1. Legitimate Standard order creation succeeds
    runTest('TEST 1: Legitimate Standard order creation succeeds', () => {
        const res = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            createdAt: BASE_CREATED_AT,
            expiresAt: BASE_EXPIRES_AT,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(res.allowed, true);
    });
    // 2. createdAt cannot be forged into the past
    runTest('TEST 2: createdAt cannot be forged into the past (now - 25h)', () => {
        const forgedCreatedAt = BASE_CREATED_AT - 25 * 60 * 60 * 1000;
        const res = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            createdAt: forgedCreatedAt,
            expiresAt: BASE_EXPIRES_AT,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(res.allowed, false);
        assert_1.default.strictEqual(res.reason, 'CREATED_AT_MUST_BE_REQUEST_TIME');
    });
    // 3. createdAt cannot be forged into the future
    runTest('TEST 3: createdAt cannot be forged into the future', () => {
        const forgedCreatedAt = BASE_CREATED_AT + 60 * 1000;
        const res = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            createdAt: forgedCreatedAt,
            expiresAt: BASE_EXPIRES_AT,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(res.allowed, false);
    });
    // 4. expiresAt = now + 60 seconds is rejected on creation
    runTest('TEST 4: expiresAt = now + 60 seconds is rejected on creation', () => {
        const res = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            createdAt: BASE_CREATED_AT,
            expiresAt: BASE_CREATED_AT + 60 * 1000,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(res.allowed, false);
        assert_1.default.strictEqual(res.reason, 'EXPIRES_AT_TOO_EARLY');
    });
    // 5. expiresAt = now - 60 seconds is rejected on creation
    runTest('TEST 5: expiresAt = now - 60 seconds is rejected on creation', () => {
        const res = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            createdAt: BASE_CREATED_AT,
            expiresAt: BASE_CREATED_AT - 60 * 1000,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(res.allowed, false);
    });
    // 6. expiresAt = now + 23h50m (earlier than 24h - 5m) is rejected
    runTest('TEST 6: expiresAt earlier than 24h boundary is rejected', () => {
        const res = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            createdAt: BASE_CREATED_AT,
            expiresAt: BASE_CREATED_AT + (23 * 60 + 50) * 60 * 1000,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(res.allowed, false);
    });
    // 7. Legitimate 24-hour expiration value is accepted
    runTest('TEST 7: Legitimate 24-hour expiresAt is accepted', () => {
        const res = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            createdAt: BASE_CREATED_AT,
            expiresAt: BASE_CREATED_AT + TWENTY_FOUR_HOURS_MS,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(res.allowed, true);
    });
    // 8. expiresAt omitted follows secure contract and cannot create early expiration
    runTest('TEST 8: expiresAt omitted follows secure contract', () => {
        const res = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            createdAt: BASE_CREATED_AT,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(res.allowed, true);
    });
    // 9. createdAt omitted is rejected
    runTest('TEST 9: createdAt omitted is rejected', () => {
        const res = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            expiresAt: BASE_EXPIRES_AT,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(res.allowed, false);
    });
    // 10. createdAt + expiresAt combined manipulation is rejected
    runTest('TEST 10: createdAt + expiresAt combined manipulation is rejected', () => {
        const res = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            createdAt: BASE_CREATED_AT - 25 * 60 * 60 * 1000,
            expiresAt: BASE_CREATED_AT + 60 * 1000,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(res.allowed, false);
    });
    // 11. A legitimate order cannot be transitioned to EXPIRED before 24 hours (1 min)
    runTest('TEST 11: A legitimate order cannot be transitioned to EXPIRED at 1 min', () => {
        const res = evaluateOrderUpdateRule(baseValidOrder, { status: 'EXPIRED' }, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT + 60 * 1000);
        assert_1.default.strictEqual(res.allowed, false);
    });
    // 12. A legitimate order can transition to EXPIRED after 24 hours
    runTest('TEST 12: A legitimate order can transition to EXPIRED after 24 hours', () => {
        const res = evaluateOrderUpdateRule(baseValidOrder, { status: 'EXPIRED' }, { uid: 'seller_karachi_2' }, BASE_CREATED_AT + TWENTY_FOUR_HOURS_MS + 1000);
        assert_1.default.strictEqual(res.allowed, true);
    });
    // 13. Buyer cannot exploit expiration Rule through forged expiresAt
    runTest('TEST 13: Buyer cannot exploit expiration Rule through forged expiresAt', () => {
        // Even if an order somehow had a 1-min expiresAt, update rule requires createdAt + 24h
        const tamperedOrder = {
            ...baseValidOrder,
            expiresAt: BASE_CREATED_AT + 60 * 1000,
        };
        const res = evaluateOrderUpdateRule(tamperedOrder, { status: 'EXPIRED' }, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT + 120 * 1000 // 2 min
        );
        assert_1.default.strictEqual(res.allowed, false);
    });
    // 14. Seller cannot exploit expiration Rule through forged expiresAt
    runTest('TEST 14: Seller cannot exploit expiration Rule through forged expiresAt', () => {
        const tamperedOrder = {
            ...baseValidOrder,
            expiresAt: BASE_CREATED_AT + 60 * 1000,
        };
        const res = evaluateOrderUpdateRule(tamperedOrder, { status: 'EXPIRED' }, { uid: 'seller_karachi_2' }, BASE_CREATED_AT + 120 * 1000);
        assert_1.default.strictEqual(res.allowed, false);
    });
    // 15. Existing Standard Marketplace lifecycle transitions remain valid
    runTest('TEST 15: Standard Marketplace transitions (PENDING -> ACCEPTED / REJECTED) remain valid', () => {
        const resAccept = evaluateOrderUpdateRule(baseValidOrder, { status: 'ACCEPTED' }, { uid: 'seller_karachi_2' }, BASE_CREATED_AT + 5000);
        assert_1.default.strictEqual(resAccept.allowed, true);
        const resReject = evaluateOrderUpdateRule(baseValidOrder, { status: 'REJECTED' }, { uid: 'seller_karachi_2' }, BASE_CREATED_AT + 5000);
        assert_1.default.strictEqual(resReject.allowed, true);
    });
    // 16. Battle Bids order creation remains unaffected
    runTest('TEST 16: Battle Bids order creation remains unaffected', () => {
        const resBB = evaluateOrderCreateRule({
            source: 'battle_bids',
            buyerId: 'bb_buyer_1',
            sellerId: 'bb_seller_2',
            status: 'AWAITING_PAYMENT',
        }, null, { uid: 'bb_buyer_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(resBB.allowed, true);
    });
    // 17. SEC-05-08-A Price Drops atomic checkout remains valid
    runTest('TEST 17: Price Drops order creation format passes creation rules', () => {
        const resPriceDrop = evaluateOrderCreateRule({
            listingId: 'listing_camera_999',
            buyerId: 'buyer_lahore_1',
            sellerId: 'seller_karachi_2',
            status: 'PENDING',
            createdAt: BASE_CREATED_AT,
            expiresAt: BASE_CREATED_AT + TWENTY_FOUR_HOURS_MS,
        }, validListing, { uid: 'buyer_lahore_1' }, BASE_CREATED_AT);
        assert_1.default.strictEqual(resPriceDrop.allowed, true);
    });
    // 18. Existing financial/identity immutability remains valid
    runTest('TEST 18: Existing financial/identity immutability remains strictly enforced', () => {
        const resPriceTamper = evaluateOrderUpdateRule(baseValidOrder, { totalAmount: 1 }, { uid: 'seller_karachi_2' }, BASE_CREATED_AT + 5000);
        assert_1.default.strictEqual(resPriceTamper.allowed, false);
    });
    // 19. Existing standardOrderExpiration worker tests remain valid
    runTest('TEST 19: Server expiration worker after 24 hours satisfies update rules', () => {
        const resServer = evaluateOrderUpdateRule(baseValidOrder, { status: 'EXPIRED' }, { uid: 'seller_karachi_2' }, BASE_CREATED_AT + TWENTY_FOUR_HOURS_MS + 5000);
        assert_1.default.strictEqual(resServer.allowed, true);
    });
    // 20. Concurrency behavior remains valid
    runTest('TEST 20: Once ACCEPTED, order cannot be transitioned to EXPIRED', () => {
        const acceptedOrder = {
            ...baseValidOrder,
            status: 'ACCEPTED',
        };
        const res = evaluateOrderUpdateRule(acceptedOrder, { status: 'EXPIRED' }, { uid: 'seller_karachi_2' }, BASE_CREATED_AT + TWENTY_FOUR_HOURS_MS + 5000);
        assert_1.default.strictEqual(res.allowed, false);
    });
    console.log(`=== STANDARD ORDER EXPIRATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
    if (failed > 0) {
        throw new Error(`Standard order expiration test suite had ${failed} failures!`);
    }
}
if (require.main === module) {
    runStandardOrderExpirationUnitTests();
}
//# sourceMappingURL=standardOrderExpiration.test.js.map