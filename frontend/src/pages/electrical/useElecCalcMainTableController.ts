/**
 * @module electrical/main-table-controller
 * @owner electrical
 * Owns: main table Ant/Glide columns & cells, layout commit, cell actions, row
 *   class, dimensions, selected-row clipboard, pagination/infinite-load nav.
 * Writes: none (no local React state). Side-effect: clipboard keydown listener.
 * Does-not: queries, batch jobs, mark/sizing modals, candidate workflow
 *   mutations, column preference persistence, summary chrome.
 * Note: candidate Glide column artifacts are a temporary byproduct of the shared
 *   glide-column model until ELEC2 owns the candidate table surface.
 */
import { useCallback, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';

import type { CableSource } from '@/api/calculations';
import type { CableTypeKey } from '@/domain/electrical/elecCalcMainTableModel';
import { resolveTotalObjectsCount } from '@/pages/electrical/elecCalcWorkspaceSummaryChromeModel';
import { useElecCalcAntTableHandlers } from '@/pages/electrical/useElecCalcAntTableHandlers';
import { useElecCalcElectricalColumnCopyValue } from '@/pages/electrical/useElecCalcElectricalColumnCopyValue';
import { useElecCalcElectricalColumnRenderers } from '@/pages/electrical/useElecCalcElectricalColumnRenderers';
import { useElecCalcElectricalColumns } from '@/pages/electrical/useElecCalcElectricalColumns';
import { useElecCalcGlideActions } from '@/pages/electrical/useElecCalcGlideActions';
import { useElecCalcGlideCellState } from '@/pages/electrical/useElecCalcGlideCellState';
import { useElecCalcGlideColumnModel } from '@/pages/electrical/useElecCalcGlideColumnModel';
import {
  useElecCalcGlideLayoutCommit,
  type ElectricalLayoutMutatePayload,
} from '@/pages/electrical/useElecCalcGlideLayoutCommit';
import { useElecCalcRowClassName } from '@/pages/electrical/useElecCalcRowClassName';
import { useElecCalcSelectedRowsClipboardEffect } from '@/pages/electrical/useElecCalcSelectedRowsClipboardEffect';
import { useElecCalcTableDimensions } from '@/pages/electrical/useElecCalcTableDimensions';
import { useElecCalcTableNavigation } from '@/pages/electrical/useElecCalcTableNavigation';
import type { ElectricalCalcSummary, ElectricalPageSummary } from '@/types/calculation';
import type { ObjectQueryFieldCapability, ProjectObject, ProjectObjectsPageCursor } from '@/types/project';
import type { ElectricalCandidateResolvedColumnMeta } from '@/utils/electricalCandidateTableColumns';
import type { ElectricalColumnKey, ElectricalResolvedColumnMeta } from '@/utils/electricalTableColumns';
import type { HeatCalcColumnFilter, HeatCalcTableViewState } from '@/utils/heatCalcTableFindability';

type EnumOpts = Array<{ value: string; label: string }>;
type RecalcValues = {
  aggressiveProduct: boolean;
  connectionType: string;
  heatingHeight: number | null;
  layingStep: number | null;
  maintainTemperature: number | null;
  supplyVoltage: number | null;
  vaporTemperature: number | null;
  windingCoefficient: number | null;
};
type LoadNextPage = (options: {
  isFetching: boolean;
  hasNextPage: boolean;
  nextCursor?: ProjectObjectsPageCursor | null;
}) => void;

export type UseElecCalcMainTableControllerArgs = {
  activeRowId: string | null;
  activateRowId: (objectId: string) => void;
  canMutate: boolean;
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  candidateEnumOptionsByColumn: Record<string, EnumOpts>;
  effectiveSource: CableSource;
  electricalDisplayOffset: number;
  electricalGlideEnabled: boolean;
  electricalLayoutMutate: (payload: ElectricalLayoutMutatePayload) => void;
  enumOptionsByColumn: Record<string, EnumOpts>;
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  filteredCount?: number;
  getCalculatedCableTypeForObject: (objectId: string) => CableTypeKey | null;
  getObjectActionDisabledReason: (obj: ProjectObject) => string | null;
  getObjectCalculationDisabledReason: (obj: ProjectObject) => string | null;
  getSavedCableTypeForObject: (objectId: string) => CableTypeKey;
  hasNextPage: boolean;
  isCableMarkPending: boolean;
  isElectricalPageFetching: boolean;
  loadNextElectricalGlidePage: LoadNextPage;
  nextElectricalPageCursor?: ProjectObjectsPageCursor | null;
  objects: readonly ProjectObject[];
  openCableMarkModal: (obj: ProjectObject) => void;
  openCableSizingModal: (obj: ProjectObject) => void;
  pageSummary?: ElectricalPageSummary;
  projectSelected: boolean;
  recalc: RecalcValues;
  selectedRowKeys: readonly string[];
  setColumnFilter: (columnKey: ElectricalColumnKey, filter?: HeatCalcColumnFilter) => void;
  setTablePage: (page: number) => void;
  setTablePageSize: (pageSize: number) => void;
  setTableViewState: Dispatch<SetStateAction<HeatCalcTableViewState>>;
  startColumnResize: (
    column: ElectricalResolvedColumnMeta,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  resetColumnFilter: (columnKey: ElectricalColumnKey) => void;
  tablePage: number;
  tablePageSize: number;
  tableViewState: HeatCalcTableViewState;
  visibleCandidateColumnMetas: readonly ElectricalCandidateResolvedColumnMeta[];
  visibleElectricalColumnMetas: readonly ElectricalResolvedColumnMeta[];
};

export function useElecCalcMainTableController(args: UseElecCalcMainTableControllerArgs) {
  const {
    activeRowId, activateRowId, canMutate, calcByObjectId, candidateEnumOptionsByColumn,
    effectiveSource, electricalDisplayOffset, electricalGlideEnabled, electricalLayoutMutate,
    enumOptionsByColumn, fieldCapabilityByKey, filteredCount, getCalculatedCableTypeForObject,
    getObjectActionDisabledReason, getObjectCalculationDisabledReason, getSavedCableTypeForObject,
    hasNextPage, isCableMarkPending, isElectricalPageFetching, loadNextElectricalGlidePage,
    nextElectricalPageCursor, objects, openCableMarkModal, openCableSizingModal, pageSummary,
    projectSelected, recalc, selectedRowKeys, setColumnFilter, setTablePage, setTablePageSize,
    setTableViewState, startColumnResize, resetColumnFilter, tablePage, tablePageSize,
    tableViewState, visibleCandidateColumnMetas, visibleElectricalColumnMetas,
  } = args;

  const { handleElectricalTableChange } = useElecCalcAntTableHandlers({
    setTablePage, setTablePageSize, setTableViewState,
  });

  const electricalColumnRenderers = useElecCalcElectricalColumnRenderers({
    activeRowId, calcByObjectId, electricalDisplayOffset, getCalculatedCableTypeForObject,
    isCableMarkPending, projectSelected, canMutate, recalc, getObjectActionDisabledReason,
    openCableMarkModal, openCableSizingModal,
  });

  const electricalColumns = useElecCalcElectricalColumns({
    visibleElectricalColumnMetas, electricalColumnRenderers, fieldCapabilityByKey,
    enumOptionsByColumn, tableViewState, onColumnResizeStart: startColumnResize,
    onSetColumnFilter: setColumnFilter, onResetColumnFilter: resetColumnFilter,
  });

  const getElectricalGlideColumnAlign = useCallback(
    (key: ElectricalColumnKey) => electricalColumnRenderers[key]?.align,
    [electricalColumnRenderers],
  );

  const {
    electricalGlideColumns,
    candidateGlideColumnMetaByKey,
    electricalCandidateGlideColumns,
  } = useElecCalcGlideColumnModel({
    visibleElectricalColumnMetas, fieldCapabilityByKey, enumOptionsByColumn,
    getElectricalColumnAlign: getElectricalGlideColumnAlign, visibleCandidateColumnMetas,
    candidateEnumOptionsByColumn,
  });

  const electricalColumnCopyValue = useElecCalcElectricalColumnCopyValue({
    calcByObjectId, electricalDisplayOffset,
    getCableTypeForObject: getCalculatedCableTypeForObject,
    layingStep: recalc.layingStep, heatingHeight: recalc.heatingHeight,
    connectionType: recalc.connectionType, supplyVoltage: recalc.supplyVoltage,
    windingCoefficient: recalc.windingCoefficient, vaporTemperature: recalc.vaporTemperature,
    maintainTemperature: recalc.maintainTemperature, aggressiveProduct: recalc.aggressiveProduct,
  });

  const {
    isElectricalLayoutCellEditable,
    handleElectricalGlideStartCellEdit,
    handleElectricalGlideCommitCell,
  } = useElecCalcGlideLayoutCommit({
    canMutate, projectSelected, effectiveSource, calcByObjectId,
    getCableTypeForObject: getSavedCableTypeForObject, getObjectCalculationDisabledReason,
    isCableMarkPending, electricalLayoutMutate, activateRowId,
  });

  const {
    getElectricalGlideCellActions,
    handleElectricalGlideCellAction,
  } = useElecCalcGlideActions({
    activeRowId, projectSelected, canMutate, isCableMarkPending, getObjectActionDisabledReason,
    onOpenCableMarkModal: openCableMarkModal, onOpenCableSizingModal: openCableSizingModal,
  });

  const getElectricalGlideCellState = useElecCalcGlideCellState({
    calcByObjectId, electricalColumnCopyValue, isElectricalLayoutCellEditable,
    getColumnAlign: getElectricalGlideColumnAlign, getCellActions: getElectricalGlideCellActions,
  });

  useElecCalcSelectedRowsClipboardEffect({
    electricalColumnCopyValue, objects, selectedRowKeys, visibleElectricalColumnMetas,
  });

  const { electricalTableScrollX, electricalTableScrollY } = useElecCalcTableDimensions({
    visibleElectricalColumnMetas,
  });
  const electricalRowClassName = useElecCalcRowClassName({ activeRowId, calcByObjectId });
  const totalObjects = resolveTotalObjectsCount(pageSummary?.total_objects, objects.length);

  const {
    electricalPagination,
    electricalInfiniteLoading,
    handleElectricalGlidePageChange,
    handleElectricalGlideLoadMore,
  } = useElecCalcTableNavigation({
    tablePage, tablePageSize, totalObjects, filteredCount, electricalGlideEnabled,
    loadedObjectsCount: objects.length, hasNextPage, nextElectricalPageCursor,
    isElectricalPageFetching, setTablePage, loadNextElectricalGlidePage,
  });

  return {
    candidateGlideColumnMetaByKey,
    electricalCandidateGlideColumns,
    electricalColumns,
    electricalGlideColumns,
    electricalInfiniteLoading,
    electricalPagination,
    electricalRowClassName,
    electricalTableScrollX,
    electricalTableScrollY,
    getElectricalGlideCellState,
    handleElectricalGlideCellAction,
    handleElectricalGlideCommitCell,
    handleElectricalGlideLoadMore,
    handleElectricalGlidePageChange,
    handleElectricalGlideStartCellEdit,
    handleElectricalTableChange,
  };
}
