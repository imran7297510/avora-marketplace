import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArenaLayout } from '../../features/battle-bids/components/ArenaLayout';
import { ArenaUserAuctionCard } from '../../features/battle-bids/components/ArenaUserAuctionCard';
import { ArenaSectionHeader } from '../../features/battle-bids/components/shared/ArenaSectionHeader';
import { ArenaBackButton } from '../../features/battle-bids/components/shared/ArenaBackButton';
import { ArenaTabs, ArenaTab } from '../../features/battle-bids/components/shared/ArenaTabs';
import { ArenaSkeleton } from '../../features/battle-bids/components/shared/ArenaSkeleton';
import { ArenaService } from '../../features/battle-bids/services';
import { DiscoveryService } from '../../features/battle-bids/services/discoveryService';
import { AuctionItem, AuctionStatus } from '../../features/battle-bids/types';
import { ArenaGoLiveModal } from '../../features/battle-bids/components/ArenaGoLiveModal';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_MY_AUCTIONS_PAGE_SIZE } from '../../features/battle-bids/services/arenaService';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { Plus, Package, AlertCircle, ChevronLeft, Loader2, ArrowDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const ArenaMyAuctions: React.FC = () => {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Pagination session state: separate cursors and lookahead buffers
  const [battleBidCursor, setBattleBidCursor] = useState<QueryDocumentSnapshot<DocumentData> | undefined>(undefined);
  const [privateCursor, setPrivateCursor] = useState<QueryDocumentSnapshot<DocumentData> | undefined>(undefined);
  const [battleBidBuffer, setBattleBidBuffer] = useState<AuctionItem[]>([]);
  const [privateBuffer, setPrivateBuffer] = useState<AuctionItem[]>([]);
  const [hasMoreBattleBids, setHasMoreBattleBids] = useState(true);
  const [hasMorePrivate, setHasMorePrivate] = useState(true);

  const [activeTab, setActiveTab] = useState<AuctionStatus | 'all'>('all');
  const [selectedGoLiveAuction, setSelectedGoLiveAuction] = useState<AuctionItem | null>(null);
  const [isGoLiveLoading, setIsGoLiveLoading] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const fetchInitialAuctions = async () => {
      if (!userProfile) return;
      setIsLoading(true);
      // Reset pagination session state when user changes
      setBattleBidCursor(undefined);
      setPrivateCursor(undefined);
      setBattleBidBuffer([]);
      setPrivateBuffer([]);
      setHasMoreBattleBids(true);
      setHasMorePrivate(true);

      try {
        const res = await ArenaService.getPaginatedUserUnifiedAuctions(userProfile.id, {
          pageSize: DEFAULT_MY_AUCTIONS_PAGE_SIZE,
          hasMoreBattleBids: true,
          hasMorePrivate: true,
        });

        if (!isCancelled) {
          setAuctions(res.items);
          setBattleBidCursor(res.nextBattleBidCursor);
          setPrivateCursor(res.nextPrivateCursor);
          setBattleBidBuffer(res.nextBattleBidBuffer);
          setPrivateBuffer(res.nextPrivateBuffer);
          setHasMore(res.hasMore);
          setHasMoreBattleBids(res.hasMoreBattleBids);
          setHasMorePrivate(res.hasMorePrivate);
        }
      } catch (error) {
        console.error('Failed to fetch user auctions:', error);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchInitialAuctions();

    const handleAuctionDeleted = (e: any) => {
      const deletedId = e.detail?.auctionId;
      if (deletedId) {
        setAuctions(prev => prev.filter(a => a.id !== deletedId));
        setBattleBidBuffer(prev => prev.filter(a => a.id !== deletedId));
        setPrivateBuffer(prev => prev.filter(a => a.id !== deletedId));
      }
    };

    window.addEventListener('arena_auction_deleted' as any, handleAuctionDeleted);
    return () => {
      isCancelled = true;
      window.removeEventListener('arena_auction_deleted' as any, handleAuctionDeleted);
    };
  }, [userProfile]);

  const handleLoadMore = async () => {
    if (!userProfile || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const res = await ArenaService.getPaginatedUserUnifiedAuctions(userProfile.id, {
        pageSize: DEFAULT_MY_AUCTIONS_PAGE_SIZE,
        battleBidCursor,
        privateCursor,
        battleBidBuffer,
        privateBuffer,
        hasMoreBattleBids,
        hasMorePrivate,
      });

      // Append new items while preventing duplicate IDs
      setAuctions(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const additions = res.items.filter(item => !existingIds.has(item.id));
        return [...prev, ...additions];
      });

      setBattleBidCursor(res.nextBattleBidCursor);
      setPrivateCursor(res.nextPrivateCursor);
      setBattleBidBuffer(res.nextBattleBidBuffer);
      setPrivateBuffer(res.nextPrivateBuffer);
      setHasMore(res.hasMore);
      setHasMoreBattleBids(res.hasMoreBattleBids);
      setHasMorePrivate(res.hasMorePrivate);
    } catch (error) {
      console.error('Failed to load more auctions:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const actionTriggeredRef = useRef(false);

  const handleAction = async (auctionId: string, action: string) => {
    if (action !== 'view') {
      actionTriggeredRef.current = true;
      setTimeout(() => {
        actionTriggeredRef.current = false;
      }, 250);
    }
    try {
      switch (action) {
        case 'goLive':
          setSelectedGoLiveAuction(auctions.find(a => a.id === auctionId) || null);
          break;
        case 'delete': {
          const targetAuction = auctions.find(a => a.id === auctionId);
          const isItemAccepted = targetAuction && (
            targetAuction.status === 'concluded' ||
            targetAuction.status === 'sold' ||
            (targetAuction.status as any) === 'accepted' ||
            (targetAuction as any).negotiationStatus === 'accepted' ||
            (targetAuction as any).negotiationStatus === 'completed' ||
            (targetAuction as any).negotiationStatus === 'concluded' ||
            (targetAuction as any).isAccepted === true ||
            (targetAuction as any).isSold === true
          );
          if (isItemAccepted) {
            alert("Action Denied: You cannot remove or delete a listed item under Private Negotiations once it is already marked as Accepted.");
            return;
          }
          if (!window.confirm("Are you sure you want to permanently delete this listing?")) return;
          await ArenaService.deleteAuction(auctionId);
          setAuctions(prev => prev.filter(a => a.id !== auctionId));
          break;
        }
        case 'togglePause':
          const auction = auctions.find(a => a.id === auctionId);
          if (auction) {
            if (auction.status === 'concluded' || auction.status === 'sold') {
              alert("Action denied: Listed items cannot be paused once an offer has been accepted by the seller.");
              return;
            }
            if (!window.confirm("Are you sure?")) return;
            if (auction.status === 'paused') {
              await ArenaService.resumeAuction(auctionId);
              setAuctions(prev => prev.map(a => a.id === auctionId ? { ...a, status: 'active' as const } : a));
            } else {
              await ArenaService.pauseAuction(auctionId);
              setAuctions(prev => prev.map(a => a.id === auctionId ? { ...a, status: 'paused' as const } : a));
            }
          }
          break;
        case 'duplicate':
          const newId = await ArenaService.duplicateAuction(auctionId);
          // In a real app, we'd refetch or add the new item
          // Action successful
          break;
        case 'view': {
          const targetToView = auctions.find(a => a.id === auctionId);
          if (targetToView?.isNegotiationOnly) {
            navigate(`/negotiations/timeline/${auctionId}`);
          } else {
            navigate(`/battle-bids/timeline/${auctionId}`);
          }
          break;
        }
        case 'share': {
          const targetToShare = auctions.find(a => a.id === auctionId);
          const sharePath = targetToShare?.isNegotiationOnly 
          ? `/negotiations/timeline/${auctionId}` 
          : `/battle-bids/timeline/${auctionId}`;
          navigator.clipboard.writeText(`${window.location.origin}${sharePath}`);
          break;
        }
      }
    } catch (error) {
      console.error('Action failed:', error);
    }
  };

  const handleConfirmGoLive = async () => {
    if (!selectedGoLiveAuction?.id) return;
    setIsGoLiveLoading(true);
    try {
      await ArenaService.goLive(selectedGoLiveAuction.id, selectedGoLiveAuction.durationDays || 3, selectedGoLiveAuction);
      DiscoveryService.invalidateCache();
      setAuctions(prev => prev.map(a => a.id === selectedGoLiveAuction.id ? { ...a, status: 'active' as const, launchType: 'now' } : a));
      setSelectedGoLiveAuction(null);
    } catch (error) {
      console.error('Failed to launch live from arsenal:', error);
      throw error;
    } finally {
      setIsGoLiveLoading(false);
    }
  };

  const filteredAuctions = auctions.filter(a => {
    if (activeTab === 'all') return true;
    return a.status === activeTab;
  });

  return (
    <ArenaLayout>
      <div className="space-y-10">
        <div className="flex items-center justify-between">
          <ArenaBackButton fallbackPath="/battle-bids" />
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <ArenaSectionHeader 
            title="My Arsenal" 
            subtitle="Manage your active deployments and tactical assets"
          />
          <button
            onClick={() => navigate('/battle-bids/create')}
            className="flex items-center gap-2 px-8 py-4 bg-rose-600 rounded-2xl text-xs font-black uppercase tracking-widest text-white hover:bg-rose-700 transition-all shadow-xl active:scale-95 w-full md:w-auto"
          >
            <Plus className="w-4 h-4" /> New Deployment
          </button>
        </div>

        <ArenaTabs>
          <ArenaTab 
            active={activeTab === 'all'} 
            onClick={() => setActiveTab('all')}
          >
            All Units
          </ArenaTab>
          <ArenaTab 
            active={activeTab === 'upcoming'} 
            onClick={() => setActiveTab('upcoming')}
          >
            Upcoming
          </ArenaTab>
          <ArenaTab 
            active={activeTab === 'active'} 
            onClick={() => setActiveTab('active')}
          >
            Active
          </ArenaTab>
          <ArenaTab 
            active={activeTab === 'paused'} 
            onClick={() => setActiveTab('paused')}
          >
            Paused
          </ArenaTab>
          <ArenaTab 
            active={activeTab === 'ended'} 
            onClick={() => setActiveTab('ended')}
          >
            Ended
          </ArenaTab>
        </ArenaTabs>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => <ArenaSkeleton key={i} height="h-[400px]" />)}
          </div>
        ) : filteredAuctions.length > 0 ? (
          <div className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <AnimatePresence mode="popLayout">
                {filteredAuctions.map((auction) => (
                  <motion.div
                    key={auction.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={() => {
                      if (actionTriggeredRef.current) return;
                      handleAction(auction.id, 'view');
                    }}
                    className="cursor-pointer"
                  >
                    <ArenaUserAuctionCard 
                      auction={auction} 
                      onAction={(action) => handleAction(auction.id, action)} 
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {hasMore && (
              <div className="flex justify-center pt-4 pb-8">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-3 px-8 py-4 bg-stone-900 border border-stone-800 rounded-2xl text-xs font-black uppercase tracking-widest text-amber-500 hover:text-white hover:border-amber-500/50 hover:bg-stone-800/80 transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                      Loading Next Deployments...
                    </>
                  ) : (
                    <>
                      <ArrowDown className="w-4 h-4 text-amber-500" />
                      Load More Deployments
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-stone-900 rounded-[2rem] flex items-center justify-center mb-6">
              <Package className="w-10 h-10 text-stone-700" />
            </div>
            <h3 className="text-xl font-black uppercase italic text-white tracking-tight">Arsenal Empty</h3>
            <p className="text-stone-400 text-sm font-medium mt-2 max-w-sm mx-auto uppercase tracking-widest leading-relaxed">
              No tactical assets matching this filter were found in your deployment records.
            </p>
            <button
              onClick={() => navigate('/battle-bids/create')}
              className="mt-8 px-8 py-3 border border-stone-800 rounded-xl text-xs font-black uppercase text-amber-500 hover:text-white hover:border-amber-500/50 transition-all"
            >
              Start First Mission
            </button>
          </div>
        )}
      </div>

      {/* Go Live Confirmation Modal */}
      <ArenaGoLiveModal
        isOpen={selectedGoLiveAuction !== null}
        onClose={() => setSelectedGoLiveAuction(null)}
        onConfirm={handleConfirmGoLive}
        item={selectedGoLiveAuction}
        loading={isGoLiveLoading}
      />
    </ArenaLayout>
  );
};
