/**
 * G4 CSS ratchet — walk/scan/measure/media/validate pure helpers.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  CANONICAL_MAX_WIDTHS,
  LEGACY_PALETTE_RE,
  MAX_WIDTH_RE,
  RAW_COLOR_RE,
  SKIP_DIRS,
  SRC_ROOT,
  failMessage,
  type FileMetrics,
  type ResponsiveContract,
} from './cssArchitectureRatchet.constants';

export function walkCssFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkCssFiles(full));
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

export function walkTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

export function relSrcKey(abs: string): string {
  return `src/${path.relative(SRC_ROOT, abs).split(path.sep).join('/')}`;
}

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function countLoc(source: string): number {
  return source.length === 0 ? 0 : source.split(/\r?\n/).length;
}

/** Extract top-level + nested @media/@supports selector lists. */
export function extractSelectors(css: string): string[] {
  const text = stripComments(css);
  const rules: string[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    while (i < n && /\s/.test(text[i]!)) i += 1;
    if (i >= n) break;

    if (text.startsWith('@', i)) {
      const brace = text.indexOf('{', i);
      if (brace < 0) break;
      let depth = 0;
      let j = brace;
      for (; j < n; j += 1) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
      }
      const at = text.slice(i, brace).trim();
      const body = text.slice(brace + 1, j - 1);
      if (/^@media\b/.test(at) || /^@supports\b/.test(at)) {
        rules.push(...extractSelectors(body));
      }
      i = j;
      continue;
    }

    const brace = text.indexOf('{', i);
    if (brace < 0) break;
    const sel = text.slice(i, brace).trim();
    let depth = 0;
    let j = brace;
    for (; j < n; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    if (sel) rules.push(sel);
    i = j;
  }
  return rules;
}

/** Selector compound that starts with `.ant-` (no project owner prefix). */
export function countBareAntSelectors(selectors: string[]): number {
  let n = 0;
  for (const sel of selectors) {
    for (const part of sel.split(',')) {
      const segs = part
        .trim()
        .split(/[\s>+~]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (segs[0] && /^\.ant-/.test(segs[0])) n += 1;
    }
  }
  return n;
}

export function measureCssFile(source: string): FileMetrics {
  const cleaned = stripComments(source);
  return {
    loc: countLoc(source),
    bareAnt: countBareAntSelectors(extractSelectors(source)),
    media: (cleaned.match(/@media\b/g) ?? []).length,
  };
}

/** Count raw color literals outside comments. */
export function countRawColors(source: string): number {
  const cleaned = stripComments(source);
  return (cleaned.match(RAW_COLOR_RE) ?? []).length;
}

/** Count direct `--c-*` / `--a-*` palette var refs outside comments. */
export function countLegacyPaletteRefs(source: string): number {
  const cleaned = stripComments(source);
  return (cleaned.match(LEGACY_PALETTE_RE) ?? []).length;
}

/**
 * Count non-canonical max-width media queries.
 * Ignores print and prefers-reduced-motion blocks.
 */
export function countNoncanonicalMedia(source: string): number {
  const cleaned = stripComments(source);
  let count = 0;
  const mediaRe = /@media\b([^{]*)\{/gi;
  let m: RegExpExecArray | null;
  while ((m = mediaRe.exec(cleaned)) !== null) {
    const query = m[1] ?? '';
    if (/\bprint\b/i.test(query)) continue;
    if (/prefers-reduced-motion/i.test(query)) continue;
    MAX_WIDTH_RE.lastIndex = 0;
    let mw: RegExpExecArray | null;
    while ((mw = MAX_WIDTH_RE.exec(query)) !== null) {
      const px = Number(mw[1]);
      if (!CANONICAL_MAX_WIDTHS.has(px)) count += 1;
    }
  }
  return count;
}

/** Normalize @media query text for contract matching. */
export function normalizeMediaCondition(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLowerCase();
}

export type MediaBlock = {
  condition: string;
  body: string;
  selectors: string[];
};

/**
 * Top-level @media blocks with brace-matched bodies (no nested @media split).
 */
export function extractMediaBlocks(source: string): MediaBlock[] {
  const text = stripComments(source);
  const blocks: MediaBlock[] = [];
  let i = 0;
  while (i < text.length) {
    const j = text.indexOf('@media', i);
    if (j < 0) break;
    const brace = text.indexOf('{', j);
    if (brace < 0) break;
    const condition = normalizeMediaCondition(text.slice(j + '@media'.length, brace));
    let depth = 0;
    let k = brace;
    for (; k < text.length; k += 1) {
      const ch = text[k];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          k += 1;
          break;
        }
      }
    }
    const body = text.slice(brace + 1, k - 1);
    blocks.push({
      condition,
      body,
      selectors: extractSelectors(body),
    });
    i = k;
  }
  return blocks;
}

/** Collect unique max-width px values under src/ (excludes print / reduced-motion-only). */
export function collectMediaConditionMaxWidths(): number[] {
  const set = new Set<number>();
  for (const abs of walkCssFiles(SRC_ROOT)) {
    const cleaned = stripComments(fs.readFileSync(abs, 'utf8'));
    const mediaRe = /@media\b([^{]*)\{/gi;
    let m: RegExpExecArray | null;
    while ((m = mediaRe.exec(cleaned)) !== null) {
      const query = m[1] ?? '';
      if (/\bprint\b/i.test(query)) continue;
      if (/prefers-reduced-motion/i.test(query) && !/max-width/i.test(query)) continue;
      MAX_WIDTH_RE.lastIndex = 0;
      let mw: RegExpExecArray | null;
      while ((mw = MAX_WIDTH_RE.exec(query)) !== null) {
        set.add(Number(mw[1]));
      }
    }
  }
  return [...set].sort((a, b) => a - b);
}

/** True if a selector compound is under one of the owner root prefixes. */
export function selectorMatchesOwnerRoots(selector: string, ownerRoots: string[]): boolean {
  for (const part of selector.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const head = trimmed.split(/[\s>+~]/)[0]?.trim() ?? '';
    const ok = ownerRoots.some((root) => {
      if (root.endsWith('-')) {
        return head.startsWith(root) || head.includes(root);
      }
      // exact class or descendant starting with that class
      return (
        head === root ||
        head.startsWith(`${root}.`) ||
        head.startsWith(`${root}:`) ||
        head.startsWith(`${root}[`) ||
        trimmed.includes(root)
      );
    });
    if (!ok) return false;
  }
  return true;
}

/**
 * Validate responsiveContracts entries against file contents.
 * Returns violation messages (empty if OK).
 */
export function validateResponsiveContracts(
  contracts: Record<string, ResponsiveContract>,
  readFile: (rel: string) => string,
): string[] {
  const violations: string[] = [];
  for (const [file, contract] of Object.entries(contracts)) {
    let source: string;
    try {
      source = readFile(file);
    } catch {
      violations.push(
        failMessage(
          'RESPONSIVE_CONTRACT_FILE_MISSING',
          'responsiveContracts file missing on disk',
          'Add the owner CSS file or remove the contract entry.',
          file,
        ),
      );
      continue;
    }
    const blocks = extractMediaBlocks(source);
    const allowed = new Set(
      contract.conditions.map((c) => normalizeMediaCondition(c.replace(/^@media\s*/i, ''))),
    );
    const seen = new Map<string, number>();
    for (const block of blocks) {
      // Prefer max-width contracts; reduced-motion optional without listing
      if (/prefers-reduced-motion/i.test(block.condition)) continue;
      if (/\bprint\b/i.test(block.condition)) continue;
      const cond = block.condition;
      seen.set(cond, (seen.get(cond) ?? 0) + 1);
      if (seen.get(cond)! > 1) {
        violations.push(
          failMessage(
            'RESPONSIVE_DUPLICATE_MEDIA',
            `Duplicate @media condition in owner file: ${cond}`,
            'Keep at most one block per media condition per owner file.',
            file,
            cond,
          ),
        );
      }
      // If contract lists specific conditions, non-listed max-width is a new breakpoint for this owner
      if (allowed.size > 0) {
        const listed = [...allowed].some(
          (a) => cond.includes(a) || a.includes(cond) || cond === a,
        );
        if (!listed && /max-width/i.test(cond)) {
          violations.push(
            failMessage(
              'RESPONSIVE_UNLISTED_CONDITION',
              `Media condition not in responsiveContracts.conditions: ${cond}`,
              'Add an exact baseline contract update or remove the media block.',
              file,
              cond,
            ),
          );
        }
      }
      for (const sel of block.selectors) {
        if (!selectorMatchesOwnerRoots(sel, contract.ownerRoots)) {
          violations.push(
            failMessage(
              'RESPONSIVE_FOREIGN_SELECTOR',
              `Selector in contracted media block is outside ownerRoots`,
              'Move selector to its CSS owner or fix ownerRoots.',
              file,
              sel.slice(0, 120),
            ),
          );
        }
      }
    }
  }
  return violations;
}

