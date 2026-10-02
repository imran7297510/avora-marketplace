import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, deleteField } from 'firebase/firestore';
import cfg from '../firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId);

const SENSITIVE_LEGACY_KEYS = [
  'cnicNumber',
  'residentialAddress',
  'cnicFrontPhoto',
  'cnicBackPhoto',
  'selfiePhoto',
];

const EQUIVALENT_LEGACY_KEYS = [
  'cnic',
  'passport',
  'idFront',
  'idBack',
  'idDocument',
  'identityPhoto',
  'idPhoto',
  'driverLicense',
  'documentFront',
  'documentBack',
  'frontPhoto',
  'backPhoto',
  'nationalId',
  'idNumber',
];

export async function cleanupLegacyUserPii() {
  console.log('[KYC PII CLEANUP] Starting scan of users collection...');
  const snap = await getDocs(collection(db, 'users'));
  console.log(`[KYC PII CLEANUP] Found ${snap.size} user documents.`);

  const keysToCheck = [...SENSITIVE_LEGACY_KEYS, ...EQUIVALENT_LEGACY_KEYS];
  const batch = writeBatch(db);
  let dirtyDocCount = 0;
  let totalKeysPruned = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const updates: Record<string, any> = {};

    for (const key of keysToCheck) {
      if (key in data) {
        updates[key] = deleteField();
        totalKeysPruned++;
      }
    }

    if (Object.keys(updates).length > 0) {
      dirtyDocCount++;
      console.log(`[KYC PII CLEANUP] Marking user ${docSnap.id} for pruning keys: ${Object.keys(updates).join(', ')}`);
      batch.update(doc(db, 'users', docSnap.id), updates);
    }
  }

  if (dirtyDocCount > 0) {
    console.log(`[KYC PII CLEANUP] Committing atomic batch for ${dirtyDocCount} document(s) with ${totalKeysPruned} field(s)...`);
    await batch.commit();
    console.log('[KYC PII CLEANUP] Atomic batch committed successfully.');
  } else {
    console.log('[KYC PII CLEANUP] All documents are already clean. Zero legacy sensitive fields found.');
  }

  // Verification step
  console.log('[KYC PII CLEANUP] Verifying public access cleanliness...');
  const verifySnap = await getDocs(collection(db, 'users'));
  let exposedFields = 0;

  for (const docSnap of verifySnap.docs) {
    const data = docSnap.data();
    for (const key of keysToCheck) {
      if (key in data && data[key] !== undefined) {
        console.error(`[LEAK DETECTED] ${docSnap.id} has ${key}`);
        exposedFields++;
      }
    }
  }

  if (exposedFields === 0) {
    console.log(`[KYC PII CLEANUP] SUCCESS: Verified clean across all ${verifySnap.size} user profiles.`);
  } else {
    throw new Error(`Verification failed: ${exposedFields} sensitive fields still present!`);
  }
}

// Run when executed directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('cleanup-legacy-kyc-pii')) {
  cleanupLegacyUserPii()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[KYC PII CLEANUP ERROR]', err);
      process.exit(1);
    });
}
