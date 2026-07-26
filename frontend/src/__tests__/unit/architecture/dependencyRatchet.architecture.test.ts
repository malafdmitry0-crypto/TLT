// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  LAYER_TOPS,
  assertAllowlistUsed,
  collectEdges,
  edgeKey,
  failMessage,
  featureOf,
  featurePagesOwner,
  findCycles,
  loadBaseline,
} from './dependencyRatchet.helpers';


describe('dependency ratchet (G3)', () => {
  it('blocks inverted layers, cross-feature deep imports, and cycles', () => {
    const baseline = loadBaseline();
    const edges = collectEdges();
    const violations: string[] = [];

    const layerAllow = new Map(
      baseline.layerToPagesAllowlist.map((e) => [edgeKey(e), e]),
    );
    const crossAllow = new Map(
      baseline.crossFeatureAllowlist.map((e) => [edgeKey(e), e]),
    );
    const outsiderAllow = new Map(
      baseline.featurePagesOutsiderAllowlist.map((e) => [edgeKey(e), e]),
    );

    const foundLayer = new Set<string>();
    const foundCross = new Set<string>();
    const foundOutsider = new Set<string>();

    for (const e of edges) {
      const fromRel = e.from.replace(/^src\//, '');
      const toRel = e.to.replace(/^src\//, '');
      const top = fromRel.split('/')[0];
      const key = edgeKey(e);

      // 1) Layer → pages
      if (LAYER_TOPS.has(top) && toRel.startsWith('pages/')) {
        if (layerAllow.has(key)) {
          foundLayer.add(key);
        } else {
          violations.push(
            failMessage(
              'LAYER_IMPORTS_PAGE',
              `Layer module imports pages/*: ${top} → pages`,
              'Move shared logic out of pages into hooks/domain/utils, or pass data via props/API. If legacy cutover only, add exact edge to layerToPagesAllowlist with shrink note — do not grow casually.',
              e.from,
              e.import,
            ),
          );
        }
      }

      // 2) Cross-feature
      const fromFeat = featureOf(e.from);
      const toFeat = featureOf(e.to);
      if (fromFeat && toFeat && fromFeat !== toFeat) {
        if (crossAllow.has(key)) {
          foundCross.add(key);
        } else {
          violations.push(
            failMessage(
              'CROSS_FEATURE_IMPORT',
              `Feature "${fromFeat}" imports feature "${toFeat}"`,
              'Do not couple heat ↔ electrical ↔ specification. Extract shared pure code to domain/, types/, utils/, or components/shared. Legacy only: crossFeatureAllowlist + shrink note.',
              e.from,
              e.import,
            ),
          );
        }
      }

      // 3) Outsider deep-import of feature pages/*
      const pageOwner = featurePagesOwner(e.to);
      if (pageOwner) {
        const importerFeat = featureOf(e.from);
        const isInsideSameFeature = importerFeat === pageOwner;
        if (!isInsideSameFeature) {
          if (outsiderAllow.has(key)) {
            foundOutsider.add(key);
          } else {
            violations.push(
              failMessage(
                'FEATURE_PAGE_DEEP_IMPORT',
                `Outsider deep-imports ${pageOwner} pages module`,
                'Import only documented public entrypoints (prefer hooks/ bridges). Move pure APIs out of pages/* or add a thin public barrel outside pages. Legacy: featurePagesOutsiderAllowlist + shrink note.',
                e.from,
                e.import,
              ),
            );
          }
        }
      }
    }

    assertAllowlistUsed('layerToPagesAllowlist', baseline.layerToPagesAllowlist, foundLayer, violations);
    assertAllowlistUsed('crossFeatureAllowlist', baseline.crossFeatureAllowlist, foundCross, violations);
    assertAllowlistUsed(
      'featurePagesOutsiderAllowlist',
      baseline.featurePagesOutsiderAllowlist,
      foundOutsider,
      violations,
    );

    // 4) Cycles
    const cycles = findCycles(edges);
    for (const cycle of cycles) {
      violations.push(
        failMessage(
          'IMPORT_CYCLE',
          `Production import cycle: ${cycle.join(' → ')}`,
          'Break the cycle by extracting a pure leaf module (types/domain/utils) or inverting the dependency. No new cycles.',
          cycle[0] ?? '(unknown)',
          cycle.join(' → '),
        ),
      );
    }

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }

    expect(baseline.version).toBe(1);
    expect(baseline.layerToPagesAllowlist.length).toBeGreaterThanOrEqual(0);
  });

  it('resolves @/ and relative imports via filesystem (sanity)', () => {
    const edges = collectEdges();
    expect(edges.length).toBeGreaterThan(50);
    // FDEP-08: legacy bridge stays on hooks→hooks (no hooks→pages edge)
    expect(
      edges.some(
        (e) =>
          e.from === 'src/hooks/useLegacyElectricalVariantContext.ts'
          && e.to === 'src/hooks/useElectricalVariantSelection.ts',
      ),
    ).toBe(true);
    expect(
      edges.some(
        (e) =>
          e.from === 'src/hooks/useLegacyElectricalVariantContext.ts'
          && e.to.startsWith('src/pages/'),
      ),
    ).toBe(false);
  });
});
