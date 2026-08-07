import { expect, test } from '@playwright/test';

import {
  CANONICAL_SPECIFICATION_OPTIONS,
  ensureElectricalInitialized,
} from './helpers/phase5-api';
import {
  API_BASE,
  createCalculatedPipe,
  currentGuestContext,
  loginAsGuest,
} from './helpers/workspace';

test.describe('extreme business invariants', () => {
  test('public entry page stays inside a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'HeatCalc' })).toBeVisible();

    const geometry = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      overflowingElements: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -0.5 || rect.right > window.innerWidth + 0.5;
        })
        .map((element) => element.className)
        .filter((className): className is string => typeof className === 'string')
        .slice(0, 10),
    }));

    expect(geometry, JSON.stringify(geometry)).toMatchObject({
      viewportWidth: 390,
      documentWidth: 390,
      overflowingElements: [],
    });
  });

  test('optimistic lock prevents two clients from overwriting one assignment version', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipe = await createCalculatedPipe(page, `E2E assignment race ${Date.now()}`);
    const { projectId, sessionId } = await currentGuestContext(page);
    const [variant] = await ensureElectricalInitialized(page);
    const url = `${API_BASE}/api/v1/projects/${projectId}/electrical-variants/${variant.id}/assignments`;
    const headers = { 'X-Session-Id': sessionId };
    const before = await page.request.get(url, { headers });
    expect(before.status()).toBe(200);
    const row = (await before.json() as {
      items: Array<{ object_id: string; version: number }>;
    }).items.find((item) => item.object_id === pipe.id);
    expect(row).toBeTruthy();

    const [left, right] = await Promise.all([
      page.request.patch(url, {
        headers,
        data: {
          system_type: 'self_regulating',
          items: [{ object_id: pipe.id, expected_version: row!.version }],
        },
      }),
      page.request.patch(url, {
        headers,
        data: {
          system_type: 'resistive',
          items: [{ object_id: pipe.id, expected_version: row!.version }],
        },
      }),
    ]);

    expect([left.status(), right.status()].sort()).toEqual([200, 409]);
    const conflict = left.status() === 409 ? left : right;
    expect(await conflict.json()).toMatchObject({
      detail: { code: 'ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT' },
    });
    const after = await page.request.get(url, { headers });
    const current = (await after.json() as {
      items: Array<{
        object_id: string;
        version: number;
        assignment_state: string;
        system_type: string | null;
      }>;
    }).items.find((item) => item.object_id === pipe.id);
    expect(current).toMatchObject({
      version: row!.version + 1,
      assignment_state: 'stale',
    });
    expect(['self_regulating', 'resistive']).toContain(current!.system_type);
  });

  test('concurrent retries with one idempotency key create one durable workflow', async ({ page }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    await createCalculatedPipe(page, `E2E workflow race ${Date.now()}`);
    const [variant] = await ensureElectricalInitialized(page);
    const url = `${API_BASE}/api/v1/projects/${projectId}/calculation-workflows`;
    const idempotencyKey = `e2e-workflow-race-${Date.now()}`;
    const options = {
      headers: {
        'X-Session-Id': sessionId,
        'Idempotency-Key': idempotencyKey,
      },
      data: {
        variant_ids: [variant.id],
        options: CANONICAL_SPECIFICATION_OPTIONS,
      },
    };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => page.request.post(url, options)),
    );
    const bodies = await Promise.all(responses.map((response) => response.json()));
    const acceptedIndex = responses.findIndex((response) => response.status() === 202);
    expect(acceptedIndex).toBeGreaterThanOrEqual(0);
    const workflowId = bodies[acceptedIndex].id as string;

    const sequentialReplay = await page.request.post(url, options);
    expect(sequentialReplay.status()).toBe(202);
    expect((await sequentialReplay.json()).id).toBe(workflowId);

    const active = await page.request.get(`${url}/active`, {
      headers: { 'X-Session-Id': sessionId },
    });
    expect(active.status()).toBe(200);
    const activeBody = await active.json();
    if (activeBody !== null) {
      expect(activeBody.id).toBe(workflowId);
      await page.request.post(`${API_BASE}${activeBody.cancel_url}`, {
        headers: { 'X-Session-Id': sessionId },
      });
    }

    expect(
      responses.map((response) => response.status()),
      JSON.stringify(bodies),
    ).toEqual([202, 202, 202, 202, 202]);
  });

  test('guest session cannot read or mutate another guest project', async ({ page, browser }) => {
    await loginAsGuest(page);
    const owner = await currentGuestContext(page);
    const pipe = await createCalculatedPipe(page, `E2E isolation owner ${Date.now()}`);

    const foreignContext = await browser.newContext();
    const foreignPage = await foreignContext.newPage();
    try {
      await loginAsGuest(foreignPage);
      const foreign = await currentGuestContext(foreignPage);
      expect(foreign.projectId).not.toBe(owner.projectId);
      expect(foreign.sessionId).not.toBe(owner.sessionId);
      const objectsUrl = `${API_BASE}/api/v1/projects/${owner.projectId}/objects`;
      const objectUrl = `${objectsUrl}/${pipe.id}`;

      const read = await foreignPage.request.get(objectsUrl, {
        headers: { 'X-Session-Id': foreign.sessionId },
      });
      expect([403, 404]).toContain(read.status());
      const mutation = await foreignPage.request.put(objectUrl, {
        headers: { 'X-Session-Id': foreign.sessionId },
        data: {
          version: pipe.version,
          params: { ...pipe.params, name: 'FOREIGN-WRITE-MUST-NOT-PERSIST' },
        },
      });
      expect([403, 404]).toContain(mutation.status());

      const ownerRead = await page.request.get(objectsUrl, {
        headers: { 'X-Session-Id': owner.sessionId },
      });
      expect(ownerRead.status()).toBe(200);
      const ownerObjects = await ownerRead.json() as Array<{ id: string; params: { name?: string } }>;
      expect(ownerObjects.find((item) => item.id === pipe.id)?.params.name)
        .not.toBe('FOREIGN-WRITE-MUST-NOT-PERSIST');
    } finally {
      await foreignContext.close();
    }
  });
});
