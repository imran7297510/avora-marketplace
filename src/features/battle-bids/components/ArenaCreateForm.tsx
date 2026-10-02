import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Gavel, DollarSign, MapPin, Clock, Info, ShieldAlert, Sparkles, Zap, Coins, AlertTriangle, Plus, CheckCircle2, Lock, Mail } from 'lucide-react';
import { ArenaImageManager } from './ArenaImageManager';
import { ArenaButton } from './ArenaButton';
import { useAuctionForm } from '../hooks/useAuctionForm';
import { useAuth } from '../../../context/AuthContext';
import { ARENA_CONFIG, ARENA_CATEGORIES } from '../constants';
import { CreateAuctionInput } from '../types';
import { CountrySelector } from '../../../components/CountrySelector';
import { PhoneInput } from '../../../components/PhoneInput';
import { CurrencySelector, getDefaultCurrencyForCountry, getGlobalPreferredCurrency } from '../../../lib/currencies';
import { useCredits } from '../../credits';

export const ArenaCreateForm: React.FC<{ isNegotiation?: boolean }> = ({ isNegotiation }) => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const loginEmail = (user?.email || userProfile?.email || '').trim();
  const { loading, errors, submitAuction } = useAuctionForm(userProfile, isNegotiation, loginEmail);
  const { creditsBalance, openPurchase, isDemoMode } = useCredits();

  const initialCountry = userProfile?.country || 'Pakistan';
  const initialCurrencyObj = getDefaultCurrencyForCountry(initialCountry);

  const [formData, setFormData] = useState<CreateAuctionInput>({
    title: '',
    category: '',
    brand: '',
    model: '',
    condition: 'excellent',
    description: '',
    shippingInfo: 'Standard Delivery (3-5 days)',
    startingPrice: 0,
    currency: initialCurrencyObj.code,
    currencySymbol: initialCurrencyObj.symbol,
    reservePrice: undefined,
    durationDays: 3,
    country: initialCountry,
    city: userProfile?.city || '',
    images: [],
    coverImageIndex: 0,
    isNegotiationOnly: isNegotiation,
    sellerName: userProfile?.name || '',
    address: userProfile?.address || userProfile?.residentialAddress || userProfile?.businessAddress || '',
    contactEmail: isNegotiation ? loginEmail : '',
    contactNumber: userProfile?.phoneNumber || '',
  });

  React.useEffect(() => {
    const currentLoginEmail = (user?.email || userProfile?.email || '').trim();
    if (userProfile || user) {
      const userCountry = userProfile?.country || 'Pakistan';
      const defaultCurr = getDefaultCurrencyForCountry(userCountry);
      setFormData(prev => ({
        ...prev,
        sellerName: prev.sellerName || userProfile?.name || '',
        country: prev.country || userCountry,
        currency: prev.currency || defaultCurr.code,
        currencySymbol: prev.currencySymbol || defaultCurr.symbol,
        city: prev.city || userProfile?.city || '',
        address: prev.address || userProfile?.address || userProfile?.residentialAddress || userProfile?.businessAddress || '',
        contactNumber: prev.contactNumber || userProfile?.phoneNumber || '',
        contactEmail: isNegotiation ? currentLoginEmail : (prev.contactEmail || currentLoginEmail),
      }));
    }
  }, [userProfile, user, isNegotiation]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    // Under Private Negotiations, the email address is locked to the authenticated login email
    if (isNegotiation && name === 'contactEmail') {
      return;
    }
    setFormData(prev => ({
      ...prev,
      [name]: (name.includes('Price') || name === 'durationDays') ? (value === '' ? undefined : Number(value)) : value
    }));
  };

  const handleImageChange = (images: File[], coverIndex: number) => {
    setFormData(prev => ({ ...prev, images, coverImageIndex: coverIndex }));
  };

  const handleDeployWithMode = async (launchType: 'now' | 'later' | 'boosters') => {
    const currentLoginEmail = (user?.email || userProfile?.email || '').trim();
    const updatedData = { 
      ...formData, 
      contactEmail: isNegotiation ? currentLoginEmail : formData.contactEmail,
      isNegotiationOnly: Boolean(isNegotiation), 
      launchType 
    };
    const result = await submitAuction(updatedData);
    if (result.success) {
      if (isNegotiation) {
        navigate('/negotiations');
      } else {
        navigate('/battle-bids');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleDeployWithMode('now');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-12">
      {/* 1. Combat Visuals */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 bg-rose-600 rounded-full" />
          <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">Visual Intelligence</h3>
        </div>
        <ArenaImageManager 
          images={formData.images} 
          coverIndex={formData.coverImageIndex} 
          onChange={handleImageChange} 
        />
      </section>

      {/* 2. Listing Intel */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 bg-rose-600 rounded-full" />
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">Unit Specifications</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1">Title</label>
              <input 
                type="text" 
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="e.g. Rolex Submariner Date 126610LN"
                className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all text-white"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1">Category</label>
              <select 
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all text-white cursor-pointer"
              >
                <option value="" className="text-stone-400 bg-stone-950">Select Category...</option>
                {ARENA_CATEGORIES.map(cat => (
                  <option key={cat} value={cat} className="text-white bg-stone-950">{cat}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1">Brand (Optional)</label>
                <input 
                  type="text" 
                  name="brand"
                  value={formData.brand}
                  onChange={handleInputChange}
                  placeholder="e.g. Rolex"
                  className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1">Model (Optional)</label>
                <input 
                  type="text" 
                  name="model"
                  value={formData.model}
                  onChange={handleInputChange}
                  placeholder="e.g. Submariner"
                  className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1">Condition</label>
                <select 
                  name="condition"
                  value={formData.condition}
                  onChange={handleInputChange}
                  className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all"
                >
                  <option value="new">Brand New</option>
                  <option value="mint">Mint / Like New</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1">Shipping Strategy</label>
                <input 
                  type="text" 
                  name="shippingInfo"
                  value={formData.shippingInfo}
                  onChange={handleInputChange}
                  placeholder="Standard Delivery"
                  className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1">Intelligence Logs (Description)</label>
              <textarea 
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={5}
                placeholder="Detail the unit's history, current status, and mission-critical info..."
                className="w-full bg-stone-900 border border-stone-800 rounded-2xl px-4 py-4 text-sm font-medium focus:border-rose-500/50 outline-none transition-all resize-none"
              />
            </div>

            {/* Contact Details (Locked for Private Negotiation) */}
            {isNegotiation && (
              <div className="col-span-1 md:col-span-3 space-y-3 mt-6 pt-6 border-t border-stone-800">
                <div className="space-y-2 max-w-xl">
                  <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                    <label className="text-xs font-black uppercase tracking-widest text-stone-300 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-amber-500" />
                      <span>Contact Email</span>
                      <span className="text-amber-500">*</span>
                    </label>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 uppercase bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                      <Lock className="w-3 h-3" /> Locked (Login Account)
                    </span>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-amber-500/80">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input 
                      type="email" 
                      name="contactEmail"
                      value={loginEmail || ''}
                      readOnly
                      disabled
                      placeholder={loginEmail ? loginEmail : "Login email required"}
                      className="w-full bg-stone-950/80 border border-stone-800 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold font-mono text-amber-300 cursor-not-allowed select-none opacity-90 shadow-inner"
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-1.5 text-left">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>Security & Identity Verification</span>
                    </div>
                    <p className="text-[11px] text-stone-400 leading-relaxed pl-6">
                      This listing is strictly bound to your authenticated account email (<span className="text-amber-300 font-mono font-bold">{loginEmail || 'No account logged in'}</span>). Organization, team, or secondary email addresses cannot be used under the Private Negotiation Hub.
                    </p>
                    {!loginEmail && (
                      <p className="text-[11px] text-rose-400 font-semibold pl-6">
                        ⚠️ Please sign in to your account with your verified email to post this private negotiation listing.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Combat Economics / Negotiation Terms */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 bg-amber-500 rounded-full" />
            <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">
              {isNegotiation ? "Negotiation Terms" : "Combat Economics"}
            </h3>
          </div>

          <div className="bg-stone-900/50 border border-stone-800 rounded-[2.5rem] p-8 space-y-6">
            {/* Receiving Currency Selector */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1 flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-amber-500" /> Receiving Currency
              </label>
              <CurrencySelector
                value={formData.currency || getGlobalPreferredCurrency().code}
                onChange={(selectedCurr) => {
                  setFormData(prev => ({
                    ...prev,
                    currency: selectedCurr.code,
                    currencySymbol: selectedCurr.symbol
                  }));
                }}
                placeholder="Select Currency"
                className="bg-stone-950 border-stone-800 text-white"
              />
              <p className="text-[11px] text-stone-400 italic px-1">
                Defaults automatically based on your location or preference ({formData.country || 'Global'}). You can choose any world currency or cryptocurrency (USDT).
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1 flex items-center gap-2">
                <Gavel className="w-3 h-3" /> {isNegotiation ? `Asking Price (${formData.currency || getGlobalPreferredCurrency().code})` : `Starting Bid (${formData.currency || getGlobalPreferredCurrency().code})`}
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-amber-500 text-sm">
                  {formData.currencySymbol || formData.currency || getGlobalPreferredCurrency().symbol}
                </span>
                <input 
                  type="number" 
                  step="any"
                  min="0.01"
                  name="startingPrice"
                  value={formData.startingPrice || ''}
                  onChange={handleInputChange}
                  placeholder="0.00"
                  className="w-full bg-stone-950 border border-stone-800 rounded-2xl pl-16 pr-4 py-4 text-lg font-black font-mono focus:border-amber-500/50 outline-none transition-all text-white"
                />
              </div>
              <p className="text-[11px] text-amber-500 font-bold uppercase tracking-wider px-1 flex items-center gap-1.5 bg-amber-500/5 p-2 rounded-xl border border-amber-500/10">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Currency & Price Lock Active: Selected currency ({formData.currency || getGlobalPreferredCurrency().code}) and price are locked once listed and cannot be changed later.
              </p>
              {!userProfile?.isKycVerified && (
                <div className="flex items-center gap-2 text-rose-500 bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <p className="text-xs font-bold uppercase tracking-wider">
                    Unverified limit: {formData.currencySymbol || 'PKR'} {ARENA_CONFIG.KYC_LIMIT_PKR.toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {!isNegotiation && (
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1 flex items-center gap-2">
                  <ShieldAlert className="w-3 h-3" /> Reserve Price (Optional)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600" />
                  <input 
                    type="number" 
                    name="reservePrice"
                    value={formData.reservePrice || ''}
                    onChange={handleInputChange}
                    placeholder="No Reserve"
                    className="w-full bg-stone-950 border border-stone-800 rounded-2xl pl-12 pr-4 py-4 text-lg font-black font-mono focus:border-amber-500/50 outline-none transition-all"
                  />
                </div>
                <p className="text-xs text-stone-600 font-medium italic px-1">Unit won't sell unless bids reach this price.</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1 flex items-center gap-2">
                <Clock className="w-3 h-3" /> Duration
              </label>
              <select 
                name="durationDays"
                value={formData.durationDays}
                onChange={handleInputChange}
                className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-4 text-sm font-black uppercase focus:border-amber-500/50 outline-none transition-all text-white"
              >
                {ARENA_CONFIG.DURATION_OPTIONS.map(d => (
                  <option key={d.label} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Seller Identity & Logistics (Centralized and Mobile Friendly) */}
      <section className="space-y-6 bg-stone-900/40 p-6 md:p-8 border border-stone-800/80 rounded-[2.5rem]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 bg-rose-600 rounded-full" />
          <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">Seller Identity & Logistics</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Profile Name */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1 flex items-center justify-between">
              <span>Profile Name</span>
              {userProfile?.name ? (
                <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 uppercase">
                  ● Locked (Profile Set)
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-500 uppercase">
                  ● Required Input
                </span>
              )}
            </label>
            <input 
              type="text" 
              name="sellerName"
              value={formData.sellerName || ''}
              onChange={handleInputChange}
              disabled={!!userProfile?.name}
              placeholder="Enter your Profile Name"
              className={`w-full border rounded-2xl px-4 py-4 text-sm font-medium outline-none transition-all ${
                userProfile?.name 
                  ? "bg-stone-950/60 border-stone-900 text-stone-400 cursor-not-allowed" 
                  : "bg-stone-950 border-stone-800 focus:border-rose-500/50 text-white"
              }`}
            />
            <p className="text-xs text-stone-400 px-1 italic">
              {userProfile?.name 
                ? "Synchronized with your My Profile page. Changing is only allowed from there." 
                : "Enter Profile Name. This will save to your profile & display to the public."}
            </p>
          </div>

          {/* Country */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1 flex items-center justify-between">
              <span>Country</span>
              {userProfile?.country ? (
                <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 uppercase">
                  ● Locked (Profile Set)
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-500 uppercase">
                  ● Required Input
                </span>
              )}
            </label>
            <CountrySelector 
              value={formData.country || 'Pakistan'}
              onChange={(val) => {
                const defaultCurr = getDefaultCurrencyForCountry(val);
                setFormData(prev => ({ 
                  ...prev, 
                  country: val,
                  currency: defaultCurr.code,
                  currencySymbol: defaultCurr.symbol
                }));
              }}
              disabled={!!userProfile?.country}
              placeholder="Select Country"
            />
            <p className="text-xs text-stone-400 px-1 italic">
              {userProfile?.country 
                ? "Synchronized with your My Profile page. Changing is only allowed from there." 
                : "Select Country. This will save to your profile."}
            </p>
          </div>

          {/* Location / City */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1 flex items-center justify-between">
              <span>Location (City)</span>
              {userProfile?.city ? (
                <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 uppercase">
                  ● Locked (Profile Set)
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-500 uppercase">
                  ● Required Input
                </span>
              )}
            </label>
            <input 
              type="text" 
              name="city"
              value={formData.city || ''}
              onChange={handleInputChange}
              disabled={!!userProfile?.city}
              placeholder="e.g. Karachi"
              className={`w-full border rounded-2xl px-4 py-4 text-sm font-medium outline-none transition-all ${
                userProfile?.city 
                  ? "bg-stone-950/60 border-stone-900 text-stone-400 cursor-not-allowed" 
                  : "bg-stone-950 border-stone-800 focus:border-rose-500/50 text-white"
              }`}
            />
            <p className="text-xs text-stone-400 px-1 italic">
              {userProfile?.city 
                ? "Synchronized with your My Profile page. Changing is only allowed from there." 
                : "Enter primary city. This will save to your profile."}
            </p>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1 flex items-center justify-between">
              <span>Logistics Address</span>
              {(userProfile?.address || userProfile?.residentialAddress || userProfile?.businessAddress) ? (
                <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 uppercase">
                  ● Locked (Profile Set)
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-500 uppercase">
                  ● Required Input
                </span>
              )}
            </label>
            <input 
              type="text" 
              name="address"
              value={formData.address || ''}
              onChange={handleInputChange}
              disabled={!!(userProfile?.address || userProfile?.residentialAddress || userProfile?.businessAddress)}
              placeholder="e.g. Phase 5, DHA, Karachi"
              className={`w-full border rounded-2xl px-4 py-4 text-sm font-medium outline-none transition-all ${
                (userProfile?.address || userProfile?.residentialAddress || userProfile?.businessAddress)
                  ? "bg-stone-950/60 border-stone-900 text-stone-400 cursor-not-allowed" 
                  : "bg-stone-950 border-stone-800 focus:border-rose-500/50 text-white"
              }`}
            />
            <p className="text-xs text-stone-400 px-1 italic">
              {(userProfile?.address || userProfile?.residentialAddress || userProfile?.businessAddress)
                ? "Synchronized with your My Profile page. Changing is only allowed from there." 
                : "Enter delivery logistics address. This will save to your profile."}
            </p>
          </div>

          {/* Contact Number */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1 flex items-center justify-between">
              <span>Contact Number</span>
              {userProfile?.phoneNumber ? (
                <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 uppercase">
                  ● Locked (Profile Set)
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-500 uppercase">
                  ● Required Input
                </span>
              )}
            </label>
            <div className="pt-1">
              <PhoneInput
                value={formData.contactNumber || ''}
                onChange={(val) => setFormData(prev => ({ ...prev, contactNumber: val }))}
                disabled={!!userProfile?.phoneNumber}
                placeholder="e.g. 300 1234567"
              />
            </div>
            <p className="text-xs text-stone-400 px-1 italic">
              {userProfile?.phoneNumber 
                ? "Synchronized with your My Profile page. Changing is only allowed from there." 
                : "Enter active contact number. This will save to your profile."}
            </p>
          </div>

          {/* Account / Login Email */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-stone-400 px-1 flex items-center justify-between">
              <span>Account Email</span>
              <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 uppercase">
                <Lock className="w-3 h-3" /> Locked (Login Account)
              </span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-stone-500">
                <Mail className="w-4 h-4" />
              </div>
              <input 
                type="email" 
                value={loginEmail || 'No authenticated account'}
                readOnly
                disabled
                placeholder="Login email"
                className="w-full bg-stone-950/60 border border-stone-900 rounded-2xl pl-11 pr-4 py-4 text-sm font-medium font-mono text-stone-300 cursor-not-allowed select-none"
              />
            </div>
            <p className="text-xs text-stone-400 px-1 italic">
              {isNegotiation 
                ? "Locked to your login email. Organization and external emails cannot be used for Private Negotiations."
                : "Synchronized with your authenticated account."}
            </p>
          </div>
        </div>
      </section>

      {/* STEP 34B: Private Negotiation Listing Fee Disclosure & Credit Requirement */}
      {isNegotiation && (
        <section className="bg-stone-900/90 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Coins className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black uppercase text-white tracking-wider">
                    Private Negotiation Posting Fee
                  </h4>
                  {isDemoMode && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500 text-stone-950 tracking-wider">
                      DEMO MODE
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-amber-400 mt-0.5">
                  Posting this Private Negotiation listing costs 5 credits.
                </p>
              </div>
            </div>

            {/* Current Balance Display */}
            <div className="flex items-center gap-3 bg-stone-950/80 border border-stone-800 rounded-2xl px-4 py-3 shrink-0">
              <div className="text-right">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block">
                  Your Balance
                </span>
                <div className="flex items-baseline gap-1.5 justify-end">
                  <span className="text-xl font-black text-white font-mono">{creditsBalance ?? 0}</span>
                  <span className="text-[11px] font-black text-amber-400 uppercase">
                    {isDemoMode ? 'DEMO CREDITS' : 'CREDITS'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Balance Status Banner */}
          {(creditsBalance ?? 0) < 5 ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-rose-400">
                <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                <div>
                  <p className="text-xs font-black uppercase text-rose-400 tracking-wider">
                    Not enough credits. You need 5 credits to post this listing.
                  </p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Your current balance is {creditsBalance ?? 0} {isDemoMode ? 'DEMO credits' : 'credits'}. Please recharge your balance to complete posting.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={openPurchase}
                className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                RECHARGE CREDITS
              </button>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                You have sufficient credits. Exactly <strong>5 credits</strong> will be deducted upon posting. Remaining balance after posting: <strong>{(creditsBalance ?? 0) - 5} {isDemoMode ? 'DEMO credits' : 'credits'}</strong>.
              </span>
            </div>
          )}
        </section>
      )}

      {/* Errors Display */}
      {errors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 space-y-2"
        >
          <div className="flex items-center gap-2 text-rose-500 mb-2">
            <ShieldAlert className="w-5 h-5" />
            <h4 className="text-sm font-black uppercase italic">Deployment Intercepted</h4>
          </div>
          {errors.map((err, i) => (
            <p key={i} className="text-xs font-medium text-rose-400 flex items-center gap-2">
              <span className="w-1 h-1 bg-rose-500 rounded-full" />
              {err.message}
            </p>
          ))}
        </motion.div>
      )}

      {/* Submit Action */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-8 border-t border-stone-800">
        <div className="flex items-start gap-3 max-w-md">
          <Info className="w-5 h-5 text-stone-400 shrink-0 mt-1" />
          <p className="text-xs font-medium text-stone-400 leading-relaxed uppercase tracking-wider">
            {isNegotiation
              ? "By deploying this unit to Private Negotiations, you agree to respond to strategic offers in good faith. 5 credits will be charged upon deployment."
              : "By deploying this unit to the Arena, you agree to fulfill all auction obligations. Shill bidding or tactical withdrawal after reserve is met is strictly prohibited."}
          </p>
        </div>

        <div className="flex flex-col gap-4 w-full md:w-auto">
          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 justify-end">
            {isNegotiation ? (
              <ArenaButton 
                type="button" 
                onClick={() => {
                  if (!loginEmail) {
                    navigate('/profile');
                    return;
                  }
                  if ((creditsBalance ?? 0) < 5) {
                    openPurchase();
                    return;
                  }
                  handleDeployWithMode('now');
                }}
                isLoading={loading}
                disabled={loading || !loginEmail || (creditsBalance ?? 0) < 5}
                className="w-full sm:w-80"
              >
                {!loginEmail
                  ? "Login Email Required to Post"
                  : (creditsBalance ?? 0) < 5 
                    ? "Insufficient Credits (5 Required)" 
                    : "Deploy Asset for Negotiation (5 Credits)"}
              </ArenaButton>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleDeployWithMode('now')}
                  className="px-5 py-4 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all shadow-lg shadow-rose-900/20 flex items-center justify-center gap-2"
                >
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  Post and Go Live
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleDeployWithMode('later')}
                  className="px-5 py-4 bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 disabled:opacity-50 font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all flex items-center justify-center gap-2"
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  Go Live Later
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleDeployWithMode('boosters')}
                  className="px-5 py-4 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white disabled:opacity-50 font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all shadow-lg shadow-amber-950/20 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0" />
                  Go Live Later with Boosters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
};
