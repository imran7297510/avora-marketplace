"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDeduplicationKey = generateDeduplicationKey;
exports.validateTrustEventParams = validateTrustEventParams;
const trustScoreTypes_1 = require("./trustScoreTypes");
function generateDeduplicationKey(eventType, relatedEntityId, userId) {
    const cleanEntityId = (relatedEntityId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanUserId = (userId || '').trim();
    return `${eventType}_${cleanEntityId}_${cleanUserId}`;
}
function validateTrustEventParams(params) {
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
    if (!(0, trustScoreTypes_1.isValidTrustEventType)(eventType)) {
        return { isValid: false, cleanUserId: '', cleanEntityId: '', cleanReason: '', cleanCreatedBy: '', deduplicationKey: '', errorMessage: `Invalid trust event type: ${eventType}` };
    }
    if (!(0, trustScoreTypes_1.isValidTrustSourceModule)(sourceModule)) {
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
//# sourceMappingURL=trustScoreValidation.js.map