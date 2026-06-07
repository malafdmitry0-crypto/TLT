import { useEffect, type RefObject } from 'react';

export function useFocusableTableScrollRegions(
  rootRef: RefObject<HTMLElement | null>,
  label: string,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return undefined;

    const root = rootRef.current;
    if (!root) return undefined;

    const applyAccessibilityAttributes = () => {
      root.querySelectorAll<HTMLElement>('.ant-table-body').forEach((tableBody, index) => {
        const nextLabel = index === 0 ? label : `${label} ${index + 1}`;
        // Avoid redundant DOM writes: only touch attributes that actually changed.
        if (tableBody.tabIndex !== 0) tableBody.tabIndex = 0;
        if (tableBody.getAttribute('aria-label') !== nextLabel) {
          tableBody.setAttribute('aria-label', nextLabel);
        }
      });
    };

    // The observer watches the whole workspace subtree (form + table), so it can
    // fire on every keystroke/scroll/animation. Coalesce bursts of mutations into
    // a single DOM scan per animation frame to keep this off the input hot path.
    const supportsRaf = typeof window !== 'undefined'
      && typeof window.requestAnimationFrame === 'function';
    let frameId: number | null = null;

    const scheduleApply = () => {
      if (!supportsRaf) {
        applyAccessibilityAttributes();
        return;
      }
      if (frameId != null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        applyAccessibilityAttributes();
      });
    };

    applyAccessibilityAttributes();

    const observer = new MutationObserver(scheduleApply);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frameId != null && supportsRaf) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [enabled, label, rootRef]);
}
