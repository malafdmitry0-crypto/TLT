/**
 * AF9-TYPE-GATE-01: type-escape debt ratchet.
 *
 * Blocks new production:
 * - `as unknown as`
 * - `as never`
 * - `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`
 * - local `eslint-disable` of `no-explicit-any`
 *
 * Existing occurrences are shrink-only in typeEscapeBaseline.json.
 * Stale baseline entries fail when removed from code.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '../../..');
const BASELINE_PATH = path.join(HERE, 'typeEscapeBaseline.json');
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

type EscapeHit = {
  kind: string;
  line: number;
  text: string;
};

type Baseline = {
  version: number;
  files: Record<string, EscapeHit[]>;
};

function failMessage(
  code: string,
  message: string,
  fix: string,
  file: string,
  detail?: string,
): string {
  const parts = [`[TypeEscapeRatchetError:${code}] ${message}`, `FILE: ${file}`];
  if (detail) parts.push(detail);
  parts.push(`FIX: ${fix}`);
  return parts.join('\n');
}

function walkProductionTsFiles(dir: string): string[] {
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

function relSrcKey(abs: string): string {
  return `src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

function scanEscapes(absPath: string): EscapeHit[] {
  const text = fs.readFileSync(absPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const hits: EscapeHit[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const trimmed = line.trim().slice(0, 120);
    if (line.includes('as unknown as')) {
      hits.push({ kind: 'as_unknown_as', line: i + 1, text: trimmed });
    }
    if (/\bas never\b/.test(line)) {
      hits.push({ kind: 'as_never', line: i + 1, text: trimmed });
    }
    if (
      line.includes('@ts-ignore')
      || line.includes('@ts-expect-error')
      || line.includes('@ts-nocheck')
    ) {
      hits.push({ kind: 'ts_directive', line: i + 1, text: trimmed });
    }
    if (line.includes('eslint-disable') && line.includes('no-explicit-any')) {
      hits.push({ kind: 'no_explicit_any_disable', line: i + 1, text: trimmed });
    }
  }
  return hits;
}

function signature(hit: EscapeHit): string {
  return `${hit.kind}@${hit.line}:${hit.text}`;
}

describe('type-escape ratchet (AF9-TYPE-GATE-01)', () => {
  it('forbids new type-escape debt and drops stale baseline entries', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    const current: Record<string, EscapeHit[]> = {};
    for (const abs of walkProductionTsFiles(SRC_ROOT)) {
      const hits = scanEscapes(abs);
      if (hits.length > 0) {
        current[relSrcKey(abs)] = hits;
      }
    }

    const violations: string[] = [];

    for (const [file, baseHits] of Object.entries(baseline.files)) {
      const curHits = current[file] ?? [];
      const baseSet = new Set(baseHits.map(signature));
      const curSet = new Set(curHits.map(signature));

      for (const hit of curHits) {
        if (!baseSet.has(signature(hit))) {
          violations.push(
            failMessage(
              'NEW_TYPE_ESCAPE',
              `New type escape (${hit.kind}) at line ${hit.line}`,
              'Remove the cast/directive or register a third-party adapter with owner/reason. Do not grow the baseline casually.',
              file,
              `LINE: ${hit.line}\nTEXT: ${hit.text}`,
            ),
          );
        }
      }
      for (const hit of baseHits) {
        if (!curSet.has(signature(hit))) {
          violations.push(
            failMessage(
              'STALE_BASELINE',
              `Baseline lists a type escape that no longer exists (${hit.kind}@${hit.line})`,
              'Remove the entry from typeEscapeBaseline.json in the same PR as the cleanup.',
              file,
              `TEXT: ${hit.text}`,
            ),
          );
        }
      }
    }

    for (const [file, hits] of Object.entries(current)) {
      if (file in baseline.files) continue;
      for (const hit of hits) {
        violations.push(
          failMessage(
            'NEW_TYPE_ESCAPE_FILE',
            `New type-escape debt in a previously clean file (${hit.kind})`,
            'Remove the cast/directive. Adding a baseline entry requires an explicit adapter owner/reason.',
            file,
            `LINE: ${hit.line}\nTEXT: ${hit.text}`,
          ),
        );
      }
    }

    if (violations.length > 0) {
      expect.fail(violations.join('\n\n---\n\n'));
    }
  });
});
