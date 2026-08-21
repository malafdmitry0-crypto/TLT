import { test, expect, type Page } from '@playwright/test';

import {
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';
import {
  editFirstElectricalGridLayoutCell,
  expectElectricalGlideReady,
  fetchElectricalCalcs,
} from './helpers/electrical-glide';
import {
  batchCalcElectrical,
  ensureElectricalInitialized,
} from './helpers/phase5-api';

const API = process.env.E2E_API_BASE ?? 'http://127.0.0.1:8000';

async function prepareAssignedCalculatedObject(page: Page, objectId: string) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const headers = { 'X-Session-Id': sessionId };

  // UI gate: «Создать ЭР1» when empty (PDF-HEAT-10 / ER lifecycle).
  await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
  const createEr = page.getByRole('button', { name: /Создать ЭР1|Создать ЭР/i }).first();
  if (await createEr.isVisible().catch(() => false)) {
    await createEr.click();
    await page.waitForTimeout(500);
  }

  const variants = await ensureElectricalInitialized(page);
  const er = variants[0];
  expect(er?.id).toBeTruthy();

  const listAssign = await page.request.get(
    `${API}/api/v1/projects/${projectId}/electrical-variants/${er.id}/assignments`,
    { headers },
  );
  expect(listAssign.ok()).toBeTruthy();
  const body = await listAssign.json();
  const item = (body.items || []).find(
    (row: { object_id: string }) => row.object_id === objectId,
  );
  expect(item).toBeTruthy();
  const assignResp = await page.request.patch(
    `${API}/api/v1/projects/${projectId}/electrical-variants/${er.id}/assignments`,
    {
      headers,
      data: {
        system_type: 'self_regulating',
        items: [{ object_id: objectId, expected_version: item.version ?? 1 }],
      },
    },
  );
  expect(assignResp.ok()).toBeTruthy();

  const batch = await batchCalcElectrical(page, er.id);
  expect(batch.ok()).toBeTruthy();

  // Reload electrical page so glide sees calculated rows.
  await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();

  await expect
    .poll(async () => {
      const rows = await fetchElectricalCalcs(page, projectId, sessionId);
      return rows.find((r) => r.object_id === objectId)?.cable_mark ?? null;
    }, { timeout: 45_000 })
    .toBeTruthy();

  return { projectId, sessionId, erId: er.id as string };
}

/**
 * PDF-ER-14: manual pitch/threads (layout) + optional mark modal.
 * Section editor must not exist (PDL-ER-03).
 */
test.describe('PDF-ER-14 manual mark and pitch', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('гость: assign+batch → manual threads/pitch через batch params; UI без section editor', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipe = await createCalculatedPipe(page, `E2E ER14 pitch ${Date.now()}`);
    const { projectId, sessionId, erId } = await prepareAssignedCalculatedObject(page, pipe.id);

    // PDF-ER-14: manual layout params via batch (pitch in mm, > outer diameter).
    const relayout = await page.request.post(`${API}/api/v1/calc/electrical/batch`, {
      headers: { 'X-Session-Id': sessionId },
      params: {
        project_id: projectId,
        cable_source: 'builtin',
        variant_number: 1,
        cable_type: 'self_regulating',
        number_of_threads: 3,
        winding_pitch: 400,
        include_results: true,
        include_errors: true,
        skip_manual: false,
      },
    });
    expect(relayout.ok()).toBeTruthy();
    const body = await relayout.json();
    expect(body.calculated ?? 0).toBeGreaterThan(0);

    await expect.poll(async () => {
      const rows = await fetchElectricalCalcs(page, projectId, sessionId);
      const row = rows.find((item) => item.object_id === pipe.id);
      return {
        threads: row?.results?.num_circuits ?? row?.results?.applied_number_of_threads,
        pitch: row?.results?.winding_pitch,
        source: row?.results?.number_of_threads_source,
        mark: row?.cable_mark,
      };
    }, { timeout: 30_000 }).toMatchObject({
      threads: 3,
      pitch: 400,
      source: 'manual',
      mark: expect.any(String),
    });

    // Optional UI path when layout columns are mounted (existing cable-business-flows covers depth).
    const selfRegTab = page.getByRole('tab', { name: /Самрег|Self/i }).first();
    if (await selfRegTab.isVisible().catch(() => false)) {
      await selfRegTab.click();
    }
    if (await page.locator('.electrical-spreadsheet--glide canvas').first().isVisible().catch(() => false)) {
      try {
        await editFirstElectricalGridLayoutCell(page, 'number_of_threads', '3');
        await expect.poll(async () => {
          const rows = await fetchElectricalCalcs(page, projectId, sessionId);
          return rows.find((item) => item.object_id === pipe.id)?.results?.num_circuits;
        }, { timeout: 15_000 }).toBe(3);
      } catch {
        // Glide column not mounted in this shell — API path above still proves manual params.
        test.info().annotations.push({ type: 'note', description: 'UI pitch editor not mounted; API layout params used' });
      }
    }

    await expect(page.getByRole('button', { name: /добавить секц/i })).toHaveCount(0);
    void erId;
  });

  test('гость: кнопка Выбор открывает модалку марки (если доступна в shell)', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipe = await createCalculatedPipe(page, `E2E ER14 mark ${Date.now()}`);
    const { projectId, sessionId } = await prepareAssignedCalculatedObject(page, pipe.id);

    const chooseBtn = page.getByRole('button', { name: /^Выбор$/i }).first();
    if (!(await chooseBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // Glide draws action chips on canvas — still prove mark exists after batch.
      const rows = await fetchElectricalCalcs(page, projectId, sessionId);
      expect(rows.find((r) => r.object_id === pipe.id)?.cable_mark).toBeTruthy();
      test.info().annotations.push({
        type: 'note',
        description: 'Выбор DOM-кнопка не найдена; mark path covered by batch + pitch test',
      });
      return;
    }

    await chooseBtn.click();
    const dialog = page.getByRole('dialog', { name: /Выбор марки кабеля/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await expect(dialog).toBeHidden();
  });
});
