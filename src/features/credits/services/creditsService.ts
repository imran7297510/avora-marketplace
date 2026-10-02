import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
  CreditTransaction,
  CreditTransactionType,
  CreditValidationError,
} from '../types';
import { CREDIT_PACKAGES } from '../constants';

/**
 * CREDITS SERVICE ARCHITECTURE & SECURITY BOUNDARY DOCUMENTATION:
 * 
 * A. CURRENT DEVELOPMENT ARCHITECTURE (Phase C2 - No Billing):
 * - Reads client balance from user document (`users/{userId}`).
 * - Reads immutable credit transaction history from `credit_transactions`.
 * - Provides strict client-side validation logic for credit operations.
 * - Simulates package interest/requests without processing real money or granting unauthorized credits.
 * 
 * B. FUTURE AUTHORITATIVE SERVER-SIDE CREDIT ENGINE (Phase C3+):
 * - Authoritative credit issuance and deductions are executed strictly via trusted Cloud Functions
 *   or Firebase Admin SDK on the backend.
 * - Ordinary clients CANNOT directly increment `creditsBalance` or manufacture credit transaction logs.
 * - Firestore security rules enforce that user credit fields and `credit_transactions` are protected from client write tampering.
 */

export class CreditsService {
  /**
   * Generates a deterministic idempotency key for preventing duplicate credit operations.
   */
  static generateIdempotencyKey(
    userId: string,
    actionType: string,
    referenceId: string
  ): string {
    return `ik_${userId}_${actionType}_${referenceId}`;
  }

  /**
   * Validates a credit amount.
   */
  static validateCreditAmount(amount: number): CreditValidationError | null {
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0 || !Number.isInteger(amount)) {
      return {
        code: 'INVALID_AMOUNT',
        message: 'Credit amount must be a positive integer.',
      };
    }
    return null;
  }

  /**
   * Validates sufficient credit balance.
   */
  static validateSufficientBalance(
    currentBalance: number,
    amountNeeded: number
  ): CreditValidationError | null {
    if (currentBalance < amountNeeded) {
      return {
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient credit balance. You have ${currentBalance} credits, but ${amountNeeded} credits are required.`,
        details: { currentBalance, amountNeeded },
      };
    }
    return null;
  }

  /**
   * Validates that resulting balance will not be negative.
   */
  static validateNonNegativeBalance(resultingBalance: number): CreditValidationError | null {
    if (resultingBalance < 0) {
      return {
        code: 'NEGATIVE_BALANCE',
        message: 'Transaction rejected: operation would result in a negative credit balance.',
      };
    }
    return null;
  }

  /**
   * Validates transaction type.
   */
  static validateTransactionType(type: string): CreditValidationError | null {
    const validTypes: CreditTransactionType[] = [
      'PURCHASE',
      'AUCTION_BID',
      'NEGOTIATION_OFFER',
      'PRIVATE_NEGOTIATION_LISTING_POST',
      'PROMOTIONAL_BONUS',
      'REFUND',
      'ADMIN_ADJUSTMENT',
    ];
    if (!validTypes.includes(type as CreditTransactionType)) {
      return {
        code: 'INVALID_TYPE',
        message: `Invalid transaction type '${type}'.`,
      };
    }
    return null;
  }

  /**
   * Fetches user's current credit balance & stats from user profile.
   */
  static async getUserCreditsBalance(userId: string): Promise<{
    creditsBalance: number;
    totalCreditsPurchased: number;
    totalCreditsSpent: number;
    creditsLastUpdatedAt: any;
  }> {
    if (!userId) {
      return { creditsBalance: 0, totalCreditsPurchased: 0, totalCreditsSpent: 0, creditsLastUpdatedAt: null };
    }

    try {
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          creditsBalance: data.creditsBalance || 0,
          totalCreditsPurchased: data.totalCreditsPurchased || 0,
          totalCreditsSpent: data.totalCreditsSpent || 0,
          creditsLastUpdatedAt: data.creditsLastUpdatedAt || null,
        };
      }
    } catch (err) {
      console.error('[CreditsService] Error fetching user credit balance:', err);
    }

    return { creditsBalance: 0, totalCreditsPurchased: 0, totalCreditsSpent: 0, creditsLastUpdatedAt: null };
  }

  /**
   * Fetches the user's credit transactions from the immutable ledger collection.
   */
  static async getUserTransactions(userId: string, maxResults = 50): Promise<CreditTransaction[]> {
    if (!userId) return [];

    try {
      const q = query(
        collection(db, 'credit_transactions'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(maxResults)
      );

      const querySnap = await getDocs(q);
      const items: CreditTransaction[] = [];

      querySnap.forEach((docSnap) => {
        const d = docSnap.data();
        items.push({
          id: docSnap.id,
          userId: d.userId,
          amount: d.amount || 0,
          type: d.type || 'PURCHASE',
          description: d.description || '',
          idempotencyKey: d.idempotencyKey || '',
          balanceBefore: d.balanceBefore || 0,
          balanceAfter: d.balanceAfter || 0,
          status: d.status || 'COMPLETED',
          relatedEntityId: d.relatedEntityId,
          relatedEntityType: d.relatedEntityType,
          createdAt: d.createdAt,
          metadata: d.metadata,
        });
      });

      return items;
    } catch (err) {
      console.error('[CreditsService] Error fetching credit transactions:', err);
      return [];
    }
  }

  /**
   * Checks if an idempotency key has already been executed in the transaction ledger.
   */
  static async isIdempotencyKeyUsed(userId: string, idempotencyKey: string): Promise<boolean> {
    if (!userId || !idempotencyKey) return false;

    try {
      const q = query(
        collection(db, 'credit_transactions'),
        where('userId', '==', userId),
        where('idempotencyKey', '==', idempotencyKey),
        limit(1)
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (err) {
      console.error('[CreditsService] Error checking idempotency key:', err);
      return false;
    }
  }

  /**
   * Requests a simulated credit purchase in No-Billing Preview mode.
   * Logs interest request without granting unauthorized credits or charging money.
   */
  static async requestSimulatedCreditPurchase(
    userId: string,
    packageId: string
  ): Promise<{ success: boolean; message: string }> {
    if (!userId) {
      return { success: false, message: 'You must be logged in to select a package.' };
    }

    const pack = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pack) {
      return { success: false, message: 'Selected credit package was not found.' };
    }

    try {
      // Log request in admin logs for analytical tracking without modifying credits directly
      await addDoc(collection(db, 'adminLogs'), {
        type: 'CREDIT_PURCHASE_PREVIEW_REQUEST',
        userId,
        packageId: pack.id,
        packageName: pack.name,
        usdPrice: pack.usdPrice,
        credits: pack.credits,
        mode: 'NO_BILLING_PREVIEW',
        createdAt: serverTimestamp(),
      });

      return {
        success: true,
        message: `Package interest logged! In this No-Billing Preview mode, real payments are disabled. Real purchasing for ${pack.credits} credits ($${pack.usdPrice.toFixed(2)}) will be enabled in a future release.`,
      };
    } catch (err: any) {
      console.error('[CreditsService] Error recording simulated purchase request:', err);
      return {
        success: true,
        message: `Package selected (${pack.name}: ${pack.credits} credits). Real payment gateways are disabled in this No-Billing Preview mode.`,
      };
    }
  }

  /**
   * Submits a manual credit purchase application for admin verification and manual credit issuance.
   */
  static async submitCreditApplication(data: {
    userId: string;
    userName: string;
    userEmail: string;
    packageId: string;
    packageName: string;
    credits: number;
    usdPrice: number;
    paymentMethod: string;
    paymentProofUrl?: string;
    transactionId?: string;
  }): Promise<{ success: boolean; message: string; applicationId?: string }> {
    if (!data.userId) {
      return { success: false, message: 'You must be logged in to submit a credit application.' };
    }

    try {
      const docRef = await addDoc(collection(db, 'credit_applications'), {
        userId: data.userId,
        userName: data.userName || 'Marketplace Member',
        userEmail: data.userEmail || '',
        packageId: data.packageId,
        packageName: data.packageName,
        credits: data.credits,
        usdPrice: data.usdPrice,
        paymentMethod: data.paymentMethod,
        paymentProofUrl: data.paymentProofUrl || '',
        transactionId: data.transactionId || '',
        status: 'PENDING',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        message: 'Your credit purchase request has been submitted successfully! Payment Verifiers will verify your transaction and issue your credits shortly.',
        applicationId: docRef.id,
      };
    } catch (err: any) {
      console.error('[CreditsService] Error submitting credit application:', err);
      return {
        success: false,
        message: err?.message || 'Failed to submit credit purchase request. Please try again.',
      };
    }
  }

  /**
   * Authoritatively grants credits upon Admin approval of a manual payment request.
   */
  static async grantCredits(params: {
    applicationId: string;
    userId: string;
    creditsAmount: number;
    packageName: string;
    packageId: string;
    usdPrice: number;
    paymentMethod: string;
    adminIdentifier: string;
  }): Promise<{ success: boolean; message: string }> {
    const {
      applicationId,
      userId,
      creditsAmount,
      packageName,
      packageId,
      usdPrice,
      paymentMethod,
      adminIdentifier,
    } = params;

    if (!applicationId) {
      return { success: false, message: 'Credit Application ID is required.' };
    }

    try {
      const initialIdempotencyKey = `ik_${userId}_PURCHASE_${applicationId}`;
      const alreadyUsed = await CreditsService.isIdempotencyKeyUsed(userId, initialIdempotencyKey);
      if (alreadyUsed) {
        return { success: false, message: 'Credits for this application have already been issued (Idempotency Key Used).' };
      }

      const appRef = doc(db, 'credit_applications', applicationId);
      let grantedCreditsAmount = creditsAmount;
      let targetUserId = userId;
      let targetPackageName = packageName;
      let targetUsdPrice = usdPrice;

      // Execute ALL financial state changes in a single atomic Firestore transaction
      await runTransaction(db, async (transaction) => {
        // 1. Transactional Read: Credit Application
        const appSnap = await transaction.get(appRef);
        if (!appSnap.exists()) {
          throw new Error('Credit application document was not found.');
        }

        const appData = appSnap.data();
        if (appData?.status === 'APPROVED') {
          throw new Error('ALREADY_APPROVED');
        }

        // Authoritative data resolution from application document & package definitions
        targetUserId = appData?.userId || userId;
        targetPackageName = appData?.packageName || packageName;
        targetUsdPrice = typeof appData?.usdPrice === 'number' ? appData.usdPrice : usdPrice;

        const packMatch = CREDIT_PACKAGES.find((p) => p.id === (appData?.packageId || packageId));
        grantedCreditsAmount = packMatch ? packMatch.credits : (appData?.credits || creditsAmount);

        if (!targetUserId || grantedCreditsAmount <= 0) {
          throw new Error('Invalid user or credit amount on application.');
        }

        // 2. Transactional Read: User Profile
        const userRef = doc(db, 'users', targetUserId);
        const userSnap = await transaction.get(userRef);

        let balanceBefore = 0;
        let currentTotalPurchased = 0;

        if (userSnap.exists()) {
          const uData = userSnap.data();
          balanceBefore = uData.creditsBalance || 0;
          currentTotalPurchased = uData.totalCreditsPurchased || 0;
        }

        const balanceAfter = balanceBefore + grantedCreditsAmount;
        const appSpecificIdempotencyKey = `ik_${targetUserId}_PURCHASE_${applicationId}`;
        const ledgerRef = doc(collection(db, 'credit_transactions'));

        // 3. Transactional Write: User additive balance update
        transaction.set(
          userRef,
          {
            creditsBalance: balanceAfter,
            totalCreditsPurchased: currentTotalPurchased + grantedCreditsAmount,
            creditsLastUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        // 4. Transactional Write: Immutable credit transaction ledger entry
        transaction.set(ledgerRef, {
          userId: targetUserId,
          amount: grantedCreditsAmount,
          type: 'PURCHASE',
          description: `Manual Purchase Approved - ${targetPackageName} (${grantedCreditsAmount} Credits)`,
          idempotencyKey: appSpecificIdempotencyKey,
          balanceBefore,
          balanceAfter,
          status: 'COMPLETED',
          relatedEntityId: applicationId,
          relatedEntityType: 'PACKAGE',
          createdAt: serverTimestamp(),
          metadata: {
            packageId: appData?.packageId || packageId,
            usdPrice: targetUsdPrice,
            paymentMethod: appData?.paymentMethod || paymentMethod,
            approvedBy: adminIdentifier,
          },
        });

        // 5. Transactional Write: Application status update to APPROVED
        transaction.update(appRef, {
          status: 'APPROVED',
          approvedAt: serverTimestamp(),
          approvedBy: adminIdentifier,
          updatedAt: serverTimestamp(),
        });
      });

      // 6. Post-transaction non-blocking notification dispatch
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: targetUserId,
          title: 'Credits Added to Your Account! 🪙',
          message: `Your payment for ${targetPackageName} ($${targetUsdPrice.toFixed(2)}) was verified! ${grantedCreditsAmount} Credits have been credited to your account.`,
          type: 'CREDITS_ISSUED',
          relatedId: applicationId,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn('[CreditsService] Non-blocking notification dispatch error:', notifErr);
      }

      return {
        success: true,
        message: `Successfully approved and issued ${grantedCreditsAmount} credits to user.`,
      };
    } catch (err: any) {
      if (err?.message === 'ALREADY_APPROVED') {
        return { success: false, message: 'This credit application has already been approved.' };
      }
      console.error('[CreditsService] Error granting credits in atomic transaction:', err);
      return {
        success: false,
        message: err?.message || 'Failed to issue credits.',
      };
    }
  }

  /**
   * Rejects a manual credit application.
   */
  static async rejectCreditApplication(params: {
    applicationId: string;
    userId: string;
    packageName: string;
    rejectionReason?: string;
    adminIdentifier: string;
  }): Promise<{ success: boolean; message: string }> {
    const { applicationId, userId, packageName, rejectionReason, adminIdentifier } = params;

    try {
      const appRef = doc(db, 'credit_applications', applicationId);
      await updateDoc(appRef, {
        status: 'REJECTED',
        rejectionReason: rejectionReason || 'Payment verification unsuccessful.',
        rejectedAt: serverTimestamp(),
        rejectedBy: adminIdentifier,
        updatedAt: serverTimestamp(),
      });

      if (userId) {
        await addDoc(collection(db, 'notifications'), {
          userId,
          title: 'Credit Application Notice ⚠️',
          message: `Your manual credit purchase request for ${packageName} could not be verified. Reason: ${
            rejectionReason || 'Payment verification unsuccessful.'
          }`,
          type: 'CREDITS_REJECTED',
          relatedId: applicationId,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      return { success: true, message: 'Credit application rejected.' };
    } catch (err: any) {
      console.error('[CreditsService] Error rejecting credit application:', err);
      return { success: false, message: err?.message || 'Failed to reject application.' };
    }
  }
}
