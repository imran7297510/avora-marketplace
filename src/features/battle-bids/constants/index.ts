export const ARENA_CONFIG = {
  MIN_BID_INCREMENT: 500,
  AUCTION_DURATION_DAYS: 3,
  MAX_WATCHERS_SIMULATED: 50,
  KYC_LIMIT_PKR: 50000,
  MIN_IMAGES: 3,
  MAX_IMAGES: 15,
  MAX_IMAGE_SIZE_MB: 150,
  DURATION_OPTIONS: [
    { label: '1 Day', value: 1.0 },
    { label: '3 Days', value: 3.0 },
    { label: '7 Days', value: 7.0 },
    { label: '15 Days', value: 15.0 }
  ],
  PROHIBITED_KEYWORDS: ['fake', 'replica', 'illegal', 'scam', 'copy'],
  ARENA_THEME_COLORS: {
    primary: 'rose-600',
    secondary: 'amber-500',
    dark: 'stone-950',
  },
  // Private Negotiation Parameters
  MAX_OFFERS_PER_BUYER: 10,
  COOLDOWN_DURATION_MS: 5 * 60 * 1000, // 5 minutes cooldown
  NEW_LISTING_PERIOD_MS: 24 * 60 * 60 * 1000, // 24 hours
  POPULAR_VIEWS_THRESHOLD: 10,
  POPULAR_WATCHERS_THRESHOLD: 5,
  POPULAR_OFFERS_THRESHOLD: 3,
};

export const ARENA_CATEGORIES = [
  'Trading Cards',
  'Luxury Watches',
  'Historical Artifacts',
  'Sports Memorabilia',
  'Sculptures & Art',
];
