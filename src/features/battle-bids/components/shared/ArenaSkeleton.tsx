import React from 'react';

export const ArenaSkeleton = () => {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-stone-800" />
      <div className="p-5 space-y-4">
        <div className="h-6 bg-stone-800 rounded-md w-3/4" />
        <div className="h-4 bg-stone-800 rounded-md w-1/2" />
        <div className="flex justify-between border-y border-stone-800 py-3">
          <div className="h-8 bg-stone-800 rounded-md w-24" />
          <div className="h-8 bg-stone-800 rounded-md w-20" />
        </div>
        <div className="h-12 bg-stone-800 rounded-xl w-full" />
      </div>
    </div>
  );
};

export const ArenaGridSkeleton = ({ count = 6 }: { count?: number }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ArenaSkeleton key={i} />
      ))}
    </div>
  );
};
