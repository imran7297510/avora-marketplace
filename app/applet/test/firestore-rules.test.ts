import { test, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import assert from 'assert';

let testEnv: RulesTestEnvironment;

before(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulatorHost !== '127.0.0.1:8085') {
    throw new Error(
      `FAIL-CLOSED: FIRESTORE_EMULATOR_HOST must be exactly '127.0.0.1:8085'. Found: '${emulatorHost}'. Halting immediately.`
    );
  }

  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  if (!fs.existsSync(rulesPath)) {
    throw new Error(`FAIL-CLOSED: firestore.rules not found at ${rulesPath}`);
  }

  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: 'demo-avora-security-test',
    firestore: {
      rules: rulesContent,
      host: '127.0.0.1',
      port: 8085,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

test('1. Unauthenticated offer creation denied', async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const offerRef = unauthDb.collection('offers').doc('offer_unauth');

  await assert.rejects(
    async () => {
      await offerRef.set({
        listingId: 'listing_1',
        buyerId: 'buyer_1',
        sellerId: 'seller_1',
        status: 'pending',
        proposedPrice: 100,
        currency: 'PKR',
        createdAt: new Date(),
      });
    },
    (err: any) => {
      return err.code === 'permission-denied' || err.message.includes('PERMISSION_DENIED');
    }
  );
});

test('2. Valid offer creation allowed when all rule conditions are met', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.collection('listings').doc('listing_valid').set({
      status: 'LIVE',
      ownerId: 'seller_1',
      currency: 'PKR',
      title: 'Test Listing',
    });
  });

  const buyerContext = testEnv.authenticatedContext('buyer_1', {
    email: 'buyer1@example.com',
  });
  const db = buyerContext.firestore();
  const offerRef = db.collection('offers').doc('offer_valid');

  const serverTimestamp = (db.constructor as any).FieldValue.serverTimestamp();

  await assert.doesNotReject(async () => {
    await offerRef.set({
      listingId: 'listing_valid',
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
      status: 'pending',
      proposedPrice: 150,
      currency: 'PKR',
      createdAt: serverTimestamp,
      buyerName: 'Buyer One',
      listingTitle: 'Test Listing',
    });
  });
});

test('3. Direct offer updates denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.collection('listings').doc('listing_valid').set({
      status: 'LIVE',
      ownerId: 'seller_1',
      currency: 'PKR',
    });
    await db.collection('offers').doc('offer_update').set({
      listingId: 'listing_valid',
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
      status: 'pending',
      proposedPrice: 150,
      currency: 'PKR',
      createdAt: new Date(),
    });
  });

  const buyerContext = testEnv.authenticatedContext('buyer_1');
  const db = buyerContext.firestore();
  const offerRef = db.collection('offers').doc('offer_update');

  await assert.rejects(
    async () => {
      await offerRef.update({
        proposedPrice: 200,
      });
    },
    (err: any) => {
      return err.code === 'permission-denied' || err.message.includes('PERMISSION_DENIED');
    }
  );
});

test('4. Non-admin offer deletion denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.collection('offers').doc('offer_delete').set({
      listingId: 'listing_1',
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
      status: 'pending',
      proposedPrice: 150,
      currency: 'PKR',
      createdAt: new Date(),
    });
  });

  const buyerContext = testEnv.authenticatedContext('buyer_1');
  const db = buyerContext.firestore();
  const offerRef = db.collection('offers').doc('offer_delete');

  await assert.rejects(
    async () => {
      await offerRef.delete();
    },
    (err: any) => {
      return err.code === 'permission-denied' || err.message.includes('PERMISSION_DENIED');
    }
  );
});

test('5. Unauthorized offer reads denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.collection('offers').doc('offer_read').set({
      listingId: 'listing_1',
      buyerId: 'buyer_1',
      sellerId: 'seller_1',
      status: 'pending',
      proposedPrice: 150,
      currency: 'PKR',
      createdAt: new Date(),
    });
  });

  const strangerContext = testEnv.authenticatedContext('stranger_user');
  const db = strangerContext.firestore();
  const offerRef = db.collection('offers').doc('offer_read');

  await assert.rejects(
    async () => {
      await offerRef.get();
    },
    (err: any) => {
      return err.code === 'permission-denied' || err.message.includes('PERMISSION_DENIED');
    }
  );
});
