/**
 * P2-ELEC-FEEDBACK-01 — main table settings / results display / picker chrome
 * (candidate settings + manual recalc split to sibling owners for ≤30s focus).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY } from '@/utils/electricalTableViewSettings';
import { mockProject, makeObject, makeElectricalPage, renderPage, openElectricalTableSettingsOtherTab } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage results / settings', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('при успешном расчёте отображает подобранный кабель в карточке объекта', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
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
          installed_cable_length: 10,
          order_cable_length: 11,
          total_power: 600,
          current: 2.7,
          voltage: 220,
        },
      },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
  });

  it('позволяет гостю скрыть колонку электрорасчёта через настройки таблицы', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
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
            power_per_meter: 30,
            installed_power_per_meter: 30,
            total_power: 600,
            current: 2.7,
            voltage: 220,
          },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Ток, А');
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('P каб., Вт/м');
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('30,00');
    });

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    expect(
      await screen.findByRole('checkbox', { name: /Показать Удельная мощность выбранного кабеля, Вт\/м/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Показать Расчётный ток/i }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).not.toContain('Ток, А');
    });
    const stored = JSON.parse(
      localStorage.getItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY) ?? '{}',
    );
    expect(stored.visibleOrder).not.toContain('current');
  });

  it('сохраняет размер шрифта и формат заголовков таблицы электрорасчёта', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
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
            total_power: 600,
            current: 2.7,
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

    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    await openElectricalTableSettingsOtherTab(user, dialog);
    await user.click(within(dialog).getByText('Компактный'));
    await user.click(within(dialog).getAllByText('Полные')[0]);
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(document.querySelector('.electrical-spreadsheet')).toHaveClass('calc-spreadsheet--compact');
      expect(document.querySelector('.electrical-spreadsheet')?.textContent).toContain('Расчётный ток, А');
    });
    const stored = JSON.parse(
      localStorage.getItem(ELECTRICAL_GUEST_TABLE_VIEW_STORAGE_KEY) ?? '{}',
    );
    expect(stored).toMatchObject({
      fontSize: 'compact',
      tableLabelFormat: 'full',
      settingsLabelFormat: 'full',
      calculationCableSource: 'builtin',
    });
    expect(stored).not.toHaveProperty('cablePickerObjectFields');
    expect(stored).not.toHaveProperty('cablePickerCableFields');
  });

  it('не показывает настройку характеристик выбора марки и не выводит служебный источник', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Настройки' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const dialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    expect(within(dialog).queryByRole('tab', { name: 'Выбор кабеля' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Строка объекта')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('tab', { name: 'Строка кабеля' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list', { name: 'Поля строки объекта' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list', { name: 'Поля строки кабеля' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    const pickerDialog = await screen.findByRole('dialog', { name: /Выбор марки кабеля/ });
    expect(within(pickerDialog).queryByRole('table', { name: 'Характеристики объекта и кабеля' })).not.toBeInTheDocument();
    const cableCharacteristics = within(pickerDialog).getByRole('group', { name: 'Характеристики: кабель' });
    expect(cableCharacteristics).not.toHaveTextContent('Источник');
    expect(cableCharacteristics).not.toHaveTextContent('Склад:');
    expect(cableCharacteristics).toHaveTextContent('Бренд:');
  });

  it('открывает окно выбора марки уже без отдельной верхней секции', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));
    expect(await screen.findByRole('dialog', { name: /Выбор марки кабеля/ })).toBeInTheDocument();

    const modalRoot = document.querySelector('.electrical-cable-picker-dialog') as HTMLElement;
    expect(modalRoot.style.width).toBe('min(92vw, 1056px)');
    expect(document.querySelector('.electrical-cable-picker-drag-bar')).not.toBeInTheDocument();
    expect(document.querySelector('.electrical-cable-picker-window')).not.toBeInTheDocument();
  });
});
