import { test, expect } from '@playwright/test';

import { loginAsGuest, currentGuestContext, API_BASE } from './helpers/workspace';
import {
  createEmptyElectricalVariant,
  createSpecificationReadyPipe,
  ensureElectricalInitialized,
  exportProjectCsv,
  getSpecificationForVariant,
  listElectricalVariants,
  reportPreview,
  saveManualSpecificationItemsForVariant,
} from './helpers/phase5-api';

/**
 * Extra actionable close pack — expands Phase 5 acceptance without external data.
 */
test.describe('Phase 5 actionable close pack', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('5.10 canonical UUID GET is null before formation and never falls back to a numeric adapter', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page);
    const variants = await ensureElectricalInitialized(page);
    const erId = variants[0].id as string;

    const spec = await getSpecificationForVariant(page, erId);
    expect(spec.status()).toBe(200);
    expect(await spec.json()).toBeNull();
  });

  test('5.11 legacy generation aliases are rejected with the canonical validation code', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const response = await page.request.post(`${API_BASE}/api/v1/specifications/${projectId}/generate`, {
      headers: { 'X-Session-Id': sessionId },
      data: {
        electrical_variant_ids: [crypto.randomUUID()],
        confirm_partial: true,
      },
    });
    expect(response.status()).toBe(422);
    const detail = (await response.json()).detail;
    expect(detail.code).toBe('SPEC_VARIANT_IDS_REQUIRED');
    expect(detail.details).toEqual({});
    expect(detail.issues).not.toHaveLength(0);
  });

  test('5.12 report multi-ER explicit list keeps independent chapters', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page);
    const variants = await ensureElectricalInitialized(page);
    const er1 = variants[0];
    const er2 = await createEmptyElectricalVariant(page, `ER-close-${Date.now()}`);
    const preview = await reportPreview(page, [er1.id, er2.id]);
    expect(preview.status()).toBe(200);
    const body = await preview.json();
    expect(body.chapters).toHaveLength(2);
    expect(body.chapters.map((chapter: { electrical_variant_id: string }) => chapter.electrical_variant_id))
      .toEqual([er1.id, er2.id]);
    expect(body.html).not.toContain('SECRET-MARK');
  });

  test('5.13 CSV v3 export → re-import trust path for guest', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page);
    await ensureElectricalInitialized(page);
    const csv = await exportProjectCsv(page);
    expect(csv).toContain('schema_version;3');

    const { sessionId } = await currentGuestContext(page);
    const reimport = await page.request.post(`${API_BASE}/api/v1/projects/import-csv`, {
      headers: { 'X-Session-Id': sessionId },
      multipart: {
        file: {
          name: 'roundtrip.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csv.startsWith('\ufeff') ? csv : `\ufeff${csv}`, 'utf-8'),
        },
      },
    });
    expect(reimport.status()).toBe(201);
    const projects = await page.request.get(`${API_BASE}/api/v1/projects`, {
      headers: { 'X-Session-Id': sessionId },
    });
    expect(projects.status()).toBe(200);
    expect((await projects.json()).length).toBe(1);
  });

  test('5.14 manual UUID PUT is employee-only and accepts no guest write bypass', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page);
    const variants = await ensureElectricalInitialized(page);
    const erId = variants[0].id as string;
    const response = await saveManualSpecificationItemsForVariant(page, erId, [
      {
        category: 'extra',
        name: 'Guest must not save this row',
        unit: 'шт.',
        quantity: '1',
        source: 'manual',
      },
    ]);
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ detail: 'Недостаточно прав' });

    const spec = await getSpecificationForVariant(page, erId);
    expect(spec.status()).toBe(200);
    expect(await spec.json()).toBeNull();
  });

  test('5.14a OpenAPI exposes snapshot and removes generation_options from UUID GET', async ({ page }) => {
    const response = await page.request.get(`${API_BASE}/api/v1/openapi.json`);
    expect(response.status()).toBe(200);
    const schemas = (await response.json()).components.schemas;
    expect(schemas.SpecificationResponse.properties).toHaveProperty('snapshot');
    expect(schemas.SpecificationResponse.properties).not.toHaveProperty('generation_options');
    expect(schemas.SpecificationResponse.required).toContain('electrical_variant_id');
  });

  test('5.15 list ER remains within max 5 capacity message path', async ({ page }) => {
    await loginAsGuest(page);
    await createSpecificationReadyPipe(page);
    await ensureElectricalInitialized(page);
    const list = await listElectricalVariants(page);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.length).toBeLessThanOrEqual(5);
  });
});
