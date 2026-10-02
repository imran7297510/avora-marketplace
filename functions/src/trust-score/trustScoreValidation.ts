import { 
  TrustEventType, 
  TrustSourceModule, 
  isValidTrustEventType, 
  isValidTrustSourceModule 
} from './trustScoreTypes';

export interface TrustEventValidationParams {
  userId: string;
  eventType: TrustEventType;
  relatedEntityId: string;
  sourceModule: TrustSourceModule;
  reason: string;
  createdBy?: string;
  customDelta?: number;
}

export function generateDeduplicationKey(
  eventType: TrustEventType,
  relatedEntityId: string,
  userId: string
): string {
  const cleanEntityId = (relatedEntityId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanUserId = (userId || '').trim();
  return `${eventType}_${cleanEntityId}_${cleanUserId}`;
}

export function validateTrustEventParams(params: TrustEventValidationParams): {
  isValid: boolean;
  cleanUserId: string;
  cleanEntityId: string;
  cleanReason: string;
  cleanCreatedBy: string;
  deduplicationKey: string;
  errorMessage?: string;
} {
  const { userId, eventType, relatedEntityId, sourceModule, reason, createdBy } = params;

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { isValid: false, cleanUserId: '', cleanEntityId: '', cleanReason: '', cleanCreatedBy: '', deduplicationKey: '', errorMessage: 'Target userId is required.' };
  }
  if (!relatedEntityId || typeof relatedEntityId !== 'string' || !relatedEntityId.trim()) {
    return { isValid: false, cleanUserId: '', cleanEntityId: '', cleanReason: '', cleanCreatedBy: '', deduplicationKey: '', errorMessage: 'Related entity ID is required.' };
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return { isValid: false, cleanUserId: '', cleanEntityId: '', cleanReason: '', cleanCreatedBy: '', deduplicationKey: '', errorMessage: 'Mandatory reason string is required.' };
  }
  if (!isValidTrustEventType(eventType)) {
    return { isValid: false, cleanUserId: '', cleanEntityId: '', cleanReason: '', cleanCreatedBy: '', deduplicationKey: '', errorMessage: `Invalid trust event type: ${eventType}` };
  }
  if (!isValidTrustSourceModule(sourceModule)) {
    return { isValid: false, cleanUserId: '', cleanEntityId: '', cleanReason: '', cleanCreatedBy: '', deduplicationKey: '', errorMessage: `Invalid source module: ${sourceModule}` };
  }

  const cleanUserId = userId.trim();
  const cleanEntityId = relatedEntityId.trim();
  const cleanReason = reason.trim();
  const cleanCreatedBy = (createdBy || 'SERVER_SYSTEM').trim();
  const deduplicationKey = generateDeduplicationKey(eventType, cleanEntityId, cleanUserId);

  return {
    isValid: true,
    cleanUserId,
    cleanEntityId,
    cleanReason,
    cleanCreatedBy,
    deduplicationKey
  };
}
