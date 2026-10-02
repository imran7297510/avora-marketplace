import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, History } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { DiscoveryService } from '../../services/discoveryService';
import { motion, AnimatePresence } from 'motion/react';

interface ArenaSearchBarProps {
  onSearch: (query: string) => void;
  initialValue?: string;
  placeholder?: string;
}

export const ArenaSearchBar: React.FC<ArenaSearchBarProps> = ({ onSearch, initialValue = '', placeholder = 'Search for assets, sellers, or brands...' }) => {
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 500);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debouncedQuery.trim()) {
      onSearch(debouncedQuery);
    } else if (isFocused) {
      onSearch('');
    }
  }, [debouncedQuery]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.length > 2) {
        setLoading(true);
        const data = await DiscoveryService.getSuggestions('title', query);
        setSuggestions(data);
        setLoading(false);
      } else {
        setSuggestions([]);
      }
    };
    fetchSuggestions();
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    onSearch('');
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto z-50">
      <div className={`group relative flex items-center bg-stone-900 border transition-all duration-500 rounded-[2rem] px-6 py-4 ${
        isFocused ? 'border-rose-500 shadow-lg shadow-rose-600/20 bg-stone-950' : 'border-white/5 hover:border-white/10'
      }`}>
        <Search className={`w-5 h-5 transition-colors duration-300 ${isFocused ? 'text-rose-500' : 'text-stone-400'}`} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-white font-medium px-4 placeholder:text-stone-600 text-sm"
        />
        {loading ? (
          <Loader2 className="w-4 h-4 text-stone-400 animate-spin" />
        ) : query ? (
          <button onClick={handleClear} className="p-1 hover:bg-stone-800 rounded-full transition-colors">
            <X className="w-4 h-4 text-stone-400 hover:text-white" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-stone-700 bg-stone-800 px-2 py-1 rounded-lg uppercase tracking-widest hidden sm:block">
              CMD+K
            </span>
          </div>
        )}
      </div>

      {/* Autocomplete Suggestions */}
      <AnimatePresence>
        {isFocused && (query.length > 2 || suggestions.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full left-0 right-0 mt-3 bg-stone-950 border border-stone-800 rounded-3xl overflow-hidden shadow-2xl z-50"
          >
            <div className="p-4 border-b border-white/5">
              <span className="text-xs font-black text-stone-400 uppercase tracking-widest">Live Suggestions</span>
            </div>
            {suggestions.length > 0 ? (
              <div className="p-2">
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setQuery(suggestion);
                      setIsFocused(false);
                      onSearch(suggestion);
                    }}
                    className="w-full text-left p-4 hover:bg-stone-800 rounded-2xl flex items-center gap-4 transition-all group"
                  >
                    <div className="p-2 bg-stone-950 rounded-xl group-hover:bg-rose-600 transition-colors">
                      <History className="w-4 h-4 text-stone-600 group-hover:text-white" />
                    </div>
                    <span className="text-sm font-bold text-stone-300 group-hover:text-white">{suggestion}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <Search className="w-8 h-8 text-stone-800 mx-auto mb-3" />
                <p className="text-xs font-bold text-stone-600 uppercase tracking-widest">Searching Arena Records...</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
