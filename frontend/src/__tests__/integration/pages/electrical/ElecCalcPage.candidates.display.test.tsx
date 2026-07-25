import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCandidate } from '@/types/calculation';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage candidates / folders — display', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });
  it('показывает две строки для одной марки с разным числом ниток', async () => {
    const { getElectricalPage, listElectricalCandidates } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const base = {
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_type: 'self_regulating',
      cable_source: 'builtin',
      cable_mark: 'ТЛТ-75',
      mode: 'manual',
      status: 'applicable',
      priority: 0,
      is_recommended: false,
      is_pinned: false,
      is_applied: false,
      reason_code: null,
      reason_message: null,
      engineer_comment: null,
      params: {},
      results: { num_circuits: 1 },
      cable_snapshot: null,
      warnings: [],
      risk_flags: [],
      candidate_meta: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...base, id: 'cand-1', dedupe_key: 'v1:one', results: { num_circuits: 1 } },
      { ...base, id: 'cand-2', dedupe_key: 'v1:two', results: { num_circuits: 2 } },
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });
    expect(await within(sizingDialog).findAllByText('ТЛТ-75')).toHaveLength(2);
  });

  it('показывает TT-поля, которые различают визуально похожие варианты', async () => {
    const { getElectricalPage, listElectricalCandidates } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const base = {
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_type: 'self_regulating_tt',
      cable_source: 'builtin',
      cable_mark: '10ТТН2-СР',
      mode: 'manual',
      status: 'applicable',
      priority: 0,
      is_recommended: false,
      is_pinned: false,
      is_applied: false,
      reason_code: null,
      reason_message: null,
      engineer_comment: null,
      results: { num_circuits: 1, winding_pitch: 0, voltage: 220 },
      cable_snapshot: null,
      warnings: [],
      risk_flags: [],
      candidate_meta: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        ...base,
        id: 'tt-fallback',
        dedupe_key: 'v1:tt-fallback',
        params: { process_temperature: 0.6, aggressive_product: false },
      },
      {
        ...base,
        id: 'tt-maintain',
        dedupe_key: 'v1:tt-maintain',
        params: { process_temperature: 0.6, maintain_temperature: -2, aggressive_product: false },
      },
      {
        ...base,
        id: 'tt-vapor-aggressive',
        dedupe_key: 'v1:tt-vapor-aggressive',
        params: {
          process_temperature: 0.6,
          maintain_temperature: -2,
          vapor_temperature: -4,
          aggressive_product: true,
        },
      },
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });

    expect(within(sizingDialog).getAllByText('T3, °C').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('T проп., °C').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Агр.').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getByTestId('candidate-row-tt-fallback')).toHaveTextContent('0,6');
    expect(within(sizingDialog).getByTestId('candidate-row-tt-maintain')).toHaveTextContent('-2');
    expect(within(sizingDialog).getByTestId('candidate-row-tt-vapor-aggressive')).toHaveTextContent('-4');
    expect(within(sizingDialog).getByTestId('candidate-row-tt-vapor-aggressive')).toHaveTextContent('Да');
  });

  it('показывает выбранный кабель, пометки и компактные действия кандидатов', async () => {
    const {
      applyElectricalCandidate,
      getElectricalPage,
      listElectricalCandidates,
      updateElectricalCandidate,
    } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const baseCandidate = {
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_source: 'builtin',
      dedupe_key: 'v1:base',
      priority: 0,
      is_pinned: false,
      reason_code: null,
      reason_message: null,
      engineer_comment: null,
      params: {},
      cable_snapshot: null,
      warnings: [],
      risk_flags: [],
      candidate_meta: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const makeCandidate = (candidate: Partial<ElectricalCandidate> & { id: string }): ElectricalCandidate => ({
      ...baseCandidate,
      dedupe_key: `v1:${candidate.id}`,
      ...candidate,
    } as ElectricalCandidate);
    let candidates: ElectricalCandidate[] = [
      makeCandidate({
        id: 'cand-applied',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-10',
        mode: 'manual',
        status: 'applicable',
        is_recommended: true,
        is_applied: true,
        results: {
          total_power: 1000,
          order_cable_length: 55,
          current: 4.55,
        },
      }),
      makeCandidate({
        id: 'cand-next',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-20',
        mode: 'auto',
        status: 'applicable',
        is_recommended: false,
        is_applied: false,
        results: {
          total_power: 1200,
          order_cable_length: 60,
          current: 5.45,
        },
      }),
      makeCandidate({
        id: 'cand-duplicate',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-20',
        mode: 'manual',
        status: 'applicable',
        is_recommended: false,
        is_applied: false,
        results: {
          total_power: 1300,
          order_cable_length: 62,
          current: 5.91,
        },
      }),
      makeCandidate({
        id: 'cand-error',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-5',
        mode: 'manual',
        status: 'error',
        reason_message: 'Кабель не обеспечивает требуемую мощность',
        is_recommended: false,
        is_applied: false,
        results: null,
      }),
    ];
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockImplementation(async () => candidates);
    (applyElectricalCandidate as ReturnType<typeof vi.fn>).mockImplementation(async (candidateId: string) => ({
      candidate: (() => {
        const selected = candidates.find((candidate) => candidate.id === candidateId)!;
        candidates = candidates.map((candidate) => ({
          ...candidate,
          is_applied: candidate.id === candidateId,
        }));
        return { ...selected, is_applied: true };
      })(),
      calculation: (() => {
        const selected = candidates.find((candidate) => candidate.id === candidateId)!;
        return {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: selected.cable_type,
          cable_mark: selected.cable_mark,
          cable_mark_source: 'manual',
          variant_number: 1,
          results: {
            selected_cable: selected.cable_mark,
          },
        };
      })(),
    }));
    (updateElectricalCandidate as ReturnType<typeof vi.fn>).mockImplementation(
      async (candidateId: string, patch: Record<string, unknown>) => {
        candidates = candidates.map((candidate) => (
          candidate.id === candidateId
            ? { ...candidate, ...patch }
            : candidate
        ));
        return candidates.find((candidate) => candidate.id === candidateId);
      },
    );
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-10',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-10',
            total_power: 1000,
            order_cable_length: 55,
            current: 4.55,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_mark'],
      columns: { cable_mark: { widthPct: 22 } },
    }));
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });

    expect(within(sizingDialog).getByText('Выбранный кабель:')).toBeInTheDocument();
    expect(within(sizingDialog).getAllByText('ТЛТ-10').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Ручной').length).toBeGreaterThan(0);
    expect(within(sizingDialog).queryByText('Статус кабеля')).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByText('снимок')).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByRole('columnheader', { name: 'Статус' })).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByText('Готов')).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByLabelText('Готов')).not.toBeInTheDocument();
    expect((await within(sizingDialog).findAllByText('Пометка')).length).toBeGreaterThan(0);
    expect(within(sizingDialog).getByRole('button', { name: /Все/ })).toBeInTheDocument();
    expect(within(sizingDialog).getByRole('button', { name: /Избранное/ })).toBeInTheDocument();
    expect(within(sizingDialog).getByTestId('candidate-row-cand-applied')).not.toHaveClass(
      'electrical-cable-sizing-table__row--error',
    );
    expect(within(sizingDialog).getByTestId('candidate-row-cand-next')).not.toHaveClass(
      'electrical-cable-sizing-table__row--error',
    );
    expect(within(sizingDialog).getByTestId('candidate-row-cand-error')).toHaveClass(
      'electrical-cable-sizing-table__row--error',
    );

    const markerCheckbox = within(sizingDialog).getByTestId('candidate-mark-cand-next');
    expect(markerCheckbox).toBeEnabled();
    expect(markerCheckbox).not.toBeChecked();
    await user.click(markerCheckbox);
    expect(markerCheckbox).toBeChecked();
    expect(applyElectricalCandidate).not.toHaveBeenCalled();
    expect(within(sizingDialog).getAllByText('ТЛТ-10').length).toBeGreaterThan(0);
    await user.click(within(sizingDialog).getByTestId('candidate-mark-cand-applied'));
    expect(within(sizingDialog).getByTestId('candidate-compare-bar')).toHaveTextContent('Сравнение: 2 вариантов');
    expect(within(sizingDialog).getByTestId('candidate-compare-bar')).toHaveTextContent(
      'Отличий в видимых колонках:',
    );
    expect(within(sizingDialog).getByTestId('candidate-row-cand-applied')).toHaveClass(
      'electrical-cable-sizing-table__row--compared',
    );
    expect(within(sizingDialog).getByTestId('candidate-diff-cand-applied-cable_mark')).toHaveClass(
      'electrical-candidate-cell--diff',
    );
    expect(within(sizingDialog).getByTestId('candidate-diff-cand-next-cable_mark')).toHaveClass(
      'electrical-candidate-cell--diff',
    );
    await user.click(within(sizingDialog).getByRole('button', { name: 'Сбросить сравнение' }));
    expect(within(sizingDialog).queryByTestId('candidate-compare-bar')).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByTestId('candidate-diff-cand-applied-cable_mark')).not.toBeInTheDocument();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-applied')).toBeEnabled();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-applied')).toHaveAttribute('aria-pressed', 'true');
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-applied')).toHaveAccessibleName(
      'Уже выбран кандидат ТЛТ-10',
    );
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-next')).toBeEnabled();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-next')).toHaveAttribute('aria-pressed', 'false');
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-duplicate')).toBeEnabled();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-duplicate')).toHaveAttribute('aria-pressed', 'false');

    await user.click(within(sizingDialog).getByTestId('candidate-apply-cand-duplicate'));
    expect(applyElectricalCandidate).toHaveBeenCalledWith('cand-duplicate');
    await waitFor(() => {
      expect(candidates.filter((candidate) => candidate.is_applied).map((candidate) => candidate.id)).toEqual([
        'cand-duplicate',
      ]);
    });
    await waitFor(() => {
      expect(within(sizingDialog).getByTestId('candidate-apply-cand-duplicate')).toHaveAttribute('aria-pressed', 'true');
    });
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-applied')).toBeEnabled();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-applied')).toHaveAttribute('aria-pressed', 'false');
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-next')).toBeEnabled();
    expect(within(sizingDialog).getByTestId('candidate-apply-cand-next')).toHaveAttribute('aria-pressed', 'false');

    expect(within(sizingDialog).queryByTestId('candidate-favorite-cand-next')).not.toBeInTheDocument();
    await user.click(within(sizingDialog).getByTestId('candidate-folder-cand-next'));
    await user.click(await screen.findByRole('menuitem', { name: 'Избранное' }));
    expect(updateElectricalCandidate).toHaveBeenCalledWith(
      'cand-next',
      expect.objectContaining({ is_pinned: true }),
    );
    expect(candidates.filter((candidate) => candidate.is_applied).map((candidate) => candidate.id)).toEqual([
      'cand-duplicate',
    ]);
    await waitFor(() => {
      expect(within(sizingDialog).getByText('избр.')).toBeInTheDocument();
    });

    await user.click(within(sizingDialog).getByRole('button', { name: /Избранное/ }));
    await waitFor(() => {
      expect(within(sizingDialog).getByTestId('candidate-row-cand-next')).toBeInTheDocument();
    });
    expect(within(sizingDialog).queryByTestId('candidate-row-cand-applied')).not.toBeInTheDocument();
    await user.click(within(sizingDialog).getByRole('button', { name: /Все/ }));

    await user.click(within(sizingDialog).getByTestId('candidate-exclude-cand-next'));
    expect(updateElectricalCandidate).toHaveBeenCalledWith(
      'cand-next',
      expect.objectContaining({ status: 'excluded' }),
    );
    expect(applyElectricalCandidate).toHaveBeenCalledTimes(1);
  });
});
