import { test, expect, type Page } from '@playwright/test';

import { createCalculatedPipe, currentGuestContext, loginAsGuest } from './helpers/workspace';
import {
  expectElectricalCalcForObject,
  expectElectricalGlideReady,
  fetchElectricalCalcs,
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
  'winding_coefficient',
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
  'heat_loss_per_meter',
  'heat_loss_per_m2',
  'total_heat_loss',
] as const;

type ElectricalColumnKey = typeof ALL_ELECTRICAL_COLUMN_KEYS[number];

async function recalculateAll(page: Page, variant = 1) {
  await page.getByRole('button', { name: new RegExp(`Пересчитать все СО${variant}`, 'i') }).click();
  await page.getByRole('button', { name: /Да, пересчитать все/i }).click();
}

async function expectElectricalActionbarSingleLine(page: Page) {
  await expect(page.locator('.electrical-actionbar')).toBeVisible();

  const issues = await page.locator('.electrical-actionbar').evaluate((actionbar) => {
    const setup = actionbar.querySelector<HTMLElement>('.electrical-actionbar-row--setup');
    const actions = actionbar.querySelector<HTMLElement>('.electrical-actionbar-row--actions');
    if (!setup || !actions) return ['actionbar rows are missing'];

    const setupRect = setup.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    const rowTopDelta = Math.abs(setupRect.top - actionsRect.top);

    return rowTopDelta > 2
      ? [`actionbar rows are stacked (${Math.round(rowTopDelta)}px vertical delta)`]
      : [];
  });

  expect(issues).toEqual([]);
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
  test('пустой проект показывает таблицу электрорасчёта, варианты СО1..СО4 и сообщение', async ({
    page,
  }) => {
    await loginAsGuest(page);
    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page).toHaveURL(/\/workspace\/elec-calc/);

    await expectElectricalActionbarSingleLine(page);
    await expect(page.getByText(/СО1 · тип по объектам · расчёт не выполнен/i)).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: /^СО1$/ })).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: /^СО4$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Пересчитать все СО1/i })).toBeDisabled();
    await expect(page.getByText(/нет объектов/i)).toBeVisible();
  });

  test('не показывает тип кабеля в строке до запуска электрорасчёта', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E no cable type before calc ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);
    await showElectricalColumns(page, [
      'index',
      'object_name',
      'electrical_status',
      'cable_type',
      'cable_mark',
    ]);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expectElectricalGlideReady(page);
    await expect.poll(async () => {
      const rows = await fetchElectricalCalcs(page, projectId, sessionId);
      return rows.find((row) => row.object_id === pipe.id)?.cable_mark ?? null;
    }).toBeNull();

    await recalculateAll(page);

    await expect(page.getByText(/СО1 — расчёт выполнен для всех объектов: 1/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect.poll(async () => {
      const rows = await fetchElectricalCalcs(page, projectId, sessionId);
      return rows.find((row) => row.object_id === pipe.id)?.cable_mark ?? '';
    }).toContain('ТЛТ-100');
  });

  test('после расчёта объекта показывает марку кабеля, длину, мощность и ток', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E elec pipe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expectElectricalHeaderControlsInline(page);

    await showAllElectricalColumns(page);
    await expectElectricalHeaderControlsInline(page);

    await expect(page.getByText(/СО1 · тип по объектам · расчёт не выполнен/i)).toBeVisible();

    await recalculateAll(page);

    await expect(page.getByText(/СО1 — расчёт выполнен для всех объектов: 1/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/СО1 · тип по объектам · .*рассчитано: 1\/1/i)).toBeVisible();
    const calc = await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id);
    expect(calc.cable_mark).toContain('ТЛТ-100');
    expect(Number(calc.results?.order_cable_length ?? calc.results?.cable_length)).toBeGreaterThan(0);
    expect(Number(calc.results?.total_power)).toBeGreaterThan(0);
    expect(Number(calc.results?.current)).toBeGreaterThan(0);
    await expect(page.getByText(/11,80 кВт|11\.80 кВт/i).first()).toBeVisible();
  });

  test('варианты СО изолированы: расчёт СО2 не подменяет статус СО1', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E variant pipe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await page.getByRole('button').filter({ hasText: /^СО2$/ }).click();
    await expect(page.getByText(/СО2 · тип по объектам · расчёт не выполнен/i)).toBeVisible();

    await recalculateAll(page, 2);
    await expect(page.getByText(/СО2 — расчёт выполнен для всех объектов: 1/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/СО2 · тип по объектам · .*рассчитано: 1\/1/i)).toBeVisible();
    const co2Calc = await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id, 2);
    expect(co2Calc.cable_mark).toBeTruthy();

    await page.getByRole('button').filter({ hasText: /^СО1$/ }).click();
    await expect(page.getByText(/СО1 · тип по объектам · расчёт не выполнен/i)).toBeVisible();
    await expect.poll(async () => {
      const rows = await fetchElectricalCalcs(page, projectId, sessionId, 1);
      return rows.find((row) => row.object_id === pipe.id)?.cable_mark ?? null;
    }).toBeNull();
    await expectElectricalGlideReady(page);
  });

  test('создаёт СО на основании рассчитанного СО1 без Network Error', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E copy variant pipe ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);
    await showElectricalColumns(page, [
      'index',
      'object_name',
      'electrical_status',
      'cable_mark',
      'applied_selection_policy',
      'selection_reason',
    ]);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await recalculateAll(page);
    await expect(page.getByText(/СО1 — расчёт выполнен для всех объектов: 1/i)).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: /Создать на основании/i }).click();
    await page.getByText('Скопировать СО1 в СО2').click();
    const copyResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/calc/electrical/variants/copy'),
    );
    await page.getByRole('button', { name: 'Создать', exact: true }).click();

    await expect.poll(async () => (await copyResponse).status()).toBe(200);
    await expect(page.getByText(/Network Error/i)).toHaveCount(0);
    await expect(page.getByRole('button').filter({ hasText: /^СО2$/ })).toHaveClass(/ant-btn-primary/);
    await expect(page.getByText(/СО2 · тип по объектам · .*рассчитано: 1\/1/i)).toBeVisible();
    const targetCalc = await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id, 2);
    expect(targetCalc.cable_mark).toBeTruthy();
    expect(targetCalc.results?.applied_selection_policy ?? targetCalc.results?.selection_policy).toBe('technical_minimum');
    await expectElectricalGlideReady(page);
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
