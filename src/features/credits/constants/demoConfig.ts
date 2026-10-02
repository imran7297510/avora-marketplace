/**
 * MANDI.PK — ISOLATED DEVELOPMENT / DEMO CREDIT CONFIGURATION
 * 
 * This file configures the isolated DEMO CREDIT MODE for testing Battle Bids
 * auctions, 1-credit deductions, bid limits, and negotiations without requiring
 * Firebase Blaze billing, Cloud Functions, or payment gateways.
 * 
 * ISOLATION GUARANTEES:
 * 1. Demo mode NEVER writes to or alters production user `creditsBalance` in Firestore.
 * 2. Demo mode NEVER writes to the production `credit_transactions` collection.
 * 3. Stored strictly in isolated, client-side session/local storage namespaces.
 * 4. In strict production builds (without dev hostnames), DEMO MODE is inactive.
 */

export const DEMO_CREDIT_CONFIG = {
  /**
   * Master development switch for Demo Credit Mode.
   * Set to `false` to immediately test raw C3 production behavior.
   */
  IS_ENABLED: true,

  /**
   * Configurable initial demo credit balance for test users.
   * Default: 1000 DEMO CREDITS
   */
  INITIAL_DEMO_CREDITS: 1000,

  /**
   * Cost in demo credits per auction bid.
   */
  DEMO_CREDITS_PER_BID: 1,

  /**
   * Maximum valid bids allowed per user per auction.
   */
  MAX_BIDS_PER_USER_PER_AUCTION: 10,

  /**
   * UI Labels & Indicators
   */
  BADGE_LABEL: 'DEMO CREDITS',
  MODE_INDICATOR: 'DEVELOPMENT DEMO MODE',
  STORAGE_KEY_PREFIX: 'mandi_pk_demo_credits_v1_',
  TX_STORAGE_KEY_PREFIX: 'mandi_pk_demo_tx_v1_',
} as const;

/**
 * Checks whether DEMO CREDIT MODE is active.
 * Strict environment check: Must be enabled AND in a local development environment with explicit opt-in.
 * Never activates on deployed hosting domains (.web.app, .run.app, staging, or production).
 */
export const isDemoCreditModeActive = (): boolean => {
  if (!DEMO_CREDIT_CONFIG.IS_ENABLED) {
    return false;
  }

  // Safety check: disabled in non-browser runtime
  if (typeof window === 'undefined') {
    return false;
  }

  const isDev = Boolean((import.meta as any).env?.DEV);
  const explicitOptIn = (import.meta as any).env?.VITE_ENABLE_DEMO_CREDITS === 'true';

  const hostname = window.location.hostname;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

  return Boolean(isDev && isLocalHost && explicitOptIn);
};
