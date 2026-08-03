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
    canMutate: true,
    nominalVoltage: 230,
    ...overrides,
  } as ProjectElectricalSettingsController;
}

describe('ElecCalcIdopSettings', () => {
  it('shows missing Iдоп banner and form when idop is not set', () => {
    render(<ElecCalcIdopSettings settings={makeSettings()} />);

    expect(screen.getByTestId('elec-idop-settings')).toBeInTheDocument();
    expect(screen.getByText('Iдоп не задан')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Задать Iдоп' })).toBeInTheDocument();
    expect(screen.getByTestId('elec-idop-input')).toBeInTheDocument();
    expect(screen.getByTestId('elec-idop-save')).toBeDisabled();
  });

  it('hides missing banner when Iдоп is saved and enables save when dirty', async () => {
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
          onDraftChange,
          save,
        })}
      />,
    );

    expect(screen.queryByText('Iдоп не задан')).not.toBeInTheDocument();
    const saveBtn = screen.getByTestId('elec-idop-save');
    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);
    expect(save).toHaveBeenCalled();
  });

  it('does not show save when view-only', () => {
    render(
      <ElecCalcIdopSettings
        settings={makeSettings({ canMutate: false, idopMissing: true })}
      />,
    );
    expect(screen.getByText('Iдоп не задан')).toBeInTheDocument();
    expect(screen.queryByTestId('elec-idop-save')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Задать Iдоп' })).not.toBeInTheDocument();
  });
});
