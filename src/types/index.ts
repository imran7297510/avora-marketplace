export interface Listing {
  id: string;
  slug?: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  condition?: string;
  price: number;
  currency?: string;
  currencySymbol?: string;
  quantity: number;
  shippingCharges: number;
  images: string[];
  sellerName: string;
  phoneNumber: string;
  whatsappNumber?: string;
  address?: string;
  country?: string;
  city: string;
  locationArea?: string;
  isFeatured: boolean;
  isBoosted: boolean;
  featuredUntil?: any;
  boostedUntil?: any;
  promotionStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  promotionType?: 'FEATURED' | 'BOOSTED' | 'PREMIUM_VERIFIED';
  promotionProofImage?: string;
  status: 'LIVE' | 'PENDING' | 'REJECTED' | 'SOLD' | 'BOOKED' | 'SUSPENDED';
  previousStatus?: 'LIVE' | 'PENDING' | 'REJECTED' | 'SOLD' | 'BOOKED';
  isSuspended?: boolean;
  bookedAt?: any;
  ownerId: string;
  createdAt: any;
  updatedAt: any;
  views?: number;
  saves?: number;
  shares?: number;
  isVerifiedListing?: boolean;
  originalPrice?: number;
  previousPrice?: number;
  priceDropped?: boolean;
  priceDroppedPercent?: number;
  priceDroppedAmount?: number;
  priceDroppedAt?: any;
  priceHistory?: { price: number; updatedAt: any }[];
}

export interface UserProfile {
  id: string;
  username?: string;
  pastUsernames?: string[];
  lastUsernameChangedAt?: any;
  isVerified: boolean;
  isPremiumVerified?: boolean;
  verifiedUntil?: any;
  trustRanking?: number;
  sellerScore?: number;
  trustScore?: number;
  trustTier?: string;
  trustLastUpdated?: any;
  totalViews?: number;
  totalSaves?: number;
  totalShares?: number;
  name?: string;
  realName?: string;
  businessName?: string;
  email?: string;
  phoneNumber?: string;
  country?: string;
  countryOfStay?: string;
  city?: string;
  businessCity?: string;
  address?: string;
  cnicNumber?: string;
  residentialAddress?: string;
  businessAddress?: string;
  accountType?: 'INDIVIDUAL' | 'BUSINESS';
  photoURL?: string;
  bio?: string;
  websiteUrl?: string;
  facebookPage?: string;
  createdAt: any;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isAuthorizedAdmin?: boolean;
  adminCode?: string;
  isBlocked?: boolean;
  accountStatus?: 'active' | 'blocked' | 'deleted' | 'paused' | 'banned';
  blockedAt?: any;
  blockedBy?: string;
  blockReason?: string;
  adminNotes?: string;
  unblockedAt?: any;
  unblockedBy?: string;
  appealMessage?: string;
  
  // Account classification fields
  isSystemAccount?: boolean;
  isBot?: boolean;
  
  // Pause fields
  isPaused?: boolean;
  pausedAt?: any;
  pausedBy?: string;
  pauseReason?: string;
  unpausedAt?: any;
  unpausedBy?: string;
  
  // Ban & restriction fields
  isBanned?: boolean;
  bannedUntil?: any;
  bannedAt?: any;
  banReason?: string;
  bannedBy?: string;
  reportingDisabled?: boolean;
  offersDisabled?: boolean;
  negotiationsDisabled?: boolean;
  postingDisabled?: boolean;
  biddingDisabled?: boolean;
  canPost?: boolean;
  canBid?: boolean;
  canReport?: boolean;
  canSubmitOffers?: boolean;
  canNegotiate?: boolean;

  verificationStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  verifiedBadgeType?: 'BASIC' | 'GOLDEN' | 'PREMIUM';
  verifiedBadgeRequestStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'RESUME_REQUESTED' | 'FORFEITED' | 'EXPIRED';
  verifiedBadgeRevocationReason?: string;
  verifiedBadgeRevokedAt?: any;
  originalVerifiedUntil?: any;
  pausedRemainingPremiumMs?: number;
  pausedRemainingPremiumSeconds?: number;
  appealDeadline?: any;
  appealStatus?: 'AVAILABLE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'RESOLVED' | 'NONE';
  resumedAt?: any;
  resumedExpiry?: any;
  isPremiumSeller?: boolean;
  premiumBadgeActive?: boolean;
  premiumExpiresAt?: any;
  verificationStage?: 'NONE' | 'SENT_TO_VERIFIERS' | 'PAYMENT_VERIFIED' | 'VERIFIER_DENIED';
  receivedAmount?: number | null;
  rejectionCategory?: 'NON_PAYMENT' | 'POLICY_VIOLATION' | 'FRAUD' | 'REFUNDABLE_REJECTION' | 'OTHER';
  isRefundable?: boolean;
  warningsCount?: number;
  autoClearHistory?: 'off' | '30' | '90';
  lastChatCleanupAt?: any;
  
  // KYC custom variables
  isKycVerified?: boolean;
  kycStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'RESUME_REQUESTED' | 'PERMANENTLY_REMOVED';
  biddingRestrictedUntil?: any;
  biddingRestrictedPermanently?: boolean;
  biddingAppealMessage?: string;
  biddingAppealStatus?: 'pending' | 'accepted' | 'rejected' | null;
  kycType?: 'INDIVIDUAL' | 'OWN_BUSINESS' | 'FIRM_COMPANY' | 'BUSINESS'; // 'BUSINESS' is legacy alias for 'OWN_BUSINESS'
  kycApprovedName?: string;
  kycApprovedAt?: any;
  kycRejectionReason?: string;
  kycRevocationReason?: string;
  hasPendingNameChange?: boolean;
  isNameChangeAllowed?: boolean;
  sellerBadges?: string[];
  allowedSections?: string[];

  // Credits System
  creditsBalance?: number;
  totalCreditsPurchased?: number;
  totalCreditsSpent?: number;
  creditsLastUpdatedAt?: any;
}

export interface ProfileReport {
  id: string;
  profileId: string;
  profileName?: string;
  reporterId: string;
  reason: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: any;
}

export interface Order {
  id?: string;
  listingId: string;
  listingTitle?: string;
  listingImage?: string;
  buyerId: string;
  sellerId: string;
  quantity?: number;
  unitPrice?: number;
  shippingCharges?: number;
  totalAmount?: number;
  amount?: number;
  source?: 'marketplace' | 'battle_bids';
  auctionId?: string;
  itemTitle?: string;
  itemImage?: string;
  sellerName?: string;
  sellerEmail?: string;
  buyerEmail?: string;
  currency?: string;
  currencySymbol?: string;
  paymentDeadline?: any;
  paymentMethod?: string;
  paymentProofUrl?: string;
  paymentProof?: string;
  transactionId?: string;
  paymentNotes?: string;
  paymentSubmittedAt?: any;
  paymentVerifiedAt?: any;
  paymentRejectedAt?: any;
  paymentDenialReason?: string;
  shippingAddress?: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    state?: string;
    postalCode?: string;
  };
  status: 'PENDING' | 'ACCEPTED' | 'BOOKED' | 'SHIPPED' | 'PAID' | 'SOLD' | 'REJECTED' | 'EXPIRED' | 'DEAL_DONE' | 'READY_TO_TRANSFER' | 'AWAITING_PAYMENT' | 'PAYMENT_REVIEW' | 'PAYMENT_EXPIRED' | 'PROCESSING';
  buyerName?: string;
  buyerAddress?: string;
  buyerContact?: string;
  courierName?: string;
  trackingNumber?: string;
  shippingNotes?: string;
  createdAt: any;
  updatedAt: any;
  expiresAt?: any;
  bookedAt?: any;
  acceptedAt?: any;
  shippedAt?: any;
  paymentMadeAt?: any;
}

export interface VerificationApplication {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  paymentProofUrl?: string;
  transactionId?: string;
  durationDays?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: any;
  notes?: string;
}

export interface Chat {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  lastMessage: string;
  updatedAt: any;
  isBlocked?: boolean;
  blockedBy?: string;
  isArchivedBuyer?: boolean;
  isArchivedSeller?: boolean;
  isDeletedBuyer?: boolean;
  isDeletedSeller?: boolean;
  unreadCountBuyer?: number;
  unreadCountSeller?: number;
  isMutedBuyer?: boolean;
  isMutedSeller?: boolean;
  isPinnedBuyer?: boolean;
  isPinnedSeller?: boolean;
  isProfileChat?: boolean;
  otherPartyId?: string;
  lastMessageId?: string;
  lastMessageSenderId?: string;
  lastMessageStatus?: 'sent' | 'delivered' | 'seen';
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  isOffer: boolean;
  offerAmount?: number;
  createdAt: any;
  deletedForUsers?: string[];
  status?: 'sent' | 'delivered' | 'seen';
  image?: string;
}

export interface Report {
  id: string;
  listingId: string;
  listingTitle?: string;
  listingImage?: string;
  listingPrice?: number;
  ownerId?: string;
  reporterId: string;
  reason: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: any;
  source?: 'MARKETPLACE' | 'BATTLE_BIDS' | 'NEGOTIATION';
  sourceLabel?: string;
  targetId?: string;
  targetType?: string;
  description?: string;
  localActionsTaken?: string[];
}

export interface ProfileReport {
  id: string;
  profileId: string;
  targetId?: string;
  targetType?: string;
  reporterId: string;
  reason: string;
  details?: string;
  description?: string;
  status: 'OPEN' | 'RESOLVED';
  createdAt: any;
  source?: 'MARKETPLACE' | 'BATTLE_BIDS' | 'NEGOTIATION';
  sourceLabel?: string;
  userName?: string;
  userEmail?: string;
  userImage?: string | null;
  localActionsTaken?: string[];
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: any;
}

export interface PromotionRequest {
  id: string;
  userId: string;
  targetId: string; // listingId or userId for profile badge
  targetType?: 'listings' | 'arena_auctions' | 'users';
  type: 'FEATURED' | 'BOOST' | 'VERIFIED';
  planName: string; // e.g., "7 Days", "3 Months"
  amount: number;
  currency?: string;
  formattedAmount?: string;
  receivedAmount?: number | null;
  paymentMethod?: 'Easypaisa' | 'Bank Transfer' | 'Cryptocurrency';
  txHash?: string;
  paymentProofImage: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'RESUME_REQUESTED' | 'REMOVED' | 'FORFEITED' | 'EXPIRED';
  durationDays: number;
  createdAt: any;
  updatedAt: any;
  approvedAt?: any;
  rejectedAt?: any;
  revokedAt?: any;
  itemLink?: string;
  revocationReason?: string;
  rejectionReason?: string;
  rejectionCategory?: 'NON_PAYMENT' | 'POLICY_VIOLATION' | 'FRAUD' | 'REFUNDABLE_REJECTION' | 'OTHER';
  isRefundable?: boolean;
  appealMessage?: string;
  appealImages?: string[];
  pausedRemainingPremiumMs?: number;
  pausedRemainingPremiumSeconds?: number;
  originalVerifiedUntil?: any;
  appealDeadline?: any;
  appealStatus?: 'AVAILABLE' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'NONE';
  resumedAt?: any;
  resumedExpiry?: any;
  refundStatus?: 'PENDING' | 'APPROVED' | 'REFUNDED' | 'REJECTED';
  refundProofImage?: string | null;
  refundRequested?: boolean;
  refundRequestedAt?: any;
  refundedAt?: any;
  refundCalculatedAmount?: number;
  refundRetentionAmount?: number;
  refundPercentage?: number;
  refundRetentionPercentage?: number;
  refundName?: string;
  refundBankName?: string;
  refundAccountNumber?: string;
  applicationId?: string;
  wasEverApproved?: boolean;
  verificationStage?: 'NONE' | 'SENT_TO_VERIFIERS' | 'PAYMENT_VERIFIED' | 'VERIFIER_DENIED';
  paymentDeniedAt?: any;
  paymentDenialReason?: string;
  paymentVerifiedAt?: any;
  paymentVerifiedBy?: string;
  paymentVerifiedByUid?: string;
  revisions?: {
    uploadedAt?: any;
    paymentProofImage?: string;
    targetId?: string;
    itemLink?: string;
    updatedAt?: any;
    status?: string;
    rejectionReason?: string;
  }[];
  history?: {
    id: string;
    action: string;
    timestamp: any;
    note?: string;
  }[];
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  order: number;
  updatedAt: any;
}

export interface SupportTicket {
  id: string;
  userId: string;
  name: string;
  email: string;
  subject: string;
  category: 'COMPLAINT' | 'SUGGESTION' | 'QUERY' | 'FEEDBACK' | 'APPEAL';
  message: string;
  attachmentUrl?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: any;
  updatedAt: any;
}

export interface AuthorizedAdminEmail {
  id: string;
  email: string;
  addedAt: any;
  addedBy: string;
  adminCode?: string;
  allowedSections?: string[];
}

export interface KycHistoryItem {
  action: string;
  status: string;
  timestamp: string;
  reason?: string;
  actionBy?: string;
}

export type KycCategoryType = 'INDIVIDUAL' | 'OWN_BUSINESS' | 'FIRM_COMPANY' | 'BUSINESS'; // 'BUSINESS' is legacy alias for 'OWN_BUSINESS'

export interface KycApplication {
  id: string;
  userId: string;
  userEmail: string;
  category: KycCategoryType;
  legalName: string;
  businessName?: string; // used for OWN_BUSINESS and legacy BUSINESS
  cnicNumber: string; // Acts as primary Government-Issued Identity Document Number
  cnicFrontPhoto: string; // Base64 or URL for front photo of Identity Document
  cnicBackPhoto?: string; // Base64 or URL for back photo of Identity Document
  selfiePhoto: string; // Base64 or URL for selfie photo
  mobileNumber: string;
  country?: string;
  countryOfStay?: string;
  city: string;
  residentialAddress?: string;
  businessAddress?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'RESUME_REQUESTED' | 'PERMANENTLY_REMOVED';
  rejectionReason?: string;
  revocationReason?: string;
  appealRejectionReason?: string;
  submittedAt: any;
  approvedAt?: any;
  rejectedAt?: any;
  revokedAt?: any;
  resumedAt?: any;
  appealRejectedAt?: any;
  trackingNumber?: string;
  history?: KycHistoryItem[];

  // Global KYC Expansion Fields (Optional & backward-compatible)
  documentType?: 'NATIONAL_ID' | 'PASSPORT' | 'DRIVING_LICENSE' | 'OTHER' | string;
  businessType?: string;
  businessPhone?: string;
  companyName?: string; // Used for FIRM_COMPANY verification
  registrationNumber?: string; // Business/Company registration or tax number
  businessDocPhoto?: string; // Optional license, tax, registration or incorporation document
  repDesignation?: string; // Representative designation / authority title
  repName?: string; // Authorized representative name
  repPhone?: string; // Representative contact phone
  repIdentityNumber?: string; // Representative government identity document number
  repFrontPhoto?: string; // Representative ID front photo
  repBackPhoto?: string; // Representative ID back photo
  repDocPhoto?: string; // Representative proof of authority / identity document
  repSelfiePhoto?: string; // Representative selfie photo
  repAuthorityLetter?: string; // Representative authority letter / board resolution
}

export interface NameChangeRequest {
  id: string;
  userId: string;
  oldUsername?: string;
  newUsername?: string;
  oldName?: string;
  newName?: string;
  oldRealName?: string;
  newRealName?: string;
  oldBusinessName?: string;
  newBusinessName?: string;
  oldEmail?: string;
  newEmail?: string;
  oldPhoneNumber?: string;
  newPhoneNumber?: string;
  oldBusinessAddress?: string;
  newBusinessAddress?: string;
  oldCnicNumber?: string;
  newCnicNumber?: string;
  oldResidentialAddress?: string;
  newResidentialAddress?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  createdAt: any;
  processedAt?: any;
}

export interface BroadcastRecord {
  id: string;
  title: string;
  message: string;
  link?: string | null;
  type?: 'ANNOUNCEMENT' | 'URGENT' | 'MAINTENANCE' | 'UPDATE';
  priority?: 'NORMAL' | 'HIGH';
  targetAudience?: 'ALL' | 'SELLERS' | 'BUYERS';
  status?: string;
  pinned?: boolean;
  senderEmail: string;
  senderUid: string;
  senderName?: string;
  recipientCount?: number;
  createdAt: any;
}

