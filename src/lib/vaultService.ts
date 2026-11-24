import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  createPassphraseVerifier,
  deriveVaultKey,
  encryptVaultSecret,
  generateSafeDocId,
  generateSaltBase64,
} from './crypto';
import {
  VAULT_LIMITS,
  type EncryptedVaultItemDoc,
  type VaultCategory,
  type VaultProfileDoc,
  type VaultSecretPayload,
} from '../types/vault';

function assertSafeId(id: string, label: string): void {
  if (!VAULT_LIMITS.ID_PATTERN.test(id) || id.length > VAULT_LIMITS.ID_MAX) {
    throw new Error(`Invalid ${label} format.`);
  }
}

function sanitizeTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length < VAULT_LIMITS.TITLE_MIN) {
    throw new Error('Entry title is required.');
  }
  return trimmed.slice(0, VAULT_LIMITS.TITLE_MAX);
}

function sanitizeDomain(domain: string): string {
  return domain.trim().slice(0, VAULT_LIMITS.DOMAIN_MAX);
}

function clampStrength(score: number): number {
  const rounded = Math.round(score);
  return Math.max(0, Math.min(4, rounded));
}

export function subscribeVaultProfile(
  userId: string,
  onData: (profile: VaultProfileDoc | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  assertSafeId(userId, 'userId');
  const path = `vaultProfiles/${userId}`;
  const ref = doc(db, 'vaultProfiles', userId);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
      } else {
        onData(snap.data() as VaultProfileDoc);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createVaultProfile(
  userId: string,
  masterPassphrase: string,
  autoLockMinutes = 15
): Promise<CryptoKey> {
  assertSafeId(userId, 'userId');
  const salt = generateSaltBase64();
  const iterations = VAULT_LIMITS.KDF_DEFAULT_ITERATIONS;
  const key = await deriveVaultKey(masterPassphrase, salt, iterations);
  const { verifierIv, verifierCiphertext } = await createPassphraseVerifier(key);

  const path = `vaultProfiles/${userId}`;
  try {
    await setDoc(doc(db, 'vaultProfiles', userId), {
      ownerId: userId,
      salt,
      verifierIv,
      verifierCiphertext,
      kdfIterations: iterations,
      autoLockMinutes: Math.max(0, Math.min(1440, Math.round(autoLockMinutes))),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return key;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateAutoLockPreference(
  userId: string,
  autoLockMinutes: number
): Promise<void> {
  assertSafeId(userId, 'userId');
  const path = `vaultProfiles/${userId}`;
  try {
    await updateDoc(doc(db, 'vaultProfiles', userId), {
      autoLockMinutes: Math.max(0, Math.min(1440, Math.round(autoLockMinutes))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeVaultItems(
  userId: string,
  onItems: (items: Array<{ id: string; data: EncryptedVaultItemDoc }>) => void,
  onError: (err: Error) => void
): Unsubscribe {
  assertSafeId(userId, 'userId');
  const path = `vaultProfiles/${userId}/items`;
  const q = query(
    collection(db, 'vaultProfiles', userId, 'items'),
    where('ownerId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const results = snapshot.docs.map((d) => ({
        id: d.id,
        data: d.data() as EncryptedVaultItemDoc,
      }));
      onItems(results);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export interface SaveVaultItemInput {
  id?: string;
  title: string;
  category: VaultCategory;
  domain: string;
  isFavorite: boolean;
  strengthScore: number;
  secret: VaultSecretPayload;
}

export async function saveVaultItem(
  userId: string,
  vaultKey: CryptoKey,
  input: SaveVaultItemInput
): Promise<string> {
  assertSafeId(userId, 'userId');
  const itemId = input.id ? input.id : generateSafeDocId('itm');
  assertSafeId(itemId, 'itemId');

  const safeTitle = sanitizeTitle(input.title);
  const safeDomain = sanitizeDomain(input.domain);
  const category = VAULT_LIMITS.ALLOWED_CATEGORIES.includes(input.category)
    ? input.category
    : 'login';

  const { iv, ciphertext } = await encryptVaultSecret(vaultKey, input.secret);
  if (ciphertext.length > VAULT_LIMITS.CIPHERTEXT_MAX) {
    throw new Error('Encrypted entry notes exceed the maximum allowed size.');
  }

  const hasTotp = input.secret.totpSecret.trim().length > 0;
  const path = `vaultProfiles/${userId}/items/${itemId}`;
  const docRef = doc(db, 'vaultProfiles', userId, 'items', itemId);

  try {
    if (input.id) {
      await updateDoc(docRef, {
        title: safeTitle,
        category,
        domain: safeDomain,
        isFavorite: Boolean(input.isFavorite),
        strengthScore: clampStrength(input.strengthScore),
        hasTotp,
        iv,
        ciphertext,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        ownerId: userId,
        title: safeTitle,
        category,
        domain: safeDomain,
        isFavorite: Boolean(input.isFavorite),
        strengthScore: clampStrength(input.strengthScore),
        hasTotp,
        iv,
        ciphertext,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return itemId;
  } catch (error) {
    handleFirestoreError(
      error,
      input.id ? OperationType.UPDATE : OperationType.CREATE,
      path
    );
  }
}

export async function toggleFavoriteVaultItem(
  userId: string,
  itemId: string,
  isFavorite: boolean
): Promise<void> {
  assertSafeId(userId, 'userId');
  assertSafeId(itemId, 'itemId');
  const path = `vaultProfiles/${userId}/items/${itemId}`;

  try {
    await updateDoc(doc(db, 'vaultProfiles', userId, 'items', itemId), {
      isFavorite: Boolean(isFavorite),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteVaultItem(userId: string, itemId: string): Promise<void> {
  assertSafeId(userId, 'userId');
  assertSafeId(itemId, 'itemId');
  const path = `vaultProfiles/${userId}/items/${itemId}`;

  try {
    await deleteDoc(doc(db, 'vaultProfiles', userId, 'items', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
