import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ElecCalcCableMarkModal from '@/pages/electrical/ElecCalcCableMarkModal';
import {
  AUTO_CABLE_MARK_VALUE,
  type CableMarkSelectOption,
} from '@/pages/electrical/elecCalcCableOptionModel';
import type { ProjectObject } from '@/types/project';
import type { ElecCalcAutoAvailability } from '@/pages/electrical/elecCalcAutoAvailabilityModel';

const object: ProjectObject = {
  id: 'object-1',
  project_id: 'project-1',
  object_type: 'pipe',
  sort_order: 1,
  version: 1,
  params: { name: 'Труба-1' },
  results: { heat_loss_per_meter_base: 12.5 },
  is_valid: true,
  validation_errors: null,
  created_at: '',
  updated_at: '',
};

const markOptions: CableMarkSelectOption[] = [
  {
    value: AUTO_CABLE_MARK_VALUE,
    label: 'Авто',
    searchLabel: 'Авто',
    mark: null,
    optionSource: 'builtin',
  },
  {
    value: 'builtin::TLT-25',
    label: 'ТЛТ-25 · 25 Вт/м',
    searchLabel: 'ТЛТ-25 · 25 Вт/м',
    mark: 'ТЛТ-25',
    optionSource: 'builtin',
    cableSource: 'builtin',
  },
];

const autoAvailable: ElecCalcAutoAvailability = {
  kind: 'available',
  blocked: false,
  message: null,
  tone: 'info',
  canRetry: false,
};

function setup(overrides: Partial<Parameters<typeof ElecCalcCableMarkModal>[0]> = {}) {
  const props: Parameters<typeof ElecCalcCableMarkModal>[0] = {
    object,
    selectedCable: null,
    cableType: 'self_regulating_tt',
    cableTypeOptions: [{ label: 'Самрег', value: 'self_regulating_tt' }],
    commercialFeaturesAvailable: true,
    projectSelected: true,
    pending: false,
    value: markOptions[1].value,
    threadCountValue: '1',
    markOptions,
    electricalVariantName: 'ЭР2',
    autoAvailability: autoAvailable,
    renderTypeControls: vi.fn(() => <div>controls</div>),
    onCableTypeChange: vi.fn(),
    onMarkChange: vi.fn(),
    onThreadCountChange: vi.fn(),
    onApply: vi.fn(),
    onRetryAutoAvailability: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ElecCalcCableMarkModal {...props} />) };
}

describe('ElecCalcCableMarkModal', () => {
  it('states that the command affects only the current ER', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: /Выбор марки кабеля/ });
    expect(within(dialog).getByText('Труба-1')).toBeInTheDocument();
    expect(within(dialog).getByText(/только к текущему ЭР: ЭР2/)).toBeInTheDocument();
    expect(within(dialog).queryByText('Сохранить в ЭР')).not.toBeInTheDocument();
  });

  it('blocks known-impossible Auto and explains the temperature reason', () => {
    setup({
      value: AUTO_CABLE_MARK_VALUE,
      autoAvailability: {
        kind: 'temperature',
        blocked: true,
        message: 'Автоподбор недоступен: среда −70 °C.',
        tone: 'warning',
        canRetry: false,
      },
    });
    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled();
    expect(screen.getByText(/Автоподбор недоступен/)).toBeInTheDocument();
  });

  it('offers retry after a request failure', async () => {
    const user = userEvent.setup();
    const { props } = setup({
      value: AUTO_CABLE_MARK_VALUE,
      autoAvailability: {
        kind: 'request_error',
        blocked: true,
        message: 'Не удалось проверить марки.',
        tone: 'danger',
        canRetry: true,
      },
    });
    await user.click(screen.getByRole('button', { name: 'Повторить проверку' }));
    expect(props.onRetryAutoAvailability).toHaveBeenCalledOnce();
  });

  it('does not block applying a manual mark because Auto is unavailable', () => {
    setup({
      value: markOptions[1].value,
      autoAvailability: {
        kind: 'catalog_empty',
        blocked: true,
        message: 'В каталоге нет марок.',
        tone: 'warning',
        canRetry: false,
      },
    });
    expect(screen.getByRole('button', { name: 'Применить' })).toBeEnabled();
    expect(screen.queryByText('В каталоге нет марок.')).not.toBeInTheDocument();
  });

  it('keeps the modal inspectable but disables writes in read-only mode', async () => {
    const user = userEvent.setup();
    const { props } = setup({ projectSelected: false });
    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onApply).not.toHaveBeenCalled();
  });
});
