/**
 * AF9-LAYOUT-01/02: classify coordinate-based layout and forbid new domain coords.
 *
 * Tracks grid-row / grid-column / order in heat/wizard CSS.
 * fileCounts are shrink-only; new files with coordinates fail.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../..');
const BASELINE_PATH = path.join(HERE, 'coordinateLayoutBaseline.json');
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

type Baseline = {
  version: number;
  total: number;
  fileCounts: Record<string, number>;
  occurrences: Array<{ file: string; line: number; text: string; class: string }>;
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

function relSrcKey(abs: string): string {
  return `src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

function isHeatWizardCss(key: string): boolean {
  return /heat|wizard|object|insulation|field|form/i.test(key);
}

function collectFileCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const abs of walkCss(SRC_ROOT)) {
    const key = relSrcKey(abs);
    if (!isHeatWizardCss(key)) continue;
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    let n = 0;
    for (const line of lines) {
      if (/(grid-row|grid-column|order)\s*:/.test(line)) n += 1;
    }
    if (n > 0) counts[key] = n;
  }
  return counts;
}

describe('coordinate layout ratchet (AF9-LAYOUT-01/02)', () => {
  it('classifies heat/wizard coordinates and forbids growth', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    expect(baseline.occurrences.length).toBeGreaterThan(0);
    expect(baseline.occurrences.every((o) => o.class === 'domain field' || o.class === 'layout chrome')).toBe(true);

    const current = collectFileCounts();
    const violations: string[] = [];

    for (const [file, limit] of Object.entries(baseline.fileCounts)) {
      const cur = current[file] ?? 0;
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

    for (const [file, count] of Object.entries(current)) {
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
