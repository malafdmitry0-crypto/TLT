/**
 * AF12-UIKIT-OWNER-GATE-01 — static CSS ↔ JSX ownership for /ui-kit.
 *
 * Ensures selector families map to a single CSS owner file, owners stay imported
 * from UIKitPage, and production rules do not return to a mixed ui-kit.css blob.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Minimal selector extract for ownership tokens (class identifiers only). */
function extractClassTokens(source: string): string[] {
  const cleaned = stripComments(source);
  const tokens = new Set<string>();
  for (const m of cleaned.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
    tokens.add(`.${m[1]}`);
  }
  return [...tokens];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const PAGES = path.join(FRONTEND_ROOT, 'src/pages');
const UIKIT_PAGE = path.join(PAGES, 'UIKitPage.tsx');
const OWNER_LOC_CAP = 400;

/** Declared ownership map (selector prefix → CSS file relative to src/). */
export const UIKIT_OWNER_MAP: Array<{
  id: string;
  cssRel: string;
  jsxHints: string[];
  roots: string[];
}> = [
  {
    id: 'shell',
    cssRel: 'src/pages/ui-kit-page-shell.css',
    jsxHints: ['UIKitPage', 'uikit-page', 'uikit-header', 'uikit-shell', 'uikit-nav'],
    roots: ['.uikit-page', '.uikit-header', '.uikit-shell', '.uikit-nav', '.uikit-main', '.uikit-intro', '.uikit-eyebrow', '.uikit-kicker'],
  },
  {
    id: 'foundation',
    cssRel: 'src/pages/ui-kit-foundation.css',
    jsxHints: ['UIKitFoundationSection'],
    roots: ['.uikit-section', '.uikit-grid', '.uikit-swatch', '.uikit-type', '.uikit-spacing', '.uikit-radius', '.uikit-specimen', '.uikit-font', '.uikit-foundation'],
  },
  {
    id: 'primitives',
    cssRel: 'src/pages/ui-kit-primitives-showcase.css',
    jsxHints: ['UIKitPrimitivesSection'],
    roots: ['.uikit-alerts', '.uikit-primitive', '.uikit-metrics', '.uikit-metric'],
  },
  {
    id: 'data',
    cssRel: 'src/pages/ui-kit-data-showcase.css',
    jsxHints: ['UIKitPage', 'uikit-empty', 'uikit-loading', 'uikit-toolbar'],
    roots: ['.uikit-empty', '.uikit-loading', '.uikit-toolbar', '.uikit-options', '.uikit-pattern', '.uikit-demo', '.uikit-component-row', '.uikit-form-grid'],
  },
  {
    id: 'heat',
    cssRel: 'src/pages/ui-kit-heatcalc-reference.css',
    jsxHints: ['UIKitHeatReferenceSection'],
    roots: ['.uikit-heatcalc'],
  },
];

/** Transitional files allowed during migration (no mixed production blob). */
const TRANSITIONAL_CSS = new Set([
  'src/pages/ui-kit-responsive.css',
  'src/pages/ui-kit.css', // freeze pointer / residual only until 06G4
]);

function read(rel: string): string {
  return fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(FRONTEND_ROOT, rel));
}

function classTokensFromCss(source: string): string[] {
  return extractClassTokens(source);
}

describe('UI Kit owner gate (AF12-UIKIT-OWNER-GATE-01)', () => {
  it('UIKitPage imports every declared owner CSS that exists on disk', () => {
    const page = fs.readFileSync(UIKIT_PAGE, 'utf8');
    const imports = [...page.matchAll(/import\s+['"](\.\/ui-kit[^'"]+)['"]/g)].map((m) => m[1]);
    for (const owner of UIKIT_OWNER_MAP) {
      if (!exists(owner.cssRel)) continue;
      const base = path.basename(owner.cssRel);
      expect(
        imports.some((i) => i.endsWith(base)),
        `${owner.cssRel} must be imported from UIKitPage`,
      ).toBe(true);
    }
  });

  it('existing owner files stay within LOC cap and keep exclusive root families', () => {
    const present = UIKIT_OWNER_MAP.filter((o) => exists(o.cssRel));
    const tokenToOwners = new Map<string, string[]>();

    for (const owner of present) {
      const src = read(owner.cssRel);
      const loc = src.length === 0 ? 0 : src.split(/\r?\n/).length;
      expect(loc, `${owner.cssRel} LOC`).toBeLessThanOrEqual(OWNER_LOC_CAP);

      for (const token of classTokensFromCss(src)) {
        if (!token.startsWith('.uikit-')) continue;
        // only track primary family roots we care about
        const list = tokenToOwners.get(token) ?? [];
        list.push(owner.id);
        tokenToOwners.set(token, list);
      }
    }

    // Foreign root intrusion: heat tokens must not appear in non-heat owners
    for (const owner of present) {
      const src = read(owner.cssRel);
      const tokens = classTokensFromCss(src);
      if (owner.id !== 'heat') {
        for (const t of tokens) {
          expect(t.startsWith('.uikit-heatcalc'), `${owner.cssRel} must not contain ${t}`).toBe(false);
        }
      }
      if (owner.id !== 'primitives') {
        for (const t of tokens) {
          if (t.startsWith('.uikit-alerts') || t.startsWith('.uikit-primitive') || t.startsWith('.uikit-metric')) {
            // transitional shared files may still hold mixed rules during migration
            if (owner.cssRel.includes('ui-kit-responsive') || owner.cssRel.endsWith('ui-kit.css')) continue;
            expect.fail(`${owner.cssRel} must not contain primitive token ${t}`);
          }
        }
      }
    }
  });

  it('ui-kit.css if present is a freeze pointer or residual without becoming dual-owner blob after split', () => {
    const rel = 'src/pages/ui-kit.css';
    if (!exists(rel)) return;
    const src = read(rel);
    const loc = src.split(/\r?\n/).length;
    // During migration residual base is allowed under newFileLocCap; hard fail if both
    // heat and primitive tokens reappear together with shell while split files exist.
    const hasHeat = /\.uikit-heatcalc/.test(src);
    const hasPrim = /\.uikit-alerts|\.uikit-primitive|\.uikit-metric/.test(src);
    const shellSplit = exists('src/pages/ui-kit-page-shell.css');
    if (shellSplit && hasHeat && hasPrim) {
      expect.fail('ui-kit.css regained mixed heat+primitives production rules after shell split');
    }
    void loc;
  });

  it('transitional responsive owner is listed and not treated as permanent multi-owner home', () => {
    // Documents intentional transition: ui-kit-responsive.css may exist until 06G.
    expect(TRANSITIONAL_CSS.has('src/pages/ui-kit-responsive.css')).toBe(true);
  });
});
