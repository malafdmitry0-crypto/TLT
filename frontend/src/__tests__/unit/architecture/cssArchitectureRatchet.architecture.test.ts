import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANONICAL_MAX_WIDTHS,
  FEATURE_OWNERS,
  FRONTEND_ROOT,
  GLOBAL_CSS_ENTRIES,
  GLOBAL_CSS_IMPORT_ORDER,
  HERE,
  RAW_COLOR_ALLOWLIST,
  SRC_ROOT,
  collectCssImporters,
  collectCurrent,
  collectLegacyPaletteCounts,
  collectMediaConditionMaxWidths,
  collectNoncanonicalMediaCounts,
  collectRawColorCounts,
  countLegacyPaletteRefs,
  countNoncanonicalMedia,
  countRawColors,
  extractSelectors,
  failMessage,
  loadBaseline,
  measureCssFile,
  ratchetCountMap,
  readMainCssImportOrder,
  stripComments,
  sumMetrics,
  validateResponsiveContracts,
} from './cssArchitectureRatchet.helpers';

describe('CSS architecture ratchet (G4)', () => {
  it('freezes styles.css and does not grow LOC / bare ant / media', () => {
    const baseline = loadBaseline();
    const current = collectCurrent();
    const violations: string[] = [];

    // styles.css freeze-stub
    const stylesKey = 'src/styles.css';
    const styles = current[stylesKey];
    if (!styles) {
      violations.push(
        failMessage(
          'STYLES_CSS_MISSING',
          'styles.css missing',
          'Restore src/styles.css freeze-stub (comment-only, no feature rules).',
          stylesKey,
        ),
      );
    } else {
      if (styles.loc > baseline.stylesCssMaxLoc) {
        violations.push(
          failMessage(
            'STYLES_CSS_GREW',
            `styles.css LOC grew beyond freeze cap`,
            'Do not add rules to styles.css. Move feature CSS to owner files under styles/, pages/*, or components/*.',
            stylesKey,
            `CURRENT=${styles.loc} LIMIT=${baseline.stylesCssMaxLoc}`,
          ),
        );
      }
      const stylesText = fs.readFileSync(path.join(SRC_ROOT, 'styles.css'), 'utf8');
      const sels = extractSelectors(stylesText);
      if (sels.length > 0) {
        violations.push(
          failMessage(
            'STYLES_CSS_HAS_SELECTORS',
            `styles.css contains ${sels.length} selector(s) — must stay freeze-stub`,
            'Delete rules from styles.css; place them under the feature/owner CSS file.',
            stylesKey,
            sels[0],
          ),
        );
      }
    }

    for (const [file, limits] of Object.entries(baseline.files)) {
      const cur = current[file];
      if (!cur) continue; // deleted OK
      // AF12-CSS-MEDIA-CONTRACT-01: per-file raw @media counts are observational.
      // Hard shrink-only: loc + bareAnt. Media ownership uses responsiveContracts +
      // mediaConditionMaxWidths.
      for (const key of ['loc', 'bareAnt'] as const) {
        if (cur[key] > limits[key]) {
          violations.push(
            failMessage(
              `CSS_${key.toUpperCase()}_GREW`,
              `CSS metric grew: ${key}`,
              key === 'bareAnt'
                ? 'Prefix .ant-* with an owner root (e.g. .heat-form .ant-btn). Do not raise baseline.'
                : 'Split or delete CSS; keep owner file from growing. Do not raise baseline.',
              file,
              `CURRENT=${cur[key]} LIMIT=${limits[key]}`,
            ),
          );
        }
      }
      void limits.media;
      void cur.media;
    }

    for (const [file, metrics] of Object.entries(current)) {
      if (file in baseline.files) continue;
      if (metrics.loc > baseline.newFileLocCap) {
        violations.push(
          failMessage(
            'NEW_CSS_OVER_LOC_CAP',
            `New CSS file exceeds LOC cap`,
            `Keep new CSS ≤ ${baseline.newFileLocCap} LOC or split by owner/use-case.`,
            file,
            `CURRENT=${metrics.loc} LIMIT=${baseline.newFileLocCap}`,
          ),
        );
      }
      if (metrics.bareAnt > 0) {
        violations.push(
          failMessage(
            'NEW_CSS_BARE_ANT',
            `New CSS introduces bare .ant-* selectors`,
            'Scope every .ant-* under a project owner root class. Do not add bare Ant selectors.',
            file,
            `bareAnt=${metrics.bareAnt}`,
          ),
        );
      }
    }

    const curTotals = sumMetrics(current);
    // AF10-MEANINGFUL-CSS-GATE-01: totals.loc observational.
    // AF12-CSS-MEDIA-CONTRACT-01: totals.media observational (block count ≠ debt).
    // bareAnt total remains hard shrink-only.
    if (curTotals.bareAnt > baseline.totals.bareAnt) {
      violations.push(
        failMessage(
          'CSS_TOTAL_BAREANT_GREW',
          'Total CSS bareAnt grew',
          'Reduce elsewhere before adding. Do not raise totals in baseline without evidence.',
          undefined,
          `CURRENT=${curTotals.bareAnt} LIMIT=${baseline.totals.bareAnt}`,
        ),
      );
    }
    void curTotals.loc;
    void curTotals.media;

    // Shrink-only global max-width condition set (new breakpoints forbidden).
    const baselineWidths = baseline.mediaConditionMaxWidths ?? [...CANONICAL_MAX_WIDTHS].sort((a, b) => a - b);
    const currentWidths = collectMediaConditionMaxWidths();
    for (const px of currentWidths) {
      if (!baselineWidths.includes(px)) {
        violations.push(
          failMessage(
            'CSS_MEDIA_CONDITION_GREW',
            `New max-width breakpoint introduced: ${px}px`,
            'Do not add breakpoints. Prefer owner colocation of existing conditions with exact baseline update only when relocating contracts.',
            undefined,
            `px=${px}`,
          ),
        );
      }
    }

    if (baseline.responsiveContracts) {
      violations.push(
        ...validateResponsiveContracts(baseline.responsiveContracts, (rel) =>
          fs.readFileSync(path.join(FRONTEND_ROOT, rel), 'utf8'),
        ),
      );
    }

    // Foreign feature markers in owner CSS
    for (const [file, source] of Object.entries(current)) {
      void source;
      const owner = FEATURE_OWNERS.find((o) => file.startsWith(o.pathPrefix));
      if (!owner) continue;
      const text = fs.readFileSync(path.join(FRONTEND_ROOT, file), 'utf8');
      const cleaned = stripComments(text);
      for (const marker of owner.foreignMarkers) {
        // class-like token: .marker or marker as class fragment
        const re = new RegExp(`\\.${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
        if (re.test(cleaned)) {
          violations.push(
            failMessage(
              'FOREIGN_FEATURE_SELECTOR',
              `CSS owner contains foreign feature marker ".${marker}"`,
              'Move foreign selectors to their feature owner CSS. One owner = one feature.',
              file,
              `.${marker}`,
            ),
          );
        }
      }
    }

    // Import ownership
    const importers = collectCssImporters();
    for (const file of Object.keys(current)) {
      if (GLOBAL_CSS_ENTRIES.has(file)) continue;
      if (importers.has(file)) continue;
      violations.push(
        failMessage(
          'CSS_ORPHAN',
          'CSS file is not imported by any production TS/TSX and is not a global entry',
          'Import from the owner component/page, add to GLOBAL_CSS_ENTRIES if truly global (main.tsx), or delete dead CSS.',
          file,
        ),
      );
    }

    // tlt-form-controls must be owner-imported, never as a main.tsx CSS import
    const mainCssImports = readMainCssImportOrder();
    if (mainCssImports.some((spec) => spec.includes('tlt-form-controls'))) {
      violations.push(
        failMessage(
          'TLT_CONTROLS_GLOBAL',
          'tlt-form-controls.css must not be imported from main.tsx',
          'Import from components/form-controls (or ui-kit) owner entry only.',
          'src/main.tsx',
        ),
      );
    }
    const tltKey = 'src/styles/tlt-form-controls.css';
    if (!importers.has(tltKey)) {
      violations.push(
        failMessage(
          'TLT_CONTROLS_ORPHAN',
          'tlt-form-controls.css has no owner importer',
          'Import from components/form-controls/index.ts.',
          tltKey,
        ),
      );
    }

    // app-base freeze pointer (no selectors)
    const appBaseText = fs.readFileSync(path.join(SRC_ROOT, 'styles/app-base.css'), 'utf8');
    const appBaseSels = extractSelectors(appBaseText);
    if (appBaseSels.length > 0) {
      violations.push(
        failMessage(
          'APP_BASE_HAS_SELECTORS',
          'app-base.css must remain a freeze pointer to layered globals',
          'Put rules in tokens/base/app-shell/vendor-overrides.css instead.',
          'src/styles/app-base.css',
          appBaseSels[0],
        ),
      );
    }

    // Raw color ratchet
    const raw = collectRawColorCounts();
    const rawBaselineFiles = baseline.rawColors ?? {};
    const rawBaselineTotal = baseline.rawColorsTotal ?? Number.POSITIVE_INFINITY;
    if (raw.total > rawBaselineTotal) {
      violations.push(
        failMessage(
          'RAW_COLOR_TOTAL_GREW',
          `Total raw CSS colors grew`,
          'Use var(--token) from styles/tokens.css. Do not raise raw color baseline.',
          undefined,
          `CURRENT=${raw.total} LIMIT=${rawBaselineTotal}`,
        ),
      );
    }
    for (const [file, limit] of Object.entries(rawBaselineFiles)) {
      const cur = raw.files[file] ?? 0;
      if (cur > limit) {
        violations.push(
          failMessage(
            'RAW_COLOR_FILE_GREW',
            'Raw color count grew in file',
            RAW_COLOR_ALLOWLIST.has(file)
              ? 'Token file growth is rare — prefer reusing existing tokens.'
              : 'Replace hex/rgb with var(--…) from tokens.css.',
            file,
            `CURRENT=${cur} LIMIT=${limit}`,
          ),
        );
      }
    }
    for (const [file, cur] of Object.entries(raw.files)) {
      if (file in rawBaselineFiles) continue;
      if (RAW_COLOR_ALLOWLIST.has(file)) continue;
      if (cur > 0) {
        violations.push(
          failMessage(
            'RAW_COLOR_NEW_FILE',
            'New CSS file introduces raw colors',
            'Use tokens only outside styles/tokens.css (or add to RAW_COLOR_ALLOWLIST with review).',
            file,
            `rawColors=${cur}`,
          ),
        );
      }
    }

    // Legacy palette refs (--c-* / --a-*) outside tokens.css
    const legacy = collectLegacyPaletteCounts();
    violations.push(
      ...ratchetCountMap(
        'legacy palette refs',
        'LEGACY_PALETTE',
        legacy,
        baseline.legacyPalette ?? {},
        baseline.legacyPaletteTotal ?? Number.POSITIVE_INFINITY,
        'Replace --c-*/--a-* with semantic tokens from styles/tokens.css. Do not raise baseline.',
        'Do not introduce direct --c-*/--a-* refs outside tokens.css.',
      ),
    );

    // Non-canonical max-width breakpoints
    const noncanon = collectNoncanonicalMediaCounts();
    violations.push(
      ...ratchetCountMap(
        'noncanonical media breakpoints',
        'NONCANON_MEDIA',
        noncanon,
        baseline.noncanonicalMedia ?? {},
        baseline.noncanonicalMediaTotal ?? Number.POSITIVE_INFINITY,
        'Use canonical max-width 480/768/1200/1400 only (see css-strategy). Do not raise baseline.',
        'New CSS must use only canonical breakpoints (480/768/1200/1400).',
      ),
    );

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }

    expect(baseline.version).toBeGreaterThanOrEqual(1);
    expect(baseline.stylesCssMaxLoc).toBeLessThanOrEqual(30);
  });

  it('treats total CSS LOC and media block counts as observational', () => {
    // Semantic owner CSS may grow when JSX static styles move; totals.loc must
    // not be a hard fail. AF12: raw media block totals are observational;
    // mediaConditionMaxWidths + responsiveContracts are the hard responsive gates.
    const baseline = loadBaseline();
    expect(typeof baseline.totals.loc).toBe('number');
    expect(baseline.totals.loc).toBeGreaterThan(0);
    expect(typeof baseline.totals.bareAnt).toBe('number');
    expect(typeof baseline.totals.media).toBe('number');
    expect(baseline.newFileLocCap).toBeLessThanOrEqual(400);
    expect(Array.isArray(baseline.mediaConditionMaxWidths)).toBe(true);
  });

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

  it('measures bare .ant- and media via shared helpers', () => {
    const sample = `
/* comment .ant-btn */
.owner .ant-btn { color: red; }
.ant-modal { display: none; }
@media (max-width: 600px) {
  .owner .ant-input { width: 100%; }
}
`;
    const m = measureCssFile(sample);
    expect(m.bareAnt).toBe(1); // only .ant-modal
    expect(m.media).toBe(1);
    expect(m.loc).toBeGreaterThan(5);
  });

  it('counts raw colors ignoring comments', () => {
    expect(countRawColors('/* #fff */ .x { color: #1a5276; }')).toBe(1);
    expect(countRawColors('.x { color: var(--color-primary); }')).toBe(0);
  });

  it('counts legacy palette refs and noncanonical max-width media', () => {
    const sample = `
/* --c-old */
.x { color: var(--c-primary); border-color: var(--a-accent); }
@media (max-width: 900px) { .x { display: none; } }
@media (max-width: 768px) { .x { display: block; } }
@media print { .x { color: black; } }
@media (prefers-reduced-motion: reduce) { .x { animation: none; } }
`;
    expect(countLegacyPaletteRefs(sample)).toBe(2);
    expect(countNoncanonicalMedia(sample)).toBe(1); // only 900
    expect(countLegacyPaletteRefs('/* --c-x */ .ok { color: var(--color-text); }')).toBe(0);
  });

  it('fails growth when a new file adds legacy palette or noncanonical media (fixtures)', () => {
    // Fixture-style pure functions prove new-file growth is detectable.
    expect(countLegacyPaletteRefs('.new { color: var(--c-danger); }')).toBeGreaterThan(0);
    expect(countNoncanonicalMedia('@media (max-width: 640px) { .x{} }')).toBe(1);
    expect(countNoncanonicalMedia('@media (max-width: 480px) { .x{} }')).toBe(0);
  });
});
