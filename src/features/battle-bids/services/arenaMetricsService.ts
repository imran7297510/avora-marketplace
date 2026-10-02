import { 
  doc, 
  getDoc, 
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { convertToUSD } from '../../../../functions/src/battle-bids/currencyRates';

export interface ArenaMetricsDoc {
  liveBattlesCount: number;
  liveBidsCount: number;
  transactions24hCount: number;
  totalVolumeUSD: number;
  totalSettledOrdersCount: number;
  lastUpdated?: any;
}

const METRICS_DOC_PATH = 'system_metrics';
const METRICS_DOC_ID = 'arena';
const CACHE_TTL_MS = 3 * 60 * 1000; // 3-minute TTL cache

let cachedMetrics: { data: ArenaMetricsDoc; timestamp: number } | null = null;
let inFlightMetricsPromise: Promise<ArenaMetricsDoc | null> | null = null;

const DEFAULT_METRICS: ArenaMetricsDoc = {
  liveBattlesCount: 0,
  liveBidsCount: 0,
  transactions24hCount: 0,
  totalVolumeUSD: 0,
  totalSettledOrdersCount: 0,
};

/**
 * Service managing authoritative Battle Bids Arena metrics aggregation.
 * Strictly READ-ONLY for homepage & visitor reads.
 * Protects Firestore reads via a 3-minute in-memory TTL cache and in-flight deduplication.
 */
export const arenaMetricsService = {
  /**
   * Retrieves authoritative Arena statistics from /system_metrics/arena.
   * Returns cached value if within 3-minute TTL window.
   * Never downloads active auction documents or bid subcollections.
   */
  async getAuthoritativeArenaMetrics(): Promise<ArenaMetricsDoc> {
    const now = Date.now();

    // 1. Check TTL cache
    if (cachedMetrics && (now - cachedMetrics.timestamp < CACHE_TTL_MS)) {
      return cachedMetrics.data;
    }

    // 2. Prevent duplicate in-flight requests
    if (inFlightMetricsPromise) {
      const result = await inFlightMetricsPromise;
      return result || DEFAULT_METRICS;
    }

    // 3. Fetch from /system_metrics/arena
    inFlightMetricsPromise = (async () => {
      try {
        const metricsRef = doc(db, METRICS_DOC_PATH, METRICS_DOC_ID);
        const snap = await getDoc(metricsRef);

        if (snap.exists()) {
          const raw = snap.data();
          const parsed: ArenaMetricsDoc = {
            liveBattlesCount: typeof raw.liveBattlesCount === 'number' && raw.liveBattlesCount >= 0 ? raw.liveBattlesCount : 0,
            liveBidsCount: typeof raw.liveBidsCount === 'number' && raw.liveBidsCount >= 0 ? raw.liveBidsCount : 0,
            transactions24hCount: typeof raw.transactions24hCount === 'number' && raw.transactions24hCount >= 0 ? raw.transactions24hCount : 0,
            totalVolumeUSD: typeof raw.totalVolumeUSD === 'number' && raw.totalVolumeUSD >= 0 ? raw.totalVolumeUSD : 0,
            totalSettledOrdersCount: typeof raw.totalSettledOrdersCount === 'number' && raw.totalSettledOrdersCount >= 0 ? raw.totalSettledOrdersCount : 0,
            lastUpdated: raw.lastUpdated
          };

          cachedMetrics = { data: parsed, timestamp: Date.now() };
          return parsed;
        }

        // Aggregate uninitialized; return default zeros without client writes
        return DEFAULT_METRICS;
      } catch (err) {
        console.warn("[arenaMetricsService] Could not read /system_metrics/arena:", err);
        return DEFAULT_METRICS;
      } finally {
        inFlightMetricsPromise = null;
      }
    })();

    const finalData = await inFlightMetricsPromise;
    return finalData || DEFAULT_METRICS;
  },

  /**
   * Clears the in-memory metrics cache.
   */
  clearCache() {
    cachedMetrics = null;
    inFlightMetricsPromise = null;
  },

  /**
   * Administrative Reconciliation Utility.
   * Full scan of active arena auctions and settled Battle Bids orders.
   * Callable only by authorized administrators or maintenance tools.
   */
  async reconcileArenaMetrics(): Promise<ArenaMetricsDoc> {
    const nowMs = Date.now();
    const twentyFourHoursAgoMs = nowMs - 24 * 60 * 60 * 1000;

    // 1. Fetch active auctions
    const auctionsQuery = query(collection(db, 'arena_auctions'), where('status', '==', 'active'));
    const auctionsSnap = await getDocs(auctionsQuery);

    let liveBattlesCount = 0;
    let liveBidsCount = 0;
    let totalVolumeUSD = 0;

    auctionsSnap.docs.forEach(d => {
      const item = d.data();
      if (
        item.status === 'active' &&
        item.isNegotiationOnly !== true &&
        !item.deleted &&
        !item.isPermanentlyRemoved &&
        !item.isSuspended
      ) {
        const endMs = typeof item.endTime === 'number' 
          ? item.endTime 
          : (item.endTime?.toMillis ? item.endTime.toMillis() : (item.endTime ? new Date(item.endTime).getTime() : 0));
        
        if (endMs > nowMs) {
          liveBattlesCount += 1;
          liveBidsCount += (typeof item.bidsCount === 'number' && item.bidsCount > 0 ? item.bidsCount : 0);
          
          const rawVal = Number(item.currentBid) > 0 
            ? Number(item.currentBid) 
            : (Number(item.startingPrice) > 0 ? Number(item.startingPrice) : 0);
          const currency = item.currency || 'USD';
          const vol = convertToUSD(rawVal, currency) || 0;
          totalVolumeUSD += vol;
        }
      }
    });

    totalVolumeUSD = Math.round(totalVolumeUSD * 100) / 100;

    // 2. Fetch settled Battle Bids orders
    const ordersQuery = query(collection(db, 'orders'), where('source', '==', 'battle_bids'));
    const ordersSnap = await getDocs(ordersQuery);

    let totalSettledOrdersCount = 0;
    let transactions24hCount = 0;
    const settledStatuses = new Set(['DEAL_DONE', 'COMPLETED']);

    ordersSnap.docs.forEach(d => {
      const order = d.data();
      if (settledStatuses.has(order.status)) {
        totalSettledOrdersCount += 1;
        const settlementTime = order.updatedAt?.toMillis 
          ? order.updatedAt.toMillis() 
          : (order.paymentVerifiedAt?.toMillis ? order.paymentVerifiedAt.toMillis() : (order.createdAt?.toMillis ? order.createdAt.toMillis() : 0));
        if (settlementTime >= twentyFourHoursAgoMs) {
          transactions24hCount += 1;
        }
      }
    });

    const aggregate: ArenaMetricsDoc = {
      liveBattlesCount,
      liveBidsCount,
      transactions24hCount,
      totalVolumeUSD,
      totalSettledOrdersCount,
      lastUpdated: serverTimestamp()
    };

    const metricsRef = doc(db, METRICS_DOC_PATH, METRICS_DOC_ID);
    await setDoc(metricsRef, aggregate, { merge: true });

    cachedMetrics = { data: aggregate, timestamp: Date.now() };
    return aggregate;
  }
};
