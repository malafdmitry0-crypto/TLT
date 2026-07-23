/**
 * jsdom does not fully resolve `background: var(--token)` for getComputedStyle.
 * Read the cascade from document stylesheets and resolve custom properties from
 * :root (tokens.css), so unit tests can assert real color contracts without
 * reintroducing raw hex outside tokens.css.
 */

function expandHex(hex: string): string {
  const h = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h)) {
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return h;
}

export function hexToCssRgb(hex: string): string {
  const full = expandHex(hex).slice(1);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function resolveTokenValue(tokenName: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
  if (!raw) return '';
  if (raw.startsWith('#')) return hexToCssRgb(raw);
  if (raw.startsWith('rgb')) return raw;
  return raw;
}

function resolveCssValue(value: string): string {
  const trimmed = value.trim();
  const varMatch = trimmed.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)\s*$/i);
  if (varMatch) {
    const fromToken = resolveTokenValue(varMatch[1]!);
    if (fromToken) return fromToken;
    if (varMatch[2]) return resolveCssValue(varMatch[2]);
    return '';
  }
  if (trimmed.startsWith('#')) return hexToCssRgb(trimmed);
  return trimmed;
}

function elementMatchesSelector(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

/**
 * Last matching rule for background/background-color wins (document order).
 */
export function resolvedBackgroundColor(el: Element): string {
  const native = getComputedStyle(el).backgroundColor;
  if (native && native !== 'rgba(0, 0, 0, 0)' && native !== 'transparent') {
    return native;
  }

  let found = '';
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      if (!elementMatchesSelector(el, rule.selectorText)) continue;
      const bg =
        rule.style.getPropertyValue('background-color') ||
        rule.style.getPropertyValue('background');
      if (!bg) continue;
      // skip gradients / images
      if (bg.includes('gradient') || bg.includes('url(')) continue;
      const resolved = resolveCssValue(bg.split(/\s+/)[0] ?? bg);
      if (resolved) found = resolved;
    }
  }
  return found || native || 'rgba(0, 0, 0, 0)';
}
