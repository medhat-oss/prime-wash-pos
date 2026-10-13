/**
 * Offline Admin PIN Authentication & Storage Utility
 * Provides cryptographic salted SHA-256 hashing, zero plaintext persistence in localStorage,
 * constant-time verification, and bootstrap recovery for 100% offline-first resilience.
 */

import { getCustomStoredEmployees, isOwnerEmployee } from './attendanceStorage.js';
import { Employee } from '../types/index.js';
import { safeLocalStorage } from './safeStorage.js';

const CW_ADMIN_PIN_HASH_KEY = 'cw_admin_pin_hash';
const CW_ADMIN_PIN_SALT_KEY = 'cw_admin_pin_salt';
const CW_ADMIN_PIN_UPDATED_KEY = 'cw_admin_pin_updated_at';

// Constant-time string equality check to prevent timing side-channel attacks
export function safeConstantTimeEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const strA = String(a).trim();
  const strB = String(b).trim();
  if (strA.length === 0 || strB.length === 0 || strA.length !== strB.length) return false;
  let result = 0;
  for (let i = 0; i < strA.length; i++) {
    result |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
  }
  return result === 0;
}

// Clean universal SHA-256 fallback function
function sha256Clean(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const maxWord = Math.pow(2, 32);
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let padded = ascii + '\x80';
  while ((padded.length + 8) % 64 !== 0) {
    padded += '\x00';
  }

  for (let i = 0; i < padded.length; i++) {
    const j = padded.charCodeAt(i);
    words[i >> 2] = (words[i >> 2] || 0) | (j << ((3 - (i % 4)) * 8));
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = hash.slice(0);

    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0, a, hash[1], hash[2], (hash[3] + temp1) | 0, e, hash[5], hash[6]];
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  let result = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Computes salted SHA-256 hash of a PIN
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const combined = `${salt}:${pin.trim()}`;

  // 1. Try modern Web Crypto API (browser & Node 19+)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(combined);
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {}
  }

  // 2. Pure Universal TS/JS SHA-256 fallback
  return sha256Clean(combined);
}

/**
 * Generates a random cryptographic hex salt
 */
export function generateSalt(length: number = 16): string {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint8Array(length);
      window.crypto.getRandomValues(array);
      return Array.from(array)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {}

  // Fallback salt generator
  let result = '';
  while (result.length < length * 2) {
    result += Math.random().toString(36).substring(2);
  }
  return result.substring(0, length * 2);
}

/**
 * Retrieves the stored offline salted hash and salt
 */
export function getStoredAdminPinHash(): { hash: string; salt: string; updatedAt: string } | null {
  try {
    const hash = safeLocalStorage.getItem(CW_ADMIN_PIN_HASH_KEY);
    const salt = safeLocalStorage.getItem(CW_ADMIN_PIN_SALT_KEY);
    const updatedAt = safeLocalStorage.getItem(CW_ADMIN_PIN_UPDATED_KEY) || new Date().toISOString();
    if (hash && salt) {
      return { hash: hash.trim(), salt: salt.trim(), updatedAt };
    }
  } catch {}
  return null;
}

/**
 * Sets the offline admin PIN salted hash in persistent storage (zero plaintext)
 */
export async function setOfflineAdminPin(pin: string): Promise<void> {
  const cleanPin = String(pin || '').trim();
  if (!cleanPin) return;

  try {
    const salt = generateSalt(16);
    const hash = await hashPin(cleanPin, salt);
    const updatedAt = new Date().toISOString();

    safeLocalStorage.setItem(CW_ADMIN_PIN_HASH_KEY, hash);
    safeLocalStorage.setItem(CW_ADMIN_PIN_SALT_KEY, salt);
    safeLocalStorage.setItem(CW_ADMIN_PIN_UPDATED_KEY, updatedAt);

    // Strictly purge any legacy plaintext keys
    safeLocalStorage.removeItem('cw_admin_pin');
    safeLocalStorage.removeItem('admin_master_pin');
    safeLocalStorage.removeItem('admin_pin');
  } catch (err) {
    console.warn('[OfflineAdminPinStorage] Could not write to storage:', err);
  }
}

/**
 * Bootstraps the initial default offline PIN hash if uninitialized
 * Prevents lockout on fresh offline devices.
 */
export async function bootstrapAdminPinHash(fallbackPin: string = '1234'): Promise<void> {
  try {
    const existing = getStoredAdminPinHash();
    if (existing) return;
    await setOfflineAdminPin(fallbackPin);
  } catch (err) {
    console.warn('[bootstrapAdminPinHash] Safe fallback caught:', err);
  }
}

/**
 * Verifies a PIN offline against the stored salted hash and local owner accounts
 */
export async function verifyOfflineAdminPin(pin: string): Promise<boolean> {
  const cleanPin = String(pin || '').trim();
  if (!cleanPin || cleanPin.length < 4) return false;

  // 1. Ensure hash store is bootstrapped
  let stored = getStoredAdminPinHash();
  if (!stored) {
    await bootstrapAdminPinHash();
    stored = getStoredAdminPinHash();
  }

  // 2. Validate against salted SHA-256 hash
  if (stored) {
    const computed = await hashPin(cleanPin, stored.salt);
    if (safeConstantTimeEquals(computed, stored.hash)) {
      return true;
    }
  }

  // 3. Fallback: Check local owner employee PIN in cached staff roster
  try {
    const localEmps = getCustomStoredEmployees();
    const isOwnerMatch = localEmps.some(
      (e: Employee) =>
        (isOwnerEmployee(e) || e.system_role === 'owner') &&
        e.pin_code &&
        safeConstantTimeEquals(cleanPin, String(e.pin_code).trim())
    );

    if (isOwnerMatch) {
      // Sync the matching owner PIN to the primary offline hash store
      await setOfflineAdminPin(cleanPin);
      return true;
    }
  } catch {}

  return false;
}
