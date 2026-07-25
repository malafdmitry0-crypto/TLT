import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage cable-meta — brand modal & characteristics', () => {
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

    const row = await screen.findByRole('row', { name: /Труба-1/ });
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
    const row = await screen.findByRole('row', { name: /Труба-1/ });
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

  it('показывает характеристики объекта и текущего ТТ-кабеля в модалке выбора марки', async () => {
    const { getElectricalPage, listCables } = await import('@/api/calculations');
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
      makeElectricalPage([
        makeObject({
          params: {
            name: 'Труба-1',
            outer_diameter: 0.108,
            pipe_length: 50,
            placement: 'outdoor',
            ambient_temperature: -30,
            process_temperature: 80,
          },
          results: { heat_loss_per_meter: 100, total_heat_loss: 5000 },
        }),
      ], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          variant_number: 1,
          results: {
            selected_cable: '30ТТВ2-СТ',
            installed_cable_length: 50,
            order_cable_length: 55,
            total_power: 1500,
            current: 6.8,
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
    const objectCharacteristics = within(dialog).getByRole('group', { name: 'Характеристики: объект' });
    const cableCharacteristics = within(dialog).getByRole('group', { name: 'Характеристики: кабель' });

    expect(objectCharacteristics).toHaveTextContent('Диаметр:');
    expect(objectCharacteristics).toHaveTextContent('108 мм');
    expect(objectCharacteristics).toHaveTextContent('50,0 м');
    expect(objectCharacteristics).toHaveTextContent('100,00 Вт/м');
    expect(objectCharacteristics).toHaveTextContent('5,00 кВт');
    expect(cableCharacteristics).not.toHaveTextContent('Источник');
    expect(cableCharacteristics).not.toHaveTextContent('Встроенная');
    expect(cableCharacteristics).toHaveTextContent('Бренд:');
    expect(cableCharacteristics).toHaveTextContent('Марка:');
    expect(cableCharacteristics).not.toHaveTextContent('Цена/м:');
    expect(cableCharacteristics).not.toHaveTextContent('Склад:');
    expect(cableCharacteristics).not.toHaveTextContent('Остаток:');
    expect(cableCharacteristics).not.toHaveTextContent('Поставщик:');
    expect(cableCharacteristics).toHaveTextContent('Q1:');
    expect(cableCharacteristics).toHaveTextContent('-0,141 Вт/(м·°C)');
    expect(cableCharacteristics).toHaveTextContent('Q2:');
    expect(cableCharacteristics).toHaveTextContent('32,00 Вт/м');
    expect(cableCharacteristics).toHaveTextContent('Макс. T проп.:');
    expect(cableCharacteristics).toHaveTextContent('210 °C');
  });

  it('показывает фиксированный список характеристик резервуара без трубных полей', async () => {
    const { getElectricalPage, listCables } = await import('@/api/calculations');
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
      makeElectricalPage([
        makeObject({
          object_type: 'tank',
          params: {
            name: 'Резервуар-1',
            shape: 'cylindrical',
            diameter: 2,
            height: 3,
            placement: 'outdoor',
            ambient_temperature: -30,
            process_temperature: 80,
          },
          results: { heat_loss_per_m2: 45, total_heat_loss: 9000 },
        }),
      ], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ТЛТ-30',
          variant_number: 1,
          results: {
            selected_cable: 'ТЛТ-30',
            installed_cable_length: 50,
            order_cable_length: 55,
            total_power: 1500,
            current: 6.8,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Резервуар-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    const objectCharacteristics = within(dialog).getByRole('group', { name: 'Характеристики: объект' });

    expect(objectCharacteristics).toHaveTextContent('Тип объекта:');
    expect(objectCharacteristics).toHaveTextContent('Резервуар');
    expect(objectCharacteristics).toHaveTextContent('Геометрия резервуара:');
    expect(objectCharacteristics).toHaveTextContent('цилиндр Ø 2 000 мм, H 3 000 мм');
    expect(objectCharacteristics).toHaveTextContent('45,00 Вт/м²');
    expect(objectCharacteristics).not.toHaveTextContent('Диаметр:');
    expect(objectCharacteristics).not.toHaveTextContent('Длина:');
  });

});
