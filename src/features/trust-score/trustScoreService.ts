import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp, 
  orderBy, 
  limit, 
  runTransaction 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  TrustEventType, 
  TrustSourceModule, 
  TrustScoreEvent, 
  INITIAL_TRUST_SCORE, 
  FROZEN_SCORE_DELTAS, 
  calculateTrustTier, 
  clampTrustScore,
  isValidTrustEventType,
  isValidTrustSourceModule
} from './types';

/**
 * Constructs a deterministic, sanitized deduplication key for a trust event.
 * Format: {eventType}_{sanitizedEntityId}_{userId}
 */
export function generateDeduplicationKey(
  eventType: TrustEventType,
  relatedEntityId: string,
  userId: string
): string {
  const cleanEntityId = (relatedEntityId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanUserId = (userId || '').trim();
  return `${eventType}_${cleanEntityId}_${cleanUserId}`;
}

/**
 * Checks if a trust score event with the given deduplication key has already been processed.
 * Checks both deterministic document ID and query to guarantee idempotency.
 */
export async function isTrustEventDeduplicated(deduplicationKey: string): Promise<boolean> {
  if (!deduplicationKey || typeof deduplicationKey !== 'string') return false;
  try {
    // 1. Direct document check (Fastest & most accurate)
    const docRef = doc(db, 'trust_events', deduplicationKey);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) return true;

    // 2. Query check fallback for backwards compatibility
    const q = query(
      collection(db, 'trust_events'), 
      where('deduplicationKey', '==', deduplicationKey),
      limit(1)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (error) {
    console.error("Error checking trust event deduplication key:", error);
    return false;
  }
}

/**
 * Fetches current trust score metrics for a user from Firestore profile.
 */
export async function getUserTrustSummary(userId: string): Promise<{ trustScore: number; trustTier: string }> {
  if (!userId || typeof userId !== 'string') {
    return { trustScore: INITIAL_TRUST_SCORE, trustTier: calculateTrustTier(INITIAL_TRUST_SCORE) };
  }
  try {
    const userRef = doc(db, 'users', userId.trim());
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      const rawScore = typeof data.trustScore === 'number' && Number.isFinite(data.trustScore)
        ? data.trustScore 
        : INITIAL_TRUST_SCORE;
      const clamped = clampTrustScore(rawScore);
      const tier = data.trustTier || calculateTrustTier(clamped);
      return { trustScore: clamped, trustTier: tier };
    }
  } catch (error) {
    console.error("Error fetching user trust summary:", error);
  }
  return { trustScore: INITIAL_TRUST_SCORE, trustTier: calculateTrustTier(INITIAL_TRUST_SCORE) };
}

export interface RecordTrustEventParams {
  userId: string;
  eventType: TrustEventType;
  relatedEntityId: string;
  sourceModule: TrustSourceModule;
  reason: string;
  adminUid: string;
  customDelta?: number;
}

/**
 * Admin-authorized transaction to atomically record a trust event and update user score.
 * Enforces:
 * - Deterministic document ID (`trust_events/{deduplicationKey}`) inside transaction to prevent race conditions
 * - Complete input type & bounds validation
 * - Clamping strictly between 0 and 100
 * - Calculation of frozen tier names
 * - Atomic write to `trust_events` ledger and `users` document
 */
export async function recordAdminTrustEvent(params: RecordTrustEventParams): Promise<{
  success: boolean;
  isDuplicate?: boolean;
  eventId?: string;
  previousScore: number;
  resultingScore: number;
  message?: string;
}> {
  const { userId, eventType, relatedEntityId, sourceModule, reason, adminUid, customDelta } = params;

  // Strict parameter validation
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error("Invalid or missing target userId.");
  }
  if (!adminUid || typeof adminUid !== 'string' || !adminUid.trim()) {
    throw new Error("Invalid or missing adminUid.");
  }
  if (!relatedEntityId || typeof relatedEntityId !== 'string' || !relatedEntityId.trim()) {
    throw new Error("Invalid or missing relatedEntityId.");
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    throw new Error("Mandatory reason string is required for trust score event recording.");
  }
  if (!isValidTrustEventType(eventType)) {
    throw new Error(`Invalid event type provided: ${eventType}`);
  }
  if (!isValidTrustSourceModule(sourceModule)) {
    throw new Error(`Invalid source module provided: ${sourceModule}`);
  }

  const cleanUserId = userId.trim();
  const cleanAdminUid = adminUid.trim();
  const cleanEntityId = relatedEntityId.trim();
  const cleanReason = reason.trim();

  const deduplicationKey = generateDeduplicationKey(eventType, cleanEntityId, cleanUserId);

  // Calculate and validate score delta
  let scoreDelta = 0;
  if (eventType === 'ADMIN_MANUAL_ADJUSTMENT') {
    if (typeof customDelta !== 'number' || isNaN(customDelta) || !Number.isFinite(customDelta)) {
      throw new Error("Valid numerical custom delta must be provided for ADMIN_MANUAL_ADJUSTMENT.");
    }
    // Bound manual adjustment delta to reasonable limits (-100 to +100)
    scoreDelta = Math.min(100, Math.max(-100, Math.round(customDelta)));
  } else {
    const frozenDelta = FROZEN_SCORE_DELTAS[eventType];
    if (frozenDelta === null || frozenDelta === undefined) {
      throw new Error(`Invalid or unmapped score delta for event type: ${eventType}`);
    }
    scoreDelta = frozenDelta;
  }

  // Use deduplicationKey as document ID for atomic transaction lock
  const eventRef = doc(db, 'trust_events', deduplicationKey);
  const userRef = doc(db, 'users', cleanUserId);

  let previousScore = INITIAL_TRUST_SCORE;
  let resultingScore = INITIAL_TRUST_SCORE;

  try {
    await runTransaction(db, async (transaction) => {
      // 1. Transactional check for event existence (prevents concurrent race conditions)
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists()) {
        throw new Error(`DUPLICATE_EVENT: Event already recorded for key: ${deduplicationKey}`);
      }

      // 2. Transactional read of user profile
      const userSnap = await transaction.get(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        previousScore = typeof userData.trustScore === 'number' && Number.isFinite(userData.trustScore)
          ? clampTrustScore(userData.trustScore)
          : INITIAL_TRUST_SCORE;
      } else {
        previousScore = INITIAL_TRUST_SCORE;
      }

      // 3. Server-side score calculation & clamping
      resultingScore = clampTrustScore(previousScore + scoreDelta);
      const resultingTier = calculateTrustTier(resultingScore);

      // 4. Create immutable ledger record with deterministic document ID
      transaction.set(eventRef, {
        id: deduplicationKey,
        deduplicationKey,
        userId: cleanUserId,
        eventType,
        scoreDelta,
        previousScore,
        resultingScore,
        relatedEntityId: cleanEntityId,
        sourceModule,
        reason: cleanReason,
        createdBy: cleanAdminUid,
        createdAt: serverTimestamp(),
      });

      // 5. Materialize summary fields on user profile
      if (userSnap.exists()) {
        transaction.update(userRef, {
          trustScore: resultingScore,
          trustTier: resultingTier,
          trustLastUpdated: serverTimestamp(),
        });
      } else {
        transaction.set(userRef, {
          trustScore: resultingScore,
          trustTier: resultingTier,
          trustLastUpdated: serverTimestamp(),
        }, { merge: true });
      }
    });

    return {
      success: true,
      eventId: deduplicationKey,
      previousScore,
      resultingScore,
    };
  } catch (error: any) {
    if (error?.message?.includes('DUPLICATE_EVENT')) {
      const summary = await getUserTrustSummary(cleanUserId);
      return {
        success: false,
        isDuplicate: true,
        previousScore: summary.trustScore,
        resultingScore: summary.trustScore,
        message: `Event already processed for key: ${deduplicationKey}`,
      };
    }
    console.error("Failed to execute trust event transaction:", error);
    throw new Error(error.message || "Failed to record trust score event.");
  }
}

/**
 * Fetches recent trust events for a given user (for user profile timeline or admin audit).
 */
export async function getUserTrustEvents(userId: string, limitCount = 20): Promise<TrustScoreEvent[]> {
  if (!userId || typeof userId !== 'string') return [];
  try {
    const cleanUserId = userId.trim();
    const safeLimit = Math.min(100, Math.max(1, limitCount));
    const q = query(
      collection(db, 'trust_events'),
      where('userId', '==', cleanUserId),
      orderBy('createdAt', 'desc'),
      limit(safeLimit)
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => doc.data() as TrustScoreEvent);
  } catch (error) {
    console.error("Error fetching user trust events:", error);
    return [];
  }
}

