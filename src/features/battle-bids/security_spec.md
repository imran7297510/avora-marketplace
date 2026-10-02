# Battle Bids Step 15: Security Specification & Threat Model

## 1. Executive Summary & System Boundaries
This document formalizes the authoritative payment expiration, runner-up identification, and second-chance offer settlement architecture for Battle Bids.

### Strict Non-Negotiable Invariants:
1. **Core Freeze Compliance**: Tactical actions, live bidding engine, bid transactions, anti-sniping, pause/resume, and auction completion winner selection remain untouched.
2. **Deterministic Server Authority & Idempotency**: Order expiration and runner-up generation are strictly verified against authoritative Firestore documents.
3. **Financial & Data Isolation**: The original order record (`BB-{auctionId}`) is an immutable historical audit record upon `PAYMENT_EXPIRED`. The second-chance order uses the canonical deterministic document ID (`BB-{auctionId}-SC`).
4. **Spectator Privacy**: Runner-up identification, second-chance offers, and private checkout links are visible ONLY to the eligible runner-up, the seller, and platform administrators. Spectators only see appropriate public auction summaries.

---

## 2. The "Dirty Dozen" Threat Model & Malicious Attack Payloads

| # | Attack Scenario / Vector | Malicious Payload / Method | Expected System Defense & Invariant |
|---|---------------------------|----------------------------|-----------------------------------|
| **1** | **Premature Expiration Trigger** | A malicious client attempts to expire an order before `request.time >= paymentDeadline`. | **REJECTED**: Firestore security rules verify `request.time >= existing().paymentDeadline` and the server transaction checks `Date.now() >= deadlineMs`. |
| **2** | **Original Winner Late Payment Bypass** | Winner submits payment receipt after `paymentDeadline` has lapsed or after status moved to `PAYMENT_EXPIRED`. | **REJECTED**: `firestore.rules` enforces `request.time < existing().paymentDeadline` and `existing().status in ['AWAITING_PAYMENT', 'PAYMENT_REVIEW']`. |
| **3** | **Fabricated Runner-up Injection** | Client sends a crafted `runnerUpId` or fake bid amount that does not match the actual 2nd highest distinct bidder in `bids` subcollection. | **REJECTED**: Server recalculates the true runner-up strictly from the `arena_auctions/{auctionId}/bids` subcollection filtered by `userId != originalWinnerId` and sorted by `amount DESC`. |
| **4** | **Runner-up Collusion / Self-Bidding** | Original winner has a secondary account or sibling bid and tries to claim the item at a lower price. | **REJECTED**: Strict distinct user validation (`userId != winnerId`). Risk scores and audit logs flag accounts with matching IPs/devices. |
| **5** | **Double Offer Claim Race Condition** | Two tabs or concurrent requests attempt to accept the same second-chance offer simultaneously. | **REJECTED**: Firestore `runTransaction` checks `offerDoc.data().status === 'PENDING'` atomically. The first commits; the second fails gracefully with `OFFER_ALREADY_CLAIMED`. |
| **6** | **Expired Offer Claim Attempt** | Runner-up attempts to accept the second-chance offer after its 24-hour expiration window. | **REJECTED**: Firestore transaction & rules verify `request.time < offer.expiresAt`. Status is transitioned to `EXPIRED`. |
| **7** | **Offer Price Tampering** | Attacker tampers with the `amount` field in the second-chance offer or order creation to pay less than their actual bid. | **REJECTED**: The offer amount is bound to the exact bid amount logged in the immutable `bids` subcollection. Security rules forbid amount modification. |
| **8** | **Unauthorized Spectator Offer Access** | Spectator tries to read or query `/second_chance_offers/{offerId}`. | **REJECTED**: `firestore.rules` restricts read access strictly to `request.auth.uid in [offer.buyerId, offer.sellerId]` or `isAdmin()`. |
| **9** | **Seller Forced Expiration on Valid Winner** | Malicious seller tries to mark an order as expired while the buyer's 48-hour window is active. | **REJECTED**: Rules only permit status transition to `PAYMENT_EXPIRED` if the deadline has passed. |
| **10** | **Duplicate Order Document Collision** | Triggering second-chance creation multiple times generates multiple active orders for the same item. | **REJECTED**: Second-chance orders use deterministic IDs or transaction locks that check if an active order already exists for the offer. |
| **11** | **Unauthorized Seller Fulfillment Bypass** | Buyer attempts to set status directly to `PAID`, `SHIPPED`, or `DEAL_DONE`. | **REJECTED**: `firestore.rules` explicitly isolates buyer updates to `PAYMENT_REVIEW` only; seller fulfillment transitions are restricted to `request.auth.uid == sellerId`. |
| **12** | **Original Order Mutation After Expiration** | Client attempts to mutate address, notes, or amounts on an order whose status is `PAYMENT_EXPIRED`. | **REJECTED**: `firestore.rules` makes `PAYMENT_EXPIRED` orders strictly read-only for buyers. |

---

## 3. Data Schema & State Machine Specifications

### Order Status State Machine:
```
[ AWAITING_PAYMENT ] ──(Buyer submits within 48h)──► [ PAYMENT_REVIEW ] ──(Seller verifies)──► [ PAID ] ──► [ SHIPPED ] ──► [ DEAL_DONE / COMPLETED ]
        │                                                     │
(Deadline Passed)                                      (Seller Rejects Proof)
        ▼                                                     │
[ PAYMENT_EXPIRED ] (Immutable audit record)                  ▼
        │                                             [ AWAITING_PAYMENT ]
        ▼
[ Second-Chance Flow Triggered ]
  - Query runner-up from bids subcollection
  - Create second_chance_offers/{offerId} (24h validity)
  - Notify Runner-Up & Seller
        │
  ┌─────┴────────────────────────┐
  ▼                              ▼
(Runner-Up Accepts)       (Runner-Up Declines / 24h Expires)
  │                              │
  ▼                              ▼
Creates new Order:         Offer marked DECLINED / EXPIRED
[ BB-{auctionId}-SC ]       Auction remains ended / unsold
(Status: AWAITING_PAYMENT)
```

---
