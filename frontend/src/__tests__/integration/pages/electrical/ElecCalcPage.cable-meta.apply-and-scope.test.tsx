import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

/** Under concurrent agent-dod load, elec table rows can exceed default findBy timeout. */
const CABLE_META_FIND_TIMEOUT = 20_000;

async function findObjectRow(name: RegExp) {
  return screen.findByRole('row', { name }, { timeout: CABLE_META_FIND_TIMEOUT });
}

describe('ElecCalcPage cable metadata / source / inline — apply-and-scope', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });
  it('закрывает модалку выбора марки после успешного применения', async () => {
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
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      variant_number: 1,
      results: { selected_cable: 'ТЛТ-30' },
    }]);
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

    const row = await findObjectRow(/Труба-1/);
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: /Выбор марки кабеля/ })).not.toBeInTheDocument();
    });
  });
  it('по умолчанию сохраняет выбор марки в открытое СО и позволяет отметить другие СО', async () => {
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
      },
    ]);
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      variant_number: 2,
      results: { selected_cable: 'ТЛТ-30' },
    }]);
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 2,
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

    await user.click(await screen.findByRole('tab', { name: 'ЭР2' }));
    const row = await findObjectRow(/Труба-1/);
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });

    expect(within(dialog).getByRole('checkbox', { name: 'ЭР1' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'ЭР2' })).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: 'ЭР4' }));
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalledTimes(1);
    });
    expect((selectCableForVariants as ReturnType<typeof vi.fn>).mock.calls[0][3])
      .toEqual([2, 4]);
    expect((selectCableForVariants as ReturnType<typeof vi.fn>).mock.calls[0][6])
      .toEqual({
        2: '22222222-2222-4222-8222-222222222222',
        4: '44444444-4444-4444-8444-444444444444',
      });
  });
});
