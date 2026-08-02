import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

/** Under concurrent agent-dod load, elec table rows can exceed default findBy timeout. */
const CABLE_META_FIND_TIMEOUT = 20_000;

async function findObjectRow(name: RegExp) {
  return screen.findByRole('row', { name }, { timeout: CABLE_META_FIND_TIMEOUT });
}

describe('ElecCalcPage cable metadata / source / inline — object-fields', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
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
          results: { heat_loss_per_meter_base: 100, total_heat_loss_design: 5000 },
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

    const row = await findObjectRow(/Труба-1/);
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
          results: { heat_loss_per_m2_bare_base: 45, total_heat_loss_design: 9000 },
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

    const row = await findObjectRow(/Резервуар-1/);
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
  it('показывает специфические поля выбранного типа кабеля', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СР',
          variant_number: 1,
          results: {
            selected_cable: '30ТТВ2-СР',
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

    const row = await findObjectRow(/Труба-1/);
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const dialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    const cableCharacteristics = within(dialog).getByRole('group', { name: 'Характеристики: кабель' });

    expect(cableCharacteristics).toHaveTextContent('Тип кабеля:');
    expect(cableCharacteristics).toHaveTextContent('ТТН/ТТВ/ТТХ');
    expect(cableCharacteristics).toHaveTextContent('Q1:');
    expect(cableCharacteristics).toHaveTextContent('-0,141 Вт/(м·°C)');
    expect(cableCharacteristics).toHaveTextContent('Q2:');
    expect(cableCharacteristics).toHaveTextContent('32,00 Вт/м');
    expect(cableCharacteristics).toHaveTextContent('Макс. T проп.:');
    expect(cableCharacteristics).toHaveTextContent('210 °C');
  });
});
