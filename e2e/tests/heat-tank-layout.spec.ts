import { expect, test, type Page } from '@playwright/test';

import { loginAsGuest } from './helpers/workspace';

const TABLE_VIEW_STORAGE_KEY = 'heatcalc.tableView.v2.guest';

async function openTankForm(page: Page) {
  await loginAsGuest(page);
  await page.evaluate((storageKey) => {
    localStorage.setItem(storageKey, JSON.stringify({
      version: 2,
      fontSize: 'standard',
      tableLabelFormat: 'short',
      settingsLabelFormat: 'full',
      formPlacement: 'top',
      sideFormWidthPct: 34,
      formSectionWeights: [1.655, 1.35, 1.2],
    }));
  }, TABLE_VIEW_STORAGE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .getByRole('toolbar', { name: 'Тип объекта и блок параметров' })
    .getByRole('button', { name: /Резервуар:/ })
    .click();
  await expect(page.getByTestId('tank-shape-select')).toBeVisible();
}

async function selectTankShape(page: Page, label: string) {
  await page.getByTestId('tank-shape-select').click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function assertNoTankFieldOverlap(page: Page, ids: string[]) {
  const result = await page.evaluate((fieldIds) => {
    type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
    const rectFor = (element: Element | null): Rect | null => {
      const rect = element?.getBoundingClientRect();
      return rect && {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const fields = Object.fromEntries(fieldIds.map((id) => [
      id,
      rectFor(document.querySelector(`[data-testid="${id}"]`)?.closest('.ant-form-item') ?? null),
    ])) as Record<string, Rect | null>;
    const overlap = (left: Rect, right: Rect) => Math.max(
      0,
      Math.min(left.right, right.right) - Math.max(left.left, right.left),
    ) * Math.max(
      0,
      Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
    );
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      fields,
      overlaps: Object.fromEntries(fieldIds.flatMap((id, index) => fieldIds.slice(index + 1).map((other) => [
        `${id}__${other}`,
        fields[id] && fields[other] ? overlap(fields[id]!, fields[other]!) : null,
      ]))),
    };
  }, ids);

  expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
  for (const id of ids) {
    expect(result.fields[id], `${id} is visible`).not.toBeNull();
    expect(result.fields[id]!.width).toBeGreaterThan(0);
    expect(result.fields[id]!.height).toBeGreaterThan(0);
  }
  expect(result.overlaps).toEqual(Object.fromEntries(Object.keys(result.overlaps).map((key) => [key, 0])));
}

test('wide tank form keeps geometry fields separate for cylinder and rectangular shapes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openTankForm(page);

  await selectTankShape(page, 'Цилиндрическая');
  await assertNoTankFieldOverlap(page, [
    'object-name-input',
    'tank-shape-select',
    'tank-diameter-input',
    'tank-height-input',
    'tank-wall-thickness-input',
    'tank-wall-lambda-input',
    'q-additional-input',
    'placement-select',
    'climate-select',
    'ambient-temperature-input',
    'process-temperature-input',
    'wind-speed-input',
  ]);
  await page.screenshot({ path: 'test-results/ui-proof-heat-tank-layout/cylindrical-1440x1000.png' });

  await selectTankShape(page, 'Параллелепипед');
  await assertNoTankFieldOverlap(page, [
    'object-name-input',
    'tank-shape-select',
    'tank-length-input',
    'tank-width-input',
    'tank-height-input',
    'tank-wall-thickness-input',
    'tank-wall-lambda-input',
    'q-additional-input',
    'placement-select',
    'climate-select',
    'ambient-temperature-input',
    'process-temperature-input',
    'wind-speed-input',
  ]);
  await page.screenshot({ path: 'test-results/ui-proof-heat-tank-layout/rectangular-1440x1000.png' });
});
