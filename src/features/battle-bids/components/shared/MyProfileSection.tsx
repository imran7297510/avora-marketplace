import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import { CreditBalanceBadge } from '../../../credits';
import { ProfileVerificationTick } from './ProfileVerificationTick';
import { cn } from '../../../../lib/utils';

export const MyProfileSection: React.FC = () => {
  const { userProfile, user } = useAuth();
  const navigate = useNavigate();

  if (!userProfile) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-stone-955 border border-stone-800 rounded-2xl p-2 pr-4 shadow-xl flex-wrap sm:flex-nowrap">
      <div className="flex items-center gap-3 min-w-0">
        <img 
          src={userProfile.photoURL || '/default-avatar.png'} 
          alt={userProfile.name || 'User'} 
          className="w-10 h-10 rounded-full object-cover border border-stone-700 shrink-0"
        />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black text-white truncate leading-tight">
              {userProfile.name}
            </span>
            <ProfileVerificationTick profile={userProfile} size="sm" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {user && !user.isAnonymous && <CreditBalanceBadge variant="3d" />}
        <button 
          onClick={() => navigate('/negotiations/profile')} 
          className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shrink-0"
        >
          View
        </button>
      </div>
    </div>
  );
};
