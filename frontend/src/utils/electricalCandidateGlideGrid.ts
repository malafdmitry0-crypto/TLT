import type {
  ElectricalCandidateColumnKey,
  ElectricalCandidateResolvedColumnMeta,
} from '@/utils/electricalCandidateTableColumns';
import type { HeatCalcGlideGridColumn } from '@/utils/heatCalcGlideGrid';

export type ElectricalCandidateGlideFilterKind = 'text' | 'numberRange' | 'enum' | 'boolean';

export function buildElectricalCandidateGlideColumns({
  columns,
  enumOptionsByColumn,
  getFilterKind,
}: {
  columns: ElectricalCandidateResolvedColumnMeta[];
  enumOptionsByColumn: Record<string, Array<{ value: string; label: string }>>;
  getFilterKind: (key: ElectricalCandidateColumnKey) => ElectricalCandidateGlideFilterKind;
}): HeatCalcGlideGridColumn[] {
  return columns.map((column) => {
    const filterable = column.key !== 'actions';
    return {
      key: column.key,
      title: column.title,
      label: column.label,
      width: Math.max(column.width, column.minWidthPx),
      minWidthPx: column.minWidthPx,
      resizable: true,
      align: column.align,
      sortable: filterable,
      filterable,
      filterKind: getFilterKind(column.key),
      enumOptions: enumOptionsByColumn[column.key] ?? [],
    };
  });
}
