import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';

import { getCableMarkSource } from '@/domain/electrical/elecCalcResultValueModel';

export function filterVisibleSelectedRowKeys(
  selectedRowKeys: readonly string[],
  objects: readonly Pick<ProjectObject, 'id'>[],
) {
  const visibleIds = new Set(objects.map((object) => object.id));
  const nextKeys = selectedRowKeys.filter((key) => visibleIds.has(key));
  return nextKeys.length === selectedRowKeys.length
    && nextKeys.every((key, index) => key === selectedRowKeys[index])
    ? selectedRowKeys
    : nextKeys;
}

export function selectedObjectsForKeys(
  objects: readonly ProjectObject[],
  selectedRowKeys: readonly string[],
) {
  const selectedIds = new Set(selectedRowKeys);
  return objects.filter((object) => selectedIds.has(object.id));
}

export function countValidSelectedObjects(objects: readonly Pick<ProjectObject, 'is_valid'>[]) {
  return objects.filter((object) => object.is_valid).length;
}

export function countManualCableRows(
  objectIds: readonly string[],
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>,
) {
  return objectIds.reduce(
    (count, objectId) =>
      count + (getCableMarkSource(calcByObjectId[objectId]) === 'manual' ? 1 : 0),
    0,
  );
}

export function objectIdsForSelection(objects: readonly Pick<ProjectObject, 'id'>[]) {
  return objects.map((object) => object.id);
}

export function selectedRecalcDisabledTooltip(
  selectedObjectsCount: number,
  selectedValidObjectsCount: number,
) {
  return selectedObjectsCount > 0 && selectedValidObjectsCount === 0
    ? 'Сначала рассчитайте теплопотери для выбранных объектов'
    : undefined;
}

export function formatSelectedRecalcCountLabel(
  selectedObjectsCount: number,
  selectedValidObjectsCount: number,
) {
  const failedCount = selectedObjectsCount - selectedValidObjectsCount;
  return failedCount > 0
    ? `${selectedValidObjectsCount}/${selectedObjectsCount}`
    : String(selectedObjectsCount);
}
