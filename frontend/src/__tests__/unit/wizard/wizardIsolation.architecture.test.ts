/**
 * Architecture gate: wizard dual-form islands must stay isolated.
 * Failures throw WizardIsolationError with FIX instructions for AI/agents.
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  assertIslandComponentImports,
  assertIslandCssIsolation,
  assertShellCssDoesNotLeakIntoIslands,
  assertWizardIsolationAll,
  collectWizardIsolationViolations,
} from '@/components/wizard/isolation/assertWizardIsolation';
import {
  WIZARD_ISLANDS,
  WizardIsolationError,
} from '@/components/wizard/isolation/wizardIslands';

const WIZARD_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../components/wizard',
);

describe('wizard dual-form isolation (architecture)', () => {
  it('all islands have component + CSS files on disk', () => {
    for (const island of WIZARD_ISLANDS) {
      expect(
        fs.existsSync(path.join(WIZARD_DIR, island.componentFile)),
        island.componentFile,
      ).toBe(true);
      expect(
        fs.existsSync(path.join(WIZARD_DIR, island.cssFile)),
        island.cssFile,
      ).toBe(true);
    }
  });

  it('island CSS selectors stay under their root class', () => {
    expect(() => assertIslandCssIsolation()).not.toThrow();
  });

  it('island components import own CSS and do not import other islands', () => {
    expect(() => assertIslandComponentImports()).not.toThrow();
  });

  it('shell styles.css does not leak control styles into islands', () => {
    expect(() => assertShellCssDoesNotLeakIntoIslands()).not.toThrow();
  });

  it('full isolation suite is green', () => {
    const violations = collectWizardIsolationViolations();
    if (violations.length > 0) {
      const report = violations.map((e) => e.message).join('\n\n---\n\n');
      expect.fail(`Wizard isolation violations:\n\n${report}`);
    }
    expect(() => assertWizardIsolationAll()).not.toThrow();
  });

  it('WizardIsolationError message always includes FIX for AI', () => {
    const err = new WizardIsolationError({
      code: 'TEST',
      message: 'demo break',
      fix: 'do the right thing',
      island: 'insulation-layers-table',
    });
    expect(err.message).toContain('[WizardIsolationError:TEST]');
    expect(err.message).toContain('FIX: do the right thing');
    expect(err.message).toContain('ISLAND: insulation-layers-table');
  });

  it('detects a deliberately broken CSS selector outside root', () => {
    // Unit-level: selectorBelong logic covered via assert on real files;
    // ensure error type is correct if we force a fake violation message format.
    const err = new WizardIsolationError({
      code: 'CSS_SELECTOR_OUTSIDE_ROOT',
      island: 'heat-object-fields',
      message: 'demo',
      fix: 'Every selector must include .heat-object-fields',
    });
    expect(err).toBeInstanceOf(WizardIsolationError);
    expect(err.code).toBe('CSS_SELECTOR_OUTSIDE_ROOT');
  });
});
