import React from 'react';
import { motion } from 'motion/react';
import { Shield, Lock, Eye, CheckCircle, Database, Trash2, EyeOff } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-stone-50 py-16 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-12 md:p-16 shadow-xl shadow-stone-200 border border-stone-100"
        >
          <div className="flex items-center gap-4 mb-8">
            <div className="p-4 bg-emerald-500 rounded-2xl shrink-0">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-stone-900 italic tracking-tighter uppercase leading-none">Privacy Policy</h1>
              <p className="text-stone-400 font-bold uppercase tracking-widest text-[10px] sm:text-xs mt-1">Your identity & trust are safe with us</p>
            </div>
          </div>

          <div className="prose prose-stone max-w-none space-y-12">
            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-emerald-500" /> 1. Commitment to Data Safety
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                At Avora, we recognize that trading agricultural goods, electronics, vehicles, and livestock requires transparency, but also demand strict privacy. We do not sell, rent, or trade your personal information to third-party brokers. We collect only what is strictly necessary to prevent spoofing, resolve buyer-seller disputes, and facilitate secure direct communications.
              </p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-12">
               {[
                 { icon: Eye, title: "Total Control", desc: "You decide what listings to publish and when to retire them." },
                 { icon: Lock, title: "Document Privacy", desc: "National Identity Card files are watermarked and restricted to authorized admins only." },
                 { icon: Database, title: "Encrypted Storage", desc: "All user records and verification documents are encrypted at rest." }
               ].map((box, i) => (
                 <div key={i} className="bg-stone-50 p-6 rounded-3xl border border-stone-100 flex flex-col items-center text-center">
                    <box.icon className="w-8 h-8 text-emerald-500 mb-4" />
                    <h3 className="font-black text-stone-900 uppercase text-xs tracking-widest mb-2">{box.title}</h3>
                    <p className="text-stone-400 text-xs font-semibold leading-relaxed">{box.desc}</p>
                 </div>
               ))}
             </div>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-emerald-500" /> 2. Data We Collect and Hold
              </h2>
              <div className="space-y-4">
                {[
                  "Account credentials (Name, email address, password hashes, and mobile number).",
                  "Classified listing metadata (pricing, category description, and public photos).",
                  "KYC identity documents (Government-issued National Identity Card photographs and front-facing selfies used purely for validation).",
                  "In-app Chat transcripts (Stored securely to permit dispute mediation and system spam detection)."
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3.5 p-4 bg-emerald-50/20 rounded-xl border border-emerald-100">
                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-xs font-bold text-stone-700 leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-emerald-500" /> 3. Advanced National Identity Card Watermarking System
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                To guarantee that your National Identity Card uploads are never misused or intercepted, our media processor automatically applies an indelible digital watermark saying <strong>"FOR AVORA VERIFICATION ONLY"</strong> directly across the center of all uploaded identity card images.
              </p>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                These files are stored in isolated Cloud Storage directories with strict rule permissions. Only our verified manual administration panel is granted access to inspect these files to match legal names and National Identity Card numbers during the KYC review.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-emerald-500" /> 4. Communication Log Auditing
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                Our in-app chat provides safe contact without exposing your phone number to prospective buyers or sellers. To maintain a civil and secure marketplace, chat logs may be automatically evaluated by spam filters or manually audited by admins in response to harassment flags, fraud reports, or contract violations inside the Battle Bids Arena.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-3 italic">
                <div className="w-2 h-7 bg-emerald-500" /> 5. Account Purging & Right to be Forgotten
              </h2>
              <p className="text-stone-600 text-sm leading-relaxed font-medium">
                We respect your absolute right to control your digital footprint. Under our platform features:
              </p>
              <div className="p-5 sm:p-6 bg-stone-50 border border-stone-200 rounded-2xl flex gap-3.5">
                <Trash2 className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider text-stone-900 leading-none">Instant Account Purge</h4>
                  <p className="text-xs text-stone-500 font-medium mt-1 leading-relaxed">
                    By accessing your profile settings, you can trigger a permanent account deletion. This immediately deletes your profile, active listings, support history, chat sessions, and watermarked KYC uploads from our active Cloud Firestore databases.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-16 pt-8 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs font-black text-stone-400 uppercase tracking-widest text-center sm:text-left">
              Secured by Avora Shield System
            </p>
            <div className="flex items-center gap-4">
              <span className="text-xs font-black uppercase text-emerald-500 tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">ISO 27001 Prepared</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
