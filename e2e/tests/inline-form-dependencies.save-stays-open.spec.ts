import { test, expect } from '@playwright/test';

import {
  createCalculatedPipe,
  loginAsGuest,
} from './helpers/workspace';
import {
  fetchProjectObjects,
  fillInput,
  saveSelectedObjectAndWait,
  selectFirstOption,
  selectOption,
} from './helpers/inline-form-dependencies';

test.describe('inline form dependencies — save stays open', () => {
  test('сохранение изменений редактируемого объекта не сворачивает форму', async ({ page }) => {
    await loginAsGuest(page);
    const originalName = `E2E edit stays open ${Date.now()}`;
    await createCalculatedPipe(page, originalName);
    await page.reload({ waitUntil: 'networkidle' });

    await page.getByText(originalName).click();
    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(page.getByTestId('object-name-input')).toHaveValue(originalName);
    await fillInput(page, 'wall-thickness-input', '4');
    await selectFirstOption(page, 'pipe-material-select');
    await selectOption(page, 'placement-select', 'На открытом воздухе');

    const updatedName = `${originalName} updated`;
    await page.getByTestId('object-name-input').fill(updatedName);
    await saveSelectedObjectAndWait(page);

    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(page.getByTestId('object-name-input')).toHaveValue(updatedName);
    await expect(page.getByText(updatedName)).toBeVisible();

    const objects = await fetchProjectObjects(page);
    expect(objects.some((obj) => obj.params.name === updatedName)).toBeTruthy();
  });

});
