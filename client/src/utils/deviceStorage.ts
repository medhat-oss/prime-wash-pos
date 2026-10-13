/**
 * Persistent Device Identity Manager
 * Provides a unique, immutable client terminal identifier (UUID) for POS session tracking,
 * preventing cross-terminal shift collisions and managing single-active-device locks.
 */

const DEVICE_ID_KEY = 'cw_device_id';

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'server-terminal-node';
  }

  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.trim().length > 0) {
      return existing.trim();
    }

    const newId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    localStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  } catch (err) {
    console.warn('[Device Storage] Failed to access localStorage for device ID:', err);
    return 'fallback-dev-session';
  }
}

export function getDeviceId(): string {
  return getOrCreateDeviceId();
}
