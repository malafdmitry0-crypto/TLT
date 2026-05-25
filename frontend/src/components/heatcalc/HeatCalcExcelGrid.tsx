import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type TdHTMLAttributes,
} from 'react';
import { Pagination } from 'antd';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ColumnType } from 'antd/es/table';

import type { ProjectObject } from '@/types/project';

export interface HeatCalcExcelGridPagination {
  current: number;
  pageSize: number;
  total: number;
  showSizeChanger?: boolean;
  hideOnSinglePage?: boolean;
  size?: 'default' | 'small';
  onChange: (page: number, pageSize: number) => void;
}

interface HeatCalcExcelGridProps {
  rows: ProjectObject[];
  columns: ColumnType<ProjectObject>[];
  tableScrollX: number;
  tableScrollY: string;
  fontSizeKey: string;
  selectedRowIndex: number | null;
  emptyContent: ReactNode;
  rowClassName: (record: ProjectObject) => string;
  onRowSecondaryAction: (record: ProjectObject, event: MouseEvent<HTMLElement>) => void;
  pagination?: HeatCalcExcelGridPagination;
  overscan?: number;
  rowEstimatePx?: number;
}

function HeatCalcExcelGrid({
  rows,
  columns,
  tableScrollX,
  tableScrollY,
  fontSizeKey,
  selectedRowIndex,
  emptyContent,
  rowClassName,
  onRowSecondaryAction,
  pagination,
  overscan = 12,
  rowEstimatePx = 30,
}: HeatCalcExcelGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowEstimatePx,
    initialRect: { width: tableScrollX, height: 640 },
    overscan,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  useEffect(() => {
    if (selectedRowIndex == null) return;
    rowVirtualizer.scrollToIndex(selectedRowIndex, { align: 'auto' });
  }, [rowVirtualizer, selectedRowIndex]);

  const measuredVirtualRows = rowVirtualizer.getVirtualItems();
  const virtualRows = measuredVirtualRows.length > 0
    ? measuredVirtualRows
    : rows.slice(0, Math.min(rows.length, 60)).map((record, index) => ({
        key: record.id,
        index,
        start: index * rowEstimatePx,
        end: (index + 1) * rowEstimatePx,
        size: rowEstimatePx,
        lane: 0,
      }));
  const virtualTotalSize = measuredVirtualRows.length > 0
    ? rowVirtualizer.getTotalSize()
    : rows.length * rowEstimatePx;
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  const paddingTop = firstVirtualRow?.start ?? 0;
  const paddingBottom = lastVirtualRow
    ? Math.max(0, virtualTotalSize - lastVirtualRow.end)
    : 0;
  const className = `calc-spreadsheet calc-spreadsheet--${fontSizeKey} calc-spreadsheet--excel-mode calc-spreadsheet--virtual`;
  const paginationNode = pagination && (!pagination.hideOnSinglePage || pagination.total > pagination.pageSize)
    ? (
        <Pagination
          className="ant-table-pagination ant-table-pagination-right excel-virtual-pagination"
          current={pagination.current}
          pageSize={pagination.pageSize}
          total={pagination.total}
          showSizeChanger={pagination.showSizeChanger}
          size={pagination.size}
          onChange={pagination.onChange}
        />
      )
    : null;

  if (rows.length === 0) {
    return (
      <div className={className}>
        <div className="excel-virtual-empty">
          {emptyContent}
        </div>
        {paginationNode}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="ant-table-wrapper">
        <div className="ant-table ant-table-small">
          <div className="ant-table-container">
            <div
              ref={scrollRef}
              className="ant-table-body excel-virtual-table-body"
              style={{ maxHeight: tableScrollY }}
            >
              <table style={{ width: tableScrollX, minWidth: tableScrollX }}>
                <colgroup>
                  {columns.map((column) => (
                    <col
                      key={String(column.key)}
                      style={{
                        width: typeof column.width === 'number' ? column.width : undefined,
                      }}
                    />
                  ))}
                </colgroup>
                <thead className="ant-table-thead">
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={String(column.key)}
                        className={[
                          'ant-table-cell',
                          column.ellipsis ? 'ant-table-cell-ellipsis' : null,
                          column.className,
                        ].filter(Boolean).join(' ')}
                        style={{ textAlign: column.align }}
                        scope="col"
                      >
                        {column.title as ReactNode}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="ant-table-tbody">
                  {paddingTop > 0 && (
                    <tr className="excel-virtual-spacer" aria-hidden="true">
                      <td colSpan={columns.length} style={{ height: paddingTop }} />
                    </tr>
                  )}
                  {virtualRows.map((virtualRow) => {
                    const rowIndex = virtualRow.index;
                    const record = rows[rowIndex];
                    if (!record) return null;
                    return (
                      <tr
                        key={record.id}
                        className={[
                          'ant-table-row',
                          'ant-table-row-level-0',
                          'excel-virtual-row',
                          rowClassName(record),
                        ].filter(Boolean).join(' ')}
                        data-row-key={record.id}
                        onMouseDown={(event) => {
                          if (event.button !== 2) return;
                          onRowSecondaryAction(record, event);
                        }}
                        onAuxClick={(event) => {
                          if (event.button !== 2) return;
                          onRowSecondaryAction(record, event);
                        }}
                        onContextMenu={(event) => onRowSecondaryAction(record, event)}
                      >
                        {columns.map((column) => {
                          const cellProps = (typeof column.onCell === 'function'
                            ? column.onCell(record, rowIndex) ?? {}
                            : {}) as TdHTMLAttributes<HTMLTableCellElement>;
                          const { className: cellClassName, style: cellStyle, ...restCellProps } = cellProps;
                          const rendered = typeof column.render === 'function'
                            ? column.render(undefined, record, rowIndex)
                            : null;
                          return (
                            <td
                              {...restCellProps}
                              key={String(column.key)}
                              className={[
                                'ant-table-cell',
                                column.ellipsis ? 'ant-table-cell-ellipsis' : null,
                                column.className,
                                cellClassName,
                              ].filter(Boolean).join(' ')}
                              style={{
                                textAlign: column.align,
                                ...(cellStyle as CSSProperties | undefined),
                              }}
                              title={restCellProps.title ?? (
                                column.ellipsis && typeof rendered === 'string' ? rendered : undefined
                              )}
                            >
                              {rendered as ReactNode}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr className="excel-virtual-spacer" aria-hidden="true">
                      <td colSpan={columns.length} style={{ height: paddingBottom }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {paginationNode}
    </div>
  );
}

export default memo(HeatCalcExcelGrid);
