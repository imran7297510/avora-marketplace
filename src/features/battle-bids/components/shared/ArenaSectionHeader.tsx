import React from 'react';

interface ArenaSectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const ArenaSectionHeader: React.FC<ArenaSectionHeaderProps> = ({ title, subtitle, action }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
      <div className="space-y-1">
        <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">
          {title}
        </h2>
        {subtitle && (
          <p className="text-stone-400 text-xs font-medium uppercase tracking-widest">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};
