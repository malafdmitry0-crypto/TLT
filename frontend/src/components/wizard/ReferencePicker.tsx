import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Empty, Input, Modal, Spin } from 'antd';
import { CloseCircleFilled, SearchOutlined } from '@ant-design/icons';

type ReferencePickerValue = string | number;

export interface ReferencePickerOption {
  value: ReferencePickerValue;
  label: ReactNode;
  description?: ReactNode;
  searchText?: string;
  disabled?: boolean;
}

interface ReferencePickerProps {
  value?: ReferencePickerValue;
  onChange?: (value: ReferencePickerValue | undefined) => void;
  options: ReferencePickerOption[];
  placeholder?: string;
  modalTitle: string;
  searchPlaceholder?: string;
  loading?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  required?: boolean;
  notFoundContent?: ReactNode;
  className?: string;
  'data-testid'?: string;
  'aria-label'?: string;
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  return '';
}

function normalizeSearch(text: string): string {
  return text.trim().toLocaleLowerCase('ru');
}

export default function ReferencePicker({
  value,
  onChange,
  options,
  placeholder = 'Выберите',
  modalTitle,
  searchPlaceholder = 'Поиск',
  loading = false,
  disabled = false,
  allowClear = false,
  required = false,
  notFoundContent = 'Ничего не найдено',
  className,
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
}: ReferencePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedOption = options.find((option) => String(option.value) === String(value));
  const selectedText = selectedOption ? nodeText(selectedOption.label) : value == null ? '' : String(value);
  const hasValue = value != null && value !== '';
  const query = normalizeSearch(search);
  const filteredOptions = useMemo(() => {
    if (!query) return options;
    return options.filter((option) => {
      const haystack = normalizeSearch([
        nodeText(option.label),
        nodeText(option.description),
        option.searchText ?? '',
        String(option.value),
      ].join(' '));
      return haystack.includes(query);
    });
  }, [options, query]);

  function openModal() {
    if (disabled) return;
    setSearch('');
    setOpen(true);
  }

  function selectOption(nextValue: ReferencePickerValue) {
    onChange?.(nextValue);
    setOpen(false);
  }

  function clearValue() {
    onChange?.(undefined);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openModal();
      return;
    }
    if (allowClear && hasValue && (event.key === 'Backspace' || event.key === 'Delete')) {
      event.preventDefault();
      clearValue();
    }
  }

  return (
    <>
      <div
        className={[
          'reference-picker-control',
          hasValue ? '' : 'reference-picker-control--empty',
          required ? 'reference-picker-control--required' : '',
          disabled ? 'reference-picker-control--disabled' : '',
          className ?? '',
        ].filter(Boolean).join(' ')}
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? modalTitle}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        title={selectedText || placeholder}
        data-testid={dataTestId}
        onClick={openModal}
        onKeyDown={handleKeyDown}
      >
        <span className="reference-picker-value">
          {hasValue ? (selectedOption?.label ?? String(value)) : (
            <span className="reference-picker-placeholder">{placeholder}</span>
          )}
        </span>
        {allowClear && hasValue && !disabled && (
          <span
            className="reference-picker-clear"
            role="button"
            aria-label="Очистить"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              clearValue();
            }}
          >
            <CloseCircleFilled />
          </span>
        )}
        <SearchOutlined className="reference-picker-icon" />
      </div>

      <Modal
        title={modalTitle}
        open={open}
        width={720}
        footer={null}
        className="reference-picker-modal"
        onCancel={() => setOpen(false)}
      >
        <Input
          autoFocus
          allowClear
          prefix={<SearchOutlined />}
          value={search}
          placeholder={searchPlaceholder}
          className="reference-picker-search"
          onChange={(event) => setSearch(event.target.value)}
        />
        {loading ? (
          <div className="reference-picker-loading">
            <Spin />
          </div>
        ) : filteredOptions.length > 0 ? (
          <div className="reference-picker-list" role="listbox" aria-label={modalTitle}>
            {filteredOptions.map((option) => {
              const selected = String(option.value) === String(value);
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  className={[
                    'reference-picker-option',
                    selected ? 'reference-picker-option--selected' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => selectOption(option.value)}
                >
                  <span className="reference-picker-option-title">{option.label}</span>
                  {option.description && (
                    <span className="reference-picker-option-description">{option.description}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <Empty className="reference-picker-empty" description={notFoundContent} />
        )}
      </Modal>
    </>
  );
}
