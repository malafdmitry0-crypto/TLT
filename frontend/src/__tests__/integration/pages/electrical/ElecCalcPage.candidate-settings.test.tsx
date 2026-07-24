/**
 * P2-ELEC-FEEDBACK-01 — candidate table settings/filter/sort owner
 * (split from results-settings for focused ≤30s feedback).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCandidate } from '@/types/calculation';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalCandidateTableColumns';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage candidate table settings', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('позволяет настроить таблицу кандидатов отдельно от основной таблицы', async () => {
    const { getElectricalPage, listElectricalCandidates } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'cand-1',
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'self_regulating',
        cable_source: 'builtin',
        cable_mark: 'ТЛТ-10',
        dedupe_key: 'v1:cand-1',
        mode: 'auto',
        status: 'applicable',
        priority: 0,
        is_recommended: true,
        is_pinned: false,
        is_applied: false,
        reason_code: null,
        reason_message: null,
        engineer_comment: null,
        params: {},
        results: {
          total_power: 1000,
          order_cable_length: 55,
          current: 4.55,
          voltage: 220,
        },
        cable_snapshot: null,
        warnings: [],
        risk_flags: [],
        candidate_meta: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-10',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-10',
            current: 4.55,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Ток, А');
    });
    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });

    // findAllByText: candidate table paints async under full-suite load.
    expect((await within(sizingDialog).findAllByText('Ток, А')).length).toBeGreaterThan(0);
    await user.click(within(sizingDialog).getByRole('button', { name: 'Настройки таблицы' }));
    const settingsTitle = await screen.findByText('Настройки таблицы подбора кабеля');
    const settingsDialog = settingsTitle.closest('.ant-modal-content');
    expect(settingsDialog).toBeInstanceOf(HTMLElement);
    const settingsScope = within(settingsDialog as HTMLElement);
    expect(settingsScope.queryByText('Шаг')).not.toBeInTheDocument();
    expect(settingsScope.getByRole('checkbox', { name: /Показать Действия/i }))
      .toBeDisabled();
    expect(settingsScope.getByRole('checkbox', { name: /Показать Марка кабеля/i }))
      .toBeDisabled();

    await user.click(settingsScope.getByRole('checkbox', { name: /Показать Расчётный ток/i }));
    await user.click(settingsScope.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(within(sizingDialog).queryByText('Ток, А')).not.toBeInTheDocument();
    });
    expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Ток, А');

    const stored = JSON.parse(
      localStorage.getItem(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
    );
    expect(stored.visibleOrder).not.toContain('current');
    expect(localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY)).toBeNull();
  });

  it('фильтрует, сортирует и меняет ширину колонок таблицы кандидатов', async () => {
    const { getElectricalPage, listElectricalCandidates } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const baseCandidate = {
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_source: 'builtin',
      priority: 0,
      is_pinned: false,
      is_applied: false,
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
      mode: 'auto',
      status: 'applicable',
      is_recommended: false,
      ...candidate,
    } as ElectricalCandidate);
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeCandidate({
        id: 'cand-mid',
        cable_type: 'single_core',
        cable_mark: 'СНТО-10/220',
        results: { current: 3.5, order_cable_length: 11.4 },
      }),
      makeCandidate({
        id: 'cand-low',
        cable_type: 'self_regulating',
        cable_mark: 'ТЛТ-10',
        results: { current: 1.2, order_cable_length: 13.2 },
      }),
      makeCandidate({
        id: 'cand-high',
        cable_type: 'three_core',
        cable_mark: 'КМСО-1,0-15',
        is_applied: true,
        results: { current: 8.4, order_cable_length: 9.5 },
      }),
    ]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    localStorage.setItem(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['marked', 'actions', 'mode', 'cable_mark', 'current', 'order_cable_length'],
      columns: {
        cable_mark: { widthPct: 19 },
        current: { widthPct: 10 },
      },
    }));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });
    const rowIds = () =>
      Array.from(sizingDialog.querySelectorAll('tr[data-testid^="candidate-row-"]'))
        .map((candidateRow) => candidateRow.getAttribute('data-testid'));

    expect(rowIds()).toEqual([
      'candidate-row-cand-high',
      'candidate-row-cand-mid',
      'candidate-row-cand-low',
    ]);

    await user.click(within(sizingDialog).getByRole('columnheader', { name: /Ток, А/ }));
    await waitFor(() => {
      expect(rowIds()).toEqual([
        'candidate-row-cand-high',
        'candidate-row-cand-low',
        'candidate-row-cand-mid',
      ]);
    });

    await user.click(within(sizingDialog).getByRole('button', { name: 'Фильтр Марка кабеля' }));
    await user.type(await screen.findByLabelText('Поиск: Марка кабеля'), 'КМСО');
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(rowIds()).toEqual(['candidate-row-cand-high']);
    });
    expect(within(sizingDialog).getByRole('button', { name: 'Сбросить фильтры таблицы кандидатов' }))
      .toBeEnabled();

    await user.click(within(sizingDialog).getByRole('button', { name: 'Сбросить фильтры таблицы кандидатов' }));
    await waitFor(() => {
      expect(rowIds()).toEqual([
        'candidate-row-cand-high',
        'candidate-row-cand-mid',
        'candidate-row-cand-low',
      ]);
    });

    const resizeHandle = within(sizingDialog).getByRole('button', {
      name: 'Изменить ширину: Марка кабеля',
    });
    await act(async () => {
      fireEvent(resizeHandle, new MouseEvent('pointerdown', { clientX: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, bubbles: true }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientX: 150, bubbles: true }));
    });

    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem(ELECTRICAL_GUEST_CANDIDATE_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
      );
      expect(stored.columns.cable_mark.widthPct).toBeGreaterThan(19);
    });
    expect(localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY)).toBeNull();
  });
});
