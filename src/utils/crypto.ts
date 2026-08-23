import crypto from 'crypto';

/**
 * Constant-time string equality comparison to prevent timing attacks.
 * Handles different lengths and null/empty inputs safely.
 */
export function safeTimingEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) {
    return false;
  }

  const strA = String(a).trim();
  const strB = String(b).trim();

  if (strA.length === 0 || strB.length === 0) {
    return false;
  }

  const bufA = Buffer.from(strA);
  const bufB = Buffer.from(strB);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
