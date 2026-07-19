import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ReportWizard from '@/components/reports/ReportWizard';
import { REPORT_SECTIONS } from '@/api/reports';

describe('ReportWizard', () => {
  it('returns the exact selected electrical variant UUID', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ReportWizard
        open
        initialSections={[...REPORT_SECTIONS]}
        initialVariantId="11111111-1111-4111-8111-111111111111"
        variantOptions={[
          {
            label: 'Основное решение',
            value: '11111111-1111-4111-8111-111111111111',
          },
          {
            label: 'Зимний режим',
            value: '33333333-3333-4333-8333-333333333333',
          },
          {
            label: 'ЭР5',
            value: '55555555-5555-4555-8555-555555555555',
            disabled: true,
          },
        ]}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByText('Зимний режим'));
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(onConfirm).toHaveBeenCalledWith(
      [...REPORT_SECTIONS],
      '33333333-3333-4333-8333-333333333333',
    );
  });
});
