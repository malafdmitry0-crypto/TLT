import { describe, expect, it } from 'vitest';

import {
  cableSnapshotRow,
  commercialStatus,
  hasCommercialData,
  hasTechnicalData,
  hasValue,
  resolveCableCatalogStatuses,
  resolveCableRowForMark,
  resolveCableRowsForType,
  technicalStatus,
  type CableStatusRow,
} from '@/pages/electrical/elecCalcCableCatalogModel';
import type { ElectricalCalcSummary } from '@/types/calculation';

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

describe('elecCalcCableCatalogModel', () => {
  it('keeps commercial status labels stable', () => {
    expect(commercialStatus([])).toEqual({ label: 'Нет коммерческих данных', color: 'default' });
    expect(commercialStatus([{ model: 'ТЛТ-10', stock_status: 'unknown' }]))
      .toEqual({ label: 'Нет коммерческих данных', color: 'default' });
    expect(commercialStatus([
      { model: 'ТЛТ-10', price_per_meter: 100 },
      { model: 'ТЛТ-15' },
    ])).toEqual({ label: 'Коммерческие данные неполные', color: 'warning' });
    expect(commercialStatus([
      { model: 'ТЛТ-10', price_per_meter: 100 },
      { model: 'ТЛТ-15', stock_quantity_m: 25 },
    ])).toEqual({ label: 'Коммерческие данные есть', color: 'success' });

    expect(hasCommercialData({ model: 'ТЛТ-25', is_preferred: true })).toBe(true);
    expect(hasCommercialData({ model: 'ТЛТ-25', stock_status: 'on_order' })).toBe(true);
  });

  it('keeps technical completeness rules by cable type', () => {
    const tltComplete: CableStatusRow = {
      power_per_meter: 30,
      max_temperature: 65,
      min_temperature: -60,
    };
    expect(hasValue(0)).toBe(true);
    expect(hasValue('')).toBe(true);
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
    expect(hasTechnicalData('self_regulating', tltComplete)).toBe(true);
    expect(hasTechnicalData('self_regulating', { ...tltComplete, min_temperature: null })).toBe(false);
    expect(hasTechnicalData('self_regulating', { technical_data_complete: false })).toBe(false);
    expect(hasTechnicalData('self_regulating', { technical_data_complete: true })).toBe(true);

    expect(hasTechnicalData('self_regulating_tt', {
      q1: 10,
      q2: 20,
      max_product_temp: 90,
      max_vapor_temp: 120,
    })).toBe(true);
    expect(hasTechnicalData('self_regulating_tt', {
      q1: 10,
      q2: 20,
      max_product_temp: 90,
    })).toBe(false);

    expect(hasTechnicalData('single_core', {
      resistance_ohm_km: 120,
      conductor_section_mm2: 2.5,
    })).toBe(true);
    expect(hasTechnicalData('three_core', {
      resistance_ohm_km: 120,
      conductor_cross_section: 2.5,
    })).toBe(true);
    expect(hasTechnicalData('single_core', { resistance_ohm_km: 120 })).toBe(false);
    expect(hasTechnicalData('mineral', tltComplete)).toBe(false);
  });

  it('keeps technical status labels stable', () => {
    expect(technicalStatus(null, [])).toEqual({ label: 'Техданные: несколько типов', color: 'default' });
    expect(technicalStatus('self_regulating', [])).toEqual({ label: 'Нет техданных', color: 'error' });
    expect(technicalStatus('self_regulating', [{
      power_per_meter: 30,
      max_temperature: 65,
      min_temperature: -60,
    }])).toEqual({ label: 'Техданные полные', color: 'success' });
    expect(technicalStatus('self_regulating', [
      { power_per_meter: 30, max_temperature: 65, min_temperature: -60 },
      { power_per_meter: 25 },
    ])).toEqual({ label: 'Техданные неполные', color: 'warning' });
    expect(technicalStatus('self_regulating', [{ power_per_meter: 25 }]))
      .toEqual({ label: 'Нет техданных', color: 'error' });
  });

  it('resolves visible cable rows by cable type and source mode', () => {
    const availableCableTypes = new Set([
      'self_regulating',
      'self_regulating_tt',
      'single_core',
      'three_core',
    ] as const);
    const builtinCable: CableStatusRow = {
      model: 'ТЛТ-10',
      cable_type: 'self_regulating',
      source: 'builtin',
      power_per_meter: 10,
    };
    const duplicateExternalCable: CableStatusRow = {
      ...builtinCable,
      source: 'extended',
    };
    const newExternalCable: CableStatusRow = {
      model: 'ТЛТ-20',
      cable_type: 'self_regulating',
      source: 'extended',
      power_per_meter: 20,
    };
    const ttCable: CableStatusRow = {
      model: 'ТТН-10',
      cable_type: 'self_regulating_tt',
      source: 'builtin',
      q1: 1,
      q2: 2,
    };
    const singleCoreCable: CableStatusRow = {
      model: 'R1',
      cable_type: 'single_core',
      source: 'extended',
      resistance_ohm_km: 100,
    };
    const threeCoreCable: CableStatusRow = {
      model: 'R3',
      cable_type: 'three_core',
      source: 'extended',
      resistance_ohm_km: 120,
    };

    expect(resolveCableRowsForType({
      type: 'self_regulating',
      availableCableTypes,
      cables: [duplicateExternalCable, newExternalCable],
      builtinCables: [builtinCable],
      ttCables: [ttCable],
      effectiveSource: 'all',
      resistiveCables: {
        single_core: [singleCoreCable],
        three_core: [threeCoreCable],
      },
      builtinResistiveCables: {
        single_core: [],
        three_core: [],
      },
    }).map((row) => row.model)).toEqual(['ТЛТ-20']);

    expect(resolveCableRowsForType({
      type: 'self_regulating_tt',
      availableCableTypes,
      cables: [],
      builtinCables: [],
      ttCables: [ttCable],
      effectiveSource: 'builtin',
    })).toEqual([ttCable]);

    expect(resolveCableRowsForType({
      type: 'single_core',
      availableCableTypes,
      cables: [],
      builtinCables: [],
      ttCables: [],
      effectiveSource: 'extended',
      resistiveCables: {
        single_core: [singleCoreCable],
        three_core: [threeCoreCable],
      },
    })).toEqual([singleCoreCable]);

    expect(resolveCableRowsForType({
      type: 'mineral',
      availableCableTypes,
      cables: [newExternalCable],
      builtinCables: [],
      ttCables: [ttCable],
      effectiveSource: 'all',
    })).toEqual([]);
  });

  it('resolves cable catalog statuses together', () => {
    expect(resolveCableCatalogStatuses('self_regulating', [{
      power_per_meter: 30,
      max_temperature: 65,
      min_temperature: -60,
      price_per_meter: 100,
    }])).toEqual({
      commercialDataStatus: { label: 'Коммерческие данные есть', color: 'success' },
      technicalDataStatus: { label: 'Техданные полные', color: 'success' },
    });
  });

  it('resolves selected cable rows by mark, source and snapshot fallback', () => {
    const builtinRow: CableStatusRow = {
      model: 'ТЛТ-25',
      cable_type: 'self_regulating',
      source: 'builtin',
    };
    const extendedRow: CableStatusRow = {
      model: 'ТЛТ-25',
      cable_type: 'self_regulating',
      source: 'extended',
    };
    expect(resolveCableRowForMark({
      type: 'self_regulating',
      mark: 'ТЛТ-25',
      calc: undefined,
      rows: [builtinRow, extendedRow],
      selectedSource: 'extended',
    })).toBe(extendedRow);

    expect(resolveCableRowForMark({
      type: 'self_regulating_tt',
      mark: 'ТТН-10-СР',
      calc: undefined,
      rows: [{ model: 'ТТН-10', cable_type: 'self_regulating_tt', source: 'builtin' }],
    })).toMatchObject({ model: 'ТТН-10' });

    const snapshotCalc = calc({
      cable_snapshot: {
        cable_mark: 'Снимок-ТЛТ',
        cable_type: 'self_regulating',
        technical: { model: 'Снимок-ТЛТ' },
      },
    });
    expect(resolveCableRowForMark({
      type: 'self_regulating',
      mark: 'Снимок-ТЛТ',
      calc: snapshotCalc,
      rows: [],
    })).toMatchObject({ model: 'Снимок-ТЛТ', source: 'project' });

    expect(resolveCableRowForMark({
      type: 'single_core',
      mark: 'R1',
      calc: undefined,
      rows: [],
      selectedSource: 'extended',
    })).toEqual({ model: 'R1', cable_type: 'single_core', source: 'extended' });
    expect(resolveCableRowForMark({
      type: 'single_core',
      mark: undefined,
      calc: undefined,
      rows: [],
    })).toBeNull();
  });

  it('builds cable row from calculation snapshot without accepting invalid snapshots', () => {
    expect(cableSnapshotRow(undefined)).toBeNull();
    expect(cableSnapshotRow(calc({ cable_snapshot: null }))).toBeNull();
    expect(cableSnapshotRow(calc({ cable_snapshot: [] as unknown as Record<string, unknown> }))).toBeNull();

    expect(cableSnapshotRow(calc({
      cable_snapshot: {
        cable_mark: 'Снимок-ТЛТ',
        cable_type: 'self_regulating',
        actual_catalog_source: 'commercial',
        requested_catalog_source: 'extended',
        technical: {
          model: 'Тех-ТЛТ',
          power_per_meter: 30,
        },
        commercial: {
          price_per_meter: 125,
        },
      },
    }))).toMatchObject({
      model: 'Снимок-ТЛТ',
      cable_type: 'self_regulating',
      source: 'commercial',
      power_per_meter: 30,
      price_per_meter: 125,
    });
    expect(cableSnapshotRow(calc({
      cable_snapshot: {
        requested_catalog_source: 'extended',
        technical: { model: 'Тех-ТЛТ' },
      },
    }))?.source).toBe('extended');
    expect(cableSnapshotRow(calc({
      cable_snapshot: {
        technical: { model: 'Тех-ТЛТ' },
      },
    }))?.source).toBe('project');
  });
});
