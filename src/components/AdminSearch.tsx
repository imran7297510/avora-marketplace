import { useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Search, Loader2, User, Package, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Listing, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface AdminSearchProps {
  onView: (id: string, type: 'account' | 'listing') => void;
}

export function AdminSearch({ onView }: AdminSearchProps) {
  const { user, userProfile } = useAuth();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logAdminSearch = async (keyword: string, hits: number) => {
    try {
      await setDoc(doc(collection(db, 'adminLogs')), {
        adminId: user?.uid,
        adminEmail: user?.email,
        adminCode: userProfile?.adminCode || null,
        action: 'SEARCH',
        keyword,
        hits,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to log search action", e);
    }
  };

  const handleSearch = async () => {
    const term = keyword.trim();
    if (!term) return;
    
    setLoading(true);
    setResults([]);
    setSearched(true);
    setError(null);

    let hits = 0;
    const combinedResults: any[] = [];

    try {
      // 1. Check if it's an email search
      if (term.includes('@')) {
        const lowerSearch = term.toLowerCase().trim();
        const qEmail1 = query(collection(db, 'users'), where('email', '==', lowerSearch));
        const qEmail2 = query(collection(db, 'users'), where('email', '==', term.trim()));
        
        const [snapEmail1, snapEmail2] = await Promise.all([getDocs(qEmail1), getDocs(qEmail2)]);
        const userMap = new Map();
        snapEmail1.docs.forEach(d => userMap.set(d.id, { ...d.data(), id: d.id, _type: 'account' }));
        snapEmail2.docs.forEach(d => userMap.set(d.id, { ...d.data(), id: d.id, _type: 'account' }));
        
        const users = Array.from(userMap.values());
        combinedResults.push(...users);
        
        for (const u of users) {
          try {
            const qListings = query(collection(db, 'listings'), where('ownerId', '==', u.id));
            const snapListings = await getDocs(qListings);
            const userListings = snapListings.docs.map(d => ({ ...d.data(), id: d.id, _type: 'listing' }));
            combinedResults.push(...userListings);
          } catch(e) { console.error("Error fetching listings for user", e); }
        }
      } else {
        // 2. Otherwise assume it's a Listing URL or ID
        let listingId = term;
        try {
           if (term.includes('/')) {
             const parts = term.split('/');
             const potentialId = parts[parts.length - 1] || parts[parts.length - 2]; 
             if (potentialId) {
               listingId = potentialId.split('?')[0].split('#')[0];
             }
           }
        } catch(e) { console.error(e) }

        if (listingId) {
          const listingDoc = await getDoc(doc(db, 'listings', listingId));
          if (listingDoc.exists()) {
            combinedResults.push({ ...listingDoc.data(), id: listingDoc.id, _type: 'listing' });
          }
        }
      }

      setResults(combinedResults);
      hits = combinedResults.length;
      
      if (combinedResults.length === 0) {
        setError("No user found with that email, or no listing found for that link.");
      }

      await logAdminSearch(term, hits);
    } catch (e) {
      console.error("Search failed", e);
      setError("An error occurred during search.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-100 shadow-sm overflow-hidden flex flex-col max-h-[85vh]">
       <div className="p-4 md:p-8 bg-stone-50 border-b border-stone-100">
         <h2 className="text-xl md:text-2xl font-black text-stone-900 uppercase italic tracking-tighter mb-4 md:mb-6">Admin Search Console</h2>
         
         <div className="flex flex-col md:flex-row gap-3">
           <div className="relative flex-grow">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
             <input 
               type="text" 
               value={keyword}
               onChange={(e) => setKeyword(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
               placeholder="Enter user email or paste listing link..."
               className="w-full pl-12 pr-4 py-3.5 md:py-4 bg-white border border-stone-200 rounded-2xl font-bold text-stone-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm md:text-base"
             />
           </div>
           <button 
             onClick={handleSearch}
             disabled={loading || !keyword.trim()}
             className="w-full md:w-auto px-8 py-3.5 md:py-4 bg-amber-500 text-stone-900 rounded-2xl font-black uppercase italic tracking-widest text-sm flex items-center justify-center gap-2 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
           >
             {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
           </button>
         </div>
       </div>

       <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white min-h-[300px]">
         <AnimatePresence mode="popLayout">
           {loading && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-center items-center py-20">
               <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
             </motion.div>
           )}

           {!loading && searched && error && (
             <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3 font-bold text-sm">
               <AlertCircle className="w-5 h-5 flex-shrink-0" />
               <p>{error}</p>
             </motion.div>
           )}

           {!loading && searched && !error && results.length === 0 && (
             <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-10 md:py-20">
               <Search className="w-12 h-12 md:w-16 md:h-16 text-stone-200 mx-auto mb-4" />
               <h3 className="text-lg md:text-xl font-black text-stone-400 uppercase tracking-tight">No Results Found</h3>
               <p className="text-stone-400 font-medium mt-2 text-xs md:text-sm">Please check the email or link and try again.</p>
             </motion.div>
           )}

           {!loading && results.length > 0 && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
               <div className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4">
                 Found {results.length} result{results.length !== 1 ? 's' : ''}
               </div>
               
               <div className="grid grid-cols-1 gap-4">
                 {results.map((item, i) => (
                   <motion.div 
                     key={item.id} 
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: i * 0.05 }}
                     className="p-4 md:p-6 border border-stone-100 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-amber-400 hover:shadow-md transition-all group bg-stone-50/50"
                   >
                     {item._type === 'account' ? (
                        <div className="flex items-center gap-3 md:gap-4">
                          <img src={item.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${item.name || item.email}`} alt="Avatar" className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-stone-200 bg-white flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-stone-900 group-hover:text-amber-600 transition-colors truncate">{item.name || 'Unnamed User'}</p>
                            <p className="text-xs md:text-xs font-mono text-stone-400 truncate">{item.email}</p>
                            <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mt-1">
                               <span className={`text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${item.isBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                 {item.isBlocked ? 'Blocked' : 'Active'}
                               </span>
                               {item.isVerified && <span className="text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Verified</span>}
                            </div>
                          </div>
                        </div>
                     ) : (
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-stone-200 flex-shrink-0 overflow-hidden border border-stone-200">
                             {item.images && item.images.length > 0 ? (
                               <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                             ) : (
                               <div className="w-full h-full flex items-center justify-center text-stone-400 bg-stone-100"><Package className="w-5 h-5 md:w-6 md:h-6" /></div>
                             )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-stone-900 group-hover:text-amber-600 transition-colors line-clamp-1">{item.title}</p>
                            <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mt-1">
                               <span className={`text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${item.status === 'LIVE' ? 'bg-emerald-100 text-emerald-700' : item.status === 'SOLD' ? 'bg-amber-100 text-amber-700' : 'bg-stone-200 text-stone-700'}`}>
                                 {item.status}
                               </span>
                               <span className="text-xs md:text-xs font-black uppercase tracking-widest font-mono text-stone-400 truncate max-w-[100px] md:max-w-none">ID: {item.id}</span>
                            </div>
                          </div>
                        </div>
                     )}

                     <button 
                       onClick={() => onView(item.id, item._type)}
                       className="w-full md:w-auto px-6 py-2.5 bg-white border border-stone-200 text-stone-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-stone-900 hover:text-white transition-colors whitespace-nowrap text-center"
                     >
                       Open {item._type === 'account' ? 'Account' : 'Listing'}
                     </button>
                   </motion.div>
                 ))}
               </div>
             </motion.div>
           )}
         </AnimatePresence>
       </div>
    </div>
  );
}

