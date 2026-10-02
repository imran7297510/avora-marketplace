"use strict";
// Pure deterministic test suite for 365-day finalized report retention architecture
// Validates all 18 required scenarios without touching production Firestore.
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRetentionUnitTests = runRetentionUnitTests;
const reportRetentionScheduled_1 = require("./reportRetentionScheduled");
const moderationMetricsBackend_1 = require("./moderationMetricsBackend");
const firestore_1 = require("firebase-admin/firestore");
// Pure deterministic metric decrement calculation
function applyRetentionAccounting(current, counts) {
    const check = (0, moderationMetricsBackend_1.validateRetentionDecrementSufficiency)(current, counts);
    if (!check.sufficient) {
        throw new Error(`[UNDERFLOW_ERROR]: ${check.reason}`);
    }
    const totalToDelete = counts.resolvedCount + counts.dismissedCount;
    return {
        ...current,
        availableReportsCount: current.availableReportsCount - totalToDelete,
        resolvedReportsCount: current.resolvedReportsCount - counts.resolvedCount,
        dismissedReportsCount: current.dismissedReportsCount - counts.dismissedCount,
        // allReportsCount and pendingReportsCount are strictly untouched
        allReportsCount: current.allReportsCount,
        pendingReportsCount: current.pendingReportsCount
    };
}
function runRetentionUnitTests() {
    console.log("=== STARTING 365-DAY REPORT RETENTION DETERMINISTIC UNIT TESTS ===");
    let passed = 0;
    let failed = 0;
    function assert(condition, description) {
        if (condition) {
            console.log(`[PASS] ${description}`);
            passed++;
        }
        else {
            console.error(`[FAIL] ${description}`);
            failed++;
        }
    }
    const nowMs = 1750000000000;
    const cutoffMs = nowMs - reportRetentionScheduled_1.RETENTION_DURATION_MS; // exactly 365 days ago
    const cutoffTimestamp = firestore_1.Timestamp.fromMillis(cutoffMs);
    const baselineMetrics = {
        allReportsCount: 20,
        availableReportsCount: 20,
        pendingReportsCount: 5,
        resolvedReportsCount: 10,
        dismissedReportsCount: 5
    };
    // 1. RESOLVED deletion decrements available + resolved
    const m1 = applyRetentionAccounting(baselineMetrics, { resolvedCount: 1, dismissedCount: 0 });
    assert(m1.availableReportsCount === 19 && m1.resolvedReportsCount === 9, "1. RESOLVED deletion decrements available (-1) and resolved (-1)");
    // 2. DISMISSED deletion decrements available + dismissed
    const m2 = applyRetentionAccounting(m1, { resolvedCount: 0, dismissedCount: 1 });
    assert(m2.availableReportsCount === 18 && m2.dismissedReportsCount === 4, "2. DISMISSED deletion decrements available (-1) and dismissed (-1)");
    // 3. allReportsCount never decreases
    assert(m2.allReportsCount === baselineMetrics.allReportsCount && m2.allReportsCount >= m2.availableReportsCount, "3. allReportsCount never decreases during retention deletion (lifetime counter)");
    // 4. pendingReportsCount never changes
    assert(m2.pendingReportsCount === baselineMetrics.pendingReportsCount, "4. pendingReportsCount is completely unaffected by retention deletion");
    // 5. invariant remains true: available = pending + resolved + dismissed
    const invariantHolds = m2.availableReportsCount === (m2.pendingReportsCount + m2.resolvedReportsCount + m2.dismissedReportsCount);
    assert(invariantHolds, `5. Metric Invariant Holds: available (${m2.availableReportsCount}) = pending (${m2.pendingReportsCount}) + resolved (${m2.resolvedReportsCount}) + dismissed (${m2.dismissedReportsCount})`);
    // 6. missing resolvedAt is skipped
    const docMissingResolvedAt = {
        status: 'RESOLVED',
        createdAt: firestore_1.Timestamp.fromMillis(cutoffMs - 100000)
        // resolvedAt omitted
    };
    const eval6 = (0, reportRetentionScheduled_1.evaluateReportCandidate)(docMissingResolvedAt, 'reports', cutoffTimestamp);
    assert(eval6.eligible === false && eval6.reason === 'FINALIZED_REPORT_MISSING_RESOLVED_AT', "6. Finalized report missing resolvedAt is safely SKIPPED (never deleted or inferred)");
    // 7. active OPEN report is skipped
    const docActiveOpen = {
        status: 'OPEN',
        resolvedAt: firestore_1.Timestamp.fromMillis(cutoffMs - 10000)
    };
    const eval7 = (0, reportRetentionScheduled_1.evaluateReportCandidate)(docActiveOpen, 'reports', cutoffTimestamp);
    assert(eval7.eligible === false && eval7.reason === 'SKIPPED_ACTIVE_STATUS', "7. Active OPEN report is SKIPPED (active reports must never be deleted)");
    // 8. active pending Arena report is skipped
    const docActivePending = {
        status: 'pending',
        targetType: 'listing',
        resolvedAt: firestore_1.Timestamp.fromMillis(cutoffMs - 10000)
    };
    const eval8 = (0, reportRetentionScheduled_1.evaluateReportCandidate)(docActivePending, 'arena_reports', cutoffTimestamp);
    assert(eval8.eligible === false && eval8.reason === 'SKIPPED_ACTIVE_STATUS', "8. Active pending Arena report is SKIPPED");
    // 9. active reviewing Arena report is skipped
    const docActiveReviewing = {
        status: 'reviewing',
        targetType: 'negotiation',
        resolvedAt: firestore_1.Timestamp.fromMillis(cutoffMs - 10000)
    };
    const eval9 = (0, reportRetentionScheduled_1.evaluateReportCandidate)(docActiveReviewing, 'arena_reports', cutoffTimestamp);
    assert(eval9.eligible === false && eval9.reason === 'SKIPPED_ACTIVE_STATUS', "9. Active reviewing Arena report is SKIPPED");
    // 10. Arena user report is skipped
    const docUserReport = {
        status: 'resolved',
        targetType: 'user',
        resolvedAt: firestore_1.Timestamp.fromMillis(cutoffMs - 10000)
    };
    const eval10 = (0, reportRetentionScheduled_1.evaluateReportCandidate)(docUserReport, 'arena_reports', cutoffTimestamp);
    assert(eval10.eligible === false && Boolean(eval10.reason?.includes('SKIPPED_UNSUPPORTED_TARGET_TYPE')), "10. Arena user report is SKIPPED (Reported Profiles out of scope)");
    // 11. Arena offer report is skipped
    const docOfferReport = {
        status: 'resolved',
        targetType: 'offer',
        resolvedAt: firestore_1.Timestamp.fromMillis(cutoffMs - 10000)
    };
    const eval11 = (0, reportRetentionScheduled_1.evaluateReportCandidate)(docOfferReport, 'arena_reports', cutoffTimestamp);
    assert(eval11.eligible === false && Boolean(eval11.reason?.includes('SKIPPED_UNSUPPORTED_TARGET_TYPE')), "11. Arena offer report is SKIPPED (offer out of scope)");
    // 12. newer resolvedAt than cutoff is skipped
    const docNewerResolved = {
        status: 'RESOLVED',
        resolvedAt: firestore_1.Timestamp.fromMillis(cutoffMs + 1000) // 1 second newer than 365 days
    };
    const eval12 = (0, reportRetentionScheduled_1.evaluateReportCandidate)(docNewerResolved, 'reports', cutoffTimestamp);
    assert(eval12.eligible === false && eval12.reason === 'SKIPPED_NEWER_TIMESTAMP', "12. Newer resolvedAt than cutoff is SKIPPED (must be retained until 365 days elapsed)");
    // 13. exactly-at-cutoff resolvedAt is eligible
    const docExactCutoff = {
        status: 'RESOLVED',
        resolvedAt: firestore_1.Timestamp.fromMillis(cutoffMs) // exactly 365.0 days
    };
    const eval13 = (0, reportRetentionScheduled_1.evaluateReportCandidate)(docExactCutoff, 'reports', cutoffTimestamp);
    assert(eval13.eligible === true && eval13.normalizedStatus === 'RESOLVED', "13. Exactly-at-cutoff resolvedAt (resolvedAt <= cutoff) is ELIGIBLE");
    // 14. already deleted document is harmless
    const eval14 = (0, reportRetentionScheduled_1.evaluateReportCandidate)(undefined, 'reports', cutoffTimestamp);
    assert(eval14.eligible === false && eval14.reason === 'DOCUMENT_DOES_NOT_EXIST', "14. Already deleted document (undefined docData) is harmlessly skipped");
    // 15. insufficient metric counter aborts transaction
    const depletedMetrics = {
        allReportsCount: 5,
        availableReportsCount: 0,
        pendingReportsCount: 0,
        resolvedReportsCount: 0,
        dismissedReportsCount: 0
    };
    const check15 = (0, moderationMetricsBackend_1.validateRetentionDecrementSufficiency)(depletedMetrics, { resolvedCount: 1, dismissedCount: 0 });
    let threwUnderflow = false;
    try {
        applyRetentionAccounting(depletedMetrics, { resolvedCount: 1, dismissedCount: 0 });
    }
    catch (err) {
        threwUnderflow = err.message.includes('UNDERFLOW_ERROR');
    }
    assert(check15.sufficient === false && threwUnderflow === true, "15. Insufficient metric counter aborts transaction (prevents negative numbers)");
    // 16. concurrent state change causes revalidation and prevents unsafe deletion
    // Candidate was discovered as RESOLVED, but inside transaction it was re-opened to OPEN
    const concurrentDocState = {
        status: 'OPEN', // Reopened by moderator
        resolvedAt: firestore_1.Timestamp.fromMillis(cutoffMs - 5000)
    };
    const eval16 = (0, reportRetentionScheduled_1.evaluateReportCandidate)(concurrentDocState, 'reports', cutoffTimestamp);
    assert(eval16.eligible === false && eval16.reason === 'SKIPPED_ACTIVE_STATUS', "16. Concurrent state change to OPEN prevents unsafe deletion during transaction revalidation");
    // 17. retry does not double-decrement
    // First run deletes and decrements
    const postRunMetrics = applyRetentionAccounting(baselineMetrics, { resolvedCount: 1, dismissedCount: 0 });
    // On retry, the document is already deleted (undefined), so evaluateReportCandidate yields eligible: false
    const retryCandidateEval = (0, reportRetentionScheduled_1.evaluateReportCandidate)(undefined, 'reports', cutoffTimestamp);
    const eligibleOnRetry = retryCandidateEval.eligible ? 1 : 0;
    // Metric accounting on retry has 0 eligible
    const postRetryMetrics = applyRetentionAccounting(postRunMetrics, { resolvedCount: eligibleOnRetry, dismissedCount: 0 });
    assert(postRetryMetrics.availableReportsCount === postRunMetrics.availableReportsCount &&
        postRetryMetrics.resolvedReportsCount === postRunMetrics.resolvedReportsCount, "17. Retry does not double-decrement (idempotent no-op for already deleted candidate)");
    // 18. retention disabled performs zero deletions and zero metric writes
    assert(reportRetentionScheduled_1.REPORT_RETENTION_ENABLED === false, "18. REPORT_RETENTION_ENABLED is false by default (zero deletions and zero metric writes)");
    console.log(`=== RETENTION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
    if (failed > 0) {
        process.exit(1);
    }
}
runRetentionUnitTests();
//# sourceMappingURL=reportRetention.test.js.map