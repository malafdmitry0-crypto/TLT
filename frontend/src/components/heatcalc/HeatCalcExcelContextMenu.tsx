import { appModal } from '@/feedback/appFeedback';
import {
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

import type { ProjectObject } from '@/types/project';
import {
  getExcelContextMenuDisabledState,
  getExcelSelectionRangeOrActiveCell,
  type ExcelCellPosition,
  type ExcelSelectionRange,
} from '@/utils/heatCalcExcelMode';
import type { DraftRowsById, DraftRowState } from '@/utils/heatCalcInlineEdit';
import type { HeatCalcIndexedTableRow } from '@/utils/heatCalcTableFindability';

export type HeatCalcExcelContextMenuState = {
  x: number;
  y: number;
} | null;

interface HeatCalcExcelContextMenuProps {
  excelModeEnabled: boolean;
  contextMenu: HeatCalcExcelContextMenuState;
  selectionRange: ExcelSelectionRange | null;
  activeCell: ExcelCellPosition | null;
  selectedRows: HeatCalcIndexedTableRow<ProjectObject>[];
  draftRowsById: DraftRowsById;
  isSavableDraftRow: (draftRow: DraftRowState | undefined) => boolean;
  closeContextMenu: () => void;
  copySelection: () => unknown | Promise<unknown>;
  cutSelection: () => unknown | Promise<unknown>;
  pasteFromClipboard: () => unknown | Promise<unknown>;
  clearSelection: () => unknown | Promise<unknown>;
  addRowsBelowSelection: (count: number) => unknown | Promise<unknown>;
  removeSelectedRows: () => unknown | Promise<unknown>;
  resetSelectedRows: () => unknown | Promise<unknown>;
}

function MenuItem({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="excel-context-menu-item"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="excel-context-menu-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export default function HeatCalcExcelContextMenu({
  excelModeEnabled,
  contextMenu,
  selectionRange,
  activeCell,
  selectedRows,
  draftRowsById,
  isSavableDraftRow,
  closeContextMenu,
  copySelection,
  cutSelection,
  pasteFromClipboard,
  clearSelection,
  addRowsBelowSelection,
  removeSelectedRows,
  resetSelectedRows,
}: HeatCalcExcelContextMenuProps) {
  if (!excelModeEnabled || !contextMenu) return null;

  const hasSelection = !!getExcelSelectionRangeOrActiveCell(selectionRange, activeCell);
  const dirtySelectedRowCount = selectedRows.filter(({ record }) => (
    isSavableDraftRow(draftRowsById[record.id])
  )).length;
  const disabled = getExcelContextMenuDisabledState({
    hasSelection,
    selectedRowCount: selectedRows.length,
    dirtySelectedRowCount,
    clipboardReadAvailable: typeof navigator !== 'undefined' && !!navigator.clipboard?.readText,
  });

  const runCommand = (command: () => unknown | Promise<unknown>) => {
    void Promise.resolve(command()).finally(closeContextMenu);
  };
  const confirmDeleteRows = () => {
    if (selectedRows.length === 0) return;
    closeContextMenu();
    appModal.confirm({
      title: selectedRows.length > 1
        ? `Удалить выбранные строки: ${selectedRows.length}?`
        : 'Удалить выбранную строку?',
      okText: 'Удалить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: removeSelectedRows,
    });
  };

  return (
    <div
      className="excel-context-menu"
      role="menu"
      aria-label="Действия Excel-режима"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <MenuItem label="Копировать" icon={<CopyOutlined />} disabled={disabled.copy} onClick={() => runCommand(copySelection)} />
      <MenuItem label="Вырезать" icon={<CopyOutlined />} disabled={disabled.cut} onClick={() => runCommand(cutSelection)} />
      <MenuItem label="Вставить" icon={<CopyOutlined />} disabled={disabled.paste} onClick={() => runCommand(pasteFromClipboard)} />
      <MenuItem label="Очистить содержимое" icon={<CloseCircleOutlined />} disabled={disabled.clear} onClick={() => runCommand(clearSelection)} />
      <div className="excel-context-menu-separator" role="separator" />
      <MenuItem label="Добавить строку ниже" icon={<PlusOutlined />} disabled={!hasSelection} onClick={() => runCommand(() => addRowsBelowSelection(1))} />
      <MenuItem label="Добавить 10 строк ниже" icon={<PlusOutlined />} disabled={!hasSelection} onClick={() => runCommand(() => addRowsBelowSelection(10))} />
      <div className="excel-context-menu-separator" role="separator" />
      <MenuItem label="Удалить выбранные строки" icon={<DeleteOutlined />} disabled={disabled.deleteRows} onClick={() => runCommand(confirmDeleteRows)} />
      <MenuItem label="Сбросить выбранные строки" icon={<CloseCircleOutlined />} disabled={disabled.resetRows} onClick={() => runCommand(resetSelectedRows)} />
    </div>
  );
}
