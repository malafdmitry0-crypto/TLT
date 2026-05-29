type HTMLElementWindow = Window & {
  HTMLElement?: typeof HTMLElement;
};

function ensureWritableHTMLElementFocus(targetWindow: HTMLElementWindow | undefined) {
  const prototype = targetWindow?.HTMLElement?.prototype;
  if (!prototype) return;
  let focus = typeof prototype.focus === 'function'
    ? prototype.focus
    : function focusElement() {};
  try {
    Object.defineProperty(prototype, 'focus', {
      configurable: true,
      get() {
        return focus;
      },
      set(nextFocus) {
        if (typeof nextFocus === 'function') {
          focus = nextFocus;
        }
      },
    });
  } catch {
    // React Aria can still operate in real browsers; this only protects jsdom-like test environments.
  }
}

if (typeof window !== 'undefined') {
  ensureWritableHTMLElementFocus(window);
}

export {};
