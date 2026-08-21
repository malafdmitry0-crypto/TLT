import { chromium, request } from 'playwright';
import { performance } from 'node:perf_hooks';

const DEFAULT_URL = 'http://localhost:3003';
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000/api/v1';

function usage() {
  console.log(`Measure frontend interaction timings on a running TLT frontend.

Usage:
  npm run perf:frontend
  npm run perf:frontend -- --url=http://localhost:3003 --api=http://127.0.0.1:8000/api/v1
  GUEST_SESSION_ID=... PROJECT_ID=... npm run perf:frontend

Options:
  --url=<url>             Frontend URL, default ${DEFAULT_URL}
  --api=<url>             API base URL, default ${DEFAULT_API_BASE_URL}
  --session-id=<id>       Reuse a guest session
  --project-id=<uuid>     Reuse a guest project
  --channel=<name>        Playwright browser channel, default chrome
  --max-action-ms=<ms>    Fail if any measured action exceeds this value
  --max-long-tasks=<n>    Fail if long task count exceeds this value
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

function optionalPositiveInt(value, label) {
  if (!value) return null;
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

const frontendUrl = argValue('url', process.env.FRONTEND_URL ?? DEFAULT_URL).replace(/\/$/, '');
const apiBaseUrl = argValue('api', process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, '');
const sessionId = argValue('session-id', process.env.GUEST_SESSION_ID ?? '');
const projectId = argValue('project-id', process.env.PROJECT_ID ?? '');
const channel = argValue('channel', process.env.PLAYWRIGHT_CHANNEL ?? 'chrome');
const maxActionMs = optionalPositiveInt(argValue('max-action-ms', process.env.FRONTEND_PERF_MAX_ACTION_MS ?? ''), 'max-action-ms');
const maxLongTasks = optionalPositiveInt(argValue('max-long-tasks', process.env.FRONTEND_PERF_MAX_LONG_TASKS ?? ''), 'max-long-tasks');

function apiUrl(route) {
  return `${apiBaseUrl}${route.startsWith('/') ? route : `/${route}`}`;
}

async function loadProjectForSession() {
  if (!sessionId || !projectId) return null;
  const context = await request.newContext({
    extraHTTPHeaders: { 'X-Session-Id': sessionId },
  });
  try {
    const response = await context.get(apiUrl(`/projects/${projectId}`));
    if (!response.ok()) {
      throw new Error(`Project fetch failed: HTTP ${response.status()} ${await response.text()}`);
    }
    return await response.json();
  } finally {
    await context.dispose();
  }
}

async function afterFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function waitForWorkspace(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('.ant-layout, .workspace-table-card, .inline-form-shell', { timeout: 30_000 });
}

async function ensureGuestSession(page) {
  if (sessionId && projectId) return;
  const guestButton = page.getByRole('button', { name: /Начать без регистрации/ });
  if (await guestButton.count()) {
    await guestButton.click();
    await page.waitForLoadState('networkidle');
  }
}

async function firstVisibleRow(page) {
  const rows = page.locator('.calc-spreadsheet .ant-table-tbody tr[data-row-key]');
  const count = await rows.count();
  if (count === 0) return null;
  return rows.first();
}

const project = await loadProjectForSession();
const browser = await chromium.launch({ headless: true, channel });
const page = await browser.newPage({
  viewport: { width: 2048, height: 1100 },
  deviceScaleFactor: 1,
});

await page.addInitScript(({ sid, proj }) => {
  window.__tltLongTasks = [];
  try {
    const observer = new PerformanceObserver((list) => {
      window.__tltLongTasks.push(...list.getEntries().map((entry) => ({
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration,
      })));
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    // Long Task API is browser-dependent; missing support should not block the harness.
  }

  if (sid && proj) {
    localStorage.setItem('session_id', sid);
    localStorage.setItem('role', 'guest');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.setItem('tlt-current-project', JSON.stringify({
      state: { currentProject: proj },
      version: 0,
    }));
  }
}, { sid: sessionId, proj: project });

const measurements = [];

async function measure(label, action) {
  const startedAt = performance.now();
  await action();
  await afterFrame(page);
  const durationMs = performance.now() - startedAt;
  measurements.push({ label, durationMs: Math.round(durationMs) });
}

try {
  await measure('heat.goto', async () => {
    await page.goto(`${frontendUrl}/workspace/heat-calc`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await ensureGuestSession(page);
    await waitForWorkspace(page);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  });

  await measure('heat.switch-type', async () => {
    const tank = page.getByLabel('Резервуары', { exact: true });
    if (await tank.count()) await tank.click();
  });

  await measure('heat.open-row-or-add', async () => {
    const row = await firstVisibleRow(page);
    if (row) {
      await row.click();
    } else {
      await page.getByRole('button', { name: /Добавить/ }).click();
    }
    await page.waitForSelector('.inline-object-form', { timeout: 10_000 });
  });

  await measure('heat.open-column-settings', async () => {
    await page.getByRole('button', { name: /Настройки таблицы/ }).click();
    await page.waitForSelector('.column-settings-modal', { timeout: 10_000 });
    await page.keyboard.press('Escape');
  });

  await measure('heat.resize-column', async () => {
    const handle = page.locator('.column-resize-handle').first();
    if ((await handle.count()) === 0) return;
    const box = await handle.boundingBox();
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
  });

  await measure('electrical.goto', async () => {
    await page.goto(`${frontendUrl}/workspace/elec-calc`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForWorkspace(page);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  });

  await measure('electrical.page-size-100', async () => {
    const pageSize = page.locator('.electrical-spreadsheet .ant-pagination-options .ant-select').first();
    if ((await pageSize.count()) === 0) return;
    await pageSize.click();
    const option = page.locator('.ant-select-item-option').filter({ hasText: '100' }).last();
    if (await option.count()) await option.click();
  });

  const longTasks = await page.evaluate(() => window.__tltLongTasks ?? []);
  const report = {
    url: frontendUrl,
    projectId: project?.id ?? null,
    measurements,
    longTasks: {
      count: longTasks.length,
      totalDurationMs: Math.round(longTasks.reduce((total, task) => total + task.duration, 0)),
      maxDurationMs: Math.round(longTasks.reduce((max, task) => Math.max(max, task.duration), 0)),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const slowest = measurements.reduce((max, item) => Math.max(max, item.durationMs), 0);
  if (maxActionMs != null && slowest > maxActionMs) {
    throw new Error(`Frontend perf budget failed: slowest action ${slowest}ms > ${maxActionMs}ms`);
  }
  if (maxLongTasks != null && longTasks.length > maxLongTasks) {
    throw new Error(`Frontend perf budget failed: long tasks ${longTasks.length} > ${maxLongTasks}`);
  }
} finally {
  await browser.close();
}
