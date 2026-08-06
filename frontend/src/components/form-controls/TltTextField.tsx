import type {
  CSSProperties,
  FocusEventHandler,
  KeyboardEventHandler,
} from 'react';
import { Input } from 'antd';

/**
 * TLT text input façade over Ant `Input`.
 * Prefer wrapping with `CompactField` for label / hint / error chrome.
 * Import from `@/components/ui-kit` (or `@/components/form-controls`).
 */
export interface TltTextFieldProps {
  id?: string;
  name?: string;
  /** Controlled value. Omit for uncontrolled + `defaultValue`. */
  value?: string;
  defaultValue?: string;
  /** Fires with the string value (not the DOM event). */
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
  /** Explicit accessible name. Omit when the input is associated with a visible label. */
  'aria-label'?: string;
  'aria-required'?: boolean | 'true' | 'false';
  /** When true/`true`, applies error status styling. */
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
  return (
    <span
      className={joinClassNames('tlt-text-field', isInvalid ? 'tlt-text-field--invalid' : undefined, className)}
      data-required={isRequired ? 'true' : undefined}
      data-invalid={isInvalid || undefined}
      data-disabled={disabled ? 'true' : undefined}
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
        aria-label={ariaLabel}
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
