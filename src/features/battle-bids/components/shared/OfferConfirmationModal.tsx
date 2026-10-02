import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, Send, Loader2, LucideIcon, Coins } from 'lucide-react';
import { createPortal } from 'react-dom';
import { formatPrice } from '../../../../lib/currencies';
import { ThreeDButton } from '../../../../components/ThreeDButton';

interface OfferConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  amount?: number | string;
  currencySymbol?: string;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  icon?: LucideIcon;
  creditCost?: number;
}

export const OfferConfirmationModal: React.FC<OfferConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  amount,
  currencySymbol = 'PKR',
  title = 'Are you sure?',
  message = 'Are you sure you want to submit this offer?',
  confirmText = 'Yes, Submit Offer',
  cancelText = 'Cancel',
  isLoading = false,
  icon: ConfirmIcon = Send,
  creditCost = 1,
}) => {
  const [internalLoading, setInternalLoading] = useState(false);

  if (!isOpen) return null;

  const isSubmitting = isLoading || internalLoading;

  const handleConfirm = async () => {
    if (isSubmitting) return;
    try {
      setInternalLoading(true);
      await onConfirm();
      onClose();
    } catch (err) {
      console.error('Offer confirmation failed:', err);
    } finally {
      setInternalLoading(false);
    }
  };

  const content = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={isSubmitting ? undefined : onClose}
          className="absolute inset-0 bg-stone-955/85 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-sm bg-stone-900 border border-stone-800 rounded-[2.5rem] p-6 sm:p-8 space-y-6 text-center shadow-2xl z-10 overflow-hidden"
        >
          {/* Header Icon */}
          <div className="mx-auto w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500 shadow-inner">
            {isSubmitting ? (
              <Loader2 className="w-7 h-7 animate-spin text-amber-500" />
            ) : (
              <HelpCircle className="w-7 h-7 animate-pulse" />
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-black uppercase tracking-tight text-white italic">
              {title}
            </h3>
            <p className="text-sm font-medium text-stone-300 leading-relaxed">
              {message}
            </p>
            {amount !== undefined && amount !== null && amount !== '' && (
              <div className="pt-1 flex flex-col items-center gap-2">
                <span className="inline-block px-4 py-2 bg-stone-955 border border-amber-500/30 rounded-2xl text-amber-400 font-black text-base shadow-sm">
                  {formatPrice(Number(amount), currencySymbol)}
                </span>
              </div>
            )}
            {creditCost > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-[11px] font-black uppercase tracking-wider">
                <Coins className="w-3.5 h-3.5" />
                <span>Action Fee: {creditCost} {creditCost === 1 ? 'Credit' : 'Credits'}</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[11px] font-black uppercase tracking-wider">
                <Coins className="w-3.5 h-3.5" />
                <span>Action Fee: FREE</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="py-3.5 px-4 bg-stone-955 border border-stone-800 hover:border-stone-700 text-stone-400 hover:text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelText}
            </button>
            <ThreeDButton
              type="button"
              disabled={isSubmitting}
              onClick={handleConfirm}
              variant="amber"
              size="sm"
              fullWidth={true}
              icon={isSubmitting ? Loader2 : ConfirmIcon}
              label={isSubmitting ? "Sending..." : confirmText}
              className="text-xs"
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};
