import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Flame, Trophy, History, LayoutGrid, User, Activity } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { ArenaErrorBoundary } from './shared/ArenaErrorBoundary';
import { cn } from '../../../lib/utils';

interface ArenaLayoutProps {
  children: React.ReactNode;
}

export const ArenaLayout: React.FC<ArenaLayoutProps> & { Divider: React.FC<{ className?: string }> } = ({ children }) => {
  return (
    <div className="min-h-screen bg-stone-950 text-white font-sans selection:bg-rose-500 selection:text-white">
      {/* Premium Header Decoration */}
      <div className="h-1 bg-gradient-to-r from-rose-600 via-amber-500 to-rose-600" />
      
      {/* Sidebar / Navigation */}
      <div className="max-w-[1440px] mx-auto px-2 md:px-6 pt-6 md:pt-10">
        <ArenaErrorBoundary>
          <motion.main
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="pb-10 md:pb-20"
          >
            {children}
          </motion.main>
        </ArenaErrorBoundary>
      </div>
    </div>
  );
};

ArenaLayout.Divider = ({ className }) => (
  <div className={cn("h-px w-full bg-white/5", className)} />
);

