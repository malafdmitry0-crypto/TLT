import { test, expect } from '@playwright/test';

import {
  loginAsGuest,
} from './helpers/workspace';
import {
  fetchProjectObjects,
  fillInput,
  openPipeForm,
  selectFirstOption,
  selectOption,
  selectSearchOption,
} from './helpers/inline-form-dependencies';

test.describe('inline form dependencies — climate / create pipeline', () => {
  test('климат, подземное размещение, ручная λ и 3 слоя переключают реальные поля', async ({ page }) => {
    await loginAsGuest(page);
    await openPipeForm(page);

    await expect(page.getByTestId('climate-basis-select')).toHaveCount(0);
    await selectOption(page, 'placement-select', 'На открытом воздухе');
    await expect(page.getByTestId('wind-speed-input')).toBeVisible();
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);

    await selectSearchOption(page, 'climate-select', 'Москва', /Москва/);
    await expect(page.getByTestId('climate-basis-select')).toBeVisible();
    await selectFirstOption(page, 'climate-basis-select');
    await expect(page.getByText('из климата').first()).toBeVisible();

    await selectOption(page, 'placement-select', 'Подземно');
    await expect(page.getByTestId('burial-depth-input')).toBeVisible();
    await expect(page.getByTestId('ground-type-select')).toBeVisible();
    await expect(page.getByTestId('ground-conductivity-input')).toBeVisible();
    await expect(page.getByTestId('wind-speed-input')).toHaveCount(0);
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);

    await selectOption(page, 'pipe-material-select', 'Другой материал');
    await expect(page.getByTestId('pipe-lambda-input')).toBeVisible();
    await expect(page.getByTestId('pipe-material-select')).toBeVisible();

    await selectOption(page, 'insulation-layer-count-select', '3 слоя');
    await expect(page.getByTestId('second-insulation-material-select')).toBeVisible();
    await expect(page.getByTestId('third-insulation-material-select')).toBeVisible();
    await expect(page.getByTestId('third-insulation-thickness-input')).toBeVisible();
  });

  test('создаёт трубопровод с климатом и трёхслойной изоляцией через UI', async ({ page }) => {
    await loginAsGuest(page);
    await openPipeForm(page);

    const objectName = `E2E климат 3 слоя ${Date.now()}`;
    await page.getByTestId('object-name-input').fill(objectName);
    await fillInput(page, 'outer-diameter-input', '108');
    await fillInput(page, 'pipe-length-input', '30');
    await fillInput(page, 'wall-thickness-input', '6');
    await selectSearchOption(page, 'pipe-material-select', 'Углеродистая', /Углеродистая/);
    await selectOption(page, 'placement-select', 'На открытом воздухе');
    await fillInput(page, 'insulation-thickness-input', '40');
    await selectSearchOption(page, 'climate-select', 'Москва', /Москва/);
    await selectFirstOption(page, 'climate-basis-select');
    await fillInput(page, 'ambient-temperature-input', '-25');
    await fillInput(page, 'wind-speed-input', '3');
    await fillInput(page, 'process-temperature-input', '80');

    await selectSearchOption(page, 'insulation-material-select', 'Минеральная', /Минеральная/);
    await selectOption(page, 'insulation-layer-count-select', '3 слоя');
    await selectSearchOption(page, 'second-insulation-material-select', 'Минеральная', /Минеральная/);
    await fillInput(page, 'second-insulation-thickness-input', '20');
    await selectSearchOption(page, 'third-insulation-material-select', 'Минеральная', /Минеральная/);
    await fillInput(page, 'third-insulation-thickness-input', '10');

    await page.locator('#inline-object-save').dispatchEvent('click');

    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(page.getByText(objectName)).toBeVisible();
    const objects = await fetchProjectObjects(page);
    expect(objects.some((obj) => obj.params.name === objectName)).toBeTruthy();
  });
});
