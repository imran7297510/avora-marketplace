import React from 'react';
import { AuthModal } from './AuthModal';

interface RequiresAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}

export const RequiresAuthModal: React.FC<RequiresAuthModalProps> = ({ isOpen, onClose }) => {
  return (
    <AuthModal
      isOpen={isOpen}
      onClose={onClose}
      initialTab="login"
    />
  );
};

