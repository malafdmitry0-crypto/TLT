import { chromium, request } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_FRONTEND_URL = 'http://127.0.0.1:3003';
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

function usage() {
  console.log(`Seed a guest HeatCalc project with pipe/tank variants.

Usage:
  npm run seed:guest:playwright
  npm run seed:guest:playwright -- --clear
  GUEST_SESSION_ID=... PROJECT_ID=... npm run seed:guest:playwright -- --clear

Options:
  --frontend=<url>      Frontend URL, default ${DEFAULT_FRONTEND_URL}
  --api=<url>           API base URL, default ${DEFAULT_API_BASE_URL}
  --channel=<name>      Playwright browser channel, default chrome
  --session-id=<id>     Reuse existing guest session instead of creating a new one
  --project-id=<uuid>   Reuse existing guest project; if omitted, first session project is used
  --per-type=<n>        Create exactly n objects for each type by cycling variants
  --clear              Delete existing objects in reused project before seeding
  --screenshot=<path>   Screenshot path, default <tmp>/tlt-seeded-guest.png
  --opener=<path>       HTML opener path, default <tmp>/tlt-open-seeded-guest.html
  --help               Print this help
`);
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

if (hasFlag('help')) {
  usage();
  process.exit(0);
}

const frontendUrl = argValue('frontend', process.env.FRONTEND_URL ?? DEFAULT_FRONTEND_URL).replace(/\/$/, '');
const apiBaseUrl = argValue('api', process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
const browserChannel = argValue('channel', process.env.PLAYWRIGHT_CHANNEL ?? 'chrome');
const providedSessionId = argValue('session-id', process.env.GUEST_SESSION_ID ?? '');
const providedProjectId = argValue('project-id', process.env.PROJECT_ID ?? '');
const objectsPerType = parseOptionalPositiveInt(
  argValue('per-type', process.env.SEED_OBJECTS_PER_TYPE ?? ''),
  'per-type',
);
const shouldClear = hasFlag('clear');
const screenshotPath = argValue(
  'screenshot',
  process.env.SEED_SCREENSHOT ?? path.join(os.tmpdir(), 'tlt-seeded-guest.png'),
);
const openerPath = argValue(
  'opener',
  process.env.SEED_OPENER ?? path.join(os.tmpdir(), 'tlt-open-seeded-guest.html'),
);
const publicOpenerName = argValue(
  'public-opener',
  process.env.SEED_PUBLIC_OPENER ?? 'tlt-open-seeded-guest.html',
);

function apiUrl(route) {
  return `${apiBaseUrl}${route.startsWith('/') ? route : `/${route}`}`;
}

function parseOptionalPositiveInt(value, label) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${label} must be a positive integer`);
  }
  return parsed;
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true, channel: browserChannel });
  } catch (error) {
    console.warn(
      `Playwright channel "${browserChannel}" is unavailable, falling back to bundled Chromium: ${error.message}`,
    );
    return chromium.launch({ headless: true });
  }
}

function layer(thickness, material, conductivity) {
  return [{ thickness, material, ...(conductivity ? { conductivity } : {}) }];
}

const deprecatedInsulationMaterialMap = {
  mineral_wool: { material: 'mineral_wool_boards_120' },
  polyurethane: { material: 'polyurethane_products_40' },
  polystyrene: { material: 'polystyrene_products_50' },
  foam_glass: { material: 'other', conductivity: 0.058 },
  aerogel: { material: 'other', conductivity: 0.021 },
  calcium_silicate: { material: 'other', conductivity: 0.065 },
};

const genericInsulationTemperatureRange = [-260, 650];

function normalizeInsulationLayer(input) {
  if (!input || typeof input !== 'object') return input;
  const replacement = deprecatedInsulationMaterialMap[input.material];
  const next = replacement
    ? {
        ...input,
        material: replacement.material,
        ...(input.conductivity || !replacement.conductivity
          ? {}
          : { conductivity: replacement.conductivity }),
      }
    : { ...input };
  if (next.material === 'other' && !next.temperature_range) {
    next.temperature_range = genericInsulationTemperatureRange;
  }
  return next;
}

function normalizeSeedParams(params) {
  const next = { ...params };
  if (!next.insulation_temperature_basis) {
    if (next.placement === 'indoor' || next.location === 'indoor') {
      next.insulation_temperature_basis = 'indoor';
    } else if (next.placement === 'underground') {
      next.insulation_temperature_basis = 'channel';
    } else {
      next.insulation_temperature_basis = 'outdoor_winter';
    }
  }
  const layers = Array.isArray(next.insulation_layers)
    ? next.insulation_layers.map(normalizeInsulationLayer)
    : [];
  if (layers.length > 0) {
    next.insulation_layers = layers;
    const firstLayer = layers[0];
    if (firstLayer?.material) {
      next.insulation_material = firstLayer.material;
    }
    if (firstLayer?.material === 'other' && firstLayer.conductivity && !next.first_insulation_lambda) {
      next.first_insulation_lambda = firstLayer.conductivity;
    }
    return next;
  }

  const replacement = deprecatedInsulationMaterialMap[next.insulation_material];
  if (replacement) {
    next.insulation_material = replacement.material;
    if (replacement.material === 'other' && replacement.conductivity && !next.first_insulation_lambda) {
      next.first_insulation_lambda = replacement.conductivity;
    }
    if (replacement.material === 'other') {
      next.insulation_layers = [
        {
          thickness: next.insulation_thickness,
          material: 'other',
          conductivity: next.first_insulation_lambda,
          temperature_range: genericInsulationTemperatureRange,
        },
      ];
    }
  }
  return next;
}

function common(overrides = {}) {
  return {
    ambient_temperature: -20,
    process_temperature: 65,
    max_ambient_temperature: 35,
    max_process_temperature: 110,
    environment: 'normal',
    zone_classification: 'safe',
    temperature_group: 'T3',
    min_switch_temperature: -15,
    supply_voltage: 220,
    safety_factor: 1.2,
    steam_tracing: 'no',
    insulation_cover_material: 'none',
    ...overrides,
  };
}

const seedObjects = [
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: -25, process_temperature: 65, wind_speed: 3.2 }),
      name: 'P01 · труба · outdoor · справочная λ · 1 слой · локальные элементы',
      placement: 'outdoor',
      location: 'outdoor',
      outer_diameter: 0.2191,
      wall_thickness: 0.006,
      pipe_material: 'carbon_steel',
      pipe_length: 55,
      insulation_thickness: 0.06,
      insulation_material: 'mineral_wool',
      insulation_layer_count: '1',
      insulation_layers: layer(0.06, 'mineral_wool'),
      valve_count: 1,
      flange_count: 2,
      support_count: 3,
      num_local_elements: 6,
      local_element_equiv_length: 1.5,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({
        ambient_temperature: 12,
        process_temperature: 55,
        environment: 'aggressive',
        zone_classification: 'explosive',
        temperature_group: 'T4',
      }),
      name: 'P02 · труба · indoor · ручная λ · 2 слоя · other',
      placement: 'indoor',
      location: 'indoor',
      outer_diameter: 0.1143,
      wall_thickness: 0.004,
      pipe_lambda: 42,
      pipe_length: 35,
      insulation_thickness: 0.03,
      insulation_material: 'other',
      first_insulation_lambda: 0.041,
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.03, material: 'other', conductivity: 0.041 },
        { thickness: 0.025, material: 'polyurethane' },
      ],
      valve_count: 0,
      flange_count: 1,
      support_count: 2,
      num_local_elements: 3,
      local_element_equiv_length: 1.2,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: -15, process_temperature: 80 }),
      name: 'P03 · труба · underground · 3 слоя · грунт',
      placement: 'underground',
      location: 'outdoor',
      outer_diameter: 0.3239,
      wall_thickness: 0.008,
      pipe_material: 'stainless_304',
      pipe_length: 80,
      burial_depth: 1.2,
      ground_type: 'custom',
      ground_conductivity: 1.8,
      insulation_thickness: 0.05,
      insulation_material: 'foam_glass',
      insulation_layer_count: '3',
      insulation_layers: [
        { thickness: 0.05, material: 'foam_glass' },
        { thickness: 0.05, material: 'mineral_wool' },
        { thickness: 0.02, material: 'aerogel' },
      ],
      valve_count: 3,
      flange_count: 4,
      support_count: 5,
      num_local_elements: 12,
      local_element_equiv_length: 2,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({
        ambient_temperature: -30,
        process_temperature: 105,
        wind_speed: 5,
        supply_voltage: 380,
        zone_classification: 'explosive',
        temperature_group: 'T5',
        steam_tracing: 'yes',
      }),
      name: 'P04 · труба · outdoor · 380В · explosive · пропарка',
      placement: 'outdoor',
      location: 'outdoor',
      outer_diameter: 0.0603,
      wall_thickness: 0.003,
      pipe_material: 'stainless_304',
      pipe_length: 22,
      insulation_thickness: 0.06,
      insulation_material: 'aerogel',
      insulation_layer_count: '1',
      insulation_layers: layer(0.06, 'aerogel'),
      valve_count: 1,
      flange_count: 0,
      support_count: 1,
      num_local_elements: 2,
      local_element_equiv_length: 0.8,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: 5, process_temperature: 40, environment: 'aggressive', temperature_group: 'T6' }),
      name: 'P05 · труба · indoor · пластик · T6',
      placement: 'indoor',
      location: 'indoor',
      outer_diameter: 0.0889,
      wall_thickness: 0.005,
      pipe_material: 'plastic',
      pipe_length: 15,
      insulation_thickness: 0.05,
      insulation_material: 'polystyrene',
      insulation_layer_count: '1',
      insulation_layers: layer(0.05, 'polystyrene'),
      valve_count: 0,
      flange_count: 0,
      support_count: 0,
      local_element_equiv_length: 1.5,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: -35, process_temperature: 95, temperature_group: 'T2' }),
      name: 'P06 · труба · underground · медь · силикат кальция',
      placement: 'underground',
      location: 'outdoor',
      outer_diameter: 0.1683,
      wall_thickness: 0.004,
      pipe_material: 'copper',
      pipe_length: 120,
      burial_depth: 0.8,
      ground_type: 'custom',
      ground_conductivity: 2.4,
      insulation_thickness: 0.08,
      insulation_material: 'calcium_silicate',
      insulation_layer_count: '1',
      insulation_layers: layer(0.08, 'calcium_silicate'),
      valve_count: 0,
      flange_count: 0,
      support_count: 0,
      local_element_equiv_length: 1.5,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -25, process_temperature: 70, wind_speed: 2.5 }),
      name: 'T01 · резервуар цилиндр · outdoor · стенка · Qдоп',
      placement: 'outdoor',
      location: 'outdoor',
      shape: 'cylindrical',
      diameter: 2,
      height: 3,
      wall_thickness: 0.008,
      wall_lambda: 45,
      insulation_thickness: 0.08,
      insulation_material: 'mineral_wool',
      insulation_layer_count: '1',
      insulation_layers: layer(0.08, 'mineral_wool'),
      q_additional: 250,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: 10, process_temperature: 60 }),
      name: 'T02 · резервуар цилиндр · indoor · 2 слоя · other',
      placement: 'indoor',
      location: 'indoor',
      shape: 'cylindrical',
      diameter: 1.2,
      height: 2,
      wall_thickness: 0.006,
      wall_lambda: 45,
      insulation_thickness: 0.035,
      insulation_material: 'other',
      first_insulation_lambda: 0.04,
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.035, material: 'other', conductivity: 0.04 },
        { thickness: 0.025, material: 'polyurethane' },
      ],
      q_additional: 0,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -20, process_temperature: 75 }),
      name: 'T03 · резервуар цилиндр · underground · 3 слоя · грунт',
      placement: 'underground',
      location: 'outdoor',
      shape: 'cylindrical',
      diameter: 2.4,
      height: 4,
      burial_depth: 1.5,
      ground_type: 'custom',
      ground_conductivity: 1.6,
      wall_thickness: 0.01,
      wall_lambda: 45,
      insulation_thickness: 0.05,
      insulation_material: 'foam_glass',
      insulation_layer_count: '3',
      insulation_layers: [
        { thickness: 0.05, material: 'foam_glass' },
        { thickness: 0.04, material: 'mineral_wool' },
        { thickness: 0.02, material: 'aerogel' },
      ],
      q_additional: 100,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -20, process_temperature: 70, wind_speed: 4 }),
      name: 'T04 · резервуар прямоуг. · outdoor',
      placement: 'outdoor',
      location: 'outdoor',
      shape: 'rectangular',
      length: 3,
      width: 1.8,
      height: 2.2,
      wall_thickness: 0.01,
      wall_lambda: 45,
      insulation_thickness: 0.07,
      insulation_material: 'foam_glass',
      insulation_layer_count: '1',
      insulation_layers: layer(0.07, 'foam_glass'),
      q_additional: 100,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: 15, process_temperature: 55 }),
      name: 'T05 · резервуар прямоуг. · indoor',
      placement: 'indoor',
      location: 'indoor',
      shape: 'rectangular',
      length: 1.5,
      width: 1,
      height: 1.2,
      wall_thickness: 0.006,
      wall_lambda: 45,
      insulation_thickness: 0.05,
      insulation_material: 'polyurethane',
      insulation_layer_count: '1',
      insulation_layers: layer(0.05, 'polyurethane'),
      q_additional: 0,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -15, process_temperature: 80 }),
      name: 'T06 · резервуар прямоуг. · underground · 3 слоя',
      placement: 'underground',
      location: 'outdoor',
      shape: 'rectangular',
      length: 4,
      width: 2,
      height: 2.5,
      burial_depth: 1,
      ground_type: 'custom',
      ground_conductivity: 2,
      wall_thickness: 0.012,
      wall_lambda: 45,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool',
      insulation_layer_count: '3',
      insulation_layers: [
        { thickness: 0.05, material: 'mineral_wool' },
        { thickness: 0.035, material: 'foam_glass' },
        { thickness: 0.02, material: 'other', conductivity: 0.035 },
      ],
      q_additional: 150,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -20, process_temperature: 60, wind_speed: 3 }),
      name: 'T07 · резервуар сфера · outdoor · heat-only',
      placement: 'outdoor',
      location: 'outdoor',
      shape: 'spherical',
      diameter: 1.6,
      wall_thickness: 0.006,
      wall_lambda: 45,
      insulation_thickness: 0.07,
      insulation_material: 'mineral_wool',
      insulation_layer_count: '1',
      insulation_layers: layer(0.07, 'mineral_wool'),
      q_additional: 50,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: 10, process_temperature: 45 }),
      name: 'T08 · резервуар сфера · indoor · heat-only',
      placement: 'indoor',
      location: 'indoor',
      shape: 'spherical',
      diameter: 1.2,
      wall_thickness: 0.006,
      wall_lambda: 45,
      insulation_thickness: 0.04,
      insulation_material: 'polyurethane',
      insulation_layer_count: '1',
      insulation_layers: layer(0.04, 'polyurethane'),
      q_additional: 0,
    },
  },
];

const additionalPipeObjects = [
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: -40, process_temperature: 45, wind_speed: 6.5, temperature_group: 'T1' }),
      name: 'P07 · труба · outdoor · DN15 · ветер · холодный климат',
      placement: 'outdoor',
      location: 'outdoor',
      outer_diameter: 0.0213,
      wall_thickness: 0.0028,
      pipe_material: 'carbon_steel',
      pipe_length: 18,
      insulation_thickness: 0.04,
      insulation_material: 'mineral_wool_boards_120',
      insulation_layer_count: '1',
      insulation_layers: layer(0.04, 'mineral_wool_boards_120'),
      valve_count: 2,
      flange_count: 2,
      support_count: 1,
      num_local_elements: 5,
      local_element_equiv_length: 0.6,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: 18, process_temperature: 50, environment: 'normal', temperature_group: 'T2' }),
      name: 'P08 · труба · indoor · алюминий · короткая линия',
      placement: 'indoor',
      location: 'indoor',
      outer_diameter: 0.0337,
      wall_thickness: 0.0032,
      pipe_material: 'aluminum',
      pipe_length: 8,
      insulation_thickness: 0.025,
      insulation_material: 'polyurethane_products_40',
      insulation_layer_count: '1',
      insulation_layers: layer(0.025, 'polyurethane_products_40'),
      valve_count: 0,
      flange_count: 2,
      support_count: 0,
      local_element_equiv_length: 0.5,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: -10, process_temperature: 120, safety_factor: 1.35, temperature_group: 'T3' }),
      name: 'P09 · труба · underground · DN250 · длинная трасса',
      placement: 'underground',
      location: 'outdoor',
      outer_diameter: 0.273,
      wall_thickness: 0.007,
      pipe_material: 'carbon_steel',
      pipe_length: 260,
      burial_depth: 1.8,
      ground_type: 'custom',
      ground_conductivity: 1.3,
      insulation_thickness: 0.09,
      insulation_material: 'foam_glass',
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.06, material: 'foam_glass' },
        { thickness: 0.03, material: 'mineral_wool_cylinders_100' },
      ],
      valve_count: 4,
      flange_count: 8,
      support_count: 0,
      num_local_elements: 16,
      local_element_equiv_length: 2.2,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({
        ambient_temperature: -45,
        process_temperature: 180,
        max_process_temperature: 220,
        wind_speed: 8,
        supply_voltage: 380,
        zone_classification: 'explosive',
        steam_tracing: 'yes',
        temperature_group: 'T4',
      }),
      name: 'P10 · труба · outdoor · высокая T · 380В · пропарка',
      placement: 'outdoor',
      location: 'outdoor',
      outer_diameter: 0.4064,
      wall_thickness: 0.01,
      pipe_material: 'stainless_304',
      pipe_length: 140,
      insulation_thickness: 0.12,
      insulation_material: 'calcium_silicate',
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.08, material: 'calcium_silicate' },
        { thickness: 0.04, material: 'aerogel' },
      ],
      valve_count: 6,
      flange_count: 12,
      support_count: 10,
      num_local_elements: 28,
      local_element_equiv_length: 2.5,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: 8, process_temperature: 35, environment: 'aggressive', temperature_group: 'T6' }),
      name: 'P11 · труба · indoor · ручная λ ИЗ · малый ΔT',
      placement: 'indoor',
      location: 'indoor',
      outer_diameter: 0.0483,
      wall_thickness: 0.0036,
      pipe_lambda: 51,
      pipe_length: 24,
      insulation_thickness: 0.02,
      insulation_material: 'other',
      first_insulation_lambda: 0.033,
      insulation_layer_count: '1',
      insulation_layers: layer(0.02, 'other', 0.033),
      valve_count: 1,
      flange_count: 0,
      support_count: 3,
      local_element_equiv_length: 1,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: -5, process_temperature: 25, environment: 'aggressive', temperature_group: 'T5' }),
      name: 'P12 · труба · underground · пластик · низкая T',
      placement: 'underground',
      location: 'outdoor',
      outer_diameter: 0.075,
      wall_thickness: 0.006,
      pipe_material: 'plastic',
      pipe_length: 75,
      burial_depth: 0.7,
      ground_type: 'custom',
      ground_conductivity: 2.1,
      insulation_thickness: 0.035,
      insulation_material: 'polystyrene_products_50',
      insulation_layer_count: '1',
      insulation_layers: layer(0.035, 'polystyrene_products_50'),
      valve_count: 0,
      flange_count: 0,
      support_count: 0,
      local_element_equiv_length: 1.2,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: -32, process_temperature: 95, wind_speed: 4.8, temperature_group: 'T2' }),
      name: 'P13 · труба · outdoor · медь · цилиндры 80',
      placement: 'outdoor',
      location: 'outdoor',
      outer_diameter: 0.108,
      wall_thickness: 0.004,
      pipe_material: 'copper',
      pipe_length: 46,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool_cylinders_80',
      insulation_layer_count: '1',
      insulation_layers: layer(0.05, 'mineral_wool_cylinders_80'),
      valve_count: 2,
      flange_count: 4,
      support_count: 6,
      num_local_elements: 10,
      local_element_equiv_length: 1.4,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: 20, process_temperature: 85, environment: 'aggressive', zone_classification: 'explosive' }),
      name: 'P14 · труба · indoor · explosive · 3 слоя',
      placement: 'indoor',
      location: 'indoor',
      outer_diameter: 0.159,
      wall_thickness: 0.0045,
      pipe_material: 'carbon_steel',
      pipe_length: 62,
      insulation_thickness: 0.045,
      insulation_material: 'mineral_wool_synthetic_95',
      insulation_layer_count: '3',
      insulation_layers: [
        { thickness: 0.045, material: 'mineral_wool_synthetic_95' },
        { thickness: 0.03, material: 'polyurethane' },
        { thickness: 0.02, material: 'foam_glass' },
      ],
      valve_count: 5,
      flange_count: 5,
      support_count: 5,
      num_local_elements: 15,
      local_element_equiv_length: 1.6,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: -28, process_temperature: 150, safety_factor: 1.5, temperature_group: 'T3' }),
      name: 'P15 · труба · underground · DN500 · тяжелый режим',
      placement: 'underground',
      location: 'outdoor',
      outer_diameter: 0.508,
      wall_thickness: 0.012,
      pipe_material: 'carbon_steel',
      pipe_length: 420,
      burial_depth: 2.2,
      ground_type: 'custom',
      ground_conductivity: 2.6,
      insulation_thickness: 0.14,
      insulation_material: 'foam_glass',
      insulation_layer_count: '3',
      insulation_layers: [
        { thickness: 0.07, material: 'foam_glass' },
        { thickness: 0.05, material: 'calcium_silicate' },
        { thickness: 0.02, material: 'aerogel' },
      ],
      valve_count: 8,
      flange_count: 10,
      support_count: 0,
      num_local_elements: 24,
      local_element_equiv_length: 3,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: -18, process_temperature: 60, wind_speed: 1.5 }),
      name: 'P16 · труба · outdoor · без локальных элементов',
      placement: 'outdoor',
      location: 'outdoor',
      outer_diameter: 0.133,
      wall_thickness: 0.004,
      pipe_material: 'carbon_steel',
      pipe_length: 30,
      insulation_thickness: 0.04,
      insulation_material: 'polyurethane_products_50',
      insulation_layer_count: '1',
      insulation_layers: layer(0.04, 'polyurethane_products_50'),
      valve_count: 0,
      flange_count: 0,
      support_count: 0,
      num_local_elements: 0,
      local_element_equiv_length: 0.1,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: 5, process_temperature: 160, max_process_temperature: 180, temperature_group: 'T4' }),
      name: 'P17 · труба · indoor · силикат кальция · высокая T',
      placement: 'indoor',
      location: 'indoor',
      outer_diameter: 0.2191,
      wall_thickness: 0.006,
      pipe_material: 'stainless_304',
      pipe_length: 52,
      insulation_thickness: 0.09,
      insulation_material: 'calcium_silicate',
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.06, material: 'calcium_silicate' },
        { thickness: 0.03, material: 'mineral_wool_boards_150' },
      ],
      valve_count: 2,
      flange_count: 6,
      support_count: 4,
      num_local_elements: 12,
      local_element_equiv_length: 1.7,
    },
  },
  {
    object_type: 'pipe',
    params: {
      ...common({ ambient_temperature: -50, process_temperature: 30, wind_speed: 9, safety_factor: 1.4, temperature_group: 'T1' }),
      name: 'P18 · труба · outdoor · крио-окружение · аэрогель',
      placement: 'outdoor',
      location: 'outdoor',
      outer_diameter: 0.089,
      wall_thickness: 0.0035,
      pipe_material: 'carbon_steel',
      pipe_length: 110,
      insulation_thickness: 0.06,
      insulation_material: 'aerogel',
      insulation_layer_count: '1',
      insulation_layers: layer(0.06, 'aerogel'),
      valve_count: 3,
      flange_count: 6,
      support_count: 8,
      num_local_elements: 17,
      local_element_equiv_length: 1.1,
    },
  },
];

const additionalTankObjects = [
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -35, process_temperature: 90, wind_speed: 6, safety_factor: 1.35 }),
      name: 'T09 · резервуар цилиндр · outdoor · большой Qдоп',
      placement: 'outdoor',
      location: 'outdoor',
      shape: 'cylindrical',
      diameter: 2.8,
      height: 5.5,
      wall_thickness: 0.012,
      wall_lambda: 45,
      insulation_thickness: 0.1,
      insulation_material: 'mineral_wool_boards_150',
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.07, material: 'mineral_wool_boards_150' },
        { thickness: 0.03, material: 'aerogel' },
      ],
      q_additional: 500,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: 18, process_temperature: 38, environment: 'aggressive', temperature_group: 'T6' }),
      name: 'T10 · резервуар цилиндр · indoor · малый ΔT',
      placement: 'indoor',
      location: 'indoor',
      shape: 'cylindrical',
      diameter: 0.8,
      height: 1.1,
      wall_thickness: 0.005,
      wall_lambda: 45,
      insulation_thickness: 0.025,
      insulation_material: 'polyurethane_products_40',
      insulation_layer_count: '1',
      insulation_layers: layer(0.025, 'polyurethane_products_40'),
      q_additional: 0,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -12, process_temperature: 65, safety_factor: 1.25 }),
      name: 'T11 · резервуар цилиндр · underground · высокий грунт',
      placement: 'underground',
      location: 'outdoor',
      shape: 'cylindrical',
      diameter: 1.9,
      height: 3.4,
      burial_depth: 1.9,
      ground_type: 'custom',
      ground_conductivity: 2.8,
      wall_thickness: 0.009,
      wall_lambda: 45,
      insulation_thickness: 0.08,
      insulation_material: 'foam_glass',
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.05, material: 'foam_glass' },
        { thickness: 0.03, material: 'calcium_silicate' },
      ],
      q_additional: 220,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -40, process_temperature: 110, wind_speed: 7, zone_classification: 'explosive' }),
      name: 'T12 · резервуар прямоуг. · outdoor · explosive',
      placement: 'outdoor',
      location: 'outdoor',
      shape: 'rectangular',
      length: 5.2,
      width: 2.4,
      height: 2.8,
      wall_thickness: 0.014,
      wall_lambda: 45,
      insulation_thickness: 0.12,
      insulation_material: 'calcium_silicate',
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.08, material: 'calcium_silicate' },
        { thickness: 0.04, material: 'mineral_wool_boards_120' },
      ],
      q_additional: 350,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: 22, process_temperature: 50, environment: 'aggressive' }),
      name: 'T13 · резервуар прямоуг. · indoor · other λ',
      placement: 'indoor',
      location: 'indoor',
      shape: 'rectangular',
      length: 2.2,
      width: 1.2,
      height: 1.4,
      wall_thickness: 0.006,
      wall_lambda: 45,
      insulation_thickness: 0.03,
      insulation_material: 'other',
      first_insulation_lambda: 0.038,
      insulation_layer_count: '1',
      insulation_layers: layer(0.03, 'other', 0.038),
      q_additional: 80,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -18, process_temperature: 70 }),
      name: 'T14 · резервуар прямоуг. · underground · 2 слоя',
      placement: 'underground',
      location: 'outdoor',
      shape: 'rectangular',
      length: 3.5,
      width: 1.9,
      height: 2.1,
      burial_depth: 1.3,
      ground_type: 'custom',
      ground_conductivity: 1.4,
      wall_thickness: 0.01,
      wall_lambda: 45,
      insulation_thickness: 0.06,
      insulation_material: 'polystyrene_products_100',
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.04, material: 'polystyrene_products_100' },
        { thickness: 0.02, material: 'foam_glass' },
      ],
      q_additional: 120,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -30, process_temperature: 95, wind_speed: 5.5, safety_factor: 1.3 }),
      name: 'T15 · резервуар сфера · outdoor · аэрогель',
      placement: 'outdoor',
      location: 'outdoor',
      shape: 'spherical',
      diameter: 2.7,
      wall_thickness: 0.012,
      wall_lambda: 45,
      insulation_thickness: 0.08,
      insulation_material: 'aerogel',
      insulation_layer_count: '1',
      insulation_layers: layer(0.08, 'aerogel'),
      q_additional: 180,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: 16, process_temperature: 42, environment: 'normal' }),
      name: 'T16 · резервуар сфера · indoor · компактный',
      placement: 'indoor',
      location: 'indoor',
      shape: 'spherical',
      diameter: 0.9,
      wall_thickness: 0.005,
      wall_lambda: 45,
      insulation_thickness: 0.025,
      insulation_material: 'polyurethane_products_50',
      insulation_layer_count: '1',
      insulation_layers: layer(0.025, 'polyurethane_products_50'),
      q_additional: 0,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -22, process_temperature: 55, safety_factor: 1.25 }),
      name: 'T17 · резервуар цилиндр · underground · малый грунтовый',
      placement: 'underground',
      location: 'outdoor',
      shape: 'cylindrical',
      diameter: 1.5,
      height: 2.2,
      burial_depth: 1.1,
      ground_type: 'custom',
      ground_conductivity: 1.9,
      wall_thickness: 0.007,
      wall_lambda: 45,
      insulation_thickness: 0.055,
      insulation_material: 'foam_glass',
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.035, material: 'foam_glass' },
        { thickness: 0.02, material: 'mineral_wool_cylinders_80' },
      ],
      q_additional: 60,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -45, process_temperature: 150, max_process_temperature: 180, wind_speed: 8 }),
      name: 'T18 · резервуар цилиндр · outdoor · высокая T',
      placement: 'outdoor',
      location: 'outdoor',
      shape: 'cylindrical',
      diameter: 1.7,
      height: 4.2,
      wall_thickness: 0.012,
      wall_lambda: 45,
      insulation_thickness: 0.14,
      insulation_material: 'calcium_silicate',
      insulation_layer_count: '3',
      insulation_layers: [
        { thickness: 0.08, material: 'calcium_silicate' },
        { thickness: 0.04, material: 'foam_glass' },
        { thickness: 0.02, material: 'aerogel' },
      ],
      q_additional: 420,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: 6, process_temperature: 28, environment: 'aggressive', temperature_group: 'T5' }),
      name: 'T19 · резервуар прямоуг. · indoor · низкая T',
      placement: 'indoor',
      location: 'indoor',
      shape: 'rectangular',
      length: 1.1,
      width: 0.8,
      height: 0.9,
      wall_thickness: 0.005,
      wall_lambda: 45,
      insulation_thickness: 0.02,
      insulation_material: 'polystyrene_products_30',
      insulation_layer_count: '1',
      insulation_layers: layer(0.02, 'polystyrene_products_30'),
      q_additional: 20,
    },
  },
  {
    object_type: 'tank',
    params: {
      ...common({ ambient_temperature: -28, process_temperature: 85, zone_classification: 'explosive', temperature_group: 'T4' }),
      name: 'T20 · резервуар цилиндр · underground · explosive',
      placement: 'underground',
      location: 'outdoor',
      shape: 'cylindrical',
      diameter: 2.2,
      height: 3.1,
      burial_depth: 1.6,
      ground_type: 'custom',
      ground_conductivity: 2.2,
      wall_thickness: 0.01,
      wall_lambda: 45,
      insulation_thickness: 0.075,
      insulation_material: 'mineral_wool_synthetic_120',
      insulation_layer_count: '2',
      insulation_layers: [
        { thickness: 0.05, material: 'mineral_wool_synthetic_120' },
        { thickness: 0.025, material: 'foam_glass' },
      ],
      q_additional: 260,
    },
  },
];

seedObjects.push(...additionalPipeObjects, ...additionalTankObjects);

function cloneSeedObject(object) {
  return JSON.parse(JSON.stringify(object));
}

function renumberObjectName(name, objectType, number) {
  const prefix = objectType === 'pipe' ? 'P' : 'T';
  const code = `${prefix}${String(number).padStart(3, '0')}`;
  const rest = String(name ?? '').replace(/^[PT]\d+\s*·\s*/, '');
  return `${code} · ${rest}`;
}

function expandObjectsOfType(objects, objectType, targetCount) {
  const variants = objects.filter((object) => object.object_type === objectType);
  if (targetCount == null) return variants;
  return Array.from({ length: targetCount }, (_, index) => {
    const object = cloneSeedObject(variants[index % variants.length]);
    if (index >= variants.length) {
      object.params.name = renumberObjectName(object.params.name, objectType, index + 1);
    }
    return object;
  });
}

if (objectsPerType != null) {
  seedObjects.splice(
    0,
    seedObjects.length,
    ...expandObjectsOfType(seedObjects, 'pipe', objectsPerType),
    ...expandObjectsOfType(seedObjects, 'tank', objectsPerType),
  );
}

const expectedUiRows = {
  pipe: seedObjects.filter((object) => object.object_type === 'pipe').length,
  tank: seedObjects.filter((object) => object.object_type === 'tank').length,
};
const expectedVisibleUiRows = {
  pipe: Math.min(expectedUiRows.pipe, 50),
  tank: Math.min(expectedUiRows.tank, 50),
};

const electricalVariants = [
  {
    variant_number: 1,
    cable_type: 'self_regulating_tt',
    params: {
      supply_voltage: 220,
      winding_coefficient: 1.1,
      heating_height: 3,
      laying_step: 0.1,
      vapor_temperature: 120,
      aggressive_product: true,
    },
  },
];

async function createGuestViaUi(page) {
  await page.goto(frontendUrl, { waitUntil: 'networkidle', timeout: 30_000 });
  const [guestResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/auth/guest') && response.request().method() === 'POST',
      { timeout: 20_000 },
    ),
    page.getByRole('button', { name: /Начать без регистрации/ }).click(),
  ]);
  if (!guestResponse.ok()) {
    throw new Error(`Guest login failed: ${guestResponse.status()} ${await guestResponse.text()}`);
  }
  return guestResponse.json();
}

async function apiFetch(api, method, route, data) {
  const response = await api.fetch(apiUrl(route), {
    method,
    ...(data === undefined ? {} : { data }),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok()) {
    throw new Error(`${method} ${route} -> ${response.status()} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function resolveProject(api, projectId) {
  if (projectId) {
    return apiFetch(api, 'GET', `/projects/${projectId}`);
  }
  const projects = await apiFetch(api, 'GET', '/projects');
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error('No project found for provided guest session');
  }
  return projects[0];
}

async function clearProjectObjects(api, projectId) {
  const objects = await apiFetch(api, 'GET', `/projects/${projectId}/objects`);
  for (const object of objects) {
    await apiFetch(api, 'DELETE', `/projects/${projectId}/objects/${object.id}`);
  }
  return objects.length;
}

async function setBrowserStorage(page, sessionId, project) {
  await page.goto(frontendUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.evaluate(
    ({ nextSessionId, nextProject }) => {
      localStorage.setItem('session_id', nextSessionId);
      localStorage.setItem('role', 'guest');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.setItem(
        'tlt-current-project',
        JSON.stringify({ state: { currentProject: nextProject }, version: 0 }),
      );
    },
    { nextSessionId: sessionId, nextProject: project },
  );
}

function openerHtml(sessionId, project, targetUrl) {
  const state = JSON.stringify({ sessionId, project, targetUrl }).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><title>Open seeded HeatCalc guest</title><script>const seed=${state};sessionStorage.clear();localStorage.clear();localStorage.setItem('session_id',seed.sessionId);localStorage.setItem('role','guest');localStorage.setItem('tlt-current-project',JSON.stringify({state:{currentProject:seed.project},version:0}));location.replace(seed.targetUrl);</script><p>Redirecting to seeded guest project...</p>`;
}

async function writeOpener(sessionId, project, targetUrl) {
  const html = openerHtml(sessionId, project, targetUrl);
  await fs.writeFile(openerPath, html, 'utf8');

  const publicDir = path.resolve(process.cwd(), 'public');
  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(path.join(publicDir, publicOpenerName), html, 'utf8');
}

async function tableRowCount(page) {
  const rows = page.locator('tr.ant-table-row');
  await rows.first().waitFor({ state: 'visible', timeout: 10_000 });
  return rows.count();
}

async function isNormalGlideTable(page) {
  return (await page.locator('.calc-spreadsheet--normal-glide canvas').count()) > 0;
}

async function waitForNormalTable(page, expectedRows) {
  if (await isNormalGlideTable(page)) {
    await page.locator('.calc-spreadsheet--normal-glide canvas').first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText(String(expectedRows), { exact: true }).first().waitFor({ state: 'visible', timeout: 10_000 });
    return expectedRows;
  }
  return tableRowCount(page);
}

async function openFirstNormalTableRow(page) {
  if (await isNormalGlideTable(page)) {
    const canvas = page.locator('.calc-spreadsheet--normal-glide canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Normal Glide canvas bounds are missing');
    await page.mouse.click(box.x + 80, box.y + 54);
    return;
  }
  await page.locator('tr.ant-table-row').first().click();
}

async function selectObjectType(page, label) {
  const labels = label === 'Резервуары' ? [label, 'Резервуар'] : [label];
  for (const optionLabel of labels) {
    const option = page.getByRole('radio', { name: optionLabel });
    if (await option.count()) {
      try {
        await option.click({ timeout: 2_000 });
        return;
      } catch {
        // Some AntD versions expose the radio input but only the segmented item is clickable.
      }
    }
  }

  for (const optionLabel of labels) {
    const button = page.getByRole('button', { name: new RegExp(`^${optionLabel}`) });
    if (await button.count()) {
      await button.click({ timeout: 2_000 });
      return;
    }
  }

  for (const optionLabel of labels) {
    const iconOption = page.getByLabel(optionLabel, { exact: true });
    if (await iconOption.count()) {
      await iconOption.click({ timeout: 2_000 });
      return;
    }
  }

  for (const optionLabel of labels) {
    const segmentedOption = page.locator('.ant-segmented-item', { hasText: optionLabel });
    if (await segmentedOption.count()) {
      await segmentedOption.click({ timeout: 2_000 });
      return;
    }
  }

  throw new Error(`Object type control not found for "${label}"`);
}

async function main() {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  let api;

  try {
    let sessionId = providedSessionId;
    let project;

    if (sessionId) {
      api = await request.newContext({ extraHTTPHeaders: { 'X-Session-Id': sessionId } });
      project = await resolveProject(api, providedProjectId);
    } else {
      const guest = await createGuestViaUi(page);
      sessionId = guest.session_id;
      project = guest.project;
      api = await request.newContext({ extraHTTPHeaders: { 'X-Session-Id': sessionId } });
    }

    let clearedObjects = 0;
    if (shouldClear) {
      clearedObjects = await clearProjectObjects(api, project.id);
    }

    await apiFetch(api, 'PUT', `/projects/${project.id}`, {
      name: 'Playwright · все варианты · гостевой режим',
      description: [
        'Автозаполнение через Playwright: трубы/резервуары, размещения, слои, стенки, грунт, электрорасчёт ТТ.',
        `Объекты: ${expectedUiRows.pipe} трубопроводов и ${expectedUiRows.tank} резервуаров.`,
      ].join(' '),
      task_number: 'PW-GUEST-ALL',
    });

    for (const [index, item] of seedObjects.entries()) {
      await apiFetch(api, 'POST', `/projects/${project.id}/objects`, {
        object_type: item.object_type,
        sort_order: index,
        params: normalizeSeedParams(item.params),
      });
      if ((index + 1) % 25 === 0 || index + 1 === seedObjects.length) {
        console.error(`Created ${index + 1}/${seedObjects.length} objects`);
      }
    }

    const batchResults = [];
    for (const variant of electricalVariants) {
      const query = new URLSearchParams({
        project_id: project.id,
        cable_source: 'builtin',
        variant_number: String(variant.variant_number),
        cable_type: variant.cable_type,
        force_cable_type: 'true',
      });
      for (const [key, value] of Object.entries(variant.params)) {
        query.set(key, String(value));
      }
      const result = await apiFetch(api, 'POST', `/calc/electrical/batch?${query.toString()}`);
      batchResults.push({
        variant_number: variant.variant_number,
        cable_type: variant.cable_type,
        calculated: result.calculated,
        skipped: result.skipped,
        heat_loss_failed: result.heat_loss_failed,
        errors: result.errors,
      });
    }

    const objects = await apiFetch(api, 'GET', `/projects/${project.id}/objects`);
    const calcs = await apiFetch(api, 'GET', `/calc/electrical?project_id=${project.id}`);
    const storedProject = await apiFetch(api, 'GET', `/projects/${project.id}`);
    const targetUrl = `${frontendUrl}/workspace/heat-calc`;

    await setBrowserStorage(page, sessionId, storedProject);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(700);
    await selectObjectType(page, 'Трубопровод');
    const uiPipeRows = await waitForNormalTable(page, expectedVisibleUiRows.pipe);
    await selectObjectType(page, 'Резервуары');
    const uiTankRows = await waitForNormalTable(page, expectedVisibleUiRows.tank);
    if (uiPipeRows !== expectedVisibleUiRows.pipe || uiTankRows !== expectedVisibleUiRows.tank) {
      throw new Error(
        `Unexpected UI rows after type switch: pipe=${uiPipeRows}/${expectedVisibleUiRows.pipe}, tank=${uiTankRows}/${expectedVisibleUiRows.tank}`,
      );
    }
    const addButton = page.getByRole('button', { name: 'Добавить', exact: true });
    await addButton.hover();
    await page.getByText('Добавить', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 });
    await addButton.click();
    await page.getByText('Форма и геометрия резервуара').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#inline-object-cancel').evaluate((button) => button.click());
    await page.getByText('Режим: добавление', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    await selectObjectType(page, 'Трубопровод');
    await openFirstNormalTableRow(page);
    await page.getByText('Режим: изменение', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    await selectObjectType(page, 'Резервуары');
    await openFirstNormalTableRow(page);
    await page.getByText('Режим: изменение', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('.action-save-button.save').click();
    await page.waitForFunction(() => {
      const saveButton = document.querySelector('.action-save-button.save');
      return !saveButton?.classList.contains('ant-btn-loading');
    }, null, { timeout: 10_000 });
    await page.locator('#inline-object-cancel').evaluate((button) => button.click());
    await page.getByText('Режим: добавление', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
    if (await page.getByRole('button', { name: 'Результаты расчёта' }).count() > 0) {
      throw new Error('Unexpected inner results tab is visible on heat-calc page');
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await writeOpener(sessionId, storedProject, targetUrl);

    const byType = objects.reduce((acc, object) => {
      acc[object.object_type] = (acc[object.object_type] ?? 0) + 1;
      return acc;
    }, {});

    console.log(JSON.stringify({
      session_id: sessionId,
      project_id: project.id,
      project_name: storedProject.name,
      cleared_objects: clearedObjects,
      created_objects: objects.length,
      valid_objects: objects.filter((object) => object.is_valid).length,
      invalid_objects: objects.filter((object) => !object.is_valid).length,
      invalid_objects_details: objects
        .filter((object) => !object.is_valid)
        .map((object) => ({
          sort_order: object.sort_order,
          object_type: object.object_type,
          name: object.params?.name,
          validation_errors: object.validation_errors,
        })),
      by_type: byType,
      electrical_calculations_saved: calcs.length,
      electrical_variants: batchResults.map((result) => ({
        variant_number: result.variant_number,
        cable_type: result.cable_type,
        calculated: result.calculated,
        skipped: result.skipped,
        heat_loss_failed: result.heat_loss_failed,
        error_count: result.errors.length,
        errors: result.errors.map((error) => ({
          object_id: error.object_id,
          error: String(error.error).slice(0, 180),
        })),
      })),
      ui_rows_by_type: {
        pipe: uiPipeRows,
        tank: uiTankRows,
      },
      ui_add_tooltip_checked: true,
      screenshot_path: screenshotPath,
      opener_path: openerPath,
      same_origin_opener_url: `${frontendUrl}/${publicOpenerName}`,
    }, null, 2));
  } finally {
    await api?.dispose();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
