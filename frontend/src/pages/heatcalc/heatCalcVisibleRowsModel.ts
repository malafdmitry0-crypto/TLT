/**
 * Pure visible-row / enum-options projection for HeatCalc objects table.
 * Query/load session remains in useHeatCalcObjectsDataModel.
 */
import type {
  ObjectQueryFieldCapability,
  ProjectObject,
  ProjectObjectsQueryResponse,
} from '@/types/project';
import type {
  HeatCalcColumnKey,
  HeatCalcObjectType,
  HeatCalcResolvedColumnMeta,
} from '@/utils/heatCalcTableColumns';
import type {
  HeatCalcColumnValueAccessors,
  HeatCalcIndexedTableRow,
} from '@/utils/heatCalcTableFindability';
import {
  INAPPLICABLE_TABLE_VALUE,
  filterKindForColumn,
} from '@/utils/heatCalcPageUtils';
import type { NormalLoadedRowsByType } from '@/pages/heatcalc/useHeatCalcTableState';

export interface HeatCalcVisibleRowsModelOptions {
  activeTableObjectType: HeatCalcObjectType;
  excelBaseRows: ProjectObject[];
  excelModeEnabled: boolean;
  excelRows: ProjectObject[];
  excelTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
  isAllObjectScope: boolean;
  normalLoadedRowsByType: NormalLoadedRowsByType;
  objectQueryResult?: ProjectObjectsQueryResponse;
  visibleAllTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
}

export function buildHeatCalcVisibleRowsModel({
  activeTableObjectType,
  excelBaseRows,
  excelModeEnabled,
  excelRows,
  excelTableRows,
  isAllObjectScope,
  normalLoadedRowsByType,
  objectQueryResult,
  visibleAllTableRows,
}: HeatCalcVisibleRowsModelOptions) {
  const baseVisibleTableObjects = (() => {
    if (excelModeEnabled) return excelBaseRows;
    if (isAllObjectScope) return visibleAllTableRows.map(({ record }) => record);
    const loadedRows = normalLoadedRowsByType[activeTableObjectType];
    if (loadedRows.length > 0) return loadedRows;
    return objectQueryResult?.page_info.page === 1 ? objectQueryResult.items : [];
  })();
  const visibleTableObjects = excelModeEnabled ? excelRows : baseVisibleTableObjects;
  const visibleTableRows = (() => {
    if (excelModeEnabled) return excelTableRows;
    if (isAllObjectScope) return visibleAllTableRows;
    return visibleTableObjects.map((record, index) => ({ record, sourceIndex: index }));
  })();
  return {
    baseVisibleTableObjects,
    visibleTableObjects,
    visibleTableRows,
    visibleSourceIndexById: new Map(visibleTableRows.map(({ record, sourceIndex }) => [record.id, sourceIndex])),
  };
}

export function buildHeatCalcEnumOptionsByColumn({
  allIndexedTableRows,
  fieldCapabilityByKey,
  isAllObjectScope,
  sourceColumnMetas,
  tableValueAccessors,
}: {
  allIndexedTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  isAllObjectScope: boolean;
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  tableValueAccessors: HeatCalcColumnValueAccessors<ProjectObject>;
}) {
  const result: Record<HeatCalcColumnKey, { label: string; value: string }[]> = {};
  for (const meta of sourceColumnMetas) {
    const capability = fieldCapabilityByKey.get(meta.key);
    if (filterKindForColumn(meta.key, capability) !== 'enum') continue;
    if (isAllObjectScope) {
      const values = new Map<string, string>();
      for (const row of allIndexedTableRows) {
        const value = tableValueAccessors[meta.key]?.(row.record, row.sourceIndex);
        if (value == null || value === INAPPLICABLE_TABLE_VALUE) continue;
        const textValue = String(value).trim();
        if (!textValue) continue;
        values.set(textValue, textValue);
      }
      result[meta.key] = [...values.values()]
        .sort((left, right) => left.localeCompare(right, 'ru', { numeric: true, sensitivity: 'base' }))
        .map((value) => ({ label: value, value }));
      continue;
    }
    result[meta.key] = (capability?.options?.items ?? []).map((item) => ({
      label: item.label,
      value: String(item.value),
    }));
  }
  return result;
}

