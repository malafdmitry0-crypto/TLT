import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HeatCalcAssumptionsPanel from '@/pages/heatcalc/HeatCalcAssumptionsPanel';
import type { ProjectObject } from '@/types/project';
import {
  HEATCALC_CALCULATION_DETAILS_VERSION,
  type HeatCalcCalculationDetailsSettings,
} from '@/utils/heatCalcCalculationDetailsSettings';

const detailedSettings: HeatCalcCalculationDetailsSettings = {
  version: HEATCALC_CALCULATION_DETAILS_VERSION,
  preset: 'detailed',
  visibleMetrics: [
    'delta_t',
    'applied_alpha_vnesh',
    'applied_safety_factor',
    'insulation_resistance',
    'external_resistance',
    'ground_resistance',
    'effective_length',
    'surface_area_bare',
    'wall_resistance',
    'thermal_resistance',
    'wind_speed',
    'temperature_source',
    'wind_speed_source',
    'air_surface_area',
    'ground_surface_area',
    'ground_conductivity',
  ],
};

function makeObject(overrides: Partial<ProjectObject> = {}): ProjectObject {
  return {
    id: 'pipe-1',
    project_id: 'project-1',
    object_type: 'pipe',
    sort_order: 0,
    params: {
      name: 'Труба DN100',
      process_temperature: 60,
      ambient_temperature: -20,
    },
    results: {
      alpha_vnesh_applied: 24.1,
      safety_factor_applied: 1.2,
      insulation_resistance: 1.5447,
      external_resistance: 0.0389,
      effective_length: 64,
      wall_resistance: 0.0023,
      thermal_resistance: 1.5859,
    },
    is_valid: true,
    validation_errors: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    version: 1,
    ...overrides,
  };
}

describe('HeatCalcAssumptionsPanel', () => {
  it('does not render without selected object or calculation results', () => {
    const { container, rerender } = render(
      <HeatCalcAssumptionsPanel
        selectedObject={null}
        calculationDetailsSettings={detailedSettings}
      />,
    );

    expect(container).toBeEmptyDOMElement();

    rerender(
      <HeatCalcAssumptionsPanel
        selectedObject={makeObject({ results: null })}
        calculationDetailsSettings={detailedSettings}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders pipe calculation details without the obsolete average-temperature label', () => {
    render(
      <HeatCalcAssumptionsPanel
        selectedObject={makeObject({
          params: {
            ...makeObject().params,
            ambient_temperature_source: 'climate',
          },
        })}
        calculationDetailsSettings={detailedSettings}
      />,
    );

    expect(screen.getByText('Расшифровка расчёта:')).toBeInTheDocument();
    expect(screen.getByText('ΔT: 80°C')).toBeInTheDocument();
    expect(screen.getByText('Rиз: 1,5447')).toBeInTheDocument();
    expect(screen.getByText('RΣ: 1,5859')).toBeInTheDocument();
    expect(screen.getByText('Lэфф: 64,0 м')).toBeInTheDocument();
    expect(screen.queryByText(/Tср/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\(—\)/)).not.toBeInTheDocument();
  });

  it('renders tank details without pipe-only fields', () => {
    render(
      <HeatCalcAssumptionsPanel
        selectedObject={makeObject({
          object_type: 'tank',
          params: {
            name: 'Резервуар 10 м3',
            process_temperature: 45,
            ambient_temperature: -15,
          },
          results: {
            alpha_vnesh_applied: 18.2,
            safety_factor_applied: 1.15,
            insulation_resistance_areal_bare: 0.9876,
            external_resistance_areal_bare: 0.0245,
            surface_area_bare: 36.42,
            wall_resistance_areal_bare: 0.0032,
          },
        })}
        calculationDetailsSettings={detailedSettings}
      />,
    );

    expect(screen.getByText('ΔT: 60°C')).toBeInTheDocument();
    expect(screen.getByText('Sпов.: 36,4 м²')).toBeInTheDocument();
    expect(screen.getByText('Rвнеш: 0,0245')).toBeInTheDocument();
    expect(screen.queryByText(/^Lэфф:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^RΣ:/)).not.toBeInTheDocument();
  });

  it('uses canonical ground temperature for an underground pipe ΔT', () => {
    render(
      <HeatCalcAssumptionsPanel
        selectedObject={makeObject({
          params: { name: 'Подземная труба', placement: 'underground', process_temperature: 60, ground_temperature: 5 },
        })}
        calculationDetailsSettings={detailedSettings}
      />,
    );

    expect(screen.getByText('ΔT: 55°C')).toBeInTheDocument();
  });

  it('renders underground tank ground and split surface details', () => {
    render(
      <HeatCalcAssumptionsPanel
        selectedObject={makeObject({
          object_type: 'tank',
          params: {
            name: 'Подземный резервуар',
            placement: 'underground',
            process_temperature: 40,
            ambient_temperature: 5,
          },
          results: {
            alpha_vnesh_applied: 12.4,
            insulation_resistance_areal_bare: 1.2345,
            external_resistance_areal_bare: 0.0111,
            ground_resistance_areal_bare: 0.2222,
            surface_area_bare: 50,
            wall_resistance_areal_bare: 0.0044,
            air_surface_area: 12.34,
            ground_surface_area: 37.66,
            ground_conductivity_applied: 1.75,
          },
        })}
        calculationDetailsSettings={detailedSettings}
      />,
    );

    expect(screen.getByText('Rгр: 0,2222')).toBeInTheDocument();
    expect(screen.getByText('Sвозд: 12,3 м²')).toBeInTheDocument();
    expect(screen.getByText('Sгр: 37,7 м²')).toBeInTheDocument();
    expect(screen.getByText('λгр: 1,75 Вт/мК')).toBeInTheDocument();
  });
});
