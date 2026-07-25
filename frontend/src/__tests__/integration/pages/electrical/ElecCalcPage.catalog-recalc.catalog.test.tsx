/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble fixtures */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { apiMocks, electricalVariantApiMocks, resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage catalog-recalc — TT catalog gates', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('при выключенных commercial features сохраняет технический каталог ТТ', async () => {
    vi.stubEnv('VITE_COMMERCIAL_FEATURES_ENABLED', 'false');
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    const { getCablesTt, getResistiveCables } = await import('@/api/references');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      progress: { current: 0, total: null, phase: 'enqueued', percent: null },
      result: null,
      error_message: null,
      cancel_requested: false,
      created_at: '2026-01-01T00:00:00Z',
      started_at: null,
      finished_at: null,
      links: { status: '', result: '', cancel: '' },
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    // TltSelect: selected value appears in trigger (and possibly list/option nodes).
    expect(screen.getAllByText('ТТН/ТТВ/ТТХ').length).toBeGreaterThan(0);
    expect(getCablesTt).not.toHaveBeenCalled();
    expect(getResistiveCables).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
    await user.click(await screen.findByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          forceCableType: true,
          objectOverrides: undefined,
          selectionMode: undefined,
          skipManual: true,
        }),
      );
    });
  });

  it('селектор типа кабеля оставляет доступным только подтверждённый ТТ-каталог', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const rowCheckbox = document.querySelector('tbody .ant-checkbox-input') as HTMLInputElement;
    fireEvent.click(rowCheckbox);
    // TltSelect trigger (react-aria button), not ant-select-selector.
    const selectors = document.querySelectorAll('.tlt-select__trigger, .tlt-select__value');
    const cableTypeSelect = Array.from(selectors).find((el) =>
      el.textContent?.includes('ТТН/ТТВ/ТТХ')
    ) ?? screen.queryByRole('button', { name: /Тип кабеля для пересчёта/i });
    expect(cableTypeSelect).toBeTruthy();
    expect(screen.queryByText(/Однож. пост. мощн./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Трёхж. пост. мощн./i)).not.toBeInTheDocument();
  });

});
