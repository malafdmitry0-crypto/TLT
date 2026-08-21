import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ElecCalcParamsPanel from '@/pages/electrical/ElecCalcParamsPanel';

describe('ElecCalcParamsPanel — Case 1 TT inputs', () => {
  it('shows object-source guidance without a U control and without legacy T2/T3/R', async () => {
    const setRecalc = {
      connectionType: vi.fn(),
      heatingHeight: vi.fn(),
      layingStep: vi.fn(),
      supplyVoltage: vi.fn(),
      windingCoefficient: vi.fn(),
    };

    render(
      <ElecCalcParamsPanel
        cableType="self_regulating_tt"
        cableTypeOptions={[{ label: 'Самрег', value: 'self_regulating_tt' }]}
        onCableTypeChange={vi.fn()}
        recalc={{
          connectionType: 'line_1ph',
          heatingHeight: 2.5,
          layingStep: 0.2,
          supplyVoltage: 230,
          windingCoefficient: 1,
        }}
        setRecalc={setRecalc}
      />,
    );

    expect(screen.queryByLabelText('Напряжение питания')).not.toBeInTheDocument();
    expect(screen.queryByText(/Напряжение питания U, В/)).not.toBeInTheDocument();

    const height = screen.getByLabelText('Высота обогрева резервуара');
    await userEvent.clear(height);
    await userEvent.type(height, '3');
    expect(setRecalc.heatingHeight).toHaveBeenLastCalledWith(3);
    expect(setRecalc.supplyVoltage).not.toHaveBeenCalled();

    expect(screen.getByText(/Tокр, Tпрод и коэффициент запаса K/)).toHaveTextContent(
      'берутся из исходных данных Heat каждого объекта',
    );
    expect(screen.getByText(/Технический минимум/)).toBeInTheDocument();
    expect(screen.getByText(/Шаг навива и количество ниток задаются для каждой трубы/))
      .toBeInTheDocument();
    expect(screen.getByLabelText('Высота обогрева резервуара'))
      .toHaveAttribute('aria-valuemin', '0.001');
    expect(screen.getByText(/Марка кабеля — авторасчёт или ручной выбор/)).toBeInTheDocument();
    expect(screen.queryByLabelText('T пропарки')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('T3 поддержания')).not.toBeInTheDocument();
    expect(screen.queryByText('агрессивная (-СР)')).not.toBeInTheDocument();
  });
});
