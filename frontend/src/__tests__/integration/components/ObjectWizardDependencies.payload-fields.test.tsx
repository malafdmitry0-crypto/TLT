import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

describe('ObjectWizard dependencies — payload-fields', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    await mockReferences();
  });

  it('Q_доп: показывается только для резервуара и сохраняется в payload', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      objectType: 'tank',
      onSubmit,
      initialParams: {
        name: 'Бак',
        shape: 'cylindrical',
        diameter: 2,
        height: 3,
        insulation_layers: [{ thickness: 0.08, material: 'mineral_wool' }],
        insulation_temperature_basis: 'outdoor_winter',
        ambient_temperature: -20,
        process_temperature: 70,
        min_switch_temperature: -20,
        heating_height: 2,
        laying_step: 0.2,
        placement: 'outdoor',
        wind_speed: 0,
        q_additional: 250}});

    const input = await screen.findByTestId('q-additional-input');
    expect(input).toBeVisible();

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.q_additional).toBe(250);
  });

  it('Q_доп: для трубы поле не отображается', async () => {
    renderWizard({
      objectType: 'pipe',
      initialParams: basePipeParams});
    await screen.findByTestId('placement-select');
    expect(screen.queryByTestId('q-additional-input')).not.toBeInTheDocument();
  });

  it('L_ekv редактируется при наличии локальных элементов и сохраняется', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      onSubmit,
      initialParams: {
        ...basePipeParams,
        num_local_elements: 2,
        local_element_equiv_length: 2.4}});

    expect(await screen.findByTestId('local-elements-count-input')).toHaveValue('2');
    expect(screen.getByTestId('local-element-equiv-length-input')).toHaveValue('2,4');

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.num_local_elements).toBe(2);
    expect(payload.local_element_equiv_length).toBe(2.4);
  });

  it('помечает L_ekv обязательным при наличии локальных элементов', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        num_local_elements: 1,
        local_element_equiv_length: undefined}});

    expect(await screen.findByTestId('local-elements-count-input')).toHaveValue('1');
    expect(screen.getByTestId('local-element-equiv-length-input')).toHaveAttribute('aria-required', 'true');
  });

  it('не показывает ручной коэффициент наружной теплоотдачи', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        placement: 'outdoor',
        wind_speed: 4,
      },
    });

    expect(await screen.findByTestId('wind-speed-input')).toHaveValue('4');
    expect(screen.queryByTestId('alpha-vnesh-input')).not.toBeInTheDocument();
  });

  it('помечает λ грунта обязательной для ручного грунта и блокирует неполное сохранение', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      onSubmit,
      initialParams: {
        ...basePipeParams,
        placement: 'underground',
        burial_depth: 1.2,
        ground_temperature: 5,
        ground_type: 'custom',
        ground_conductivity: undefined}});

    expect(await screen.findByTestId('ground-type-select')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('ground-conductivity-input')).toHaveAttribute('aria-required', 'true');

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(screen.getByText('Укажите значение')).toBeVisible());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('стенка резервуара отображается и уходит в payload', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      objectType: 'tank',
      onSubmit,
      initialParams: {
        name: 'Бак',
        shape: 'cylindrical',
        diameter: 2,
        height: 3,
        wall_thickness: 0.012,
        wall_lambda: 45,
        insulation_layers: [{ thickness: 0.08, material: 'mineral_wool' }],
        insulation_temperature_basis: 'outdoor_winter',
        ambient_temperature: -20,
        process_temperature: 70,
        min_switch_temperature: -20,
        heating_height: 2,
        laying_step: 0.2,
        placement: 'outdoor',
        wind_speed: 0}});

    expect(await screen.findByTestId('tank-wall-thickness-input')).toBeVisible();
    expect(screen.getByTestId('tank-wall-lambda-input')).toBeVisible();

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.wall_thickness).toBe(0.012);
    expect(payload.wall_lambda).toBe(45);
  });

  it('blocks saving an incomplete tank wall pair', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      objectType: 'tank',
      onSubmit,
      initialParams: {
        name: 'Бак',
        shape: 'cylindrical',
        diameter: 2,
        height: 3,
        wall_thickness: 0.012,
        wall_lambda: undefined,
        insulation_layers: [{ thickness: 0.08, material: 'mineral_wool' }],
        insulation_temperature_basis: 'outdoor_winter',
        ambient_temperature: -20,
        process_temperature: 70,
        min_switch_temperature: -20,
        heating_height: 2,
        laying_step: 0.2,
        placement: 'outdoor',
        wind_speed: 0}});

    const wallLambdaInput = await screen.findByTestId('tank-wall-lambda-input');
    expect(wallLambdaInput).toHaveAttribute('aria-required', 'true');

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(wallLambdaInput).toHaveAttribute('aria-invalid', 'true'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('отправляет ручную λ трубы и три слоя изоляции', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      onSubmit,
      initialParams: {
        ...basePipeParams,
        pipe_material: undefined,
        pipe_lambda: 56,
        insulation_layers: [
          { thickness: 0.04, material: 'mineral_wool' },
          { thickness: 0.02, material: 'foam_glass' },
          { thickness: 0.01, material: 'other', conductivity: 0.061, temperature_range: [-60, 180] },
        ]}});

    expect(await screen.findByTestId('pipe-lambda-input')).toBeVisible();
    expect(screen.getByTestId('pipe-material-select')).toHaveTextContent('Другой материал');
    expect(screen.getByTestId('third-insulation-material-select')).toBeVisible();

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.pipe_lambda).toBe(56);
    expect(payload.pipe_material).toBeUndefined();
    expect(payload.insulation_layer_count).toBeUndefined();
    expect(payload.insulation_layers).toEqual([
      { thickness: 0.04, material: 'mineral_wool' },
      { thickness: 0.02, material: 'foam_glass' },
      { thickness: 0.01, material: 'other', conductivity: 0.061, temperature_range: [-60, 180] },
    ]);
  });
});
