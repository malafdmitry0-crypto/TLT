/**
 * API-level helpers for Phase 5 specification/ER flows in Playwright.
 * Prefer these for multi-step setup; keep UI asserts on user-visible outcomes.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { API_BASE, currentGuestContext } from './workspace';

export type GuestCtx = { projectId: string; sessionId: string };

export type ElectricalVariantSummary = {
  id: string;
  name: string;
  is_active: boolean;
};

export const CANONICAL_SPECIFICATION_OPTIONS = {
  grouping_mode: 'separate_by_object_type',
  Ex: false,
  K1i: false,
  K2i: false,
  Kiu: false,
  L_K2i_m: '0',
  R_gr: '1',
} as const;

export async function guestHeaders(page: Page): Promise<Record<string, string>> {
  const { sessionId } = await currentGuestContext(page);
  return { 'X-Session-Id': sessionId };
}

export async function createSpecificationReadyPipe(
  page: Page,
  name = `E2E specification pipe ${Date.now()}`,
) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/objects`,
    {
      headers: { 'X-Session-Id': sessionId },
      data: {
        object_type: 'pipe',
        params: {
          name,
          outer_diameter: 0.108,
          wall_thickness: 0.004,
          pipe_material: 'carbon_steel',
          insulation_layers: [
            { thickness: 0.05, material: 'mineral_wool_boards_120' },
          ],
          insulation_temperature_basis: 'outdoor_winter',
          ambient_temperature: -30,
          process_temperature: 80,
          pipe_length: 50,
          placement: 'outdoor',
          wind_speed: 0,
        },
      },
    },
  );
  expect(response.status()).toBe(201);
  return response.json();
}

export async function createSpecificationReadyTank(
  page: Page,
  name = `E2E specification tank ${Date.now()}`,
) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/objects`,
    {
      headers: { 'X-Session-Id': sessionId },
      data: {
        object_type: 'tank',
        params: {
          name,
          shape: 'cylindrical',
          diameter: 2,
          height: 3,
          insulation_layers: [
            { thickness: 0.08, material: 'mineral_wool_boards_120' },
          ],
          insulation_temperature_basis: 'outdoor_winter',
          ambient_temperature: -20,
          process_temperature: 80,
          placement: 'outdoor',
          wind_speed: 0,
        },
      },
    },
  );
  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.is_valid).toBe(true);
  return body;
}

export async function listElectricalVariants(page: Page) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const resp = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(resp.status()).toBe(200);
  return resp.json() as Promise<Array<ElectricalVariantSummary>>;
}

export async function ensureElectricalInitialized(page: Page) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const headers = { 'X-Session-Id': sessionId };
  const list = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    { headers },
  );
  expect(list.status()).toBe(200);
  const body = await list.json();
  if (Array.isArray(body) && body.length > 0) return body;
  const init = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/initialize`,
    { headers },
  );
  expect(init.status()).toBe(200);
  const after = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    { headers },
  );
  expect(after.status()).toBe(200);
  return after.json();
}

export async function createEmptyElectricalVariant(page: Page, name: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  // HTTP headers must be ASCII — do not put Cyrillic names into Idempotency-Key.
  const key = `e2e-create-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const resp = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    {
      headers: {
        'X-Session-Id': sessionId,
        'Idempotency-Key': key,
      },
      data: { name },
    },
  );
  expect(resp.status()).toBe(201);
  return resp.json() as Promise<{
    id: string;
    name: string;
    is_active: boolean;
  }>;
}

export async function batchCalcElectrical(
  page: Page,
  electricalVariantId: string,
  opts?: { variantNumber?: number; cableType?: string },
) {
  const { projectId, sessionId } = await currentGuestContext(page);
  // Backend expects project_id as query param (see frontend calculations.ts).
  const resp = await page.request.post(`${API_BASE}/api/v1/calc/electrical/batch`, {
    headers: { 'X-Session-Id': sessionId },
    params: {
      project_id: projectId,
      cable_source: 'builtin',
      variant_number: opts?.variantNumber ?? 1,
      cable_type: opts?.cableType ?? 'self_regulating_tt',
      include_results: true,
      include_errors: true,
      // Prefer UUID when supported; ignored if only legacy path is active.
      electrical_variant_id: electricalVariantId,
    },
  });
  expect(resp.status()).toBe(200);
  return resp;
}

export async function generateSpecification(
  page: Page,
  opts: {
    variantIds: string[];
    excludeUnassignedConfirmed?: boolean;
    options?: Record<string, unknown>;
    catalogSelections?: Record<string, string>;
    inspectBody?: (body: Record<string, unknown>) => void;
  },
) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const body = {
    variant_ids: opts.variantIds,
    options: opts.options ?? CANONICAL_SPECIFICATION_OPTIONS,
    exclude_unassigned_confirmed: opts.excludeUnassignedConfirmed ?? false,
    catalog_selections: opts.catalogSelections ?? {},
  };
  opts.inspectBody?.(body);
  const resp = await page.request.post(
    `${API_BASE}/api/v1/specifications/${projectId}/generate`,
    {
      headers: { 'X-Session-Id': sessionId },
      data: body,
    },
  );
  return resp;
}

export async function getSpecificationForVariant(
  page: Page,
  electricalVariantId: string,
) {
  const { projectId, sessionId } = await currentGuestContext(page);
  return page.request.get(
    `${API_BASE}/api/v1/specifications/${projectId}/variants/${electricalVariantId}`,
    { headers: { 'X-Session-Id': sessionId } },
  );
}

export async function saveManualSpecificationItemsForVariant(
  page: Page,
  electricalVariantId: string,
  items: Array<Record<string, unknown>>,
) {
  const { projectId, sessionId } = await currentGuestContext(page);
  return page.request.put(
    `${API_BASE}/api/v1/specifications/${projectId}/variants/${electricalVariantId}/items`,
    {
      headers: { 'X-Session-Id': sessionId },
      data: { items },
    },
  );
}

export async function reportPreview(
  page: Page,
  electricalVariantIds: string[],
) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const params = new URLSearchParams();
  if (electricalVariantIds.length === 1) {
    params.append('electrical_variant_id', electricalVariantIds[0]);
  } else {
    for (const id of electricalVariantIds) {
      params.append('electrical_variant_ids', id);
    }
  }
  params.append('sections', 'specification');
  params.append('sections', 'objects');
  const resp = await page.request.get(
    `${API_BASE}/api/v1/reports/${projectId}/preview?${params.toString()}`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  return resp;
}

export async function exportProjectCsv(page: Page): Promise<string> {
  const { projectId, sessionId } = await currentGuestContext(page);
  const resp = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/export-csv`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(resp.status()).toBe(200);
  return resp.text();
}

export async function importProjectCsv(
  request: APIRequestContext,
  sessionId: string,
  csv: string,
) {
  const blob = Buffer.from(csv.startsWith('\ufeff') ? csv : `\ufeff${csv}`, 'utf-8');
  return request.post(`${API_BASE}/api/v1/projects/import-csv`, {
    headers: { 'X-Session-Id': sessionId },
    multipart: {
      file: {
        name: 'project.csv',
        mimeType: 'text/csv',
        buffer: blob,
      },
    },
  });
}
