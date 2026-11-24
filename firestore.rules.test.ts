/**
 * Security Rules Verification Spec for Keystone Vault ("Dirty Dozen" Payloads)
 * Designed for @firebase/rules-unit-testing against firestore.rules.
 */

export const DIRTY_DOZEN_PAYLOADS = [
  {
    name: '1. Unauthenticated profile read',
    auth: null,
    operation: 'GET /vaultProfiles/userA',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Cross-user profile creation',
    auth: { uid: 'userB', email_verified: true },
    operation: 'CREATE /vaultProfiles/userA',
    payload: { ownerId: 'userA' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Owner spoofing on own profile',
    auth: { uid: 'userB', email_verified: true },
    operation: 'CREATE /vaultProfiles/userB',
    payload: { ownerId: 'userA' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Unverified email bypass',
    auth: { uid: 'userA', email_verified: false },
    operation: 'CREATE /vaultProfiles/userA',
    payload: { ownerId: 'userA' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Shadow field injection on profile',
    auth: { uid: 'userA', email_verified: true },
    operation: 'CREATE /vaultProfiles/userA',
    payload: { ownerId: 'userA', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Profile collection enumeration',
    auth: { uid: 'userA', email_verified: true },
    operation: 'LIST /vaultProfiles',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Orphaned item creation without parent profile',
    auth: { uid: 'userA', email_verified: true },
    operation: 'CREATE /vaultProfiles/userA/items/item_1',
    payload: { ownerId: 'userA', title: 'Test', category: 'login' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Cross-user item list',
    auth: { uid: 'userB', email_verified: true },
    operation: 'LIST /vaultProfiles/userA/items',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. ID poisoning attack',
    auth: { uid: 'userA', email_verified: true },
    operation: 'CREATE /vaultProfiles/userA/items/invalid$id..slash',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Category enum bypass',
    auth: { uid: 'userA', email_verified: true },
    operation: 'CREATE /vaultProfiles/userA/items/item_1',
    payload: { ownerId: 'userA', category: 'superuser' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Oversized ciphertext resource poisoning',
    auth: { uid: 'userA', email_verified: true },
    operation: 'CREATE /vaultProfiles/userA/items/item_1',
    payload: { ownerId: 'userA', ciphertext: 'A'.repeat(40000) },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Immutable createdAt / ownerId mutation on update',
    auth: { uid: 'userA', email_verified: true },
    operation: 'UPDATE /vaultProfiles/userA/items/item_1',
    payload: { ownerId: 'userB', title: 'Tampered' },
    expected: 'PERMISSION_DENIED',
  },
];
