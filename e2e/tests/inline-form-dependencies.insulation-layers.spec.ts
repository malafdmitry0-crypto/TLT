import { test, expect } from '@playwright/test';

import {
  loginAsGuest,
} from './helpers/workspace';
import {
  createInvalidDeclaredThreeLayerPipe,
  createUndergroundPipeWithIndoorTm,
  fetchProjectObjects,
  fillInput,
  openAntSelectDropdown,
  openFirstNormalGlideRow,
  openPipeForm,
  saveSelectedObjectAndWait,
  selectOption,
} from './helpers/inline-form-dependencies';

test.describe('inline form dependencies — insulation tm / layers', () => {
  test('режим tm изоляции показывает только варианты для размещения', async ({ page }) => {
    await loginAsGuest(page);
    await openPipeForm(page);

    let dropdown = await openAntSelectDropdown(page, 'insulation-temperature-basis-select');
    await expect(dropdown.getByText('Открытый воздух, лето', { exact: true })).toBeVisible();
    await expect(dropdown.getByText('Открытый воздух, зима', { exact: true })).toBeVisible();
    await expect(dropdown.getByText('Чердак', { exact: true })).toHaveCount(0);
    await expect(dropdown.getByText('Канал', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await selectOption(page, 'placement-select', 'Подземно');
    await expect(page.getByTestId('insulation-temperature-basis-select')).toHaveText('Канал');
    dropdown = await openAntSelectDropdown(page, 'insulation-temperature-basis-select');
    await expect(dropdown.getByText('Канал', { exact: true })).toBeVisible();
    await expect(dropdown.getByText('Тоннель', { exact: true })).toBeVisible();
    await expect(dropdown.getByText('Техническое подполье', { exact: true })).toBeVisible();
    await expect(dropdown.getByText('Чердак', { exact: true })).toHaveCount(0);
    await expect(dropdown.getByText('Открытый воздух, зима', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await selectOption(page, 'placement-select', 'В помещении');
    await expect(page.getByTestId('insulation-temperature-basis-select')).toHaveText('Помещение');
    dropdown = await openAntSelectDropdown(page, 'insulation-temperature-basis-select');
    await expect(dropdown.getByText('Помещение', { exact: true })).toBeVisible();
    await expect(dropdown.getByText('Чердак', { exact: true })).toBeVisible();
    await expect(dropdown.getByText('Подвал', { exact: true })).toBeVisible();
    await expect(dropdown.getByText('Канал', { exact: true })).toHaveCount(0);
    await expect(dropdown.getByText('Открытый воздух, зима', { exact: true })).toHaveCount(0);
  });

  test('уменьшение количества слоёв очищает ошибки и payload скрытых слоёв', async ({ page }) => {
    await loginAsGuest(page);
    const objectName = `E2E stale layers ${Date.now()}`;
    await createInvalidDeclaredThreeLayerPipe(page, objectName);
    await page.reload({ waitUntil: 'networkidle' });

    await page.getByRole('row').filter({ hasText: objectName }).first().click();
    await expect(page.getByLabel('Ошибки выбранной строки')).toContainText('2-го слоя');

    await selectOption(page, 'insulation-layer-count-select', '1 слой');
    await expect(page.getByLabel('Ошибки выбранной строки')).toHaveCount(0);
    await expect(page.getByTestId('second-insulation-material-select')).toHaveCount(0);
    await expect(page.getByTestId('third-insulation-material-select')).toHaveCount(0);

    const saved = await saveSelectedObjectAndWait(page);
    await expect(page.getByLabel('Ошибки выбранной строки')).toHaveCount(0);

    expect(saved.is_valid).toBe(true);
    expect(saved.validation_errors ?? null).toBeNull();
    expect(saved.params.insulation_layer_count).toBe('1');
    const objects = await fetchProjectObjects(page);
    const updated = objects.find((obj) => obj.params.name === objectName);
    expect(updated).toBeTruthy();
    expect(updated!.is_valid).toBe(true);
    expect(updated!.validation_errors ?? null).toBeNull();
    expect(updated!.params.insulation_layer_count).toBe('1');
    expect(updated!.params.insulation_layers).toEqual([
      expect.objectContaining({ thickness: 0.02, material: 'mineral_wool_boards_120' }),
    ]);
  });

  test('ошибка режима tm выбранной строки подсвечивает select в форме', async ({ page }) => {
    await loginAsGuest(page);
    const objectName = `E2E indoor tm underground ${Date.now()}`;
    await createUndergroundPipeWithIndoorTm(page, objectName);
    await page.reload({ waitUntil: 'networkidle' });

    await page.getByRole('row').filter({ hasText: objectName }).first().click();
    await fillInput(page, 'pipe-length-input', '6.5');

    await expect(page.getByLabel('Ошибки выбранной строки')).toContainText(
      'Режим температуры изоляции',
    );
    await expect(page.getByLabel('Ошибки выбранной строки')).toContainText(
      'Режим tm изоляции не соответствует размещению объекта',
    );
    await expect(page.getByTestId('insulation-temperature-basis-select').locator(
      'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-form-item ")][1]',
    )).toHaveClass(/ant-form-item-has-error/);
  });

});
