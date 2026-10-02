import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationPanel } from './NotificationPanel';

export const ArenaNotificationShortcut: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount } = useNotifications();

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="p-3 bg-stone-900 border border-stone-800 rounded-xl text-stone-400 hover:text-rose-500 transition-all relative group"
      >
        <Bell className="w-4 h-4 group-hover:rotate-12 transition-transform" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 bg-rose-600 text-white text-xs font-black rounded-full border-2 border-stone-950 flex items-center justify-center px-1 shadow-lg shadow-rose-600/20">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationPanel 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </>
  );
};
