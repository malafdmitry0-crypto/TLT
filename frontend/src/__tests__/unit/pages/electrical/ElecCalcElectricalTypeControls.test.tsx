import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ElecCalcElectricalTypeControls from '@/pages/electrical/ElecCalcElectricalTypeControls';

function setup(overrides: Partial<Parameters<typeof ElecCalcElectricalTypeControls>[0]> = {}) {
  const setRecalc = {
    connectionType: vi.fn(),
    heatingHeight: vi.fn(),
    layingStep: vi.fn(),
    supplyVoltage: vi.fn(),
    windingCoefficient: vi.fn(),
  };
  return {
    setRecalc,
    ...render(
      <ElecCalcElectricalTypeControls
        cableType="self_regulating_tt"
        recalc={{
          connectionType: 'line_1ph',
          heatingHeight: null,
          layingStep: undefined,
          supplyVoltage: 230,
          windingCoefficient: 1,
        }}
        setRecalc={setRecalc}
        {...overrides}
      />,
    ),
  };
}

describe('ElecCalcElectricalTypeControls', () => {
  it('does not render controls for absent cable type', () => {
    const empty = setup({ cableType: null });
    expect(empty.container).toBeEmptyDOMElement();
  });

  it('renders supply voltage as read-only 230 for self-regulating (E1 / FE-28)', () => {
    const { setRecalc } = setup({ cableType: 'self_regulating' });

    const voltage = screen.getByLabelText('Напряжение питания');
    expect(voltage).toBeInTheDocument();
    expect(screen.getByText('U, В:')).toBeInTheDocument();
    expect(voltage).toBeDisabled();
    expect(setRecalc.supplyVoltage).not.toHaveBeenCalled();
  });

  it('renders editable downstream voltage and tank layout without legacy T2/T3/R controls', async () => {
    const { setRecalc } = setup();

    const voltage = screen.getByLabelText('Напряжение питания');
    expect(voltage).toBeEnabled();
    expect(voltage).toHaveValue('230');
    expect(screen.queryByLabelText('T пропарки')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('T3 поддержания')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'агр.' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Высота обогрева резервуара')).toBeInTheDocument();
    expect(screen.getByLabelText('Шаг укладки резервуара')).toHaveValue('');

    await userEvent.clear(voltage);
    await userEvent.type(voltage, '380');
    expect(setRecalc.supplyVoltage).toHaveBeenLastCalledWith(380);
  });

  it('renders resistive controls and preserves block wrapper', () => {
    const { container } = setup({
      cableType: 'three_core',
      block: true,
    });

    // Ant Select: aria-label on root + combobox; assert via root text content
    const connection = screen.getAllByLabelText('Схема подключения')[0];
    expect(connection).toBeInTheDocument();
    expect(connection).toHaveTextContent('Линия');
    expect(screen.getByText('U:')).toBeInTheDocument();
    expect(screen.getByText('w:')).toBeInTheDocument();
    expect(screen.getByText('h:')).toBeInTheDocument();
    expect(screen.getByText('шаг:')).toBeInTheDocument();
    // block wrapper layout is owner CSS, not inline style
    expect(container.firstElementChild).toHaveClass('electrical-type-controls');
  });
});
