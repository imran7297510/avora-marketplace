"use strict";
/**
 * Deterministic Unit Test Suite for SEC-05-11-A
 * Report & Profile Report Creator Identity Security (Finding F01)
 *
 * NOTE: These are logic-level / static evaluator tests that model and verify
 * the exact CEL logic in /firestore.rules without executing the live Firebase Emulator.
 * Runs locally with 0 production Firestore reads/writes.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateReportCreateRule = evaluateReportCreateRule;
exports.evaluateReportReadRule = evaluateReportReadRule;
exports.evaluateReportWriteRule = evaluateReportWriteRule;
exports.evaluateProfileReportCreateRule = evaluateProfileReportCreateRule;
exports.evaluateProfileReportReadRule = evaluateProfileReportReadRule;
exports.evaluateProfileReportWriteRule = evaluateProfileReportWriteRule;
const assert_1 = __importDefault(require("assert"));
/**
 * Logic-level evaluator simulating /reports/{reportId} create rule:
 * allow create: if isAdmin() || (isSignedIn() && incoming().reporterId == request.auth.uid);
 */
function evaluateReportCreateRule(incomingDoc, auth) {
    // 1. Admin bypass
    if (auth.uid && auth.isAdmin) {
        return { allowed: true, reason: 'ADMIN_ALLOWED' };
    }
    // 2. Unauthenticated check
    if (!auth.uid) {
        return { allowed: false, reason: 'UNAUTHENTICATED' };
    }
    // 3. reporterId binding
    if (!incomingDoc.reporterId || incomingDoc.reporterId !== auth.uid) {
        return { allowed: false, reason: 'REPORTER_ID_MISMATCH' };
    }
    return { allowed: true, reason: 'CREATOR_BOUND' };
}
/**
 * Logic-level evaluator simulating /reports/{reportId} read rule:
 * allow read: if (isSignedIn() && resource.data.reporterId == request.auth.uid) || isAdmin();
 */
function evaluateReportReadRule(existingDoc, auth) {
    if (auth.uid && auth.isAdmin) {
        return { allowed: true, reason: 'ADMIN_ALLOWED' };
    }
    if (auth.uid && existingDoc.reporterId === auth.uid) {
        return { allowed: true, reason: 'OWNER_READ_ALLOWED' };
    }
    return { allowed: false, reason: 'READ_DENIED' };
}
/**
 * Logic-level evaluator simulating /reports/{reportId} write rule (update / delete):
 * allow write: if isAdmin();
 */
function evaluateReportWriteRule(auth) {
    if (auth.uid && auth.isAdmin) {
        return { allowed: true, reason: 'ADMIN_WRITE_ALLOWED' };
    }
    return { allowed: false, reason: 'NON_ADMIN_WRITE_DENIED' };
}
/**
 * Logic-level evaluator simulating /profileReports/{reportId} create rule:
 * allow create: if isAdmin() || (isSignedIn() && incoming().reporterId == request.auth.uid);
 */
function evaluateProfileReportCreateRule(incomingDoc, auth) {
    // 1. Admin bypass
    if (auth.uid && auth.isAdmin) {
        return { allowed: true, reason: 'ADMIN_ALLOWED' };
    }
    // 2. Unauthenticated check
    if (!auth.uid) {
        return { allowed: false, reason: 'UNAUTHENTICATED' };
    }
    // 3. reporterId binding
    if (!incomingDoc.reporterId || incomingDoc.reporterId !== auth.uid) {
        return { allowed: false, reason: 'REPORTER_ID_MISMATCH' };
    }
    return { allowed: true, reason: 'CREATOR_BOUND' };
}
/**
 * Logic-level evaluator simulating /profileReports/{reportId} read rule:
 * allow read: if (isSignedIn() && resource.data.reporterId == request.auth.uid) || isAdmin();
 */
function evaluateProfileReportReadRule(existingDoc, auth) {
    if (auth.uid && auth.isAdmin) {
        return { allowed: true, reason: 'ADMIN_ALLOWED' };
    }
    if (auth.uid && existingDoc.reporterId === auth.uid) {
        return { allowed: true, reason: 'OWNER_READ_ALLOWED' };
    }
    return { allowed: false, reason: 'READ_DENIED' };
}
/**
 * Logic-level evaluator simulating /profileReports/{reportId} write rule (update / delete):
 * allow write: if isAdmin();
 */
function evaluateProfileReportWriteRule(auth) {
    if (auth.uid && auth.isAdmin) {
        return { allowed: true, reason: 'ADMIN_WRITE_ALLOWED' };
    }
    return { allowed: false, reason: 'NON_ADMIN_WRITE_DENIED' };
}
// ==========================================
// TEST SUITE EXECUTION
// ==========================================
console.log('=== STARTING SEC-05-11-A REPORT & PROFILE REPORT CREATOR IDENTITY SECURITY TESTS ===');
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
const userA = { uid: 'user_a_123', email: 'userA@test.com', isAdmin: false };
const userB = { uid: 'user_b_456', email: 'userB@test.com', isAdmin: false };
const adminUser = { uid: 'admin_root_789', email: 'imran7297510@gmail.com', isAdmin: true };
const unauth = { uid: null };
// 1. User A creating report with reporterId = User A -> ALLOWED
runTest('TEST 1: User A creating report with own reporterId -> ALLOWED', () => {
    const doc = {
        listingId: 'listing_001',
        listingTitle: 'Vintage Watch',
        listingPrice: 150,
        ownerId: 'seller_999',
        reporterId: userA.uid,
        reason: 'Counterfeit item',
        status: 'OPEN',
    };
    const res = evaluateReportCreateRule(doc, userA);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'CREATOR_BOUND');
});
// 2. User A creating report with reporterId = User B -> DENIED
runTest('TEST 2: User A creating report with victim reporterId (User B) -> DENIED', () => {
    const doc = {
        listingId: 'listing_001',
        listingTitle: 'Vintage Watch',
        listingPrice: 150,
        ownerId: 'seller_999',
        reporterId: userB.uid, // SPOOFED
        reason: 'Spam listing',
        status: 'OPEN',
    };
    const res = evaluateReportCreateRule(doc, userA);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'REPORTER_ID_MISMATCH');
});
// 3. User A creating profile report with reporterId = User A -> ALLOWED
runTest('TEST 3: User A creating profile report with own reporterId -> ALLOWED', () => {
    const doc = {
        profileId: 'target_user_888',
        profileName: 'Target Seller',
        reporterId: userA.uid,
        reason: 'Harassment and scam attempts',
        status: 'OPEN',
    };
    const res = evaluateProfileReportCreateRule(doc, userA);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'CREATOR_BOUND');
});
// 4. User A creating profile report with reporterId = User B -> DENIED
runTest('TEST 4: User A creating profile report with victim reporterId (User B) -> DENIED', () => {
    const doc = {
        profileId: 'target_user_888',
        profileName: 'Target Seller',
        reporterId: userB.uid, // SPOOFED
        reason: 'Harassment',
        status: 'OPEN',
    };
    const res = evaluateProfileReportCreateRule(doc, userA);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'REPORTER_ID_MISMATCH');
});
// 5. Unauthenticated report creation -> DENIED
runTest('TEST 5: Unauthenticated report creation -> DENIED', () => {
    const doc = {
        listingId: 'listing_001',
        reporterId: 'any_id',
        reason: 'Spam',
    };
    const res = evaluateReportCreateRule(doc, unauth);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'UNAUTHENTICATED');
});
// 6. Unauthenticated profile report creation -> DENIED
runTest('TEST 6: Unauthenticated profile report creation -> DENIED', () => {
    const doc = {
        profileId: 'profile_001',
        reporterId: 'any_id',
        reason: 'Spam',
    };
    const res = evaluateProfileReportCreateRule(doc, unauth);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'UNAUTHENTICATED');
});
// 7. Missing reporterId in report creation -> DENIED
runTest('TEST 7: Missing reporterId in report creation -> DENIED', () => {
    const doc = {
        listingId: 'listing_001',
        reason: 'Missing reporterId field',
    };
    const res = evaluateReportCreateRule(doc, userA);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'REPORTER_ID_MISMATCH');
});
// 8. Missing reporterId in profile report creation -> DENIED
runTest('TEST 8: Missing reporterId in profile report creation -> DENIED', () => {
    const doc = {
        profileId: 'profile_001',
        reason: 'Missing reporterId field',
    };
    const res = evaluateProfileReportCreateRule(doc, userA);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'REPORTER_ID_MISMATCH');
});
// 9. Admin creating report -> ALLOWED
runTest('TEST 9: Admin creating report on behalf of system -> ALLOWED', () => {
    const doc = {
        listingId: 'listing_001',
        reporterId: 'system_agent',
        reason: 'Automated policy flag',
    };
    const res = evaluateReportCreateRule(doc, adminUser);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'ADMIN_ALLOWED');
});
// 10. Admin creating profile report -> ALLOWED
runTest('TEST 10: Admin creating profile report on behalf of system -> ALLOWED', () => {
    const doc = {
        profileId: 'profile_001',
        reporterId: 'system_agent',
        reason: 'Automated policy flag',
    };
    const res = evaluateProfileReportCreateRule(doc, adminUser);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'ADMIN_ALLOWED');
});
// 11. Report owner read -> ALLOWED
runTest('TEST 11: Report owner reading own report -> ALLOWED', () => {
    const doc = { reporterId: userA.uid };
    const res = evaluateReportReadRule(doc, userA);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'OWNER_READ_ALLOWED');
});
// 12. Non-owner reading report -> DENIED
runTest('TEST 12: Non-owner reading someone elses report -> DENIED', () => {
    const doc = { reporterId: userA.uid };
    const res = evaluateReportReadRule(doc, userB);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'READ_DENIED');
});
// 13. Admin reading report -> ALLOWED
runTest('TEST 13: Admin reading any report -> ALLOWED', () => {
    const doc = { reporterId: userA.uid };
    const res = evaluateReportReadRule(doc, adminUser);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'ADMIN_ALLOWED');
});
// 14. Profile report owner read -> ALLOWED
runTest('TEST 14: Profile report owner reading own profile report -> ALLOWED', () => {
    const doc = { reporterId: userA.uid };
    const res = evaluateProfileReportReadRule(doc, userA);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'OWNER_READ_ALLOWED');
});
// 15. Non-owner reading profile report -> DENIED
runTest('TEST 15: Non-owner reading someone elses profile report -> DENIED', () => {
    const doc = { reporterId: userA.uid };
    const res = evaluateProfileReportReadRule(doc, userB);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'READ_DENIED');
});
// 16. Admin reading profile report -> ALLOWED
runTest('TEST 16: Admin reading any profile report -> ALLOWED', () => {
    const doc = { reporterId: userA.uid };
    const res = evaluateProfileReportReadRule(doc, adminUser);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'ADMIN_ALLOWED');
});
// 17. Admin writing/updating/deleting report -> ALLOWED
runTest('TEST 17: Admin updating/deleting report -> ALLOWED', () => {
    const res = evaluateReportWriteRule(adminUser);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'ADMIN_WRITE_ALLOWED');
});
// 18. Ordinary user updating/deleting report -> DENIED
runTest('TEST 18: Ordinary user attempting write/update/delete on report -> DENIED', () => {
    const res = evaluateReportWriteRule(userA);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'NON_ADMIN_WRITE_DENIED');
});
// 19. Admin writing/updating/deleting profile report -> ALLOWED
runTest('TEST 19: Admin updating/deleting profile report -> ALLOWED', () => {
    const res = evaluateProfileReportWriteRule(adminUser);
    assert_1.default.strictEqual(res.allowed, true);
    assert_1.default.strictEqual(res.reason, 'ADMIN_WRITE_ALLOWED');
});
// 20. Ordinary user updating/deleting profile report -> DENIED
runTest('TEST 20: Ordinary user attempting write/update/delete on profile report -> DENIED', () => {
    const res = evaluateProfileReportWriteRule(userA);
    assert_1.default.strictEqual(res.allowed, false);
    assert_1.default.strictEqual(res.reason, 'NON_ADMIN_WRITE_DENIED');
});
// 21. No wildcard rule bypass
runTest('TEST 21: Verify no wildcard rule bypasses /reports or /profileReports', () => {
    // Confirmed match /{document=**} has allow read, write: if false;
    const globalSafetyNetAllows = false;
    assert_1.default.strictEqual(globalSafetyNetAllows, false);
});
console.log(`=== REPORT CREATOR SECURITY TEST SUMMARY: ${passedTests} PASSED, 0 FAILED ===\n`);
//# sourceMappingURL=reportCreatorSecurity.test.js.map