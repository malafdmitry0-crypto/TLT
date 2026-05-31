import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CableStatusRow } from '@/pages/electrical/elecCalcCableCatalogModel';
import {
  resolveCableCatalogStatuses,
  resolveCableRowsForType,
} from '@/pages/electrical/elecCalcCableCatalogModel';
import type { CableTypeKey } from '@/pages/electrical/elecCalcMainTableModel';
import { useElecCalcCableCatalogView } from '@/pages/electrical/useElecCalcCableCatalogView';

function row(model: string, source: string, extra: Partial<CableStatusRow> = {}): CableStatusRow {
  return {
    model,
    cable_type: 'self_regulating',
    source,
    power_per_meter: 10,
    max_temperature: 65,
    min_temperature: -40,
    ...extra,
  };
}

describe('useElecCalcCableCatalogView', () => {
  it('returns empty visible catalog and default statuses when no cable type is visible', () => {
    const { result } = renderHook(() => useElecCalcCableCatalogView({
      availableCableTypes: new Set<CableTypeKey>(['self_regulating']),
      cables: [row('extended-1', 'extended')],
      builtinCables: [row('builtin-1', 'builtin')],
      ttCables: [],
      effectiveSource: 'all',
      visibleCableTypeControl: null,
    }));

    expect(result.current.visibleCableCatalog).toEqual([]);
    expect(result.current.commercialDataStatus).toEqual({
      label: 'Нет коммерческих данных',
      color: 'default',
    });
    expect(result.current.technicalDataStatus).toEqual({
      label: 'Техданные: несколько типов',
      color: 'default',
    });
  });

  it('derives visible catalog rows and statuses for selected cable type', () => {
    const availableCableTypes = new Set<CableTypeKey>(['self_regulating']);
    const cables = [row('extended-1', 'extended', { price_per_meter: 120 })];
    const builtinCables = [row('builtin-1', 'builtin')];
    const { result } = renderHook(() => useElecCalcCableCatalogView({
      availableCableTypes,
      cables,
      builtinCables,
      ttCables: [],
      effectiveSource: 'all',
      visibleCableTypeControl: 'self_regulating',
    }));
    const expectedRows = resolveCableRowsForType({
      type: 'self_regulating',
      availableCableTypes,
      cables,
      builtinCables,
      ttCables: [],
      effectiveSource: 'all',
    });

    expect(result.current.visibleCableCatalog).toEqual(expectedRows);
    expect(result.current.cableRowsForType('self_regulating')).toEqual(expectedRows);
    expect(result.current.commercialDataStatus).toEqual(
      resolveCableCatalogStatuses('self_regulating', expectedRows).commercialDataStatus,
    );
    expect(result.current.technicalDataStatus).toEqual(
      resolveCableCatalogStatuses('self_regulating', expectedRows).technicalDataStatus,
    );
  });

  it('keeps unavailable cable type catalogs empty', () => {
    const { result } = renderHook(() => useElecCalcCableCatalogView({
      availableCableTypes: new Set<CableTypeKey>(['self_regulating']),
      cables: [row('extended-1', 'extended')],
      builtinCables: [row('builtin-1', 'builtin')],
      ttCables: [row('tt-1', 'builtin')],
      effectiveSource: 'all',
      visibleCableTypeControl: 'self_regulating_tt',
    }));

    expect(result.current.visibleCableCatalog).toEqual([]);
    expect(result.current.cableRowsForType('self_regulating_tt')).toEqual([]);
    expect(result.current.technicalDataStatus).toEqual({
      label: 'Нет техданных',
      color: 'error',
    });
  });
});
