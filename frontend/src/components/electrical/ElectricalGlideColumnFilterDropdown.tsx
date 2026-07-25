import { useEffect, useState } from 'react';
import { Checkbox, Space, Typography } from 'antd';

import type { HeatCalcColumnFilter } from '@/utils/heatCalcTableFindability';
import { TltButton, TltNumberField, TltSelect, TltTextField } from '@/components/ui-kit';

const { Text } = Typography;

type ElectricalGlideFilterKind = 'text' | 'numberRange' | 'enum' | 'boolean';

function toInputNumberValue(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toBooleanSelectValue(value: boolean | 'empty' | undefined) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value === 'empty') return 'empty';
  return null;
}

function fromBooleanSelectValue(value: string | number | null): boolean | 'empty' | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'empty') return 'empty';
  return undefined;
}

interface ElectricalGlideColumnFilterDropdownProps {
  title: string;
  kind: ElectricalGlideFilterKind;
  filter?: HeatCalcColumnFilter;
  enumOptions?: Array<{ value: string; label: string }>;
  onApply: (filter?: HeatCalcColumnFilter) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function ElectricalGlideColumnFilterDropdown({
  title,
  kind,
  filter,
  enumOptions = [],
  onApply,
  onReset,
  onClose,
}: ElectricalGlideColumnFilterDropdownProps) {
  const [textValue, setTextValue] = useState('');
  const [minValue, setMinValue] = useState<number | null>(null);
  const [maxValue, setMaxValue] = useState<number | null>(null);
  const [enumValues, setEnumValues] = useState<string[]>([]);
  const [booleanValue, setBooleanValue] = useState<boolean | 'empty' | undefined>(undefined);
  const [includeEmpty, setIncludeEmpty] = useState(false);

  useEffect(() => {
    setTextValue(filter?.kind === 'text' ? filter.value : '');
    setMinValue(filter?.kind === 'numberRange' ? toInputNumberValue(filter.min) : null);
    setMaxValue(filter?.kind === 'numberRange' ? toInputNumberValue(filter.max) : null);
    setEnumValues(filter?.kind === 'enum' ? filter.values.map(String) : []);
    setBooleanValue(filter?.kind === 'boolean' ? filter.value : undefined);
    setIncludeEmpty(
      filter?.kind === 'numberRange' || filter?.kind === 'enum'
        ? !!filter.includeEmpty
        : false,
    );
  }, [filter]);

  const invalidRange = minValue != null && maxValue != null && minValue > maxValue;

  function applyFilter() {
    if (kind === 'text') {
      const value = textValue.trim();
      onApply(value ? { kind: 'text', value } : undefined);
      onClose();
      return;
    }
    if (kind === 'numberRange') {
      if (invalidRange) return;
      onApply(
        minValue != null || maxValue != null || includeEmpty
          ? {
              kind: 'numberRange',
              min: minValue ?? undefined,
              max: maxValue ?? undefined,
              includeEmpty,
            }
          : undefined,
      );
      onClose();
      return;
    }
    if (kind === 'enum') {
      onApply(
        enumValues.length > 0 || includeEmpty
          ? { kind: 'enum', values: enumValues, includeEmpty }
          : undefined,
      );
      onClose();
      return;
    }

    onApply(booleanValue !== undefined ? { kind: 'boolean', value: booleanValue } : undefined);
    onClose();
  }

  function resetFilter() {
    setTextValue('');
    setMinValue(null);
    setMaxValue(null);
    setEnumValues([]);
    setBooleanValue(undefined);
    setIncludeEmpty(false);
    onReset();
    onClose();
  }

  const toggleEnumValue = (value: string, checked: boolean) => {
    setEnumValues((prev) => (
      checked ? [...prev, value] : prev.filter((item) => item !== value)
    ));
  };

  return (
    <div
      className="table-filter-dropdown"
      onKeyDown={(event) => {
        if (event.key === 'Enter') applyFilter();
      }}
    >
      <div className="table-filter-title">{title}</div>
      {kind === 'text' && (
        <TltTextField
          autoFocus
          value={textValue}
          placeholder="Найти"
          aria-label={`Поиск: ${title}`}
          onChange={setTextValue}
        />
      )}
      {kind === 'numberRange' && (
        <div className="table-filter-number-range">
          <TltNumberField
            value={minValue}
            placeholder="от"
            aria-label={`Минимум: ${title}`}
            onChange={(value) => setMinValue(toInputNumberValue(value))}
          />
          <TltNumberField
            value={maxValue}
            placeholder="до"
            aria-label={`Максимум: ${title}`}
            onChange={(value) => setMaxValue(toInputNumberValue(value))}
          />
          {invalidRange && <Text type="danger">Минимум больше максимума</Text>}
        </div>
      )}
      {kind === 'enum' && (
        <div className="table-filter-enum-list" role="group" aria-label={`Значения: ${title}`}>
          {enumOptions.map((option) => (
            <Checkbox
              key={option.value}
              checked={enumValues.includes(option.value)}
              onChange={(event) => toggleEnumValue(option.value, event.target.checked)}
            >
              {option.label}
            </Checkbox>
          ))}
        </div>
      )}
      {kind === 'boolean' && (
        <TltSelect
          allowClear
          value={toBooleanSelectValue(booleanValue)}
          options={[
            { value: 'true', label: 'Да' },
            { value: 'false', label: 'Нет' },
            { value: 'empty', label: 'Пустые' },
          ]}
          placeholder="Значение"
          aria-label={`Значение: ${title}`} className="tlt-field--min-w160"
          onChange={(value) => setBooleanValue(fromBooleanSelectValue(value))}
        />
      )}
      {(kind === 'numberRange' || kind === 'enum') && (
        <Checkbox checked={includeEmpty} onChange={(event) => setIncludeEmpty(event.target.checked)}>
          Пустые
        </Checkbox>
      )}
      <Space className="table-filter-actions">
        <TltButton size="compact" onClick={resetFilter}>
          Сбросить
        </TltButton>
        <TltButton size="compact" variant="primary" disabled={invalidRange} onClick={applyFilter}>
          Применить
        </TltButton>
      </Space>
    </div>
  );
}
