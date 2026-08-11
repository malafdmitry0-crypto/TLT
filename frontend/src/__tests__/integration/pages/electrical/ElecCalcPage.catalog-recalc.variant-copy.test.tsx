import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { apiMocks, electricalVariantApiMocks, resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage catalog / recalculation / selection — variant copy', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('копирует выбранный ЭР по UUID без запуска batch-пересчёта', async () => {
    const {
      enqueueElectricalBatchJob,
      getElectricalPage,
      listElectricalCandidateFolders,
      listElectricalCandidates,
      selectCableForVariants,
    } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage(
      [makeObject()],
      [
        {
          id: 'calc-1',
          object_id: 'o-1',
          cable_type: 'self_regulating',
          cable_type_source: 'auto',
          cable_mark: 'ТЛТ-25',
          cable_mark_source: 'auto',
          cable_snapshot: null,
          cable_snapshot_status: null,
          variant_number: 1,
          params: {},
          results: { selected_cable: 'ТЛТ-25', order_cable_length: 10 },
        },
      ],
      { total_objects: 2, electrical_calculations_total: 1 },
    ));
    const copiedVariant = {
      id: '55555555-5555-4555-8555-555555555555',
      project_id: 'p-1',
      name: 'Копия ЭР1',
      sort_order: 3,
      is_active: false,
      copied_from_id: '11111111-1111-4111-8111-111111111111',
      legacy_variant_number: null,
      specification_state: 'not_generated',
      created_at: '2026-07-18T10:00:00Z',
      updated_at: '2026-07-18T10:00:00Z',
    };
    const defaultList = electricalVariantApiMocks.list.getMockImplementation();
    const initialVariants = (await defaultList!()).slice(0, 3);
    let copyCreated = false;
    electricalVariantApiMocks.list.mockImplementation(async () =>
      copyCreated ? [...initialVariants, copiedVariant] : initialVariants);
    electricalVariantApiMocks.copy.mockImplementation(async () => {
      copyCreated = true;
      return copiedVariant;
    });
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    const copyButton = await screen.findByRole('button', {
      name: /Создать копию выбранного ЭР «ЭР1»/i,
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    const pageCallsBeforeCopy = (getElectricalPage as ReturnType<typeof vi.fn>).mock.calls.length;
    const capabilityCallsBeforeCopy = apiMocks.electricalCapabilities.mock.calls.length;
    const candidateCallsBeforeCopy = (listElectricalCandidates as ReturnType<typeof vi.fn>)
      .mock.calls.length;
    const folderCallsBeforeCopy = (listElectricalCandidateFolders as ReturnType<typeof vi.fn>)
      .mock.calls.length;

    await user.click(copyButton);

    await waitFor(() => {
      expect(electricalVariantApiMocks.copy).toHaveBeenCalledWith(
        'p-1',
        '11111111-1111-4111-8111-111111111111',
        {},
        expect.any(String),
      );
    });
    expect(await screen.findByText(/«Копия ЭР1»: расчётные действия временно недоступны/))
      .toBeInTheDocument();
    // Unified scope chrome lives inside calc workspace; UUID-only ER has no workspace yet.
    expect(screen.queryByTestId('electrical-assignment-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Копия ЭР1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(document.querySelector('#electrical-variant-workspace')).toBeNull();
    expect((getElectricalPage as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      pageCallsBeforeCopy,
    );
    expect(apiMocks.electricalCapabilities).toHaveBeenCalledTimes(capabilityCallsBeforeCopy);
    expect(listElectricalCandidates).toHaveBeenCalledTimes(candidateCallsBeforeCopy);
    expect(listElectricalCandidateFolders).toHaveBeenCalledTimes(folderCallsBeforeCopy);
    expect(selectCableForVariants).not.toHaveBeenCalled();
    expect(enqueueElectricalBatchJob).not.toHaveBeenCalled();
  });

  it('показывает lifecycle error и не повторяет copy с новой семантикой', async () => {
    const { getElectricalPage } = await import('@/api/calculations');
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(makeElectricalPage([makeObject()]));
    const defaultList = electricalVariantApiMocks.list.getMockImplementation();
    const initialVariants = (await defaultList!()).slice(0, 3);
    electricalVariantApiMocks.list.mockResolvedValue(initialVariants);
    electricalVariantApiMocks.copy.mockRejectedValueOnce(
      new Error('Копирование требует UUID cutover'),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    const user = (await import('@testing-library/user-event')).default.setup();
    renderPage();

    const copyButton = await screen.findByRole('button', {
      name: /Создать копию выбранного ЭР «ЭР1»/i,
    });
    await waitFor(() => expect(copyButton).toBeEnabled());
    await user.click(copyButton);

    expect(await screen.findByText('Копирование требует UUID cutover')).toBeInTheDocument();
    expect(electricalVariantApiMocks.copy).toHaveBeenCalledTimes(1);
  });
});
