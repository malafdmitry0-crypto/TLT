/**
 * AGENT: large layout-proof e2e (~600 LOC). Do not open for ordinary heat
 * feature slices — use focused heat form unit/integration + viewport policy.
 * Touch only when changing heat form layout acceptance journeys.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3003';
export const HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY = 'heatcalc.tableView.v2.guest';
export const OUT_DIR = 'test-results/ui-proof-heat-form-split-after';

export type FormPlacement = 'top' | 'bottom' | 'right';

export async function loginAsGuest(page: Page) {
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: 'Начать без регистрации' }).click();
  await page.waitForURL(/\/workspace\/heat-calc/);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

export async function openHeatFormVariant(page: Page, placement: FormPlacement, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await loginAsGuest(page);
  await page.evaluate(
    ([storageKey, formPlacement]) => {
      localStorage.setItem(storageKey, JSON.stringify({
        version: 2,
        fontSize: 'standard',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
        formPlacement,
        sideFormWidthPct: 34,
        formSectionWeights: [1.655, 1.35, 1.2],
      }));
    },
    [HEATCALC_GUEST_TABLE_VIEW_STORAGE_KEY, placement],
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}

export async function setInsulationLayerCount(page: Page, label: string) {
  await page.getByTestId('insulation-layer-count-select').click();
  const option = page.locator('.tlt-select__option, [role="option"]').filter({ hasText: label }).last();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.getByTestId('insulation-layer-count-select')).toContainText(label);
  await page.waitForTimeout(200);
}

export async function clearHover(page: Page) {
  await page.mouse.move(4, 4);
  await page.waitForTimeout(100);
}
