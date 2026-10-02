export type AuctionStatus = 'active' | 'upcoming' | 'paused' | 'ended' | 'sold' | 'cancelled' | 'reserve-not-met' | 'concluded' | 'reserve_not_met';

export interface Bid {
  id: string;
  auctionId: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  amount: number;
  timestamp: Date;
  message?: string;
  status?: string;
  negotiationId?: string;
  currency?: string;
  currencySymbol?: string;
}

export interface AuctionItem {
  id: string;
  title: string;
  description: string;
  startingPrice: number;
  currentBid: number;
  currency?: string;
  currencySymbol?: string;
  highestBidderId?: string;
  highestBidderName?: string;
  buyNowPrice?: number;
  images: string[];
  sellerId: string;
  sellerName: string;
  startTime: Date;
  endTime: Date;
  status: AuctionStatus;
  category: string;
  bidsCount: number;
  watchersCount: number;
  viewsCount: number;
  uniqueViewersCount?: number;
  viewerUserIds?: string[];
  userViewCounts?: Record<string, number>;
  reservePrice?: number;
  reserveMet?: boolean;
  minIncrement: number;
  extensionsCount: number;
  maxExtensions: number;
  isExtended?: boolean;
  shippingInfo?: string;
  returnPolicy?: string;
  isAuthentic?: boolean;
  verificationStatus?: 'pending' | 'verified' | 'failed';
  createdAt?: Date;
  updatedAt?: Date;
  isNegotiationOnly?: boolean;
  country?: string;
  city?: string;
  brand?: string;
  model?: string;
  sequencePriority?: string;
  tacticalStatus?: string;
  userBidCounts?: Record<string, number>;
  pausedAt?: Date;
  remainingDurationMs?: number;
  pausedRemainingTimeMs?: number;
  isPaused?: boolean;
  isPausedBySeller?: boolean;
  appealStatus?: 'pending' | 'accepted' | 'rejected';
  appealMessage?: string;
  appealSubmittedAt?: Date;
  isPermanentlyRemoved?: boolean;
  contactEmail?: string;
  contactNumber?: string;
  launchType?: 'now' | 'later' | 'boosters';
  durationDays?: number;
  hasFeaturedBadge?: boolean;
  deleted?: boolean;
  removed?: boolean;
  hasBoostedBadge?: boolean;
  featuredUntil?: Date;
  boostedUntil?: Date;
  isPausedByAdmin?: boolean;
  isForceStopped?: boolean;
  forceStopped?: boolean;
  closedOnViolation?: boolean;
  forceStoppedByAdmin?: boolean;
  isSellerBlocked?: boolean;
  isSellerBanned?: boolean;
  orderId?: string;
  soldAt?: Date;
}

export interface ArenaSellerProfile {
  id: string;
  displayName: string;
  photoURL?: string;
  country?: string;
  city?: string;
  address?: string;
  isKycVerified: boolean;
  isPremiumSeller: boolean;
  isPremiumVerified?: boolean;
  verifiedBadgeType?: string;
  verifiedUntil?: any;
  kycStatus?: string;
  isVerified?: boolean;
  emailVerified: boolean;
  memberSince: Date;
  stats: ArenaUserStats;
  isBlocked?: boolean;
  phoneNumber?: string;
  username?: string;
  trustScore?: number;
  trustTier?: string;
  isSystemAccount?: boolean;
  isBot?: boolean;
}

export type NotificationType = 
  | 'outbid' 
  | 'auction_ending' 
  | 'auction_won' 
  | 'auction_lost' 
  | 'private_offer' 
  | 'offer_accepted' 
  | 'kyc_approved' 
  | 'report_resolved' 
  | 'system';

export interface ArenaNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  link?: string;
  auctionId?: string;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  auctionId: string;
  addedAt: Date;
}

export interface ArenaFilters {
  searchQuery?: string;
  category?: string;
  categories?: string[];
  brand?: string;
  city?: string;
  country?: string;
  currencyCode?: string;
  sellerId?: string;
  minPrice?: number;
  maxPrice?: number;
  isKycVerified?: boolean;
  isPremiumSeller?: boolean;
  status?: AuctionStatus[];
  isNegotiationOnly?: boolean;
  isMyAuctions?: boolean;
  sequencePriority?: string;
  tacticalStatus?: string;
}

export type ArenaSortOption = 
  | 'endingSoon' 
  | 'newest' 
  | 'highestBid' 
  | 'lowestPrice' 
  | 'highestPrice' 
  | 'mostWatched' 
  | 'mostBids';

export interface DiscoveryState {
  filters: ArenaFilters;
  sortBy: ArenaSortOption;
  lastDoc?: any;
  hasMore: boolean;
}

export interface ArenaState {
  items: AuctionItem[];
  isLoading: boolean;
  error: string | null;
}

export interface ArenaUserStats {
  completedSales: number;
  completedPurchases: number;
  auctionWins: number;
  auctionLosses: number;
  negotiationSuccess: number;
  responseTime: string;
}

export enum NegotiationStatus {
  OPEN = 'open',
  OFFER_SENT = 'offer_sent',
  COUNTER_OFFERED = 'counter_offered',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  WITHDRAWN = 'withdrawn',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  EXPIRED = 'expired'
}

export interface SharedContactDetails {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  sharedAt?: Date;
}

export interface Negotiation {
  id: string;
  auctionId: string;
  buyerId: string;
  sellerId: string;
  status: NegotiationStatus;
  lastOfferAmount: number;
  lastOfferBy: string;
  lastBuyerOfferAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  acceptedAt?: Date;
  sellerAlias: string; // e.g., 'Seller A'
  offerCount?: number;
  offerCycleCount?: number;
  contactRequested?: boolean;
  contactRequestedAt?: Date;
  contactShared?: boolean;
  contactSharedAt?: Date;
  sharedContactDetails?: SharedContactDetails;
  currency?: string;
  currencySymbol?: string;
  itemTitle?: string;
  itemImage?: string;
  itemPrice?: number;
}

export interface NegotiationOffer {
  id: string;
  negotiationId: string;
  senderId: string;
  amount: number;
  message?: string;
  timestamp: Date;
  action: 'send' | 'counter' | 'accept' | 'decline' | 'withdraw' | 'cancel' | 'complete';
  currency?: string;
  currencySymbol?: string;
}

export enum ReportStatus {
  PENDING = 'pending',
  REVIEWING = 'reviewing',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed'
}

export enum ModerationStatus {
  ACTIVE = 'active',
  WARNING_ISSUED = 'warning_issued',
  HIDDEN = 'hidden',
  PAUSED = 'paused',
  SUSPENDED = 'suspended',
  RESTRICTED = 'restricted',
  BANNED = 'banned',
  RESTORED = 'restored'
}

export enum ModerationActionType {
  ISSUE_WARNING = 'issue_warning',
  HIDE_LISTING = 'hide_listing',
  RESTORE_LISTING = 'restore_listing',
  REMOVE_LISTING = 'remove_listing',
  PAUSE_AUCTION = 'pause_auction',
  RESUME_AUCTION = 'resume_auction',
  CANCEL_AUCTION = 'cancel_auction',
  STOP_POSTING = 'stop_posting',
  RESTORE_POSTING = 'restore_posting',
  STOP_BIDDING = 'stop_bidding',
  RESTORE_BIDDING = 'restore_bidding',
  RESTRICT_NEGOTIATIONS = 'restrict_negotiations',
  RESTORE_NEGOTIATIONS = 'restore_negotiations',
  SUSPEND_ACCOUNT = 'suspend_account',
  BAN_ACCOUNT = 'ban_account',
  UNBAN_ACCOUNT = 'unban_account'
}

export interface ModerationAuditLog {
  id: string;
  moderatorId: string;
  action: ModerationActionType;
  targetType: ReportTargetType;
  targetId: string;
  previousState: string;
  newState: string;
  reason: string;
  relatedReportIds: string[];
  timestamp: Date;
}

export enum ReportReason {
  FRAUD = 'fraud',
  SPAM = 'spam',
  COUNTERFEIT = 'counterfeit',
  FAKE_BIDDING = 'fake_bidding',
  PRICE_MANIPULATION = 'price_manipulation',
  HARASSMENT = 'harassment',
  ILLEGAL_GOODS = 'illegal_goods',
  MISLEADING = 'misleading',
  OTHER = 'other'
}

export type ReportTargetType = 'listing' | 'user' | 'negotiation' | 'offer';

export interface ArenaReport {
  id: string;
  reporterId: string;
  targetId: string;
  targetType: ReportTargetType;
  reason: ReportReason;
  description: string;
  status: ReportStatus;
  createdAt: Date;
  updatedAt: Date;
  adminNotes?: string;
}

export interface RiskScore {
  targetId: string;
  targetType: 'user' | 'listing' | 'negotiation';
  score: number;
  lastReportedAt: Date;
}

export interface AuctionAnalytics {
  id: string;
  bidHistory: {
    amount: number;
    timestamp: Date;
    userName: string;
  }[];
  statistics: {
    averageBid: number;
    highestBid: number;
    lowestBid: number;
    totalBids: number;
    uniqueBidders: number;
    priceGrowth: number;
    percentageIncrease: number;
    bidVelocity: number; // Bids per hour
    momentum: number; // Acceleration/deceleration factor
  };
  priceTrends: {
    timestamp: Date;
    price: number;
  }[];
}

export interface CreateAuctionInput {
  title: string;
  category: string;
  brand: string;
  model: string;
  condition: 'new' | 'mint' | 'excellent' | 'good' | 'fair';
  description: string;
  shippingInfo: string;
  startingPrice: number;
  currency?: string;
  currencySymbol?: string;
  reservePrice?: number;
  durationDays: number;
  country?: string;
  city: string;
  images: File[];
  coverImageIndex: number;
  isNegotiationOnly?: boolean;
  sellerName?: string;
  address?: string;
  contactEmail?: string;
  contactNumber?: string;
  launchType?: 'now' | 'later' | 'boosters';
  hasFeaturedBadge?: boolean;
  hasBoostedBadge?: boolean;
}

export interface SecondChanceOffer {
  id: string;
  auctionId: string;
  originalOrderId: string;
  sellerId: string;
  sellerName?: string;
  buyerId: string;
  buyerName?: string;
  amount: number;
  currency: string;
  currencySymbol: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
  expiresAt: any;
  acceptedAt?: any;
  declinedAt?: any;
  newOrderId?: string;
  itemTitle?: string;
  itemImage?: string;
  createdAt: any;
  updatedAt: any;
}

export interface RunnerUpBid {
  userId: string;
  userName: string;
  userPhotoURL?: string;
  amount: number;
  timestamp: any;
  rank: number;
}

