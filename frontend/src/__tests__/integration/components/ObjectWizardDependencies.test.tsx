import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import ObjectWizard from '@/components/wizard/ObjectWizard';

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

const insulationRows = [
  { material: 'mineral_wool', name: 'Минеральная вата', conductivity: 0.045 },
  { material: 'foam_glass', name: 'Пеностекло', conductivity: 0.052 },
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
    await mockReferences();
  });

  it('показывает климатическую обеспеченность и источники, когда выбран климат', async () => {
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

    expect(await screen.findByTestId('climate-basis-select')).toBeVisible();
    expect(screen.getByTestId('wind-speed-input')).toBeVisible();
    expect(screen.getByTestId('alpha-vnesh-input')).toBeVisible();
    expect(screen.getAllByText('из климата').length).toBeGreaterThanOrEqual(1);
    expect(spinValue('ambient-temperature-input')).toHaveValue('-25');
    expect(spinValue('wind-speed-input')).toHaveValue('4.2');
    expect(screen.queryByText('Грунт')).not.toBeInTheDocument();
  });

  it('для подземной трубы показывает грунт и скрывает ветер/alpha', async () => {
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
    expect(screen.getByTestId('ground-conductivity-input')).toBeVisible();
    expect(screen.queryByTestId('wind-speed-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alpha-vnesh-input')).not.toBeInTheDocument();
  });

  it('для подземного резервуара оставляет ветер/alpha и добавляет грунт', async () => {
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
    expect(screen.getByTestId('alpha-vnesh-input')).toBeVisible();
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
    await screen.findByTestId('safety-factor-input');
    expect(screen.queryByTestId('q-additional-input')).not.toBeInTheDocument();
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
          { thickness: 0.01, material: 'other', conductivity: 0.061 },
        ],
      },
    });

    expect(await screen.findByTestId('pipe-lambda-input')).toBeVisible();
    expect(screen.queryByTestId('pipe-material-select')).not.toBeInTheDocument();
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
      { thickness: 0.01, material: 'other', conductivity: 0.061 },
    ]);
  });

  it('фиксирует матрицу видимости для размещения и типа объекта', async () => {
    const cases = [
      {
        objectType: 'pipe' as const,
        placement: 'outdoor',
        visible: ['wind-speed-input', 'alpha-vnesh-input'],
        hidden: ['burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
      },
      {
        objectType: 'pipe' as const,
        placement: 'indoor',
        visible: ['alpha-vnesh-input'],
        hidden: ['wind-speed-input', 'burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
      },
      {
        objectType: 'pipe' as const,
        placement: 'underground',
        visible: ['burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
        hidden: ['wind-speed-input', 'alpha-vnesh-input'],
      },
      {
        objectType: 'tank' as const,
        placement: 'outdoor',
        visible: ['wind-speed-input', 'alpha-vnesh-input'],
        hidden: ['burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
      },
      {
        objectType: 'tank' as const,
        placement: 'indoor',
        visible: ['alpha-vnesh-input'],
        hidden: ['wind-speed-input', 'burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
      },
      {
        objectType: 'tank' as const,
        placement: 'underground',
        visible: ['wind-speed-input', 'alpha-vnesh-input', 'burial-depth-input', 'ground-type-select', 'ground-conductivity-input'],
        hidden: [],
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
    expect(screen.queryByTestId('pipe-material-select')).not.toBeInTheDocument();
  });

  it('фиксирует матрицу видимости слоёв изоляции и ручной λ', async () => {
    const layerCases = [
      {
        count: '1',
        visible: ['insulation-material-select'],
        hidden: ['second-insulation-material-select', 'third-insulation-material-select'],
      },
      {
        count: '2',
        visible: ['second-insulation-material-select', 'second-insulation-thickness-input'],
        hidden: ['third-insulation-material-select', 'third-insulation-thickness-input'],
      },
      {
        count: '3',
        visible: ['second-insulation-material-select', 'third-insulation-material-select', 'third-insulation-thickness-input'],
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
  });
});
