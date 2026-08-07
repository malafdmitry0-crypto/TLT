import { expect, test } from '@playwright/test';

const API_ORIGIN = process.env.E2E_API_BASE ?? 'http://127.0.0.1:8001';

test('worker readiness is real before background user flows start', async ({ request }) => {
  const response = await request.get(`${API_ORIGIN}/health/ready`);
  const body = await response.json() as {
    status?: string;
    database?: { ready?: boolean };
    redis?: { ready?: boolean };
    worker?: {
      ready?: boolean;
      active_consumers?: number;
      reason?: string | null;
    };
  };

  expect(response.status(), JSON.stringify(body)).toBe(200);
  expect(body).toMatchObject({
    status: 'ready',
    database: { ready: true },
    redis: { ready: true },
    worker: { ready: true },
  });
  expect(body.worker?.active_consumers).toBeGreaterThan(0);
  expect(body.worker?.reason).toBeNull();
});
