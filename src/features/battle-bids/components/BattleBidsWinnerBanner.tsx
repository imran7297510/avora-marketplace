import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { AuctionItem, SecondChanceOffer } from '../types';
import { Order } from '../../../types';
import { formatPrice } from '../../../lib/currencies';
import { SecondChanceService } from '../services/secondChanceService';
import { 
  Trophy, 
  Clock, 
  CreditCard, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Package, 
  Truck,
  ShieldCheck,
  Sparkles,
  Zap
} from 'lucide-react';

interface BattleBidsWinnerBannerProps {
  auction: AuctionItem;
  user: any;
}

export const BattleBidsWinnerBanner: React.FC<BattleBidsWinnerBannerProps> = ({ auction, user }) => {
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [secondChanceOffer, setSecondChanceOffer] = useState<SecondChanceOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const [isAcceptingOffer, setIsAcceptingOffer] = useState(false);

  const orderId = `BB-${auction.id}`;
  const isWinner = user && (user.uid === auction.highestBidderId || (order && user.uid === order.buyerId));
  const isSeller = user && (user.uid === auction.sellerId || (order && user.uid === order.sellerId));
  const isRunnerUp = user && secondChanceOffer && user.uid === secondChanceOffer.buyerId;
  const currencySymbol = auction.currencySymbol || auction.currency || 'USD';
  const finalPrice = auction.currentBid || auction.startingPrice;

  // Real-time synchronization for the Battle Bids order
  useEffect(() => {
    if (!auction.id) return;
    const orderRef = doc(db, 'orders', orderId);
    
    const unsubscribe = onSnapshot(orderRef, (snapshot) => {
      if (snapshot.exists()) {
        const orderData = { id: snapshot.id, ...snapshot.data() } as Order;
        setOrder(orderData);

        // Check if deadline passed and state is still AWAITING_PAYMENT
        if (orderData.status === 'AWAITING_PAYMENT' && orderData.paymentDeadline) {
          const deadlineMs = orderData.paymentDeadline.toDate 
            ? orderData.paymentDeadline.toDate().getTime() 
            : new Date(orderData.paymentDeadline).getTime();

          if (Date.now() >= deadlineMs) {
            SecondChanceService.expireOrderAndTriggerSecondChance(orderId).catch((e) => {
              console.warn("Auto expiration check:", e);
            });
          }
        }
      } else {
        setOrder(null);
      }
      setLoading(false);
    }, (err) => {
      console.warn("Could not load settlement order:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auction.id, orderId]);

  // Real-time synchronization for Second Chance Offers
  useEffect(() => {
    if (!auction.id) return;
    const unsubscribe = SecondChanceService.subscribeToOfferByAuction(auction.id, (offer) => {
      setSecondChanceOffer(offer);
    });
    return () => unsubscribe();
  }, [auction.id]);

  // Payment Deadline Timer
  useEffect(() => {
    if (!order?.paymentDeadline) {
      setTimeRemaining('');
      return;
    }

    const checkInterval = () => {
      const deadlineDate = order.paymentDeadline?.toDate 
        ? order.paymentDeadline.toDate() 
        : new Date(order.paymentDeadline);
      
      const now = new Date().getTime();
      const distance = deadlineDate.getTime() - now;

      if (distance <= 0) {
        setIsExpired(true);
        setTimeRemaining('Expired');
        if (order.status === 'AWAITING_PAYMENT') {
          SecondChanceService.expireOrderAndTriggerSecondChance(orderId).catch(console.warn);
        }
      } else {
        setIsExpired(false);
        const hours = Math.floor(distance / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
      }
    };

    checkInterval();
    const interval = setInterval(checkInterval, 1000);
    return () => clearInterval(interval);
  }, [order?.paymentDeadline, order?.status, orderId]);

  const handleAcceptSecondChance = async () => {
    if (!secondChanceOffer || !user) return;
    setIsAcceptingOffer(true);
    try {
      const newOrderId = await SecondChanceService.acceptSecondChanceOffer(secondChanceOffer.id, user.uid);
      navigate(`/orders/${newOrderId}`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to accept second chance offer.');
    } finally {
      setIsAcceptingOffer(false);
    }
  };

  // If user is the verified winning bidder
  if (isWinner) {
    const isAwaitingPayment = !order || order.status === 'AWAITING_PAYMENT';
    const isReview = order?.status === 'PAYMENT_REVIEW';
    const isPaidOrShipped = order && ['PAID', 'SHIPPED', 'DEAL_DONE'].includes(order.status);

    return (
      <div className="bg-gradient-to-br from-amber-500/20 via-stone-900 to-amber-950/40 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-500">
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
              <Trophy className="w-7 h-7 stroke-[2.5] animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-amber-400 flex items-center gap-2">
                  <span>Victory! You Won This Auction</span>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </h3>
              </div>
              <p className="text-xs text-stone-300 font-bold uppercase tracking-wider mt-0.5">
                Winning Strike: <span className="text-emerald-400 font-mono text-sm">{formatPrice(finalPrice, currencySymbol)}</span>
              </p>
            </div>
          </div>

          {/* Status / Deadline Pill */}
          <div className="flex flex-col items-start sm:items-end gap-1">
            <span className={`px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 ${
              isAwaitingPayment ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
              isReview ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
              'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            }`}>
              {order ? order.status.replace(/_/g, ' ') : 'AWAITING PAYMENT'}
            </span>

            {isAwaitingPayment && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-300">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Payment Window:</span>
                <span className={`font-mono font-black ${isExpired ? 'text-rose-400' : 'text-amber-400'}`}>
                  {timeRemaining || '48 Hours'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Message & Action CTA */}
        <div className="bg-stone-950/80 border border-stone-850 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-stone-300 space-y-1 text-center sm:text-left">
            {isAwaitingPayment && !isExpired && (
              <>
                <p className="font-black text-white uppercase tracking-wider">Complete Your Settlement</p>
                <p className="text-stone-400">Please provide your delivery address and upload your payment transfer receipt to finalize.</p>
              </>
            )}
            {isAwaitingPayment && isExpired && (
              <>
                <p className="font-black text-rose-400 uppercase tracking-wider">Payment Window Expired</p>
                <p className="text-stone-400">The 48-hour settlement window has lapsed.</p>
              </>
            )}
            {isReview && (
              <>
                <p className="font-black text-blue-400 uppercase tracking-wider">Payment Proof Under Review</p>
                <p className="text-stone-400">The seller is verifying your deposit receipt. Courier details will update once approved.</p>
              </>
            )}
            {isPaidOrShipped && (
              <>
                <p className="font-black text-emerald-400 uppercase tracking-wider">Payment Confirmed</p>
                <p className="text-stone-400">Your order is verified and in fulfillment.</p>
              </>
            )}
          </div>

          <button
            onClick={() => navigate(`/orders/${orderId}`)}
            className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 active:scale-95 text-stone-950 font-black text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            {isAwaitingPayment && !isExpired ? (
              <>
                <CreditCard className="w-4 h-4" />
                <span>Proceed to Checkout & Pay</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>View Order & Tracking</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // If user is eligible Runner-Up with a Pending Second-Chance Offer
  if (isRunnerUp && secondChanceOffer && secondChanceOffer.status === 'PENDING') {
    const offerPrice = secondChanceOffer.amount;
    return (
      <div className="bg-gradient-to-br from-indigo-500/20 via-stone-900 to-purple-950/40 border-2 border-indigo-500/50 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-500">
        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/30">
              <Zap className="w-7 h-7 stroke-[2.5] animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Exclusive Runner-Up Opportunity
                </span>
                <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <span>Second-Chance Offer Extended!</span>
                  <Sparkles className="w-4 h-4 text-indigo-300" />
                </h3>
              </div>
              <p className="text-xs text-stone-300 font-bold uppercase tracking-wider mt-1">
                Your Locked Bid: <span className="text-emerald-400 font-mono text-sm">{formatPrice(offerPrice, currencySymbol)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>24-Hour Exclusive Window</span>
          </div>
        </div>

        <div className="bg-stone-950/80 border border-stone-850 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-stone-300 space-y-1 text-center sm:text-left">
            <p className="font-black text-white uppercase tracking-wider">Original Winner Payment Expired</p>
            <p className="text-stone-400">
              As the rank 2 combatant, this item has been authoritatively reserved for you at your highest strike.
            </p>
          </div>

          <button
            onClick={handleAcceptSecondChance}
            disabled={isAcceptingOffer}
            className="w-full sm:w-auto bg-indigo-500 hover:bg-indigo-400 active:scale-95 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            {isAcceptingOffer ? (
              <span>Securing Order...</span>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>Claim & Checkout ({formatPrice(offerPrice, currencySymbol)})</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // If user is the seller
  if (isSeller) {
    return (
      <div className="bg-stone-900 border border-amber-500/30 rounded-3xl p-6 sm:p-7 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black uppercase text-white tracking-wider">
                  Auction Sold to @{auction.highestBidderName || 'Winning Bidder'}
                </h4>
                {order?.status === 'PAYMENT_EXPIRED' && (
                  <span className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                    Payment Expired
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-400 font-bold uppercase mt-0.5">
                Sold Price: <span className="text-emerald-400 font-mono">{formatPrice(finalPrice, currencySymbol)}</span> • Order ID: <span className="font-mono text-stone-300">{orderId}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {secondChanceOffer && secondChanceOffer.status === 'PENDING' && (
              <span className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 px-3 py-2 rounded-xl">
                ⚡ Runner-Up Offer Active (@{secondChanceOffer.buyerName})
              </span>
            )}
            {secondChanceOffer && secondChanceOffer.status === 'ACCEPTED' && (
              <button
                onClick={() => navigate(`/orders/${secondChanceOffer.newOrderId || `BB-${auction.id}-SC`}`)}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 shadow-lg shadow-indigo-500/20"
              >
                <span>Runner-Up Order (@{secondChanceOffer.buyerName})</span>
                <ArrowRight className="w-4 h-4 text-indigo-200" />
              </button>
            )}
            <button
              onClick={() => navigate(`/orders/${orderId}`)}
              className="w-full sm:w-auto bg-stone-800 hover:bg-stone-700 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 border border-stone-700"
            >
              <span>{order?.status === 'PAYMENT_EXPIRED' ? 'Primary Order (Expired)' : 'Manage Settlement'}</span>
              <ArrowRight className="w-4 h-4 text-amber-400" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // General public view
  return (
    <div className="bg-stone-900/60 border border-stone-800 rounded-3xl p-6 text-center space-y-2">
      <Trophy className="w-8 h-8 text-amber-500 mx-auto" />
      <h4 className="text-sm font-black text-white uppercase tracking-wider">Combat Concluded & Sold</h4>
      <p className="text-xs text-stone-400">
        Acquired by <span className="text-amber-400 font-bold">@{auction.highestBidderName || 'Warrior'}</span> for{' '}
        <span className="text-emerald-400 font-mono font-bold">{formatPrice(finalPrice, currencySymbol)}</span>
      </p>
    </div>
  );
};
export default BattleBidsWinnerBanner;
