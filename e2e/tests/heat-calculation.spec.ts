import { test, expect } from '@playwright/test';

import { createCalculatedPipe, currentGuestContext, fetchProjectObjects, loginAsGuest } from './helpers/workspace';
import {
  expectElectricalGlideReady,
  fetchElectricalCalcs,
} from './helpers/electrical-glide';

test.describe('4.3 Расчёт тепловых потерь', () => {
  test('пустой проект показывает рабочий экран теплопотерь и блокирует электрорасчёт', async ({
    page,
  }) => {
    await loginAsGuest(page);

    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    const formActionsToolbar = page.getByRole('toolbar', { name: 'Действия блока заполнения' });
    const tableActionsToolbar = page.getByRole('toolbar', { name: 'Действия таблицы объектов' });
    const paramsBlock = page.locator('.inline-form-shell[aria-label="Блок заполнения параметров"]');
    const visibilityToggle = typeToolbar.getByRole('checkbox', { name: 'Показать блок заполнения параметров' });
    await expect(typeToolbar).toBeVisible();
    await expect(typeToolbar.getByRole('button', { name: /Трубопровод:/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(typeToolbar.getByRole('button', { name: /Резервуар:/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(typeToolbar.getByRole('button', { name: /Все:/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(typeToolbar.getByText('Режим: добавление')).toBeVisible();
    await expect(visibilityToggle).toBeChecked();
    await expect(paramsBlock).toBeVisible();
    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(page.getByText('ГЕОМЕТРИЯ ТРУБЫ')).toBeVisible();
    await expect(formActionsToolbar).toBeVisible();
    await expect(tableActionsToolbar).toBeVisible();
    await expect(formActionsToolbar.getByRole('button', { name: 'Добавить' })).toBeVisible();
    await expect(formActionsToolbar.getByRole('button', { name: 'Сохранить' })).toBeVisible();
    await expect(formActionsToolbar.getByRole('button', { name: 'Удалить выбранные' })).toBeDisabled();
    await expect(tableActionsToolbar.getByRole('button', { name: 'Настройки отображения' })).toBeVisible();
    await expect(tableActionsToolbar.getByRole('button', { name: 'Добавить копии выбранных' })).toBeDisabled();
    await expect(tableActionsToolbar.getByRole('button', { name: 'Импорт XLSX/CSV' })).toBeVisible();
    await expect(tableActionsToolbar.getByRole('button', { name: 'Трубопровод' })).toHaveCount(0);
    await expect(tableActionsToolbar.getByRole('button', { name: 'Резервуар' })).toHaveCount(0);
    await expect(tableActionsToolbar.getByRole('checkbox', { name: 'Показать блок заполнения параметров' })).toHaveCount(0);
    await expect(tableActionsToolbar.getByText(/Все рассчитаны/)).toHaveCount(0);
    const toolbarsOrdered = await page.evaluate(() => {
      const top = document.querySelector('[aria-label="Тип объекта и блок параметров"]');
      const params = document.querySelector('[aria-label="Блок заполнения параметров"]');
      const formActions = document.querySelector('[aria-label="Действия блока заполнения"]');
      const tableActions = document.querySelector('[aria-label="Действия таблицы объектов"]');
      return Boolean(
        top &&
          params &&
          formActions &&
          tableActions &&
          formActions.parentElement === tableActions.parentElement &&
          formActions.parentElement?.classList.contains('actionbar-actions-row') &&
          top.compareDocumentPosition(params) & Node.DOCUMENT_POSITION_FOLLOWING &&
          params.compareDocumentPosition(formActions) & Node.DOCUMENT_POSITION_FOLLOWING &&
          formActions.compareDocumentPosition(tableActions) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(toolbarsOrdered).toBe(true);

    await visibilityToggle.uncheck();
    await expect(paramsBlock).toBeHidden();
    await expect(formActionsToolbar).toHaveCount(0);
    await expect(typeToolbar.getByText(/Режим:/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toHaveCount(0);
    await expect(typeToolbar.getByText(/Режим:/)).toHaveCount(0);
    await expect(paramsBlock).toBeHidden();
    await visibilityToggle.check();
    await expect(paramsBlock).toBeVisible();
    await expect(formActionsToolbar).toBeVisible();
    await expect(typeToolbar.getByText('Режим: добавление')).toBeVisible();
    await expect(page.getByTestId('object-name-input')).toHaveValue('');
    await expect(formActionsToolbar.getByRole('button', { name: 'Добавить' })).toBeVisible();
    await expect(page.getByText(/Трубопроводы не добавлены/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Электрорасчёт/i })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /Электротехнический расчёт/i })).toBeVisible();
  });

  test('скрытый боковой блок параметров не оставляет пустую правую область', async ({ page }) => {
    await loginAsGuest(page);
    await page.evaluate(() => {
      localStorage.setItem('heatcalc.tableView.v1.guest', JSON.stringify({
        version: 1,
        fontSize: 'standard',
        tableLabelFormat: 'short',
        settingsLabelFormat: 'full',
        inlineEditingEnabled: false,
        formPlacement: 'right',
        sideFormWidthPct: 34,
        formSectionWeights: [1.655, 1.35, 1.2],
      }));
    });
    await page.reload({ waitUntil: 'networkidle' });

    const layout = page.locator('.heatcalc-workspace-layout--right');
    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    const visibilityToggle = typeToolbar.getByRole('checkbox', { name: 'Показать блок заполнения параметров' });
    await expect(layout).toBeVisible();
    await expect(visibilityToggle).toBeChecked();

    await visibilityToggle.uncheck();
    await expect(visibilityToggle).not.toBeChecked();
    await expect(page.locator('.inline-form-shell[aria-label="Блок заполнения параметров"]')).toBeHidden();
    const proof = await page.evaluate(() => {
      const layout = document.querySelector<HTMLElement>('.heatcalc-workspace-layout--right');
      const tablePane = document.querySelector<HTMLElement>('.heatcalc-workspace-layout--right .heatcalc-table-pane');
      const formPane = document.querySelector<HTMLElement>('.heatcalc-workspace-layout--right .heatcalc-form-pane');
      const resizeHandle = document.querySelectorAll('.heatcalc-workspace-layout--right .heatcalc-side-resize-handle');
      const checkbox = document.querySelector<HTMLElement>('.actionbar-form-toggle .ant-checkbox');
      if (!layout || !tablePane || !formPane) {
        return {
          checkboxClassChecked: true,
          formDisplay: '',
          formWidth: -1,
          tableWidthRatio: 0,
          tableRightGap: -1,
          resizeHandleCount: resizeHandle.length,
          noHorizontalScroll: false,
        };
      }
      const layoutRect = layout.getBoundingClientRect();
      const tableRect = tablePane.getBoundingClientRect();
      const formRect = formPane.getBoundingClientRect();
      return {
        checkboxClassChecked: checkbox?.classList.contains('ant-checkbox-checked') ?? true,
        formDisplay: getComputedStyle(formPane).display,
        formWidth: Math.round(formRect.width),
        tableWidthRatio: tableRect.width / layoutRect.width,
        tableRightGap: Math.abs(layoutRect.right - tableRect.right),
        resizeHandleCount: resizeHandle.length,
        noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    });
    expect(proof.checkboxClassChecked).toBe(false);
    expect(proof.formDisplay).toBe('none');
    expect(proof.formWidth).toBe(0);
    expect(proof.tableWidthRatio).toBeGreaterThan(0.98);
    expect(proof.tableRightGap).toBeLessThan(2);
    expect(proof.resizeHandleCount).toBe(0);
    expect(proof.noHorizontalScroll).toBe(true);
    await page.screenshot({
      path: 'test-results/heat-form-hidden-side-after.png',
      fullPage: false,
    });
  });

  test('кнопка «Добавить» открывает inline-форму активного типа', async ({
    page,
  }) => {
    await loginAsGuest(page);

    await expect(page.locator('.inline-object-form')).toBeVisible();
    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await expect(typeToolbar.getByRole('button', { name: /Трубопровод:/ })).toBeVisible();
    await expect(typeToolbar.getByRole('button', { name: /Резервуар:/ })).toBeVisible();
    await expect(typeToolbar.getByRole('button', { name: /Все:/ })).toBeVisible();

    await page.getByRole('toolbar', { name: 'Действия блока заполнения' }).getByRole('button', { name: 'Добавить' }).click();
    await expect(page.locator('.inline-object-form')).toBeVisible();
    await expect(typeToolbar.getByText('Режим: добавление')).toBeVisible();
    await expect(page.getByText('ГЕОМЕТРИЯ ТРУБЫ')).toBeVisible();
    await expect(page.getByLabel(/Наружный Ø/i)).toBeVisible();
    await expect(page.locator('#inline-object-save')).toBeAttached();
  });

  test('рассчитанный трубопровод отображается в исходных данных', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipeName = `E2E heat pipe ${Date.now()}`;
    await createCalculatedPipe(page, pipeName);

    await page.reload({ waitUntil: 'networkidle' });

    const typeToolbar = page.getByRole('toolbar', { name: 'Тип объекта и блок параметров' });
    await expect(typeToolbar.getByRole('button', { name: /Трубопровод:\s*1/ })).toBeVisible();
    await expect(typeToolbar.getByRole('button', { name: /Все:\s*1/ })).toBeVisible();
    await expect(page.getByText(/Все рассчитаны/)).toHaveCount(0);
    await expect(page.locator('.calc-spreadsheet--normal-glide canvas').first()).toBeVisible();
    const objects = await fetchProjectObjects(page);
    const savedObject = objects.find((object) => object.params.name === pipeName);
    expect(savedObject?.is_valid).toBe(true);
    expect(savedObject?.params).toMatchObject({
      outer_diameter: 0.108,
      insulation_thickness: 0.05,
      insulation_material: 'mineral_wool_boards_120',
    });
    expect(savedObject?.results?.heat_loss_per_meter).toBeTruthy();

    await expect(page.getByRole('button', { name: /Электрорасчёт/i })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /Электротехнический расчёт/i })).toBeVisible();
  });

  test('Excel-режим показывает числовые разряды как обычная таблица', async ({ page }) => {
    await loginAsGuest(page);
    const pipeName = `E2E heat excel digits ${Date.now()}`;
    await createCalculatedPipe(page, pipeName, {
      pipe_length: 5,
      wall_thickness: 0.001,
      safety_factor: 1.1,
    });
    await page.reload({ waitUntil: 'networkidle' });

    await page.getByText('Excel-режим', { exact: true }).click();

    await expect(page.locator('.calc-spreadsheet--excel-mode canvas').first()).toBeVisible();
    const objects = await fetchProjectObjects(page);
    const savedObject = objects.find((object) => object.params.name === pipeName);
    expect(savedObject?.params).toMatchObject({
      pipe_length: 5,
      wall_thickness: 0.001,
      safety_factor: 1.1,
    });
  });

  test('со страницы теплопотерь открывается электрорасчёт и запускается ручной пересчёт', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const { projectId, sessionId } = await currentGuestContext(page);
    const pipeName = `E2E heat-to-elec ${Date.now()}`;
    const pipe = await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();

    await expect(page).toHaveURL(/\/workspace\/elec-calc/);
    await expectElectricalGlideReady(page);
    await expect.poll(async () => {
      const rows = await fetchElectricalCalcs(page, projectId, sessionId);
      return rows.find((row) => row.object_id === pipe.id)?.cable_mark ?? null;
    }).toBeNull();
    await expect(page.getByText(/СО1 · тип по объектам · расчёт не выполнен/i)).toBeVisible();
    await page.getByRole('button', { name: /Пересчитать все СО1/i }).click();
    await page.getByRole('button', { name: /Да, пересчитать все/i }).click();
    await expect(page.getByText(/электрорасчёт всех объектов поставлен в очередь/i)).toBeVisible();
    await expect(page.getByText(/СО1 · тип по объектам · .*рассчитано: 1\/1/i)).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => {
      const rows = await fetchElectricalCalcs(page, projectId, sessionId);
      return rows.find((row) => row.object_id === pipe.id)?.cable_mark ?? '';
    }).toContain('ТЛТ-100');
  });
});
