import { registerSW } from 'virtual:pwa-register';

/**
 * Initialize PWA Service Worker with automatic updates and offline App Shell caching
 */
export function setupPwa(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('🔄 [PWA] New version detected, auto-updating service worker...');
        updateSW(true);
      },
      onOfflineReady() {
        console.log('✅ [PWA] Prime Wash POS App Shell is cached and ready for 100% offline reloads.');
      },
      onRegistered(registration) {
        if (registration) {
          console.log('✅ [PWA] Service Worker registered on scope:', registration.scope);
        }
      },
      onRegisterError(error) {
        console.warn('⚠️ [PWA] Service Worker registration failed:', error);
      },
    });
  } catch (err) {
    console.warn('⚠️ [PWA] Failed to initialize PWA register:', err);
  }
}
