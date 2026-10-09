/**
 * Deterministic Unit Test Suite for SEC-05-14-C-A
 * Storage Rules: KYC Document PII Read Access Isolation
 *
 * Verifies that Payment Verifiers cannot access raw KYC PII (/kyc/{userId}/*)
 * Runs locally with 0 production Firestore or Storage reads/writes.
 */

import assert from 'assert';

export interface StorageAuthContext {
  uid: string | null;
  token?: {
    email?: string;
    admin?: boolean;
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    isPaymentVerifier?: boolean;
    [key: string]: any;
  };
}

export interface RuleEvaluationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Deterministic simulation of storage.rules match /kyc/{userId}/{allPaths=**}
 * allow read: if request.auth != null && (
 *   request.auth.uid == userId ||
 *   request.auth.token.email.lower() == "imran7297510@gmail.com" ||
 *   request.auth.token.email.lower() == "imran7297510@gmail" ||
 *   request.auth.token.admin == true ||
 *   request.auth.token.isAdmin == true ||
 *   request.auth.token.isSuperAdmin == true
 * );
 */
export function evaluateKycStorageReadRule(
  auth: StorageAuthContext | null,
  targetUserId: string
): RuleEvaluationResult {
  if (!auth || !auth.uid) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

  const emailLower = auth.token?.email ? auth.token.email.toLowerCase() : '';
  const isSuperEmail = emailLower === 'imran7297510@gmail.com' || emailLower === 'imran7297510@gmail';
  const isAdminClaim = auth.token?.admin === true || auth.token?.isAdmin === true;
  const isSuperClaim = auth.token?.isSuperAdmin === true;
  const isOwner = auth.uid === targetUserId;

  if (isOwner || isSuperEmail || isAdminClaim || isSuperClaim) {
    return { allowed: true, reason: 'AUTHORIZED_READ' };
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
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('Running SEC-05-14-C-A KYC Storage Security Tests:');

// 1. KYC owner read -> ALLOWED
runTest('1. KYC document owner can read their own KYC files -> ALLOWED', () => {
  const caller: StorageAuthContext = {
    uid: 'user_alice_123',
    token: { email: 'alice@example.com' },
  };
  const result = evaluateKycStorageReadRule(caller, 'user_alice_123');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.reason, 'AUTHORIZED_READ');
});

// 2. Super Admin read -> ALLOWED (email & token claims)
runTest('2A. Super Admin with canonical email can read any KYC files -> ALLOWED', () => {
  const caller: StorageAuthContext = {
    uid: 'admin_root_1',
    token: { email: 'imran7297510@gmail.com' },
  };
  const result = evaluateKycStorageReadRule(caller, 'user_alice_123');
  assert.strictEqual(result.allowed, true);
});

runTest('2B. Super Admin with legacy email variant can read any KYC files -> ALLOWED', () => {
  const caller: StorageAuthContext = {
    uid: 'admin_root_2',
    token: { email: 'imran7297510@gmail' },
  };
  const result = evaluateKycStorageReadRule(caller, 'user_alice_123');
  assert.strictEqual(result.allowed, true);
});

runTest('2C. Super Admin with isSuperAdmin token claim can read any KYC files -> ALLOWED', () => {
  const caller: StorageAuthContext = {
    uid: 'admin_root_3',
    token: { isSuperAdmin: true },
  };
  const result = evaluateKycStorageReadRule(caller, 'user_alice_123');
  assert.strictEqual(result.allowed, true);
});

// 3. KYC & Verification Administrator read -> ALLOWED
runTest('3A. KYC Admin with admin token claim can read any KYC files -> ALLOWED', () => {
  const caller: StorageAuthContext = {
    uid: 'kyc_admin_1',
    token: { admin: true },
  };
  const result = evaluateKycStorageReadRule(caller, 'user_alice_123');
  assert.strictEqual(result.allowed, true);
});

runTest('3B. KYC Admin with isAdmin token claim can read any KYC files -> ALLOWED', () => {
  const caller: StorageAuthContext = {
    uid: 'kyc_admin_2',
    token: { isAdmin: true },
  };
  const result = evaluateKycStorageReadRule(caller, 'user_alice_123');
  assert.strictEqual(result.allowed, true);
});

// 4. Payment Verifier read -> DENIED
runTest('4. Payment Verifier (isPaymentVerifier claim only) attempting to read KYC files -> DENIED', () => {
  const caller: StorageAuthContext = {
    uid: 'verifier_bob_456',
    token: {
      email: 'bob.verifier@example.com',
      isPaymentVerifier: true,
    },
  };
  const result = evaluateKycStorageReadRule(caller, 'user_alice_123');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.reason, 'PERMISSION_DENIED');
});

// 5. Ordinary user reading another user's KYC -> DENIED
runTest("5. Ordinary authenticated user reading another user's KYC files -> DENIED", () => {
  const caller: StorageAuthContext = {
    uid: 'user_eve_789',
    token: { email: 'eve@example.com' },
  };
  const result = evaluateKycStorageReadRule(caller, 'user_alice_123');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.reason, 'PERMISSION_DENIED');
});

// 6. Unauthenticated read -> DENIED
runTest('6A. Unauthenticated caller (null auth) -> DENIED', () => {
  const result = evaluateKycStorageReadRule(null, 'user_alice_123');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.reason, 'UNAUTHENTICATED');
});

runTest('6B. Unauthenticated caller (null uid) -> DENIED', () => {
  const caller: StorageAuthContext = { uid: null };
  const result = evaluateKycStorageReadRule(caller, 'user_alice_123');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.reason, 'UNAUTHENTICATED');
});

console.log(`\nAll ${testsPassed}/${testsRun} SEC-05-14-C-A tests passed successfully.\n`);
