/**
 * AF9-UI-01: direct Ant primitives with Tlt equivalents are blocked in feature UI.
 * Allowed: Form, Modal, Table, message, types, ConfigProvider, theme, icons usage.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../..');

/** Named antd imports that must go through @/components/ui-kit in feature UI. */
const FORBIDDEN = new Set(['Button', 'Input', 'InputNumber', 'Select', 'Card', 'Alert', 'Tag', 'Space']);

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

const BASELINE_PATH = path.join(HERE, 'antdPrimitiveBaseline.json');

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

function collectViolations(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const rel of FEATURE_DIRS) {
    for (const abs of walk(path.join(SRC, rel))) {
      const text = fs.readFileSync(abs, 'utf8');
      if (!text.includes("from 'antd'") && !text.includes('from "antd"')) continue;
      const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, abs.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const hits: string[] = [];
      sf.forEachChild(function visit(node) {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          if (node.moduleSpecifier.text !== 'antd') return;
          const clause = node.importClause;
          if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
          for (const el of clause.namedBindings.elements) {
            const name = el.propertyName?.text ?? el.name.text;
            if (FORBIDDEN.has(name)) hits.push(name);
          }
        }
        ts.forEachChild(node, visit);
      });
      if (hits.length) {
        const key = `src/${path.relative(SRC, abs).split(path.sep).join('/')}`;
        result[key] = [...new Set(hits)].sort();
      }
    }
  }
  return result;
}

describe('antd primitive policy (AF9-UI-01)', () => {
  it('does not grow forbidden direct Ant primitive imports in feature UI', () => {
    const current = collectViolations();
    if (!fs.existsSync(BASELINE_PATH)) {
      fs.writeFileSync(BASELINE_PATH, JSON.stringify({ version: 1, files: current }, null, 2) + '\n');
    }
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as {
      files: Record<string, string[]>;
    };
    const violations: string[] = [];
    for (const [file, names] of Object.entries(current)) {
      const limit = new Set(baseline.files[file] ?? []);
      const added = names.filter((n) => !limit.has(n));
      if (!(file in baseline.files)) {
        violations.push(`NEW_FILE ${file}: ${names.join(',')}`);
      } else if (added.length) {
        violations.push(`GREW ${file}: +${added.join(',')}`);
      }
    }
    // shrink-only: missing files/names OK
    if (violations.length) {
      expect.fail(violations.join('\n') + '\nFIX: import from @/components/ui-kit or update baseline after migration');
    }
  });
});
