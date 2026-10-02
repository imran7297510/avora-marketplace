import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  getDoc, 
  doc, 
  writeBatch, 
  deleteField, 
  serverTimestamp 
} from 'firebase/firestore';
import cfg from '../firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId);

export interface MigrationSummary {
  totalScanned: number;
  category1Resolvable: number;
  category2MissingOwner: number;
  category3SimulatorBot: number;
  category4Malformed: number;
  privateSellerDocsCreated: number;
  piiFieldsPruned: number;
}

export async function migrateHistoricalOwnership(dryRun = false): Promise<MigrationSummary> {
  console.log(`[A2.2-6C MIGRATION] Starting historical ownership migration (dryRun=${dryRun})...`);
  const snap = await getDocs(collection(db, 'arena_auctions'));
  console.log(`[A2.2-6C MIGRATION] Scanned ${snap.size} arena_auctions documents.`);

  const summary: MigrationSummary = {
    totalScanned: snap.size,
    category1Resolvable: 0,
    category2MissingOwner: 0,
    category3SimulatorBot: 0,
    category4Malformed: 0,
    privateSellerDocsCreated: 0,
    piiFieldsPruned: 0,
  };

  let batch = writeBatch(db);
  let batchOpCount = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const auctionId = docSnap.id;
    const rawSellerId = data.sellerId;
    const isNeg = Boolean(data.isNegotiationOnly);

    // Classification Category 4: Malformed Records
    if (!rawSellerId || typeof rawSellerId !== 'string' || !rawSellerId.trim()) {
      summary.category4Malformed++;
      console.log(`[CAT 4 - Malformed] Auction ${auctionId} has invalid sellerId (${rawSellerId})`);
      
      const updates: Record<string, any> = {
        ownershipStatus: 'malformed_record',
        status: 'ended',
        migratedAt: serverTimestamp(),
        migrationCategory: 4,
      };
      if ('contactEmail' in data) { updates.contactEmail = deleteField(); summary.piiFieldsPruned++; }
      if ('contactNumber' in data) { updates.contactNumber = deleteField(); summary.piiFieldsPruned++; }
      if ('address' in data) { updates.address = deleteField(); summary.piiFieldsPruned++; }

      if (!dryRun) {
        batch.update(doc(db, 'arena_auctions', auctionId), updates);
        batchOpCount++;
      }
    }
    // Classification Category 3: Simulator / Bot / Official Host
    else if (
      rawSellerId === 'arena-official-host' ||
      rawSellerId === 'simulator_bot' ||
      rawSellerId.toLowerCase().includes('simulator') ||
      rawSellerId.toLowerCase().includes('bot') ||
      rawSellerId.toLowerCase().includes('official-host')
    ) {
      summary.category3SimulatorBot++;
      console.log(`[CAT 3 - System/Bot] Auction ${auctionId} identified as simulator/bot (${rawSellerId})`);

      const updates: Record<string, any> = {
        ownershipStatus: 'legacy_system_managed',
        isSystemManaged: true,
        migratedAt: serverTimestamp(),
        migrationCategory: 3,
      };
      if (isNeg) {
        updates.sellerId = 'anon_simulated';
        updates.sellerName = 'Anonymous Seller';
        updates.city = 'Location Hidden';
      }
      if ('contactEmail' in data) { updates.contactEmail = deleteField(); summary.piiFieldsPruned++; }
      if ('contactNumber' in data) { updates.contactNumber = deleteField(); summary.piiFieldsPruned++; }
      if ('address' in data) { updates.address = deleteField(); summary.piiFieldsPruned++; }

      if (!dryRun) {
        batch.update(doc(db, 'arena_auctions', auctionId), updates);
        batchOpCount++;
      }
    }
    // Check if sellerId exists in users collection
    else {
      let userDocExists = false;
      try {
        const userSnap = await getDoc(doc(db, 'users', rawSellerId));
        userDocExists = userSnap.exists();
      } catch (err) {
        console.warn(`[A2.2-6C MIGRATION] Failed to check users/${rawSellerId}:`, err);
      }

      // Classification Category 1: Resolvable Owner
      if (userDocExists) {
        summary.category1Resolvable++;
        console.log(`[CAT 1 - Resolvable] Auction ${auctionId} bound to user ${rawSellerId} (isNeg=${isNeg})`);

        const updates: Record<string, any> = {
          ownershipStatus: 'resolvable_owner_isolated',
          migratedAt: serverTimestamp(),
          migrationCategory: 1,
        };

        if (isNeg) {
          updates.sellerId = `anon_seller_${auctionId.slice(0, 12)}`;
          updates.sellerName = 'Anonymous Seller';
          updates.city = 'Location Hidden';
        }

        if ('contactEmail' in data) { updates.contactEmail = deleteField(); summary.piiFieldsPruned++; }
        if ('contactNumber' in data) { updates.contactNumber = deleteField(); summary.piiFieldsPruned++; }
        if ('address' in data) { updates.address = deleteField(); summary.piiFieldsPruned++; }

        if (!dryRun) {
          batch.update(doc(db, 'arena_auctions', auctionId), updates);
          batchOpCount++;

          // Create private/seller subcollection document
          const privateSellerRef = doc(db, 'arena_auctions', auctionId, 'private', 'seller');
          batch.set(privateSellerRef, {
            sellerUid: rawSellerId,
            migratedAt: serverTimestamp(),
            migrationCategory: 1,
          }, { merge: true });
          batchOpCount++;
          summary.privateSellerDocsCreated++;
        }
      }
      // Classification Category 2: Missing / Deleted Owner
      else {
        summary.category2MissingOwner++;
        console.log(`[CAT 2 - Missing Owner] Auction ${auctionId} owner ${rawSellerId} not found in users collection`);

        const updates: Record<string, any> = {
          ownershipStatus: 'orphaned_owner_unresolvable',
          status: 'ended',
          migratedAt: serverTimestamp(),
          migrationCategory: 2,
        };
        if (isNeg) {
          updates.sellerId = 'anon_unresolved';
          updates.sellerName = 'Anonymous Seller';
          updates.city = 'Location Hidden';
        }
        if ('contactEmail' in data) { updates.contactEmail = deleteField(); summary.piiFieldsPruned++; }
        if ('contactNumber' in data) { updates.contactNumber = deleteField(); summary.piiFieldsPruned++; }
        if ('address' in data) { updates.address = deleteField(); summary.piiFieldsPruned++; }

        if (!dryRun) {
          batch.update(doc(db, 'arena_auctions', auctionId), updates);
          batchOpCount++;
        }
      }
    }

    if (!dryRun && batchOpCount >= 300) {
      await batch.commit();
      batch = writeBatch(db);
      batchOpCount = 0;
    }
  }

  if (!dryRun && batchOpCount > 0) {
    await batch.commit();
  }

  console.log('[A2.2-6C MIGRATION] Migration finished successfully:');
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

// Auto-run if executed directly via tsx
if (import.meta.url === `file://${process.argv[1]}`) {
  const isDryRun = process.argv.includes('--dry-run');
  migrateHistoricalOwnership(isDryRun)
    .then(() => {
      console.log('Migration completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
