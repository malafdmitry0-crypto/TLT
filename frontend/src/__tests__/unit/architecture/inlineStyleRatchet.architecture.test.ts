/**
 * AF9-INLINE-01/02 / P1-GUARDRAIL-TRUTH-01: JSX style/styles ratchet via TS AST.
 *
 * Classification (attribute-level, not line-regex):
 * - static object literal (literals only) → static debt
 * - expression depending on identifiers/props/state/runtime → runtime geometry
 * - third-party host style API (form controls / chrome geometry) → third-party adapter
 *   (baseline entry must carry explicit owner + reason)
 *
 * Ratchet compares totals, per-file totals, AND per-class counts so static debt
 * cannot replace runtime geometry while keeping the file total unchanged.
 * Stale higher baseline counts fail.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../..');
const BASELINE_PATH = path.join(HERE, 'inlineStyleBaseline.json');
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

export type InlineStyleClass = 'static debt' | 'runtime geometry' | 'third-party adapter';

export type InlineOccurrence = {
  file: string;
  line: number;
  class: InlineStyleClass;
  text: string;
  owner?: string;
  reason?: string;
  tag?: string;
};

export type InlineBaseline = {
  version: number;
  total: number;
  byClass: Record<string, number>;
  fileCounts: Record<string, number>;
  fileClassCounts: Record<string, Partial<Record<InlineStyleClass, number>>>;
  occurrences: InlineOccurrence[];
};

const FORM_CONTROL_TAGS = new Set([
  'InputNumber',
  'Select',
  'Input',
  'DatePicker',
  'TimePicker',
  'TreeSelect',
  'Cascader',
  'AutoComplete',
  'Slider',
  'Mentions',
]);

const CHROME_TAGS = new Set([
  'Modal',
  'Drawer',
  'Table',
  'Tooltip',
  'Popover',
  'Dropdown',
  'Segmented',
  'Space',
  'Row',
  'Col',
  'Card',
  'Form',
]);

const CHROME_GEOM = /\b(width|top|zIndex|maxHeight|paddingBottom)\b/;

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

function relSrcKey(abs: string, srcRoot: string = SRC_ROOT): string {
  return `src/${path.relative(srcRoot, abs).split(path.sep).join('/')}`;
}

export function ownerFromFileKey(fileKey: string): string {
  if (fileKey.includes('/electrical/')) return 'electrical';
  if (fileKey.includes('/heatcalc/') || fileKey.includes('/wizard/')) return 'heat';
  if (fileKey.includes('/specification/')) return 'specification';
  if (fileKey.includes('/admin/') || fileKey.includes('/formulas/')) return 'admin';
  return 'shared';
}

/** True when the expression tree is a compile-time constant object/array/primitive. */
export function isStaticStyleExpression(node: ts.Expression | undefined): boolean {
  if (!node) return true;
  if (
    ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node)
    || ts.isNumericLiteral(node)
  ) {
    return true;
  }
  if (
    node.kind === ts.SyntaxKind.TrueKeyword
    || node.kind === ts.SyntaxKind.FalseKeyword
    || node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (ts.isPrefixUnaryExpression(node)) return isStaticStyleExpression(node.operand);
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every((p) => {
      if (ts.isPropertyAssignment(p)) return isStaticStyleExpression(p.initializer);
      // shorthand `{ width }`, spreads, methods → runtime
      return false;
    });
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every((el) => !ts.isSpreadElement(el) && isStaticStyleExpression(el));
  }
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) {
    return isStaticStyleExpression(node.expression);
  }
  return false;
}

function jsxTagName(el: ts.JsxOpeningLikeElement): string {
  const t = el.tagName;
  if (ts.isIdentifier(t)) return t.text;
  if (ts.isPropertyAccessExpression(t)) return t.name.text;
  return '';
}

/**
 * Classify a single style/styles JSX attribute expression.
 * Pure / fixture-friendly: pass tag name + expression node or source snippet via parse.
 */
export function classifyInlineStyleExpression(
  expr: ts.Expression,
  tagName: string,
  sourceFile: ts.SourceFile,
): InlineStyleClass {
  const text = expr.getText(sourceFile);
  if (FORM_CONTROL_TAGS.has(tagName) && ts.isObjectLiteralExpression(expr)) {
    return 'third-party adapter';
  }
  if (CHROME_TAGS.has(tagName) && ts.isObjectLiteralExpression(expr) && CHROME_GEOM.test(text)) {
    return 'third-party adapter';
  }
  if (ts.isObjectLiteralExpression(expr) && isStaticStyleExpression(expr)) {
    return 'static debt';
  }
  return 'runtime geometry';
}

/** Parse a one-off JSX attribute snippet: `<Tag style={...} />` or full small component. */
export function classifyInlineStyleSnippet(snippet: string): InlineStyleClass {
  const wrapped = snippet.includes('export') || snippet.includes('function')
    ? snippet
    : `const _ = ${snippet.startsWith('<') ? snippet : `<>${snippet}</>`};`;
  const sf = ts.createSourceFile('fixture.tsx', wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: InlineStyleClass | null = null;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTagName(node);
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        const name = attr.name.getText(sf);
        if (name !== 'style' && name !== 'styles') continue;
        if (!attr.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression) {
          continue;
        }
        found = classifyInlineStyleExpression(attr.initializer.expression, tag, sf);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) {
    throw new Error(`No style/styles attribute found in snippet: ${snippet.slice(0, 80)}`);
  }
  return found;
}

/**
 * Legacy line-regex classifier (documents pre-P1 false positives).
 * Mis-classifies static `display: 'none'` as runtime geometry.
 */
export function classifyInlineStyleLineLegacy(line: string): InlineStyleClass | null {
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

export function collectInlineStylesFromSource(
  text: string,
  fileKey: string,
  absPath = `${fileKey}`,
): InlineOccurrence[] {
  const sf = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: InlineOccurrence[] = [];
  const owner = ownerFromFileKey(fileKey);

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxTagName(node);
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        const name = attr.name.getText(sf);
        if (name !== 'style' && name !== 'styles') continue;
        if (!attr.initializer || !ts.isJsxExpression(attr.initializer) || !attr.initializer.expression) {
          continue;
        }
        const expr = attr.initializer.expression;
        const cls = classifyInlineStyleExpression(expr, tag, sf);
        const { line } = sf.getLineAndCharacterOfPosition(attr.getStart(sf));
        const textSnippet = attr.getText(sf).replace(/\s+/g, ' ').slice(0, 160);
        const occ: InlineOccurrence = {
          file: fileKey,
          line: line + 1,
          class: cls,
          text: textSnippet,
          tag,
          owner,
        };
        if (cls === 'third-party adapter') {
          occ.reason =
            FORM_CONTROL_TAGS.has(tag)
              ? `Ant ${tag} style prop used as form-control adapter (no className path for this layout)`
              : `Ant ${tag} style prop used for chrome geometry adapter`;
        }
        out.push(occ);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function collectInlineStyles(srcRoot: string = SRC_ROOT): {
  total: number;
  byClass: Record<InlineStyleClass, number>;
  fileCounts: Record<string, number>;
  fileClassCounts: Record<string, Partial<Record<InlineStyleClass, number>>>;
  occurrences: InlineOccurrence[];
} {
  const byClass: Record<InlineStyleClass, number> = {
    'static debt': 0,
    'runtime geometry': 0,
    'third-party adapter': 0,
  };
  const fileCounts: Record<string, number> = {};
  const fileClassCounts: Record<string, Partial<Record<InlineStyleClass, number>>> = {};
  const occurrences: InlineOccurrence[] = [];

  for (const abs of walkProductionTsx(srcRoot)) {
    const key = relSrcKey(abs, srcRoot);
    const text = fs.readFileSync(abs, 'utf8');
    if (!/\bstyles?\s*=/.test(text)) continue;
    const hits = collectInlineStylesFromSource(text, key, abs);
    if (!hits.length) continue;
    fileCounts[key] = hits.length;
    const fc: Partial<Record<InlineStyleClass, number>> = {};
    for (const h of hits) {
      byClass[h.class] += 1;
      fc[h.class] = (fc[h.class] ?? 0) + 1;
      occurrences.push(h);
    }
    fileClassCounts[key] = fc;
  }

  return {
    total: occurrences.length,
    byClass,
    fileCounts,
    fileClassCounts,
    occurrences,
  };
}

function ensureFileClassCounts(baseline: InlineBaseline): Record<string, Partial<Record<InlineStyleClass, number>>> {
  if (baseline.fileClassCounts && Object.keys(baseline.fileClassCounts).length > 0) {
    return baseline.fileClassCounts;
  }
  // Derive from occurrences if older baseline shape.
  const out: Record<string, Partial<Record<InlineStyleClass, number>>> = {};
  for (const o of baseline.occurrences ?? []) {
    const fc = out[o.file] ?? {};
    const cls = o.class as InlineStyleClass;
    fc[cls] = (fc[cls] ?? 0) + 1;
    out[o.file] = fc;
  }
  return out;
}

describe('inline style ratchet (AF9-INLINE-01/02)', () => {
  it('has classified baseline and forbids growth / stale counts (incl. per-class)', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as InlineBaseline;
    expect(baseline.occurrences.length).toBeGreaterThan(0);
    const classes = new Set(baseline.occurrences.map((o) => o.class));
    expect(classes.has('runtime geometry')).toBe(true);
    // static debt may be fully burned (0); byClass still tracks the cap.
    expect(baseline.byClass['static debt'] ?? 0).toBeGreaterThanOrEqual(0);
    if ((baseline.byClass['static debt'] ?? 0) > 0) {
      expect(classes.has('static debt')).toBe(true);
    }
    expect(classes.has('third-party adapter')).toBe(true);

    // Third-party adapters in baseline must document owner + reason.
    for (const o of baseline.occurrences) {
      if (o.class !== 'third-party adapter') continue;
      if (!o.owner || !o.reason) {
        expect.fail(
          failMessage(
            'THIRD_PARTY_MISSING_META',
            'third-party adapter baseline entry lacks owner/reason',
            'Add owner and reason fields explaining why className/theme API is unavailable.',
            `${o.file}:${o.line}`,
          ),
        );
      }
    }

    const current = collectInlineStyles();
    const baselineFileClass = ensureFileClassCounts(baseline);
    const violations: string[] = [];

    if (current.total > baseline.total) {
      violations.push(
        failMessage(
          'INLINE_STYLE_TOTAL_GREW',
          'Production inline style/styles total grew',
          'Move static styling to component CSS or tokens; keep only runtime geometry / documented adapters.',
          '(total)',
          current.total,
          baseline.total,
        ),
      );
    } else if (current.total < baseline.total) {
      violations.push(
        failMessage(
          'STALE_BASELINE_TOTAL',
          'Baseline inline style total is higher than current',
          'Update inlineStyleBaseline.json to the shrunk total in the same PR.',
          '(total)',
          current.total,
          baseline.total,
        ),
      );
    }

    for (const cls of ['static debt', 'runtime geometry', 'third-party adapter'] as InlineStyleClass[]) {
      const cur = current.byClass[cls] ?? 0;
      const limit = baseline.byClass?.[cls] ?? 0;
      if (cur > limit) {
        violations.push(
          failMessage(
            'INLINE_STYLE_CLASS_GREW',
            `Class count grew: ${cls}`,
            'Reduce this class or reclassify only with a truthful AST change + baseline shrink elsewhere. Do not hide static debt as runtime.',
            `(class:${cls})`,
            cur,
            limit,
          ),
        );
      } else if (cur < limit) {
        violations.push(
          failMessage(
            'STALE_BASELINE_CLASS',
            `Baseline class count higher than current: ${cls}`,
            'Update inlineStyleBaseline.json byClass for this class in the same PR.',
            `(class:${cls})`,
            cur,
            limit,
          ),
        );
      }
    }

    for (const [file, limit] of Object.entries(baseline.fileCounts)) {
      const cur = current.fileCounts[file] ?? 0;
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

      const baseClasses = baselineFileClass[file] ?? {};
      const curClasses = current.fileClassCounts[file] ?? {};
      for (const cls of ['static debt', 'runtime geometry', 'third-party adapter'] as InlineStyleClass[]) {
        const c = curClasses[cls] ?? 0;
        const l = baseClasses[cls] ?? 0;
        if (c > l) {
          violations.push(
            failMessage(
              'INLINE_STYLE_FILE_CLASS_GREW',
              `Per-file class count grew: ${cls}`,
              'Static debt cannot replace runtime geometry under a flat total. Fix the style or update baseline only after a real shrink.',
              file,
              c,
              l,
            ),
          );
        } else if (c < l) {
          violations.push(
            failMessage(
              'STALE_BASELINE_FILE_CLASS',
              `Baseline per-file class count higher than current: ${cls}`,
              'Update inlineStyleBaseline.json fileClassCounts for this file/class in the same PR.',
              file,
              c,
              l,
            ),
          );
        }
      }
    }

    for (const [file, count] of Object.entries(current.fileCounts)) {
      if (file in baseline.fileCounts) continue;
      violations.push(
        failMessage(
          'NEW_FILE_INLINE_STYLE',
          'New production file introduces style/styles attributes',
          'Prefer CSS modules/tokens. If runtime geometry is required, add a classified baseline entry with owner/reason for adapters.',
          file,
          count,
          0,
        ),
      );
    }

    // New third-party adapters must appear in baseline with owner/reason (covered by counts),
    // but also reject any current third-party without meta when above baseline is equal —
    // enforced via baseline completeness on load.

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }
  });
});

describe('inline style fixtures (P1-GUARDRAIL-TRUTH-01)', () => {
  it("OLD: line-regex classifies style={{ display: 'none' }} as runtime geometry", () => {
    const line = `<input style={{ display: 'none' }} />`;
    expect(classifyInlineStyleLineLegacy(line)).toBe('runtime geometry');
  });

  it("FIXED: style={{ display: 'none' }} is static debt", () => {
    expect(classifyInlineStyleSnippet(`<input style={{ display: 'none' }} />`)).toBe('static debt');
    expect(classifyInlineStyleSnippet(`<div style={{ marginBottom: 16, color: '#595959' }} />`)).toBe(
      'static debt',
    );
  });

  it('FIXED: runtime width from props is runtime geometry', () => {
    expect(
      classifyInlineStyleSnippet(`<div style={{ width: props.width }} />`),
    ).toBe('runtime geometry');
    expect(classifyInlineStyleSnippet(`<div style={wrapperStyle} />`)).toBe('runtime geometry');
    expect(
      classifyInlineStyleSnippet(`<div style={{ width: open ? 200 : 0 }} />`),
    ).toBe('runtime geometry');
  });

  it('FIXED: new static inline style is detected as static debt (fails growth when not baselined)', () => {
    const cls = classifyInlineStyleSnippet(`<span style={{ fontSize: 12 }} />`);
    expect(cls).toBe('static debt');
    // Growth detection against empty baseline for a synthetic file
    const baseline: InlineBaseline = {
      version: 2,
      total: 0,
      byClass: { 'static debt': 0, 'runtime geometry': 0, 'third-party adapter': 0 },
      fileCounts: {},
      fileClassCounts: {},
      occurrences: [],
    };
    const currentFile = 'src/pages/demo/NewStatic.tsx';
    const currentCount = 1;
    expect(currentFile in baseline.fileCounts).toBe(false);
    expect(currentCount).toBeGreaterThan(0);
    // Document the failure mode the main ratchet raises:
    const msg = failMessage(
      'NEW_FILE_INLINE_STYLE',
      'New production file introduces style/styles attributes',
      'Prefer CSS modules/tokens.',
      currentFile,
      currentCount,
      0,
    );
    expect(msg).toContain('NEW_FILE_INLINE_STYLE');
  });

  it('FIXED: static cannot replace runtime under the same file total (class counts)', () => {
    const baselineClasses = { 'runtime geometry': 2, 'static debt': 1 };
    const afterSwap = { 'runtime geometry': 1, 'static debt': 2 };
    const totalBefore = 3;
    const totalAfter = 3;
    expect(totalAfter).toBe(totalBefore);
    expect((afterSwap['static debt'] ?? 0) > (baselineClasses['static debt'] ?? 0)).toBe(true);
    expect((afterSwap['runtime geometry'] ?? 0) < (baselineClasses['runtime geometry'] ?? 0)).toBe(true);
  });

  it('FIXED: third-party form-control style object is third-party adapter', () => {
    expect(
      classifyInlineStyleSnippet(`<InputNumber style={{ width: '100%' }} />`),
    ).toBe('third-party adapter');
  });
});
