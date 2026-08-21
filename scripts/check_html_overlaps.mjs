// Проверка фактического рендера: наложения текста и выход за границы кадра.
// Меряем реальные bounding box'ы в браузере — это ловит и то, чего нет в модели
// (перенос строк, реальные метрики шрифта).
//
//   node scripts/check_html_overlaps.mjs
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { chromium } from '/Users/dmalafey/Desktop/TLT/e2e/node_modules/playwright/index.mjs';

const DIR = resolve('mockups/html');
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.html') && !['index.html', 'all.html'].includes(f))
  .sort();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

let problems = 0;
for (const file of files) {
  await page.goto(pathToFileURL(join(DIR, file)).href, { waitUntil: 'load' });
  const res = await page.evaluate(() => {
    const frame = document.querySelector('.frame');
    const fb = frame.getBoundingClientRect();
    // слой и принадлежность таблице проставлены генератором
    const nodes = [...frame.querySelectorAll('.t')].map((el) => ({
      r: el.getBoundingClientRect(),
      text: el.textContent.trim(),
      layer: Number(el.dataset.layer || 0),
      inTable: el.dataset.table === '1',
    }));
    const layerOf = (n) => n.layer;

    const over = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (layerOf(a) !== layerOf(b)) continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix > 1 && iy > 1) {
          over.push({ a: a.text.slice(0, 40), b: b.text.slice(0, 40), px: Math.round(ix) });
        }
      }
    }
    // содержимое таблицы шире кадра — это заявленный горизонтальный скролл
    const out = nodes
      .filter((n) => !n.inTable)
      .filter((n) => n.r.right > fb.right + 1 || n.r.bottom > fb.bottom + 1)
      .map((n) => ({
        text: n.text.slice(0, 44),
        dx: Math.round(Math.max(0, n.r.right - fb.right)),
        dy: Math.round(Math.max(0, n.r.bottom - fb.bottom)),
      }));
    return { over, out, w: Math.round(fb.width) };
  });

  if (res.over.length || res.out.length) {
    problems += res.over.length + res.out.length;
    console.log(`\n${file}  (${res.w}px)`);
    res.over.sort((x, y) => y.px - x.px).slice(0, 6)
      .forEach((o) => console.log(`   наложение +${o.px}px  «${o.a}» × «${o.b}»`));
    res.out.slice(0, 6).forEach((o) =>
      console.log(`   за краем  ${o.dx ? `вправо +${o.dx}` : ''}${o.dy ? ` вниз +${o.dy}` : ''}  «${o.text}»`));
  }
}
await browser.close();
console.log(`\nфайлов проверено: ${files.length}; проблем: ${problems}`);
process.exit(problems ? 1 : 0);
