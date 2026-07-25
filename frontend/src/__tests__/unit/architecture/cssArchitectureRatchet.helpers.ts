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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRC_ROOT = path.resolve(HERE, '../../..');
export const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
export const BASELINE_PATH = path.join(HERE, 'cssArchitectureBaseline.json');

/**
 * Global CSS entries: loaded from main.tsx OR freeze-pointer stubs.
 * tlt-form-controls.css is intentionally NOT global — form-controls/ui-kit owner.
 */
export const GLOBAL_CSS_ENTRIES = new Set([
  'src/styles.css',
  'src/styles/app-base.css', // freeze pointer (layers live in tokens/base/app-shell/vendor)
  'src/styles/tokens.css',
  'src/styles/base.css',
  'src/styles/app-shell.css',
  'src/styles/vendor-overrides.css',
  'src/styles/calc-spreadsheet.css',
  'src/styles/calc-spreadsheet-base.css', // pulled via @import from calc-spreadsheet.css
  'src/styles/calc-spreadsheet-excel.css', // pulled via @import from calc-spreadsheet.css
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
export const RAW_COLOR_ALLOWLIST = new Set([
  'src/styles/tokens.css',
]);

export const RAW_COLOR_RE = /#(?:[0-9a-fA-F]{3,8})\b|\brgba?\(|\bhsla?\(/g;

/**
 * Feature owner roots: CSS under these paths must not use foreign feature markers.
 * Marker = class token that belongs to another feature.
 */
export const FEATURE_OWNERS: Array<{
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

export type FileMetrics = {
  loc: number;
  bareAnt: number;
  media: number;
};

export type ResponsiveContract = {
  /** Normalized media conditions allowed in this file, e.g. "max-width: 1200px". */
  conditions: string[];
  /** Class-root prefixes; every non-empty selector compound in a contracted media block must match one. */
  ownerRoots: string[];
};

export type Baseline = {
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
  /**
   * AF12-CSS-MEDIA-CONTRACT-01: shrink-only set of max-width breakpoints (px)
   * present anywhere under src/. Raw @media block counts are observational.
   */
  mediaConditionMaxWidths?: number[];
  /**
   * Optional per-file responsive ownership contracts (UI Kit owners, etc.).
   * When present: at most one block per condition; selectors must match ownerRoots.
   */
  responsiveContracts?: Record<string, ResponsiveContract>;
};

/** Token owner: legacy palette aliases may live only here. */
export const LEGACY_PALETTE_ALLOWLIST = new Set(['src/styles/tokens.css']);

/** Canonical max-width breakpoints (px). */
export const CANONICAL_MAX_WIDTHS = new Set([480, 768, 1200, 1400]);

export const LEGACY_PALETTE_RE = /--[ca]-[a-zA-Z0-9_-]+/g;
export const MAX_WIDTH_RE = /max-width:\s*(\d+)px/gi;

export const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

export function failMessage(
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

export function walkCssFiles(dir: string): string[] {
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

export function walkTsFiles(dir: string): string[] {
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

export function relSrcKey(abs: string): string {
  return `src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function countLoc(source: string): number {
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

/** Normalize @media query text for contract matching. */
export function normalizeMediaCondition(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase();
}

export type MediaBlock = {
  condition: string;
  body: string;
  selectors: string[];
};

/**
 * Top-level @media blocks with brace-matched bodies (no nested @media split).
 */
export function extractMediaBlocks(source: string): MediaBlock[] {
  const text = stripComments(source);
  const blocks: MediaBlock[] = [];
  let i = 0;
  while (i < text.length) {
    const j = text.indexOf('@media', i);
    if (j < 0) break;
    const brace = text.indexOf('{', j);
    if (brace < 0) break;
    const condition = normalizeMediaCondition(text.slice(j + '@media'.length, brace));
    let depth = 0;
    let k = brace;
    for (; k < text.length; k += 1) {
      const ch = text[k];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          k += 1;
          break;
        }
      }
    }
    const body = text.slice(brace + 1, k - 1);
    blocks.push({
      condition,
      body,
      selectors: extractSelectors(body),
    });
    i = k;
  }
  return blocks;
}

/** Collect unique max-width px values under src/ (excludes print / reduced-motion-only). */
export function collectMediaConditionMaxWidths(): number[] {
  const set = new Set<number>();
  for (const abs of walkCssFiles(SRC_ROOT)) {
    const cleaned = stripComments(fs.readFileSync(abs, 'utf8'));
    const mediaRe = /@media\b([^{]*)\{/gi;
    let m: RegExpExecArray | null;
    while ((m = mediaRe.exec(cleaned)) !== null) {
      const query = m[1] ?? '';
      if (/\bprint\b/i.test(query)) continue;
      if (/prefers-reduced-motion/i.test(query) && !/max-width/i.test(query)) continue;
      MAX_WIDTH_RE.lastIndex = 0;
      let mw: RegExpExecArray | null;
      while ((mw = MAX_WIDTH_RE.exec(query)) !== null) {
        set.add(Number(mw[1]));
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** True if a selector compound is under one of the owner root prefixes. */
export function selectorMatchesOwnerRoots(selector: string, ownerRoots: string[]): boolean {
  for (const part of selector.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const head = trimmed.split(/[\s>+~]/)[0]?.trim() ?? '';
    const ok = ownerRoots.some((root) => {
      if (root.endsWith('-')) {
        return head.startsWith(root) || head.includes(root);
      }
      // exact class or descendant starting with that class
      return (
        head === root ||
        head.startsWith(`${root}.`) ||
        head.startsWith(`${root}:`) ||
        head.startsWith(`${root}[`) ||
        trimmed.includes(root)
      );
    });
    if (!ok) return false;
  }
  return true;
}

/**
 * Validate responsiveContracts entries against file contents.
 * Returns violation messages (empty if OK).
 */
export function validateResponsiveContracts(
  contracts: Record<string, ResponsiveContract>,
  readFile: (rel: string) => string,
): string[] {
  const violations: string[] = [];
  for (const [file, contract] of Object.entries(contracts)) {
    let source: string;
    try {
      source = readFile(file);
    } catch {
      violations.push(
        failMessage(
          'RESPONSIVE_CONTRACT_FILE_MISSING',
          'responsiveContracts file missing on disk',
          'Add the owner CSS file or remove the contract entry.',
          file,
        ),
      );
      continue;
    }
    const blocks = extractMediaBlocks(source);
    const allowed = new Set(
      contract.conditions.map((c) => normalizeMediaCondition(c.replace(/^@media\s*/i, ''))),
    );
    const seen = new Map<string, number>();
    for (const block of blocks) {
      // Prefer max-width contracts; reduced-motion optional without listing
      if (/prefers-reduced-motion/i.test(block.condition)) continue;
      if (/\bprint\b/i.test(block.condition)) continue;
      const cond = block.condition;
      seen.set(cond, (seen.get(cond) ?? 0) + 1);
      if (seen.get(cond)! > 1) {
        violations.push(
          failMessage(
            'RESPONSIVE_DUPLICATE_MEDIA',
            `Duplicate @media condition in owner file: ${cond}`,
            'Keep at most one block per media condition per owner file.',
            file,
            cond,
          ),
        );
      }
      // If contract lists specific conditions, non-listed max-width is a new breakpoint for this owner
      if (allowed.size > 0) {
        const listed = [...allowed].some(
          (a) => cond.includes(a) || a.includes(cond) || cond === a,
        );
        if (!listed && /max-width/i.test(cond)) {
          violations.push(
            failMessage(
              'RESPONSIVE_UNLISTED_CONDITION',
              `Media condition not in responsiveContracts.conditions: ${cond}`,
              'Add an exact baseline contract update or remove the media block.',
              file,
              cond,
            ),
          );
        }
      }
      for (const sel of block.selectors) {
        if (!selectorMatchesOwnerRoots(sel, contract.ownerRoots)) {
          violations.push(
            failMessage(
              'RESPONSIVE_FOREIGN_SELECTOR',
              `Selector in contracted media block is outside ownerRoots`,
              'Move selector to its CSS owner or fix ownerRoots.',
              file,
              sel.slice(0, 120),
            ),
          );
        }
      }
    }
  }
  return violations;
}

export function collectRawColorCounts(): { total: number; files: Record<string, number> } {
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

export function collectLegacyPaletteCounts(): { total: number; files: Record<string, number> } {
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

export function collectNoncanonicalMediaCounts(): { total: number; files: Record<string, number> } {
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

export function ratchetCountMap(
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

export function readMainCssImportOrder(): string[] {
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

export function loadBaseline(): Baseline {
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

export function collectCurrent(): Record<string, FileMetrics> {
  const out: Record<string, FileMetrics> = {};
  for (const abs of walkCssFiles(SRC_ROOT)) {
    out[relSrcKey(abs)] = measureCssFile(fs.readFileSync(abs, 'utf8'));
  }
  return out;
}

export function sumMetrics(files: Record<string, FileMetrics>): FileMetrics {
  const t: FileMetrics = { loc: 0, bareAnt: 0, media: 0 };
  for (const m of Object.values(files)) {
    t.loc += m.loc;
    t.bareAnt += m.bareAnt;
    t.media += m.media;
  }
  return t;
}

/** Resolve whether a CSS path is imported from production TS/TSX. */
export function collectCssImporters(): Map<string, string[]> {
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

