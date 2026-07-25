/**
 * Public Tlt* primitives — Ant Design 5 under a stable TLT façade.
 * Feature code imports only via @/components/ui-kit.
 */
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Skeleton,
  Tag,
} from 'antd';

export type TltUiTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type TltButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type TltButtonSize = 'compact' | 'comfortable' | 'icon';

/**
 * Public button façade. Visual look is controlled by `variant` / `size`;
 * native submit/reset uses HTML `type` only (not Ant Button `type`).
 */
export interface TltButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'color'> {
  /** Visual style (primary / secondary / ghost / danger / link). */
  variant?: TltButtonVariant;
  /** Control height density. `icon` is for icon-only compact buttons. */
  size?: TltButtonSize;
  icon?: ReactNode;
  /** Shows spinner and disables the button while true. */
  loading?: boolean;
  /** Native HTML button type. Does not change visual variant. */
  type?: 'button' | 'submit' | 'reset';
}

function joinClassNames(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined;
}

const buttonTypeMap: Record<TltButtonVariant, 'primary' | 'default' | 'text' | 'link' | 'dashed'> = {
  primary: 'primary',
  secondary: 'default',
  ghost: 'text',
  danger: 'primary',
  link: 'link',
};

const buttonSizeMap: Record<TltButtonSize, 'small' | 'middle' | 'large'> = {
  compact: 'middle',
  comfortable: 'large',
  icon: 'small',
};

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
  const htmlType = type === 'submit' || type === 'reset' ? type : 'button';
  // Strip props that collide with Ant Button's own API (form* / name / value).
  const {
    form: _form,
    formAction: _formAction,
    formEncType: _formEncType,
    formMethod: _formMethod,
    formNoValidate: _formNoValidate,
    formTarget: _formTarget,
    name,
    value,
    ...domSafe
  } = rest;

  const {
    onClick,
    onKeyDown,
    onFocus,
    onBlur,
    id,
    tabIndex,
    title,
    style,
    'aria-label': ariaLabel,
    'aria-pressed': ariaPressed,
    'aria-disabled': ariaDisabled,
    'aria-describedby': ariaDescribedBy,
    'aria-expanded': ariaExpanded,
    'aria-controls': ariaControls,
    'aria-haspopup': ariaHasPopup,
  } = domSafe;
  const testId = (domSafe as { 'data-testid'?: string })['data-testid'];

  return (
    <Button
      ref={ref}
      className={joinClassNames(
        'tlt-ui-button',
        `tlt-ui-button--${variant}`,
        `tlt-ui-button--${size}`,
        loading && 'tlt-ui-button--loading',
        className,
      )}
      type={buttonTypeMap[variant]}
      danger={variant === 'danger'}
      size={buttonSizeMap[size]}
      icon={loading ? undefined : icon}
      loading={loading}
      disabled={disabled || loading}
      htmlType={htmlType}
      name={name}
      value={value as string | number | readonly string[] | undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      id={id}
      tabIndex={tabIndex}
      title={title}
      style={style}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-disabled={ariaDisabled}
      aria-describedby={ariaDescribedBy}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      aria-haspopup={ariaHasPopup}
      aria-busy={loading || undefined}
      data-testid={testId}
    >
      {hasText ? <span className="tlt-ui-button__label">{children}</span> : null}
    </Button>
  );
});

TltButton.displayName = 'TltButton';

export interface TltBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TltUiTone;
  dot?: boolean;
  size?: 'compact' | 'regular';
}

const badgeColor: Record<TltUiTone, string | undefined> = {
  neutral: 'default',
  info: 'blue',
  success: 'green',
  warning: 'gold',
  danger: 'red',
};

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
    <Tag
      {...rest}
      ref={ref}
      className={joinClassNames(
        'tlt-ui-badge',
        `tlt-ui-badge--${tone}`,
        `tlt-ui-badge--${size}`,
        dot && 'tlt-ui-badge--dot',
        className,
      )}
      color={badgeColor[tone]}
      bordered={false}
    >
      {children}
    </Tag>
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
  const titleNode = title != null
    ? <h3 className="tlt-ui-card__title">{title}</h3>
    : undefined;

  const body = (
    <Card
      className={joinClassNames(
        'tlt-ui-card',
        `tlt-ui-card--${tone}`,
        `tlt-ui-card--padding-${padding}`,
        className,
      )}
      title={titleNode}
      extra={actions}
      size={padding === 'comfortable' ? 'default' : 'small'}
      variant="outlined"
    >
      {description ? <p className="tlt-ui-card__description">{description}</p> : null}
      {children}
    </Card>
  );

  if (as === 'div') return body;
  const Wrapper = as;
  return (
    <Wrapper {...rest} className={joinClassNames('tlt-ui-card-host', `tlt-ui-card-host--${as}`)}>
      {body}
    </Wrapper>
  );
}

export interface TltAlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: Exclude<TltUiTone, 'neutral'>;
  title?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}

const alertType: Record<Exclude<TltUiTone, 'neutral'>, 'info' | 'success' | 'warning' | 'error'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
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
    <Alert
      {...rest}
      className={joinClassNames('tlt-ui-alert', `tlt-ui-alert--${tone}`, className)}
      type={alertType[tone]}
      showIcon
      message={title}
      description={children}
      action={action as React.ReactElement | undefined}
      closable={Boolean(onDismiss)}
      onClose={onDismiss}
      closeIcon={<span aria-label={dismissLabel}>×</span>}
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
    />
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
  icon,
  title,
  ...rest
}: TltEmptyStateProps) {
  return (
    <div {...rest} className={joinClassNames('tlt-ui-empty', className)}>
      <Empty
        image={icon ?? Empty.PRESENTED_IMAGE_SIMPLE}
        description={(
          <div className="tlt-ui-empty__content">
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
            {children ? <div className="tlt-ui-empty__extra">{children}</div> : null}
          </div>
        )}
      >
        {action ? <div className="tlt-ui-empty__action">{action}</div> : null}
      </Empty>
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
      <Skeleton
        active
        title={variant === 'panel'}
        paragraph={{ rows: count }}
      />
    </div>
  );
}
