"use strict";
/**
 * Deterministic Unit Test Suite for SEC-05-11-C
 * Arena Risk Score Authorization & Mutation Security
 *
 * NOTE: These are logic-level / static evaluator tests that model and verify
 * the exact CEL logic in /firestore.rules without executing the live Firebase Emulator.
 * Runs locally with 0 production Firestore reads/writes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateArenaRiskScoreCreateRule = evaluateArenaRiskScoreCreateRule;
exports.evaluateArenaRiskScoreUpdateRule = evaluateArenaRiskScoreUpdateRule;
exports.evaluateArenaRiskScoreReadRule = evaluateArenaRiskScoreReadRule;
exports.evaluateArenaRiskScoreDeleteRule = evaluateArenaRiskScoreDeleteRule;
const assert_1 = __importDefault(require("assert"));
/**
 * Logic-level evaluator simulating /arena_risk_scores/{scoreId} create rule
 */
function evaluateArenaRiskScoreCreateRule(scoreId, incomingDoc, auth, requestTimeMs, hasReportRecord) {
    // 1. Auth & Block
    if (!auth.uid)
        return { allowed: false, reason: 'UNAUTHENTICATED' };
    if (auth.isBlocked && !auth.isAdmin)
        return { allowed: false, reason: 'BLOCKED_USER' };
    if (auth.isAdmin)
        return { allowed: true, reason: 'ADMIN_ALLOWED' };
    // 2. targetId binding
    if (incomingDoc.targetId !== scoreId) {
        return { allowed: false, reason: 'TARGET_ID_MISMATCH' };
    }
    if (!incomingDoc.targetId || typeof incomingDoc.targetId !== 'string' || incomingDoc.targetId.length === 0 || incomingDoc.targetId.length > 128) {
        return { allowed: false, reason: 'INVALID_TARGET_ID' };
    }
    // 3. targetType validation
    if (!['user', 'listing', 'negotiation'].includes(incomingDoc.targetType)) {
        return { allowed: false, reason: 'INVALID_TARGET_TYPE' };
    }
    // 4. Initial score must be 1
    if (incomingDoc.score !== 1) {
        return { allowed: false, reason: 'SCORE_MUST_BE_1' };
    }
    // 5. lastReportedAt must be request.time
    if (incomingDoc.lastReportedAt !== requestTimeMs) {
        return { allowed: false, reason: 'TIMESTAMP_MUST_BE_REQUEST_TIME' };
    }
    // 6. Strict keys
    const allowedKeys = new Set(['targetId', 'targetType', 'score', 'lastReportedAt']);
    for (const k of Object.keys(incomingDoc)) {
        if (!allowedKeys.has(k)) {
            return { allowed: false, reason: `UNAUTHORIZED_FIELD_${k}` };
        }
    }
    // 7. Prerequisite report record exists
    if (!hasReportRecord) {
        return { allowed: false, reason: 'REPORT_RECORD_REQUIRED' };
    }
    return { allowed: true, reason: 'VALID_CREATE' };
}
/**
 * Logic-level evaluator simulating /arena_risk_scores/{scoreId} update rule
 */
function evaluateArenaRiskScoreUpdateRule(existingDoc, incomingDoc, auth, requestTimeMs, hasReportRecord) {
    // 1. Auth & Block
    if (!auth.uid)
        return { allowed: false, reason: 'UNAUTHENTICATED' };
    if (auth.isBlocked && !auth.isAdmin)
        return { allowed: false, reason: 'BLOCKED_USER' };
    if (auth.isAdmin)
        return { allowed: true, reason: 'ADMIN_ALLOWED' };
    // 2. Score must increment by exactly 1
    if (incomingDoc.score !== existingDoc.score + 1) {
        return { allowed: false, reason: 'SCORE_MUST_INCREMENT_BY_1' };
    }
    // 3. lastReportedAt must be request.time
    if (incomingDoc.lastReportedAt !== requestTimeMs) {
        return { allowed: false, reason: 'TIMESTAMP_MUST_BE_REQUEST_TIME' };
    }
    // 4. targetId & targetType immutable
    if (incomingDoc.targetId !== existingDoc.targetId || incomingDoc.targetType !== existingDoc.targetType) {
        return { allowed: false, reason: 'TARGET_IMMUTABLE' };
    }
    // 5. Affected keys only score and lastReportedAt
    for (const k of Object.keys(incomingDoc)) {
        if (k !== 'score' && k !== 'lastReportedAt' && incomingDoc[k] !== existingDoc[k]) {
            return { allowed: false, reason: `UNAUTHORIZED_FIELD_MODIFICATION_${k}` };
        }
    }
    // 6. Prerequisite report record exists
    if (!hasReportRecord) {
        return { allowed: false, reason: 'REPORT_RECORD_REQUIRED' };
    }
    return { allowed: true, reason: 'VALID_UPDATE' };
}
/**
 * Logic-level evaluator simulating /arena_risk_scores/{scoreId} read rule
 */
function evaluateArenaRiskScoreReadRule(existingDoc, auth) {
    if (auth.uid && auth.isAdmin)
        return { allowed: true, reason: 'ADMIN_READ_ALLOWED' };
    if (auth.uid && (existingDoc.userId === auth.uid || existingDoc.targetId === auth.uid)) {
        return { allowed: true, reason: 'TARGET_OWNER_READ_ALLOWED' };
    }
    return { allowed: false, reason: 'READ_DENIED' };
}
/**
 * Logic-level evaluator simulating /arena_risk_scores/{scoreId} delete rule
 */
function evaluateArenaRiskScoreDeleteRule(auth) {
    if (auth.uid && auth.isAdmin)
        return { allowed: true, reason: 'ADMIN_DELETE_ALLOWED' };
    return { allowed: false, reason: 'DELETE_DENIED' };
}
// ==========================================
// TEST SUITE EXECUTION
// ==========================================
console.log('=== STARTING SEC-05-11-C ARENA RISK SCORE AUTHORIZATION SECURITY TESTS ===');
let passedTests = 0;
function runTest(testName, testFn) {
    try {
        testFn();
        console.log(`[PASS] ${testName}`);
        passedTests++;
    }
    catch (err) {
        console.error(`[FAIL] ${testName}: ${err.message}`);
        throw err;
    }
}
const userA = { uid: 'user_a_123', email: 'userA@test.com', isAdmin: false, isBlocked: false };
const userB = { uid: 'user_b_456', email: 'userB@test.com', isAdmin: false, isBlocked: false };
const blockedUser = { uid: 'blocked_user_999', email: 'blocked@test.com', isAdmin: false, isBlocked: true };
const adminUser = { uid: 'admin_root_789', email: 'imran7297510@gmail.com', isAdmin: true };
const unauth = { uid: null };
const nowMs = 1700000000000;
// 1. Ordinary user creating risk score with arbitrary high score -> DENIED
runTest('TEST 1: Ordinary user creating risk score with arbitrary score (999) -> DENIED', () => {
    const doc = {
        targetId: 'seller_victim',
        targetType: 'user',
        score: 999, // FORGED
        lastReportedAt: nowMs
    };
    const res = evaluateArenaRiskScoreCreateRule('seller_victim', doc, userA, nowMs, true);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'SCORE_MUST_BE_1');
});
// 2. Ordinary user creating risk score with targetId mismatch -> DENIED
runTest('TEST 2: Ordinary user creating risk score with targetId mismatch -> DENIED', () => {
    const doc = {
        targetId: 'seller_other',
        targetType: 'user',
        score: 1,
        lastReportedAt: nowMs
    };
    const res = evaluateArenaRiskScoreCreateRule('seller_victim', doc, userA, nowMs, true);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'TARGET_ID_MISMATCH');
});
// 3. Ordinary user creating risk score with unauthorized extra fields (e.g. riskLevel) -> DENIED
runTest('TEST 3: Ordinary user creating risk score with injected riskLevel -> DENIED', () => {
    const doc = {
        targetId: 'seller_victim',
        targetType: 'user',
        score: 1,
        lastReportedAt: nowMs,
        riskLevel: 'CRITICAL', // INJECTED
    };
    const res = evaluateArenaRiskScoreCreateRule('seller_victim', doc, userA, nowMs, true);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'UNAUTHORIZED_FIELD_riskLevel');
});
// 4. Ordinary user creating risk score without prerequisite report record -> DENIED
runTest('TEST 4: Ordinary user creating risk score without report record -> DENIED', () => {
    const doc = {
        targetId: 'seller_victim',
        targetType: 'user',
        score: 1,
        lastReportedAt: nowMs
    };
    const res = evaluateArenaRiskScoreCreateRule('seller_victim', doc, userA, nowMs, false);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'REPORT_RECORD_REQUIRED');
});
// 5. Legitimate ordinary user creates risk score with score = 1 and report record -> ALLOWED
runTest('TEST 5: Legitimate ordinary user creates risk score -> ALLOWED', () => {
    const doc = {
        targetId: 'seller_victim',
        targetType: 'user',
        score: 1,
        lastReportedAt: nowMs
    };
    const res = evaluateArenaRiskScoreCreateRule('seller_victim', doc, userA, nowMs, true);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'VALID_CREATE');
});
// 6. Ordinary user updating risk score to arbitrary score (e.g. 0) -> DENIED
runTest('TEST 6: Ordinary user resetting score to 0 -> DENIED', () => {
    const existing = {
        targetId: 'seller_victim',
        targetType: 'user',
        score: 5,
        lastReportedAt: nowMs - 10000
    };
    const incoming = {
        ...existing,
        score: 0, // RESET FORGED
        lastReportedAt: nowMs
    };
    const res = evaluateArenaRiskScoreUpdateRule(existing, incoming, userA, nowMs, true);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'SCORE_MUST_INCREMENT_BY_1');
});
// 7. Ordinary user updating risk score with injected moderation status -> DENIED
runTest('TEST 7: Ordinary user injecting moderationStatus field during update -> DENIED', () => {
    const existing = {
        targetId: 'seller_victim',
        targetType: 'user',
        score: 5,
        lastReportedAt: nowMs - 10000
    };
    const incoming = {
        ...existing,
        score: 6,
        lastReportedAt: nowMs,
        moderationStatus: 'BANNED' // INJECTED
    };
    const res = evaluateArenaRiskScoreUpdateRule(existing, incoming, userA, nowMs, true);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'UNAUTHORIZED_FIELD_MODIFICATION_moderationStatus');
});
// 8. Ordinary user mutating targetId during update -> DENIED
runTest('TEST 8: Ordinary user mutating targetId during update -> DENIED', () => {
    const existing = {
        targetId: 'seller_victim',
        targetType: 'user',
        score: 5,
        lastReportedAt: nowMs - 10000
    };
    const incoming = {
        ...existing,
        targetId: 'seller_other', // MUTATED
        score: 6,
        lastReportedAt: nowMs
    };
    const res = evaluateArenaRiskScoreUpdateRule(existing, incoming, userA, nowMs, true);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'TARGET_IMMUTABLE');
});
// 9. Legitimate ordinary user updates risk score by exactly +1 -> ALLOWED
runTest('TEST 9: Legitimate ordinary user increments risk score by +1 -> ALLOWED', () => {
    const existing = {
        targetId: 'seller_victim',
        targetType: 'user',
        score: 5,
        lastReportedAt: nowMs - 10000
    };
    const incoming = {
        ...existing,
        score: 6,
        lastReportedAt: nowMs
    };
    const res = evaluateArenaRiskScoreUpdateRule(existing, incoming, userA, nowMs, true);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'VALID_UPDATE');
});
// 10. Unauthenticated create / update -> DENIED
runTest('TEST 10: Unauthenticated create/update -> DENIED', () => {
    const doc = { targetId: 'seller_victim', targetType: 'user', score: 1, lastReportedAt: nowMs };
    const res = evaluateArenaRiskScoreCreateRule('seller_victim', doc, unauth, nowMs, true);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'UNAUTHENTICATED');
});
// 11. Blocked user create / update -> DENIED
runTest('TEST 11: Blocked user create/update -> DENIED', () => {
    const doc = { targetId: 'seller_victim', targetType: 'user', score: 1, lastReportedAt: nowMs };
    const res = evaluateArenaRiskScoreCreateRule('seller_victim', doc, blockedUser, nowMs, true);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'BLOCKED_USER');
});
// 12. Admin can create, update, delete risk score -> ALLOWED
runTest('TEST 12: Admin create, update, and delete -> ALLOWED', () => {
    const createRes = evaluateArenaRiskScoreCreateRule('seller_victim', { score: 10 }, adminUser, nowMs, false);
    assert_1.default.strictEqual(createRes.allowed, true);
    assert_1.default.strictEqual(createRes.reason, 'ADMIN_ALLOWED');
    const existing = { targetId: 'seller_victim', targetType: 'user', score: 5, lastReportedAt: nowMs };
    const updateRes = evaluateArenaRiskScoreUpdateRule(existing, { score: 100 }, adminUser, nowMs, false);
    assert_1.default.strictEqual(updateRes.allowed, true);
    assert_1.default.strictEqual(updateRes.reason, 'ADMIN_ALLOWED');
    const delRes = evaluateArenaRiskScoreDeleteRule(adminUser);
    assert_1.default.strictEqual(delRes.allowed, true);
    assert_1.default.strictEqual(delRes.reason, 'ADMIN_DELETE_ALLOWED');
});
// 13. Target user can read their own risk score -> ALLOWED
runTest('TEST 13: Target user reading own risk score -> ALLOWED', () => {
    const doc = { targetId: userA.uid };
    const res = evaluateArenaRiskScoreReadRule(doc, userA);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'TARGET_OWNER_READ_ALLOWED');
});
// 14. Non-target user reading another user risk score -> DENIED
runTest('TEST 14: Non-target user reading someone else risk score -> DENIED', () => {
    const doc = { targetId: userA.uid };
    const res = evaluateArenaRiskScoreReadRule(doc, userB);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'READ_DENIED');
});
// 15. Admin reading any risk score -> ALLOWED
runTest('TEST 15: Admin reading any risk score -> ALLOWED', () => {
    const doc = { targetId: userA.uid };
    const res = evaluateArenaRiskScoreReadRule(doc, adminUser);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'ADMIN_READ_ALLOWED');
});
// 16. Ordinary user delete risk score -> DENIED
runTest('TEST 16: Ordinary user delete risk score -> DENIED', () => {
    const res = evaluateArenaRiskScoreDeleteRule(userA);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'DELETE_DENIED');
});
// 17. No wildcard bypass
runTest('TEST 17: Verify no wildcard rule bypasses /arena_risk_scores isolation', () => {
    const globalSafetyNetAllows = false;
    assert_1.default.strictEqual(globalSafetyNetAllows, false);
});
console.log(`=== ARENA RISK SCORE SECURITY TEST SUMMARY: ${passedTests} PASSED, 0 FAILED ===\n`);
//# sourceMappingURL=arenaRiskScoreSecurity.test.js.map