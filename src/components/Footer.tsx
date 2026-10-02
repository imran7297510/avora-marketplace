import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Facebook, 
  Twitter, 
  Instagram, 
  ArrowUp, 
  ShieldCheck,
  MessageCircle,
  HelpCircle,
  FileText,
  Lock as LockIcon,
  Info,
  AlertTriangle
} from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { userProfile } = useAuth();
  const isKycApproved = userProfile?.kycStatus === 'APPROVED';

  return (
    <footer className="bg-stone-950 text-white pt-6 pb-20 md:py-8 border-t border-stone-900 relative overflow-hidden">
      {/* Subtle top border line decoration */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-stone-800 to-transparent" />
      
      <div className="max-w-[1440px] mx-auto px-4 lg:px-8">
        
        {/* Mobile Minimal Layout: Super elegant, horizontal flow, minimal vertical sprawl */}
        <div className="block md:hidden space-y-4">
          <div className="flex items-center justify-between">
            <Link to="/">
              <img src="/logo.png" alt="Avora" className="h-5 w-auto brightness-0 invert opacity-40 hover:opacity-100 transition-opacity" />
            </Link>
            <div className="flex items-center gap-1.5">
              {[Facebook, Twitter, Instagram].map((Icon, i) => (
                <a key={i} href="#" className="p-1.5 bg-stone-900 rounded-lg text-stone-400 hover:bg-amber-500 hover:text-stone-900 transition-all">
                  <Icon className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold uppercase tracking-widest text-stone-400 border-t border-stone-900/60 pt-3">
            {!isKycApproved && (
              <Link to="/profile?tab=kyc" className="text-amber-500 hover:text-amber-400 transition-colors">KYC Verification</Link>
            )}
            <Link to="/about" className="hover:text-amber-500 transition-colors">About</Link>
            <Link to="/verified" className="hover:text-amber-500 transition-colors">Verified</Link>
            <Link to="/support" className="hover:text-amber-500 transition-colors">Support</Link>
            <Link to="/faqs" className="hover:text-amber-500 transition-colors">FAQs</Link>
            <Link to="/terms" className="hover:text-amber-500 transition-colors">Terms</Link>
            <Link to="/privacy" className="hover:text-amber-500 transition-colors">Privacy</Link>
            <Link to="/disclaimer" className="text-stone-500 hover:text-amber-400 transition-colors">Disclaimer</Link>
          </div>

          <div className="flex items-center justify-between border-t border-stone-900/40 pt-3">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-stone-600">
              &copy; {currentYear} Avora • Secure Trade
            </p>
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} 
              className="p-1.5 bg-stone-900 rounded-lg text-stone-600 hover:text-white transition-colors"
              aria-label="Scroll to top"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Desktop Sophisticated Layout */}
        <div className="hidden md:grid md:grid-cols-4 gap-6 py-4">
          {/* Brand Column */}
          <div className="space-y-3">
             <Link to="/">
                <img src="/logo.png" alt="Avora" className="h-5.5 w-auto brightness-0 invert opacity-50 hover:opacity-100 transition-opacity" />
             </Link>
             <p className="text-xs text-stone-400 font-bold uppercase tracking-widest leading-relaxed max-w-[200px]">
               Pakistan's premium community marketplace for secure trade.
             </p>
             <div className="flex items-center gap-1.5">
               {[Facebook, Twitter, Instagram].map((Icon, i) => (
                 <a key={i} href="#" className="p-1.5 bg-stone-900 rounded-lg text-stone-400 hover:bg-amber-500 hover:text-stone-900 transition-all">
                   <Icon className="w-3 h-3" />
                 </a>
               ))}
             </div>
          </div>

          {/* Navigation Column 1 */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-stone-600">Market</h4>
            <ul className="space-y-1.5">
              {!isKycApproved && (
                <li>
                  <Link to="/profile?tab=kyc" className="flex items-center gap-2 text-stone-400 hover:text-amber-500 transition-colors group">
                    <ShieldCheck className="w-3 h-3 group-hover:rotate-6 transition-transform text-amber-500" />
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-500">KYC Verification</span>
                  </Link>
                </li>
              )}
              <li>
                <Link to="/verified" className="flex items-center gap-2 text-stone-400 hover:text-amber-500 transition-colors group">
                  <ShieldCheck className="w-3 h-3 group-hover:rotate-6 transition-transform" />
                  <span className="text-xs font-bold uppercase tracking-widest">Verified Sellers</span>
                </Link>
              </li>
              <li>
                <Link to="/messages" className="flex items-center gap-2 text-stone-400 hover:text-amber-500 transition-colors group">
                  <MessageCircle className="w-3 h-3 group-hover:rotate-6 transition-transform" />
                  <span className="text-xs font-bold uppercase tracking-widest">Chats</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Navigation Column 2 */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-stone-600">Legals</h4>
            <ul className="space-y-1.5">
              <li>
                <Link to="/terms" className="flex items-center gap-2 text-stone-400 hover:text-amber-500 transition-colors group">
                  <FileText className="w-3 h-3 group-hover:rotate-6 transition-transform" />
                  <span className="text-xs font-bold uppercase tracking-widest">Terms of Service</span>
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="flex items-center gap-2 text-stone-400 hover:text-amber-500 transition-colors group">
                  <LockIcon className="w-3 h-3 group-hover:rotate-6 transition-transform" />
                  <span className="text-xs font-bold uppercase tracking-widest">Privacy Policy</span>
                </Link>
              </li>
              <li>
                <Link to="/disclaimer" className="flex items-center gap-2 text-stone-400 hover:text-amber-500 transition-colors group text-amber-500/90 font-extrabold">
                  <AlertTriangle className="w-3 h-3 group-hover:rotate-6 transition-transform text-amber-500" />
                  <span className="text-xs font-[900] uppercase tracking-widest">Platform Disclaimer</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Navigation Column 3: Help & Company */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-stone-600">Company</h4>
            <ul className="space-y-1.5">
              <li>
                <Link to="/about" className="flex items-center gap-2 text-stone-400 hover:text-amber-500 transition-colors group">
                  <Info className="w-3 h-3 group-hover:rotate-6 transition-transform" />
                  <span className="text-xs font-bold uppercase tracking-widest">About Us</span>
                </Link>
              </li>
              <li>
                <Link to="/support" className="flex items-center gap-2 text-stone-400 hover:text-amber-500 transition-colors group">
                  <MessageCircle className="w-3 h-3 group-hover:rotate-6 transition-transform" />
                  <span className="text-xs font-bold uppercase tracking-widest">Support</span>
                </Link>
              </li>
              <li>
                <Link to="/faqs" className="flex items-center gap-2 text-stone-400 hover:text-amber-500 transition-colors group">
                  <HelpCircle className="w-3 h-3 group-hover:rotate-6 transition-transform" />
                  <span className="text-xs font-bold uppercase tracking-widest">FAQs</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Desktop Footer Bottom */}
        <div className="hidden md:flex pt-4 border-t border-stone-900 mt-4 items-center justify-between">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-stone-700">
            &copy; {currentYear} Avora • Secure Trade
          </p>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="p-1.5 bg-stone-900 rounded-lg text-stone-700 hover:text-white transition-colors group">
            <ArrowUp className="w-3 h-3 group-hover:-translate-y-0.5 transition-transform" />
          </button>
        </div>

      </div>
    </footer>
  );
}
