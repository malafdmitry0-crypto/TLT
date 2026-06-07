import type { ProjectObject } from '@/types/project';
import type { CableCatalogRow } from '@/utils/cableCatalogSourceLabels';
import { formatNumber, formatPower } from '@/utils/formatters';
import { isRecord } from '@/utils/typeGuards';
import type { CSSProperties } from 'react';

type CablePickerCableRow = CableCatalogRow & {
  price_per_meter?: number | null;
  stock_status?: string | null;
};

interface CablePickerCharacteristicsProps {
  object: ProjectObject;
  cable: CablePickerCableRow | null;
  cableType?: string | null;
  showObject?: boolean;
  showCable?: boolean;
  objectColumnCount?: number;
  cableColumnCount?: number;
}

const OBJECT_TYPE_LABEL: Record<string, string> = {
  pipe: 'Труба',
  tank: 'Резервуар',
};

const STOCK_STATUS_LABEL: Record<string, string> = {
  in_stock: 'В наличии',
  limited: 'Ограничено',
  on_order: 'Под заказ',
  unknown: 'Неизвестно',
};

const CABLE_TYPE_LABEL: Record<string, string> = {
  self_regulating: 'Саморегулирующийся',
  self_regulating_tt: 'ТТН/ТТВ/ТТХ',
  single_core: 'Одножильный',
  three_core: 'Трёхжильный',
  mineral: 'Минеральная изоляция',
  skin: 'Скин-система',
  resistive_single_core: 'Одножильный',
  resistive_three_core: 'Трёхжильный',
};

const PLACEMENT_LABEL: Record<string, string> = {
  indoor: 'В помещении',
  outdoor: 'Открыто',
  underground: 'Подземно',
};

const OBJECT_FIELD_LABELS: Record<string, string> = {
  object_type: 'Тип объекта',
  placement: 'Размещение',
  outer_diameter: 'Диаметр',
  pipe_length: 'Длина',
  tank_geometry: 'Геометрия резервуара',
  insulation: 'Изоляция',
  ambient_temperature: 'T окр.',
  process_temperature: 'T объекта',
  heat_loss_specific: 'Уд. теплопотери',
  total_heat_loss: 'Суммарные теплопотери',
};

const PIPE_OBJECT_FIELD_ORDER = [
  'object_type',
  'outer_diameter',
  'pipe_length',
  'heat_loss_specific',
  'total_heat_loss',
  'placement',
  'insulation',
  'ambient_temperature',
  'process_temperature',
];

const TANK_OBJECT_FIELD_ORDER = [
  'object_type',
  'tank_geometry',
  'heat_loss_specific',
  'total_heat_loss',
  'placement',
  'insulation',
  'ambient_temperature',
  'process_temperature',
];

const CABLE_FIELD_LABELS: Record<string, string> = {
  article: 'Артикул',
  brand: 'Бренд',
  cable_type: 'Тип кабеля',
  commercial_data_source: 'Данные',
  conductor_cross_section: 'Сечение',
  conductor_section_mm2: 'Сечение',
  currency: 'Валюта',
  diameter_mm: 'Диаметр кабеля',
  is_discontinued: 'Снят с пр-ва',
  is_preferred: 'Приоритетный',
  lead_time_days: 'Срок',
  mass_kg_km: 'Масса',
  max_length: 'Макс. длина',
  max_pipe_temp: 'Макс. T трубы',
  max_product_temp: 'Макс. T продукта',
  max_temperature: 'Макс. T',
  max_vapor_temp: 'Макс. T проп.',
  min_bend_radius_mm: 'Мин. радиус изгиба',
  min_order_quantity_m: 'Мин. заказ',
  min_temperature: 'Мин. T',
  model: 'Марка',
  nominal_power: 'Номинал',
  nominal_section_length_m: 'Длина по сечению',
  nominal_size_mm: 'Габарит',
  order_multiple_m: 'Кратность заказа',
  power_per_meter: 'Мощность',
  price_per_meter: 'Цена/м',
  price_updated_at: 'Цена обновлена',
  protection: 'Защита',
  q1: 'Q1',
  q2: 'Q2',
  resistance_ohm_km: 'Сопротивление',
  resistance_per_meter: 'Сопротивление, Ом/м',
  series: 'Серия',
  stock_quantity_m: 'Остаток',
  stock_status: 'Склад',
  stock_updated_at: 'Склад обновлён',
  supplier_name: 'Поставщик',
  supplier_priority: 'Приоритет поставщика',
  voltage: 'U',
};

const SKIPPED_CABLE_FIELD_KEYS = new Set([
  'article',
  'commercial_data_source',
  'currency',
  'id',
  'is_discontinued',
  'is_preferred',
  'lead_time_days',
  'min_order_quantity_m',
  'order_multiple_m',
  'params',
  'price_per_meter',
  'price_updated_at',
  'source',
  'stock_quantity_m',
  'stock_status',
  'stock_updated_at',
  'supplier_name',
  'supplier_priority',
  'external_seed_kind',
  'technical_data_complete',
  'technical_data_missing',
]);

const COMMON_CABLE_FIELD_ORDER = [
  'cable_type',
  'model',
  'brand',
  'series',
  'voltage',
];

const CABLE_FIELD_ORDER_BY_TYPE: Record<string, string[]> = {
  self_regulating: [
    ...COMMON_CABLE_FIELD_ORDER,
    'power_per_meter',
    'temperature_range',
    'min_temperature',
    'max_temperature',
    'max_product_temp',
    'max_vapor_temp',
    'max_pipe_temp',
    'protection',
  ],
  self_regulating_tt: [
    ...COMMON_CABLE_FIELD_ORDER,
    'nominal_power',
    'q1',
    'q2',
    'max_product_temp',
    'max_vapor_temp',
  ],
  single_core: [
    ...COMMON_CABLE_FIELD_ORDER,
    'power_per_meter',
    'resistance_ohm_km',
    'resistance_per_meter',
    'conductor_section_mm2',
    'diameter_mm',
    'nominal_section_length_m',
    'mass_kg_km',
    'min_bend_radius_mm',
    'temperature_range',
    'min_temperature',
    'max_temperature',
  ],
  three_core: [
    ...COMMON_CABLE_FIELD_ORDER,
    'power_per_meter',
    'resistance_ohm_km',
    'resistance_per_meter',
    'conductor_section_mm2',
    'nominal_size_mm',
    'diameter_mm',
    'mass_kg_km',
    'min_bend_radius_mm',
    'temperature_range',
    'min_temperature',
    'max_temperature',
  ],
  mineral: [
    ...COMMON_CABLE_FIELD_ORDER,
    'power_per_meter',
    'min_temperature',
    'max_temperature',
    'conductor_section_mm2',
    'nominal_size_mm',
    'diameter_mm',
  ],
  skin: [
    ...COMMON_CABLE_FIELD_ORDER,
    'power_per_meter',
    'min_temperature',
    'max_temperature',
    'max_length',
  ],
};

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== '';
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatUnitValue(value: unknown, unit: string, digits = 1) {
  const parsed = finiteNumber(value);
  return parsed === null ? valueText(value) : `${formatNumber(parsed, digits)} ${unit}`;
}

function formatTemperatureValue(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed === null ? valueText(value) : `${formatNumber(parsed, 0)} °C`;
}

function formatMillimetersFromMeters(value: unknown) {
  const parsed = finiteNumber(value);
  if (parsed === null) return valueText(value);
  const millimeters = Math.abs(parsed) <= 10 ? parsed * 1000 : parsed;
  return `${formatNumber(millimeters, millimeters >= 100 ? 0 : 1)} мм`;
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== null && value !== undefined && value !== '');
}

function powerText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return formatPower(Number(value));
}

function objectValue(
  object: ProjectObject,
  field: string,
) {
  const params = object.params ?? {};
  const results = object.results ?? {};
  switch (field) {
    case 'object_type':
      return OBJECT_TYPE_LABEL[object.object_type] ?? object.object_type;
    case 'placement':
      return PLACEMENT_LABEL[String(params.placement ?? '')] ?? valueText(params.placement);
    case 'outer_diameter':
      return formatMillimetersFromMeters(firstValue(params.outer_diameter, params.diameter));
    case 'pipe_length':
      return formatUnitValue(params.pipe_length, 'м', 1);
    case 'tank_geometry': {
      const diameter = formatMillimetersFromMeters(params.diameter);
      const height = formatMillimetersFromMeters(params.height);
      const length = formatMillimetersFromMeters(params.length);
      const width = formatMillimetersFromMeters(params.width);
      if (params.shape === 'rectangular') return `${length} × ${width} × ${height}`;
      if (params.shape === 'spherical') return `сфера Ø ${diameter}`;
      if (params.shape === 'cylindrical') return `цилиндр Ø ${diameter}, H ${height}`;
      return valueText(params.shape);
    }
    case 'insulation': {
      const material = valueText(firstValue(params.insulation_material, params.insulation_type));
      const thickness = formatMillimetersFromMeters(params.insulation_thickness);
      return material === '—' && thickness === '—' ? '—' : `${material}, ${thickness}`;
    }
    case 'ambient_temperature':
      return formatTemperatureValue(params.ambient_temperature);
    case 'process_temperature':
      return formatTemperatureValue(params.process_temperature);
    case 'heat_loss_specific':
      return object.object_type === 'tank'
        ? formatUnitValue(results.heat_loss_per_m2, 'Вт/м²', 2)
        : formatUnitValue(results.heat_loss_per_meter, 'Вт/м', 2);
    case 'total_heat_loss':
      return powerText(results.total_heat_loss);
    default:
      return '—';
  }
}

function buildObjectFields(object: ProjectObject) {
  const fields = object.object_type === 'tank'
    ? TANK_OBJECT_FIELD_ORDER
    : PIPE_OBJECT_FIELD_ORDER;
  return fields.map((field) => ({
    key: field,
    label: OBJECT_FIELD_LABELS[field] ?? field,
    value: objectValue(object, field),
  }));
}

function cableRawValue(row: CablePickerCableRow | null, key: string) {
  if (!row) return undefined;
  const direct = (row as Record<string, unknown>)[key];
  if (direct !== null && direct !== undefined && direct !== '') return direct;
  return isRecord(row.params) ? row.params[key] : undefined;
}

function cableValue(
  row: CablePickerCableRow | null,
  field: string,
  cableType?: string | null,
) {
  switch (field) {
    case 'model':
      return valueText(cableRawValue(row, 'model'));
    case 'cable_type': {
      const raw = firstValue(cableRawValue(row, 'cable_type'), cableType);
      return CABLE_TYPE_LABEL[String(raw)] ?? valueText(raw);
    }
    case 'brand':
      return valueText(cableRawValue(row, 'brand'));
    case 'series':
      return valueText(cableRawValue(row, 'series'));
    case 'power_per_meter':
      return formatUnitValue(cableRawValue(row, 'power_per_meter'), 'Вт/м', 2);
    case 'nominal_power':
      return formatUnitValue(cableRawValue(row, 'nominal_power'), 'Вт/м', 2);
    case 'resistance_ohm_km': {
      const resistancePerMeter = finiteNumber(cableRawValue(row, 'resistance_per_meter'));
      const value = firstValue(
        cableRawValue(row, 'resistance_ohm_km'),
        resistancePerMeter != null ? resistancePerMeter * 1000 : null,
      );
      return formatUnitValue(value, 'Ом/км', 4);
    }
    case 'resistance_per_meter':
      return formatUnitValue(cableRawValue(row, 'resistance_per_meter'), 'Ом/м', 6);
    case 'voltage':
      return formatUnitValue(cableRawValue(row, 'voltage'), 'В', 0);
    case 'min_temperature':
      return formatTemperatureValue(cableRawValue(row, 'min_temperature'));
    case 'max_temperature':
      return formatTemperatureValue(cableRawValue(row, 'max_temperature'));
    case 'temperature_range': {
      const min = formatTemperatureValue(cableRawValue(row, 'min_temperature'));
      const max = formatTemperatureValue(cableRawValue(row, 'max_temperature'));
      return min === '—' && max === '—' ? '—' : `${min}…${max}`;
    }
    case 'max_product_temp':
      return formatTemperatureValue(cableRawValue(row, 'max_product_temp'));
    case 'max_vapor_temp':
      return formatTemperatureValue(cableRawValue(row, 'max_vapor_temp'));
    case 'max_pipe_temp':
      return formatTemperatureValue(cableRawValue(row, 'max_pipe_temp'));
    case 'q1':
      return formatUnitValue(cableRawValue(row, 'q1'), 'Вт/(м·°C)', 3);
    case 'q2':
      return formatUnitValue(cableRawValue(row, 'q2'), 'Вт/м', 2);
    case 'conductor_section_mm2':
      return formatUnitValue(
        firstValue(
          cableRawValue(row, 'conductor_section_mm2'),
          cableRawValue(row, 'conductor_cross_section'),
        ),
        'мм²',
        2,
      );
    case 'conductor_cross_section':
      return formatUnitValue(cableRawValue(row, 'conductor_cross_section'), 'мм²', 2);
    case 'diameter_mm':
      return formatUnitValue(cableRawValue(row, 'diameter_mm'), 'мм', 1);
    case 'mass_kg_km':
      return formatUnitValue(cableRawValue(row, 'mass_kg_km'), 'кг/км', 1);
    case 'min_bend_radius_mm':
      return formatUnitValue(cableRawValue(row, 'min_bend_radius_mm'), 'мм', 1);
    case 'max_length':
      return formatUnitValue(cableRawValue(row, 'max_length'), 'м', 0);
    case 'nominal_size_mm':
      return valueText(cableRawValue(row, 'nominal_size_mm'));
    case 'nominal_section_length_m':
      return formatRecordValue(cableRawValue(row, 'nominal_section_length_m'), 'м');
    case 'stock_status':
      return STOCK_STATUS_LABEL[String(cableRawValue(row, 'stock_status') ?? '')]
        ?? valueText(cableRawValue(row, 'stock_status'));
    case 'stock_quantity_m':
      return formatUnitValue(cableRawValue(row, 'stock_quantity_m'), 'м', 1);
    case 'lead_time_days':
      return formatUnitValue(cableRawValue(row, 'lead_time_days'), 'дн.', 0);
    case 'order_multiple_m':
      return formatUnitValue(cableRawValue(row, 'order_multiple_m'), 'м', 1);
    case 'min_order_quantity_m':
      return formatUnitValue(cableRawValue(row, 'min_order_quantity_m'), 'м', 1);
    case 'supplier_priority':
      return valueText(cableRawValue(row, 'supplier_priority'));
    case 'supplier_name':
      return valueText(cableRawValue(row, 'supplier_name'));
    case 'article':
      return valueText(cableRawValue(row, 'article'));
    case 'currency':
      return valueText(cableRawValue(row, 'currency'));
    case 'is_preferred':
      return valueText(cableRawValue(row, 'is_preferred'));
    case 'is_discontinued':
      return valueText(cableRawValue(row, 'is_discontinued'));
    case 'protection':
      return valueText(cableRawValue(row, 'protection'));
    case 'price_per_meter':
      return formatUnitValue(cableRawValue(row, 'price_per_meter'), '₽/м', 2);
    default:
      return formatUnknownCableValue(cableRawValue(row, field));
  }
}

function formatRecordValue(value: unknown, unit?: string) {
  if (!isRecord(value)) return valueText(value);
  const pairs = Object.entries(value)
    .filter(([, entryValue]) => hasValue(entryValue))
    .map(([key, entryValue]) => `${key}: ${valueText(entryValue)}${unit ? ` ${unit}` : ''}`);
  return pairs.length > 0 ? pairs.join(', ') : '—';
}

function formatUnknownCableValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0 ? value.map(valueText).join(', ') : '—';
  if (isRecord(value)) return formatRecordValue(value);
  return valueText(value);
}

function humanizeCableFieldLabel(key: string) {
  if (CABLE_FIELD_LABELS[key]) return CABLE_FIELD_LABELS[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cableFieldOrder(cableType?: string | null) {
  return [
    ...(cableType ? CABLE_FIELD_ORDER_BY_TYPE[cableType] ?? [] : COMMON_CABLE_FIELD_ORDER),
  ];
}

function allCableFieldKeys(row: CablePickerCableRow | null) {
  const keys = new Set<string>();
  if (row) {
    Object.keys(row).forEach((key) => keys.add(key));
    if (isRecord(row.params)) Object.keys(row.params).forEach((key) => keys.add(key));
  }
  return keys;
}

function buildCableFields(row: CablePickerCableRow | null, cableType?: string | null) {
  const orderedKeys = cableFieldOrder(cableType);
  const addedKeys = new Set<string>();
  const items: Array<{ key: string; label: string; value: string }> = [];

  const addField = (key: string, force: boolean) => {
    if (addedKeys.has(key) || SKIPPED_CABLE_FIELD_KEYS.has(key)) return;
    const value = cableValue(row, key, cableType);
    if (!force && value === '—') return;
    addedKeys.add(key);
    items.push({
      key,
      label: CABLE_FIELD_LABELS[key] ?? humanizeCableFieldLabel(key),
      value,
    });
  };

  orderedKeys.forEach((key) => addField(key, true));
  allCableFieldKeys(row).forEach((key) => addField(key, false));
  return items;
}

function splitIntoColumns<T>(items: T[], columnCount: number) {
  const size = Math.ceil(items.length / columnCount);
  return Array.from({ length: columnCount }, (_, index) =>
    items.slice(index * size, index * size + size),
  ).filter((column) => column.length > 0);
}

export default function CablePickerCharacteristics({
  object,
  cable,
  cableType,
  showObject = true,
  showCable = true,
  objectColumnCount = 2,
  cableColumnCount = 2,
}: CablePickerCharacteristicsProps) {
  const objectFields = buildObjectFields(object);
  const cableFields = buildCableFields(cable, cableType);
  const visibleSectionCount = Number(showObject) + Number(showCable);
  const ariaLabel = showObject && showCable
    ? 'Характеристики объекта и кабеля'
    : showObject
      ? 'Характеристики объекта'
      : 'Характеристики кабеля';

  const renderList = (
    title: string,
    items: Array<{ key: string; label: string; value: string }>,
    columnCount: number,
  ) => (
    <section
      className="cable-picker-characteristics-section"
      role="group"
      aria-label={`Характеристики: ${title.toLowerCase()}`}
    >
      <h3 className="cable-picker-characteristics-title">{title}</h3>
      <div
        className="cable-picker-characteristics-columns"
        style={{
          '--cable-picker-characteristics-column-count': columnCount,
        } as CSSProperties}
      >
        {splitIntoColumns(items, columnCount).map((column, index) => (
          <dl key={`${title}-${index}`} className="cable-picker-characteristics-list">
            {column.map((item) => (
              <div key={item.key} className="cable-picker-characteristics-row">
                <dt className="cable-picker-characteristics-label">
                  <span>{item.label}</span>
                  <span aria-hidden="true">:</span>
                </dt>
                <dd className="cable-picker-characteristics-value">{item.value}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    </section>
  );

  return (
    <div
      className={`cable-picker-characteristics${visibleSectionCount === 1 ? ' cable-picker-characteristics--single' : ''}`}
      aria-label={ariaLabel}
    >
      {showObject && renderList('Объект', objectFields, objectColumnCount)}
      {showCable && renderList('Кабель', cableFields, cableColumnCount)}
    </div>
  );
}
