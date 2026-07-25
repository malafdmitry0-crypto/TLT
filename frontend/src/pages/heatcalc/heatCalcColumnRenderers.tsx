import { Tooltip } from 'antd';
import { TltBadge } from '@/components/ui-kit';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  MinusCircleFilled,
} from '@ant-design/icons';

import { OBJECT_TYPE_LABELS } from '@/constants/objectTypes';
import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import type { ProjectObject } from '@/types/project';
import { formatNumber } from '@/utils/formatters';
import { findDN } from '@/utils/objectWizardUtils';
import type { HeatCalcColumnKey } from '@/utils/heatCalcTableColumns';
import {
  booleanChoiceLabel,
  climateBasisLabel,
  countParamValue,
  environmentLabel,
  formatDeltaTemperature,
  formatParamMetersAsMm,
  formatParamNumber,
  formatParamText,
  formatResultNumber,
  formatResultOrParamNumber,
  heatLossCalcStatus,
  heatLossErrorText,
  heatLossStatusLabel,
  insulationLayerConductivity,
  insulationLayerCount,
  insulationLayerMaterial,
  insulationLayerThickness,
  insulationTemperatureBasisLabel,
  lambdaModeLabel,
  mmParam,
  placementLabel,
  sourceText,
  tankDimensions,
  tankShapeLabel,
  zoneLabel,
} from '@/utils/heatCalcPageUtils';

export interface HeatCalcColumnRendererDeps {
  insulationLabel: (material: unknown) => string;
}

function outerDiameterMm(record: ProjectObject) {
  const value = record.object_type === 'pipe'
    ? Number(record.params?.outer_diameter) * 1000
    : Number(record.params?.diameter) * 1000;
  return Number.isFinite(value) ? value : null;
}

function dnValue(record: ProjectObject) {
  if (record.object_type !== 'pipe') return '—';
  const diameter = outerDiameterMm(record);
  if (diameter == null) return '—';
  const dn = findDN(diameter);
  return dn != null ? `DN${dn}` : '—';
}

export function buildHeatCalcColumnRenderers({
  insulationLabel,
}: HeatCalcColumnRendererDeps): Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec> {
  return {
    index: {
      render: (_: unknown, __: ProjectObject, idx: number) => idx + 1,
      copyValue: (_record, idx) => String(idx + 1),
    },
    heat_loss_status: {
      align: 'center',
      render: (_: unknown, r: ProjectObject) => {
        const status = heatLossCalcStatus(r);
        if (status === 'calculated') {
          return (
            <Tooltip title="Рассчитан">
              <TltBadge className="heatloss-status-icon-tag" aria-label="Рассчитан" tone="success">
                <CheckCircleFilled />
              </TltBadge>
            </Tooltip>
          );
        }
        if (status === 'error') {
          return (
            <Tooltip title={heatLossErrorText(r)}>
              <TltBadge className="heatloss-status-icon-tag" aria-label="Ошибка" tone="danger">
                <CloseCircleFilled />
              </TltBadge>
            </Tooltip>
          );
        }
        if (status === 'unsupported') {
          return (
            <Tooltip title={heatLossErrorText(r)}>
              <TltBadge
                className="heatloss-status-icon-tag"
                aria-label="Не применимо"
               tone="neutral">
                <MinusCircleFilled />
              </TltBadge>
            </Tooltip>
          );
        }
        return (
          <Tooltip title="Не рассчитан">
            <TltBadge className="heatloss-status-icon-tag" aria-label="Не рассчитан" tone="neutral">—</TltBadge>
          </Tooltip>
        );
      },
      copyValue: (r) => heatLossStatusLabel(heatLossCalcStatus(r)),
    },
    type: {
      render: (_: unknown, r: ProjectObject) => (r.object_type === 'pipe' ? 'Тр.' : 'Рез.'),
      copyValue: (r) => (r.object_type === 'pipe' ? 'Труба' : 'Резервуар'),
    },
    name: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject, idx: number) =>
        String(r.params?.name ?? `${OBJECT_TYPE_LABELS[r.object_type]} #${idx + 1}`),
      copyValue: (r, idx) => String(r.params?.name ?? `${OBJECT_TYPE_LABELS[r.object_type]} #${idx + 1}`),
    },
    pipe_outer_diameter: {
      render: (_: unknown, r: ProjectObject) => {
        const diameter = outerDiameterMm(r);
        return diameter != null ? formatNumber(diameter, 0) : '—';
      },
      copyValue: (r) => {
        const diameter = outerDiameterMm(r);
        return diameter != null ? formatNumber(diameter, 0) : '—';
      },
    },
    pipe_dn: {
      render: (_: unknown, r: ProjectObject) => dnValue(r),
      copyValue: (r) => dnValue(r),
    },
    pipe_length: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'pipe_length', 1),
      copyValue: (r) => formatParamNumber(r, 'pipe_length', 1),
    },
    pipe_wall_thickness: {
      render: (_: unknown, r: ProjectObject) => formatParamMetersAsMm(r, 'wall_thickness'),
      copyValue: (r) => formatParamMetersAsMm(r, 'wall_thickness'),
    },
    pipe_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'pipe_material'),
      copyValue: (r) => formatParamText(r, 'pipe_material'),
    },
    pipe_lambda: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'pipe_lambda', 3),
      copyValue: (r) => formatParamNumber(r, 'pipe_lambda', 3),
    },
    pipe_lambda_mode: {
      render: (_: unknown, r: ProjectObject) => lambdaModeLabel(r.params?.pipe_lambda_mode),
      copyValue: (r) => lambdaModeLabel(r.params?.pipe_lambda_mode),
    },
    placement: {
      render: (_: unknown, r: ProjectObject) => placementLabel(r.params?.placement ?? r.params?.location),
      copyValue: (r) => placementLabel(r.params?.placement ?? r.params?.location),
    },
    insulation_layer_count: {
      render: (_: unknown, r: ProjectObject) => insulationLayerCount(r),
      copyValue: (r) => insulationLayerCount(r),
    },
    insulation_thickness: {
      render: (_: unknown, r: ProjectObject) => formatParamMetersAsMm(r, 'insulation_thickness'),
      copyValue: (r) => formatParamMetersAsMm(r, 'insulation_thickness'),
    },
    insulation_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => insulationLabel(r.params?.insulation_material),
      copyValue: (r) => insulationLabel(r.params?.insulation_material),
    },
    first_insulation_lambda: {
      render: (_: unknown, r: ProjectObject) => insulationLayerConductivity(r, 0),
      copyValue: (r) => insulationLayerConductivity(r, 0),
    },
    second_insulation_thickness: {
      render: (_: unknown, r: ProjectObject) => insulationLayerThickness(r, 1),
      copyValue: (r) => insulationLayerThickness(r, 1),
    },
    second_insulation_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => insulationLayerMaterial(r, 1, insulationLabel),
      copyValue: (r) => insulationLayerMaterial(r, 1, insulationLabel),
    },
    second_insulation_lambda: {
      render: (_: unknown, r: ProjectObject) => insulationLayerConductivity(r, 1),
      copyValue: (r) => insulationLayerConductivity(r, 1),
    },
    third_insulation_thickness: {
      render: (_: unknown, r: ProjectObject) => insulationLayerThickness(r, 2),
      copyValue: (r) => insulationLayerThickness(r, 2),
    },
    third_insulation_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => insulationLayerMaterial(r, 2, insulationLabel),
      copyValue: (r) => insulationLayerMaterial(r, 2, insulationLabel),
    },
    third_insulation_lambda: {
      render: (_: unknown, r: ProjectObject) => insulationLayerConductivity(r, 2),
      copyValue: (r) => insulationLayerConductivity(r, 2),
    },
    insulation_cover_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'insulation_cover_material'),
      copyValue: (r) => formatParamText(r, 'insulation_cover_material'),
    },
    process_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'process_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'process_temperature', 0),
    },
    ambient_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'ambient_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'ambient_temperature', 0),
    },
    ambient_temperature_source: {
      render: (_: unknown, r: ProjectObject) => sourceText(r.params?.ambient_temperature_source),
      copyValue: (r) => sourceText(r.params?.ambient_temperature_source),
    },
    max_ambient_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'max_ambient_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'max_ambient_temperature', 0),
    },
    max_process_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'max_process_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'max_process_temperature', 0),
    },
    wind_speed: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'wind_speed', 1),
      copyValue: (r) => formatParamNumber(r, 'wind_speed', 1),
    },
    wind_speed_source: {
      render: (_: unknown, r: ProjectObject) => sourceText(r.params?.wind_speed_source),
      copyValue: (r) => sourceText(r.params?.wind_speed_source),
    },
    alpha_vnesh: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'alpha_vnesh', 1),
      copyValue: (r) => formatParamNumber(r, 'alpha_vnesh', 1),
    },
    environment: {
      render: (_: unknown, r: ProjectObject) => environmentLabel(r.params?.environment),
      copyValue: (r) => environmentLabel(r.params?.environment),
    },
    zone_classification: {
      render: (_: unknown, r: ProjectObject) => zoneLabel(r.params?.zone_classification),
      copyValue: (r) => zoneLabel(r.params?.zone_classification),
    },
    temperature_group: {
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'temperature_group'),
      copyValue: (r) => formatParamText(r, 'temperature_group'),
    },
    climate_city: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'climate_city'),
      copyValue: (r) => formatParamText(r, 'climate_city'),
    },
    climate_region: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'climate_region'),
      copyValue: (r) => formatParamText(r, 'climate_region'),
    },
    climate_key: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'climate_key'),
      copyValue: (r) => formatParamText(r, 'climate_key'),
    },
    climate_temperature_basis: {
      render: (_: unknown, r: ProjectObject) => climateBasisLabel(r.params?.climate_temperature_basis),
      copyValue: (r) => climateBasisLabel(r.params?.climate_temperature_basis),
    },
    insulation_temperature_basis: {
      render: (_: unknown, r: ProjectObject) => insulationTemperatureBasisLabel(r.params?.insulation_temperature_basis),
      copyValue: (r) => insulationTemperatureBasisLabel(r.params?.insulation_temperature_basis),
    },
    burial_depth: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'burial_depth', 2),
      copyValue: (r) => formatParamNumber(r, 'burial_depth', 2),
    },
    ground_type: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => formatParamText(r, 'ground_type'),
      copyValue: (r) => formatParamText(r, 'ground_type'),
    },
    ground_conductivity: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'ground_conductivity', 2),
      copyValue: (r) => formatParamNumber(r, 'ground_conductivity', 2),
    },
    min_switch_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'min_switch_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'min_switch_temperature', 0),
    },
    supply_voltage: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'supply_voltage', 0),
      copyValue: (r) => formatParamNumber(r, 'supply_voltage', 0),
    },
    safety_factor: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'safety_factor', 2),
      copyValue: (r) => formatParamNumber(r, 'safety_factor', 2),
    },
    steam_tracing: {
      render: (_: unknown, r: ProjectObject) => booleanChoiceLabel(r.params?.steam_tracing),
      copyValue: (r) => booleanChoiceLabel(r.params?.steam_tracing),
    },
    vapor_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'vapor_temperature', 0),
      copyValue: (r) => formatParamNumber(r, 'vapor_temperature', 0),
    },
    valve_count: {
      render: (_: unknown, r: ProjectObject) => countParamValue(r, 'valve_count'),
      copyValue: (r) => countParamValue(r, 'valve_count'),
    },
    flange_count: {
      render: (_: unknown, r: ProjectObject) => countParamValue(r, 'flange_count'),
      copyValue: (r) => countParamValue(r, 'flange_count'),
    },
    support_count: {
      render: (_: unknown, r: ProjectObject) => countParamValue(r, 'support_count'),
      copyValue: (r) => countParamValue(r, 'support_count'),
    },
    local_element_equiv_length: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'local_element_equiv_length', 1),
      copyValue: (r) => formatParamNumber(r, 'local_element_equiv_length', 1),
    },
    tank_shape: {
      render: (_: unknown, r: ProjectObject) => tankShapeLabel(r.params?.shape),
      copyValue: (r) => tankShapeLabel(r.params?.shape),
    },
    tank_dimensions: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => tankDimensions(r),
      copyValue: (r) => tankDimensions(r),
    },
    tank_diameter: {
      render: (_: unknown, r: ProjectObject) => mmParam(r, 'diameter'),
      copyValue: (r) => mmParam(r, 'diameter'),
    },
    tank_height: {
      render: (_: unknown, r: ProjectObject) => mmParam(r, 'height'),
      copyValue: (r) => mmParam(r, 'height'),
    },
    tank_length: {
      render: (_: unknown, r: ProjectObject) => mmParam(r, 'length'),
      copyValue: (r) => mmParam(r, 'length'),
    },
    tank_width: {
      render: (_: unknown, r: ProjectObject) => mmParam(r, 'width'),
      copyValue: (r) => mmParam(r, 'width'),
    },
    tank_wall_thickness: {
      render: (_: unknown, r: ProjectObject) => formatParamMetersAsMm(r, 'wall_thickness'),
      copyValue: (r) => formatParamMetersAsMm(r, 'wall_thickness'),
    },
    tank_wall_lambda: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'wall_lambda', 3),
      copyValue: (r) => formatParamNumber(r, 'wall_lambda', 3),
    },
    q_additional: {
      render: (_: unknown, r: ProjectObject) => formatResultOrParamNumber(r, 'q_additional', 0),
      copyValue: (r) => formatResultOrParamNumber(r, 'q_additional', 0),
    },
    heat_loss_per_meter: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'heat_loss_per_meter', 1),
      copyValue: (r) => formatResultNumber(r, 'heat_loss_per_meter', 1),
    },
    heat_loss_per_m2: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'heat_loss_per_m2', 1),
      copyValue: (r) => formatResultNumber(r, 'heat_loss_per_m2', 1),
    },
    total_heat_loss: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'total_heat_loss', 0),
      copyValue: (r) => formatResultNumber(r, 'total_heat_loss', 0),
    },
    delta_t: {
      render: (_: unknown, r: ProjectObject) => formatDeltaTemperature(r, 0),
      copyValue: (r) => formatDeltaTemperature(r, 0),
    },
    applied_alpha_vnesh: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'alpha_vnesh', 1),
      copyValue: (r) => formatResultNumber(r, 'alpha_vnesh', 1),
    },
    applied_safety_factor: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'safety_factor', 2),
      copyValue: (r) => formatResultNumber(r, 'safety_factor', 2),
    },
    thermal_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'thermal_resistance', 4),
      copyValue: (r) => formatResultNumber(r, 'thermal_resistance', 4),
    },
    wall_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'wall_resistance', 4),
      copyValue: (r) => formatResultNumber(r, 'wall_resistance', 4),
    },
    insulation_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'insulation_resistance', 4),
      copyValue: (r) => formatResultNumber(r, 'insulation_resistance', 4),
    },
    external_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'external_resistance', 4),
      copyValue: (r) => formatResultNumber(r, 'external_resistance', 4),
    },
    ground_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'ground_resistance', 4),
      copyValue: (r) => formatResultNumber(r, 'ground_resistance', 4),
    },
    effective_length: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'effective_length', 1),
      copyValue: (r) => formatResultNumber(r, 'effective_length', 1),
    },
    surface_area: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'surface_area', 1),
      copyValue: (r) => formatResultNumber(r, 'surface_area', 1),
    },
    air_surface_area: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'air_surface_area', 1),
      copyValue: (r) => formatResultNumber(r, 'air_surface_area', 1),
    },
    ground_surface_area: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'ground_surface_area', 1),
      copyValue: (r) => formatResultNumber(r, 'ground_surface_area', 1),
    },
  };
}
