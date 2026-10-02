import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  projectId: "treasure-hub-pk",
});

const db = getFirestore(app, "ai-studio-c5cea893-acec-4774-a11a-e26679ae7862");

async function main() {
  console.log("=== FIRESTORE READ-ONLY PRE-CHECK ===");
  try {
    // 1. Listings Count
    const listingsQuery = db.collection('listings').where('status', '==', 'LIVE');
    const listingsSnap = await listingsQuery.get();
    const liveListings = listingsSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
    console.log(`\nLIVE listings count: ${liveListings.length}`);

    // 2. Approved KYC Users
    const usersQuery = db.collection('users').where('kycStatus', '==', 'APPROVED');
    const usersSnap = await usersQuery.get();
    const approvedUsers = usersSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
    console.log(`Approved KYC users count: ${approvedUsers.length}`);

    // 3. Battle Bids Auctions
    let activeAuctions: any[] = [];
    try {
      const auctionsQuery = db.collection('arena_auctions').where('status', '==', 'active');
      const auctionsSnap = await auctionsQuery.get();
      activeAuctions = auctionsSnap.docs.map(d => ({ ...d.data(), id: d.id } as any));
      console.log(`Active Battle Bids auctions count: ${activeAuctions.length}`);
    } catch (err: any) {
      console.log("Error querying arena_auctions (might be empty/not exist):", err.message);
    }

    // Process geographic data
    const activeCountries = new Set<string>();
    const activeCities = new Set<string>();

    const EXCLUDED_CITY_PLACEHOLDERS = new Set([
      'all pakistan', 'pakistan', 'n/a', 'na', 'location unspecified',
      'location unknown', 'unspecified', 'unknown', 'all', 'none', 'test_city'
    ]);

    const EXCLUDED_COUNTRY_PLACEHOLDERS = new Set([
      'all', 'none', 'n/a', 'na', 'unknown', 'unspecified',
      'unspecified country', 'location unknown', 'test_country'
    ]);

    const toTitleCase = (text: string): string => {
      return text
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    };

    const normalizeCityName = (rawCity: any): string | null => {
      if (!rawCity || typeof rawCity !== 'string') return null;
      const clean = rawCity.trim();
      if (!clean || EXCLUDED_CITY_PLACEHOLDERS.has(clean.toLowerCase())) {
        return null;
      }
      return toTitleCase(clean);
    };

    const normalizeCountryName = (rawCountry: any): string | null => {
      if (!rawCountry || typeof rawCountry !== 'string') return null;
      const clean = rawCountry.trim().toLowerCase();
      if (!clean || EXCLUDED_COUNTRY_PLACEHOLDERS.has(clean)) {
        return null;
      }
      if (clean === 'usa' || clean === 'us' || clean === 'united states' || clean === 'united states of america') {
        return 'United States of America';
      }
      if (clean === 'uk' || clean === 'united kingdom') {
        return 'United Kingdom';
      }
      if (clean === 'uae' || clean === 'united arab emirates') {
        return 'United Arab Emirates';
      }
      return toTitleCase(clean);
    };

    // Scrape from LIVE listings
    liveListings.forEach(item => {
      const cleanCity = normalizeCityName(item.city);
      if (cleanCity) activeCities.add(cleanCity);

      const cleanCountry = normalizeCountryName(item.country);
      if (cleanCountry) activeCountries.add(cleanCountry);
    });

    // Scrape from Active Battle Bids
    activeAuctions.forEach(item => {
      if (!item.deleted && !item.removed) {
        const cleanCity = normalizeCityName(item.city);
        if (cleanCity) activeCities.add(cleanCity);

        const cleanCountry = normalizeCountryName(item.country);
        if (cleanCountry) activeCountries.add(cleanCountry);
      }
    });

    // Scrape from KYC-approved users
    approvedUsers.forEach(userDoc => {
      // Filter out invalid/blocked/banned/deleted
      const isBlocked = userDoc.isBlocked || userDoc.accountStatus === 'blocked' || userDoc.accountStatus === 'deleted' || userDoc.accountStatus === 'banned' || userDoc.isBanned;
      if (!isBlocked) {
        const cleanCity = normalizeCityName(userDoc.city || userDoc.businessCity);
        if (cleanCity) activeCities.add(cleanCity);

        const cleanCountry = normalizeCountryName(userDoc.country || userDoc.countryOfStay);
        if (cleanCountry) activeCountries.add(cleanCountry);
      }
    });

    // Fetch existing pre-reconciliation values if any
    let existingDoc: any = null;
    try {
      const metricsSnap = await db.collection('system_metrics').doc('marketplace').get();
      if (metricsSnap.exists) {
        existingDoc = metricsSnap.data();
        console.log("\nExisting pre-reconciliation values on production:");
        console.log(`- totalLiveListingsCount: ${existingDoc.totalLiveListingsCount}`);
        console.log(`- totalVerifiedSellersCount: ${existingDoc.totalVerifiedSellersCount}`);
        console.log(`- countriesCount: ${existingDoc.countriesCount}`);
        console.log(`- activeCitiesCount: ${existingDoc.activeCitiesCount}`);
      } else {
        console.log("\nNo pre-existing marketplace system metrics document found.");
      }
    } catch (err: any) {
      console.log("Error fetching existing system metrics:", err.message);
    }

    console.log("\nExpected Pre-Reconciliation Calculated Values:");
    console.log(`- Active Listings: ${liveListings.length}`);
    const validVerifiedSellersCount = approvedUsers.filter(u => {
      const isBlocked = u.isBlocked || u.accountStatus === 'blocked' || u.accountStatus === 'deleted' || u.accountStatus === 'banned' || u.isBanned;
      return !isBlocked;
    }).length;
    console.log(`- Verified Sellers: ${validVerifiedSellersCount}`);
    console.log(`- Countries Count: ${activeCountries.size}`);
    console.log(`- Active Cities Count: ${activeCities.size}`);
    console.log("\nDeduped Countries:", Array.from(activeCountries).sort());
    console.log("Deduped Cities:", Array.from(activeCities).sort());

  } catch (err: any) {
    console.error("Connection/Query error:", err);
  }
}

main();
