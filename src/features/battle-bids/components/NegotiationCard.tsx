import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Negotiation, NegotiationStatus } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, ArrowRight, ShieldCheck, Clock, CheckCircle2, MapPin, XCircle, ArrowRightLeft } from 'lucide-react';
import { cn, formatPKR } from '../../../lib/utils';
import { getCountryFlag } from '../../../components/CountrySelector';
import { NegotiationStatusBadge } from './NegotiationStatusBadge';
import { useSellerProfile } from '../hooks/useSellerProfile';

interface NegotiationCardProps {
  negotiation: Negotiation;
  auction?: any;
  isBuyer: boolean;
  className?: string;
  onClick?: () => void;
}

export function getSubmittedOfferStatus(
  negotiation: Negotiation,
  auction?: any
): { label: 'Submitted' | 'Accepted' | 'Rejected' | 'Countered' | 'Expired'; color: string; icon: React.ReactNode } {
  const statusStr = (negotiation?.status || '').toLowerCase();
  
  // 2. Accepted: if the submitted offer has been accepted
  if (statusStr === 'accepted' || statusStr === 'completed' || statusStr === 'concluded') {
    return {
      label: 'Accepted',
      color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
    };
  }

  // 3. Rejected: if the submitted offer has been rejected
  if (statusStr === 'declined' || statusStr === 'rejected' || statusStr === 'withdrawn' || statusStr === 'cancelled') {
    return {
      label: 'Rejected',
      color: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
    };
  }

  // 5. Expired: if the listed items under private negotiation hub has been expired without finalizing the deal.
  const now = Date.now();
  const isAuctionExpired = auction?.status === 'expired' || 
    auction?.status === 'closed' ||
    (auction?.endTime && new Date(auction.endTime).getTime() < now);
  const isNegExpired = statusStr === 'expired' || 
    (negotiation?.expiresAt && new Date(negotiation.expiresAt).getTime() < now);

  if (isAuctionExpired || isNegExpired) {
    return {
      label: 'Expired',
      color: 'bg-stone-800 text-stone-400 border-stone-700',
      icon: <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
    };
  }

  // 4. Countered: if submitted offer was countered by the seller
  const isSellerLastOffer = negotiation?.lastOfferBy === negotiation?.sellerId || 
                            negotiation?.lastOfferBy === 'seller' || 
                            negotiation?.lastOfferBy === 'simulated-seller' ||
                            (auction?.sellerId && negotiation?.lastOfferBy === auction.sellerId);

  if (statusStr === 'counter_offered' && isSellerLastOffer) {
    return {
      label: 'Countered',
      color: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      icon: <ArrowRightLeft className="w-3.5 h-3.5 text-purple-300 shrink-0" />
    };
  }

  // 1. Submitted: if submitted but no action taken by the seller
  return {
    label: 'Submitted',
    color: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
  };
}

export const NegotiationCard: React.FC<NegotiationCardProps> = ({ 
  negotiation, 
  auction,
  isBuyer,
  className,
  onClick
}) => {
  const navigate = useNavigate();
  const otherPartyId = isBuyer ? negotiation.sellerId : negotiation.buyerId;
  const { profile } = useSellerProfile(otherPartyId);

  const offerStatus = getSubmittedOfferStatus(negotiation, auction);

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, input, textarea, select, a, [data-interactive="true"]')) {
      return;
    }
    if (onClick) {
      onClick();
    } else {
      navigate(`/negotiations/timeline/${negotiation.id}`);
    }
  };

  return (
    <div 
      onClick={handleCardClick}
      className={cn(
        "group p-6 bg-stone-900 border border-white/5 rounded-[2rem] hover:border-amber-500/30 transition-all cursor-pointer relative overflow-hidden",
        className
      )}
    >
      {/* Active Indicator */}
      {(negotiation.status === NegotiationStatus.OFFER_SENT || negotiation.status === NegotiationStatus.COUNTER_OFFERED) && (
        <div className="absolute top-6 right-6">
          <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping" />
        </div>
      )}

      {/* Item Title & Description for Mobile Preview */}
      {auction && (
        <div className="mb-4 pb-4 border-b border-stone-800/60 block sm:hidden">
           <h3 className="text-sm font-black text-white uppercase tracking-tight line-clamp-1">{auction.title}</h3>
           {auction.description && (
             <p className="text-[10px] text-stone-400 font-medium line-clamp-2 mt-1">{auction.description}</p>
           )}
        </div>
      )}

      <div className="flex items-start gap-5">
        <div className="w-14 h-14 bg-stone-955 border border-white/5 rounded-2xl flex items-center justify-center text-stone-700 group-hover:scale-110 transition-transform">
          <MessageSquare className="w-6 h-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-black text-white uppercase italic truncate">
                  Anonymous User
                </h4>
                {profile && (
                  <div className="flex items-center gap-1 shrink-0">
                    {profile.isPremiumSeller ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
                    ) : profile.isKycVerified ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 fill-blue-500/10" />
                    ) : null}
                  </div>
                )}
              </div>
              {/* Country & City Display */}
              <div className="flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5 text-stone-500" />
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-tight">
                  {profile?.country ? `${getCountryFlag(profile.country)} ${profile.country}, ` : ''}{profile?.city || "Location Unknown"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-auto shrink-0">
              {profile && (
                <span className="hidden sm:block text-[10px] font-black text-amber-500/80 bg-amber-500/5 border border-amber-500/10 px-1.5 py-0.5 rounded-md">
                  {(profile.stats.completedSales || 0) * 10}%
                </span>
              )}
              <NegotiationStatusBadge status={negotiation.status} className="px-2 py-0.5 text-xs shrink-0" />
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-bold text-stone-400">
              Last movement {negotiation.updatedAt && !isNaN(negotiation.updatedAt.getTime()) 
                ? formatDistanceToNow(negotiation.updatedAt, { addSuffix: true }) 
                : 'Pending'}
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-black uppercase text-stone-600 tracking-widest mb-1">Last Offer</p>
              <p className="text-lg font-black text-white italic tracking-tighter">
                {formatPKR(negotiation.lastOfferAmount, (negotiation as any).currencySymbol || (negotiation as any).currency)}
              </p>
            </div>
            
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Real-time Submitted Offer Status badge */}
              <div 
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 shrink-0 shadow-sm transition-all",
                  offerStatus.color
                )}
                title={`Status: ${offerStatus.label}`}
              >
                {offerStatus.icon}
                <span>{offerStatus.label}</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs font-black uppercase text-amber-500 tracking-widest opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 ml-auto">
                Enter Hub <ArrowRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
