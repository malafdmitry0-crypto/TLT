import { expect, type Page } from '@playwright/test';

import {
  API_BASE,
  currentGuestContext,
} from './workspace';

export async function openPipeForm(page: Page) {
  const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
  await typeToolbar.getByRole('button', { name: /Трубопровод:/ }).click();
  await page.getByRole('toolbar', { name: 'Действия блока заполнения' }).getByRole('button', { name: 'Добавить' }).click();
  await expect(page.locator('.inline-object-form')).toBeVisible();
  await expect(page.locator('.inline-object-form > .ant-form-item:visible')).toHaveCount(0);
  await expect(page.locator('.inline-object-form > input:visible')).toHaveCount(0);
}

export async function openTankForm(page: Page) {
  const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
  await typeToolbar.getByRole('button', { name: /Резервуар:/ }).click();
  await page.getByRole('toolbar', { name: 'Действия блока заполнения' }).getByRole('button', { name: 'Добавить' }).click();
  await expect(page.locator('.inline-object-form')).toBeVisible();
  await expect(page.locator('.inline-object-form > .ant-form-item:visible')).toHaveCount(0);
  await expect(page.locator('.inline-object-form > input:visible')).toHaveCount(0);
}

export async function fillInput(page: Page, testId: string, value: string) {
  const control = page.getByTestId(testId);
  const isInput = await control.evaluate((el) => el.tagName.toLowerCase() === 'input');
  const input = isInput ? control : control.locator('input').first();
  await input.fill(value);
  await input.press('Tab');
}

export async function fillTemperatureRange(page: Page, prefix: string, min: string, max: string) {
  await page.getByTestId(`${prefix}-temperature-range-button`).click();
  const dialog = page.getByRole('dialog', { name: 'Диапазон температуры' });
  await expect(dialog).toBeVisible();
  const minInput = dialog.locator(`[data-testid="${prefix}-temperature-min-input"] input, input[data-testid="${prefix}-temperature-min-input"]`).first();
  const maxInput = dialog.locator(`[data-testid="${prefix}-temperature-max-input"] input, input[data-testid="${prefix}-temperature-max-input"]`).first();
  await minInput.fill(min);
  await maxInput.fill(max);
  await dialog.getByRole('button', { name: 'Применить' }).click();
  await expect(dialog).toHaveCount(0);
}

export async function openFirstNormalGlideRow(page: Page) {
  const canvas = page.locator('.calc-spreadsheet--normal-glide canvas').first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + 340, box!.y + 55);
}

export async function selectOption(page: Page, testId: string, optionText: string) {
  await page.getByTestId(testId).click();
  const referenceList = page.locator('.reference-picker-modal .reference-picker-list:visible').last();
  if (await referenceList.isVisible().catch(() => false)) {
    await referenceList.getByRole('option', { name: new RegExp(optionText) }).first().click();
    return;
  }

  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  const option = dropdown.getByText(optionText, { exact: true }).first();
  if (await option.count() === 0) {
    await dropdown.locator('.rc-virtual-list-holder').evaluate((el) => {
      el.scrollTo(0, el.scrollHeight);
    }).catch(() => undefined);
  }
  await expect(option).toBeAttached();
  await option.evaluate((el) => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    (el as HTMLElement).click();
  });
}

export async function openAntSelectDropdown(page: Page, testId: string) {
  await page.getByTestId(testId).click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  return dropdown;
}

export async function selectSearchOption(page: Page, testId: string, search: string, option: RegExp) {
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

export async function selectFirstOption(page: Page, testId: string) {
  await page.getByTestId(testId).click();
  const referenceList = page.locator('.reference-picker-modal .reference-picker-list:visible').last();
  if (await referenceList.isVisible().catch(() => false)) {
    await referenceList.getByRole('option').first().click();
    return;
  }

  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  const first = dropdown.locator('.ant-select-item-option').first();
  await expect(first).toBeAttached();
  await first.evaluate((el) => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    (el as HTMLElement).click();
  });
}

export function inputValue(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"] input, input[data-testid="${testId}"]`).first();
}

export async function fetchProjectObjects(page: Page) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.get(`${API_BASE}/api/v1/projects/${projectId}/objects`, {
    headers: { 'X-Session-Id': sessionId },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<Array<{
    is_valid: boolean;
    params: Record<string, unknown>;
    validation_errors?: Record<string, unknown> | null;
  }>>;
}

export async function saveSelectedObjectAndWait(page: Page) {
  const updateResponse = page.waitForResponse((response) => {
    if (response.request().method() !== 'PUT') return false;
    return /\/api\/v1\/projects\/[^/]+\/objects\/[^/]+$/.test(new URL(response.url()).pathname);
  });
  await page
    .getByRole('toolbar', { name: 'Действия блока заполнения' })
    .getByRole('button', { name: 'Сохранить' })
    .click();
  const response = await updateResponse;
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{
    is_valid: boolean;
    params: Record<string, unknown>;
    validation_errors?: Record<string, unknown> | null;
  }>;
}

export async function createInvalidDeclaredThreeLayerPipe(page: Page, name: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.post(`${API_BASE}/api/v1/projects/${projectId}/objects`, {
    headers: { 'X-Session-Id': sessionId },
    data: {
      object_type: 'pipe',
      params: {
        name,
        outer_diameter: 0.013,
        wall_thickness: 0.001,
        pipe_material: 'stainless_304',
        pipe_length: 5,
        insulation_layers: [
          { thickness: 0.02, material: 'mineral_wool_boards_120' },
        ],
        insulation_layer_count: '3',
        placement: 'underground',
        burial_depth: 0.4,
        ground_type: 'sand_1480_w5',
        ground_conductivity: 1.11,
        ambient_temperature: 0,
        process_temperature: 1,
        insulation_temperature_basis: 'channel',
        min_switch_temperature: -20,
        supply_voltage: 220,
        safety_factor: 1.12,
        steam_tracing: 'no',
        valve_count: 2,
        flange_count: 2,
        support_count: 2,
        local_element_equiv_length: 1.5,
      },
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

export async function createUndergroundPipeWithIndoorTm(page: Page, name: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.post(`${API_BASE}/api/v1/projects/${projectId}/objects`, {
    headers: { 'X-Session-Id': sessionId },
    data: {
      object_type: 'pipe',
      params: {
        name,
        outer_diameter: 0.013,
        wall_thickness: 0.0011,
        pipe_material: 'stainless_304',
        pipe_length: 6,
        insulation_layers: [
          { thickness: 0.02, material: 'mineral_wool_boards_120' },
        ],
        insulation_layer_count: '1',
        placement: 'underground',
        burial_depth: 0.4,
        ground_type: 'sand_1600_w238',
        ground_conductivity: 2.02,
        ambient_temperature: 0,
        process_temperature: 1,
        insulation_temperature_basis: 'indoor',
        min_switch_temperature: -20,
        supply_voltage: 220,
        safety_factor: 1.12,
        steam_tracing: 'yes',
        vapor_temperature: 0.7,
        valve_count: 2,
        flange_count: 2,
        support_count: 2,
        local_element_equiv_length: 1.5,
      },
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
