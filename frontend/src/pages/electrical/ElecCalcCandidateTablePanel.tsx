import {
  lazy,
  Suspense,
  type ReactNode,
} from 'react';
import { Input, type MenuProps } from 'antd';

import type { ElectricalCandidate } from '@/types/calculation';
import type {
  HeatCalcGlideGridCellState,
  HeatCalcGlideGridColumn,
} from '@/utils/heatCalcGlideGrid';
import type {
  HeatCalcColumnFilter,
  HeatCalcTableViewState,
} from '@/utils/heatCalcTableFindability';

const ElectricalCandidateGlideGrid = lazy(() => import('@/components/electrical/ElectricalCandidateGlideGrid'));
const CANDIDATE_TABLE_SCROLL_Y = 'calc(100vh - 332px)';

type ElecCalcCandidateTablePanelProps = {
  rows: ElectricalCandidate[];
  glideColumns: HeatCalcGlideGridColumn[];
  tableScrollX: number;
  fontSizeKey: string;
  loading: boolean;
  tableViewState: HeatCalcTableViewState;
  emptyContent: ReactNode;
  rowClassName: (candidate: ElectricalCandidate) => string;
  getCellState: (
    candidate: ElectricalCandidate,
    columnKey: string,
    rowIndex: number,
  ) => HeatCalcGlideGridCellState;
  onToggleMarked: (candidate: ElectricalCandidate, checked: boolean) => void;
  onCellAction: (candidate: ElectricalCandidate, columnKey: string, actionKey: string) => void;
  getActionMenuItems: (
    candidate: ElectricalCandidate,
    columnKey: string,
    actionKey: string,
  ) => MenuProps['items'] | null | undefined;
  onSetColumnFilter: (columnKey: string, filter?: HeatCalcColumnFilter) => void;
  onResetColumnFilter: (columnKey: string) => void;
  onSetSort: (columnKey: string, direction?: 'asc' | 'desc') => void;
  onColumnResize: (columnKey: string, widthPx: number) => void;
  onColumnResizeEnd: (columnKey: string, widthPx: number) => void;
  appliedCandidate: ElectricalCandidate | null;
  onAppliedCandidateCommentBlur: (
    candidate: ElectricalCandidate,
    nextComment: string,
  ) => void;
};

export default function ElecCalcCandidateTablePanel({
  rows,
  glideColumns,
  tableScrollX,
  fontSizeKey,
  loading,
  tableViewState,
  emptyContent,
  rowClassName,
  getCellState,
  onToggleMarked,
  onCellAction,
  getActionMenuItems,
  onSetColumnFilter,
  onResetColumnFilter,
  onSetSort,
  onColumnResize,
  onColumnResizeEnd,
  appliedCandidate,
  onAppliedCandidateCommentBlur,
}: ElecCalcCandidateTablePanelProps) {
  return (
    <>
      <Suspense fallback={null}>
        <ElectricalCandidateGlideGrid
          rows={rows}
          gridColumns={glideColumns}
          tableScrollX={tableScrollX}
          tableScrollY={CANDIDATE_TABLE_SCROLL_Y}
          fontSizeKey={fontSizeKey}
          loading={loading}
          tableViewState={tableViewState}
          emptyContent={emptyContent}
          rowClassName={rowClassName}
          getCellState={getCellState}
          onToggleMarked={onToggleMarked}
          onCellAction={onCellAction}
          getActionMenuItems={getActionMenuItems}
          onSetColumnFilter={onSetColumnFilter}
          onResetColumnFilter={onResetColumnFilter}
          onSetSort={onSetSort}
          onColumnResize={onColumnResize}
          onColumnResizeEnd={onColumnResizeEnd}
        />
      </Suspense>
      <Input.TextArea
        aria-label="Комментарий к выбранному кандидату"
        size="small"
        rows={2}
        maxLength={2000}
        placeholder="Комментарий инженера к выбранному варианту"
        disabled={!appliedCandidate}
        defaultValue={appliedCandidate?.engineer_comment ?? ''}
        onBlur={(event) => {
          if (!appliedCandidate) return;
          onAppliedCandidateCommentBlur(appliedCandidate, event.currentTarget.value);
        }}
      />
    </>
  );
}
