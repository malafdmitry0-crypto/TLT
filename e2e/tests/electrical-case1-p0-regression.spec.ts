import { expect, test, type APIResponse, type Page } from '@playwright/test';

import {
  API_BASE,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';
import { openTankForm } from './helpers/inline-form-dependencies';

const DESKTOP_VIEWPORT = { width: 1440, height: 1000 };
const LEGACY_SELECTOR_KEYS = [
  'maintain_temperature',
  'aggressive_product',
  'steam_tracing',
  'vapor_temperature',
  'winding_coefficient',
  'connection_type',
] as const;

type ElectricalVariant = {
  id: string;
  legacy_variant_number: number | null;
};

type ElectricalAssignment = {
  object_id: string;
  version: number;
  electrical_overrides?: Record<string, unknown>;
};

type CableOption = {
  model: string | null;
  base_model: string | null;
  passport_power_w_per_m: number | null;
  max_product_temperature_c: number | null;
  min_ambient_temperature_c: number | null;
  nomenclature_code: string | null;
  eligible: boolean;
  unavailable_reason: string | null;
};

type TtReferenceRow = {
  model: string;
  nominal_power: number;
  max_product_temp: number;
};

type ElectricalCalculation = {
  cable_mark: string | null;
  results?: Record<string, unknown> | null;
};

type ElectricalError = {
  detail?: {
    code?: string;
    message?: string;
    issues?: unknown[];
    details?: Record<string, unknown>;
  };
};

type SelectorOverrides = {
  supply_voltage: number;
  cable_mark?: string | null;
  selection_mode?: 'auto' | 'manual';
  number_of_threads?: number;
  heating_height?: number;
  laying_step?: number;
};

type PassportCandidate = {
  fullMark: string;
  baseModel: string;
  nominalPower: number;
  threads: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function numeric(record: Record<string, unknown>, key: string): number {
  const value = Number(record[key]);
  expect(Number.isFinite(value), `${key} must be numeric`).toBe(true);
  return value;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function expectCleanCase1RequestParams(params: Record<string, unknown> | undefined) {
  const source = params ?? {};
  for (const key of LEGACY_SELECTOR_KEYS) {
    expect(source).not.toHaveProperty(key);
  }
}

function baseCableModel(calculation: ElectricalCalculation): string {
  const results = asRecord(calculation.results);
  const model = results.cable_model ?? results.selected_cable;
  expect(typeof model).toBe('string');
  return String(model);
}

function resultParts(calculation: ElectricalCalculation) {
  const results = asRecord(calculation.results);
  return {
    results,
    resolved: asRecord(results.resolved_inputs),
    electrical: asRecord(results.electrical),
    layout: asRecord(results.layout),
    cable: asRecord(results.cable),
  };
}

async function guestHeaders(page: Page) {
  const { projectId, sessionId } = await currentGuestContext(page);
  return {
    projectId,
    headers: { 'X-Session-Id': sessionId },
  };
}

async function setProjectCurrentLimit(page: Page, value = 80) {
  const { projectId, headers } = await guestHeaders(page);
  const currentResponse = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-settings`,
    { headers },
  );
  expect(currentResponse.ok()).toBeTruthy();
  const current = await currentResponse.json() as { version: number };
  const updateResponse = await page.request.patch(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-settings`,
    {
      headers,
      data: {
        expected_version: current.version,
        max_section_start_current_a: value,
      },
    },
  );
  expect(updateResponse.status()).toBe(200);
}

async function createCase1Pipe(
  page: Page,
  name: string,
  params: Record<string, unknown> = {},
) {
  const { projectId, headers } = await guestHeaders(page);
  const requestParams = {
    name,
    outer_diameter: 0.108,
    wall_thickness: 0.006,
    pipe_material: 'carbon_steel',
    pipe_length: 50,
    insulation_layers: [
      { thickness: 0.05, material: 'mineral_wool_boards_120' },
    ],
    insulation_temperature_basis: 'outdoor_winter',
    ambient_temperature: -30,
    min_switch_temperature: -30,
    process_temperature: 80,
    placement: 'outdoor',
    wind_speed: 3,
    safety_factor: 1.1,
    ...params,
  };
  expectCleanCase1RequestParams(requestParams);
  const response = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/objects`,
    {
      headers,
      data: {
        object_type: 'pipe',
        params: requestParams,
      },
    },
  );
  expect(response.status()).toBe(201);
  const object = await response.json() as {
    id: string;
    is_valid: boolean;
    params?: Record<string, unknown>;
    results?: Record<string, unknown> | null;
  };
  expect(object.is_valid).toBe(true);
  expect(Number(object.results?.total_heat_loss_design)).toBeGreaterThan(0);
  return object;
}

async function createCase1Tank(
  page: Page,
  name: string,
  params: Record<string, unknown>,
) {
  const { projectId, headers } = await guestHeaders(page);
  const requestParams = {
    name,
    insulation_layers: [
      { thickness: 0.08, material: 'mineral_wool_boards_120' },
    ],
    insulation_temperature_basis: 'outdoor_winter',
    ambient_temperature: -20,
    min_switch_temperature: -20,
    process_temperature: 80,
    placement: 'outdoor',
    wind_speed: 3,
    safety_factor: 1.1,
    q_additional: 0,
    ...params,
  };
  expectCleanCase1RequestParams(requestParams);
  expect(Number.isFinite(Number(requestParams.min_switch_temperature))).toBe(true);
  const response = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/objects`,
    {
      headers,
      data: { object_type: 'tank', params: requestParams },
    },
  );
  const body = await response.json() as {
    id: string;
    is_valid: boolean;
    params?: Record<string, unknown>;
    results?: Record<string, unknown> | null;
  };
  expect(response.status(), JSON.stringify(body)).toBe(201);
  expect(body.is_valid).toBe(true);
  expect(Number(body.results?.total_heat_loss_design)).toBeGreaterThan(0);
  return body;
}

async function initializeElectricalVariant(page: Page): Promise<ElectricalVariant> {
  const { projectId, headers } = await guestHeaders(page);
  const response = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/initialize`,
    { headers },
  );
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { variant: ElectricalVariant };
  expect(payload.variant.legacy_variant_number).toBe(1);
  return payload.variant;
}

async function createElectricalVariant(page: Page, name: string): Promise<ElectricalVariant> {
  const { projectId, headers } = await guestHeaders(page);
  const response = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    {
      headers: {
        ...headers,
        'Idempotency-Key': `case1-p0-er-${Date.now()}-${Math.random()}`,
      },
      data: { name },
    },
  );
  expect(response.status()).toBe(201);
  const variant = await response.json() as ElectricalVariant;
  expect(variant.legacy_variant_number).toBeGreaterThan(1);
  return variant;
}

async function assignObjects(
  page: Page,
  electricalVariantId: string,
  objectIds: string[],
) {
  const { projectId, headers } = await guestHeaders(page);
  const assignmentsResponse = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${electricalVariantId}/assignments`,
    { headers },
  );
  expect(assignmentsResponse.ok()).toBeTruthy();
  const payload = await assignmentsResponse.json() as { items: ElectricalAssignment[] };
  const byObjectId = new Map(payload.items.map((item) => [item.object_id, item]));
  const items = objectIds.map((objectId) => {
    const assignment = byObjectId.get(objectId);
    expect(assignment, `assignment for ${objectId}`).toBeTruthy();
    return { object_id: objectId, expected_version: assignment!.version };
  });
  const response = await page.request.patch(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${electricalVariantId}/assignments`,
    {
      headers,
      data: { system_type: 'self_regulating', items },
    },
  );
  expect(response.status()).toBe(200);
}

async function patchElectricalOverrides(
  page: Page,
  electricalVariantId: string,
  objectId: string,
  overrides: Record<string, unknown>,
) {
  const { projectId, headers } = await guestHeaders(page);
  const assignmentsResponse = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${electricalVariantId}/assignments`,
    { headers },
  );
  expect(assignmentsResponse.ok()).toBeTruthy();
  const payload = await assignmentsResponse.json() as { items: ElectricalAssignment[] };
  const assignment = payload.items.find((item) => item.object_id === objectId);
  expect(assignment).toBeTruthy();
  const response = await page.request.patch(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${electricalVariantId}`
      + `/assignments/${objectId}/electrical-overrides`,
    {
      headers,
      data: { expected_version: assignment!.version, ...overrides },
    },
  );
  expect(response.status()).toBe(200);
}

async function assignmentForObject(
  page: Page,
  electricalVariantId: string,
  objectId: string,
): Promise<ElectricalAssignment> {
  const { projectId, headers } = await guestHeaders(page);
  const response = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${electricalVariantId}/assignments`,
    { headers },
  );
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { items: ElectricalAssignment[] };
  const assignment = payload.items.find((item) => item.object_id === objectId);
  expect(assignment, `assignment for ${objectId}`).toBeTruthy();
  return assignment!;
}

async function cableOptions(
  page: Page,
  objectId: string,
  electricalVariantId: string,
): Promise<CableOption[]> {
  const { headers } = await guestHeaders(page);
  const response = await page.request.get(
    `${API_BASE}/api/v1/calc/cable-options/${objectId}`,
    {
      headers,
      params: { electrical_variant_id: electricalVariantId },
    },
  );
  expect(response.status()).toBe(200);
  const options = await response.json() as CableOption[];
  expect(options.length).toBeGreaterThan(1);
  return options;
}

async function ttReference(page: Page): Promise<TtReferenceRow[]> {
  const { headers } = await guestHeaders(page);
  const response = await page.request.get(`${API_BASE}/api/v1/references/tt-cables`, { headers });
  expect(response.status()).toBe(200);
  return response.json() as Promise<TtReferenceRow[]>;
}

async function selectTtCable(
  page: Page,
  objectId: string,
  variant: ElectricalVariant,
  overrides: SelectorOverrides,
): Promise<{ payload: Record<string, unknown>; response: APIResponse }> {
  expect(variant.legacy_variant_number).toBeTruthy();
  const { headers } = await guestHeaders(page);
  const variantNumber = variant.legacy_variant_number!;
  const payload: Record<string, unknown> = {
    object_id: objectId,
    cable_mark: null,
    cable_source: 'builtin',
    cable_type: 'self_regulating_tt',
    variant_numbers: [variantNumber],
    electrical_variant_ids: { [variantNumber]: variant.id },
    selection_mode: 'auto',
    selection_policy: 'technical_minimum',
    ...overrides,
  };
  const response = await page.request.post(
    `${API_BASE}/api/v1/calc/electrical/select-cable/variants`,
    { headers, data: payload },
  );
  return { payload, response };
}

async function successfulCalculation(response: APIResponse): Promise<ElectricalCalculation> {
  expect(response.status()).toBe(200);
  const payload = await response.json() as ElectricalCalculation[];
  expect(payload).toHaveLength(1);
  expect(payload[0]?.cable_mark).toMatch(/ТТ[НВХ]/);
  return payload[0]!;
}

function expectedPassportCandidate(
  options: CableOption[],
  requiredPowerPerMeter: number,
  windingFactor: number,
): PassportCandidate {
  const candidates: PassportCandidate[] = [];
  for (const option of options) {
    if (!option.eligible || !option.model || !option.base_model) continue;
    const nominalPower = Number(option.passport_power_w_per_m);
    if (!Number.isFinite(nominalPower) || nominalPower <= 0) continue;
    for (const threads of [1, 2, 3]) {
      if (nominalPower * windingFactor * threads >= requiredPowerPerMeter) {
        candidates.push({
          fullMark: option.model,
          baseModel: option.base_model,
          nominalPower,
          threads,
        });
      }
    }
  }
  expect(candidates.length, 'fixture must have a passport-power candidate').toBeGreaterThan(0);
  candidates.sort((left, right) => (
    left.threads - right.threads
      || left.nominalPower - right.nominalPower
      || left.nominalPower * left.threads - right.nominalPower * right.threads
      || compareText(left.fullMark, right.fullMark)
  ));
  return candidates[0]!;
}

function requiredPowerPerMeter(calculation: ElectricalCalculation): {
  required: number;
  windingFactor: number;
} {
  const { resolved, layout } = resultParts(calculation);
  return {
    required: numeric(resolved, 'heat_loss_per_meter_w') * numeric(resolved, 'safety_factor'),
    windingFactor: numeric(layout, 'winding_factor'),
  };
}

test.describe('Case 1 P0: паспортный TT-selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await loginAsGuest(page);
  });

  test('auto перебирает все eligible строки и выбирает по паспортной мощности', async ({
    page,
  }) => {
    const pipe = await createCase1Pipe(page, `Case1 passport auto ${Date.now()}`, {
      process_temperature: 20,
      ambient_temperature: -40,
      min_switch_temperature: -40,
      outer_diameter: 0.3,
      insulation_layers: [
        { thickness: 0.02, material: 'mineral_wool_boards_120' },
      ],
    });
    await setProjectCurrentLimit(page);
    const variant = await initializeElectricalVariant(page);
    await assignObjects(page, variant.id, [pipe.id]);

    const options = await cableOptions(page, pipe.id, variant.id);
    const eligible = options.filter((option) => option.eligible);
    expect(eligible.length).toBeGreaterThan(1);
    expect(eligible).toHaveLength(options.length);
    for (const option of eligible) {
      expect(20).toBeLessThanOrEqual(Number(option.max_product_temperature_c));
      expect(-40).toBeGreaterThanOrEqual(Number(option.min_ambient_temperature_c));
    }

    const { payload, response } = await selectTtCable(page, pipe.id, variant, {
      supply_voltage: 230,
    });
    for (const obsoleteInput of [
      'maintain_temperature',
      'maintain_temperature_c',
      'vapor_temperature',
      'steam_temperature_c',
      'aggressive_product',
      'winding_coefficient',
      'connection_type',
    ]) {
      expect(payload).not.toHaveProperty(obsoleteInput);
    }
    const calculation = await successfulCalculation(response);
    const { required, windingFactor } = requiredPowerPerMeter(calculation);
    const expectedCandidate = expectedPassportCandidate(options, required, windingFactor);
    const { results, resolved, cable } = resultParts(calculation);
    for (const obsoleteCanonical of [
      'maintain_temperature_c',
      'steam_temperature_c',
      'aggressive_product',
    ]) {
      expect(resolved).not.toHaveProperty(obsoleteCanonical);
    }
    const lowestTemperatureCeiling = Math.min(
      ...eligible.map((option) => Number(option.max_product_temperature_c)),
    );
    const lowestBandMaximum = Math.max(
      ...eligible
        .filter((option) => Number(option.max_product_temperature_c) === lowestTemperatureCeiling)
        .map((option) => Number(option.passport_power_w_per_m) * 3),
    );
    expect(required, 'fixture must exhaust the whole lowest-temperature cable band').toBeGreaterThan(
      lowestBandMaximum,
    );

    expect(calculation.cable_mark).toBe(expectedCandidate.fullMark);
    expect(baseCableModel(calculation)).toBe(expectedCandidate.baseModel);
    expect(numeric(results, 'num_circuits')).toBe(expectedCandidate.threads);
    expect(numeric(results, 'power_per_meter')).toBeCloseTo(expectedCandidate.nominalPower, 6);
    expect(numeric(cable, 'passport_power_w_per_m')).toBeCloseTo(
      expectedCandidate.nominalPower,
      6,
    );

    const selectedOption = eligible.find((option) => option.model === expectedCandidate.fullMark)!;
    expect(selectedOption).toBeTruthy();
    expect(Number(selectedOption.max_product_temperature_c)).toBeGreaterThan(
      lowestTemperatureCeiling,
    );
    expect(selectedOption.nomenclature_code).toEqual(expect.any(String));
  });

  test('manual-марка без N проверяется как одна нитка и не эскалирует молча до 2/3', async ({
    page,
  }) => {
    const pipe = await createCase1Pipe(page, `Case1 manual N ${Date.now()}`, {
      min_switch_temperature: -30,
    });
    await setProjectCurrentLimit(page);
    const variant = await initializeElectricalVariant(page);
    await assignObjects(page, variant.id, [pipe.id]);

    const options = await cableOptions(page, pipe.id, variant.id);
    const baseline = await successfulCalculation((await selectTtCable(
      page,
      pipe.id,
      variant,
      { supply_voltage: 230 },
    )).response);
    const { required, windingFactor } = requiredPowerPerMeter(baseline);
    const manualChoices = options
      .filter((option): option is CableOption & {
        model: string;
        base_model: string;
        passport_power_w_per_m: number;
      } => (
        option.eligible
          && typeof option.model === 'string'
          && typeof option.base_model === 'string'
          && Number.isFinite(Number(option.passport_power_w_per_m))
      ))
      .flatMap((option) => [2, 3].map((threads) => ({
        fullMark: option.model,
        baseModel: option.base_model,
        nominalPower: Number(option.passport_power_w_per_m),
        threads,
      })))
      .filter((candidate) => (
        candidate.nominalPower * windingFactor < required
          && candidate.nominalPower * windingFactor * candidate.threads >= required
      ))
      .sort((left, right) => (
        left.threads - right.threads
          || left.nominalPower - right.nominalPower
          || compareText(left.fullMark, right.fullMark)
      ));
    expect(
      manualChoices.length,
      'fixture must include a manual model that needs exactly two or three threads',
    ).toBeGreaterThan(0);
    const manual = manualChoices[0]!;

    const failed = await selectTtCable(page, pipe.id, variant, {
      cable_mark: manual.fullMark,
      selection_mode: 'manual',
      supply_voltage: 230,
    });
    expect(failed.payload).not.toHaveProperty('number_of_threads');
    expect(failed.payload).not.toHaveProperty('thread_count');
    expect(failed.response.status()).toBe(422);
    const error = await failed.response.json() as ElectricalError;
    expect(error.detail).toEqual(expect.objectContaining({
      code: 'ELECTRICAL_CABLE_POWER_INSUFFICIENT',
      message: expect.any(String),
      issues: [],
      details: expect.objectContaining({
        maximum_threads: 1,
        manual_cable_model: manual.fullMark,
      }),
    }));

    const explicit = await successfulCalculation((await selectTtCable(
      page,
      pipe.id,
      variant,
      {
        cable_mark: manual.fullMark,
        selection_mode: 'manual',
        number_of_threads: manual.threads,
        supply_voltage: 230,
      },
    )).response);
    const { results, layout } = resultParts(explicit);
    expect(explicit.cable_mark).toBe(manual.fullMark);
    expect(baseCableModel(explicit)).toBe(manual.baseModel);
    expect(numeric(results, 'num_circuits')).toBe(manual.threads);
    expect(numeric(layout, 'requested_threads')).toBe(manual.threads);
    expect(layout.thread_selection_source).toBe('manual');
  });

  test('точное T_product == T_max паспортной строки разрешено', async ({ page }) => {
    const references = await ttReference(page);
    const boundary = references
      .filter((row) => Number.isFinite(row.max_product_temp) && row.max_product_temp > 0)
      .sort((left, right) => (
        right.max_product_temp - left.max_product_temp
          || right.nominal_power - left.nominal_power
          || compareText(left.model, right.model)
      ))[0];
    expect(boundary).toBeTruthy();

    const pipe = await createCase1Pipe(page, `Case1 T max equality ${Date.now()}`, {
      process_temperature: boundary!.max_product_temp,
      ambient_temperature: -20,
      min_switch_temperature: -20,
      insulation_layers: [
        { thickness: 0.2, material: 'mineral_wool_boards_120' },
      ],
    });
    await setProjectCurrentLimit(page);
    const variant = await initializeElectricalVariant(page);
    await assignObjects(page, variant.id, [pipe.id]);

    const options = await cableOptions(page, pipe.id, variant.id);
    const exactBoundary = options
      .filter((option) => (
        option.base_model === boundary!.model
          && Number(option.max_product_temperature_c) === boundary!.max_product_temp
      ))
      .sort((left, right) => (
        Number(right.passport_power_w_per_m) - Number(left.passport_power_w_per_m)
          || compareText(String(left.model), String(right.model))
      ))[0];
    expect(exactBoundary, 'options must expose an exact full mark at T_product == T_max').toBeTruthy();
    expect(exactBoundary!.eligible).toBe(true);
    expect(exactBoundary!.nomenclature_code).toEqual(expect.any(String));
    const calculation = await successfulCalculation((await selectTtCable(
      page,
      pipe.id,
      variant,
      {
        cable_mark: exactBoundary!.model,
        selection_mode: 'manual',
        number_of_threads: 3,
        supply_voltage: 230,
      },
    )).response);
    const { resolved } = resultParts(calculation);
    expect(numeric(resolved, 'product_temperature_c')).toBe(boundary!.max_product_temp);
    expect(calculation.cable_mark).toBe(exactBoundary!.model);
    expect(baseCableModel(calculation)).toBe(boundary!.model);
  });

  test('напряжение меняет downstream-ток, но не выбранный кабель', async ({ page }) => {
    const pipe = await createCase1Pipe(page, `Case1 voltage downstream ${Date.now()}`, {
      min_switch_temperature: -30,
    });
    await setProjectCurrentLimit(page);
    const firstVariant = await initializeElectricalVariant(page);
    const secondVariant = await createElectricalVariant(page, `Case1 U2 ${Date.now()}`);
    await assignObjects(page, firstVariant.id, [pipe.id]);
    await assignObjects(page, secondVariant.id, [pipe.id]);

    const at230 = await successfulCalculation((await selectTtCable(
      page,
      pipe.id,
      firstVariant,
      { supply_voltage: 230 },
    )).response);
    const at460 = await successfulCalculation((await selectTtCable(
      page,
      pipe.id,
      secondVariant,
      { supply_voltage: 460 },
    )).response);
    const first = resultParts(at230);
    const second = resultParts(at460);

    expect(at460.cable_mark).toBe(at230.cable_mark);
    expect(baseCableModel(at460)).toBe(baseCableModel(at230));
    expect(numeric(second.results, 'num_circuits')).toBe(numeric(first.results, 'num_circuits'));
    expect(numeric(second.results, 'total_power')).toBeCloseTo(
      numeric(first.results, 'total_power'),
      6,
    );
    expect(numeric(first.resolved, 'nominal_voltage_v')).toBe(230);
    expect(numeric(second.resolved, 'nominal_voltage_v')).toBe(460);
    expect(numeric(first.electrical, 'nominal_voltage_v')).toBe(230);
    expect(numeric(second.electrical, 'nominal_voltage_v')).toBe(460);
    expect(numeric(first.results, 'voltage')).toBe(230);
    expect(numeric(second.results, 'voltage')).toBe(460);
    expect(numeric(first.results, 'current')).toBeCloseTo(
      numeric(first.results, 'total_power') / 230,
      3,
    );
    expect(numeric(second.results, 'current')).toBeCloseTo(
      numeric(second.results, 'total_power') / 460,
      3,
    );
    expect(numeric(first.results, 'current')).toBeCloseTo(
      numeric(second.results, 'current') * 2,
      3,
    );

    const firstSections = first.results.sections as Array<Record<string, unknown>>;
    const secondSections = second.results.sections as Array<Record<string, unknown>>;
    expect(firstSections.length).toBeGreaterThan(0);
    expect(secondSections.length).toBe(firstSections.length);
    expect(firstSections.every((section) => Number(section.voltage_v) === 230)).toBe(true);
    expect(secondSections.every((section) => Number(section.voltage_v) === 460)).toBe(true);

    const firstAssignment = await assignmentForObject(page, firstVariant.id, pipe.id);
    const secondAssignment = await assignmentForObject(page, secondVariant.id, pipe.id);
    expect(Number(firstAssignment.electrical_overrides?.supply_voltage_v)).toBe(230);
    expect(Number(secondAssignment.electrical_overrides?.supply_voltage_v)).toBe(460);
  });

  test('cylindrical и rectangular tank используют тот же паспортный selector', async ({
    page,
  }) => {
    const cylinder = await createCase1Tank(page, `Case1 cylinder passport ${Date.now()}`, {
      shape: 'cylindrical',
      diameter: 2,
      height: 3,
      min_switch_temperature: -20,
      q_additional: 120,
      insulation_layers: [
        { thickness: 0.15, material: 'mineral_wool_boards_120' },
      ],
    });
    const rectangular = await createCase1Tank(page, `Case1 rectangular passport ${Date.now()}`, {
      shape: 'rectangular',
      length: 4,
      width: 2,
      height: 3,
      min_switch_temperature: -20,
      insulation_layers: [
        { thickness: 0.15, material: 'mineral_wool_boards_120' },
      ],
    });
    await setProjectCurrentLimit(page);
    const variant = await initializeElectricalVariant(page);
    await assignObjects(page, variant.id, [cylinder.id, rectangular.id]);
    await patchElectricalOverrides(page, variant.id, cylinder.id, {
      tank_heating_height_m: 2.4,
      tank_laying_step_m: 0.2,
    });
    await patchElectricalOverrides(page, variant.id, rectangular.id, {
      tank_heating_height_m: 1.8,
      tank_laying_step_m: 0.3,
    });

    for (const fixture of [
      {
        object: cylinder,
        shape: 'cylindrical',
        expectedBaseLength: (Math.PI * 2 / 2) * (2.4 / 0.2),
      },
      {
        object: rectangular,
        shape: 'rectangular',
        expectedBaseLength: ((2 * (4 + 2)) / 2) * (1.8 / 0.3),
      },
    ]) {
      const options = await cableOptions(page, fixture.object.id, variant.id);
      const calculation = await successfulCalculation((await selectTtCable(
        page,
        fixture.object.id,
        variant,
        { supply_voltage: 230 },
      )).response);
      const { required, windingFactor } = requiredPowerPerMeter(calculation);
      const expectedCandidate = expectedPassportCandidate(options, required, windingFactor);
      const { resolved, layout } = resultParts(calculation);
      const tankLayout = asRecord(layout.tank);
      const heatResults = asRecord(fixture.object.results);

      expect(calculation.cable_mark).toBe(expectedCandidate.fullMark);
      expect(baseCableModel(calculation)).toBe(expectedCandidate.baseModel);
      expect(windingFactor).toBe(1);
      expect(numeric(resolved, 'base_length_m')).toBeCloseTo(fixture.expectedBaseLength, 3);
      expect(resolved.outer_diameter_mm).toBeNull();
      expect(required).toBeCloseTo(
        numeric(heatResults, 'total_heat_loss_design') / fixture.expectedBaseLength,
        3,
      );
      expect(tankLayout.shape).toBe(fixture.shape);
      expect(tankLayout.base_length_source).toBe('assignment_layout');
    }
  });

  test('сферический резервуар нельзя создать через UI или устаревший API-ввод', async ({ page }) => {
    await openTankForm(page);
    await page.getByTestId('tank-shape-select').click();
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await expect(dropdown).toBeVisible();
    const options = dropdown.locator('.ant-select-item-option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText('Цилиндрическая');
    await expect(options.nth(1)).toContainText('Параллелепипед');
    await expect(dropdown).not.toContainText('Сферическая');

    const { projectId, headers } = await guestHeaders(page);
    const response = await page.request.post(
      `${API_BASE}/api/v1/projects/${projectId}/objects`,
      {
        headers,
        data: {
          object_type: 'tank',
          params: { name: 'Legacy tank', shape: 'spherical' },
        },
      },
    );
    expect(response.status()).toBe(422);
    const error = await response.json() as {
      detail?: { code?: string; message?: string; fields?: string[] };
    };
    expect(error.detail).toEqual({
      code: 'TANK_SHAPE_UNSUPPORTED',
      message:
        "Форма резервуара 'spherical' больше не поддерживается. Допустимые формы: cylindrical, rectangular.",
      fields: ['shape'],
    });
  });
});
