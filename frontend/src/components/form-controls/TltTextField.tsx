import '@/utils/reactAriaEnvironment';
import type {
  CSSProperties,
  FocusEventHandler,
  KeyboardEventHandler,
} from 'react';
import { Input, TextField } from 'react-aria-components';

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
    <TextField
      aria-label={resolvedAriaLabel}
      className={joinClassNames('tlt-text-field', className)}
      defaultValue={defaultValue}
      isDisabled={disabled}
      isInvalid={isInvalid}
      isReadOnly={readOnly}
      isRequired={isRequired}
      onChange={onChange}
      style={style}
      type={type}
      validationBehavior="aria"
      value={value}
    >
      <Input
        aria-invalid={isInvalid || undefined}
        aria-required={isRequired || undefined}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={joinClassNames('tlt-text-field__input', inputClassName)}
        data-testid={testId}
        id={id}
        maxLength={maxLength}
        name={name}
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={inputStyle}
        type={type}
      />
    </TextField>
  );
}
