// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { formatSpecTimestamp } from '@/pages/specification/specFormatModel';

describe('formatSpecTimestamp', () => {
  it('returns null for empty/invalid', () => {
    expect(formatSpecTimestamp(null)).toBeNull();
    expect(formatSpecTimestamp(undefined)).toBeNull();
    expect(formatSpecTimestamp('not-a-date')).toBeNull();
  });

  it('formats valid ISO for ru-RU locale', () => {
    const formatted = formatSpecTimestamp('2026-07-18T10:30:00Z');
    expect(formatted).toEqual(expect.any(String));
    expect(formatted!.length).toBeGreaterThan(5);
  });
});
