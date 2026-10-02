import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, getCountFromServer, query, where } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function runDryRun() {
  console.log("==================================================");
  console.log("PHASE 2C — DRY RUN RECONCILIATION INITIALIZATION");
  console.log("==================================================");

  try {
    // 1. Quota-Safe Initial Count Check
    const reportsCountSnap = await getCountFromServer(collection(db, "reports"));
    const marketplaceTotalCount = reportsCountSnap.data().count;

    const arenaReportsCountSnap = await getCountFromServer(collection(db, "arena_reports"));
    const arenaTotalCount = arenaReportsCountSnap.data().count;

    console.log(`Planned Aggregation Operations:`);
    console.log(`- Count query on 'reports' collection (Marketplace total)`);
    console.log(`- Count query on 'arena_reports' collection (Arena total)`);
    console.log(`- Detailed audit scan via read operations (since total counts are extremely safe for quota limits)`);
    console.log(`\nInitial Quota-Safe Scan:`);
    console.log(`- Marketplace reports total: ${marketplaceTotalCount}`);
    console.log(`- Arena reports total: ${arenaTotalCount}`);
    console.log("--------------------------------------------------");

    // 2. Fetch documents for exact categorization, duplicate checking, and malformed field audit
    console.log("Fetching documents for in-depth data integrity and legacy audit...");
    const marketplaceSnap = await getDocs(collection(db, "reports"));
    const arenaSnap = await getDocs(collection(db, "arena_reports"));

    console.log(`Actual production reads performed: ${marketplaceSnap.size} (Marketplace), ${arenaSnap.size} (Arena)`);
    console.log(`Production writes: 0`);
    console.log(`Production deletes: 0`);
    console.log(`Deployments: 0\n`);

    // MARKETPLACE Audit
    let marketplaceOpen = 0;
    let marketplaceResolved = 0;
    let marketplaceDismissed = 0;
    const marketplaceUnexpected: Record<string, number> = {};
    const marketplaceMalformed: string[] = [];

    marketplaceSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const status = data.status;

      if (!status) {
        marketplaceMalformed.push(`Doc ID: ${docSnap.id} (Missing status)`);
        return;
      }

      const statusUpper = String(status).toUpperCase();
      if (statusUpper === 'OPEN') {
        marketplaceOpen++;
      } else if (statusUpper === 'RESOLVED') {
        marketplaceResolved++;
      } else if (statusUpper === 'DISMISSED') {
        marketplaceDismissed++;
      } else {
        marketplaceUnexpected[status] = (marketplaceUnexpected[status] || 0) + 1;
      }
    });

    // ARENA Audit
    let arenaListingTotal = 0;
    let arenaNegotiationTotal = 0;
    let arenaUserTotal = 0;
    let arenaUnknownTargetType = 0;

    let arenaPending = 0;
    let arenaReviewing = 0;
    let arenaResolved = 0;
    let arenaDismissed = 0;

    const arenaUnexpectedStatuses: Record<string, number> = {};
    const arenaMalformed: string[] = [];
    const arenaUnknownTargetTypesList: Record<string, number> = {};

    arenaSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const targetType = data.targetType;
      const status = data.status;

      // 1. Audit targetType
      if (!targetType) {
        arenaMalformed.push(`Doc ID: ${docSnap.id} (Missing targetType)`);
        arenaUnknownTargetType++;
        return;
      }

      if (targetType === 'user') {
        arenaUserTotal++;
        return; // Explicitly excluded from Reported Listings metrics
      } else if (targetType === 'listing') {
        arenaListingTotal++;
      } else if (targetType === 'negotiation') {
        arenaNegotiationTotal++;
      } else {
        arenaUnknownTargetTypesList[targetType] = (arenaUnknownTargetTypesList[targetType] || 0) + 1;
        arenaUnknownTargetType++;
        return; // Excluded
      }

      // 2. Audit status for listing & negotiation reports only
      if (!status) {
        arenaMalformed.push(`Doc ID: ${docSnap.id} (Missing status, targetType: ${targetType})`);
        return;
      }

      const statusLower = String(status).toLowerCase();
      if (statusLower === 'pending') {
        arenaPending++;
      } else if (statusLower === 'reviewing') {
        arenaReviewing++;
      } else if (statusLower === 'resolved') {
        arenaResolved++;
      } else if (statusLower === 'dismissed') {
        arenaDismissed++;
      } else {
        arenaUnexpectedStatuses[status] = (arenaUnexpectedStatuses[status] || 0) + 1;
      }
    });

    // Final Calculation of Metrics
    // 1. allReportsCount: total Marketplace + Arena (listing + negotiation) reports currently retained
    const allReportsCount = marketplaceSnap.size + arenaListingTotal + arenaNegotiationTotal;

    // 2. availableReportsCount: count of currently retained Reported Listings reports
    const availableReportsCount = marketplaceSnap.size + arenaListingTotal + arenaNegotiationTotal;

    // 3. pendingReportsCount: OPEN in Marketplace + (pending or reviewing) in Arena
    const pendingReportsCount = marketplaceOpen + arenaPending + arenaReviewing;

    // 4. resolvedReportsCount: RESOLVED in Marketplace + resolved in Arena
    const resolvedReportsCount = marketplaceResolved + arenaResolved;

    // 5. dismissedReportsCount: DISMISSED in Marketplace + dismissed in Arena
    const dismissedReportsCount = marketplaceDismissed + arenaDismissed;

    // 6. Invariant check
    const sumCount = pendingReportsCount + resolvedReportsCount + dismissedReportsCount;
    const invariantResult = availableReportsCount === sumCount;

    // Output Certification Report Format
    console.log("==================================================");
    console.log("PHASE 2C — DRY RUN CERTIFICATION");
    console.log("==================================================");
    console.log(`1. Collections inspected: reports, arena_reports`);
    console.log(`2. Aggregation queries performed: getCountFromServer on both collections, followed by full document audit fetch`);
    console.log(`3. Firestore production reads: ${marketplaceSnap.size + arenaSnap.size}`);
    console.log(`4. Firestore writes: 0`);
    console.log(`5. Firestore deletes: 0`);
    console.log(`6. Deployment status: No changes to security rules or indexes\n`);

    console.log("MARKETPLACE (reports collection):");
    console.log(`- Total: ${marketplaceSnap.size}`);
    console.log(`- OPEN: ${marketplaceOpen}`);
    console.log(`- RESOLVED: ${marketplaceResolved}`);
    console.log(`- DISMISSED: ${marketplaceDismissed}`);
    console.log(`- Unexpected statuses: ${JSON.stringify(marketplaceUnexpected)}`);
    if (marketplaceMalformed.length > 0) {
      console.log(`- Malformed documents:`);
      marketplaceMalformed.forEach(m => console.log(`  * ${m}`));
    } else {
      console.log(`- Malformed documents: None`);
    }
    console.log("");

    console.log("ARENA (arena_reports collection):");
    console.log(`- Total arena_reports: ${arenaSnap.size}`);
    console.log(`- listing reports total: ${arenaListingTotal}`);
    console.log(`- negotiation reports total: ${arenaNegotiationTotal}`);
    console.log(`- user reports total (profiles): ${arenaUserTotal} (EXCLUDED)`);
    console.log(`- unknown targetType total: ${arenaUnknownTargetType} (EXCLUDED)`);
    console.log(`- pending reports (listing/negotiation): ${arenaPending}`);
    console.log(`- reviewing reports (listing/negotiation): ${arenaReviewing}`);
    console.log(`- resolved reports (listing/negotiation): ${arenaResolved}`);
    console.log(`- dismissed reports (listing/negotiation): ${arenaDismissed}`);
    console.log(`- unexpected statuses (listing/negotiation): ${JSON.stringify(arenaUnexpectedStatuses)}`);
    if (arenaMalformed.length > 0) {
      console.log(`- Malformed documents:`);
      arenaMalformed.forEach(m => console.log(`  * ${m}`));
    } else {
      console.log(`- Malformed documents: None`);
    }
    console.log("");

    console.log("CALCULATED METRICS:");
    console.log(`- allReportsCount: ${allReportsCount}`);
    console.log(`- availableReportsCount: ${availableReportsCount}`);
    console.log(`- pendingReportsCount: ${pendingReportsCount}`);
    console.log(`- resolvedReportsCount: ${resolvedReportsCount}`);
    console.log(`- dismissedReportsCount: ${dismissedReportsCount}`);
    console.log("");

    console.log("INVARIANT CHECK:");
    console.log(`- pending + resolved + dismissed = ${pendingReportsCount} + ${resolvedReportsCount} + ${dismissedReportsCount} = ${sumCount}`);
    console.log(`- availableReportsCount = ${availableReportsCount}`);
    console.log(`- Invariant Satisfied: ${invariantResult ? "YES (PASS)" : "NO (FAIL)"}`);
    console.log("");

    console.log("HISTORICAL LIMITATION:");
    console.log("allReportsCount can be initialized exactly from currently retained historical report records, but permanently deleted pre-existing reports cannot be reconstructed.");
    console.log("");

    console.log("APPLY STATUS:");
    console.log("NOT APPLIED — awaiting explicit authorization.");
    console.log("==================================================");

  } catch (err: any) {
    console.error("Reconciliation Dry Run Error:", err);
  }
}

runDryRun();
