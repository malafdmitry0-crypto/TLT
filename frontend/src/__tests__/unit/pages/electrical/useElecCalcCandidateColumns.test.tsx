import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ElectricalCandidate } from '@/types/calculation';
import type { ElectricalCandidateResolvedColumnMeta } from '@/utils/electricalCandidateTableColumns';
import { createEmptyTableViewState } from '@/utils/heatCalcTableFindability';
import { useElecCalcCandidateColumns } from '@/pages/electrical/useElecCalcCandidateColumns';

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

function column(
  key: string,
  overrides: Partial<ElectricalCandidateResolvedColumnMeta> = {},
): ElectricalCandidateResolvedColumnMeta {
  return {
    key,
    labels: {
      short: key,
      full: key,
      compact: key,
    },
    label: key,
    title: key,
    group: 'Основные',
    source: 'test',
    valueType: 'computed',
    width: 120,
    defaultWidthPct: 10,
    widthPct: 10,
    minWidthPx: 80,
    visible: true,
    ...overrides,
  };
}

function setup(
  options: Partial<Parameters<typeof useElecCalcCandidateColumns>[0]> = {},
) {
  const onCandidateColumnResizeStart = vi.fn();
  const onSetCandidateColumnFilter = vi.fn();
  const onResetCandidateColumnFilter = vi.fn();
  const isCandidateCompareDiffCell = options.isCandidateCompareDiffCell ?? vi.fn(() => false);
  const onToggleCandidateMark = vi.fn();
  const onApplyCandidate = vi.fn();
  const onUpdateCandidate = vi.fn();
  const candidateFolderMenuItems = options.candidateFolderMenuItems ?? vi.fn(() => [
    { key: 'favorite', label: 'Избранное' },
  ]);

  return {
    onCandidateColumnResizeStart,
    onSetCandidateColumnFilter,
    onResetCandidateColumnFilter,
    isCandidateCompareDiffCell,
    onToggleCandidateMark,
    onApplyCandidate,
    onUpdateCandidate,
    candidateFolderMenuItems,
    ...renderHook(() => useElecCalcCandidateColumns({
      visibleCandidateColumnMetas: [
        column('marked', { fixed: 'left', align: 'center' }),
        column('actions', { fixed: 'left' }),
        column('mode'),
        column('cable_mark'),
      ],
      candidateTableViewState: createEmptyTableViewState(),
      candidateEnumOptionsByColumn: {},
      markedCandidateIds: ['candidate-1'],
      applyCandidatePending: false,
      applyingCandidateId: null,
      updateCandidatePending: false,
      toggleCandidateFolderItemPending: false,
      onCandidateColumnResizeStart,
      onSetCandidateColumnFilter,
      onResetCandidateColumnFilter,
      isCandidateCompareDiffCell,
      onToggleCandidateMark,
      onApplyCandidate,
      onUpdateCandidate,
      candidateFolderMenuItems,
      ...options,
    })),
  };
}

describe('useElecCalcCandidateColumns', () => {
  it('renders marked checkbox and keeps mark callback payload', async () => {
    const { result, onToggleCandidateMark } = setup();
    const markedColumn = result.current.find((item) => item.key === 'marked');

    render(<>{markedColumn?.render?.(undefined, candidate(), 0)}</>);
    const checkbox = screen.getByRole('checkbox', { name: 'Пометить кандидат ТЛТ-25' });

    expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    expect(onToggleCandidateMark).toHaveBeenCalledWith('candidate-1', false);
  });

  it('routes candidate action buttons without building mutation payloads on the page', async () => {
    const { result, onApplyCandidate, onUpdateCandidate } = setup();
    const actionsColumn = result.current.find((item) => item.key === 'actions');

    render(<>{actionsColumn?.render?.(undefined, candidate(), 0)}</>);
    await userEvent.click(screen.getByRole('button', { name: 'Выбрать кандидат ТЛТ-25' }));
    await userEvent.click(screen.getByRole('button', { name: 'Исключить вариант' }));

    expect(onApplyCandidate).toHaveBeenCalledWith('candidate-1');
    expect(onUpdateCandidate).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      patch: { status: 'excluded' },
    });
  });

  it('preserves disabled and loading states for action buttons', () => {
    const { result } = setup({
      applyCandidatePending: true,
      applyingCandidateId: 'candidate-1',
      updateCandidatePending: true,
      toggleCandidateFolderItemPending: true,
    });
    const actionsColumn = result.current.find((item) => item.key === 'actions');

    render(<>{actionsColumn?.render?.(undefined, candidate(), 0)}</>);

    expect(screen.getByRole('button', { name: 'Выбрать кандидат ТЛТ-25' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Добавить кандидат ТЛТ-25 в папку' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Исключить вариант' })).toBeDisabled();
  });

  it('keeps mode rendering and compare diff cell metadata', () => {
    const { result, isCandidateCompareDiffCell } = setup({
      isCandidateCompareDiffCell: vi.fn(() => true),
    });
    const modeColumn = result.current.find((item) => item.key === 'mode');
    const cableMarkColumn = result.current.find((item) => item.key === 'cable_mark');

    render(<>{modeColumn?.render?.('auto', candidate(), 0)}</>);
    expect(screen.getByText('Авто')).toBeInTheDocument();
    expect(cableMarkColumn?.onCell?.(candidate())).toMatchObject({
      className: 'electrical-candidate-cell--diff',
      title: 'Отличается в выбранных вариантах',
      'data-testid': 'candidate-diff-candidate-1-cable_mark',
    });
    expect(isCandidateCompareDiffCell).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'candidate-1' }),
      'cable_mark',
    );
  });
});
