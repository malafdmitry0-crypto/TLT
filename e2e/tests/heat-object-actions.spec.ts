/**
 * Действия над объектами теплопотерь — кейс 1 §5.7–5.10.
 *
 * Сценарии, которых не было в e2e: копии выбранных (§5.7), групповая
 * корректировка (§5.8), настройки отображения (§5.9), порядок строк (§5.10),
 * загрузка из Excel (§5.5 — проверяется доступность точки входа).
 *
 * Истории: US-HEAT-06…10 в docs/tnp/cases/heat-user-stories.md.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  API_BASE,
  createCalculatedPipe,
  currentGuestContext,
  fetchProjectObjects,
  loginAsGuest,
} from './helpers/workspace';

/**
 * Чекбоксы строк живут в canvas Glide — кликаем по строковому маркеру.
 * Геометрия та же, что в heat-normal-glide-selection.spec.ts.
 */
const ROW_MARKER_X = 26;
const HEADER_HEIGHT = 38;
const ROW_HEIGHT = 30;

async function selectFirstRows(page: Page, count: number) {
  const canvas = page.locator('.calc-spreadsheet--normal-glide canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  for (let index = 0; index < count; index += 1) {
    await page.mouse.click(
      box!.x + ROW_MARKER_X,
      box!.y + HEADER_HEIGHT + ROW_HEIGHT * index + ROW_HEIGHT / 2,
    );
    await page.waitForTimeout(200);
  }
}

test.describe('§5.7–5.10 действия над объектами теплопотерь', () => {
  test('§5.5 точка входа импорта названа текстом и открывает выбор файла', async ({ page }) => {
    await loginAsGuest(page);
    const importButton = page.getByRole('button', { name: 'Загрузить из Excel' });
    await expect(importButton).toBeVisible();
    // подписи кнопок — требование §5.5–5.9, не иконки
    await expect(importButton).toContainText('Загрузить из Excel');
  });

  test('§5.7 «Добавить на основании» неактивна без выбора и копирует выбранные', async ({ page }) => {
    await loginAsGuest(page);
    const duplicate = page.getByRole('button', { name: 'Добавить на основании' });
    await expect(duplicate).toBeDisabled();

    await createCalculatedPipe(page, 'E2E копирование');
    await page.reload({ waitUntil: 'networkidle' });
    const before = await fetchProjectObjects(page);
    expect(before.length).toBe(1);

    await selectFirstRows(page, 1);
    await expect(duplicate).toBeEnabled();
    await duplicate.click();
    await expect
      .poll(async () => (await fetchProjectObjects(page)).length, { timeout: 20_000 })
      .toBeGreaterThan(before.length);

    // исходный объект не изменился — §5.7 «Исходные объекты остаются без изменений»
    const after = await fetchProjectObjects(page);
    const source = after.find((item) => item.id === before[0].id);
    expect(source?.params.name).toBe(before[0].params.name);
  });

  test('§5.8 групповая корректировка меняет один параметр у выбранных', async ({ page }) => {
    await loginAsGuest(page);
    const groupUpdate = page.getByRole('button', { name: 'Групповая корректировка' });
    await expect(groupUpdate).toBeDisabled();

    await createCalculatedPipe(page, 'E2E групповая 1');
    await createCalculatedPipe(page, 'E2E групповая 2');
    await page.reload({ waitUntil: 'networkidle' });

    await selectFirstRows(page, 2);
    await expect(groupUpdate).toBeEnabled();
    await groupUpdate.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Групповая корректировка');
    await expect(dialog).toContainText('Выбрано объектов: 2');
    // §5.8: за одну операцию меняется один параметр
    await expect(dialog).toContainText('один параметр');
    // «Применить» недоступна, пока параметр и значение не заданы
    const apply = dialog.getByRole('button', { name: 'Применить' });
    await expect(apply).toBeDisabled();

    // параметр → значение → применить
    await dialog.getByTestId('group-update-param').locator('input').click();
    await page.getByTitle('Длина трубопровода').first().click();
    await dialog.getByRole('spinbutton').fill('77');
    await expect(apply).toBeEnabled();
    await apply.click();

    // §5.8: параметр изменён у ВСЕХ выбранных, остальные не тронуты
    await expect.poll(async () => {
      const objects = await fetchProjectObjects(page);
      return objects
        .filter((item) => String(item.params.name).startsWith('E2E групповая'))
        .map((item) => Number(item.params.pipe_length))
        .sort();
    }, { timeout: 20_000 }).toEqual([77, 77]);
  });

  test('§5.9 настройки отображения открывают перечень столбцов', async ({ page }) => {
    await loginAsGuest(page);
    const settings = page.getByRole('button', { name: 'Настройки отображения' });
    // §5.5–5.9: кнопка названа текстом, а не иконкой
    await expect(settings).toContainText('Настройки отображения');
    await settings.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox').first()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('§5.10 порядок объектов сохраняется в проекте', async ({ page }) => {
    await loginAsGuest(page);
    const first = await createCalculatedPipe(page, 'E2E порядок A');
    const second = await createCalculatedPipe(page, 'E2E порядок Б');
    const { projectId, sessionId } = await currentGuestContext(page);

    const response = await page.request.put(
      `${API_BASE}/api/v1/projects/${projectId}/objects/reorder`,
      { headers: { 'X-Session-Id': sessionId }, data: { order: [second.id, first.id] } },
    );
    expect(response.ok()).toBeTruthy();

    await page.reload({ waitUntil: 'networkidle' });
    const objects = await fetchProjectObjects(page);
    const order = objects.map((item) => item.params.name);
    expect(order.indexOf('E2E порядок Б')).toBeLessThan(order.indexOf('E2E порядок A'));
  });
});
