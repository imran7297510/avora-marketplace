import React from 'react';
import { cn } from '../../../lib/utils';

interface ArenaButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const ArenaButton: React.FC<ArenaButtonProps> = ({
  className,
  variant = 'primary',
  size = 'md',
  isLoading,
  children,
  ...props
}) => {
  const variants = {
    primary: 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-lg hover:from-rose-500 hover:to-rose-400',
    secondary: 'bg-gradient-to-r from-amber-500 to-amber-400 text-stone-950 shadow-lg hover:from-amber-400 hover:to-amber-300',
    outline: 'border-2 border-rose-500/30 text-rose-500 hover:bg-rose-500/10',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  };

  return (
    <button
      className={cn(
        'rounded-xl font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : children}
    </button>
  );
};
