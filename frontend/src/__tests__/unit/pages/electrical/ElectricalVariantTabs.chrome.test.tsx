import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  controller,
  ER_1,
  ER_2,
  ER_2_ID,
  renderTabs,
} from './ElectricalVariantTabs.test-harness';

describe('ElectricalVariantTabs — chrome / navigation', () => {
  it('renders ER names; current tab is selected (no separate ★ active UX)', () => {
    renderTabs(controller());

    const tablist = screen.getByRole('tablist', { name: 'Варианты ЭР' });
    expect(screen.queryByText('Электротехнические решения')).not.toBeInTheDocument();
    const otherTab = within(tablist).getByRole('tab', { name: 'Рабочее решение' });
    const selectedTab = within(tablist).getByRole('tab', { name: /Альтернатива Ω/i });

    expect(otherTab).toHaveAttribute('aria-selected', 'false');
    expect(selectedTab).toHaveAttribute('aria-selected', 'true');
    expect(selectedTab).toHaveAttribute('id', `electrical-variant-tab-${ER_2_ID}`);
    expect(selectedTab).toHaveAttribute(
      'aria-controls',
      `electrical-variant-panel-${ER_2_ID}`,
    );
    expect(selectedTab).toHaveAttribute('title', ER_2.name);
    expect(screen.queryByText('Активный')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Сделать.*активным/i })).not.toBeInTheDocument();
  });

  it('supports keyboard tab navigation via selectAndActivate', () => {
    const model = controller({ selectedVariant: ER_1 });
    renderTabs(model, true);
    const tabs = screen.getAllByRole('tab');

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(model.selectAndActivateVariant).toHaveBeenCalledWith(ER_2_ID);
    expect(tabs[1]).toHaveFocus();
  });

  it('keeps the selected ER visible inside a horizontally scrollable tablist', () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      renderTabs(controller());

      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        inline: 'nearest',
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('allows the full backend contract of 128 characters for an ER name', async () => {
    const user = userEvent.setup();
    const model = controller();
    renderTabs(model);

    await user.click(screen.getByRole('button', { name: /Переименовать.*Альтернатива Ω/i }));
    const input = screen.getByRole('textbox', { name: /Новое название ЭР/i });
    const contractName = 'Я'.repeat(128);
    await user.clear(input);
    await user.type(input, `${contractName}{Enter}`);

    await waitFor(() => {
      expect(model.renameVariant).toHaveBeenCalledWith(ER_2_ID, contractName);
    });
  });

});
