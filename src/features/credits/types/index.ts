export type CreditTransactionType =
  | 'PURCHASE'          // Credit purchase (simulated or real)
  | 'AUCTION_BID'       // Spent on auction bid
  | 'NEGOTIATION_OFFER' // Spent on negotiation offer
  | 'PRIVATE_NEGOTIATION_LISTING_POST' // 5-credit fee to list asset in Private Negotiation Hub
  | 'PROMOTIONAL_BONUS' // Promotional bonus / welcome grant
  | 'REFUND'            // Refund from cancelled auction/bid
  | 'ADMIN_ADJUSTMENT'; // Manual admin adjustment

export type CreditTransactionStatus = 'COMPLETED' | 'PENDING' | 'FAILED' | 'REFUNDED';

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number; // Positive for addition (+), negative for deduction (-)
  type: CreditTransactionType;
  description: string;
  idempotencyKey: string; // Deterministic idempotency key
  balanceBefore: number;
  balanceAfter: number;
  status: CreditTransactionStatus;
  relatedEntityId?: string; // e.g. auctionId, negotiationId, packageId
  relatedEntityType?: 'AUCTION' | 'NEGOTIATION' | 'PACKAGE' | 'SYSTEM' | 'ADMIN';
  createdAt: any;
  metadata?: Record<string, any>;
}

export interface CreditPackage {
  id: string;
  name: string;
  usdPrice: number;
  credits: number;
  popular?: boolean;
  badgeText?: string;
  description: string;
}

export interface CreditValidationError {
  code:
    | 'INSUFFICIENT_BALANCE'
    | 'NEGATIVE_BALANCE'
    | 'INVALID_AMOUNT'
    | 'DUPLICATE_TRANSACTION'
    | 'INVALID_TYPE'
    | 'UNAUTHORIZED_OPERATION'
    | 'SERVER_REQUIRED';
  message: string;
  details?: Record<string, any>;
}

export interface CreditsContextType {
  creditsBalance: number;
  totalCreditsPurchased: number;
  totalCreditsSpent: number;
  creditsLastUpdatedAt: any;
  transactions: CreditTransaction[];
  loading: boolean;
  error: string | null;
  isLedgerOpen: boolean;
  isPurchaseOpen: boolean;
  isDemoMode: boolean;
  openLedger: () => void;
  closeLedger: () => void;
  openPurchase: () => void;
  closePurchase: () => void;
  refreshCredits: () => Promise<void>;
  requestSimulatedPurchase: (packageId: string) => Promise<{ success: boolean; message: string }>;
  resetDemoBalance?: () => void;
  setDemoBalance?: (amount: number, reason?: string) => void;
}
