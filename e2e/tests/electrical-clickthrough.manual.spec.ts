import { test, expect, type Locator, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';

type CableType = 'self_regulating' | 'self_regulating_tt' | 'single_core' | 'three_core';

interface ElectricalCalcRow {
  object_id: string;
  cable_type: CableType;
  cable_mark: string | null;
  cable_mark_source: 'auto' | 'manual';
  params?: {
    cable_mark_source?: 'auto' | 'manual';
  };
  results?: {
    error?: string;
  };
}

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

async function goToElectrical(page: Page) {
  await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
  await expect(page).toHaveURL(/\/workspace\/elec-calc/);
}

async function rowForObject(page: Page, objectName: string): Promise<Locator> {
  const row = page.getByRole('row').filter({ hasText: objectName }).first();
  await expect(row).toBeVisible();
  return row;
}

async function fetchElectricalCalcs(page: Page, projectId: string, sessionId: string) {
  const response = await page.request.get(`${API_BASE}/api/v1/calc/electrical`, {
    headers: { 'X-Session-Id': sessionId },
    params: {
      project_id: projectId,
      variant_number: '1',
      page_size: '200',
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<ElectricalCalcRow[]>;
}

async function waitForElectricalIdle(page: Page) {
  await expect(page.getByText(/Электрорасчёт выполняется/i)).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Пересчитать все СО1/i })).toBeEnabled({
    timeout: 15_000,
  });
}

async function waitForCableTypes(
  page: Page,
  projectId: string,
  sessionId: string,
  expectedByObjectId: Record<string, CableType>,
) {
  const ids = Object.keys(expectedByObjectId);
  await expect
    .poll(async () => {
      const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
      return Object.fromEntries(
        ids.map((id) => [id, calcs.find((calc) => calc.object_id === id)?.cable_type ?? null]),
      );
    })
    .toEqual(expectedByObjectId);
}

async function waitForNoElectricalCalcs(page: Page, projectId: string, sessionId: string) {
  await expect
    .poll(async () => (await fetchElectricalCalcs(page, projectId, sessionId)).length)
    .toBe(0);
}

async function clickRecalculateAll(page: Page, confirm = true) {
  await page.getByRole('button', { name: /Пересчитать все СО1/i }).click();
  await expect(page.getByText(/Все объекты СО1 будут пересчитаны/i)).toBeVisible();
  await page.getByRole('button', { name: confirm ? /Да, пересчитать все/i : /Отмена/i }).click();
  if (confirm) {
    await waitForElectricalIdle(page);
  }
}

async function selectActionBarCableType(page: Page, currentText: string, nextText: string) {
  const cableTypeSelect = page.locator('.actionbar-srs .ant-select').filter({
    hasText: currentText,
  }).first();
  await expect(cableTypeSelect).toBeVisible();
  await expect(cableTypeSelect).not.toHaveClass(/ant-select-disabled/, { timeout: 15_000 });
  await cableTypeSelect.locator('.ant-select-selector').click();
  await selectDropdownOption(page, nextText);
}

async function selectRow(page: Page, objectName: string) {
  const row = await rowForObject(page, objectName);
  await row.locator('.ant-checkbox-input').check({ force: true });
}

async function expectManualMark(
  page: Page,
  projectId: string,
  sessionId: string,
  objectId: string,
  expectedMark: string,
) {
  await expect
    .poll(async () => {
      const calcs = await fetchElectricalCalcs(page, projectId, sessionId);
      const calc = calcs.find((item) => item.object_id === objectId);
      return {
        mark: calc?.cable_mark ?? null,
        source: calc?.cable_mark_source ?? null,
        paramSource: calc?.params?.cable_mark_source ?? null,
      };
    })
    .toEqual({
      mark: expectedMark,
      source: 'manual',
      paramSource: 'manual',
    });
}

test.describe('electrical clickthrough @manual', () => {
  test('полный пересчёт требует подтверждения и только после него создаёт расчёты', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const first = await createCalculatedPipe(page, `E2E full confirm A ${Date.now()}`, {
      ambient_temperature: 20,
      process_temperature: 80,
    });
    const second = await createCalculatedPipe(page, `E2E full confirm B ${Date.now()}`, {
      ambient_temperature: 20,
      process_temperature: 80,
    });

    await goToElectrical(page);
    await clickRecalculateAll(page, false);
    await waitForNoElectricalCalcs(page, projectId, sessionId);

    await clickRecalculateAll(page, true);
    await waitForCableTypes(page, projectId, sessionId, {
      [first.id]: 'self_regulating',
      [second.id]: 'self_regulating',
    });
    await expect(page.getByText(/рассчитано:\s*2\/2/i)).toBeVisible();
  });

  test('смена типа для пересчёта не меняет сохранённые строки до подтверждённого пересчёта всех', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const first = await createCalculatedPipe(page, `E2E default type A ${Date.now()}`, {
      ambient_temperature: 20,
      process_temperature: 80,
    });
    const second = await createCalculatedPipe(page, `E2E default type B ${Date.now()}`, {
      ambient_temperature: 20,
      process_temperature: 80,
    });

    await goToElectrical(page);
    await clickRecalculateAll(page, true);
    await waitForCableTypes(page, projectId, sessionId, {
      [first.id]: 'self_regulating',
      [second.id]: 'self_regulating',
    });

    await selectActionBarCableType(page, 'Саморегулирующийся', 'ТТН/ТТВ/ТТХ');
    await waitForCableTypes(page, projectId, sessionId, {
      [first.id]: 'self_regulating',
      [second.id]: 'self_regulating',
    });

    await clickRecalculateAll(page, true);
    await waitForCableTypes(page, projectId, sessionId, {
      [first.id]: 'self_regulating_tt',
      [second.id]: 'self_regulating_tt',
    });
  });

  test('пересчёт выбранных применяет новый тип только к отмеченным строкам', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const selectedA = await createCalculatedPipe(page, `E2E selected A ${Date.now()}`, {
      ambient_temperature: 20,
      process_temperature: 80,
    });
    const selectedB = await createCalculatedPipe(page, `E2E selected B ${Date.now()}`, {
      ambient_temperature: 20,
      process_temperature: 80,
    });
    const untouched = await createCalculatedPipe(page, `E2E untouched ${Date.now()}`, {
      ambient_temperature: 20,
      process_temperature: 80,
    });

    await goToElectrical(page);
    await clickRecalculateAll(page, true);
    await waitForCableTypes(page, projectId, sessionId, {
      [selectedA.id]: 'self_regulating',
      [selectedB.id]: 'self_regulating',
      [untouched.id]: 'self_regulating',
    });

    await selectRow(page, selectedA.params.name);
    await selectRow(page, selectedB.params.name);
    await selectActionBarCableType(page, 'Саморегулирующийся', 'ТТН/ТТВ/ТТХ');
    await page.getByRole('button', { name: /Пересчитать выбранные \(2\)/i }).click();

    await waitForCableTypes(page, projectId, sessionId, {
      [selectedA.id]: 'self_regulating_tt',
      [selectedB.id]: 'self_regulating_tt',
      [untouched.id]: 'self_regulating',
    });
  });

  test('ручной выбор марки помечает именно марку кабеля как ручную и сохраняет источник на бэке', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipe = await createCalculatedPipe(page, `E2E manual mark ${Date.now()}`, {
      ambient_temperature: 20,
      process_temperature: 45,
      insulation_thickness: 0.1,
    });

    await goToElectrical(page);
    await clickRecalculateAll(page, true);
    await waitForCableTypes(page, projectId, sessionId, {
      [pipe.id]: 'self_regulating',
    });

    const row = await rowForObject(page, pipe.params.name);
    await row.click();
    await row.locator('.ant-select-selector').first().click();
    await selectDropdownOption(page, 'ТЛТ-100');
    await expectManualMark(page, projectId, sessionId, pipe.id, 'ТЛТ-100');

    const refreshedRow = await rowForObject(page, pipe.params.name);
    await expect(refreshedRow.locator('.ant-tag').filter({ hasText: 'ручн.' })).toHaveCount(1);
    await expect(refreshedRow).toContainText('ТЛТ-100');
  });
});
