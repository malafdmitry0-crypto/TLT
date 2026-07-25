import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCandidate } from '@/types/calculation';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage candidates / folders — auto-recalc', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });
  it('показывает «Вариант обновлён» при повторном идентичном авторасчёте', async () => {
    const {
      createElectricalCandidate,
      getElectricalPage,
      listElectricalCandidates,
    } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const candidate = {
      id: 'cand-1',
      project_id: 'p-1',
      object_id: 'o-1',
      variant_number: 1,
      cable_type: 'self_regulating',
      cable_source: 'builtin',
      cable_mark: 'ТЛТ-10',
      dedupe_key: 'v1:same',
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
      results: { total_power: 1000, order_cable_length: 55 },
      cable_snapshot: null,
      warnings: [],
      risk_flags: [],
      candidate_meta: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([candidate]);
    (createElectricalCandidate as ReturnType<typeof vi.fn>).mockResolvedValue({
      action: 'updated',
      candidate,
    });
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });
    await user.click(within(sizingDialog).getByRole('button', { name: 'Запустить авторасчёт' }));
    expect(await screen.findByText('Вариант обновлён')).toBeInTheDocument();
  });
});
