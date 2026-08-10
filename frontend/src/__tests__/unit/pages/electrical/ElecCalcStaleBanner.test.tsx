import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ElecCalcStaleBanner } from '@/pages/electrical/ElecCalcStaleBanner';

describe('ElecCalcStaleBanner', () => {
  it('renders nothing when staleCount is zero', () => {
    const { container } = render(
      <ElecCalcStaleBanner
        staleCount={0}
        canMutate
        onRecalculateStale={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows singular and plural titles and wires actions', async () => {
    const user = userEvent.setup();
    const onRecalculateStale = vi.fn();
    const onSelectStale = vi.fn();

    const { rerender } = render(
      <ElecCalcStaleBanner
        staleCount={1}
        canMutate
        onRecalculateStale={onRecalculateStale}
        onSelectStale={onSelectStale}
      />,
    );
    expect(screen.getByTestId('elec-stale-banner')).toHaveTextContent(
      '1 объект требует перерасчёта',
    );

    await user.click(screen.getByTestId('elec-stale-select'));
    await user.click(screen.getByTestId('elec-stale-recalc'));
    expect(onSelectStale).toHaveBeenCalledTimes(1);
    expect(onRecalculateStale).toHaveBeenCalledTimes(1);

    rerender(
      <ElecCalcStaleBanner
        staleCount={3}
        canMutate
        onRecalculateStale={onRecalculateStale}
      />,
    );
    expect(screen.getByTestId('elec-stale-banner')).toHaveTextContent(
      '3 объектов требуют перерасчёта',
    );
    expect(screen.queryByTestId('elec-stale-select')).not.toBeInTheDocument();
  });

  it('hides actions when cannot mutate', () => {
    render(
      <ElecCalcStaleBanner
        staleCount={2}
        canMutate={false}
        onRecalculateStale={() => undefined}
        onSelectStale={() => undefined}
      />,
    );
    expect(screen.getByTestId('elec-stale-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('elec-stale-recalc')).not.toBeInTheDocument();
    expect(screen.queryByTestId('elec-stale-select')).not.toBeInTheDocument();
  });

  it('blocks stale recalculation when project Iдоп is missing', async () => {
    const user = userEvent.setup();
    const onRecalculateStale = vi.fn();
    render(
      <ElecCalcStaleBanner
        staleCount={1}
        canMutate
        recalculationBlockedReason="Сначала укажите и сохраните Iдоп проекта"
        onRecalculateStale={onRecalculateStale}
      />,
    );

    expect(screen.getByTestId('elec-stale-recalc')).toBeDisabled();
    await user.click(screen.getByTestId('elec-stale-recalc'));
    expect(onRecalculateStale).not.toHaveBeenCalled();
  });
});
