import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ElectricalColumnFilterDropdown from '@/components/electrical/ElectricalColumnFilterDropdown';

describe('ElectricalColumnFilterDropdown', () => {
  it('applies text filters exactly as typed and closes the dropdown', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <ElectricalColumnFilterDropdown
        title="Марка"
        kind="text"
        onApply={onApply}
        onReset={vi.fn()}
        onClose={onClose}
      />,
    );

    const input = screen.getByLabelText('Поиск: Марка');
    fireEvent.change(input, { target: { value: '  ТЛТ-60  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onApply).toHaveBeenCalledWith({ kind: 'text', value: '  ТЛТ-60  ' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps initial numeric range values and include-empty flag', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <ElectricalColumnFilterDropdown
        title="Ток"
        kind="numberRange"
        filter={{ kind: 'numberRange', min: 10, max: 90, includeEmpty: true }}
        onApply={onApply}
        onReset={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(screen.getByLabelText('Минимум: Ток')).toHaveValue('10');
    expect(screen.getByLabelText('Максимум: Ток')).toHaveValue('90');
    expect(screen.getByLabelText('Пустые')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onApply).toHaveBeenCalledWith({
      kind: 'numberRange',
      min: 10,
      max: 90,
      includeEmpty: true,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables apply for an invalid numeric range', () => {
    const onApply = vi.fn();

    render(
      <ElectricalColumnFilterDropdown
        title="Ток"
        kind="numberRange"
        filter={{ kind: 'numberRange', min: 90, max: 10 }}
        onApply={onApply}
        onReset={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Применить' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('resets the active filter and closes the dropdown', () => {
    const onReset = vi.fn();
    const onClose = vi.fn();

    render(
      <ElectricalColumnFilterDropdown
        title="Статус"
        kind="enum"
        filter={{ kind: 'enum', values: ['success'], includeEmpty: true }}
        onApply={vi.fn()}
        onReset={onReset}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
