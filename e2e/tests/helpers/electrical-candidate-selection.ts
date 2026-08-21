import { expect, type Locator, type Page } from '@playwright/test';

import { API_BASE } from './workspace';

export type Candidate = {
  id: string;
  cable_mark: string | null;
  is_applied: boolean;
  is_pinned?: boolean;
  status?: string;
};

export type CandidateFolder = {
  id: string;
  name: string;
  candidate_ids: string[];
};

export type CandidateUpsertResponse = {
  candidate: Candidate;
  action: 'created' | 'updated';
};

export async function createCandidate(
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

export async function createManualCandidate(
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

export async function applyCandidate(page: Page, sessionId: string, candidateId: string) {
  const response = await page.request.post(
    `${API_BASE}/api/v1/calc/electrical/candidates/${candidateId}/apply`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(response.ok()).toBeTruthy();
}

export async function listCandidates(
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

export async function listFolders(
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

export async function fetchElectricalCalcs(
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

export async function expectAppliedCandidateIds(
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

export async function expectElectricalCalcMark(
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

export async function electricalCalcMarkForObject(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  variantNumber = 1,
) {
  const calcs = await fetchElectricalCalcs(page, projectId, sessionId, variantNumber);
  return calcs.find((calc) => calc.object_id === objectId)?.cable_mark ?? null;
}

export async function candidateStatus(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  candidateId: string,
) {
  const candidates = await listCandidates(page, projectId, sessionId, objectId);
  return candidates.find((candidate) => candidate.id === candidateId)?.status;
}

export async function candidatePinned(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  candidateId: string,
) {
  const candidates = await listCandidates(page, projectId, sessionId, objectId);
  return candidates.find((candidate) => candidate.id === candidateId)?.is_pinned;
}

export async function expectAutoCandidateParamVariants(
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

export async function openCandidateDialog(page: Page, pipeName: string) {
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

export async function expectCandidateGlideCanvas(dialog: Locator) {
  await expect(dialog.locator('.ant-table')).toHaveCount(0);
  const canvas = dialog.locator('.electrical-candidate-spreadsheet--glide canvas').first();
  await expect(canvas).toBeVisible();
  return canvas;
}

export async function clickCanvasPoint(page: Page, canvas: Locator, x: number, y: number) {
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + x, box!.y + y);
}

export async function clickCandidateGridUntil(
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
