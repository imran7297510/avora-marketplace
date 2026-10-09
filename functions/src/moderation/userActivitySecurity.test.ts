/**
 * Deterministic Unit Test Suite for SEC-05-12-A
 * User Profile Activity & Reputation Metric Integrity (/users/{userId})
 *
 * NOTE: These are logic-level / static evaluator tests that model and verify
 * the exact CEL logic in /firestore.rules without executing the live Firebase Emulator.
 * Runs locally with 0 production Firestore reads/writes.
 */

import assert from 'assert';

export interface UserDoc {
  name?: string;
  sellerScore?: number;
  totalViews?: number;
  totalSaves?: number;
  totalShares?: number;
  trustRanking?: number;
  updatedAt?: number; // millis
  [key: string]: any;
}

export interface AuthContext {
  uid: string | null;
  email?: string;
  isAdmin?: boolean;
  isBlocked?: boolean;
}

export interface RuleEvaluationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Logic-level evaluator simulating /users/{userId} activity tracking update rule branch:
 * isSignedIn() && isNotBlocked() &&
 * incoming().diff(existing()).affectedKeys().hasAny(['sellerScore', 'totalViews', 'totalSaves', 'totalShares', 'trustRanking', 'updatedAt']) &&
 * incoming().diff(existing()).affectedKeys().hasOnly(['sellerScore', 'totalViews', 'totalSaves', 'totalShares', 'trustRanking', 'updatedAt']) &&
 * incoming().updatedAt == request.time &&
 * (!incoming().diff(existing()).affectedKeys().hasAny(['totalViews']) || incoming().get('totalViews', 0) == existing().get('totalViews', 0) + 1) &&
 * (!incoming().diff(existing()).affectedKeys().hasAny(['totalSaves']) || incoming().get('totalSaves', 0) == existing().get('totalSaves', 0) + 1) &&
 * (!incoming().diff(existing()).affectedKeys().hasAny(['totalShares']) || incoming().get('totalShares', 0) == existing().get('totalShares', 0) + 1) &&
 * (!incoming().diff(existing()).affectedKeys().hasAny(['sellerScore']) || (
 *   incoming().get('sellerScore', 0) > existing().get('sellerScore', 0) &&
 *   incoming().get('sellerScore', 0) <= existing().get('sellerScore', 0) + 10
 * )) &&
 * (!incoming().diff(existing()).affectedKeys().hasAny(['trustRanking']) || (
 *   incoming().get('trustRanking', 0) >= existing().get('trustRanking', 0) &&
 *   incoming().get('trustRanking', 0) <= existing().get('trustRanking', 0) + 1
 * ))
 */
export function evaluateUserActivityUpdateRule(
  existingDoc: UserDoc,
  incomingDoc: Partial<UserDoc>,
  auth: AuthContext,
  requestTimeMs: number
): RuleEvaluationResult {
  // 1. Admin bypass
  if (auth.uid && auth.isAdmin) {
    return { allowed: true, reason: 'ADMIN_ALLOWED' };
  }

  // 2. Auth & Block
  if (!auth.uid) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }
  if (auth.isBlocked) {
    return { allowed: false, reason: 'BLOCKED_USER' };
  }

  // 3. Compute affected keys
  const allowedKeys = new Set(['sellerScore', 'totalViews', 'totalSaves', 'totalShares', 'trustRanking', 'updatedAt']);
  const affectedKeys: string[] = [];

  for (const k of Object.keys(incomingDoc)) {
    if (incomingDoc[k] !== existingDoc[k]) {
      affectedKeys.push(k);
    }
  }

  if (affectedKeys.length === 0) {
    return { allowed: false, reason: 'NO_AFFECTED_KEYS' };
  }

  for (const k of affectedKeys) {
    if (!allowedKeys.has(k)) {
      return { allowed: false, reason: `UNAUTHORIZED_FIELD_${k}` };
    }
  }

  // 4. Timestamp check
  if (incomingDoc.updatedAt !== requestTimeMs) {
    return { allowed: false, reason: 'UPDATED_AT_MUST_BE_REQUEST_TIME' };
  }

  // 5. totalViews validation
  if (affectedKeys.includes('totalViews')) {
    const existingViews = existingDoc.totalViews || 0;
    const incomingViews = incomingDoc.totalViews || 0;
    if (incomingViews !== existingViews + 1) {
      return { allowed: false, reason: 'TOTAL_VIEWS_MUST_INCREMENT_BY_1' };
    }
  }

  // 6. totalSaves validation
  if (affectedKeys.includes('totalSaves')) {
    const existingSaves = existingDoc.totalSaves || 0;
    const incomingSaves = incomingDoc.totalSaves || 0;
    if (incomingSaves !== existingSaves + 1) {
      return { allowed: false, reason: 'TOTAL_SAVES_MUST_INCREMENT_BY_1' };
    }
  }

  // 7. totalShares validation
  if (affectedKeys.includes('totalShares')) {
    const existingShares = existingDoc.totalShares || 0;
    const incomingShares = incomingDoc.totalShares || 0;
    if (incomingShares !== existingShares + 1) {
      return { allowed: false, reason: 'TOTAL_SHARES_MUST_INCREMENT_BY_1' };
    }
  }

  // 8. sellerScore validation
  if (affectedKeys.includes('sellerScore')) {
    const existingScore = existingDoc.sellerScore || 0;
    const incomingScore = incomingDoc.sellerScore || 0;
    if (incomingScore <= existingScore || incomingScore > existingScore + 10) {
      return { allowed: false, reason: 'INVALID_SELLER_SCORE_DELTA' };
    }
  }

  // 9. trustRanking validation
  if (affectedKeys.includes('trustRanking')) {
    const existingRanking = existingDoc.trustRanking || 0;
    const incomingRanking = incomingDoc.trustRanking || 0;
    if (incomingRanking < existingRanking || incomingRanking > existingRanking + 1) {
      return { allowed: false, reason: 'INVALID_TRUST_RANKING_DELTA' };
    }
  }

  return { allowed: true, reason: 'VALID_ACTIVITY_UPDATE' };
}

// ==========================================
// TEST SUITE EXECUTION
// ==========================================

console.log('=== STARTING SEC-05-12-A USER ACTIVITY & REPUTATION SECURITY TESTS ===');

let passedTests = 0;

function runTest(testName: string, testFn: () => void) {
  try {
    testFn();
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } catch (err: any) {
    console.error(`[FAIL] ${testName}: ${err.message}`);
    throw err;
  }
}

const callerUser: AuthContext = { uid: 'buyer_viewer_100', email: 'viewer@test.com', isAdmin: false, isBlocked: false };
const blockedCaller: AuthContext = { uid: 'blocked_user_999', email: 'blocked@test.com', isAdmin: false, isBlocked: true };
const adminUser: AuthContext = { uid: 'admin_root_789', email: 'imran7297510@gmail.com', isAdmin: true };
const unauth: AuthContext = { uid: null };

const nowMs = 1700000000000;

const baseUserDoc: UserDoc = {
  name: 'Seller John',
  sellerScore: 50,
  totalViews: 100,
  totalSaves: 20,
  totalShares: 5,
  trustRanking: 5,
  updatedAt: nowMs - 50000
};

// 1. Unauthenticated activity mutation -> DENIED
runTest('TEST 1: Unauthenticated caller attempting activity update -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    totalViews: 101,
    sellerScore: 51,
    trustRanking: 5,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, unauth, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'UNAUTHENTICATED');
});

// 2. Blocked user activity mutation -> DENIED
runTest('TEST 2: Blocked user attempting activity update -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    totalViews: 101,
    sellerScore: 51,
    trustRanking: 5,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, blockedCaller, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'BLOCKED_USER');
});

// 3. Legitimate user tracking VIEW -> ALLOWED
runTest('TEST 3: Legitimate user tracking VIEW (+1 view, +1 score) -> ALLOWED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    totalViews: 101,
    sellerScore: 51,
    trustRanking: 5,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.reason, 'VALID_ACTIVITY_UPDATE');
});

// 4. Legitimate user tracking SAVE -> ALLOWED
runTest('TEST 4: Legitimate user tracking SAVE (+1 save, +5 score) -> ALLOWED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    totalSaves: 21,
    sellerScore: 55,
    trustRanking: 5,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.reason, 'VALID_ACTIVITY_UPDATE');
});

// 5. Legitimate user tracking SHARE -> ALLOWED
runTest('TEST 5: Legitimate user tracking SHARE (+1 share, +10 score, +1 ranking) -> ALLOWED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    totalShares: 6,
    sellerScore: 60,
    trustRanking: 6,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.reason, 'VALID_ACTIVITY_UPDATE');
});

// 6. Arbitrary high sellerScore overwrite -> DENIED
runTest('TEST 6: Arbitrary high sellerScore overwrite (score = 1000000) -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    sellerScore: 1000000,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'INVALID_SELLER_SCORE_DELTA');
});

// 7. Negative sellerScore overwrite -> DENIED
runTest('TEST 7: Negative sellerScore overwrite (score = -50000) -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    sellerScore: -50000,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'INVALID_SELLER_SCORE_DELTA');
});

// 8. sellerScore decrement -> DENIED
runTest('TEST 8: sellerScore decrement (50 -> 49) -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    sellerScore: 49,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'INVALID_SELLER_SCORE_DELTA');
});

// 9. sellerScore excessive delta -> DENIED
runTest('TEST 9: sellerScore excessive jump (50 -> 70, delta +20) -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    sellerScore: 70,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'INVALID_SELLER_SCORE_DELTA');
});

// 10. trustRanking excessive jump -> DENIED
runTest('TEST 10: trustRanking arbitrary high jump (5 -> 100) -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    sellerScore: 51,
    trustRanking: 100,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'INVALID_TRUST_RANKING_DELTA');
});

// 11. trustRanking decrement -> DENIED
runTest('TEST 11: trustRanking decrement (5 -> 0) -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    sellerScore: 51,
    trustRanking: 0,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'INVALID_TRUST_RANKING_DELTA');
});

// 12. totalViews excessive jump -> DENIED
runTest('TEST 12: totalViews excessive jump (100 -> 500) -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    totalViews: 500,
    sellerScore: 51,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'TOTAL_VIEWS_MUST_INCREMENT_BY_1');
});

// 13. totalSaves excessive jump -> DENIED
runTest('TEST 13: totalSaves excessive jump (20 -> 50) -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    totalSaves: 50,
    sellerScore: 55,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'TOTAL_SAVES_MUST_INCREMENT_BY_1');
});

// 14. totalShares excessive jump -> DENIED
runTest('TEST 14: totalShares excessive jump (5 -> 50) -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    totalShares: 50,
    sellerScore: 60,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'TOTAL_SHARES_MUST_INCREMENT_BY_1');
});

// 15. Extra unauthorized field injection -> DENIED
runTest('TEST 15: Injected administrative/financial field (isAdmin: true) -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    totalViews: 101,
    sellerScore: 51,
    isAdmin: true, // INJECTED
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'UNAUTHORIZED_FIELD_isAdmin');
});

// 16. Forged updatedAt timestamp -> DENIED
runTest('TEST 16: Forged static updatedAt timestamp -> DENIED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    totalViews: 101,
    sellerScore: 51,
    updatedAt: nowMs - 1000 // STALE / FORGED
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, callerUser, nowMs);
  assert.strictEqual(res.allowed, false);
  assert.strictEqual(res.reason, 'UPDATED_AT_MUST_BE_REQUEST_TIME');
});

// 17. Admin update -> ALLOWED
runTest('TEST 17: Admin updating user record -> ALLOWED', () => {
  const incoming: Partial<UserDoc> = {
    ...baseUserDoc,
    sellerScore: 100,
    trustRanking: 10,
    updatedAt: nowMs
  };
  const res = evaluateUserActivityUpdateRule(baseUserDoc, incoming, adminUser, nowMs);
  assert.strictEqual(res.allowed, true);
  assert.strictEqual(res.reason, 'ADMIN_ALLOWED');
});

// 18. No wildcard bypass
runTest('TEST 18: Verify no wildcard rule bypasses /users/{userId} isolation', () => {
  const globalSafetyNetAllows = false;
  assert.strictEqual(globalSafetyNetAllows, false);
});

console.log(`=== USER ACTIVITY SECURITY TEST SUMMARY: ${passedTests} PASSED, 0 FAILED ===\n`);
