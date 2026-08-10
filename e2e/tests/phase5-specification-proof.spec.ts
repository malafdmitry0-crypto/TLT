import { test, expect } from '@playwright/test';

import { loginAsGuest, currentGuestContext } from './helpers/workspace';
import {
  CANONICAL_SPECIFICATION_OPTIONS,
  createEmptyElectricalVariant,
  createSpecificationReadyPipe,
  createSpecificationReadyTank,
  ensureElectricalInitialized,
  exportProjectCsv,
  generateSpecification,
  getSpecificationForVariant,
  listElectricalVariants,
  reportPreview,
} from './helpers/phase5-api';

/**
 * Phase 5 proof pack — actionable acceptance scenarios.
 * Numbers map to functional flow groups (not PDF page numbers).
 */
test.describe('Phase 5 specification proof pack', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('5.1 guest opens specification controls at desktop width', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page);
    await ensureElectricalInitialized(page);
    await page.getByRole('menuitem', { name: 'Спецификация' }).click();
    await expect(page.getByRole('button', { name: /Сформировать|Пересчитать/i }).first())
      .toBeVisible({ timeout: 20_000 });
    const width = await page.evaluate(() => window.innerWidth);
    expect(width).toBeGreaterThanOrEqual(1280);
  });

  test('5.1a Heat objects do not own specification settings', async ({ page }) => {
    await loginAsGuest(page);
    const pipe = await createSpecificationReadyPipe(page);
    const tank = await createSpecificationReadyTank(page);
    const forbidden = [
      'explosion_zone_type',
      'power_indication_on_boxes',
      'end_of_section_indication',
      'top_of_box_indication',
      'min_length_for_k2i',
      'hot_reserve_coefficient',
    ];
    for (const object of [pipe, tank]) {
      for (const key of forbidden) {
        expect(object.params).not.toHaveProperty(key);
      }
    }
    await expect(page.getByText('Подбор спецификации')).toHaveCount(0);
  });

  test('5.2 narrow viewport shows ≥1280 warning (PDL-ER-30)', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await loginAsGuest(page);
    await expect(page.getByText(/1280/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('5.4 UUID generation request rejects unknown ER with the exact canonical envelope', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page, `Phase5 pipe ${Date.now()}`);
    const variants = await ensureElectricalInitialized(page);
    expect(variants.length).toBeGreaterThanOrEqual(1);
    const er1 = variants[0];
    let er2 = variants.find((v: { name: string }) => v.name !== er1.name);
    if (!er2) {
      er2 = await createEmptyElectricalVariant(page, `ЭР2-e2e-${Date.now()}`);
    }
    expect(er2.id).toBeTruthy();
    const list = await listElectricalVariants(page);
    expect(list.length).toBeGreaterThanOrEqual(2);

    const unknownVariantId = crypto.randomUUID();
    const gen = await generateSpecification(page, {
      variantIds: [unknownVariantId],
      excludeUnassignedConfirmed: true,
      options: CANONICAL_SPECIFICATION_OPTIONS,
      inspectBody: (body) => {
        expect(body).toEqual({
          variant_ids: [unknownVariantId],
          options: CANONICAL_SPECIFICATION_OPTIONS,
          exclude_unassigned_confirmed: true,
          catalog_selections: {},
        });
        expect(body).not.toHaveProperty('electrical_variant_ids');
        expect(body).not.toHaveProperty('confirm_partial');
        expect(body).not.toHaveProperty('mode');
      },
    });
    expect(gen.status()).toBe(404);
    expect(await gen.json()).toEqual({
      detail: {
        code: 'SPEC_VARIANT_NOT_FOUND',
        message: 'Один или несколько ЭР не найдены в проекте',
        issues: [],
        details: { missing_variant_ids: [unknownVariantId] },
      },
    });

    const emptySpecification = await getSpecificationForVariant(page, er1.id);
    expect(emptySpecification.status()).toBe(200);
    expect(await emptySpecification.json()).toBeNull();
  });

  test('5.5 CSV v3 export contains schema_version 3 and ER graph markers', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page);
    await ensureElectricalInitialized(page);
    const csv = await exportProjectCsv(page);
    expect(csv).toMatch(/schema_version;3|schema_version";3/i);
    expect(csv).toContain('[SECTION];metadata');
    expect(csv).toContain('[SECTION];objects');
  });

  test('5.6 report preview accepts explicit electrical_variant_id list', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page);
    const variants = await ensureElectricalInitialized(page);
    const erId = variants[0].id as string;
    const preview = await reportPreview(page, [erId]);
    expect(preview.status()).toBe(200);
    const body = await preview.json();
    expect(body.electrical_variant_id).toBe(erId);
    expect(typeof body.html).toBe('string');
    expect(body.html).not.toMatch(/SECRET-MARK/);
  });

  test('5.7 UI: canonical generation control is present for initialized ER', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page);
    await ensureElectricalInitialized(page);
    await page.getByRole('menuitem', { name: 'Спецификация' }).click();
    await expect(page.getByRole('button', { name: /Сформировать|Пересчитать/i }).first())
      .toBeVisible({ timeout: 15_000 });
  });

  test('5.8 multi-ER report params do not require localStorage selection', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page);
    const variants = await ensureElectricalInitialized(page);
    const er2 = await createEmptyElectricalVariant(page, `ЭР-report-${Date.now()}`);
    const ids = [variants[0].id as string, er2.id as string];
    const preview = await reportPreview(page, ids);
    expect(preview.status()).toBe(200);
    const body = await preview.json();
    expect(body.chapters).toHaveLength(2);
    expect(body.chapters.map((chapter: { electrical_variant_id: string }) => chapter.electrical_variant_id))
      .toEqual(ids);
  });

  test('5.9 guest context isolation — project bound to session', async ({ page }) => {
    await loginAsGuest(page);
    const ctx = await currentGuestContext(page);
    expect(ctx.projectId).toBeTruthy();
    expect(ctx.sessionId).toBeTruthy();
    await createSpecificationReadyPipe(page);
    const objects = await page.request.get(
      `${process.env.E2E_API_BASE ?? 'http://127.0.0.1:8000'}/api/v1/projects/${ctx.projectId}/objects`,
      { headers: { 'X-Session-Id': ctx.sessionId } },
    );
    expect(objects.status()).toBe(200);
    const list = await objects.json();
    expect(Array.isArray(list) ? list.length : list.items?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});
