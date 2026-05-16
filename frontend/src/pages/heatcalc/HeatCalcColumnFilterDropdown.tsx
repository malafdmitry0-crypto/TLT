import { useEffect, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Select, Typography } from 'antd';

import {
  toInputNumberValue,
  type HeatCalcFilterKind,
} from '@/pages/heatcalc/heatCalcPageUtils';
import type { HeatCalcColumnFilter } from '@/utils/heatCalcTableFindability';

const { Text } = Typography;

interface HeatCalcColumnFilterDropdownProps {
  title: string;
  kind: HeatCalcFilterKind;
  filter?: HeatCalcColumnFilter;
  enumOptions: { label: string; value: string }[];
  onApply: (filter?: HeatCalcColumnFilter) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function HeatCalcColumnFilterDropdown({
  title,
  kind,
  filter,
  enumOptions,
  onApply,
  onReset,
  onClose,
}: HeatCalcColumnFilterDropdownProps) {
  const [textValue, setTextValue] = useState('');
  const [minValue, setMinValue] = useState<number | null>(null);
  const [maxValue, setMaxValue] = useState<number | null>(null);
  const [enumValues, setEnumValues] = useState<string[]>([]);
  const [includeEmpty, setIncludeEmpty] = useState(false);

  useEffect(() => {
    setTextValue(filter?.kind === 'text' ? filter.value : '');
    setMinValue(filter?.kind === 'numberRange' ? toInputNumberValue(filter.min) : null);
    setMaxValue(filter?.kind === 'numberRange' ? toInputNumberValue(filter.max) : null);
    setEnumValues(filter?.kind === 'enum' ? filter.values : []);
    setIncludeEmpty(
      filter?.kind === 'numberRange' || filter?.kind === 'enum'
        ? !!filter.includeEmpty
        : false,
    );
  }, [filter]);

  const invalidRange = kind === 'numberRange'
    && minValue != null
    && maxValue != null
    && minValue > maxValue;

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

    onApply(
      enumValues.length > 0 || includeEmpty
        ? { kind: 'enum', values: enumValues, includeEmpty }
        : undefined,
    );
    onClose();
  }

  function resetFilter() {
    setTextValue('');
    setMinValue(null);
    setMaxValue(null);
    setEnumValues([]);
    setIncludeEmpty(false);
    onReset();
    onClose();
  }

  return (
    <div className="table-filter-dropdown" onKeyDown={(event) => {
      if (event.key === 'Enter') applyFilter();
    }}>
      <div className="table-filter-title">{title}</div>
      {kind === 'text' && (
        <Input
          autoFocus
          allowClear
          size="small"
          value={textValue}
          placeholder="Найти"
          aria-label={`Поиск: ${title}`}
          onChange={(event) => setTextValue(event.target.value)}
        />
      )}
      {kind === 'numberRange' && (
        <div className="table-filter-number-range">
          <InputNumber
            size="small"
            value={minValue}
            placeholder="от"
            aria-label={`Минимум: ${title}`}
            onChange={(value) => setMinValue(toInputNumberValue(value))}
          />
          <InputNumber
            size="small"
            value={maxValue}
            placeholder="до"
            aria-label={`Максимум: ${title}`}
            onChange={(value) => setMaxValue(toInputNumberValue(value))}
          />
          {invalidRange && <Text type="danger">Минимум больше максимума</Text>}
        </div>
      )}
      {kind === 'enum' && (
        <Select
          mode="multiple"
          allowClear
          showSearch
          size="small"
          value={enumValues}
          options={enumOptions}
          placeholder="Значения"
          aria-label={`Значения: ${title}`}
          optionFilterProp="label"
          maxTagCount="responsive"
          onChange={setEnumValues}
        />
      )}
      {(kind === 'numberRange' || kind === 'enum') && (
        <Checkbox checked={includeEmpty} onChange={(event) => setIncludeEmpty(event.target.checked)}>
          Пустые
        </Checkbox>
      )}
      <div className="table-filter-actions">
        <Button size="small" onClick={resetFilter}>
          Сбросить
        </Button>
        <Button size="small" type="primary" disabled={invalidRange} onClick={applyFilter}>
          Применить
        </Button>
      </div>
    </div>
  );
}
