import { test, expect } from '@playwright/test';
import { ensureTestEmployee, loginAsTestEmployee } from './helpers/employee';

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8000';

test.beforeAll(async () => {
  await ensureTestEmployee(API_BASE);
});

test.describe('4.2 Управление проектами', () => {
  test('4.2.1 Пользователь получает авто-проект и не видит «Новый проект»', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Начать без регистрации/i }).click();
    await expect(page).toHaveURL(/\/workspace/);
    // В шапке нет кнопок создания/открытия проекта — у пользователя ровно один авто-проект
    await expect(page.getByRole('button', { name: 'Новый проект' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Открыть' })).toHaveCount(0);
    // Но есть экспорт/импорт
    await expect(page.locator('button[title="Скачать проект (CSV)"]')).toBeVisible();
    await expect(page.locator('button[title="Загрузить проект (CSV)"]')).toBeVisible();
  });

  test('4.2.2 Сотрудник создаёт проект через ProjectMenu', async ({ page }) => {
    await loginAsTestEmployee(page);
    // После логина сотрудник уже на /workspace/heat-calc — SPA-навигация сохраняет auth store.
    await page.getByRole('button', { name: /Новый проект/i }).click();
    const unique = `E2E-проект-${Date.now()}`;
    await page.getByPlaceholder('Название проекта').fill(unique);
    await page.getByRole('button', { name: 'Создать' }).click();
    await expect(page.getByText('Проект создан')).toBeVisible();
  });

  test('4.2.3 Сотрудник дублирует проект из ProjectsPage', async ({ page }) => {
    await loginAsTestEmployee(page);
    const unique = `Дубл-${Date.now()}`;
    await page.getByRole('button', { name: /Новый проект/i }).click();
    await page.getByPlaceholder('Название проекта').fill(unique);
    await page.getByRole('button', { name: 'Создать' }).click();
    await expect(page.getByText('Проект создан')).toBeVisible();

    // SPA-навигация через ProjectMenu
    await page.getByRole('button', { name: 'Открыть', exact: true }).click();
    await expect(page).toHaveURL(/\/projects/);
    await page.getByPlaceholder('По названию').fill(unique);
    const row = page.getByRole('row', { name: new RegExp(unique) }).first();
    await row.getByRole('button', { name: 'Дублировать' }).click();
    await expect(page.getByText(new RegExp(`${unique} \\(копия\\)`)).first()).toBeVisible({ timeout: 10_000 });
  });
});
