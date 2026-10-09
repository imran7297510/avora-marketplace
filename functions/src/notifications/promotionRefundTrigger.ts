import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp();
}

const defaultDb = getFirestore('ai-studio-c5cea893-acec-4774-a11a-e26679ae7862');

/**
 * Checks whether an error is a Firestore ALREADY_EXISTS (code 6) error.
 */
export const isAlreadyExistsError = (err: any): boolean => {
  return Boolean(
    err &&
      (err.code === 6 ||
        err.code === 'ALREADY_EXISTS' ||
        String(err.message).includes('ALREADY_EXISTS') ||
        String(err.details).includes('ALREADY_EXISTS'))
  );
};

/**
 * Strictly validates an existing deterministic-ID notification document data
 * before treating an ALREADY_EXISTS error as a safe idempotent duplicate.
 *
 * Requirements:
 * - existingData is a valid non-array object.
 * - type is exactly "REFUND_REQUEST".
 * - userId exactly matches the expected administrator UID.
 * - At least one usable identity field exists: requestId or relatedId.
 * - Every identity field that is present and usable must exactly match expectedRequestId.
 * - Contradictory requestId and relatedId values must be rejected.
 * - An existing document with neither identity field must be rejected.
 * - Malformed, empty, whitespace-only, or non-string identity fields must be rejected.
 */
export const isExpectedRefundNotificationIdentity = (
  existingData: any,
  expectedRequestId: string,
  expectedAdminUid: string
): boolean => {
  if (!existingData || typeof existingData !== 'object' || Array.isArray(existingData)) {
    return false;
  }

  if (existingData.type !== 'REFUND_REQUEST') {
    return false;
  }

  if (typeof expectedAdminUid !== 'string' || existingData.userId !== expectedAdminUid) {
    return false;
  }

  if (typeof expectedRequestId !== 'string' || expectedRequestId.length === 0) {
    return false;
  }

  const checkField = (field: 'requestId' | 'relatedId') => {
    const isPresent =
      Object.prototype.hasOwnProperty.call(existingData, field) &&
      existingData[field] !== undefined;

    if (!isPresent) {
      return { present: false, valid: false };
    }

    const val = existingData[field];
    if (typeof val !== 'string' || val.trim().length === 0) {
      return { present: true, valid: false };
    }

    if (val !== expectedRequestId) {
      return { present: true, valid: false };
    }

    return { present: true, valid: true };
  };

  const reqCheck = checkField('requestId');
  const relCheck = checkField('relatedId');

  // Reject if any present field is invalid (malformed, empty/whitespace, non-string, or non-matching)
  if (reqCheck.present && !reqCheck.valid) {
    return false;
  }
  if (relCheck.present && !relCheck.valid) {
    return false;
  }

  // Must have at least one valid usable identity field
  if (!reqCheck.valid && !relCheck.valid) {
    return false;
  }

  return true;
};

export interface PromotionRefundHandlerResult {
  triggered: boolean;
  adminCount: number;
  refundAmount?: number;
  retentionAmount?: number;
  skippedReason?: string;
}

/**
 * Server-authoritative Cloud Function handler logic for promotion refund request processing.
 *
 * Concurrency & Retry Safety:
 * - Deterministic notification IDs (refund_req_${requestId}_${adminUid}).
 * - docRef.create() ensures precondition exists == false.
 * - Suppresses only verified expected ALREADY_EXISTS collisions for documents
 *   matching the expected refund request identity and admin recipient.
 * - Accumulates any transient or non-matching error across all required notification writes.
 * - Re-throws if any notification write fails, preventing authoritative financial updates
 *   and signaling Cloud Functions v2 Eventarc runtime to trigger an automatic retry.
 *
 * NOTE ON RETRY LIMITATION:
 * Setting retry: true enables Eventarc exponential backoff retries within the configured
 * event retention / delivery window. It does NOT guarantee eventual delivery if errors are
 * non-transient (e.g. permanent permission or quota errors, persistent schema collisions,
 * or repeated timeouts) and the retry quota/TTL is exhausted.
 */
export async function handlePromotionRefundRequestedEvent(
  event: any,
  firestoreDb: any = defaultDb
): Promise<PromotionRefundHandlerResult> {
  const beforeData = event.data?.before?.data ? event.data.before.data() : event.data?.before;
  const afterData = event.data?.after?.data ? event.data.after.data() : event.data?.after;

  // 1. Snapshot existence validation
  if (!beforeData || !afterData) {
    console.warn('[PROMOTION_REFUND_TRIGGER] Missing before or after snapshot data');
    return { triggered: false, adminCount: 0, skippedReason: 'MISSING_SNAPSHOT_DATA' };
  }

  const requestId = event.params?.requestId;
  if (!requestId || typeof requestId !== 'string' || !requestId.trim()) {
    console.warn('[PROMOTION_REFUND_TRIGGER] Invalid requestId parameter');
    return { triggered: false, adminCount: 0, skippedReason: 'INVALID_REQUEST_ID' };
  }

  // 2. State transition validation: Only fire when transitioning into refundRequested: true & refundStatus: 'PENDING'
  const wasPendingRefund = beforeData.refundRequested === true && beforeData.refundStatus === 'PENDING';
  const isPendingRefund = afterData.refundRequested === true && afterData.refundStatus === 'PENDING';

  if (wasPendingRefund || !isPendingRefund) {
    // Not a new refund-request transition; ignore
    return { triggered: false, adminCount: 0, skippedReason: 'NOT_PENDING_REFUND_TRANSITION' };
  }

  try {
    // 3. Authoritative financial calculation (95% refund, 5% platform retention)
    // Exactly matches src/lib/currencies.tsx calculateRefundAmounts() logic
    const rawReceived = afterData.receivedAmount;
    const parsed =
      typeof rawReceived === 'number'
        ? rawReceived
        : typeof rawReceived === 'string'
        ? Number(rawReceived)
        : 0;
    const base = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
    const refundAmount = base > 0 ? Math.round(base * 0.95 * 100) / 100 : 0;
    const retentionAmount = base > 0 ? Math.round((base - refundAmount) * 100) / 100 : 0;

    const currency = (afterData.currency || 'PKR').toUpperCase();
    const currencySymbol =
      currency === 'USD'
        ? '$'
        : currency === 'EUR'
        ? '€'
        : currency === 'GBP'
        ? '£'
        : currency === 'PKR'
        ? 'Rs. '
        : `${currency} `;

    const planName = afterData.planName || 'Badge Promotion';
    const proofCount = Array.isArray(afterData.refundProofImages)
      ? afterData.refundProofImages.length
      : afterData.refundProofImage
      ? 1
      : 0;

    const formattedRefund = `${currencySymbol}${refundAmount.toLocaleString()}`;
    const formattedRetention = `${currencySymbol}${retentionAmount.toLocaleString()}`;

    const notificationTitle = '💸 User Refund Request Submitted';
    const notificationMessage = `A 95% refund of ${formattedRefund} (5% retention: ${formattedRetention}) has been claimed for badge "${planName}" with ${proofCount} attached payment proof(s). Please check it in the PROMO panel under Admin Dashboard.`;

    // 4. Discover administrator recipients across all administrator authorities:
    // - Users with isAdmin == true (legacy / standard admin flag)
    // - Users with isSuperAdmin == true (super administrators)
    // - Users with isAuthorizedAdmin == true (delegated dashboard admins)
    // - Fallback: Look up authorizedAdmins collection to ensure full administrative coverage
    const [legacyAdminsSnap, superAdminsSnap, authAdminsSnap] = await Promise.all([
      firestoreDb.collection('users').where('isAdmin', '==', true).get(),
      firestoreDb.collection('users').where('isSuperAdmin', '==', true).get(),
      firestoreDb.collection('users').where('isAuthorizedAdmin', '==', true).get()
    ]);

    const adminUidSet = new Set<string>();
    legacyAdminsSnap.docs.forEach((doc: any) => adminUidSet.add(doc.id));
    superAdminsSnap.docs.forEach((doc: any) => adminUidSet.add(doc.id));
    authAdminsSnap.docs.forEach((doc: any) => adminUidSet.add(doc.id));

    // Check authorizedAdmins collection documents by matching emails to user profiles if needed
    const authorizedAdminsSnap = await firestoreDb.collection('authorizedAdmins').get();
    if (!authorizedAdminsSnap.empty) {
      const authEmails = authorizedAdminsSnap.docs
        .map((d: any) => d.id.toLowerCase().trim())
        .filter(Boolean);
      for (const email of authEmails) {
        const userMatch = await firestoreDb
          .collection('users')
          .where('email', '==', email)
          .limit(1)
          .get();
        if (!userMatch.empty) {
          adminUidSet.add(userMatch.docs[0].id);
        }
      }
    }

    if (adminUidSet.size === 0) {
      const noAdminsErr = new Error(
        `[PROMOTION_REFUND_TRIGGER] No admin users found to receive refund notification for ${requestId}. Aborting financial calculation.`
      );
      console.error(noAdminsErr.message);
      throw noAdminsErr;
    }

    const adminUids = Array.from(adminUidSet);

    // 5. Deterministic notification IDs & Concurrency-Safe Idempotent Multi-Path Dispatch
    // Both root (/notifications/{id}) and nested (/users/{adminUid}/notifications/{id}) documents
    // are created using docRef.create(). If a competing execution commits first or a previous retry succeeded,
    // docRef.create() fails with ALREADY_EXISTS.
    //
    // Identity verification:
    // If ALREADY_EXISTS is encountered, verify that the existing document matches the expected refund
    // request identity using strict identity validation. If an unexpected document occupies the deterministic ID, treat as an error.
    const notifItems = adminUids.map((adminUid) => ({
      adminUid,
      notifId: `refund_req_${requestId}_${adminUid}`
    }));

    const notificationErrors: Error[] = [];

    for (const { adminUid, notifId } of notifItems) {
      const notificationPayload = {
        id: notifId,
        userId: adminUid,
        type: 'REFUND_REQUEST',
        title: notificationTitle,
        message: notificationMessage,
        relatedId: requestId,
        requestId: requestId,
        link: '/admin',
        url: '/admin',
        read: false,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
        timestamp: FieldValue.serverTimestamp()
      };

      const rootNotifRef = firestoreDb.collection('notifications').doc(notifId);
      const userNotifRef = firestoreDb
        .collection('users')
        .doc(adminUid)
        .collection('notifications')
        .doc(notifId);

      // Write root notification using atomic create (precondition: exists == false)
      try {
        await rootNotifRef.create(notificationPayload);
      } catch (createErr: any) {
        if (isAlreadyExistsError(createErr)) {
          // Identity verification: ensure existing document matches this refund request
          try {
            const existingSnap = await rootNotifRef.get();
            const existingData = existingSnap.data();
            const isExpectedIdentity =
              existingSnap.exists &&
              isExpectedRefundNotificationIdentity(existingData, requestId, adminUid);

            if (!isExpectedIdentity) {
              const collisionErr = new Error(
                `Unexpected collision on root notification document ${notifId}: existing document does not match expected refund request identity`
              );
              console.error(`[PROMOTION_REFUND_TRIGGER] ${collisionErr.message}`);
              notificationErrors.push(collisionErr);
            }
          } catch (inspectErr: any) {
            console.error(`[PROMOTION_REFUND_TRIGGER] Failed to verify identity of existing root notification ${notifId}:`, inspectErr);
            notificationErrors.push(inspectErr instanceof Error ? inspectErr : new Error(String(inspectErr)));
          }
        } else {
          console.error(`[PROMOTION_REFUND_TRIGGER] Error creating root notification ${notifId}:`, createErr);
          notificationErrors.push(createErr instanceof Error ? createErr : new Error(String(createErr)));
        }
      }

      // Write nested user notification using atomic create (precondition: exists == false)
      try {
        await userNotifRef.create(notificationPayload);
      } catch (createErr: any) {
        if (isAlreadyExistsError(createErr)) {
          // Identity verification: ensure existing nested document matches this refund request
          try {
            const existingSnap = await userNotifRef.get();
            const existingData = existingSnap.data();
            const isExpectedIdentity =
              existingSnap.exists &&
              isExpectedRefundNotificationIdentity(existingData, requestId, adminUid);

            if (!isExpectedIdentity) {
              const collisionErr = new Error(
                `Unexpected collision on nested notification document ${notifId}: existing document does not match expected refund request identity`
              );
              console.error(`[PROMOTION_REFUND_TRIGGER] ${collisionErr.message}`);
              notificationErrors.push(collisionErr);
            }
          } catch (inspectErr: any) {
            console.error(`[PROMOTION_REFUND_TRIGGER] Failed to verify identity of existing nested notification ${notifId}:`, inspectErr);
            notificationErrors.push(inspectErr instanceof Error ? inspectErr : new Error(String(inspectErr)));
          }
        } else {
          console.error(`[PROMOTION_REFUND_TRIGGER] Error creating nested notification ${notifId}:`, createErr);
          notificationErrors.push(createErr instanceof Error ? createErr : new Error(String(createErr)));
        }
      }
    }

    // Propagate error if any required notification write failed or had unexpected collision
    if (notificationErrors.length > 0) {
      const errorDetails = notificationErrors.map((e) => e.message || String(e)).join('; ');
      throw new Error(
        `[PROMOTION_REFUND_TRIGGER] Failed ${notificationErrors.length} required notification write(s) for refund request ${requestId}: ${errorDetails}`
      );
    }

    // 6. Record authoritative calculated refund amounts on the promotionRequest document
    // Only reached if all required notifications succeeded or were verified as existing
    const promoDocRef = firestoreDb.collection('promotionRequests').doc(requestId);
    await promoDocRef.update({
      refundCalculatedAmount: refundAmount,
      refundRetentionAmount: retentionAmount,
      refundPercentage: 95,
      refundRetentionPercentage: 5,
      updatedAt: FieldValue.serverTimestamp()
    });

    console.log(
      `[PROMOTION_REFUND_TRIGGER] Successfully processed refund alert for request ${requestId} (${adminUids.length} admins notified).`
    );

    return {
      triggered: true,
      adminCount: adminUids.length,
      refundAmount,
      retentionAmount
    };
  } catch (err) {
    console.error(`[PROMOTION_REFUND_TRIGGER] Failed to process refund notification for request ${requestId}:`, err);
    throw err;
  }
}

/**
 * Server-authoritative Cloud Function (v2): Triggered on /promotionRequests/{requestId} updates.
 * Configured with retry: true to ensure transient notification failures trigger Eventarc redelivery.
 */
export const onPromotionRefundRequestedTrigger = onDocumentUpdated(
  {
    document: 'promotionRequests/{requestId}',
    database: 'ai-studio-c5cea893-acec-4774-a11a-e26679ae7862',
    retry: true
  },
  async (event) => {
    return handlePromotionRefundRequestedEvent(event, defaultDb);
  }
);
