import { doc, getDoc, getDocs, query, collection, where, documentId } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';

const profileCache = new Map<string, UserProfile | null>();
const pendingRequests = new Map<string, Promise<UserProfile | null>>();

// Maximum number of items in a Firestore 'in' query
const FIRESTORE_IN_LIMIT = 30;

/**
 * Prime or update the memory cache directly with an existing profile.
 */
export function primeUserProfileCache(uid: string, profile: UserProfile | null): void {
  if (!uid || uid === 'guest' || uid === 'anonymous') return;
  profileCache.set(uid, profile);
}

/**
 * Synchronous cache lookup for instantaneous render without triggering effect/network.
 * Returns:
 * - UserProfile: cached profile found
 * - null: verified non-existent / deleted profile in cache
 * - undefined: not in cache yet
 */
export function getCachedUserProfileSync(uid: string): UserProfile | null | undefined {
  if (!uid || uid === 'guest' || uid === 'anonymous') return null;
  if (profileCache.has(uid)) {
    return profileCache.get(uid) ?? null;
  }
  return undefined;
}

/**
 * Fetches a single user profile with deduplication and in-memory caching.
 */
export async function fetchCachedUserProfile(uid: string): Promise<UserProfile | null> {
  if (!uid || uid === 'guest' || uid === 'anonymous') return null;

  if (profileCache.has(uid)) {
    return profileCache.get(uid) || null;
  }

  if (pendingRequests.has(uid)) {
    return pendingRequests.get(uid)!;
  }

  const fetchPromise = (async () => {
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const profile = { id: userSnap.id, ...userSnap.data() } as UserProfile;
        profileCache.set(uid, profile);
        return profile;
      } else {
        profileCache.set(uid, null);
        return null;
      }
    } catch (err) {
      console.warn(`[ProfileCache] Error fetching profile for ${uid}:`, err);
      return null;
    } finally {
      pendingRequests.delete(uid);
    }
  })();

  pendingRequests.set(uid, fetchPromise);
  return fetchPromise;
}

/**
 * Batched resolution of multiple user profiles in chunks of 30.
 * Eliminates N+1 query waterfalls across carousels and listing grids.
 */
export async function fetchCachedUserProfilesBatch(
  uids: (string | undefined | null)[]
): Promise<Record<string, UserProfile | null>> {
  const result: Record<string, UserProfile | null> = {};
  if (!uids || !Array.isArray(uids) || uids.length === 0) {
    return result;
  }

  // 1. Sanitize & extract unique valid UIDs
  const uniqueUids = Array.from(
    new Set(
      uids.filter(
        (id): id is string =>
          typeof id === 'string' &&
          id.trim() !== '' &&
          id !== 'guest' &&
          id !== 'anonymous'
      )
    )
  );

  if (uniqueUids.length === 0) {
    return result;
  }

  // 2. Separate into cached vs uncached
  const uncachedUids: string[] = [];
  const pendingPromises: Promise<void>[] = [];

  for (const uid of uniqueUids) {
    if (profileCache.has(uid)) {
      result[uid] = profileCache.get(uid) || null;
    } else if (pendingRequests.has(uid)) {
      // Re-use currently in-flight single request
      pendingPromises.push(
        pendingRequests.get(uid)!.then((profile) => {
          result[uid] = profile;
        })
      );
    } else {
      uncachedUids.push(uid);
    }
  }

  // If all requested UIDs were already in cache, resolve immediately
  if (uncachedUids.length === 0 && pendingPromises.length === 0) {
    return result;
  }

  // 3. Chunk uncached UIDs into batches adhering to Firestore's 30-item 'in' query limit
  const chunks: string[][] = [];
  for (let i = 0; i < uncachedUids.length; i += FIRESTORE_IN_LIMIT) {
    chunks.push(uncachedUids.slice(i, i + FIRESTORE_IN_LIMIT));
  }

  const chunkPromises = chunks.map(async (chunk) => {
    try {
      const q = query(
        collection(db, 'users'),
        where(documentId(), 'in', chunk)
      );
      const snapshot = await getDocs(q);
      const foundSet = new Set<string>();

      snapshot.docs.forEach((docSnap) => {
        const profile = { id: docSnap.id, ...docSnap.data() } as UserProfile;
        profileCache.set(docSnap.id, profile);
        result[docSnap.id] = profile;
        foundSet.add(docSnap.id);
      });

      // Any UID in the chunk that was not returned does not exist
      chunk.forEach((uid) => {
        if (!foundSet.has(uid)) {
          profileCache.set(uid, null);
          result[uid] = null;
        }
      });
    } catch (batchErr) {
      console.warn('[ProfileCache] Batch query error, falling back gracefully to individual fetch:', batchErr);
      // Resilient fallback: fetch individually without crashing
      await Promise.allSettled(
        chunk.map(async (uid) => {
          try {
            const profile = await fetchCachedUserProfile(uid);
            result[uid] = profile;
          } catch {
            result[uid] = null;
            profileCache.set(uid, null);
          }
        })
      );
    }
  });

  await Promise.allSettled([...chunkPromises, ...pendingPromises]);
  return result;
}

export function invalidateCachedUserProfile(uid: string) {
  profileCache.delete(uid);
}

