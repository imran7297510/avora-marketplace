"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETENTION_DURATION_MS = exports.REPORT_RETENTION_ENABLED = exports.executeReportRetentionDryRun = exports.executeReportRetention = exports.processReportRetentionScheduled = exports.onArenaOrderWrittenMetricsTrigger = exports.onArenaAuctionWrittenMetricsTrigger = exports.onListingWrittenMetricsTrigger = exports.settleExpiredBattleBidsAuctionsServer = exports.resolveAuthoritativeSellerUidServer = exports.onSecondChanceOfferUpdatedTrigger = exports.onBattleBidsOrderPaymentExpiredTrigger = exports.onPromotionRefundRequestedTrigger = exports.onAuctionSettlementTrigger = exports.onAuctionOutbidTrigger = exports.onListingPriceDropTrigger = exports.onOfferCreatedTrigger = exports.onNegotiationUpdatedTrigger = exports.onNegotiationOfferCreatedTrigger = exports.recordAdminTrustEventCallable = exports.onListingSoldTrigger = exports.onOrderUpdatedTrigger = exports.reconcileArenaMetricsScheduled = exports.processStandardMarketplaceOrderExpirations = exports.processBattleBidsPaymentExpirations = exports.processBattleBidsAuctionSettlements = void 0;
const app_1 = require("firebase-admin/app");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const secondChanceServer_1 = require("./battle-bids/secondChanceServer");
const standardOrderExpiration_1 = require("./marketplace/standardOrderExpiration");
const arenaMetricsTrigger_1 = require("./battle-bids/arenaMetricsTrigger");
const auctionSettlementServer_1 = require("./battle-bids/auctionSettlementServer");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
/**
 * Scheduled Cloud Function (v2): Runs every 5 minutes.
 * Server-authoritative worker for expired Battle Bids auction settlement.
 * Settles active auctions whose endTime has elapsed, resolving authoritative seller UIDs
 * and creating canonical BB-${auctionId} payment orders idempotently.
 */
exports.processBattleBidsAuctionSettlements = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    timeZone: 'UTC',
    retryCount: 1
}, async () => {
    const res = await (0, auctionSettlementServer_1.settleExpiredBattleBidsAuctionsServer)();
    console.log('[processBattleBidsAuctionSettlements] Completed auction settlement scan:', res);
});
/**
 * Scheduled Cloud Function (v2): Runs every 15 minutes.
 * Scans for overdue Battle Bids primary payment orders (48h deadline lapsed),
 * transitions them to PAYMENT_EXPIRED, and dispatches second-chance offers.
 */
exports.processBattleBidsPaymentExpirations = (0, scheduler_1.onSchedule)({
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    retryCount: 1
}, async () => {
    const res = await (0, secondChanceServer_1.expireOverdueBattleBidsOrders)();
    console.log('[processBattleBidsPaymentExpirations] Execution completed:', res);
});
/**
 * Scheduled Cloud Function (v2): Runs every 15 minutes.
 * Server-authoritative worker for Standard Marketplace PENDING order expiration (24h deadline lapsed).
 * Transition orders to EXPIRED and restores reserved listing inventory atomically.
 */
exports.processStandardMarketplaceOrderExpirations = (0, scheduler_1.onSchedule)({
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    retryCount: 1
}, async () => {
    const res = await (0, standardOrderExpiration_1.expireOverdueStandardOrders)();
    console.log('[processStandardMarketplaceOrderExpirations] Execution completed:', res);
});
/**
 * Scheduled Cloud Function (v2): Runs every 15 minutes.
 * Server-authoritative periodic reconciliation for /system_metrics/arena.
 * Prunes passively expired auctions, updates live bids/volume, and evicts settled orders past the 24h window.
 */
exports.reconcileArenaMetricsScheduled = (0, scheduler_1.onSchedule)({
    schedule: 'every 15 minutes',
    timeZone: 'UTC',
    retryCount: 1
}, async () => {
    const res = await (0, arenaMetricsTrigger_1.reconcileArenaMetricsServer)();
    console.log('[reconcileArenaMetricsScheduled] Completed arena reconciliation:', res);
});
var trustScoreEvents_1 = require("./trust-score/trustScoreEvents");
Object.defineProperty(exports, "onOrderUpdatedTrigger", { enumerable: true, get: function () { return trustScoreEvents_1.onOrderUpdatedTrigger; } });
Object.defineProperty(exports, "onListingSoldTrigger", { enumerable: true, get: function () { return trustScoreEvents_1.onListingSoldTrigger; } });
Object.defineProperty(exports, "recordAdminTrustEventCallable", { enumerable: true, get: function () { return trustScoreEvents_1.recordAdminTrustEventCallable; } });
var negotiationNotificationTrigger_1 = require("./notifications/negotiationNotificationTrigger");
Object.defineProperty(exports, "onNegotiationOfferCreatedTrigger", { enumerable: true, get: function () { return negotiationNotificationTrigger_1.onNegotiationOfferCreatedTrigger; } });
Object.defineProperty(exports, "onNegotiationUpdatedTrigger", { enumerable: true, get: function () { return negotiationNotificationTrigger_1.onNegotiationUpdatedTrigger; } });
var offerNotificationTrigger_1 = require("./notifications/offerNotificationTrigger");
Object.defineProperty(exports, "onOfferCreatedTrigger", { enumerable: true, get: function () { return offerNotificationTrigger_1.onOfferCreatedTrigger; } });
var priceDropNotificationTrigger_1 = require("./notifications/priceDropNotificationTrigger");
Object.defineProperty(exports, "onListingPriceDropTrigger", { enumerable: true, get: function () { return priceDropNotificationTrigger_1.onListingPriceDropTrigger; } });
var outbidNotificationTrigger_1 = require("./notifications/outbidNotificationTrigger");
Object.defineProperty(exports, "onAuctionOutbidTrigger", { enumerable: true, get: function () { return outbidNotificationTrigger_1.onAuctionOutbidTrigger; } });
var auctionSettlementTrigger_1 = require("./notifications/auctionSettlementTrigger");
Object.defineProperty(exports, "onAuctionSettlementTrigger", { enumerable: true, get: function () { return auctionSettlementTrigger_1.onAuctionSettlementTrigger; } });
var promotionRefundTrigger_1 = require("./notifications/promotionRefundTrigger");
Object.defineProperty(exports, "onPromotionRefundRequestedTrigger", { enumerable: true, get: function () { return promotionRefundTrigger_1.onPromotionRefundRequestedTrigger; } });
var secondChanceServer_2 = require("./battle-bids/secondChanceServer");
Object.defineProperty(exports, "onBattleBidsOrderPaymentExpiredTrigger", { enumerable: true, get: function () { return secondChanceServer_2.onBattleBidsOrderPaymentExpiredTrigger; } });
Object.defineProperty(exports, "onSecondChanceOfferUpdatedTrigger", { enumerable: true, get: function () { return secondChanceServer_2.onSecondChanceOfferUpdatedTrigger; } });
Object.defineProperty(exports, "resolveAuthoritativeSellerUidServer", { enumerable: true, get: function () { return secondChanceServer_2.resolveAuthoritativeSellerUidServer; } });
var auctionSettlementServer_2 = require("./battle-bids/auctionSettlementServer");
Object.defineProperty(exports, "settleExpiredBattleBidsAuctionsServer", { enumerable: true, get: function () { return auctionSettlementServer_2.settleExpiredBattleBidsAuctionsServer; } });
var marketplaceMetricsTrigger_1 = require("./marketplace/marketplaceMetricsTrigger");
Object.defineProperty(exports, "onListingWrittenMetricsTrigger", { enumerable: true, get: function () { return marketplaceMetricsTrigger_1.onListingWrittenMetricsTrigger; } });
var arenaMetricsTrigger_2 = require("./battle-bids/arenaMetricsTrigger");
Object.defineProperty(exports, "onArenaAuctionWrittenMetricsTrigger", { enumerable: true, get: function () { return arenaMetricsTrigger_2.onArenaAuctionWrittenMetricsTrigger; } });
Object.defineProperty(exports, "onArenaOrderWrittenMetricsTrigger", { enumerable: true, get: function () { return arenaMetricsTrigger_2.onArenaOrderWrittenMetricsTrigger; } });
var reportRetentionScheduled_1 = require("./moderation/reportRetentionScheduled");
Object.defineProperty(exports, "processReportRetentionScheduled", { enumerable: true, get: function () { return reportRetentionScheduled_1.processReportRetentionScheduled; } });
Object.defineProperty(exports, "executeReportRetention", { enumerable: true, get: function () { return reportRetentionScheduled_1.executeReportRetention; } });
Object.defineProperty(exports, "executeReportRetentionDryRun", { enumerable: true, get: function () { return reportRetentionScheduled_1.executeReportRetentionDryRun; } });
Object.defineProperty(exports, "REPORT_RETENTION_ENABLED", { enumerable: true, get: function () { return reportRetentionScheduled_1.REPORT_RETENTION_ENABLED; } });
Object.defineProperty(exports, "RETENTION_DURATION_MS", { enumerable: true, get: function () { return reportRetentionScheduled_1.RETENTION_DURATION_MS; } });
__exportStar(require("./moderation/moderationMetricsBackend"), exports);
__exportStar(require("./trust-score/trustScoreTypes"), exports);
__exportStar(require("./trust-score/trustScoreBackend"), exports);
__exportStar(require("./trust-score/trustScoreValidation"), exports);
__exportStar(require("./trust-score/trustScorePairCap"), exports);
__exportStar(require("./trust-score/trustScoreMilestones"), exports);
//# sourceMappingURL=index.js.map