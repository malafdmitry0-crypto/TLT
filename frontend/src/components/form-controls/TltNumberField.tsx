import '@/utils/reactAriaEnvironment';
import type {
  ChangeEventHandler,
  CSSProperties,
  FocusEventHandler,
  KeyboardEventHandler,
  ReactNode,
} from 'react';
import { Input, NumberField } from 'react-aria-components';

type NumberInputValue = number | string | null | undefined;

export interface TltNumberFieldProps {
  id?: string;
  name?: string;
  value?: NumberInputValue;
  defaultValue?: number | string;
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
  unit?: ReactNode;
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

function toNumberFieldValue(value: NumberInputValue) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === 'string') return toFiniteNumber(value) ?? Number.NaN;
  return Number.NaN;
}

function toInputAttribute(value: number | string | undefined) {
  const finiteValue = toFiniteNumber(value);
  return finiteValue === undefined ? undefined : String(finiteValue);
}

function parseInputValue(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (normalized === '') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const numberFieldValue = value === undefined && defaultValue !== undefined
    ? undefined
    : toNumberFieldValue(value);
  const numberFieldDefaultValue = typeof defaultValue === 'string'
    ? toFiniteNumber(defaultValue)
    : defaultValue;
  const resolvedAriaLabel = ariaLabel ?? placeholder ?? name ?? id ?? 'Числовое значение';

  const handleChange = (nextValue: number) => {
    onChange?.(Number.isFinite(nextValue) ? nextValue : null);
  };

  const handleInputChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const parsed = parseInputValue(event.currentTarget.value);
    if (parsed !== undefined) {
      onChange?.(parsed);
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    onKeyDown?.(event);
    if (!event.defaultPrevented && event.key === 'Enter') {
      onPressEnter?.(event);
    }
  };

  return (
    <NumberField
      aria-label={resolvedAriaLabel}
      className={joinClassNames('tlt-number-field', className)}
      commitBehavior="validate"
      defaultValue={numberFieldDefaultValue}
      id={id}
      isDisabled={disabled}
      isInvalid={isInvalid}
      isReadOnly={readOnly}
      isRequired={isRequired}
      isWheelDisabled
      maxValue={toFiniteNumber(max)}
      minValue={toFiniteNumber(min)}
      name={name}
      onChange={handleChange}
      step={toFiniteNumber(step)}
      style={wrapperStyle ?? style}
      validationBehavior="aria"
      value={numberFieldValue}
    >
      <Input
        aria-invalid={isInvalid || undefined}
        aria-required={isRequired || undefined}
        className={joinClassNames('tlt-number-field__input', inputClassName)}
        data-testid={testId}
        max={toInputAttribute(max)}
        min={toInputAttribute(min)}
        onChange={handleInputChange}
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        step={toInputAttribute(step)}
        style={inputStyle}
      />
      {unit ? (
        <span
          aria-hidden="true"
          className={joinClassNames('tlt-number-field__unit', addonClassName)}
        >
          {unit}
        </span>
      ) : null}
    </NumberField>
  );
}
