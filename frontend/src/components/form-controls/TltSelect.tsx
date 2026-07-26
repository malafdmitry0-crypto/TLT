import type { CSSProperties, ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { Select } from 'antd';

/** Single option for {@link TltSelect}. */
export interface TltSelectOption {
  label: ReactNode;
  value: string | number;
  disabled?: boolean;
}

/**
 * TLT select façade over Ant `Select`.
 * Options: `{ value, label, disabled? }`. Prefer with `CompactField`.
 * Import from `@/components/ui-kit`.
 *
 * A11y note: Ant puts unknown DOM props on the outer `.ant-select` div (no role).
 * `aria-required` / `aria-invalid` are therefore applied to the inner
 * `[role="combobox"]` so axe `aria-allowed-attr` stays green.
 */
export interface TltSelectProps {
  id?: string;
  name?: string;
  /** Controlled value. Use `null` for empty. */
  value?: string | number | null;
  defaultValue?: string | number | null;
  /** Selected value, or `null` when cleared. */
  onChange?: (value: string | number | null) => void;
  disabled?: boolean;
  required?: boolean;
  /** Shows a clear control when a value is selected. */
  allowClear?: boolean;
  placeholder?: string;
  /** Option list (`value` + `label`; optional `disabled`). */
  options?: TltSelectOption[];
  status?: 'error' | 'warning' | '';
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  listBoxClassName?: string;
  style?: CSSProperties;
  'aria-label'?: string;
  'aria-required'?: boolean | 'true' | 'false';
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
  'data-testid'?: string;
}

function joinClassNames(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined;
}

function isRequiredValue(value: TltSelectProps['aria-required'], required?: boolean) {
  return Boolean(required || value === true || value === 'true');
}

function isInvalidValue(value: TltSelectProps['aria-invalid'], status: TltSelectProps['status']) {
  return status === 'error' || value === true || value === 'true';
}

function setOrRemoveAttr(el: HTMLElement, name: string, on: boolean) {
  if (on) el.setAttribute(name, 'true');
  else el.removeAttribute(name);
}

export default function TltSelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  allowClear = false,
  placeholder,
  options = [],
  status,
  className,
  triggerClassName,
  popoverClassName,
  listBoxClassName,
  style,
  'aria-label': ariaLabel,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'data-testid': testId,
}: TltSelectProps) {
  const shellRef = useRef<HTMLSpanElement>(null);
  const isRequired = isRequiredValue(ariaRequired, required);
  const isInvalid = isInvalidValue(ariaInvalid, status);
  const resolvedAriaLabel = ariaLabel ?? placeholder ?? 'Выберите значение';
  const hasValue = value !== undefined && value !== null && value !== '';
  const controlled = value === undefined ? undefined : (hasValue ? value : undefined);
  const defaultVal = defaultValue === null || defaultValue === undefined ? undefined : defaultValue;
  const showClear = allowClear && !disabled && hasValue;

  useLayoutEffect(() => {
    const combobox = shellRef.current?.querySelector<HTMLElement>('[role="combobox"]');
    if (!combobox) return;
    setOrRemoveAttr(combobox, 'aria-required', isRequired);
    setOrRemoveAttr(combobox, 'aria-invalid', isInvalid);
    if (resolvedAriaLabel) combobox.setAttribute('aria-label', resolvedAriaLabel);
  }, [isRequired, isInvalid, resolvedAriaLabel, controlled, disabled, options.length]);

  return (
    <span
      ref={shellRef}
      className={joinClassNames(
        'tlt-select-shell',
        showClear && 'tlt-select-shell--clearable',
        className,
      )}
      style={style}
      data-disabled={disabled ? 'true' : undefined}
    >
      <Select
        id={id}
        className={joinClassNames('tlt-select', 'tlt-select__trigger', triggerClassName)}
        classNames={{
          popup: {
            root: joinClassNames(
              'tlt-select__popover',
              'tlt-select__listbox',
              popoverClassName,
              listBoxClassName,
            ),
          },
        }}
        value={controlled}
        defaultValue={defaultVal}
        disabled={disabled}
        allowClear={false}
        placeholder={placeholder}
        status={isInvalid ? 'error' : status === 'warning' ? 'warning' : undefined}
        options={options.map((option) => ({
          label: option.label,
          value: option.value,
          disabled: option.disabled,
        }))}
        data-testid={testId}
        data-disabled={disabled ? 'true' : undefined}
        aria-label={resolvedAriaLabel}
        onChange={(next) => {
          if (next === undefined || next === null) {
            onChange?.(null);
            return;
          }
          onChange?.(next as string | number);
        }}
        getPopupContainer={() => document.body}
      />
      {showClear ? (
        <button
          type="button"
          className="tlt-select__clear"
          aria-label="Очистить"
          data-testid={testId ? `${testId}-clear` : undefined}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onChange?.(null);
          }}
        >
          ×
        </button>
      ) : null}
      {name ? <input type="hidden" name={name} value={hasValue ? String(value) : ''} readOnly aria-hidden /> : null}
    </span>
  );
}
