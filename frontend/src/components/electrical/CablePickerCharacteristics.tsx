import type { ProjectObject } from '@/types/project';
import type {
  ElectricalCablePickerCableFieldKey,
  ElectricalCablePickerObjectFieldKey,
  ElectricalTableViewSettings,
} from '@/utils/electricalTableViewSettings';
import {
  ELECTRICAL_CABLE_PICKER_CABLE_FIELD_OPTIONS,
  ELECTRICAL_CABLE_PICKER_OBJECT_FIELD_OPTIONS,
} from '@/utils/electricalTableViewSettings';
import type { CableCatalogRow } from '@/utils/cableCatalogSourceLabels';
import { formatNumber, formatPower } from '@/utils/formatters';

type CablePickerCableRow = CableCatalogRow & {
  price_per_meter?: number | null;
  stock_status?: string | null;
};

type CablePickerOption = {
  mark?: string | null;
  optionSource?: string | null;
};

interface CablePickerCharacteristicsProps {
  object: ProjectObject;
  cable: CablePickerCableRow | null;
  option?: CablePickerOption;
  settings: ElectricalTableViewSettings;
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

const CABLE_PICKER_OBJECT_FIELD_LABELS = new Map(
  ELECTRICAL_CABLE_PICKER_OBJECT_FIELD_OPTIONS.map((option) => [option.key, option.label]),
);

const CABLE_PICKER_CABLE_FIELD_LABELS = new Map(
  ELECTRICAL_CABLE_PICKER_CABLE_FIELD_OPTIONS.map((option) => [option.key, option.label]),
);

const PLACEMENT_LABEL: Record<string, string> = {
  indoor: 'В помещении',
  outdoor: 'Открыто',
  underground: 'Подземно',
};

const CABLE_SOURCE_LABEL: Record<string, string> = {
  builtin: 'Встроенная',
  commercial: 'Коммерческая',
  extended: 'Внешняя',
  all: 'Все',
  project: 'Проект',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
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
  field: ElectricalCablePickerObjectFieldKey,
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

function cableRawValue(row: CablePickerCableRow | null, key: string) {
  if (!row) return undefined;
  const direct = (row as Record<string, unknown>)[key];
  if (direct !== null && direct !== undefined && direct !== '') return direct;
  return isRecord(row.params) ? row.params[key] : undefined;
}

function cableValue(
  row: CablePickerCableRow | null,
  option: CablePickerOption | undefined,
  field: ElectricalCablePickerCableFieldKey,
) {
  switch (field) {
    case 'source':
      if (!row && !option?.mark) return '—';
      if (option?.optionSource === 'project') return CABLE_SOURCE_LABEL.project;
      return CABLE_SOURCE_LABEL[String(row?.source ?? option?.optionSource ?? '')] ?? valueText(row?.source);
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
    case 'voltage':
      return formatUnitValue(cableRawValue(row, 'voltage'), 'В', 0);
    case 'temperature_range': {
      const min = formatTemperatureValue(cableRawValue(row, 'min_temperature'));
      const max = formatTemperatureValue(cableRawValue(row, 'max_temperature'));
      return min === '—' && max === '—' ? '—' : `${min}…${max}`;
    }
    case 'max_product_temp':
      return formatTemperatureValue(cableRawValue(row, 'max_product_temp'));
    case 'max_vapor_temp':
      return formatTemperatureValue(cableRawValue(row, 'max_vapor_temp'));
    case 'conductor_section_mm2':
      return formatUnitValue(
        firstValue(
          cableRawValue(row, 'conductor_section_mm2'),
          cableRawValue(row, 'conductor_cross_section'),
        ),
        'мм²',
        2,
      );
    case 'diameter_mm':
      return formatUnitValue(cableRawValue(row, 'diameter_mm'), 'мм', 1);
    case 'nominal_size_mm':
      return valueText(cableRawValue(row, 'nominal_size_mm'));
    case 'stock_status':
      return STOCK_STATUS_LABEL[String(cableRawValue(row, 'stock_status') ?? '')]
        ?? valueText(cableRawValue(row, 'stock_status'));
    case 'price_per_meter':
      return formatUnitValue(cableRawValue(row, 'price_per_meter'), '₽/м', 2);
    default:
      return '—';
  }
}

export default function CablePickerCharacteristics({
  object,
  cable,
  option,
  settings,
}: CablePickerCharacteristicsProps) {
  return (
    <div className="cable-picker-characteristics">
      <table aria-label="Характеристики объекта и кабеля">
        <tbody>
          <tr>
            <th scope="row">Объект</th>
            {settings.cablePickerObjectFields.map((field) => (
              <td key={field}>
                <span className="cable-picker-characteristics-label">
                  {CABLE_PICKER_OBJECT_FIELD_LABELS.get(field) ?? field}
                </span>
                <span className="cable-picker-characteristics-value">
                  {objectValue(object, field)}
                </span>
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">Кабель</th>
            {settings.cablePickerCableFields.map((field) => (
              <td key={field}>
                <span className="cable-picker-characteristics-label">
                  {CABLE_PICKER_CABLE_FIELD_LABELS.get(field) ?? field}
                </span>
                <span className="cable-picker-characteristics-value">
                  {cableValue(cable, option, field)}
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
