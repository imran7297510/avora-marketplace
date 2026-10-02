import { ArenaSellerProfile } from '../types';

export function getFallbackSellerProfile(userId: string | undefined): ArenaSellerProfile {
  if (!userId) {
    return {
      id: 'system_fallback',
      displayName: 'Battle Bids Participant',
      username: 'participant',
      country: 'Global',
      city: 'Live Arena',
      address: 'Battle Bids Network',
      isKycVerified: false,
      isPremiumSeller: false,
      isPremiumVerified: false,
      isVerified: false,
      kycStatus: 'NONE',
      isSystemAccount: true,
      isBot: true,
      emailVerified: false,
      memberSince: new Date('2024-01-01'),
      isBlocked: false,
      phoneNumber: undefined,
      trustScore: undefined,
      trustTier: undefined,
      stats: {
        completedSales: 0,
        completedPurchases: 0,
        auctionWins: 0,
        auctionLosses: 0,
        negotiationSuccess: 0,
        responseTime: 'Instant'
      }
    };
  }

  const normalized = userId.toLowerCase().trim();

  if (normalized === 'arena-official-host' || normalized === 'arena_host') {
    return {
      id: 'arena-official-host',
      displayName: 'Arena Official Host',
      username: 'arena_host',
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop',
      country: 'Global',
      city: 'Live Arena',
      address: 'Battle Bids Official System',
      isKycVerified: false,
      isPremiumSeller: false,
      isPremiumVerified: false,
      isVerified: false,
      kycStatus: 'NONE',
      isSystemAccount: true,
      isBot: true,
      emailVerified: false,
      memberSince: new Date('2024-01-01'),
      isBlocked: false,
      phoneNumber: undefined,
      trustScore: undefined,
      trustTier: undefined,
      stats: {
        completedSales: 0,
        completedPurchases: 0,
        auctionWins: 0,
        auctionLosses: 0,
        negotiationSuccess: 0,
        responseTime: 'Instant'
      }
    };
  }

  if (normalized === 'arena_bot_alpha' || normalized === 'bot_alpha') {
    return {
      id: 'arena_bot_alpha',
      displayName: 'Tactical Bidder Alpha',
      username: 'bot_alpha',
      photoURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
      country: 'Global',
      city: 'Live Arena',
      address: 'Battle Bids Simulation Node Alpha',
      isKycVerified: false,
      isPremiumSeller: false,
      isPremiumVerified: false,
      isVerified: false,
      kycStatus: 'NONE',
      isSystemAccount: true,
      isBot: true,
      emailVerified: false,
      memberSince: new Date('2024-01-01'),
      isBlocked: false,
      phoneNumber: undefined,
      trustScore: undefined,
      trustTier: undefined,
      stats: {
        completedSales: 0,
        completedPurchases: 0,
        auctionWins: 0,
        auctionLosses: 0,
        negotiationSuccess: 0,
        responseTime: 'Instant'
      }
    };
  }

  if (normalized === 'arena_bot_beta' || normalized === 'bot_beta') {
    return {
      id: 'arena_bot_beta',
      displayName: 'Elite Collector Beta',
      username: 'bot_beta',
      photoURL: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop',
      country: 'Global',
      city: 'Live Arena',
      address: 'Battle Bids Simulation Node Beta',
      isKycVerified: false,
      isPremiumSeller: false,
      isPremiumVerified: false,
      isVerified: false,
      kycStatus: 'NONE',
      isSystemAccount: true,
      isBot: true,
      emailVerified: false,
      memberSince: new Date('2024-01-01'),
      isBlocked: false,
      phoneNumber: undefined,
      trustScore: undefined,
      trustTier: undefined,
      stats: {
        completedSales: 0,
        completedPurchases: 0,
        auctionWins: 0,
        auctionLosses: 0,
        negotiationSuccess: 0,
        responseTime: 'Instant'
      }
    };
  }

  if (normalized === 'arena_bot_gamma' || normalized === 'bot_gamma') {
    return {
      id: 'arena_bot_gamma',
      displayName: 'Shadow Dealer Gamma',
      username: 'bot_gamma',
      photoURL: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop',
      country: 'Global',
      city: 'Live Arena',
      address: 'Battle Bids Simulation Node Gamma',
      isKycVerified: false,
      isPremiumSeller: false,
      isPremiumVerified: false,
      isVerified: false,
      kycStatus: 'NONE',
      isSystemAccount: true,
      isBot: true,
      emailVerified: false,
      memberSince: new Date('2024-01-01'),
      isBlocked: false,
      phoneNumber: undefined,
      trustScore: undefined,
      trustTier: undefined,
      stats: {
        completedSales: 0,
        completedPurchases: 0,
        auctionWins: 0,
        auctionLosses: 0,
        negotiationSuccess: 0,
        responseTime: 'Instant'
      }
    };
  }

  // Format human readable display name for real user fallback if Firestore snapshot is unavailable
  let displayName = userId;
  if (userId.includes('-') || userId.includes('_')) {
    displayName = userId
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  } else if (userId.length >= 20) {
    displayName = 'User (' + userId.substring(0, 6) + ')';
  } else {
    displayName = userId.charAt(0).toUpperCase() + userId.slice(1);
  }

  return {
    id: userId,
    displayName: displayName,
    username: userId.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    photoURL: undefined,
    country: undefined,
    city: undefined,
    address: undefined,
    isKycVerified: false,
    isPremiumSeller: false,
    isPremiumVerified: false,
    isVerified: false,
    kycStatus: 'NONE',
    emailVerified: false,
    memberSince: new Date(),
    isBlocked: false,
    phoneNumber: undefined,
    trustScore: undefined,
    trustTier: undefined,
    stats: {
      completedSales: 0,
      completedPurchases: 0,
      auctionWins: 0,
      auctionLosses: 0,
      negotiationSuccess: 0,
      responseTime: 'Standard'
    }
  };
}
