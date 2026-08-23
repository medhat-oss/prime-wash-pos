/**
 * Prime Wash POS - Debouncing and Throttling Utilities
 * Prevents cascading multi-render thrashing across POS and Admin dashboards.
 */

import { useEffect, useRef, useCallback } from 'react';

export interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

/**
 * Generic debounce utility function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number = 150
): DebouncedFunction<T> {
  let timeoutId: any = null;

  const debounced: any = (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, waitMs);
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced as DebouncedFunction<T>;
}

export interface ThrottledFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
}

/**
 * Generic throttle utility function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limitMs: number = 200
): ThrottledFunction<T> {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) {
          func(...lastArgs);
          lastArgs = null;
        }
      }, limitMs);
    } else {
      lastArgs = args;
    }
  };
}

/**
 * React Hook for debounced callback function
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delayMs: number = 150
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const timeoutRef = useRef<any>(null);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        timeoutRef.current = null;
      }, delayMs);
    },
    [delayMs]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedFn;
}

/**
 * React Hook for listening to window events with automatic debouncing and cleanup
 */
export function useDebouncedEventListener(
  eventNames: string | string[],
  handler: (event: Event) => void,
  delayMs: number = 150
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: any = null;
    const listener = (event: Event) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handlerRef.current(event);
        timeoutId = null;
      }, delayMs);
    };

    const names = Array.isArray(eventNames) ? eventNames : [eventNames];
    names.forEach((name) => window.addEventListener(name, listener));

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      names.forEach((name) => window.removeEventListener(name, listener));
    };
  }, [Array.isArray(eventNames) ? eventNames.join(',') : eventNames, delayMs]);
}
