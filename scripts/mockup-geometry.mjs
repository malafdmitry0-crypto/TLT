#!/usr/bin/env node
/**
 * Геометрия макетов кейса 1: page overflow и минимальные ширины таблиц/панелей
 * на контрактных вьюпортах 1000 / 1280 / 1440 (бриф §5: page overflow запрещён).
 *
 *   node scripts/mockup-geometry.mjs [glob-каталог=mockups]
 *
 * Выход: таблица по каждому файлу + exit 1, если хоть где-то есть переполнение страницы.
 */
import { readdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(resolve('e2e/package.json'));
const { chromium } = require('playwright');

const dir = resolve(process.argv[2] ?? 'mockups');
const VIEWPORTS = [1000, 1280, 1440];

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.html'))
  .sort();

if (files.length === 0) {
  console.error(`Нет .html в ${dir}`);
  process.exit(2);
}

const browser = await chromium.launch();
let failed = false;

for (const width of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  console.log(`\n=== ${width} px ===`);
  for (const file of files) {
    await page.goto(pathToFileURL(join(dir, file)).href);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      let worst = null;
      for (const el of document.querySelectorAll('*')) {
        const right = el.getBoundingClientRect().right;
        if (right > de.clientWidth + 1) {
          const over = Math.round(right - de.clientWidth);
          if (!worst || over > worst.over) {
            worst = { sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''), over };
          }
        }
      }
      return { client: de.clientWidth, scroll: de.scrollWidth, worst };
    });
    const over = m.scroll - m.client;
    if (over > 0) {
      failed = true;
      console.log(`  ✗ ${basename(file).padEnd(32)} страница ${m.scroll}px (+${over}) — ${m.worst?.sel}`);
    } else {
      console.log(`  ✓ ${basename(file).padEnd(32)} без переполнения`);
    }
  }
  await ctx.close();
}

// Минимальные ширины таблиц и панелей — считаются один раз, при узком вьюпорте
const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
const page = await ctx.newPage();
console.log('\n=== Минимальные ширины (nowrap) ===');
for (const file of files) {
  await page.goto(pathToFileURL(join(dir, file)).href);
  const m = await page.evaluate(() => ({
    tables: [...document.querySelectorAll('table.data')].map((t) => ({
      cols: t.querySelectorAll('tr:first-child th').length,
      min: Math.round(t.scrollWidth),
    })),
    bars: [...document.querySelectorAll('.toolbar, .table-toolbar, .app-header')].map((b) => ({
      cls: String(b.className).split(' ')[0],
      min: Math.round(b.scrollWidth),
    })),
  }));
  console.log(`  ${basename(file)}`);
  for (const t of m.tables) console.log(`     таблица ${String(t.cols).padStart(2)} кол. → ${t.min}px`);
  for (const b of m.bars) console.log(`     ${b.cls.padEnd(14)} → ${b.min}px`);
}
await browser.close();

if (failed) {
  console.log('\nЕсть горизонтальное переполнение страницы — бриф §5 нарушен.');
  process.exit(1);
}
console.log('\nПереполнений нет.');
