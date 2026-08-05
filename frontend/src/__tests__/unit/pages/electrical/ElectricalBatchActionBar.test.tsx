import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ElectricalBatchActionBar from '@/pages/electrical/ElectricalBatchActionBar';

function buttonByText(text: RegExp) {
  return screen.getAllByRole('button').find((button) => text.test(button.textContent ?? ''));
}

function makeProps(
  overrides: Partial<Parameters<typeof ElectricalBatchActionBar>[0]> = {},
) {
  return {
    canMutate: true,
    variantName: 'Основное ЭР',
    typeControls: null,
    isJobActive: false,
    selectedManualCableCount: 0,
    selectedValidObjectsCount: 2,
    selectedHeatLossFailedCount: 0,
    manualCableCount: 0,
    overwriteManualChoices: false,
    selectedRecalcDisabled: false,
    selectedRecalcTooltip: 'Можно пересчитать',
    selectedRecalcCountLabel: '2',
    batchPending: false,
    validObjectsCount: 5,
    cableTypeForRecalculation: 'self_regulating' as const,
    activeJobId: null,
    cancelJobPending: false,
    currentTableViewActive: false,
    renderManualOverwriteControl: vi.fn((manualCount: number) => (
      <label>
        overwrite {manualCount}
        <input type="checkbox" aria-label="Перезаписать ручные выборы" />
      </label>
    )),
    onManualOverwritePromptOpen: vi.fn(),
    onRecalculateSelected: vi.fn(),
    onRecalculateAll: vi.fn(),
    onCancelJob: vi.fn(),
    onOpenColumnSettings: vi.fn(),
    onResetFilters: vi.fn(),
    ...overrides,
  } satisfies Parameters<typeof ElectricalBatchActionBar>[0];
}

describe('ElectricalBatchActionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render lifecycle tabs, copy controls or a cable-type select inside the action bar', () => {
    const props = makeProps();

    render(<ElectricalBatchActionBar {...props} />);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Создать на основании')).not.toBeInTheDocument();
    expect(screen.queryByText('Тип для пересчёта:')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Тип кабеля для пересчёта')).not.toBeInTheDocument();
    expect(props.onRecalculateSelected).not.toHaveBeenCalled();
    expect(props.onRecalculateAll).not.toHaveBeenCalled();
  });

  it('uses skipManual=true for selected recalculation when no manual choices are selected', () => {
    const props = makeProps({
      selectedManualCableCount: 0,
      overwriteManualChoices: false,
    });

    render(<ElectricalBatchActionBar {...props} />);

    fireEvent.click(buttonByText(/Пересчитать выбранные \(2\)/)!);

    expect(props.onRecalculateSelected).toHaveBeenCalledWith(true);
    expect(props.onManualOverwritePromptOpen).not.toHaveBeenCalled();
  });

  it('confirms manual overwrite state for selected recalculation', async () => {
    const props = makeProps({
      selectedManualCableCount: 2,
      overwriteManualChoices: true,
    });

    render(<ElectricalBatchActionBar {...props} />);

    fireEvent.click(buttonByText(/Пересчитать выбранные \(2\)/)!);
    const popup = await screen.findByText('Пересчитать выбранные объекты?');
    fireEvent.click(within(popup.closest('.ant-popover') as HTMLElement).getByRole('button', { name: 'Пересчитать' }));

    expect(props.onManualOverwritePromptOpen).toHaveBeenCalledTimes(1);
    expect(props.renderManualOverwriteControl).toHaveBeenCalledWith(2);
    expect(props.onRecalculateSelected).toHaveBeenCalledWith(false);
  });

  it('confirms skipManual=false for all recalculation when overwrite is enabled', async () => {
    const props = makeProps({
      manualCableCount: 3,
      overwriteManualChoices: true,
    });

    render(<ElectricalBatchActionBar {...props} />);

    fireEvent.click(buttonByText(/Пересчитать все · Основное ЭР/)!);
    const popup = await screen.findByText('Пересчитать все объекты «Основное ЭР»?');
    fireEvent.click(within(popup.closest('.ant-popover') as HTMLElement).getByRole('button', { name: 'Да, пересчитать все' }));

    expect(props.onManualOverwritePromptOpen).toHaveBeenCalledTimes(1);
    expect(props.renderManualOverwriteControl).toHaveBeenCalledWith(3);
    expect(props.onRecalculateAll).toHaveBeenCalledWith(false);
  });

  it('renders active job cancel action and routes it to cancel callback', () => {
    const props = makeProps({
      activeJobId: 'job-1',
      isJobActive: true,
    });

    render(<ElectricalBatchActionBar {...props} />);

    fireEvent.click(buttonByText(/Отменить/)!);

    expect(props.onCancelJob).toHaveBeenCalledTimes(1);
  });

  it('keeps table settings available while project mutations are read-only', () => {
    const props = makeProps({
      canMutate: false,
      activeJobId: 'job-1',
      isJobActive: true,
      currentTableViewActive: true,
    });

    render(<ElectricalBatchActionBar {...props} />);

    expect(buttonByText(/Пересчитать выбранные/)).toBeDisabled();
    expect(buttonByText(/Пересчитать все/)).toBeDisabled();
    expect(buttonByText(/Отменить/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Настройки' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сбросить фильтры таблицы' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры таблицы' }));

    expect(props.onOpenColumnSettings).toHaveBeenCalledTimes(1);
    expect(props.onResetFilters).toHaveBeenCalledTimes(1);
    expect(props.onRecalculateSelected).not.toHaveBeenCalled();
    expect(props.onRecalculateAll).not.toHaveBeenCalled();
    expect(props.onCancelJob).not.toHaveBeenCalled();
  });
});
