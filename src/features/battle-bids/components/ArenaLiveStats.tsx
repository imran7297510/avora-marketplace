import React from 'react';
import { Activity, Gavel, Users, DollarSign } from 'lucide-react';
import { motion } from 'motion/react';

export const ArenaLiveStats: React.FC = () => {
  const stats = [
    { label: 'Live Battles', value: '12', icon: Gavel, color: 'text-rose-500' },
    { label: 'Active Bidders', value: '458', icon: Users, color: 'text-amber-500' },
    { label: 'Total Volume', value: 'PKR 85.2M', icon: DollarSign, color: 'text-emerald-500' },
    { label: 'Transactions', value: '24h/89', icon: Activity, color: 'text-blue-500' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="p-4 bg-stone-900 border border-stone-800 rounded-2xl flex flex-col items-center text-center group hover:border-stone-700 transition-all"
          >
            <div className={`p-2.5 rounded-xl bg-stone-950 border border-stone-800 group-hover:scale-110 transition-all mb-3 ${stat.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <span className="text-lg md:text-xl font-black text-white block font-mono tracking-tight">
                {stat.value}
              </span>
              <span className="text-xs font-black text-stone-400 uppercase tracking-widest">
                {stat.label}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
