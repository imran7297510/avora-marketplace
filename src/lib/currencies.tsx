import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Check, ChevronDown, X } from 'lucide-react';
import { cn } from './utils';
import { motion, AnimatePresence } from 'motion/react';

export interface CurrencyItem {
  code: string;       // e.g., "PKR", "USD", "EUR", "GBP", "ALL"
  symbol: string;     // e.g., "Rs.", "$", "€", "£", "🌐"
  name: string;       // e.g., "Pakistani Rupee", "US Dollar", "Worldwide"
  flag: string;       // e.g., "🇵🇰", "🇺🇸", "🇪🇺", "🌐"
  countries?: string[]; // Associated country names
}

export const ALL_CURRENCIES_ITEM: CurrencyItem = {
  code: 'ALL',
  symbol: '🌐',
  name: 'Worldwide (All Currencies)',
  flag: '🌐',
  countries: ['Global', 'Worldwide']
};

/**
 * Authoritative ISO 4217 Global Fiat Currencies Dataset.
 * STRICTLY FIAT ONLY — Crypto/tokens (USDT, BTC, etc.) are excluded.
 */
export const WORLD_CURRENCIES: CurrencyItem[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', countries: ['United States of America', 'Ecuador', 'El Salvador', 'Marshall Islands', 'Micronesia', 'Palau', 'Panama', 'Timor-Leste'] },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', countries: ['Andorra', 'Austria', 'Belgium', 'Croatia', 'Cyprus', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Monaco', 'Montenegro', 'Netherlands', 'Portugal', 'San Marino', 'Slovakia', 'Slovenia', 'Spain'] },
  { code: 'GBP', symbol: '£', name: 'Pound Sterling', flag: '🇬🇧', countries: ['United Kingdom'] },
  { code: 'PKR', symbol: 'Rs.', name: 'Pakistani Rupee', flag: '🇵🇰', countries: ['Pakistan'] },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳', countries: ['India'] },
  { code: 'AED', symbol: 'AED', name: 'United Arab Emirates Dirham', flag: '🇦🇪', countries: ['United Arab Emirates'] },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi Riyal', flag: '🇸🇦', countries: ['Saudi Arabia'] },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', flag: '🇨🇦', countries: ['Canada'] },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', countries: ['Australia', 'Kiribati', 'Nauru', 'Tuvalu'] },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', flag: '🇨🇳', countries: ['China'] },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵', countries: ['Japan'] },
  { code: 'KWD', symbol: 'KWD', name: 'Kuwaiti Dinar', flag: '🇰🇼', countries: ['Kuwait'] },
  { code: 'QAR', symbol: 'QAR', name: 'Qatari Riyal', flag: '🇶🇦', countries: ['Qatar'] },
  { code: 'OMR', symbol: 'OMR', name: 'Omani Rial', flag: '🇴🇲', countries: ['Oman'] },
  { code: 'BHD', symbol: 'BHD', name: 'Bahraini Dinar', flag: '🇧🇭', countries: ['Bahrain'] },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', flag: '🇲🇾', countries: ['Malaysia'] },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬', countries: ['Singapore'] },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', flag: '🇧🇩', countries: ['Bangladesh'] },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee', flag: '🇱🇰', countries: ['Sri Lanka'] },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', flag: '🇹🇷', countries: ['Turkey'] },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', flag: '🇷🇺', countries: ['Russia'] },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', flag: '🇿🇦', countries: ['South Africa'] },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷', countries: ['Brazil'] },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', flag: '🇲🇽', countries: ['Mexico'] },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', flag: '🇮🇩', countries: ['Indonesia'] },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', flag: '🇵🇭', countries: ['Philippines'] },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', flag: '🇹🇭', countries: ['Thailand'] },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', flag: '🇻🇳', countries: ['Vietnam'] },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', flag: '🇰🇷', countries: ['South Korea'] },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', flag: '🇭🇰', countries: ['Hong Kong'] },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar', flag: '🇹🇼', countries: ['Taiwan'] },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', flag: '🇳🇿', countries: ['New Zealand'] },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', flag: '🇨🇭', countries: ['Switzerland', 'Liechtenstein'] },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', flag: '🇸🇪', countries: ['Sweden'] },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', flag: '🇳🇴', countries: ['Norway'] },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', flag: '🇩🇰', countries: ['Denmark'] },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', flag: '🇵🇱', countries: ['Poland'] },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', flag: '🇪🇬', countries: ['Egypt'] },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', flag: '🇳🇬', countries: ['Nigeria'] },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', flag: '🇰🇪', countries: ['Kenya'] },
  { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi', flag: '🇬🇭', countries: ['Ghana'] },
  { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham', flag: '🇲🇦', countries: ['Morocco'] },
  { code: 'DZD', symbol: 'د.ج', name: 'Algerian Dinar', flag: '🇩🇿', countries: ['Algeria'] },
  { code: 'ILS', symbol: '₪', name: 'Israeli New Shekel', flag: '🇮🇱', countries: ['Israel', 'Palestine State'] },
  { code: 'JOD', symbol: 'JOD', name: 'Jordanian Dinar', flag: '🇯🇴', countries: ['Jordan'] },
  { code: 'LBP', symbol: 'L£', name: 'Lebanese Pound', flag: '🇱🇧', countries: ['Lebanon'] },
  { code: 'IQD', symbol: 'د.ع', name: 'Iraqi Dinar', flag: '🇮🇶', countries: ['Iraq'] },
  { code: 'IRR', symbol: '﷼', name: 'Iranian Rial', flag: '🇮🇷', countries: ['Iran'] },
  { code: 'AFN', symbol: '؋', name: 'Afghan Afghani', flag: '🇦🇫', countries: ['Afghanistan'] },
  { code: 'ALL', symbol: 'L', name: 'Albanian Lek', flag: '🇦🇱', countries: ['Albania'] },
  { code: 'AMD', symbol: '֏', name: 'Armenian Dram', flag: '🇦🇲', countries: ['Armenia'] },
  { code: 'AZN', symbol: '₼', name: 'Azerbaijani Manat', flag: '🇦🇿', countries: ['Azerbaijan'] },
  { code: 'BAM', symbol: 'KM', name: 'Bosnia-Herzegovina Convertible Mark', flag: '🇧🇦', countries: ['Bosnia and Herzegovina'] },
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev', flag: '🇧🇬', countries: ['Bulgaria'] },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna', flag: '🇨🇿', countries: ['Czechia (Czech Republic)'] },
  { code: 'GEL', symbol: '₾', name: 'Georgian Lari', flag: '🇬🇪', countries: ['Georgia'] },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', flag: '🇭🇺', countries: ['Hungary'] },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic Krona', flag: '🇮🇸', countries: ['Iceland'] },
  { code: 'MKD', symbol: 'den', name: 'Macedonian Denar', flag: '🇲🇰', countries: ['North Macedonia'] },
  { code: 'MDL', symbol: 'L', name: 'Moldovan Leu', flag: '🇲🇩', countries: ['Moldova'] },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu', flag: '🇷🇴', countries: ['Romania'] },
  { code: 'RSD', symbol: 'din', name: 'Serbian Dinar', flag: '🇷🇸', countries: ['Serbia'] },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia', flag: '🇺🇦', countries: ['Ukraine'] },
  { code: 'KZT', symbol: '₸', name: 'Kazakhstani Tenge', flag: '🇰🇿', countries: ['Kazakhstan'] },
  { code: 'KGS', symbol: 'сом', name: 'Kyrgyzstani Som', flag: '🇰🇬', countries: ['Kyrgyzstan'] },
  { code: 'TJS', symbol: 'SM', name: 'Tajikistani Somoni', flag: '🇹🇯', countries: ['Tajikistan'] },
  { code: 'TMT', symbol: 'm', name: 'Turkmenistan Manat', flag: '🇹🇲', countries: ['Turkmenistan'] },
  { code: 'UZS', symbol: 'soʻm', name: 'Uzbekistani Som', flag: '🇺🇿', countries: ['Uzbekistan'] },
  { code: 'MNT', symbol: '₮', name: 'Mongolian Tugrik', flag: '🇲🇳', countries: ['Mongolia'] },
  { code: 'NPR', symbol: 'Rs.', name: 'Nepalese Rupee', flag: '🇳🇵', countries: ['Nepal'] },
  { code: 'BTN', symbol: 'Nu.', name: 'Bhutanese Ngultrum', flag: '🇧🇹', countries: ['Bhutan'] },
  { code: 'MVR', symbol: 'Rf', name: 'Maldivian Rufiyaa', flag: '🇲🇻', countries: ['Maldives'] },
  { code: 'MMK', symbol: 'K', name: 'Myanmar Kyat', flag: '🇲🇲', countries: ['Myanmar (formerly Burma)'] },
  { code: 'KHR', symbol: '៛', name: 'Cambodian Riel', flag: '🇰🇭', countries: ['Cambodia'] },
  { code: 'LAK', symbol: '₭', name: 'Lao Kip', flag: '🇱🇦', countries: ['Laos'] },
  { code: 'BND', symbol: 'B$', name: 'Brunei Dollar', flag: '🇧🇳', countries: ['Brunei'] },
  { code: 'MOP', symbol: 'MOP$', name: 'Macanese Pataca', flag: '🇲🇴', countries: ['Macau'] },
  { code: 'COP', symbol: 'COP$', name: 'Colombian Peso', flag: '🇨🇴', countries: ['Colombia'] },
  { code: 'PEN', symbol: 'S/.', name: 'Peruvian Sol', flag: '🇵🇪', countries: ['Peru'] },
  { code: 'CLP', symbol: 'CLP$', name: 'Chilean Peso', flag: '🇨🇱', countries: ['Chile'] },
  { code: 'ARS', symbol: 'ARS$', name: 'Argentine Peso', flag: '🇦🇷', countries: ['Argentina'] },
  { code: 'UYU', symbol: '$U', name: 'Uruguayan Peso', flag: '🇺🇾', countries: ['Uruguay'] },
  { code: 'PYG', symbol: '₲', name: 'Paraguayan Guarani', flag: '🇵🇾', countries: ['Paraguay'] },
  { code: 'BOB', symbol: 'Bs.', name: 'Bolivian Boliviano', flag: '🇧🇴', countries: ['Bolivia'] },
  { code: 'VES', symbol: 'Bs.', name: 'Venezuelan Bolivar', flag: '🇻🇪', countries: ['Venezuela'] },
  { code: 'CRC', symbol: '₡', name: 'Costa Rican Colon', flag: '🇨🇷', countries: ['Costa Rica'] },
  { code: 'GTQ', symbol: 'Q', name: 'Guatemalan Quetzal', flag: '🇬🇹', countries: ['Guatemala'] },
  { code: 'HNL', symbol: 'L', name: 'Honduran Lempira', flag: '🇭🇳', countries: ['Honduras'] },
  { code: 'NIO', symbol: 'C$', name: 'Nicaraguan Cordoba', flag: '🇳🇮', countries: ['Nicaragua'] },
  { code: 'PAB', symbol: 'B/.', name: 'Panamanian Balboa', flag: '🇵🇦', countries: ['Panama'] },
  { code: 'DOP', symbol: 'RD$', name: 'Dominican Peso', flag: '🇩🇴', countries: ['Dominican Republic'] },
  { code: 'JMD', symbol: 'J$', name: 'Jamaican Dollar', flag: '🇯🇲', countries: ['Jamaica'] },
  { code: 'TTD', symbol: 'TT$', name: 'Trinidad and Tobago Dollar', flag: '🇹🇹', countries: ['Trinidad and Tobago'] },
  { code: 'XCD', symbol: 'EC$', name: 'East Caribbean Dollar', flag: '🇦🇬', countries: ['Antigua and Barbuda', 'Dominica', 'Grenada', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines'] },
  { code: 'BBD', symbol: 'BBD$', name: 'Barbadian Dollar', flag: '🇧🇧', countries: ['Barbados'] },
  { code: 'BSD', symbol: 'B$', name: 'Bahamian Dollar', flag: '🇧🇸', countries: ['Bahamas'] },
  { code: 'BZD', symbol: 'BZ$', name: 'Belize Dollar', flag: '🇧🇿', countries: ['Belize'] },
  { code: 'GYD', symbol: 'G$', name: 'Guyanese Dollar', flag: '🇬🇾', countries: ['Guyana'] },
  { code: 'SRD', symbol: 'SRD$', name: 'Surinamese Dollar', flag: '🇸🇷', countries: ['Suriname'] },
  { code: 'HTG', symbol: 'G', name: 'Haitian Gourde', flag: '🇭🇹', countries: ['Haiti'] },
  { code: 'CUP', symbol: '₱', name: 'Cuban Peso', flag: '🇨🇺', countries: ['Cuba'] },
  { code: 'BMD', symbol: 'BD$', name: 'Bermudian Dollar', flag: '🇧🇲', countries: ['Bermuda'] },
  { code: 'KYD', symbol: 'CI$', name: 'Cayman Islands Dollar', flag: '🇰🇾', countries: ['Cayman Islands'] },
  { code: 'AWG', symbol: 'Afl.', name: 'Aruban Florin', flag: '🇦🇼', countries: ['Aruba'] },
  { code: 'ANG', symbol: 'NAƒ', name: 'Netherlands Antillean Guilder', flag: '🇨🇼', countries: ['Curaçao', 'Sint Maarten'] },
  { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc', flag: '🇸🇳', countries: ['Benin', 'Burkina Faso', 'Ivory Coast', 'Guinea-Bissau', 'Mali', 'Niger', 'Senegal', 'Togo'] },
  { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc', flag: '🇨🇲', countries: ['Cameroon', 'Central African Republic', 'Chad', 'Congo (Congo-Brazzaville)', 'Equatorial Guinea', 'Gabon'] },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr', flag: '🇪🇹', countries: ['Ethiopia'] },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', flag: '🇹🇿', countries: ['Tanzania'] },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', flag: '🇺🇬', countries: ['Uganda'] },
  { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc', flag: '🇷🇼', countries: ['Rwanda'] },
  { code: 'BIF', symbol: 'FBu', name: 'Burundian Franc', flag: '🇧🇮', countries: ['Burundi'] },
  { code: 'MWK', symbol: 'MK', name: 'Malawian Kwacha', flag: '🇲🇼', countries: ['Malawi'] },
  { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha', flag: '🇿🇲', countries: ['Zambia'] },
  { code: 'MZN', symbol: 'MT', name: 'Mozambican Metical', flag: '🇲🇿', countries: ['Mozambique'] },
  { code: 'AOA', symbol: 'Kz', name: 'Angolan Kwanza', flag: '🇦🇴', countries: ['Angola'] },
  { code: 'BWP', symbol: 'P', name: 'Botswana Pula', flag: '🇧🇼', countries: ['Botswana'] },
  { code: 'NAD', symbol: 'N$', name: 'Namibian Dollar', flag: '🇳🇦', countries: ['Namibia'] },
  { code: 'SZL', symbol: 'E', name: 'Eswatini Lilangeni', flag: '🇸🇿', countries: ['Eswatini'] },
  { code: 'LSL', symbol: 'L', name: 'Lesotho Loti', flag: '🇱🇸', countries: ['Lesotho'] },
  { code: 'MUR', symbol: '₨', name: 'Mauritian Rupee', flag: '🇲🇺', countries: ['Mauritius'] },
  { code: 'SCR', symbol: 'SR', name: 'Seychellois Rupee', flag: '🇸🇨', countries: ['Seychelles'] },
  { code: 'MGA', symbol: 'Ar', name: 'Malagasy Ariary', flag: '🇲🇬', countries: ['Madagascar'] },
  { code: 'LYD', symbol: 'LD', name: 'Libyan Dinar', flag: '🇱🇾', countries: ['Libya'] },
  { code: 'TND', symbol: 'DT', name: 'Tunisian Dinar', flag: '🇹🇳', countries: ['Tunisia'] },
  { code: 'SDG', symbol: 'SDG', name: 'Sudanese Pound', flag: '🇸🇩', countries: ['Sudan'] },
  { code: 'SSP', symbol: 'SSP£', name: 'South Sudanese Pound', flag: '🇸🇸', countries: ['South Sudan'] },
  { code: 'SOS', symbol: 'Sh', name: 'Somali Shilling', flag: '🇸🇴', countries: ['Somalia'] },
  { code: 'DJF', symbol: 'Fdj', name: 'Djiboutian Franc', flag: '🇩🇯', countries: ['Djibouti'] },
  { code: 'ERN', symbol: 'Nfk', name: 'Eritrean Nakfa', flag: '🇪🇷', countries: ['Eritrea'] },
  { code: 'GMD', symbol: 'D', name: 'Gambian Dalasi', flag: '🇬🇲', countries: ['Gambia'] },
  { code: 'GNF', symbol: 'FG', name: 'Guinean Franc', flag: '🇬🇳', countries: ['Guinea'] },
  { code: 'SLE', symbol: 'Le', name: 'Sierra Leonean Leone', flag: '🇸🇱', countries: ['Sierra Leone'] },
  { code: 'LRD', symbol: 'L$', name: 'Liberian Dollar', flag: '🇱🇷', countries: ['Liberia'] },
  { code: 'CVE', symbol: 'Esc', name: 'Cape Verdean Escudo', flag: '🇨🇻', countries: ['Cabo Verde'] },
  { code: 'STN', symbol: 'Db', name: 'Sao Tome and Principe Dobra', flag: '🇸🇹', countries: ['Sao Tome and Principe'] },
  { code: 'KMF', symbol: 'CF', name: 'Comorian Franc', flag: '🇰🇲', countries: ['Comoros'] },
  { code: 'CDF', symbol: 'FC', name: 'Congolese Franc', flag: '🇨🇩', countries: ['Congo (Democratic Republic of)'] },
  { code: 'MRU', symbol: 'UM', name: 'Mauritanian Ouguiya', flag: '🇲🇷', countries: ['Mauritania'] },
  { code: 'FJD', symbol: 'FJ$', name: 'Fijian Dollar', flag: '🇫🇯', countries: ['Fiji'] },
  { code: 'PGK', symbol: 'K', name: 'Papua New Guinean Kina', flag: '🇵🇬', countries: ['Papua New Guinea'] },
  { code: 'SBD', symbol: 'SI$', name: 'Solomon Islands Dollar', flag: '🇸🇧', countries: ['Solomon Islands'] },
  { code: 'VUV', symbol: 'VT', name: 'Vanuatu Vatu', flag: '🇻🇺', countries: ['Vanuatu'] },
  { code: 'WST', symbol: 'WS$', name: 'Samoan Tala', flag: '🇼🇸', countries: ['Samoa'] },
  { code: 'TOP', symbol: 'T$', name: 'Tongan Paʻanga', flag: '🇹🇴', countries: ['Tonga'] },
  { code: 'SYP', symbol: 'LS', name: 'Syrian Pound', flag: '🇸🇾', countries: ['Syria'] },
  { code: 'YER', symbol: 'YR', name: 'Yemeni Rial', flag: '🇾🇪', countries: ['Yemen'] },
  { code: 'KPW', symbol: '₩', name: 'North Korean Won', flag: '🇰🇵', countries: ['North Korea'] },
  { code: 'FKP', symbol: 'FK£', name: 'Falkland Islands Pound', flag: '🇫🇰', countries: ['Falkland Islands'] },
  { code: 'GIP', symbol: 'GIP£', name: 'Gibraltar Pound', flag: '🇬🇮', countries: ['Gibraltar'] },
  { code: 'SHP', symbol: 'SH£', name: 'Saint Helena Pound', flag: '🇸🇭', countries: ['Saint Helena'] }
];

let globalPreferredCurrency: CurrencyItem = (() => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('mandi_preferred_currency');
      if (saved) {
        if (saved.startsWith('{')) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.code) {
            return getCurrencyByCode(parsed.code);
          }
        } else if (saved.trim() !== '') {
          return getCurrencyByCode(saved);
        }
      }
    }
  } catch (e) {
    // Ignore error
  }
  return ALL_CURRENCIES_ITEM; // Default ALL (Worldwide)
})();

export function setGlobalPreferredCurrency(currency: CurrencyItem) {
  if (currency && currency.code) {
    globalPreferredCurrency = currency;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('mandi_preferred_currency', JSON.stringify(currency));
        window.dispatchEvent(new CustomEvent('mandi_currency_changed', { detail: currency }));
      }
    } catch (e) {
      // Ignore error
    }
  }
}

export function getGlobalPreferredCurrency(): CurrencyItem {
  return globalPreferredCurrency;
}

export { CurrencySelector } from '../components/CurrencySelector';

/**
 * Checks if a currency code is a valid supported fiat currency.
 */
export function isValidFiatCurrencyCode(code?: string): boolean {
  if (!code) return false;
  const normalized = code.trim().toUpperCase();
  if (normalized === 'ALL') return true;
  return WORLD_CURRENCIES.some(c => c.code === normalized);
}

/**
 * Centralized Reusable Currency Filter Helper
 * Filters an array of listings/auctions/negotiations based on the user's selected global currency.
 * Preserves original objects and avoids mutating the source array.
 */
export function filterListingsByCurrency<T = any>(
  listings: T[],
  selectedCurrency: CurrencyItem | { code: string; [key: string]: any } | null | undefined
): T[] {
  if (!listings || !Array.isArray(listings)) return [];
  const currCode = selectedCurrency?.code ? selectedCurrency.code.trim().toUpperCase() : 'ALL';

  return listings.filter(item => {
    if (!item) return false;
    const rawCurr = ((item as any).currencyCode || (item as any).currency || (item as any).currencySymbol || 'PKR').toString().trim();
    const resolved = getCurrencyByCode(rawCurr);
    const itemCurr = (resolved?.code || rawCurr).toUpperCase().trim();

    if (currCode && currCode !== 'ALL') {
      return itemCurr === currCode;
    } else if (currCode === 'ALL') {
      return isValidFiatCurrencyCode(itemCurr);
    }
    return true;
  });
}

/**
 * Automatically determine the default currency for a user based on their country name.
 * If countryName is empty or unknown, falls back to user preferred currency or USD.
 */
export function getDefaultCurrencyForCountry(countryName?: string): CurrencyItem {
  if (!countryName) {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz.includes('Karachi') || tz.includes('Pakistan')) return getCurrencyByCode('PKR');
      if (tz.includes('Dubai') || tz.includes('Muscat')) return getCurrencyByCode('AED');
      if (tz.includes('Riyadh')) return getCurrencyByCode('SAR');
      if (tz.includes('London')) return getCurrencyByCode('GBP');
      if (tz.includes('Kolkata') || tz.includes('India')) return getCurrencyByCode('INR');
      if (tz.includes('Europe')) return getCurrencyByCode('EUR');
    } catch {
      // Ignore fallback errors
    }
    return getGlobalPreferredCurrency();
  }

  const query = countryName.trim().toLowerCase();

  for (const item of WORLD_CURRENCIES) {
    if (item.countries && item.countries.some(c => c.toLowerCase() === query || query.includes(c.toLowerCase()))) {
      return item;
    }
  }

  // Alias checks
  if (query.includes('pakistan')) return getCurrencyByCode('PKR');
  if (query.includes('united states') || query.includes('usa') || query.includes('america')) return getCurrencyByCode('USD');
  if (query.includes('emirates') || query.includes('uae') || query.includes('dubai')) return getCurrencyByCode('AED');
  if (query.includes('saudi')) return getCurrencyByCode('SAR');
  if (query.includes('kingdom') || query.includes('uk') || query.includes('britain')) return getCurrencyByCode('GBP');
  if (query.includes('india')) return getCurrencyByCode('INR');
  if (query.includes('canada')) return getCurrencyByCode('CAD');
  if (query.includes('australia')) return getCurrencyByCode('AUD');

  return getGlobalPreferredCurrency();
}

/**
 * Get currency details by currency code (e.g. "USD", "PKR", "EUR", "AED", "ALL")
 */
export function getCurrencyByCode(code?: string): CurrencyItem {
  if (!code) return globalPreferredCurrency || ALL_CURRENCIES_ITEM; 
  const normalized = code.trim().toUpperCase();

  if (normalized === 'ALL' || normalized === 'WORLD' || normalized === 'WORLDWIDE') {
    return ALL_CURRENCIES_ITEM;
  }
  
  // Direct code match
  const found = WORLD_CURRENCIES.find(c => c.code === normalized);
  if (found) return found;

  // Symbol match
  const foundSymbol = WORLD_CURRENCIES.find(c => c.symbol === code.trim());
  if (foundSymbol) return foundSymbol;

  // Fallback
  return { code: normalized, symbol: normalized, name: normalized, flag: '🌐' };
}

/**
 * Formats a numeric price with a currency code or symbol.
 * Example: formatPrice(1500, "USD") => "$1,500 USD"
 *          formatPrice(1500, "PKR") => "Rs. 1,500 PKR"
 */
export function formatPrice(amount: number | undefined | null, currencyCodeOrSymbol?: string): string {
  const val = Number(amount) || 0;
  const hasDecimals = val % 1 !== 0;
  const formattedNumber = val.toLocaleString(undefined, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  });

  let codeToUse = currencyCodeOrSymbol;
  if (!codeToUse || codeToUse === 'ALL') {
    codeToUse = 'PKR';
  }

  const curr = getCurrencyByCode(codeToUse);
  
  if (curr.symbol === curr.code) {
    return `${formattedNumber} ${curr.code}`;
  }

  const needsSpace = curr.symbol.endsWith('.');
  return `${curr.symbol}${needsSpace ? ' ' : ''}${formattedNumber} ${curr.code}`;
}

/**
 * Authoritative Refund Calculator (95% Refund / 5% Retention)
 */
export function calculateRefundAmounts(receivedAmount: number | undefined | null): {
  refundAmount: number;
  retentionAmount: number;
  refundPercentage: number;
  retentionPercentage: number;
} {
  const base = Math.max(0, Number(receivedAmount) || 0);
  if (base <= 0) {
    return {
      refundAmount: 0,
      retentionAmount: 0,
      refundPercentage: 95,
      retentionPercentage: 5,
    };
  }

  const refundAmount = Math.round(base * 0.95 * 100) / 100;
  const retentionAmount = Math.round((base - refundAmount) * 100) / 100;

  return {
    refundAmount,
    retentionAmount,
    refundPercentage: 95,
    retentionPercentage: 5,
  };
}
