import type { PasswordStrengthResult, VaultSecretPayload } from '../types/vault';

const VERIFIER_PLAINTEXT = 'KEYSTONE_VERIFIER_V1';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSaltBase64(): string {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(salt);
}

export function generateSafeDocId(prefix = 'itm'): string {
  const random = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export async function deriveVaultKey(
  passphrase: string,
  saltBase64: string,
  iterations: number
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const saltBytes = base64ToBytes(saltBase64);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(
  key: CryptoKey,
  plaintext: string
): Promise<{ iv: string; ciphertext: string }> {
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
    key,
    textEncoder.encode(plaintext)
  );
  return {
    iv: bytesToBase64(ivBytes),
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
  };
}

export async function decryptText(
  key: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string
): Promise<string> {
  const ivBytes = base64ToBytes(ivBase64);
  const cipherBytes = base64ToBytes(ciphertextBase64);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
    key,
    cipherBytes.buffer as ArrayBuffer
  );
  return textDecoder.decode(decryptedBuffer);
}

export async function createPassphraseVerifier(key: CryptoKey): Promise<{
  verifierIv: string;
  verifierCiphertext: string;
}> {
  const { iv, ciphertext } = await encryptText(key, VERIFIER_PLAINTEXT);
  return { verifierIv: iv, verifierCiphertext: ciphertext };
}

export async function verifyMasterPassphrase(
  passphrase: string,
  saltBase64: string,
  iterations: number,
  verifierIv: string,
  verifierCiphertext: string
): Promise<CryptoKey | null> {
  try {
    const key = await deriveVaultKey(passphrase, saltBase64, iterations);
    const decrypted = await decryptText(key, verifierIv, verifierCiphertext);
    return decrypted === VERIFIER_PLAINTEXT ? key : null;
  } catch {
    return null;
  }
}

export async function encryptVaultSecret(
  key: CryptoKey,
  payload: VaultSecretPayload
): Promise<{ iv: string; ciphertext: string }> {
  return encryptText(key, JSON.stringify(payload));
}

export async function decryptVaultSecret(
  key: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string
): Promise<VaultSecretPayload> {
  const json = await decryptText(key, ivBase64, ciphertextBase64);
  const parsed = JSON.parse(json) as Partial<VaultSecretPayload>;
  return {
    username: typeof parsed.username === 'string' ? parsed.username : '',
    password: typeof parsed.password === 'string' ? parsed.password : '',
    url: typeof parsed.url === 'string' ? parsed.url : '',
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    totpSecret: typeof parsed.totpSecret === 'string' ? parsed.totpSecret : '',
  };
}

export interface PasswordGeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const NUMS = '0123456789';
const SYMS = '!@#$%^&*()-_=+[]{}|;:,.<>?';
const AMBIGUOUS = /[O0Il1]/g;

function getSecureRandomInt(maxExclusive: number): number {
  const array = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  let value: number;
  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= limit);
  return value % maxExclusive;
}

export function generateStrongPassword(opts: PasswordGeneratorOptions): string {
  const clean = (chars: string) => (opts.excludeAmbiguous ? chars.replace(AMBIGUOUS, '') : chars);

  const pools: string[] = [];
  if (opts.uppercase) pools.push(clean(UPPER));
  if (opts.lowercase) pools.push(clean(LOWER));
  if (opts.numbers) pools.push(clean(NUMS));
  if (opts.symbols) pools.push(SYMS);

  if (pools.length === 0) {
    pools.push(clean(LOWER), clean(NUMS));
  }

  const allChars = pools.join('');
  const result: string[] = [];

  // Guarantee at least one character from each enabled pool
  for (const pool of pools) {
    if (result.length < opts.length && pool.length > 0) {
      result.push(pool[getSecureRandomInt(pool.length)]);
    }
  }

  while (result.length < opts.length) {
    result.push(allChars[getSecureRandomInt(allChars.length)]);
  }

  // Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(i + 1);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }

  return result.join('');
}

const WORD_LIST = [
  'amber', 'anchor', 'apricot', 'atlas', 'autumn', 'bamboo', 'beacon', 'breeze',
  'canyon', 'cedar', 'cinder', 'cobalt', 'compass', 'copper', 'coral', 'crest',
  'cypress', 'delta', 'dune', 'echo', 'elm', 'ember', 'falcon', 'fern',
  'fjord', 'flint', 'forest', 'frost', 'garnet', 'glacier', 'granite', 'harbor',
  'hazel', 'horizon', 'indigo', 'ivory', 'jasper', 'juniper', 'kestrel', 'lagoon',
  'larch', 'lantern', 'linen', 'lotus', 'lunar', 'maple', 'marble', 'meadow',
  'mist', 'monsoon', 'moss', 'nebula', 'north', 'oak', 'oasis', 'obsidian',
  'olive', 'onyx', 'orbit', 'osprey', 'pebble', 'pepper', 'pine', 'plume',
  'prairie', 'prism', 'quartz', 'raven', 'redwood', 'ridge', 'ripple', 'river',
  'saffron', 'sage', 'sand', 'sequoia', 'shell', 'sierra', 'silver', 'slate',
  'solstice', 'spruce', 'starlight', 'stone', 'summit', 'timber', 'topaz', 'trail',
  'tundra', 'umber', 'valley', 'velvet', 'verge', 'violet', 'walnut', 'willow',
];

export function generateMemorablePassphrase(wordCount = 4, separator = '-'): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const w = WORD_LIST[getSecureRandomInt(WORD_LIST.length)];
    words.push(w.charAt(0).toUpperCase() + w.slice(1));
  }
  const num = getSecureRandomInt(90) + 10;
  return `${words.join(separator)}${separator}${num}`;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return { score: 0, label: 'Very Weak', entropyBits: 0, crackTime: 'Instant' };
  }

  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/[0-9]/.test(password)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;

  const uniqueChars = new Set(password).size;
  const effectiveLength = Math.min(password.length, uniqueChars * 1.45);
  const entropyBits = Math.round(effectiveLength * Math.log2(Math.max(poolSize, 1)));

  let score: 0 | 1 | 2 | 3 | 4 = 0;
  let label: PasswordStrengthResult['label'] = 'Very Weak';
  let crackTime = 'Seconds';

  if (entropyBits >= 80 && password.length >= 14) {
    score = 4;
    label = 'Very Strong';
    crackTime = 'Centuries';
  } else if (entropyBits >= 60 && password.length >= 11) {
    score = 3;
    label = 'Strong';
    crackTime = 'Years';
  } else if (entropyBits >= 42 && password.length >= 8) {
    score = 2;
    label = 'Fair';
    crackTime = 'Months';
  } else if (entropyBits >= 28) {
    score = 1;
    label = 'Weak';
    crackTime = 'Hours';
  } else {
    score = 0;
    label = 'Very Weak';
    crackTime = 'Seconds';
  }

  return { score, label, entropyBits, crackTime };
}

function decodeBase32(input: string): Uint8Array | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (!cleaned) return null;

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i]);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return output.length > 0 ? new Uint8Array(output) : null;
}

export async function computeTotpCode(
  base32Secret: string
): Promise<{ code: string; remainingSeconds: number } | null> {
  const keyBytes = decodeBase32(base32Secret);
  if (!keyBytes) return null;

  try {
    const epochSeconds = Math.floor(Date.now() / 1000);
    const step = 30;
    const counter = Math.floor(epochSeconds / step);
    const remainingSeconds = step - (epochSeconds % step);

    const counterBuffer = new ArrayBuffer(8);
    const view = new DataView(counterBuffer);
    view.setUint32(0, Math.floor(counter / 0x100000000), false);
    view.setUint32(4, counter >>> 0, false);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer));
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = (binary % 1000000).toString().padStart(6, '0');
    return { code: otp, remainingSeconds };
  } catch {
    return null;
  }
}
