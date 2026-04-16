/**
 * Visual regression — snapshot ключевых экранов.
 * Цель: поймать сдвиг кнопок / поломку темы / искажение layout после апгрейда antd.
 *
 * Как обновить snapshots при намеренном изменении UI:
 *   E2E_BASE_URL=http://localhost:3003 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
 *     npx playwright test visual-regression --update-snapshots
 */
import { test, expect } from '@playwright/test';
import { ensureTestEmployee, loginAsTestEmployee } from './helpers/employee';

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8000';

test.describe('Visual regression', () => {
  test.beforeAll(async () => {
    await ensureTestEmployee(API_BASE);
  });

  test('главная страница (выбор роли)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('home.png', {
      maxDiffPixelRatio: 0.05,  // 5% толерантность к шрифтам/anti-alias
      fullPage: true,
    });
  });

  test('страница логина', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('login.png', {
      maxDiffPixelRatio: 0.05,
      fullPage: true,
    });
  });

  test('пользователь — рабочий стол с авто-проектом', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Начать без регистрации/i }).click();
    await expect(page).toHaveURL(/\/workspace/);
    await page.waitForLoadState('networkidle');
    // Дадим UI стабилизироваться (загрузка списка объектов)
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('workspace-guest.png', {
      maxDiffPixelRatio: 0.07,
      fullPage: true,
      // Маскируем динамические части (имя авто-проекта с timestamp если есть)
      mask: [page.locator('[data-testid="last-updated"]')],
    });
  });

  test('сотрудник — шапка ProjectMenu (стабильная область)', async ({ page }) => {
    await loginAsTestEmployee(page);
    await page.getByRole('menuitem', { name: /Проекты/i }).click();
    await expect(page).toHaveURL(/\/projects/);
    await page.waitForLoadState('networkidle');
    // Снимаем только banner — в нём только статичные кнопки
    const header = page.locator('header.heatcalc-header').first();
    await expect(header).toHaveScreenshot('header-employee.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});
