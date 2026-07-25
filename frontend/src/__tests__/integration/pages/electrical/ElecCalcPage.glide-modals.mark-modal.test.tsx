/* eslint-disable @typescript-eslint/no-unused-vars -- scenario split keeps shared preamble */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { ELECTRICAL_TABLE_ENGINE_STORAGE_KEY } from '@/utils/electricalTableEngine';
import { mockProject, makeObject, makeElectricalPage, renderPage, openElectricalTableSettingsOtherTab } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { electricalGlideGridMock, resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage glide-modals — mark modal errors', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('не закрывает модалку выбора марки при ошибке ручного применения', async () => {
    const { getElectricalPage, listCables, selectCableForVariants } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listCables as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        brand: 'ТЛТ',
        model: 'ТЛТ-30',
        source: 'builtin',
        cable_type: 'self_regulating',
        power_per_meter: 30,
        max_temperature: 65,
        min_temperature: -60,
        voltage: 220,
        stock_quantity_m: 1200,
        lead_time_days: 2,
        params: {
          max_pipe_temp: 160,
          protection: 'IP68',
        },
      },
    ]);
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('manual failed'));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            winding_pitch: 0,
            num_circuits: 1,
            installed_cable_length: 10,
            order_cable_length: 11,
            total_power: 300,
            current: 1.4,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalled();
    });
    expect(screen.getByRole('dialog', { name: /Выбор марки кабеля/ })).toBeInTheDocument();
    expect(within(dialog).getAllByText(/ТЛТ-30/).length).toBeGreaterThan(0);
  });

  it('не закрывает модалку выбора марки при ошибке автоподбора', async () => {
    const { getElectricalPage, selectCableForVariants } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('auto failed'));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalled();
    });
    expect(screen.getByRole('dialog', { name: /Выбор марки кабеля/ })).toBeInTheDocument();
    // TltSelect may show "Авто" in trigger value and list option.
    expect(within(dialog).getAllByText('Авто').length).toBeGreaterThan(0);
  });

});
