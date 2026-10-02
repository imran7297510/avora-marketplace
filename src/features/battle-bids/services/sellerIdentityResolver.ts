import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';

/**
 * In-memory cache for resolved authoritative seller UIDs.
 * Keyed by: `${auctionId}:${callerUid}`
 * 
 * Strict Cache Isolation Rules:
 * 1. For Private Negotiations, reading `private/seller` is restricted by Firestore rules
 *    to the seller themselves (sellerUid == request.auth.uid) or an Admin. Therefore, a buyer's
 *    or unauthenticated user's attempt to read `private/seller` yields permission-denied (resolves to null),
 *    whereas the authentic owner's read succeeds (resolves to ownerUid).
 * 2. Keying by `callerUid` guarantees that User A's resolution is strictly isolated from User B.
 * 3. Listening to `auth.onAuthStateChanged` clears the cache whenever the active user changes.
 * 4. The cache is an in-memory optimization and never supersedes or bypasses Firestore rules.
 */
const sellerUidCache = new Map<string, string | null>();

// Clear cache automatically if the active user session changes
if (typeof window !== 'undefined' && auth) {
  auth.onAuthStateChanged(() => {
    sellerUidCache.clear();
  });
}

/**
 * Explicit cache invalidation helper for testing, session reset, and component lifecycle cleanup.
 */
export function clearSellerIdentityCache(): void {
  sellerUidCache.clear();
}

/**
 * Resolves the authoritative Firebase Auth UID of the seller for a given auction listing.
 * 
 * Rules:
 * 1. Normal Battle Bids:
 *    `auction.sellerId` is the real Firebase Auth UID.
 *    If `preloadedListing` is provided and `!preloadedListing.isNegotiationOnly`,
 *    returns `preloadedListing.sellerId` directly without any Firestore read.
 * 2. Private Negotiations:
 *    `auction.sellerId` is a public pseudonymous ID (e.g. `anon_seller_xxx`).
 *    The authoritative seller UID resides exclusively at:
 *    `arena_auctions/{auctionId}/private/seller.sellerUid`
 *    Reads ONLY this private subcollection document.
 * 3. Returns `null` if:
 *    - Listing or private document does not exist.
 *    - Private document is malformed or lacks a valid `sellerUid` string.
 *    - The caller lacks permission to read `private/seller` (e.g. buyer or unauthenticated guest).
 * 
 * @param auctionId The unique ID of the auction
 * @param preloadedListing Optional preloaded metadata to avoid redundant Firestore reads
 * @returns The authoritative seller Firebase UID or null
 */
export async function resolveAuthoritativeSellerUid(
  auctionId: string,
  preloadedListing?: {
    isNegotiationOnly?: boolean;
    sellerId?: string;
  } | null
): Promise<string | null> {
  if (!auctionId || typeof auctionId !== 'string') {
    return null;
  }

  const currentAuthUid = auth?.currentUser?.uid || 'unauthenticated';
  const cacheKey = `${auctionId}:${currentAuthUid}`;

  if (sellerUidCache.has(cacheKey)) {
    return sellerUidCache.get(cacheKey) ?? null;
  }

  try {
    let isPrivateNegotiation: boolean;
    let publicSellerId: string | undefined;

    if (preloadedListing !== undefined && preloadedListing !== null) {
      isPrivateNegotiation = Boolean(
        preloadedListing.isNegotiationOnly ||
        (preloadedListing.sellerId && preloadedListing.sellerId.startsWith('anon_seller_'))
      );
      publicSellerId = preloadedListing.sellerId;
    } else {
      // Fetch public auction document to inspect listing type
      const auctionRef = doc(db, 'arena_auctions', auctionId);
      const auctionSnap = await getDoc(auctionRef);
      if (!auctionSnap.exists()) {
        sellerUidCache.set(cacheKey, null);
        return null;
      }
      const data = auctionSnap.data();
      isPrivateNegotiation = Boolean(
        data.isNegotiationOnly ||
        (data.sellerId && typeof data.sellerId === 'string' && data.sellerId.startsWith('anon_seller_'))
      );
      publicSellerId = data.sellerId;
    }

    // 1. Normal Battle Bid: public sellerId is the authoritative real Firebase UID
    if (!isPrivateNegotiation) {
      const resolved = (typeof publicSellerId === 'string' && publicSellerId.trim().length > 0)
        ? publicSellerId.trim()
        : null;
      sellerUidCache.set(cacheKey, resolved);
      return resolved;
    }

    // 2. Private Negotiation: Read ONLY arena_auctions/{auctionId}/private/seller
    const privateSellerRef = doc(db, 'arena_auctions', auctionId, 'private', 'seller');
    const privateSnap = await getDoc(privateSellerRef);

    if (!privateSnap.exists()) {
      sellerUidCache.set(cacheKey, null);
      return null;
    }

    const privateData = privateSnap.data();
    const authoritativeUid = privateData?.sellerUid;

    if (typeof authoritativeUid === 'string' && authoritativeUid.trim().length > 0) {
      const resolved = authoritativeUid.trim();
      sellerUidCache.set(cacheKey, resolved);
      return resolved;
    }

    // Malformed document: missing or invalid sellerUid
    sellerUidCache.set(cacheKey, null);
    return null;
  } catch (_err) {
    // Gracefully handle permission-denied (buyer/unauthenticated) or network errors
    sellerUidCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Determines whether the specified user is the authoritative owner of an auction listing.
 * 
 * Rules:
 * 1. Unauthenticated callers (`!currentUserId`) are never owners.
 * 2. If `isAdmin === true`, returns true.
 * 3. Resolves the authoritative seller UID via `resolveAuthoritativeSellerUid` and strictly
 *    matches against `currentUserId`.
 * 4. Never trusts client-side UI flags (e.g. `isSeller`) or pseudonymous public sellerId.
 * 
 * @param auctionId The unique ID of the auction
 * @param currentUserId The Firebase Auth UID of the caller
 * @param preloadedListing Optional preloaded metadata
 * @param isAdmin Optional administrative privilege flag
 * @returns boolean indicating verified listing ownership
 */
export async function isListingOwner(
  auctionId: string,
  currentUserId: string | undefined,
  preloadedListing?: {
    isNegotiationOnly?: boolean;
    sellerId?: string;
  } | null,
  isAdmin?: boolean
): Promise<boolean> {
  if (isAdmin) {
    return true;
  }

  if (!currentUserId || typeof currentUserId !== 'string' || currentUserId.trim().length === 0) {
    return false;
  }

  const authoritativeSellerUid = await resolveAuthoritativeSellerUid(auctionId, preloadedListing);
  if (!authoritativeSellerUid) {
    return false;
  }

  return authoritativeSellerUid === currentUserId.trim();
}
