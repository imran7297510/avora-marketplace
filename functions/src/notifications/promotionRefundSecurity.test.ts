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

import assert from 'assert';
import {
  handlePromotionRefundRequestedEvent,
  isAlreadyExistsError,
  isExpectedRefundNotificationIdentity
} from './promotionRefundTrigger';

export interface AuthContext {
  uid: string | null;
  email?: string;
  isAdmin?: boolean;
  isSuper?: boolean;
}

export interface PromotionRequestDoc {
  id: string;
  userId: string;
  status: string;
  verificationStage?: string;
  receivedAmount?: number;
  currency?: string;
  planName?: string;
  rejectionCategory?: string;
  rejectedAt?: number;
  updatedAt?: number;
  isRefundable?: boolean;
  isActivated?: boolean;
  refundRequested?: boolean;
  refundRequestedAt?: any;
  refundStatus?: string | null;
  refundCalculatedAmount?: number;
  refundRetentionAmount?: number;
  refundPercentage?: number;
  refundRetentionPercentage?: number;
  refundName?: string;
  refundBankName?: string;
  refundAccountNumber?: string;
  refundProofImages?: string[];
  refundProofImage?: string;
}

export interface RuleResult {
  allowed: boolean;
  reason?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Simulates Firestore Rules logic for match /promotionRequests/{requestId} update by normal user.
 */
export function evaluatePromotionRequestRefundUpdateRule(
  auth: AuthContext | null,
  existing: PromotionRequestDoc,
  incoming: Partial<PromotionRequestDoc>,
  currentTimeMs: number
): RuleResult {
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
export function processPromotionRefundTrigger(
  before: Partial<PromotionRequestDoc>,
  after: Partial<PromotionRequestDoc>,
  adminUids: string[]
) {
  const wasPending = before.refundRequested === true && before.refundStatus === 'PENDING';
  const isPending = after.refundRequested === true && after.refundStatus === 'PENDING';

  if (wasPending || !isPending) {
    return { triggered: false, reason: 'SUPPRESSED_NO_TRANSITION' };
  }

  const requestId = after.id || 'promo_test_123';
  const rawReceived = after.receivedAmount;
  const parsed =
    typeof rawReceived === 'number'
      ? rawReceived
      : typeof rawReceived === 'string'
      ? Number(rawReceived)
      : 0;
  const base = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
  const refundAmount = base > 0 ? Math.round(base * 0.95 * 100) / 100 : 0;
  const retentionAmount = base > 0 ? Math.round((base - refundAmount) * 100) / 100 : 0;

  const currency = (after.currency || 'PKR').toUpperCase();
  const currencySymbol =
    currency === 'USD'
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

function runTest(name: string, fn: () => void) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ [PASS] ${testsRun}. ${name}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${testsRun}. ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function runAsyncTest(name: string, fn: () => Promise<void>) {
  testsRun++;
  try {
    await fn();
    testsPassed++;
    console.log(`  ✓ [PASS] ${testsRun}. ${name}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${testsRun}. ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const baseEligibleDoc: PromotionRequestDoc = {
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

const aliceAuth: AuthContext = { uid: 'user_alice_456' };
const eveAuth: AuthContext = { uid: 'user_eve_789' };

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
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.reason, 'LEGITIMATE_REFUND_SUBMISSION');
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
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'FORBIDDEN_KEY_MUTATION_refundCalculatedAmount');
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
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'FORBIDDEN_KEY_MUTATION_refundRetentionAmount');
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
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'FORBIDDEN_KEY_MUTATION_refundPercentage');
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
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'FORBIDDEN_KEY_MUTATION_refundRetentionPercentage');
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
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'USER_ID_MISMATCH');
});

// Test 7: Expired refund deadline (>7 days) -> DENIED
runTest('Refund claim filed beyond the 7-day window is DENIED', () => {
  const expiredDoc: PromotionRequestDoc = {
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
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'REFUND_DEADLINE_EXPIRED');
});

// Test 8: Ineligible fraudulent promotion -> DENIED
runTest('Refund claim on promotion rejected for FRAUD is DENIED', () => {
  const fraudDoc: PromotionRequestDoc = {
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
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'FRAUD_OR_NON_PAYMENT_INELIGIBLE');
});

// Test 9: Cloud Function trigger state transition: Legitimate transition fires
runTest('Cloud Function fires and calculates 95% refund on valid refund transition', () => {
  const beforeState: Partial<PromotionRequestDoc> = {
    refundRequested: false,
    refundStatus: null
  };

  const afterState: Partial<PromotionRequestDoc> = {
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

  assert.strictEqual(res.triggered, true);
  assert.strictEqual(res.refundCalculatedAmount, 9500);
  assert.strictEqual(res.refundRetentionAmount, 500);
  assert.strictEqual(res.refundPercentage, 95);
  assert.strictEqual(res.refundRetentionPercentage, 5);
  assert.strictEqual(res.dispatchedNotifications?.length, 2);

  // Check notification payload contract
  const notif1 = res.dispatchedNotifications[0];
  assert.strictEqual(notif1.rootPath, '/notifications/refund_req_promo_req_999_admin_1');
  assert.strictEqual(notif1.userPath, '/users/admin_1/notifications/refund_req_promo_req_999_admin_1');
  assert.strictEqual(notif1.payload.type, 'REFUND_REQUEST');
  assert.strictEqual(notif1.payload.link, '/admin');
  assert.strictEqual(notif1.payload.read, false);
  assert.ok(notif1.payload.message.includes('Rs. 9,500'));
  assert.ok(notif1.payload.message.includes('Rs. 500'));
});

// Test 10: Multi-currency formatting: USD
runTest('Cloud Function preserves USD currency formatting', () => {
  const beforeState = { refundRequested: false };
  const afterState: Partial<PromotionRequestDoc> = {
    id: 'promo_usd_1',
    receivedAmount: 200,
    currency: 'USD',
    planName: 'Verified Badge',
    refundRequested: true,
    refundStatus: 'PENDING'
  };

  const res = processPromotionRefundTrigger(beforeState, afterState, ['admin_1']);
  assert.strictEqual(res.triggered, true);
  assert.strictEqual(res.refundCalculatedAmount, 190);
  assert.strictEqual(res.refundRetentionAmount, 10);
  assert.ok(res.dispatchedNotifications![0].payload.message.includes('$190'));
  assert.ok(res.dispatchedNotifications![0].payload.message.includes('$10'));
});

// Test 11: Idempotency & Duplicate Suppression
runTest('Subsequent updates when refund is already PENDING are SUPPRESSED', () => {
  const beforeState: Partial<PromotionRequestDoc> = {
    refundRequested: true,
    refundStatus: 'PENDING'
  };
  const afterState: Partial<PromotionRequestDoc> = {
    id: 'promo_req_999',
    refundRequested: true,
    refundStatus: 'PENDING',
    updatedAt: Date.now()
  };

  const res = processPromotionRefundTrigger(beforeState, afterState, ['admin_1']);
  assert.strictEqual(res.triggered, false);
  assert.strictEqual(res.reason, 'SUPPRESSED_NO_TRANSITION');
});

// Test 12: Deterministic notification ID format guarantees idempotency
runTest('Deterministic notification ID follows refund_req_${requestId}_${adminUid}', () => {
  const notif = processPromotionRefundTrigger(
    { refundRequested: false },
    { id: 'req_xyz_123', receivedAmount: 500, refundRequested: true, refundStatus: 'PENDING' },
    ['admin_alpha']
  ).dispatchedNotifications![0];

  assert.strictEqual(notif.payload.id, 'refund_req_req_xyz_123_admin_alpha');
  assert.strictEqual(notif.rootPath, '/notifications/refund_req_req_xyz_123_admin_alpha');
  assert.strictEqual(notif.userPath, '/users/admin_alpha/notifications/refund_req_req_xyz_123_admin_alpha');
});

// Test 13: Financial Precision Verification (Cent-exact 2-decimal rounding)
runTest('Cloud Function exactly mirrors calculateRefundAmounts 2-decimal precision', () => {
  const beforeState = { refundRequested: false };
  const afterState: Partial<PromotionRequestDoc> = {
    id: 'promo_cents_123',
    receivedAmount: 99.99,
    currency: 'USD',
    planName: 'Pro Badge',
    refundRequested: true,
    refundStatus: 'PENDING'
  };

  const res = processPromotionRefundTrigger(beforeState, afterState, ['admin_omega']);
  assert.strictEqual(res.triggered, true);
  // 99.99 * 0.95 = 94.9905 -> 94.99
  assert.strictEqual(res.refundCalculatedAmount, 94.99);
  // 99.99 - 94.99 = 5.00
  assert.strictEqual(res.refundRetentionAmount, 5.0);
  assert.strictEqual(res.refundCalculatedAmount! + res.refundRetentionAmount!, 99.99);
});

// Test 14: Broad Admin Recipient Coverage
runTest('Notification dispatch covers unified admin recipients without duplicates', () => {
  const legacyAdmins = ['admin_1', 'admin_2'];
  const superAdmins = ['admin_2', 'super_admin_imran'];
  const authorizedAdmins = ['admin_3', 'super_admin_imran'];

  const combinedAdminSet = new Set<string>([...legacyAdmins, ...superAdmins, ...authorizedAdmins]);
  const adminUids = Array.from(combinedAdminSet);

  const res = processPromotionRefundTrigger(
    { refundRequested: false },
    { id: 'req_coverage_1', receivedAmount: 1000, refundRequested: true, refundStatus: 'PENDING' },
    adminUids
  );

  assert.strictEqual(res.dispatchedNotifications?.length, 4);
  const notifiedIds = res.dispatchedNotifications!.map((n) => n.payload.userId);
  assert.deepStrictEqual(notifiedIds.sort(), ['admin_1', 'admin_2', 'admin_3', 'super_admin_imran'].sort());
});

// Test 15: Non-finite and malformed monetary inputs produce safe finite zero amounts
runTest('Non-finite, negative, zero, and malformed monetary inputs produce safe zero amounts without NaN or Infinity', () => {
  const invalidInputs = [
    { label: 'NaN', val: NaN },
    { label: 'Infinity', val: Infinity },
    { label: '-Infinity', val: -Infinity },
    { label: 'Negative (-500)', val: -500 },
    { label: 'Zero (0)', val: 0 },
    { label: 'String "Infinity"', val: 'Infinity' as any },
    { label: 'String "-Infinity"', val: '-Infinity' as any },
    { label: 'Malformed string "abc"', val: 'abc' as any },
    { label: 'Malformed string "100px"', val: '100px' as any },
    { label: 'Undefined', val: undefined },
    { label: 'Null', val: null as any }
  ];

  for (const input of invalidInputs) {
    const res = processPromotionRefundTrigger(
      { refundRequested: false },
      { id: 'req_edge', receivedAmount: input.val, refundRequested: true, refundStatus: 'PENDING' },
      ['admin_1']
    );

    assert.strictEqual(res.triggered, true);
    assert.strictEqual(Number.isFinite(res.refundCalculatedAmount), true, `${input.label} produced non-finite refundCalculatedAmount`);
    assert.strictEqual(Number.isFinite(res.refundRetentionAmount), true, `${input.label} produced non-finite refundRetentionAmount`);
    assert.strictEqual(res.refundCalculatedAmount, 0, `${input.label} did not produce 0 refund`);
    assert.strictEqual(res.refundRetentionAmount, 0, `${input.label} did not produce 0 retention`);
  }
});

// Test 16: Valid positive monetary inputs with decimals produce exact 2-decimal calculations
runTest('Valid finite numbers with various decimal precision produce safe 2-decimal amounts', () => {
  const testAmounts = [
    { input: 1000, expectedRefund: 950, expectedRetention: 50 },
    { input: 99.99, expectedRefund: 94.99, expectedRetention: 5.0 },
    { input: 0.05, expectedRefund: 0.05, expectedRetention: 0 },
    { input: '499' as any, expectedRefund: 474.05, expectedRetention: 24.95 },
    { input: '899.50' as any, expectedRefund: 854.53, expectedRetention: 44.97 }
  ];

  for (const tc of testAmounts) {
    const res = processPromotionRefundTrigger(
      { refundRequested: false },
      { id: 'req_prec', receivedAmount: tc.input, refundRequested: true, refundStatus: 'PENDING' },
      ['admin_1']
    );

    assert.strictEqual(res.triggered, true);
    assert.strictEqual(res.refundCalculatedAmount, tc.expectedRefund, `Precision mismatch on refund for ${tc.input}`);
    assert.strictEqual(res.refundRetentionAmount, tc.expectedRetention, `Precision mismatch on retention for ${tc.input}`);
    assert.strictEqual(Number.isFinite(res.refundCalculatedAmount), true);
    assert.strictEqual(Number.isFinite(res.refundRetentionAmount), true);
  }
});

// Test 17: Concurrent execution simulation - atomic create prevents overwriting isRead and createdAt
// Note: This is a deterministic unit simulation of Firestore's docRef.create() (precondition: exists == false).
// Genuine Firestore server-side concurrent execution requires the live Firestore service or emulator.
runTest('Concurrent executions racing to create notifications do not overwrite existing isRead or createdAt', () => {
  const adminUid = 'admin_super';
  const requestId = 'promo_race_123';
  const notifId = `refund_req_${requestId}_${adminUid}`;

  // Simulated in-memory store for root and user notifications
  const store: Record<string, { data: any; createdAt: number }> = {};

  const simulateAtomicCreate = (path: string, payload: any, currentTime: number) => {
    if (store[path]) {
      const err: any = new Error(`6 ALREADY_EXISTS: Document already exists at ${path}`);
      err.code = 6;
      throw err;
    }
    store[path] = { data: { ...payload }, createdAt: currentTime };
  };

  // Execution A starts at t=100
  const payloadA = {
    id: notifId,
    userId: adminUid,
    type: 'REFUND_REQUEST',
    title: '💸 User Refund Request Submitted',
    isRead: false,
    read: false
  };

  // Execution A writes root and nested documents
  simulateAtomicCreate(`notifications/${notifId}`, payloadA, 100);
  simulateAtomicCreate(`users/${adminUid}/notifications/${notifId}`, payloadA, 100);

  assert.strictEqual(store[`notifications/${notifId}`].createdAt, 100);
  assert.strictEqual(store[`users/${adminUid}/notifications/${notifId}`].createdAt, 100);

  // Admin marks notification as READ at t=150
  store[`notifications/${notifId}`].data.isRead = true;
  store[`notifications/${notifId}`].data.read = true;
  store[`users/${adminUid}/notifications/${notifId}`].data.isRead = true;
  store[`users/${adminUid}/notifications/${notifId}`].data.read = true;

  // Competing Execution B arrives at t=200 and attempts to write same notifications
  const payloadB = {
    id: notifId,
    userId: adminUid,
    type: 'REFUND_REQUEST',
    title: '💸 User Refund Request Submitted',
    isRead: false,
    read: false
  };

  let executionBSuppressedRoot = false;
  let executionBSuppressedNested = false;

  try {
    simulateAtomicCreate(`notifications/${notifId}`, payloadB, 200);
  } catch (err: any) {
    if (err.code === 6 || err.message.includes('ALREADY_EXISTS')) {
      executionBSuppressedRoot = true; // Safely handled
    } else {
      throw err;
    }
  }

  try {
    simulateAtomicCreate(`users/${adminUid}/notifications/${notifId}`, payloadB, 200);
  } catch (err: any) {
    if (err.code === 6 || err.message.includes('ALREADY_EXISTS')) {
      executionBSuppressedNested = true; // Safely handled
    } else {
      throw err;
    }
  }

  assert.strictEqual(executionBSuppressedRoot, true, 'Root write must be safely suppressed when document exists');
  assert.strictEqual(executionBSuppressedNested, true, 'Nested write must be safely suppressed when document exists');

  // Verify invariants: isRead remains true, createdAt remains t=100
  assert.strictEqual(store[`notifications/${notifId}`].data.isRead, true, 'isRead must not be reset to false');
  assert.strictEqual(store[`notifications/${notifId}`].createdAt, 100, 'createdAt must not be overwritten by t=200');
  assert.strictEqual(store[`users/${adminUid}/notifications/${notifId}`].data.isRead, true, 'nested isRead must not be reset to false');
  assert.strictEqual(store[`users/${adminUid}/notifications/${notifId}`].createdAt, 100, 'nested createdAt must not be overwritten');
});

// =========================================================================
// PHASE 2D.11 PRODUCTION HANDLER TESTS (EXERCISING REAL PRODUCTION LOGIC)
// =========================================================================

interface MockDbStore {
  users: Record<string, any>;
  authorizedAdmins: Record<string, any>;
  rootNotifications: Record<string, { data: any; createdAt: number }>;
  userNotifications: Record<string, Record<string, { data: any; createdAt: number }>>;
  promotionRequests: Record<string, any>;
  updateCalls: { requestId: string; fields: any }[];
  failRootCreateFor?: (notifId: string) => Error | null;
  failUserCreateFor?: (adminUid: string, notifId: string) => Error | null;
  failPromoUpdateFor?: (requestId: string) => Error | null;
  failUsersQueryFor?: (field: string) => Error | null;
  failAuthAdminsGet?: () => Error | null;
  failEmailLookupFor?: (email: string) => Error | null;
}

function createMockFirestore(initialState?: Partial<MockDbStore>) {
  const store: MockDbStore = {
    users: initialState?.users || {},
    authorizedAdmins: initialState?.authorizedAdmins || {},
    rootNotifications: initialState?.rootNotifications || {},
    userNotifications: initialState?.userNotifications || {},
    promotionRequests: initialState?.promotionRequests || {},
    updateCalls: [],
    failRootCreateFor: initialState?.failRootCreateFor,
    failUserCreateFor: initialState?.failUserCreateFor,
    failPromoUpdateFor: initialState?.failPromoUpdateFor,
    failUsersQueryFor: initialState?.failUsersQueryFor,
    failAuthAdminsGet: initialState?.failAuthAdminsGet,
    failEmailLookupFor: initialState?.failEmailLookupFor
  };

  const db: any = {
    collection: (colName: string) => {
      if (colName === 'users') {
        return {
          where: (field: string, _op: string, val: any) => ({
            get: async () => {
              if (store.failUsersQueryFor) {
                const err = store.failUsersQueryFor(field);
                if (err) throw err;
              }
              const matched = Object.entries(store.users).filter(([_id, u]) => u[field] === val);
              return {
                empty: matched.length === 0,
                docs: matched.map(([id, u]) => ({ id, data: () => ({ ...u }) }))
              };
            },
            limit: (num: number) => ({
              get: async () => {
                if (field === 'email' && store.failEmailLookupFor) {
                  const err = store.failEmailLookupFor(val);
                  if (err) throw err;
                }
                if (store.failUsersQueryFor) {
                  const err = store.failUsersQueryFor(field);
                  if (err) throw err;
                }
                const matched = Object.entries(store.users)
                  .filter(([_id, u]) => u[field] === val)
                  .slice(0, num);
                return {
                  empty: matched.length === 0,
                  docs: matched.map(([id, u]) => ({ id, data: () => ({ ...u }) }))
                };
              }
            })
          }),
          doc: (uid: string) => ({
            collection: (subCol: string) => {
              if (subCol === 'notifications') {
                return {
                  doc: (notifId: string) => ({
                    create: async (payload: any) => {
                      if (store.failUserCreateFor) {
                        const err = store.failUserCreateFor(uid, notifId);
                        if (err) throw err;
                      }
                      if (!store.userNotifications[uid]) {
                        store.userNotifications[uid] = {};
                      }
                      if (store.userNotifications[uid][notifId]) {
                        const err: any = new Error(`6 ALREADY_EXISTS: Document already exists at users/${uid}/notifications/${notifId}`);
                        err.code = 6;
                        assert.strictEqual(isAlreadyExistsError(err), true);
                        throw err;
                      }
                      store.userNotifications[uid][notifId] = {
                        data: { ...payload },
                        createdAt: Date.now()
                      };
                    },
                    get: async () => {
                      const existing = store.userNotifications[uid]?.[notifId];
                      return {
                        exists: Boolean(existing),
                        data: () => (existing ? { ...existing.data } : undefined)
                      };
                    }
                  })
                };
              }
              throw new Error(`Unsupported subcollection: ${subCol}`);
            }
          })
        };
      }

      if (colName === 'notifications') {
        return {
          doc: (notifId: string) => ({
            create: async (payload: any) => {
              if (store.failRootCreateFor) {
                const err = store.failRootCreateFor(notifId);
                if (err) throw err;
              }
              if (store.rootNotifications[notifId]) {
                const err: any = new Error(`6 ALREADY_EXISTS: Document already exists at notifications/${notifId}`);
                err.code = 6;
                throw err;
              }
              store.rootNotifications[notifId] = {
                data: { ...payload },
                createdAt: Date.now()
              };
            },
            get: async () => {
              const existing = store.rootNotifications[notifId];
              return {
                exists: Boolean(existing),
                data: () => (existing ? { ...existing.data } : undefined)
              };
            }
          })
        };
      }

      if (colName === 'authorizedAdmins') {
        return {
          get: async () => {
            if (store.failAuthAdminsGet) {
              const err = store.failAuthAdminsGet();
              if (err) throw err;
            }
            const entries = Object.entries(store.authorizedAdmins);
            return {
              empty: entries.length === 0,
              docs: entries.map(([id, data]) => ({ id, data: () => ({ ...data }) }))
            };
          }
        };
      }

      if (colName === 'promotionRequests') {
        return {
          doc: (requestId: string) => ({
            update: async (fields: any) => {
              if (store.failPromoUpdateFor) {
                const err = store.failPromoUpdateFor(requestId);
                if (err) throw err;
              }
              store.updateCalls.push({ requestId, fields });
              store.promotionRequests[requestId] = {
                ...(store.promotionRequests[requestId] || {}),
                ...fields
              };
            }
          })
        };
      }

      throw new Error(`Unsupported collection: ${colName}`);
    }
  };

  return { db, store };
}

function createRefundEvent(requestId: string, receivedAmount: any, currency = 'USD') {
  return {
    params: { requestId },
    data: {
      before: {
        data: () => ({
          refundRequested: false,
          refundStatus: null
        })
      },
      after: {
        data: () => ({
          id: requestId,
          receivedAmount,
          currency,
          planName: 'Pro Tier',
          refundRequested: true,
          refundStatus: 'PENDING',
          refundProofImages: ['https://example.com/proof1.png']
        })
      }
    }
  };
}

async function runAllPhase2D11Tests() {
  // Test 18: Partial notification failure (transient error on one write; others attempted; handler rejects; financial update skipped)
  await runAsyncTest('Production Handler Test 18: Partial notification failure propagates, others attempted, financial update skipped', async () => {
    const { db, store } = createMockFirestore({
      users: {
        admin_alpha: { isAdmin: true },
        admin_beta: { isSuperAdmin: true }
      },
      promotionRequests: {
        req_partial_1: { receivedAmount: 1000 }
      },
      failUserCreateFor: (adminUid, _notifId) => {
        if (adminUid === 'admin_alpha') {
          const err: any = new Error('14 UNAVAILABLE: Transient backend timeout');
          err.code = 14;
          return err;
        }
        return null;
      }
    });

    const event = createRefundEvent('req_partial_1', 1000);

    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Handler must reject when a required notification fails');
    assert.ok(caughtError.message.includes('Failed 1 required notification write(s)'));
    assert.ok(caughtError.message.includes('Transient backend timeout'));

    // Root notifications must both have been attempted and succeeded
    assert.ok(store.rootNotifications['refund_req_req_partial_1_admin_alpha'] !== undefined, 'Admin alpha root write must have succeeded');
    assert.ok(store.rootNotifications['refund_req_req_partial_1_admin_beta'] !== undefined, 'Admin beta root write must have succeeded');

    // Admin beta nested notification succeeded
    assert.ok(store.userNotifications['admin_beta']?.['refund_req_req_partial_1_admin_beta'] !== undefined, 'Admin beta nested write must have succeeded');

    // Admin alpha nested notification failed
    assert.strictEqual(store.userNotifications['admin_alpha']?.['refund_req_req_partial_1_admin_alpha'], undefined, 'Admin alpha nested write must be missing');

    // Authoritative financial update must NOT have been called
    assert.strictEqual(store.updateCalls.length, 0, 'Financial update must not execute when a notification write fails');
    assert.strictEqual(store.promotionRequests['req_partial_1'].refundCalculatedAmount, undefined);
  });

  // Test 19: Recovery on a subsequent invocation (missing notifications created, existing preserved, financial update succeeds)
  await runAsyncTest('Production Handler Test 19: Recovery on retry creates missing notifications, preserves existing, commits financials', async () => {
    // Set up state matching post-failure from Test 18
    const { db, store } = createMockFirestore({
      users: {
        admin_alpha: { isAdmin: true },
        admin_beta: { isSuperAdmin: true }
      },
      promotionRequests: {
        req_retry_1: { receivedAmount: 1000 }
      },
      rootNotifications: {
        refund_req_req_retry_1_admin_alpha: {
          data: {
            id: 'refund_req_req_retry_1_admin_alpha',
            userId: 'admin_alpha',
            type: 'REFUND_REQUEST',
            requestId: 'req_retry_1',
            relatedId: 'req_retry_1',
            isRead: false,
            read: false
          },
          createdAt: 100
        },
        refund_req_req_retry_1_admin_beta: {
          data: {
            id: 'refund_req_req_retry_1_admin_beta',
            userId: 'admin_beta',
            type: 'REFUND_REQUEST',
            requestId: 'req_retry_1',
            relatedId: 'req_retry_1',
            isRead: true, // Marked as read by Beta admin before retry
            read: true
          },
          createdAt: 100
        }
      },
      userNotifications: {
        admin_beta: {
          refund_req_req_retry_1_admin_beta: {
            data: {
              id: 'refund_req_req_retry_1_admin_beta',
              userId: 'admin_beta',
              type: 'REFUND_REQUEST',
              requestId: 'req_retry_1',
              relatedId: 'req_retry_1',
              isRead: true, // Marked as read
              read: true
            },
            createdAt: 100
          }
        }
      }
    });

    const event = createRefundEvent('req_retry_1', 1000);

    // Invoke retry (no failure simulator configured)
    const result = await handlePromotionRefundRequestedEvent(event, db);
    assert.strictEqual(result.triggered, true);
    assert.strictEqual(result.adminCount, 2);
    assert.strictEqual(result.refundAmount, 950);
    assert.strictEqual(result.retentionAmount, 50);

    // Missing nested notification for admin_alpha is now created
    assert.ok(store.userNotifications['admin_alpha']?.['refund_req_req_retry_1_admin_alpha'] !== undefined, 'Admin alpha nested notification must be created on retry');

    // Existing documents preserved with original isRead: true and createdAt: 100
    assert.strictEqual(store.rootNotifications['refund_req_req_retry_1_admin_beta'].data.isRead, true);
    assert.strictEqual(store.rootNotifications['refund_req_req_retry_1_admin_beta'].createdAt, 100);
    assert.strictEqual(store.userNotifications['admin_beta']['refund_req_req_retry_1_admin_beta'].data.isRead, true);
    assert.strictEqual(store.userNotifications['admin_beta']['refund_req_req_retry_1_admin_beta'].createdAt, 100);

    // Financial update executed
    assert.strictEqual(store.updateCalls.length, 1);
    assert.strictEqual(store.promotionRequests['req_retry_1'].refundCalculatedAmount, 950);
    assert.strictEqual(store.promotionRequests['req_retry_1'].refundRetentionAmount, 50);
  });

  // Test 20: All expected duplicates (all notifications exist; handler succeeds idempotently)
  await runAsyncTest('Production Handler Test 20: All expected duplicates verified cleanly without overwriting', async () => {
    const notifId = 'refund_req_req_dup_admin_omega';
    const { db, store } = createMockFirestore({
      users: { admin_omega: { isAdmin: true } },
      promotionRequests: { req_dup: { receivedAmount: 2000 } },
      rootNotifications: {
        [notifId]: {
          data: {
            id: notifId,
            userId: 'admin_omega',
            type: 'REFUND_REQUEST',
            requestId: 'req_dup',
            relatedId: 'req_dup',
            isRead: true,
            read: true
          },
          createdAt: 250
        }
      },
      userNotifications: {
        admin_omega: {
          [notifId]: {
            data: {
              id: notifId,
              userId: 'admin_omega',
              type: 'REFUND_REQUEST',
              requestId: 'req_dup',
              relatedId: 'req_dup',
              isRead: true,
              read: true
            },
            createdAt: 250
          }
        }
      }
    });

    const event = createRefundEvent('req_dup', 2000);
    const result = await handlePromotionRefundRequestedEvent(event, db);
    assert.strictEqual(result.triggered, true);
    assert.strictEqual(result.refundAmount, 1900);
    assert.strictEqual(result.retentionAmount, 100);

    // Still preserved
    assert.strictEqual(store.rootNotifications[notifId].data.isRead, true);
    assert.strictEqual(store.rootNotifications[notifId].createdAt, 250);
    assert.strictEqual(store.userNotifications['admin_omega'][notifId].data.isRead, true);
    assert.strictEqual(store.userNotifications['admin_omega'][notifId].createdAt, 250);

    assert.strictEqual(store.promotionRequests['req_dup'].refundCalculatedAmount, 1900);
  });

  // Test 21: Financial update failure propagates and subsequent invocation is idempotent
  await runAsyncTest('Production Handler Test 21: Financial update failure propagates and retry commits idempotently', async () => {
    const { db, store } = createMockFirestore({
      users: { admin_gamma: { isAdmin: true } },
      promotionRequests: { req_update_fail: { receivedAmount: 500 } },
      failPromoUpdateFor: (_requestId) => new Error('14 UNAVAILABLE: Firestore write timeout on update')
    });

    const event = createRefundEvent('req_update_fail', 500);

    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null);
    assert.ok(caughtError.message.includes('Firestore write timeout on update'));

    // Notifications were created before the financial update failed
    const notifId = 'refund_req_req_update_fail_admin_gamma';
    assert.ok(store.rootNotifications[notifId] !== undefined);
    assert.ok(store.userNotifications['admin_gamma']?.[notifId] !== undefined);

    // Clear failure and retry
    store.failPromoUpdateFor = undefined;
    const result = await handlePromotionRefundRequestedEvent(event, db);
    assert.strictEqual(result.triggered, true);
    assert.strictEqual(store.promotionRequests['req_update_fail'].refundCalculatedAmount, 475);
    assert.strictEqual(store.promotionRequests['req_update_fail'].refundRetentionAmount, 25);
  });

  // Test 22: Existing notification integrity (isRead, read, createdAt, and custom fields remain untouched)
  await runAsyncTest('Production Handler Test 22: Existing notification fields remain untouched across repeated invocations', async () => {
    const notifId = 'refund_req_req_integ_admin_zeta';
    const { db, store } = createMockFirestore({
      users: { admin_zeta: { isAdmin: true } },
      promotionRequests: { req_integ: { receivedAmount: 300 } },
      rootNotifications: {
        [notifId]: {
          data: {
            id: notifId,
            userId: 'admin_zeta',
            type: 'REFUND_REQUEST',
            requestId: 'req_integ',
            relatedId: 'req_integ',
            isRead: true,
            read: true,
            customAdminNote: 'Reviewed by admin Zeta'
          },
          createdAt: 777
        }
      },
      userNotifications: {
        admin_zeta: {
          [notifId]: {
            data: {
              id: notifId,
              userId: 'admin_zeta',
              type: 'REFUND_REQUEST',
              requestId: 'req_integ',
              relatedId: 'req_integ',
              isRead: true,
              read: true,
              customAdminNote: 'Reviewed in nested subcollection'
            },
            createdAt: 777
          }
        }
      }
    });

    const event = createRefundEvent('req_integ', 300);
    const result = await handlePromotionRefundRequestedEvent(event, db);
    assert.strictEqual(result.triggered, true);

    assert.strictEqual(store.rootNotifications[notifId].data.isRead, true);
    assert.strictEqual(store.rootNotifications[notifId].data.read, true);
    assert.strictEqual(store.rootNotifications[notifId].data.customAdminNote, 'Reviewed by admin Zeta');
    assert.strictEqual(store.rootNotifications[notifId].createdAt, 777);

    assert.strictEqual(store.userNotifications['admin_zeta'][notifId].data.isRead, true);
    assert.strictEqual(store.userNotifications['admin_zeta'][notifId].data.read, true);
    assert.strictEqual(store.userNotifications['admin_zeta'][notifId].data.customAdminNote, 'Reviewed in nested subcollection');
    assert.strictEqual(store.userNotifications['admin_zeta'][notifId].createdAt, 777);
  });

  // Test 23: Multiple administrators (failure on one admin does not prevent attempts for others)
  await runAsyncTest('Production Handler Test 23: Multi-admin dispatch attempts all recipients despite failure on one', async () => {
    const { db, store } = createMockFirestore({
      users: {
        admin_1: { isAdmin: true },
        admin_2: { isSuperAdmin: true },
        admin_3: { isAuthorizedAdmin: true }
      },
      promotionRequests: { req_multi: { receivedAmount: 100 } },
      // Root write fails only for admin_2
      failRootCreateFor: (notifId) => {
        if (notifId.includes('admin_2')) {
          return new Error('Root write failure for admin_2');
        }
        return null;
      }
    });

    const event = createRefundEvent('req_multi', 100);
    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null);
    // Writes for admin_1 and admin_3 must have been attempted and succeeded
    assert.ok(store.rootNotifications['refund_req_req_multi_admin_1'] !== undefined);
    assert.ok(store.userNotifications['admin_1']?.['refund_req_req_multi_admin_1'] !== undefined);

    assert.ok(store.rootNotifications['refund_req_req_multi_admin_3'] !== undefined);
    assert.ok(store.userNotifications['admin_3']?.['refund_req_req_multi_admin_3'] !== undefined);

    // Admin 2 root failed
    assert.strictEqual(store.rootNotifications['refund_req_req_multi_admin_2'], undefined);
    // Financial update must not have run
    assert.strictEqual(store.updateCalls.length, 0);
  });

  // Test 24: Unexpected ALREADY_EXISTS collision is rejected and not silently accepted
  await runAsyncTest('Production Handler Test 24: Unexpected collision on deterministic ID is detected and rejected', async () => {
    const notifId = 'refund_req_req_collision_admin_col';
    const { db, store } = createMockFirestore({
      users: { admin_col: { isAdmin: true } },
      // Pre-populate with completely unrelated notification payload
      rootNotifications: {
        [notifId]: {
          data: {
            id: notifId,
            type: 'ORDER_DISPUTE', // Not REFUND_REQUEST!
            requestId: 'unrelated_other_req',
            userId: 'unrelated_user'
          },
          createdAt: 500
        }
      },
      promotionRequests: { req_collision: { receivedAmount: 500 } }
    });

    const event = createRefundEvent('req_collision', 500);
    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Must reject unexpected collision');
    assert.ok(caughtError.message.includes('Unexpected collision on root notification document'));
    assert.strictEqual(store.updateCalls.length, 0, 'Financial update must not run when identity collision occurs');
  });

  // =========================================================================
  // PHASE 2D.16 TARGETED REMEDIATION TESTS
  // =========================================================================

  // Direct Unit Tests for isExpectedRefundNotificationIdentity Helper
  runTest('Helper Test 25: isExpectedRefundNotificationIdentity accepts when both requestId and relatedId match', () => {
    const validDoc = {
      type: 'REFUND_REQUEST',
      userId: 'admin_test_1',
      requestId: 'req_match_100',
      relatedId: 'req_match_100'
    };
    assert.strictEqual(isExpectedRefundNotificationIdentity(validDoc, 'req_match_100', 'admin_test_1'), true);
  });

  runTest('Helper Test 26: isExpectedRefundNotificationIdentity accepts legacy document with requestId only', () => {
    const legacyDoc = {
      type: 'REFUND_REQUEST',
      userId: 'admin_test_1',
      requestId: 'req_match_100'
    };
    assert.strictEqual(isExpectedRefundNotificationIdentity(legacyDoc, 'req_match_100', 'admin_test_1'), true);
  });

  runTest('Helper Test 27: isExpectedRefundNotificationIdentity accepts legacy document with relatedId only', () => {
    const legacyDoc = {
      type: 'REFUND_REQUEST',
      userId: 'admin_test_1',
      relatedId: 'req_match_100'
    };
    assert.strictEqual(isExpectedRefundNotificationIdentity(legacyDoc, 'req_match_100', 'admin_test_1'), true);
  });

  runTest('Helper Test 28: isExpectedRefundNotificationIdentity rejects conflicting requestId and relatedId', () => {
    const conflictingDoc = {
      type: 'REFUND_REQUEST',
      userId: 'admin_test_1',
      requestId: 'req_match_100',
      relatedId: 'req_conflict_999'
    };
    assert.strictEqual(isExpectedRefundNotificationIdentity(conflictingDoc, 'req_match_100', 'admin_test_1'), false);
  });

  runTest('Helper Test 29: isExpectedRefundNotificationIdentity rejects document with neither identity field', () => {
    const emptyIdentityDoc = {
      type: 'REFUND_REQUEST',
      userId: 'admin_test_1'
    };
    assert.strictEqual(isExpectedRefundNotificationIdentity(emptyIdentityDoc, 'req_match_100', 'admin_test_1'), false);
  });

  runTest('Helper Test 30: isExpectedRefundNotificationIdentity rejects malformed identity values', () => {
    assert.strictEqual(isExpectedRefundNotificationIdentity({ type: 'REFUND_REQUEST', userId: 'admin_1', requestId: '' }, 'req_1', 'admin_1'), false);
    assert.strictEqual(isExpectedRefundNotificationIdentity({ type: 'REFUND_REQUEST', userId: 'admin_1', requestId: '   ' }, 'req_1', 'admin_1'), false);
    assert.strictEqual(isExpectedRefundNotificationIdentity({ type: 'REFUND_REQUEST', userId: 'admin_1', requestId: 12345 }, 'req_1', 'admin_1'), false);
    assert.strictEqual(isExpectedRefundNotificationIdentity({ type: 'REFUND_REQUEST', userId: 'admin_1', requestId: null }, 'req_1', 'admin_1'), false);
    assert.strictEqual(isExpectedRefundNotificationIdentity({ type: 'REFUND_REQUEST', userId: 'admin_1', relatedId: '' }, 'req_1', 'admin_1'), false);
    assert.strictEqual(isExpectedRefundNotificationIdentity({ type: 'REFUND_REQUEST', userId: 'admin_1', relatedId: '   ' }, 'req_1', 'admin_1'), false);
    assert.strictEqual(isExpectedRefundNotificationIdentity({ type: 'REFUND_REQUEST', userId: 'admin_1', relatedId: { id: 'req_1' } }, 'req_1', 'admin_1'), false);
  });

  runTest('Helper Test 31: isExpectedRefundNotificationIdentity rejects matching field paired with malformed other field', () => {
    assert.strictEqual(isExpectedRefundNotificationIdentity({
      type: 'REFUND_REQUEST',
      userId: 'admin_1',
      requestId: 'req_1',
      relatedId: ''
    }, 'req_1', 'admin_1'), false);

    assert.strictEqual(isExpectedRefundNotificationIdentity({
      type: 'REFUND_REQUEST',
      userId: 'admin_1',
      requestId: 'req_1',
      relatedId: '   '
    }, 'req_1', 'admin_1'), false);

    assert.strictEqual(isExpectedRefundNotificationIdentity({
      type: 'REFUND_REQUEST',
      userId: 'admin_1',
      requestId: 'req_1',
      relatedId: 999
    }, 'req_1', 'admin_1'), false);
  });

  runTest('Helper Test 32: isExpectedRefundNotificationIdentity rejects wrong type or wrong userId', () => {
    assert.strictEqual(isExpectedRefundNotificationIdentity({
      type: 'OTHER_TYPE',
      userId: 'admin_1',
      requestId: 'req_1'
    }, 'req_1', 'admin_1'), false);

    assert.strictEqual(isExpectedRefundNotificationIdentity({
      type: 'REFUND_REQUEST',
      userId: 'wrong_admin',
      requestId: 'req_1'
    }, 'req_1', 'admin_1'), false);
  });

  // Production Handler Integration Tests
  await runAsyncTest('Production Handler Test 33: Zero administrators fails closed without financial update', async () => {
    const { db, store } = createMockFirestore({
      users: {},
      authorizedAdmins: {},
      promotionRequests: { req_zero_admin: { receivedAmount: 1000 } }
    });

    const event = createRefundEvent('req_zero_admin', 1000);
    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Handler must fail closed when zero administrators exist');
    assert.ok(caughtError.message.includes('No admin users found'));
    assert.strictEqual(store.updateCalls.length, 0, 'Authoritative financial update must not occur when 0 admins found');
    assert.strictEqual(store.promotionRequests['req_zero_admin'].refundCalculatedAmount, undefined);
  });

  await runAsyncTest('Production Handler Test 34: Primary administrator query failure propagates without financial update', async () => {
    const { db, store } = createMockFirestore({
      users: { admin_1: { isAdmin: true } },
      promotionRequests: { req_prim_fail: { receivedAmount: 1000 } },
      failUsersQueryFor: (field) => {
        if (field === 'isAdmin') {
          return new Error('14 UNAVAILABLE: users.where(isAdmin) timeout');
        }
        return null;
      }
    });

    const event = createRefundEvent('req_prim_fail', 1000);
    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Primary query failure must propagate');
    assert.ok(caughtError.message.includes('users.where(isAdmin) timeout'));
    assert.strictEqual(store.updateCalls.length, 0, 'Financial update must not occur on primary query failure');
  });

  await runAsyncTest('Production Handler Test 35: Auxiliary authorizedAdmins query failure propagates without financial update', async () => {
    const { db, store } = createMockFirestore({
      users: { admin_1: { isAdmin: true } },
      authorizedAdmins: { 'admin@test.com': {} },
      promotionRequests: { req_aux_fail: { receivedAmount: 1000 } },
      failAuthAdminsGet: () => new Error('14 UNAVAILABLE: authorizedAdmins.get() timeout')
    });

    const event = createRefundEvent('req_aux_fail', 1000);
    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Auxiliary authorizedAdmins query failure must propagate');
    assert.ok(caughtError.message.includes('authorizedAdmins.get() timeout'));
    assert.strictEqual(store.updateCalls.length, 0, 'Financial update must not occur on auxiliary query failure');
  });

  await runAsyncTest('Production Handler Test 36: Required secondary email lookup failure propagates without financial update', async () => {
    const { db, store } = createMockFirestore({
      users: { admin_user_sec: { email: 'sec@test.com' } },
      authorizedAdmins: { 'sec@test.com': {} },
      promotionRequests: { req_sec_fail: { receivedAmount: 1000 } },
      failEmailLookupFor: (email) => {
        if (email === 'sec@test.com') {
          return new Error('14 UNAVAILABLE: Email lookup failed for sec@test.com');
        }
        return null;
      }
    });

    const event = createRefundEvent('req_sec_fail', 1000);
    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Secondary email lookup failure must propagate');
    assert.ok(caughtError.message.includes('Email lookup failed for sec@test.com'));
    assert.strictEqual(store.updateCalls.length, 0, 'Financial update must not occur on secondary lookup failure');
  });

  await runAsyncTest('Production Handler Test 37: Multi-source admin aggregation combines all sources, deduplicates, and dispatches', async () => {
    const { db, store } = createMockFirestore({
      users: {
        admin_multi_1: { isAdmin: true, email: 'adm1@test.com' },
        admin_multi_2: { isSuperAdmin: true, email: 'adm2@test.com' },
        admin_multi_3: { isAuthorizedAdmin: true, email: 'adm3@test.com' },
        admin_multi_4: { email: 'auth_only@test.com' } // Authorized solely through authorizedAdmins collection
      },
      authorizedAdmins: {
        'adm1@test.com': {}, // Duplicate UID of admin_multi_1
        'auth_only@test.com': {}
      },
      promotionRequests: { req_multi_agg: { receivedAmount: 1000 } }
    });

    const event = createRefundEvent('req_multi_agg', 1000);
    const result = await handlePromotionRefundRequestedEvent(event, db);

    assert.strictEqual(result.triggered, true);
    // Deduplicated count must be 4 (admin_multi_1, admin_multi_2, admin_multi_3, admin_multi_4)
    assert.strictEqual(result.adminCount, 4);

    // Verify all 4 received root and nested notifications
    for (const uid of ['admin_multi_1', 'admin_multi_2', 'admin_multi_3', 'admin_multi_4']) {
      const expectedId = `refund_req_req_multi_agg_${uid}`;
      assert.ok(store.rootNotifications[expectedId] !== undefined, `Root notif missing for ${uid}`);
      assert.ok(store.userNotifications[uid]?.[expectedId] !== undefined, `Nested notif missing for ${uid}`);
    }

    // Financial update executed
    assert.strictEqual(store.updateCalls.length, 1);
    assert.strictEqual(store.promotionRequests['req_multi_agg'].refundCalculatedAmount, 950);
  });

  await runAsyncTest('Production Handler Test 38: Accepts legacy requestId-only duplicate and does not overwrite', async () => {
    const notifId = 'refund_req_req_leg_req_admin_leg1';
    const { db, store } = createMockFirestore({
      users: { admin_leg1: { isAdmin: true } },
      promotionRequests: { req_leg_req: { receivedAmount: 1000 } },
      rootNotifications: {
        [notifId]: {
          data: {
            id: notifId,
            type: 'REFUND_REQUEST',
            userId: 'admin_leg1',
            requestId: 'req_leg_req',
            // relatedId genuinely absent!
            isRead: true,
            read: true
          },
          createdAt: 888
        }
      },
      userNotifications: {
        admin_leg1: {
          [notifId]: {
            data: {
              id: notifId,
              type: 'REFUND_REQUEST',
              userId: 'admin_leg1',
              requestId: 'req_leg_req',
              // relatedId genuinely absent!
              isRead: true,
              read: true
            },
            createdAt: 888
          }
        }
      }
    });

    const event = createRefundEvent('req_leg_req', 1000);
    const result = await handlePromotionRefundRequestedEvent(event, db);
    assert.strictEqual(result.triggered, true);

    // Existing fields preserved
    assert.strictEqual(store.rootNotifications[notifId].data.isRead, true);
    assert.strictEqual(store.rootNotifications[notifId].createdAt, 888);
    assert.strictEqual(store.userNotifications['admin_leg1'][notifId].data.isRead, true);
    assert.strictEqual(store.updateCalls.length, 1);
  });

  await runAsyncTest('Production Handler Test 39: Accepts legacy relatedId-only duplicate and does not overwrite', async () => {
    const notifId = 'refund_req_req_leg_rel_admin_leg2';
    const { db, store } = createMockFirestore({
      users: { admin_leg2: { isAdmin: true } },
      promotionRequests: { req_leg_rel: { receivedAmount: 1000 } },
      rootNotifications: {
        [notifId]: {
          data: {
            id: notifId,
            type: 'REFUND_REQUEST',
            userId: 'admin_leg2',
            relatedId: 'req_leg_rel',
            // requestId genuinely absent!
            isRead: true,
            read: true
          },
          createdAt: 999
        }
      },
      userNotifications: {
        admin_leg2: {
          [notifId]: {
            data: {
              id: notifId,
              type: 'REFUND_REQUEST',
              userId: 'admin_leg2',
              relatedId: 'req_leg_rel',
              // requestId genuinely absent!
              isRead: true,
              read: true
            },
            createdAt: 999
          }
        }
      }
    });

    const event = createRefundEvent('req_leg_rel', 1000);
    const result = await handlePromotionRefundRequestedEvent(event, db);
    assert.strictEqual(result.triggered, true);

    // Existing fields preserved
    assert.strictEqual(store.rootNotifications[notifId].data.isRead, true);
    assert.strictEqual(store.rootNotifications[notifId].createdAt, 999);
    assert.strictEqual(store.userNotifications['admin_leg2'][notifId].data.isRead, true);
    assert.strictEqual(store.updateCalls.length, 1);
  });

  await runAsyncTest('Production Handler Test 40: Rejects conflicting identity fields on duplicate and blocks financial update', async () => {
    const notifId = 'refund_req_req_conf_admin_cf';
    const { db, store } = createMockFirestore({
      users: { admin_cf: { isAdmin: true } },
      promotionRequests: { req_conf: { receivedAmount: 1000 } },
      rootNotifications: {
        [notifId]: {
          data: {
            id: notifId,
            type: 'REFUND_REQUEST',
            userId: 'admin_cf',
            requestId: 'req_conf',
            relatedId: 'req_COMPLETELY_DIFFERENT' // Conflicting identity field!
          },
          createdAt: 123
        }
      }
    });

    const event = createRefundEvent('req_conf', 1000);
    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Must reject conflicting identity fields');
    assert.ok(caughtError.message.includes('Unexpected collision on root notification document'));
    assert.strictEqual(store.updateCalls.length, 0, 'Financial update must not occur when identity fields conflict');
  });

  await runAsyncTest('Production Handler Test 41: Rejects missing identity on duplicate and blocks financial update', async () => {
    const notifId = 'refund_req_req_noid_admin_ni';
    const { db, store } = createMockFirestore({
      users: { admin_ni: { isAdmin: true } },
      promotionRequests: { req_noid: { receivedAmount: 1000 } },
      rootNotifications: {
        [notifId]: {
          data: {
            id: notifId,
            type: 'REFUND_REQUEST',
            userId: 'admin_ni'
            // Neither requestId nor relatedId present!
          },
          createdAt: 456
        }
      }
    });

    const event = createRefundEvent('req_noid', 1000);
    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Must reject duplicate with missing identity');
    assert.ok(caughtError.message.includes('Unexpected collision on root notification document'));
    assert.strictEqual(store.updateCalls.length, 0, 'Financial update must not occur when duplicate lacks identity');
  });

  await runAsyncTest('Production Handler Test 42: Rejects malformed identity fields on duplicate and blocks financial update', async () => {
    const notifId = 'refund_req_req_mal_admin_ml';
    const { db, store } = createMockFirestore({
      users: { admin_ml: { isAdmin: true } },
      promotionRequests: { req_mal: { receivedAmount: 1000 } },
      rootNotifications: {
        [notifId]: {
          data: {
            id: notifId,
            type: 'REFUND_REQUEST',
            userId: 'admin_ml',
            requestId: 'req_mal',
            relatedId: '   ' // Malformed whitespace-only string!
          },
          createdAt: 789
        }
      }
    });

    const event = createRefundEvent('req_mal', 1000);
    let caughtError: any = null;
    try {
      await handlePromotionRefundRequestedEvent(event, db);
    } catch (err: any) {
      caughtError = err;
    }

    assert.ok(caughtError !== null, 'Must reject duplicate with malformed identity field');
    assert.ok(caughtError.message.includes('Unexpected collision on root notification document'));
    assert.strictEqual(store.updateCalls.length, 0, 'Financial update must not occur when identity is malformed');
  });

  console.log(`\nAll ${testsPassed}/${testsRun} Phase 2D tests passed successfully.\n`);
}

runAllPhase2D11Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
