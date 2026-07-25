import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useProjectStore } from '@/store/projectStore';
import type { ElectricalCandidate } from '@/types/calculation';
import { mockProject, makeObject, makeElectricalPage, renderPage } from '@/__tests__/integration/pages/electrical/elecCalcPageHarness';
import { resetElecCalcIntegrationState } from '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';
import '@/__tests__/integration/pages/electrical/elecCalcPageTestEnv';

describe('ElecCalcPage candidates — custom folders', () => {
  beforeEach(() => {
    resetElecCalcIntegrationState();
  });

  it('создаёт пользовательскую папку и фильтрует варианты по связям папки', async () => {
    const {
      addElectricalCandidateToFolder,
      createElectricalCandidateFolder,
      getElectricalPage,
      listElectricalCandidateFolders,
      listElectricalCandidates,
    } = await import('@/api/calculations');
    const user = (await import('@testing-library/user-event')).default.setup();
    const candidates: ElectricalCandidate[] = [
      {
        id: 'cand-1',
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'self_regulating',
        cable_source: 'builtin',
        cable_mark: 'ТЛТ-10',
        dedupe_key: 'v1:cand-1',
        mode: 'manual',
        status: 'applicable',
        priority: 0,
        is_recommended: false,
        is_pinned: false,
        is_applied: false,
        reason_code: null,
        reason_message: null,
        engineer_comment: null,
        params: {},
        results: { num_circuits: 1 },
        cable_snapshot: null,
        warnings: [],
        risk_flags: [],
        candidate_meta: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'cand-2',
        project_id: 'p-1',
        object_id: 'o-1',
        variant_number: 1,
        cable_type: 'self_regulating',
        cable_source: 'builtin',
        cable_mark: 'ТЛТ-20',
        dedupe_key: 'v1:cand-2',
        mode: 'manual',
        status: 'applicable',
        priority: 0,
        is_recommended: false,
        is_pinned: false,
        is_applied: false,
        reason_code: null,
        reason_message: null,
        engineer_comment: null,
        params: {},
        results: { num_circuits: 1 },
        cable_snapshot: null,
        warnings: [],
        risk_flags: [],
        candidate_meta: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
    let folders = [] as Array<{
      id: string;
      project_id: string;
      object_id: string;
      variant_number: number;
      name: string;
      color: string | null;
      sort_order: number;
      candidate_ids: string[];
      created_at: string;
      updated_at: string;
    }>;
    (listElectricalCandidates as ReturnType<typeof vi.fn>).mockResolvedValue(candidates);
    (listElectricalCandidateFolders as ReturnType<typeof vi.fn>).mockImplementation(async () => folders);
    (createElectricalCandidateFolder as ReturnType<typeof vi.fn>).mockImplementation(async (payload) => {
      const folder = {
        id: 'folder-1',
        project_id: payload.project_id,
        object_id: payload.object_id,
        variant_number: payload.variant_number,
        name: payload.name,
        color: null,
        sort_order: 10,
        candidate_ids: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      folders = [folder];
      return folder;
    });
    (addElectricalCandidateToFolder as ReturnType<typeof vi.fn>).mockImplementation(
      async (folderId: string, candidateId: string) => {
        folders = folders.map((folder) => folder.id === folderId
          ? { ...folder, candidate_ids: [...new Set([...folder.candidate_ids, candidateId])] }
          : folder);
        return folders.find((folder) => folder.id === folderId);
      },
    );
    (getElectricalPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeElectricalPage([makeObject({ params: { name: 'Труба-1' } })]),
    );
    useProjectStore.getState().setCurrentProject(mockProject);
    renderPage();

    const row = await screen.findByRole('row', { name: /Труба-1/ });
    await user.click(row);
    await user.click(within(row).getByRole('button', { name: 'Подбор' }));
    const sizingDialog = await screen.findByRole('dialog', { name: /Подбор кабеля для/ });

    await user.click(within(sizingDialog).getByRole('button', { name: /Папка/ }));
    const folderNameInput = await screen.findByLabelText('Название папки вариантов');
    const folderDialog = folderNameInput.closest('[role="dialog"]') as HTMLElement | null;
    expect(folderDialog).not.toBeNull();
    if (!folderDialog) throw new Error('Folder modal did not open');
    await user.type(folderNameInput, 'Согласовать');
    await user.click(within(folderDialog).getByRole('button', { name: 'Создать' }));
    await waitFor(() => {
      expect(createElectricalCandidateFolder).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Согласовать',
        object_id: 'o-1',
        variant_number: 1,
        electrical_variant_id: '11111111-1111-4111-8111-111111111111',
      }));
    });

    await user.click(within(sizingDialog).getByRole('button', { name: /Все/ }));
    await user.click(within(sizingDialog).getByTestId('candidate-folder-cand-1'));
    await user.click(await screen.findByRole('menuitem', { name: 'Согласовать' }));
    await waitFor(() => {
      expect(addElectricalCandidateToFolder).toHaveBeenCalledWith('folder-1', 'cand-1');
    });

    await user.click(within(sizingDialog).getByRole('button', { name: /^Согласовать\s+1$/ }));
    await waitFor(() => {
      expect(within(sizingDialog).getByTestId('candidate-row-cand-1')).toBeInTheDocument();
    });
    expect(within(sizingDialog).queryByTestId('candidate-row-cand-2')).not.toBeInTheDocument();
  });

});
