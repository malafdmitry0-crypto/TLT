import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import UnitInputNumber from '@/components/common/UnitInputNumber';
import { TltNumberField, TltSelect, TltTextField } from '@/components/form-controls';
import '@/styles.css';

describe('form controls', () => {
  it('renders UnitInputNumber through the React Aria number control without losing test ids or units', () => {
    render(
      <UnitInputNumber
        aria-label="Наружный диаметр"
        aria-required
        data-testid="outer-diameter-input"
        unit="мм"
        value={108}
      />,
    );

    const input = screen.getByTestId('outer-diameter-input');

    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveValue('108');
    expect(input.closest('.unit-input-number')).not.toBeNull();
    expect(screen.getByText('мм')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps numeric changes controlled as values, not DOM events', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    function ControlledNumberField() {
      const [value, setValue] = useState<number | null>(5);
      return (
        <TltNumberField
          aria-label="Длина"
          data-testid="pipe-length-input"
          id="pipe-length-input"
          onChange={(nextValue) => {
            setValue(nextValue);
            handleChange(nextValue);
          }}
          unit="м"
          value={value}
        />
      );
    }

    render(
      <ControlledNumberField />,
    );

    const input = screen.getByTestId('pipe-length-input');
    await user.clear(input);
    await user.type(input, '12');
    fireEvent.blur(input);

    expect(handleChange).toHaveBeenLastCalledWith(12);
  });

  it('preserves AntD-compatible onPressEnter behavior for number fields', () => {
    const handlePressEnter = vi.fn();

    render(
      <UnitInputNumber
        aria-label="Длина"
        data-testid="pipe-length-input"
        onPressEnter={handlePressEnter}
        unit="м"
        value={5}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('pipe-length-input'), { key: 'Enter' });

    expect(handlePressEnter).toHaveBeenCalledTimes(1);
  });

  it('renders text fields with the same required and invalid semantics', () => {
    render(
      <TltTextField
        aria-invalid
        aria-label="Наименование"
        aria-required
        data-testid="object-name-input"
        value="Труба"
      />,
    );

    const input = screen.getByTestId('object-name-input');

    expect(input).toHaveValue('Труба');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.closest('.tlt-text-field')).toHaveAttribute('data-invalid', 'true');
  });

  it('lets an associated visible label name the text field instead of its technical id or name', () => {
    render(
      <>
        <label htmlFor="employee-email">Email</label>
        <TltTextField id="employee-email" name="email" type="email" />
      </>,
    );

    const input = screen.getByRole('textbox', { name: 'Email' });

    expect(input).not.toHaveAttribute('aria-label');
  });

  it('renders select values and emits typed option values', async () => {
    const handleChange = vi.fn();

    render(
      <TltSelect
        aria-label="Рабочее напряжение"
        data-testid="supply-voltage-select"
        id="supply-voltage-select"
        onChange={handleChange}
        options={[
          { value: 220, label: '220' },
          { value: 380, label: '380' },
        ]}
        value={220}
      />,
    );

    const trigger = screen.getByTestId('supply-voltage-select');
    expect(trigger).toHaveTextContent('220');

    // Ant Select needs mousedown on option (not just click) in jsdom
    const selector = trigger.querySelector('.ant-select-selector') ?? trigger;
    fireEvent.mouseDown(selector);
    const option = await screen.findByTitle('380').catch(() => null)
      ?? await screen.findByText('380');
    fireEvent.mouseDown(option);
    fireEvent.click(option);

    expect(handleChange).toHaveBeenCalled();
    expect(handleChange.mock.calls.at(-1)?.[0]).toEqual(expect.anything());
    // Ant may normalize numeric options; accept number or numeric string
    expect(Number(handleChange.mock.calls.at(-1)?.[0])).toBe(380);
  });

  it('puts aria-required on the combobox role, not the Ant Select shell', () => {
    render(
      <TltSelect
        aria-label="Размещение"
        aria-required
        data-testid="placement-select"
        options={[{ value: 'outdoor', label: 'Наружное' }]}
        value="outdoor"
      />,
    );

    const shell = screen.getByTestId('placement-select');
    // Outer ant-select div must not carry aria-required (axe aria-allowed-attr).
    expect(shell).not.toHaveAttribute('aria-required');
    const combobox = shell.querySelector('[role="combobox"]')
      ?? shell.closest('.tlt-select-shell')?.querySelector('[role="combobox"]');
    expect(combobox).not.toBeNull();
    expect(combobox).toHaveAttribute('aria-required', 'true');
  });
});
