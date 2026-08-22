import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import type { ElectricalColumnKey } from '@/utils/electricalTableColumns';
import { formatNumber } from '@/utils/formatters';
import { isRecord } from '@/utils/typeGuards';
import {
  electricalCalcError,
  isElectricalCalcStale,
  isElectricalCalcSuccess,
  isElectricalCalcUnsupported,
} from '@/utils/calcStatus';
import {
  cablePowerPerMeterValue,
  compactProvenanceValue,
  commercialValue,
  currentElectricalCalc,
  engineeringResultValue,
  getCableMark,
  getThreadSource,
  installedPowerPerMeterValue,
  orderCableLengthValue,
  selectionPolicyText,
  threadSourceTag,
  valueText,
} from '@/domain/electrical/elecCalcResultValueModel';

export type CableTypeKey =
  | 'self_regulating'
  | 'self_regulating_tt'
  | 'single_core'
  | 'three_core';

export const CABLE_TYPE_LABEL: Record<CableTypeKey, string> = {
  self_regulating: 'Саморегулирующийся',
  self_regulating_tt: 'ТТН/ТТВ/ТТХ',
  single_core: 'Однож. пост. мощн.',
  three_core: 'Трёхж. пост. мощн.',
};

export const OBJECT_TYPE_LABEL: Record<string, string> = {
  pipe: 'Труба',
  tank: 'Резервуар',
};

export const CONNECTION_TYPE_LABEL: Record<string, string> = {
  line_1ph: 'Линия',
  loop_1ph: 'Петля',
  star_3ph: 'Звезда',
  loop_2x3: 'Петля 2×3',
  loop_1x3: 'Петля 1×3',
  star_3x3: 'Звезда 3×3',
  star_1x3: 'Звезда 1×3',
};

export const STOCK_STATUS_LABEL: Record<string, string> = {
  in_stock: 'В наличии',
  limited: 'Ограничено',
  on_order: 'Под заказ',
  unknown: 'Неизвестно',
};

export type CableSnapshotStatusTag = {
  color: 'orange' | 'red' | 'gold' | 'default';
  label: string;
  tooltip: string;
};

export type MainElectricalColumnCopyContext = {
  calcByObjectId: Record<string, ElectricalCalcSummary | undefined>;
  electricalDisplayOffset: number;
  getCableTypeForObject: (objectId: string) => string | null | undefined;
  connectionType: unknown;
  supplyVoltage: unknown;
  windingCoefficient: unknown;
};

export type ElectricalDiagnosticValues = {
  outerDiameterMm: number | null;
  ambientTemperatureC: number | null;
  coldStartTemperatureC: number | null;
  climateCity: string | null;
  climateTemperatureBasis: string | null;
  climatePolicyRule: string | null;
};

function diagnosticNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function diagnosticText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function electricalDiagnosticContext(calc: ElectricalCalcSummary | undefined) {
  if (!calc || isElectricalCalcStale(calc) || !isRecord(calc.results)) return null;
  if (isRecord(calc.results.error_context)) return calc.results.error_context;
  if (isRecord(calc.results.resolved_inputs)) return calc.results.resolved_inputs;
  return null;
}

function objectAmbientTemperatureC(obj: ProjectObject) {
  const ambient = diagnosticNumber(obj.params?.ambient_temperature);
  const ground = diagnosticNumber(obj.params?.ground_temperature);
  if (obj.params?.placement !== 'underground') return ambient ?? ground;
  if (obj.object_type === 'tank') {
    const available = [ambient, ground].filter((value): value is number => value != null);
    return available.length > 0 ? Math.min(...available) : null;
  }
  return ground ?? ambient;
}

function objectOuterDiameterMm(obj: ProjectObject) {
  if (obj.object_type !== 'pipe') return null;
  const diameterM = diagnosticNumber(obj.params?.outer_diameter);
  return diameterM == null ? null : diameterM * 1000;
}

export function electricalDiagnosticValues(
  obj: ProjectObject,
  calc?: ElectricalCalcSummary,
): ElectricalDiagnosticValues {
  const exact = electricalDiagnosticContext(calc);
  return {
    outerDiameterMm:
      diagnosticNumber(exact?.outer_diameter_mm) ?? objectOuterDiameterMm(obj),
    ambientTemperatureC:
      diagnosticNumber(exact?.ambient_temperature_c) ?? objectAmbientTemperatureC(obj),
    coldStartTemperatureC:
      diagnosticNumber(exact?.cold_start_temperature_c)
      ?? diagnosticNumber(obj.params?.min_switch_temperature),
    climateCity:
      diagnosticText(exact?.climate_city) ?? diagnosticText(obj.params?.climate_city),
    climateTemperatureBasis:
      diagnosticText(exact?.climate_temperature_basis)
      ?? diagnosticText(obj.params?.climate_temperature_basis),
    climatePolicyRule:
      diagnosticText(exact?.climate_policy_rule) ?? diagnosticText(obj.params?.climate_policy_rule),
  };
}

export function electricalClimateDiagnosticLabel(
  values: Pick<ElectricalDiagnosticValues, 'climateCity' | 'climateTemperatureBasis'>,
) {
  return [values.climateCity, values.climateTemperatureBasis].filter(Boolean).join(' · ') || '—';
}

export function electricalDiagnosticNumberLabel(value: number) {
  return formatNumber(value, Number.isInteger(value) ? 0 : 1);
}

export function electricalErrorDiagnosticLabels(context: Record<string, unknown> | null) {
  if (!context) return [];
  const diameter = diagnosticNumber(context.outer_diameter_mm);
  const ambient = diagnosticNumber(context.ambient_temperature_c);
  const coldStart = diagnosticNumber(context.cold_start_temperature_c);
  const climate = electricalClimateDiagnosticLabel({
    climateCity: diagnosticText(context.climate_city),
    climateTemperatureBasis: diagnosticText(context.climate_temperature_basis),
  });
  return [
    diameter == null ? null : `D ${electricalDiagnosticNumberLabel(diameter)} мм`,
    ambient == null ? null : `T среды ${electricalDiagnosticNumberLabel(ambient)} °C`,
    coldStart == null ? null : `Tвкл ${electricalDiagnosticNumberLabel(coldStart)} °C`,
    climate === '—' ? null : climate,
  ].filter((label): label is string => label != null);
}

export function objectDisplayName(obj: ProjectObject) {
  const named = obj.params?.name;
  if (typeof named === 'string' && named.trim()) return named.trim();

  const params = (obj.params ?? {}) as Record<string, unknown>;
  const objectType = obj.object_type === 'tank' ? 'Ёмкость' : 'Трубопровод';
  const diameterM = Number(params.outer_diameter ?? params.diameter);
  if (Number.isFinite(diameterM) && diameterM > 0) {
    const mm = diameterM >= 10 ? diameterM : diameterM * 1000;
    return `${objectType} Ø${Math.round(mm)} мм`;
  }
  // Last resort: short id, not full UUID noise in tables.
  const shortId = String(obj.id).slice(0, 8);
  return `${objectType} ${shortId}`;
}

export function cableSnapshotStatusTag(calc: ElectricalCalcSummary | undefined): CableSnapshotStatusTag | null {
  if (!calc) return null;
  const status = calc.cable_snapshot_status;
  if (!status) return null;
  const technicalStatus = status.technical_status;
  const commercialStatus = status.commercial_status;
  if (technicalStatus === 'missing' || commercialStatus === 'missing') {
    return {
      color: 'orange',
      label: 'нет в базе',
      tooltip: status.message || 'Кабель сохранён в проекте, но отсутствует в текущей базе.',
    };
  }
  if (technicalStatus === 'changed') {
    const fields = Array.isArray(status.changed_fields) ? status.changed_fields.join(', ') : '';
    return {
      color: 'red',
      label: 'техн. изм.',
      tooltip: `${status.message || 'Технические параметры кабеля изменились.'}${fields ? ` Поля: ${fields}` : ''}`,
    };
  }
  if (commercialStatus === 'changed') {
    const fields = Array.isArray(status.changed_fields) ? status.changed_fields.join(', ') : '';
    return {
      color: 'gold',
      label: 'комм. изм.',
      tooltip: `${status.message || 'Коммерческие данные кабеля изменились.'}${fields ? ` Поля: ${fields}` : ''}`,
    };
  }
  if (technicalStatus === 'unknown' || commercialStatus === 'unknown') {
    return {
      color: 'default',
      label: 'стар.',
      tooltip: status.message || 'Расчёт создан без сохранённого снимка кабеля.',
    };
  }
  return null;
}

export function mainElectricalColumnCopyValue(
  key: ElectricalColumnKey,
  obj: ProjectObject,
  index: number,
  context: MainElectricalColumnCopyContext,
) {
  const calc = context.calcByObjectId[obj.id];
  const currentCalc = currentElectricalCalc(calc);
  const diagnostics = electricalDiagnosticValues(obj, calc);
  switch (key) {
    case 'index':
      return context.electricalDisplayOffset + index + 1;
    case 'object_name':
      return objectDisplayName(obj);
    case 'object_type':
      return OBJECT_TYPE_LABEL[obj.object_type] ?? obj.object_type;
    case 'heat_loss_status':
      return obj.is_valid
        ? 'Рассчитан'
        : obj.validation_errors?.category === 'unsupported'
          ? 'Не применимо'
          : obj.validation_errors
            ? 'Ошибка'
            : 'Не рассчитан';
    case 'electrical_status':
      return isElectricalCalcSuccess(calc)
        ? 'Рассчитан'
        : isElectricalCalcUnsupported(calc)
          ? 'Не применимо'
          : isElectricalCalcStale(calc)
            ? 'Требуется пересчёт'
            : electricalCalcError(calc)
              ? 'Ошибка'
              : 'Не рассчитан';
    case 'pipe_outer_diameter':
      return valueText(diagnostics.outerDiameterMm);
    case 'ambient_temperature':
      return valueText(diagnostics.ambientTemperatureC);
    case 'min_switch_temperature':
      return valueText(diagnostics.coldStartTemperatureC);
    case 'climate_temperature_basis':
      return electricalClimateDiagnosticLabel(diagnostics);
    case 'cable_type':
      {
        const type = context.getCableTypeForObject(obj.id);
        return type ? CABLE_TYPE_LABEL[type as CableTypeKey] ?? type : '—';
      }
    case 'cable_mark':
      return getCableMark(currentCalc) ?? '—';
    case 'cable_snapshot_status':
      return cableSnapshotStatusTag(currentCalc)?.label ?? '—';
    case 'selection_policy':
      return selectionPolicyText(currentCalc?.results?.selection_policy);
    case 'applied_selection_policy':
      return selectionPolicyText(currentCalc?.results?.applied_selection_policy);
    case 'selection_reason':
      return valueText(currentCalc?.results?.selection_reason);
    case 'winding_pitch_mm':
      return valueText(currentCalc?.results?.winding_pitch);
    case 'number_of_threads':
      {
        const source = threadSourceTag(getThreadSource(currentCalc));
        const value = valueText(currentCalc?.results?.num_circuits);
        return source ? `${value} (${source.label})` : value;
      }
    case 'laying_step':
      return valueText(calc?.params?.laying_step);
    case 'heating_height':
      return valueText(calc?.params?.heating_height);
    case 'connection_type':
      {
        const value = calc?.params?.connection_type ?? context.connectionType;
        return CONNECTION_TYPE_LABEL[String(value)] ?? valueText(value);
      }
    case 'supply_voltage':
      return valueText(calc?.params?.supply_voltage ?? context.supplyVoltage);
    case 'winding_coefficient':
      return valueText(calc?.params?.winding_coefficient ?? context.windingCoefficient);
    case 'order_cable_length':
      return valueText(orderCableLengthValue(currentCalc));
    case 'installed_cable_length':
    case 'required_installed_length_m':
    case 'section_l_max_m':
    case 'section_l_tok_m':
    case 'section_l_ogr_m':
    case 'section_l_excess_m':
    case 'total_power':
    case 'current':
    case 'voltage':
      return valueText(key === 'total_power' || key === 'current' || key === 'voltage'
        ? currentCalc?.results?.[key]
        : engineeringResultValue(currentCalc, key));
    case 'provenance':
      return compactProvenanceValue(currentCalc);
    case 'power_per_meter':
      return valueText(cablePowerPerMeterValue(currentCalc));
    case 'installed_power_per_meter':
      return valueText(installedPowerPerMeterValue(currentCalc));
    case 'price_per_meter':
    case 'required_order_length':
    case 'total_cost':
    case 'lead_time_days':
      return valueText(commercialValue(currentCalc, key));
    case 'stock_status':
      {
        const value = commercialValue(currentCalc, key);
        return typeof value === 'string' ? STOCK_STATUS_LABEL[value] ?? value : '—';
      }
    case 'heat_loss_per_meter_base':
    case 'heat_loss_per_m2_bare_base':
    case 'total_heat_loss_design':
      return valueText(obj.results?.[key]);
    default:
      return '';
  }
}
