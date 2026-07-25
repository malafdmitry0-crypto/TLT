import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { mockProject, makeObject, makeElectricalPage, renderPage, openElectricalTableSettingsOtherTab } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage cable-meta — cable source & type fields', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
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

    const row = await screen.findByRole('row', { name: /Труба-1/ });
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

  it('показывает лейбл внешнего сохранённого кабеля только во внешнем источнике', async () => {
    const { getElectricalPage, listCables } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    useAuthStore.getState().setEmployee(
      { id: 'u-1', email: 'employee@test.local', full_name: null, role: 'employee', is_active: true },
      { access: 'token' },
    );
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject()], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_mark: 'ВНШ-СР-18',
          variant_number: 1,
          results: {
            selected_cable: 'ВНШ-СР-18',
            winding_pitch: 0,
            num_circuits: 1,
            installed_cable_length: 10,
            order_cable_length: 11,
            total_power: 180,
            current: 0.8,
            voltage: 220,
          },
        },
      ]),
    );
    (listCables as ReturnType<typeof vi.fn>).mockImplementation((source: string) => {
      if (source === 'builtin') {
        return Promise.resolve([
          {
            brand: 'ТЛТ',
            model: 'ТЛТ-75',
            source: 'builtin',
            cable_type: 'self_regulating',
            power_per_meter: 75,
            max_temperature: 65,
            min_temperature: -60,
            voltage: 220,
          },
        ]);
      }
      if (source === 'extended') {
        return Promise.resolve([
          {
            brand: 'ВНШ-СР',
            model: 'ВНШ-СР-18',
            source: 'extended',
            cable_type: 'self_regulating',
            power_per_meter: 18,
            max_temperature: 90,
            min_temperature: -55,
            params: { voltage: 220 },
          },
        ]);
      }
      return Promise.resolve([
        {
          brand: 'ТЛТ',
          model: 'ТЛТ-75',
          source: 'builtin',
          cable_type: 'self_regulating',
          power_per_meter: 75,
          max_temperature: 65,
          min_temperature: -60,
          voltage: 220,
        },
        {
          brand: 'ТЛТ',
          model: 'ТЛТ-75',
          source: 'extended',
          cable_type: 'self_regulating',
          power_per_meter: 75,
          max_temperature: 65,
          min_temperature: -60,
          params: { voltage: 220 },
        },
        {
          brand: 'ВНШ-СР',
          model: 'ВНШ-СР-18',
          source: 'extended',
          cable_type: 'self_regulating',
          power_per_meter: 18,
          max_temperature: 90,
          min_temperature: -55,
          params: { voltage: 220 },
        },
      ]);
    });

    const employeeProject = { ...mockProject, user_id: 'u-1', session_id: null };
    useProjectStore.getState().setCurrentProject(employeeProject);
    const firstRender = renderPage();

    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const externalSourceDialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    await openElectricalTableSettingsOtherTab(user, externalSourceDialog);
    await user.click(within(externalSourceDialog).getByText('Внешняя'));
    await user.click(within(externalSourceDialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Настройки таблицы электрорасчёта' })).not.toBeInTheDocument();
    });
    const row = screen.getAllByText('Труба-1')[0].closest('tr') as HTMLTableRowElement;
    fireEvent.click(row);
    await user.click(within(row).getByRole('button', { name: 'Выбор' }));

    expect(await screen.findByText('Выбор марки кабеля')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/ВНШ-СР-18/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText('внеш.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Выбор марки кабеля/ })).not.toBeInTheDocument();
    });

    firstRender.unmount();
    useProjectStore.getState().setCurrentProject(employeeProject);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Настройки' }));
    const allSourceDialog = await screen.findByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
    await openElectricalTableSettingsOtherTab(user, allSourceDialog);
    await user.click(within(allSourceDialog).getByText('Все'));
    await user.click(within(allSourceDialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Настройки таблицы электрорасчёта' })).not.toBeInTheDocument();
    });
    const nextRow = screen.getAllByText('Труба-1')[0].closest('tr') as HTMLTableRowElement;
    fireEvent.click(nextRow);
    await user.click(within(nextRow).getByRole('button', { name: 'Выбор' }));

    await waitFor(() => {
      expect(screen.queryByText('внеш.')).not.toBeInTheDocument();
    });
  });

});
