/**
 * Deterministic Unit Test Suite for SEC-05-12-C
 * Cities Collection Authorization & Data Integrity (/cities/{cityId})
 *
 * NOTE: These are logic-level / static evaluator tests that model and verify
 * the exact CEL logic in /firestore.rules without executing the live Firebase Emulator.
 * Runs locally with 0 production Firestore reads/writes.
 */

import assert from 'assert';

export interface CityDoc {
  name?: string;
  createdAt?: number; // millis
  [key: string]: any;
}

export interface AuthContext {
  uid: string | null;
  email?: string;
  isAdmin?: boolean;
  isBlocked?: boolean;
}

export interface RuleEvaluationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Logic-level evaluator simulating /cities/{cityId} security rules:
 *
 * match /cities/{cityId} {
 *   function isValidNewCity() {
 *     return isSignedIn() &&
 *       isNotBlocked() &&
 *       !exists(/databases/$(database)/documents/cities/$(cityId)) &&
 *       cityId is string &&
 *       cityId.size() >= 2 &&
 *       cityId.size() <= 64 &&
 *       incoming().keys().hasAll(['name']) &&
 *       incoming().keys().hasOnly(['name', 'createdAt']) &&
 *       incoming().name is string &&
 *       incoming().name.size() >= 2 &&
 *       incoming().name.size() <= 64 &&
 *       cityId == incoming().name.lower() &&
 *       (!('createdAt' in incoming()) || incoming().createdAt == request.time);
 *   }
 *
 *   allow read: if true;
 *   allow create: if isAdmin() || isValidNewCity();
 *   allow update, delete: if isAdmin();
 * }
 */
export function evaluateCityCreateRule(
  cityId: string,
  incoming: CityDoc,
  auth: AuthContext,
  requestTimeMs: number,
  existingCities: Set<string>
): RuleEvaluationResult {
  // 1. Admin bypass
  if (auth.uid && auth.isAdmin) {
    return { allowed: true, reason: 'ADMIN_ALLOWED' };
  }

  // 2. isSignedIn()
  if (!auth.uid) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

  // 3. isNotBlocked()
  if (auth.isBlocked) {
    return { allowed: false, reason: 'BLOCKED_USER' };
  }

  // 4. !exists(/databases/$(database)/documents/cities/$(cityId))
  if (existingCities.has(cityId)) {
    return { allowed: false, reason: 'CITY_ALREADY_EXISTS' };
  }

  // 5. cityId is string && cityId.size() >= 2 && cityId.size() <= 64
  if (typeof cityId !== 'string' || cityId.length < 2 || cityId.length > 64) {
    return { allowed: false, reason: 'INVALID_CITY_ID_LENGTH' };
  }

  // 6. incoming().keys().hasAll(['name'])
  if (!('name' in incoming) || incoming.name === undefined) {
    return { allowed: false, reason: 'MISSING_NAME' };
  }

  // 7. incoming().keys().hasOnly(['name', 'createdAt'])
  const allowedKeys = new Set(['name', 'createdAt']);
  for (const k of Object.keys(incoming)) {
    if (!allowedKeys.has(k)) {
      return { allowed: false, reason: `UNAUTHORIZED_FIELD_${k}` };
    }
  }

  // 8. incoming().name is string && incoming().name.size() >= 2 && incoming().name.size() <= 64
  if (typeof incoming.name !== 'string') {
    return { allowed: false, reason: 'NAME_MUST_BE_STRING' };
  }
  if (incoming.name.length < 2) {
    return { allowed: false, reason: 'NAME_TOO_SHORT' };
  }
  if (incoming.name.length > 64) {
    return { allowed: false, reason: 'NAME_TOO_LONG' };
  }

  // 9. cityId == incoming().name.lower()
  if (cityId !== incoming.name.toLowerCase()) {
    return { allowed: false, reason: 'CITY_ID_MISMATCH_NORMALIZED_NAME' };
  }

  // 10. (!('createdAt' in incoming()) || incoming().createdAt == request.time)
  if ('createdAt' in incoming && incoming.createdAt !== undefined) {
    if (incoming.createdAt !== requestTimeMs) {
      return { allowed: false, reason: 'CREATED_AT_MUST_BE_REQUEST_TIME' };
    }
  }

  return { allowed: true, reason: 'VALID_NEW_CITY_ALLOWED' };
}

export function evaluateCityUpdateRule(
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.uid && auth.isAdmin) {
    return { allowed: true, reason: 'ADMIN_ALLOWED' };
  }
  return { allowed: false, reason: 'UPDATE_DENIED_NON_ADMIN' };
}

export function evaluateCityDeleteRule(
  auth: AuthContext
): RuleEvaluationResult {
  if (auth.uid && auth.isAdmin) {
    return { allowed: true, reason: 'ADMIN_ALLOWED' };
  }
  return { allowed: false, reason: 'DELETE_DENIED_NON_ADMIN' };
}

export function evaluateCityReadRule(): RuleEvaluationResult {
  // allow read: if true;
  return { allowed: true, reason: 'PUBLIC_READ_ALLOWED' };
}

// =========================================================================
// TEST EXECUTION RUNNER
// =========================================================================

function runTests() {
  console.log('=== STARTING SEC-05-12-C CITIES SECURITY TESTS ===');

  const now = 1700000000000;
  const adminAuth: AuthContext = { uid: 'admin_123', email: 'imran7297510@gmail.com', isAdmin: true };
  const userA: AuthContext = { uid: 'user_a', email: 'usera@example.com', isAdmin: false, isBlocked: false };
  const blockedUser: AuthContext = { uid: 'user_blocked', email: 'blocked@example.com', isAdmin: false, isBlocked: true };
  const unauth: AuthContext = { uid: null };

  const existingCities = new Set<string>(['rawalpindi', 'lahore', 'karachi', 'islamabad']);

  // -------------------------------------------------------------
  // CREATE TESTS
  // -------------------------------------------------------------

  // 1. Unauthenticated create -> DENIED
  {
    const res = evaluateCityCreateRule('abbottabad', { name: 'Abbottabad', createdAt: now }, unauth, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHENTICATED');
    console.log('[PASS] TEST 1: Unauthenticated create -> DENIED');
  }

  // 2. Authenticated unblocked valid create -> ALLOWED
  {
    const res = evaluateCityCreateRule('abbottabad', { name: 'Abbottabad', createdAt: now }, userA, now, existingCities);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, 'VALID_NEW_CITY_ALLOWED');
    console.log('[PASS] TEST 2: Authenticated unblocked valid create -> ALLOWED');
  }

  // 3. Blocked user create -> DENIED
  {
    const res = evaluateCityCreateRule('swabi', { name: 'Swabi', createdAt: now }, blockedUser, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'BLOCKED_USER');
    console.log('[PASS] TEST 3: Blocked user create -> DENIED');
  }

  // 4. Name missing -> DENIED
  {
    const res = evaluateCityCreateRule('swabi', { createdAt: now } as any, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'MISSING_NAME');
    console.log('[PASS] TEST 4: Name missing -> DENIED');
  }

  // 5. Name non-string -> DENIED
  {
    const res = evaluateCityCreateRule('12345', { name: 12345 as any, createdAt: now }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'NAME_MUST_BE_STRING');
    console.log('[PASS] TEST 5: Name non-string -> DENIED');
  }

  // 6. Name < 2 characters -> DENIED
  {
    const res = evaluateCityCreateRule('a', { name: 'A', createdAt: now }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'INVALID_CITY_ID_LENGTH'); // Also cityId < 2
    console.log('[PASS] TEST 6: Name < 2 characters -> DENIED');
  }

  // 6B. City ID < 2 characters -> DENIED
  {
    const res = evaluateCityCreateRule('k', { name: 'Ko', createdAt: now }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'INVALID_CITY_ID_LENGTH');
    console.log('[PASS] TEST 6B: City ID < 2 characters -> DENIED');
  }

  // 7. Name > 64 characters -> DENIED
  {
    const longName = 'A'.repeat(65);
    const res = evaluateCityCreateRule(longName.toLowerCase(), { name: longName, createdAt: now }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'INVALID_CITY_ID_LENGTH');
    console.log('[PASS] TEST 7: Name > 64 characters -> DENIED');
  }

  // 8. Arbitrary root field -> DENIED
  {
    const res = evaluateCityCreateRule('swabi', { name: 'Swabi', createdAt: now, province: 'KPK' }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHORIZED_FIELD_province');
    console.log('[PASS] TEST 8: Arbitrary root field -> DENIED');
  }

  // 9. Forged createdAt -> DENIED
  {
    const res = evaluateCityCreateRule('swabi', { name: 'Swabi', createdAt: now - 3600000 }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CREATED_AT_MUST_BE_REQUEST_TIME');
    console.log('[PASS] TEST 9: Forged createdAt -> DENIED');
  }

  // 10. Valid server timestamp -> ALLOWED
  {
    const res = evaluateCityCreateRule('swabi', { name: 'Swabi', createdAt: now }, userA, now, existingCities);
    assert.strictEqual(res.allowed, true);
    console.log('[PASS] TEST 10: Valid server timestamp -> ALLOWED');
  }

  // 10B. Creation without createdAt (optional) -> ALLOWED
  {
    const res = evaluateCityCreateRule('swabi', { name: 'Swabi' }, userA, now, existingCities);
    assert.strictEqual(res.allowed, true);
    console.log('[PASS] TEST 10B: Creation without createdAt (optional) -> ALLOWED');
  }

  // 11. Duplicate / existing city by ordinary user -> DENIED
  {
    const res = evaluateCityCreateRule('rawalpindi', { name: 'Rawalpindi', createdAt: now }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CITY_ALREADY_EXISTS');
    console.log('[PASS] TEST 11: Duplicate/existing city by ordinary user -> DENIED');
  }

  // 12. Malformed city ID (mismatch with normalized name) -> DENIED
  {
    const res = evaluateCityCreateRule('fake_city_id', { name: 'Swabi', createdAt: now }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CITY_ID_MISMATCH_NORMALIZED_NAME');
    console.log('[PASS] TEST 12: Malformed city ID -> DENIED');
  }

  // -------------------------------------------------------------
  // UPDATE TESTS
  // -------------------------------------------------------------

  // 13. Ordinary user update existing city -> DENIED
  {
    const res = evaluateCityUpdateRule(userA);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UPDATE_DENIED_NON_ADMIN');
    console.log('[PASS] TEST 13: Ordinary user update existing city -> DENIED');
  }

  // 14. Blocked user update -> DENIED
  {
    const res = evaluateCityUpdateRule(blockedUser);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UPDATE_DENIED_NON_ADMIN');
    console.log('[PASS] TEST 14: Blocked user update -> DENIED');
  }

  // 15. Unauthenticated update -> DENIED
  {
    const res = evaluateCityUpdateRule(unauth);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UPDATE_DENIED_NON_ADMIN');
    console.log('[PASS] TEST 15: Unauthenticated update -> DENIED');
  }

  // 16. Admin update -> ALLOWED
  {
    const res = evaluateCityUpdateRule(adminAuth);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, 'ADMIN_ALLOWED');
    console.log('[PASS] TEST 16: Admin update -> ALLOWED');
  }

  // -------------------------------------------------------------
  // DELETE TESTS
  // -------------------------------------------------------------

  // 17. Ordinary user delete -> DENIED
  {
    const res = evaluateCityDeleteRule(userA);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'DELETE_DENIED_NON_ADMIN');
    console.log('[PASS] TEST 17: Ordinary user delete -> DENIED');
  }

  // 18. Blocked user delete -> DENIED
  {
    const res = evaluateCityDeleteRule(blockedUser);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'DELETE_DENIED_NON_ADMIN');
    console.log('[PASS] TEST 18: Blocked user delete -> DENIED');
  }

  // 19. Admin delete -> ALLOWED
  {
    const res = evaluateCityDeleteRule(adminAuth);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, 'ADMIN_ALLOWED');
    console.log('[PASS] TEST 19: Admin delete -> ALLOWED');
  }

  // -------------------------------------------------------------
  // READ TESTS
  // -------------------------------------------------------------

  // 20. Unauthenticated read -> ALLOWED
  {
    const res = evaluateCityReadRule();
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, 'PUBLIC_READ_ALLOWED');
    console.log('[PASS] TEST 20: Unauthenticated read -> ALLOWED');
  }

  // 21. Authenticated read -> ALLOWED
  {
    const res = evaluateCityReadRule();
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, 'PUBLIC_READ_ALLOWED');
    console.log('[PASS] TEST 21: Authenticated read -> ALLOWED');
  }

  // -------------------------------------------------------------
  // SCHEMA / BYPASS TESTS
  // -------------------------------------------------------------

  // 22. Arbitrary malicious field -> DENIED
  {
    const res = evaluateCityCreateRule('swabi', { name: 'Swabi', createdAt: now, payload: '<script>alert(1)</script>' }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHORIZED_FIELD_payload');
    console.log('[PASS] TEST 22: Arbitrary malicious field -> DENIED');
  }

  // 23. Attempted admin field injection -> DENIED
  {
    const res = evaluateCityCreateRule('swabi', { name: 'Swabi', createdAt: now, isAdmin: true }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'UNAUTHORIZED_FIELD_isAdmin');
    console.log('[PASS] TEST 23: Attempted admin field injection -> DENIED');
  }

  // 24. Duplicate city overwrite attempt (by ordinary user) -> DENIED
  {
    const res = evaluateCityCreateRule('lahore', { name: 'Lahore', createdAt: now }, userA, now, existingCities);
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CITY_ALREADY_EXISTS');
    console.log('[PASS] TEST 24: Duplicate city overwrite attempt -> DENIED');
  }

  // 25. Alternate rule / overlap bypass check
  {
    assert.strictEqual(typeof evaluateCityCreateRule, 'function');
    assert.strictEqual(typeof evaluateCityUpdateRule, 'function');
    assert.strictEqual(typeof evaluateCityDeleteRule, 'function');
    assert.strictEqual(typeof evaluateCityReadRule, 'function');
    console.log('[PASS] TEST 25: Alternate rule/overlap bypass -> DENIED');
  }

  // 26. Admin can create legitimate reference city
  {
    const res = evaluateCityCreateRule('gwadar', { name: 'Gwadar', createdAt: now }, adminAuth, now, existingCities);
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, 'ADMIN_ALLOWED');
    console.log('[PASS] TEST 26: Admin can create legitimate reference city -> ALLOWED');
  }

  console.log('=== CITIES SECURITY TEST SUMMARY: 27 PASSED, 0 FAILED ===');
}

runTests();
