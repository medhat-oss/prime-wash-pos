import crypto from 'crypto';
import { toLocalISODate } from './date.js';

/**
 * Generate standard, collision-resistant reference code with prefix and date
 * Example output: CW-20260819-A1B2C3 or PAY-20260819-F4E5D6
 */
export function generateReferenceCode(prefix: string, entropyBytes: number = 3): string {
  const dateStr = toLocalISODate().replace(/-/g, '');
  const randomHex = crypto.randomBytes(entropyBytes).toString('hex').toUpperCase();
  return `${prefix}-${dateStr}-${randomHex}`;
}
