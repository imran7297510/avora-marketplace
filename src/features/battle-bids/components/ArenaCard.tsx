import React, { memo, useMemo, useState } from 'react';
import { AuctionItem } from '../types';
import { cn, formatPKR } from '../../../lib/utils';
import { getCountryFlag } from '../../../components/CountrySelector';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import { 
  Flame, 
  Clock, 
  Gavel, 
  MessageSquare, 
  ShieldCheck, 
  Sparkles, 
  MapPin,
  Users,
  Eye
} from 'lucide-react';
import { ArenaButton } from './ArenaButton';
import { ArenaTacticalActions } from './ArenaTacticalActions';
import { getAuctionDisplayStatus, getSecondaryBadge, formatPostDateTime } from '../utils';
import { useSellerProfile } from '../hooks/useSellerProfile';
import { useAuth } from '../../../context/AuthContext';
import { resolveAuthoritativeVerification } from '../../../lib/verificationResolver';

interface ArenaCardProps {
  item: AuctionItem;
  onBidClick?: (item: AuctionItem) => void;
  onImageClick?: (imageUrl: string) => void;
  hideActions?: boolean;
  hideMainButton?: boolean;
  hideAdminActions?: boolean;
}

export const ArenaCard = memo(({ item, onBidClick, onImageClick, hideActions, hideMainButton, hideAdminActions }: ArenaCardProps) => {
  const { profile: sellerProfile } = useSellerProfile(item?.sellerId);
  const { user } = useAuth();
  const isOwner = user?.uid === item?.sellerId;
  const [localZoomImage, setLocalZoomImage] = useState<string | null>(null);

  const authVerif = useMemo(() => {
    return resolveAuthoritativeVerification(sellerProfile);
  }, [sellerProfile]);

  const isSystemSeller = useMemo(() => {
    return sellerProfile?.isSystemAccount === true ||
           sellerProfile?.isBot === true ||
           item?.sellerId === 'arena-official-host' || 
           item?.sellerId === 'arena_bot_alpha' || 
           item?.sellerId === 'arena_bot_beta' || 
           item?.sellerId === 'arena_bot_gamma';
  }, [sellerProfile, item?.sellerId]);

  const isKyc = useMemo(() => {
    if (isSystemSeller) return false;
    return authVerif.isKycCurrentlyValid;
  }, [isSystemSeller, authVerif]);

  // Determine if seller is Premium
  const isPremium = useMemo(() => {
    if (isSystemSeller) return false;
    return authVerif.isPremiumCurrentlyActive;
  }, [isSystemSeller, authVerif]);

  // Determine country and city (with seed bot fallbacks)
  const country = useMemo(() => {
    if (item.country) return item.country;
    if (sellerProfile?.country) return sellerProfile.country;
    return 'Pakistan';
  }, [item.country, sellerProfile?.country]);

  const city = useMemo(() => {
    if (item.city) return item.city;
    if (item.sellerId === 'arena-official-host') return 'Lahore';
    if (item.sellerId === 'arena_bot_alpha') return 'Karachi';
    if (item.sellerId === 'arena_bot_beta') return 'Islamabad';
    if (item.sellerId === 'arena_bot_gamma') return 'Peshawar';
    return 'Lahore';
  }, [item.city, item.sellerId]);

  const secondaryBadge = useMemo(() => {
    return getSecondaryBadge(item, isPremium);
  }, [item, isPremium]);

  const displayStatus = useMemo(() => {
    return getAuctionDisplayStatus(item);
  }, [item]);

  if (!item) {
    return null;
  }

  return (
    <>
    <div 
      onClick={() => onBidClick?.(item)}
      className="group cursor-pointer bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden hover:border-amber-500/40 transition-all shadow-xl hover:shadow-amber-500/5 flex flex-col h-full"
    >
      {/* Top Media Area */}
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-955 shrink-0">
        <img 
          src={item.images[0]} 
          alt={item.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 cursor-zoom-in"
          onClick={(e) => {
            e.stopPropagation();
            if (onImageClick) {
              onImageClick(item.images[0]);
            } else {
              setLocalZoomImage(item.images[0]);
            }
          }}
        />
        
        {/* Absolute Top Badges overlay */}
        <div className="absolute top-3 inset-x-3 flex justify-between items-start gap-2">
          {/* Primary Status Badge */}
          <div className={cn(
            "px-2.5 py-1 bg-stone-950/95 border rounded-lg flex items-center gap-1.5 backdrop-blur-sm shadow-md",
            displayStatus === 'active' ? 'border-emerald-500/40 text-emerald-400' : 
            displayStatus === 'upcoming' ? 'border-blue-500/40 text-blue-400' :
            displayStatus === 'sold' ? 'border-amber-500/40 text-amber-400' :
            displayStatus === 'reserve_not_met' ? 'border-rose-500/40 text-rose-400' :
            displayStatus === 'paused' ? 'border-amber-500/40 text-amber-400' :
            'border-stone-700/60 text-stone-300'
          )}>
            {displayStatus === 'active' ? (
              <>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                <span className="text-[10px] font-black uppercase tracking-wider">Live</span>
              </>
            ) : displayStatus === 'upcoming' ? (
              <>
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-wider">Upcoming</span>
              </>
            ) : displayStatus === 'sold' ? (
              <>
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                <span className="text-[10px] font-black uppercase tracking-wider">Sold</span>
              </>
            ) : displayStatus === 'reserve_not_met' ? (
              <>
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                <span className="text-[10px] font-black uppercase tracking-wider">Reserve Not Met</span>
              </>
            ) : displayStatus === 'paused' ? (
              <>
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-wider">Paused</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 bg-stone-500 rounded-full" />
                <span className="text-[10px] font-black uppercase tracking-wider">Concluded</span>
              </>
            )}
          </div>

          {!hideActions && (
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {item.hasFeaturedBadge && (
                <span className="bg-amber-500 text-stone-950 text-[8px] sm:text-[9px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider shadow-md shadow-amber-950/20">
                  ★ Featured
                </span>
              )}
              {item.hasBoostedBadge && (
                <span className="bg-blue-600 text-white text-[8px] sm:text-[9px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider shadow-md shadow-blue-950/20">
                  ⚡ Boosted
                </span>
              )}
              {/* Secondary Badge (if any) */}
              {secondaryBadge && (
                <span className={cn("shadow-md shadow-stone-955/20 backdrop-blur-sm", secondaryBadge.colorClass)}>
                  {secondaryBadge.icon} {secondaryBadge.label}
                </span>
              )}
            </div>
          )}
          {hideActions && (
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {item.hasFeaturedBadge && (
                <span className="bg-amber-500 text-stone-950 text-[8px] sm:text-[9px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider shadow-md">
                  ★ Featured
                </span>
              )}
              {item.hasBoostedBadge && (
                <span className="bg-blue-600 text-white text-[8px] sm:text-[9px] px-2 py-0.5 rounded-lg font-black uppercase tracking-wider shadow-md">
                  ⚡ Boosted
                </span>
              )}
              {secondaryBadge && (
                <span className={cn("shadow-md shadow-stone-955/20 backdrop-blur-sm", secondaryBadge.colorClass)}>
                  {secondaryBadge.icon} {secondaryBadge.label}
                </span>
              )}
            </div>
          )}
        </div>

        {/* City capsules & bottom overlay */}
        <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-stone-955 via-stone-955/50 to-transparent flex items-end justify-between">
          <div className="flex items-center gap-1 px-2 py-0.5 bg-stone-955/80 rounded-md border border-stone-800/40 text-[10px] font-bold text-stone-300 backdrop-blur-sm">
            <MapPin className="w-3 h-3 text-stone-400" />
            <span className="uppercase">{getCountryFlag(country)} {country}, {city}</span>
          </div>

          {!hideActions && (
            <div className="flex items-center gap-2 text-white">
              <div className="flex items-center gap-1 text-white">
                <Flame className="w-3 h-3 text-amber-500" />
                <span className="text-[10px] font-black uppercase tracking-wider">{item.bidsCount} Offers</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Details Area */}
      <div className="p-3 sm:p-4 flex flex-col flex-1 justify-between gap-2 sm:gap-3">
        <div className="space-y-1 sm:space-y-1.5">
          {/* Exact Date & Time Posted beneath image and before title */}
          {(item.createdAt || item.startTime) && (
            <div className="flex items-center gap-1 text-[9px] font-mono text-stone-400">
              <Clock className="w-2.5 h-2.5 text-amber-500 shrink-0" />
              <span>Posted: <strong className="text-stone-300 font-semibold">{formatPostDateTime(item.createdAt || item.startTime)}</strong></span>
            </div>
          )}

          {/* Seller trust badges */}
          <div className="flex flex-wrap items-center gap-1">
            {isKyc && (
              <span className="inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[8px] sm:text-[9px] font-bold text-emerald-400 uppercase">
                <ShieldCheck className="w-2.5 h-2.5 shrink-0" /> KYC Approved
              </span>
            )}
            {isPremium && (
              <span className="inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[8px] sm:text-[9px] font-bold text-amber-400 uppercase">
                <Sparkles className="w-2.5 h-2.5 shrink-0" /> Premium Seller
              </span>
            )}
          </div>

          <div>
            <h3 className="text-white font-black uppercase italic tracking-tight text-xs sm:text-sm md:text-base leading-tight line-clamp-2 group-hover:text-amber-400 transition-colors">
              {item.title}
            </h3>
            <p className="text-stone-500 text-[9px] sm:text-[10px] font-bold uppercase mt-0.5">
              {item.category}
            </p>
          </div>
        </div>

        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between py-2 sm:py-2.5 border-y border-stone-800">
            <div>
              <span className="text-stone-500 text-[8px] sm:text-[9px] font-black uppercase tracking-widest block">
                {item.isNegotiationOnly ? 'Private Offer' : 'Current Bid'}
              </span>
              <span className="text-white font-mono text-xs sm:text-sm md:text-base font-black">
                {formatPKR(item.currentBid, item.currencySymbol || item.currency)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-stone-500 text-[8px] sm:text-[9px] font-black uppercase tracking-widest block flex items-center justify-end gap-1">
                <Clock className="w-2 h-2" /> Ends In
              </span>
              <span className="text-amber-500 font-bold text-[9px] sm:text-xs uppercase">
                Flexible Limit
              </span>
            </div>
          </div>

          {!hideMainButton && (
            <div className="shrink-0">
              {displayStatus === 'active' ? (
                <ArenaButton 
                  variant="primary" 
                  className="w-full text-[10px] sm:text-xs font-black uppercase py-2 sm:py-2.5 tracking-wider"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBidClick?.(item);
                  }}
                >
                  {item.isNegotiationOnly ? (
                    <><MessageSquare className="w-3 h-3" /> Submit Private Offer</>
                  ) : (
                    <><Gavel className="w-3 h-3" /> Submit Bid</>
                  )}
                </ArenaButton>
              ) : displayStatus === 'upcoming' ? (
                <ArenaButton 
                  variant="secondary" 
                  className="w-full text-[10px] sm:text-xs py-2 sm:py-2.5 font-black uppercase"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBidClick?.(item);
                  }}
                >
                  <Clock className="w-3.5 h-3.5" /> View Details
                </ArenaButton>
              ) : displayStatus === 'paused' ? (
                <ArenaButton 
                  variant="secondary" 
                  className="w-full cursor-not-allowed opacity-60 text-[10px] sm:text-xs py-2 sm:py-2.5 font-black uppercase"
                  disabled
                >
                  Paused
                </ArenaButton>
              ) : (
                <ArenaButton 
                  variant="secondary" 
                  className="w-full text-[10px] sm:text-xs py-2 sm:py-2.5 font-black uppercase"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBidClick?.(item);
                  }}
                >
                  <Eye className="w-3.5 h-3.5" /> View Results
                </ArenaButton>
              )}
            </div>
          )}

          {/* Public Tactical Actions Row */}
          {!hideActions && (
            <div className="w-full pt-1.5 border-t border-stone-850">
              <ArenaTacticalActions item={item} />
            </div>
          )}

          {/* Bottom Card Padding / Spacer */}
          <div className="w-full" />
        </div>
      </div>
    </div>

    <Lightbox
      open={!!localZoomImage}
      close={() => setLocalZoomImage(null)}
      index={Math.max(0, (item.images || []).indexOf(localZoomImage || ''))}
      slides={(item.images && item.images.length > 0 ? item.images : [localZoomImage || '']).map((src) => ({ src }))}
      plugins={[Zoom]}
      carousel={{ padding: 0 }}
    />
    </>
  );
});

ArenaCard.displayName = 'ArenaCard';
