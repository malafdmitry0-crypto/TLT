// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  bomSectionOf,
  formatPreflightSummary,
  resolveFirstGenerateErId,
  specSectionEmptyTitle,
} from '@/pages/specification/specTableSectionModel';
import type { SpecificationItem } from '@/types/specification';

function item(params: Record<string, unknown>): SpecificationItem {
  return {
    category: 'Кабель',
    name: 'Test',
    article: null,
    unit: 'м',
    quantity: 1,
    params,
  };
}

describe('bomSectionOf', () => {
  it('prefers object_type_section from BE over bom_section and object_type', () => {
    expect(bomSectionOf(item({
      object_type_section: 'pipe',
      bom_section: 'common',
      object_type: 'tank',
    }))).toBe('pipe');
  });

  it('falls back to bom_section then object_type', () => {
    expect(bomSectionOf(item({ bom_section: 'pipe' }))).toBe('pipe');
    expect(bomSectionOf(item({ object_type: 'tank' }))).toBe('tank');
  });

  it('maps russian aliases and defaults to common', () => {
    expect(bomSectionOf(item({ object_type_section: 'трубы' }))).toBe('pipe');
    expect(bomSectionOf(item({ object_type_section: 'бочки' }))).toBe('tank');
    expect(bomSectionOf(item({}))).toBe('common');
  });
});

describe('specSectionEmptyTitle', () => {
  it('does not claim unsupported for ordinary empty sections', () => {
    expect(specSectionEmptyTitle('no_items')).toBe('Нет позиций в этой секции.');
    expect(specSectionEmptyTitle('unsupported')).toMatch(/пока недоступен/i);
  });
});

describe('formatPreflightSummary', () => {
  it('puts human message first and code secondary', () => {
    const text = formatPreflightSummary([
      {
        code: 'UNASSIGNED_CONFIRMATION_REQUIRED',
        kind: 'confirmable',
        message: 'Есть неназначенные объекты. Подтвердите исключение или назначьте их.',
        issues: [],
        details: { unassigned_object_ids: ['a'] },
      },
    ]);
    expect(text).toContain('Есть неназначенные объекты');
    expect(text).toContain('UNASSIGNED_CONFIRMATION_REQUIRED');
    expect(text.indexOf('Есть неназначенные')).toBeLessThan(
      text.indexOf('UNASSIGNED_CONFIRMATION_REQUIRED'),
    );
  });
});

describe('resolveFirstGenerateErId', () => {
  it('picks first generate id or fallback', () => {
    expect(resolveFirstGenerateErId(['er-2', 'er-1'])).toBe('er-2');
    expect(resolveFirstGenerateErId([], 'er-fb')).toBe('er-fb');
    expect(resolveFirstGenerateErId(null, null)).toBeNull();
  });
});
