import type { CSSProperties, ReactNode } from 'react';
import { Select } from 'antd';

export interface TltSelectOption {
  label: ReactNode;
  value: string | number;
  disabled?: boolean;
}

export interface TltSelectProps {
  id?: string;
  name?: string;
  value?: string | number | null;
  defaultValue?: string | number | null;
  onChange?: (value: string | number | null) => void;
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  placeholder?: string;
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
  const isRequired = isRequiredValue(ariaRequired, required);
  const isInvalid = isInvalidValue(ariaInvalid, status);
  const resolvedAriaLabel = ariaLabel ?? placeholder ?? 'Выберите значение';
  const hasValue = value !== undefined && value !== null && value !== '';
  const controlled = value === undefined ? undefined : (hasValue ? value : undefined);
  const defaultVal = defaultValue === null || defaultValue === undefined ? undefined : defaultValue;
  const showClear = allowClear && !disabled && hasValue;

  return (
    <span
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
        popupClassName={joinClassNames(
          'tlt-select__popover',
          'tlt-select__listbox',
          popoverClassName,
          listBoxClassName,
        )}
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
        aria-required={isRequired || undefined}
        aria-invalid={isInvalid || undefined}
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
