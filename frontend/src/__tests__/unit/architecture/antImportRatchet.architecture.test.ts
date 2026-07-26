/**
 * Shrink-only ratchet: production files that import `antd` directly.
 * Prefer `@/components/ui-kit` / form-controls façades for new UI.
 *
 * Baseline is the current inventory; growth fails the gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../..');
const BASELINE_PATH = path.join(HERE, 'antImportBaseline.json');

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

function walkTs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.stories.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function relKey(abs: string): string {
  return `src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

function collectsDirectAntFiles(): string[] {
  const re = /from\s+['"]antd(?:\/[^'"]*)?['"]/;
  const hits: string[] = [];
  for (const file of walkTs(SRC_ROOT)) {
    const text = fs.readFileSync(file, 'utf8');
    if (re.test(text)) hits.push(relKey(file));
  }
  return hits.sort();
}

describe('Ant direct-import ratchet', () => {
  it('does not grow production files importing antd directly (shrink-only)', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
      files: string[];
    };
    const current = collectsDirectAntFiles();
    const baselineSet = new Set(baseline.files);
    const newFiles = current.filter((f) => !baselineSet.has(f));

    expect(
      current.length,
      [
        `[AntImportRatchetError:COUNT_GREW] direct antd production files ${current.length} > baseline ${baseline.count}`,
        newFiles.length ? `NEW: ${newFiles.join(', ')}` : '',
        'FIX: import via @/components/ui-kit or form-controls façade; do not raise baseline without product OK.',
      ].filter(Boolean).join('\n'),
    ).toBeLessThanOrEqual(baseline.count);

    // Files may leave the set (shrink). New files always fail even if count stays equal via swap.
    expect(
      newFiles,
      [
        `[AntImportRatchetError:NEW_FILE] new direct antd importers`,
        `NEW: ${newFiles.join(', ')}`,
        'FIX: use UI Kit façade or add to baseline only with extract plan.',
      ].join('\n'),
    ).toEqual([]);
  });
});
