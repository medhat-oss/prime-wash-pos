/**
 * Nuclear PWA Cache Purge Utility
 * Annihilates legacy Service Worker registrations and stale CacheStorage buckets
 * (such as "car-wash-pos-v3-neon-persistence") to force Android / Chrome to load
 * the updated Prime Wash red branding.
 *
 * FINANCIAL & OFFLINE SAFEGUARD:
 * Strictly operates ONLY on window.caches and navigator.serviceWorker.
 * NEVER alters IndexedDB (PrimeWashDB_v1) or business localStorage keys
 * (cw_offline_order_queue, cw_active_shift, cw_device_id).
 */

const NUKE_STAMP_KEY = 'pw_pwa_nuke_stamp';
const CURRENT_NUKE_VERSION = '2026_red_v3_nuclear';

export async function purgeLegacyPwaCaches(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    const existingStamp = localStorage.getItem(NUKE_STAMP_KEY);
    if (existingStamp === CURRENT_NUKE_VERSION) {
      return false;
    }

    console.info('🚀 [PWA Nuke] Initiating one-time nuclear purge of legacy service workers and caches...');

    // 1. Delete all old CacheStorage buckets
    if ('caches' in window) {
      try {
        const cacheKeys = await window.caches.keys();
        await Promise.all(
          cacheKeys.map(async (key) => {
            console.info(`🧹 [PWA Nuke] Deleting stale cache bucket: ${key}`);
            return window.caches.delete(key);
          })
        );
      } catch (cacheErr) {
        console.warn('⚠️ [PWA Nuke] Cache bucket deletion warning:', cacheErr);
      }
    }

    // 2. Unregister any existing legacy Service Workers
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          console.info('🧹 [PWA Nuke] Unregistering legacy Service Worker registration:', registration.scope);
          await registration.unregister();
        }
      } catch (swErr) {
        console.warn('⚠️ [PWA Nuke] Service Worker unregister warning:', swErr);
      }
    }

    // 3. Mark the purge as completed
    localStorage.setItem(NUKE_STAMP_KEY, CURRENT_NUKE_VERSION);
    console.info('✅ [PWA Nuke] Nuclear purge complete silently in background. Version stamped:', CURRENT_NUKE_VERSION);

    return true;
  } catch (err) {
    console.warn('⚠️ [PWA Nuke] Unexpected error during legacy cache purge:', err);
  }

  return false;
}
