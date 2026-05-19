import { test, expect, type Page } from '@playwright/test';

import { createCalculatedPipe, loginAsGuest } from './helpers/workspace';

const ALL_ELECTRICAL_COLUMN_KEYS = [
  'index',
  'object_name',
  'electrical_status',
  'cable_mark',
  'applied_selection_policy',
  'winding_pitch_mm',
  'number_of_threads',
  'laying_step',
  'heating_height',
  'connection_type',
  'supply_voltage',
  'winding_coefficient',
  'vapor_temperature',
  'maintain_temperature',
  'aggressive_product',
  'installed_cable_length',
  'order_cable_length',
  'total_power',
  'current',
  'voltage',
  'price_per_meter',
  'required_order_length',
  'total_cost',
  'stock_status',
  'lead_time_days',
  'heat_loss_per_meter',
  'heat_loss_per_m2',
  'total_heat_loss',
] as const;

async function recalculateAll(page: Page, variant = 1) {
  await page.getByRole('button', { name: new RegExp(`Пересчитать все СО${variant}`, 'i') }).click();
  await page.getByRole('button', { name: /Да, пересчитать все/i }).click();
}

async function expectElectricalHeaderControlsInline(page: Page) {
  await expect(page.locator('.electrical-spreadsheet .ant-table-filter-trigger').first()).toBeVisible();

  const issues = await page.locator('.electrical-spreadsheet .ant-table-thead th').evaluateAll((headers) => {
    return headers.flatMap((header) => {
      const title = header.querySelector('.resizable-column-title-text')?.getBoundingClientRect();
      const sorter = header.querySelector('.ant-table-column-sorter')?.getBoundingClientRect();
      const filter = header.querySelector('.ant-table-filter-trigger')?.getBoundingClientRect();
      const label = header.textContent?.replace(/\s+/g, ' ').trim() || '(empty)';
      const headerIssues: string[] = [];
      const headerHeight = header.getBoundingClientRect().height;

      if (headerHeight > 52) {
        headerIssues.push(`${label}: header is too tall (${Math.round(headerHeight)}px)`);
      }
      if (title && filter && filter.top > title.bottom + 8) {
        headerIssues.push(`${label}: filter is stacked below title`);
      }
      if (sorter && filter) {
        const sorterCenter = (sorter.top + sorter.bottom) / 2;
        const filterCenter = (filter.top + filter.bottom) / 2;
        if (Math.abs(sorterCenter - filterCenter) > 2) {
          headerIssues.push(`${label}: sorter and filter are vertically misaligned`);
        }
      }

      return headerIssues;
    });
  });

  expect(issues).toEqual([]);

  const borderIssues = await page.evaluate(() => {
    const headers = [...document.querySelectorAll<HTMLElement>(
      '.electrical-spreadsheet .ant-table-thead th',
    )];
    const firstDataRow = document.querySelector<HTMLElement>(
      '.electrical-spreadsheet .ant-table-tbody tr:not(.ant-table-measure-row)',
    );
    const cells = firstDataRow
      ? [...firstDataRow.querySelectorAll<HTMLElement>('td')]
      : [];

    return headers.flatMap((header, index) => {
      const cell = cells[index];
      if (!cell) return [];

      const headerRect = header.getBoundingClientRect();
      if (headerRect.right <= 0 || headerRect.left >= window.innerWidth) {
        return [];
      }

      const cellRect = cell.getBoundingClientRect();
      const headerBorder = getComputedStyle(header).borderRight;
      const cellBorder = getComputedStyle(cell).borderRight;
      const label = header.textContent?.replace(/\s+/g, ' ').trim() || `column ${index}`;
      const columnIssues: string[] = [];

      if (Math.abs(headerRect.left - cellRect.left) > 1 || Math.abs(headerRect.right - cellRect.right) > 1) {
        columnIssues.push(`${label}: header/body vertical borders are misaligned`);
      }
      if (headerBorder !== cellBorder) {
        columnIssues.push(`${label}: header/body border styles differ`);
      }

      return columnIssues;
    });
  });

  expect(borderIssues).toEqual([]);
}

async function showAllElectricalColumns(page: Page) {
  await page.evaluate((keys) => {
    const columns = Object.fromEntries(keys.map((key) => [key, { widthPct: 8 }]));
    localStorage.setItem('electrical.tableColumns.v4.guest', JSON.stringify({
      version: 4,
      visibleOrder: keys,
      columns,
    }));
    localStorage.setItem('electrical.tableView.v1.guest', JSON.stringify({
      version: 1,
      fontSize: 'compact',
      tableLabelFormat: 'short',
      settingsLabelFormat: 'full',
    }));
  }, ALL_ELECTRICAL_COLUMN_KEYS);
  await page.reload();
}

async function scrollElectricalTableHorizontally(page: Page, scrollLeft: number) {
  await page.evaluate((left) => {
    const scroller = document.querySelector<HTMLElement>(
      '.electrical-spreadsheet .ant-table-content, .electrical-spreadsheet .ant-table-body',
    );
    if (scroller) scroller.scrollLeft = left;
  }, scrollLeft);
  await page.waitForTimeout(100);
}

test.describe('4.4 Электротехнический расчёт', () => {
  test('пустой проект показывает таблицу электрорасчёта, варианты СО1..СО4 и сообщение', async ({
    page,
  }) => {
    await loginAsGuest(page);
    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await expect(page).toHaveURL(/\/workspace\/elec-calc/);

    await expect(page.getByText(/СО1 · тип по объектам · расчёт не выполнен/i)).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: /^СО1$/ })).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: /^СО4$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Пересчитать все СО1/i })).toBeDisabled();
    await expect(page.getByText(/нет объектов/i)).toBeVisible();
  });

  test('после расчёта объекта показывает марку кабеля, длину, мощность и ток', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipeName = `E2E elec pipe ${Date.now()}`;
    await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    const row = page.getByRole('row').filter({ hasText: pipeName }).first();
    await expect(row).toBeVisible();
    await expect(row.locator('.heatloss-status-icon-tag[aria-label="Рассчитан"]')).toBeVisible();
    await expect(row.getByText(/^ОК$/)).toHaveCount(0);
    await expectElectricalHeaderControlsInline(page);

    await showAllElectricalColumns(page);
    await expect(page.getByRole('row').filter({ hasText: pipeName }).first()).toBeVisible();
    await scrollElectricalTableHorizontally(page, 1500);
    await expectElectricalHeaderControlsInline(page);

    await expect(page.getByText(/СО1 · тип по объектам · расчёт не выполнен/i)).toBeVisible();

    await recalculateAll(page);

    await expect(page.getByText(/СО1 — расчёт выполнен для всех объектов: 1/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/СО1 · тип по объектам · .*рассчитано: 1\/1/i)).toBeVisible();
    await expect(page.getByText(/ТЛТ-100/)).toBeVisible();
    await expect(page.getByText(/11,80 кВт|11\.80 кВт/i).first()).toBeVisible();
  });

  test('варианты СО изолированы: расчёт СО2 не подменяет статус СО1', async ({
    page,
  }) => {
    await loginAsGuest(page);
    const pipeName = `E2E variant pipe ${Date.now()}`;
    await createCalculatedPipe(page, pipeName);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await page.getByRole('button').filter({ hasText: /^СО2$/ }).click();
    await expect(page.getByText(/СО2 · тип по объектам · расчёт не выполнен/i)).toBeVisible();

    await recalculateAll(page, 2);
    await expect(page.getByText(/СО2 — расчёт выполнен для всех объектов: 1/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/СО2 · тип по объектам · .*рассчитано: 1\/1/i)).toBeVisible();
    await expect(page.getByText(pipeName)).toBeVisible();

    await page.getByRole('button').filter({ hasText: /^СО1$/ }).click();
    await expect(page.getByText(/СО1 · тип по объектам · расчёт не выполнен/i)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: pipeName }).first()).toBeVisible();
  });

  test('основное меню связывает электрорасчёт со страницами теплопотерь и спецификации', async ({
    page,
  }) => {
    await loginAsGuest(page);
    await createCalculatedPipe(page, `E2E nav pipe ${Date.now()}`);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await page.getByRole('menuitem', { name: /Расчёт тепловых потерь/i }).click();
    await expect(page).toHaveURL(/\/workspace\/heat-calc/);

    await page.getByRole('menuitem', { name: /Электротехнический расчёт/i }).click();
    await page.getByRole('menuitem', { name: /Спецификация/i }).click();
    await expect(page).toHaveURL(/\/workspace\/specification/);
  });
});
