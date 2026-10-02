export type TrustEventType =
  | 'DEAL_COMPLETED_BUYER'
  | 'DEAL_COMPLETED_SELLER'
  | 'DISPUTE_WON_EXONERATED'
  | 'CLEAN_HISTORY_MILESTONE'
  | 'ADMIN_FAULT_BUYER_DEFAULT'
  | 'ADMIN_FAULT_SELLER_DEFAULT'
  | 'ADMIN_FAULT_FABRICATED_DISPUTE'
  | 'ADMIN_FAULT_FRAUD_COUNTERFEIT'
  | 'ADMIN_FAULT_SHILL_COLLUSION'
  | 'ADMIN_MANUAL_ADJUSTMENT';

export type TrustSourceModule = 'MARKETPLACE' | 'BATTLE_BIDS' | 'NEGOTIATION' | 'DISPUTE_SYSTEM' | 'ADMIN';

export interface TrustScoreEvent {
  id: string;
  deduplicationKey: string;
  userId: string;
  eventType: TrustEventType;
  scoreDelta: number;
  previousScore: number;
  resultingScore: number;
  relatedEntityId: string;
  sourceModule: TrustSourceModule;
  reason: string;
  createdBy: string;
  createdAt: any;
  pairCapSuppressed?: boolean;
  metadata?: Record<string, any>;
}

export const INITIAL_TRUST_SCORE = 50;
export const MIN_TRUST_SCORE = 0;
export const MAX_TRUST_SCORE = 100;

export const PAIR_CAP_DAYS = 30; // 30 rolling days pair cap limit
export const PAIR_CAP_MS = PAIR_CAP_DAYS * 24 * 60 * 60 * 1000;

export const CLEAN_HISTORY_INTERVAL = 10; // 10 consecutive clean deals
export const CLEAN_HISTORY_DELTA = 5; // +5 points

export const VALID_TRUST_EVENT_TYPES: TrustEventType[] = [
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

export const VALID_TRUST_SOURCE_MODULES: TrustSourceModule[] = [
  'MARKETPLACE',
  'BATTLE_BIDS',
  'NEGOTIATION',
  'DISPUTE_SYSTEM',
  'ADMIN',
];

export function isValidTrustEventType(type: any): type is TrustEventType {
  return typeof type === 'string' && VALID_TRUST_EVENT_TYPES.includes(type as TrustEventType);
}

export function isValidTrustSourceModule(mod: any): mod is TrustSourceModule {
  return typeof mod === 'string' && VALID_TRUST_SOURCE_MODULES.includes(mod as TrustSourceModule);
}

export const FROZEN_SCORE_DELTAS: Record<TrustEventType, number | null> = {
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
export function calculateTrustTier(score: number): string {
  const clamped = clampTrustScore(score);
  if (clamped >= 85) return 'Elite Reliable';
  if (clamped >= 65) return 'Established Trader';
  if (clamped >= 40) return 'Neutral / Building';
  if (clamped >= 20) return 'Caution / Low Trust';
  return 'High Risk';
}

export function clampTrustScore(score: number): number {
  if (typeof score !== 'number' || isNaN(score) || !Number.isFinite(score)) {
    return INITIAL_TRUST_SCORE;
  }
  return Math.min(MAX_TRUST_SCORE, Math.max(MIN_TRUST_SCORE, Math.round(score)));
}
