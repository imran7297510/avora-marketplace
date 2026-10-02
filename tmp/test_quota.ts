import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, limit, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function checkQuota() {
  console.log("Checking Firestore quota status...");
  try {
    const q = query(collection(db, 'listings'), limit(1));
    const snapshot = await getDocs(q);
    console.log("STATUS_OK: Successfully read from Firestore. Found documents:", snapshot.size);
    process.exit(0);
  } catch (err: any) {
    if (err.message && err.message.includes('Quota limit exceeded')) {
      console.log("STATUS_QUOTA_EXCEEDED: Quota is still exceeded.");
      console.log("Error details:", err.message);
    } else {
      console.log("STATUS_ERROR:", err.message);
    }
    process.exit(1);
  }
}

checkQuota();
