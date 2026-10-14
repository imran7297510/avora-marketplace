import { test, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
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
    projectId: 'demo-avora-security-ci',
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

function isPermissionDenied(err: any) {
  return err.code === 'permission-denied' || /permission-denied/i.test(err.message);
}

// ==========================================
// EXISTING 18 OFFER-SECURITY & NEGOTIATION TESTS
// ==========================================

test('Offers: Unauthenticated creation denied', async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assert.rejects(
    () => db.collection('offers').doc('o1').set({
      listingId: 'l1', buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100, currency: 'PKR', createdAt: serverTimestamp()
    }),
    isPermissionDenied
  );
});

test('Offers: Valid offer creation allowed', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('listings').doc('l1').set({
      status: 'LIVE', ownerId: 's1', currency: 'PKR'
    });
  });

  const db = testEnv.authenticatedContext('b1').firestore();
  await assert.doesNotReject(
    () => db.collection('offers').doc('o1').set({
      listingId: 'l1', buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100, currency: 'PKR', createdAt: serverTimestamp()
    })
  );
});

test('Offers: Unexpected fields denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('listings').doc('l1').set({
      status: 'LIVE', ownerId: 's1', currency: 'PKR'
    });
  });

  const db = testEnv.authenticatedContext('b1').firestore();
  await assert.rejects(
    () => db.collection('offers').doc('o1').set({
      listingId: 'l1', buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100, currency: 'PKR', createdAt: serverTimestamp(),
      unauthorizedField: 'bad'
    }),
    isPermissionDenied
  );
});

test('Offers: Missing required fields denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('listings').doc('l1').set({
      status: 'LIVE', ownerId: 's1', currency: 'PKR'
    });
  });

  const db = testEnv.authenticatedContext('b1').firestore();
  await assert.rejects(
    () => db.collection('offers').doc('o1').set({
      listingId: 'l1', buyerId: 'b1', sellerId: 's1', status: 'pending', currency: 'PKR', createdAt: serverTimestamp()
    }),
    isPermissionDenied
  );
});

test('Offers: Invalid field types denied (listingId not string)', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('listings').doc('l1').set({
      status: 'LIVE', ownerId: 's1', currency: 'PKR'
    });
  });

  const db = testEnv.authenticatedContext('b1').firestore();
  await assert.rejects(
    () => db.collection('offers').doc('o1').set({
      listingId: 12345, buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100, currency: 'PKR', createdAt: serverTimestamp()
    }),
    isPermissionDenied
  );
});

test('Offers: Excessive notes length denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('listings').doc('l1').set({
      status: 'LIVE', ownerId: 's1', currency: 'PKR'
    });
  });

  const db = testEnv.authenticatedContext('b1').firestore();
  const longNotes = 'a'.repeat(1001);
  await assert.rejects(
    () => db.collection('offers').doc('o1').set({
      listingId: 'l1', buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100, currency: 'PKR', createdAt: serverTimestamp(),
      notes: longNotes
    }),
    isPermissionDenied
  );
});

test('Offers: offersDisabled false or missing permits valid creation', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('listings').doc('l1').set({
      status: 'LIVE', ownerId: 's1', currency: 'PKR'
    });
    await ctx.firestore().collection('users').doc('b1').set({
      offersDisabled: false
    });
  });

  const db = testEnv.authenticatedContext('b1').firestore();
  await assert.doesNotReject(
    () => db.collection('offers').doc('o1').set({
      listingId: 'l1', buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100, currency: 'PKR', createdAt: serverTimestamp()
    })
  );
});

test('Offers: Buyer and seller read permissions allowed, unrelated user denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('offers').doc('o1').set({
      buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100
    });
  });

  const buyerDb = testEnv.authenticatedContext('b1').firestore();
  const sellerDb = testEnv.authenticatedContext('s1').firestore();
  const strangerDb = testEnv.authenticatedContext('stranger').firestore();

  await assert.doesNotReject(() => buyerDb.collection('offers').doc('o1').get());
  await assert.doesNotReject(() => sellerDb.collection('offers').doc('o1').get());
  await assert.rejects(() => strangerDb.collection('offers').doc('o1').get(), isPermissionDenied);
});

test('Offers: Admin read and delete allowed', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('offers').doc('o1').set({
      buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100
    });
  });

  const adminDb = testEnv.authenticatedContext('admin_uid', { email: 'imran7297510@gmail.com' }).firestore();
  await assert.doesNotReject(() => adminDb.collection('offers').doc('o1').get());
  await assert.doesNotReject(() => adminDb.collection('offers').doc('o1').delete());
});

test('Offers: Seller update and non-admin deletion denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('offers').doc('o1').set({
      buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100
    });
  });

  const sellerDb = testEnv.authenticatedContext('s1').firestore();
  const buyerDb = testEnv.authenticatedContext('b1').firestore();

  await assert.rejects(() => sellerDb.collection('offers').doc('o1').update({ proposedPrice: 120 }), isPermissionDenied);
  await assert.rejects(() => buyerDb.collection('offers').doc('o1').delete(), isPermissionDenied);
});

test('Arena Offers: Authorized seller send/counter allowed', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('arena_negotiations').doc('neg1').set({
      auctionId: 'auc1', buyerId: 'b1', sellerId: 's1', status: 'active'
    });
    await ctx.firestore().collection('arena_auctions').doc('auc1').set({
      title: 'Auction 1'
    });
  });

  const sellerDb = testEnv.authenticatedContext('s1').firestore();
  await assert.doesNotReject(
    () => sellerDb.collection('arena_negotiations/neg1/offers').doc('ao1').set({
      negotiationId: 'neg1', senderId: 's1', action: 'counter', amount: 180
    })
  );
});

test('Arena Offers: Invalid and nonpositive financial amounts denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('arena_negotiations').doc('neg1').set({
      auctionId: 'auc1', buyerId: 'b1', sellerId: 's1', status: 'active'
    });
  });

  const db = testEnv.authenticatedContext('b1').firestore();
  await assert.rejects(
    () => db.collection('arena_negotiations/neg1/offers').doc('ao1').set({
      negotiationId: 'neg1', senderId: 'b1', action: 'send', amount: 0
    }),
    isPermissionDenied
  );
});

test('Arena Offers: offersDisabled blocks financial actions but not nonfinancial messages', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('arena_negotiations').doc('neg1').set({
      auctionId: 'auc1', buyerId: 'b1', sellerId: 's1', status: 'active'
    });
    await ctx.firestore().collection('users').doc('b1').set({
      offersDisabled: true
    });
  });

  const db = testEnv.authenticatedContext('b1').firestore();
  await assert.rejects(
    () => db.collection('arena_negotiations/neg1/offers').doc('ao1').set({
      negotiationId: 'neg1', senderId: 'b1', action: 'send', amount: 100
    }),
    isPermissionDenied
  );
  await assert.doesNotReject(
    () => db.collection('arena_negotiations/neg1/offers').doc('ao2').set({
      negotiationId: 'neg1', senderId: 'b1', action: 'message'
    })
  );
});

test('Arena Offers: Direct update denied and delete permissions enforced', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('arena_negotiations').doc('neg1').set({
      auctionId: 'auc1', buyerId: 'b1', sellerId: 's1', status: 'active'
    });
    await ctx.firestore().collection('arena_negotiations/neg1/offers').doc('ao1').set({
      negotiationId: 'neg1', senderId: 'b1', action: 'send', amount: 100
    });
  });

  const db = testEnv.authenticatedContext('b1').firestore();
  await assert.rejects(
    () => db.collection('arena_negotiations/neg1/offers').doc('ao1').update({ amount: 120 }),
    isPermissionDenied
  );
  await assert.doesNotReject(() => db.collection('arena_negotiations/neg1/offers').doc('ao1').delete());
});

test('Second Chance: Incorrect canonical offer ID or original order ID denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orders').doc('BB-auc1').set({
      status: 'PAYMENT_EXPIRED', source: 'battle_bids', sellerId: 's1', currency: 'PKR', amount: 500, buyerId: 'other_buyer'
    });
  });

  const db = testEnv.authenticatedContext('s1').firestore();
  const futureDate = new Date(Date.now() + 86400000 * 2);

  await assert.rejects(
    () => db.collection('second_chance_offers').doc('WRONG-ID').set({
      auctionId: 'auc1', originalOrderId: 'BB-auc1', status: 'PENDING', amount: 450, expiresAt: futureDate, sellerId: 's1', currency: 'PKR', buyerId: 'b1'
    }),
    isPermissionDenied
  );
});

test('Second Chance: Missing order or wrong status/source denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orders').doc('BB-auc1').set({
      status: 'PENDING', source: 'battle_bids', sellerId: 's1', currency: 'PKR', amount: 500, buyerId: 'other_buyer'
    });
  });

  const db = testEnv.authenticatedContext('s1').firestore();
  const futureDate = new Date(Date.now() + 86400000 * 2);

  await assert.rejects(
    () => db.collection('second_chance_offers').doc('SC-auc1').set({
      auctionId: 'auc1', originalOrderId: 'BB-auc1', status: 'PENDING', amount: 450, expiresAt: futureDate, sellerId: 's1', currency: 'PKR', buyerId: 'b1'
    }),
    isPermissionDenied
  );
});

test('Second Chance: Amount exceeding original order amount denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('orders').doc('BB-auc1').set({
      status: 'PAYMENT_EXPIRED', source: 'battle_bids', sellerId: 's1', currency: 'PKR', amount: 500, buyerId: 'other_buyer'
    });
  });

  const db = testEnv.authenticatedContext('s1').firestore();
  const futureDate = new Date(Date.now() + 86400000 * 2);

  await assert.rejects(
    () => db.collection('second_chance_offers').doc('SC-auc1').set({
      auctionId: 'auc1', originalOrderId: 'BB-auc1', status: 'PENDING', amount: 550, expiresAt: futureDate, sellerId: 's1', currency: 'PKR', buyerId: 'b1'
    }),
    isPermissionDenied
  );
});

test('Second Chance: Read permissions enforced', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('second_chance_offers').doc('SC-auc1').set({
      buyerId: 'b1', sellerId: 's1', status: 'PENDING', amount: 400
    });
  });

  const buyerDb = testEnv.authenticatedContext('b1').firestore();
  const sellerDb = testEnv.authenticatedContext('s1').firestore();
  const strangerDb = testEnv.authenticatedContext('stranger').firestore();

  await assert.doesNotReject(() => buyerDb.collection('second_chance_offers').doc('SC-auc1').get());
  await assert.doesNotReject(() => sellerDb.collection('second_chance_offers').doc('SC-auc1').get());
  await assert.rejects(() => strangerDb.collection('second_chance_offers').doc('SC-auc1').get(), isPermissionDenied);
});


// ==========================================
// NEW ADMIN AUTHORIZATION PATH TESTS (PHASE 2)
// ==========================================

test('Admin Path 1: /admins/{uid} document-existence authorization & write protection', async () => {
  // Seed offer for admin delete test
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('offers').doc('admin_test_offer').set({
      buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100
    });
    // Seed admin document for admin_uid1
    await ctx.firestore().collection('admins').doc('admin_uid1').set({
      role: 'super'
    });
  });

  const adminDb = testEnv.authenticatedContext('admin_uid1').firestore();
  const normalDb = testEnv.authenticatedContext('normal_uid').firestore();

  // 1. User with /admins/{uid} document can delete offer (isAdmin() == true)
  await assert.doesNotReject(() => adminDb.collection('offers').doc('admin_test_offer').delete());

  // 2. User without /admins/{uid} document cannot delete offer
  await assert.rejects(() => normalDb.collection('offers').doc('admin_test_offer').delete(), isPermissionDenied);

  // 3. Unauthorized client write to /admins/normal_uid is denied (allow write: if false)
  await assert.rejects(
    () => normalDb.collection('admins').doc('normal_uid').set({ role: 'super' }),
    isPermissionDenied
  );
});

test('Admin Path 2: /authorizedAdmins/{email} authorization & write protection', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('offers').doc('auth_admin_offer').set({
      buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100
    });
    // Seed authorizedAdmin document for authorized email
    await ctx.firestore().collection('authorizedAdmins').doc('authadmin@example.com').set({
      addedBy: 'super'
    });
  });

  const authorizedAdminDb = testEnv.authenticatedContext('user_auth1', { email: 'authadmin@example.com' }).firestore();
  const unauthorizedAdminDb = testEnv.authenticatedContext('user_unauth', { email: 'unauthorized@example.com' }).firestore();

  // 1. User with matching email in /authorizedAdmins/{email} can delete offer
  await assert.doesNotReject(() => authorizedAdminDb.collection('offers').doc('auth_admin_offer').delete());

  // 2. User without matching email cannot delete offer
  await assert.rejects(() => unauthorizedAdminDb.collection('offers').doc('auth_admin_offer').delete(), isPermissionDenied);

  // 3. Ordinary user attempt to write to /authorizedAdmins/ is denied (allow write: if isSuper())
  await assert.rejects(
    () => unauthorizedAdminDb.collection('authorizedAdmins').doc('newadmin@example.com').set({ addedBy: 'hack' }),
    isPermissionDenied
  );
});

test('Admin Path 3: users/{uid}.isAdmin / isSuperAdmin authorization & user flag protection', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('offers').doc('user_flag_offer').set({
      buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100
    });
    // Seed user document with isAdmin: true
    await ctx.firestore().collection('users').doc('user_admin_flag').set({
      isAdmin: true
    });
    // Seed user document with isSuperAdmin: true
    await ctx.firestore().collection('users').doc('user_superadmin_flag').set({
      isSuperAdmin: true
    });
  });

  const adminFlagDb = testEnv.authenticatedContext('user_admin_flag').firestore();
  const superadminFlagDb = testEnv.authenticatedContext('user_superadmin_flag').firestore();
  const normalUserDb = testEnv.authenticatedContext('normal_user').firestore();

  // 1. User with isAdmin: true can delete offer
  await assert.doesNotReject(() => adminFlagDb.collection('offers').doc('user_flag_offer').delete());

  // Re-seed offer for superadmin flag test
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('offers').doc('user_flag_offer_2').set({
      buyerId: 'b1', sellerId: 's1', status: 'pending', proposedPrice: 100
    });
  });

  // 2. User with isSuperAdmin: true can delete offer
  await assert.doesNotReject(() => superadminFlagDb.collection('offers').doc('user_flag_offer_2').delete());

  // 3. Normal user cannot set isAdmin: true during profile creation
  await assert.rejects(
    () => normalUserDb.collection('users').doc('normal_user').set({
      createdAt: serverTimestamp(),
      isAdmin: true
    }),
    isPermissionDenied
  );
});

// ==========================================
// ARENA AUCTIONS SECURITY TESTS (8 Test Blocks)
// ==========================================

test('Arena Auctions 1: Unauthenticated public read allowed', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('arena_auctions').doc('auc_pub').set({
      title: 'Public Item',
      startingPrice: 100,
      currentBid: 100,
      status: 'active',
      sellerId: 'seller_100',
      startTime: serverTimestamp(),
      endTime: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assert.doesNotReject(() => unauthDb.collection('arena_auctions').doc('auc_pub').get());
});

test('Arena Auctions 2: Unauthenticated auction creation denied', async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assert.rejects(
    () => unauthDb.collection('arena_auctions').doc('auc_unauth').set({
      title: 'Unauthorized Item',
      startingPrice: 100,
      currentBid: 100,
      status: 'active',
      sellerId: 'user_seller_100',
      startTime: serverTimestamp(),
      endTime: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }),
    isPermissionDenied
  );
});

test('Arena Auctions 3: Auction creation with mismatched sellerId denied', async () => {
  const attackerDb = testEnv.authenticatedContext('user_attacker_999').firestore();
  await assert.rejects(
    () => attackerDb.collection('arena_auctions').doc('auc_forgery').set({
      title: 'Forgery Item',
      startingPrice: 100,
      currentBid: 100,
      status: 'active',
      sellerId: 'user_seller_100', // Mismatched! Auth UID is user_attacker_999
      startTime: serverTimestamp(),
      endTime: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }),
    isPermissionDenied
  );
});

test('Arena Auctions 4: Valid auction creation by authenticated seller allowed', async () => {
  const sellerDb = testEnv.authenticatedContext('user_seller_100').firestore();
  await assert.doesNotReject(
    () => sellerDb.collection('arena_auctions').doc('auc_valid').set({
      title: 'Valid Item',
      startingPrice: 100,
      currentBid: 100,
      status: 'active',
      sellerId: 'user_seller_100',
      startTime: serverTimestamp(),
      endTime: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      minIncrement: 10
    })
  );
});

test('Arena Auctions 5: Unauthorized modification of protected auction fields denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('arena_auctions').doc('auc_protected').set({
      title: 'Protected Item',
      startingPrice: 100,
      currentBid: 100,
      status: 'active',
      sellerId: 'user_seller_100',
      startTime: serverTimestamp(),
      endTime: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      minIncrement: 10
    });
  });

  const attackerDb = testEnv.authenticatedContext('user_attacker_999').firestore();
  await assert.rejects(
    () => attackerDb.collection('arena_auctions').doc('auc_protected').update({
      currentBid: 5000,
      highestBidderId: 'user_attacker_999'
    }),
    isPermissionDenied
  );
});

test('Arena Auctions 6: Valid incremental bid by non-seller bidder allowed', async () => {
  const futureTime = new Date(Date.now() + 3600 * 1000);
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('arena_auctions').doc('auc_bid').set({
      title: 'Biddable Item',
      startingPrice: 500,
      currentBid: 500,
      status: 'active',
      sellerId: 'user_seller_100',
      startTime: serverTimestamp(),
      endTime: futureTime,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      minIncrement: 50,
      bidsCount: 0,
      userBidCounts: {}
    });
  });

  const bidderDb = testEnv.authenticatedContext('user_bidder_200').firestore();
  await assert.doesNotReject(
    () => bidderDb.collection('arena_auctions').doc('auc_bid').update({
      currentBid: 550,
      highestBidderId: 'user_bidder_200',
      bidsCount: 1,
      userBidCounts: { user_bidder_200: 1 },
      updatedAt: serverTimestamp()
    })
  );
});

test('Arena Auctions 7: Seller self-bidding denied', async () => {
  const futureTime = new Date(Date.now() + 3600 * 1000);
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('arena_auctions').doc('auc_self').set({
      title: 'Self Bid Item',
      startingPrice: 500,
      currentBid: 500,
      status: 'active',
      sellerId: 'user_seller_100',
      startTime: serverTimestamp(),
      endTime: futureTime,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      minIncrement: 50,
      bidsCount: 0,
      userBidCounts: {}
    });
  });

  const sellerDb = testEnv.authenticatedContext('user_seller_100').firestore();
  await assert.rejects(
    () => sellerDb.collection('arena_auctions').doc('auc_self').update({
      currentBid: 550,
      highestBidderId: 'user_seller_100',
      bidsCount: 1,
      userBidCounts: { user_seller_100: 1 },
      updatedAt: serverTimestamp()
    }),
    isPermissionDenied
  );
});

test('Arena Auctions 8: Invalid terminal auction lifecycle transition (sold -> active) denied', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('arena_auctions').doc('auc_lifecycle').set({
      title: 'Lifecycle Item',
      startingPrice: 500,
      currentBid: 500,
      status: 'sold',
      sellerId: 'user_seller_100',
      startTime: serverTimestamp(),
      endTime: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  const sellerDb = testEnv.authenticatedContext('user_seller_100').firestore();
  await assert.rejects(
    () => sellerDb.collection('arena_auctions').doc('auc_lifecycle').update({
      status: 'active',
      updatedAt: serverTimestamp()
    }),
    isPermissionDenied
  );
});
