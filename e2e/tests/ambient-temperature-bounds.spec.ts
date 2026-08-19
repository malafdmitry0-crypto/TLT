/**
 * ATB-QA: minimum/maximum ambient temperature user contract.
 *
 * `ambient_temperature` remains the calculation input. The optional
 * `max_ambient_temperature` is persisted and transported, but changing it
 * must not change any heat-loss result field.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  createCalculatedTank,
  currentGuestContext,
  fetchProjectObjects,
  loginAsGuest,
} from './helpers/workspace';
import {
  fillInput,
  inputValue,
  openFirstNormalGlideRow,
  openPipeForm,
  saveSelectedObjectAndWait,
  selectOption,
  selectSearchOption,
} from './helpers/inline-form-dependencies';
import {
  exportProjectCsv,
  importProjectCsv,
} from './helpers/phase5-api';

const RELATION_ERROR =
  'Максимальная температура окружающей среды не может быть ниже минимальной';
const MINIMUM_LABEL = 'Минимальная температура окружающей среды';
const MAXIMUM_LABEL = 'Максимальная температура окружающей среды';

type ProjectObjectRow = Awaited<ReturnType<typeof fetchProjectObjects>>[number];

test.use({ viewport: { width: 1440, height: 1000 } });

async function objectByName(page: Page, name: string): Promise<ProjectObjectRow> {
  let found: ProjectObjectRow | undefined;
  await expect.poll(async () => {
    found = (await fetchProjectObjects(page)).find((row) => row.params.name === name);
    return found != null;
  }, { timeout: 20_000 }).toBe(true);
  return found!;
}

async function expectDefaultAmbientColumns(page: Page) {
  const grid = page.locator('.calc-spreadsheet--normal-glide').first();
  await expect(grid).toBeVisible({ timeout: 20_000 });
  await expect(grid).toHaveAttribute(
    'data-glide-visible-columns',
    /(?:^|\|)ambient_temperature:\d+/,
  );
  await expect(grid).toHaveAttribute(
    'data-glide-visible-columns',
    /(?:^|\|)max_ambient_temperature:\d+/,
  );

  const tableActions = page.getByRole('toolbar', { name: 'Действия таблицы объектов' });
  await tableActions.getByRole('button', { name: 'Настройки отображения' }).click();
  const dialog = page.getByRole('dialog', { name: 'Настройки таблицы' });
  await expect(dialog.getByRole('checkbox', { name: MINIMUM_LABEL })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: MAXIMUM_LABEL })).toBeChecked();
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  await expect(dialog).toHaveCount(0);
}

async function reportRowCells(page: Page, objectName: string): Promise<string[]> {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.get(
    `${API_BASE}/api/v1/reports/${projectId}/preview?variant_number=1&sections=pipes&sections=tanks`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(response.status()).toBe(200);
  const body = await response.json() as { html: string };
  const cells = await page.evaluate(({ html, name }) => {
    const documentNode = new DOMParser().parseFromString(html, 'text/html');
    const row = Array.from(documentNode.querySelectorAll('tbody tr')).find((candidate) => {
      const rowCells = Array.from(candidate.querySelectorAll('td'));
      return rowCells[1]?.textContent?.trim() === name;
    });
    return row
      ? Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')
      : [];
  }, { html: body.html, name: objectName });
  expect(cells, `report row for ${objectName}`).not.toEqual([]);
  return cells;
}

async function selectSand(page: Page) {
  await selectSearchOption(page, 'ground-type-select', 'песок', /песок/i);
  await expect(inputValue(page, 'ground-conductivity-input')).not.toHaveValue('');
}

test.describe('ATB-QA: границы температуры окружающей среды', () => {
  test.describe.configure({ mode: 'serial' });

  test('труба: optional max, round-trip, валидация, равенство, инвариант расчёта и N/A под землёй', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await loginAsGuest(page);
    await openPipeForm(page);

    await expect(inputValue(page, 'max-ambient-temperature-input')).toHaveValue('');
    const objectName = `ATB pipe ${Date.now()}`;
    await page.getByTestId('object-name-input').fill(objectName);
    await fillInput(page, 'outer-diameter-input', '108');
    await fillInput(page, 'pipe-length-input', '30');
    await fillInput(page, 'wall-thickness-input', '6');
    await selectSearchOption(page, 'pipe-material-select', 'Углеродистая', /Углеродистая/);
    await selectOption(page, 'placement-select', 'На открытом воздухе');
    await fillInput(page, 'insulation-thickness-input', '40');
    await selectSearchOption(page, 'insulation-material-select', 'минераловат', /минераловатные/i);
    await selectSearchOption(page, 'climate-select', 'Москва', /Москва/);
    const ambientItem = page.getByTestId('ambient-temperature-input')
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-form-item ")][1]');
    await expect(ambientItem).toContainText('из климата');
    await fillInput(page, 'wind-speed-input', '3');
    await fillInput(page, 'process-temperature-input', '80');
    await expect(inputValue(page, 'max-ambient-temperature-input')).toHaveValue('');

    const createResponsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && /\/api\/v1\/projects\/[^/]+\/objects$/.test(new URL(response.url()).pathname));
    await page.locator('#inline-object-save').dispatchEvent('click');
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json() as ProjectObjectRow;
    expect(created.params.ambient_temperature_source).toBe('climate');
    expect(created.params.max_ambient_temperature ?? null).toBeNull();
    expect(created.results).not.toBeNull();
    const calculationBaseline = created.results;
    const minimum = Number(created.params.ambient_temperature);
    expect(Number.isFinite(minimum)).toBe(true);

    await expectDefaultAmbientColumns(page);
    await openFirstNormalGlideRow(page);
    await expect(inputValue(page, 'max-ambient-temperature-input')).toHaveValue('');

    await fillInput(page, 'max-ambient-temperature-input', '25');
    await saveSelectedObjectAndWait(page);
    const withMaximum = await objectByName(page, objectName);
    expect(withMaximum.params.max_ambient_temperature).toBe(25);
    expect(withMaximum.results).toEqual(calculationBaseline);

    await page.reload({ waitUntil: 'networkidle' });
    await openFirstNormalGlideRow(page);
    await expect(inputValue(page, 'max-ambient-temperature-input')).toHaveValue('25');

    let objectWrites = 0;
    const countObjectWrite = (request: import('@playwright/test').Request) => {
      if (
        ['POST', 'PUT'].includes(request.method())
        && /\/api\/v1\/projects\/[^/]+\/objects(?:\/[^/]+)?$/.test(new URL(request.url()).pathname)
      ) objectWrites += 1;
    };
    page.on('request', countObjectWrite);
    await fillInput(page, 'max-ambient-temperature-input', String(minimum - 1));
    const maximumInput = inputValue(page, 'max-ambient-temperature-input');
    const maximumItem = page.getByTestId('max-ambient-temperature-input')
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-form-item ")][1]');
    await expect(maximumItem).toContainText(RELATION_ERROR);
    await expect(maximumInput).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#inline-object-save').dispatchEvent('click');
    await page.waitForTimeout(300);
    page.off('request', countObjectWrite);
    expect(objectWrites).toBe(0);
    expect((await objectByName(page, objectName)).params.max_ambient_temperature).toBe(25);

    await fillInput(page, 'max-ambient-temperature-input', String(minimum));
    await expect(maximumItem).not.toContainText(RELATION_ERROR);
    await saveSelectedObjectAndWait(page);
    const equalBounds = await objectByName(page, objectName);
    expect(equalBounds.params.max_ambient_temperature).toBe(minimum);
    expect(equalBounds.results).toEqual(calculationBaseline);

    await selectOption(page, 'placement-select', 'Подземно');
    await expect(page.getByTestId('ambient-temperature-input')).toHaveCount(0);
    await expect(page.getByTestId('max-ambient-temperature-input')).toHaveCount(0);
    await fillInput(page, 'ground-temperature-input', '5');
    await selectSand(page);
    // Choosing a reference soil updates several dependent fields. Enter depth
    // last so the aliased form field (`burial_depth` -> API
    // `pipe_centerline_depth`) is the final validated value.
    await fillInput(page, 'burial-depth-input', '1');
    const depthItem = page.getByTestId('burial-depth-input')
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-form-item ")][1]');
    await expect(depthItem).not.toContainText('Укажите значение');
    const undergroundResponse = await saveSelectedObjectAndWait(page);
    expect(undergroundResponse.params.max_ambient_temperature).toBeNull();
    const underground = await objectByName(page, objectName);
    expect(underground.params.placement).toBe('underground');
    expect(underground.params.max_ambient_temperature).toBeNull();
    expect((await reportRowCells(page, objectName)).slice(6, 8)).toEqual(['—', '—']);

    await page.screenshot({
      path: testInfo.outputPath('pipe-underground-ambient-bounds.png'),
      fullPage: true,
    });
  });

  test('подземный резервуар сохраняет обе границы в форме, API и отчёте', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await loginAsGuest(page);
    const objectName = `ATB tank ${Date.now()}`;
    await createCalculatedTank(page, objectName, { max_ambient_temperature: 30 });
    await page.reload({ waitUntil: 'networkidle' });
    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await typeToolbar.getByRole('button', { name: /Резервуар:\s*1/ }).click();
    await openFirstNormalGlideRow(page);

    await expect(inputValue(page, 'ambient-temperature-input')).toHaveValue('-20');
    await expect(inputValue(page, 'max-ambient-temperature-input')).toHaveValue('30');
    await selectOption(page, 'placement-select', 'Подземно');
    await expect(page.getByTestId('ambient-temperature-input')).toBeVisible();
    await expect(page.getByTestId('max-ambient-temperature-input')).toBeVisible();
    await expect(page.getByTestId('wind-speed-input')).toBeVisible();
    await fillInput(page, 'burial-depth-input', '1');
    await fillInput(page, 'ground-temperature-input', '5');
    await selectSand(page);
    await saveSelectedObjectAndWait(page);

    const underground = await objectByName(page, objectName);
    expect(underground.params.placement).toBe('underground');
    expect(underground.params.ambient_temperature).toBe(-20);
    expect(underground.params.max_ambient_temperature).toBe(30);
    expect((await reportRowCells(page, objectName)).slice(6, 8)).toEqual(['-20.0', '30.0']);

    await page.screenshot({
      path: testInfo.outputPath('tank-underground-ambient-bounds.png'),
      fullPage: true,
    });
  });

  test('гостевой CSV round-trip сохраняет minimum, zero maximum и весь results', async ({ page }) => {
    await loginAsGuest(page);
    const objectName = `ATB CSV ${Date.now()}`;
    const source = await createCalculatedPipe(page, objectName, {
      ambient_temperature: -20,
      max_ambient_temperature: 0,
    });
    expect(source.results).not.toBeNull();

    const csv = await exportProjectCsv(page);
    expect(csv).toContain('max_ambient_temperature');
    const { sessionId } = await currentGuestContext(page);
    const importedResponse = await importProjectCsv(page.request, sessionId, csv);
    expect(importedResponse.status()).toBe(201);
    const importedProject = await importedResponse.json() as { id: string };
    const objectsResponse = await page.request.get(
      `${API_BASE}/api/v1/projects/${importedProject.id}/objects`,
      { headers: { 'X-Session-Id': sessionId } },
    );
    expect(objectsResponse.status()).toBe(200);
    const importedObjects = await objectsResponse.json() as ProjectObjectRow[];
    expect(importedObjects).toHaveLength(1);
    expect(importedObjects[0].params.name).toBe(objectName);
    expect(importedObjects[0].params.ambient_temperature).toBe(-20);
    expect(importedObjects[0].params.max_ambient_temperature).toBe(0);
    expect(importedObjects[0].results).toEqual(source.results);
  });
});
