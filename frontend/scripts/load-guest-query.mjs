import { request } from 'playwright';
import { performance } from 'node:perf_hooks';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

function usage() {
  console.log(`Load-test guest project object query endpoints.

Usage:
  npm run load:guest-query
  npm run load:guest-query -- --clear --per-type=200 --iterations=300 --concurrency=12
  GUEST_SESSION_ID=... PROJECT_ID=... npm run load:guest-query

Options:
  --api=<url>             API base URL, default ${DEFAULT_API_BASE_URL}
  --session-id=<id>       Reuse an existing guest session
  --project-id=<uuid>     Reuse an existing guest project
  --per-type=<n>          Ensure n pipe and n tank objects before load, default 200
  --iterations=<n>        Total measured requests, default 240
  --concurrency=<n>       Parallel workers, default 8
  --seed-concurrency=<n>  Parallel object creates/deletes during setup, default 4
  --max-p95=<ms>          Fail if global p95 exceeds this value, default 1000
  --clear                 Delete existing project objects before seeding
  --help                  Print this help
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

function positiveInt(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${label} must be a positive integer`);
  }
  return parsed;
}

if (hasFlag('help')) {
  usage();
  process.exit(0);
}

const apiBaseUrl = argValue('api', process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
const providedSessionId = argValue('session-id', process.env.GUEST_SESSION_ID ?? '');
const providedProjectId = argValue('project-id', process.env.PROJECT_ID ?? '');
const objectsPerType = positiveInt(argValue('per-type', process.env.LOAD_OBJECTS_PER_TYPE ?? '200'), 'per-type');
const iterations = positiveInt(argValue('iterations', process.env.LOAD_ITERATIONS ?? '240'), 'iterations');
const concurrency = positiveInt(argValue('concurrency', process.env.LOAD_CONCURRENCY ?? '8'), 'concurrency');
const seedConcurrency = positiveInt(
  argValue('seed-concurrency', process.env.LOAD_SEED_CONCURRENCY ?? '4'),
  'seed-concurrency',
);
const maxP95Ms = positiveInt(argValue('max-p95', process.env.LOAD_MAX_P95_MS ?? '1000'), 'max-p95');
const shouldClear = hasFlag('clear');

function apiUrl(route) {
  return `${apiBaseUrl}${route.startsWith('/') ? route : `/${route}`}`;
}

async function assertOk(response, label) {
  if (!response.ok()) {
    throw new Error(`${label} failed: HTTP ${response.status()} ${await response.text()}`);
  }
  return response;
}

function pipePayload(index, sortOrder) {
  const insulationMaterial = index % 2 === 0 ? 'mineral_wool' : 'foam_glass';
  const placement = index % 3 === 0 ? 'outdoor' : 'indoor';
  return {
    object_type: 'pipe',
    sort_order: sortOrder,
    params: {
      name: `Load Pipe ${index}`,
      placement,
      location: placement === 'indoor' ? 'indoor' : 'outdoor',
      outer_diameter: 0.108,
      wall_thickness: 0.004,
      pipe_material: 'carbon_steel',
      pipe_length: 50 + (index % 20),
      insulation_thickness: 0.05,
      insulation_material: insulationMaterial,
      insulation_layer_count: '1',
      insulation_layers: [{ thickness: 0.05, material: insulationMaterial }],
      process_temperature: 80,
      ambient_temperature: -20,
      max_process_temperature: 90,
      environment: 'normal',
      zone_classification: 'safe',
      temperature_group: 'T1',
      wind_speed: 3,
      min_switch_temperature: -20,
      supply_voltage: 220,
      safety_factor: 1.1,
      steam_tracing: 'no',
      valve_count: 2,
      flange_count: 2,
      support_count: 2,
      num_local_elements: 6,
      local_element_equiv_length: 1.5,
    },
  };
}

function tankPayload(index, sortOrder) {
  const insulationMaterial = index % 2 === 0 ? 'mineral_wool' : 'foam_glass';
  return {
    object_type: 'tank',
    sort_order: sortOrder,
    params: {
      name: `Load Tank ${index}`,
      shape: 'cylindrical',
      diameter: 2 + (index % 4) * 0.25,
      height: 3,
      wall_thickness: 0.006,
      wall_lambda: 45,
      placement: 'outdoor',
      location: 'outdoor',
      heating_height: 3,
      laying_step: 0.2,
      insulation_thickness: 0.08,
      insulation_material: insulationMaterial,
      insulation_layer_count: '1',
      insulation_layers: [{ thickness: 0.08, material: insulationMaterial }],
      process_temperature: 70,
      ambient_temperature: -20,
      max_process_temperature: 90,
      environment: 'normal',
      zone_classification: 'safe',
      temperature_group: 'T1',
      wind_speed: 3,
      min_switch_temperature: -20,
      supply_voltage: 220,
      safety_factor: 1.1,
      steam_tracing: 'no',
      q_additional: 0,
    },
  };
}

async function runPool(items, limit, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const current = items[next];
        next += 1;
        await worker(current);
      }
    }),
  );
}

async function getObjects(context, projectId, headers) {
  const response = await assertOk(
    await context.get(apiUrl(`/projects/${projectId}/objects`), { headers }),
    'GET /objects',
  );
  return response.json();
}

async function main() {
  const context = await request.newContext();
  let sessionId = providedSessionId;
  let projectId = providedProjectId;

  try {
    if (!sessionId) {
      const response = await assertOk(await context.post(apiUrl('/auth/guest')), 'POST /auth/guest');
      const body = await response.json();
      sessionId = body.session_id;
      projectId = body.project.id;
    }

    const headers = { 'X-Session-Id': sessionId };
    if (!projectId) {
      const response = await assertOk(
        await context.get(apiUrl('/projects'), { headers }),
        'GET /projects',
      );
      const projects = await response.json();
      if (!projects[0]?.id) {
        throw new Error('Guest session has no project');
      }
      projectId = projects[0].id;
    }

    console.log(`session=${sessionId}`);
    console.log(`project=${projectId}`);

    if (shouldClear) {
      const objects = await getObjects(context, projectId, headers);
      await runPool(objects, seedConcurrency, async (object) => {
        await assertOk(
          await context.delete(apiUrl(`/projects/${projectId}/objects/${object.id}`), { headers }),
          `DELETE object ${object.id}`,
        );
      });
      console.log(`cleared=${objects.length}`);
    }

    const existingObjects = await getObjects(context, projectId, headers);
    const existingByType = existingObjects.reduce(
      (acc, object) => {
        acc[object.object_type] = (acc[object.object_type] ?? 0) + 1;
        return acc;
      },
      { pipe: 0, tank: 0 },
    );

    const creates = [];
    for (let index = existingByType.pipe; index < objectsPerType; index += 1) {
      creates.push(pipePayload(index, index));
    }
    for (let index = existingByType.tank; index < objectsPerType; index += 1) {
      creates.push(tankPayload(index, objectsPerType + index));
    }

    await runPool(creates, seedConcurrency, async (payload) => {
      await assertOk(
        await context.post(apiUrl(`/projects/${projectId}/objects`), { headers, data: payload }),
        `POST ${payload.object_type}`,
      );
    });
    console.log(`seeded=${creates.length} target_per_type=${objectsPerType}`);

    const scenarios = [
      {
        label: 'summary',
        run: () => context.get(apiUrl(`/projects/${projectId}/objects/summary`), { headers }),
      },
      {
        label: 'pipe-page-1',
        run: () =>
          context.post(apiUrl(`/projects/${projectId}/objects/query`), {
            headers,
            data: { object_type: 'pipe', page: 1, page_size: 50 },
          }),
      },
      {
        label: 'pipe-page-2',
        run: () =>
          context.post(apiUrl(`/projects/${projectId}/objects/query`), {
            headers,
            data: { object_type: 'pipe', page: 2, page_size: 50 },
          }),
      },
      {
        label: 'tank-page-1',
        run: () =>
          context.post(apiUrl(`/projects/${projectId}/objects/query`), {
            headers,
            data: { object_type: 'tank', page: 1, page_size: 50 },
          }),
      },
      {
        label: 'pipe-capabilities',
        run: () =>
          context.get(apiUrl(`/projects/${projectId}/objects/query-capabilities`), {
            headers,
            params: { object_type: 'pipe' },
          }),
      },
      {
        label: 'tank-capabilities',
        run: () =>
          context.get(apiUrl(`/projects/${projectId}/objects/query-capabilities`), {
            headers,
            params: { object_type: 'tank' },
          }),
      },
    ];

    const warmupResponses = await Promise.all(scenarios.map((scenario) => scenario.run()));
    await Promise.all(warmupResponses.map((response, index) => assertOk(response, `warmup ${scenarios[index].label}`)));

    const results = [];
    let nextIteration = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (nextIteration < iterations) {
          const iteration = nextIteration;
          nextIteration += 1;
          const scenario = scenarios[iteration % scenarios.length];
          const start = performance.now();
          const response = await scenario.run();
          const elapsedMs = performance.now() - start;
          const ok = response.ok();
          results.push({
            label: scenario.label,
            status: response.status(),
            ok,
            elapsedMs,
            body: ok ? '' : await response.text(),
          });
        }
      }),
    );

    const failures = results.filter((result) => !result.ok);
    const allStats = summarize(results.map((result) => result.elapsedMs));
    console.log(`requests=${results.length} concurrency=${concurrency}`);
    printStats('all', allStats);

    for (const scenario of scenarios) {
      const values = results
        .filter((result) => result.label === scenario.label)
        .map((result) => result.elapsedMs);
      printStats(scenario.label, summarize(values));
    }

    if (failures.length > 0) {
      for (const failure of failures.slice(0, 5)) {
        console.error(`${failure.label}: HTTP ${failure.status} ${failure.body}`);
      }
      throw new Error(`${failures.length} load requests failed`);
    }
    if (allStats.p95 > maxP95Ms) {
      throw new Error(`global p95 ${allStats.p95.toFixed(0)}ms exceeds ${maxP95Ms}ms`);
    }
  } finally {
    await context.dispose();
  }
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count: sorted.length,
    avg: sum / sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1],
  };
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sortedValues.length) - 1),
  );
  return sortedValues[index];
}

function printStats(label, stats) {
  console.log(
    `${label}: count=${stats.count} avg=${stats.avg.toFixed(0)}ms p50=${stats.p50.toFixed(0)}ms p95=${stats.p95.toFixed(0)}ms max=${stats.max.toFixed(0)}ms`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
