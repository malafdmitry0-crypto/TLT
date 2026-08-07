import { expect, test, type Page } from '@playwright/test';

import {
  batchCalcElectrical,
  CANONICAL_SPECIFICATION_OPTIONS,
  ensureElectricalInitialized,
  generateSpecification,
  getSpecificationForVariant,
  updateSpecificationSettings,
} from './helpers/phase5-api';
import {
  API_BASE,
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';

type ReadinessBlocker = {
  source_stage: string;
  scope: string;
  electrical_variant_id: string;
  reason: string;
  count: number;
  object_ids: string[];
  next_action: string;
};

type ReadinessResponse = {
  results: Array<{
    electrical_variant_id: string;
    status: string;
    blockers: ReadinessBlocker[];
  }>;
};

async function getReadiness(page: Page, projectId: string, sessionId: string, erId: string) {
  const response = await page.request.get(
    `${API_BASE}/api/v1/specifications/${projectId}/readiness`,
    {
      headers: { 'X-Session-Id': sessionId },
      params: { variant_ids: erId },
    },
  );
  expect(response.status()).toBe(200);
  return response.json() as Promise<ReadinessResponse>;
}

test.describe('Specification readiness recovery', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('изменение общего лимита агрегирует stale и ведёт точно в затронутую ЭР', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipe = await createCalculatedPipe(
      page,
      `E2E readiness recovery ${Date.now()}`,
      { min_switch_temperature: -30 },
    );
    const { projectId, sessionId } = await currentGuestContext(page);
    const variants = await ensureElectricalInitialized(page);
    const erId = variants[0].id as string;

    const assignmentsResponse = await page.request.get(
      `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${erId}/assignments`,
      { headers: { 'X-Session-Id': sessionId } },
    );
    expect(assignmentsResponse.status()).toBe(200);
    const assignments = await assignmentsResponse.json() as {
      items: Array<{ object_id: string; version: number }>;
    };
    const pipeAssignment = assignments.items.find((item) => item.object_id === pipe.id);
    expect(pipeAssignment).toBeTruthy();
    const assignResponse = await page.request.patch(
      `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${erId}/assignments`,
      {
        headers: { 'X-Session-Id': sessionId },
        data: {
          system_type: 'self_regulating',
          items: [{ object_id: pipe.id, expected_version: pipeAssignment!.version }],
        },
      },
    );
    expect(assignResponse.status()).toBe(200);
    await updateSpecificationSettings(page, CANONICAL_SPECIFICATION_OPTIONS);
    const initialElectricalSettings = await page.request.get(
      `${API_BASE}/api/v1/projects/${projectId}/electrical-settings`,
      { headers: { 'X-Session-Id': sessionId } },
    );
    expect(initialElectricalSettings.status()).toBe(200);
    const initialVersion = (await initialElectricalSettings.json() as { version: number }).version;
    const initialLimitResponse = await page.request.patch(
      `${API_BASE}/api/v1/projects/${projectId}/electrical-settings`,
      {
        headers: { 'X-Session-Id': sessionId },
        data: {
          expected_version: initialVersion,
          max_section_start_current_a: '80',
        },
      },
    );
    expect(initialLimitResponse.status()).toBe(200);
    const batchResponse = await batchCalcElectrical(page, erId);
    expect(await batchResponse.json()).toMatchObject({ calculated: 1, errors: [] });
    const ready = await getReadiness(page, projectId, sessionId, erId);
    expect(ready.results).toHaveLength(1);
    expect(ready.results[0]).toMatchObject({
      electrical_variant_id: erId,
      status: 'ready',
      blockers: [],
    });

    const settingsResponse = await page.request.get(
      `${API_BASE}/api/v1/projects/${projectId}/electrical-settings`,
      { headers: { 'X-Session-Id': sessionId } },
    );
    expect(settingsResponse.status()).toBe(200);
    const settings = await settingsResponse.json() as {
      version: number;
      max_section_start_current_a: string | null;
    };
    const changedLimit = settings.max_section_start_current_a === '4' ? '5' : '4';
    const changedResponse = await page.request.patch(
      `${API_BASE}/api/v1/projects/${projectId}/electrical-settings`,
      {
        headers: { 'X-Session-Id': sessionId },
        data: {
          expected_version: settings.version,
          max_section_start_current_a: changedLimit,
        },
      },
    );
    expect(changedResponse.status()).toBe(200);

    const blocked = await getReadiness(page, projectId, sessionId, erId);
    expect(blocked.results).toHaveLength(1);
    expect(blocked.results[0].status).toBe('blocked');
    expect(blocked.results[0].blockers).toHaveLength(1);
    expect(blocked.results[0].blockers[0]).toMatchObject({
      source_stage: 'electrical',
      scope: 'electrical_variant',
      electrical_variant_id: erId,
      reason: 'project_section_current_limit_changed',
      count: 1,
      object_ids: [pipe.id],
      next_action: 'open_electrical_variant',
    });

    await page.getByRole('menuitem', { name: 'Спецификация' }).click();
    await expect(page).toHaveURL(new RegExp(`/workspace/specification\\?er=${erId}$`));
    await page.getByRole('button', { name: 'Настройки' }).click();

    const dialog = page.getByRole('dialog', {
      name: 'Настройки формирования спецификации',
    });
    await expect(dialog.getByText('ЭР не готова к формированию спецификации')).toBeVisible();
    await expect(dialog.getByText('ЭР1: электрорасчёт не готов к формированию спецификации.'))
      .toBeVisible();
    const recovery = dialog.getByRole('button', { name: 'Пересчитать ЭР' });
    await expect(recovery).toBeEnabled();
    await recovery.click();

    await expect(page).toHaveURL(new RegExp(`/workspace/elec-calc\\?er=${erId}$`));

    const recalculation = await batchCalcElectrical(page, erId);
    expect(await recalculation.json()).toMatchObject({ calculated: 1, errors: [] });
    const recovered = await getReadiness(page, projectId, sessionId, erId);
    expect(recovered.results[0]).toMatchObject({
      electrical_variant_id: erId,
      status: 'ready',
      blockers: [],
    });

    await page.getByRole('menuitem', { name: 'Спецификация' }).click();
    const recoveredDialog = page.locator('.ant-modal:visible');
    if (!await recoveredDialog.isVisible()) {
      await page.getByRole('button', { name: /^Сформировать$/i }).first().click();
    }
    await expect(recoveredDialog).toBeVisible();
    await expect(recoveredDialog.getByRole('button', { name: 'Пересчитать ЭР' })).toHaveCount(0);
    await recoveredDialog.locator('.ant-modal-close').click();

    const preflight = await generateSpecification(page, {
      variantIds: [erId],
      options: CANONICAL_SPECIFICATION_OPTIONS,
    });
    expect(preflight.status()).toBe(409);
    const preflightBody = await preflight.json() as {
      results: Array<{
        status: string;
        candidate_groups: Array<{
          group_key: string;
          selected_catalog_item_id: string | null;
          candidates: Array<{ catalog_item_id: string }>;
        }>;
      }>;
    };
    expect(preflightBody.results[0].status).toBe('selection_required');
    const catalogSelections = Object.fromEntries(
      preflightBody.results[0].candidate_groups
        .filter((group) => group.selected_catalog_item_id === null)
        .map((group) => [group.group_key, group.candidates[0].catalog_item_id]),
    );
    expect(Object.keys(catalogSelections).length).toBeGreaterThan(0);
    const generated = await generateSpecification(page, {
      variantIds: [erId],
      options: CANONICAL_SPECIFICATION_OPTIONS,
      catalogSelections,
    });
    expect(generated.status()).toBe(201);

    const specification = await getSpecificationForVariant(page, erId);
    expect(specification.status()).toBe(200);
    expect(await specification.json()).not.toBeNull();
  });
});
