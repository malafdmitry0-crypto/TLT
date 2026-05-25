import type { HeatCalcObjectType, ProjectObject } from '@/types/project';
import {
  isDraftRowDirty,
  isDraftRowEmpty,
  type DraftRowState,
  type DraftRowsById,
} from '@/utils/heatCalcInlineEdit';
import {
  EXCEL_NEW_ROW_PREFIX,
  isExcelDraftRowBlank,
  isExcelNewRowId,
} from '@/utils/heatCalcExcelMode';

export type ExcelLocalProjectObject = ProjectObject & {
  __excelInsertAfterObjectId?: string | null;
};

export const MIN_TRAILING_EXCEL_INPUT_ROWS = 20;

interface BuildExcelLocalRowsOptions {
  count: number;
  objectType: HeatCalcObjectType;
  projectId: string;
  projectObjectCount: number;
  startSeq: number;
  insertAfterObjectId?: string | null;
  nowIso?: string;
}

interface BuildExcelLocalRowsResult {
  rows: ExcelLocalProjectObject[];
  nextSeq: number;
}

interface ExcelRowsModelOptions {
  localRows: ExcelLocalProjectObject[];
  draftRowsById: DraftRowsById;
  rowIds: string[];
}

export function buildExcelLocalRows({
  count,
  objectType,
  projectId,
  projectObjectCount,
  startSeq,
  insertAfterObjectId = null,
  nowIso = new Date().toISOString(),
}: BuildExcelLocalRowsOptions): BuildExcelLocalRowsResult {
  const rowCount = Math.max(0, Math.trunc(count));
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const seq = startSeq + index;
    return {
      id: `${EXCEL_NEW_ROW_PREFIX}${objectType}:${seq}`,
      project_id: projectId,
      object_type: objectType,
      sort_order: projectObjectCount + seq,
      version: 0,
      params: {},
      results: null,
      is_valid: false,
      validation_errors: null,
      created_at: nowIso,
      updated_at: nowIso,
      __excelInsertAfterObjectId: insertAfterObjectId,
    };
  });
  return { rows, nextSeq: startSeq + rowCount };
}

export function getActiveExcelLocalRows(
  localRows: ExcelLocalProjectObject[],
  objectType: HeatCalcObjectType,
): ExcelLocalProjectObject[] {
  return localRows.filter((row) => row.object_type === objectType);
}

export function mergeExcelLocalRows(
  baseRows: ProjectObject[],
  localRows: ExcelLocalProjectObject[],
): ProjectObject[] {
  const rowsByAnchor = new Map<string | null, ExcelLocalProjectObject[]>();
  localRows.forEach((row) => {
    const anchorId = row.__excelInsertAfterObjectId ?? null;
    const rows = rowsByAnchor.get(anchorId) ?? [];
    rows.push(row);
    rowsByAnchor.set(anchorId, rows);
  });

  const rows: ProjectObject[] = [];
  const pushRow = (row: ProjectObject) => {
    rows.push(row);
    rowsByAnchor.get(row.id)?.forEach(pushRow);
  };
  baseRows.forEach(pushRow);
  rowsByAnchor.get(null)?.forEach(pushRow);
  return rows;
}

export function removeDraftRowsByIds(
  draftRowsById: DraftRowsById,
  rowIds?: Iterable<string>,
): DraftRowsById {
  const ids = rowIds ? [...rowIds] : Object.keys(draftRowsById);
  if (ids.length === 0) return draftRowsById;
  const next = { ...draftRowsById };
  ids.forEach((id) => {
    delete next[id];
  });
  return next;
}

export function pruneExcelLocalRowsByIds(
  localRows: ExcelLocalProjectObject[],
  rowIds: Iterable<string>,
): ExcelLocalProjectObject[] {
  const ids = new Set(rowIds);
  if (ids.size === 0) return localRows;
  return localRows.filter((row) => !ids.has(row.id));
}

export function countTrailingBlankExcelInputRows(
  rows: ProjectObject[],
  draftRowsById: DraftRowsById,
): number {
  let count = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row || !isExcelNewRowId(row.id) || !isExcelDraftRowBlank(draftRowsById[row.id])) {
      break;
    }
    count += 1;
  }
  return count;
}

export function missingTrailingExcelInputRows(
  rows: ProjectObject[],
  draftRowsById: DraftRowsById,
  minimumCount = MIN_TRAILING_EXCEL_INPUT_ROWS,
): number {
  return Math.max(0, minimumCount - countTrailingBlankExcelInputRows(rows, draftRowsById));
}

export function removeExcelRowsFromModel({
  localRows,
  draftRowsById,
  rowIds,
}: ExcelRowsModelOptions) {
  const localIds = rowIds.filter(isExcelNewRowId);
  const persistedIds = rowIds.filter((id) => !isExcelNewRowId(id));
  return {
    localIds,
    persistedIds,
    localRows: pruneExcelLocalRowsByIds(localRows, localIds),
    draftRowsById: removeDraftRowsByIds(draftRowsById, localIds),
  };
}

export function resetExcelRowsInModel({
  localRows,
  draftRowsById,
  rowIds,
}: ExcelRowsModelOptions) {
  const ids = new Set(rowIds);
  return {
    localRows: localRows.filter((row) => {
      if (!ids.has(row.id)) return true;
      return !isExcelDraftRowBlank(draftRowsById[row.id]);
    }),
    draftRowsById: removeDraftRowsByIds(draftRowsById, ids),
  };
}

export function isSavableExcelDraftRow(row: DraftRowState | undefined) {
  return (
    isDraftRowDirty(row)
    && !(row && isExcelNewRowId(row.objectId) && isExcelDraftRowBlank(row))
  );
}

export function applyExcelDraftRowPatch(
  draftRowsById: DraftRowsById,
  recordId: string,
  draftRow: DraftRowState | null | undefined,
): DraftRowsById {
  if (
    !draftRow
    || isDraftRowEmpty(draftRow)
    || (
      isExcelNewRowId(recordId)
      && isExcelDraftRowBlank(draftRow)
      && Object.keys(draftRow.errors).length === 0
    )
  ) {
    if (!Object.prototype.hasOwnProperty.call(draftRowsById, recordId)) return draftRowsById;
    const next = { ...draftRowsById };
    delete next[recordId];
    return next;
  }
  return {
    ...draftRowsById,
    [recordId]: draftRow,
  };
}
