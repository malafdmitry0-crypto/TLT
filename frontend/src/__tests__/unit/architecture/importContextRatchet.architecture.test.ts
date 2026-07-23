/**
 * AF9-CONTEXT-GATE-01: import-context ratchet.
 *
 * - New production files: ≤ newFileImportCap (20) imports.
 * - Files above the cap are listed in importContextBaseline.json with exact counts.
 * - Import count cannot grow; stale higher baseline fails (shrink-only).
 * - Files that drop to ≤ cap must leave the baseline.
 *
 * Errors: FILE / CURRENT / LIMIT / FIX
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../..');
const BASELINE_PATH = path.join(HERE, 'importContextBaseline.json');
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

type Baseline = {
  version: number;
  newFileImportCap: number;
  files: Record<string, number>;
};

function failMessage(
  code: string,
  message: string,
  fix: string,
  file: string,
  current?: number,
  limit?: number,
): string {
  const parts = [`[ImportContextRatchetError:${code}] ${message}`, `FILE: ${file}`];
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

function countImports(absPath: string): number {
  const text = fs.readFileSync(absPath, 'utf8');
  const kind = absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, kind);
  let imports = 0;
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) imports += 1;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

describe('import-context ratchet (AF9-CONTEXT-GATE-01)', () => {
  it('caps new-file imports and shrink-only tracks hotspots', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    const current: Record<string, number> = {};
    for (const abs of walkProductionTsFiles(SRC_ROOT)) {
      current[relSrcKey(abs)] = countImports(abs);
    }
    const violations: string[] = [];

    for (const [file, limit] of Object.entries(baseline.files)) {
      const cur = current[file];
      if (cur === undefined) {
        violations.push(
          failMessage(
            'STALE_BASELINE_MISSING_FILE',
            'Baseline lists a production file that no longer exists',
            'Remove the entry from importContextBaseline.json.',
            file,
          ),
        );
        continue;
      }
      if (cur <= baseline.newFileImportCap) {
        violations.push(
          failMessage(
            'STALE_BASELINE_UNDER_CAP',
            `File is ≤ newFileImportCap (${baseline.newFileImportCap}) but still in import hotspot baseline`,
            'Remove the entry from importContextBaseline.json.',
            file,
            cur,
            baseline.newFileImportCap,
          ),
        );
        continue;
      }
      if (cur > limit) {
        violations.push(
          failMessage(
            'IMPORT_COUNT_GREW',
            'Hotspot import count grew',
            'Extract a consumer-owned module or share an existing contract. Do not raise the baseline.',
            file,
            cur,
            limit,
          ),
        );
      } else if (cur < limit) {
        violations.push(
          failMessage(
            'STALE_BASELINE',
            'Baseline import count is higher than current (historical slack)',
            'Update importContextBaseline.json to current counts in the same PR as the shrink.',
            file,
            cur,
            limit,
          ),
        );
      }
    }

    for (const [file, count] of Object.entries(current)) {
      if (file in baseline.files) continue;
      if (count > baseline.newFileImportCap) {
        violations.push(
          failMessage(
            'NEW_FILE_OVER_IMPORT_CAP',
            'Production file exceeds import cap and is missing from hotspot baseline',
            `Keep file ≤ ${baseline.newFileImportCap} imports or add the exact count to importContextBaseline.json with a shrink note.`,
            file,
            count,
            baseline.newFileImportCap,
          ),
        );
      }
    }

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }
  });
});
