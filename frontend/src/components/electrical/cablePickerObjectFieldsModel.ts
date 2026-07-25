/**
 * Object-side field labels/order/format for CablePickerCharacteristics.
 * Cable fields remain in cablePickerCharacteristicsModel.
 */
import type { ProjectObject } from '@/types/project';
import { formatNumber, formatPower } from '@/utils/formatters';
import type { CablePickerFieldItem } from '@/components/electrical/cablePickerCharacteristicsModel';

const OBJECT_TYPE_LABEL: Record<string, string> = {
  pipe: 'Труба',
  tank: 'Резервуар',
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


function valueText(value: unknown) {
  if (value == null || value === '') return '—';
  return String(value);
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatUnitValue(value: unknown, unit: string, digits = 1) {
  const n = finiteNumber(value);
  return n == null ? '—' : `${formatNumber(n, digits)} ${unit}`;
}

function formatTemperatureValue(value: unknown) {
  return formatUnitValue(value, '°C', 1);
}

function formatMillimetersFromMeters(value: unknown) {
  const n = finiteNumber(value);
  return n == null ? '—' : `${formatNumber(n * 1000, 0)} мм`;
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== null && value !== undefined && value !== '');
}

function powerText(value: unknown) {
  if (value == null || value === '') return '—';
  return formatPower(Number(value));
}

function objectValue(object: ProjectObject, field: string) {
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

export function buildObjectFields(object: ProjectObject): CablePickerFieldItem[] {
  const fields = object.object_type === 'tank'
    ? TANK_OBJECT_FIELD_ORDER
    : PIPE_OBJECT_FIELD_ORDER;
  return fields.map((field) => ({
    key: field,
    label: OBJECT_FIELD_LABELS[field] ?? field,
    value: objectValue(object, field),
  }));
}
