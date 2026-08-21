/**
 * Dismiss an overlay when pointer-down lands outside a container, or Escape.
 */
import { useEffect, type RefObject } from 'react';

export function useOutsidePointerDismiss(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!active) return undefined;

    function handlePointerDown(event: PointerEvent) {
      const container = containerRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) return;
      onDismiss();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss();
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, containerRef, onDismiss]);
}
