import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Empty, Input, Modal, Select, Spin } from 'antd';
import { CloseCircleFilled, SearchOutlined } from '@ant-design/icons';

type ReferencePickerValue = string | number;

export interface ReferencePickerOption {
  value: ReferencePickerValue;
  label: ReactNode;
  description?: ReactNode;
  searchText?: string;
  group?: string;
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
  onOpen?: () => void;
  required?: boolean;
  groupFilterPlaceholder?: string;
  notFoundContent?: ReactNode;
  className?: string;
  'data-testid'?: string;
  'aria-label'?: string;
  'aria-required'?: boolean;
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
  onOpen,
  required = false,
  groupFilterPlaceholder,
  notFoundContent = 'Ничего не найдено',
  className,
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
  'aria-required': ariaRequired,
}: ReferencePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | undefined>();
  const selectedOption = options.find((option) => String(option.value) === String(value));
  const selectedText = selectedOption ? nodeText(selectedOption.label) : value == null ? '' : String(value);
  const hasValue = value != null && value !== '';
  const query = normalizeSearch(search);
  const groupOptions = useMemo(() => {
    if (!groupFilterPlaceholder) return [];
    const groups = [...new Set(options.map((option) => option.group).filter((group): group is string => Boolean(group)))];
    groups.sort((left, right) => left.localeCompare(right, 'ru'));
    return groups.map((group) => ({ value: group, label: group }));
  }, [groupFilterPlaceholder, options]);
  const filteredOptions = useMemo(() => {
    const groupFilteredOptions = selectedGroup
      ? options.filter((option) => option.group === selectedGroup)
      : options;
    if (!query) return groupFilteredOptions;
    return groupFilteredOptions.filter((option) => {
      const haystack = normalizeSearch([
        nodeText(option.label),
        nodeText(option.description),
        option.searchText ?? '',
        String(option.value),
      ].join(' '));
      return haystack.includes(query);
    });
  }, [options, query, selectedGroup]);

  function openModal() {
    if (disabled) return;
    onOpen?.();
    setSearch('');
    setSelectedGroup(undefined);
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
        aria-required={ariaRequired}
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
        {groupFilterPlaceholder && groupOptions.length > 0 ? (
          <div className="reference-picker-filter-row">
            <Select
              allowClear
              showSearch
              value={selectedGroup}
              placeholder={groupFilterPlaceholder}
              className="reference-picker-group-filter"
              optionFilterProp="label"
              options={groupOptions}
              onChange={(nextGroup) => setSelectedGroup(nextGroup)}
            />
            <Input
              autoFocus
              allowClear
              prefix={<SearchOutlined />}
              value={search}
              placeholder={searchPlaceholder}
              className="reference-picker-search"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        ) : (
          <Input
            autoFocus
            allowClear
            prefix={<SearchOutlined />}
            value={search}
            placeholder={searchPlaceholder}
            className="reference-picker-search"
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
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
