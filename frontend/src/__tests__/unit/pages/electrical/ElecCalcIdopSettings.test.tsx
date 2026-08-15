import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ElecCalcIdopSettings } from '@/pages/electrical/ElecCalcIdopSettings';
import type { ProjectElectricalSettingsController } from '@/pages/electrical/useProjectElectricalSettings';

function makeSettings(
  overrides: Partial<ProjectElectricalSettingsController> = {},
): ProjectElectricalSettingsController {
  return {
    settings: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    savedIdop: null,
    draftIdop: null,
    savedMode: 'auto',
    draftMode: 'auto',
    onModeChange: vi.fn(),
    onDraftChange: vi.fn(),
    save: vi.fn(),
    saving: false,
    isDirty: false,
    validationError: null,
    canSave: false,
    calculationBlockedReason: null,
    canMutate: true,
    nominalVoltage: 230,
    ...overrides,
  } as ProjectElectricalSettingsController;
}

describe('ElecCalcIdopSettings', () => {
  it('does not present automatic mode as saved while settings are loading', () => {
    render(
      <ElecCalcIdopSettings
        settings={makeSettings({ isLoading: true })}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Загрузка настроек I доп');
    expect(screen.queryByTestId('elec-idop-input')).not.toBeInTheDocument();
    expect(screen.queryByText(/I доп = Lмакс × Iст\.уд/)).not.toBeInTheDocument();
  });

  it('shows catalog calculation as an editable empty default without mode buttons', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    const onDraftChange = vi.fn();
    render(
      <ElecCalcIdopSettings
        settings={makeSettings({ onModeChange, onDraftChange })}
      />,
    );

    expect(screen.getByTestId('elec-idop-settings')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Автоматически по каталогу' }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Вручную' })).not.toBeInTheDocument();
    expect(screen.getByText(/I доп = Lмакс × Iст\.уд/))
      .toHaveClass('elec-idop-settings__sr-only');
    expect(screen.queryByRole('button', { name: 'Как определяется I доп проекта' }))
      .not.toBeInTheDocument();
    expect(screen.getByText('I доп проекта — допустимый стартовый ток одной секции, А'))
      .toHaveAttribute('data-field-help', expect.stringMatching(/По каталогу для каждого объекта/));
    const input = screen.getByRole('spinbutton', {
      name: 'I доп проекта — допустимый стартовый ток одной секции, А',
    });
    expect(input).toHaveDisplayValue('');
    expect(input).toHaveAttribute('placeholder', 'По каталогу');
    expect(input).not.toHaveAttribute('aria-required');
    expect(screen.getByRole('button', { name: 'Сохранить I доп' })).toBeDisabled();

    await user.type(input, '13');
    expect(onDraftChange).toHaveBeenLastCalledWith(13);
    expect(onModeChange).toHaveBeenCalledWith('manual');
  });

  it('shows a numeric override and clearing it restores catalog calculation', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const onModeChange = vi.fn();
    const save = vi.fn();
    render(
      <ElecCalcIdopSettings
        settings={makeSettings({
          savedIdop: 13,
          draftIdop: 13,
          savedMode: 'manual',
          draftMode: 'manual',
          isDirty: true,
          validationError: null,
          canSave: true,
          onDraftChange,
          onModeChange,
          save,
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Вручную' })).not.toBeInTheDocument();
    expect(screen.queryByText(/I доп = Lмакс × Iст\.уд/)).not.toBeInTheDocument();
    const input = screen.getByRole('spinbutton', {
      name: 'I доп проекта — допустимый стартовый ток одной секции, А',
    });
    expect(input).toHaveDisplayValue('13');
    expect(screen.getByText('I доп проекта — допустимый стартовый ток одной секции, А'))
      .toHaveAttribute('data-field-help', expect.stringMatching(/Очистите поле и сохраните/));
    await user.clear(input);
    expect(onDraftChange).toHaveBeenLastCalledWith(null);
    expect(onModeChange).toHaveBeenCalledWith('auto');
    const saveBtn = screen.getByTestId('elec-idop-save');
    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);
    expect(save).toHaveBeenCalled();
  });

  it('keeps the settings load error and retry action', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();

    render(
      <ElecCalcIdopSettings
        settings={makeSettings({ isError: true, refetch })}
      />,
    );

    expect(screen.getByText('Не удалось загрузить электрические настройки')).toBeInTheDocument();
    expect(screen.queryByTestId('elec-idop-input')).not.toBeInTheDocument();
    expect(screen.queryByText(/I доп = Lмакс × Iст\.уд/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('keeps the input and save action visible but disabled when view-only', () => {
    render(
      <ElecCalcIdopSettings
        settings={makeSettings({ canMutate: false })}
      />,
    );
    expect(screen.getByTestId('elec-idop-save')).toBeDisabled();
    expect(screen.getByTestId('elec-idop-save'))
      .toHaveAttribute('title', expect.stringMatching(/Только владелец проекта/));
    expect(screen.getByTestId('elec-idop-input')).toBeDisabled();
  });
});
