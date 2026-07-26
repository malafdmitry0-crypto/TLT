// @vitest-environment node
/**
 * IMP0: per-file !important ratchet.
 *
 * - Growth of total !important count fails.
 * - Growth of any known file fails.
 * - New CSS files that introduce !important fail until justified (prefer decrease elsewhere first).
 * - Decrease is always allowed without editing the baseline file.
 *
 * Baseline: cssImportantBaseline.json
 * See: docs/frontend/css-strategy.md, docs/frontend/archive/README.md
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// architecture/ → unit → __tests__ → src (SRC_ROOT); one more level → frontend package root
const SRC_ROOT = path.resolve(HERE, '../../..');
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const BASELINE_PATH = path.join(HERE, 'cssImportantBaseline.json');

type Baseline = {
  version: number;
  total: number;
  files: Record<string, number>;
};

function failMessage(code: string, message: string, fix: string, file?: string): string {
  const parts = [`[CssImportantRatchetError:${code}] ${message}`];
  if (file) parts.push(`FILE: ${file}`);
  parts.push(`FIX: ${fix}`);
  return parts.join('\n');
}

function walkCssFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...walkCssFiles(full));
    } else if (entry.name.endsWith('.css')) {
      out.push(full);
    }
  }
  return out;
}

/** Strip block comments, then count !important (case-sensitive CSS keyword). */
export function countImportantInCss(source: string): number {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return (withoutComments.match(/!important\b/g) ?? []).length;
}

export function collectImportantCounts(srcRoot: string = SRC_ROOT): {
  total: number;
  files: Record<string, number>;
} {
  const files: Record<string, number> = {};
  let total = 0;
  for (const abs of walkCssFiles(srcRoot)) {
    const rel = path.relative(srcRoot, abs).split(path.sep).join('/');
    const key = `src/${rel}`;
    const n = countImportantInCss(fs.readFileSync(abs, 'utf8'));
    if (n > 0) {
      files[key] = n;
      total += n;
    }
  }
  return { total, files };
}

function loadBaseline(): Baseline {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      failMessage(
        'BASELINE_MISSING',
        `Baseline file not found: ${path.relative(FRONTEND_ROOT, BASELINE_PATH)}`,
        'Restore cssImportantBaseline.json from git or regenerate from a clean green HEAD.',
      ),
    );
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
}

describe('CSS !important ratchet (IMP0)', () => {
  it('does not grow total or per-file !important counts', () => {
    const baseline = loadBaseline();
    const current = collectImportantCounts();
    const violations: string[] = [];

    if (current.total > baseline.total) {
      violations.push(
        failMessage(
          'IMPORTANT_TOTAL_GREW',
          `Total !important grew: CURRENT=${current.total} LIMIT=${baseline.total}`,
          'Remove new !important overrides or replace with owner-root specificity / Ant tokens. Do not raise the baseline.',
        ),
      );
    }

    for (const [file, limit] of Object.entries(baseline.files)) {
      const cur = current.files[file] ?? 0;
      if (cur > limit) {
        violations.push(
          failMessage(
            'IMPORTANT_FILE_GREW',
            `!important grew in file: CURRENT=${cur} LIMIT=${limit}`,
            'Reduce !important in this owner CSS (prefer delete duplicate/dead rules or fix cascade without !important). Do not raise the per-file cap.',
            file,
          ),
        );
      }
    }

    for (const [file, cur] of Object.entries(current.files)) {
      if (!(file in baseline.files) && cur > 0) {
        violations.push(
          failMessage(
            'IMPORTANT_NEW_FILE',
            `New CSS file introduces !important: CURRENT=${cur} LIMIT=0 (file absent from baseline)`,
            'Prefer zero !important in new CSS. If unavoidable, first reduce elsewhere so total does not grow, then update cssImportantBaseline.json in the same PR with evidence.',
            file,
          ),
        );
      }
    }

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }

    // Decrease is allowed down to zero (StyleProvider hashPriority=low path).
    expect(baseline.total).toBeGreaterThanOrEqual(0);
    expect(current.total).toBeLessThanOrEqual(baseline.total);
  });

  it('baseline total equals sum of per-file entries', () => {
    const baseline = loadBaseline();
    const sum = Object.values(baseline.files).reduce((a, b) => a + b, 0);
    expect(sum).toBe(baseline.total);
  });
});
