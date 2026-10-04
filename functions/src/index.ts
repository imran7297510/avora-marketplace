import { initializeApp, getApps } from 'firebase-admin/app';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { expireOverdueBattleBidsOrders } from './battle-bids/secondChanceServer';
import { expireOverdueStandardOrders } from './marketplace/standardOrderExpiration';
import { reconcileArenaMetricsServer } from './battle-bids/arenaMetricsTrigger';

if (!getApps().length) {
  initializeApp();
}

/**
 * Scheduled Cloud Function (v2): Runs every 15 minutes.
 * Scans for overdue Battle Bids primary payment orders (48h deadline lapsed),
 * transitions them to PAYMENT_EXPIRED, and dispatches second-chance offers.
 */
export const processBattleBidsPaymentExpirations = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    retryCount: 1
  },
  async () => {
    const res = await expireOverdueBattleBidsOrders();
    console.log('[processBattleBidsPaymentExpirations] Execution completed:', res);
  }
);

/**
 * Scheduled Cloud Function (v2): Runs every 15 minutes.
 * Server-authoritative worker for Standard Marketplace PENDING order expiration (24h deadline lapsed).
 * Transition orders to EXPIRED and restores reserved listing inventory atomically.
 */
export const processStandardMarketplaceOrderExpirations = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    retryCount: 1
  },
  async () => {
    const res = await expireOverdueStandardOrders();
    console.log('[processStandardMarketplaceOrderExpirations] Execution completed:', res);
  }
);

/**
 * Scheduled Cloud Function (v2): Runs every 15 minutes.
 * Server-authoritative periodic reconciliation for /system_metrics/arena.
 * Prunes passively expired auctions, updates live bids/volume, and evicts settled orders past the 24h window.
 */
export const reconcileArenaMetricsScheduled = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    retryCount: 1
  },
  async () => {
    const res = await reconcileArenaMetricsServer();
    console.log('[reconcileArenaMetricsScheduled] Completed arena reconciliation:', res);
  }
);

export {
  onOrderUpdatedTrigger,
  onListingSoldTrigger,
  recordAdminTrustEventCallable
} from './trust-score/trustScoreEvents';

export {
  onNegotiationOfferCreatedTrigger,
  onNegotiationUpdatedTrigger
} from './notifications/negotiationNotificationTrigger';

export {
  onOfferCreatedTrigger
} from './notifications/offerNotificationTrigger';

export {
  onListingPriceDropTrigger
} from './notifications/priceDropNotificationTrigger';

export {
  onAuctionOutbidTrigger
} from './notifications/outbidNotificationTrigger';

export {
  onAuctionSettlementTrigger
} from './notifications/auctionSettlementTrigger';

export {
  onBattleBidsOrderPaymentExpiredTrigger,
  onSecondChanceOfferUpdatedTrigger
} from './battle-bids/secondChanceServer';

export {
  onListingWrittenMetricsTrigger
} from './marketplace/marketplaceMetricsTrigger';

export {
  onArenaAuctionWrittenMetricsTrigger,
  onArenaOrderWrittenMetricsTrigger
} from './battle-bids/arenaMetricsTrigger';

export {
  processReportRetentionScheduled,
  executeReportRetention,
  executeReportRetentionDryRun,
  REPORT_RETENTION_ENABLED,
  RETENTION_DURATION_MS
} from './moderation/reportRetentionScheduled';

export * from './moderation/moderationMetricsBackend';

export * from './trust-score/trustScoreTypes';
export * from './trust-score/trustScoreBackend';
export * from './trust-score/trustScoreValidation';
export * from './trust-score/trustScorePairCap';
export * from './trust-score/trustScoreMilestones';

