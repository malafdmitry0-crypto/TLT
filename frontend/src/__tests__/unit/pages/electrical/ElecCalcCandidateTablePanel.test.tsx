import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ElecCalcCandidateTablePanel from '@/pages/electrical/ElecCalcCandidateTablePanel';
import type { ElectricalCandidate } from '@/types/calculation';
import { createEmptyTableViewState } from '@/utils/heatCalcTableFindability';

vi.mock('@/components/electrical/ElectricalCandidateGlideGrid', () => ({
  default: (props: {
    rows: ElectricalCandidate[];
    emptyContent: string;
    onCellAction: (candidate: ElectricalCandidate, columnKey: string, actionKey: string) => void;
  }) => (
    <div data-testid="candidate-glide-grid-mock">
      <span>{`glide:${props.rows.length}:${props.emptyContent}`}</span>
      <button
        type="button"
        onClick={() => props.onCellAction(props.rows[0], 'actions', 'apply')}
      >
        Apply first
      </button>
    </div>
  ),
}));

function candidate(overrides: Partial<ElectricalCandidate> = {}): ElectricalCandidate {
  return {
    id: 'candidate-1',
    project_id: 'project-1',
    object_id: 'object-1',
    variant_number: 1,
    cable_type: 'self_regulating',
    cable_source: 'builtin',
    cable_mark: 'ТЛТ-25',
    dedupe_key: 'candidate-key',
    mode: 'auto',
    status: 'applicable',
    priority: 0,
    is_recommended: false,
    is_pinned: false,
    is_applied: false,
    reason_code: null,
    reason_message: null,
    engineer_comment: null,
    params: {},
    results: {},
    cable_snapshot: null,
    warnings: [],
    risk_flags: [],
    candidate_meta: {},
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(overrides: Partial<Parameters<typeof ElecCalcCandidateTablePanel>[0]> = {}) {
  const appliedCandidate = candidate({
    id: 'candidate-applied',
    is_applied: true,
    engineer_comment: 'Старый комментарий',
  });
  const props: Parameters<typeof ElecCalcCandidateTablePanel>[0] = {
    canMutate: true,
    rows: [appliedCandidate, candidate()],
    glideColumns: [{ key: 'cable_mark', title: 'Марка', width: 120 }],
    tableScrollX: 920,
    fontSizeKey: 'compact',
    loading: false,
    tableViewState: createEmptyTableViewState(),
    emptyContent: 'Вариантов пока нет',
    rowClassName: (row) => (row.status === 'error' ? 'row-error' : ''),
    getCellState: () => ({
      displayValue: '',
      editable: false,
    }),
    onToggleMarked: vi.fn(),
    onCellAction: vi.fn(),
    getActionMenuItems: vi.fn(() => null),
    onSetColumnFilter: vi.fn(),
    onResetColumnFilter: vi.fn(),
    onSetSort: vi.fn(),
    onColumnResize: vi.fn(),
    onColumnResizeEnd: vi.fn(),
    appliedCandidate,
    onAppliedCandidateCommentBlur: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...render(<ElecCalcCandidateTablePanel {...props} />),
  };
}

describe('ElecCalcCandidateTablePanel', () => {
  it('renders candidate Glide grid and keeps comment blur callback scoped to applied candidate', async () => {
    const { props } = setup();

    expect(await screen.findByTestId('candidate-glide-grid-mock')).toHaveTextContent(
      'glide:2:Вариантов пока нет',
    );

    const comment = screen.getByLabelText('Комментарий к выбранному кандидату');
    expect(comment).toHaveValue('Старый комментарий');

    fireEvent.change(comment, { target: { value: 'Новый комментарий' } });
    fireEvent.blur(comment);

    expect(props.onAppliedCandidateCommentBlur).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'candidate-applied' }),
      'Новый комментарий',
    );
  });

  it('disables engineer comment when there is no applied candidate', () => {
    setup({ appliedCandidate: null });

    expect(screen.getByLabelText('Комментарий к выбранному кандидату')).toBeDisabled();
  });

  it('shows candidate rows but guards engineer comment writes in read-only mode', async () => {
    const onAppliedCandidateCommentBlur = vi.fn();
    setup({
      canMutate: false,
      onAppliedCandidateCommentBlur,
    });

    expect(await screen.findByTestId('candidate-glide-grid-mock')).toHaveTextContent('glide:2');
    const comment = screen.getByLabelText('Комментарий к выбранному кандидату');
    expect(comment).toHaveValue('Старый комментарий');
    expect(comment).toBeDisabled();

    fireEvent.blur(comment);
    expect(onAppliedCandidateCommentBlur).not.toHaveBeenCalled();
  });

  it('forwards Glide action callbacks', async () => {
    const user = userEvent.setup();
    const onCellAction = vi.fn();
    setup({
      rows: [candidate({ id: 'glide-candidate' })],
      onCellAction,
    });

    const grid = await screen.findByTestId('candidate-glide-grid-mock');
    expect(grid).toHaveTextContent('glide:1:Вариантов пока нет');

    await user.click(within(grid).getByRole('button', { name: 'Apply first' }));
    expect(onCellAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'glide-candidate' }),
      'actions',
      'apply',
    );
  });
});
