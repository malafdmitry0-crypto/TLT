import { test, expect } from '@playwright/test';

test.describe('4.5 Спецификация', () => {
  test('4.5.1 Открытие страницы спецификации', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Начать без регистрации/i }).click();
    await expect(page).toHaveURL(/\/workspace/);
    await page.getByRole('menuitem', { name: 'Спецификация' }).click();
    const buttons = page.getByRole('button');
    await expect(buttons.filter({ hasText: /^Сформировать$/i })).toBeVisible();
  });
});
