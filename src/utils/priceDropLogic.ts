export const MIN_PRICE_DROP_PERCENTAGE = 5;
export const MAX_SINGLE_DECREASE_PERCENTAGE = 20;
export const PRICE_CHANGE_COOLDOWN_HOURS = 24;
export const PRICE_DROP_MAX_AGE_DAYS = 14;

export interface PriceDropEvaluationResult {
  isDrop: boolean;
  previousPrice?: number;
  priceDroppedPercent?: number;
  priceDroppedAmount?: number;
}

export function getPriceDropTimestampMs(listing: any): number | null {
  if (!listing) return null;

  const parseTimestamp = (val: any): number | null => {
    if (!val) return null;
    if (typeof val.toMillis === 'function') {
      const ms = val.toMillis();
      return typeof ms === 'number' && !isNaN(ms) ? ms : null;
    }
    if (typeof val.toDate === 'function') {
      const dt = val.toDate();
      return dt instanceof Date && !isNaN(dt.getTime()) ? dt.getTime() : null;
    }
    if (typeof val.seconds === 'number') {
      return val.seconds * 1000;
    }
    if (typeof val._seconds === 'number') {
      return val._seconds * 1000;
    }
    if (val instanceof Date) {
      const t = val.getTime();
      return isNaN(t) ? null : t;
    }
    if (typeof val === 'number') {
      if (isNaN(val) || val <= 0) return null;
      return val < 10000000000 ? val * 1000 : val;
    }
    if (typeof val === 'string') {
      const t = new Date(val).getTime();
      return isNaN(t) ? null : t;
    }
    return null;
  };

  // 1. Direct explicit priceDroppedAt timestamp
  if (listing.priceDroppedAt) {
    const ts = parseTimestamp(listing.priceDroppedAt);
    if (ts !== null) return ts;
  }

  // 2. Price history entries
  if (Array.isArray(listing.priceHistory) && listing.priceHistory.length > 0) {
    for (let i = listing.priceHistory.length - 1; i >= 0; i--) {
      const entry = listing.priceHistory[i];
      if (entry && entry.updatedAt) {
        const ts = parseTimestamp(entry.updatedAt);
        if (ts !== null) return ts;
      }
    }
  }

  return null;
}

export function evaluatePriceDropUpdate(
  currentPrice: number,
  newPrice: number,
  history: { price: number; updatedAt: any }[] = [],
  originalPrice?: number
): PriceDropEvaluationResult {
  const standardBaseline = originalPrice || currentPrice;
  if (newPrice >= standardBaseline) {
    return { isDrop: false };
  }

  const amount = standardBaseline - newPrice;
  const percent = Math.round((amount / standardBaseline) * 100);

  if (percent < MIN_PRICE_DROP_PERCENTAGE) {
    return { isDrop: false };
  }

  return {
    isDrop: true,
    previousPrice: standardBaseline,
    priceDroppedPercent: percent,
    priceDroppedAmount: amount,
  };
}

export function isListingEligibleForPriceDrops(listing: any): boolean {
  if (!listing || listing.status !== 'LIVE') return false;
  const currentPrice = Number(listing.price);
  if (isNaN(currentPrice) || currentPrice <= 0) return false;

  const baselinePrice = Number(listing.originalPrice || listing.previousPrice || currentPrice);
  if (isNaN(baselinePrice) || baselinePrice <= 0) return false;

  if (!listing.priceDropped) return false;

  const discountPercent = Number(
    listing.priceDroppedPercent ?? (baselinePrice > currentPrice
      ? Math.round(((baselinePrice - currentPrice) / baselinePrice) * 100)
      : 0)
  );

  if (isNaN(discountPercent) || discountPercent < MIN_PRICE_DROP_PERCENTAGE) return false;
  if (currentPrice >= baselinePrice) return false;

  // 14-Day Freshness Window Rule (HPD-01)
  const dropTimeMs = getPriceDropTimestampMs(listing);
  if (dropTimeMs !== null) {
    const maxAgeMs = PRICE_DROP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const elapsedMs = Date.now() - dropTimeMs;
    if (elapsedMs > maxAgeMs) {
      return false;
    }
  }

  return true;
}

export function validatePriceChangeTiming(history: { price: number; updatedAt: any }[] = [], listing?: any): { allowed: boolean; remainingHours?: number; remainingMinutes?: number; message?: string } {
  const lastChange = history.length > 0 ? history[history.length - 1] : null;
  const lastChangeTime = lastChange?.updatedAt 
    ? (typeof lastChange.updatedAt.toDate === 'function' ? lastChange.updatedAt.toDate().getTime() : new Date(lastChange.updatedAt).getTime()) 
    : (listing?.updatedAt ? (typeof listing.updatedAt.toDate === 'function' ? listing.updatedAt.toDate().getTime() : new Date(listing.updatedAt).getTime()) : (listing?.createdAt ? (typeof listing.createdAt.toDate === 'function' ? listing.createdAt.toDate().getTime() : new Date(listing.createdAt).getTime()) : 0));

  if (lastChangeTime > 0) {
    const elapsedMs = Date.now() - lastChangeTime;
    const cooldownMs = PRICE_CHANGE_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (elapsedMs < cooldownMs) {
      const remainingMs = cooldownMs - elapsedMs;
      const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
      const remainingMinutes = Math.ceil((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const timeStr = remainingHours > 0 ? `${remainingHours} hour(s) and ${remainingMinutes} minute(s)` : `${remainingMinutes} minute(s)`;
      return { 
        allowed: false, 
        remainingHours, 
        remainingMinutes,
        message: `Price update blocked: You must wait ${timeStr} before you can increase or decrease the price again (24-hour cooldown rule after last price change).` 
      };
    }
  }
  return { allowed: true };
}

export function validatePriceDecreaseLimit(currentPrice: number, newPrice: number): { allowed: boolean; minAllowedPrice: number } {
  const minAllowedPrice = currentPrice * (1 - MAX_SINGLE_DECREASE_PERCENTAGE / 100);
  if (newPrice < currentPrice && newPrice < minAllowedPrice) {
    return { allowed: false, minAllowedPrice };
  }
  return { allowed: true, minAllowedPrice };
}
