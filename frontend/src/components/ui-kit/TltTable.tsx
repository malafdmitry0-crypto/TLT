/**
 * TltTable primitive — owner-local extract from UiPrimitives.
 */
import {
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

function joinClassNames(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined;
}

export interface TltTableColumn<Row> {
  key: string;
  header: ReactNode;
  render?: (row: Row, index: number) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: CSSProperties['width'];
  className?: string;
}

export interface TltTableProps<Row> extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Readonly columns are a supported public input (component never mutates the array). */
  columns: readonly TltTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: keyof Row | ((row: Row, index: number) => string | number);
  selectedRowKey?: string | number | null;
  onRowSelect?: (row: Row, key: string | number) => void;
  caption?: ReactNode;
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
  const handleRowKeyDown = (
    event: ReactKeyboardEvent<HTMLTableRowElement>,
    row: Row,
    key: string | number,
  ) => {
    if (!onRowSelect || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onRowSelect(row, key);
  };

  return (
    <div {...rest} className={joinClassNames('tlt-ui-table-scroll', className)}>
      <table
        aria-label={ariaLabel}
        className={joinClassNames('tlt-ui-table', tableClassName)}
        style={{ minWidth }}
      >
        {caption ? <caption className="tlt-ui-table__caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.className}
                scope="col"
                style={{ textAlign: column.align ?? 'left', width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = resolveRowKey(row, index, rowKey);
            const isSelected = selectedRowKey != null && String(selectedRowKey) === String(key);
            return (
              <tr
                key={String(key)}
                aria-selected={onRowSelect ? isSelected : undefined}
                className={isSelected ? 'tlt-ui-table__row--selected' : undefined}
                tabIndex={onRowSelect ? 0 : undefined}
                onClick={onRowSelect ? () => onRowSelect(row, key) : undefined}
                onKeyDown={onRowSelect ? (event) => handleRowKeyDown(event, row, key) : undefined}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={column.className}
                    style={{ textAlign: column.align ?? 'left' }}
                  >
                    {column.render ? column.render(row, index) : String(row[column.key as keyof Row] ?? '—')}
                  </td>
                ))}
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td className="tlt-ui-table__empty" colSpan={columns.length}>{emptyState}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

