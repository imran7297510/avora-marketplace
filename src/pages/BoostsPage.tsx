import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Loader2, Zap } from 'lucide-react';
import { BadgeActivities } from '../components/BadgeActivities';

export function BoostsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const listingIdParam = searchParams.get('listingId') || searchParams.get('id') || undefined;

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-2.5 sm:px-4 py-4 sm:py-8">
      <button 
        type="button"
        onClick={() => {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate('/');
          }
        }} 
        className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 font-bold rounded-xl text-xs uppercase tracking-wider mb-6 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="text-center mb-8 sm:mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black uppercase tracking-wider mb-3">
          <Zap className="w-4 h-4 fill-blue-500 text-blue-500" /> High-Velocity Exposure
        </div>
        <h1 className="text-xl min-[350px]:text-2xl min-[400px]:text-3xl sm:text-4xl md:text-5xl font-black text-stone-900 italic uppercase leading-tight md:leading-none tracking-tighter mb-3 sm:mb-4">
          Boosted Ads <span className="text-blue-600 underline decoration-stone-900">Badge</span>
        </h1>
        <p className="text-stone-400 text-sm sm:text-base md:text-lg font-medium max-w-2xl mx-auto px-2">
          Turbocharge visibility with priority algorithmic feed placement and highlighted search discovery.
        </p>
      </div>

      <BadgeActivities 
        user={user} 
        lockedCategory="BOOST"
        defaultListingId={listingIdParam}
        autoOpenApplyForm={Boolean(listingIdParam)}
      />
    </div>
  );
}

export default BoostsPage;
