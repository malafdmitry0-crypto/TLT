// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatNumber,
  formatPower,
  formatTemperature,
} from '@/utils/formatters';

describe('formatNumber', () => {
  it('formats with default precision', () => {
    expect(formatNumber(1.2345)).toContain('1,23');
  });
  it('returns em dash for nullish', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });
});

describe('formatPower', () => {
  it('uses Вт for small values', () => {
    expect(formatPower(500)).toContain('Вт');
    expect(formatPower(500)).not.toContain('кВт');
  });
  it('uses кВт for >= 1000', () => {
    expect(formatPower(1500)).toContain('кВт');
  });
  it('returns em dash for null', () => {
    expect(formatPower(null)).toBe('—');
  });
});

describe('formatTemperature', () => {
  it('appends °C', () => {
    expect(formatTemperature(20)).toContain('°C');
  });
});

describe('formatDate', () => {
  it('returns Russian format', () => {
    const d = formatDate('2026-04-10T10:00:00Z');
    expect(d).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });
});
