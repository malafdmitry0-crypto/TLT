/**
 * Static isolation scanners for wizard dual-form islands.
 * Used by architecture tests and optional dev/runtime checks.
 * Throws WizardIsolationError with actionable FIX text for AI/agents.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WIZARD_FORBIDDEN_IMPORT_EDGES,
  WIZARD_ISLANDS,
  WIZARD_SHELL_FORBIDDEN_CSS_PATTERNS,
  WizardIsolationError,
  type WizardIslandDefinition,
  type WizardIslandId,
} from './wizardIslands';

const WIZARD_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const FRONTEND_SRC = path.resolve(WIZARD_DIR, '../..');
const STYLES_CSS = path.resolve(FRONTEND_SRC, 'styles.css');

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function islandCssPath(island: WizardIslandDefinition): string {
  return path.join(WIZARD_DIR, island.cssFile);
}

function islandComponentPath(island: WizardIslandDefinition): string {
  return path.join(WIZARD_DIR, island.componentFile);
}

/** Strip CSS comments for selector scanning. */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extract rule selectors (architecture gate, not a full CSS parser).
 * Walks brace depth so @media bodies are included.
 */
function extractCssSelectors(css: string): string[] {
  const cleaned = stripCssComments(css);
  const selectors: string[] = [];
  let i = 0;
  let depth = 0;
  let pending = '';

  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (ch === '{') {
      const raw = pending.trim();
      if (depth === 0 || depth >= 1) {
        // at depth 0: top-level rule or @media prelude
        // at depth >=1: rules inside @media
        if (raw && !raw.startsWith('@')) {
          for (const part of raw.split(',')) {
            const sel = part.trim();
            if (sel) selectors.push(sel);
          }
        }
      }
      pending = '';
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      pending = '';
      i += 1;
      continue;
    }
    pending += ch;
    i += 1;
  }
  return selectors;
}

function selectorBelongsToIsland(selector: string, rootClass: string): boolean {
  // Allowed: .root, .root--mod, .root .child, .root.x, .root:hover, .root > .x
  // Also html.dark .root ... optional prefix of simple elements/pseudo — require rootClass token.
  const rootToken = `.${rootClass}`;
  if (!selector.includes(rootToken)) return false;

  // Disallow other islands' roots in same selector (cross-coupling)
  for (const other of WIZARD_ISLANDS) {
    if (other.rootClass === rootClass) continue;
    if (selector.includes(`.${other.rootClass}`)) return false;
  }
  return true;
}

/** Scan one island CSS file: every selector must be under its root. */
export function assertIslandCssIsolation(islandId?: WizardIslandId): void {
  const islands = islandId
    ? WIZARD_ISLANDS.filter((i) => i.id === islandId)
    : WIZARD_ISLANDS;

  for (const island of islands) {
    const cssPath = islandCssPath(island);
    if (!fs.existsSync(cssPath)) {
      throw new WizardIsolationError({
        code: 'MISSING_ISLAND_CSS',
        island: island.id,
        message: `Island CSS missing: ${island.cssFile}`,
        fix: `Create ${island.cssFile} next to ${island.componentFile} with all selectors under .${island.rootClass}.`,
      });
    }

    const css = read(cssPath);
    const selectors = extractCssSelectors(css);
    if (selectors.length === 0) {
      throw new WizardIsolationError({
        code: 'EMPTY_ISLAND_CSS',
        island: island.id,
        message: `Island CSS has no rules: ${island.cssFile}`,
        fix: `Add styles under .${island.rootClass} only.`,
      });
    }

    const bad = selectors.filter((sel) => !selectorBelongsToIsland(sel, island.rootClass));
    if (bad.length > 0) {
      throw new WizardIsolationError({
        code: 'CSS_SELECTOR_OUTSIDE_ROOT',
        island: island.id,
        message:
          `${island.cssFile} has selectors outside .${island.rootClass}:\n` +
          bad.slice(0, 8).map((s) => `  • ${s}`).join('\n') +
          (bad.length > 8 ? `\n  … +${bad.length - 8} more` : ''),
        fix:
          `Every selector in ${island.cssFile} must include .${island.rootClass}. ` +
          `Do not style other islands or global .ant-form-item from this file.`,
      });
    }

    // Cross-@import between islands
    for (const other of WIZARD_ISLANDS) {
      if (other.id === island.id) continue;
      if (css.includes(other.cssFile) || css.includes(`@import`) && css.includes(other.rootClass)) {
        if (css.includes(other.cssFile)) {
          throw new WizardIsolationError({
            code: 'CSS_CROSS_IMPORT',
            island: island.id,
            message: `${island.cssFile} imports or references ${other.cssFile}.`,
            fix: `Remove cross-island CSS import. Duplicate tokens if needed; do not share files.`,
          });
        }
      }
    }
  }
}

/** Component file must import its own island CSS and not other islands' CSS/components. */
export function assertIslandComponentImports(islandId?: WizardIslandId): void {
  const islands = islandId
    ? WIZARD_ISLANDS.filter((i) => i.id === islandId)
    : WIZARD_ISLANDS;

  const fileByIsland = Object.fromEntries(
    WIZARD_ISLANDS.map((i) => [i.id, i.componentFile]),
  ) as Record<WizardIslandId, string>;

  for (const island of islands) {
    const compPath = islandComponentPath(island);
    if (!fs.existsSync(compPath)) {
      throw new WizardIsolationError({
        code: 'MISSING_ISLAND_COMPONENT',
        island: island.id,
        message: `Island component missing: ${island.componentFile}`,
        fix: `Restore ${island.componentFile}.`,
      });
    }
    const src = read(compPath);

    if (!src.includes(`'./${island.cssFile}'`) && !src.includes(`"./${island.cssFile}"`)) {
      throw new WizardIsolationError({
        code: 'MISSING_CSS_IMPORT',
        island: island.id,
        message: `${island.componentFile} does not import ./${island.cssFile}`,
        fix: `Add: import './${island.cssFile}';`,
      });
    }

    // Only real import/require lines (not comments mentioning other islands)
    const importLines = src
      .split('\n')
      .filter((line) => /^\s*import\s/.test(line) || /require\s*\(/.test(line));

    for (const edge of WIZARD_FORBIDDEN_IMPORT_EDGES) {
      if (edge.from !== island.id) continue;
      const targetFile = fileByIsland[edge.to];
      const targetBase = targetFile.replace(/\.tsx?$/, '');
      const targetCss = WIZARD_ISLANDS.find((i) => i.id === edge.to)!.cssFile;
      const hits = importLines.some(
        (line) =>
          line.includes(targetFile) ||
          line.includes(`./${targetBase}`) ||
          line.includes(`./${targetCss}`) ||
          line.includes(targetCss),
      );
      if (hits) {
        throw new WizardIsolationError({
          code: 'FORBIDDEN_ISLAND_IMPORT',
          island: island.id,
          message: `${island.componentFile} imports island "${edge.to}" (${targetFile} / ${targetCss}). ${edge.reason}`,
          fix: `Remove the import. Compose islands only in ObjectWizard / ObjectWizardWidePanel shell.`,
        });
      }
    }

    // data-protected must match registry
    if (!src.includes(`data-protected="${island.dataProtected}"`) && island.id !== 'cable-algorithm') {
      // cable uses data-testid primarily; heat + table use data-protected
      if (island.protected) {
        throw new WizardIsolationError({
          code: 'MISSING_DATA_PROTECTED',
          island: island.id,
          message: `${island.componentFile} missing data-protected="${island.dataProtected}"`,
          fix: `Set data-protected="${island.dataProtected}" on the island root element.`,
        });
      }
    }
  }
}

/** Shell styles.css must not contain known leak patterns. */
export function assertShellCssDoesNotLeakIntoIslands(): void {
  if (!fs.existsSync(STYLES_CSS)) {
    throw new WizardIsolationError({
      code: 'MISSING_STYLES_CSS',
      message: 'frontend/src/styles.css not found',
      fix: 'Restore styles.css.',
    });
  }
  const css = stripCssComments(read(STYLES_CSS));

  for (const rule of WIZARD_SHELL_FORBIDDEN_CSS_PATTERNS) {
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(css);
    if (match) {
      // Allow if the matched selector also scopes to an island root on the same line/selector
      const snippet = match[0];
      const scopedOk =
        snippet.includes('.heat-object-fields') ||
        snippet.includes('.insulation-layers-table') ||
        snippet.includes('.object-wizard-cable-panel');
      if (scopedOk) continue;

      throw new WizardIsolationError({
        code: rule.id,
        message: rule.message + `\nOffending snippet: ${snippet.slice(0, 120)}`,
        fix: rule.fix,
      });
    }
  }

  // Extra: broad "wide-panel .ant-form-item" without island
  const broadFormItem = /^\s*\.inline-object-form--wide\s+\.object-wizard-wide-panel\s+\.ant-form-item\s*,/m;
  if (broadFormItem.test(css)) {
    // Still present for legacy shell — must have neutralizing reset after it.
    const hasReset =
      css.includes('.heat-object-fields .ant-form-item') &&
      css.includes('.insulation-layers-table .ant-form-item');
    if (!hasReset) {
      throw new WizardIsolationError({
        code: 'WIDE_PANEL_FORM_ITEM_WITHOUT_RESET',
        message:
          'styles.css has .object-wizard-wide-panel .ant-form-item without island resets.',
        fix:
          'Add resets under .heat-object-fields and .insulation-layers-table, or delete the broad rule.',
      });
    }
  }
}

/** Run full static isolation suite. Throws WizardIsolationError on first failure. */
export function assertWizardIsolationAll(): void {
  assertIslandCssIsolation();
  assertIslandComponentImports();
  assertShellCssDoesNotLeakIntoIslands();
}

/** Collect all failures (for tests that want a full report). */
export function collectWizardIsolationViolations(): WizardIsolationError[] {
  const errors: WizardIsolationError[] = [];
  const runners = [
    () => assertIslandCssIsolation(),
    () => assertIslandComponentImports(),
    () => assertShellCssDoesNotLeakIntoIslands(),
  ];
  for (const run of runners) {
    try {
      run();
    } catch (e) {
      if (e instanceof WizardIsolationError) errors.push(e);
      else {
        errors.push(
          new WizardIsolationError({
            code: 'UNEXPECTED',
            message: e instanceof Error ? e.message : String(e),
            fix: 'See stack trace; unexpected non-isolation error during scan.',
          }),
        );
      }
    }
  }
  return errors;
}
