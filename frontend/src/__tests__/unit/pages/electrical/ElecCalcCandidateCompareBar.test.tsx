import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ElecCalcCandidateCompareBar from '@/pages/electrical/ElecCalcCandidateCompareBar';

describe('ElecCalcCandidateCompareBar', () => {
  it('does not render when comparison is inactive', () => {
    render(
      <ElecCalcCandidateCompareBar
        active={false}
        markedCount={2}
        diffCount={1}
        onReset={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('candidate-compare-bar')).not.toBeInTheDocument();
  });

  it('renders diff summary and reset callback', async () => {
    const onReset = vi.fn();
    render(
      <ElecCalcCandidateCompareBar
        active
        markedCount={3}
        diffCount={2}
        onReset={onReset}
      />,
    );

    expect(screen.getByTestId('candidate-compare-bar')).toHaveTextContent('Сравнение: 3 вариантов');
    expect(screen.getByTestId('candidate-compare-bar')).toHaveTextContent('Отличий в видимых колонках: 2');

    await userEvent.click(screen.getByRole('button', { name: 'Сбросить сравнение' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('renders empty diff message', () => {
    render(
      <ElecCalcCandidateCompareBar
        active
        markedCount={2}
        diffCount={0}
        onReset={vi.fn()}
      />,
    );

    expect(screen.getByTestId('candidate-compare-bar')).toHaveTextContent(
      'В видимых колонках отличий нет',
    );
  });
});
