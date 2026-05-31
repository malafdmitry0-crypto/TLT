import { describe, expect, it } from 'vitest';

import {
  cableSnapshotRow,
  commercialStatus,
  hasCommercialData,
  hasTechnicalData,
  hasValue,
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
