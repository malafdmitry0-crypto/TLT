import { test, expect } from '@playwright/test';

import {
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';
import {
  applyCandidate,
  candidatePinned,
  candidateStatus,
  clickCandidateGridUntil,
  clickCanvasPoint,
  createManualCandidate,
  electricalCalcMarkForObject,
  expectAppliedCandidateIds,
  expectCandidateGlideCanvas,
  expectElectricalCalcMark,
  listCandidates,
  listFolders,
  openCandidateDialog,
} from './helpers/electrical-candidate-selection';

test.describe('electrical candidate selection — mark / folder', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('electrical.tableEngine', 'table');
    });
  });

  test('пометка, избранное и запрет не меняют выбранный кандидат', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E candidate marker ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      pipe_length: 3,
      insulation_layers: [
        { thickness: 0.15, material: 'mineral_wool_boards_120' },
      ],
      ambient_temperature: 29,
      process_temperature: 30,
    });
    const first = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-10');
    const second = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-20');
    await applyCandidate(page, sessionId, first.candidate.id);

    const dialog = await openCandidateDialog(page, pipeName);
    const candidateCanvas = await expectCandidateGlideCanvas(dialog);

    await clickCanvasPoint(page, candidateCanvas, 28, 47);
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [first.candidate.id]);
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, 'ТЛТ-10');

    await clickCandidateGridUntil(
      page,
      candidateCanvas,
      73,
      [28],
      async () => (await dialog.getByTestId('candidate-compare-bar').count()) > 0,
    );
    await expect(dialog.getByTestId('candidate-compare-bar')).toContainText('Сравнение: 2 вариантов');
    await dialog.getByRole('button', { name: 'Сбросить сравнение' }).click();
    await expect(dialog.getByTestId('candidate-compare-bar')).toHaveCount(0);

    await clickCandidateGridUntil(
      page,
      candidateCanvas,
      73,
      [174, 190, 204],
      async () => (await page.locator('.electrical-candidate-glide-action-menu').count()) > 0,
    );
    await page.getByRole('menuitem', { name: 'Избранное' }).click();
    await expect.poll(
      async () => candidatePinned(page, projectId, sessionId, pipe.id, second.candidate.id),
    ).toBe(true);
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [first.candidate.id]);
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, 'ТЛТ-10');
    await dialog.getByRole('button', { name: /Избранное/ }).click();
    await expectCandidateGlideCanvas(dialog);
    await dialog.getByRole('button', { name: /Все/ }).click();

    await clickCandidateGridUntil(
      page,
      candidateCanvas,
      73,
      [230, 245, 260],
      async () => (await candidateStatus(page, projectId, sessionId, pipe.id, second.candidate.id)) === 'excluded',
    );
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [first.candidate.id]);
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, 'ТЛТ-10');
  });

  test('пользовательская папка фильтрует варианты и не меняет основной расчёт', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E candidate folder ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      pipe_length: 3,
      insulation_layers: [
        { thickness: 0.15, material: 'mineral_wool_boards_120' },
      ],
      ambient_temperature: 29,
      process_temperature: 30,
    });
    await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-10');
    await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-20');
    const initialCableMark = await electricalCalcMarkForObject(page, projectId, sessionId, pipe.id);

    const dialog = await openCandidateDialog(page, pipeName);
    const candidateCanvas = await expectCandidateGlideCanvas(dialog);
    await dialog.getByRole('button', { name: /Папка/ }).click();
    const folderDialog = page.getByRole('dialog', { name: 'Новая папка' });
    await folderDialog.getByLabel('Название папки вариантов').fill('Согласовать');
    await folderDialog.getByRole('button', { name: 'Создать' }).click();
    await expect(dialog.getByRole('button', { name: /^Согласовать\s+0$/ })).toBeVisible();

    await dialog.getByRole('button', { name: /Все/ }).click();
    await clickCandidateGridUntil(
      page,
      candidateCanvas,
      47,
      [174, 190, 204],
      async () => (await page.locator('.electrical-candidate-glide-action-menu').count()) > 0,
    );
    await page.getByRole('menuitem', { name: 'Согласовать' }).click();
    await expect.poll(async () => {
      const folders = await listFolders(page, projectId, sessionId, pipe.id);
      const candidates = await listCandidates(page, projectId, sessionId, pipe.id);
      const marksById = new Map(candidates.map((candidate) => [candidate.id, candidate.cable_mark]));
      return (folders.find((folder) => folder.name === 'Согласовать')?.candidate_ids ?? [])
        .map((candidateId) => marksById.get(candidateId));
    }).toContain('ТЛТ-20');
    await dialog.getByRole('button', { name: /^Согласовать\s+1$/ }).click();

    await expectCandidateGlideCanvas(dialog);
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, initialCableMark);
  });

});
