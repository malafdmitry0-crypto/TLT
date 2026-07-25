import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/api/references', () => ({
  getClimate: vi.fn(),
  getInsulation: vi.fn(),
  getPipeMaterials: vi.fn(),
  getSoilConductivity: vi.fn(),
}));

import {
  basePipeParams,
  mockReferences,
  renderWizard,
  spinValue,
} from './ObjectWizard.test-harness';

describe('ObjectWizard — lazy references & climate', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    await mockReferences();
  });

  it('лениво загружает климатический справочник только при открытии выбора климата', async () => {
    const refs = await import('@/api/references');
    const user = userEvent.setup();
    renderWizard();

    await waitFor(() => {
      expect(refs.getInsulation).toHaveBeenCalledTimes(1);
    });
    expect(refs.getClimate).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('climate-select'));

    await waitFor(() => {
      expect(refs.getClimate).toHaveBeenCalledTimes(1);
    });
  });

  it('лениво загружает справочник грунтов только при открытии выбора грунта', async () => {
    const refs = await import('@/api/references');
    const user = userEvent.setup();
    renderWizard({
      initialFormValues: {
        placement: 'underground',
      },
    });

    expect(await screen.findByTestId('ground-type-select')).toBeVisible();
    expect(refs.getSoilConductivity).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('ground-type-select'));

    await waitFor(() => {
      expect(refs.getSoilConductivity).toHaveBeenCalledTimes(1);
    });
  });

  it('показывает источники климата и скрывает обеспеченность, когда выбран климат', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        climate_city: 'Москва',
        climate_region: 'Москва',
        climate_temperature_basis: 't_0_92',
        ambient_temperature_source: 'climate',
        wind_speed: 4.2,
        wind_speed_source: 'climate',
      },
    });

    expect(screen.queryByTestId('climate-basis-display')).not.toBeInTheDocument();
    expect(screen.queryByText('Обеспеченность климата')).not.toBeInTheDocument();
    expect(await screen.findByTestId('wind-speed-input')).toBeVisible();
    expect(screen.queryByTestId('alpha-vnesh-input')).not.toBeInTheDocument();
    expect(screen.getAllByText('из климата').length).toBeGreaterThanOrEqual(1);
    expect(spinValue('ambient-temperature-input')).toHaveDisplayValue(/^-25(?:\.0)?$/);
    // TltNumberField formats decimals with RU comma separator
    expect(spinValue('wind-speed-input')).toHaveValue('4,2');
    expect(screen.queryByText('Грунт')).not.toBeInTheDocument();
  });

  it('сохраняет климатическую обеспеченность как расчётное hidden-значение по алгоритму', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      onSubmit,
      initialParams: {
        ...basePipeParams,
        climate_city: 'Москва',
        climate_region: 'Москва',
        climate_temperature_basis: undefined,
      },
    });

    expect(screen.queryByTestId('climate-basis-display')).not.toBeInTheDocument();
    await screen.findByTestId('climate-select');

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.climate_key).toBe('Москва|||Москва');
    expect(payload.climate_temperature_basis).toBe('t_0_92');
  });

  it('показывает Kзап в алгоритме выбора кабеля и сохраняет значение до ручного изменения', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderWizard({
      onSubmit,
      initialParams: {
        ...basePipeParams,
        safety_factor: 1.12,
        safety_factor_source: 'climate_policy',
      },
    });

    await screen.findByTestId('placement-select');
    const safetyInput = screen.getByTestId('safety-factor-input');
    expect(safetyInput).toBeInTheDocument();
    // TltNumberField formats decimals with RU comma separator
    expect(safetyInput).toHaveValue('1,12');
    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.safety_factor).toBe(1.12);
    expect(payload.safety_factor_source).toBe('climate_policy');
  });

  it('открывает длинный справочник в модальном окне и подставляет выбранный материал', async () => {
    const user = userEvent.setup();
    renderWizard({ initialParams: basePipeParams });

    const picker = await screen.findByTestId('insulation-material-select');
    await user.click(picker);
    const dialog = await screen.findByRole('dialog', { name: 'Материал изоляции' });
    await user.type(within(dialog).getByPlaceholderText('Поиск материала'), 'пено');
    await user.click(within(dialog).getByRole('option', { name: /Пеностекло/ }));

    await waitFor(() => {
      expect(picker).toHaveTextContent('Пеностекло');
    });
  });

  it('показывает справочные λ/диапазон как текст и открывает ручной ввод только для Другого материала', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWizard({ initialParams: basePipeParams, onSubmit });

    const materialPicker = await screen.findByTestId('insulation-material-select');
    expect(await screen.findByTestId('first-insulation-lambda-reference')).toHaveTextContent('0.045 Вт/мК');
    expect(screen.getByTestId('first-insulation-temperature-range-reference')).toHaveTextContent('-60...400 °C');
    expect(screen.queryByTestId('first-insulation-lambda-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-insulation-temperature-range-button')).not.toBeInTheDocument();

    await user.click(materialPicker);
    const materialDialog = await screen.findByRole('dialog', { name: 'Материал изоляции' });
    await user.click(within(materialDialog).getByRole('option', { name: 'Другое' }));

    const lambdaInput = await screen.findByTestId('first-insulation-lambda-input');
    await user.clear(lambdaInput);
    await user.type(lambdaInput, '0.049');
    await user.tab();

    await waitFor(() => expect(materialPicker).toHaveTextContent('Другое'));
    expect(screen.getByTestId('first-insulation-temperature-range-button')).toBeVisible();
    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.insulation_layers).toEqual([
      expect.objectContaining({
        material: 'other',
        conductivity: 0.049,
        temperature_range: [-60, 400],
      }),
    ]);
  });

});
