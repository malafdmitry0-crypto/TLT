// @vitest-environment node
/**
 * AF100-09b / -09c — the pre-bundle contract and the project split it forces.
 *
 * Measured on `825e4f6`: importing `antd` cost ~1.3 s per test file no matter how
 * little of it the file used (import 89.7 s across 287 unit files). Pre-bundling
 * it once cuts that to 33.6 s while keeping per-file isolation intact — unlike
 * `isolate: false`, which is faster still but lets module and mock state leak
 * between files.
 *
 * Three separate things can silently undo or break this, so all three are pinned:
 *
 * 1. **A wrong optimizer key.** Vitest 4 uses `client`/`ssr`; the Vitest 2/3 name
 *    was `web`. An unknown key is not an error — the option is silently ignored
 *    and the suite just runs slow again. This produced a false-negative
 *    measurement during the slice.
 * 2. **Optimizing `@ant-design/icons`.** Pre-bundling it makes named icon exports
 *    resolve to `undefined` (`ReloadOutlined`), surfacing far away as
 *    `Element type is invalid` inside an unrelated component's render.
 * 3. **`vi.importActual` of a pre-bundled package.** Resolution dies with
 *    `Cannot find module .../deps/antd.js&v=<hash>`. Plain `vi.mock` factories
 *    are fine — the 10 unit files mocking `@glideapps/glide-data-grid` run
 *    pre-bundled without trouble. Only reading the *real* module breaks.
 *
 * AF100-09c turned that constraint into the project layout: a test that reads a
 * real vendor module lives in an unoptimized project, everything else
 * pre-bundles. `integration-unoptimized` exists solely for the two files calling
 * `vi.importActual('react-router-dom')`; `elec-integration` is blocked at its
 * shared setupFile, which reads the real `react`. Neither `optimizer.exclude`,
 * `server.deps.inline`, nor the factory's `importOriginal` parameter rescues
 * them (all three measured).
 *
 * Splitting projects introduces its own silent failure: a project that no npm
 * script names never runs, and the suite reports green without it. That is
 * pinned here too.
 *
 * See: docs/frontend/agent-friendly-10-plan.md §2.1
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const UNIT_TESTS_ROOT = path.join(FRONTEND_ROOT, 'src/__tests__/unit');
const INTEGRATION_TESTS_ROOT = path.join(FRONTEND_ROOT, 'src/__tests__/integration');
const ELECTRICAL_TESTS_ROOT = path.join(INTEGRATION_TESTS_ROOT, 'pages/electrical');

const viteConfig = fs.readFileSync(path.join(FRONTEND_ROOT, 'vite.config.ts'), 'utf8');
const optimizerBlock = viteConfig.slice(viteConfig.indexOf('const depsOptimizer'));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(FRONTEND_ROOT, 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };

const FEEDBACK_BOUNDARY = '@/feedback/appFeedback';

/** Projects that pre-bundle, and therefore may not read a real vendor module. */
const OPTIMIZED_PROJECTS = ['unit', 'integration'];
/** Projects deliberately left on the plain pipeline. */
const UNOPTIMIZED_PROJECTS = ['integration-unoptimized', 'elec-integration'];
const ALL_PROJECTS = [...OPTIMIZED_PROJECTS, ...UNOPTIMIZED_PROJECTS];

/** Vitest 4 optimizer keys. Anything else is accepted by the loader and ignored. */
const VALID_OPTIMIZER_KEYS = ['client', 'ssr'];
const RETIRED_OPTIMIZER_KEYS = ['web'];

/** `vi.importActual('<bare package>')` — a relative or aliased path is fine. */
const BARE_IMPORT_ACTUAL = /vi\.importActual(?:<[^>]*>)?\(\s*['"]([^'".@/][^'"]*|@[^'"/]+\/[^'"]+)['"]/g;

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTestFiles(full));
    else if (/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Packages a file reads for real — the operation pre-bundling cannot serve. */
export function bareImportActualTargets(source: string): string[] {
  return [...source.matchAll(BARE_IMPORT_ACTUAL)].map((match) => match[1]);
}

/** This guard quotes the forbidden calls in its own docs, fixtures and messages. */
const GUARD_SELF = fileURLToPath(import.meta.url);
const relative = (file: string) => path.relative(FRONTEND_ROOT, file);

/** The `integration-unoptimized` include list, read from the config itself. */
const unoptimizedIntegrationFiles = (
  viteConfig.match(/const INTEGRATION_UNOPTIMIZED = \[([\s\S]*?)\]/)?.[1] ?? ''
)
  .split('\n')
  .map((line) => line.trim().replace(/^'|',?$/g, ''))
  .filter((line) => line.endsWith('.tsx') || line.endsWith('.ts'))
  .map((rel) => path.join(FRONTEND_ROOT, rel));

/** Test files that actually run pre-bundled — the ones the contract binds. */
const optimizedTestFiles = [
  ...listTestFiles(UNIT_TESTS_ROOT),
  ...listTestFiles(INTEGRATION_TESTS_ROOT).filter(
    (file) =>
      !file.startsWith(ELECTRICAL_TESTS_ROOT) && !unoptimizedIntegrationFiles.includes(file),
  ),
].filter((file) => file !== GUARD_SELF);

describe('AF100-09b/-09c — pre-bundle contract and project layout', () => {
  it('the optimizer is enabled for antd', () => {
    expect(optimizerBlock, 'antd must stay pre-bundled or the import tax returns').toMatch(
      /enabled:\s*true[\s\S]*?include:\s*\[[^\]]*'antd'/,
    );
  });

  it('uses a Vitest 4 optimizer key, not the silently-ignored legacy one', () => {
    const usedKey = VALID_OPTIMIZER_KEYS.find((key) => new RegExp(`\\b${key}:\\s*\\{`).test(optimizerBlock));
    expect(usedKey, `optimizer must use one of ${VALID_OPTIMIZER_KEYS.join('/')}`).toBeDefined();

    for (const retired of RETIRED_OPTIMIZER_KEYS) {
      expect(
        new RegExp(`\\b${retired}:\\s*\\{`).test(optimizerBlock),
        `\`${retired}\` is a Vitest 2/3 key. Vitest 4 ignores it without warning, so the `
          + 'suite silently loses the pre-bundle and simply runs slow again.',
      ).toBe(false);
    }
  });

  it('does not pre-bundle @ant-design/icons', () => {
    const includeList = optimizerBlock.match(/include:\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(
      includeList.includes('@ant-design/icons'),
      'Pre-bundling @ant-design/icons resolves named icon exports to `undefined` '
        + '(ReloadOutlined), which fails as `Element type is invalid` in whatever '
        + 'component happens to render the icon.',
    ).toBe(false);
  });

  it('the pre-bundle is written inside node_modules', () => {
    // Left at its default the optimizer materialises `frontend/.vite/deps/`.
    // That path is gitignored, so nothing shows up in `git status` — but
    // `eslint .` still walks it and vendor bundles fail `no-undef`, turning the
    // lint gate red for third-party code. Observed on this slice.
    const cacheDir = viteConfig.match(/cacheDir:\s*'([^']+)'/)?.[1];
    expect(cacheDir, 'cacheDir must be pinned, not left to default').toBeDefined();
    expect(
      cacheDir?.startsWith('node_modules/'),
      `cacheDir is "${cacheDir}" — the pre-bundle must stay inside node_modules so it is `
        + 'invisible to lint and to repo-root hygiene.',
    ).toBe(true);
  });

  it('every declared project is actually executed by test:integration or test:unit', () => {
    // A project that no script names is a project whose tests silently stop
    // running: vitest reports green because it never looked at them.
    const declaredNames = [...viteConfig.matchAll(/name:\s*'([a-z-]+)'/g)].map((m) => m[1]);
    expect(declaredNames.sort(), 'config projects changed — update this contract').toEqual(
      [...ALL_PROJECTS].sort(),
    );

    const integrationScript = packageJson.scripts['test:integration'];
    for (const project of ALL_PROJECTS.filter((name) => name !== 'unit')) {
      expect(
        integrationScript,
        `test:integration must run --project ${project}, otherwise its files never execute `
          + 'and the suite reports green without them.',
      ).toContain(`--project ${project}`);
    }
  });

  it('every project keeps per-file isolation', () => {
    // The whole point of pre-bundling is that it buys speed *without* touching
    // isolation. `isolate: false` is ~2x faster still and was rejected: hoisted
    // mocks in the electrical harness, zustand singletons, the cached
    // `typeof window` branch in api/client.ts and Ant/CSS-in-JS module caches
    // would all start leaking between files, turning order into a hidden input.
    const declared = viteConfig
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('*') && !trimmed.startsWith('//');
      })
      .map((line) => line.match(/\bisolate:\s*(true|false)\b/)?.[1])
      .filter((value): value is string => value !== undefined);

    expect(
      declared.length,
      `each of ${ALL_PROJECTS.join('/')} must declare isolate explicitly`,
    ).toBe(ALL_PROJECTS.length);
    expect(
      declared,
      'Pre-bundling must never be traded for isolation: without it, test files '
        + 'share module and mock state and results become order-dependent.',
    ).toEqual(ALL_PROJECTS.map(() => 'true'));
  });

  it('exactly the intended projects are optimized', () => {
    for (const project of ALL_PROJECTS) {
      const start = viteConfig.indexOf(`name: '${project}'`);
      expect(start, `project ${project} must exist in the config`).toBeGreaterThan(-1);
      // A project block ends where the next `name:` begins.
      const rest = viteConfig.slice(start + 1);
      const nextName = rest.search(/name:\s*'[a-z-]+'/);
      const block = nextName === -1 ? rest : rest.slice(0, nextName);
      const optimized = block.includes('deps: depsOptimizer');

      expect(
        optimized,
        OPTIMIZED_PROJECTS.includes(project)
          ? `${project} must stay pre-bundled or its import tax returns`
          : `${project} must stay on the plain pipeline — it reads a real vendor module `
            + 'via vi.importActual, which cannot resolve against a pre-bundle.',
      ).toBe(OPTIMIZED_PROJECTS.includes(project));
    }
  });

  it('the unoptimized list matches the files that actually need it', () => {
    expect(unoptimizedIntegrationFiles.length, 'INTEGRATION_UNOPTIMIZED must be parseable').toBeGreaterThan(0);

    for (const file of unoptimizedIntegrationFiles) {
      expect(fs.existsSync(file), `${relative(file)} is listed but does not exist`).toBe(true);
      expect(
        bareImportActualTargets(fs.readFileSync(file, 'utf8')).length,
        `${relative(file)} no longer reads a real vendor module — move it back into the `
          + 'optimized `integration` project instead of paying the import tax for nothing.',
      ).toBeGreaterThan(0);
    }
  });

  it('no test in an optimized project reads a pre-bundled package for real', () => {
    const offenders = optimizedTestFiles
      .map((file) => ({ file, targets: bareImportActualTargets(fs.readFileSync(file, 'utf8')) }))
      .filter((entry) => entry.targets.length > 0);

    expect(
      offenders.map(({ file, targets }) => `${relative(file)} → ${targets.join(', ')}`),
      'Reading the real module of a pre-bundled package fails with\n'
        + '`Cannot find module .../deps/<pkg>.js&v=<hash>`.\n'
        + 'Plain `vi.mock` factories are fine; only importActual breaks.\n'
        + `For antd feedback, production imports from \`${FEEDBACK_BOUNDARY}\` — mock that boundary:\n`
        + `  vi.mock('${FEEDBACK_BOUNDARY}', async () => {\n`
        + `    const actual = await vi.importActual<typeof import('${FEEDBACK_BOUNDARY}')>('${FEEDBACK_BOUNDARY}');\n`
        + '    return { ...actual, appMessage: { ...actual.appMessage, warning } };\n'
        + '  });',
    ).toEqual([]);
  });

  it('the feedback boundary still exports what those mocks replace', () => {
    const boundary = fs.readFileSync(path.join(FRONTEND_ROOT, 'src/feedback/appFeedback.ts'), 'utf8');
    expect(boundary, 'mocks target `appMessage`; it must remain exported').toMatch(/appMessage/);
  });

  it('detects a bare importActual and ignores a local one (failure path)', () => {
    const bare = "const actual = await vi.importActual<typeof import('antd')>('antd');";
    const local = `const actual = await vi.importActual<typeof import('${FEEDBACK_BOUNDARY}')>('${FEEDBACK_BOUNDARY}');`;
    const relativePath = "const actual = await vi.importActual('./helpers');";

    expect(bareImportActualTargets(bare)).toEqual(['antd']);
    expect(bareImportActualTargets(local)).toEqual([]);
    expect(bareImportActualTargets(relativePath)).toEqual([]);
  });
});
