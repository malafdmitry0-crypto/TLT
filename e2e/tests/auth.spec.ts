import { test, expect } from '@playwright/test';

test.describe('4.1 Авторизация и доступ', () => {
  test('4.1.1 Главная страница — форма выбора роли', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Войти без регистрации/i)).toBeVisible();
    await expect(page.getByText(/Войти как сотрудник/i)).toBeVisible();
  });

  test('4.1.2 Гостевой вход → рабочий стол + авто-проект', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Начать без регистрации/i }).click();
    await expect(page).toHaveURL(/\/workspace/);
    // Авто-проект «Мой проект» виден в шапке
    await expect(page.getByTitle('Мой проект')).toBeVisible();
  });

  test('4.1.3 Неверные учётные данные → ошибка', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@test.com');
    await page.getByLabel('Пароль').fill('wrongpass');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByText(/Неверный email или пароль/i)).toBeVisible();
  });

  test('4.1.5 Без авторизации /admin недоступен', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL('/');
  });
});
