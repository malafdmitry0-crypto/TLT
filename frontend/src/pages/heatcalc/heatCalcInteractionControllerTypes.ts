/**
 * Typed slice contracts for HeatCalc interaction controller.
 */
import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from 'react';

import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import type { HeatCalcExcelCellRef } from '@/hooks/useHeatCalcExcelSelection';
import type {
  ObjectQueryFieldCapability,
  ProjectObject,
  ProjectObjectsQueryResponse,
} from '@/types/project';
import type { ExcelCellPosition } from '@/utils/heatCalcExcelMode';
import type { ExcelLocalProjectObject } from '@/utils/heatCalcExcelRows';
import type { HeatCalcFieldInputSettings } from '@/utils/heatCalcFieldInputSettings';
import type {
  DraftRowsById,
  DraftRowState,
} from '@/utils/heatCalcInlineEdit';
import type {
  HeatCalcColumnKey,
  HeatCalcObjectType,
  HeatCalcResolvedColumnMeta,
  HeatCalcTableColumnScope,
  HeatCalcTableColumnSettings,
} from '@/utils/heatCalcTableColumns';
import type {
  HeatCalcColumnFilter,
  HeatCalcIndexedTableRow,
  HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';
import type {
  HeatCalcFormPlacement,
  HeatCalcTableViewSettings,
} from '@/utils/heatCalcTableViewSettings';
import type { useHeatCalcExcelInteractionState } from '@/pages/heatcalc/useHeatCalcExcelInteractionModel';
import type { HeatCalcPageTableEditingMode } from '@/pages/heatcalc/useHeatCalcPageEffectsModel';
import type { ActiveObjectScope } from '@/pages/heatcalc/useHeatCalcTableState';

/** Excel selection primitives owned by the page (fed into HEAT1 data model). */
export type HeatCalcExcelInteractionState = ReturnType<
  typeof useHeatCalcExcelInteractionState
>;

/** Workspace slice required by grid/excel/normal interaction (HEAT1 outputs). */
export type HeatCalcInteractionWorkspaceSlice = {
  activeExcelCellPosition: ExcelCellPosition | null;
  activeInlineCell: HeatCalcExcelCellRef;
  appendExcelLocalRows: (
    count: number,
    insertAfterObjectId?: string | null,
  ) => ExcelLocalProjectObject[];
  columnRenderers: Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>;
  commitInlineCell: (record: ProjectObject, columnKey: string, value: unknown) => string | null;
  currentTableViewActive: boolean;
  dirtyDraftRowCount: number;
  draftRowsById: DraftRowsById;
  editableExcelColumnKeys: string[];
  effectiveActiveTableViewState: HeatCalcTableViewState;
  enumOptionsByColumn: Record<HeatCalcColumnKey, { label: string; value: string }[]>;
  excelLocalRows: ExcelLocalProjectObject[];
  excelModeEnabled: boolean;
  excelRowIds: string[];
  fieldCapabilityByKey: Map<string, ObjectQueryFieldCapability>;
  filteredTableCount: number;
  formPlacement: HeatCalcFormPlacement;
  isSavableDraftRow: (draftRow: DraftRowState | undefined) => boolean;
  normalGlideEnabled: boolean;
  objectQueryFetching: boolean;
  objectQueryResult: ProjectObjectsQueryResponse | undefined;
  selectedExcelRows: HeatCalcIndexedTableRow<ProjectObject>[];
  setActiveInlineCell: Dispatch<SetStateAction<HeatCalcExcelCellRef>>;
  setDraftRowsById: Dispatch<SetStateAction<DraftRowsById>>;
  setExcelLocalRows: Dispatch<SetStateAction<ExcelLocalProjectObject[]>>;
  sourceColumnMetas: HeatCalcResolvedColumnMeta[];
  tableCellEditingEnabled: boolean;
  visibleSourceIndexById: Map<string, number>;
  visibleTableColumnKeys: HeatCalcColumnKey[];
  visibleTableObjects: ProjectObject[];
  visibleTableRows: HeatCalcIndexedTableRow<ProjectObject>[];
};

export type HeatCalcInteractionTableSlice = {
  activeObjectScope: ActiveObjectScope;
  activeTableColumnScope: HeatCalcTableColumnScope;
  activeTableObjectType: HeatCalcObjectType;
  activeTablePage: number;
  changeNormalTablePage: (
    page: number,
    result: ProjectObjectsQueryResponse | undefined,
  ) => void;
  cleanHiddenColumnState: (visibleColumnKeys: HeatCalcColumnKey[]) => void;
  isAllObjectScope: boolean;
  loadNextNormalPage: (
    result: ProjectObjectsQueryResponse | undefined,
    options: { excelModeEnabled: boolean; objectQueryFetching: boolean },
  ) => void;
  pruneSelectedRows: (visibleObjects: ProjectObject[]) => void;
  resetColumnFilter: (columnKey: string) => void;
  selectObjectScope: (scope: ActiveObjectScope) => void;
  selectedRowKeys: string[];
  setColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
};

export type HeatCalcInteractionEditorSlice = {
  clearLastSavedObject: () => void;
  lastSavedObject: ProjectObject | null;
  selectedRowId: string | null;
  syncWizardWithRecord: (record: ProjectObject) => void;
  wizardBaseObject: ProjectObject | null;
  wizardFormObject: ProjectObject | null;
};

export type HeatCalcInteractionFocusSlice = {
  pendingTableFocusObject: ProjectObject | null;
  setPendingTableFocusObject: (object: ProjectObject | null) => void;
  setTableEditingMode: (mode: HeatCalcPageTableEditingMode) => void;
  tableEditingMode: HeatCalcPageTableEditingMode;
};

export type HeatCalcInteractionResizeSlice = {
  applySideFormWidthPct: (widthPct: number) => HeatCalcTableViewSettings;
  fieldInputSettings: HeatCalcFieldInputSettings;
  persistTableColumnSettings: (
    settings: HeatCalcTableColumnSettings,
    options?: { closeModal?: boolean; showMessage?: boolean },
  ) => void;
  persistTableViewOnly: (viewSettings: HeatCalcTableViewSettings) => void;
  sideWorkspaceRef: RefObject<HTMLDivElement | null>;
  tableColumnSettingsRef: { current: HeatCalcTableColumnSettings };
  tableFindabilityAvailable: boolean;
  tableViewSettingsRef: { current: HeatCalcTableViewSettings };
  updateTableColumnSettingsDraft: (
    updater: (settings: HeatCalcTableColumnSettings) => HeatCalcTableColumnSettings,
  ) => void;
};

export type UseHeatCalcInteractionControllerArgs = {
  table: HeatCalcInteractionTableSlice;
  excelInteractionState: HeatCalcExcelInteractionState;
  workspace: HeatCalcInteractionWorkspaceSlice;
  editor: HeatCalcInteractionEditorSlice;
  focus: HeatCalcInteractionFocusSlice;
  resize: HeatCalcInteractionResizeSlice;
  notifyInfo?: (message: string) => void;
};
