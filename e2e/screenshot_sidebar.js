const { chromium } = require('./node_modules/playwright');
(async () => {
  const execPath = '/Users/dmalafey/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  const browser = await chromium.launch({ executablePath: execPath });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3003');
  await page.waitForTimeout(1000);
  await page.click('text=Начать без регистрации');
  await page.waitForTimeout(3000);
  // elec calc
  await page.click('text=Электротехнический расчёт');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/elec_calc.png' });
  // spec
  await page.click('text=Спецификация');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/spec.png' });
  // report
  await page.click('text=Отчёт');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/report.png' });
  await browser.close();
  console.log('done');
})().catch(e => console.error(e.message));
