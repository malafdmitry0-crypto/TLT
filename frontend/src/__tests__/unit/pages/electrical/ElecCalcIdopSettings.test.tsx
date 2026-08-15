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
    expect(screen.queryByRole('button', { name: 'Автоматически по каталогу' }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/I доп = Lмакс × Iст\.уд/)).not.toBeInTheDocument();
  });

  it('shows null settings as the default automatic catalog mode', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(<ElecCalcIdopSettings settings={makeSettings({ onModeChange })} />);

    expect(screen.getByTestId('elec-idop-settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Автоматически по каталогу' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Вручную' }))
      .toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/I доп = Lмакс × Iст\.уд/)).toBeInTheDocument();
    expect(screen.getByText(/для каждого объекта по выбранной строке каталога/)).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить I доп' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Вручную' }));
    expect(onModeChange).toHaveBeenCalledWith('manual');
  });

  it('shows a required numeric override and enables save in manual mode', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
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
          save,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Вручную' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/I доп = Lмакс × Iст\.уд/)).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', {
      name: 'I доп проекта — допустимый стартовый ток одной секции, А',
    })).toHaveAttribute('aria-required', 'true');
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
    expect(screen.queryByRole('button', { name: 'Автоматически по каталогу' }))
      .not.toBeInTheDocument();
    expect(screen.queryByText(/I доп = Lмакс × Iст\.уд/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('does not show save when view-only', () => {
    render(
      <ElecCalcIdopSettings
        settings={makeSettings({ canMutate: false })}
      />,
    );
    expect(screen.queryByTestId('elec-idop-save')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Автоматически по каталогу' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Вручную' })).toBeDisabled();
  });
});
