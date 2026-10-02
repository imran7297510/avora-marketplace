import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Eye, 
  Users, 
  Gavel, 
  Share2, 
  Copy, 
  Trash2, 
  Pause, 
  Play, 
  ExternalLink, 
  MoreVertical,
  AlertCircle,
  Clock
} from 'lucide-react';
import { AuctionItem } from '../types';
import { ArenaStatus } from './shared/ArenaStatus';
import { formatPrice } from '../../../lib/currencies';
import { formatPostDateTime } from '../utils/arena';

interface ArenaUserAuctionCardProps {
  auction: AuctionItem;
  onAction: (action: 'share' | 'duplicate' | 'delete' | 'togglePause' | 'view' | 'goLive') => void;
}

export const ArenaUserAuctionCard: React.FC<ArenaUserAuctionCardProps> = ({ auction, onAction }) => {
  const [showMenu, setShowMenu] = useState(false);

  const stats = [
    { label: 'Views', icon: Eye, value: auction.viewsCount },
    { label: 'Watchers', icon: Users, value: auction.watchersCount },
    { label: 'Bids', icon: Gavel, value: auction.bidsCount },
  ];

  const isPaused = auction.status === 'paused';
  const isConcluded = auction.status === 'concluded' || 
                      auction.status === 'sold' || 
                      (auction.status as any) === 'accepted' || 
                      (auction as any).negotiationStatus === 'accepted' ||
                      (auction as any).negotiationStatus === 'completed' ||
                      (auction as any).negotiationStatus === 'concluded' ||
                      (auction as any).isAccepted === true ||
                      (auction as any).isSold === true;

  return (
    <div className="group relative bg-stone-900/40 border border-stone-800 rounded-[2.5rem] overflow-hidden hover:border-amber-500/30 transition-all shadow-xl">
      {/* Gallery Preview / Main Image */}
      <div 
        onClick={() => onAction('view')}
        className="relative aspect-video overflow-hidden cursor-pointer"
        title="View Auction Timeline"
      >
        <img 
          src={auction.images[0]} 
          alt={auction.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-transparent to-transparent opacity-80" />
        
        <div className="absolute top-4 left-4">
          <ArenaStatus status={auction.status} endTime={auction.endTime} />
        </div>

        <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between">
          <div>
            {(auction.createdAt || auction.startTime) && (
              <div className="flex items-center gap-1 text-[9px] font-mono text-stone-300 drop-shadow mb-0.5">
                <Clock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                <span>Posted: {formatPostDateTime(auction.createdAt || auction.startTime)}</span>
              </div>
            )}
            <h4 className="text-sm font-black uppercase italic tracking-tighter text-white drop-shadow-lg">
              {auction.title}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-black text-amber-500 uppercase tracking-widest">
                Current: {formatPrice(auction.currentBid, auction.currencySymbol || auction.currency)}
              </span>
            </div>
          </div>
          
          {auction.highestBidderName && (
            <div className="text-right">
              <span className="text-xs font-black text-stone-400 uppercase tracking-widest block">Highest Bidder</span>
              <span className="text-xs font-black text-rose-500 uppercase italic">@{auction.highestBidderName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Engagement Stats */}
      <div className="px-6 py-4 grid grid-cols-3 gap-2 border-b border-stone-800 bg-stone-950/20">
        {stats.map((stat, i) => (
          <div key={i} className="flex flex-col items-center justify-center p-2 rounded-xl bg-stone-900/50">
            <stat.icon className="w-3 h-3 text-stone-400 mb-1" />
            <span className="text-xs font-black text-white">{stat.value}</span>
            <span className="text-[7px] font-black text-stone-600 uppercase tracking-widest">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Action Suite */}
      <div className="p-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button 
            onClick={() => onAction('view')}
            className="p-3 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition-all"
            title="View Auction"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onAction('share')}
            className="p-3 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition-all"
            title="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onAction('duplicate')}
            className="p-3 text-stone-400 hover:text-amber-500 hover:bg-stone-800 rounded-xl transition-all"
            title="Duplicate"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {auction.status === 'upcoming' ? (
            <button 
              onClick={() => onAction('goLive')}
              className="p-3 text-blue-400 hover:text-white hover:bg-blue-600/20 rounded-xl transition-all flex items-center gap-1"
              title="Go Live"
            >
              <Play className="w-4 h-4 fill-current text-blue-500 hover:text-white" />
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 group-hover:text-white hidden sm:inline">Go Live</span>
            </button>
          ) : (
            <button 
              onClick={() => {
                if (isConcluded && !isPaused) {
                  alert("Action denied: Listed items cannot be paused once an offer has been accepted by the seller.");
                  return;
                }
                onAction('togglePause');
              }}
              disabled={isConcluded && !isPaused}
              className={`p-3 rounded-xl transition-all ${
                isPaused 
                  ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20' 
                  : isConcluded 
                    ? 'text-stone-600 bg-stone-900 cursor-not-allowed opacity-40' 
                    : 'text-stone-400 hover:text-white hover:bg-stone-800'
              }`}
              title={isPaused ? 'Resume' : isConcluded ? 'Cannot pause accepted item' : 'Pause'}
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
          <button 
            onClick={() => {
              if (isConcluded) {
                alert("Action Denied: You cannot remove or delete a listed item once it is already marked as Accepted.");
                return;
              }
              onAction('delete');
            }}
            disabled={isConcluded}
            className={`p-3 rounded-xl transition-all ${
              isConcluded
                ? 'text-stone-600 bg-stone-900 cursor-not-allowed opacity-40'
                : 'text-rose-500 hover:text-white hover:bg-rose-500/20'
            }`}
            title={isConcluded ? 'Cannot delete accepted item' : 'Delete'}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pause Overlay */}
      <AnimatePresence>
        {isPaused && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 bg-stone-950/90 flex items-center justify-center p-6 text-center"
          >
            <div className="space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
              <div>
                <h5 className="text-xs font-black uppercase italic text-white">Combat Operations Paused</h5>
                <p className="text-xs font-medium text-stone-400 mt-1 uppercase tracking-widest">Listing is hidden from the Arena</p>
              </div>
              <button
                onClick={() => onAction('togglePause')}
                className="px-6 py-2 bg-amber-500 text-stone-950 text-xs font-black uppercase tracking-widest rounded-lg hover:scale-105 transition-all"
              >
                Resume Mission
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
