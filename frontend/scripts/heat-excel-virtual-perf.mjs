import { chromium } from 'playwright';
import { performance } from 'node:perf_hooks';

const DEFAULT_URL = 'http://localhost:3003';
const DEFAULT_ROW_COUNTS = '1000,3000';
const PROJECT_ID = 'heat-excel-virtual-perf-project';
const SESSION_ID = 'heat-excel-virtual-perf-session';

function usage() {
  console.log(`Measure HeatCalc Excel virtual-grid behavior on a running frontend.

Usage:
  npm run perf:heat-excel-virtual
  npm run perf:heat-excel-virtual -- --url=http://localhost:3003 --rows=1000,3000

Options:
  --url=<url>                 Frontend URL, default ${DEFAULT_URL}
  --rows=<counts>             Comma-separated row counts, default ${DEFAULT_ROW_COUNTS}
  --engine=<table|glide>      Excel engine, default glide
  --channel=<name>            Playwright browser channel, default chrome
  --max-dom-rows=<n>          Fail if rendered virtual rows exceed this, default 100
  --max-action-ms=<ms>        Optional fail threshold for any measured action
  --screenshot=<path>         Optional screenshot path after bottom scroll for first row count
  --help                      Print this help
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

function optionalPositiveInt(value, label) {
  return value ? positiveInt(value, label) : null;
}

function parseRowCounts(value) {
  const counts = value.split(',').map((item) => positiveInt(item.trim(), 'rows'));
  if (counts.length === 0) throw new Error('--rows must include at least one count');
  return counts;
}

function parseEngine(value) {
  if (value === 'table' || value === 'glide') return value;
  throw new Error('--engine must be "table" or "glide"');
}

if (hasFlag('help')) {
  usage();
  process.exit(0);
}

const frontendUrl = argValue('url', process.env.FRONTEND_URL ?? DEFAULT_URL).replace(/\/$/, '');
const rowCounts = parseRowCounts(argValue('rows', process.env.HEAT_EXCEL_PERF_ROWS ?? DEFAULT_ROW_COUNTS));
const engine = parseEngine(argValue('engine', process.env.HEAT_EXCEL_ENGINE ?? 'glide'));
const channel = argValue('channel', process.env.PLAYWRIGHT_CHANNEL ?? 'chrome');
const maxDomRows = positiveInt(argValue('max-dom-rows', process.env.HEAT_EXCEL_PERF_MAX_DOM_ROWS ?? '100'), 'max-dom-rows');
const maxActionMs = optionalPositiveInt(
  argValue('max-action-ms', process.env.HEAT_EXCEL_PERF_MAX_ACTION_MS ?? ''),
  'max-action-ms',
);
const screenshotPath = argValue('screenshot', process.env.HEAT_EXCEL_PERF_SCREENSHOT ?? '');

function makeProject() {
  return {
    id: PROJECT_ID,
    name: 'Heat Excel virtual perf',
    task_number: 'PERF-EXCEL',
    customer: 'Perf',
    location: 'Perf',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function makePipe(index) {
  return {
    id: `pipe-${index}`,
    project_id: PROJECT_ID,
    object_type: 'pipe',
    sort_order: index,
    version: 1,
    params: {
      name: `Perf pipe ${index}`,
      placement: 'outdoor',
      outer_diameter: 0.108,
      wall_thickness: 0.004,
      pipe_material: 'carbon_steel',
      pipe_length: 50 + (index % 10),
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool_boards_120',
      insulation_temperature_basis: 'outdoor_winter',
      process_temperature: 80,
      ambient_temperature: -30,
      max_ambient_temperature: 35,
      max_process_temperature: 110,
      environment: 'normal',
      zone_classification: 'safe',
      temperature_group: 'T1',
      min_switch_temperature: -20,
      supply_voltage: 220,
      safety_factor: 1.1,
      steam_tracing: 'no',
      insulation_layer_count: '1',
      insulation_cover_material: 'none',
    },
    results: null,
    is_valid: true,
    validation_errors: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function objectSummary(rows) {
  return {
    total: rows.length,
    valid: rows.length,
    invalid: 0,
    by_type: { pipe: rows.length, tank: 0 },
    valid_by_type: { pipe: rows.length, tank: 0 },
    electrical_calculations_total: 0,
    successful_electrical_calculations: 0,
    failed_electrical_calculations: 0,
    objects_with_successful_electrical_calculation: 0,
  };
}

function queryCapabilities() {
  return {
    version: 1,
    object_type: 'pipe',
    default_page_size: 50,
    max_page_size: 200,
    default_sort: { key: 'sort_order', dir: 'asc' },
    search: { enabled: true, max_text_length: 120, default_columns: ['name'] },
    fields: [],
  };
}

function queryObjects(rows, payload) {
  const page = Number(payload?.page ?? 1);
  const pageSize = Number(payload?.page_size ?? 50);
  const offset = (page - 1) * pageSize;
  const items = rows.slice(offset, offset + pageSize);
  return {
    items,
    page_info: {
      page,
      page_size: pageSize,
      offset,
      total_pages: rows.length ? Math.ceil(rows.length / pageSize) : 0,
      has_next_page: page * pageSize < rows.length,
      has_previous_page: page > 1,
    },
    counts: {
      total: rows.length,
      by_type: { pipe: rows.length, tank: 0 },
      filtered: rows.length,
    },
    query: { object_type: 'pipe', sort: payload?.sort ?? null },
  };
}

async function afterFrame(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function lastVisibleInputRowNumber(page) {
  const text = await page
    .locator('.excel-virtual-row.row-excel-new .excel-row-header-button')
    .last()
    .textContent();
  const value = Number(text?.trim());
  return Number.isFinite(value) ? value : 0;
}

async function glideCanvasBox(page) {
  const canvas = page.locator('.calc-spreadsheet--glide canvas').first();
  await canvas.waitFor({ timeout: 10_000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Glide canvas bounds are missing');
  return box;
}

async function clickGlideCell(page, rowOffset = 0, columnOffset = 0, options = {}) {
  const box = await glideCanvasBox(page);
  await page.mouse.click(
    box.x + 50 + 16 + columnOffset,
    box.y + 38 + 15 + rowOffset,
    options,
  );
  await afterFrame(page);
  return box;
}

async function installApiMocks(page, rows) {
  const project = makeProject();
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = request.method();

    if (method === 'GET' && path === `/projects/${PROJECT_ID}`) {
      await route.fulfill({ json: project });
      return;
    }
    if (method === 'GET' && path.startsWith('/references/')) {
      await route.fulfill({ json: [] });
      return;
    }
    if (method === 'GET' && path === `/projects/${PROJECT_ID}/objects/summary`) {
      await route.fulfill({ json: objectSummary(rows) });
      return;
    }
    if (method === 'GET' && path === `/projects/${PROJECT_ID}/objects/query-capabilities`) {
      await route.fulfill({ json: queryCapabilities() });
      return;
    }
    if (method === 'GET' && path === `/projects/${PROJECT_ID}/objects`) {
      await route.fulfill({ json: rows });
      return;
    }
    if (method === 'POST' && path === `/projects/${PROJECT_ID}/objects/query`) {
      await route.fulfill({ json: queryObjects(rows, request.postDataJSON()) });
      return;
    }
    if (method === 'PUT' && path.startsWith(`/projects/${PROJECT_ID}/objects/`)) {
      const objectId = path.split('/').at(-1);
      const target = rows.find((row) => row.id === objectId);
      if (!target) {
        await route.fulfill({ status: 404, json: { detail: 'Object not found' } });
        return;
      }
      const payload = request.postDataJSON();
      Object.assign(target, {
        version: target.version + 1,
        params: payload?.params ?? target.params,
        updated_at: new Date().toISOString(),
      });
      await route.fulfill({ json: target });
      return;
    }
    if (method === 'POST' && path === '/audit/client-events') {
      await route.fulfill({ json: { ok: true } });
      return;
    }

    await route.fulfill({ status: 404, json: { detail: `Unhandled perf mock route: ${method} ${path}` } });
  });
}

async function runForRowCount(browser, rowCount) {
  const rows = Array.from({ length: rowCount }, (_, index) => makePipe(index));
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const measurements = [];

  await page.addInitScript(({ project, sessionId, excelEngine }) => {
    localStorage.setItem('session_id', sessionId);
    localStorage.setItem('role', 'guest');
    if (excelEngine === 'glide') {
      localStorage.setItem('heatcalc.excelEngine', 'glide');
    } else {
      localStorage.setItem('heatcalc.excelEngine', 'table');
    }
    localStorage.setItem('tlt-current-project', JSON.stringify({
      state: { currentProject: project },
      version: 0,
    }));
  }, { project: makeProject(), sessionId: SESSION_ID, excelEngine: engine });
  await installApiMocks(page, rows);

  async function measure(label, action) {
    const startedAt = performance.now();
    await action();
    await afterFrame(page);
    const durationMs = Math.round(performance.now() - startedAt);
    measurements.push({ label, durationMs });
    return durationMs;
  }

  try {
    await measure('open-excel-mode', async () => {
      await page.goto(`${frontendUrl}/workspace/heat-calc?excelEngine=${engine}`, { waitUntil: 'domcontentloaded' });
      await page.getByText('Excel-режим').click();
      await page.waitForSelector(engine === 'glide' ? '.calc-spreadsheet--glide canvas' : '.excel-virtual-table-body');
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    });

    if (engine === 'glide') {
      const tableRowsInDom = await page.locator('.excel-virtual-row').count();
      if (tableRowsInDom > 0) {
        throw new Error(`Glide engine should not render table rows, got ${tableRowsInDom}`);
      }
      const canvasCount = await page.locator('.calc-spreadsheet--glide canvas').count();
      if (canvasCount < 1 || canvasCount > 8) {
        throw new Error(`Unexpected Glide canvas count at ${rowCount}: ${canvasCount}`);
      }

      await measure('select-first-glide-cell', async () => {
        await clickGlideCell(page);
        await page.waitForFunction(() => {
          const input = document.querySelector('[data-testid="object-name-input"]');
          return input instanceof HTMLInputElement && input.value === 'Perf pipe 0';
        }, null, { timeout: 10_000 });
      });

      await measure('edit-first-glide-cell', async () => {
        const nextName = `Perf pipe glide edited ${rowCount}`;
        await page.keyboard.press('F2');
        const editor = page.getByTestId('heatcalc-glide-cell-editor');
        await editor.waitFor({ timeout: 5_000 });
        await editor.fill(nextName);
        await editor.press('Enter');
        await page.waitForFunction((expectedValue) => {
          const input = document.querySelector('[data-testid="object-name-input"]');
          return input instanceof HTMLInputElement && input.value === expectedValue;
        }, nextName, { timeout: 10_000 });
      });

      await measure('save-glide-edited-row', async () => {
        await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
        await page.getByText('Сохранено строк: 1').waitFor({ timeout: 10_000 });
      });

      let scrollHeightBeforeTail = 0;
      let scrollHeightAfterTail = 0;
      await measure('scroll-glide-to-bottom', async () => {
        const scroller = page.locator('.calc-spreadsheet--glide .dvn-scroller');
        await scroller.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await afterFrame(page);
        await page.waitForFunction(() => {
          const element = document.querySelector('.calc-spreadsheet--glide .dvn-scroller');
          return element && element.scrollTop > 0;
        }, null, { timeout: 10_000 });
      });

      await measure('context-menu-after-glide-scroll', async () => {
        const box = await glideCanvasBox(page);
        await page.mouse.click(box.x + 66, box.y + 38 + 15, { button: 'right' });
        await page.getByRole('menu', { name: 'Действия Excel-режима' }).waitFor({ timeout: 10_000 });
        await page.keyboard.press('Escape');
      });

      await measure('extend-glide-empty-tail-on-scroll', async () => {
        const scroller = page.locator('.calc-spreadsheet--glide .dvn-scroller');
        scrollHeightBeforeTail = await scroller.evaluate((element) => element.scrollHeight);
        await scroller.hover();
        await page.mouse.wheel(0, 4_000);
        await afterFrame(page);
        await scroller.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await afterFrame(page);
        scrollHeightAfterTail = await scroller.evaluate((element) => element.scrollHeight);
        if (scrollHeightAfterTail <= scrollHeightBeforeTail) {
          throw new Error(`Glide empty tail did not extend after scroll at ${rowCount}: ${scrollHeightBeforeTail} -> ${scrollHeightAfterTail}`);
        }
      });

      await measure('paste-glide-100x10', async () => {
        const scroller = page.locator('.calc-spreadsheet--glide .dvn-scroller');
        await scroller.evaluate((element) => {
          element.scrollTop = 0;
        });
        await afterFrame(page);
        await clickGlideCell(page);
        const pasted = Array.from({ length: 100 }, (_, index) => (
          [
            `Glide paste ${rowCount}-${index}`,
            '108',
            '10',
            '50',
            '80',
            '-30',
            '4',
            '-20',
            '220',
            '1.1',
          ].join('\t')
        )).join('\n');
        await page.evaluate((text) => {
          const data = new DataTransfer();
          data.setData('text/plain', text);
          document.dispatchEvent(new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: data,
          }));
        }, pasted);
        await page.getByText(/Вставлено ячеек:/).waitFor({ timeout: 10_000 });
      });

      const slowest = measurements.reduce((max, item) => Math.max(max, item.durationMs), 0);
      if (maxActionMs != null && slowest > maxActionMs) {
        throw new Error(`Action budget failed at ${rowCount}: slowest ${slowest}ms > ${maxActionMs}ms`);
      }

      return {
        rowCount,
        engine,
        canvasCount,
        tableRowsInDom,
        scrollHeightBeforeTail,
        scrollHeightAfterTail,
        measurements,
      };
    }

    const initialDomRows = await page.locator('.excel-virtual-row').count();
    if (initialDomRows > maxDomRows || initialDomRows >= rowCount) {
      throw new Error(`DOM row budget failed at ${rowCount}: rendered ${initialDomRows}`);
    }
    const flatCellChrome = await page.locator('.excel-virtual-row .editable-cell-display').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    });
    if (flatCellChrome.boxShadow !== 'none' || flatCellChrome.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      throw new Error(`Excel cells should use flat grid chrome, got ${JSON.stringify(flatCellChrome)}`);
    }
    const selectionStart = await page.locator('.excel-virtual-row').nth(1).locator('.editable-cell-display').first().boundingBox();
    const selectionEnd = await page.locator('.excel-virtual-row').nth(8).locator('.editable-cell-display').first().boundingBox();
    if (!selectionStart || !selectionEnd) {
      throw new Error(`Excel selection probe failed at ${rowCount}: missing cell bounds`);
    }
    await page.mouse.move(selectionStart.x + 8, selectionStart.y + selectionStart.height / 2);
    await page.mouse.down();
    await page.mouse.move(selectionEnd.x + selectionEnd.width - 8, selectionEnd.y + selectionEnd.height / 2, { steps: 16 });
    await page.mouse.up();
    await afterFrame(page);
    const selectionChrome = await page.evaluate(() => {
      const selected = [...document.querySelectorAll('.excel-virtual-row .editable-cell-display.selected')];
      const active = document.querySelector('.excel-virtual-row .editable-cell-display.active-selection');
      const activeStyle = active ? getComputedStyle(active) : null;
      const activeOverlayStyle = active ? getComputedStyle(active, '::after') : null;
      return {
        selectedCount: selected.length,
        selectedWithShadow: selected.filter((element) => getComputedStyle(element).boxShadow !== 'none').length,
        selectedWithNativeTextSelect: selected.filter((element) => getComputedStyle(element).userSelect !== 'none').length,
        nativeSelectionTextLength: window.getSelection()?.toString().length ?? 0,
        activeBoxShadow: activeStyle?.boxShadow ?? '',
        activeOverlayBorderTopWidth: activeOverlayStyle?.borderTopWidth ?? '',
        activeOverlayPointerEvents: activeOverlayStyle?.pointerEvents ?? '',
      };
    });
    if (
      selectionChrome.selectedCount < 2
      || selectionChrome.selectedWithShadow > 0
      || selectionChrome.selectedWithNativeTextSelect > 0
      || selectionChrome.nativeSelectionTextLength > 0
      || selectionChrome.activeBoxShadow !== 'none'
      || selectionChrome.activeOverlayBorderTopWidth !== '2px'
      || selectionChrome.activeOverlayPointerEvents !== 'none'
    ) {
      throw new Error(`Excel selection chrome should avoid per-cell shadows/native text selection, got ${JSON.stringify(selectionChrome)}`);
    }

    await measure('scroll-to-bottom', async () => {
      await page.locator('.excel-virtual-table-body').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.locator(`.excel-virtual-row[data-row-key="pipe-${rowCount - 1}"]`).waitFor({ timeout: 10_000 });
    });

    const bottomDomRows = await page.locator('.excel-virtual-row').count();
    if (bottomDomRows > maxDomRows || bottomDomRows >= rowCount) {
      throw new Error(`DOM row budget failed after scroll at ${rowCount}: rendered ${bottomDomRows}`);
    }
    const bottomInputRows = await page.locator('.excel-virtual-row.row-excel-new').count();
    if (bottomInputRows < 10) {
      throw new Error(`Trailing input rows missing at ${rowCount}: rendered ${bottomInputRows}`);
    }
    if (screenshotPath && rowCount === rowCounts[0]) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }

    await measure('edit-last-visible-row', async () => {
      const row = page.locator(`.excel-virtual-row[data-row-key="pipe-${rowCount - 1}"]`);
      const cell = row.locator('.editable-cell-display').first();
      const nextName = `Perf pipe edited ${rowCount}`;
      await cell.click();
      await cell.press('F2');
      const input = page.locator('input.editable-cell-editor, .editable-cell-editor input').first();
      await input.waitFor({ timeout: 3_000 }).catch(async () => {
        const diagnostics = await page.evaluate(() => ({
          activeElement: {
            tagName: document.activeElement?.tagName,
            className: document.activeElement instanceof HTMLElement ? document.activeElement.className : '',
            text: document.activeElement?.textContent?.slice(0, 80),
          },
          firstVisibleCells: [...document.querySelectorAll('.excel-virtual-row .editable-cell-display')]
            .slice(0, 5)
            .map((element) => ({
              text: element.textContent?.slice(0, 80),
              className: element instanceof HTMLElement ? element.className : '',
            })),
        }));
        throw new Error(`Editor did not open after scroll: ${JSON.stringify(diagnostics)}`);
      });
      await input.fill(nextName);
      await input.press('Enter');
      const formNameInput = page.getByTestId('object-name-input');
      await formNameInput.waitFor({ timeout: 10_000 });
      await page.waitForFunction((expectedValue) => {
        const inputElement = document.querySelector('[data-testid="object-name-input"]');
        return inputElement instanceof HTMLInputElement && inputElement.value === expectedValue;
      }, nextName, { timeout: 10_000 });
      const formValue = await formNameInput.inputValue();
      if (formValue !== nextName) {
        throw new Error(`Form sync failed after scroll: expected "${nextName}", got "${formValue}"`);
      }
    });

    await measure('save-edited-row', async () => {
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
      await page.getByText('Сохранено строк: 1').waitFor({ timeout: 10_000 });
    });

    await measure('context-menu-after-scroll', async () => {
      const row = page.locator(`.excel-virtual-row[data-row-key="pipe-${rowCount - 1}"]`);
      await row.locator('.editable-cell-display').first().click({ button: 'right' });
      await page.getByRole('menu', { name: 'Действия Excel-режима' }).waitFor({ timeout: 10_000 });
      await page.keyboard.press('Escape');
    });

    let scrolledInputTailRow = 0;
    await measure('extend-empty-tail-on-scroll', async () => {
      const body = page.locator('.excel-virtual-table-body');
      await body.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await afterFrame(page);
      const beforeTailRow = await lastVisibleInputRowNumber(page);
      await body.hover();
      await page.mouse.wheel(0, 4_000);
      await afterFrame(page);
      await body.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await afterFrame(page);
      scrolledInputTailRow = await lastVisibleInputRowNumber(page);
      if (scrolledInputTailRow <= beforeTailRow) {
        throw new Error(`Empty tail did not extend after scroll at ${rowCount}: ${beforeTailRow} -> ${scrolledInputTailRow}`);
      }
    });

    await measure('paste-100x10', async () => {
      await page.locator('.excel-virtual-table-body').evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.locator('.excel-virtual-row[data-row-key="pipe-0"]').waitFor({ timeout: 10_000 });
      await page.locator('.excel-virtual-row[data-row-key="pipe-0"] .editable-cell-display').first().click();
      const pasted = Array.from({ length: 100 }, (_, index) => (
        [
          `Paste ${rowCount}-${index}`,
          '108',
          '10',
          '50',
          '80',
          '-30',
          '4',
          '-20',
          '220',
          '1.1',
        ].join('\t')
      )).join('\n');
      await page.evaluate((text) => {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        document.dispatchEvent(new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: data,
        }));
      }, pasted);
      await page.getByText(/Вставлено ячеек:/).waitFor({ timeout: 10_000 });
    });

    const slowest = measurements.reduce((max, item) => Math.max(max, item.durationMs), 0);
    if (maxActionMs != null && slowest > maxActionMs) {
      throw new Error(`Action budget failed at ${rowCount}: slowest ${slowest}ms > ${maxActionMs}ms`);
    }

    return {
      rowCount,
      engine,
      initialDomRows,
      bottomDomRows,
      bottomInputRows,
      scrolledInputTailRow,
      measurements,
    };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true, channel });
try {
  const results = [];
  for (const rowCount of rowCounts) {
    results.push(await runForRowCount(browser, rowCount));
  }
  console.log(JSON.stringify({
    url: frontendUrl,
    engine,
    maxDomRows,
    results,
  }, null, 2));
} finally {
  await browser.close();
}
