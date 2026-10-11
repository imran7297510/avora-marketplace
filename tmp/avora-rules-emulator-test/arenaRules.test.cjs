const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const fs = require('fs');
const admin = require('firebase-admin');

async function runEmulatorTests() {
  console.log("=== STARTING REAL FIRESTORE RULES EMULATOR VERIFICATION FOR ARENA AUCTIONS ===");

  const rules = fs.readFileSync('/app/applet/firestore.rules', 'utf8');

  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-avora-rules-audit',
    firestore: {
      host: '127.0.0.1',
      port: 8088,
      rules: rules
    }
  });

  let passed = 0;
  let failed = 0;

  function assertResult(success, desc) {
    if (success) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    await testEnv.clearFirestore();

    const dbUnauth = testEnv.unauthenticatedContext().firestore();
    const dbAttacker = testEnv.authenticatedContext('user_attacker_999').firestore();
    const dbSeller = testEnv.authenticatedContext('user_seller_100').firestore();
    const dbBidder = testEnv.authenticatedContext('user_bidder_200').firestore();

    const now = Date.now();
    const future = now + 3600 * 1000;

    const validAuctionData = {
      title: 'Rare Gaming GPU Auction',
      startingPrice: 500,
      currentBid: 500,
      status: 'active',
      sellerId: 'user_seller_100',
      startTime: admin.firestore.Timestamp.fromMillis(now - 10000),
      endTime: admin.firestore.Timestamp.fromMillis(future),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      minIncrement: 50
    };

    // 1. Unauthenticated read should succeed
    try {
      await assertSucceeds(dbUnauth.doc('arena_auctions/auc_test_1').get());
      assertResult(true, '1. Unauthenticated read allowed');
    } catch (e) {
      assertResult(false, '1. Unauthenticated read allowed: ' + e.message);
    }

    // 2. Unauthenticated write should fail
    try {
      await assertFails(dbUnauth.doc('arena_auctions/auc_test_1').set(validAuctionData));
      assertResult(true, '2. Unauthenticated write denied');
    } catch (e) {
      assertResult(false, '2. Unauthenticated write denied: ' + e.message);
    }

    // 3. Unauthorized creation by attacker should fail
    try {
      await assertFails(dbAttacker.doc('arena_auctions/auc_test_1').set({
        ...validAuctionData,
        sellerId: 'user_seller_100'
      }));
      assertResult(true, '3. Unauthorized creation by attacker denied');
    } catch (e) {
      assertResult(false, '3. Unauthorized creation by attacker denied: ' + e.message);
    }

    // 4. Legitimate owner creation should succeed
    try {
      await assertSucceeds(dbSeller.doc('arena_auctions/auc_test_1').set(validAuctionData));
      assertResult(true, '4. Legitimate owner creation succeeded');
    } catch (e) {
      assertResult(false, '4. Legitimate owner creation succeeded: ' + e.message);
    }

    // 5. Unauthorized update of protected fields by attacker should fail
    try {
      await assertFails(dbAttacker.doc('arena_auctions/auc_test_1').update({
        currentBid: 5000,
        highestBidderId: 'user_attacker_999'
      }));
      assertResult(true, '5. Unauthorized update of protected fields denied');
    } catch (e) {
      assertResult(false, '5. Unauthorized update of protected fields denied: ' + e.message);
    }

    // 6. Legitimate bid by non-seller bidder on active auction should succeed
    try {
      await dbSeller.doc('arena_auctions/auc_bid_test').set(validAuctionData);
      await assertSucceeds(dbBidder.doc('arena_auctions/auc_bid_test').update({
        currentBid: 550,
        highestBidderId: 'user_bidder_200',
        bidsCount: 1,
        userBidCounts: { user_bidder_200: 1 },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }));
      assertResult(true, '6. Legitimate bid by bidder succeeded');
    } catch (e) {
      assertResult(false, '6. Legitimate bid by bidder succeeded: ' + e.message);
    }

    // 7. Seller self-bidding should fail
    try {
      await dbSeller.doc('arena_auctions/auc_self_bid').set(validAuctionData);
      await assertFails(dbSeller.doc('arena_auctions/auc_self_bid').update({
        currentBid: 550,
        highestBidderId: 'user_seller_100',
        bidsCount: 1,
        userBidCounts: { user_seller_100: 1 },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }));
      assertResult(true, '7. Seller self-bidding denied');
    } catch (e) {
      assertResult(false, '7. Seller self-bid denied: ' + e.message);
    }

    // 8. Invalid lifecycle transition (sold -> active by seller) should fail
    try {
      const soldAuctionData = { ...validAuctionData, status: 'sold' };
      await dbSeller.doc('arena_auctions/auc_lifecycle').set(soldAuctionData);
      await assertFails(dbSeller.doc('arena_auctions/auc_lifecycle').update({
        status: 'active',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }));
      assertResult(true, '8. Invalid seller lifecycle transition denied');
    } catch (e) {
      assertResult(false, '8. Invalid seller lifecycle transition denied: ' + e.message);
    }

  } finally {
    await testEnv.cleanup();
  }

  console.log(`=== EMULATOR TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runEmulatorTests().catch(err => {
  console.error("Emulator test suite error:", err);
  process.exit(1);
});
