import { reportCriticalFailure } from '../hooks/useAppRecovery';

let failureCount429 = 0;
const MAX_429_BEFORE_FATAL = 5;

/**
 * Initializes global network interceptors to detect critical system failures
 */
export function initNetworkInterceptor() {
  if (typeof window === 'undefined' || (window as any).__NETWORK_INTERCEPTOR_INIT__) return;
  (window as any).__NETWORK_INTERCEPTOR_INIT__ = true;

  const originalFetch = window.fetch;

  try {
    // Check if window.fetch can be redefined safely before doing anything
    const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
    if (desc && desc.configurable === false && desc.writable === false) {
      console.debug('[NetworkMonitor] window.fetch is non-configurable/read-only; skipping patch.');
      return;
    }

    const patchedFetch = async (...args: any[]) => {
      try {
        const response = await (originalFetch as any)(...args);
        
        // Monitor for Quota Exceeded (429)
        if (response.status === 429) {
          failureCount429++;
          console.warn(`[NetworkMonitor] detected 429 Quota Exceeded (${failureCount429}/${MAX_429_BEFORE_FATAL})`);
          
          if (failureCount429 >= MAX_429_BEFORE_FATAL) {
            reportCriticalFailure({
              type: 'quota',
              message: 'تم تجاوز حصة الاستخدام المسموح بها مؤقتاً. يرجى الانتظار قليلاً.'
            });
          }
        }
        
        if (response.ok && failureCount429 > 0) {
          failureCount429 = Math.max(0, failureCount429 - 1);
        }

        return response;
      } catch (error: any) {
        throw error;
      }
    };

    // Safely assign patched fetch with setter support so extensions do not throw
    try {
      let currentActiveFetch = patchedFetch;
      Object.defineProperty(window, 'fetch', {
        get: () => currentActiveFetch,
        set: (fn) => {
          if (typeof fn === 'function') {
            currentActiveFetch = fn;
          }
        },
        configurable: true,
        enumerable: true
      });
    } catch {
      // If already locked or fails, ignore
    }
  } catch {
    // Graceful fallback without crashing
  }

  // Intercept WebSocket failures if possible (partially via global error)
  window.addEventListener('error', (event) => {
    const target = event.target as any;
    if (target && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      console.warn('[NetworkMonitor] Resource failed to load:', target.src || target.href);
    }
  }, true);
}
