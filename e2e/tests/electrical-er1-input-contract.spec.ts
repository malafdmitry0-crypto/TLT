import { expect, test, type APIResponse, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  createCalculatedTank,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';

type ElectricalCalcResponse = {
  cable_mark: string | null;
  params?: Record<string, unknown> | null;
  results?: Record<string, unknown> | null;
};

type ElectricalErrorResponse = {
  detail?: {
    code?: string;
    message?: string;
    issues?: unknown[];
    details?: Record<string, unknown>;
  };
};

type ElectricalAssignment = {
  object_id: string;
  version: number;
  electrical_overrides: Record<string, unknown>;
};

async function setProjectCurrentLimit(page: Page, value = 80) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const headers = { 'X-Session-Id': sessionId };
  const currentResponse = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-settings`,
    { headers },
  );
  expect(currentResponse.ok()).toBeTruthy();
  const current = await currentResponse.json() as { version: number };
  const patchResponse = await page.request.patch(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-settings`,
    {
      headers,
      data: {
        expected_version: current.version,
        max_section_start_current_a: value,
      },
    },
  );
  expect(patchResponse.ok()).toBeTruthy();
}

async function initializeAndAssignEr1(page: Page, objectId: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const headers = { 'X-Session-Id': sessionId };
  const initializeResponse = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/initialize`,
    { headers },
  );
  expect(initializeResponse.ok()).toBeTruthy();
  const initialized = await initializeResponse.json() as {
    variant: { id: string; legacy_variant_number: number | null };
  };
  const variant = initialized.variant;
  expect(variant.legacy_variant_number).toBe(1);

  const assignmentsResponse = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variant.id}/assignments`,
    { headers },
  );
  expect(assignmentsResponse.ok()).toBeTruthy();
  const assignments = await assignmentsResponse.json() as {
    items: Array<{ object_id: string; version: number }>;
  };
  const assignment = assignments.items.find((item) => item.object_id === objectId);
  expect(assignment, 'созданный объект должен попасть в назначения ЭР1').toBeTruthy();

  const assignResponse = await page.request.patch(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variant.id}/assignments`,
    {
      headers,
      data: {
        system_type: 'self_regulating',
        items: [{ object_id: objectId, expected_version: assignment!.version }],
      },
    },
  );
  expect(assignResponse.ok()).toBeTruthy();

  return variant.id;
}

async function fetchAssignments(page: Page, electricalVariantId: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${electricalVariantId}/assignments`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { items: ElectricalAssignment[] };
  return payload.items;
}

async function createEmptyElectricalVariant(page: Page, name: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    {
      headers: {
        'X-Session-Id': sessionId,
        'Idempotency-Key': `e2e-er-${Date.now()}-${Math.random()}`,
      },
      data: { name },
    },
  );
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ id: string }>;
}

async function selectTtCableInEr1(
  page: Page,
  objectId: string,
  electricalVariantId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ payload: Record<string, unknown>; response: APIResponse }> {
  const { sessionId } = await currentGuestContext(page);
  const payload: Record<string, unknown> = {
    object_id: objectId,
    cable_mark: null,
    cable_source: 'builtin',
    cable_type: 'self_regulating_tt',
    variant_numbers: [1],
    electrical_variant_ids: { 1: electricalVariantId },
    selection_policy: 'technical_minimum',
    ...overrides,
  };
  const response = await page.request.post(
    `${API_BASE}/api/v1/calc/electrical/select-cable/variants`,
    {
      headers: { 'X-Session-Id': sessionId },
      data: payload,
    },
  );
  return { payload, response };
}

function expectTypedElectricalError(
  payload: ElectricalErrorResponse,
  code: string,
  details: Record<string, unknown>,
) {
  expect(payload.detail).toEqual(expect.objectContaining({
    code,
    message: expect.any(String),
    issues: [],
    details: expect.objectContaining(details),
  }));
}

function expectSuccessfulTtResult(
  response: ElectricalCalcResponse,
  expectedBaseLength: number,
) {
  expect(response.cable_mark).toMatch(/ТТ[НВХ]/);
  const results = response.results ?? {};
  const resolved = (results.resolved_inputs ?? {}) as Record<string, unknown>;
  expect(Number(resolved.base_length_m)).toBeCloseTo(expectedBaseLength, 3);
  expect(Number(resolved.maintain_temperature_c)).toBe(10);
  expect(resolved).not.toHaveProperty('nominal_voltage_v');
  expect(Number(results.voltage)).toBe(230);
}

test.describe('ЭР1: входной контракт выбора TT-кабеля', () => {
  test('pipe без обязательного T3 завершается типизированной ошибкой', async ({ page }) => {
    await loginAsGuest(page);
    const pipe = await createCalculatedPipe(page, `E2E ER1 no T3 ${Date.now()}`, {
      maintain_temperature: null,
      aggressive_product: false,
    });
    await setProjectCurrentLimit(page);
    const variantId = await initializeAndAssignEr1(page, pipe.id);

    const { payload, response } = await selectTtCableInEr1(page, pipe.id, variantId);
    expect(payload).not.toHaveProperty('supply_voltage');
    expect(payload).not.toHaveProperty('nominal_voltage_v');
    expect(response.status()).toBe(422);
    expectTypedElectricalError(
      await response.json() as ElectricalErrorResponse,
      'ELECTRICAL_INPUT_REQUIRED',
      { field: 'maintain_temperature_c' },
    );
  });

  test('цилиндрический tank считается с явными высотой обогрева и шагом укладки', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const tank = await createCalculatedTank(page, `E2E ER1 cylinder ${Date.now()}`, {
      shape: 'cylindrical',
      diameter: 2,
      height: 3,
      maintain_temperature: 10,
      aggressive_product: false,
    });
    await setProjectCurrentLimit(page);
    const variantId = await initializeAndAssignEr1(page, tank.id);

    const { payload, response } = await selectTtCableInEr1(page, tank.id, variantId, {
      heating_height: 3,
      laying_step: 0.1,
    });
    expect(payload).not.toHaveProperty('supply_voltage');
    expect(payload).not.toHaveProperty('nominal_voltage_v');
    expect(response.status()).toBe(200);
    const [calculation] = await response.json() as ElectricalCalcResponse[];
    expect(calculation).toBeTruthy();
    expectSuccessfulTtResult(calculation, (Math.PI * 2 / 2) * (3 / 0.1));
  });

  test('прямоугольный tank считается с явными высотой обогрева и шагом укладки', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const tank = await createCalculatedTank(page, `E2E ER1 rectangle ${Date.now()}`, {
      shape: 'rectangular',
      diameter: null,
      length: 4,
      width: 2,
      height: 3,
      maintain_temperature: 10,
      aggressive_product: false,
    });
    await setProjectCurrentLimit(page);
    const variantId = await initializeAndAssignEr1(page, tank.id);

    const { response } = await selectTtCableInEr1(page, tank.id, variantId, {
      heating_height: 2.5,
      laying_step: 0.2,
    });
    expect(response.status()).toBe(200);
    const [calculation] = await response.json() as ElectricalCalcResponse[];
    expect(calculation).toBeTruthy();
    const perimeter = 2 * (4 + 2);
    expectSuccessfulTtResult(calculation, (perimeter / 2) * (2.5 / 0.2));
  });

  test('сферический tank завершается fail-closed ошибкой без выдуманной раскладки', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const tank = await createCalculatedTank(page, `E2E ER1 sphere ${Date.now()}`, {
      shape: 'spherical',
      diameter: 3,
      height: null,
      maintain_temperature: 10,
      aggressive_product: false,
    });
    await setProjectCurrentLimit(page);
    const variantId = await initializeAndAssignEr1(page, tank.id);

    const { response } = await selectTtCableInEr1(page, tank.id, variantId, {
      heating_height: 2,
      laying_step: 0.1,
    });
    expect(response.status()).toBe(422);
    expectTypedElectricalError(
      await response.json() as ElectricalErrorResponse,
      'ELECTRICAL_TANK_SHAPE_UNSUPPORTED',
      { shape: 'spherical' },
    );
  });

  test('per-object overrides применяются только в точном UUID ЭР без explicit selector inputs', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const target = await createCalculatedTank(page, `E2E ER1 assignment target ${Date.now()}`, {
      shape: 'cylindrical',
      diameter: 2,
      height: 3,
      process_temperature: 50,
      maintain_temperature: 5,
      aggressive_product: false,
    });
    const neighbor = await createCalculatedPipe(page, `E2E ER1 assignment neighbor ${Date.now()}`, {
      maintain_temperature: 20,
      aggressive_product: false,
    });
    await setProjectCurrentLimit(page);
    const firstVariantId = await initializeAndAssignEr1(page, target.id);
    const secondVariant = await createEmptyElectricalVariant(
      page,
      `ЭР isolation ${Date.now()}`,
    );

    const firstBefore = await fetchAssignments(page, firstVariantId);
    const secondBefore = await fetchAssignments(page, secondVariant.id);
    const targetFirst = firstBefore.find((item) => item.object_id === target.id);
    const neighborFirst = firstBefore.find((item) => item.object_id === neighbor.id);
    const targetSecond = secondBefore.find((item) => item.object_id === target.id);
    expect(targetFirst).toBeTruthy();
    expect(neighborFirst).toBeTruthy();
    expect(targetSecond).toBeTruthy();
    expect(targetFirst!.electrical_overrides).toEqual({});
    expect(neighborFirst!.electrical_overrides).toEqual({});
    expect(targetSecond!.electrical_overrides).toEqual({});

    const { projectId, sessionId } = await currentGuestContext(page);
    const overrideUrl = (
      `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${firstVariantId}`
      + `/assignments/${target.id}/electrical-overrides`
    );
    const forbiddenVoltage = await page.request.patch(overrideUrl, {
      headers: { 'X-Session-Id': sessionId },
      data: {
        expected_version: targetFirst!.version,
        supply_voltage: 230,
      },
    });
    expect(forbiddenVoltage.status()).toBe(422);
    const forbiddenBody = await forbiddenVoltage.json() as {
      detail?: string;
      error_code?: string;
      fields?: Record<string, string>;
    };
    expect(forbiddenBody).toEqual(expect.objectContaining({
      detail: 'Ошибка валидации входных данных',
      error_code: 'VALIDATION_ERROR',
      fields: expect.objectContaining({
        'body.supply_voltage': 'Extra inputs are not permitted',
      }),
    }));

    const patchResponse = await page.request.patch(overrideUrl, {
      headers: { 'X-Session-Id': sessionId },
      data: {
        expected_version: targetFirst!.version,
        maintain_temperature_c: 12,
        aggressive_product: true,
        tank_heating_height_m: 2.4,
        tank_laying_step_m: 0.2,
      },
    });
    expect(patchResponse.status()).toBe(200);
    const patched = await patchResponse.json() as ElectricalAssignment;
    expect(patched.electrical_overrides).toEqual({
      maintain_temperature_c: '12',
      aggressive_product: true,
      tank_heating_height_m: '2.4',
      tank_laying_step_m: '0.2',
    });
    expect(patched.electrical_overrides).not.toHaveProperty('supply_voltage');
    expect(patched.electrical_overrides).not.toHaveProperty('nominal_voltage_v');

    const firstAfter = await fetchAssignments(page, firstVariantId);
    const secondAfter = await fetchAssignments(page, secondVariant.id);
    expect(firstAfter.find((item) => item.object_id === target.id)?.electrical_overrides)
      .toEqual(patched.electrical_overrides);
    const neighborAfter = firstAfter.find((item) => item.object_id === neighbor.id);
    const targetSecondAfter = secondAfter.find((item) => item.object_id === target.id);
    expect(neighborAfter?.electrical_overrides).toEqual({});
    expect(neighborAfter?.version).toBe(neighborFirst!.version);
    expect(targetSecondAfter?.electrical_overrides).toEqual({});
    expect(targetSecondAfter?.version).toBe(targetSecond!.version);

    const { payload, response } = await selectTtCableInEr1(
      page,
      target.id,
      firstVariantId,
    );
    for (const absentKey of [
      'maintain_temperature',
      'aggressive_product',
      'heating_height',
      'laying_step',
      'supply_voltage',
      'nominal_voltage_v',
    ]) {
      expect(payload).not.toHaveProperty(absentKey);
    }
    expect(response.status()).toBe(200);
    const [calculation] = await response.json() as ElectricalCalcResponse[];
    expect(calculation).toBeTruthy();
    const results = calculation.results ?? {};
    const resolved = (results.resolved_inputs ?? {}) as Record<string, unknown>;
    const sources = (results.input_sources ?? {}) as Record<string, unknown>;
    expect(Number(resolved.maintain_temperature_c)).toBe(12);
    expect(resolved.aggressive_product).toBe(true);
    expect(sources.maintain_temperature_c).toBe('assignment_override');
    expect(sources.aggressive_product).toBe('assignment_override');
    expect(sources.base_length_m).toBe('assignment_layout');
    expect(Number(resolved.base_length_m)).toBeCloseTo(
      (Math.PI * 2 / 2) * (2.4 / 0.2),
      3,
    );
    const tankLayout = (results.layout as { tank?: Record<string, unknown> } | undefined)?.tank;
    expect(tankLayout).toEqual(expect.objectContaining({
      shape: 'cylindrical',
      heating_height_m: 2.4,
      laying_step_m: 0.2,
      base_length_source: 'assignment_layout',
    }));
    expect(resolved).not.toHaveProperty('nominal_voltage_v');
    expect(Number(results.voltage)).toBe(230);
  });
});
