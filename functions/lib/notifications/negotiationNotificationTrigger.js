"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNegotiationUpdatedTrigger = exports.onNegotiationOfferCreatedTrigger = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_2.getFirestore)();
/**
 * Resolves the authoritative real seller Firebase Auth UID from the private subcollection.
 * Returns null if the listing is not private, missing, malformed, or a simulated account.
 */
async function resolvePrivateSellerUid(auctionId) {
    if (!auctionId)
        return null;
    try {
        const privDoc = await db
            .collection('arena_auctions')
            .doc(auctionId)
            .collection('private')
            .doc('seller')
            .get();
        if (!privDoc.exists) {
            console.warn(`[DEF-03] private/seller subcollection document missing for auction: ${auctionId}`);
            return null;
        }
        const sellerUid = privDoc.data()?.sellerUid;
        if (!sellerUid ||
            typeof sellerUid !== 'string' ||
            sellerUid.startsWith('anon_seller_') ||
            sellerUid.startsWith('simulator_') ||
            sellerUid === 'simulated-seller') {
            console.warn(`[DEF-03] Invalid or non-real sellerUid for auction: ${auctionId}`);
            return null;
        }
        return sellerUid;
    }
    catch (err) {
        console.error(`[DEF-03] Error reading private/seller for auction ${auctionId}:`, err);
        return null;
    }
}
/**
 * Idempotently writes a seller notification to both the user's notification subcollection
 * and the global notifications collection using a deterministic document ID.
 */
async function deliverSellerNotification(sellerUid, notifId, payload) {
    const userNotifRef = db
        .collection('users')
        .doc(sellerUid)
        .collection('notifications')
        .doc(notifId);
    const existingDoc = await userNotifRef.get();
    if (existingDoc.exists) {
        // Already delivered idempotently, avoid mutating isRead or timestamps
        return;
    }
    const notificationBody = {
        id: notifId,
        userId: sellerUid,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link,
        auctionId: payload.auctionId,
        isRead: false,
        timestamp: firestore_2.FieldValue.serverTimestamp()
    };
    await userNotifRef.set(notificationBody, { merge: true });
    // Also write to root notifications for global header bell synchronization
    const rootNotifRef = db.collection('notifications').doc(notifId);
    await rootNotifRef.set({
        id: notifId,
        userId: sellerUid,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link,
        auctionId: payload.auctionId,
        read: false,
        isRead: false,
        timestamp: firestore_2.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[DEF-03] Delivered notification ${notifId} to real seller for auction ${payload.auctionId}`);
}
/**
 * Trigger A: Fires when a new offer, counter-offer, message, acceptance, decline, contact request,
 * completion, or withdrawal document is created in arena_negotiations/{negId}/offers/{offerId}.
 *
 * CRIT-01 & MED-01 & HIGH-02 & W-01: Actor origin is explicitly validated via offerData.senderId === buyerId.
 * This guarantees the seller is NEVER notified about an action performed by the seller themselves,
 * and listing deletion by seller/admin never generates a withdrawal notification.
 */
exports.onNegotiationOfferCreatedTrigger = (0, firestore_1.onDocumentCreated)('arena_negotiations/{negId}/offers/{offerId}', async (event) => {
    const offerData = event.data?.data();
    if (!offerData)
        return;
    const negId = event.params.negId;
    const offerId = event.params.offerId;
    try {
        const negDoc = await db.collection('arena_negotiations').doc(negId).get();
        const negData = negDoc.exists ? negDoc.data() : null;
        // Extract metadata from parent document if present, or fall back to offerData fields if parent was deleted (e.g. withdrawal)
        const buyerId = negData?.buyerId || offerData.buyerId;
        const sellerId = negData?.sellerId || offerData.sellerId;
        const isNegotiationOnly = negData?.isNegotiationOnly ?? offerData.isNegotiationOnly;
        const auctionId = negData?.auctionId || offerData.auctionId;
        if (!buyerId || !sellerId || !auctionId) {
            return;
        }
        // CRIT-01 & W-01: ONLY notify seller when the event was originated by the BUYER
        if (offerData.senderId !== buyerId) {
            return;
        }
        // Check if this is a Private Negotiation (pseudonymous sellerId)
        const isPrivate = sellerId.startsWith('anon_seller_') ||
            isNegotiationOnly === true;
        if (!isPrivate) {
            // Normal Battle Bids continue using existing client-side or standard routing
            return;
        }
        const realSellerUid = await resolvePrivateSellerUid(auctionId);
        if (!realSellerUid)
            return;
        // Prevent sending notifications to oneself if caller is the seller
        if (realSellerUid === offerData.senderId)
            return;
        // Determine currency formatting
        const currencySymbol = negData?.currencySymbol || offerData.currencySymbol || '$';
        const amount = typeof offerData.amount === 'number' ? offerData.amount : 0;
        const action = offerData.action || 'send';
        let notifId;
        let title;
        let message;
        let type = 'private_offer';
        if (action === 'send') {
            // EV-01: Initial buyer proposal
            notifId = `neg_offer_${negId}_${offerId}`;
            title = 'New Tactical Proposal';
            message = `A buyer has sent a private offer of ${currencySymbol}${amount.toLocaleString()} for your asset.`;
            type = 'private_offer';
        }
        else if (action === 'counter') {
            // EV-03: Buyer counter-offer
            notifId = `neg_offer_${negId}_${offerId}`;
            title = 'Tactical Counter-Offer';
            message = `The buyer has proposed a counter-offer of ${currencySymbol}${amount.toLocaleString()}.`;
            type = 'private_offer';
        }
        else if (action === 'message') {
            // EV-11: Buyer private message
            notifId = `neg_msg_${negId}_${offerId}`;
            title = 'New Tactical Message';
            message = offerData.message
                ? `Buyer: "${offerData.message.length > 60 ? offerData.message.substring(0, 57) + '...' : offerData.message}"`
                : 'You received a new message in your private negotiation.';
            type = 'private_message';
        }
        else if (action === 'request_contact') {
            // EV-09 / MED-01: Buyer requests seller contact details (sole authoritative trigger)
            notifId = `neg_contact_req_${negId}_${offerId}`;
            title = 'Contact Information Requested';
            message = 'The buyer has requested your contact details to complete the transaction.';
            type = 'contact_requested';
        }
        else if (action === 'accept') {
            // EV-05 / CRIT-01: Buyer accepts seller's counter-offer
            notifId = `neg_accept_${negId}_${offerId}`;
            title = 'Proposal Accepted';
            message = 'The buyer has accepted your tactical proposal.';
            type = 'offer_accepted';
        }
        else if (action === 'decline') {
            // EV-07 / CRIT-01: Buyer declines seller's counter-offer
            notifId = `neg_decline_${negId}_${offerId}`;
            title = 'Proposal Declined';
            message = 'The buyer has declined the tactical proposal.';
            type = 'private_offer';
        }
        else if (action === 'complete') {
            // EV-13 / HIGH-02: Buyer completes deal
            notifId = `neg_concluded_${negId}_${offerId}`;
            title = 'Deal Complete: Contact Details';
            message = 'Deal completed! You can contact the buyer via their profile details.';
            type = 'auction_won';
        }
        else if (action === 'withdraw') {
            // EV-08 / W-01: Buyer withdraws active proposal
            notifId = `neg_withdraw_${negId}_${offerId}`;
            title = 'Submitted Offer Withdrawn';
            message = 'A submitted offer has been withdrawn and permanently removed by the buyer.';
            type = 'private_offer';
        }
        else {
            // Unknown or unsupported action
            return;
        }
        await deliverSellerNotification(realSellerUid, notifId, {
            type,
            title,
            message,
            link: `/negotiations/timeline/${negId}`,
            auctionId
        });
    }
    catch (err) {
        console.error(`[DEF-03] Error processing offer creation trigger for neg ${negId}:`, err);
    }
});
/**
 * Trigger B: Fires when a negotiation document in arena_negotiations/{negId} is updated.
 * Maintained for schema compatibility. Does not emit status-change notifications without actor verification.
 */
exports.onNegotiationUpdatedTrigger = (0, firestore_1.onDocumentUpdated)('arena_negotiations/{negId}', async (_event) => {
    // Intentionally no-op for actor-sensitive transitions (accept/decline/complete/contactRequest),
    // which are authoritatively and actor-safely handled by onNegotiationOfferCreatedTrigger.
});
//# sourceMappingURL=negotiationNotificationTrigger.js.map