import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Send, 
  Clock, 
  CheckCircle2, 
  X, 
  Loader2, 
  FileText,
  ChevronDown,
  ChevronUp,
  Scale
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isUserBanned, getUserBanRemaining, submitUserBanAppeal } from '../services/userService';

interface AccountBannedBannerProps {
  variant?: 'light' | 'dark' | 'auto';
  className?: string;
  compact?: boolean;
}

export const AccountBannedBanner: React.FC<AccountBannedBannerProps> = ({
  variant = 'auto',
  className = '',
  compact = false
}) => {
  const { user, userProfile } = useAuth();
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false);
  const [appealMessage, setAppealMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAppealText, setShowAppealText] = useState(false);

  if (!userProfile || !isUserBanned(userProfile)) {
    return null;
  }

  const banStatus = getUserBanRemaining(userProfile);
  const isDark = variant === 'dark';
  const isPendingAppeal = userProfile.banAppealStatus === 'pending' || submitSuccess;
  const appealStatus = isPendingAppeal ? 'pending' : (userProfile.banAppealStatus || 'none');

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!appealMessage.trim()) {
      setError("Please write an appeal message explaining your situation.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await submitUserBanAppeal(
        user.uid,
        user.email || '',
        userProfile.name || user.displayName || 'User',
        appealMessage.trim()
      );
      setSubmitSuccess(true);
      setIsAppealModalOpen(false);
      setAppealMessage('');
    } catch (err: any) {
      console.error("Appeal submit error:", err);
      setError(err?.message || "Failed to submit appeal. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div 
        id="account-banned-notice"
        className={`w-full rounded-2xl md:rounded-3xl border transition-all ${
          isDark
            ? 'bg-rose-950/40 border-rose-500/40 text-rose-100 shadow-2xl shadow-rose-950/50'
            : 'bg-rose-50 border-rose-200 text-rose-950 shadow-sm'
        } ${compact ? 'p-4 md:p-5' : 'p-5 md:p-7'} ${className}`}
      >
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`p-2.5 md:p-3 rounded-2xl shrink-0 ${
              isDark ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-rose-100 text-rose-600'
            }`}>
              <ShieldAlert className="w-6 h-6 md:w-7 md:h-7" />
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`font-black uppercase tracking-tight text-sm md:text-base ${
                  isDark ? 'text-white' : 'text-rose-950'
                }`}>
                  Your Account is Banned
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                  banStatus.isPermanent
                    ? (isDark ? 'bg-rose-900/60 text-rose-200 border-rose-700' : 'bg-rose-200 text-rose-800 border-rose-300')
                    : (isDark ? 'bg-amber-950/60 text-amber-300 border-amber-700' : 'bg-amber-100 text-amber-800 border-amber-200')
                }`}>
                  {banStatus.formattedText}
                </span>
              </div>

              <p className={`text-xs md:text-sm font-medium leading-relaxed ${
                isDark ? 'text-rose-200/90' : 'text-rose-800'
              }`}>
                Your account is currently restricted from creating listings, placing bids in Battle Bids auctions, making offers in Private Negotiations, and submitting reports.
              </p>

              {userProfile.banReason && (
                <div className={`mt-2 p-2.5 md:p-3 rounded-xl text-xs font-semibold border ${
                  isDark ? 'bg-stone-900/80 border-rose-500/20 text-stone-300' : 'bg-white/80 border-rose-200 text-stone-700'
                }`}>
                  <span className="font-bold text-rose-600 dark:text-rose-400 uppercase text-[10px] tracking-widest block mb-0.5">
                    Ban Reason
                  </span>
                  {userProfile.banReason}
                </div>
              )}

              {/* Appeal Status indicator */}
              {isPendingAppeal ? (
                <div className={`mt-3 p-3 rounded-xl flex items-start gap-2.5 border text-xs ${
                  isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}>
                  <Scale className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold uppercase tracking-wider text-[11px] text-amber-600 dark:text-amber-400">
                      ⚖️ Appeal Under Review
                    </p>
                    <p className="text-[11px] opacity-90 leading-relaxed">
                      Your ban appeal has been submitted to administration and is currently pending review. You will receive a notification once an administrative decision has been reached.
                    </p>
                    {userProfile.banAppealMessage && (
                      <button
                        type="button"
                        onClick={() => setShowAppealText(!showAppealText)}
                        className="inline-flex items-center gap-1 font-bold text-[10px] text-amber-600 dark:text-amber-400 hover:underline pt-1 cursor-pointer"
                      >
                        {showAppealText ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {showAppealText ? "Hide your submitted appeal" : "View your submitted appeal"}
                      </button>
                    )}
                    {showAppealText && userProfile.banAppealMessage && (
                      <div className={`mt-1.5 p-2 rounded-lg italic text-[11px] border ${
                        isDark ? 'bg-black/30 border-stone-800 text-stone-300' : 'bg-white border-amber-100 text-stone-600'
                      }`}>
                        "{userProfile.banAppealMessage}"
                      </div>
                    )}
                  </div>
                </div>
              ) : appealStatus === 'rejected' ? (
                <div className={`mt-3 p-3 rounded-xl flex items-start gap-2.5 border text-xs ${
                  isDark ? 'bg-stone-900/60 border-rose-500/30 text-stone-300' : 'bg-rose-100/50 border-rose-200 text-rose-900'
                }`}>
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold uppercase tracking-wider text-[11px] text-rose-600 dark:text-rose-400">
                      Previous Appeal Declined
                    </p>
                    <p className="text-[11px] opacity-90 leading-relaxed">
                      Administration previously reviewed your appeal and maintained the restriction. You may submit a new appeal with additional information.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Action Button */}
          {!isPendingAppeal && (
            <div className="w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
              <button
                type="button"
                id="open-ban-appeal-modal-btn"
                onClick={() => setIsAppealModalOpen(true)}
                className={`w-full sm:w-auto px-5 py-3 rounded-xl md:rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95 ${
                  isDark
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/60'
                    : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                }`}
              >
                <Scale className="w-4 h-4" />
                Submit Appeal
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Appeal Submission Modal */}
      <AnimatePresence>
        {isAppealModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmitting && setIsAppealModalOpen(false)}
              className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-stone-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 sm:p-8 overflow-hidden z-10 my-8"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-100 dark:border-rose-500/20">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-stone-900 dark:text-white uppercase tracking-tight text-base sm:text-lg">
                      Submit Account Ban Appeal
                    </h3>
                    <p className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">
                      Dispute Administrative Restriction
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSubmitting && setIsAppealModalOpen(false)}
                  disabled={isSubmitting}
                  className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmitAppeal} className="space-y-4 pt-4">
                <div className="bg-stone-50 dark:bg-stone-950/60 p-3.5 rounded-2xl border border-stone-200 dark:border-stone-800 text-xs space-y-1">
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span className="font-bold">Applicant:</span>
                    <span className="font-mono text-stone-900 dark:text-stone-200 font-bold">
                      {userProfile.name || user?.displayName || 'User'} ({user?.email})
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span className="font-bold">Status:</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                      {banStatus.formattedText}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label 
                    htmlFor="appeal-explanation-text"
                    className="block text-xs font-black uppercase tracking-wider text-stone-700 dark:text-stone-300"
                  >
                    Appeal Explanation & Justification <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed">
                    Provide a detailed explanation of your case, any context or misunderstandings, and why you believe your marketplace access should be restored.
                  </p>
                  <textarea
                    id="appeal-explanation-text"
                    rows={5}
                    value={appealMessage}
                    onChange={(e) => setAppealMessage(e.target.value)}
                    placeholder="Explain the circumstances regarding your ban and why it should be lifted..."
                    disabled={isSubmitting}
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 text-xs text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all resize-none font-medium"
                    required
                  />
                  <div className="flex justify-between items-center text-[10px] text-stone-400 font-medium px-1">
                    <span>Minimum 10 characters recommended</span>
                    <span>{appealMessage.length} characters</span>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAppealModalOpen(false)}
                    disabled={isSubmitting}
                    className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="submit-ban-appeal-btn"
                    disabled={isSubmitting || !appealMessage.trim()}
                    className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-600/20 active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Submit Official Appeal
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
