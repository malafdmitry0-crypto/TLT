import { isValidElement } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CableInfo } from '@/api/calculations';
import { AUTO_CABLE_MARK_VALUE } from '@/pages/electrical/elecCalcCableOptionModel';
import { useElecCalcCableMarkOptions } from '@/pages/electrical/useElecCalcCableMarkOptions';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ResistiveCablesReference } from '@/types/reference';

const availableTypes = (...types: CableTypeKey[]) => new Set<CableTypeKey>(types);

function cable(overrides: Partial<CableInfo>): CableInfo {
  return {
    brand: 'TLT',
    model: 'ТЛТ-25',
    power_per_meter: 25,
    max_temperature: 65,
    min_temperature: -60,
    source: 'builtin',
    ...overrides,
  };
}

function calc(overrides: Partial<ElectricalCalcSummary> = {}): ElectricalCalcSummary {
  return {
    id: 'calc-1',
    project_id: 'project-1',
    object_id: 'object-1',
    cable_type: 'self_regulating',
    cable_mark: 'ТЛТ-X',
    cable_mark_source: 'manual',
    variant_number: 1,
    params: {},
    results: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function renderOptions(options: {
  available?: CableTypeKey[];
  cables?: CableInfo[];
  builtinCables?: CableInfo[];
  resistiveCables?: ResistiveCablesReference;
  builtinResistiveCables?: ResistiveCablesReference;
  cableSizingEffectiveCableType?: CableTypeKey;
} = {}) {
  return renderHook(
    (props: Required<typeof options>) => useElecCalcCableMarkOptions({
      availableCableTypes: availableTypes(...props.available),
      cables: props.cables,
      builtinCables: props.builtinCables,
      resistiveCables: props.resistiveCables,
      builtinResistiveCables: props.builtinResistiveCables,
      effectiveSource: 'all',
      cableSizingEffectiveCableType: props.cableSizingEffectiveCableType,
    }),
    {
      initialProps: {
        available: ['self_regulating'],
        cables: [],
        builtinCables: [],
        resistiveCables: { single_core: [], three_core: [], common: {} },
        builtinResistiveCables: { single_core: [], three_core: [], common: {} },
        cableSizingEffectiveCableType: 'self_regulating',
        ...options,
      },
    },
  );
}

describe('useElecCalcCableMarkOptions', () => {
  it('builds self-regulating options and marks changed external catalog rows', () => {
    const builtin = cable({ model: 'ТЛТ-25', source: 'builtin', power_per_meter: 25 });
    const identicalExtended = cable({ model: 'ТЛТ-25', source: 'extended', power_per_meter: 25 });
    const changedExtended = cable({ model: 'ТЛТ-30', source: 'extended', power_per_meter: 30 });
    const { result } = renderOptions({
      cables: [builtin, identicalExtended, changedExtended],
      builtinCables: [builtin],
    });

    const options = result.current.manualCableOptionsForType('self_regulating');

    expect(options.map((option) => option.mark)).toEqual(['ТЛТ-25', 'ТЛТ-30']);
    expect(options[0].label).toBe('ТЛТ-25 · 25 Вт/м');
    expect(options[1].value).toBe(`extended::${encodeURIComponent('ТЛТ-30')}`);
    expect(options[1].cableSource).toBe('extended');
    expect(isValidElement(options[1].label)).toBe(true);
  });

  it('builds TT manual options only from backend cable-options (E7)', () => {
    const { result } = renderOptions({
      available: ['self_regulating_tt'],
      cableSizingEffectiveCableType: 'self_regulating_tt',
    });

    // Without backend payload, TT list is empty (no client q1/q2 path).
    expect(result.current.manualCableOptionsForType('self_regulating_tt')).toEqual([]);
    expect(result.current.cableSizingManualOptions).toEqual([]);

    const manualOptions = result.current.manualCableOptionsForType('self_regulating_tt', [
      {
        model: '30ТТВ2-СР',
        series: 'ТТВ',
        base_model: '30ТТВ2',
        passport_power_w_per_m: 30,
        min_ambient_temperature_c: -40,
        max_product_temperature_c: 120,
        eligible: true,
        unavailable_reason: null,
        nomenclature_code: 'CASE1-30-SR',
      },
      {
        model: '25ТТН2-СТ',
        series: 'ТТН',
        base_model: '25ТТН2',
        passport_power_w_per_m: 25,
        min_ambient_temperature_c: -40,
        max_product_temperature_c: 65,
        eligible: false,
        unavailable_reason: 'ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED',
        nomenclature_code: 'CASE1-25-ST',
      },
    ]);

    expect(manualOptions).toHaveLength(2);
    expect(manualOptions[0].mark).toBe('30ТТВ2-СР');
    expect(manualOptions[0].disabled).toBe(false);
    expect(manualOptions[0].searchLabel).toContain('30.00 Вт/м');
    expect(manualOptions[0].searchLabel).toContain('Tmin -40 °C');
    expect(manualOptions[0].searchLabel).toContain('Tmax 120 °C');
    expect(manualOptions[0].searchLabel).not.toContain('@T3');
    expect(manualOptions[1].disabled).toBe(true);
    expect(manualOptions[1].searchLabel).toContain('температурные пределы не подходят');
  });

  it('adds auto and project options before catalog options when snapshot is missing or changed', () => {
    const builtin = cable({ model: 'ТЛТ-25', source: 'builtin', power_per_meter: 25 });
    const { result } = renderOptions({
      cables: [builtin],
      builtinCables: [builtin],
    });

    const options = result.current.cableMarkOptionsFor('self_regulating', 'ТЛТ-X', calc({
      cable_snapshot: {
        actual_catalog_source: 'extended',
        requested_catalog_source: 'all',
      },
      cable_snapshot_status: { technical_status: 'missing' },
    }));

    expect(options.map((option) => option.value)).toEqual([
      AUTO_CABLE_MARK_VALUE,
      `project::${encodeURIComponent('ТЛТ-X')}`,
      `builtin::${encodeURIComponent('ТЛТ-25')}`,
    ]);
    expect(options[1].cableSource).toBe('extended');
    expect(isValidElement(options[1].label)).toBe(true);
  });

  it('returns no manual options for unavailable cable types', () => {
    const { result } = renderOptions({
      available: ['self_regulating'],
    });

    expect(result.current.manualCableOptionsForType('self_regulating_tt')).toEqual([]);
  });
});
