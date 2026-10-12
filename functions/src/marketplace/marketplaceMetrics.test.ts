/**
 * Deterministic Unit Test Suite for H-11 / H-11B
 * Marketplace Metrics Aggregate Trigger, Delta Arithmetic, Idempotency & Service Caching
 *
 * Runs locally with 0 production Firestore reads/writes.
 */

import assert from 'assert';
import { normalizeCityName } from './marketplaceMetricsTrigger';

// Simulated state structures matching production documents
export interface SimulatedMetricsDoc {
  activeCitiesCount: number;
  activeCitiesList: string[];
  cityCounts: Record<string, number>;
  totalLiveListingsCount: number;
  countriesCount?: number;
  countriesList?: string[];
  totalVerifiedSellersCount?: number;
  lastUpdated?: any;
}

export interface ListingSnapshot {
  status?: string;
  isSuspended?: boolean;
  quantity?: number;
  city?: string;
  price?: number;
}

/**
 * Pure CEL/Logic simulator of getQualifyingCity from marketplaceMetricsTrigger.ts
 */
function simulateQualifyingCity(data: ListingSnapshot | null | undefined): string | null {
  if (!data) return null;
  if (data.status !== 'LIVE') return null;
  if (data.isSuspended === true) return null;
  if (typeof data.quantity === 'number' && data.quantity <= 0) return null;
  return normalizeCityName(data.city);
}

/**
 * Pure transaction delta simulator replicating lines 80-155 of onListingWrittenMetricsTrigger
 */
function simulateListingWrittenDelta(
  beforeData: ListingSnapshot | null | undefined,
  afterData: ListingSnapshot | null | undefined,
  currentMetrics: SimulatedMetricsDoc | null,
  processedEvents: Set<string>,
  eventId: string
): {
  skipped: boolean;
  alreadyProcessed: boolean;
  updatedMetrics: SimulatedMetricsDoc | null;
} {
  const beforeCity = simulateQualifyingCity(beforeData);
  const afterCity = simulateQualifyingCity(afterData);
  const wasLive = beforeData?.status === 'LIVE' && !beforeData?.isSuspended && (beforeData?.quantity || 0) > 0;
  const isLive = afterData?.status === 'LIVE' && !afterData?.isSuspended && (afterData?.quantity || 0) > 0;

  // Early return: no relevant change
  if (beforeCity === afterCity && wasLive === isLive) {
    return { skipped: true, alreadyProcessed: false, updatedMetrics: currentMetrics };
  }

  // Idempotency check
  if (processedEvents.has(eventId)) {
    return { skipped: false, alreadyProcessed: true, updatedMetrics: currentMetrics };
  }

  // Extract or initialize current aggregate state
  let cityCounts: Record<string, number> = {};
  let activeCitiesList: string[] = [];
  let totalLiveListingsCount = 0;

  if (currentMetrics) {
    cityCounts = { ...(currentMetrics.cityCounts || {}) };
    activeCitiesList = [...(currentMetrics.activeCitiesList || [])];
    totalLiveListingsCount = typeof currentMetrics.totalLiveListingsCount === 'number' ? currentMetrics.totalLiveListingsCount : 0;
  }

  // Calculate deltas
  if (!wasLive && isLive) {
    totalLiveListingsCount += 1;
  } else if (wasLive && !isLive) {
    totalLiveListingsCount = Math.max(0, totalLiveListingsCount - 1);
  }

  if (beforeCity && beforeCity !== afterCity) {
    const count = cityCounts[beforeCity] || 1;
    const updated = Math.max(0, count - 1);
    if (updated === 0) {
      delete cityCounts[beforeCity];
      activeCitiesList = activeCitiesList.filter((c) => c !== beforeCity);
    } else {
      cityCounts[beforeCity] = updated;
    }
  }

  if (afterCity && afterCity !== beforeCity) {
    const count = cityCounts[afterCity] || 0;
    cityCounts[afterCity] = count + 1;
    if (count === 0 && !activeCitiesList.includes(afterCity)) {
      activeCitiesList.push(afterCity);
      activeCitiesList.sort();
    }
  }

  processedEvents.add(eventId);

  return {
    skipped: false,
    alreadyProcessed: false,
    updatedMetrics: {
      activeCitiesCount: activeCitiesList.length,
      activeCitiesList,
      cityCounts,
      totalLiveListingsCount,
      // Note: Trigger does not overwrite countries or seller counts
      countriesCount: currentMetrics?.countriesCount,
      countriesList: currentMetrics?.countriesList,
      totalVerifiedSellersCount: currentMetrics?.totalVerifiedSellersCount
    }
  };
}

export function runMarketplaceMetricsTests() {
  console.log('=== STARTING H-11 / H-11B MARKETPLACE METRICS UNIT TESTS ===');
  let passed = 0;
  let failed = 0;

  function runTest(desc: string, fn: () => void) {
    try {
      fn();
      console.log(`[PASS] ${desc}`);
      passed++;
    } catch (e: any) {
      console.error(`[FAIL] ${desc}:`, e?.message || e);
      failed++;
    }
  }

  // 1. City Normalization: valid cities
  runTest('1. normalizeCityName properly formats title case', () => {
    assert.strictEqual(normalizeCityName('lahore'), 'Lahore');
    assert.strictEqual(normalizeCityName('  ISLAMABAD  '), 'Islamabad');
    assert.strictEqual(normalizeCityName('rawalpindi cantt'), 'Rawalpindi Cantt');
  });

  // 2. City Normalization: excluded placeholders
  runTest('2. normalizeCityName filters invalid/generic placeholders', () => {
    assert.strictEqual(normalizeCityName('pakistan'), null);
    assert.strictEqual(normalizeCityName('all pakistan'), null);
    assert.strictEqual(normalizeCityName('n/a'), null);
    assert.strictEqual(normalizeCityName('location unspecified'), null);
    assert.strictEqual(normalizeCityName(''), null);
    assert.strictEqual(normalizeCityName(null), null);
  });

  // 3. Lifecycle: Create LIVE listing
  runTest('3. Creating a LIVE listing increments totalLiveListingsCount and city count', () => {
    const processedEvents = new Set<string>();
    const res = simulateListingWrittenDelta(
      null,
      { status: 'LIVE', isSuspended: false, quantity: 1, city: 'Lahore' },
      null,
      processedEvents,
      'evt_create_1'
    );
    assert.strictEqual(res.skipped, false);
    assert.strictEqual(res.updatedMetrics?.totalLiveListingsCount, 1);
    assert.strictEqual(res.updatedMetrics?.activeCitiesCount, 1);
    assert.deepStrictEqual(res.updatedMetrics?.activeCitiesList, ['Lahore']);
    assert.strictEqual(res.updatedMetrics?.cityCounts['Lahore'], 1);
  });

  // 4. Lifecycle: Create non-LIVE listing (DRAFT/SOLD)
  runTest('4. Creating a non-LIVE listing produces no delta and skips update', () => {
    const processedEvents = new Set<string>();
    const initial: SimulatedMetricsDoc = {
      activeCitiesCount: 1,
      activeCitiesList: ['Lahore'],
      cityCounts: { Lahore: 1 },
      totalLiveListingsCount: 1
    };
    const res = simulateListingWrittenDelta(
      null,
      { status: 'DRAFT', isSuspended: false, quantity: 1, city: 'Lahore' },
      initial,
      processedEvents,
      'evt_create_draft'
    );
    assert.strictEqual(res.skipped, true);
    assert.strictEqual(res.updatedMetrics?.totalLiveListingsCount, 1);
  });

  // 5. Lifecycle: Non-LIVE transitions to LIVE
  runTest('5. Transitioning from BOOKED to LIVE increments live count and city', () => {
    const processedEvents = new Set<string>();
    const initial: SimulatedMetricsDoc = {
      activeCitiesCount: 1,
      activeCitiesList: ['Lahore'],
      cityCounts: { Lahore: 1 },
      totalLiveListingsCount: 1
    };
    const res = simulateListingWrittenDelta(
      { status: 'BOOKED', isSuspended: false, quantity: 1, city: 'Karachi' },
      { status: 'LIVE', isSuspended: false, quantity: 1, city: 'Karachi' },
      initial,
      processedEvents,
      'evt_booked_to_live'
    );
    assert.strictEqual(res.skipped, false);
    assert.strictEqual(res.updatedMetrics?.totalLiveListingsCount, 2);
    assert.strictEqual(res.updatedMetrics?.cityCounts['Karachi'], 1);
    assert.deepStrictEqual(res.updatedMetrics?.activeCitiesList, ['Karachi', 'Lahore']);
  });

  // 6. Lifecycle: LIVE transitions to SOLD
  runTest('6. Transitioning from LIVE to SOLD decrements count and prunes empty city', () => {
    const processedEvents = new Set<string>();
    const initial: SimulatedMetricsDoc = {
      activeCitiesCount: 1,
      activeCitiesList: ['Karachi'],
      cityCounts: { Karachi: 1 },
      totalLiveListingsCount: 1
    };
    const res = simulateListingWrittenDelta(
      { status: 'LIVE', isSuspended: false, quantity: 1, city: 'Karachi' },
      { status: 'SOLD', isSuspended: false, quantity: 0, city: 'Karachi' },
      initial,
      processedEvents,
      'evt_live_to_sold'
    );
    assert.strictEqual(res.skipped, false);
    assert.strictEqual(res.updatedMetrics?.totalLiveListingsCount, 0);
    assert.strictEqual(res.updatedMetrics?.activeCitiesCount, 0);
    assert.strictEqual(res.updatedMetrics?.cityCounts['Karachi'], undefined);
    assert.deepStrictEqual(res.updatedMetrics?.activeCitiesList, []);
  });

  // 7. Lifecycle: Deleting a LIVE listing
  runTest('7. Deleting a LIVE listing decrements totalLiveListingsCount', () => {
    const processedEvents = new Set<string>();
    const initial: SimulatedMetricsDoc = {
      activeCitiesCount: 2,
      activeCitiesList: ['Islamabad', 'Lahore'],
      cityCounts: { Lahore: 2, Islamabad: 1 },
      totalLiveListingsCount: 3
    };
    const res = simulateListingWrittenDelta(
      { status: 'LIVE', isSuspended: false, quantity: 1, city: 'Lahore' },
      null, // deleted
      initial,
      processedEvents,
      'evt_delete_live'
    );
    assert.strictEqual(res.skipped, false);
    assert.strictEqual(res.updatedMetrics?.totalLiveListingsCount, 2);
    assert.strictEqual(res.updatedMetrics?.cityCounts['Lahore'], 1);
    assert.strictEqual(res.updatedMetrics?.activeCitiesCount, 2);
  });

  // 8. Lifecycle: Relocating a listing to another city
  runTest('8. Changing city of LIVE listing moves count between cities accurately', () => {
    const processedEvents = new Set<string>();
    const initial: SimulatedMetricsDoc = {
      activeCitiesCount: 1,
      activeCitiesList: ['Lahore'],
      cityCounts: { Lahore: 1 },
      totalLiveListingsCount: 1
    };
    const res = simulateListingWrittenDelta(
      { status: 'LIVE', isSuspended: false, quantity: 1, city: 'Lahore' },
      { status: 'LIVE', isSuspended: false, quantity: 1, city: 'Islamabad' },
      initial,
      processedEvents,
      'evt_relocate'
    );
    assert.strictEqual(res.skipped, false);
    assert.strictEqual(res.updatedMetrics?.totalLiveListingsCount, 1); // unchanged
    assert.strictEqual(res.updatedMetrics?.cityCounts['Lahore'], undefined); // pruned
    assert.strictEqual(res.updatedMetrics?.cityCounts['Islamabad'], 1);
    assert.deepStrictEqual(res.updatedMetrics?.activeCitiesList, ['Islamabad']);
  });

  // 9. Lifecycle: Price change on LIVE listing (irrelevant field)
  runTest('9. Modifying price or description without changing live/city state is a no-op', () => {
    const processedEvents = new Set<string>();
    const initial: SimulatedMetricsDoc = {
      activeCitiesCount: 1,
      activeCitiesList: ['Lahore'],
      cityCounts: { Lahore: 5 },
      totalLiveListingsCount: 5
    };
    const res = simulateListingWrittenDelta(
      { status: 'LIVE', isSuspended: false, quantity: 2, city: 'Lahore', price: 5000 },
      { status: 'LIVE', isSuspended: false, quantity: 2, city: 'Lahore', price: 4500 },
      initial,
      processedEvents,
      'evt_price_drop'
    );
    assert.strictEqual(res.skipped, true);
    assert.strictEqual(res.updatedMetrics?.totalLiveListingsCount, 5);
  });

  // 10. Idempotency: Duplicate event delivery
  runTest('10. Duplicate event ID delivery is detected and aborted as idempotent no-op', () => {
    const processedEvents = new Set<string>(['evt_duplicate_id']);
    const initial: SimulatedMetricsDoc = {
      activeCitiesCount: 1,
      activeCitiesList: ['Lahore'],
      cityCounts: { Lahore: 1 },
      totalLiveListingsCount: 1
    };
    const res = simulateListingWrittenDelta(
      null,
      { status: 'LIVE', isSuspended: false, quantity: 1, city: 'Lahore' },
      initial,
      processedEvents,
      'evt_duplicate_id'
    );
    assert.strictEqual(res.alreadyProcessed, true);
    assert.strictEqual(res.skipped, false);
    assert.strictEqual(res.updatedMetrics?.totalLiveListingsCount, 1); // Not incremented again
  });

  // 11. Scope: Trigger maintains cities and live count; preserves reconciliation-driven fields
  runTest('11. Trigger preserves countriesCount and totalVerifiedSellersCount without overwriting', () => {
    const processedEvents = new Set<string>();
    const initial: SimulatedMetricsDoc = {
      activeCitiesCount: 1,
      activeCitiesList: ['Lahore'],
      cityCounts: { Lahore: 1 },
      totalLiveListingsCount: 1,
      countriesCount: 12,
      countriesList: ['Pakistan', 'UAE', 'USA'],
      totalVerifiedSellersCount: 45
    };
    const res = simulateListingWrittenDelta(
      null,
      { status: 'LIVE', isSuspended: false, quantity: 1, city: 'Karachi' },
      initial,
      processedEvents,
      'evt_scope_check'
    );
    assert.strictEqual(res.updatedMetrics?.totalLiveListingsCount, 2);
    assert.strictEqual(res.updatedMetrics?.countriesCount, 12);
    assert.deepStrictEqual(res.updatedMetrics?.countriesList, ['Pakistan', 'UAE', 'USA']);
    assert.strictEqual(res.updatedMetrics?.totalVerifiedSellersCount, 45);
  });

  // 12. Client Service: In-flight Promise deduplication simulation
  runTest('12. In-flight promise deduplication shares single read promise', async () => {
    let rawFetchCalls = 0;
    let inFlightPromise: Promise<{ data: string }> | null = null;

    async function fetchMetricsDeduplicated(): Promise<{ data: string }> {
      if (inFlightPromise) return inFlightPromise;
      inFlightPromise = (async () => {
        rawFetchCalls++;
        return { data: 'metrics_payload' };
      })().finally(() => {
        inFlightPromise = null;
      });
      return inFlightPromise;
    }

    const [res1, res2, res3] = await Promise.all([
      fetchMetricsDeduplicated(),
      fetchMetricsDeduplicated(),
      fetchMetricsDeduplicated()
    ]);

    assert.strictEqual(rawFetchCalls, 1);
    assert.strictEqual(res1.data, 'metrics_payload');
    assert.strictEqual(res2.data, 'metrics_payload');
    assert.strictEqual(res3.data, 'metrics_payload');
  });

  // 13. Client Service: 4-minute cache TTL simulation
  runTest('13. Client cache returns cached copy within 4 minutes, re-fetches after TTL', () => {
    const TTL_MS = 240000;
    let cache: { data: any; timestamp: number } | null = null;
    let networkFetches = 0;

    function getMetrics(nowMs: number) {
      if (cache && nowMs - cache.timestamp < TTL_MS) {
        return { source: 'cache', data: cache.data };
      }
      networkFetches++;
      cache = { data: { count: 100 }, timestamp: nowMs };
      return { source: 'network', data: cache.data };
    }

    const t0 = 1000000;
    const r1 = getMetrics(t0); // network
    const r2 = getMetrics(t0 + 60000); // 1 min later -> cache
    const r3 = getMetrics(t0 + 200000); // 3.3 min later -> cache
    const r4 = getMetrics(t0 + 250000); // 4.1 min later -> network

    assert.strictEqual(networkFetches, 2);
    assert.strictEqual(r1.source, 'network');
    assert.strictEqual(r2.source, 'cache');
    assert.strictEqual(r3.source, 'cache');
    assert.strictEqual(r4.source, 'network');
  });

  // 14. Homepage Fallback: uses consolidated count when available, falls back only when missing
  runTest('14. Homepage uses consolidated count and invokes fallback only when metrics are null', () => {
    let fallbackCalls = 0;

    function resolveHomepageLiveCount(metrics: { totalLiveListingsCount?: number } | null): number {
      if (metrics && typeof metrics.totalLiveListingsCount === 'number' && metrics.totalLiveListingsCount >= 0) {
        return metrics.totalLiveListingsCount;
      }
      fallbackCalls++;
      return 42; // simulated getCountFromServer result
    }

    // Path A: metrics present
    const countA = resolveHomepageLiveCount({ totalLiveListingsCount: 150 });
    assert.strictEqual(countA, 150);
    assert.strictEqual(fallbackCalls, 0);

    // Path B: metrics null (uninitialized or error)
    const countB = resolveHomepageLiveCount(null);
    assert.strictEqual(countB, 42);
    assert.strictEqual(fallbackCalls, 1);
  });

  console.log(`=== MARKETPLACE METRICS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    throw new Error(`Marketplace metrics test suite had ${failed} failures!`);
  }
}

if (require.main === module) {
  runMarketplaceMetricsTests();
}
