import { describe, expect, it } from 'vitest';
import type { SpecificationDiagnostic, SpecificationReadinessResponse } from '@/api/specifications';
import {
  deduplicateSpecificationDiagnostics,
  resolveSpecificationReadinessView,
} from '@/pages/specification/specificationReadinessModel';

const blocked: SpecificationReadinessResponse = {
  project_id: 'project-1',
  results: [{
    electrical_variant_id: 'er-1',
    electrical_variant_name: 'ЭР1',
    status: 'blocked',
    total_objects: 6,
    contributing_objects: 0,
    blockers: [{
      code: 'SPEC_VARIANT_NOT_READY',
      kind: 'blocking',
      message: 'Назначение ЭР не готово',
      source_stage: 'electrical',
      scope: 'electrical_variant',
      electrical_variant_id: 'er-1',
      electrical_variant_name: 'ЭР1',
      reason: 'project_section_current_limit_changed',
      count: 6,
      object_ids: ['1', '2', '3', '4', '5', '6'],
      next_action: 'open_electrical_variant',
    }],
  }],
};

describe('specificationReadinessModel', () => {
  it('lets definitive blocked/calculating outrank transient query states', () => {
    expect(resolveSpecificationReadinessView({
      enabled: true,
      isLoading: false,
      isError: false,
      generationPending: false,
      generationFailed: false,
      data: blocked,
    }).state).toBe('blocked');
    expect(resolveSpecificationReadinessView({
      enabled: true,
      isLoading: false,
      isError: false,
      generationPending: true,
      generationFailed: false,
      data: blocked,
    }).state).toBe('calculating');
  });

  it.each([
    [{ enabled: false, isLoading: false, isError: false }, 'unknown'],
    [{ enabled: true, isLoading: true, isError: false }, 'loading'],
    [{ enabled: true, isLoading: false, isError: true }, 'unavailable'],
  ] as const)('maps non-authoritative query state without false blocking', (query, state) => {
    expect(resolveSpecificationReadinessView({
      ...query,
      generationPending: false,
      generationFailed: false,
    }).state).toBe(state);
  });

  it('deduplicates legacy per-object diagnostics without losing affected IDs', () => {
    const diagnostics: SpecificationDiagnostic[] = ['object-1', 'object-2'].map((objectId) => ({
      code: 'SPEC_VARIANT_NOT_READY',
      kind: 'blocking',
      message: 'Назначение ЭР не готово',
      issues: [],
      details: { object_id: objectId, assignment_state: 'stale' },
    }));

    expect(deduplicateSpecificationDiagnostics(diagnostics)).toEqual([{
      ...diagnostics[0],
      details: {
        object_id: 'object-1',
        assignment_state: 'stale',
        count: 2,
        object_ids: ['object-1', 'object-2'],
      },
    }]);
  });
});
