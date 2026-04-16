import { test, expect, type Page } from '@playwright/test';

async function loginAsGuest(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Начать без регистрации/i }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

test.describe('4.3 Теплотехнический расчёт', () => {
  test('4.3.1 Левая панель содержит кнопки добавления Трубы / Резервуары', async ({ page }) => {
    await loginAsGuest(page);
    await expect(
      page.getByRole('button').filter({ hasText: 'Трубы' })
    ).toBeVisible();
    await expect(
      page.getByRole('button').filter({ hasText: 'Резервуары' })
    ).toBeVisible();
  });

  test('4.3.2 Нажатие «Трубы» открывает мастер (модалка)', async ({ page }) => {
    await loginAsGuest(page);
    await page.getByRole('button').filter({ hasText: 'Трубы' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('4.3.3 Кнопка «Электрорасчёт» присутствует в шапке таблицы', async ({ page }) => {
    await loginAsGuest(page);
    await expect(
      page.getByRole('button', { name: /Электрорасчёт/i })
    ).toBeVisible();
  });

  test('4.3.4 Без объектов кнопка «Электрорасчёт» задизейблена', async ({ page }) => {
    await loginAsGuest(page);
    const btn = page.getByRole('button', { name: /Электрорасчёт/i });
    await expect(btn).toBeDisabled();
  });
});
