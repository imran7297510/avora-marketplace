import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../../../../lib/utils';

interface ArenaBackButtonProps {
  onClick?: () => void;
  className?: string;
  fallbackPath?: string;
}

export const ArenaBackButton: React.FC<ArenaBackButtonProps> = ({ 
  onClick, 
  className,
  fallbackPath = '/battle-bids'
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (onClick) {
      onClick();
      return;
    }

    // Determine safely whether there is a previous application route within the React Router session
    const hasPreviousRoute = location.key !== 'default' || (
      typeof window !== 'undefined' && 
      window.history.state && 
      typeof window.history.state.idx === 'number' && 
      window.history.state.idx > 0
    );

    if (hasPreviousRoute) {
      navigate(-1);
    } else {
      navigate(fallbackPath || '/battle-bids');
    }
  };

  return (
    <button 
      onClick={handleBack}
      className={cn(
        "flex items-center gap-1.5 sm:gap-2.5 px-3 py-2 sm:px-4 sm:py-2.5 bg-stone-900 sm:bg-stone-955 border border-stone-850 sm:border-stone-800 hover:border-stone-700 sm:hover:border-stone-600 rounded-xl sm:rounded-2xl text-xs sm:text-[11px] font-black uppercase text-stone-400 hover:text-white transition-all shadow-md sm:shadow-xl active:scale-95 group",
        className
      )}
      title="Go Back"
    >
      <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:-translate-x-0.5 transition-transform" />
      <span>Back</span>
    </button>
  );
};
