/**
 * Result / thermal metric column renderers for heatCalc table (P-BAND-10).
 */
import type { HeatCalcTableColumnRenderSpec } from '@/hooks/useHeatCalcTableColumns';
import type { ProjectObject } from '@/types/project';
import type { HeatCalcColumnKey } from '@/utils/heatCalcTableColumns';
import {
  formatDeltaTemperature,
  formatParamNumber,
  formatResultNumber,
} from '@/utils/heatCalcPageUtils';

function resistanceResultKey(
  record: ProjectObject,
  pipeKey: string,
  tankArealKey: string,
) {
  return record.object_type === 'pipe' ? pipeKey : tankArealKey;
}

function formatQAdditional(record: ProjectObject) {
  return record.results
    ? formatResultNumber(record, 'q_additional_applied', 0)
    : formatParamNumber(record, 'q_additional', 0);
}

export function buildHeatCalcResultMetricColumnRenderers(): Partial<
  Record<HeatCalcColumnKey, HeatCalcTableColumnRenderSpec>
> {
  return {
    q_additional: {
      render: (_: unknown, r: ProjectObject) => formatQAdditional(r),
      copyValue: (r) => formatQAdditional(r),
    },
    heat_loss_per_meter_base: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'heat_loss_per_meter_base', 1),
      copyValue: (r) => formatResultNumber(r, 'heat_loss_per_meter_base', 1),
    },
    heat_loss_per_m2_bare_base: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'heat_loss_per_m2_bare_base', 1),
      copyValue: (r) => formatResultNumber(r, 'heat_loss_per_m2_bare_base', 1),
    },
    total_heat_loss_design: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'total_heat_loss_design', 0),
      copyValue: (r) => formatResultNumber(r, 'total_heat_loss_design', 0),
    },
    delta_t: {
      render: (_: unknown, r: ProjectObject) => formatDeltaTemperature(r, 0),
      copyValue: (r) => formatDeltaTemperature(r, 0),
    },
    applied_alpha_vnesh: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'alpha_vnesh_applied', 1),
      copyValue: (r) => formatResultNumber(r, 'alpha_vnesh_applied', 1),
    },
    applied_safety_factor: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'safety_factor_applied', 2),
      copyValue: (r) => formatResultNumber(r, 'safety_factor_applied', 2),
    },
    thermal_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(
        r,
        resistanceResultKey(r, 'thermal_resistance', 'thermal_resistance_areal_bare'),
        4,
      ),
      copyValue: (r) => formatResultNumber(
        r,
        resistanceResultKey(r, 'thermal_resistance', 'thermal_resistance_areal_bare'),
        4,
      ),
    },
    wall_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(
        r,
        resistanceResultKey(r, 'wall_resistance', 'wall_resistance_areal_bare'),
        4,
      ),
      copyValue: (r) => formatResultNumber(
        r,
        resistanceResultKey(r, 'wall_resistance', 'wall_resistance_areal_bare'),
        4,
      ),
    },
    insulation_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(
        r,
        resistanceResultKey(r, 'insulation_resistance', 'insulation_resistance_areal_bare'),
        4,
      ),
      copyValue: (r) => formatResultNumber(
        r,
        resistanceResultKey(r, 'insulation_resistance', 'insulation_resistance_areal_bare'),
        4,
      ),
    },
    external_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(
        r,
        resistanceResultKey(r, 'external_resistance', 'external_resistance_areal_bare'),
        4,
      ),
      copyValue: (r) => formatResultNumber(
        r,
        resistanceResultKey(r, 'external_resistance', 'external_resistance_areal_bare'),
        4,
      ),
    },
    ground_resistance: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'ground_resistance_areal_bare', 4),
      copyValue: (r) => formatResultNumber(r, 'ground_resistance_areal_bare', 4),
    },
    effective_length: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'effective_length', 1),
      copyValue: (r) => formatResultNumber(r, 'effective_length', 1),
    },
    surface_area_bare: {
      render: (_: unknown, r: ProjectObject) => formatResultNumber(r, 'surface_area_bare', 1),
      copyValue: (r) => formatResultNumber(r, 'surface_area_bare', 1),
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
