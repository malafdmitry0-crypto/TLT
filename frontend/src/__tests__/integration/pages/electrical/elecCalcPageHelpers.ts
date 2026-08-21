/**
 * AF9-TEST-HARNESS-01 — shared user interactions for Electrical integration.
 */
import { waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';

export async function openElectricalTableSettingsOtherTab(
  user: { click: (element: Element) => Promise<unknown> },
  dialog: HTMLElement,
) {
  const otherTab = within(dialog).getByRole('tab', { name: 'Остальное' });
  await user.click(otherTab);
  await waitFor(() => {
    expect(otherTab).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByText('Размер текста таблицы')).toBeInTheDocument();
  });
}
