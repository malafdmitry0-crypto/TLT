/**
 * G2: production TS/TSX complexity ratchet (truthful shrink-only).
 *
 * - Baseline lists only production files with loc > newFileLocCap (hotspots).
 * - Hotspot metrics cannot grow above baseline (loc/imports/hooks).
 * - After a shrink, baseline must be updated in the same PR: stale higher
 *   limits fail with STALE_BASELINE (no historical slack).
 * - New production files (not in baseline): LOC ≤ newFileLocCap (500).
 * - Files that drop to ≤ newFileLocCap must leave the baseline.
 *
 * Imports counted via TypeScript compiler API (ImportDeclaration).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// architecture/ → unit → __tests__ → src (SRC_ROOT); one more level → frontend package root
const SRC_ROOT = path.resolve(HERE, '../../..');
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const BASELINE_PATH = path.join(HERE, 'complexityBaseline.json');

type FileMetrics = {
  loc: number;
  imports: number;
  useEffect: number;
  useState: number;
  useCallback: number;
};

type Baseline = {
  version: number;
  newFileLocCap: number;
  files: Record<string, FileMetrics>;
};

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

function failMessage(
  code: string,
  message: string,
  fix: string,
  file: string,
  current?: number,
  limit?: number,
): string {
  const parts = [`[ComplexityRatchetError:${code}] ${message}`, `FILE: ${file}`];
  if (current !== undefined) parts.push(`CURRENT: ${current}`);
  if (limit !== undefined) parts.push(`LIMIT: ${limit}`);
  parts.push(`FIX: ${fix}`);
  return parts.join('\n');
}

function walkProductionTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkProductionTsFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(entry.name)
      && !entry.name.endsWith('.d.ts')
      && !entry.name.includes('.test.')
      && !entry.name.includes('.spec.')
    ) {
      out.push(full);
    }
  }
  return out;
}

function relSrcKey(abs: string): string {
  return `src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

export function measureFileMetrics(absPath: string, sourceText?: string): FileMetrics {
  const text = sourceText ?? fs.readFileSync(absPath, 'utf8');
  const loc = text.length === 0 ? 0 : text.split(/\r?\n/).length;
  const kind = absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, kind);

  let imports = 0;
  let useEffect = 0;
  let useState = 0;
  let useCallback = 0;

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      imports += 1;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (name === 'useEffect') useEffect += 1;
      if (name === 'useState') useState += 1;
      if (name === 'useCallback') useCallback += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { loc, imports, useEffect, useState, useCallback };
}

function loadBaseline(): Baseline {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      failMessage(
        'BASELINE_MISSING',
        `Baseline missing: ${path.relative(FRONTEND_ROOT, BASELINE_PATH)}`,
        'Restore complexityBaseline.json from git or regenerate on a clean green HEAD.',
        path.relative(FRONTEND_ROOT, BASELINE_PATH),
      ),
    );
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
}

function collectCurrent(): Record<string, FileMetrics> {
  const out: Record<string, FileMetrics> = {};
  for (const abs of walkProductionTsFiles(SRC_ROOT)) {
    out[relSrcKey(abs)] = measureFileMetrics(abs);
  }
  return out;
}

const METRIC_KEYS: Array<keyof FileMetrics> = [
  'loc',
  'imports',
  'useEffect',
  'useState',
  'useCallback',
];

describe('complexity ratchet (G2)', () => {
  it('does not grow hotspot metrics and enforces new-file LOC cap', () => {
    const baseline = loadBaseline();
    const current = collectCurrent();
    const violations: string[] = [];

    for (const [file, limits] of Object.entries(baseline.files)) {
      const cur = current[file];
      if (!cur) {
        // File removed — allowed, but drop the baseline entry in the same PR.
        violations.push(
          failMessage(
            'STALE_BASELINE_MISSING_FILE',
            'Baseline lists a production file that no longer exists',
            'Remove the entry from complexityBaseline.json.',
            file,
          ),
        );
        continue;
      }
      if (cur.loc <= baseline.newFileLocCap) {
        violations.push(
          failMessage(
            'STALE_BASELINE_UNDER_CAP',
            `File is ≤ newFileLocCap (${baseline.newFileLocCap}) but still in hotspot baseline`,
            'Remove the entry from complexityBaseline.json (no longer a hotspot).',
            file,
            cur.loc,
            baseline.newFileLocCap,
          ),
        );
        continue;
      }
      for (const key of METRIC_KEYS) {
        if (cur[key] > limits[key]) {
          violations.push(
            failMessage(
              `COMPLEXITY_${key.toUpperCase()}_GREW`,
              `Hotspot metric grew: ${key}`,
              key === 'loc'
                ? 'Extract a named use-case module (≤300 LOC preferred); parent must shrink. Do not raise the baseline cap.'
                : 'Reduce imports/hooks via extraction or reuse. Do not raise the baseline cap.',
              file,
              cur[key],
              limits[key],
            ),
          );
        } else if (cur[key] < limits[key]) {
          violations.push(
            failMessage(
              'STALE_BASELINE',
              `Baseline ${key} is higher than current (historical slack)`,
              'Update complexityBaseline.json to current metrics in the same PR as the shrink.',
              file,
              cur[key],
              limits[key],
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
            'NEW_FILE_OVER_LOC_CAP',
            `Production file exceeds LOC cap and is missing from hotspot baseline`,
            `Keep file ≤ ${baseline.newFileLocCap} LOC or add current metrics to complexityBaseline.json.`,
            file,
            metrics.loc,
            baseline.newFileLocCap,
          ),
        );
      }
    }

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }

    expect(baseline.newFileLocCap).toBe(500);
    expect(baseline.version).toBeGreaterThanOrEqual(2);
    expect(Object.keys(baseline.files).length).toBeGreaterThan(0);
  });

  it('measures imports via TypeScript AST (ImportDeclaration only)', () => {
    const sample = `
import fs from 'node:fs';
import { x } from './x';
export { y } from './y';
const useState = 1;
useState(0);
`;
    const m = measureFileMetrics('sample.tsx', sample);
    // only import declarations, not export-from, not bare identifier useState assignment
    expect(m.imports).toBe(2);
    // CallExpression useState(0)
    expect(m.useState).toBe(1);
  });
});
