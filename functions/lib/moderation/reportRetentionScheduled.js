"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processReportRetentionScheduled = exports.MAX_REPORTS_PER_TRANSACTION = exports.CANDIDATE_BATCH_LIMIT = exports.REPORT_RETENTION_ENABLED = exports.RETENTION_DURATION_MS = void 0;
exports.getTrustedServerCutoffTimestamp = getTrustedServerCutoffTimestamp;
exports.evaluateReportCandidate = evaluateReportCandidate;
exports.discoverRetentionCandidates = discoverRetentionCandidates;
exports.processRetentionMicroTransaction = processRetentionMicroTransaction;
exports.executeReportRetention = executeReportRetention;
exports.executeReportRetentionDryRun = executeReportRetentionDryRun;
const firestore_1 = require("firebase-admin/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const moderationMetricsBackend_1 = require("./moderationMetricsBackend");
/**
 * EXACT 365-DAY RETENTION DURATION:
 * 365 * 24 * 60 * 60 * 1000 = 31,536,000,000 milliseconds.
 * Strictly avoids calendar arithmetic or fuzzy day counts.
 */
exports.RETENTION_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
/**
 * ACTIVATION GATE:
 * Default state MUST BE DISABLED.
 * Retention worker will NOT delete any document when disabled.
 */
exports.REPORT_RETENTION_ENABLED = false;
/**
 * BOUNDED QUERY AND TRANSACTION LIMITS:
 * Candidate discovery retrieves at most 20 reports per query chunk.
 * Each micro-transaction processes at most 10 reports sequentially.
 */
exports.CANDIDATE_BATCH_LIMIT = 20;
exports.MAX_REPORTS_PER_TRANSACTION = 10;
/**
 * Derives the authoritative trusted-server cutoff timestamp.
 * Computed using Cloud Functions Node runtime UTC server time.
 */
function getTrustedServerCutoffTimestamp(nowMs = Date.now()) {
    const cutoffMs = nowMs - exports.RETENTION_DURATION_MS;
    return firestore_1.Timestamp.fromMillis(cutoffMs);
}
/**
 * Revalidates a report candidate document snapshot inside a transaction.
 * Returns the validated normalized status ('RESOLVED' | 'DISMISSED') if eligible,
 * or a rejection reason string if ineligible.
 */
function evaluateReportCandidate(docData, collectionName, cutoffTimestamp) {
    if (!docData) {
        return { eligible: false, reason: 'DOCUMENT_DOES_NOT_EXIST' };
    }
    // 1. Status Check: Active reports must NEVER be deleted
    const rawStatus = String(docData.status || '').trim().toUpperCase();
    if (rawStatus === 'OPEN' || rawStatus === 'PENDING' || rawStatus === 'REVIEWING') {
        return { eligible: false, reason: 'SKIPPED_ACTIVE_STATUS' };
    }
    if (rawStatus !== 'RESOLVED' && rawStatus !== 'DISMISSED') {
        return { eligible: false, reason: `SKIPPED_UNFINALIZED_STATUS_${rawStatus}` };
    }
    // 2. Arena Target-Type Protection: strictly 'listing' or 'negotiation'
    if (collectionName === 'arena_reports') {
        const targetType = docData.targetType;
        if (targetType !== 'listing' && targetType !== 'negotiation') {
            return { eligible: false, reason: `SKIPPED_UNSUPPORTED_TARGET_TYPE_${String(targetType)}` };
        }
    }
    // 3. Timestamp Presence & Validity: Never infer from createdAt or updatedAt
    const resolvedAt = docData.resolvedAt;
    if (!resolvedAt) {
        return { eligible: false, reason: 'FINALIZED_REPORT_MISSING_RESOLVED_AT' };
    }
    // Must be a Firestore Timestamp or have toMillis()
    let resolvedAtMs;
    if (resolvedAt instanceof firestore_1.Timestamp) {
        resolvedAtMs = resolvedAt.toMillis();
    }
    else if (typeof resolvedAt.toMillis === 'function') {
        resolvedAtMs = resolvedAt.toMillis();
    }
    else if (typeof resolvedAt.toDate === 'function') {
        resolvedAtMs = resolvedAt.toDate().getTime();
    }
    else if (typeof resolvedAt === 'number') {
        resolvedAtMs = resolvedAt;
    }
    else {
        return { eligible: false, reason: 'FINALIZED_REPORT_INVALID_RESOLVED_AT_TYPE' };
    }
    // 4. Exact Cutoff Comparison: resolvedAt <= cutoff (365 days ago)
    const cutoffMs = cutoffTimestamp.toMillis();
    if (resolvedAtMs > cutoffMs) {
        return { eligible: false, reason: 'SKIPPED_NEWER_TIMESTAMP' };
    }
    return {
        eligible: true,
        normalizedStatus: rawStatus
    };
}
/**
 * Discovers bounded retention candidates outside transactions.
 * Uses explicit positive inclusion and strict bounds.
 */
async function discoverRetentionCandidates(cutoffTimestamp) {
    const db = (0, firestore_1.getFirestore)('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');
    const candidates = [];
    // 1. Marketplace Candidates (reports collection)
    // Query A: RESOLVED reports past 365 days
    const mpResolvedSnap = await db.collection('reports')
        .where('status', '==', 'RESOLVED')
        .where('resolvedAt', '<=', cutoffTimestamp)
        .orderBy('resolvedAt', 'asc')
        .limit(exports.CANDIDATE_BATCH_LIMIT)
        .get();
    for (const doc of mpResolvedSnap.docs) {
        candidates.push({ id: doc.id, collection: 'reports' });
    }
    // Query B: DISMISSED reports past 365 days
    const mpDismissedSnap = await db.collection('reports')
        .where('status', '==', 'DISMISSED')
        .where('resolvedAt', '<=', cutoffTimestamp)
        .orderBy('resolvedAt', 'asc')
        .limit(exports.CANDIDATE_BATCH_LIMIT)
        .get();
    for (const doc of mpDismissedSnap.docs) {
        candidates.push({ id: doc.id, collection: 'reports' });
    }
    // 2. Arena Candidates (arena_reports collection)
    // Query C: listing targetType, resolved status
    const arListResSnap = await db.collection('arena_reports')
        .where('targetType', '==', 'listing')
        .where('status', '==', 'resolved')
        .where('resolvedAt', '<=', cutoffTimestamp)
        .orderBy('resolvedAt', 'asc')
        .limit(exports.CANDIDATE_BATCH_LIMIT)
        .get();
    for (const doc of arListResSnap.docs) {
        candidates.push({ id: doc.id, collection: 'arena_reports' });
    }
    // Query D: listing targetType, dismissed status
    const arListDismSnap = await db.collection('arena_reports')
        .where('targetType', '==', 'listing')
        .where('status', '==', 'dismissed')
        .where('resolvedAt', '<=', cutoffTimestamp)
        .orderBy('resolvedAt', 'asc')
        .limit(exports.CANDIDATE_BATCH_LIMIT)
        .get();
    for (const doc of arListDismSnap.docs) {
        candidates.push({ id: doc.id, collection: 'arena_reports' });
    }
    // Query E: negotiation targetType, resolved status
    const arNegResSnap = await db.collection('arena_reports')
        .where('targetType', '==', 'negotiation')
        .where('status', '==', 'resolved')
        .where('resolvedAt', '<=', cutoffTimestamp)
        .orderBy('resolvedAt', 'asc')
        .limit(exports.CANDIDATE_BATCH_LIMIT)
        .get();
    for (const doc of arNegResSnap.docs) {
        candidates.push({ id: doc.id, collection: 'arena_reports' });
    }
    // Query F: negotiation targetType, dismissed status
    const arNegDismSnap = await db.collection('arena_reports')
        .where('targetType', '==', 'negotiation')
        .where('status', '==', 'dismissed')
        .where('resolvedAt', '<=', cutoffTimestamp)
        .orderBy('resolvedAt', 'asc')
        .limit(exports.CANDIDATE_BATCH_LIMIT)
        .get();
    for (const doc of arNegDismSnap.docs) {
        candidates.push({ id: doc.id, collection: 'arena_reports' });
    }
    return candidates;
}
/**
 * Executes a single bounded micro-transaction over up to 10 candidates.
 * Enforces that ALL reads precede all writes.
 * Revalidates candidate eligibility inside the transaction.
 * Atomically deletes verified eligible reports and decrements moderation metrics.
 */
async function processRetentionMicroTransaction(chunk, cutoffTimestamp) {
    const db = (0, firestore_1.getFirestore)('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');
    const metricsRef = (0, moderationMetricsBackend_1.getModerationMetricsRef)();
    return await db.runTransaction(async (transaction) => {
        // === STEP 1: ALL READS ===
        // 1a. Read candidate report documents
        const docSnaps = await Promise.all(chunk.map(c => transaction.get(db.collection(c.collection).doc(c.id))));
        // 1b. Read moderation metrics document
        const metricsSnap = await transaction.get(metricsRef);
        if (!metricsSnap.exists) {
            throw new Error("[CRITICAL_ABORT]: /system_metrics/moderation document does not exist. Aborting retention transaction.");
        }
        const currentMetrics = metricsSnap.data();
        // === STEP 2: REVALIDATION & CLASSIFICATION ===
        let countResolvedToDelete = 0;
        let countDismissedToDelete = 0;
        let deletedMp = 0;
        let deletedAr = 0;
        let skipped = 0;
        const skippedReasons = {};
        const eligibleDocRefsToDelete = [];
        for (let i = 0; i < chunk.length; i++) {
            const candidate = chunk[i];
            const snap = docSnaps[i];
            if (!snap.exists) {
                skipped++;
                skippedReasons['DOCUMENT_ALREADY_DELETED'] = (skippedReasons['DOCUMENT_ALREADY_DELETED'] || 0) + 1;
                continue;
            }
            const evalResult = evaluateReportCandidate(snap.data(), candidate.collection, cutoffTimestamp);
            if (!evalResult.eligible) {
                skipped++;
                const reason = evalResult.reason || 'UNKNOWN_REJECTION';
                skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
                if (reason === 'FINALIZED_REPORT_MISSING_RESOLVED_AT') {
                    console.warn(`[FINALIZED_REPORT_MISSING_RESOLVED_AT]: Report ${candidate.collection}/${candidate.id} finalized without resolvedAt. Safely preserved.`);
                }
                continue;
            }
            // Eligible for retention deletion
            if (evalResult.normalizedStatus === 'RESOLVED') {
                countResolvedToDelete++;
            }
            else {
                countDismissedToDelete++;
            }
            if (candidate.collection === 'reports') {
                deletedMp++;
            }
            else {
                deletedAr++;
            }
            eligibleDocRefsToDelete.push(snap.ref);
        }
        const totalEligibleToDelete = countResolvedToDelete + countDismissedToDelete;
        // If no reports in this chunk are eligible, do no writes
        if (totalEligibleToDelete === 0) {
            return {
                deletedMarketplace: 0,
                deletedArena: 0,
                skipped,
                skippedReasons
            };
        }
        // === STEP 3: ALL WRITES ===
        // 3a. Delete eligible report documents
        for (const ref of eligibleDocRefsToDelete) {
            transaction.delete(ref);
        }
        // 3b. Decrement moderation metrics atomically
        (0, moderationMetricsBackend_1.applyRetentionMetricDecrements)(transaction, metricsRef, currentMetrics, {
            resolvedCount: countResolvedToDelete,
            dismissedCount: countDismissedToDelete
        });
        return {
            deletedMarketplace: deletedMp,
            deletedArena: deletedAr,
            skipped,
            skippedReasons
        };
    });
}
/**
 * Main retention execution entry point.
 * Gated by REPORT_RETENTION_ENABLED.
 */
async function executeReportRetention() {
    // Activation Gate Check
    if (!exports.REPORT_RETENTION_ENABLED) {
        console.log("[reportRetentionScheduled] REPORT_RETENTION_ENABLED is false. Retention worker is deactivated. Zero deletions performed.");
        return {
            status: 'DISABLED',
            deletedMarketplaceCount: 0,
            deletedArenaCount: 0,
            deletedTotal: 0,
            candidatesDiscovered: 0,
            skippedCount: 0,
            skippedReasons: { RETENTION_DISABLED: 1 },
            message: 'Retention worker is deactivated by activation gate (REPORT_RETENTION_ENABLED = false).'
        };
    }
    const cutoff = getTrustedServerCutoffTimestamp();
    const candidates = await discoverRetentionCandidates(cutoff);
    if (candidates.length === 0) {
        return {
            status: 'COMPLETED',
            deletedMarketplaceCount: 0,
            deletedArenaCount: 0,
            deletedTotal: 0,
            candidatesDiscovered: 0,
            skippedCount: 0,
            skippedReasons: {},
            message: 'Zero eligible retention candidates discovered.'
        };
    }
    // Chunk candidates into micro-transactions of MAX_REPORTS_PER_TRANSACTION (10)
    let totalDeletedMp = 0;
    let totalDeletedAr = 0;
    let totalSkipped = 0;
    const aggregatedSkippedReasons = {};
    for (let i = 0; i < candidates.length; i += exports.MAX_REPORTS_PER_TRANSACTION) {
        const chunk = candidates.slice(i, i + exports.MAX_REPORTS_PER_TRANSACTION);
        const result = await processRetentionMicroTransaction(chunk, cutoff);
        totalDeletedMp += result.deletedMarketplace;
        totalDeletedAr += result.deletedArena;
        totalSkipped += result.skipped;
        for (const [reason, count] of Object.entries(result.skippedReasons)) {
            aggregatedSkippedReasons[reason] = (aggregatedSkippedReasons[reason] || 0) + count;
        }
    }
    return {
        status: 'COMPLETED',
        deletedMarketplaceCount: totalDeletedMp,
        deletedArenaCount: totalDeletedAr,
        deletedTotal: totalDeletedMp + totalDeletedAr,
        candidatesDiscovered: candidates.length,
        skippedCount: totalSkipped,
        skippedReasons: aggregatedSkippedReasons,
        message: `Retention execution completed: ${totalDeletedMp + totalDeletedAr} reports permanently deleted, ${totalSkipped} skipped.`
    };
}
/**
 * Deterministic Dry-Run Capability:
 * Discovers bounded candidates and revalidates in memory.
 * Performs ZERO deletes and ZERO metric writes.
 */
async function executeReportRetentionDryRun() {
    const db = (0, firestore_1.getFirestore)('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');
    const cutoff = getTrustedServerCutoffTimestamp();
    const candidates = await discoverRetentionCandidates(cutoff);
    let eligibleResolvedCount = 0;
    let eligibleDismissedCount = 0;
    let skippedCount = 0;
    const skippedReasons = {};
    for (const c of candidates) {
        const snap = await db.collection(c.collection).doc(c.id).get();
        if (!snap.exists) {
            skippedCount++;
            skippedReasons['DOCUMENT_ALREADY_DELETED'] = (skippedReasons['DOCUMENT_ALREADY_DELETED'] || 0) + 1;
            continue;
        }
        const evalResult = evaluateReportCandidate(snap.data(), c.collection, cutoff);
        if (!evalResult.eligible) {
            skippedCount++;
            const reason = evalResult.reason || 'UNKNOWN_REJECTION';
            skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
        }
        else {
            if (evalResult.normalizedStatus === 'RESOLVED') {
                eligibleResolvedCount++;
            }
            else {
                eligibleDismissedCount++;
            }
        }
    }
    return {
        status: 'DRY_RUN',
        cutoffTimestampIso: cutoff.toDate().toISOString(),
        candidatesDiscovered: candidates.length,
        eligibleResolvedCount,
        eligibleDismissedCount,
        eligibleTotal: eligibleResolvedCount + eligibleDismissedCount,
        skippedCount,
        skippedReasons
    };
}
/**
 * Scheduled Cloud Function (v2): Runs every 24 hours at 02:00 UTC.
 * Daily server-authoritative 365-day finalized Reported Listings retention worker.
 * Deletion is deactivated by default via REPORT_RETENTION_ENABLED gate.
 */
exports.processReportRetentionScheduled = (0, scheduler_1.onSchedule)({
    schedule: '0 2 * * *',
    timeZone: 'UTC',
    retryCount: 1
}, async () => {
    const result = await executeReportRetention();
    console.log('[processReportRetentionScheduled] Retention execution result:', result);
});
//# sourceMappingURL=reportRetentionScheduled.js.map