import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

const METRICS_DOC_PATH = 'system_metrics';
const METRICS_DOC_ID = 'marketplace';
const PROCESSED_EVENTS_SUBCOLLECTION = 'processed_events';

const EXCLUDED_CITY_PLACEHOLDERS = new Set([
  'all pakistan',
  'pakistan',
  'n/a',
  'na',
  'location unspecified',
  'location unknown',
  'location hidden',
  'unspecified',
  'unknown',
  'all',
  'none'
]);

/**
 * Standard word title case formatting helper.
 */
const toTitleCase = (text: string): string => {
  return text
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Canonical city normalizer preserving existing Avora business semantics.
 */
export const normalizeCityName = (rawCity: any): string | null => {
  if (!rawCity || typeof rawCity !== 'string') return null;
  const clean = rawCity.trim();
  if (!clean || EXCLUDED_CITY_PLACEHOLDERS.has(clean.toLowerCase())) {
    return null;
  }
  return toTitleCase(clean);
};

/**
 * Determines whether a listing document qualifies as an active live listing in an active city.
 */
const getQualifyingCity = (data: any): string | null => {
  if (!data) return null;
  if (data.status !== 'LIVE') return null;
  if (data.isSuspended === true) return null;
  if (typeof data.quantity === 'number' && data.quantity <= 0) return null;
  return normalizeCityName(data.city);
};

/**
 * Automated Server-Authoritative Cloud Function (v2):
 * Listens to all listing document mutations (create, update, delete) and
 * automatically synchronizes the /system_metrics/marketplace aggregate atomically
 * with exact-once event idempotency protection against duplicate or retried deliveries.
 */
export const onListingWrittenMetricsTrigger = onDocumentWritten(
  'listings/{listingId}',
  async (event) => {
    const eventId = event.id;
    if (!eventId) {
      console.warn('[onListingWrittenMetricsTrigger] Missing event.id on invocation. Proceeding without event tracking.');
    }

    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    const beforeCity = getQualifyingCity(beforeData);
    const afterCity = getQualifyingCity(afterData);

    const wasLive = beforeData?.status === 'LIVE' && !beforeData?.isSuspended && (beforeData?.quantity || 0) > 0;
    const isLive = afterData?.status === 'LIVE' && !afterData?.isSuspended && (afterData?.quantity || 0) > 0;

    // If there is no change in active city qualification and live state, do nothing
    if (beforeCity === afterCity && wasLive === isLive) {
      return;
    }

    const metricsRef = db.collection(METRICS_DOC_PATH).doc(METRICS_DOC_ID);
    const eventDocRef = eventId
      ? metricsRef.collection(PROCESSED_EVENTS_SUBCOLLECTION).doc(eventId)
      : null;

    try {
      const result = await db.runTransaction(async (transaction) => {
        // Step 1: Perform all reads first
        const [eventSnap, metricsSnap] = await Promise.all([
          eventDocRef ? transaction.get(eventDocRef) : Promise.resolve(null),
          transaction.get(metricsRef)
        ]);

        // Step 2: Idempotency check - if this exact event ID was already committed, abort safely
        if (eventSnap && eventSnap.exists) {
          return { alreadyProcessed: true };
        }

        // Step 3: Extract current aggregate state
        let cityCounts: Record<string, number> = {};
        let activeCitiesList: string[] = [];
        let totalLiveListingsCount = 0;

        if (metricsSnap.exists) {
          const data = metricsSnap.data() || {};
          cityCounts = { ...(data.cityCounts || {}) };
          activeCitiesList = [...(data.activeCitiesList || [])];
          totalLiveListingsCount = typeof data.totalLiveListingsCount === 'number' ? data.totalLiveListingsCount : 0;
        }

        // Step 4: Calculate deltas
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
            activeCitiesList = activeCitiesList.filter(c => c !== beforeCity);
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

        const activeCitiesCount = activeCitiesList.length;

        // Step 5: Commit both aggregate update and processed-event record atomically
        transaction.set(metricsRef, {
          activeCitiesCount,
          activeCitiesList,
          cityCounts,
          totalLiveListingsCount,
          lastUpdated: FieldValue.serverTimestamp()
        }, { merge: true });

        if (eventDocRef) {
          transaction.set(eventDocRef, {
            processedAt: FieldValue.serverTimestamp(),
            eventId,
            listingId: event.params.listingId,
            beforeCity: beforeCity || null,
            afterCity: afterCity || null,
            wasLive,
            isLive
          });
        }

        return { alreadyProcessed: false, activeCitiesCount, totalLiveListingsCount };
      });

      if (result.alreadyProcessed) {
        console.log(`[onListingWrittenMetricsTrigger] Duplicate event ${eventId} ignored safely (idempotent no-op).`);
      } else {
        console.log(`[onListingWrittenMetricsTrigger] Successfully synchronized /system_metrics/marketplace for listing ${event.params.listingId} (Event ID: ${eventId})`);
      }
    } catch (err) {
      console.error(`[onListingWrittenMetricsTrigger] Failed to synchronize metrics for listing ${event.params.listingId} (Event ID: ${eventId}):`, err);
      throw err; // Re-throw so Firebase runtime handles retries properly with idempotency guard intact
    }
  }
);
