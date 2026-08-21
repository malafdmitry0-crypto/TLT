import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderCandidateElectricalField } from '@/components/electrical/ElectricalCandidateFieldRenderer';
import type { ElectricalCandidate } from '@/types/calculation';

const baseCandidate = {
  id: 'candidate-1',
  cable_type: 'self_regulating',
  cable_mark: 'ТЛТ-60',
  is_recommended: true,
  is_pinned: true,
  reason_message: null,
  params: {
    connection_type: 'line_1ph',
    number_of_threads_source: 'manual',
  },
  results: {
    selection_policy: 'technical_minimum',
    applied_selection_policy: 'manual_selection',
    num_circuits: 2,
    commercial: {
      stock_status: 'in_stock',
      price_per_meter: 123.456,
    },
  },
} as unknown as ElectricalCandidate;

describe('renderCandidateElectricalField', () => {
  it('renders cable mark with recommendation and pinned tags', () => {
    render(<>{renderCandidateElectricalField('cable_mark', baseCandidate)}</>);

    expect(screen.getByText('ТЛТ-60')).toBeInTheDocument();
    expect(screen.getByText('приор.')).toBeInTheDocument();
    expect(screen.getByText('избр.')).toBeInTheDocument();
  });

  it('renders thread source and selection policy labels', () => {
    const { rerender } = render(<>{renderCandidateElectricalField('number_of_threads', baseCandidate)}</>);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('ручн.')).toBeInTheDocument();

    rerender(<>{renderCandidateElectricalField('selection_policy', baseCandidate)}</>);
    expect(screen.getByText('Технический')).toBeInTheDocument();

    rerender(<>{renderCandidateElectricalField('applied_selection_policy', baseCandidate)}</>);
    expect(screen.getByText('Ручной')).toBeInTheDocument();
  });

  it('renders connection and commercial values through their labels', () => {
    const { rerender } = render(<>{renderCandidateElectricalField('connection_type', baseCandidate)}</>);

    expect(screen.getByText('Линия')).toBeInTheDocument();

    rerender(<>{renderCandidateElectricalField('stock_status', baseCandidate)}</>);
    expect(screen.getByText('В наличии')).toBeInTheDocument();

    rerender(<>{renderCandidateElectricalField('price_per_meter', baseCandidate)}</>);
    expect(screen.getByText('123,46')).toBeInTheDocument();
  });
});
