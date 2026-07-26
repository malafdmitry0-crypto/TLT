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
import {
  COMMERCIAL_FEATURE_SKIP_REASON,
  e2eCommercialFeaturesEnabled,
} from './helpers/feature-flags';

const commercialFeaturesEnabled = e2eCommercialFeaturesEnabled();

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

test.describe('business flow: cable layout controls — cable-types', () => {
  test('ТТН/ТТВ/ТТХ проходит через UI-параметры и сохраняет тип расчёта', async ({ page }) => {
    test.skip(!commercialFeaturesEnabled, COMMERCIAL_FEATURE_SKIP_REASON);

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
    test.skip(!commercialFeaturesEnabled, COMMERCIAL_FEATURE_SKIP_REASON);

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
    test.skip(!commercialFeaturesEnabled, COMMERCIAL_FEATURE_SKIP_REASON);

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
});
