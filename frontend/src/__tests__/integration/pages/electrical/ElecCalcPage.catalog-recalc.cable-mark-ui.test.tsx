import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY } from '@/utils/electricalTableColumns';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage catalog / recalculation / selection — cable mark UI', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('не показывает источник ручного выбора в колонке марки', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const objects = [
      makeObject({ id: 'o-1', params: { name: 'Труба-1' } }),
      makeObject({ id: 'o-2', sort_order: 1, params: { name: 'Труба-2' } }),
    ];
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(objects, [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          cable_mark_source: 'manual',
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
        {
          id: 'c-2',
          object_id: 'o-2',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          cable_mark_source: 'auto',
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_type', 'cable_mark'],
      columns: { cable_mark: { widthPct: 18 } },
    }));
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('row', { name: /Труба-1/ })).toHaveTextContent('30ТТВ2-СТ');
      expect(screen.getByRole('row', { name: /Труба-1/ })).not.toHaveTextContent('ручн.');
      expect(screen.getByRole('row', { name: /Труба-2/ })).not.toHaveTextContent('ручн.');
    });
  });

  it('показывает в активной ячейке марки кнопки выбора и подбора', async () => {
    const {
      createElectricalCandidate,
      getElectricalPage,
      listElectricalCandidates,
    } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createElectricalCandidate as ReturnType<typeof vi.fn>).mockResolvedValue({
      action: 'created',
      candidate: {
        id: 'cand-1',
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'self_regulating_tt',
        cable_source: 'builtin',
        cable_mark: '30ТТВ2-СТ',
        dedupe_key: 'v1:test',
        mode: 'auto',
        status: 'applicable',
        priority: 0,
        is_recommended: true,
        is_pinned: false,
        is_applied: false,
        reason_code: null,
        reason_message: null,
        engineer_comment: null,
        params: {},
        results: { total_power: 1000, order_cable_length: 55 },
        cable_snapshot: null,
        warnings: [],
        risk_flags: [],
        candidate_meta: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    });
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })], [
        {
          id: 'c-1',
          object_id: 'o-1',
          cable_type: 'self_regulating_tt',
          cable_mark: '30ТТВ2-СТ',
          cable_mark_source: 'manual',
          cable_snapshot: {
            cable_mark: '30ТТВ2-СТ',
            cable_type: 'self_regulating_tt',
            actual_catalog_source: 'builtin',
            technical: {
              model: '30ТТВ2',
              brand: 'ТТВ',
              voltage: 220,
              nominal_power: 30,
              q1: -0.141,
              q2: 32,
              max_product_temp: 120,
              max_vapor_temp: 210,
            },
          },
          variant_number: 1,
          results: { selected_cable: '30ТТВ2-СТ' },
        },
      ]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    localStorage.setItem(ELECTRICAL_GUEST_TABLE_COLUMN_STORAGE_KEY, JSON.stringify({
      version: 1,
      visibleOrder: ['index', 'object_name', 'cable_mark'],
      columns: { cable_mark: { widthPct: 22 } },
    }));
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    fireEvent.click(row);

    expect(row).toHaveTextContent('30ТТВ2-СТ');
    expect(row).not.toHaveTextContent('ручн.');
    expect(within(row).getByRole('button', { name: 'Выбор' })).toBeEnabled();
    const sizingButton = within(row).getByRole('button', { name: 'Подбор' });
    expect(sizingButton).toBeEnabled();

    await user.click(sizingButton);
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });
    expect(sizingDialog).toBeInTheDocument();
    expect(within(sizingDialog).queryByRole('group', { name: 'Характеристики: кабель' })).not.toBeInTheDocument();
    const objectCharacteristics = within(sizingDialog).getByRole('group', { name: 'Характеристики: объект' });
    expect(objectCharacteristics).toHaveTextContent('Тип объекта:');
    expect(objectCharacteristics).toHaveTextContent('Труба');
    expect(objectCharacteristics).toHaveTextContent('Диаметр:');
    expect(objectCharacteristics).toHaveTextContent('Длина:');
    expect(
      (objectCharacteristics.querySelector('.cable-picker-characteristics-columns') as HTMLElement)
        .style
        .getPropertyValue('--cable-picker-characteristics-column-count'),
      ).toBe('4');
    expect(within(sizingDialog).getByRole('radio', { name: 'Авторасчёт' })).toBeChecked();
    // findAllByText: таблица кандидатов рендерится асинхронно — под нагрузкой
    // полного прогона getAllByText успевал отработать до её появления (flaky).
    expect((await within(sizingDialog).findAllByText('Пометка')).length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Действия').length).toBeGreaterThan(0);
    expect(within(sizingDialog).queryByRole('columnheader', { name: 'Статус' })).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByText('T3, °C')).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByText('T проп., °C')).not.toBeInTheDocument();
    expect(within(sizingDialog).queryByText('Агр.')).not.toBeInTheDocument();
    expect(within(sizingDialog).getAllByText('Мощность, Вт').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('Ток, А').length).toBeGreaterThan(0);
    expect(within(sizingDialog).getAllByText('U расч., В').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(listElectricalCandidates).toHaveBeenCalledWith(
        'p-1',
        'o-1',
        1,
        '11111111-1111-4111-8111-111111111111',
      );
    });
    expect(createElectricalCandidate).not.toHaveBeenCalled();
    const autoButton = within(sizingDialog).getByRole('button', { name: 'Запустить авторасчёт' });
    expect(autoButton).toBeEnabled();
    expect(within(sizingDialog).getByText(/Вариантов пока нет/)).toBeInTheDocument();
    await user.click(autoButton);
    await waitFor(() => {
      expect(createElectricalCandidate).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        electrical_variant_id: '11111111-1111-4111-8111-111111111111',
        cable_type: 'self_regulating_tt',
        mode: 'auto',
        cable_mark: null,
      }));
    });
    expect(within(sizingDialog).queryByRole('button', { name: 'Применить' })).not.toBeInTheDocument();
  });
});
