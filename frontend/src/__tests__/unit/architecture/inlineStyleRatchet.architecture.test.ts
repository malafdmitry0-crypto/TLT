/**
 * AF9-INLINE-01/02: classify JSX inline styling and shrink-only gate.
 *
 * Baseline lists current production style/styles occurrences with class:
 * runtime geometry | third-party adapter | static debt.
 * New static style/styles lines outside baseline fail; total per file cannot grow.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../..');
const BASELINE_PATH = path.join(HERE, 'inlineStyleBaseline.json');
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

type Occurrence = {
  file: string;
  line: number;
  class: string;
  text: string;
};

type Baseline = {
  version: number;
  total: number;
  fileCounts: Record<string, number>;
  occurrences: Occurrence[];
};

function failMessage(
  code: string,
  message: string,
  fix: string,
  file: string,
  current?: number,
  limit?: number,
): string {
  const parts = [`[InlineStyleRatchetError:${code}] ${message}`, `FILE: ${file}`];
  if (current !== undefined) parts.push(`CURRENT: ${current}`);
  if (limit !== undefined) parts.push(`LIMIT: ${limit}`);
  parts.push(`FIX: ${fix}`);
  return parts.join('\n');
}

function walkProductionTsx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkProductionTsx(full));
    else if (
      /\.tsx$/.test(entry.name)
      && !entry.name.includes('.test.')
      && !entry.name.includes('.spec.')
      && !entry.name.includes('.stories.')
    ) {
      out.push(full);
    }
  }
  return out;
}

function relSrcKey(abs: string): string {
  return `src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

function classify(line: string): string | null {
  const t = line.trim();
  if (/styles?\??\s*:/.test(t) && !/styles?\s*=/.test(t)) return null;
  if (!/styles?\s*=/.test(t)) return null;
  if (
    /<(InputNumber|Select|Input|DatePicker|TimePicker|TreeSelect|Cascader|AutoComplete|Slider|Mentions)\b/.test(t)
    && /style=\{\{/.test(t)
  ) {
    return 'third-party adapter';
  }
  if (
    /\b(Modal|Drawer|Table|Tooltip|Popover|Dropdown|Segmented|Space|Row|Col|Card|Form)\b/.test(t)
    && /style=\{\{/.test(t)
    && /width|top|zIndex|maxHeight|paddingBottom/.test(t)
  ) {
    return 'third-party adapter';
  }
  if (/style=\{\s*[A-Za-z_$]/.test(t) || /styles=\{\s*[A-Za-z_$]/.test(t)) {
    return 'runtime geometry';
  }
  if (
    /style=\{\{[^}]*(\bprops\b|\bstate\b|Math\.|`|\$\{|\?\s*['"`]|:\s*['"`][^'"]*['"`]\s*)/.test(t)
    || /styles=\{\{/.test(t)
  ) {
    return 'runtime geometry';
  }
  return 'static debt';
}

function collectFileCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const abs of walkProductionTsx(SRC_ROOT)) {
    const key = relSrcKey(abs);
    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    let n = 0;
    for (const line of lines) {
      if (classify(line)) n += 1;
    }
    if (n > 0) counts[key] = n;
  }
  return counts;
}

describe('inline style ratchet (AF9-INLINE-01/02)', () => {
  it('has a classified baseline and forbids new static inline growth', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    expect(baseline.occurrences.length).toBeGreaterThan(0);
    const classes = new Set(baseline.occurrences.map((o) => o.class));
    expect(classes.has('runtime geometry')).toBe(true);
    expect(classes.has('static debt')).toBe(true);
    expect(classes.has('third-party adapter')).toBe(true);

    const current = collectFileCounts();
    const violations: string[] = [];

    for (const [file, limit] of Object.entries(baseline.fileCounts)) {
      const cur = current[file] ?? 0;
      if (cur > limit) {
        violations.push(
          failMessage(
            'INLINE_STYLE_GREW',
            'Production inline style/styles count grew',
            'Move static styling to component CSS or tokens; keep only runtime geometry / documented adapters.',
            file,
            cur,
            limit,
          ),
        );
      } else if (cur < limit) {
        violations.push(
          failMessage(
            'STALE_BASELINE',
            'Baseline inline style count is higher than current',
            'Update inlineStyleBaseline.json to the shrunk count in the same PR.',
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
          'NEW_FILE_INLINE_STYLE',
          'New production file introduces style/styles attributes',
          'Prefer CSS modules/tokens. If runtime geometry is required, add a classified baseline entry with owner/reason.',
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
