// @vitest-environment node
/**
 * AF100-09b — the antd pre-bundle contract.
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
 * This is why the optimizer is scoped to `unit`: two `integration` files call
 * `vi.importActual('react-router-dom')`, and neither `optimizer.exclude` nor
 * `server.deps.inline` rescues them (both measured).
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

const viteConfig = fs.readFileSync(path.join(FRONTEND_ROOT, 'vite.config.ts'), 'utf8');
const optimizerBlock = viteConfig.slice(viteConfig.indexOf('const depsOptimizer'));

const FEEDBACK_BOUNDARY = '@/feedback/appFeedback';

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
const unitTestFiles = listTestFiles(UNIT_TESTS_ROOT).filter((file) => file !== GUARD_SELF);
const relative = (file: string) => path.relative(FRONTEND_ROOT, file);

describe('AF100-09b — antd optimizer contract', () => {
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

  it('every project keeps per-file isolation', () => {
    // The whole point of pre-bundling is that it buys speed *without* touching
    // isolation. `isolate: false` is ~2x faster still and was rejected: hoisted
    // mocks in the electrical harness, zustand singletons, the cached
    // `typeof window` branch in api/client.ts and Ant/CSS-in-JS module caches
    // would all start leaking between files, turning order into a hidden input.
    const projectNames = ['unit', 'integration', 'elec-integration'];
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
      `each of ${projectNames.join('/')} must declare isolate explicitly`,
    ).toBe(projectNames.length);
    expect(
      declared,
      'Pre-bundling must never be traded for isolation: without it, test files '
        + 'share module and mock state and results become order-dependent.',
    ).toEqual(projectNames.map(() => 'true'));
  });

  it('stays scoped to the unit project', () => {
    const unitBlock = viteConfig.slice(viteConfig.indexOf("name: 'unit'"), viteConfig.indexOf("name: 'integration'"));
    expect(unitBlock, 'the unit project must receive the optimizer').toContain('deps: depsOptimizer');

    const afterUnit = viteConfig.slice(viteConfig.indexOf("name: 'integration'"));
    expect(
      afterUnit.includes('deps: depsOptimizer'),
      'integration and elec-integration must stay unoptimized: they call '
        + "vi.importActual('react-router-dom'), which cannot resolve against a pre-bundle.",
    ).toBe(false);
  });

  it('no unit test reads a pre-bundled package for real', () => {
    const offenders = unitTestFiles
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
