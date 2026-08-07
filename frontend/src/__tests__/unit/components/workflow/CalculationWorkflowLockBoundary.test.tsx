import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CalculationWorkflowLockBoundary } from '@/components/workflow/CalculationWorkflowLockBoundary';

describe('CalculationWorkflowLockBoundary', () => {
  it('uses native inert while the server-authoritative workflow lock is active', () => {
    const view = render(
      <CalculationWorkflowLockBoundary locked>
        <button type="button">Изменить</button>
      </CalculationWorkflowLockBoundary>,
    );
    const boundary = screen.getByRole('button', { name: 'Изменить', hidden: true }).parentElement!;

    expect(boundary.inert).toBe(true);
    expect(boundary).toHaveAttribute('aria-disabled', 'true');

    view.rerender(
      <CalculationWorkflowLockBoundary locked={false}>
        <button type="button">Изменить</button>
      </CalculationWorkflowLockBoundary>,
    );
    expect(boundary.inert).toBe(false);
    expect(boundary).not.toHaveAttribute('aria-disabled');
  });
});
