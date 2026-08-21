import { useState } from 'react';
import { Checkbox, Space, Typography } from 'antd';

import {
  toInputNumberValue,
  type ElectricalFilterKind,
} from '@/domain/electrical/elecCalcTableFilterModel';
import type { HeatCalcColumnFilter } from '@/utils/heatCalcTableFindability';
import { TltButton, TltNumberField, TltSelect, TltTextField } from '@/components/ui-kit';

const { Text } = Typography;

type ElectricalColumnFilterDropdownProps = {
  title: string;
  kind: ElectricalFilterKind;
  filter?: HeatCalcColumnFilter;
  enumOptions?: Array<{ value: string; label: string }>;
  onApply: (filter: HeatCalcColumnFilter) => void;
  onReset: () => void;
  onClose: () => void;
};

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

export default function ElectricalColumnFilterDropdown({
  title,
  kind,
  filter,
  enumOptions,
  onApply,
  onReset,
  onClose,
}: ElectricalColumnFilterDropdownProps) {
  const [textValue, setTextValue] = useState(filter?.kind === 'text' ? filter.value : '');
  const [minValue, setMinValue] = useState<number | null>(
    filter?.kind === 'numberRange' ? toInputNumberValue(filter.min) : null,
  );
  const [maxValue, setMaxValue] = useState<number | null>(
    filter?.kind === 'numberRange' ? toInputNumberValue(filter.max) : null,
  );
  const [enumValues, setEnumValues] = useState<string[]>(
    filter?.kind === 'enum' ? filter.values.map(String) : [],
  );
  const [booleanValue, setBooleanValue] = useState<boolean | 'empty' | undefined>(
    filter?.kind === 'boolean' ? filter.value : undefined,
  );
  const [includeEmpty, setIncludeEmpty] = useState(
    (filter?.kind === 'numberRange' || filter?.kind === 'enum') && !!filter.includeEmpty,
  );
  const invalidRange = Number.isFinite(minValue)
    && Number.isFinite(maxValue)
    && Number(minValue) > Number(maxValue);

  const applyFilter = () => {
    if (kind === 'text') onApply({ kind: 'text', value: textValue });
    if (kind === 'numberRange') {
      onApply({
        kind: 'numberRange',
        min: minValue ?? undefined,
        max: maxValue ?? undefined,
        includeEmpty,
      });
    }
    if (kind === 'enum') onApply({ kind: 'enum', values: enumValues, includeEmpty });
    if (kind === 'boolean') onApply({ kind: 'boolean', value: booleanValue });
    onClose();
  };

  const resetFilter = () => {
    onReset();
    onClose();
  };

  const toggleEnumValue = (value: string, checked: boolean) => {
    setEnumValues((prev) => (
      checked ? [...prev, value] : prev.filter((item) => item !== value)
    ));
  };

  return (
    <div className="table-filter-dropdown">
      <Text strong>{title}</Text>
      {kind === 'text' && (
        <TltTextField
          aria-label={`Поиск: ${title}`}
          value={textValue}
          onChange={setTextValue}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyFilter();
          }}
          autoFocus
        />
      )}
      {kind === 'numberRange' && (
        <Space size={6}>
          <TltNumberField
            placeholder="от"
            aria-label={`Минимум: ${title}`}
            value={minValue}
            onChange={(value) => setMinValue(toInputNumberValue(value))}
          />
          <TltNumberField
            placeholder="до"
            aria-label={`Максимум: ${title}`}
            value={maxValue}
            onChange={(value) => setMaxValue(toInputNumberValue(value))}
          />
        </Space>
      )}
      {kind === 'enum' && (
        <div className="table-filter-enum-list" role="group" aria-label={`Значения: ${title}`}>
          {(enumOptions ?? []).map((option) => (
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
          aria-label={`Значение: ${title}`}
          allowClear
          value={toBooleanSelectValue(booleanValue)}
          options={[
            { value: 'true', label: 'Да' },
            { value: 'false', label: 'Нет' },
            { value: 'empty', label: 'Пустые' },
          ]}
          onChange={(value) => setBooleanValue(fromBooleanSelectValue(value))} className="tlt-field--min-w160"
        />
      )}
      {(kind === 'numberRange' || kind === 'enum') && (
        <Checkbox checked={includeEmpty} onChange={(event) => setIncludeEmpty(event.target.checked)}>
          Пустые
        </Checkbox>
      )}
      <div className="table-filter-actions">
        <TltButton size="compact" onClick={resetFilter}>
          Сбросить
        </TltButton>
        <TltButton size="compact" variant="primary" disabled={invalidRange} onClick={applyFilter}>
          Применить
        </TltButton>
      </div>
    </div>
  );
}
