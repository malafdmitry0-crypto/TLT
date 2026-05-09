/**
 * E2E-сценарии взаимодействия с проектами:
 * - Excel round-trip (сценарий пользователя: импорт samples → экспорт → импорт обратно)
 * - Cross-format CSV (одиночный ↔ пакетный)
 * - Ошибочные файлы
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { ensureTestEmployee, loginAsTestEmployee } from './helpers/employee';

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8000';
const SAMPLE_CSV = path.resolve(__dirname, '../../docs/samples/sample_import.csv');


async function saveDownload(
  p: Promise<import('@playwright/test').Download>
): Promise<string> {
  const dl = await p;
  const tmp = path.join(os.tmpdir(), `tlt-${Date.now()}-${dl.suggestedFilename()}`);
  await dl.saveAs(tmp);
  return tmp;
}

async function createEmployeeProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Новый проект/i }).click();
  await page.getByPlaceholder('Название проекта').fill(name);
  await page.getByRole('button', { name: /^Создать$/ }).click();
  await expect(page.getByText('Проект создан')).toBeVisible();
}

async function getCurrentProjectId(page: Page): Promise<string> {
  const data = await page.evaluate(() => localStorage.getItem('tlt-current-project'));
  expect(data).not.toBeNull();
  return JSON.parse(data!).state.currentProject.id;
}

async function importViaAPI(
  page: Page,
  projectId: string,
  filePath: string,
  mime: string
): Promise<void> {
  const token = await page.evaluate(() => localStorage.getItem('access_token'));
  const sid = await page.evaluate(() => localStorage.getItem('session_id'));
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (sid) headers['X-Session-Id'] = sid;
  const buf = fs.readFileSync(filePath);
  const resp = await page.request.post(
    `${API_BASE}/api/v1/projects/${projectId}/objects/import-excel`,
    {
      headers,
      multipart: { file: { name: path.basename(filePath), mimeType: mime, buffer: buf } },
    }
  );
  expect(resp.ok()).toBeTruthy();
}

test.describe('Проекты: import/export scenarios', () => {
  test.beforeAll(async () => {
    await ensureTestEmployee(API_BASE);
  });


  test('Сотрудник: Excel round-trip (импорт samples → экспорт → импорт в новый проект)', async ({
    page,
  }) => {
    await loginAsTestEmployee(page);
    await createEmployeeProject(page, `XL-src-${Date.now()}`);
    const srcId = await getCurrentProjectId(page);

    // Импортим samples через API
    await importViaAPI(page, srcId, SAMPLE_CSV, 'text/csv');

    // Экспорт объектов в Excel — через API (UI-кнопка тоже работает, но reload после
    // API-импорта ломает auth-hydration — см. `ProtectedRoute` race).
    const token = await page.evaluate(() => localStorage.getItem('access_token'));
    const exp = await page.request.get(
      `${API_BASE}/api/v1/projects/${srcId}/objects/export-excel`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(exp.ok()).toBeTruthy();
    const xlsx = path.join(os.tmpdir(), `xl-${Date.now()}.xlsx`);
    fs.writeFileSync(xlsx, await exp.body());
    expect(fs.statSync(xlsx).size).toBeGreaterThan(1000);

    // Новый проект → импорт этого же xlsx
    await createEmployeeProject(page, `XL-dst-${Date.now()}`);
    const dstId = await getCurrentProjectId(page);
    await importViaAPI(page, dstId, xlsx,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Проверяем через API — объекты восстановились
    const listResp = await page.request.get(
      `${API_BASE}/api/v1/projects/${dstId}/objects`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const list = await listResp.json();
    expect(list.length).toBeGreaterThan(50); // из sample_import.csv — 100
    fs.unlinkSync(xlsx);
  });

  test('Cross-format CSV: скачал одиночный («Скачать» в шапке) → загрузил через «Пакетная загрузка»', async ({
    page,
  }) => {
    await loginAsTestEmployee(page);
    const unique = `Cross-1-${Date.now()}`;
    await createEmployeeProject(page, unique);
    // Даём zustand-store обновиться и UI увидеть currentProject
    await expect(page.getByTitle(unique)).toBeVisible({ timeout: 10_000 });

    const dl = page.waitForEvent('download', { timeout: 15_000 });
    await page.getByRole('button', { name: 'download Скачать' }).click();
    const file = await saveDownload(dl);

    await page.getByRole('button', { name: 'Открыть', exact: true }).click();
    await expect(page).toHaveURL(/\/projects/);
    // filechooser-паттерн: клик по кнопке открывает диалог, перехватываем и подставляем файл
    const fc = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Пакетная загрузка' }).click();
    await (await fc).setFiles(file);
    await expect(page.getByText(/Импортировано проектов:/i)).toBeVisible({ timeout: 15_000 });
    fs.unlinkSync(file);
  });

  test('Cross-format CSV: пакетный экспорт принимается одиночным импортом (через API)', async ({
    page,
  }) => {
    // Тест проверяет cross-format взаимозаменяемость на уровне API.
    // UI-вариант flaky: после download/upload в одном тесте ProjectsPage
    // разделяет file-input'ы между ProjectMenu, single и bulk — порядок локаторов нестабилен.
    await loginAsTestEmployee(page);
    const unique = `Cross-2-${Date.now()}`;
    await createEmployeeProject(page, unique);
    const token = await page.evaluate(() => localStorage.getItem('access_token'));
    const headers = { Authorization: `Bearer ${token}` };

    const list = await (await page.request.get(`${API_BASE}/api/v1/projects`, { headers })).json();
    const proj = list.find((p: { name: string }) => p.name === unique)!;

    const exp = await page.request.get(
      `${API_BASE}/api/v1/projects/export-csv-bulk?ids=${proj.id}`,
      { headers }
    );
    expect(exp.ok()).toBeTruthy();

    const resp = await page.request.post(`${API_BASE}/api/v1/projects/import-csv`, {
      headers,
      multipart: { file: { name: 'bulk.csv', mimeType: 'text/csv', buffer: await exp.body() } },
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body.user_id).toBeTruthy();
  });

  test('Ошибочный CSV → пользователь видит понятное сообщение', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Начать без регистрации/i }).click();
    await expect(page).toHaveURL(/\/workspace/);

    const bogus = path.join(os.tmpdir(), `bogus-${Date.now()}.csv`);
    fs.writeFileSync(bogus, 'not a real export\n');
    const fc = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'upload Загрузить' }).click();
    await (await fc).setFiles(bogus);
    // antd message.error всплывает в notification
    await expect(
      page.getByText(/Отсутствует|отсутствует|metadata|projects/i).first()
    ).toBeVisible({ timeout: 10_000 });
    fs.unlinkSync(bogus);
  });
});
