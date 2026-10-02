import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs, 
  onSnapshot,
  serverTimestamp,
  increment,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import { WatchlistItem } from '../types';

export const WatchlistService = {
  /**
   * Toggles an auction in the user's watchlist.
   */
  async toggleWatch(userId: string, auctionId: string, isWatching: boolean): Promise<void> {
    try {
      const batch = writeBatch(db);
      const watchRef = doc(db, 'users', userId, 'watchlist', auctionId);
      const auctionRef = doc(db, 'arena_auctions', auctionId);

      if (!isWatching) {
        batch.set(watchRef, {
          userId,
          auctionId,
          addedAt: serverTimestamp()
        });
        batch.update(auctionRef, { watchersCount: increment(1) });
      } else {
        batch.delete(watchRef);
        batch.update(auctionRef, { watchersCount: increment(-1) });
      }

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `watchlist/${auctionId}`);
      throw err;
    }
  },

  /**
   * Subscribes to user's watchlist.
   */
  subscribeToWatchlist(userId: string, callback: (watchlist: string[]) => void) {
    const q = query(collection(db, 'users', userId, 'watchlist'));
    return onSnapshot(q, (snapshot) => {
      const auctionIds = snapshot.docs.map(doc => doc.data().auctionId as string);
      callback(auctionIds);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'watchlist');
    });
  },

  /**
   * Fetches full watchlist items for a user.
   */
  async getWatchlist(userId: string): Promise<string[]> {
    try {
      const q = query(collection(db, 'users', userId, 'watchlist'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data().auctionId as string);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'watchlist');
      return [];
    }
  }
};
