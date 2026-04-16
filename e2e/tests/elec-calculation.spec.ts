import { test, expect, type Page } from '@playwright/test';

async function loginAsGuest(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Начать без регистрации/i }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

test.describe('4.4 Электротехнический расчёт', () => {
  test('4.4.1 4-колоночная раскладка отображает блоки эскиза', async ({ page }) => {
    await loginAsGuest(page);
    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page.getByText(/Объекты обогрева/i).first()).toBeVisible();
    await expect(page.getByText(/Структура системы/i).first()).toBeVisible();
    await expect(page.getByText(/Блок конфигурирования объекта/i).first()).toBeVisible();
  });

  test('4.4.2 Без объектов в блоке «Объекты обогрева» показан алерт', async ({ page }) => {
    await loginAsGuest(page);
    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page.getByText(/нет объектов/i).first()).toBeVisible();
  });

  test('4.4.3 Переключатель вариантов СО1..СО4 доступен в меню', async ({ page }) => {
    await loginAsGuest(page);
    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page.getByText('Вариант системы')).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: /^СО1$/ })).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: /^СО4$/ })).toBeVisible();
  });

  test('4.4.4 Кнопка «Электрорасчёт» доступна на странице теплопотерь', async ({ page }) => {
    await loginAsGuest(page);
    await expect(
      page.getByRole('button', { name: /Электрорасчёт/i })
    ).toBeVisible();
  });
});
