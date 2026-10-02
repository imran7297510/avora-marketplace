import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '../../../../lib/utils';

interface ArenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const ArenaModal: React.FC<ArenaModalProps> = ({ isOpen, onClose, title, children, maxWidth = "max-w-lg" }) => {
  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-2 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-stone-950/90"
        />

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className={cn(
            "relative w-full bg-stone-900 border border-stone-800 rounded-3xl sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden",
            maxWidth
          )}
        >
          {/* Header */}
          <div className="p-5 sm:p-6 md:p-8 pb-3 sm:pb-4 flex items-center justify-between border-b border-stone-850/50 shrink-0">
            <h3 className="text-lg sm:text-xl md:text-2xl font-black uppercase italic tracking-tighter text-white">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 bg-stone-950 hover:bg-stone-800 rounded-xl text-stone-400 hover:text-white transition-all shrink-0"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="p-5 sm:p-6 md:p-8 pt-3 sm:pt-4 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
            {children}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

