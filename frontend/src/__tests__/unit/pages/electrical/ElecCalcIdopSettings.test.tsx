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
    onDraftChange: vi.fn(),
    save: vi.fn(),
    saving: false,
    idopMissing: true,
    isDirty: false,
    validationError: 'Укажите I доп проекта',
    canSave: false,
    calculationBlockedReason: 'Сначала укажите и сохраните I доп проекта',
    canMutate: true,
    nominalVoltage: 230,
    ...overrides,
  } as ProjectElectricalSettingsController;
}

describe('ElecCalcIdopSettings', () => {
  it('marks I доп as required and explains a missing value', () => {
    render(<ElecCalcIdopSettings settings={makeSettings()} />);

    expect(screen.getByTestId('elec-idop-settings')).toBeInTheDocument();
    expect(screen.getByTestId('elec-idop-settings')).not.toHaveTextContent('*');
    expect(screen.queryByText('Не задан I доп проекта')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Задать I доп проекта' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', {
      name: 'I доп проекта — допустимый стартовый ток одной секции, А',
    })).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('spinbutton', {
      name: 'I доп проекта — допустимый стартовый ток одной секции, А',
    })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Сохранить I доп' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Укажите I доп проекта');
    expect(screen.getByTestId('elec-idop-save')).toBeDisabled();
  });

  it('enables save when I доп is dirty', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const save = vi.fn();
    render(
      <ElecCalcIdopSettings
        settings={makeSettings({
          idopMissing: false,
          savedIdop: 13,
          draftIdop: 13,
          isDirty: true,
          validationError: null,
          canSave: true,
          onDraftChange,
          save,
        })}
      />,
    );

    expect(screen.queryByText('Не задан I доп проекта')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('does not show save when view-only', () => {
    render(
      <ElecCalcIdopSettings
        settings={makeSettings({ canMutate: false, idopMissing: true })}
      />,
    );
    expect(screen.queryByText('Не задан I доп проекта')).not.toBeInTheDocument();
    expect(screen.queryByTestId('elec-idop-save')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Задать I доп проекта' })).not.toBeInTheDocument();
  });
});
