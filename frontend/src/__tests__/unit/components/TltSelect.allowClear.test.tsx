import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TltSelect } from '@/components/ui-kit';

describe('TltSelect allowClear (B3)', () => {
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
