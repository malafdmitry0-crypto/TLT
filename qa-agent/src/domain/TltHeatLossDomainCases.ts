import { TLT_DOMAIN_CASE_GENERATION_SYSTEM_PROMPT } from '../llm/prompts';
import type { LlmClient } from '../llm/LlmClient';
import type { ComparisonResult, Difference } from '../comparison/types';
import type { NormalizedResult } from '../normalization/types';
import type { ReportResult } from '../reporting/types';
import { isRecord } from '../shared/types';

export type TltHeatLossObjectType = 'pipe' | 'tank';
export type TltTankShape = 'cylindrical' | 'rectangular' | 'spherical';
export type TltHeatLossCaseSource = 'fixture' | 'llm';

export type TltRawDomainCase = {
  id?: unknown;
  object_type?: unknown;
  objectType?: unknown;
  scenario?: unknown;
  params?: unknown;
  expected_checks?: unknown;
  expectedChecks?: unknown;
  risk_tags?: unknown;
  riskTags?: unknown;
  notes?: unknown;
};

export type TltHeatLossCase = {
  id: string;
  objectType: TltHeatLossObjectType;
  scenario: string;
  params: Record<string, unknown>;
  expectedChecks: string[];
  riskTags: string[];
  source: TltHeatLossCaseSource;
  sanitizeWarnings: string[];
};

export type TltRejectedCase = {
  id?: string;
  reason: string;
  raw: unknown;
};

export type TltCaseSanitizationResult = {
  accepted: TltHeatLossCase[];
  rejected: TltRejectedCase[];
};

export type TltHeatLossValue = {
  heat_loss_per_meter?: number;
  heat_loss_per_m2?: number;
  total_heat_loss: number;
  effective_length?: number;
  surface_area?: number;
  thermal_resistance?: number;
  safety_factor?: number;
};

export type TltHeatLossRunner = {
  name: string;
  run(testCase: TltHeatLossCase): Promise<NormalizedResult>;
};

const DEFAULT_EXPECTED_CHECKS = [
  'calculation_success',
  'positive_heat_loss',
  'thicker_insulation_reduces_heat_loss',
  'higher_process_temperature_increases_heat_loss',
  'higher_safety_factor_increases_total_only',
];

const FIXTURE_CASES: TltRawDomainCase[] = [
  {
    id: 'pipe-outdoor-dn100-two-layer',
    object_type: 'pipe',
    scenario: 'Outdoor DN100 pipe with two insulation layers and local elements',
    risk_tags: ['pipe', 'outdoor', 'two_layer_insulation', 'local_elements', 'wind'],
    params: {
      outer_diameter: 0.108,
      wall_thickness: 0.004,
      pipe_material: 'carbon_steel',
      insulation_layers: [
        { thickness: 0.04, material: 'mineral_wool' },
        { thickness: 0.02, material: 'foam_glass' },
      ],
      ambient_temperature: -25,
      process_temperature: 80,
      pipe_length: 120,
      location: 'outdoor',
      wind_speed: 4,
      safety_factor: 1.1,
      num_local_elements: 4,
      local_element_equiv_length: 1.5,
    },
  },
  {
    id: 'pipe-underground-dn50-ground',
    object_type: 'pipe',
    scenario: 'Underground DN50 pipe with soil resistance',
    risk_tags: ['pipe', 'underground', 'ground_resistance'],
    params: {
      outer_diameter: 0.057,
      wall_thickness: 0.0035,
      pipe_material: 'carbon_steel',
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      ambient_temperature: -30,
      process_temperature: 65,
      pipe_length: 90,
      location: 'outdoor',
      burial_depth: 1.2,
      ground_conductivity: 1.5,
      safety_factor: 1.12,
    },
  },
  {
    id: 'pipe-indoor-small-diameter',
    object_type: 'pipe',
    scenario: 'Indoor small diameter pipe near climate boundary',
    risk_tags: ['pipe', 'indoor', 'small_diameter', 'dn_boundary'],
    params: {
      outer_diameter: 0.089,
      wall_thickness: 0.003,
      pipe_material: 'stainless_304',
      insulation_thickness: 0.03,
      insulation_material: 'polyurethane',
      ambient_temperature: 5,
      process_temperature: 45,
      pipe_length: 42,
      location: 'indoor',
      safety_factor: 1.12,
    },
  },
  {
    id: 'tank-cylindrical-outdoor',
    object_type: 'tank',
    scenario: 'Outdoor cylindrical tank with wind and wall resistance',
    risk_tags: ['tank', 'cylindrical', 'outdoor', 'wind'],
    params: {
      shape: 'cylindrical',
      diameter: 3.2,
      height: 6,
      wall_thickness: 0.006,
      wall_lambda: 45,
      insulation_thickness: 0.08,
      insulation_material: 'mineral_wool',
      ambient_temperature: -20,
      process_temperature: 60,
      location: 'outdoor',
      wind_speed: 3.5,
      safety_factor: 1.1,
    },
  },
  {
    id: 'tank-rectangular-underground',
    object_type: 'tank',
    scenario: 'Partially buried rectangular tank',
    risk_tags: ['tank', 'rectangular', 'underground', 'ground_split'],
    params: {
      shape: 'rectangular',
      length: 4,
      width: 2,
      height: 3,
      wall_thickness: 0.006,
      wall_lambda: 45,
      insulation_thickness: 0.06,
      insulation_material: 'foam_glass',
      ambient_temperature: -15,
      process_temperature: 55,
      location: 'outdoor',
      burial_depth: 1.5,
      ground_conductivity: 1.2,
      safety_factor: 1.1,
    },
  },
  {
    id: 'tank-spherical-heat-loss-only',
    object_type: 'tank',
    scenario: 'Spherical tank heat-loss case; electrical layout is intentionally unsupported later',
    risk_tags: ['tank', 'spherical', 'heat_loss_only'],
    params: {
      shape: 'spherical',
      diameter: 2.5,
      wall_thickness: 0.005,
      wall_lambda: 45,
      insulation_thickness: 0.07,
      insulation_material: 'mineral_wool',
      ambient_temperature: -25,
      process_temperature: 50,
      location: 'outdoor',
      wind_speed: 2.5,
      safety_factor: 1.1,
    },
  },
];

function normalizeStringList(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function rawObjectType(raw: TltRawDomainCase): TltHeatLossObjectType | undefined {
  const value = raw.object_type ?? raw.objectType;
  return value === 'pipe' || value === 'tank' ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value.replace(',', '.'));
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function numberParam(
  params: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
  warnings: string[],
): number {
  const raw = asFiniteNumber(params[key]);
  if (raw === undefined) {
    warnings.push(`defaulted ${key}=${fallback}`);
    return fallback;
  }
  const clamped = clamp(raw, min, max);
  if (clamped !== raw) warnings.push(`clamped ${key} from ${raw} to ${clamped}`);
  return clamped;
}

function optionalNumberParam(
  params: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  warnings: string[],
): number | undefined {
  const raw = asFiniteNumber(params[key]);
  if (raw === undefined) return undefined;
  const clamped = clamp(raw, min, max);
  if (clamped !== raw) warnings.push(`clamped ${key} from ${raw} to ${clamped}`);
  return clamped;
}

function normalizeLocation(value: unknown): 'indoor' | 'outdoor' {
  return value === 'indoor' ? 'indoor' : 'outdoor';
}

function normalizeInsulationLayers(
  params: Record<string, unknown>,
  warnings: string[],
): Array<Record<string, unknown>> | undefined {
  const raw = params.insulation_layers;
  if (!Array.isArray(raw)) return undefined;
  const layers = raw
    .filter(isRecord)
    .slice(0, 3)
    .map((layer, index) => ({
      thickness: numberParam(layer, 'thickness', index === 0 ? 0.05 : 0.02, 0.005, 0.5, warnings),
      material: typeof layer.material === 'string' && layer.material ? layer.material : 'mineral_wool',
      ...(asFiniteNumber(layer.conductivity) !== undefined
        ? { conductivity: numberParam(layer, 'conductivity', 0.045, 0.001, 400, warnings) }
        : {}),
    }));
  return layers.length > 0 ? layers : undefined;
}

function normalizeTemperatures(params: Record<string, unknown>, warnings: string[]) {
  const ambient = numberParam(params, 'ambient_temperature', -20, -70, 70, warnings);
  let process = numberParam(params, 'process_temperature', 60, -90, 600, warnings);
  if (process <= ambient) {
    process = ambient + 10;
    warnings.push(`raised process_temperature to ${process} because it must be above ambient_temperature`);
  }
  return { ambient, process };
}

function normalizePipeParams(params: Record<string, unknown>, warnings: string[]): Record<string, unknown> {
  const { ambient, process } = normalizeTemperatures(params, warnings);
  const normalized: Record<string, unknown> = {
    outer_diameter: numberParam(params, 'outer_diameter', 0.108, 0.0108, 3.0, warnings),
    wall_thickness: optionalNumberParam(params, 'wall_thickness', 0.0001, 0.04, warnings) ?? 0.004,
    pipe_material: typeof params.pipe_material === 'string' ? params.pipe_material : 'carbon_steel',
    ambient_temperature: ambient,
    process_temperature: process,
    pipe_length: numberParam(params, 'pipe_length', 50, 0.5, 200_000, warnings),
    location: normalizeLocation(params.location),
    wind_speed: optionalNumberParam(params, 'wind_speed', 0, 20, warnings),
    burial_depth: optionalNumberParam(params, 'burial_depth', 0, 200, warnings),
    ground_conductivity: optionalNumberParam(params, 'ground_conductivity', 0.5, 3.0, warnings),
    safety_factor: optionalNumberParam(params, 'safety_factor', 1.05, 1.7, warnings) ?? 1.1,
    num_local_elements: Math.round(optionalNumberParam(params, 'num_local_elements', 0, 100, warnings) ?? 0),
    local_element_equiv_length: optionalNumberParam(params, 'local_element_equiv_length', 0.1, 6.9, warnings),
  };
  const layers = normalizeInsulationLayers(params, warnings);
  if (layers) {
    normalized.insulation_layers = layers;
  } else {
    normalized.insulation_thickness = numberParam(params, 'insulation_thickness', 0.05, 0.005, 0.5, warnings);
    normalized.insulation_material =
      typeof params.insulation_material === 'string' && params.insulation_material
        ? params.insulation_material
        : 'mineral_wool';
  }
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
}

function normalizeTankParams(params: Record<string, unknown>, warnings: string[]): Record<string, unknown> {
  const { ambient, process } = normalizeTemperatures(params, warnings);
  const rawShape = params.shape;
  const shape: TltTankShape =
    rawShape === 'rectangular' || rawShape === 'spherical' || rawShape === 'cylindrical'
      ? rawShape
      : 'cylindrical';
  if (rawShape !== undefined && rawShape !== shape) warnings.push(`defaulted unsupported shape to ${shape}`);
  const normalized: Record<string, unknown> = {
    shape,
    insulation_thickness: numberParam(params, 'insulation_thickness', 0.06, 0.005, 0.5, warnings),
    insulation_material:
      typeof params.insulation_material === 'string' && params.insulation_material
        ? params.insulation_material
        : 'mineral_wool',
    insulation_layers: normalizeInsulationLayers(params, warnings),
    ambient_temperature: ambient,
    process_temperature: process,
    location: normalizeLocation(params.location),
    wall_thickness: optionalNumberParam(params, 'wall_thickness', 0.001, 0.5, warnings) ?? 0.006,
    wall_lambda: optionalNumberParam(params, 'wall_lambda', 0.001, 400, warnings) ?? 45,
    burial_depth: optionalNumberParam(params, 'burial_depth', 0, 200, warnings),
    ground_conductivity: optionalNumberParam(params, 'ground_conductivity', 0.5, 3.0, warnings),
    wind_speed: optionalNumberParam(params, 'wind_speed', 0, 20, warnings),
    safety_factor: optionalNumberParam(params, 'safety_factor', 1.05, 1.7, warnings) ?? 1.1,
    q_additional: optionalNumberParam(params, 'q_additional', 0, 1_000_000, warnings) ?? 0,
  };
  if (shape === 'rectangular') {
    normalized.length = numberParam(params, 'length', 4, 0.1, 100, warnings);
    normalized.width = numberParam(params, 'width', 2, 0.1, 100, warnings);
    normalized.height = numberParam(params, 'height', 3, 0.1, 50, warnings);
  } else {
    normalized.diameter = numberParam(params, 'diameter', 2, 0.1, 30, warnings);
    if (shape === 'cylindrical') normalized.height = numberParam(params, 'height', 4, 0.1, 50, warnings);
  }
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
}

export function fixtureTltHeatLossCases(limit?: number): TltRawDomainCase[] {
  return FIXTURE_CASES.slice(0, limit ?? FIXTURE_CASES.length);
}

export function sanitizeTltHeatLossCases(
  rawCases: unknown,
  options: { source?: TltHeatLossCaseSource; limit?: number } = {},
): TltCaseSanitizationResult {
  const source = options.source ?? 'fixture';
  const items = Array.isArray(rawCases)
    ? rawCases
    : isRecord(rawCases) && Array.isArray(rawCases.cases)
      ? rawCases.cases
      : [];
  const accepted: TltHeatLossCase[] = [];
  const rejected: TltRejectedCase[] = [];

  for (const [index, raw] of items.entries()) {
    if (options.limit !== undefined && accepted.length >= options.limit) break;
    if (!isRecord(raw)) {
      rejected.push({ reason: 'case is not an object', raw });
      continue;
    }
    const typed = raw as TltRawDomainCase;
    const objectType = rawObjectType(typed);
    const id = typeof typed.id === 'string' && typed.id.trim() ? typed.id.trim() : `ai-case-${index + 1}`;
    if (!objectType) {
      rejected.push({ id, reason: 'object_type must be pipe or tank', raw });
      continue;
    }
    if (!isRecord(typed.params)) {
      rejected.push({ id, reason: 'params must be an object', raw });
      continue;
    }
    const warnings: string[] = [];
    const params =
      objectType === 'pipe'
        ? normalizePipeParams(typed.params, warnings)
        : normalizeTankParams(typed.params, warnings);
    accepted.push({
      id,
      objectType,
      scenario:
        typeof typed.scenario === 'string' && typed.scenario.trim()
          ? typed.scenario.trim()
          : `${objectType} heat-loss case`,
      params,
      expectedChecks: normalizeStringList(typed.expected_checks ?? typed.expectedChecks, DEFAULT_EXPECTED_CHECKS),
      riskTags: normalizeStringList(typed.risk_tags ?? typed.riskTags, [objectType]),
      source,
      sanitizeWarnings: warnings,
    });
  }

  return { accepted, rejected };
}

export class LlmTltHeatLossCaseGenerator {
  constructor(private readonly llmClient: LlmClient) {}

  async generate(config: { pipeCases: number; tankCases: number; documentation?: string }): Promise<unknown> {
    return this.llmClient.completeJson({
      system: TLT_DOMAIN_CASE_GENERATION_SYSTEM_PROMPT,
      temperature: 0.2,
      user: JSON.stringify({
        task: 'Generate heat-loss QA cases for TLT pipe and tank calculations.',
        pipeCases: config.pipeCases,
        tankCases: config.tankCases,
        requiredOutputShape: {
          cases: [
            {
              id: 'string',
              object_type: 'pipe|tank',
              scenario: 'string',
              params: 'backend heat-loss params in SI units',
              expected_checks: DEFAULT_EXPECTED_CHECKS,
              risk_tags: ['string'],
            },
          ],
        },
        documentation: config.documentation?.slice(0, 20_000),
      }),
    });
  }
}

const INSULATION_CONDUCTIVITY: Record<string, number> = {
  mineral_wool: 0.045,
  foam_glass: 0.058,
  polyurethane: 0.028,
  polystyrene: 0.038,
  aerogel: 0.021,
  calcium_silicate: 0.065,
};

function conductivity(material: unknown): number {
  return typeof material === 'string' ? (INSULATION_CONDUCTIVITY[material] ?? 0.045) : 0.045;
}

function alpha(location: unknown, windSpeed: unknown): number {
  if (location === 'indoor') return 9;
  const v = Math.max(asFiniteNumber(windSpeed) ?? 0, 0);
  return Math.min(Math.max(11.6 + 7 * Math.sqrt(v), 11.6), 52);
}

function pipeResult(params: Record<string, unknown>): TltHeatLossValue {
  const outerDiameter = asFiniteNumber(params.outer_diameter) ?? 0.108;
  const length = asFiniteNumber(params.pipe_length) ?? 50;
  const process = asFiniteNumber(params.process_temperature) ?? 60;
  const ambient = asFiniteNumber(params.ambient_temperature) ?? -20;
  const wallThickness = asFiniteNumber(params.wall_thickness) ?? 0.004;
  const rOuterPipe = outerDiameter / 2;
  const rInnerPipe = Math.max(rOuterPipe - wallThickness, rOuterPipe * 0.8);
  const wallLambda = 45;
  const rWall = Math.log(rOuterPipe / rInnerPipe) / (2 * Math.PI * wallLambda);
  let r = rOuterPipe;
  let rIns = 0;
  const layers = Array.isArray(params.insulation_layers)
    ? params.insulation_layers.filter(isRecord)
    : [{ thickness: params.insulation_thickness, material: params.insulation_material }];
  for (const layer of layers) {
    const thickness = asFiniteNumber(layer.thickness) ?? 0.05;
    const rOut = r + thickness;
    rIns += Math.log(rOut / r) / (2 * Math.PI * conductivity(layer.material));
    r = rOut;
  }
  const burialDepth = asFiniteNumber(params.burial_depth);
  const groundLambda = asFiniteNumber(params.ground_conductivity) ?? 1.5;
  const rExternal =
    burialDepth !== undefined && burialDepth > 0
      ? Math.log(burialDepth / r + Math.sqrt((burialDepth / r) ** 2 - 1)) / (2 * Math.PI * groundLambda)
      : 1 / (2 * Math.PI * r * alpha(params.location, params.wind_speed));
  const resistance = rWall + rIns + rExternal;
  const q = (process - ambient) / resistance;
  const n = asFiniteNumber(params.num_local_elements) ?? 0;
  const lEkv = asFiniteNumber(params.local_element_equiv_length) ?? 0;
  const effectiveLength = length + n * lEkv;
  const safety = asFiniteNumber(params.safety_factor) ?? 1.1;
  return {
    heat_loss_per_meter: round(q, 3),
    total_heat_loss: round(q * effectiveLength * safety, 3),
    effective_length: round(effectiveLength, 3),
    thermal_resistance: round(resistance, 6),
    safety_factor: safety,
  };
}

function tankArea(params: Record<string, unknown>): number {
  const shape = params.shape;
  if (shape === 'rectangular') {
    const length = asFiniteNumber(params.length) ?? 4;
    const width = asFiniteNumber(params.width) ?? 2;
    const height = asFiniteNumber(params.height) ?? 3;
    return 2 * (length * width + length * height + width * height);
  }
  const diameter = asFiniteNumber(params.diameter) ?? 2;
  if (shape === 'spherical') return 4 * Math.PI * (diameter / 2) ** 2;
  const height = asFiniteNumber(params.height) ?? 4;
  return Math.PI * diameter * height + 2 * Math.PI * (diameter / 2) ** 2;
}

function tankResult(params: Record<string, unknown>): TltHeatLossValue {
  const process = asFiniteNumber(params.process_temperature) ?? 60;
  const ambient = asFiniteNumber(params.ambient_temperature) ?? -20;
  const wallThickness = asFiniteNumber(params.wall_thickness) ?? 0.006;
  const wallLambda = asFiniteNumber(params.wall_lambda) ?? 45;
  const rWall = wallThickness / wallLambda;
  const layers = Array.isArray(params.insulation_layers)
    ? params.insulation_layers.filter(isRecord)
    : [{ thickness: params.insulation_thickness, material: params.insulation_material }];
  const rIns = layers.reduce(
    (sum, layer) => sum + (asFiniteNumber(layer.thickness) ?? 0.06) / conductivity(layer.material),
    0,
  );
  const rExternal = 1 / alpha(params.location, params.wind_speed);
  const resistance = rWall + rIns + rExternal;
  const q = (process - ambient) / resistance;
  const area = tankArea(params);
  const safety = asFiniteNumber(params.safety_factor) ?? 1.1;
  const qAdditional = asFiniteNumber(params.q_additional) ?? 0;
  return {
    heat_loss_per_m2: round(q, 3),
    total_heat_loss: round(q * area * safety + qAdditional, 3),
    surface_area: round(area, 3),
    thermal_resistance: round(resistance, 6),
    safety_factor: safety,
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export class LocalTltHeatLossRunner implements TltHeatLossRunner {
  readonly name = 'LocalTltHeatLossRunner';

  async run(testCase: TltHeatLossCase): Promise<NormalizedResult> {
    try {
      return {
        value: testCase.objectType === 'pipe' ? pipeResult(testCase.params) : tankResult(testCase.params),
        status: 'success',
        warnings: testCase.sanitizeWarnings,
        metadata: { runner: this.name },
      };
    } catch (error) {
      return {
        value: null,
        status: 'error',
        warnings: [],
        metadata: { runner: this.name, error: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}

export class BackendFormulaCheckHeatLossRunner implements TltHeatLossRunner {
  readonly name = 'BackendFormulaCheckHeatLossRunner';

  constructor(
    private readonly config: {
      baseUrl: string;
      authToken?: string;
    },
  ) {}

  async run(testCase: TltHeatLossCase): Promise<NormalizedResult> {
    const endpoint = new URL('/api/v1/admin/formula-check', this.config.baseUrl).toString();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.authToken) headers.authorization = `Bearer ${this.config.authToken}`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          formula_type: testCase.objectType,
          params: testCase.params,
        }),
      });
      const contentType = response.headers.get('content-type') ?? '';
      const raw = contentType.includes('application/json') ? await response.json() : await response.text();
      return {
        value: response.ok ? raw : null,
        status: response.ok ? 'success' : 'error',
        warnings: [],
        metadata: { runner: this.name, statusCode: response.status, endpoint, raw },
      };
    } catch (error) {
      return {
        value: null,
        status: 'error',
        warnings: [],
        metadata: { runner: this.name, endpoint, error: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}

export async function loginAdminForQaAgent(config: {
  baseUrl: string;
  email?: string;
  password?: string;
}): Promise<string | undefined> {
  if (!config.email || !config.password) return undefined;
  const endpoint = new URL('/api/v1/auth/login', config.baseUrl).toString();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: config.email, password: config.password, role: 'admin' }),
  });
  if (!response.ok) {
    throw new Error(`Admin login failed with HTTP ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error('Admin login response did not include access_token');
  return payload.access_token;
}

function cloneCase(testCase: TltHeatLossCase, idSuffix: string, params: Record<string, unknown>): TltHeatLossCase {
  return {
    ...testCase,
    id: `${testCase.id}__${idSuffix}`,
    params,
  };
}

function withNumericParam(params: Record<string, unknown>, key: string, transform: (value: number) => number) {
  const next = { ...params };
  const value = asFiniteNumber(next[key]);
  if (value !== undefined) next[key] = transform(value);
  return next;
}

function withThickerInsulation(params: Record<string, unknown>) {
  if (Array.isArray(params.insulation_layers)) {
    return {
      ...params,
      insulation_layers: params.insulation_layers.map((raw) =>
        isRecord(raw)
          ? { ...raw, thickness: round((asFiniteNumber(raw.thickness) ?? 0.05) * 1.5, 4) }
          : raw,
      ),
    };
  }
  return withNumericParam(params, 'insulation_thickness', (value) => round(value * 1.5, 4));
}

function variantCases(testCase: TltHeatLossCase): Array<{ label: string; testCase: TltHeatLossCase }> {
  const variants = [
    {
      label: 'thicker_insulation',
      testCase: cloneCase(testCase, 'thicker_insulation', withThickerInsulation(testCase.params)),
    },
    {
      label: 'higher_process_temperature',
      testCase: cloneCase(
        testCase,
        'higher_process_temperature',
        withNumericParam(testCase.params, 'process_temperature', (value) => value + 20),
      ),
    },
    {
      label: 'higher_safety_factor',
      testCase: cloneCase(
        testCase,
        'higher_safety_factor',
        withNumericParam(testCase.params, 'safety_factor', (value) => Math.min(round(value + 0.2, 3), 1.7)),
      ),
    },
  ];
  if (testCase.objectType === 'pipe') {
    variants.push({
      label: 'longer_pipe',
      testCase: cloneCase(
        testCase,
        'longer_pipe',
        withNumericParam(testCase.params, 'pipe_length', (value) => round(value * 1.5, 3)),
      ),
    });
  }
  return variants;
}

function heatValue(value: unknown): TltHeatLossValue | undefined {
  if (!isRecord(value)) return undefined;
  const total = asFiniteNumber(value.total_heat_loss);
  if (total === undefined) return undefined;
  return {
    total_heat_loss: total,
    heat_loss_per_meter: asFiniteNumber(value.heat_loss_per_meter),
    heat_loss_per_m2: asFiniteNumber(value.heat_loss_per_m2),
    effective_length: asFiniteNumber(value.effective_length),
    surface_area: asFiniteNumber(value.surface_area),
    thermal_resistance: asFiniteNumber(value.thermal_resistance),
    safety_factor: asFiniteNumber(value.safety_factor),
  };
}

function comparison(
  verdict: 'pass' | 'fail' | 'needs_review',
  reason: string,
  differences: Difference[] = [],
): ComparisonResult {
  return {
    verdict,
    severity: verdict === 'pass' ? 'low' : verdict === 'fail' ? 'high' : 'medium',
    reason,
    differences,
    numericDelta: 0,
    toleranceUsed: { absoluteTolerance: 0, relativeTolerance: 0 },
  };
}

function fail(path: string, expected: unknown, actual: unknown, reason: string): ComparisonResult {
  return comparison('fail', reason, [{ path, expected, actual, reason }]);
}

function pass(reason: string): ComparisonResult {
  return comparison('pass', reason);
}

function review(reason: string, actual: unknown): ComparisonResult {
  return comparison('needs_review', reason, [{ path: '$', expected: 'review', actual, reason }]);
}

function evaluateInvariant(
  label: string,
  baseline: TltHeatLossValue,
  variant: TltHeatLossValue,
  testCase: TltHeatLossCase,
): ComparisonResult {
  if (label === 'thicker_insulation') {
    return variant.total_heat_loss < baseline.total_heat_loss
      ? pass('Thicker insulation reduces total heat loss')
      : fail('total_heat_loss', '< baseline', variant.total_heat_loss, 'Thicker insulation must reduce total heat loss');
  }
  if (label === 'higher_process_temperature') {
    return variant.total_heat_loss > baseline.total_heat_loss
      ? pass('Higher process temperature increases total heat loss')
      : fail(
          'total_heat_loss',
          '> baseline',
          variant.total_heat_loss,
          'Higher process temperature must increase total heat loss',
        );
  }
  if (label === 'higher_safety_factor') {
    const linearBaseline =
      testCase.objectType === 'pipe' ? baseline.heat_loss_per_meter : baseline.heat_loss_per_m2;
    const linearVariant = testCase.objectType === 'pipe' ? variant.heat_loss_per_meter : variant.heat_loss_per_m2;
    if (variant.total_heat_loss <= baseline.total_heat_loss) {
      return fail(
        'total_heat_loss',
        '> baseline',
        variant.total_heat_loss,
        'Higher safety factor must increase total heat loss',
      );
    }
    if (
      linearBaseline !== undefined &&
      linearVariant !== undefined &&
      Math.abs(linearBaseline - linearVariant) > Math.max(0.001, Math.abs(linearBaseline) * 0.0001)
    ) {
      return fail(
        testCase.objectType === 'pipe' ? 'heat_loss_per_meter' : 'heat_loss_per_m2',
        linearBaseline,
        linearVariant,
        'Safety factor must not change linear/surface heat loss',
      );
    }
    return pass('Higher safety factor increases total heat loss only');
  }
  if (label === 'longer_pipe') {
    if (variant.total_heat_loss <= baseline.total_heat_loss) {
      return fail('total_heat_loss', '> baseline', variant.total_heat_loss, 'Longer pipe must increase total heat loss');
    }
    if (
      baseline.heat_loss_per_meter !== undefined &&
      variant.heat_loss_per_meter !== undefined &&
      Math.abs(baseline.heat_loss_per_meter - variant.heat_loss_per_meter) >
        Math.max(0.001, Math.abs(baseline.heat_loss_per_meter) * 0.0001)
    ) {
      return fail(
        'heat_loss_per_meter',
        baseline.heat_loss_per_meter,
        variant.heat_loss_per_meter,
        'Pipe length must not change heat loss per meter',
      );
    }
    return pass('Longer pipe increases total heat loss without changing heat loss per meter');
  }
  return review(`Unknown invariant: ${label}`, variant);
}

function reportResult(args: {
  testCase: TltHeatLossCase;
  expected: unknown;
  actual: NormalizedResult;
  deterministic: ComparisonResult;
}): ReportResult {
  return {
    testCase: {
      id: args.testCase.id,
      requirementId: `tlt_${args.testCase.objectType}_heat_loss_ai_case`,
      input: args.testCase.params,
      kind: 'metamorphic',
      metadata: {
        objectType: args.testCase.objectType,
        scenario: args.testCase.scenario,
        riskTags: args.testCase.riskTags,
        source: args.testCase.source,
        sanitizeWarnings: args.testCase.sanitizeWarnings,
      },
    },
    expected: { value: args.expected, warnings: [], metadata: {} },
    actual: args.actual,
    deterministic: args.deterministic,
    finalVerdict: args.deterministic.verdict,
  };
}

export async function evaluateTltHeatLossCases(
  cases: TltHeatLossCase[],
  runner: TltHeatLossRunner,
): Promise<ReportResult[]> {
  const results: ReportResult[] = [];
  for (const testCase of cases) {
    const baselineActual = await runner.run(testCase);
    const baseline = heatValue(baselineActual.value);
    if (baselineActual.status !== 'success' || !baseline) {
      results.push(
        reportResult({
          testCase,
          expected: 'successful heat-loss calculation with positive result',
          actual: baselineActual,
          deterministic: fail('$', 'success', baselineActual, 'Baseline heat-loss calculation failed'),
        }),
      );
      continue;
    }
    if (baseline.total_heat_loss <= 0) {
      results.push(
        reportResult({
          testCase,
          expected: 'total_heat_loss > 0',
          actual: baselineActual,
          deterministic: fail('total_heat_loss', '> 0', baseline.total_heat_loss, 'Heat loss must be positive'),
        }),
      );
      continue;
    }
    results.push(
      reportResult({
        testCase,
        expected: 'successful heat-loss calculation with positive result',
        actual: baselineActual,
        deterministic: pass('Baseline heat-loss calculation succeeded'),
      }),
    );

    for (const variant of variantCases(testCase)) {
      const variantActual = await runner.run(variant.testCase);
      const variantValue = heatValue(variantActual.value);
      if (variantActual.status !== 'success' || !variantValue) {
        results.push(
          reportResult({
            testCase: variant.testCase,
            expected: `${variant.label} variant calculation success`,
            actual: variantActual,
            deterministic: fail('$', 'success', variantActual, `${variant.label} variant calculation failed`),
          }),
        );
        continue;
      }
      results.push(
        reportResult({
          testCase: variant.testCase,
          expected: `${variant.label} invariant`,
          actual: variantActual,
          deterministic: evaluateInvariant(variant.label, baseline, variantValue, testCase),
        }),
      );
    }
  }
  return results;
}
