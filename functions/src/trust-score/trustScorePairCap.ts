import { Firestore } from 'firebase-admin/firestore';
import { PAIR_CAP_MS } from './trustScoreTypes';

export interface PairCapCheckResult {
  isCapped: boolean;
  lastEventTime?: Date;
  reason?: string;
}

/**
 * Checks whether a positive Trust Score event has already been awarded
 * between a specific Buyer and Seller pair within the rolling 30-day window.
 */
export async function checkBuyerSellerPairCap(
  db: Firestore,
  userId: string,
  counterpartyId: string
): Promise<PairCapCheckResult> {
  if (!userId || !counterpartyId || userId === counterpartyId) {
    return { isCapped: false };
  }

  const cutoffTime = new Date(Date.now() - PAIR_CAP_MS);

  try {
    const eventsRef = db.collection('trust_events');
    const snapshot = await eventsRef
      .where('userId', '==', userId)
      .where('eventType', 'in', ['DEAL_COMPLETED_BUYER', 'DEAL_COMPLETED_SELLER'])
      .get();

    if (snapshot.empty) {
      return { isCapped: false };
    }

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const metadata = data.metadata || {};
      const eventCounterparty = metadata.counterpartyId || data.counterpartyId;

      const eventTime = data.createdAt ? data.createdAt.toDate() : null;

      if (eventCounterparty === counterpartyId && eventTime && eventTime >= cutoffTime) {
        if (!data.pairCapSuppressed && (data.scoreDelta || 0) > 0) {
          return {
            isCapped: true,
            lastEventTime: eventTime,
            reason: `Pair-cap active: Positive Trust Score already awarded for user ${userId} and counterparty ${counterpartyId} on ${eventTime.toISOString().split('T')[0]}`
          };
        }
      }
    }

    return { isCapped: false };
  } catch (error) {
    console.error(`Error executing pair cap check for user ${userId} and counterparty ${counterpartyId}:`, error);
    return { isCapped: false };
  }
}
