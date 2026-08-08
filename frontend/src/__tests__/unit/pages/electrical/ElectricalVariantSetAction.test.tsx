import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { startElectricalVariantSetTask } from '@/api/electricalVariantSetTasks';
import { ElectricalVariantSetAction } from '@/pages/electrical/ElectricalVariantSetAction';
import type { ElectricalVariant } from '@/types/electricalVariant';

vi.mock('@/api/electricalVariantSetTasks', () => ({
  startElectricalVariantSetTask: vi.fn(),
}));

const variants: ElectricalVariant[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    project_id: 'project-1',
    name: 'ЭР1',
    sort_order: 0,
    is_active: true,
    copied_from_id: null,
    legacy_variant_number: 1,
    specification_state: 'not_generated',
    created_at: '2026-08-08T00:00:00Z',
    updated_at: '2026-08-08T00:00:00Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    project_id: 'project-1',
    name: 'ЭР2',
    sort_order: 1,
    is_active: false,
    copied_from_id: null,
    legacy_variant_number: 2,
    specification_state: 'not_generated',
    created_at: '2026-08-08T00:00:00Z',
    updated_at: '2026-08-08T00:00:00Z',
  },
];

describe('ElectricalVariantSetAction', () => {
  it('submits only explicitly checked ER UUIDs in selection order', async () => {
    const user = userEvent.setup();
    vi.mocked(startElectricalVariantSetTask).mockResolvedValue({
      id: 'task-1',
      project_id: 'project-1',
      status: 'queued',
      stage: 'queued',
      task_version: 1,
      electrical_variant_ids: [variants[1].id, variants[0].id],
      progress: { current: 0, total: 2, percent: 0 },
      queue_deadline_at: null,
      execution_deadline_at: null,
      result: {
        requested_electrical_variant_ids: [variants[1].id, variants[0].id],
        completed_electrical_variant_ids: [],
        failed_electrical_variant_ids: [],
        per_variant: {},
      },
      error_message: null,
      cancel_requested: false,
      created_at: '2026-08-08T00:00:00Z',
      started_at: null,
      finished_at: null,
      status_url: '/task-1',
      cancel_url: '/task-1/cancel',
      retry_url: '/task-1/retry',
    });
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ElectricalVariantSetAction
          projectId="project-1"
          variants={variants}
          canMutate
          disabled={false}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Пересчитать выбранные ЭР (0)' }));
    const dialog = screen.getByRole('dialog', { name: 'Явный выбор ЭР для пересчёта' });
    const submit = within(dialog).getByRole('button', { name: 'Пересчитать выбранные ЭР (0)' });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByRole('checkbox', { name: 'ЭР1' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'ЭР2' })).not.toBeChecked();

    await user.click(within(dialog).getByRole('checkbox', { name: 'ЭР2' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'ЭР1' }));
    expect(within(dialog).getByText('Подтвердите точный scope: ЭР2, ЭР1.')).toBeInTheDocument();
    const confirmedSubmit = within(dialog).getByRole('button', {
      name: 'Пересчитать выбранные ЭР (2)',
    });
    fireEvent.click(confirmedSubmit);
    fireEvent.click(confirmedSubmit);

    await waitFor(() => expect(startElectricalVariantSetTask).toHaveBeenCalledWith(
      'project-1',
      [variants[1].id, variants[0].id],
    ));
    expect(startElectricalVariantSetTask).toHaveBeenCalledTimes(1);
  });
});
