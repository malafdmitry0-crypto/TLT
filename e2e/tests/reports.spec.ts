import { test, expect, type Page } from '@playwright/test';

async function openReportAsGuest(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Начать без регистрации/i }).click();
  await expect(page).toHaveURL(/\/workspace/);
  await page.getByRole('menuitem', { name: 'Отчёт' }).click();
}

test.describe('4.6 Отчёты', () => {
  test('4.6.1 Предпросмотр доступен гостю', async ({ page }) => {
    await openReportAsGuest(page);
    await expect(page.getByRole('heading', { name: 'Отчёт по проекту' })).toBeVisible();
  });

  test('4.6.2 Кнопки экспорта скрыты у гостя', async ({ page }) => {
    await openReportAsGuest(page);
    await expect(page.getByRole('button', { name: 'PDF' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Word' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Excel' })).toHaveCount(0);
    await expect(
      page.getByText(/Экспорт доступен только для сотрудников/i)
    ).toBeVisible();
  });
});
