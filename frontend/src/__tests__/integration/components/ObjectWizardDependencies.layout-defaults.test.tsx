import { describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';

vi.mock('@/api/references', () => ({
  getClimate: vi.fn(),
  getInsulation: vi.fn(),
  getPipeMaterials: vi.fn(),
  getSoilConductivity: vi.fn(),
}));

import {
  mockReferences,
  renderWizard,
} from './ObjectWizardDependencies.test-harness';
import { heatCalcSelectOptions } from '@/utils/heatCalcWizardFieldRules';

describe('ObjectWizard dependencies — layout-defaults', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    await mockReferences();
  });

  it('рендерит wide и side формы через разные layout roots', async () => {
    renderWizard({ layoutVariant: 'wide' });

    expect(await screen.findByTestId('object-name-input')).toBeInTheDocument();
    expect(screen.getByText('Расчёт теплопотерь')).toBeInTheDocument();
    expect(screen.getByText('Алгоритм выбора кабеля')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--wide .object-wizard-wide-panel[data-panel="wide"]')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--wide .object-wizard-side-panel')).not.toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--wide .form-grid-srs')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--wide .side-form-grid-srs')).not.toBeInTheDocument();
    // Object-scoped wizard owns heat fields/layers and the cable algorithm only.
    // Specification generation is a separate ER-scoped workflow.
    expect(document.querySelector('[data-testid="heat-object-fields"]')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="insulation-layers-table"]')).toBeInTheDocument();
    expect(document.querySelectorAll('.inline-object-form--wide .form-col-srs')).toHaveLength(1);
    expect(document.querySelector('[data-testid="heat-pdf-three-column-form"]')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="heat-cable-algorithm-form"]')).toBeInTheDocument();
    expect(document.querySelectorAll('.inline-object-form--wide .form-col-resize-handle')).toHaveLength(0);
    expect([...document.querySelectorAll('.inline-object-form--wide .inline-form-section-banner')].map((title) =>
      title.textContent?.replace(/\s+/g, ' ').trim(),
    )).toEqual(['Расчёт теплопотерь', 'Алгоритм выбора кабеля']);
    expect(document.querySelector('.heat-object-fields[data-protected="heat-object-fields"]')).toBeInTheDocument();
    expect(document.querySelector('.insulation-layers-table[data-protected="insulation-layers-table"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="wide"]')).toHaveClass(
      'tlt-compact-field-grid',
      // построчное заполнение — блоки кадра, а не колонки по смыслу
      'tlt-compact-field-grid--flow-rows',
      'tlt-compact-field-grid--ant-form',
    );
    expect(document.querySelector('[data-slot="wide"]')).toHaveAttribute('data-density', 'compact');
    // Раскладка по кадру: широкая форма — два блока, текст и числовые.
    // Третьего слота больше нет, числовые собраны в один список в порядке
    // макета (mockups/html/ishodnye-truba-zapolneno.html).
    expect(document.querySelector('[data-slot="geometry-numeric"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="environment-numeric"]')).not.toBeInTheDocument();

    cleanup();
    await mockReferences();
    renderWizard({ layoutVariant: 'side' });

    expect(await screen.findByText('Расчёт теплопотерь')).toBeInTheDocument();
    expect(screen.getByText('Алгоритм выбора кабеля')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--side .object-wizard-side-panel[data-panel="side"]')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--side .object-wizard-wide-panel')).not.toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--side .side-form-grid-srs')).toBeInTheDocument();
    expect(document.querySelector('.inline-object-form--side .form-grid-srs')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.inline-object-form--side .form-col-resize-handle')).toHaveLength(0);
    expect(screen.getByTestId('heat-side-compact-form')).toBeInTheDocument();
    expect(screen.getByTestId('heat-cable-algorithm-form')).toBeInTheDocument();
    expect(document.querySelectorAll('.inline-object-form--side .side-form-section')).toHaveLength(0);
    expect(screen.queryByText('Геометрия и размещение трубы')).not.toBeInTheDocument();
    expect(screen.queryByText('Климат и температуры')).not.toBeInTheDocument();
  });

  it('дефолтит однозначные select-поля новой трубы, но не подставляет числовые инженерные значения', async () => {
    renderWizard();

    expect(await screen.findByTestId('wall-thickness-input')).toHaveValue('');
    expect(screen.getByTestId('min-switch-temperature-input')).toHaveValue('');
    expect(screen.getByTestId('min-switch-temperature-input')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('safety-factor-input')).toBeInTheDocument();
    expect(screen.getByTestId('heat-cable-algorithm-form')).toBeInTheDocument();
    expect(screen.getByTestId('local-elements-count-input')).toHaveValue('');
    expect(screen.queryByTestId('valve-count-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('flange-count-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('support-count-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('local-element-equiv-length-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pipe-lambda-mode-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('placement-select')).toHaveTextContent('На открытом воздухе');
    expect(screen.getByTestId('insulation-layer-count-value')).toHaveValue('1');
    expect(screen.getByTestId('insulation-layer-add')).toBeInTheDocument();
    expect(screen.queryByTestId('insulation-layer-count-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('insulation-cover-material-select')).toHaveTextContent('Не указано');
    expect(screen.getByTestId('insulation-temperature-basis-select')).toHaveTextContent('Открытый воздух, зима');
    expect(screen.getByTestId('environment-select')).toHaveTextContent('Нормальная');
    expect(screen.getByTestId('temperature-group-select')).toHaveTextContent('T1');
    expect(screen.queryByTestId('supply-voltage-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('maintain-temperature-input')).toHaveValue('');
    expect(screen.queryByTestId('aggressive-product-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('steam-tracing-select')).toHaveTextContent('Нет');
    expect(screen.queryByTestId('vapor-temperature-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('winding-coefficient-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('connection-type-select')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('pipe-material-select')).toHaveTextContent('Сталь углеродистая');
    });
    expect(screen.queryByTestId('pipe-lambda-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('wind-speed-input')).toHaveValue('');
    expect(screen.getByTestId('alpha-vnesh-input')).toHaveValue('');
  });

  it('дефолтит форму нового резервуара, но не подставляет размеры', async () => {
    renderWizard({ objectType: 'tank' });

    expect(await screen.findByTestId('tank-shape-select')).toBeVisible();
    expect(screen.getByTestId('tank-shape-select')).toHaveTextContent('Цилиндрическая');
    expect(heatCalcSelectOptions('tank', 'shape')).toEqual([
      { value: 'cylindrical', label: 'Цилиндрическая' },
      { value: 'rectangular', label: 'Параллелепипед' },
    ]);
    expect(screen.getByTestId('max-ambient-temperature-input')).toHaveValue('');
    expect(screen.getByTestId('max-process-temperature-input')).toHaveValue('');
    expect(screen.getByTestId('tank-diameter-input')).toHaveValue('');
    expect(screen.getByTestId('tank-height-input')).toHaveValue('');
    expect(screen.getByTestId('q-additional-input')).toHaveValue('');
    expect(screen.getByTestId('min-switch-temperature-input')).toHaveValue('');
    expect(screen.getByTestId('min-switch-temperature-input')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByTestId('tank-heating-height-input')).toHaveValue('');
    expect(screen.getByTestId('tank-laying-step-input')).toHaveValue('');
  });
});
