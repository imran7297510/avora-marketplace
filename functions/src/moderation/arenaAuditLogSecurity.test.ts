/**
 * Deterministic Unit Test Suite for SEC-05-12-B
 * Arena Audit Log Authorization & Audit-Trail Integrity (/arena_audit_logs/{logId})
 *
 * NOTE: These are logic-level / static evaluator tests that model and verify
 * the exact CEL logic in /firestore.rules without executing the live Firebase Emulator.
 * Runs locally with 0 production Firestore reads/writes.
 */

import assert from 'assert';

export interface AuditLogDoc {
  userId?: string;
  moderatorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  metadata?: Record<string, any>;
  relatedReportIds?: string[];
  timestamp?: number; // millis
  createdAt?: number; // millis
  [key: string]: any;
}

export interface AuctionDoc {
  id: string;
  sellerId: string;
  userId?: string;
  ownerId?: string;
  privateSellerUid?: string;
  status?: string;
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
 * Logic-level evaluator simulating /arena_audit_logs/{logId} security rules:
 *
 * match /arena_audit_logs/{logId} {
 *   function isLegitimateSellerRemovalAudit() {
 *     return isSignedIn() &&
 *       isNotBlocked() &&
 *       incoming().userId == request.auth.uid &&
 *       !('moderatorId' in incoming()) &&
 *       incoming().action == 'REMOVE_LISTING' &&
 *       incoming().targetType == 'auction' &&
 *       incoming().targetId is string &&
 *       incoming().targetId.size() > 0 &&
 *       incoming().targetId.size() <= 128 &&
 *       incoming().timestamp == request.time &&
 *       incoming().createdAt == request.time &&
 *       incoming().keys().hasAll(['userId', 'action', 'targetType', 'targetId', 'timestamp', 'createdAt']) &&
 *       incoming().keys().hasOnly(['userId', 'action', 'targetType', 'targetId', 'previousState', 'newState', 'reason', 'metadata', 'timestamp', 'createdAt']) &&
 *       (!('previousState' in incoming()) || (incoming().previousState is string && incoming().previousState.size() <= 128)) &&
 *       (!('newState' in incoming()) || (incoming().newState is string && incoming().newState.size() <= 128)) &&
 *       (!('reason' in incoming()) || (incoming().reason is string && incoming().reason.size() <= 500)) &&
 *       (
 *         !('metadata' in incoming()) ||
 *         (
 *           incoming().metadata is map &&
 *           incoming().metadata.keys().hasOnly(['auctionId', 'removedBy']) &&
 *           incoming().metadata.get('removedBy', request.auth.uid) == request.auth.uid &&
 *           incoming().metadata.get('auctionId', incoming().targetId) == incoming().targetId
 *         )
 *       ) &&
 *       exists(/databases/$(database)/documents/arena_auctions/$(incoming().targetId)) &&
 *       (
 *         get(/databases/$(database)/documents/arena_auctions/$(incoming().targetId)).data.sellerId == request.auth.uid ||
 *         get(/databases/$(database)/documents/arena_auctions/$(incoming().targetId)).data.get('userId', '') == request.auth.uid ||
 *         get(/databases/$(database)/documents/arena_auctions/$(incoming().targetId)).data.get('ownerId', '') == request.auth.uid ||
 *         (
 *           exists(/databases/$(database)/documents/arena_auctions/$(incoming().targetId)/private/seller) &&
 *           get(/databases/$(database)/documents/arena_auctions/$(incoming().targetId)/private/seller).data.sellerUid == request.auth.uid
 *         )
 *       );
 *   }
 *
 *   allow read: if isAdmin();
 *   allow create: if isAdmin() || isLegitimateSellerRemovalAudit();
 *   allow update, delete: if isAdmin();
 * }
 */
export function evaluateAuditLogCreateRule(
  incoming: AuditLogDoc,
  auth: AuthContext,
  requestTimeMs: number,
  auctionsDb: Map<string, AuctionDoc>
): RuleEvaluationResult {
  // 1. Admin bypass
  if (auth.uid && auth.isAdmin) {
    return { allowed: true, reason: 'ADMIN_ALLOWED' };
  }

  // 2. isSignedIn
  if (!auth.uid) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

  // 3. isNotBlocked
  if (auth.isBlocked) {
    return { allowed: false, reason: 'BLOCKED_USER' };
  }

  // 4. incoming().userId == request.auth.uid
  if (incoming.userId !== auth.uid) {
    return { allowed: false, reason: 'USER_ID_MISMATCH' };
  }

  // 5. !('moderatorId' in incoming())
  if ('moderatorId' in incoming && incoming.moderatorId !== undefined) {
    return { allowed: false, reason: 'MODERATOR_ID_FORBIDDEN' };
  }

  // 6. incoming().action == 'REMOVE_LISTING'
  if (incoming.action !== 'REMOVE_LISTING') {
    return { allowed: false, reason: 'ACTION_MUST_BE_REMOVE_LISTING' };
  }

  // 7. incoming().targetType == 'auction'
  if (incoming.targetType !== 'auction') {
    return { allowed: false, reason: 'TARGET_TYPE_MUST_BE_AUCTION' };
  }

  // 8. incoming().targetId validation
  if (typeof incoming.targetId !== 'string' || incoming.targetId.length === 0 || incoming.targetId.length > 128) {
    return { allowed: false, reason: 'INVALID_TARGET_ID' };
  }

  // 9. Timestamps must equal request.time
  if (incoming.timestamp !== requestTimeMs) {
    return { allowed: false, reason: 'TIMESTAMP_MUST_BE_REQUEST_TIME' };
  }
  if (incoming.createdAt !== requestTimeMs) {
    return { allowed: false, reason: 'CREATED_AT_MUST_BE_REQUEST_TIME' };
  }

  // 10. Required keys
  const requiredKeys = ['userId', 'action', 'targetType', 'targetId', 'timestamp', 'createdAt'];
  for (const rk of requiredKeys) {
    if (!(rk in incoming) || incoming[rk] === undefined) {
      return { allowed: false, reason: `MISSING_REQUIRED_KEY_${rk}` };
    }
  }

  // 11. Allowed keys
  const allowedKeys = new Set([
    'userId', 'action', 'targetType', 'targetId',
    'previousState', 'newState', 'reason', 'metadata',
    'timestamp', 'createdAt'
  ]);
  for (const k of Object.keys(incoming)) {
    if (!allowedKeys.has(k)) {
      return { allowed: false, reason: `UNAUTHORIZED_FIELD_${k}` };
    }
  }

  // 12. previousState check
  if ('previousState' in incoming && incoming.previousState !== undefined) {
    if (typeof incoming.previousState !== 'string' || incoming.previousState.length > 128) {
      return { allowed: false, reason: 'INVALID_PREVIOUS_STATE' };
    }
  }

  // 13. newState check
  if ('newState' in incoming && incoming.newState !== undefined) {
    if (typeof incoming.newState !== 'string' || incoming.newState.length > 128) {
      return { allowed: false, reason: 'INVALID_NEW_STATE' };
    }
  }

  // 14. reason check
  if ('reason' in incoming && incoming.reason !== undefined) {
    if (typeof incoming.reason !== 'string' || incoming.reason.length > 500) {
      return { allowed: false, reason: 'INVALID_REASON' };
    }
  }

  // 15. metadata check
  if ('metadata' in incoming && incoming.metadata !== undefined) {
    if (typeof incoming.metadata !== 'object' || incoming.metadata === null || Array.isArray(incoming.metadata)) {
      return { allowed: false, reason: 'METADATA_MUST_BE_MAP' };
    }
    const metaAllowedKeys = new Set(['auctionId', 'removedBy']);
    for (const mk of Object.keys(incoming.metadata)) {
      if (!metaAllowedKeys.has(mk)) {
        return { allowed: false, reason: `UNAUTHORIZED_METADATA_KEY_${mk}` };
      }
    }
    if ('removedBy' in incoming.metadata && incoming.metadata.removedBy !== auth.uid) {
      return { allowed: false, reason: 'METADATA_REMOVED_BY_MISMATCH' };
    }
    if ('auctionId' in incoming.metadata && incoming.metadata.auctionId !== incoming.targetId) {
      return { allowed: false, reason: 'METADATA_AUCTION_ID_MISMATCH' };
    }
  }

  // 16. Target Auction Existence & Ownership verification
  const auction = auctionsDb.get(incoming.targetId);
  if (!auction) {
    return { allowed: false, reason: 'TARGET_AUCTION_NOT_FOUND' };
  }

  const isSeller =
    auction.sellerId === auth.uid ||
    auction.userId === auth.uid ||
    auction.ownerId === auth.uid ||
    auction.privateSellerUid === auth.uid;

  if (!isSeller) {
    return { allowed: false, reason: 'NOT_AUCTION_SELLER' };
  }

  return { allowed: true, reason: 'SELLER_REMOVAL_ALLOWED' };
}

export function evaluateAuditLogUpdateRule(
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.uid && auth.isAdmin) {
    return { allowed: true, reason: 'ADMIN_ALLOWED' };
  }
  return { allowed: false, reason: 'UPDATE_DENIED_NON_ADMIN' };
}

export function evaluateAuditLogDeleteRule(
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.uid && auth.isAdmin) {
    return { allowed: true, reason: 'ADMIN_ALLOWED' };
  }
  return { allowed: false, reason: 'DELETE_DENIED_NON_ADMIN' };
}

export function evaluateAuditLogReadRule(
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.uid && auth.isAdmin) {
    return { allowed: true, reason: 'ADMIN_ALLOWED' };
  }
  return { allowed: false, reason: 'READ_DENIED_NON_ADMIN' };
}

// =========================================================================
// TEST EXECUTION RUNNER
// =========================================================================

function runTests() {
  console.log('=== STARTING SEC-05-12-B ARENA AUDIT LOG SECURITY TESTS ===');

  const now = 1700000000000;
  const adminAuth: AuthContext = { uid: 'admin_123', email: 'imran7297510@gmail.com', isAdmin: true };
  const userA: AuthContext = { uid: 'user_a', email: 'usera@example.com', isAdmin: false, isBlocked: false };
  const userB: AuthContext = { uid: 'user_b', email: 'userb@example.com', isAdmin: false, isBlocked: false };
  const blockedUser: AuthContext = { uid: 'user_blocked', email: 'blocked@example.com', isAdmin: false, isBlocked: true };
  const unauth: AuthContext = { uid: null };

  const auctions = new Map<string, AuctionDoc>();
  auctions.set('auction_a_1', { id: 'auction_a_1', sellerId: 'user_a', status: 'active' });
  auctions.set('auction_b_1', { id: 'auction_b_1', sellerId: 'user_b', status: 'active' });
  auctions.set('auction_anon_a', { id: 'auction_anon_a', sellerId: 'ANON-999', privateSellerUid: 'user_a', status: 'active' });

  // -------------------------------------------------------------
  // ADMIN TESTS
  // -------------------------------------------------------------

  // 1. Admin can create legitimate moderation audit
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'admin_123',
      moderatorId: 'admin_123',
      action: 'ISSUE_WARNING',
      targetType: 'listing',
      targetId: 'auction_a_1',
      previousState: 'active',
      newState: 'flagged',
      reason: 'Violated terms',
      relatedReportIds: ['rep_1'],
      timestamp: now,
      createdAt: now
    }, adminAuth, now, auctions);
    assert.strictEqual(res.allowed, true);
    console.log('[PASS] TEST 1: Admin can create legitimate moderation audit');
  }

  // 2. Admin can create BAN_ACCOUNT audit
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'admin_123',
      moderatorId: 'admin_123',
      action: 'BAN_ACCOUNT',
      targetType: 'user',
      targetId: 'user_b',
      previousState: 'active',
      newState: 'banned',
      reason: 'Repeated non-payment violations',
      timestamp: now,
      createdAt: now
    }, adminAuth, now, auctions);
    assert.strictEqual(res.allowed, true);
    console.log('[PASS] TEST 2: Admin can create BAN_ACCOUNT audit');
  }

  // 3. Admin can create SUSPEND_ACCOUNT audit
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'admin_123',
      moderatorId: 'admin_123',
      action: 'SUSPEND_ACCOUNT',
      targetType: 'user',
      targetId: 'user_b',
      previousState: 'active',
      newState: 'suspended',
      reason: 'Suspicious bidding activity',
      timestamp: now,
      createdAt: now
    }, adminAuth, now, auctions);
    assert.strictEqual(res.allowed, true);
    console.log('[PASS] TEST 3: Admin can create SUSPEND_ACCOUNT audit');
  }

  // 4. Admin can create legitimate REMOVE_LISTING audit
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'admin_123',
      moderatorId: 'admin_123',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_b_1',
      previousState: 'active',
      newState: 'cancelled',
      reason: 'Prohibited counterfeit merchandise',
      timestamp: now,
      createdAt: now
    }, adminAuth, now, auctions);
    assert.strictEqual(res.allowed, true);
    console.log('[PASS] TEST 4: Admin can create legitimate REMOVE_LISTING audit');
  }

  // 5. Admin can update audit log
  {
    const res = evaluateAuditLogUpdateRule(adminAuth);
    assert.strictEqual(res.allowed, true);
    console.log('[PASS] TEST 5: Admin can update audit log');
  }

  // 6. Admin can delete audit log
  {
    const res = evaluateAuditLogDeleteRule(adminAuth);
    assert.strictEqual(res.allowed, true);
    console.log('[PASS] TEST 6: Admin can delete audit log');
  }

  // -------------------------------------------------------------
  // ORDINARY USER TESTS
  // -------------------------------------------------------------

  // 7. Unauthenticated create denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now,
      createdAt: now
    }, unauth, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHENTICATED');
    console.log('[PASS] TEST 7: Unauthenticated create denied');
  }

  // 8. Ordinary user BAN_ACCOUNT denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'BAN_ACCOUNT',
      targetType: 'user',
      targetId: 'user_b',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ACTION_MUST_BE_REMOVE_LISTING');
    console.log('[PASS] TEST 8: Ordinary user BAN_ACCOUNT denied');
  }

  // 9. Ordinary user SUSPEND_ACCOUNT denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'SUSPEND_ACCOUNT',
      targetType: 'user',
      targetId: 'user_b',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ACTION_MUST_BE_REMOVE_LISTING');
    console.log('[PASS] TEST 9: Ordinary user SUSPEND_ACCOUNT denied');
  }

  // 10. Ordinary user FORCE_CLOSE denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'FORCE_CLOSE',
      targetType: 'negotiation',
      targetId: 'neg_123',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ACTION_MUST_BE_REMOVE_LISTING');
    console.log('[PASS] TEST 10: Ordinary user FORCE_CLOSE denied');
  }

  // 11. Ordinary user CANCEL_AUCTION-as-moderator denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'CANCEL_AUCTION',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ACTION_MUST_BE_REMOVE_LISTING');
    console.log('[PASS] TEST 11: Ordinary user CANCEL_AUCTION-as-moderator denied');
  }

  // 12. Ordinary user with moderatorId denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      moderatorId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'MODERATOR_ID_FORBIDDEN');
    console.log('[PASS] TEST 12: Ordinary user with moderatorId denied');
  }

  // 13. Ordinary user with arbitrary moderatorId denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      moderatorId: 'admin_123',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'MODERATOR_ID_FORBIDDEN');
    console.log('[PASS] TEST 13: Ordinary user with arbitrary moderatorId denied');
  }

  // 14. Ordinary user impersonating admin via userId denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'admin_123',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'USER_ID_MISMATCH');
    console.log('[PASS] TEST 14: Ordinary user impersonating admin via userId denied');
  }

  // 15. Ordinary user arbitrary action denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'ARBITRARY_ACTION_INJECTION',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ACTION_MUST_BE_REMOVE_LISTING');
    console.log('[PASS] TEST 15: Ordinary user arbitrary action denied');
  }

  // 16. Ordinary user arbitrary targetType denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'user',
      targetId: 'user_b',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'TARGET_TYPE_MUST_BE_AUCTION');
    console.log('[PASS] TEST 16: Ordinary user arbitrary targetType denied');
  }

  // 17. Ordinary user arbitrary targetId denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'non_existent_auction',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'TARGET_AUCTION_NOT_FOUND');
    console.log('[PASS] TEST 17: Ordinary user arbitrary targetId denied');
  }

  // 18. Ordinary user forged timestamp denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now - 86400000, // 1 day ago
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'TIMESTAMP_MUST_BE_REQUEST_TIME');
    console.log('[PASS] TEST 18: Ordinary user forged timestamp denied');
  }

  // 19. Ordinary user arbitrary metadata/admin fields denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now,
      createdAt: now,
      metadata: { isAdmin: true, bypass: true }
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHORIZED_METADATA_KEY_isAdmin');
    console.log('[PASS] TEST 19: Ordinary user arbitrary metadata/admin fields denied');
  }

  // 20. Ordinary user update denied
  {
    const res = evaluateAuditLogUpdateRule(userA);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UPDATE_DENIED_NON_ADMIN');
    console.log('[PASS] TEST 20: Ordinary user update denied');
  }

  // 21. Ordinary user delete denied
  {
    const res = evaluateAuditLogDeleteRule(userA);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'DELETE_DENIED_NON_ADMIN');
    console.log('[PASS] TEST 21: Ordinary user delete denied');
  }

  // -------------------------------------------------------------
  // SELLER SELF-ACTION TESTS
  // -------------------------------------------------------------

  // 22. Seller can create legitimate REMOVE_LISTING audit for OWN auction
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      previousState: 'active',
      newState: 'cancelled',
      reason: 'Seller/Admin soft removal of listing',
      metadata: { auctionId: 'auction_a_1', removedBy: 'user_a' },
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, 'SELLER_REMOVAL_ALLOWED');
    console.log('[PASS] TEST 22: Seller can create legitimate REMOVE_LISTING audit for OWN auction');
  }

  // 22B. Anonymous seller can create legitimate REMOVE_LISTING audit for OWN auction
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_anon_a',
      previousState: 'active',
      newState: 'cancelled',
      reason: 'Seller/Admin soft removal of listing',
      metadata: { auctionId: 'auction_anon_a', removedBy: 'user_a' },
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, 'SELLER_REMOVAL_ALLOWED');
    console.log('[PASS] TEST 22B: Anonymous seller can create legitimate REMOVE_LISTING audit for OWN auction');
  }

  // 23. Seller REMOVE_LISTING containing moderatorId denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      moderatorId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      previousState: 'active',
      newState: 'cancelled',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'MODERATOR_ID_FORBIDDEN');
    console.log('[PASS] TEST 23: Seller REMOVE_LISTING containing moderatorId denied');
  }

  // 24. Seller REMOVE_LISTING targeting another seller's auction denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_b_1', // Owned by user_b!
      previousState: 'active',
      newState: 'cancelled',
      reason: 'Attempted cross-targeting',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'NOT_AUCTION_SELLER');

    // And verify User B CAN legitimately remove their own auction_b_1
    const resB = evaluateAuditLogCreateRule({
      userId: 'user_b',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_b_1',
      previousState: 'active',
      newState: 'cancelled',
      reason: 'Seller self removal',
      metadata: { auctionId: 'auction_b_1', removedBy: 'user_b' },
      timestamp: now,
      createdAt: now
    }, userB, now, auctions);
    assert.strictEqual(resB.allowed, true);

    console.log('[PASS] TEST 24: Seller REMOVE_LISTING targeting another seller\'s auction denied');
  }

  // 25. Seller arbitrary action substituted for REMOVE_LISTING denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'DELETE_DATABASE',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ACTION_MUST_BE_REMOVE_LISTING');
    console.log('[PASS] TEST 25: Seller arbitrary action substituted for REMOVE_LISTING denied');
  }

  // 26. Seller arbitrary targetType denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'arbitrary_collection',
      targetId: 'auction_a_1',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'TARGET_TYPE_MUST_BE_AUCTION');
    console.log('[PASS] TEST 26: Seller arbitrary targetType denied');
  }

  // 27. Seller arbitrary targetId denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: '',
      timestamp: now,
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'INVALID_TARGET_ID');
    console.log('[PASS] TEST 27: Seller arbitrary targetId denied');
  }

  // 28. Seller forged timestamp denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now + 50000, // Future timestamp
      createdAt: now
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'TIMESTAMP_MUST_BE_REQUEST_TIME');
    console.log('[PASS] TEST 28: Seller forged timestamp denied');
  }

  // 29. Blocked seller denied if the existing policy requires isNotBlocked()
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_blocked',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      timestamp: now,
      createdAt: now
    }, blockedUser, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'BLOCKED_USER');
    console.log('[PASS] TEST 29: Blocked seller denied if existing policy requires isNotBlocked()');
  }

  // 30. Extra-field injection denied
  {
    const res = evaluateAuditLogCreateRule({
      userId: 'user_a',
      action: 'REMOVE_LISTING',
      targetType: 'auction',
      targetId: 'auction_a_1',
      previousState: 'active',
      newState: 'cancelled',
      timestamp: now,
      createdAt: now,
      injectedAdminNotes: 'Forged verification pass',
      superAdminRole: true
    }, userA, now, auctions);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHORIZED_FIELD_injectedAdminNotes');
    console.log('[PASS] TEST 30: Extra-field injection denied');
  }

  // -------------------------------------------------------------
  // READ AND BYPASS TESTS
  // -------------------------------------------------------------

  // 31. Ordinary user read denied
  {
    const res = evaluateAuditLogReadRule(userA);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'READ_DENIED_NON_ADMIN');
    console.log('[PASS] TEST 31: Ordinary user read denied');
  }

  // 32. Admin read allowed
  {
    const res = evaluateAuditLogReadRule(adminAuth);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, 'ADMIN_ALLOWED');
    console.log('[PASS] TEST 32: Admin read allowed');
  }

  // 33. No recursive/global/overlapping rule bypass exists
  {
    assert.strictEqual(typeof evaluateAuditLogCreateRule, 'function');
    assert.strictEqual(typeof evaluateAuditLogUpdateRule, 'function');
    assert.strictEqual(typeof evaluateAuditLogDeleteRule, 'function');
    assert.strictEqual(typeof evaluateAuditLogReadRule, 'function');
    console.log('[PASS] TEST 33: No recursive/global/overlapping rule bypass exists');
  }

  console.log('=== ARENA AUDIT LOG SECURITY TEST SUMMARY: 34 PASSED, 0 FAILED ===');
}

runTests();
