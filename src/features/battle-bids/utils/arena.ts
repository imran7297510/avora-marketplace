import { ARENA_CONFIG } from '../constants';

/**
 * Safely converts various timestamp formats (Firestore Timestamp, Date, ISO string, milliseconds, seconds, null, or undefined)
 * into a valid JavaScript Date. Returns fallback (defaults to null) if invalid or null/undefined.
 */
export const parseSafeDate = (val: any, fallback: Date | null = null): Date | null => {
  if (val === null || val === undefined) {
    return fallback;
  }

  // 1. Check if it's already a JS Date
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? fallback : val;
  }

  // 2. Check if it's a Firestore Timestamp (has toDate method or seconds/nanoseconds properties)
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        const d = val.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) {
          return d;
        }
      } catch (e) {
        // Suppress and try fallback
      }
    }
    
    // Sometimes Timestamp objects might lose their methods when serialized/deserialized/cached
    if (typeof val.seconds === 'number') {
      const d = new Date(val.seconds * 1000 + (typeof val.nanoseconds === 'number' ? Math.floor(val.nanoseconds / 1000000) : 0));
      if (!isNaN(d.getTime())) {
        return d;
      }
    }

    // Check if it's an object representation of Date (e.g. from JSON)
    if (typeof val.getTime === 'function') {
      const d = new Date(val.getTime());
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
  }

  // 3. Check if it's a number (milliseconds or seconds)
  if (typeof val === 'number') {
    // If it looks like a Unix timestamp in seconds (e.g., less than 500000000000)
    const msValue = val < 500000000000 ? val * 1000 : val;
    const d = new Date(msValue);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }

  // 4. Check if it's a string (ISO string or numeric string)
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.length === 0) {
      return fallback;
    }
    if (!isNaN(Number(trimmed))) {
      const num = Number(trimmed);
      const msValue = num < 500000000000 ? num * 1000 : num;
      const d = new Date(msValue);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d;
    }
  }

  return fallback;
};

/**
 * Formats the exact and real date and time an auction/item was posted.
 * E.g., "Aug 27, 2026 • 02:00 PM"
 */
export const formatPostDateTime = (dateVal: any): string => {
  const date = parseSafeDate(dateVal);
  if (!date) return '';
  
  try {
    const formattedDate = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const formattedTime = date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return `${formattedDate} • ${formattedTime}`;
  } catch {
    return date.toLocaleString();
  }
};

export const formatTimeRemaining = (ms: number): string => {
  if (ms <= 0) return '00:00:00';
  
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  parts.push(hours.toString().padStart(2, '0'));
  parts.push(minutes.toString().padStart(2, '0'));
  parts.push(seconds.toString().padStart(2, '0'));

  return parts.join(':').replace(':0', ':'); // Simple formatting
};

export const calculateMinNextBid = (currentBid: number): number => {
  return currentBid + ARENA_CONFIG.MIN_BID_INCREMENT;
};

export const getAuctionStatus = (startTime: Date, endTime: Date): 'upcoming' | 'active' | 'ended' => {
  const now = new Date();
  if (now < startTime) return 'upcoming';
  if (now > endTime) return 'ended';
  return 'active';
};

export type UnifiedAuctionStatus = 'active' | 'upcoming' | 'ended' | 'sold' | 'reserve_not_met' | 'paused' | 'concluded';

export const getAuctionDisplayStatus = (item: any): UnifiedAuctionStatus => {
  if (item.status === 'paused') {
    return 'paused';
  }
  if (item.status === 'upcoming') {
    return 'upcoming';
  }

  const now = Date.now();
  const start = parseSafeDate(item.startTime)?.getTime() || 0;
  const end = parseSafeDate(item.endTime)?.getTime() || 0;

  // 1. Check if Sold
  if (item.soldAmount > 0 || item.status === 'sold') {
    return 'sold';
  }

  // 2. Check if Upcoming
  if (start > now) {
    return 'upcoming';
  }

  // 3. Check if Active
  if (now >= start && now < end) {
    return 'active';
  }

  // 4. Check if Ended/Concluded
  if (now >= end) {
    if (item.reservePrice && !item.reserveMet) {
      return 'reserve_not_met';
    }
    return 'ended';
  }

  return 'active';
};

export interface SecondaryBadge {
  label: string;
  icon: string;
  colorClass: string;
}

export function getSecondaryBadge(item: any, isPremiumSeller?: boolean): SecondaryBadge | null {
  const now = Date.now();
  const end = parseSafeDate(item.endTime)?.getTime() || 0;
  const start = parseSafeDate(item.startTime)?.getTime() || 0;
  
  // Only show secondary badges for active auctions
  if (now < start || now > end || item.status !== 'active') return null;

  // 1. ⏳ Ending Soon (Priority 1) - Ends in < 2 hours
  const remaining = end - now;
  if (remaining > 0 && remaining < 2 * 60 * 60 * 1000) {
    return {
      label: "Ending Soon",
      icon: "⏳",
      colorClass: "bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider"
    };
  }

  // 2. 🔥 Hot Auction (Priority 2) - High bid activity or views
  const views = item.viewsCount || 0;
  const offersCount = item.bidsCount || 0;
  if (offersCount >= 10 || views >= 50) {
    return {
      label: "Hot Auction",
      icon: "🔥",
      colorClass: "bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider"
    };
  }

  // 3. ✨ New (Priority 3) - Listed in last 24h
  const createdAt = parseSafeDate(item.createdAt)?.getTime() || 0;
  if (now - createdAt < 24 * 60 * 60 * 1000) {
    return {
      label: "New",
      icon: "✨",
      colorClass: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider"
    };
  }

  // 4. 💎 Premium Seller (Priority 4)
  if (isPremiumSeller) {
    return {
      label: "Premium Seller",
      icon: "💎",
      colorClass: "bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider"
    };
  }

  return null;
}

export function isListingRemoved(item: any): boolean {
  if (!item) return true;
  return (
    item.deleted === true ||
    item.removed === true ||
    item.isRemoved === true ||
    item.isPermanentlyRemoved === true ||
    item.status === 'cancelled' ||
    item.status === 'force_closed' ||
    item.status === 'force_stopped' ||
    item.status === 'stopped' ||
    item.status === 'stopped_by_admin' ||
    item.status === 'banned' ||
    item.status === 'suspended' ||
    item.moderationStatus === 'hidden' ||
    item.closedOnViolation === true ||
    item.forceStoppedByAdmin === true ||
    item.isForceStopped === true ||
    item.forceStopped === true ||
    item.isStoppedByAdmin === true
  );
}

export function getNegotiationHubStatus(item: any, negotiation?: any) {
  if (isListingRemoved(item)) {
    return {
      label: 'Listing Removed',
      color: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      isActive: false
    };
  }

  // 1. Closed On Violation / Force stopped by admin
  if (
    item.status === 'force_closed' || 
    item.status === 'force_stopped' ||
    item.status === 'stopped' ||
    item.status === 'stopped_by_admin' ||
    item.status === 'banned' || 
    item.status === 'suspended' || 
    item.status === 'cancelled' ||
    item.moderationStatus === 'hidden' || 
    item.closedOnViolation === true || 
    item.forceStoppedByAdmin === true ||
    item.isForceStopped === true ||
    item.forceStopped === true ||
    item.isStoppedByAdmin === true
  ) {
    return {
      label: 'Force stopped by the admin on violating the policies',
      color: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      isActive: false
    };
  }

  // 2. Paused by the Admin
  if (
    item.status === 'admin_paused' || 
    item.status === 'paused_by_admin' ||
    item.pausedBy === 'admin' || 
    item.isPausedByAdmin === true
  ) {
    return {
      label: 'Paused by the Admin',
      color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      isActive: false
    };
  }

  // 3. Paused by the Seller
  if (
    item.status === 'paused' || 
    item.status === 'paused_by_seller' ||
    item.pausedBy === 'seller' || 
    item.isPausedBySeller === true || 
    item.isPaused === true
  ) {
    return {
      label: 'Paused by the Seller',
      color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      isActive: false
    };
  }

  // 4. Offer Concluded (Accepted or Completed or Sold)
  const negStatus = (negotiation?.status || '').toLowerCase();
  if (
    negStatus === 'accepted' || 
    negStatus === 'completed' || 
    negStatus === 'concluded' ||
    item.status === 'sold' || 
    item.status === 'concluded'
  ) {
    return {
      label: 'Offer Concluded',
      color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      isActive: false
    };
  }

  // 5. Expired (expired without accepting offers or finalizing)
  const parsedEnd = item.endTime ? parseSafeDate(item.endTime) : null;
  const parsedNegEnd = negotiation?.expiresAt ? parseSafeDate(negotiation.expiresAt) : null;
  const isNegConcluded = ['accepted', 'completed', 'concluded'].includes(negStatus);
  const isNegExpired = negotiation && !isNegConcluded && (
    negStatus === 'expired' ||
    (parsedNegEnd && Date.now() > parsedNegEnd.getTime())
  );

  const isTimeExpired = (parsedEnd && Date.now() > parsedEnd.getTime()) || 
    item.status === 'ended' || 
    item.status === 'expired' ||
    item.status === 'closed' ||
    isNegExpired;

  if (isTimeExpired) {
    return {
      label: 'Expired',
      color: 'bg-stone-800 text-stone-400 border-stone-700',
      isActive: false
    };
  }

  // 6. Live (available and accepting offers)
  return {
    label: 'Live',
    color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    isActive: true
  };
}


