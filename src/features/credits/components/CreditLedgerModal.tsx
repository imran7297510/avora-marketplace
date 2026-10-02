import React, { useState } from 'react';
import { X, Coins, Plus, History, ArrowDownRight, ArrowUpRight, ShieldCheck, AlertCircle, Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';
import { useCredits } from '../hooks/useCredits';
import { TRANSACTION_TYPE_LABELS } from '../constants';

export const CreditLedgerModal: React.FC = () => {
  const {
    creditsBalance,
    totalCreditsPurchased,
    totalCreditsSpent,
    transactions,
    isLedgerOpen,
    isDemoMode,
    closeLedger,
    openPurchase,
    loading,
    resetDemoBalance,
    setDemoBalance,
  } = useCredits();

  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  if (!isLedgerOpen) return null;

  const handleTestZeroBalance = () => {
    if (setDemoBalance) {
      setDemoBalance(0, 'Simulated Insufficient Balance Test');
      setTestFeedback('Demo balance set to 0. You can now test insufficient credit behavior in the Arena.');
      setTimeout(() => setTestFeedback(null), 4000);
    }
  };

  const handleResetDemoBalance = () => {
    if (resetDemoBalance) {
      resetDemoBalance();
      setTestFeedback('Demo balance reset to default 1,000 DEMO Credits.');
      setTimeout(() => setTestFeedback(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-stone-800 bg-stone-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white uppercase tracking-wider">
                  {isDemoMode ? 'Demo Credit Ledger & History' : 'Credit Ledger & History'}
                </h2>
                {isDemoMode && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500 text-stone-950 tracking-wider">
                    DEMO MODE
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-stone-400">
                {isDemoMode
                  ? 'Isolated Test Balance & Activity Log (No Real Monetary Value)'
                  : 'Immutable Transaction Log & Balance Summary'}
              </p>
            </div>
          </div>
          <button
            onClick={closeLedger}
            className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Overview Cards */}
        <div className="p-6 bg-stone-950/30 border-b border-stone-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-stone-900 border border-amber-500/30 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
              {isDemoMode ? 'Available Demo Balance' : 'Available Balance'}
            </span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl font-black text-white font-mono">{creditsBalance}</span>
              <span className="text-xs font-bold text-amber-400 uppercase">
                {isDemoMode ? 'DEMO CREDITS' : 'Credits'}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-stone-900 border border-stone-800 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1">
              <ArrowDownRight className="w-3.5 h-3.5" /> Total Added
            </span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-xl font-black text-emerald-400 font-mono">+{totalCreditsPurchased}</span>
              <span className="text-xs font-bold text-stone-400 uppercase">
                {isDemoMode ? 'DEMO CR' : 'CR'}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-stone-900 border border-stone-800 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> Total Spent
            </span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-xl font-black text-rose-400 font-mono">-{totalCreditsSpent}</span>
              <span className="text-xs font-bold text-stone-400 uppercase">
                {isDemoMode ? 'DEMO CR' : 'CR'}
              </span>
            </div>
          </div>
        </div>

        {/* Demo Mode Notice Banner / Testing Controls */}
        {isDemoMode ? (
          <div className="px-6 py-3.5 bg-amber-500/10 border-b border-amber-500/20 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong className="text-amber-400 uppercase font-black tracking-wider">DEMO MODE:</strong> Demo credits have no monetary value and cannot be purchased. 1 DEMO Credit is deducted per bid.
              </span>
            </div>

            {/* Test Helper Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleTestZeroBalance}
                title="Simulate 0 credits to test insufficient credit behavior"
                className="px-2.5 py-1 bg-stone-850 hover:bg-stone-800 text-rose-400 border border-rose-500/30 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
              >
                Test 0 Credits
              </button>
              <button
                type="button"
                onClick={handleResetDemoBalance}
                title="Reset balance to 1,000 Demo Credits"
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Reset (1k)
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs font-medium flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Credit transactions are recorded in an immutable ledger. $1 USD = 10 Credits.
            </span>
          </div>
        )}

        {/* Feedback message for test action */}
        {testFeedback && (
          <div className="mx-6 mt-3 p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{testFeedback}</span>
          </div>
        )}

        {/* Transaction History List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-none">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
              <History className="w-4 h-4 text-amber-500" />
              {isDemoMode ? 'Demo Transaction Activity' : 'Transaction Ledger'} ({transactions.length})
            </h3>
            {isDemoMode ? (
              <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider">
                Isolated Demo Ledger
              </span>
            ) : (
              <button
                onClick={() => {
                  closeLedger();
                  openPurchase();
                }}
                className="text-xs font-black text-amber-400 hover:text-amber-300 uppercase tracking-wider flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                Get Credits
              </button>
            )}
          </div>

          {loading ? (
            <div className="py-12 text-center text-stone-500 text-xs font-bold uppercase tracking-widest">
              Loading transactions...
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-2 bg-stone-950/40 rounded-2xl border border-stone-850 p-6">
              <AlertCircle className="w-8 h-8 text-stone-600" />
              <p className="text-xs font-black uppercase text-stone-400 tracking-wider">
                No Transactions Recorded Yet
              </p>
              <p className="text-xs text-stone-500 max-w-sm">
                {isDemoMode
                  ? 'Your demo balance is ready. Place bids in the Arena to test the 1-credit-per-bid deduction.'
                  : 'Your default starting balance is 0 Credits. Get credits to participate in Battle Bids auctions.'}
              </p>
            </div>
          ) : (
            transactions.map((tx) => {
              const info = TRANSACTION_TYPE_LABELS[tx.type] || { label: tx.type, isCredit: tx.amount > 0 };
              const isPositive = tx.amount > 0;

              return (
                <div
                  key={tx.id}
                  className="p-4 rounded-2xl bg-stone-950/60 border border-stone-800/80 flex items-center justify-between gap-3 hover:border-stone-700 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isPositive
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                      }`}
                    >
                      {isPositive ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white truncate">
                          {tx.description || info.label}
                        </span>
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 shrink-0">
                          {info.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-stone-500 font-mono mt-0.5">
                        <span>Key: {tx.idempotencyKey.slice(0, 18)}...</span>
                        <span>•</span>
                        <span>Bal: {tx.balanceBefore} → {tx.balanceAfter}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-sm font-black font-mono ${
                        isPositive ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isPositive ? `+${tx.amount}` : tx.amount} {isDemoMode ? 'DEMO' : 'CR'}
                    </span>
                    <span className="block text-[9px] font-bold text-stone-500 uppercase">
                      {tx.createdAt?.seconds
                        ? new Date(tx.createdAt.seconds * 1000).toLocaleDateString()
                        : 'Recent'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950/80 flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
            {isDemoMode ? 'Isolated Development Demo Architecture' : 'Protected Immutable Ledger Architecture'}
          </span>
          <button
            onClick={closeLedger}
            className="px-5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs uppercase tracking-wider transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
