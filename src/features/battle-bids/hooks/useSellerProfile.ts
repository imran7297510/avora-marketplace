import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ArenaSellerProfile } from '../types';
import { ArenaService } from '../services/arenaService';
import { getFallbackSellerProfile } from '../utils/fallbackProfile';

const profileCache = new Map<string, ArenaSellerProfile>();
const usernameToIdCache = new Map<string, string>();

interface SharedSellerSubscription {
  refCount: number;
  listeners: Set<(profile: ArenaSellerProfile) => void>;
  errorListeners: Set<(error: string) => void>;
  unsubscribeFirestore: (() => void) | null;
}

const activeSellerSubscriptions = new Map<string, SharedSellerSubscription>();

/**
 * Shared, ref-counted subscription manager for seller profiles.
 * Multiple components requesting the same userId share a single Firestore onSnapshot listener.
 * When refCount reaches 0, the underlying Firestore onSnapshot is torn down cleanly.
 */
function subscribeSharedSellerProfile(
  userId: string,
  onUpdate: (profile: ArenaSellerProfile) => void,
  onError?: (error: string) => void
): () => void {
  let sub = activeSellerSubscriptions.get(userId);

  if (!sub) {
    sub = {
      refCount: 0,
      listeners: new Set(),
      errorListeners: new Set(),
      unsubscribeFirestore: null,
    };
    activeSellerSubscriptions.set(userId, sub);

    const unsub = ArenaService.subscribeToSellerProfile(
      userId,
      (data) => {
        const effectiveProfile = data || getFallbackSellerProfile(userId);
        profileCache.set(userId, effectiveProfile);
        sub?.listeners.forEach((listener) => {
          try {
            listener(effectiveProfile);
          } catch (e) {
            console.error("Error in shared seller profile listener:", e);
          }
        });
      },
      (errMessage) => {
        const fallback = getFallbackSellerProfile(userId);
        profileCache.set(userId, fallback);
        sub?.errorListeners.forEach((listener) => {
          try {
            listener(errMessage);
          } catch (e) {
            console.error("Error in shared seller profile error listener:", e);
          }
        });
      }
    );

    sub.unsubscribeFirestore = unsub;
  }

  sub.refCount += 1;
  sub.listeners.add(onUpdate);
  if (onError) {
    sub.errorListeners.add(onError);
  }

  // If already in profileCache, deliver latest cached profile to new subscriber immediately
  if (profileCache.has(userId)) {
    try {
      onUpdate(profileCache.get(userId)!);
    } catch (e) {
      console.error("Error notifying initial cached seller profile:", e);
    }
  }

  return () => {
    const currentSub = activeSellerSubscriptions.get(userId);
    if (!currentSub) return;

    currentSub.listeners.delete(onUpdate);
    if (onError) {
      currentSub.errorListeners.delete(onError);
    }
    currentSub.refCount -= 1;

    if (currentSub.refCount <= 0) {
      if (currentSub.unsubscribeFirestore) {
        currentSub.unsubscribeFirestore();
      }
      activeSellerSubscriptions.delete(userId);
    }
  };
}

export function useSellerProfile(userIdOrUsername: string | undefined) {
  const [resolvedUserId, setResolvedUserId] = useState<string | undefined>(() => {
    if (!userIdOrUsername) return undefined;
    return usernameToIdCache.get(userIdOrUsername) ?? userIdOrUsername;
  });
  const [resolving, setResolving] = useState<boolean>(() => {
    if (!userIdOrUsername) return false;
    // If it's a 28-character Firebase UID (standard), we can skip resolving or do it without blocking
    if (userIdOrUsername.length === 28 && !userIdOrUsername.includes(' ')) {
      return false;
    }
    return !usernameToIdCache.has(userIdOrUsername);
  });

  const [profile, setProfile] = useState<ArenaSellerProfile | null>(() => {
    const initialId = resolvedUserId || userIdOrUsername;
    if (!initialId) return null;
    return profileCache.get(initialId) ?? getFallbackSellerProfile(initialId);
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const initialId = resolvedUserId || userIdOrUsername;
    if (!initialId) return false;
    return resolving || !profileCache.has(initialId);
  });
  const [error, setError] = useState<string | null>(null);

  // 1. Resolve username to userId
  useEffect(() => {
    if (!userIdOrUsername) {
      setResolvedUserId(undefined);
      setResolving(false);
      setProfile(null);
      return;
    }

    // Standard Firebase UID is 28 chars and doesn't look like a typical username
    if (userIdOrUsername.length === 28 && !userIdOrUsername.includes(' ')) {
      // Direct assignment
      setResolvedUserId(userIdOrUsername);
      setResolving(false);
      if (!profile) {
        setProfile(profileCache.get(userIdOrUsername) ?? getFallbackSellerProfile(userIdOrUsername));
      }
      return;
    }

    if (usernameToIdCache.has(userIdOrUsername)) {
      const mappedId = usernameToIdCache.get(userIdOrUsername)!;
      setResolvedUserId(mappedId);
      setResolving(false);
      if (!profile) {
        setProfile(profileCache.get(mappedId) ?? getFallbackSellerProfile(mappedId));
      }
      return;
    }

    let active = true;
    setResolving(true);

    const resolve = async () => {
      try {
        const q = query(
          collection(db, 'users'),
          where('username', '==', userIdOrUsername),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!active) return;

        if (!snap.empty) {
          const uid = snap.docs[0].id;
          usernameToIdCache.set(userIdOrUsername, uid);
          setResolvedUserId(uid);
        } else {
          // Fallback to parameter as id
          usernameToIdCache.set(userIdOrUsername, userIdOrUsername);
          setResolvedUserId(userIdOrUsername);
        }
      } catch (err) {
        console.error("Error resolving username to id:", err);
        if (active) {
          setResolvedUserId(userIdOrUsername);
        }
      } finally {
        if (active) {
          setResolving(false);
        }
      }
    };

    resolve();

    return () => {
      active = false;
    };
  }, [userIdOrUsername]);

  // 2. Subscribe to profile once userId is resolved
  useEffect(() => {
    if (resolving || !resolvedUserId) {
      return;
    }

    if (profileCache.has(resolvedUserId)) {
      setProfile(profileCache.get(resolvedUserId)!);
      setLoading(false);
    } else {
      setProfile(getFallbackSellerProfile(resolvedUserId));
      setLoading(false);
    }

    const unsubscribe = subscribeSharedSellerProfile(
      resolvedUserId,
      (effectiveProfile) => {
        setProfile(effectiveProfile);
        setLoading(false);
      },
      (errMessage) => {
        setError(errMessage);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [resolvedUserId, resolving]);

  return { profile: profile || (userIdOrUsername ? getFallbackSellerProfile(userIdOrUsername) : null), loading: false, error };
}
