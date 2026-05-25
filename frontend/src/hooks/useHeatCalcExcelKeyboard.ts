import { useEffect } from 'react';

import type { ProjectObject } from '@/types/project';
import type { ExcelCellPosition } from '@/utils/heatCalcExcelMode';

interface UseHeatCalcExcelKeyboardOptions {
  excelModeEnabled: boolean;
  selectedPosition: ExcelCellPosition | null;
  rows: ProjectObject[];
  editableColumnKeys: string[];
  contextMenuOpen: boolean;
  closeContextMenu: () => void;
  collapseSelectionToActiveCell: () => void;
  moveSelection: (rowDelta: number, columnDelta: number, wrap?: boolean, extend?: boolean) => void;
  selectAllCells: () => void;
  copySelection: () => Promise<boolean>;
  applyPaste: (text: string) => void;
  startInlineCellEdit: (record: ProjectObject, columnKey: string) => void;
}

function isTextEditingTarget(active: Element | null) {
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
}

export function useHeatCalcExcelKeyboard({
  excelModeEnabled,
  selectedPosition,
  rows,
  editableColumnKeys,
  contextMenuOpen,
  closeContextMenu,
  collapseSelectionToActiveCell,
  moveSelection,
  selectAllCells,
  copySelection,
  applyPaste,
  startInlineCellEdit,
}: UseHeatCalcExcelKeyboardOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!excelModeEnabled || !selectedPosition) return;
      if (isTextEditingTarget(document.activeElement)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAllCells();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void copySelection();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const record = rows[selectedPosition.rowIndex];
        const columnKey = editableColumnKeys[selectedPosition.columnIndex];
        if (record && columnKey) startInlineCellEdit(record, columnKey);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (contextMenuOpen) {
          closeContextMenu();
          return;
        }
        collapseSelectionToActiveCell();
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        moveSelection(0, event.shiftKey ? -1 : 1, true, false);
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelection(0, 1, false, event.shiftKey);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelection(0, -1, false, event.shiftKey);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1, 0, false, event.shiftKey);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1, 0, false, event.shiftKey);
      }
    }

    function handlePaste(event: ClipboardEvent) {
      if (!excelModeEnabled || !selectedPosition) return;
      if (isTextEditingTarget(document.activeElement)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      event.preventDefault();
      applyPaste(text);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('paste', handlePaste);
    };
  }, [
    applyPaste,
    closeContextMenu,
    collapseSelectionToActiveCell,
    contextMenuOpen,
    copySelection,
    editableColumnKeys,
    excelModeEnabled,
    moveSelection,
    rows,
    selectAllCells,
    selectedPosition,
    startInlineCellEdit,
  ]);
}
