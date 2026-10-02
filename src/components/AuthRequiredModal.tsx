import React, { useState } from 'react';
import { Lock, LogIn, UserPlus, X } from 'lucide-react';
import { AuthModal } from './AuthModal';

export interface AuthRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}

export const AuthRequiredModal: React.FC<AuthRequiredModalProps> = ({
  isOpen,
  onClose,
  title = "Authentication Required",
  message = "You are not logged in. Please login to get access."
}) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');

  if (!isOpen) return null;

  if (showAuthModal) {
    return (
      <AuthModal
        isOpen={true}
        onClose={() => {
          setShowAuthModal(false);
          onClose();
        }}
        initialTab={authTab}
      />
    );
  }

  return (
    <div 
      id="auth-required-modal-backdrop" 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div 
        id="auth-required-modal-card" 
        className="bg-stone-900 border border-amber-500/20 p-6 sm:p-8 rounded-[2rem] max-w-md w-full text-center space-y-6 shadow-2xl relative"
      >
        <button
          type="button"
          id="auth-required-close-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-xl hover:bg-stone-800 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8 text-amber-500" />
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-black text-white uppercase italic tracking-tight">{title}</h3>
          <p className="text-sm font-medium text-stone-300 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            id="auth-required-login-btn"
            onClick={() => {
              setAuthTab('login');
              setShowAuthModal(true);
            }}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-955 rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogIn className="w-4 h-4" /> LOGIN
          </button>
          <button
            type="button"
            id="auth-required-signup-btn"
            onClick={() => {
              setAuthTab('register');
              setShowAuthModal(true);
            }}
            className="w-full py-3.5 px-4 bg-stone-950 border border-amber-500/30 hover:border-amber-500 text-amber-500 rounded-xl font-black uppercase text-xs tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> SIGN UP
          </button>
        </div>
      </div>
    </div>
  );
};
