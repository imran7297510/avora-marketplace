import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  serverTimestamp, 
  runTransaction 
} from 'firebase/firestore';
import { db, sendNotification } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Order } from '../../types';
import { resizeImageFile } from '../../utils/imageHelpers';
import { SecondChanceService } from '../../features/battle-bids/services/secondChanceService';
import { 
  Trophy, 
  Clock, 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  ArrowLeft, 
  Upload, 
  FileText, 
  Building, 
  CreditCard, 
  Truck, 
  User, 
  MapPin, 
  Phone, 
  Hash, 
  Eye, 
  Check, 
  X, 
  Sparkles, 
  RefreshCw, 
  Lock,
  Package,
  BadgeCheck,
  ChevronRight,
  Zap
} from 'lucide-react';

export const BattleBidsCheckout: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Winner Form States
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'EASYPAISA' | 'JAZZCASH' | 'DIRECT_DEPOSIT'>('BANK_TRANSFER');
  const [transactionId, setTransactionId] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentProofDataUrl, setPaymentProofDataUrl] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Seller Action States
  const [sellerCourier, setSellerCourier] = useState('');
  const [sellerTracking, setSellerTracking] = useState('');
  const [sellerShippingNotes, setSellerShippingNotes] = useState('');
  const [sellerActionLoading, setSellerActionLoading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Time remaining state
  const [timeRemainingText, setTimeRemainingText] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  // Normalized order ID (prefers existing loaded order ID, or raw order ID, or BB- prefixed fallback)
  const effectiveOrderId = order?.id || orderId || '';

  // Real-time synchronization for the Order document
  useEffect(() => {
    if (!orderId) return;
    setLoading(true);

    const populateOrder = (data: Order) => {
      setOrder(data);
      setError(null);
      if (data.shippingAddress) {
        setFullName(prev => prev || data.shippingAddress?.fullName || '');
        setPhone(prev => prev || data.shippingAddress?.phone || '');
        setAddress(prev => prev || data.shippingAddress?.address || '');
        setCity(prev => prev || data.shippingAddress?.city || '');
        setProvince(prev => prev || data.shippingAddress?.state || '');
        setPostalCode(prev => prev || data.shippingAddress?.postalCode || '');
      } else if (data.buyerName) {
        setFullName(prev => prev || data.buyerName || '');
        setPhone(prev => prev || data.buyerContact || '');
        setAddress(prev => prev || data.buyerAddress || '');
      }
      if (data.transactionId) setTransactionId(prev => prev || data.transactionId || '');
      if (data.paymentNotes) setPaymentNotes(prev => prev || data.paymentNotes || '');
      if (data.courierName) setSellerCourier(prev => prev || data.courierName || '');
      if (data.trackingNumber) setSellerTracking(prev => prev || data.trackingNumber || '');
      if (data.shippingNotes) setSellerShippingNotes(prev => prev || data.shippingNotes || '');
    };

    let fallbackUnsubscribe: (() => void) | null = null;
    const directRef = doc(db, 'orders', orderId);

    const primaryUnsubscribe = onSnapshot(directRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() } as Order;
        populateOrder(data);
        setLoading(false);
      } else if (!orderId.startsWith('BB-')) {
        // Fallback: Check if order document exists with BB- prefix (for raw Battle Bids auction IDs)
        const bbRef = doc(db, 'orders', `BB-${orderId}`);
        if (fallbackUnsubscribe) fallbackUnsubscribe();
        fallbackUnsubscribe = onSnapshot(bbRef, (bbSnap) => {
          if (bbSnap.exists()) {
            const data = { id: bbSnap.id, ...bbSnap.data() } as Order;
            populateOrder(data);
          } else {
            setOrder(null);
            setError('Order not found or has not been initialized yet.');
          }
          setLoading(false);
        }, (err) => {
          console.error("Failed to load fallback order:", err);
          setError("Unable to load order details. Please check your network or sign-in credentials.");
          setLoading(false);
        });
      } else {
        setOrder(null);
        setError('Order not found or has not been initialized yet.');
        setLoading(false);
      }
    }, (err) => {
      console.error("Failed to load order:", err);
      setError("Unable to load order details. Please check your network or sign-in credentials.");
      setLoading(false);
    });

    return () => {
      primaryUnsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
  }, [orderId]);

  // Handle Payment Deadline Countdown
  useEffect(() => {
    if (!order?.paymentDeadline) {
      setTimeRemainingText('');
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
        setTimeRemainingText('Expired');
        if (order.status === 'AWAITING_PAYMENT') {
          SecondChanceService.expireOrderAndTriggerSecondChance(order.id || effectiveOrderId).catch(console.warn);
        }
      } else {
        setIsExpired(false);
        const hours = Math.floor(distance / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeRemainingText(`${hours}h ${minutes}m ${seconds}s`);
      }
    };

    checkInterval();
    const interval = setInterval(checkInterval, 1000);
    return () => clearInterval(interval);
  }, [order?.paymentDeadline, order?.status, order?.id, effectiveOrderId]);

  // Handle Image Upload for Payment Proof
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setFormError('Image file is too large. Please upload an image under 10MB.');
      return;
    }

    setProofLoading(true);
    setFormError(null);
    try {
      const resized = await resizeImageFile(file, 1200, 0.85);
      setPaymentProofDataUrl(resized);
    } catch (err: any) {
      console.error(err);
      setFormError('Failed to process image. Please try a different screenshot or photo.');
    } finally {
      setProofLoading(false);
    }
  };

  // Winner: Submit Payment & Shipping Info
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !order) return;

    if (user.uid !== order.buyerId) {
      setFormError('Only the verified winning buyer can submit payment for this order.');
      return;
    }

    if (isExpired) {
      setFormError('Payment deadline has expired. Payments can no longer be processed.');
      return;
    }

    if (!fullName.trim() || !phone.trim() || !address.trim() || !city.trim()) {
      setFormError('Please fill in all required shipping address fields (Name, Phone, Address, City).');
      return;
    }

    if (!transactionId.trim()) {
      setFormError('Please provide the Transaction ID or Reference Number from your bank or wallet transfer.');
      return;
    }

    if (!paymentProofDataUrl && !order.paymentProofUrl && !order.paymentProof) {
      setFormError('Please upload a screenshot or photo of your payment deposit receipt.');
      return;
    }

    setSubmitLoading(true);
    setFormError(null);

    try {
      const orderRef = doc(db, 'orders', order.id || effectiveOrderId);
      
      const updatedShipping = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        state: province.trim() || 'N/A',
        postalCode: postalCode.trim() || 'N/A',
      };

      const payload: any = {
        status: 'PAYMENT_REVIEW',
        shippingAddress: updatedShipping,
        buyerName: fullName.trim(),
        buyerContact: phone.trim(),
        buyerAddress: `${address.trim()}, ${city.trim()}${province.trim() ? `, ${province.trim()}` : ''}${postalCode.trim() ? ` - ${postalCode.trim()}` : ''}`,
        paymentMethod: paymentMethod,
        transactionId: transactionId.trim(),
        paymentNotes: paymentNotes.trim(),
        paymentSubmittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (paymentProofDataUrl) {
        payload.paymentProofUrl = paymentProofDataUrl;
        payload.paymentProof = paymentProofDataUrl;
      }

      await updateDoc(orderRef, payload);

      // Dispatch real-time notifications
      // 1. Notify Seller
      await sendNotification(
        order.sellerId,
        'Battle Bids Payment Submitted 💰',
        `Buyer ${fullName.trim()} has submitted payment proof for auction "${order.itemTitle || order.listingTitle}". Please review and confirm.`,
        'BATTLE_BIDS_PAYMENT_SUBMITTED',
        order.id
      );

      // 2. Notify Buyer
      await sendNotification(
        order.buyerId,
        'Payment Proof Under Review ⏳',
        `Your payment proof for "${order.itemTitle || order.listingTitle}" was submitted. The seller is verifying the transaction.`,
        'BATTLE_BIDS_PAYMENT_REVIEW',
        order.id
      );

      setFormError(null);
    } catch (err: any) {
      console.error('Failed to submit payment proof:', err);
      setFormError(err.message || 'Failed to submit payment. Please try again.');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Seller: Approve Payment
  const handleSellerApprovePayment = async () => {
    if (!user || !order) return;
    if (user.uid !== order.sellerId) return;

    if (!window.confirm("Confirm that you have received the full payment in your bank/wallet account?")) return;

    setSellerActionLoading(true);
    try {
      const orderRef = doc(db, 'orders', order.id || effectiveOrderId);
      await updateDoc(orderRef, {
        status: 'PAID',
        paymentVerifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await sendNotification(
        order.buyerId,
        'Payment Confirmed & Verified! ✅',
        `The seller has verified your payment for "${order.itemTitle || order.listingTitle}". Your item is now preparing for shipment.`,
        'BATTLE_BIDS_PAYMENT_VERIFIED',
        order.id
      );
    } catch (err: any) {
      alert(err.message || 'Failed to approve payment.');
    } finally {
      setSellerActionLoading(false);
    }
  };

  // Seller: Dispatch Shipment
  const handleSellerDispatchShipment = async () => {
    if (!user || !order) return;
    if (user.uid !== order.sellerId) return;

    if (!sellerCourier.trim()) {
      alert('Please enter the Courier Service Name (e.g. TCS, Leopard, DHL).');
      return;
    }

    setSellerActionLoading(true);
    try {
      const orderRef = doc(db, 'orders', order.id || effectiveOrderId);
      await updateDoc(orderRef, {
        status: 'SHIPPED',
        courierName: sellerCourier.trim(),
        trackingNumber: sellerTracking.trim(),
        shippingNotes: sellerShippingNotes.trim(),
        shippedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await sendNotification(
        order.buyerId,
        'Item Dispatched! 🚚',
        `Your Battle Bids order "${order.itemTitle || order.listingTitle}" has been shipped via ${sellerCourier.trim()}${sellerTracking.trim() ? ` with tracking number ${sellerTracking.trim()}` : ''}.`,
        'BATTLE_BIDS_SHIPPED',
        order.id
      );
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch shipment.');
    } finally {
      setSellerActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-955 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 p-8 rounded-3xl max-w-md w-full text-center space-y-4 shadow-2xl">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
          <h2 className="text-sm font-black text-white uppercase tracking-widest">Loading Battle Bids Order</h2>
          <p className="text-xs text-stone-400">Synchronizing authoritative settlement & payment data...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-stone-955 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-rose-500/20 p-8 rounded-3xl max-w-md w-full text-center space-y-4 shadow-2xl">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-base font-black text-white uppercase tracking-wider">Order Unavailable</h2>
          <p className="text-xs text-stone-400 leading-relaxed">{error || "Could not find matching auction order."}</p>
          <div className="pt-2">
            <Link 
              to="/battle-bids"
              className="inline-flex items-center gap-2 bg-stone-800 hover:bg-stone-700 text-white text-xs font-black uppercase tracking-wider px-5 py-3 rounded-xl transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Battle Bids</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isBuyer = user?.uid === order.buyerId;
  const isSeller = user?.uid === order.sellerId;
  const isAdmin = user?.email?.toLowerCase().includes('admin'); // Standard admin check fallback

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-955 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-amber-500/20 p-8 rounded-3xl max-w-md w-full text-center space-y-4 shadow-2xl">
          <Lock className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="text-base font-black text-white uppercase tracking-wider">Authentication Required</h2>
          <p className="text-xs text-stone-400 leading-relaxed">
            Please sign in to access your Battle Bids settlement checkout.
          </p>
          <div className="pt-2">
            <Link 
              to="/login"
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black uppercase tracking-wider px-6 py-3 rounded-xl transition-all shadow-lg shadow-amber-500/20"
            >
              <span>Sign In to Continue</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isBuyer && !isSeller && !isAdmin) {
    return (
      <div className="min-h-screen bg-stone-955 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 p-8 rounded-3xl max-w-md w-full text-center space-y-4 shadow-2xl">
          <Shield className="w-10 h-10 text-stone-600 mx-auto" />
          <h2 className="text-base font-black text-white uppercase tracking-wider">Access Restricted</h2>
          <p className="text-xs text-stone-400 leading-relaxed">
            This checkout session is restricted exclusively to the verified auction winner and the authorized seller.
          </p>
          <div className="pt-2">
            <Link 
              to="/battle-bids"
              className="inline-flex items-center gap-2 bg-stone-800 hover:bg-stone-700 text-white text-xs font-black uppercase tracking-wider px-5 py-3 rounded-xl transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Battle Bids Arena</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currencySymbol = order.currencySymbol || order.currency || 'USD';
  const formattedAmount = `${currencySymbol} ${Number(order.amount || order.totalAmount || 0).toLocaleString()}`;
  const itemImage = order.itemImage || order.listingImage || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800';
  const itemTitle = order.itemTitle || order.listingTitle || 'Battle Bids Combat Asset';

  return (
    <div className="min-h-screen bg-stone-955 text-stone-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link 
            to={`/battle-bids?id=${order.auctionId || order.listingId}`}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-stone-400 hover:text-amber-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Arena Display</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              Battle Bids Settlement
            </span>
          </div>
        </div>

        {/* Hero Card: Winner or Seller Header */}
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
                <Trophy className="w-7 h-7 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white">
                    {isBuyer ? 'Combat Victory Checkout' : isSeller ? 'Seller Settlement Operations' : 'Battle Bids Order Summary'}
                  </h1>
                </div>
                <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mt-1">
                  Order ID: <span className="font-mono text-amber-400">{order.id}</span> • Auction Reference: <span className="font-mono text-stone-300">{order.auctionId}</span>
                </p>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex flex-col items-start sm:items-end gap-1.5">
              <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border flex items-center gap-2 ${
                order.status === 'AWAITING_PAYMENT' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse' :
                order.status === 'PAYMENT_REVIEW' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                order.status === 'PAID' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                order.status === 'SHIPPED' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' :
                order.status === 'DEAL_DONE' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                order.status === 'PAYMENT_EXPIRED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                'bg-stone-800 text-stone-300 border-stone-700'
              }`}>
                <span className="w-2 h-2 rounded-full bg-current" />
                {order.status.replace(/_/g, ' ')}
              </span>

              {order.status === 'AWAITING_PAYMENT' && (
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-stone-400">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Deadline:</span>
                  <span className={`font-mono font-black ${isExpired ? 'text-rose-400' : 'text-amber-400'}`}>
                    {timeRemainingText || '48 Hours'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Stepper Progress Indicator */}
          <div className="mt-8 pt-6 border-t border-stone-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: '1. Auction Won', active: true, done: true },
              { label: '2. Payment Proof', active: order.status === 'AWAITING_PAYMENT', done: ['PAYMENT_REVIEW', 'PAID', 'SHIPPED', 'DEAL_DONE'].includes(order.status) },
              { label: '3. Verification', active: order.status === 'PAYMENT_REVIEW', done: ['PAID', 'SHIPPED', 'DEAL_DONE'].includes(order.status) },
              { label: '4. Dispatch & Delivery', active: ['PAID', 'SHIPPED'].includes(order.status), done: order.status === 'DEAL_DONE' },
            ].map((step, idx) => (
              <div key={idx} className={`p-3 rounded-2xl border text-center transition-all ${
                step.done ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                step.active ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-black ring-1 ring-amber-500/30' :
                'bg-stone-950/40 border-stone-850 text-stone-500'
              }`}>
                <div className="text-[10px] font-black uppercase tracking-wider">{step.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Item & Price Summary Banner */}
        <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border border-stone-800 bg-stone-950 shrink-0 shadow-inner">
              <img src={itemImage} alt={itemTitle} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-white text-base sm:text-lg leading-tight truncate">{itemTitle}</h2>
              <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mt-1">
                Seller: <span className="text-stone-200">{order.sellerName || 'Verified Combatant'}</span>
              </p>
              <div className="text-[11px] text-stone-500 mt-0.5">
                Buyer: <span className="text-amber-400 font-bold">{order.buyerName || 'Winning Bidder'}</span>
              </div>
            </div>
          </div>

          <div className="w-full sm:w-auto bg-stone-950 border border-stone-850 p-4 rounded-2xl text-center sm:text-right shrink-0">
            <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest block">Authoritative Winning Strike</span>
            <span className="text-xl sm:text-2xl font-mono font-black text-emerald-400 mt-0.5 block">{formattedAmount}</span>
          </div>
        </div>

        {/* Expired Warning Banner */}
        {(isExpired || order.status === 'PAYMENT_EXPIRED') && ['AWAITING_PAYMENT', 'PAYMENT_EXPIRED'].includes(order.status) && (
          <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-3xl text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-white uppercase tracking-wider">Settlement Window Expired</h3>
            <p className="text-xs text-stone-300 max-w-md mx-auto leading-relaxed">
              The 48-hour payment settlement window for this Battle Bids auction has lapsed. This order is now an immutable historical record and can no longer receive payment submissions.
            </p>
            {order.isSecondChance && (
              <span className="inline-block text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full uppercase">
                Second-Chance Order Record
              </span>
            )}
          </div>
        )}

        {/* WINNER EXPERIENCE: AWAITING PAYMENT (Payment & Shipping Form) */}
        {isBuyer && order.status === 'AWAITING_PAYMENT' && !isExpired && (
          <form onSubmit={handleSubmitPayment} className="space-y-8">
            
            {/* Step A: Shipping & Contact Information */}
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
              <div className="flex items-center gap-3 pb-4 border-b border-stone-800">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">1. Shipping & Delivery Address</h3>
                  <p className="text-xs text-stone-400">Where should the seller dispatch your combat trophy?</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                    Recipient Full Name <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Tariq Mehmood"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                    Mobile / WhatsApp Contact <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="tel"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="e.g. +92 300 1234567"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                    Street Address & House / Flat No. <span className="text-amber-500">*</span>
                  </label>
                  <textarea 
                    required
                    rows={2}
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="e.g. House #14, Street 5, Phase 2, DHA"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs font-bold text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                    City <span className="text-amber-500">*</span>
                  </label>
                  <input 
                    type="text"
                    required
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="e.g. Lahore, Karachi, Islamabad"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-4 text-xs font-bold text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                    Province / State
                  </label>
                  <input 
                    type="text"
                    value={province}
                    onChange={e => setProvince(e.target.value)}
                    placeholder="e.g. Punjab, Sindh"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-4 text-xs font-bold text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Step B: Payment Method & Instructions */}
            <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
              <div className="flex items-center gap-3 pb-4 border-b border-stone-800">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">2. Payment Method & Deposit Receipt</h3>
                  <p className="text-xs text-stone-400">Select payment channel and attach the deposit receipt photo</p>
                </div>
              </div>

              {/* Payment Channel Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'BANK_TRANSFER', label: 'Bank Transfer', icon: Building },
                  { id: 'EASYPAISA', label: 'Easypaisa', icon: CreditCard },
                  { id: 'JAZZCASH', label: 'JazzCash', icon: CreditCard },
                  { id: 'DIRECT_DEPOSIT', label: 'Direct Deposit', icon: Package },
                ].map(channel => {
                  const Icon = channel.icon;
                  const isSelected = paymentMethod === channel.id;
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => setPaymentMethod(channel.id as any)}
                      className={`p-4 rounded-2xl border text-center transition-all flex flex-col items-center gap-2 ${
                        isSelected 
                          ? 'bg-amber-500 text-stone-950 border-amber-400 shadow-lg shadow-amber-500/20 font-black' 
                          : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:text-white hover:border-stone-700'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-bold uppercase tracking-wider">{channel.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Bank Account Guidance Box */}
              <div className="bg-stone-950 border border-stone-850 p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-amber-400">
                  <span>Authorized Settlement Instructions</span>
                  <span>Amount Due: {formattedAmount}</span>
                </div>
                <div className="text-xs text-stone-300 space-y-1 leading-relaxed">
                  <p>• Transfer <strong className="text-white font-mono">{formattedAmount}</strong> to the seller or marketplace verified escrow account.</p>
                  <p>• Save or take a screenshot of your successful transaction receipt.</p>
                  <p>• Enter the Transaction ID / Ref No. and attach the photo below to submit for instant verification.</p>
                </div>
              </div>

              {/* Transaction ID & Receipt Upload */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                    Transaction ID / Reference Number <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <Hash className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text"
                      required
                      value={transactionId}
                      onChange={e => setTransactionId(e.target.value)}
                      placeholder="e.g. TXN-98402941829 or Easypaisa TID"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 pl-10 pr-4 text-xs font-mono font-bold text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                    Upload Payment Proof Receipt Photo <span className="text-amber-500">*</span>
                  </label>
                  
                  {paymentProofDataUrl ? (
                    <div className="relative rounded-2xl overflow-hidden border border-amber-500/40 bg-stone-950 p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={paymentProofDataUrl} alt="Receipt Preview" className="w-14 h-14 rounded-xl object-cover border border-stone-800" />
                        <div>
                          <p className="text-xs font-black text-white uppercase">Receipt Attached</p>
                          <p className="text-[10px] text-emerald-400 font-bold">Image ready for submission</p>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setPaymentProofDataUrl(null)}
                        className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl text-xs font-bold"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-stone-800 hover:border-amber-500/50 bg-stone-950 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center">
                      <Upload className="w-6 h-6 text-amber-500" />
                      <span className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                        {proofLoading ? 'Processing Receipt Image...' : 'Click to Upload Payment Proof'}
                      </span>
                      <span className="text-[10px] text-stone-500">Supports PNG, JPG, WebP screenshot receipts</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageChange}
                        disabled={proofLoading}
                        className="hidden" 
                      />
                    </label>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                    Additional Notes / Instructions (Optional)
                  </label>
                  <input 
                    type="text"
                    value={paymentNotes}
                    onChange={e => setPaymentNotes(e.target.value)}
                    placeholder="e.g. Sent via Meezan Bank mobile app"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-4 text-xs font-bold text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Error Display */}
            {formError && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-xs text-rose-400 font-bold">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Submit Action CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="text-xs text-stone-400 text-center sm:text-left">
                🔒 Verified Battle Bids Immutable Settlement Protocol
              </div>
              <button 
                type="submit"
                disabled={submitLoading || proofLoading}
                className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 active:scale-95 text-stone-950 font-black text-xs uppercase tracking-widest px-8 py-4 rounded-2xl transition-all shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Submitting Payment...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                    <span>Submit Payment Proof & Confirm Order</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* WINNER: PAYMENT SUBMITTED / UNDER REVIEW */}
        {isBuyer && order.status === 'PAYMENT_REVIEW' && (
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="p-5 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-start gap-4">
              <Clock className="w-6 h-6 text-blue-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Payment Proof Submitted — Under Review</h3>
                <p className="text-xs text-stone-300 leading-relaxed">
                  Your payment receipt and delivery details have been submitted. The seller has been alerted to verify your deposit. Once verified, courier dispatch details will appear here.
                </p>
              </div>
            </div>

            {/* Submitted Proof Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-stone-950 border border-stone-850 p-4 rounded-2xl space-y-2">
                <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Transaction Reference</span>
                <p className="text-sm font-mono font-black text-amber-400">{order.transactionId || 'N/A'}</p>
                <p className="text-xs text-stone-400 font-bold">Method: {order.paymentMethod || 'Bank Transfer'}</p>
              </div>

              <div className="bg-stone-950 border border-stone-850 p-4 rounded-2xl space-y-2">
                <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Delivery Address</span>
                <p className="text-xs font-bold text-white">{order.buyerName}</p>
                <p className="text-xs text-stone-400">{order.buyerAddress}</p>
                <p className="text-xs text-stone-500">Contact: {order.buyerContact}</p>
              </div>
            </div>

            {order.paymentProofUrl && (
              <div className="space-y-2">
                <span className="text-xs font-black text-stone-400 uppercase tracking-wider">Attached Payment Receipt:</span>
                <div 
                  onClick={() => setLightboxImage(order.paymentProofUrl || null)}
                  className="w-32 h-32 rounded-2xl overflow-hidden border border-stone-800 cursor-pointer hover:opacity-90 transition-opacity bg-stone-950"
                >
                  <img src={order.paymentProofUrl} alt="Payment Receipt" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* WINNER: PAID / SHIPPED / COMPLETED */}
        {isBuyer && ['PAID', 'SHIPPED', 'DEAL_DONE'].includes(order.status) && (
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  {order.status === 'PAID' ? 'Payment Verified & Confirmed! 🎉' : 
                   order.status === 'SHIPPED' ? 'Combat Item Dispatched! 🚚' : 'Order Completed & Delivered! 🏆'}
                </h3>
                <p className="text-xs text-stone-300 leading-relaxed">
                  {order.status === 'PAID' && 'Your payment has been cleared by the seller. They are now packaging and preparing your item for dispatch.'}
                  {order.status === 'SHIPPED' && 'Your package is on its way! Track your delivery using the courier details below.'}
                  {order.status === 'DEAL_DONE' && 'This Battle Bids transaction is 100% completed and settled.'}
                </p>
              </div>
            </div>

            {/* Courier Dispatch Box */}
            {order.courierName && (
              <div className="bg-stone-950 border border-stone-850 p-5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-400">
                  <Truck className="w-4 h-4" />
                  <span>Courier & Tracking Information</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-stone-500 font-bold">Courier Service:</span>
                    <p className="text-white font-black text-sm">{order.courierName}</p>
                  </div>
                  {order.trackingNumber && (
                    <div>
                      <span className="text-stone-500 font-bold">Tracking Number:</span>
                      <p className="font-mono font-black text-amber-400 text-sm">{order.trackingNumber}</p>
                    </div>
                  )}
                </div>
                {order.shippingNotes && (
                  <p className="text-xs text-stone-400 italic">"{order.shippingNotes}"</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* SELLER EXPERIENCE: SELLER DASHBOARD VIEW & ACTIONS */}
        {isSeller && (
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-stone-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Seller Order Fulfillment Desk</h3>
                  <p className="text-xs text-stone-400">Manage buyer settlement, verify receipts & dispatch courier</p>
                </div>
              </div>

              <Link 
                to="/sellr-dashboard?tab=bookings"
                className="text-xs font-black text-amber-400 hover:underline uppercase tracking-wider flex items-center gap-1"
              >
                <span>Seller Dashboard</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Buyer Delivery & Contact Card */}
            <div className="bg-stone-950 border border-stone-850 p-5 rounded-2xl space-y-3">
              <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Buyer Delivery & Contact Details</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-stone-500 font-bold">Buyer Name:</span>
                  <p className="text-white font-black text-sm">{order.buyerName || 'Winning Bidder'}</p>
                </div>
                <div>
                  <span className="text-stone-500 font-bold">Phone Number:</span>
                  <p className="text-white font-bold">{order.buyerContact || 'Awaiting buyer submission'}</p>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-stone-500 font-bold">Shipping Address:</span>
                  <p className="text-stone-300 font-medium">{order.buyerAddress || 'Awaiting buyer address submission'}</p>
                </div>
              </div>
            </div>

            {/* Seller Action based on order status */}
            {order.status === 'AWAITING_PAYMENT' && (
              <div className="p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-black text-amber-400 uppercase tracking-wider">
                  <Clock className="w-4 h-4" />
                  <span>Awaiting Buyer Payment Submission</span>
                </div>
                <p className="text-xs text-stone-300 leading-relaxed">
                  The winning bidder has 48 hours to submit their payment receipt. Once submitted, it will appear here for your review and approval.
                </p>
              </div>
            )}

            {order.status === 'PAYMENT_REVIEW' && (
              <div className="space-y-6">
                <div className="p-5 bg-blue-500/10 border border-blue-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black text-blue-400 uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Payment Proof Verification Required</span>
                  </div>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    Buyer has submitted a payment reference for <strong className="text-white">{formattedAmount}</strong>. Please check your bank account or mobile wallet to verify before confirming.
                  </p>
                  <div className="bg-stone-950 p-3 rounded-xl text-xs space-y-1">
                    <p className="text-stone-400 font-bold">Transaction ID: <span className="font-mono text-amber-400 font-black">{order.transactionId || 'N/A'}</span></p>
                    <p className="text-stone-400 font-bold">Method: <span className="text-white">{order.paymentMethod}</span></p>
                    {order.paymentNotes && <p className="text-stone-400 italic">Notes: "{order.paymentNotes}"</p>}
                  </div>
                </div>

                {order.paymentProofUrl && (
                  <div className="space-y-2">
                    <span className="text-xs font-black text-stone-400 uppercase tracking-wider">Deposit Screenshot:</span>
                    <div 
                      onClick={() => setLightboxImage(order.paymentProofUrl || null)}
                      className="w-48 h-48 rounded-2xl overflow-hidden border border-stone-800 cursor-pointer hover:opacity-90 transition-opacity bg-stone-950 shadow-inner"
                    >
                      <img src={order.paymentProofUrl} alt="Proof" className="w-full h-full object-cover" />
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button 
                    onClick={handleSellerApprovePayment}
                    disabled={sellerActionLoading}
                    className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs uppercase tracking-wider px-6 py-3.5 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                    <span>Confirm Payment Received</span>
                  </button>
                </div>
              </div>
            )}

            {order.status === 'PAID' && (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3 text-xs text-emerald-400 font-bold">
                  <Check className="w-5 h-5" />
                  <span>Payment confirmed! Fill out courier dispatch details below to ship to the buyer.</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                      Courier Company <span className="text-amber-500">*</span>
                    </label>
                    <input 
                      type="text"
                      value={sellerCourier}
                      onChange={e => setSellerCourier(e.target.value)}
                      placeholder="e.g. TCS, Leopard Courier, DHL"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-4 text-xs font-bold text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                      Tracking Code / CN Number
                    </label>
                    <input 
                      type="text"
                      value={sellerTracking}
                      onChange={e => setSellerTracking(e.target.value)}
                      placeholder="e.g. LE-98402941"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-4 text-xs font-mono font-bold text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-black text-stone-300 uppercase tracking-wider mb-1.5">
                      Dispatch Notes (Optional)
                    </label>
                    <input 
                      type="text"
                      value={sellerShippingNotes}
                      onChange={e => setSellerShippingNotes(e.target.value)}
                      placeholder="e.g. Fragile package, delivery within 2 days"
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl py-3 px-4 text-xs font-bold text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <button 
                  onClick={handleSellerDispatchShipment}
                  disabled={sellerActionLoading}
                  className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Truck className="w-4 h-4" />
                  <span>Dispatch Shipment to Buyer</span>
                </button>
              </div>
            )}

            {['SHIPPED', 'DEAL_DONE'].includes(order.status) && (
              <div className="p-4 bg-stone-950 border border-stone-850 rounded-2xl text-xs space-y-2">
                <span className="font-black text-stone-400 uppercase tracking-wider">Dispatched Package Details:</span>
                <p className="text-white font-bold">Courier: {order.courierName}</p>
                {order.trackingNumber && <p className="font-mono text-amber-400">Tracking: {order.trackingNumber}</p>}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Lightbox for Zooming Payment Proof */}
      {lightboxImage && (
        <div 
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="max-w-3xl max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            <img src={lightboxImage} alt="Enlarged Proof" className="w-full h-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};
export default BattleBidsCheckout;
