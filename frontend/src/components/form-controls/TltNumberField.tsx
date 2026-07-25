import type {
  CSSProperties,
  FocusEventHandler,
  KeyboardEventHandler,
  ReactNode,
} from 'react';
import { InputNumber, Space } from 'antd';

type NumberInputValue = number | string | null | undefined;

/**
 * TLT number input with optional unit addon and RU decimal comma.
 * Prefer wrapping with `CompactField`. Import from `@/components/ui-kit`.
 */
export interface TltNumberFieldProps {
  id?: string;
  name?: string;
  /** Controlled value. Empty/clear → `onChange(null)`. */
  value?: NumberInputValue;
  defaultValue?: number | string;
  /** Finite number, or `null` when cleared. */
  onChange?: (value: number | null) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onPressEnter?: KeyboardEventHandler<HTMLInputElement>;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Unit label shown after the input (e.g. `°C`, `МПа`). */
  unit?: ReactNode;
  /** Visual validation tone; `error` also marks the field invalid. */
  status?: 'error' | 'warning' | '';
  className?: string;
  inputClassName?: string;
  addonClassName?: string;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
  wrapperStyle?: CSSProperties;
  'aria-label'?: string;
  'aria-required'?: boolean | 'true' | 'false';
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
  'data-testid'?: string;
}

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined;
}

function toFiniteNumber(value: number | string | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toControlledValue(value: NumberInputValue) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return toFiniteNumber(value) ?? null;
}

function isInvalidValue(value: TltNumberFieldProps['aria-invalid'], status: TltNumberFieldProps['status']) {
  return status === 'error' || value === true || value === 'true';
}

export default function TltNumberField({
  id,
  name,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  onPressEnter,
  min,
  max,
  step,
  disabled,
  readOnly,
  required,
  placeholder,
  unit,
  status,
  className,
  inputClassName,
  addonClassName,
  style,
  inputStyle,
  wrapperStyle,
  'aria-label': ariaLabel,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'data-testid': testId,
}: TltNumberFieldProps) {
  const isRequired = Boolean(required || ariaRequired === true || ariaRequired === 'true');
  const isInvalid = isInvalidValue(ariaInvalid, status);
  const resolvedAriaLabel = ariaLabel ?? placeholder ?? name ?? id ?? 'Числовое значение';
  const controlled = toControlledValue(value);
  const defaultNum = typeof defaultValue === 'string'
    ? toFiniteNumber(defaultValue)
    : defaultValue;

  const numberInput = (
    <InputNumber
      id={id}
      name={name}
      value={controlled === undefined ? undefined : controlled}
      defaultValue={defaultNum}
      min={toFiniteNumber(min)}
      max={toFiniteNumber(max)}
      step={toFiniteNumber(step) ?? 1}
      disabled={disabled}
      readOnly={readOnly}
      required={isRequired}
      placeholder={placeholder}
      status={isInvalid ? 'error' : status === 'warning' ? 'warning' : undefined}
      controls={false}
      keyboard
      changeOnWheel={false}
      className={joinClassNames('tlt-number-field__input', inputClassName)}
      style={inputStyle}
      data-testid={testId}
      aria-label={resolvedAriaLabel}
      aria-required={isRequired || undefined}
      aria-invalid={isInvalid || undefined}
      // Comma as decimal separator (RU locale).
      // Empty input must return '' (not NaN) so rc-input-number commits null on clear.
      parser={(display) => {
        const normalized = String(display ?? '').trim().replace(',', '.');
        if (normalized === '') {
          return '';
        }
        if (normalized === '-' || normalized === '.' || normalized === '-.') {
          return normalized;
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : normalized;
      }}
      formatter={(val, info) => {
        if (info?.userTyping) return info.input;
        if (val === null || val === undefined || val === '' || Number.isNaN(Number(val))) return '';
        return String(val).replace('.', ',');
      }}
      onChange={(next) => {
        if (next === null || next === undefined || next === '') {
          onChange?.(null);
          return;
        }
        const num = typeof next === 'number' ? next : Number(next);
        onChange?.(Number.isFinite(num) ? num : null);
      }}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === 'Enter') {
          onPressEnter?.(event);
        }
      }}
    />
  );

  return (
    <span
      className={joinClassNames(
        'tlt-number-field',
        unit ? 'tlt-number-field--with-unit' : undefined,
        className,
      )}
      style={wrapperStyle ?? style}
    >
      {unit ? (
        <Space.Compact className="tlt-number-field__compact">
          {numberInput}
          <span
            aria-hidden="true"
            className={joinClassNames('tlt-number-field__unit', addonClassName)}
          >
            {unit}
          </span>
        </Space.Compact>
      ) : (
        numberInput
      )}
    </span>
  );
}
