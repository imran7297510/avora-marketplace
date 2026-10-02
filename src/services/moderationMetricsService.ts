import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp,
  increment,
  Transaction,
  collection,
  query,
  where,
  getCountFromServer
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface ModerationMetricsDoc {
  allReportsCount: number;
  availableReportsCount: number;
  pendingReportsCount: number;
  resolvedReportsCount: number;
  dismissedReportsCount: number;
  lastUpdated?: any;
}

export interface HistoricalDryRunResult {
  storedMetrics: ModerationMetricsDoc | null;
  marketplace: {
    total: number;
    open: number;
    resolved: number;
    dismissed: number;
  };
  arena: {
    total: number;
    listing: number;
    negotiation: number;
    user: number;
    listingPending: number;
    listingReviewing: number;
    listingResolved: number;
    listingDismissed: number;
    negotiationPending: number;
    negotiationReviewing: number;
    negotiationResolved: number;
    negotiationDismissed: number;
  };
  baseline: {
    allReportsCount: number;
    availableReportsCount: number;
    pendingReportsCount: number;
    resolvedReportsCount: number;
    dismissedReportsCount: number;
  };
  invariants: {
    sumMatchesAvailable: boolean;
    allGteAvailable: boolean;
    userReportsExcluded: boolean;
  };
  executionTimestamp: number;
}

const METRICS_DOC_PATH = 'system_metrics';
const METRICS_DOC_ID = 'moderation';
const CACHE_TTL_MS = 3 * 60 * 1000; // 3-minute TTL cache

let cachedMetrics: { data: ModerationMetricsDoc; timestamp: number } | null = null;
let inFlightMetricsPromise: Promise<ModerationMetricsDoc> | null = null;

export const DEFAULT_MODERATION_METRICS: ModerationMetricsDoc = {
  allReportsCount: 0,
  availableReportsCount: 0,
  pendingReportsCount: 0,
  resolvedReportsCount: 0,
  dismissedReportsCount: 0,
};

/**
 * Service managing authoritative Reported Listings moderation metrics aggregation.
 * Strictly READ-ONLY for Admin dashboard metrics display.
 * Protects Firestore reads via a 3-minute in-memory TTL cache and in-flight deduplication.
 */
export const moderationMetricsService = {
  /**
   * Retrieves authoritative Moderation statistics from /system_metrics/moderation.
   * Returns cached value if within 3-minute TTL window.
   * Never downloads report collections or documents.
   */
  async getAuthoritativeModerationMetrics(): Promise<ModerationMetricsDoc> {
    const now = Date.now();

    // 1. Check TTL cache
    if (cachedMetrics && (now - cachedMetrics.timestamp < CACHE_TTL_MS)) {
      return cachedMetrics.data;
    }

    // 2. Prevent duplicate in-flight requests
    if (inFlightMetricsPromise) {
      const result = await inFlightMetricsPromise;
      return result || DEFAULT_MODERATION_METRICS;
    }

    // 3. Fetch from /system_metrics/moderation
    inFlightMetricsPromise = (async () => {
      try {
        const metricsRef = doc(db, METRICS_DOC_PATH, METRICS_DOC_ID);
        const snap = await getDoc(metricsRef);

        if (snap.exists()) {
          const raw = snap.data();
          const parsed: ModerationMetricsDoc = {
            allReportsCount: typeof raw.allReportsCount === 'number' && raw.allReportsCount >= 0 ? raw.allReportsCount : 0,
            availableReportsCount: typeof raw.availableReportsCount === 'number' && raw.availableReportsCount >= 0 ? raw.availableReportsCount : 0,
            pendingReportsCount: typeof raw.pendingReportsCount === 'number' && raw.pendingReportsCount >= 0 ? raw.pendingReportsCount : 0,
            resolvedReportsCount: typeof raw.resolvedReportsCount === 'number' && raw.resolvedReportsCount >= 0 ? raw.resolvedReportsCount : 0,
            dismissedReportsCount: typeof raw.dismissedReportsCount === 'number' && raw.dismissedReportsCount >= 0 ? raw.dismissedReportsCount : 0,
            lastUpdated: raw.lastUpdated
          };

          cachedMetrics = { data: parsed, timestamp: Date.now() };
          return parsed;
        }

        // Aggregate uninitialized; return default zeros
        return DEFAULT_MODERATION_METRICS;
      } catch (err) {
        console.warn("[moderationMetricsService] Could not read /system_metrics/moderation:", err);
        return DEFAULT_MODERATION_METRICS;
      } finally {
        inFlightMetricsPromise = null;
      }
    })();

    const finalData = await inFlightMetricsPromise;
    return finalData || DEFAULT_MODERATION_METRICS;
  },

  /**
   * Clears the in-memory metrics cache.
   */
  clearCache() {
    cachedMetrics = null;
    inFlightMetricsPromise = null;
  },

  /**
   * Records accounting for a NEW Reported Listings report creation.
   * Increments:
   *   allReportsCount +1
   *   availableReportsCount +1
   *   pendingReportsCount +1
   * 
   * Explicitly excludes Arena user profile reports (targetType === "user").
   */
  recordReportCreated(targetType?: string, transaction?: Transaction): void {
    if (targetType === 'user') {
      // Excluded: user reports belong to Reported Profiles, not Reported Listings.
      return;
    }

    const metricsRef = doc(db, METRICS_DOC_PATH, METRICS_DOC_ID);
    const updatePayload = {
      allReportsCount: increment(1),
      availableReportsCount: increment(1),
      pendingReportsCount: increment(1),
      lastUpdated: serverTimestamp()
    };

    if (transaction) {
      transaction.set(metricsRef, updatePayload, { merge: true });
    } else {
      setDoc(metricsRef, updatePayload, { merge: true }).catch((err) => {
        console.error("Failed to record report creation metrics:", err);
      });
    }

    this.clearCache();
  },

  /**
   * Records accounting for a Reported Listings report finalization (RESOLVED or DISMISSED).
   * 
   * Idempotency Guard:
   *   If previousStatus is already "RESOLVED" or "DISMISSED", does NOTHING.
   * 
   * Target Guard:
   *   If targetType is "user", does NOTHING.
   * 
   * PENDING -> RESOLVED:
   *   pendingReportsCount -1
   *   resolvedReportsCount +1
   *   availableReportsCount unchanged
   * 
   * PENDING -> DISMISSED:
   *   pendingReportsCount -1
   *   dismissedReportsCount +1
   *   availableReportsCount unchanged
   */
  recordReportFinalized(
    previousStatus: string | undefined | null,
    newStatus: 'RESOLVED' | 'DISMISSED',
    targetType?: string,
    transaction?: Transaction
  ): void {
    const prevNorm = String(previousStatus || '').trim().toUpperCase();
    if (prevNorm === 'RESOLVED' || prevNorm === 'DISMISSED') {
      // Already finalized: Idempotent no-op to prevent double counting
      return;
    }

    if (targetType === 'user') {
      // Excluded: user reports belong to Reported Profiles, not Reported Listings.
      return;
    }

    const metricsRef = doc(db, METRICS_DOC_PATH, METRICS_DOC_ID);
    const updatePayload: any = {
      pendingReportsCount: increment(-1),
      lastUpdated: serverTimestamp()
    };

    if (newStatus === 'RESOLVED') {
      updatePayload.resolvedReportsCount = increment(1);
    } else {
      updatePayload.dismissedReportsCount = increment(1);
    }

    if (transaction) {
      transaction.set(metricsRef, updatePayload, { merge: true });
    } else {
      setDoc(metricsRef, updatePayload, { merge: true }).catch((err) => {
        console.error("Failed to record report finalization metrics:", err);
      });
    }

    this.clearCache();
  },

  /**
   * STRICTLY READ-ONLY Historical Reconciliation Dry Run.
   * Executes low-cost getCountFromServer() aggregation queries and single getDoc() on metrics.
   * Zero production writes, updates, or deletes.
   */
  async runHistoricalReconciliationDryRun(): Promise<HistoricalDryRunResult> {
    // 1. Fetch current stored metrics
    const metricsRef = doc(db, METRICS_DOC_PATH, METRICS_DOC_ID);
    const metricsSnap = await getDoc(metricsRef);
    let storedMetrics: ModerationMetricsDoc | null = null;
    if (metricsSnap.exists()) {
      storedMetrics = metricsSnap.data() as ModerationMetricsDoc;
    }

    // 2. Marketplace aggregate counts
    const mpTotalSnap = await getCountFromServer(collection(db, "reports"));
    const mpOpenSnap = await getCountFromServer(query(collection(db, "reports"), where("status", "==", "OPEN")));
    const mpResolvedSnap = await getCountFromServer(query(collection(db, "reports"), where("status", "==", "RESOLVED")));
    const mpDismissedSnap = await getCountFromServer(query(collection(db, "reports"), where("status", "==", "DISMISSED")));

    // 3. Arena targetType aggregate counts
    const arTotalSnap = await getCountFromServer(collection(db, "arena_reports"));
    const arListingSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "listing")));
    const arNegotiationSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "negotiation")));
    const arUserSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "user")));

    // 4. Arena listing status counts
    const arListPendSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "listing"), where("status", "==", "pending")));
    const arListRevSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "listing"), where("status", "==", "reviewing")));
    const arListResSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "listing"), where("status", "==", "resolved")));
    const arListDismSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "listing"), where("status", "==", "dismissed")));

    // 5. Arena negotiation status counts
    const arNegPendSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "negotiation"), where("status", "==", "pending")));
    const arNegRevSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "negotiation"), where("status", "==", "reviewing")));
    const arNegResSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "negotiation"), where("status", "==", "resolved")));
    const arNegDismSnap = await getCountFromServer(query(collection(db, "arena_reports"), where("targetType", "==", "negotiation"), where("status", "==", "dismissed")));

    const marketplace = {
      total: mpTotalSnap.data().count,
      open: mpOpenSnap.data().count,
      resolved: mpResolvedSnap.data().count,
      dismissed: mpDismissedSnap.data().count,
    };

    const arena = {
      total: arTotalSnap.data().count,
      listing: arListingSnap.data().count,
      negotiation: arNegotiationSnap.data().count,
      user: arUserSnap.data().count,
      listingPending: arListPendSnap.data().count,
      listingReviewing: arListRevSnap.data().count,
      listingResolved: arListResSnap.data().count,
      listingDismissed: arListDismSnap.data().count,
      negotiationPending: arNegPendSnap.data().count,
      negotiationReviewing: arNegRevSnap.data().count,
      negotiationResolved: arNegResSnap.data().count,
      negotiationDismissed: arNegDismSnap.data().count,
    };

    const allReportsCount = marketplace.total + arena.listing + arena.negotiation;
    const availableReportsCount = marketplace.total + arena.listing + arena.negotiation;
    const pendingReportsCount = marketplace.open + arena.listingPending + arena.listingReviewing + arena.negotiationPending + arena.negotiationReviewing;
    const resolvedReportsCount = marketplace.resolved + arena.listingResolved + arena.negotiationResolved;
    const dismissedReportsCount = marketplace.dismissed + arena.listingDismissed + arena.negotiationDismissed;

    const sumSubstates = pendingReportsCount + resolvedReportsCount + dismissedReportsCount;

    return {
      storedMetrics,
      marketplace,
      arena,
      baseline: {
        allReportsCount,
        availableReportsCount,
        pendingReportsCount,
        resolvedReportsCount,
        dismissedReportsCount,
      },
      invariants: {
        sumMatchesAvailable: availableReportsCount === sumSubstates,
        allGteAvailable: allReportsCount >= availableReportsCount,
        userReportsExcluded: true,
      },
      executionTimestamp: Date.now()
    };
  },

  /**
   * Controlled Historical Moderation Metrics Initialization (Phase 2C Step 2).
   * Strictly performs EXACTLY ONE surgical production write to /system_metrics/moderation.
   */
  async initializeModerationMetricsBaseline(): Promise<{
    success: boolean;
    preWriteState: ModerationMetricsDoc | null;
    postWriteState: ModerationMetricsDoc;
    invariantsPass: boolean;
  }> {
    const metricsRef = doc(db, METRICS_DOC_PATH, METRICS_DOC_ID);

    // 1. PRE-WRITE SAFETY CHECK: Read once and verify clean baseline
    const preSnap = await getDoc(metricsRef);
    let preWriteState: ModerationMetricsDoc | null = null;
    if (preSnap.exists()) {
      preWriteState = preSnap.data() as ModerationMetricsDoc;
      const isAlreadyInitialized = (
        typeof preWriteState.allReportsCount === 'number' &&
        typeof preWriteState.availableReportsCount === 'number' &&
        typeof preWriteState.pendingReportsCount === 'number' &&
        typeof preWriteState.resolvedReportsCount === 'number' &&
        typeof preWriteState.dismissedReportsCount === 'number'
      );

      if (isAlreadyInitialized) {
        throw new Error(
          `Pre-write safety check aborted: /system_metrics/moderation is already initialized (one-time operation locked): ${JSON.stringify(preWriteState)}`
        );
      }

      const hasUnexpectedNonZero = (
        (typeof preWriteState.allReportsCount === 'number' && preWriteState.allReportsCount > 0) ||
        (typeof preWriteState.availableReportsCount === 'number' && preWriteState.availableReportsCount > 0) ||
        (typeof preWriteState.pendingReportsCount === 'number' && preWriteState.pendingReportsCount > 0) ||
        (typeof preWriteState.resolvedReportsCount === 'number' && preWriteState.resolvedReportsCount > 0) ||
        (typeof preWriteState.dismissedReportsCount === 'number' && preWriteState.dismissedReportsCount > 0)
      );

      if (hasUnexpectedNonZero) {
        throw new Error(
          `Pre-write safety check aborted: /system_metrics/moderation already contains non-zero production data: ${JSON.stringify(preWriteState)}`
        );
      }
    }

    // 2. CONTROLLED SINGLE SURGICAL INITIALIZATION WRITE (Exactly 1 write)
    const baselinePayload = {
      allReportsCount: 0,
      availableReportsCount: 0,
      pendingReportsCount: 0,
      resolvedReportsCount: 0,
      dismissedReportsCount: 0,
      lastUpdated: serverTimestamp()
    };

    await setDoc(metricsRef, baselinePayload, { merge: true });
    this.clearCache();

    // 3. POST-WRITE VERIFICATION: Read once and verify stored document
    const postSnap = await getDoc(metricsRef);
    if (!postSnap.exists()) {
      throw new Error("Post-write verification failed: /system_metrics/moderation does not exist after write.");
    }

    const postWriteState = postSnap.data() as ModerationMetricsDoc;
    const invariantsPass = (
      (postWriteState.availableReportsCount ?? 0) === (
        (postWriteState.pendingReportsCount ?? 0) +
        (postWriteState.resolvedReportsCount ?? 0) +
        (postWriteState.dismissedReportsCount ?? 0)
      ) &&
      (postWriteState.allReportsCount ?? 0) >= (postWriteState.availableReportsCount ?? 0)
    );

    return {
      success: true,
      preWriteState,
      postWriteState,
      invariantsPass
    };
  }
};
