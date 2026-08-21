import { expect, type Page } from '@playwright/test';

export const API_BASE =
  process.env.E2E_API_BASE ??
  (process.env.E2E_BASE_URL?.includes(':3001')
    ? 'http://127.0.0.1:8001'
    : 'http://127.0.0.1:8000');

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

export async function fetchProjectObjects(page: Page) {
  const { projectId, sessionId } = await currentGuestContext(page);
  const response = await page.request.get(`${API_BASE}/api/v1/projects/${projectId}/objects`, {
    headers: { 'X-Session-Id': sessionId },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<Array<{
    id: string;
    object_type: string;
    is_valid: boolean;
    params: Record<string, unknown>;
    results?: Record<string, unknown> | null;
    validation_errors?: Record<string, unknown> | null;
  }>>;
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
          wall_thickness: 0.006,
          pipe_material: 'carbon_steel',
          pipe_length: 50,
          insulation_layers: [
            { thickness: 0.05, material: 'mineral_wool_boards_120' },
          ],
          insulation_temperature_basis: 'outdoor_winter',
          ambient_temperature: -30,
          process_temperature: 80,
          // vapor_temperature не задаём: при steam_tracing=no поле пустое, а
          // диапазон поля в реестре 90…200 — seed на 80 делал форму невалидной
          maintain_temperature: 10,
          winding_pitch: 400,
          number_of_threads: 1,
          placement: 'outdoor',
          wind_speed: 3,
          safety_factor: 1.1,
          ...params,
        },
      },
    },
  );

  expect(response.status()).toBe(201);
  return response.json();
}

export async function createCalculatedTank(
  page: Page,
  name = `E2E резервуар ${Date.now()}`,
  params: Record<string, unknown> = {},
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
          wind_speed: 3,
          safety_factor: 1.1,
          q_additional: 0,
          ...params,
        },
      },
    },
  );

  expect(response.status()).toBe(201);
  const body = await response.json();
  expect(body.is_valid).toBe(true);
  expect(Number(body.results?.total_heat_loss_design)).toBeGreaterThan(0);
  return body;
}
