import { useMemo } from 'react';

import {
  getVisibleElectricalCandidateTableColumnMetas,
  type ElectricalCandidateTableColumnSettings,
} from '@/utils/electricalCandidateTableColumns';
import {
  getVisibleElectricalTableColumnMetas,
  type ElectricalTableColumnSettings,
} from '@/utils/electricalTableColumns';
import {
  normalizeElectricalTableViewSettings,
  resolveElectricalTableFontSize,
  type ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';

type UseElecCalcColumnViewModelOptions = {
  tableColumnSettings: ElectricalTableColumnSettings;
  candidateTableColumnSettings: ElectricalCandidateTableColumnSettings;
  tableViewSettings: ElectricalTableViewSettings;
};

export function useElecCalcColumnViewModel({
  tableColumnSettings,
  candidateTableColumnSettings,
  tableViewSettings,
}: UseElecCalcColumnViewModelOptions) {
  const normalizedTableViewSettings = useMemo(
    () => normalizeElectricalTableViewSettings(tableViewSettings),
    [tableViewSettings],
  );
  const visibleElectricalColumnMetas = useMemo(
    () => getVisibleElectricalTableColumnMetas(
      tableColumnSettings,
      normalizedTableViewSettings.tableLabelFormat,
    ),
    [normalizedTableViewSettings.tableLabelFormat, tableColumnSettings],
  );
  const visibleCandidateColumnMetas = useMemo(
    () => getVisibleElectricalCandidateTableColumnMetas(
      candidateTableColumnSettings,
      normalizedTableViewSettings.tableLabelFormat,
    ),
    [candidateTableColumnSettings, normalizedTableViewSettings.tableLabelFormat],
  );
  const resolvedTableFontSize = useMemo(
    () => resolveElectricalTableFontSize(normalizedTableViewSettings),
    [normalizedTableViewSettings],
  );
  const visibleElectricalColumnKeys = useMemo(
    () => visibleElectricalColumnMetas.map((meta) => meta.key),
    [visibleElectricalColumnMetas],
  );
  const visibleCandidateColumnKeys = useMemo(
    () => visibleCandidateColumnMetas.map((meta) => meta.key),
    [visibleCandidateColumnMetas],
  );

  return {
    normalizedTableViewSettings,
    visibleElectricalColumnMetas,
    visibleCandidateColumnMetas,
    resolvedTableFontSize,
    visibleElectricalColumnKeys,
    visibleCandidateColumnKeys,
  };
}
