/**
 * G4 CSS ratchet — collect current metrics, baseline load, importer map.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  BASELINE_PATH,
  FRONTEND_ROOT,
  LEGACY_PALETTE_ALLOWLIST,
  SRC_ROOT,
  type Baseline,
  type FileMetrics,
  failMessage,
} from './cssArchitectureRatchet.constants';
import {
  countLegacyPaletteRefs,
  countNoncanonicalMedia,
  countRawColors,
  measureCssFile,
  relSrcKey,
  walkCssFiles,
  walkTsFiles,
} from './cssArchitectureRatchet.parse';

export function collectRawColorCounts(): { total: number; files: Record<string, number> } {
  const files: Record<string, number> = {};
  let total = 0;
  for (const abs of walkCssFiles(SRC_ROOT)) {
    const key = relSrcKey(abs);
    const n = countRawColors(fs.readFileSync(abs, 'utf8'));
    if (n > 0) {
      files[key] = n;
      total += n;
    }
  }
  return { total, files };
}

export function collectLegacyPaletteCounts(): { total: number; files: Record<string, number> } {
  const files: Record<string, number> = {};
  let total = 0;
  for (const abs of walkCssFiles(SRC_ROOT)) {
    const key = relSrcKey(abs);
    if (LEGACY_PALETTE_ALLOWLIST.has(key)) continue;
    const n = countLegacyPaletteRefs(fs.readFileSync(abs, 'utf8'));
    if (n > 0) {
      files[key] = n;
      total += n;
    }
  }
  return { total, files };
}

export function collectNoncanonicalMediaCounts(): { total: number; files: Record<string, number> } {
  const files: Record<string, number> = {};
  let total = 0;
  for (const abs of walkCssFiles(SRC_ROOT)) {
    const key = relSrcKey(abs);
    const n = countNoncanonicalMedia(fs.readFileSync(abs, 'utf8'));
    if (n > 0) {
      files[key] = n;
      total += n;
    }
  }
  return { total, files };
}

export function ratchetCountMap(
  label: string,
  codePrefix: string,
  current: { total: number; files: Record<string, number> },
  baselineFiles: Record<string, number>,
  baselineTotal: number,
  growthFix: string,
  newFileFix: string,
  allowNewFile?: (file: string) => boolean,
): string[] {
  const violations: string[] = [];
  if (current.total > baselineTotal) {
    violations.push(
      failMessage(
        `${codePrefix}_TOTAL_GREW`,
        `Total ${label} grew`,
        growthFix,
        undefined,
        `CURRENT=${current.total} LIMIT=${baselineTotal}`,
      ),
    );
  }
  for (const [file, limit] of Object.entries(baselineFiles)) {
    const cur = current.files[file] ?? 0;
    if (cur > limit) {
      violations.push(
        failMessage(
          `${codePrefix}_FILE_GREW`,
          `${label} count grew in file`,
          growthFix,
          file,
          `CURRENT=${cur} LIMIT=${limit}`,
        ),
      );
    }
  }
  for (const [file, cur] of Object.entries(current.files)) {
    if (file in baselineFiles) continue;
    if (allowNewFile?.(file)) continue;
    if (cur > 0) {
      violations.push(
        failMessage(
          `${codePrefix}_NEW_FILE`,
          `New CSS file introduces ${label}`,
          newFileFix,
          file,
          `${label}=${cur}`,
        ),
      );
    }
  }
  // Stale baseline entries (file cleaned or deleted) must shrink baseline.
  for (const [file, limit] of Object.entries(baselineFiles)) {
    const cur = current.files[file] ?? 0;
    if (cur < limit && cur === 0 && !(file in current.files)) {
      violations.push(
        failMessage(
          `${codePrefix}_STALE_BASELINE`,
          `Baseline still tracks ${label} for a clean file`,
          'Update baseline to current counts in the same PR as the shrink.',
          file,
          `CURRENT=0 LIMIT=${limit}`,
        ),
      );
    } else if (cur < limit) {
      violations.push(
        failMessage(
          `${codePrefix}_STALE_BASELINE`,
          `Baseline ${label} is higher than current (historical slack)`,
          'Update baseline to current counts in the same PR as the shrink.',
          file,
          `CURRENT=${cur} LIMIT=${limit}`,
        ),
      );
    }
  }
  if (current.total < baselineTotal) {
    // total stale is implied by per-file stale; only flag if no per-file stale already
    // Keep simple: always require total match when files match.
  }
  return violations;
}

export function readMainCssImportOrder(): string[] {
  const mainPath = path.join(SRC_ROOT, 'main.tsx');
  const text = fs.readFileSync(mainPath, 'utf8');
  const re = /import\s+['"](\.\/styles[^'"]+\.css|\.\/styles\.css)['"]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

export function loadBaseline(): Baseline {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(
      failMessage(
        'BASELINE_MISSING',
        `Baseline missing: ${path.relative(FRONTEND_ROOT, BASELINE_PATH)}`,
        'Restore cssArchitectureBaseline.json from git or regenerate on clean green HEAD.',
      ),
    );
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
}

export function collectCurrent(): Record<string, FileMetrics> {
  const out: Record<string, FileMetrics> = {};
  for (const abs of walkCssFiles(SRC_ROOT)) {
    out[relSrcKey(abs)] = measureCssFile(fs.readFileSync(abs, 'utf8'));
  }
  return out;
}

export function sumMetrics(files: Record<string, FileMetrics>): FileMetrics {
  const t: FileMetrics = { loc: 0, bareAnt: 0, media: 0 };
  for (const m of Object.values(files)) {
    t.loc += m.loc;
    t.bareAnt += m.bareAnt;
    t.media += m.media;
  }
  return t;
}

/** Resolve whether a CSS path is imported from production TS/TSX. */
export function collectCssImporters(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const re = /import\s+['"]([^'"]+\.css)['"]/g;
  for (const abs of walkTsFiles(SRC_ROOT)) {
    const text = fs.readFileSync(abs, 'utf8');
    let m: RegExpExecArray | null;
    // reset lastIndex
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const spec = m[1]!;
      if (spec.startsWith('@glideapps/') || !spec.endsWith('.css')) continue;
      let resolved: string | null = null;
      if (spec.startsWith('@/')) {
        resolved = path.join(SRC_ROOT, spec.slice(2));
      } else if (spec.startsWith('.')) {
        resolved = path.resolve(path.dirname(abs), spec);
      }
      if (!resolved || !fs.existsSync(resolved)) continue;
      const key = relSrcKey(resolved);
      const list = map.get(key) ?? [];
      list.push(relSrcKey(abs));
      map.set(key, list);
    }
  }
  return map;
}

