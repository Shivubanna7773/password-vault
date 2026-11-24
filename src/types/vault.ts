import type { Timestamp } from 'firebase/firestore';

export type VaultCategory = 'login' | 'banking' | 'wifi' | 'note' | 'card';

/**
 * Constants mirrored verbatim from firebase-blueprint.json to guarantee
 * client payloads stay within Firestore security rule bounds.
 */
export const VAULT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_MAX: 128,
  TITLE_MIN: 1,
  TITLE_MAX: 120,
  DOMAIN_MAX: 200,
  CIPHERTEXT_MAX: 32000,
  SALT_MIN: 16,
  SALT_MAX: 128,
  IV_MIN: 12,
  IV_MAX: 64,
  KDF_DEFAULT_ITERATIONS: 310000,
  ALLOWED_CATEGORIES: ['login', 'banking', 'wifi', 'note', 'card'] as const,
} as const;

export interface VaultProfileDoc {
  ownerId: string;
  salt: string;
  verifierIv: string;
  verifierCiphertext: string;
  kdfIterations: number;
  autoLockMinutes: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface VaultSecretPayload {
  username: string;
  password: string;
  url: string;
  notes: string;
  totpSecret: string;
}

export interface EncryptedVaultItemDoc {
  ownerId: string;
  title: string;
  category: VaultCategory;
  domain: string;
  isFavorite: boolean;
  strengthScore: number;
  hasTotp: boolean;
  iv: string;
  ciphertext: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DecryptedVaultItem {
  id: string;
  ownerId: string;
  title: string;
  category: VaultCategory;
  domain: string;
  isFavorite: boolean;
  strengthScore: number;
  hasTotp: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  secret: VaultSecretPayload;
  decryptionFailed?: boolean;
}

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  entropyBits: number;
  crackTime: string;
}

export type AppView = 'vault' | 'generator' | 'health' | 'sync';
