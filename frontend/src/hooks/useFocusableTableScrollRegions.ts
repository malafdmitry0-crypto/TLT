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
        tableBody.tabIndex = 0;
        tableBody.setAttribute('aria-label', index === 0 ? label : `${label} ${index + 1}`);
      });
    };

    applyAccessibilityAttributes();

    const observer = new MutationObserver(applyAccessibilityAttributes);
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [enabled, label, rootRef]);
}
