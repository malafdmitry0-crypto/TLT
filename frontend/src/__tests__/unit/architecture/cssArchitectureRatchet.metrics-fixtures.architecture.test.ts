import { describe, expect, it } from 'vitest';
import {
  countLegacyPaletteRefs,
  countNoncanonicalMedia,
  countRawColors,
  measureCssFile,
} from './cssArchitectureRatchet.helpers';

describe('CSS architecture ratchet (G4) — metrics-fixtures', () => {
  it('measures bare .ant- and media via shared helpers', () => {
    const sample = `
/* comment .ant-btn */
.owner .ant-btn { color: red; }
.ant-modal { display: none; }
@media (max-width: 600px) {
  .owner .ant-input { width: 100%; }
}
`;
    const m = measureCssFile(sample);
    expect(m.bareAnt).toBe(1); // only .ant-modal
    expect(m.media).toBe(1);
    expect(m.loc).toBeGreaterThan(5);
  });
  it('counts raw colors ignoring comments', () => {
    expect(countRawColors('/* #fff */ .x { color: #1a5276; }')).toBe(1);
    expect(countRawColors('.x { color: var(--color-primary); }')).toBe(0);
  });
  it('counts legacy palette refs and noncanonical max-width media', () => {
    const sample = `
/* --c-old */
.x { color: var(--c-primary); border-color: var(--a-accent); }
@media (max-width: 900px) { .x { display: none; } }
@media (max-width: 768px) { .x { display: block; } }
@media print { .x { color: black; } }
@media (prefers-reduced-motion: reduce) { .x { animation: none; } }
`;
    expect(countLegacyPaletteRefs(sample)).toBe(2);
    expect(countNoncanonicalMedia(sample)).toBe(1); // only 900
    expect(countLegacyPaletteRefs('/* --c-x */ .ok { color: var(--color-text); }')).toBe(0);
  });
  it('fails growth when a new file adds legacy palette or noncanonical media (fixtures)', () => {
    // Fixture-style pure functions prove new-file growth is detectable.
    expect(countLegacyPaletteRefs('.new { color: var(--c-danger); }')).toBeGreaterThan(0);
    expect(countNoncanonicalMedia('@media (max-width: 640px) { .x{} }')).toBe(1);
    expect(countNoncanonicalMedia('@media (max-width: 480px) { .x{} }')).toBe(0);
  });
});
