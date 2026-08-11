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
    const { getElectricalPage, listCables } = await import('@/api/calculations');
    const { selectElectricalAssignmentCable: selectCableForVariants } = await import('@/api/electricalVariants');
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
  it('сохраняет выбор марки строго в открытый текущий ЭР без multi-ЭР управления', async () => {
    const { getElectricalPage, listCables } = await import('@/api/calculations');
    const { selectElectricalAssignmentCable: selectCableForVariants } = await import('@/api/electricalVariants');
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

    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/только к текущему ЭР: ЭР2/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Применить' }));

    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenCalledTimes(1);
    });
    expect(selectCableForVariants).toHaveBeenCalledWith(
      'p-1',
      '22222222-2222-4222-8222-222222222222',
      'o-1',
      expect.objectContaining({ mode: 'manual', cable_mark: 'ТЛТ-30', thread_count: 1 }),
    );
  });
});
