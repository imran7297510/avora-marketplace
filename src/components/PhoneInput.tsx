import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Check, ChevronDown, X } from 'lucide-react';
import { COUNTRIES } from '../constants';
import { COUNTRY_FLAGS, getCountryFlag } from './CountrySelector';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

// Complete mapping of countries in COUNTRIES list to their Dialing Codes
export const COUNTRY_DIAL_CODES: Record<string, string> = {
  "Afghanistan": "+93",
  "Albania": "+355",
  "Algeria": "+213",
  "Andorra": "+376",
  "Angola": "+244",
  "Antigua and Barbuda": "+1",
  "Argentina": "+54",
  "Armenia": "+374",
  "Australia": "+61",
  "Austria": "+43",
  "Azerbaijan": "+994",
  "Bahamas": "+1",
  "Bahrain": "+973",
  "Bangladesh": "+880",
  "Barbados": "+1",
  "Belarus": "+375",
  "Belgium": "+32",
  "Belize": "+501",
  "Benin": "+229",
  "Bhutan": "+975",
  "Bolivia": "+591",
  "Bosnia and Herzegovina": "+387",
  "Botswana": "+267",
  "Brazil": "+55",
  "Brunei": "+673",
  "Bulgaria": "+359",
  "Burkina Faso": "+226",
  "Burundi": "+257",
  "Cabo Verde": "+238",
  "Cambodia": "+855",
  "Cameroon": "+237",
  "Canada": "+1",
  "Central African Republic": "+236",
  "Chad": "+235",
  "Chile": "+56",
  "China": "+86",
  "Colombia": "+57",
  "Comoros": "+269",
  "Congo (Congo-Brazzaville)": "+242",
  "Congo (Democratic Republic of)": "+243",
  "Costa Rica": "+506",
  "Croatia": "+385",
  "Cuba": "+53",
  "Cyprus": "+357",
  "Czechia (Czech Republic)": "+420",
  "Denmark": "+45",
  "Djibouti": "+253",
  "Dominica": "+1",
  "Dominican Republic": "+1",
  "Ecuador": "+593",
  "Egypt": "+20",
  "El Salvador": "+503",
  "Equatorial Guinea": "+240",
  "Eritrea": "+291",
  "Estonia": "+372",
  "Eswatini": "+268",
  "Ethiopia": "+251",
  "Fiji": "+679",
  "Finland": "+358",
  "France": "+33",
  "Gabon": "+241",
  "Gambia": "+220",
  "Georgia": "+995",
  "Germany": "+49",
  "Ghana": "+233",
  "Greece": "+30",
  "Grenada": "+1",
  "Guatemala": "+502",
  "Guinea": "+224",
  "Guinea-Bissau": "+245",
  "Guyana": "+592",
  "Haiti": "+509",
  "Honduras": "+504",
  "Hungary": "+36",
  "Iceland": "+354",
  "India": "+91",
  "Indonesia": "+62",
  "Iran": "+98",
  "Iraq": "+964",
  "Ireland": "+353",
  "Israel": "+972",
  "Italy": "+39",
  "Ivory Coast": "+225",
  "Jamaica": "+1",
  "Japan": "+81",
  "Jordan": "+962",
  "Kazakhstan": "+7",
  "Kenya": "+254",
  "Kiribati": "+686",
  "Kuwait": "+965",
  "Kyrgyzstan": "+996",
  "Laos": "+856",
  "Latvia": "+371",
  "Lebanon": "+961",
  "Lesotho": "+266",
  "Liberia": "+231",
  "Libya": "+218",
  "Liechtenstein": "+423",
  "Lithuania": "+370",
  "Luxembourg": "+352",
  "Madagascar": "+261",
  "Malawi": "+265",
  "Malaysia": "+60",
  "Maldives": "+960",
  "Mali": "+223",
  "Malta": "+356",
  "Marshall Islands": "+692",
  "Mauritania": "+222",
  "Mauritius": "+230",
  "Mexico": "+52",
  "Micronesia": "+691",
  "Moldova": "+373",
  "Monaco": "+377",
  "Mongolia": "+976",
  "Montenegro": "+382",
  "Morocco": "+212",
  "Mozambique": "+258",
  "Myanmar (formerly Burma)": "+95",
  "Namibia": "+264",
  "Nauru": "+674",
  "Nepal": "+977",
  "Netherlands": "+31",
  "New Zealand": "+64",
  "Nicaragua": "+505",
  "Niger": "+227",
  "Nigeria": "+234",
  "North Korea": "+850",
  "North Macedonia": "+389",
  "Norway": "+47",
  "Oman": "+968",
  "Pakistan": "+92",
  "Palau": "+680",
  "Palestine State": "+970",
  "Panama": "+507",
  "Papua New Guinea": "+675",
  "Paraguay": "+595",
  "Peru": "+51",
  "Philippines": "+63",
  "Poland": "+48",
  "Portugal": "+351",
  "Qatar": "+974",
  "Romania": "+40",
  "Russia": "+7",
  "Rwanda": "+250",
  "Saint Kitts and Nevis": "+1",
  "Saint Lucia": "+1",
  "Saint Vincent and the Grenadines": "+1",
  "Samoa": "+685",
  "San Marino": "+378",
  "Sao Tome and Principe": "+239",
  "Saudi Arabia": "+966",
  "Senegal": "+221",
  "Serbia": "+381",
  "Seychelles": "+248",
  "Sierra Leone": "+232",
  "Singapore": "+65",
  "Slovakia": "+421",
  "Slovenia": "+386",
  "Solomon Islands": "+677",
  "Somalia": "+252",
  "South Africa": "+27",
  "South Korea": "+82",
  "South Sudan": "+211",
  "Spain": "+34",
  "Sri Lanka": "+94",
  "Sudan": "+249",
  "Suriname": "+597",
  "Sweden": "+46",
  "Switzerland": "+41",
  "Syria": "+963",
  "Tajikistan": "+992",
  "Tanzania": "+255",
  "Thailand": "+66",
  "Timor-Leste": "+670",
  "Togo": "+228",
  "Tonga": "+676",
  "Trinidad and Tobago": "+1",
  "Tunisia": "+216",
  "Turkey": "+90",
  "Turkmenistan": "+993",
  "Tuvalu": "+688",
  "Uganda": "+256",
  "Ukraine": "+380",
  "United Arab Emirates": "+971",
  "United Kingdom": "+44",
  "United States of America": "+1",
  "Uruguay": "+598",
  "Uzbekistan": "+998",
  "Vanuatu": "+678",
  "Venezuela": "+58",
  "Vietnam": "+84",
  "Yemen": "+967",
  "Zambia": "+260",
  "Zimbabwe": "+263"
};

interface PhoneInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  placeholder = "Enter contact number",
  className,
  disabled = false
}: PhoneInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Parse current value to identify active country and local part
  const { currentCountry, currentLocalNumber } = useMemo(() => {
    // If empty value, default to Pakistan
    if (!value) {
      return { currentCountry: 'Pakistan', currentLocalNumber: '' };
    }

    const trimmed = value.trim();

    // Find country with the longest matching dial code prefix
    let matchedCountry = 'Pakistan';
    let matchedCode = '+92';
    let maxMatchLength = 0;

    for (const [country, code] of Object.entries(COUNTRY_DIAL_CODES)) {
      if (trimmed.startsWith(code)) {
        if (code.length > maxMatchLength) {
          maxMatchLength = code.length;
          matchedCountry = country;
          matchedCode = code;
        }
      }
    }

    // Extract the local part after the matching dial code
    let localPart = trimmed;
    if (maxMatchLength > 0) {
      localPart = trimmed.substring(maxMatchLength).trim();
    }

    return {
      currentCountry: matchedCountry,
      currentLocalNumber: localPart
    };
  }, [value]);

  const currentCode = COUNTRY_DIAL_CODES[currentCountry] || '+92';
  const currentFlag = COUNTRY_FLAGS[currentCountry] || '🇵🇰';

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter countries for the search dropdown
  const filteredCountries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(country => {
      const code = COUNTRY_DIAL_CODES[country] || '';
      return country.toLowerCase().includes(q) || code.includes(q);
    });
  }, [searchQuery]);

  // Focus search input when open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 80);
      setActiveIndex(-1);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const itemsCount = filteredCountries.length;
      if (itemsCount === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev < itemsCount - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : itemsCount - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && filteredCountries[activeIndex]) {
          handleSelect(filteredCountries[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCountries, activeIndex]);

  const handleSelect = (country: string) => {
    const code = COUNTRY_DIAL_CODES[country] || '+92';
    
    // Auto strip leading zero from the existing local number if they select a new code
    let cleanedLocal = currentLocalNumber;
    if (cleanedLocal.startsWith('0')) {
      cleanedLocal = cleanedLocal.substring(1);
    }

    onChange(`${code} ${cleanedLocal}`.trim());
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleLocalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputVal = e.target.value;
    
    // Strip leading zero if it is immediately typed after the country code block
    if (inputVal.startsWith('0') && inputVal.length > 1) {
      inputVal = inputVal.substring(1);
    }

    // Strip leading characters that are not digits or spaces
    inputVal = inputVal.replace(/[^0-9\s-]/g, '');

    onChange(`${currentCode} ${inputVal}`.trim());
  };

  return (
    <div ref={containerRef} className={cn("relative w-full flex items-center gap-2", className)}>
      {/* Country selection dropdown button */}
      <div className="relative shrink-0 w-[125px] sm:w-[145px]">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(prev => !prev)}
          className={cn(
            "w-full border outline-none rounded-2xl py-3 px-3 text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center justify-between text-left",
            disabled 
              ? "bg-stone-950/60 border-stone-900 text-stone-400 cursor-not-allowed" 
              : "bg-stone-50 border border-stone-200 text-stone-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 cursor-pointer"
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            <span className="text-sm shrink-0">{currentFlag}</span>
            <span className="truncate text-[11px] sm:text-xs font-semibold">
              {currentCountry === "United States of America" ? "USA" : currentCountry}
            </span>
            <span className="text-stone-500 font-bold shrink-0 text-[10px] sm:text-xs">
              {currentCode}
            </span>
          </span>
          <ChevronDown className={cn("w-3 h-3 text-stone-400 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
        </button>

        <AnimatePresence>
          {isOpen && !disabled && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 3 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-full left-0 w-[240px] sm:w-[280px] mt-1 bg-white rounded-2xl border border-stone-100 shadow-[0_20px_50px_rgba(0,0,0,0.12)] z-[100] overflow-hidden flex flex-col"
            >
              <div className="p-2 border-b border-stone-50 bg-stone-50/50 flex items-center gap-2 px-3">
                <Search className="w-4 h-4 text-stone-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search country or code..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none outline-none py-1.5 text-xs font-bold text-stone-900 placeholder-stone-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 rounded-full hover:bg-stone-200/60 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-stone-400" />
                  </button>
                )}
              </div>

              <div className="max-h-[200px] overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-stone-200 scrollbar-track-transparent">
                {filteredCountries.map((country, index) => {
                  const isSelected = country === currentCountry;
                  const isActive = activeIndex === index;
                  const itemFlag = COUNTRY_FLAGS[country] || "🏳️";
                  const itemCode = COUNTRY_DIAL_CODES[country] || '';

                  return (
                    <button
                      key={country}
                      type="button"
                      onClick={() => handleSelect(country)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        "w-full flex items-center justify-between px-3.5 py-2 text-left text-xs font-bold transition-colors",
                        isActive ? "bg-stone-100 text-stone-900" : "text-stone-600 hover:bg-stone-50"
                      )}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-sm shrink-0">{itemFlag}</span>
                        <span className="truncate max-w-[120px] sm:max-w-[150px]">{country}</span>
                        <span className="text-stone-400 text-[10px] shrink-0 font-semibold">{itemCode}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    </button>
                  );
                })}

                {filteredCountries.length === 0 && (
                  <div className="p-4 text-center text-xs text-stone-400 font-medium">
                    No matching countries
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Local phone number input field */}
      <input
        type="tel"
        disabled={disabled}
        value={currentLocalNumber}
        onChange={handleLocalNumberChange}
        placeholder={placeholder}
        className={cn(
          "w-full border rounded-2xl p-4 py-3 text-xs sm:text-sm font-bold transition-all outline-none italic shadow-sm",
          disabled 
            ? "bg-stone-950/60 border-stone-900 text-stone-400 cursor-not-allowed" 
            : "bg-stone-50 border border-stone-200 focus:border-amber-500 text-stone-900 focus:ring-2 focus:ring-amber-500/20"
        )}
      />
    </div>
  );
}
