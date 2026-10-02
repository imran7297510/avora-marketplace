import React, { useState } from 'react';
import {
  X,
  Coins,
  Check,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Sparkles,
  Copy,
  Smartphone,
  Building2,
  CreditCard,
  Upload,
  CheckCircle,
  FileText,
} from 'lucide-react';
import { useCredits } from '../hooks/useCredits';
import { CREDIT_PACKAGES, USD_TO_CREDITS_RATE } from '../constants';
import { PAYMENT_METHODS } from '../../../lib/promotionPackages';
import { useAuth } from '../../../context/AuthContext';
import { CreditsService } from '../services/creditsService';

export const CreditPurchaseModal: React.FC = () => {
  const { isPurchaseOpen, isDemoMode, closePurchase } = useCredits();
  const { user, userProfile } = useAuth();

  const [selectedPackageId, setSelectedPackageId] = useState<string>('pro_pack');
  const [selectedMethodId, setSelectedMethodId] = useState<string>('EASYPAISA');
  const [paymentProofUrl, setPaymentProofUrl] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string>('');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const [step, setStep] = useState<'SELECT' | 'PAYMENT' | 'SUBMITTED'>('SELECT');
  const [loading, setLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  if (!isPurchaseOpen) return null;

  const selectedPack = CREDIT_PACKAGES.find((p) => p.id === selectedPackageId) || CREDIT_PACKAGES[1];
  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === selectedMethodId) || PAYMENT_METHODS[0];

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleSubmitApplication = async () => {
    if (!user) {
      setFeedback({ success: false, message: 'Please log in to purchase credits.' });
      return;
    }

    if (selectedMethod.requiresImage && !paymentProofUrl && !transactionId) {
      setFeedback({
        success: false,
        message: 'Please provide either a payment receipt image URL or transaction ID.',
      });
      return;
    }

    if (selectedMethod.requiresTxHash && !transactionId) {
      setFeedback({
        success: false,
        message: 'Transaction ID / Hash (TXID) is required for crypto payments.',
      });
      return;
    }

    setLoading(true);
    setFeedback(null);

    const res = await CreditsService.submitCreditApplication({
      userId: user.uid,
      userName: userProfile?.displayName || user.displayName || 'User',
      userEmail: userProfile?.email || user.email || '',
      packageId: selectedPack.id,
      packageName: selectedPack.name,
      credits: selectedPack.credits,
      usdPrice: selectedPack.usdPrice,
      paymentMethod: selectedMethod.name,
      paymentProofUrl,
      transactionId,
    });

    setLoading(false);
    if (res.success) {
      setStep('SUBMITTED');
    } else {
      setFeedback({ success: false, message: res.message });
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-stone-800 bg-stone-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white uppercase tracking-wider">
                  {isDemoMode ? 'Demo Credit Environment' : 'Manual Credit Purchase'}
                </h2>
                {isDemoMode && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500 text-stone-950 tracking-wider">
                    DEMO MODE
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-amber-400">
                Rate: $1 USD = {USD_TO_CREDITS_RATE} Credits (1 Credit per Bid)
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setFeedback(null);
              setStep('SELECT');
              closePurchase();
            }}
            className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Banner */}
        {isDemoMode ? (
          <div className="px-6 py-3.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs font-medium flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold uppercase tracking-wider text-[11px] text-amber-400">
                DEVELOPMENT / DEMO CREDIT MODE IS ACTIVE
              </p>
              <p className="text-stone-300 text-[11px] leading-relaxed mt-0.5">
                You are equipped with DEMO Credits for testing Battle Bids and Private Negotiations.
              </p>
            </div>
          </div>
        ) : (
          <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-bold uppercase tracking-wider text-[11px] text-amber-400">
                Manual Verification & Credit Issuance Flow
              </span>
            </div>
            {step === 'PAYMENT' && (
              <button
                onClick={() => setStep('SELECT')}
                className="text-[11px] font-bold text-amber-400 hover:underline"
              >
                ← Back to Package Selection
              </button>
            )}
          </div>
        )}

        {/* Feedback Message */}
        {feedback && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-stone-950 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2 animate-in fade-in duration-150">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{feedback.message}</p>
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4 scrollbar-none flex-1">
          {step === 'SUBMITTED' ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-black text-white uppercase tracking-wider">
                Application Submitted!
              </h3>
              <p className="text-sm text-stone-300 max-w-md mx-auto leading-relaxed">
                Your manual payment request for <span className="font-bold text-amber-400">{selectedPack.name}</span> ({selectedPack.credits} Credits for ${selectedPack.usdPrice.toFixed(2)}) has been logged.
              </p>
              <div className="p-4 bg-stone-950/80 rounded-2xl border border-stone-800 text-xs text-stone-400 text-left space-y-2">
                <p className="font-bold text-amber-400 uppercase tracking-wider text-[11px]">Next Steps:</p>
                <p>1. Our Authorized Payment Verifiers will check your payment evidence.</p>
                <p>2. Upon approval, {selectedPack.credits} Credits will be automatically added to your account balance.</p>
                <p>3. You can track this in your Notifications and Credit History ledger.</p>
              </div>
            </div>
          ) : step === 'PAYMENT' ? (
            /* Payment Details & Form Step */
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-amber-400">Selected Package</p>
                  <p className="text-lg font-black text-white">{selectedPack.name} — {selectedPack.credits} Credits</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-stone-400 block font-mono">Amount Due:</span>
                  <span className="text-xl font-black text-amber-400 font-mono">${selectedPack.usdPrice.toFixed(2)} USD</span>
                </div>
              </div>

              {/* Payment Method Tabs */}
              <div>
                <label className="block text-xs font-black uppercase text-stone-400 mb-2 tracking-wider">
                  Select Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((method) => {
                    const isSelected = selectedMethodId === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setSelectedMethodId(method.id)}
                        className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500 text-white shadow-md'
                            : 'bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700'
                        }`}
                      >
                        <span className="text-xs font-black uppercase">{method.name}</span>
                        <span className="text-[10px] text-stone-500 font-mono mt-1">{method.category}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Account / Wallet Information */}
              <div className="p-4 bg-stone-950 border border-stone-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-stone-800/80 pb-2">
                  <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                    {selectedMethod.name} Details
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">{selectedMethod.category}</span>
                </div>

                {selectedMethod.id === 'EASYPAISA' && (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400">Account Title:</span>
                      <span className="font-bold text-white">{selectedMethod.accountTitle}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400">Account Number:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400">{selectedMethod.accountNumber}</span>
                        <button
                          onClick={() => handleCopy(selectedMethod.accountNumber!, 'easypaisa')}
                          className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {copiedText === 'easypaisa' && <span className="text-[10px] text-emerald-400 font-bold">Copied!</span>}
                      </div>
                    </div>
                  </div>
                )}

                {selectedMethod.id === 'BANK_TRANSFER' && (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400">Bank Name:</span>
                      <span className="font-bold text-white">{selectedMethod.bankName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400">Account Title:</span>
                      <span className="font-bold text-white">{selectedMethod.accountTitle}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400">IBAN:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-400 text-[11px]">{selectedMethod.iban}</span>
                        <button
                          onClick={() => handleCopy(selectedMethod.iban!, 'iban')}
                          className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-300"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {copiedText === 'iban' && <span className="text-[10px] text-emerald-400 font-bold">Copied!</span>}
                      </div>
                    </div>
                  </div>
                )}

                {selectedMethod.id === 'CRYPTO' && (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-stone-400">Network:</span>
                      <span className="font-bold text-amber-400">{selectedMethod.network}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block mb-1">Wallet Address:</span>
                      <div className="flex items-center gap-2 bg-stone-900 p-2 rounded-xl border border-stone-800">
                        <span className="font-mono text-[10px] text-amber-300 break-all">{selectedMethod.walletAddress}</span>
                        <button
                          onClick={() => handleCopy(selectedMethod.walletAddress!, 'crypto')}
                          className="p-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {copiedText === 'crypto' && <span className="text-[10px] text-emerald-400 font-bold mt-1 block">Address Copied!</span>}
                    </div>
                    {selectedMethod.warning && (
                      <p className="text-[10px] text-rose-400 leading-relaxed font-semibold bg-rose-950/30 p-2 rounded-xl border border-rose-900/40 mt-2">
                        {selectedMethod.warning}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-stone-400 italic pt-1 border-t border-stone-800/60">
                  {selectedMethod.instructions}
                </p>
              </div>

              {/* Payment Verification Proof Form */}
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-black uppercase text-stone-400 mb-1 tracking-wider">
                    Transaction ID / TXID / Ref Number
                  </label>
                  <input
                    type="text"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="e.g. TRX-9823471023 or Crypto Hash"
                    className="w-full px-4 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-600 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-stone-400 mb-1 tracking-wider">
                    Receipt / Screenshot URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={paymentProofUrl}
                    onChange={(e) => setPaymentProofUrl(e.target.value)}
                    placeholder="https://... receipt image link"
                    className="w-full px-4 py-2.5 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Packages Selection Step */
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-stone-400 mb-2">
                Select Credit Package:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CREDIT_PACKAGES.map((pack) => {
                  const isSelected = selectedPackageId === pack.id;

                  return (
                    <div
                      key={pack.id}
                      onClick={() => setSelectedPackageId(pack.id)}
                      className={`relative p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/80 text-white shadow-lg shadow-amber-500/10'
                          : 'bg-stone-950/60 border-stone-800 hover:border-stone-700 text-stone-300'
                      }`}
                    >
                      {pack.badgeText && (
                        <span className="absolute -top-2.5 right-3 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full bg-amber-500 text-stone-950">
                          {pack.badgeText}
                        </span>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-black uppercase text-amber-400 tracking-wide">
                            {pack.name}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                        </div>

                        <div className="flex items-baseline gap-1 my-2">
                          <span className="text-2xl font-black text-white font-mono">{pack.credits}</span>
                          <span className="text-xs font-bold text-amber-400 uppercase">Credits</span>
                        </div>

                        <p className="text-[10px] text-stone-400 leading-normal mb-3">
                          {pack.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs font-mono font-bold">
                        <span className="text-stone-400">USD Value:</span>
                        <span className="text-white">${pack.usdPrice.toFixed(2)} USD</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-stone-800 bg-stone-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[10px] text-stone-500 font-bold uppercase tracking-wider text-center sm:text-left">
            Exchange Rate: $1.00 USD = 10 Credits
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                setFeedback(null);
                setStep('SELECT');
                closePurchase();
              }}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs uppercase tracking-wider transition-colors"
            >
              {step === 'SUBMITTED' ? 'Close' : 'Cancel'}
            </button>

            {!isDemoMode && step === 'SELECT' && (
              <button
                onClick={() => setStep('PAYMENT')}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/10"
              >
                <span>Proceed to Payment</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {!isDemoMode && step === 'PAYMENT' && (
              <button
                disabled={loading}
                onClick={handleSubmitApplication}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/10 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Submit Payment Request</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
