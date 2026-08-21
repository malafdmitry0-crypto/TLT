import { useEffect, useRef } from 'react';

export function useAutoSave<T>(
  value: T,
  onSave: (value: T) => void | Promise<void>,
  delay = 400
): void {
  const timer = useRef<number | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (timer.current) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => {
      void onSave(value);
    }, delay);
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
    };
  }, [value, onSave, delay]);
}
