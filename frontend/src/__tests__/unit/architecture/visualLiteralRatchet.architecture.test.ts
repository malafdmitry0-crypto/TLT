/**
 * AF10-VISUAL-LITERAL-GATE-01: forbid growth of raw #hex/rgb/hsl color
 * literals in production TS/TSX outside approved owner files.
 *
 * Owners (no-growth allowlist):
 *   theme/appTheme.ts, utils/glideGridPrimitives.ts,
 *   components/admin/formulas/formulaPrimitives.tsx, pages/UIKitPage.tsx
 * All other production files: shrink-to-zero.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../..');
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const BASELINE_PATH = path.join(HERE, 'visualLiteralBaseline.json');

const COLOR_LITERAL_RE = /#(?:[0-9a-fA-F]{3,8})\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/i;

/** Allowed to hold color literals (no-growth only). */
export const VISUAL_LITERAL_OWNERS = new Set([
  'src/theme/appTheme.ts',
  'src/utils/glideGridPrimitives.ts',
  'src/components/admin/formulas/formulaPrimitives.tsx',
  'src/pages/UIKitPage.tsx',
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

type Baseline = {
  version: number;
  owners: Record<string, number>;
  files: Record<string, number>;
  totalNonOwner: number;
};

function relSrcKey(abs: string): string {
  return `src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

function walkProductionTs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkProductionTs(full));
    else if (
      /\.(ts|tsx)$/.test(entry.name)
      && !entry.name.endsWith('.d.ts')
      && !entry.name.includes('.test.')
      && !entry.name.includes('.spec.')
      && !entry.name.includes('.stories.')
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Count color literals inside string-like AST nodes only. */
export function countVisualColorLiterals(source: string, fileName = 'file.tsx'): number {
  const kind = fileName.endsWith('.ts') && !fileName.endsWith('.tsx')
    ? ts.ScriptKind.TS
    : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  let count = 0;
  const consider = (text: string) => {
    const matches = text.match(COLOR_LITERAL_RE);
    if (matches) count += matches.length;
  };
  sf.forEachChild(function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      consider(node.text);
    } else if (ts.isTemplateExpression(node)) {
      consider(node.head.text);
      for (const span of node.templateSpans) {
        consider(span.literal.text);
      }
    }
    ts.forEachChild(node, visit);
  });
  return count;
}

export function collectVisualLiteralCounts(srcRoot = SRC_ROOT): {
  owners: Record<string, number>;
  files: Record<string, number>;
  totalNonOwner: number;
} {
  const owners: Record<string, number> = {};
  const files: Record<string, number> = {};
  let totalNonOwner = 0;
  for (const abs of walkProductionTs(srcRoot)) {
    const key = relSrcKey(abs);
    const n = countVisualColorLiterals(fs.readFileSync(abs, 'utf8'), abs);
    if (n <= 0) continue;
    if (VISUAL_LITERAL_OWNERS.has(key)) {
      owners[key] = n;
    } else {
      files[key] = n;
      totalNonOwner += n;
    }
  }
  return { owners, files, totalNonOwner };
}

function fail(code: string, message: string, fix: string, file?: string, metric?: string): string {
  const parts = [`[VisualLiteralRatchetError:${code}] ${message}`];
  if (file) parts.push(`FILE: ${file}`);
  if (metric) parts.push(`METRIC: ${metric}`);
  parts.push(`FIX: ${fix}`);
  return parts.join('\n');
}

describe('visual literal ratchet (AF10-VISUAL-LITERAL-GATE-01)', () => {
  it('does not grow raw color literals outside approved owners (bidirectional)', () => {
    const current = collectVisualLiteralCounts();
    if (!fs.existsSync(BASELINE_PATH)) {
      const seed: Baseline = {
        version: 1,
        owners: current.owners,
        files: current.files,
        totalNonOwner: current.totalNonOwner,
      };
      fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(seed, null, 2)}\n`);
    }
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    const violations: string[] = [];

    if (current.totalNonOwner > baseline.totalNonOwner) {
      violations.push(
        fail(
          'TOTAL_GREW',
          'Non-owner visual color literal total grew',
          'Move presentation colors to CSS/tokens; canvas colors to glideGridPrimitives.',
          undefined,
          `CURRENT=${current.totalNonOwner} LIMIT=${baseline.totalNonOwner}`,
        ),
      );
    }
    if (current.totalNonOwner < baseline.totalNonOwner) {
      violations.push(
        fail(
          'STALE_TOTAL',
          'Baseline non-owner total is higher than current',
          'Update visualLiteralBaseline.json totalNonOwner in the same PR as the shrink.',
          undefined,
          `CURRENT=${current.totalNonOwner} LIMIT=${baseline.totalNonOwner}`,
        ),
      );
    }

    // Owner no-growth
    for (const [file, limit] of Object.entries(baseline.owners)) {
      const cur = current.owners[file] ?? 0;
      if (cur > limit) {
        violations.push(
          fail(
            'OWNER_GREW',
            'Owner visual literal count grew',
            'Prefer reusing existing palette entries in this owner file.',
            file,
            `CURRENT=${cur} LIMIT=${limit}`,
          ),
        );
      }
      if (cur < limit) {
        violations.push(
          fail(
            'OWNER_STALE',
            'Owner baseline is higher than current',
            'Update visualLiteralBaseline.json owners in the same PR as the shrink.',
            file,
            `CURRENT=${cur} LIMIT=${limit}`,
          ),
        );
      }
    }
    for (const file of Object.keys(current.owners)) {
      if (!(file in baseline.owners)) {
        violations.push(
          fail(
            'OWNER_NEW',
            'Unexpected owner file with color literals',
            'Add to VISUAL_LITERAL_OWNERS only with explicit review, or remove colors.',
            file,
          ),
        );
      }
    }

    // Non-owner shrink-to-zero map
    for (const [file, limit] of Object.entries(baseline.files)) {
      const cur = current.files[file] ?? 0;
      if (cur > limit) {
        violations.push(
          fail(
            'FILE_GREW',
            'Non-owner visual literal count grew',
            'Use CSS tokens / theme / glideGridPrimitives. Do not raise baseline.',
            file,
            `CURRENT=${cur} LIMIT=${limit}`,
          ),
        );
      }
      if (cur < limit) {
        violations.push(
          fail(
            'FILE_STALE',
            'Baseline still lists higher count (or residual file)',
            'Update visualLiteralBaseline.json files in the same PR as the shrink.',
            file,
            `CURRENT=${cur} LIMIT=${limit}`,
          ),
        );
      }
    }
    for (const [file, cur] of Object.entries(current.files)) {
      if (file in baseline.files) continue;
      if (cur > 0) {
        violations.push(
          fail(
            'NEW_FILE',
            'New production file introduces visual color literals',
            'Use CSS tokens / theme / centralized canvas palette.',
            file,
            `count=${cur}`,
          ),
        );
      }
    }

    if (violations.length) {
      expect.fail(violations.join('\n\n---\n\n'));
    }
    expect(baseline.version).toBeGreaterThanOrEqual(1);
    expect(path.relative(FRONTEND_ROOT, BASELINE_PATH)).toContain('visualLiteralBaseline');
  });

  it('AST counts only string color literals, not identifiers', () => {
    const src = `
      const token = 'colorPrimary';
      const hex = '#1a5276';
      const rgb = 'rgb(26, 82, 118)';
      // #fff in comment should not count via AST string walk
      const tpl = \`border: 1px solid \${x}; color: #abc;\`;
    `;
    expect(countVisualColorLiterals(src, 'x.ts')).toBe(3); // hex, rgb, #abc in template
  });
});
