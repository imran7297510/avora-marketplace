import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ArenaNotification } from '../types';
import { NotificationService } from '../services/notificationService';

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<ArenaNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const unsubscribe = NotificationService.subscribeToNotifications(user.uid, (data) => {
      setNotifications(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const unreadCount = useMemo(() => 
    notifications.filter(n => !n.isRead).length, 
  [notifications]);

  const markAsRead = useCallback(async (id: string) => {
    if (!user) return;
    await NotificationService.markAsRead(user.uid, id);
  }, [user]);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id);
    if (unreadIds.length === 0) return;
    await NotificationService.markAllAsRead(user.uid, unreadIds);
  }, [user, notifications]);

  const deleteNotification = useCallback(async (id: string) => {
    if (!user) return;
    await NotificationService.deleteNotification(user.uid, id);
  }, [user]);

  const clearRead = useCallback(async () => {
    if (!user) return;
    const readIds = notifications.filter(n => n.isRead).map(n => n.id);
    if (readIds.length === 0) return;
    await NotificationService.clearReadNotifications(user.uid, readIds);
  }, [user, notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearRead
  };
}
