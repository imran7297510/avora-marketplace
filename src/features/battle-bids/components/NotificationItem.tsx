import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Trophy, 
  TrendingUp, 
  Clock, 
  MessageSquare, 
  ShieldCheck, 
  AlertTriangle,
  X,
  Circle
} from 'lucide-react';
import { ArenaNotification, NotificationType } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../../../lib/utils';

interface NotificationItemProps {
  notification: ArenaNotification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const ICONS: Record<NotificationType, any> = {
  auction_won: Trophy,
  auction_lost: X,
  outbid: TrendingUp,
  auction_ending: Clock,
  private_offer: MessageSquare,
  offer_accepted: ShieldCheck,
  kyc_approved: ShieldCheck,
  report_resolved: AlertTriangle,
  system: AlertTriangle
};

const COLORS: Record<NotificationType, string> = {
  auction_won: 'text-amber-500 bg-amber-500/10',
  auction_lost: 'text-stone-400 bg-stone-500/10',
  outbid: 'text-rose-500 bg-rose-500/10',
  auction_ending: 'text-rose-500 bg-rose-500/10',
  private_offer: 'text-blue-500 bg-blue-500/10',
  offer_accepted: 'text-emerald-500 bg-emerald-500/10',
  kyc_approved: 'text-emerald-500 bg-emerald-500/10',
  report_resolved: 'text-stone-400 bg-stone-500/10',
  system: 'text-rose-500 bg-rose-500/10'
};

export const NotificationItem: React.FC<NotificationItemProps> = ({ 
  notification, 
  onRead, 
  onDelete,
  onClose
}) => {
  const navigate = useNavigate();
  const Icon = ICONS[notification.type] || Circle;

  const handleClick = () => {
    onRead(notification.id);
    if (notification.link) {
      navigate(notification.link);
      onClose();
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={cn(
        "group relative p-6 cursor-pointer transition-all border-b border-white/5",
        notification.isRead ? "bg-transparent opacity-60" : "bg-stone-900/30"
      )}
    >
      <div className="flex gap-4">
        <div className={cn("flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110", COLORS[notification.type])}>
          <Icon className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1">
            <h4 className="text-xs font-black text-white uppercase tracking-wider truncate">
              {notification.title}
            </h4>
            <span className="text-xs font-bold text-stone-400 whitespace-nowrap ml-4">
              {notification.timestamp && !isNaN(notification.timestamp.getTime()) 
                ? formatDistanceToNow(notification.timestamp, { addSuffix: true }) 
                : 'Pending'}
            </span>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed line-clamp-2 mb-3">
            {notification.message}
          </p>
          
          <div className="flex items-center gap-4">
            {!notification.isRead && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                <span className="text-xs font-black uppercase text-rose-500 tracking-widest">Urgent</span>
              </div>
            )}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete(notification.id);
              }}
              className="text-xs font-black uppercase text-stone-600 hover:text-rose-500 tracking-widest transition-colors opacity-0 group-hover:opacity-100"
            >
              Exterminate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
