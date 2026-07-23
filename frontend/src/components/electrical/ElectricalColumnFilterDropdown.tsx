import { useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Select, Space, Typography } from 'antd';

import {
  toInputNumberValue,
  type ElectricalFilterKind,
} from '@/domain/electrical/elecCalcTableFilterModel';
import type { HeatCalcColumnFilter } from '@/utils/heatCalcTableFindability';

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

  return (
    <div className="table-filter-dropdown">
      <Text strong>{title}</Text>
      {kind === 'text' && (
        <Input
          size="small"
          aria-label={`Поиск: ${title}`}
          value={textValue}
          onChange={(event) => setTextValue(event.target.value)}
          onPressEnter={applyFilter}
          allowClear
        />
      )}
      {kind === 'numberRange' && (
        <Space size={6}>
          <InputNumber
            size="small"
            placeholder="от"
            aria-label={`Минимум: ${title}`}
            value={minValue}
            onChange={(value) => setMinValue(toInputNumberValue(value))}
          />
          <InputNumber
            size="small"
            placeholder="до"
            aria-label={`Максимум: ${title}`}
            value={maxValue}
            onChange={(value) => setMaxValue(toInputNumberValue(value))}
          />
        </Space>
      )}
      {kind === 'enum' && (
        <Select
          mode="multiple"
          size="small"
          aria-label={`Значения: ${title}`}
          value={enumValues}
          options={enumOptions}
          onChange={setEnumValues}
          style={{ minWidth: 220 }}
          maxTagCount="responsive"
        />
      )}
      {kind === 'boolean' && (
        <Select
          size="small"
          aria-label={`Значение: ${title}`}
          allowClear
          value={booleanValue}
          options={[
            { value: true, label: 'Да' },
            { value: false, label: 'Нет' },
            { value: 'empty', label: 'Пустые' },
          ]}
          onChange={setBooleanValue}
          style={{ minWidth: 160 }}
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
