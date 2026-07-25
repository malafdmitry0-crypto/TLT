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
          aggressiveProduct: false,
          connectionType: 'line_1ph',
          heatingHeight: null,
          layingStep: 0.1,
          maintainTemperature: 80,
          supplyVoltage: 220,
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

  it('renders supply voltage control for self-regulating (ТЛТ)', async () => {
    const { setRecalc } = setup({ cableType: 'self_regulating' });

    const voltage = screen.getByLabelText('Напряжение питания');
    expect(voltage).toBeInTheDocument();
    expect(screen.getByText('U, В:')).toBeInTheDocument();

    await userEvent.type(voltage, '0');
    expect(setRecalc.supplyVoltage).toHaveBeenCalled();
  });

  it('renders TT controls (incl. supply voltage) and keeps aggressive flag callback', async () => {
    const { setRecalc } = setup();

    expect(screen.getByLabelText('T пропарки')).toBeInTheDocument();
    expect(screen.getByLabelText('T3 поддержания')).toBeInTheDocument();
    expect(screen.getByLabelText('Напряжение питания')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'агр.' }));
    expect(setRecalc.aggressiveProduct).toHaveBeenCalledWith(true);
  });

  it('renders resistive controls and preserves block wrapper', () => {
    const { container } = setup({
      cableType: 'three_core',
      block: true,
    });

    expect(screen.getByLabelText('Схема подключения')).toBeInTheDocument();
    expect(screen.getByLabelText('Схема подключения')).toHaveTextContent('Линия');
    expect(screen.getByText('U:')).toBeInTheDocument();
    expect(screen.getByText('w:')).toBeInTheDocument();
    expect(screen.getByText('h:')).toBeInTheDocument();
    expect(screen.getByText('шаг:')).toBeInTheDocument();
    // block wrapper layout is owner CSS, not inline style
    expect(container.firstElementChild).toHaveClass('electrical-type-controls');
  });
});
