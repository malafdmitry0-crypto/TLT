/**
 * AGENT: large layout-proof e2e. Helpers live in heat-form-layout-split.helpers.ts.
 * Touch only when changing heat form layout acceptance journeys.
 */
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  OUT_DIR,
  clearHover,
  openHeatFormVariant,
  setInsulationLayerCount,
} from './heat-form-layout-split.helpers';
import { inspectHeatForm } from './heat-form-layout-split.inspect';

test('SC-03 has independent wide and side form layouts', async ({ page }) => {
  mkdirSync(OUT_DIR, { recursive: true });

  await openHeatFormVariant(page, 'top', { width: 1366, height: 768 });
  await setInsulationLayerCount(page, '3 слоя');
  const wide = await inspectHeatForm(page);
  await clearHover(page);
  await page.screenshot({ path: join(OUT_DIR, 'after-wide-1366.png'), fullPage: false });

  expect(wide.shellLayout).toBe('wide');
  expect(wide.formLayout).toBe('wide');
  expect(wide.formClass).toContain('inline-object-form--wide');
  expect(wide.widePanelCount).toBe(1);
  expect(wide.sidePanelCount).toBe(0);
  expect(wide.wideSectionCount).toBe(3);
  expect(wide.wideBannerCount).toBe(0);
  expect(wide.wideHeadings).toEqual([
    'Параметры трубопровода',
    'Условия эксплуатации',
    'Теплоизоляция',
  ]);
  expect(wide.sideHeadings).toEqual([]);
  expect(wide.wideGridCount).toBe(1);
  expect(wide.sideGridCount).toBe(0);
  expect(wide.visibleResizeHandleCount).toBe(0);
  expect(wide.labelPlacementIssues).toEqual([]);
  expect(wide.wideLabelFlowIssues).toEqual([]);
  expect(wide.wideLayerRowIssues).toEqual([]);
  expect(wide.wideCompactIssues).toEqual([]);
  expect(wide.wideSectionLayoutIssues).toEqual([]);
  expect(wide.issues).toEqual([]);

  await openHeatFormVariant(page, 'top', { width: 2048, height: 768 });
  const wideLargeSingleLayer = await inspectHeatForm(page);
  await clearHover(page);
  await page.screenshot({ path: join(OUT_DIR, 'after-wide-2048-one-layer.png'), fullPage: false });

  expect(wideLargeSingleLayer.shellLayout).toBe('wide');
  expect(wideLargeSingleLayer.formLayout).toBe('wide');
  expect(wideLargeSingleLayer.wideSectionCount).toBe(3);
  expect(wideLargeSingleLayer.visibleResizeHandleCount).toBe(0);
  expect(wideLargeSingleLayer.labelPlacementIssues).toEqual([]);
  expect(wideLargeSingleLayer.wideLabelFlowIssues).toEqual([]);
  expect(wideLargeSingleLayer.wideLayerRowIssues).toEqual([]);
  expect(wideLargeSingleLayer.wideCompactIssues).toEqual([]);
  expect(wideLargeSingleLayer.wideSectionLayoutIssues).toEqual([]);
  expect(wideLargeSingleLayer.issues).toEqual([]);

  await setInsulationLayerCount(page, '3 слоя');
  const wideLarge = await inspectHeatForm(page);
  await clearHover(page);
  await page.screenshot({ path: join(OUT_DIR, 'after-wide-2048.png'), fullPage: false });

  expect(wideLarge.shellLayout).toBe('wide');
  expect(wideLarge.formLayout).toBe('wide');
  expect(wideLarge.wideSectionCount).toBe(3);
  expect(wideLarge.visibleResizeHandleCount).toBe(0);
  expect(wideLarge.labelPlacementIssues).toEqual([]);
  expect(wideLarge.wideLabelFlowIssues).toEqual([]);
  expect(wideLarge.wideLayerRowIssues).toEqual([]);
  expect(wideLarge.wideCompactIssues).toEqual([]);
  expect(wideLarge.wideSectionLayoutIssues).toEqual([]);
  expect(wideLarge.issues).toEqual([]);

  await openHeatFormVariant(page, 'bottom', { width: 1366, height: 768 });
  await setInsulationLayerCount(page, '3 слоя');
  const bottomWide = await inspectHeatForm(page);
  await clearHover(page);
  await page
    .locator('[aria-label="Блок заполнения параметров"]')
    .screenshot({ path: join(OUT_DIR, 'after-bottom-1366.png') });

  expect(bottomWide.shellLayout).toBe('wide');
  expect(bottomWide.formLayout).toBe('wide');
  expect(bottomWide.formClass).toContain('inline-object-form--wide');
  expect(bottomWide.widePanelCount).toBe(1);
  expect(bottomWide.sidePanelCount).toBe(0);
  expect(bottomWide.wideSectionCount).toBe(3);
  expect(bottomWide.wideBannerCount).toBe(0);
  expect(bottomWide.wideHeadings).toEqual([
    'Параметры трубопровода',
    'Условия эксплуатации',
    'Теплоизоляция',
  ]);
  expect(bottomWide.sideHeadings).toEqual([]);
  expect(bottomWide.wideGridCount).toBe(1);
  expect(bottomWide.sideGridCount).toBe(0);
  expect(bottomWide.visibleResizeHandleCount).toBe(0);
  expect(bottomWide.labelPlacementIssues).toEqual([]);
  expect(bottomWide.wideLabelFlowIssues).toEqual([]);
  expect(bottomWide.wideLayerRowIssues).toEqual([]);
  expect(bottomWide.wideCompactIssues).toEqual([]);
  expect(bottomWide.wideSectionLayoutIssues).toEqual([]);
  expect(bottomWide.issues).toEqual([]);

  await openHeatFormVariant(page, 'right', { width: 1280, height: 900 });
  await setInsulationLayerCount(page, '3 слоя');
  const side = await inspectHeatForm(page);
  await clearHover(page);
  await page.screenshot({ path: join(OUT_DIR, 'after-side-1280.png'), fullPage: false });

  expect(side.shellLayout).toBe('side');
  expect(side.formLayout).toBe('side');
  expect(side.formClass).toContain('inline-object-form--side');
  expect(side.widePanelCount).toBe(0);
  expect(side.sidePanelCount).toBe(1);
  expect(side.wideSectionCount).toBe(0);
  expect(side.wideBannerCount).toBe(0);
  expect(side.wideHeadings).toEqual([]);
  expect(side.sideHeadings).toEqual(['Геометрия и размещение трубы', 'Теплоизоляция', 'Климат и температуры']);
  expect(side.wideGridCount).toBe(0);
  expect(side.sideGridCount).toBe(1);
  expect(side.sideSectionCount).toBe(3);
  expect(side.visibleResizeHandleCount).toBe(0);
  expect(side.labelPlacementIssues).toEqual([]);
  expect(side.wideLabelFlowIssues).toEqual([]);
  expect(side.wideLayerRowIssues).toEqual([]);
  expect(side.wideCompactIssues).toEqual([]);
  expect(side.wideSectionLayoutIssues).toEqual([]);
  expect(side.issues).toEqual([]);
});
