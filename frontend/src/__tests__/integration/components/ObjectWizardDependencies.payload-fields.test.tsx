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
        insulation_thickness: 0.08,
        insulation_material: 'mineral_wool',
        ambient_temperature: -20,
        process_temperature: 70,
        placement: 'outdoor',
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

  it('L_ekv не редактируется в форме, но существующее справочное значение сохраняется', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      onSubmit,
      initialParams: {
        ...basePipeParams,
        valve_count: 1,
        flange_count: 1,
        support_count: 0,
        local_element_equiv_length: 2.4}});

    expect(await screen.findByTestId('local-elements-count-input')).toHaveValue('2');
    expect(screen.queryByTestId('local-element-equiv-length-input')).not.toBeInTheDocument();

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.num_local_elements).toBe(2);
    expect(payload.local_element_equiv_length).toBe(2.4);
  });

  it('не показывает L_ekv и позволяет backend применить справочное значение', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      onSubmit,
      initialParams: {
        ...basePipeParams,
        valve_count: 1,
        flange_count: 0,
        support_count: 0,
        local_element_equiv_length: undefined}});

    expect(await screen.findByTestId('local-elements-count-input')).toHaveValue('1');
    expect(screen.queryByTestId('local-element-equiv-length-input')).not.toBeInTheDocument();

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.local_element_equiv_length).toBeUndefined();
  });

  it('помечает λ грунта только для ручного грунта, но позволяет сохранить для расчёта статуса', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      onSubmit,
      initialParams: {
        ...basePipeParams,
        placement: 'underground',
        burial_depth: 1.2,
        ground_type: 'custom',
        ground_conductivity: undefined}});

    expect(await screen.findByTestId('ground-type-select')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('ground-conductivity-input')).toHaveAttribute('aria-required', 'true');

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.ground_conductivity).toBeUndefined();
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
        insulation_thickness: 0.08,
        insulation_material: 'mineral_wool',
        ambient_temperature: -20,
        process_temperature: 70,
        placement: 'outdoor'}});

    expect(await screen.findByTestId('tank-wall-thickness-input')).toBeVisible();
    expect(screen.getByTestId('tank-wall-lambda-input')).toBeVisible();

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.wall_thickness).toBe(0.012);
    expect(payload.wall_lambda).toBe(45);
  });

  it('помечает стенку резервуара парой, но позволяет сохранить для расчёта статуса', async () => {
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
        insulation_thickness: 0.08,
        insulation_material: 'mineral_wool',
        ambient_temperature: -20,
        process_temperature: 70,
        placement: 'outdoor'}});

    expect(await screen.findByTestId('tank-wall-lambda-input')).toHaveAttribute('aria-required', 'true');

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.wall_thickness).toBe(0.012);
    expect(payload.wall_lambda).toBeUndefined();
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
    expect(payload.insulation_layer_count).toBe('3');
    expect(payload.insulation_layers).toEqual([
      { thickness: 0.04, material: 'mineral_wool' },
      { thickness: 0.02, material: 'foam_glass' },
      { thickness: 0.01, material: 'other', conductivity: 0.061, temperature_range: [-60, 180] },
    ]);
  });
});
