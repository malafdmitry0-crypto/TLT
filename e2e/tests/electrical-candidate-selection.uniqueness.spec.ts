import { test, expect } from '@playwright/test';

import {
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';
import {
  applyCandidate,
  clickCandidateGridUntil,
  createManualCandidate,
  expectAppliedCandidateIds,
  expectCandidateGlideCanvas,
  expectElectricalCalcMark,
  fetchElectricalCalcs,
  listCandidates,
  openCandidateDialog,
} from './helpers/electrical-candidate-selection';

test.describe('electrical candidate selection — uniqueness / apply by id', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('electrical.tableEngine', 'table');
    });
  });

  test('уникальность вариантов ограничена таблицей candidates, основной электрорасчёт остаётся одной строкой', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E candidate scope ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      pipe_length: 3,
      insulation_thickness: 0.15,
      ambient_temperature: 29,
      process_temperature: 30,
    });

    const oneThread = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-20', {
      number_of_threads: 1,
    });
    const duplicateOneThread = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-20', {
      number_of_threads: 1,
    });
    const twoThreads = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-20', {
      number_of_threads: 2,
    });

    expect(oneThread.action).toBe('created');
    expect(duplicateOneThread.action).toBe('updated');
    expect(duplicateOneThread.candidate.id).toBe(oneThread.candidate.id);
    expect(twoThreads.action).toBe('created');
    expect(twoThreads.candidate.id).not.toBe(oneThread.candidate.id);

    await expect.poll(async () => {
      const candidates = await listCandidates(page, projectId, sessionId, pipe.id);
      return candidates.map((candidate) => candidate.id).sort();
    }).toEqual([oneThread.candidate.id, twoThreads.candidate.id].sort());

    await applyCandidate(page, sessionId, oneThread.candidate.id);
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [oneThread.candidate.id]);
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, 'ТЛТ-20');

    await applyCandidate(page, sessionId, twoThreads.candidate.id);
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [twoThreads.candidate.id]);

    await expect.poll(async () => {
      const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
      return calcs.filter((calc) => calc.object_id === pipe.id).map((calc) => calc.cable_mark);
    }).toEqual(['ТЛТ-20']);

    const candidatesAfterApply = await listCandidates(page, projectId, sessionId, pipe.id);
    expect(candidatesAfterApply.map((candidate) => candidate.id).sort()).toEqual(
      [oneThread.candidate.id, twoThreads.candidate.id].sort(),
    );
  });

  test('галочка выбирает по candidate.id и снимает прошлый выбор при одинаковой марке и разных нитках', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E candidate threads ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      pipe_length: 3,
      insulation_thickness: 0.15,
      ambient_temperature: 29,
      process_temperature: 30,
    });
    const first = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-20', {
      number_of_threads: 1,
    });
    const second = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-20', {
      number_of_threads: 2,
    });
    expect(first.action).toBe('created');
    expect(second.action).toBe('created');
    expect(first.candidate.id).not.toBe(second.candidate.id);
    await applyCandidate(page, sessionId, first.candidate.id);

    let dialog = await openCandidateDialog(page, pipeName);
    let candidateCanvas = await expectCandidateGlideCanvas(dialog);
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [first.candidate.id]);

    await clickCandidateGridUntil(
      page,
      candidateCanvas,
      73,
      [80, 95, 110, 125, 140, 155],
      async () => {
        const candidates = await listCandidates(page, projectId, sessionId, pipe.id);
        return candidates.find((candidate) => candidate.id === second.candidate.id)?.is_applied === true;
      },
    );
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [second.candidate.id]);
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, 'ТЛТ-20');

    await page.reload();
    dialog = await openCandidateDialog(page, pipeName);
    candidateCanvas = await expectCandidateGlideCanvas(dialog);
    await expect(candidateCanvas).toBeVisible();
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [second.candidate.id]);
  });
});
