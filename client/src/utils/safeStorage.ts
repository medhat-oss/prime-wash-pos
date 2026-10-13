/**
 * Safe Storage Utility for Incognito / Private Browsing Resilience
 * Automatically falls back to in-memory maps if localStorage or sessionStorage
 * throws SecurityError, DOMException, or QuotaExceededError in restricted environments.
 */

class SafeStorageWrapper {
  private memoryStore = new Map<string, string>();
  private type: 'localStorage' | 'sessionStorage';

  constructor(type: 'localStorage' | 'sessionStorage') {
    this.type = type;
  }

  private getNativeStorage(): Storage | null {
    try {
      if (typeof window === 'undefined') return null;
      const storage = window[this.type];
      if (!storage) return null;
      const testKey = '__cw_test_storage__';
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      return storage;
    } catch {
      return null;
    }
  }

  public getItem(key: string): string | null {
    try {
      const storage = this.getNativeStorage();
      if (storage) {
        return storage.getItem(key);
      }
    } catch {}
    return this.memoryStore.get(key) ?? null;
  }

  public setItem(key: string, value: any): void {
    const stringVal = String(value);
    try {
      const storage = this.getNativeStorage();
      if (storage) {
        storage.setItem(key, stringVal);
        return;
      }
    } catch {}
    this.memoryStore.set(key, stringVal);
  }

  public removeItem(key: string): void {
    try {
      const storage = this.getNativeStorage();
      if (storage) {
        storage.removeItem(key);
      }
    } catch {}
    this.memoryStore.delete(key);
  }

  public clear(): void {
    try {
      const storage = this.getNativeStorage();
      if (storage) {
        storage.clear();
      }
    } catch {}
    this.memoryStore.clear();
  }
}

export const safeLocalStorage = new SafeStorageWrapper('localStorage');
export const safeSessionStorage = new SafeStorageWrapper('sessionStorage');
export default safeLocalStorage;
