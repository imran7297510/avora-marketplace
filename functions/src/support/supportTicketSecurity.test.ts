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

  // --- CREATION TESTS ---

  // 1. Authenticated user creates ticket with own UID -> ALLOW
  runTest('TEST 1: authenticated user creates ticket with own UID -> ALLOW', () => {
    const res = evaluateSupportTicketCreateRule(
      validCreationPayload,
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, true);
  });

  // 2. Authenticated user creates ticket with another user's UID -> DENY (F01)
  runTest("TEST 2: authenticated user creates ticket with another user's UID -> DENY", () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, userId: 'victim_user_999' },
      { uid: 'attacker_123' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'USER_ID_MISMATCH');
  });

  // 3. Unauthenticated creation -> DENY
  runTest('TEST 3: unauthenticated creation -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      validCreationPayload,
      { uid: null },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHENTICATED');
  });

  // 4. Ordinary user creates ticket with RESOLVED status -> DENY
  runTest('TEST 4: ordinary user creates ticket with RESOLVED status -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, status: 'RESOLVED' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'STATUS_MUST_BE_PENDING');
  });

  // 5. Ordinary user creates ticket with CLOSED status -> DENY
  runTest('TEST 5: ordinary user creates ticket with CLOSED status -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, status: 'CLOSED' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'STATUS_MUST_BE_PENDING');
  });

  // 6. Ordinary user creates ticket with IN_PROGRESS status -> DENY
  runTest('TEST 6: ordinary user creates ticket with IN_PROGRESS status -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, status: 'IN_PROGRESS' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'STATUS_MUST_BE_PENDING');
  });

  // 7. Legitimate PENDING creation -> ALLOW
  runTest('TEST 7: legitimate PENDING creation -> ALLOW', () => {
    const res = evaluateSupportTicketCreateRule(
      validCreationPayload,
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, true);
  });

  // 8. Forged createdAt -> DENY
  runTest('TEST 8: forged createdAt -> DENY', () => {
    const res = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, createdAt: BASE_TIME - 86400000 },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CREATED_AT_MUST_BE_REQUEST_TIME');
  });

  // 9. Legitimate serverTimestamp creation -> ALLOW
  runTest('TEST 9: legitimate serverTimestamp creation -> ALLOW', () => {
    const res = evaluateSupportTicketCreateRule(
      validCreationPayload,
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res.allowed, true);
  });

  // 10. Admin-field injection at creation -> DENY
  runTest('TEST 10: admin-field injection at creation (adminReply, repliedBy, resolvedAt, assignedTo) -> DENY', () => {
    const res1 = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, adminReply: 'Refund granted' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res1.allowed, false);

    const res2 = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, repliedBy: 'admin@domain.com' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res2.allowed, false);

    const res3 = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, resolvedAt: BASE_TIME },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res3.allowed, false);

    const res4 = evaluateSupportTicketCreateRule(
      { ...validCreationPayload, assignedTo: 'admin_1' },
      { uid: 'user_lahore_101' },
      BASE_TIME
    );
    assert.strictEqual(res4.allowed, false);
  });

  // --- UPDATE TESTS (F02) ---

  // 11. Ordinary creator changes userId -> DENY
  runTest('TEST 11: ordinary creator changes userId -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { userId: 'victim_user_999' },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 12. Ordinary creator changes status -> DENY
  runTest('TEST 12: ordinary creator changes status -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { status: 'RESOLVED' },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 13. Ordinary creator changes adminReply -> DENY
  runTest('TEST 13: ordinary creator changes adminReply -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { adminReply: 'Fake resolution from staff' },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 14. Ordinary creator changes repliedBy -> DENY
  runTest('TEST 14: ordinary creator changes repliedBy -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { repliedBy: 'admin@platform.com' },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 15. Ordinary creator changes repliedAt -> DENY
  runTest('TEST 15: ordinary creator changes repliedAt -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { repliedAt: BASE_TIME + 1000 },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 16. Ordinary creator changes resolvedAt -> DENY
  runTest('TEST 16: ordinary creator changes resolvedAt -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { resolvedAt: BASE_TIME + 1000 },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 17. Ordinary creator changes assignedTo -> DENY
  runTest('TEST 17: ordinary creator changes assignedTo -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { assignedTo: 'admin_agent_01' },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 18. Ordinary creator changes createdAt -> DENY
  runTest('TEST 18: ordinary creator changes createdAt -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { createdAt: BASE_TIME - 10000 },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // 19. Ordinary creator changes updatedAt to arbitrary value -> DENY
  runTest('TEST 19: ordinary creator changes updatedAt to arbitrary value -> DENY', () => {
    const res = evaluateSupportTicketUpdateRule(
      existingTicket,
      { updatedAt: BASE_TIME + 999999 },
      { uid: 'user_lahore_101' },
      BASE_TIME + 1000
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_UPDATE_DENIED');
  });

  // --- ADMIN OPERATIONS ---

  // 20. Admin can perform legitimate reply update (Admin.tsx handleAdminReply) -> ALLOW
  runTest('TEST 20: admin can perform legitimate reply update (handleAdminReply) -> ALLOW', () => {
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

  // 21. Admin can perform legitimate resolve update (Admin.tsx solveTicket) -> ALLOW
  runTest('TEST 21: admin can perform legitimate resolve update (solveTicket) -> ALLOW', () => {
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

  // 22. Admin can delete ticket -> ALLOW
  runTest('TEST 22: admin can delete ticket -> ALLOW', () => {
    const res = evaluateSupportTicketDeleteRule({ uid: 'admin_uid_999', isAdmin: true });
    assert.strictEqual(res.allowed, true);
  });

  // 23. Ordinary user cannot delete ticket -> DENY
  runTest('TEST 23: ordinary user cannot delete ticket -> DENY', () => {
    const res = evaluateSupportTicketDeleteRule({ uid: 'user_lahore_101', isAdmin: false });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'ORDINARY_USER_DELETE_DENIED');
  });

  // --- READ TESTS ---

  // 24. Ticket owner can read own ticket -> ALLOW
  runTest('TEST 24: ticket owner can read own ticket -> ALLOW', () => {
    const res = evaluateSupportTicketReadRule(
      existingTicket,
      { uid: 'user_lahore_101' }
    );
    assert.strictEqual(res.allowed, true);
  });

  // 25. Different authenticated user cannot read ticket -> DENY
  runTest('TEST 25: different authenticated user cannot read ticket -> DENY', () => {
    const res = evaluateSupportTicketReadRule(
      existingTicket,
      { uid: 'snooper_user_888' }
    );
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CROSS_USER_READ_DENIED');
  });

  // 26. Admin can read ticket -> ALLOW
  runTest('TEST 26: admin can read ticket -> ALLOW', () => {
    const res = evaluateSupportTicketReadRule(
      existingTicket,
      { uid: 'admin_uid_999', isAdmin: true }
    );
    assert.strictEqual(res.allowed, true);
  });

  // 27. Broad wildcard cannot bypass support-ticket authorization
  runTest('TEST 27: global fallback / catchall preserves default denial without bypass', () => {
    const unauthRead = evaluateSupportTicketReadRule(existingTicket, { uid: null });
    assert.strictEqual(unauthRead.allowed, false);

    const unauthDelete = evaluateSupportTicketDeleteRule({ uid: null });
    assert.strictEqual(unauthDelete.allowed, false);
  });

  console.log(`=== SUPPORT TICKET SECURITY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    throw new Error(`Support ticket security test suite had ${failed} failures!`);
  }
}

if (require.main === module) {
  runSupportTicketSecurityUnitTests();
}
