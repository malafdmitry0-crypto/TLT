import { test, expect, type Page } from '@playwright/test';

import { createCalculatedPipe, loginAsGuest } from './helpers/workspace';

async function recalculateAll(page: Page, variant = 1) {
  await page.getByRole('button', { name: new RegExp(`Пересчитать все СО${variant}`, 'i') }).click();
  await page.getByRole('button', { name: /Да, пересчитать все/i }).click();
}

test.describe('4.4 Электротехнический расчёт', () => {
  test('пустой проект показывает таблицу электрорасчёта, варианты СО1..СО4 и сообщение', async ({
    page,
  }) => {
    await loginAsGuest(page);
    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page).toHaveURL(/\/workspace\/elec-calc/);

    await expect(page.getByText(/СО1 · тип по объектам · расчёт не выполнен/i)).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: /^СО1$/ })).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: /^СО4$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Пересчитать все СО1/i })).toBeDisabled();
    await expect(page.getByText(/нет объектов/i)).toBeVisible();
  });

  test('после расчёта объекта показывает марку кабеля, длину, мощность и ток', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipeName = `E2E elec pipe ${Date.now()}`;
    await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    const row = page.getByRole('row').filter({ hasText: pipeName }).first();
    await expect(row).toBeVisible();
    await expect(page.getByText(/СО1 · тип по объектам · расчёт не выполнен/i)).toBeVisible();

    await recalculateAll(page);

    await expect(page.getByText(/СО1 — расчёт выполнен для всех объектов: 1/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/СО1 · тип по объектам · .*рассчитано: 1\/1/i)).toBeVisible();
    await expect(page.getByText(/ТЛТ-100/)).toBeVisible();
    await expect(page.getByText(/6,49 кВт|6\.49 кВт/i).first()).toBeVisible();
  });

  test('варианты СО изолированы: расчёт СО2 не подменяет статус СО1', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipeName = `E2E variant pipe ${Date.now()}`;
    await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await page.getByRole('button').filter({ hasText: /^СО2$/ }).click();
    await expect(page.getByText(/СО2 · тип по объектам · расчёт не выполнен/i)).toBeVisible();

    await recalculateAll(page, 2);
    await expect(page.getByText(/СО2 — расчёт выполнен для всех объектов: 1/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/СО2 · тип по объектам · .*рассчитано: 1\/1/i)).toBeVisible();
    await expect(page.getByText(pipeName)).toBeVisible();

    await page.getByRole('button').filter({ hasText: /^СО1$/ }).click();
    await expect(page.getByText(/СО1 · тип по объектам · расчёт не выполнен/i)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: pipeName }).first()).toBeVisible();
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
