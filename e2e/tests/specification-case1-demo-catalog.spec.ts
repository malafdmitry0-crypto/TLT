import { expect, test, type Page } from '@playwright/test';

import {
  API_BASE,
  createCalculatedPipe,
  createCalculatedTank,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';
import {
  batchCalcElectrical,
  ensureElectricalInitialized,
  getSpecificationForVariant,
} from './helpers/phase5-api';

type ElectricalVariant = { id: string };
type PreparedObject = {
  id: string;
  electricalOverrides?: Record<string, unknown>;
};

async function prepareReadyElectricalVariant(
  page: Page,
  objects: PreparedObject[],
): Promise<ElectricalVariant> {
  const { projectId, sessionId } = await currentGuestContext(page);
  const headers = { 'X-Session-Id': sessionId };

  await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
  const createVariant = page.getByRole('button', { name: /Создать ЭР1|Создать ЭР/i }).first();
  if (await createVariant.isVisible().catch(() => false)) {
    await createVariant.click();
  }

  const electricalSettings = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-settings`,
    { headers },
  );
  expect(electricalSettings.ok()).toBeTruthy();
  const electricalSettingsBody = await electricalSettings.json() as { version: number };
  const updateElectricalSettings = await page.request.patch(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-settings`,
    {
      headers,
      data: {
        expected_version: electricalSettingsBody.version,
        max_section_start_current_a: 80,
      },
    },
  );
  expect(updateElectricalSettings.ok()).toBeTruthy();

  const variants = await ensureElectricalInitialized(page) as ElectricalVariant[];
  const variant = variants[0];
  if (!variant?.id) throw new Error('ЭР1 не создан');

  const assignments = await page.request.get(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variant.id}/assignments`,
    { headers },
  );
  expect(assignments.ok()).toBeTruthy();
  const assignmentRows = (await assignments.json()).items as Array<{
    object_id: string;
    version: number;
  }>;
  const assignedItems = objects.map((object) => {
    const assignment = assignmentRows.find((row) => row.object_id === object.id);
    expect(assignment, `assignment for ${object.id}`).toBeTruthy();
    return { object_id: object.id, expected_version: assignment!.version };
  });

  const assign = await page.request.patch(
    `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variant.id}/assignments`,
    {
      headers,
      data: {
        system_type: 'self_regulating',
        items: assignedItems,
      },
    },
  );
  expect(assign.ok()).toBeTruthy();

  for (const object of objects) {
    if (!object.electricalOverrides) continue;
    const currentAssignments = await page.request.get(
      `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variant.id}/assignments`,
      { headers },
    );
    expect(currentAssignments.ok()).toBeTruthy();
    const currentRow = ((await currentAssignments.json()).items as Array<{
      object_id: string;
      version: number;
    }>).find((row) => row.object_id === object.id);
    expect(currentRow, `current assignment for ${object.id}`).toBeTruthy();
    const override = await page.request.patch(
      `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variant.id}`
        + `/assignments/${object.id}/electrical-overrides`,
      {
        headers,
        data: { expected_version: currentRow!.version, ...object.electricalOverrides },
      },
    );
    expect(override.ok()).toBeTruthy();
  }

  const calculation = await batchCalcElectrical(page, variant.id);
  expect(calculation.ok()).toBeTruthy();
  const calculationBody = await calculation.json() as { calculated?: number; errors?: unknown[] };
  expect(calculationBody.errors ?? []).toHaveLength(0);
  expect(calculationBody.calculated ?? 0).toBeGreaterThanOrEqual(objects.length);

  return variant;
}

async function selectRequiredSetting(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await expect(dropdown).toBeVisible();
  await dropdown.getByText(option, { exact: true }).click();
}

test.describe('Case 1 demo catalog: desktop specification', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('цилиндр и параллелепипед проходят Heat → Electrical → Specification', async ({ page }) => {
    await loginAsGuest(page);
    const pipe = await createCalculatedPipe(page, `E2E Case1 demo catalog ${Date.now()}`, {
      min_switch_temperature: -30,
    });
    const cylinder = await createCalculatedTank(page, `E2E Case1 cylinder ${Date.now()}`, {
      min_switch_temperature: -20,
      insulation_layers: [
        { thickness: 0.15, material: 'mineral_wool_boards_120' },
      ],
    });
    const rectangular = await createCalculatedTank(page, `E2E Case1 rectangular ${Date.now()}`, {
      shape: 'rectangular',
      diameter: null,
      length: 4,
      width: 2,
      height: 3,
      min_switch_temperature: -20,
      insulation_layers: [
        { thickness: 0.15, material: 'mineral_wool_boards_120' },
      ],
    });
    const variant = await prepareReadyElectricalVariant(page, [
      { id: pipe.id as string },
      {
        id: cylinder.id as string,
        electricalOverrides: {
          tank_heating_height_m: 2.4,
          tank_laying_step_m: 0.2,
        },
      },
      {
        id: rectangular.id as string,
        electricalOverrides: {
          tank_heating_height_m: 1.8,
          tank_laying_step_m: 0.3,
        },
      },
    ]);

    await page.getByRole('menuitem', { name: 'Спецификация' }).click();
    await page.getByRole('button', { name: /^Сформировать$/i }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Настройки формирования спецификации' });
    await expect(dialog).toBeVisible();

    await selectRequiredSetting(page, 'Режим группировки спецификации', 'Раздельно по типу объекта');
    for (const label of ['Параметр Ex', 'Параметр К1i', 'Параметр К2i', 'Параметр Кiu']) {
      await selectRequiredSetting(page, label, 'Нет');
    }
    await dialog.getByRole('spinbutton', { name: 'Параметр L К2i' }).fill('0');
    await dialog.getByRole('spinbutton', { name: 'Параметр R гр' }).fill('1');
    await expect(dialog.getByText('Заполните обязательные параметры')).toHaveCount(0);

    await dialog.getByRole('button', { name: /^Сформировать$/i }).click();
    const candidateSelection = dialog.getByTestId('spec-candidate-selection');
    await expect(candidateSelection).toBeVisible({ timeout: 30_000 });
    const candidateGroups = candidateSelection.getByRole('group');
    const candidateGroupCount = await candidateGroups.count();
    expect(candidateGroupCount).toBeGreaterThan(0);
    for (let index = 0; index < candidateGroupCount; index += 1) {
      const candidates = candidateGroups.nth(index);
      await expect(candidates).toBeVisible();
      await candidates.getByRole('button').first().click();
    }
    await candidateSelection.getByRole('button', {
      name: 'Применить выбор и сформировать',
    }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText('SPEC_BOX_EX_RGR_MATRIX_MISSING')).toHaveCount(0);

    const specification = await getSpecificationForVariant(page, variant.id);
    expect(specification.status()).toBe(200);
    const body = await specification.json() as {
      items: Array<Record<string, unknown>>;
      snapshot: {
        catalog?: Record<string, unknown>;
        normalized_inputs?: {
          objects?: Array<{ object_id?: string; object_type_section?: string }>;
        };
      } | null;
      generation_diagnostics?: Array<{ code?: string }>;
    };
    expect(body.items.length).toBeGreaterThan(0);
    const normalizedObjects = body.snapshot?.normalized_inputs?.objects ?? [];
    expect(normalizedObjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        object_id: cylinder.id,
        object_type_section: 'tank',
      }),
      expect.objectContaining({
        object_id: rectangular.id,
        object_type_section: 'tank',
      }),
    ]));
    const nomenclatureCodes = body.items.map((item) => String(
      item.article ?? item.nomenclature_code ?? '',
    ));
    expect(nomenclatureCodes).toContain('DEMO-FIBERGLASS-LKV-12');
    expect(nomenclatureCodes.some((code) => code.startsWith('DEMO-'))).toBe(true);
    expect(body.generation_diagnostics ?? []).not.toContainEqual(
      expect.objectContaining({ code: 'SPEC_BOX_EX_RGR_MATRIX_MISSING' }),
    );
    expect(body.snapshot?.catalog).toMatchObject({
      catalog_key: 'builtin-specification',
      version: 'case1-demo-v1',
      schema_version: 2,
    });
  });
});
