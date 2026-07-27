/**
 * Regression seal — «Расчёт теплопотерь» (wide heat-structured card).
 *
 * Контракт раскладки (эталон 2026-07-22):
 *   1. Поля идут СВЕРХУ и переливаются по колонкам: ≤5 видимых полей на
 *      колонку, колонок ≥2 (HARD RULE 4, HeatCalcObjectFieldsPanel).
 *   2. Таблица слоёв изоляции — ПОД полями, на всю ширину карточки.
 *
 * Сломано в CSS-OWN-03 split: generic-шаблон `.form-grid-srs--pdf-three`
 * («heat spec» / «cable cable») перебивал fields/layers-stack на равной
 * специфичности; таблица уезжала в area «cable» (верх-лево), а поля — в
 * несуществующую area «fields» → неявная колонка справа. Вторая половина:
 * chrome-core `.inline-object-form .ant-form-item { grid-column: 1 / -1 }`
 * схлопывал reflow-сетку полей в одну длинную колонку.
 *
 * Дополнительно ≤1200: stacked-режим таблицы слоёв обязан сбрасывать
 * `grid-row: 1` базового режима, иначе все ячейки падают в клетку (1,1).
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

/** Cluster left edges with tolerance so sub-pixel jitter never splits a column. */
function clusterColumns(lefts: number[], tolerance = 8): number[] {
  const clusters: number[][] = [];
  for (const left of [...lefts].sort((a, b) => a - b)) {
    const cluster = clusters.find((c) => Math.abs(c[0] - left) <= tolerance);
    if (cluster) cluster.push(left);
    else clusters.push([left]);
  }
  return clusters.map((c) => c.length);
}

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
      const itemLefts = Array.from(fields.querySelectorAll<HTMLElement>('.ant-form-item'))
        .filter((el) => el.offsetParent !== null)
        .map((el) => el.getBoundingClientRect().left);

      const layerCells = Array.from(
        layers.querySelectorAll<HTMLElement>('.insulation-layer-group > .insulation-layer-cell'),
      ).filter((el) => el.offsetParent !== null);
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
        itemLefts,
        layersWidthRatio: layersRect.width / fieldsRect.width,
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

    // 1 — reflow полей: ≥2 колонок, ≤5 видимых полей в колонке
    const columns = clusterColumns(proof.itemLefts);
    expect(columns.length, 'поля обязаны переливаться минимум в 2 колонки (HARD RULE 4)').toBeGreaterThanOrEqual(2);
    expect(Math.max(...columns), 'не более 5 видимых полей в колонке (HARD RULE 4)').toBeLessThanOrEqual(5);

    // stacked-режим таблицы (≤1200) не схлопывает ячейки в одну клетку
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
