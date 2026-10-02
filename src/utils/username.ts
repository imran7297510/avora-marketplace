import { collection, query, where, getDocs, doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

export const normalizeUsername = (username: string): string => {
  return username.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
};

export const checkUsernameUnique = async (username: string): Promise<boolean> => {
  const normalized = normalizeUsername(username);
  if (!normalized || normalized.length < 3) return false;

  try {
    // 1. Check atomic usernames reservation collection
    const usernameRef = doc(db, "usernames", normalized);
    const snap = await getDoc(usernameRef);
    if (snap.exists()) return false;

    // 2. Fallback check in users collection for legacy profiles
    const q = query(collection(db, "users"), where("username", "==", normalized));
    const userSnap = await getDocs(q);
    return userSnap.empty;
  } catch (err) {
    console.warn("Error checking username uniqueness:", err);
    return true; // fail open if offline or restricted
  }
};

export const reserveUsernameTransaction = async (username: string, uid: string): Promise<{ success: boolean; normalized: string; error?: string }> => {
  const normalized = normalizeUsername(username);
  if (!normalized || normalized.length < 3) {
    return { success: false, normalized, error: "Username must be at least 3 characters long and contain only letters, numbers, or underscores." };
  }

  const usernameRef = doc(db, "usernames", normalized);

  try {
    await runTransaction(db, async (transaction) => {
      const uSnap = await transaction.get(usernameRef);
      if (uSnap.exists()) {
        throw new Error("USERNAME_TAKEN");
      }
      transaction.set(usernameRef, {
        uid,
        username: normalized,
        createdAt: serverTimestamp()
      });
    });
    return { success: true, normalized };
  } catch (err: any) {
    if (err?.message === "USERNAME_TAKEN") {
      return { success: false, normalized, error: "This username is already taken. Please choose another." };
    }
    return { success: false, normalized, error: err?.message || "Failed to reserve username." };
  }
};

export const generateUniqueUsername = async (baseName: string): Promise<string> => {
  const sanitize = (str: string) => str.toLowerCase().replace(/[^a-z0-9_]/g, '');
  let base = sanitize(baseName) || "user";
  if (base.length < 3) base = base + "123";
  let suffix = "";
  let isUnique = false;
  
  while (!isUnique) {
    const candidate = base + suffix;
    const isAvail = await checkUsernameUnique(candidate);
    if (isAvail) {
      isUnique = true;
      return candidate;
    }
    suffix = Math.floor(1000 + Math.random() * 9000).toString();
  }
  return base;
};

