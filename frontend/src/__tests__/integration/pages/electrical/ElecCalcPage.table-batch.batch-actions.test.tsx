import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCalcSummary } from '@/types/calculation';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { apiMocks, electricalAssignmentPanelMock, resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage table-batch — batch queue & assignment gates', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('ставит batch ТТ в очередь с electrical params, а не пустым набором', async () => {
    const { enqueueElectricalBatchJob, getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'task-1',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      electrical_variant_id: '11111111-1111-4111-8111-111111111111',
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
      expect(screen.getByRole('button', { name: /Пересчитать выбранные \(0\)/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('Труба-1')).toBeInTheDocument();
    });
    const rowCheckbox = document.querySelector('tbody .ant-checkbox-input') as HTMLInputElement;
    fireEvent.click(rowCheckbox);
    await user.click(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i }));

    await waitFor(() => {
      expect(enqueueElectricalBatchJob).toHaveBeenCalledWith(
        'p-1',
        'builtin',
        1,
        'self_regulating_tt',
        expect.objectContaining({
          supplyVoltage: 220,
          windingCoefficient: 1,
          layingStep: 0.1,
          objectIds: ['o-1'],
          skipManual: true,
        }),
      );
    });
    expect(apiMocks.enqueueVariantBatch).toHaveBeenCalledWith(
      'p-1',
      '11111111-1111-4111-8111-111111111111',
      'builtin',
      'self_regulating_tt',
      expect.any(Object),
    );
    const options = (enqueueElectricalBatchJob as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(options.objectOverrides).toBeUndefined();
  });

  it('fail-closed ограничивает row actions и explicit selected payload назначениями ЭР', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const objects = [
      makeObject({ id: 'o-compatible', params: { name: 'Совместимый объект' } }),
      makeObject({
        id: 'o-unassigned',
        sort_order: 1,
        params: { name: 'Нераспределённый объект' },
      }),
      makeObject({
        id: 'o-other-system',
        sort_order: 2,
        params: { name: 'Объект другой системы' },
      }),
      makeObject({
        id: 'o-three-core',
        sort_order: 3,
        params: { name: 'Трёхжильный объект' },
      }),
    ];
    const calculations: ElectricalCalcSummary[] = objects.map((object, index) => ({
      id: `calc-${index}`,
      object_id: object.id,
      cable_type: object.id === 'o-three-core' ? 'three_core' : 'self_regulating',
      cable_mark: object.id === 'o-three-core' ? 'ТТ Р3 x 0,5-0,6' : 'ТЛТ-20',
      variant_number: 1,
      results: { selected_cable: 'ТЛТ-20' },
    }));
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage(
        objects,
        calculations,
        {},
        {},
        [
          {
            object_id: 'o-compatible',
            system_type: 'self_regulating',
            assignment_state: 'stale',
            version: 4,
          },
          {
            object_id: 'o-unassigned',
            system_type: null,
            assignment_state: 'unassigned',
            version: 2,
          },
          {
            object_id: 'o-other-system',
            system_type: 'resistive',
            assignment_state: 'ready',
            version: 8,
          },
          {
            object_id: 'o-three-core',
            system_type: 'resistive',
            assignment_state: 'ready',
            version: 3,
          },
        ],
      ),
    );
    apiMocks.enqueueBatch.mockResolvedValue({
      id: 'task-assignment-scope',
      type: 'electrical_batch',
      status: 'enqueued',
      project_id: 'p-1',
      electrical_variant_id: '11111111-1111-4111-8111-111111111111',
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
    renderPage();

    const compatibleRow = await screen.findByRole('row', { name: /Совместимый объект/ });
    const compatibleCheckbox = within(compatibleRow).getByRole('checkbox');
    expect(compatibleCheckbox).toBeEnabled();
    expect(screen.queryByText('Нераспределённый объект')).not.toBeInTheDocument();
    expect(screen.queryByText('Объект другой системы')).not.toBeInTheDocument();

    electricalAssignmentPanelMock.initialSystemView = null;
    act(() => electricalAssignmentPanelMock.props?.onSystemViewChange?.('unassigned'));
    const unassignedRow = await screen.findByRole('row', { name: /Нераспределённый объект/ });
    expect(within(unassignedRow).getByRole('checkbox')).toBeEnabled();
    await user.click(within(unassignedRow).getByText('Нераспределённый объект'));
    expect(within(unassignedRow).getByRole('button', { name: 'Выбор' })).toBeDisabled();
    expect(within(unassignedRow).getByRole('button', { name: 'Подбор' })).toBeDisabled();

    act(() => electricalAssignmentPanelMock.props?.onSystemViewChange?.('resistive'));
    const otherSystemRow = await screen.findByRole('row', { name: /Объект другой системы/ });
    expect(within(otherSystemRow).getByRole('checkbox')).toBeDisabled();
    expect(within(otherSystemRow).getByRole('checkbox'))
      .toHaveAccessibleName(/Резистив.*совместимый тип/i);

    act(() => electricalAssignmentPanelMock.props?.onSystemViewChange?.('self_regulating'));
    const compatibleRowAfterSwitch = await screen.findByRole('row', { name: /Совместимый объект/ });
    const compatibleCheckboxAfterSwitch = within(compatibleRowAfterSwitch).getByRole('checkbox');
    fireEvent.click(compatibleCheckboxAfterSwitch);
    await user.click(screen.getByRole('button', { name: /Пересчитать выбранные \(1\)/i }));

    await waitFor(() => {
      expect(apiMocks.enqueueVariantBatch).toHaveBeenCalledWith(
        'p-1',
        '11111111-1111-4111-8111-111111111111',
        'builtin',
        'self_regulating_tt',
        expect.objectContaining({
          objectIds: ['o-compatible'],
        }),
      );
    });
  });

});
