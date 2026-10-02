import { useState, useEffect } from 'react';
import { Negotiation } from '../types';
import { NegotiationService } from '../services/negotiationService';
import { useAuth } from '../../../context/AuthContext';

export function useUserNegotiations() {
  const { user } = useAuth();
  const [negotiations, setNegotiations] = useState<Negotiation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setNegotiations([]);
      setLoading(false);
      return;
    }

    const unsubscribe = NegotiationService.subscribeToUserNegotiations(user.uid, (data) => {
      setNegotiations(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  return {
    negotiations,
    loading
  };
}
