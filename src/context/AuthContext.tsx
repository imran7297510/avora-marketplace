import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  signInWithPopup, 
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword as firebaseSignInWithEmailAndPassword,
  sendEmailVerification as firebaseSendEmailVerification,
  sendPasswordResetEmail,
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup,
  deleteUser
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { UserProfile } from '../types';
import { generateUniqueUsername, checkUsernameUnique, reserveUsernameTransaction, normalizeUsername } from "../utils/username";
import { IS_READONLY_INSPECTION_MODE } from '../config/inspectionMode';

export interface SignUpParams {
  email: string;
  password: string;
  username: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isAuthorizedAdmin: boolean;
  isAuthorizedPaymentVerifier: boolean;
  isKycAdmin: boolean;
  isVerified: boolean;
  isBlocked: boolean;
  loading: boolean;
  authError: string | null;
  isIframe: boolean;
  allowedSections: string[];
  loginWithGoogle: () => Promise<void>;
  signUpWithEmailPassword: (params: SignUpParams) => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  signInWithUsernameOrEmail: (identifier: string, password: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  linkPasswordAccount: (password: string) => Promise<void>;
  linkGoogleAccount: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isAuthorizedAdmin, setIsAuthorizedAdmin] = useState(false);
  const [isAuthorizedPaymentVerifier, setIsAuthorizedPaymentVerifier] = useState(false);
  const [allowedSections, setAllowedSections] = useState<string[]>([]);
  const [adminCode, setAdminCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isIframe, setIsIframe] = useState(false);

  const isSuperAdmin = ['imran7297510@gmail.com', 'imran7297510@gmail'].includes(user?.email?.toLowerCase()?.trim() || '') || ['imran7297510@gmail.com', 'imran7297510@gmail'].includes(userProfile?.email?.toLowerCase()?.trim() || '');
  const isKycAdmin = (isSuperAdmin || isAuthorizedAdmin) && !isBlocked;
  const isAdmin = (isSuperAdmin || isAuthorizedAdmin || isAuthorizedPaymentVerifier) && !isBlocked;

  useEffect(() => {
    setIsIframe(window.self !== window.top);
    
    let profileUnsubscribe: (() => void) | null = null;
    let adminUnsubscribe: (() => void) | null = null;

    // Safety timer: guarantee loading becomes false within 1 second even if Firestore is slow
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    const authUnsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      clearTimeout(safetyTimer);
      
      // Clear previous profile listener if any
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }
      if (adminUnsubscribe) {
        adminUnsubscribe();
        adminUnsubscribe = null;
      }

      if (currentUser) {
        try {
          // Real-time listener for authorized admin permissions
          const authAdminDoc = doc(db, 'authorizedAdmins', currentUser.email?.toLowerCase() || 'none');
          adminUnsubscribe = onSnapshot(authAdminDoc, (authAdminSnap) => {
            const isAuthAdmin = authAdminSnap.exists();
            setIsAuthorizedAdmin(isAuthAdmin);
            if (isAuthAdmin) {
              const data = authAdminSnap.data();
              setAdminCode(data?.adminCode || "");
              setAllowedSections(data?.allowedSections || []);
            } else {
              setAdminCode("");
              setAllowedSections([]);
            }
          }, (err) => {
            console.warn("Error in admin permissions listener:", err);
          });

          let isAuthPaymentVerifier = false;
          try {
            const pvDoc = doc(db, 'authorizedPaymentVerifiers', currentUser.email?.toLowerCase() || 'none');
            const pvSnap = await getDoc(pvDoc);
            isAuthPaymentVerifier = pvSnap.exists();
          } catch (e) {
            console.warn("Could not fetch authorized payment verifiers list:", e);
          }
          setIsAuthorizedPaymentVerifier(isAuthPaymentVerifier);

          const userDoc = doc(db, 'users', currentUser.uid);
          
          try {
            // Initial fetch/creation if needed
            const snap = await getDoc(userDoc);
            if (!snap.exists()) {
               if (!IS_READONLY_INSPECTION_MODE) {
                 const defaultUsername = await generateUniqueUsername(currentUser.displayName || currentUser.email?.split('@')[0] || "user");
                 await setDoc(userDoc, {
                   username: defaultUsername,
                   isVerified: false,
                   name: currentUser.displayName || '',
                   email: currentUser.email || '',
                   photoURL: currentUser.photoURL || '', 
                   createdAt: serverTimestamp()
                 });
               }
               setIsVerified(false);
               setIsBlocked(false);
            } else {
               const userData = snap.data();
               
               if (!userData.username && !IS_READONLY_INSPECTION_MODE) {
                 const newUsername = await generateUniqueUsername(userData.name || currentUser.displayName || currentUser.email?.split('@')[0] || "user");
                 await updateDoc(userDoc, { username: newUsername });
                 userData.username = newUsername;
               }

               if (!userData.photoURL && currentUser.photoURL && !IS_READONLY_INSPECTION_MODE) {
                 try {
                   await updateDoc(userDoc, { photoURL: currentUser.photoURL });
                   userData.photoURL = currentUser.photoURL;
                 } catch (ePhoto) {}
               }
               
               setUserProfile({ ...userData, photoURL: userData.photoURL || currentUser.photoURL || '', id: snap.id } as UserProfile);
               setIsVerified(userData.isVerified === true);
               setIsBlocked(userData.isBlocked === true);
            }
          } catch (e: any) {
             const errText = e?.message || String(e);
             const isQuotaErr = e?.code === 'resource-exhausted' || 
                                errText.toLowerCase().includes('quota') || 
                                errText.toLowerCase().includes('resource-exhausted');
             
             if (isQuotaErr) {
               console.warn("Failed to create or read user profile document (Quota Limit Exceeded):", e);
               if (typeof window !== 'undefined') {
                 (window as any).__firestore_quota_exceeded = true;
               }
               console.warn("Setting fallback user profile due to database quota limits/restrictions.");
               const fallbackProfile: UserProfile = {
                 id: currentUser.uid,
                 name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Genuine Trader',
                 email: currentUser.email || '',
                 photoURL: currentUser.photoURL || '',
                 isVerified: true,
                 isBlocked: false,
                 createdAt: new Date() as any,
                 isPremiumVerified: true,
                 sellerBadges: ['GOLDEN']
               };
               setUserProfile(fallbackProfile);
               setIsVerified(true);
               setIsBlocked(false);
             } else {
               console.error("Failed to create or read user profile document:", e);
             }
             // We continue so onSnapshot can try to attach. If they are blocked by rules, we still want limited access
           }

          // Real-time listener for profile changes (Blocking, Verification, etc.)
          profileUnsubscribe = onSnapshot(userDoc, (docSnap) => {
            if (docSnap.exists()) {
              const userData = docSnap.data();
              setUserProfile({ ...userData, id: docSnap.id } as UserProfile);
              setIsVerified(userData.isVerified === true);
              setIsBlocked(userData.isBlocked === true);
            }
          }, (error: any) => {
            const errText = error?.message || String(error);
            const isQuotaErr = error?.code === 'resource-exhausted' || 
                               errText.toLowerCase().includes('quota') || 
                               errText.toLowerCase().includes('resource-exhausted');
            if (isQuotaErr) {
              console.warn("Profile listener: Quota exceeded, falling back to static profile.");
              if (typeof window !== 'undefined') {
                (window as any).__firestore_quota_exceeded = true;
              }
              setUserProfile((prev) => {
                if (!prev && currentUser) {
                  return {
                    id: currentUser.uid,
                    name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Genuine Trader',
                    email: currentUser.email || '',
                    photoURL: currentUser.photoURL || '',
                    isVerified: true,
                    isBlocked: false,
                    createdAt: new Date() as any,
                    isPremiumVerified: true,
                    sellerBadges: ['GOLDEN']
                  };
                }
                return prev;
              });
              setIsVerified(true);
              setIsBlocked(false);
            } else {
              console.error("Profile listener error:", error);
            }
          });

        } catch (error: any) {
          const errText = error?.message || String(error);
          const isQuotaErr = error?.code === 'resource-exhausted' || 
                             errText.toLowerCase().includes('quota') || 
                             errText.toLowerCase().includes('resource-exhausted');
          if (error?.message?.includes('client is offline')) {
            console.warn("Firestore is operating in offline mode.");
          } else if (isQuotaErr) {
            console.warn('Profile manager: Quota exceeded while setting/getting profile.');
            if (typeof window !== 'undefined') {
              (window as any).__firestore_quota_exceeded = true;
            }
          } else {
            console.error("Error managing user profile", error);
          }
        }
      } else {
        setUserProfile(null);
        setIsVerified(false);
        setIsBlocked(false);
        setIsAuthorizedAdmin(false);
      }
      setLoading(false);
    });

    return () => {
      clearTimeout(safetyTimer);
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    if (isAuthenticating) {
      console.log("Login already in progress, ignoring duplicate call.");
      return;
    }
    
    try {
        setAuthError(null);
        setIsAuthenticating(true);
        console.log("Login with Google initiated...");
        
        const provider = new GoogleAuthProvider();
        
        console.log("Calling signInWithPopup...");
        const result = await signInWithPopup(auth, provider);
        console.log("SignInWithPopup SUCCESS:", result.user.email);
        setUser(result.user);
    } catch (error: any) {
        console.error("Google auth failed", error);
        const errorCode = error.code;
        const errorMessage = error.message;
        
        if (errorCode === 'auth/popup-closed-by-user') {
          setAuthError('The authentication window was closed or could not communicate. Hint: If you are running inside the AI Studio sandbox iframe, this is expected behavior. Please click the "Open in New Tab" icon in the top right of your screen to log in safely.');
        } else if (errorCode === 'auth/popup-blocked') {
          setAuthError('The authentication popup was blocked by your browser. Please enable popups or open this app in a new tab.');
          alert('The login popup was blocked by your browser. Please allow popups for this site or open the app in a new tab using the icon at the top right.');
        } else if (errorCode === 'auth/network-request-failed') {
          setAuthError('Network error or blocked third-party storage cookies. Please allow third-party cookies or open this app in a new tab.');
          alert('Network Error (auth/network-request-failed): This usually happens if your browser is blocking third-party cookies or if an Ad-Blocker is interfering with the login. \n\nSolutions:\n1. Open this app in a NEW TAB (use the icon at the top right).\n2. Disable Ad-Blockers for this site.\n3. Ensure third-party cookies are allowed in your browser settings.');
        } else if (errorCode === 'auth/unauthorized-domain') {
          setAuthError(`This domain is not authorized: ${window.location.hostname}`);
          alert('Firebase Configuration Error: This domain (' + window.location.hostname + ') is not authorized for Google Sign-In. \n\nAdmin Action Required: Go to your Firebase Console > Authentication > Settings > Authorized Domains and add "' + window.location.hostname + '".');
        } else if (errorCode === 'auth/operation-not-allowed') {
          setAuthError('Google sign-in is disabled in your Firebase console.');
          alert('Google Login is not enabled in your Firebase Project. Admin must enable "Google" as a sign-in provider in the Firebase Console.');
        } else {
          setAuthError(`${errorCode}: ${errorMessage}`);
          alert('Login Failed: ' + errorMessage + ' (Code: ' + errorCode + ') \n\nTip: Try opening the app in a new tab if you continue to encounter this error.');
        }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signUpWithEmailPassword = async ({ email, password, username, name }: SignUpParams) => {
    setAuthError(null);
    if (!email || !password || !username) {
      throw new Error("Email, password, and username are required.");
    }
    
    // Check username uniqueness
    const isUnique = await checkUsernameUnique(username);
    if (!isUnique) {
      const err = "Username is already taken. Please choose another username.";
      setAuthError(err);
      throw new Error(err);
    }

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = result.user;
      
      // Reserve username atomically in usernames/{normalizedUsername}
      const reservation = await reserveUsernameTransaction(username, newUser.uid);
      if (!reservation.success) {
        // Rollback created auth user to avoid orphan accounts
        try {
          await deleteUser(newUser);
        } catch (cleanupErr) {
          console.warn("Could not roll back created user after username reservation failure:", cleanupErr);
        }
        throw new Error(reservation.error || "Username is already taken. Please choose another username.");
      }
      const normalized = reservation.normalized;

      // Create user profile doc
      const userDocRef = doc(db, 'users', newUser.uid);
      await setDoc(userDocRef, {
        username: normalized,
        name: name || email.split('@')[0],
        email: email,
        isVerified: false,
        createdAt: serverTimestamp()
      });

      // Trigger verification email
      try {
        await firebaseSendEmailVerification(newUser);
      } catch (ve) {
        console.warn("Could not send verification email immediately:", ve);
      }

      setUser(newUser);
    } catch (error: any) {
      let msg = error.message;
      if (error.code === 'auth/email-already-in-use') {
        msg = "An account with this email address already exists. Please log in or use password reset.";
      } else if (error.code === 'auth/weak-password') {
        msg = "Password should be at least 6 characters long.";
      } else if (error.code === 'auth/invalid-email') {
        msg = "Invalid email format.";
      }
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const signInWithEmailPassword = async (email: string, password: string) => {
    setAuthError(null);
    try {
      const result = await firebaseSignInWithEmailAndPassword(auth, email, password);
      setUser(result.user);
    } catch (error: any) {
      let msg = "Failed to sign in. Please check your credentials.";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        msg = "Incorrect email/username or password.";
      } else if (error.code === 'auth/user-disabled') {
        msg = "This user account has been disabled.";
      }
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const signInWithUsernameOrEmail = async (identifier: string, password: string) => {
    setAuthError(null);
    const cleanId = identifier.trim();
    if (!cleanId) throw new Error("Please enter your email or username.");

    if (cleanId.includes('@')) {
      return signInWithEmailPassword(cleanId, password);
    }

    const normalized = normalizeUsername(cleanId);
    let resolvedEmail: string | null = null;

    try {
      const uSnap = await getDoc(doc(db, "usernames", normalized));
      let uid: string | null = null;
      if (uSnap.exists()) {
        uid = uSnap.data().uid;
      } else {
        const q = query(collection(db, "users"), where("username", "==", normalized));
        const userQuerySnap = await getDocs(q);
        if (!userQuerySnap.empty) {
          uid = userQuerySnap.docs[0].id;
          resolvedEmail = userQuerySnap.docs[0].data().email;
        }
      }

      if (uid && !resolvedEmail) {
        const userDocSnap = await getDoc(doc(db, "users", uid));
        if (userDocSnap.exists()) {
          resolvedEmail = userDocSnap.data().email;
        }
      }

      if (!resolvedEmail) {
        const msg = "No account found with this username. Please check your username or sign in with your email address.";
        setAuthError(msg);
        throw new Error(msg);
      }

      return signInWithEmailPassword(resolvedEmail, password);
    } catch (err: any) {
      if (err?.message?.includes("No account found") || err?.message?.includes("Incorrect")) {
        throw err;
      }
      const msg = "Failed to sign in with username. Please try signing in using your registered email address.";
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const sendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error("No authenticated user found.");
    try {
      await firebaseSendEmailVerification(auth.currentUser);
    } catch (err: any) {
      throw new Error(err?.message || "Failed to send verification email.");
    }
  };

  const sendPasswordReset = async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      let msg = "Failed to send password reset email.";
      if (error.code === 'auth/user-not-found') {
        msg = "No account exists with this email address.";
      } else if (error.code === 'auth/invalid-email') {
        msg = "Invalid email format.";
      }
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const linkPasswordAccount = async (password: string) => {
    setAuthError(null);
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error("No active user logged in or user has no email address.");
    }

    try {
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await linkWithCredential(currentUser, credential);
      setUser({ ...auth.currentUser } as User);
    } catch (error: any) {
      let msg = error.message;
      if (error.code === 'auth/credential-already-in-use') {
        msg = "This email/password credential is already associated with another account. Automatic account merging is disabled to protect your data.";
      } else if (error.code === 'auth/email-already-in-use') {
        msg = "An account with this email address already exists in Firebase. Automatic account merging is disabled.";
      }
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const linkGoogleAccount = async () => {
    setAuthError(null);
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("No active user logged in.");
    }

    try {
      const provider = new GoogleAuthProvider();
      await linkWithPopup(currentUser, provider);
      setUser({ ...auth.currentUser } as User);
    } catch (error: any) {
      let msg = error.message;
      if (error.code === 'auth/credential-already-in-use') {
        msg = "This Google account is already linked to another Avora user. Automatic account merging is disabled to protect your account security.";
      }
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    await auth.signOut();
  }


  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-stone-400 text-xs tracking-wider uppercase font-semibold animate-pulse">Loading Avora...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ 
      user, 
      userProfile: userProfile ? {
        ...userProfile,
        isAuthorizedAdmin,
        adminCode,
        allowedSections
      } : null,
      isAdmin, 
      isSuperAdmin,
      isAuthorizedAdmin,
      isAuthorizedPaymentVerifier,
      isKycAdmin,
      isVerified, 
      isBlocked,
      loading, 
      authError, 
      isIframe,
      allowedSections,
      loginWithGoogle, 
      signUpWithEmailPassword,
      signInWithEmailPassword,
      signInWithUsernameOrEmail,
      sendVerificationEmail,
      sendPasswordReset,
      linkPasswordAccount,
      linkGoogleAccount,
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
