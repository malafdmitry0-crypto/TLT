import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { loginAsGuest } from './helpers/workspace';
import { selectOption } from './helpers/inline-form-dependencies';

const OUT_DIR = 'test-results/ui-proof-heat-ground-underground';
const TABLE_VIEW_STORAGE_KEY = 'heatcalc.tableView.v2.guest';
const undergroundFields = [
  'placement-select',
  'climate-select',
  'process-temperature-input',
  'ground-type-select',
  'burial-depth-input',
  'ground-temperature-input',
  'ground-conductivity-input',
] as const;

type UndergroundField = typeof undergroundFields[number];

async function selectPlacement(page: Page, label: string) {
  await selectOption(page, 'placement-select', label);
}

async function openTopForm(page: Page) {
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
  await expect(page.locator('.inline-object-form--wide')).toBeVisible();
  await selectPlacement(page, 'Подземно');
  await expect(page.getByTestId('ambient-temperature-input')).toHaveCount(0);
  await expect(page.getByTestId('max-ambient-temperature-input')).toHaveCount(0);
  await expect(page.getByTestId('ground-type-select')).toBeVisible();
}

async function assertUndergroundGeometry(page: Page) {
  const result = await page.evaluate((ids: UndergroundField[]) => {
    type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
    const rectFor = (element: Element | null): Rect | null => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const overlapArea = (left: Rect, right: Rect) => Math.max(
      0,
      Math.min(left.right, right.right) - Math.max(left.left, right.left),
    ) * Math.max(
      0,
      Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
    );

    const panelRect = rectFor(document.querySelector('[data-testid="heat-object-fields"]'));
    const fields = Object.fromEntries(ids.map((id) => {
      const field = document.querySelector(`[data-testid="${id}"]`);
      return [id, rectFor(field?.closest('.ant-form-item') ?? null)];
    })) as Record<UndergroundField, Rect | null>;
    const overlaps = Object.fromEntries(ids.flatMap((id, index) => ids.slice(index + 1).map((other) => [
      `${id}__${other}`,
      fields[id] && fields[other] ? overlapArea(fields[id]!, fields[other]!) : null,
    ])));
    const ground = document.querySelector('[data-testid="ground-type-select"]');
    const groundRect = rectFor(ground);
    const centerHit = groundRect
      ? document.elementFromPoint(groundRect.left + groundRect.width / 2, groundRect.top + groundRect.height / 2)
      : null;
    const zoneIds = [
      'wizard-zone-heat-object-fields',
      'wizard-zone-insulation-layers',
      'wizard-zone-cable-algorithm',
    ] as const;
    const zones = Object.fromEntries(zoneIds.map((id) => [
      id,
      rectFor(document.querySelector(`[data-testid="${id}"]`)),
    ])) as Record<typeof zoneIds[number], Rect | null>;
    const zoneOverlaps = Object.fromEntries(zoneIds.flatMap((id, index) => zoneIds.slice(index + 1).map((other) => [
      `${id}__${other}`,
      zones[id] && zones[other] ? overlapArea(zones[id]!, zones[other]!) : null,
    ])));

    return {
      viewport: { width: innerWidth, height: innerHeight },
      pageScroll: { width: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      panelRect,
      fields,
      overlaps,
      centerHitTestId: centerHit?.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
      zones,
      zoneOverlaps,
    };
  }, undergroundFields);

  expect(result.pageScroll.width).toBeLessThanOrEqual(result.pageScroll.clientWidth);
  expect(result.panelRect).not.toBeNull();
  for (const field of undergroundFields) {
    const rect = result.fields[field];
    expect(rect, `${field} is rendered`).not.toBeNull();
    expect(rect!.width, `${field} has width`).toBeGreaterThan(0);
    expect(rect!.height, `${field} has height`).toBeGreaterThan(0);
    expect(rect!.left, `${field} stays inside the fields panel`).toBeGreaterThanOrEqual(result.panelRect!.left - 1);
    expect(rect!.right, `${field} stays inside the fields panel`).toBeLessThanOrEqual(result.panelRect!.right + 1);
    expect(rect!.top, `${field} stays inside the fields panel`).toBeGreaterThanOrEqual(result.panelRect!.top - 1);
    expect(rect!.bottom, `${field} stays inside the fields panel`).toBeLessThanOrEqual(result.panelRect!.bottom + 1);
  }
  expect(result.overlaps).toEqual(Object.fromEntries(Object.keys(result.overlaps).map((key) => [key, 0])));
  expect(result.centerHitTestId).toBe('ground-type-select');
  for (const [zoneId, rect] of Object.entries(result.zones)) {
    expect(rect, `${zoneId} is rendered`).not.toBeNull();
    expect(rect!.width, `${zoneId} has width`).toBeGreaterThan(0);
    expect(rect!.height, `${zoneId} has height`).toBeGreaterThan(0);
  }
  expect(result.zoneOverlaps).toEqual(
    Object.fromEntries(Object.keys(result.zoneOverlaps).map((key) => [key, 0])),
  );
}

test('подземное размещение: поля не пересекаются, а справочники открываются своими контролами', async ({ page }) => {
  mkdirSync(OUT_DIR, { recursive: true });
  await page.setViewportSize({ width: 2048, height: 768 });
  await openTopForm(page);

  for (const viewport of [
    { width: 2048, height: 768 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await assertUndergroundGeometry(page);
    await page.screenshot({
      path: join(OUT_DIR, `after-${viewport.width}x${viewport.height}.png`),
      fullPage: false,
    });
  }

  await page.getByTestId('ground-type-select').click();
  const soilDialog = page.locator('.reference-picker-modal:visible').last();
  await expect(soilDialog).toBeVisible();
  const soil = soilDialog.getByRole('option').first();
  await expect(soil).toBeVisible();
  await soil.click();
  await expect(soilDialog).toHaveCount(0);
  await expect(page.getByTestId('ground-type-select')).not.toContainText('Выберите грунт');
  await expect(page.getByTestId('ground-type-select')).toHaveAttribute('title', /.+/);

  await page.getByTestId('climate-select').click();
  const climateDialog = page.locator('.reference-picker-modal:visible').last();
  await expect(climateDialog).toBeVisible();
  await expect(climateDialog).toContainText('Климат');
  await climateDialog.getByRole('button', { name: 'Close' }).click();
  await expect(climateDialog).toHaveCount(0);

  await selectPlacement(page, 'На открытом воздухе');
  await expect(page.getByTestId('ambient-temperature-input')).toBeVisible();
  await expect(page.getByTestId('max-ambient-temperature-input')).toBeVisible();
  await expect(page.getByTestId('wind-speed-input')).toBeVisible();
  await expect(page.getByTestId('ground-type-select')).toHaveCount(0);
  await expect(page.getByTestId('ground-temperature-input')).toHaveCount(0);
  await selectPlacement(page, 'В помещении');
  await expect(page.getByTestId('ambient-temperature-input')).toBeVisible();
  await expect(page.getByTestId('max-ambient-temperature-input')).toBeVisible();
  await expect(page.getByTestId('wind-speed-input')).toHaveCount(0);
  await expect(page.getByTestId('ground-type-select')).toHaveCount(0);
  await expect(page.getByTestId('ground-temperature-input')).toHaveCount(0);
});
