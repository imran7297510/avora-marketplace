import { Firestore, DocumentData, FieldValue } from 'firebase-admin/firestore';
import { 
  TrustEventType, 
  TrustSourceModule, 
  INITIAL_TRUST_SCORE, 
  FROZEN_SCORE_DELTAS, 
  calculateTrustTier, 
  clampTrustScore 
} from './trustScoreTypes';
import { validateTrustEventParams } from './trustScoreValidation';
import { checkBuyerSellerPairCap } from './trustScorePairCap';
import { processCleanHistoryProgress, resetCleanHistoryCount } from './trustScoreMilestones';

export interface ServerTrustEventParams {
  userId: string;
  eventType: TrustEventType;
  relatedEntityId: string;
  sourceModule: TrustSourceModule;
  reason: string;
  createdBy?: string;
  customDelta?: number;
  counterpartyId?: string;
}

export interface ServerTrustEventResult {
  success: boolean;
  isDuplicate?: boolean;
  pairCapSuppressed?: boolean;
  eventId: string;
  previousScore: number;
  resultingScore: number;
  resultingTier: string;
  scoreDelta: number;
  message?: string;
}

/**
 * Trusted server-side execution engine for Trust Score mutations using Firebase Admin SDK.
 * Executes atomically inside a Firestore transaction.
 */
export async function recordServerTrustEvent(
  db: Firestore,
  params: ServerTrustEventParams
): Promise<ServerTrustEventResult> {
  const validation = validateTrustEventParams(params);
  if (!validation.isValid) {
    throw new Error(validation.errorMessage || 'Invalid trust event parameters.');
  }

  const { cleanUserId, cleanEntityId, cleanReason, cleanCreatedBy, deduplicationKey } = validation;
  const { eventType, sourceModule, customDelta, counterpartyId } = params;

  let baseDelta = 0;
  if (eventType === 'ADMIN_MANUAL_ADJUSTMENT') {
    if (typeof customDelta !== 'number' || isNaN(customDelta) || !Number.isFinite(customDelta)) {
      throw new Error('Valid numerical custom delta must be provided for ADMIN_MANUAL_ADJUSTMENT.');
    }
    baseDelta = Math.min(100, Math.max(-100, Math.round(customDelta)));
  } else {
    const frozenDelta = FROZEN_SCORE_DELTAS[eventType];
    if (frozenDelta === null || frozenDelta === undefined) {
      throw new Error(`Invalid or unmapped score delta for event type: ${eventType}`);
    }
    baseDelta = frozenDelta;
  }

  let pairCapSuppressed = false;
  if ((eventType === 'DEAL_COMPLETED_BUYER' || eventType === 'DEAL_COMPLETED_SELLER') && counterpartyId) {
    const capCheck = await checkBuyerSellerPairCap(db, cleanUserId, counterpartyId);
    if (capCheck.isCapped) {
      pairCapSuppressed = true;
    }
  }

  const actualDelta = pairCapSuppressed ? 0 : baseDelta;

  const eventRef = db.collection('trust_events').doc(deduplicationKey);
  const userRef = db.collection('users').doc(cleanUserId);

  let previousScore = INITIAL_TRUST_SCORE;
  let resultingScore = INITIAL_TRUST_SCORE;
  let resultingTier = calculateTrustTier(INITIAL_TRUST_SCORE);

  try {
    await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists) {
        throw new Error(`DUPLICATE_EVENT: Event already recorded for key: ${deduplicationKey}`);
      }

      const userSnap = await transaction.get(userRef);
      let userData: DocumentData = {};
      if (userSnap.exists) {
        userData = userSnap.data() || {};
        previousScore = typeof userData.trustScore === 'number' && Number.isFinite(userData.trustScore)
          ? clampTrustScore(userData.trustScore)
          : INITIAL_TRUST_SCORE;
      } else {
        previousScore = INITIAL_TRUST_SCORE;
      }

      resultingScore = clampTrustScore(previousScore + actualDelta);
      resultingTier = calculateTrustTier(resultingScore);

      if (eventType.startsWith('ADMIN_FAULT_')) {
        resetCleanHistoryCount(transaction, userRef);
      }

      transaction.set(eventRef, {
        id: deduplicationKey,
        deduplicationKey,
        userId: cleanUserId,
        eventType,
        scoreDelta: actualDelta,
        originalDelta: baseDelta,
        previousScore,
        resultingScore,
        relatedEntityId: cleanEntityId,
        sourceModule,
        reason: pairCapSuppressed 
          ? `${cleanReason} [Pair-Cap Active: Score delta suppressed for rolling 30 days]`
          : cleanReason,
        createdBy: cleanCreatedBy,
        createdAt: FieldValue.serverTimestamp(),
        pairCapSuppressed,
        metadata: {
          counterpartyId: counterpartyId || null,
          customDelta: customDelta ?? null,
        }
      });

      const userUpdate: Record<string, any> = {
        trustScore: resultingScore,
        trustTier: resultingTier,
        trustLastUpdated: FieldValue.serverTimestamp(),
      };

      if (userSnap.exists) {
        transaction.update(userRef, userUpdate);
      } else {
        transaction.set(userRef, {
          ...userUpdate,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });

    return {
      success: true,
      pairCapSuppressed,
      eventId: deduplicationKey,
      previousScore,
      resultingScore,
      resultingTier,
      scoreDelta: actualDelta
    };
  } catch (error: any) {
    if (error?.message?.includes('DUPLICATE_EVENT')) {
      const userSnap = await userRef.get();
      const currentScore = userSnap.exists ? clampTrustScore(userSnap.data()?.trustScore || 50) : 50;
      return {
        success: true,
        isDuplicate: true,
        eventId: deduplicationKey,
        previousScore: currentScore,
        resultingScore: currentScore,
        resultingTier: calculateTrustTier(currentScore),
        scoreDelta: 0,
        message: `Event already processed for key: ${deduplicationKey}`
      };
    }
    console.error(`Failed to record server trust event for key ${deduplicationKey}:`, error);
    throw error;
  }
}

/**
 * Automates positive deal completion scoring for both Buyer (+2) and Seller (+3) atomically on deal finality.
 */
export async function processCompletedDealScore(
  db: Firestore,
  orderData: {
    orderId: string;
    buyerId: string;
    sellerId: string;
    listingId: string;
    listingTitle?: string;
  }
): Promise<{
  buyerResult: ServerTrustEventResult;
  sellerResult: ServerTrustEventResult;
}> {
  const { orderId, buyerId, sellerId, listingId, listingTitle } = orderData;

  if (!buyerId || !sellerId || !orderId) {
    throw new Error('Invalid order payload: buyerId, sellerId, and orderId are required.');
  }

  const canonicalEntityId = listingId ? `LISTING_${listingId}` : orderId;
  const cleanTitle = listingTitle ? ` for "${listingTitle}"` : '';

  const buyerResult = await recordServerTrustEvent(db, {
    userId: buyerId,
    eventType: 'DEAL_COMPLETED_BUYER',
    relatedEntityId: canonicalEntityId,
    sourceModule: 'MARKETPLACE',
    reason: `Trade completed successfully as buyer${cleanTitle}.`,
    createdBy: 'SERVER_AUTOMATED_ENGINE',
    counterpartyId: sellerId
  });

  const sellerResult = await recordServerTrustEvent(db, {
    userId: sellerId,
    eventType: 'DEAL_COMPLETED_SELLER',
    relatedEntityId: canonicalEntityId,
    sourceModule: 'MARKETPLACE',
    reason: `Trade completed successfully as seller${cleanTitle}.`,
    createdBy: 'SERVER_AUTOMATED_ENGINE',
    counterpartyId: buyerId
  });

  try {
    if (!buyerResult.isDuplicate && !buyerResult.pairCapSuppressed && buyerResult.scoreDelta > 0) {
      const buyerRef = db.collection('users').doc(buyerId);
      const buyerSnap = await buyerRef.get();
      if (buyerSnap.exists) {
        await db.runTransaction(async (transaction) => {
          const snap = await transaction.get(buyerRef);
          if (snap.exists) {
            await processCleanHistoryProgress(db, transaction, buyerId, buyerRef, snap.data() || {});
          }
        });
      }
    }

    if (!sellerResult.isDuplicate && !sellerResult.pairCapSuppressed && sellerResult.scoreDelta > 0) {
      const sellerRef = db.collection('users').doc(sellerId);
      const sellerSnap = await sellerRef.get();
      if (sellerSnap.exists) {
        await db.runTransaction(async (transaction) => {
          const snap = await transaction.get(sellerRef);
          if (snap.exists) {
            await processCleanHistoryProgress(db, transaction, sellerId, sellerRef, snap.data() || {});
          }
        });
      }
    }
  } catch (milestoneErr) {
    console.error('Error processing clean history milestone:', milestoneErr);
  }

  return { buyerResult, sellerResult };
}
