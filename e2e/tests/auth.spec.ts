import { test, expect } from '@playwright/test';

const EMPLOYEE_LOGIN_VIEWPORTS = [
  { width: 1000, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

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

  for (const viewport of EMPLOYEE_LOGIN_VIEWPORTS) {
    test(`4.1.6 Форма сотрудника сохраняет видимые accessible names — ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      const consoleProblems: string[] = [];
      const failedRequests: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error') {
          consoleProblems.push(`${message.type()}: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));
      page.on('requestfailed', (request) => failedRequests.push(
        `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown error'}`,
      ));

      await page.setViewportSize(viewport);
      await page.goto('/login?role=employee');

      const email = page.getByRole('textbox', { name: /Email$/ });
      const password = page.getByLabel('Пароль');
      await expect(email).toBeVisible();
      await expect(email).toHaveAccessibleName(/Email$/);
      await expect(email).not.toHaveAttribute('aria-label');
      await expect(password).toBeVisible();
      await expect(password).toHaveAccessibleName(/Пароль$/);
      await expect(password).not.toHaveAttribute('aria-label');

      const geometry = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('.login-page-card');
        const emailInput = document.querySelector<HTMLInputElement>('input[type="email"]');
        const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"]');
        if (!card || !emailInput || !passwordInput) return null;
        const cardRect = card.getBoundingClientRect();
        const emailRect = emailInput.getBoundingClientRect();
        const passwordRect = passwordInput.getBoundingClientRect();
        return {
          noPageOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          cardContainsInputs: [emailRect, passwordRect].every((rect) => (
            rect.left >= cardRect.left
            && rect.right <= cardRect.right
            && rect.top >= cardRect.top
            && rect.bottom <= cardRect.bottom
          )),
          controlsHaveSize: [emailRect, passwordRect].every((rect) => rect.width > 0 && rect.height > 0),
          controlsDoNotOverlap: emailRect.bottom <= passwordRect.top,
        };
      });

      expect(geometry).toEqual({
        noPageOverflow: true,
        cardContainsInputs: true,
        controlsHaveSize: true,
        controlsDoNotOverlap: true,
      });
      expect(consoleProblems).toEqual([]);
      expect(failedRequests).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`employee-login-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
    });
  }
});
