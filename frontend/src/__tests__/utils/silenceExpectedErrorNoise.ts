/**
 * Test-only helper: silence expected console.error / window error noise from
 * intentional ErrorBoundary / isolation throws.
 *
 * NOT for global setup. Always call restore() in finally.
 */
import { vi, type MockInstance } from 'vitest';

export type ExpectedErrorNoiseHandle = {
  restore: () => void;
};

export function silenceExpectedErrorNoise(options?: {
  /** Also swallow cancelable window 'error' events (jsdom Uncaught). */
  windowError?: boolean;
}): ExpectedErrorNoiseHandle {
  const consoleError: MockInstance = vi.spyOn(console, 'error').mockImplementation(() => {});
  let onWindowError: ((event: ErrorEvent) => void) | null = null;

  if (options?.windowError !== false && typeof window !== 'undefined') {
    onWindowError = (event: ErrorEvent) => {
      // Prevent jsdom "Error: Uncaught [...]" for intentional test throws.
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('error', onWindowError);
  }

  return {
    restore() {
      consoleError.mockRestore();
      if (onWindowError) {
        window.removeEventListener('error', onWindowError);
        onWindowError = null;
      }
    },
  };
}
