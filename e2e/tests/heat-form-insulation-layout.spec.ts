import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

import { loginAsGuest } from './helpers/workspace';

const OUT_DIR = 'test-results/ui-proof-heat-insulation-layout-after';

type LayoutProof = {
  documentOverflow: number;
  columnCount: number;
  columnOverlap: boolean;
  groupWidthRatio: number;
  groupOverflow: number;
  hostWidthRatio: number;
  tableHostOverflow: number;
  tableFillsHost: boolean;
  hiddenControls: string[];
  clippedControls: string[];
  clippedLabels: string[];
  overlaps: string[];
};

async function inspectLayout(page: Page): Promise<LayoutProof> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const overlap = (left: DOMRect, right: DOMRect) => (
      Math.min(left.right, right.right) > Math.max(left.left, right.left) + 2
      && Math.min(left.bottom, right.bottom) > Math.max(left.top, right.top) + 2
    );
    const columns = Array.from(
      document.querySelectorAll<HTMLElement>('.object-wizard-wide-panel .pdf-form-column'),
    ).filter(visible);
    const insulationColumn = document.querySelector<HTMLElement>('.object-wizard-wide-panel .form-col-srs--insulation')
      ?? document.querySelector<HTMLElement>('.object-wizard-wide-panel .heat-wizard-zone--layers');
    const fieldsHost = document.querySelector<HTMLElement>('.object-wizard-wide-panel .heat-object-fields')
      ?? document.querySelector<HTMLElement>('.object-wizard-wide-panel .form-col-srs--primary')
      ?? document.querySelector<HTMLElement>('.object-wizard-wide-panel');
    const tableHost = insulationColumn?.querySelector<HTMLElement>('.insulation-layers-table')
      ?? insulationColumn;
    const group = insulationColumn?.querySelector<HTMLElement>('.insulation-layer-group');
    const controls = group
      ? Array.from(group.querySelectorAll<HTMLElement>([
          '[data-testid="insulation-material-select"]',
          '[data-testid="insulation-thickness-input"]',
          '[data-testid="first-insulation-lambda-reference"]',
          '[data-testid="first-insulation-temperature-range-reference"]',
        ].join(',')))
      : [];
    const items = group
      ? Array.from(group.querySelectorAll<HTMLElement>(':scope > .ant-form-item')).filter(visible)
      : [];
    const clippedControls = columns.flatMap((column, columnIndex) => {
      const columnRect = column.getBoundingClientRect();
      return Array.from(column.querySelectorAll<HTMLElement>('input, button, .tlt-select__trigger, .reference-picker-control'))
        .filter(visible)
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          return rect.top < columnRect.top - 2
            || rect.bottom > columnRect.bottom + 2
            || rect.left < columnRect.left - 2
            || rect.right > columnRect.right + 2;
        })
        .map((control) => `${columnIndex}:${control.dataset.testid ?? control.tagName}`);
    });
    const clippedLabels = columns.flatMap((column, columnIndex) => {
      const columnRect = column.getBoundingClientRect();
      return Array.from(column.querySelectorAll<HTMLElement>('.ant-form-item-label > label'))
        .filter(visible)
        .filter((label) => {
          const rect = label.getBoundingClientRect();
          return rect.left < columnRect.left - 2
            || rect.right > columnRect.right + 2
            || label.scrollWidth > label.clientWidth + 2;
        })
        .map((label) => `${columnIndex}:${label.textContent?.replace(/\s+/g, ' ').trim()}`);
    });
    const overlaps: string[] = [];

    for (let index = 0; index < items.length; index += 1) {
      const current = items[index];
      const currentLabel = current.querySelector<HTMLElement>('.ant-form-item-label');
      const currentControl = current.querySelector<HTMLElement>('.ant-form-item-control');
      if (currentLabel && currentControl && overlap(currentLabel.getBoundingClientRect(), currentControl.getBoundingClientRect())) {
        overlaps.push(`label-control:${index}`);
      }
      for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
        if (overlap(current.getBoundingClientRect(), items[otherIndex].getBoundingClientRect())) {
          overlaps.push(`item-item:${index}-${otherIndex}`);
        }
      }
    }

    const insulationRect = insulationColumn?.getBoundingClientRect();
    const fieldsRect = fieldsHost?.getBoundingClientRect();
    const tableRect = tableHost?.getBoundingClientRect();
    const groupRect = group?.getBoundingClientRect();
    const hostWidthRatio = insulationRect && fieldsRect && fieldsRect.width > 0
      ? insulationRect.width / fieldsRect.width
      : 0;
    const tableFillsHost = Boolean(
      insulationRect
      && tableRect
      && Math.abs(tableRect.width - insulationRect.width) <= 2,
    );
    return {
      documentOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
        - document.documentElement.clientWidth,
      columnCount: columns.length,
      columnOverlap: columns.some((column, index) => columns
        .slice(index + 1)
        .some((other) => overlap(column.getBoundingClientRect(), other.getBoundingClientRect()))),
      groupWidthRatio: insulationRect && groupRect ? groupRect.width / Math.max(insulationRect.width - 24, 1) : 0,
      groupOverflow: group ? group.scrollWidth - group.clientWidth : -1,
      hostWidthRatio,
      tableHostOverflow: tableHost ? tableHost.scrollWidth - tableHost.clientWidth : -1,
      tableFillsHost,
      hiddenControls: controls
        .filter((control) => !visible(control))
        .map((control) => control.dataset.testid ?? control.tagName),
      clippedControls,
      clippedLabels,
      overlaps,
    };
  });
}

const AF12_VIEWPORTS = [
  { width: 1000, height: 768 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1440, height: 1000 },
  { width: 1920, height: 1080 },
] as const;

for (const viewport of AF12_VIEWPORTS) {
  test(`AF12 insulation layers host width at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    mkdirSync(OUT_DIR, { recursive: true });
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => failedRequests.push(request.url()));

    await page.setViewportSize(viewport);
    await loginAsGuest(page);
    await expect(page.getByTestId('heat-pdf-three-column-form')).toBeVisible();
    await expect(page.getByTestId('first-insulation-temperature-range-reference')).toBeVisible();

    const proof = await inspectLayout(page);
    expect(proof.documentOverflow).toBeLessThanOrEqual(2);
    expect(proof.hostWidthRatio).toBeGreaterThanOrEqual(0.85);
    expect(proof.tableHostOverflow).toBeLessThanOrEqual(2);
    expect(proof.groupOverflow).toBeLessThanOrEqual(2);
    expect(proof.hiddenControls).toEqual([]);
    expect(proof.clippedControls).toEqual([]);
    expect(proof.clippedLabels).toEqual([]);
    expect(proof.overlaps).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);

    await page.screenshot({
      path: `${OUT_DIR}/af12-1layer-${viewport.width}x${viewport.height}.png`,
      fullPage: false,
    });
  });
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 2048, height: 768 },
]) {
  test(`SC-03 insulation layout is readable at ${viewport.width}px`, async ({ page }) => {
    mkdirSync(OUT_DIR, { recursive: true });
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => failedRequests.push(request.url()));

    await page.setViewportSize(viewport);
    await loginAsGuest(page);
    await expect(page.getByTestId('heat-pdf-three-column-form')).toBeVisible();
    await expect(page.getByTestId('first-insulation-temperature-range-reference')).toBeVisible();

    const proof = await inspectLayout(page);
    expect(proof.columnCount).toBe(4);
    expect(proof.columnOverlap).toBe(false);
    expect(proof.documentOverflow).toBeLessThanOrEqual(2);
    expect(proof.groupWidthRatio).toBeGreaterThan(0.55);
    expect(proof.groupWidthRatio).toBeLessThanOrEqual(1.03);
    expect(proof.groupOverflow).toBeLessThanOrEqual(2);
    expect(proof.hiddenControls).toEqual([]);
    expect(proof.clippedControls).toEqual([]);
    expect(proof.clippedLabels).toEqual([]);
    expect(proof.overlaps).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);

    await page.screenshot({
      path: `${OUT_DIR}/after-${viewport.width}x${viewport.height}.png`,
      fullPage: false,
    });
  });
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 2048, height: 768 },
]) {
  test(`SC-03 keeps three insulation layers inside the insulation section at ${viewport.width}px`, async ({ page }) => {
    mkdirSync(OUT_DIR, { recursive: true });
    await page.setViewportSize(viewport);
    await loginAsGuest(page);

  await page.getByTestId('insulation-layer-count-select').click();
  const threeLayersOption = page.locator('.tlt-select__option, [role="option"]').filter({ hasText: '3 слоя' });
  await expect(threeLayersOption).toHaveCount(1);
  await threeLayersOption.click();

  const insulationColumn = page.locator('.object-wizard-wide-panel .form-col-srs--insulation');
  const thirdLayerMaterial = page.getByTestId('third-insulation-material-select');
  await expect(thirdLayerMaterial).toBeAttached();
  const beforeScroll = await insulationColumn.evaluate((column) => ({
    clientHeight: column.clientHeight,
    scrollHeight: column.scrollHeight,
  }));
  expect(beforeScroll.scrollHeight).toBeLessThanOrEqual(beforeScroll.clientHeight + 2);

  const threeLayerGeometry = await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll<HTMLElement>(
      '.object-wizard-wide-panel .insulation-layers-grid--3 > .insulation-layer-group',
    ));
    const primary = document.querySelector<HTMLElement>('.object-wizard-wide-panel .form-col-srs--primary');
    const fittings = document.querySelector<HTMLElement>('.object-wizard-wide-panel .form-col-srs--fittings');
    const geometryControls = Array.from(document.querySelectorAll<HTMLElement>([
      '[data-testid="outer-diameter-input"]',
    ].join(',')));
    const fittingControls = Array.from(document.querySelectorAll<HTMLElement>([
      '[data-testid="local-elements-count-input"]',
    ].join(',')));
    if (
      groups.length !== 3
      || !primary
      || !fittings
      || geometryControls.length !== 1
      || fittingControls.length !== 1
    ) {
      return { groupsAreTableRows: false, geometryControlFits: false, fittingControlsFit: false };
    }
    const groupRects = groups.map((group) => group.getBoundingClientRect());
    const primaryRect = primary.getBoundingClientRect();
    const fittingsRect = fittings.getBoundingClientRect();
    return {
      groupsAreTableRows: groupRects.every((rect, index) => (
        Math.abs(rect.left - groupRects[0].left) <= 2
        && Math.abs(rect.width - groupRects[0].width) <= 2
        && (index === 0 || rect.top >= groupRects[index - 1].bottom - 2)
      )),
      geometryControlFits: geometryControls.every((control) => {
        const controlRect = control.getBoundingClientRect();
        return controlRect.top >= primaryRect.top
          && controlRect.bottom <= primaryRect.bottom
          && controlRect.left >= primaryRect.left
          && controlRect.right <= primaryRect.right;
      }),
      fittingControlsFit: fittingControls.every((control) => {
        const controlRect = control.getBoundingClientRect();
        return controlRect.top >= fittingsRect.top
          && controlRect.bottom <= fittingsRect.bottom
          && controlRect.left >= fittingsRect.left
          && controlRect.right <= fittingsRect.right;
      }),
    };
  });
  expect(threeLayerGeometry.groupsAreTableRows).toBe(true);
  expect(threeLayerGeometry.geometryControlFits).toBe(true);
  expect(threeLayerGeometry.fittingControlsFit).toBe(true);

  await expect(thirdLayerMaterial).toBeVisible();
  const thirdLayerFits = await page.evaluate(() => {
    const column = document.querySelector<HTMLElement>('.object-wizard-wide-panel .form-col-srs--insulation');
    const controls = Array.from(document.querySelectorAll<HTMLElement>([
      '[data-testid="third-insulation-material-select"]',
      '[data-testid="third-insulation-thickness-input"]',
      '[data-testid="third-insulation-lambda-reference"]',
      '[data-testid="third-insulation-temperature-range-reference"]',
    ].join(',')));
    if (!column || controls.length !== 4) return false;
    const columnRect = column.getBoundingClientRect();
    return controls.every((control) => {
      const controlRect = control.getBoundingClientRect();
      return controlRect.top >= columnRect.top && controlRect.bottom <= columnRect.bottom;
    });
  });
  expect(thirdLayerFits).toBe(true);

  await page.screenshot({
    path: `${OUT_DIR}/after-${viewport.width}x${viewport.height}-three-layers.png`,
    fullPage: false,
  });
  });
}
