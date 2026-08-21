import { useEffect } from 'react';

import type { ProjectObject } from '@/types/project';
import type {
  HeatCalcColumnKey,
  HeatCalcObjectType,
} from '@/utils/heatCalcTableColumns';
import { escapeTableRowKey } from '@/utils/heatCalcPageUtils';
import type { ActiveObjectScope } from '@/pages/heatcalc/useHeatCalcTableState';

export type HeatCalcPageTableEditingMode = 'normal' | 'excel';

export interface UseHeatCalcPageEffectsModelOptions {
  activeObjectScope: ActiveObjectScope;
  activeTableObjectType: HeatCalcObjectType;
  clearExcelSelectionState: () => void;
  clearLastSavedObject: () => void;
  cleanHiddenColumnState: (visibleColumnKeys: HeatCalcColumnKey[]) => void;
  currentTableViewActive: boolean;
  dirtyDraftRowCount: number;
  isAllObjectScope: boolean;
  lastSavedObject: ProjectObject | null;
  pendingTableFocusObject: ProjectObject | null;
  pruneSelectedRows: (visibleObjects: ProjectObject[]) => void;
  selectObjectScope: (scope: ActiveObjectScope) => void;
  setPendingTableFocusObject: (object: ProjectObject | null) => void;
  setTableEditingMode: (mode: HeatCalcPageTableEditingMode) => void;
  tableCellEditingEnabled: boolean;
  tableEditingMode: HeatCalcPageTableEditingMode;
  visibleTableColumnKeys: HeatCalcColumnKey[];
  visibleTableObjects: ProjectObject[];
  notifyInfo?: (message: string) => void;
  scrollRowIntoView?: (objectId: string) => void;
}

export function scrollHeatCalcTableRowIntoView(objectId: string) {
  const run = () => {
    const row = document.querySelector<HTMLElement>(
      `.srs-table-wrap .ant-table-row[data-row-key="${escapeTableRowKey(objectId)}"], ` +
      `.srs-table-wrap .excel-virtual-row[data-row-key="${escapeTableRowKey(objectId)}"]`,
    );
    const tableBody = row?.closest<HTMLElement>('.ant-table-body, .excel-virtual-table-body');
    if (!row || !tableBody) return;

    const rowRect = row.getBoundingClientRect();
    const bodyRect = tableBody.getBoundingClientRect();
    const targetTop = Math.max(
      0,
      tableBody.scrollTop + rowRect.top - bodyRect.top - (tableBody.clientHeight - rowRect.height) / 2,
    );

    if (typeof tableBody.scrollTo === 'function') {
      tableBody.scrollTo({ top: targetTop, behavior: 'smooth' });
      return;
    }
    tableBody.scrollTop = targetTop;
  };

  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    run();
    return;
  }
  window.requestAnimationFrame(() => window.requestAnimationFrame(run));
}

export function useHeatCalcPageEffectsModel({
  activeObjectScope,
  activeTableObjectType,
  clearExcelSelectionState,
  clearLastSavedObject,
  cleanHiddenColumnState,
  currentTableViewActive,
  dirtyDraftRowCount,
  isAllObjectScope,
  lastSavedObject,
  pendingTableFocusObject,
  pruneSelectedRows,
  selectObjectScope,
  setPendingTableFocusObject,
  setTableEditingMode,
  tableCellEditingEnabled,
  tableEditingMode,
  visibleTableColumnKeys,
  visibleTableObjects,
  notifyInfo,
  scrollRowIntoView = scrollHeatCalcTableRowIntoView,
}: UseHeatCalcPageEffectsModelOptions) {
  useEffect(() => {
    cleanHiddenColumnState(visibleTableColumnKeys);
  }, [cleanHiddenColumnState, visibleTableColumnKeys]);

  useEffect(() => {
    pruneSelectedRows(visibleTableObjects);
  }, [pruneSelectedRows, visibleTableObjects]);

  useEffect(() => {
    if (!pendingTableFocusObject) return;
    const pendingObjectType: HeatCalcObjectType = pendingTableFocusObject.object_type === 'tank' ? 'tank' : 'pipe';
    if (activeObjectScope !== 'all' && pendingObjectType !== activeTableObjectType) {
      selectObjectScope(pendingObjectType);
      return;
    }
    if (!visibleTableObjects.some((object) => object.id === pendingTableFocusObject.id)) return;
    scrollRowIntoView(pendingTableFocusObject.id);
    setPendingTableFocusObject(null);
  }, [
    activeObjectScope,
    activeTableObjectType,
    pendingTableFocusObject,
    scrollRowIntoView,
    selectObjectScope,
    setPendingTableFocusObject,
    visibleTableObjects,
  ]);

  useEffect(() => {
    if (tableCellEditingEnabled || dirtyDraftRowCount > 0) return;
    clearExcelSelectionState();
  }, [clearExcelSelectionState, dirtyDraftRowCount, tableCellEditingEnabled]);

  useEffect(() => {
    if (dirtyDraftRowCount === 0) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtyDraftRowCount]);

  useEffect(() => {
    if (!lastSavedObject) return;
    if (!isAllObjectScope && lastSavedObject.object_type !== activeTableObjectType) {
      clearLastSavedObject();
      return;
    }
    if (!currentTableViewActive) {
      clearLastSavedObject();
      return;
    }
    if (!visibleTableObjects.some((object) => object.id === lastSavedObject.id)) {
      notifyInfo?.('Объект сохранён, но скрыт текущими фильтрами');
    }
    clearLastSavedObject();
  }, [
    activeTableObjectType,
    clearLastSavedObject,
    currentTableViewActive,
    isAllObjectScope,
    lastSavedObject,
    notifyInfo,
    visibleTableObjects,
  ]);

  useEffect(() => {
    if (tableEditingMode !== 'excel' || activeObjectScope !== 'all') return;
    setTableEditingMode('normal');
    clearExcelSelectionState();
  }, [activeObjectScope, clearExcelSelectionState, setTableEditingMode, tableEditingMode]);
}
