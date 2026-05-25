import { test, expect, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';

async function openPipeForm(page: Page) {
  const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
  await typeToolbar.getByRole('button', { name: /Трубопровод:/ }).click();
  await page.getByRole('toolbar', { name: 'Действия блока заполнения' }).getByRole('button', { name: 'Добавить' }).click();
  await expect(page.locator('.inline-object-form')).toBeVisible();
  await expect(page.locator('.inline-object-form > .ant-form-item:visible')).toHaveCount(0);
  await expect(page.locator('.inline-object-form > input:visible')).toHaveCount(0);
}

async function openTankForm(page: Page) {
  const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
  await typeToolbar.getByRole('button', { name: /Резервуар:/ }).click();
  await page.getByRole('toolbar', { name: 'Действия блока заполнения' }).getByRole('button', { name: 'Добавить' }).click();
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

async function openAntSelectDropdown(page: Page, testId: string) {
  await page.getByTestId(testId).click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  return dropdown;
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

async function selectFirstOption(page: Page, testId: string) {
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

function inputValue(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"] input, input[data-testid="${testId}"]`).first();
}

async function fetchProjectObjects(page: Page) {
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

async function createInvalidDeclaredThreeLayerPipe(page: Page, name: string) {
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
        insulation_thickness: 0.02,
        insulation_material: 'mineral_wool_boards_120',
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

async function createUndergroundPipeWithIndoorTm(page: Page, name: string) {
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
        insulation_thickness: 0.02,
        insulation_material: 'mineral_wool_boards_120',
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

test.describe('inline form dependencies', () => {
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
    await page.getByRole('toolbar', { name: 'Действия блока заполнения' }).getByRole('button', { name: 'Сохранить' }).click();

    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(page.getByTestId('object-name-input')).toHaveValue(updatedName);
    await expect(page.getByText(updatedName)).toBeVisible();

    const objects = await fetchProjectObjects(page);
    expect(objects.some((obj) => obj.params.name === updatedName)).toBeTruthy();
  });

  test('матрица размещения трубы переключает ветер, α и грунт без скрытых полей', async ({ page }) => {
    await loginAsGuest(page);
    await openPipeForm(page);

    await expect(page.getByTestId('wind-speed-input')).toHaveCount(0);
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);
    await selectOption(page, 'placement-select', 'На открытом воздухе');
    await expect(page.getByTestId('wind-speed-input')).toBeVisible();
    await expect(page.getByTestId('alpha-vnesh-input')).toBeVisible();
    await expect(page.getByTestId('burial-depth-input')).toHaveCount(0);
    await expect(page.getByTestId('ground-type-select')).toHaveCount(0);

    await selectOption(page, 'placement-select', 'В помещении');
    await expect(page.getByTestId('wind-speed-input')).toHaveCount(0);
    await expect(page.getByTestId('alpha-vnesh-input')).toBeVisible();
    await expect(page.getByTestId('ground-conductivity-input')).toHaveCount(0);

    await selectOption(page, 'placement-select', 'Подземно');
    await expect(page.getByTestId('burial-depth-input')).toBeVisible();
    await expect(page.getByTestId('ground-type-select')).toBeVisible();
    await expect(page.getByTestId('ground-conductivity-input')).toBeVisible();
    await expect(page.getByTestId('wind-speed-input')).toHaveCount(0);
    await expect(page.getByTestId('alpha-vnesh-input')).toHaveCount(0);

    await selectOption(page, 'placement-select', 'На открытом воздухе');
    await expect(page.getByTestId('wind-speed-input')).toBeVisible();
    await expect(page.getByTestId('alpha-vnesh-input')).toBeVisible();
    await expect(page.getByTestId('burial-depth-input')).toHaveCount(0);
    await expect(page.getByTestId('ground-type-select')).toHaveCount(0);
  });

  test('матрица λ трубы и слоёв изоляции показывает только применимые поля', async ({ page }) => {
    await loginAsGuest(page);
    await openPipeForm(page);

    await expect(page.getByTestId('pipe-material-select')).toHaveCount(0);
    await expect(page.getByTestId('pipe-lambda-input')).toHaveCount(0);

    await selectOption(page, 'pipe-lambda-mode-select', 'Справ.');
    await expect(page.getByTestId('pipe-material-select')).toBeVisible();
    await expect(page.getByTestId('pipe-lambda-input')).toHaveCount(0);

    await selectOption(page, 'pipe-lambda-mode-select', 'Вручн.');
    await expect(page.getByTestId('pipe-lambda-input')).toBeVisible();
    await expect(page.getByTestId('pipe-material-select')).toHaveCount(0);

    await selectOption(page, 'pipe-lambda-mode-select', 'Справ.');
    await expect(page.getByTestId('pipe-material-select')).toBeVisible();
    await expect(page.getByTestId('pipe-lambda-input')).toHaveCount(0);

    await selectOption(page, 'insulation-material-select', 'Другое');
    await expect(inputValue(page, 'first-insulation-lambda-input')).toBeEnabled();

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

    await page.getByRole('toolbar', { name: 'Действия блока заполнения' }).getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByLabel('Ошибки выбранной строки')).toHaveCount(0);

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

  test('матрица резервуара: форма объекта и подземное размещение меняют обязательные поля', async ({ page }) => {
    await loginAsGuest(page);
    await openTankForm(page);

    await expect(page.getByTestId('tank-diameter-input')).toHaveCount(0);
    await expect(page.getByTestId('tank-height-input')).toHaveCount(0);

    await selectOption(page, 'tank-shape-select', 'Цилиндрическая');
    await expect(page.getByTestId('tank-diameter-input')).toBeVisible();
    await expect(page.getByTestId('tank-height-input')).toBeVisible();
    await expect(page.getByTestId('tank-length-input')).toHaveCount(0);
    await expect(page.getByTestId('tank-width-input')).toHaveCount(0);

    await selectOption(page, 'tank-shape-select', 'Параллелепипед');
    await expect(page.getByTestId('tank-diameter-input')).toHaveCount(0);
    await expect(page.getByTestId('tank-height-input')).toBeVisible();
    await expect(page.getByTestId('tank-length-input')).toBeVisible();
    await expect(page.getByTestId('tank-width-input')).toBeVisible();

    await selectOption(page, 'tank-shape-select', 'Сферическая');
    await expect(page.getByTestId('tank-diameter-input')).toBeVisible();
    await expect(page.getByTestId('tank-height-input')).toHaveCount(0);
    await expect(page.getByTestId('tank-length-input')).toHaveCount(0);
    await expect(page.getByTestId('tank-width-input')).toHaveCount(0);

    await selectOption(page, 'placement-select', 'Подземно');
    await expect(page.getByTestId('burial-depth-input')).toBeVisible();
    await expect(page.getByTestId('ground-type-select')).toBeVisible();
    await expect(page.getByTestId('ground-conductivity-input')).toBeVisible();
    await expect(page.getByTestId('wind-speed-input')).toBeVisible();
    await expect(page.getByTestId('alpha-vnesh-input')).toBeVisible();
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
    await fillInput(page, 'valve-count-input', '3');
    await fillInput(page, 'flange-count-input', '4');
    await fillInput(page, 'support-count-input', '5');

    await selectOption(page, 'pipe-lambda-mode-select', 'Вручн.');
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

    await selectOption(page, 'pipe-lambda-mode-select', 'Справ.');
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
    expect(created!.params.valve_count).toBe(3);
    expect(created!.params.flange_count).toBe(4);
    expect(created!.params.support_count).toBe(5);
    expect(created!.params.num_local_elements).toBe(12);
    expect(created!.params.insulation_layer_count).toBe('1');
    expect(created!.params.insulation_layers).toEqual([
      expect.objectContaining({ thickness: 0.03 }),
    ]);
    expect(
      (created!.params.insulation_layers as Array<Record<string, unknown>>)[0].conductivity,
    ).toBeUndefined();
  });

  test('климат, подземное размещение, ручная λ и 3 слоя переключают реальные поля', async ({ page }) => {
    await loginAsGuest(page);
    await openPipeForm(page);

    await expect(page.getByTestId('climate-basis-select')).toHaveCount(0);
    await selectOption(page, 'placement-select', 'На открытом воздухе');
    await expect(page.getByTestId('wind-speed-input')).toBeVisible();
    await expect(page.getByTestId('alpha-vnesh-input')).toBeVisible();

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
    await fillInput(page, 'wall-thickness-input', '6');
    await selectOption(page, 'pipe-lambda-mode-select', 'Справ.');
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
