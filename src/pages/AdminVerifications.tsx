import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  arrayUnion,
  deleteDoc,
  writeBatch,
  deleteField,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, KycApplication } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Trash2,
  RotateCcw,
  Search,
  Filter,
  Eye,
  UserCheck,
  AlertTriangle,
  Building,
  Building2,
  Store,
  User,
  Calendar,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  ZoomIn,
  X,
  ChevronRight,
  Shield,
  Award,
  RefreshCw
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

// Authoritative Accept KYC Appeal Logic
// Exported so Admin.tsx Appeals dashboard reuses the exact same authoritative workflow
// without duplicating mutations or creating redundant document writes.

export const executeAcceptKycAppealAuthoritative = async (
  db: any,
  app: KycApplication,
  adminEmail: string = 'Compliance Admin'
) => {
  const targetUserId = app.userId || app.id;
  const appId = app.id || targetUserId;
  const finalName = app.category === 'BUSINESS' ? (app.businessName || app.legalName) : app.legalName;
  const timestampStr = new Date().toISOString();

  const batch = writeBatch(db);
  const historyEntry = {
    action: 'Appeal Accepted',
    status: 'APPROVED',
    timestamp: timestampStr,
    reason: 'Appeal approved by compliance administrator. Verified status restored.',
    actionBy: adminEmail,
  };

  const kycDocData: any = {
    status: 'APPROVED',
    appealStatus: 'APPROVED',
    approvedAt: serverTimestamp(),
    appealApprovedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    revocationReason: '',
    history: arrayUnion(historyEntry),
  };
  batch.set(doc(db, 'kyc_applications', appId), kycDocData, { merge: true });

  batch.set(doc(db, 'kyc_private', targetUserId), {
    kycStatus: 'APPROVED',
    appealStatus: 'APPROVED',
    approvedAt: serverTimestamp(),
    appealApprovedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    revocationReason: '',
  }, { merge: true });

  const userUpdateData: any = {
    kycStatus: 'APPROVED',
    kycAppealStatus: 'APPROVED',
    isKycVerified: true,
    isVerified: true,
    kycRevocationReason: '',
    ...(finalName ? { kycApprovedName: finalName, name: finalName } : {}),
    ...(app.category ? { kycType: app.category } : {}),
    updatedAt: serverTimestamp(),
  };
  batch.set(doc(db, 'users', targetUserId), userUpdateData, { merge: true });

  const notifRef = doc(collection(db, 'notifications'));
  batch.set(notifRef, {
    id: notifRef.id,
    userId: targetUserId,
    title: 'KYC Appeal Accepted! 🎉',
    message: 'Your verification appeal was approved. Your verified Blue Tick and seller benefits have been fully restored.',
    type: 'KYC_STATUS',
    read: false,
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  return {
    appId,
    targetUserId,
    finalName,
    timestampStr,
    historyEntry,
  };
};

// Authoritative Reject KYC Appeal Logic
export const executeRejectKycAppealAuthoritative = async (
  db: any,
  app: KycApplication,
  reasonText: string,
  adminEmail: string = 'Compliance Admin'
) => {
  const targetUserId = app.userId || app.id;
  const appId = app.id || targetUserId;
  const finalName = app.category === 'BUSINESS' ? (app.businessName || app.legalName) : app.legalName;
  const timestampStr = new Date().toISOString();

  const batch = writeBatch(db);
  const historyEntry = {
    action: 'Appeal Rejected',
    status: 'REVOKED',
    timestamp: timestampStr,
    reason: reasonText,
    actionBy: adminEmail,
  };

  const kycDocData: any = {
    status: 'REVOKED',
    appealStatus: 'REJECTED',
    appealRejectedAt: serverTimestamp(),
    appealRejectionReason: reasonText,
    updatedAt: serverTimestamp(),
    history: arrayUnion(historyEntry),
  };
  batch.set(doc(db, 'kyc_applications', appId), kycDocData, { merge: true });

  batch.set(doc(db, 'kyc_private', targetUserId), {
    kycStatus: 'REVOKED',
    appealStatus: 'REJECTED',
    appealRejectedAt: serverTimestamp(),
    appealRejectionReason: reasonText,
    updatedAt: serverTimestamp(),
  }, { merge: true });

  const userUpdateData: any = {
    kycStatus: 'REVOKED',
    kycAppealStatus: 'REJECTED',
    kycAppealRejectionReason: reasonText,
    isKycVerified: false,
    isVerified: false,
    isPremiumVerified: false,
    updatedAt: serverTimestamp(),
  };
  batch.set(doc(db, 'users', targetUserId), userUpdateData, { merge: true });

  const notifRef = doc(collection(db, 'notifications'));
  batch.set(notifRef, {
    id: notifRef.id,
    userId: targetUserId,
    title: 'KYC Appeal Rejected',
    message: `Your verification restoration appeal was declined. Reason: "${reasonText}". You may submit a fresh KYC application.`,
    type: 'KYC_STATUS',
    read: false,
    createdAt: serverTimestamp(),
  });

  await batch.commit();

  return {
    appId,
    targetUserId,
    finalName,
    timestampStr,
    historyEntry,
  };
};

export function AdminVerifications() {
  const { user, isAdmin, isSuperAdmin, isAuthorizedAdmin, isAuthorizedPaymentVerifier, isKycAdmin, loading: authLoading } = useAuth();
  const hasKycAdminAccess = (isKycAdmin || isSuperAdmin || isAuthorizedAdmin) && !isAuthorizedPaymentVerifier;

  // Active section tabs
  const [activeTab, setActiveTab] = useState<'KYC' | 'GOLDEN_VERIFICATION'>('KYC');

  // KYC States
  const [kycApps, setKycApps] = useState<KycApplication[]>([]);
  const [kycStatusFilter, setKycStatusFilter] = useState<'ALL' | 'PENDING' | 'APPEALS' | 'APPROVED' | 'REJECTED' | 'REVOKED'>('ALL');
  const [kycSearchQuery, setKycSearchQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState<KycApplication | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // Golden Badge Seller Requests States
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [sellerSearchQuery, setSellerSearchQuery] = useState('');

  // Common UI States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null);

  // Reason Modal for Reject / Revoke / Reject Appeal
  const [reasonModal, setReasonModal] = useState<{
    isOpen: boolean;
    app: KycApplication | null;
    actionType: 'REJECT' | 'REVOKE' | 'REJECT_APPEAL';
    reason: string;
  }>({
    isOpen: false,
    app: null,
    actionType: 'REJECT',
    reason: '',
  });

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    onConfirm: () => {},
  });

  const [purgingPii, setPurgingPii] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!hasKycAdminAccess) {
      setLoading(false);
      return;
    }
    fetchAllData();
  }, [authLoading, hasKycAdminAccess]);

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([fetchKYCApps(), fetchPendingUsers()]);
    setLoading(false);
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchKYCApps(), fetchPendingUsers()]);
    setRefreshing(false);
  };

  const fetchPendingUsers = async () => {
    try {
      const q = query(
        collection(db, 'users'),
        where('verificationStatus', '==', 'PENDING')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((d) => ({
        ...d.data(),
        id: d.id,
      } as UserProfile));
      setPendingUsers(data);
    } catch (e) {
      console.warn('Could not fetch pending users from Firestore:', e);
    }
  };

  const fetchKYCApps = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'kyc_applications'));
      let apps = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          ...data,
          id: d.id,
          userId: data.userId || d.id,
          category: data.category || 'INDIVIDUAL',
          status: data.status || 'PENDING',
        } as KycApplication;
      });

      // Sort descending by submittedAt / createdAt
      apps.sort((a, b) => {
        const timeA = new Date(
          (a as any).submittedAt?.toDate?.() || a.submittedAt || (a as any).createdAt?.toDate?.() || (a as any).createdAt || 0
        ).getTime();
        const timeB = new Date(
          (b as any).submittedAt?.toDate?.() || b.submittedAt || (b as any).createdAt?.toDate?.() || (b as any).createdAt || 0
        ).getTime();
        return timeB - timeA;
      });

      setKycApps(apps);
    } catch (e) {
      console.error('Could not fetch KYC applications from Firestore:', e);
      setKycApps([]);
    }
  };

  // Execute KYC Status Transitions
  const executeKycStatusUpdate = async (
    app: KycApplication,
    newStatus: 'APPROVED' | 'REJECTED' | 'REVOKED',
    customReason?: string
  ) => {
    if (!hasKycAdminAccess) {
      alert('Action restricted: Only authorized KYC administrators can make KYC decisions.');
      return;
    }
    const targetUserId = app.userId || app.id;
    const appId = app.id || targetUserId;
    const finalName = app.category === 'BUSINESS' ? (app.businessName || app.legalName) : app.legalName;
    const reasonText = customReason?.trim() || (newStatus === 'APPROVED' ? 'Approved and verified by Compliance Administrator.' : 'Declined by compliance team.');
    const timestampStr = new Date().toISOString();

    setActioningId(appId);

    try {
      // 1. Update KYC Application document in Firestore
      const kycDocData: any = {
        status: newStatus,
        updatedAt: serverTimestamp(),
        history: arrayUnion({
          action: newStatus === 'APPROVED' ? 'Accepted' : newStatus === 'REJECTED' ? 'Rejected' : 'Revoked',
          status: newStatus,
          timestamp: timestampStr,
          reason: reasonText,
          actionBy: 'Compliance Admin'
        })
      };

      if (newStatus === 'APPROVED') {
        kycDocData.approvedAt = serverTimestamp();
        kycDocData.rejectionReason = '';
        kycDocData.revocationReason = '';
      } else if (newStatus === 'REJECTED') {
        kycDocData.rejectedAt = serverTimestamp();
        kycDocData.rejectionReason = reasonText;
      } else if (newStatus === 'REVOKED') {
        kycDocData.revokedAt = serverTimestamp();
        kycDocData.revocationReason = reasonText;
      }

      // Write atomically across kyc_applications, kyc_private, and users
      const batch = writeBatch(db);
      batch.set(doc(db, 'kyc_applications', appId), kycDocData, { merge: true });
      if (targetUserId && targetUserId !== appId) {
        batch.set(doc(db, 'kyc_applications', targetUserId), kycDocData, { merge: true });
      }

      // Also sync kyc_private
      const privData: any = {
        kycStatus: newStatus,
        updatedAt: serverTimestamp(),
      };
      if (newStatus === 'APPROVED') {
        privData.approvedAt = serverTimestamp();
      } else if (newStatus === 'REJECTED') {
        privData.rejectedAt = serverTimestamp();
        privData.rejectionReason = reasonText;
      } else if (newStatus === 'REVOKED') {
        privData.revokedAt = serverTimestamp();
        privData.revocationReason = reasonText;
      }
      batch.set(doc(db, 'kyc_private', targetUserId), privData, { merge: true });

      // 2. Update User profile document in Firestore
      const userUpdateData: any = {
        kycStatus: newStatus,
        isKycVerified: newStatus === 'APPROVED',
        isVerified: newStatus === 'APPROVED',
        updatedAt: serverTimestamp(),
      };

      if (newStatus === 'APPROVED') {
        userUpdateData.kycApprovedName = finalName;
        userUpdateData.name = finalName; // Lock name to approved identity
        userUpdateData.kycType = app.category;
      } else if (newStatus === 'REJECTED') {
        userUpdateData.kycRejectionReason = reasonText;
        userUpdateData.isVerified = false;
        userUpdateData.isPremiumVerified = false;
        userUpdateData.isKycVerified = false;
      } else if (newStatus === 'REVOKED') {
        userUpdateData.kycRevocationReason = reasonText;
        userUpdateData.isVerified = false;
        userUpdateData.isPremiumVerified = false;
        userUpdateData.isKycVerified = false;
      }

      batch.set(doc(db, 'users', targetUserId), userUpdateData, { merge: true });

      // Commit all authoritative documents in a single atomic batch
      await batch.commit();

      // 3. Dispatch in-app notification
      try {
        const notifRef = doc(collection(db, 'notifications'));
        const notifTitle =
          newStatus === 'APPROVED'
            ? 'KYC Account Verified! 🎉'
            : newStatus === 'REJECTED'
            ? 'KYC Application Declined ⚠️'
            : 'KYC Verification Revoked ❌';

        const notifMessage =
          newStatus === 'APPROVED'
            ? `Congratulations! Your identity has been verified as ${app.category}. You have unlocked the verified blue tick badge!`
            : newStatus === 'REJECTED'
            ? `Your KYC account verification was rejected. Reason: ${reasonText}`
            : `Your KYC account verification status was revoked. Reason: ${reasonText}`;

        await setDoc(notifRef, {
          id: notifRef.id,
          userId: targetUserId,
          title: notifTitle,
          message: notifMessage,
          type: 'KYC_STATUS',
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (eNotif) {
        console.warn('Firestore notification write error:', eNotif);
      }

      // 4. Update React State immediately
      setKycApps((prev) =>
        prev.map((a) =>
          a.id === appId || a.userId === targetUserId
            ? {
                ...a,
                status: newStatus,
                rejectionReason: newStatus === 'REJECTED' ? reasonText : '',
                revocationReason: newStatus === 'REVOKED' ? reasonText : '',
                approvedAt: newStatus === 'APPROVED' ? timestampStr : a.approvedAt,
                rejectedAt: newStatus === 'REJECTED' ? timestampStr : a.rejectedAt,
                revokedAt: newStatus === 'REVOKED' ? timestampStr : a.revokedAt,
                history: [
                  ...(a.history || []),
                  {
                    action: newStatus === 'APPROVED' ? 'Accepted' : newStatus === 'REJECTED' ? 'Rejected' : 'Revoked',
                    status: newStatus,
                    timestamp: timestampStr,
                    reason: reasonText,
                    actionBy: 'Compliance Admin'
                  },
                ],
              }
            : a
        )
      );

      if (selectedApp && (selectedApp.id === appId || selectedApp.userId === targetUserId)) {
        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                status: newStatus,
                rejectionReason: newStatus === 'REJECTED' ? reasonText : '',
                revocationReason: newStatus === 'REVOKED' ? reasonText : '',
              }
            : null
        );
      }

      setAlertInfo({
        type: 'success',
        title: `Application ${newStatus === 'APPROVED' ? 'Approved' : newStatus === 'REJECTED' ? 'Rejected' : 'Revoked'}`,
        message: `KYC application for ${finalName} has been successfully updated to ${newStatus}.`,
      });
    } catch (err: any) {
      console.error('KYC update error:', err);
      setAlertInfo({
        type: 'error',
        title: 'Update Error',
        message: err?.message || 'An error occurred while updating the KYC status.',
      });
    } finally {
      setActioningId(null);
    }
  };

  // Accept Appeal Handler
  const executeAcceptAppeal = async (app: KycApplication) => {
    const targetUserId = app.userId || app.id;
    const appId = app.id || targetUserId;

    setActioningId(appId);
    try {
      const result = await executeAcceptKycAppealAuthoritative(db, app, user?.email || 'Compliance Admin');

      setKycApps((prev) =>
        prev.map((a) =>
          a.id === appId || a.userId === targetUserId
            ? {
                ...a,
                status: 'APPROVED',
                appealStatus: 'APPROVED',
                approvedAt: result.timestampStr,
                history: [...(a.history || []), result.historyEntry],
              }
            : a
        )
      );

      if (selectedApp && (selectedApp.id === appId || selectedApp.userId === targetUserId)) {
        setSelectedApp((prev) => (prev ? { ...prev, status: 'APPROVED', appealStatus: 'APPROVED' } : null));
      }

      setAlertInfo({
        type: 'success',
        title: 'Appeal Accepted',
        message: `KYC appeal for ${result.finalName} has been accepted and verification restored.`,
      });
    } catch (err: any) {
      console.error('Accept appeal error:', err);
      setAlertInfo({
        type: 'error',
        title: 'Update Error',
        message: err?.message || 'Failed to accept appeal.',
      });
    } finally {
      setActioningId(null);
    }
  };

  // Reject Appeal Handler
  const executeRejectAppeal = async (app: KycApplication, reasonText: string) => {
    const targetUserId = app.userId || app.id;
    const appId = app.id || targetUserId;

    setActioningId(appId);
    try {
      const result = await executeRejectKycAppealAuthoritative(db, app, reasonText, user?.email || 'Compliance Admin');

      setKycApps((prev) =>
        prev.map((a) =>
          a.id === appId || a.userId === targetUserId
            ? {
                ...a,
                status: 'REVOKED',
                appealStatus: 'REJECTED',
                appealRejectionReason: reasonText,
                history: [...(a.history || []), result.historyEntry],
              }
            : a
        )
      );

      if (selectedApp && (selectedApp.id === appId || selectedApp.userId === targetUserId)) {
        setSelectedApp((prev) =>
          prev ? { ...prev, status: 'REVOKED', appealStatus: 'REJECTED', appealRejectionReason: reasonText } : null
        );
      }

      setAlertInfo({
        type: 'success',
        title: 'Appeal Rejected',
        message: `Appeal for ${result.finalName} has been rejected. The user can now start a fresh KYC application.`,
      });
    } catch (err: any) {
      console.error('Reject appeal error:', err);
      setAlertInfo({
        type: 'error',
        title: 'Update Error',
        message: err?.message || 'Failed to reject appeal.',
      });
    } finally {
      setActioningId(null);
    }
  };

  // Open Rejection / Revocation / Reject Appeal Reason Dialog
  const promptReasonModal = (app: KycApplication, actionType: 'REJECT' | 'REVOKE' | 'REJECT_APPEAL') => {
    setReasonModal({
      isOpen: true,
      app,
      actionType,
      reason: '',
    });
  };

  // Submit Rejection / Revocation / Reject Appeal
  const handleReasonSubmit = async () => {
    if (!reasonModal.app) return;
    const trimmed = reasonModal.reason.trim();
    if (!trimmed) {
      alert('Please provide a reason for the user.');
      return;
    }
    const app = reasonModal.app;
    const action = reasonModal.actionType;
    setReasonModal({ isOpen: false, app: null, actionType: 'REJECT', reason: '' });
    if (action === 'REJECT_APPEAL') {
      await executeRejectAppeal(app, trimmed);
    } else {
      await executeKycStatusUpdate(app, action === 'REJECT' ? 'REJECTED' : 'REVOKED', trimmed);
    }
  };

  // Handle Permanent Delete of KYC document
  const handleKycDelete = (app: KycApplication) => {
    const targetUserId = app.userId || app.id;
    const appId = app.id || targetUserId;
    setConfirmModal({
      isOpen: true,
      title: 'Permanently Remove Application?',
      message: `Are you sure you want to delete this KYC application for ${app.legalName}? This will purge the record and allow the user to submit a fresh application.`,
      confirmLabel: 'Delete Record',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setActioningId(appId);
        try {
          await deleteDoc(doc(db, 'kyc_applications', appId));
          if (targetUserId && targetUserId !== appId) {
            try {
              await deleteDoc(doc(db, 'kyc_applications', targetUserId));
            } catch (e) {}
          }
          await setDoc(
            doc(db, 'users', targetUserId),
            {
              kycStatus: 'PERMANENTLY_REMOVED',
              isKycVerified: false,
              isVerified: false,
              isPremiumVerified: false,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          setKycApps((prev) => prev.filter((a) => a.id !== appId && a.userId !== targetUserId));
          if (selectedApp && (selectedApp.id === appId || selectedApp.userId === targetUserId)) {
            setSelectedApp(null);
          }
          setAlertInfo({
            type: 'success',
            title: 'Application Removed',
            message: 'KYC application record has been permanently removed.',
          });
        } catch (err: any) {
          console.error('Delete KYC error:', err);
          setAlertInfo({
            type: 'error',
            title: 'Removal Error',
            message: err?.message || 'Could not delete KYC document.',
          });
        } finally {
          setActioningId(null);
        }
      },
    });
  };

  // Golden Badge Seller Verification Actions
  const handleGoldenSellerAction = async (userProfile: UserProfile, action: 'APPROVE' | 'REJECT') => {
    if (!hasKycAdminAccess) {
      alert('Action restricted: Only authorized administrators can take seller badge actions.');
      return;
    }
    if (action === 'APPROVE') {
      if (userProfile.kycStatus !== 'APPROVED') {
        setAlertInfo({
          type: 'error',
          title: 'KYC Required',
          message: 'Cannot approve Golden Verified Badge until user completes and gets approved for KYC Identity verification.',
        });
        return;
      }
      if (userProfile.isBlocked === true || userProfile.accountStatus === 'blocked' || userProfile.accountStatus === 'deleted') {
        setAlertInfo({
          type: 'error',
          title: 'Account Blocked',
          message: 'Cannot approve Golden Verified Badge for a blocked user account.',
        });
        return;
      }
    }

    setConfirmModal({
      isOpen: true,
      title: `${action === 'APPROVE' ? 'Approve' : 'Reject'} Golden Badge?`,
      message: `Are you sure you want to ${action.toLowerCase()} the Golden Verified Seller badge for ${userProfile.name}?`,
      confirmLabel: action === 'APPROVE' ? 'Approve Golden Badge' : 'Reject Request',
      isDestructive: action === 'REJECT',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setActioningId(userProfile.id);
        try {
          const userRef = doc(db, 'users', userProfile.id);
          const updateData: any = {
            verificationStatus: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            verifiedBadgeRequestStatus: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            updatedAt: serverTimestamp(),
          };

          if (action === 'APPROVE') {
            updateData.isPremiumVerified = true;
            updateData.verifiedBadgeType = 'GOLDEN';
            updateData.isVerified = true;
          } else {
            updateData.isPremiumVerified = false;
          }

          await setDoc(userRef, updateData, { merge: true });

          // Sync promotionRequests and verification_applications
          try {
            const pReqQuery = query(
              collection(db, 'promotionRequests'),
              where('userId', '==', userProfile.id),
              where('type', '==', 'VERIFIED'),
              where('status', '==', 'PENDING')
            );
            const pReqSnap = await getDocs(pReqQuery);
            for (const d of pReqSnap.docs) {
              await setDoc(
                doc(db, 'promotionRequests', d.id),
                {
                  status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
                  updatedAt: serverTimestamp(),
                  approvedAt: action === 'APPROVE' ? serverTimestamp() : null,
                  rejectedAt: action === 'REJECT' ? serverTimestamp() : null,
                },
                { merge: true }
              );
            }
          } catch (err) {
            console.warn('Sync promotionRequests error:', err);
          }

          try {
            const vReqQuery = query(
              collection(db, 'verification_applications'),
              where('userId', '==', userProfile.id),
              where('status', '==', 'PENDING')
            );
            const vReqSnap = await getDocs(vReqQuery);
            for (const d of vReqSnap.docs) {
              await setDoc(
                doc(db, 'verification_applications', d.id),
                {
                  status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              );
            }
          } catch (err2) {
            console.warn('Sync verification_applications error:', err2);
          }

          // In-app notification
          try {
            const notifRef = doc(collection(db, 'notifications'));
            await setDoc(notifRef, {
              id: notifRef.id,
              userId: userProfile.id,
              title: action === 'APPROVE' ? 'Golden Badge Approved! 🏆' : 'Badge Request Rejected',
              message:
                action === 'APPROVE'
                  ? 'Congratulations! You are now a Golden Verified Seller on Mandi.pk'
                  : 'Your request for the Golden Badge was rejected by the compliance team.',
              type: 'VERIFICATION_STATUS',
              relatedId: userProfile.id,
              read: false,
              createdAt: serverTimestamp(),
            });
          } catch (eNotif) {
            console.warn('Notification write error:', eNotif);
          }

          setPendingUsers((prev) => prev.filter((u) => u.id !== userProfile.id));
          setAlertInfo({
            type: 'success',
            title: `Seller ${action === 'APPROVE' ? 'Approved' : 'Rejected'}`,
            message: `Golden Badge verification for ${userProfile.name} has been ${action.toLowerCase()}d.`,
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `users/${userProfile.id}`);
          setAlertInfo({
            type: 'error',
            title: 'Verification Action Failed',
            message: 'Could not complete update. Please check database permissions.',
          });
        } finally {
          setActioningId(null);
        }
      },
    });
  };

  const handlePurgeLegacyUserPii = async () => {
    if (!hasKycAdminAccess) return;
    setConfirmModal({
      isOpen: true,
      title: 'Audit & Clean Legacy Sensitive User PII',
      message:
        'This will scan all public users/{uid} documents in the database and permanently prune legacy sensitive KYC fields (cnicNumber, residentialAddress, cnicFrontPhoto, cnicBackPhoto, selfiePhoto) using atomic deleteField operations. Proceed?',
      confirmLabel: 'Run PII Cleanup',
      isDestructive: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setPurgingPii(true);
        try {
          const usersSnap = await getDocs(collection(db, 'users'));
          const sensitiveKeys = [
            'cnicNumber',
            'residentialAddress',
            'cnicFrontPhoto',
            'cnicBackPhoto',
            'selfiePhoto',
          ];
          let cleanedDocs = 0;
          let totalKeysPruned = 0;
          const batch = writeBatch(db);
          let hasBatchOps = false;

          for (const docSnap of usersSnap.docs) {
            const data = docSnap.data();
            const updates: Record<string, any> = {};
            for (const key of sensitiveKeys) {
              if (key in data) {
                updates[key] = deleteField();
                totalKeysPruned++;
              }
            }
            if (Object.keys(updates).length > 0) {
              batch.update(doc(db, 'users', docSnap.id), updates);
              cleanedDocs++;
              hasBatchOps = true;
            }
          }

          if (hasBatchOps) {
            await batch.commit();
            setAlertInfo({
              type: 'success',
              title: 'Cleanup Complete',
              message: `Successfully purged ${totalKeysPruned} legacy sensitive field(s) across ${cleanedDocs} user document(s).`,
            });
          } else {
            setAlertInfo({
              type: 'success',
              title: 'Database Clean',
              message: `Scanned ${usersSnap.size} user documents. All documents are already 100% clean of legacy sensitive KYC fields.`,
            });
          }
        } catch (err: any) {
          console.error('Legacy PII purge error:', err);
          setAlertInfo({
            type: 'error',
            title: 'Cleanup Error',
            message: err?.message || 'Failed to clean legacy PII.',
          });
        } finally {
          setPurgingPii(false);
        }
      },
    });
  };

  const isAppAppealPending = (app: KycApplication) => {
    return (
      app.status === 'RESUME_REQUESTED' ||
      (app.status === 'REVOKED' && (app as any).appealStatus === 'PENDING') ||
      (app.status === 'REVOKED' && !!(app as any).appealMessage && (app as any).appealStatus !== 'REJECTED' && (app as any).appealStatus !== 'APPROVED')
    );
  };

  // Filtered KYC Applications
  const filteredKycApps = useMemo(() => {
    return kycApps.filter((app) => {
      // Exclude appeals against revoked KYC verifications (routed to Admin -> Appeals)
      if (isAppAppealPending(app) || app.status === 'RESUME_REQUESTED') {
        return false;
      }
      // Status filter
      if (kycStatusFilter !== 'ALL' && app.status !== kycStatusFilter) {
        return false;
      }
      // Search query
      if (kycSearchQuery.trim()) {
        const q = kycSearchQuery.toLowerCase().trim();
        const name = (app.legalName || '').toLowerCase();
        const bName = (app.businessName || '').toLowerCase();
        const cName = (app.companyName || '').toLowerCase();
        const repName = (app.repName || '').toLowerCase();
        const regNo = (app.registrationNumber || '').toLowerCase();
        const cnic = (app.cnicNumber || app.repIdentityNumber || '').toLowerCase();
        const email = (app.userEmail || '').toLowerCase();
        const phone = (app.mobileNumber || app.repPhone || app.businessPhone || '').toLowerCase();
        const track = (app.trackingNumber || '').toLowerCase();
        const uid = (app.userId || app.id || '').toLowerCase();
        return (
          name.includes(q) ||
          bName.includes(q) ||
          cName.includes(q) ||
          repName.includes(q) ||
          regNo.includes(q) ||
          cnic.includes(q) ||
          email.includes(q) ||
          phone.includes(q) ||
          track.includes(q) ||
          uid.includes(q)
        );
      }
      return true;
    });
  }, [kycApps, kycStatusFilter, kycSearchQuery]);

  // Filtered Pending Golden Badge Users
  const filteredPendingUsers = useMemo(() => {
    return pendingUsers.filter((u) => {
      if (!sellerSearchQuery.trim()) return true;
      const q = sellerSearchQuery.toLowerCase().trim();
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const city = (u.city || '').toLowerCase();
      const phone = (u.phoneNumber || '').toLowerCase();
      return name.includes(q) || email.includes(q) || city.includes(q) || phone.includes(q);
    });
  }, [pendingUsers, sellerSearchQuery]);

  // Statistics counters
  const kycPendingCount = useMemo(() => kycApps.filter((a) => a.status === 'PENDING').length, [kycApps]);
  const kycAppealsCount = useMemo(() => kycApps.filter(isAppAppealPending).length, [kycApps]);
  const kycApprovedCount = useMemo(() => kycApps.filter((a) => a.status === 'APPROVED').length, [kycApps]);
  const kycRejectedCount = useMemo(() => kycApps.filter((a) => a.status === 'REJECTED').length, [kycApps]);
  const kycRevokedCount = useMemo(() => kycApps.filter((a) => a.status === 'REVOKED').length, [kycApps]);

  if (!hasKycAdminAccess) {
    return (
      <div className="max-w-4xl mx-auto py-24 px-4 text-center">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-stone-900 mb-2">Access Restricted</h2>
        <p className="text-stone-600">You must be logged in as an authorized KYC administrator to access the Verification Control Center.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-20">
      {/* Top Header */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">
                  Verification & Compliance
                </h1>
              </div>
              <p className="text-sm text-stone-500 mt-1">
                Review and manage identity documents (Government-Issued Identity Documents / Business & Company Verifications) and Golden Verified Seller badges.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                id="btn-refresh-verifications"
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 transition"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>

              <button
                id="btn-purge-legacy-pii"
                onClick={handlePurgeLegacyUserPii}
                disabled={purgingPii}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl bg-stone-100 hover:bg-amber-50 text-stone-700 hover:text-amber-800 border border-stone-200 hover:border-amber-300 transition"
                title="Scan and permanently delete any legacy sensitive KYC fields from public user documents"
              >
                <ShieldAlert className={`w-4 h-4 ${purgingPii ? 'animate-spin text-amber-600' : 'text-amber-600'}`} />
                {purgingPii ? 'Cleaning PII...' : 'Clean Legacy PII'}
              </button>

              <div className="flex bg-emerald-50 text-emerald-800 px-3.5 py-2 rounded-xl text-sm font-bold border border-emerald-200 items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>{kycPendingCount + pendingUsers.length} Total Pending</span>
              </div>
            </div>
          </div>

          {/* Section Navigation Tabs */}
          <div className="flex border-b border-stone-200 mt-6 -mb-5 gap-4 sm:gap-8 overflow-x-auto">
            <button
              id="tab-kyc-documents"
              onClick={() => setActiveTab('KYC')}
              className={`pb-4 px-1 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
                activeTab === 'KYC'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>KYC Identity Documents (Government-Issued ID & Business/Company)</span>
              {kycPendingCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-black bg-emerald-100 text-emerald-800 rounded-full">
                  {kycPendingCount}
                </span>
              )}
            </button>

            <button
              id="tab-golden-verifications"
              onClick={() => setActiveTab('GOLDEN_VERIFICATION')}
              className={`pb-4 px-1 text-sm font-bold flex items-center gap-2 border-b-2 transition whitespace-nowrap ${
                activeTab === 'GOLDEN_VERIFICATION'
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              <Award className="w-4 h-4 text-amber-500" />
              <span>Golden Seller Badge Requests</span>
              {pendingUsers.length > 0 && (
                <span className="px-2 py-0.5 text-xs font-black bg-amber-100 text-amber-800 rounded-full">
                  {pendingUsers.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Global Feedback Banner */}
        {alertInfo && (
          <div
            className={`mb-6 p-4 rounded-2xl flex items-start justify-between border ${
              alertInfo.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-red-50 text-red-900 border-red-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {alertInfo.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              )}
              <div>
                <h4 className="font-bold text-sm">{alertInfo.title}</h4>
                <p className="text-xs sm:text-sm mt-0.5 opacity-90">{alertInfo.message}</p>
              </div>
            </div>
            <button
              onClick={() => setAlertInfo(null)}
              className="text-stone-400 hover:text-stone-700 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 1: KYC IDENTITY DOCUMENTS (CNIC) */}
        {activeTab === 'KYC' && (
          <div>
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6">
              <div
                onClick={() => setKycStatusFilter('PENDING')}
                className={`cursor-pointer p-4 rounded-2xl border transition ${
                  kycStatusFilter === 'PENDING'
                    ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Pending</span>
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-black text-stone-900 mt-1">{kycPendingCount}</div>
              </div>

              <div
                onClick={() => setKycStatusFilter('APPEALS')}
                className={`cursor-pointer p-4 rounded-2xl border transition ${
                  kycStatusFilter === 'APPEALS'
                    ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Appeals</span>
                  <RotateCcw className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-black text-blue-700 mt-1">{kycAppealsCount}</div>
              </div>

              <div
                onClick={() => setKycStatusFilter('APPROVED')}
                className={`cursor-pointer p-4 rounded-2xl border transition ${
                  kycStatusFilter === 'APPROVED'
                    ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Approved</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-black text-emerald-700 mt-1">{kycApprovedCount}</div>
              </div>

              <div
                onClick={() => setKycStatusFilter('REJECTED')}
                className={`cursor-pointer p-4 rounded-2xl border transition ${
                  kycStatusFilter === 'REJECTED'
                    ? 'bg-red-50 border-red-300 ring-2 ring-red-400'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Rejected</span>
                  <XCircle className="w-4 h-4 text-red-500" />
                </div>
                <div className="text-2xl font-black text-red-700 mt-1">{kycRejectedCount}</div>
              </div>

              <div
                onClick={() => setKycStatusFilter('REVOKED')}
                className={`cursor-pointer p-4 rounded-2xl border transition ${
                  kycStatusFilter === 'REVOKED'
                    ? 'bg-stone-100 border-stone-400 ring-2 ring-stone-400'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Revoked</span>
                  <ShieldAlert className="w-4 h-4 text-stone-500" />
                </div>
                <div className="text-2xl font-black text-stone-800 mt-1">{kycRevokedCount}</div>
              </div>
            </div>

            {/* Controls Bar: Search & Status Filters */}
            <div className="bg-white border border-stone-200 rounded-2xl p-4 mb-6 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by name, company, registration number, Identity Document Number, email, phone..."
                  value={kycSearchQuery}
                  onChange={(e) => setKycSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {kycSearchQuery && (
                  <button
                    onClick={() => setKycSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'REVOKED'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setKycStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                      kycStatusFilter === st
                        ? 'bg-stone-900 text-white shadow-sm'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Applications List */}
            {loading ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-16 text-center shadow-sm">
                <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
                <p className="text-stone-600 font-semibold">Loading KYC applications...</p>
              </div>
            ) : filteredKycApps.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-16 text-center shadow-sm">
                <div className="w-16 h-16 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-stone-900 mb-1">No KYC Applications Found</h3>
                <p className="text-stone-500 text-sm max-w-md mx-auto">
                  {kycSearchQuery || kycStatusFilter !== 'ALL'
                    ? 'No records match the selected filters or search terms. Try clearing your search.'
                    : 'There are currently no KYC verification requests submitted by users.'}
                </p>
                {(kycSearchQuery || kycStatusFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setKycSearchQuery('');
                      setKycStatusFilter('ALL');
                    }}
                    className="mt-4 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:gap-6">
                {filteredKycApps.map((app) => {
                  const targetUserId = app.userId || app.id;
                  const category = app.category || 'INDIVIDUAL';
                  const isCompany = category === 'FIRM_COMPANY';
                  const isOwnBusiness = category === 'OWN_BUSINESS' || category === 'BUSINESS';
                  const isIndividual = !isCompany && !isOwnBusiness;

                  const categoryLabel = isCompany
                    ? 'FIRM / COMPANY KYC'
                    : isOwnBusiness
                    ? 'OWN BUSINESS KYC'
                    : 'INDIVIDUAL KYC';

                  const categoryBadgeStyle = isCompany
                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                    : isOwnBusiness
                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                    : 'bg-blue-100 text-blue-800 border border-blue-200';

                  const displayName = isCompany
                    ? (app.companyName || app.businessName || app.legalName)
                    : isOwnBusiness
                    ? (app.businessName || app.legalName)
                    : app.legalName;

                  const isActioning = actioningId === app.id || actioningId === targetUserId;

                  return (
                    <div
                      key={app.id}
                      className={`bg-white border rounded-2xl overflow-hidden shadow-sm transition hover:shadow-md ${
                        app.status === 'APPROVED'
                          ? 'border-emerald-200'
                          : app.status === 'REJECTED'
                          ? 'border-red-200'
                          : app.status === 'REVOKED'
                          ? 'border-stone-300'
                          : 'border-amber-200'
                      }`}
                    >
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                          {/* Left Details Column */}
                          <div className="flex-1 space-y-4">
                            {/* Header row with badges */}
                            <div className="flex flex-wrap items-center gap-2">
                              {isAppAppealPending(app) && (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Appeal Pending</span>
                                </span>
                              )}

                              <span
                                className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                                  app.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : app.status === 'REJECTED'
                                    ? 'bg-red-100 text-red-800 border border-red-200'
                                    : app.status === 'REVOKED'
                                    ? 'bg-stone-200 text-stone-800 border border-stone-300'
                                    : 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                                }`}
                              >
                                {app.status === 'APPROVED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                {app.status === 'REJECTED' && <XCircle className="w-3.5 h-3.5" />}
                                {app.status === 'REVOKED' && <ShieldAlert className="w-3.5 h-3.5" />}
                                {app.status === 'PENDING' && <Clock className="w-3.5 h-3.5" />}
                                <span>{app.status}</span>
                              </span>

                              <span
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${categoryBadgeStyle}`}
                              >
                                {isCompany ? (
                                  <Building2 className="w-3.5 h-3.5" />
                                ) : isOwnBusiness ? (
                                  <Store className="w-3.5 h-3.5" />
                                ) : (
                                  <User className="w-3.5 h-3.5" />
                                )}
                                <span>{categoryLabel}</span>
                              </span>

                              {app.trackingNumber && (
                                <span className="text-xs font-mono bg-stone-100 text-stone-600 px-2 py-1 rounded-lg border border-stone-200">
                                  #{app.trackingNumber}
                                </span>
                              )}
                            </div>

                            {/* User Name & Details */}
                            <div>
                              <h3 className="text-xl font-bold text-stone-900 flex items-center gap-2">
                                <span>{displayName}</span>
                                {app.status === 'APPROVED' && (
                                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                                )}
                              </h3>

                              {isCompany && (
                                <div className="text-xs text-stone-500 font-medium mt-1 space-y-0.5">
                                  <p>
                                    Authorized Rep:{' '}
                                    <span className="text-stone-800 font-bold">{app.repName || app.legalName}</span>
                                    {app.repDesignation && (
                                      <span className="text-stone-500 font-normal ml-1">({app.repDesignation})</span>
                                    )}
                                  </p>
                                  {app.registrationNumber && (
                                    <p className="font-mono text-[11px] text-stone-600">
                                      Reg No: <span className="font-bold">{app.registrationNumber}</span>
                                    </p>
                                  )}
                                </div>
                              )}

                              {isOwnBusiness && (
                                <div className="text-xs text-stone-500 font-medium mt-1 space-y-0.5">
                                  <p>
                                    Owner: <span className="text-stone-800 font-bold">{app.legalName}</span>
                                  </p>
                                  {app.businessType && (
                                    <p className="text-[11px] text-stone-600">
                                      Category: <span className="font-semibold">{app.businessType}</span>
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 text-xs">
                              <div className="flex items-center gap-2 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                                <CreditCard className="w-4 h-4 text-stone-400 shrink-0" />
                                <div>
                                  <div className="text-stone-400 text-[10px] uppercase font-bold">Identity Document No.</div>
                                  <div className="font-bold font-mono text-stone-800">
                                    {app.repIdentityNumber || app.cnicNumber || 'N/A'}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                                <Phone className="w-4 h-4 text-stone-400 shrink-0" />
                                <div>
                                  <div className="text-stone-400 text-[10px] uppercase font-bold">Phone Number</div>
                                  <div className="font-bold text-stone-800">
                                    {app.mobileNumber || app.repPhone || 'N/A'}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                                <Mail className="w-4 h-4 text-stone-400 shrink-0" />
                                <div className="truncate">
                                  <div className="text-stone-400 text-[10px] uppercase font-bold">Email</div>
                                  <div className="font-bold text-stone-800 truncate">{app.userEmail || 'N/A'}</div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                                <MapPin className="w-4 h-4 text-stone-400 shrink-0" />
                                <div>
                                  <div className="text-stone-400 text-[10px] uppercase font-bold">Location</div>
                                  <div className="font-bold text-stone-800">
                                    {app.city || 'N/A'}{app.country ? `, ${app.country}` : ''}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 bg-stone-50 p-2.5 rounded-xl border border-stone-100 sm:col-span-2">
                                <Calendar className="w-4 h-4 text-stone-400 shrink-0" />
                                <div>
                                  <div className="text-stone-400 text-[10px] uppercase font-bold">Address</div>
                                  <div className="font-semibold text-stone-700 truncate">
                                    {app.businessAddress || app.residentialAddress || 'N/A'}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Rejection / Revocation Reason Notice */}
                            {(app.rejectionReason || app.revocationReason) && (
                              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                                <div>
                                  <span className="font-bold uppercase tracking-wider block mb-0.5">
                                    {app.status === 'REJECTED' ? 'Rejection Reason' : 'Revocation Reason'}:
                                  </span>
                                  <span>{app.rejectionReason || app.revocationReason}</span>
                                </div>
                              </div>
                            )}

                            {/* Appeal Statement Box */}
                            {app.appealMessage && (
                              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-950 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-black uppercase tracking-wider text-blue-800 flex items-center gap-1.5 text-[11px]">
                                    <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                                    User Reinstatement Appeal Statement
                                  </span>
                                  {(app as any).appealStatus && (
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        (app as any).appealStatus === 'APPROVED'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : (app as any).appealStatus === 'REJECTED'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      Appeal {(app as any).appealStatus}
                                    </span>
                                  )}
                                </div>
                                <p className="bg-white/90 p-2.5 rounded-lg border border-blue-100 text-stone-800 font-medium italic">
                                  "{app.appealMessage}"
                                </p>
                              </div>
                            )}

                            {/* Appeal Rejection Notice */}
                            {(app as any).appealRejectionReason && (
                              <div className="p-3 bg-stone-100 border border-stone-300 rounded-xl text-xs text-stone-800 space-y-1">
                                <span className="font-bold uppercase tracking-wider block text-stone-600 text-[11px]">
                                  Appeal Declined Reason:
                                </span>
                                <p>{(app as any).appealRejectionReason}</p>
                              </div>
                            )}
                          </div>

                          {/* Right Document Thumbnails & Action Column */}
                          <div className="w-full lg:w-80 flex flex-col gap-4 border-t lg:border-t-0 lg:border-l lg:pl-6 border-stone-200 pt-4 lg:pt-0">
                            {/* Document Previews */}
                            <div>
                              <div className="text-xs font-bold text-stone-500 uppercase mb-2 flex items-center justify-between">
                                <span>Attached Identity Proofs</span>
                                <button
                                  onClick={() => setSelectedApp(app)}
                                  className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 text-[11px]"
                                >
                                  <Eye className="w-3.5 h-3.5" /> Full Inspection
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                {/* Document Front */}
                                <div
                                  onClick={() =>
                                    app.cnicFrontPhoto &&
                                    setPreviewImage({ url: app.cnicFrontPhoto, title: `${displayName} - Document Front (National Identity Card/ Government Issue Document)` })
                                  }
                                  className={`aspect-video rounded-xl bg-stone-100 border border-stone-200 overflow-hidden relative group cursor-pointer flex items-center justify-center ${
                                    !app.cnicFrontPhoto ? 'opacity-50' : ''
                                  }`}
                                >
                                  {app.cnicFrontPhoto ? (
                                    <>
                                      <img
                                        src={app.cnicFrontPhoto}
                                        alt="Document Front"
                                        className="w-full h-full object-cover group-hover:scale-105 transition"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                        <ZoomIn className="w-4 h-4" />
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-stone-400 font-bold text-center">No Front</span>
                                  )}
                                  <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                                    Front
                                  </span>
                                </div>

                                {/* Document Back */}
                                <div
                                  onClick={() =>
                                    app.cnicBackPhoto &&
                                    setPreviewImage({ url: app.cnicBackPhoto, title: `${displayName} - Document Back (Optional)` })
                                  }
                                  className={`aspect-video rounded-xl bg-stone-100 border border-stone-200 overflow-hidden relative group cursor-pointer flex items-center justify-center ${
                                    !app.cnicBackPhoto ? 'opacity-70 bg-stone-50' : ''
                                  }`}
                                >
                                  {app.cnicBackPhoto ? (
                                    <>
                                      <img
                                        src={app.cnicBackPhoto}
                                        alt="Document Back"
                                        className="w-full h-full object-cover group-hover:scale-105 transition"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                        <ZoomIn className="w-4 h-4" />
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-center p-1">
                                      <span className="text-[10px] text-stone-400 font-bold block leading-tight">Optional</span>
                                      <span className="text-[8px] text-stone-400">Not uploaded</span>
                                    </div>
                                  )}
                                  <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                                    Back
                                  </span>
                                </div>

                                {/* Selfie with ID */}
                                <div
                                  onClick={() =>
                                    app.selfiePhoto &&
                                    setPreviewImage({ url: app.selfiePhoto, title: `${displayName} - Live Selfie Photo` })
                                  }
                                  className={`aspect-video rounded-xl bg-stone-100 border border-stone-200 overflow-hidden relative group cursor-pointer flex items-center justify-center ${
                                    !app.selfiePhoto ? 'opacity-50' : ''
                                  }`}
                                >
                                  {app.selfiePhoto ? (
                                    <>
                                      <img
                                        src={app.selfiePhoto}
                                        alt="Selfie"
                                        className="w-full h-full object-cover group-hover:scale-105 transition"
                                      />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                        <ZoomIn className="w-4 h-4" />
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-[10px] text-stone-400 font-bold text-center">No Selfie</span>
                                  )}
                                  <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                                    Selfie
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-2 pt-2">
                              {isAppAppealPending(app) ? (
                                <div className="flex gap-2">
                                  <button
                                    id={`btn-reject-appeal-${app.id}`}
                                    onClick={() => promptReasonModal(app, 'REJECT_APPEAL')}
                                    disabled={isActioning}
                                    className="flex-1 px-3 py-2.5 bg-red-50 hover:bg-red-600 hover:text-white text-red-700 font-bold text-xs rounded-xl border border-red-200 transition flex items-center justify-center gap-1.5"
                                  >
                                    <XCircle className="w-4 h-4" />
                                    <span>Reject Appeal</span>
                                  </button>

                                  <button
                                    id={`btn-accept-appeal-${app.id}`}
                                    onClick={() => {
                                      setConfirmModal({
                                        isOpen: true,
                                        title: 'Accept KYC Appeal?',
                                        message: `Are you sure you want to accept the appeal for ${displayName}? This will restore their verified Blue Tick status and active KYC benefits.`,
                                        confirmLabel: 'Accept & Restore',
                                        onConfirm: () => {
                                          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                                          executeAcceptAppeal(app);
                                        },
                                      });
                                    }}
                                    disabled={isActioning}
                                    className="flex-1 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                                  >
                                    {isActioning ? (
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-4 h-4" />
                                    )}
                                    <span>Accept Appeal</span>
                                  </button>

                                  <button
                                    onClick={() => setSelectedApp(app)}
                                    className="px-3 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition flex items-center justify-center"
                                    title="View Full Inspection"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : app.status === 'PENDING' ? (
                                <div className="flex gap-2">
                                  <button
                                    id={`btn-reject-kyc-${app.id}`}
                                    onClick={() => promptReasonModal(app, 'REJECT')}
                                    disabled={isActioning}
                                    className="flex-1 px-3 py-2.5 bg-red-50 hover:bg-red-600 hover:text-white text-red-700 font-bold text-xs rounded-xl border border-red-200 transition flex items-center justify-center gap-1.5"
                                  >
                                    <XCircle className="w-4 h-4" />
                                    <span>Reject</span>
                                  </button>

                                  <button
                                    id={`btn-approve-kyc-${app.id}`}
                                    onClick={() => {
                                      setConfirmModal({
                                        isOpen: true,
                                        title: 'Approve KYC Verification?',
                                        message: `Are you sure you want to accept and verify ${displayName}? This will issue the Verified Blue Tick and lock the profile name.`,
                                        confirmLabel: 'Accept & Verify',
                                        onConfirm: () => {
                                          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                                          executeKycStatusUpdate(app, 'APPROVED');
                                        },
                                      });
                                    }}
                                    disabled={isActioning}
                                    className="flex-1 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
                                  >
                                    {isActioning ? (
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-4 h-4" />
                                    )}
                                    <span>Accept & Verify</span>
                                  </button>
                                </div>
                              ) : app.status === 'APPROVED' ? (
                                <div className="flex gap-2">
                                  <button
                                    id={`btn-revoke-kyc-${app.id}`}
                                    onClick={() => promptReasonModal(app, 'REVOKE')}
                                    disabled={isActioning}
                                    className="flex-1 px-3 py-2 bg-stone-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-stone-700 font-bold text-xs rounded-xl border border-stone-200 transition flex items-center justify-center gap-1.5"
                                  >
                                    <ShieldAlert className="w-4 h-4 text-red-500" />
                                    <span>Revoke Verification</span>
                                  </button>

                                  <button
                                    onClick={() => setSelectedApp(app)}
                                    className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition flex items-center justify-center"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <button
                                    id={`btn-reapprove-kyc-${app.id}`}
                                    onClick={() => {
                                      setConfirmModal({
                                        isOpen: true,
                                        title: 'Restore / Re-approve KYC?',
                                        message: `Are you sure you want to restore the verified status for ${displayName}?`,
                                        confirmLabel: 'Re-approve Application',
                                        onConfirm: () => {
                                          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                                          executeKycStatusUpdate(app, 'APPROVED');
                                        },
                                      });
                                    }}
                                    disabled={isActioning}
                                    className="flex-1 px-3 py-2 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 transition flex items-center justify-center gap-1.5"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                    <span>Re-approve / Resume</span>
                                  </button>

                                  <button
                                    onClick={() => handleKycDelete(app)}
                                    disabled={isActioning}
                                    className="px-3 py-2 bg-stone-100 hover:bg-red-100 text-stone-600 hover:text-red-700 font-bold text-xs rounded-xl transition flex items-center justify-center"
                                    title="Permanently remove application"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: GOLDEN SELLER BADGE REQUESTS */}
        {activeTab === 'GOLDEN_VERIFICATION' && (
          <div>
            <div className="bg-white border border-stone-200 rounded-2xl p-4 mb-6 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search seller requests by name, email, city..."
                  value={sellerSearchQuery}
                  onChange={(e) => setSellerSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 text-xs font-bold text-stone-500">
                <Shield className="w-4 h-4 text-amber-500" />
                <span>Requires Approved KYC Before Granting</span>
              </div>
            </div>

            {loading ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-16 text-center shadow-sm">
                <RefreshCw className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-3" />
                <p className="text-stone-600 font-semibold">Loading seller badge requests...</p>
              </div>
            ) : filteredPendingUsers.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-16 text-center shadow-sm">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-stone-900 mb-1">No Pending Seller Requests</h3>
                <p className="text-stone-500 text-sm max-w-md mx-auto">
                  There are no pending Golden Badge verification requests at this moment.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {filteredPendingUsers.map((profile) => {
                  const isActioning = actioningId === profile.id;
                  const isKycApproved = profile.kycStatus === 'APPROVED';

                  return (
                    <div
                      key={profile.id}
                      className="bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col md:flex-row border-stone-200"
                    >
                      <div className="w-full md:w-48 aspect-square bg-stone-100 shrink-0 flex items-center justify-center p-4">
                        {profile.photoURL ? (
                          <img
                            src={profile.photoURL}
                            alt=""
                            className="w-full h-full object-cover rounded-2xl"
                          />
                        ) : (
                          <ShieldAlert className="w-12 h-12 text-stone-300" />
                        )}
                      </div>

                      <div className="p-6 flex-grow flex flex-col md:flex-row gap-6">
                        <div className="flex-grow">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold text-stone-900">{profile.name}</h3>
                            <div
                              className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-widest border ${
                                isKycApproved
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : profile.kycStatus === 'PENDING'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-stone-100 text-stone-600 border-stone-200'
                              }`}
                            >
                              KYC {profile.kycStatus || 'NONE'}
                            </div>
                          </div>
                          <p className="text-stone-400 text-sm mb-4">
                            Member since: {profile.createdAt ? new Date(profile.createdAt as any).toLocaleDateString() : 'Recent'}
                          </p>

                          <div className="flex flex-wrap gap-4 text-sm text-stone-600 border-t pt-4">
                            <div>
                              <span className="block text-xs font-bold text-stone-400 uppercase">City</span>
                              <span className="font-semibold text-stone-800">{profile.city || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="block text-xs font-bold text-stone-400 uppercase">Phone</span>
                              <span className="font-semibold text-stone-800">{profile.phoneNumber || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="block text-xs font-bold text-stone-400 uppercase">Email</span>
                              <span className="font-semibold text-stone-800">{profile.email || 'N/A'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="w-full md:w-64 space-y-4">
                          <div>
                            <span className="block text-xs font-bold text-stone-400 uppercase mb-2">
                              Verification Note
                            </span>
                            <div className="bg-stone-50 border rounded-xl p-3.5 text-xs text-stone-600">
                              User requested Golden Badge verification to boost credibility.
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              id={`btn-reject-seller-${profile.id}`}
                              onClick={() => handleGoldenSellerAction(profile, 'REJECT')}
                              disabled={isActioning}
                              className="flex-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white border border-red-200 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                            >
                              <XCircle className="w-4 h-4" /> Reject
                            </button>

                            {isKycApproved ? (
                              <button
                                id={`btn-approve-golden-${profile.id}`}
                                onClick={() => handleGoldenSellerAction(profile, 'APPROVE')}
                                disabled={isActioning}
                                className="flex-1 bg-amber-500 hover:bg-amber-600 text-stone-900 py-2.5 rounded-xl font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5"
                              >
                                {isActioning ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Award className="w-4 h-4" />
                                )}
                                <span>Approve Golden</span>
                              </button>
                            ) : (
                              <div
                                title="Approve KYC in the KYC tab before granting Golden Badge"
                                className="flex-1 bg-stone-100 text-stone-400 py-2.5 rounded-xl font-bold text-xs text-center border border-stone-200 flex items-center justify-center px-1"
                              >
                                <ShieldAlert className="w-3.5 h-3.5 mr-1 text-amber-500" />
                                <span>KYC Required</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FULL KYC INSPECTION MODAL */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-stone-200">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-stone-200 p-6 z-10 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-stone-900">
                    KYC Document Verification Inspection
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${
                      selectedApp.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : selectedApp.status === 'REJECTED'
                        ? 'bg-red-100 text-red-800'
                        : selectedApp.status === 'REVOKED'
                        ? 'bg-stone-200 text-stone-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {selectedApp.status}
                  </span>
                </div>
                <p className="text-xs text-stone-500 mt-0.5">
                  Application ID: <span className="font-mono">{selectedApp.id}</span> • User ID: <span className="font-mono">{selectedApp.userId}</span>
                </p>
              </div>

              <button
                onClick={() => setSelectedApp(null)}
                className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Category Badge & Document Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-stone-50 rounded-2xl border border-stone-200">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${
                    selectedApp.category === 'FIRM_COMPANY'
                      ? 'bg-indigo-900 text-white'
                      : selectedApp.category === 'OWN_BUSINESS' || selectedApp.category === 'BUSINESS'
                      ? 'bg-purple-900 text-white'
                      : 'bg-blue-900 text-white'
                  }`}>
                    {selectedApp.category === 'FIRM_COMPANY' ? (
                      <Building2 className="w-5 h-5" />
                    ) : selectedApp.category === 'OWN_BUSINESS' || selectedApp.category === 'BUSINESS' ? (
                      <Store className="w-5 h-5" />
                    ) : (
                      <User className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-black tracking-widest text-stone-400">Verification Category</div>
                    <div className="font-black text-stone-900 text-base">
                      {selectedApp.category === 'FIRM_COMPANY'
                        ? 'FIRM / COMPANY KYC'
                        : selectedApp.category === 'OWN_BUSINESS' || selectedApp.category === 'BUSINESS'
                        ? 'OWN BUSINESS KYC'
                        : 'INDIVIDUAL KYC'}
                    </div>
                  </div>
                </div>

                <div className="text-right text-xs">
                  <span className="text-stone-400 font-bold block text-[10px] uppercase">Identity Document Type</span>
                  <span className="font-bold text-stone-800">
                    {selectedApp.documentType === 'PASSPORT'
                      ? 'Passport'
                      : selectedApp.documentType === 'DRIVING_LICENSE'
                      ? 'Driving License'
                      : selectedApp.documentType === 'OTHER_GOVT_ID'
                      ? 'Other Government ID'
                      : 'National Identity Card / Government ID'}
                  </span>
                </div>
              </div>

              {/* Dynamic Sections Based on Category */}
              {selectedApp.category === 'FIRM_COMPANY' ? (
                /* FIRM / COMPANY KYC VIEW */
                <div className="space-y-6">
                  {/* SECTION 1: Registered Company / Legal Entity Details */}
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-indigo-100 pb-3">
                      <Building2 className="w-4 h-4 text-indigo-700" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                        Registered Company / Legal Entity Details
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Company / Entity Name</span>
                        <span className="font-black text-stone-900 text-sm">{selectedApp.companyName || selectedApp.businessName || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Registration / Incorporation No.</span>
                        <span className="font-mono font-bold text-stone-900 text-sm">{selectedApp.registrationNumber || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Company Phone</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.businessPhone || selectedApp.mobileNumber || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Country</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.country || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">City / Location</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.city || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Registered Address</span>
                        <span className="font-semibold text-stone-800 text-sm">{selectedApp.businessAddress || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: Authorized Representative Personal Identity Information */}
                  <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
                      <User className="w-4 h-4 text-stone-700" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-stone-900">
                        Authorized Representative Personal Identity Information
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Representative Legal Name</span>
                        <span className="font-bold text-stone-900 text-sm">{selectedApp.repName || selectedApp.legalName}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Designation / Role</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.repDesignation || 'Authorized Representative'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Government-Issued Identity Document Number</span>
                        <span className="font-mono font-bold text-stone-900 text-sm">{selectedApp.repIdentityNumber || selectedApp.cnicNumber}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Representative Phone</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.repPhone || selectedApp.mobileNumber}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Representative Email</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.userEmail}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : selectedApp.category === 'OWN_BUSINESS' || selectedApp.category === 'BUSINESS' ? (
                /* OWN BUSINESS KYC VIEW */
                <div className="space-y-6">
                  {/* SECTION 1: Business / Trading Information */}
                  <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-purple-100 pb-3">
                      <Store className="w-4 h-4 text-purple-700" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-purple-950">
                        Business / Trading Information
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Business / Trading Name</span>
                        <span className="font-black text-stone-900 text-sm">{selectedApp.businessName || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Business Category / Type</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.businessType || 'General Business'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Business / Landline Phone</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.businessPhone || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Country</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.country || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">City / Location</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.city || 'N/A'}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Business / Trading Address</span>
                        <span className="font-semibold text-stone-800 text-sm">{selectedApp.businessAddress || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: Owner Personal Identity Information */}
                  <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
                      <User className="w-4 h-4 text-stone-700" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-stone-900">
                        Owner Personal Identity Information
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Owner Full Legal Name</span>
                        <span className="font-bold text-stone-900 text-sm">{selectedApp.legalName}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Government-Issued Identity Document Number</span>
                        <span className="font-mono font-bold text-stone-900 text-sm">{selectedApp.cnicNumber}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Owner Phone</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.mobileNumber}</span>
                      </div>

                      <div>
                        <span className="text-stone-400 font-bold uppercase text-[10px] block">Owner Email</span>
                        <span className="font-bold text-stone-800 text-sm">{selectedApp.userEmail}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* INDIVIDUAL KYC VIEW */
                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
                    <User className="w-4 h-4 text-stone-700" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-stone-900">
                      Individual Applicant Identity Details
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-stone-400 font-bold uppercase text-[10px] block">Full Legal Name</span>
                      <span className="font-bold text-stone-900 text-sm">{selectedApp.legalName}</span>
                    </div>

                    <div>
                      <span className="text-stone-400 font-bold uppercase text-[10px] block">Government-Issued Identity Document Number</span>
                      <span className="font-mono font-bold text-stone-900 text-sm">{selectedApp.cnicNumber}</span>
                    </div>

                    <div>
                      <span className="text-stone-400 font-bold uppercase text-[10px] block">Mobile Phone Number</span>
                      <span className="font-bold text-stone-800 text-sm">{selectedApp.mobileNumber}</span>
                    </div>

                    <div>
                      <span className="text-stone-400 font-bold uppercase text-[10px] block">Email Address</span>
                      <span className="font-bold text-stone-800 text-sm">{selectedApp.userEmail}</span>
                    </div>

                    <div>
                      <span className="text-stone-400 font-bold uppercase text-[10px] block">Country</span>
                      <span className="font-bold text-stone-800 text-sm">{selectedApp.country || 'N/A'}</span>
                    </div>

                    <div>
                      <span className="text-stone-400 font-bold uppercase text-[10px] block">City / Location</span>
                      <span className="font-bold text-stone-800 text-sm">{selectedApp.city || 'N/A'}</span>
                    </div>

                    <div className="sm:col-span-3">
                      <span className="text-stone-400 font-bold uppercase text-[10px] block">Residential Address</span>
                      <span className="font-semibold text-stone-800 text-sm">{selectedApp.residentialAddress || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* High-Resolution Document Proofs Grid */}
              <div>
                <h4 className="text-sm font-bold text-stone-900 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>High-Resolution Document Proofs (Click to Enlarge)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* Identity Front */}
                  <div className="border border-stone-200 rounded-2xl p-3 bg-stone-50 flex flex-col">
                    <span className="text-xs font-bold text-stone-700 mb-2">1. Identity Document Front *</span>
                    <div
                      onClick={() => {
                        const img = selectedApp.repFrontPhoto || selectedApp.cnicFrontPhoto;
                        if (img) setPreviewImage({ url: img, title: 'Identity Document Front' });
                      }}
                      className="aspect-video bg-white rounded-xl border border-stone-200 overflow-hidden relative group cursor-pointer flex items-center justify-center"
                    >
                      {(selectedApp.repFrontPhoto || selectedApp.cnicFrontPhoto) ? (
                        <>
                          <img
                            src={selectedApp.repFrontPhoto || selectedApp.cnicFrontPhoto}
                            alt="Front"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs gap-1">
                            <ZoomIn className="w-4 h-4" /> Enlarge
                          </div>
                        </>
                      ) : (
                        <span className="text-stone-400 text-xs font-bold">No Front Image</span>
                      )}
                    </div>
                  </div>

                  {/* Identity Back */}
                  <div className="border border-stone-200 rounded-2xl p-3 bg-stone-50 flex flex-col">
                    <span className="text-xs font-bold text-stone-700 mb-2">2. Identity Document Back (Optional)</span>
                    <div
                      onClick={() => {
                        const img = selectedApp.repBackPhoto || selectedApp.cnicBackPhoto;
                        if (img) setPreviewImage({ url: img, title: 'Identity Document Back' });
                      }}
                      className="aspect-video bg-white rounded-xl border border-stone-200 overflow-hidden relative group cursor-pointer flex items-center justify-center"
                    >
                      {(selectedApp.repBackPhoto || selectedApp.cnicBackPhoto) ? (
                        <>
                          <img
                            src={selectedApp.repBackPhoto || selectedApp.cnicBackPhoto}
                            alt="Back"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs gap-1">
                            <ZoomIn className="w-4 h-4" /> Enlarge
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-2">
                          <span className="text-stone-400 text-xs font-bold block">Optional</span>
                          <span className="text-stone-400 text-[11px]">Not uploaded</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Live Selfie */}
                  <div className="border border-stone-200 rounded-2xl p-3 bg-stone-50 flex flex-col">
                    <span className="text-xs font-bold text-stone-700 mb-2">3. Live Watermarked Selfie *</span>
                    <div
                      onClick={() => {
                        const img = selectedApp.repSelfiePhoto || selectedApp.selfiePhoto;
                        if (img) setPreviewImage({ url: img, title: 'Live Watermarked Selfie' });
                      }}
                      className="aspect-video bg-white rounded-xl border border-stone-200 overflow-hidden relative group cursor-pointer flex items-center justify-center"
                    >
                      {(selectedApp.repSelfiePhoto || selectedApp.selfiePhoto) ? (
                        <>
                          <img
                            src={selectedApp.repSelfiePhoto || selectedApp.selfiePhoto}
                            alt="Selfie"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs gap-1">
                            <ZoomIn className="w-4 h-4" /> Enlarge
                          </div>
                        </>
                      ) : (
                        <span className="text-stone-400 text-xs font-bold">No Image</span>
                      )}
                    </div>
                  </div>

                  {/* Business Document / Registration (If applicable) */}
                  {(selectedApp.category === 'OWN_BUSINESS' || selectedApp.category === 'BUSINESS' || selectedApp.category === 'FIRM_COMPANY') && (
                    <div className="border border-stone-200 rounded-2xl p-3 bg-stone-50 flex flex-col">
                      <span className="text-xs font-bold text-stone-700 mb-2">
                        4. {selectedApp.category === 'FIRM_COMPANY' ? 'Registration Certificate (Optional)' : 'Business License (Optional)'}
                      </span>
                      <div
                        onClick={() => {
                          const img = selectedApp.businessDocPhoto || selectedApp.repDocPhoto;
                          if (img) setPreviewImage({ url: img, title: 'Business Registration Document' });
                        }}
                        className="aspect-video bg-white rounded-xl border border-stone-200 overflow-hidden relative group cursor-pointer flex items-center justify-center"
                      >
                        {(selectedApp.businessDocPhoto || selectedApp.repDocPhoto) ? (
                          <>
                            <img
                              src={selectedApp.businessDocPhoto || selectedApp.repDocPhoto}
                              alt="Business Doc"
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs gap-1">
                              <ZoomIn className="w-4 h-4" /> Enlarge
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-2">
                            <span className="text-stone-400 text-xs font-bold block">Optional</span>
                            <span className="text-stone-400 text-[11px]">Not provided</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Representative Authority Letter (For FIRM_COMPANY) */}
                  {selectedApp.category === 'FIRM_COMPANY' && (
                    <div className="border border-stone-200 rounded-2xl p-3 bg-stone-50 flex flex-col">
                      <span className="text-xs font-bold text-stone-700 mb-2">
                        5. Authority Letter (Optional)
                      </span>
                      <div
                        onClick={() => {
                          if (selectedApp.repAuthorityLetter) {
                            setPreviewImage({ url: selectedApp.repAuthorityLetter, title: 'Authority Letter / Board Resolution' });
                          }
                        }}
                        className="aspect-video bg-white rounded-xl border border-stone-200 overflow-hidden relative group cursor-pointer flex items-center justify-center"
                      >
                        {selectedApp.repAuthorityLetter ? (
                          <>
                            <img
                              src={selectedApp.repAuthorityLetter}
                              alt="Authority Letter"
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs gap-1">
                              <ZoomIn className="w-4 h-4" /> Enlarge
                            </div>
                          </>
                        ) : (
                          <div className="text-center p-2">
                            <span className="text-stone-400 text-xs font-bold block">Optional</span>
                            <span className="text-stone-400 text-[11px]">Not provided</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Audit History Log */}
              {selectedApp.history && selectedApp.history.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-stone-900 mb-2">Audit & Action History</h4>
                  <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200 space-y-2 text-xs">
                    {selectedApp.history.map((h, idx) => (
                      <div key={idx} className="flex items-start justify-between border-b border-stone-200/60 pb-2 last:border-b-0 last:pb-0">
                        <div>
                          <span className="font-bold text-stone-800">{h.action} ({h.status})</span>
                          {h.reason && <p className="text-stone-600 mt-0.5">{h.reason}</p>}
                        </div>
                        <span className="text-[10px] text-stone-400 font-mono">
                          {new Date(h.timestamp).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="sticky bottom-0 bg-white border-t border-stone-200 p-4 sm:p-6 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => setSelectedApp(null)}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition"
              >
                Close Inspection
              </button>

              <div className="flex gap-2">
                {isAppAppealPending(selectedApp) ? (
                  <>
                    <button
                      onClick={() => {
                        const app = selectedApp;
                        setSelectedApp(null);
                        promptReasonModal(app, 'REJECT_APPEAL');
                      }}
                      className="px-4 py-2.5 bg-red-50 hover:bg-red-600 hover:text-white text-red-700 font-bold text-xs rounded-xl border border-red-200 transition flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject Appeal</span>
                    </button>
                    <button
                      onClick={() => {
                        const app = selectedApp;
                        setSelectedApp(null);
                        setConfirmModal({
                          isOpen: true,
                          title: 'Accept KYC Appeal?',
                          message: `Are you sure you want to accept the appeal for ${app.legalName}? This will restore their verified Blue Tick status and active KYC benefits.`,
                          confirmLabel: 'Accept & Restore',
                          onConfirm: () => executeAcceptAppeal(app),
                        });
                      }}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Accept Appeal</span>
                    </button>
                  </>
                ) : selectedApp.status === 'PENDING' ? (
                  <>
                    <button
                      onClick={() => {
                        const app = selectedApp;
                        setSelectedApp(null);
                        promptReasonModal(app, 'REJECT');
                      }}
                      className="px-4 py-2.5 bg-red-50 hover:bg-red-600 hover:text-white text-red-700 font-bold text-xs rounded-xl border border-red-200 transition"
                    >
                      Reject Application
                    </button>
                    <button
                      onClick={() => {
                        const app = selectedApp;
                        setSelectedApp(null);
                        setConfirmModal({
                          isOpen: true,
                          title: 'Approve KYC Verification?',
                          message: `Are you sure you want to verify ${app.legalName}?`,
                          confirmLabel: 'Accept & Verify',
                          onConfirm: () => executeKycStatusUpdate(app, 'APPROVED'),
                        });
                      }}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Accept & Verify</span>
                    </button>
                  </>
                ) : selectedApp.status === 'APPROVED' ? (
                  <button
                    onClick={() => {
                      const app = selectedApp;
                      setSelectedApp(null);
                      promptReasonModal(app, 'REVOKE');
                    }}
                    className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Revoke Verification</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const app = selectedApp;
                      setSelectedApp(null);
                      setConfirmModal({
                        isOpen: true,
                        title: 'Restore / Re-approve KYC?',
                        message: `Are you sure you want to restore the verified status for ${app.legalName || 'this user'}?`,
                        confirmLabel: 'Re-approve Application',
                        onConfirm: () => {
                          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                          executeKycStatusUpdate(app, 'APPROVED');
                        },
                      });
                    }}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Re-approve / Resume</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REASON PROMPT MODAL FOR REJECT / REVOKE / REJECT_APPEAL */}
      {reasonModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  reasonModal.actionType === 'REJECT' || reasonModal.actionType === 'REJECT_APPEAL'
                    ? 'bg-red-100 text-red-600'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-stone-900">
                  {reasonModal.actionType === 'REJECT'
                    ? 'Reject KYC Application'
                    : reasonModal.actionType === 'REJECT_APPEAL'
                    ? 'Decline Reinstatement Appeal'
                    : 'Revoke Verified Status'}
                </h3>
                <p className="text-xs text-stone-500">
                  {reasonModal.actionType === 'REJECT_APPEAL'
                    ? `State reason why ${reasonModal.app?.legalName || 'the user'}'s appeal cannot be accepted.`
                    : `Provide an explanation for ${reasonModal.app?.legalName || 'the user'}.`}
                </p>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="mb-3">
              <span className="text-[11px] font-bold text-stone-400 uppercase block mb-1.5">Common Reasons</span>
              <div className="flex flex-wrap gap-1.5">
                {(reasonModal.actionType === 'REJECT_APPEAL'
                  ? [
                      'Insufficient explanation or proof provided in appeal',
                      'Violation of platform terms remains unaddressed',
                      'Identity details cannot be verified',
                      'Document discrepancy remains unresolved',
                    ]
                  : [
                      'National Identity Card/ Government Issue Document photo is blurry or unreadable',
                      'Name does not match document',
                      'Live selfie does not clearly match document',
                      'Expired identity document',
                      'Business registration proof missing',
                    ]
                ).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setReasonModal((prev) => ({ ...prev, reason: preset }))}
                    className="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1 rounded-lg transition"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Reason Text Area */}
            <textarea
              rows={3}
              placeholder={
                reasonModal.actionType === 'REJECT_APPEAL'
                  ? 'Enter appeal rejection reason...'
                  : 'Enter specific feedback or reason...'
              }
              value={reasonModal.reason}
              onChange={(e) => setReasonModal((prev) => ({ ...prev, reason: e.target.value }))}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReasonModal({ isOpen: false, app: null, actionType: 'REJECT', reason: '' })}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleReasonSubmit}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm transition"
              >
                {reasonModal.actionType === 'REJECT'
                  ? 'Confirm Rejection'
                  : reasonModal.actionType === 'REJECT_APPEAL'
                  ? 'Confirm Appeal Rejection'
                  : 'Confirm Revocation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200">
            <h3 className="text-lg font-black text-stone-900 mb-2">{confirmModal.title}</h3>
            <p className="text-sm text-stone-600 mb-6">{confirmModal.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-5 py-2.5 font-bold text-xs rounded-xl shadow-sm transition text-white ${
                  confirmModal.isDestructive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SCREEN IMAGE PREVIEW MODAL */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4"
        >
          <div className="relative max-w-4xl max-h-[85vh] w-full flex flex-col items-center">
            <div className="w-full flex items-center justify-between text-white mb-2 px-2">
              <span className="font-bold text-sm">{previewImage.title}</span>
              <button
                onClick={() => setPreviewImage(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={previewImage.url}
              alt=""
              className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-white/20 bg-stone-900"
            />
          </div>
        </div>
      )}
    </div>
  );
}
