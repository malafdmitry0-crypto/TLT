import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import type { ProjectObject } from '@/types/project';
import { formatNumber } from '@/utils/formatters';
import type { HeatCalcColumnKey } from '@/utils/heatCalcTableColumns';
import {
  booleanChoiceLabel,
  climateBasisLabel,
  countParamValue,
  environmentLabel,
  formatParamMetersAsMm,
  formatParamNumber,
  formatParamText,
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

import { buildHeatCalcResultMetricColumnRenderers } from '@/pages/heatcalc/heatCalcResultMetricColumnRenderers';
import { buildHeatCalcStatusColumnRenderers } from '@/pages/heatcalc/heatCalcStatusColumnRenderers';

export interface HeatCalcColumnRendererDeps {
  insulationLabel: (material: unknown) => string;
}

function outerDiameterMm(record: ProjectObject) {
  const value = record.object_type === 'pipe'
    ? Number(record.params?.outer_diameter) * 1000
    : Number(record.params?.diameter) * 1000;
  return Number.isFinite(value) ? value : null;
}

function formatAmbientMaximum(record: ProjectObject) {
  if (record.object_type === 'pipe' && record.params?.placement === 'underground') return '—';
  return formatParamNumber(record, 'max_ambient_temperature', 1);
}

export function buildHeatCalcColumnRenderers({
  insulationLabel,
}: HeatCalcColumnRendererDeps): Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec> {
  return {
    ...buildHeatCalcStatusColumnRenderers(),
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
      render: (_: unknown, r: ProjectObject) => lambdaModeLabel(r.params?.pipe_lambda != null ? 'manual' : 'reference'),
      copyValue: (r) => lambdaModeLabel(r.params?.pipe_lambda != null ? 'manual' : 'reference'),
    },
    placement: {
      render: (_: unknown, r: ProjectObject) => placementLabel(r.params?.placement),
      copyValue: (r) => placementLabel(r.params?.placement),
    },
    insulation_layer_count: {
      render: (_: unknown, r: ProjectObject) => insulationLayerCount(r),
      copyValue: (r) => insulationLayerCount(r),
    },
    insulation_thickness: {
      render: (_: unknown, r: ProjectObject) => insulationLayerThickness(r, 0),
      copyValue: (r) => insulationLayerThickness(r, 0),
    },
    insulation_material: {
      ellipsis: true,
      render: (_: unknown, r: ProjectObject) => insulationLayerMaterial(r, 0, insulationLabel),
      copyValue: (r) => insulationLayerMaterial(r, 0, insulationLabel),
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
    max_ambient_temperature: {
      render: (_: unknown, r: ProjectObject) => formatAmbientMaximum(r),
      copyValue: (r) => formatAmbientMaximum(r),
    },
    ambient_temperature_source: {
      render: (_: unknown, r: ProjectObject) => sourceText(r.params?.ambient_temperature_source),
      copyValue: (r) => sourceText(r.params?.ambient_temperature_source),
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
    tank_buried_height: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'tank_buried_height', 2),
      copyValue: (r) => formatParamNumber(r, 'tank_buried_height', 2),
    },
    pipe_centerline_depth: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'pipe_centerline_depth', 2),
      copyValue: (r) => formatParamNumber(r, 'pipe_centerline_depth', 2),
    },
    ground_temperature: {
      render: (_: unknown, r: ProjectObject) => formatParamNumber(r, 'ground_temperature', 1),
      copyValue: (r) => formatParamNumber(r, 'ground_temperature', 1),
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
    num_local_elements: {
      render: (_: unknown, r: ProjectObject) => countParamValue(r, 'num_local_elements'),
      copyValue: (r) => countParamValue(r, 'num_local_elements'),
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
    ...buildHeatCalcResultMetricColumnRenderers(),
  } as Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>;
}
