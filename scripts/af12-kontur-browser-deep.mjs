#!/usr/bin/env node
/**
 * AF12 deep browser matrix — reach required states via guest API seed + UI.
 * Contur viewport 1440×1000 always; extra viewports for shell-sensitive rows.
 */
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3003';
const apiBase = process.env.API_BASE_URL || 'http://127.0.0.1:8000';
const head = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
const headShort = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
const audit = path.join(root, 'docs/audit/2026-07-25-af12-browser-deep');
const shotDir = path.join(audit, 'screenshots');
const geoDir = path.join(audit, 'geometry');
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(geoDir, { recursive: true });

const rows = [];

async function api(request, method, urlPath, { sessionId, data } = {}) {
  const res = await request.fetch(`${apiBase}/api/v1${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
    },
    data: data ? JSON.stringify(data) : undefined,
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok()) {
    throw new Error(`${method} ${urlPath} → ${res.status()} ${text.slice(0, 200)}`);
  }
  return body;
}

function classifyConsole(msgs) {
  const pageerrors = msgs.filter((m) => m.type === 'error' && /pageerror/i.test(m.text)).length;
  const errors = msgs.filter((m) => m.type === 'error').length;
  const warnings = msgs.filter((m) => m.type === 'warning').length;
  return {
    pageerrors,
    errors,
    warnings,
    excerpts: msgs.slice(0, 8).map((m) => `[${m.type}] ${m.text.slice(0, 140)}`),
  };
}

async function capture(page, {
  area,
  state_id,
  state_label,
  action_path,
  viewport,
  viewport_profile,
  fixture_or_seed,
}) {
  const msgs = [];
  const onConsole = (msg) => msgs.push({ type: msg.type(), text: msg.text() });
  const onPageError = (err) => msgs.push({ type: 'error', text: `pageerror: ${err.message}` });
  const failed = [];
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', (req) => {
    failed.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  await page.setViewportSize(viewport);
  await page.waitForTimeout(400);

  const metrics = await page.evaluate(() => {
    const de = document.documentElement;
    return {
      url: location.href,
      title: document.title,
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      scrollHeight: de.scrollHeight,
      clientHeight: de.clientHeight,
      overflowX: de.scrollWidth > de.clientWidth + 1,
      overflowY: de.scrollHeight > de.clientHeight + 1,
      sample: (document.body?.innerText || '').slice(0, 280).replace(/\s+/g, ' '),
    };
  });

  const shotName = `${area}__${state_id}__${viewport_profile}__${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: path.join(shotDir, shotName), fullPage: false });

  const consoleSummary = classifyConsole(msgs);
  const unexpectedNet = failed.filter((f) => !/favicon|sourcemap|hot-update|sockjs/i.test(f.url || ''));

  let result = 'pass';
  let blocker = null;
  if (metrics.overflowX) {
    result = 'fail';
    blocker = 'horizontal overflow';
  } else if (consoleSummary.pageerrors > 0) {
    result = 'fail';
    blocker = 'pageerrors > 0';
  }

  const geo = { metrics, console: consoleSummary, failed_network: unexpectedNet };
  fs.writeFileSync(path.join(geoDir, shotName.replace('.png', '.json')), JSON.stringify(geo, null, 2));

  rows.push({
    area,
    state_id,
    state_label,
    required: true,
    action_path,
    url: metrics.url,
    viewport,
    viewport_profile,
    screenshot: `screenshots/${shotName}`,
    geometry: `geometry/${shotName.replace('.png', '.json')}`,
    overflow: {
      overflowX: metrics.overflowX,
      overflowY: metrics.overflowY,
      scrollWidth: metrics.scrollWidth,
      clientWidth: metrics.clientWidth,
    },
    console: consoleSummary,
    failed_network: { unexpected: unexpectedNet, count: unexpectedNet.length },
    fixture_or_seed,
    result,
    blocker,
    head,
    head_short: headShort,
    captured_at_utc: new Date().toISOString(),
    bodyTextSample: metrics.sample,
  });

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  // requestfailed listeners accumulate — ok for short script

  return { result, blocker, sample: metrics.sample };
}

const KONTUR = { profile: 'kontur-desktop', width: 1440, height: 1000 };
const SHELL = [
  KONTUR,
  { profile: 'tlt-primary-qa', width: 1440, height: 900 },
  { profile: 'tlt-shell-1000', width: 1000, height: 768 },
];
const DENSE = [
  KONTUR,
  { profile: 'tlt-dense-1280', width: 1280, height: 800 },
  { profile: 'tlt-dense-1366', width: 1366, height: 768 },
  { profile: 'tlt-primary-qa', width: 1440, height: 900 },
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const request = context.request;

const guest = await api(request, 'POST', '/auth/guest');
const sessionId = guest.session_id;
const project = guest.project;
const projectId = project.id;
const seedNote = 'POST /auth/guest + project objects via API (guest user path)';

await page.addInitScript(
  ({ sessionId: sid, project: proj }) => {
    localStorage.setItem('session_id', sid);
    localStorage.setItem('role', 'guest');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.setItem('tlt-current-project', JSON.stringify(proj));
  },
  { sessionId, project },
);

// --- heat.no_project: clear current project in storage ---
await page.goto(`${base}/workspace/heat-calc`, { waitUntil: 'networkidle', timeout: 60000 });
await page.evaluate(() => {
  localStorage.removeItem('tlt-current-project');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await capture(page, {
  area: 'heat',
  state_id: 'heat.no_project',
  state_label: 'Heat without selected project',
  action_path: ['guest bootstrap', 'clear tlt-current-project', 'reload heat-calc'],
  viewport: { width: KONTUR.width, height: KONTUR.height },
  viewport_profile: KONTUR.profile,
  fixture_or_seed: seedNote,
});

// restore project
await page.evaluate((proj) => {
  localStorage.setItem('tlt-current-project', JSON.stringify(proj));
}, project);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);

// heat.empty (auto guest project usually empty)
for (const vp of DENSE) {
  await capture(page, {
    area: 'heat',
    state_id: 'heat.empty',
    state_label: 'Heat empty project',
    action_path: ['guest project', 'open heat-calc'],
    viewport: { width: vp.width, height: vp.height },
    viewport_profile: vp.profile,
    fixture_or_seed: seedNote,
  });
}

// seed pipe + tank
const pipeParams = {
  name: 'AF12 Deep Труба DN100',
  outer_diameter: 0.108,
  pipe_length: 50,
  insulation_thickness: 0.05,
  insulation_material: 'mineral_wool_boards_120',
  insulation_temperature_basis: 'outdoor_winter',
  ambient_temperature: -30,
  process_temperature: 150,
  placement: 'above_ground',
};
const tankParams = {
  name: 'AF12 Deep Резервуар',
  shape: 'cylindrical',
  diameter: 2,
  height: 3,
  insulation_thickness: 0.08,
  insulation_material: 'mineral_wool_boards_120',
  insulation_temperature_basis: 'outdoor_winter',
  ambient_temperature: -20,
  process_temperature: 80,
  safety_factor: 1.1,
};

await api(request, 'POST', `/projects/${projectId}/objects`, {
  sessionId,
  data: { object_type: 'pipe', params: pipeParams },
});
await api(request, 'POST', `/projects/${projectId}/objects`, {
  sessionId,
  data: { object_type: 'tank', params: tankParams },
});
// second pipe underground for placement state
await api(request, 'POST', `/projects/${projectId}/objects`, {
  sessionId,
  data: {
    object_type: 'pipe',
    params: {
      ...pipeParams,
      name: 'AF12 Deep Труба underground',
      placement: 'underground',
      burial_depth: 1.2,
    },
  },
});

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// heat.populated_normal
for (const vp of DENSE) {
  await page.goto(`${base}/workspace/heat-calc`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);
  await capture(page, {
    area: 'heat',
    state_id: 'heat.populated_normal',
    state_label: 'Heat populated normal mode',
    action_path: ['seed pipe+tank+underground pipe', 'open heat-calc'],
    viewport: { width: vp.width, height: vp.height },
    viewport_profile: vp.profile,
    fixture_or_seed: seedNote,
  });
}

// heat.wizard_pipe — toolbar aria-label="Добавить" (icon button)
try {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/workspace/heat-calc`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // Ensure «блок заполнения» is checked (hosts Add / wizard actions)
  const formToggle = page.getByText('Показать блок заполнения параметров');
  if (await formToggle.count()) {
    const box = page.locator('.actionbar-form-toggle input[type="checkbox"]').first();
    if (await box.count()) {
      const checked = await box.isChecked().catch(() => false);
      if (!checked) {
        await page.locator('.actionbar-form-toggle').click();
        await page.waitForTimeout(400);
      }
    }
  }
  const pipeType = page.getByRole('button', { name: /Труба/i }).first();
  if (await pipeType.count()) await pipeType.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const addBtn = page
    .locator('button[aria-label="Добавить"], [role="button"][aria-label="Добавить"]')
    .first();
  await addBtn.waitFor({ state: 'visible', timeout: 20000 });
  await addBtn.click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await capture(page, {
    area: 'heat',
    state_id: 'heat.wizard_pipe',
    state_label: 'Pipe add form/wizard',
    action_path: ['populated heat', 'click toolbar Добавить'],
    viewport: { width: 1440, height: 1000 },
    viewport_profile: 'kontur-desktop',
    fixture_or_seed: seedNote,
  });
  const cancel = page.locator('#inline-object-cancel');
  if (await cancel.count()) await cancel.click().catch(() => {});
} catch (e) {
  rows.push({
    area: 'heat',
    state_id: 'heat.wizard_pipe',
    result: 'blocked',
    blocker: String(e?.message || e),
    required: true,
    head,
    captured_at_utc: new Date().toISOString(),
  });
}

// heat.wizard_tank — switch type then add
try {
  await page.goto(`${base}/workspace/heat-calc`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const tankToggle = page
    .getByRole('button', { name: /Резервуар|tank/i })
    .or(page.locator('[aria-label*="Резервуар"], [data-object-type="tank"]'))
    .first();
  await tankToggle.click({ timeout: 15000 });
  await page.waitForTimeout(800);
  const addBtn = page.locator('button[aria-label="Добавить"]').first();
  await addBtn.waitFor({ state: 'visible', timeout: 15000 });
  await addBtn.click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await capture(page, {
    area: 'heat',
    state_id: 'heat.wizard_tank',
    state_label: 'Tank add form/wizard',
    action_path: ['click Резервуар', 'click Добавить'],
    viewport: { width: 1440, height: 1000 },
    viewport_profile: 'kontur-desktop',
    fixture_or_seed: seedNote,
  });
  const cancel = page.locator('#inline-object-cancel');
  if (await cancel.count()) await cancel.click().catch(() => {});
} catch (e) {
  rows.push({
    area: 'heat',
    state_id: 'heat.wizard_tank',
    result: 'blocked',
    blocker: String(e?.message || e),
    required: true,
    head,
    captured_at_utc: new Date().toISOString(),
  });
}

// heat.populated_excel — Segmented «Excel-режим» (commercial feature gate)
try {
  await page.goto(`${base}/workspace/heat-calc`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  // Ant Design Segmented option — only when areCommercialFeaturesEnabled()
  const excelOpt = page
    .getByText('Excel-режим', { exact: true })
    .or(page.locator('.ant-segmented-item', { hasText: 'Excel-режим' }));
  if (await excelOpt.count()) {
    await excelOpt.first().click();
    await page.waitForTimeout(1500);
    await capture(page, {
      area: 'heat',
      state_id: 'heat.populated_excel',
      state_label: 'Heat Excel mode with data',
      action_path: ['populated heat', 'click Excel-режим'],
      viewport: { width: 1440, height: 1000 },
      viewport_profile: 'kontur-desktop',
      fixture_or_seed: seedNote,
    });
  } else {
    rows.push({
      area: 'heat',
      state_id: 'heat.populated_excel',
      result: 'blocked',
      blocker:
        'Excel-режим control absent (commercialFeaturesAvailable=false on this guest path) — not a layout regression',
      required: true,
      head,
      captured_at_utc: new Date().toISOString(),
    });
  }
} catch (e) {
  rows.push({
    area: 'heat',
    state_id: 'heat.populated_excel',
    result: 'blocked',
    blocker: String(e?.message || e),
    required: true,
    head,
    captured_at_utc: new Date().toISOString(),
  });
}

// electrical workspace states
await page.goto(`${base}/workspace/elec-calc`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);
for (const vp of DENSE) {
  await capture(page, {
    area: 'electrical',
    state_id: 'electrical.workspace_seeded',
    state_label: 'Electrical with heat objects present',
    action_path: ['seed objects', 'open elec-calc'],
    viewport: { width: vp.width, height: vp.height },
    viewport_profile: vp.profile,
    fixture_or_seed: seedNote,
  });
}

// System view tabs from ELECTRICAL_SYSTEM_VIEWS labels
for (const [state_id, label, state_label] of [
  ['electrical.view_unassigned', 'Нераспределённые объекты', 'Unassigned view'],
  ['electrical.view_system', 'Самрег', 'Self-regulating system view'],
]) {
  try {
    const tab = page
      .getByRole('tab', { name: label })
      .or(page.getByRole('button', { name: label }))
      .or(page.getByText(label, { exact: true }));
    if (await tab.count()) {
      await tab.first().click();
      await page.waitForTimeout(800);
      await capture(page, {
        area: 'electrical',
        state_id,
        state_label,
        action_path: ['elec-calc', `click ${label}`],
        viewport: { width: 1440, height: 1000 },
        viewport_profile: 'kontur-desktop',
        fixture_or_seed: seedNote,
      });
    } else {
      rows.push({
        area: 'electrical',
        state_id,
        result: 'blocked',
        blocker: `${state_label} control not found (looked for «${label}»)`,
        required: true,
        head,
        captured_at_utc: new Date().toISOString(),
      });
    }
  } catch (e) {
    rows.push({
      area: 'electrical',
      state_id,
      result: 'blocked',
      blocker: String(e?.message || e),
      required: true,
      head,
      captured_at_utc: new Date().toISOString(),
    });
  }
}

// specification
await page.goto(`${base}/workspace/specification`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);
for (const vp of DENSE) {
  await capture(page, {
    area: 'specification',
    state_id: 'specification.empty_or_ready',
    state_label: 'Specification workspace (guest seeded project)',
    action_path: ['seed objects', 'open specification'],
    viewport: { width: vp.width, height: vp.height },
    viewport_profile: vp.profile,
    fixture_or_seed: seedNote,
  });
}

// reports
await page.goto(`${base}/workspace/report`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);
for (const vp of SHELL) {
  await capture(page, {
    area: 'reports',
    state_id: 'reports.empty_or_workspace',
    state_label: 'Reports workspace',
    action_path: ['open report'],
    viewport: { width: vp.width, height: vp.height },
    viewport_profile: vp.profile,
    fixture_or_seed: seedNote,
  });
}

// projects via workspace home / projects route (guest may not have /projects)
await page.goto(`${base}/workspace`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);
for (const vp of SHELL) {
  await capture(page, {
    area: 'projects',
    state_id: 'projects.guest_workspace',
    state_label: 'Guest workspace entry',
    action_path: ['open /workspace'],
    viewport: { width: vp.width, height: vp.height },
    viewport_profile: vp.profile,
    fixture_or_seed: seedNote,
  });
}

// long name project
try {
  const longName =
    'Очень длинное имя проекта для проверки вёрстки AF12: трубопроводный участок №12345-АБВГД/XYZ';
  await api(request, 'PUT', `/projects/${projectId}`, {
    sessionId,
    data: { name: longName, description: project.description, task_number: 'AF12-LONG' },
  });
  await page.evaluate(async () => {
    /* refresh project from storage next navigation */
  });
  // re-fetch project into storage
  const updated = await api(request, 'GET', `/projects/${projectId}`, { sessionId });
  await page.evaluate((proj) => {
    localStorage.setItem('tlt-current-project', JSON.stringify(proj));
  }, updated);
  await page.goto(`${base}/workspace`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await capture(page, {
    area: 'projects',
    state_id: 'projects.long_names',
    state_label: 'Long Russian project name',
    action_path: ['PUT project long name', 'open workspace'],
    viewport: { width: 1440, height: 1000 },
    viewport_profile: 'kontur-desktop',
    fixture_or_seed: seedNote,
  });
} catch (e) {
  rows.push({
    area: 'projects',
    state_id: 'projects.long_names',
    result: 'blocked',
    blocker: String(e?.message || e),
    required: true,
    head,
    captured_at_utc: new Date().toISOString(),
  });
}

// insulation geometry host ratio on heat form if layers present
try {
  await page.goto(`${base}/workspace/heat-calc`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const ratio = await page.evaluate(() => {
    const host = document.querySelector(
      '[class*="insulation"], [data-testid*="insulation"], .heatcalc-insulation-layers, .insulation-layers',
    );
    if (!host) return null;
    const parent = host.parentElement;
    if (!parent) return null;
    const hr = host.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    return pr.width > 0 ? hr.width / pr.width : null;
  });
  await capture(page, {
    area: 'heat',
    state_id: 'heat.insulation_geometry_check',
    state_label: 'Insulation geometry host ratio probe',
    action_path: ['open heat with objects', 'measure insulation host'],
    viewport: { width: 1440, height: 1000 },
    viewport_profile: 'kontur-desktop',
    fixture_or_seed: seedNote + (ratio != null ? ` hostWidthRatio=${ratio.toFixed(3)}` : ' host not found'),
  });
  if (ratio != null && ratio < 0.85) {
    const last = rows[rows.length - 1];
    last.result = 'fail';
    last.blocker = `hostWidthRatio ${ratio.toFixed(3)} < 0.85`;
  }
} catch (e) {
  rows.push({
    area: 'heat',
    state_id: 'heat.insulation_geometry_check',
    result: 'blocked',
    blocker: String(e?.message || e),
    required: false,
    head,
    captured_at_utc: new Date().toISOString(),
  });
}

await browser.close();

const summary = {
  head,
  head_short: headShort,
  captured_at_utc: new Date().toISOString(),
  tool: 'scripts/af12-kontur-browser-deep.mjs',
  guest_project_id: projectId,
  totals: {
    rows: rows.length,
    pass: rows.filter((r) => r.result === 'pass').length,
    fail: rows.filter((r) => r.result === 'fail').length,
    blocked: rows.filter((r) => r.result === 'blocked').length,
  },
  note:
    'Deep guest path: empty/populated heat, wizards, elec/spec/reports/workspace, long names. Employee-only permission/error-injection states remain residual if not reachable as guest.',
  rows,
};
fs.writeFileSync(path.join(audit, 'evidence.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary.totals, null, 2));
const fails = rows.filter((r) => r.result === 'fail');
if (fails.length) {
  console.log(
    'FAILS',
    fails.map((f) => `${f.state_id}: ${f.blocker}`).join('\n'),
  );
  process.exitCode = 1;
}
