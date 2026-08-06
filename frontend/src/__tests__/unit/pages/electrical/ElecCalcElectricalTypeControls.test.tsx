import { render, screen } from '@testing-library/react';
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

  it('renders nothing for self-regulating: U is a constant with no control', () => {
    const { container, setRecalc } = setup({ cableType: 'self_regulating' });

    expect(container).toBeEmptyDOMElement();
    expect(setRecalc.supplyVoltage).not.toHaveBeenCalled();
  });

  it('renders no shared controls for TT because tank layout belongs to an object in an ER', () => {
    const { container, setRecalc } = setup();

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText('Высота обогрева резервуара')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Шаг укладки резервуара')).not.toBeInTheDocument();
    expect(setRecalc.heatingHeight).not.toHaveBeenCalled();
    expect(setRecalc.layingStep).not.toHaveBeenCalled();
    expect(setRecalc.supplyVoltage).not.toHaveBeenCalled();
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
    expect(screen.queryByText('U:')).not.toBeInTheDocument();
    expect(screen.getByText('w:')).toBeInTheDocument();
    expect(screen.getByText('h:')).toBeInTheDocument();
    expect(screen.getByText('шаг:')).toBeInTheDocument();
    // block wrapper layout is owner CSS, not inline style
    expect(container.firstElementChild).toHaveClass('electrical-type-controls');
  });
});
