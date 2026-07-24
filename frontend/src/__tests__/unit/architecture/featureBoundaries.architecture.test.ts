/**
 * Architecture gate: feature namespaces stay isolated for agent-safe edits.
 * Failures include FIX lines for AI agents.
 *
 * Rules:
 * - pages/heatcalc  ✗→ pages/electrical
 * - pages/electrical ✗→ pages/heatcalc
 * - components/** may only import pages/** from an allowlist (legacy inverted deps)
 *
 * See: docs/frontend/README.md, docs/frontend/agent-development-standard.md
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

/**
 * Legacy inverted deps: components → pages.
 * Target: empty set. Do not grow; shrink on each electrical/layout slice.
 * 2026-07-23: pure models → domain/electrical; Sidebar → hooks/useLegacyElectricalVariantContext.
 */
const COMPONENTS_TO_PAGES_ALLOWLIST = new Set<string>([]);

function walkTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...walkTsFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function relSrc(abs: string): string {
  return path.relative(SRC_ROOT, abs).split(path.sep).join('/');
}

function collectImports(fileAbs: string): string[] {
  const text = fs.readFileSync(fileAbs, 'utf8');
  const imports: string[] = [];
  // Match: from '@/...' and from './...' / '../...'
  const re = /from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

function failMessage(code: string, message: string, fix: string, file: string): string {
  return (
    `[FeatureBoundaryError:${code}] ${message}\n` +
    `FILE: ${file}\n` +
    `FIX: ${fix}`
  );
}

describe('feature boundaries (architecture)', () => {
  it('heatcalc does not import electrical feature', () => {
    const heatDir = path.join(SRC_ROOT, 'pages/heatcalc');
    const violations: string[] = [];
    for (const file of walkTsFiles(heatDir)) {
      for (const spec of collectImports(file)) {
        if (spec.includes('@/pages/electrical') || spec.includes('pages/electrical')) {
          violations.push(
            failMessage(
              'HEAT_IMPORTS_ELEC',
              `heatcalc imports electrical: ${spec}`,
              'Move shared pure helper to domain/ types/ or utils with a neutral name; do not couple heat↔elec features.',
              relSrc(file),
            ),
          );
        }
      }
    }
    if (violations.length) {
      expect.fail(violations.join('\n\n'));
    }
  });

  it('electrical does not import heatcalc feature', () => {
    const elecDir = path.join(SRC_ROOT, 'pages/electrical');
    const violations: string[] = [];
    for (const file of walkTsFiles(elecDir)) {
      for (const spec of collectImports(file)) {
        if (spec.includes('@/pages/heatcalc') || spec.includes('pages/heatcalc')) {
          violations.push(
            failMessage(
              'ELEC_IMPORTS_HEAT',
              `electrical imports heatcalc: ${spec}`,
              'Do not couple electrical to heatcalc. Shared adapters only via utils/domain/types.',
              relSrc(file),
            ),
          );
        }
      }
    }
    if (violations.length) {
      expect.fail(violations.join('\n\n'));
    }
  });

  it('components→pages imports stay on allowlist (inverted deps)', () => {
    const componentsDir = path.join(SRC_ROOT, 'components');
    const violations: string[] = [];
    const foundAllowlisted: string[] = [];

    for (const file of walkTsFiles(componentsDir)) {
      const rel = relSrc(file);
      for (const spec of collectImports(file)) {
        if (!spec.includes('@/pages/') && !spec.includes('pages/')) continue;
        if (!spec.includes('@/pages/')) continue;
        if (COMPONENTS_TO_PAGES_ALLOWLIST.has(rel)) {
          foundAllowlisted.push(rel);
          continue;
        }
        violations.push(
          failMessage(
            'COMPONENT_IMPORTS_PAGE',
            `component imports page module: ${spec}`,
            'Presentational components must not depend on pages/*. Move pure model to domain/ or utils/, or pass data via props. If legacy, add file to COMPONENTS_TO_PAGES_ALLOWLIST with a shrink plan.',
            rel,
          ),
        );
      }
    }

    if (violations.length) {
      expect.fail(violations.join('\n\n'));
    }

    // Ensure allowlist entries still exist (stale allowlist detection)
    for (const allowed of COMPONENTS_TO_PAGES_ALLOWLIST) {
      const abs = path.join(SRC_ROOT, allowed);
      expect(fs.existsSync(abs), `allowlist file missing: ${allowed}`).toBe(true);
    }
  });

});
