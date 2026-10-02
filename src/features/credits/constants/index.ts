import { CreditPackage, CreditTransactionType } from '../types';

// Frozen Business Rules & System Constants
export const USD_TO_CREDITS_RATE = 10; // $1 USD = 10 Credits
export const DEFAULT_NEW_USER_CREDITS = 0; // Default new-user balance = 0 credits
export const CREDITS_PER_AUCTION_BID = 1; // 1 valid auction bid = 1 credit
export const CREDITS_PER_NEGOTIATION_LISTING_POST = 5; // 5 credits posting fee for Private Negotiation Hub listings
export const MAX_VALID_BIDS_PER_AUCTION = 10; // Max 10 valid bids per user per auction
export const MAX_NEGOTIATION_OFFERS_PER_PARTICIPANT = 10; // Max 10 negotiation offers per participant per negotiation

// Predefined Credit Packages ($1 USD = 10 Credits)
export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'starter_pack',
    name: 'Starter Pack',
    usdPrice: 1.00,
    credits: 10,
    description: '10 Credits for starting out on Battle Bids auctions',
  },
  {
    id: 'pro_pack',
    name: 'Pro Trader Pack',
    usdPrice: 5.00,
    credits: 50,
    popular: true,
    badgeText: 'MOST POPULAR',
    description: '50 Credits for active traders and negotiators',
  },
  {
    id: 'power_pack',
    name: 'Power Bidder Pack',
    usdPrice: 10.00,
    credits: 100,
    badgeText: 'BEST VALUE',
    description: '100 Credits for power bidding across high-volume items',
  },
  {
    id: 'vip_pack',
    name: 'VIP Commander Pack',
    usdPrice: 25.00,
    credits: 250,
    description: '250 Credits for institutional and high-tier participants',
  },
];

// Transaction labels for UI rendering
export const TRANSACTION_TYPE_LABELS: Record<CreditTransactionType, { label: string; isCredit: boolean }> = {
  PURCHASE: { label: 'Credit Purchase', isCredit: true },
  PROMOTIONAL_BONUS: { label: 'Promotional Bonus', isCredit: true },
  REFUND: { label: 'Credit Refund', isCredit: true },
  AUCTION_BID: { label: 'Auction Bid Fee', isCredit: false },
  NEGOTIATION_OFFER: { label: 'Negotiation Fee', isCredit: false },
  PRIVATE_NEGOTIATION_LISTING_POST: { label: 'Negotiation Listing Fee', isCredit: false },
  ADMIN_ADJUSTMENT: { label: 'Admin Adjustment', isCredit: true },
};
