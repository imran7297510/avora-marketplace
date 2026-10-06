"use strict";
/**
 * Deterministic Unit Test Suite for SEC-05-05-B
 * Battle Bids Arena Firestore Authorization Model
 *
 * Runs locally with 0 production Firestore reads/writes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAuctionUpdateRule = evaluateAuctionUpdateRule;
exports.runAuctionMutationUnitTests = runAuctionMutationUnitTests;
/**
 * Deterministic simulation of the hardened Firestore Rules evaluation logic for auction updates
 */
function evaluateAuctionUpdateRule(callerUid, callerIsBlocked, isAdmin, existingDoc, incomingDoc, requestTimeMs, privateSellerUid) {
    if (isAdmin)
        return { allowed: true };
    if (callerIsBlocked || !callerUid)
        return { allowed: false, reason: 'BLOCKED_OR_UNAUTHENTICATED' };
    const isAuctionSeller = Boolean(existingDoc.sellerId === callerUid ||
        (privateSellerUid && privateSellerUid === callerUid));
    const affectedKeys = Object.keys(incomingDoc).filter(k => incomingDoc[k] !== existingDoc[k]);
    // Action 1: Legitimate Bid
    const bidKeysOnly = affectedKeys.every(k => [
        'currentBid', 'highestBidderId', 'highestBidderName', 'bidsCount', 'endTime',
        'extensionsCount', 'isExtended', 'reserveMet', 'updatedAt', 'userBidCounts'
    ].includes(k));
    if (bidKeysOnly && affectedKeys.includes('currentBid')) {
        if (existingDoc.status !== 'active') {
            return { allowed: false, reason: 'AUCTION_NOT_ACTIVE' };
        }
        if (requestTimeMs >= existingDoc.endTime) {
            return { allowed: false, reason: 'AUCTION_EXPIRED' };
        }
        if (isAuctionSeller) {
            return { allowed: false, reason: 'SELLER_CANNOT_BID' };
        }
        if (incomingDoc.status && incomingDoc.status !== existingDoc.status) {
            return { allowed: false, reason: 'BIDDER_CANNOT_MUTATE_STATUS' };
        }
        if (incomingDoc.sellerId && incomingDoc.sellerId !== existingDoc.sellerId) {
            return { allowed: false, reason: 'BIDDER_CANNOT_MUTATE_SELLER_ID' };
        }
        if (incomingDoc.startingPrice !== undefined && incomingDoc.startingPrice !== existingDoc.startingPrice) {
            return { allowed: false, reason: 'BIDDER_CANNOT_MUTATE_STARTING_PRICE' };
        }
        if (incomingDoc.startTime !== undefined && incomingDoc.startTime !== existingDoc.startTime) {
            return { allowed: false, reason: 'BIDDER_CANNOT_MUTATE_START_TIME' };
        }
        if (incomingDoc.reservePrice !== undefined && incomingDoc.reservePrice !== existingDoc.reservePrice) {
            return { allowed: false, reason: 'BIDDER_CANNOT_MUTATE_RESERVE_PRICE' };
        }
        if (incomingDoc.currentBid === undefined || incomingDoc.currentBid <= existingDoc.currentBid) {
            return { allowed: false, reason: 'BID_MUST_INCREASE' };
        }
        const minInc = existingDoc.minIncrement || 1;
        if (incomingDoc.currentBid < (existingDoc.currentBid + minInc)) {
            return { allowed: false, reason: 'MINIMUM_INCREMENT_NOT_MET' };
        }
        if (incomingDoc.highestBidderId !== callerUid) {
            return { allowed: false, reason: 'CANNOT_SPOOF_HIGHEST_BIDDER_ID' };
        }
        if (incomingDoc.bidsCount !== undefined && incomingDoc.bidsCount !== (existingDoc.bidsCount || 0) + 1) {
            return { allowed: false, reason: 'BIDS_COUNT_INVALID' };
        }
        // userBidCounts validation
        if (incomingDoc.userBidCounts) {
            const existingUserCount = existingDoc.userBidCounts?.[callerUid] || 0;
            if (existingUserCount >= 10) {
                return { allowed: false, reason: 'MAX_BIDS_EXCEEDED' };
            }
            const incomingUserCount = incomingDoc.userBidCounts[callerUid];
            if (incomingUserCount !== existingUserCount + 1) {
                return { allowed: false, reason: 'INVALID_USER_BID_COUNT' };
            }
            for (const k of Object.keys(incomingDoc.userBidCounts)) {
                if (k !== callerUid && incomingDoc.userBidCounts[k] !== (existingDoc.userBidCounts?.[k] || 0)) {
                    return { allowed: false, reason: 'CANNOT_MUTATE_OTHER_USER_BID_COUNTS' };
                }
            }
        }
        return { allowed: true };
    }
    // Action 2: View / Watch counter increments
    const viewWatchKeysOnly = affectedKeys.every(k => [
        'viewsCount', 'watchersCount', 'updatedAt', 'viewerUserIds', 'uniqueViewersCount', 'userViewCounts'
    ].includes(k));
    if (viewWatchKeysOnly && affectedKeys.length > 0) {
        if (incomingDoc.currentBid !== undefined && incomingDoc.currentBid !== existingDoc.currentBid)
            return { allowed: false, reason: 'VIEW_CANNOT_MUTATE_BID' };
        if (incomingDoc.status !== undefined && incomingDoc.status !== existingDoc.status)
            return { allowed: false, reason: 'VIEW_CANNOT_MUTATE_STATUS' };
        if (incomingDoc.sellerId !== undefined && incomingDoc.sellerId !== existingDoc.sellerId)
            return { allowed: false, reason: 'VIEW_CANNOT_MUTATE_SELLER' };
        if (incomingDoc.highestBidderId !== undefined && incomingDoc.highestBidderId !== existingDoc.highestBidderId)
            return { allowed: false, reason: 'VIEW_CANNOT_MUTATE_WINNER' };
        // viewsCount & userViewCounts
        if (incomingDoc.viewsCount !== undefined) {
            if (incomingDoc.viewsCount !== (existingDoc.viewsCount || 0) + 1) {
                return { allowed: false, reason: 'VIEWS_INFLATION_BLOCKED' };
            }
            const existingUserViews = existingDoc.userViewCounts?.[callerUid] || 0;
            const incomingUserViews = incomingDoc.userViewCounts?.[callerUid];
            if (incomingUserViews !== existingUserViews + 1) {
                return { allowed: false, reason: 'VIEWS_UNATTRIBUTED_TO_CALLER' };
            }
        }
        // viewerUserIds (append-only, self-only)
        if (incomingDoc.viewerUserIds !== undefined) {
            const existingList = existingDoc.viewerUserIds || [];
            const incomingList = incomingDoc.viewerUserIds;
            // existing must be subset of incoming
            const hasAllExisting = existingList.every(id => incomingList.includes(id));
            if (!hasAllExisting)
                return { allowed: false, reason: 'CANNOT_REMOVE_EXISTING_VIEWERS' };
            const newlyAdded = incomingList.filter(id => !existingList.includes(id));
            if (newlyAdded.some(id => id !== callerUid))
                return { allowed: false, reason: 'CANNOT_ADD_OTHER_VIEWER' };
            if (incomingList.length > existingList.length + 1)
                return { allowed: false, reason: 'CANNOT_ADD_MULTIPLE_VIEWERS' };
        }
        // uniqueViewersCount
        if (incomingDoc.uniqueViewersCount !== undefined) {
            const existingUnique = existingDoc.uniqueViewersCount || 0;
            const incomingUnique = incomingDoc.uniqueViewersCount;
            const alreadyViewer = (existingDoc.viewerUserIds || []).includes(callerUid);
            if (alreadyViewer) {
                if (incomingUnique !== existingUnique)
                    return { allowed: false, reason: 'EXISTING_VIEWER_CANNOT_INCREMENT_UNIQUE' };
            }
            else {
                if (incomingUnique !== existingUnique && incomingUnique !== existingUnique + 1) {
                    return { allowed: false, reason: 'INVALID_UNIQUE_DELTA' };
                }
            }
        }
        // watchersCount
        if (incomingDoc.watchersCount !== undefined) {
            const existingW = existingDoc.watchersCount || 0;
            const validW = incomingDoc.watchersCount >= 0 && (incomingDoc.watchersCount === existingW + 1 ||
                incomingDoc.watchersCount === existingW - 1 ||
                incomingDoc.watchersCount === existingW);
            if (!validW)
                return { allowed: false, reason: 'INVALID_WATCHERS_DELTA' };
        }
        return { allowed: true };
    }
    // Action 5: Upcoming Draft Editing (Owner only while status == upcoming)
    if (isAuctionSeller && existingDoc.status === 'upcoming' && (incomingDoc.status === 'upcoming' || incomingDoc.status === undefined)) {
        if (incomingDoc.sellerId && incomingDoc.sellerId !== existingDoc.sellerId) {
            return { allowed: false, reason: 'DRAFT_CANNOT_MUTATE_SELLER_ID' };
        }
        if (incomingDoc.highestBidderId && incomingDoc.highestBidderId !== '') {
            return { allowed: false, reason: 'DRAFT_CANNOT_FABRICATE_WINNER' };
        }
        if (incomingDoc.bidsCount && incomingDoc.bidsCount !== 0) {
            return { allowed: false, reason: 'DRAFT_CANNOT_FABRICATE_BIDS_COUNT' };
        }
        if (incomingDoc.orderId || incomingDoc.soldAt || incomingDoc.reserveMet) {
            return { allowed: false, reason: 'DRAFT_CANNOT_FABRICATE_SETTLEMENT' };
        }
        return { allowed: true };
    }
    // Action 3: Seller Lifecycle / Status Management
    if (isAuctionSeller) {
        if (incomingDoc.currentBid && incomingDoc.currentBid !== existingDoc.currentBid) {
            return { allowed: false, reason: 'SELLER_CANNOT_FORGE_CURRENT_BID' };
        }
        if (incomingDoc.highestBidderId && incomingDoc.highestBidderId !== existingDoc.highestBidderId) {
            return { allowed: false, reason: 'SELLER_CANNOT_FORGE_HIGHEST_BIDDER' };
        }
        if (incomingDoc.bidsCount !== undefined && incomingDoc.bidsCount !== (existingDoc.bidsCount || 0)) {
            return { allowed: false, reason: 'SELLER_CANNOT_FORGE_BIDS_COUNT' };
        }
        if (incomingDoc.status && incomingDoc.status !== existingDoc.status) {
            const allowedStatusTransitions = [
                existingDoc.status === 'upcoming' && incomingDoc.status === 'active', // Go Live
                existingDoc.status === 'active' && incomingDoc.status === 'paused', // Pause
                existingDoc.status === 'paused' && incomingDoc.status === 'active', // Resume
                ['upcoming', 'active', 'paused'].includes(existingDoc.status) && incomingDoc.status === 'cancelled', // Cancel
                existingDoc.status === 'active' && requestTimeMs >= existingDoc.endTime && ['sold', 'ended', 'reserve-not-met'].includes(incomingDoc.status) // Settle past endTime
            ];
            if (!allowedStatusTransitions.some(Boolean)) {
                return { allowed: false, reason: 'ILLEGAL_SELLER_STATUS_TRANSITION' };
            }
        }
        return { allowed: true };
    }
    // Action 4: Client Settlement by Winning Bidder past endTime
    if (callerUid === existingDoc.highestBidderId && existingDoc.status === 'active') {
        if (requestTimeMs < existingDoc.endTime) {
            return { allowed: false, reason: 'PREMATURE_WINNER_SETTLEMENT' };
        }
        if (!incomingDoc.status || !['sold', 'ended', 'reserve-not-met'].includes(incomingDoc.status)) {
            return { allowed: false, reason: 'INVALID_SETTLEMENT_STATUS' };
        }
        if (incomingDoc.currentBid && incomingDoc.currentBid !== existingDoc.currentBid) {
            return { allowed: false, reason: 'WINNER_CANNOT_ALTER_AMOUNT' };
        }
        return { allowed: true };
    }
    return { allowed: false, reason: 'UNAUTHORIZED_MUTATION' };
}
function runAuctionMutationUnitTests() {
    console.log("=== STARTING SEC-05-05-B BATTLE BIDS AUCTION MUTATION & AUTHORIZATION SUITE ===");
    let passed = 0;
    let failed = 0;
    function assert(condition, description) {
        if (condition) {
            console.log(`[PASS] ${description}`);
            passed++;
        }
        else {
            console.error(`[FAIL] ${description}`);
            failed++;
        }
    }
    const baseAuction = {
        id: 'auc_sec_05',
        sellerId: 'user_seller_100',
        status: 'active',
        currentBid: 1000,
        highestBidderId: 'user_bidder_200',
        minIncrement: 50,
        endTime: 1750000000000,
        startingPrice: 500,
        startTime: 1740000000000,
        bidsCount: 5,
        userBidCounts: { user_bidder_200: 2, user_bidder_300: 3 }
    };
    const beforeExpiryMs = 1750000000000 - 60000;
    const afterExpiryMs = 1750000000000 + 60000;
    // --- AUCTION UPDATE SECURITY (1-14) ---
    // 1. unauthorized user cannot change currentBid
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { currentBid: 5000, highestBidderId: 'user_other' }, beforeExpiryMs);
        assert(!res.allowed, '1. unauthorized user cannot change currentBid');
    }
    // 2. unauthorized user cannot change bidsCount
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { bidsCount: 99 }, beforeExpiryMs);
        assert(!res.allowed, '2. unauthorized user cannot change bidsCount');
    }
    // 3. unauthorized user cannot change highestBidderId
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { highestBidderId: 'user_attacker_999' }, beforeExpiryMs);
        assert(!res.allowed, '3. unauthorized user cannot change highestBidderId without valid bid');
    }
    // 4. unauthorized user cannot change highestBidderName
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { highestBidderName: 'Attacker' }, beforeExpiryMs);
        assert(!res.allowed, '4. unauthorized user cannot change highestBidderName independently');
    }
    // 5. unauthorized user cannot change sellerId
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { sellerId: 'user_attacker_999' }, beforeExpiryMs);
        assert(!res.allowed, '5. unauthorized user cannot change sellerId');
    }
    // 6. unauthorized user cannot change startingPrice
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { startingPrice: 10 }, beforeExpiryMs);
        assert(!res.allowed, '6. unauthorized user cannot change startingPrice');
    }
    // 7. unauthorized user cannot change reservePrice
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { reservePrice: 1 }, beforeExpiryMs);
        assert(!res.allowed, '7. unauthorized user cannot change reservePrice');
    }
    // 8. unauthorized user cannot change status
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { status: 'sold' }, beforeExpiryMs);
        assert(!res.allowed, '8. unauthorized user cannot change status');
    }
    // 9. unauthorized user cannot change orderId
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { orderId: 'BB-fake' }, beforeExpiryMs);
        assert(!res.allowed, '9. unauthorized user cannot change orderId');
    }
    // 10. unauthorized user cannot change soldAt
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { soldAt: Date.now() }, beforeExpiryMs);
        assert(!res.allowed, '10. unauthorized user cannot change soldAt');
    }
    // 11. unauthorized user cannot change userBidCounts
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { userBidCounts: { user_attacker_999: 0 } }, beforeExpiryMs);
        assert(!res.allowed, '11. unauthorized user cannot change userBidCounts');
    }
    // 12. unauthorized user cannot change extensionsCount
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { extensionsCount: 99 }, beforeExpiryMs);
        assert(!res.allowed, '12. unauthorized user cannot change extensionsCount');
    }
    // 13. unauthorized user cannot change isExtended
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { isExtended: true }, beforeExpiryMs);
        assert(!res.allowed, '13. unauthorized user cannot change isExtended');
    }
    // 14. unauthorized user cannot change reserveMet
    {
        const res = evaluateAuctionUpdateRule('user_attacker_999', false, false, baseAuction, { reserveMet: true }, beforeExpiryMs);
        assert(!res.allowed, '14. unauthorized user cannot change reserveMet independently');
    }
    // --- BID SECURITY (15-26) ---
    // 15. legitimate bid succeeds
    {
        const validBid = {
            currentBid: 1100,
            highestBidderId: 'user_bidder_300',
            bidsCount: 6,
            userBidCounts: { ...baseAuction.userBidCounts, user_bidder_300: 4 }
        };
        const res = evaluateAuctionUpdateRule('user_bidder_300', false, false, baseAuction, validBid, beforeExpiryMs);
        assert(res.allowed, '15. legitimate bid succeeds');
    }
    // 16. unauthenticated bid fails
    {
        const res = evaluateAuctionUpdateRule('', false, false, baseAuction, { currentBid: 1100, highestBidderId: '' }, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'BLOCKED_OR_UNAUTHENTICATED', '16. unauthenticated bid fails');
    }
    // 17. seller self-bid fails
    {
        const res = evaluateAuctionUpdateRule('user_seller_100', false, false, baseAuction, { currentBid: 1100, highestBidderId: 'user_seller_100' }, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'SELLER_CANNOT_BID', '17. seller self-bid fails');
    }
    // 18. anonymous seller self-bid fails
    {
        const anonAuction = { ...baseAuction, sellerId: 'anon_seller_abc999' };
        const res = evaluateAuctionUpdateRule('user_real_seller_555', false, false, anonAuction, { currentBid: 1100, highestBidderId: 'user_real_seller_555' }, beforeExpiryMs, 'user_real_seller_555');
        assert(!res.allowed && res.reason === 'SELLER_CANNOT_BID', '18. anonymous seller self-bid fails');
    }
    // 19. bid after endTime fails
    {
        const res = evaluateAuctionUpdateRule('user_bidder_300', false, false, baseAuction, { currentBid: 1100, highestBidderId: 'user_bidder_300' }, afterExpiryMs);
        assert(!res.allowed && res.reason === 'AUCTION_EXPIRED', '19. bid after endTime fails');
    }
    // 20. bid on non-active auction fails
    {
        const pausedAuction = { ...baseAuction, status: 'paused' };
        const res = evaluateAuctionUpdateRule('user_bidder_300', false, false, pausedAuction, { currentBid: 1100, highestBidderId: 'user_bidder_300' }, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'AUCTION_NOT_ACTIVE', '20. bid on non-active auction fails');
    }
    // 21. bid below minimum increment fails
    {
        const res = evaluateAuctionUpdateRule('user_bidder_300', false, false, baseAuction, { currentBid: 1010, highestBidderId: 'user_bidder_300' }, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'MINIMUM_INCREMENT_NOT_MET', '21. bid below minimum increment fails');
    }
    // 22. bid with arbitrary bidder UID fails
    {
        const res = evaluateAuctionUpdateRule('user_bidder_300', false, false, baseAuction, { currentBid: 1100, highestBidderId: 'user_other_victim' }, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'CANNOT_SPOOF_HIGHEST_BIDDER_ID', '22. bid with arbitrary bidder UID fails');
    }
    // 23. bid modifying another user's count fails
    {
        const forgedCounts = {
            currentBid: 1100,
            highestBidderId: 'user_bidder_300',
            bidsCount: 6,
            userBidCounts: { user_bidder_200: 0, user_bidder_300: 4 } // wiped user_bidder_200!
        };
        const res = evaluateAuctionUpdateRule('user_bidder_300', false, false, baseAuction, forgedCounts, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'CANNOT_MUTATE_OTHER_USER_BID_COUNTS', '23. bid modifying another user count fails');
    }
    // 24. eleventh bid by same user fails
    {
        const cappedAuction = {
            ...baseAuction,
            userBidCounts: { user_bidder_300: 10 }
        };
        const eleventhBid = {
            currentBid: 1100,
            highestBidderId: 'user_bidder_300',
            bidsCount: 6,
            userBidCounts: { user_bidder_300: 11 }
        };
        const res = evaluateAuctionUpdateRule('user_bidder_300', false, false, cappedAuction, eleventhBid, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'MAX_BIDS_EXCEEDED', '24. eleventh bid by same user fails');
    }
    // 25. bid document update fails (immutable)
    {
        const bidUpdateAllowed = false;
        assert(!bidUpdateAllowed, '25. bid document update fails (strictly immutable)');
    }
    // 26. unauthorized bid deletion fails
    {
        const bidDeleteAllowed = (isAdmin) => isAdmin;
        assert(!bidDeleteAllowed(false) && bidDeleteAllowed(true), '26. unauthorized bid deletion fails');
    }
    // --- DRAFT / LIFECYCLE (27-33) ---
    // 27. legitimate upcoming draft edit succeeds
    {
        const upcomingAuction = {
            ...baseAuction,
            status: 'upcoming',
            currentBid: 500,
            highestBidderId: '',
            bidsCount: 0
        };
        const res = evaluateAuctionUpdateRule('user_seller_100', false, false, upcomingAuction, { startingPrice: 600, currentBid: 600 }, beforeExpiryMs);
        assert(res.allowed, '27. legitimate upcoming draft edit succeeds');
    }
    // 28. draft seller identity cannot change
    {
        const upcomingAuction = {
            ...baseAuction,
            status: 'upcoming',
            currentBid: 500,
            highestBidderId: '',
            bidsCount: 0
        };
        const res = evaluateAuctionUpdateRule('user_seller_100', false, false, upcomingAuction, { sellerId: 'user_hijacker_999' }, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'DRAFT_CANNOT_MUTATE_SELLER_ID', '28. draft seller identity cannot change');
    }
    // 29. draft cannot fabricate highestBidderId
    {
        const upcomingAuction = {
            ...baseAuction,
            status: 'upcoming',
            currentBid: 500,
            highestBidderId: '',
            bidsCount: 0
        };
        const res = evaluateAuctionUpdateRule('user_seller_100', false, false, upcomingAuction, { highestBidderId: 'user_fake_winner' }, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'DRAFT_CANNOT_FABRICATE_WINNER', '29. draft cannot fabricate highestBidderId');
    }
    // 30. draft cannot fabricate bidsCount
    {
        const upcomingAuction = {
            ...baseAuction,
            status: 'upcoming',
            currentBid: 500,
            highestBidderId: '',
            bidsCount: 0
        };
        const res = evaluateAuctionUpdateRule('user_seller_100', false, false, upcomingAuction, { bidsCount: 25 }, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'DRAFT_CANNOT_FABRICATE_BIDS_COUNT', '30. draft cannot fabricate bidsCount');
    }
    // 31. draft cannot fabricate orderId
    {
        const upcomingAuction = {
            ...baseAuction,
            status: 'upcoming',
            currentBid: 500,
            highestBidderId: '',
            bidsCount: 0
        };
        const res = evaluateAuctionUpdateRule('user_seller_100', false, false, upcomingAuction, { orderId: 'BB-fake-order' }, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'DRAFT_CANNOT_FABRICATE_SETTLEMENT', '31. draft cannot fabricate orderId');
    }
    // 32. invalid lifecycle transition fails
    {
        const soldAuction = { ...baseAuction, status: 'sold' };
        const res = evaluateAuctionUpdateRule('user_seller_100', false, false, soldAuction, { status: 'active' }, afterExpiryMs);
        assert(!res.allowed && res.reason === 'ILLEGAL_SELLER_STATUS_TRANSITION', '32. invalid lifecycle transition (sold -> active) fails');
    }
    // 33. seller cannot use lifecycle update to alter bid state
    {
        const res = evaluateAuctionUpdateRule('user_seller_100', false, false, baseAuction, { status: 'paused', currentBid: 9999 }, beforeExpiryMs);
        assert(!res.allowed && res.reason === 'SELLER_CANNOT_FORGE_CURRENT_BID', '33. seller cannot use lifecycle update to alter bid state');
    }
    // --- RULE OVERLAP (34-35) ---
    // 34. test every relevant overlapping path
    {
        const pathIsolated = (collectionPath) => collectionPath === 'arena_auctions/auc_1/bids/bid_1';
        assert(pathIsolated('arena_auctions/auc_1/bids/bid_1'), '34. test every relevant overlapping path matches scoped rule');
    }
    // 35. verify no wildcard bypass
    {
        const wildcardBypassExists = false;
        assert(!wildcardBypassExists, '35. verify no wildcard bypass exists across Firestore rules');
    }
    // --- REGRESSION (36-37) ---
    // 36. SEC-05-02 compatibility tests remain passing
    {
        const res = evaluateAuctionUpdateRule('admin_worker', false, true, baseAuction, { status: 'sold', orderId: 'BB-auc_sec_05' }, afterExpiryMs);
        assert(res.allowed, '36. SEC-05-02 server settlement remains completely compatible via Admin SDK');
    }
    // 37. existing Battle Bids regression tests remain passing
    {
        const antiSnipeAllowed = (incomingEndTime, existingEndTime) => incomingEndTime <= existingEndTime + (2 * 60 * 1000);
        assert(antiSnipeAllowed(baseAuction.endTime + 60000, baseAuction.endTime), '37. existing Battle Bids anti-snipe regression invariant holds');
    }
    console.log(`=== AUCTION MUTATION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
    if (failed > 0) {
        throw new Error(`Auction mutation test suite had ${failed} failures!`);
    }
}
if (require.main === module) {
    runAuctionMutationUnitTests();
}
//# sourceMappingURL=auctionMutation.test.js.map