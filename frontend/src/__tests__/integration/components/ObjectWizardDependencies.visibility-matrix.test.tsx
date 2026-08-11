import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
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

describe('ObjectWizard dependencies — visibility-matrix', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    await mockReferences();
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
        visible: ['burial-depth-input', 'ground-temperature-input', 'ground-type-select', 'ground-conductivity-input'],
        hidden: ['ambient-temperature-input', 'alpha-vnesh-input', 'wind-speed-input'],
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

      renderWizard({ objectType: item.objectType, initialParams, layoutVariant: 'side' });
      await screen.findByTestId(item.visible[0]);
      expect(screen.getByTestId('heat-side-compact-form')).toBeInTheDocument();
      expect(document.querySelectorAll('.inline-object-form--side .side-form-section')).toHaveLength(0);
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
        layoutVariant: 'side',
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

    const formConnectionWarnings: string[] = [];
    const originalConsoleError = console.error;
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...args: unknown[]) => {
      const text = typeof message === 'string' ? message : String(message ?? '');
      if (text.includes('useForm` is not connected') || text.includes('useForm is not connected')) {
        formConnectionWarnings.push(text);
      }
      originalConsoleError(message, ...args);
    });

    try {
      renderWizard({
        layoutVariant: 'side',
        initialParams: {
          ...basePipeParams,
          insulation_material: 'other',
          insulation_layers: [{
            thickness: 0.04,
            material: 'other',
            conductivity: 0.061,
            temperature_range: [-40, 120],
          }],
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
      expect(within(dialog).getByTestId('first-insulation-temperature-min-input')).toHaveValue('-40');
      expect(within(dialog).getByTestId('first-insulation-temperature-max-input')).toHaveValue('120');
      expect(formConnectionWarnings).toEqual([]);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
