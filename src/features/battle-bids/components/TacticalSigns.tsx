import React from 'react';
import { AuctionItem } from '../types';

export interface TacticalSignsProps {
  item?: AuctionItem;
  viewsCount?: number;
  watchersCount?: number;
  bidsCount?: number;
  onBidClick?: (item?: AuctionItem) => void;
  className?: string;
  variant?: 'card' | 'display' | 'timeline' | 'home' | 'negotiation';
  isOwner?: boolean;
  onUserGoLive?: () => void;
  onUserPause?: () => void;
  onUserDelete?: () => void;
  onUserPromote?: () => void;
  onUserBoost?: () => void;
  userActionLoading?: boolean;
  isAdmin?: boolean;
  onAdminWarning?: () => void;
  onAdminPause?: () => void;
  onAdminRemove?: () => void;
  onAdminForceStop?: () => void;
  onAdminBlockToggle?: () => void;
  onAdminBanToggle?: () => void;
  isSellerBlocked?: boolean;
  isSellerBanned?: boolean;
  adminActionLoading?: boolean;
  isConcluded?: boolean;
}

/**
 * Tactical actions toolbar has been permanently removed from the auction system.
 * This component is maintained as a null-returning safe stub.
 */
export const TacticalSigns: React.FC<TacticalSignsProps> = () => {
  return null;
};
