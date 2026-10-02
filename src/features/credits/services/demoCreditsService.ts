import { CreditTransaction } from '../types';
import { DEMO_CREDIT_CONFIG } from '../constants/demoConfig';

const DEMO_EVENT_NAME = 'mandi_demo_credits_changed';

interface DemoStorageData {
  creditsBalance: number;
  totalCreditsPurchased: number;
  totalCreditsSpent: number;
  creditsLastUpdatedAt: number;
}

export class DemoCreditsService {
  private static getBalanceStorageKey(userId: string): string {
    return `${DEMO_CREDIT_CONFIG.STORAGE_KEY_PREFIX}${userId}`;
  }

  private static getTxStorageKey(userId: string): string {
    return `${DEMO_CREDIT_CONFIG.TX_STORAGE_KEY_PREFIX}${userId}`;
  }

  /**
   * Initializes or loads the demo state for a given user.
   */
  private static getOrInitDemoData(userId: string): DemoStorageData {
    if (!userId) {
      return {
        creditsBalance: 0,
        totalCreditsPurchased: 0,
        totalCreditsSpent: 0,
        creditsLastUpdatedAt: Date.now(),
      };
    }

    const key = this.getBalanceStorageKey(userId);
    const raw = localStorage.getItem(key);

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.creditsBalance === 'number') {
          return parsed;
        }
      } catch (err) {
        console.warn('[DemoCreditsService] Failed to parse demo credit data, resetting:', err);
      }
    }

    // Initialize with default 1000 DEMO Credits
    const initialData: DemoStorageData = {
      creditsBalance: DEMO_CREDIT_CONFIG.INITIAL_DEMO_CREDITS,
      totalCreditsPurchased: DEMO_CREDIT_CONFIG.INITIAL_DEMO_CREDITS,
      totalCreditsSpent: 0,
      creditsLastUpdatedAt: Date.now(),
    };

    localStorage.setItem(key, JSON.stringify(initialData));

    // Create initial genesis demo transaction
    const genesisTx: CreditTransaction = {
      id: `demo_tx_init_${userId}_${Date.now()}`,
      userId,
      amount: DEMO_CREDIT_CONFIG.INITIAL_DEMO_CREDITS,
      type: 'PROMOTIONAL_BONUS',
      description: `Initial Demo Testing Grant (${DEMO_CREDIT_CONFIG.INITIAL_DEMO_CREDITS} DEMO Credits)`,
      idempotencyKey: `ik_demo_init_${userId}`,
      balanceBefore: 0,
      balanceAfter: DEMO_CREDIT_CONFIG.INITIAL_DEMO_CREDITS,
      status: 'COMPLETED',
      relatedEntityType: 'SYSTEM',
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
      metadata: { isDemo: true, mode: 'DEVELOPMENT_DEMO_MODE' },
    };

    localStorage.setItem(this.getTxStorageKey(userId), JSON.stringify([genesisTx]));

    return initialData;
  }

  /**
   * Retrieves current demo credit balance for a user.
   */
  static getDemoBalance(userId: string): number {
    if (!userId) return 0;
    const data = this.getOrInitDemoData(userId);
    return data.creditsBalance;
  }

  /**
   * Retrieves complete demo statistics for a user.
   */
  static getDemoStats(userId: string): {
    creditsBalance: number;
    totalCreditsPurchased: number;
    totalCreditsSpent: number;
    creditsLastUpdatedAt: any;
  } {
    if (!userId) {
      return { creditsBalance: 0, totalCreditsPurchased: 0, totalCreditsSpent: 0, creditsLastUpdatedAt: null };
    }
    const data = this.getOrInitDemoData(userId);
    return {
      creditsBalance: data.creditsBalance,
      totalCreditsPurchased: data.totalCreditsPurchased,
      totalCreditsSpent: data.totalCreditsSpent,
      creditsLastUpdatedAt: { seconds: Math.floor(data.creditsLastUpdatedAt / 1000) },
    };
  }

  /**
   * Retrieves the demo transaction history for a user.
   */
  static getDemoTransactions(userId: string): CreditTransaction[] {
    if (!userId) return [];
    this.getOrInitDemoData(userId); // ensure initialized
    const key = this.getTxStorageKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  /**
   * Deducts 1 demo credit when a bid is placed.
   */
  static deductDemoCreditForBid(
    userId: string,
    auctionId: string,
    auctionTitle: string,
    bidIndex: number
  ): {
    success: boolean;
    balanceBefore: number;
    balanceAfter: number;
    idempotencyKey: string;
  } {
    const data = this.getOrInitDemoData(userId);
    const cost = DEMO_CREDIT_CONFIG.DEMO_CREDITS_PER_BID;
    const idempotencyKey = `ik_demo_${userId}_AUCTION_BID_DEDUCT_${auctionId}_${bidIndex}`;

    // Prevent duplicate deduction if this specific bid strike was already processed
    const existingTxs = this.getDemoTransactions(userId);
    const existingTx = existingTxs.find((tx) => tx.idempotencyKey === idempotencyKey);
    if (existingTx) {
      return {
        success: true,
        balanceBefore: data.creditsBalance,
        balanceAfter: data.creditsBalance,
        idempotencyKey,
      };
    }

    if (data.creditsBalance < cost) {
      throw new Error(`INSUFFICIENT_CREDITS: You need at least ${cost} DEMO credit to place a bid. Current DEMO balance: ${data.creditsBalance}`);
    }

    const balanceBefore = data.creditsBalance;
    const balanceAfter = balanceBefore - cost;

    const updatedData: DemoStorageData = {
      ...data,
      creditsBalance: balanceAfter,
      totalCreditsSpent: data.totalCreditsSpent + cost,
      creditsLastUpdatedAt: Date.now(),
    };

    localStorage.setItem(this.getBalanceStorageKey(userId), JSON.stringify(updatedData));

    const newTx: CreditTransaction = {
      id: `demo_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      amount: -cost,
      type: 'AUCTION_BID',
      description: `[DEMO] Bid Strike #${bidIndex} on ${auctionTitle}`,
      idempotencyKey,
      balanceBefore,
      balanceAfter,
      status: 'COMPLETED',
      relatedEntityId: auctionId,
      relatedEntityType: 'AUCTION',
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
      metadata: { isDemo: true, bidIndex, auctionTitle },
    };

    localStorage.setItem(
      this.getTxStorageKey(userId),
      JSON.stringify([newTx, ...existingTxs])
    );

    this.notifySubscribers(userId);

    return {
      success: true,
      balanceBefore,
      balanceAfter,
      idempotencyKey,
    };
  }

  /**
   * Deducts 1 demo credit when a negotiation offer / counter offer is made.
   */
  static deductDemoCreditForNegotiationOffer(
    userId: string,
    negotiationId: string,
    itemTitle: string,
    offerIndex: number,
    isCounterOffer: boolean = false
  ): {
    success: boolean;
    balanceBefore: number;
    balanceAfter: number;
    idempotencyKey: string;
  } {
    const data = this.getOrInitDemoData(userId);
    const cost = isCounterOffer ? 0 : 1;
    if (cost === 0) {
      return {
        success: true,
        balanceBefore: data.creditsBalance,
        balanceAfter: data.creditsBalance,
        idempotencyKey: '',
      };
    }
    const idempotencyKey = `ik_demo_${userId}_NEGOTIATION_OFFER_${negotiationId}_${offerIndex}`;

    // Prevent duplicate deduction if this specific offer was already processed
    const existingTxs = this.getDemoTransactions(userId);
    const existingTx = existingTxs.find((tx) => tx.idempotencyKey === idempotencyKey);
    if (existingTx) {
      return {
        success: true,
        balanceBefore: data.creditsBalance,
        balanceAfter: data.creditsBalance,
        idempotencyKey,
      };
    }

    if (data.creditsBalance < cost) {
      throw new Error(`INSUFFICIENT_CREDITS: You need at least ${cost} DEMO credit to make an offer. Current DEMO balance: ${data.creditsBalance}`);
    }

    const balanceBefore = data.creditsBalance;
    const balanceAfter = balanceBefore - cost;

    const updatedData: DemoStorageData = {
      ...data,
      creditsBalance: balanceAfter,
      totalCreditsSpent: data.totalCreditsSpent + cost,
      creditsLastUpdatedAt: Date.now(),
    };

    localStorage.setItem(this.getBalanceStorageKey(userId), JSON.stringify(updatedData));

    const newTx: CreditTransaction = {
      id: `demo_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      amount: -cost,
      type: 'NEGOTIATION_OFFER',
      description: `[DEMO] ${isCounterOffer ? 'Counter Offer' : 'Strategic Offer'} #${offerIndex} on ${itemTitle}`,
      idempotencyKey,
      balanceBefore,
      balanceAfter,
      status: 'COMPLETED',
      relatedEntityId: negotiationId,
      relatedEntityType: 'NEGOTIATION',
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
      metadata: { isDemo: true, offerIndex, itemTitle, isCounterOffer },
    };

    localStorage.setItem(
      this.getTxStorageKey(userId),
      JSON.stringify([newTx, ...existingTxs])
    );

    this.notifySubscribers(userId);

    return {
      success: true,
      balanceBefore,
      balanceAfter,
      idempotencyKey,
    };
  }

  /**
   * Deducts 5 demo credits when a new Private Negotiation listing is posted.
   */
  static deductDemoCreditForNegotiationListing(
    userId: string,
    listingId: string,
    listingTitle: string
  ): {
    success: boolean;
    balanceBefore: number;
    balanceAfter: number;
    idempotencyKey: string;
  } {
    const data = this.getOrInitDemoData(userId);
    const cost = 5;
    const idempotencyKey = `ik_demo_${userId}_PRIVATE_NEGOTIATION_LISTING_POST_${listingId}`;

    // Prevent duplicate deduction if this specific listing post was already processed
    const existingTxs = this.getDemoTransactions(userId);
    const existingTx = existingTxs.find((tx) => tx.idempotencyKey === idempotencyKey);
    if (existingTx) {
      return {
        success: true,
        balanceBefore: data.creditsBalance,
        balanceAfter: data.creditsBalance,
        idempotencyKey,
      };
    }

    if (data.creditsBalance < cost) {
      throw new Error(`INSUFFICIENT_CREDITS: You need at least ${cost} DEMO credits to post a Private Negotiation listing. Current DEMO balance: ${data.creditsBalance}`);
    }

    const balanceBefore = data.creditsBalance;
    const balanceAfter = balanceBefore - cost;

    const updatedData: DemoStorageData = {
      ...data,
      creditsBalance: balanceAfter,
      totalCreditsSpent: data.totalCreditsSpent + cost,
      creditsLastUpdatedAt: Date.now(),
    };

    localStorage.setItem(this.getBalanceStorageKey(userId), JSON.stringify(updatedData));

    const newTx: CreditTransaction = {
      id: `demo_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      amount: -cost,
      type: 'PRIVATE_NEGOTIATION_LISTING_POST',
      description: `[DEMO] Private Negotiation Hub Listing Fee: ${listingTitle}`,
      idempotencyKey,
      balanceBefore,
      balanceAfter,
      status: 'COMPLETED',
      relatedEntityId: listingId,
      relatedEntityType: 'NEGOTIATION',
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
      metadata: { isDemo: true, listingTitle, feeType: 'POSTING_FEE', creditsCharged: cost },
    };

    localStorage.setItem(
      this.getTxStorageKey(userId),
      JSON.stringify([newTx, ...existingTxs])
    );

    this.notifySubscribers(userId);

    return {
      success: true,
      balanceBefore,
      balanceAfter,
      idempotencyKey,
    };
  }

  /**
   * Sets demo credit balance to a specific amount (useful for testing insufficient credits, e.g. setting to 0).
   */
  static setDemoBalance(userId: string, newBalance: number, reason = 'Manual Testing Adjustment'): void {
    if (!userId) return;
    const data = this.getOrInitDemoData(userId);
    const balanceBefore = data.creditsBalance;
    const diff = newBalance - balanceBefore;

    const updatedData: DemoStorageData = {
      ...data,
      creditsBalance: Math.max(0, newBalance),
      totalCreditsPurchased: diff > 0 ? data.totalCreditsPurchased + diff : data.totalCreditsPurchased,
      creditsLastUpdatedAt: Date.now(),
    };

    localStorage.setItem(this.getBalanceStorageKey(userId), JSON.stringify(updatedData));

    const adjTx: CreditTransaction = {
      id: `demo_tx_adj_${Date.now()}`,
      userId,
      amount: diff,
      type: 'ADMIN_ADJUSTMENT',
      description: `[DEMO TEST] ${reason}: ${newBalance} DEMO Credits`,
      idempotencyKey: `ik_demo_adj_${userId}_${Date.now()}`,
      balanceBefore,
      balanceAfter: Math.max(0, newBalance),
      status: 'COMPLETED',
      relatedEntityType: 'ADMIN',
      createdAt: { seconds: Math.floor(Date.now() / 1000) },
      metadata: { isDemo: true, reason },
    };

    const existingTxs = this.getDemoTransactions(userId);
    localStorage.setItem(
      this.getTxStorageKey(userId),
      JSON.stringify([adjTx, ...existingTxs])
    );

    this.notifySubscribers(userId);
  }

  /**
   * Resets demo credits back to default 1000.
   */
  static resetDemoBalance(userId: string): void {
    this.setDemoBalance(userId, DEMO_CREDIT_CONFIG.INITIAL_DEMO_CREDITS, 'Reset to Default Balance');
  }

  /**
   * Dispatches change event to notify reactive UI hooks.
   */
  private static notifySubscribers(userId: string): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(DEMO_EVENT_NAME, {
          detail: { userId, timestamp: Date.now() },
        })
      );
    }
  }

  /**
   * Subscribe to demo credit updates.
   */
  static subscribe(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const handler = () => {
      callback();
    };

    window.addEventListener(DEMO_EVENT_NAME, handler);
    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener(DEMO_EVENT_NAME, handler);
      window.removeEventListener('storage', handler);
    };
  }
}
