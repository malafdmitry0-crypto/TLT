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
    variant: 1,
    cableTypeControlLabel: 'Тип для пересчёта:',
    cableTypeOptions: [{ value: 'self_regulating' as const, label: 'Саморегулирующийся' }],
    visibleCableTypeControl: 'self_regulating' as const,
    typeControls: null,
    commercialFeaturesAvailable: true,
    copyVariantMenuItems: [{ key: '2', label: 'Скопировать СО1 в СО2' }],
    copyVariantPending: false,
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
    onVariantChange: vi.fn(),
    onCopyVariant: vi.fn(),
    onCableTypeChange: vi.fn(),
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

  it('routes calculation variant button clicks without touching batch handlers', () => {
    const props = makeProps();

    render(<ElectricalBatchActionBar {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'СО3' }));

    expect(props.onVariantChange).toHaveBeenCalledWith(3);
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

    fireEvent.click(buttonByText(/Пересчитать все СО1/)!);
    const popup = await screen.findByText('Пересчитать все объекты СО1?');
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
});
