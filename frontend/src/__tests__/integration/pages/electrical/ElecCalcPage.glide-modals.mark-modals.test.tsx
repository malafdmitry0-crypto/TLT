import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCalcSummary } from '@/types/calculation';
import type { ProjectObject } from '@/types/project';
;
import { ELECTRICAL_TABLE_ENGINE_STORAGE_KEY } from '@/utils/electricalTableEngine';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { electricalGlideGridMock, resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage glide / modal actions — mark-modals', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });
  it('делает шаг навива и количество ниток редактируемыми в Glide-таблице SC-04', async () => {
    const { getElectricalPage, selectCableForVariants } = await import('@/api/calculations');
    localStorage.setItem(ELECTRICAL_TABLE_ENGINE_STORAGE_KEY, 'glide');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockReset();
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockReset();
    const object = makeObject({
      id: 'o-1',
      params: { name: 'Труба-1', outer_diameter: 0.108 },
    });
    const calc: ElectricalCalcSummary = {
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      cable_mark_source: 'auto',
      variant_number: 1,
      params: {},
      results: {
        selected_cable: 'ТЛТ-30',
        winding_pitch: 0,
        num_circuits: 1,
        number_of_threads_source: 'auto',
        installed_cable_length: 10,
        order_cable_length: 11,
        total_power: 600,
        current: 2.7,
        voltage: 220,
      },
    };
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([object], [calc]));
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        ...calc,
        results: { ...calc.results, winding_pitch: 400, num_circuits: 2, number_of_threads_source: 'manual' },
      },
    ]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(electricalGlideGridMock.props?.getCellState).toBeTypeOf('function');
    });
    const getCellState = (record: ProjectObject, columnKey: string, rowIndex: number) => {
      const fn = electricalGlideGridMock.props!.getCellState as (
        item: ProjectObject,
        key: string,
        index: number,
      ) => { editable: boolean; editor?: string; displayValue: string };
      return fn(record, columnKey, rowIndex);
    };

    await waitFor(() => {
      expect(getCellState(object, 'winding_pitch_mm', 0)).toMatchObject({
        editable: true,
        editor: 'number',
        displayValue: '0',
      });
      expect(getCellState(object, 'number_of_threads', 0)).toMatchObject({
        editable: true,
        editor: 'number',
        displayValue: '1',
      });
    });
    const onCommitCell = electricalGlideGridMock.props!.onCommitCell as (
      record: ProjectObject,
      columnKey: string,
      value: unknown,
    ) => string | null;

    expect(onCommitCell(object, 'winding_pitch_mm', '100')).toBe(
      'Шаг навива должен быть больше наружного диаметра трубы',
    );
    expect(selectCableForVariants).not.toHaveBeenCalled();

    expect(onCommitCell(object, 'winding_pitch_mm', '200')).toBe(
      'Коэффициент навива 1.969 превышает максимум 1.4 для D=108 мм',
    );
    expect(selectCableForVariants).not.toHaveBeenCalled();

    expect(onCommitCell(object, 'winding_pitch_mm', '400')).toBeNull();
    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenLastCalledWith(
        'o-1',
        null,
        'builtin',
        [1],
        'self_regulating_tt',
        expect.objectContaining({
          windingPitchMm: 400,
          numberOfThreads: null,
        }),
        { 1: '11111111-1111-4111-8111-111111111111' },
      );
    });
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockClear();
    expect(onCommitCell(object, 'number_of_threads', '2')).toBeNull();
    await waitFor(() => {
      expect(selectCableForVariants).toHaveBeenLastCalledWith(
        'o-1',
        null,
        'builtin',
        [1],
        'self_regulating_tt',
        expect.objectContaining({
          numberOfThreads: 2,
        }),
        { 1: '11111111-1111-4111-8111-111111111111' },
      );
    });
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
