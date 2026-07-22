/**
 * UI Kit ↔ HeatCalc SC-03 field contract parity.
 *
 * Asserts that CompactField / Tlt* controls on /ui-kit use the same computed
 * typography, control geometry and track sizes as the live dual-form on
 * /workspace/heat-calc (.heat-object-fields--wide).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const VIEWPORT = { width: 1440, height: 1000 };
const OUT_DIR = 'test-results/ui-kit-heatcalc-parity';

type StyleSnapshot = {
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  height: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  width: string;
  color: string;
  borderRadius: string;
};

type FieldMetrics = {
  label: StyleSnapshot | null;
  numberInput: StyleSnapshot | null;
  unit: StyleSnapshot | null;
  selectValue: StyleSnapshot | null;
  textInput: StyleSnapshot | null;
  selectTrigger: StyleSnapshot | null;
  pickerControl: StyleSnapshot | null;
  pickerValue: StyleSnapshot | null;
  rowHeight: string | null;
  labelTrackWidth: string | null;
  numberTrackWidth: string | null;
  nameTrackWidth: string | null;
  climateTrackWidth: string | null;
  gridColumnGap: string | null;
  gridRowGap: string | null;
};

function parsePx(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function expectPxClose(
  actual: string | null | undefined,
  expected: string | null | undefined,
  label: string,
  tol = 0.75,
) {
  const a = parsePx(actual);
  const e = parsePx(expected);
  expect(Number.isFinite(a), `${label}: actual=${actual}`).toBeTruthy();
  expect(Number.isFinite(e), `${label}: expected=${expected}`).toBeTruthy();
  expect(Math.abs(a - e), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}

async function loginAsGuest(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Начать без регистрации' }).click();
  await page.waitForURL(/\/workspace\/heat-calc/, { timeout: 30_000 });
}

async function ensureHeatFormVisible(page: Page) {
  const root = page.locator('.heat-object-fields--wide');
  if (await root.count()) {
    await expect(root.first()).toBeVisible({ timeout: 15_000 });
    return;
  }

  // Toggle form if hidden by preferences
  const toggle = page.getByRole('checkbox', { name: /показать параметры|параметры/i });
  if (await toggle.count()) {
    const checked = await toggle.first().isChecked().catch(() => false);
    if (!checked) await toggle.first().check();
  }

  // Prefer wide dual-form placement
  await page.evaluate(() => {
    const key = 'heatcalc.tableView.v2.guest';
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : { version: 2 };
      localStorage.setItem(key, JSON.stringify({
        ...parsed,
        version: 2,
        formPlacement: 'top',
        fontSize: 'standard',
      }));
    } catch {
      localStorage.setItem(key, JSON.stringify({
        version: 2,
        formPlacement: 'top',
        fontSize: 'standard',
      }));
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.heat-object-fields--wide').first()).toBeVisible({ timeout: 20_000 });
}

function measureScript(scope: 'uikit' | 'heat'): FieldMetrics {
  const pick = (root: Element | null, selector: string): StyleSnapshot | null => {
    if (!root) return null;
    const node = root.querySelector(selector) as HTMLElement | null;
    if (!node) return null;
    const cs = window.getComputedStyle(node);
    return {
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      height: cs.height,
      paddingTop: cs.paddingTop,
      paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      width: cs.width,
      color: cs.color,
      borderRadius: cs.borderRadius,
    };
  };

  const rootSelector = scope === 'uikit'
    ? '.uikit-form-grid.tlt-compact-field-grid, .uikit-form-grid'
    : '.heat-object-fields--wide';
  const root = document.querySelector(rootSelector);
  if (!root) {
    return {
      label: null,
      numberInput: null,
      unit: null,
      selectValue: null,
      textInput: null,
      selectTrigger: null,
      pickerControl: null,
      pickerValue: null,
      rowHeight: null,
      labelTrackWidth: null,
      numberTrackWidth: null,
      nameTrackWidth: null,
      climateTrackWidth: null,
      gridColumnGap: null,
      gridRowGap: null,
    };
  }

  const label = scope === 'uikit'
    ? pick(root, '.tlt-compact-field__label')
    : pick(root, '.ant-form-item-label > label') ?? pick(root, '.field-label-two-line');

  const numberInput = pick(root, '.tlt-number-field__input')
    ?? pick(root, '.ant-input-number-input');
  const unit = pick(root, '.tlt-number-field__unit')
    ?? pick(root, '.unit-input-number__addon');
  const selectValue = pick(root, '.tlt-select__value')
    ?? pick(root, '.ant-select-selection-item');
  const textInput = pick(root, '.tlt-text-field__input')
    ?? pick(root, '.name-form-item .tlt-text-field__input')
    ?? pick(root, '.name-form-item input');
  const selectTrigger = pick(root, '.tlt-select__trigger');
  const pickerControl = pick(root, '.reference-picker-control');
  const pickerValue = pick(root, '.reference-picker-value');

  let rowHeight: string | null = null;
  let labelTrackWidth: string | null = null;
  let numberTrackWidth: string | null = null;
  let nameTrackWidth: string | null = null;
  let climateTrackWidth: string | null = null;

  if (scope === 'uikit') {
    const controlWidth = (field: Element | null | undefined) => {
      const control = field?.querySelector('.tlt-compact-field__control') as HTMLElement | null;
      return control ? window.getComputedStyle(control).width : null;
    };
    const field = root.querySelector('.tlt-compact-field') as HTMLElement | null;
    if (field) {
      const cs = window.getComputedStyle(field);
      rowHeight = cs.minHeight || cs.height;
      const labelEl = field.querySelector('.tlt-compact-field__label') as HTMLElement | null;
      labelTrackWidth = labelEl ? window.getComputedStyle(labelEl).width : null;
    }
    const numField = Array.from(root.querySelectorAll('.tlt-compact-field')).find((el) =>
      el.querySelector('.tlt-number-field__unit'),
    );
    numberTrackWidth = controlWidth(numField);
    const nameField = Array.from(root.querySelectorAll('.tlt-compact-field')).find((el) => {
      const t = (el.querySelector('.tlt-compact-field__label')?.textContent || '');
      return t.includes('Наименование');
    });
    nameTrackWidth = controlWidth(nameField);
    const climateField = Array.from(root.querySelectorAll('.tlt-compact-field')).find((el) => {
      const t = (el.querySelector('.tlt-compact-field__label')?.textContent || '');
      return t.includes('Климат') || t.includes('Размещение');
    });
    climateTrackWidth = controlWidth(climateField);
  } else {
    const row = root.querySelector('.ant-form-item-row') as HTMLElement | null;
    if (row) {
      const cs = window.getComputedStyle(row);
      rowHeight = cs.height;
      // label track from grid template
      const labelEl = row.querySelector('.ant-form-item-label') as HTMLElement | null;
      if (labelEl) labelTrackWidth = window.getComputedStyle(labelEl).width;
    }
    const numItem = root.querySelector(
      '.outer-diameter-form-item, .pipe-length-form-item, .wall-thickness-form-item',
    ) as HTMLElement | null;
    if (numItem) {
      const control = numItem.querySelector('.ant-form-item-control') as HTMLElement | null;
      if (control) numberTrackWidth = window.getComputedStyle(control).width;
    }
    const nameItem = root.querySelector('.name-form-item') as HTMLElement | null;
    if (nameItem) {
      const control = nameItem.querySelector('.ant-form-item-control') as HTMLElement | null;
      if (control) nameTrackWidth = window.getComputedStyle(control).width;
    }
    const climateItem = root.querySelector(
      '.climate-form-item, .placement-form-item',
    ) as HTMLElement | null;
    if (climateItem) {
      const control = climateItem.querySelector('.ant-form-item-control') as HTMLElement | null;
      if (control) climateTrackWidth = window.getComputedStyle(control).width;
    }
  }

  const gridCs = window.getComputedStyle(root);
  return {
    label,
    numberInput,
    unit,
    selectValue,
    textInput,
    selectTrigger,
    pickerControl,
    pickerValue,
    rowHeight,
    labelTrackWidth,
    numberTrackWidth,
    nameTrackWidth,
    climateTrackWidth,
    gridColumnGap: gridCs.columnGap,
    gridRowGap: gridCs.rowGap,
  };
}

test.describe('UI Kit ↔ HeatCalc field parity', () => {
  test.use({ viewport: VIEWPORT });
  test.describe.configure({ timeout: 120_000 });

  test('compact controls match HeatCalc SC-03 typography and geometry', async ({ page }) => {
    mkdirSync(OUT_DIR, { recursive: true });

    // ── UI Kit ──────────────────────────────────────────────
    await page.goto('/ui-kit', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.uikit-form-grid').first()).toBeVisible({ timeout: 20_000 });
    await page.locator('#forms').scrollIntoViewIfNeeded();
    await expect(page.locator('.uikit-form-grid .tlt-number-field__input').first()).toBeVisible();

    const uiKit = await page.evaluate(measureScript, 'uikit' as const);
    await page.locator('.uikit-form-grid').first().screenshot({
      path: join(OUT_DIR, 'uikit-form-grid.png'),
    });

    // ── HeatCalc ────────────────────────────────────────────
    await loginAsGuest(page);
    await ensureHeatFormVisible(page);
    await page.locator('.heat-object-fields--wide').first().scrollIntoViewIfNeeded();
    await expect(page.locator('.heat-object-fields--wide .tlt-number-field__input').first()).toBeVisible();

    const heat = await page.evaluate(measureScript, 'heat' as const);
    await page.locator('.heat-object-fields--wide').first().screenshot({
      path: join(OUT_DIR, 'heat-object-fields.png'),
    });

    expect(uiKit.label, 'UI Kit label missing').toBeTruthy();
    expect(heat.label, 'Heat label missing').toBeTruthy();
    expect(uiKit.numberInput, 'UI Kit number input missing').toBeTruthy();
    expect(heat.numberInput, 'Heat number input missing').toBeTruthy();
    expect(uiKit.unit, 'UI Kit unit missing').toBeTruthy();
    expect(heat.unit, 'Heat unit missing').toBeTruthy();
    expect(uiKit.selectValue, 'UI Kit select value missing').toBeTruthy();
    expect(heat.selectValue, 'Heat select value missing').toBeTruthy();

    // Typography
    expect(uiKit.label!.fontSize).toBe(heat.label!.fontSize);
    expect(uiKit.label!.fontWeight).toBe(heat.label!.fontWeight);
    expectPxClose(uiKit.label!.height, heat.label!.height, 'label height', 1);

    expect(uiKit.numberInput!.fontSize).toBe(heat.numberInput!.fontSize);
    expectPxClose(uiKit.numberInput!.height, heat.numberInput!.height, 'number height');
    expectPxClose(uiKit.numberInput!.paddingLeft, heat.numberInput!.paddingLeft, 'number padL');
    expectPxClose(uiKit.numberInput!.paddingRight, heat.numberInput!.paddingRight, 'number padR');

    expect(uiKit.unit!.fontSize).toBe(heat.unit!.fontSize);
    expectPxClose(uiKit.unit!.height, heat.unit!.height, 'unit height');
    expectPxClose(uiKit.unit!.paddingLeft, heat.unit!.paddingLeft, 'unit padL');

    expect(uiKit.selectValue!.fontSize).toBe(heat.selectValue!.fontSize);
    expectPxClose(uiKit.selectValue!.height, heat.selectValue!.height, 'select value height');

    if (uiKit.selectTrigger && heat.selectTrigger) {
      expectPxClose(uiKit.selectTrigger.height, heat.selectTrigger.height, 'select trigger height');
    }

    // ReferencePicker (материал/климат) — same trigger geometry and value font
    expect(uiKit.pickerControl, 'UI Kit reference picker missing').toBeTruthy();
    expect(heat.pickerControl, 'Heat reference picker missing').toBeTruthy();
    expectPxClose(uiKit.pickerControl!.height, heat.pickerControl!.height, 'picker height');
    expect(uiKit.pickerValue!.fontSize).toBe(heat.pickerValue!.fontSize);

    // Label track ~98px
    expectPxClose(uiKit.label!.width, heat.label!.width, 'label width', 2);

    // Control tracks (num / name / climate) — allow rem→px conversion noise
    if (uiKit.numberTrackWidth && heat.numberTrackWidth) {
      expectPxClose(uiKit.numberTrackWidth, heat.numberTrackWidth, 'number track', 4);
    }
    if (uiKit.nameTrackWidth && heat.nameTrackWidth) {
      expectPxClose(uiKit.nameTrackWidth, heat.nameTrackWidth, 'name track', 6);
    }
    if (uiKit.climateTrackWidth && heat.climateTrackWidth) {
      expectPxClose(uiKit.climateTrackWidth, heat.climateTrackWidth, 'climate track', 6);
    }

    // Grid gaps (HeatCalc dual-form: 10 / 4)
    if (uiKit.gridColumnGap && heat.gridColumnGap) {
      expectPxClose(uiKit.gridColumnGap, heat.gridColumnGap, 'column-gap', 1);
    }
    if (uiKit.gridRowGap && heat.gridRowGap) {
      expectPxClose(uiKit.gridRowGap, heat.gridRowGap, 'row-gap', 1);
    }

    // Absolute contract anchors (regression guard even if heat drifts)
    expect(uiKit.numberInput!.height).toBe('26px');
    expect(uiKit.unit!.height).toBe('26px');
    expect(uiKit.unit!.fontSize).toBe('9px');
    expect(uiKit.label!.fontSize).toBe('8.5px');
    expect(uiKit.selectValue!.fontSize).toBe('9px');
    expect(parsePx(uiKit.label!.width)).toBeCloseTo(98, 0);
  });

  test('UI Kit heatcalc section uses same control metrics as forms section', async ({ page }) => {
    await page.goto('/ui-kit', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#heatcalc')).toBeVisible({ timeout: 15_000 });
    await page.locator('#heatcalc').scrollIntoViewIfNeeded();

    // Ensure params panel visible
    const showParams = page.getByRole('checkbox', { name: /показать параметры/i });
    if (await showParams.count()) {
      if (!(await showParams.isChecked())) await showParams.check();
    }

    const metrics = await page.evaluate(() => {
      const measure = (rootSel: string) => {
        const root = document.querySelector(rootSel);
        if (!root) return null;
        const input = root.querySelector('.tlt-number-field__input') as HTMLElement | null;
        const unit = root.querySelector('.tlt-number-field__unit') as HTMLElement | null;
        const label = root.querySelector('.tlt-compact-field__label') as HTMLElement | null;
        const sel = root.querySelector('.tlt-select__value') as HTMLElement | null;
        const cs = (el: HTMLElement | null) => {
          if (!el) return null;
          const s = getComputedStyle(el);
          return { fontSize: s.fontSize, height: s.height, paddingLeft: s.paddingLeft };
        };
        return {
          input: cs(input),
          unit: cs(unit),
          label: cs(label),
          select: cs(sel),
        };
      };
      return {
        forms: measure('.uikit-form-grid'),
        heat: measure('.uikit-heatcalc-form'),
      };
    });

    expect(metrics.forms?.input).toBeTruthy();
    expect(metrics.heat?.input).toBeTruthy();
    expect(metrics.forms!.input!.fontSize).toBe(metrics.heat!.input!.fontSize);
    expect(metrics.forms!.input!.height).toBe(metrics.heat!.input!.height);
    expect(metrics.forms!.unit!.fontSize).toBe(metrics.heat!.unit!.fontSize);
    expect(metrics.forms!.unit!.height).toBe(metrics.heat!.unit!.height);
    expect(metrics.forms!.label!.fontSize).toBe(metrics.heat!.label!.fontSize);
    expect(metrics.forms!.select!.fontSize).toBe(metrics.heat!.select!.fontSize);
  });
});
