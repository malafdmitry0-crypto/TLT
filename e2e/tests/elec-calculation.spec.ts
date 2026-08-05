import { test, expect, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';
import {
  expectElectricalCalcForObject,
  expectElectricalGlideReady,
} from './helpers/electrical-glide';

const ALL_ELECTRICAL_COLUMN_KEYS = [
  'index',
  'object_name',
  'electrical_status',
  'cable_type',
  'cable_mark',
  'applied_selection_policy',
  'winding_pitch_mm',
  'number_of_threads',
  'laying_step',
  'heating_height',
  'connection_type',
  'vapor_temperature',
  'maintain_temperature',
  'aggressive_product',
  'installed_cable_length',
  'order_cable_length',
  'total_power',
  'current',
  'voltage',
  'price_per_meter',
  'required_order_length',
  'total_cost',
  'stock_status',
  'lead_time_days',
  'heat_loss_per_meter_base',
  'heat_loss_per_m2_bare_base',
  'total_heat_loss_design',
] as const;

type ElectricalColumnKey = typeof ALL_ELECTRICAL_COLUMN_KEYS[number];

async function recalculateCurrentEr(page: Page) {
  await page.getByRole('button', { name: /Пересчитать все · ЭР1/i }).click();
  await page.getByRole('button', { name: /Да, пересчитать все/i }).click();
}

async function createFirstElectricalVariantIfNeeded(page: Page) {
  const createEr = page.getByRole('button', { name: /^Создать ЭР1$/i }).first();
  const grid = page.locator('.electrical-spreadsheet--glide').first();
  await expect(createEr.or(grid)).toBeVisible({ timeout: 10_000 });
  if (await createEr.isVisible().catch(() => false)) {
    await createEr.click();
  }
  await expectElectricalGlideReady(page);
}

async function assignObjectToFirstEr(page: Page, objectId: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const headers = { 'X-Session-Id': sessionId };
  const variantsResponse = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    { headers },
  );
  expect(variantsResponse.ok()).toBeTruthy();
  const variants = await variantsResponse.json() as Array<{ id: string }>;
  expect(variants[0]?.id).toBeTruthy();

  const assignmentsResponse = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variants[0].id}/assignments`,
    { headers },
  );
  expect(assignmentsResponse.ok()).toBeTruthy();
  const assignments = await assignmentsResponse.json() as {
    items: Array<{ object_id: string; version: number }>;
  };
  const assignment = assignments.items.find((item) => item.object_id === objectId);
  expect(assignment).toBeTruthy();

  const assignResponse = await page.request.patch(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variants[0].id}/assignments`,
    {
      headers,
      data: {
        system_type: 'self_regulating',
        items: [{ object_id: objectId, expected_version: assignment!.version }],
      },
    },
  );
  expect(assignResponse.ok()).toBeTruthy();
}

async function expectElectricalHeaderControlsInline(page: Page) {
  await expectElectricalGlideReady(page);
  const issues = await page.locator('.electrical-spreadsheet--glide canvas').first().evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const grid = canvas.closest('.electrical-spreadsheet--glide')?.getBoundingClientRect();
    const layoutIssues: string[] = [];
    if (rect.width < 640) layoutIssues.push(`canvas is too narrow (${Math.round(rect.width)}px)`);
    if (rect.height < 220) layoutIssues.push(`canvas is too short (${Math.round(rect.height)}px)`);
    if (grid && rect.right > grid.right + 2) layoutIssues.push('canvas overflows grid container');
    if (grid && rect.width < grid.width - 2) layoutIssues.push('canvas does not fill grid container');
    return layoutIssues;
  });
  expect(issues).toEqual([]);
}

async function showAllElectricalColumns(page: Page) {
  await showElectricalColumns(page, [...ALL_ELECTRICAL_COLUMN_KEYS], { reload: true });
}

async function showElectricalColumns(
  page: Page,
  keys: ElectricalColumnKey[],
  options: { reload?: boolean } = {},
) {
  await page.evaluate((keys) => {
    const columns = Object.fromEntries(keys.map((key) => [key, { widthPct: 8 }]));
    localStorage.setItem('electrical.tableColumns.guest', JSON.stringify({
      visibleOrder: keys,
      columns,
    }));
    localStorage.setItem('electrical.tableView.guest', JSON.stringify({
      fontSize: 'compact',
      tableLabelFormat: 'short',
      settingsLabelFormat: 'full',
    }));
  }, keys);
  if (options.reload) {
    await page.reload();
  }
}

test.describe('4.4 Электротехнический расчёт', () => {
  test('после расчёта объекта показывает марку кабеля, длину, мощность и ток', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E elec pipe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await createFirstElectricalVariantIfNeeded(page);
    await expectElectricalHeaderControlsInline(page);

    await showAllElectricalColumns(page);
    await expectElectricalHeaderControlsInline(page);

    await page.getByTestId('elec-idop-input').fill('80');
    await page.getByTestId('elec-idop-save').click();
    await expect(page.getByText('Iдоп не задан')).toHaveCount(0);

    await assignObjectToFirstEr(page, pipe.id);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: /Самрег 1 объект/i })).toBeVisible();

    const batchRequestPromise = page.waitForRequest((request) =>
      request.method() === 'POST' && request.url().includes('/api/v1/calc/electrical/batch/jobs'),
    );
    await recalculateCurrentEr(page);
    const batchPayload = (await batchRequestPromise).postDataJSON() as Record<string, unknown>;
    expect(batchPayload).not.toHaveProperty('supply_voltage');
    expect(batchPayload).not.toHaveProperty('nominal_voltage_v');

    await expect(
      page.getByTestId('elec-summary-self_regulating-objects').locator('.elec-summary-card__value'),
    ).toHaveText('1', { timeout: 20_000 });
    const calc = await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id);
    expect(calc.cable_mark).toMatch(/ТТ[НВХ]/);
    expect(Number(calc.results?.order_cable_length ?? calc.results?.cable_length)).toBeGreaterThan(0);
    expect(Number(calc.results?.total_power)).toBeGreaterThan(0);
    expect(Number(calc.results?.current)).toBeGreaterThan(0);
    const resolvedInputs = (calc.results?.resolved_inputs ?? {}) as Record<string, unknown>;
    expect(Number(resolvedInputs.product_temperature_c)).toBe(80);
    expect(Number(resolvedInputs.maintain_temperature_c)).toBe(10);
    expect(resolvedInputs).not.toHaveProperty('nominal_voltage_v');
    await expect(
      page.getByTestId('elec-summary-self_regulating-length').locator('.elec-summary-card__value'),
    ).not.toHaveText('0');
    await expect(
      page.getByTestId('elec-summary-self_regulating-power').locator('.elec-summary-card__value'),
    ).not.toHaveText('0,0');
    await expect(
      page.getByTestId('elec-summary-self_regulating-start-current').locator('.elec-summary-card__value'),
    ).not.toHaveText('0,0');
  });

  test('основное меню связывает электрорасчёт со страницами теплопотерь и спецификации', async ({
    page,
  }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page, `E2E nav pipe ${Date.now()}`);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await page.getByRole('menuitem', { name: /Расчёт тепловых потерь/i }).click();
    await expect(page).toHaveURL(/\/workspace\/heat-calc/);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await page.getByRole('menuitem', { name: /Спецификация/i }).click();
    await expect(page).toHaveURL(/\/workspace\/specification/);
  });
});
