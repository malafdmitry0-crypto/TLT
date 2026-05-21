import { test, expect, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';

type Candidate = {
  id: string;
  cable_mark: string | null;
  is_applied: boolean;
  status?: string;
};

type CandidateUpsertResponse = {
  candidate: Candidate;
  action: 'created' | 'updated';
};

async function createCandidate(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  data: Record<string, unknown>,
): Promise<CandidateUpsertResponse> {
  const response = await page.request.post(`${API_BASE}/api/v1/calc/electrical/candidates`, {
    headers: { 'X-Session-Id': sessionId },
    data: {
      project_id: projectId,
      object_id: objectId,
      variant_number: 1,
      cable_type: 'self_regulating',
      cable_source: 'builtin',
      ...data,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<CandidateUpsertResponse>;
}

async function createManualCandidate(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  cableMark: string,
  electricalParams?: Record<string, unknown>,
  variantNumber = 1,
) {
  const payload = await createCandidate(page, projectId, sessionId, objectId, {
    variant_number: variantNumber,
    mode: 'manual',
    cable_mark: cableMark,
    electrical_params: electricalParams,
  });
  return payload;
}

async function applyCandidate(page: Page, sessionId: string, candidateId: string) {
  const response = await page.request.post(
    `${API_BASE}/api/v1/calc/electrical/candidates/${candidateId}/apply`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(response.ok()).toBeTruthy();
}

async function listCandidates(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  variantNumber = 1,
) {
  const response = await page.request.get(`${API_BASE}/api/v1/calc/electrical/candidates`, {
    headers: { 'X-Session-Id': sessionId },
    params: {
      project_id: projectId,
      object_id: objectId,
      variant_number: variantNumber,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<Candidate[]>;
}

async function fetchElectricalCalcs(
  page: Page,
  projectId: string,
  sessionId: string,
  variantNumber = 1,
) {
  const response = await page.request.get(`${API_BASE}/api/v1/calc/electrical`, {
    headers: { 'X-Session-Id': sessionId },
    params: { project_id: projectId, variant_number: variantNumber },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<Array<{ object_id: string; cable_mark: string | null }>>;
}

async function expectAppliedCandidateIds(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  expectedIds: string[],
  variantNumber = 1,
) {
  await expect
    .poll(async () => {
      const candidates = await listCandidates(page, projectId, sessionId, objectId, variantNumber);
      return candidates
        .filter((candidate) => candidate.is_applied)
        .map((candidate) => candidate.id)
        .sort();
    })
    .toEqual([...expectedIds].sort());
}

async function expectElectricalCalcMark(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  cableMark: string | null,
  variantNumber = 1,
) {
  await expect.poll(async () => {
    const calcs = await fetchElectricalCalcs(page, projectId, sessionId, variantNumber);
    return calcs
      .filter((calc) => calc.object_id === objectId)
      .map((calc) => calc.cable_mark);
  }).toEqual(cableMark === null ? [] : [cableMark]);
}

async function openCandidateDialog(page: Page, pipeName: string) {
  await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
  const row = page.getByRole('row').filter({ hasText: pipeName }).first();
  await expect(row).toBeVisible();
  await row.click();
  await row.getByRole('button', { name: 'Подбор' }).click();

  const dialog = page.getByRole('dialog', { name: /Подбор кабеля/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('electrical candidate selection', () => {
  test('пометка, приоритет и запрет не меняют выбранный кандидат', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E candidate marker ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      pipe_length: 3,
      insulation_thickness: 0.15,
      ambient_temperature: 29,
      process_temperature: 30,
    });
    const first = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-10');
    const second = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-20');
    const errorCandidate = await createManualCandidate(
      page,
      projectId,
      sessionId,
      pipe.id,
      'НЕСУЩЕСТВУЮЩИЙ-КАБЕЛЬ',
    );
    expect(errorCandidate.candidate.status).toBe('error');
    await applyCandidate(page, sessionId, first.candidate.id);

    const dialog = await openCandidateDialog(page, pipeName);
    await expect(dialog.locator('th').filter({ hasText: /^Статус$/ })).toHaveCount(0);
    await expect(dialog.locator('[aria-label="Готов"]')).toHaveCount(0);
    await expect(dialog.getByTestId(`candidate-row-${first.candidate.id}`)).not.toHaveClass(
      /electrical-cable-sizing-table__row--error/,
    );
    await expect(dialog.getByTestId(`candidate-row-${errorCandidate.candidate.id}`)).toHaveClass(
      /electrical-cable-sizing-table__row--error/,
    );
    await expect(dialog.getByTestId(`candidate-apply-${first.candidate.id}`)).toBeEnabled();
    await expect(dialog.getByTestId(`candidate-apply-${first.candidate.id}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByTestId(`candidate-apply-${first.candidate.id}`)).toHaveAccessibleName(
      'Уже выбран кандидат ТЛТ-10',
    );

    const markerCheckbox = dialog.getByTestId(`candidate-mark-${second.candidate.id}`);
    await expect(markerCheckbox).toBeEnabled();
    await markerCheckbox.click();
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [first.candidate.id]);
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, 'ТЛТ-10');

    await dialog.getByTestId(`candidate-priority-${second.candidate.id}`).click();
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [first.candidate.id]);
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, 'ТЛТ-10');

    await dialog.getByTestId(`candidate-exclude-${second.candidate.id}`).click();
    await expect(dialog.getByTestId(`candidate-row-${second.candidate.id}`)).not.toHaveClass(
      /electrical-cable-sizing-table__row--error/,
    );
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [first.candidate.id]);
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, 'ТЛТ-10');
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
    await expect(dialog.getByTestId(`candidate-row-${first.candidate.id}`)).toBeVisible();
    await expect(dialog.getByTestId(`candidate-row-${second.candidate.id}`)).toBeVisible();
    await expect(dialog.getByTestId(`candidate-apply-${first.candidate.id}`)).toBeEnabled();
    await expect(dialog.getByTestId(`candidate-apply-${first.candidate.id}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByTestId(`candidate-apply-${second.candidate.id}`)).toBeEnabled();
    await expect(dialog.getByTestId(`candidate-apply-${second.candidate.id}`)).toHaveAttribute('aria-pressed', 'false');

    await dialog.getByTestId(`candidate-apply-${second.candidate.id}`).click();
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [second.candidate.id]);
    await expectElectricalCalcMark(page, projectId, sessionId, pipe.id, 'ТЛТ-20');
    await expect(dialog.getByTestId(`candidate-apply-${first.candidate.id}`)).toBeEnabled();
    await expect(dialog.getByTestId(`candidate-apply-${first.candidate.id}`)).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.getByTestId(`candidate-apply-${second.candidate.id}`)).toBeEnabled();
    await expect(dialog.getByTestId(`candidate-apply-${second.candidate.id}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByTestId(`candidate-apply-${second.candidate.id}`)).toHaveAccessibleName(
      'Уже выбран кандидат ТЛТ-20',
    );

    await page.reload();
    dialog = await openCandidateDialog(page, pipeName);
    await expectAppliedCandidateIds(page, projectId, sessionId, pipe.id, [second.candidate.id]);
    await expect(dialog.getByTestId(`candidate-apply-${first.candidate.id}`)).toBeEnabled();
    await expect(dialog.getByTestId(`candidate-apply-${first.candidate.id}`)).toHaveAttribute('aria-pressed', 'false');
    await expect(dialog.getByTestId(`candidate-apply-${second.candidate.id}`)).toBeEnabled();
    await expect(dialog.getByTestId(`candidate-apply-${second.candidate.id}`)).toHaveAttribute('aria-pressed', 'true');
  });
});
