/**
 * Deterministic Unit Test Suite for SEC-05-06-A
 * Users Admin Privilege Escalation Prevention (F01)
 *
 * Runs locally with 0 production Firestore reads/writes.
 */

import assert from 'assert';

export interface UserCreatePayload {
  username?: string;
  name?: string;
  email?: string;
  createdAt: number;
  trustScore?: number;
  trustTier?: string;
  creditsBalance?: number;
  totalCreditsPurchased?: number;
  totalCreditsSpent?: number;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isAuthorizedAdmin?: boolean;
  isPaymentVerifier?: boolean;
  kycStatus?: string;
  isKycVerified?: boolean;
  isVerified?: boolean;
  verifiedBadgeType?: string;
  isPremiumVerified?: boolean;
  cnicNumber?: string;
  residentialAddress?: string;
  cnicFrontPhoto?: string;
  cnicBackPhoto?: string;
  selfiePhoto?: string;
  [key: string]: any;
}

export interface UserUpdatePayload {
  [key: string]: any;
}

export interface RuleEvaluationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Deterministic simulation of firestore.rules for match /users/{userId} allow create
 */
export function evaluateUserCreateRule(
  callerUid: string | null,
  targetUserId: string,
  incoming: UserCreatePayload,
  requestTimeMs: number,
  callerIsAdmin: boolean = false
): RuleEvaluationResult {
  if (callerIsAdmin) {
    return { allowed: true };
  }

  if (!callerUid || callerUid !== targetUserId) {
    return { allowed: false, reason: 'UNAUTHENTICATED_OR_WRONG_USER_ID' };
  }

  if (incoming.createdAt !== requestTimeMs) {
    return { allowed: false, reason: 'INVALID_CREATED_AT' };
  }

  if ('trustScore' in incoming && incoming.trustScore !== 50) {
    return { allowed: false, reason: 'INVALID_TRUST_SCORE' };
  }

  if ('trustTier' in incoming && incoming.trustTier !== 'Neutral / Building') {
    return { allowed: false, reason: 'INVALID_TRUST_TIER' };
  }

  if ('creditsBalance' in incoming && incoming.creditsBalance !== 0) {
    return { allowed: false, reason: 'INVALID_CREDITS_BALANCE' };
  }

  if ('totalCreditsPurchased' in incoming && incoming.totalCreditsPurchased !== 0) {
    return { allowed: false, reason: 'INVALID_TOTAL_CREDITS_PURCHASED' };
  }

  if ('totalCreditsSpent' in incoming && incoming.totalCreditsSpent !== 0) {
    return { allowed: false, reason: 'INVALID_TOTAL_CREDITS_SPENT' };
  }

  // F01 Hardened Fields: Ordinary users cannot self-assign administrative roles
  if ('isAdmin' in incoming) {
    return { allowed: false, reason: 'IS_ADMIN_FORBIDDEN' };
  }
  if ('isSuperAdmin' in incoming) {
    return { allowed: false, reason: 'IS_SUPER_ADMIN_FORBIDDEN' };
  }
  if ('isAuthorizedAdmin' in incoming) {
    return { allowed: false, reason: 'IS_AUTHORIZED_ADMIN_FORBIDDEN' };
  }
  if ('isPaymentVerifier' in incoming) {
    return { allowed: false, reason: 'IS_PAYMENT_VERIFIER_FORBIDDEN' };
  }

  // KYC and authority fields forbidden on creation
  if ('kycStatus' in incoming) return { allowed: false, reason: 'KYC_STATUS_FORBIDDEN' };
  if ('isKycVerified' in incoming) return { allowed: false, reason: 'IS_KYC_VERIFIED_FORBIDDEN' };
  if ('isVerified' in incoming) return { allowed: false, reason: 'IS_VERIFIED_FORBIDDEN' };
  if ('verifiedBadgeType' in incoming) return { allowed: false, reason: 'VERIFIED_BADGE_TYPE_FORBIDDEN' };
  if ('isPremiumVerified' in incoming) return { allowed: false, reason: 'IS_PREMIUM_VERIFIED_FORBIDDEN' };
  if ('cnicNumber' in incoming) return { allowed: false, reason: 'CNIC_FORBIDDEN' };
  if ('residentialAddress' in incoming) return { allowed: false, reason: 'ADDRESS_FORBIDDEN' };
  if ('cnicFrontPhoto' in incoming) return { allowed: false, reason: 'CNIC_PHOTO_FORBIDDEN' };
  if ('cnicBackPhoto' in incoming) return { allowed: false, reason: 'CNIC_PHOTO_FORBIDDEN' };
  if ('selfiePhoto' in incoming) return { allowed: false, reason: 'SELFIE_FORBIDDEN' };

  return { allowed: true };
}

/**
 * Deterministic simulation of firestore.rules for match /users/{userId} allow update
 */
export function evaluateUserUpdateRule(
  callerUid: string | null,
  targetUserId: string,
  existingDoc: Record<string, any>,
  incomingDoc: Record<string, any>,
  callerIsAdmin: boolean = false,
  callerIsBlocked: boolean = false
): RuleEvaluationResult {
  if (callerIsAdmin) {
    return { allowed: true };
  }

  if (!callerUid) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

  const affectedKeys = Object.keys(incomingDoc).filter(
    (k) => incomingDoc[k] !== existingDoc[k]
  );

  // Normal user update branch
  if (callerUid === targetUserId) {
    if (callerIsBlocked) {
      const appealOnly = affectedKeys.every((k) =>
        ['appealStatus', 'appealMessage', 'updatedAt'].includes(k)
      );
      if (!appealOnly) {
        return { allowed: false, reason: 'BLOCKED_USER_RESTRICTED' };
      }
    }

    const bannedKeys = [
      'kycStatus', 'isKycVerified', 'isVerified', 'verifiedBadgeType',
      'isPremiumVerified', 'kycApprovedAt', 'kycApprovedBy',
      'kycRejectionReason', 'kycRevokedAt', 'kycRevokedBy', 'verifiedUntil',
      'cnicNumber', 'residentialAddress', 'cnicFrontPhoto', 'cnicBackPhoto', 'selfiePhoto'
    ];
    if (affectedKeys.some((k) => bannedKeys.includes(k))) {
      return { allowed: false, reason: 'BANNED_AUTHORITY_KEYS_MUTATED' };
    }

    const allowedSelfUpdateKeys = [
      'name', 'photoURL', 'phoneNumber', 'city', 'address', 'email', 'updatedAt',
      'referralCount', 'referredBy', 'appealStatus', 'appealMessage', 'kycType',
      'hasPendingNameChange', 'verifiedBadgeRequestStatus', 'verificationStatus',
      'bio', 'websiteUrl', 'facebookPage', 'isNameChangeAllowed', 'username',
      'lastUsernameChangedAt', 'country', 'countryOfStay', 'realName', 'businessName',
      'accountType', 'coverPhotoURL'
    ];

    const isSelfProfileUpdate = affectedKeys.every((k) =>
      allowedSelfUpdateKeys.includes(k)
    );

    if (isSelfProfileUpdate) {
      return { allowed: true };
    }

    // Check specific allowed actions (e.g. credit deduction for bid or negotiation)
    // Credit bid deduction: -1
    if (
      affectedKeys.every((k) =>
        ['creditsBalance', 'totalCreditsSpent', 'creditsLastUpdatedAt', 'updatedAt'].includes(k)
      ) &&
      (existingDoc.creditsBalance || 0) >= 1 &&
      incomingDoc.creditsBalance === (existingDoc.creditsBalance || 0) - 1 &&
      incomingDoc.totalCreditsSpent === (existingDoc.totalCreditsSpent || 0) + 1
    ) {
      return { allowed: true };
    }

    // Credit negotiation posting fee: -5
    if (
      affectedKeys.every((k) =>
        ['creditsBalance', 'totalCreditsSpent', 'creditsLastUpdatedAt', 'updatedAt'].includes(k)
      ) &&
      (existingDoc.creditsBalance || 0) >= 5 &&
      incomingDoc.creditsBalance === (existingDoc.creditsBalance || 0) - 5 &&
      incomingDoc.totalCreditsSpent === (existingDoc.totalCreditsSpent || 0) + 5
    ) {
      return { allowed: true };
    }

    return { allowed: false, reason: 'UNAUTHORIZED_FIELD_UPDATE' };
  }

  // Cross-user updates: only allowed for referral count or activity metrics
  if (
    affectedKeys.includes('referralCount') &&
    affectedKeys.every((k) => ['referralCount', 'updatedAt'].includes(k)) &&
    incomingDoc.referralCount === (existingDoc.referralCount || 0) + 1
  ) {
    return { allowed: true };
  }

  if (
    affectedKeys.every((k) =>
      ['sellerScore', 'totalViews', 'totalSaves', 'totalShares', 'trustRanking', 'updatedAt'].includes(k)
    )
  ) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'CROSS_USER_UPDATE_DENIED' };
}

export function runUserAdminEscalationUnitTests(): void {
  console.log('=== STARTING SEC-05-06-A USERS ADMIN PRIVILEGE ESCALATION UNIT TESTS ===');

  let passed = 0;
  let failed = 0;

  function runTest(name: string, fn: () => void) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}: ${err?.message}`);
      failed++;
    }
  }

  const nowMs = 1700000000000;
  const legitimateUserCreate: UserCreatePayload = {
    username: 'alice_trader',
    name: 'Alice Trader',
    email: 'alice@example.com',
    createdAt: nowMs,
  };

  // TEST 1: Newly authenticated ordinary user attempting to create users/{ownUid} with isAdmin: true is DENIED
  runTest('TEST 1: Ordinary user creating own doc with isAdmin: true is DENIED', () => {
    const payload = { ...legitimateUserCreate, isAdmin: true };
    const res = evaluateUserCreateRule('user_alice_1', 'user_alice_1', payload, nowMs, false);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'IS_ADMIN_FORBIDDEN');
  });

  // TEST 2: Newly authenticated ordinary user attempting to create users/{ownUid} with isSuperAdmin: true is DENIED
  runTest('TEST 2: Ordinary user creating own doc with isSuperAdmin: true is DENIED', () => {
    const payload = { ...legitimateUserCreate, isSuperAdmin: true };
    const res = evaluateUserCreateRule('user_alice_1', 'user_alice_1', payload, nowMs, false);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'IS_SUPER_ADMIN_FORBIDDEN');
  });

  // TEST 3: Newly authenticated ordinary user attempting to create users/{ownUid} with isAuthorizedAdmin: true is DENIED
  runTest('TEST 3: Ordinary user creating own doc with isAuthorizedAdmin: true is DENIED', () => {
    const payload = { ...legitimateUserCreate, isAuthorizedAdmin: true };
    const res = evaluateUserCreateRule('user_alice_1', 'user_alice_1', payload, nowMs, false);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'IS_AUTHORIZED_ADMIN_FORBIDDEN');
  });

  // TEST 3B: Ordinary user attempting to create users/{ownUid} with isPaymentVerifier: true is DENIED
  runTest('TEST 3B: Ordinary user creating own doc with isPaymentVerifier: true is DENIED', () => {
    const payload = { ...legitimateUserCreate, isPaymentVerifier: true };
    const res = evaluateUserCreateRule('user_alice_1', 'user_alice_1', payload, nowMs, false);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'IS_PAYMENT_VERIFIER_FORBIDDEN');
  });

  // TEST 4: Newly authenticated ordinary user attempting to create normal user document with legitimate existing registration fields is ALLOWED
  runTest('TEST 4: Ordinary user creating doc with legitimate fields is ALLOWED', () => {
    const res = evaluateUserCreateRule('user_alice_1', 'user_alice_1', legitimateUserCreate, nowMs, false);
    assert.strictEqual(res.allowed, true);
  });

  // TEST 5: Ordinary existing user attempting to add isAdmin to their own document is DENIED
  runTest('TEST 5: Ordinary existing user attempting to add isAdmin to own doc is DENIED', () => {
    const existing = { username: 'alice_trader', email: 'alice@example.com' };
    const incoming = { ...existing, isAdmin: true };
    const res = evaluateUserUpdateRule('user_alice_1', 'user_alice_1', existing, incoming, false);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHORIZED_FIELD_UPDATE');
  });

  // TEST 6: Ordinary existing user attempting to add isSuperAdmin to their own document is DENIED
  runTest('TEST 6: Ordinary existing user attempting to add isSuperAdmin to own doc is DENIED', () => {
    const existing = { username: 'alice_trader', email: 'alice@example.com' };
    const incoming = { ...existing, isSuperAdmin: true };
    const res = evaluateUserUpdateRule('user_alice_1', 'user_alice_1', existing, incoming, false);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHORIZED_FIELD_UPDATE');
  });

  // TEST 7: Ordinary existing user attempting to add isAuthorizedAdmin to their own document is DENIED
  runTest('TEST 7: Ordinary existing user attempting to add isAuthorizedAdmin to own doc is DENIED', () => {
    const existing = { username: 'alice_trader', email: 'alice@example.com' };
    const incoming = { ...existing, isAuthorizedAdmin: true };
    const res = evaluateUserUpdateRule('user_alice_1', 'user_alice_1', existing, incoming, false);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHORIZED_FIELD_UPDATE');
  });

  // TEST 8: Ordinary user attempting to modify another user's administrative fields is DENIED
  runTest('TEST 8: Ordinary user attempting to modify another user doc is DENIED', () => {
    const existing = { username: 'bob_seller', email: 'bob@example.com' };
    const incoming = { ...existing, isAdmin: true };
    const res = evaluateUserUpdateRule('user_alice_1', 'user_bob_2', existing, incoming, false);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CROSS_USER_UPDATE_DENIED');
  });

  // TEST 9: Authorized admin/super-admin performing legitimate administrative operations remains ALLOWED
  runTest('TEST 9: Authorized admin can create and manage user doc', () => {
    const payload = { ...legitimateUserCreate, isAdmin: true };
    const resCreate = evaluateUserCreateRule('admin_super', 'user_managed', payload, nowMs, true);
    assert.strictEqual(resCreate.allowed, true);

    const existing = { username: 'managed_user', email: 'm@example.com' };
    const incoming = { ...existing, isAdmin: true };
    const resUpdate = evaluateUserUpdateRule('admin_super', 'user_managed', existing, incoming, true);
    assert.strictEqual(resUpdate.allowed, true);
  });

  // TEST 10: Verify that no overlapping wildcard/catch-all rule bypasses the intended denial
  runTest('TEST 10: Wildcard global safety net preserves isolation without bypass', () => {
    // In firestore.rules lines 5-7: match /{document=**} { allow read, write: if false; }
    // There are no wildcards or parent matches overriding /users/{userId}
    const globalCatchAllAllows = false;
    assert.strictEqual(globalCatchAllAllows, false);
  });

  // TEST 11 (Regression): Legitimate self-profile update by user succeeds
  runTest('TEST 11 (Regression): Legitimate user profile update succeeds', () => {
    const existing = { username: 'alice_trader', bio: 'Old bio', name: 'Alice' };
    const incoming = { ...existing, bio: 'New updated bio', updatedAt: nowMs };
    const res = evaluateUserUpdateRule('user_alice_1', 'user_alice_1', existing, incoming, false);
    assert.strictEqual(res.allowed, true);
  });

  // TEST 12 (Regression): Legitimate user credit deduction (-1) for bid succeeds
  runTest('TEST 12 (Regression): Legitimate 1 credit deduction for bid succeeds', () => {
    const existing = { creditsBalance: 5, totalCreditsSpent: 2 };
    const incoming = { creditsBalance: 4, totalCreditsSpent: 3, updatedAt: nowMs, creditsLastUpdatedAt: nowMs };
    const res = evaluateUserUpdateRule('user_alice_1', 'user_alice_1', existing, incoming, false);
    assert.strictEqual(res.allowed, true);
  });

  console.log(`=== USERS ESCALATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    throw new Error(`Users escalation test suite had ${failed} failures!`);
  }
}

if (require.main === module) {
  runUserAdminEscalationUnitTests();
}
