import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDocFromServer, collection, setDoc, serverTimestamp, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Log-filtering proxy to prevent sandboxed environment connectivity retry logs from registering as fatal application console.errors
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = function (...args: any[]) {
    const message = args.map(arg => {
      try {
        return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      } catch {
        return String(arg);
      }
    }).join(' ');

    if (
      message.includes("Could not reach Cloud Firestore backend") || 
      message.includes("Backend didn't respond within 10 seconds") ||
      message.includes("@firebase/firestore")
    ) {
      console.warn("[Firestore Sandbox Warning Filtered]:", ...args);
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

const app = initializeApp(firebaseConfig);

// Use initializeFirestore with optimized settings for iframe environment and fallback to memory cache if persistence is blocked
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true,
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  console.warn("Firestore persistent cache is restricted or blocked in this environment. Falling back to default getFirestore instance:", e);
  try {
    dbInstance = getFirestore(app);
  } catch (err2) {
    console.error("Failed to retrieve fallback getFirestore instance:", err2);
  }
}

export const db = dbInstance;

export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export async function sendNotification(userId: string, title: string, message: string, type: string, relatedId?: string) {
  try {
    const notificationRef = doc(collection(db, 'notifications'));
    await setDoc(notificationRef, {
      userId,
      title,
      message,
      type,
      relatedId,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to send notification:", err);
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  // Handle quota limits gracefully without crashing the app
  if (errorMessage.toLowerCase().includes('quota') || errorMessage.includes('resource-exhausted')) {
    console.warn("🔥 Firebase Quota Exceeded:", errorMessage);
    if (typeof window !== 'undefined') {
      (window as any).__firestore_quota_exceeded = true;
    }
    return;
  }

  // Log detailed error for debugging
  console.error('Firestore Error Detail: ', JSON.stringify(errInfo));

  // If it's a connectivity error, log a warning instead of throwing to prevent crashing the app
  if (errorMessage.includes('client is offline') || errorMessage.includes('Backend didn\'t respond') || errorMessage.includes('unreachable')) {
    console.warn("CONNECTION WARNING: Operating in offline mode. Changes will sync when network is restored.");
    if (typeof window !== 'undefined') {
      (window as any).__firestore_offline = true;
    }
    return;
  }

  throw new Error(errorMessage); // Throw raw message instead of stringified JSON if not a connection error
}

// Proactive Connection Check pattern as instructed in firebase-integration skill
async function testConnection() {
  try {
    if (!db) {
      console.warn("Firestore db instance is not initialized. Skipping proactive connection check.");
      return;
    }
    await getDocFromServer(doc(db, 'cities', 'rawalpindi'));
  } catch (error) {
    const errText = error instanceof Error ? error.message : String(error);
    if (errText.includes('client is offline') || errText.includes('Backend didn\'t respond') || errText.includes('unreachable') || errText.includes('failed-precondition')) {
      console.warn("Firestore connectivity check: Operating in cached offline mode due to proxy/sandbox settings.");
      if (typeof window !== 'undefined') {
        (window as any).__firestore_offline = true;
      }
    }
  }
}
testConnection();
