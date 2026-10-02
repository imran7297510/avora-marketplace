import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCredits } from '../features/credits/hooks/useCredits';
import { CREDIT_PACKAGES } from '../features/credits/constants';
import { CreditLedgerModal } from '../features/credits/components/CreditLedgerModal';
import { DemoCreditsService } from '../features/credits/services/demoCreditsService';
import { PAYMENT_METHODS } from '../lib/promotionPackages';
import { db } from '../lib/firebase';
import { collection, addDoc, query, where, getDocs, orderBy, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Coins, 
  Upload, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  FileText, 
  X, 
  Check, 
  Building2, 
  Smartphone, 
  Copy, 
  Loader2,
  ChevronRight,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

export function CreditsPage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const { creditsBalance, totalCreditsPurchased, totalCreditsSpent, loading: creditsLoading } = useCredits();

  // Demo credits state
  const [demoBalance, setDemoBalance] = useState<number>(0);

  // Purchase flow state
  const [selectedPackageId, setSelectedPackageId] = useState<string>('pro_pack'); // Default popular
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('EASYPAISA');
  const [bankCurrency, setBankCurrency] = useState<'PKR' | 'USD'>('PKR');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofFileName, setProofFileName] = useState<string>('');
  const [txHash, setTxHash] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [submitSuccess, setSubmitSuccess] = useState<string>('');
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Applications list state
  const [myApplications, setMyApplications] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  // Modals state
  const [showLedgerModal, setShowLedgerModal] = useState(false);

  useEffect(() => {
    // Load demo balance
    if (user) {
      setDemoBalance(DemoCreditsService.getDemoBalance(user.uid));
      fetchUserApplications();
    }
  }, [user]);

  const handleCopy = (text: string, label: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error("Failed to copy text", err);
    }
  };

  const fetchUserApplications = async () => {
    if (!user) return;
    setLoadingApps(true);
    try {
      const q = query(
        collection(db, 'credit_applications'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const apps = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMyApplications(apps);
    } catch (err) {
      console.error("Error fetching credit applications:", err);
      // Fallback query without orderBy if index is building
      try {
        const qFallback = query(
          collection(db, 'credit_applications'),
          where('userId', '==', user.uid)
        );
        const snapshot = await getDocs(qFallback);
        const apps = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setMyApplications(apps);
      } catch (fallbackErr) {
        console.error("Fallback query failed:", fallbackErr);
      }
    } finally {
      setLoadingApps(false);
    }
  };

  const handleGetDemoCredits = () => {
    if (!user) return;
    DemoCreditsService.resetDemoBalance(user.uid);
    const newBal = DemoCreditsService.getDemoBalance(user.uid);
    setDemoBalance(newBal);
  };

  const selectedPackage = CREDIT_PACKAGES.find(p => p.id === selectedPackageId) || CREDIT_PACKAGES[1];
  const paymentMethodConfig = PAYMENT_METHODS.find(m => m.id === selectedPaymentMethod) || PAYMENT_METHODS[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
      setProofFileName(file.name);
      setSubmitError('');
    }
  };

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    if (!selectedPackage) {
      setSubmitError('Please select a valid credit package.');
      return;
    }
    if (paymentMethodConfig.requiresImage && !proofFile) {
      setSubmitError('Please upload your payment proof image.');
      return;
    }
    if (paymentMethodConfig.requiresTxHash && !txHash.trim()) {
      setSubmitError('Please enter your USDT transaction hash (TXID).');
      return;
    }

    setSubmitError('');
    setShowReviewModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomHex = Math.floor(100000 + Math.random() * 900000);
      const applicationId = `HC-${dateStr}-${randomHex}`;

      let proofUrl = '';
      if (proofFile) {
        try {
          const storage = getStorage();
          const storageRef = ref(storage, `credit_proofs/${user.uid}/${applicationId}/${proofFile.name}`);
          const snapshot = await uploadBytes(storageRef, proofFile);
          proofUrl = await getDownloadURL(snapshot.ref);
        } catch (storageErr) {
          console.error("Firebase Storage upload failed:", storageErr);
          setSubmitError("Payment proof could not be uploaded. Please try again. Your Credit application has not been submitted.");
          setSubmitting(false);
          return;
        }
      } else if (paymentMethodConfig.requiresImage) {
        setSubmitError("Payment proof could not be uploaded. Please try again. Your Credit application has not been submitted.");
        setSubmitting(false);
        return;
      }

      const applicationData = {
        applicationId,
        userId: user.uid,
        userName: userProfile?.name || user.displayName || 'Marketplace Member',
        userEmail: user.email || '',
        packageId: selectedPackage.id,
        packageName: selectedPackage.name,
        credits: selectedPackage.credits,
        usdPrice: selectedPackage.usdPrice,
        paymentMethod: selectedPaymentMethod,
        paymentProofUrl: proofUrl,
        originalFilename: proofFile?.name || '',
        originalMimeType: proofFile?.type || '',
        originalSize: proofFile?.size || 0,
        transactionId: txHash.trim() || '',
        status: 'PENDING',
        verificationStage: 'PENDING_VERIFICATION',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'credit_applications'), applicationData);

      // Also mirror to promotionRequests for backward compatibility if needed
      try {
        await addDoc(collection(db, 'promotionRequests'), {
          ...applicationData,
          type: 'CREDITS',
        });
      } catch (mirrorErr) {
        console.warn("Mirroring application to promotionRequests failed:", mirrorErr);
      }

      setSubmitSuccess(`Application ${applicationId} submitted successfully! Payment verifiers will review your payment and issue your credits shortly.`);
      setShowReviewModal(false);
      setProofFile(null);
      setProofFileName('');
      setTxHash('');
      fetchUserApplications();
    } catch (err: any) {
      console.error("Error submitting credit application:", err);
      setSubmitError(err?.message || 'Failed to submit credit application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getPackagePriceText = (pkg: typeof CREDIT_PACKAGES[0]) => {
    if (selectedPaymentMethod === 'EASYPAISA') {
      return pkg.id === 'starter_pack' ? 'PKR 300' :
             pkg.id === 'pro_pack' ? 'PKR 1,400' :
             pkg.id === 'power_pack' ? 'PKR 2,800' : 'PKR 7,000';
    }
    if (selectedPaymentMethod === 'BANK_TRANSFER') {
      if (bankCurrency === 'PKR') {
        return pkg.id === 'starter_pack' ? 'PKR 300' :
               pkg.id === 'pro_pack' ? 'PKR 1,400' :
               pkg.id === 'power_pack' ? 'PKR 2,800' : 'PKR 7,000';
      }
      return `$${pkg.usdPrice.toFixed(2)}`;
    }
    if (selectedPaymentMethod === 'CRYPTO') {
      return `$${pkg.usdPrice.toFixed(2)} USDT`;
    }
    return `$${pkg.usdPrice.toFixed(2)}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-2.5 sm:px-4 py-4 sm:py-8 space-y-6 sm:space-y-8">
      {/* HEADER */}
      <div className="text-center space-y-2 sm:space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 text-[11px] sm:text-xs font-black uppercase tracking-wider">
          <Coins className="w-3.5 h-3.5" /> Official Financial Hub
        </div>
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-stone-900 italic uppercase tracking-tighter">
          Avora Hub <span className="text-amber-500 underline decoration-stone-900">Credits</span>
        </h1>
        <p className="text-stone-500 text-xs sm:text-sm md:text-base max-w-2xl mx-auto font-medium px-2 leading-relaxed">
          Credits are Avora platform credits used for eligible marketplace activities such as Battle Bids live auctions and Private Negotiations. Avora is a platform and the payment methods below are manual payment instructions.
        </p>
      </div>

      {/* 1. BALANCES SECTION: REAL VS DEMO SEPARATED (COMPACT MOBILE DENSITY) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* REAL CREDITS CARD */}
        <div className="bg-stone-900 text-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 md:p-8 border border-stone-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-36 h-36 sm:w-48 sm:h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="space-y-3 sm:space-y-4 relative z-10">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 whitespace-nowrap">
                ⭐ Real Credits Wallet
              </span>
              <button 
                type="button"
                onClick={() => setShowLedgerModal(true)}
                className="text-[11px] sm:text-xs font-bold text-stone-300 hover:text-white flex items-center gap-1 sm:gap-1.5 bg-stone-800/80 hover:bg-stone-800 px-2.5 py-1 sm:py-1.5 rounded-xl border border-stone-700 transition-colors cursor-pointer shrink-0"
              >
                <FileText className="w-3.5 h-3.5 text-amber-400" /> <span className="hidden xs:inline">Transaction</span> History
              </button>
            </div>
            <div>
              <div className="text-3xl sm:text-5xl font-black text-amber-400 tracking-tight">
                {creditsLoading ? <Loader2 className="w-7 h-7 animate-spin inline text-amber-400" /> : creditsBalance}
              </div>
              <p className="text-[11px] sm:text-xs text-stone-400 font-medium mt-0.5">Available Real Credits Balance</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-stone-800 text-[11px] sm:text-xs">
              <div>
                <span className="text-stone-400 block font-medium">Total Purchased</span>
                <span className="text-white font-bold text-xs sm:text-sm">{totalCreditsPurchased} Credits</span>
              </div>
              <div>
                <span className="text-stone-400 block font-medium">Total Spent</span>
                <span className="text-white font-bold text-xs sm:text-sm">{totalCreditsSpent} Credits</span>
              </div>
            </div>
          </div>
          <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 relative z-10">
            <a 
              href="#manual-payment-section"
              className="w-full py-2.5 sm:py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              Buy More Credits <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* DEMO CREDITS CARD (HIGH CONTRAST & VISIBILITY) */}
        <div className="bg-gradient-to-br from-indigo-950 via-stone-900 to-indigo-900 text-white rounded-2xl sm:rounded-[2rem] p-4 sm:p-6 md:p-8 border border-indigo-500/40 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-36 h-36 sm:w-48 sm:h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="space-y-3 sm:space-y-4 relative z-10">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded-full border border-indigo-400/30 whitespace-nowrap">
                🧪 Trial / Demo Credits
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-indigo-300/80 uppercase tracking-wider">Sandbox Only</span>
            </div>
            <div>
              <div className="text-3xl sm:text-5xl font-black text-indigo-200 tracking-tight">
                {demoBalance}
              </div>
              <p className="text-[11px] sm:text-xs text-indigo-300 font-medium mt-0.5">Available Demo Balance for Risk-Free Testing</p>
            </div>
            <p className="text-[11px] sm:text-xs text-indigo-100 font-medium leading-relaxed bg-indigo-950/60 p-2.5 sm:p-3 rounded-xl border border-indigo-500/30">
              Demo credits are completely isolated trial tokens used to test Battle Bids and Private Negotiations. They never affect your real credits balance or ledger.
            </p>
          </div>
          <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 relative z-10">
            <button 
              type="button"
              onClick={handleGetDemoCredits}
              className="w-full py-2.5 sm:py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer border border-indigo-400/30"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-300" /> Get Free Demo Credits
            </button>
          </div>
        </div>
      </div>

      {/* SUCCESS / ERROR NOTICES */}
      {submitSuccess && (
        <div className="p-3.5 sm:p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-start gap-3 shadow-sm">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm font-medium">{submitSuccess}</div>
        </div>
      )}

      {/* 3. READ-ONLY CREDIT PACKAGE PREVIEW (COMPACT PREVIEW ONLY) */}
      <div className="space-y-2 pt-1 border-t border-stone-200/80">
        <div className="text-center">
          <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest block">Read-Only Overview</span>
          <h2 className="text-base sm:text-xl font-black text-stone-900 uppercase tracking-tight">
            Credit Packages Pricing Overview
          </h2>
          <p className="text-stone-500 text-[10px] sm:text-xs font-medium mt-0.5">
            Standard exchange rates. Select payment channel below to initiate deposit.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
          {CREDIT_PACKAGES.map((pkg) => {
            return (
              <div 
                key={pkg.id}
                className="rounded-xl p-2.5 sm:p-3 border-2 border-stone-300 bg-white shadow-2xs flex flex-col justify-between relative mt-2"
              >
                {pkg.badgeText && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-stone-900 text-amber-400 text-[8px] font-black uppercase tracking-widest px-2 py-0.25 rounded-full shadow-2xs whitespace-nowrap z-10">
                    {pkg.badgeText}
                  </span>
                )}
                <div className="space-y-0.5 pt-1">
                  <h3 className="text-xs font-black text-stone-900 truncate">{pkg.name}</h3>
                  <div className="text-base sm:text-lg font-black text-amber-600 tracking-tight">
                    {pkg.credits} <span className="text-[9px] font-bold text-stone-500 uppercase">Credits</span>
                  </div>
                  <p className="text-[9.5px] text-stone-500 font-medium leading-tight line-clamp-2">
                    {pkg.description}
                  </p>
                </div>
                <div className="mt-2 pt-1.5 border-t border-stone-100 flex items-center justify-between text-[10px] font-sans">
                  <div>
                    <span className="text-[8.5px] font-bold text-stone-400 block uppercase leading-none">USD</span>
                    <span className="font-black text-stone-900">${pkg.usdPrice.toFixed(2)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8.5px] font-bold text-stone-400 block uppercase leading-none">PKR</span>
                    <span className="font-black text-stone-900">
                      {pkg.id === 'starter_pack' ? 'PKR 300' :
                       pkg.id === 'pro_pack' ? 'PKR 1,400' :
                       pkg.id === 'power_pack' ? 'PKR 2,800' : 'PKR 7,000'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. MANUAL PAYMENT & PROOF SUBMISSION */}
      <div id="manual-payment-section" className="bg-white rounded-2xl sm:rounded-[2.5rem] border border-stone-200 p-4 sm:p-8 shadow-xl space-y-6">
        <div>
          <h3 className="text-lg sm:text-2xl font-black text-stone-900 uppercase tracking-tight">
            Manual Payment &amp; Proof Submission
          </h3>
          <p className="text-stone-500 text-xs sm:text-sm font-medium mt-1 leading-relaxed">
            Transfer funds using one of our verified manual payment channels below, then submit your payment proof for verification.
          </p>
        </div>

        {/* 5. PAYMENT METHOD CARDS (AUDIENCE LABELS ON LINE 1) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          {PAYMENT_METHODS.map((method) => {
            const isSelected = selectedPaymentMethod === method.id;
            return (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelectedPaymentMethod(method.id)}
                className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected 
                    ? 'border-stone-900 bg-stone-900 text-white shadow-md' 
                    : 'border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`p-1.5 rounded-lg text-xs font-black uppercase ${
                    isSelected ? 'bg-amber-500 text-stone-950' : 'bg-stone-200 text-stone-700'
                  }`}>
                    {method.id === 'EASYPAISA' && <Smartphone className="w-4 h-4" />}
                    {method.id === 'BANK_TRANSFER' && <Building2 className="w-4 h-4" />}
                    {method.id === 'CRYPTO' && <Coins className="w-4 h-4" />}
                  </span>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${isSelected ? 'border-amber-400 bg-amber-400 text-stone-950' : 'border-stone-300'}`}>
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>

                <div>
                  {/* Line 1: Name + Audience Label side by side */}
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-xs sm:text-sm font-black uppercase tracking-tight truncate">
                      {method.name}
                    </span>
                    <span className={`text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded border ${
                      isSelected 
                        ? 'bg-amber-400 text-stone-950 border-amber-500' 
                        : 'bg-stone-200 text-stone-600 border-stone-300'
                    }`}>
                      {method.id === 'EASYPAISA' && 'For Pakistani Users'}
                      {method.id === 'BANK_TRANSFER' && 'For Global Users'}
                      {method.id === 'CRYPTO' && 'For All Users'}
                    </span>
                  </div>
                  {/* Line 2: Subtitle */}
                  <div className={`text-[10px] font-medium font-sans truncate ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                    {method.id === 'EASYPAISA' ? 'Instant Mobile Wallet' :
                     method.id === 'BANK_TRANSFER' ? 'National Bank of Pakistan' : 'USDT BEP20 Network'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* PAYMENT CHANNEL DETAILS & CURRENCY SELECTOR */}
        <div className="bg-stone-50 rounded-2xl p-4 sm:p-6 border border-stone-200 space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <span className="text-xs font-black uppercase tracking-wider text-stone-600">
              Channel Transfer Details
            </span>
          </div>

          {/* 6. EASYPAISA DETAILS */}
          {selectedPaymentMethod === 'EASYPAISA' && (
            <div className="space-y-3 text-xs sm:text-sm font-sans">
              <p className="text-stone-700 font-medium">{paymentMethodConfig.instructions}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div className="bg-white p-3 rounded-xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Account Number</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-mono font-black text-stone-900 text-sm">0346-7297510</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('0346-7297510', 'ep_num')}
                      className="px-2 py-1 bg-stone-900 text-amber-400 rounded text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
                    >
                      {copiedText === 'ep_num' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedText === 'ep_num' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Account Title</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-black text-stone-900 text-sm">Muhammad Imran</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('Muhammad Imran', 'ep_title')}
                      className="px-2 py-1 bg-stone-900 text-amber-400 rounded text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer"
                    >
                      {copiedText === 'ep_title' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedText === 'ep_title' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 7. BANK TRANSFER DETAILS & COMPACT CURRENCY TOGGLE */}
          {selectedPaymentMethod === 'BANK_TRANSFER' && (
            <div className="space-y-3.5 text-xs sm:text-sm font-sans">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
                <p className="text-stone-700 font-medium">{paymentMethodConfig.instructions}</p>

                {/* Compact Currency Selector - Polished Dark Theme */}
                <div className="bg-stone-900 border border-stone-800 p-2 rounded-xl shadow-md shrink-0 w-full sm:w-auto">
                  <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-2">
                    <div>
                      <span className="text-[10.5px] font-black text-white uppercase tracking-wider block">
                        Select Payment Currency
                      </span>
                      <span className="text-[9.5px] text-amber-400/90 font-medium block">
                        Choose the currency you will send via bank transfer
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="bg-white p-3 rounded-xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Bank Name</span>
                  <span className="font-black text-stone-900 text-xs sm:text-sm">National Bank of Pakistan</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">IBAN Number</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-mono font-black text-stone-900 text-xs select-all break-all">PK47NBPA1674004094573230</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('PK47NBPA1674004094573230', 'iban')}
                      className="px-2 py-1 bg-stone-900 text-amber-400 rounded text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedText === 'iban' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedText === 'iban' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Account Title</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-black text-stone-900 text-xs sm:text-sm">Muhammad Imran</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('Muhammad Imran', 'bank_title')}
                      className="px-2 py-1 bg-stone-900 text-amber-400 rounded text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedText === 'bank_title' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedText === 'bank_title' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 8. CRYPTOCURRENCY DETAILS */}
          {selectedPaymentMethod === 'CRYPTO' && (
            <div className="space-y-3 text-xs sm:text-sm font-sans">
              <p className="text-stone-700 font-medium">{paymentMethodConfig.instructions}</p>
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-amber-900 text-xs font-medium space-y-1">
                <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-amber-800">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" /> Important Network Warning
                </div>
                <p>{(paymentMethodConfig as any).warning}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-white p-3 rounded-xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">Network</span>
                  <span className="font-black text-stone-900 text-xs sm:text-sm">BNB Smart Chain (BEP20 / BSC)</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-200">
                  <span className="text-[10px] text-stone-400 font-bold uppercase block">USDT Wallet Address</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-mono font-black text-stone-900 text-xs select-all break-all">0xdDBAA957EF06B0A6D363F03f2C34919ada605797</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('0xdDBAA957EF06B0A6D363F03f2C34919ada605797', 'crypto')}
                      className="px-2 py-1 bg-stone-900 text-amber-400 rounded text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedText === 'crypto' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedText === 'crypto' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 9. ACTUAL SELECTABLE CREDIT PACKAGES (AFTER DETAILS & CURRENCY) */}
        <div className="space-y-2 border-t border-stone-100 pt-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-stone-900 uppercase tracking-wide italic">
              Select Your Credit Package
            </h4>
            <span className="text-[9.5px] font-bold text-stone-500 uppercase tracking-wider">
              {selectedPaymentMethod === 'EASYPAISA' ? 'PKR Pricing' :
               selectedPaymentMethod === 'BANK_TRANSFER' ? `${bankCurrency} Pricing` : 'USDT Pricing'}
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
            {CREDIT_PACKAGES.map((pkg) => {
              const isSelected = selectedPackageId === pkg.id;
              const priceText = getPackagePriceText(pkg);
              return (
                <div 
                  key={pkg.id}
                  onClick={() => setSelectedPackageId(pkg.id)}
                  className={`rounded-xl p-2.5 sm:p-3 border-2 transition-all cursor-pointer flex flex-col justify-between relative mt-2 ${
                    isSelected 
                      ? 'border-amber-500 bg-amber-500/5 shadow-sm ring-1 ring-amber-500/30' 
                      : 'border-stone-200 bg-white hover:border-stone-300 shadow-2xs'
                  }`}
                >
                  {pkg.badgeText && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-stone-900 text-amber-400 text-[8px] font-black uppercase tracking-widest px-2 py-0.25 rounded-full shadow-2xs whitespace-nowrap z-10">
                      {pkg.badgeText}
                    </span>
                  )}
                  <div className="space-y-0.5 pt-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-xs font-black text-stone-900 truncate">{pkg.name}</h3>
                      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 shrink-0 ${isSelected ? 'border-amber-500 bg-amber-500 text-white' : 'border-stone-300'}`}>
                        {isSelected && <Check className="w-2 h-2 stroke-[3]" />}
                      </div>
                    </div>
                    <div className="text-base sm:text-lg font-black text-amber-600 tracking-tight">
                      {pkg.credits} <span className="text-[9px] font-bold text-stone-500 uppercase">Credits</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-stone-100 flex items-center justify-between font-sans">
                    <span className="text-[9px] font-bold text-stone-400 uppercase">Amount Due</span>
                    <span className="text-xs font-black text-stone-900">{priceText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 10. PROOF UPLOAD & SUBMISSION FORM */}
        <form onSubmit={handleProceedToReview} className="space-y-4 border-t border-stone-100 pt-4">
          {paymentMethodConfig.requiresImage && (
            <div className="space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
                Upload Payment Proof Image <span className="text-red-500">*</span>
              </label>
              <div className="border-2 border-dashed border-stone-300 hover:border-amber-500 rounded-xl p-4 text-center bg-stone-50/50 transition-colors relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center space-y-1.5 pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-bold text-stone-800">
                    {proofFileName ? <span className="text-emerald-600 font-black">Selected: {proofFileName}</span> : 'Click to attach payment receipt screenshot'}
                  </div>
                  <span className="text-[10px] text-stone-400 font-medium">PNG, JPEG, WebP or HEIC supported</span>
                </div>
              </div>
            </div>
          )}

          {paymentMethodConfig.requiresTxHash && (
            <div className="space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-wider text-stone-700">
                USDT Transaction Hash / TXID <span className="text-red-500">*</span>
              </label>
              <input 
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="Paste your BEP20 transaction hash here..."
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          )}

          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
              {submitError}
            </div>
          )}

          <button 
            type="submit"
            className="w-full py-3.5 bg-stone-900 hover:bg-stone-800 text-white font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
          >
            Review &amp; Submit Credit Application <ChevronRight className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* MY APPLICATIONS SECTION */}
      <div className="space-y-3 pt-4">
        <h3 className="text-lg sm:text-xl font-black text-stone-900 uppercase tracking-tight">
          My Credit Applications
        </h3>
        
        {loadingApps ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-7 h-7 animate-spin text-amber-500" />
          </div>
        ) : myApplications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200 p-6 text-center text-stone-500 font-medium text-xs">
            No credit purchase applications submitted yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {myApplications.map((app) => (
              <div key={app.id} className="bg-white rounded-2xl border border-stone-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-stone-900 text-sm">{app.applicationId || app.id}</span>
                    <span className={`text-[9.5px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      app.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                      app.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' :
                      'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                    }`}>
                      {app.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500 font-medium">
                    Package: <strong className="text-stone-800">{app.packageName} ({app.credits} Credits)</strong> • Method: <strong className="text-stone-800">{app.paymentMethod}</strong>
                  </div>
                  {app.rejectionReason && (
                    <div className="text-[11px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded mt-1">
                      Reason: {app.rejectionReason}
                    </div>
                  )}
                </div>
                <div className="text-right sm:text-right w-full sm:w-auto flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-stone-100">
                  <div className="text-sm font-black text-stone-900">${app.usdPrice?.toFixed(2)} USD</div>
                  <div className="text-[10px] text-stone-400 font-medium">
                    {app.createdAt?.toDate ? app.createdAt.toDate().toLocaleDateString() : 'Recently'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* REVIEW CONFIRMATION MODAL */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-md w-full p-5 sm:p-7 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-black text-stone-900 uppercase">Confirm Credit Application</h3>
              <button 
                type="button" 
                onClick={() => setShowReviewModal(false)}
                className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-sans">
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500 font-medium">Package</span>
                <span className="font-bold text-stone-900">{selectedPackage.name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500 font-medium">Credits Amount</span>
                <span className="font-bold text-amber-600">{selectedPackage.credits} Credits</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500 font-medium">Amount Due</span>
                <span className="font-bold text-stone-900">{getPackagePriceText(selectedPackage)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-stone-100">
                <span className="text-stone-500 font-medium">Payment Method</span>
                <span className="font-bold text-stone-900">{paymentMethodConfig.name}</span>
              </div>
              {proofFileName && (
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500 font-medium">Attached Proof</span>
                  <span className="font-bold text-emerald-600 truncate max-w-[180px]">{proofFileName}</span>
                </div>
              )}
              {txHash && (
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500 font-medium">TXID</span>
                  <span className="font-bold text-stone-900 truncate max-w-[180px]">{txHash}</span>
                </div>
              )}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-amber-800 text-xs font-bold text-center">
              Are you sure you want to submit this Credit application?
            </div>

            <div className="flex gap-2.5 pt-1">
              <button 
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={submitting}
                onClick={handleConfirmSubmit}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTION HISTORY LEDGER MODAL */}
      <CreditLedgerModal isOpen={showLedgerModal} onClose={() => setShowLedgerModal(false)} />
    </div>
  );
}

export default CreditsPage;
