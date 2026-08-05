import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ObjectWizard from '@/components/wizard/ObjectWizard';

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

describe('ObjectWizard dependencies — validation-highlight', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    await mockReferences();
  });

  it('показывает ошибки Excel-черновика прямо в форме параметров', async () => {
    renderWizard({
      initialFormValues: {
        name: 'Труба из Excel',
        outer_diameter_mm: 'abc',
        pipe_length: 12,
        wall_thickness_mm: 4,
        pipe_lambda_mode: 'reference',
        pipe_material: 'carbon_steel',
        placement: 'outdoor',
        insulation_layer_count: '1',
        insulation_material: 'mineral_wool',
        insulation_thickness_mm: 50,
        insulation_temperature_basis: 'outdoor_winter',
        ambient_temperature: -30,
        process_temperature: 80},
      fieldErrors: {
        pipe_outer_diameter: 'Введите число'}});

    expect(await screen.findByText('Введите число')).toBeInTheDocument();
    expect(screen.getByTestId('outer-diameter-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
  });

  it('подсвечивает поле по structured validation_errors.field с backend/API ключом', async () => {
    renderWizard({
      initialParams: basePipeParams,
      validationErrors: {
        error_code: 'schema_validation_error',
        category: 'validation',
        field: 'outer_diameter',
        message: 'Введите число'}});

    expect(await screen.findByText('Введите число')).toBeInTheDocument();
    expect(screen.getByTestId('outer-diameter-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
  });

  it('помечает обязательные числовые поля новой трубы как required', async () => {
    renderWizard();

    expect(await screen.findByTestId('outer-diameter-input')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('pipe-length-input')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('wall-thickness-input')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('local-elements-count-input')).not.toHaveAttribute('aria-required');
  });

  it('не подсвечивает пустые обязательные поля новой трубы до backend-ошибки', async () => {
    renderWizard();

    const outerDiameter = await screen.findByTestId('outer-diameter-input');
    const pipeLength = screen.getByTestId('pipe-length-input');
    const name = screen.getByTestId('object-name-input');

    expect(outerDiameter.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
    expect(pipeLength.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
    expect(name.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
    expect(screen.queryByText('Укажите значение')).not.toBeInTheDocument();
    expect(screen.queryByText('Выберите значение')).not.toBeInTheDocument();
  });

  it('нажатие сохранить подсвечивает пустые обязательные поля, не дожидаясь бэкенда', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWizard({ onSubmit });

    const pipeLength = await screen.findByTestId('pipe-length-input');
    const outerDiameter = screen.getByTestId('outer-diameter-input');
    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);

    // §5.3: поля помечены сразу, первое получает фокус, невалидная форма не отправляется.
    await waitFor(() => {
      expect(pipeLength.closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
    expect(outerDiameter.closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(outerDiameter.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-warning');
    await waitFor(() => expect(outerDiameter).toHaveFocus());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('пересчитывает локальную подсветку обязательного поля после backend-ошибки', async () => {
    const user = userEvent.setup();
    renderWizard({
      initialParams: {
        ...basePipeParams,
        pipe_length: undefined},
      validationErrors: {
        message: 'Не заполнены обязательные поля объекта: Длина трубопровода'}});

    const pipeLength = await screen.findByTestId('pipe-length-input');
    await waitFor(() => {
      expect(pipeLength.closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });

    await user.type(pipeLength, '12');

    await waitFor(() => {
      expect(pipeLength.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
    });
    expect(pipeLength).toHaveAttribute('aria-required', 'true');

    await user.clear(pipeLength);

    await waitFor(() => {
      expect(pipeLength.closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
  });

  it('подсвечивает незаполненные обязательные поля без верхней диагностики', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        outer_diameter: undefined,
        pipe_length: undefined},
      validationErrors: {
        message: 'Не заполнены обязательные поля объекта: Наружный диаметр, Длина трубопровода'}});

    await waitFor(() => {
      expect(screen.getByTestId('outer-diameter-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
    expect(screen.getByTestId('pipe-length-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(screen.queryByTestId('heatcalc-object-diagnostic')).not.toBeInTheDocument();
    expect(screen.queryByText('Расчёт не выполнен')).not.toBeInTheDocument();
    expect(screen.queryByText('Заполните обязательные поля')).not.toBeInTheDocument();
    expect(screen.queryByText('Выберите значение')).not.toBeInTheDocument();
  });

  it('подсвечивает наружный диаметр, когда backend-ошибка пришла после открытия формы', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } }});
    const props = {
      objectType: 'pipe' as const,
      onClose: vi.fn(),
      onSubmit: vi.fn()};
    const view = render(
      <QueryClientProvider client={client}>
        <ObjectWizard {...props} />
      </QueryClientProvider>,
    );

    const outerDiameter = await screen.findByTestId('outer-diameter-input');
    expect(outerDiameter.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');

    view.rerender(
      <QueryClientProvider client={client}>
        <ObjectWizard
          {...props}
          initialParams={{
            ...basePipeParams,
            outer_diameter: undefined}}
          validationErrors={{
            message: 'Не заполнены обязательные поля объекта: Наружный диаметр',
            missing_fields: ['Наружный диаметр']}}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('outer-diameter-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
  });

  it('подсвечивает весь набор пустых обязательных полей из backend validationErrors', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        outer_diameter: undefined,
        pipe_length: undefined,
        wall_thickness: undefined,
        insulation_layers: [{ thickness: null, material: null }],
        ambient_temperature: undefined,
        process_temperature: undefined},
      validationErrors: {
        message: 'Не заполнены обязательные поля объекта: Наружный диаметр, Длина трубопровода, Толщина стенки, Температура окружающей среды, Требуемая температура объекта, Толщина 1-го слоя изоляции, Материал 1-го слоя изоляции',
        missing_fields: [
          'Наружный диаметр',
          'Длина трубопровода',
          'Толщина стенки',
          'Температура окружающей среды',
          'Требуемая температура объекта',
          'Толщина 1-го слоя изоляции',
          'Материал 1-го слоя изоляции',
        ]}});

    await waitFor(() => {
      expect(screen.getByTestId('outer-diameter-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
    expect(screen.getByTestId('pipe-length-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(screen.getByTestId('wall-thickness-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(screen.getByTestId('ambient-temperature-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(screen.getByTestId('process-temperature-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(screen.getByTestId('insulation-thickness-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(screen.getByTestId('insulation-material-select').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
  });

  it('подсвечивает незаполненные поля второго слоя без текста обязательности', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        insulation_layers: [
          { thickness: 0.05, material: 'mineral_wool' },
          { thickness: null, material: null },
        ]},
      validationErrors: {
        message: 'Не заполнены обязательные поля объекта: Толщина 2-го слоя изоляции, Материал 2-го слоя изоляции'}});

    await waitFor(() => {
      expect(screen.getByTestId('second-insulation-thickness-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
    expect(screen.getByTestId('second-insulation-material-select').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(screen.queryByText('Обязательное поле')).not.toBeInTheDocument();
    expect(screen.queryByTestId('heatcalc-object-diagnostic')).not.toBeInTheDocument();
  });

  it('показывает текст диапазонной ошибки рядом с конкретным полем', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        ambient_temperature: -90},
      validationErrors: {
        message: 'Температура окружающей среды должна быть в диапазоне −70…+70 °C'}});

    expect(await screen.findByText('Температура окружающей среды должна быть в диапазоне −70…+70 °C')).toBeInTheDocument();
    expect(screen.getByTestId('ambient-temperature-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(screen.queryByTestId('heatcalc-object-diagnostic')).not.toBeInTheDocument();
  });

  it('подсвечивает поля первого слоя по расчётной ошибке диапазона температуры материала', async () => {
    const message = "Температура горячей стороны слоя изоляции #1 (0.999942 °C) вне диапазона материала 'other': 2...6 °C";
    renderWizard({
      initialParams: {
        ...basePipeParams,
        insulation_material: 'other',
        insulation_layers: [
          { thickness: 0.05, material: 'other', conductivity: 0.029, temperature_range: [2, 6] },
        ]},
      validationErrors: { message }});

    await waitFor(() => {
      expect(screen.getByTestId('first-insulation-temperature-range-button').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
      expect(screen.getByTestId('insulation-material-select').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
      expect(screen.getByTestId('first-insulation-lambda-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
    expect(screen.queryByText(/Расчётная T горячей стороны/)).not.toBeInTheDocument();
    expect(screen.queryByText('Выберите материал, диапазон которого включает расчётную температуру слоя')).not.toBeInTheDocument();
    expect(screen.queryByText('λ влияет на расчётную температуру слоя; после изменения проверьте диапазон T')).not.toBeInTheDocument();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
    expect(screen.queryByTestId('heatcalc-object-diagnostic')).not.toBeInTheDocument();
  });

  it('подсвечивает поля второго слоя по расчётной ошибке диапазона температуры материала', async () => {
    const message = "Температура горячей стороны слоя изоляции #2 (0.999942 °C) вне диапазона материала 'other': 2...6 °C";
    renderWizard({
      initialParams: {
        ...basePipeParams,
        insulation_layer_count: '2',
        insulation_layers: [
          { thickness: 0.05, material: 'mineral_wool' },
          { thickness: 0.02, material: 'other', conductivity: 0.029, temperature_range: [2, 6] },
        ]},
      validationErrors: { message }});

    await waitFor(() => {
      expect(screen.getByTestId('second-insulation-temperature-range-button').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
      expect(screen.getByTestId('second-insulation-material-select').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
      expect(screen.getByTestId('second-insulation-lambda-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
    expect(screen.getByTestId('insulation-material-select').closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
    expect(screen.queryByText(/Расчётная T горячей стороны/)).not.toBeInTheDocument();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('подсвечивает размеры резервуара, когда backend-ошибка пришла после открытия формы', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } }});
    const props = {
      objectType: 'tank' as const,
      onClose: vi.fn(),
      onSubmit: vi.fn()};
    const view = render(
      <QueryClientProvider client={client}>
        <ObjectWizard {...props} />
      </QueryClientProvider>,
    );

    const diameter = await screen.findByTestId('tank-diameter-input');
    const height = screen.getByTestId('tank-height-input');
    expect(diameter.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
    expect(height.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');

    view.rerender(
      <QueryClientProvider client={client}>
        <ObjectWizard
          {...props}
          initialParams={{
            shape: 'cylindrical',
            placement: 'outdoor',
            diameter: undefined,
            height: undefined,
            insulation_thickness: undefined,
            insulation_material: undefined,
            ambient_temperature: undefined,
            process_temperature: undefined}}
          validationErrors={{
            message: 'Не заполнены обязательные поля объекта: Диаметр резервуара, Высота резервуара',
            missing_fields: ['Диаметр резервуара', 'Высота резервуара']}}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('tank-diameter-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
    expect(screen.getByTestId('tank-height-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
  });
});
