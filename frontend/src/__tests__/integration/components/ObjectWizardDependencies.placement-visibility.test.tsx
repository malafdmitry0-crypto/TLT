import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';

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

describe('ObjectWizard dependencies — placement-visibility', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    await mockReferences();
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
        wind_speed: 3.1,
        alpha_vnesh: 12}});

    expect(await screen.findByTestId('burial-depth-input')).toBeVisible();
    expect(screen.getByTestId('ground-type-select')).toBeVisible();
    expect(screen.getByTestId('wind-speed-input')).toBeVisible();
    expect(screen.queryByTestId('alpha-vnesh-input')).not.toBeInTheDocument();
  });
});
