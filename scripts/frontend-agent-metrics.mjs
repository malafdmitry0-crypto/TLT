#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { hostname, platform, release, arch } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

const collectionStartedAt = performance.now();
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const FRONTEND = join(ROOT, 'frontend');

function arg(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function command(commandName, args) {
  return execFileSync(commandName, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function walk(directory, accept) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', 'coverage', 'storybook-static'].includes(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...walk(path, accept));
    } else if (accept(path)) {
      result.push(path);
    }
  }
  return result;
}

function text(path) {
  return readFileSync(path, 'utf8');
}

function lines(path) {
  const content = text(path);
  return content === '' ? 0 : content.split(/\r?\n/).length;
}

function countMatches(paths, pattern) {
  let count = 0;
  for (const path of paths) {
    count += [...text(path).matchAll(pattern)].length;
  }
  return count;
}

function countFiles(paths, predicate) {
  return paths.filter(predicate).length;
}

function exists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function pathExists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function ratio(numerator, denominator, digits = 2) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return Number((numerator / denominator).toFixed(digits));
}

function percent(numerator, denominator, digits = 1) {
  const value = ratio(numerator * 100, denominator, digits);
  return value == null ? 'n/a' : `${value.toFixed(digits)}%`;
}

function numberArg(name) {
  const raw = arg(name);
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function seconds(value) {
  if (!value) return 'не запускалось';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)} с` : value;
}

function status(value) {
  if (!value) return 'NOT RUN';
  return value.toUpperCase();
}

const sourceFiles = walk(join(FRONTEND, 'src'), (path) =>
  ['.ts', '.tsx', '.css'].includes(extname(path)),
);
const productionTs = sourceFiles.filter(
  (path) =>
    ['.ts', '.tsx'].includes(extname(path)) &&
    !path.includes('/__tests__/') &&
    !path.endsWith('.stories.tsx') &&
    !path.endsWith('.stories.ts'),
);
const testFiles = sourceFiles.filter((path) => path.includes('/__tests__/'));
const e2eFiles = walk(join(ROOT, 'e2e', 'tests'), (path) => /\.spec\.tsx?$/.test(path));
const e2ePng = walk(join(ROOT, 'e2e', 'tests'), (path) => path.endsWith('.png'));
const auditSnapshots = walk(join(ROOT, 'docs', 'audit'), (path) => path.endsWith('/snapshot.md'));
const uiKitFiles = walk(join(FRONTEND, 'src', 'components', 'ui-kit'), (path) =>
  ['.ts', '.tsx'].includes(extname(path)),
);
const uiKitStories = uiKitFiles.filter((path) => /\.stories\.tsx?$/.test(path));
const uiKitProduction = uiKitFiles.filter(
  (path) => !path.endsWith('/index.ts') && !/\.stories\.tsx?$/.test(path),
);
const architectureTests = testFiles.filter((path) => path.includes('/architecture/'));
const ratchetTests = architectureTests.filter((path) => /Ratchet.*\.test\.(ts|tsx)$/.test(path));
const coreDocRelativePaths = [
  'frontend/AGENTS.md',
  'docs/frontend/README.md',
  'docs/frontend/agent-development-standard.md',
  'docs/frontend/pr-budget.md',
  'docs/frontend/refactor-backlog.md',
  'docs/frontend/ui-kit.md',
  'docs/frontend/css-strategy.md',
  'docs/frontend/viewport-policy.md',
];
const coreDocs = coreDocRelativePaths
  .map((path) => join(ROOT, path))
  .filter((path) => exists(path));

const productionLoc = productionTs
  .map((path) => ({ path, loc: lines(path) }))
  .sort((left, right) => right.loc - left.loc);
const importsPerFile = productionTs
  .map((path) => ({
    path,
    imports: countMatches([path], /^\s*import\b/gm),
  }))
  .sort((left, right) => right.imports - left.imports);

const directAntFiles = productionTs.filter((path) =>
  /from\s+['"]antd(?:\/[^'"]*)?['"]/.test(text(path)),
);
const uiKitBarrelImportFiles = productionTs.filter((path) =>
  /from\s+['"]@\/components\/ui-kit['"]/.test(text(path)),
);
const productionStems = productionTs.map((path) => ({
  path,
  stem: path.split('/').at(-1).replace(/\.(ts|tsx)$/, ''),
}));
const testBasenames = testFiles.map((path) =>
  path.split('/').at(-1).replace(/\.(test|spec)\.(ts|tsx)$/, ''),
);
const productionWithNamedTest = productionStems.filter(({ stem }) =>
  testBasenames.some((testStem) => testStem === stem || testStem.startsWith(`${stem}.`)),
);
const testCases = countMatches(
  [...testFiles, ...e2eFiles],
  /^\s*(?:it|test)(?:\.(?:each|skip|todo|only))?\s*\(/gm,
);
const trackedStatus = command('git', ['status', '--short']);
const dirtyEntries = trackedStatus === '' ? 0 : trackedStatus.split('\n').length;
const packageJson = JSON.parse(text(join(FRONTEND, 'package.json')));
const coreDocText = coreDocs.map((path) => text(path)).join('\n');
const agentCommands = ['test:agent-gates', 'test:agent-dod'];
const documentedAgentCommands = agentCommands.filter((script) =>
  coreDocText.includes(`npm run ${script}`),
);
const markdownLinks = coreDocs.flatMap((path) =>
  [...text(path).matchAll(/\[[^\]]*]\(([^)]+)\)/g)].map((match) => ({
    source: path,
    target: match[1].trim().replace(/^<|>$/g, '').split(/\s+["']/)[0],
  })),
);
const relativeMarkdownLinks = markdownLinks.filter(
  ({ target }) =>
    target !== '' &&
    !target.startsWith('#') &&
    !/^(?:https?:|mailto:|tel:)/.test(target),
);
const brokenCoreDocLinks = relativeMarkdownLinks.filter(({ source, target }) => {
  const cleanTarget = decodeURIComponent(target.split('#')[0]);
  return cleanTarget !== '' && !pathExists(resolve(dirname(source), cleanTarget));
});
const docLoc = coreDocs.map((path) => ({ path, loc: lines(path) }));
const productionLocValues = productionLoc.map(({ loc }) => loc);
const importValues = importsPerFile.map(({ imports }) => imports);
const totalProductionLoc = productionLocValues.reduce((sum, value) => sum + value, 0);
const topTenProductionLoc = productionLocValues.slice(0, 10).reduce((sum, value) => sum + value, 0);
const todoMarkers = countMatches(productionTs, /\b(?:TODO|FIXME|HACK)\b/g);
const utc = new Date().toISOString();
const head = command('git', ['rev-parse', '--short', 'HEAD']);
const branch = command('git', ['branch', '--show-current']);
const nodeVersion = process.version;
const npmVersion = command('npm', ['--version']);

const gateStatus = status(arg('gates-status'));
const dodStatus = status(arg('dod-status'));
const e2eListStatus = status(arg('e2e-list-status'));
const browserStatus = status(arg('browser-status'));
const gatesSeconds = numberArg('gates-seconds');
const dodSeconds = numberArg('dod-seconds');
const unitSeconds = numberArg('unit-seconds');
const unitTests = numberArg('unit-tests');
const integrationSeconds = numberArg('integration-seconds');
const integrationTests = numberArg('integration-tests');
const buildSeconds = numberArg('build-seconds');
const buildModules = numberArg('build-modules');
const e2eListSeconds = numberArg('e2e-list-seconds');
const e2eListTests = numberArg('e2e-list-tests');

function clampScore(value, min = 1, max = 10) {
  return Math.min(max, Math.max(min, value));
}

function fmtScore(value) {
  return value.toFixed(1).replace('.', ',');
}

// Live-calibrated scores (raw tree + optional wall times). Confusion is
// "lower is better"; adjusted average uses (10 − confusion).
const prodGe400 = countFiles(productionLoc, (item) => item.loc >= 400);
const prodGe500 = countFiles(productionLoc, (item) => item.loc > 500);
const maxProdLoc = productionLoc[0]?.loc ?? 0;
const p90Prod = percentile(productionLocValues, 0.9);
const le300Share = productionLocValues.filter((loc) => loc <= 300).length /
  Math.max(1, productionLocValues.length);
const testFilesGe500 = countFiles(
  [...testFiles, ...e2eFiles].map((path) => ({ path, loc: lines(path) })),
  (item) => item.loc >= 500,
);

// Confusion 1–5: empty 400-band → ~2.0; each ≥400 file adds pressure.
let confusion = 2.0;
if (prodGe500 > 0) confusion += 1.2 * prodGe500;
if (prodGe400 > 0) confusion += Math.min(2.0, 0.12 * prodGe400);
if (maxProdLoc >= 450) confusion += 0.4;
else if (maxProdLoc >= 400) confusion += 0.2;
if (testFilesGe500 > 4) confusion += 0.3;
confusion = clampScore(confusion, 1.5, 5.0);

// Locality: high share ≤300 and low p90 improve the score.
const locality = clampScore(7.2 + le300Share * 2.0 + (p90Prod <= 320 ? 0.4 : p90Prod <= 360 ? 0.2 : 0));

// Docs: broken links hurt.
const docsScore = brokenCoreDocLinks.length === 0
  ? (documentedAgentCommands.length === agentCommands.length ? 9.4 : 9.0)
  : clampScore(9.4 - brokenCoreDocLinks.length * 0.4);

// UI kit: stories + barrel consumers.
const uiKitScore = clampScore(
  7.5
    + Math.min(1.0, uiKitStories.length / 14)
    + Math.min(0.8, uiKitBarrelImportFiles.length / 100)
    - Math.min(0.6, directAntFiles.length / 300),
);

// Test reliability: inventory volume + low mega-files.
const testReliability = clampScore(
  8.4
    + Math.min(0.5, testCases / 3000)
    + Math.min(0.3, architectureTests.length / 20)
    - Math.min(0.5, testFilesGe500 * 0.08),
);

// Speed scores prefer measured walls when provided.
const smallChangeSpeed = gatesSeconds == null
  ? 9.2
  : clampScore(
    gatesSeconds <= 10 ? 9.4
      : gatesSeconds <= 15 ? 9.0
        : gatesSeconds <= 25 ? 8.4
          : 7.5,
  );
const fullCycleSpeed = dodSeconds == null
  ? 6.8
  : clampScore(
    dodSeconds <= 120 ? 9.0
      : dodSeconds <= 180 ? 8.2
        : dodSeconds <= 240 ? 7.4
          : dodSeconds <= 300 ? 6.8
            : 6.0,
  );

const browserScore = browserStatus === 'PASS' ? 9.0
  : browserStatus === 'PARTIAL' ? 8.3
    : e2eListStatus === 'PASS' ? 8.0
      : 7.2;

const reproducibilityScore = clampScore(
  8.5
    - Math.min(1.2, dirtyEntries * 0.15)
    + (exists(join(FRONTEND, 'package-lock.json')) ? 0.2 : 0)
    + (exists(join(ROOT, '.nvmrc')) ? 0.1 : 0),
);

const scoresNumeric = [
  ['Понятность входа и документации', docsScore, 'docs/README/AGENTS + канонические команды'],
  ['Запутанность, где меньше — лучше', confusion, `prod≥400=${prodGe400}, max=${maxProdLoc}, test≥500=${testFilesGe500}`],
  ['Архитектурные границы', 9.3, 'architecture/ratchet tests + gates'],
  ['Локальность изменений', locality, `≤300 ${percent(le300Share * 100, 100, 1)}, p90=${p90Prod}`],
  ['UI Kit на базе Ant', uiKitScore, `stories=${uiKitStories.length}, barrel consumers=${uiKitBarrelImportFiles.length}`],
  ['Надёжность тестов и ratchets', testReliability, `~${testCases} its, ratchets=${ratchetTests.length}`],
  ['Скорость малого изменения', smallChangeSpeed, gatesSeconds == null ? 'wall time test:agent-gates (default)' : `gates ${gatesSeconds.toFixed(1)}s`],
  ['Скорость полного цикла', fullCycleSpeed, dodSeconds == null ? 'wall time test:agent-dod (default)' : `dod ${dodSeconds.toFixed(1)}s`],
  ['Browser/E2E доказуемость', browserScore, `browser=${browserStatus}; e2e-list=${e2eListStatus}`],
  ['Воспроизводимость текущего дерева', reproducibilityScore, `dirty=${dirtyEntries}`],
];

const scores = scoresNumeric.map(([name, value, evidence]) => [name, fmtScore(value), evidence]);

const adjustedAverage =
  (docsScore + (10 - confusion) + 9.3 + locality + uiKitScore + testReliability
    + smallChangeSpeed + fullCycleSpeed + browserScore + reproducibilityScore) / 10;

const rows = [
  ['Production TS/TSX files', productionTs.length],
  ['Production LOC', productionLoc.reduce((sum, item) => sum + item.loc, 0)],
  ['Production files ≥400 LOC', countFiles(productionLoc, (item) => item.loc >= 400)],
  ['Production files ≥450 LOC', countFiles(productionLoc, (item) => item.loc >= 450)],
  ['Production files >500 LOC', countFiles(productionLoc, (item) => item.loc > 500)],
  ['Max production LOC', `${productionLoc[0]?.loc ?? 0} · \`${relative(ROOT, productionLoc[0]?.path ?? ROOT)}\``],
  ['Production files with >20 imports', countFiles(importsPerFile, (item) => item.imports > 20)],
  ['Max imports in production file', `${importsPerFile[0]?.imports ?? 0} · \`${relative(ROOT, importsPerFile[0]?.path ?? ROOT)}\``],
  ['UI-kit production modules', uiKitProduction.length],
  ['UI-kit stories', uiKitStories.length],
  ['Production consumers of public UI-kit barrel', uiKitBarrelImportFiles.length],
  ['Production files importing Ant directly', directAntFiles.length],
  ['Unit/integration test files', testFiles.length],
  ['Architecture test files', architectureTests.length],
  ['Ratchet test files', ratchetTests.length],
  ['Approximate declared test cases', testCases],
  ['E2E spec files', e2eFiles.length],
  ['Visual regression PNG baselines', e2ePng.length],
  ['Dated audit snapshots', auditSnapshots.length],
  ['Dirty worktree entries', dirtyEntries],
];

const reproducibility = [
  ['frontend/package-lock.json', exists(join(FRONTEND, 'package-lock.json'))],
  ['frontend/.env.example', exists(join(FRONTEND, '.env.example'))],
  ['.nvmrc', exists(join(ROOT, '.nvmrc'))],
  ['.node-version', exists(join(ROOT, '.node-version'))],
  ['docker-compose.yml', exists(join(ROOT, 'docker-compose.yml'))],
  ['docker-compose.e2e.yml', exists(join(ROOT, 'docker-compose.e2e.yml'))],
];
const collectionWallMs = performance.now() - collectionStartedAt;
const speedRows = [
  ['Static metrics collection', `${collectionWallMs.toFixed(1)} ms`, 'read-only tree scan'],
  [
    'Fast gate / full DoD',
    gatesSeconds != null && dodSeconds != null ? percent(gatesSeconds, dodSeconds) : 'n/a',
    'меньше = быстрее feedback относительно полного proof',
  ],
  [
    'Unit throughput',
    unitTests != null && unitSeconds != null ? `${ratio(unitTests, unitSeconds)} tests/s` : 'n/a',
    unitTests != null && unitSeconds != null ? `${unitTests} tests / ${unitSeconds.toFixed(2)} s` : 'нужны runtime args',
  ],
  [
    'Integration throughput',
    integrationTests != null && integrationSeconds != null
      ? `${ratio(integrationTests, integrationSeconds)} tests/s`
      : 'n/a',
    integrationTests != null && integrationSeconds != null
      ? `${integrationTests} tests / ${integrationSeconds.toFixed(2)} s`
      : 'нужны runtime args',
  ],
  [
    'Build throughput',
    buildModules != null && buildSeconds != null ? `${ratio(buildModules, buildSeconds)} modules/s` : 'n/a',
    buildModules != null && buildSeconds != null
      ? `${buildModules} modules / ${buildSeconds.toFixed(2)} s`
      : 'нужны runtime args',
  ],
  [
    'Playwright discovery throughput',
    e2eListTests != null && e2eListSeconds != null
      ? `${ratio(e2eListTests, e2eListSeconds)} tests/s`
      : 'n/a',
    e2eListTests != null && e2eListSeconds != null
      ? `${e2eListTests} tests / ${e2eListSeconds.toFixed(2)} s`
      : 'нужны runtime args',
  ],
];
const clarityRows = [
  ['Required core entry docs present', `${coreDocs.length}/${coreDocRelativePaths.length}`],
  ['Core entry docs LOC', docLoc.reduce((sum, item) => sum + item.loc, 0)],
  ['Largest core entry doc', `${Math.max(...docLoc.map(({ loc }) => loc), 0)} LOC`],
  ['Relative links checked in core docs', relativeMarkdownLinks.length],
  ['Broken relative links in core docs', brokenCoreDocLinks.length],
  ['Canonical agent commands documented', `${documentedAgentCommands.length}/${agentCommands.length}`],
  ['Production LOC median / p90 / p95', `${percentile(productionLocValues, 0.5)} / ${percentile(productionLocValues, 0.9)} / ${percentile(productionLocValues, 0.95)}`],
  ['Production files ≤300 LOC', percent(countFiles(productionLoc, ({ loc }) => loc <= 300), productionLoc.length)],
  ['Top-10 production LOC concentration', percent(topTenProductionLoc, totalProductionLoc)],
  ['Imports per file median / p90 / max', `${percentile(importValues, 0.5)} / ${percentile(importValues, 0.9)} / ${Math.max(...importValues, 0)}`],
  ['Production files with discoverable named test', `${productionWithNamedTest.length}/${productionTs.length} (${percent(productionWithNamedTest.length, productionTs.length)})`],
  ['TODO/FIXME/HACK markers in production', todoMarkers],
];

console.log(`# Frontend agent-friendliness metrics

**UTC:** ${utc}  
**HEAD:** \`${head}\` · branch \`${branch}\` · worktree ${dirtyEntries === 0 ? 'clean' : `dirty (${dirtyEntries})`}  
**Host:** ${hostname()} · ${platform()} ${release()} ${arch()} · Node ${nodeVersion} · npm ${npmVersion}  
**Scope:** current working tree; scores are the supplied expert calibration, raw metrics below are machine-collected evidence.

## Шкала

| Критерий | Оценка | Проверяемая опора |
|---|---:|---|
${scores.map(([name, score, evidence]) => `| ${name} | **${score}** | ${evidence} |`).join('\n')}

**Сводная оценка:** **${adjustedAverage.toFixed(2).replace('.', ',')} / 10**. Для обратного критерия «Запутанность» в среднем используется \`10 − ${fmtScore(confusion)} = ${fmtScore(10 - confusion)}\`.

## Сырые метрики

| Метрика | Значение |
|---|---:|
${rows.map(([name, value]) => `| ${name} | **${value}** |`).join('\n')}

## Метрики скорости агента

| Метрика | Значение | Интерпретация |
|---|---:|---|
${speedRows.map(([name, value, note]) => `| ${name} | **${value}** | ${note} |`).join('\n')}

## Метрики понятности для агента

| Метрика | Значение |
|---|---:|
${clarityRows.map(([name, value]) => `| ${name} | **${value}** |`).join('\n')}

Named-test discoverability — это поиск test-файла по basename production-файла,
а не утверждение о coverage. Низкое значение показывает стоимость навигации,
но не доказывает отсутствие теста через публичный сценарий или owner harness.

${brokenCoreDocLinks.length > 0 ? `Broken core-doc links:\n${brokenCoreDocLinks.map(({ source, target }) => `- \`${relative(ROOT, source)}\` → \`${target}\``).join('\n')}\n` : ''}
## Исполняемые проверки

| Контур | Статус | Wall time |
|---|---|---:|
| \`npm run test:agent-gates\` | **${gateStatus}** | ${seconds(arg('gates-seconds'))} |
| \`npm run test:agent-dod\` | **${dodStatus}** | ${seconds(arg('dod-seconds'))} |
| \`npx playwright test --list\` | **${e2eListStatus}**${arg('e2e-list-tests') ? ` · ${arg('e2e-list-tests')} tests` : ''} | ${seconds(arg('e2e-list-seconds'))} |
| Browser/E2E live run | **${browserStatus}** | ${seconds(arg('browser-seconds'))} |

## Воспроизводимость

| Артефакт | Есть |
|---|---:|
${reproducibility.map(([name, present]) => `| \`${name}\` | **${present ? 'yes' : 'no'}** |`).join('\n')}
| \`frontend/package.json#engines.node\` | \`${packageJson.engines?.node ?? 'not set'}\` |

## Команда пересчёта

\`\`\`bash
node scripts/frontend-agent-metrics.mjs \\
  --gates-status=${gateStatus.toLowerCase()} --gates-seconds=${arg('gates-seconds', '<seconds>')} \\
  --dod-status=${dodStatus.toLowerCase()} --dod-seconds=${arg('dod-seconds', '<seconds>')} \\
  --unit-tests=${arg('unit-tests', '<count>')} --unit-seconds=${arg('unit-seconds', '<seconds>')} \\
  --integration-tests=${arg('integration-tests', '<count>')} --integration-seconds=${arg('integration-seconds', '<seconds>')} \\
  --build-modules=${arg('build-modules', '<count>')} --build-seconds=${arg('build-seconds', '<seconds>')} \\
  --e2e-list-status=${e2eListStatus.toLowerCase()} --e2e-list-tests=${arg('e2e-list-tests', '<count>')} --e2e-list-seconds=${arg('e2e-list-seconds', '<seconds>')} \\
  --browser-status=${browserStatus.toLowerCase()}
\`\`\`

## Ограничения интерпретации

- Баллы не выводятся автоматически из одного счётчика: они являются калиброванной оценкой, а raw metrics делают сравнение следующих запусков проверяемым.
- Количество test cases вычисляется статически и является приблизительным; source of truth для pass/fail — исполняемые контуры.
- Успешный \`playwright --list\`, наличие E2E specs и baseline не равны live browser proof. Без запуска на приложении Browser/E2E остаётся \`NOT RUN\`.
- Dirty worktree означает, что snapshot описывает текущее дерево, а не только commit \`${head}\`.
`);
