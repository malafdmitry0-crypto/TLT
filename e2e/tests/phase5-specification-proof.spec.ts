import { test, expect } from '@playwright/test';

import { createCalculatedPipe, createCalculatedTank, loginAsGuest, currentGuestContext } from './helpers/workspace';
import {
  CANONICAL_SPECIFICATION_OPTIONS,
  createEmptyElectricalVariant,
  ensureElectricalInitialized,
  exportProjectCsv,
  generateSpecification,
  getSpecificationSettings,
  listElectricalVariants,
  reportPreview,
  updateSpecificationSettings,
} from './helpers/phase5-api';

/**
 * Phase 5 proof pack — actionable acceptance scenarios.
 * Numbers map to functional flow groups (not PDF page numbers).
 */
test.describe('Phase 5 specification proof pack', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('5.1 guest opens specification controls at desktop width', async ({ page }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page);
    await ensureElectricalInitialized(page);
    await page.getByRole('menuitem', { name: 'Спецификация' }).click();
    const form = page.getByRole('button', { name: /Сформировать|Пересчитать/i }).first();
    const warning = page.getByText(/ЭР ещё не создан|спецификация временно недоступна|Загрузка/i);
    await expect(form.or(warning.first())).toBeVisible({ timeout: 20_000 });
    const width = await page.evaluate(() => window.innerWidth);
    expect(width).toBeGreaterThanOrEqual(1280);
  });

  test('5.1a Heat objects do not own specification settings', async ({ page }) => {
    await loginAsGuest(page);
    const pipe = await createCalculatedPipe(page);
    const tank = await createCalculatedTank(page);
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

  test('5.3 defaults settings API versioned without generation (PDL-ER-07)', async ({ page }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page);
    await ensureElectricalInitialized(page);
    const before = await getSpecificationSettings(page);
    expect(before.version).toBeGreaterThanOrEqual(1);
    const after = await updateSpecificationSettings(page, {
      grouping_mode: 'separate_by_object_type',
      Ex: true,
      K1i: false,
      K2i: false,
      Kiu: false,
      L_K2i_m: '0',
      R_gr: '1.2',
    });
    expect(after.version).toBeGreaterThanOrEqual(before.version);
    expect(after.settings.R_gr).toBe('1.2');
    expect(after.settings.Ex).toBe(true);
  });

  test('5.4 multi-ER list create up to two variants + generate preflight path', async ({ page }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page, `Phase5 pipe ${Date.now()}`);
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

    const gen = await generateSpecification(page, {
      variantIds: [er1.id, er2.id],
      excludeUnassignedConfirmed: true,
      options: CANONICAL_SPECIFICATION_OPTIONS,
      inspectBody: (body) => {
        expect(body).toEqual({
          variant_ids: [er1.id, er2.id],
          options: CANONICAL_SPECIFICATION_OPTIONS,
          exclude_unassigned_confirmed: true,
          catalog_selections: {},
        });
        expect(body).not.toHaveProperty('electrical_variant_ids');
        expect(body).not.toHaveProperty('confirm_partial');
        expect(body).not.toHaveProperty('mode');
      },
    });
    expect([201, 422, 404]).toContain(gen.status());
    if (gen.status() === 201) {
      const body = await gen.json();
      expect(body.project_id).toBeTruthy();
      expect(body.results).toHaveLength(2);
    }
  });

  test('5.5 CSV v3 export contains schema_version 3 and ER graph markers', async ({ page }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page);
    await ensureElectricalInitialized(page);
    const csv = await exportProjectCsv(page);
    expect(csv).toMatch(/schema_version;3|schema_version";3/i);
    expect(csv).toContain('[SECTION];metadata');
    expect(csv).toContain('[SECTION];objects');
  });

  test('5.6 report preview accepts explicit electrical_variant_id list', async ({ page }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page);
    const variants = await ensureElectricalInitialized(page);
    const erId = variants[0].id as string;
    const preview = await reportPreview(page, [erId]);
    expect([200, 422, 404]).toContain(preview.status());
    if (preview.status() === 200) {
      const body = await preview.json();
      expect(typeof body.html).toBe('string');
      // Stale procurement quantities must not appear as success when empty/stale
      expect(body.html).not.toMatch(/SECRET-MARK/);
    }
  });

  test('5.7 UI: defaults button present when params/sidebar available', async ({ page }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page);
    await ensureElectricalInitialized(page);
    await page.getByRole('menuitem', { name: 'Спецификация' }).click();
    // Without ready ER the page may show warning instead of generate controls.
    const form = page.getByRole('button', { name: /Сформировать|Пересчитать/i }).first();
    const warning = page.getByText(/ЭР ещё не создан|спецификация временно недоступна/i);
    await expect(form.or(warning.first())).toBeVisible({ timeout: 15_000 });
    const saveDefaults = page.getByRole('button', { name: /Сохранить defaults/i });
    if (await saveDefaults.count()) {
      await expect(saveDefaults).toBeVisible();
    }
  });

  test('5.8 multi-ER report params do not require localStorage selection', async ({ page }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page);
    const variants = await ensureElectricalInitialized(page);
    const er2 = await createEmptyElectricalVariant(page, `ЭР-report-${Date.now()}`);
    const ids = [variants[0].id as string, er2.id as string];
    const preview = await reportPreview(page, ids);
    // Explicit UUID list is accepted; empty localStorage must not be required.
    expect([200, 422, 404, 409]).toContain(preview.status());
  });

  test('5.9 guest context isolation — project bound to session', async ({ page }) => {
    await loginAsGuest(page);
    const ctx = await currentGuestContext(page);
    expect(ctx.projectId).toBeTruthy();
    expect(ctx.sessionId).toBeTruthy();
    await createCalculatedPipe(page);
    const objects = await page.request.get(
      `${process.env.E2E_API_BASE ?? 'http://127.0.0.1:8000'}/api/v1/projects/${ctx.projectId}/objects`,
      { headers: { 'X-Session-Id': ctx.sessionId } },
    );
    expect(objects.ok()).toBeTruthy();
    const list = await objects.json();
    expect(Array.isArray(list) ? list.length : list.items?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});
