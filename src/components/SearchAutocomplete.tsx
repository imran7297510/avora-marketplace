import React, { useState, useEffect, useRef } from 'react';
import { SearchSuggestion, getSuggestions } from '../services/searchService';
import { motion, AnimatePresence } from 'motion/react';
import { Search, TrendingUp, Tag, ShieldCheck, Smartphone, Car, Package, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { debounce } from 'lodash';

interface SearchAutocompleteProps {
  query: string;
  onSelect: (suggestion: SearchSuggestion) => void;
  onClose: () => void;
}

export function SearchAutocomplete({ query, onSelect, onClose }: SearchAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSuggestions = debounce((q: string) => {
      const results = getSuggestions(q);
      setSuggestions(results);
    }, 150);

    fetchSuggestions(query);
    return () => fetchSuggestions.cancel();
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        onSelect(suggestions[activeIndex]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [suggestions, activeIndex, onSelect, onClose]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'category': return <Tag className="w-3.5 h-3.5 text-blue-500" />;
      case 'subcategory': return <Tag className="w-3.5 h-3.5 text-emerald-500" />;
      case 'brand': return <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />;
      case 'trending': return <TrendingUp className="w-3.5 h-3.5 text-stone-400" />;
      default: return <Search className="w-3.5 h-3.5 text-stone-300" />;
    }
  };

  if (suggestions.length === 0 && query.length < 2) return null;

  return (
    <div 
      ref={containerRef}
      className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-stone-100 z-[120] overflow-hidden"
    >
      <div className="p-4 border-b border-stone-50">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest">Suggestions</h3>
          <span className="text-xs font-bold text-stone-300 uppercase tracking-tighter">Use arrows to navigate</span>
        </div>
      </div>
      
      <div className="max-h-[400px] overflow-y-auto py-2">
        {suggestions.length > 0 ? (
          suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              onClick={() => onSelect(suggestion)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                "w-full flex items-center gap-4 px-5 py-3.5 transition-all text-left group",
                activeIndex === index ? "bg-stone-50" : "hover:bg-stone-50"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                activeIndex === index ? "bg-white shadow-sm" : "bg-stone-100/50"
              )}>
                {getIcon(suggestion.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                   <p className={cn(
                     "text-sm font-bold truncate transition-colors",
                     activeIndex === index ? "text-stone-900" : "text-stone-600"
                   )}>
                     {suggestion.text}
                   </p>
                   {suggestion.type === 'brand' && (
                     <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 text-xs font-black uppercase tracking-tighter rounded">Brand</span>
                   )}
                </div>
                {suggestion.category && (
                  <p className="text-xs text-stone-400 font-medium uppercase tracking-tighter">
                    in {suggestion.category}
                  </p>
                )}
              </div>
              <ArrowRight className={cn(
                "w-4 h-4 text-stone-200 transition-all",
                activeIndex === index ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"
              )} />
            </button>
          ))
        ) : (
          <div className="p-10 text-center">
            <Search className="w-8 h-8 text-stone-100 mx-auto mb-3" />
            <p className="text-xs font-black text-stone-300 uppercase tracking-widest">No results for "{query}"</p>
          </div>
        )}
      </div>

      <div className="p-3 bg-stone-50 flex items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-white border border-stone-200 flex items-center justify-center text-xs font-bold text-stone-400 shadow-sm">↵</div>
          <span className="text-xs font-black text-stone-400 uppercase tracking-tighter">Select</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-white border border-stone-200 flex items-center justify-center text-xs font-bold text-stone-400 shadow-sm">Esc</div>
          <span className="text-xs font-black text-stone-400 uppercase tracking-tighter">Close</span>
        </div>
      </div>
    </div>
  );
}
