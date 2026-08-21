// @vitest-environment node
/**
 * AF100-09a — per-file harness tax, kept honest.
 *
 * Measured on `02dc019` (287 unit files): every file paid a flat ~262 ms to
 * construct jsdom plus ~110 ms to run the shared setup, regardless of whether it
 * touched the DOM at all. Median collect was 20 ms — the harness cost more than
 * the work. Files that need no DOM opt out with `// @vitest-environment node`
 * and pay neither.
 *
 * The danger is silent, not loud: a file whose import graph branches on
 * `typeof window` still *passes* under `node`, it just takes the other branch.
 * `src/api/client.ts` does exactly that (auth redirect + CSRF cookie), which is
 * why the 27 files reaching it stayed on jsdom.
 *
 * This guard proves every node-environment file is genuinely DOM-free, so the
 * speed-up can never be bought with a quietly different code path.
 *
 * See: docs/frontend/agent-friendly-10-plan.md §2.1
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const SRC_ROOT = path.join(FRONTEND_ROOT, 'src');
const TESTS_ROOT = path.join(SRC_ROOT, '__tests__');

const NODE_DOCBLOCK = '// @vitest-environment node';
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Reading `window`/`document` under `node` throws loudly, so it needs no guard.
 * Branching on their *absence* does not — it silently selects another path.
 */
const ENVIRONMENT_BRANCH_PATTERNS: ReadonlyArray<RegExp> = [
  /typeof\s+window\b/,
  /typeof\s+document\b/,
  /typeof\s+navigator\b/,
  /typeof\s+globalThis\s*\.\s*window\b/,
  /['"`]window['"`]\s*in\s+globalThis\b/,
  /import\.meta\.env\.SSR\b/,
];

const LOCAL_IMPORT_PATTERN = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

/** Resolve only first-party specifiers; bare packages are not our code to police. */
function resolveLocalImport(specifier: string, fromFile: string, srcRoot: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = path.join(srcRoot, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;

  for (const extension of ['', ...RESOLVE_EXTENSIONS]) {
    const candidate = base + extension;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  for (const extension of RESOLVE_EXTENSIONS) {
    const candidate = path.join(base, `index${extension}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Transitive first-party import graph, entry file included. */
export function localImportGraph(entry: string, srcRoot: string): Set<string> {
  const seen = new Set<string>();
  const pending = [entry];

  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    let code: string;
    try {
      code = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const match of code.matchAll(LOCAL_IMPORT_PATTERN)) {
      const resolved = resolveLocalImport(match[1], file, srcRoot);
      if (resolved !== null && !seen.has(resolved)) pending.push(resolved);
    }
  }

  return seen;
}

export interface EnvironmentBranch {
  file: string;
  line: number;
  code: string;
}

/** This guard declares the branch patterns as regex literals; it does not branch on them. */
const GUARD_SELF = fileURLToPath(import.meta.url);

function environmentBranchesIn(file: string): EnvironmentBranch[] {
  if (file === GUARD_SELF) return [];

  let code: string;
  try {
    code = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const hits: EnvironmentBranch[] = [];
  code.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (ENVIRONMENT_BRANCH_PATTERNS.some((pattern) => pattern.test(line))) {
      hits.push({ file, line: index + 1, code: trimmed.slice(0, 100) });
    }
  });
  return hits;
}

/** Every environment branch reachable from a node-environment entry file. */
export function environmentBranchesReachableFrom(entry: string, srcRoot: string): EnvironmentBranch[] {
  return [...localImportGraph(entry, srcRoot)].flatMap(environmentBranchesIn);
}

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTestFiles(full));
    else if (/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function usesNodeEnvironment(file: string): boolean {
  return fs.readFileSync(file, 'utf8').startsWith(NODE_DOCBLOCK);
}

const allTestFiles = listTestFiles(TESTS_ROOT);
const nodeEnvironmentFiles = allTestFiles.filter(usesNodeEnvironment);
const relative = (file: string) => path.relative(FRONTEND_ROOT, file);

describe('AF100-09a — node-environment unit tests are genuinely DOM-free', () => {
  it('the opt-in is actually in use', () => {
    expect(
      nodeEnvironmentFiles.length,
      'No file opts into the node environment — the harness saving is gone.',
    ).toBeGreaterThanOrEqual(80);
  });

  it('the docblock is the first line, where Vitest reads it', () => {
    for (const file of nodeEnvironmentFiles) {
      const firstLine = fs.readFileSync(file, 'utf8').split('\n')[0];
      expect(firstLine, `${relative(file)}: docblock must be line 1`).toBe(NODE_DOCBLOCK);
    }
  });

  it('no node-environment file reaches code that branches on the environment', () => {
    const offenders = nodeEnvironmentFiles
      .map((file) => ({ file, branches: environmentBranchesReachableFrom(file, SRC_ROOT) }))
      .filter((entry) => entry.branches.length > 0);

    const report = offenders
      .map(({ file, branches }) => {
        const shown = branches
          .slice(0, 3)
          .map((b) => `      ${relative(b.file)}:${b.line}  ${b.code}`)
          .join('\n');
        return `  ${relative(file)}\n${shown}`;
      })
      .join('\n');

    expect(
      offenders.map(({ file }) => relative(file)),
      `These files run under \`node\` but reach environment-dependent code, so they\n`
        + `silently take a different branch than production:\n${report}\n`
        + `Fix: drop the \`${NODE_DOCBLOCK}\` line so the file runs under jsdom.`,
    ).toEqual([]);
  });

  it('no node-environment file pulls in DOM testing libraries', () => {
    const offenders = nodeEnvironmentFiles.filter((file) => {
      const code = fs.readFileSync(file, 'utf8');
      return /@testing-library\/(react|jest-dom|user-event)/.test(code);
    });

    expect(
      offenders.map(relative),
      'DOM testing libraries need jsdom; these files must not opt into `node`.',
    ).toEqual([]);
  });

  it('detects an environment branch reachable through the import graph (failure path)', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(FRONTEND_ROOT, 'node_modules', '.af100-09a-'));
    try {
      // A DOM-free-looking test that transitively reaches a `typeof window` branch,
      // exactly the shape `src/api/client.ts` has.
      fs.writeFileSync(
        path.join(fixtureRoot, 'apiClient.ts'),
        'export const baseUrl = typeof window !== "undefined" ? window.origin : "http://ssr";\n',
      );
      fs.writeFileSync(
        path.join(fixtureRoot, 'model.ts'),
        "import { baseUrl } from './apiClient';\nexport const url = () => baseUrl;\n",
      );
      const entry = path.join(fixtureRoot, 'broken.test.ts');
      fs.writeFileSync(
        entry,
        `${NODE_DOCBLOCK}\nimport { url } from './model';\nexport default url;\n`,
      );

      const branches = environmentBranchesReachableFrom(entry, fixtureRoot);

      expect(branches.length, 'guard must reach the branch two hops away').toBeGreaterThan(0);
      expect(branches[0].code).toContain('typeof window');
      expect(path.basename(branches[0].file)).toBe('apiClient.ts');
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('accepts a genuinely DOM-free graph (success path)', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(FRONTEND_ROOT, 'node_modules', '.af100-09a-'));
    try {
      fs.writeFileSync(path.join(fixtureRoot, 'pure.ts'), 'export const add = (a: number, b: number) => a + b;\n');
      const entry = path.join(fixtureRoot, 'clean.test.ts');
      fs.writeFileSync(entry, `${NODE_DOCBLOCK}\nimport { add } from './pure';\nexport default add;\n`);

      expect(environmentBranchesReachableFrom(entry, fixtureRoot)).toEqual([]);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
