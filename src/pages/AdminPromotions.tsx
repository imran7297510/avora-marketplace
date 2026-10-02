import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Listing, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatPKR } from '../lib/utils';
import { CheckCircle, XCircle, Clock, ExternalLink, ShieldCheck, BadgeCheck, PhoneIcon } from 'lucide-react';

export function AdminPromotions() {
  const { isAdmin } = useAuth();
  const [pendingListings, setPendingListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    try {
      const q = query(
        collection(db, 'listings'),
        where('promotionStatus', '==', 'PENDING')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Listing));
      setPendingListings(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (listing: Listing, action: 'APPROVE' | 'REJECT') => {
    if (!window.confirm(`Are you sure you want to ${action.toLowerCase()} this promotion?`)) return;
    setActioning(listing.id);
    try {
      const listingRef = doc(db, 'listings', listing.id);
      
      const now = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);

      const updateData: any = {
        updatedAt: serverTimestamp()
      };

      if (action === 'APPROVE') {
        updateData.promotionStatus = 'APPROVED';
        if (listing.promotionType === 'FEATURED') {
          updateData.isFeatured = true;
          updateData.featuredUntil = expiryDate;
        }
        if (listing.promotionType === 'BOOSTED') {
          updateData.isBoosted = true;
          updateData.boostedUntil = expiryDate;
        }
      } else {
        const hasOtherActiveBadge = (listing.promotionType === 'FEATURED' && listing.isBoosted && listing.boostedUntil && (
          typeof listing.boostedUntil.toDate === 'function' ? listing.boostedUntil.toDate() > now :
          new Date(listing.boostedUntil.seconds ? listing.boostedUntil.seconds * 1000 : listing.boostedUntil) > now
        )) || (listing.promotionType === 'BOOSTED' && listing.isFeatured && listing.featuredUntil && (
          typeof listing.featuredUntil.toDate === 'function' ? listing.featuredUntil.toDate() > now :
          new Date(listing.featuredUntil.seconds ? listing.featuredUntil.seconds * 1000 : listing.featuredUntil) > now
        ));
        updateData.promotionStatus = hasOtherActiveBadge ? 'APPROVED' : 'REJECTED';
      }

      await updateDoc(listingRef, updateData);

      // Notify User
      const notificationRef = doc(collection(db, 'notifications'));
      await setDoc(notificationRef, {
        userId: listing.ownerId,
        title: action === 'APPROVE' ? 'Promotion Approved!' : 'Promotion Rejected',
        message: action === 'APPROVE' 
          ? `Your ${listing.promotionType} promotion for "${listing.title}" is now active!`
          : `Your promotion request for "${listing.title}" was rejected. Please contact support.`,
        type: 'PROMOTION_STATUS',
        relatedId: listing.id,
        read: false,
        createdAt: serverTimestamp()
      });

      setPendingListings(prev => prev.filter(l => l.id !== listing.id));
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `listings/${listing.id}`);
    } finally {
      setActioning(null);
    }
  };

  if (!isAdmin) {
    return <div className="py-20 text-center text-red-500 font-bold">Access Denied. Admin only.</div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-stone-900 italic uppercase">Promotions Review</h1>
          <p className="text-stone-400">Approve or reject paid promotion requests</p>
        </div>
        <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-full font-bold flex items-center gap-2 border border-amber-200">
           <Clock className="w-5 h-5" /> {pendingListings.length} Pending
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-stone-400">Loading requests...</div>
      ) : pendingListings.length === 0 ? (
        <div className="bg-white border rounded-2xl p-12 text-center shadow-sm">
           <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8" />
           </div>
           <h2 className="text-xl font-bold text-stone-900 mb-2">No Pending Requests</h2>
           <p className="text-stone-400">All promotion requests have been processed.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {pendingListings.map(listing => (
            <div key={listing.id} className="bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col md:flex-row border-stone-200">
               <div className="w-full md:w-48 aspect-square bg-stone-100 shrink-0">
                 {listing.images && listing.images[0] && (
                   <img src={listing.images[0]} alt="" className="w-full h-full object-cover" />
                 )}
               </div>
               
               <div className="p-6 flex-grow flex flex-col md:flex-row gap-6">
                  <div className="flex-grow">
                    <div className="flex items-center gap-2 mb-1">
                       <span className={`text-xs font-black px-2 py-0.5 rounded text-white uppercase tracking-wider ${listing.promotionType === 'FEATURED' ? 'bg-amber-500' : 'bg-blue-500'}`}>
                          {listing.promotionType}
                       </span>
                       <span className="text-xs text-stone-400 font-medium">#{listing.id.substring(0,8)}</span>
                    </div>
                    <h3 className="text-xl font-bold text-stone-900 mb-2">{listing.title}</h3>
                    <p className="text-amber-600 font-extrabold text-lg mb-4">{formatPKR(listing.price)}</p>
                    
                    <div className="flex flex-wrap gap-4 text-sm text-stone-400 border-t pt-4">
                       <div>
                         <span className="block text-xs font-bold text-stone-400 uppercase">Seller</span>
                         <span className="font-semibold text-stone-800">{listing.sellerName}</span>
                       </div>
                       <div>
                         <span className="block text-xs font-bold text-stone-400 uppercase">Phone</span>
                         <span className="font-semibold text-stone-800">{listing.phoneNumber}</span>
                       </div>
                    </div>
                  </div>

                  <div className="w-full md:w-64 space-y-4">
                    <div>
                      <span className="block text-xs font-bold text-stone-400 uppercase mb-2">Payment Proof</span>
                      {listing.promotionProofImage ? (
                        <a href={listing.promotionProofImage} target="_blank" rel="noopener noreferrer" className="relative block aspect-video rounded-lg overflow-hidden border border-stone-200 group">
                          <img src={listing.promotionProofImage} alt="Payment Proof" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <ExternalLink className="w-6 h-6 text-white" />
                          </div>
                        </a>
                      ) : (
                        <div className="bg-stone-50 border rounded-lg p-4 text-center text-xs text-stone-400 italic">No proof image provided</div>
                      )}
                    </div>

                    <div className="flex gap-2">
                       <button 
                         onClick={() => handleAction(listing, 'REJECT')}
                         disabled={actioning === listing.id}
                         className="flex-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                       >
                         <XCircle className="w-4 h-4" /> Reject
                       </button>
                       <button 
                         onClick={() => handleAction(listing, 'APPROVE')}
                         disabled={actioning === listing.id}
                         className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2"
                       >
                         <CheckCircle className="w-4 h-4" /> Approve
                       </button>
                    </div>
                  </div>
               </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
