"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FROZEN_SCORE_DELTAS = exports.VALID_TRUST_SOURCE_MODULES = exports.VALID_TRUST_EVENT_TYPES = exports.CLEAN_HISTORY_DELTA = exports.CLEAN_HISTORY_INTERVAL = exports.PAIR_CAP_MS = exports.PAIR_CAP_DAYS = exports.MAX_TRUST_SCORE = exports.MIN_TRUST_SCORE = exports.INITIAL_TRUST_SCORE = void 0;
exports.isValidTrustEventType = isValidTrustEventType;
exports.isValidTrustSourceModule = isValidTrustSourceModule;
exports.calculateTrustTier = calculateTrustTier;
exports.clampTrustScore = clampTrustScore;
exports.INITIAL_TRUST_SCORE = 50;
exports.MIN_TRUST_SCORE = 0;
exports.MAX_TRUST_SCORE = 100;
exports.PAIR_CAP_DAYS = 30; // 30 rolling days pair cap limit
exports.PAIR_CAP_MS = exports.PAIR_CAP_DAYS * 24 * 60 * 60 * 1000;
exports.CLEAN_HISTORY_INTERVAL = 10; // 10 consecutive clean deals
exports.CLEAN_HISTORY_DELTA = 5; // +5 points
exports.VALID_TRUST_EVENT_TYPES = [
    'DEAL_COMPLETED_BUYER',
    'DEAL_COMPLETED_SELLER',
    'DISPUTE_WON_EXONERATED',
    'CLEAN_HISTORY_MILESTONE',
    'ADMIN_FAULT_BUYER_DEFAULT',
    'ADMIN_FAULT_SELLER_DEFAULT',
    'ADMIN_FAULT_FABRICATED_DISPUTE',
    'ADMIN_FAULT_FRAUD_COUNTERFEIT',
    'ADMIN_FAULT_SHILL_COLLUSION',
    'ADMIN_MANUAL_ADJUSTMENT',
];
exports.VALID_TRUST_SOURCE_MODULES = [
    'MARKETPLACE',
    'BATTLE_BIDS',
    'NEGOTIATION',
    'DISPUTE_SYSTEM',
    'ADMIN',
];
function isValidTrustEventType(type) {
    return typeof type === 'string' && exports.VALID_TRUST_EVENT_TYPES.includes(type);
}
function isValidTrustSourceModule(mod) {
    return typeof mod === 'string' && exports.VALID_TRUST_SOURCE_MODULES.includes(mod);
}
exports.FROZEN_SCORE_DELTAS = {
    DEAL_COMPLETED_BUYER: 2,
    DEAL_COMPLETED_SELLER: 3,
    DISPUTE_WON_EXONERATED: 2,
    CLEAN_HISTORY_MILESTONE: 5,
    ADMIN_FAULT_BUYER_DEFAULT: -15,
    ADMIN_FAULT_SELLER_DEFAULT: -20,
    ADMIN_FAULT_FABRICATED_DISPUTE: -15,
    ADMIN_FAULT_FRAUD_COUNTERFEIT: -35,
    ADMIN_FAULT_SHILL_COLLUSION: -40,
    ADMIN_MANUAL_ADJUSTMENT: null, // Dynamic, explicitly set by Admin
};
/**
 * STRICT FROZEN TRUST TIER NAMES (FINAL & IMMUTABLE)
 * 85–100: Elite Reliable
 * 65–84: Established Trader
 * 40–64: Neutral / Building
 * 20–39: Caution / Low Trust
 * 0–19: High Risk
 */
function calculateTrustTier(score) {
    const clamped = clampTrustScore(score);
    if (clamped >= 85)
        return 'Elite Reliable';
    if (clamped >= 65)
        return 'Established Trader';
    if (clamped >= 40)
        return 'Neutral / Building';
    if (clamped >= 20)
        return 'Caution / Low Trust';
    return 'High Risk';
}
function clampTrustScore(score) {
    if (typeof score !== 'number' || isNaN(score) || !Number.isFinite(score)) {
        return exports.INITIAL_TRUST_SCORE;
    }
    return Math.min(exports.MAX_TRUST_SCORE, Math.max(exports.MIN_TRUST_SCORE, Math.round(score)));
}
//# sourceMappingURL=trustScoreTypes.js.map