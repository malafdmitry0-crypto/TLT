// @vitest-environment node
/**
 * AF9-LAYOUT-01/02 / P1-GUARDRAIL-TRUTH-01: coordinate-based layout ratchet.
 *
 * Counts only CSS declarations of `grid-row`, `grid-column`, and `order`
 * (exact property names with word boundaries). Comments and `border:` do not count.
 * fileCounts are shrink-only; stale higher baseline fails; new files fail.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../..');
const BASELINE_PATH = path.join(HERE, 'coordinateLayoutBaseline.json');
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

const COORD_PROPS = new Set(['grid-row', 'grid-column', 'order']);

export type CoordinateOccurrence = {
  file: string;
  line: number;
  text: string;
  property: string;
  class: string;
};

export type CoordinateBaseline = {
  version: number;
  total: number;
  fileCounts: Record<string, number>;
  occurrences: Array<{ file: string; line: number; text: string; class: string; property?: string }>;
};

function failMessage(
  code: string,
  message: string,
  fix: string,
  file: string,
  current?: number,
  limit?: number,
): string {
  const parts = [`[CoordinateLayoutRatchetError:${code}] ${message}`, `FILE: ${file}`];
  if (current !== undefined) parts.push(`CURRENT: ${current}`);
  if (limit !== undefined) parts.push(`LIMIT: ${limit}`);
  parts.push(`FIX: ${fix}`);
  return parts.join('\n');
}

function walkCss(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkCss(full));
    else if (/\.css$/.test(entry.name)) out.push(full);
  }
  return out;
}

function relSrcKey(abs: string, srcRoot: string = SRC_ROOT): string {
  return `src/${path.relative(srcRoot, abs).split(path.sep).join('/')}`;
}

export function isHeatWizardCss(key: string): boolean {
  return /heat|wizard|object|insulation|field|form/i.test(key);
}

/**
 * Legacy buggy matcher: unanchored `(grid-row|grid-column|order)\s*:` matches
 * the substring `order` inside `border:`.
 */
export function countCoordinateDeclarationsLegacyBuggy(source: string): number {
  let n = 0;
  for (const line of source.split(/\r?\n/)) {
    if (/(grid-row|grid-column|order)\s*:/.test(line)) n += 1;
  }
  return n;
}

/**
 * Truthful declaration count: strip comments, match exact property names only.
 * Returns occurrences with original line numbers (comment-aware scan).
 */
export function collectCoordinateDeclarationsFromSource(
  source: string,
  fileKey = 'snippet.css',
  classHint: 'domain field' | 'layout chrome' = 'domain field',
): CoordinateOccurrence[] {
  const out: CoordinateOccurrence[] = [];
  const lines = source.split(/\r?\n/);
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i += 1) {
    const original = lines[i];
    let line = original;
    let cleaned = '';
    let j = 0;
    while (j < line.length) {
      if (!inBlockComment && line[j] === '/' && line[j + 1] === '*') {
        inBlockComment = true;
        j += 2;
        continue;
      }
      if (inBlockComment) {
        if (line[j] === '*' && line[j + 1] === '/') {
          inBlockComment = false;
          j += 2;
          continue;
        }
        j += 1;
        continue;
      }
      // line comment not standard in CSS files here; keep full text outside blocks
      cleaned += line[j];
      j += 1;
    }

    // Match property declarations: word-boundary property names only.
    const re = /(^|[{;,])\s*(grid-row|grid-column|order)\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      const property = m[2];
      if (!COORD_PROPS.has(property)) continue;
      out.push({
        file: fileKey,
        line: i + 1,
        text: original.trim(),
        property,
        class: classHint,
      });
    }
  }
  return out;
}

export function countCoordinateDeclarations(source: string): number {
  return collectCoordinateDeclarationsFromSource(source).length;
}

function defaultClassForFile(key: string): 'domain field' | 'layout chrome' {
  if (/compact-fields|heat-object|insulation|field-chrome|insulation-page/i.test(key)) {
    return 'domain field';
  }
  return 'layout chrome';
}

export function collectCoordinateLayout(srcRoot: string = SRC_ROOT): {
  total: number;
  fileCounts: Record<string, number>;
  occurrences: CoordinateOccurrence[];
} {
  const fileCounts: Record<string, number> = {};
  const occurrences: CoordinateOccurrence[] = [];
  for (const abs of walkCss(srcRoot)) {
    const key = relSrcKey(abs, srcRoot);
    if (!isHeatWizardCss(key)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const hits = collectCoordinateDeclarationsFromSource(text, key, defaultClassForFile(key));
    if (hits.length) {
      fileCounts[key] = hits.length;
      occurrences.push(...hits);
    }
  }
  return {
    total: occurrences.length,
    fileCounts,
    occurrences,
  };
}

describe('coordinate layout ratchet (AF9-LAYOUT-01/02)', () => {
  it('classifies heat/wizard coordinates and forbids growth / stale baseline', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as CoordinateBaseline;
    expect(baseline.occurrences.length).toBeGreaterThan(0);
    expect(
      baseline.occurrences.every((o) => o.class === 'domain field' || o.class === 'layout chrome'),
    ).toBe(true);

    const current = collectCoordinateLayout();
    const violations: string[] = [];

    if (current.total > baseline.total) {
      violations.push(
        failMessage(
          'COORDINATE_LAYOUT_TOTAL_GREW',
          'Total grid-row/grid-column/order count grew',
          'Prefer semantic DOM flow; do not add new coordinate placement for domain fields.',
          '(total)',
          current.total,
          baseline.total,
        ),
      );
    } else if (current.total < baseline.total) {
      violations.push(
        failMessage(
          'STALE_BASELINE_TOTAL',
          'Baseline total coordinate count is higher than current',
          'Update coordinateLayoutBaseline.json to the shrunk total in the same PR.',
          '(total)',
          current.total,
          baseline.total,
        ),
      );
    }

    for (const [file, limit] of Object.entries(baseline.fileCounts)) {
      const cur = current.fileCounts[file] ?? 0;
      if (cur > limit) {
        violations.push(
          failMessage(
            'COORDINATE_LAYOUT_GREW',
            'grid-row/grid-column/order count grew in heat/wizard CSS',
            'Prefer semantic DOM flow; do not add new coordinate placement for domain fields.',
            file,
            cur,
            limit,
          ),
        );
      } else if (cur < limit) {
        violations.push(
          failMessage(
            'STALE_BASELINE',
            'Baseline coordinate count is higher than current',
            'Update coordinateLayoutBaseline.json to the shrunk count in the same PR.',
            file,
            cur,
            limit,
          ),
        );
      }
    }

    for (const [file, count] of Object.entries(current.fileCounts)) {
      if (file in baseline.fileCounts) continue;
      violations.push(
        failMessage(
          'NEW_COORDINATE_FILE',
          'New heat/wizard CSS introduces coordinate-based placement',
          'Use semantic flow/container queries instead of grid-row/column/order for domain fields.',
          file,
          count,
          0,
        ),
      );
    }

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }
  });
});

describe('coordinate layout fixtures (P1-GUARDRAIL-TRUTH-01)', () => {
  it('OLD: unanchored regex counts border: as order', () => {
    const css = '.x { border: 1px solid red; }';
    expect(countCoordinateDeclarationsLegacyBuggy(css)).toBe(1);
  });

  it('FIXED: border: is NOT order:', () => {
    const css = [
      '.x { border: 1px solid red; }',
      '/* order: 1 in a comment */',
      '/* neutralize legacy grid-column: 1 / -1 */',
      '.y { border-top: 1px solid; }',
    ].join('\n');
    expect(countCoordinateDeclarations(css)).toBe(0);
    const hits = collectCoordinateDeclarationsFromSource(css);
    expect(hits.every((h) => h.property !== 'border')).toBe(true);
  });

  it('FIXED: real order / grid-row / grid-column still count once each', () => {
    const css = [
      '.a { order: 2; }',
      '.b { grid-row: 1; grid-column: 2; }',
      '.c { border: 0; order: 1; }',
    ].join('\n');
    expect(countCoordinateDeclarations(css)).toBe(4);
  });
});
