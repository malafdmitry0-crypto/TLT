import { isValidElement } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CableInfo } from '@/api/calculations';
import { AUTO_CABLE_MARK_VALUE } from '@/pages/electrical/elecCalcCableOptionModel';
import { useElecCalcCableMarkOptions } from '@/pages/electrical/useElecCalcCableMarkOptions';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { CableTtEntry, ResistiveCablesReference } from '@/types/reference';

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

function ttCable(overrides: Partial<CableTtEntry> = {}): CableTtEntry {
  return {
    model: '30ТТВ2',
    series: 'ТТВ',
    nominal_power: 30,
    q1: 1,
    q2: 2,
    max_product_temp: 80,
    max_vapor_temp: 150,
    voltage: 220,
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
  ttCables?: CableTtEntry[];
  resistiveCables?: ResistiveCablesReference;
  builtinResistiveCables?: ResistiveCablesReference;
  aggressiveProduct?: boolean;
  cableSizingEffectiveCableType?: CableTypeKey;
} = {}) {
  return renderHook(
    (props: Required<typeof options>) => useElecCalcCableMarkOptions({
      availableCableTypes: availableTypes(...props.available),
      cables: props.cables,
      builtinCables: props.builtinCables,
      ttCables: props.ttCables,
      resistiveCables: props.resistiveCables,
      builtinResistiveCables: props.builtinResistiveCables,
      effectiveSource: 'all',
      aggressiveProduct: props.aggressiveProduct,
      cableSizingEffectiveCableType: props.cableSizingEffectiveCableType,
    }),
    {
      initialProps: {
        available: ['self_regulating'],
        cables: [],
        builtinCables: [],
        ttCables: [],
        resistiveCables: { single_core: [], three_core: [], common: {} },
        builtinResistiveCables: { single_core: [], three_core: [], common: {} },
        aggressiveProduct: false,
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

  it('builds TT suffixes from aggressive product mode and exposes sizing options', () => {
    // Первоисточник (Расчет_спецификации_трубы_самрег29_05_26.xlsx):
    // агрессивная среда → -СР, неагрессивная → -СТ.
    const { result } = renderOptions({
      available: ['self_regulating_tt'],
      ttCables: [ttCable()],
      aggressiveProduct: true,
      cableSizingEffectiveCableType: 'self_regulating_tt',
    });

    const manualOptions = result.current.manualCableOptionsForType('self_regulating_tt');

    expect(manualOptions).toHaveLength(1);
    expect(manualOptions[0].mark).toBe('30ТТВ2-СР');
    expect(manualOptions[0].searchLabel).toBe('30ТТВ2-СР · ТТВ · 30 Вт/м');
    expect(result.current.cableSizingManualOptions.map((option) => option.mark))
      .toEqual(['30ТТВ2-СР']);
  });

  it('builds TT suffix -СТ for non-aggressive product', () => {
    const { result } = renderOptions({
      available: ['self_regulating_tt'],
      ttCables: [ttCable()],
      aggressiveProduct: false,
      cableSizingEffectiveCableType: 'self_regulating_tt',
    });

    const manualOptions = result.current.manualCableOptionsForType('self_regulating_tt');
    expect(manualOptions.map((option) => option.mark)).toEqual(['30ТТВ2-СТ']);
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
      ttCables: [ttCable()],
    });

    expect(result.current.manualCableOptionsForType('self_regulating_tt')).toEqual([]);
  });
});
