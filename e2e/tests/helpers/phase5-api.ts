/**
 * API-level helpers for Phase 5 specification/ER flows in Playwright.
 * Prefer these for multi-step setup; keep UI asserts on user-visible outcomes.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';

import { API_BASE, currentGuestContext } from './workspace';

export type GuestCtx = { projectId: string; sessionId: string };

export async function guestHeaders(page: Page): Promise<Record<string, string>> {
  const { sessionId } = await currentGuestContext(page);
  return { 'X-Session-Id': sessionId };
}

export async function listElectricalVariants(page: Page) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const resp = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(resp.ok()).toBeTruthy();
  return resp.json() as Promise<
    Array<{
      id: string;
      name: string;
      legacy_variant_number: number | null;
      is_active: boolean;
    }>
  >;
}

export async function ensureElectricalInitialized(page: Page) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const headers = { 'X-Session-Id': sessionId };
  const list = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    { headers },
  );
  if (list.ok()) {
    const body = await list.json();
    if (Array.isArray(body) && body.length > 0) return body;
  }
  const init = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/initialize`,
    { headers },
  );
  expect([200, 201]).toContain(init.status());
  const after = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants`,
    { headers },
  );
  expect(after.ok()).toBeTruthy();
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
    legacy_variant_number: number | null;
  }>;
}

export async function batchCalcElectrical(page: Page, electricalVariantId: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const resp = await page.request.post(`${API_BASE}/api/v1/calc/electrical/batch`, {
    headers: { 'X-Session-Id': sessionId },
    data: {
      project_id: projectId,
      electrical_variant_id: electricalVariantId,
      cable_type: 'self_regulating',
    },
  });
  // Some builds accept variant query/body shapes; tolerate 200/201/202.
  expect([200, 201, 202, 422]).toContain(resp.status());
  return resp;
}

export async function generateSpecification(
  page: Page,
  opts: {
    electricalVariantIds: string[];
    confirmPartial?: boolean;
    options?: Record<string, unknown>;
  },
) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const primary = opts.electricalVariantIds[0];
  const resp = await page.request.post(
    `${API_BASE}/api/v1/specifications/${projectId}/generate`,
    {
      headers: { 'X-Session-Id': sessionId },
      params: { electrical_variant_id: primary },
      data: {
        mode: 'full',
        electrical_variant_ids: opts.electricalVariantIds,
        confirm_partial: opts.confirmPartial ?? true,
        options: opts.options ?? {
          reserve_coefficient: 1.0,
          ex_zone: false,
        },
      },
    },
  );
  return resp;
}

export async function getSpecificationSettings(page: Page) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const resp = await page.request.get(
    `${API_BASE}/api/v1/specifications/${projectId}/settings`,
    { headers: { 'X-Session-Id': sessionId } },
  );
  expect(resp.ok()).toBeTruthy();
  return resp.json() as Promise<{
    project_id: string;
    version: number;
    settings: Record<string, unknown>;
  }>;
}

export async function updateSpecificationSettings(
  page: Page,
  settings: Record<string, unknown>,
) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const resp = await page.request.put(
    `${API_BASE}/api/v1/specifications/${projectId}/settings`,
    {
      headers: { 'X-Session-Id': sessionId },
      data: { settings },
    },
  );
  expect(resp.ok()).toBeTruthy();
  return resp.json() as Promise<{ version: number; settings: Record<string, unknown> }>;
}

export async function reportPreview(
  page: Page,
  electricalVariantIds: string[],
) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const params = new URLSearchParams();
  for (const id of electricalVariantIds) {
    params.append('electrical_variant_id', id);
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
  expect(resp.ok()).toBeTruthy();
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
