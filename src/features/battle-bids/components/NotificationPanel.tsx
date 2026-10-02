import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, CheckCheck, Trash2, X, BellOff } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationItem } from './NotificationItem';
import { cn } from '../../../lib/utils';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose }) => {
  const { 
    notifications, 
    unreadCount, 
    loading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification, 
    clearRead 
  } = useNotifications();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-stone-950/90"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-[101] w-full max-w-md bg-stone-950 border-l border-white/5 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-8 border-b border-white/5 bg-gradient-to-br from-stone-900/50 to-transparent">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Bell className="w-6 h-6 text-rose-500" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">Combat Briefing</h3>
                    <p className="text-xs font-black text-stone-400 uppercase tracking-widest">
                      {unreadCount} Unread Transmissions
                    </p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-3 bg-stone-900 rounded-2xl text-stone-400 hover:text-white transition-all hover:bg-stone-800"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={markAllAsRead}
                  disabled={unreadCount === 0}
                  className="flex-1 py-3 px-4 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed border border-white/5 rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                  <CheckCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-black uppercase text-stone-400 tracking-widest">Mark All Read</span>
                </button>
                <button 
                  onClick={clearRead}
                  className="flex-1 py-3 px-4 bg-stone-900 hover:bg-rose-600/10 hover:border-rose-500/30 border border-white/5 rounded-xl flex items-center justify-center gap-2 transition-all group"
                >
                  <Trash2 className="w-4 h-4 text-stone-400 group-hover:text-rose-500" />
                  <span className="text-xs font-black uppercase text-stone-400 group-hover:text-rose-500 tracking-widest">Clear Records</span>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-none">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <div className="w-8 h-8 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
                  <span className="text-xs font-black text-stone-600 uppercase tracking-widest">Intercepting Signal...</span>
                </div>
              ) : notifications.length > 0 ? (
                <div>
                  {notifications.map((n) => (
                    <NotificationItem 
                      key={n.id} 
                      notification={n} 
                      onRead={markAsRead}
                      onDelete={deleteNotification}
                      onClose={onClose}
                    />
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-20 h-20 bg-stone-900 rounded-[2rem] flex items-center justify-center text-stone-700 mb-6 border border-white/5">
                    <BellOff className="w-10 h-10" />
                  </div>
                  <h4 className="text-sm font-black text-white uppercase tracking-widest mb-2">Silence in the Arena</h4>
                  <p className="text-xs text-stone-400 leading-relaxed font-medium">
                    No tactical updates at this time. Stay vigilant, warrior.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-white/5 bg-stone-950">
              <button 
                onClick={onClose}
                className="w-full py-5 bg-rose-600 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-xl shadow-rose-600/20 active:scale-95 transition-all"
              >
                Dismiss Intelligence
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
