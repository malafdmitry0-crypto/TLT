import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
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

export const TltBadge = forwardRef<HTMLSpanElement, TltBadgeProps>(function TltBadge(
  {
    children,
    className,
    dot = true,
    size = 'compact',
    tone = 'neutral',
    ...rest
  },
  ref,
) {
  return (
    <span
      {...rest}
      ref={ref}
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
});

TltBadge.displayName = 'TltBadge';

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


export {
  TltTabs,
  type TltTabItem,
  type TltTabsProps,
} from './TltTabs';
export {
  TltTable,
  type TltTableColumn,
  type TltTableProps,
} from './TltTable';

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
