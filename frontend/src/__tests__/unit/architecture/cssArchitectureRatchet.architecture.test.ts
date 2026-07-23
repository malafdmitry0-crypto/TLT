/**
 * G4: CSS architecture ratchet.
 *
 * - styles.css stays a freeze-stub (LOC ≤ stylesCssMaxLoc, no selectors).
 * - Per-file / total CSS LOC, bare `.ant-*` roots, and `@media` counts do not grow.
 * - New CSS files: LOC ≤ newFileLocCap; no bare `.ant-*` without baseline entry.
 * - Feature CSS owners must not contain foreign feature root class markers.
 * - Every CSS file under src/ is imported by an owner TS/TSX or listed global entry.
 * - !important is NOT re-counted here — see cssImportantRatchet (IMP0) + same baseline.
 *
 * Decrease always allowed without editing baseline.
 * Errors: CODE, FILE, SELECTOR/METRIC, FIX
 * See: docs/frontend/agent-hardening-plan.md §G4
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../..');
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const BASELINE_PATH = path.join(HERE, 'cssArchitectureBaseline.json');

/** Explicit global CSS entries (loaded from main or intentional global). */
const GLOBAL_CSS_ENTRIES = new Set([
  'src/styles.css',
  'src/styles/app-base.css',
  'src/styles/calc-spreadsheet.css',
  'src/styles/actionbar-srs.css',
  'src/styles/app-header.css',
  'src/styles/table-chrome.css',
  'src/styles/form-grid-srs.css',
  'src/styles/print.css',
  'src/styles/tlt-form-controls.css',
]);

/**
 * Feature owner roots: CSS under these paths must not use foreign feature markers.
 * Marker = class token that belongs to another feature.
 */
const FEATURE_OWNERS: Array<{
  pathPrefix: string;
  ownMarkers: string[];
  foreignMarkers: string[];
}> = [
  {
    pathPrefix: 'src/pages/heatcalc/',
    ownMarkers: ['heatcalc', 'inline-object-form', 'form-grid-srs--heat', 'heat-'],
    foreignMarkers: [
      'elec-workspace',
      'electrical-',
      'specification-page',
      'spec-page',
    ],
  },
  {
    pathPrefix: 'src/pages/electrical/',
    ownMarkers: ['elec-', 'electrical-'],
    foreignMarkers: [
      'heatcalc-workspace',
      'inline-object-form',
      'form-grid-srs--heat',
      'specification-page',
    ],
  },
  {
    pathPrefix: 'src/pages/specification/',
    ownMarkers: ['specification-', 'spec-'],
    foreignMarkers: [
      'heatcalc-workspace',
      'elec-workspace',
      'inline-object-form',
      'form-grid-srs--heat',
    ],
  },
];

type FileMetrics = {
  loc: number;
  bareAnt: number;
  media: number;
};

type Baseline = {
  version: number;
  stylesCssMaxLoc: number;
  newFileLocCap: number;
  files: Record<string, FileMetrics>;
  totals: FileMetrics;
};

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

function failMessage(
  code: string,
  message: string,
  fix: string,
  file?: string,
  metric?: string,
): string {
  const parts = [`[CssArchitectureRatchetError:${code}] ${message}`];
  if (file) parts.push(`FILE: ${file}`);
  if (metric) parts.push(`METRIC: ${metric}`);
  parts.push(`FIX: ${fix}`);
  return parts.join('\n');
}

function walkCssFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkCssFiles(full));
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

function walkTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function relSrcKey(abs: string): string {
  return `src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function countLoc(source: string): number {
  return source.length === 0 ? 0 : source.split(/\r?\n/).length;
}

/** Extract top-level + nested @media/@supports selector lists. */
export function extractSelectors(css: string): string[] {
  const text = stripComments(css);
  const rules: string[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    while (i < n && /\s/.test(text[i]!)) i += 1;
    if (i >= n) break;

    if (text.startsWith('@', i)) {
      const brace = text.indexOf('{', i);
      if (brace < 0) break;
      let depth = 0;
      let j = brace;
      for (; j < n; j += 1) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
      }
      const at = text.slice(i, brace).trim();
      const body = text.slice(brace + 1, j - 1);
      if (/^@media\b/.test(at) || /^@supports\b/.test(at)) {
        rules.push(...extractSelectors(body));
      }
      i = j;
      continue;
    }

    const brace = text.indexOf('{', i);
    if (brace < 0) break;
    const sel = text.slice(i, brace).trim();
    let depth = 0;
    let j = brace;
    for (; j < n; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    if (sel) rules.push(sel);
    i = j;
  }
  return rules;
}

/** Selector compound that starts with `.ant-` (no project owner prefix). */
export function countBareAntSelectors(selectors: string[]): number {
  let n = 0;
  for (const sel of selectors) {
    for (const part of sel.split(',')) {
      const segs = part
        .trim()
        .split(/[\s>+~]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (segs[0] && /^\.ant-/.test(segs[0])) n += 1;
    }
  }
  return n;
}

export function measureCssFile(source: string): FileMetrics {
  const cleaned = stripComments(source);
  return {
    loc: countLoc(source),
    bareAnt: countBareAntSelectors(extractSelectors(source)),
    media: (cleaned.match(/@media\b/g) ?? []).length,
  };
}

function loadBaseline(): Baseline {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      failMessage(
        'BASELINE_MISSING',
        `Baseline missing: ${path.relative(FRONTEND_ROOT, BASELINE_PATH)}`,
        'Restore cssArchitectureBaseline.json from git or regenerate on clean green HEAD.',
      ),
    );
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
}

function collectCurrent(): Record<string, FileMetrics> {
  const out: Record<string, FileMetrics> = {};
  for (const abs of walkCssFiles(SRC_ROOT)) {
    out[relSrcKey(abs)] = measureCssFile(fs.readFileSync(abs, 'utf8'));
  }
  return out;
}

function sumMetrics(files: Record<string, FileMetrics>): FileMetrics {
  const t: FileMetrics = { loc: 0, bareAnt: 0, media: 0 };
  for (const m of Object.values(files)) {
    t.loc += m.loc;
    t.bareAnt += m.bareAnt;
    t.media += m.media;
  }
  return t;
}

/** Resolve whether a CSS path is imported from production TS/TSX. */
function collectCssImporters(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const re = /import\s+['"]([^'"]+\.css)['"]/g;
  for (const abs of walkTsFiles(SRC_ROOT)) {
    const text = fs.readFileSync(abs, 'utf8');
    let m: RegExpExecArray | null;
    // reset lastIndex
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const spec = m[1]!;
      if (spec.startsWith('@glideapps/') || !spec.endsWith('.css')) continue;
      let resolved: string | null = null;
      if (spec.startsWith('@/')) {
        resolved = path.join(SRC_ROOT, spec.slice(2));
      } else if (spec.startsWith('.')) {
        resolved = path.resolve(path.dirname(abs), spec);
      }
      if (!resolved || !fs.existsSync(resolved)) continue;
      const key = relSrcKey(resolved);
      const list = map.get(key) ?? [];
      list.push(relSrcKey(abs));
      map.set(key, list);
    }
  }
  return map;
}

describe('CSS architecture ratchet (G4)', () => {
  it('freezes styles.css and does not grow LOC / bare ant / media', () => {
    const baseline = loadBaseline();
    const current = collectCurrent();
    const violations: string[] = [];

    // styles.css freeze-stub
    const stylesKey = 'src/styles.css';
    const styles = current[stylesKey];
    if (!styles) {
      violations.push(
        failMessage(
          'STYLES_CSS_MISSING',
          'styles.css missing',
          'Restore src/styles.css freeze-stub (comment-only, no feature rules).',
          stylesKey,
        ),
      );
    } else {
      if (styles.loc > baseline.stylesCssMaxLoc) {
        violations.push(
          failMessage(
            'STYLES_CSS_GREW',
            `styles.css LOC grew beyond freeze cap`,
            'Do not add rules to styles.css. Move feature CSS to owner files under styles/, pages/*, or components/*.',
            stylesKey,
            `CURRENT=${styles.loc} LIMIT=${baseline.stylesCssMaxLoc}`,
          ),
        );
      }
      const stylesText = fs.readFileSync(path.join(SRC_ROOT, 'styles.css'), 'utf8');
      const sels = extractSelectors(stylesText);
      if (sels.length > 0) {
        violations.push(
          failMessage(
            'STYLES_CSS_HAS_SELECTORS',
            `styles.css contains ${sels.length} selector(s) — must stay freeze-stub`,
            'Delete rules from styles.css; place them under the feature/owner CSS file.',
            stylesKey,
            sels[0],
          ),
        );
      }
    }

    for (const [file, limits] of Object.entries(baseline.files)) {
      const cur = current[file];
      if (!cur) continue; // deleted OK
      for (const key of ['loc', 'bareAnt', 'media'] as const) {
        if (cur[key] > limits[key]) {
          violations.push(
            failMessage(
              `CSS_${key.toUpperCase()}_GREW`,
              `CSS metric grew: ${key}`,
              key === 'bareAnt'
                ? 'Prefix .ant-* with an owner root (e.g. .heat-form .ant-btn). Do not raise baseline.'
                : key === 'media'
                  ? 'Do not add breakpoints without removing others. Prefer shared tokens. Do not raise baseline.'
                  : 'Split or delete CSS; keep owner file from growing. Do not raise baseline.',
              file,
              `CURRENT=${cur[key]} LIMIT=${limits[key]}`,
            ),
          );
        }
      }
    }

    for (const [file, metrics] of Object.entries(current)) {
      if (file in baseline.files) continue;
      if (metrics.loc > baseline.newFileLocCap) {
        violations.push(
          failMessage(
            'NEW_CSS_OVER_LOC_CAP',
            `New CSS file exceeds LOC cap`,
            `Keep new CSS ≤ ${baseline.newFileLocCap} LOC or split by owner/use-case.`,
            file,
            `CURRENT=${metrics.loc} LIMIT=${baseline.newFileLocCap}`,
          ),
        );
      }
      if (metrics.bareAnt > 0) {
        violations.push(
          failMessage(
            'NEW_CSS_BARE_ANT',
            `New CSS introduces bare .ant-* selectors`,
            'Scope every .ant-* under a project owner root class. Do not add bare Ant selectors.',
            file,
            `bareAnt=${metrics.bareAnt}`,
          ),
        );
      }
    }

    const curTotals = sumMetrics(current);
    for (const key of ['loc', 'bareAnt', 'media'] as const) {
      if (curTotals[key] > baseline.totals[key]) {
        violations.push(
          failMessage(
            `CSS_TOTAL_${key.toUpperCase()}_GREW`,
            `Total CSS ${key} grew`,
            'Reduce elsewhere before adding. Do not raise totals in baseline without evidence.',
            undefined,
            `CURRENT=${curTotals[key]} LIMIT=${baseline.totals[key]}`,
          ),
        );
      }
    }

    // Foreign feature markers in owner CSS
    for (const [file, source] of Object.entries(current)) {
      void source;
      const owner = FEATURE_OWNERS.find((o) => file.startsWith(o.pathPrefix));
      if (!owner) continue;
      const text = fs.readFileSync(path.join(FRONTEND_ROOT, file), 'utf8');
      const cleaned = stripComments(text);
      for (const marker of owner.foreignMarkers) {
        // class-like token: .marker or marker as class fragment
        const re = new RegExp(`\\.${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
        if (re.test(cleaned)) {
          violations.push(
            failMessage(
              'FOREIGN_FEATURE_SELECTOR',
              `CSS owner contains foreign feature marker ".${marker}"`,
              'Move foreign selectors to their feature owner CSS. One owner = one feature.',
              file,
              `.${marker}`,
            ),
          );
        }
      }
    }

    // Import ownership
    const importers = collectCssImporters();
    for (const file of Object.keys(current)) {
      if (GLOBAL_CSS_ENTRIES.has(file)) continue;
      if (importers.has(file)) continue;
      violations.push(
        failMessage(
          'CSS_ORPHAN',
          'CSS file is not imported by any production TS/TSX and is not a global entry',
          'Import from the owner component/page, add to GLOBAL_CSS_ENTRIES if truly global (main.tsx), or delete dead CSS.',
          file,
        ),
      );
    }

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }

    expect(baseline.version).toBe(1);
    expect(baseline.stylesCssMaxLoc).toBeLessThanOrEqual(20);
  });

  it('reuses IMP0 for !important (no second counter)', () => {
    // G4 must not maintain a parallel !important total — IMP0 owns that.
    const baseline = loadBaseline();
    expect('important' in (baseline.totals as object)).toBe(false);
    expect(fs.existsSync(path.join(HERE, 'cssImportantBaseline.json'))).toBe(true);
  });

  it('measures bare .ant- and media via shared helpers', () => {
    const sample = `
/* comment .ant-btn */
.owner .ant-btn { color: red; }
.ant-modal { display: none; }
@media (max-width: 600px) {
  .owner .ant-input { width: 100%; }
}
`;
    const m = measureCssFile(sample);
    expect(m.bareAnt).toBe(1); // only .ant-modal
    expect(m.media).toBe(1);
    expect(m.loc).toBeGreaterThan(5);
  });
});
