import { test, expect, type Page } from '@playwright/test';

import { loginAsGuest } from './helpers/workspace';

async function openPipeForm(page: Page) {
  await page.getByRole('button', { name: /Добавить/ }).click();
  await page.getByText('Трубопровод').click();
  await expect(page.locator('.inline-object-form')).toBeVisible();
  await expect(page.locator('.inline-object-form > .ant-form-item:visible')).toHaveCount(0);
  await expect(page.locator('.inline-object-form > input:visible')).toHaveCount(0);
}

async function fillInput(page: Page, testId: string, value: string) {
  const control = page.getByTestId(testId);
  const isInput = await control.evaluate((el) => el.tagName.toLowerCase() === 'input');
  const input = isInput ? control : control.locator('input').first();
  await input.fill(value);
  await input.press('Tab');
}

async function selectOption(page: Page, testId: string, optionText: string) {
  await page.getByTestId(testId).click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  await dropdown.getByText(optionText, { exact: true }).first().click({ force: true });
}

async function selectSearchOption(page: Page, testId: string, search: string, option: RegExp) {
  await page.getByTestId(testId).click();
  await page.keyboard.type(search);
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  await dropdown.locator('.ant-select-item-option').filter({ hasText: option }).first().click({ force: true });
}

function inputValue(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"] input, input[data-testid="${testId}"]`).first();
}

test.describe('inline form dependencies', () => {
  test('климат, подземное размещение, ручная λ и 3 слоя переключают реальные поля', async ({ page }) => {
    await loginAsGuest(page);
    await openPipeForm(page);

    await expect(page.getByTestId('climate-basis-select')).toHaveCount(0);
    await expect(page.getByTestId('wind-speed-input')).toBeVisible();
    await expect(page.getByTestId('alpha-vnesh-input')).toBeVisible();

    await selectSearchOption(page, 'climate-select', 'Москва', /Москва/);
    await expect(page.getByTestId('climate-basis-select')).toBeVisible();
    await expect(page.getByText('из климата').first()).toBeVisible();
    await expect(inputValue(page, 'ambient-temperature-input')).not.toHaveValue('');
    await expect(inputValue(page, 'wind-speed-input')).not.toHaveValue('');

    await selectOption(page, 'placement-select', 'Подземно');
    await expect(page.getByTestId('burial-depth-input')).toBeVisible();
    await expect(page.getByTestId('ground-type-select')).toBeVisible();
    await expect(page.getByTestId('ground-conductivity-input')).toBeVisible();
    await expect(page.getByTestId('wind-speed-input')).toHaveCount(0);
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);

    await selectOption(page, 'pipe-lambda-mode-select', 'Вручн.');
    await expect(page.getByTestId('pipe-lambda-input')).toBeVisible();
    await expect(page.getByTestId('pipe-material-select')).toHaveCount(0);

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
    await fillInput(page, 'insulation-thickness-input', '40');
    await selectSearchOption(page, 'climate-select', 'Москва', /Москва/);
    await fillInput(page, 'process-temperature-input', '80');

    await selectSearchOption(page, 'insulation-material-select', 'Минеральная', /Минеральная/);
    await selectOption(page, 'insulation-layer-count-select', '3 слоя');
    await selectSearchOption(page, 'second-insulation-material-select', 'Минеральная', /Минеральная/);
    await fillInput(page, 'second-insulation-thickness-input', '20');
    await selectSearchOption(page, 'third-insulation-material-select', 'Минеральная', /Минеральная/);
    await fillInput(page, 'third-insulation-thickness-input', '10');

    await page.locator('#inline-object-save').dispatchEvent('click');

    await expect(page.locator('.inline-object-form')).toHaveCount(0);
    await expect(page.getByText(objectName)).toBeVisible();
    await expect(page.getByText('Все рассчитаны ✓')).toBeVisible();
    await page.getByText('Результаты расчёта').click();
    await expect(page.getByRole('columnheader', { name: 'q, Вт/м', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Q, Вт', exact: true })).toBeVisible();
  });
});
