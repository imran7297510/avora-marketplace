import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert } from 'lucide-react';

interface RestrictedActionAlertProps {
  isVisible: boolean;
  onClose: () => void;
  message?: string;
}

export function RestrictedActionAlert({ isVisible, onClose, message }: RestrictedActionAlertProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="fixed bottom-6 left-4 right-4 z-[200] max-w-sm mx-auto"
        >
          <div className="bg-stone-900 text-white p-4 rounded-2xl shadow-2xl border border-red-500/30 flex items-center gap-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
            <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center text-red-500 shrink-0">
               <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="flex-grow">
               <p className="text-xs font-black uppercase tracking-widest text-red-400 mb-0.5">Account Restricted</p>
               <p className="text-xs font-bold text-stone-200 leading-tight">
                 {message || "Your account has been restricted due to violating the policies of this platform."}
               </p>
            </div>
            <button 
              onClick={onClose}
              className="p-1 hover:bg-stone-800 rounded-lg transition-colors text-stone-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
