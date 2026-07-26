// @vitest-environment node
/**
 * AF9-VIEWPORT-01: global layout regression matrix.
 *
 * Encodes the product viewport contract as executable constants so CI fails
 * if the matrix drifts from docs/frontend/viewport-policy.md without an
 * intentional baseline update.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MATRIX_PATH = path.join(HERE, 'viewportLayoutMatrix.json');
const POLICY_PATH = path.resolve(HERE, '../../../../../docs/frontend/viewport-policy.md');

type ViewportProfile = {
  id: string;
  width: number;
  height: number;
  level: 'below_contract' | 'functional' | 'full_workspace' | 'primary_qa' | 'wide';
  required: boolean;
};

type Matrix = {
  version: number;
  functionalMinWidth: number;
  fullWorkspaceMinWidth: number;
  primaryQaWidth: number;
  profiles: ViewportProfile[];
};

describe('viewport layout matrix (AF9-VIEWPORT-01)', () => {
  it('locks the global desktop regression matrix against policy drift', () => {
    const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8')) as Matrix;
    const policy = fs.readFileSync(POLICY_PATH, 'utf8');

    expect(matrix.functionalMinWidth).toBe(1000);
    expect(matrix.fullWorkspaceMinWidth).toBe(1280);
    expect(matrix.primaryQaWidth).toBe(1440);

    expect(policy).toContain('`1000');
    expect(policy).toContain('`1280');
    expect(policy).toContain('`1440');

    const byId = Object.fromEntries(matrix.profiles.map((p) => [p.id, p]));
    expect(byId.functional_1000.width).toBe(1000);
    expect(byId.functional_1000.level).toBe('functional');
    expect(byId.full_workspace_1280.width).toBe(1280);
    expect(byId.full_workspace_1280.level).toBe('full_workspace');
    expect(byId.primary_qa_1440.width).toBe(1440);
    expect(byId.primary_qa_1440.level).toBe('primary_qa');
    expect(byId.wide_1920.width).toBe(1920);
    expect(byId.wide_1920.level).toBe('wide');

    const required = matrix.profiles.filter((p) => p.required);
    expect(required.map((p) => p.width).sort((a, b) => a - b)).toEqual([1000, 1280, 1440, 1920]);

    for (const profile of matrix.profiles) {
      expect(profile.width).toBeGreaterThan(0);
      expect(profile.height).toBeGreaterThan(0);
      if (profile.level === 'functional') {
        expect(profile.width).toBeGreaterThanOrEqual(matrix.functionalMinWidth);
        expect(profile.width).toBeLessThan(matrix.fullWorkspaceMinWidth);
      }
      if (profile.level === 'full_workspace') {
        expect(profile.width).toBeGreaterThanOrEqual(matrix.fullWorkspaceMinWidth);
      }
      if (profile.level === 'primary_qa') {
        expect(profile.width).toBe(matrix.primaryQaWidth);
      }
    }
  });
});
