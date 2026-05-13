import { test, expect } from '@playwright/test';

import { createCalculatedPipe, loginAsGuest } from './helpers/workspace';

test.describe('4.3 Расчёт тепловых потерь', () => {
  test('пустой проект показывает рабочий экран теплопотерь и блокирует электрорасчёт', async ({
    page,
  }) => {
    await loginAsGuest(page);

    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    const formActionsToolbar = page.getByRole('toolbar', { name: 'Действия блока заполнения' });
    const tableActionsToolbar = page.getByRole('toolbar', { name: 'Действия таблицы объектов' });
    const paramsBlock = page.locator('.inline-form-shell[aria-label="Блок заполнения параметров"]');
    const visibilityToggle = typeToolbar.getByRole('checkbox', { name: 'Показать блок заполнения параметров' });
    await expect(typeToolbar).toBeVisible();
    await expect(typeToolbar.getByRole('button', { name: /Трубопровод:/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(typeToolbar.getByRole('button', { name: /Резервуар:/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(typeToolbar.getByRole('button', { name: /Все:/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(typeToolbar.getByText('Режим: добавление')).toBeVisible();
    await expect(visibilityToggle).toBeChecked();
    await expect(paramsBlock).toBeVisible();
    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(page.getByText('ГЕОМЕТРИЯ ТРУБЫ')).toBeVisible();
    await expect(formActionsToolbar).toBeVisible();
    await expect(tableActionsToolbar).toBeVisible();
    await expect(formActionsToolbar.getByRole('button', { name: 'Добавить' })).toBeVisible();
    await expect(formActionsToolbar.getByRole('button', { name: 'Сохранить' })).toBeVisible();
    await expect(formActionsToolbar.getByRole('button', { name: 'Сбросить' })).toBeVisible();
    await expect(tableActionsToolbar.getByRole('button', { name: 'Настройки отображения' })).toBeVisible();
    await expect(tableActionsToolbar.getByRole('button', { name: 'Добавить копии выбранных' })).toBeDisabled();
    await expect(tableActionsToolbar.getByRole('button', { name: 'Удалить выбранные' })).toBeDisabled();
    await expect(tableActionsToolbar.getByRole('button', { name: 'Импорт XLSX/CSV' })).toBeVisible();
    await expect(tableActionsToolbar.getByRole('button', { name: 'Трубопровод' })).toHaveCount(0);
    await expect(tableActionsToolbar.getByRole('button', { name: 'Резервуар' })).toHaveCount(0);
    await expect(tableActionsToolbar.getByRole('checkbox', { name: 'Показать блок заполнения параметров' })).toHaveCount(0);
    await expect(tableActionsToolbar.getByText(/Все рассчитаны/)).toHaveCount(0);
    const toolbarsOrdered = await page.evaluate(() => {
      const top = document.querySelector('[aria-label="Тип объекта и блок параметров"]');
      const params = document.querySelector('[aria-label="Блок заполнения параметров"]');
      const formActions = document.querySelector('[aria-label="Действия блока заполнения"]');
      const tableActions = document.querySelector('[aria-label="Действия таблицы объектов"]');
      return Boolean(
        top &&
          params &&
          formActions &&
          tableActions &&
          formActions.parentElement === tableActions.parentElement &&
          formActions.parentElement?.classList.contains('actionbar-actions-row') &&
          top.compareDocumentPosition(params) & Node.DOCUMENT_POSITION_FOLLOWING &&
          params.compareDocumentPosition(formActions) & Node.DOCUMENT_POSITION_FOLLOWING &&
          formActions.compareDocumentPosition(tableActions) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(toolbarsOrdered).toBe(true);

    await visibilityToggle.uncheck();
    await expect(paramsBlock).toBeHidden();
    await expect(formActionsToolbar).toHaveCount(0);
    await expect(typeToolbar.getByText(/Режим:/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toHaveCount(0);
    await expect(typeToolbar.getByText(/Режим:/)).toHaveCount(0);
    await expect(paramsBlock).toBeHidden();
    await visibilityToggle.check();
    await expect(paramsBlock).toBeVisible();
    await expect(formActionsToolbar).toBeVisible();
    await expect(typeToolbar.getByText('Режим: добавление')).toBeVisible();
    await expect(page.getByTestId('object-name-input')).toHaveValue('');
    await expect(formActionsToolbar.getByRole('button', { name: 'Добавить' })).toBeVisible();
    await expect(page.getByText(/Трубопроводы не добавлены/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Электрорасчёт/i })).toBeDisabled();
  });

  test('кнопка «Добавить» открывает inline-форму активного типа', async ({
    page,
  }) => {
    await loginAsGuest(page);

    await expect(page.locator('.inline-object-form')).toBeVisible();
    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await expect(typeToolbar.getByRole('button', { name: /Трубопровод:/ })).toBeVisible();
    await expect(typeToolbar.getByRole('button', { name: /Резервуар:/ })).toBeVisible();
    await expect(typeToolbar.getByRole('button', { name: /Все:/ })).toBeVisible();

    await page.getByRole('toolbar', { name: 'Действия блока заполнения' }).getByRole('button', { name: 'Добавить' }).click();
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

    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await expect(typeToolbar.getByRole('button', { name: /Трубопровод:\s*1/ })).toBeVisible();
    await expect(typeToolbar.getByRole('button', { name: /Все:\s*1/ })).toBeVisible();
    await expect(page.getByText(/Все рассчитаны/)).toHaveCount(0);
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
