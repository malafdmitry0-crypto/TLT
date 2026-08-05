import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { mockProject, makeObject, makeElectricalPage, renderPage, openElectricalTableSettingsOtherTab } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

/** Under concurrent agent-dod load, elec table rows can exceed default findBy timeout. */

describe('ElecCalcPage cable metadata / source / inline — source-inline-batch', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
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
  it('не пересчитывает объект из inline-полей таблицы', async () => {
    const { getElectricalPage, selectCableForVariants } = await import('@/api/calculations');
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
    (selectCableForVariants as ReturnType<typeof vi.fn>).mockResolvedValue([{
      id: 'c-1',
      object_id: 'o-1',
      cable_type: 'self_regulating',
      cable_mark: 'ТЛТ-30',
      variant_number: 1,
      results: { winding_pitch: 80, num_circuits: 1 },
    }]);
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('ТЛТ-30').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByText('Труба-1').closest('tr') as HTMLTableRowElement);
    expect(document.querySelector('.electrical-spreadsheet input[role="spinbutton"]')).toBeNull();
    expect(document.querySelector('.electrical-spreadsheet .ant-select-selector')).toBeNull();
    expect(selectCableForVariants).not.toHaveBeenCalled();
  });
  it('ставит batch в очередь с выбранным типом ТТН/ТТВ/ТТХ и его параметрами', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
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
    const rowCheckbox = document.querySelector('tbody .ant-checkbox-input') as HTMLInputElement;
    fireEvent.click(rowCheckbox);
    await waitFor(() => {
      expect(screen.getByText(/Тип для пересчёта/i)).toBeInTheDocument();
    });
    // TltSelect shows selected value in trigger and may mirror label text elsewhere.
    expect(screen.getAllByText('ТТН/ТТВ/ТТХ').length).toBeGreaterThan(0);
    await user.type(await screen.findByLabelText('T3 поддержания'), '50');
    await user.click(screen.getByRole('button', { name: /Пересчитать все · ЭР1/i }));
    await user.click(await screen.findByRole('button', { name: /Да, пересчитать все/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          maintainTemperature: 50,
          forceCableType: true,
          skipManual: true,
        }),
      );
    });
    const options = (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(options).not.toHaveProperty('supplyVoltage');
    expect(options).not.toHaveProperty('connectionType');
    expect(options).not.toHaveProperty('windingCoefficient');
    expect(options).not.toHaveProperty('aggressiveProduct');
    expect(options.objectOverrides).toBeUndefined();
  });
});
