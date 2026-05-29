import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { useHeatCalcExcelRowsModel } from '@/hooks/useHeatCalcExcelRowsModel';
import type { HeatCalcExcelCellRef } from '@/hooks/useHeatCalcExcelSelection';
import type { ProjectObject } from '@/types/project';
import type { HeatCalcObjectType } from '@/utils/heatCalcTableColumns';
import type {
  HeatCalcColumnValueAccessors,
  HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import {
  applyFormFieldDraft,
  applyInlineCellDraft,
  getInlineEditFieldConfig,
  type DraftRowState,
  type DraftRowsById,
} from '@/utils/heatCalcInlineEdit';
import type { ExcelSelectionRange } from '@/utils/heatCalcExcelMode';
import {
  applyExcelDraftRowPatch,
  buildExcelLocalRows,
  MIN_TRAILING_EXCEL_INPUT_ROWS,
  missingTrailingExcelInputRows,
  removeDraftRowsByIds,
  type ExcelLocalProjectObject,
} from '@/utils/heatCalcExcelRows';
import { draftRowFingerprint } from '@/pages/heatcalc/heatCalcPageUtils';

type SetDraftRowsById = Dispatch<SetStateAction<DraftRowsById>>;
type SetExcelLocalRows = Dispatch<SetStateAction<ExcelLocalProjectObject[]>>;

interface UseHeatCalcInlineDraftModelOptions {
  projectId?: string;
  activeObjectType: HeatCalcObjectType;
  projectObjectCount: number;
  excelModeEnabled: boolean;
  allProjectObjects: ProjectObject[];
  tableViewState: HeatCalcTableViewState;
  tableValueAccessors: HeatCalcColumnValueAccessors<ProjectObject>;
  selectedExcelCell: HeatCalcExcelCellRef;
  excelSelectionRange: ExcelSelectionRange | null;
  editableExcelColumnKeys: string[];
  onProjectReset?: () => void;
}

function canDraftObject(record: ProjectObject | null | undefined): record is ProjectObject & {
  object_type: HeatCalcObjectType;
} {
  return record?.object_type === 'pipe' || record?.object_type === 'tank';
}

export function useHeatCalcInlineDraftModel({
  projectId,
  activeObjectType,
  projectObjectCount,
  excelModeEnabled,
  allProjectObjects,
  tableViewState,
  tableValueAccessors,
  selectedExcelCell,
  excelSelectionRange,
  editableExcelColumnKeys,
  onProjectReset,
}: UseHeatCalcInlineDraftModelOptions) {
  const [activeInlineCell, setActiveInlineCell] = useState<HeatCalcExcelCellRef>(null);
  const [draftRowsById, setDraftRowsById] = useState<DraftRowsById>({});
  const [excelLocalRows, setExcelLocalRows] = useState<ExcelLocalProjectObject[]>([]);
  const excelNewRowSeqRef = useRef(0);
  const pendingExcelInputRowsRef = useRef<{
    objectType: HeatCalcObjectType;
    rowCount: number;
    missingCount: number;
  } | null>(null);
  const onProjectResetRef = useRef(onProjectReset);

  useEffect(() => {
    onProjectResetRef.current = onProjectReset;
  }, [onProjectReset]);

  useEffect(() => {
    excelNewRowSeqRef.current = 0;
    pendingExcelInputRowsRef.current = null;
    setExcelLocalRows([]);
    setActiveInlineCell(null);
    setDraftRowsById({});
    onProjectResetRef.current?.();
  }, [projectId]);

  const createExcelLocalRows = useCallback((
    count: number,
    insertAfterObjectId: string | null = null,
  ): ExcelLocalProjectObject[] => {
    const result = buildExcelLocalRows({
      count,
      objectType: activeObjectType,
      projectId: projectId ?? '',
      projectObjectCount,
      startSeq: excelNewRowSeqRef.current,
      insertAfterObjectId,
    });
    excelNewRowSeqRef.current = result.nextSeq;
    return result.rows;
  }, [activeObjectType, projectId, projectObjectCount]);

  const appendExcelLocalRows = useCallback((count: number, insertAfterObjectId: string | null = null) => {
    const rows = createExcelLocalRows(count, insertAfterObjectId);
    if (rows.length > 0) setExcelLocalRows((current) => [...current, ...rows]);
    return rows;
  }, [createExcelLocalRows]);

  const excelRowsModel = useHeatCalcExcelRowsModel({
    excelModeEnabled,
    allProjectObjects,
    activeObjectType,
    tableViewState,
    tableValueAccessors,
    localRows: excelLocalRows,
    selectedCell: selectedExcelCell,
    selectionRange: excelSelectionRange,
    editableColumnKeys: editableExcelColumnKeys,
  });

  const missingExcelInputRowCount = useMemo(
    () => (excelModeEnabled
      ? missingTrailingExcelInputRows(excelRowsModel.rows, draftRowsById)
      : 0),
    [draftRowsById, excelModeEnabled, excelRowsModel.rows],
  );

  useEffect(() => {
    if (!excelModeEnabled || missingExcelInputRowCount <= 0) {
      pendingExcelInputRowsRef.current = null;
      return;
    }
    const pendingInputRows = pendingExcelInputRowsRef.current;
    if (
      pendingInputRows
      && pendingInputRows.objectType === activeObjectType
      && pendingInputRows.rowCount === excelRowsModel.rows.length
      && pendingInputRows.missingCount === missingExcelInputRowCount
    ) {
      return;
    }
    pendingExcelInputRowsRef.current = {
      objectType: activeObjectType,
      rowCount: excelRowsModel.rows.length,
      missingCount: missingExcelInputRowCount,
    };
    appendExcelLocalRows(missingExcelInputRowCount);
  }, [
    activeObjectType,
    appendExcelLocalRows,
    excelModeEnabled,
    excelRowsModel.rows.length,
    missingExcelInputRowCount,
  ]);

  const extendExcelInputRowsOnScroll = useCallback(() => {
    if (!excelModeEnabled) return;
    appendExcelLocalRows(MIN_TRAILING_EXCEL_INPUT_ROWS);
  }, [appendExcelLocalRows, excelModeEnabled]);

  const discardDraftRows = useCallback((rowIds?: string[]) => {
    setActiveInlineCell(null);
    setDraftRowsById((current) => removeDraftRowsByIds(current, rowIds));
  }, []);

  const commitInlineCell = useCallback((
    record: ProjectObject,
    columnKey: string,
    value: unknown,
  ) => {
    const config = canDraftObject(record)
      ? getInlineEditFieldConfig(record.object_type, columnKey)
      : null;
    if (!config) return 'Поле недоступно для редактирования';
    const currentDraftRow = draftRowsById[record.id] ?? null;
    const draftRowForResult = applyInlineCellDraft(currentDraftRow, record, columnKey, value);
    if (!draftRowForResult) return null;
    const commitError = draftRowForResult.errors[config.fieldId] ?? null;

    setDraftRowsById((current) => {
      const nextRow = current[record.id] === currentDraftRow
        ? draftRowForResult
        : applyInlineCellDraft(current[record.id] ?? null, record, columnKey, value);
      if (!nextRow) return current;
      return applyExcelDraftRowPatch(current, record.id, nextRow);
    });
    if (!commitError) {
      setActiveInlineCell(null);
    }
    return commitError;
  }, [draftRowsById]);

  const handleWizardDraftValuesChange = useCallback((
    record: ProjectObject | null | undefined,
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => {
    if (!canDraftObject(record)) return;
    const fieldIds = Object.keys(changedValues);
    if (fieldIds.length === 0) return;

    setDraftRowsById((current) => {
      let nextRow: DraftRowState | null = current[record.id] ?? null;
      const before = draftRowFingerprint(nextRow);
      fieldIds.forEach((fieldId) => {
        const value = Object.prototype.hasOwnProperty.call(allValues, fieldId)
          ? allValues[fieldId]
          : changedValues[fieldId];
        nextRow = applyFormFieldDraft(nextRow, record, fieldId, value);
      });
      if (!nextRow) return current;
      const after = draftRowFingerprint(nextRow);
      if (before === after) return current;
      return applyExcelDraftRowPatch(current, record.id, nextRow);
    });
  }, []);

  return {
    activeInlineCell,
    setActiveInlineCell,
    draftRowsById,
    setDraftRowsById: setDraftRowsById as SetDraftRowsById,
    excelLocalRows,
    setExcelLocalRows: setExcelLocalRows as SetExcelLocalRows,
    createExcelLocalRows,
    appendExcelLocalRows,
    missingExcelInputRowCount,
    extendExcelInputRowsOnScroll,
    discardDraftRows,
    commitInlineCell,
    handleWizardDraftValuesChange,
    excelBaseRows: excelRowsModel.baseRows,
    excelRows: excelRowsModel.rows,
    excelTableRows: excelRowsModel.indexedRows,
    excelRowIds: excelRowsModel.rowIds,
    activeExcelCellPosition: excelRowsModel.activeCell,
    selectedExcelRows: excelRowsModel.selectedRows,
  };
}
