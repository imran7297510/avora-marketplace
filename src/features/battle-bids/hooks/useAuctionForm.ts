import { useState, useCallback } from 'react';
import { CreateAuctionInput } from '../types';
import { ARENA_CONFIG } from '../constants';
import { UserProfile } from '../../../types';
import { ArenaService } from '../services';
import { isDemoCreditModeActive, DemoCreditsService } from '../../credits';
import { isUserBanned } from '../../../services/userService';

interface FormError {
  field?: keyof CreateAuctionInput;
  message: string;
}

export const useAuctionForm = (userProfile: UserProfile | null, isNegotiation?: boolean, authEmail?: string | null) => {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormError[]>([]);

  const validateForm = useCallback((data: CreateAuctionInput): FormError[] => {
    const newErrors: FormError[] = [];

    // Administrative Ban Check
    if (isUserBanned(userProfile) || (userProfile as any)?.postingDisabled || (userProfile as any)?.canPost === false) {
      newErrors.push({ message: 'Action restricted: Your account has been banned or restricted by administration from creating listings.' });
    }

    // Authentication requirement for Private Negotiation listings
    if (isNegotiation && (!userProfile || !userProfile.id || userProfile.id === 'anon')) {
      newErrors.push({ message: 'Authentication required: You must be logged in to post a Private Negotiation listing.' });
    }

    // Basic required fields
    if (!data.title.trim()) newErrors.push({ field: 'title', message: 'Title is required' });
    if (!data.category || !data.category.trim()) newErrors.push({ field: 'category', message: 'Category is required' });
    if (!data.description.trim()) newErrors.push({ field: 'description', message: 'Description is required' });
    if (!data.shippingInfo.trim()) newErrors.push({ field: 'shippingInfo', message: 'Shipping information is required' });
    if (!data.city || !data.city.trim()) newErrors.push({ field: 'city', message: 'City is required' });
    if (!data.country || !data.country.trim()) newErrors.push({ field: 'country', message: 'Country is required' });
    if (!data.contactNumber || !data.contactNumber.trim()) {
      newErrors.push({ field: 'contactNumber', message: 'Contact Number is required' });
    }
    
    if (isNegotiation) {
      const expectedEmail = (authEmail || userProfile?.email || '').trim().toLowerCase();
      const submittedEmail = (data.contactEmail || '').trim().toLowerCase();

      if (!expectedEmail) {
        newErrors.push({ 
          field: 'contactEmail', 
          message: 'Authentication required: You must be logged in with a verified account email to post a Private Negotiation listing.' 
        });
      } else if (!submittedEmail) {
        newErrors.push({ field: 'contactEmail', message: 'Contact Email is required' });
      } else if (submittedEmail !== expectedEmail) {
        newErrors.push({ 
          field: 'contactEmail', 
          message: 'Security lock: You can only post Private Negotiation listings using your verified login email. Alternate or organization emails are strictly prohibited.' 
        });
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedEmail)) {
        newErrors.push({ field: 'contactEmail', message: 'Invalid email format' });
      }

      // 5-credit balance check for Private Negotiation listings
      if (userProfile?.id && userProfile.id !== 'anon') {
        const isDemo = isDemoCreditModeActive();
        if (isDemo) {
          const demoBal = DemoCreditsService.getDemoBalance(userProfile.id);
          if (demoBal < 5) {
            newErrors.push({ message: 'Not enough credits. You need 5 credits to post this listing.' });
          }
        } else {
          const userCredits = userProfile.creditsBalance || 0;
          if (userCredits < 5) {
            newErrors.push({ message: 'Not enough credits. You need 5 credits to post this listing.' });
          }
        }
      }
    }

    // Profile Name validation (only if not set in main profile)
    const hasProfileName = userProfile?.name && userProfile.name.trim();
    if (!hasProfileName && (!data.sellerName || !data.sellerName.trim())) {
      newErrors.push({ field: 'sellerName', message: 'Profile Name is required' });
    }

    // Address validation (only if not set in main profile)
    const hasAddress = userProfile?.address || userProfile?.residentialAddress || userProfile?.businessAddress;
    if (!hasAddress && (!data.address || !data.address.trim())) {
      newErrors.push({ field: 'address', message: 'Address is required' });
    }

    // Duplicate detection (Simulated)
    if (data.title.toLowerCase().includes('duplicate')) {
      newErrors.push({ message: 'Potential duplicate listing detected. Please verify your active auctions.' });
    }

    // Prohibited keywords
    const lowerDesc = data.description.toLowerCase();
    const lowerTitle = data.title.toLowerCase();
    ARENA_CONFIG.PROHIBITED_KEYWORDS.forEach(word => {
      if (lowerDesc.includes(word) || lowerTitle.includes(word)) {
        newErrors.push({ field: 'description', message: `Prohibited content detected: "${word}"` });
      }
    });

    // Image count
    const minImages = ARENA_CONFIG.MIN_IMAGES;
    if (data.images.length < minImages) {
      newErrors.push({ message: `Minimum ${minImages} images required to verify listing authenticity` });
    }
    if (data.images.length > ARENA_CONFIG.MAX_IMAGES) {
      newErrors.push({ message: `Maximum ${ARENA_CONFIG.MAX_IMAGES} images allowed` });
    }

    // Price validation
    if (data.startingPrice <= 0) {
      newErrors.push({ field: 'startingPrice', message: 'Starting price must be positive' });
    }

    // KYC Rules
    if (!userProfile?.isKycVerified && data.startingPrice > ARENA_CONFIG.KYC_LIMIT_PKR) {
      newErrors.push({ 
        field: 'startingPrice', 
        message: `Non-KYC users are limited to listings below PKR ${ARENA_CONFIG.KYC_LIMIT_PKR.toLocaleString()}` 
      });
    }

    if (data.reservePrice && data.reservePrice <= data.startingPrice) {
      newErrors.push({ field: 'reservePrice', message: 'Reserve price must be higher than starting price' });
    }

    return newErrors;
  }, [userProfile, isNegotiation, authEmail]);

  const submitAuction = async (data: CreateAuctionInput) => {
    setLoading(true);
    setErrors([]);

    const expectedEmail = (authEmail || userProfile?.email || '').trim();
    const enforcedData: CreateAuctionInput = (isNegotiation && expectedEmail)
      ? { ...data, contactEmail: expectedEmail }
      : data;

    const validationErrors = validateForm(enforcedData);
    
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setLoading(false);
      return { success: false, errors: validationErrors };
    }

    try {
      await ArenaService.createAuction(enforcedData, userProfile);
      
      setLoading(false);
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create auction';
      setErrors([{ message: msg }]);
      setLoading(false);
      return { success: false, errors: [{ message: msg }] };
    }
  };

  return {
    loading,
    errors,
    setErrors,
    submitAuction,
    validateForm
  };
};
