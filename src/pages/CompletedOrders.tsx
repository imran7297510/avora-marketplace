import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Listing } from '../types';
import { ListingCard } from '../components/ListingCard';
import { useAuth } from '../context/AuthContext';
import { Trash2 } from 'lucide-react';

export function CompletedOrders() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAuth();

  useEffect(() => {
    async function fetchListings() {
      try {
        const q = query(
          collection(db, 'listings'),
          where('status', '==', 'SOLD'),
          orderBy('updatedAt', 'desc')
        );

        const snapshot = await getDocs(q);
        setListings(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Listing)));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'listings');
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, []);

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this listing from Sold Out?')) return;
    try {
      await deleteDoc(doc(db, 'listings', id));
      setListings(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-stone-900 mb-2">Sold out</h1>
      <p className="text-stone-400 mb-8">Treasures that have successfully found new owners.</p>
      
      {loading ? (
        <div className="py-20 text-center text-stone-400">Loading...</div>
      ) : listings.length === 0 ? (
        <div className="py-20 text-center text-stone-400">No sold out items to show yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 opacity-70">
          {listings.map(listing => (
            <div key={listing.id} className="relative group">
               <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                  <div className="bg-red-600 text-white font-bold tracking-widest px-4 py-2 border-2 border-red-600 transform -rotate-12 rounded backdrop-blur-sm">
                    SOLD
                  </div>
               </div>
               {isAdmin && (
                 <button 
                   onClick={() => handleRemove(listing.id!)}
                   className="absolute top-4 right-4 z-20 bg-white/90 text-red-500 p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                 >
                   <Trash2 className="w-5 h-5" />
                 </button>
               )}
               <ListingCard listing={listing} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
