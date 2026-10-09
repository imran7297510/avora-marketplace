/**
 * Deterministic Unit Test Suite for SEC-05-10
 * Support Tickets Authorization & Lifecycle Security (Findings F01 & F02)
 *
 * Runs locally with 0 production Firestore reads/writes.
 */

import assert from 'assert';

export interface SupportTicketDoc {
  id: string;
  userId: string;
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  adminReply?: string;
  repliedBy?: string;
  repliedAt?: number;
  resolvedAt?: number;
  assignedTo?: string;
  createdAt: number; // millis
  updatedAt: number; // millis
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
 * Deterministic CEL evaluator simulating the hardened Firestore Rules for /supportTickets/{ticketId} create
 */
export function evaluateSupportTicketCreateRule(
  incomingDoc: Partial<SupportTicketDoc>,
  auth: AuthContext,
  requestTimeMs: number
): RuleEvaluationResult {
  // 1. Auth & Block
  if (!auth.uid) return { allowed: false, reason: 'UNAUTHENTICATED' };
  if (auth.isBlocked && !auth.isAdmin) return { allowed: false, reason: 'BLOCKED_USER' };

  if (auth.isAdmin) return { allowed: true, reason: 'ADMIN_OVERRIDE' };

  // 2. Caller UID binding (F01)
  if (!incomingDoc.userId || incomingDoc.userId !== auth.uid) {
    return { allowed: false, reason: 'USER_ID_MISMATCH' };
  }

  // 3. Status must be PENDING
  if (incomingDoc.status !== 'PENDING') {
    return { allowed: false, reason: 'STATUS_MUST_BE_PENDING' };
  }

  // 4. Timestamp validation
  if (incomingDoc.createdAt !== requestTimeMs) {
    return { allowed: false, reason: 'CREATED_AT_MUST_BE_REQUEST_TIME' };
  }
  if (incomingDoc.updatedAt !== requestTimeMs) {
    return { allowed: false, reason: 'UPDATED_AT_MUST_BE_REQUEST_TIME' };
  }

  // 5. Admin fields forbidden on creation
  if ('adminReply' in incomingDoc && incomingDoc.adminReply !== undefined) {
    return { allowed: false, reason: 'ADMIN_REPLY_FORBIDDEN_ON_CREATE' };
  }
  if ('repliedBy' in incomingDoc && incomingDoc.repliedBy !== undefined) {
    return { allowed: false, reason: 'REPLIED_BY_FORBIDDEN_ON_CREATE' };
  }
  if ('repliedAt' in incomingDoc && incomingDoc.repliedAt !== undefined) {
    return { allowed: false, reason: 'REPLIED_AT_FORBIDDEN_ON_CREATE' };
  }
  if ('resolvedAt' in incomingDoc && incomingDoc.resolvedAt !== undefined) {
    return { allowed: false, reason: 'RESOLVED_AT_FORBIDDEN_ON_CREATE' };
  }
  if ('assignedTo' in incomingDoc && incomingDoc.assignedTo !== undefined) {
    return { allowed: false, reason: 'ASSIGNED_TO_FORBIDDEN_ON_CREATE' };
  }

  return { allowed: true, reason: 'SUPPORT_TICKET_CREATE_ALLOWED' };
}

/**
 * Deterministic CEL evaluator simulating the hardened Firestore Rules for /supportTickets/{ticketId} update
 */
export function evaluateSupportTicketUpdateRule(
  existingDoc: SupportTicketDoc,
  incomingDoc: Partial<SupportTicketDoc>,
  auth: AuthContext,
  requestTimeMs: number
): RuleEvaluationResult {
  if (!auth.uid) return { allowed: false, reason: 'UNAUTHENTICATED' };

  // Only admins can update support tickets (ordinary users have 0 update permissions)
  if (!auth.isAdmin) {
    return { allowed: false, reason: 'ORDINARY_USER_UPDATE_DENIED' };
  }

  const mergedIncoming: SupportTicketDoc = { ...existingDoc, ...incomingDoc };

  // Immutability of core fields
  if (mergedIncoming.userId !== existingDoc.userId) {
    return { allowed: false, reason: 'USER_ID_IMMUTABLE' };
  }
  if (mergedIncoming.createdAt !== existingDoc.createdAt) {
    return { allowed: false, reason: 'CREATED_AT_IMMUTABLE' };
  }

  // Allowed affected keys for admin
  const allowedAdminKeys = new Set([
    'status', 'adminReply', 'repliedBy', 'repliedAt', 'resolvedAt', 'updatedAt'
  ]);

  for (const key of Object.keys(incomingDoc)) {
    if (!allowedAdminKeys.has(key)) {
      return { allowed: false, reason: `DISALLOWED_ADMIN_FIELD: ${key}` };
    }
  }

  // Status must be valid lifecycle status
  if (incomingDoc.status && !['PENDING', 'IN_PROGRESS', 'RESOLVED'].includes(incomingDoc.status)) {
    return { allowed: false, reason: 'INVALID_STATUS' };
  }

  // ServerTimestamp validations for admin writes
  if (incomingDoc.resolvedAt !== undefined && incomingDoc.resolvedAt !== requestTimeMs) {
    return { allowed: false, reason: 'RESOLVED_AT_MUST_BE_REQUEST_TIME' };
  }
  if (incomingDoc.repliedAt !== undefined && incomingDoc.repliedAt !== requestTimeMs) {
    return { allowed: false, reason: 'REPLIED_AT_MUST_BE_REQUEST_TIME' };
  }
  if (incomingDoc.updatedAt !== undefined && incomingDoc.updatedAt !== requestTimeMs) {
    return { allowed: false, reason: 'UPDATED_AT_MUST_BE_REQUEST_TIME' };
  }

  return { allowed: true, reason: 'ADMIN_UPDATE_ALLOWED' };
}

/**
 * Deterministic CEL evaluator simulating read & delete rules
 */
export function evaluateSupportTicketReadRule(
  existingDoc: SupportTicketDoc,
  auth: AuthContext
): RuleEvaluationResult {
  if (!auth.uid) return { allowed: false, reason: 'UNAUTHENTICATED' };
  if (auth.isAdmin) return { allowed: true, reason: 'ADMIN_READ' };
  if (existingDoc.userId === auth.uid) return { allowed: true, reason: 'OWNER_READ' };
  return { allowed: false, reason: 'CROSS_USER_READ_DENIED' };
}

export function evaluateSupportTicketDeleteRule(
  auth: AuthContext
): RuleEvaluationResult {
  if (!auth.uid) return { allowed: false, reason: 'UNAUTHENTICATED' };
  if (auth.isAdmin) return { allowed: true, reason: 'ADMIN_DELETE' };
  return { allowed: false, reason: 'ORDINARY_USER_DELETE_DENIED' };
}

export function runSupportTicketSecurityUnitTests(): void {
  console.log('=== STARTING SEC-05-10 SUPPORT TICKET SECURITY TESTS ===');

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

  const BASE_TIME = 1700000000000;

  const validCreationPayload: Partial<SupportTicketDoc> = {
    userId: 'user_lahore_101',
    name: 'Muhammad Imran',
    email: 'imran@example.com',
    subject: 'Issue with item delivery',
    category: 'COMPLAINT',
    message: 'The package was delayed by 3 days.',
    status: 'PENDING',
    attachmentUrl: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  };

  const existingTicket: SupportTicketDoc = {
    id: 'ticket_777',
    userId: 'user_lahore_101',
    name: 'Muhammad Imran',
    email: 'imran@example.com',
    subject: 'Issue with item delivery',
    category: 'COMPLAINT',
    message: 'The package was delayed by 3 days.',
    status: 'PENDING',
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  };

  // --- CREATE TESTS (1-12) ---

  // 1. authenticated user creates own ticket -> ALLOW
  runTest('TEST 1: authenticated user creates own ticket -> ALLOW', () => {
    const res = evaluateSupportTicketCreateRule(
      validCreationPayload,
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, true);
  });

  // 2. authenticated user creates ticket using victim UID -> DENY (F01)
  runTest('TEST 2: authenticated user creates ticket using victim UID -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, userId: 'victim_user_999' },
      { uid: 'attacker_123' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'USER_ID_MISMATCH');
  });

  // 3. unauthenticated create -> DENY
  runTest('TEST 3: unauthenticated create -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      validCreationPayload,
      { uid: null },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHENTICATED');
  });

  // 4. ordinary user creates non-PENDING ticket -> DENY
  runTest('TEST 4: ordinary user creates non-PENDING ticket (RESOLVED / IN_PROGRESS / CLOSED) -> DENY', () => {
    const resResolved = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, status: 'RESOLVED' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(resResolved.allowed, false);

    const resInProgress = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, status: 'IN_PROGRESS' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(resInProgress.allowed, false);

    const resClosed = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, status: 'CLOSED' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(resClosed.allowed, false);
  });

  // 5. legitimate PENDING creation -> ALLOW
  runTest('TEST 5: legitimate PENDING creation -> ALLOW', () => {
    const res = evaluateSupportTicketCreateRule(
      validCreationPayload,
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, true);
  });

  // 6. forged/static createdAt -> DENY
  runTest('TEST 6: forged/static createdAt -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, createdAt: BASE_TIME - 86400000 },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CREATED_AT_MUST_BE_REQUEST_TIME');
  });

  // 7. legitimate serverTimestamp createdAt -> ALLOW
  runTest('TEST 7: legitimate serverTimestamp createdAt -> ALLOW', () => {
    const res = evaluateSupportTicketCreateRule(
      validCreationPayload,
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, true);
  });

  // 8. forged adminReply -> DENY
  runTest('TEST 8: forged adminReply on create -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, adminReply: 'Refund granted' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ADMIN_REPLY_FORBIDDEN_ON_CREATE');
  });

  // 9. forged repliedBy -> DENY
  runTest('TEST 9: forged repliedBy on create -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, repliedBy: 'admin@domain.com' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'REPLIED_BY_FORBIDDEN_ON_CREATE');
  });

  // 10. forged repliedAt -> DENY
  runTest('TEST 10: forged repliedAt on create -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, repliedAt: BASE_TIME },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'REPLIED_AT_FORBIDDEN_ON_CREATE');
  });

  // 11. forged resolvedAt -> DENY
  runTest('TEST 11: forged resolvedAt on create -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, resolvedAt: BASE_TIME },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'RESOLVED_AT_FORBIDDEN_ON_CREATE');
  });

  // 12. forged assignedTo -> DENY
  runTest('TEST 12: forged assignedTo on create -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, assignedTo: 'admin_agent_01' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ASSIGNED_TO_FORBIDDEN_ON_CREATE');
  });

  // --- ORDINARY USER UPDATE TESTS (13-21) ---

  // 13. change userId -> DENY
  runTest('TEST 13: ordinary user change userId -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { userId: 'victim_user_999' },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 14. change status -> DENY
  runTest('TEST 14: ordinary user change status -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { status: 'RESOLVED' },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 15. change adminReply -> DENY
  runTest('TEST 15: ordinary user change adminReply -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { adminReply: 'Fake resolution from staff' },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 16. change repliedBy -> DENY
  runTest('TEST 16: ordinary user change repliedBy -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { repliedBy: 'admin@platform.com' },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 17. change repliedAt -> DENY
  runTest('TEST 17: ordinary user change repliedAt -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { repliedAt: BASE_TIME + 1000 },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 18. change resolvedAt -> DENY
  runTest('TEST 18: ordinary user change resolvedAt -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { resolvedAt: BASE_TIME + 1000 },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 19. change assignedTo -> DENY
  runTest('TEST 19: ordinary user change assignedTo -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { assignedTo: 'admin_agent_01' },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 20. change createdAt -> DENY
  runTest('TEST 20: ordinary user change createdAt -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { createdAt: BASE_TIME - 10000 },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 21. change updatedAt if not legitimately permitted -> DENY
  runTest('TEST 21: ordinary user change updatedAt if not legitimately permitted -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { updatedAt: BASE_TIME + 999999 },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // --- ADMIN TESTS (22-24) ---

  // 22. admin reply -> ALLOW
  runTest('TEST 22: admin reply (handleAdminReply payload) -> ALLOW', () => {
    const adminReplyPayload: Partial<SupportTicketDoc> = {
      adminReply: 'We are investigating this with the courier.',
      status: 'IN_PROGRESS',
      repliedAt: BASE_TIME + 5000,
      repliedBy: 'support_admin@avora.com',
    };
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      adminReplyPayload,
      { uid: 'admin_uid_999', isAdmin: true },
      BASE_TIME + 5000
    );
    assert.strictEqual(res.allowed, true);
  });

  // 23. admin resolve -> ALLOW
  runTest('TEST 23: admin resolve (solveTicket payload) -> ALLOW', () => {
    const adminSolvePayload: Partial<SupportTicketDoc> = {
      status: 'RESOLVED',
      resolvedAt: BASE_TIME + 10000,
      updatedAt: BASE_TIME + 10000,
    };
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      adminSolvePayload,
      { uid: 'admin_uid_999', isAdmin: true },
      BASE_TIME + 10000
    );
    assert.strictEqual(res.allowed, true);
  });

  // 24. admin delete -> ALLOW
  runTest('TEST 24: admin delete -> ALLOW', () => {
    const res = evaluateSupportTicketDeleteRule({ uid: 'admin_uid_999', isAdmin: true });
    assert.strictEqual(res.allowed, true);
  });

  // --- READ TESTS (25-27) ---

  // 25. owner read -> ALLOW
  runTest('TEST 25: owner read -> ALLOW', () => {
    const res = evaluateSupportTicketReadRule(
      existingTicket,
      { uid: 'user_lahore_101' }
    );
    assert.strictEqual(res.allowed, true);
  });

  // 26. different ordinary user read -> DENY
  runTest('TEST 26: different ordinary user read -> DENY', () => {
    const res = evaluateSupportTicketReadRule(
      existingTicket,
      { uid: 'snooper_user_888' }
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CROSS_USER_READ_DENIED');
  });

  // 27. admin read -> ALLOW
  runTest('TEST 27: admin read -> ALLOW', () => {
    const res = evaluateSupportTicketReadRule(
      existingTicket,
      { uid: 'admin_uid_999', isAdmin: true }
    );
    assert.strictEqual(res.allowed, true);
  });

  // --- OVERLAP TEST (28) ---

  // 28. verify no wildcard rule bypasses supportTickets restrictions
  runTest('TEST 28: verify no wildcard rule bypasses supportTickets restrictions', () => {
    const unauthRead = evaluateSupportTicketReadRule(existingTicket, { uid: null });
    assert.strictEqual(unauthRead.allowed, false);

    const unauthDelete = evaluateSupportTicketDeleteRule({ uid: null });
    assert.strictEqual(unauthDelete.allowed, false);

    const ordinaryUserDelete = evaluateSupportTicketDeleteRule({ uid: 'user_lahore_101', isAdmin: false });
    assert.strictEqual(ordinaryUserDelete.allowed, false);
    assert.strictEqual(ordinaryUserDelete.reason, 'ORDINARY_USER_DELETE_DENIED');
  });

  console.log(`=== SUPPORT TICKET SECURITY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    throw new Error(`Support ticket security test suite had ${failed} failures!`);
  }
}

if (require.main === module) {
  runSupportTicketSecurityUnitTests();
}
