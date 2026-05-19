import { test, expect, type Locator, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';

async function selectDropdownOption(page: Page, optionText: string) {
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  const option = dropdown.locator('.ant-select-item-option').filter({ hasText: optionText }).first();
  await expect(option).toBeAttached();
  await option.evaluate((el) => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    (el as HTMLElement).click();
  });
}

async function rowForObject(page: Page, objectName: string): Promise<Locator> {
  const row = page.getByRole('row').filter({ hasText: objectName }).first();
  await expect(row).toBeVisible();
  return row;
}

async function selectCableType(
  page: Page,
  currentText: string,
  nextText: string,
  scopeSelector = '.actionbar-srs',
) {
  const cableTypeSelect = page.locator(`${scopeSelector} .ant-select-selector`).filter({
    hasText: currentText,
  }).first();
  await expect(cableTypeSelect).toBeVisible();
  await cableTypeSelect.click();
  await selectDropdownOption(page, nextText);
}

async function fetchElectricalCalcs(page: Page, projectId: string, sessionId: string) {
  const response = await page.request.get(`${API_BASE}/api/v1/calc/electrical`, {
    headers: { 'X-Session-Id': sessionId },
    params: { project_id: projectId, variant_number: 1 },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<
    Array<{
      object_id: string;
      cable_type: string;
      cable_mark: string | null;
      results: {
        winding_pitch?: number | null;
        num_circuits?: number | null;
        cable_length?: number | null;
        series?: string | null;
        connection_type?: string | null;
        selection_policy?: string | null;
        applied_selection_policy?: string | null;
        commercial?: Record<string, unknown> | null;
      };
    }>
  >;
}

async function ensureCheapTlt100CommercialData(page: Page) {
  const login = await page.request.post(`${API_BASE}/api/v1/auth/login`, {
    data: {
      email: process.env.ADMIN_EMAIL ?? 'admin@heatcalc.io',
      password: process.env.ADMIN_PASSWORD ?? 'admin',
    },
  });
  test.skip(!login.ok(), 'admin credentials are required to seed commercial E2E data');
  const { access_token: token } = await login.json();
  const headers = { Authorization: `Bearer ${token}` };
  const list = await page.request.get(`${API_BASE}/api/v1/admin/cables`, { headers });
  expect(list.ok()).toBeTruthy();
  const cables = (await list.json()) as Array<{ id: string; model: string }>;
  const existing = cables.find((item) => item.model === 'ТЛТ-100');
  const payload = {
    cable_type: 'self_regulating',
    brand: 'ТЛТ',
    model: 'ТЛТ-100',
    power_per_meter: 100,
    max_temperature: 190,
    min_temperature: -60,
    resistance_per_meter: null,
    supplier_name: 'E2E supplier',
    article: 'E2E-TLT-100',
    currency: 'RUB',
    price_per_meter: 1,
    stock_quantity_m: 100000,
    stock_status: 'in_stock',
    lead_time_days: 1,
    supplier_priority: 1,
    is_preferred: true,
    order_multiple_m: 1,
    min_order_quantity_m: 0,
    is_discontinued: false,
    replacement_group: null,
    price_updated_at: null,
    stock_updated_at: null,
    commercial_data_source: 'e2e',
    params: null,
    is_active: true,
  };
  const response = existing
    ? await page.request.put(`${API_BASE}/api/v1/admin/cables/${existing.id}`, {
        headers,
        data: payload,
      })
    : await page.request.post(`${API_BASE}/api/v1/admin/cables`, { headers, data: payload });
  expect(response.ok()).toBeTruthy();
}

async function expectBatchSuccess(page: Page) {
  await expect(page.getByText(/СО1 — расчёт выполнен для всех объектов: 1/i).last()).toBeVisible({
    timeout: 20_000,
  });
}

async function recalculateAll(page: Page) {
  await page.getByRole('button', { name: /Пересчитать все СО1/i }).click();
  await page.getByRole('button', { name: /Да, пересчитать все/i }).click();
}

test.describe('business flow: cable layout controls', () => {
  test('ручные шаг навива и нитки сохраняются после повторного электрорасчёта', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E layout pipe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await recalculateAll(page);
    await expectBatchSuccess(page);

    const row = await rowForObject(page, pipeName);
    await row.click();
    const pitchInput = row.getByRole('spinbutton').first();
    await expect(pitchInput).toBeEnabled();
    await expect(pitchInput).toHaveValue('0');

    await pitchInput.fill('200');
    await pitchInput.press('Tab');
    await expect(page.getByText('Параметры укладки применены')).toBeVisible();

    await row.locator('.ant-select-selector').nth(1).click();
    await selectDropdownOption(page, '2');
    await expect(page.getByText('Параметры укладки применены')).toBeVisible();

    await expect(pitchInput).toHaveValue('200');
    await expect(row.locator('.ant-select-selector').nth(1)).toContainText('2');

    await recalculateAll(page);
    await expectBatchSuccess(page);

    const refreshedRow = await rowForObject(page, pipeName);
    await refreshedRow.click();
    await expect(refreshedRow.getByRole('spinbutton').first()).toHaveValue('200');
    await expect(refreshedRow.locator('.ant-select-selector').nth(1)).toContainText('2');

    const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const calc = calcs.find((item) => item.object_id === pipe.id);
    expect(calc?.cable_mark).toBeTruthy();
    expect(calc?.results.winding_pitch).toBe(200);
    expect(calc?.results.num_circuits).toBe(2);
    expect(Number(calc?.results.cable_length)).toBeGreaterThan(50);
  });

  test('шаг навива валидируется по наружному диаметру и затем принимает рабочее значение', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipeName = `E2E pitch validation ${Date.now()}`;
    await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await recalculateAll(page);
    await expectBatchSuccess(page);

    const row = await rowForObject(page, pipeName);
    await row.click();
    const pitchInput = row.getByRole('spinbutton').first();

    await pitchInput.fill('50');
    await pitchInput.press('Tab');
    await expect(
      page.getByText(/Шаг навива должен быть больше наружного диаметра трубы/i),
    ).toBeVisible();

    await pitchInput.fill('200');
    await pitchInput.press('Tab');
    await expect(page.getByText('Параметры укладки применены')).toBeVisible();
    await expect(pitchInput).toHaveValue('200');
  });

  test('ТТН/ТТВ/ТТХ проходит через UI-параметры и сохраняет тип расчёта', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E TT pipe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      ambient_temperature: 20,
      process_temperature: 80,
    });

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await selectCableType(page, 'Саморегулирующийся', 'ТТН/ТТВ/ТТХ');

    await expect(page.getByText('T проп., °C:')).toBeVisible();
    await page.getByRole('checkbox', { name: /агр./i }).check();
    await recalculateAll(page);

    await expectBatchSuccess(page);
    const row = await rowForObject(page, pipeName);
    await expect(row).toContainText(/ТТ[НВХ].*-СТ/);

    const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const calc = calcs.find((item) => item.object_id === pipe.id);
    expect(calc?.cable_type).toBe('self_regulating_tt');
    expect(calc?.cable_mark).toMatch(/-СТ$/);
    expect(calc?.results.series).toMatch(/^ТТ[НВХ]$/);
  });

  test('резистивный одножильный кабель считается из UI с параметрами подключения', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E R1 pipe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await selectCableType(page, 'Саморегулирующийся', 'Однож. пост. мощн.');

    await expect(page.getByText('U:')).toBeVisible();
    await expect(page.getByText('w:')).toBeVisible();
    await expect(page.getByText('h:')).toBeVisible();
    await recalculateAll(page);

    await expectBatchSuccess(page);
    await rowForObject(page, pipeName);

    const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const calc = calcs.find((item) => item.object_id === pipe.id);
    expect(calc?.cable_type).toBe('single_core');
    expect(calc?.cable_mark).toBeTruthy();
    expect(calc?.results.connection_type).toBe('line_1ph');
  });

  test('резистивный трёхжильный кабель считается из UI и фиксирует свой тип', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E R3 pipe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await selectCableType(page, 'Саморегулирующийся', 'Трёхж. пост. мощн.');

    await page.locator('.actionbar-srs .ant-select-selector').filter({ hasText: 'Линия' }).first().click();
    await selectDropdownOption(page, 'Петля 1×3');
    await recalculateAll(page);

    await expectBatchSuccess(page);
    await rowForObject(page, pipeName);

    const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const calc = calcs.find((item) => item.object_id === pipe.id);
    expect(calc?.cable_type).toBe('three_core');
    expect(calc?.cable_mark).toBeTruthy();
    expect(calc?.results.connection_type).toBe('loop_1x3');
  });

  test('коммерческая база скрыта, встроенная база остаётся доступной', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E builtin source ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      ambient_temperature: -10,
      process_temperature: 40,
    });

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page.getByText('База для пересчёта:')).toBeVisible();
    await expect(page.getByText('Встроенная')).toBeVisible();
    await expect(page.getByLabel('Критерий подбора кабеля')).toHaveCount(0);
    await expect(page.getByText('Коммерческая')).toHaveCount(0);
    await recalculateAll(page);
    await expectBatchSuccess(page);

    await rowForObject(page, pipeName);

    const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const calc = calcs.find((item) => item.object_id === pipe.id);
    expect(calc?.cable_type).toBe('self_regulating');
    expect(calc?.cable_mark).toBeTruthy();
    expect(calc?.results.selection_policy).toBe('technical_minimum');
    expect(calc?.results.applied_selection_policy).toBe('technical_minimum');
    expect(calc?.results.commercial ?? null).toBeNull();
  });

  test('новый тип кабеля работает после перехода из теплопотерь в электрорасчёт', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E heat R3 ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await selectCableType(page, 'Саморегулирующийся', 'Трёхж. пост. мощн.');
    await expect(page.getByText('U:')).toBeVisible();
    await expect(page.getByText('w:')).toBeVisible();
    await expect(page.getByText('h:')).toBeVisible();

    await recalculateAll(page);
    await expectBatchSuccess(page);
    await expect(page.getByText(pipeName)).toBeVisible();
    await expect(page.getByText(/Рассчитан/i)).toBeVisible();

    const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const calc = calcs.find((item) => item.object_id === pipe.id);
    expect(calc?.cable_type).toBe('three_core');
    expect(calc?.cable_mark).toBeTruthy();
  });

  test('ТТ-кабель попадает в спецификацию и отчёт после полного пользовательского пути', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E TT spec ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName, {
      ambient_temperature: 20,
      process_temperature: 80,
    });

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await selectCableType(page, 'Саморегулирующийся', 'ТТН/ТТВ/ТТХ');
    await page.getByRole('checkbox', { name: /агр./i }).check();
    await recalculateAll(page);
    await expectBatchSuccess(page);

    const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const calc = calcs.find((item) => item.object_id === pipe.id);
    expect(calc?.cable_type).toBe('self_regulating_tt');
    expect(calc?.cable_mark).toMatch(/-СТ$/);
    const cableMark = calc!.cable_mark!;

    await page.getByRole('menuitem', { name: 'Спецификация' }).click();
    await page.getByRole('button', { name: /Сформировать/i }).click();
    await expect(page.getByText(cableMark).first()).toBeVisible();
    await expect(page.getByText(/Греющий кабель/i).first()).toBeVisible();

    await page.getByRole('menuitem', { name: 'Отчёт' }).click();
    await expect(page.getByTestId('report-preview')).toBeVisible();
    await expect(page.getByTestId('report-preview')).toContainText(pipeName);
    await expect(page.getByTestId('report-preview')).toContainText(cableMark);
  });
});
