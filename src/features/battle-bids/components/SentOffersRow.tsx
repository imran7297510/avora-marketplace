import React from 'react';
import { motion } from 'motion/react';
import { NegotiationOffer } from '../types';
import { formatPKR } from '../../../lib/utils';
import { ArrowRight } from 'lucide-react';

interface SentOffersRowProps {
  offers: (NegotiationOffer & { itemTitle?: string; itemImage?: string; negotiationId?: string })[];
  onSeeAll: () => void;
  onSelectOffer?: (offer: any) => void;
}

export const SentOffersRow: React.FC<SentOffersRowProps> = ({ offers, onSeeAll, onSelectOffer }) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black uppercase text-stone-400">Sent Offers</h4>
        <button onClick={onSeeAll} className="text-[10px] font-black uppercase text-amber-500 hover:text-amber-400 cursor-pointer">See All</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
        {offers.map(offer => (
          <motion.div 
            key={offer.id}
            whileHover={{ scale: 1.02 }}
            onClick={() => onSelectOffer?.(offer)}
            className="flex-shrink-0 w-44 p-3 bg-stone-955 border border-stone-800 rounded-2xl space-y-2 cursor-pointer hover:border-amber-500/40 transition-all active:scale-95 group shadow-md"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                Offer
              </span>
            </div>

            <div className="space-y-0.5">
              {offer.itemTitle && (
                <p className="text-[11px] font-black text-white truncate">{offer.itemTitle}</p>
              )}
              <p className="text-xs font-black text-amber-400">{formatPKR(offer.amount, (offer as any).currencySymbol || (offer as any).currency)}</p>
            </div>

            <div className="flex items-center justify-between text-[10px] text-stone-400 group-hover:text-amber-400 font-bold pt-1.5 border-t border-stone-800 transition-colors">
              <span>Open Room</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

