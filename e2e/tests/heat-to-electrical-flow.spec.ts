/**
 * Сквозной путь: теплопотери → электротехнический расчёт (кейс 1 §5.13 → §6).
 *
 * Отдельные этапы уже покрыты: `heat-calculation.spec.ts` — форма и таблица
 * теплопотерь, `elec-calculation.spec.ts` — расчёт на странице ЭР. Здесь
 * проверяется стык между ними, которого не видно ни одному из них:
 *   1. объект, созданный в форме теплопотерь, получает результат расчёта;
 *   2. кнопка «Далее» переносит его в ЭР со статусом «Нераспределён» (§5.13);
 *   3. после распределения и пересчёта кабель подбирается по этим теплопотерям;
 *   4. правка исходных данных помечает электрорасчёт устаревшим — «любое
 *      изменение исходных параметров приводит к пересчёту зависимых».
 */
import { expect, test, type Page } from '@playwright/test';

import {
  API_BASE,
  currentGuestContext,
  fetchProjectObjects,
  loginAsGuest,
} from './helpers/workspace';
import {
  fillInput,
  openPipeForm,
  selectOption,
  selectSearchOption,
} from './helpers/inline-form-dependencies';
import { expectElectricalCalcForObject, fetchElectricalCalcs } from './helpers/electrical-glide';

/** Труба целиком через форму исходных данных, без API-ярлыков. */
async function createPipeThroughForm(page: Page, name: string) {
  await openPipeForm(page);
  await page.getByTestId('object-name-input').fill(name);
  await fillInput(page, 'outer-diameter-input', '108');
  await fillInput(page, 'pipe-length-input', '30');
  await fillInput(page, 'wall-thickness-input', '6');
  await selectSearchOption(page, 'pipe-material-select', 'Углеродистая', /Углеродистая/);
  await selectOption(page, 'placement-select', 'На открытом воздухе');
  await fillInput(page, 'insulation-thickness-input', '40');
  await fillInput(page, 'ambient-temperature-input', '-25');
  await fillInput(page, 'min-switch-temperature-input', '-25');
  await fillInput(page, 'wind-speed-input', '3');
  await fillInput(page, 'process-temperature-input', '80');
  await selectOption(page, 'steam-tracing-select', 'Нет');
  await expect(page.getByTestId('vapor-temperature-input')).toHaveCount(0);
  await fillInput(page, 'maintain-temperature-input', '10');
  await expect(page.getByTestId('aggressive-product-select')).toHaveCount(0);
  await expect(page.getByTestId('connection-type-select')).toHaveCount(0);
  await expect(page.getByTestId('supply-voltage-select')).toHaveCount(0);
  // материал изоляции выбираем последним: справочник отбирает материалы по
  // температуре продукта, до её ввода список пуст
  await selectSearchOption(page, 'insulation-material-select', 'минераловат', /минераловатные/i);
  const createRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && /\/api\/v1\/projects\/[^/]+\/objects$/.test(request.url()),
  );
  await page.locator('#inline-object-save').dispatchEvent('click');
  const createPayload = (await createRequestPromise).postDataJSON() as {
    params?: Record<string, unknown>;
  };
  expect(createPayload.params).toEqual(expect.objectContaining({
    process_temperature: 80,
    ambient_temperature: -25,
    min_switch_temperature: -25,
    steam_tracing: 'no',
    maintain_temperature: 10,
  }));
  expect(createPayload.params).not.toHaveProperty('vapor_temperature');
  expect(createPayload.params).not.toHaveProperty('aggressive_product');
  expect(createPayload.params).not.toHaveProperty('connection_type');
  expect(createPayload.params).not.toHaveProperty('winding_coefficient');
  expect(createPayload.params).not.toHaveProperty('supply_voltage');
  expect(createPayload.params).not.toHaveProperty('nominal_voltage_v');

  // таблица объектов рисуется на canvas — проверяем через API, а не по тексту
  let created: Awaited<ReturnType<typeof fetchProjectObjects>>[number] | undefined;
  await expect.poll(async () => {
    created = (await fetchProjectObjects(page)).find((item) => item.params.name === name);
    return Boolean(created);
  }, { timeout: 15_000 }).toBe(true);
  return created!;
}

async function electricalVariantId(page: Page) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(response.ok()).toBeTruthy();
  const variants = await response.json() as Array<{ id: string }>;
  expect(variants[0]?.id, 'ЭР1 должен быть создан переходом со страницы теплопотерь').toBeTruthy();
  return variants[0].id;
}

async function fetchAssignment(page: Page, variantId: string, objectId: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variantId}/assignments`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as {
    items: Array<{ object_id: string; version: number; assignment_state?: string }>;
  };
  return payload.items.find((item) => item.object_id === objectId);
}

/** Распределение в самрег: в UI это выбор системы обогрева для объекта. */
async function assignToSelfRegulating(page: Page, variantId: string, objectId: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const assignment = await fetchAssignment(page, variantId, objectId);
  expect(assignment, 'объект должен быть в списке ЭР').toBeTruthy();

  const response = await page.request.patch(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variantId}/assignments`,
    {
      headers: { 'X-Session-Id': sessionId },
      data: {
        system_type: 'self_regulating',
        items: [{ object_id: objectId, expected_version: assignment!.version }],
      },
    },
  );
  expect(response.ok()).toBeTruthy();
}

async function recalculateCurrentEr(page: Page) {
  await page.getByRole('button', { name: /Пересчитать все · ЭР1/i }).click();
  await page.getByRole('button', { name: /Да, пересчитать все/i }).click();
}

test.describe('сквозной расчёт: теплопотери → электрорасчёт', () => {
  test('объект из формы теплопотерь доходит до подобранного кабеля', async ({ page }) => {
    await loginAsGuest(page);
    const name = `E2E сквозной ${Date.now()}`;

    // --- 1. Теплопотери ---
    const pipe = await createPipeThroughForm(page, name);
    expect(pipe.is_valid, 'теплопотери должны быть рассчитаны').toBe(true);
    const heatLoss = Number((pipe.results as Record<string, number>)?.total_heat_loss_design);
    expect(heatLoss).toBeGreaterThan(0);

    // --- 2. Переход по §5.13 ---
    const continueButton = page.getByTestId('heat-continue-to-electrical');
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expect(page).toHaveURL(/\/workspace\/elec/);

    // объекты копируются в ЭР и получают первоначальный статус «Нераспределён»
    const variantId = await electricalVariantId(page);
    const initial = await fetchAssignment(page, variantId, pipe.id);
    expect(initial, 'объект должен быть скопирован в ЭР').toBeTruthy();
    expect(initial!.assignment_state).toBe('unassigned');

    const { projectId, sessionId } = await currentGuestContext(page);
    const beforeCalc = await fetchElectricalCalcs(page, projectId, sessionId);
    expect(
      beforeCalc.some((row) => row.object_id === pipe.id),
      'до распределения расчёта по объекту быть не должно',
    ).toBe(false);

    // --- 3. Электрорасчёт ---
    await page.getByTestId('elec-idop-input').fill('80');
    await page.getByTestId('elec-idop-save').click();
    await expect(page.getByText('Iдоп не задан')).toHaveCount(0);

    await assignToSelfRegulating(page, variantId, pipe.id);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: /Самрег 1 объект/i })).toBeVisible();
    await expect(
      page.getByRole('spinbutton', { name: 'Напряжение питания' }).first(),
    ).toHaveValue('230');

    const batchRequestPromise = page.waitForRequest((request) =>
      request.method() === 'POST' && request.url().includes('/api/v1/calc/electrical/batch/jobs'),
    );
    await recalculateCurrentEr(page);
    const batchPayload = (await batchRequestPromise).postDataJSON() as Record<string, unknown>;
    expect(batchPayload).toEqual(expect.objectContaining({ supply_voltage: 230 }));
    expect(batchPayload).not.toHaveProperty('nominal_voltage_v');
    expect(batchPayload).not.toHaveProperty('maintain_temperature');
    expect(batchPayload).not.toHaveProperty('vapor_temperature');
    expect(batchPayload).not.toHaveProperty('aggressive_product');
    expect(batchPayload).not.toHaveProperty('connection_type');
    expect(batchPayload).not.toHaveProperty('winding_coefficient');

    const calc = await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id);
    expect(calc.cable_mark, 'должна быть подобрана марка кабеля').toMatch(/ТТ[НВХ]/);
    const results = (calc.results ?? {}) as Record<string, number>;
    const cableLength = Number(results.order_cable_length ?? results.cable_length);
    expect(cableLength).toBeGreaterThan(0);
    expect(Number(results.total_power)).toBeGreaterThan(0);
    expect(Number(results.current)).toBeGreaterThan(0);
    const resolvedInputs = (results.resolved_inputs ?? {}) as Record<string, unknown>;
    expect(Number(resolvedInputs.product_temperature_c)).toBe(80);
    expect(Number(resolvedInputs.ambient_temperature_c)).toBe(-25);
    expect(Number(resolvedInputs.cold_start_temperature_c)).toBe(-25);
    expect(Number(resolvedInputs.nominal_voltage_v)).toBe(230);
    for (const key of ['steam_temperature_c', 'maintain_temperature_c', 'aggressive_product']) {
      expect(resolvedInputs).not.toHaveProperty(key);
    }
    // кабель кладётся на трубу целиком: длина не меньше длины участка
    expect(cableLength).toBeGreaterThanOrEqual(30);

    await expect(
      page.getByTestId('elec-summary-self_regulating-objects').locator('.elec-summary-card__value'),
    ).toHaveText('1', { timeout: 20_000 });
  });

  test('правка исходных данных помечает электрорасчёт устаревшим', async ({ page }) => {
    await loginAsGuest(page);
    const name = `E2E пересчёт ${Date.now()}`;

    const pipe = await createPipeThroughForm(page, name);
    await page.getByTestId('heat-continue-to-electrical').click();
    await expect(page).toHaveURL(/\/workspace\/elec/);

    const variantId = await electricalVariantId(page);
    await page.getByTestId('elec-idop-input').fill('80');
    await page.getByTestId('elec-idop-save').click();
    await assignToSelfRegulating(page, variantId, pipe.id);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await recalculateCurrentEr(page);

    const { projectId, sessionId } = await currentGuestContext(page);
    const calc = await expectElectricalCalcForObject(page, projectId, sessionId, pipe.id);
    expect((calc.results as Record<string, unknown>)?.stale ?? false).toBeFalsy();

    // §5.13: изменение исходных параметров делает зависимый расчёт неактуальным
    const current = (await fetchProjectObjects(page)).find((item) => item.id === pipe.id)!;
    const update = await page.request.put(
      `${API_BASE}/api/v1/projects/${projectId}/objects/${pipe.id}`,
      {
        headers: { 'X-Session-Id': sessionId },
        data: {
          version: (current as { version: number }).version,
          params: { ...current.params, process_temperature: 120 },
        },
      },
    );
    expect(update.ok()).toBeTruthy();

    await expect.poll(async () => {
      const rows = await fetchElectricalCalcs(page, projectId, sessionId);
      const row = rows.find((item) => item.object_id === pipe.id);
      return (row?.results as Record<string, unknown> | undefined)?.stale ?? false;
    }, { timeout: 20_000 }).toBe(true);
  });
});
