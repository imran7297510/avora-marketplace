"use strict";
/**
 * Deterministic Unit Test Suite for SEC-05-14-C-DB02-A
 * Promotion Request Creation & Value Integrity Security
 *
 * Simulates and verifies the exact Firestore Rules evaluation logic for:
 *   match /promotionRequests/{requestId}
 *
 * Verifies that:
 * 1. Legitimate creation for all catalog packages (FEATURED, BOOST, VERIFIED) is ALLOWED across PKR, USD, USDT.
 * 2. Applicant cannot create a promotion request for another user (USER_ID_MISMATCH).
 * 3. Arbitrary amount injection is DENIED.
 * 4. Arbitrary durationDays injection is DENIED.
 * 5. Arbitrary planName injection is DENIED.
 * 6. Arbitrary currency injection is DENIED.
 * 7. Unknown package/type injection is DENIED.
 * 8. Price decoupling attacks (amount = 1 with 365 days) are DENIED.
 * 9. Legitimate amount with artificially inflated duration is DENIED.
 * 10. Privileged approval fields on create (approvedAt, approvedBy, etc.) are DENIED.
 * 11. receivedAmount injection is DENIED.
 * 12. verificationStage manipulation (e.g. PAYMENT_VERIFIED) is DENIED.
 * 13. isActivated=true injection is DENIED.
 * 14. refund lifecycle injection (refundRequested=true) is DENIED.
 *
 * Runs locally with 0 production Firestore or Storage reads/writes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluatePromotionRequestCreateRule = evaluatePromotionRequestCreateRule;
const assert_1 = __importDefault(require("assert"));
/**
 * Deterministic evaluation of firestore.rules for promotionRequests creation:
 */
function evaluatePromotionRequestCreateRule(auth, incoming) {
    if (!auth || !auth.uid) {
        return { allowed: false, reason: 'UNAUTHENTICATED' };
    }
    // All applicants (including KYC Admins and Super Admins) must strictly adhere to applicant ownership & catalog integrity:
    if (incoming.userId !== auth.uid) {
        return { allowed: false, reason: 'USER_ID_MISMATCH' };
    }
    if ('status' in incoming && incoming.status !== 'PENDING') {
        return { allowed: false, reason: 'INVALID_INITIAL_STATUS' };
    }
    if ('receivedAmount' in incoming) {
        return { allowed: false, reason: 'FORBIDDEN_receivedAmount_ON_CREATE' };
    }
    if ('verificationStage' in incoming && incoming.verificationStage !== 'NONE') {
        return { allowed: false, reason: 'FORBIDDEN_verificationStage_ON_CREATE' };
    }
    if ('isActivated' in incoming && incoming.isActivated !== false) {
        return { allowed: false, reason: 'FORBIDDEN_isActivated_ON_CREATE' };
    }
    if ('resumeConsumed' in incoming && incoming.resumeConsumed !== false) {
        return { allowed: false, reason: 'FORBIDDEN_resumeConsumed_ON_CREATE' };
    }
    if ('refundRequested' in incoming && incoming.refundRequested !== false) {
        return { allowed: false, reason: 'FORBIDDEN_refundRequested_ON_CREATE' };
    }
    if ('refundStatus' in incoming && incoming.refundStatus !== null) {
        return { allowed: false, reason: 'FORBIDDEN_refundStatus_ON_CREATE' };
    }
    const forbiddenKeys = [
        'approvedAt', 'approvedBy', 'verifiedBy', 'verifiedByUid',
        'paymentVerifiedBy', 'paymentVerifiedByUid', 'paymentVerifiedAt',
        'rejectedAt', 'rejectedBy', 'refundApprovedAt', 'refundApprovedBy',
        'refundCalculatedAmount'
    ];
    for (const key of forbiddenKeys) {
        if (key in incoming) {
            return { allowed: false, reason: `FORBIDDEN_${key}_ON_CREATE` };
        }
    }
    // Authoritative Catalog Whitelist & Value Integrity Invariants
    const type = incoming.type;
    const duration = incoming.durationDays;
    const planName = incoming.planName;
    const currency = incoming.currency;
    const amount = incoming.amount;
    const isFeatured = (type === 'FEATURED' && duration === 7 && planName === '7 Days' && ((currency === 'PKR' && amount === 499) || (currency === 'USD' && amount === 2) || (currency === 'USDT' && amount === 2))) ||
        (type === 'FEATURED' && duration === 15 && planName === '15 Days' && ((currency === 'PKR' && amount === 899) || (currency === 'USD' && amount === 3.3) || (currency === 'USDT' && amount === 3.5))) ||
        (type === 'FEATURED' && duration === 30 && planName === '30 Days' && ((currency === 'PKR' && amount === 1499) || (currency === 'USD' && amount === 5.5) || (currency === 'USDT' && amount === 5.5)));
    const isBoost = (type === 'BOOST' && duration === 3 && planName === '3 Days' && ((currency === 'PKR' && amount === 299) || (currency === 'USD' && amount === 1.10) || (currency === 'USDT' && amount === 1.10))) ||
        (type === 'BOOST' && duration === 7 && planName === '7 Days' && ((currency === 'PKR' && amount === 599) || (currency === 'USD' && amount === 2.30) || (currency === 'USDT' && amount === 2.30))) ||
        (type === 'BOOST' && duration === 15 && planName === '15 Days' && ((currency === 'PKR' && amount === 999) || (currency === 'USD' && amount === 3.80) || (currency === 'USDT' && amount === 3.80)));
    const isVerified = (type === 'VERIFIED' && duration === 30 && planName === '1 Month' && ((currency === 'PKR' && amount === 1999) || (currency === 'USD' && amount === 7.5) || (currency === 'USDT' && amount === 7.5))) ||
        (type === 'VERIFIED' && duration === 90 && planName === '3 Months' && ((currency === 'PKR' && amount === 4999) || (currency === 'USD' && amount === 18) || (currency === 'USDT' && amount === 18))) ||
        (type === 'VERIFIED' && duration === 180 && planName === '6 Months' && ((currency === 'PKR' && amount === 8999) || (currency === 'USD' && amount === 33) || (currency === 'USDT' && amount === 33))) ||
        (type === 'VERIFIED' && duration === 365 && planName === '12 Months' && ((currency === 'PKR' && amount === 14999) || (currency === 'USD' && amount === 55) || (currency === 'USDT' && amount === 55)));
    if (!isFeatured && !isBoost && !isVerified) {
        return { allowed: false, reason: 'CATALOG_VALUE_INTEGRITY_VIOLATION' };
    }
    return { allowed: true };
}
// Deterministic test runner
let testsRun = 0;
let testsPassed = 0;
function runTest(name, fn) {
    testsRun++;
    try {
        fn();
        testsPassed++;
        console.log(`  ✓ ${name}`);
    }
    catch (err) {
        console.error(`  ✗ ${name}`);
        console.error(`    Error: ${err.message}`);
        throw err;
    }
}
const applicantAuth = { uid: 'user_alice_123', email: 'alice@example.com' };
const attackerAuth = { uid: 'user_bob_hacker', email: 'bob@example.com' };
const baseFeaturedDoc = {
    userId: 'user_alice_123',
    targetId: 'listing_987',
    targetType: 'listings',
    type: 'FEATURED',
    planName: '7 Days',
    amount: 499,
    currency: 'PKR',
    durationDays: 7,
    status: 'PENDING',
    verificationStage: 'NONE',
    isActivated: false,
};
console.log('Running SEC-05-14-C-DB02-A Promotion Request Creation & Value Integrity Security Tests:');
// A. Legitimate creations for all catalog packages
runTest('A1. Legitimate FEATURED 7-day PKR creation -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, { ...baseFeaturedDoc });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('A2. Legitimate FEATURED 15-day PKR creation -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        planName: '15 Days',
        durationDays: 15,
        amount: 899,
    });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('A3. Legitimate FEATURED 30-day PKR creation -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        planName: '30 Days',
        durationDays: 30,
        amount: 1499,
    });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('A4. Legitimate BOOST 3-day PKR creation -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'BOOST',
        planName: '3 Days',
        durationDays: 3,
        amount: 299,
    });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('A5. Legitimate BOOST 7-day PKR creation -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'BOOST',
        planName: '7 Days',
        durationDays: 7,
        amount: 599,
    });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('A6. Legitimate BOOST 15-day PKR creation -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'BOOST',
        planName: '15 Days',
        durationDays: 15,
        amount: 999,
    });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('A7. Legitimate VERIFIED 1-month PKR creation -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'VERIFIED',
        targetId: 'user_alice_123',
        targetType: 'users',
        planName: '1 Month',
        durationDays: 30,
        amount: 1999,
    });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('A8. Legitimate VERIFIED 3-month PKR creation -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'VERIFIED',
        targetId: 'user_alice_123',
        targetType: 'users',
        planName: '3 Months',
        durationDays: 90,
        amount: 4999,
    });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('A9. Legitimate VERIFIED 6-month PKR creation -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'VERIFIED',
        targetId: 'user_alice_123',
        targetType: 'users',
        planName: '6 Months',
        durationDays: 180,
        amount: 8999,
    });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('A10. Legitimate VERIFIED 12-month PKR creation -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'VERIFIED',
        targetId: 'user_alice_123',
        targetType: 'users',
        planName: '12 Months',
        durationDays: 365,
        amount: 14999,
    });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('A11. Legitimate USD & USDT pricing creation -> ALLOWED', () => {
    const resUsd = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'FEATURED',
        planName: '7 Days',
        durationDays: 7,
        currency: 'USD',
        amount: 2,
    });
    assert_1.default.strictEqual(resUsd.allowed, true);
    const resUsdt = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'VERIFIED',
        targetId: 'user_alice_123',
        targetType: 'users',
        planName: '12 Months',
        durationDays: 365,
        currency: 'USDT',
        amount: 55,
    });
    assert_1.default.strictEqual(resUsdt.allowed, true);
});
// B. Identity Binding
runTest('B. Applicant creating for another user -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(attackerAuth, {
        ...baseFeaturedDoc,
        userId: 'user_alice_123', // Bob attempting to create for Alice
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'USER_ID_MISMATCH');
});
// C. Arbitrary amount
runTest('C. Arbitrary amount injection -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        amount: 1, // Attacker paying Rs. 1 for Featured 7 Days
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
// D. Arbitrary durationDays
runTest('D. Arbitrary durationDays injection -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        durationDays: 9999,
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
// E. Arbitrary planName
runTest('E. Arbitrary planName injection -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        planName: 'Super Lifetime Gold',
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
// F. Arbitrary currency
runTest('F. Arbitrary currency injection -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        currency: 'EUR',
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
// G. Unknown package/type
runTest('G. Unknown package/type injection -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'MEGA_BANNER',
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
// H. Attack A: amount=1 with long duration (VULN-DB02-01)
runTest('H. amount=1 with 365-day duration attack -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        type: 'VERIFIED',
        planName: '12 Months',
        durationDays: 365,
        amount: 1,
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
// I. Legitimate amount with manipulated long duration
runTest('I. Legitimate 7-day amount (Rs. 499) claiming 30-day duration -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        planName: '7 Days',
        durationDays: 30, // Claims 30 days but pays 499
        amount: 499,
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
// J. Manipulated low price for 30-day placement
runTest('J. 30-day Featured ad claiming Rs. 499 instead of Rs. 1499 -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        planName: '30 Days',
        durationDays: 30,
        amount: 499,
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
// K. Privileged approval fields on create
runTest('K1. approvedAt on create -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        approvedAt: 1234567,
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_approvedAt_ON_CREATE');
});
runTest('K2. approvedBy on create -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        approvedBy: 'admin@example.com',
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_approvedBy_ON_CREATE');
});
// L. receivedAmount injection on create
runTest('L. receivedAmount injection on create -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        receivedAmount: 499,
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_receivedAmount_ON_CREATE');
});
// M. verificationStage manipulation on create
runTest('M. verificationStage set to PAYMENT_VERIFIED on create -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        verificationStage: 'PAYMENT_VERIFIED',
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_verificationStage_ON_CREATE');
});
// N. isActivated=true injection on create
runTest('N. isActivated=true on create -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        isActivated: true,
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_isActivated_ON_CREATE');
});
// O. refund lifecycle injection on create
runTest('O. refundRequested=true on create -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(applicantAuth, {
        ...baseFeaturedDoc,
        refundRequested: true,
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_refundRequested_ON_CREATE');
});
// P. Unauthenticated user creating
runTest('P. Unauthenticated user creation -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(null, { ...baseFeaturedDoc });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'UNAUTHENTICATED');
});
// Q. KYC Administrator attempting manipulated promotion values (VULN-DB02-A bypass test)
const kycAdminAuth = { uid: 'kyc_admin_123', email: 'mod@example.com', isAdmin: true };
runTest('Q1. KYC Admin attempting manipulated amount (amount=1 for 365 days) -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(kycAdminAuth, {
        ...baseFeaturedDoc,
        userId: 'kyc_admin_123',
        type: 'VERIFIED',
        planName: '12 Months',
        durationDays: 365,
        amount: 1, // Manipulated amount
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
runTest('Q2. KYC Admin attempting arbitrary non-catalog duration (durationDays=9999) -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(kycAdminAuth, {
        ...baseFeaturedDoc,
        userId: 'kyc_admin_123',
        durationDays: 9999,
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
runTest('Q3. KYC Admin attempting to inject approvedAt on create -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(kycAdminAuth, {
        ...baseFeaturedDoc,
        userId: 'kyc_admin_123',
        approvedAt: Date.now(),
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_approvedAt_ON_CREATE');
});
runTest('Q4. KYC Admin attempting to create promotion for another user -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(kycAdminAuth, {
        ...baseFeaturedDoc,
        userId: 'user_alice_123', // Admin trying to forge user_alice_123's request
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'USER_ID_MISMATCH');
});
// R. Super Admin attempting manipulated promotion values
const superAdminAuth = { uid: 'super_admin_001', email: 'imran7297510@gmail.com', isSuper: true };
runTest('R1. Super Admin attempting manipulated amount (amount=1 for 365 days) -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(superAdminAuth, {
        ...baseFeaturedDoc,
        userId: 'super_admin_001',
        type: 'VERIFIED',
        planName: '12 Months',
        durationDays: 365,
        amount: 1,
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'CATALOG_VALUE_INTEGRITY_VIOLATION');
});
runTest('R2. Super Admin creating catalog-valid request for own account -> ALLOWED', () => {
    const res = evaluatePromotionRequestCreateRule(superAdminAuth, {
        ...baseFeaturedDoc,
        userId: 'super_admin_001',
    });
    assert_1.default.strictEqual(res.allowed, true);
});
runTest('R3. Super Admin creating request for another user -> DENIED', () => {
    const res = evaluatePromotionRequestCreateRule(superAdminAuth, {
        ...baseFeaturedDoc,
        userId: 'user_alice_123', // Foreign user
    });
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'USER_ID_MISMATCH');
});
console.log(`\nAll ${testsPassed}/${testsRun} SEC-05-14-C-DB02-A tests passed successfully.\n`);
//# sourceMappingURL=promotionRequestSecurity.test.js.map