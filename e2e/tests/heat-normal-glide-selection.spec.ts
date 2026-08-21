import { test, expect } from '@playwright/test';

import { API_BASE, createCalculatedPipe, currentGuestContext, loginAsGuest } from './helpers/workspace';

const NORMAL_GLIDE_ROW_MARKER_X = 26;
const NORMAL_GLIDE_HEADER_HEIGHT = 38;
const NORMAL_GLIDE_ROW_HEIGHT = 30;

function normalGlideRowCenter(rowIndex: number) {
  return NORMAL_GLIDE_HEADER_HEIGHT + NORMAL_GLIDE_ROW_HEIGHT * rowIndex + NORMAL_GLIDE_ROW_HEIGHT / 2;
}

test.describe('Normal Glide row multi-selection', () => {
  test('successive checkbox marker clicks drive point heat-loss recalculation', async ({ page }) => {
    await loginAsGuest(page);
    const firstName = `E2E normal select A ${Date.now()}`;
    const secondName = `E2E normal select B ${Date.now()}`;
    const thirdName = `E2E normal select C ${Date.now()}`;
    await createCalculatedPipe(page, firstName, { pipe_length: 5 });
    await createCalculatedPipe(page, secondName, { pipe_length: 6 });
    await createCalculatedPipe(page, thirdName, { pipe_length: 7 });
    await page.reload({ waitUntil: 'networkidle' });

    const canvas = page.locator('.calc-spreadsheet--normal-glide canvas').first();
    await expect(canvas).toBeVisible();
    const { projectId, sessionId } = await currentGuestContext(page);
    const queryResponse = await page.request.post(`${API_BASE}/api/v1/projects/${projectId}/objects/query`, {
      headers: { 'X-Session-Id': sessionId },
      data: { object_type: 'pipe', page: 1, page_size: 50 },
    });
    expect(queryResponse.ok()).toBeTruthy();
    const visibleRows = (await queryResponse.json()) as { items: Array<{ id: string; params: { name?: string } }> };
    const targetRows = visibleRows.items
      .map((object, index) => ({ id: object.id, index, name: String(object.params.name) }))
      .filter((object) => [firstName, secondName, thirdName].includes(object.name));
    expect(targetRows).toHaveLength(3);

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    await page.mouse.click(
      canvasBox!.x + NORMAL_GLIDE_ROW_MARKER_X,
      canvasBox!.y + normalGlideRowCenter(targetRows[0].index),
    );
    await page.mouse.click(
      canvasBox!.x + NORMAL_GLIDE_ROW_MARKER_X,
      canvasBox!.y + normalGlideRowCenter(targetRows[1].index),
    );
    const selectedIds = targetRows.slice(0, 2).map((object) => object.id);

    await expect(page.getByRole('button', { name: /Пересчитать теплопотери выбранных строк \(2\)/i })).toBeVisible();
    const requestPromise = page.waitForRequest((request) =>
      request.method() === 'POST' && request.url().includes('/api/v1/calc/heat-loss/batch/jobs'),
    );
    await page.getByRole('button', { name: /Пересчитать теплопотери выбранных строк \(2\)/i }).click();
    const request = await requestPromise;
    const payload = request.postDataJSON() as { object_ids?: string[] };
    expect(payload.object_ids).toEqual(selectedIds);
    expect(payload.object_ids).not.toContain(targetRows[2].id);

    const proof = await page.evaluate(() => {
      const grid = document.querySelector('.calc-spreadsheet--normal-glide');
      const canvas = grid?.querySelector('canvas');
      if (!grid || !canvas) return { nonBlank: false, noHorizontalScroll: false, noClip: false };
      const context = canvas.getContext('2d');
      const image = context?.getImageData(0, 0, Math.min(canvas.width, 240), Math.min(canvas.height, 180));
      const nonBlank = image
        ? Array.from(image.data).some((value, index) => index % 4 === 3 ? value > 0 : value < 245)
        : false;
      const gridRect = grid.getBoundingClientRect();
      return {
        nonBlank,
        noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
        noClip: gridRect.width > 600 && gridRect.height > 200,
      };
    });
    expect(proof).toEqual({ nonBlank: true, noHorizontalScroll: true, noClip: true });
    await page.screenshot({
      path: 'test-results/heat-normal-glide-checkboxes-after.png',
      fullPage: false,
    });
  });
});
