import { describe, expect, it } from 'vitest';

import { buildSpecGenerationHydrate } from '@/pages/specification/specGenerationHydrateModel';
import {
  buildPendingGenerationContext,
  createPendingGenerationContextStore,
  hydratePendingGenerationContext,
  pendingGenerationContextStorageKey,
  rememberPendingGenerationContext,
  resumePendingGenerationVariables,
  settlePendingGenerationContext,
  type GenerateSpecificationVariables,
} from '@/pages/specification/specPendingGenerationContext';
import type { Specification } from '@/types/specification';

const erId = 'er-uuid-1';
const options = { grouping_mode: 'separate_by_object_type' as const, Ex: false };
const completeOptions = {
  grouping_mode: 'separate_by_object_type' as const,
  Ex: false,
  K1i: false,
  K2i: false,
  Kiu: false,
  L_K2i_m: '12.5',
  R_gr: '1.25',
};

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function pendingVariables(over: Partial<GenerateSpecificationVariables> = {}): GenerateSpecificationVariables {
  return {
    projectId: 'proj-1',
    electricalVariantId: erId,
    electricalVariantName: 'ЭР1',
    queryKey: ['spec', 'proj-1', erId],
    generateVariantIds: [erId],
    options: completeOptions,
    excludeUnassignedConfirmed: false,
    catalogSelections: {},
    ...over,
  };
}

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

describe('pending specification generation session context', () => {
  it('rehydrates a complete command only for its project and ER keys', () => {
    const storage = memoryStorage();
    const secondErId = 'er-uuid-2';
    rememberPendingGenerationContext(
      createPendingGenerationContextStore(storage),
      pendingVariables({ generateVariantIds: [erId, secondErId] }),
    );

    const afterReload = createPendingGenerationContextStore(storage);
    expect(hydratePendingGenerationContext(
      afterReload,
      'proj-1',
      erId,
      'selection_required',
    )).toEqual({
      generateVariantIds: [erId, secondErId],
      options: completeOptions,
    });
    expect(afterReload.load('proj-other', erId)).toBeNull();
    expect(afterReload.load('proj-1', 'er-other')).toBeNull();
  });

  it('ignores corrupt, version-mismatched and structurally invalid JSON', () => {
    const storage = memoryStorage();
    const key = pendingGenerationContextStorageKey('proj-1', erId);
    storage.setItem(key, '{not-json');
    expect(createPendingGenerationContextStore(storage).load('proj-1', erId)).toBeNull();

    storage.setItem(key, JSON.stringify({
      ...buildPendingGenerationContext(pendingVariables()),
      version: 2,
    }));
    expect(createPendingGenerationContextStore(storage).load('proj-1', erId)).toBeNull();

    storage.setItem(key, JSON.stringify({
      ...buildPendingGenerationContext(pendingVariables()),
      unexpected: true,
    }));
    expect(createPendingGenerationContextStore(storage).load('proj-1', erId)).toBeNull();
  });

  it.each([
    ['missing L_K2i_m', { ...completeOptions, L_K2i_m: undefined }],
    ['negative L_K2i_m', { ...completeOptions, L_K2i_m: '-0.1' }],
    ['non-finite L_K2i_m', { ...completeOptions, L_K2i_m: '1e9999' }],
    ['non-numeric R_gr', { ...completeOptions, R_gr: 'reserve' }],
  ])('rejects incomplete or invalid numeric options: %s', (_label, invalidOptions) => {
    const storage = memoryStorage();
    const key = pendingGenerationContextStorageKey('proj-1', erId);
    storage.setItem(key, JSON.stringify({
      version: 1,
      generateVariantIds: [erId],
      options: invalidOptions,
      catalogSelections: {},
    }));
    expect(createPendingGenerationContextStore(storage).load('proj-1', erId)).toBeNull();
  });

  it('keeps selection candidates visible but has no executable Apply command without context', () => {
    const hydrate = buildSpecGenerationHydrate(
      baseSpec({
        generation_status: 'selection_required',
        generation_candidate_groups: [{
          group_key: 'g1',
          electrical_variant_id: erId,
          category: 'connection_kit',
          conditions: {},
          candidates: [],
        }],
      }),
      erId,
      options,
    );
    expect(hydrate.candidateGroups).toHaveLength(1);
    expect(hydratePendingGenerationContext(
      createPendingGenerationContextStore(memoryStorage()),
      'proj-1',
      erId,
      hydrate.generationStatus,
    )).toBeNull();
  });

  it('carries a catalog choice from selection through confirmation', () => {
    const store = createPendingGenerationContextStore(memoryStorage());
    const initial = pendingVariables();
    rememberPendingGenerationContext(store, initial);
    const afterChoice = resumePendingGenerationVariables(
      store, initial, erId, false, { g1: 'catalog-item-2' },
    );
    expect(afterChoice?.catalogSelections).toEqual({ g1: 'catalog-item-2' });
    if (!afterChoice) throw new Error('selection context was not resumed');
    settlePendingGenerationContext(store, afterChoice, ['confirmation_required']);

    const confirm = resumePendingGenerationVariables(store, initial, erId, true);
    expect(confirm).toMatchObject({
      excludeUnassignedConfirmed: true,
      catalogSelections: { g1: 'catalog-item-2' },
      options: completeOptions,
    });
  });

  it.each(['generated', 'blocked'] as const)('clears context for terminal %s', (status) => {
    const storage = memoryStorage();
    const secondErId = 'er-uuid-2';
    rememberPendingGenerationContext(
      createPendingGenerationContextStore(storage),
      pendingVariables({ generateVariantIds: [erId, secondErId] }),
    );
    hydratePendingGenerationContext(
      createPendingGenerationContextStore(storage),
      'proj-1',
      erId,
      status,
    );
    const afterTerminal = createPendingGenerationContextStore(storage);
    expect(afterTerminal.load('proj-1', erId)).toBeNull();
    expect(afterTerminal.load('proj-1', secondErId)).toBeNull();
  });
});
