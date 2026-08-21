/**
 * Pure table-row / accessor builders for useHeatCalcObjectsDataModel (P-BAND-18).
 */
import type { ProjectObject } from '@/types/project';
import {
  HEATCALC_TABLE_COLUMN_CATALOG,
  type HeatCalcColumnKey,
} from '@/utils/heatCalcTableColumns';
import type {
  HeatCalcColumnValueAccessors,
  HeatCalcIndexedTableRow,
} from '@/utils/heatCalcTableFindability';
import {
  INAPPLICABLE_TABLE_VALUE,
  isColumnApplicableToObjectType,
} from '@/utils/heatCalcPageUtils';
import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import { MATERIAL_LABELS } from '@/constants/materials';
import { insulationEntryLabel } from '@/utils/heatCalcPageUtils';
import type { InsulationEntry } from '@/types/reference';

export function buildInsulationLabelByCode(insulationMaterials: InsulationEntry[]) {
  return new Map(insulationMaterials.map((m) => [m.material, insulationEntryLabel(m)]));
}

export function resolveInsulationLabel(
  insulationLabelByCode: Map<string, string>,
  material: unknown,
): string {
  const code = String(material ?? '');
  if (!code) return '—';
  return insulationLabelByCode.get(code) ?? MATERIAL_LABELS[code] ?? code;
}

export function buildHeatCalcTableValueAccessors(
  columnRenderers: Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>,
): HeatCalcColumnValueAccessors<ProjectObject> {
  const accessors: HeatCalcColumnValueAccessors<ProjectObject> = {};
  for (const meta of HEATCALC_TABLE_COLUMN_CATALOG.all) {
    accessors[meta.key] = (record, sourceIndex) => {
      if (!isColumnApplicableToObjectType(meta.key, record.object_type)) {
        return INAPPLICABLE_TABLE_VALUE;
      }
      return columnRenderers[meta.key].copyValue(record, sourceIndex);
    };
  }
  return accessors;
}

export function buildAllIndexedTableRows(
  allProjectObjects: ProjectObject[],
): HeatCalcIndexedTableRow<ProjectObject>[] {
  return allProjectObjects
    .filter((object) => object.object_type === 'pipe' || object.object_type === 'tank')
    .sort((left, right) => {
      const bySortOrder = left.sort_order - right.sort_order;
      if (bySortOrder !== 0) return bySortOrder;
      return left.created_at.localeCompare(right.created_at);
    })
    .map((record, index) => ({ record, sourceIndex: index }));
}

export function resolveObjectCountsFromSummary(
  objectsSummary: { total?: number; by_type?: { pipe?: number; tank?: number } } | undefined,
  activeObjectScope: 'all' | 'pipe' | 'tank',
) {
  const pipeCount = objectsSummary?.by_type?.pipe ?? 0;
  const tankCount = objectsSummary?.by_type?.tank ?? 0;
  const projectObjectCount = objectsSummary?.total ?? pipeCount + tankCount;
  const totalCount = activeObjectScope === 'all'
    ? projectObjectCount
    : objectsSummary?.by_type?.[activeObjectScope] ?? 0;
  return { pipeCount, tankCount, projectObjectCount, totalCount };
}
