import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import { ensureTestEmployee, loginAsTestEmployee } from './helpers/employee';

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:8000';

test.beforeAll(async () => {
  await ensureTestEmployee(API_BASE);
});

async function saveDownload(
  downloadPromise: Promise<import('@playwright/test').Download>
): Promise<string> {
  const download = await downloadPromise;
  const tmp = path.join(os.tmpdir(), `tlt-e2e-${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(tmp);
  return tmp;
}

test.describe('CSV-обмен проектами (US-02.6, US-02.7, US-02.8)', () => {
  test('пользователь скачивает авто-проект в CSV', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Начать без регистрации/i }).click();
    await expect(page).toHaveURL(/\/workspace/);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Скачать/i }).click();
    const file = await saveDownload(downloadPromise);
    const content = fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '');
    expect(content).toContain('[SECTION];metadata');
    expect(content).toContain('[SECTION];objects');
    fs.unlinkSync(file);
  });

  test('пользователь импортирует CSV — авто-проект замещается', async ({ page }) => {
    // Шаг 1: сначала скачиваем CSV авто-проекта
    await page.goto('/');
    await page.getByRole('button', { name: /Начать без регистрации/i }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Скачать/i }).click();
    const file = await saveDownload(downloadPromise);

    // Шаг 2: загружаем его обратно — проект должен замеситься
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(file);
    await expect(page.getByText(/Импортирован проект/i)).toBeVisible({ timeout: 10_000 });
    fs.unlinkSync(file);
  });

  test('round-trip: импорт Excel → экспорт CSV → новый гость импортирует CSV', async ({ page, request }) => {
    // Шаг 1: пользователь добавляет объекты через Excel-импорт (реальный юзер-сценарий)
    await page.goto('/');
    await page.getByRole('button', { name: /Начать без регистрации/i }).click();
    await expect(page).toHaveURL(/\/workspace/);

    // Импорт сэмпла через API текущей сессии — ProjectMenu не имеет кнопки «Excel-импорт»
    // (она на HeatCalcPage), поэтому используем API
    const sessionId = await page.evaluate(() => localStorage.getItem('session_id'));
    const project = await (await request.get('http://localhost:8000/api/v1/projects', {
      headers: { 'X-Session-Id': sessionId! },
    })).json();
    const samplePath = path.resolve(__dirname, '../../docs/samples/sample_import.csv');
    const sampleBuf = fs.readFileSync(samplePath);
    const imp = await request.post(
      `http://localhost:8000/api/v1/projects/${project[0].id}/objects/import-excel`,
      {
        headers: { 'X-Session-Id': sessionId! },
        multipart: { file: { name: 'sample_import.csv', mimeType: 'text/csv', buffer: sampleBuf } },
      }
    );
    expect(imp.ok()).toBeTruthy();

    // Шаг 2: пользователь скачивает проект в CSV (без reload — auth-hydration race)
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Скачать/i }).click();
    const csvFile = await saveDownload(downloadPromise);
    // Убеждаемся что файл содержит JSON с запятыми (ранее ломало sniffer)
    const content = fs.readFileSync(csvFile, 'utf-8');
    expect(content).toContain(',');

    // Шаг 3: новый пользователь импортирует этот CSV → проект должен создаться
    await page.getByRole('button', { name: 'Выход' }).click();
    await page.getByRole('button', { name: /Начать без регистрации/i }).click();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(csvFile);
    await expect(page.getByText(/Импортирован проект/i)).toBeVisible({ timeout: 15_000 });
    fs.unlinkSync(csvFile);
  });

  test('сотруднику в ProjectsPage доступны пакетный экспорт и загрузка', async ({ page }) => {
    await loginAsTestEmployee(page);
    await page.getByRole('menuitem', { name: /Проекты/i }).click();
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByRole('button', { name: /Экспорт/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Пакетная загрузка/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Загрузить CSV' })).toBeVisible();
  });

  test('пакетный экспорт скачивает CSV со всеми проектами', async ({ page }) => {
    await loginAsTestEmployee(page);
    const unique = `Bulk-${Date.now()}`;
    await page.getByRole('button', { name: /Новый проект/i }).click();
    await page.getByPlaceholder('Название проекта').fill(unique);
    await page.getByRole('button', { name: 'Создать' }).click();
    await expect(page.getByText('Проект создан')).toBeVisible();

    await page.getByRole('menuitem', { name: /Проекты/i }).click();
    await expect(page).toHaveURL(/\/projects/);
    // Ждём пока проект появится в ячейке таблицы (не просто в header)
    await expect(page.getByRole('cell', { name: unique })).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await page.getByRole('button', { name: /Экспорт/i }).click();
    const file = await saveDownload(downloadPromise);
    const content = fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '');
    expect(content).toContain('[SECTION];projects');
    fs.unlinkSync(file);
  });

  test('гостю пакетные кнопки в ProjectsPage недоступны', async ({ page }) => {
    // Гость не может зайти на /projects — route employee-only, редиректит
    await page.goto('/');
    await page.getByRole('button', { name: /Начать без регистрации/i }).click();
    await page.goto('/projects');
    // Либо редирект, либо рендер без employee-кнопок
    await expect(page.getByRole('button', { name: /Пакетная загрузка/i })).toHaveCount(0);
  });
});
