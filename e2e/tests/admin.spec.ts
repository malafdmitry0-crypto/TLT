import { test, expect } from '@playwright/test';

test.describe('4.7 Администрирование', () => {
  test('4.7.1 Логин админа → доступ к /admin/users', async ({ page }) => {
    await page.goto('/login?role=admin');
    await page.getByLabel('Email').fill(process.env.ADMIN_EMAIL ?? 'admin@heatcalc.io');
    await page.getByLabel('Пароль').fill(process.env.ADMIN_PASSWORD ?? 'admin');
    await page.getByRole('button', { name: 'Войти' }).click();
    // После логина админа — редирект на /admin/users
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText('Сотрудники').first()).toBeVisible();
  });
});
