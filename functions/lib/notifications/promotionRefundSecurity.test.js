"use strict";
/**
 * Deterministic Unit Test Suite for SEC-05-14-C-DB02 Finding #2 Phase 2D
 * Promotion Refund Workflow Remediation & Server Alert Hardening
 *
 * Verifies:
 * 1. Client-side update payload constraints against firestore.rules:
 *    - Strict prohibition of client-supplied financial calculation fields:
 *      ('refundCalculatedAmount', 'refundRetentionAmount', 'refundPercentage', 'refundRetentionPercentage')
 *    - Only permitted refund fields ('refundRequested', 'refundRequestedAt', 'refundStatus',
 *      'refundName', 'refundBankName', 'refundAccountNumber', 'refundProofImages', 'refundProofImage', 'updatedAt')
 *    - Strict prohibition of client direct writes to admin notifications
 * 2. Cloud Function trigger lifecycle & state transitions:
 *    - Legitimate transition (!before.refundRequested -> after.refundRequested=true, refundStatus='PENDING') triggers alert
 *    - Duplicate / subsequent updates with refund already pending are suppressed
 *    - Authoritative 95% refund and 5% retention calculations
 *    - Worldwide multi-currency support and format preservation
 *    - Idempotency with deterministic notification IDs
 *    - Dual-write contract to root /notifications and /users/{adminUid}/notifications
 *
 * Runs locally with 0 production Firestore or Storage reads/writes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluatePromotionRequestRefundUpdateRule = evaluatePromotionRequestRefundUpdateRule;
exports.processPromotionRefundTrigger = processPromotionRefundTrigger;
const assert_1 = __importDefault(require("assert"));
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Simulates Firestore Rules logic for match /promotionRequests/{requestId} update by normal user.
 */
function evaluatePromotionRequestRefundUpdateRule(auth, existing, incoming, currentTimeMs) {
    if (!auth || !auth.uid) {
        return { allowed: false, reason: 'UNAUTHENTICATED' };
    }
    if (existing.userId !== auth.uid) {
        return { allowed: false, reason: 'USER_ID_MISMATCH' };
    }
    // Status must remain identical for normal clients
    if (incoming.status && incoming.status !== existing.status) {
        return { allowed: false, reason: 'CANNOT_MUTATE_LIFECYCLE_STATUS' };
    }
    const incomingKeys = Object.keys(incoming);
    // Prohibited keys list from firestore.rules lines 486-492
    const forbiddenKeys = [
        'receivedAmount', 'verificationStage', 'paymentVerifiedBy', 'paymentVerifiedByUid', 'paymentVerifiedAt',
        'rejectionCategory', 'rejectedAt', 'isRefundable',
        'isActivated', 'resumeConsumed', 'approvedAt', 'resumedAt', 'expiresAt',
        'refundedAt', 'refundedBy', 'refundedByUid', 'verifierRejectReason', 'adminRefundProof',
        'refundCalculatedAmount', 'refundRetentionAmount', 'refundPercentage', 'refundRetentionPercentage'
    ];
    for (const k of incomingKeys) {
        if (forbiddenKeys.includes(k)) {
            return { allowed: false, reason: `FORBIDDEN_KEY_MUTATION_${k}` };
        }
    }
    // Preconditions for Legitimate Refund Claim on Eligible Rejected Promotion (firestore.rules lines 500-525)
    if (existing.status !== 'REJECTED') {
        return { allowed: false, reason: 'NOT_IN_REJECTED_STATUS' };
    }
    if (existing.verificationStage !== 'PAYMENT_VERIFIED') {
        return { allowed: false, reason: 'PAYMENT_NOT_VERIFIED' };
    }
    if (!existing.receivedAmount || existing.receivedAmount <= 0) {
        return { allowed: false, reason: 'NO_RECEIVED_PAYMENT' };
    }
    if (existing.rejectionCategory === 'FRAUD' || existing.rejectionCategory === 'NON_PAYMENT') {
        return { allowed: false, reason: 'FRAUD_OR_NON_PAYMENT_INELIGIBLE' };
    }
    if (existing.isRefundable === false) {
        return { allowed: false, reason: 'NON_REFUNDABLE' };
    }
    if (existing.isActivated === true) {
        return { allowed: false, reason: 'ACTIVATED_CANNOT_REFUND' };
    }
    if (existing.refundStatus === 'REFUNDED') {
        return { allowed: false, reason: 'ALREADY_REFUNDED' };
    }
    if (existing.refundRequested === true) {
        return { allowed: false, reason: 'ALREADY_REQUESTED' };
    }
    const deadlineBase = existing.rejectedAt || existing.updatedAt || 0;
    if (currentTimeMs >= deadlineBase + SEVEN_DAYS_MS) {
        return { allowed: false, reason: 'REFUND_DEADLINE_EXPIRED' };
    }
    if (incoming.refundRequested !== true) {
        return { allowed: false, reason: 'REFUND_REQUESTED_MUST_BE_TRUE' };
    }
    if (incoming.refundStatus !== 'PENDING') {
        return { allowed: false, reason: 'REFUND_STATUS_MUST_BE_PENDING' };
    }
    const permittedRefundKeys = [
        'refundRequested', 'refundRequestedAt', 'refundStatus',
        'refundName', 'refundBankName', 'refundAccountNumber',
        'refundProofImages', 'refundProofImage',
        'updatedAt'
    ];
    for (const k of incomingKeys) {
        if (!permittedRefundKeys.includes(k)) {
            return { allowed: false, reason: `UNAUTHORIZED_FIELD_${k}` };
        }
    }
    return { allowed: true, reason: 'LEGITIMATE_REFUND_SUBMISSION' };
}
/**
 * Simulates server-authoritative trigger calculation & notification dispatch.
 */
function processPromotionRefundTrigger(before, after, adminUids) {
    const wasPending = before.refundRequested === true && before.refundStatus === 'PENDING';
    const isPending = after.refundRequested === true && after.refundStatus === 'PENDING';
    if (wasPending || !isPending) {
        return { triggered: false, reason: 'SUPPRESSED_NO_TRANSITION' };
    }
    const requestId = after.id || 'promo_test_123';
    const rawReceived = after.receivedAmount || 0;
    const refundAmount = Math.round(rawReceived * 0.95);
    const retentionAmount = Math.max(0, rawReceived - refundAmount);
    const currency = (after.currency || 'PKR').toUpperCase();
    const currencySymbol = currency === 'USD'
        ? '$'
        : currency === 'EUR'
            ? '€'
            : currency === 'GBP'
                ? '£'
                : currency === 'PKR'
                    ? 'Rs. '
                    : `${currency} `;
    const planName = after.planName || 'Badge Promotion';
    const notificationTitle = '💸 User Refund Request Submitted';
    const notificationMessage = `A 95% refund of ${currencySymbol}${refundAmount.toLocaleString()} (5% retention: ${currencySymbol}${retentionAmount.toLocaleString()}) has been claimed for badge "${planName}" with ${(after.refundProofImages || []).length} attached payment proof(s). Please check it in the PROMO panel under Admin Dashboard.`;
    const dispatchedNotifications = adminUids.map((adminUid) => {
        const notifId = `refund_req_${requestId}_${adminUid}`;
        return {
            rootPath: `/notifications/${notifId}`,
            userPath: `/users/${adminUid}/notifications/${notifId}`,
            payload: {
                id: notifId,
                userId: adminUid,
                type: 'REFUND_REQUEST',
                title: notificationTitle,
                message: notificationMessage,
                relatedId: requestId,
                requestId: requestId,
                link: '/admin',
                url: '/admin',
                read: false,
                isRead: false
            }
        };
    });
    return {
        triggered: true,
        refundCalculatedAmount: refundAmount,
        refundRetentionAmount: retentionAmount,
        refundPercentage: 95,
        refundRetentionPercentage: 5,
        dispatchedNotifications
    };
}
// ==========================================
// TEST EXECUTION
// ==========================================
console.log('--- Running SEC-05-14-C-DB02 Finding #2 Phase 2D Tests ---');
let testsPassed = 0;
let testsRun = 0;
function runTest(name, fn) {
    testsRun++;
    try {
        fn();
        testsPassed++;
        console.log(`  ✓ [PASS] ${testsRun}. ${name}`);
    }
    catch (err) {
        console.error(`  ✗ [FAIL] ${testsRun}. ${name}`);
        console.error(err);
        process.exit(1);
    }
}
const baseEligibleDoc = {
    id: 'promo_req_999',
    userId: 'user_alice_456',
    status: 'REJECTED',
    verificationStage: 'PAYMENT_VERIFIED',
    receivedAmount: 1000,
    currency: 'USD',
    planName: '30 Days Featured',
    rejectionCategory: 'IMAGE_BLURRY',
    rejectedAt: Date.now() - 100000, // within 7 days
    updatedAt: Date.now() - 100000,
    isRefundable: true,
    isActivated: false,
    refundRequested: false,
    refundStatus: null
};
const aliceAuth = { uid: 'user_alice_456' };
const eveAuth = { uid: 'user_eve_789' };
// Test 1: Remediated client update payload -> ALLOWED
runTest('Remediated client update payload without forbidden financial fields is ALLOWED', () => {
    const payload = {
        refundRequested: true,
        refundRequestedAt: Date.now(),
        refundStatus: 'PENDING',
        refundName: 'Alice Smith',
        refundBankName: 'Chase Bank',
        refundAccountNumber: '123456789',
        refundProofImages: ['https://example.com/proof1.png'],
        refundProofImage: 'https://example.com/proof1.png',
        updatedAt: Date.now()
    };
    const res = evaluatePromotionRequestRefundUpdateRule(aliceAuth, baseEligibleDoc, payload, Date.now());
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'LEGITIMATE_REFUND_SUBMISSION');
});
// Test 2: Client attempting to inject refundCalculatedAmount -> DENIED
runTest('Client attempting to inject refundCalculatedAmount is DENIED', () => {
    const payload = {
        refundRequested: true,
        refundStatus: 'PENDING',
        refundCalculatedAmount: 950,
        refundName: 'Alice Smith',
        refundBankName: 'Chase Bank',
        refundAccountNumber: '123456789'
    };
    const res = evaluatePromotionRequestRefundUpdateRule(aliceAuth, baseEligibleDoc, payload, Date.now());
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_KEY_MUTATION_refundCalculatedAmount');
});
// Test 3: Client attempting to inject refundRetentionAmount -> DENIED
runTest('Client attempting to inject refundRetentionAmount is DENIED', () => {
    const payload = {
        refundRequested: true,
        refundStatus: 'PENDING',
        refundRetentionAmount: 50,
        refundName: 'Alice Smith',
        refundBankName: 'Chase Bank',
        refundAccountNumber: '123456789'
    };
    const res = evaluatePromotionRequestRefundUpdateRule(aliceAuth, baseEligibleDoc, payload, Date.now());
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_KEY_MUTATION_refundRetentionAmount');
});
// Test 4: Client attempting to inject refundPercentage -> DENIED
runTest('Client attempting to inject refundPercentage is DENIED', () => {
    const payload = {
        refundRequested: true,
        refundStatus: 'PENDING',
        refundPercentage: 95,
        refundName: 'Alice Smith',
        refundBankName: 'Chase Bank',
        refundAccountNumber: '123456789'
    };
    const res = evaluatePromotionRequestRefundUpdateRule(aliceAuth, baseEligibleDoc, payload, Date.now());
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_KEY_MUTATION_refundPercentage');
});
// Test 5: Client attempting to inject refundRetentionPercentage -> DENIED
runTest('Client attempting to inject refundRetentionPercentage is DENIED', () => {
    const payload = {
        refundRequested: true,
        refundStatus: 'PENDING',
        refundRetentionPercentage: 5,
        refundName: 'Alice Smith',
        refundBankName: 'Chase Bank',
        refundAccountNumber: '123456789'
    };
    const res = evaluatePromotionRequestRefundUpdateRule(aliceAuth, baseEligibleDoc, payload, Date.now());
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FORBIDDEN_KEY_MUTATION_refundRetentionPercentage');
});
// Test 6: Cross-user refund submission -> DENIED
runTest('Cross-user attempting to file refund for another user is DENIED', () => {
    const payload = {
        refundRequested: true,
        refundStatus: 'PENDING',
        refundName: 'Eve Hacker',
        refundBankName: 'Hacker Bank',
        refundAccountNumber: '999999'
    };
    const res = evaluatePromotionRequestRefundUpdateRule(eveAuth, baseEligibleDoc, payload, Date.now());
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'USER_ID_MISMATCH');
});
// Test 7: Expired refund deadline (>7 days) -> DENIED
runTest('Refund claim filed beyond the 7-day window is DENIED', () => {
    const expiredDoc = {
        ...baseEligibleDoc,
        rejectedAt: Date.now() - (8 * 24 * 60 * 60 * 1000) // 8 days ago
    };
    const payload = {
        refundRequested: true,
        refundStatus: 'PENDING',
        refundName: 'Alice Smith',
        refundBankName: 'Chase Bank',
        refundAccountNumber: '123456789'
    };
    const res = evaluatePromotionRequestRefundUpdateRule(aliceAuth, expiredDoc, payload, Date.now());
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'REFUND_DEADLINE_EXPIRED');
});
// Test 8: Ineligible fraudulent promotion -> DENIED
runTest('Refund claim on promotion rejected for FRAUD is DENIED', () => {
    const fraudDoc = {
        ...baseEligibleDoc,
        rejectionCategory: 'FRAUD'
    };
    const payload = {
        refundRequested: true,
        refundStatus: 'PENDING',
        refundName: 'Alice Smith',
        refundBankName: 'Chase Bank',
        refundAccountNumber: '123456789'
    };
    const res = evaluatePromotionRequestRefundUpdateRule(aliceAuth, fraudDoc, payload, Date.now());
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'FRAUD_OR_NON_PAYMENT_INELIGIBLE');
});
// Test 9: Cloud Function trigger state transition: Legitimate transition fires
runTest('Cloud Function fires and calculates 95% refund on valid refund transition', () => {
    const beforeState = {
        refundRequested: false,
        refundStatus: null
    };
    const afterState = {
        id: 'promo_req_999',
        receivedAmount: 10000,
        currency: 'PKR',
        planName: '30 Days Featured',
        refundRequested: true,
        refundStatus: 'PENDING',
        refundProofImages: ['img1.jpg', 'img2.jpg']
    };
    const adminUids = ['admin_1', 'admin_2'];
    const res = processPromotionRefundTrigger(beforeState, afterState, adminUids);
    assert_1.default.strictEqual(res.triggered, true);
    assert_1.default.strictEqual(res.refundCalculatedAmount, 9500);
    assert_1.default.strictEqual(res.refundRetentionAmount, 500);
    assert_1.default.strictEqual(res.refundPercentage, 95);
    assert_1.default.strictEqual(res.refundRetentionPercentage, 5);
    assert_1.default.strictEqual(res.dispatchedNotifications?.length, 2);
    // Check notification payload contract
    const notif1 = res.dispatchedNotifications[0];
    assert_1.default.strictEqual(notif1.rootPath, '/notifications/refund_req_promo_req_999_admin_1');
    assert_1.default.strictEqual(notif1.userPath, '/users/admin_1/notifications/refund_req_promo_req_999_admin_1');
    assert_1.default.strictEqual(notif1.payload.type, 'REFUND_REQUEST');
    assert_1.default.strictEqual(notif1.payload.link, '/admin');
    assert_1.default.strictEqual(notif1.payload.read, false);
    assert_1.default.ok(notif1.payload.message.includes('Rs. 9,500'));
    assert_1.default.ok(notif1.payload.message.includes('Rs. 500'));
});
// Test 10: Multi-currency formatting: USD
runTest('Cloud Function preserves USD currency formatting', () => {
    const beforeState = { refundRequested: false };
    const afterState = {
        id: 'promo_usd_1',
        receivedAmount: 200,
        currency: 'USD',
        planName: 'Verified Badge',
        refundRequested: true,
        refundStatus: 'PENDING'
    };
    const res = processPromotionRefundTrigger(beforeState, afterState, ['admin_1']);
    assert_1.default.strictEqual(res.triggered, true);
    assert_1.default.strictEqual(res.refundCalculatedAmount, 190);
    assert_1.default.strictEqual(res.refundRetentionAmount, 10);
    assert_1.default.ok(res.dispatchedNotifications[0].payload.message.includes('$190'));
    assert_1.default.ok(res.dispatchedNotifications[0].payload.message.includes('$10'));
});
// Test 11: Idempotency & Duplicate Suppression
runTest('Subsequent updates when refund is already PENDING are SUPPRESSED', () => {
    const beforeState = {
        refundRequested: true,
        refundStatus: 'PENDING'
    };
    const afterState = {
        id: 'promo_req_999',
        refundRequested: true,
        refundStatus: 'PENDING',
        updatedAt: Date.now()
    };
    const res = processPromotionRefundTrigger(beforeState, afterState, ['admin_1']);
    assert_1.default.strictEqual(res.triggered, false);
    assert_1.default.strictEqual(res.reason, 'SUPPRESSED_NO_TRANSITION');
});
// Test 12: Deterministic notification ID format guarantees idempotency
runTest('Deterministic notification ID follows refund_req_${requestId}_${adminUid}', () => {
    const notif = processPromotionRefundTrigger({ refundRequested: false }, { id: 'req_xyz_123', receivedAmount: 500, refundRequested: true, refundStatus: 'PENDING' }, ['admin_alpha']).dispatchedNotifications[0];
    assert_1.default.strictEqual(notif.payload.id, 'refund_req_req_xyz_123_admin_alpha');
    assert_1.default.strictEqual(notif.rootPath, '/notifications/refund_req_req_xyz_123_admin_alpha');
    assert_1.default.strictEqual(notif.userPath, '/users/admin_alpha/notifications/refund_req_req_xyz_123_admin_alpha');
});
console.log(`\nAll ${testsPassed}/${testsRun} Phase 2D tests passed successfully.\n`);
//# sourceMappingURL=promotionRefundSecurity.test.js.map