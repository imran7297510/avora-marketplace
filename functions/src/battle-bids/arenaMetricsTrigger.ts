import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { convertToUSD } from './currencyRates';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

const METRICS_DOC_PATH = 'system_metrics';
const METRICS_DOC_ID = 'arena';
const PROCESSED_EVENTS_SUBCOLLECTION = 'processed_events';

// Authoritative terminal settled states for Battle Bids orders
const SETTLED_ORDER_STATUSES = new Set(['DEAL_DONE', 'COMPLETED']);

export interface ArenaMetricsDoc {
  liveBattlesCount: number;
  liveBidsCount: number;
  transactions24hCount: number;
  totalVolumeUSD: number;
  totalSettledOrdersCount: number;
  lastUpdated: any;
}

/**
 * Extracts timestamp in milliseconds from a Firestore Timestamp, number, or ISO string.
 */
function extractMillis(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  const parsed = new Date(val).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Evaluates whether an auction qualifies as an active Live Battle.
 */
function getAuctionLiveQualification(data: any, nowMs: number): {
  isLive: boolean;
  bidsCount: number;
  volumeUSD: number;
} {
  if (!data) return { isLive: false, bidsCount: 0, volumeUSD: 0 };
  if (data.status !== 'active') return { isLive: false, bidsCount: 0, volumeUSD: 0 };
  if (data.isNegotiationOnly === true) return { isLive: false, bidsCount: 0, volumeUSD: 0 };
  if (data.deleted === true || data.isPermanentlyRemoved === true || data.isSuspended === true) {
    return { isLive: false, bidsCount: 0, volumeUSD: 0 };
  }

  const endMs = extractMillis(data.endTime);
  if (endMs <= nowMs) {
    return { isLive: false, bidsCount: 0, volumeUSD: 0 };
  }

  const bidsCount = typeof data.bidsCount === 'number' && data.bidsCount > 0 ? data.bidsCount : 0;
  const rawVal = Number(data.currentBid) > 0 
    ? Number(data.currentBid) 
    : (Number(data.startingPrice) > 0 ? Number(data.startingPrice) : 0);
  
  const currency = data.currency || 'USD';
  const volumeUSD = convertToUSD(rawVal, currency) || 0;

  return { isLive: true, bidsCount, volumeUSD };
}

/**
 * Cloud Function Trigger (v2):
 * Synchronizes /system_metrics/arena upon any mutation to arena_auctions/{auctionId}.
 * Employs exact-once transaction idempotency via system_metrics/arena/processed_events.
 */
export const onArenaAuctionWrittenMetricsTrigger = onDocumentWritten(
  'arena_auctions/{auctionId}',
  async (event) => {
    const eventId = event.id;
    if (!eventId) {
      console.warn('[onArenaAuctionWrittenMetricsTrigger] Missing event.id on invocation. Proceeding without event tracking.');
    }

    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    const nowMs = Date.now();
    const beforeQual = getAuctionLiveQualification(beforeData, nowMs);
    const afterQual = getAuctionLiveQualification(afterData, nowMs);

    // If live state, bid counts, and volume are identical, no metric mutation required
    if (
      beforeQual.isLive === afterQual.isLive &&
      beforeQual.bidsCount === afterQual.bidsCount &&
      Math.abs(beforeQual.volumeUSD - afterQual.volumeUSD) < 0.01
    ) {
      return;
    }

    const metricsRef = db.collection(METRICS_DOC_PATH).doc(METRICS_DOC_ID);
    const eventDocRef = eventId
      ? metricsRef.collection(PROCESSED_EVENTS_SUBCOLLECTION).doc(eventId)
      : null;

    try {
      const result = await db.runTransaction(async (transaction) => {
        const [eventSnap, metricsSnap] = await Promise.all([
          eventDocRef ? transaction.get(eventDocRef) : Promise.resolve(null),
          transaction.get(metricsRef)
        ]);

        if (eventSnap && eventSnap.exists) {
          return { alreadyProcessed: true };
        }

        let liveBattlesCount = 0;
        let liveBidsCount = 0;
        let totalVolumeUSD = 0;
        let transactions24hCount = 0;
        let totalSettledOrdersCount = 0;

        if (metricsSnap.exists) {
          const data = metricsSnap.data() || {};
          liveBattlesCount = typeof data.liveBattlesCount === 'number' ? data.liveBattlesCount : 0;
          liveBidsCount = typeof data.liveBidsCount === 'number' ? data.liveBidsCount : 0;
          totalVolumeUSD = typeof data.totalVolumeUSD === 'number' ? data.totalVolumeUSD : 0;
          transactions24hCount = typeof data.transactions24hCount === 'number' ? data.transactions24hCount : 0;
          totalSettledOrdersCount = typeof data.totalSettledOrdersCount === 'number' ? data.totalSettledOrdersCount : 0;
        }

        // Apply Live Battles delta
        if (!beforeQual.isLive && afterQual.isLive) {
          liveBattlesCount += 1;
        } else if (beforeQual.isLive && !afterQual.isLive) {
          liveBattlesCount = Math.max(0, liveBattlesCount - 1);
        }

        // Apply Live Bids delta
        const bidsDelta = (afterQual.isLive ? afterQual.bidsCount : 0) - (beforeQual.isLive ? beforeQual.bidsCount : 0);
        liveBidsCount = Math.max(0, liveBidsCount + bidsDelta);

        // Apply Total Volume (USD) delta
        const volDelta = (afterQual.isLive ? afterQual.volumeUSD : 0) - (beforeQual.isLive ? beforeQual.volumeUSD : 0);
        totalVolumeUSD = Math.max(0, Math.round((totalVolumeUSD + volDelta) * 100) / 100);

        transaction.set(metricsRef, {
          liveBattlesCount,
          liveBidsCount,
          totalVolumeUSD,
          transactions24hCount,
          totalSettledOrdersCount,
          lastUpdated: FieldValue.serverTimestamp()
        }, { merge: true });

        if (eventDocRef) {
          transaction.set(eventDocRef, {
            processedAt: FieldValue.serverTimestamp(),
            eventId,
            auctionId: event.params.auctionId,
            beforeQual,
            afterQual
          });
        }

        return { alreadyProcessed: false, liveBattlesCount, liveBidsCount, totalVolumeUSD };
      });

      if (result.alreadyProcessed) {
        console.log(`[onArenaAuctionWrittenMetricsTrigger] Duplicate event ${eventId} ignored safely (idempotent no-op).`);
      } else {
        console.log(`[onArenaAuctionWrittenMetricsTrigger] Synchronized /system_metrics/arena for auction ${event.params.auctionId} (Event ID: ${eventId})`);
      }
    } catch (err) {
      console.error(`[onArenaAuctionWrittenMetricsTrigger] Error synchronizing metrics for auction ${event.params.auctionId}:`, err);
      throw err;
    }
  }
);

/**
 * Cloud Function Trigger (v2):
 * Synchronizes /system_metrics/arena upon any mutation to orders/{orderId}.
 * Filters strictly for source === 'battle_bids' and authoritative settled states.
 */
export const onArenaOrderWrittenMetricsTrigger = onDocumentWritten(
  'orders/{orderId}',
  async (event) => {
    const eventId = event.id;
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    const isBattleBids = (beforeData?.source === 'battle_bids') || (afterData?.source === 'battle_bids');
    if (!isBattleBids) {
      return; // Ignore standard marketplace orders
    }

    const wasSettled = beforeData ? SETTLED_ORDER_STATUSES.has(beforeData.status) : false;
    const isSettled = afterData ? SETTLED_ORDER_STATUSES.has(afterData.status) : false;

    if (wasSettled === isSettled) {
      return; // No transition into or out of settled state
    }

    const metricsRef = db.collection(METRICS_DOC_PATH).doc(METRICS_DOC_ID);
    const eventDocRef = eventId
      ? metricsRef.collection(PROCESSED_EVENTS_SUBCOLLECTION).doc(`order_${eventId}`)
      : null;

    try {
      const result = await db.runTransaction(async (transaction) => {
        const [eventSnap, metricsSnap] = await Promise.all([
          eventDocRef ? transaction.get(eventDocRef) : Promise.resolve(null),
          transaction.get(metricsRef)
        ]);

        if (eventSnap && eventSnap.exists) {
          return { alreadyProcessed: true };
        }

        let liveBattlesCount = 0;
        let liveBidsCount = 0;
        let totalVolumeUSD = 0;
        let transactions24hCount = 0;
        let totalSettledOrdersCount = 0;

        if (metricsSnap.exists) {
          const data = metricsSnap.data() || {};
          liveBattlesCount = typeof data.liveBattlesCount === 'number' ? data.liveBattlesCount : 0;
          liveBidsCount = typeof data.liveBidsCount === 'number' ? data.liveBidsCount : 0;
          totalVolumeUSD = typeof data.totalVolumeUSD === 'number' ? data.totalVolumeUSD : 0;
          transactions24hCount = typeof data.transactions24hCount === 'number' ? data.transactions24hCount : 0;
          totalSettledOrdersCount = typeof data.totalSettledOrdersCount === 'number' ? data.totalSettledOrdersCount : 0;
        }

        if (!wasSettled && isSettled) {
          totalSettledOrdersCount += 1;
          transactions24hCount += 1;
        } else if (wasSettled && !isSettled) {
          totalSettledOrdersCount = Math.max(0, totalSettledOrdersCount - 1);
          transactions24hCount = Math.max(0, transactions24hCount - 1);
        }

        transaction.set(metricsRef, {
          liveBattlesCount,
          liveBidsCount,
          totalVolumeUSD,
          transactions24hCount,
          totalSettledOrdersCount,
          lastUpdated: FieldValue.serverTimestamp()
        }, { merge: true });

        if (eventDocRef) {
          transaction.set(eventDocRef, {
            processedAt: FieldValue.serverTimestamp(),
            eventId,
            orderId: event.params.orderId,
            wasSettled,
            isSettled
          });
        }

        return { alreadyProcessed: false, transactions24hCount, totalSettledOrdersCount };
      });

      if (result.alreadyProcessed) {
        console.log(`[onArenaOrderWrittenMetricsTrigger] Duplicate order event ${eventId} ignored safely.`);
      } else {
        console.log(`[onArenaOrderWrittenMetricsTrigger] Synchronized /system_metrics/arena for order ${event.params.orderId}`);
      }
    } catch (err) {
      console.error(`[onArenaOrderWrittenMetricsTrigger] Error synchronizing metrics for order ${event.params.orderId}:`, err);
      throw err;
    }
  }
);

/**
 * Server-authoritative full reconciliation function for /system_metrics/arena.
 * Scans active battle auctions and settled battle orders, recalculating aggregate stats safely.
 */
export async function reconcileArenaMetricsServer(): Promise<ArenaMetricsDoc> {
  const nowMs = Date.now();
  const twentyFourHoursAgoMs = nowMs - 24 * 60 * 60 * 1000;

  // 1. Scan active auctions
  const auctionsSnap = await db.collection('arena_auctions')
    .where('status', '==', 'active')
    .get();

  let liveBattlesCount = 0;
  let liveBidsCount = 0;
  let totalVolumeUSD = 0;

  auctionsSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    const qual = getAuctionLiveQualification(data, nowMs);
    if (qual.isLive) {
      liveBattlesCount += 1;
      liveBidsCount += qual.bidsCount;
      totalVolumeUSD += qual.volumeUSD;
    }
  });

  totalVolumeUSD = Math.round(totalVolumeUSD * 100) / 100;

  // 2. Scan Battle Bids orders
  const ordersSnap = await db.collection('orders')
    .where('source', '==', 'battle_bids')
    .get();

  let totalSettledOrdersCount = 0;
  let transactions24hCount = 0;

  ordersSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    if (SETTLED_ORDER_STATUSES.has(data.status)) {
      totalSettledOrdersCount += 1;
      const settlementTime = extractMillis(data.updatedAt || data.paymentVerifiedAt || data.createdAt);
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
    lastUpdated: FieldValue.serverTimestamp()
  };

  const metricsRef = db.collection(METRICS_DOC_PATH).doc(METRICS_DOC_ID);
  await metricsRef.set(aggregate, { merge: true });

  return aggregate;
}
