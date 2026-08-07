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
import { ensureElectricalInitialized } from './helpers/phase5-api';

async function assignToSelfRegulating(page: import('@playwright/test').Page, objectId: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const [variant] = await ensureElectricalInitialized(page);
  const assignments = await page.request.get(
    `${process.env.E2E_API_BASE ?? 'http://127.0.0.1:8000'}/api/v1/projects/${projectId}/electrical-variants/${variant.id}/assignments`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(assignments.status()).toBe(200);
  const body = await assignments.json() as { items: Array<{ object_id: string; version: number }> };
  const row = body.items.find((item) => item.object_id === objectId);
  expect(row).toBeTruthy();
  const response = await page.request.patch(
    `${process.env.E2E_API_BASE ?? 'http://127.0.0.1:8000'}/api/v1/projects/${projectId}/electrical-variants/${variant.id}/assignments`,
    {
      headers: { 'X-Session-Id': sessionId },
      data: {
        system_type: 'self_regulating',
        items: [{ object_id: objectId, expected_version: row!.version }],
      },
    },
  );
  expect(response.status()).toBe(200);
}

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
      insulation_layers: [
        { thickness: 0.15, material: 'mineral_wool_boards_120' },
      ],
      ambient_temperature: 29,
      process_temperature: 30,
    });
    await assignToSelfRegulating(page, pipe.id);

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
      insulation_layers: [
        { thickness: 0.15, material: 'mineral_wool_boards_120' },
      ],
      ambient_temperature: 29,
      process_temperature: 30,
    });
    await assignToSelfRegulating(page, pipe.id);

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

  test('десять одновременных одинаковых авторасчётов атомарно создают один кандидат', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipe = await createCalculatedPipe(page, `E2E candidate race ${Date.now()}`, {
      pipe_length: 3,
      insulation_layers: [
        { thickness: 0.15, material: 'mineral_wool_boards_120' },
      ],
      ambient_temperature: 29,
      process_temperature: 30,
    });
    await assignToSelfRegulating(page, pipe.id);

    const attempts = await Promise.all(
      Array.from({ length: 10 }, () =>
        createCandidate(page, projectId, sessionId, pipe.id, { mode: 'auto' }),
      ),
    );

    expect(new Set(attempts.map((attempt) => attempt.candidate.id)).size).toBe(1);
    expect(attempts.filter((attempt) => attempt.action === 'created')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.action === 'updated')).toHaveLength(9);
    const candidates = await listCandidates(page, projectId, sessionId, pipe.id);
    expect(candidates).toHaveLength(1);
  });

});
