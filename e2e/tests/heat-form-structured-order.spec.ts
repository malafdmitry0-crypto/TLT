/**
 * Regression seal — «Расчёт теплопотерь» (wide heat-structured card).
 *
 * Контракт раскладки (эталон 2026-07-27):
 *   1. Поля образуют три независимые семантические группы: wide,
 *      geometry numeric, environment numeric. Hidden-поля сжимают только
 *      свою группу и никогда не перетекают в соседнюю.
 *   2. Таблица слоёв изоляции — ПОД полями, на всю ширину карточки.
 *   3. Numeric controls равны внутри столбца: geometry = 96px,
 *      environment = 92px. Таблица имеет собственный пятиколоночный grid.
 *
 * Сломано в CSS-OWN-03 split: generic-шаблон `.form-grid-srs--pdf-three`
 * («heat spec» / «cable cable») перебивал fields/layers-stack на равной
 * специфичности; таблица уезжала в area «cable» (верх-лево), а поля — в
 * несуществующую area «fields» → неявная колонка справа. Вторая половина:
 * chrome-core `.inline-object-form .ant-form-item { grid-column: 1 / -1 }`
 * схлопывал reflow-сетку полей в одну длинную колонку.
 *
 * На всех поддерживаемых desktop viewport таблица остаётся пятиколоночной:
 * мобильный stacked-режим продуктом не поддерживается.
 *
 * Скриншоты: element-level baseline карточки на трёх обязательных viewport
 * (см. docs/frontend/viewport-policy.md). Обновление при намеренном изменении:
 *   E2E_BASE_URL=http://localhost:3003 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
 *     npx playwright test heat-form-structured-order --update-snapshots
 */
import { expect, test } from '@playwright/test';

import { loginAsGuest } from './helpers/workspace';

const VIEWPORTS = [
  { width: 1000, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

test('обязательные поля подсвечены; селект визуально закрывается после выбора', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsGuest(page);
  await expect(page.getByTestId('heat-pdf-three-column-form')).toBeVisible();

  // 1 — required-подсветка: Ant-миграция должна продолжать эмитить data-required
  // на обёртке, а tlt-form-controls.css — красить корень контрола.
  const requiredChrome = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="outer-diameter-input"]');
    const root = input?.closest('.tlt-number-field__input');
    if (!root) return null;
    const style = getComputedStyle(root);
    return { background: style.backgroundColor, boxShadow: style.boxShadow };
  });
  expect(requiredChrome, 'корень обязательного числового поля должен существовать').not.toBeNull();
  expect(requiredChrome?.background, 'фон обязательного поля — палевый (fffdf6)').toBe('rgb(255, 253, 246)');
  expect(requiredChrome?.boxShadow, 'оранжевая полоса слева').toContain('inset');

  // 2 — дропдаун закрывается ВИЗУАЛЬНО, а не только по aria-expanded.
  // Регрессия: `display: grid` легаси-класса на popup-root перебивал
  // `.ant-select-dropdown-hidden { display: none }` — селект закрывался
  // логически, но оставался на экране.
  await page.getByTestId('placement-select').click();
  const dropdown = page.locator('.ant-select-dropdown:visible');
  await expect(dropdown).toBeVisible();
  await dropdown.getByTitle('В помещении').click();
  await expect(
    page.locator('.ant-select-dropdown:visible'),
    'после выбора опции дропдаун обязан исчезнуть с экрана',
  ).toHaveCount(0);
});

for (const viewport of VIEWPORTS) {
  test(`heat card: поля сверху колонками, таблица снизу @ ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) => failedRequests.push(request.url()));

    await page.setViewportSize(viewport);
    await loginAsGuest(page);

    const card = page.getByTestId('heat-pdf-three-column-form');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('wizard-zone-insulation-layers')).toBeVisible();
    await expect(page.getByTestId('first-insulation-temperature-range-reference')).toBeVisible();

    const proof = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('.form-grid-srs--heat-structured');
      const fields = grid?.querySelector<HTMLElement>('.heat-wizard-zone--fields');
      const layers = grid?.querySelector<HTMLElement>('.heat-wizard-zone--layers');
      if (!grid || !fields || !layers) return null;

      const fieldsRect = fields.getBoundingClientRect();
      const layersRect = layers.getBoundingClientRect();
      const visible = (selector: string) => Array.from(
        fields.querySelectorAll<HTMLElement>(selector),
      ).filter((el) => el.offsetParent !== null);
      const rects = (selector: string) => visible(selector).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
        };
      });
      const wideItems = rects([
        '.name-form-item',
        '.pipe-material-form-item',
        '.tank-shape-form-item',
        '.placement-form-item',
        '.ground-type-form-item',
        '.climate-form-item',
        '.insulation-temperature-basis-form-item',
      ].join(','));
      const geometryItems = rects([
        '.outer-diameter-form-item',
        '.pipe-length-form-item',
        '.wall-thickness-form-item',
        '.pipe-lambda-manual-form-item',
        '.local-elements-count-form-item',
        '.tank-size-form-item',
      ].join(','));
      const environmentItems = rects([
        '.ambient-temperature-form-item',
        '.process-temperature-form-item',
        '.wind-speed-form-item',
        '.burial-depth-form-item',
        '.ground-conductivity-form-item',
        '.tank-additional-heat-loss-form-item',
      ].join(','));
      const controlWidths = (selector: string) => visible(selector).map((item) => {
        const control = item.querySelector<HTMLElement>('.tlt-number-field')
          ?? item.querySelector<HTMLElement>('.ant-form-item-control');
        return control?.getBoundingClientRect().width ?? 0;
      });
      const geometryControlWidths = controlWidths([
        '.outer-diameter-form-item',
        '.pipe-length-form-item',
        '.wall-thickness-form-item',
        '.pipe-lambda-manual-form-item',
        '.local-elements-count-form-item',
        '.tank-size-form-item',
      ].join(','));
      const environmentControlWidths = controlWidths([
        '.ambient-temperature-form-item',
        '.process-temperature-form-item',
        '.wind-speed-form-item',
        '.burial-depth-form-item',
        '.ground-conductivity-form-item',
        '.tank-additional-heat-loss-form-item',
      ].join(','));
      const slotOrder = visible('.ant-form-item').map(
        (item) => item.closest<HTMLElement>('[data-slot]')?.dataset.slot ?? '',
      ).filter((slot) => slot.length > 0);

      const layerCells = Array.from(
        layers.querySelectorAll<HTMLElement>('.insulation-layer-group > .insulation-layer-cell'),
      ).filter((el) => el.offsetParent !== null);
      const layerHeader = layers.querySelector<HTMLElement>('.insulation-layers-header');
      const layerRow = layers.querySelector<HTMLElement>('.insulation-layer-group');
      const thicknessControl = layers.querySelector<HTMLElement>(
        '.insulation-layer-cell--thickness .ant-form-item-control',
      );
      const cellPairOverlap = layerCells.some((cell, index) => {
        const a = cell.getBoundingClientRect();
        return layerCells.slice(index + 1).some((other) => {
          const b = other.getBoundingClientRect();
          return Math.min(a.right, b.right) > Math.max(a.left, b.left) + 2
            && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 2;
        });
      });

      return {
        layersBelowFields: layersRect.top >= fieldsRect.bottom - 1,
        zonesOverlap: Math.min(fieldsRect.bottom, layersRect.bottom) > Math.max(fieldsRect.top, layersRect.top) + 2
          && Math.min(fieldsRect.right, layersRect.right) > Math.max(fieldsRect.left, layersRect.left) + 2,
        wideItems,
        geometryItems,
        environmentItems,
        geometryControlWidths,
        environmentControlWidths,
        slotOrder,
        layersWidthRatio: layersRect.width / fieldsRect.width,
        layerHeaderTracks: layerHeader ? getComputedStyle(layerHeader).gridTemplateColumns : '',
        layerRowTracks: layerRow ? getComputedStyle(layerRow).gridTemplateColumns : '',
        thicknessControlWidth: thicknessControl?.getBoundingClientRect().width ?? 0,
        layerCellOverlap: cellPairOverlap,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(proof, 'heat-structured grid, fields и layers зоны должны существовать').not.toBeNull();
    if (!proof) return;

    // 2 — таблица под полями, без перекрытия, на всю ширину карточки
    expect(proof.layersBelowFields, 'таблица слоёв должна быть ПОД полями').toBe(true);
    expect(proof.zonesOverlap, 'поля и таблица не должны перекрываться').toBe(false);
    expect(proof.layersWidthRatio, 'таблица тянется на ширину блока полей').toBeGreaterThanOrEqual(0.85);

    // 1 — wide-first: группы не смешиваются и читаются слева направо.
    expect(proof.wideItems.length).toBeGreaterThan(0);
    expect(proof.geometryItems.length).toBeGreaterThan(0);
    expect(proof.environmentItems.length).toBeGreaterThan(0);
    expect(Math.max(...proof.wideItems.map((rect) => rect.right)))
      .toBeLessThanOrEqual(Math.min(...proof.geometryItems.map((rect) => rect.left)) + 1);
    expect(Math.max(...proof.geometryItems.map((rect) => rect.right)))
      .toBeLessThanOrEqual(Math.min(...proof.environmentItems.map((rect) => rect.left)) + 1);
    expect(new Set(proof.wideItems.map((rect) => Math.round(rect.left))).size).toBe(1);
    expect(new Set(proof.geometryItems.map((rect) => Math.round(rect.left))).size).toBe(1);
    expect(new Set(proof.environmentItems.map((rect) => Math.round(rect.left))).size).toBe(1);
    const slotRank: Record<string, number> = {
      wide: 0,
      'geometry-numeric': 1,
      'environment-numeric': 2,
    };
    const slotRanks = proof.slotOrder.map((slot) => slotRank[slot] ?? 3);
    expect(slotRanks, 'DOM/tab-порядок должен повторять wide → geometry → environment')
      .toEqual([...slotRanks].sort((a, b) => a - b));
    proof.geometryControlWidths.forEach((width) => {
      expect(width, 'geometry controls должны занимать 96px').toBeCloseTo(96, 0);
    });
    proof.environmentControlWidths.forEach((width) => {
      expect(width, 'environment controls должны занимать 92px').toBeCloseTo(92, 0);
    });

    // 3 — таблица сохраняет собственный пятиколоночный grid и широкий input толщины.
    expect(proof.layerHeaderTracks).toBe(proof.layerRowTracks);
    expect(proof.layerRowTracks.trim().split(/\s+/)).toHaveLength(5);
    expect(proof.thicknessControlWidth).toBeCloseTo(128, 0);
    expect(proof.layerCellOverlap, 'ячейки слоя не должны перекрываться').toBe(false);

    // seals
    expect(proof.documentOverflow).toBeLessThanOrEqual(2);
    expect(failedRequests).toEqual([]);
    expect(consoleErrors).toEqual([]);

    await expect(card).toHaveScreenshot(`heat-card-${viewport.width}x${viewport.height}.png`, {
      maxDiffPixelRatio: 0.05,
    });
  });
}
