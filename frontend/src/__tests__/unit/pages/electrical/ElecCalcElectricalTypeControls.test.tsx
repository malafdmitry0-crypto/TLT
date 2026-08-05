import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ElecCalcElectricalTypeControls from '@/pages/electrical/ElecCalcElectricalTypeControls';

function setup(overrides: Partial<Parameters<typeof ElecCalcElectricalTypeControls>[0]> = {}) {
  const setRecalc = {
    aggressiveProduct: vi.fn(),
    connectionType: vi.fn(),
    heatingHeight: vi.fn(),
    layingStep: vi.fn(),
    maintainTemperature: vi.fn(),
    supplyVoltage: vi.fn(),
    vaporTemperature: vi.fn(),
    windingCoefficient: vi.fn(),
  };
  return {
    setRecalc,
    ...render(
      <ElecCalcElectricalTypeControls
        cableType="self_regulating_tt"
        recalc={{
          aggressiveProduct: undefined,
          connectionType: 'line_1ph',
          heatingHeight: null,
          layingStep: undefined,
          maintainTemperature: 80,
          supplyVoltage: 230,
          vaporTemperature: 120,
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

  it('renders TT overrides without voltage and keeps undefined R distinct from explicit false', async () => {
    const { setRecalc } = setup();

    expect(screen.getByLabelText('T пропарки')).toBeInTheDocument();
    expect(screen.getByLabelText('T3 поддержания')).toBeInTheDocument();
    expect(screen.queryByLabelText('Напряжение питания')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Высота обогрева резервуара')).toBeInTheDocument();
    expect(screen.getByLabelText('Шаг укладки резервуара')).toHaveValue('');

    const aggressive = screen.getByRole('checkbox', { name: 'агр.' });
    expect(aggressive).toHaveAttribute('aria-checked', 'mixed');
    await userEvent.click(aggressive);
    expect(setRecalc.aggressiveProduct).toHaveBeenCalledWith(true);
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
