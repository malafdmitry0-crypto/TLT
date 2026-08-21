/**
 * Загрузка объектов теплопотерь из Excel/CSV — кейс 1 §5.5.
 *
 * Проверяет полный путь: шаблон → загрузка → объекты созданы и рассчитаны →
 * показано количество загруженных; отдельно — отбраковка строк с неверными
 * типами данных.
 *
 * История: US-HEAT-06 в docs/tnp/cases/heat-user-stories.md.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { fetchProjectObjects, loginAsGuest } from './helpers/workspace';

async function downloadCsvTemplate(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать шаблон CSV' }).click();
  const download = await downloadPromise;
  const file = path.join(os.tmpdir(), `tlt-heat-import-${Date.now()}.csv`);
  await download.saveAs(file);
  return file;
}

async function uploadImportFile(page: Page, file: string) {
  await page.locator('input.import-excel-file-input').setInputFiles(file);
}

/**
 * Средняя «краснота» строки нормального Glide-грида: фон ошибочной строки
 * #fff1f0, обычной — белый. Сэмплим несколько точек по ширине.
 */
async function rowRedScores(page: Page, rowIndex: number) {
  const canvas = page.locator('.calc-spreadsheet--normal-glide canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  return canvas.evaluate((node, targetRowIndex) => {
    const canvasNode = node as HTMLCanvasElement;
    const context = canvasNode.getContext('2d');
    if (!context) return [];
    const rect = canvasNode.getBoundingClientRect();
    const scaleX = canvasNode.width / rect.width;
    const scaleY = canvasNode.height / rect.height;
    const y = Math.round((38 + 30 * targetRowIndex + 15) * scaleY);
    return [0.45, 0.6, 0.75].map((ratio) => {
      const x = Math.round(rect.width * ratio * scaleX);
      const data = context.getImageData(Math.max(0, x - 4), Math.max(0, y - 4), 9, 9).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let index = 0; index < data.length; index += 4) {
        red += data[index];
        green += data[index + 1];
        blue += data[index + 2];
      }
      const count = data.length / 4;
      return Math.min(red - green, red - blue) / count;
    });
  }, rowIndex);
}

test.describe('§5.5 загрузка объектов теплопотерь из файла', () => {
  test('шаблон CSV загружается обратно: объекты созданы, рассчитаны и посчитаны', async ({ page }) => {
    await loginAsGuest(page);
    const template = await downloadCsvTemplate(page);
    // в шаблоне лежат примеры труб и резервуаров — считаем их по первой колонке
    const dataRows = fs.readFileSync(template, 'utf-8')
      .replace(/^﻿/, '')
      .split('\n')
      .slice(1)
      .filter((line) => line.trim().length > 0);
    const pipeRows = dataRows.filter((line) => line.startsWith('труба')).length;
    const tankRows = dataRows.filter((line) => line.startsWith('резервуар')).length;
    expect(pipeRows).toBeGreaterThan(0);
    expect(tankRows).toBeGreaterThan(0);

    await uploadImportFile(page, template);

    // §5.5: показано количество успешно загруженных объектов
    const resultDialog = page.getByRole('dialog', { name: 'Результат импорта' });
    await expect(resultDialog).toBeVisible({ timeout: 20_000 });
    await expect(resultDialog.locator('.import-excel-created')).toHaveText(String(dataRows.length));
    await expect(resultDialog).toContainText('Все строки импортированы без ошибок');
    await resultDialog.getByRole('button', { name: 'OK' }).click();

    // §5.5: по каждой корректной строке создан объект
    await expect.poll(async () => (await fetchProjectObjects(page)).length, { timeout: 30_000 })
      .toBe(dataRows.length);

    const objects = await fetchProjectObjects(page);
    expect(objects.filter((item) => item.object_type === 'pipe')).toHaveLength(pipeRows);
    expect(objects.filter((item) => item.object_type === 'tank')).toHaveLength(tankRows);
    // §5.5: теплопотери рассчитаны фоновой задачей по всем строкам шаблона
    await expect.poll(async () => {
      const rows = await fetchProjectObjects(page);
      return rows.filter((item) => item.is_valid && item.results != null).length;
    }, { timeout: 60_000 }).toBe(dataRows.length);
    for (const object of await fetchProjectObjects(page)) {
      expect(Number(object.results?.total_heat_loss_design)).toBeGreaterThan(0);
    }

    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await expect(typeToolbar.getByRole('button', { name: new RegExp(`Все:\\s*${dataRows.length}`) }))
      .toBeVisible();
    fs.unlinkSync(template);
  });

  test('резервуары из штатного шаблона рассчитываются: в шаблоне есть скорость ветра', async ({ page }) => {
    await loginAsGuest(page);
    const template = await downloadCsvTemplate(page);
    // без колонки «Скорость ветра» размещение outdoor не считается — раньше
    // все три примера бака приходили с is_valid=false
    const header = fs.readFileSync(template, 'utf-8').replace(/^﻿/, '').split('\n')[0];
    expect(header.split(';')).toContain('Скорость ветра, м/с');

    await uploadImportFile(page, template);
    await page.getByRole('dialog', { name: 'Результат импорта' })
      .getByRole('button', { name: 'OK' })
      .click();

    await expect.poll(async () => {
      const tanks = (await fetchProjectObjects(page)).filter((item) => item.object_type === 'tank');
      return tanks.length > 0 && tanks.every((item) => item.is_valid && item.results != null);
    }, { timeout: 60_000 }).toBe(true);

    const tanks = (await fetchProjectObjects(page)).filter((item) => item.object_type === 'tank');
    // цилиндр, параллелепипед и шар — все формы из шаблона
    expect(tanks.length).toBeGreaterThanOrEqual(3);
    for (const tank of tanks) {
      expect(tank.validation_errors).toBeFalsy();
      expect(Number(tank.results?.total_heat_loss_design)).toBeGreaterThan(0);
    }
    fs.unlinkSync(template);
  });

  test('§5.13 нерассчитанный объект подсвечен в таблице и блокирует переход к электрорасчёту', async ({ page }) => {
    await loginAsGuest(page);
    const template = await downloadCsvTemplate(page);
    const lines = fs.readFileSync(template, 'utf-8').replace(/^﻿/, '').trim().split('\n');
    const header = lines[0];
    const windColumn = header.split(';').indexOf('Скорость ветра, м/с');
    const pipeRow = lines.find((line) => line.startsWith('труба'))!;
    // резервуар на улице без скорости ветра импортируется, но не считается —
    // так получаем строку со статусом «ошибка» в таблице
    const tankRow = lines.find((line) => line.startsWith('резервуар'))!
      .split(';')
      .map((cell, index) => (index === windColumn ? '' : cell))
      .join(';');
    const mixed = path.join(os.tmpdir(), `tlt-heat-import-mixed-${Date.now()}.csv`);
    fs.writeFileSync(mixed, `﻿${header}\n${pipeRow}\n${tankRow}\n`, 'utf-8');

    await uploadImportFile(page, mixed);
    await page.getByRole('dialog', { name: 'Результат импорта' })
      .getByRole('button', { name: 'OK' })
      .click();
    await expect.poll(async () => {
      const objects = await fetchProjectObjects(page);
      return objects.length === 2 && objects.filter((item) => !item.is_valid).length === 1;
    }, { timeout: 60_000 }).toBe(true);

    await page.reload({ waitUntil: 'networkidle' });
    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await typeToolbar.getByRole('button', { name: /Все:/ }).click();

    // §5.13: проблемная строка подсвечена — фон #fff1f0 против белого у рассчитанной
    await expect.poll(async () => {
      const scores = await rowRedScores(page, 1);
      return scores.length > 0 && scores.every((score) => score > 3);
    }, { timeout: 20_000 }).toBe(true);
    const calculatedRow = await rowRedScores(page, 0);
    expect(calculatedRow.every((score) => score < 3)).toBe(true);

    // §5.13: переход не выполняется, показана причина, остаёмся на теплопотерях
    await page.getByTestId('heat-continue-to-electrical').click();
    await expect(page.locator('.ant-message-error'))
      .toContainText('Нельзя перейти: объектов с ошибками — 1');
    await expect(page).toHaveURL(/\/workspace\/heat-calc/);

    fs.unlinkSync(template);
    fs.unlinkSync(mixed);
  });

  test('строка с неверным типом данных отбраковывается, остальные загружаются', async ({ page }) => {
    await loginAsGuest(page);
    const template = await downloadCsvTemplate(page);
    const lines = fs.readFileSync(template, 'utf-8').replace(/^﻿/, '').trim().split('\n');
    const [header, firstRow] = lines;
    // §5.5: проверяются типы данных — вместо диаметра текст
    const brokenRow = firstRow.split(';').map((cell, index) => (
      index === 1 ? 'Битая труба' : index === 3 ? 'сто восемь' : cell
    )).join(';');
    const broken = path.join(os.tmpdir(), `tlt-heat-import-broken-${Date.now()}.csv`);
    fs.writeFileSync(broken, `﻿${header}\n${firstRow}\n${brokenRow}\n`, 'utf-8');

    await uploadImportFile(page, broken);

    const resultDialog = page.getByRole('dialog', { name: 'Результат импорта' });
    await expect(resultDialog).toBeVisible({ timeout: 20_000 });
    await expect(resultDialog.locator('.import-excel-created')).toHaveText('1');
    await expect(resultDialog).toContainText('Пропущено строк:');
    await expect(resultDialog.locator('.import-excel-error-row')).toHaveCount(1);
    await resultDialog.getByRole('button', { name: 'OK' }).click();

    await expect.poll(async () => (await fetchProjectObjects(page)).length, { timeout: 30_000 })
      .toBe(1);
    const [created] = await fetchProjectObjects(page);
    expect(created.params.name).not.toBe('Битая труба');

    fs.unlinkSync(template);
    fs.unlinkSync(broken);
  });
});
