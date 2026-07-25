/**
 * Result / thermal metric column renderers for heatCalc table (P-BAND-10).
 */
import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import type { ProjectObject } from '@/types/project';
import type { HeatCalcColumnKey } from '@/utils/heatCalcTableColumns';
import {
  formatDeltaTemperature,
  formatResultNumber,
  formatResultOrParamNumber,
} from '@/utils/heatCalcPageUtils';

export function buildHeatCalcResultMetricColumnRenderers(): Partial<
  Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>
> {
  return {
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
