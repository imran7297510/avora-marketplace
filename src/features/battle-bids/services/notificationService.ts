import { 
  collection, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Timestamp,
  addDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../../lib/firebase';
import { ArenaNotification, NotificationType } from '../types';
import { parseSafeDate } from '../utils/arena';

export const NotificationService = {
  /**
   * Subscribes to user's notifications.
   */
  subscribeToNotifications(userId: string, callback: (notifications: ArenaNotification[]) => void) {
    const q = query(
      collection(db, 'users', userId, 'notifications'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    
    return onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: parseSafeDate(doc.data().timestamp)
      })) as ArenaNotification[];
      callback(notifications);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'notifications');
    });
  },

  /**
   * Marks a single notification as read.
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    try {
      const docRef = doc(db, 'users', userId, 'notifications', notificationId);
      await updateDoc(docRef, { isRead: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
    }
  },

  /**
   * Marks all notifications as read for a user.
   */
  async markAllAsRead(userId: string, notificationIds: string[]): Promise<void> {
    try {
      const batch = writeBatch(db);
      notificationIds.forEach(id => {
        const docRef = doc(db, 'users', userId, 'notifications', id);
        batch.update(docRef, { isRead: true });
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications/all');
    }
  },

  /**
   * Deletes a notification.
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    try {
      const docRef = doc(db, 'users', userId, 'notifications', notificationId);
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notifications/${notificationId}`);
    }
  },

  /**
   * Clears all read notifications.
   */
  async clearReadNotifications(userId: string, readIds: string[]): Promise<void> {
    try {
      const batch = writeBatch(db);
      readIds.forEach(id => {
        const docRef = doc(db, 'users', userId, 'notifications', id);
        batch.delete(docRef);
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'notifications/read');
    }
  },

  /**
   * Internal method to create a notification (usually called by backend/triggers).
   */
  async createNotification(
    userId: string, 
    payload: { 
      type: NotificationType; 
      title: string; 
      message: string; 
      link?: string;
      auctionId?: string;
    }
  ): Promise<void> {
    try {
      const colRef = collection(db, 'users', userId, 'notifications');
      await addDoc(colRef, {
        ...payload,
        userId,
        isRead: false,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notifications');
    }
  }
};
