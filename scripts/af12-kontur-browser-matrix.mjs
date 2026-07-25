#!/usr/bin/env node
/**
 * AF12 Kontur-desktop browser matrix (guest workspace routes).
 * Uses same Playwright stack as kontur_playwright MCP (playwright-core + Chrome).
 *
 * Usage (repo root, stack on :3003 / :8000):
 *   node scripts/af12-kontur-browser-matrix.mjs
 */
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3003';
const api = process.env.API_BASE_URL || 'http://127.0.0.1:8000';
const head = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
const headShort = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
const audit = path.join(root, 'docs/audit/2026-07-25-af12-browser-matrix');
const shotDir = path.join(audit, 'screenshots');
const geoDir = path.join(audit, 'geometry');
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(geoDir, { recursive: true });

const areas = [
  { area: 'home', state_id: 'shell.home', path: '/', label: 'Home' },
  { area: 'projects', state_id: 'projects.guest_workspace', path: '/workspace', label: 'Workspace (guest)' },
  { area: 'heat', state_id: 'heat.workspace', path: '/workspace/heat-calc', label: 'Heat calc' },
  { area: 'electrical', state_id: 'electrical.workspace', path: '/workspace/elec-calc', label: 'Electrical' },
  { area: 'specification', state_id: 'specification.workspace', path: '/workspace/specification', label: 'Specification' },
  { area: 'reports', state_id: 'reports.workspace', path: '/workspace/report', label: 'Reports' },
  { area: 'ui-kit', state_id: 'uikit.page', path: '/ui-kit', label: 'UI Kit' },
];

const viewports = [
  { profile: 'kontur-desktop', width: 1440, height: 1000 },
  { profile: 'tlt-primary-qa', width: 1440, height: 900 },
  { profile: 'tlt-dense-1280', width: 1280, height: 800 },
  { profile: 'tlt-shell-1000', width: 1000, height: 768 },
];

function classifyConsole(msgs) {
  const pageerrors = msgs.filter((m) => m.type === 'error' && /pageerror|uncaught/i.test(m.text)).length;
  const errors = msgs.filter((m) => m.type === 'error').length;
  const warnings = msgs.filter((m) => m.type === 'warning').length;
  const antdDeprec = msgs.filter((m) => /deprecated|addonAfter|popupClassName|useForm/i.test(m.text)).length;
  return { pageerrors, errors, warnings, antd_or_form_noise: antdDeprec, excerpts: msgs.slice(0, 12).map((m) => `[${m.type}] ${m.text.slice(0, 160)}`) };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const guestRes = await page.request.post(`${api}/api/v1/auth/guest`);
if (!guestRes.ok()) throw new Error(`guest auth failed ${guestRes.status()}`);
const guest = await guestRes.json();
await page.addInitScript(({ sessionId, project }) => {
  localStorage.setItem('session_id', sessionId);
  localStorage.setItem('role', 'guest');
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  if (project) localStorage.setItem('tlt-current-project', JSON.stringify(project));
}, { sessionId: guest.session_id, project: guest.project });

const rows = [];
const consoleBag = [];

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  for (const a of areas) {
    const msgs = [];
    const onConsole = (msg) => msgs.push({ type: msg.type(), text: msg.text() });
    const onPageError = (err) => msgs.push({ type: 'error', text: `pageerror: ${err.message}` });
    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    const failed = [];
    const onReqFailed = (req) => {
      failed.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText });
    };
    page.on('requestfailed', onReqFailed);

    const url = base + a.path;
    let navError = null;
    const t0 = Date.now();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      navError = String(e?.message || e);
    }

    const metrics = await page.evaluate(() => {
      const de = document.documentElement;
      const body = document.body;
      return {
        title: document.title,
        url: location.href,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientWidth: de.clientWidth,
        clientHeight: de.clientHeight,
        scrollWidth: de.scrollWidth,
        scrollHeight: de.scrollHeight,
        overflowX: de.scrollWidth > de.clientWidth + 1,
        overflowY: de.scrollHeight > de.clientHeight + 1,
        bodyTextSample: (body?.innerText || '').slice(0, 240).replace(/\s+/g, ' '),
      };
    });

    const shotName = `${a.area}__${a.state_id}__${vp.profile}__${vp.width}x${vp.height}.png`;
    await page.screenshot({ path: path.join(shotDir, shotName), fullPage: false });

    const consoleSummary = classifyConsole(msgs);
    const unexpectedNet = failed.filter((f) => !/favicon|sourcemap|hot-update/i.test(f.url));

    const geo = {
      viewport: { width: vp.width, height: vp.height },
      viewport_profile: vp.profile,
      metrics,
      navError,
      console: consoleSummary,
      failed_network: unexpectedNet,
      wall_ms: Date.now() - t0,
    };
    fs.writeFileSync(path.join(geoDir, shotName.replace('.png', '.json')), JSON.stringify(geo, null, 2));

    let result = 'pass';
    let blocker = null;
    if (navError) {
      result = 'fail';
      blocker = navError;
    } else if (metrics.overflowX) {
      result = 'fail';
      blocker = 'horizontal page overflow';
    } else if (consoleSummary.pageerrors > 0) {
      result = 'fail';
      blocker = 'pageerrors > 0';
    }

    rows.push({
      area: a.area,
      state_id: a.state_id,
      state_label: a.label,
      required: true,
      action_path: [
        'POST /api/v1/auth/guest → localStorage session_id/role/project',
        `goto ${a.path}`,
      ],
      url: metrics.url || url,
      viewport: { width: vp.width, height: vp.height },
      viewport_profile: vp.profile,
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
      fixture_or_seed:
        'POST /api/v1/auth/guest — guest user with auto project «Мой проект»',
      result,
      blocker,
      head,
      head_short: headShort,
      captured_at_utc: new Date().toISOString(),
      bodyTextSample: metrics.bodyTextSample,
    });

    consoleBag.push({ key: `${a.area}@${vp.profile}`, console: consoleSummary, net: unexpectedNet.length });

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('requestfailed', onReqFailed);
  }
}

await browser.close();

const summary = {
  head,
  head_short: headShort,
  captured_at_utc: new Date().toISOString(),
  tool: 'scripts/af12-kontur-browser-matrix.mjs (playwright-core chrome; same stack as kontur_playwright MCP)',
  guest_project: { id: guest.project?.id, name: guest.project?.name },
  viewports,
  areas: areas.map((a) => a.area),
  note:
    'Shell/workspace routes at required Kontur + TLT viewports. Full AF11 state matrix (error/excel/wizard rows) remains separate Prompt-14 depth.',
  totals: {
    rows: rows.length,
    pass: rows.filter((r) => r.result === 'pass').length,
    fail: rows.filter((r) => r.result === 'fail').length,
  },
  rows,
};
fs.writeFileSync(path.join(audit, 'evidence.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ totals: summary.totals, head: headShort, audit }, null, 2));
const fails = rows.filter((r) => r.result === 'fail');
if (fails.length) {
  console.log('FAILS:', fails.map((f) => `${f.area}@${f.viewport_profile}: ${f.blocker}`).join('\n'));
  process.exitCode = 1;
}
