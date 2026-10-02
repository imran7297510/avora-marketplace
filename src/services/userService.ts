import { 
  doc, 
  getDoc, 
  updateDoc, 
  getDocs, 
  query, 
  collection, 
  where, 
  serverTimestamp, 
  setDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Executes the standardized account block workflow.
 * Sets isBlocked, accountStatus, status, and disables posting, reporting, chatting, and bidding.
 */
export async function executeCentralBlock(
  userId: string, 
  adminEmail: string, 
  adminId: string, 
  reason?: string, 
  adminCode?: string
): Promise<void> {
  if (!userId) {
    throw new Error("Missing user identifier.");
  }

  const userRef = doc(db, 'users', userId);
  let uData: any = {};

  try {
    const uDoc = await getDoc(userRef);
    if (uDoc.exists()) {
      uData = uDoc.data();
    }
  } catch (err) {
    console.warn("Could not fetch user profile for block, proceeding with block:", err);
  }

  const savedBadges = {
    isVerified: uData.isVerified,
    verifiedBadgeType: uData.verifiedBadgeType,
    badges: uData.badges,
    verifiedUntil: uData.verifiedUntil,
    isPremium: uData.isPremium,
    premiumBadge: uData.premiumBadge,
    sellerBadges: uData.sellerBadges,
    trustBadges: uData.trustBadges,
    achievementBadges: uData.achievementBadges,
  };

  const blockData: any = {
    isBlocked: true,
    accountStatus: 'blocked',
    status: 'BLOCKED',
    blockedAt: serverTimestamp(),
    blockedBy: adminEmail || adminId || 'Admin',
    blockReason: reason || "Violation of community trading policies.",
    appealStatus: 'NONE',
    updatedAt: serverTimestamp(),
    reportingDisabled: true,
    canReport: false,
    postingDisabled: true,
    sellingDisabled: true,
    canPost: false,
    canSell: false,
    messagingDisabled: true,
    chatRestricted: true,
    canChat: false,
    savedBadges,
  };

  // 1. Update User Profile
  await setDoc(userRef, blockData, { merge: true });

  // 2. Perform sub-tasks
  await Promise.all([
    // Suspend user active listings
    (async () => {
      try {
        const [byOwner, bySeller, byUser] = await Promise.all([
          getDocs(query(collection(db, 'listings'), where('ownerId', '==', userId))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, 'listings'), where('sellerId', '==', userId))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, 'listings'), where('userId', '==', userId))).catch(() => ({ docs: [] }))
        ]);

        const allDocs = new Map();
        [...byOwner.docs, ...bySeller.docs, ...byUser.docs].forEach(docSnap => allDocs.set(docSnap.id, docSnap));

        const suspendPromises = Array.from(allDocs.values()).map(lDoc => {
          const data = lDoc.data();
          if (data.status !== 'SUSPENDED' && data.status !== 'suspended') {
            return setDoc(lDoc.ref, {
              status: 'SUSPENDED',
              isSuspended: true,
              previousStatus: data.status || 'LIVE',
              updatedAt: serverTimestamp(),
              moderationNote: "Seller account suspended by administration."
            }, { merge: true }).catch(err => console.error("Error suspending listing:", err));
          }
          return Promise.resolve();
        });
        await Promise.all(suspendPromises);
      } catch (err) {
        console.error("Listing block err:", err);
      }
    })(),

    // Audit log
    (async () => {
      try {
        await setDoc(doc(collection(db, 'adminLogs')), {
          adminId: adminId || 'unknown_admin',
          adminEmail: adminEmail || 'Admin',
          adminCode: adminCode || null,
          blockedUserId: userId,
          targetEmail: uData.email || 'unknown',
          targetName: uData.name || 'User',
          action: 'BLOCK',
          timestamp: serverTimestamp(),
          reason: reason || "Administrative block"
        });
      } catch (err) {
        console.error("Audit log error:", err);
      }
    })(),

    // Notification to user
    (async () => {
      try {
        await setDoc(doc(collection(db, 'notifications')), {
          userId: userId,
          title: "🚫 Account Blocked & Restricted",
          message: "Your account has been blocked by administration due to policy violations.",
          read: false,
          createdAt: serverTimestamp(),
          type: 'ADMIN_ALERT'
        });
      } catch (err) {
        console.error("Notification write error:", err);
      }
    })()
  ]).catch(err => console.error("Block sub-tasks error:", err));
}

/**
 * Executes the standardized account unblock workflow.
 * Restores all platform access, lists, messages, reporting, and selling permissions, and user badges.
 */
export async function executeCentralUnblock(userId: string, adminEmail: string, adminId: string, adminCode?: string): Promise<void> {
  if (!userId) {
    throw new Error("Missing user identifier.");
  }

  // 1. Fetch current User Profile
  const userRef = doc(db, 'users', userId);
  let uData: any = {};
  
  try {
    const uDoc = await getDoc(userRef);
    if (!uDoc.exists()) {
      throw new Error("User profile not found.");
    }
    uData = uDoc.data();
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      throw err;
    }
    // Proceed with empty uData if it fails for other reasons, it will just overwrite fields
    console.warn("Could not fetch user profile for unblock, proceeding with forced unblock:", err);
  }

  const restoredBadges = uData.savedBadges || {};

  const unblockData: any = {
    isBlocked: false,
    accountStatus: 'active',
    status: 'ACTIVE',
    unblockedAt: serverTimestamp(),
    unblockedBy: adminEmail || 'Admin',
    blockReason: "",
    appealStatus: 'RESOLVED',
    isBanned: false,
    bannedUntil: null,
    bannedAt: null,
    bannedBy: null,
    banReason: "",
    banAppealStatus: 'accepted',
    biddingRestrictedPermanently: false,
    biddingBanDuration: null,
    biddingBanUntil: null,
    biddingRestrictedUntil: null,
    biddingAppealStatus: 'accepted',
    updatedAt: serverTimestamp(),
    reportingDisabled: false,
    canReport: true,
    postingDisabled: false,
    sellingDisabled: false,
    canPost: true,
    canSell: true,
    messagingDisabled: false,
    chatRestricted: false,
    canChat: true,
    offersDisabled: false,
    canSubmitOffers: true,
    negotiationsDisabled: false,
    canNegotiate: true,
    moderationHold: false,
    accessLimited: false,
    isSuspended: false,
    blockedAt: null,
    blockedBy: null
  };

  // Restore badge status and visibility safely
  unblockData.isVerified = restoredBadges.isVerified ?? uData.preBlockIsVerified ?? uData.isVerified ?? false;
  if (restoredBadges.verifiedBadgeType !== undefined) unblockData.verifiedBadgeType = restoredBadges.verifiedBadgeType;
  if (restoredBadges.badges !== undefined) unblockData.badges = restoredBadges.badges;
  if (restoredBadges.verifiedUntil !== undefined) unblockData.verifiedUntil = restoredBadges.verifiedUntil;
  if (restoredBadges.isPremium !== undefined) unblockData.isPremium = restoredBadges.isPremium;
  if (restoredBadges.premiumBadge !== undefined) unblockData.premiumBadge = restoredBadges.premiumBadge;
  if (restoredBadges.sellerBadges !== undefined) unblockData.sellerBadges = restoredBadges.sellerBadges;
  if (restoredBadges.trustBadges !== undefined) unblockData.trustBadges = restoredBadges.trustBadges;
  if (restoredBadges.achievementBadges !== undefined) unblockData.achievementBadges = restoredBadges.achievementBadges;

  // 1. Update profile - this is the most critical step
  await setDoc(userRef, unblockData, { merge: true });

  // Await sub-updates to ensure complete and smooth execution before returning
  await Promise.all([
    // 2. Restore listings (check ownerId, sellerId, and userId fields)
    (async () => {
      try {
        const [byOwner, bySeller, byUser] = await Promise.all([
          getDocs(query(collection(db, 'listings'), where('ownerId', '==', userId))),
          getDocs(query(collection(db, 'listings'), where('sellerId', '==', userId))),
          getDocs(query(collection(db, 'listings'), where('userId', '==', userId)))
        ]);

        const allListingDocs = new Map();
        [...byOwner.docs, ...bySeller.docs, ...byUser.docs].forEach(docSnap => {
          allListingDocs.set(docSnap.id, docSnap);
        });

        if (allListingDocs.size > 0) {
          const restorePromises = Array.from(allListingDocs.values()).map(lDoc => {
            const data = lDoc.data();
            const isSuspendedStatus = 
              data.status === 'SUSPENDED' || 
              data.status === 'suspended' || 
              data.status === 'INACTIVE' || 
              data.status === 'inactive' || 
              data.isSuspended === true;

            if (isSuspendedStatus) {
              return setDoc(lDoc.ref, {
                status: data.previousStatus || 'LIVE',
                isSuspended: false,
                updatedAt: serverTimestamp(),
                moderationNote: ""
              }, { merge: true }).catch(err => console.error("Single listing restore error:", err));
            }
            return Promise.resolve();
          });
          await Promise.all(restorePromises);
        }
      } catch (err) { 
        console.error("Listing restore err:", err); 
      }
    })(),

    // 3. Restore Chats
    (async () => {
      try {
        const [buyerSnap, sellerSnap, participantSnap] = await Promise.all([
          getDocs(query(collection(db, 'chats'), where('buyerId', '==', userId))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, 'chats'), where('sellerId', '==', userId))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, 'chats'), where('participants', 'array-contains', userId))).catch(() => ({ docs: [] }))
        ]);
        const allChatDocs = new Map();
        [...buyerSnap.docs, ...sellerSnap.docs, ...participantSnap.docs].forEach(cDoc => {
          allChatDocs.set(cDoc.id, cDoc);
        });

        const chatPromises = Array.from(allChatDocs.values()).map(cDoc => {
          const cData = cDoc.data();
          if (cData.isBlocked) {
            return setDoc(cDoc.ref, {
              isBlocked: false,
              blockedBy: null,
              updatedAt: serverTimestamp()
            }, { merge: true }).catch(err => console.error("Single chat restore error:", err));
          }
          return Promise.resolve();
        });
        await Promise.all(chatPromises);
      } catch (err) { 
        console.error("Chat restore err:", err); 
      }
    })(),

    // 4. Audit Log
    (async () => {
      try {
        await setDoc(doc(collection(db, 'adminLogs')), {
          adminId: adminId || 'unknown_admin',
          adminEmail: adminEmail || 'Admin',
          adminCode: adminCode || null,
          unblockedUserId: userId,
          targetEmail: uData.email || 'unknown',
          targetName: uData.name || 'User',
          action: 'UNBLOCK',
          timestamp: serverTimestamp(),
          reason: "Administrative manual unblock"
        });
      } catch (err) {
        console.error("Audit log error:", err);
      }
    })(),

    // 5. Notification
    (async () => {
      try {
        await setDoc(doc(collection(db, 'notifications')), {
          userId: userId,
          title: "🎉 Account Successfully Unblocked!",
          message: "Your account has been gracefully unblocked and restored.",
          read: false,
          createdAt: serverTimestamp(),
          type: 'ADMIN_ALERT'
        });
      } catch (err) {
        console.error("Notification write error:", err);
      }
    })()
  ]).catch(err => console.error("Unblock sub-tasks execution error:", err));
}

/**
 * Executes the standardized account ban workflow for a specified period (or permanent).
 * Stops the user from posting items and submitting bids till the period decided by the admin.
 */
export async function executeCentralBan(
  userId: string,
  adminEmail: string,
  adminId: string,
  durationDays: number | null, // null means permanent ban
  reason?: string
): Promise<{ bannedUntil: Date | null }> {
  if (!userId) {
    throw new Error("Missing user identifier.");
  }

  const bannedUntil = durationDays ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000) : null;
  const userRef = doc(db, 'users', userId);
  let uData: any = {};

  try {
    const uDoc = await getDoc(userRef);
    if (uDoc.exists()) {
      uData = uDoc.data();
    }
  } catch (err) {
    console.warn("Could not fetch user profile for ban, proceeding:", err);
  }

  const banData: any = {
    isBanned: true,
    accountStatus: 'banned',
    status: 'BANNED',
    bannedAt: serverTimestamp(),
    bannedBy: adminEmail || adminId || 'Admin',
    banReason: reason || "Administrative ban on violating community policies.",
    bannedUntil: bannedUntil ? Timestamp.fromDate(bannedUntil) : null,
    bannedDurationDays: durationDays,
    biddingRestrictedPermanently: !durationDays,
    biddingRestrictedUntil: bannedUntil ? Timestamp.fromDate(bannedUntil) : null,
    biddingAppealStatus: null,
    postingDisabled: true,
    sellingDisabled: true,
    canPost: false,
    canSell: false,
    biddingDisabled: true,
    canBid: false,
    reportingDisabled: true,
    canReport: false,
    offersDisabled: true,
    canSubmitOffers: false,
    negotiationsDisabled: true,
    canNegotiate: false,
    updatedAt: serverTimestamp(),
  };

  // 1. Update User Profile
  await setDoc(userRef, banData, { merge: true });

  // 2. Perform sub-tasks
  await Promise.all([
    // Update listings
    (async () => {
      try {
        const [byOwner, bySeller, byUser, arenaAuctions] = await Promise.all([
          getDocs(query(collection(db, 'listings'), where('ownerId', '==', userId))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, 'listings'), where('sellerId', '==', userId))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, 'listings'), where('userId', '==', userId))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, 'arena_auctions'), where('sellerId', '==', userId))).catch(() => ({ docs: [] }))
        ]);

        const allDocs = new Map();
        [...byOwner.docs, ...bySeller.docs, ...byUser.docs, ...arenaAuctions.docs].forEach(docSnap => allDocs.set(docSnap.id, docSnap));

        const suspendPromises = Array.from(allDocs.values()).map(lDoc => {
          const data = lDoc.data();
          return setDoc(lDoc.ref, {
            isSellerBanned: true,
            status: data.status === 'active' || data.status === 'LIVE' ? 'paused' : data.status,
            isPaused: true,
            updatedAt: serverTimestamp(),
            moderationNote: "Seller account banned by administration."
          }, { merge: true }).catch(err => console.error("Error updating listing for ban:", err));
        });
        await Promise.all(suspendPromises);
      } catch (err) {
        console.error("Listing ban err:", err);
      }
    })(),

    // Audit log
    (async () => {
      try {
        await setDoc(doc(collection(db, 'adminLogs')), {
          adminId: adminId || 'unknown_admin',
          adminEmail: adminEmail || 'Admin',
          bannedUserId: userId,
          targetEmail: uData.email || 'unknown',
          targetName: uData.name || 'User',
          action: 'BAN',
          bannedDurationDays: durationDays,
          bannedUntil: bannedUntil ? bannedUntil.toISOString() : 'PERMANENT',
          timestamp: serverTimestamp(),
          reason: reason || "Administrative ban"
        });
      } catch (err) {
        console.error("Audit log error:", err);
      }
    })(),

    // Notification
    (async () => {
      try {
        const untilText = bannedUntil 
          ? `until ${bannedUntil.toLocaleDateString()} ${bannedUntil.toLocaleTimeString()}`
          : "permanently";
        await setDoc(doc(collection(db, 'notifications')), {
          userId: userId,
          title: "🚫 Account Banned by Administration",
          message: `Your account has been banned ${untilText}. Posting items, reporting, submitting bids, and making negotiation offers are restricted. You can view your ban status and submit an appeal under your Profile, Battle Bids, or the Private Negotiation Hub.`,
          read: false,
          isRead: false,
          link: '/profile',
          actionUrl: '/profile',
          createdAt: serverTimestamp(),
          type: 'ADMIN_ALERT'
        });
      } catch (err) {
        console.error("Notification write error:", err);
      }
    })()
  ]).catch(err => console.error("Ban sub-tasks error:", err));

  return { bannedUntil };
}

/**
 * Executes the standardized account unban workflow.
 * Restores user posting, reporting, bidding, and negotiation offer privileges.
 */
export async function executeCentralUnban(
  userId: string, 
  adminEmail: string, 
  adminId: string
): Promise<void> {
  if (!userId) {
    throw new Error("Missing user identifier.");
  }

  const userRef = doc(db, 'users', userId);
  let uData: any = {};

  try {
    const uDoc = await getDoc(userRef);
    if (uDoc.exists()) {
      uData = uDoc.data();
    }
  } catch (err) {
    console.warn("Could not fetch user profile for unban:", err);
  }

  const unbanData: any = {
    isBanned: false,
    accountStatus: 'active',
    status: 'ACTIVE',
    unbannedAt: serverTimestamp(),
    unbannedBy: adminEmail || 'Admin',
    bannedUntil: null,
    bannedDurationDays: null,
    banReason: "",
    postingDisabled: false,
    sellingDisabled: false,
    canPost: true,
    canSell: true,
    biddingDisabled: false,
    canBid: true,
    biddingRestrictedPermanently: false,
    biddingRestrictedUntil: null,
    biddingAppealStatus: 'accepted',
    reportingDisabled: false,
    canReport: true,
    offersDisabled: false,
    canSubmitOffers: true,
    negotiationsDisabled: false,
    canNegotiate: true,
    updatedAt: serverTimestamp(),
  };

  await setDoc(userRef, unbanData, { merge: true });

  try {
    const [bySeller, arenaAuctions] = await Promise.all([
      getDocs(query(collection(db, 'listings'), where('sellerId', '==', userId))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'arena_auctions'), where('sellerId', '==', userId))).catch(() => ({ docs: [] }))
    ]);
    const allDocs = new Map();
    [...bySeller.docs, ...arenaAuctions.docs].forEach(docSnap => allDocs.set(docSnap.id, docSnap));

    const restorePromises = Array.from(allDocs.values()).map(lDoc => {
      return setDoc(lDoc.ref, {
        isSellerBanned: false,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(err => console.error("Listing unban error:", err));
    });
    await Promise.all(restorePromises);

    // Audit log
    await setDoc(doc(collection(db, 'adminLogs')), {
      adminId: adminId || 'unknown_admin',
      adminEmail: adminEmail || 'Admin',
      unbannedUserId: userId,
      targetEmail: uData.email || 'unknown',
      targetName: uData.name || 'User',
      action: 'UNBAN',
      timestamp: serverTimestamp(),
      reason: "Administrative unban"
    }).catch(err => console.error("Audit log write error:", err));

    // Notification
    await setDoc(doc(collection(db, 'notifications')), {
      userId: userId,
      title: "🎉 Account Ban Lifted!",
      message: "Your account ban has been lifted by administration. You can now post items, place bids, submit offers, and submit reports freely.",
      read: false,
      createdAt: serverTimestamp(),
      type: 'ADMIN_ALERT'
    }).catch(err => console.error("Notification write error:", err));
  } catch (err) {
    console.error("Unban listing restoration err:", err);
  }
}

/**
 * Checks if user profile is blocked.
 */
export function isUserBlocked(profile: any): boolean {
  if (!profile) return false;
  return profile.isBlocked === true || 
    profile.accountStatus === 'blocked' || 
    profile.status === 'BLOCKED' ||
    profile.status === 'blocked';
}

/**
 * Checks if user is blocked or actively banned.
 */
export function isUserBlockedOrBanned(profile: any): boolean {
  return isUserBlocked(profile) || isUserBanned(profile);
}

/**
 * Checks if user profile currently has an active administrative ban.
 * Returns true if user is banned (permanently or duration has not expired yet).
 */
export function isUserBanned(profile: any): boolean {
  if (!profile) return false;
  const hasBanFlag = profile.isBanned === true || 
                     profile.accountStatus === 'banned' || 
                     profile.status === 'BANNED' ||
                     profile.biddingRestrictedPermanently === true ||
                     Boolean(profile.biddingRestrictedUntil);
  if (!hasBanFlag) {
    return false;
  }
  if (profile.biddingRestrictedPermanently === true) {
    return true;
  }
  const banUntil = profile.bannedUntil || profile.biddingRestrictedUntil;
  if (!banUntil) {
    return true;
  }
  try {
    const until = typeof banUntil.toDate === 'function'
      ? banUntil.toDate()
      : (banUntil.seconds ? new Date(banUntil.seconds * 1000) : new Date(banUntil));
    if (!until || isNaN(until.getTime())) return true;
    return until.getTime() > Date.now();
  } catch {
    return true;
  }
}

/**
 * Returns formatted ban remaining details for UI display.
 */
export function getUserBanRemaining(profile: any): { 
  isBanned: boolean; 
  isPermanent: boolean; 
  untilDate: Date | null; 
  formattedText: string;
} {
  if (!isUserBanned(profile)) {
    return { isBanned: false, isPermanent: false, untilDate: null, formattedText: 'Active' };
  }
  const banUntil = profile.bannedUntil || profile.biddingRestrictedUntil;
  if (!banUntil || profile.biddingRestrictedPermanently === true) {
    return { isBanned: true, isPermanent: true, untilDate: null, formattedText: 'Permanently Banned' };
  }
  try {
    const until = typeof banUntil.toDate === 'function'
      ? banUntil.toDate()
      : (banUntil.seconds ? new Date(banUntil.seconds * 1000) : new Date(banUntil));
    if (!until || isNaN(until.getTime())) {
      return { isBanned: true, isPermanent: true, untilDate: null, formattedText: 'Permanently Banned' };
    }
    const diffMs = until.getTime() - Date.now();
    if (diffMs <= 0) {
      return { isBanned: false, isPermanent: false, untilDate: null, formattedText: 'Active (Ban Expired)' };
    }
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    return { 
      isBanned: true, 
      isPermanent: false, 
      untilDate: until, 
      formattedText: `Banned (${days} day${days > 1 ? 's' : ''} left)` 
    };
  } catch {
    return { isBanned: true, isPermanent: true, untilDate: null, formattedText: 'Permanently Banned' };
  }
}

/**
 * Submits an administrative ban appeal on behalf of a banned user.
 */
export async function submitUserBanAppeal(
  userId: string,
  userEmail: string,
  userName: string,
  appealMessage: string
): Promise<void> {
  if (!userId) throw new Error("User identifier required.");
  if (!appealMessage || !appealMessage.trim()) {
    throw new Error("Please provide a detailed appeal explanation.");
  }

  const userRef = doc(db, 'users', userId);
  const trimmed = appealMessage.trim();

  await setDoc(userRef, {
    banAppealStatus: 'pending',
    banAppealMessage: trimmed,
    banAppealSubmittedAt: serverTimestamp(),
    biddingAppealStatus: 'pending',
    biddingAppealMessage: trimmed,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // Notifications for Admin
  try {
    const adminNotifRef = doc(collection(db, 'notifications'));
    await setDoc(adminNotifRef, {
      userId: 'admin',
      type: 'ADMIN_ALERT',
      title: '⚖️ New Ban Appeal Submitted',
      message: `${userName || userEmail || 'A banned user'} has submitted a ban dispute appeal: "${trimmed.substring(0, 100)}${trimmed.length > 100 ? '...' : ''}"`,
      targetUserId: userId,
      userEmail: userEmail || '',
      userName: userName || 'User',
      appealMessage: trimmed,
      read: false,
      isRead: false,
      createdAt: serverTimestamp(),
    });

    // Also record in banAppeals collection for moderation oversight
    const appealDocRef = doc(collection(db, 'banAppeals'));
    await setDoc(appealDocRef, {
      userId,
      userEmail: userEmail || '',
      userName: userName || 'User',
      message: trimmed,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Admin notification for appeal write error:", err);
  }
}

/**
 * Checks if a user profile is currently paused.
 * Authoritative source of truth across Battle Bids, Private Negotiation Hub, and Marketplace.
 * Accurately filters out expired and unpaused accounts.
 */
export function isUserPaused(profile: any): boolean {
  if (!profile) return false;

  // 1. Expiration check: if pause has an expiration date and it has passed, account is not paused
  if (profile.pausedUntil) {
    try {
      const until = typeof profile.pausedUntil?.toDate === 'function'
        ? profile.pausedUntil.toDate()
        : (profile.pausedUntil?.seconds ? new Date(profile.pausedUntil.seconds * 1000) : new Date(profile.pausedUntil));
      if (until && !isNaN(until.getTime()) && Date.now() >= until.getTime()) {
        return false;
      }
    } catch {}
  }
  if (profile.pauseExpiresAt) {
    try {
      const until = typeof profile.pauseExpiresAt?.toDate === 'function'
        ? profile.pauseExpiresAt.toDate()
        : (profile.pauseExpiresAt?.seconds ? new Date(profile.pauseExpiresAt.seconds * 1000) : new Date(profile.pauseExpiresAt));
      if (until && !isNaN(until.getTime()) && Date.now() >= until.getTime()) {
        return false;
      }
    } catch {}
  }

  // 2. Unpause check: if explicitly active or unpaused
  if (profile.isPaused === false && (profile.accountStatus === 'active' || profile.status === 'ACTIVE' || profile.status === 'active')) {
    return false;
  }

  // 3. Timestamp resolution: if unpausedAt is more recent than pausedAt, and isPaused is not explicitly true
  if (profile.unpausedAt && profile.pausedAt && profile.isPaused !== true) {
    try {
      const unpausedTime = typeof profile.unpausedAt?.toDate === 'function'
        ? profile.unpausedAt.toDate().getTime()
        : (profile.unpausedAt?.seconds ? profile.unpausedAt.seconds * 1000 : new Date(profile.unpausedAt).getTime());
      const pausedTime = typeof profile.pausedAt?.toDate === 'function'
        ? profile.pausedAt.toDate().getTime()
        : (profile.pausedAt?.seconds ? profile.pausedAt.seconds * 1000 : new Date(profile.pausedAt).getTime());
      if (unpausedTime >= pausedTime) {
        return false;
      }
    } catch {}
  }

  // 4. Positive pause states across Battle Bids, Negotiations, and Admin hold
  return Boolean(
    profile.isPaused === true ||
    profile.accountStatus === 'paused' ||
    profile.status === 'PAUSED' ||
    profile.status === 'paused' ||
    profile.isPausedByAdmin === true ||
    profile.isPausedBySeller === true ||
    profile.moderationStatus === 'PAUSED' ||
    profile.moderationStatus === 'paused' ||
    profile.accountHold === true ||
    profile.isHold === true
  );
}

/**
 * Executes the standardized account pause workflow.
 * Sets isPaused, accountStatus, status to paused, pauses active listings/auctions.
 */
export async function executeCentralPause(
  userId: string,
  adminEmail: string,
  adminId: string,
  reason?: string,
  adminCode?: string
): Promise<void> {
  if (!userId) {
    throw new Error("Missing user identifier.");
  }

  const userRef = doc(db, 'users', userId);
  let uData: any = {};

  try {
    const uDoc = await getDoc(userRef);
    if (uDoc.exists()) {
      uData = uDoc.data();
    }
  } catch (err) {
    console.warn("Could not fetch user profile for pause:", err);
  }

  const pauseData: any = {
    isPaused: true,
    accountStatus: 'paused',
    status: 'PAUSED',
    pausedAt: serverTimestamp(),
    pausedBy: adminEmail || adminId || 'Admin',
    pauseReason: reason || "Account temporarily placed on pause by administration.",
    updatedAt: serverTimestamp(),
  };

  await setDoc(userRef, pauseData, { merge: true });

  // Update active listings & arena auctions to paused
  try {
    const [byOwner, bySeller, byUser, arenaAuctions] = await Promise.all([
      getDocs(query(collection(db, 'listings'), where('ownerId', '==', userId))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'listings'), where('sellerId', '==', userId))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'listings'), where('userId', '==', userId))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'arena_auctions'), where('sellerId', '==', userId))).catch(() => ({ docs: [] })),
    ]);

    const allDocs = new Map();
    [...byOwner.docs, ...bySeller.docs, ...byUser.docs, ...arenaAuctions.docs].forEach((d) => allDocs.set(d.id, d));

    const pausePromises = Array.from(allDocs.values()).map((lDoc) => {
      const data = lDoc.data();
      if (data.status === 'active' || data.status === 'LIVE') {
        return setDoc(
          lDoc.ref,
          {
            status: 'paused',
            isPaused: true,
            pausedByAccountHold: true,
            updatedAt: serverTimestamp(),
            moderationNote: "Account placed on pause by administration.",
          },
          { merge: true }
        ).catch((err) => console.error("Error pausing listing for account hold:", err));
      }
      return Promise.resolve();
    });
    await Promise.all(pausePromises);
  } catch (err) {
    console.error("Listing pause error:", err);
  }

  // Record admin audit log
  try {
    await setDoc(doc(collection(db, 'adminLogs')), {
      adminId: adminId || 'unknown_admin',
      adminEmail: adminEmail || 'Admin',
      adminCode: adminCode || '',
      targetUserId: userId,
      targetEmail: uData.email || 'unknown',
      targetName: uData.name || 'User',
      action: 'PAUSE_ACCOUNT',
      reason: reason || 'Administrative pause',
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Admin audit log write error:", err);
  }
}

/**
 * Executes the standardized account unpause / resume workflow.
 * Restores accountStatus to active, isPaused to false, and resumes listings paused by account hold.
 */
export async function executeCentralUnpause(
  userId: string,
  adminEmail: string,
  adminId: string,
  adminCode?: string
): Promise<void> {
  if (!userId) {
    throw new Error("Missing user identifier.");
  }

  const userRef = doc(db, 'users', userId);
  let uData: any = {};

  try {
    const uDoc = await getDoc(userRef);
    if (uDoc.exists()) {
      uData = uDoc.data();
    }
  } catch (err) {
    console.warn("Could not fetch user profile for unpause:", err);
  }

  const unpauseData: any = {
    isPaused: false,
    accountStatus: 'active',
    status: 'ACTIVE',
    unpausedAt: serverTimestamp(),
    unpausedBy: adminEmail || adminId || 'Admin',
    pauseReason: "",
    updatedAt: serverTimestamp(),
  };

  await setDoc(userRef, unpauseData, { merge: true });

  // Resume listings that were paused by account hold
  try {
    const [byOwner, bySeller, byUser, arenaAuctions] = await Promise.all([
      getDocs(query(collection(db, 'listings'), where('ownerId', '==', userId), where('pausedByAccountHold', '==', true))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'listings'), where('sellerId', '==', userId), where('pausedByAccountHold', '==', true))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'listings'), where('userId', '==', userId), where('pausedByAccountHold', '==', true))).catch(() => ({ docs: [] })),
      getDocs(query(collection(db, 'arena_auctions'), where('sellerId', '==', userId), where('pausedByAccountHold', '==', true))).catch(() => ({ docs: [] })),
    ]);

    const allDocs = new Map();
    [...byOwner.docs, ...bySeller.docs, ...byUser.docs, ...arenaAuctions.docs].forEach((d) => allDocs.set(d.id, d));

    const resumePromises = Array.from(allDocs.values()).map((lDoc) => {
      return setDoc(
        lDoc.ref,
        {
          status: 'active',
          isPaused: false,
          pausedByAccountHold: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((err) => console.error("Error resuming listing:", err));
    });
    await Promise.all(resumePromises);
  } catch (err) {
    console.error("Listing resume error:", err);
  }

  // Record admin audit log
  try {
    await setDoc(doc(collection(db, 'adminLogs')), {
      adminId: adminId || 'unknown_admin',
      adminEmail: adminEmail || 'Admin',
      adminCode: adminCode || '',
      targetUserId: userId,
      targetEmail: uData.email || 'unknown',
      targetName: uData.name || 'User',
      action: 'UNPAUSE_ACCOUNT',
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Admin audit log write error:", err);
  }
}


