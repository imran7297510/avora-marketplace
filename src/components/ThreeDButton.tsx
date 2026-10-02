import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LucideIcon, PlusCircle, Search, Gavel, Lock, User, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile } from '../types';
import { getProfileVerificationType, VerificationType } from './ProfileVerificationTick';
import { resolveAuthoritativeVerification } from '../lib/verificationResolver';
import { getCachedUserProfileSync, primeUserProfileCache, fetchCachedUserProfile } from '../services/userProfileCache';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface ThreeDButtonProps {
  to?: string;
  state?: any;
  label?: string;
  subtitle?: string;
  badge?: string;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  variant?: 'amber' | 'blue' | 'rose' | 'red' | 'emerald' | 'purple' | 'dark' | 'offwhite';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent<any>) => void;
  id?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children?: React.ReactNode;
  noShadow?: boolean;
}

export const ThreeDButton: React.FC<ThreeDButtonProps> = ({
  to,
  state,
  label,
  subtitle,
  badge,
  icon: Icon,
  variant = 'amber',
  size = 'md',
  fullWidth = true,
  className,
  onClick,
  id,
  disabled = false,
  type = 'button',
  children,
  noShadow = false,
}) => {
  // Color configuration with true 3D tactile depth, bevels, and glowing edge shadows
  const variants = {
    offwhite: {
      bg: 'bg-gradient-to-b from-stone-50 via-stone-100 to-stone-200',
      hoverBg: 'hover:from-white hover:via-stone-50 hover:to-stone-100',
      text: 'text-stone-900',
      edge: 'shadow-[0_6px_0_0_#a8a29e,0_10px_20px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_0_0_#78716c,0_14px_25px_rgba(0,0,0,0.35)] active:shadow-[0_2px_0_0_#57534e]',
      border: 'border-t-2 border-l border-r border-white border-b-0',
      badgeBg: 'bg-stone-900 text-stone-100 border border-stone-700',
      iconBg: 'bg-stone-900/10 text-stone-900',
    },
    amber: {
      bg: 'bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600',
      hoverBg: 'hover:from-amber-300 hover:via-amber-400 hover:to-amber-500',
      text: 'text-stone-950',
      edge: 'shadow-[0_6px_0_0_#b45309,0_10px_20px_rgba(245,158,11,0.35)] hover:shadow-[0_8px_0_0_#92400e,0_14px_25px_rgba(245,158,11,0.5)] active:shadow-[0_2px_0_0_#78350f]',
      noShadowEdge: 'shadow-none border-t-2 border-t-amber-200 border-x border-x-amber-500 border-b-[5px] border-b-amber-700 active:border-b-0 active:translate-y-[5px]',
      border: 'border-t-2 border-l border-r border-amber-200/90 border-b-0',
      badgeBg: 'bg-stone-950/90 text-amber-300 border border-amber-400/50',
      iconBg: 'bg-stone-950/15 text-stone-950',
    },
    blue: {
      bg: 'bg-gradient-to-b from-sky-400 via-blue-500 to-blue-600',
      hoverBg: 'hover:from-sky-300 hover:via-blue-400 hover:to-blue-500',
      text: 'text-white',
      edge: 'shadow-[0_6px_0_0_#1e40af,0_10px_20px_rgba(37,99,235,0.35)] hover:shadow-[0_8px_0_0_#1e3a8a,0_14px_25px_rgba(37,99,235,0.5)] active:shadow-[0_2px_0_0_#172554]',
      border: 'border-t-2 border-l border-r border-sky-200/90 border-b-0',
      badgeBg: 'bg-blue-950/90 text-sky-200 border border-sky-300/50',
      iconBg: 'bg-black/20 text-white',
    },
    rose: {
      bg: 'bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700',
      hoverBg: 'hover:from-rose-400 hover:via-rose-500 hover:to-rose-600',
      text: 'text-white',
      edge: 'shadow-[0_6px_0_0_#9f1239,0_10px_20px_rgba(225,29,72,0.35)] hover:shadow-[0_8px_0_0_#881337,0_14px_25px_rgba(225,29,72,0.5)] active:shadow-[0_2px_0_0_#4c0519]',
      border: 'border-t-2 border-l border-r border-rose-200/90 border-b-0',
      badgeBg: 'bg-stone-950/90 text-amber-300 border border-amber-400/50',
      iconBg: 'bg-black/20 text-amber-300',
    },
    red: {
      bg: 'bg-gradient-to-b from-red-500 via-red-600 to-red-700',
      hoverBg: 'hover:from-red-400 hover:via-red-500 hover:to-red-600',
      text: 'text-white',
      edge: 'shadow-[0_6px_0_0_#991b1b,0_10px_20px_rgba(220,38,38,0.35)] hover:shadow-[0_8px_0_0_#7f1d1d,0_14px_25px_rgba(220,38,38,0.5)] active:shadow-[0_2px_0_0_#450a0a]',
      border: 'border-t-2 border-l border-r border-red-200/90 border-b-0',
      badgeBg: 'bg-red-950/90 text-red-200 border border-red-400/50',
      iconBg: 'bg-black/20 text-white',
    },
    emerald: {
      bg: 'bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-600',
      hoverBg: 'hover:from-emerald-300 hover:via-emerald-400 hover:to-teal-500',
      text: 'text-stone-950',
      edge: 'shadow-[0_6px_0_0_#065f46,0_10px_20px_rgba(16,185,129,0.35)] hover:shadow-[0_8px_0_0_#044e3a,0_14px_25px_rgba(16,185,129,0.5)] active:shadow-[0_2px_0_0_#022c22]',
      border: 'border-t-2 border-l border-r border-emerald-200/90 border-b-0',
      badgeBg: 'bg-stone-950/90 text-emerald-300 border border-emerald-400/50',
      iconBg: 'bg-stone-950/15 text-stone-950',
    },
    purple: {
      bg: 'bg-gradient-to-b from-purple-500 via-indigo-600 to-indigo-700',
      hoverBg: 'hover:from-purple-400 hover:via-indigo-500 hover:to-indigo-600',
      text: 'text-white',
      edge: 'shadow-[0_6px_0_0_#3730a3,0_10px_20px_rgba(99,102,241,0.35)] hover:shadow-[0_8px_0_0_#312e81,0_14px_25px_rgba(99,102,241,0.5)] active:shadow-[0_2px_0_0_#1e1b4b]',
      border: 'border-t-2 border-l border-r border-purple-200/90 border-b-0',
      badgeBg: 'bg-indigo-950/90 text-amber-300 border border-purple-300/50',
      iconBg: 'bg-black/20 text-amber-300',
    },
    dark: {
      bg: 'bg-gradient-to-b from-stone-800 via-stone-850 to-stone-900',
      hoverBg: 'hover:from-stone-750 hover:via-stone-800 hover:to-stone-850',
      text: 'text-white',
      edge: 'shadow-[0_6px_0_0_#0c0a09,0_10px_20px_rgba(0,0,0,0.6)] hover:shadow-[0_8px_0_0_#000000,0_14px_25px_rgba(0,0,0,0.8)] active:shadow-[0_2px_0_0_#000000]',
      border: 'border-t-2 border-l border-r border-stone-600/90 border-b-0',
      badgeBg: 'bg-stone-950 text-amber-400 border border-stone-700',
      iconBg: 'bg-stone-950 text-amber-400',
    },
  };

  const v = variants[variant] || variants.amber;

  const sizeClasses = {
    sm: 'px-3 py-2 text-xs rounded-xl gap-1.5 min-h-[44px]',
    md: 'px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm rounded-2xl gap-2 min-h-[48px] sm:min-h-[52px]',
    lg: 'px-5 sm:px-6 py-3.5 sm:py-4 text-sm sm:text-base rounded-2xl gap-2.5 min-h-[56px] sm:min-h-[60px]',
  };

  const baseClasses = cn(
    // Base positioning & 3D transformation
    'group relative inline-flex items-center justify-center font-black uppercase tracking-wider',
    'transition-all duration-150 ease-out transform-gpu select-none',
    disabled 
      ? 'opacity-45 cursor-not-allowed pointer-events-none' 
      : noShadow
        ? 'cursor-pointer'
        : 'cursor-pointer -translate-y-1 hover:-translate-y-1.5 active:translate-y-[2px]',
    // Color & 3D depth styles
    v.bg,
    !disabled && v.hoverBg,
    v.text,
    noShadow
      ? ((v as any).noShadowEdge || 'shadow-none border-t-2 border-t-amber-200 border-x border-x-amber-500 border-b-[5px] border-b-amber-700 active:border-b-0 active:translate-y-[5px]')
      : cn(v.edge, v.border),
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    className
  );

  const innerContent = (
    <>
      {/* Glossy top light highlight */}
      <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/35 to-transparent rounded-t-2xl pointer-events-none" />

      {/* Light sheen animation sweep on hover */}
      {!disabled && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none rounded-2xl overflow-hidden" />
      )}

      {/* Button Content Container */}
      <div className="relative z-10 flex items-center justify-center gap-2 w-full">
        {Icon && (
          <div className={cn('p-1 sm:p-1.5 rounded-xl group-hover:scale-110 transition-transform duration-200 shrink-0 shadow-inner', v.iconBg)}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow-sm" />
          </div>
        )}

        {label && (
          <div className="flex flex-col text-left leading-tight truncate">
            <span className="font-black tracking-tight drop-shadow-sm truncate">
              {label}
            </span>
            {subtitle && (
              <span className="text-[9px] sm:text-[10px] font-bold opacity-80 uppercase tracking-widest leading-none mt-0.5 truncate">
                {subtitle}
              </span>
            )}
          </div>
        )}

        {children}

        {badge && (
          <span
            className={cn(
              'ml-auto text-[9px] sm:text-[10px] font-extrabold px-1.5 sm:px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0 shadow-sm',
              v.badgeBg
            )}
          >
            {badge}
          </span>
        )}
      </div>
    </>
  );

  if (to && !disabled) {
    return (
      <Link
        id={id}
        to={to}
        state={state}
        onClick={onClick}
        className={baseClasses}
      >
        {innerContent}
      </Link>
    );
  }

  return (
    <button
      id={id}
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={baseClasses}
    >
      {innerContent}
    </button>
  );
};

// Unified Responsive 3D Action Grid Component for Homepage (Post Ad & Explore)
export interface Homepage3DActionGridProps {
  className?: string;
}

export const Homepage3DActionGrid: React.FC<Homepage3DActionGridProps> = ({ className }) => {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-xl", className)}>
      {/* 1. Post Ad */}
      <ThreeDButton
        to="/submit"
        state={{ forceReset: true }}
        label="Post Ad"
        icon={PlusCircle}
        variant="offwhite"
        size="md"
      />

      {/* 2. Explore */}
      <ThreeDButton
        to="/listings"
        label="Explore"
        icon={Search}
        variant="offwhite"
        size="md"
      />
    </div>
  );
};

// 3D Profile Name Shape Component (Strictly NO shadow, tactile 3D bevels, responsive & mobile-friendly)
export interface ProfileName3DProps {
  name: string;
  userId?: string;
  profile?: UserProfile | null | any;
  dark?: boolean;
  isVerified?: boolean;
  isPremium?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent<any>) => void;
}

export const ProfileName3D: React.FC<ProfileName3DProps> = ({
  name,
  userId,
  profile,
  dark = false,
  isVerified = false,
  isPremium = false,
  className,
  onClick,
}) => {
  const navigate = useNavigate();
  const [resolvedProfile, setResolvedProfile] = useState<UserProfile | null>(() => {
    if (profile) return profile;
    if (userId) return getCachedUserProfileSync(userId) || null;
    return null;
  });

  useEffect(() => {
    if (profile) {
      setResolvedProfile(profile);
      return;
    }
    if (!userId || userId === 'guest' || userId === 'anonymous') {
      setResolvedProfile(null);
      return;
    }

    const cached = getCachedUserProfileSync(userId);
    if (cached !== undefined) {
      setResolvedProfile(cached);
    }

    let isMounted = true;
    const unsub = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        if (!isMounted) return;
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as UserProfile;
          primeUserProfileCache(userId, data);
          setResolvedProfile(data);
        } else {
          primeUserProfileCache(userId, null);
          setResolvedProfile(null);
        }
      },
      () => {
        if (!isMounted) return;
        fetchCachedUserProfile(userId).then((p) => {
          if (isMounted && p) setResolvedProfile(p);
        });
      }
    );

    return () => {
      isMounted = false;
      unsub();
    };
  }, [userId, profile]);

  // Compute single tick verification type authoritatively
  let verificationType: VerificationType = 'none';
  if (resolvedProfile) {
    verificationType = resolveAuthoritativeVerification(resolvedProfile).verificationType;
  } else if (isPremium) {
    verificationType = 'golden';
  } else if (isVerified) {
    verificationType = 'blue';
  }

  const isGoldenTick = verificationType === 'golden';
  const isBlueTick = verificationType === 'blue';

  const handleClick = (e: React.MouseEvent<any>) => {
    e.stopPropagation();
    if (onClick) {
      onClick(e);
      return;
    }
    if (userId) {
      navigate(`/user/${userId}`);
    }
  };

  // 3D tactile shape styling with strictly ZERO shadow
  const containerClasses = cn(
    "group/pname relative inline-flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl font-black uppercase tracking-wider select-none",
    "transition-all duration-150 ease-out transform-gpu max-w-full truncate shadow-none cursor-pointer",
    // 3D solid dimensional edge (no blur/drop shadows)
    dark
      ? "bg-gradient-to-b from-stone-800 via-stone-850 to-stone-900 text-stone-200 border-t border-l border-r border-stone-700/80 border-b-[2.5px] border-b-stone-950 hover:from-stone-750 hover:to-stone-850 active:border-b active:translate-y-[1.5px]"
      : isGoldenTick
        ? "bg-gradient-to-b from-amber-50 via-amber-100 to-amber-200 text-amber-950 border-t border-l border-r border-amber-100 border-b-[2.5px] border-b-amber-400 hover:from-amber-100 hover:to-amber-200 active:border-b active:translate-y-[1.5px]"
        : isBlueTick
          ? "bg-gradient-to-b from-blue-50/50 via-stone-100 to-stone-200 text-stone-800 border-t border-l border-r border-white border-b-[2.5px] border-b-blue-300 hover:from-white hover:to-stone-150 active:border-b active:translate-y-[1.5px]"
          : "bg-gradient-to-b from-stone-50 via-stone-100 to-stone-200 text-stone-800 border-t border-l border-r border-white border-b-[2.5px] border-b-stone-300 hover:from-white hover:to-stone-150 active:border-b active:translate-y-[1.5px]",
    className
  );

  return (
    <div
      onClick={handleClick}
      title={isGoldenTick ? `${name} (Golden Verified Seller)` : isBlueTick ? `${name} (KYC Approved)` : name}
      className={containerClasses}
    >
      {/* 3D Geometric Chamfered Top Highlight Lip (No shadow) */}
      <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/30 to-transparent rounded-t-lg pointer-events-none" />

      {/* 3D Shape Icon Container (No shadow) */}
      <div
        className={cn(
          "w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-md flex items-center justify-center shrink-0 border-t border-l border-r border-b-2 transition-transform duration-150 group-hover/pname:scale-105 shadow-none",
          isGoldenTick
            ? "bg-amber-400 text-stone-950 border-amber-200 border-b-amber-600"
            : isBlueTick
              ? "bg-blue-500 text-white border-blue-300 border-b-blue-700"
              : dark
                ? "bg-stone-750 text-stone-400 border-stone-650 border-b-stone-950"
                : "bg-stone-200 text-stone-700 border-white border-b-stone-350"
        )}
      >
        {isGoldenTick || isBlueTick ? (
          <CheckCircle2 className="w-2 sm:w-2.5 h-2 sm:h-2.5 stroke-[3]" />
        ) : (
          <User className="w-2 sm:w-2.5 h-2 sm:h-2.5 stroke-[2.5]" />
        )}
      </div>

      {/* Profile Name Text */}
      <span className="text-[9.5px] sm:text-[10.5px] font-black truncate max-w-[120px] sm:max-w-[170px] tracking-tight">
        {name}
      </span>

      {/* Mini 3D PRO Tag for premium sellers (No shadow) */}
      {isGoldenTick && (
        <span className="text-[7.5px] font-black px-1 py-0.2 rounded uppercase tracking-wider bg-amber-400 text-stone-950 border-t border-amber-200 border-b border-b-amber-600 shadow-none leading-tight shrink-0 hidden sm:inline-block">
          PRO
        </span>
      )}
    </div>
  );
};

