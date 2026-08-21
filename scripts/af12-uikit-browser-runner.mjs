#!/usr/bin/env node
/**
 * AF12-UIKIT-BROWSER-RUNNER-01 — repeatable /ui-kit desktop matrix.
 *
 * Usage (stack on E2E_BASE_URL, default http://127.0.0.1:3003):
 *   node scripts/af12-uikit-browser-runner.mjs
 *   node scripts/af12-uikit-browser-runner.mjs --out docs/audit/2026-07-25-af12-uikit-browser-runner
 */
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3003';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outArg = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'docs/audit/2026-07-25-af12-uikit-browser-runner';
const outRoot = path.join(root, outArg);
const shotDir = path.join(outRoot, 'screenshots');
const geoDir = path.join(outRoot, 'geometry');
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(geoDir, { recursive: true });

const head = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
const headShort = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();

/** Product contract: desktop only ≥1000px */
const VIEWPORTS = [
  { profile: 'tlt-shell-1000', w: 1000, h: 768 },
  { profile: 'tlt-compact-1024', w: 1024, h: 768 },
  { profile: 'tlt-dense-1280', w: 1280, h: 800 },
  { profile: 'tlt-dense-1366', w: 1366, h: 768 },
  { profile: 'tlt-primary-qa', w: 1440, h: 900 },
  { profile: 'kontur-desktop', w: 1440, h: 1000 },
  { profile: 'tlt-wide', w: 1920, h: 1080 },
];

const SELECTORS = [
  '.uikit-page',
  '.uikit-header',
  '.uikit-shell',
  '.uikit-nav',
  '.uikit-main',
  '.uikit-heatcalc-reference',
  '.uikit-heatcalc-form',
  '.uikit-alerts',
  '.uikit-metrics',
  '.uikit-primitive-grid',
];

const STATES = [
  {
    id: 'compact_density',
    async run(page) {
      await page.goto(`${base}/ui-kit`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(400);
      const c = page.getByText(/Компактн/i).first();
      if (await c.count()) await c.click().catch(() => {});
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'comfortable_density',
    async run(page) {
      await page.goto(`${base}/ui-kit`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(400);
      const c = page.getByText(/Свободн/i).first();
      if (await c.count()) await c.click().catch(() => {});
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'heat_form_action_table',
    async run(page) {
      await page.goto(`${base}/ui-kit`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(400);
      await page.evaluate(() =>
        document.querySelector('.uikit-heatcalc-reference')?.scrollIntoView({ block: 'center' }),
      );
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'alerts_tabs_metrics',
    async run(page) {
      await page.goto(`${base}/ui-kit`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(400);
      await page.evaluate(() =>
        document.querySelector('.uikit-alerts, .uikit-metrics')?.scrollIntoView({ block: 'center' }),
      );
      await page.waitForTimeout(300);
    },
  },
  {
    id: 'focus_keyboard',
    async run(page) {
      await page.goto(`${base}/ui-kit`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(300);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);
    },
  },
];

async function measure(page) {
  return page.evaluate((sels) => {
    const de = document.documentElement;
    const bounds = {};
    const computed = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) {
        bounds[sel] = null;
        computed[sel] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      bounds[sel] = { x: r.x, y: r.y, width: r.width, height: r.height };
      const cs = getComputedStyle(el);
      computed[sel] = {
        display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns,
        gap: cs.gap,
        padding: cs.padding,
        overflow: cs.overflow,
        overflowX: cs.overflowX,
      };
    }
    return {
      url: location.href,
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      overflowX: de.scrollWidth > de.clientWidth + 1,
      bounds,
      computed,
    };
  }, SELECTORS);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const rows = [];

for (const st of STATES) {
  for (const vp of VIEWPORTS) {
    const msgs = [];
    const failed = [];
    const onC = (m) => msgs.push({ type: m.type(), text: m.text() });
    const onE = (e) => msgs.push({ type: 'error', text: `pageerror: ${e.message}` });
    const onF = (r) => failed.push(r.url());
    page.on('console', onC);
    page.on('pageerror', onE);
    page.on('requestfailed', onF);

    await page.setViewportSize({ width: vp.w, height: vp.h });
    await st.run(page);
    const metrics = await measure(page);
    const name = `${st.id}__${vp.profile}__${vp.w}x${vp.h}`;
    await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false });

    const row = {
      head,
      head_short: headShort,
      state_id: st.id,
      viewport_profile: vp.profile,
      viewport: { width: vp.w, height: vp.h },
      url: metrics.url,
      overflowX: metrics.overflowX,
      scrollWidth: metrics.scrollWidth,
      clientWidth: metrics.clientWidth,
      bounds: metrics.bounds,
      computed: metrics.computed,
      console: {
        errors: msgs.filter((m) => m.type === 'error').length,
        warnings: msgs.filter((m) => m.type === 'warning').length,
        pageerrors: msgs.filter((m) => /pageerror/i.test(m.text)).length,
        excerpts: msgs.slice(0, 8).map((m) => `[${m.type}] ${m.text.slice(0, 100)}`),
      },
      failed_network: failed.filter((u) => !/favicon|sourcemap|hot-update/i.test(u || '')),
      screenshot: `screenshots/${name}.png`,
      captured_at_utc: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(geoDir, `${name}.json`), JSON.stringify(row, null, 2));
    rows.push(row);

    page.off('console', onC);
    page.off('pageerror', onE);
    page.off('requestfailed', onF);
  }
}

// reduced motion @ kontur-desktop
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(`${base}/ui-kit`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const rm = await page.evaluate(() => {
  const any = document.querySelector('.uikit-page *');
  const cs = any ? getComputedStyle(any) : null;
  return { animationDuration: cs?.animationDuration, scrollBehavior: cs?.scrollBehavior };
});
fs.writeFileSync(path.join(geoDir, 'reduced_motion.json'), JSON.stringify(rm, null, 2));

await browser.close();

const summary = {
  head,
  head_short: headShort,
  product_contract: 'desktop >= 1000px only',
  mobile: 'OUT OF PRODUCT SCOPE',
  rows: rows.length,
  overflow_fail: rows.filter((r) => r.overflowX).length,
  console_errors: rows.reduce((a, r) => a + r.console.errors, 0),
  pageerrors: rows.reduce((a, r) => a + r.console.pageerrors, 0),
  net_fail: rows.reduce((a, r) => a + r.failed_network.length, 0),
  viewports: VIEWPORTS.map((v) => `${v.w}x${v.h}`),
  states: STATES.map((s) => s.id),
};
fs.writeFileSync(path.join(outRoot, 'summary.json'), JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.overflow_fail || summary.pageerrors) process.exitCode = 1;
