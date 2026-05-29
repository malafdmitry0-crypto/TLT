import '@/utils/reactAriaEnvironment';
import type { CSSProperties, Key, ReactNode } from 'react';
import {
  Button,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from 'react-aria-components';

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

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined;
}

function isRequiredValue(value: TltSelectProps['aria-required'], required?: boolean) {
  return Boolean(required || value === true || value === 'true');
}

function isInvalidValue(value: TltSelectProps['aria-invalid'], status: TltSelectProps['status']) {
  return status === 'error' || value === true || value === 'true';
}

function toSelectedKey(value: TltSelectProps['value']) {
  return value === undefined || value === null || value === '' ? null : value;
}

function toDefaultSelectedKey(value: TltSelectProps['defaultValue']) {
  return value === undefined || value === null || value === '' ? null : value;
}

function resolveSelectedValue(key: Key | null, options: TltSelectOption[]) {
  if (key == null) return null;
  const option = options.find((item) => item.value === key || String(item.value) === String(key));
  if (option) return option.value;
  if (typeof key === 'bigint') return String(key);
  return key;
}

function sanitizeDomId(value: string | undefined) {
  return value?.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export default function TltSelect({
  id,
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
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
  const selectedKey = value === undefined && defaultValue !== undefined
    ? undefined
    : toSelectedKey(value);
  const defaultSelectedKey = toDefaultSelectedKey(defaultValue);
  const resolvedAriaLabel = ariaLabel ?? placeholder ?? 'Выберите значение';
  const baseId = sanitizeDomId(id ?? name ?? testId);
  const valueId = baseId ? `${baseId}-value` : undefined;
  const listBoxId = baseId ? `${baseId}-listbox` : undefined;

  return (
    <Select
      aria-label={resolvedAriaLabel}
      className={joinClassNames('tlt-select', className)}
      defaultSelectedKey={defaultSelectedKey}
      id={baseId}
      isDisabled={disabled}
      isInvalid={isInvalid}
      isRequired={isRequired}
      name={name}
      onSelectionChange={(key) => onChange?.(resolveSelectedValue(key, options))}
      placeholder={placeholder}
      selectedKey={selectedKey}
      style={style}
      validationBehavior="aria"
    >
      <Button
        aria-invalid={isInvalid || undefined}
        aria-required={isRequired || undefined}
        className={joinClassNames('tlt-select__trigger', triggerClassName)}
        data-testid={testId}
      >
        <SelectValue className="tlt-select__value" id={valueId} />
        <span aria-hidden="true" className="tlt-select__arrow" />
      </Button>
      <Popover className={joinClassNames('tlt-select__popover', popoverClassName)}>
        <ListBox className={joinClassNames('tlt-select__listbox', listBoxClassName)} id={listBoxId}>
          {options.map((option) => (
            <ListBoxItem
              className="tlt-select__option"
              id={option.value}
              isDisabled={option.disabled}
              key={option.value}
              textValue={String(option.label)}
              value={option}
            >
              {option.label}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}
