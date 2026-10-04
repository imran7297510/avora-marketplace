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
 * Idempotently writes a notification to both the recipient's notification subcollection
 * and the global notifications collection using a deterministic document ID.
 */
async function deliverSellerNotification(recipientUid, notifId, payload) {
    const userNotifRef = db
        .collection('users')
        .doc(recipientUid)
        .collection('notifications')
        .doc(notifId);
    const existingDoc = await userNotifRef.get();
    if (existingDoc.exists) {
        // Already delivered idempotently, avoid mutating isRead or timestamps
        return;
    }
    const notificationBody = {
        id: notifId,
        userId: recipientUid,
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
        userId: recipientUid,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: payload.link,
        auctionId: payload.auctionId,
        read: false,
        isRead: false,
        timestamp: firestore_2.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[DEF-03] Delivered notification ${notifId} to user ${recipientUid} for auction ${payload.auctionId}`);
}
/**
 * Trigger A: Fires when a new offer, counter-offer, message, acceptance, decline, contact request,
 * contact share, completion, or withdrawal document is created in arena_negotiations/{negId}/offers/{offerId}.
 *
 * Handles contact requests and contact sharing for both public and private negotiations,
 * and private proposal events for private negotiations.
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
        // Extract metadata from parent document if present, or fall back to offerData fields if parent was deleted
        const buyerId = negData?.buyerId || offerData.buyerId;
        const sellerId = negData?.sellerId || offerData.sellerId;
        const isNegotiationOnly = negData?.isNegotiationOnly ?? offerData.isNegotiationOnly;
        const auctionId = negData?.auctionId || offerData.auctionId;
        if (!buyerId || !sellerId || !auctionId) {
            return;
        }
        const action = offerData.action || 'send';
        // Check if this is a Private Negotiation (pseudonymous sellerId)
        const isPrivate = sellerId.startsWith('anon_seller_') ||
            isNegotiationOnly === true;
        const isContactAction = action === 'request_contact' || action === 'share_contact';
        // Non-private negotiations only process contact actions; private negotiations process all actions.
        if (!isPrivate && !isContactAction) {
            return;
        }
        const currencySymbol = negData?.currencySymbol || offerData.currencySymbol || '$';
        const amount = typeof offerData.amount === 'number' ? offerData.amount : 0;
        let recipientUid = null;
        let notifId;
        let title;
        let message;
        let type;
        if (action === 'request_contact') {
            // EV-09 / SEC-NEXT-02: Buyer requests seller contact details
            if (offerData.senderId !== buyerId)
                return;
            if (isPrivate) {
                recipientUid = await resolvePrivateSellerUid(auctionId);
            }
            else {
                recipientUid = sellerId;
            }
            if (!recipientUid || recipientUid.startsWith('simulated-') || recipientUid.startsWith('anon_seller_'))
                return;
            notifId = `neg_contact_req_${negId}_${offerId}`;
            title = 'Contact Information Requested';
            message = 'The buyer has requested your contact details to complete the transaction.';
            type = 'contact_requested';
        }
        else if (action === 'share_contact') {
            // SEC-NEXT-02-A-01: Authoritative seller sender validation
            let isAuthoritativeSellerSender = false;
            if (isPrivate) {
                const realSellerUid = await resolvePrivateSellerUid(auctionId);
                isAuthoritativeSellerSender = Boolean((sellerId && offerData.senderId === sellerId) ||
                    (realSellerUid && offerData.senderId === realSellerUid));
            }
            else {
                isAuthoritativeSellerSender = Boolean(sellerId && offerData.senderId === sellerId);
            }
            if (!isAuthoritativeSellerSender)
                return;
            recipientUid = buyerId;
            if (!recipientUid || recipientUid.startsWith('simulated-'))
                return;
            notifId = `neg_contact_share_${negId}_${offerId}`;
            title = 'Contact Information Shared';
            message = 'The seller has shared their contact details with you.';
            type = 'contact_shared';
        }
        else {
            // All other actions: only buyer-originated actions in private negotiations
            if (offerData.senderId !== buyerId)
                return;
            const realSellerUid = await resolvePrivateSellerUid(auctionId);
            if (!realSellerUid || realSellerUid === offerData.senderId)
                return;
            recipientUid = realSellerUid;
            if (action === 'send') {
                notifId = `neg_offer_${negId}_${offerId}`;
                title = 'New Tactical Proposal';
                message = `A buyer has sent a private offer of ${currencySymbol}${amount.toLocaleString()} for your asset.`;
                type = 'private_offer';
            }
            else if (action === 'counter') {
                notifId = `neg_offer_${negId}_${offerId}`;
                title = 'Tactical Counter-Offer';
                message = `The buyer has proposed a counter-offer of ${currencySymbol}${amount.toLocaleString()}.`;
                type = 'private_offer';
            }
            else if (action === 'message') {
                notifId = `neg_msg_${negId}_${offerId}`;
                title = 'New Tactical Message';
                message = offerData.message
                    ? `Buyer: "${offerData.message.length > 60 ? offerData.message.substring(0, 57) + '...' : offerData.message}"`
                    : 'You received a new message in your private negotiation.';
                type = 'private_message';
            }
            else if (action === 'accept') {
                notifId = `neg_accept_${negId}_${offerId}`;
                title = 'Proposal Accepted';
                message = 'The buyer has accepted your tactical proposal.';
                type = 'offer_accepted';
            }
            else if (action === 'decline') {
                notifId = `neg_decline_${negId}_${offerId}`;
                title = 'Proposal Declined';
                message = 'The buyer has declined the tactical proposal.';
                type = 'private_offer';
            }
            else if (action === 'complete') {
                notifId = `neg_concluded_${negId}_${offerId}`;
                title = 'Deal Complete: Contact Details';
                message = 'Deal completed! You can contact the buyer via their profile details.';
                type = 'auction_won';
            }
            else if (action === 'withdraw') {
                notifId = `neg_withdraw_${negId}_${offerId}`;
                title = 'Submitted Offer Withdrawn';
                message = 'A submitted offer has been withdrawn and permanently removed by the buyer.';
                type = 'private_offer';
            }
            else {
                return;
            }
        }
        if (!recipientUid)
            return;
        await deliverSellerNotification(recipientUid, notifId, {
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