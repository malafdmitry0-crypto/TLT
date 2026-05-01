import { test, expect } from '@playwright/test';

import { createCalculatedPipe, loginAsGuest } from './helpers/workspace';

test.describe('4.4 Электротехнический расчёт', () => {
  test('пустой проект показывает таблицу электрорасчёта, варианты СО1..СО4 и сообщение', async ({
    page,
  }) => {
    await loginAsGuest(page);
    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page).toHaveURL(/\/workspace\/elec-calc/);

    await expect(page.getByText(/СО1 · Саморегулирующийся · расчёт не выполнен/i)).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: /^СО1$/ })).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: /^СО4$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Выполнить электрорасчёт СО1/i })).toBeDisabled();
    await expect(page.getByText(/нет объектов/i)).toBeVisible();
  });

  test('после расчёта объекта показывает марку кабеля, длину, мощность и ток', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipeName = `E2E elec pipe ${Date.now()}`;
    await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page.getByText(pipeName)).toBeVisible();
    await expect(page.getByText('не рассчитан')).toBeVisible();

    await page.getByRole('button', { name: /Выполнить электрорасчёт СО1/i }).click();

    await expect(page.getByText(/СО1 — расчёт выполнен для 1 объектов/i)).toBeVisible();
    await expect(page.getByText(/СО1 · Саморегулирующийся · 55.0 м · 5.50 кВт · 25.00 А · рассчитано: 1\/1/i)).toBeVisible();
    await expect(page.getByText('рассчитан', { exact: true })).toBeVisible();
    await expect(page.getByText(/ТЛТ-100 · 100 Вт\/м/)).toBeVisible();
    await expect(page.getByText('55,0')).toBeVisible();
    await expect(page.getByText('5,50 кВт')).toBeVisible();
    await expect(page.getByText('25,00')).toBeVisible();
  });

  test('варианты СО изолированы: расчёт СО2 не подменяет статус СО1', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipeName = `E2E variant pipe ${Date.now()}`;
    await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await page.getByRole('button').filter({ hasText: /^СО2$/ }).click();
    await expect(page.getByText(/СО2 · Саморегулирующийся · расчёт не выполнен/i)).toBeVisible();

    await page.getByRole('button', { name: /Выполнить электрорасчёт СО2/i }).click();
    await expect(page.getByText(/СО2 — расчёт выполнен для 1 объектов/i)).toBeVisible();
    await expect(page.getByText(/СО2 · Саморегулирующийся · 55.0 м · 5.50 кВт · 25.00 А · рассчитано: 1\/1/i)).toBeVisible();
    await expect(page.getByText(pipeName)).toBeVisible();

    await page.getByRole('button').filter({ hasText: /^СО1$/ }).click();
    await expect(page.getByText(/СО1 · Саморегулирующийся · расчёт не выполнен/i)).toBeVisible();
    await expect(page.getByText('не рассчитан')).toBeVisible();
  });

  test('кнопки навигации связывают электрорасчёт со страницами теплопотерь и спецификации', async ({
    page,
  }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page, `E2E nav pipe ${Date.now()}`);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await page.getByRole('button', { name: /← Теплопотери/i }).click();
    await expect(page).toHaveURL(/\/workspace\/heat-calc/);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await page.getByRole('button', { name: /Спецификация →/i }).click();
    await expect(page).toHaveURL(/\/workspace\/specification/);
  });
});
