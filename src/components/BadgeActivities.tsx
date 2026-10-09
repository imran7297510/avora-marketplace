import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp, getDoc, setDoc, addDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { PromotionRequest } from "../types";
import { useAuth } from "../context/AuthContext";
import { PROMOTION_PACKAGES, PAYMENT_DETAILS, PAYMENT_METHODS } from "../lib/promotionPackages";
import { formatPKR } from "../lib/utils";
import { formatPrice, calculateRefundAmounts } from "../lib/currencies";
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  ShieldAlert, 
  Zap, 
  ShieldCheck, 
  Star, 
  Award,
  FileText, 
  Eye, 
  Image as ImageIcon,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Info,
  Calendar,
  DollarSign,
  Upload,
  X,
  Pencil,
  History,
  Loader2,
  CreditCard,
  Rocket,
  Smartphone,
  Building2,
  Coins,
  Copy,
  Check,
  Lock,
  AlertTriangle
} from "lucide-react";
export type ActiveBadgeCategory = 'PREMIUM' | 'FEATURED' | 'BOOST';

function RefundCountdown({ promo }: { promo: any }) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const rejectionTime = promo.rejectedAt || promo.updatedAt;
      if (!rejectionTime) {
        setTimeLeft(null);
        return;
      }

      let dateObj: Date;
      if (rejectionTime.toDate) {
        dateObj = rejectionTime.toDate();
      } else if (rejectionTime.seconds) {
        dateObj = new Date(rejectionTime.seconds * 1000);
      } else {
        dateObj = new Date(rejectionTime);
      }

      // 7 days window
      const targetTime = dateObj.getTime() + 7 * 24 * 60 * 60 * 1000;
      const remTime = targetTime - Date.now();

      if (remTime <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const days = Math.floor(remTime / (1000 * 60 * 60 * 24));
      const hours = Math.floor((remTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((remTime % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remTime % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [promo]);

  if (!timeLeft) return null;

  const isExpired = timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0;

  if (isExpired) {
    return (
      <span className="text-xs text-red-500 font-bold block font-sans">
        ⏳ Claim Expired
      </span>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-1 text-xs font-sans font-black text-rose-600 animate-pulse uppercase tracking-wider">
      <Clock className="w-3 h-3 text-rose-500 shrink-0" />
      <span>
        Time Left: {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
      </span>
    </div>
  );
}

export const checkRefundEligibility = (p: PromotionRequest, currentUserId?: string): { eligible: boolean; reason: string } => {
  if (!p) {
    return { eligible: false, reason: "Application record not found." };
  }

  // Condition E & I: Not already claimed or refunded
  if (p.refundStatus === 'REFUNDED') {
    return { eligible: false, reason: "Refund has already been completed for this application." };
  }
  if (p.refundRequested || p.refundStatus === 'PENDING') {
    return { eligible: false, reason: "A refund claim has already been submitted and is currently pending review." };
  }

  // Condition H: Request belongs to the relevant user
  if (currentUserId && p.userId && p.userId !== currentUserId) {
    return { eligible: false, reason: "Unauthorized: Request does not belong to your account." };
  }

  // Must be a rejected application
  if (p.status !== 'REJECTED') {
    return { eligible: false, reason: "Only rejected applications are eligible for refund review." };
  }

  // Condition G: No fraudulent/false-payment condition exists
  if (p.rejectionCategory === 'FRAUD') {
    return { eligible: false, reason: "Non-refundable: Application was rejected due to fraudulent payment or false evidence." };
  }

  // Condition A: Genuine payment was verified
  if (p.verificationStage !== 'PAYMENT_VERIFIED') {
    return { eligible: false, reason: "Non-refundable: Genuine payment was not verified by Payment Verifiers." };
  }

  // Condition B: Authoritative receivedAmount > 0
  const verifiedAmount = typeof p.receivedAmount === 'number' ? p.receivedAmount : 0;
  if (verifiedAmount <= 0) {
    return { eligible: false, reason: "Non-refundable: Authoritative verified received amount is zero." };
  }

  // Condition C: Application was rejected for a refundable reason
  if (p.rejectionCategory === 'NON_PAYMENT') {
    return { eligible: false, reason: "Non-refundable: Application was rejected due to non-payment." };
  }
  if (p.isRefundable === false) {
    return { eligible: false, reason: "Non-refundable: This rejection is classified as non-refundable." };
  }

  // Condition D: The paid badge/ad was NEVER ACTIVATED
  if (p.approvedAt || (p as any).activatedAt || (p as any).isActivated) {
    return { eligible: false, reason: "Non-refundable: Badge or promotion was previously approved or activated." };
  }

  // Condition F: The application is still within the valid 7-day refund window
  const rejectionTime = p.rejectedAt || p.updatedAt;
  if (rejectionTime) {
    let dateObj: Date;
    if (rejectionTime.toDate) {
      dateObj = rejectionTime.toDate();
    } else if (rejectionTime.seconds) {
      dateObj = new Date(rejectionTime.seconds * 1000);
    } else {
      dateObj = new Date(rejectionTime);
    }
    const diffDays = (Date.now() - dateObj.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 7) {
      return { eligible: false, reason: "Refund window expired: Claims must be submitted within 7 days of rejection." };
    }
  }

  return { eligible: true, reason: "Eligible for refund claim." };
};

export interface BadgeActivitiesProps {
  user: any;
  defaultCategory?: ActiveBadgeCategory;
  lockedCategory?: 'PREMIUM' | 'FEATURED' | 'BOOST';
  defaultListingId?: string;
  autoOpenApplyForm?: boolean;
}

export function BadgeActivities({ user, defaultCategory, lockedCategory, defaultListingId, autoOpenApplyForm }: BadgeActivitiesProps) {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [promotions, setPromotions] = useState<PromotionRequest[]>([]);
  const [verifications, setVerifications] = useState<any[]>([]);
  const [kycApp, setKycApp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ActiveBadgeCategory>(lockedCategory || defaultCategory || 'PREMIUM');

  useEffect(() => {
    if (lockedCategory) {
      setActiveCategory(lockedCategory);
    } else if (defaultCategory) {
      setActiveCategory(defaultCategory);
    }
  }, [lockedCategory, defaultCategory]);

  useEffect(() => {
    if (defaultListingId) {
      setSelectedListingId(defaultListingId);
    }
    if (autoOpenApplyForm) {
      setShowApplyForm(true);
    }
  }, [defaultListingId, autoOpenApplyForm]);

  const getThemeColors = () => {
    switch (activeCategory) {
      case 'PREMIUM':
        return {
          primary: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/10',
          lightBg: 'bg-emerald-50 text-emerald-700',
          borderColor: 'border-emerald-250',
          badgeColor: 'bg-emerald-100 text-emerald-800',
          planSelected: 'border-emerald-600 bg-emerald-600 text-white shadow-emerald-500/25',
          textAccent: 'text-emerald-500',
        };
      case 'FEATURED':
        return {
          primary: 'bg-amber-500 hover:bg-amber-600 text-stone-950 shadow-amber-500/10',
          lightBg: 'bg-amber-50 text-amber-700',
          borderColor: 'border-amber-250',
          badgeColor: 'bg-amber-100 text-amber-800',
          planSelected: 'border-amber-500 bg-amber-500 text-stone-950 shadow-amber-500/25',
          textAccent: 'text-amber-500',
        };
      case 'BOOST':
        return {
          primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/10',
          lightBg: 'bg-blue-50 text-blue-700',
          borderColor: 'border-blue-250',
          badgeColor: 'bg-blue-100 text-blue-800',
          planSelected: 'border-blue-600 bg-blue-600 text-white shadow-blue-500/25',
          textAccent: 'text-blue-500',
        };
      default:
        return {
          primary: 'bg-stone-900 hover:bg-stone-950 text-white shadow-stone-500/10',
          lightBg: 'bg-stone-50 text-stone-700',
          borderColor: 'border-stone-250',
          badgeColor: 'bg-stone-100 text-stone-800',
          planSelected: 'border-stone-900 bg-stone-900 text-white shadow-md',
          textAccent: 'text-stone-500',
        };
    }
  };

  const [searchText, setSearchText] = useState("");
  const [userListings, setUserListings] = useState<any[]>([]);

  // Edit logic states for rejected items
  const [editingPromo, setEditingPromo] = useState<PromotionRequest | null>(null);
  const [editItemLink, setEditItemLink] = useState("");
  const [editProofImage, setEditProofImage] = useState("");
  const [editSelectedListingId, setEditSelectedListingId] = useState("");
  const [editIsManualEntry, setEditIsManualEntry] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirmingRefundFor, setConfirmingRefundFor] = useState<PromotionRequest | null>(null);
  const [refundName, setRefundName] = useState("");
  const [refundBankName, setRefundBankName] = useState("");
  const [refundAccountNumber, setRefundAccountNumber] = useState("");
  const [refundProofImages, setRefundProofImages] = useState<string[]>([]);
  const [customConfirm, setCustomConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
  } | null>(null);

  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineRefundId, setInlineRefundId] = useState<string | null>(null);
  const [autoOpenedIds, setAutoOpenedIds] = useState<string[]>([]);
  const [selectedAppDetails, setSelectedAppDetails] = useState<any | null>(null);

  // New States for applying directly inside BadgeActivities
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedListingId, setSelectedListingId] = useState<string>('');
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [itemLink, setItemLink] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'Easypaisa' | 'Bank Transfer' | 'Cryptocurrency'>('Easypaisa');
  const [bankCurrency, setBankCurrency] = useState<'PKR' | 'USD'>('PKR');
  const [txHash, setTxHash] = useState<string>('');
  const [proofImage, setProofImage] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState<'Easypaisa' | 'Bank Transfer' | 'Cryptocurrency'>('Easypaisa');
  const [editTxHash, setEditTxHash] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [submittedAppId, setSubmittedAppId] = useState('');
  const [showKycPopup, setShowKycPopup] = useState(false);
  const [showApplyForm, setShowApplyForm] = useState(false);

  const handleCopy = (text: string, label: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  // Appeal states
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);
  const [appealPromotion, setAppealPromotion] = useState<PromotionRequest | null>(null);
  const [appealMessage, setAppealMessage] = useState("");
  const [appealImages, setAppealImages] = useState<string[]>([]);
  const [isAppealing, setIsAppealing] = useState(false);

  const handleAppealImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (!ctx) return resolve(event.target?.result as string);
              const maxDim = 1200;
              let width = img.width;
              let height = img.height;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL("image/jpeg", 0.7));
            };
            img.src = event.target?.result as string;
          };
          reader.readAsDataURL(file);
        });
        setAppealImages(prev => [...prev, base64]);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const removeAppealImage = (index: number) => {
    setAppealImages(prev => prev.filter((_, i) => i !== index));
  };

  const submitAppeal = async () => {
    if (!appealPromotion || !appealMessage.trim()) {
      alert("Please enter a message for your appeal.");
      return;
    }

    if (!confirm("Are you sure you want to submit this appeal? Once submitted, it will be reviewed by the administration.")) {
      return;
    }

    try {
      setIsAppealing(true);
      const updateData: any = {
        status: 'RESUME_REQUESTED',
        appealMessage: appealMessage.trim(),
        appealImages: appealImages,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'promotionRequests', appealPromotion.id), updateData);

      // Update target status
      if (appealPromotion.type !== 'VERIFIED') {
        try {
          await updateDoc(doc(db, 'listings', appealPromotion.targetId), {
            promotionStatus: 'RESUME_REQUESTED'
          });
        } catch {
          // Promotion lifecycle fields on listings are authoritative via admin/server rules
        }
      } else {
        await updateDoc(doc(db, 'users', appealPromotion.userId), {
          verifiedBadgeRequestStatus: 'RESUME_REQUESTED'
        });
      }

      alert("Your appeal has been submitted successfully and is now under review.");
      setIsAppealModalOpen(false);
      setAppealMessage("");
      setAppealImages([]);
      fetchActivities();
    } catch (err) {
      console.error(err);
      alert("Failed to submit appeal. Please try again.");
    } finally {
      setIsAppealing(false);
    }
  };

  const openAppealForm = (req: PromotionRequest) => {
    setAppealPromotion(req);
    setAppealMessage("");
    setAppealImages([]);
    setIsAppealModalOpen(true);
  };

  useEffect(() => {
    if (selectedListingId && selectedListingId !== 'MANUAL_ENTRY') {
      setItemLink(`${window.location.origin}/listings/${selectedListingId}`);
    } else if (selectedListingId === 'MANUAL_ENTRY') {
      // Keep manual entry itemLink untouched
    } else {
      setItemLink('');
    }
  }, [selectedListingId]);

  const getListingBadgeStatus = (listing: any, type: 'FEATURED' | 'BOOST') => {
    if (!listing) return { eligible: true, status: 'AVAILABLE', message: '' };

    if (listing.status === 'SOLD' || (listing.quantity || 0) <= 0) {
      return { 
        eligible: false, 
        status: 'SOLD_OUT', 
        message: 'Badge requests are unavailable for sold items.' 
      };
    }

    if (listing.status !== 'LIVE') {
      return {
        eligible: false,
        status: 'INACTIVE',
        message: 'Badge requests are only available for published, active listings.'
      };
    }

    const samePendingReq = promotions.find(r => 
      r.targetId === listing.id && 
      r.type === type && 
      r.status === 'PENDING'
    );
    if (samePendingReq) {
      return { 
        eligible: false, 
        status: 'PENDING', 
        message: `A ${type === 'FEATURED' ? 'Featured' : 'Boosted'} badge request is already pending for this listing.` 
      };
    }

    const isFeaturedExpired = !listing.isFeatured || (listing.featuredUntil && (
      typeof listing.featuredUntil.toDate === 'function' ? listing.featuredUntil.toDate() < new Date() :
      new Date(listing.featuredUntil.seconds ? listing.featuredUntil.seconds * 1000 : listing.featuredUntil) < new Date()
    ));

    const isBoostedExpired = !listing.isBoosted || (listing.boostedUntil && (
      typeof listing.boostedUntil.toDate === 'function' ? listing.boostedUntil.toDate() < new Date() :
      new Date(listing.boostedUntil.seconds ? listing.boostedUntil.seconds * 1000 : listing.boostedUntil) < new Date()
    ));

    if (type === 'FEATURED' && listing.isFeatured && !isFeaturedExpired) {
      return { 
        eligible: false, 
        status: 'APPROVED', 
        message: `This listing already has an active Featured badge.` 
      };
    }

    if (type === 'BOOST') {
      const isBoostedActive = listing.isBoosted && !isBoostedExpired;
      if (isBoostedActive) {
        return { 
          eligible: false, 
          status: 'APPROVED', 
          message: `This listing already has an active Boosted badge.` 
        };
      }
    }

    return { eligible: true, status: 'AVAILABLE', message: '' };
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                resolve(event.target?.result as string);
                return;
              }

              const maxDim = 830;
              let width = img.width;
              let height = img.height;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }

              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
              resolve(dataUrl);
            };
            img.onerror = () => reject(new Error("Failed to parse image file."));
            img.src = event.target?.result as string;
          };
          reader.onerror = () => reject(new Error("Failed to read image file."));
          reader.readAsDataURL(file);
        });

        setProofImage(compressedBase64);
      } catch (err: any) {
        alert(err.message || "Failed to process receipt image.");
      }
    }
  };

  const confirmSubmit = async () => {
    if (!user) return;
    if (!selectedPlan) return;

    const isKycApproved = userProfile?.kycStatus === 'APPROVED';
    const catType = activeCategory === 'PREMIUM' ? 'VERIFIED' : (activeCategory === 'FEATURED' ? 'FEATURED' : 'BOOST');
    
    if (catType === 'VERIFIED' && !isKycApproved) {
      setShowKycPopup(true);
      return;
    }

    setSubmitting(true);
    
    const isManual = isManualEntry || selectedListingId === 'MANUAL_ENTRY';
    
    try {
      const appIdPrefix = catType === 'VERIFIED' ? 'PREM' : catType === 'FEATURED' ? 'FEAT' : 'BOOS';
      const uniqueAppId = `APP-${appIdPrefix}-${Math.floor(100000 + Math.random() * 900000)}`;
      
      const isCrypto = selectedPaymentMethod === 'Cryptocurrency';

      const targetListing = !isManual && selectedListingId ? userListings.find(l => l.id === selectedListingId) : undefined;
      const targetType: 'listings' | 'arena_auctions' | 'users' = catType === 'VERIFIED'
        ? 'users'
        : (targetListing?.isArenaAuction ? 'arena_auctions' : 'listings');

      const requestData = {
        userId: user.uid,
        targetId: catType === 'VERIFIED' ? user.uid : (isManual ? 'MANUAL' : selectedListingId),
        targetType: targetType,
        type: catType,
        planName: selectedPlan.name,
        amount: selectedPlan.price,
        currency: selectedPlan.currency || 'PKR',
        formattedAmount: selectedPlan.formattedPrice || (
          selectedPlan.currency === 'USD' ? `$${selectedPlan.price} USD` :
          selectedPlan.currency === 'USDT' ? `$${selectedPlan.price} USDT (BEP-20)` :
          formatPKR(selectedPlan.price)
        ),
        durationDays: selectedPlan.days,
        paymentMethod: selectedPaymentMethod,
        bankCurrency: selectedPaymentMethod === 'Bank Transfer' ? bankCurrency : '',
        txHash: isCrypto ? txHash.trim() : '',
        paymentProofImage: proofImage || '',
        status: 'PENDING',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        itemLink: catType === 'VERIFIED' ? '' : itemLink,
        applicationId: uniqueAppId,
      };

      await addDoc(collection(db, 'promotionRequests'), requestData);
      setSubmittedAppId(uniqueAppId);

      // Also update listing/profile/arena_auction
      if (catType !== 'VERIFIED') {
        const ownsListing = userListings.some(l => l.id === selectedListingId);
        if (!isManual && selectedListingId && ownsListing) {
          const targetListing = userListings.find(l => l.id === selectedListingId);
          const currentPromoStatus = targetListing?.promotionStatus || 'NONE';
          const updateObj: any = { 
            promotionType: catType,
            updatedAt: serverTimestamp()
          };
          
          if (currentPromoStatus !== 'APPROVED') {
            updateObj.promotionStatus = 'PENDING';
          }
          if (targetListing?.isArenaAuction) {
            await updateDoc(doc(db, 'arena_auctions', selectedListingId), updateObj).catch(() => {});
          } else {
            await updateDoc(doc(db, 'listings', selectedListingId), updateObj).catch(() => {});
          }
        }
      } else {
        await updateDoc(doc(db, 'users', user.uid), {
           verifiedBadgeRequestStatus: 'PENDING',
           updatedAt: serverTimestamp()
        });
      }

      setSuccess(true);
      fetchActivities(); // Refresh activities
    } catch (error) {
      console.error("Error submitting promotion request:", error);
      alert("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const catType = activeCategory === 'PREMIUM' ? 'VERIFIED' : (activeCategory === 'FEATURED' ? 'FEATURED' : 'BOOST');
    
    if (!selectedPlan) {
      alert("Please select a package plan.");
      return;
    }

    if (catType !== 'VERIFIED') {
      const isManual = isManualEntry || selectedListingId === 'MANUAL_ENTRY';
      if (!isManual && !selectedListingId) {
        alert("Please select a listing or enter a link manually.");
        return;
      }
      if (isManual && !itemLink.trim()) {
        alert("Please enter listing link or title details.");
        return;
      }
    }

    if (!proofImage) {
      alert("Payment proof image is required.");
      return;
    }

    setCustomConfirm({
      isOpen: true,
      title: "Confirm Application Submission",
      message: "Are you sure you want to submit this badge application with the attached payment receipt? This will be sent to the administration for verification.",
      onConfirm: () => {
        setCustomConfirm(null);
        confirmSubmit();
      },
      confirmText: "Yes, Submit Receipt",
      cancelText: "Cancel"
    });
  };

  const getCategoryPlans = () => {
    if (activeCategory === 'PREMIUM') {
      if (selectedPaymentMethod === 'Cryptocurrency') {
        return [
          { id: 'verified-1-crypto', name: '1 Month', days: 30, price: 7.5, currency: 'USDT', formattedPrice: '$7.5 (BEP-20)', description: 'Premium Seller badge, Priority in search' },
          { id: 'verified-3-crypto', name: '3 Months', days: 90, price: 18, currency: 'USDT', formattedPrice: '$18 (BEP-20)', description: 'Premium Seller badge, Priority in search' },
          { id: 'verified-6-crypto', name: '6 Months', days: 180, price: 33, currency: 'USDT', formattedPrice: '$33 (BEP-20)', description: 'Premium Seller badge, Priority in search' },
          { id: 'verified-12-crypto', name: '12 Months', days: 365, price: 55, currency: 'USDT', formattedPrice: '$55 (BEP-20)', description: 'Premium Seller badge, Priority in search' },
        ];
      }
      if (selectedPaymentMethod === 'Bank Transfer' && bankCurrency === 'USD') {
        return [
          { id: 'verified-1-usd', name: '1 Month', days: 30, price: 7.5, currency: 'USD', formattedPrice: '$7.5', description: 'Premium Seller badge, Priority in search' },
          { id: 'verified-3-usd', name: '3 Months', days: 90, price: 18, currency: 'USD', formattedPrice: '$18', description: 'Premium Seller badge, Priority in search' },
          { id: 'verified-6-usd', name: '6 Months', days: 180, price: 33, currency: 'USD', formattedPrice: '$33', description: 'Premium Seller badge, Priority in search' },
          { id: 'verified-12-usd', name: '12 Months', days: 365, price: 55, currency: 'USD', formattedPrice: '$55', description: 'Premium Seller badge, Priority in search' },
        ];
      }
      return [
        { id: 'verified-1', name: '1 Month', days: 30, price: 1999, currency: 'PKR', formattedPrice: 'Rs. 1,999', description: 'Premium Seller badge, Priority in search' },
        { id: 'verified-3', name: '3 Months', days: 90, price: 4999, currency: 'PKR', formattedPrice: 'Rs. 4,999', description: 'Premium Seller badge, Priority in search' },
        { id: 'verified-6', name: '6 Months', days: 180, price: 8999, currency: 'PKR', formattedPrice: 'Rs. 8,999', description: 'Premium Seller badge, Priority in search' },
        { id: 'verified-12', name: '12 Months', days: 365, price: 14999, currency: 'PKR', formattedPrice: 'Rs. 14,999', description: 'Premium Seller badge, Priority in search' },
      ];
    }
    if (activeCategory === 'FEATURED') {
      if (selectedPaymentMethod === 'Cryptocurrency') {
        return [
          { id: 'featured-7-crypto', name: '7 Days', days: 7, price: 2, currency: 'USDT', formattedPrice: '$2 (BEP-20)', description: 'Highlight ad at top of search' },
          { id: 'featured-15-crypto', name: '15 Days', days: 15, price: 3.5, currency: 'USDT', formattedPrice: '$3.50 (BEP-20)', description: 'Highlight ad at top of search' },
          { id: 'featured-30-crypto', name: '30 Days', days: 30, price: 5.5, currency: 'USDT', formattedPrice: '$5.50 (BEP-20)', description: 'Highlight ad at top of search' },
        ];
      }
      if (selectedPaymentMethod === 'Bank Transfer' && bankCurrency === 'USD') {
        return [
          { id: 'featured-7-usd', name: '7 Days', days: 7, price: 2, currency: 'USD', formattedPrice: '$2', description: 'Highlight ad at top of search' },
          { id: 'featured-15-usd', name: '15 Days', days: 15, price: 3.3, currency: 'USD', formattedPrice: '$3.30', description: 'Highlight ad at top of search' },
          { id: 'featured-30-usd', name: '30 Days', days: 30, price: 5.5, currency: 'USD', formattedPrice: '$5.50', description: 'Highlight ad at top of search' },
        ];
      }
      return [
        { id: 'featured-7', name: '7 Days', days: 7, price: 499, currency: 'PKR', formattedPrice: 'Rs. 499', description: 'Highlight ad at top of search' },
        { id: 'featured-15', name: '15 Days', days: 15, price: 899, currency: 'PKR', formattedPrice: 'Rs. 899', description: 'Highlight ad at top of search' },
        { id: 'featured-30', name: '30 Days', days: 30, price: 1499, currency: 'PKR', formattedPrice: 'Rs. 1,499', description: 'Highlight ad at top of search' },
      ];
    }
    // BOOSTED BADGE PLANS
    if (selectedPaymentMethod === 'Cryptocurrency') {
      return [
        { id: 'boost-3-crypto', name: '3 Days', days: 3, price: 1.10, currency: 'USDT', formattedPrice: '$1.10 (BEP-20)', description: 'Higher ranking, Frequent in feeds' },
        { id: 'boost-7-crypto', name: '7 Days', days: 7, price: 2.30, currency: 'USDT', formattedPrice: '$2.30 (BEP-20)', description: 'Higher ranking, Frequent in feeds' },
        { id: 'boost-15-crypto', name: '15 Days', days: 15, price: 3.80, currency: 'USDT', formattedPrice: '$3.80 (BEP-20)', description: 'Higher ranking, Frequent in feeds' },
      ];
    }
    if (selectedPaymentMethod === 'Bank Transfer' && bankCurrency === 'USD') {
      return [
        { id: 'boost-3-usd', name: '3 Days', days: 3, price: 1.10, currency: 'USD', formattedPrice: '$1.10', description: 'Higher ranking, Frequent in feeds' },
        { id: 'boost-7-usd', name: '7 Days', days: 7, price: 2.30, currency: 'USD', formattedPrice: '$2.30', description: 'Higher ranking, Frequent in feeds' },
        { id: 'boost-15-usd', name: '15 Days', days: 15, price: 3.80, currency: 'USD', formattedPrice: '$3.80', description: 'Higher ranking, Frequent in feeds' },
      ];
    }
    return [
      { id: 'boost-3', name: '3 Days', days: 3, price: 299, currency: 'PKR', formattedPrice: 'Rs. 299', description: 'Higher ranking, Frequent in feeds' },
      { id: 'boost-7', name: '7 Days', days: 7, price: 599, currency: 'PKR', formattedPrice: 'Rs. 599', description: 'Higher ranking, Frequent in feeds' },
      { id: 'boost-15', name: '15 Days', days: 15, price: 999, currency: 'PKR', formattedPrice: 'Rs. 999', description: 'Higher ranking, Frequent in feeds' },
    ];
  };

  useEffect(() => {
    const plans = getCategoryPlans();
    if (!selectedPlan) {
      setSelectedPlan(plans[0]);
    } else {
      const match = plans.find(p => p.days === selectedPlan.days) || plans[0];
      if (match && (match.id !== selectedPlan.id || match.price !== selectedPlan.price || (match as any).currency !== selectedPlan.currency || (match as any).formattedPrice !== selectedPlan.formattedPrice)) {
        setSelectedPlan(match);
      }
    }
  }, [selectedPaymentMethod, bankCurrency, activeCategory]);

  const eligibilitiesCheckBlock = () => {
    const selectedListing = userListings.find(l => l.id === selectedListingId);
    if (!selectedListing) return null;
    const activeCheck = getListingBadgeStatus(selectedListing, activeCategory === 'FEATURED' ? 'FEATURED' : 'BOOST');
    return (
      <div className="mt-2 bg-rose-50 border border-rose-150 p-2.5 rounded-lg text-xs text-rose-805 font-semibold leading-normal animate-in fade-in duration-300">
        ⚠️ {activeCheck.message}
      </div>
    );
  };

  const renderInlineApplyForm = () => {
    const plans = getCategoryPlans();
    const isKycApproved = userProfile?.kycStatus === 'APPROVED';
    const catLabel = activeCategory === 'PREMIUM' ? 'Premium Seller Badge' : activeCategory === 'FEATURED' ? 'Featured Ads Badge' : 'Boosted Ads Badge';
    const catType = activeCategory === 'PREMIUM' ? 'VERIFIED' : (activeCategory === 'FEATURED' ? 'FEATURED' : 'BOOST');
    const hasUserActivePremium = !!(userProfile?.isPremiumVerified || userProfile?.verifiedBadgeType === 'GOLDEN' || userProfile?.verifiedBadgeType === 'PREMIUM');

    if (activeCategory === 'PREMIUM' && hasUserActivePremium) {
      return null;
    }

    if (success) {
      return (
        <div className="bg-emerald-50 border border-emerald-250 p-8 sm:p-12 rounded-3xl text-center animate-in fade-in zoom-in-95 duration-350 my-4 max-w-2xl mx-auto shadow-sm">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
             <CheckCircle className="w-8 h-8" />
          </div>
          <h4 className="text-2xl font-black text-stone-905 mb-2 italic uppercase">Request Submitted Successfully!</h4>
          <p className="text-stone-550 text-xs font-semibold leading-relaxed max-w-md mx-auto mb-6">
            Your manual payment proof is queued for verification. The platform administration will inspect record statements and activate your badge status typically within 24 hours of matching.
          </p>
          
          {submittedAppId && (
            <div className="mb-6 p-4 bg-white border border-stone-150 rounded-2xl inline-block shadow-xs">
              <span className="text-xs font-black uppercase text-stone-400 tracking-widest block mb-1">Your Tracking Number / App ID</span>
              <span className="text-base font-mono font-black text-stone-900 tracking-wider bg-stone-100 px-3 py-1 rounded">
                {submittedAppId}
              </span>
            </div>
          )}

          <div className="flex justify-center flex-col sm:flex-row gap-2 max-w-sm mx-auto">
            <button
              onClick={() => {
                setSuccess(false);
                setShowApplyForm(false);
                setSelectedPlan(null);
                setProofImage('');
                setItemLink('');
                setSelectedListingId('');
                setAgreeToTerms(false);
              }}
              className="px-8 py-3 bg-stone-900 hover:bg-stone-955 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer shadow-md w-full"
            >
              Okay, View History Logistics
            </button>
          </div>
        </div>
      );
    }

    const isManual = isManualEntry || selectedListingId === 'MANUAL_ENTRY';
    const selectedListing = userListings.find(l => l.id === selectedListingId);
    
    let isEligible = true;
    let eligibilityMsg = '';
    if (!isManual && activeCategory !== 'PREMIUM' && selectedListing) {
      const eligibility = getListingBadgeStatus(selectedListing, activeCategory === 'FEATURED' ? 'FEATURED' : 'BOOST');
      isEligible = eligibility.eligible;
      eligibilityMsg = eligibility.message;
    }

    const isCrypto = selectedPaymentMethod === 'Cryptocurrency';
    const isPaymentProofValid = isCrypto ? (txHash.trim().length >= 8) : Boolean(proofImage);

    const isSubmitDisabled = submitting || !selectedPlan || 
      (activeCategory !== 'PREMIUM' && !isManual && !selectedListingId) || 
      (!isManual && activeCategory !== 'PREMIUM' && !isEligible) || !isPaymentProofValid;

    return (
      <div className="bg-white border sm:border-2 border-stone-200/90 rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 md:p-8 space-y-4 sm:space-y-6 my-2 sm:my-4 shadow-sm animate-in slide-in-from-top-4 duration-350">
        
        {/* Intro banner */}
        <div className={`p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border ${
          activeCategory === 'PREMIUM' 
            ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/20 text-emerald-955' 
            : activeCategory === 'FEATURED'
            ? 'bg-gradient-to-r from-amber-500/10 to-stone-500/10 border-amber-500/20 text-amber-955'
            : 'bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-500/20 text-blue-955'
        }`}>
          <h3 className="text-base sm:text-lg font-black uppercase italic tracking-tight">Upgrade Your Visibility</h3>
          {activeCategory === 'PREMIUM' && !isKycApproved && (
            <div className="mt-3 p-3 sm:p-4 bg-rose-50 border border-rose-200 rounded-xl sm:rounded-2xl animate-in fade-in slide-in-from-top-2 duration-500">
              <p className="text-rose-600 text-xs font-black uppercase leading-relaxed mb-2.5">
                You can't submit application for grant of premium seller badge until you have an active status of KYC verification
              </p>
              <button
                onClick={() => navigate('/profile?tab=kyc')}
                className="w-full py-2.5 sm:py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] rounded-xl transition-all shadow-lg shadow-rose-600/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" /> Complete KYC verification for free
              </button>
            </div>
          )}
        </div>

        {/* Visual Progress Indicator Flow - 5 Steps */}
        <div className="bg-stone-50 border border-stone-200/90 p-3 sm:p-5 rounded-xl sm:rounded-2xl font-sans my-1 sm:my-2 shadow-2xs">
          <div className="flex items-center justify-between max-w-2xl mx-auto relative px-1 gap-1">
            {/* Step 1: Method Selection */}
            <div className="flex flex-col items-center z-10 text-center flex-1 min-w-0">
              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-[11px] sm:text-xs transition-all shrink-0 ${
                selectedPaymentMethod 
                  ? 'bg-amber-500 text-stone-950 font-black border-2 border-amber-400 ring-2 ring-amber-500/20' 
                  : 'bg-stone-200 text-stone-500'
              }`}>
                {selectedPaymentMethod ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-950" /> : '1'}
              </div>
              <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-tight text-stone-900 mt-1 leading-tight truncate max-w-full">
                1. Method
              </span>
              <span className="text-[8px] sm:text-[10px] text-stone-500 font-bold hidden sm:block mt-0.5 truncate max-w-full">
                {selectedPaymentMethod}
              </span>
            </div>

            {/* Line 1 -> 2 */}
            <div className="h-0.5 flex-1 bg-stone-200 rounded-full self-center mb-2 sm:mb-3">
              <div className={`h-full transition-all duration-300 ${selectedPlan ? 'bg-amber-500' : 'bg-stone-200'}`} />
            </div>

            {/* Step 2: Duration Selection */}
            <div className="flex flex-col items-center z-10 text-center flex-1 min-w-0">
              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-[11px] sm:text-xs transition-all shrink-0 ${
                selectedPlan 
                  ? 'bg-amber-500 text-stone-950 font-black border-2 border-amber-400 ring-2 ring-amber-500/20' 
                  : 'bg-stone-200 text-stone-500 border border-stone-300'
              }`}>
                {selectedPlan ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-950" /> : '2'}
              </div>
              <span className={`text-[9px] sm:text-[11px] font-black uppercase tracking-tight mt-1 leading-tight truncate max-w-full ${
                selectedPlan ? 'text-stone-900' : 'text-stone-400'
              }`}>
                2. Plan
              </span>
              <span className="text-[8px] sm:text-[10px] text-stone-500 font-bold hidden sm:block mt-0.5 truncate max-w-full">
                {selectedPlan ? selectedPlan.name : 'Select'}
              </span>
            </div>

            {/* Line 2 -> 3 */}
            <div className="h-0.5 flex-1 bg-stone-200 rounded-full self-center mb-2 sm:mb-3">
              <div className={`h-full transition-all duration-300 ${(activeCategory === 'PREMIUM' || Boolean(selectedListingId)) ? 'bg-amber-500' : 'bg-stone-200'}`} />
            </div>

            {/* Step 3: Target Selection */}
            <div className="flex flex-col items-center z-10 text-center flex-1 min-w-0">
              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-[11px] sm:text-xs transition-all shrink-0 ${
                (activeCategory === 'PREMIUM' || Boolean(selectedListingId))
                  ? 'bg-amber-500 text-stone-950 font-black border-2 border-amber-400 ring-2 ring-amber-500/20' 
                  : 'bg-stone-200 text-stone-500 border border-stone-300'
              }`}>
                {(activeCategory === 'PREMIUM' || Boolean(selectedListingId)) ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-950" /> : '3'}
              </div>
              <span className={`text-[9px] sm:text-[11px] font-black uppercase tracking-tight mt-1 leading-tight truncate max-w-full ${
                (activeCategory === 'PREMIUM' || Boolean(selectedListingId)) ? 'text-stone-900' : 'text-stone-400'
              }`}>
                3. Target
              </span>
              <span className="text-[8px] sm:text-[10px] text-stone-500 font-bold hidden sm:block mt-0.5 truncate max-w-full">
                {activeCategory === 'PREMIUM' ? 'My Account' : (selectedListingId ? 'Selected' : 'Select Ad')}
              </span>
            </div>

            {/* Line 3 -> 4 */}
            <div className="h-0.5 flex-1 bg-stone-200 rounded-full self-center mb-2 sm:mb-3">
              <div className={`h-full transition-all duration-300 ${isPaymentProofValid ? 'bg-amber-500' : 'bg-stone-200'}`} />
            </div>

            {/* Step 4: Payment Proof */}
            <div className="flex flex-col items-center z-10 text-center flex-1 min-w-0">
              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-[11px] sm:text-xs transition-all shrink-0 ${
                isPaymentProofValid 
                  ? 'bg-amber-500 text-stone-950 font-black border-2 border-amber-400 ring-2 ring-amber-500/20' 
                  : 'bg-stone-200 text-stone-500 border border-stone-300'
              }`}>
                {isPaymentProofValid ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-950" /> : '4'}
              </div>
              <span className={`text-[9px] sm:text-[11px] font-black uppercase tracking-tight mt-1 leading-tight truncate max-w-full ${
                isPaymentProofValid ? 'text-stone-900' : 'text-stone-400'
              }`}>
                4. Proof
              </span>
              <span className="text-[8px] sm:text-[10px] text-stone-500 font-bold hidden sm:block mt-0.5 truncate max-w-full">
                {isPaymentProofValid ? 'Attached' : 'Receipt'}
              </span>
            </div>

            {/* Line 4 -> 5 */}
            <div className="h-0.5 flex-1 bg-stone-200 rounded-full self-center mb-2 sm:mb-3">
              <div className={`h-full transition-all duration-300 ${!isSubmitDisabled ? 'bg-amber-500' : 'bg-stone-200'}`} />
            </div>

            {/* Step 5: Final Submit */}
            <div className="flex flex-col items-center z-10 text-center flex-1 min-w-0">
              <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-[11px] sm:text-xs transition-all shrink-0 ${
                !isSubmitDisabled 
                  ? 'bg-amber-500 text-stone-950 font-black border-2 border-amber-400 ring-2 ring-amber-500/20' 
                  : 'bg-stone-200 text-stone-500 border border-stone-300'
              }`}>
                {!isSubmitDisabled ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-950" /> : '5'}
              </div>
              <span className={`text-[9px] sm:text-[11px] font-black uppercase tracking-tight mt-1 leading-tight truncate max-w-full ${
                !isSubmitDisabled ? 'text-stone-900' : 'text-stone-400'
              }`}>
                5. Submit
              </span>
              <span className="text-[8px] sm:text-[10px] text-stone-500 font-bold hidden sm:block mt-0.5 truncate max-w-full">
                Review
              </span>
            </div>
          </div>
        </div>

        {/* Step 1: Payment details */}
        <div className="space-y-3 sm:space-y-4 border-t border-stone-100 pt-4 sm:pt-5 text-stone-950">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-black text-stone-900 uppercase tracking-wide block italic">1. Select Payment Method & Transfer Funds</h4>
          </div>

          {/* Payment Method Selector Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {PAYMENT_METHODS.map((method) => {
              const isSelected = selectedPaymentMethod === method.name;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => {
                    setSelectedPaymentMethod(method.name as any);
                    setCopiedText(null);
                  }}
                  className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between cursor-pointer min-w-0 ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/80 shadow-sm ring-2 ring-amber-500/20'
                      : 'border-stone-200 bg-stone-50/60 hover:bg-stone-100 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <span className={`p-1.5 sm:p-2 rounded-xl text-xs font-black uppercase ${
                      isSelected ? 'bg-amber-500 text-stone-950' : 'bg-stone-200 text-stone-700'
                    }`}>
                      {method.id === 'EASYPAISA' && <Smartphone className="w-4 h-4" />}
                      {method.id === 'BANK_TRANSFER' && <Building2 className="w-4 h-4" />}
                      {method.id === 'CRYPTO' && <Coins className="w-4 h-4" />}
                    </span>
                    {isSelected && (
                      <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                      <span className="text-xs font-black text-stone-900 uppercase block tracking-tight truncate">
                        {method.name}
                      </span>
                      <span className={`text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded border ${
                        isSelected 
                          ? 'bg-amber-100/90 text-amber-900 border-amber-300' 
                          : 'bg-stone-100 text-stone-500 border-stone-200/80'
                      }`}>
                        {method.id === 'EASYPAISA' && 'For Pakistani Users'}
                        {method.id === 'BANK_TRANSFER' && 'For Global Users'}
                        {method.id === 'CRYPTO' && 'For All Users'}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-stone-500 block font-sans truncate">
                      {method.category}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Payment Method Account Card */}
          {selectedPaymentMethod === 'Easypaisa' && (
            <div className="bg-emerald-50/80 border-2 border-emerald-200/80 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl space-y-3 sm:space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5 sm:pb-3">
                <div className="flex items-center gap-2">
                  <div className="bg-emerald-600 text-white font-black px-2.5 py-1 rounded-lg text-[10px] sm:text-xs uppercase tracking-wider">
                    Easypaisa Wallet
                  </div>
                </div>
                <span className="text-[10px] sm:text-[11px] font-extrabold text-emerald-800 font-sans">
                  Official Merchant Account
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs font-sans">
                <div className="p-3 bg-white/90 border border-emerald-100 rounded-xl">
                  <span className="text-emerald-700 font-extrabold text-[10px] uppercase tracking-wider block mb-1">
                    Account / Receiver Number
                  </span>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-stone-900 font-mono font-black text-xs sm:text-sm select-all">
                      0346-7297510
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('0346-7297510', 'number')}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition active:scale-95 shrink-0 cursor-pointer w-full sm:w-auto"
                    >
                      {copiedText === 'number' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedText === 'number' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-white/90 border border-emerald-100 rounded-xl">
                  <span className="text-emerald-700 font-extrabold text-[10px] uppercase tracking-wider block mb-1">
                    Account Title
                  </span>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-stone-900 font-black text-xs sm:text-sm select-all">
                      Muhammad Imran
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('Muhammad Imran', 'title')}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition active:scale-95 shrink-0 cursor-pointer w-full sm:w-auto"
                    >
                      {copiedText === 'title' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedText === 'title' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedPaymentMethod === 'Bank Transfer' && (
            <div className="bg-blue-50/80 border-2 border-blue-200/80 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl space-y-3 sm:space-y-4 relative overflow-hidden">
              <div className="border-b border-blue-200/60 pb-2.5 sm:pb-3">
                {/* Compact Currency Selector - Polished Dark Theme (Matching /credits Style) */}
                <div className="bg-stone-900 border border-stone-800 p-2 rounded-xl shadow-md shrink-0 w-full">
                  <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-2">
                    <div>
                      <span className="text-[10.5px] font-black text-white uppercase tracking-wider block">
                        Select Payment Currency
                      </span>
                      <span className="text-[9.5px] text-amber-400/90 font-medium block">
                        Choose the currency you will use for this payment
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setBankCurrency('PKR')}
                        className={`py-1 px-2.5 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all duration-150 cursor-pointer flex items-center gap-1 border ${
                          bankCurrency === 'PKR'
                            ? 'bg-amber-400 text-stone-950 border-amber-400 shadow-2xs'
                            : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
                        }`}
                      >
                        <span className="text-xs">🇵🇰</span>
                        <span>PKR</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBankCurrency('USD')}
                        className={`py-1 px-2.5 rounded-lg text-[10px] sm:text-xs font-black uppercase transition-all duration-150 cursor-pointer flex items-center gap-1 border ${
                          bankCurrency === 'USD'
                            ? 'bg-amber-400 text-stone-950 border-amber-400 shadow-2xs'
                            : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700'
                        }`}
                      >
                        <span className="text-xs">🇺🇸</span>
                        <span>USD ($)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs font-sans">
                <div className="p-3 bg-white/90 border border-blue-100 rounded-xl">
                  <span className="text-blue-700 font-extrabold text-[10px] uppercase tracking-wider block mb-1">
                    Bank Name
                  </span>
                  <span className="text-stone-900 font-black text-xs sm:text-sm select-all block mt-0.5">
                    National Bank of Pakistan
                  </span>
                </div>

                <div className="p-3 bg-white/90 border border-blue-100 rounded-xl">
                  <span className="text-blue-700 font-extrabold text-[10px] uppercase tracking-wider block mb-1">
                    Bank IBAN Number
                  </span>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-stone-900 font-mono font-black text-xs select-all break-all">
                      PK47NBPA1674004094573230
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('PK47NBPA1674004094573230', 'iban')}
                      className="px-2.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition active:scale-95 shrink-0 cursor-pointer w-full sm:w-auto"
                    >
                      {copiedText === 'iban' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedText === 'iban' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-white/90 border border-blue-100 rounded-xl">
                  <span className="text-blue-700 font-extrabold text-[10px] uppercase tracking-wider block mb-1">
                    Account Title
                  </span>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-stone-900 font-black text-xs sm:text-sm select-all">
                      Muhammad Imran
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('Muhammad Imran', 'title')}
                      className="px-2.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition active:scale-95 shrink-0 cursor-pointer w-full sm:w-auto"
                    >
                      {copiedText === 'title' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedText === 'title' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-2.5 sm:p-3 bg-white/90 border border-blue-100 rounded-xl text-[11px] sm:text-xs text-blue-900 font-semibold leading-relaxed font-sans">
                👉 Send online transfer / IBFT from your banking application to National Bank of Pakistan using IBAN <strong>PK47NBPA1674004094573230</strong> (Muhammad Imran). Upload your bank transfer confirmation slip below.
              </div>
            </div>
          )}

          {selectedPaymentMethod === 'Cryptocurrency' && (
            <div className="bg-amber-50/80 border-2 border-amber-200/80 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl space-y-3 sm:space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-amber-200/60 pb-2.5 sm:pb-3">
                <div className="flex items-center gap-2">
                  <div className="bg-stone-900 text-amber-400 font-black px-2.5 py-1 rounded-lg text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5" />
                    USDT (BEP20 / BSC)
                  </div>
                </div>
                <span className="text-[10px] sm:text-[11px] font-extrabold text-amber-900 font-sans">
                  Official Crypto Wallet
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs font-sans">
                <div className="p-3 bg-white/90 border border-amber-100 rounded-xl">
                  <span className="text-amber-800 font-extrabold text-[10px] uppercase tracking-wider block mb-1">
                    Network & Token
                  </span>
                  <span className="text-stone-900 font-black text-xs sm:text-sm block">
                    BEP20 (BNB Smart Chain) - USDT
                  </span>
                </div>

                <div className="p-3 bg-white/90 border border-amber-100 rounded-xl">
                  <span className="text-amber-800 font-extrabold text-[10px] uppercase tracking-wider block mb-1">
                    Wallet Deposit Address
                  </span>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-stone-900 font-mono font-black text-xs select-all break-all">
                      0xdDBAA957EF06B0A6D363F03f2C34919ada605797
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('0xdDBAA957EF06B0A6D363F03f2C34919ada605797', 'crypto')}
                      className="px-2.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-amber-400 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition active:scale-95 shrink-0 cursor-pointer w-full sm:w-auto"
                    >
                      {copiedText === 'crypto' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedText === 'crypto' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-2.5 sm:p-3 bg-white/90 border border-amber-100 rounded-xl text-[11px] sm:text-xs text-amber-950 font-semibold leading-relaxed font-sans">
                👉 Send USDT <strong>ONLY via BEP20 (BNB Smart Chain)</strong> to address <strong>0xdDBAA957EF06B0A6D363F03f2C34919ada605797</strong>. Enter your Transaction Hash (TXID) below.
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Select Package Duration Plan */}
        <div className="space-y-3 sm:space-y-4 border-t border-stone-100 pt-4 sm:pt-5">
          <div>
            <h4 className="text-xs sm:text-sm font-black text-stone-900 uppercase tracking-wide block italic mb-2.5 sm:mb-3">2. Select Package Duration Plan</h4>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
              {plans.map((plan: any) => {
                const isSelected = selectedPlan?.id === plan.id;
                const activeThemeColors = getThemeColors();
                const displayPrice = plan.formattedPrice || (
                  plan.currency === 'USD' ? `$${plan.price}` :
                  plan.currency === 'USDT' ? `$${plan.price} (BEP-20)` :
                  formatPKR(plan.price)
                );
                return (
                  <button
                    type="button"
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`p-3 sm:p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden flex flex-col justify-between cursor-pointer min-w-0 ${
                      isSelected 
                        ? `${activeThemeColors.planSelected} font-sans` 
                        : 'border-stone-100 bg-stone-50 hover:border-stone-250 text-stone-600 font-sans'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <div className={`text-[9.5px] sm:text-[10px] font-extrabold uppercase truncate ${isSelected ? 'text-amber-400' : 'text-stone-500'}`}>
                        {plan.name}
                      </div>
                      {isSelected && (
                        <div className="shrink-0">
                          <CheckCircle className="w-4 h-4 text-amber-500" />
                        </div>
                      )}
                    </div>
                    <div className="text-sm sm:text-lg font-black my-0.5 sm:my-1 break-words leading-tight">
                      {displayPrice}
                    </div>
                    <div className={`text-[9px] sm:text-[9.5px] font-medium leading-tight line-clamp-2 ${isSelected ? 'text-stone-300 font-sans' : 'text-stone-400 font-sans'}`}>
                      {plan.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Step 3: Choose Target Listing / Account */}
        <div className="space-y-4 border-t border-stone-100 pt-5">
          <h4 className="text-xs sm:text-sm font-black text-stone-900 uppercase tracking-wide block italic mb-2">
            3. Select Target {activeCategory === 'PREMIUM' ? 'Account Profile' : 'Promoted Listing'}
          </h4>

          {activeCategory === 'PREMIUM' ? (
            <div className="p-3.5 sm:p-4 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-xs font-sans text-emerald-950 font-semibold flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-black text-emerald-900 block uppercase">Target Account: Current Verified User Profile</span>
                <span className="text-[11px] text-emerald-700">Premium Seller badge will automatically be granted to your logged in user profile account ({user?.email || 'Current Account'}).</span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4 mb-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-stone-655 select-none">
                  <input 
                    type="radio" 
                    checked={!isManualEntry} 
                    onChange={() => {
                      setIsManualEntry(false);
                      setSelectedListingId('');
                    }}
                    className="w-4 h-4 border-stone-350 text-amber-500 focus:ring-amber-500"
                  />
                  Choose From My Listings ({userListings.length})
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-stone-655 select-none">
                  <input 
                    type="radio" 
                    checked={isManualEntry} 
                    onChange={() => {
                      setIsManualEntry(true);
                      setSelectedListingId('MANUAL_ENTRY');
                    }}
                    className="w-4 h-4 border-stone-350 text-amber-500 focus:ring-amber-500"
                  />
                  Enter Listing Link Manually
                </label>
              </div>

              {!isManualEntry ? (
                <div className="space-y-2">
                  {userListings.length === 0 ? (
                    <p className="text-xs font-semibold text-rose-650 uppercase tracking-wide bg-rose-50 p-4 border border-rose-100/60 rounded-xl">
                      ⚠️ You do not own any active listings. Please select "Enter Listing Link Manually" to apply for offline items.
                    </p>
                  ) : (
                    <select 
                      value={selectedListingId}
                      onChange={(e) => setSelectedListingId(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 focus:ring-1 focus:ring-amber-500 focus:border-amber-550 rounded-xl p-3 text-stone-900 font-bold text-xs"
                      required
                    >
                      <option value="" disabled>-- Choose an active listing target --</option>
                      {userListings.map(listing => {
                        const featStatus = getListingBadgeStatus(listing, 'FEATURED');
                        const boostStatus = getListingBadgeStatus(listing, 'BOOST');
                        
                        let suffix = "";
                        if (listing.status === 'SOLD') suffix = " [SOLD]";
                        else if (listing.status !== 'LIVE') suffix = ` [${listing.status}]`;
                        else if (activeCategory === 'FEATURED' && featStatus.status === 'APPROVED') suffix = " (★ Featured Active)";
                        else if (activeCategory === 'BOOST' && boostStatus.status === 'APPROVED') suffix = " (⚡ Boosted Active)";

                        return (
                          <option key={listing.id} value={listing.id} disabled={listing.status !== 'LIVE'}>
                            {listing.title}{suffix}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="block text-xs font-extrabold text-stone-400 uppercase tracking-widest italic font-sans">Item URL, ID, or Details</label>
                  <input
                    type="text"
                    value={itemLink}
                    onChange={(e) => setItemLink(e.target.value)}
                    placeholder="e.g. Sahiwal Cow or Avora listing link"
                    className="w-full bg-stone-50 border-stone-200 border focus:ring-amber-500 focus:border-amber-500 rounded-xl p-3.5 text-stone-900 font-bold text-xs outline-none"
                    required
                  />
                </div>
              )}

              {/* Eligibility Warnings */}
              {!isManual && selectedListingId && selectedListingId !== 'MANUAL_ENTRY' && selectedListing && (
                <div className="bg-stone-50 border border-stone-250 p-4 rounded-xl text-xs space-y-1 select-none">
                  <div className="flex justify-between items-center text-xs uppercase font-black tracking-wider text-stone-400 border-b border-stone-200/60 pb-1.5 mb-1">
                    <span>Ad Badge Status Indicators:</span>
                    <span>Listing ID: {selectedListing.id.substring(0,8)}...</span>
                  </div>
                  <div className="flex justify-between items-center pt-0.5">
                    <span className="font-bold text-stone-605">🌟 Featured ads badge:</span>
                    <span className={`font-extrabold px-1.5 py-0.5 rounded text-[9.5px] uppercase ${
                      getListingBadgeStatus(selectedListing, 'FEATURED').status === 'APPROVED' ? 'bg-emerald-50 text-emerald-850 border border-emerald-100' :
                      'bg-stone-200 text-stone-400'
                    }`}>
                      {getListingBadgeStatus(selectedListing, 'FEATURED').status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="font-bold text-stone-605">🚀 Boosted ads badge:</span>
                    <span className={`font-extrabold px-1.5 py-0.5 rounded text-[9.5px] uppercase ${
                      getListingBadgeStatus(selectedListing, 'BOOST').status === 'APPROVED' ? 'bg-emerald-50 text-emerald-850 border border-emerald-100' :
                      'bg-stone-200 text-stone-400'
                    }`}>
                      {getListingBadgeStatus(selectedListing, 'BOOST').status}
                    </span>
                  </div>
                  
                  {!isEligible && eligibilitiesCheckBlock()}
                </div>
              )}
            </>
          )}
        </div>

        {/* Step 4: Provide Payment Verification Proof */}
        <div className="space-y-4 border-t border-stone-105 pt-5">
          <h4 className="text-xs sm:text-sm font-black text-stone-900 uppercase tracking-widest block italic mb-2">
            4. Provide Payment Verification Proof
          </h4>

          {selectedPaymentMethod === 'Cryptocurrency' && (
            <div className="space-y-2 font-sans">
              <label className="block text-xs font-black text-stone-900 uppercase tracking-wider">
                Transaction Hash / ID (TXID) <span className="text-rose-600">* Required</span>
              </label>
              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="Paste 64-character Transaction Hash / TXID (e.g. 0x...)"
                className="w-full bg-stone-50 border-2 border-stone-200 rounded-xl p-3 text-xs font-mono font-bold text-stone-900 outline-none focus:border-amber-500 transition-all"
              />
              <p className="text-[11px] text-stone-500 font-medium leading-normal">
                Paste your crypto transaction ID or hash here. Our Payment Verifiers will check and verify this transaction ID on BscScan.
              </p>
            </div>
          )}

          <div className="space-y-2 font-sans">
            <label className="block text-xs font-black text-stone-900 uppercase tracking-wider">
              {selectedPaymentMethod === 'Cryptocurrency' ? 'Transaction Receipt Screenshot (Optional)' : 'Upload Payment Receipt Screenshot * Required'}
            </label>

            {!proofImage ? (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-stone-250 bg-stone-50 rounded-2xl cursor-pointer hover:bg-stone-100/80 transition-colors group">
                <Upload className="w-6 h-6 text-stone-400 group-hover:text-amber-550 transition-colors mb-1.5" />
                <span className="text-xs font-black text-stone-450 uppercase tracking-widest font-sans">Select Image / Screenshot</span>
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              </label>
            ) : (
              <div className="relative group rounded-2xl overflow-hidden border border-stone-250 bg-stone-50 max-w-sm">
                <img src={proofImage} alt="receipt" className="max-h-52 w-full object-cover rounded-2xl select-none" />
                <button
                  type="button"
                  onClick={() => setProofImage('')}
                  className="absolute top-2 right-2 bg-stone-900/80 text-white p-1.5 rounded-lg text-[9.5px] font-black uppercase tracking-wider h-fit"
                >
                  Change Photo
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Step 5: Cost Summary & Submission button */}
        <div className="border-t border-stone-100 pt-5 space-y-4">
          <h4 className="text-xs sm:text-sm font-black text-stone-900 uppercase tracking-widest block italic mb-2">
            5. Review Summary & Submit Application
          </h4>
          <div className="flex justify-between items-center pb-3 border-b border-stone-100 mb-3 text-xs font-sans">
            <span className="text-stone-400 font-extrabold uppercase tracking-wider">Plan Selected duration:</span>
            <span className="text-stone-900 font-black text-sm">{selectedPlan ? selectedPlan.name : '—'}</span>
          </div>
          <div className="flex justify-between items-center mb-5 font-sans">
            <span className="text-stone-400 font-extrabold uppercase tracking-wider text-xs">Total payment Amount:</span>
            <span className="text-xl font-black text-stone-900">
              {selectedPlan ? (
                selectedPlan.formattedPrice || (
                  selectedPlan.currency === 'USD' ? `$${selectedPlan.price} USD` :
                  selectedPlan.currency === 'USDT' ? `$${selectedPlan.price} USDT (BEP-20)` :
                  formatPKR(selectedPlan.price)
                )
              ) : '—'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {promotions.filter(p => p.type === catType).length > 0 && (
              <button
                type="button"
                onClick={() => setShowApplyForm(false)}
                className="bg-stone-50 hover:bg-stone-100 border border-stone-250 rounded-xl px-5 py-3 text-stone-605 text-xs font-black uppercase tracking-wider transition active:scale-95 text-center font-sans"
              >
                Cancel Form
              </button>
            )}
            
            {catType === 'VERIFIED' && !isKycApproved ? (
              <button
                type="button"
                onClick={() => navigate('/profile?tab=kyc')}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-4 rounded-xl text-sm italic uppercase tracking-widest transition-all shadow-lg shadow-rose-600/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer font-sans"
              >
                <ShieldCheck className="w-5 h-5" /> Complete KYC verification for free
              </button>
            ) : (
              <button
                onClick={handleApplyFormSubmit}
                type="button"
                disabled={isSubmitDisabled}
                className={`flex-1 ${getThemeColors().primary} disabled:opacity-50 font-black py-4 rounded-xl text-sm italic uppercase tracking-widest transition-all disabled:grayscale shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-sans`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Submitting Request...
                  </>
                ) : (
                  'Submit Application Receipt'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const startInlineEditing = (p: PromotionRequest) => {
    if (p.status === 'REJECTED' || p.verificationStage === 'VERIFIER_DENIED') {
      alert("Rejected applications are closed historical records and cannot be edited. Please submit a fresh application.");
      return;
    }
    setInlineEditingId(p.id);
    setInlineRefundId(null);
    setEditItemLink(p.itemLink || "");
    setEditProofImage(p.paymentProofImage || "");
    setEditPaymentMethod((p.paymentMethod as any) || "Easypaisa");
    setEditTxHash(p.txHash || "");
    
    if (p.type !== 'VERIFIED') {
      const isManual = p.targetId === 'MANUAL' || !p.targetId || p.targetId === 'MANUAL_ENTRY';
      setEditIsManualEntry(isManual);
      setEditSelectedListingId(isManual ? 'MANUAL_ENTRY' : p.targetId);
    } else {
      setEditIsManualEntry(false);
      setEditSelectedListingId("");
    }
  };

  const startInlineRefund = (p: PromotionRequest) => {
    if (p.status === 'APPROVED') {
      alert("You cannot use this option because your application is already Active/Approved.");
      return;
    }
    if (p.status === 'PENDING') {
      alert("You cannot use this option because your application is already Under Review Pending.");
      return;
    }
    if (p.status === 'REVOKED') {
      alert("You cannot use this option because your application has been Revoked.");
      return;
    }
    if ((p.status as string) === 'EXPIRED') {
      alert("You cannot use this option because the age of your badge has been expired.");
      return;
    }
    
    const check = checkRefundEligibility(p, user?.uid);
    if (!check.eligible) {
      alert(check.reason);
      return;
    }

    setInlineRefundId(p.id);
    setInlineEditingId(null);
    setRefundName("");
    setRefundBankName("");
    setRefundAccountNumber("");
    setRefundProofImages([]);
  };

  const handleRefundProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImages: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                  resolve(ev.target?.result as string);
                  return;
                }
                const maxDim = 830;
                let width = img.width;
                let height = img.height;
                if (width > maxDim || height > maxDim) {
                  if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                  } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                  }
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.65));
              };
              img.onerror = () => resolve(ev.target?.result as string);
              img.src = ev.target?.result as string;
            };
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
          });
          newImages.push(base64);
        } catch (err) {
          console.error("Error reading file", err);
        }
      }
      setRefundProofImages(prev => [...prev, ...newImages]);
    }
  };

  const removeRefundProofImage = (index: number) => {
    setRefundProofImages(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleResubmitWithConfirm = (req: PromotionRequest) => {
    if (req.status === 'REJECTED' || req.verificationStage === 'VERIFIER_DENIED') {
      alert("Rejected applications are closed historical records and cannot be resubmitted. Please submit a fresh application.");
      return;
    }
    if (req.status === 'APPROVED') {
      alert("You cannot use this option because your application is already Active/Approved.");
      return;
    }
    if (req.status === 'PENDING') {
      alert("You cannot use this option because your application is already Under Review Pending.");
      return;
    }
    if (req.status === 'REVOKED') {
      alert("You cannot use this option because your application has been Revoked.");
      return;
    }
    if ((req.status as string) === 'EXPIRED') {
      alert("You cannot use this option because the age of your badge has been expired.");
      return;
    }
    alert("This application cannot be resubmitted. Please submit a fresh application.");
  };

  const handleSaveEditForWithConfirm = (e: React.FormEvent, promo: PromotionRequest) => {
    if (e) e.preventDefault();
    if (!promo) return;

    if (promo.status === 'REJECTED' || promo.verificationStage === 'VERIFIER_DENIED') {
      alert("Rejected applications are closed historical records and cannot be edited. Please submit a fresh application.");
      return;
    }

    const isInvalidStatus = 
      promo.status === 'APPROVED' || 
      promo.status === 'PENDING' || 
      promo.status === 'REVOKED' || 
      (promo.status as string) === 'EXPIRED';

    if (isInvalidStatus) {
      alert("You cannot use this option because your application is already Active/Approved, Under Review Pending, Revoked or the age of badge has been expired.");
      return;
    }
    if (!isEligibleForEdit(promo)) {
      alert("Editing is disabled for this application. Please submit a fresh application.");
      return;
    }

    if (promo.type !== 'VERIFIED') {
      const isManual = editIsManualEntry || editSelectedListingId === 'MANUAL_ENTRY';
      if (!isManual && !editSelectedListingId) {
        alert("Please select a listing or enter a link manually.");
        return;
      }
      if (isManual && !editItemLink.trim()) {
        alert("Please enter listing link, title, or details.");
        return;
      }
    }

    if (!editProofImage) {
      alert("Payment proof receipt image is required.");
      return;
    }

    setCustomConfirm({
      isOpen: true,
      title: "Submit Re-evaluation?",
      message: "Are you sure you want to submit this edited application for re-evaluation?",
      confirmText: "Yes, Submit",
      cancelText: "Cancel",
      onConfirm: () => {
        handleSaveEditFor(e, promo);
        setCustomConfirm(null);
      }
    });
  };

  const confirmRefundActionInlineWithConfirm = (req: PromotionRequest, name: string, bank: string, acct: string) => {
    const isInvalidStatus = 
      req.status === 'APPROVED' || 
      req.status === 'PENDING' || 
      req.status === 'REVOKED' || 
      (req.status as string) === 'EXPIRED';

    if (isInvalidStatus) {
      alert("You cannot use this option because your application is already Active/Approved, Under Review Pending, Revoked or the age of badge has been expired.");
      return;
    }

    const check = checkRefundEligibility(req, user?.uid);
    if (!check.eligible) {
      alert(check.reason);
      return;
    }

    if (!name.trim() || !bank.trim() || !acct.trim()) {
      alert("Please fill in all refund details (Complete Name, Bank Name, and Account Number).");
      return;
    }

    setCustomConfirm({
      isOpen: true,
      title: "Confirm Refund Request?",
      message: "Are you sure you want to send this refund request? Please make sure your bank details and any attached payment proofs are correct.",
      confirmText: "Yes, Confirm",
      cancelText: "Cancel",
      onConfirm: () => {
        confirmRefundActionInlineWithProofs(req, name, bank, acct);
        setCustomConfirm(null);
      }
    });
  };

  const confirmRefundActionInlineWithProofs = async (req: PromotionRequest, name: string, bank: string, acct: string) => {
    const check = checkRefundEligibility(req, user?.uid);
    if (!check.eligible) {
      alert(check.reason);
      return;
    }

    try {
      setUpdating(true);
      await updateDoc(doc(db, 'promotionRequests', req.id), {
        refundRequested: true,
        refundRequestedAt: serverTimestamp(),
        refundStatus: 'PENDING',
        refundName: name.trim(),
        refundBankName: bank.trim(),
        refundAccountNumber: acct.trim(),
        refundProofImages: refundProofImages,
        refundProofImage: refundProofImages[0] || "",
        updatedAt: serverTimestamp()
      });

      alert("Refund request submitted successfully! Your paid money will be refunded within 7 working days.");
      setInlineRefundId(null);
      setRefundProofImages([]);
      fetchActivities();
    } catch (err: any) {
      console.error("Refund request error:", err);
      alert(`Failed to file refund request. Please try again. Error: ${err.message || err}`);
    } finally {
      setUpdating(false);
    }
  };

  // Helper triggering the edit modal
  const startEditing = (p: PromotionRequest) => {
    setEditingPromo(p);
    setEditItemLink(p.itemLink || "");
    setEditProofImage(p.paymentProofImage || "");
    
    // Determine manual entry or listing id
    if (p.type !== 'VERIFIED') {
      const isManual = p.targetId === 'MANUAL' || !p.targetId || p.targetId === 'MANUAL_ENTRY';
      setEditIsManualEntry(isManual);
      setEditSelectedListingId(isManual ? 'MANUAL_ENTRY' : p.targetId);
    } else {
      setEditIsManualEntry(false);
      setEditSelectedListingId("");
    }
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                resolve(event.target?.result as string);
                return;
              }

              const maxDim = 830;
              let width = img.width;
              let height = img.height;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }

              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
              resolve(dataUrl);
            };
            img.onerror = () => reject(new Error("Failed to parse image file."));
            img.src = event.target?.result as string;
          };
          reader.onerror = () => reject(new Error("Failed to read image file."));
          reader.readAsDataURL(file);
        });

        setEditProofImage(compressedBase64);
      } catch (err: any) {
        alert(err.message || "Failed to process receipt image.");
      }
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPromo) return;

    if (editingPromo.type !== 'VERIFIED') {
      const isManual = editIsManualEntry || editSelectedListingId === 'MANUAL_ENTRY';
      if (!isManual && !editSelectedListingId) {
        return;
      }
      if (isManual && !editItemLink.trim()) {
        return;
      }
    }

    if (!editProofImage) {
      return;
    }

    try {
      setUpdating(true);
      const isManual = editIsManualEntry || editSelectedListingId === 'MANUAL_ENTRY';
      const targetIdVal = editingPromo.type === 'VERIFIED' ? user.uid : (isManual ? 'MANUAL' : editSelectedListingId);

      const oldRevision = {
        targetId: editingPromo.targetId || "",
        itemLink: editingPromo.itemLink || "",
        updatedAt: editingPromo.updatedAt || editingPromo.createdAt || new Date(),
        status: editingPromo.status || "REJECTED",
        rejectionReason: editingPromo.rejectionReason || "Edited and resubmitted"
      };

      const existingRevisions = Array.isArray((editingPromo as any).revisions) ? (editingPromo as any).revisions : [];
      const cleanedRevisions = existingRevisions.map((rev: any) => {
        const { paymentProofImage, paymentProofImages, refundProofImage, refundProofImages, ...rest } = rev;
        return rest;
      });

      const newRevisions = [...cleanedRevisions, oldRevision];

      const isEditCrypto = editPaymentMethod === 'Cryptocurrency';

      const updateData: any = {
        targetId: targetIdVal,
        paymentMethod: editPaymentMethod,
        txHash: isEditCrypto ? editTxHash.trim() : '',
        paymentProofImage: editProofImage || '',
        status: 'PENDING',
        rejectionReason: null,
        appealMessage: null,
        updatedAt: serverTimestamp(),
        resubmittedAt: serverTimestamp(),
        isResubmitted: true,
        refundRequested: false,
        refundStatus: null,
        revisions: newRevisions
      };

      if (editingPromo.type !== 'VERIFIED') {
        updateData.itemLink = editItemLink;
      }

      await updateDoc(doc(db, 'promotionRequests', editingPromo.id), updateData);

      if (editingPromo.type === 'VERIFIED') {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          verifiedBadgeRequestStatus: 'PENDING'
        });
      } else {
        if (targetIdVal !== 'MANUAL' && targetIdVal) {
          const listingRef = doc(db, 'listings', targetIdVal);
          const listingSnap = await getDoc(listingRef).catch(() => null);
          const listingData = listingSnap?.exists() ? listingSnap.data() : null;
          const now = new Date();
          const hasActivePromotion = (listingData?.isFeatured && listingData?.featuredUntil && (
            typeof listingData.featuredUntil.toDate === 'function' ? listingData.featuredUntil.toDate() > now :
            new Date(listingData.featuredUntil.seconds ? listingData.featuredUntil.seconds * 1000 : listingData.featuredUntil) > now
          )) || (listingData?.isBoosted && listingData?.boostedUntil && (
            typeof listingData.boostedUntil.toDate === 'function' ? listingData.boostedUntil.toDate() > now :
            new Date(listingData.boostedUntil.seconds ? listingData.boostedUntil.seconds * 1000 : listingData.boostedUntil) > now
          ));
          if (!hasActivePromotion) {
            await updateDoc(listingRef, {
              promotionStatus: 'PENDING'
            });
          }
        }
      }

      alert("Your application has been modified and successfully resubmitted to the queue for operator review.");
      setEditingPromo(null);
      fetchActivities();
    } catch (err) {
      console.error("Save edit error:", err);
      alert("Failed to save changes. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  const matchesSearch = (p: any) => {
    if (!searchText.trim()) return true;
    const term = searchText.trim().toLowerCase();
    const appId = (p.applicationId || "").toLowerCase();
    const docId = (p.id || "").toLowerCase();
    const plan = (p.planName || "").toLowerCase();
    const typeStr = (p.type || "").toLowerCase();
    return appId.includes(term) || docId.includes(term) || plan.includes(term) || typeStr.includes(term);
  };

  const fetchActivities = async () => {
    if (!user) return;
    try {
      setLoading(true);

      // 1. Fetch Promotion Requests (Boosted, Featured, Verified via Promotions page)
      const qPromo = query(collection(db, "promotionRequests"), where("userId", "==", user.uid));
      const snapPromo = await getDocs(qPromo);
      let promoData = snapPromo.docs.map(d => ({ ...d.data(), id: d.id } as PromotionRequest));

      // Synchronize promoData real-time with userProfile verification states
      if (userProfile) {
        const hasBadge = !!(userProfile.isPremiumVerified || userProfile.verifiedBadgeType === 'GOLDEN' || userProfile.verifiedBadgeType === 'PREMIUM' || userProfile.isVerified);
        const isApproved = hasBadge;
        const isRejected = !isApproved && !!(userProfile.verifiedBadgeRequestStatus === 'REJECTED' || userProfile.verificationStatus === 'REJECTED');
        const isPending = !isApproved && !isRejected && !!(userProfile.verifiedBadgeRequestStatus === 'PENDING' || userProfile.verificationStatus === 'PENDING' || userProfile.verifiedBadgeRequestStatus === 'RESUME_REQUESTED');
        const isRevoked = !isApproved && !isRejected && !isPending && !!(userProfile.verifiedBadgeRequestStatus === 'REVOKED' || userProfile.verificationStatus === 'REVOKED');

        promoData = promoData.map(p => {
          if (p.type === 'VERIFIED') {
            let status = p.status;
            if (isApproved) status = 'APPROVED';
            else if (isRejected) status = 'REJECTED';
            else if (isRevoked) status = 'REVOKED';
            else if (isPending && p.status !== 'APPROVED') status = 'PENDING';
            else if (!hasBadge && p.status === 'APPROVED') status = 'REVOKED';
            return { ...p, status };
          }
          return p;
        });
      }
      
      // Sort promo by createdAt descending
      promoData.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });
      setPromotions(promoData);
      console.log("DEBUG_PROMOTIONS:", promoData);

      // 2. Fetch Verification Applications
      const qVerify = query(collection(db, "verification_applications"), where("userId", "==", user.uid));
      const snapVerify = await getDocs(qVerify);
      let verifyData = snapVerify.docs.map(d => ({ ...d.data(), id: d.id } as any));

      // Synchronize verifyData real-time with userProfile verification states
      if (userProfile) {
        const hasBadge = !!(userProfile.isPremiumVerified || userProfile.verifiedBadgeType === 'GOLDEN' || userProfile.verifiedBadgeType === 'PREMIUM' || userProfile.isVerified);
        const isApproved = hasBadge;
        const isRejected = !isApproved && !!(userProfile.verifiedBadgeRequestStatus === 'REJECTED' || userProfile.verificationStatus === 'REJECTED');
        const isPending = !isApproved && !isRejected && !!(userProfile.verifiedBadgeRequestStatus === 'PENDING' || userProfile.verificationStatus === 'PENDING' || userProfile.verifiedBadgeRequestStatus === 'RESUME_REQUESTED');
        const isRevoked = !isApproved && !isRejected && !isPending && !!(userProfile.verifiedBadgeRequestStatus === 'REVOKED' || userProfile.verificationStatus === 'REVOKED');

        verifyData = verifyData.map(v => {
          let status = v.status;
          if (isApproved) status = 'APPROVED';
          else if (isRejected) status = 'REJECTED';
          else if (isRevoked) status = 'REVOKED';
          else if (isPending && v.status !== 'APPROVED') status = 'PENDING';
          else if (!hasBadge && v.status === 'APPROVED') status = 'REVOKED';
          return { ...v, status };
        });
      }

      console.log("DEBUG_VERIFICATIONS:", verifyData);
      verifyData.sort((a, b) => {
        const tA = a.createdAt?.toMillis?.() || 0;
        const tB = b.createdAt?.toMillis?.() || 0;
        return tB - tA;
      });
      setVerifications(verifyData);

      // 3. Fetch KYC Identity Verification from kyc_applications
      const kycSnap = await getDoc(doc(db, "kyc_applications", user.uid));
      if (kycSnap.exists()) {
        setKycApp({ ...kycSnap.data(), id: kycSnap.id });
      } else {
        setKycApp(null);
      }

      // 4. Fetch User Listings for Edit Dialog selection (listings + arena_auctions)
      try {
        const qListings = query(collection(db, "listings"), where("ownerId", "==", user.uid));
        const snapListings = await getDocs(qListings);
        const listingsData = snapListings.docs.map(d => ({ ...d.data(), id: d.id } as any));

        try {
          const qArena = query(collection(db, "arena_auctions"), where("sellerId", "==", user.uid));
          const snapArena = await getDocs(qArena);
          const arenaData = snapArena.docs.map(d => {
            const data = d.data();
            return {
              ...data,
              id: d.id,
              ownerId: data.sellerId,
              isFeatured: data.hasFeaturedBadge || data.isFeatured,
              isBoosted: data.hasBoostedBadge || data.isBoosted,
              isArenaAuction: true
            };
          });
          const combined = [...listingsData];
          arenaData.forEach(a => {
            if (!combined.some(c => c.id === a.id)) {
              combined.push(a);
            }
          });
          setUserListings(combined);
        } catch (arenaErr) {
          console.error("Error fetching arena auctions in BadgeActivities:", arenaErr);
          setUserListings(listingsData);
        }
      } catch (err) {
        console.error("Error fetching listings:", err);
      }
    } catch (e) {
      console.error("Error fetching badge activities:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [user, userProfile]);

  useEffect(() => {
    if (promotions.length > 0 && !inlineEditingId && !inlineRefundId) {
      const catType = activeCategory === 'PREMIUM' ? 'VERIFIED' : (activeCategory === 'FEATURED' ? 'FEATURED' : 'BOOST');
      const targetRejected = promotions.find(p => p.type === catType && p.status === 'REJECTED');
      if (targetRejected && !autoOpenedIds.includes(targetRejected.id)) {
        setAutoOpenedIds(prev => [...prev, targetRejected.id]);
        if (isEligibleForRefund(targetRejected)) {
          startInlineRefund(targetRejected);
        }
      }
    }
  }, [promotions, activeCategory, autoOpenedIds, inlineEditingId, inlineRefundId]);

  const handleKycResume = async () => {
    try {
      await updateDoc(doc(db, "kyc_applications", user.uid), {
        status: "RESUME_REQUESTED",
        resumeRequestedAt: new Date().toISOString()
      });

      alert("KYC review resume appeal filed successfully!");
      fetchActivities();
    } catch (err) {
      console.error(err);
      alert("Failed to request review resume.");
    }
  };

  const handleResubmit = async (req: PromotionRequest) => {
    if (req.status === 'REJECTED' || req.verificationStage === 'VERIFIER_DENIED') {
      alert("Rejected applications are closed historical records and cannot be resubmitted. Please submit a fresh application.");
      return;
    }

    const isInvalidStatus = 
      req.status === 'APPROVED' || 
      req.status === 'PENDING' || 
      req.status === 'REVOKED' || 
      (req.status as string) === 'EXPIRED';

    if (isInvalidStatus) {
      alert("You cannot use this option because your application is already Active/Approved, Under Review Pending, Revoked or the age of badge has been expired.");
      return;
    }
    
    if (!isEligibleForEdit(req)) {
      alert("Resubmission is disabled for this application. Please submit a fresh application.");
      return;
    }

    try {
      const oldRevision = {
        targetId: req.targetId || "",
        itemLink: req.itemLink || "",
        updatedAt: req.updatedAt || req.createdAt || new Date(),
        status: req.status || "REJECTED",
        rejectionReason: req.rejectionReason || "Resubmitted with existing proof"
      };

      const existingRevisions = Array.isArray((req as any).revisions) ? (req as any).revisions : [];
      const cleanedRevisions = existingRevisions.map((rev: any) => {
        const { paymentProofImage, paymentProofImages, refundProofImage, refundProofImages, ...rest } = rev;
        return rest;
      });

      const newRevisions = [...cleanedRevisions, oldRevision];

      await updateDoc(doc(db, 'promotionRequests', req.id), {
        status: 'PENDING',
        rejectionReason: null,
        appealMessage: null,
        updatedAt: serverTimestamp(),
        resubmittedAt: serverTimestamp(),
        isResubmitted: true,
        refundRequested: false,
        refundStatus: null,
        revisions: newRevisions
      });

      if (req.type === 'VERIFIED') {
        const userRef = doc(db, 'users', req.targetId);
        await updateDoc(userRef, {
          verifiedBadgeRequestStatus: 'PENDING'
        });
      } else {
        const listingRef = doc(db, 'listings', req.targetId);
        const listingSnap = await getDoc(listingRef).catch(() => null);
        const listingData = listingSnap?.exists() ? listingSnap.data() : null;
        const now = new Date();
        const hasActivePromotion = (listingData?.isFeatured && listingData?.featuredUntil && (
          typeof listingData.featuredUntil.toDate === 'function' ? listingData.featuredUntil.toDate() > now :
          new Date(listingData.featuredUntil.seconds ? listingData.featuredUntil.seconds * 1000 : listingData.featuredUntil) > now
        )) || (listingData?.isBoosted && listingData?.boostedUntil && (
          typeof listingData.boostedUntil.toDate === 'function' ? listingData.boostedUntil.toDate() > now :
          new Date(listingData.boostedUntil.seconds ? listingData.boostedUntil.seconds * 1000 : listingData.boostedUntil) > now
        ));
        if (!hasActivePromotion) {
          await updateDoc(listingRef, {
            promotionStatus: 'PENDING'
          });
        }
      }

      alert("Your request has been successfully resubmitted with your existing payment proof for review.");
      fetchActivities();
    } catch (err) {
      console.error("Resubmit error:", err);
      alert("Failed to resubmit request. Please try again.");
    }
  };

  const isStrictlyEligibleForRefund = (p: PromotionRequest) => {
    return checkRefundEligibility(p, user?.uid).eligible;
  };

  const isEligibleForRefund = (p: PromotionRequest) => {
    return checkRefundEligibility(p, user?.uid).eligible;
  };

  const isEligibleForEdit = (p: PromotionRequest) => {
    // Phase 2B: Rejected applications are CLOSED historical records.
    // Editing and resubmission under the same ID are permanently disabled.
    return false;
  };

  const handleRefundRequest = (req: PromotionRequest) => {
    if (req.status === 'APPROVED') {
      alert("You cannot use this option because your application is already Active/Approved.");
      return;
    }
    if (req.status === 'PENDING') {
      alert("You cannot use this option because your application is already Under Review Pending.");
      return;
    }
    if (req.status === 'REVOKED') {
      alert("You cannot use this option because your application has been Revoked.");
      return;
    }
    if ((req.status as string) === 'EXPIRED') {
      alert("You cannot use this option because the age of your badge has been expired.");
      return;
    }
    const check = checkRefundEligibility(req, user?.uid);
    if (!check.eligible) {
      alert(check.reason);
      return;
    }

    setConfirmingRefundFor(req);
    setRefundName("");
    setRefundBankName("");
    setRefundAccountNumber("");
  };

  const confirmRefundAction = async () => {
    if (!confirmingRefundFor) return;
    const req = confirmingRefundFor;

    const check = checkRefundEligibility(req, user?.uid);
    if (!check.eligible) {
      alert(check.reason);
      setConfirmingRefundFor(null);
      return;
    }

    if (req.status === 'APPROVED') {
      alert("You cannot use this option because your application is already Active/Approved.");
      return;
    }
    if (req.status === 'PENDING') {
      alert("You cannot use this option because your application is already Under Review Pending.");
      return;
    }
    if (req.status === 'REVOKED') {
      return;
    }
    if ((req.status as string) === 'EXPIRED') {
      return;
    }

    if (!refundName.trim() || !refundBankName.trim() || !refundAccountNumber.trim()) {
      alert("Please fill in all refund details (Complete Name, Bank Name, and Account Number).");
      return;
    }

    try {
      await updateDoc(doc(db, 'promotionRequests', req.id), {
        refundRequested: true,
        refundRequestedAt: serverTimestamp(),
        refundStatus: 'PENDING',
        refundName: refundName.trim(),
        refundBankName: refundBankName.trim(),
        refundAccountNumber: refundAccountNumber.trim(),
        updatedAt: serverTimestamp()
      });

      alert("Refund request submitted successfully! Your paid money will be refunded within 7 working days.");
      setConfirmingRefundFor(null);
      fetchActivities();
    } catch (err: any) {
      console.error("Refund request error:", err);
      alert(`Failed to file refund request. Please try again. Error: ${err.message || err}`);
      setConfirmingRefundFor(null);
    }
  };

  const handleSaveEditFor = async (e: React.FormEvent, promo: PromotionRequest) => {
    if (e) e.preventDefault();
    if (!promo) return;

    if (promo.status === 'REJECTED' || promo.verificationStage === 'VERIFIER_DENIED') {
      alert("Rejected applications are closed historical records and cannot be edited. Please submit a fresh application.");
      return;
    }

    const isInvalidStatus = 
      promo.status === 'APPROVED' || 
      promo.status === 'PENDING' || 
      promo.status === 'REVOKED' || 
      (promo.status as string) === 'EXPIRED';

    if (isInvalidStatus) {
      alert("You cannot use this option because your application is already Active/Approved, Under Review Pending, Revoked or the age of badge has been expired.");
      return;
    }
    
    if (!isEligibleForEdit(promo)) {
      alert("Editing is disabled for this application. Please submit a fresh application.");
      return;
    }

    if (promo.type !== 'VERIFIED') {
      const isManual = editIsManualEntry || editSelectedListingId === 'MANUAL_ENTRY';
      if (!isManual && !editSelectedListingId) {
        alert("Please select a listing or enter a link manually.");
        return;
      }
      if (isManual && !editItemLink.trim()) {
        alert("Please enter listing link, title, or details.");
        return;
      }
    }

    if (!editProofImage) {
      alert("Payment proof receipt image is required.");
      return;
    }

    try {
      setUpdating(true);
      const isManual = editIsManualEntry || editSelectedListingId === 'MANUAL_ENTRY';
      const targetIdVal = promo.type === 'VERIFIED' ? user.uid : (isManual ? 'MANUAL' : editSelectedListingId);

      const oldRevision = {
        targetId: promo.targetId || "",
        itemLink: promo.itemLink || "",
        updatedAt: promo.updatedAt || promo.createdAt || new Date(),
        status: promo.status || "REJECTED",
        rejectionReason: promo.rejectionReason || "Edited and resubmitted"
      };

      const existingRevisions = Array.isArray((promo as any).revisions) ? (promo as any).revisions : [];
      const cleanedRevisions = existingRevisions.map((rev: any) => {
        const { paymentProofImage, paymentProofImages, refundProofImage, refundProofImages, ...rest } = rev;
        return rest;
      });

      const newRevisions = [...cleanedRevisions, oldRevision];

      const updateData: any = {
        targetId: targetIdVal,
        paymentProofImage: editProofImage,
        status: 'PENDING',
        rejectionReason: null,
        appealMessage: null,
        updatedAt: serverTimestamp(),
        resubmittedAt: serverTimestamp(),
        isResubmitted: true,
        refundRequested: false,
        refundStatus: null,
        revisions: newRevisions
      };

      if (promo.type !== 'VERIFIED') {
        updateData.itemLink = editItemLink;
      }

      await updateDoc(doc(db, 'promotionRequests', promo.id), updateData);

      if (promo.type === 'VERIFIED') {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          verifiedBadgeRequestStatus: 'PENDING'
        });
      } else {
        if (targetIdVal !== 'MANUAL' && targetIdVal) {
          const listingRef = doc(db, 'listings', targetIdVal);
          const listingSnap = await getDoc(listingRef).catch(() => null);
          const listingData = listingSnap?.exists() ? listingSnap.data() : null;
          const now = new Date();
          const hasActivePromotion = (listingData?.isFeatured && listingData?.featuredUntil && (
            typeof listingData.featuredUntil.toDate === 'function' ? listingData.featuredUntil.toDate() > now :
            new Date(listingData.featuredUntil.seconds ? listingData.featuredUntil.seconds * 1000 : listingData.featuredUntil) > now
          )) || (listingData?.isBoosted && listingData?.boostedUntil && (
            typeof listingData.boostedUntil.toDate === 'function' ? listingData.boostedUntil.toDate() > now :
            new Date(listingData.boostedUntil.seconds ? listingData.boostedUntil.seconds * 1000 : listingData.boostedUntil) > now
          ));
          if (!hasActivePromotion) {
            await updateDoc(listingRef, {
              promotionStatus: 'PENDING'
            });
          }
        }
      }

      alert("Your application has been modified and successfully resubmitted to the queue for operator review.");
      setInlineEditingId(null);
      setEditingPromo(null);
      fetchActivities();
    } catch (err) {
      console.error("Save edit error:", err);
      alert("Failed to save changes. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  const handleKycResubmit = async () => {
    if (!kycApp) return;
    try {
      await updateDoc(doc(db, 'kyc_applications', user.uid), {
        status: 'PENDING',
        rejectionReason: null,
        submittedAt: serverTimestamp()
      });

      alert("Your KYC Identity verification has been resubmitted using your existing document photos.");
      fetchActivities();
    } catch (err) {
      console.error("KYC resubmit error:", err);
      alert("Failed to resubmit KYC. Please try again.");
    }
  };

  const formatDate = (at: any) => {
    if (!at) return "Recent Date";
    let d: Date;
    if (at.toDate) {
      d = at.toDate();
    } else if (at instanceof Date) {
      d = at;
    } else if (typeof at === 'string' || typeof at === 'number') {
      d = new Date(at);
    } else if (at.seconds) {
      d = new Date(at.seconds * 1000);
    } else {
      d = new Date();
    }
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getExpiryDate = (p: PromotionRequest) => {
    if (p.status !== 'APPROVED') return 'N/A (Pending)';
    const startDateRaw = p.approvedAt || p.updatedAt;
    if (!startDateRaw) return 'Unknown';
    let d = new Date();
    if (startDateRaw.toDate) d = startDateRaw.toDate();
    else if (typeof startDateRaw === 'string' || typeof startDateRaw === 'number') d = new Date(startDateRaw);
    else if (startDateRaw.seconds) d = new Date(startDateRaw.seconds * 1000);
    
    d.setDate(d.getDate() + (p.durationDays || 0));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getTimelineEvents = (p: PromotionRequest) => {
    const events: { title: string; date: any; description: string; color: string }[] = [];
    
    // 1. Creation
    if (p.createdAt) {
      events.push({
        title: "Application Submitted",
        date: p.createdAt,
        description: "Initial application received with attached payment proof.",
        color: "bg-blue-500"
      });
    }
    
    // 2. Revisions
    if (Array.isArray((p as any).revisions)) {
      (p as any).revisions.forEach((rev: any, index: number) => {
        events.push({
          title: `Edited & Resubmitted (v${index + 2})`,
          date: rev.updatedAt || rev.uploadedAt || new Date(),
          description: `Application updated by seller. Previous details archived.`,
          color: "bg-amber-500"
        });
      });
    }
    
    // Verifiers status
    if (p.verificationStage === 'SENT_TO_VERIFIERS' && p.updatedAt) {
      events.push({
        title: "Sent to Payment Verifiers",
        date: p.updatedAt,
        description: "Application moved to payment verifiers to verify the proof of transaction.",
        color: "bg-indigo-500"
      });
    }

    if (p.verificationStage === 'PAYMENT_VERIFIED' && p.paymentVerifiedAt) {
      events.push({
        title: "Payment Verified",
        date: p.paymentVerifiedAt,
        description: "Payment proof verified. Back to admin for final approval.",
        color: "bg-teal-500"
      });
    }

    if (p.verificationStage === 'VERIFIER_DENIED' && p.paymentDeniedAt) {
      events.push({
        title: "Payment Denied by Verifier",
        date: p.paymentDeniedAt,
        description: `Payment proof denied. Reason: ${p.paymentDenialReason || "Invalid proof."}`,
        color: "bg-rose-500"
      });
    }

    // 3. Rejected
    if (p.rejectedAt) {
      events.push({
        title: "Application Rejected",
        date: p.rejectedAt,
        description: `Rejected by administrator. Reason: ${p.rejectionReason || "Invalid or insufficient proof."}`,
        color: "bg-red-500"
      });
    } else if (p.status === 'REJECTED' && !p.rejectedAt && p.updatedAt) {
      events.push({
        title: "Application Rejected",
        date: p.updatedAt,
        description: `Rejected by administrator. Reason: ${p.rejectionReason || "Invalid or insufficient proof."}`,
        color: "bg-red-500"
      });
    }
    
    // 4. Approved
    if (p.approvedAt) {
      events.push({
        title: "Badge Approved & Activated",
        date: p.approvedAt,
        description: `Approved by administrator. Duration: ${p.durationDays} Days.`,
        color: "bg-emerald-500"
      });
    } else if (p.status === 'APPROVED' && !p.approvedAt && p.updatedAt) {
      events.push({
        title: "Badge Approved & Activated",
        date: p.updatedAt,
        description: `Approved by administrator. Duration: ${p.durationDays} Days.`,
        color: "bg-emerald-500"
      });
    }
    
    // 5. Revoked
    if (p.status === 'REVOKED' && p.updatedAt) {
      events.push({
        title: "Badge Revoked (Administrative Hold)",
        date: p.updatedAt,
        description: `Revoked due to policy violation. Reason: ${p.revocationReason || "Policy violations."}`,
        color: "bg-rose-600"
      });
    }
    
    // 6. Resumed appeal
    if (p.status === 'RESUME_REQUESTED' && p.updatedAt) {
      events.push({
        title: "Resume Request Appeal Filed",
        date: p.updatedAt,
        description: `User appeal submitted: "${p.appealMessage || "No comments"}"`,
        color: "bg-amber-400"
      });
    }
    
    // 7. Removed
    if (p.status === 'REMOVED' && p.updatedAt) {
      events.push({
        title: "Permanently Removed & Closed",
        date: p.updatedAt,
        description: "Badge permanently terminated and closed by administrator.",
        color: "bg-stone-900"
      });
    }
    
    // 8. Refund Requested
    if (p.refundRequested && p.refundRequestedAt) {
      events.push({
        title: "Refund Claim Request Filed",
        date: p.refundRequestedAt,
        description: `Refund requested to bank: ${p.refundBankName || 'N/A'}, Account: ${p.refundAccountNumber || 'N/A'}`,
        color: "bg-orange-500 animate-pulse"
      });
    }
    
    // 9. Refund Completed
    if (p.refundStatus === "REFUNDED" && p.refundedAt) {
      events.push({
        title: "Refund Completed Successfully",
        date: p.refundedAt,
        description: "Paid amount returned. Receipt proof attached to records.",
        color: "bg-emerald-600"
      });
    } else if (p.refundStatus === "REFUNDED" && !p.refundedAt && p.updatedAt) {
      events.push({
        title: "Refund Completed Successfully",
        date: p.updatedAt,
        description: "Paid amount returned. Receipt proof attached to records.",
        color: "bg-emerald-600"
      });
    }
    
    // 10. Under review (if current status is PENDING/RESUME_REQUESTED)
    if (p.status === 'PENDING') {
      events.push({
        title: "Under Operator Review",
        date: p.updatedAt || p.createdAt || new Date(),
        description: "Review pending. Administrators are currently auditing your files.",
        color: "bg-amber-405 animate-pulse"
      });
    }
    
    // Sort events chronologically based on date
    const parseToMs = (at: any) => {
      if (!at) return Date.now();
      if (at.toMillis) return at.toMillis();
      if (at.seconds) return at.seconds * 1000;
      return new Date(at).getTime();
    };
    
    // Add history logs to events
    if (p.history && Array.isArray(p.history)) {
      p.history.forEach(h => {
        events.push({
          title: h.action,
          date: h.timestamp,
          description: h.note || "No details provided",
          color: "bg-stone-400"
        });
      });
    }
    
    events.sort((a, b) => parseToMs(a.date) - parseToMs(b.date));
    
    return events;
  };

  const renderTimelineAndRevisions = (p: PromotionRequest) => {
    const events = getTimelineEvents(p);
    
    return (
      <div className="space-y-4 mt-4 font-sans">
        {/* Dynamic Status Timeline */}
        <div className="bg-stone-50 border border-stone-150 p-4 rounded-xl space-y-3.5 text-xs">
          <span className="text-xs font-black text-stone-450 uppercase tracking-widest block flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-stone-400" />
            <span>Application Status Timeline History</span>
          </span>
          
          <div className="relative pl-5 space-y-4 border-l border-stone-250 ml-1.5 pt-1">
            {events.map((ev, i) => (
              <div key={i} className="relative group">
                <span className={`absolute -left-[25.5px] top-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ring-2 ring-stone-50 ${ev.color}`} />
                <div>
                  <h5 className="font-extrabold text-stone-900 text-[11.5px] leading-tight flex items-center gap-1.5">
                    {ev.title}
                  </h5>
                  <p className="text-stone-400 text-xs bg-stone-105/50 border border-stone-200/40 rounded px-1.5 py-0.5 w-fit mt-0.5 font-mono">
                    {formatDate(ev.date)}
                  </p>
                  <p className="text-stone-600 text-[10.5px] leading-normal font-medium mt-1">
                    {ev.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revisions History Accordion */}
        {p.revisions && p.revisions.length > 0 && (
          <div className="bg-stone-50/50 border border-stone-150 p-4 rounded-xl space-y-3 text-xs">
            <span className="text-[10.5px] font-black text-stone-550 uppercase tracking-widest block flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-amber-500" />
              <span>📷 Document Changelog &amp; Resubmission History ({p.revisions.length} revisions)</span>
            </span>
            
            <div className="space-y-2.5 pt-1">
              {p.revisions.map((rev, idx) => {
                const isProfile = p.type === 'VERIFIED';
                const revNo = idx + 1;
                
                return (
                  <div key={idx} className="p-3 bg-white border border-stone-200 rounded-xl space-y-2 hover:shadow-xs transition-shadow">
                    <div className="flex justify-between items-center pb-1.5 border-b border-stone-100">
                      <span className="font-black text-xs text-amber-600 uppercase tracking-wide">
                        Revision #{revNo} (Archived v{revNo})
                      </span>
                      <span className="text-xs font-mono text-stone-400">
                        {rev.updatedAt ? formatDate(rev.updatedAt) : "Archived"}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px]">
                      <div>
                        <span className="text-stone-400 block text-xs font-bold uppercase tracking-wider">Historical Status:</span>
                        <span className="font-extrabold uppercase text-[9.5px] text-rose-600 inline-block bg-rose-50 border border-rose-100 rounded px-1.5 py-0.2 mt-0.5">
                          {rev.status || "REJECTED"}
                        </span>
                      </div>
                      
                      {!isProfile && (
                        <div>
                          <span className="text-stone-400 block text-xs font-bold uppercase tracking-wider font-sans">Assigned Listing (Then):</span>
                          {rev.itemLink ? (
                            <a href={rev.itemLink} target="_blank" rel="noopener noreferrer" className="text-amber-655 hover:underline font-extrabold flex items-center gap-0.5 mt-0.5">
                              <ExternalLink className="w-3 h-3" /> View Listing URL
                            </a>
                          ) : (
                            <span className="text-stone-400 font-semibold italic">Manual/Ref {rev.targetId || "N/A"}</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {rev.rejectionReason && (
                      <div className="p-2 bg-red-50 border border-red-200 rounded text-[10.5px] text-red-700 font-medium">
                        <span className="font-black uppercase tracking-widest block text-xs text-red-600 mb-1 border-b border-red-200 pb-1">Rejection Feedback:</span>
                        <p className="font-black text-xs text-red-800 bg-red-100/50 p-2 rounded-lg border-l-4 border-red-500 shadow-sm mt-1">"{rev.rejectionReason}"</p>
                      </div>
                    )}
                    
                    {rev.paymentProofImage && (
                      <div className="pt-1.5 flex items-center justify-between border-t border-stone-100">
                        <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">Payment Proof:</span>
                        <button
                          type="button"
                          onClick={() => setLightboxImage(rev.paymentProofImage!)}
                          className="flex items-center gap-1.5 py-1 px-2.5 bg-stone-50 hover:bg-stone-100 border border-stone-200/50 rounded-lg text-stone-700 text-xs font-bold cursor-pointer transition-all shrink-0"
                        >
                          <ImageIcon className="w-3 contributors h-3" />
                          <span>View Receipt 📷</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOfficialLedger = (p: PromotionRequest, badgeName: string) => {
    const isProfileBadge = p.type === 'VERIFIED';
    
    // 1. Tracking Id
    const trackingId = p.applicationId || `APP-${p.type}-${p.id.substring(0, 6).toUpperCase()}`;

    // 2. Requested Period
    const requestedPeriod = p.planName || (p.durationDays ? `${p.durationDays} Days` : "N/A");

    // 3. Payment paid
    const paymentText = p.amount && p.amount > 0 ? `Rs. ${p.amount.toLocaleString()} PKR` : "Free Tier / Waived";

    // 4. Application Received
    const receivedTime = p.createdAt ? formatDate(p.createdAt) : "Recent";

    // 5. Application Status
    const mapStatusText = (status: string) => {
      const norm = (status || 'PENDING').toUpperCase();
      switch (norm) {
        case 'PENDING': return 'Review Pending (Under Operator Review)';
        case 'APPROVED': return 'Approved & Activated (In Good Standing)';
        case 'REJECTED': return 'Rejected';
        case 'REVOKED': return 'Revoked (Administrative Hold)';
        case 'RESUME_REQUESTED': return 'Appeal Filed / Resumed Request Pending';
        case 'REMOVED': return 'Removed (Violated Rules/Policies)';
        default: return status;
      }
    };
    const statusText = mapStatusText(p.status);

    // 6. Action Date/Time
    const actionTime = p.approvedAt || p.rejectedAt || p.updatedAt;
    const actionTimeText = actionTime ? formatDate(actionTime) : "Processed Recently";

    // 7. Expiry Date
    const expiryDateText = getExpiryDate(p);

    return (
      <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 space-y-3.5 text-xs font-sans mt-3 select-none">
        <h4 className="text-xs font-black text-stone-900 uppercase tracking-widest border-b border-stone-200/60 pb-2 flex items-center gap-1.5 leading-none">
          <FileText className="w-3.5 h-3.5 text-amber-500" />
          <span>Application Assessment Record</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
          {/* Tracking */}
          <div className="flex flex-col gap-0.5">
            <span className="text-stone-400 font-bold uppercase text-xs tracking-wider font-sans">1. Application Tracking ID</span>
            <span className="font-mono font-black text-stone-900 text-xs bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200/30 w-fit">
              {trackingId}
            </span>
          </div>

          {/* Badge name */}
          <div className="flex flex-col gap-0.5">
            <span className="text-stone-400 font-bold uppercase text-xs tracking-wider font-sans">2. Badge Name</span>
            <span className="font-extrabold text-stone-950 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-500 fill-blue-50" />
              {badgeName}
            </span>
          </div>

          {/* Period */}
          <div className="flex flex-col gap-0.5">
            <span className="text-stone-400 font-bold uppercase text-xs tracking-wider font-sans">3. Requested Period</span>
            <span className="font-extrabold text-stone-800 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded w-fit">
              {requestedPeriod}
            </span>
          </div>

          {/* Payment */}
          <div className="flex flex-col gap-0.5">
            <span className="text-stone-400 font-bold uppercase text-xs tracking-wider font-sans">4. Payment Paid</span>
            <span className="font-extrabold text-stone-800 bg-emerald-50 border border-emerald-200/50 px-2 py-0.5 rounded w-fit">
              {paymentText}
            </span>
          </div>

          {/* Received */}
          <div className="flex flex-col gap-0.5">
            <span className="text-stone-400 font-bold uppercase text-xs tracking-wider font-sans">5. Application Received</span>
            <span className="font-bold text-stone-700">{receivedTime}</span>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-0.5">
            <span className="text-stone-400 font-bold uppercase text-xs tracking-wider font-sans">6. Application Status</span>
            <span className={`font-black uppercase text-xs ${
              p.status === 'APPROVED' ? 'text-emerald-600' :
              p.status === 'PENDING' ? 'text-amber-500' :
              p.status === 'REJECTED' ? 'text-red-650' :
              p.status === 'REVOKED' || p.status === 'REMOVED' ? 'text-rose-700' : 'text-stone-400'
            }`}>
              {statusText}
            </span>
          </div>

          {/* Last Action Date */}
          <div className="flex flex-col gap-0.5">
            <span className="text-stone-400 font-bold uppercase text-xs tracking-wider font-sans">7. Application Action Date &amp; Time</span>
            <span className="font-bold text-stone-700">{actionTimeText}</span>
          </div>

          {/* Expiry Date */}
          <div className="flex flex-col gap-0.5">
            <span className="text-stone-400 font-bold uppercase text-xs tracking-wider font-sans">8. Expiry Date</span>
            <span className={`px-2 py-0.5 rounded w-fit font-black ${
              p.status === 'APPROVED' ? 'bg-amber-100 text-amber-800 border border-amber-200/55' : 'bg-stone-150 text-stone-550 border border-stone-200'
            }`}>
              {expiryDateText}
            </span>
          </div>

          {/* Assigned Campaign Feed (Featured/Boosted only) */}
          {!isProfileBadge && (
            <div className="flex flex-col gap-0.5 sm:col-span-2 border-t border-stone-200/40 pt-2.5">
              <span className="text-stone-400 font-bold uppercase text-xs tracking-wider block mb-0.5 font-sans">9. Assigned Campaign Feed</span>
              {p.itemLink ? (
                <a
                  href={p.itemLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-600 hover:text-amber-700 font-extrabold text-xs underline flex items-center gap-1 w-fit"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Attached Active Campaign Listing</span>
                </a>
              ) : p.targetId && p.targetId !== 'MANUAL' && p.targetId !== 'MANUAL_ENTRY' ? (
                <span className="text-amber-600 hover:text-amber-700 font-extrabold text-xs underline flex items-center gap-1 w-fit cursor-pointer" onClick={() => window.open(`/listings/${p.targetId}`, '_blank')}>
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>View Ad Listing (Ref: {p.targetId})</span>
                </span>
              ) : (
                <span className="text-stone-400 font-medium italic">No active listing is currently attached to this ad campaign feed.</span>
              )}
            </div>
          )}

          {/* Receipt openable */}
          {p.paymentProofImage && (
            <div className={`flex flex-col gap-1 ${isProfileBadge ? 'sm:col-span-2' : ''} border-t border-stone-200/40 pt-2.5`}>
              <span className="text-stone-400 font-bold uppercase text-xs tracking-wider block font-sans">10. Bank Receipt Copy (Openable)</span>
              <button
                type="button"
                onClick={() => setLightboxImage(p.paymentProofImage!)}
                className="flex items-center gap-2 p-1.5 bg-white hover:bg-stone-50 border border-stone-200/70 rounded-xl transition-all text-left group w-fit cursor-pointer mt-0.5 select-none"
              >
                <img
                  src={p.paymentProofImage}
                  alt="Bank payment receipt"
                  className="max-h-8 w-8 object-cover rounded border border-stone-200 shrink-0 select-none cursor-pointer"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <span className="block font-black uppercase text-[8.5px] text-stone-900 leading-tight group-hover:underline">📷 View Official Receipt / proof</span>
                  <span className="text-[7.5px] text-stone-400 font-mono">Expand official transaction receipt copy</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Strict Term Policy Callout */}
        <div className="mt-4 pt-3.5 border-t border-dashed border-stone-200/90 text-xs leading-relaxed text-stone-550">
          <div className="flex items-start gap-2 bg-stone-100/70 p-3 rounded-xl border border-stone-200/40">
            <span className="text-amber-600 font-black text-xs shrink-0 pt-0.5" aria-hidden="true">⚠️</span>
            <div>
              <span className="font-extrabold text-stone-800 uppercase text-xs tracking-widest block mb-1">Strict Term & Non-Reassignability Policy</span>
              <p className="font-medium text-stone-600">
                <strong className="text-stone-900">Term Limit:</strong> This badge or promotion is active for the precise approved duration with absolutely <strong className="text-stone-900">no automatic extension, no auto-renewal, and no rollover features</strong>. Upon reaching the exact expiration milestone, the badge will automatically sunset, and a fresh application with new deposit proofs must be lodged.
              </p>
              <p className="font-medium text-stone-600 mt-1">
                <strong className="text-stone-900">Transfer Hold:</strong> Respective badges and slots are tied strictly to this profile entity and <strong className="text-stone-900">cannot be transferred, reassigned, or activated</strong> on alternative listing campaigns or third-party accounts.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStatusBadge = (status: string, createdAt?: any, durationDays?: number) => {
    const norm = (status || 'PENDING').toUpperCase();
    
    if (norm === 'APPROVED' && createdAt && durationDays) {
      const createdMs = createdAt.toMillis ? createdAt.toMillis() : (typeof createdAt === 'string' ? new Date(createdAt).getTime() : Date.now());
      const expiresAt = createdMs + durationDays * 24 * 60 * 60 * 1000;
      if (Date.now() > expiresAt) {
        return (
          <span className="bg-stone-100 text-stone-400 border-stone-200 border px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3" /> Expired
          </span>
        );
      }
      return (
        <span className="bg-emerald-50 text-emerald-600 border-emerald-200 border px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1">
          <CheckCircle className="w-3 h-3 animate-pulse" /> Active Verified
        </span>
      );
    }
    
    if (norm === 'APPROVED' || norm === 'ACCEPTED') {
      return (
        <span className="bg-emerald-50 text-emerald-600 border-emerald-200 border px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1">
          <CheckCircle className="w-3 h-3" /> Accepted
        </span>
      );
    }

    if (norm === 'PENDING') {
      return (
        <span className="bg-amber-50 text-amber-600 border-amber-200 border px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1">
          <Clock className="w-3 h-3 animate-pulse" /> Review Pending
        </span>
      );
    }

    if (norm === 'REJECTED') {
      return (
        <span className="bg-red-50 text-red-600 border-red-200 border px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1">
          <XCircle className="w-3 h-3" /> Rejected
        </span>
      );
    }

    if (norm === 'REVOKED') {
      return (
        <span className="bg-red-50 text-red-700 border-red-300 border px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1">
          <ShieldAlert className="w-3 h-3" /> Revoked
        </span>
      );
    }

    if (norm === 'RESUME_REQUESTED') {
      return (
        <span className="bg-blue-50 text-blue-600 border-blue-200 border px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1">
          <Clock className="w-3 h-3" /> Appeal Submitted
        </span>
      );
    }

    return (
      <span className="bg-stone-100 text-stone-600 border-stone-200 border px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider">
        {status}
      </span>
    );
  };

  const CATEGORIES = [
    {
      id: 'PREMIUM' as ActiveBadgeCategory,
      title: 'Premium Seller Badge',
      shortLabel: 'Premium Seller',
      selectedClass: 'border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 scale-[1.02] md:scale-[1.02] font-sans',
      defaultClass: 'border-emerald-200 bg-emerald-50/40 text-emerald-800 hover:border-emerald-500 hover:bg-emerald-50 hover:scale-[1.01]',
      iconClassSelected: 'bg-emerald-700 text-white',
      iconClassDefault: 'bg-emerald-100/80 text-emerald-700',
      icon: ShieldCheck,
    },
    {
      id: 'FEATURED' as ActiveBadgeCategory,
      title: 'Featured badge',
      shortLabel: 'Featured badge',
      selectedClass: 'border-amber-500 bg-amber-500 text-stone-950 shadow-lg shadow-amber-500/20 scale-[1.02] md:scale-[1.02] font-sans',
      defaultClass: 'border-amber-200 bg-amber-50/40 text-amber-800 hover:border-amber-500 hover:bg-amber-50 hover:scale-[1.01]',
      iconClassSelected: 'bg-amber-600/40 text-stone-950',
      iconClassDefault: 'bg-amber-100/80 text-amber-700',
      icon: Star,
    },
    {
      id: 'BOOST' as ActiveBadgeCategory,
      title: 'Boosted ads badge',
      shortLabel: 'Boosted ads badge',
      selectedClass: 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-500/20 scale-[1.02] md:scale-[1.02] font-sans',
      defaultClass: 'border-blue-200 bg-blue-50/40 text-blue-800 hover:border-blue-500 hover:bg-blue-50 hover:scale-[1.01]',
      iconClassSelected: 'bg-blue-700 text-white',
      iconClassDefault: 'bg-blue-100/80 text-blue-700',
      icon: Zap,
    },
  ];

  const currentCategory = CATEGORIES.find(c => c.id === activeCategory) || CATEGORIES[0];

  return (
    <div className="space-y-4 sm:space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-white p-3 sm:p-6 md:p-10 rounded-2xl sm:rounded-[2.5rem] border border-stone-100 shadow-sm relative overflow-hidden">
        
        {/* Categories Tab Bar */}
        {!lockedCategory && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 sm:mb-8">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setInlineEditingId(null);
                    setInlineRefundId(null);
                    setSelectedPlan(null);
                    setProofImage('');
                    setItemLink('');
                    setSelectedListingId('');
                    setSuccess(false);
                    setSubmittedAppId('');
                    setAgreeToTerms(false);
                    setShowApplyForm(false);
                    const catType = cat.id === 'PREMIUM' ? 'VERIFIED' : (cat.id === 'FEATURED' ? 'FEATURED' : 'BOOST');
                    const targetRejected = promotions.find(p => p.type === catType && p.status === 'REJECTED');
                    if (targetRejected) {
                      if (isEligibleForRefund(targetRejected)) {
                        startInlineRefund(targetRejected);
                      }
                    }
                  }}
                  className={`p-3 sm:p-4 rounded-[20px] sm:rounded-2xl border-2 text-left transition-all relative flex flex-row md:flex-col justify-between items-center md:items-start md:h-28 ${
                    isSelected 
                      ? cat.selectedClass 
                      : cat.defaultClass
                  }`}
                >
                  <div className="flex justify-between items-center md:items-start md:w-full gap-3 md:gap-0">
                    <span className={`p-2 rounded-xl transition-colors ${
                      isSelected ? cat.iconClassSelected : cat.iconClassDefault
                    }`}>
                      <Icon className="w-5 h-5" />
                    </span>
                    
                    <div className="md:mt-2 block md:hidden flex-1 text-left">
                      <span className="text-xs font-black uppercase tracking-wider block opacity-70 leading-none mb-0.5">Category Block</span>
                      <span className="text-xs font-black line-clamp-1 truncate">{cat.shortLabel}</span>
                    </div>

                    {isSelected && (
                      <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-current animate-ping" />
                    )}
                  </div>
                  <div className="mt-2 hidden md:block">
                    <span className="text-xs font-black uppercase tracking-wider block opacity-70">Category Block</span>
                    <span className="text-xs font-black line-clamp-1 truncate">{cat.shortLabel}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center">
            <span className="text-stone-400 font-black uppercase tracking-widest text-xs animate-pulse flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 animate-spin text-amber-500" /> Fetching Application Status Logs...
            </span>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Current Active Category Title Header & search bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-150/80">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-stone-900 rounded-xl text-white">
                  <currentCategory.icon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-stone-400 block">Currently Viewing</span>
                  <h3 className="font-extrabold text-xs sm:text-sm md:text-base text-stone-800 uppercase tracking-tight leading-snug">
                    {currentCategory.title}
                  </h3>
                </div>
              </div>
              
              {/* Reference ID trace field */}
              <div className="relative max-w-xs w-full">
                <input 
                  type="text" 
                  placeholder="Search Application Number..." 
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full px-4.5 py-2.5 border border-stone-200 bg-white rounded-xl text-xs font-mono font-bold tracking-wide focus:outline-none focus:ring-1 focus:ring-stone-500 focus:border-stone-500 pr-9 transition-all placeholder:font-sans placeholder:text-stone-400"
                />
                {searchText ? (
                  <button onClick={() => setSearchText("")} className="absolute right-3 top-3.5 text-stone-400 hover:text-stone-700 text-xs font-black">
                     ✕
                  </button>
                ) : (
                  <span className="absolute right-3 top-3 text-stone-350 text-xs">🔍</span>
                )}
              </div>
            </div>

            {/* CATEGORY 1 CONTENT: Premium & Verified Seller Badges */}
            {activeCategory === 'PREMIUM' && (
              <div className="space-y-5 animate-in fade-in duration-350">
                {(!userProfile?.isPremiumVerified && userProfile?.verifiedBadgeType !== 'GOLDEN' && userProfile?.verifiedBadgeType !== 'PREMIUM' && promotions.filter(p => p.type === 'VERIFIED').length === 0) ? (
                  renderInlineApplyForm()
                ) : (
                  <>
                    {!(userProfile?.isPremiumVerified || userProfile?.verifiedBadgeType === 'GOLDEN' || userProfile?.verifiedBadgeType === 'PREMIUM') && promotions.filter(p => p.type === 'VERIFIED').length > 0 && (
                      <div className="flex justify-between items-center bg-stone-50 p-4 rounded-xl border border-stone-100/80">
                        <span className="text-xs uppercase font-black text-stone-400">Applications Archive List</span>
                        <button
                          onClick={() => {
                            if (!showApplyForm) {
                              const existingPromos = promotions.filter(p => p.type === 'VERIFIED');
                              const blockingPromo = existingPromos.find(p => p.status === 'APPROVED' || p.status === 'PENDING' || p.status === 'REVOKED');
                              if (blockingPromo) {
                                const statusStr = blockingPromo.status === 'APPROVED' ? 'active/approved' : (blockingPromo.status === 'PENDING' ? 'under review pending' : 'revoked');
                                alert(`Your application status is ${statusStr} so you can not submit new application until existing application is decided.`);
                                return;
                              }
                            }
                            setShowApplyForm(!showApplyForm);
                            setSuccess(false);
                            setSelectedPlan(null);
                            setProofImage('');
                            setAgreeToTerms(false);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2 px-4 text-xs font-black uppercase tracking-widest transition-all active:scale-95"
                        >
                          {showApplyForm ? "✕ Close Form" : "✨ Submit New Verification Request"}
                        </button>
                      </div>
                    )}
                    {showApplyForm && renderInlineApplyForm()}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* (B) Promotion request - Verified Premium Merchant */}
                    {(promotions.filter(p => p.type === 'VERIFIED').length > 0
                      ? promotions.filter(p => p.type === 'VERIFIED')
                      : [
                          {
                            id: "simulated-premium-badge",
                            userId: user?.uid || "user123",
                            targetId: user?.uid || "user123",
                            type: "VERIFIED",
                            planName: "12 Months (Golden Elite Pak-Trader)",
                            amount: 14999,
                            durationDays: 365,
                            paymentProofImage: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=400",
                            status: (() => {
                              const hasPremiumBadge = !!(userProfile?.isPremiumVerified || userProfile?.verifiedBadgeType === 'GOLDEN' || userProfile?.verifiedBadgeType === 'PREMIUM');
                              if (hasPremiumBadge) {
                                return 'APPROVED';
                              }
                              if (userProfile?.verifiedBadgeRequestStatus === 'REJECTED' || userProfile?.verificationStatus === 'REJECTED') {
                                return 'REJECTED';
                              }
                              if (userProfile?.verifiedBadgeRequestStatus === 'REVOKED' || userProfile?.verifiedBadgeRequestStatus === 'NONE' || userProfile?.verifiedBadgeRequestStatus === 'REMOVED' || userProfile?.verificationStatus === 'NONE' || userProfile?.verificationStatus === 'REVOKED') {
                                return 'REVOKED';
                              }
                              return 'PENDING';
                            })(),
                            createdAt: { seconds: Math.floor(Date.now() / 1000 - 3600 * 24 * 2) },
                            updatedAt: { seconds: Math.floor(Date.now() / 1000) },
                            applicationId: "APP-PREM-489201",
                            itemLink: "",
                            history: [
                              { action: "Application Created", timestamp: new Date(Date.now() - 3600 * 24 * 2 * 1000).toISOString(), note: "Vendor applied for Premium Seller status" },
                              { action: "Payment Deposited", timestamp: new Date(Date.now() - 3600 * 24 * 2 * 1000).toISOString(), note: "Rs. 14,999 PKR proof attached" },
                              { action: "Security Checks Initiated", timestamp: new Date(Date.now() - 3600 * 24 * 1000).toISOString(), note: "ID & Bank transfer matching review under process" },
                              ...((userProfile?.isPremiumVerified || userProfile?.verifiedBadgeType === 'GOLDEN' || userProfile?.verifiedBadgeType === 'PREMIUM') ? [
                                { action: "Application Approved", timestamp: new Date(Date.now()).toISOString(), note: "Premium Seller Badge granted by Administration" }
                              ] : [])
                            ],
                            revisions: [
                              {
                                updatedAt: new Date(Date.now() - 3600 * 24 * 3 * 1000).toISOString(),
                                status: "REJECTED",
                                rejectionReason: "Initial bank reference code was blurry. Resubmitted with high-resolution deposit slip."
                              }
                            ]
                          }
                        ]
                    ).filter(matchesSearch).map(p => (
                      <div key={p.id} className="bg-gradient-to-br from-white to-stone-50/50 border border-stone-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                        <div className="space-y-4">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="bg-emerald-100 text-emerald-800 text-xs font-black uppercase px-2 py-0.5 rounded-full tracking-wider mb-1 inline-block">
                                Premium Seller Badge Application
                              </span>
                              <span className="text-stone-900 font-black text-base block uppercase tracking-tight flex items-center gap-1">
                                🌟 {p.planName || (p.durationDays ? `${p.durationDays} Days` : "Premium Badge")}
                              </span>
                              <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-widest text-emerald-800">Status: {p.status}</span>
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[9.5px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded border border-stone-200/60 w-fit">
                                <span className="font-black text-stone-400 uppercase">APP #</span>
                                <span className="font-black">{p.applicationId || `APP-PREM-${p.id.substring(0, 6).toUpperCase()}`}</span>
                              </div>
                            </div>
                            {renderStatusBadge(p.status, p.createdAt, p.durationDays)}
                          </div>

                          {/* Unified Official Ledger details */}
                          {renderOfficialLedger(p, "Premium Seller Badge")}

                          {p.status !== 'REJECTED' && p.verificationStage !== 'VERIFIER_DENIED' && (
                            <button
                              type="button"
                              onClick={() => setSelectedAppDetails(p)}
                              className="w-full bg-stone-100 hover:bg-stone-200 text-stone-900 text-xs font-black uppercase tracking-wider py-2.5 rounded-xl transition border border-stone-200 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                            >
                              <FileText className="w-3.5 h-3.5 text-stone-400" />
                              <span>View Full Application Form</span>
                            </button>
                          )}

                          {/* Warnings or Rejection Reason */}
                          {p.status === 'REVOKED' && !p.appealMessage && (
                            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
                              <span className="font-black uppercase text-xs block text-red-500 mb-1">Revocation feedback:</span>
                              {p.revocationReason || "Terms of service violation detected."}
                              <button
                                onClick={() => openAppealForm(p)}
                                className="w-full mt-2.5 bg-red-100 hover:bg-red-200 text-red-800 font-extrabold uppercase text-[9.5px] tracking-widest py-1.5 rounded-lg transition-colors"
                              >
                                Submit appeal
                              </button>
                            </div>
                          )}

                          {p.status === 'REMOVED' && !p.appealMessage && (
                            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800">
                              <span className="font-black uppercase text-xs block text-rose-500 mb-1">Removal feedback:</span>
                              "The badge was administratively force-removed due to violation of community policies."
                              <button
                                onClick={() => openAppealForm(p)}
                                className="w-full mt-2.5 bg-rose-100 hover:bg-rose-200 text-rose-800 font-extrabold uppercase text-[9.5px] tracking-widest py-2 rounded-lg transition-all"
                              >
                                Submit appeal
                              </button>
                            </div>
                          )}

                          {p.appealMessage && (
                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 italic">
                              <span className="font-extrabold block uppercase text-xs tracking-wider text-blue-500 not-italic mb-1">Submitted appeal letter:</span>
                              "{p.appealMessage}"
                            </div>
                          )}

                                                                              {(['REJECTED', 'REVOKED', 'REMOVED'].includes(p.status) || p.verificationStage === 'VERIFIER_DENIED') && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-3">
                              {(p.status === 'REJECTED' || p.verificationStage === 'VERIFIER_DENIED') && (
                                <div>
                                  <span className="font-black uppercase tracking-widest block text-xs text-red-600 mb-2 font-sans border-b border-red-200 pb-1">Reason for Rejection:</span>
                                  <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 md:p-7 shadow-lg mt-3 transform transition hover:scale-[1.01]">
                                    <span className="block text-xs font-black uppercase text-red-400 tracking-widest mb-2">Internal Verification Denial Note:</span>
                                    <p className="font-black text-lg md:text-xl text-red-900 leading-tight italic">"{p.verificationStage === 'VERIFIER_DENIED' ? p.paymentDenialReason : (p.rejectionReason || 'Payment proof was invalid or insufficient.')}"</p>
                                  </div>
                                </div>
                              )}

                              {p.refundStatus === "REFUNDED" ? (
                                <div className="p-3 bg-emerald-900 border border-emerald-800 rounded-xl text-emerald-50 font-sans space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-300">
                                    <DollarSign className="w-4 h-4 animate-pulse" />
                                    <span>Refunded</span>
                                  </div>
                                  {p.refundProofImage && (
                                    <div className="space-y-1.5 pt-1">
                                      <span className="font-black uppercase text-xs tracking-widest text-emerald-300 block font-sans">📷 View Refund Receipt Verification:</span>
                                      <button
                                        type="button"
                                        onClick={() => setLightboxImage(p.refundProofImage)}
                                        className="flex items-center gap-2 p-1.5 bg-emerald-950 hover:bg-emerald-900/60 border border-emerald-805/80 rounded-lg text-emerald-300 text-xs w-full transition-all text-left group"
                                      >
                                        <img 
                                          src={p.refundProofImage} 
                                          alt="Official Refund Receipt" 
                                          className="max-h-12 w-12 object-cover rounded border border-emerald-800/80 shrink-0 select-none cursor-pointer"
                                          referrerPolicy="no-referrer"
                                        />
                                        <div>
                                          <span className="block font-black uppercase text-xs text-emerald-200">Official Refund Receipt copy</span>
                                          <span className="text-xs text-emerald-450 group-hover:underline">Click to enlarge / zoom proof</span>
                                        </div>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2.5 pt-1 font-sans">
                                  {p.refundRequested && (
                                    <div className="p-3 bg-stone-900 border border-stone-850 rounded-xl text-stone-200 font-sans">
                                      <div className="flex items-center gap-2 mb-1">
                                        <DollarSign className="w-4 h-4 text-emerald-400" />
                                        <span className="font-black uppercase text-xs tracking-widest text-emerald-400">
                                          {(p.refundStatus === "REJECTED" || p.refundStatus === "REJECTED_FINAL" || p.refundStatus === "VERIFIER_REJECTED")
                                            ? "Refund Rejected"
                                            : "Refund Processing"}
                                        </span>
                                      </div>
                                      <p className="font-medium text-xs leading-relaxed">
                                        {(p.refundStatus === "REJECTED" || p.refundStatus === "REJECTED_FINAL" || p.refundStatus === "VERIFIER_REJECTED")
                                          ? `Your refund request was rejected. Reason: "${p.verifierRejectReason || 'Payment verifier rejected bank accounts details'}"`
                                          : `Your 95% refund of ${formatPrice(p.refundCalculatedAmount || calculateRefundAmounts(p.receivedAmount).refundAmount, p.currency)} (5% platform retention: ${formatPrice(p.refundRetentionAmount || calculateRefundAmounts(p.receivedAmount).retentionAmount, p.currency)}) will be refunded within 7 working days.`}
                                      </p>
                                      <span className="text-xs text-stone-400 font-semibold block mt-1">
                                        Estimated completion date: {p.refundRequestedAt ? formatDate(new Date(p.refundRequestedAt.seconds ? p.refundRequestedAt.seconds * 1000 + 7 * 24 * 60 * 60 * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000)) : formatDate(Date.now() + 7 * 24 * 60 * 60 * 1000)}
                                      </span>
                                      <div className="mt-2.5 pt-2 border-t border-stone-800 text-[10.5px] text-stone-300 flex flex-col gap-0.5">
                                        <span className="font-extrabold uppercase text-xs tracking-wider text-amber-400">Request received for refund:</span>
                                        <span className="font-mono">{p.refundRequestedAt ? formatDate(p.refundRequestedAt) : formatDate(new Date())}</span>
                                      </div>
                                    </div>
                                  )}

                                  {(p.status === 'REJECTED' || p.verificationStage === 'VERIFIER_DENIED') && (
                                    <div className="space-y-3 pt-1">
                                      {/* Dual core buttons grid */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedAppDetails(p)}
                                          className="w-full bg-white hover:bg-stone-50 text-stone-900 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl transition border border-stone-200 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                                        >
                                          <FileText className="w-3.5 h-3.5 text-stone-400" />
                                          <span>View Application Form</span>
                                        </button>

                                        {p.refundStatus === "REFUNDED" ? (
                                          <div className="w-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5">
                                            <DollarSign className="w-4 h-4 text-emerald-600" />
                                            <span>Refunded Successfully</span>
                                          </div>
                                        ) : p.refundRequested && inlineRefundId !== p.id ? (
                                          <div className="w-full bg-stone-100 border border-stone-200 text-stone-700 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl text-center flex items-center justify-center gap-1">
                                            <span>⏳ Refund Processing</span>
                                          </div>
                                        ) : (!p.refundRequested && p.refundStatus !== "REFUNDED" && isEligibleForRefund(p)) ? (
                                          <div className="flex flex-col gap-1 w-full text-center">
                                            <button
                                              type="button"
                                              onClick={() => startInlineRefund(p)}
                                              className={`w-full font-black uppercase text-xs tracking-wider py-2.5 px-3 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-sans ${
                                                inlineRefundId === p.id
                                                  ? 'bg-stone-800 text-white hover:bg-stone-700 border border-stone-700'
                                                  : 'bg-red-600 hover:bg-red-700 text-white border border-red-500 hover:shadow-md'
                                              }`}
                                            >
                                              <DollarSign className="w-3.5 h-3.5" />
                                              <span>{inlineRefundId === p.id ? 'Close Refund Form' : 'Request Refund Claim'}</span>
                                            </button>
                                            <RefundCountdown promo={p} />
                                          </div>
                                        ) : (
                                          <div className="flex flex-col gap-1 w-full text-center">
                                            {p.amount && p.amount > 0 ? (
                                              p.status === 'REJECTED' ? (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const check = checkRefundEligibility(p, user?.uid);
                                                    alert(check.reason);
                                                  }}
                                                  className="w-full bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                                                >
                                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                                  <span>Non-Refundable / Ineligible</span>
                                                </button>
                                              ) : (
                                                <div className="w-full bg-stone-50 border border-stone-200 text-stone-400 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl text-center">
                                                  <span>Paid Package</span>
                                                </div>
                                              )
                                            ) : (
                                              <div className="w-full bg-stone-50 border border-stone-200 text-stone-400 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl text-center">
                                                <span>Free Package / N/A</span>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Rejected Application Closed Status */}
                                      {p.status === 'REJECTED' && (
                                        <div className="border-t border-stone-200/80 pt-3 mt-2 space-y-2 text-left">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] uppercase font-black tracking-wider text-rose-600 flex items-center gap-1.5">
                                              <Lock className="w-3.5 h-3.5 text-rose-500" /> Application Closed (Historical Record)
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setShowApplyForm(true);
                                                setSuccess(false);
                                                setSelectedPlan(null);
                                                setProofImage('');
                                                setItemLink('');
                                                setSelectedListingId('');
                                                setAgreeToTerms(false);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                              }}
                                              className="text-[11px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                            >
                                              ✨ Apply Fresh
                                            </button>
                                          </div>
                                          {p.rejectionReason && (
                                            <div className="text-xs text-stone-700 bg-rose-50/60 p-2.5 rounded-xl border border-rose-100/80">
                                              <span className="font-bold text-rose-900">Rejection Note: </span>
                                              {p.rejectionReason}
                                            </div>
                                          )}
                                          {p.rejectionCategory && (
                                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                                              <span>Category:</span>
                                              <span className={`px-2 py-0.5 rounded text-white ${p.rejectionCategory === 'FRAUD' ? 'bg-red-600' : (p.rejectionCategory === 'POLICY_VIOLATION' || p.rejectionCategory === 'REFUNDABLE_REJECTION' ? 'bg-amber-600' : 'bg-stone-600')}`}>
                                                {p.rejectionCategory.replace('_', ' ')}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* INLINE REFUND FORM */}
                                      {inlineRefundId === p.id && (
                                        <div className="mt-4 p-5 bg-red-50 border-2 border-red-200 rounded-2xl space-y-4 shadow-sm animate-in slide-in-from-top-2 duration-200 text-stone-900">
                                          <div className="flex justify-between items-center pb-2 border-b border-red-200">
                                            <span className="text-xs font-black uppercase text-red-700 flex items-center gap-1.5">
                                              <DollarSign className="w-4 h-4 animate-pulse" /> Claim Refund Form
                                            </span>
                                            <button 
                                              type="button" 
                                              onClick={() => setInlineRefundId(null)}
                                              className="text-red-400 hover:text-red-700 text-xs font-bold"
                                            >
                                              Cancel ✕
                                            </button>
                                          </div>

                                          <p className="text-stone-700 text-xs leading-relaxed font-sans font-semibold text-left">
                                            Claim eligibility for a 95% refund of <span className="font-extrabold bg-red-100 px-1.5 py-0.5 rounded text-red-800">{formatPrice(calculateRefundAmounts(p.receivedAmount).refundAmount, p.currency)}</span> (from authoritative verified payment: <span className="font-bold text-stone-900">{formatPrice(p.receivedAmount, p.currency)}</span>; platform retention 5%: <span className="font-bold text-stone-900">{formatPrice(calculateRefundAmounts(p.receivedAmount).retentionAmount, p.currency)}</span>) has been approved. Please input complete bank transfer instructions:
                                          </p>

                                          <div className="space-y-3 font-sans text-left">
                                            <div>
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">Holder Complete Name</label>
                                              <input
                                                type="text"
                                                value={refundName}
                                                onChange={(e) => setRefundName(e.target.value)}
                                                placeholder="Name of account receiver"
                                                className="w-full text-xs font-bold border-stone-200 rounded-xl p-2.5 bg-white border focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:text-stone-300"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">Bank Name / Wallet System</label>
                                              <input
                                                type="text"
                                                value={refundBankName}
                                                onChange={(e) => setRefundBankName(e.target.value)}
                                                placeholder="e.g. Allied Bank, Easypaisa, JazzCash"
                                                className="w-full text-xs font-bold border-stone-200 rounded-xl p-2.5 bg-white border focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:text-stone-300"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">Account Number or IBAN Code</label>
                                              <input
                                                type="text"
                                                value={refundAccountNumber}
                                                onChange={(e) => setRefundAccountNumber(e.target.value)}
                                                placeholder="Receiver account number or IBAN"
                                                className="w-full text-xs font-mono font-bold border-stone-200 rounded-xl p-2.5 bg-white border focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:font-sans placeholder:text-stone-300"
                                              />
                                            </div>

                                            {/* Multiple Image Upload block */}
                                            <div className="space-y-2 pt-1 border-t border-red-100/50 mt-2 text-left font-sans">
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">
                                                Attach Paid Payment Proof Receipt (You can attach multiple images of any size)
                                              </label>
                                              <div className="flex flex-col gap-2 font-sans">
                                                <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-red-200 bg-white rounded-xl cursor-pointer hover:bg-red-50/50 transition-colors group p-3 text-center">
                                                  <Upload className="w-5 h-5 text-red-300 group-hover:text-red-500 transition-colors mb-1" />
                                                  <span className="text-xs font-black text-rose-600 uppercase tracking-widest block font-sans">Attach Refund Paid Verification Proof</span>
                                                  <span className="text-[7.5px] text-stone-400 font-semibold block mt-0.5">Select one or more receipt images</span>
                                                  <input 
                                                    type="file" 
                                                    className="hidden" 
                                                    accept="image/*" 
                                                    multiple
                                                    onChange={handleRefundProofUpload} 
                                                  />
                                                </label>

                                                {refundProofImages.length > 0 && (
                                                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
                                                    {refundProofImages.map((img, idx) => (
                                                      <div key={idx} className="relative group rounded-lg overflow-hidden border border-stone-200 aspect-square bg-stone-50 flex items-center justify-center">
                                                        <img 
                                                          src={img} 
                                                          alt={`Refund Proof ${idx + 1}`} 
                                                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" 
                                                          onClick={() => setLightboxImage(img)}
                                                          referrerPolicy="no-referrer"
                                                        />
                                                        <button
                                                          type="button"
                                                          onClick={() => removeRefundProofImage(idx)}
                                                          className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-md flex items-center justify-center text-xs font-bold h-4 w-4 leading-none transition-all"
                                                          title="Remove image"
                                                        >
                                                          ✕
                                                        </button>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          <div className="p-2.5 bg-white border border-red-100 rounded-xl text-[9.5px] leading-snug text-stone-400 italic block text-left font-sans">
                                            ℹ️ Refunds takes up to 7 working days to reflect back in your account. The platform administrator verifies bank statements manually.
                                          </div>

                                          <div className="flex gap-2 pt-2 border-t border-red-200">
                                            <button
                                              type="button"
                                              onClick={() => setInlineRefundId(null)}
                                              className="flex-1 bg-white hover:bg-stone-50 border border-stone-200 text-stone-600 font-extrabold uppercase text-xs tracking-widest py-2.5 rounded-lg transition-colors text-center"
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              type="button"
                                              disabled={updating}
                                              onClick={() => confirmRefundActionInlineWithConfirm(p, refundName, refundBankName, refundAccountNumber)}
                                              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-extrabold uppercase text-xs tracking-widest py-2.5 rounded-lg transition-all text-center shadow disabled:opacity-50"
                                            >
                                              {updating ? "Saving..." : "Confirm Refund Request"}
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {['REVOKED', 'REMOVED'].includes(p.status) && p.amount && p.amount > 0 && (
                            <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-xs font-sans font-black leading-normal text-center text-stone-550 italic">
                              🛡️ This application holds non-refundable status because the badge was previously approved and activated.
                            </div>
                          )}

{/* Live Track Timeline & Document Resubmission Changelog */}
                          {renderTimelineAndRevisions(p)}
                        </div>

                        <div className="text-stone-400 text-xs font-mono border-t border-stone-200/60 mt-4 pt-3 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Files Submitted: {formatDate(p.createdAt)}
                        </div>
                      </div>
                    ))}

                    {/* (C) Standard Verifications (From legacy/other routes) */}
                    {verifications.map(v => (
                      <div key={v.id} className="bg-gradient-to-br from-white to-stone-50/50 border border-stone-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                        <div className="space-y-4">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="bg-blue-100 text-blue-800 text-xs font-black uppercase px-2 py-0.5 rounded-full tracking-wider mb-1 inline-block">
                                Standard Registration
                              </span>
                              <span className="text-stone-900 font-black text-base block uppercase tracking-tight">
                                📄 Merchant Registration Plan
                              </span>
                            </div>
                            {renderStatusBadge(v.status || 'PENDING', v.createdAt)}
                          </div>

                          {v.paymentProofUrl && (
                            <div className="border-t border-stone-200/60 pt-3 space-y-2">
                              <span className="text-stone-400 font-bold block text-xs uppercase tracking-wider">Proof of registration upload</span>
                              <button
                                onClick={() => setLightboxImage(v.paymentProofUrl)}
                                className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-stone-100 border border-stone-200 rounded-xl transition-all text-left text-xs group text-stone-700"
                              >
                                <span className="bg-stone-150 group-hover:bg-stone-200 p-1 rounded-lg text-stone-700 transition-colors">
                                  <ImageIcon className="w-3.5 h-3.5" />
                                </span>
                                <div>
                                  <span className="block font-black leading-tight text-xs uppercase">Proof Document</span>
                                  <span className="text-stone-400 text-xs font-mono flex items-center gap-0.5">Click to expand <Eye className="w-2.5 h-2.5" /></span>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="text-stone-400 text-xs font-mono border-t border-stone-200/60 mt-4 pt-3 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Filed: {v.createdAt ? formatDate(v.createdAt) : 'Recent'}
                        </div>
                      </div>
                    ))}

                  </div>
                    </>
                  )}
              </div>
            )}

            {/* CATEGORY 2 CONTENT: Featured Ads Badge Applications */}
            {activeCategory === 'FEATURED' && (
              <div className="space-y-5 animate-in fade-in duration-350">
                {promotions.filter(p => p.type === 'FEATURED').length === 0 ? (
                  renderInlineApplyForm()
                ) : (
                  <>
                    <div className="flex justify-between items-center bg-stone-50 p-4 rounded-xl border border-stone-100/80">
                      <span className="text-xs uppercase font-black text-stone-400">Applications Archive List</span>
                      <button
                        onClick={() => {
                          setShowApplyForm(!showApplyForm);
                          setSuccess(false);
                          setSelectedPlan(null);
                          setProofImage('');
                          setItemLink('');
                          setSelectedListingId('');
                          setAgreeToTerms(false);
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-stone-955 rounded-xl py-2 px-4 text-xs font-black uppercase tracking-widest transition-all active:scale-95"
                      >
                        {showApplyForm ? "✕ Close Form" : "✨ Submit New Featured Badge Request"}
                      </button>
                    </div>
                    {showApplyForm && renderInlineApplyForm()}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {promotions.filter(p => p.type === 'FEATURED').filter(matchesSearch).map(p => (
                      <div key={p.id} className="bg-gradient-to-br from-white to-stone-50/50 border border-stone-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                        <div className="space-y-4">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="bg-amber-100 text-amber-800 text-xs font-black uppercase px-2 py-0.5 rounded-full tracking-wider mb-1 inline-block">
                                Feature Tag request
                              </span>
                              <span className="text-stone-900 font-black text-base block uppercase tracking-tight">
                                🌟 {p.planName || "Featured Ads Plan"}
                              </span>
                              <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[9.5px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded border border-stone-200/60 w-fit">
                                <span className="font-black text-stone-400">APP #</span>
                                <span className="font-black">{p.applicationId || `APP-FEAT-${p.id.substring(0, 6).toUpperCase()}`}</span>
                              </div>
                            </div>
                            {renderStatusBadge(p.status, p.createdAt, p.durationDays)}
                          </div>

                          {/* Unified Official Ledger details */}
                          {renderOfficialLedger(p, "Featured Ads Badge")}

                          {p.status !== 'REJECTED' && p.verificationStage !== 'VERIFIER_DENIED' && (
                            <button
                              type="button"
                              onClick={() => setSelectedAppDetails(p)}
                              className="w-full bg-stone-100 hover:bg-stone-200 text-stone-855 text-xs font-black uppercase tracking-wider py-2.5 rounded-xl transition border border-stone-200 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                            >
                              <FileText className="w-3.5 h-3.5 text-stone-400" />
                              <span>View Full Application Form</span>
                            </button>
                          )}

                          {/* Appeals & Feedback */}
                          {p.status === 'REVOKED' && !p.appealMessage && (
                            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 mt-2">
                              <span className="font-black uppercase text-xs block text-red-500 mb-1">Revocation reason:</span>
                              {p.revocationReason || "Improper category chosen or payment reverse indicator."}
                              <button
                                onClick={() => openAppealForm(p)}
                                className="w-full mt-2 bg-red-100 hover:bg-red-200 text-red-800 font-extrabold uppercase text-[9.5px] tracking-widest py-1.5 rounded-lg transition-all"
                              >
                                Submit appeal
                              </button>
                            </div>
                          )}

                          {p.status === 'REMOVED' && !p.appealMessage && (
                            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 mt-2">
                              <span className="font-black uppercase text-xs block text-rose-500 mb-1">Removal feedback:</span>
                              "The badge was administratively force-removed due to violation of community policies."
                              <button
                                onClick={() => openAppealForm(p)}
                                className="w-full mt-2 bg-rose-105 hover:bg-rose-200 text-rose-805 font-extrabold uppercase text-[9.5px] tracking-widest py-2 rounded-lg transition-all"
                              >
                                Submit appeal
                              </button>
                            </div>
                          )}

                          {p.appealMessage && (
                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 italic mt-2">
                              <span className="font-extrabold block uppercase text-xs tracking-wider text-blue-500 not-italic mb-1">Appeal letter submitted:</span>
                              "{p.appealMessage}"
                            </div>
                          )}

                                                                              {(['REJECTED', 'REVOKED', 'REMOVED'].includes(p.status) || p.verificationStage === 'VERIFIER_DENIED') && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-3">
                              {(p.status === 'REJECTED' || p.verificationStage === 'VERIFIER_DENIED') && (
                                <div>
                                  <span className="font-black uppercase tracking-widest block text-xs text-red-600 mb-2 font-sans border-b border-red-200 pb-1">Reason for Rejection:</span>
                                  <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 md:p-7 shadow-lg mt-3 transform transition hover:scale-[1.01]">
                                    <span className="block text-xs font-black uppercase text-red-400 tracking-widest mb-2">Internal Verification Denial Note:</span>
                                    <p className="font-black text-lg md:text-xl text-red-900 leading-tight italic">"{p.verificationStage === 'VERIFIER_DENIED' ? p.paymentDenialReason : (p.rejectionReason || 'Payment proof was invalid or insufficient.')}"</p>
                                  </div>
                                </div>
                              )}

                              {p.refundStatus === "REFUNDED" ? (
                                <div className="p-3 bg-emerald-900 border border-emerald-800 rounded-xl text-emerald-50 font-sans space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-300">
                                    <DollarSign className="w-4 h-4 animate-pulse" />
                                    <span>Refunded</span>
                                  </div>
                                  {p.refundProofImage && (
                                    <div className="space-y-1.5 pt-1">
                                      <span className="font-black uppercase text-xs tracking-widest text-emerald-300 block font-sans">📷 View Refund Receipt Verification:</span>
                                      <button
                                        type="button"
                                        onClick={() => setLightboxImage(p.refundProofImage)}
                                        className="flex items-center gap-2 p-1.5 bg-emerald-950 hover:bg-emerald-900/60 border border-emerald-805/80 rounded-lg text-emerald-300 text-xs w-full transition-all text-left group"
                                      >
                                        <img 
                                          src={p.refundProofImage} 
                                          alt="Official Refund Receipt" 
                                          className="max-h-12 w-12 object-cover rounded border border-emerald-800/80 shrink-0 select-none cursor-pointer"
                                          referrerPolicy="no-referrer"
                                        />
                                        <div>
                                          <span className="block font-black uppercase text-xs text-emerald-200">Official Refund Receipt copy</span>
                                          <span className="text-xs text-emerald-450 group-hover:underline">Click to enlarge / zoom proof</span>
                                        </div>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2.5 pt-1 font-sans">
                                  {p.refundRequested && (
                                    <div className="p-3 bg-stone-900 border border-stone-850 rounded-xl text-stone-200 font-sans">
                                      <div className="flex items-center gap-2 mb-1">
                                        <DollarSign className="w-4 h-4 text-emerald-400" />
                                        <span className="font-black uppercase text-xs tracking-widest text-emerald-400">
                                          {(p.refundStatus === "REJECTED" || p.refundStatus === "REJECTED_FINAL" || p.refundStatus === "VERIFIER_REJECTED")
                                            ? "Refund Rejected"
                                            : "Refund Processing"}
                                        </span>
                                      </div>
                                      <p className="font-medium text-xs leading-relaxed">
                                        {(p.refundStatus === "REJECTED" || p.refundStatus === "REJECTED_FINAL" || p.refundStatus === "VERIFIER_REJECTED")
                                          ? `Your refund request was rejected. Reason: "${p.verifierRejectReason || 'Payment verifier rejected bank accounts details'}"`
                                          : `Your 95% refund of ${formatPrice(p.refundCalculatedAmount || calculateRefundAmounts(p.receivedAmount).refundAmount, p.currency)} (5% platform retention: ${formatPrice(p.refundRetentionAmount || calculateRefundAmounts(p.receivedAmount).retentionAmount, p.currency)}) will be refunded within 7 working days.`}
                                      </p>
                                      <span className="text-xs text-stone-400 font-semibold block mt-1">
                                        Estimated completion date: {p.refundRequestedAt ? formatDate(new Date(p.refundRequestedAt.seconds ? p.refundRequestedAt.seconds * 1000 + 7 * 24 * 60 * 60 * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000)) : formatDate(Date.now() + 7 * 24 * 60 * 60 * 1000)}
                                      </span>
                                      <div className="mt-2.5 pt-2 border-t border-stone-800 text-[10.5px] text-stone-300 flex flex-col gap-0.5">
                                        <span className="font-extrabold uppercase text-xs tracking-wider text-amber-400">Request received for refund:</span>
                                        <span className="font-mono">{p.refundRequestedAt ? formatDate(p.refundRequestedAt) : formatDate(new Date())}</span>
                                      </div>
                                    </div>
                                  )}

                                  {(p.status === 'REJECTED' || p.verificationStage === 'VERIFIER_DENIED') && (
                                    <div className="space-y-3 pt-1">
                                      {/* Dual core buttons grid */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedAppDetails(p)}
                                          className="w-full bg-white hover:bg-stone-50 text-stone-900 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl transition border border-stone-200 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                                        >
                                          <FileText className="w-3.5 h-3.5 text-stone-400" />
                                          <span>View Application Form</span>
                                        </button>

                                        {p.refundStatus === "REFUNDED" ? (
                                          <div className="w-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5">
                                            <DollarSign className="w-4 h-4 text-emerald-600" />
                                            <span>Refunded Successfully</span>
                                          </div>
                                        ) : p.refundRequested && inlineRefundId !== p.id ? (
                                          <div className="w-full bg-stone-100 border border-stone-200 text-stone-700 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl text-center flex items-center justify-center gap-1">
                                            <span>⏳ Refund Processing</span>
                                          </div>
                                        ) : (!p.refundRequested && p.refundStatus !== "REFUNDED" && isEligibleForRefund(p)) ? (
                                          <div className="flex flex-col gap-1 w-full text-center">
                                            <button
                                              type="button"
                                              onClick={() => startInlineRefund(p)}
                                              className={`w-full font-black uppercase text-xs tracking-wider py-2.5 px-3 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-sans ${
                                                inlineRefundId === p.id
                                                  ? 'bg-stone-800 text-white hover:bg-stone-700 border border-stone-700'
                                                  : 'bg-red-600 hover:bg-red-700 text-white border border-red-500 hover:shadow-md'
                                              }`}
                                            >
                                              <DollarSign className="w-3.5 h-3.5" />
                                              <span>{inlineRefundId === p.id ? 'Close Refund Form' : 'Request Refund Claim'}</span>
                                            </button>
                                            <RefundCountdown promo={p} />
                                          </div>
                                        ) : (
                                          <div className="flex flex-col gap-1 w-full text-center">
                                            {p.amount && p.amount > 0 ? (
                                              p.status === 'REJECTED' ? (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const check = checkRefundEligibility(p, user?.uid);
                                                    alert(check.reason);
                                                  }}
                                                  className="w-full bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                                                >
                                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                                  <span>Non-Refundable / Ineligible</span>
                                                </button>
                                              ) : (
                                                <div className="w-full bg-stone-50 border border-stone-200 text-stone-400 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl text-center">
                                                  <span>Paid Package</span>
                                                </div>
                                              )
                                            ) : (
                                              <div className="w-full bg-stone-50 border border-stone-200 text-stone-400 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl text-center">
                                                <span>Free Package / N/A</span>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Rejected Application Closed Status */}
                                      {p.status === 'REJECTED' && (
                                        <div className="border-t border-stone-200/80 pt-3 mt-2 space-y-2 text-left">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] uppercase font-black tracking-wider text-rose-600 flex items-center gap-1.5">
                                              <Lock className="w-3.5 h-3.5 text-rose-500" /> Application Closed (Historical Record)
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setShowApplyForm(true);
                                                setSuccess(false);
                                                setSelectedPlan(null);
                                                setProofImage('');
                                                setItemLink('');
                                                setSelectedListingId('');
                                                setAgreeToTerms(false);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                              }}
                                              className="text-[11px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                            >
                                              ✨ Apply Fresh
                                            </button>
                                          </div>
                                          {p.rejectionReason && (
                                            <div className="text-xs text-stone-700 bg-rose-50/60 p-2.5 rounded-xl border border-rose-100/80">
                                              <span className="font-bold text-rose-900">Rejection Note: </span>
                                              {p.rejectionReason}
                                            </div>
                                          )}
                                          {p.rejectionCategory && (
                                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                                              <span>Category:</span>
                                              <span className={`px-2 py-0.5 rounded text-white ${p.rejectionCategory === 'FRAUD' ? 'bg-red-600' : (p.rejectionCategory === 'POLICY_VIOLATION' || p.rejectionCategory === 'REFUNDABLE_REJECTION' ? 'bg-amber-600' : 'bg-stone-600')}`}>
                                                {p.rejectionCategory.replace('_', ' ')}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* INLINE REFUND FORM */}
                                      {inlineRefundId === p.id && (
                                        <div className="mt-4 p-5 bg-red-50 border-2 border-red-200 rounded-2xl space-y-4 shadow-sm animate-in slide-in-from-top-2 duration-200 text-stone-900">
                                          <div className="flex justify-between items-center pb-2 border-b border-red-200">
                                            <span className="text-xs font-black uppercase text-red-700 flex items-center gap-1.5">
                                              <DollarSign className="w-4 h-4 animate-pulse" /> Claim Refund Form
                                            </span>
                                            <button 
                                              type="button" 
                                              onClick={() => setInlineRefundId(null)}
                                              className="text-red-400 hover:text-red-700 text-xs font-bold"
                                            >
                                              Cancel ✕
                                            </button>
                                          </div>

                                          <p className="text-stone-700 text-xs leading-relaxed font-sans font-semibold text-left">
                                            Claim eligibility for a 95% refund of <span className="font-extrabold bg-red-100 px-1.5 py-0.5 rounded text-red-800">{formatPrice(calculateRefundAmounts(p.receivedAmount).refundAmount, p.currency)}</span> (from authoritative verified payment: <span className="font-bold text-stone-900">{formatPrice(p.receivedAmount, p.currency)}</span>; platform retention 5%: <span className="font-bold text-stone-900">{formatPrice(calculateRefundAmounts(p.receivedAmount).retentionAmount, p.currency)}</span>) has been approved. Please input complete bank transfer instructions:
                                          </p>

                                          <div className="space-y-3 font-sans text-left">
                                            <div>
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">Holder Complete Name</label>
                                              <input
                                                type="text"
                                                value={refundName}
                                                onChange={(e) => setRefundName(e.target.value)}
                                                placeholder="Name of account receiver"
                                                className="w-full text-xs font-bold border-stone-200 rounded-xl p-2.5 bg-white border focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:text-stone-300"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">Bank Name / Wallet System</label>
                                              <input
                                                type="text"
                                                value={refundBankName}
                                                onChange={(e) => setRefundBankName(e.target.value)}
                                                placeholder="e.g. Allied Bank, Easypaisa, JazzCash"
                                                className="w-full text-xs font-bold border-stone-200 rounded-xl p-2.5 bg-white border focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:text-stone-300"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">Account Number or IBAN Code</label>
                                              <input
                                                type="text"
                                                value={refundAccountNumber}
                                                onChange={(e) => setRefundAccountNumber(e.target.value)}
                                                placeholder="Receiver account number or IBAN"
                                                className="w-full text-xs font-mono font-bold border-stone-200 rounded-xl p-2.5 bg-white border focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:font-sans placeholder:text-stone-300"
                                              />
                                            </div>

                                            {/* Multiple Image Upload block */}
                                            <div className="space-y-2 pt-1 border-t border-red-100/50 mt-2 text-left font-sans">
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">
                                                Attach Paid Payment Proof Receipt (You can attach multiple images of any size)
                                              </label>
                                              <div className="flex flex-col gap-2 font-sans">
                                                <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-red-200 bg-white rounded-xl cursor-pointer hover:bg-red-50/50 transition-colors group p-3 text-center">
                                                  <Upload className="w-5 h-5 text-red-300 group-hover:text-red-500 transition-colors mb-1" />
                                                  <span className="text-xs font-black text-rose-600 uppercase tracking-widest block font-sans">Attach Refund Paid Verification Proof</span>
                                                  <span className="text-[7.5px] text-stone-400 font-semibold block mt-0.5">Select one or more receipt images</span>
                                                  <input 
                                                    type="file" 
                                                    className="hidden" 
                                                    accept="image/*" 
                                                    multiple
                                                    onChange={handleRefundProofUpload} 
                                                  />
                                                </label>

                                                {refundProofImages.length > 0 && (
                                                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
                                                    {refundProofImages.map((img, idx) => (
                                                      <div key={idx} className="relative group rounded-lg overflow-hidden border border-stone-200 aspect-square bg-stone-50 flex items-center justify-center">
                                                        <img 
                                                          src={img} 
                                                          alt={`Refund Proof ${idx + 1}`} 
                                                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" 
                                                          onClick={() => setLightboxImage(img)}
                                                          referrerPolicy="no-referrer"
                                                        />
                                                        <button
                                                          type="button"
                                                          onClick={() => removeRefundProofImage(idx)}
                                                          className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-md flex items-center justify-center text-xs font-bold h-4 w-4 leading-none transition-all"
                                                          title="Remove image"
                                                        >
                                                          ✕
                                                        </button>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          <div className="p-2.5 bg-white border border-red-100 rounded-xl text-[9.5px] leading-snug text-stone-400 italic block text-left font-sans">
                                            ℹ️ Refunds takes up to 7 working days to reflect back in your account. The platform administrator verifies bank statements manually.
                                          </div>

                                          <div className="flex gap-2 pt-2 border-t border-red-200">
                                            <button
                                              type="button"
                                              onClick={() => setInlineRefundId(null)}
                                              className="flex-1 bg-white hover:bg-stone-50 border border-stone-200 text-stone-600 font-extrabold uppercase text-xs tracking-widest py-2.5 rounded-lg transition-colors text-center"
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              type="button"
                                              disabled={updating}
                                              onClick={() => confirmRefundActionInlineWithConfirm(p, refundName, refundBankName, refundAccountNumber)}
                                              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-extrabold uppercase text-xs tracking-widest py-2.5 rounded-lg transition-all text-center shadow disabled:opacity-50"
                                            >
                                              {updating ? "Saving..." : "Confirm Refund Request"}
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {['REVOKED', 'REMOVED'].includes(p.status) && p.amount && p.amount > 0 && (
                            <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-xs font-sans font-black leading-normal text-center text-stone-550 italic">
                              🛡️ This application holds non-refundable status because the badge was previously approved and activated.
                            </div>
                          )}

{/* Live Track Timeline & Document Resubmission Changelog */}
                          {renderTimelineAndRevisions(p)}
                        </div>

                        <div className="text-stone-400 text-xs font-mono border-t border-stone-200/60 mt-4 pt-3 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Submitted At: {formatDate(p.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                    </>
                  )}
              </div>
            )}

            {/* CATEGORY 3 CONTENT: Boosted Ads Badge Applications */}
            {activeCategory === 'BOOST' && (
              <div className="space-y-5 animate-in fade-in duration-350">
                {promotions.filter(p => p.type === 'BOOST').length === 0 ? (
                  renderInlineApplyForm()
                ) : (
                  <>
                    <div className="flex justify-between items-center bg-stone-50 p-4 rounded-xl border border-stone-100/80">
                      <span className="text-xs uppercase font-black text-stone-400">Applications Archive List</span>
                      <button
                        onClick={() => {
                          setShowApplyForm(!showApplyForm);
                          setSuccess(false);
                          setSelectedPlan(null);
                          setProofImage('');
                          setItemLink('');
                          setSelectedListingId('');
                          setAgreeToTerms(false);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2 px-4 text-xs font-black uppercase tracking-widest transition-all active:scale-95"
                      >
                        {showApplyForm ? "✕ Close Form" : "✨ Submit New Boosted Badge Request"}
                      </button>
                    </div>
                    {showApplyForm && renderInlineApplyForm()}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {promotions.filter(p => p.type === 'BOOST').filter(matchesSearch).map(p => (
                      <div key={p.id} className="bg-gradient-to-br from-white to-stone-50/50 border border-stone-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
                        <div className="space-y-4">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="bg-blue-100 text-blue-800 text-xs font-black uppercase px-2 py-0.5 rounded-full tracking-wider mb-1 inline-block">
                                Boost Tag request
                              </span>
                              <span className="text-stone-900 font-black text-base block uppercase tracking-tight">
                                ⚡ {p.planName || "Boosted Ads Plan"}
                              </span>
                              <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[9.5px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded border border-stone-200/60 w-fit">
                                <span className="font-black text-stone-400">APP #</span>
                                <span className="font-black">{p.applicationId || `APP-BOOS-${p.id.substring(0, 6).toUpperCase()}`}</span>
                              </div>
                            </div>
                            {renderStatusBadge(p.status, p.createdAt, p.durationDays)}
                          </div>

                          {/* Unified Official Ledger details */}
                          {renderOfficialLedger(p, "Boosted Ads Badge")}

                          {p.status !== 'REJECTED' && p.verificationStage !== 'VERIFIER_DENIED' && (
                            <button
                              type="button"
                              onClick={() => setSelectedAppDetails(p)}
                              className="w-full bg-stone-100 hover:bg-stone-200 text-stone-855 text-xs font-black uppercase tracking-wider py-2.5 rounded-xl transition border border-stone-200 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                            >
                              <FileText className="w-3.5 h-3.5 text-stone-400" />
                              <span>View Full Application Form</span>
                            </button>
                          )}

                          {p.status === 'REVOKED' && !p.appealMessage && (
                            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 mt-2">
                              <span className="font-black uppercase text-xs block text-red-500 mb-1">Revocation feedback:</span>
                              {p.revocationReason || "Incorrect receipt submission or payment dispute detected."}
                              <button
                                onClick={() => openAppealForm(p)}
                                className="w-full mt-2 bg-red-100 hover:bg-red-200 text-red-805 font-extrabold uppercase text-[9.5px] tracking-widest py-1.5 rounded-lg transition-all"
                              >
                                Submit appeal
                              </button>
                            </div>
                          )}

                          {p.status === 'REMOVED' && !p.appealMessage && (
                            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 mt-2">
                              <span className="font-black uppercase text-xs block text-rose-500 mb-1">Removal feedback:</span>
                              "The badge was administratively force-removed due to violation of community policies."
                              <button
                                onClick={() => openAppealForm(p)}
                                className="w-full mt-2 bg-rose-105 hover:bg-rose-200 text-rose-805 font-extrabold uppercase text-[9.5px] tracking-widest py-2 rounded-lg transition-all"
                              >
                                Submit appeal
                              </button>
                            </div>
                          )}

                          {p.appealMessage && (
                            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 italic mt-2">
                              <span className="font-extrabold block uppercase text-xs tracking-wider text-blue-400 not-italic mb-1">Appeal request:</span>
                              "{p.appealMessage}"
                            </div>
                          )}

                                                                              {(['REJECTED', 'REVOKED', 'REMOVED'].includes(p.status) || p.verificationStage === 'VERIFIER_DENIED') && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-3">
                              {(p.status === 'REJECTED' || p.verificationStage === 'VERIFIER_DENIED') && (
                                <div>
                                  <span className="font-black uppercase tracking-widest block text-xs text-red-600 mb-2 font-sans border-b border-red-200 pb-1">Reason for Rejection:</span>
                                  <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 md:p-7 shadow-lg mt-3 transform transition hover:scale-[1.01]">
                                    <span className="block text-xs font-black uppercase text-red-400 tracking-widest mb-2">Internal Verification Denial Note:</span>
                                    <p className="font-black text-lg md:text-xl text-red-900 leading-tight italic">"{p.verificationStage === 'VERIFIER_DENIED' ? p.paymentDenialReason : (p.rejectionReason || 'Payment proof was invalid or insufficient.')}"</p>
                                  </div>
                                </div>
                              )}

                              {p.refundStatus === "REFUNDED" ? (
                                <div className="p-3 bg-emerald-900 border border-emerald-800 rounded-xl text-emerald-50 font-sans space-y-2">
                                  <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-300">
                                    <DollarSign className="w-4 h-4 animate-pulse" />
                                    <span>Refunded</span>
                                  </div>
                                  {p.refundProofImage && (
                                    <div className="space-y-1.5 pt-1">
                                      <span className="font-black uppercase text-xs tracking-widest text-emerald-300 block font-sans">📷 View Refund Receipt Verification:</span>
                                      <button
                                        type="button"
                                        onClick={() => setLightboxImage(p.refundProofImage)}
                                        className="flex items-center gap-2 p-1.5 bg-emerald-950 hover:bg-emerald-900/60 border border-emerald-805/80 rounded-lg text-emerald-300 text-xs w-full transition-all text-left group"
                                      >
                                        <img 
                                          src={p.refundProofImage} 
                                          alt="Official Refund Receipt" 
                                          className="max-h-12 w-12 object-cover rounded border border-emerald-800/80 shrink-0 select-none cursor-pointer"
                                          referrerPolicy="no-referrer"
                                        />
                                        <div>
                                          <span className="block font-black uppercase text-xs text-emerald-200">Official Refund Receipt copy</span>
                                          <span className="text-xs text-emerald-450 group-hover:underline">Click to enlarge / zoom proof</span>
                                        </div>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2.5 pt-1 font-sans">
                                  {p.refundRequested && (
                                    <div className="p-3 bg-stone-900 border border-stone-850 rounded-xl text-stone-200 font-sans">
                                      <div className="flex items-center gap-2 mb-1">
                                        <DollarSign className="w-4 h-4 text-emerald-400" />
                                        <span className="font-black uppercase text-xs tracking-widest text-emerald-400">
                                          {(p.refundStatus === "REJECTED" || p.refundStatus === "REJECTED_FINAL" || p.refundStatus === "VERIFIER_REJECTED")
                                            ? "Refund Rejected"
                                            : "Refund Processing"}
                                        </span>
                                      </div>
                                      <p className="font-medium text-xs leading-relaxed">
                                        {(p.refundStatus === "REJECTED" || p.refundStatus === "REJECTED_FINAL" || p.refundStatus === "VERIFIER_REJECTED")
                                          ? `Your refund request was rejected. Reason: "${p.verifierRejectReason || 'Payment verifier rejected bank accounts details'}"`
                                          : `Your 95% refund of ${formatPrice(p.refundCalculatedAmount || calculateRefundAmounts(p.receivedAmount).refundAmount, p.currency)} (5% platform retention: ${formatPrice(p.refundRetentionAmount || calculateRefundAmounts(p.receivedAmount).retentionAmount, p.currency)}) will be refunded within 7 working days.`}
                                      </p>
                                      <span className="text-xs text-stone-400 font-semibold block mt-1">
                                        Estimated completion date: {p.refundRequestedAt ? formatDate(new Date(p.refundRequestedAt.seconds ? p.refundRequestedAt.seconds * 1000 + 7 * 24 * 60 * 60 * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000)) : formatDate(Date.now() + 7 * 24 * 60 * 60 * 1000)}
                                      </span>
                                      <div className="mt-2.5 pt-2 border-t border-stone-800 text-[10.5px] text-stone-300 flex flex-col gap-0.5">
                                        <span className="font-extrabold uppercase text-xs tracking-wider text-amber-400">Request received for refund:</span>
                                        <span className="font-mono">{p.refundRequestedAt ? formatDate(p.refundRequestedAt) : formatDate(new Date())}</span>
                                      </div>
                                    </div>
                                  )}

                                  {(p.status === 'REJECTED' || p.verificationStage === 'VERIFIER_DENIED') && (
                                    <div className="space-y-3 pt-1">
                                      {/* Dual core buttons grid */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedAppDetails(p)}
                                          className="w-full bg-white hover:bg-stone-50 text-stone-900 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl transition border border-stone-200 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                                        >
                                          <FileText className="w-3.5 h-3.5 text-stone-400" />
                                          <span>View Application Form</span>
                                        </button>

                                        {p.refundStatus === "REFUNDED" ? (
                                          <div className="w-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5">
                                            <DollarSign className="w-4 h-4 text-emerald-600" />
                                            <span>Refunded Successfully</span>
                                          </div>
                                        ) : p.refundRequested && inlineRefundId !== p.id ? (
                                          <div className="w-full bg-stone-100 border border-stone-200 text-stone-700 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl text-center flex items-center justify-center gap-1">
                                            <span>⏳ Refund Processing</span>
                                          </div>
                                        ) : (!p.refundRequested && p.refundStatus !== "REFUNDED" && isEligibleForRefund(p)) ? (
                                          <div className="flex flex-col gap-1 w-full text-center">
                                            <button
                                              type="button"
                                              onClick={() => startInlineRefund(p)}
                                              className={`w-full font-black uppercase text-xs tracking-wider py-2.5 px-3 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer font-sans ${
                                                inlineRefundId === p.id
                                                  ? 'bg-stone-800 text-white hover:bg-stone-700 border border-stone-700'
                                                  : 'bg-red-600 hover:bg-red-700 text-white border border-red-500 hover:shadow-md'
                                              }`}
                                            >
                                              <DollarSign className="w-3.5 h-3.5" />
                                              <span>{inlineRefundId === p.id ? 'Close Refund Form' : 'Request Refund Claim'}</span>
                                            </button>
                                            <RefundCountdown promo={p} />
                                          </div>
                                        ) : (
                                          <div className="flex flex-col gap-1 w-full text-center">
                                            {p.amount && p.amount > 0 ? (
                                              p.status === 'REJECTED' ? (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const check = checkRefundEligibility(p, user?.uid);
                                                    alert(check.reason);
                                                  }}
                                                  className="w-full bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-700 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                                                >
                                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                                  <span>Non-Refundable / Ineligible</span>
                                                </button>
                                              ) : (
                                                <div className="w-full bg-stone-50 border border-stone-200 text-stone-400 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl text-center">
                                                  <span>Paid Package</span>
                                                </div>
                                              )
                                            ) : (
                                              <div className="w-full bg-stone-50 border border-stone-200 text-stone-400 text-xs font-black uppercase tracking-wider py-2.5 px-3 rounded-xl text-center">
                                                <span>Free Package / N/A</span>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Rejected Application Closed Status */}
                                      {p.status === 'REJECTED' && (
                                        <div className="border-t border-stone-200/80 pt-3 mt-2 space-y-2 text-left">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] uppercase font-black tracking-wider text-rose-600 flex items-center gap-1.5">
                                              <Lock className="w-3.5 h-3.5 text-rose-500" /> Application Closed (Historical Record)
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setShowApplyForm(true);
                                                setSuccess(false);
                                                setSelectedPlan(null);
                                                setProofImage('');
                                                setItemLink('');
                                                setSelectedListingId('');
                                                setAgreeToTerms(false);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                              }}
                                              className="text-[11px] font-black uppercase tracking-wider text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                            >
                                              ✨ Apply Fresh
                                            </button>
                                          </div>
                                          {p.rejectionReason && (
                                            <div className="text-xs text-stone-700 bg-rose-50/60 p-2.5 rounded-xl border border-rose-100/80">
                                              <span className="font-bold text-rose-900">Rejection Note: </span>
                                              {p.rejectionReason}
                                            </div>
                                          )}
                                          {p.rejectionCategory && (
                                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-500">
                                              <span>Category:</span>
                                              <span className={`px-2 py-0.5 rounded text-white ${p.rejectionCategory === 'FRAUD' ? 'bg-red-600' : (p.rejectionCategory === 'POLICY_VIOLATION' || p.rejectionCategory === 'REFUNDABLE_REJECTION' ? 'bg-amber-600' : 'bg-stone-600')}`}>
                                                {p.rejectionCategory.replace('_', ' ')}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* INLINE REFUND FORM */}
                                      {inlineRefundId === p.id && (
                                        <div className="mt-4 p-5 bg-red-50 border-2 border-red-200 rounded-2xl space-y-4 shadow-sm animate-in slide-in-from-top-2 duration-200 text-stone-900">
                                          <div className="flex justify-between items-center pb-2 border-b border-red-200">
                                            <span className="text-xs font-black uppercase text-red-700 flex items-center gap-1.5">
                                              <DollarSign className="w-4 h-4 animate-pulse" /> Claim Refund Form
                                            </span>
                                            <button 
                                              type="button" 
                                              onClick={() => setInlineRefundId(null)}
                                              className="text-red-400 hover:text-red-700 text-xs font-bold"
                                            >
                                              Cancel ✕
                                            </button>
                                          </div>

                                          <p className="text-stone-700 text-xs leading-relaxed font-sans font-semibold text-left">
                                            Claim eligibility for a 95% refund of <span className="font-extrabold bg-red-100 px-1.5 py-0.5 rounded text-red-800">{formatPrice(calculateRefundAmounts(p.receivedAmount).refundAmount, p.currency)}</span> (from authoritative verified payment: <span className="font-bold text-stone-900">{formatPrice(p.receivedAmount, p.currency)}</span>; platform retention 5%: <span className="font-bold text-stone-900">{formatPrice(calculateRefundAmounts(p.receivedAmount).retentionAmount, p.currency)}</span>) has been approved. Please input complete bank transfer instructions:
                                          </p>

                                          <div className="space-y-3 font-sans text-left">
                                            <div>
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">Holder Complete Name</label>
                                              <input
                                                type="text"
                                                value={refundName}
                                                onChange={(e) => setRefundName(e.target.value)}
                                                placeholder="Name of account receiver"
                                                className="w-full text-xs font-bold border-stone-200 rounded-xl p-2.5 bg-white border focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:text-stone-300"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">Bank Name / Wallet System</label>
                                              <input
                                                type="text"
                                                value={refundBankName}
                                                onChange={(e) => setRefundBankName(e.target.value)}
                                                placeholder="e.g. Allied Bank, Easypaisa, JazzCash"
                                                className="w-full text-xs font-bold border-stone-200 rounded-xl p-2.5 bg-white border focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:text-stone-300"
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">Account Number or IBAN Code</label>
                                              <input
                                                type="text"
                                                value={refundAccountNumber}
                                                onChange={(e) => setRefundAccountNumber(e.target.value)}
                                                placeholder="Receiver account number or IBAN"
                                                className="w-full text-xs font-mono font-bold border-stone-200 rounded-xl p-2.5 bg-white border focus:ring-1 focus:ring-red-500 outline-none transition-all placeholder:font-sans placeholder:text-stone-300"
                                              />
                                            </div>

                                            {/* Multiple Image Upload block */}
                                            <div className="space-y-2 pt-1 border-t border-red-100/50 mt-2 text-left font-sans">
                                              <label className="block text-[8.5px] font-black uppercase tracking-wider text-stone-400 mb-1">
                                                Attach Paid Payment Proof Receipt (You can attach multiple images of any size)
                                              </label>
                                              <div className="flex flex-col gap-2 font-sans">
                                                <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-red-200 bg-white rounded-xl cursor-pointer hover:bg-red-50/50 transition-colors group p-3 text-center">
                                                  <Upload className="w-5 h-5 text-red-300 group-hover:text-red-500 transition-colors mb-1" />
                                                  <span className="text-xs font-black text-rose-600 uppercase tracking-widest block font-sans">Attach Refund Paid Verification Proof</span>
                                                  <span className="text-[7.5px] text-stone-400 font-semibold block mt-0.5">Select one or more receipt images</span>
                                                  <input 
                                                    type="file" 
                                                    className="hidden" 
                                                    accept="image/*" 
                                                    multiple
                                                    onChange={handleRefundProofUpload} 
                                                  />
                                                </label>

                                                {refundProofImages.length > 0 && (
                                                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
                                                    {refundProofImages.map((img, idx) => (
                                                      <div key={idx} className="relative group rounded-lg overflow-hidden border border-stone-200 aspect-square bg-stone-50 flex items-center justify-center">
                                                        <img 
                                                          src={img} 
                                                          alt={`Refund Proof ${idx + 1}`} 
                                                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" 
                                                          onClick={() => setLightboxImage(img)}
                                                          referrerPolicy="no-referrer"
                                                        />
                                                        <button
                                                          type="button"
                                                          onClick={() => removeRefundProofImage(idx)}
                                                          className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 shadow-md flex items-center justify-center text-xs font-bold h-4 w-4 leading-none transition-all"
                                                          title="Remove image"
                                                        >
                                                          ✕
                                                        </button>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          <div className="p-2.5 bg-white border border-red-100 rounded-xl text-[9.5px] leading-snug text-stone-400 italic block text-left font-sans">
                                            ℹ️ Refunds takes up to 7 working days to reflect back in your account. The platform administrator verifies bank statements manually.
                                          </div>

                                          <div className="flex gap-2 pt-2 border-t border-red-200">
                                            <button
                                              type="button"
                                              onClick={() => setInlineRefundId(null)}
                                              className="flex-1 bg-white hover:bg-stone-50 border border-stone-200 text-stone-600 font-extrabold uppercase text-xs tracking-widest py-2.5 rounded-lg transition-colors text-center"
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              type="button"
                                              disabled={updating}
                                              onClick={() => confirmRefundActionInlineWithConfirm(p, refundName, refundBankName, refundAccountNumber)}
                                              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-extrabold uppercase text-xs tracking-widest py-2.5 rounded-lg transition-all text-center shadow disabled:opacity-50"
                                            >
                                              {updating ? "Saving..." : "Confirm Refund Request"}
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {['REVOKED', 'REMOVED'].includes(p.status) && p.amount && p.amount > 0 && (
                            <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-xs font-sans font-black leading-normal text-center text-stone-550 italic">
                              🛡️ This application holds non-refundable status because the badge was previously approved and activated.
                            </div>
                          )}

{/* Live Track Timeline & Document Resubmission Changelog */}
                          {renderTimelineAndRevisions(p)}
                        </div>

                        <div className="text-stone-400 text-xs font-mono border-t border-stone-200/60 mt-4 pt-3 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Submitted At: {formatDate(p.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                    </>
                  )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* EDIT PROMOTION APPLICATION MODAL */}
      {editingPromo && (
        <div 
          className="fixed inset-0 bg-stone-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto"
          onClick={() => setEditingPromo(null)}
        >
          <div 
            className="bg-white border border-stone-200/80 w-full max-w-xl rounded-3xl overflow-hidden flex flex-col shadow-2xl relative animate-in zoom-in-95 duration-200 p-6 space-y-5"
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setEditingPromo(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 p-2 rounded-xl transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="bg-amber-100 text-amber-800 text-xs font-black uppercase px-2 py-0.5 rounded-full tracking-wider mb-2 inline-block">
                Modify &amp; Re-submit Application
              </span>
              <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight">
                Edit Badge Application
              </h3>
              <p className="text-stone-400 text-xs font-mono mt-1">
                APP CODE: {editingPromo.applicationId || "Recent Request"}
              </p>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Plan Information Display */}
              <div className="bg-stone-50 border border-stone-150 p-4 rounded-2xl flex items-center justify-between text-xs font-sans">
                <div>
                  <span className="text-xs font-black text-stone-400 uppercase tracking-widest block">
                    Plan Subscribed
                  </span>
                  <span className="font-extrabold text-stone-800 uppercase italic">
                    {editingPromo.planName || "Standard Badge"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-stone-400 uppercase tracking-widest block">
                    Price Code
                  </span>
                  <span className="font-black text-emerald-700">
                    Rs. {editingPromo.amount ? editingPromo.amount.toLocaleString() : "Free"}
                  </span>
                </div>
              </div>

              {/* Specific inputs for FEATURED and BOOST badges */}
              {editingPromo.type !== 'VERIFIED' && (
                <div className="space-y-4">
                  {/* Tab Selector inside modal */}
                  <div>
                    <label className="block text-xs font-black text-stone-400 uppercase tracking-widest mb-2 italic">Select Target Listing Option</label>
                    <div className="flex gap-2 p-1.5 bg-stone-100/80 border border-stone-200/60 rounded-xl">
                      <button
                        type="button"
                        onClick={() => { setEditIsManualEntry(false); setEditSelectedListingId(''); }}
                        className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all ${!editIsManualEntry ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-400 hover:text-stone-900'}`}
                      >
                        Choose From My Listings
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditIsManualEntry(true); setEditSelectedListingId('MANUAL_ENTRY'); }}
                        className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg transition-all ${editIsManualEntry ? 'bg-stone-900 text-white shadow-sm' : 'text-stone-400 hover:text-stone-900'}`}
                      >
                        Enter Link Manually
                      </button>
                    </div>
                  </div>

                  {!editIsManualEntry ? (
                    <div className="space-y-1">
                      <label className="block text-xs font-black text-stone-400 uppercase tracking-widest italic">Target Listing Item</label>
                      <select 
                        value={editSelectedListingId}
                        onChange={(e) => setEditSelectedListingId(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl focus:ring-amber-500 focus:border-amber-500 p-3 text-stone-900 font-bold text-sm"
                        required={!editIsManualEntry}
                      >
                        <option value="">Select a listing</option>
                        {editingPromo.targetId && editingPromo.targetId !== 'MANUAL' && !userListings.some(l => l.id === editingPromo.targetId) && (
                          <option value={editingPromo.targetId}>
                            Keep Original Selected Listing (ID: {editingPromo.targetId})
                          </option>
                        )}
                        {userListings.map(listing => (
                          <option key={listing.id} value={listing.id}>
                            {listing.title} {listing.id === editingPromo.targetId ? " (Original Selected)" : ""}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-stone-400 font-medium font-sans block mt-1">
                        You can keep the currently assigned listing or change it from the list.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="block text-xs font-black text-stone-400 uppercase tracking-widest italic font-sans">Listing Link or Details</label>
                      <input 
                        type="text"
                        value={editItemLink}
                        onChange={(e) => setEditItemLink(e.target.value)}
                        placeholder="E.g., Avora listing link or product/listing details"
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl focus:ring-amber-500 focus:border-amber-500 p-3.5 text-stone-900 font-bold text-sm"
                        required
                      />
                      <span className="text-xs text-stone-400 font-medium font-sans block mt-1">
                        You can keep the original listing link/details or update them to correct errors.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* PAYMENT PROOF INPUT */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-stone-400 uppercase tracking-widest italic font-sans">Payment proof receipt photo</label>
                {!editProofImage ? (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-stone-200 bg-stone-50 rounded-2xl cursor-pointer hover:bg-stone-100 transition-colors group">
                    <Upload className="w-7 h-7 text-stone-300 group-hover:text-amber-500 transition-colors mb-1.5" />
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest">Select Receipt Image</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleEditImageUpload} />
                  </label>
                ) : (
                  <div className="relative group rounded-2xl overflow-hidden border border-stone-200">
                    <img src={editProofImage} alt="Receipt copy" className="w-full max-h-48 object-contain bg-stone-50" />
                    <button 
                      type="button"
                      onClick={() => setEditProofImage('')}
                      className="absolute top-2 right-2 bg-stone-900/80 text-white p-1.5 rounded-lg text-xs font-black uppercase tracking-wider backdrop-blur-sm opacity-100"
                    >
                      Change Photo
                    </button>
                  </div>
                )}
              </div>

              {/* Disclaimer */}
              <div className="p-3 bg-amber-50 border border-amber-100/60 rounded-xl text-[10.5px] text-amber-800 leading-normal font-medium">
                💡 <strong>Important Note:</strong> Editing and re-submitting will return the application into the operator review queue. Keep an eye on your status timeline for response updates.
              </div>

              {/* SUBMIT BUTTON ACTIONS */}
              <div className="flex gap-3 pt-3 border-t border-stone-100 font-sans">
                <button
                  type="button"
                  onClick={() => setEditingPromo(null)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-extrabold uppercase text-xs tracking-widest py-3 rounded-xl transition-colors text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-stone-950 font-extrabold uppercase text-xs tracking-widest py-3 rounded-xl transition-all text-center shadow disabled:opacity-50"
                >
                  {updating ? "Saving Details..." : "Resubmit Application"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedAppDetails && (
        <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-md flex items-center justify-center p-4 z-[999] animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl border border-stone-100 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col my-8" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-4 border-b border-stone-200 shrink-0">
               <div className="flex items-center gap-2">
                 <FileText className="w-5 h-5 text-amber-500" />
                 <h3 className="text-lg md:text-xl font-black text-stone-900 uppercase italic">Application Form Details</h3>
               </div>
               <button onClick={() => setSelectedAppDetails(null)} className="p-2 text-stone-400 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-full transition-colors font-sans cursor-pointer">
                 <X className="w-5 h-5" />
               </button>
            </div>
            
            <div className="overflow-y-auto py-5 pr-2 space-y-6 flex-1 text-stone-800 scrollbar-thin">
               {/* 1. Header block */}
               <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                 <div>
                   <span className="text-xs font-black uppercase tracking-widest text-stone-400 block mb-0.5">Application Category</span>
                   <h4 className="text-base font-extrabold uppercase text-white">
                     {selectedAppDetails.type === 'VERIFIED' ? '🌟 Premium Seller Badge' : selectedAppDetails.type === 'FEATURED' ? '🚀 Featured Ads Badge' : '⚡ Boosted Ads Badge'}
                   </h4>
                   <span className="text-xs text-stone-300 block mt-1">Package: <strong className="text-white">{selectedAppDetails.planName || 'Standard'}</strong></span>
                 </div>
                 <div className="text-right flex flex-col items-start md:items-end gap-1 shrink-0">
                   <span className="text-xs font-black uppercase tracking-widest text-stone-400 block leading-none">Application Status</span>
                   <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide border shadow-sm ${
                     selectedAppDetails.status === 'APPROVED' ? 'bg-emerald-500 text-white border-emerald-400' :
                     selectedAppDetails.status === 'PENDING' ? 'bg-amber-500 text-white border-amber-400' :
                     selectedAppDetails.status === 'REJECTED' ? 'bg-red-500 text-white border-red-400' :
                     selectedAppDetails.status === 'REVOKED' ? 'bg-rose-600 text-white border-rose-500' :
                     selectedAppDetails.status === 'RESUME_REQUESTED' ? 'bg-indigo-600 text-white border-indigo-500 animate-pulse' :
                     'bg-stone-500 text-white border-stone-400'
                   }`}>
                     {selectedAppDetails.status === 'RESUME_REQUESTED' ? 'APPEALED (RESUME REQUESTED)' : selectedAppDetails.status || 'PENDING'}
                   </span>
                 </div>
               </div>

               {/* 2. Core attributes grid */}
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="bg-stone-50 p-4 border border-stone-200/60 rounded-xl">
                   <span className="text-xs font-black text-stone-400 uppercase tracking-wider block">Application Tracking ID</span>
                   <span className="font-mono font-black text-stone-900 text-sm">{selectedAppDetails.applicationId || `APP-${selectedAppDetails.type}-${selectedAppDetails.id?.substring(0, 6).toUpperCase()}`}</span>
                 </div>
                 
                 <div className="bg-stone-50 p-4 border border-stone-200/60 rounded-xl">
                   <span className="text-xs font-black text-stone-400 uppercase tracking-wider block">Total Payment Deposited</span>
                   <span className="font-black text-emerald-700 text-sm">
                     {selectedAppDetails.amount && selectedAppDetails.amount > 0 ? `Rs. ${selectedAppDetails.amount.toLocaleString()} PKR` : 'Free Tier / Waived'}
                   </span>
                 </div>

                 <div className="bg-stone-50 p-4 border border-stone-200/60 rounded-xl">
                   <span className="text-xs font-black text-stone-400 uppercase tracking-wider block">Requested Duration</span>
                   <span className="font-black text-stone-800 text-sm">{selectedAppDetails.durationDays ? `${selectedAppDetails.durationDays} Days` : 'N/A'}</span>
                 </div>

                 <div className="bg-stone-50 p-4 border border-stone-200/60 rounded-xl">
                   <span className="text-xs font-black text-stone-400 uppercase tracking-wider block">Requested On</span>
                   <span className="font-bold text-stone-800 text-xs">
                     {selectedAppDetails.createdAt ? 
                       (selectedAppDetails.createdAt.seconds 
                         ? new Date(selectedAppDetails.createdAt.seconds * 1000).toLocaleString() 
                         : new Date(selectedAppDetails.createdAt).toLocaleString()) 
                       : 'N/A'}
                   </span>
                 </div>
               </div>

               {/* 3. Link details or attached listing */}
               {selectedAppDetails.type !== 'VERIFIED' && (
                 <div className="bg-amber-50/40 p-4 border border-amber-200/40 rounded-xl space-y-2">
                   <span className="text-xs font-black text-amber-800 uppercase tracking-widest block font-sans">Campaign Placement & Location Target</span>
                   {selectedAppDetails.itemLink ? (
                     <div className="space-y-1">
                       <span className="text-xs font-semibold text-stone-400 block">Provided Target Link:</span>
                       <a href={selectedAppDetails.itemLink} target="_blank" rel="noreferrer" className="text-amber-700 hover:text-amber-800 font-extrabold text-xs underline truncate block break-all flex items-center gap-1">
                         <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                         <span>{selectedAppDetails.itemLink}</span>
                       </a>
                     </div>
                   ) : selectedAppDetails.targetId && selectedAppDetails.targetId !== 'MANUAL' && selectedAppDetails.targetId !== 'MANUAL_ENTRY' ? (
                     <div className="space-y-1">
                       <span className="text-xs font-semibold text-stone-400 block">Attached Catalog Ad:</span>
                       <span className="text-amber-700 font-extrabold text-xs flex items-center gap-1 cursor-pointer underline" onClick={() => window.open(`/listings/${selectedAppDetails.targetId}`, '_blank')}>
                         <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                         <span>View Ad Listing (Reference: {selectedAppDetails.targetId})</span>
                       </span>
                     </div>
                   ) : (
                     <span className="text-xs text-stone-400 italic block">No specific listing campaigns attached yet.</span>
                   )}
                 </div>
               )}

               {/* 4. Payment proof receipt preview */}
               {selectedAppDetails.paymentProofImage && (
                 <div className="border border-stone-200 rounded-xl p-4 space-y-2">
                   <span className="text-xs font-black text-stone-400 uppercase tracking-wider block">Official Deposit Slip Verification Link</span>
                   <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                     <div className="flex items-center gap-3">
                       <img src={selectedAppDetails.paymentProofImage} alt="Payment Receipt" className="w-12 h-12 object-cover rounded border border-stone-200 shadow-sm shrink-0 referrerPolicy='no-referrer'" />
                       <div>
                         <span className="block font-bold text-xs text-stone-900 leading-tight">
                           {selectedAppDetails.paymentMethod || "Easypaisa"} Transfer Slip
                         </span>
                         <span className="text-xs text-stone-400 font-mono">Verified matched transaction index</span>
                         {selectedAppDetails.txHash && (
                           <div className="mt-1 flex items-center gap-2">
                             <span className="text-[11px] font-mono font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded border border-stone-200 select-all break-all">
                               TXID: {selectedAppDetails.txHash}
                             </span>
                             <a
                               href={`https://bscscan.com/tx/${selectedAppDetails.txHash}`}
                               target="_blank"
                               rel="noreferrer"
                               className="text-[10px] font-black uppercase text-amber-600 hover:underline inline-flex items-center gap-0.5 shrink-0"
                             >
                               <ExternalLink className="w-3 h-3" /> BscScan
                             </a>
                           </div>
                         )}
                       </div>
                     </div>
                     <button
                       type="button"
                       onClick={() => {
                         setLightboxImage(selectedAppDetails.paymentProofImage);
                       }}
                       className="px-4 py-2 bg-stone-900 hover:bg-stone-850 text-white font-black uppercase text-xs tracking-widest rounded-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1 shadow-sm shrink-0"
                     >
                       <Eye className="w-3.5 h-3.5" />
                       Expand Receipt Image
                     </button>
                   </div>
                 </div>
               )}

               {/* 5. Remarks / Log updates */}
               {(selectedAppDetails.rejectionReason || selectedAppDetails.paymentDenialReason || selectedAppDetails.revocationReason || selectedAppDetails.appealMessage) && (
                 <div className="border-t border-dashed border-stone-200 pt-5 space-y-4">
                   <h5 className="text-xs font-black text-stone-900 uppercase tracking-widest">Correspondence & System Log Comments</h5>
                   
                   {selectedAppDetails.status === 'REJECTED' && (selectedAppDetails.rejectionReason || selectedAppDetails.paymentDenialReason) && (
                     <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 leading-relaxed font-sans">
                       <span className="font-black uppercase tracking-widest block text-xs text-red-600 mb-2 font-sans border-b border-red-200 pb-1">Administrative Rejection Notes:</span>
                         <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 md:p-7 shadow-lg mt-3 transform transition hover:scale-[1.01]">
                          <span className="block text-xs font-black uppercase text-red-400 tracking-widest mb-2">Administrative Denial Note:</span>
                          <p className="font-black text-lg md:text-xl text-red-900 leading-tight italic">"{selectedAppDetails.paymentDenialReason || selectedAppDetails.rejectionReason || "Payment proof was invalid or matching receipt could not be traced."}"</p>
                        </div>
                     </div>
                   )}

                   {selectedAppDetails.status === 'REVOKED' && selectedAppDetails.revocationReason && (
                     <div className="p-4 bg-rose-50 border border-rose-150 rounded-xl text-xs text-rose-800 leading-relaxed font-sans">
                       <span className="font-extrabold uppercase text-xs tracking-wider block text-rose-600 mb-1">Administrative Revocation Feedback:</span>
                       <p className="font-bold">"{selectedAppDetails.revocationReason}"</p>
                     </div>
                   )}

                   {selectedAppDetails.appealMessage && (
                     <div className="p-4 bg-blue-50 border border-blue-150 rounded-xl text-xs text-blue-800 leading-relaxed font-sans italic">
                       <span className="font-extrabold uppercase text-xs tracking-wider block text-blue-600 mb-1 not-italic">Your Registered Appeal Letter:</span>
                       <p className="font-bold">"{selectedAppDetails.appealMessage}"</p>
                     </div>
                   )}
                 </div>
               )}

               {/* 6. System Terms checklist */}
               <div className="bg-stone-50 border border-stone-150 rounded-xl p-4 text-xs text-stone-400 leading-relaxed">
                 <span className="font-extrabold text-stone-700 uppercase text-xs block mb-1">📋 Platform Registration Rules Checklist</span>
                 <p>
                   By submitting this upgrade, the vendor accepts terms of manual clearance. Refunds can be claimed within 7 days from the dashboard if the application has been Rejected. Approved badges are non-transferable and can not be applied on separate profiles.
                 </p>
               </div>
            </div>
            
            <div className="pt-4 border-t border-stone-200 flex justify-end shrink-0">
               <button onClick={() => setSelectedAppDetails(null)} className="w-full sm:w-auto px-6 py-2.5 bg-stone-900 hover:bg-stone-855 text-white font-extrabold uppercase text-xs tracking-widest rounded-xl transition-all shadow-md active:scale-95 cursor-pointer text-center font-sans">
                 Close View
               </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 bg-stone-950/95 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-md anim-fade-in transition-all"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="relative max-w-4xl w-full max-h-[85vh] bg-stone-900 border border-stone-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header toolbar */}
            <div className="px-6 py-4 border-b border-stone-800 flex items-center justify-between text-stone-300">
              <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                📄 Document Viewer Log
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.open(lightboxImage, "_blank")}
                  className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-stone-950 px-3.5 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1 cursor-pointer"
                >
                  Open in New Tab ↗
                </button>
                <button 
                  onClick={() => setLightboxImage(null)}
                  className="bg-red-600 hover:bg-red-500 active:scale-95 text-white px-3.5 py-1.5 rounded-xl font-black text-xs transition-all cursor-pointer border border-red-500 flex items-center gap-1 shadow-md"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Image content */}
            <div className="flex-1 bg-stone-950 p-6 flex flex-col items-center justify-center overflow-auto min-h-[300px]">
              <img 
                src={lightboxImage} 
                alt="Document Proof Upload Preview" 
                className="max-w-full max-h-[55vh] object-contain rounded-lg hover:ring-2 hover:ring-amber-500/50 transition-all cursor-pointer"
                onClick={() => window.open(lightboxImage, "_blank")}
                title="Click image to open full resolution in new tab"
              />
              <span className="text-stone-400 text-xs uppercase font-bold tracking-wider mt-3">
                💡 Tip: Click on the document image to view full resolution in a new tab
              </span>
            </div>

            {/* Bottom context notice */}
            <div className="px-6 py-4 border-t border-stone-800 bg-stone-900 text-center text-stone-450 text-xs font-bold uppercase tracking-widest">
              Secured Document Preview • Pakistan Marketplace Portal
            </div>
          </div>
        </div>
      )}

      {/* APPEAL DISPUTE MODAL */}
      {isAppealModalOpen && appealPromotion && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-stone-900/80 backdrop-blur-md" 
            onClick={() => !isAppealing && setIsAppealModalOpen(false)} 
          />
          <div className="relative bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-stone-200 overflow-hidden flex flex-col font-sans animate-in zoom-in-95 duration-200 max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shadow-sm">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-stone-900 uppercase tracking-tight leading-tight">File Dispute Appeal</h3>
                  <p className="text-xs text-stone-400 font-bold uppercase tracking-widest leading-none mt-0.5">Status: {appealPromotion.status}</p>
                </div>
              </div>
              <button 
                onClick={() => !isAppealing && setIsAppealModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-stone-900">
              {/* Profile Card Section */}
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl flex items-center gap-4">
                <div className="w-16 h-16 rounded-full border-2 border-white shadow-md overflow-hidden bg-white shrink-0">
                  <img 
                    src={userProfile?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile?.name || userProfile?.username || 'User')}&background=random`} 
                    alt="User Profile" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-black text-stone-400 uppercase tracking-widest block mb-1">Applicant Profile</span>
                  <p className="font-black text-stone-900 uppercase italic leading-none truncate">{userProfile?.name || userProfile?.username || 'Verified Member'}</p>
                  <p className="text-xs text-stone-400 font-mono mt-1 flex items-center gap-1.5">
                    <span className="font-bold">UID:</span> {userProfile?.id.substring(0, 12).toUpperCase()}
                  </p>
                </div>
                <button 
                  onClick={() => navigate(userProfile?.username ? `/user/${userProfile.username}` : `/user/${userProfile?.id}`)}
                  className="bg-white border border-stone-200 p-2 rounded-lg text-stone-400 hover:text-stone-900 hover:border-stone-400 transition-all shadow-sm active:scale-95 cursor-pointer"
                  title="View Public Profile"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>

              {/* Badge Details Section */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-widest block mb-1">Badge Issued On</span>
                  <div className="flex items-center gap-1.5 text-emerald-900 font-black text-xs">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{appealPromotion.approvedAt ? formatDate(appealPromotion.approvedAt) : 'Real-time'}</span>
                  </div>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                  <span className="text-xs font-black text-rose-600 uppercase tracking-widest block mb-1">Badge Revoked On</span>
                  <div className="flex items-center gap-1.5 text-rose-900 font-black text-xs">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{appealPromotion.revokedAt ? formatDate(appealPromotion.revokedAt) : (appealPromotion.updatedAt ? formatDate(appealPromotion.updatedAt) : 'Real-time')}</span>
                  </div>
                </div>
              </div>

              {/* Appeal Message Section */}
              <div className="space-y-2 text-left">
                <label className="block text-xs font-black uppercase tracking-widest text-stone-400 pl-1">
                  Detailed Appeal Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={appealMessage}
                  onChange={(e) => setAppealMessage(e.target.value)}
                  placeholder="Explain why your badge was revoked and why you believe it was an error..."
                  className="w-full h-32 p-4 bg-stone-50 border border-stone-200 rounded-2xl text-sm font-bold text-stone-900 focus:bg-white focus:ring-2 focus:ring-red-500 outline-none transition-all resize-none placeholder:text-stone-300 placeholder:italic"
                />
              </div>

              {/* Multiple Image Attachments Section */}
              <div className="space-y-3">
                <label className="block text-xs font-black uppercase tracking-widest text-stone-400 pl-1 text-left">
                  Supporting Documents / Images
                </label>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50 hover:bg-white hover:border-red-400 transition-all cursor-pointer group p-4 text-center">
                    <Upload className="w-6 h-6 text-stone-300 group-hover:text-red-500 transition-colors mb-1" />
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest font-sans">Add Image</span>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      multiple 
                      onChange={handleAppealImageUpload} 
                    />
                  </label>

                  {appealImages.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-stone-200 shadow-sm bg-stone-100 group">
                      <img 
                        src={img} 
                        alt={`Attachment ${idx + 1}`} 
                        className="w-full h-full object-cover cursor-zoom-in hover:scale-110 transition-transform duration-300" 
                        onClick={() => setLightboxImage(img)}
                        referrerPolicy="no-referrer"
                      />
                      <button
                        onClick={() => removeAppealImage(idx)}
                        className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-stone-400 font-bold italic text-left">
                  💡 You can attach multiple images of any size showing evidence in your favor.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-stone-100 bg-stone-50/50 flex flex-col sm:flex-row gap-3">
              <button
                disabled={isAppealing}
                onClick={() => setIsAppealModalOpen(false)}
                className="flex-1 px-6 py-3 bg-white hover:bg-stone-100 text-stone-600 font-black uppercase text-xs tracking-widest rounded-xl transition-all border border-stone-200 shadow-sm disabled:opacity-50"
              >
                Cancel Action
              </button>
              <button
                disabled={isAppealing || !appealMessage.trim()}
                onClick={submitAppeal}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs tracking-widest rounded-xl transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isAppealing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Submit Official Appeal
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Request Confirmation Modal */}
      {confirmingRefundFor && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={() => setConfirmingRefundFor(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl border border-stone-200 overflow-hidden flex flex-col font-sans animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 text-red-600">
                <AlertCircle className="w-6 h-6" />
                <h3 className="font-extrabold text-lg text-stone-900">Request Refund</h3>
              </div>
              <p className="text-stone-600 text-sm mb-4 leading-relaxed">
                Are you sure you want to request a 95% refund of <span className="font-extrabold text-stone-900">{formatPrice(calculateRefundAmounts(confirmingRefundFor.receivedAmount).refundAmount, confirmingRefundFor.currency)}</span> (from verified payment: <span className="font-bold">{formatPrice(confirmingRefundFor.receivedAmount, confirmingRefundFor.currency)}</span>; platform retention 5%: <span className="font-bold">{formatPrice(calculateRefundAmounts(confirmingRefundFor.receivedAmount).retentionAmount, confirmingRefundFor.currency)}</span>) for this rejected request?
              </p>
              <p className="text-stone-400 text-xs mb-6">
                After confirmation, a refund request will be sent to the administrator. The money will be refunded within 7 working days.
              </p>
              <div className="space-y-3 mb-6">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Complete Name</label>
                  <input
                    type="text"
                    value={refundName}
                    onChange={(e) => setRefundName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full text-sm border-stone-200 rounded-lg p-2.5 bg-stone-50 border focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={refundBankName}
                    onChange={(e) => setRefundBankName(e.target.value)}
                    placeholder="e.g. UBL, Easypaisa, JazzCash"
                    className="w-full text-sm border-stone-200 rounded-lg p-2.5 bg-stone-50 border focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={refundAccountNumber}
                    onChange={(e) => setRefundAccountNumber(e.target.value)}
                    placeholder="Enter account number or IBAN"
                    className="w-full text-sm border-stone-200 rounded-lg p-2.5 bg-stone-50 border focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setConfirmingRefundFor(null)}
                  className="flex-1 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold text-sm rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmRefundAction()}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
                >
                  Confirm Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KYC WARNING MODAL */}
      {showKycPopup && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-stone-955/80 backdrop-blur-md" 
            onClick={() => setShowKycPopup(false)} 
          />
          <div className="relative bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl border border-rose-100 overflow-hidden flex flex-col font-sans animate-in zoom-in-95 duration-300">
            <div className="p-8 sm:p-10 text-center">
              <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <ShieldAlert className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-black text-stone-900 uppercase italic tracking-tighter mb-4">
                KYC Verification Required
              </h3>
              <p className="text-stone-400 text-xs sm:text-sm font-bold leading-relaxed mb-8">
                You can't submit application for grant of premium seller badge until you have an active status of KYC verification.
              </p>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => navigate('/profile?tab=kyc')}
                  className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-xl shadow-rose-600/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-5 h-5" /> Complete KYC verification for free
                </button>
                <button
                  type="button"
                  onClick={() => setShowKycPopup(false)}
                  className="w-full py-4 bg-stone-100 hover:bg-stone-200 text-stone-400 font-black uppercase text-xs tracking-widest rounded-2xl transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
