import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { formatPrice } from './currencies';

export function formatPKR(amount: number, currencyCodeOrSymbol?: string) {
  return formatPrice(amount, currencyCodeOrSymbol);
}

export function formatRelativeTime(dateInput: Date | number | any): string {
  if (!dateInput) return "";
  let date: Date;
  if (typeof dateInput.toDate === "function") {
    date = dateInput.toDate();
  } else if (dateInput.seconds) {
    date = new Date(dateInput.seconds * 1000);
  } else {
    date = new Date(dateInput);
  }
  
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const isToday = now.getDate() === date.getDate() && 
                  now.getMonth() === date.getMonth() && 
                  now.getFullYear() === date.getFullYear();
                  
  if (isToday || diffHours < 24) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export {
  MIN_PRICE_DROP_PERCENTAGE,
  PRICE_DROP_MAX_AGE_DAYS,
  getPriceDropTimestampMs,
  evaluatePriceDropUpdate,
  isListingEligibleForPriceDrops,
} from '../utils/priceDropLogic';


