/**
 * Жизненный цикл объекта теплопотерь — кейс 1 §5.3, §5.4, §5.9, §5.13.
 *
 * Закрывает то, чего не было в e2e: ошибка заполнения формы (§5.3), создание
 * резервуара через форму (§5.3), правка существующего объекта (§5.4), гейт
 * перехода к электрорасчёту (§5.13), удаление с подтверждением (§3.11),
 * сохранение настроек столбцов в рамках сессии (§5.9).
 *
 * Истории: US-HEAT-01, US-HEAT-04, US-HEAT-09 в docs/tnp/cases/heat-user-stories.md.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  createCalculatedPipe,
  fetchProjectObjects,
  loginAsGuest,
} from './helpers/workspace';
import {
  fillInput,
  openFirstNormalGlideRow,
  openPipeForm,
  openTankForm,
  saveSelectedObjectAndWait,
  selectFirstOption,
  selectOption,
} from './helpers/inline-form-dependencies';

/** Чекбоксы строк живут в canvas Glide — кликаем по строковому маркеру. */
const ROW_MARKER_X = 26;
const HEADER_HEIGHT = 38;
const ROW_HEIGHT = 30;

const viewportWidth = Number(process.env.E2E_VIEWPORT_WIDTH);
const viewportHeight = Number(process.env.E2E_VIEWPORT_HEIGHT);
if (Number.isFinite(viewportWidth) && Number.isFinite(viewportHeight)) {
  test.use({ viewport: { width: viewportWidth, height: viewportHeight } });
}

async function markFirstRow(page: Page) {
  const canvas = page.locator('.calc-spreadsheet--normal-glide canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + ROW_MARKER_X, box!.y + HEADER_HEIGHT + ROW_HEIGHT / 2);
}

function formActions(page: Page) {
  return page.getByRole('toolbar', { name: 'Действия блока заполнения' });
}

test.describe('§5.3–5.13 жизненный цикл объекта теплопотерь', () => {
  test('§5.3 ошибка заполнения: объект не создан, поля подсвечены, введённое сохранено', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const failedApiResponses: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        failedApiResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    await loginAsGuest(page);
    await openPipeForm(page);

    const objectName = `E2E неполная труба ${Date.now()}`;
    await page.getByTestId('object-name-input').fill(objectName);
    let objectWriteRequests = 0;
    page.on('request', (request) => {
      if (
        /\/api\/v1\/projects\/[^/]+\/objects(?:\/[^/]+)?$/.test(request.url())
        && ['POST', 'PUT'].includes(request.method())
      ) {
        objectWriteRequests += 1;
      }
    });
    // диаметр/длина/толщина стенки не заполнены — объект создаваться не должен
    await page.locator('#inline-object-save').dispatchEvent('click');

    // §5.3: введённые данные остаются в формах
    await expect(page.getByTestId('object-name-input')).toHaveValue(objectName);
    // §3.11: незаполненные обязательные поля подсвечены как ошибочные
    await expect(
      page.getByTestId('outer-diameter-input')
        .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-form-item ")][1]'),
    ).toHaveClass(/ant-form-item-has-error/);
    await expect(page.getByTestId('outer-diameter-input')).toBeFocused();
    await expect(page.locator('.ant-message-error')).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(objectWriteRequests).toBe(0);
    expect(failedApiResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
    // §5.3: объект не создан
    expect(await fetchProjectObjects(page)).toHaveLength(0);
    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    const saveBox = await formActions(page).getByRole('button', { name: 'Сохранить' }).boundingBox();
    const firstInvalidBox = await page.getByTestId('outer-diameter-input').boundingBox();
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(saveBox?.width).toBeGreaterThan(0);
    expect(saveBox?.height).toBeGreaterThan(0);
    expect(firstInvalidBox?.width).toBeGreaterThan(0);
    expect(firstInvalidBox?.height).toBeGreaterThan(0);
    await page.screenshot({
      path: testInfo.outputPath(`heat-invalid-${page.viewportSize()?.width ?? 'default'}.png`),
      fullPage: true,
    });
  });

  test('§5.3 резервуар создаётся через форму и получает теплопотери', async ({ page }) => {
    await loginAsGuest(page);
    await openTankForm(page);

    const objectName = `E2E резервуар форма ${Date.now()}`;
    await page.getByTestId('object-name-input').fill(objectName);
    await selectOption(page, 'tank-shape-select', 'Цилиндрическая');
    await fillInput(page, 'tank-diameter-input', '2000');
    await fillInput(page, 'tank-height-input', '3000');
    await selectFirstOption(page, 'insulation-material-select');
    await fillInput(page, 'insulation-thickness-input', '80');
    await fillInput(page, 'ambient-temperature-input', '-20');
    await fillInput(page, 'process-temperature-input', '80');
    await fillInput(page, 'wind-speed-input', '3');

    await page.locator('#inline-object-save').dispatchEvent('click');

    await expect.poll(async () => (await fetchProjectObjects(page)).length, { timeout: 20_000 })
      .toBe(1);
    const [created] = await fetchProjectObjects(page);
    expect(created.object_type).toBe('tank');
    expect(created.params.name).toBe(objectName);
    expect(created.is_valid).toBe(true);
    expect(Number(created.results?.total_heat_loss_design)).toBeGreaterThan(0);

    // §5.3: после успеха формы возвращаются в режим добавления
    await expect(page.getByTestId('object-name-input')).toHaveValue('');
    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await expect(typeToolbar.getByRole('button', { name: /Резервуар:\s*1/ })).toBeVisible();
  });

  test('§5.4 клик по строке грузит объект в формы, «Сохранить» пересчитывает теплопотери', async ({ page }) => {
    await loginAsGuest(page);
    const objectName = `E2E правка ${Date.now()}`;
    await createCalculatedPipe(page, objectName, { pipe_length: 50 });
    await page.reload({ waitUntil: 'networkidle' });

    const before = await fetchProjectObjects(page);
    const lossBefore = Number(before[0].results?.total_heat_loss_design);
    expect(lossBefore).toBeGreaterThan(0);

    await openFirstNormalGlideRow(page);

    // §5.4: параметры объекта загружаются в формы
    await expect(page.getByTestId('object-name-input')).toHaveValue(objectName);
    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await expect(typeToolbar.getByText('Режим: изменение')).toBeVisible();
    // §5.4: «Сохранить» становится доступной
    await expect(formActions(page).getByRole('button', { name: 'Сохранить' })).toBeEnabled();

    await fillInput(page, 'pipe-length-input', '80');
    const saved = await saveSelectedObjectAndWait(page);

    // §5.4: правится тот же объект, теплопотери пересчитаны
    expect(saved.is_valid).toBe(true);
    expect(saved.params.pipe_length).toBe(80);
    const after = await fetchProjectObjects(page);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
    expect(Number(after[0].results?.total_heat_loss_design)).toBeGreaterThan(lossBefore);
  });

  test('§5.6 «Добавить» при открытом объекте возвращает формы в режим добавления', async ({ page }) => {
    await loginAsGuest(page);
    const objectName = `E2E основание ${Date.now()}`;
    await createCalculatedPipe(page, objectName);
    await page.reload({ waitUntil: 'networkidle' });

    await openFirstNormalGlideRow(page);
    await expect(page.getByTestId('object-name-input')).toHaveValue(objectName);

    await formActions(page).getByRole('button', { name: 'Добавить' }).click();

    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await expect(typeToolbar.getByText('Режим: добавление')).toBeVisible();
    // формы очищаются: копирование параметров открытого объекта делает
    // «Добавить на основании» в таблице (§5.7), а не эта кнопка
    await expect(page.getByTestId('object-name-input')).toHaveValue('');

    // §5.6: исходный объект остаётся без изменений
    const objects = await fetchProjectObjects(page);
    expect(objects).toHaveLength(1);
    expect(objects[0].params.name).toBe(objectName);
  });

  test('объект с нормативным напряжением 230 В сохраняется из формы', async ({ page }) => {
    await loginAsGuest(page);
    // бэкенд подставляет supply_voltage=230 (DEC-11) — справочник поля обязан
    // предлагать это же значение, иначе «Сохранить» падает на нетронутом поле
    const created = await createCalculatedPipe(page, `E2E напряжение ${Date.now()}`);
    expect(created.params.supply_voltage).toBe(230);
    await page.reload({ waitUntil: 'networkidle' });

    await openFirstNormalGlideRow(page);
    const voltageItem = page.locator('.supply-voltage-form-item');
    await expect(voltageItem).not.toHaveClass(/ant-form-item-has-error/);

    const saved = await saveSelectedObjectAndWait(page);
    expect(saved.is_valid).toBe(true);
    expect(saved.params.supply_voltage).toBe(230);
  });

  test('§5.13 переход к электрорасчёту закрыт без объектов и открывается после расчёта', async ({ page }) => {
    await loginAsGuest(page);
    const continueButton = page.getByTestId('heat-continue-to-electrical');

    // §5.13: пока объектов нет — перейти нельзя
    await expect(continueButton).toBeDisabled();
    await continueButton.hover({ force: true });
    await expect(page.getByRole('tooltip')).toContainText('Добавьте объекты');

    await createCalculatedPipe(page, `E2E гейт ${Date.now()}`);
    await page.reload({ waitUntil: 'networkidle' });

    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expect(page).toHaveURL(/\/workspace\/elec-calc/);
  });

  test('удаление выбранной строки требует подтверждения', async ({ page }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page, `E2E удаление ${Date.now()}`);
    await page.reload({ waitUntil: 'networkidle' });

    const deleteButton = formActions(page).getByRole('button', { name: 'Удалить выбранные' });
    await expect(deleteButton).toBeDisabled();

    await markFirstRow(page);
    await expect(deleteButton).toBeEnabled();
    await deleteButton.click();

    // §3.11: перед удалением объекта запрашивается подтверждение
    await expect(page.getByText('Удалить выбранную строку?')).toBeVisible();
    await page.getByRole('button', { name: 'Отмена' }).click();
    expect(await fetchProjectObjects(page)).toHaveLength(1);

    await deleteButton.click();
    await page.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect.poll(async () => (await fetchProjectObjects(page)).length, { timeout: 20_000 })
      .toBe(0);
  });

  test('§5.9 скрытый столбец остаётся скрытым после перезагрузки', async ({ page }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page, `E2E столбцы ${Date.now()}`);
    await page.reload({ waitUntil: 'networkidle' });

    const tableActions = page.getByRole('toolbar', { name: 'Действия таблицы объектов' });
    await tableActions.getByRole('button', { name: 'Настройки отображения' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // «Наименование» скрыть нельзя — берём первый столбец, у которого чекбокс доступен
    const columnLabel = await dialog
      .locator('input[type="checkbox"]:not([disabled]):checked')
      .first()
      .getAttribute('aria-label');
    expect(columnLabel).toBeTruthy();
    await dialog.getByRole('checkbox', { name: columnLabel! }).uncheck();
    await dialog.getByRole('button', { name: 'Применить' }).click();
    await expect(dialog).toBeHidden();

    await page.reload({ waitUntil: 'networkidle' });
    await tableActions.getByRole('button', { name: 'Настройки отображения' }).click();
    // §5.9: настройки отображения действуют в рамках текущей сессии
    await expect(page.getByRole('dialog').getByRole('checkbox', { name: columnLabel! }))
      .not.toBeChecked();
  });
});
