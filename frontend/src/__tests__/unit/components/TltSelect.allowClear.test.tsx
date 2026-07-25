import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TltSelect } from '@/components/ui-kit';

describe('TltSelect allowClear (B3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens portal with stable Tlt popup classes without popupClassName deprecation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const noise: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      noise.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      noise.push(args.map(String).join(' '));
    });

    render(
      <TltSelect
        data-testid="scheme-select"
        allowClear
        value="loop"
        onChange={onChange}
        popoverClassName="custom-popover-root"
        listBoxClassName="custom-listbox-root"
        options={[
          { value: 'line', label: 'Линия' },
          { value: 'loop', label: 'Петля' },
        ]}
        placeholder="Выберите схему"
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Выберите схему' }));
    const option = await screen.findByText('Линия');
    const popup = option.closest('.ant-select-dropdown') ?? document.body;
    expect(String(popup.className)).toMatch(/tlt-select__popover/);
    expect(String(popup.className)).toMatch(/tlt-select__listbox/);
    expect(String(popup.className)).toMatch(/custom-popover-root/);
    expect(String(popup.className)).toMatch(/custom-listbox-root/);
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith('line');
    expect(noise.some((line) => line.includes('popupClassName'))).toBe(false);
  });

  it('clears the value via dedicated control when allowClear is enabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TltSelect
        data-testid="scheme-select"
        allowClear
        value="loop"
        onChange={onChange}
        options={[
          { value: 'line', label: 'Линия' },
          { value: 'loop', label: 'Петля' },
        ]}
        placeholder="Выберите схему"
      />,
    );

    await user.click(screen.getByTestId('scheme-select-clear'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not render clear control when empty or allowClear is off', () => {
    const { rerender } = render(
      <TltSelect
        data-testid="scheme-select"
        allowClear
        value={null}
        options={[{ value: 'line', label: 'Линия' }]}
      />,
    );
    expect(screen.queryByTestId('scheme-select-clear')).not.toBeInTheDocument();

    rerender(
      <TltSelect
        data-testid="scheme-select"
        value="line"
        options={[{ value: 'line', label: 'Линия' }]}
      />,
    );
    expect(screen.queryByTestId('scheme-select-clear')).not.toBeInTheDocument();
  });
});
