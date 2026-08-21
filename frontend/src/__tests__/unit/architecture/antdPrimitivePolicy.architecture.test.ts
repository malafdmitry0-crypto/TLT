// @vitest-environment node
/**
 * AF9-UI-01 / P1-GUARDRAIL-TRUTH-01: direct Ant primitives with Tlt equivalents
 * are blocked in feature UI (bidirectional baseline).
 *
 * Decision rule (docs/frontend/ant-ui-kit-strategy.md §4.1):
 * 1) Tlt equivalent exists → feature imports only @/components/ui-kit
 * 2) No equivalent → raw antd allowed until product contract justifies Tlt
 * 3) New Tlt for repeatable product behavior, not rename-only
 * 4) UI Kit never imports feature/domain
 *
 * Forbidden only when `@/components/ui-kit` has an equivalent:
 *   Button→TltButton, Input→TltTextField, InputNumber→TltNumberField,
 *   Select→TltSelect, Card→TltCard, Alert→TltAlert, Tag→TltBadge.
 * Space has no kit equivalent — not forbidden.
 *
 * Allowed: Form, Modal, Table, message, types, ConfigProvider, theme, icons, Space.
 * Feedback: appMessage/appModal from @/feedback/appFeedback (not static message).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');

/** Named antd imports that must go through @/components/ui-kit in feature UI. */
export const FORBIDDEN_ANT_PRIMITIVES = new Set([
  'Button',
  'Input',
  'InputNumber',
  'Select',
  'Card',
  'Alert',
  'Tag',
]);

const FEATURE_DIRS = [
  'pages/heatcalc',
  'pages/electrical',
  'pages/specification',
  'pages/projects',
  'components/heatcalc',
  'components/electrical',
  'components/specification',
  'components/wizard',
];

/** Extended scan roots (AF10-UIKIT-SCOPE-GATE-01). */
const EXTENDED_ROOTS = ['pages', 'components', 'hooks'];

const EXTENDED_EXCLUDE_PREFIXES = [
  'src/components/ui-kit/',
  'src/components/form-controls/',
  'src/pages/UIKitPage.tsx',
];

const BASELINE_PATH = path.join(HERE, 'antdPrimitiveBaseline.json');
const EXTENDED_BASELINE_PATH = path.join(HERE, 'antdPrimitiveExtendedBaseline.json');

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(e.name) && !e.name.endsWith('.d.ts') && !e.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/** Collect forbidden named imports from `antd` in a single source string. */
export function collectForbiddenAntdImportsFromSource(
  text: string,
  fileName = 'snippet.tsx',
  forbidden: ReadonlySet<string> = FORBIDDEN_ANT_PRIMITIVES,
): string[] {
  if (!text.includes("from 'antd'") && !text.includes('from "antd"')) return [];
  const kind = fileName.endsWith('.ts') && !fileName.endsWith('.tsx') ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const hits: string[] = [];
  sf.forEachChild(function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text !== 'antd') return;
      const clause = node.importClause;
      if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
      for (const el of clause.namedBindings.elements) {
        const name = el.propertyName?.text ?? el.name.text;
        if (forbidden.has(name)) hits.push(name);
      }
    }
    ts.forEachChild(node, visit);
  });
  return [...new Set(hits)].sort();
}

export function collectAntdPrimitiveViolations(
  srcRoot: string = SRC,
  forbidden: ReadonlySet<string> = FORBIDDEN_ANT_PRIMITIVES,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const rel of FEATURE_DIRS) {
    for (const abs of walk(path.join(srcRoot, rel))) {
      const text = fs.readFileSync(abs, 'utf8');
      const hits = collectForbiddenAntdImportsFromSource(text, abs, forbidden);
      if (hits.length) {
        const key = `src/${path.relative(srcRoot, abs).split(path.sep).join('/')}`;
        result[key] = hits;
      }
    }
  }
  return result;
}

/**
 * Extended scan: all production pages/components/hooks minus ui-kit, form-controls,
 * UIKitPage, tests/stories, and paths already covered by the core feature baseline.
 */
export function collectExtendedAntdPrimitiveViolations(
  srcRoot: string = SRC,
  coreViolations: Record<string, string[]> = collectAntdPrimitiveViolations(srcRoot),
  forbidden: ReadonlySet<string> = FORBIDDEN_ANT_PRIMITIVES,
): Record<string, string[]> {
  const coreKeys = new Set(Object.keys(coreViolations));
  // Also exclude any file under core FEATURE_DIRS even if currently clean,
  // so ownership stays with the core baseline.
  const corePathPrefixes = FEATURE_DIRS.map((d) => `src/${d}/`);
  const result: Record<string, string[]> = {};
  for (const root of EXTENDED_ROOTS) {
    for (const abs of walk(path.join(srcRoot, root))) {
      const key = `src/${path.relative(srcRoot, abs).split(path.sep).join('/')}`;
      if (EXTENDED_EXCLUDE_PREFIXES.some((p) => key === p || key.startsWith(p))) continue;
      if (corePathPrefixes.some((p) => key.startsWith(p))) continue;
      if (coreKeys.has(key)) continue;
      if (key.includes('/__tests__/') || key.includes('.stories.')) continue;
      const text = fs.readFileSync(abs, 'utf8');
      const hits = collectForbiddenAntdImportsFromSource(text, abs, forbidden);
      if (hits.length) result[key] = hits;
    }
  }
  return result;
}

export type AntdBaseline = {
  version: number;
  files: Record<string, string[]>;
};

/** Bidirectional diff: growth AND stale baseline entries fail. */
export function diffAntdPrimitiveBaseline(
  current: Record<string, string[]>,
  baseline: AntdBaseline,
): string[] {
  const violations: string[] = [];
  for (const [file, names] of Object.entries(current)) {
    const limit = new Set(baseline.files[file] ?? []);
    if (!(file in baseline.files)) {
      violations.push(`NEW_FILE ${file}: ${names.join(',')}`);
      continue;
    }
    const added = names.filter((n) => !limit.has(n));
    if (added.length) {
      violations.push(`GREW ${file}: +${added.join(',')}`);
    }
    const removed = [...limit].filter((n) => !names.includes(n));
    if (removed.length) {
      violations.push(
        `STALE_BASELINE ${file}: baseline still lists ${removed.join(',')} (no longer imported from antd)`,
      );
    }
  }
  for (const file of Object.keys(baseline.files)) {
    if (!(file in current)) {
      violations.push(
        `STALE_BASELINE_MISSING_FILE ${file}: baseline lists forbidden primitives but file has none (or was migrated)`,
      );
    }
  }
  return violations;
}

describe('antd primitive policy (AF9-UI-01)', () => {
  it('does not grow or leave stale forbidden direct Ant primitive imports in feature UI', () => {
    const current = collectAntdPrimitiveViolations();
    if (!fs.existsSync(BASELINE_PATH)) {
      fs.writeFileSync(BASELINE_PATH, JSON.stringify({ version: 1, files: current }, null, 2) + '\n');
    }
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as AntdBaseline;
    const violations = diffAntdPrimitiveBaseline(current, baseline);
    if (violations.length) {
      expect.fail(
        violations.join('\n')
          + '\nFIX: import from @/components/ui-kit, or shrink antdPrimitiveBaseline.json after migration (never raise)',
      );
    }
  });

  it('does not forbid Ant APIs that have no Tlt UI-kit equivalent (Space)', () => {
    expect(FORBIDDEN_ANT_PRIMITIVES.has('Space')).toBe(false);
    const hits = collectForbiddenAntdImportsFromSource(
      `import { Space, Button } from 'antd';\nexport const X = () => <Space><Button /></Space>;\n`,
    );
    expect(hits).toEqual(['Button']);
  });

  it('does not grow or leave stale forbidden Ant primitives in extended pages/components/hooks', () => {
    const core = collectAntdPrimitiveViolations();
    const current = collectExtendedAntdPrimitiveViolations(SRC, core);
    if (!fs.existsSync(EXTENDED_BASELINE_PATH)) {
      fs.writeFileSync(
        EXTENDED_BASELINE_PATH,
        `${JSON.stringify({ version: 1, files: current }, null, 2)}\n`,
      );
    }
    const baseline = JSON.parse(fs.readFileSync(EXTENDED_BASELINE_PATH, 'utf8')) as AntdBaseline;
    const violations = diffAntdPrimitiveBaseline(current, baseline);
    // Extended scope must never include core-owned paths.
    for (const file of Object.keys(current)) {
      if (FEATURE_DIRS.some((d) => file.startsWith(`src/${d}/`))) {
        violations.push(`EXTENDED_OVERLAP_CORE ${file}`);
      }
    }
    if (violations.length) {
      expect.fail(
        violations.join('\n')
          + '\nFIX: import from @/components/ui-kit, or shrink antdPrimitiveExtendedBaseline.json after migration (never raise)',
      );
    }
  });
});

describe('antd primitive fixtures (P1-GUARDRAIL-TRUTH-01)', () => {
  it('OLD: growth-only compare misses stale baseline entry for a migrated file', () => {
    const current: Record<string, string[]> = {
      'src/pages/demo/StillDirty.tsx': ['Button'],
    };
    const baseline: AntdBaseline = {
      version: 1,
      files: {
        'src/pages/demo/StillDirty.tsx': ['Button'],
        'src/pages/demo/AlreadyMigrated.tsx': ['Button'],
      },
    };
    // Growth-only (legacy) would only walk current → no failure for AlreadyMigrated.
    const growthOnly: string[] = [];
    for (const [file, names] of Object.entries(current)) {
      const limit = new Set(baseline.files[file] ?? []);
      const added = names.filter((n) => !limit.has(n));
      if (!(file in baseline.files)) growthOnly.push(`NEW_FILE ${file}`);
      else if (added.length) growthOnly.push(`GREW ${file}`);
    }
    expect(growthOnly).toEqual([]);
  });

  it('FIXED: removed Ant primitive baseline entry → stale-baseline failure', () => {
    const current: Record<string, string[]> = {
      'src/pages/demo/StillDirty.tsx': ['Button'],
    };
    const baseline: AntdBaseline = {
      version: 1,
      files: {
        'src/pages/demo/StillDirty.tsx': ['Button'],
        'src/pages/demo/AlreadyMigrated.tsx': ['Button'],
      },
    };
    const violations = diffAntdPrimitiveBaseline(current, baseline);
    expect(violations.some((v) => v.includes('STALE_BASELINE_MISSING_FILE') && v.includes('AlreadyMigrated'))).toBe(
      true,
    );
  });

  it('FIXED: stale name on a file that dropped one primitive fails', () => {
    const current = { 'src/pages/demo/X.tsx': ['Button'] };
    const baseline: AntdBaseline = {
      version: 1,
      files: { 'src/pages/demo/X.tsx': ['Button', 'Tag'] },
    };
    const violations = diffAntdPrimitiveBaseline(current, baseline);
    expect(violations.some((v) => v.includes('STALE_BASELINE') && v.includes('Tag'))).toBe(true);
  });
});
