import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ColumnFilterDropdown from '@/pages/heatcalc/HeatCalcColumnFilterDropdown';

describe('HeatCalcColumnFilterDropdown', () => {
  it('применяет текстовый фильтр по Enter и закрывает dropdown', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <ColumnFilterDropdown
        title="Наименование"
        kind="text"
        enumOptions={[]}
        onApply={onApply}
        onReset={vi.fn()}
        onClose={onClose}
      />,
    );

    const input = screen.getByLabelText('Поиск: Наименование');
    fireEvent.change(input, { target: { value: '  P01  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onApply).toHaveBeenCalledWith({ kind: 'text', value: 'P01' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('не применяет некорректный числовой диапазон', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <ColumnFilterDropdown
        title="Температура"
        kind="numberRange"
        enumOptions={[]}
        onApply={onApply}
        onReset={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText('Минимум: Температура'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Максимум: Температура'), { target: { value: '10' } });

    expect(screen.getByText('Минимум больше максимума')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('сбрасывает числовой фильтр и закрывает dropdown', () => {
    const onReset = vi.fn();
    const onClose = vi.fn();

    render(
      <ColumnFilterDropdown
        title="Температура"
        kind="numberRange"
        filter={{ kind: 'numberRange', min: 10, max: 90, includeEmpty: true }}
        enumOptions={[]}
        onApply={vi.fn()}
        onReset={onReset}
        onClose={onClose}
      />,
    );

    expect(screen.getByLabelText('Минимум: Температура')).toHaveValue('10');
    expect(screen.getByLabelText('Максимум: Температура')).toHaveValue('90');
    expect(screen.getByLabelText('Пустые')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
