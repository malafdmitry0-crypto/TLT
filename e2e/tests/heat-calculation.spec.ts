import { test, expect } from '@playwright/test';

import { createCalculatedPipe, loginAsGuest } from './helpers/workspace';

test.describe('4.3 Расчёт тепловых потерь', () => {
  test('пустой проект показывает рабочий экран теплопотерь и блокирует электрорасчёт', async ({
    page,
  }) => {
    await loginAsGuest(page);

    await expect(page.getByText('Параметры объекта')).toBeVisible();
    await expect(page.getByRole('button', { name: /Добавить/ })).toBeVisible();
    await expect(page.getByText(/Трубопроводы не добавлены/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Электрорасчёт/i })).toBeDisabled();
  });

  test('кнопка «Добавить» открывает inline-форму активного типа', async ({
    page,
  }) => {
    await loginAsGuest(page);

    await expect(page.locator('.inline-object-form')).toHaveCount(0);
    const typeSwitch = page.locator('.actionbar-context-group');
    await expect(typeSwitch.getByLabel('Трубопровод', { exact: true })).toBeVisible();
    await expect(typeSwitch.getByLabel('Резервуары', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Добавить/ }).click();
    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(page.getByText('ГЕОМЕТРИЯ ТРУБЫ')).toBeVisible();
    await expect(page.getByLabel(/Наружный Ø/i)).toBeVisible();
    await expect(page.locator('#inline-object-save')).toBeAttached();
  });

  test('рассчитанный трубопровод отображается в исходных данных', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipeName = `E2E heat pipe ${Date.now()}`;
    await createCalculatedPipe(page, pipeName);

    await page.reload({ waitUntil: 'networkidle' });

    await expect(page.getByText('Все рассчитаны ✓')).toBeVisible();
    await expect(page.getByText(pipeName)).toBeVisible();
    await expect(page.getByText('108')).toBeVisible();
    await expect(page.getByText('50,0')).toBeVisible();
    await expect(page.getByText('Минеральная вата')).toBeVisible();

    await expect(page.getByRole('button', { name: /Электрорасчёт/i })).toBeEnabled();
  });

  test('со страницы теплопотерь запускается электрорасчёт выбранного СО', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipeName = `E2E heat-to-elec ${Date.now()}`;
    await createCalculatedPipe(page, pipeName);

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Электрорасчёт/i }).click();

    await expect(page).toHaveURL(/\/workspace\/elec-calc/);
    await expect(page.getByText(/Электрорасчёт выполнен для 1 объектов/i)).toBeVisible();
    await expect(page.getByText('рассчитан', { exact: true })).toBeVisible();
    await expect(page.getByText(/ТЛТ-100/)).toBeVisible();
    await expect(page.getByText('55,0')).toBeVisible();
    await expect(page.getByText('5,50 кВт')).toBeVisible();
    await expect(page.getByText('25,00')).toBeVisible();
  });
});
