/**
 * TltTable — Ant Table under stable TLT columns/rows contract.
 */
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useMemo,
} from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';

function joinClassNames(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined;
}

/**
 * Column descriptor for {@link TltTable}.
 * When `render` is omitted, the cell shows `String(row[column.key] ?? '—')`.
 */
export interface TltTableColumn<Row = Record<string, unknown>> {
  /** Stable column id; also the default field key when `render` is omitted. */
  key: string;
  /** Header cell content. */
  header: ReactNode;
  /** Custom cell renderer. Receives the full row and row index. */
  render?: (row: Row, index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: CSSProperties['width'];
  className?: string;
}

/**
 * Lightweight data table façade over Ant Table.
 * Pass plain row objects + column descriptors — no Ant column API in features.
 */
export interface TltTableProps<Row = Record<string, unknown>>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Column definitions (`key`, `header`, optional `render` / `width` / `align`). */
  columns: readonly TltTableColumn<Row>[];
  /** Row data. Empty array shows `emptyState`. */
  rows: readonly Row[];
  /** Property name or function that returns a stable row identity. */
  rowKey: keyof Row | ((row: Row, index: number) => string | number);
  /** Currently selected row key when selection is enabled. */
  selectedRowKey?: string | number | null;
  /** Called when a selectable row is activated. */
  onRowSelect?: (row: Row, key: string | number) => void;
  caption?: ReactNode;
  /** Placeholder when `rows` is empty. */
  emptyState?: ReactNode;
  minWidth?: CSSProperties['minWidth'];
  tableClassName?: string;
}

function resolveRowKey<Row>(
  row: Row,
  index: number,
  rowKey: keyof Row | ((row: Row, index: number) => string | number),
) {
  const value = typeof rowKey === 'function' ? rowKey(row, index) : row[rowKey];
  return typeof value === 'string' || typeof value === 'number' ? value : String(value);
}

interface KeyedRow<Row> {
  key: string | number;
  index: number;
  row: Row;
}

export function TltTable<Row>({
  'aria-label': ariaLabel,
  caption,
  className,
  columns,
  emptyState = 'Нет данных',
  minWidth = '560px',
  onRowSelect,
  rows,
  rowKey,
  selectedRowKey,
  tableClassName,
  ...rest
}: TltTableProps<Row>) {
  const dataSource = useMemo<KeyedRow<Row>[]>(
    () => rows.map((row, index) => ({
      key: resolveRowKey(row, index, rowKey),
      index,
      row,
    })),
    [rows, rowKey],
  );

  const antColumns: ColumnsType<KeyedRow<Row>> = columns.map((column) => ({
    key: column.key,
    title: column.header,
    align: column.align,
    width: column.width,
    className: column.className,
    render: (_value, record) => (
      column.render
        ? column.render(record.row, record.index)
        : String((record.row as Record<string, unknown>)[column.key] ?? '—')
    ),
  }));

  return (
    <div {...rest} className={joinClassNames('tlt-ui-table-scroll', className)}>
      {caption ? <div className="tlt-ui-table__caption">{caption}</div> : null}
      <Table<KeyedRow<Row>>
        className={joinClassNames('tlt-ui-table', tableClassName)}
        style={{ minWidth }}
        size="small"
        pagination={false}
        columns={antColumns}
        dataSource={dataSource}
        locale={{ emptyText: emptyState }}
        rowKey="key"
        rowClassName={(record) => {
          const isSelected = selectedRowKey != null && String(selectedRowKey) === String(record.key);
          return isSelected ? 'tlt-ui-table__row--selected' : '';
        }}
        onRow={(record) => {
          const key = record.key;
          return {
            onClick: onRowSelect ? () => onRowSelect(record.row, key) : undefined,
            onKeyDown: onRowSelect
              ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRowSelect(record.row, key);
                }
              }
              : undefined,
            tabIndex: onRowSelect ? 0 : undefined,
            'aria-selected': onRowSelect
              ? selectedRowKey != null && String(selectedRowKey) === String(key)
              : undefined,
          };
        }}
        aria-label={ariaLabel}
      />
    </div>
  );
}
