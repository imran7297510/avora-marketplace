import React from 'react';
import { 
  ShieldCheck, 
  Users, 
  Eye, 
  Search, 
  TrendingUp, 
  CheckCircle, 
  Heart, 
  Globe, 
  Target,
  Sparkles,
  MessageCircle,
  Zap,
  BadgeCheck,
  Gift,
  ArrowRight,
  Award,
  Coins,
  ShieldAlert
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function WhyUs() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-16 flex-1 w-full animate-in fade-in duration-500">
      
      {/* Hero Section */}
      <div className="text-center mb-16">
        <span className="bg-amber-500/10 text-amber-600 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest inline-block mb-4">
          Discover Avora
        </span>
        <h1 className="text-4xl md:text-6xl font-extrabold text-stone-900 mb-6 tracking-tight uppercase italic font-spartan">
          Pakistan's Premium <span className="text-amber-500">Community</span> Marketplace
        </h1>
        <p className="text-base md:text-xl text-stone-600 max-w-3xl mx-auto leading-relaxed font-medium">
          Avora bridges traditional trust with digital efficiency, offering a safe, intuitive, any-device environment to list and trade everything from mobiles, bikes, cars, products, homes, land, clothing, and services.
        </p>
      </div>

      <div className="space-y-20">
        
        {/* Core Identity & Story */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-stone-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-amber-100 p-3 rounded-2xl">
                <Globe className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-stone-900 uppercase tracking-tighter italic">Our Digital Mandi Story</h2>
            </div>
            <p className="text-stone-600 leading-relaxed text-base md:text-lg mb-4">
              In Pakistan, the term <strong className="text-stone-900">“Mandi”</strong> represents more than simple transactions. It represents deep-rooted trust, hard-earned bargains, and personal connections. 
            </p>
            <p className="text-stone-600 leading-relaxed text-base md:text-lg">
              Our vision was to create a modern web experience representing the vibrant soul of Pakistani trade, while eliminating common market friction like physical travel, security risks, fraud, and unnecessary intermediaries.
            </p>
          </div>

          <div className="lg:col-span-5 bg-stone-900 text-white p-8 md:p-10 rounded-3xl shadow-xl relative overflow-hidden h-full flex flex-col justify-center">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-bl-full pointer-events-none" />
            <div className="relative z-10">
              <div className="bg-amber-500 text-stone-950 w-12 h-12 rounded-xl flex items-center justify-center mb-6">
                <Award className="w-6 h-6" />
              </div>
              <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter italic mb-4">Our Commitment</h3>
              <p className="text-stone-300 leading-relaxed text-sm mb-4">
                To serve both buyers and sellers with an ethical, fully-moderated hub that prioritizes transparency and real connections.
              </p>
              <div className="flex items-center gap-2 text-stone-400 text-xs font-bold font-mono">
                <span>⚡ VERIFIED USERS</span>
                <span>•</span>
                <span>🔒 SECURE LISTINGS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Services Grid */}
        <section className="bg-stone-50 border border-stone-200 p-8 md:p-12 rounded-[2.5rem]">
          <div className="text-center mb-12">
            <span className="text-xs uppercase font-black tracking-widest text-amber-600">Cutting Edge Features</span>
            <h2 className="text-3xl md:text-4xl font-black text-stone-900 uppercase tracking-tight italic mt-2">
              Our Professional Services & Modules
            </h2>
            <p className="text-stone-400 text-sm max-w-lg mx-auto mt-2">
              Bridging modern digital security with traditional trust across Pakistan.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Service 1 - Battle Bids Arena */}
            <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-stone-200/80 transition-all hover:scale-[1.02] duration-300 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mb-6 border border-red-100">
                  <Coins className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight mb-3">
                  Battle Bids Arena
                </h3>
                <p className="text-stone-400 text-sm leading-relaxed mb-4">
                  Experience Pakistan's first real-time bidding auction arena for livestock and premium goods. Built with professional anti-sniping dynamic time extensions, live leaders dashboards, and automated safety contract locks.
                </p>
              </div>
              <Link to="/battle-bids" className="text-xs font-black text-red-600 uppercase tracking-wider flex items-center gap-1 hover:text-red-700 transition-colors mt-4">
                Enter Bids Arena <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Service 2 - Contract Negotiation */}
            <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-stone-200/80 transition-all hover:scale-[1.02] duration-300 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-6 border border-amber-100">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight mb-3">
                  Live Contract Negotiation
                </h3>
                <p className="text-stone-400 text-sm leading-relaxed mb-4">
                  Forget loose, unverified agreements. Our sequential negotiation framework permits buyers and sellers to construct legally structured private agreements specifying exact PKR rates, delivery criteria, and timelines.
                </p>
              </div>
              <Link to="/negotiations" className="text-xs font-black text-amber-600 uppercase tracking-wider flex items-center gap-1 hover:text-amber-700 transition-colors mt-4">
                Explore Negotiations <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Service 3 - Secure KYC & Trust badges */}
            <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-stone-200/80 transition-all hover:scale-[1.02] duration-300 flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 border border-emerald-100">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight mb-3">
                  Watermarked KYC Locks
                </h3>
                <p className="text-stone-400 text-sm leading-relaxed mb-4">
                  Elevate your status to a Verified or Premium Seller. Submit government National Identity Card documents and face selfies securely. Our system automatically watermarks documents to preserve identity details and locks profiles upon approval to prevent spoofing.
                </p>
              </div>
              <Link to="/profile?tab=kyc" className="text-xs font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1 hover:text-emerald-700 transition-colors mt-4">
                Verify Your Identity <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* Current Exclusive Offers & Promos */}
        <section className="bg-gradient-to-br from-amber-500 to-amber-600 text-stone-950 p-8 md:p-12 rounded-[2.5rem] shadow-xl relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-stone-900/10 rounded-full blur-xl pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="max-w-2xl">
                <div className="bg-stone-950/20 text-stone-950 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest inline-flex items-center gap-1.5 mb-4 border border-stone-950/10">
                  <Gift className="w-3.5 h-3.5" /> Active Platform Offers
                </div>
                <h3 className="text-3xl md:text-5xl font-extrabold tracking-tighter uppercase italic leading-none font-spartan">
                  Start Selling for 100% Free
                </h3>
                <p className="text-sm md:text-base text-stone-900 font-semibold mt-4 leading-relaxed">
                  List your mobiles, bikes, cars, houses, land, clothing, or other items today. Benefit from absolute organic reach without any setup fees, hidden costs, or listing commission. You scale your trade; we provide the stage.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8 font-bold text-xs uppercase tracking-wider text-stone-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 fill-stone-950 text-amber-500 shrink-0" />
                    <span>Unlimited Organic Listings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 fill-stone-950 text-amber-500 shrink-0" />
                    <span>Free Live Chat & Lead Counter</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 fill-stone-950 text-amber-500 shrink-0" />
                    <span>Up to 10 Beautiful Image Uploads</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 fill-stone-950 text-amber-500 shrink-0" />
                    <span>24/7 Dispute & Assistance Line</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 shrink-0 w-full md:w-auto">
                <Link to="/submit" className="px-8 py-5 bg-stone-950 hover:bg-stone-900 text-white text-center font-black rounded-2xl transition-all shadow-xl uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:shadow-2xl">
                  Post Your Free Ad <ArrowRight className="w-4 h-4" />
                </Link>
                <span className="text-xs font-black uppercase tracking-widest text-center text-stone-900/60 font-mono">
                  No credit card required
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Platform Integrity & Trust Protocol */}
        <section>
          <div className="text-center mb-12">
            <span className="text-xs uppercase font-black tracking-widest text-stone-400">Trading Protocol</span>
            <h2 className="text-2xl md:text-3xl font-black text-stone-900 uppercase tracking-tight italic mt-2">
              Our 4 Pillars of Marketplace Safety
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-stone-200">
              <ShieldAlert className="w-10 h-10 text-red-500 mb-4" />
              <h4 className="text-lg font-black text-stone-900 uppercase mb-2">Zero Escrow</h4>
              <p className="text-stone-400 text-xs leading-relaxed">
                We do not hold or manage buyers' payments. Users interact, negotiate, inspect the items, and execute exchange independently.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-stone-200">
              <Eye className="w-10 h-10 text-blue-500 mb-4" />
              <h4 className="text-lg font-black text-stone-900 uppercase mb-2">Transparent Ads</h4>
              <p className="text-stone-400 text-xs leading-relaxed">
                Every ad features exact pricing (PKR), clear status indicators, and detailed profiles to ensure direct transparency.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-stone-200">
              <Users className="w-10 h-10 text-purple-500 mb-4" />
              <h4 className="text-lg font-black text-stone-900 uppercase mb-2">Community Flags</h4>
              <p className="text-stone-400 text-xs leading-relaxed">
                Reporting features exist across listings and profiles, enabling immediate attention and swift Admin moderation.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-stone-200">
              <Coins className="w-10 h-10 text-emerald-500 mb-4" />
              <h4 className="text-lg font-black text-stone-900 uppercase mb-2">Fair Pricing</h4>
              <p className="text-stone-400 text-xs leading-relaxed">
                By removing agents and brokerage friction, users set fair valuations directly based on market value and product condition.
              </p>
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section className="text-center pt-8 border-t border-stone-100">
          <h2 className="text-3xl font-extrabold text-stone-900 mb-4 uppercase tracking-tighter italic font-spartan">Join Our Journey</h2>
          <p className="text-stone-600 text-sm md:text-base mb-8 max-w-2xl mx-auto font-medium">
            Join thousands of traders, sellers, and buyers across Karachi, Lahore, Islamabad, Multan, and Peshawar today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
            <Link to="/listings" className="px-6 py-4 bg-stone-900 hover:bg-stone-850 text-white font-black rounded-xl text-xs uppercase tracking-widest transition-all w-full text-center">
              Browse Marketplace
            </Link>
            <Link to="/submit" className="px-6 py-4 bg-amber-500 hover:bg-amber-600 text-stone-950 font-black rounded-xl text-xs uppercase tracking-widest transition-all w-full text-center">
              Post New Listing
            </Link>
          </div>
        </section>
        
      </div>
    </div>
  );
}

