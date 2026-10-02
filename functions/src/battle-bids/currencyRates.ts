/**
 * Pure Node.js Server-Side Currency Rates & Conversion Helper.
 * STRICTLY decoupled from React, DOM, JSX, and browser globals.
 * 
 * Base Currency: USD (1.0)
 * Rates define the USD value per 1 unit of foreign currency:
 * valueInUSD = amount * RATES_TO_USD[currencyCode]
 */

export const RATES_TO_USD: Record<string, number> = {
  USD: 1.0,
  USDT: 1.0,
  EUR: 1.085,
  GBP: 1.285,
  PKR: 0.00359,   // ~278.5 PKR per USD
  INR: 0.01198,   // ~83.5 INR per USD
  AED: 0.2723,    // ~3.6725 AED per USD
  SAR: 0.2667,    // ~3.75 SAR per USD
  CAD: 0.735,     // ~1.36 CAD per USD
  AUD: 0.658,     // ~1.52 AUD per USD
  CNY: 0.1383,    // ~7.23 CNY per USD
  JPY: 0.00645,   // ~155 JPY per USD
  KWD: 3.25,      // ~0.308 KWD per USD
  QAR: 0.2747,    // ~3.64 QAR per USD
  OMR: 2.597,     // ~0.385 OMR per USD
  BHD: 2.652,     // ~0.377 BHD per USD
  MYR: 0.212,
  SGD: 0.745,
  BDT: 0.0085,
  LKR: 0.0033,
  TRY: 0.0308,
  RUB: 0.011,
  ZAR: 0.054,
  BRL: 0.185,
  MXN: 0.059,
  IDR: 0.000062,
  PHP: 0.0173,
  THB: 0.0273,
  VND: 0.000039,
  KRW: 0.00073,
  NZD: 0.605,
  CHF: 1.11,
  SEK: 0.095,
  NOK: 0.093,
  DKK: 0.145,
  PLN: 0.252,
  EGP: 0.021,
  NGN: 0.00068,
  KES: 0.0077,
  GHS: 0.068,
  MAD: 0.10,
  DZD: 0.0074,
  ILS: 0.272,
  JOD: 1.41,
  LBP: 0.000011,
  IQD: 0.00076,
  IRR: 0.000024,
  AFN: 0.014,
  ALL: 0.0108,
  AMD: 0.0026,
  AZN: 0.588,
  BAM: 0.555,
  BGN: 0.555,
  CZK: 0.0435,
  GEL: 0.365,
  HUF: 0.00275,
  ISK: 0.0072,
  MKD: 0.0176,
  MDL: 0.056,
  RON: 0.218,
  RSD: 0.0093,
  UAH: 0.0245,
  KZT: 0.0021,
  KGS: 0.0115,
  TJS: 0.092,
  TMT: 0.286,
  UZS: 0.000079,
  MNT: 0.00029,
  NPR: 0.0075,
  BTN: 0.012,
  MVR: 0.065,
  MMK: 0.00048,
  KHR: 0.00024,
  LAK: 0.000046,
  BND: 0.745,
  COP: 0.00025,
  PEN: 0.268,
  CLP: 0.00106,
  ARS: 0.0011,
  UYU: 0.025,
  PYG: 0.00013,
  BOB: 0.145,
  VES: 0.027,
  CRC: 0.0019,
  GTQ: 0.129,
  HNL: 0.040,
  NIO: 0.027,
  PAB: 1.0,
  DOP: 0.017,
  JMD: 0.0064,
  TTD: 0.147,
  XCD: 0.370,
  BBSD: 0.50,
  BSD: 1.0,
  BZD: 0.50,
  GYD: 0.0048,
  SRD: 0.028,
  XOF: 0.00165,
  XAF: 0.00165,
  ETB: 0.0174,
  TZS: 0.00038,
  UGX: 0.00026,
  RWF: 0.00077,
  BIF: 0.00035,
  MWK: 0.00058,
  ZMW: 0.038,
  MZN: 0.0156
};

/**
 * Validates whether a currency code exists in the rate dictionary.
 */
export function isValidCurrency(currencyCode: string | undefined | null): boolean {
  if (!currencyCode || typeof currencyCode !== 'string') return false;
  const code = currencyCode.trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(RATES_TO_USD, code);
}

/**
 * Converts any supported currency amount to USD deterministically.
 * Returns null if amount is invalid or currency is unsupported.
 */
export function convertToUSD(amount: number | undefined | null, currencyCode: string | undefined | null): number | null {
  const num = Number(amount);
  if (isNaN(num) || num < 0) return null;
  if (!currencyCode || typeof currencyCode !== 'string') return null;

  const code = currencyCode.trim().toUpperCase();
  const rate = RATES_TO_USD[code];
  if (typeof rate !== 'number' || rate <= 0) {
    console.warn(`[currencyRates] Unsupported or invalid currency code encountered: "${currencyCode}". Cannot normalize to USD.`);
    return null;
  }

  // Calculate normalized USD amount rounded to 2 decimal places
  return Math.round(num * rate * 100) / 100;
}
