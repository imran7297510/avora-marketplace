import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Gavel, User, History, Settings, AlertTriangle, ShieldAlert, Swords } from 'lucide-react';
import { cn } from '../../../lib/utils';

import { ArenaBackButton } from './shared/ArenaBackButton';
import { MyProfileSection } from './shared/MyProfileSection';
import { ThreeDButton } from '../../../components/ThreeDButton';

interface TacticalHeaderProps {
  negotiation: any;
  isAdmin: boolean;
  handleViewTimeline: () => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (val: boolean) => void;
  soundAlertsEnabled: boolean;
  setSoundAlertsEnabled: (val: boolean) => void;
  onBack?: () => void;
  hideProfileAndSettings?: boolean;
  hideEnterArenaButton?: boolean;
}

export const TacticalHeader: React.FC<TacticalHeaderProps> = ({
  negotiation,
  isAdmin,
  handleViewTimeline,
  notificationsEnabled,
  setNotificationsEnabled,
  soundAlertsEnabled,
  setSoundAlertsEnabled,
  onBack,
  hideProfileAndSettings = false,
  hideEnterArenaButton = false,
}) => {
  const navigate = useNavigate();
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  const status = negotiation?.status;
  const isClosed = status === 'completed' || status === 'declined' || status === 'cancelled' || status === 'withdrawn' || status === 'expired';
  
  // Notification settings are only relevant if the negotiation is active (not closed/completed)
  const showNotifications = !isClosed;
  
  // Report is relevant in active or completed states, but NOT when declined, withdrawn, cancelled, or expired
  const showReport = status !== 'declined' && status !== 'withdrawn' && status !== 'cancelled' && status !== 'expired';
  
  const showOptionsDropdown = showNotifications || showReport || isAdmin;

  return (
    <div className="bg-stone-900/60 backdrop-blur-xl border border-white/5 rounded-[2rem] p-3 sm:p-4 mb-8 flex flex-wrap items-center justify-between gap-4 sticky top-4 z-40 shadow-2xl">
      {/* Left Side: Back and Brand */}
      <div className="flex items-center gap-3">
        <ArenaBackButton onClick={onBack} fallbackPath="/negotiations" />
        {!hideEnterArenaButton && (
          <ThreeDButton 
            to="/battle-bids"
            label="Enter Battle Bids Arena"
            icon={Swords}
            variant="dark"
            size="sm"
            fullWidth={false}
            className="text-[11px] sm:text-xs"
          />
        )}
        
        <div className="h-6 w-px bg-white/5 hidden sm:block" />
        
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            <h2 className="text-sm font-black text-white uppercase tracking-wider italic truncate">NEG-OPS-INTEL</h2>
          </div>
          <p className="text-[9px] text-stone-500 font-mono uppercase tracking-widest hidden sm:block">CHANNEL SECURED VIA END-TO-END ESCROW</p>
        </div>
      </div>

      {/* Right Side: Quick Action Bar */}
      <div className="flex items-center gap-4">
        {!hideProfileAndSettings && <MyProfileSection />}
        {/* More Options Dropdown */}
        {showOptionsDropdown && !hideProfileAndSettings && (
          <div className="relative">
            <button 
              onClick={() => setShowMoreOptions(!showMoreOptions)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-black uppercase transition-all shadow-inner",
                showMoreOptions 
                  ? "bg-amber-500 text-stone-955 border-amber-500" 
                  : "bg-stone-955 border-white/5 text-stone-400 hover:text-white hover:border-amber-500/30"
              )}
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Options</span>
            </button>
            
            {/* Dropdown Overlay */}
            {showMoreOptions && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreOptions(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-stone-900 border border-white/10 rounded-2xl p-2.5 z-50 shadow-2xl animate-fade-in space-y-1">
                  <div className="px-3 py-1.5 border-b border-white/5 mb-1">
                    <p className="text-[9px] font-black uppercase text-stone-500 tracking-wider">Channel Protocols</p>
                  </div>
                  
                  {/* Notification Toggle */}
                  {showNotifications && (
                    <>
                      <button
                        onClick={() => {
                          const updated = !notificationsEnabled;
                          setNotificationsEnabled(updated);
                          localStorage.setItem('arena_notifications_enabled', String(updated));
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 rounded-xl text-xs font-black uppercase text-left transition-colors"
                      >
                        <span className="text-stone-300">Push Sync Alerts</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider",
                          notificationsEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                        )}>
                          {notificationsEnabled ? 'ON' : 'OFF'}
                        </span>
                      </button>

                      {/* Sound Alerts Toggle */}
                      <button
                        onClick={() => {
                          const updated = !soundAlertsEnabled;
                          setSoundAlertsEnabled(updated);
                          localStorage.setItem('arena_sound_alerts_enabled', String(updated));
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 rounded-xl text-xs font-black uppercase text-left transition-colors"
                      >
                        <span className="text-stone-300">Auditory Cues</span>
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider",
                          soundAlertsEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                        )}>
                          {soundAlertsEnabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    </>
                  )}

                  {showNotifications && showReport && (
                    <div className="h-px bg-white/5 my-1" />
                  )}

                  {/* Programmatic Report */}
                  {showReport && (
                    <button
                      onClick={() => {
                        setShowMoreOptions(false);
                        const reportBtn = document.querySelector('[data-report-trigger="negotiation"]') as HTMLButtonElement;
                        reportBtn?.click();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-rose-500/10 text-rose-500 hover:text-rose-400 rounded-xl text-xs font-black uppercase text-left transition-colors"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      <span>Report Channel</span>
                    </button>
                  )}
                  
                  {/* Admin Shortcut if Admin */}
                  {isAdmin && (
                    <>
                      {(showNotifications || showReport) && <div className="h-px bg-white/5 my-1" />}
                      <button
                        onClick={() => {
                          setShowMoreOptions(false);
                          const el = document.getElementById('engagement-timeline-section');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-rose-500/10 text-rose-500 rounded-xl text-xs font-black uppercase text-left transition-colors"
                      >
                        <ShieldAlert className="w-4 h-4" />
                        <span>Audit Panel</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
