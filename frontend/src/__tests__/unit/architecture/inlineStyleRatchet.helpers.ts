/**
 * AF9-INLINE-01/02 / P1-GUARDRAIL-TRUTH-01: JSX style/styles ratchet helpers (TS AST).
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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRC_ROOT = path.resolve(HERE, '../../..');
export const BASELINE_PATH = path.join(HERE, 'inlineStyleBaseline.json');
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

export function failMessage(
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

export function ensureFileClassCounts(
  baseline: InlineBaseline,
): Record<string, Partial<Record<InlineStyleClass, number>>> {
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
