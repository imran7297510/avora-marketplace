import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function KYCVerification() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/profile?tab=kyc', { replace: true });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-pulse font-black text-stone-400 uppercase tracking-widest text-xs">
        Redirecting to KYC Hub...
      </div>
    </div>
  );
}
