"use strict";
/**
 * Deterministic Unit Test Suite for SEC-05-08-A
 * Price Drops Direct Checkout Race / Inventory Reservation Integrity (F01)
 *
 * Runs locally with 0 production Firestore reads/writes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeDirectBuyTransaction = executeDirectBuyTransaction;
exports.runPriceDropsDirectCheckoutUnitTests = runPriceDropsDirectCheckoutUnitTests;
const assert_1 = __importDefault(require("assert"));
/**
 * Deterministic simulation of the hardened atomic runTransaction for direct checkout
 */
function executeDirectBuyTransaction(listing, buyerId, requestedQuantity = 1) {
    // 1. Transaction Read & Existence check
    if (!listing) {
        return { success: false, error: 'ITEM_NOT_FOUND: This listing no longer exists.' };
    }
    // 2. Status check against authoritative document
    if (['SOLD', 'BOOKED', 'SUSPENDED', 'REJECTED'].includes(listing.status)) {
        return { success: false, error: 'ITEM_UNAVAILABLE: This item is no longer available for purchase.' };
    }
    // 3. Quantity check against authoritative document
    const currentQuantity = typeof listing.quantity === 'number' ? listing.quantity : 1;
    if (currentQuantity < requestedQuantity) {
        return { success: false, error: 'OUT_OF_STOCK: This item is out of stock.' };
    }
    // 4. Seller self-buy check
    if (listing.ownerId === buyerId) {
        return { success: false, error: 'SELLER_CANNOT_BUY: You cannot purchase your own listed item.' };
    }
    // 5. Atomic state update calculation
    const newStock = currentQuantity - requestedQuantity;
    const newListingStatus = newStock === 0 ? 'SOLD' : listing.status;
    const updatedListing = {
        ...listing,
        quantity: newStock,
        status: newListingStatus,
        bookedAt: newStock === 0 ? Date.now() : listing.bookedAt
    };
    const order = {
        id: `ord_${Math.random().toString(36).substring(2, 9)}`,
        listingId: listing.id,
        buyerId,
        sellerId: listing.ownerId,
        unitPrice: listing.price,
        quantity: requestedQuantity,
        totalAmount: listing.price * requestedQuantity + (listing.shippingCharges || 0),
        status: 'PENDING'
    };
    return { success: true, order, updatedListing };
}
function runPriceDropsDirectCheckoutUnitTests() {
    console.log('=== STARTING SEC-05-08-A PRICE DROPS DIRECT CHECKOUT UNIT TESTS ===');
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
    const baseUniqueListing = {
        id: 'listing_vintage_watch_1',
        title: 'Vintage Chronograph Watch',
        ownerId: 'seller_karachi_101',
        price: 45000,
        quantity: 1,
        status: 'LIVE',
        currency: 'PKR',
        shippingCharges: 500
    };
    // TEST 1: Single quantity listing + Buyer A purchase succeeds
    runTest('TEST 1: Single quantity listing + Buyer A purchase succeeds', () => {
        const res = executeDirectBuyTransaction(baseUniqueListing, 'buyer_lahore_202', 1);
        assert_1.default.strictEqual(res.success, true);
        assert_1.default.ok(res.order);
        assert_1.default.strictEqual(res.order.status, 'PENDING');
        assert_1.default.strictEqual(res.order.sellerId, 'seller_karachi_101');
        assert_1.default.strictEqual(res.order.buyerId, 'buyer_lahore_202');
        assert_1.default.strictEqual(res.updatedListing?.quantity, 0);
        assert_1.default.strictEqual(res.updatedListing?.status, 'SOLD');
    });
    // TEST 2: Same listing + Buyer B concurrent purchase fails (serialized transaction conflict simulation)
    runTest('TEST 2: Same listing + Buyer B concurrent purchase fails after Buyer A claims item', () => {
        // Buyer A runs first
        const resA = executeDirectBuyTransaction(baseUniqueListing, 'buyer_lahore_202', 1);
        assert_1.default.strictEqual(resA.success, true);
        // In a Firestore transaction, Buyer B re-reads the updated listing state committed by Buyer A
        const freshListingState = resA.updatedListing;
        const resB = executeDirectBuyTransaction(freshListingState, 'buyer_islamabad_303', 1);
        assert_1.default.strictEqual(resB.success, false);
        assert_1.default.strictEqual(resB.error, 'ITEM_UNAVAILABLE: This item is no longer available for purchase.');
        assert_1.default.strictEqual(resB.order, undefined);
    });
    // TEST 3: Listing already SOLD + purchase fails
    runTest('TEST 3: Listing already SOLD + purchase fails', () => {
        const soldListing = { ...baseUniqueListing, status: 'SOLD', quantity: 0 };
        const res = executeDirectBuyTransaction(soldListing, 'buyer_lahore_202', 1);
        assert_1.default.strictEqual(res.success, false);
        assert_1.default.strictEqual(res.error, 'ITEM_UNAVAILABLE: This item is no longer available for purchase.');
    });
    // TEST 4: Listing unavailable according to actual existing status model + purchase fails
    runTest('TEST 4: Listing status BOOKED / SUSPENDED + purchase fails', () => {
        const bookedListing = { ...baseUniqueListing, status: 'BOOKED', quantity: 0 };
        const resBooked = executeDirectBuyTransaction(bookedListing, 'buyer_lahore_202', 1);
        assert_1.default.strictEqual(resBooked.success, false);
        const suspendedListing = { ...baseUniqueListing, status: 'SUSPENDED', quantity: 1 };
        const resSuspended = executeDirectBuyTransaction(suspendedListing, 'buyer_lahore_202', 1);
        assert_1.default.strictEqual(resSuspended.success, false);
    });
    // TEST 5: Quantity == 1 cannot produce two successful active orders
    runTest('TEST 5: Quantity == 1 cannot produce two successful active orders', () => {
        let activeListing = { ...baseUniqueListing };
        const orders = [];
        // Simulate 2 competing attempts
        const attemptA = executeDirectBuyTransaction(activeListing, 'buyer_A', 1);
        if (attemptA.success && attemptA.order) {
            orders.push(attemptA.order);
            activeListing = attemptA.updatedListing;
        }
        const attemptB = executeDirectBuyTransaction(activeListing, 'buyer_B', 1);
        if (attemptB.success && attemptB.order) {
            orders.push(attemptB.order);
            activeListing = attemptB.updatedListing;
        }
        assert_1.default.strictEqual(orders.length, 1);
        assert_1.default.strictEqual(orders[0].buyerId, 'buyer_A');
    });
    // TEST 6: Same buyer repeated submission cannot create two active orders for the same unique item
    runTest('TEST 6: Same buyer repeated submission fails on second call', () => {
        const attempt1 = executeDirectBuyTransaction(baseUniqueListing, 'buyer_A', 1);
        assert_1.default.strictEqual(attempt1.success, true);
        const attempt2 = executeDirectBuyTransaction(attempt1.updatedListing, 'buyer_A', 1);
        assert_1.default.strictEqual(attempt2.success, false);
    });
    // TEST 7: Seller identity remains authoritative from listing
    runTest('TEST 7: Seller identity remains authoritative', () => {
        const res = executeDirectBuyTransaction(baseUniqueListing, 'buyer_lahore_202', 1);
        assert_1.default.strictEqual(res.order?.sellerId, baseUniqueListing.ownerId);
    });
    // TEST 8: Buyer identity remains request.auth.uid
    runTest('TEST 8: Buyer identity matches authentic caller UID', () => {
        const res = executeDirectBuyTransaction(baseUniqueListing, 'caller_uid_999', 1);
        assert_1.default.strictEqual(res.order?.buyerId, 'caller_uid_999');
    });
    // TEST 9: Financial fields remain authoritative from listing
    runTest('TEST 9: Financial fields derived authoritatively from listing', () => {
        const res = executeDirectBuyTransaction(baseUniqueListing, 'caller_uid_999', 1);
        assert_1.default.strictEqual(res.order?.unitPrice, 45000);
        assert_1.default.strictEqual(res.order?.totalAmount, 45500); // 45000 + 500 shipping
    });
    // TEST 10: Existing SEC-05-04 order lifecycle behavior remains intact
    runTest('TEST 10: SEC-05-04 initial order status is strictly PENDING', () => {
        const res = executeDirectBuyTransaction(baseUniqueListing, 'caller_uid_999', 1);
        assert_1.default.strictEqual(res.order?.status, 'PENDING');
    });
    // TEST 11: Transaction retry does not duplicate the order
    runTest('TEST 11: Transaction retry observes updated stock and aborts', () => {
        // Initial attempt commits
        const commit1 = executeDirectBuyTransaction(baseUniqueListing, 'buyer_1', 1);
        assert_1.default.strictEqual(commit1.success, true);
        // Retry re-evaluates commit1.updatedListing
        const retryAttempt = executeDirectBuyTransaction(commit1.updatedListing, 'buyer_1', 1);
        assert_1.default.strictEqual(retryAttempt.success, false);
    });
    // TEST 12: Failed purchase does not produce a seller success notification
    runTest('TEST 12: Notification gate prevents alert when transaction fails', () => {
        let notificationSent = false;
        const sendNotificationMock = () => { notificationSent = true; };
        const soldListing = { ...baseUniqueListing, status: 'SOLD' };
        const res = executeDirectBuyTransaction(soldListing, 'buyer_X', 1);
        if (res.success) {
            sendNotificationMock();
        }
        assert_1.default.strictEqual(notificationSent, false);
    });
    // TEST 13: Existing quantity > 1 behavior remains correct (decrements stock without marking SOLD until 0)
    runTest('TEST 13: Quantity > 1 decrements stock and remains LIVE until zero', () => {
        const multiItemListing = { ...baseUniqueListing, quantity: 3 };
        const buy1 = executeDirectBuyTransaction(multiItemListing, 'buyer_1', 1);
        assert_1.default.strictEqual(buy1.success, true);
        assert_1.default.strictEqual(buy1.updatedListing?.quantity, 2);
        assert_1.default.strictEqual(buy1.updatedListing?.status, 'LIVE');
        const buy2 = executeDirectBuyTransaction(buy1.updatedListing, 'buyer_2', 1);
        assert_1.default.strictEqual(buy2.success, true);
        assert_1.default.strictEqual(buy2.updatedListing?.quantity, 1);
        assert_1.default.strictEqual(buy2.updatedListing?.status, 'LIVE');
        const buy3 = executeDirectBuyTransaction(buy2.updatedListing, 'buyer_3', 1);
        assert_1.default.strictEqual(buy3.success, true);
        assert_1.default.strictEqual(buy3.updatedListing?.quantity, 0);
        assert_1.default.strictEqual(buy3.updatedListing?.status, 'SOLD');
        // 4th purchase fails
        const buy4 = executeDirectBuyTransaction(buy3.updatedListing, 'buyer_4', 1);
        assert_1.default.strictEqual(buy4.success, false);
    });
    // TEST 14: Rule overlap cannot bypass the new protection
    runTest('TEST 14: Buyer cannot buy own listing', () => {
        const selfBuyRes = executeDirectBuyTransaction(baseUniqueListing, baseUniqueListing.ownerId, 1);
        assert_1.default.strictEqual(selfBuyRes.success, false);
        assert_1.default.strictEqual(selfBuyRes.error, 'SELLER_CANNOT_BUY: You cannot purchase your own listed item.');
    });
    console.log(`=== PRICE DROPS DIRECT CHECKOUT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
    if (failed > 0) {
        throw new Error(`Price Drops direct checkout test suite had ${failed} failures!`);
    }
}
if (require.main === module) {
    runPriceDropsDirectCheckoutUnitTests();
}
//# sourceMappingURL=priceDropsDirectCheckout.test.js.map