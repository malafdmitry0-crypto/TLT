/** Shared mock prop types for HeatCalc page test grid mocks. */
import type { ReactNode } from 'react';
import type { ProjectObject } from '@/types/project';

export type MockGridColumn = {
  key: string;
  title: string;
  label?: string;
  filterKind?: 'text' | 'numberRange' | 'enum';
  sortable?: boolean;
  filterable?: boolean;
};

export type MockCellState = {
  displayValue: string;
  editable?: boolean;
  editor?: 'text' | 'number' | 'select';
  dirty?: boolean;
  error?: string | null;
  options?: unknown[];
  step?: number;
};

export type MockTableViewState = {
  sort?: { columnKey: string; direction: 'asc' | 'desc' };
};

export type MockNormalPagination = {
  current?: number;
  pageSize?: number;
  total?: number;
  hideOnSinglePage?: boolean;
};

export type MockNormalGlideGridProps = {
  rows: ProjectObject[];
  gridColumns: MockGridColumn[];
  fontSizeKey: string;
  emptyContent: ReactNode;
  getCellState: (row: ProjectObject, columnKey: string, rowIndex: number) => MockCellState;
  onOpenEditWizard: (row: ProjectObject) => void;
  onStartCellEdit: (row: ProjectObject, columnKey: string) => void;
  onCommitCell: (row: ProjectObject, columnKey: string, value: string) => string | null;
  selectedRowKeys: string[];
  onSelectedRowKeysChange: (keys: string[]) => void;
  onSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
  tableViewState: MockTableViewState;
  rowClassName: (row: ProjectObject) => string;
  onSetColumnFilter: (columnKey: string, filter: unknown) => void;
  pagination?: MockNormalPagination | false;
  onPageChange?: (page: number) => void;
};

export type MockExcelGlideGridProps = {
  rows: ProjectObject[];
  gridColumns: MockGridColumn[];
  fontSizeKey: string;
  getCellState: (row: ProjectObject, columnKey: string, rowIndex: number) => MockCellState;
  onSetRangeSelection: (
    anchor: { rowId: string; columnKey: string },
    focus: { rowId: string; columnKey: string },
    active: { rowIndex: number; columnIndex: number },
  ) => void;
  onStartCellEdit: (row: ProjectObject, columnKey: string) => void;
  onCommitCell: (row: ProjectObject, columnKey: string, value: string) => string | null;
  rowClassName: (row: ProjectObject) => string;
};
