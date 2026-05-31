import { test, expect, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  createCalculatedTank,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';
import {
  clickFirstElectricalGridRow,
  editFirstElectricalGridLayoutCell,
  expectElectricalCalcForObject,
  expectElectricalGlideReady,
  expectElectricalGridHasNoOpenEditor,
  fetchElectricalCalcs,
} from './helpers/electrical-glide';

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

async function openElectricalSettingsDialog(page: Page) {
  const settingsDialog = page.locator('.electrical-column-settings-dialog').filter({
    hasText: 'Настройки таблицы электрорасчёта',
  });
  const settingsButton = page.getByRole('button', { name: /^Настройки$/ });

  await expect(settingsButton).toBeVisible();
  await expect(async () => {
    await settingsButton.click();
    await expect(settingsDialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 10_000 });

  return settingsDialog;
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
  test('резервуар проходит UI batch ТЛТ с геометрией укладки и заказным запасом отдельно', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const tank = await createCalculatedTank(page, `E2E TLT tank ${Date.now()}`);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page).toHaveURL(/\/workspace\/elec-calc/);
    await expect(page.getByText(/СО1 · тип по объектам/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Пересчитать все СО1/i })).toBeVisible();
    const batchRequestPromise = page.waitForRequest((request) =>
      request.method() === 'POST' && request.url().includes('/api/v1/calc/electrical/batch/jobs'),
    );
    await recalculateAll(page);
    const batchRequest = await batchRequestPromise;
    const batchPayload = batchRequest.postDataJSON() as Record<string, unknown>;
    expect(batchPayload).toEqual(
      expect.objectContaining({
        cable_type: 'self_regulating',
        cable_source: 'builtin',
        laying_step: 0.1,
        project_id: projectId,
      }),
    );
    await expectBatchSuccess(page);
    await expectElectricalGlideReady(page);

    const calc = await expectElectricalCalcForObject(page, projectId, sessionId, tank.id);
    expect(calc.cable_type).toBe('self_regulating');
    expect(calc.cable_mark).toMatch(/^ТЛТ-/);

    const diameter = Number(tank.params.diameter);
    const heatingHeight = Number(tank.params.height);
    const layingStep = Number(batchPayload.laying_step);
    const threads = Number(calc.results?.num_circuits);
    const windingCoefficient = Number(calc.results?.winding_coefficient);
    const installedCableLength = Number(calc.results?.installed_cable_length);
    const orderCableLength = Number(calc.results?.order_cable_length);
    const powerPerMeter = Number(calc.results?.power_per_meter);
    const totalPower = Number(calc.results?.total_power);

    // Источник формулы: backend/app/formulas/electrical/cable_geometry.py.
    // Для цилиндра N = (pi * D / 2) * (h / laying_step).
    const baseTankCableLength = (Math.PI * diameter / 2) * (heatingHeight / layingStep);
    const expectedInstalledLength = baseTankCableLength * windingCoefficient * threads;

    expect(layingStep).toBe(0.1);
    expect(installedCableLength).toBeCloseTo(expectedInstalledLength, 3);
    expect(orderCableLength).toBeCloseTo(installedCableLength * 1.1, 3);
    expect(totalPower).toBeCloseTo(powerPerMeter * expectedInstalledLength, 3);
    expect(totalPower).toBeGreaterThanOrEqual(Number(tank.results.total_heat_loss));
  });

  test('автоматические шаг навива и нитки стабильны после повторного электрорасчёта', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E layout pipe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await recalculateAll(page);
    await expectBatchSuccess(page);

    await expectElectricalGlideReady(page);
    await clickFirstElectricalGridRow(page);
    await expectElectricalGridHasNoOpenEditor(page);

    const firstCalcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const firstCalc = firstCalcs.find((item) => item.object_id === pipe.id);
    expect(firstCalc?.cable_mark).toBeTruthy();
    expect(firstCalc?.results.winding_pitch).toBeDefined();
    expect(Number(firstCalc?.results.num_circuits)).toBeGreaterThanOrEqual(1);

    await recalculateAll(page);
    await expectBatchSuccess(page);

    await expectElectricalGlideReady(page);
    await clickFirstElectricalGridRow(page);
    await expectElectricalGridHasNoOpenEditor(page);

    const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const calc = calcs.find((item) => item.object_id === pipe.id);
    expect(calc?.cable_mark).toBeTruthy();
    expect(calc?.results.winding_pitch).toBe(firstCalc?.results.winding_pitch);
    expect(calc?.results.num_circuits).toBe(firstCalc?.results.num_circuits);
    expect(Number(calc?.results.cable_length)).toBeGreaterThan(50);
  });

  test('Glide-таблица редактирует шаг навива и количество ниток SC-04', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E layout edit ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await recalculateAll(page);
    await expectBatchSuccess(page);

    await expectElectricalGlideReady(page);
    await editFirstElectricalGridLayoutCell(page, 'winding_pitch_mm', '400');

    await expect.poll(async () => {
      const rows = await fetchElectricalCalcs(page, projectId, sessionId);
      const row = rows.find((item) => item.object_id === pipe.id);
      return row?.results?.winding_pitch;
    }).toBe(400);

    await editFirstElectricalGridLayoutCell(page, 'number_of_threads', '2');

    const calc = await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id);
    expect(calc.cable_mark).toBeTruthy();
    expect(calc.results?.winding_pitch).toBe(400);
    expect(calc.results?.num_circuits).toBe(2);
    expect(calc.results?.number_of_threads_source).toBe('manual');
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
    await expectElectricalGlideReady(page);

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
    await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id);
    await expectElectricalGlideReady(page);

    const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const calc = calcs.find((item) => item.object_id === pipe.id);
    expect(calc?.cable_type).toBe('single_core');
    expect(calc?.cable_mark).toBeTruthy();
    expect(calc?.results.connection_type).toBe('loop_1ph');
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

    await recalculateAll(page);

    await expectBatchSuccess(page);
    await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id);
    await expectElectricalGlideReady(page);

    const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
    const calc = calcs.find((item) => item.object_id === pipe.id);
    expect(calc?.cable_type).toBe('three_core');
    expect(calc?.cable_mark).toBeTruthy();
    expect(calc?.results.connection_type).toBe('loop_2x3');
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
    await expect(page.getByText('База для пересчёта:')).toHaveCount(0);
    const settingsDialog = await openElectricalSettingsDialog(page);
    await settingsDialog.getByRole('tab', { name: 'Остальное' }).click();
    await expect(settingsDialog.getByText('База для пересчёта:')).toBeVisible();
    await expect(settingsDialog.getByText('Встроенная')).toBeVisible();
    await expect(page.getByLabel('Критерий подбора кабеля')).toHaveCount(0);
    await expect(settingsDialog.getByText('Коммерческая')).toHaveCount(0);
    await settingsDialog.getByRole('button', { name: 'Отмена' }).click();
    await recalculateAll(page);
    await expectBatchSuccess(page);

    await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id);
    await expectElectricalGlideReady(page);

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
    await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id);
    await expectElectricalGlideReady(page);

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
