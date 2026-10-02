import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Upload, X, Info, Sparkles, ChevronRight, ChevronLeft, CheckCircle, Ban, AlertCircle } from 'lucide-react';
import { RestrictedActionAlert } from '../components/RestrictedActionAlert';
import { RequiresAuthModal } from '../components/RequiresAuthModal';
import { MARKETPLACE_CATEGORIES, LOCATIONS } from '../constants';
import { LocationSelector } from '../components/LocationSelector';
import { CountrySelector } from '../components/CountrySelector';
import { UserProfile } from '../types';
import { PhoneInput } from '../components/PhoneInput';
import { isUserBanned, getUserBanRemaining } from '../services/userService';

import { CATEGORY_FIELDS } from '../lib/categoryFields';
import { formatPKR } from '../lib/utils';
import { CurrencySelector, getDefaultCurrencyForCountry, getCurrencyByCode } from '../lib/currencies';

type FormData = {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  condition: 'New' | 'Used' | 'Not Applicable';
  price: number;
  currency?: string;
  currencySymbol?: string;
  quantity: number | '';
  shippingCharges: number;
  sellerName: string;
  phoneNumber: string;
  whatsappNumber: string;
  country: string;
  city: string;
  locationArea: string;
  customFields?: Record<string, any>;
};

export function SubmitListing() {
  const { user, userProfile, authError, loginWithGoogle, isBlocked, isIframe } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const banStatus = getUserBanRemaining(userProfile);
  const isPostRestricted = isBlocked || banStatus.isBanned || (userProfile as any)?.postingDisabled || (userProfile as any)?.canPost === false;
  
  const [step, setStep] = useState(1);
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showRestricted, setShowRestricted] = useState(false);
  const [restrictedMessage, setRestrictedMessage] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingData, setPendingData] = useState<FormData | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const searchParams = new URLSearchParams(location.search);
  const initialCategoryQuery = searchParams.get('category');
  const initialCategory = initialCategoryQuery 
    ? MARKETPLACE_CATEGORIES.find(c => c.name.toLowerCase() === initialCategoryQuery.trim().toLowerCase())?.name || ''
    : '';

  const { register, handleSubmit, watch, formState: { errors }, setValue, trigger, reset, control, setError: setFormError } = useForm<FormData>({
    defaultValues: { category: initialCategory, subcategory: '', condition: 'Not Applicable', quantity: '' as any, shippingCharges: 0, country: 'Pakistan', currency: 'PKR', currencySymbol: 'Rs.' }
  });

  const resetForm = (targetCategory = '') => {
    reset({
      title: '',
      description: '',
      category: targetCategory,
      subcategory: '',
      condition: 'Not Applicable',
      price: undefined,
      quantity: '' as any,
      shippingCharges: 0,
      sellerName: user?.displayName || '',
      phoneNumber: user?.phoneNumber || '',
      whatsappNumber: user?.phoneNumber || '',
      country: 'Pakistan',
      city: '',
      locationArea: '',
      customFields: {}
    });
    
    // Re-trigger prefill async
    const prefill = async () => {
      if (user && !user.isAnonymous) {
        try {
          const profileDoc = await getDoc(doc(db, 'users', user.uid));
          if (profileDoc.exists()) {
            const data = profileDoc.data() as UserProfile;
            if (data.name) setValue('sellerName', data.name);
            if (data.phoneNumber) setValue('phoneNumber', data.phoneNumber);
            if (data.country) setValue('country', data.country);
            if (data.city) setValue('city', data.city);
            if (data.address) setValue('locationArea', data.address);
          }
        } catch (e) {
          console.warn('Silent prefill error on reset:', e);
        }
      }
    };
    prefill();
    
    setStep(1);
    setImages([]);
    setSubmitting(false);
    setError('');
    setSuccess(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const catQuery = params.get('category');
    const validCategory = catQuery 
      ? MARKETPLACE_CATEGORIES.find(c => c.name.toLowerCase() === catQuery.trim().toLowerCase())?.name || ''
      : '';

    if (location.state?.forceReset) {
      resetForm(validCategory);
      if (validCategory) {
        setValue('category', validCategory);
      }
      // Clear location state to ensure normal navigation onwards, preserving category query if present
      const cleanPath = validCategory ? `/submit?category=${encodeURIComponent(validCategory)}` : '/submit';
      navigate(cleanPath, { replace: true, state: {} });
    } else if (validCategory && !watch('category')) {
      setValue('category', validCategory);
    }
  }, [location.state?.forceReset, location.search, navigate, setValue]);

  useEffect(() => {
    register('country', { required: true });
    register('city', { required: true });
    async function prefillProfile() {
      if (user && !user.isAnonymous) {
        try {
          const profileDoc = await getDoc(doc(db, 'users', user.uid));
          if (profileDoc.exists()) {
            const data = profileDoc.data() as UserProfile;
            if (data.name) setValue('sellerName', data.name);
            if (data.phoneNumber) setValue('phoneNumber', data.phoneNumber);
            if (data.country) setValue('country', data.country);
            if (data.city) setValue('city', data.city);
            if (data.address) setValue('locationArea', data.address);
          } else if (user.displayName) {
             setValue('sellerName', user.displayName);
          }
        } catch (e: any) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          const isQuota = errorMsg.toLowerCase().includes('quota') || 
                          errorMsg.toLowerCase().includes('resource-exhausted') || 
                          errorMsg.toLowerCase().includes('limit');
          
          console.warn(
            '⚠️ Database profile prefill unavailable. Safely failing back to standard active Authentication info:',
            errorMsg
          );
          
          if (user.displayName) setValue('sellerName', user.displayName);
          if (user.phoneNumber) setValue('phoneNumber', user.phoneNumber);
          
          if (isQuota && typeof window !== 'undefined') {
            (window as any).__firestore_quota_exceeded = true;
          }
        }
      }
    }
    prefillProfile();
  }, [user, setValue]);

  const selectedCategory = watch('category');
  const selectedSubcategory = watch('subcategory');

  const selectedCategoryData = MARKETPLACE_CATEGORIES.find(c => c.name === selectedCategory);
  const subcategories = selectedCategoryData?.subcategories || [];

  // Reset subcategory when category changes
  React.useEffect(() => {
    if (!selectedCategory) return;
    
    const currentData = MARKETPLACE_CATEGORIES.find(c => c.name === selectedCategory);
    if (!currentData) return;

    if (currentData.subcategories && currentData.subcategories.length > 0) {
      if (selectedSubcategory !== currentData.subcategories[0]) {
        setValue('subcategory', currentData.subcategories[0]);
      }
    } else if (selectedSubcategory !== "") {
      setValue('subcategory', '');
    }
  }, [selectedCategory, selectedSubcategory, setValue]);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#1c1917';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
          }
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    if (images.length + files.length > 10) {
      alert('Maximum 10 images allowed');
      return;
    }

    try {
      const resizedImages = await Promise.all(files.map(resizeImage));
      setImages(prev => [...prev, ...resizedImages]);
    } catch (err) {
      console.error(err);
      alert('Error processing images');
    }
  };

  const handlePaymentProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    try {
      await resizeImage(e.target.files[0]);
      // setPaymentProof(resized); // Removed
    } catch (err) {
      console.error(err);
      alert('Error processing payment proof');
    }
  };

  const handleNextStep = async () => {
    let isValid = false;
    
    if (step === 1) {
      isValid = await trigger(['category']);
      if (isValid && !selectedCategory) {
        setError('Please select a category');
        isValid = false;
      } else if (isValid && subcategories.length > 0 && !selectedSubcategory) {
        setError('Please select a subcategory');
        isValid = false;
      } else {
        setError('');
      }
    } else if (step === 2) {
      if (images.length === 0) {
        setError('Please upload at least one image of the item. This is required to process to the next step.');
        isValid = false;
      } else {
        setError('');
        isValid = true;
      }
    } else if (step === 3) {
      isValid = await trigger(['title', 'price', 'condition', 'quantity', 'shippingCharges']);
      
      const qVal = watch('quantity');
      if (qVal === undefined || qVal === null || qVal === '' || Number(qVal) < 1 || isNaN(Number(qVal))) {
        setError('Stock quantity is required. Please enter the available quantity manually before proceeding.');
        setFormError('quantity', {
          type: 'manual',
          message: 'Stock quantity is required. Please enter available stock manually.'
        });
        isValid = false;
      }
      
      // Also trigger validation for custom fields if any
      const categoryFields = CATEGORY_FIELDS[selectedCategory] || [];
      const customFieldNames = categoryFields.filter(f => f.required).map(f => `customFields.${f.name}` as keyof FormData);
      if (customFieldNames.length > 0) {
        const customValid = await trigger(customFieldNames);
        isValid = isValid && customValid;
      }

    } else if (step === 4) {
      isValid = await trigger(['description', 'sellerName', 'phoneNumber', 'country', 'city', 'locationArea']);
    } else if (step === 5) {
      isValid = true; // Review & Plan is simple form submit
    }

    if (isValid) {
      setError('');
      setStep(prev => prev + 1);
    }
  };

  const onSubmit = async (data: FormData) => {
    if (!user || user.isAnonymous) {
      setAuthMessage("Please log in to submit your listing.");
      setShowAuthModal(true);
      return;
    }
    if (isPostRestricted) {
      setRestrictedMessage(
        banStatus.isBanned
          ? `Your account has been restricted by administration from posting new items (${banStatus.formattedText}).`
          : "Your account has been restricted due to violating the policies of this platform."
      );
      setShowRestricted(true);
      return;
    }
    if (images.length === 0) {
      setError('Please upload at least one image of the item.');
      return;
    }

    setPendingData(data);
    setShowConfirmModal(true);
  };

  const confirmSubmit = async () => {
    if (!pendingData) return;
    setShowConfirmModal(false);
    setSubmitting(true);
    setError('');

    try {
      const listingRef = doc(collection(db, 'listings'));
      
      const baseSlug = pendingData.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      const slug = `${baseSlug}-${listingRef.id.slice(0, 6)}`;

      const listingData: any = {
        title: pendingData.title,
        slug: slug,
        description: pendingData.description,
        category: pendingData.category,
        condition: pendingData.condition,
        price: Number(pendingData.price),
        currency: pendingData.currency || 'PKR',
        currencySymbol: pendingData.currencySymbol || getCurrencyByCode(pendingData.currency).symbol,
        originalPrice: Number(pendingData.price),
        priceHistory: [{ price: Number(pendingData.price), updatedAt: new Date() }],
        quantity: Number(pendingData.quantity),
        shippingCharges: Number(pendingData.shippingCharges) || 0,
        images: images,
        sellerName: pendingData.sellerName,
        phoneNumber: pendingData.phoneNumber,
        whatsappNumber: pendingData.phoneNumber, // Default to phone number
        country: pendingData.country || 'Pakistan',
        city: pendingData.city,
        locationArea: pendingData.locationArea || '',
        customFields: pendingData.customFields || {},
        status: 'LIVE', // New listings are live instantly
        ownerId: user?.uid || 'guest',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        views: 0,
        saves: 0,
        isFeatured: false,
        isBoosted: false,
        promotionStatus: 'NONE'
      };
      
      if (pendingData.subcategory) {
        listingData.subcategory = pendingData.subcategory;
      }

      await setDoc(listingRef, listingData);
      
      const originalCity = pendingData.city ? pendingData.city.trim() : '';
      if (originalCity) {
        const normalizedCity = originalCity.toLowerCase();
        const existsInStatic = LOCATIONS.some(loc => loc.toLowerCase() === normalizedCity);
        if (!existsInStatic) {
          try {
            const cityDocRef = doc(db, 'cities', normalizedCity);
            await setDoc(cityDocRef, {
              name: originalCity,
              createdAt: serverTimestamp()
            }, { merge: true });
          } catch (cityErr) {
            console.warn("Failed to register custom city:", cityErr);
          }
        }
      }

      setSuccess(true);
      setSubmittedId(listingRef.id);
      setStep(6);
    } catch (err: any) {
      console.error("Submission failed:", err);
      setError(err instanceof Error ? err.message : String(err));
      try {
        handleFirestoreError(err, OperationType.CREATE, 'listings');
      } catch (e) {
        // Suppress re-throw to allow error to display on screen nicely
      }
    } finally {
      setSubmitting(false);
      setPendingData(null);
    }
  };

  if (isPostRestricted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <RestrictedActionAlert 
          isVisible={true} 
          onClose={() => navigate('/')} 
          message={banStatus.isBanned 
            ? `Your account has been restricted by administration from posting new items (${banStatus.formattedText}).`
            : "Your account has been restricted. You cannot post new items until you are unblocked by the administration."
          }
        />
        <div className="bg-white p-12 border-2 border-red-500/20 rounded-[2rem] shadow-xl flex flex-col items-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center text-red-500 mb-6">
            <Ban className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black text-stone-900 uppercase italic tracking-tighter mb-4">
            {banStatus.isBanned ? "Posting Privileges Restricted" : "Account Restricted"}
          </h1>
          <p className="text-stone-600 mb-8 leading-relaxed font-medium">
            {banStatus.isBanned 
              ? `Your account is temporarily banned from posting new items or listings by administration (${banStatus.formattedText}). All other permissions will remain restricted until the ban duration completes.`
              : "Your account has been restricted due to violating the policies of this platform. You currently do not have permission to post new ads."
            }
          </p>
          <div className="flex flex-col w-full gap-3">
             <button onClick={() => navigate('/support')} className="w-full bg-amber-500 text-stone-900 font-black uppercase italic tracking-widest py-4 rounded-xl hover:bg-amber-600 transition-all text-xs">
                Appeal to Administration
             </button>
             <button onClick={() => navigate('/')} className="w-full bg-stone-100 text-stone-600 font-bold py-3 px-4 rounded-xl hover:bg-stone-200 transition-colors text-xs">
                Return to Marketplace
             </button>
          </div>
        </div>
      </div>
    );
  }

  if (success && step === 6) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center animate-in fade-in duration-350">
        <div className="bg-white p-8 md:p-12 border border-stone-100 rounded-[2rem] shadow-xl flex flex-col items-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 mb-6">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black text-stone-900 uppercase italic tracking-tighter mb-2">Ad Submitted!</h1>
          <p className="text-stone-600 mb-8 font-medium">
            Your listing has been submitted successfully and is now live.
          </p>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={resetForm}
              className="w-full bg-amber-500 hover:bg-amber-600 text-stone-900 font-black uppercase italic tracking-widest py-4 rounded-xl transition-all text-xs"
            >
              Post Another Ad
            </button>
            <div className="grid grid-cols-2 gap-3 w-full">
              {submittedId && (
                <button
                  onClick={() => navigate(`/listings/${submittedId}`)}
                  className="bg-stone-950 hover:bg-stone-900 text-stone-100 font-bold py-3.5 px-4 rounded-xl transition-colors text-xs border border-stone-800 col-span-2"
                >
                  View My Ad
                </button>
              )}
              <button
                onClick={() => navigate('/listings')}
                className="bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold py-3.5 px-4 rounded-xl transition-colors text-xs border border-stone-200"
              >
                Explore Listings
              </button>
              <button
                onClick={() => navigate('/sellr-dashboard')}
                className="bg-stone-50 hover:bg-stone-100 text-stone-700 font-bold py-3.5 px-4 rounded-xl transition-colors text-xs border border-stone-200"
              >
                Seller Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-stone-800">Post your ad</h1>
        <div className="text-sm font-medium text-stone-400 bg-white px-3 py-1 rounded-full border">Step {step} of 5</div>
      </div>
      
      <RequiresAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message={authMessage}
      />

      {showConfirmModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl border border-stone-100 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-5">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-stone-900 uppercase italic tracking-tighter mb-2">Publish Advertisement?</h3>
            <p className="text-stone-600 text-sm font-medium mb-6 leading-relaxed">
              Are you sure you want to submit this listing? It will go live instantly on the Avora marketplace for buyers to see.
            </p>
            <div className="flex gap-3 w-full">
              <button 
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingData(null);
                }}
                className="flex-1 bg-stone-100 hover:bg-stone-250 text-stone-700 font-bold py-3 px-4 rounded-xl transition-colors text-xs border border-stone-200"
              >
                No, Keep Editing
              </button>
              <button 
                type="button"
                onClick={confirmSubmit}
                disabled={submitting}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-black uppercase italic tracking-wider py-3 px-4 rounded-xl transition-colors text-xs disabled:opacity-50 flex items-center justify-center gap-1.5 shadow"
              >
                {submitting ? 'Submitting...' : 'Yes, Publish'} <CheckCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {authError && (
        <div className="bg-red-50 text-red-600 p-5 rounded-2xl mb-6 border border-red-200 shadow-sm animate-in fade-in duration-200">
          <div className="font-extrabold text-xs uppercase tracking-wider mb-1 flex items-center gap-1.5 text-red-800">
            <span>Authentication Error</span>
          </div>
          <p className="text-xs font-semibold leading-relaxed text-red-700">{authError}</p>
          {isIframe && (
            <div className="mt-3 pt-3 border-t border-red-200/50 text-xs font-bold text-red-800 leading-normal">
              💡 Running in preview? If the Google Sign-In popup gets blocked or closed immediately, click the <span className="underline italic">"Open in New Tab"</span> button at the top right of your screen and complete the action.
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6 border border-red-200">
          {error}
        </div>
      )}

      <div className="w-full bg-stone-200 h-2 rounded-full mb-8 overflow-hidden">
        <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${(step / 5) * 100}%`}}></div>
      </div>

      <form 
        onSubmit={handleSubmit(onSubmit, (errs) => {
          console.error("Form validation failed:", errs);
          const errorFields = Object.keys(errs).map(field => {
            if (field === 'customFields') {
              return `Specifications (${Object.keys(errs.customFields || {}).join(', ')})`;
            }
            return field.replace(/([A-Z])/g, ' $1').toLowerCase();
          }).join(', ');
          setError(`Please fill all required fields before submitting. Missing or invalid: ${errorFields}.`);
        })} 
        className="bg-white p-6 rounded-lg shadow-sm border border-stone-200"
      >
        
        {/* STEP 1: CATEGORY & SUBCATEGORY */}
        {step === 1 && (
          <div className="space-y-6 min-h-[300px]">
             <h2 className="text-xl font-bold text-stone-800">What are you offering?</h2>
             
             <div className="flex flex-col md:flex-row gap-4">
               {/* Main Category Dropdown */}
               <div className="flex-1">
                 <label className="block text-sm font-medium text-stone-700 mb-1">Select Category *</label>
                 <select 
                   {...register('category')} 
                   className="w-full border p-3 rounded-md border-stone-200 bg-white shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                 >
                   <option value="">-- Choose a Category --</option>
                   {MARKETPLACE_CATEGORIES.map(cat => (
                     <option key={cat.name} value={cat.name}>{cat.name}</option>
                   ))}
                 </select>
               </div>

               {/* Subcategory Dropdown */}
               {subcategories.length > 0 && selectedCategory && (
                 <div className="flex-1 animate-in fade-in slide-in-from-left-2">
                   <label className="block text-sm font-medium text-stone-700 mb-1">Select Subcategory *</label>
                   <select 
                     {...register('subcategory')} 
                     className="w-full border p-3 rounded-md border-stone-200 bg-white shadow-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 cursor-pointer"
                   >
                     <option value="">-- Choose a Subcategory --</option>
                     {subcategories.map(sub => (
                       <option key={sub} value={sub}>{sub}</option>
                     ))}
                   </select>
                 </div>
               )}
             </div>
          </div>
        )}

        {/* STEP 2: UPLOAD IMAGES */}
        {step === 2 && (
          <div className="space-y-6 min-h-[300px]">
             <div>
               <h2 className="text-xl font-bold text-stone-800">Upload Photos</h2>
               <p className="text-stone-400 text-sm mt-1">Ads with high quality photos get 10x more responses. You can add up to 10 photos.</p>
             </div>
             
             <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                {images.map((img, i) => (
                  <div key={i} className={`relative aspect-square border rounded-md overflow-hidden ${i === 0 ? 'ring-2 ring-amber-500' : ''}`}>
                    <img src={img} alt="preview" className="object-cover w-full h-full" />
                    {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-amber-500/90 text-center text-xs uppercase font-bold text-white py-1">Cover</span>}
                    <button 
                      type="button" 
                      onClick={() => setImages(images.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {images.length < 10 && (
                  <label className="aspect-square border-2 border-dashed border-stone-300 rounded flex flex-col items-center justify-center cursor-pointer hover:border-amber-500 hover:bg-amber-50 transition-colors text-stone-400">
                    <Upload className="w-6 h-6 mb-2 text-stone-400" />
                    <span className="text-xs font-medium">Add Photo</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                )}
             </div>
          </div>
        )}

        {/* STEP 3: DETAILS */}
        {step === 3 && (
          <div className="space-y-6 min-h-[300px]">
            <h2 className="text-xl font-bold text-stone-800">Item Details</h2>
            
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Ad Title *</label>
              <input 
                {...register('title', { required: true, maxLength: 200 })} 
                className={`w-full border-stone-300 rounded-md shadow-sm focus:border-amber-500 focus:ring-amber-500 p-2.5 border ${errors.title ? 'border-red-500' : ''}`}
                placeholder="Key features, brand, condition..."
              />
              {errors.title && <span className="text-red-500 text-xs mt-1">Title is required.</span>}
            </div>

            {/* Receiving Currency & Price Inputs */}
            <div className="space-y-3 bg-amber-50/60 p-4 rounded-2xl border border-amber-200/70">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-stone-800 mb-1">Receiving Currency *</label>
                  <CurrencySelector
                    value={watch('currency') || getDefaultCurrencyForCountry(watch('country')).code}
                    onChange={(curr) => {
                      setValue('currency', curr.code);
                      setValue('currencySymbol', curr.symbol);
                    }}
                  />
                  <p className="text-[11px] text-stone-500 font-medium mt-1">
                    Auto-selected based on location ({watch('country') || 'Pakistan'}).
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-800 mb-1">
                    Price ({getCurrencyByCode(watch('currency') || 'PKR').code}) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-extrabold text-amber-600 text-sm">
                      {getCurrencyByCode(watch('currency') || 'PKR').symbol}
                    </span>
                    <input 
                      type="number" 
                      step="any"
                      {...register('price', { required: true, min: 0.01 })} 
                      className={`w-full bg-white border-stone-300 rounded-xl shadow-xs focus:border-amber-500 focus:ring-amber-500 pl-14 pr-3 py-3 border font-black text-stone-900 ${errors.price ? 'border-red-500' : ''}`}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.price && <span className="text-red-500 text-xs mt-1 block">Price is required.</span>}
                </div>
              </div>
              <p className="text-xs text-amber-800 font-bold flex items-center gap-1.5 pt-1 border-t border-amber-200/50">
                <Info className="w-4 h-4 shrink-0 text-amber-600" />
                Selected currency ({watch('currency') || 'PKR'}) is locked upon submission and cannot be modified afterwards.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1 flex items-center justify-between">
                  <span>Stock Quantity <span className="text-red-500 font-bold">*</span></span>
                  {errors.quantity && (
                    <span className="text-[10px] sm:text-xs font-black uppercase text-red-600 bg-red-100 border border-red-200 px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                      <AlertCircle className="w-3 h-3 stroke-[2.5]" />
                      Quantity Required
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    min="1"
                    step="1"
                    {...register('quantity', { 
                      required: 'Stock quantity is required. Please enter available stock manually.', 
                      min: { value: 1, message: 'Stock quantity must be at least 1 unit.' },
                      validate: (val) => {
                        if (val === undefined || val === null || val === '' || isNaN(Number(val))) {
                          return 'Stock quantity is required. Please enter available stock manually.';
                        }
                        if (Number(val) < 1) {
                          return 'Stock quantity must be at least 1 unit.';
                        }
                        return true;
                      }
                    })} 
                    className={`w-full rounded-md shadow-sm p-2.5 border transition-all ${
                      errors.quantity 
                        ? 'border-2 border-red-500 bg-red-50/60 ring-2 ring-red-500/20 text-red-900 font-bold placeholder-red-400 focus:outline-none focus:border-red-600 focus:ring-red-500' 
                        : 'border-stone-300 focus:border-amber-500 focus:ring-amber-500'
                    }`}
                    placeholder="Enter available stock (e.g. 1, 5, 10)"
                  />
                  {errors.quantity && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-red-500">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                  )}
                </div>
                {errors.quantity && (
                  <div className="mt-1.5 p-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-xs font-bold animate-in fade-in duration-200 shadow-xs">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{errors.quantity.message || 'Stock quantity is required. Please enter available stock manually.'}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Shipping Charges ({getCurrencyByCode(watch('currency') || 'PKR').symbol}) *
                </label>
                <input 
                  type="number" 
                  step="any"
                  {...register('shippingCharges', { required: true, min: 0 })} 
                  className={`w-full border-stone-300 rounded-md shadow-sm focus:border-amber-500 focus:ring-amber-500 p-2.5 border ${errors.shippingCharges ? 'border-red-500' : ''}`}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Condition *</label>
                <select 
                  {...register('condition', { required: true })} 
                  className="w-full border-stone-300 rounded-md shadow-sm focus:border-amber-500 focus:ring-amber-500 p-2.5 border bg-white"
                >
                  <option value="New">New</option>
                  <option value="Used">Used</option>
                  <option value="Not Applicable">Not Applicable</option>
                </select>
              </div>
            </div>

            {CATEGORY_FIELDS[selectedCategory] && CATEGORY_FIELDS[selectedCategory].length > 0 && (
              <div className="pt-4 border-t mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-full">
                  <h3 className="font-semibold text-stone-700 text-sm uppercase tracking-wider">Specific Details</h3>
                </div>
                {CATEGORY_FIELDS[selectedCategory].map(field => (
                  <div key={field.name}>
                    <label className="block text-sm font-medium text-stone-700 mb-1">{field.label} {field.required && '*'}</label>
                    {field.type === 'select' ? (
                      <select 
                        {...register(`customFields.${field.name}` as any, { required: field.required })} 
                        className={`w-full border-stone-300 rounded-md shadow-sm focus:border-amber-500 focus:ring-amber-500 p-2.5 border bg-white ${errors.customFields?.[field.name] ? 'border-red-500' : ''}`}
                      >
                        <option value="">Select option</option>
                        {field.options?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type={field.type}
                        {...register(`customFields.${field.name}` as any, { required: field.required })} 
                        className={`w-full border-stone-300 rounded-md shadow-sm focus:border-amber-500 focus:ring-amber-500 p-2.5 border ${errors.customFields?.[field.name] ? 'border-red-500' : ''}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 4: DESCRIPTION & LOCATION */}
        {step === 4 && (
          <div className="space-y-6 min-h-[300px]">
            <h2 className="text-xl font-bold text-stone-800">Description & Location</h2>
            
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Description *</label>
              <textarea 
                {...register('description', { required: true })} 
                rows={4}
                className={`w-full border-stone-300 rounded-md shadow-sm focus:border-amber-500 focus:ring-amber-500 p-2 border ${errors.description ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                placeholder="Describe your item, condition, reason for selling, and any important details..."
              />
              {errors.description && <p className="text-xs text-red-500 mt-1 font-semibold animate-in fade-in">Description is required</p>}
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-semibold text-stone-800 mb-4 text-lg">Contact & Location</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Your Name *</label>
                  <input 
                    {...register('sellerName', { required: true })} 
                    className={`w-full border p-2.5 rounded-md ${errors.sellerName ? 'border-red-500 ring-1 ring-red-500' : 'border-stone-200'}`} 
                  />
                  {errors.sellerName && <p className="text-xs text-red-500 mt-1 font-semibold animate-in fade-in">Your name is required</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Phone Number (WhatsApp) *</label>
                  <Controller
                    name="phoneNumber"
                    control={control}
                    rules={{ required: true }}
                    render={({ field }) => (
                      <PhoneInput
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="e.g. 3XX XXXXXXX"
                      />
                    )}
                  />
                  {errors.phoneNumber && <p className="text-xs text-red-500 mt-1 font-semibold animate-in fade-in">Phone number is required</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Country *</label>
                  <CountrySelector 
                    value={watch('country') || 'Pakistan'} 
                    onChange={(val) => {
                      setValue('country', val);
                      const defaultCurr = getDefaultCurrencyForCountry(val);
                      setValue('currency', defaultCurr.code);
                      setValue('currencySymbol', defaultCurr.symbol);
                      trigger('country');
                    }} 
                    placeholder="Select Country"
                  />
                  {errors.country && <p className="text-xs text-red-500 mt-1 font-semibold animate-in fade-in">Country is required</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">City *</label>
                  <LocationSelector 
                    value={watch('city') || ''} 
                    onChange={(val) => {
                      setValue('city', val);
                      trigger('city');
                    }} 
                    placeholder="e.g. Lahore, Karachi"
                  />
                  {errors.city && <p className="text-xs text-red-500 mt-1 font-semibold animate-in fade-in">City is required</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Location / Area *</label>
                  <input {...register('locationArea', { required: true })} className="w-full border p-2.5 rounded-md border-stone-200" placeholder="e.g. DHA, Gulberg" />
                  {errors.locationArea && <p className="text-xs text-red-500 mt-1 font-semibold animate-in fade-in">Location/Area is required</p>}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-semibold text-stone-800 mb-4 text-lg">Payment Methods</h3>
              <div className="bg-stone-50 p-4 rounded-lg border border-stone-200">
                <p className="text-sm text-stone-600">Currently, we only support <strong>Cash on Delivery (COD)</strong> for all marketplace transactions to ensure security.</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: FINAL REVIEW */}
        {step === 5 && (
          <div className="space-y-6 min-h-[300px] animate-in fade-in duration-300">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-stone-900 uppercase italic tracking-tighter">Final Review</h2>
              <p className="text-stone-400 font-semibold text-xs uppercase tracking-wider mt-1">Please double check your details before going live</p>
            </div>
            
            <div className="bg-stone-50 rounded-[2rem] border border-stone-200 shadow-sm p-6 sm:p-8 space-y-6">
              {/* Category, Condition & Basic Title */}
              <div className="border-b border-stone-200/80 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-xs uppercase font-black tracking-widest text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200/30">
                    {watch('category')} {watch('subcategory') && `• ${watch('subcategory')}`}
                  </span>
                  <span className="bg-stone-900 text-stone-100 text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full shrink-0">
                    Condition: {watch('condition')}
                  </span>
                </div>
                <h3 className="font-extrabold text-xl text-stone-900 leading-tight">{watch('title')}</h3>
              </div>

              {/* Uploaded Photos Preview Grid */}
              {images.length > 0 && (
                <div className="border-b border-stone-200/80 pb-6">
                  <span className="block text-xs uppercase font-black tracking-widest text-stone-400 mb-2.5">Uploaded Photos ({images.length})</span>
                  <div className="flex flex-wrap gap-2.5">
                    {images.map((img, idx) => (
                      <div key={idx} className={`relative w-16 h-16 rounded-xl overflow-hidden border border-stone-200 shrink-0 ${idx === 0 ? 'ring-2 ring-amber-500 ring-offset-2' : ''}`}>
                        <img src={img} alt="review preview" className="object-cover w-full h-full" />
                        {idx === 0 && (
                          <div className="absolute inset-x-0 bottom-0 bg-amber-500 text-center py-0.5">
                            <span className="text-xs font-black text-stone-950 uppercase tracking-widest">Cover</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Commercial Metrics / Prices Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-stone-200/80 pb-6">
                <div className="bg-white p-3 rounded-xl border border-stone-100 shadow-sm">
                  <p className="text-xs uppercase font-bold text-stone-400 tracking-wider">Price Offered</p>
                  <p className="text-lg font-black text-amber-600 mt-1">{formatPKR(watch('price'), watch('currency'))}</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-100 shadow-sm">
                  <p className="text-xs uppercase font-bold text-stone-400 tracking-wider">Stock Available</p>
                  <p className="text-lg font-black text-stone-900 mt-1">
                    {watch('quantity') ? `${watch('quantity')} ${Number(watch('quantity')) === 1 ? 'Unit' : 'Units'}` : <span className="text-red-500 text-xs font-bold">Required</span>}
                  </p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-100 shadow-sm">
                  <p className="text-xs uppercase font-bold text-stone-400 tracking-wider">Shipping Fee</p>
                  <p className={`text-sm font-black mt-1.5 ${Number(watch('shippingCharges')) === 0 ? 'text-emerald-600' : 'text-stone-700'}`}>
                    {Number(watch('shippingCharges')) === 0 ? 'Free Shipping 🚚' : formatPKR(watch('shippingCharges'), watch('currency'))}
                  </p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-100 shadow-sm">
                  <p className="text-xs uppercase font-bold text-stone-400 tracking-wider">Est. Checkout Value</p>
                  <p className="text-lg font-black text-stone-900 mt-1">
                    {formatPKR(Number(watch('price')) + Number(watch('shippingCharges')), watch('currency'))}
                  </p>
                </div>
              </div>

              {/* Custom Specific Category Attributes */}
              {CATEGORY_FIELDS[selectedCategory] && CATEGORY_FIELDS[selectedCategory].length > 0 && (
                <div className="border-b border-stone-200/80 pb-6">
                  <span className="block text-xs uppercase font-black tracking-widest text-stone-400 mb-2.5">Specific Specifications</span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {CATEGORY_FIELDS[selectedCategory].map(field => {
                      const val = watch(`customFields.${field.name}` as any);
                      if (!val) return null;
                      return (
                        <div key={field.name} className="bg-white p-3 rounded-xl border border-stone-100/80 shadow-sm">
                          <p className="text-xs uppercase font-bold text-stone-400 leading-none">{field.label}</p>
                          <p className="text-xs font-black text-stone-900 mt-1 leading-snug">{val}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Physical Location & Contact Identity */}
              <div className="border-b border-stone-200/80 pb-6">
                <span className="block text-xs uppercase font-black tracking-widest text-stone-400 mb-2.5">Seller & Location Info</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-xs uppercase font-bold text-stone-400">Merchant</span>
                    <p className="text-xs font-bold text-stone-900 mt-0.5">{watch('sellerName')}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase font-bold text-stone-400">WhatsApp / Contact</span>
                    <p className="text-xs font-bold text-stone-900 mt-0.5">{watch('phoneNumber')}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase font-bold text-stone-400">City Marketplace</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs font-bold text-stone-900">{watch('city')}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs uppercase font-bold text-stone-400">Area/address</span>
                    <p className="text-xs font-bold text-stone-600 mt-0.5 truncate">{watch('locationArea') || "Not specified"}</p>
                  </div>
                </div>
              </div>

              {/* Detailed Description */}
              <div>
                <span className="block text-xs uppercase font-black tracking-widest text-stone-400 mb-1.5">Detailed Description</span>
                <p className="text-xs font-semibold text-stone-600 leading-relaxed bg-white p-4 rounded-2xl border border-stone-100/90 whitespace-pre-wrap">{watch('description')}</p>
              </div>
            </div>

            <div className="bg-amber-50/60 p-4 sm:p-5 rounded-2xl flex items-start gap-3 border border-amber-100">
              <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-amber-900">Important Checklist</p>
                <p className="text-xs font-semibold text-amber-800/90 leading-relaxed">
                  By clicking <span className="font-extrabold italic">"Submit Listing"</span>, you confirm that the provided information is 100% authentic and ready for transaction. Your listing will go live instantly on the Avora marketplace, and prospective buyers can connect with you straight away.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* NAVIGATION BUTTONS */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-stone-100">
          {step > 1 ? (
             <button 
                type="button" 
                onClick={() => { setError(''); setStep(s => s - 1); }}
                className="px-6 py-2.5 text-stone-600 font-medium hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors flex flex-row items-center gap-1"
             >
               <ChevronLeft className="w-4 h-4" /> Back
             </button>
          ) : <div></div>}

          {step < 5 ? (
             <button 
                type="button" 
                onClick={handleNextStep}
                className="px-8 py-2.5 bg-amber-500 text-stone-900 font-bold rounded-md hover:bg-amber-600 transition-colors flex flex-row items-center gap-1 shadow-sm"
             >
               Next <ChevronRight className="w-4 h-4 font-bold" />
             </button>
          ) : (
             <button 
                type="submit" 
                disabled={submitting}
                className="px-8 py-2.5 bg-green-500 text-white font-bold rounded-md hover:bg-green-600 transition-colors shadow-sm disabled:opacity-70 flex flex-row items-center gap-2"
             >
               {submitting ? 'Submitting...' : 'Submit Listing'} <CheckCircle className="w-4 h-4" />
             </button>
          )}
        </div>

      </form>
    </div>
  );
}
