import { moderationMetricsService } from '../services/moderationMetricsService';

async function runSafeDryRun() {
  console.log("==================================================");
  console.log("PHASE 2C — SAFE AGGREGATION DRY RUN (QUOTA-SAFE)");
  console.log("==================================================");

  try {
    const result = await moderationMetricsService.runHistoricalReconciliationDryRun();
    const { storedMetrics, marketplace, arena, baseline, invariants } = result;

    console.log(`Current stored metrics:`, storedMetrics ? JSON.stringify(storedMetrics, null, 2) : "None (uninitialized)");
    console.log("--------------------------------------------------");
    console.log(`Marketplace counts:`);
    console.log(`- Total: ${marketplace.total}`);
    console.log(`- OPEN: ${marketplace.open}`);
    console.log(`- RESOLVED: ${marketplace.resolved}`);
    console.log(`- DISMISSED: ${marketplace.dismissed}`);
    console.log("--------------------------------------------------");
    console.log(`Arena targetType counts:`);
    console.log(`- Total arena_reports: ${arena.total}`);
    console.log(`- listing targetType: ${arena.listing}`);
    console.log(`- negotiation targetType: ${arena.negotiation}`);
    console.log(`- user targetType: ${arena.user}`);
    console.log("--------------------------------------------------");
    console.log(`Arena Listing Status counts:`);
    console.log(`- pending: ${arena.listingPending}`);
    console.log(`- reviewing: ${arena.listingReviewing}`);
    console.log(`- resolved: ${arena.listingResolved}`);
    console.log(`- dismissed: ${arena.listingDismissed}`);
    console.log("--------------------------------------------------");
    console.log(`Arena Negotiation Status counts:`);
    console.log(`- pending: ${arena.negotiationPending}`);
    console.log(`- reviewing: ${arena.negotiationReviewing}`);
    console.log(`- resolved: ${arena.negotiationResolved}`);
    console.log(`- dismissed: ${arena.negotiationDismissed}`);
    console.log("--------------------------------------------------");
    console.log("CALCULATED HISTORICAL BASELINE METRICS:");
    console.log("==================================================");
    console.log(`- allReportsCount: ${baseline.allReportsCount}`);
    console.log(`- availableReportsCount: ${baseline.availableReportsCount}`);
    console.log(`- pendingReportsCount: ${baseline.pendingReportsCount}`);
    console.log(`- resolvedReportsCount: ${baseline.resolvedReportsCount}`);
    console.log(`- dismissedReportsCount: ${baseline.dismissedReportsCount}`);
    console.log(`- Invariant Satisfied: ${invariants.sumMatchesAvailable ? "YES (PASS)" : "NO (FAIL)"}`);
    console.log("==================================================");

    if (storedMetrics) {
      console.log("\nHISTORICAL RECONCILIATION COMPARISON:");
      console.log("--------------------------------------------------");
      console.log(`Metric | Current Stored | Calculated Baseline | Difference`);
      console.log(`- allReportsCount       | ${storedMetrics.allReportsCount ?? 0} | ${baseline.allReportsCount} | ${(storedMetrics.allReportsCount ?? 0) - baseline.allReportsCount}`);
      console.log(`- availableReportsCount | ${storedMetrics.availableReportsCount ?? 0} | ${baseline.availableReportsCount} | ${(storedMetrics.availableReportsCount ?? 0) - baseline.availableReportsCount}`);
      console.log(`- pendingReportsCount   | ${storedMetrics.pendingReportsCount ?? 0} | ${baseline.pendingReportsCount} | ${(storedMetrics.pendingReportsCount ?? 0) - baseline.pendingReportsCount}`);
      console.log(`- resolvedReportsCount  | ${storedMetrics.resolvedReportsCount ?? 0} | ${baseline.resolvedReportsCount} | ${(storedMetrics.resolvedReportsCount ?? 0) - baseline.resolvedReportsCount}`);
      console.log(`- dismissedReportsCount | ${storedMetrics.dismissedReportsCount ?? 0} | ${baseline.dismissedReportsCount} | ${(storedMetrics.dismissedReportsCount ?? 0) - baseline.dismissedReportsCount}`);
      console.log("--------------------------------------------------");
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      console.warn("\n[SECURITY NOTICE]: Command-line execution lacks authenticated administrator session.");
      console.warn("Under Phase 2B.1 security rules, /system_metrics/moderation and report collections require an authenticated administrator.");
      console.warn("To execute this dry run from an authenticated context, use the 'Run Historical Metrics Dry Run' action in /admin -> Reported Listings.\n");
    } else {
      console.error("Aggregation Dry Run Error:", err);
    }
  }
}

runSafeDryRun();
