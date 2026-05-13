import { chromium } from 'playwright';

const url = process.env.VERIFY_URL ?? 'http://localhost:3003';
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';
const mode = process.argv.includes('--tank') ? 'tank' : 'pipe';
const printReport = process.argv.includes('--report');
const screenshotPath = process.argv.find((arg) => arg.startsWith('--screenshot='))?.split('=')[1];
const viewportWidth = Number(process.argv.find((arg) => arg.startsWith('--width='))?.split('=')[1] ?? 2048);
const layerCount = Number(process.argv.find((arg) => arg.startsWith('--layers='))?.split('=')[1] ?? 2);
const normalizedLayerCount = Math.min(Math.max(layerCount || 2, 1), 3);

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

const browser = await chromium.launch({ headless: true, channel });
const page = await browser.newPage({
  viewport: { width: viewportWidth, height: 900 },
  deviceScaleFactor: 1,
});

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);

  const guestButton = page.getByRole('button', { name: /Начать без регистрации/ });
  if (await guestButton.count()) {
    await guestButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
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
  }

  await page.waitForTimeout(700);

  if (mode === 'pipe') {
    const layerSelect = page.locator('.layer-count-form-item .ant-select').first();
    if (await layerSelect.count()) {
      await layerSelect.click();
      await page
        .locator('.ant-select-item-option')
        .filter({ hasText: `${normalizedLayerCount} ${normalizedLayerCount === 1 ? 'слой' : 'слоя'}` })
        .last()
        .click();
      await page.waitForTimeout(400);
    }
  }

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }

  const { overflowReport, layoutReport } = await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('.form-col-srs:not(.collapsed)'));

    const layoutReport = sections.map((section, sectionIndex) => {
      const sectionRect = section.getBoundingClientRect();
      const title = section.querySelector('h4')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const items = Array.from(section.querySelectorAll(':scope > .ant-form-item')).map((item) => {
        const itemRect = item.getBoundingClientRect();
        const label = item.querySelector('.ant-form-item-label')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const control = item.querySelector('.ant-input, .ant-select, .ant-input-number-group-wrapper, .ant-input-number');
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
          item.querySelectorAll('.ant-form-item-row, .ant-form-item-label, .ant-input, .ant-select, .ant-input-number, .ant-input-number-group-wrapper, .anticon-info-circle'),
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

    return { overflowReport, layoutReport };
  });

  if (printReport) {
    console.log(JSON.stringify(layoutReport, null, 2));
  }

  if (overflowReport.length > 0) {
    console.error(JSON.stringify(overflowReport, null, 2));
    process.exitCode = 1;
  } else {
    console.log('inline form visual bounds OK');
  }
} finally {
  await browser.close();
}
