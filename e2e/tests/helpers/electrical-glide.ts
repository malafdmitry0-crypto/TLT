import { expect, type Page } from '@playwright/test';

import { API_BASE } from './workspace';

export type ElectricalCalcSummary = {
  id: string;
  object_id: string;
  cable_type: string;
  cable_mark: string | null;
  variant_number: number;
  params?: Record<string, unknown> | null;
  results: Record<string, unknown> | null;
};

export async function expectElectricalGlideReady(page: Page) {
  const grid = page.locator('.electrical-spreadsheet--glide').first();
  await expect(grid).toBeVisible();
  await expect(grid.locator('canvas').first()).toBeVisible();
  await expect(page.locator('.electrical-spreadsheet .ant-table')).toHaveCount(0);
}

export async function expectElectricalGridReadOnly(page: Page) {
  await expectElectricalGlideReady(page);
  await expect(page.locator('.electrical-spreadsheet--glide input[role="spinbutton"]')).toHaveCount(0);
  await expect(page.locator('.electrical-spreadsheet--glide .ant-select-selector')).toHaveCount(0);
}

export async function clickFirstElectricalGridRow(page: Page) {
  const canvas = page.locator('.electrical-spreadsheet--glide canvas').first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + 96, box!.y + 52);
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
  return response.json() as Promise<ElectricalCalcSummary[]>;
}

export async function expectElectricalCalcForObject(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  variantNumber = 1,
) {
  let rows: ElectricalCalcSummary[] = [];
  await expect.poll(async () => {
    rows = await fetchElectricalCalcs(page, projectId, sessionId, variantNumber);
    return rows.some((row) => row.object_id === objectId);
  }).toBe(true);
  return rows.find((row) => row.object_id === objectId)!;
}
