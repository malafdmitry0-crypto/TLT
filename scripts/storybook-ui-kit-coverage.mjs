#!/usr/bin/env node
/**
 * Storybook UI-kit coverage check — public barrel exports vs CSF story files.
 *
 * Ensures every first-class public component from
 * `frontend/src/components/ui-kit/index.ts` has a dedicated `*.stories.tsx`
 * so Storybook MCP can list it as its own component ID.
 *
 * Usage:
 *   node scripts/storybook-ui-kit-coverage.mjs
 *   node scripts/storybook-ui-kit-coverage.mjs --json
 *   node scripts/storybook-ui-kit-coverage.mjs --strict   # exit 1 on gaps
 *
 * Exit codes:
 *   0 — full coverage (or report-only without --strict)
 *   1 — gaps found when --strict, or script error
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const UI_KIT = join(ROOT, 'frontend', 'src', 'components', 'ui-kit');
const INDEX = join(UI_KIT, 'index.ts');

const strict = process.argv.includes('--strict');
const asJson = process.argv.includes('--json');

/** Non-component type-only / style exports — not expected as story titles. */
const SKIP_EXPORTS = new Set([
  // types only are filtered by export kind below
]);

/**
 * Map public component export name → expected story file basenames (without ext).
 * Default: same as export name.
 */
const STORY_FILE_ALIASES = {
  // form controls live under form-controls/ but stories sit in ui-kit/
};

function readIndexExports(source) {
  const components = new Set();
  // export { default as Name } / export { Name, ... }
  const namedBlock = /export\s*\{([^}]+)\}/g;
  let match;
  while ((match = namedBlock.exec(source))) {
    const body = match[1];
    for (const part of body.split(',')) {
      const cleaned = part.replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!cleaned || cleaned.startsWith('type ')) continue;
      // `default as Foo` or `Foo` or `Foo as Bar`
      const asMatch = cleaned.match(/(?:default\s+as\s+)?(\w+)(?:\s+as\s+(\w+))?$/);
      if (!asMatch) continue;
      const name = asMatch[2] ?? asMatch[1];
      if (name === 'type' || name === 'default') continue;
      // Skip pure type re-exports written as `type Foo` already handled;
      // also skip if line was `type X` inside braces with multi-line
      if (/^type\s/.test(cleaned)) continue;
      components.add(name);
    }
  }
  // export { type Foo } — strip type-only from components
  const typeOnly = /export\s*\{[^}]*\btype\s+(\w+)/g;
  // Better: re-scan and remove type-only names from multi-export blocks
  const typeExportBlocks = source.matchAll(/export\s*(type\s*)?\{([^}]+)\}/g);
  for (const block of typeExportBlocks) {
    const isTypeBlock = Boolean(block[1]);
    const body = block[2];
    for (const part of body.split(',')) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const typeNamed = cleaned.match(/^type\s+(\w+)/);
      if (typeNamed || isTypeBlock) {
        const n = typeNamed ? typeNamed[1] : cleaned.match(/(\w+)(?:\s+as\s+\w+)?$/)?.[1];
        if (n) components.delete(n);
      }
    }
  }
  for (const skip of SKIP_EXPORTS) components.delete(skip);
  return [...components].sort();
}

function listStoryFiles() {
  return readdirSync(UI_KIT)
    .filter((name) => /\.stories\.tsx?$/.test(name))
    .map((name) => name.replace(/\.stories\.tsx?$/, ''));
}

function storyCovers(component, storyBasenames) {
  const aliases = STORY_FILE_ALIASES[component] ?? [component];
  return aliases.some((base) => storyBasenames.includes(base));
}

function main() {
  const indexSource = readFileSync(INDEX, 'utf8');
  const components = readIndexExports(indexSource);
  const storyBasenames = listStoryFiles();

  const covered = [];
  const missing = [];
  for (const name of components) {
    if (storyCovers(name, storyBasenames)) covered.push(name);
    else missing.push(name);
  }

  // Story files that do not map to a public export (informational)
  const publicSet = new Set(components);
  const orphanStories = storyBasenames.filter((base) => !publicSet.has(base));

  const ratio = components.length === 0 ? 1 : covered.length / components.length;
  const report = {
    publicComponents: components.length,
    storyFiles: storyBasenames.length,
    covered: covered.length,
    missing: missing.length,
    coveragePct: Math.round(ratio * 1000) / 10,
    coveredComponents: covered,
    missingComponents: missing,
    orphanStoryFiles: orphanStories,
    storyBasenames,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Storybook UI-kit coverage (public barrel → CSF)');
    console.log(`  public components: ${report.publicComponents}`);
    console.log(`  story files:       ${report.storyFiles}`);
    console.log(`  covered:           ${report.covered} (${report.coveragePct}%)`);
    if (covered.length) {
      console.log(`  ok: ${covered.join(', ')}`);
    }
    if (missing.length) {
      console.log(`  MISSING stories: ${missing.join(', ')}`);
      console.log(
        '  → add frontend/src/components/ui-kit/<Name>.stories.tsx (title: UI Kit/<Name>)',
      );
    } else {
      console.log('  MISSING stories: (none)');
    }
    if (orphanStories.length) {
      console.log(`  story files without barrel export: ${orphanStories.join(', ')}`);
    }
  }

  if (strict && missing.length > 0) {
    process.exit(1);
  }
}

main();
