import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, ChevronDown, Check, Search, X } from 'lucide-react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { LOCATIONS } from '../constants';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface LocationSelectorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export function LocationSelector({ value, onChange, placeholder = "Search or type city...", className }: LocationSelectorProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [customCities, setCustomCities] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync state with parent value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Click outside controller
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch dynamic/custom cities from Firestore
  useEffect(() => {
    const fetchCustomCities = async () => {
      try {
        const q = query(collection(db, 'cities'), limit(150));
        const querySnapshot = await getDocs(q);
        const citiesList: string[] = [];
        querySnapshot.forEach((doc) => {
          const name = doc.data().name;
          if (name && typeof name === 'string') {
            citiesList.push(name.trim());
          }
        });
        setCustomCities(citiesList);
      } catch (err) {
        console.warn("Error fetching custom cities:", err);
      }
    };
    
    fetchCustomCities();
  }, []);

  // Combine standard and custom cities uniquely
  const allLocations = useMemo(() => {
    const set = new Set<string>();
    LOCATIONS.forEach(loc => set.add(loc));
    customCities.forEach(loc => {
      const hasMatch = Array.from(set).some(item => item.toLowerCase() === loc.toLowerCase());
      if (!hasMatch) {
        set.add(loc);
      }
    });
    return Array.from(set);
  }, [customCities]);

  // Filter locations based on input
  const filteredSuggestions = useMemo(() => {
    const queryStr = inputValue.toLowerCase().trim();
    if (!queryStr) return allLocations;
    
    return allLocations.filter(loc => 
      loc.toLowerCase().includes(queryStr)
    );
  }, [inputValue, allLocations]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const itemsCount = filteredSuggestions.length + (inputValue && !allLocations.some(l => l.toLowerCase() === inputValue.toLowerCase()) ? 1 : 0);
      if (itemsCount === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev < itemsCount - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : itemsCount - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        
        const hasCustomOption = inputValue && !allLocations.some(l => l.toLowerCase() === inputValue.toLowerCase());
        
        if (activeIndex >= 0) {
          if (hasCustomOption && activeIndex === filteredSuggestions.length) {
            handleSelect(inputValue);
          } else if (filteredSuggestions[activeIndex]) {
            handleSelect(filteredSuggestions[activeIndex]);
          }
        } else {
          handleSelect(inputValue);
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredSuggestions, activeIndex, inputValue, allLocations]);

  const handleSelect = (cityName: string) => {
    let finalVal = cityName;
    if (cityName.toLowerCase() === 'all pakistan') {
      finalVal = '';
    }
    setInputValue(cityName);
    onChange(finalVal);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val);
    setIsOpen(true);
    setActiveIndex(-1);
  };

  const isCustomTyped = useMemo(() => {
    if (!inputValue) return false;
    return !allLocations.some(loc => loc.toLowerCase() === inputValue.toLowerCase());
  }, [inputValue, allLocations]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative group">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full bg-stone-50 border border-stone-200 outline-none rounded-xl py-3 pl-10 pr-10 text-xs md:text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all shadow-sm"
        />
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-amber-500 transition-colors pointer-events-none">
          <MapPin className="w-4 h-4" />
        </div>
        
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {inputValue && (
            <button 
              type="button"
              onClick={() => {
                setInputValue('');
                onChange('');
                setIsOpen(true);
                inputRef.current?.focus();
              }}
              className="p-1 rounded-full text-stone-400 hover:bg-stone-200/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsOpen(prev => !prev);
              inputRef.current?.focus();
            }}
            className="p-1 rounded-full text-stone-400 hover:text-stone-950 transition-colors"
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isOpen && "rotate-180")} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 3 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-stone-100 shadow-[0_20px_50px_rgba(0,0,0,0.12)] z-[100] overflow-hidden"
          >
            <div className="p-3 border-b border-stone-50 bg-stone-50/50 flex items-center justify-between">
              <span className="text-xs font-black uppercase text-stone-400 tracking-wider flex items-center gap-1">
                <Search className="w-3 h-3" /> Select or search city
              </span>
              <span className="text-xs font-bold text-stone-300 uppercase tracking-tighter">
                {filteredSuggestions.length} found
              </span>
            </div>

            <div className="max-h-[220px] overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-stone-200 scrollbar-track-transparent">
              {filteredSuggestions.map((loc, index) => {
                const isSelected = loc.toLowerCase() === value.toLowerCase() || (loc === 'All Pakistan' && !value);
                const isActive = activeIndex === index;
                
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => handleSelect(loc)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-2.5 text-left text-xs font-bold transition-colors",
                      isActive ? "bg-stone-100 text-stone-900" : "text-stone-600 hover:bg-stone-50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className={cn("w-3.5 h-3.5", isSelected ? "text-amber-500" : "text-stone-400")} />
                      <span>{loc}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-500" />}
                  </button>
                );
              })}

              {/* Typed custom option if it's not in our explicit suggestions */}
              {isCustomTyped && (
                <button
                  type="button"
                  onClick={() => handleSelect(inputValue)}
                  onMouseEnter={() => setActiveIndex(filteredSuggestions.length)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-2.5 text-left text-xs font-bold border-t border-stone-100 transition-colors",
                    activeIndex === filteredSuggestions.length ? "bg-stone-100 text-stone-900" : "bg-amber-50/40 text-amber-900 hover:bg-stone-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-amber-500" />
                    <span>Use typed: <strong className="text-amber-600">"{inputValue}"</strong></span>
                  </div>
                  <Check className="w-3.5 h-3.5 text-amber-500" />
                </button>
              )}

              {filteredSuggestions.length === 0 && !isCustomTyped && (
                <div className="p-4 text-center text-xs text-stone-400 font-medium">
                  Type a city name to search
                </div>
              )}
            </div>
            
            <div className="p-2 border-t border-stone-50 bg-stone-50/50 flex justify-between items-center text-xs text-stone-400 font-black uppercase tracking-widest px-4">
              <span>Type city name freely</span>
              <span>All Pakistan</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
