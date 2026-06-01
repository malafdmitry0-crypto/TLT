import { test, expect, type Locator, type Page } from '@playwright/test';

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
  is_pinned?: boolean;
  status?: string;
};

type CandidateFolder = {
  id: string;
  name: string;
  candidate_ids: string[];
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

async function listFolders(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
) {
  const response = await page.request.get(`${API_BASE}/api/v1/calc/electrical/candidate-folders`, {
    headers: { 'X-Session-Id': sessionId },
    params: {
      project_id: projectId,
      object_id: objectId,
      variant_number: 1,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<CandidateFolder[]>;
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

async function electricalCalcMarkForObject(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  variantNumber = 1,
) {
  const calcs = await fetchElectricalCalcs(page, projectId, sessionId, variantNumber);
  return calcs.find((calc) => calc.object_id === objectId)?.cable_mark ?? null;
}

async function candidateStatus(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  candidateId: string,
) {
  const candidates = await listCandidates(page, projectId, sessionId, objectId);
  return candidates.find((candidate) => candidate.id === candidateId)?.status;
}

async function candidatePinned(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  candidateId: string,
) {
  const candidates = await listCandidates(page, projectId, sessionId, objectId);
  return candidates.find((candidate) => candidate.id === candidateId)?.is_pinned;
}

async function expectAutoCandidateParamVariants(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  cableType: string,
  baseParams: Record<string, unknown>,
  variants: Array<Record<string, unknown>>,
) {
  const base = await createCandidate(page, projectId, sessionId, objectId, {
    cable_type: cableType,
    mode: 'auto',
    electrical_params: baseParams,
  });
  const same = await createCandidate(page, projectId, sessionId, objectId, {
    cable_type: cableType,
    mode: 'auto',
    electrical_params: baseParams,
  });
  const changed = [];
  for (const variantParams of variants) {
    changed.push(await createCandidate(page, projectId, sessionId, objectId, {
      cable_type: cableType,
      mode: 'auto',
      electrical_params: { ...baseParams, ...variantParams },
    }));
  }

  expect(base.action).toBe('created');
  expect(base.candidate.status).toBe('applicable');
  expect(same.action).toBe('updated');
  expect(same.candidate.id).toBe(base.candidate.id);
  for (const item of changed) {
    expect(item.action).toBe('created');
    expect(item.candidate.status).toBe('applicable');
  }

  const uniqueIds = new Set([base.candidate.id, ...changed.map((item) => item.candidate.id)]);
  expect(uniqueIds.size).toBe(1 + variants.length);

  const candidates = await listCandidates(page, projectId, sessionId, objectId);
  expect(candidates.map((candidate) => candidate.id).sort()).toEqual([...uniqueIds].sort());
  await expectElectricalCalcMark(page, projectId, sessionId, objectId, null);
}

async function openCandidateDialog(page: Page, pipeName: string) {
  await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
  const row = page.getByRole('row').filter({ hasText: pipeName }).first();
  await expect(row).toBeVisible();
  await row.getByRole('cell', { name: pipeName }).click();
  await expect(row).toHaveClass(/electrical-row-active/);
  await row.getByRole('button', { name: 'Подбор' }).click();

  const dialog = page.getByRole('dialog', { name: /Подбор кабеля/ });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectCandidateGlideCanvas(dialog: Locator) {
  await expect(dialog.locator('.ant-table')).toHaveCount(0);
  const canvas = dialog.locator('.electrical-candidate-spreadsheet--glide canvas').first();
  await expect(canvas).toBeVisible();
  return canvas;
}

async function clickCanvasPoint(page: Page, canvas: Locator, x: number, y: number) {
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + x, box!.y + y);
}

async function clickCandidateGridUntil(
  page: Page,
  canvas: Locator,
  y: number,
  xCandidates: number[],
  isDone: () => Promise<boolean>,
) {
  for (const x of xCandidates) {
    await clickCanvasPoint(page, canvas, x, y);
    await page.waitForTimeout(250);
    if (await isDone()) return;
    await page.keyboard.press('Escape');
  }
  expect(await isDone()).toBe(true);
}

test.describe('electrical candidate selection', () => {
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
      insulation_thickness: 0.15,
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
      insulation_thickness: 0.15,
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

  test('изменение параметров ТЛТ-авторасчёта создаёт отдельный кандидат', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E TLT controls ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      outer_diameter: 0.108,
      pipe_length: 12,
      insulation_thickness: 0.03,
      ambient_temperature: 1,
      process_temperature: 65,
    });

    await expectAutoCandidateParamVariants(
      page,
      projectId,
      sessionId,
      pipe.id,
      'self_regulating',
      { supply_voltage: 220, winding_coefficient: 1, number_of_threads: 1 },
      [
        { number_of_threads: 2 },
        { winding_coefficient: 1.05 },
        { winding_pitch: 500 },
      ],
    );
  });

  test('изменение параметров ТТН/ТТВ/ТТХ-авторасчёта создаёт отдельный кандидат', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E TT controls ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      outer_diameter: 0.108,
      pipe_length: 12,
      insulation_thickness: 0.03,
      ambient_temperature: 1,
      process_temperature: 65,
    });

    await expectAutoCandidateParamVariants(
      page,
      projectId,
      sessionId,
      pipe.id,
      'self_regulating_tt',
      {
        supply_voltage: 220,
        winding_coefficient: 1.1,
        maintain_temperature: 5,
        vapor_temperature: 80,
        aggressive_product: false,
      },
      [
        { maintain_temperature: 10 },
        { vapor_temperature: 90 },
        { aggressive_product: true },
      ],
    );
  });

  test('изменение параметров резистивного авторасчёта создаёт отдельный кандидат', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E resistive controls ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      outer_diameter: 0.108,
      pipe_length: 12,
      insulation_thickness: 0.03,
      ambient_temperature: 1,
      process_temperature: 65,
    });

    await expectAutoCandidateParamVariants(
      page,
      projectId,
      sessionId,
      pipe.id,
      'single_core',
      { supply_voltage: 220, connection_type: 'line_1ph', winding_coefficient: 1 },
      [
        { connection_type: 'star_3ph' },
        { supply_voltage: 230 },
        { winding_coefficient: 1.05 },
      ],
    );
  });

  test('изменение параметров ТТ Р3-авторасчёта создаёт отдельный кандидат', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E R3 controls ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      outer_diameter: 0.108,
      pipe_length: 12,
      insulation_thickness: 0.03,
      ambient_temperature: 1,
      process_temperature: 65,
    });

    await expectAutoCandidateParamVariants(
      page,
      projectId,
      sessionId,
      pipe.id,
      'three_core',
      { supply_voltage: 220, connection_type: 'line_1ph', winding_coefficient: 1 },
      [
        { connection_type: 'star_3x3' },
        { supply_voltage: 230 },
        { winding_coefficient: 1.05 },
      ],
    );
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
