import { test, expect, type Locator, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  currentGuestContext,
  fetchProjectObjects,
  loginAsGuest,
} from './helpers/workspace';

type Candidate = {
  id: string;
  cable_mark: string | null;
  is_applied: boolean;
  status?: string;
};

type CandidateFolder = {
  id: string;
  name: string;
  candidate_ids: string[];
};

async function clearProjectObjects(page: Page) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const objects = await fetchProjectObjects(page);
  for (const object of objects) {
    const response = await page.request.delete(
      `${API_BASE}/api/v1/projects/${projectId}/objects/${object.id}`,
      { headers: { 'X-Session-Id': sessionId } },
    );
    expect(response.ok()).toBeTruthy();
  }
}

async function createManualCandidate(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  cableMark: string,
) {
  const response = await page.request.post(`${API_BASE}/api/v1/calc/electrical/candidates`, {
    headers: { 'X-Session-Id': sessionId },
    data: {
      project_id: projectId,
      object_id: objectId,
      variant_number: 1,
      mode: 'manual',
      cable_type: 'self_regulating',
      cable_source: 'builtin',
      cable_mark: cableMark,
    },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { candidate: Candidate };
  return payload.candidate;
}

async function applyCandidate(page: Page, sessionId: string, candidateId: string) {
  const response = await page.request.post(
    `${API_BASE}/api/v1/calc/electrical/candidates/${candidateId}/apply`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(response.ok()).toBeTruthy();
}

async function excludeCandidate(page: Page, sessionId: string, candidateId: string) {
  const response = await page.request.patch(
    `${API_BASE}/api/v1/calc/electrical/candidates/${candidateId}`,
    {
      headers: { 'X-Session-Id': sessionId },
      data: { status: 'excluded' },
    },
  );
  expect(response.ok()).toBeTruthy();
}

async function createCandidateFolder(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  name: string,
) {
  const response = await page.request.post(`${API_BASE}/api/v1/calc/electrical/candidate-folders`, {
    headers: { 'X-Session-Id': sessionId },
    data: {
      project_id: projectId,
      object_id: objectId,
      variant_number: 1,
      name,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<CandidateFolder>;
}

async function listCandidates(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
) {
  const response = await page.request.get(`${API_BASE}/api/v1/calc/electrical/candidates`, {
    headers: { 'X-Session-Id': sessionId },
    params: {
      project_id: projectId,
      object_id: objectId,
      variant_number: 1,
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

async function clickCanvasPoint(page: Page, canvas: Locator, x: number, y: number) {
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + x, box!.y + y);
}

async function appliedCandidateIds(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
) {
  const candidates = await listCandidates(page, projectId, sessionId, objectId);
  return candidates.filter((candidate) => candidate.is_applied).map((candidate) => candidate.id);
}

async function clickCandidateActionUntil(
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

async function openCandidateDialogFromDefaultGlide(page: Page) {
  await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
  const mainCanvas = page.locator('.electrical-spreadsheet--glide canvas').first();
  await expect(mainCanvas).toBeVisible();
  await expect(page.locator('.workspace-table-card .ant-table')).toHaveCount(0);

  const firstRowCenterY = 47;
  await clickCanvasPoint(page, mainCanvas, 52 + 24, firstRowCenterY);
  await clickCanvasPoint(page, mainCanvas, 52 + 220 + 56 + 145, firstRowCenterY);

  const dialog = page.getByRole('dialog', { name: /Подбор кабеля/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.ant-table')).toHaveCount(0);
  await expect(dialog.locator('.electrical-candidate-spreadsheet--glide canvas').first()).toBeVisible();
  await page.waitForTimeout(350);
  return dialog;
}

test('Candidate Glide is default and keeps apply/folder/exclude mutations after reload', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => {
    window.localStorage.removeItem('electrical.tableEngine');
    window.localStorage.removeItem('electrical.candidateTableEngine');
  });
  await clearProjectObjects(page);

  const { projectId, sessionId } = await currentGuestContext(page);
  const pipe = await createCalculatedPipe(page, `E2E default Glide candidate ${Date.now()}`, {
    pipe_length: 3,
    insulation_thickness: 0.15,
    ambient_temperature: 29,
    process_temperature: 30,
  });
  const first = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-10');
  const second = await createManualCandidate(page, projectId, sessionId, pipe.id, 'ТЛТ-20');
  await applyCandidate(page, sessionId, first.id);
  await createCandidateFolder(page, projectId, sessionId, pipe.id, 'Согласовать');

  let dialog = await openCandidateDialogFromDefaultGlide(page);
  const candidateCanvas = dialog.locator('.electrical-candidate-spreadsheet--glide canvas').first();

  await clickCandidateActionUntil(
    page,
    candidateCanvas,
    73,
    [80, 95, 110, 125, 140, 155],
    async () => (await appliedCandidateIds(page, projectId, sessionId, pipe.id))[0] === second.id,
  );
  expect(await appliedCandidateIds(page, projectId, sessionId, pipe.id)).toEqual([second.id]);

  await page.reload();
  dialog = await openCandidateDialogFromDefaultGlide(page);
  const reloadedCandidateCanvas = dialog.locator('.electrical-candidate-spreadsheet--glide canvas').first();
  await expect.poll(async () => {
    const candidates = await listCandidates(page, projectId, sessionId, pipe.id);
    return candidates.filter((candidate) => candidate.is_applied).map((candidate) => candidate.id);
  }).toEqual([second.id]);

  await clickCandidateActionUntil(
    page,
    reloadedCandidateCanvas,
    47,
    [120, 145, 170, 195, 220, 245],
    async () => (await page.locator('.electrical-candidate-glide-action-menu').count()) > 0,
  );
  await page.getByRole('menuitem', { name: 'Согласовать' }).click();
  await expect.poll(async () => {
    const folders = await listFolders(page, projectId, sessionId, pipe.id);
    return folders.find((folder) => folder.name === 'Согласовать')?.candidate_ids ?? [];
  }).toContain(second.id);

  await excludeCandidate(page, sessionId, first.id);
  await page.reload();
  await openCandidateDialogFromDefaultGlide(page);
  const candidatesAfterExclude = await listCandidates(page, projectId, sessionId, pipe.id);
  expect(candidatesAfterExclude.find((candidate) => candidate.id === first.id)?.status).toBe('excluded');
});
