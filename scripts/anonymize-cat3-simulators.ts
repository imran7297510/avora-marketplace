import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import cfg from '../firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId);

async function main() {
  const snap = await getDocs(collection(db, 'arena_auctions'));
  let updated = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (data.isNegotiationOnly && (data.sellerId === 'arena-official-host' || data.isSystemManaged || data.isSimulated)) {
      await updateDoc(doc(db, 'arena_auctions', d.id), {
        sellerId: 'anon_simulated',
        sellerName: 'Anonymous Seller',
        city: 'Location Hidden',
        isSimulated: true,
      });
      updated++;
      console.log(`Anonymized sim negotiation auction: ${d.id}`);
    }
  }
  console.log(`Done. Updated ${updated} simulator negotiation auctions.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  });
