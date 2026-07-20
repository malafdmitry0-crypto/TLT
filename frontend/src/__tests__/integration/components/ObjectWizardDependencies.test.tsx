import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import ObjectWizard from '@/components/wizard/ObjectWizard';
import type { InsulationEntry } from '@/types/reference';

vi.mock('@/api/references', () => ({
  getClimate: vi.fn(),
  getInsulation: vi.fn(),
  getPipeMaterials: vi.fn(),
  getSoilConductivity: vi.fn(),
}));

const climateRows = [
  {
    city: 'Москва',
    region: 'Москва',
    t_0_92: -25,
    t_0_98: -28,
    t_abs_min: -42,
    wind_avg_cold: 4.2,
  },
];

const insulationRows: InsulationEntry[] = [
  { material: 'mineral_wool', name: 'Минеральная вата', conductivity: 0.045, temperature_range: [-60, 400] },
  { material: 'foam_glass', name: 'Пеностекло', conductivity: 0.052, temperature_range: [-180, 430] },
];

const pipeMaterialRows = [
  {
    material: 'carbon_steel',
    name: 'Сталь углеродистая',
    formula: 'a + b*T',
    a: 56,
    b: 0,
    accuracy: 'reference',
  },
];

const soilRows = [
  {
    soil: 'Песок',
    soil_code: 'dry_sand',
    density_kg_m3: null,
    moisture_percent: 0,
    conductivity: 0.8,
  },
];

async function mockReferences() {
  const refs = await import('@/api/references');
  vi.mocked(refs.getClimate).mockResolvedValue(climateRows);
  vi.mocked(refs.getInsulation).mockResolvedValue(insulationRows);
  vi.mocked(refs.getPipeMaterials).mockResolvedValue(pipeMaterialRows);
  vi.mocked(refs.getSoilConductivity).mockResolvedValue(soilRows);
}

function renderWizard(
  props: Partial<ComponentProps<typeof ObjectWizard>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ObjectWizard
        objectType="pipe"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

function spinValue(testId: string) {
  return screen.getByTestId(testId);
}

const basePipeParams = {
  name: 'Тестовая труба',
  outer_diameter: 0.108,
  wall_thickness: 0.004,
  pipe_material: 'carbon_steel',
  pipe_length: 25,
  insulation_thickness: 0.05,
  insulation_material: 'mineral_wool',
  ambient_temperature: -25,
  process_temperature: 80,
  placement: 'outdoor',
};

describe('ObjectWizard dependencies', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    await mockReferences();
  });

  it('рендерит wide и side формы через разные layout roots', async () => {
    renderWizard({ layoutVariant: 'wide' });

    expect(await screen.findByTestId('object-name-input')).toBeInTheDocument();
    expect(screen.queryByText('Расчёт теплопотерь')).not.toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--wide .object-wizard-wide-panel[data-panel="wide"]')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--wide .object-wizard-side-panel')).not.toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--wide .form-grid-srs')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--wide .side-form-grid-srs')).not.toBeInTheDocument();
    // SC-03: three semantic columns from SRS 5.3.
    expect(document.querySelectorAll('.inline-object-form--wide .form-col-srs')).toHaveLength(4);
    expect(document.querySelector('[data-testid="heat-pdf-three-column-form"]')).toBeInTheDocument();
    expect(document.querySelectorAll('.inline-object-form--wide .form-col-resize-handle')).toHaveLength(0);
    expect([...document.querySelectorAll('.inline-object-form--wide .form-col-srs > h4')].map((title) =>
      title.textContent?.replace(/\s+/g, ' ').trim(),
    )).toEqual([
      'Параметры трубопровода',
      'Условия эксплуатации',
      'Локальные элементы',
      'Теплоизоляция',
    ]);

    cleanup();
    await mockReferences();
    renderWizard({ layoutVariant: 'side' });

    expect(await screen.findByText('Расчёт теплопотерь')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--side .object-wizard-side-panel[data-panel="side"]')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--side .object-wizard-wide-panel')).not.toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--side .side-form-grid-srs')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--side .form-grid-srs')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.inline-object-form--side .form-col-resize-handle')).toHaveLength(0);
    expect([...document.querySelectorAll('.inline-object-form--side .side-form-section > h4')].map((title) =>
      title.textContent?.replace(/\s+/g, ' ').trim(),
    )).toEqual(['Геометрия и размещение трубы', 'Теплоизоляция', 'Климат и температуры']);
  });

  it('дефолтит однозначные select-поля новой трубы, но не подставляет числовые инженерные значения', async () => {
    renderWizard();

    expect(await screen.findByTestId('wall-thickness-input')).toHaveValue('');
    expect(screen.getByTestId('min-switch-temperature-input')).toHaveValue('');
    expect(screen.queryByTestId('safety-factor-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('local-elements-count-input')).toHaveValue('');
    expect(screen.queryByTestId('valve-count-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('flange-count-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('support-count-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('local-element-equiv-length-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pipe-lambda-mode-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('placement-select')).toHaveTextContent('На открытом воздухе');
    expect(screen.getByTestId('insulation-layer-count-select')).toHaveTextContent('1 слой');
    expect(screen.getByTestId('insulation-cover-material-select')).toHaveTextContent('Не указано');
    expect(screen.getByTestId('insulation-temperature-basis-select')).toHaveTextContent('Открытый воздух, зима');
    expect(screen.getByTestId('environment-select')).toHaveTextContent('Нормальная');
    expect(screen.getByTestId('zone-classification-select')).toHaveTextContent('Безопасная');
    expect(screen.getByTestId('temperature-group-select')).toHaveTextContent('T1');
    expect(screen.getByTestId('supply-voltage-select')).toHaveTextContent('220');
    expect(screen.getByTestId('steam-tracing-select')).toHaveTextContent('Нет');
    await waitFor(() => {
      expect(screen.getByTestId('pipe-material-select')).toHaveTextContent('Сталь углеродистая');
    });
    expect(screen.queryByTestId('pipe-lambda-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('wind-speed-input')).toHaveValue('');
    expect(screen.queryByTestId('alpha-vnesh-input')).not.toBeInTheDocument();
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
        process_temperature: 80,
      },
      fieldErrors: {
        pipe_outer_diameter: 'Введите число',
      },
    });

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
        message: 'Введите число',
      },
    });

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

  it('нажатие сохранить не подсвечивает пустые поля до backend-ошибки', async () => {
    const user = userEvent.setup();
    renderWizard();

    const pipeLength = await screen.findByTestId('pipe-length-input');
    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);

    expect(pipeLength.closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
  });

  it('пересчитывает локальную подсветку обязательного поля после backend-ошибки', async () => {
    const user = userEvent.setup();
    renderWizard({
      initialParams: {
        ...basePipeParams,
        pipe_length: undefined,
      },
      validationErrors: {
        message: 'Не заполнены обязательные поля объекта: Длина трубопровода',
      },
    });

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
        pipe_length: undefined,
      },
      validationErrors: {
        message: 'Не заполнены обязательные поля объекта: Наружный диаметр, Длина трубопровода',
      },
    });

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
      defaultOptions: { queries: { retry: false } },
    });
    const props = {
      objectType: 'pipe' as const,
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    };
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
            outer_diameter: undefined,
          }}
          validationErrors={{
            message: 'Не заполнены обязательные поля объекта: Наружный диаметр',
            missing_fields: ['Наружный диаметр'],
          }}
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
        insulation_thickness: undefined,
        insulation_material: undefined,
        ambient_temperature: undefined,
        process_temperature: undefined,
      },
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
        ],
      },
    });

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
        insulation_layer_count: '2',
      },
      validationErrors: {
        message: 'Не заполнены обязательные поля объекта: Толщина 2-го слоя изоляции, Материал 2-го слоя изоляции',
      },
    });

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
        ambient_temperature: -90,
      },
      validationErrors: {
        message: 'Температура окружающей среды должна быть в диапазоне −70…+70 °C',
      },
    });

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
        ],
      },
      validationErrors: { message },
    });

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
        ],
      },
      validationErrors: { message },
    });

    await waitFor(() => {
      expect(screen.getByTestId('second-insulation-temperature-range-button').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
      expect(screen.getByTestId('second-insulation-material-select').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
      expect(screen.getByTestId('second-insulation-lambda-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
    expect(screen.getByTestId('insulation-material-select').closest('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
    expect(screen.queryByText(/Расчётная T горячей стороны/)).not.toBeInTheDocument();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it('дефолтит форму нового резервуара, но не подставляет размеры', async () => {
    renderWizard({ objectType: 'tank' });

    expect(await screen.findByTestId('tank-shape-select')).toBeVisible();
    expect(screen.getByTestId('tank-shape-select')).toHaveTextContent('Цилиндрическая');
    expect(screen.getByTestId('max-ambient-temperature-input')).toHaveValue('');
    expect(screen.getByTestId('max-process-temperature-input')).toHaveValue('');
    expect(screen.getByTestId('tank-diameter-input')).toHaveValue('');
    expect(screen.getByTestId('tank-height-input')).toHaveValue('');
    expect(screen.getByTestId('q-additional-input')).toHaveValue('');
  });

  it('подсвечивает размеры резервуара, когда backend-ошибка пришла после открытия формы', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const props = {
      objectType: 'tank' as const,
      onClose: vi.fn(),
      onSubmit: vi.fn(),
    };
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
            process_temperature: undefined,
          }}
          validationErrors={{
            message: 'Не заполнены обязательные поля объекта: Диаметр резервуара, Высота резервуара',
            missing_fields: ['Диаметр резервуара', 'Высота резервуара'],
          }}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('tank-diameter-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    });
    expect(screen.getByTestId('tank-height-input').closest('.ant-form-item')).toHaveClass('ant-form-item-has-error');
  });

  it('показывает расчётную климатическую обеспеченность и источники, когда выбран климат', async () => {
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

    expect(await screen.findByTestId('climate-basis-display')).toHaveDisplayValue(/0,92/);
    expect(screen.getByTestId('wind-speed-input')).toBeVisible();
    expect(screen.queryByTestId('alpha-vnesh-input')).not.toBeInTheDocument();
    expect(screen.getAllByText('из климата').length).toBeGreaterThanOrEqual(1);
    expect(spinValue('ambient-temperature-input')).toHaveDisplayValue(/^-25(?:\.0)?$/);
    expect(spinValue('wind-speed-input')).toHaveValue('4.2');
    expect(screen.queryByText('Грунт')).not.toBeInTheDocument();
  });

  it('сохраняет климатическую обеспеченность как расчётное значение по алгоритму', async () => {
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

    expect(await screen.findByTestId('climate-basis-display')).toHaveDisplayValue(/0,92/);

    await user.click(document.querySelector<HTMLButtonElement>('#inline-object-save')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.climate_key).toBe('Москва|||Москва');
    expect(payload.climate_temperature_basis).toBe('t_0_92');
  });

  it('скрывает Kзап из формы и сохраняет существующее значение для downstream-расчёта', async () => {
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
    expect(screen.queryByTestId('safety-factor-input')).not.toBeInTheDocument();
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

  it('для подземной трубы показывает грунт и скрывает ветер; alpha отсутствует во всей форме', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        placement: 'underground',
        burial_depth: 1.2,
        ground_type: 'dry_sand:na:0',
        ground_conductivity: 0.8,
      },
    });

    expect(await screen.findByTestId('burial-depth-input')).toBeVisible();
    expect(screen.getByTestId('ground-type-select')).toBeVisible();
    expect(screen.getByTestId('ground-type-select')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('ground-conductivity-input')).toBeVisible();
    expect(screen.getByTestId('ground-conductivity-input')).not.toHaveAttribute('aria-required');
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
        alpha_vnesh: 12,
      },
    });

    expect(await screen.findByTestId('burial-depth-input')).toBeVisible();
    expect(screen.getByTestId('ground-type-select')).toBeVisible();
    expect(screen.getByTestId('wind-speed-input')).toBeVisible();
    expect(screen.queryByTestId('alpha-vnesh-input')).not.toBeInTheDocument();
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
        q_additional: 250,
      },
    });

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
      initialParams: basePipeParams,
    });
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
        local_element_equiv_length: 2.4,
      },
    });

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
        local_element_equiv_length: undefined,
      },
    });

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
        ground_conductivity: undefined,
      },
    });

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
        placement: 'outdoor',
      },
    });

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
        placement: 'outdoor',
      },
    });

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
        ],
      },
    });

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

  it('фиксирует матрицу видимости для размещения и типа объекта', async () => {
    const cases = [
      {
        objectType: 'pipe' as const,
        placement: 'outdoor',
        visible: ['ambient-temperature-input', 'wind-speed-input'],
        hidden: ['alpha-vnesh-input', 'burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
      },
      {
        objectType: 'pipe' as const,
        placement: 'indoor',
        visible: ['ambient-temperature-input'],
        hidden: ['alpha-vnesh-input', 'wind-speed-input', 'burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
      },
      {
        objectType: 'pipe' as const,
        placement: 'underground',
        visible: ['burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
        hidden: ['alpha-vnesh-input', 'wind-speed-input'],
      },
      {
        objectType: 'tank' as const,
        placement: 'outdoor',
        visible: ['ambient-temperature-input', 'wind-speed-input'],
        hidden: ['alpha-vnesh-input', 'burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
      },
      {
        objectType: 'tank' as const,
        placement: 'indoor',
        visible: ['ambient-temperature-input'],
        hidden: ['alpha-vnesh-input', 'wind-speed-input', 'burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
      },
      {
        objectType: 'tank' as const,
        placement: 'underground',
        visible: ['wind-speed-input', 'burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
        hidden: ['alpha-vnesh-input'],
      },
    ];

    for (const item of cases) {
      const initialParams = item.objectType === 'pipe'
        ? {
            ...basePipeParams,
            placement: item.placement,
            ...(item.placement === 'underground'
              ? { burial_depth: 1.2, ground_type: 'dry_sand:na:0', ground_conductivity: 0.8 }
              : {}),
          }
        : {
            name: 'Тестовый резервуар',
            shape: 'cylindrical',
            diameter: 2,
            height: 4,
            insulation_thickness: 0.08,
            insulation_material: 'mineral_wool',
            ambient_temperature: -20,
            process_temperature: 70,
            placement: item.placement,
            ...(item.placement === 'underground'
              ? { burial_depth: 1.5, ground_type: 'dry_sand:na:0', ground_conductivity: 0.8 }
              : {}),
          };

      renderWizard({ objectType: item.objectType, initialParams });
      await screen.findByTestId(item.visible[0]);
      for (const testId of item.visible) {
        expect(screen.getByTestId(testId)).toBeVisible();
      }
      for (const testId of item.hidden) {
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      }
      cleanup();
    }
  });

  it('фиксирует матрицу видимости режима λ трубы', async () => {
    renderWizard({
      initialParams: {
        ...basePipeParams,
        pipe_material: 'carbon_steel',
        pipe_lambda: undefined,
      },
    });
    expect(await screen.findByTestId('pipe-material-select')).toBeVisible();
    expect(screen.queryByTestId('pipe-lambda-input')).not.toBeInTheDocument();
    cleanup();

    renderWizard({
      initialParams: {
        ...basePipeParams,
        pipe_material: undefined,
        pipe_lambda: 56,
      },
    });
    expect(await screen.findByTestId('pipe-lambda-input')).toBeVisible();
    expect(screen.getByTestId('pipe-material-select')).toHaveTextContent('Другой материал');
  });

  it('фиксирует матрицу видимости слоёв изоляции и ручной λ', async () => {
    const user = userEvent.setup();
    const layerCases = [
      {
        count: '1',
        visible: [
          'insulation-material-select',
          'first-insulation-lambda-reference',
          'first-insulation-temperature-range-reference',
        ],
        hidden: ['second-insulation-material-select', 'third-insulation-material-select'],
      },
      {
        count: '2',
        visible: [
          'second-insulation-material-select',
          'second-insulation-thickness-input',
          'second-insulation-lambda-reference',
          'second-insulation-temperature-range-reference',
        ],
        hidden: ['third-insulation-material-select', 'third-insulation-thickness-input'],
      },
      {
        count: '3',
        visible: [
          'second-insulation-material-select',
          'third-insulation-material-select',
          'third-insulation-thickness-input',
          'third-insulation-lambda-reference',
          'third-insulation-temperature-range-reference',
        ],
        hidden: [],
      },
    ];

    for (const item of layerCases) {
      renderWizard({
        initialParams: {
          ...basePipeParams,
          insulation_layer_count: item.count,
          insulation_layers: [
            { thickness: 0.04, material: 'mineral_wool' },
            ...(Number(item.count) >= 2 ? [{ thickness: 0.02, material: 'foam_glass' }] : []),
            ...(Number(item.count) >= 3 ? [{ thickness: 0.01, material: 'mineral_wool' }] : []),
          ],
        },
      });
      await screen.findByTestId(item.visible[0]);
      for (const testId of item.visible) {
        expect(screen.getByTestId(testId)).toBeVisible();
      }
      for (const testId of item.hidden) {
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      }
      cleanup();
    }

    renderWizard({
      initialParams: {
        ...basePipeParams,
        insulation_material: 'other',
        insulation_layers: [{ thickness: 0.04, material: 'other', conductivity: 0.061 }],
      },
    });
    expect(await screen.findByTestId('first-insulation-lambda-input')).toBeVisible();
    expect(screen.getByTestId('first-insulation-lambda-input')).not.toBeDisabled();
    const rangeButton = screen.getByTestId('first-insulation-temperature-range-button');
    expect(rangeButton).toBeVisible();
    await user.click(rangeButton);
    const dialog = await screen.findByRole('dialog', { name: 'Диапазон температуры' });
    await waitFor(() => {
      expect(within(dialog).getByTestId('first-insulation-temperature-min-input')).toBeVisible();
      expect(within(dialog).getByTestId('first-insulation-temperature-max-input')).toBeVisible();
    });
  });
});
