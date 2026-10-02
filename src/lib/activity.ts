import { doc, updateDoc, increment, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export enum ActivityType {
  VIEW = 'views',
  SAVE = 'saves',
  SHARE = 'shares'
}

const SCORE_WEIGHTS = {
  views: 1,
  saves: 5,
  shares: 10
};

export async function trackActivity(listingId: string, ownerId: string, type: ActivityType) {
  if (!listingId || !ownerId) return;

  try {
    const listingRef = doc(db, 'listings', listingId);
    const sellerRef = doc(db, 'users', ownerId);

    // 1. Update Listing stats
    await updateDoc(listingRef, {
      [type]: increment(1),
      updatedAt: serverTimestamp()
    });

    // 2. Update Seller stats and score
    const sellerSnap = await getDoc(sellerRef);
    if (sellerSnap.exists()) {
      const sellerData = sellerSnap.data();
      const currentScore = sellerData.sellerScore || 0;
      const weight = SCORE_WEIGHTS[type];
      
      const updateData: any = {
        [`total${type.charAt(0).toUpperCase() + type.slice(1)}`]: increment(1),
        sellerScore: increment(weight),
        updatedAt: serverTimestamp()
      };

      // Also update trustRanking based on overall performance (normalized score)
      // For now trustRanking = sellerScore / 100
      const newScore = currentScore + weight;
      updateData.trustRanking = Math.floor(newScore / 10); // Simple ranking logic

      await updateDoc(sellerRef, updateData);
    }
  } catch (error) {
    console.warn("Activity tracking failed:", error);
  }
}
