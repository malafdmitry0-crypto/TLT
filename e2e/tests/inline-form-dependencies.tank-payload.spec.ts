import { test, expect } from '@playwright/test';

import {
  loginAsGuest,
} from './helpers/workspace';
import {
  fetchProjectObjects,
  fillInput,
  openPipeForm,
  openTankForm,
  selectFirstOption,
  selectOption,
} from './helpers/inline-form-dependencies';

test.describe('inline form dependencies — tank matrix / payload isolation', () => {
  test('матрица резервуара: форма объекта и подземное размещение меняют обязательные поля', async ({ page }) => {
    await loginAsGuest(page);
    await openTankForm(page);

    await expect(page.getByTestId('tank-shape-select')).toContainText('Цилиндрическая');
    await expect(page.getByTestId('tank-diameter-input')).toBeVisible();
    await expect(page.getByTestId('tank-height-input')).toBeVisible();
    await expect(page.getByTestId('tank-length-input')).toHaveCount(0);
    await expect(page.getByTestId('tank-width-input')).toHaveCount(0);

    await selectOption(page, 'tank-shape-select', 'Параллелепипед');
    await expect(page.getByTestId('tank-diameter-input')).toHaveCount(0);
    await expect(page.getByTestId('tank-height-input')).toBeVisible();
    await expect(page.getByTestId('tank-length-input')).toBeVisible();
    await expect(page.getByTestId('tank-width-input')).toBeVisible();

    await selectOption(page, 'placement-select', 'Подземно');
    await expect(page.getByTestId('burial-depth-input')).toBeVisible();
    await expect(page.getByTestId('ground-type-select')).toBeVisible();
    await expect(page.getByTestId('ground-conductivity-input')).toBeVisible();
    await expect(page.getByTestId('wind-speed-input')).toBeVisible();
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);
  });

  test('скрытые зависимости не утекают в payload после переключения сценариев', async ({ page }) => {
    await loginAsGuest(page);
    await openPipeForm(page);

    const objectName = `E2E чистый payload ${Date.now()}`;
    await page.getByTestId('object-name-input').fill(objectName);
    await fillInput(page, 'outer-diameter-input', '108');
    await fillInput(page, 'pipe-length-input', '12');
    await fillInput(page, 'wall-thickness-input', '4');
    await fillInput(page, 'insulation-thickness-input', '30');
    await fillInput(page, 'ambient-temperature-input', '-20');
    await fillInput(page, 'process-temperature-input', '80');
    await fillInput(page, 'local-elements-count-input', '12');

    await selectOption(page, 'pipe-material-select', 'Другой материал');
    await fillInput(page, 'pipe-lambda-input', '51');

    await selectOption(page, 'placement-select', 'Подземно');
    await fillInput(page, 'burial-depth-input', '1.2');
    await fillInput(page, 'ground-conductivity-input', '1.7');

    await selectOption(page, 'insulation-material-select', 'Другое');
    await fillInput(page, 'first-insulation-lambda-input', '0.041');
    await selectOption(page, 'insulation-layer-count-select', '3 слоя');
    await selectOption(page, 'second-insulation-material-select', 'Другое');
    await fillInput(page, 'second-insulation-thickness-input', '20');
    await fillInput(page, 'second-insulation-lambda-input', '0.05');
    await selectOption(page, 'third-insulation-material-select', 'Другое');
    await fillInput(page, 'third-insulation-thickness-input', '10');
    await fillInput(page, 'third-insulation-lambda-input', '0.06');

    await selectFirstOption(page, 'pipe-material-select');
    await selectOption(page, 'placement-select', 'На открытом воздухе');
    await selectFirstOption(page, 'insulation-material-select');
    await selectOption(page, 'insulation-layer-count-select', '1 слой');

    await page.locator('#inline-object-save').dispatchEvent('click');

    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(page.getByTestId('object-name-input')).toHaveValue('');
    await expect(page.getByText(objectName)).toBeVisible();

    const objects = await fetchProjectObjects(page);
    const created = objects.find((obj) => obj.params.name === objectName);
    expect(created).toBeTruthy();
    expect(created!.params.placement).toBe('outdoor');
    expect(created!.params.pipe_material).toBeTruthy();
    expect(created!.params.pipe_lambda).toBeUndefined();
    expect(created!.params.burial_depth).toBeUndefined();
    expect(created!.params.ground_type).toBeUndefined();
    expect(created!.params.ground_conductivity).toBeUndefined();
    expect(created!.params.valve_count).toBeUndefined();
    expect(created!.params.flange_count).toBeUndefined();
    expect(created!.params.support_count).toBeUndefined();
    expect(created!.params.num_local_elements).toBe(12);
    expect(created!.params.insulation_layer_count).toBe('1');
    expect(created!.params.insulation_layers).toEqual([
      expect.objectContaining({ thickness: 0.03 }),
    ]);
    expect(
      (created!.params.insulation_layers as Array<Record<string, unknown>>)[0].conductivity,
    ).toBeUndefined();
  });

});
