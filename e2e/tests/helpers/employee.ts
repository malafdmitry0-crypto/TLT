import { request, type Page, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@heatcalc.io';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin';

// Используем сид-сотрудника (создаётся `python -m app.seeds`).
// Если в окружении сидов нет — helper пробует создать через admin API.
export const TEST_EMPLOYEE_EMAIL =
  process.env.E2E_EMPLOYEE_EMAIL ?? 'petrov@heatcalc.io';
export const TEST_EMPLOYEE_PASSWORD =
  process.env.E2E_EMPLOYEE_PASSWORD ?? 'Employee1!';

/**
 * Убеждается что тестовый сотрудник существует. Идемпотентно.
 * При наличии сидов ничего не делает; без них — создаёт через admin API.
 */
export async function ensureTestEmployee(apiBase: string): Promise<void> {
  const api = await request.newContext({ baseURL: apiBase });
  try {
    const probe = await api.post('/api/v1/auth/login', {
      data: { email: TEST_EMPLOYEE_EMAIL, password: TEST_EMPLOYEE_PASSWORD },
    });
    if (probe.ok()) return; // сид-сотрудник уже существует
    const adminLogin = await api.post('/api/v1/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (!adminLogin.ok()) return; // нет админа — прерываемся молча (тесты упадут с внятной ошибкой)
    const { access_token } = await adminLogin.json();
    await api.post('/api/v1/admin/users', {
      headers: { Authorization: `Bearer ${access_token}` },
      data: {
        email: TEST_EMPLOYEE_EMAIL,
        password: TEST_EMPLOYEE_PASSWORD,
        full_name: 'E2E Employee',
        role: 'employee',
      },
    });
  } finally {
    await api.dispose();
  }
}

export async function loginAsTestEmployee(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_EMPLOYEE_EMAIL);
  await page.getByLabel('Пароль').fill(TEST_EMPLOYEE_PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/workspace/);
}
