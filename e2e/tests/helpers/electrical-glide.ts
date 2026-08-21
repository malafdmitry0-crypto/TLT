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

export async function expectElectricalGridHasNoOpenEditor(page: Page) {
  await expectElectricalGlideReady(page);
  await expect(page.locator('.electrical-spreadsheet--glide input[role="spinbutton"]')).toHaveCount(0);
  await expect(page.locator('.electrical-spreadsheet--glide .ant-select-selector')).toHaveCount(0);
}

async function electricalGridCellCenter(
  page: Page,
  column: 'winding_pitch_mm' | 'number_of_threads',
) {
  const grid = page.locator('.electrical-spreadsheet--glide').first();
  return grid.evaluate((element, targetColumn) => {
    const rawColumns = element.getAttribute('data-glide-visible-columns') ?? '';
    const rowMarkerWidth = Number(element.getAttribute('data-glide-row-marker-width') ?? '52');
    const rowHeight = Number(element.getAttribute('data-glide-row-height') ?? '30');
    let left = Number.isFinite(rowMarkerWidth) ? rowMarkerWidth : 52;

    for (const rawColumn of rawColumns.split('|')) {
      const [key, rawWidth] = rawColumn.split(':');
      const width = Number(rawWidth);
      if (!key || !Number.isFinite(width) || width <= 0) continue;
      if (key === targetColumn) {
        return {
          x: left + width / 2,
          y: (Number.isFinite(rowHeight) ? rowHeight : 30) + 8 + (Number.isFinite(rowHeight) ? rowHeight : 30) / 2,
        };
      }
      left += width;
    }
    return null;
  }, column);
}

export async function editFirstElectricalGridLayoutCell(
  page: Page,
  column: 'winding_pitch_mm' | 'number_of_threads',
  value: string,
) {
  await expectElectricalGlideReady(page);
  const canvas = page.locator('.electrical-spreadsheet--glide canvas').first();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const center = await electricalGridCellCenter(page, column);
  expect(center).toBeTruthy();
  expect(center!.x).toBeLessThan(box!.width);
  await page.mouse.click(box!.x + center!.x, box!.y + center!.y);
  const editor = page.getByTestId('heatcalc-normal-glide-cell-editor');
  await expect(editor).toBeVisible();
  await editor.fill(value);
  await editor.press('Enter');
  await expect(editor).toHaveCount(0);
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
