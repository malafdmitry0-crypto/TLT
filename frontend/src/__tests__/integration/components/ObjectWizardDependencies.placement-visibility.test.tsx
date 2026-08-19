import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import {
  HEATCALC_FIELD_REGISTRY_VERSION,
  getHeatCalcDefaultVisibleTableKeys,
  getHeatCalcFieldConfig,
  getHeatCalcFieldDefinition,
  getHeatCalcFieldDescription,
  getHeatCalcFieldInputConfig,
  getHeatCalcFieldInputSettingsVersion,
  getHeatCalcFieldLabel,
  getHeatCalcFormFieldIds,
  getHeatCalcTableColumnRegistry,
  getHeatCalcTableSettingsVersion,
} from '@/domain/heatCalcFields';
import { isHeatCalcFieldVisible } from '@/domain/heatCalcFieldRules';

vi.mock('@/api/references', () => ({
  getClimate: vi.fn(),
  getInsulation: vi.fn(),
  getPipeMaterials: vi.fn(),
  getSoilConductivity: vi.fn(),
}));

import {
  mockReferences,
  renderWizard,
  basePipeParams,
} from './ObjectWizardDependencies.test-harness';

describe('HeatCalc ambient temperature registry contract', () => {
  it('registers an explicit minimum and an optional maximum in form and table', () => {
    expect(HEATCALC_FIELD_REGISTRY_VERSION).toBe(4);
    expect(getHeatCalcTableSettingsVersion()).toBe(9);
    expect(getHeatCalcFieldInputSettingsVersion()).toBe(2);

    expect(getHeatCalcFieldConfig('ambient_temperature')?.labels).toEqual({
      full: 'Минимальная температура окружающей среды',
      short: 'T окр. min',
      compact: 'T окр. min',
    });
    expect(getHeatCalcFieldLabel('ambient_temperature', {
      context: 'table',
      tableKey: 'ambient_temperature',
    })).toBe('T окр. min');
    expect(getHeatCalcFieldLabel('ambient_temperature', {
      context: 'table',
      tableKey: 'ambient_temperature',
      variant: 'full',
    })).toBe('Минимальная температура окружающей среды');
    expect(getHeatCalcFieldLabel('ambient_temperature', {
      context: 'settings',
      tableKey: 'ambient_temperature',
    })).toBe('Минимальная температура окружающей среды');
    expect(getHeatCalcFieldLabel('ambient_temperature', {
      context: 'form',
      objectType: 'pipe',
    })).toBe('Минимальная температура окружающей среды');

    expect(getHeatCalcFieldConfig('max_ambient_temperature')).toMatchObject({
      service_name: 'max_ambient_temperature',
      object_types: ['pipe', 'tank'],
      labels: {
        full: 'Максимальная температура окружающей среды',
        short: 'T окр. max',
        compact: 'T окр. max',
      },
    });
    expect(getHeatCalcFieldConfig('max_ambient_temperature')?.table_keys).toEqual({
      pipe: 'max_ambient_temperature',
      tank: 'max_ambient_temperature',
    });
    expect(getHeatCalcFieldDefinition('max_ambient_temperature', 'pipe')).toBeNull();
    expect(getHeatCalcFieldDefinition('max_ambient_temperature', 'tank')).toBeNull();

    const maximumInput = getHeatCalcFieldInputConfig('max_ambient_temperature', 'pipe');
    expect(maximumInput).toEqual({
      type: 'number',
      unit: '°C',
      min: -70,
      max: 70,
      default_step: 0.1,
      configurable_step: false,
      input_unit: 'raw',
      display_digits: 1,
    });
    expect(maximumInput).not.toHaveProperty('required');
    expect(maximumInput).not.toHaveProperty('default');
    expect(getHeatCalcFieldInputConfig('max_ambient_temperature', 'tank')).toEqual(maximumInput);
    expect(getHeatCalcFieldDescription('max_ambient_temperature')).toBe(
      'Справочное значение; в текущем расчёте не используется',
    );

    for (const objectType of ['pipe', 'tank'] as const) {
      const formFields = getHeatCalcFormFieldIds(objectType);
      const ambientIndex = formFields.indexOf('ambient_temperature');
      expect(ambientIndex).toBeGreaterThanOrEqual(0);
      expect(formFields[ambientIndex + 1]).toBe('max_ambient_temperature');
      expect(getHeatCalcTableColumnRegistry(objectType).map(({ key }) => key))
        .toContain('max_ambient_temperature');
      expect(getHeatCalcDefaultVisibleTableKeys(objectType))
        .toContain('max_ambient_temperature');
    }
    expect(getHeatCalcDefaultVisibleTableKeys('all'))
      .toContain('max_ambient_temperature');
  });
});

describe('HeatCalc ambient temperature domain visibility', () => {
  it.each([
    ['pipe', 'outdoor', true],
    ['pipe', 'underground', false],
    ['tank', 'outdoor', true],
    ['tank', 'underground', true],
  ] as const)('%s with %s placement exposes both air bounds: %s', (objectType, placement, visible) => {
    const context = { objectType, values: { placement } };
    expect(isHeatCalcFieldVisible('ambient_temperature', context)).toBe(visible);
    expect(isHeatCalcFieldVisible('max_ambient_temperature', context)).toBe(visible);
  });
});

describe('ObjectWizard dependencies — placement-visibility', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    await mockReferences();
  });

  it.each(['pipe', 'tank'] as const)('shows explicit accessible ambient bounds for outdoor %s', async (objectType) => {
    renderWizard({
      objectType,
      initialParams: objectType === 'pipe' ? basePipeParams : { placement: 'outdoor' },
    });

    const minimum = await screen.findByTestId('ambient-temperature-input');
    const maximum = screen.getByTestId('max-ambient-temperature-input');
    expect(minimum).toBeVisible();
    expect(maximum).toBeVisible();
    expect(minimum).toHaveAccessibleName('Минимальная температура окружающей среды');
    expect(maximum).toHaveAccessibleName('Максимальная температура окружающей среды');
  });

  it('для подземной трубы показывает грунт и скрывает ветер; alpha отсутствует во всей форме', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        placement: 'underground',
        burial_depth: 1.2,
        ground_type: 'dry_sand:na:0',
        ground_conductivity: 0.8}});

    expect(await screen.findByTestId('burial-depth-input')).toBeVisible();
    expect(screen.getByTestId('ground-type-select')).toBeVisible();
    expect(screen.getByTestId('ground-type-select')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('ground-temperature-input')).toBeVisible();
    expect(screen.getByTestId('ground-conductivity-input')).toBeVisible();
    expect(screen.getByTestId('ground-conductivity-input')).not.toHaveAttribute('aria-required');
    expect(screen.queryByTestId('ambient-temperature-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('max-ambient-temperature-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wind-speed-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alpha-vnesh-input')).not.toBeInTheDocument();
  });

  it('для подземного резервуара оставляет ветер, добавляет грунт и не показывает alpha', async () => {
    renderWizard({
      objectType: 'tank',
      initialParams: {
        name: 'Тестовый резервуар',
        shape: 'cylindrical',
        diameter: 2,
        height: 4,
        insulation_thickness: 0.08,
        insulation_material: 'mineral_wool',
        ambient_temperature: -20,
        process_temperature: 70,
        placement: 'underground',
        burial_depth: 1.5,
        ground_type: 'dry_sand:na:0',
        ground_conductivity: 0.8,
        wind_speed: 3.1}});

    expect(await screen.findByTestId('burial-depth-input')).toBeVisible();
    expect(screen.getByTestId('ground-type-select')).toBeVisible();
    expect(screen.getByTestId('ambient-temperature-input')).toBeVisible();
    expect(screen.getByTestId('max-ambient-temperature-input')).toBeVisible();
    expect(screen.getByTestId('wind-speed-input')).toBeVisible();
    expect(screen.queryByTestId('alpha-vnesh-input')).not.toBeInTheDocument();
  });
});
