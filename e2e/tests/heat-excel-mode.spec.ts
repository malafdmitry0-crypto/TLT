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

const EXCEL_GLIDE_METRICS_BY_FONT_SIZE = {
  compact: { headerHeight: 34, rowHeight: 26 },
  standard: { headerHeight: 38, rowHeight: 30 },
  comfortable: { headerHeight: 42, rowHeight: 34 },
  large: { headerHeight: 45, rowHeight: 37 },
} as const;

type ExcelGlideMetrics = typeof EXCEL_GLIDE_METRICS_BY_FONT_SIZE[keyof typeof EXCEL_GLIDE_METRICS_BY_FONT_SIZE];

async function excelGlideMetrics(page: Page): Promise<ExcelGlideMetrics> {
  const className = await page
    .locator('.calc-spreadsheet--excel-mode.calc-spreadsheet--glide')
    .first()
    .getAttribute('class');
  const fontSizeKey = Object.keys(EXCEL_GLIDE_METRICS_BY_FONT_SIZE).find((key) => (
    className?.includes(`calc-spreadsheet--${key}`)
  )) as keyof typeof EXCEL_GLIDE_METRICS_BY_FONT_SIZE | undefined;
  return EXCEL_GLIDE_METRICS_BY_FONT_SIZE[fontSizeKey ?? 'standard'];
}

async function dragExcelGlideRowMarkers(page: Page, fromRowIndex: number, toRowIndex: number) {
  const canvas = page.locator('.calc-spreadsheet--excel-mode.calc-spreadsheet--glide canvas').first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const { headerHeight, rowHeight } = await excelGlideMetrics(page);
  await page.mouse.move(box!.x + 25, box!.y + headerHeight + rowHeight * fromRowIndex + rowHeight / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 25, box!.y + headerHeight + rowHeight * toRowIndex + rowHeight - 2, { steps: 12 });
  await page.mouse.up();
  return { canvas, metrics: { headerHeight, rowHeight } };
}

async function selectedRowBlueScores(canvas: Locator, rowIndex: number, metrics: ExcelGlideMetrics) {
  return canvas.evaluate((node, { targetRowIndex, headerHeight, rowHeight }) => {
    const canvasNode = node as HTMLCanvasElement;
    const context = canvasNode.getContext('2d');
    if (!context) return [];
    const rect = canvasNode.getBoundingClientRect();
    const scaleX = canvasNode.width / rect.width;
    const scaleY = canvasNode.height / rect.height;
    const y = Math.round((headerHeight + rowHeight * targetRowIndex + rowHeight / 2) * scaleY);
    const sampleXs = [0.42, 0.58, 0.74, 0.9].map((ratio) => Math.round(rect.width * ratio * scaleX));
    return sampleXs.map((x) => {
      const size = Math.max(3, Math.round(5 * Math.max(scaleX, scaleY)));
      const left = Math.max(0, x - size);
      const top = Math.max(0, y - size);
      const width = Math.min(canvasNode.width - left, size * 2 + 1);
      const height = Math.min(canvasNode.height - top, size * 2 + 1);
      const data = context.getImageData(left, top, width, height).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      const count = data.length / 4;
      for (let index = 0; index < data.length; index += 4) {
        red += data[index];
        green += data[index + 1];
        blue += data[index + 2];
      }
      red /= count;
      green /= count;
      blue /= count;
      return Math.min(blue - red, green - red);
    });
  }, {
    targetRowIndex: rowIndex,
    headerHeight: metrics.headerHeight,
    rowHeight: metrics.rowHeight,
  });
}

test.describe('Excel-режим таблицы теплопотерь', () => {
  test('выбор через номера строк в Glide Excel выделяет строки полностью и фокусирует форму', async ({ page }) => {
    await loginAsGuest(page);
    const firstName = `E2E excel row marker ${Date.now()}`;
    await createCalculatedPipe(page, firstName);
    await createCalculatedPipe(page, `E2E excel row marker seed ${Date.now()}`);

    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('Excel-режим').click();

    const { canvas, metrics } = await dragExcelGlideRowMarkers(page, 0, 1);
    await expect(page.getByTestId('object-name-input')).toHaveValue(firstName);
    for (const rowIndex of [0, 1]) {
      await expect.poll(async () => {
        const scores = await selectedRowBlueScores(canvas, rowIndex, metrics);
        return scores.length > 0 && scores.every((score) => score > 10);
      }).toBe(true);
    }
    await expect.poll(async () => {
      const scores = await selectedRowBlueScores(canvas, 3, metrics);
      return scores.length > 0 && scores.every((score) => score > 10);
    }).toBe(false);
  });

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
