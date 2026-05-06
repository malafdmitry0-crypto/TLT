import { expect, type Page } from '@playwright/test';

export const API_BASE =
  process.env.E2E_API_BASE ??
  (process.env.E2E_BASE_URL?.includes(':3001')
    ? 'http://localhost:8001'
    : 'http://localhost:8000');

export async function loginAsGuest(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать без регистрации' }).click();
  await expect(page).toHaveURL(/\/workspace\/heat-calc/);
}

export async function currentGuestContext(page: Page): Promise<{
  projectId: string;
  sessionId: string;
}> {
  const sessionId = await page.evaluate(() => localStorage.getItem('session_id'));
  const projectState = await page.evaluate(() =>
    localStorage.getItem('tlt-current-project'),
  );

  expect(sessionId).toBeTruthy();
  expect(projectState).toBeTruthy();

  const projectId = JSON.parse(projectState!).state.currentProject.id as string;
  return { projectId, sessionId: sessionId! };
}

export async function createCalculatedPipe(
  page: Page,
  name = `E2E труба ${Date.now()}`,
  params: Record<string, unknown> = {},
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
          pipe_length: 50,
          insulation_thickness: 0.05,
          insulation_material: 'mineral_wool',
          ambient_temperature: -30,
          process_temperature: 150,
          ...params,
        },
      },
    },
  );

  expect(response.status()).toBe(201);
  return response.json();
}
