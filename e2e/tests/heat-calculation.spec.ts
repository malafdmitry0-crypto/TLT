import { test, expect } from '@playwright/test';

import { createCalculatedPipe, loginAsGuest } from './helpers/workspace';

test.describe('4.3 Расчёт тепловых потерь', () => {
  test('пустой проект показывает рабочий экран теплопотерь и блокирует электрорасчёт', async ({
    page,
  }) => {
    await loginAsGuest(page);

    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    const actionsToolbar = page.getByRole('toolbar', { name: 'Действия с объектами' });
    const paramsBlock = page.locator('.inline-form-shell[aria-label="Блок заполнения параметров"]');
    const visibilityToggle = typeToolbar.getByRole('checkbox', { name: 'Показать блок заполнения параметров' });
    await expect(typeToolbar).toBeVisible();
    await expect(typeToolbar.getByRole('button', { name: 'Трубопровод' })).toHaveAttribute('aria-pressed', 'true');
    await expect(typeToolbar.getByRole('button', { name: 'Резервуар' })).toHaveAttribute('aria-pressed', 'false');
    await expect(typeToolbar.getByText('Режим: добавление')).toBeVisible();
    await expect(visibilityToggle).toBeChecked();
    await expect(paramsBlock).toBeVisible();
    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(page.getByText('ГЕОМЕТРИЯ ТРУБЫ')).toBeVisible();
    await expect(actionsToolbar).toBeVisible();
    await expect(actionsToolbar.getByRole('button', { name: 'Трубопровод' })).toHaveCount(0);
    await expect(actionsToolbar.getByRole('button', { name: 'Резервуар' })).toHaveCount(0);
    await expect(actionsToolbar.getByRole('checkbox', { name: 'Показать блок заполнения параметров' })).toHaveCount(0);
    const toolbarsOrdered = await page.evaluate(() => {
      const top = document.querySelector('[aria-label="Тип объекта и блок параметров"]');
      const params = document.querySelector('[aria-label="Блок заполнения параметров"]');
      const actions = document.querySelector('[aria-label="Действия с объектами"]');
      return Boolean(
        top &&
          params &&
          actions &&
          top.compareDocumentPosition(params) & Node.DOCUMENT_POSITION_FOLLOWING &&
          params.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(toolbarsOrdered).toBe(true);

    await visibilityToggle.uncheck();
    await expect(paramsBlock).toBeHidden();
    await expect(typeToolbar.getByText(/Режим:/)).toHaveCount(0);
    await page.getByRole('button', { name: /Добавить/ }).click();
    await expect(typeToolbar.getByText(/Режим:/)).toHaveCount(0);
    await expect(paramsBlock).toBeHidden();
    await visibilityToggle.check();
    await expect(paramsBlock).toBeVisible();
    await expect(typeToolbar.getByText('Режим: добавление')).toBeVisible();
    await expect(page.getByTestId('object-name-input')).toHaveValue('');
    await expect(page.getByRole('button', { name: /Добавить/ })).toBeVisible();
    await expect(page.getByText(/Трубопроводы не добавлены/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Электрорасчёт/i })).toBeDisabled();
  });

  test('кнопка «Добавить» открывает inline-форму активного типа', async ({
    page,
  }) => {
    await loginAsGuest(page);

    await expect(page.locator('.inline-object-form')).toBeVisible();
    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await expect(typeToolbar.getByRole('button', { name: 'Трубопровод' })).toBeVisible();
    await expect(typeToolbar.getByRole('button', { name: 'Резервуар' })).toBeVisible();

    await page.getByRole('button', { name: /Добавить/ }).click();
    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(typeToolbar.getByText('Режим: добавление')).toBeVisible();
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
    await expect(page.getByText(/СО1 · Саморегулирующийся · .*рассчитано: 1\/1/i)).toBeVisible();
    await expect(page.getByText(pipeName)).toBeVisible();
    await expect(page.getByText('рассчитан', { exact: true })).toBeVisible();
    await expect(page.getByText(/ТЛТ-100/)).toBeVisible();
  });
});
