import Fuse from 'fuse.js';
import { MARKETPLACE_CATEGORIES, LOCATIONS } from '../constants';
import { Listing, UserProfile } from '../types';

export interface SearchSuggestion {
  id: string;
  text: string;
  type: 'category' | 'subcategory' | 'brand' | 'product' | 'trending';
  category?: string;
  subcategory?: string;
}

export interface ParsedQuery {
  cleanSearchTerm: string;
  inferredCategory?: string;
  inferredSubcategory?: string;
  inferredCondition?: 'New' | 'Used';
  inferredLocation?: string;
  inferredMinPrice?: number;
  inferredMaxPrice?: number;
  inferredBrand?: string;
  inferredSortBy?: string;
}

const COMMON_BRANDS = [
  'Apple', 'Samsung', 'iPhone', 'iPad', 'MacBook', 'AirPods', 'Sony', 'PlayStation', 'PS5', 'Xbox', 'Nintendo',
  'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Toyota', 'Honda', 'Suzuki', 'Yamaha', 'Nike', 'Adidas', 'Puma',
  'Oppo', 'Vivo', 'Xiaomi', 'Huawei', 'OnePlus', 'Infinix', 'Realme', 'Tecno'
];

// Rich synonym and Roman Urdu mapping
const SYNONYMS: Record<string, { canonical: string; type: 'brand' | 'subcategory' | 'category' }> = {
  // Brand corrections
  'iphon': { canonical: 'Apple', type: 'brand' },
  'ifone': { canonical: 'Apple', type: 'brand' },
  'aifon': { canonical: 'Apple', type: 'brand' },
  'apple': { canonical: 'Apple', type: 'brand' },
  'samzung': { canonical: 'Samsung', type: 'brand' },
  'samsng': { canonical: 'Samsung', type: 'brand' },
  'samsong': { canonical: 'Samsung', type: 'brand' },
  'sumsung': { canonical: 'Samsung', type: 'brand' },
  'oppa': { canonical: 'Oppo', type: 'brand' },
  'opo': { canonical: 'Oppo', type: 'brand' },
  'toyta': { canonical: 'Toyota', type: 'brand' },
  'toyotah': { canonical: 'Toyota', type: 'brand' },
  'suzk': { canonical: 'Suzuki', type: 'brand' },
  'suzoki': { canonical: 'Suzuki', type: 'brand' },
  'yamha': { canonical: 'Yamaha', type: 'brand' },
  'corola': { canonical: 'Toyota', type: 'brand' },
  
  // Category / Subcategory corrections (Roman Urdu + English common slips)
  'gaari': { canonical: 'Cars', type: 'subcategory' },
  'gari': { canonical: 'Cars', type: 'subcategory' },
  'qar': { canonical: 'Cars', type: 'subcategory' },
  'kar': { canonical: 'Cars', type: 'subcategory' },
  'car': { canonical: 'Cars', type: 'subcategory' },
  'cars': { canonical: 'Cars', type: 'subcategory' },
  
  'bikee': { canonical: 'Motorcycles', type: 'subcategory' },
  'bik': { canonical: 'Motorcycles', type: 'subcategory' },
  'moter bike': { canonical: 'Motorcycles', type: 'subcategory' },
  'motor bike': { canonical: 'Motorcycles', type: 'subcategory' },
  'cycle': { canonical: 'Bicycles', type: 'subcategory' },
  
  'mobail': { canonical: 'Mobile Phones', type: 'subcategory' },
  'fone': { canonical: 'Mobile Phones', type: 'subcategory' },
  'cell': { canonical: 'Mobile Phones', type: 'subcategory' },
  'phone': { canonical: 'Mobile Phones', type: 'subcategory' },
  'smartphone': { canonical: 'Mobile Phones', type: 'subcategory' },
  'mobel': { canonical: 'Mobile Phones', type: 'subcategory' },
  
  'leptop': { canonical: 'Laptops', type: 'subcategory' },
  'labtop': { canonical: 'Laptops', type: 'subcategory' },
  'lap top': { canonical: 'Laptops', type: 'subcategory' },
  'computer': { canonical: 'Computers', type: 'subcategory' },
  'pc': { canonical: 'Computers', type: 'subcategory' },
  
  'soofa': { canonical: 'Sofas', type: 'subcategory' },
  'sofa': { canonical: 'Sofas', type: 'subcategory' },
  'ac': { canonical: 'Air Conditioners', type: 'subcategory' },
  'a.c': { canonical: 'Air Conditioners', type: 'subcategory' },
  'frig': { canonical: 'Refrigerators', type: 'subcategory' },
  'frige': { canonical: 'Refrigerators', type: 'subcategory' }
};

const TRENDING_SEARCHES = [
  'iPhone 13', 'iPhone 14 Pro', 'Samsung Galaxy S23', 'PS5 Console', 'Honda Civic', 'Toyota Corolla',
  'Nike Air Max', 'MacBook Air M2', 'iPad Pro', 'Suzuki GSX'
];

const RECENT_SEARCHES_KEY = 'mandi_recent_searches';
let dynamicProductTitles: string[] = [];

export function updateListingIndex(titles: string[]) {
  dynamicProductTitles = Array.from(new Set(titles)).filter(t => t.length > 2);
}

export function saveRecentSearch(query: string) {
  if (!query || query.length < 2) return;
  const recent = getRecentSearches();
  const updated = [query, ...recent.filter(r => r.toLowerCase() !== query.toLowerCase())].slice(0, 5);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch(e) {}
}

function getRecentSearches(): string[] {
  try {
    const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

/**
 * Intelligent NLP Query Parser
 * Extends conversational queries to map filter states instantly.
 * Standardizes brands, conditions, locations, and pricing limits.
 */
export function parseSearchQuery(queryText: string): ParsedQuery {
  const normalized = queryText.toLowerCase().trim();
  if (!normalized) {
    return { cleanSearchTerm: '' };
  }

  const result: ParsedQuery = {
    cleanSearchTerm: queryText
  };

  let workingString = normalized;

  // 1. Map Condition
  const usedTriggers = ['used', 'purana', 'purani', 'second hand', 'secondhand', 'old', 'sasta', 'used condition'];
  const newTriggers = ['new', 'naya', 'nayi', 'fresh', 'brand new', 'brandnew', 'box packed', 'boxpacked'];
  
  for (const trigger of usedTriggers) {
    if (workingString.includes(trigger)) {
      result.inferredCondition = 'Used';
      workingString = workingString.replace(new RegExp(`\\b${trigger}\\b`, 'gi'), '');
      break;
    }
  }
  if (!result.inferredCondition) {
    for (const trigger of newTriggers) {
      if (workingString.includes(trigger)) {
        result.inferredCondition = 'New';
        workingString = workingString.replace(new RegExp(`\\b${trigger}\\b`, 'gi'), '');
        break;
      }
    }
  }

  // 2. Map Price constraints (e.g., "under 50000", "below 30k")
  const underRegex = /\b(?:under|below|less than|max)\s*(?:rs\.?\s*)?(\d+)\b/i;
  const underMatch = workingString.match(underRegex);
  if (underMatch) {
    result.inferredMaxPrice = parseInt(underMatch[1], 10);
    workingString = workingString.replace(underRegex, '');
  } else {
    // Check for "k" shorthand eg: "under 30k"
    const kRegex = /\b(?:under|below|less than|max)\s*(?:rs\.?\s*)?(\d+)\s*k\b/i;
    const kMatch = workingString.match(kRegex);
    if (kMatch) {
      result.inferredMaxPrice = parseInt(kMatch[1], 10) * 1000;
      workingString = workingString.replace(kRegex, '');
    }
  }

  // 3. Map budget/cheap sort intent
  const cheapTriggers = ['cheap', 'low price', 'budget', 'sasta', 'sasti', 'cheapest'];
  const expensiveTriggers = ['mehenga', 'mehnga', 'expensive', 'costly', 'premium', 'high end', 'highend'];
  for (const trigger of cheapTriggers) {
    if (workingString.includes(trigger)) {
      result.inferredSortBy = 'price_low';
      workingString = workingString.replace(new RegExp(`\\b${trigger}\\b`, 'gi'), '');
      break;
    }
  }
  if (!result.inferredSortBy) {
    for (const trigger of expensiveTriggers) {
      if (workingString.includes(trigger)) {
        result.inferredSortBy = 'price_high';
        workingString = workingString.replace(new RegExp(`\\b${trigger}\\b`, 'gi'), '');
        break;
      }
    }
  }

  // 4. Map Location
  for (const loc of LOCATIONS) {
    if (loc === 'All Pakistan') continue;
    const locLower = loc.toLowerCase();
    if (workingString.includes(locLower)) {
      result.inferredLocation = loc;
      workingString = workingString.replace(new RegExp(`\\b${locLower}\\b`, 'gi'), '');
      break;
    }
  }

  // 5. Look up phonetic synonyms / categories
  const tokens = workingString.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (SYNONYMS[token]) {
      const match = SYNONYMS[token];
      if (match.type === 'brand') {
        result.inferredBrand = match.canonical;
      } else if (match.type === 'subcategory') {
        result.inferredSubcategory = match.canonical;
        // Auto resolve category for subcategory
        const parent = MARKETPLACE_CATEGORIES.find(c => c.subcategories.includes(match.canonical));
        if (parent) {
          result.inferredCategory = parent.name;
        }
      }
    }
  }

  // Fallback to substring scan for categories if no synonym was tagged yet
  if (!result.inferredCategory) {
    for (const cat of MARKETPLACE_CATEGORIES) {
      const catLower = cat.name.toLowerCase();
      if (workingString.includes(catLower)) {
        result.inferredCategory = cat.name;
        workingString = workingString.replace(new RegExp(`\\b${catLower}\\b`, 'gi'), '');
        break;
      }
      for (const sub of cat.subcategories) {
        const subLower = sub.toLowerCase();
        if (workingString.includes(subLower)) {
          result.inferredCategory = cat.name;
          result.inferredSubcategory = sub;
          workingString = workingString.replace(new RegExp(`\\b${subLower}\\b`, 'gi'), '');
          break;
        }
      }
    }
  }

  // Clean-up cleanSearchTerm by removing double-spaces
  result.cleanSearchTerm = workingString.replace(/\s+/g, ' ').trim() || tokens.join(' ');

  return result;
}

/**
 * Intelligent suggestions generator in response to typing.
 * Implements requirement 3: Produces smart structured suggestions including
 * intent-based extensions (e.g. types 'iph' -> suggests "iphone", "iphone used", "iphone karachi", "iphone low price").
 */
export function getSuggestions(query: string): SearchSuggestion[] {
  if (!query || query.length < 1) return [];

  const lowerQuery = query.toLowerCase().trim();
  const suggestions: SearchSuggestion[] = [];

  // Recent Searches fallback matches
  const recent = getRecentSearches();
  recent.forEach(r => {
    if (r.toLowerCase().includes(lowerQuery)) {
      suggestions.push({
        id: `recent-${r}`,
        text: r,
        type: 'trending'
      });
    }
  });

  // Phonetic/Roman Urdu corrections triggers
  let matchedWord = '';
  let standardTerm = '';
  
  for (const key of Object.keys(SYNONYMS)) {
    if (key.startsWith(lowerQuery) || lowerQuery.startsWith(key)) {
      matchedWord = key;
      standardTerm = SYNONYMS[key].canonical;
      break;
    }
  }

  const baseKeywords = standardTerm ? [standardTerm] : [];
  COMMON_BRANDS.forEach(b => {
    if (b.toLowerCase().startsWith(lowerQuery)) baseKeywords.push(b);
  });
  MARKETPLACE_CATEGORIES.forEach(c => {
    if (c.name.toLowerCase().startsWith(lowerQuery)) baseKeywords.push(c.name);
    c.subcategories.forEach(s => {
      if (s.toLowerCase().startsWith(lowerQuery)) baseKeywords.push(s);
    });
  });

  // Expand base keywords with context triggers
  const uniqueBaseKeywords = Array.from(new Set(baseKeywords)).slice(0, 3);
  uniqueBaseKeywords.forEach(kw => {
    suggestions.push({
      id: `base-${kw}`,
      text: kw,
      type: 'product'
    });
    // Requirement 3: Add intent-based choices
    suggestions.push({
      id: `intent-used-${kw}`,
      text: `${kw} used`,
      type: 'trending'
    });
    suggestions.push({
      id: `intent-karachi-${kw}`,
      text: `${kw} karachi`,
      type: 'trending'
    });
    suggestions.push({
      id: `intent-price-${kw}`,
      text: `${kw} low price`,
      type: 'trending'
    });
  });

  // Dynamic Product Titles matching
  dynamicProductTitles.forEach(title => {
    if (title.toLowerCase().includes(lowerQuery)) {
      suggestions.push({
        id: `dyn-${title}`,
        text: title,
        type: 'product'
      });
    }
  });

  // Category and Subcategory objects
  MARKETPLACE_CATEGORIES.forEach(cat => {
    if (cat.name.toLowerCase().includes(lowerQuery)) {
      suggestions.push({
        id: `cat-${cat.name}`,
        text: cat.name,
        type: 'category'
      });
    }
    cat.subcategories.forEach(sub => {
      if (sub.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          id: `sub-${sub}`,
          text: sub,
          type: 'subcategory',
          category: cat.name
        });
      }
    });
  });

  // Brands
  COMMON_BRANDS.forEach(brand => {
    if (brand.toLowerCase().includes(lowerQuery)) {
      suggestions.push({
        id: `brand-${brand}`,
        text: brand,
        type: 'brand'
      });
    }
  });

  // Trending default lists
  TRENDING_SEARCHES.forEach(term => {
    if (term.toLowerCase().includes(lowerQuery)) {
      suggestions.push({
        id: `trending-${term}`,
        text: term,
        type: 'trending'
      });
    }
  });

  // Fuzzy fallback via Fuse.js
  const allTerms = [
    ...COMMON_BRANDS.map(b => ({ text: b, type: 'brand' as const })),
    ...TRENDING_SEARCHES.map(t => ({ text: t, type: 'trending' as const })),
    ...dynamicProductTitles.map(t => ({ text: t, type: 'product' as const })),
    ...MARKETPLACE_CATEGORIES.map(c => ({ text: c.name, type: 'category' as const })),
    ...MARKETPLACE_CATEGORIES.flatMap(c => c.subcategories.map(s => ({ text: s, type: 'subcategory' as const, category: c.name })))
  ];

  const fuse = new Fuse(allTerms, {
    keys: ['text'],
    threshold: 0.4
  });

  const fuseResults = fuse.search(query);
  fuseResults.forEach(res => {
    const item = res.item;
    if (!suggestions.find(s => s.text === item.text)) {
      suggestions.push({
        id: `fuzzy-${item.text}`,
        text: item.text,
        type: item.type,
        category: (item as any).category
      });
    }
  });

  // Unique list
  let uniqueSuggestions = Array.from(new Map(suggestions.map(s => [s.text.toLowerCase(), s])).values());
  
  uniqueSuggestions.sort((a, b) => {
    const aText = a.text.toLowerCase();
    const bText = b.text.toLowerCase();
    
    if (aText === lowerQuery) return -1;
    if (bText === lowerQuery) return 1;
    
    if (aText.startsWith(lowerQuery) && !bText.startsWith(lowerQuery)) return -1;
    if (bText.startsWith(lowerQuery) && !aText.startsWith(lowerQuery)) return 1;
    
    const typePriority = { category: 0, subcategory: 1, brand: 2, trending: 3, product: 4 };
    return (typePriority[a.type] || 5) - (typePriority[b.type] || 5);
  });

  // Ensure the exact typed term of the user always appears first and at the top
  const exactText = query.trim();
  const exactLower = exactText.toLowerCase();
  const exactIdx = uniqueSuggestions.findIndex(s => s.text.toLowerCase() === exactLower);

  if (exactIdx > -1) {
    const [found] = uniqueSuggestions.splice(exactIdx, 1);
    uniqueSuggestions.unshift(found);
  } else {
    uniqueSuggestions.unshift({
      id: `exact-typed-top-${exactLower}`,
      text: exactText,
      type: 'product'
    });
  }
  
  return uniqueSuggestions.slice(0, 8);
}

/**
 * Intelligent Filtering, Synonyms correction & Intent-Based multi-tier ranking.
 * Implements core search constraints, prioritizing featured premium, boosted, organic, recently active etc.
 */
export function getRankedAndFilteredListings(
  listings: Listing[],
  manualFilters: {
    category?: string;
    subcategory?: string;
    condition?: string;
    location?: string;
    minPrice?: string | number;
    maxPrice?: string | number;
    brand?: string;
    sort?: string;
    verifiedOnly?: boolean;
    searchTerm?: string;
  },
  sellers: Record<string, UserProfile>
): Listing[] {
  let result = [...listings];
  const queryText = (manualFilters.searchTerm || '').trim();

  // Combine manual inputs with parsed NLP inputs
  const parsed = parseSearchQuery(queryText);

  // Manual filter overrides NLP parsed filter if specified, otherwise falls back to inferred
  const finalCategory = manualFilters.category || parsed.inferredCategory;
  const finalSubcategory = manualFilters.subcategory || parsed.inferredSubcategory;
  const finalCondition = manualFilters.condition || parsed.inferredCondition;
  const finalLocation = manualFilters.location || parsed.inferredLocation;
  const finalMinPrice = Number(manualFilters.minPrice) || parsed.inferredMinPrice;
  const finalMaxPrice = Number(manualFilters.maxPrice) || parsed.inferredMaxPrice;
  const finalBrand = manualFilters.brand || parsed.inferredBrand;
  const finalSort = manualFilters.sort || parsed.inferredSortBy || 'newest';

  // Apply filters
  result = result.filter(d => {
    const isLive = d.status === 'LIVE' && (d.quantity || 0) > 0;
    
    // Categorization
    if (finalCategory && finalCategory !== 'Sold Out') {
      if (d.category !== finalCategory) return false;
    }
    if (finalSubcategory && d.subcategory !== finalSubcategory) return false;

    // Condition
    if (finalCondition) {
      if (d.condition !== finalCondition) return false;
    }

    // Location
    if (finalLocation && finalLocation !== 'All Pakistan') {
      if (d.city !== finalLocation) return false;
    }

    // Price Bounds
    if (finalMinPrice && d.price < finalMinPrice) return false;
    if (finalMaxPrice && d.price > finalMaxPrice) return false;

    // Brand containment
    if (finalBrand) {
      const match = d.title.toLowerCase().includes(finalBrand.toLowerCase()) || 
                    (d.description || '').toLowerCase().includes(finalBrand.toLowerCase());
      if (!match) return false;
    }

    // Verified badge requirement
    if (manualFilters.verifiedOnly) {
      const seller = sellers[d.ownerId];
      if (!seller || !seller.isVerified) return false;
    }

    // Keyword relevance (if NLP couldn't capture everything or for remaining text query)
    if (parsed.cleanSearchTerm) {
      const cleanTerm = parsed.cleanSearchTerm.toLowerCase();
      
      // Synonym mappings lookup (support "qar" matching "car", etc.)
      const matchedSynonym = SYNONYMS[cleanTerm];
      const targetTerm = matchedSynonym ? matchedSynonym.canonical.toLowerCase() : cleanTerm;

      // Scan title, description, category, subcategory
      const textToMatch = `${d.title} ${d.description || ''} ${d.category} ${d.subcategory || ''} ${d.city || ''}`.toLowerCase();
      
      const keywords = targetTerm.split(/\s+/).filter(Boolean);
      const matched = keywords.every(kw => {
        // Handle plural/singular matching (e.g. cars matches car, bikes matches bike)
        const singularKw = kw.endsWith('s') && kw.length > 3 ? kw.slice(0, -1) : kw;
        
        // Match base, singular keyword or plural form
        if (textToMatch.includes(kw) || textToMatch.includes(singularKw) || (kw.length > 2 && textToMatch.includes(kw + 's'))) return true;

        // Check phonetic spellings
        const phonetic = Object.keys(SYNONYMS).find(syn => syn.includes(kw) || kw.includes(syn));
        if (phonetic) {
          const canonicalLower = SYNONYMS[phonetic].canonical.toLowerCase();
          const canonicalSingular = canonicalLower.endsWith('s') && canonicalLower.length > 3 ? canonicalLower.slice(0, -1) : canonicalLower;
          
          if (
            textToMatch.includes(canonicalLower) || 
            textToMatch.includes(canonicalSingular) ||
            canonicalLower.includes(kw)
          ) {
            return true;
          }
        }
        return false;
      });
      if (!matched) return false;
    }

    return true;
  });

  // Expiry Checker for Featured and Boosted ads
  const isFeaturedActive = (d: Listing) => {
    if (!d.isFeatured) return false;
    if (d.featuredUntil) {
      const fu = d.featuredUntil;
      let expired = false;
      if (typeof fu.toDate === 'function') expired = fu.toDate() < new Date();
      else if (fu.seconds) expired = new Date(fu.seconds * 1000) < new Date();
      else { const dt = new Date(fu); if (!isNaN(dt.getTime())) expired = dt < new Date(); }
      if (expired) return false;
    }
    return true;
  };

  const isBoostedActive = (d: Listing) => {
    if (!d.isBoosted) return false;
    if (d.boostedUntil) {
      const bu = d.boostedUntil;
      let expired = false;
      if (typeof bu.toDate === 'function') expired = bu.toDate() < new Date();
      else if (bu.seconds) expired = new Date(bu.seconds * 1000) < new Date();
      else { const dt = new Date(bu); if (!isNaN(dt.getTime())) expired = dt < new Date(); }
      if (expired) return false;
    }
    return true;
  };

  const isPremiumVerif = (ownerId: string) => {
    const owner = sellers[ownerId];
    if (!owner) return false;
    const isPremium = owner.isPremiumVerified || 
                      owner.verifiedBadgeType === 'GOLDEN' || 
                      owner.verifiedBadgeType === 'PREMIUM';
    return isPremium && owner.isVerified;
  };

  // TIER-BASED INTELLIGENT RANKING ALGORITHM
  result.sort((a, b) => {
    // 1. Core Tier Sorting (Featured vs Boosted vs Organic)
    const aFeatured = isFeaturedActive(a);
    const bFeatured = isFeaturedActive(b);
    const aBoosted = isBoostedActive(a);
    const bBoosted = isBoostedActive(b);
    const aPem = isPremiumVerif(a.ownerId);
    const bPem = isPremiumVerif(b.ownerId);

    // Dynamic Tier weights
    let scoreA = 0;
    let scoreB = 0;

    // Featured + Premium Verified gets absolute Tier 1
    if (aFeatured && aPem) scoreA += 10000;
    if (bFeatured && bPem) scoreB += 10000;

    // Boosted + Premium Verified gets Tier 2
    if (aBoosted && aPem) scoreA += 5000;
    if (bBoosted && bPem) scoreB += 5000;

    // Organic Premium Verified gets Tier 3
    if (aPem && !aFeatured && !aBoosted) scoreA += 2000;
    if (bPem && !bFeatured && !bBoosted) scoreB += 2000;

    // Dynamic Trust / Reputation score from seller
    const sellerA = sellers[a.ownerId] as any;
    const sellerB = sellers[b.ownerId] as any;
    if (sellerA) {
      if (sellerA.responseRate) scoreA += (sellerA.responseRate / 10);
      if (sellerA.isPhoneVerified) scoreA += 100;
    }
    if (sellerB) {
      if (sellerB.responseRate) scoreB += (sellerB.responseRate / 10);
      if (sellerB.isPhoneVerified) scoreB += 100;
    }

    if (scoreA !== scoreB) {
      return scoreB - scoreA; // rank higher scoring first
    }

    // Fallback: Freshness
    const timeA = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
    const timeB = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);

    // Apply manual sort modes
    switch (finalSort) {
      case 'price_low': return a.price - b.price;
      case 'price_high': return b.price - a.price;
      case 'oldest': return timeA - timeB;
      default: return timeB - timeA;
    }
  });

  return result;
}
