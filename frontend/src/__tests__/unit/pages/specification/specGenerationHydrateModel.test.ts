import { describe, expect, it } from 'vitest';

import { buildSpecGenerationHydrate } from '@/pages/specification/specGenerationHydrateModel';
import type { Specification } from '@/types/specification';

const erId = 'er-uuid-1';
const options = { grouping_mode: 'separate_by_object_type' as const, Ex: false };

function baseSpec(over: Partial<Specification> = {}): Specification {
  return {
    id: 'spec-1',
    project_id: 'proj-1',
    electrical_variant_id: erId,
    items: [],
    snapshot: null,
    is_stale: false,
    created_at: '2026-08-03T00:00:00Z',
    updated_at: '2026-08-03T00:00:00Z',
    ...over,
  };
}

describe('buildSpecGenerationHydrate', () => {
  it('returns empty outcome when GET is null (never generated)', () => {
    const result = buildSpecGenerationHydrate(null, erId, options);
    expect(result.hasOutcome).toBe(false);
    expect(result.candidateGroups).toEqual([]);
    expect(result.pendingGenerate).toBeNull();
    expect(result.preflightOpen).toBe(false);
  });

  it('hydrates selection_required with candidate groups and pending generate for F5', () => {
    const groups = [{
      group_key: 'g1',
      electrical_variant_id: erId,
      category: 'connection_kit',
      conditions: {},
      candidates: [
        {
          catalog_item_id: 'a',
          catalog_id: 'c',
          catalog_version: 'v1',
          category: 'connection_kit',
          name: 'A',
          mark: 'A',
          nomenclature_code: '1',
          supply_unit: 'шт.',
        },
        {
          catalog_item_id: 'b',
          catalog_id: 'c',
          catalog_version: 'v1',
          category: 'connection_kit',
          name: 'B',
          mark: 'B',
          nomenclature_code: '2',
          supply_unit: 'шт.',
        },
      ],
      selected_catalog_item_id: null,
      selection_source: 'none' as const,
      candidate_set_fingerprint: `sha256:${'f'.repeat(64)}`,
    }];
    const result = buildSpecGenerationHydrate(
      baseSpec({
        generation_status: 'selection_required',
        generation_diagnostics: [{
          code: 'SPEC_ACCESSORY_SELECTION_REQUIRED',
          kind: 'selection_required',
          message: 'need choice',
        }],
        generation_candidate_groups: groups,
        generation_at: '2026-08-03T12:00:00Z',
      }),
      erId,
      options,
    );
    expect(result.hasOutcome).toBe(true);
    expect(result.generationStatus).toBe('selection_required');
    expect(result.candidateGroups).toHaveLength(1);
    expect(result.candidateGroups[0]?.group_key).toBe('g1');
    expect(result.generationDiagnostics[0]?.code).toBe('SPEC_ACCESSORY_SELECTION_REQUIRED');
    expect(result.preflightOpen).toBe(false);
    expect(result.pendingGenerate).toEqual({
      generateVariantIds: [erId],
      options,
    });
    expect(result.clearDraftSelections).toBe(true);
  });

  it('opens preflight for confirmation_required after F5', () => {
    const result = buildSpecGenerationHydrate(
      baseSpec({
        generation_status: 'confirmation_required',
        generation_diagnostics: [{
          code: 'SPEC_UNASSIGNED_CONFIRMATION_REQUIRED',
          kind: 'confirmable',
          message: 'unassigned',
        }],
        generation_candidate_groups: [],
      }),
      erId,
      options,
    );
    expect(result.preflightOpen).toBe(true);
    expect(result.pendingGenerate?.generateVariantIds).toEqual([erId]);
    expect(result.candidateGroups).toEqual([]);
  });

  it('clears selection UI for generated status', () => {
    const result = buildSpecGenerationHydrate(
      baseSpec({
        generation_status: 'generated',
        items: [{
          category: 'cable',
          name: 'Cable',
          article: null,
          unit: 'м',
          quantity: '1',
          params: {},
          source: 'auto',
        }],
        generation_diagnostics: [],
        generation_candidate_groups: [{
          group_key: 'stale-group',
          electrical_variant_id: erId,
          category: 'connection_kit',
          conditions: {},
          candidates: [],
        }],
      }),
      erId,
      options,
    );
    expect(result.generationStatus).toBe('generated');
    expect(result.candidateGroups).toEqual([]);
    expect(result.pendingGenerate).toBeNull();
    expect(result.preflightOpen).toBe(false);
  });

  it('ignores legacy rows without generation_status', () => {
    const result = buildSpecGenerationHydrate(baseSpec(), erId, options);
    expect(result.hasOutcome).toBe(false);
    expect(result.clearDraftSelections).toBe(false);
  });
});
