import type {
  CSSProperties,
  FocusEventHandler,
  KeyboardEventHandler,
} from 'react';
import { Input } from 'antd';

export interface TltTextFieldProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Native input type. Use `password` instead of Ant `Input.Password`. */
  type?: 'text' | 'password' | 'email' | 'search' | 'tel' | 'url' | 'hidden';
  autoComplete?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
  'aria-label'?: string;
  'aria-required'?: boolean | 'true' | 'false';
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
  'data-testid'?: string;
}

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined;
}

function isInvalidValue(value: TltTextFieldProps['aria-invalid']) {
  return value === true || value === 'true';
}

export default function TltTextField({
  id,
  name,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  disabled,
  readOnly,
  required,
  placeholder,
  maxLength,
  type = 'text',
  autoComplete,
  autoFocus,
  className,
  inputClassName,
  style,
  inputStyle,
  'aria-label': ariaLabel,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'data-testid': testId,
}: TltTextFieldProps) {
  const isRequired = Boolean(required || ariaRequired === true || ariaRequired === 'true');
  const isInvalid = isInvalidValue(ariaInvalid);
  const resolvedAriaLabel = ariaLabel ?? placeholder ?? name ?? id ?? 'Текстовое значение';

  return (
    <span
      className={joinClassNames('tlt-text-field', isInvalid ? 'tlt-text-field--invalid' : undefined, className)}
      data-invalid={isInvalid || undefined}
      style={style}
    >
      <Input
        id={id}
        name={name}
        type={type}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        required={isRequired}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        status={isInvalid ? 'error' : undefined}
        className={joinClassNames('tlt-text-field__input', inputClassName)}
        style={inputStyle}
        data-testid={testId}
        aria-label={resolvedAriaLabel}
        aria-required={isRequired || undefined}
        aria-invalid={isInvalid || undefined}
        onChange={(event) => onChange?.(event.target.value)}
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      />
    </span>
  );
}
