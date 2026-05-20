import { test, expect, type Locator, type Page } from '@playwright/test';

import { API_BASE } from './helpers/workspace';
import {
  ensureTestEmployee,
  loginAsTestEmployee,
  TEST_EMPLOYEE_EMAIL,
  TEST_EMPLOYEE_PASSWORD,
} from './helpers/employee';

test.beforeAll(async () => {
  await ensureTestEmployee(API_BASE);
});

async function currentProjectId(page: Page): Promise<string> {
  const raw = await page.evaluate(() => localStorage.getItem('tlt-current-project'));
  expect(raw).toBeTruthy();
  return JSON.parse(raw!).state.currentProject.id as string;
}

async function employeeToken(page: Page): Promise<string> {
  const response = await page.request.post(`${API_BASE}/api/v1/auth/login`, {
    data: {
      email: TEST_EMPLOYEE_EMAIL,
      password: TEST_EMPLOYEE_PASSWORD,
    },
  });
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  return data.access_token as string;
}

async function createEmployeePipe(page: Page, name: string): Promise<void> {
  const projectId = await currentProjectId(page);
  const token = await employeeToken(page);
  const response = await page.request.post(`${API_BASE}/api/v1/projects/${projectId}/objects`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      object_type: 'pipe',
      params: {
        name,
        outer_diameter: 0.108,
        pipe_length: 50,
        insulation_thickness: 0.05,
        insulation_material: 'mineral_wool_boards_120',
        insulation_temperature_basis: 'outdoor_winter',
        ambient_temperature: -30,
        process_temperature: 150,
      },
    },
  });
  expect(response.status()).toBe(201);
}

async function createEmployeeProject(page: Page): Promise<void> {
  const name = `E2E cable source labels ${Date.now()}`;
  await page.getByRole('button', { name: /Новый проект/i }).click();
  await page.getByPlaceholder('Название проекта').fill(name);
  await page.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByText('Проект создан')).toBeVisible();
}

async function selectDropdownOption(page: Page, optionText: string) {
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  const option = dropdown.locator('.ant-select-item-option').filter({ hasText: optionText }).first();
  await expect(option).toBeVisible();
  await option.click();
}

async function openCableMarkModal(page: Page, objectName: string) {
  const row = page.getByRole('row').filter({ hasText: objectName }).first();
  await expect(row).toBeVisible();
  await row.click();
  await row.getByRole('button', { name: /Авто|ТЛТ|ТТ|ВНШ|КМСО/i }).first().click();
  return page.getByRole('dialog', { name: /Выбор марки кабеля/ });
}

async function setCableSource(page: Page, label: string) {
  await page.getByRole('button', { name: 'Настройки' }).click();
  const dialog = page.getByRole('dialog', { name: 'Настройки таблицы электрорасчёта' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: 'Остальное' }).click();
  await dialog.getByLabel('База для пересчёта').getByText(label, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(dialog).toBeHidden();
}

async function expectCableCharacteristicsLists(dialog: Locator) {
  await expect(dialog.getByRole('group', { name: 'Характеристики: объект' })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Характеристики: кабель' })).toBeVisible();
  await expect(dialog.getByRole('table', { name: 'Характеристики объекта и кабеля' })).toHaveCount(0);
}

async function setModalCableType(dialog: Locator, page: Page, optionText: string) {
  await dialog.locator('.ant-select-selector').first().click();
  await selectDropdownOption(page, optionText);
}

async function searchMark(dialog: Locator, page: Page, query: string) {
  const markSelect = dialog.locator('.ant-select').last();
  await markSelect.click();
  const input = dialog.locator('.ant-select-selection-search-input').last();
  await input.fill(query);
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  return dropdown;
}

async function expectOptionExternalLabel(
  dropdown: Locator,
  optionText: string | RegExp,
  expected: boolean,
  expectedCount?: number,
) {
  const options = dropdown.locator('.ant-select-item-option').filter({ hasText: optionText });
  if (expectedCount !== undefined) {
    await expect(options).toHaveCount(expectedCount);
  }
  const option = options.first();
  await expect(option).toBeVisible();
  const tag = options.locator('.ant-tag').filter({ hasText: 'внеш.' });
  if (expected) {
    await expect(tag.first()).toBeVisible();
  } else {
    await expect(tag).toHaveCount(0);
  }
}

test.describe('cable source labels', () => {
  test('режим Все показывает внеш. только для технически уникальных внешних кабелей', async ({
    page,
  }) => {
    await loginAsTestEmployee(page);
    await createEmployeeProject(page);
    const pipeName = `E2E cable labels ${Date.now()}`;
    await createEmployeePipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await setCableSource(page, 'Все');

    const dialog = await openCableMarkModal(page, pipeName);
    await expect(dialog).toBeVisible();
    await expectCableCharacteristicsLists(dialog);

    let dropdown = await searchMark(dialog, page, 'ТЛТ-75');
    await expectOptionExternalLabel(dropdown, /ТЛТ-75.*75 Вт\/м/, false, 1);
    dropdown = await searchMark(dialog, page, 'ТЛТ-40');
    await expectOptionExternalLabel(dropdown, /ТЛТ-40.*40 Вт\/м/, false, 1);
    dropdown = await searchMark(dialog, page, 'ВНШ-СР-18');
    await expectOptionExternalLabel(dropdown, /ВНШ-СР-18.*18 Вт\/м/, true);

    await setModalCableType(dialog, page, 'Однож. пост. мощн.');
    dropdown = await searchMark(dialog, page, 'ТТ Р1 8000');
    await expectOptionExternalLabel(dropdown, /ТТ Р1 8000/, false, 1);
    dropdown = await searchMark(dialog, page, 'ВНШ-Р1-1.8/230');
    await expectOptionExternalLabel(dropdown, /ВНШ-Р1-1\.8\/230/, true);

    await setModalCableType(dialog, page, 'Трёхж. пост. мощн.');
    dropdown = await searchMark(dialog, page, 'ТТ Р3 х');
    await expect(
      dropdown
        .locator('.ant-select-item-option')
        .filter({ hasText: /ТТ Р3 х/ })
        .locator('.ant-tag')
        .filter({ hasText: 'внеш.' }),
    ).toHaveCount(0);
    dropdown = await searchMark(dialog, page, 'ТТ Р3 х 1,0-0,6');
    await expectOptionExternalLabel(dropdown, /ТТ Р3 х 1,0-0,6/, false, 1);
    dropdown = await searchMark(dialog, page, 'ТТ Р3 х 6,0-0,6');
    await expectOptionExternalLabel(dropdown, /ТТ Р3 х 6,0-0,6/, false, 1);
    dropdown = await searchMark(dialog, page, 'ВНШ-Р3-4.0-55');
    await expectOptionExternalLabel(dropdown, /ВНШ-Р3-4\.0-55/, true);
    dropdown = await searchMark(dialog, page, 'КМСО-1,5-25');
    await expectOptionExternalLabel(dropdown, /КМСО-1,5-25/, true);
  });

  test('режим Внешняя не дублирует метку внеш. в списке марок', async ({ page }) => {
    await loginAsTestEmployee(page);
    await createEmployeeProject(page);
    const pipeName = `E2E cable labels extended ${Date.now()}`;
    await createEmployeePipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await setCableSource(page, 'Внешняя');

    const dialog = await openCableMarkModal(page, pipeName);
    await expect(dialog).toBeVisible();
    await expectCableCharacteristicsLists(dialog);

    let dropdown = await searchMark(dialog, page, 'ВНШ-СР');
    await expect(dropdown.locator('.ant-tag').filter({ hasText: 'внеш.' })).toHaveCount(0);

    await setModalCableType(dialog, page, 'Однож. пост. мощн.');
    dropdown = await searchMark(dialog, page, 'ВНШ-Р1');
    await expect(dropdown.locator('.ant-tag').filter({ hasText: 'внеш.' })).toHaveCount(0);

    await setModalCableType(dialog, page, 'Трёхж. пост. мощн.');
    dropdown = await searchMark(dialog, page, 'ВНШ-Р3');
    await expect(dropdown.locator('.ant-tag').filter({ hasText: 'внеш.' })).toHaveCount(0);
  });
});
