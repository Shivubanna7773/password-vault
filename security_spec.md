# Security Specification: Keystone Zero-Knowledge Password Vault

## 1. Data Invariants
1. **Strict Ownership Isolation**: A `VaultProfile` at `/vaultProfiles/{userId}` may only be read, created, or updated by the authenticated, email-verified user whose `request.auth.uid == userId`.
2. **Master Gate Integrity**: A `VaultItem` at `/vaultProfiles/{userId}/items/{itemId}` cannot exist without an existing parent `/vaultProfiles/{userId}` document whose `ownerId == request.auth.uid`.
3. **Immutable Provenance**: `ownerId` and `createdAt` are immutable once written on both `VaultProfile` and `VaultItem`.
4. **Temporal Integrity**: `createdAt` on create and `updatedAt` on both create and update must strictly equal `request.time`.
5. **Bounded Volumetric Constraints**: Every string field has strict `.size()` upper bounds (preventing 1MB resource poisoning) and document IDs match `^[a-zA-Z0-9_\-]+$` up to 128 characters.
6. **Zero-Knowledge Boundary**: Plaintext secrets (`password`, `username`, `totpSecret`, `notes`) are never accepted or stored; only `iv` and `ciphertext` are persisted, and strict `keys().hasOnly(...)` blocks shadow fields.

## 2. The "Dirty Dozen" Attack Payloads
1. **Unauthenticated Profile Read/Write**: `auth = null`, `GET /vaultProfiles/userA` -> `PERMISSION_DENIED`.
2. **Cross-User Profile Hijack**: `auth.uid = "userB"`, `CREATE /vaultProfiles/userA` with `ownerId: "userA"` -> `PERMISSION_DENIED`.
3. **Owner Spoofing in Profile**: `auth.uid = "userB"`, `CREATE /vaultProfiles/userB` with `ownerId: "userA"` -> `PERMISSION_DENIED`.
4. **Unverified Email Bypass**: `auth = { uid: "userA", token: { email_verified: false } }`, `CREATE /vaultProfiles/userA` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection on Profile**: `auth.uid = "userA"`, `CREATE /vaultProfiles/userA` adding `isAdmin: true` -> `PERMISSION_DENIED`.
6. **Profile Collection Enumeration (List)**: `auth.uid = "userA"`, `LIST /vaultProfiles` -> `PERMISSION_DENIED`.
7. **Orphaned Item Creation (Missing Parent Profile)**: `auth.uid = "userA"` without `/vaultProfiles/userA`, `CREATE /vaultProfiles/userA/items/item1` -> `PERMISSION_DENIED`.
8. **Cross-User Item Read/List**: `auth.uid = "userB"`, `LIST /vaultProfiles/userA/items` -> `PERMISSION_DENIED`.
9. **ID Poisoning Attack**: `auth.uid = "userA"`, `CREATE /vaultProfiles/userA/items/bad$id..with..chars` -> `PERMISSION_DENIED`.
10. **Category Enum Bypass**: `auth.uid = "userA"`, `CREATE /vaultProfiles/userA/items/item1` with `category: "admin_override"` -> `PERMISSION_DENIED`.
11. **Value / Resource Poisoning (Oversized Ciphertext)**: `auth.uid = "userA"`, `CREATE /vaultProfiles/userA/items/item1` with 40,000-char `ciphertext` -> `PERMISSION_DENIED`.
12. **Timestamp / Owner Mutation on Update**: `auth.uid = "userA"`, `UPDATE /vaultProfiles/userA/items/item1` changing `createdAt` or `ownerId` or passing client timestamp for `updatedAt` -> `PERMISSION_DENIED`.
