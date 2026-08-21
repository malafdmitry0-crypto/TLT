/** G3 dependency ratchet helpers — extract for LOC. */
/**
 * G3: dependency and cycle ratchet.
 *
 * Rules (production TS/TSX only):
 * 1. LAYER — hooks|utils|domain|types|api|store|config|constants must not import pages/*
 *    (components→pages remains in featureBoundaries; empty allowlist there).
 * 2. CROSS_FEATURE — heat ↔ electrical ↔ specification must not import each other
 *    except edges on the allowlist with shrink notes.
 * 3. FEATURE_PAGES — outsiders must not deep-import pages/{heatcalc|electrical|specification}/*
 *    except allowlisted edges / future public entrypoints.
 * 4. CYCLES — production import graph has no cycles.
 *
 * Decrease (remove allowlisted edge) is always allowed; stale allowlist entries fail.
 * Do not grow allowlists without a shrink note and intentional review.
 *
 * Errors: CODE, FILE, IMPORT, FIX
 * See: docs/frontend/agent-development-standard.md, docs/frontend/archive/README.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// architecture/ → unit → __tests__ → src (SRC_ROOT); one more level → frontend package root
const SRC_ROOT = path.resolve(HERE, '../../..');
const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
const BASELINE_PATH = path.join(HERE, 'dependencyBaseline.json');

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);
export const LAYER_TOPS = new Set([
  'hooks',
  'utils',
  'domain',
  'types',
  'api',
  'store',
  'config',
  'constants',
]);

export type AllowEdge = {
  from: string;
  to: string;
  import: string;
  shrink: string;
};

export type Baseline = {
  version: number;
  layerToPagesAllowlist: AllowEdge[];
  crossFeatureAllowlist: AllowEdge[];
  featurePagesOutsiderAllowlist: AllowEdge[];
};

export type Edge = {
  from: string;
  to: string;
  import: string;
};

export type Feature = 'heat' | 'electrical' | 'specification';

export function failMessage(
  code: string,
  message: string,
  fix: string,
  file: string,
  imp?: string,
): string {
  const parts = [`[DependencyRatchetError:${code}] ${message}`, `FILE: ${file}`];
  if (imp) parts.push(`IMPORT: ${imp}`);
  parts.push(`FIX: ${fix}`);
  return parts.join('\n');
}

export function walkProductionTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkProductionTsFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(entry.name)
      && !entry.name.endsWith('.d.ts')
      && !entry.name.includes('.test.')
      && !entry.name.includes('.spec.')
    ) {
      out.push(full);
    }
  }
  return out;
}

export function relSrcKey(abs: string): string {
  return `src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

export function resolveImport(fromAbs: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) {
    base = path.join(SRC_ROOT, spec.slice(2));
  } else if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(fromAbs), spec);
  } else {
    return null;
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

export function collectImportSpecs(absPath: string): string[] {
  const text = fs.readFileSync(absPath, 'utf8');
  const kind = absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, kind);
  const specs: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specs.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specs;
}

export function collectEdges(): Edge[] {
  const edges: Edge[] = [];
  for (const abs of walkProductionTsFiles(SRC_ROOT)) {
    for (const spec of collectImportSpecs(abs)) {
      const resolved = resolveImport(abs, spec);
      if (!resolved) continue;
      edges.push({
        from: relSrcKey(abs),
        to: relSrcKey(resolved),
        import: spec,
      });
    }
  }
  return edges;
}

export function edgeKey(e: { from: string; to: string }): string {
  return `${e.from}→${e.to}`;
}

export function featureOf(srcKey: string): Feature | null {
  const r = srcKey.replace(/^src\//, '');
  if (
    r === 'pages/HeatCalcPage.tsx'
    || r.startsWith('pages/heatcalc/')
    || r.startsWith('components/heatcalc/')
  ) {
    return 'heat';
  }
  if (
    r === 'pages/ElecCalcPage.tsx'
    || r.startsWith('pages/electrical/')
    || r.startsWith('components/electrical/')
  ) {
    return 'electrical';
  }
  if (
    r === 'pages/SpecificationPage.tsx'
    || r.startsWith('pages/specification/')
    || r.startsWith('components/specification/')
  ) {
    return 'specification';
  }
  return null;
}

/** Feature owning a pages/* deep module (null if not a feature page tree). */
export function featurePagesOwner(srcKey: string): Feature | null {
  const r = srcKey.replace(/^src\//, '');
  if (r.startsWith('pages/heatcalc/')) return 'heat';
  if (r.startsWith('pages/electrical/')) return 'electrical';
  if (r.startsWith('pages/specification/')) return 'specification';
  return null;
}

export function loadBaseline(): Baseline {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      failMessage(
        'BASELINE_MISSING',
        `Baseline missing: ${path.relative(FRONTEND_ROOT, BASELINE_PATH)}`,
        'Restore dependencyBaseline.json from git or regenerate on a clean green HEAD.',
        path.relative(FRONTEND_ROOT, BASELINE_PATH),
      ),
    );
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
}

export function assertAllowlistUsed(
  label: string,
  allowlist: AllowEdge[],
  foundKeys: Set<string>,
  violations: string[],
): void {
  for (const edge of allowlist) {
    if (!foundKeys.has(edgeKey(edge))) {
      violations.push(
        failMessage(
          'STALE_ALLOWLIST',
          `Allowlist edge no longer present (${label}) — remove from baseline (shrink success)`,
          `Delete this allowlist entry from dependencyBaseline.json. Shrink note was: ${edge.shrink}`,
          edge.from,
          edge.import,
        ),
      );
    }
  }
}

export function findCycles(edges: Edge[]): string[][] {
  const graph = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!graph.has(e.from)) graph.set(e.from, new Set());
    graph.get(e.from)!.add(e.to);
    if (!graph.has(e.to)) graph.set(e.to, new Set());
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  const dfs = (u: string) => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of graph.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) {
        const i = stack.indexOf(v);
        cycles.push([...stack.slice(i), v]);
      } else if (c === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };

  for (const n of graph.keys()) {
    if ((color.get(n) ?? WHITE) === WHITE) dfs(n);
  }
  return cycles;
}
