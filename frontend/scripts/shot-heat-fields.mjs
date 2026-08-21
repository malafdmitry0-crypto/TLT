/**
 * Screenshot heat-object-fields for layout QA.
 * Usage: node scripts/shot-heat-fields.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../test-results/heat-fields-shots');
fs.mkdirSync(outDir, { recursive: true });

const BASE = process.env.HEAT_UI_URL || 'http://localhost:3003';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });

  // Guest enter if home is shown
  const guest = page.getByRole('button', { name: /без регистрации|гость|Войти без/i }).first();
  if (await guest.isVisible({ timeout: 3000 }).catch(() => false)) {
    await guest.click();
    await page.waitForTimeout(800);
  }

  // Navigate to heat calc if needed
  const heatNav = page.getByRole('link', { name: /тепло/i }).or(page.getByText(/Расчёт теплопотер/i)).first();
  if (await heatNav.isVisible({ timeout: 2000 }).catch(() => false)) {
    await heatNav.click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // Ensure form visible — click add if empty
  const fields = page.locator('[data-testid="heat-object-fields"]');
  if (!(await fields.isVisible({ timeout: 4000 }).catch(() => false))) {
    const add = page.getByRole('button', { name: /Добавить/i }).first();
    if (await add.isVisible({ timeout: 2000 }).catch(() => false)) {
      await add.click();
      await page.waitForTimeout(600);
    }
  }

  await page.waitForSelector('[data-testid="heat-object-fields"]', { timeout: 15000 });
  await page.waitForTimeout(400);

  const root = page.locator('[data-testid="heat-object-fields"]');
  const box = await root.boundingBox();
  const fullPath = path.join(outDir, 'heat-fields-full.png');
  const panelPath = path.join(outDir, 'heat-fields-panel.png');

  // Full heat dual form area
  const wide = page.locator('[data-testid="heat-pdf-three-column-form"], .object-wizard-wide-panel, .heatcalc-dual-forms').first();
  if (await wide.isVisible().catch(() => false)) {
    await wide.screenshot({ path: fullPath });
  } else {
    await page.screenshot({ path: fullPath, fullPage: false });
  }

  await root.screenshot({ path: panelPath });

  // Metrics for QA
  const metrics = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="heat-object-fields"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const name = el.querySelector('.name-form-item');
    const mat = el.querySelector('.pipe-material-form-item');
    const geom = el.querySelector('[data-slot="geometry"]');
    const clim = el.querySelector('[data-slot="climate"]');
    const sett = el.querySelector('[data-slot="insulation-settings"]');
    const rect = (n) => {
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) };
    };
    return {
      panel: { w: Math.round(el.getBoundingClientRect().width), grid: cs.gridTemplateColumns, areas: cs.gridTemplateAreas },
      geometry: rect(geom),
      climate: rect(clim),
      settings: rect(sett),
      name: rect(name),
      material: rect(mat),
      nameControl: rect(name?.querySelector('.ant-input, .ant-form-item-control')),
      materialControl: rect(mat?.querySelector('.reference-picker-control, .ant-form-item-control')),
      gaps: {
        geomToClim: clim && geom ? Math.round(clim.getBoundingClientRect().left - geom.getBoundingClientRect().right) : null,
        climToSett: sett && clim ? Math.round(sett.getBoundingClientRect().left - clim.getBoundingClientRect().right) : null,
      },
    };
  });

  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log('SHOTS', { fullPath, panelPath, box, metrics });

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
