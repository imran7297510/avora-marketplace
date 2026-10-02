// Pure deterministic state transition functions for unit testing accounting rules

interface ModerationMetricsDoc {
  allReportsCount: number;
  availableReportsCount: number;
  pendingReportsCount: number;
  resolvedReportsCount: number;
  dismissedReportsCount: number;
  lastUpdated?: any;
}

const DEFAULT_MODERATION_METRICS: ModerationMetricsDoc = {
  allReportsCount: 0,
  availableReportsCount: 0,
  pendingReportsCount: 0,
  resolvedReportsCount: 0,
  dismissedReportsCount: 0,
};

function applyReportCreation(
  current: ModerationMetricsDoc,
  targetType?: string
): ModerationMetricsDoc {
  if (targetType === 'user') {
    return { ...current };
  }
  return {
    ...current,
    allReportsCount: current.allReportsCount + 1,
    availableReportsCount: current.availableReportsCount + 1,
    pendingReportsCount: current.pendingReportsCount + 1,
  };
}

function applyReportFinalization(
  current: ModerationMetricsDoc,
  previousStatus: string | undefined | null,
  newStatus: 'RESOLVED' | 'DISMISSED',
  targetType?: string
): ModerationMetricsDoc {
  const prevNorm = String(previousStatus || '').trim().toUpperCase();
  if (prevNorm === 'RESOLVED' || prevNorm === 'DISMISSED') {
    return { ...current }; // Idempotent guard
  }

  if (targetType === 'user') {
    return { ...current }; // Profile report guard
  }

  const pendingNext = Math.max(0, current.pendingReportsCount - 1);
  if (newStatus === 'RESOLVED') {
    return {
      ...current,
      pendingReportsCount: pendingNext,
      resolvedReportsCount: current.resolvedReportsCount + 1,
    };
  } else {
    return {
      ...current,
      pendingReportsCount: pendingNext,
      dismissedReportsCount: current.dismissedReportsCount + 1,
    };
  }
}

// Test Suite Runner
function runTests() {
  console.log("=== RUNNING PHASE 2B MODERATION METRICS UNIT TESTS ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  const initial: ModerationMetricsDoc = { ...DEFAULT_MODERATION_METRICS };

  // 1. Marketplace report creation increments all +1, available +1, pending +1
  const m1 = applyReportCreation(initial, undefined);
  assert(
    m1.allReportsCount === 1 && m1.availableReportsCount === 1 && m1.pendingReportsCount === 1,
    "1. Marketplace report creation increments all +1, available +1, pending +1"
  );

  // 2. Arena listing report creation increments all +1, available +1, pending +1
  const m2 = applyReportCreation(m1, 'listing');
  assert(
    m2.allReportsCount === 2 && m2.availableReportsCount === 2 && m2.pendingReportsCount === 2,
    "2. Arena listing report creation increments all +1, available +1, pending +1"
  );

  // 3. Arena negotiation report creation increments all +1, available +1, pending +1
  const m3 = applyReportCreation(m2, 'negotiation');
  assert(
    m3.allReportsCount === 3 && m3.availableReportsCount === 3 && m3.pendingReportsCount === 3,
    "3. Arena negotiation report creation increments all +1, available +1, pending +1"
  );

  // 4. Arena user report does NOT affect Reported Listings metrics
  const m4 = applyReportCreation(m3, 'user');
  assert(
    m4.allReportsCount === 3 && m4.availableReportsCount === 3 && m4.pendingReportsCount === 3,
    "4. Arena user report does NOT affect Reported Listings metrics"
  );

  // Add 2 more reports to have 5 total reports for subsequent finalization steps
  const m4b = applyReportCreation(applyReportCreation(m4, 'listing'), 'negotiation');
  // m4b has 5 all, 5 available, 5 pending

  // 5. Pending -> Resolved: pending -1, resolved +1, available unchanged
  const m5 = applyReportFinalization(m4b, 'OPEN', 'RESOLVED', 'listing');
  assert(
    m5.pendingReportsCount === 4 && m5.resolvedReportsCount === 1 && m5.availableReportsCount === 5,
    "5. Pending -> Resolved: pending -1, resolved +1, available unchanged"
  );

  // 6. Pending -> Dismissed: pending -1, dismissed +1, available unchanged
  const m6 = applyReportFinalization(m5, 'PENDING', 'DISMISSED', 'negotiation');
  assert(
    m6.pendingReportsCount === 3 && m6.dismissedReportsCount === 1 && m6.availableReportsCount === 5,
    "6. Pending -> Dismissed: pending -1, dismissed +1, available unchanged"
  );

  // 7. Already Resolved cannot be counted twice
  const m7 = applyReportFinalization(m6, 'RESOLVED', 'RESOLVED', 'listing');
  assert(
    m7.pendingReportsCount === m6.pendingReportsCount &&
    m7.resolvedReportsCount === m6.resolvedReportsCount &&
    m7.dismissedReportsCount === m6.dismissedReportsCount,
    "7. Already Resolved cannot be counted twice (idempotency)"
  );

  // 8. Already Dismissed cannot be counted twice
  const m8 = applyReportFinalization(m7, 'DISMISSED', 'DISMISSED', 'negotiation');
  assert(
    m8.pendingReportsCount === m7.pendingReportsCount &&
    m8.resolvedReportsCount === m7.resolvedReportsCount &&
    m8.dismissedReportsCount === m7.dismissedReportsCount,
    "8. Already Dismissed cannot be counted twice (idempotency)"
  );

  // 9. Ignore produces Dismissed accounting
  const m9 = applyReportFinalization(m8, 'OPEN', 'DISMISSED');
  assert(
    m9.dismissedReportsCount === m8.dismissedReportsCount + 1 && m9.pendingReportsCount === 2,
    "9. Ignore produces Dismissed accounting"
  );

  // 10. Enforcement produces Resolved accounting
  const m10 = applyReportFinalization(m9, 'OPEN', 'RESOLVED');
  assert(
    m10.resolvedReportsCount === m9.resolvedReportsCount + 1 && m10.pendingReportsCount === 1,
    "10. Enforcement produces Resolved accounting"
  );

  // 11. available = pending + resolved + dismissed invariant
  const invariantHold = m10.availableReportsCount === (m10.pendingReportsCount + m10.resolvedReportsCount + m10.dismissedReportsCount);
  assert(
    invariantHold,
    `11. Metric Invariant Holds: available (${m10.availableReportsCount}) = pending (${m10.pendingReportsCount}) + resolved (${m10.resolvedReportsCount}) + dismissed (${m10.dismissedReportsCount})`
  );

  // 12. allReports never decreases during lifecycle transitions
  assert(
    m10.allReportsCount >= m9.allReportsCount && m9.allReportsCount >= m8.allReportsCount && m8.allReportsCount >= initial.allReportsCount,
    "12. allReportsCount never decreases during lifecycle transitions"
  );

  // 13. Phase 2C Step 3: First initialization on uninitialized document is ALLOWED
  function applyControlledInitialization(
    currentStored: ModerationMetricsDoc | null
  ): { success: boolean; data?: ModerationMetricsDoc; error?: string } {
    if (currentStored) {
      const isAlreadyInitialized = (
        typeof currentStored.allReportsCount === 'number' &&
        typeof currentStored.availableReportsCount === 'number' &&
        typeof currentStored.pendingReportsCount === 'number' &&
        typeof currentStored.resolvedReportsCount === 'number' &&
        typeof currentStored.dismissedReportsCount === 'number'
      );
      if (isAlreadyInitialized) {
        return {
          success: false,
          error: "Pre-write safety check aborted: /system_metrics/moderation is already initialized (one-time operation locked)"
        };
      }
    }
    return {
      success: true,
      data: {
        allReportsCount: 0,
        availableReportsCount: 0,
        pendingReportsCount: 0,
        resolvedReportsCount: 0,
        dismissedReportsCount: 0,
      }
    };
  }

  const firstInit = applyControlledInitialization(null);
  assert(
    firstInit.success === true && firstInit.data?.allReportsCount === 0,
    "13. First initialization on uninitialized document is ALLOWED"
  );

  // 14. Phase 2C Step 3: Second initialization attempt on already initialized baseline is BLOCKED
  const secondInit = applyControlledInitialization(firstInit.data!);
  assert(
    secondInit.success === false && secondInit.error?.includes("already initialized"),
    "14. Second initialization attempt on already initialized baseline is BLOCKED (one-time lock PASS)"
  );

  // 15. Phase 2C Step 3: Initialization attempt on active document with production data is BLOCKED
  const thirdInit = applyControlledInitialization(m10);
  assert(
    thirdInit.success === false && thirdInit.error?.includes("already initialized"),
    "15. Initialization attempt on active document with production data is BLOCKED (data preservation PASS)"
  );

  console.log(`\nRESULTS: ${passed} PASSED, ${failed} FAILED\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
