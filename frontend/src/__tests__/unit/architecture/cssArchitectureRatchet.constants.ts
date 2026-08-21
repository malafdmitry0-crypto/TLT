/**
 * G4 CSS ratchet — paths, constants, types, failMessage.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SRC_ROOT = path.resolve(HERE, '../../..');
export const FRONTEND_ROOT = path.resolve(HERE, '../../../..');
export const BASELINE_PATH = path.join(HERE, 'cssArchitectureBaseline.json');

/**
 * Global CSS entries: loaded from main.tsx OR freeze-pointer stubs.
 * tlt-form-controls.css is intentionally NOT global — form-controls/ui-kit owner.
 */
export const GLOBAL_CSS_ENTRIES = new Set([
  'src/styles.css',
  'src/styles/app-base.css', // freeze pointer (layers live in tokens/base/app-shell/vendor)
  'src/styles/tokens.css',
  'src/styles/base.css',
  'src/styles/app-shell.css',
  'src/styles/vendor-overrides.css',
  'src/styles/calc-spreadsheet.css',
  'src/styles/calc-spreadsheet-base.css', // pulled via @import from calc-spreadsheet.css
  'src/styles/calc-spreadsheet-excel.css', // pulled via @import from calc-spreadsheet.css
  'src/styles/actionbar-srs.css',
  'src/styles/app-header.css',
  'src/styles/table-chrome.css',
  'src/styles/form-grid-srs.css',
  'src/styles/print.css',
]);

/**
 * Strict global CSS import order in main.tsx (architecture contract).
 * Contiguous .css imports must match this sequence (no extras, no reorder).
 */
export const GLOBAL_CSS_IMPORT_ORDER = [
  './styles/tokens.css',
  './styles/base.css',
  './styles/app-shell.css', // includes former app-header chrome
  './styles/vendor-overrides.css',
  './styles.css',
  './styles/calc-spreadsheet.css',
  './styles/actionbar-srs.css',
  './styles/table-chrome.css',
  './styles/form-grid-srs.css',
  './styles/print.css',
] as const;

/** CSS files allowed to introduce/define raw hex/rgb colors (token SoT). */
export const RAW_COLOR_ALLOWLIST = new Set([
  'src/styles/tokens.css',
]);

export const RAW_COLOR_RE = /#(?:[0-9a-fA-F]{3,8})\b|\brgba?\(|\bhsla?\(/g;

/**
 * Feature owner roots: CSS under these paths must not use foreign feature markers.
 * Marker = class token that belongs to another feature.
 */
export const FEATURE_OWNERS: Array<{
  pathPrefix: string;
  ownMarkers: string[];
  foreignMarkers: string[];
}> = [
  {
    pathPrefix: 'src/pages/heatcalc/',
    ownMarkers: ['heatcalc', 'inline-object-form', 'form-grid-srs--heat', 'heat-'],
    foreignMarkers: [
      'elec-workspace',
      'electrical-',
      'specification-page',
      'spec-page',
    ],
  },
  {
    pathPrefix: 'src/pages/electrical/',
    ownMarkers: ['elec-', 'electrical-'],
    foreignMarkers: [
      'heatcalc-workspace',
      'inline-object-form',
      'form-grid-srs--heat',
      'specification-page',
    ],
  },
  {
    pathPrefix: 'src/pages/specification/',
    ownMarkers: ['specification-', 'spec-'],
    foreignMarkers: [
      'heatcalc-workspace',
      'elec-workspace',
      'inline-object-form',
      'form-grid-srs--heat',
    ],
  },
];

export type FileMetrics = {
  loc: number;
  bareAnt: number;
  media: number;
};

export type ResponsiveContract = {
  /** Normalized media conditions allowed in this file, e.g. "max-width: 1200px". */
  conditions: string[];
  /** Class-root prefixes; every non-empty selector compound in a contracted media block must match one. */
  ownerRoots: string[];
};

export type Baseline = {
  version: number;
  stylesCssMaxLoc: number;
  newFileLocCap: number;
  files: Record<string, FileMetrics>;
  totals: FileMetrics;
  /** Per-file raw color literal counts (hex/rgb/hsl); decrease always OK. */
  rawColors?: Record<string, number>;
  rawColorsTotal?: number;
  /**
   * Direct legacy palette var refs (`--c-*` / `--a-*`) outside tokens.css.
   * Shrink-only; new files must not introduce these refs.
   */
  legacyPalette?: Record<string, number>;
  legacyPaletteTotal?: number;
  /**
   * Non-canonical `@media (max-width: Npx)` breakpoints.
   * Canonical allowlist: 480 / 768 / 1200 / 1400 (+ print, prefers-reduced-motion).
   */
  noncanonicalMedia?: Record<string, number>;
  noncanonicalMediaTotal?: number;
  /**
   * AF12-CSS-MEDIA-CONTRACT-01: shrink-only set of max-width breakpoints (px)
   * present anywhere under src/. Raw @media block counts are observational.
   */
  mediaConditionMaxWidths?: number[];
  /**
   * Optional per-file responsive ownership contracts (UI Kit owners, etc.).
   * When present: at most one block per condition; selectors must match ownerRoots.
   */
  responsiveContracts?: Record<string, ResponsiveContract>;
};

/** Token owner: legacy palette aliases may live only here. */
export const LEGACY_PALETTE_ALLOWLIST = new Set(['src/styles/tokens.css']);

/** Canonical max-width breakpoints (px). */
export const CANONICAL_MAX_WIDTHS = new Set([480, 768, 1200, 1400]);

export const LEGACY_PALETTE_RE = /--[ca]-[a-zA-Z0-9_-]+/g;
export const MAX_WIDTH_RE = /max-width:\s*(\d+)px/gi;

export const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

export function failMessage(
  code: string,
  message: string,
  fix: string,
  file?: string,
  metric?: string,
): string {
  const parts = [`[CssArchitectureRatchetError:${code}] ${message}`];
  if (file) parts.push(`FILE: ${file}`);
  if (metric) parts.push(`METRIC: ${metric}`);
  parts.push(`FIX: ${fix}`);
  return parts.join('\n');
}

