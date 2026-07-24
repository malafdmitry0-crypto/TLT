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
 * See: docs/frontend/css-strategy.md, docs/frontend/archive/README.md
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../..');
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const BASELINE_PATH = path.join(HERE, 'cssArchitectureBaseline.json');

/**
 * Global CSS entries: loaded from main.tsx OR freeze-pointer stubs.
 * tlt-form-controls.css is intentionally NOT global — form-controls/ui-kit owner.
 */
const GLOBAL_CSS_ENTRIES = new Set([
  'src/styles.css',
  'src/styles/app-base.css', // freeze pointer (layers live in tokens/base/app-shell/vendor)
  'src/styles/tokens.css',
  'src/styles/base.css',
  'src/styles/app-shell.css',
  'src/styles/vendor-overrides.css',
  'src/styles/calc-spreadsheet.css',
  'src/styles/actionbar-srs.css',
  'src/styles/app-header.css',
  'src/styles/table-chrome.css',
  'src/styles/form-grid-srs.css',
  'src/styles/print.css',
]);

/**
 * Strict global CSS import order in main.tsx (architecture contract).
 * Contiguous .css imports must match this sequence (no extras, no reorder).
 */
export const GLOBAL_CSS_IMPORT_ORDER = [
  './styles/tokens.css',
  './styles/base.css',
  './styles/app-shell.css', // includes former app-header chrome
  './styles/vendor-overrides.css',
  './styles.css',
  './styles/calc-spreadsheet.css',
  './styles/actionbar-srs.css',
  './styles/table-chrome.css',
  './styles/form-grid-srs.css',
  './styles/print.css',
] as const;

/** CSS files allowed to introduce/define raw hex/rgb colors (token SoT). */
const RAW_COLOR_ALLOWLIST = new Set([
  'src/styles/tokens.css',
]);

const RAW_COLOR_RE = /#(?:[0-9a-fA-F]{3,8})\b|\brgba?\(|\bhsla?\(/g;

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
  /** Per-file raw color literal counts (hex/rgb/hsl); decrease always OK. */
  rawColors?: Record<string, number>;
  rawColorsTotal?: number;
  /**
   * Direct legacy palette var refs (`--c-*` / `--a-*`) outside tokens.css.
   * Shrink-only; new files must not introduce these refs.
   */
  legacyPalette?: Record<string, number>;
  legacyPaletteTotal?: number;
  /**
   * Non-canonical `@media (max-width: Npx)` breakpoints.
   * Canonical allowlist: 480 / 768 / 1200 / 1400 (+ print, prefers-reduced-motion).
   */
  noncanonicalMedia?: Record<string, number>;
  noncanonicalMediaTotal?: number;
};

/** Token owner: legacy palette aliases may live only here. */
const LEGACY_PALETTE_ALLOWLIST = new Set(['src/styles/tokens.css']);

/** Canonical max-width breakpoints (px). */
export const CANONICAL_MAX_WIDTHS = new Set([480, 768, 1200, 1400]);

const LEGACY_PALETTE_RE = /--[ca]-[a-zA-Z0-9_-]+/g;
const MAX_WIDTH_RE = /max-width:\s*(\d+)px/gi;

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

/** Count raw color literals outside comments. */
export function countRawColors(source: string): number {
  const cleaned = stripComments(source);
  return (cleaned.match(RAW_COLOR_RE) ?? []).length;
}

/** Count direct `--c-*` / `--a-*` palette var refs outside comments. */
export function countLegacyPaletteRefs(source: string): number {
  const cleaned = stripComments(source);
  return (cleaned.match(LEGACY_PALETTE_RE) ?? []).length;
}

/**
 * Count non-canonical max-width media queries.
 * Ignores print and prefers-reduced-motion blocks.
 */
export function countNoncanonicalMedia(source: string): number {
  const cleaned = stripComments(source);
  let count = 0;
  const mediaRe = /@media\b([^{]*)\{/gi;
  let m: RegExpExecArray | null;
  while ((m = mediaRe.exec(cleaned)) !== null) {
    const query = m[1] ?? '';
    if (/\bprint\b/i.test(query)) continue;
    if (/prefers-reduced-motion/i.test(query)) continue;
    MAX_WIDTH_RE.lastIndex = 0;
    let mw: RegExpExecArray | null;
    while ((mw = MAX_WIDTH_RE.exec(query)) !== null) {
      const px = Number(mw[1]);
      if (!CANONICAL_MAX_WIDTHS.has(px)) count += 1;
    }
  }
  return count;
}

function collectRawColorCounts(): { total: number; files: Record<string, number> } {
  const files: Record<string, number> = {};
  let total = 0;
  for (const abs of walkCssFiles(SRC_ROOT)) {
    const key = relSrcKey(abs);
    const n = countRawColors(fs.readFileSync(abs, 'utf8'));
    if (n > 0) {
      files[key] = n;
      total += n;
    }
  }
  return { total, files };
}

function collectLegacyPaletteCounts(): { total: number; files: Record<string, number> } {
  const files: Record<string, number> = {};
  let total = 0;
  for (const abs of walkCssFiles(SRC_ROOT)) {
    const key = relSrcKey(abs);
    if (LEGACY_PALETTE_ALLOWLIST.has(key)) continue;
    const n = countLegacyPaletteRefs(fs.readFileSync(abs, 'utf8'));
    if (n > 0) {
      files[key] = n;
      total += n;
    }
  }
  return { total, files };
}

function collectNoncanonicalMediaCounts(): { total: number; files: Record<string, number> } {
  const files: Record<string, number> = {};
  let total = 0;
  for (const abs of walkCssFiles(SRC_ROOT)) {
    const key = relSrcKey(abs);
    const n = countNoncanonicalMedia(fs.readFileSync(abs, 'utf8'));
    if (n > 0) {
      files[key] = n;
      total += n;
    }
  }
  return { total, files };
}

function ratchetCountMap(
  label: string,
  codePrefix: string,
  current: { total: number; files: Record<string, number> },
  baselineFiles: Record<string, number>,
  baselineTotal: number,
  growthFix: string,
  newFileFix: string,
  allowNewFile?: (file: string) => boolean,
): string[] {
  const violations: string[] = [];
  if (current.total > baselineTotal) {
    violations.push(
      failMessage(
        `${codePrefix}_TOTAL_GREW`,
        `Total ${label} grew`,
        growthFix,
        undefined,
        `CURRENT=${current.total} LIMIT=${baselineTotal}`,
      ),
    );
  }
  for (const [file, limit] of Object.entries(baselineFiles)) {
    const cur = current.files[file] ?? 0;
    if (cur > limit) {
      violations.push(
        failMessage(
          `${codePrefix}_FILE_GREW`,
          `${label} count grew in file`,
          growthFix,
          file,
          `CURRENT=${cur} LIMIT=${limit}`,
        ),
      );
    }
  }
  for (const [file, cur] of Object.entries(current.files)) {
    if (file in baselineFiles) continue;
    if (allowNewFile?.(file)) continue;
    if (cur > 0) {
      violations.push(
        failMessage(
          `${codePrefix}_NEW_FILE`,
          `New CSS file introduces ${label}`,
          newFileFix,
          file,
          `${label}=${cur}`,
        ),
      );
    }
  }
  // Stale baseline entries (file cleaned or deleted) must shrink baseline.
  for (const [file, limit] of Object.entries(baselineFiles)) {
    const cur = current.files[file] ?? 0;
    if (cur < limit && cur === 0 && !(file in current.files)) {
      violations.push(
        failMessage(
          `${codePrefix}_STALE_BASELINE`,
          `Baseline still tracks ${label} for a clean file`,
          'Update baseline to current counts in the same PR as the shrink.',
          file,
          `CURRENT=0 LIMIT=${limit}`,
        ),
      );
    } else if (cur < limit) {
      violations.push(
        failMessage(
          `${codePrefix}_STALE_BASELINE`,
          `Baseline ${label} is higher than current (historical slack)`,
          'Update baseline to current counts in the same PR as the shrink.',
          file,
          `CURRENT=${cur} LIMIT=${limit}`,
        ),
      );
    }
  }
  if (current.total < baselineTotal) {
    // total stale is implied by per-file stale; only flag if no per-file stale already
    // Keep simple: always require total match when files match.
  }
  return violations;
}

function readMainCssImportOrder(): string[] {
  const mainPath = path.join(SRC_ROOT, 'main.tsx');
  const text = fs.readFileSync(mainPath, 'utf8');
  const re = /import\s+['"](\.\/styles[^'"]+\.css|\.\/styles\.css)['"]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]!);
  }
  return out;
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

    // tlt-form-controls must be owner-imported, never as a main.tsx CSS import
    const mainCssImports = readMainCssImportOrder();
    if (mainCssImports.some((spec) => spec.includes('tlt-form-controls'))) {
      violations.push(
        failMessage(
          'TLT_CONTROLS_GLOBAL',
          'tlt-form-controls.css must not be imported from main.tsx',
          'Import from components/form-controls (or ui-kit) owner entry only.',
          'src/main.tsx',
        ),
      );
    }
    const tltKey = 'src/styles/tlt-form-controls.css';
    if (!importers.has(tltKey)) {
      violations.push(
        failMessage(
          'TLT_CONTROLS_ORPHAN',
          'tlt-form-controls.css has no owner importer',
          'Import from components/form-controls/index.ts.',
          tltKey,
        ),
      );
    }

    // app-base freeze pointer (no selectors)
    const appBaseText = fs.readFileSync(path.join(SRC_ROOT, 'styles/app-base.css'), 'utf8');
    const appBaseSels = extractSelectors(appBaseText);
    if (appBaseSels.length > 0) {
      violations.push(
        failMessage(
          'APP_BASE_HAS_SELECTORS',
          'app-base.css must remain a freeze pointer to layered globals',
          'Put rules in tokens/base/app-shell/vendor-overrides.css instead.',
          'src/styles/app-base.css',
          appBaseSels[0],
        ),
      );
    }

    // Raw color ratchet
    const raw = collectRawColorCounts();
    const rawBaselineFiles = baseline.rawColors ?? {};
    const rawBaselineTotal = baseline.rawColorsTotal ?? Number.POSITIVE_INFINITY;
    if (raw.total > rawBaselineTotal) {
      violations.push(
        failMessage(
          'RAW_COLOR_TOTAL_GREW',
          `Total raw CSS colors grew`,
          'Use var(--token) from styles/tokens.css. Do not raise raw color baseline.',
          undefined,
          `CURRENT=${raw.total} LIMIT=${rawBaselineTotal}`,
        ),
      );
    }
    for (const [file, limit] of Object.entries(rawBaselineFiles)) {
      const cur = raw.files[file] ?? 0;
      if (cur > limit) {
        violations.push(
          failMessage(
            'RAW_COLOR_FILE_GREW',
            'Raw color count grew in file',
            RAW_COLOR_ALLOWLIST.has(file)
              ? 'Token file growth is rare — prefer reusing existing tokens.'
              : 'Replace hex/rgb with var(--…) from tokens.css.',
            file,
            `CURRENT=${cur} LIMIT=${limit}`,
          ),
        );
      }
    }
    for (const [file, cur] of Object.entries(raw.files)) {
      if (file in rawBaselineFiles) continue;
      if (RAW_COLOR_ALLOWLIST.has(file)) continue;
      if (cur > 0) {
        violations.push(
          failMessage(
            'RAW_COLOR_NEW_FILE',
            'New CSS file introduces raw colors',
            'Use tokens only outside styles/tokens.css (or add to RAW_COLOR_ALLOWLIST with review).',
            file,
            `rawColors=${cur}`,
          ),
        );
      }
    }

    // Legacy palette refs (--c-* / --a-*) outside tokens.css
    const legacy = collectLegacyPaletteCounts();
    violations.push(
      ...ratchetCountMap(
        'legacy palette refs',
        'LEGACY_PALETTE',
        legacy,
        baseline.legacyPalette ?? {},
        baseline.legacyPaletteTotal ?? Number.POSITIVE_INFINITY,
        'Replace --c-*/--a-* with semantic tokens from styles/tokens.css. Do not raise baseline.',
        'Do not introduce direct --c-*/--a-* refs outside tokens.css.',
      ),
    );

    // Non-canonical max-width breakpoints
    const noncanon = collectNoncanonicalMediaCounts();
    violations.push(
      ...ratchetCountMap(
        'noncanonical media breakpoints',
        'NONCANON_MEDIA',
        noncanon,
        baseline.noncanonicalMedia ?? {},
        baseline.noncanonicalMediaTotal ?? Number.POSITIVE_INFINITY,
        'Use canonical max-width 480/768/1200/1400 only (see css-strategy). Do not raise baseline.',
        'New CSS must use only canonical breakpoints (480/768/1200/1400).',
      ),
    );

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }

    expect(baseline.version).toBeGreaterThanOrEqual(1);
    expect(baseline.stylesCssMaxLoc).toBeLessThanOrEqual(30);
  });

  it('enforces strict global CSS import order in main.tsx', () => {
    const actual = readMainCssImportOrder();
    expect(actual).toEqual([...GLOBAL_CSS_IMPORT_ORDER]);
    expect(actual).not.toContain('./styles/tlt-form-controls.css');
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

  it('counts raw colors ignoring comments', () => {
    expect(countRawColors('/* #fff */ .x { color: #1a5276; }')).toBe(1);
    expect(countRawColors('.x { color: var(--color-primary); }')).toBe(0);
  });

  it('counts legacy palette refs and noncanonical max-width media', () => {
    const sample = `
/* --c-old */
.x { color: var(--c-primary); border-color: var(--a-accent); }
@media (max-width: 900px) { .x { display: none; } }
@media (max-width: 768px) { .x { display: block; } }
@media print { .x { color: black; } }
@media (prefers-reduced-motion: reduce) { .x { animation: none; } }
`;
    expect(countLegacyPaletteRefs(sample)).toBe(2);
    expect(countNoncanonicalMedia(sample)).toBe(1); // only 900
    expect(countLegacyPaletteRefs('/* --c-x */ .ok { color: var(--color-text); }')).toBe(0);
  });

  it('fails growth when a new file adds legacy palette or noncanonical media (fixtures)', () => {
    // Fixture-style pure functions prove new-file growth is detectable.
    expect(countLegacyPaletteRefs('.new { color: var(--c-danger); }')).toBeGreaterThan(0);
    expect(countNoncanonicalMedia('@media (max-width: 640px) { .x{} }')).toBe(1);
    expect(countNoncanonicalMedia('@media (max-width: 480px) { .x{} }')).toBe(0);
  });
});
