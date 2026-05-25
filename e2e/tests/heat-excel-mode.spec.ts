import { test, expect, type Locator, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';

async function openExcelCellEditor(row: Locator, cellName: string) {
  await row.getByRole('button', { name: cellName, exact: true }).click();
  await row.page().keyboard.press('Enter');
  const editor = row.locator('.editable-cell-editor input').first();
  await expect(editor).toBeVisible();
  return editor;
}

async function selectSearchOption(page: Page, testId: string, search: string, option: RegExp) {
  await page.getByTestId(testId).click();
  const referenceSearch = page.locator('.reference-picker-modal:visible .reference-picker-search input').last();
  if (await referenceSearch.isVisible().catch(() => false)) {
    await referenceSearch.fill(search);
    const referenceList = page.locator('.reference-picker-modal .reference-picker-list:visible').last();
    const matched = referenceList.getByRole('option').filter({ hasText: option }).first();
    await expect(matched).toBeAttached();
    await matched.click();
    return;
  }

  await page.keyboard.type(search);
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  const matched = dropdown.locator('.ant-select-item-option').filter({ hasText: option }).first();
  await expect(matched).toBeAttached();
  await matched.evaluate((el) => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    (el as HTMLElement).click();
  });
}

test.describe('Excel-режим таблицы теплопотерь', () => {
  test('изменение ячейки не автосохраняется, подсвечивает только ячейку и сохраняется по кнопке', async ({ page }) => {
    await loginAsGuest(page);
    const pipeName = `E2E excel pipe ${Date.now()}`;
    const updateRequests: string[] = [];

    await createCalculatedPipe(page, pipeName);
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes('/objects/')) {
        updateRequests.push(request.url());
      }
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Excel-режим').click();

    const row = page.getByRole('row').filter({ hasText: pipeName }).first();
    await expect(row).toBeVisible();
    await expect(row.locator('.editable-cell-display').filter({ hasText: /^—$/ })).toHaveCount(0);
    const editor = await openExcelCellEditor(row, '150');
    await editor.fill('160');
    await editor.press('Enter');

    await expect(page.getByText('Несохранено: 1')).toBeVisible();
    await expect(row).toHaveClass(/row-excel-dirty/);
    await expect(row).not.toHaveClass(/row-dirty/);
    await expect(row.locator('.editable-cell-display.dirty', { hasText: '160' })).toBeVisible();
    expect(updateRequests).toHaveLength(0);

    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();

    await expect.poll(() => updateRequests.length).toBe(1);
    await expect(page.getByText('Несохранено: 1')).toHaveCount(0);
  });

  test('ошибка сохранения показывает конкретное поле, а не общий текст', async ({ page }) => {
    await loginAsGuest(page);
    const pipeName = `E2E excel error ${Date.now()}`;

    await createCalculatedPipe(page, pipeName);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Excel-режим').click();

    const row = page.getByRole('row').filter({ hasText: pipeName }).first();
    await expect(row).toBeVisible();
    const editor = await openExcelCellEditor(row, '150');
    await editor.fill('-40');
    await editor.press('Enter');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();

    await expect(page.getByLabel('Ошибки в Excel-таблице')).toHaveCount(0);
    await expect(page.getByLabel('Ошибки выбранной строки'))
      .toContainText('Температура поддержания: Требуемая температура объекта должна быть выше температуры среды');
    await expect(page.getByTestId('process-temperature-input').locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-form-item ")][1]'))
      .toHaveClass(/ant-form-item-has-error/);
    await expect(page.getByText('Исправьте ошибки в строке перед сохранением')).toHaveCount(0);
  });

  test('прочерки из таблицы в числовых ячейках вставляются как пустые значения', async ({ page }) => {
    await loginAsGuest(page);
    const pipeName = `E2E excel dash ${Date.now()}`;

    await createCalculatedPipe(page, pipeName);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Excel-режим').click();

    const bodyRows = page.locator('.ant-table-tbody tr.ant-table-row');
    await expect(bodyRows.nth(1)).toBeVisible();
    await bodyRows.nth(1).locator('.editable-cell-display').first().click();

    await page.evaluate((text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      document.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }));
    }, `E2E dash row ${Date.now()}\t108\t10.5\t—`);

    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();

    await expect(page.getByText('Введите число')).toHaveCount(0);
  });

  test('ошибки числовых Excel-ячеек показывают название поля', async ({ page }) => {
    await loginAsGuest(page);
    const pipeName = `E2E excel numeric label ${Date.now()}`;

    await createCalculatedPipe(page, pipeName);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Excel-режим').click();

    const row = page.getByRole('row').filter({ hasText: pipeName }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: '50,0', exact: true }).first().click();

    await page.evaluate((text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      document.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }));
    }, 'abc');

    await expect(page.getByLabel('Ошибки в Excel-таблице')).toHaveCount(0);
    await expect(page.getByLabel('Ошибки выбранной строки')).toContainText(/(Длина|L).*Введите число/);
  });

  test('Excel-ячейки и панель параметров используют один черновик строки', async ({ page }) => {
    await loginAsGuest(page);
    const pipeName = `E2E excel sync ${Date.now()}`;

    await createCalculatedPipe(page, pipeName);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Excel-режим').click();

    const row = page.getByRole('row').filter({ hasText: pipeName }).first();
    await expect(row).toBeVisible();

    const diameterEditor = await openExcelCellEditor(row, '108');
    await diameterEditor.fill('114');
    await diameterEditor.press('Enter');

    await expect(page.getByTestId('outer-diameter-input')).toHaveValue('114');

    await page.getByTestId('pipe-length-input').fill('66');
    await expect(row.locator('.editable-cell-display.dirty', { hasText: '66' })).toBeVisible();
    await expect(page.getByText('Несохранено: 1')).toBeVisible();
  });

  test('дозаполнение через форму не создаёт Excel-ошибки по служебным climate/source полям', async ({ page }) => {
    await loginAsGuest(page);
    const pipeName = `E2E excel form climate ${Date.now()}`;

    await createCalculatedPipe(page, pipeName);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Excel-режим').click();

    const row = page.getByRole('row').filter({ hasText: pipeName }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button').first().click();
    await expect(page.getByTestId('object-name-input')).toHaveValue(pipeName);

    await selectSearchOption(page, 'climate-select', 'Тогул', /Тогул/);

    await expect(page.getByTestId('ambient-temperature-input')).not.toHaveValue('');
    await expect(page.getByText('Несохранено: 1')).toBeVisible();
    await expect(page.getByLabel('Ошибки в Excel-таблице')).toHaveCount(0);
    await expect(page.getByText('climate_city')).toHaveCount(0);
    await expect(page.getByText('climate_region')).toHaveCount(0);
    await expect(page.getByText('ambient_temperature_source')).toHaveCount(0);
  });

  test('новая Excel-строка сохраняется с теми же дефолтами, что и форма', async ({ page }) => {
    await loginAsGuest(page);
    const pipeName = `E2E excel defaults ${Date.now()}`;

    await createCalculatedPipe(page, `seed ${Date.now()}`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Excel-режим').click();

    const bodyRows = page.locator('.ant-table-tbody tr.ant-table-row');
    await expect(bodyRows.last()).toBeVisible();
    await bodyRows.last().locator('.editable-cell-display').first().click();

    await page.evaluate((text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      document.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }));
    }, `${pipeName}\t108\t10\t50\t80\t-30\t4\t-20\t220\t1.1\t`);

    const newRow = page.getByRole('row').filter({ hasText: pipeName }).first();
    await expect(newRow).toBeVisible();
    await newRow.locator('.editable-cell-display').first().click();
    await selectSearchOption(page, 'insulation-material-select', 'Песок', /Песок перлитовый/);

    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByText('Несохранено: 1')).toHaveCount(0);

    await expect(page.getByText('Материал трубы или λ трубы')).toHaveCount(0);
    await expect(page.getByText('Размещение объекта')).toHaveCount(0);
    await expect(page.getByText('Режим температуры изоляции')).toHaveCount(0);

    const { projectId, sessionId } = await currentGuestContext(page);
    const response = await page.request.get(`${API_BASE}/api/v1/projects/${projectId}/objects`, {
      headers: { 'X-Session-Id': sessionId },
    });
    expect(response.status()).toBe(200);
    const objects = await response.json();
    const savedObject = objects.find((object: { params?: Record<string, unknown> }) =>
      object.params?.name === pipeName,
    );

    expect(savedObject?.params).toMatchObject({
      pipe_material: 'carbon_steel',
      placement: 'outdoor',
      insulation_temperature_basis: 'outdoor_winter',
      insulation_layer_count: '1',
      insulation_cover_material: 'none',
      environment: 'normal',
      zone_classification: 'safe',
      temperature_group: 'T1',
      supply_voltage: 220,
      steam_tracing: 'no',
    });
  });

  test('контекстное меню Excel-режима очищает ячейки и добавляет строки ниже выделения', async ({ page }) => {
    await loginAsGuest(page);
    const pipeName = `E2E excel menu ${Date.now()}`;

    await createCalculatedPipe(page, pipeName);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Excel-режим').click();

    const bodyRows = page.locator('.ant-table-tbody tr.ant-table-row');
    const initialRowCount = await bodyRows.count();
    const row = page.getByRole('row').filter({ hasText: pipeName }).first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: '108', exact: true }).click({ button: 'right' });
    await expect(page.getByRole('menu', { name: 'Действия Excel-режима' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Очистить содержимое' }).click();
    await expect(page.getByText('Несохранено: 1')).toBeVisible();
    await expect(row.locator('.editable-cell-display.dirty').first()).toBeVisible();

    await row.getByRole('button', { name: pipeName, exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Добавить строку ниже' }).click();
    await expect(bodyRows).toHaveCount(initialRowCount + 1);
  });

  test('контекстное меню Excel-режима вставляет данные из буфера', async ({ page }) => {
    await loginAsGuest(page);
    const pipeName = `E2E excel menu paste ${Date.now()}`;
    const seedName = `seed menu paste ${Date.now()}`;

    await createCalculatedPipe(page, seedName);
    await page.reload({ waitUntil: 'networkidle' });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByText('Excel-режим').click();

    await page.evaluate((text) => navigator.clipboard.writeText(text),
      `${pipeName}\t108\t10\t50\t80\t-30\t4\t-20\t220\t1.1\t`);

    const seedRow = page.getByRole('row').filter({ hasText: seedName }).first();
    await expect(seedRow).toBeVisible();
    await seedRow.getByRole('button', { name: seedName, exact: true }).click({ button: 'right' });
    await expect(page.getByRole('menu', { name: 'Действия Excel-режима' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Вставить' }).click();

    await expect(page.getByRole('row').filter({ hasText: pipeName }).first()).toBeVisible();
    await expect(page.getByText('Несохранено: 1')).toBeVisible();
  });
});
