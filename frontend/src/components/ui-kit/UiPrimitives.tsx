import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

export type TltUiTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type TltButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type TltButtonSize = 'compact' | 'comfortable' | 'icon';

export interface TltButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TltButtonVariant;
  size?: TltButtonSize;
  icon?: ReactNode;
  loading?: boolean;
}

function joinClassNames(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined;
}

export const TltButton = forwardRef<HTMLButtonElement, TltButtonProps>(function TltButton(
  {
    children,
    className,
    disabled,
    icon,
    loading = false,
    size = 'compact',
    type = 'button',
    variant = 'secondary',
    ...rest
  },
  ref,
) {
  const hasText = children !== undefined && children !== null;

  return (
    <button
      {...rest}
      ref={ref}
      className={joinClassNames(
        'tlt-ui-button',
        `tlt-ui-button--${variant}`,
        `tlt-ui-button--${size}`,
        loading && 'tlt-ui-button--loading',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      type={type}
    >
      {icon || loading ? (
        <span className="tlt-ui-button__icon" aria-hidden={hasText || loading ? true : undefined}>
          {loading ? <span className="tlt-ui-spinner" /> : icon}
        </span>
      ) : null}
      {hasText ? <span className="tlt-ui-button__label">{children}</span> : null}
    </button>
  );
});

TltButton.displayName = 'TltButton';

export interface TltBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TltUiTone;
  dot?: boolean;
  size?: 'compact' | 'regular';
}

export function TltBadge({
  children,
  className,
  dot = true,
  size = 'compact',
  tone = 'neutral',
  ...rest
}: TltBadgeProps) {
  return (
    <span
      {...rest}
      className={joinClassNames(
        'tlt-ui-badge',
        `tlt-ui-badge--${tone}`,
        `tlt-ui-badge--${size}`,
        dot && 'tlt-ui-badge--dot',
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface TltCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  as?: 'article' | 'div' | 'section';
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: 'default' | 'soft' | 'accent';
  padding?: 'none' | 'compact' | 'comfortable';
}

export function TltCard({
  actions,
  as = 'article',
  children,
  className,
  description,
  padding = 'compact',
  title,
  tone = 'default',
  ...rest
}: TltCardProps) {
  const Component = as;

  return (
    <Component
      {...rest}
      className={joinClassNames(
        'tlt-ui-card',
        `tlt-ui-card--${tone}`,
        `tlt-ui-card--padding-${padding}`,
        className,
      )}
    >
      {title || description || actions ? (
        <header className="tlt-ui-card__header">
          <div className="tlt-ui-card__heading">
            {title ? <h3 className="tlt-ui-card__title">{title}</h3> : null}
            {description ? <p className="tlt-ui-card__description">{description}</p> : null}
          </div>
          {actions ? <div className="tlt-ui-card__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children !== undefined ? <div className="tlt-ui-card__body">{children}</div> : null}
    </Component>
  );
}

export interface TltAlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: Exclude<TltUiTone, 'neutral'>;
  title?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}

const alertMarkers: Record<Exclude<TltUiTone, 'neutral'>, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  danger: '×',
};

export function TltAlert({
  action,
  children,
  className,
  dismissLabel = 'Закрыть уведомление',
  onDismiss,
  title,
  tone = 'info',
  role,
  ...rest
}: TltAlertProps) {
  return (
    <div
      {...rest}
      className={joinClassNames('tlt-ui-alert', `tlt-ui-alert--${tone}`, className)}
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
    >
      <span className="tlt-ui-alert__marker" aria-hidden="true">{alertMarkers[tone]}</span>
      <div className="tlt-ui-alert__content">
        {title ? <strong className="tlt-ui-alert__title">{title}</strong> : null}
        {children ? <div className="tlt-ui-alert__message">{children}</div> : null}
      </div>
      {action ? <div className="tlt-ui-alert__action">{action}</div> : null}
      {onDismiss ? (
        <button
          className="tlt-ui-alert__dismiss"
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export interface TltTabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TltTabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange'> {
  items: TltTabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  tabListLabel?: string;
}

function resolveTabValue(items: TltTabItem[], requested?: string) {
  const requestedItem = requested ? items.find((item) => item.id === requested) : undefined;
  if (requestedItem && !requestedItem.disabled) return requestedItem.id;
  return items.find((item) => !item.disabled)?.id;
}

function nextEnabledTab(items: TltTabItem[], currentIndex: number, direction: 1 | -1) {
  if (items.length === 0) return undefined;
  for (let step = 1; step <= items.length; step += 1) {
    const index = (currentIndex + direction * step + items.length) % items.length;
    if (!items[index].disabled) return items[index].id;
  }
  return undefined;
}

export function TltTabs({
  className,
  defaultValue,
  id,
  items,
  onChange,
  tabListLabel = 'Вкладки',
  value,
  ...rest
}: TltTabsProps) {
  const generatedId = useId().replace(/:/g, '');
  const baseId = id ?? `tlt-tabs-${generatedId}`;
  const [uncontrolledValue, setUncontrolledValue] = useState(() => resolveTabValue(items, defaultValue));
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeValue = resolveTabValue(items, value ?? uncontrolledValue);
  const activeItem = items.find((item) => item.id === activeValue);

  if (items.length === 0) return null;

  const selectTab = (nextValue: string | undefined) => {
    if (!nextValue) return;
    if (value === undefined) setUncontrolledValue(nextValue);
    onChange?.(nextValue);
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextValue: string | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextValue = nextEnabledTab(items, index, 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextValue = nextEnabledTab(items, index, -1);
    } else if (event.key === 'Home') {
      nextValue = resolveTabValue(items);
    } else if (event.key === 'End') {
      nextValue = [...items].reverse().find((item) => !item.disabled)?.id;
    }
    if (!nextValue) return;
    event.preventDefault();
    selectTab(nextValue);
    buttonRefs.current[nextValue]?.focus();
  };

  return (
    <div {...rest} className={joinClassNames('tlt-ui-tabs', className)} id={id}>
      <div className="tlt-ui-tabs__list" role="tablist" aria-label={tabListLabel}>
        {items.map((item, index) => {
          const isActive = item.id === activeValue;
          const tabId = `${baseId}-tab-${item.id}`;
          const panelId = `${baseId}-panel-${item.id}`;
          return (
            <button
              key={item.id}
              ref={(element) => { buttonRefs.current[item.id] = element; }}
              className="tlt-ui-tabs__tab"
              type="button"
              role="tab"
              id={tabId}
              aria-controls={panelId}
              aria-selected={isActive}
              disabled={item.disabled}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(item.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {activeItem ? (
        <div
          className="tlt-ui-tabs__panel"
          role="tabpanel"
          id={`${baseId}-panel-${activeItem.id}`}
          aria-labelledby={`${baseId}-tab-${activeItem.id}`}
          tabIndex={0}
        >
          {activeItem.content}
        </div>
      ) : null}
    </div>
  );
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
  columns: TltTableColumn<Row>[];
  rows: Row[];
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

export interface TltEmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function TltEmptyState({
  action,
  children,
  className,
  description,
  icon = '+',
  title,
  ...rest
}: TltEmptyStateProps) {
  return (
    <div {...rest} className={joinClassNames('tlt-ui-empty', className)}>
      <span className="tlt-ui-empty__icon" aria-hidden="true">{icon}</span>
      <div className="tlt-ui-empty__content">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
        {children ? <div className="tlt-ui-empty__extra">{children}</div> : null}
      </div>
      {action ? <div className="tlt-ui-empty__action">{action}</div> : null}
    </div>
  );
}

export interface TltSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  rows?: number;
  variant?: 'text' | 'panel';
  label?: string;
}

export function TltSkeleton({
  className,
  label = 'Загрузка',
  rows = 3,
  variant = 'text',
  ...rest
}: TltSkeletonProps) {
  const count = Math.max(1, rows);
  return (
    <div
      {...rest}
      className={joinClassNames('tlt-ui-skeleton', `tlt-ui-skeleton--${variant}`, className)}
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="tlt-ui-skeleton__line" />
      ))}
    </div>
  );
}
