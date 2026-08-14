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
  'supply_voltage',
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

const REMOVED_CASE1_HEAT_KEYS = [
  'aggressive_product',
  'winding_coefficient',
  'connection_type',
] as const;

async function createCleanCase1Pipe(page: Page, name: string) {
  const pipe = await createCalculatedPipe(page, name, {
    min_switch_temperature: -30,
    maintain_temperature: undefined,
    winding_pitch: undefined,
    number_of_threads: undefined,
  });
  const params = (pipe.params ?? {}) as Record<string, unknown>;
  for (const key of REMOVED_CASE1_HEAT_KEYS) {
    expect(params).not.toHaveProperty(key);
  }
  expect(Number(params.min_switch_temperature)).toBe(-30);
  return pipe;
}

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

async function dragFirstElectricalGlideRowTo(page: Page, targetTestId: string) {
  const source = page.locator('.electrical-spreadsheet--glide .dvn-scroller');
  const target = page.getByTestId(targetTestId);
  await expect(source).toHaveAttribute('draggable', 'true');
  await expect(target).toHaveAttribute('data-disabled', 'false');

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).toBeTruthy();
  expect(targetBox).toBeTruthy();

  const rowHeight = Number(
    await page.locator('.electrical-spreadsheet--glide').getAttribute('data-glide-row-height'),
  ) || 44;
  const sourceX = sourceBox!.x + 180;
  const sourceY = sourceBox!.y + rowHeight + 8 + rowHeight / 2;
  const targetX = targetBox!.x + targetBox!.width / 2;
  const targetY = targetBox!.y + targetBox!.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 10, sourceY + 10, { steps: 3 });
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();
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
  test('требует сохранить проектный I доп до запуска пересчёта', async ({ page }) => {
    await loginAsGuest(page);
    const pipe = await createCleanCase1Pipe(page, `E2E required I доп ${Date.now()}`);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await createFirstElectricalVariantIfNeeded(page);
    await assignObjectToFirstEr(page, pipe.id);
    await page.reload({ waitUntil: 'domcontentloaded' });

    const idop = page.getByTestId('elec-idop-input');
    await expect(idop).toHaveAttribute('aria-required', 'true');
    await expect(idop).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').filter({ hasText: 'Укажите I доп проекта' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Пересчитать все · ЭР1/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Пересчитать выбранные ЭР/i })).toHaveCount(0);

    await idop.fill('13');
    await page.getByTestId('elec-idop-save').click();

    await expect(idop).not.toHaveAttribute('aria-invalid');
    await expect(page.getByText('Укажите I доп проекта')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Пересчитать все · ЭР1/i })).toBeEnabled();
  });

  test('назначает и возвращает объект перетаскиванием из основной Glide-таблицы', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsGuest(page);
    await createCleanCase1Pipe(page, `E2E Glide DnD ${Date.now()}`);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await createFirstElectricalVariantIfNeeded(page);

    const assignResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'PATCH'
      && response.url().includes('/assignments'),
    );
    await dragFirstElectricalGlideRowTo(page, 'assignment-drop-zone-self_regulating');
    expect((await assignResponsePromise).ok()).toBeTruthy();

    const selfRegulatingTab = page.getByRole('tab', { name: /Самрег 1 объект/i });
    await expect(selfRegulatingTab).toBeVisible();
    await selfRegulatingTab.click();
    await expectElectricalGlideReady(page);

    await dragFirstElectricalGlideRowTo(page, 'assignment-drop-zone-unassigned');
    const confirmation = page.getByRole('dialog', {
      name: /Вернуть в нераспределённые: 1\?/i,
    });
    await expect(confirmation).toBeVisible();

    const unassignResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && response.url().includes('/unassign'),
    );
    await confirmation.getByRole('button', { name: 'Вернуть', exact: true }).click();
    expect((await unassignResponsePromise).ok()).toBeTruthy();

    await page.getByRole('tab', { name: /Нераспределённые объекты/i }).click();
    await expectElectricalGlideReady(page);
  });

  test('после расчёта объекта показывает марку кабеля, длину, мощность и ток', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E elec pipe ${Date.now()}`;
    const pipe = await createCleanCase1Pipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await createFirstElectricalVariantIfNeeded(page);
    await expectElectricalHeaderControlsInline(page);

    await showAllElectricalColumns(page);
    await expectElectricalHeaderControlsInline(page);

    await page.getByTestId('elec-idop-input').fill('80');
    await page.getByTestId('elec-idop-save').click();
    await expect(page.getByText('Не задан I доп проекта')).toHaveCount(0);

    await assignObjectToFirstEr(page, pipe.id);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: /Самрег 1 объект/i })).toBeVisible();
    // U — системная константа: контрола в UI нет, в payload всегда 230 В
    await expect(
      page.locator('input[role="spinbutton"][aria-label="Напряжение питания"]'),
    ).toHaveCount(0);

    const batchRequestPromise = page.waitForRequest((request) =>
      request.method() === 'POST' && request.url().includes('/api/v1/calc/electrical/batch/jobs'),
    );
    await recalculateCurrentEr(page);
    const batchPayload = (await batchRequestPromise).postDataJSON() as Record<string, unknown>;
    expect(batchPayload).toEqual(expect.objectContaining({ supply_voltage: 230 }));
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
    expect(Number(resolvedInputs.ambient_temperature_c)).toBe(-30);
    expect(Number(resolvedInputs.cold_start_temperature_c)).toBe(-30);
    expect(Number(resolvedInputs.nominal_voltage_v)).toBe(230);
    expect(Number(calc.results?.voltage)).toBe(230);
    expect(Number(calc.results?.current)).toBeCloseTo(
      Number(calc.results?.total_power) / 230,
      3,
    );
    for (const key of ['steam_temperature_c', 'maintain_temperature_c', 'aggressive_product']) {
      expect(resolvedInputs).not.toHaveProperty(key);
    }
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

  test('переход в спецификацию блокируется до ready ЭР и открывается после реального расчёта', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipe = await createCleanCase1Pipe(page, `E2E spec readiness ${Date.now()}`);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page).toHaveURL(/\/workspace\/elec-calc/);
    await createFirstElectricalVariantIfNeeded(page);

    const specificationAction = page.getByRole(
      'button',
      {
        name: /Перейти к спецификации — сначала распределите хотя бы один объект/i,
      },
    );
    await expect(specificationAction).toBeVisible();
    await expect(specificationAction).toBeDisabled();
    const electricalUrl = page.url();

    await specificationAction.click({ force: true });
    await expect(page).toHaveURL(electricalUrl);

    await specificationAction.press('Enter');
    await expect(page).toHaveURL(electricalUrl);
    await specificationAction.press('Space');
    await expect(page).toHaveURL(electricalUrl);
    await expect(specificationAction).not.toBeFocused();

    await page.getByTestId('elec-idop-input').fill('80');
    await page.getByTestId('elec-idop-save').click();
    await expect(page.getByText('Не задан I доп проекта')).toHaveCount(0);
    await assignObjectToFirstEr(page, pipe.id);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: /Самрег 1 объект/i })).toBeVisible();

    await recalculateCurrentEr(page);
    await expect(
      page.getByTestId('elec-summary-self_regulating-objects').locator('.elec-summary-card__value'),
    ).toHaveText('1', { timeout: 20_000 });
    const calculation = await expectElectricalCalcForObject(
      page,
      projectId,
      sessionId,
      pipe.id,
    );
    expect(calculation.cable_mark).toMatch(/ТТ[НВХ]/);

    const enabledSpecificationAction = page.getByRole(
      'button',
      { name: /^Перейти к спецификации$/i },
    );
    await expect(enabledSpecificationAction).toBeEnabled({ timeout: 20_000 });
    await enabledSpecificationAction.click();
    await expect(page).toHaveURL(/\/workspace\/specification/);
  });
});
