import { useEffect, useRef, useCallback } from 'react';

interface UseAdminIdleTimerOptions {
  timeoutMs?: number; // Default 3 minutes (180,000 ms)
  enabled: boolean; // Only active when admin mode is unlocked
  onTimeout: () => void;
}

export function useAdminIdleTimer({
  timeoutMs = 3 * 60 * 1000, // 3 minutes
  enabled,
  onTimeout,
}: UseAdminIdleTimerOptions) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const onTimeoutRef = useRef(onTimeout);

  // Keep latest callback ref
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (enabled) {
      timerRef.current = setTimeout(() => {
        onTimeoutRef.current();
      }, timeoutMs);
    }
  }, [enabled, timeoutMs]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Start initial timer
    resetTimer();

    // Throttled activity listener (resets timer at most once every 1000ms)
    let lastThrottledCall = 0;
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastThrottledCall > 1000) {
        lastThrottledCall = now;
        resetTimer();
      }
    };

    // User activity events to listen on
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

    events.forEach((eventName) => {
      window.addEventListener(eventName, handleUserActivity, { passive: true });
    });

    // Also check on visibilitychange (e.g. user returns to tab after 3+ minutes)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= timeoutMs) {
          onTimeoutRef.current();
        } else {
          resetTimer();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      events.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, timeoutMs, resetTimer]);
}

export default useAdminIdleTimer;
