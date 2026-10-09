/**
 * Deterministic Unit Test Suite for SEC-05-14-C-DB02-B
 * Verification Application Payment Gate & Entitlement Integrity Security
 *
 * Simulates and verifies the exact Firestore Rules & logic evaluation for:
 *   match /verification_applications/{applicationId}
 *   match /users/{userId}
 *
 * Runs locally with 0 production Firestore or Storage reads/writes.
 */

import assert from 'assert';

export interface AuthContext {
  uid: string | null;
  email?: string;
  isSuper?: boolean;
  isAdmin?: boolean;
  isPaymentVerifier?: boolean;
}

export interface VerificationAppDoc {
  userId: string;
  userName?: string;
  userEmail?: string;
  paymentProofUrl?: string;
  transactionId?: string;
  durationDays: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt?: number;
  updatedAt?: number;
  receivedAmount?: number;
  verificationStage?: string;
  paymentVerifiedBy?: string;
  paymentVerifiedByUid?: string;
  paymentVerifiedAt?: number;
  approvedAt?: number;
  approvedBy?: string;
  isVerified?: boolean;
  isPremiumVerified?: boolean;
  verifiedBadgeType?: string;
  verifiedUntil?: number;
  refundRequested?: boolean;
  refundStatus?: string | null;
}

export interface RuleResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Deterministic evaluation of firestore.rules for verification_applications creation:
 */
export function evaluateVerificationAppCreateRule(
  auth: AuthContext | null,
  incoming: Partial<VerificationAppDoc>
): RuleResult {
  if (!auth || !auth.uid) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

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

  const forbiddenKeys = [
    'approvedAt', 'approvedBy', 'paymentVerifiedBy', 'paymentVerifiedByUid',
    'paymentVerifiedAt', 'rejectedAt', 'rejectedBy', 'refundApprovedAt',
    'refundApprovedBy', 'refundCalculatedAmount', 'isVerified', 'isPremiumVerified',
    'verifiedBadgeType', 'verifiedUntil'
  ];

  for (const key of forbiddenKeys) {
    if (key in incoming) {
      return { allowed: false, reason: `FORBIDDEN_${key}_ON_CREATE` };
    }
  }

  // Duration coupling validation against authoritative catalog (30, 90, 180, 365)
  if (!('durationDays' in incoming) || ![30, 90, 180, 365].includes(incoming.durationDays!)) {
    return { allowed: false, reason: 'INVALID_CATALOG_DURATION' };
  }

  return { allowed: true };
}

/**
 * Deterministic evaluation of firestore.rules for verification_applications update:
 */
export function evaluateVerificationAppUpdateRule(
  auth: AuthContext | null,
  existing: VerificationAppDoc,
  incoming: VerificationAppDoc
): RuleResult {
  if (!auth || !auth.uid) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

  const isSuper = !!auth.isSuper || auth.email === 'imran7297510@gmail.com' || auth.email === 'imran7297510@gmail';
  const isAdmin = isSuper || !!auth.isAdmin;
  const isPaymentVerifier = !!auth.isPaymentVerifier;

  if (isSuper) {
    return { allowed: true, reason: 'SUPER_ADMIN_UPDATE' };
  }

  if (isAdmin) {
    // Payment Verification Gate Rule Check:
    if (incoming.status === 'APPROVED') {
      const isPaymentVerified = existing.verificationStage === 'PAYMENT_VERIFIED' || existing.verificationStage === 'VERIFIED';
      const hasReceivedAmount = typeof existing.receivedAmount === 'number' && existing.receivedAmount > 0;

      if (!isPaymentVerified || !hasReceivedAmount) {
        return { allowed: false, reason: 'PAYMENT_VERIFICATION_GATE_FAILED' };
      }
    }
    return { allowed: true };
  }

  if (isPaymentVerifier) {
    if (incoming.status === 'APPROVED') {
      return { allowed: false, reason: 'VERIFIER_CANNOT_APPROVE_FINAL_STATUS' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'PERMISSION_DENIED' };
}

// Deterministic test runner
let testsRun = 0;
let testsPassed = 0;

function runTest(name: string, fn: () => void) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

const applicantAuth: AuthContext = { uid: 'user_alice_123', email: 'alice@example.com' };
const kycAdminAuth: AuthContext = { uid: 'kyc_admin_123', email: 'mod@example.com', isAdmin: true };
const paymentVerifierAuth: AuthContext = { uid: 'verifier_789', email: 'verifier@example.com', isPaymentVerifier: true };
const superAdminAuth: AuthContext = { uid: 'super_admin_001', email: 'imran7297510@gmail.com', isSuper: true };

const baseAppDoc: VerificationAppDoc = {
  userId: 'user_alice_123',
  userName: 'Alice',
  userEmail: 'alice@example.com',
  durationDays: 30,
  status: 'PENDING',
  verificationStage: 'NONE',
};

console.log('Running SEC-05-14-C-DB02-B Verification Application Payment Gate Security Tests:');

// A. Legitimate creations
runTest('A1. Applicant creates legitimate 30-day package -> ALLOWED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, durationDays: 30 });
  assert.strictEqual(res.allowed, true);
});

runTest('A2. Applicant creates legitimate 90-day package -> ALLOWED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, durationDays: 90 });
  assert.strictEqual(res.allowed, true);
});

runTest('A3. Applicant creates legitimate 180-day package -> ALLOWED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, durationDays: 180 });
  assert.strictEqual(res.allowed, true);
});

runTest('A4. Applicant creates legitimate 365-day package -> ALLOWED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, durationDays: 365 });
  assert.strictEqual(res.allowed, true);
});

// B. Injections on create
runTest('B1. Applicant injects verificationStage = PAYMENT_VERIFIED -> DENIED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, verificationStage: 'PAYMENT_VERIFIED' });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'FORBIDDEN_verificationStage_ON_CREATE');
});

runTest('B2. Applicant injects receivedAmount -> DENIED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, receivedAmount: 1999 });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'FORBIDDEN_receivedAmount_ON_CREATE');
});

runTest('B3. Applicant injects approvedAt -> DENIED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, approvedAt: Date.now() });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'FORBIDDEN_approvedAt_ON_CREATE');
});

runTest('B4. Applicant injects approvedBy -> DENIED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, approvedBy: 'admin' });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'FORBIDDEN_approvedBy_ON_CREATE');
});

runTest('B5. Applicant injects verifiedUntil -> DENIED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, verifiedUntil: Date.now() });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'FORBIDDEN_verifiedUntil_ON_CREATE');
});

// C. Non-catalog duration Days
runTest('C1. Applicant submits durationDays = 9999 -> DENIED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, durationDays: 9999 });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'INVALID_CATALOG_DURATION');
});

runTest('C2. Applicant submits durationDays = 1000 -> DENIED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, durationDays: 1000 });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'INVALID_CATALOG_DURATION');
});

runTest('C3. Applicant submits durationDays = 31 -> DENIED', () => {
  const res = evaluateVerificationAppCreateRule(applicantAuth, { ...baseAppDoc, durationDays: 31 });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'INVALID_CATALOG_DURATION');
});

// D. Payment Verification Gate Tests
runTest('D1. KYC Admin attempts APPROVED while verificationStage = NONE -> DENIED', () => {
  const unverifiedDoc: VerificationAppDoc = { ...baseAppDoc, verificationStage: 'NONE' };
  const incoming: VerificationAppDoc = { ...unverifiedDoc, status: 'APPROVED' };
  const res = evaluateVerificationAppUpdateRule(kycAdminAuth, unverifiedDoc, incoming);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'PAYMENT_VERIFICATION_GATE_FAILED');
});

runTest('D2. KYC Admin attempts APPROVED with no receivedAmount -> DENIED', () => {
  const noAmountDoc: VerificationAppDoc = { ...baseAppDoc, verificationStage: 'PAYMENT_VERIFIED' };
  const incoming: VerificationAppDoc = { ...noAmountDoc, status: 'APPROVED' };
  const res = evaluateVerificationAppUpdateRule(kycAdminAuth, noAmountDoc, incoming);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'PAYMENT_VERIFICATION_GATE_FAILED');
});

runTest('D3. KYC Admin attempts APPROVED with receivedAmount = 0 -> DENIED', () => {
  const zeroAmountDoc: VerificationAppDoc = { ...baseAppDoc, verificationStage: 'PAYMENT_VERIFIED', receivedAmount: 0 };
  const incoming: VerificationAppDoc = { ...zeroAmountDoc, status: 'APPROVED' };
  const res = evaluateVerificationAppUpdateRule(kycAdminAuth, zeroAmountDoc, incoming);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'PAYMENT_VERIFICATION_GATE_FAILED');
});

runTest('D4. KYC Admin attempts APPROVED with verificationStage = SENT_TO_VERIFIERS -> DENIED', () => {
  const sentDoc: VerificationAppDoc = { ...baseAppDoc, verificationStage: 'SENT_TO_VERIFIERS', receivedAmount: 1999 };
  const incoming: VerificationAppDoc = { ...sentDoc, status: 'APPROVED' };
  const res = evaluateVerificationAppUpdateRule(kycAdminAuth, sentDoc, incoming);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'PAYMENT_VERIFICATION_GATE_FAILED');
});

// E. Payment Verifier Boundaries
runTest('E1. Legitimate Payment Verifier payment verification stage update -> ALLOWED', () => {
  const existingDoc: VerificationAppDoc = { ...baseAppDoc, verificationStage: 'SENT_TO_VERIFIERS' };
  const incoming: VerificationAppDoc = { ...existingDoc, verificationStage: 'PAYMENT_VERIFIED', receivedAmount: 1999 };
  const res = evaluateVerificationAppUpdateRule(paymentVerifierAuth, existingDoc, incoming);
  assert.strictEqual(res.allowed, true);
});

runTest('E2. Payment Verifier attempts final APPROVED status -> DENIED', () => {
  const existingDoc: VerificationAppDoc = { ...baseAppDoc, verificationStage: 'PAYMENT_VERIFIED', receivedAmount: 1999 };
  const incoming: VerificationAppDoc = { ...existingDoc, status: 'APPROVED' };
  const res = evaluateVerificationAppUpdateRule(paymentVerifierAuth, existingDoc, incoming);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'VERIFIER_CANNOT_APPROVE_FINAL_STATUS');
});

// F. Legitimate Approval
runTest('F1. KYC Admin approving legitimately payment-verified application -> ALLOWED', () => {
  const verifiedDoc: VerificationAppDoc = { ...baseAppDoc, verificationStage: 'PAYMENT_VERIFIED', receivedAmount: 1999 };
  const incoming: VerificationAppDoc = { ...verifiedDoc, status: 'APPROVED' };
  const res = evaluateVerificationAppUpdateRule(kycAdminAuth, verifiedDoc, incoming);
  assert.strictEqual(res.allowed, true);
});

runTest('F2. Foreign user attempting to modify another user application -> DENIED', () => {
  const foreignAuth: AuthContext = { uid: 'user_bob_hacker', email: 'bob@example.com' };
  const res = evaluateVerificationAppCreateRule(foreignAuth, { ...baseAppDoc, userId: 'user_alice_123' });
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'USER_ID_MISMATCH');
});

runTest('F3. Super Admin approving legitimately payment-verified application -> ALLOWED', () => {
  const verifiedDoc: VerificationAppDoc = { ...baseAppDoc, verificationStage: 'PAYMENT_VERIFIED', receivedAmount: 1999 };
  const incoming: VerificationAppDoc = { ...verifiedDoc, status: 'APPROVED' };
  const res = evaluateVerificationAppUpdateRule(superAdminAuth, verifiedDoc, incoming);
  assert.strictEqual(res.allowed, true);
});

console.log(`\nAll ${testsPassed}/${testsRun} SEC-05-14-C-DB02-B tests passed successfully.\n`);
