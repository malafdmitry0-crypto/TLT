import { test, expect } from '@playwright/test';

import {
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';
import {
  createCandidate,
  expectElectricalCalcMark,
  listCandidates,
} from './helpers/electrical-candidate-selection';

test.describe('electrical candidate selection — auto dedupe', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('electrical.tableEngine', 'table');
    });
  });

  test('повторный идентичный авторасчёт не создаёт дубль', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E candidate dedupe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      pipe_length: 3,
      insulation_thickness: 0.15,
      ambient_temperature: 29,
      process_temperature: 30,
    });

    const first = await createCandidate(page, projectId, sessionId, pipe.id, { mode: 'auto' });
    const second = await createCandidate(page, projectId, sessionId, pipe.id, { mode: 'auto' });
    const third = await createCandidate(page, projectId, sessionId, pipe.id, { mode: 'auto' });

    expect(first.action).toBe('created');
    expect(second.action).toBe('updated');
    expect(third.action).toBe('updated');
    expect(first.candidate.id).toBe(second.candidate.id);
    expect(second.candidate.id).toBe(third.candidate.id);

    const candidates = await listCandidates(page, projectId, sessionId, pipe.id);
    expect(candidates).toHaveLength(1);
  });

  test('ошибочный авторасчёт дедуплицируется только при тех же параметрах', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E candidate error dedupe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      pipe_length: 3,
      insulation_thickness: 0.15,
      ambient_temperature: 29,
      process_temperature: 30,
    });

    const first = await createCandidate(page, projectId, sessionId, pipe.id, {
      mode: 'auto',
      electrical_params: { number_of_threads: 0 },
    });
    const repeat = await createCandidate(page, projectId, sessionId, pipe.id, {
      mode: 'auto',
      electrical_params: { number_of_threads: 0 },
    });
    const differentParams = await createCandidate(page, projectId, sessionId, pipe.id, {
      mode: 'auto',
      electrical_params: { number_of_threads: 101 },
    });

    expect(first.action).toBe('created');
    expect(first.candidate.status).toBe('error');
    expect(repeat.action).toBe('updated');
    expect(repeat.candidate.status).toBe('error');
    expect(repeat.candidate.id).toBe(first.candidate.id);
    expect(differentParams.action).toBe('created');
    expect(differentParams.candidate.status).toBe('error');
    expect(differentParams.candidate.id).not.toBe(first.candidate.id);

    const candidates = await listCandidates(page, projectId, sessionId, pipe.id);
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual(
      [first.candidate.id, differentParams.candidate.id].sort(),
    );
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, null);
  });

});
