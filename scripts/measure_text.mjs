// Точные ширины текста тем же шрифтовым стеком, что и heatcalc-shared.css.
// Вход: JSON-массив [{text,size,weight}] на stdin. Выход: массив ширин (px).
import { chromium } from '/Users/dmalafey/Desktop/TLT/e2e/node_modules/playwright/index.mjs';

const items = JSON.parse(await new Promise((res) => {
  let b = '';
  process.stdin.on('data', (d) => (b += d));
  process.stdin.on('end', () => res(b));
}));

const browser = await chromium.launch();
const page = await browser.newPage();
const widths = await page.evaluate((list) => {
  const stack =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const c = document.createElement('canvas').getContext('2d');
  // для подписей с заданной шириной считаем реальное число строк:
  // перенос идёт по словам, оценка «ширина/ширина блока» его занижает
  const probe = document.createElement('div');
  probe.style.cssText =
    `position:absolute;visibility:hidden;white-space:normal;line-height:1.35;font-family:${stack}`;
  document.body.appendChild(probe);
  return list.map(({ text, size, weight, width }) => {
    c.font = `${weight} ${size}px ${stack}`;
    const w = Math.ceil(c.measureText(text).width);
    if (!width) return { w, lines: 1 };
    probe.style.font = `${weight} ${size}px ${stack}`;
    probe.style.width = `${width}px`;
    probe.textContent = text;
    const lines = Math.max(1, Math.round(probe.offsetHeight / (size * 1.35)));
    return { w, lines };
  });
}, items);
await browser.close();
process.stdout.write(JSON.stringify(widths));
