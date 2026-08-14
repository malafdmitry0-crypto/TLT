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

function formItemFor(testId: string) {
  const item = screen.getByTestId(testId).closest('.ant-form-item');
  if (!(item instanceof HTMLElement)) throw new Error(`Form item not found for ${testId}`);
  return item;
}

function expectFieldSource(testId: string, source?: string) {
  const tag = formItemFor(testId).querySelector('.field-source-tag');
  if (source == null) {
    expect(tag).toBeNull();
    return;
  }
  expect(tag).toHaveTextContent(source);
  expect(tag).toBeVisible();
}

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

  it('связывает «вручную» с каждым обязательным прямым полем наружной трубы', async () => {
    renderWizard();

    await screen.findByTestId('outer-diameter-input');
    [
      'outer-diameter-input',
      'pipe-length-input',
      'wall-thickness-input',
      'ambient-temperature-input',
      'process-temperature-input',
      'wind-speed-input',
      'insulation-thickness-input',
    ].forEach((testId) => expectFieldSource(testId, 'вручную'));

    expectFieldSource('local-elements-count-input');
    expectFieldSource('placement-select');
    expectFieldSource('pipe-material-select');
    expectFieldSource('insulation-material-select');
  });

  it('пересчитывает ручной источник для грунтовых полей и не помечает справочник', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        placement: 'underground',
        burial_depth: undefined,
        ground_type: 'dry_sand:na:0',
        ground_temperature: undefined,
      },
    });

    await screen.findByTestId('burial-depth-input');
    expectFieldSource('burial-depth-input', 'вручную');
    expectFieldSource('ground-temperature-input', 'вручную');
    expectFieldSource('ground-type-select');
    expectFieldSource('ground-conductivity-input');
    expect(screen.queryByTestId('wind-speed-input')).not.toBeInTheDocument();
  });

  it('не помечает необязательные числовые поля резервуара как ручные', async () => {
    const user = userEvent.setup();
    renderWizard({ objectType: 'tank' });

    await screen.findByTestId('tank-diameter-input');
    expectFieldSource('tank-diameter-input', 'вручную');
    expectFieldSource('tank-height-input', 'вручную');
    expectFieldSource('ambient-temperature-input', 'вручную');
    expectFieldSource('process-temperature-input', 'вручную');
    expectFieldSource('insulation-thickness-input', 'вручную');
    expectFieldSource('tank-wall-thickness-input');
    expectFieldSource('tank-wall-lambda-input');
    expectFieldSource('wind-speed-input');
    expectFieldSource('tank-shape-select');

    await user.type(screen.getByTestId('tank-wall-thickness-input'), '12');

    await waitFor(() => {
      expect(screen.getByTestId('tank-wall-lambda-input')).toHaveAttribute('aria-required', 'true');
    });
    expectFieldSource('tank-wall-lambda-input', 'вручную');
  });

  it('блокирует сохранение наружной трубы без скорости ветра и принимает 0 м/с', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWizard({
      onSubmit,
      initialParams: {
        ...basePipeParams,
        wind_speed: undefined,
      },
    });

    const windSpeed = await screen.findByTestId('wind-speed-input');
    const windField = windSpeed.closest('.ant-form-item');
    expect(windSpeed).toHaveAttribute('aria-required', 'true');
    expect(windSpeed.closest('.tlt-number-field')).toHaveAttribute('data-required', 'true');

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);

    await waitFor(() => expect(windField).toHaveClass('ant-form-item-has-error'));
    expect(windField).toHaveTextContent('Укажите значение');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(windSpeed, '0');
    await waitFor(() => expect(windField).not.toHaveClass('ant-form-item-has-error'));
    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ wind_speed: 0 }));
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Исправьте ошибки в форме');
    expect((await screen.findAllByText('Укажите значение')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Выберите значение')).length).toBeGreaterThan(0);
    expect(outerDiameter).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(outerDiameter).toHaveAttribute('aria-describedby'));
    const insulationMaterial = screen.getByTestId('insulation-material-select');
    expect(insulationMaterial).toHaveAttribute('aria-invalid', 'true');
    expect(insulationMaterial).toHaveAttribute('aria-describedby');
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
    await waitFor(() => {
      expect(screen.getByTestId('outer-diameter-input').closest('.ant-form-item')).toHaveTextContent('Укажите значение');
      expect(screen.getByTestId('pipe-length-input').closest('.ant-form-item')).toHaveTextContent('Укажите значение');
    });
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

  it('подсвечивает material второго слоя по fields.insulation_layers.1.material', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        insulation_layers: [
          { thickness: 0.05, material: 'mineral_wool' },
          { thickness: 0.04, material: 'not_a_catalog_material' },
        ]},
      validationErrors: {
        error_code: 'unknown_insulation_material',
        category: 'validation',
        field: 'insulation_layers.1.material',
        fields: {
          'insulation_layers.1.material': 'Неизвестный материал изоляции: not_a_catalog_material'},
        message: 'Неизвестный материал изоляции: not_a_catalog_material'}});

    await waitFor(() => {
      expect(screen.getByTestId('second-insulation-material-select').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
    expect(screen.getByTestId('insulation-material-select').closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
    expect(await screen.findByText('Неизвестный материал изоляции: not_a_catalog_material')).toBeInTheDocument();
  });

  it('подсвечивает незаполненные поля второго слоя с понятным текстом обязательности', async () => {
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
    await waitFor(() => {
      expect(screen.getByTestId('second-insulation-thickness-input').closest('.ant-form-item')).toHaveTextContent('Укажите значение');
      expect(screen.getByTestId('second-insulation-material-select').closest('.ant-form-item')).toHaveTextContent('Выберите значение');
    });
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
