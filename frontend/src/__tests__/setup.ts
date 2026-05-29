import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 5_000 });

let nativeElementFocus = typeof window.HTMLElement.prototype.focus === 'function'
  ? window.HTMLElement.prototype.focus
  : function focusElement() {};
Object.defineProperty(window.HTMLElement.prototype, 'focus', {
  configurable: true,
  get() {
    return nativeElementFocus;
  },
  set(nextFocus) {
    if (typeof nextFocus === 'function') {
      nativeElementFocus = nextFocus;
    }
  },
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// matchMedia polyfill для antd
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

const getComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  value: (elt: Element) => getComputedStyle(elt),
});
