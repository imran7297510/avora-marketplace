import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { FAQ } from '../types';
import { useAuth } from '../context/AuthContext';
import { ChevronDown, ChevronUp, Plus, Edit2, Trash2 } from 'lucide-react';

const DEFAULT_FAQS: Omit<FAQ, 'id' | 'updatedAt'>[] = [
  {
    question: "How do I buy or sell items on Avora?",
    answer: "To sell, simply click 'Sell Your Item' or 'Post Ad' in the header (Login/Register required). Provide detailed descriptions, select exact category matches (such as Livestock, Vehicles, Property, Electronics, or General Goods), choose your city, upload clear photographs, and set your price in PKR. To buy, browse our marketplace, search by keywords, filter by city or budget, and click 'Book Your Order' or 'Chat in App' to contact the seller directly. Since Avora is a peer-to-peer directory, all deals, physical evaluations, and payments are settled offline between users.",
    order: 1
  },
  {
    question: "What is the Verified & Premium Seller Badge program?",
    answer: "Our badge program confirms merchant identities to foster user safety. We offer three trust tiers:\n- 🛡️ Verified (Blue Badge): Awarded to standard users who submit valid phone and National Identity Card documentation.\n- ✨ Golden Seller Badge: Designed for regular dealers who maintain high ratings and responsive deal records.\n- 👑 Premium Seller (Crown Badge): Offers maximum trust visibility, prioritizes listings at the top of category searches, and provides 3x organic impressions.\nYou can apply for badges through the 'Badges' or 'KYC' tabs in your profile.",
    order: 2
  },
  {
    question: "How does National Identity Card KYC Identity Verification work?",
    answer: "To secure our community, we implement a manual KYC (Know Your Customer) system. You provide your legal name, National Identity Card number, and upload high-resolution photographs of your government-issued National Identity Card (Front and Back) alongside a face selfie. To ensure your documentation cannot be harvested or used elsewhere, our system automatically applies an indelible watermark reading 'FOR AVORA VERIFICATION ONLY' across your images. These files are securely encrypted and can only be matched by authorized platform administrators during the moderation cycle.",
    order: 3
  },
  {
    question: "Why can't I edit my profile name or phone number?",
    answer: "If you have passed KYC verification or hold an active trust badge (Verified, Golden, or Premium), your core identity details (Legal Name, Phone Number, and City) are locked. This prevents malicious individuals from verifying an account under a real identity and subsequently changing the profile information to deceive buyers. If you require a legitimate update due to moving cities or changing phone lines, you must contact our support center to submit a formal re-verification appeal.",
    order: 4
  },
  {
    question: "What is the Battle Bids Arena and how do I participate?",
    answer: "The Battle Bids Arena is a dynamic, live-auction bidding workspace where buyers compete in real time for premium listings or livestock. Sellers can create auctions with custom reserve prices and duration limits. Buyers enter bids in PKR. To prevent 'bid sniping' (placing a bid in the last second to win without competition), any bid placed within the final minutes automatically triggers an anti-sniping extension, adding extra minutes to the clock to allow other genuine buyers to counter-bid.",
    order: 5
  },
  {
    question: "What are the rules regarding live contract negotiations?",
    answer: "Our live Negotiation engine enables buyers and sellers to construct binding agreements. Either party can initiate a deal, specify item prices, logistics terms, and expected delivery dates. Bids and counter-offers are documented sequentially. Once both parties click 'Accept Terms', the contract is locked. While physical fulfillment remains offline, violating or refusing to honor a locked negotiation can result in public buyer/seller ratings drops, strike points, or permanent account blacklisting.",
    order: 6
  },
  {
    question: "Are there any listing commissions or hidden transaction fees?",
    answer: "Avora is proud to offer a 100% free organic classification tier. You can list standard ads, post messages, and communicate with buyers without any platform cuts, listing commissions, or booking fees. We only charge for optional value-added services, such as upgrading to premium seller badges, featuring ads on the homepage carousel, or purchasing VIP instant boosts to refresh your listing positions.",
    order: 7
  },
  {
    question: "What happens if my KYC or listing is rejected by administrators?",
    answer: "Our admin team manually reviews all KYC submissions and listing registrations to eliminate scam accounts, duplicate ads, or inappropriate media. Rejections occur due to blurred documentation, mismatching face selfies, fake mobile lines, or prohibited items. You will receive a clear notification explaining the rejection reason (e.g., 'Blurry document details'). You can edit your details and submit a fresh or corrected application under the same tracking number immediately.",
    order: 8
  },
  {
    question: "Can I permanently delete my account and purge my personal data?",
    answer: "Yes, we respect your right to privacy and the right to be forgotten. Under your profile settings panel, you can choose to permanently delete your account. This action instantly purges your active profile records, active listings, support ticket history, chat transcripts, and encrypted National Identity Card/selfie KYC verification uploads from our database. This action is irreversible.",
    order: 9
  },
  {
    question: "How do I file a dispute or contact support?",
    answer: "If you encounter a fraudulent listing, deal violation, or technical error, you can submit a support ticket via the 'Support' page in the application. Our administration team is active 24/7. Provide details, upload screenshots if applicable, and track your ticket's live status. Verified and Premium badge holders receive priority support response within 2 hours.",
    order: 10
  }
];

export function FAQs() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const { isAdmin } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<FAQ>>({});

  useEffect(() => {
    fetchFaqs();
  }, []);

  const fetchFaqs = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'faqs'), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        // Seed default faqs
        const seededFaqs: FAQ[] = [];
        for (const f of DEFAULT_FAQS) {
          const newDoc = doc(collection(db, 'faqs'));
          const item = { ...f, id: newDoc.id, updatedAt: serverTimestamp() };
          // Don't auto-seed in db to save writes, just use locally until admin saves
          seededFaqs.push(item as FAQ);
        }
        setFaqs(seededFaqs);
      } else {
        setFaqs(snap.docs.map(d => ({ ...d.data(), id: d.id } as FAQ)));
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'faqs');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      const isNew = !editForm.id;
      const docRef = isNew ? doc(collection(db, 'faqs')) : doc(db, 'faqs', editForm.id as string);
      
      await setDoc(docRef, {
        question: editForm.question,
        answer: editForm.answer,
        order: Number(editForm.order || 0),
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setIsEditing(false);
      setEditForm({});
      fetchFaqs();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'faqs');
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin || !confirm('Are you sure you want to delete this FAQ?')) return;
    try {
      await deleteDoc(doc(db, 'faqs', id));
      fetchFaqs();
    } catch (error) {
       handleFirestoreError(error, OperationType.DELETE, `faqs/${id}`);
    }
  };

  const toggleFaq = (id: string) => {
    setOpenFaq(openFaq === id ? null : id);
  };

  if (loading) return <div className="py-20 text-center text-stone-400">Loading FAQs...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 flex-1 relative">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-stone-900">Frequently Asked Questions</h1>
        {isAdmin && !isEditing && (
          <button 
            onClick={() => { setEditForm({ order: faqs.length + 1 }); setIsEditing(true); }}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-stone-900 px-4 py-2 rounded-md font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add FAQ
          </button>
        )}
      </div>

      {isEditing && isAdmin ? (
        <div className="bg-stone-50 border border-stone-200 p-6 rounded-xl shadow-sm mb-8">
           <h3 className="text-lg font-bold text-stone-900 mb-4">{editForm.id ? 'Edit FAQ' : 'New FAQ'}</h3>
           <form onSubmit={handleSave} className="space-y-4">
             <div>
               <label className="block text-sm font-medium text-stone-700 mb-1">Question</label>
               <input required type="text" value={editForm.question || ''} onChange={e => setEditForm({...editForm, question: e.target.value})} className="w-full p-2.5 border border-stone-300 rounded leading-5 bg-white focus:ring-amber-500 focus:border-amber-500" />
             </div>
             <div>
               <label className="block text-sm font-medium text-stone-700 mb-1">Answer (Markdown not supported yet)</label>
               <textarea required rows={4} value={editForm.answer || ''} onChange={e => setEditForm({...editForm, answer: e.target.value})} className="w-full p-2.5 border border-stone-300 rounded leading-5 bg-white focus:ring-amber-500 focus:border-amber-500"></textarea>
             </div>
             <div>
               <label className="block text-sm font-medium text-stone-700 mb-1">Display Order</label>
               <input required type="number" value={editForm.order || ''} onChange={e => setEditForm({...editForm, order: Number(e.target.value)})} className="w-32 p-2.5 border border-stone-300 rounded leading-5 bg-white focus:ring-amber-500 focus:border-amber-500" />
             </div>
             <div className="flex justify-end gap-3 pt-2 border-t border-stone-200">
               <button type="button" onClick={() => { setIsEditing(false); setEditForm({}); }} className="px-4 py-2 text-stone-600 font-bold hover:bg-stone-200 rounded transition-colors">Cancel</button>
               <button type="submit" className="px-4 py-2 bg-stone-900 text-white font-bold rounded shadow-sm hover:bg-stone-800 transition-colors">Save FAQ</button>
             </div>
           </form>
        </div>
      ) : null}

      <div className="space-y-3">
        {faqs.map((faq) => {
          const isOpen = openFaq === faq.id;
          return (
            <div key={faq.id} className="bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden transition-all duration-200">
              <div 
                className="w-full p-4 sm:p-6 text-left flex justify-between items-center cursor-pointer hover:bg-stone-50 select-none group"
                onClick={() => toggleFaq(faq.id)}
              >
                <h3 className="font-bold text-lg text-stone-900 pr-8">{faq.question}</h3>
                <div className="text-stone-400 group-hover:text-amber-500 transition-colors shrink-0">
                  {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </div>
              
              {isOpen && (
                <div className="px-4 sm:px-6 pb-6 pt-2 border-t border-stone-100 bg-stone-50/50">
                  <p className="text-stone-600 whitespace-pre-wrap leading-relaxed">{faq.answer}</p>
                  
                  {isAdmin && (
                    <div className="mt-4 pt-4 border-t border-stone-200 flex justify-end gap-2">
                       <button onClick={(e) => { e.stopPropagation(); setEditForm(faq); setIsEditing(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                          <Edit2 className="w-4 h-4" />
                       </button>
                       <button onClick={(e) => { e.stopPropagation(); handleDelete(faq.id); }} className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {faqs.length === 0 && !isEditing && (
           <div className="py-20 text-center text-stone-400">No FAQs available at the moment.</div>
        )}
      </div>
    </div>
  );
}
