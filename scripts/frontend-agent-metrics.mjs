#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { hostname, platform, release, arch } from 'node:os';
import { extname, join, relative } from 'node:path';
import process from 'node:process';

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
const testCases = countMatches(
  [...testFiles, ...e2eFiles],
  /^\s*(?:it|test)(?:\.(?:each|skip|todo|only))?\s*\(/gm,
);
const trackedStatus = command('git', ['status', '--short']);
const dirtyEntries = trackedStatus === '' ? 0 : trackedStatus.split('\n').length;
const packageJson = JSON.parse(text(join(FRONTEND, 'package.json')));
const utc = new Date().toISOString();
const head = command('git', ['rev-parse', '--short', 'HEAD']);
const branch = command('git', ['branch', '--show-current']);
const nodeVersion = process.version;
const npmVersion = command('npm', ['--version']);

const scores = [
  ['Понятность входа и документации', '9,4', 'docs/README/AGENTS + канонические команды'],
  ['Запутанность, где меньше — лучше', '3,0', 'LOC и import-context'],
  ['Архитектурные границы', '9,3', 'architecture/ratchet tests + gates'],
  ['Локальность изменений', '8,2', 'размер production-контекстов'],
  ['UI Kit на базе Ant', '8,7', 'kit modules/stories + public barrel usage'],
  ['Надёжность тестов и ratchets', '9,0', 'test inventory + повторяемые gates'],
  ['Скорость малого изменения', '9,2', 'wall time test:agent-gates'],
  ['Скорость полного цикла', '6,8', 'wall time test:agent-dod'],
  ['Browser/E2E доказуемость', '8,0', 'specs/baselines; live run отдельно'],
  ['Воспроизводимость текущего дерева', '7,8', 'lockfiles/toolchain/worktree state'],
];

const adjustedAverage =
  (9.4 + (10 - 3.0) + 9.3 + 8.2 + 8.7 + 9.0 + 9.2 + 6.8 + 8.0 + 7.8) / 10;

const gateStatus = status(arg('gates-status'));
const dodStatus = status(arg('dod-status'));
const e2eListStatus = status(arg('e2e-list-status'));
const browserStatus = status(arg('browser-status'));

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

console.log(`# Frontend agent-friendliness metrics

**UTC:** ${utc}  
**HEAD:** \`${head}\` · branch \`${branch}\` · worktree ${dirtyEntries === 0 ? 'clean' : `dirty (${dirtyEntries})`}  
**Host:** ${hostname()} · ${platform()} ${release()} ${arch()} · Node ${nodeVersion} · npm ${npmVersion}  
**Scope:** current working tree; scores are the supplied expert calibration, raw metrics below are machine-collected evidence.

## Шкала

| Критерий | Оценка | Проверяемая опора |
|---|---:|---|
${scores.map(([name, score, evidence]) => `| ${name} | **${score}** | ${evidence} |`).join('\n')}

**Сводная оценка:** **${adjustedAverage.toFixed(2).replace('.', ',')} / 10**. Для обратного критерия «Запутанность» в среднем используется \`10 − 3,0 = 7,0\`.

## Сырые метрики

| Метрика | Значение |
|---|---:|
${rows.map(([name, value]) => `| ${name} | **${value}** |`).join('\n')}

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
  --e2e-list-status=${e2eListStatus.toLowerCase()} --e2e-list-tests=${arg('e2e-list-tests', '<count>')} --e2e-list-seconds=${arg('e2e-list-seconds', '<seconds>')} \\
  --browser-status=${browserStatus.toLowerCase()}
\`\`\`

## Ограничения интерпретации

- Баллы не выводятся автоматически из одного счётчика: они являются калиброванной оценкой, а raw metrics делают сравнение следующих запусков проверяемым.
- Количество test cases вычисляется статически и является приблизительным; source of truth для pass/fail — исполняемые контуры.
- Успешный \`playwright --list\`, наличие E2E specs и baseline не равны live browser proof. Без запуска на приложении Browser/E2E остаётся \`NOT RUN\`.
- Dirty worktree означает, что snapshot описывает текущее дерево, а не только commit \`${head}\`.
`);
