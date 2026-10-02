/**
 * Utility functions for phone number normalization, display formatting, and URL generation.
 */

export function formatPhoneNumberForDisplay(phone: string | undefined | null): string {
  if (!phone) return "Not provided";
  let clean = phone.trim();
  
  // If it does not start with '+', let's normalize it to international standard.
  if (!clean.startsWith('+')) {
    if (clean.startsWith('0')) {
      clean = '+92 ' + clean.slice(1);
    } else {
      clean = '+92 ' + clean;
    }
  }
  
  // Clean up excessive spacing and make it neat
  return clean.replace(/\s+/g, ' ');
}

export function getCleanPhoneForCall(phone: string | undefined | null): string {
  if (!phone) return "";
  let clean = phone.replace(/[^0-9+]/g, ""); // Keep only digits and '+'
  if (!clean.startsWith('+')) {
    if (clean.startsWith('0')) {
      clean = '+92' + clean.slice(1);
    } else {
      clean = '+92' + clean;
    }
  }
  return clean;
}

export function getCleanPhoneForWhatsApp(phone: string | undefined | null): string {
  if (!phone) return "";
  let clean = phone.replace(/[^0-9]/g, ""); // Keep only digits
  if (clean.startsWith('0')) {
    clean = '92' + clean.slice(1);
  } else if (!clean.startsWith('92') && clean.length === 10) {
    clean = '92' + clean;
  }
  return clean;
}
