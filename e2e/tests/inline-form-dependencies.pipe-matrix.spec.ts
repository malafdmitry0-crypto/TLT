import { test, expect } from '@playwright/test';

import {
  loginAsGuest,
} from './helpers/workspace';
import {
  fetchProjectObjects,
  fillInput,
  fillTemperatureRange,
  inputValue,
  openFirstNormalGlideRow,
  openPipeForm,
  selectFirstOption,
  selectOption,
  selectSearchOption,
} from './helpers/inline-form-dependencies';

test.describe('inline form dependencies — pipe placement / lambda matrix', () => {
  test('матрица размещения трубы переключает ветер и грунт, а α не редактируется', async ({ page }) => {
    await loginAsGuest(page);
    await openPipeForm(page);

    await expect(page.getByTestId('wind-speed-input')).toHaveCount(0);
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);
    await selectOption(page, 'placement-select', 'На открытом воздухе');
    await expect(page.getByTestId('wind-speed-input')).toBeVisible();
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);
    await expect(page.getByTestId('burial-depth-input')).toHaveCount(0);
    await expect(page.getByTestId('ground-type-select')).toHaveCount(0);

    await selectOption(page, 'placement-select', 'В помещении');
    await expect(page.getByTestId('wind-speed-input')).toHaveCount(0);
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);
    await expect(page.getByTestId('ground-conductivity-input')).toHaveCount(0);

    await selectOption(page, 'placement-select', 'Подземно');
    await expect(page.getByTestId('burial-depth-input')).toBeVisible();
    await expect(page.getByTestId('ground-type-select')).toBeVisible();
    await expect(page.getByTestId('ground-conductivity-input')).toBeVisible();
    await expect(page.getByTestId('wind-speed-input')).toHaveCount(0);
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);

    await selectOption(page, 'placement-select', 'На открытом воздухе');
    await expect(page.getByTestId('wind-speed-input')).toBeVisible();
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);
    await expect(page.getByTestId('burial-depth-input')).toHaveCount(0);
    await expect(page.getByTestId('ground-type-select')).toHaveCount(0);
  });

  test('матрица λ трубы и слоёв изоляции показывает только применимые поля', async ({ page }) => {
    await loginAsGuest(page);
    await openPipeForm(page);

    await expect(page.getByTestId('pipe-material-select')).toBeVisible();
    await expect(page.getByTestId('pipe-lambda-input')).toHaveCount(0);
    await expect(page.getByTestId('pipe-lambda-mode-select')).toHaveCount(0);

    await selectOption(page, 'pipe-material-select', 'Другой материал');
    await expect(page.getByTestId('pipe-lambda-input')).toBeVisible();
    await expect(page.getByTestId('pipe-material-select')).toBeVisible();

    await selectFirstOption(page, 'pipe-material-select');
    await expect(page.getByTestId('pipe-lambda-input')).toHaveCount(0);

    await selectOption(page, 'insulation-material-select', 'Другое');
    await expect(inputValue(page, 'first-insulation-lambda-input')).toBeEnabled();
    await expect(page.getByTestId('first-insulation-temperature-range-button')).toBeEnabled();

    await selectOption(page, 'insulation-layer-count-select', '2 слоя');
    await expect(page.getByTestId('second-insulation-material-select')).toBeVisible();
    await expect(page.getByTestId('second-insulation-thickness-input')).toBeVisible();
    await expect(page.getByTestId('third-insulation-material-select')).toHaveCount(0);

    await selectOption(page, 'second-insulation-material-select', 'Другое');
    await expect(page.getByTestId('second-insulation-lambda-input')).toBeVisible();

    await selectOption(page, 'insulation-layer-count-select', '3 слоя');
    await expect(page.getByTestId('third-insulation-material-select')).toBeVisible();
    await expect(page.getByTestId('third-insulation-thickness-input')).toBeVisible();

    await selectOption(page, 'third-insulation-material-select', 'Другое');
    await expect(page.getByTestId('third-insulation-lambda-input')).toBeVisible();

    await selectOption(page, 'insulation-layer-count-select', '1 слой');
    await expect(page.getByTestId('second-insulation-material-select')).toHaveCount(0);
    await expect(page.getByTestId('third-insulation-material-select')).toHaveCount(0);
  });

  test('справочные λ/диапазон T только читаются, а ручные значения сохраняются для Другого материала', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsGuest(page);
    await openPipeForm(page);

    const objectName = `E2E ручная изоляция ${Date.now()}`;
    await page.getByTestId('object-name-input').fill(objectName);
    await fillInput(page, 'outer-diameter-input', '114');
    await fillInput(page, 'pipe-length-input', '5');
    await fillInput(page, 'wall-thickness-input', '0.8');
    await selectSearchOption(page, 'pipe-material-select', 'Углеродистая', /Углеродистая/);
    await selectOption(page, 'placement-select', 'На открытом воздухе');
    await fillInput(page, 'ambient-temperature-input', '-20');
    await fillInput(page, 'process-temperature-input', '54');
    await fillInput(page, 'insulation-thickness-input', '20');
    await selectSearchOption(page, 'insulation-material-select', 'пенополиуретана', /пенополиуретана/);

    await expect(page.getByTestId('first-insulation-lambda-reference')).toBeVisible();
    await expect(page.getByTestId('first-insulation-temperature-range-reference')).toBeVisible();
    await expect(page.getByTestId('first-insulation-lambda-input')).toHaveCount(0);
    await expect(page.getByTestId('first-insulation-temperature-range-button')).toHaveCount(0);

    await selectOption(page, 'insulation-material-select', 'Другое');
    const manualLambda = '0.037';
    await fillInput(page, 'first-insulation-lambda-input', manualLambda);
    await expect(page.getByTestId('insulation-material-select')).toContainText('Другое');
    await fillTemperatureRange(page, 'first-insulation', '-55', '220');

    const createResponse = page.waitForResponse((response) => {
      if (response.request().method() !== 'POST') return false;
      return /\/api\/v1\/projects\/[^/]+\/objects$/.test(new URL(response.url()).pathname);
    });
    await page.locator('#inline-object-save').dispatchEvent('click');
    const response = await createResponse;
    expect(response.ok()).toBeTruthy();
    const created = await response.json() as {
      is_valid: boolean;
      params: Record<string, unknown>;
      validation_errors?: Record<string, unknown> | null;
    };

    expect(created.is_valid).toBe(true);
    expect(created.validation_errors ?? null).toBeNull();
    expect(created.params.insulation_layers).toEqual([
      expect.objectContaining({
        material: 'other',
        conductivity: Number(manualLambda),
        temperature_range: [-55, 220],
      }),
    ]);

    const savedName = String(created.params.name ?? objectName);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.calc-spreadsheet--normal-glide canvas').first()).toBeVisible();
    await expect(async () => {
      const objects = await fetchProjectObjects(page);
      expect(objects.some((obj) => obj.params.name === savedName)).toBe(true);
    }).toPass();
    await openFirstNormalGlideRow(page);
    await expect(page.getByTestId('insulation-material-select')).toContainText('Другое');
    await expect(inputValue(page, 'first-insulation-lambda-input')).toHaveValue(manualLambda);
    await expect(page.getByTestId('first-insulation-temperature-range-button')).toContainText('-55...220 °C');
    await expect(page.getByLabel('Ошибки выбранной строки')).toHaveCount(0);
  });

});
