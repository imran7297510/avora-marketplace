import React from 'react';

interface SharedCardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const SharedCardHeader: React.FC<SharedCardHeaderProps> = ({
  title,
  subtitle,
  icon,
  rightElement,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-850 pb-3" id="shared-card-header">
      <div className="flex items-center gap-2">
        {icon && <div className="text-amber-500">{icon}</div>}
        <div>
          <h4 className="text-xs font-black uppercase text-stone-200 tracking-wider">
            {title}
          </h4>
          {subtitle && (
            <p className="text-xs text-stone-400 font-medium mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {rightElement && <div className="flex items-center gap-2">{rightElement}</div>}
    </div>
  );
};
