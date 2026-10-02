import React from 'react';
import { motion } from 'motion/react';
import { FileText, Shield, CheckCircle, Scale, AlertOctagon, HelpCircle } from 'lucide-react';

export default function Terms() {
  return (
    <div className="min-h-screen bg-stone-50 py-16 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-12 md:p-16 shadow-xl shadow-stone-200 border border-stone-100"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="p-4 bg-amber-500 rounded-2xl shrink-0">
              <FileText className="w-8 h-8 text-stone-900" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-stone-900 italic tracking-tighter uppercase leading-none">Terms & Conditions</h1>
              <p className="text-stone-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs mt-1">Last Updated: July 2026</p>
            </div>
          </div>

          <div className="prose prose-stone max-w-none space-y-12">
            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-amber-500" /> 1. Acceptance & Eligibility
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                By creating an account, registering listings, uploading documentation, or placing bids in the Battle Bids Arena, you represent that you are at least 18 years of age and hold the complete legal authority to sell or bid on listed items within the territory of the Islamic Republic of Pakistan. If you do not agree to these terms, you must immediately cease accessing Avora.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-amber-500" /> 2. Listing and Representation Policies
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                Sellers are solely responsible for ensuring that all listed goods, services, electronics, vehicles, property, or livestock comply with local agricultural and trade regulations. 
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {[
                  "All prices must be listed in Pakistani Rupees (PKR).",
                  "Product media must depict the actual physical item.",
                  "Livestock condition/health must be reported honestly.",
                  "Sold items must be marked as 'Sold Out' immediately."
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-stone-50 p-4 rounded-xl border border-stone-100">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-stone-700">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-amber-500" /> 3. KYC Verification and Profile Locks
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                To combat listing spoofing and ensure community integrity, we provide a voluntary KYC Identity Verification workflow. Under this system:
              </p>
              <ul className="list-disc pl-5 text-stone-600 text-sm space-y-2 font-medium">
                <li>Users must submit clear, high-resolution photographs of their government-issued National Identity Card along with a real-time face selfie.</li>
                <li>Once the Admin moderates and approves your KYC details, your profile's legal name, phone number, and city are immediately <strong>LOCKED</strong>. This prevents bad actors from changing their verified identities after passing the check.</li>
                <li>Should you require a profile update, you must wait for your active verification badge to expire, or file a manual appeal to the support team for document re-verification.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-amber-500" /> 4. Battle Bids Arena & Negotiation Regulations
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                The Battle Bids Arena is a dynamic, live-bidding interface designed to foster robust, competitive, and honest trade values.
              </p>
              <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-200/60 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <Scale className="w-4 h-4 text-amber-600" /> Auction Arena Rules of Engagement
                </h4>
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  1. 🚫 <strong>Sill Bidding & Manipulation:</strong> Users are strictly forbidden from bid-rigging or using secondary accounts to manipulate bidding prices.
                </p>
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  2. ⏱️ <strong>Dynamic Extension:</strong> Placing bids in the final minutes of an auction triggers automatic anti-sniping dynamic time extensions.
                </p>
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  3. ⚖️ <strong>Arbitration:</strong> Any disputes concerning the winner's offline refusal to trade or seller's refusal to honor a bid can be flagged for automated admin arbitration, leading to potential account suspension and blacklist scoring.
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-amber-500" /> 5. Prohibited Conduct and Moderation Actions
              </h2>
              <div className="bg-red-50 p-6 rounded-2xl border border-red-150 space-y-3">
                <p className="text-red-900 text-xs sm:text-sm font-black uppercase tracking-wide flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 text-red-600" /> Prohibited Activities Notice
                </p>
                <p className="text-red-800 text-xs leading-relaxed font-semibold">
                  Avora retains full authority to remove, flag, or permanently suspend any profile or listing without warning for any of the following:
                </p>
                <ul className="text-red-700 text-[11px] sm:text-xs font-black uppercase tracking-wider space-y-1.5 list-disc pl-5">
                  <li>Listing illegal, stolen, counterfeit, or protected items.</li>
                  <li>Harassment, threats, or hate speech within in-app messages or comments.</li>
                  <li>Inaccurate contact numbers or fake physical location coordinates.</li>
                  <li>Unauthorized scraping, API testing, or platform reverse-engineering.</li>
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-amber-500" /> 6. Premium Badging and Payments
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                We offer optional paid promotion tiers: Verified (Blue), Featured (Gold), and Boosted Ads (VIP Zap). Payments are final, and because digital visual promotion begins immediately, we maintain a strict <strong>NO-REFUND policy</strong> if you choose to take down your ad, mark it as Sold Out, or if your account is terminated due to policy violations.
              </p>
            </section>
          </div>

          <div className="mt-16 pt-8 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest text-center sm:text-left">
              © 2026 Avora • Secure Community Marketplace
            </p>
            <div className="flex items-center gap-2 text-emerald-600">
              <Shield className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-widest">Compliant Policy</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
