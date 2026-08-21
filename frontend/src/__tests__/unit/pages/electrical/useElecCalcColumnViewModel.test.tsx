import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useElecCalcColumnViewModel } from '@/pages/electrical/useElecCalcColumnViewModel';
import {
  getDefaultElectricalCandidateTableColumnSettings,
  getVisibleElectricalCandidateTableColumnMetas,
} from '@/utils/electricalCandidateTableColumns';
import {
  getDefaultElectricalTableColumnSettings,
  getVisibleElectricalTableColumnMetas,
} from '@/utils/electricalTableColumns';
import {
  getDefaultElectricalTableViewSettings,
  normalizeElectricalTableViewSettings,
  resolveElectricalTableFontSize,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

describe('useElecCalcColumnViewModel', () => {
  it('builds visible column metas, keys and resolved font size from settings', () => {
    const tableColumnSettings = getDefaultElectricalTableColumnSettings();
    const candidateTableColumnSettings = getDefaultElectricalCandidateTableColumnSettings();
    const tableViewSettings: ElectricalTableViewSettings = {
      ...getDefaultElectricalTableViewSettings(),
      tableLabelFormat: 'compact',
    };
    const { result } = renderHook(() => useElecCalcColumnViewModel({
      tableColumnSettings,
      candidateTableColumnSettings,
      tableViewSettings,
    }));

    const expectedElectricalMetas = getVisibleElectricalTableColumnMetas(
      tableColumnSettings,
      'compact',
    );
    const expectedCandidateMetas = getVisibleElectricalCandidateTableColumnMetas(
      candidateTableColumnSettings,
      'compact',
    );

    expect(result.current.normalizedTableViewSettings.tableLabelFormat).toBe('compact');
    expect(result.current.visibleElectricalColumnMetas).toEqual(expectedElectricalMetas);
    expect(result.current.visibleCandidateColumnMetas).toEqual(expectedCandidateMetas);
    expect(result.current.visibleElectricalColumnKeys).toEqual(
      expectedElectricalMetas.map((meta) => meta.key),
    );
    expect(result.current.visibleCandidateColumnKeys).toEqual(
      expectedCandidateMetas.map((meta) => meta.key),
    );
    expect(result.current.resolvedTableFontSize).toEqual(
      resolveElectricalTableFontSize(result.current.normalizedTableViewSettings),
    );
  });

  it('normalizes invalid table view settings before deriving labels and font size', () => {
    const tableColumnSettings = getDefaultElectricalTableColumnSettings();
    const candidateTableColumnSettings = getDefaultElectricalCandidateTableColumnSettings();
    const tableViewSettings = {
      fontSize: 'unknown',
      tableLabelFormat: 'unknown',
      settingsLabelFormat: 'unknown',
      calculationCableSource: 'unknown',
    } as unknown as ElectricalTableViewSettings;
    const { result } = renderHook(() => useElecCalcColumnViewModel({
      tableColumnSettings,
      candidateTableColumnSettings,
      tableViewSettings,
    }));
    const expectedViewSettings = normalizeElectricalTableViewSettings(tableViewSettings);

    expect(result.current.normalizedTableViewSettings).toEqual(expectedViewSettings);
    expect(result.current.visibleElectricalColumnMetas).toEqual(
      getVisibleElectricalTableColumnMetas(
        tableColumnSettings,
        expectedViewSettings.tableLabelFormat,
      ),
    );
    expect(result.current.resolvedTableFontSize).toEqual(
      resolveElectricalTableFontSize(expectedViewSettings),
    );
  });
});
