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
const shouldClear = hasFlag('clear');
const screenshotPath = argValue(
  'screenshot',
  process.env.SEED_SCREENSHOT ?? path.join(os.tmpdir(), 'tlt-seeded-guest.png'),
);
const openerPath = argValue(
  'opener',
  process.env.SEED_OPENER ?? path.join(os.tmpdir(), 'tlt-open-seeded-guest.html'),
);

function apiUrl(route) {
  return `${apiBaseUrl}${route.startsWith('/') ? route : `/${route}`}`;
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

const expectedUiRows = {
  pipe: seedObjects.filter((object) => object.object_type === 'pipe').length,
  tank: seedObjects.filter((object) => object.object_type === 'tank').length,
};

const electricalVariants = [
  {
    variant_number: 1,
    cable_type: 'self_regulating',
    params: { supply_voltage: 220, winding_coefficient: 1, heating_height: 3, laying_step: 0.1 },
  },
  {
    variant_number: 2,
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
  {
    variant_number: 3,
    cable_type: 'single_core',
    params: {
      supply_voltage: 220,
      connection_type: 'line_1ph',
      winding_coefficient: 1,
      heating_height: 3,
      laying_step: 0.1,
    },
  },
  {
    variant_number: 4,
    cable_type: 'three_core',
    params: {
      supply_voltage: 380,
      connection_type: 'star_3x3',
      winding_coefficient: 1,
      heating_height: 3,
      laying_step: 0.1,
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

async function writeOpener(sessionId, project, targetUrl) {
  const state = JSON.stringify({ sessionId, project, targetUrl }).replace(/</g, '\\u003c');
  await fs.writeFile(
    openerPath,
    `<!doctype html><meta charset="utf-8"><title>Open seeded HeatCalc guest</title><script>const seed=${state};localStorage.setItem('session_id',seed.sessionId);localStorage.setItem('role','guest');localStorage.removeItem('access_token');localStorage.removeItem('refresh_token');localStorage.setItem('tlt-current-project',JSON.stringify({state:{currentProject:seed.project},version:0}));location.replace(seed.targetUrl);</script><p>Redirecting to seeded guest project...</p>`,
    'utf8',
  );
}

async function tableRowCount(page) {
  const rows = page.locator('tr.ant-table-row');
  await rows.first().waitFor({ state: 'visible', timeout: 10_000 });
  return rows.count();
}

async function selectObjectType(page, label) {
  const option = page.getByRole('radio', { name: label });
  if (await option.count()) {
    try {
      await option.click({ timeout: 2_000 });
      return;
    } catch {
      // Some AntD versions expose the radio input but only the segmented item is clickable.
    }
  }
  await page.locator('.ant-segmented-item', { hasText: label }).click();
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
      description:
        'Автозаполнение через Playwright: трубы/резервуары, размещения, слои, стенки, грунт, электрорасчёты СО1-СО4.',
      task_number: 'PW-GUEST-ALL',
    });

    for (const [index, item] of seedObjects.entries()) {
      await apiFetch(api, 'POST', `/projects/${project.id}/objects`, {
        object_type: item.object_type,
        sort_order: index,
        params: item.params,
      });
    }

    const batchResults = [];
    for (const variant of electricalVariants) {
      const query = new URLSearchParams({
        project_id: project.id,
        cable_source: 'builtin',
        variant_number: String(variant.variant_number),
        cable_type: variant.cable_type,
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
    await page.getByText('P01 · труба', { exact: false }).waitFor({ state: 'visible', timeout: 10_000 });
    const uiPipeRows = await tableRowCount(page);
    await selectObjectType(page, 'Резервуары');
    await page.getByText('T01 · резервуар', { exact: false }).waitFor({ state: 'visible', timeout: 10_000 });
    const uiTankRows = await tableRowCount(page);
    if (uiPipeRows !== expectedUiRows.pipe || uiTankRows !== expectedUiRows.tank) {
      throw new Error(
        `Unexpected UI rows after type switch: pipe=${uiPipeRows}/${expectedUiRows.pipe}, tank=${uiTankRows}/${expectedUiRows.tank}`,
      );
    }
    await page.getByRole('button', { name: /Результаты расчёта/ }).click();
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
      screenshot_path: screenshotPath,
      opener_path: openerPath,
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
