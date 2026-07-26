/**
 * AF100-03 — the CSS gate must be fail-closed.
 *
 * Measured regression: `npm run css:architecture` listed two explicit test
 * files. One of them was deleted when the CSS architecture ratchet was split
 * into .freeze / .metrics-fixtures / .responsive-order. `vitest run <a> <b>`
 * does not fail when only some filters match — the command reported
 * "Test Files 1 passed", exit 0, while three ratchets silently stopped running.
 *
 * See: docs/frontend/agent-friendly-10-plan.md §2.1
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, resolveTargets } from '../../../../scripts/css-architecture-gate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');

describe('AF100-03 — css:architecture gate', () => {
  it('package.json runs the fail-closed gate, not raw vitest filters', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(FRONTEND_ROOT, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(
      pkg.scripts['css:architecture'],
      'Raw `vitest run <file> <file>` silently passes when a target is renamed. ' +
        'FIX: keep css:architecture pointed at scripts/css-architecture-gate.mjs.',
    ).toBe('node scripts/css-architecture-gate.mjs');
  });

  it('resolves every declared ratchet group on the current tree', () => {
    const { targets, missing } = resolveTargets(FRONTEND_ROOT);
    expect(missing).toEqual([]);
    expect(targets.length).toBeGreaterThanOrEqual(
      GROUPS.reduce((sum: number, group: { min: number }) => sum + group.min, 0),
    );
    for (const target of targets) {
      expect(fs.existsSync(path.join(FRONTEND_ROOT, target))).toBe(true);
    }
  });

  it('reports a group that lost files instead of passing (failure path)', () => {
    const { missing } = resolveTargets(FRONTEND_ROOT, [
      {
        id: 'renamed-away-ratchet',
        dir: 'src/__tests__/unit/architecture',
        match: /^cssArchitectureRatchet\.architecture\.test\.ts$/,
        min: 1,
      },
    ]);
    expect(missing).toHaveLength(1);
    expect(missing[0].id).toBe('renamed-away-ratchet');
    expect(missing[0].found).toBe(0);
  });

  it('reports a shrunk group even when some files still match (failure path)', () => {
    const { missing } = resolveTargets(FRONTEND_ROOT, [
      { ...GROUPS[0], min: GROUPS[0].min + 99 },
    ]);
    expect(missing).toHaveLength(1);
    expect(missing[0].found).toBeLessThan(missing[0].min);
  });
});
