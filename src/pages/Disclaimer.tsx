import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, ShieldAlert, CheckCircle, HelpCircle } from 'lucide-react';

export function Disclaimer() {
  return (
    <div className="min-h-screen bg-stone-50 py-16 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-12 md:p-16 shadow-xl shadow-stone-200 border border-stone-100"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="p-4 bg-red-500 rounded-2xl shrink-0">
              <ShieldAlert className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-stone-900 italic tracking-tighter uppercase leading-none">Platform Disclaimer</h1>
              <p className="text-stone-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs mt-1">Please read carefully before using Avora</p>
            </div>
          </div>

          <div className="prose prose-stone max-w-none space-y-10">
            <div className="bg-amber-50 border border-amber-200 p-5 sm:p-6 rounded-2xl flex gap-3.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-amber-900 leading-none">Important Warning</h4>
                <p className="text-xs text-amber-800 font-medium mt-1 leading-relaxed">
                  Avora does not act as an escrow agent, broker, or transaction guarantor. Users operate on a peer-to-peer level entirely at their own risk.
                </p>
              </div>
            </div>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-red-500" /> 1. Peer-to-Peer Classified Marketplace Role
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                Avora provides a technology framework for hosting open public advertisements and direct buyer-seller communications across Pakistan. We are not a direct party to, nor do we facilitate or participate in, any physical purchase, trade, delivery, or sale of products, property, vehicles, clothing, services, or livestock. All agreements, payments, and handovers take place offline outside the scope of our software.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-red-500" /> 2. Verification Badges & Profile Identity Limits
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                The presence of any verification, premium, featured, or boosted seller checkmarks indicates that the user has successfully submitted documentation (such as National Identity Card, verified phone, or business verification) matching their declared profile details under our platform's review system. 
              </p>
              <p className="text-stone-600 text-sm leading-relaxed font-medium bg-stone-50 p-4 rounded-xl border border-stone-150">
                ⚠️ <strong>Important Note:</strong> A verified seller status does not constitute a guarantee of the quality, safety, health (in the case of animals), legality, or physical condition of any products they advertise. It is solely an identity validation mechanism to prevent spoofing. Buyers are urged to perform rigorous physical inspections.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-red-500" /> 3. Zero Liability for Financial or Physical Loss
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                Under no circumstances shall Avora, its parent companies, contributors, administrators, or partners be liable for any direct, indirect, incidental, consequential, or punitive damages. This includes, but is not limited to:
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 list-none p-0">
                {[
                  "Financial scams, fraud, or electronic transfer losses.",
                  "Misrepresented listing conditions or quality issues.",
                  "Livestock health problems or post-handover veterinary issues.",
                  "Any physical safety incidents arising from offline meetups."
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 bg-stone-50 p-3 rounded-xl border border-stone-100">
                    <CheckCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-xs font-bold text-stone-700">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-red-500" /> 4. Battle Bids Arena & Negotiation Warning
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                Bids placed inside the Battle Bids Arena or offers agreed upon in the Negotiation engine represent public or private intentions to trade. While Avora enforces internal guidelines, community penalties, and account suspensions for system manipulation, we cannot legally enforce the fulfillment of those offline transactions. Users are responsible for exercising due diligence prior to establishing physical meetups.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-red-500" /> 5. Right to Terminate Content without Refund
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                We reserve the absolute right to modify, suspend, or permanently remove any listing, account, or promotion that violates our platform rules, guidelines, or community trust. If a listing is removed due to violations or policy breaches, any fees paid for promoting, featuring, or premium checkmarks are non-refundable.
              </p>
            </section>
          </div>

          <div className="mt-16 pt-8 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest text-center sm:text-left">
              © 2026 Avora • All Rights Reserved
            </p>
            <div className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-widest">Procedural Risk Protocol</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

