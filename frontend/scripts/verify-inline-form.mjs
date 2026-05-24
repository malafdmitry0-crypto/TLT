import { chromium } from 'playwright';

const url = process.env.VERIFY_URL ?? 'http://localhost:3003';
const apiBaseUrl = (
  process.env.VERIFY_API_BASE_URL ??
  process.env.VITE_API_BASE_URL ??
  'http://localhost:8000/api/v1'
).replace(/\/$/, '');
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';
const mode = process.argv.includes('--tank') ? 'tank' : 'pipe';
const excelMode = process.argv.includes('--excel');
const stableTableTop = process.argv.includes('--stable-table-top');
const errorOverlay = process.argv.includes('--error-overlay');
const printReport = process.argv.includes('--report');
const screenshotPath = process.argv.find((arg) => arg.startsWith('--screenshot='))?.split('=')[1];
const viewportWidth = Number(process.argv.find((arg) => arg.startsWith('--width='))?.split('=')[1] ?? 2048);
const layerCount = Number(process.argv.find((arg) => arg.startsWith('--layers='))?.split('=')[1] ?? 2);
const normalizedLayerCount = Math.min(Math.max(layerCount || 2, 1), 3);
const placementArg = process.argv.find((arg) => arg.startsWith('--placement='))?.split('=')[1];
const placement = ['top', 'bottom', 'left', 'right'].includes(placementArg) ? placementArg : null;

async function selectObjectType(page, label) {
  const byLabel = page.getByLabel(label, { exact: true });
  if (await byLabel.count()) {
    await byLabel.click();
    return;
  }
  const byButton = page.getByRole('button', { name: new RegExp(`^${label}`) });
  if (await byButton.count()) {
    await byButton.click();
    return;
  }
  const byRole = page.getByRole('radio', { name: label });
  if (await byRole.count()) {
    await byRole.click();
    return;
  }
  await page.locator('.ant-segmented-item', { hasText: label }).click();
}

async function seedGuestWorkspace(page) {
  const response = await page.request.post(`${apiBaseUrl}/auth/guest`);
  if (!response.ok()) {
    throw new Error(`Guest seed failed: ${response.status()} ${await response.text()}`);
  }
  const { session_id: sessionId, project } = await response.json();
  await page.evaluate(
    ({ sessionId, project }) => {
      window.localStorage.setItem('role', 'guest');
      window.localStorage.setItem('session_id', sessionId);
      window.localStorage.setItem(
        'tlt-current-project',
        JSON.stringify({ state: { currentProject: project }, version: 0 }),
      );
    },
    { sessionId, project },
  );
  await page.goto(new URL('/workspace/heat-calc', url).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(500);
}

async function readGuestContext(page) {
  const context = await page.evaluate(() => {
    const sessionId = window.localStorage.getItem('session_id');
    const projectState = window.localStorage.getItem('tlt-current-project');
    if (!sessionId || !projectState) return null;
    try {
      const projectId = JSON.parse(projectState).state?.currentProject?.id;
      return projectId ? { sessionId, projectId } : null;
    } catch {
      return null;
    }
  });
  if (!context) {
    throw new Error('Guest context not found');
  }
  return context;
}

async function createVerifierPipe(page) {
  const { sessionId, projectId } = await readGuestContext(page);
  const name = `Verifier overlay ${Date.now()}`;
  const response = await page.request.post(`${apiBaseUrl}/projects/${projectId}/objects`, {
    headers: { 'X-Session-Id': sessionId },
    data: {
      object_type: 'pipe',
      params: {
        name,
        outer_diameter: 0.108,
        pipe_length: 50,
        insulation_thickness: 0.05,
        insulation_material: 'mineral_wool_boards_120',
        insulation_temperature_basis: 'outdoor_winter',
        ambient_temperature: -30,
        process_temperature: 150,
      },
    },
  });
  if (!response.ok()) {
    throw new Error(`Verifier pipe create failed: ${response.status()} ${await response.text()}`);
  }
  return name;
}

async function verifyToolbarTooltips(page) {
  const checks = [
    ['Добавить', 'Добавить'],
    ['Настройки отображения', 'Настройки отображения'],
    ['Импорт XLSX/CSV', 'Импорт XLSX/CSV'],
  ];
  const failures = [];

  for (const [buttonName, tooltipText] of checks) {
    const button = page.getByRole('button', { name: buttonName, exact: true }).first();
    if ((await button.count()) === 0) {
      failures.push({ buttonName, reason: 'button not found' });
      continue;
    }
    await button.hover();
    await page.waitForTimeout(250);
    const tooltip = page.locator('.ant-tooltip').filter({ hasText: tooltipText });
    if ((await tooltip.count()) === 0) {
      failures.push({ buttonName, tooltipText, reason: 'tooltip not found' });
    }
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
  }

  return failures;
}

async function selectPipeLayerCount(page, count) {
  const layerSelect = page.locator('.layer-count-form-item .ant-select').first();
  if ((await layerSelect.count()) === 0) return false;

  await layerSelect.click();
  await page
    .locator('.ant-select-item-option')
    .filter({ hasText: `${count} ${count === 1 ? 'слой' : 'слоя'}` })
    .last()
    .click();
  await page.waitForTimeout(400);
  return true;
}

async function readTopFormMetrics(page) {
  return page.evaluate(() => {
    const table = document.querySelector('.workspace-table-card');
    const formPane = document.querySelector('.heatcalc-form-pane--top');
    const formGrid = formPane?.querySelector('.form-grid-srs');
    const tableRect = table?.getBoundingClientRect();
    const formRect = formGrid?.getBoundingClientRect();
    const sections = Array.from(formPane?.querySelectorAll('.form-col-srs:not(.collapsed)') ?? []).map((section) => {
      const rect = section.getBoundingClientRect();
      const style = getComputedStyle(section);
      return {
        title: section.querySelector('h4')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        clientHeight: Math.round(section.clientHeight),
        scrollHeight: Math.round(section.scrollHeight),
        height: Math.round(rect.height),
        overflowY: style.overflowY,
      };
    });
    return {
      tableTop: tableRect ? Math.round(tableRect.top * 10) / 10 : null,
      formHeight: formRect ? Math.round(formRect.height) : null,
      sections,
    };
  });
}

async function readTableTop(page) {
  return page.evaluate(() => {
    const table = document.querySelector('.workspace-table-card');
    const rect = table?.getBoundingClientRect();
    return rect ? Math.round(rect.top * 10) / 10 : null;
  });
}

async function verifyErrorOverlay(page, pipeName) {
  const row = page.getByRole('row').filter({ hasText: pipeName }).first();
  if ((await row.count()) === 0) {
    return [{ reason: 'verifier row not found', pipeName }];
  }
  await row.scrollIntoViewIfNeeded();
  const editableCell = row.locator('.editable-cell-display').first();
  if ((await editableCell.count()) > 0) {
    await editableCell.click();
  } else {
    await row.click();
  }
  await page.waitForTimeout(250);

  const inputHost = page.getByTestId('process-temperature-input');
  if ((await inputHost.count()) === 0) {
    return [{ reason: 'process temperature input not found' }];
  }
  const nestedInput = inputHost.locator('input').first();
  const processInput = (await nestedInput.count()) > 0 ? nestedInput : inputHost;
  await processInput.fill('-40');
  await page.waitForTimeout(150);

  const beforeTableTop = await readTableTop(page);
  const saveButton = page
    .getByRole('toolbar', { name: 'Действия блока заполнения' })
    .getByRole('button', { name: 'Сохранить' })
    .first();
  if ((await saveButton.count()) === 0) {
    return [{ reason: 'save button not found' }];
  }
  await saveButton.click();
  await page.mouse.move(20, 20);
  await page.waitForTimeout(500);

  const afterTableTop = await readTableTop(page);
  return page.evaluate(({ beforeTableTop, afterTableTop }) => {
    const failures = [];
    const legacyTableErrors = document.querySelector('[aria-label="Ошибки в Excel-таблице"]');
    const overlay = document.querySelector('[aria-label="Ошибки выбранной строки"]');
    const table = document.querySelector('.workspace-table-card');
    const typebar = document.querySelector('.actionbar-type-row');
    const inlineFieldMessages = Array.from(
      document.querySelectorAll('.heatcalc-form-pane--top .ant-form-item-explain-error'),
    )
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean);
    if (legacyTableErrors) {
      failures.push({ reason: 'legacy table errors panel is still rendered' });
    }
    if (!overlay) {
      failures.push({ reason: 'selected row errors overlay not rendered' });
      return failures;
    }
    const overlayStyle = getComputedStyle(overlay);
    const overlayRect = overlay.getBoundingClientRect();
    const typebarRect = typebar?.getBoundingClientRect();
    const tableTopDelta = beforeTableTop == null || afterTableTop == null
      ? null
      : Math.abs(afterTableTop - beforeTableTop);
    const overlapsTypebar = !!typebarRect
      && overlayRect.left < typebarRect.right
      && overlayRect.right > typebarRect.left
      && overlayRect.top < typebarRect.bottom
      && overlayRect.bottom > typebarRect.top;

    if (overlayStyle.position !== 'absolute' && overlayStyle.position !== 'fixed') {
      failures.push({ reason: 'selected row errors participate in layout', position: overlayStyle.position });
    }
    if (tableTopDelta == null || tableTopDelta > 2) {
      failures.push({ reason: 'table top changed after validation overlay', tableTopDelta, beforeTableTop, afterTableTop });
    }
    if (!overlapsTypebar) {
      failures.push({
        reason: 'selected row errors overlay does not cover the top control row',
        overlay: {
          left: Math.round(overlayRect.left),
          top: Math.round(overlayRect.top),
          right: Math.round(overlayRect.right),
          bottom: Math.round(overlayRect.bottom),
        },
        typebar: typebarRect ? {
          left: Math.round(typebarRect.left),
          top: Math.round(typebarRect.top),
          right: Math.round(typebarRect.right),
          bottom: Math.round(typebarRect.bottom),
        } : null,
      });
    }
    if (!table) {
      failures.push({ reason: 'table card not found after validation overlay' });
    }
    if (inlineFieldMessages.length > 0) {
      failures.push({
        reason: 'field-level error text is rendered inside compact top form',
        messages: inlineFieldMessages.slice(0, 4),
      });
    }
    return failures;
  }, { beforeTableTop, afterTableTop });
}

const browser = await chromium.launch({ headless: true, channel });
const page = await browser.newPage({
  viewport: { width: viewportWidth, height: 900 },
  deviceScaleFactor: 1,
});

if (placement) {
  await page.addInitScript((formPlacement) => {
    window.localStorage.setItem('heatcalc.tableView.v1.guest', JSON.stringify({
      version: 1,
      fontSize: 'standard',
      tableLabelFormat: 'short',
      settingsLabelFormat: 'full',
      inlineEditingEnabled: false,
      formPlacement,
      sideFormWidthPct: 34,
      formSectionWeights: [1.655, 1.35, 1.2],
    }));
  }, placement);
}

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);

  const guestButton = page.getByRole('button', { name: /Начать без регистрации/ });
  if (await guestButton.count()) {
    await guestButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    if ((await page.locator('.inline-object-form').count()) === 0) {
      await seedGuestWorkspace(page);
    }
  }

  if ((await page.locator('.inline-object-form').count()) === 0) {
    if (mode === 'tank') {
      await selectObjectType(page, 'Резервуар');
    } else {
      await selectObjectType(page, 'Трубопровод');
    }
    const addButton = page.getByRole('toolbar', { name: 'Действия блока заполнения' }).getByRole('button', { name: 'Добавить' });
    if ((await addButton.count()) === 0) {
      console.error(await page.locator('body').innerText({ timeout: 5000 }));
      throw new Error('Add button not found');
    }
    await addButton.click();
    await page.waitForSelector('.inline-object-form', { timeout: 5000 });
  } else {
    await selectObjectType(page, mode === 'tank' ? 'Резервуар' : 'Трубопровод');
    await page.waitForTimeout(400);
  }

  await page.waitForTimeout(700);

  let verifierPipeName = null;
  if (errorOverlay) {
    if (mode !== 'pipe') {
      throw new Error('--error-overlay verifier supports pipe mode only');
    }
    verifierPipeName = await createVerifierPipe(page);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(700);
    await selectObjectType(page, 'Трубопровод');
    await page.waitForTimeout(400);
  }

  if (excelMode) {
    await page.getByText('Excel-режим').click();
    await page.waitForTimeout(300);
  }

  let stableTableTopReport = [];
  if (stableTableTop && mode === 'pipe') {
    const targetLayerCount = normalizedLayerCount === 1 ? 3 : normalizedLayerCount;
    const layerControlFound = await selectPipeLayerCount(page, 1);
    const beforeMetrics = await readTopFormMetrics(page);
    if (layerControlFound) {
      await selectPipeLayerCount(page, targetLayerCount);
    }
    const afterMetrics = await readTopFormMetrics(page);
    const tableTopDelta = beforeMetrics.tableTop == null || afterMetrics.tableTop == null
      ? null
      : Math.abs(afterMetrics.tableTop - beforeMetrics.tableTop);
    const scrollableSections = afterMetrics.sections.filter((section) => (
      section.scrollHeight > section.clientHeight + 1
      && ['auto', 'scroll'].includes(section.overflowY)
    ));
    stableTableTopReport = [
      ...(!layerControlFound ? [{
        reason: 'layer control not found',
      }] : []),
      ...(tableTopDelta == null || tableTopDelta > 2 ? [{
        reason: 'table top changed after form content growth',
        tableTopDelta,
        before: beforeMetrics,
        after: afterMetrics,
      }] : []),
      ...(targetLayerCount > 1 && scrollableSections.length === 0 ? [{
        reason: 'no internal section scroll after form content growth',
        before: beforeMetrics,
        after: afterMetrics,
      }] : []),
    ];
  } else if (mode === 'pipe') {
    await selectPipeLayerCount(page, normalizedLayerCount);
  }

  const errorOverlayReport = errorOverlay
    ? await verifyErrorOverlay(page, verifierPipeName)
    : [];

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  const tooltipReport = excelMode ? await verifyToolbarTooltips(page) : [];

  const {
    actionbarOverflowReport,
    overflowReport,
    labelClippingReport,
    compactSpacingReport,
    layoutReport,
  } = await page.evaluate((shouldCheckActionbar) => {
    const sections = Array.from(document.querySelectorAll('.form-col-srs:not(.collapsed)'));
    const actionbarOverflowReport = shouldCheckActionbar
      ? Array.from(document.querySelectorAll('.actionbar-srs')).flatMap((bar, index) => {
        const overflow = bar.scrollWidth - bar.clientWidth;
        if (overflow <= 1) return [];
        return [{
          index,
          clientWidth: Math.round(bar.clientWidth),
          scrollWidth: Math.round(bar.scrollWidth),
          overflow: Math.round(overflow),
          text: bar.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
        }];
      })
      : [];

    const layoutReport = sections.map((section, sectionIndex) => {
      const sectionRect = section.getBoundingClientRect();
      const title = section.querySelector('h4')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const items = Array.from(section.querySelectorAll(':scope > .ant-form-item')).map((item) => {
        const itemRect = item.getBoundingClientRect();
        const label = item.querySelector('.ant-form-item-label')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const control = item.querySelector('.ant-input, .ant-select, .unit-input-number, .ant-input-number-group-wrapper, .ant-input-number');
        const controlRect = control?.getBoundingClientRect();
        return {
          label,
          itemLeft: Math.round(itemRect.left - sectionRect.left),
          itemTop: Math.round(itemRect.top - sectionRect.top),
          itemWidth: Math.round(itemRect.width),
          controlWidth: controlRect ? Math.round(controlRect.width) : 0,
        };
      });
      return {
        sectionIndex,
        title,
        width: Math.round(sectionRect.width),
        height: Math.round(sectionRect.height),
        columns: getComputedStyle(section).gridTemplateColumns,
        items,
      };
    });

    const overflowReport = sections.flatMap((section, sectionIndex) => {
      const sectionRect = section.getBoundingClientRect();
      return Array.from(section.querySelectorAll(':scope > .ant-form-item')).flatMap((item) => {
        const itemRect = item.getBoundingClientRect();
        const itemOverflow =
          itemRect.left < sectionRect.left - 1 ||
          itemRect.right > sectionRect.right + 1;

        const childOverflow = Array.from(
          item.querySelectorAll('.ant-form-item-row, .ant-form-item-label, .ant-input, .ant-select, .unit-input-number, .unit-input-number__addon, .ant-input-number, .ant-input-number-group-wrapper, .anticon-info-circle'),
        ).some((child) => {
          if (getComputedStyle(child).display === 'contents') return false;
          const childRect = child.getBoundingClientRect();
          return childRect.left < sectionRect.left - 1 || childRect.right > sectionRect.right + 1;
        });

        if (!itemOverflow && !childOverflow) return [];

        return [{
          sectionIndex,
          sectionWidth: Math.round(sectionRect.width),
          text: item.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100) ?? '',
          itemLeft: Math.round(itemRect.left - sectionRect.left),
          itemRight: Math.round(itemRect.right - sectionRect.left),
        }];
      });
    });

    const labelClippingReport = sections.flatMap((section, sectionIndex) => {
      return Array.from(
        section.querySelectorAll('.ant-form-item-label > label, .field-label-two-line, .field-label-two-line > span'),
      ).flatMap((label) => {
        const style = getComputedStyle(label);
        const clipsOverflow = ['hidden', 'clip'].includes(style.overflow)
          || ['hidden', 'clip'].includes(style.overflowX)
          || ['hidden', 'clip'].includes(style.overflowY);
        const clippedBySize =
          label.scrollWidth > label.clientWidth + 1 ||
          label.scrollHeight > label.clientHeight + 1;
        if (!clipsOverflow || !clippedBySize) return [];

        return [{
          sectionIndex,
          text: label.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100) ?? '',
          clientWidth: Math.round(label.clientWidth),
          scrollWidth: Math.round(label.scrollWidth),
          clientHeight: Math.round(label.clientHeight),
          scrollHeight: Math.round(label.scrollHeight),
          overflow: style.overflow,
          display: style.display,
        }];
      });
    });

    const compactSpacingReport = sections.flatMap((section, sectionIndex) => {
      if (sectionIndex !== 0) return [];
      const sectionRect = section.getBoundingClientRect();
      const rows = new Map();
      Array.from(
        section.querySelectorAll(
          ':scope > .fit-label-form-item, :scope > .numeric-form-item, :scope > .compact-select-form-item, :scope > .medium-select-form-item',
        ),
      ).forEach((item) => {
        if (getComputedStyle(item).display === 'none') return;
        const itemRect = item.getBoundingClientRect();
        const control = item.querySelector(
          '.ant-input, .ant-select, .unit-input-number, .ant-input-number-group-wrapper, .ant-input-number',
        );
        const controlRect = control?.getBoundingClientRect();
        if (!controlRect) return;
        const key = Math.round((itemRect.top - sectionRect.top) / 4) * 4;
        const row = rows.get(key) ?? [];
        row.push({
          text: item.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? '',
          itemLeft: itemRect.left - sectionRect.left,
          controlRight: controlRect.right - sectionRect.left,
        });
        rows.set(key, row);
      });

      return Array.from(rows.entries()).flatMap(([rowTop, row]) => {
        const sorted = row.sort((a, b) => a.itemLeft - b.itemLeft);
        return sorted.slice(1).flatMap((item, index) => {
          const previous = sorted[index];
          const gap = item.itemLeft - previous.controlRight;
          if (gap <= 96) return [];
          return [{
            sectionIndex,
            rowTop,
            gap: Math.round(gap),
            previous: previous.text,
            next: item.text,
          }];
        });
      });
    });

    return { actionbarOverflowReport, overflowReport, labelClippingReport, compactSpacingReport, layoutReport };
  }, excelMode);

  if (printReport) {
    console.log(JSON.stringify(layoutReport, null, 2));
  }

  if (stableTableTopReport.length > 0) {
    console.error(JSON.stringify(stableTableTopReport, null, 2));
    process.exitCode = 1;
  } else if (errorOverlayReport.length > 0) {
    console.error(JSON.stringify(errorOverlayReport, null, 2));
    process.exitCode = 1;
  } else if (tooltipReport.length > 0) {
    console.error(JSON.stringify(tooltipReport, null, 2));
    process.exitCode = 1;
  } else if (actionbarOverflowReport.length > 0) {
    console.error(JSON.stringify(actionbarOverflowReport, null, 2));
    process.exitCode = 1;
  } else if (overflowReport.length > 0) {
    console.error(JSON.stringify(overflowReport, null, 2));
    process.exitCode = 1;
  } else if (labelClippingReport.length > 0) {
    console.error(JSON.stringify(labelClippingReport, null, 2));
    process.exitCode = 1;
  } else if (compactSpacingReport.length > 0) {
    console.error(JSON.stringify(compactSpacingReport, null, 2));
    process.exitCode = 1;
  } else {
    console.log('inline form visual bounds OK');
  }
} finally {
  await browser.close();
}
