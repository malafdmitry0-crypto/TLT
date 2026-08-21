import { describe, expect, it } from 'vitest';

import {
  AUTO_CABLE_MARK_VALUE,
  cableMarkOptionValue,
  CABLE_MARK_OPTION_SEPARATOR,
  catalogSourceFromSnapshot,
  externalCableOptionLabelSource,
  normalizeCableMarkOptionSource,
  normalizeCableSource,
  shouldShowProjectCableOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { CableCatalogRow } from '@/utils/cableCatalogSourceLabels';

function calc(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    project_id: 'project-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-25',
    cable_mark_source: 'auto',
    variant_number: 1,
    params: {},
    results: {},
    created_at: '2026-05-31T00:00:00.000Z',
    updated_at: '2026-05-31T00:00:00.000Z',
    ...overrides,
  };
}

describe('elecCalcCableOptionModel', () => {
  it('normalizes catalog sources and keeps project as option-only source', () => {
    expect(normalizeCableSource('builtin')).toBe('builtin');
    expect(normalizeCableSource('commercial')).toBe('commercial');
    expect(normalizeCableSource('extended')).toBe('extended');
    expect(normalizeCableSource('all')).toBe('all');
    expect(normalizeCableSource('project')).toBeNull();
    expect(normalizeCableSource('unknown')).toBeNull();

    expect(normalizeCableMarkOptionSource('project')).toBe('project');
    expect(normalizeCableMarkOptionSource('extended')).toBe('extended');
    expect(normalizeCableMarkOptionSource(null)).toBe('builtin');
    expect(normalizeCableMarkOptionSource('unknown')).toBe('builtin');
  });

  it('keeps auto sentinel, separator and encoded mark value stable', () => {
    expect(AUTO_CABLE_MARK_VALUE).toBe('__auto__');
    expect(CABLE_MARK_OPTION_SEPARATOR).toBe('::');
    expect(cableMarkOptionValue('extended', 'ТЛТ 30/С'))
      .toBe(`extended::${encodeURIComponent('ТЛТ 30/С')}`);
    expect(cableMarkOptionValue('project', 'TT P1 8000'))
      .toBe('project::TT%20P1%208000');
  });

  it('reads catalog source from snapshot with actual source before requested source', () => {
    expect(catalogSourceFromSnapshot(calc({
      cable_snapshot: {
        actual_catalog_source: 'commercial',
        requested_catalog_source: 'extended',
      },
    }))).toBe('commercial');
    expect(catalogSourceFromSnapshot(calc({
      cable_snapshot: {
        actual_catalog_source: 'legacy',
        requested_catalog_source: 'extended',
      },
    }))).toBe('extended');
    expect(catalogSourceFromSnapshot(calc({
      cable_snapshot: {
        requested_catalog_source: 'project',
      },
    }))).toBeNull();
    expect(catalogSourceFromSnapshot(calc({ cable_snapshot: null }))).toBeNull();
    expect(catalogSourceFromSnapshot(calc({ cable_snapshot: [] as unknown as Record<string, unknown> })))
      .toBeNull();
    expect(catalogSourceFromSnapshot(undefined)).toBeNull();
  });

  it('shows project cable option only for missing or changed technical snapshots', () => {
    expect(shouldShowProjectCableOption(calc({
      cable_snapshot: { model: 'ТЛТ-25' },
      cable_snapshot_status: { technical_status: 'missing' },
    }))).toBe(true);
    expect(shouldShowProjectCableOption(calc({
      cable_snapshot: { model: 'ТЛТ-25' },
      cable_snapshot_status: { technical_status: 'changed' },
    }))).toBe(true);
    expect(shouldShowProjectCableOption(calc({
      cable_snapshot: { model: 'ТЛТ-25' },
      cable_snapshot_status: { technical_status: 'matched' },
    }))).toBe(false);
    expect(shouldShowProjectCableOption(calc({ cable_snapshot: null }))).toBe(false);
    expect(shouldShowProjectCableOption(undefined)).toBe(false);
  });

  it('delegates external label decision for all-source catalog rows', () => {
    const builtinRow: CableCatalogRow = {
      model: 'ТЛТ-30',
      source: 'builtin',
      power_per_meter: 30,
      max_temperature: 65,
      min_temperature: -60,
    };
    const identicalExtended: CableCatalogRow = {
      ...builtinRow,
      source: 'extended',
    };
    const changedExtended: CableCatalogRow = {
      ...builtinRow,
      source: 'extended',
      power_per_meter: 35,
    };

    expect(externalCableOptionLabelSource(
      identicalExtended,
      [builtinRow, identicalExtended, changedExtended],
      [builtinRow],
      'all',
    )).toBeNull();
    expect(externalCableOptionLabelSource(
      changedExtended,
      [builtinRow, identicalExtended, changedExtended],
      [builtinRow],
      'all',
    )).toBe('extended');
    expect(externalCableOptionLabelSource(
      changedExtended,
      [changedExtended],
      [builtinRow],
      'extended',
    )).toBeNull();
  });
});
