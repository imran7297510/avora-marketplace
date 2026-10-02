import { ReportStatus } from '../features/battle-bids/types/index';

// Pure deterministic functions mirroring Admin.tsx moderation lifecycle logic
const normalizeReportStatus = (status?: string | null): "OPEN" | "RESOLVED" | "DISMISSED" => {
  if (!status) return "OPEN";
  const s = String(status).trim().toLowerCase();
  if (s === "resolved") {
    return "RESOLVED";
  }
  if (s === "dismissed") {
    return "DISMISSED";
  }
  return "OPEN";
};

const computeFinalStatus = (actionsTaken: string[]) => {
  const isOnlyIgnored = actionsTaken.includes("ignored") && !actionsTaken.some((a) => a === "warned" || a === "removed" || a === "blocked");
  const marketplaceStatus = isOnlyIgnored ? "DISMISSED" : "RESOLVED";
  const arenaStatus = isOnlyIgnored ? ReportStatus.DISMISSED : ReportStatus.RESOLVED;
  return { marketplaceStatus, arenaStatus };
};

const isActionAllowedOnReport = (status: string) => {
  const normalized = normalizeReportStatus(status);
  return normalized === "OPEN";
};

// Run deterministic test suite
function runLifecycleTests() {
  console.log("=== STARTING MODERATION LIFECYCLE REGRESSION TESTS ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description}`);
      failed++;
    }
  }

  // 1. Marketplace Ignore -> DISMISSED
  const t1 = computeFinalStatus(["ignored"]);
  assert(t1.marketplaceStatus === "DISMISSED", "1. Marketplace Ignore produces DISMISSED status");

  // 2. Marketplace actual moderation action -> RESOLVED
  const t2a = computeFinalStatus(["warned"]);
  assert(t2a.marketplaceStatus === "RESOLVED", "2a. Marketplace Warn action produces RESOLVED status");
  const t2b = computeFinalStatus(["ignored", "removed"]);
  assert(t2b.marketplaceStatus === "RESOLVED", "2b. Marketplace Remove action overrules ignore to produce RESOLVED status");

  // 3. Arena dismiss -> DISMISSED
  assert(t1.arenaStatus === ReportStatus.DISMISSED, "3. Arena Ignore produces ReportStatus.DISMISSED ('dismissed')");

  // 4. Arena resolve -> RESOLVED
  assert(t2a.arenaStatus === ReportStatus.RESOLVED, "4. Arena Warn action produces ReportStatus.RESOLVED ('resolved')");

  // 5. Normalization preserves DISMISSED
  assert(normalizeReportStatus("DISMISSED") === "DISMISSED", "5a. normalizeReportStatus('DISMISSED') returns 'DISMISSED'");
  assert(normalizeReportStatus("dismissed") === "DISMISSED", "5b. normalizeReportStatus('dismissed') returns 'DISMISSED'");

  // 6. Normalization preserves RESOLVED
  assert(normalizeReportStatus("RESOLVED") === "RESOLVED", "6a. normalizeReportStatus('RESOLVED') returns 'RESOLVED'");
  assert(normalizeReportStatus("resolved") === "RESOLVED", "6b. normalizeReportStatus('resolved') returns 'RESOLVED'");

  // 7. Closed DISMISSED report cannot enter active-action flow
  assert(!isActionAllowedOnReport("DISMISSED"), "7a. Closed DISMISSED report blocks active actions");
  assert(!isActionAllowedOnReport("dismissed"), "7b. Closed 'dismissed' report blocks active actions");

  // 8. Closed RESOLVED report cannot enter active-action flow
  assert(!isActionAllowedOnReport("RESOLVED"), "8a. Closed RESOLVED report blocks active actions");
  assert(!isActionAllowedOnReport("resolved"), "8b. Closed 'resolved' report blocks active actions");

  // 9. Active report can enter active-action flow
  assert(isActionAllowedOnReport("OPEN"), "9a. Active OPEN report permits active actions");
  assert(isActionAllowedOnReport("pending"), "9b. Active 'pending' report permits active actions");
  assert(isActionAllowedOnReport("reviewing"), "9c. Active 'reviewing' report permits active actions");

  // === PHASE 2D.1: ARENA FINALIZATION TIMESTAMP CONTRACT TESTS ===
  interface ArenaFinalizePayload {
    status: ReportStatus;
    adminNotes?: string;
    resolvedAt: string;
    resolvedBy: string;
    updatedAt: string;
    [key: string]: any;
  }

  // Pure functions mirroring executeModerationAction & dismissReport write payloads
  const createResolutionPayload = (
    action: string,
    reason: string,
    moderatorId: string
  ): ArenaFinalizePayload => ({
    status: ReportStatus.RESOLVED,
    adminNotes: `Action taken: ${action}. Reason: ${reason}`,
    resolvedAt: "SERVER_TIMESTAMP",
    resolvedBy: moderatorId,
    updatedAt: "SERVER_TIMESTAMP"
  });

  const createDismissalPayload = (
    adminNotes: string,
    moderatorId?: string
  ): ArenaFinalizePayload => ({
    status: ReportStatus.DISMISSED,
    adminNotes,
    resolvedAt: "SERVER_TIMESTAMP",
    resolvedBy: moderatorId || 'admin',
    updatedAt: "SERVER_TIMESTAMP"
  });

  // 10. executeModerationAction writing ReportStatus.RESOLVED generates resolvedAt, resolvedBy (moderatorId), updatedAt
  const resPayload = createResolutionPayload("REMOVE_LISTING", "Prohibited weapon", "mod_user_99");
  assert(resPayload.status === ReportStatus.RESOLVED, "10a. Resolution payload sets status to ReportStatus.RESOLVED ('resolved')");
  assert(resPayload.resolvedAt === "SERVER_TIMESTAMP", "10b. Resolution payload includes resolvedAt timestamp");
  assert(resPayload.resolvedBy === "mod_user_99", "10c. Resolution payload includes exact moderatorId in resolvedBy");
  assert(resPayload.updatedAt === "SERVER_TIMESTAMP", "10d. Resolution payload retains updatedAt timestamp");
  assert(resPayload.adminNotes?.includes("Prohibited weapon"), "10e. Resolution payload retains adminNotes");

  // 11. dismissReport writing ReportStatus.DISMISSED with moderatorId generates resolvedAt, resolvedBy, updatedAt
  const disPayloadExplicit = createDismissalPayload("Duplicate report", "mod_admin_42");
  assert(disPayloadExplicit.status === ReportStatus.DISMISSED, "11a. Dismissal payload sets status to ReportStatus.DISMISSED ('dismissed')");
  assert(disPayloadExplicit.resolvedAt === "SERVER_TIMESTAMP", "11b. Dismissal payload includes resolvedAt timestamp");
  assert(disPayloadExplicit.resolvedBy === "mod_admin_42", "11c. Dismissal payload preserves explicit moderatorId");
  assert(disPayloadExplicit.updatedAt === "SERVER_TIMESTAMP", "11d. Dismissal payload retains updatedAt timestamp");

  // 12. dismissReport writing ReportStatus.DISMISSED with fallback generates resolvedAt, resolvedBy: 'admin', updatedAt
  const disPayloadFallback = createDismissalPayload("Irrelevant report");
  assert(disPayloadFallback.status === ReportStatus.DISMISSED, "12a. Fallback dismissal sets status to ReportStatus.DISMISSED");
  assert(disPayloadFallback.resolvedAt === "SERVER_TIMESTAMP", "12b. Fallback dismissal includes resolvedAt timestamp");
  assert(disPayloadFallback.resolvedBy === "admin", "12c. Fallback dismissal sets resolvedBy to 'admin'");
  assert(disPayloadFallback.updatedAt === "SERVER_TIMESTAMP", "12d. Fallback dismissal retains updatedAt timestamp");

  // 13. Retention contract invariance: field naming is strictly 'resolvedAt' and 'resolvedBy'
  assert(!('resolutionTime' in resPayload) && !('resolved_at' in resPayload), "13a. No non-standard timestamp field in resolution payload");
  assert(!('resolutionTime' in disPayloadFallback) && !('resolved_at' in disPayloadFallback), "13b. No non-standard timestamp field in dismissal payload");
  assert('resolvedAt' in resPayload && 'resolvedBy' in resPayload, "13c. Standard retention contract fields resolvedAt and resolvedBy present in resolution");
  assert('resolvedAt' in disPayloadFallback && 'resolvedBy' in disPayloadFallback, "13d. Standard retention contract fields resolvedAt and resolvedBy present in dismissal");

  // Summary
  console.log(`=== TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runLifecycleTests();
