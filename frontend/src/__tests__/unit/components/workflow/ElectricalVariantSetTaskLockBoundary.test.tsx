import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ElectricalVariantSetTaskLockBoundary } from '@/components/workflow/ElectricalVariantSetTaskLockBoundary';

describe('ElectricalVariantSetTaskLockBoundary', () => {
  it('uses native inert while the server-authoritative workflow lock is active', () => {
    const view = render(
      <ElectricalVariantSetTaskLockBoundary locked>
        <button type="button">Изменить</button>
      </ElectricalVariantSetTaskLockBoundary>,
    );
    const boundary = screen.getByRole('button', { name: 'Изменить', hidden: true }).parentElement!;

    expect(boundary.inert).toBe(true);
    expect(boundary).toHaveAttribute('aria-disabled', 'true');

    view.rerender(
      <ElectricalVariantSetTaskLockBoundary locked={false}>
        <button type="button">Изменить</button>
      </ElectricalVariantSetTaskLockBoundary>,
    );
    expect(boundary.inert).toBe(false);
    expect(boundary).not.toHaveAttribute('aria-disabled');
  });
});
