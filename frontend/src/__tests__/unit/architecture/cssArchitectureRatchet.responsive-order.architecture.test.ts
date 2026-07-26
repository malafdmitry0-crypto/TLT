// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  GLOBAL_CSS_IMPORT_ORDER,
  HERE,
  loadBaseline,
  readMainCssImportOrder,
  validateResponsiveContracts,
} from './cssArchitectureRatchet.helpers';

describe('CSS architecture ratchet (G4) — responsive-order', () => {
  it('validates responsiveContracts: foreign selector, duplicate media, unlisted condition', () => {
    const read = (rel: string) => {
      if (rel === 'src/pages/fixture-owner.css') {
        return `
.owner-a { color: red; }
@media (max-width: 1200px) {
  .owner-a { display: block; }
  .foreign-b { display: none; }
}
@media (max-width: 1200px) {
  .owner-a { margin: 0; }
}
@media (max-width: 999px) {
  .owner-a { padding: 0; }
}
`;
      }
      throw new Error('missing');
    };
    const v = validateResponsiveContracts(
      {
        'src/pages/fixture-owner.css': {
          conditions: ['max-width: 1200px'],
          ownerRoots: ['.owner-a'],
        },
      },
      read,
    );
    expect(v.some((x) => x.includes('RESPONSIVE_FOREIGN_SELECTOR'))).toBe(true);
    expect(v.some((x) => x.includes('RESPONSIVE_DUPLICATE_MEDIA'))).toBe(true);
    expect(v.some((x) => x.includes('RESPONSIVE_UNLISTED_CONDITION'))).toBe(true);
  });
  it('allows a single contracted 1200px block with only ownerRoots selectors', () => {
    const v = validateResponsiveContracts(
      {
        'src/pages/ok.css': {
          conditions: ['max-width: 1200px'],
          ownerRoots: ['.uikit-heatcalc-'],
        },
      },
      () => `
@media (max-width: 1200px) {
  .uikit-heatcalc-contract { grid-template-columns: 1fr; }
  .uikit-heatcalc-form__grid { padding: 10px; }
}
`,
    );
    expect(v).toEqual([]);
  });
  it('enforces strict global CSS import order in main.tsx', () => {
    const actual = readMainCssImportOrder();
    expect(actual).toEqual([...GLOBAL_CSS_IMPORT_ORDER]);
    expect(actual).not.toContain('./styles/tlt-form-controls.css');
  });
  it('reuses IMP0 for !important (no second counter)', () => {
    // G4 must not maintain a parallel !important total — IMP0 owns that.
    const baseline = loadBaseline();
    expect('important' in (baseline.totals as object)).toBe(false);
    expect(fs.existsSync(path.join(HERE, 'cssImportantBaseline.json'))).toBe(true);
  });
});
