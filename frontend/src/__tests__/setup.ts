import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Design tokens must load before feature CSS so var(--…) owners exist in jsdom.
import '@/styles/tokens.css';

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

/**
 * jsdom/nwsapi can throw when matching CSS :has() / composite selectors against
 * react-aria element ids that contain ":" (e.g. input#react-aria-:r0).
 * Treat selector-parse failures as non-matches so Tlt* controls work under jsdom.
 */
function isInvalidSelectorError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : String(error ?? '');
  const name = error instanceof Error ? error.name : '';
  return (
    name === 'SyntaxError'
    || message.includes('is not a valid selector')
    || message.includes('not a valid selector')
  );
}

function patchSelectorApi(proto: {
  matches: (selectors: string) => boolean;
  querySelector: (selectors: string) => Element | null;
  querySelectorAll: (selectors: string) => NodeListOf<Element>;
}) {
  const nativeMatches = proto.matches;
  const nativeQS = proto.querySelector;
  const nativeQSA = proto.querySelectorAll;

  proto.matches = function matches(this: Element, selectors: string) {
    try {
      return nativeMatches.call(this, selectors);
    } catch (error) {
      if (isInvalidSelectorError(error)) return false;
      throw error;
    }
  };

  proto.querySelector = function querySelector(this: Element, selectors: string) {
    try {
      return nativeQS.call(this, selectors);
    } catch (error) {
      if (isInvalidSelectorError(error)) return null;
      throw error;
    }
  };

  proto.querySelectorAll = function querySelectorAll(this: Element, selectors: string) {
    try {
      return nativeQSA.call(this, selectors);
    } catch (error) {
      if (isInvalidSelectorError(error)) {
        return document.createDocumentFragment().childNodes as unknown as NodeListOf<Element>;
      }
      throw error;
    }
  };
}

patchSelectorApi(Element.prototype);
patchSelectorApi(Document.prototype as unknown as Element);
patchSelectorApi(DocumentFragment.prototype as unknown as Element);
